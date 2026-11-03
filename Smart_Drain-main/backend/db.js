/**
 * SmartDrain Database Layer — MongoDB via Mongoose
 * Replaces better-sqlite3 to avoid native C++ build requirements.
 */

const crypto   = require('crypto');
const mongoose = require('mongoose');

const AUTH_SECRET = process.env.AUTH_SECRET || 'smartdrain_secure_authority_secret_key_2026';

// ─── Schemas ────────────────────────────────────────────────────────────────

const AuthoritySchema = new mongoose.Schema({
  authority_id:  { type: String, required: true, unique: true },
  name:          { type: String, required: true },
  team_name:     String,
  contact_phone: String,
  contact_email: String,
  ward:          String,
});

const DeviceSchema = new mongoose.Schema({
  device_id:              { type: String, required: true, unique: true },
  name:                   { type: String, required: true },
  location_name:          { type: String, required: true },
  street_landmark:        { type: String, default: null },
  ward:                   { type: String, default: null },
  latitude:               { type: Number, default: null },
  longitude:              { type: Number, default: null },
  authority_id:           { type: String, default: 'AUTH_001' },
  installation_notes:     { type: String, default: null },
  drain_depth_cm:         { type: Number, default: 15.0 },
  critical_level_percent: { type: Number, default: 80.0 },
  created_at:             { type: Date, default: Date.now },
  updated_at:             { type: Date, default: Date.now },
});

const TelemetrySchema = new mongoose.Schema({
  device_id:               { type: String, required: true, index: true },
  timestamp:               { type: Date,   required: true, index: true },
  water_distance_cm:       Number,
  water_level_cm:          Number,
  water_level_percent:     Number,
  rain_value:              Number,
  rain_intensity:          String,
  flow_rate_lpm:           Number,
  water_rise_rate_cm_min:  Number,
  risk_level:              String,
  risk_score:              Number,
  predicted_failure_minutes: Number,
  risk_reasons:            [String],
  sensor_status:           String,
  wifi_status:             String,
  source:                  { type: String, default: 'hardware' },
});

// Compound index for fast device+time queries
TelemetrySchema.index({ device_id: 1, timestamp: -1 });

const IncidentSchema = new mongoose.Schema({
  incident_id:     { type: String, required: true, unique: true },
  device_id:       { type: String, required: true, index: true },
  detected_at:     { type: Date,   required: true },
  updated_at:      Date,
  risk_level:      String,
  risk_score:      Number,
  risk_reasons:    [String],
  priority:        String,
  status:          { type: String, default: 'DETECTED' },
  authority_id:    String,
  notes:           String,
  acknowledged_at: Date,
  dispatched_at:   Date,
  resolved_at:     Date,
});

IncidentSchema.index({ device_id: 1, status: 1 });

const AssetAuditSchema = new mongoose.Schema({
  action:       { type: String, required: true }, // 'REGISTER_ASSET', 'UPDATE_LOCATION'
  device_id:    { type: String, required: true, index: true },
  performed_by: { type: String, required: true },
  timestamp:    { type: Date,   default: Date.now, index: true },
  changes:      mongoose.Schema.Types.Mixed,
  notes:        String,
});

const AuthorityUserSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  salt:         { type: String, required: true },
  role:         { type: String, default: 'authority_admin' },
  name:         String,
  authority_id: { type: String, default: 'AUTH_001' },
  created_at:   { type: Date,   default: Date.now },
});

// ─── Models ─────────────────────────────────────────────────────────────────

const Authority     = mongoose.model('Authority',     AuthoritySchema);
const Device        = mongoose.model('Device',        DeviceSchema);
const Telemetry     = mongoose.model('Telemetry',     TelemetrySchema);
const Incident      = mongoose.model('Incident',      IncidentSchema);
const AssetAudit    = mongoose.model('AssetAudit',    AssetAuditSchema);
const AuthorityUser = mongoose.model('AuthorityUser', AuthorityUserSchema);

