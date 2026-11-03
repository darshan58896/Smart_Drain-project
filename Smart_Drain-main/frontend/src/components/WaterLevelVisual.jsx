import React from 'react'

/**
 * WaterLevelVisual
 *
 * Realistic, animated water-level visualization inside a vertical transparent drain/tank illustration.
 *
 * Features:
 * - Rounded transparent acrylic tank with glass sheen
 * - Five-point fixed scale: 0 %, 25 %, 50 %, 75 %, 100 %  (no intermediate labels)
 * - Configurable Critical Level Threshold dashed guideline (default 80 %) shown inside the tank only
 * - Continuous dual SVG wave animation clipped inside the water fill
 * - Rising translucent bubbles within the water body
 * - Smooth CSS transitions when water level changes
 * - Single authoritative percentage derived from telemetry; cm, progress-bar and animation stay in sync
 * - Safe handling of null / waiting states
 */
export default function WaterLevelVisual({
  percent = null,
  waterLevelCm = null,
  drainDepthCm = 15,
  criticalLevelPercent = 80,
  riskLevel = 'UNKNOWN',
  deviceName = null,
  timestamp = null,
  compact = false,
  showRuler = true,
}) {
  // Determine if telemetry is present and valid
  const hasReading = percent !== null && !isNaN(Number(percent))
  const rawPct = hasReading ? Number(percent) : 0
  const clampedPct = Math.min(100, Math.max(0, rawPct))

  const critPct = Number(criticalLevelPercent) || 80

  // Calculate cm display if missing but percent & depth are known
  const displayCm = waterLevelCm !== null && !isNaN(Number(waterLevelCm))
    ? Number(waterLevelCm).toFixed(1)
    : (hasReading && drainDepthCm)
      ? ((clampedPct / 100) * drainDepthCm).toFixed(1)
      : null

  // Determine status label strictly based on authoritative risk from backend
  const upperRisk = (riskLevel || '').toUpperCase()
  let statusText = 'Normal'
  let statusClass = 'normal'

  if (!hasReading || upperRisk === 'UNKNOWN') {
    statusText = 'Standby'
    statusClass = 'standby'
  } else if (upperRisk === 'CRITICAL') {
    statusText = 'Critical'
    statusClass = 'critical'
  } else if (upperRisk === 'HIGH') {
    statusText = 'High Risk'
    statusClass = 'high'
  } else if (upperRisk === 'MEDIUM') {
    statusText = 'Elevated'
    statusClass = 'elevated'
  } else if (upperRisk === 'LOW') {
    statusText = 'Normal'
    statusClass = 'normal'
  } else {
    statusText = clampedPct >= critPct ? 'Critical' : clampedPct >= 60 ? 'Elevated' : 'Normal'
    statusClass = clampedPct >= critPct ? 'critical' : clampedPct >= 60 ? 'elevated' : 'normal'
  }

  // Fixed five-point scale — exactly 0 %, 25 %, 50 %, 75 %, 100 %.
  // The critical threshold marker lives inside the tank only (tank-threshold-line); it is NOT a scale label.
  const RULER_TICKS = [
    { pct: 100, label: '100%', isMajor: true },
    { pct: 75,  label: '75%',  isMajor: true },
    { pct: 50,  label: '50%',  isMajor: true },
    { pct: 25,  label: '25%',  isMajor: true },
    { pct: 0,   label: '0%',   isMajor: true },
  ]

  return (
    <div
      className={`water-visual-container ${compact ? 'compact' : ''} status-${statusClass}`}
      role="region"
      aria-label={`Water level visualization: ${hasReading ? `${clampedPct}% (${displayCm ? `${displayCm} cm` : ''})` : 'Waiting for telemetry'}`}
    >
      <div className="water-visual-body">
        {/* Left / Center: Vertical Tank with Precise Scale */}
        <div className="tank-wrapper">
          {/* Measurement Ruler (Scale) positioned via absolute percentage coordinates */}
          {showRuler && (
            <div className="tank-ruler-container" aria-hidden="true">
              {RULER_TICKS.map(tick => (
                <div
                  key={tick.pct}
                  className={`ruler-mark ${tick.isMajor ? 'major' : ''} ${tick.isCritical ? 'critical' : ''} ${tick.isSub ? 'sub' : ''}`}
                  style={{ bottom: `${tick.pct}%` }}
                >
                  {(tick.label || tick.showLabel) && (
                    <span className={`ruler-label ${tick.isCritical ? 'critical-label' : ''}`}>
                      {tick.label}
                    </span>
                  )}
                  <span className={`ruler-tick ${tick.isMajor ? 'major-tick' : tick.isCritical ? 'critical-tick' : tick.isSub ? 'sub-tick' : 'regular-tick'}`} />
                </div>
              ))}
            </div>
          )}

          {/* Transparent Acrylic Tank */}
          <div className={`tank-glass ${statusClass}`}>
            {/* Critical threshold guide line across tank */}
            <div className="tank-threshold-line" style={{ bottom: `${critPct}%` }}>
              <span className="threshold-tag">CRITICAL {critPct}%</span>
            </div>

            {/* Glass Sheen overlay */}
            <div className="tank-glass-sheen" aria-hidden="true" />

            {/* Waiting for telemetry indicator */}
            {!hasReading && (
              <div className="tank-waiting-overlay">
                <div className="waiting-radar" />
                <span className="waiting-text">Waiting for telemetry</span>
                <span className="waiting-subtext">Sensors online</span>
              </div>
            )}

            {/* Animated Water Fill — exactly clampedPct% of tank interior height, anchored to bottom */}
            <div
              className="water-fill"
              style={{
                height: `${hasReading ? clampedPct : 0}%`,
              }}
            >
              {/* Water body colour gradient fills the entire water-fill div */}
              <div className="water-body-gradient" />

              {/* Sharp Surface Line sits at the very top of the fill (water surface) */}
              {hasReading && clampedPct > 0 && (
                <div className="water-surface-line" />
              )}

              {/*
                Wave animation: centred on the water surface (top of fill).
                height: 12px total; offset top by -6px so the crest sits exactly
                on the surface line. overflow:hidden on water-fill clips it.
              */}
              {hasReading && clampedPct > 0 && (
                <div className="wave-wrapper" aria-hidden="true">
                  <svg
                    className="wave-svg wave-back"
                    viewBox="0 0 1200 120"
                    preserveAspectRatio="none"
                  >
                    <path d="M0,40 C150,90 350,0 500,50 C650,100 900,10 1200,60 L1200,120 L0,120 Z" />
                  </svg>
                  <svg
                    className="wave-svg wave-front"
                    viewBox="0 0 1200 120"
                    preserveAspectRatio="none"
                  >
                    <path d="M0,50 C200,90 400,20 600,65 C800,100 1000,20 1200,50 L1200,120 L0,120 Z" />
                  </svg>
                </div>
              )}

              {/* Rising Bubbles inside the water body */}
              {hasReading && clampedPct > 8 && (
                <div className="bubbles-container" aria-hidden="true">
                  <div className="bubble bubble-1" />
                  <div className="bubble bubble-2" />
                  <div className="bubble bubble-3" />
                  <div className="bubble bubble-4" />
                  <div className="bubble bubble-5" />
                </div>
              )}
            </div>

            <div className="tank-base" />
          </div>
        </div>

        {/* Right / Content Area: Key Metrics and Telemetry Info */}
        <div className="water-metrics">
          <div className="water-metric-header">
            <span className="water-metric-title">Water Level</span>
            <span className={`water-status-pill status-${statusClass}`}>
              <span className="status-dot" />
              {statusText}
            </span>
          </div>

          <div className="water-reading-primary">
            <span className="water-percent-number">
              {hasReading ? clampedPct : '—'}
            </span>
            <span className="water-percent-unit">%</span>
          </div>

          <div className="water-reading-secondary">
            <span className="cm-label">Height:</span>
            <span className="cm-value">
              {displayCm ? `${displayCm} cm` : '—'}
            </span>
            {drainDepthCm && (
              <span className="cm-depth">/ {drainDepthCm} cm depth</span>
            )}
          </div>

          <div className="water-meter-bar">
            <div
              className={`water-meter-fill status-${statusClass}`}
              style={{ width: `${hasReading ? clampedPct : 0}%` }}
            />
          </div>

          <div className="water-metric-meta">
            {deviceName && (
              <div className="meta-row">
                <span className="meta-label">Drain Device:</span>
                <span className="meta-val mono">{deviceName}</span>
              </div>
            )}
            <div className="meta-row">
              <span className="meta-label">Telemetry Timestamp:</span>
              <span className="meta-val mono">
                {hasReading && timestamp
                  ? new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : hasReading
                    ? 'Active'
                    : 'Awaiting signal'}
              </span>
            </div>
            {clampedPct >= critPct && (
              <div className="water-alert-chip critical">
                ⚠️ Critical Capacity Exceeded
              </div>
            )}
            {clampedPct >= 60 && clampedPct < critPct && (
              <div className="water-alert-chip elevated">
                ⚡ Elevated Water Level
              </div>
            )}
            {upperRisk === 'LOW' && (
              <div className="water-alert-chip normal">
                ✓ Drainage Conditions Normal
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
