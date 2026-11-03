#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <math.h>

const char* DEVICE_ID = "DRAIN_001";

const char* WIFI_SSID = "naah_balajihhhh";
const char* WIFI_PASSWORD = "heyyobruh";

const char* BACKEND_URL =
  "http://172.26.18.158:3001/api/telemetry";

#define TRIG_PIN D5
#define ECHO_PIN D6

#define RAIN_PIN A0

#define FLOW_PIN D1

#define BUZZER_PIN D2

#define DRAIN_DEPTH_CM 10.0

#define CRITICAL_LEVEL_PERCENT 85.0


#define BUZZER_WATER_LEVEL_PERCENT 60.0

#define SENSOR_INTERVAL_MS 15000UL

#define WIFI_RETRY_INTERVAL_MS 10000UL

#define HTTP_TIMEOUT_MS 5000

#define US100_SAMPLE_COUNT 5

#define US100_MIN_DISTANCE_CM 2.0
#define US100_MAX_DISTANCE_CM 450.0


#define RAIN_DRY_VALUE 1024
#define RAIN_WET_VALUE 100

#define RAIN_WET_IS_LOWER true

#define RAIN_DEAD_ZONE_PERCENT 5


#define FLOW_PULSES_PER_LITRE 450.0


#define OFFLINE_BUFFER_SIZE 5

String offlineBuffer[OFFLINE_BUFFER_SIZE];

int offlineBufferCount = 0;


volatile unsigned long flowPulses = 0;

unsigned long lastSensorRead = 0;
unsigned long lastWiFiAttempt = 0;
unsigned long lastFlowCalculation = 0;

float previousWaterLevelCm = 0.0;

unsigned long previousLevelTime = 0;

bool previousLevelValid = false;

void flushOfflineBuffer();
bool sendTelemetryJson(String json);
void queueOfflineTelemetry(String json);


void ICACHE_RAM_ATTR flowPulseISR() {

  flowPulses++;
}


void queueOfflineTelemetry(String json) {


  if (offlineBufferCount < OFFLINE_BUFFER_SIZE) {

    offlineBuffer[
      offlineBufferCount
    ] = json;

    offlineBufferCount++;

    Serial.println();
    Serial.print(
      "Telemetry stored locally. Buffer: "
    );

    Serial.print(
      offlineBufferCount
    );

    Serial.print(
      "/"
    );

    Serial.println(
      OFFLINE_BUFFER_SIZE
    );

    return;
  }


  for (
    int i = 0;
    i < OFFLINE_BUFFER_SIZE - 1;
    i++
  ) {

    offlineBuffer[i] =
      offlineBuffer[i + 1];
  }

  offlineBuffer[
    OFFLINE_BUFFER_SIZE - 1
  ] = json;

  Serial.println();
  Serial.println(
    "Offline buffer FULL."
  );

  Serial.println(
    "Oldest reading replaced by newest reading."
  );
}


bool sendTelemetryJson(
  String json
) {

  if (
    WiFi.status() !=
    WL_CONNECTED
  ) {

    Serial.println(
      "Telemetry not sent: Wi-Fi OFFLINE"
    );

    return false;
  }

  WiFiClient client;

  HTTPClient http;

  Serial.println();
  Serial.print(
    "Sending telemetry to: "
  );

  Serial.println(
    BACKEND_URL
  );

  if (
    !http.begin(
      client,
      BACKEND_URL
    )
  ) {

    Serial.println(
      "HTTP connection setup failed"
    );

    return false;
  }

  http.setTimeout(
    HTTP_TIMEOUT_MS
  );

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  Serial.println(
    "Telemetry JSON:"
  );

  Serial.println(
    json
  );

  int httpCode =
    http.POST(json);

  Serial.print(
    "HTTP Response: "
  );

  Serial.println(
    httpCode
  );

  bool success = false;

  if (
    httpCode > 0
  ) {

    String response =
      http.getString();

    Serial.println(
      "Backend response:"
    );

    Serial.println(
      response
    );

    if (
      httpCode >= 200 &&
      httpCode < 300
    ) {

      Serial.println(
        "Telemetry upload successful."
      );

      success = true;

    } else {

      Serial.println(
        "Backend returned an error."
      );
    }

  } else {

    Serial.println(
      "Telemetry upload failed."
    );

    Serial.print(
      "HTTP error: "
    );

    Serial.println(
      http.errorToString(
        httpCode
      )
    );
  }

  http.end();

  return success;
}