// ─── Seed Function ───────────────────────────────────────────────────────────

async function seedDatabase() {
  // Seed authorities
  await Authority.findOneAndUpdate(
    { authority_id: 'AUTH_001' },
    {
      authority_id:  'AUTH_001',
      name:          'Municipal Drainage Department',
      team_name:     'Ward 42 Drainage Team',
      contact_phone: '+91-80-2222-3333',
      contact_email: 'drainage@municipal.gov.in',
      ward:          'Ward 42',
    },
    { upsert: true, new: true }
  );

  await Authority.findOneAndUpdate(
    { authority_id: 'AUTH_002' },
    {
      authority_id:  'AUTH_002',
      name:          'BBMP Storm Water Drain Division',
      team_name:     'Zone B Maintenance Team',
      contact_phone: '+91-80-2222-4444',
      contact_email: 'swd@bbmp.gov.in',
      ward:          'Zone B',
    },
    { upsert: true, new: true }
  );

  // Seed devices — DRAIN_001 is the only pre-registered sensor
  await Device.findOneAndUpdate(
    { device_id: 'DRAIN_001' },
    {
      device_id:              'DRAIN_001',
      name:                   'NodeMCU 1 — BMSIT Campus Main Gate',
      location_name:          'BMSIT Campus Main Gate, Yelahanka, Bengaluru',
      latitude:               13.1276,
      longitude:              77.5696,
      ward:                   'Ward 42',
      authority_id:           'AUTH_001',
      drain_depth_cm:         15.0,
      critical_level_percent: 80.0,
    },
    { upsert: true, new: true }
  );

  // Remove unregistered DRAIN_002 from active Device registry unless explicitly registered by an authority user
  const drain002Registered = await AssetAudit.findOne({ device_id: 'DRAIN_002', action: 'REGISTER_ASSET' });
  if (!drain002Registered) {
    await Device.deleteOne({ device_id: 'DRAIN_002' });
  }

  // Seed default authority admin user if none exists
  const adminExists = await AuthorityUser.findOne({ username: 'authority_admin' });
  if (!adminExists) {
    const salt = crypto.randomBytes(16).toString('hex');
    const initialPassword = process.env.AUTHORITY_ADMIN_PASSWORD || 'Authority@2026';
    const passwordHash = crypto.pbkdf2Sync(initialPassword, salt, 10000, 64, 'sha512').toString('hex');
    await AuthorityUser.create({
      username: 'authority_admin',
      passwordHash,
      salt,
      role: 'authority_admin',
      name: 'Municipal Drainage Administrator',
      authority_id: 'AUTH_001',
    });
    console.log('[DB] Seeded default authority admin user.');
  }

  console.log('[DB] Seed data verified (DRAIN_001 + Authority Admin).');
}

// ─── Connect ─────────────────────────────────────────────────────────────────

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in .env');

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log('[DB] Connected to MongoDB');
  await seedDatabase();
}

// ─── Helper Query Functions ──────────────────────────────────────────────────

async function getAllDevices() {
  return Device.find().lean();
}

async function getDevice(device_id) {
  return Device.findOne({ device_id }).lean();
}

async function getAuthority(authority_id) {
  return Authority.findOne({ authority_id }).lean();
}

async function insertTelemetry(data) {
  const doc = new Telemetry(data);
  return doc.save();
}

async function getLatestTelemetry(device_id) {
  return Telemetry.findOne({ device_id }).sort({ timestamp: -1 }).lean();
}

async function getHistory(device_id, limit = 100) {
  return Telemetry
    .find({ device_id })
    .sort({ timestamp: -1 })
    .limit(Math.min(limit, 500))
    .lean();
}

async function getRecentTelemetryForRise(device_id) {
  return Telemetry
    .find({ device_id, water_level_cm: { $ne: null } })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();
}

