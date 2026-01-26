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
const int PIN_RELAY = 2; // Relay Control Pin
const int PIN_LED = 3;   // Onboard LED (usually 2 on generic ESP32)

// ==========================================
// STATE
// ==========================================
WebServer server(80);
bool relayActive = false;

// ==========================================
// HELPERS
// ==========================================
void setRelay(bool state) {
  relayActive = state;
  // NPN Transistor Logic: Active HIGH
  // HIGH -> Transistor ON -> Collector LOW -> SSR ON
  digitalWrite(PIN_RELAY, relayActive ? HIGH : LOW);

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

  JsonDocument doc;
  doc["relay"] = relayActive;
  doc["uptime"] = millis();

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
  digitalWrite(PIN_RELAY, LOW); // Ensure OFF at boot
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

  // Failsafe removed as per user request
  //  if (relayActive && (millis() - lastCommandTime > FAILSAFE_MS)) {
  //    Serial.println("❌ Failsafe Timeout! Turning Relay OFF.");
  //    setRelay(false);
  //  }
}