void flushOfflineBuffer() {

  if (
    offlineBufferCount == 0
  ) {

    return;
  }

  if (
    WiFi.status() !=
    WL_CONNECTED
  ) {

    return;
  }

  Serial.println();
  Serial.println(
    "======================================"
  );

  Serial.println(
    "Wi-Fi restored."
  );

  Serial.print(
    "Offline readings waiting: "
  );

  Serial.println(
    offlineBufferCount
  );

  Serial.println(
    "Uploading stored telemetry..."
  );

  Serial.println(
    "======================================"
  );

  while (
    offlineBufferCount > 0 &&
    WiFi.status() == WL_CONNECTED
  ) {

    String json =
      offlineBuffer[0];

    bool success =
      sendTelemetryJson(
        json
      );

    if (success) {

      for (
        int i = 0;
        i < offlineBufferCount - 1;
        i++
      ) {

        offlineBuffer[i] =
          offlineBuffer[i + 1];
      }

      offlineBuffer[
        offlineBufferCount - 1
      ] = "";

      offlineBufferCount--;

      Serial.print(
        "Stored reading uploaded. Remaining: "
      );

      Serial.println(
        offlineBufferCount
      );

    }

   

    else {

      Serial.println(
        "Stored upload failed."
      );

      Serial.println(
        "Keeping remaining readings in buffer."
      );

      break;
    }
  }

  Serial.println(
    "Offline buffer processing complete."
  );
}



void connectWiFi() {

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    return;
  }

  unsigned long now =
    millis();

  if (
    lastWiFiAttempt != 0 &&
    now - lastWiFiAttempt <
      WIFI_RETRY_INTERVAL_MS
  ) {

    return;
  }

  lastWiFiAttempt =
    now;

  Serial.println();
  Serial.println(
    "Connecting to Wi-Fi..."
  );

  WiFi.mode(
    WIFI_STA
  );

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );

  unsigned long start =
    millis();

  while (
    WiFi.status() !=
      WL_CONNECTED &&
    millis() - start <
      5000
  ) {

    delay(250);

    Serial.print(".");
  }

  Serial.println();

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    Serial.println(
      "Wi-Fi: ONLINE"
    );

    Serial.print(
      "ESP8266 IP: "
    );

    Serial.println(
      WiFi.localIP()
    );

    Serial.print(
      "Backend: "
    );

    Serial.println(
      BACKEND_URL
    );

  

    flushOfflineBuffer();

  } else {

    Serial.println(
      "Wi-Fi: OFFLINE - LOCAL MONITORING ACTIVE"
    );
  }
}



float readUS100Once() {

  digitalWrite(
    TRIG_PIN,
    LOW
  );

  delayMicroseconds(
    3
  );

  digitalWrite(
    TRIG_PIN,
    HIGH
  );

  delayMicroseconds(
    10
  );

  digitalWrite(
    TRIG_PIN,
    LOW
  );

  unsigned long duration =
    pulseIn(
      ECHO_PIN,
      HIGH,
      30000
    );

  if (
    duration == 0
  ) {

    return -1.0;
  }

  float distance =
    duration * 0.0343 / 2.0;

  if (
    distance <
      US100_MIN_DISTANCE_CM ||
    distance >
      US100_MAX_DISTANCE_CM
  ) {

    return -1.0;
  }

  return distance;
}



float readUS100() {

  float readings[
    US100_SAMPLE_COUNT
  ];

  int validCount =
    0;

  for (
    int i = 0;
    i < US100_SAMPLE_COUNT;
    i++
  ) {

    float distance =
      readUS100Once();

    if (
      distance > 0
    ) {

      readings[
        validCount
      ] = distance;

      validCount++;
    }

    delay(40);
  }

  if (
    validCount == 0
  ) {

    return -1.0;
  }



  for (
    int i = 0;
    i < validCount - 1;
    i++
  ) {

    for (
      int j = i + 1;
      j < validCount;
      j++
    ) {

      if (
        readings[j] <
        readings[i]
      ) {

        float temp =
          readings[i];

        readings[i] =
          readings[j];

        readings[j] =
          temp;
      }
    }
  }

 
  if (
    validCount % 2 == 1
  ) {

    return readings[
      validCount / 2
    ];

  } else {

    return (
      readings[
        validCount / 2 - 1
      ] +
      readings[
        validCount / 2
      ]
    ) / 2.0;
  }
}