async function getAllLatestTelemetry() {
  const registered = await Device.find().distinct('device_id');
  // Get latest reading per registered device using aggregation
  return Telemetry.aggregate([
    { $match: { device_id: { $in: registered } } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$device_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
  ]);
}

async function insertIncident(data) {
  // Insert only if no active incident for this device
  const existing = await getActiveIncidentForDevice(data.device_id);
  if (existing) return null;
  const doc = new Incident(data);
  return doc.save();
}

async function updateIncident(incident_id, update) {
  return Incident.findOneAndUpdate(
    { incident_id },
    { $set: update },
    { new: true }
  ).lean();
}

async function getIncidents(limit = 100) {
  const registered = await Device.find().distinct('device_id');
  return Incident.find({ device_id: { $in: registered } }).sort({ detected_at: -1 }).limit(limit).lean();
}

async function getActiveIncidentForDevice(device_id) {
  return Incident.findOne({
    device_id,
    status: { $nin: ['RESOLVED'] },
  }).sort({ detected_at: -1 }).lean();
}

async function getIncidentById(incident_id) {
  return Incident.findOne({ incident_id }).lean();
}

async function getDashboardCounts() {
  const latest = await getAllLatestTelemetry();
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNKNOWN: 0, total: 0 };
  latest.forEach(t => {
    counts.total++;
    counts[t.risk_level] = (counts[t.risk_level] || 0) + 1;
  });
  const registered = await Device.find().distinct('device_id');
  const activeIncidents = await Incident.countDocuments({
    device_id: { $in: registered },
    status: { $nin: ['RESOLVED'] },
  });
  const sensorWarnings  = latest.filter(t => t.sensor_status !== 'OK').length;

  return {
    total_drains:     counts.total,
    critical_drains:  counts.CRITICAL || 0,
    high_drains:      counts.HIGH || 0,
    medium_drains:    counts.MEDIUM || 0,
    low_drains:       counts.LOW || 0,
    sensor_warnings:  sensorWarnings,
    active_incidents: activeIncidents,
  };
}

async function createDevice(deviceData) {
  const doc = new Device({
    ...deviceData,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return doc.save();
}

async function updateDevice(device_id, update) {
  return Device.findOneAndUpdate(
    { device_id },
    { $set: { ...update, updated_at: new Date() } },
    { new: true }
  ).lean();
}

async function insertAuditLog(auditData) {
  const doc = new AssetAudit({
    ...auditData,
    timestamp: new Date(),
  });
  return doc.save();
}

async function getAuditLogs(limit = 100) {
  return AssetAudit.find().sort({ timestamp: -1 }).limit(Math.min(limit, 500)).lean();
}

async function verifyAuthorityCredentials(username, password) {
  if (!username || !password) return null;
  const user = await AuthorityUser.findOne({ username }).lean();
  if (!user) return null;
  const computedHash = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha512').toString('hex');
  if (computedHash !== user.passwordHash) return null;
  return {
    username: user.username,
    role: user.role,
    name: user.name,
    authority_id: user.authority_id,
  };
}

async function getAuthorityUser(username) {
  return AuthorityUser.findOne({ username }, { passwordHash: 0, salt: 0 }).lean();
}

function generateToken(user) {
  const payload = {
    username: user.username,
    role: user.role,
    name: user.name,
    authority_id: user.authority_id,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', AUTH_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = {
  connectDB,
  getAllDevices,
  getDevice,
  createDevice,
  updateDevice,
  getAuthority,
  insertTelemetry,
  getLatestTelemetry,
  getHistory,
  getRecentTelemetryForRise,
  getAllLatestTelemetry,
  insertIncident,
  updateIncident,
  getIncidents,
  getActiveIncidentForDevice,
  getIncidentById,
  getDashboardCounts,
  insertAuditLog,
  getAuditLogs,
  verifyAuthorityCredentials,
  getAuthorityUser,
  generateToken,
  verifyToken,
};
