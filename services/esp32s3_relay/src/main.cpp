#include <ArduinoJson.h>
#include <WebServer.h>
#include <WiFi.h>


// ======== WiFi Configuration ========
const char *ssid = "GL-SFT1200-b6e";
const char *password = "goodlife";

// ======== API Security ========
const char *apiKey = "plc-secret-key-123"; // Must match OPi Gateway

// ======== GPIO ========
const int relayPin = 18; // Active LOW relay

// ======== Variables ========
bool relayState = false; // Logic state (true = ON)
unsigned long lastCommandTime = 0;
const unsigned long FAILSAFE_TIMEOUT = 15000; // 15 seconds

WebServer server(80);

// ======== Helper: Apply Relay State ========
void applyRelay() {
  // Relay is Active LOW
  digitalWrite(relayPin, relayState ? LOW : HIGH);
}

// ======== API: POST /relay ========
void handleRelay() {
  if (!server.hasHeader("X-API-Key") || server.header("X-API-Key") != apiKey) {
    server.send(403, "application/json", "{\"error\":\"Unauthorized\"}");
    return;
  }

  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"Method Not Allowed\"}");
    return;
  }

  if (server.hasArg("plain") == false) {
    server.send(400, "application/json", "{\"error\":\"Body missing\"}");
    return;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, server.arg("plain"));
  if (error) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }

  bool reqOn = doc["on"];
  relayState = reqOn;
  lastCommandTime = millis();
  applyRelay();

  server.send(200, "application/json",
              "{\"success\":true, \"relay\":" +
                  String(relayState ? "true" : "false") + "}");
}

// ======== API: GET /status ========
void handleStatus() {
  if (!server.hasHeader("X-API-Key") || server.header("X-API-Key") != apiKey) {
    server.send(403, "application/json", "{\"error\":\"Unauthorized\"}");
    return;
  }

  JsonDocument doc;
  doc["relay"] = relayState;
  doc["uptime_ms"] = millis();
  doc["last_cmd_ms_ago"] = millis() - lastCommandTime;
  doc["failsafe_active"] = (millis() - lastCommandTime > FAILSAFE_TIMEOUT);

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);

  // Treat authorized Status Check as a Heartbeat/Keepalive
  // This allows the OPi to keep the relay ON by simply polling status.
  lastCommandTime = millis();
}

// ======== Setup ========
void setup() {
  Serial.begin(115200);
  pinMode(relayPin, OUTPUT);
  applyRelay(); // Initialize state

  Serial.println("\nBooting...");
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi ");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\n✅ WiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Setup Server
  server.on("/relay", handleRelay);
  server.on("/status", handleStatus);

  // Important: register headers we want to read
  const char *headerkeys[] = {"X-API-Key"};
  size_t headerkeyssize = sizeof(headerkeys) / sizeof(char *);
  server.collectHeaders(headerkeys, headerkeyssize);

  server.begin();
  Serial.println("HTTP Server started");
  lastCommandTime = millis(); // Reset timer on boot
}

// ======== Main Loop ========
void loop() {
  server.handleClient();

  // Failsafe Check
  if (millis() - lastCommandTime > FAILSAFE_TIMEOUT) {
    if (relayState) {
      Serial.println("⚠️ Failsafe triggered: Turning Relay OFF");
      relayState = false;
      applyRelay();
    }
  }

  delay(10);
}