int readRainRaw() {

  long total =
    0;

  const int samples =
    10;

  for (
    int i = 0;
    i < samples;
    i++
  ) {

    total +=
      analogRead(
        RAIN_PIN
      );

    delay(5);
  }

  return total / samples;
}



int calculateRainPercentage(
  int raw
) {

  int percentage;

  if (
    RAIN_WET_IS_LOWER
  ) {

    percentage =
      map(
        raw,
        RAIN_DRY_VALUE,
        RAIN_WET_VALUE,
        0,
        100
      );

  } else {

    percentage =
      map(
        raw,
        RAIN_WET_VALUE,
        RAIN_DRY_VALUE,
        0,
        100
      );
  }

  percentage =
    constrain(
      percentage,
      0,
      100
    );

  return percentage;
}



String getRainIntensity(
  int rainPercent
) {

  if (
    rainPercent <=
    RAIN_DEAD_ZONE_PERCENT
  ) {

    return "NONE";
  }

  if (
    rainPercent < 35
  ) {

    return "LIGHT";
  }

  if (
    rainPercent < 70
  ) {

    return "MODERATE";
  }

  return "HEAVY";
}



float calculateFlowRate() {

  unsigned long now =
    millis();

  unsigned long elapsed =
    now -
    lastFlowCalculation;

  if (
    elapsed < 1000
  ) {

    return 0.0;
  }

  noInterrupts();

  unsigned long pulses =
    flowPulses;

  flowPulses =
    0;

  interrupts();

  lastFlowCalculation =
    now;

  float seconds =
    elapsed /
    1000.0;

  float litres =
    pulses /
    FLOW_PULSES_PER_LITRE;

  float litresPerMinute =
    litres *
    (
      60.0 /
      seconds
    );

  return litresPerMinute;
}



float calculateWaterLevel(
  float distance
) {

  if (
    distance < 0
  ) {

    return -1.0;
  }

  float level =
    DRAIN_DEPTH_CM -
    distance;

  if (
    level < 0
  ) {

    level = 0;
  }

  if (
    level >
    DRAIN_DEPTH_CM
  ) {

    level =
      DRAIN_DEPTH_CM;
  }

  return level;
}



float calculateWaterLevelPercent(
  float level
) {

  if (
    level < 0
  ) {

    return -1.0;
  }

  float percent =
    (
      level /
      DRAIN_DEPTH_CM
    ) *
    100.0;

  return constrain(
    percent,
    0,
    100
  );
}



float calculateRiseRate(
  float currentLevel
) {

  unsigned long now =
    millis();

  if (
    !previousLevelValid ||
    currentLevel < 0
  ) {

    previousWaterLevelCm =
      currentLevel;

    previousLevelTime =
      now;

    previousLevelValid =
      true;

    return 0.0;
  }

  unsigned long elapsed =
    now -
    previousLevelTime;

  if (
    elapsed < 1000
  ) {

    return 0.0;
  }

  float minutes =
    elapsed /
    60000.0;

  float rise =
    (
      currentLevel -
      previousWaterLevelCm
    ) /
    minutes;

  previousWaterLevelCm =
    currentLevel;

  previousLevelTime =
    now;

  if (
    rise < 0
  ) {

    return 0.0;
  }

  return rise;
}



String getSensorStatus(
  float distance,
  int rainRaw
) {

  if (
    distance < 0
  ) {

    return "INVALID_READING";
  }

  if (
    distance < 3.0
  ) {

    return "POSSIBLE_OBSTRUCTION";
  }

  if (
    rainRaw <= 1
  ) {

    return "WARNING";
  }

  return "ONLINE";
}



float calculateFailureETA(
  float waterLevel,
  float riseRate
) {

  if (
    waterLevel < 0 ||
    riseRate <= 0
  ) {

    return -1.0;
  }

  float criticalLevel =
    DRAIN_DEPTH_CM *
    (
      CRITICAL_LEVEL_PERCENT /
      100.0
    );

  if (
    waterLevel >=
    criticalLevel
  ) {

    return 0.0;
  }

  float remaining =
    criticalLevel -
    waterLevel;

  float minutes =
    remaining /
    riseRate;

  if (
    minutes < 0 ||
    minutes > 100000
  ) {

    return -1.0;
  }

  return minutes;
}



