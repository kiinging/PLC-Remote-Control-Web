#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// ======== WiFi Configuration ========
const char* ssid = "GL-SFT1200-b6e";
const char* password = "goodlife";

// ======== Worker Configuration ========
const char* workerHost = "cloud-worker.wongkiinging.workers.dev";
const int httpsPort = 443;

// ======== GPIO ========
const int relayPin = 18; // Active LOW relay

// ======== Variables ========
bool relayState = false;       // Actual relay output
bool lastPollFalse = false;    // Track last poll result
unsigned long lastPrintTime = 0;
unsigned long lastPollTime = 0;

// ======== Setup ========
void setup() {
  Serial.begin(115200);
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, HIGH); // Relay off (Active LOW)

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
}

// ======== Fetch Relay Command from Cloud ========
bool fetchRelayCommand(bool &outRelay) {
  WiFiClientSecure client;
  client.setInsecure();

  if (!client.connect(workerHost, httpsPort)) {
    Serial.println("⚠️ Connection failed");
    return false;
  }

  client.println("GET /relay HTTP/1.1");
  client.println("Host: " + String(workerHost));
  client.println("Connection: close");
  client.println();

  // Skip headers
  while (client.connected()) {
    String line = client.readStringUntil('\n');
    if (line == "\r") break;
  }

  String response = client.readString();
  client.stop();

  JsonDocument doc;
  if (deserializeJson(doc, response)) {
    Serial.println("❌ JSON parse error");
    return false;
  }

  outRelay = doc["relay"];
  return true;
}

// ======== Main Loop ========
void loop() {
  unsigned long now = millis();

  // Print relay state every 1s
  if (now - lastPrintTime >= 1000) {
    Serial.print("Relay state: ");
    Serial.println(relayState ? "ON (LOW)" : "OFF (HIGH)");
    lastPrintTime = now;
  }

  // Poll Cloud every 2s
  if (WiFi.status() == WL_CONNECTED && now - lastPollTime >= 2000) {
    bool cloudRelay;
    if (fetchRelayCommand(cloudRelay)) {
      if (!cloudRelay) {
        // second consecutive false → turn OFF
        if (lastPollFalse) {
          relayState = false;
        } else {
          lastPollFalse = true;
        }
      } else {
        // any true → stay ON
        relayState = true;
        lastPollFalse = false;
      }

      // Apply state to GPIO
      digitalWrite(relayPin, relayState ? LOW : HIGH);
    }
    lastPollTime = now;
  } else if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi disconnected, retrying...");
    WiFi.reconnect();
  }

  delay(50);
}
