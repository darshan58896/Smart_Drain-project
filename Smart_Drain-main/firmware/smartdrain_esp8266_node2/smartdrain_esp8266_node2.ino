/**
 * SmartDrain ESP8266 Firmware — NodeMCU 2 (DRAIN_002)
 * =====================================================
 * Hardware: ESP8266 NodeMCU
 * Sensors on this board:
 *   - US-100 ultrasonic (trigger/echo mode)  → D5 (TRIG), D6 (ECHO)
 *   - Buzzer (local alert)                   → D2
 *
 * NOT present on this board:
 *   - Rain sensor    (connected to NodeMCU 1 / DRAIN_001)
 *   - Flow sensor    (connected to NodeMCU 1 / DRAIN_001)
 *
 * This sketch sends telemetry with device_id = "DRAIN_002".
 * The rain and flow fields are omitted from the payload.
 * The SmartDrain backend risk engine assesses risk on water level
 * and rise rate only for this device.
 *
 * Pin mapping (NodeMCU):
 *   D2 = GPIO4   D5 = GPIO14   D6 = GPIO12
 *
 * Configuration: Edit the CONFIG section below.
 * Do NOT change GPIO assignments without updating physical wiring.
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// ═══════════════════════════════════════════════════════════════════════════
// USER CONFIGURATION — Edit these values
// ═══════════════════════════════════════════════════════════════════════════

// Wi-Fi credentials (same network as NodeMCU 1 and the backend laptop)
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend API — same host/port as NodeMCU 1
const char* BACKEND_HOST  = "192.168.1.100";  // LAN IP of the backend laptop
const int   BACKEND_PORT  = 3001;

// Device ID — must match ALLOWED_DEVICES in backend .env and the DB seed
const char* DEVICE_ID     = "DRAIN_002";

// Drain physical parameters for this location
const float DRAIN_DEPTH_CM     = 15.0;   // Actual depth of this miniature drain
const float CRITICAL_LEVEL_PCT = 80.0;   // Local buzzer triggers at this %

// Telemetry send interval (milliseconds)
const unsigned long SEND_INTERVAL_MS = 3000;

// Wi-Fi retry interval
const unsigned long WIFI_RETRY_MS    = 10000;

// ═══════════════════════════════════════════════════════════════════════════
// PIN ASSIGNMENTS — Do NOT change without updating hardware
// ═══════════════════════════════════════════════════════════════════════════
#define PIN_US100_TRIG  D5   // GPIO14
#define PIN_US100_ECHO  D6   // GPIO12
#define PIN_BUZZER      D2   // GPIO4
// D1 (flow sensor) is intentionally NOT defined — not connected on this board.

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
unsigned long lastSendTime  = 0;
unsigned long lastWifiRetry = 0;
bool wifiConnected          = false;
bool localAlertActive       = false;

// ═══════════════════════════════════════════════════════════════════════════
// US-100 — Trigger/Echo distance measurement
// Returns distance in cm, or -1.0 on timeout/error
// ═══════════════════════════════════════════════════════════════════════════
float measureDistanceCm() {
  digitalWrite(PIN_US100_TRIG, LOW);
  delayMicroseconds(4);

  digitalWrite(PIN_US100_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_US100_TRIG, LOW);

  long duration = pulseIn(PIN_US100_ECHO, HIGH, 30000UL);

  if (duration == 0) return -1.0;

  float distanceCm = (duration / 2.0) / 29.1;

  if (distanceCm < 2.0 || distanceCm > 400.0) return -1.0;

  return distanceCm;
}

// ═══════════════════════════════════════════════════════════════════════════
// Local risk assessment (simplified, for offline buzzer operation)
// ═══════════════════════════════════════════════════════════════════════════
bool isHighRiskLocally(float distanceCm) {
  if (distanceCm < 0) return false;

  float waterLevelCm      = DRAIN_DEPTH_CM - distanceCm;
  float waterLevelPercent = (waterLevelCm / DRAIN_DEPTH_CM) * 100.0;

  return waterLevelPercent >= CRITICAL_LEVEL_PCT;
}

// ═══════════════════════════════════════════════════════════════════════════
// Buzzer control
// ═══════════════════════════════════════════════════════════════════════════
void setBuzzer(bool on) {
  digitalWrite(PIN_BUZZER, on ? HIGH : LOW);
}

void beepPattern(int times, int onMs, int offMs) {
  for (int i = 0; i < times; i++) {
    setBuzzer(true);
    delay(onMs);
    setBuzzer(false);
    if (i < times - 1) delay(offMs);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Wi-Fi connection
// ═══════════════════════════════════════════════════════════════════════════
void connectWifi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(250);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    beepPattern(2, 100, 100);
  } else {
    wifiConnected = false;
    Serial.println("\n[WiFi] Connection failed — local monitoring mode");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Send telemetry to backend
// Only water_distance_cm is sent — no rain_value or flow_rate_lpm fields.
// ═══════════════════════════════════════════════════════════════════════════
bool sendTelemetry(float distanceCm) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClient client;
  HTTPClient http;

  String url = String("http://") + BACKEND_HOST + ":" + BACKEND_PORT + "/api/telemetry";

  // Build JSON payload — rain and flow are intentionally excluded.
  // The backend processTelemetry() handles null rain_value and null flow_rate_lpm gracefully.
  String payload = "{";
  payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";

  if (distanceCm > 0) {
    payload += "\"water_distance_cm\":" + String(distanceCm, 2) + ",";
  } else {
    payload += "\"water_distance_cm\":null,";
  }

  payload += "\"wifi_status\":\"ONLINE\"";
  payload += "}";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  int httpCode = http.POST(payload);

  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[HTTP] Telemetry sent OK (HTTP %d)\n", httpCode);
    http.end();
    return true;
  } else {
    Serial.printf("[HTTP] Send failed (HTTP %d)\n", httpCode);
    http.end();
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n🚰 SmartDrain Firmware — NodeMCU 2 (DRAIN_002) starting...");

  pinMode(PIN_US100_TRIG, OUTPUT);
  pinMode(PIN_US100_ECHO, INPUT);
  pinMode(PIN_BUZZER,     OUTPUT);
  // D1 (flow sensor ISR) intentionally not configured — sensor absent on this board.

  setBuzzer(false);

  beepPattern(1, 200, 0);
  delay(300);

  connectWifi();

  lastSendTime  = millis();
  lastWifiRetry = millis();

  Serial.printf("[Config] Device: %s | Drain depth: %.1f cm | Critical: %.0f%%\n",
                DEVICE_ID, DRAIN_DEPTH_CM, CRITICAL_LEVEL_PCT);
  Serial.println("[Config] Sensors: US-100 ultrasonic only. Rain/flow sensors on DRAIN_001.");
}

// ═══════════════════════════════════════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── Wi-Fi retry (non-blocking) ─────────────────────────────────────────
  if (!wifiConnected && (now - lastWifiRetry >= WIFI_RETRY_MS)) {
    lastWifiRetry = now;
    Serial.println("[WiFi] Retrying connection...");
    connectWifi();
  }

  // ── Read ultrasonic sensor ─────────────────────────────────────────────
  float distanceCm = measureDistanceCm();

  float waterLevelCm  = (distanceCm > 0) ? max(0.0f, DRAIN_DEPTH_CM - distanceCm) : -1;
  float levelPct      = (waterLevelCm >= 0) ? (waterLevelCm / DRAIN_DEPTH_CM) * 100.0f : -1;

  Serial.printf("[Sensor] Dist: %.2f cm | Level: %.1f%% | WiFi: %s\n",
                distanceCm, levelPct,
                wifiConnected ? "ONLINE" : "OFFLINE");

  // ── Local risk + buzzer ────────────────────────────────────────────────
  bool highRisk = isHighRiskLocally(distanceCm);
  if (highRisk && !localAlertActive) {
    localAlertActive = true;
    Serial.println("[ALERT] HIGH RISK — Activating local buzzer!");
    beepPattern(3, 200, 100);
  } else if (!highRisk && localAlertActive) {
    localAlertActive = false;
    setBuzzer(false);
    Serial.println("[ALERT] Risk cleared — buzzer off");
  }

  if (localAlertActive) {
    setBuzzer((millis() / 500) % 2 == 0);
  }

  // ── Send telemetry ─────────────────────────────────────────────────────
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;
    bool sent = sendTelemetry(distanceCm);
    if (!sent) {
      Serial.println("[HTTP] Failed to send — continuing local monitoring");
    }
  }

  delay(100);
}