int calculateRiskScore(
  float waterPercent,
  float riseRate,
  String rainIntensity,
  float flowRate
) {

  int score =
    0;



  if (
    waterPercent >= 85
  ) {

    score += 45;

  }
  else if (
    waterPercent >= 70
  ) {

    score += 30;

  }
  else if (
    waterPercent >= 50
  ) {

    score += 15;
  }



  if (
    riseRate >= 2.0
  ) {

    score += 30;

  }
  else if (
    riseRate >= 1.0
  ) {

    score += 20;

  }
  else if (
    riseRate >= 0.3
  ) {

    score += 10;
  }



  if (
    rainIntensity ==
    "HEAVY"
  ) {

    score += 15;

  }
  else if (
    rainIntensity ==
    "MODERATE"
  ) {

    score += 8;

  }
  else if (
    rainIntensity ==
    "LIGHT"
  ) {

    score += 3;
  }



  if (
    flowRate <= 0.1 &&
    waterPercent >= 50
  ) {

    score += 15;
  }

  return min(
    score,
    100
  );
}



String getRiskLevel(
  int score,
  String sensorStatus
) {



  if (
    sensorStatus ==
      "INVALID_READING" ||
    sensorStatus ==
      "POSSIBLE_OBSTRUCTION"
  ) {

    return "LOW";
  }

  if (
    score >= 80
  ) {

    return "CRITICAL";

  }
  else if (
    score >= 55
  ) {

    return "HIGH";

  }
  else if (
    score >= 30
  ) {

    return "MEDIUM";
  }

  return "LOW";
}


String buildRiskReasons(
  float waterPercent,
  float riseRate,
  String rainIntensity,
  float flowRate
) {

  String reasons =
    "";

  if (
    waterPercent >= 70
  ) {

    reasons +=
      "High water level; ";
  }

  if (
    riseRate >= 1.0
  ) {

    reasons +=
      "Water rising rapidly; ";

  }
  else if (
    riseRate >= 0.3
  ) {

    reasons +=
      "Water level rising; ";
  }

  if (
    rainIntensity ==
    "HEAVY"
  ) {

    reasons +=
      "Heavy rainfall; ";

  }
  else if (
    rainIntensity ==
    "MODERATE"
  ) {

    reasons +=
      "Moderate rainfall; ";
  }

  if (
    flowRate <= 0.1 &&
    waterPercent >= 50
  ) {

    reasons +=
      "Low outflow; ";
  }

  if (
    reasons.length() == 0
  ) {

    reasons =
      "Drainage conditions normal";
  }

  return reasons;
}



void updateBuzzer(
  float waterPercent,
  String riskLevel
) {

  bool waterAlarm =
    (
      waterPercent >=
      BUZZER_WATER_LEVEL_PERCENT
    );

  bool riskAlarm =
    (
      riskLevel == "HIGH" ||
      riskLevel == "CRITICAL"
    );

  if (
    waterAlarm ||
    riskAlarm
  ) {

    Serial.println();
    Serial.println(
      "!!! SMARTDRAIN ALERT !!!"
    );

    if (
      waterAlarm
    ) {

      Serial.println(
        "Reason: WATER LEVEL >= 60%"
      );
    }

    if (
      riskLevel == "HIGH"
    ) {

      Serial.println(
        "Reason: HIGH RISK"
      );
    }

    if (
      riskLevel == "CRITICAL"
    ) {

      Serial.println(
        "Reason: CRITICAL RISK"
      );
    }

    Serial.println(
      "BUZZER ON"
    );

    digitalWrite(
      BUZZER_PIN,
      HIGH
    );

  } else {

    digitalWrite(
      BUZZER_PIN,
      LOW
    );

    Serial.println(
      "BUZZER OFF"
    );
  }
}



