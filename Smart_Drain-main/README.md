# 🚰 SmartDrain — Predictive Drainage Monitoring Platform

**BMSIT Hackathon Prototype** | Command-Center Dashboard | ESP8266 + Node.js + React

---

## Quick Start (3 steps)

### Step 1 — Start the Backend

Open a terminal in `d:\smartdrain` and run:

```bat
start-backend.bat
```

Or manually:
```bash
cd backend
npm install
npm start
```

Backend runs on **http://localhost:3001**

### Step 2 — Start the Frontend

Open a **second** terminal:

```bat
start-frontend.bat
```

Or manually:
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on **http://localhost:5173**

### Step 3 — Open the Dashboard

Navigate to **http://localhost:5173** in your browser.

> Go to **Demo Control** (🎮 in sidebar) → Click **Single Shot** on any scenario to inject test data immediately.

---

## Project Structure

```
smartdrain/
├── backend/
│   ├── server.js          Main Express + Socket.IO server
│   ├── db.js              MongoDB database via Mongoose (schema, queries, seed data)
│   ├── riskEngine.js      Risk calculation + sensor health logic
│   ├── .env               Configuration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        Main layout + routing
│   │   ├── api.js         API client
│   │   ├── index.css      Global dark command-center styles
│   │   ├── hooks/
│   │   │   └── useSocket.js  Socket.IO real-time hook
│   │   ├── components/
│   │   │   ├── Shared.jsx    Badges, bars, data rows, alerts
│   │   │   ├── Charts.jsx    Chart.js line charts
│   │   │   └── Sidebar.jsx   Navigation sidebar
│   │   └── pages/
│   │       ├── DashboardPage.jsx     Command overview
│   │       ├── DrainDetailPage.jsx   Live sensor readings + charts
│   │       ├── MapPage.jsx           Risk-colored Leaflet map
│   │       ├── PriorityQueuePage.jsx Intervention queue
│   │       ├── IncidentsPage.jsx     Lifecycle management
│   │       ├── SensorHealthPage.jsx  Hardware status
│   │       └── DemoControlPage.jsx   Hackathon demo scenarios
│   └── package.json
├── firmware/
│   ├── smartdrain_esp8266/
│   │   └── smartdrain_esp8266.ino        NodeMCU 1 (DRAIN_001 with rain + flow sensors)
│   └── smartdrain_esp8266_node2/
│       └── smartdrain_esp8266_node2.ino  NodeMCU 2 (DRAIN_002 ultrasonic only)
├── demo_generator.py      Python test data generator (no hardware needed)
├── start-backend.bat
└── start-frontend.bat
```

---

## ESP8266 Firmware Setup

### 1. Configure Wi-Fi and Backend IP

