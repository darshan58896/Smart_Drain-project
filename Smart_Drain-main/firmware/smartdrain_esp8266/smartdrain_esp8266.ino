/* SmartDrain DRAIN_001 — ESP8266 NodeMCU
   US-100: TRIG D5, ECHO D6 (level-shift if ECHO >3.3 V)
   Rain AO: A0 (observe board ADC input limit)
   YF-S201: pulse D1 (3.3 V-compatible signal)
   Active-high buzzer MODULE input: D2 (use driver if required)
*/
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// Replace with your own Wi-Fi credentials; do not publish passwords.
const char* WIFI_SSID = "NMITWIFI-GWN";
const char* WIFI_PASSWORD = "nmit@123";
// Set to your laptop's actual LAN IPv4 address (Windows: ipconfig).
const char* BACKEND_HOST = "172.80.6.180";
const uint16_t BACKEND_PORT = 3001;
const char* DEVICE_ID = "DRAIN_001";

// Measure from sensor face to drain bottom, not just the container's outside height.
const float DRAIN_DEPTH_CM = 15.0f;
const float BUZZER_DISTANCE_CM = 5.0f;
const float MIN_VALID_DISTANCE_CM = 2.0f; // US-100 nominal minimum
const float MAX_VALID_DISTANCE_CM = 400.0f;
const unsigned long SAMPLE_INTERVAL_MS = 3000;
const unsigned long WIFI_RETRY_MS = 10000;
const unsigned long HTTP_TIMEOUT_MS = 2500;

#define PIN_US100_TRIG D5
#define PIN_US100_ECHO D6
#define PIN_RAIN_AO A0
#define PIN_FLOW D1
#define PIN_BUZZER D2

// Calibrate rain values for your particular analog rain module before classifying intensity.
// 1023 (or 1024 in some previous logs) is NOT proof of dry weather.
volatile unsigned long flowPulseCount = 0;
unsigned long lastFlowTime = 0;
float flowRateLpm = 0.0f;
unsigned long lastSampleTime = 0;
unsigned long lastWifiRetry = 0;
bool buzzerAlarm = false;
int lastHttpCode = 0;
String backendState = "NOT TESTED";
String backendDetail = "No request yet";

void ICACHE_RAM_ATTR flowPulseISR() { flowPulseCount++; }

float measureDistanceCm() {
  digitalWrite(PIN_US100_TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_US100_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_US100_TRIG, LOW);
  unsigned long duration = pulseIn(PIN_US100_ECHO, HIGH, 30000UL);
  if (duration == 0) return NAN;
  float cm = (duration / 2.0f) / 29.1f;
  if (!isfinite(cm) || cm < MIN_VALID_DISTANCE_CM || cm > MAX_VALID_DISTANCE_CM) return NAN;
  return cm;
}

float calculateFlowRate() {
  unsigned long now = millis();
  unsigned long elapsed = now - lastFlowTime;
  if (elapsed < 500) return flowRateLpm;
  noInterrupts();
  unsigned long pulses = flowPulseCount;
  flowPulseCount = 0;
  interrupts();
  // Typical YF-S201 calibration: frequency (Hz) = 7.5 * flow (L/min).
  flowRateLpm = (pulses * 1000.0f / elapsed) / 7.5f;
  lastFlowTime = now;
  return flowRateLpm;
}