String buildTelemetryJson(
  float distance,
  float waterLevel,
  float waterPercent,
  int rainRaw,
  String rainIntensity,
  float flowRate,
  float riseRate,
  String riskLevel,
  int riskScore,
  float failureETA,
  String sensorStatus
) {

  String json =
    "{";

  json +=
    "\"device_id\":\"" +
    String(DEVICE_ID) +
    "\",";

  json +=
    "\"water_distance_cm\":" +
    String(distance, 2) +
    ",";

  json +=
    "\"water_level_cm\":" +
    String(waterLevel, 2) +
    ",";

  json +=
    "\"water_level_percent\":" +
    String(waterPercent, 1) +
    ",";

  json +=
    "\"rain_value\":" +
    String(rainRaw) +
    ",";

  json +=
    "\"rain_intensity\":\"" +
    rainIntensity +
    "\",";

  json +=
    "\"flow_rate_lpm\":" +
    String(flowRate, 2) +
    ",";

  json +=
    "\"water_rise_rate_cm_min\":" +
    String(riseRate, 2) +
    ",";

  json +=
    "\"risk_level\":\"" +
    riskLevel +
    "\",";

  json +=
    "\"risk_score\":" +
    String(riskScore) +
    ",";

  if (
    failureETA >= 0
  ) {

    json +=
      "\"predicted_failure_minutes\":" +
      String(failureETA, 1) +
      ",";

  } else {

    json +=
      "\"predicted_failure_minutes\":null,";
  }

  json +=
    "\"sensor_status\":\"" +
    sensorStatus +
    "\",";

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    json +=
      "\"wifi_status\":\"ONLINE\"";

  } else {

    json +=
      "\"wifi_status\":\"OFFLINE\"";
  }

  json +=
    "}";

  return json;
}



void sendOrStoreTelemetry(
  String json
) {



  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    bool success =
      sendTelemetryJson(
        json
      );

    if (
      success
    ) {

      return;
    }



    Serial.println(
      "Backend unavailable."
    );

    Serial.println(
      "Storing telemetry locally."
    );

    queueOfflineTelemetry(
      json
    );

    return;
  }



  Serial.println();
  Serial.println(
    "Wi-Fi OFFLINE."
  );

  Serial.println(
    "Local sensing continues."
  );

  queueOfflineTelemetry(
    json
  );
}



