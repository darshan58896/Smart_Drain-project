/**
 * SmartDrain Risk Engine
 * Rule-based, transparent, multi-signal risk assessment.
 * 
 * Inputs: telemetry payload + device config
 * Outputs: risk_level, risk_score, risk_reasons, priority, predicted_failure_minutes
 */

// ─── Rain Intensity Classification ─────────────────────────────────────────
// Rain sensor AO: higher analog value = drier (less conductance on wet pad)
// Typical: dry ~1023, wet ~200-400, very wet ~0-200
// These are calibratable thresholds.
const RAIN_THRESHOLDS = {
  NONE:   800,   // > 800 = dry
  LIGHT:  600,   // 600–800 = light
  MODERATE: 350, // 350–600 = moderate
  HEAVY:  0,     // < 350 = heavy
};

function classifyRainIntensity(rainValue) {
  if (rainValue === null || rainValue === undefined) return 'UNKNOWN';
  if (rainValue > RAIN_THRESHOLDS.NONE)   return 'NONE';
  if (rainValue > RAIN_THRESHOLDS.LIGHT)  return 'LIGHT';
  if (rainValue > RAIN_THRESHOLDS.MODERATE) return 'MODERATE';
  return 'HEAVY';
}

// ─── Sensor Health Assessment ───────────────────────────────────────────────
function assessSensorHealth({ waterDistanceCm, drainDepthCm, rainValue, flowRateLpm, prevDistance }) {
  // US-100 invalid read: returns 0, negative, or > 400 cm (max range)
  if (waterDistanceCm === null || waterDistanceCm === undefined) {
    return { status: 'OFFLINE', detail: 'US-100: No reading received' };
  }
  if (waterDistanceCm <= 0 || waterDistanceCm > 400) {
    return { status: 'INVALID_READING', detail: `US-100: Out-of-range reading (${waterDistanceCm} cm)` };
  }
  // Physically implausible jump: > 80% of drain depth in one cycle
  if (prevDistance !== null && prevDistance !== undefined) {
    const jump = Math.abs(waterDistanceCm - prevDistance);
    if (jump > drainDepthCm * 0.8) {
      return { status: 'POSSIBLE_OBSTRUCTION', detail: `US-100: Sudden jump of ${jump.toFixed(1)} cm — possible obstruction or sensor fault` };
    }
  }
  // Rain sensor fault: value outside ADC range (0–1023)
  if (rainValue !== null && rainValue !== undefined && (rainValue < 0 || rainValue > 1023)) {
    return { status: 'WARNING', detail: 'Rain sensor: Value out of ADC range' };
  }
  // Flow sensor: negative flow is invalid
  if (flowRateLpm !== null && flowRateLpm !== undefined && flowRateLpm < 0) {
    return { status: 'WARNING', detail: 'Flow sensor: Negative flow rate — possible fault' };
  }
  return { status: 'OK', detail: null };
}

// ─── Core Risk Engine ────────────────────────────────────────────────────────
/**
 * @param {object} params
 * @param {number} params.waterLevelCm       - Current water level above drain floor
 * @param {number} params.drainDepthCm       - Configured drain depth
 * @param {number} params.criticalLevelPct   - Critical level threshold (default 80%)
 * @param {string} params.rainIntensity      - NONE | LIGHT | MODERATE | HEAVY
 * @param {number} params.flowRateLpm        - Current outflow rate
 * @param {number} params.riseRateCmMin      - Rate of water level rise (cm/min)
 * @param {string} params.sensorStatus       - From assessSensorHealth
 * @returns {{ riskLevel, riskScore, riskReasons, priority, predictedFailureMinutes }}
 */