void updateBuzzer(float distanceCm) {
  // Invalid distance -> alarm OFF (no false proximity detection).
  buzzerAlarm = isfinite(distanceCm) && distanceCm <= BUZZER_DISTANCE_CM;
  // Intermittent alert; active-high buzzer module assumed.
  bool buzzerOutput = buzzerAlarm && ((millis() / 350UL) % 2UL == 0);
  digitalWrite(PIN_BUZZER, buzzerOutput ? HIGH : LOW);
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("[Wi-Fi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // Do not block sensor monitoring while Wi-Fi associates.
}

void sendTelemetry(float distanceCm, int rainValue, float flowLpm) {
  if (WiFi.status() != WL_CONNECTED) {
    backendState = "NOT CONNECTED";
    backendDetail = "Wi-Fi disconnected";
    lastHttpCode = 0;
    return;
  }
  if (!isfinite(distanceCm) || distanceCm > DRAIN_DEPTH_CM) {
    backendState = "NOT SENT";
    backendDetail = "No valid in-drain ultrasonic measurement";
    lastHttpCode = 0;
    return;
  }
  WiFiClient client;
  HTTPClient http;
  String url = String("http://") + BACKEND_HOST + ":" + String(BACKEND_PORT) + "/api/telemetry";
  String payload = "{\"device_id\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"water_distance_cm\":" + String(distanceCm, 2) + ",";
  payload += "\"rain_value\":" + String(rainValue) + ",";
  payload += "\"flow_rate_lpm\":" + String(flowLpm, 2) + ",";
  payload += "\"wifi_status\":\"ONLINE\"}";

  if (!http.begin(client, url)) {
    backendState = "ERROR";
    backendDetail = "Could not initialize HTTP request";
    lastHttpCode = 0;
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(HTTP_TIMEOUT_MS);
  int code = http.POST(payload);
  lastHttpCode = code;
  if (code >= 200 && code < 300) {
    backendState = "CONNECTED";
    backendDetail = "Telemetry accepted";
  } else {
    backendState = "FAILED";
    backendDetail = code < 0 ? http.errorToString(code) : http.getString();
    if (backendDetail.length() > 140) backendDetail = backendDetail.substring(0, 140);
  }
  http.end();
}

void printStatus(float distanceCm, int rainValue, float flowLpm) {
  bool valid = isfinite(distanceCm);
  bool inDrain = valid && distanceCm <= DRAIN_DEPTH_CM;
  float waterHeight = inDrain ? constrain(DRAIN_DEPTH_CM - distanceCm, 0.0f, DRAIN_DEPTH_CM) : NAN;
  float waterPct = inDrain ? 100.0f * waterHeight / DRAIN_DEPTH_CM : NAN;

  Serial.println();
  Serial.println("====================================================");
  Serial.println("              SMARTDRAIN LIVE MONITOR");
  Serial.println("====================================================");
  Serial.printf("Device ID                 : %s\n", DEVICE_ID);
  Serial.println("[DRAIN MEASUREMENTS]");
  Serial.printf("Configured Drain Height   : %.2f cm\n", DRAIN_DEPTH_CM);
  if (valid) Serial.printf("Sensor-to-Surface Distance: %.2f cm\n", distanceCm);
  else Serial.println("Sensor-to-Surface Distance: N/A (sensor error)");
  if (inDrain) {
    Serial.printf("Calculated Water Height   : %.2f cm\n", waterHeight);
    Serial.printf("Remaining Empty Space     : %.2f cm\n", distanceCm);
    Serial.printf("Water Level               : %.2f %%\n", waterPct);
  } else {
    Serial.println("Calculated Water Height   : N/A");
    Serial.println("Remaining Empty Space     : N/A");
    Serial.println("Water Level               : N/A");
    if (valid) Serial.println("Measurement Status        : OUTSIDE CONFIGURED DRAIN DEPTH");
    else Serial.println("Measurement Status        : SENSOR ERROR");
  }
  Serial.println("[ALERT]");
  Serial.printf("Buzzer Trigger Distance   : %.2f cm\n", BUZZER_DISTANCE_CM);
  Serial.printf("Buzzer Alarm              : %s\n", buzzerAlarm ? "ON (beeping)" : "OFF");
  Serial.printf("Proximity                 : %s\n", !valid ? "UNKNOWN" : (buzzerAlarm ? "OBJECT WITHIN 5 CM" : "NO OBJECT WITHIN 5 CM"));
  Serial.println("[RAIN SENSOR]");
  Serial.printf("Rain Analog Value         : %d\n", rainValue);
  Serial.println("Rain Status               : UNKNOWN (not calibrated)");
  Serial.println("Rainfall Rate             : N/A (no rain gauge)");
  Serial.println("[WATER FLOW]");
  Serial.printf("Water Flow Rate           : %.2f L/min (uncalibrated)\n", flowLpm);
  Serial.printf("Flow Pulses               : %s\n", flowLpm > 0.0f ? "DETECTED" : "NONE IN INTERVAL");
  Serial.println("[CONNECTIVITY]");
  bool wifiOk = WiFi.status() == WL_CONNECTED;
  Serial.printf("Wi-Fi Status              : %s\n", wifiOk ? "CONNECTED" : "DISCONNECTED");
  Serial.printf("Wi-Fi IP                  : %s\n", wifiOk ? WiFi.localIP().toString().c_str() : "UNAVAILABLE");
  Serial.printf("Backend Status            : %s\n", backendState.c_str());
  if (lastHttpCode > 0) Serial.printf("Last HTTP Status          : %d\n", lastHttpCode);
  else Serial.println("Last HTTP Status          : N/A");
  Serial.printf("Backend Detail            : %s\n", backendDetail.c_str());
  Serial.println("====================================================");
}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(PIN_US100_TRIG, OUTPUT);
  pinMode(PIN_US100_ECHO, INPUT);
  pinMode(PIN_FLOW, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW), flowPulseISR, RISING);
  lastFlowTime = millis();
  lastSampleTime = millis() - SAMPLE_INTERVAL_MS;
  lastWifiRetry = millis();
  connectWifi();
  Serial.println("SmartDrain DRAIN_001 started (115200 baud)");
}

void loop() {
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED && now - lastWifiRetry >= WIFI_RETRY_MS) {
    lastWifiRetry = now;
    connectWifi();
  }
  // Keep alarm pulsing even between measurements.
  static float latestDistance = NAN;
  updateBuzzer(latestDistance);
  if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = now;
    latestDistance = measureDistanceCm();
    int rain = analogRead(PIN_RAIN_AO);
    float flow = calculateFlowRate();
    updateBuzzer(latestDistance);
    sendTelemetry(latestDistance, rain, flow);
    printStatus(latestDistance, rain, flow);
  }
  delay(10);
}