void processSensors() {

  Serial.println();

  Serial.println(
    "======================================"
  );

  Serial.println(
    "        SMARTDRAIN TELEMETRY"
  );

  Serial.println(
    "======================================"
  );

 

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    flushOfflineBuffer();
  }



  float distance =
    readUS100();



  int rainRaw =
    readRainRaw();

  int rainPercent =
    calculateRainPercentage(
      rainRaw
    );

  String rainIntensity =
    getRainIntensity(
      rainPercent
    );



  float waterLevel =
    calculateWaterLevel(
      distance
    );

  float waterPercent =
    calculateWaterLevelPercent(
      waterLevel
    );

 

  float riseRate =
    0.0;

  if (
    waterLevel >= 0
  ) {

    riseRate =
      calculateRiseRate(
        waterLevel
      );
  }



  float flowRate =
    calculateFlowRate();



  String sensorStatus =
    getSensorStatus(
      distance,
      rainRaw
    );


  int riskScore =
    0;

  String riskLevel =
    "LOW";

  if (
    waterPercent >= 0 &&
    sensorStatus ==
      "ONLINE"
  ) {

    riskScore =
      calculateRiskScore(
        waterPercent,
        riseRate,
        rainIntensity,
        flowRate
      );

    riskLevel =
      getRiskLevel(
        riskScore,
        sensorStatus
      );
  }



  float failureETA =
    calculateFailureETA(
      waterLevel,
      riseRate
    );



  Serial.print(
    "Device: "
  );

  Serial.println(
    DEVICE_ID
  );



  Serial.print(
    "US-100 Distance: "
  );

  if (
    distance < 0
  ) {

    Serial.println(
      "NO ECHO"
    );

  } else {

    Serial.print(
      distance,
      2
    );

    Serial.println(
      " cm"
    );
  }



  Serial.print(
    "Water Level: "
  );

  if (
    waterLevel >= 0
  ) {

    Serial.print(
      waterLevel,
      2
    );

    Serial.println(
      " cm"
    );

  } else {

    Serial.println(
      "INVALID"
    );
  }


  Serial.print(
    "Water Level: "
  );

  if (
    waterPercent >= 0
  ) {

    Serial.print(
      waterPercent,
      1
    );

    Serial.println(
      "%"
    );

  } else {

    Serial.println(
      "INVALID"
    );
  }


  Serial.print(
    "Rise Rate: "
  );

  Serial.print(
    riseRate,
    2
  );

  Serial.println(
    " cm/min"
  );



  Serial.print(
    "Rain Raw: "
  );

  Serial.println(
    rainRaw
  );



  Serial.print(
    "Rain Percentage: "
  );

  Serial.print(
    rainPercent
  );

  Serial.println(
    "%"
  );



  Serial.print(
    "Rain Intensity: "
  );

  Serial.println(
    rainIntensity
  );



  Serial.print(
    "Flow Rate: "
  );

  Serial.print(
    flowRate,
    2
  );

  Serial.println(
    " L/min"
  );


  Serial.print(
    "Sensor Status: "
  );

  Serial.println(
    sensorStatus
  );

 

  Serial.print(
    "Risk Score: "
  );

  Serial.println(
    riskScore
  );



  Serial.print(
    "Risk Level: "
  );

  Serial.println(
    riskLevel
  );



  Serial.print(
    "Failure ETA: "
  );

  if (
    failureETA >= 0
  ) {

    Serial.print(
      failureETA,
      1
    );

    Serial.println(
      " minutes"
    );

  } else {

    Serial.println(
      "Not predictable"
    );
  }



  Serial.print(
    "Risk Reasons: "
  );

  Serial.println(
    buildRiskReasons(
      waterPercent,
      riseRate,
      rainIntensity,
      flowRate
    )
  );



  Serial.print(
    "Wi-Fi: "
  );

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    Serial.println(
      "ONLINE"
    );

  } else {

    Serial.println(
      "OFFLINE / LOCAL MONITORING"
    );
  }


  if (
    waterPercent >= 0
  ) {

    updateBuzzer(
      waterPercent,
      riskLevel
    );

  } else {

    digitalWrite(
      BUZZER_PIN,
      LOW
    );

    Serial.println(
      "BUZZER OFF - INVALID WATER READING"
    );
  }

  String json =
    buildTelemetryJson(
      distance,
      waterLevel,
      waterPercent,
      rainRaw,
      rainIntensity,
      flowRate,
      riseRate,
      riskLevel,
      riskScore,
      failureETA,
      sensorStatus
    );

  sendOrStoreTelemetry(
    json
  );


  Serial.print(
    "Offline Buffer: "
  );

  Serial.print(
    offlineBufferCount
  );

  Serial.print(
    "/"
  );

  Serial.println(
    OFFLINE_BUFFER_SIZE
  );

  Serial.println();

  Serial.println(
    "NEXT SENSOR READING IN 15 SECONDS"
  );

  Serial.println(
    "======================================"
  );
}


void setup() {

  Serial.begin(
    115200
  );

  delay(1500);

  Serial.println();

  Serial.println(
    "======================================"
  );

  Serial.println(
    "       SMARTDRAIN BOOTING"
  );

  Serial.println(
    "======================================"
  );

  pinMode(
    TRIG_PIN,
    OUTPUT
  );

  pinMode(
    ECHO_PIN,
    INPUT
  );

  pinMode(
    FLOW_PIN,
    INPUT
  );

  pinMode(
    BUZZER_PIN,
    OUTPUT
  );

  digitalWrite(
    BUZZER_PIN,
    LOW
  );

  digitalWrite(
    TRIG_PIN,
    LOW
  );


  attachInterrupt(
    digitalPinToInterrupt(
      FLOW_PIN
    ),
    flowPulseISR,
    RISING
  );

  lastFlowCalculation =
    millis();

  previousLevelTime =
    millis();


  connectWiFi();



  lastSensorRead =
    millis() -
    SENSOR_INTERVAL_MS;

  Serial.println();

  Serial.println(
    "System ready."
  );

  Serial.println(
    "Sensor interval: 15 seconds"
  );

  Serial.println(
    "Buzzer threshold: 60% water OR HIGH/CRITICAL risk"
  );

  Serial.print(
    "Offline buffer capacity: "
  );

  Serial.print(
    OFFLINE_BUFFER_SIZE
  );

  Serial.println(
    " readings"
  );
}



void loop() {


  connectWiFi();



  if (
    millis() -
    lastSensorRead >=
    SENSOR_INTERVAL_MS
  ) {

    lastSensorRead =
      millis();

    processSensors();
  }

  delay(10);
}