Edit the top of `firmware/smartdrain_esp8266/smartdrain_esp8266.ino`:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_HOST  = "192.168.1.100";  // Your laptop LAN IP
const int   BACKEND_PORT  = 3001;
```

Find your laptop's LAN IP: `ipconfig` → IPv4 Address under your Wi-Fi adapter.

### 2. Configure Drain Depth

```cpp
const float DRAIN_DEPTH_CM     = 15.0;   // Actual physical depth of your drain
const float CRITICAL_LEVEL_PCT = 80.0;   // Buzzer triggers at this % of depth
const unsigned long SEND_INTERVAL_MS = 3000;  // Send every 3 seconds
```

### 3. Arduino IDE Settings

- **Board:** NodeMCU 1.0 (ESP-12E Module)
- **Flash Size:** 4MB (FS:2MB OTA:~1019KB)
- **Upload Speed:** 115200

Required libraries (all included in the ESP8266 board package):
- `ESP8266WiFi`
- `ESP8266HTTPClient`

### 4. Pin Wiring

| Sensor | NodeMCU Pin | GPIO |
|--------|-------------|------|
| US-100 TRIG | D5 | GPIO14 |
| US-100 ECHO | D6 | GPIO12 |
| Rain Sensor AO | A0 | A0 |
| YF-S201 signal (voltage-adapted) | D1 | GPIO5 |
| Buzzer | D2 | GPIO4 |
| GND (all sensors) | GND | — |

> ⚠️ The YF-S201 operates at 5V but the signal is voltage-divided before D1 — do NOT connect the raw 5V pulse line directly to an ESP8266 GPIO pin.

> ⚠️ US-100 is in **trigger/echo mode** (NOT UART mode). Connect TRIG→D5, ECHO→D6.

---

## API Contract (for ESP8266 / external integrations)

### POST /api/telemetry — Ingest sensor data

**Request body:**
```json
{
  "device_id": "DRAIN_001",
  "water_distance_cm": 8.2,
  "rain_value": 420,
  "flow_rate_lpm": 4.5,
  "wifi_status": "ONLINE"
}
```

**Response (HTTP 201):**
```json
{
  "success": true,
  "processed": {
    "device_id": "DRAIN_001",
    "timestamp": "2026-09-25T16:34:00.000Z",
    "water_distance_cm": 8.2,
    "water_level_cm": 6.8,
    "water_level_percent": 45,
    "drain_depth_cm": 15,
    "rain_value": 420,
    "rain_intensity": "MODERATE",
    "flow_rate_lpm": 4.5,
    "water_rise_rate_cm_min": 0.12,
    "risk_level": "MEDIUM",
    "risk_score": 35,
    "predicted_failure_minutes": null,
    "risk_reasons": [
      "Water level elevated (45% of drain capacity)",
      "Moderate rainfall detected"
    ],
    "priority": "P3",
    "sensor_status": "OK",
    "sensor_detail": null,
    "wifi_status": "ONLINE"
  }
}
```

### Full Endpoint Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/telemetry | Ingest sensor reading |
| GET | /api/drains | All devices + latest telemetry |
| GET | /api/drains/:id | Single drain details |
| GET | /api/drains/:id/history?limit=100 | Historical readings |
| GET | /api/incidents | All incidents |
| POST | /api/incidents/:id/acknowledge | Acknowledge incident |
| POST | /api/incidents/:id/dispatch | Dispatch team |
| POST | /api/incidents/:id/resolve | Mark resolved |
| GET | /api/dashboard | Summary counts |
| GET | /api/priority-queue | Sorted intervention queue |
| POST | /api/demo/simulate | Inject scenario `{scenario: 1-5}` |
| POST | /api/demo/autostream | Start streaming `{scenario, interval_ms}` |
| POST | /api/demo/autostream/stop | Stop auto-streaming |
| GET | /api/health | Health check |

---

## Demo Scenarios

### Using the Dashboard

Go to **Demo Control** page (🎮 sidebar icon):

- **Single Shot** — injects one reading immediately
- **Auto-stream** — continuously injects readings at configurable interval

### Using Python Generator (no hardware)

```bash
# Run all 5 scenarios in sequence (15 readings each, 2s apart)
python demo_generator.py

# Stream CRITICAL scenario continuously for extended demo
python demo_generator.py --scenario 4 --interval 2

