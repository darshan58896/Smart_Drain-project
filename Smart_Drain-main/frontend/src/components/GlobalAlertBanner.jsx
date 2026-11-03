import React, { useState } from 'react'
import { RiskBadge, PriorityBadge } from './Shared'

/**
 * GlobalAlertBanner
 *
 * Prominently displays emergency banners when any drain reaches HIGH or CRITICAL risk.
 * - Evaluates each registered drain's authoritative rule-based risk independently.
 * - Ranks multiple affected drains by severity (CRITICAL > HIGH) then risk score descending.
 * - Displays drain ID, location, severity, water level %, height/distance, and risk score.
 * - Dismissible per incident/reading without muting subsequent new readings.
 * - Stale/offline drains (> 60s without signal) are marked stale rather than claiming active emergency.
 * - Provides immediate navigation to that drain's detail page.
 */
export default function GlobalAlertBanner({
  drains = [],
  latestByDevice = {},
  onSelectDrain,
  onNavigate,
}) {
  const [dismissedKeys, setDismissedKeys] = useState({})

  // Find all drains that currently have HIGH or CRITICAL risk from fresh authoritative telemetry
  const activeAlerts = drains
    .map(drain => {
      const live = latestByDevice[drain.device_id]
      const t = live ? { ...drain.latest_telemetry, ...live } : drain.latest_telemetry
      if (!t) return null

      // Check for staleness (> 30s without valid hardware packet) or OFFLINE sensor
      const isOffline = t.sensor_status === 'OFFLINE'
      const ageMs = t.timestamp ? (Date.now() - new Date(t.timestamp).getTime()) : Infinity
      const isStale = ageMs > 30000
      const isHardware = t.source === 'hardware'

      const riskLevel = t.risk_level || 'UNKNOWN'
      const isEmergency = (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') && !isOffline && !isStale && isHardware

      if (!isEmergency) return null

      const dismissKey = `${drain.device_id}_${t.timestamp}_${riskLevel}`
      if (dismissedKeys[dismissKey]) return null

      const severityWeight = riskLevel === 'CRITICAL' ? 2 : 1
      const riskScore = t.risk_score ?? 0

      return {
        drain,
        telemetry: t,
        riskLevel,
        riskScore,
        priority: t.priority || (riskLevel === 'CRITICAL' ? 'P1' : 'P2'),
        severityWeight,
        dismissKey,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.severityWeight !== a.severityWeight) {
        return b.severityWeight - a.severityWeight
      }
      return b.riskScore - a.riskScore
    })

  if (activeAlerts.length === 0) return null

  const handleDismiss = (dismissKey) => {
    setDismissedKeys(prev => ({ ...prev, [dismissKey]: true }))
  }

  const handleInspect = (deviceId) => {
    if (onSelectDrain) onSelectDrain(deviceId)
    if (onNavigate) onNavigate('drains')
  }

  return (
    <div
      className="global-alerts-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: 16,
      }}
    >
      {activeAlerts.map(({ drain, telemetry: t, riskLevel, riskScore, priority, dismissKey }) => {
        const isCrit = riskLevel === 'CRITICAL'
        const bg = isCrit ? '#FEF2F2' : '#FFFBEB'
        const border = isCrit ? 'var(--risk-critical)' : 'var(--risk-high)'
        const icon = isCrit ? '🚨' : '⚠️'
        const bannerTitle = isCrit ? 'CRITICAL DRAINAGE EMERGENCY' : 'HIGH FLOOD RISK WARNING'

        return (
          <div
            key={dismissKey}
            className="card"
            style={{
              padding: '12px 18px',
              border: `2px solid ${border}`,
              background: bg,
              borderRadius: 12,
              boxShadow: isCrit ? '0 4px 16px rgba(220, 38, 38, 0.18)' : '0 4px 14px rgba(217, 119, 6, 0.14)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              position: 'relative',
              animation: 'fadeIn 0.3s ease-in-out',
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.5px', color: border }}>
                  {bannerTitle}
                </span>
                <span
                  className="mono"
                  style={{
                    background: '#FFFFFF',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 800,
                    border: `1px solid ${border}`,
                    color: border,
                  }}
                >
                  {drain.device_id}
                </span>
                <RiskBadge level={riskLevel} />
                <PriorityBadge priority={priority} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="btn btn-sm"
                  style={{
                    background: border,
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 700,
                    padding: '6px 14px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  onClick={() => handleInspect(drain.device_id)}
                >
                  Inspect {drain.device_id} Details →
                </button>
                <button
                  onClick={() => handleDismiss(dismissKey)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: 20,
                    lineHeight: 1,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                  title="Dismiss this alert"
                  aria-label="Dismiss alert"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Metrics and location detail row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                fontSize: 12,
                color: 'var(--text-primary)',
                background: 'rgba(255, 255, 255, 0.7)',
                padding: '8px 12px',
                borderRadius: 8,
              }}
            >
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Location: </span>
                <strong>{drain.location_name || 'Location not configured'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Water Level: </span>
                <span className="mono" style={{ fontWeight: 800, color: border }}>
                  {t.water_level_percent ?? 0}%
                </span>
                {t.water_level_cm != null && (
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>
                    ({t.water_level_cm.toFixed(1)} cm / {drain.drain_depth_cm || 15} cm)
                  </span>
                )}
              </div>

              {t.water_distance_cm != null && (
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Sensor Distance: </span>
                  <span className="mono">{t.water_distance_cm.toFixed(1)} cm</span>
                </div>
              )}

              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Rule-Based Risk Score: </span>
                <span className="mono" style={{ fontWeight: 800 }}>
                  {riskScore} / 100
                </span>
              </div>

              {t.predicted_failure_minutes != null && (
                <div style={{ color: 'var(--risk-critical)', fontWeight: 700 }}>
                  ⏱ Overflow in ~{t.predicted_failure_minutes} min
                </div>
              )}

              {t.risk_reasons?.[0] && (
                <div style={{ flexBasis: '100%', fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>
                  Primary factor: {t.risk_reasons[0]}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
