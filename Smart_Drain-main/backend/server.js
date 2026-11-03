/**
 * SmartDrain — Main Express + Socket.IO Server
 * Database: MongoDB via Mongoose (no native compilation needed)
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const {
  classifyRainIntensity,
  assessSensorHealth,
  calculateRisk,
  calculateRiseRate,
  waterLevelFromDistance,
} = require('./riskEngine');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT            = process.env.PORT || 3001;
const ALLOWED_DEVICES = (process.env.ALLOWED_DEVICES || 'DRAIN_001').split(',').map(s => s.trim());
const DEMO_MODE       = process.env.DEMO_MODE === 'true';
const ML_SERVICE_URL  = (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const ML_TIMEOUT_MS   = Math.max(250, Number(process.env.ML_TIMEOUT_MS) || 1500);

let dynamicAllowedDevices = [...ALLOWED_DEVICES];

async function isDeviceAllowed(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return false;
  const id = deviceId.trim();
  if (dynamicAllowedDevices.includes(id)) return true;
  const device = await db.getDevice(id);
  if (device) {
    if (!dynamicAllowedDevices.includes(id)) dynamicAllowedDevices.push(id);
    return true;
  }
  return false;
}

function requireAuthorityAdmin(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-authority-token'];
  let token = null;
  if (authHeader) {
    token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  }
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Municipal authority authentication required' });
  }
  const user = db.verifyToken(token);
  if (!user || user.role !== 'authority_admin') {
    return res.status(403).json({ error: 'Forbidden: Requires municipal authority admin privileges' });
  }
  req.user = user;
  next();
}

app.use(cors());
app.use(express.json());

// ─── Optional experimental ML integration ────────────────────────────────────
// ML predictions are advisory only. Rule-based risk assessment remains authoritative.
async function requestMlPrediction({ waterLevelPercent, riseRateCmMin, rainValue }) {
  if (waterLevelPercent == null || rainValue == null || !Number.isFinite(Number(rainValue))) {
    return { status: 'skipped', reason: 'Missing valid water-level percentage or rain sensor reading' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        water_level_percent: Math.max(0, Math.min(100, Number(waterLevelPercent))),
        rise_rate_cm_min: Number.isFinite(Number(riseRateCmMin)) ? Math.max(-20, Math.min(20, Number(riseRateCmMin))) : 0,
        rain_sensor_value: Math.max(0, Math.min(1023, Math.round(Number(rainValue)))),
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: 'unavailable', reason: data.detail || `ML service returned HTTP ${response.status}` };
    }
    return { status: 'available', ...data };
  } catch (err) {
    return { status: 'unavailable', reason: err.name === 'AbortError' ? 'ML service request timed out' : 'ML service is not reachable' };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── State: last known reading per device ────────────────────────────────────
const lastReading = {}; // device_id → { water_distance_cm, timestamp }

// ─── Hardware presence tracking (30s freshness window) ────────────────────────
const HARDWARE_TIMEOUT_MS = 30 * 1000;
const hardwareLastSeen = {}; // device_id → Date of last valid hardware telemetry

function getHardwareDeviceStatus(deviceId) {
  const lastSeen = hardwareLastSeen[deviceId];
  if (!lastSeen) {
    return {
      is_online: false,
      is_active_hardware: false,
      hardware_last_seen: null,
      hardware_age_seconds: null,
    };
  }
  const ageMs = Date.now() - new Date(lastSeen).getTime();
  const isOnline = ageMs <= HARDWARE_TIMEOUT_MS;
  return {
    is_online: isOnline,
    is_active_hardware: isOnline,
    hardware_last_seen: lastSeen.toISOString(),
    hardware_age_seconds: Math.round(ageMs / 1000),
  };
}

function getActiveHardwareDeviceIds() {
  const now = Date.now();
  return Object.keys(hardwareLastSeen).filter(deviceId => {
    return (now - new Date(hardwareLastSeen[deviceId]).getTime()) <= HARDWARE_TIMEOUT_MS;
  });
}

async function getActiveDashboardSummary() {
  const activeIds = getActiveHardwareDeviceIds();
  const latestAll = await db.getAllLatestTelemetry();
  const activeLatest = latestAll.filter(t => activeIds.includes(t.device_id));
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNKNOWN: 0, total: activeIds.length };
  activeLatest.forEach(t => {
    counts[t.risk_level] = (counts[t.risk_level] || 0) + 1;
  });
  const activeIncidents = await (db.getIncidents ? db.getIncidents(100) : []).then
    ? (await db.getIncidents(100)).filter(i => i.status !== 'RESOLVED').length
    : 0;
  const sensorWarnings = activeLatest.filter(t => t.sensor_status !== 'OK').length;

  return {
    total_drains:     counts.total,
    online_devices:   counts.total,
    critical_drains:  counts.CRITICAL || 0,
    high_drains:      counts.HIGH || 0,
    medium_drains:    counts.MEDIUM || 0,
    low_drains:       counts.LOW || 0,
    sensor_warnings:  sensorWarnings,
    active_incidents: activeIncidents,
    active_devices:   activeIds,
  };
}

// ─── Shared telemetry processing ─────────────────────────────────────────────
async function processTelemetry(body, source = 'hardware') {
  const device = await db.getDevice(body.device_id);
  if (!device) throw new Error('Device not registered');

  const drainDepthCm     = device.drain_depth_cm    || 15.0;
  const criticalLevelPct = device.critical_level_percent || 80.0;

  // Raw sensor values
  const waterDistanceCm  = body.water_distance_cm != null ? parseFloat(body.water_distance_cm) : null;
  const rainValue        = body.rain_value != null ? parseInt(body.rain_value, 10) : null;
  const flowRateLpm      = body.flow_rate_lpm != null ? parseFloat(body.flow_rate_lpm) : null;
  const wifiStatus       = body.wifi_status || 'ONLINE';
  const timestamp        = new Date();

  // Sensor health
  const prevReading  = lastReading[body.device_id] || null;
  const prevDistance = prevReading ? prevReading.water_distance_cm : null;

  const sensorHealth = assessSensorHealth({
    waterDistanceCm,
    drainDepthCm,
    rainValue,
    flowRateLpm,
    prevDistance,
  });

  // Derived values
  const isSensorValid = sensorHealth.status !== 'OFFLINE' && sensorHealth.status !== 'INVALID_READING';
  const waterLevelCm  = (isSensorValid && waterDistanceCm !== null)
    ? waterLevelFromDistance(waterDistanceCm, drainDepthCm)
    : null;

  const waterLevelPercent = waterLevelCm !== null
    ? Math.round((waterLevelCm / drainDepthCm) * 100)
    : null;

  const rainIntensity = classifyRainIntensity(rainValue);

  // Rise rate from recent history
  const recentReadings = await db.getRecentTelemetryForRise(body.device_id);
  let riseRateCmMin    = calculateRiseRate(recentReadings);

  if (waterLevelCm !== null && recentReadings.length > 0) {
    const syntheticRecent = [{ water_level_cm: waterLevelCm, timestamp }, ...recentReadings];
    riseRateCmMin = calculateRiseRate(syntheticRecent);
  }

  // Risk calculation
  const { riskLevel, riskScore, riskReasons, priority, predictedFailureMinutes } = calculateRisk({
    waterLevelCm,
    drainDepthCm,
    criticalLevelPct,
    rainIntensity,
    flowRateLpm,
    riseRateCmMin,
    sensorStatus: sensorHealth.status,
  });

  // Optional ML inference. A timeout/failure never blocks the rule-based risk engine.
  const mlPrediction = await requestMlPrediction({
    waterLevelPercent,
    riseRateCmMin,
    rainValue,
  });

  // Save telemetry
  await db.insertTelemetry({
    device_id:               body.device_id,
    timestamp,
    water_distance_cm:       waterDistanceCm,
    water_level_cm:          waterLevelCm,
    water_level_percent:     waterLevelPercent,
    rain_value:              rainValue,
    rain_intensity:          rainIntensity,
    flow_rate_lpm:           flowRateLpm,
    water_rise_rate_cm_min:  riseRateCmMin,
    risk_level:              riskLevel,
    risk_score:              riskScore,
    predicted_failure_minutes: predictedFailureMinutes,
    risk_reasons:            riskReasons,
    sensor_status:           sensorHealth.status,
    wifi_status:             wifiStatus,
    source:                  source,
  });

  // Only valid physical hardware telemetry activates presence and updates last valid reading cache
  if (source === 'hardware' && isSensorValid && waterDistanceCm !== null) {
    hardwareLastSeen[body.device_id] = timestamp;
    lastReading[body.device_id] = { water_distance_cm: waterDistanceCm, timestamp };
  }

  // Auto-create incident if HIGH/CRITICAL (strictly for verified hardware telemetry)
  if (source === 'hardware') {
    await handleIncidentLifecycle(body.device_id, device, riskLevel, riskScore, riskReasons, priority);
  }

  const hwStatus = getHardwareDeviceStatus(body.device_id);

  // Build enriched payload for broadcast
  const enriched = {
    device_id:               body.device_id,
    location_name:           device.location_name,
    timestamp:               timestamp.toISOString(),
    water_distance_cm:       waterDistanceCm,
    water_level_cm:          waterLevelCm,
    water_level_percent:     waterLevelPercent,
    drain_depth_cm:          drainDepthCm,
    rain_value:              rainValue,
    rain_intensity:          rainIntensity,
    flow_rate_lpm:           flowRateLpm,
    water_rise_rate_cm_min:  riseRateCmMin,
    risk_level:              riskLevel,
    risk_score:              riskScore,
    predicted_failure_minutes: predictedFailureMinutes,
    risk_reasons:            riskReasons,
    priority,
    sensor_status:           sensorHealth.status,
    sensor_detail:           sensorHealth.detail,
    wifi_status:             wifiStatus,
    ml_prediction:           mlPrediction,
    source:                  source,
    source_label:            source === 'hardware' ? 'LIVE HARDWARE' : (source === 'demo' ? 'DEMO SIMULATION' : 'HISTORICAL RECORD'),
    is_online:               hwStatus.is_online,
    is_active_hardware:      hwStatus.is_active_hardware,
    hardware_last_seen:      hwStatus.hardware_last_seen,
    hardware_age_seconds:    hwStatus.hardware_age_seconds,
  };

  // Broadcast via Socket.IO - strictly isolate hardware telemetry from demo simulation
  if (source === 'hardware') {
    const summary = await getActiveDashboardSummary();
    io.emit('telemetry', enriched);
    io.emit('dashboard_update', summary);
    io.emit('device_status', {
      active_devices: getActiveHardwareDeviceIds(),
      timestamp: timestamp.toISOString(),
    });
  } else {
    io.emit('demo_telemetry', enriched);
  }

  return enriched;
}

// ─── Incident Lifecycle ───────────────────────────────────────────────────────
async function handleIncidentLifecycle(deviceId, device, riskLevel, riskScore, riskReasons, priority) {
  if (riskLevel !== 'HIGH' && riskLevel !== 'CRITICAL') return;

  const incidentId = `INC_${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date();

  const created = await db.insertIncident({
    incident_id:  incidentId,
    device_id:    deviceId,
    detected_at:  now,
    updated_at:   now,
    risk_level:   riskLevel,
    risk_score:   riskScore,
    risk_reasons: riskReasons,
    priority,
    status:       'DETECTED',
    authority_id: device.authority_id,
  });

  if (created) {
    io.emit('new_incident', { incidentId, deviceId, riskLevel, priority });
  }
}

// ─── Helper: enrich incidents with device/authority info ─────────────────────
async function enrichIncident(incident) {
  if (!incident) return null;
  const device    = await db.getDevice(incident.device_id);
  const authority = device ? await db.getAuthority(device.authority_id) : null;
  return {
    ...incident,
    location_name:  device?.location_name,
    ward:           device?.ward,
    authority_name: authority?.name,
    team_name:      authority?.team_name,
    contact_phone:  authority?.contact_phone,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION & ACCESS CONTROL (Municipal Authority)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = await db.verifyAuthorityCredentials(username.trim(), password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid municipal authority credentials' });
    }
    const token = db.generateToken(user);
    return res.json({
      success: true,
      token,
      user: {
        username: user.username,
        role: user.role,
        name: user.name,
        authority_id: user.authority_id,
      },
    });
  } catch (err) {
    console.error('[POST /api/auth/login]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuthorityAdmin, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/telemetry (Hardware Only)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/telemetry', async (req, res) => {
  try {
    const body = req.body;
    const allowed = await isDeviceAllowed(body?.device_id);
    if (!body?.device_id || !allowed) {
      return res.status(400).json({ error: 'Invalid, unregistered or disallowed device_id' });
    }
    const enriched = await processTelemetry(body, 'hardware');
    return res.status(201).json({ success: true, processed: enriched });
  } catch (err) {
    console.error('[POST /api/telemetry]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DRAINAGE ASSET MANAGEMENT (Authority Controlled)
// ═══════════════════════════════════════════════════════════════════════════

// Register new drainage asset
app.post('/api/drains', requireAuthorityAdmin, async (req, res) => {
  try {
    const {
      device_id,
      name,
      location_name,
      street_landmark,
      ward,
      latitude,
      longitude,
      authority_id,
      installation_notes,
      drain_depth_cm,
      total_depth_cm,        // alias from frontend form
      critical_level_percent,
    } = req.body || {};

    if (!device_id || typeof device_id !== 'string') {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    const cleanId = device_id.trim().toUpperCase();
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(cleanId)) {
      return res.status(400).json({ error: 'Device ID must be 3-30 characters (letters, numbers, hyphens, underscores)' });
    }

    const existing = await db.getDevice(cleanId);
    if (existing) {
      return res.status(409).json({ error: `Device ID '${cleanId}' is already registered` });
    }

    if (!location_name || !location_name.trim()) {
      return res.status(400).json({ error: 'Location name is required' });
    }

    let latNum = null;
    let lngNum = null;
    if (latitude !== undefined && latitude !== null && latitude !== '') {
      latNum = Number(latitude);
      if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
        return res.status(400).json({ error: 'Latitude must be a valid number between -90 and 90' });
      }
    }
    if (longitude !== undefined && longitude !== null && longitude !== '') {
      lngNum = Number(longitude);
      if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
        return res.status(400).json({ error: 'Longitude must be a valid number between -180 and 180' });
      }
    }

    const created = await db.createDevice({
      device_id:              cleanId,
      name:                   name?.trim() || `Drainage Sensor ${cleanId}`,
      location_name:          location_name.trim(),
      street_landmark:        street_landmark?.trim() || null,
      ward:                   ward?.trim() || 'Ward 42',
      latitude:               latNum,
      longitude:              lngNum,
      authority_id:           authority_id?.trim() || req.user.authority_id || 'AUTH_001',
      installation_notes:     installation_notes?.trim() || null,
      drain_depth_cm:         Number(total_depth_cm || drain_depth_cm) > 0 ? Number(total_depth_cm || drain_depth_cm) : 100.0,
      total_depth_cm:         Number(total_depth_cm || drain_depth_cm) > 0 ? Number(total_depth_cm || drain_depth_cm) : 100.0,
      critical_level_percent: Number(critical_level_percent) > 0 ? Number(critical_level_percent) : 80.0,
    });

    if (!dynamicAllowedDevices.includes(cleanId)) {
      dynamicAllowedDevices.push(cleanId);
    }

    await db.insertAuditLog({
      action:       'REGISTER_ASSET',
      device_id:    cleanId,
      performed_by: req.user.username,
      changes: {
        name: created.name,
        location_name: created.location_name,
        street_landmark: created.street_landmark,
        ward: created.ward,
        latitude: created.latitude,
        longitude: created.longitude,
      },
      notes: installation_notes?.trim() || null,
    });

    io.emit('device_registered', {
      device_id: cleanId,
      location_name: created.location_name,
      ward: created.ward,
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error('[POST /api/drains]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Update existing drainage asset location and metadata
app.put('/api/drains/:id', requireAuthorityAdmin, async (req, res) => {
  try {
    const deviceId = req.params.id;
    const existing = await db.getDevice(deviceId);
    if (!existing) {
      return res.status(404).json({ error: `Device '${deviceId}' not found` });
    }

    const {
      name,
      location_name,
      street_landmark,
      ward,
      latitude,
      longitude,
      authority_id,
      installation_notes,
      drain_depth_cm,
      critical_level_percent,
    } = req.body || {};

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (location_name !== undefined) {
      if (!location_name.trim()) return res.status(400).json({ error: 'Location name cannot be empty' });
      updateData.location_name = location_name.trim();
    }
    if (street_landmark !== undefined) updateData.street_landmark = street_landmark?.trim() || null;
    if (ward !== undefined) updateData.ward = ward?.trim() || null;
    if (installation_notes !== undefined) updateData.installation_notes = installation_notes?.trim() || null;
    if (authority_id !== undefined) updateData.authority_id = authority_id?.trim() || 'AUTH_001';
    if (drain_depth_cm !== undefined && Number(drain_depth_cm) > 0) updateData.drain_depth_cm = Number(drain_depth_cm);
    if (critical_level_percent !== undefined && Number(critical_level_percent) > 0) updateData.critical_level_percent = Number(critical_level_percent);

    if (latitude !== undefined) {
      if (latitude === null || latitude === '') {
        updateData.latitude = null;
      } else {
        const latNum = Number(latitude);
        if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
          return res.status(400).json({ error: 'Latitude must be a valid number between -90 and 90' });
        }
        updateData.latitude = latNum;
      }
    }

    if (longitude !== undefined) {
      if (longitude === null || longitude === '') {
        updateData.longitude = null;
      } else {
        const lngNum = Number(longitude);
        if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
          return res.status(400).json({ error: 'Longitude must be a valid number between -180 and 180' });
        }
        updateData.longitude = lngNum;
      }
    }

    const updated = await db.updateDevice(deviceId, updateData);

    await db.insertAuditLog({
      action:       'UPDATE_LOCATION',
      device_id:    deviceId,
      performed_by: req.user.username,
      changes:      updateData,
    });

    io.emit('device_updated', updated);

    return res.json(updated);
  } catch (err) {
    console.error('[PUT /api/drains/:id]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Patch alias for partial location update (full implementation, not forwarded router)
app.patch('/api/drains/:id/location', requireAuthorityAdmin, async (req, res) => {
  try {
    const deviceId = req.params.id;
    const existing = await db.getDevice(deviceId);
    if (!existing) return res.status(404).json({ error: `Device '${deviceId}' not found` });

    const { location_name, ward, street_landmark, latitude, longitude, installation_notes } = req.body || {};
    const updateData = {};

    if (location_name !== undefined) {
      if (!location_name.trim()) return res.status(400).json({ error: 'Location name cannot be empty' });
      updateData.location_name = location_name.trim();
    }
    if (ward !== undefined)               updateData.ward               = ward?.trim() || null;
    if (street_landmark !== undefined)    updateData.street_landmark    = street_landmark?.trim() || null;
    if (installation_notes !== undefined) updateData.installation_notes = installation_notes?.trim() || null;

    if (latitude !== undefined) {
      if (latitude === null || latitude === '') {
        updateData.latitude = null;
      } else {
        const latNum = Number(latitude);
        if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90)
          return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
        updateData.latitude = latNum;
      }
    }
    if (longitude !== undefined) {
      if (longitude === null || longitude === '') {
        updateData.longitude = null;
      } else {
        const lngNum = Number(longitude);
        if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180)
          return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
        updateData.longitude = lngNum;
      }
    }

    const updated = await db.updateDevice(deviceId, updateData);
    await db.insertAuditLog({
      action:       'UPDATE_LOCATION',
      device_id:    deviceId,
      performed_by: req.user.username,
      changes:      updateData,
    });
    io.emit('device_updated', updated);
    return res.json(updated);
  } catch (err) {
    console.error('[PATCH /api/drains/:id/location]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Audit log view — returns { audit_logs: [...] } so the frontend can destructure
app.get('/api/drains/audit-log', requireAuthorityAdmin, async (req, res) => {
  try {
    const logs = await db.getAuditLogs(100);
    res.json({ audit_logs: Array.isArray(logs) ? logs : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/drains
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/drains', async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true' || req.query.active_only === 'true';
    const devices    = await db.getAllDevices();
    const latestAll  = await db.getAllLatestTelemetry();
    const latestMap  = {};
    latestAll.forEach(t => { latestMap[t.device_id] = t; });

    const all = await Promise.all(devices.map(async d => {
      const auth = await db.getAuthority(d.authority_id);
      const hwStatus = getHardwareDeviceStatus(d.device_id);
      const latestTelemetry = latestMap[d.device_id] || null;
      return {
        ...d,
        authority_name:       auth?.name,
        team_name:            auth?.team_name,
        contact_phone:        auth?.contact_phone,
        contact_email:        auth?.contact_email,
        latest_telemetry:     latestTelemetry,
        is_online:            hwStatus.is_online,
        is_active_hardware:   hwStatus.is_active_hardware,
        hardware_last_seen:   hwStatus.hardware_last_seen,
        hardware_age_seconds: hwStatus.hardware_age_seconds,
        status:               !latestTelemetry ? 'NO DATA RECEIVED' : (hwStatus.is_online ? 'ONLINE' : 'OFFLINE'),
      };
    }));

    if (activeOnly) {
      return res.json(all.filter(d => d.is_active_hardware));
    }
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/drains/active
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/drains/active', async (req, res) => {
  try {
    const devices   = await db.getAllDevices();
    const latestAll = await db.getAllLatestTelemetry();
    const latestMap = {};
    latestAll.forEach(t => { latestMap[t.device_id] = t; });

    const activeList = [];
    for (const d of devices) {
      const hwStatus = getHardwareDeviceStatus(d.device_id);
      if (hwStatus.is_active_hardware) {
        const auth = await db.getAuthority(d.authority_id);
        activeList.push({
          ...d,
          authority_name:       auth?.name,
          team_name:            auth?.team_name,
          contact_phone:        auth?.contact_phone,
          contact_email:        auth?.contact_email,
          latest_telemetry:     latestMap[d.device_id] || null,
          is_online:            true,
          is_active_hardware:   true,
          hardware_last_seen:   hwStatus.hardware_last_seen,
          hardware_age_seconds: hwStatus.hardware_age_seconds,
          status:               'ONLINE',
        });
      }
    }
    res.json(activeList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/drains/status
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/drains/status', async (req, res) => {
  try {
    const activeIds = getActiveHardwareDeviceIds();
    const registeredDevices = await db.getAllDevices();
    const statusMap = {};
    registeredDevices.forEach(d => {
      statusMap[d.device_id] = getHardwareDeviceStatus(d.device_id);
    });
    res.json({
      active_devices:  activeIds,
      timeout_seconds: 30,
      timestamp:       new Date().toISOString(),
      devices:         statusMap,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/drains/:id
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/drains/:id', async (req, res) => {
  try {
    const device = await db.getDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const auth   = await db.getAuthority(device.authority_id);
    const latest = await db.getLatestTelemetry(req.params.id);
    const hwStatus = getHardwareDeviceStatus(req.params.id);

    res.json({
      ...device,
      authority_name:       auth?.name,
      team_name:            auth?.team_name,
      contact_phone:        auth?.contact_phone,
      contact_email:        auth?.contact_email,
      latest_telemetry:     latest || null,
      is_online:            hwStatus.is_online,
      is_active_hardware:   hwStatus.is_active_hardware,
      hardware_last_seen:   hwStatus.hardware_last_seen,
      hardware_age_seconds: hwStatus.hardware_age_seconds,
      status:               !latest ? 'NO DATA RECEIVED' : (hwStatus.is_online ? 'ONLINE' : 'OFFLINE'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/drains/:id/history
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/drains/:id/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const rows  = await db.getHistory(req.params.id, limit);
    res.json(rows.reverse()); // oldest first for charting
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/incidents
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/incidents', async (req, res) => {
  try {
    const incidents = await db.getIncidents();
    const enriched  = await Promise.all(incidents.map(enrichIncident));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/incidents/:id/acknowledge
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/incidents/:id/acknowledge', async (req, res) => {
  try {
    const now     = new Date();
    const updated = await db.updateIncident(req.params.id, {
      status:          'ACKNOWLEDGED',
      updated_at:      now,
      acknowledged_at: now,
      notes:           req.body.notes || null,
    });
    const enriched = await enrichIncident(updated);
    io.emit('incident_update', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/incidents/:id/dispatch
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/incidents/:id/dispatch', async (req, res) => {
  try {
    const now     = new Date();
    const updated = await db.updateIncident(req.params.id, {
      status:       'DISPATCHED',
      updated_at:   now,
      dispatched_at: now,
      notes:        req.body.notes || null,
    });
    const enriched = await enrichIncident(updated);
    io.emit('incident_update', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/incidents/:id/resolve
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/incidents/:id/resolve', async (req, res) => {
  try {
    const now     = new Date();
    const updated = await db.updateIncident(req.params.id, {
      status:      'RESOLVED',
      updated_at:  now,
      resolved_at: now,
      notes:       req.body.notes || null,
    });
    const enriched = await enrichIncident(updated);
    io.emit('incident_update', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/dashboard
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/dashboard', async (req, res) => {
  try {
    res.json(await getActiveDashboardSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/priority-queue
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/priority-queue', async (req, res) => {
  try {
    const latestAll = await db.getAllLatestTelemetry();
    const devices   = await db.getAllDevices();
    const deviceMap = {};

    await Promise.all(devices.map(async d => {
      const auth = await db.getAuthority(d.authority_id);
      deviceMap[d.device_id] = { ...d, authority_name: auth?.name, team_name: auth?.team_name, contact_phone: auth?.contact_phone };
    }));

    const queue = await Promise.all(
      latestAll
        .filter(t => ['HIGH', 'CRITICAL', 'MEDIUM'].includes(t.risk_level))
        .map(async t => {
          const device   = deviceMap[t.device_id] || {};
          const incident = await db.getActiveIncidentForDevice(t.device_id);
          return {
            device_id:                 t.device_id,
            location_name:             device.location_name,
            ward:                      device.ward,
            risk_level:                t.risk_level,
            risk_score:                t.risk_score,
            priority:                  t.risk_level === 'CRITICAL' ? 'P1' : t.risk_level === 'HIGH' ? 'P2' : 'P3',
            predicted_failure_minutes: t.predicted_failure_minutes,
            authority_name:            device.authority_name,
            team_name:                 device.team_name,
            contact_phone:             device.contact_phone,
            incident_status:           incident?.status || null,
            incident_id:               incident?.incident_id || null,
            risk_reasons:              t.risk_reasons || [],
          };
        })
    );

    queue.sort((a, b) => {
      const pOrder = { P1: 0, P2: 1, P3: 2, P4: 3 };
      return (pOrder[a.priority] || 3) - (pOrder[b.priority] || 3);
    });

    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEMO MODE
// ═══════════════════════════════════════════════════════════════════════════
if (DEMO_MODE) {
  const DEMO_SCENARIOS = {
    1: { water_distance_cm: 12.0, rain_value: 900, flow_rate_lpm: 6.5 },
    2: { water_distance_cm: 8.5,  rain_value: 420, flow_rate_lpm: 4.0 },
    3: { water_distance_cm: 3.2,  rain_value: 200, flow_rate_lpm: 0.8 },
    4: { water_distance_cm: 0.7,  rain_value: 150, flow_rate_lpm: 0.3 },
    5: { water_distance_cm: 9.0,  rain_value: 500, flow_rate_lpm: 5.5 },
  };

  app.post('/api/demo/simulate', async (req, res) => {
    try {
      const scenario = parseInt(req.body.scenario, 10);
      const data     = DEMO_SCENARIOS[scenario];
      if (!data) return res.status(400).json({ error: 'Invalid scenario (1–5)' });

      const deviceId = req.body.device_id || 'DRAIN_001';
      const body     = {
        device_id: deviceId,
        water_distance_cm: req.body.water_distance_cm !== undefined ? req.body.water_distance_cm : data.water_distance_cm,
        rain_value: req.body.rain_value !== undefined ? req.body.rain_value : (deviceId === 'DRAIN_002' ? null : data.rain_value),
        flow_rate_lpm: req.body.flow_rate_lpm !== undefined ? req.body.flow_rate_lpm : (deviceId === 'DRAIN_002' ? null : data.flow_rate_lpm),
        wifi_status: 'ONLINE',
      };
      const enriched = await processTelemetry(body, 'demo');
      res.json({ success: true, processed: enriched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  let autoStreamInterval = null;

  app.post('/api/demo/autostream', async (req, res) => {
    const scenario  = parseInt(req.body.scenario, 10) || 1;
    const intervalMs = Math.max(1000, parseInt(req.body.interval_ms, 10) || 3000);

    if (autoStreamInterval) clearInterval(autoStreamInterval);

    autoStreamInterval = setInterval(async () => {
      const data = DEMO_SCENARIOS[scenario];
      if (!data) return;
      const body = { device_id: 'DRAIN_001', ...data, wifi_status: 'ONLINE' };
      try { await processTelemetry(body, 'demo'); } catch (e) { console.error('[Autostream]', e.message); }
    }, intervalMs);

    res.json({ success: true, message: `Auto-streaming scenario ${scenario} every ${intervalMs}ms` });
  });

  app.post('/api/demo/autostream/stop', (req, res) => {
    if (autoStreamInterval) { clearInterval(autoStreamInterval); autoStreamInterval = null; }
    res.json({ success: true, message: 'Auto-stream stopped' });
  });
}

// ─── Health checks ────────────────────────────────────────────────────────────
app.get(['/api/ml/health', '/ml/health'], async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    res.status(response.ok ? 200 : 503).json({
      integration: response.ok ? 'connected' : 'unavailable',
      service_url: ML_SERVICE_URL,
      ...data,
    });
  } catch (err) {
    res.status(503).json({
      integration: 'unavailable',
      service_url: ML_SERVICE_URL,
      error: err.name === 'AbortError' ? 'ML health check timed out' : 'ML service is not reachable',
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.post(['/api/ml/predict', '/ml/predict', '/api/predict'], async (req, res) => {
  try {
    const waterLevelPercent = req.body.water_level_percent ?? req.body.waterLevelPercent;
    const riseRateCmMin     = req.body.rise_rate_cm_min ?? req.body.riseRateCmMin ?? 0;
    const rainValue         = req.body.rain_sensor_value ?? req.body.rainValue ?? req.body.rain_value;

    const result = await requestMlPrediction({ waterLevelPercent, riseRateCmMin, rainValue });
    const statusCode = result.status === 'unavailable' ? 503 : (result.status === 'skipped' ? 400 : 200);
    return res.status(statusCode).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SmartDrain API Server is running',
    frontend_url: 'http://localhost:5173',
    endpoints: {
      health: '/api/health',
      drains: '/api/drains',
      incidents: '/api/incidents',
      authorities: '/api/authorities',
      ml_health: '/api/ml/health',
    },
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), demo_mode: DEMO_MODE });
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  try {
    const summary = await getActiveDashboardSummary();
    socket.emit('dashboard_update', summary);
    socket.emit('device_status', {
      active_devices: getActiveHardwareDeviceIds(),
      timestamp: new Date().toISOString(),
    });
  } catch (e) { /* ignore */ }

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// ─── Periodic hardware presence check (5s) to automatically expire offline devices ────
setInterval(async () => {
  try {
    const activeIds = getActiveHardwareDeviceIds();
    io.emit('device_status', {
      active_devices: activeIds,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    /* ignore */
  }
}, 5000);

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  console.log('\n🚰 SmartDrain Backend starting...');
  try {
    await db.connectDB();
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`\n✅ SmartDrain Backend running on http://localhost:${PORT}`);
    console.log(`   Demo mode: ${DEMO_MODE}`);
    console.log(`   Allowed devices: ${ALLOWED_DEVICES.join(', ')}\n`);
  });
}

start();