# Quick burst of 5 readings
python demo_generator.py --scenario 3 --count 5 --interval 1
```

### Demo Flow for Judges

| Step | Action | What to Show |
|------|--------|-------------|
| 1 | Scenario 1 → Single Shot | Dashboard shows LOW/green. All sensors OK. |
| 2 | Scenario 2 → Auto-stream | Charts show rising water level. Risk → MEDIUM. |
| 3 | Scenario 3+4 → Auto-stream | CRITICAL alert. Incident auto-created. P1 in queue. ETA shown. |
| 4 | Incidents page | Acknowledge → Dispatch. Show lifecycle timeline animation. |
| 5 | Scenario 5 → Single Shot | Water level drops. Flow restored. Risk → LOW. Resolve incident. |

---

## Risk Engine

The risk score (0–100) is computed transparently from multiple signals:

| Factor | Max Score | Condition |
|--------|-----------|-----------|
| Water level % | 40 | ≥ 90% → 40pts, ≥ 80% → 30pts, ≥ 60% → 15pts |
| Rise rate | 30 | > 0.8 cm/min → 30pts, > 0.3 → 15pts |
| Rain intensity | 20 | HEAVY → 20pts, MODERATE → 10pts |
| Outflow condition | 20 | Flow < 0.5 L/min at elevated level → 20pts |

**Risk Levels:** LOW (0–24) · MEDIUM (25–49) · HIGH (50–74) · CRITICAL (75–100)

**Time-to-critical estimate:**
```
ETA = (critical_level_cm - current_level_cm) / rise_rate_cm_min
```
Only displayed when rise rate > 0.05 cm/min and ETA ≤ 120 minutes.

---

## Sensor Health Rules

| Status | Trigger Condition |
|--------|-------------------|
| OK | All readings within valid ranges |
| POSSIBLE_OBSTRUCTION | Sudden distance jump > 80% of drain depth in one cycle |
| INVALID_READING | Distance ≤ 0 or > 400 cm |
| OFFLINE | No echo pulse (pulseIn timeout) |
| WARNING | Flow rate < 0 OR rain ADC value outside 0–1023 |

> **Critical rule:** A sensor fault does NOT automatically trigger HIGH/CRITICAL drainage risk. The score is capped at MEDIUM and the sensor issue is reported separately, preventing false alarms.

---

## Rain Sensor Calibration

Default thresholds in `backend/riskEngine.js`:

```js
const RAIN_THRESHOLDS = {
  NONE:     800,   // analog value > 800 = dry
  LIGHT:    600,   // 600–800 = light rain
  MODERATE: 350,   // 350–600 = moderate rain
  HEAVY:    0,     // < 350 = heavy rain
};
```

To calibrate: read the AO value in dry conditions (should be ~900–1023) and in heavy rain (should be ~100–300). Adjust thresholds accordingly.

---

## Incident Lifecycle

```
DETECTED → ALERTED → ACKNOWLEDGED → DISPATCHED → INTERVENTION → RESOLVED
```

- Incidents **auto-create** when risk reaches HIGH or CRITICAL
- Managed from the **Incidents** page with one-click actions
- Visual timeline shows current position in the lifecycle
- Socket.IO pushes real-time updates to all connected dashboards

---

## Adding More Drains

1. Add the device to `ALLOWED_DEVICES` in `backend/.env`:
   ```
   ALLOWED_DEVICES=DRAIN_001,DRAIN_002
   ```

2. Seed the new device in `backend/db.js` (the `seedDevice.run(...)` block):
   ```js
   seedDevice.run('DRAIN_002', 'North Gate Drain', 'BMSIT North Gate', 13.1290, 77.5700, 'Ward 43', 'AUTH_002', 12.0, 80.0);
   ```

3. Flash a second ESP8266 with `device_id = "DRAIN_002"` and the new backend IP.

---

## Configuration Reference

### `backend/.env`

| Key | Default | Description |
|-----|---------|-------------|
| PORT | 3001 | Backend server port |
| ALLOWED_DEVICES | DRAIN_001 | Comma-separated allowed device IDs |
| DEMO_MODE | true | Enable /api/demo/* endpoints |

### Drain parameters (in db.js seed)

| Field | Default | Description |
|-------|---------|-------------|
| drain_depth_cm | 15.0 | Physical depth of drain in cm |
| critical_level_percent | 80.0 | Level % that triggers critical risk |

---

## Architecture

```
ESP8266 NodeMCU
    │  POST /api/telemetry  (every 3s)
    ▼
Express + Socket.IO Backend  (Node.js)
    │  • Validate device_id
    │  • Assess sensor health
    │  • Compute water level from distance
    │  • Calculate rise rate from history
    │  • Run multi-signal risk engine
    │  • Store in MongoDB
    │  • Auto-create incidents at HIGH/CRITICAL
    │  • Broadcast via Socket.IO
    ▼
MongoDB Database (Mongoose)
    │  devices | telemetry | incidents | authorities | locations
    ▼
React Frontend  (Vite + Chart.js + Leaflet)
    ├── Command Dashboard   — stat cards, drain table, trend chart
    ├── Drain Detail        — live readings, risk score, 4 charts
    ├── Live Map            — risk-colored markers + circles
    ├── Priority Queue      — P1→P4 sorted with ETA
    ├── Incident Management — lifecycle timeline + actions
    ├── Sensor Health       — per-sensor status + fault rules
    └── Demo Control        — 5-scenario simulation panel
```

---

*SmartDrain — BMSIT Hackathon 2026 · Prototype — not a production system*
