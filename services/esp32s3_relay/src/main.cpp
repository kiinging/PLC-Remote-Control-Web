#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <WiFi.h>


// ==========================================
// CONFIGURATION
// ==========================================
const char *SSID = "GL-SFT1200-b6e";
const char *PASSWORD = "goodlife";

// Security: Only the Gateway (OPi4Pro) calling with this key can control us.
const char *GATEWAY_API_KEY = "esp32-secret-key-123";

// Hardware
const int PIN_RELAY = 18; // Relay Control Pin
const int PIN_LED = 2;    // Onboard LED (usually 2 on generic ESP32)

// Safety
const unsigned long FAILSAFE_MS = 15000; // Turn off if no command for 15s

// ==========================================
// STATE
// ==========================================
WebServer server(80);
bool relayActive = false;
unsigned long lastCommandTime = 0;

// ==========================================
// HELPERS
// ==========================================
void setRelay(bool state) {
  relayActive = state;
  // Relay is often Active LOW. Adjust if your hardware is Active HIGH.
  // Assuming Active LOW here based on previous code:
  digitalWrite(PIN_RELAY, relayActive ? LOW : HIGH);

  // Feedback LED: ON when Relay is ON
  digitalWrite(PIN_LED, relayActive ? HIGH : LOW);
}

void blinkLed(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    delay(100);
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    delay(100);
  }
  // Restore correct state
  digitalWrite(PIN_LED, relayActive ? HIGH : LOW);
}

bool checkAuth() {
  if (!server.hasHeader("X-API-Key"))
    return false;
  if (server.header("X-API-Key") != GATEWAY_API_KEY)
    return false;
  return true;
}

// ==========================================
// HANDLERS
// ==========================================

// POST /relay
// Body: {"on": true}
void handleRelayControl() {
  if (!checkAuth()) {
    server.send(401, "application/json",
                "{\"error\":\"Unauthorized: Gateway Only\"}");
    return;
  }

  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"Method Not Allowed\"}");
    return;
  }

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"Missing Body\"}");
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if (err) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }

  bool reqState = doc["on"];
  setRelay(reqState);
  lastCommandTime = millis();

  Serial.printf("Gateway Command: Relay %s\n", reqState ? "ON" : "OFF");

  server.send(200, "application/json",
              "{\"success\":true,\"relay\":" + String(relayActive) + "}");
}

// GET /status
void handleStatus() {
  // Even status checks should come from Gateway ideally, but looser security is
  // okay here. We'll enforce it to be strict as requested.
  if (!checkAuth()) {
    server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
    return;
  }

  // A status check resets the failsafe timer (Heartbeat)
  lastCommandTime = millis();

  JsonDocument doc;
  doc["relay"] = relayActive;
  doc["uptime"] = millis();
  doc["failsafe_active"] = false; // We just reset it

  String resp;
  serializeJson(doc, resp);
  server.send(200, "application/json", resp);

  // Blink briefly to show we are alive and being polled
  digitalWrite(PIN_LED, !digitalRead(PIN_LED));
  delay(50);
  digitalWrite(PIN_LED, relayActive ? HIGH : LOW);
}

void handleNotFound() {
  server.send(404, "text/plain", "ESP32 Relay Node. Only Gateway allowed.");
}

// ==========================================
// MAIN
// ==========================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  setRelay(false); // Start OFF

  Serial.println("\n\n--- ESP32 Relay Node ---");
  Serial.printf("Connecting to %s...", SSID);

  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Define Routes
  server.on("/relay", handleRelayControl);
  server.on("/status", handleStatus);
  server.onNotFound(handleNotFound);

  // Headers
  const char *headerkeys[] = {"X-API-Key"};
  server.collectHeaders(headerkeys, 1);

  server.begin();
  Serial.println("HTTP Server running.");
}

void loop() {
  server.handleClient();

  // Failsafe: Turn off if Gateway disappears
  if (relayActive && (millis() - lastCommandTime > FAILSAFE_MS)) {
    Serial.println("❌ Failsafe Timeout! Turning Relay OFF.");
    setRelay(false);
  }
}