function calculateRisk({
  waterLevelCm,
  drainDepthCm,
  criticalLevelPct = 80,
  rainIntensity,
  flowRateLpm,
  riseRateCmMin,
  sensorStatus,
}) {
  // If sensor is faulty, do not calculate failure risk — return SENSOR_FAULT state
  if (sensorStatus === 'INVALID_READING' || sensorStatus === 'OFFLINE') {
    return {
      riskLevel: 'UNKNOWN',
      riskScore: 0,
      riskReasons: ['Sensor is offline or reporting invalid readings — risk cannot be assessed'],
      priority: 'P4',
      predictedFailureMinutes: null,
    };
  }

  const levelPct = drainDepthCm > 0 ? (waterLevelCm / drainDepthCm) * 100 : 0;
  const criticalLevelCm = (criticalLevelPct / 100) * drainDepthCm;
  const reasons = [];
  let score = 0;

  // ── Factor 1: Absolute water level ────────────────────────────────────────
  if (levelPct >= 95) {
    score += 50;
    reasons.push(`Water level at critical capacity (${levelPct.toFixed(0)}% of drain capacity)`);
  } else if (levelPct >= 90) {
    score += 40;
    reasons.push(`Water level critically high (${levelPct.toFixed(0)}% of drain capacity)`);
  } else if (levelPct >= criticalLevelPct) {
    score += 30;
    reasons.push(`Water level approaching critical threshold (${levelPct.toFixed(0)}% of drain capacity)`);
  } else if (levelPct >= 60) {
    score += 15;
    reasons.push(`Water level elevated (${levelPct.toFixed(0)}% of drain capacity)`);
  } else if (levelPct >= 40) {
    score += 5;
  }

  // ── Factor 2: Rise rate ───────────────────────────────────────────────────
  if (riseRateCmMin !== null && riseRateCmMin !== undefined) {
    if (riseRateCmMin > 0.8) {
      score += 30;
      reasons.push(`Water level rising rapidly (${riseRateCmMin.toFixed(2)} cm/min)`);
    } else if (riseRateCmMin > 0.3) {
      score += 15;
      reasons.push(`Water level rising steadily (${riseRateCmMin.toFixed(2)} cm/min)`);
    } else if (riseRateCmMin > 0.05) {
      score += 5;
      reasons.push(`Slow water level rise detected (${riseRateCmMin.toFixed(2)} cm/min)`);
    }
  }

  // ── Factor 3: Rain intensity ──────────────────────────────────────────────
  if (rainIntensity === 'HEAVY') {
    score += 20;
    reasons.push('Heavy rainfall detected — high inflow expected');
  } else if (rainIntensity === 'MODERATE') {
    score += 10;
    reasons.push('Moderate rainfall detected');
  } else if (rainIntensity === 'LIGHT') {
    score += 3;
  }

  // ── Factor 4: Outflow condition ───────────────────────────────────────────
  if (flowRateLpm !== null && flowRateLpm !== undefined) {
    if (flowRateLpm < 0.5 && levelPct > 40) {
      score += 20;
      reasons.push(`Outflow very low (${flowRateLpm.toFixed(1)} L/min) while water level is elevated — possible blockage`);
    } else if (flowRateLpm < 2.0 && rainIntensity === 'HEAVY') {
      score += 10;
      reasons.push(`Outflow insufficient (${flowRateLpm.toFixed(1)} L/min) for current rainfall`);
    }
  }

  // ── Factor 5: Sensor obstruction penalty (softer — not drainage failure) ──
  if (sensorStatus === 'POSSIBLE_OBSTRUCTION') {
    score = Math.min(score, 40); // Cap risk; do not escalate past MEDIUM due to sensor alone
    reasons.push('Sensor readings show possible obstruction — readings may be unreliable');
  }

  // ── Clamp score ───────────────────────────────────────────────────────────
  score = Math.min(100, Math.max(0, score));

  // ── Risk Level ────────────────────────────────────────────────────────────
  let riskLevel;
  if (score >= 75)      riskLevel = 'CRITICAL';
  else if (score >= 50) riskLevel = 'HIGH';
  else if (score >= 25) riskLevel = 'MEDIUM';
  else                  riskLevel = 'LOW';

  // ── Priority ──────────────────────────────────────────────────────────────
  const priorityMap = { CRITICAL: 'P1', HIGH: 'P2', MEDIUM: 'P3', LOW: 'P4', UNKNOWN: 'P4' };
  const priority = priorityMap[riskLevel];

  // ── Predicted failure time ────────────────────────────────────────────────
  let predictedFailureMinutes = null;
  if (
    riseRateCmMin !== null &&
    riseRateCmMin !== undefined &&
    riseRateCmMin > 0.05 &&
    waterLevelCm !== null &&
    criticalLevelCm > waterLevelCm
  ) {
    predictedFailureMinutes = Math.round((criticalLevelCm - waterLevelCm) / riseRateCmMin);
    // Only report if meaningfully soon (within 2 hours)
    if (predictedFailureMinutes > 120) predictedFailureMinutes = null;
  }

  if (reasons.length === 0) {
    reasons.push('Drainage conditions normal');
  }

  return { riskLevel, riskScore: score, riskReasons: reasons, priority, predictedFailureMinutes };
}

// ─── Rise Rate Calculator ────────────────────────────────────────────────────
/**
 * Given an array of { water_level_cm, timestamp } records (newest first),
 * return the average rise rate in cm/min over the window.
 */
function calculateRiseRate(recentReadings) {
  if (!recentReadings || recentReadings.length < 2) return null;

  // Use oldest and newest for overall trend
  const newest = recentReadings[0];
  const oldest = recentReadings[recentReadings.length - 1];

  const deltaLevel = newest.water_level_cm - oldest.water_level_cm;
  const deltaMs = new Date(newest.timestamp) - new Date(oldest.timestamp);
  const deltaMin = deltaMs / 60000;

  if (deltaMin < 0.1) return null; // Too short a window
  return deltaLevel / deltaMin; // Negative = falling
}

// ─── Water Level from Distance ───────────────────────────────────────────────
/**
 * US-100 is mounted ABOVE the water and measures distance to water surface.
 * water_level_cm = drain_depth_cm - water_distance_cm
 * (distance reading represents air gap above water)
 */
function waterLevelFromDistance(distanceCm, drainDepthCm) {
  const level = drainDepthCm - distanceCm;
  return Math.max(0, Math.min(drainDepthCm, level)); // clamp to [0, depth]
}

module.exports = {
  classifyRainIntensity,
  assessSensorHealth,
  calculateRisk,
  calculateRiseRate,
  waterLevelFromDistance,
};
