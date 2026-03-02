#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_task_wdt.h>

// ==========================================
// CONFIGURATION
// ==========================================
const char *SSID = "GL-SFT1200-b6e";
const char *PASSWORD = "goodlife";

// Security: Only the Gateway (OPi4Pro) calling with this key can control us.
const char *GATEWAY_API_KEY = "esp32-secret-key-123";

// Hardware
const int PIN_RELAY = 2; // Relay Control Pin
const int PIN_LED = 3;   // Onboard LED

// Watchdog / stability tuning
const uint32_t WIFI_CHECK_INTERVAL_MS = 10000;  // Check WiFi every 10 s
const uint32_t WIFI_RECONNECT_BACKOFF_MS = 30000; // Wait 30 s before retrying reconnect
const uint32_t HEAP_CHECK_INTERVAL_MS = 30000;  // Check heap every 30 s
const uint32_t HEAP_MIN_FREE_BYTES = 30000;     // Restart if heap drops below 30 KB
const uint32_t HW_WDT_TIMEOUT_S = 30;          // Hardware watchdog bites after 30 s

// ==========================================
// STATE
// ==========================================
WebServer server(80);
bool relayActive = false;

// Watchdog timers (use unsigned 32-bit millis — wraps cleanly at ~49 days)
uint32_t lastWifiCheckMs = 0;
uint32_t lastWifiReconnectMs = 0;
bool wifiReconnecting = false;

uint32_t lastHeapCheckMs = 0;

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

// WIFI WATCHDOG
// ==========================================
void checkWifi() {
  uint32_t now = millis();

  // Only check at the configured interval
  if (now - lastWifiCheckMs < WIFI_CHECK_INTERVAL_MS) return;
  lastWifiCheckMs = now;

  if (WiFi.status() == WL_CONNECTED) {
    // All good — clear reconnect flag
    wifiReconnecting = false;
    return;
  }

  // WiFi is down
  Serial.println("⚠️  WiFi disconnected!");

  if (!wifiReconnecting) {
    // First detection — immediately attempt reconnect
    Serial.printf("🔄 Reconnecting to %s...\n", SSID);
    WiFi.disconnect(false);
    WiFi.begin(SSID, PASSWORD);
    wifiReconnecting = true;
    lastWifiReconnectMs = now;
  } else if (now - lastWifiReconnectMs >= WIFI_RECONNECT_BACKOFF_MS) {
    // Still not connected after back-off — try again
    Serial.printf("🔄 Retry reconnect to %s...\n", SSID);
    WiFi.disconnect(false);
    WiFi.begin(SSID, PASSWORD);
    lastWifiReconnectMs = now;
  }

  // If reconnection succeeded, log the new IP
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("✅ WiFi Reconnected! IP: ");
    Serial.println(WiFi.localIP());
    wifiReconnecting = false;
  }
}

// ==========================================
// HEAP WATCHDOG
// ==========================================
void checkHeap() {
  uint32_t now = millis();
  if (now - lastHeapCheckMs < HEAP_CHECK_INTERVAL_MS) return;
  lastHeapCheckMs = now;

  uint32_t freeHeap = ESP.getFreeHeap();
  Serial.printf("📊 Free Heap: %u bytes | Uptime: %lu s\n",
                freeHeap, now / 1000UL);

  if (freeHeap < HEAP_MIN_FREE_BYTES) {
    Serial.printf("🚨 Heap critical (%u bytes free)! Restarting cleanly...\n",
                  freeHeap);
    // Turn off relay before restart for safety
    setRelay(false);
    delay(200);
    ESP.restart();
  }
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
  if (!checkAuth()) {
    server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
    return;
  }

  JsonDocument doc;
  doc["relay"] = relayActive;
  doc["uptime"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["wifi_rssi"] = WiFi.RSSI();

  String resp;
  serializeJson(doc, resp);
  server.send(200, "application/json", resp);

  // Non-blocking LED blink: just toggle once — no delay()
  digitalWrite(PIN_LED, !digitalRead(PIN_LED));
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

  // Hardware Watchdog — reboots the ESP32 if loop() freezes for >30 s
  esp_task_wdt_config_t wdt_cfg = {
    .timeout_ms = HW_WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_reconfigure(&wdt_cfg);
  esp_task_wdt_add(NULL); // Subscribe the current (loop) task

  Serial.println("\n\n--- ESP32 Relay Node ---");
  Serial.printf("Connecting to %s...", SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);   // Let the WiFi stack try on its own first
  WiFi.persistent(false);        // Don't store credentials to flash every boot
  WiFi.begin(SSID, PASSWORD);

  uint32_t wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (millis() - wifiStart > 30000) {
      Serial.println("\n❌ WiFi timeout at boot — restarting...");
      ESP.restart();
    }
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

  // Initialise watchdog timestamps
  lastWifiCheckMs = millis();
  lastHeapCheckMs = millis();
}

void loop() {
  // Strobe the hardware watchdog — proves loop() is alive
  esp_task_wdt_reset();

  server.handleClient();

  // WiFi health watchdog
  checkWifi();

  // Heap / memory watchdog
  checkHeap();
}
