import React, { useEffect, useState, useMemo } from 'react'
import { api } from '../api'
import { RiskBadge, PriorityBadge, SensorStatusBadge, Spinner, EmptyState, RiskReasons, EtaWarning } from '../components/Shared'
import { MultiChart } from '../components/Charts'
import WaterLevelVisual from '../components/WaterLevelVisual'

export default function DashboardPage({
  dashboardData,
  lastTelemetry,
  latestByDevice = {},
  connected,
  refreshKey,
  onNavigate,
  selectedDrainId: propSelectedDrainId,
  setSelectedDrainId: propSetSelectedDrainId,
  drains: propDrains,
  activeDrains: propActiveDrains = [],
}) {
  const [internalSelectedDrainId, setInternalSelectedDrainId] = useState('DRAIN_001')
  const selectedDrainId = propSelectedDrainId || internalSelectedDrainId
  const setSelectedDrainId = propSetSelectedDrainId || setInternalSelectedDrainId

  const [drains, setDrains]   = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const effectiveDrains = (propDrains && propDrains.length > 0) ? propDrains : drains
  const activeList = propActiveDrains || []

  const fetchData = () => {
    return Promise.all([
      api.getDrains().catch(() => []),
      api.getHistory(selectedDrainId, 60).catch(() => []),
    ])
      .then(([d, h]) => {
        if (Array.isArray(d)) setDrains(d)
        if (Array.isArray(h)) setHistory(h)
      })
      .finally(() => setLoading(false))
  }

  // Initial load and manual refresh
  useEffect(() => {
    fetchData()
  }, [selectedDrainId, refreshKey])

  // Real-time update when dashboardData arrives via Socket.IO
  useEffect(() => {
    if (!dashboardData) return
    api.getDrains().then(d => { if (Array.isArray(d)) setDrains(d) }).catch(() => {})
    api.getHistory(selectedDrainId, 60).then(h => { if (Array.isArray(h)) setHistory(h) }).catch(() => {})
  }, [dashboardData, selectedDrainId])

  // Update live telemetry map when any device broadcasts
  useEffect(() => {
    if (!lastTelemetry) return
    // Update the drains list so table & cards reflect latest values
    setDrains(prev =>
      prev.map(dr =>
        dr.device_id === lastTelemetry.device_id
          ? { ...dr, latest_telemetry: { ...dr.latest_telemetry, ...lastTelemetry } }
          : dr
      )
    )
    // Only append to history chart for the selected drain
    if (lastTelemetry.device_id === selectedDrainId) {
      setHistory(prev => {
        const next = [...prev, lastTelemetry]
        return next.slice(-60)
      })
    }
  }, [lastTelemetry, selectedDrainId])

  const d = dashboardData || {}

  // Selected drain data: only select from active hardware list if available
  const selectedDrain = useMemo(() => {
    if (activeList.length === 0) return null
    return activeList.find(dr => dr.device_id === selectedDrainId) || activeList[0] || null
  }, [activeList, selectedDrainId])

  // Telemetry for the selected drain.
  const activeTelemetry = useMemo(() => {
    if (!selectedDrain) return null
    const liveForDevice = latestByDevice[selectedDrain.device_id]
    if (liveForDevice) {
      return { ...selectedDrain.latest_telemetry, ...liveForDevice }
    }
    if (lastTelemetry && lastTelemetry.device_id === selectedDrain.device_id) {
      return { ...selectedDrain.latest_telemetry, ...lastTelemetry }
    }
    return selectedDrain.latest_telemetry || null
  }, [selectedDrain, lastTelemetry, latestByDevice])

  // Summary counts strictly using actual active hardware counts
  const totalDrainsCount = activeList.length
  const onlineDevicesCount = activeList.length
  const highCriticalCount = activeList.filter(dr => {
    const live = latestByDevice[dr.device_id]
    const t = live ? { ...dr.latest_telemetry, ...live } : dr.latest_telemetry
    return t && (t.risk_level === 'HIGH' || t.risk_level === 'CRITICAL')
  }).length
  const activeIncidentsCount = d.active_incidents ?? 0

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spinner />
      </div>
    )
  }

  const riskLevel = activeTelemetry?.risk_level || 'UNKNOWN'
  const riskScore = activeTelemetry?.risk_score ?? 0
  const priority = riskLevel === 'CRITICAL' ? 'P1' : riskLevel === 'HIGH' ? 'P2' : riskLevel === 'MEDIUM' ? 'P3' : 'P4'

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Command Dashboard</h1>
          <p className="page-subtitle">Real-time municipal drainage monitoring & multi-drain telemetry — BMSIT Prototype</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeList.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', padding: '6px 12px', borderRadius: 10, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Active Drain:</span>
              <select
                value={selectedDrain?.device_id || activeList[0]?.device_id}
                onChange={e => setSelectedDrainId(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 700,
                  color: 'var(--primary-blue)',
                  fontSize: 13,
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {activeList.map(dr => (
                  <option key={dr.device_id} value={dr.device_id}>
                    {dr.device_id} ({dr.location_name})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F8FAFC', padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
              <span className="pulse-dot" style={{ background: '#94A3B8', width: 6, height: 6 }} />
              <span>Waiting for hardware connection</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards — Authoritative actual backend values */}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Active Drains</span>
          <span className="stat-value">{totalDrainsCount}</span>
          <span className="stat-icon">🚰</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Online Hardware</span>
          <span className="stat-value" style={{ color: activeList.length > 0 ? 'var(--status-ok)' : 'var(--text-muted)' }}>
            {onlineDevicesCount}
          </span>
          <span className="stat-icon">📡</span>
        </div>

        <div className={`stat-card ${highCriticalCount > 0 ? 'critical' : ''}`}>
          <span className="stat-label">High / Critical Risk</span>
          <span className={`stat-value ${highCriticalCount > 0 ? 'critical' : ''}`}>
            {highCriticalCount}
          </span>
          <span className="stat-icon">⚠️</span>
        </div>

        <div className={`stat-card ${activeIncidentsCount > 0 ? 'critical' : ''}`}>
          <span className="stat-label">Active Incidents</span>
          <span className={`stat-value ${activeIncidentsCount > 0 ? 'critical' : ''}`}>
            {activeIncidentsCount}
          </span>
          <span className="stat-icon">🚨</span>
        </div>
      </div>

      {/* ── Multi-Drain Fleet Status Cards Grid ──────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="card-title">Monitored Drain Fleet — Real-Time Status</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {activeList.length} active {activeList.length === 1 ? 'node' : 'nodes'}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {activeList.length > 0 ? 'Click any card to select for in-depth analysis' : 'No active hardware nodes'}
          </span>
        </div>

        {activeList.length === 0 ? (
          <div className="card" style={{ padding: '36px 24px', textAlign: 'center', background: '#F8FAFC', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📡</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Waiting for hardware connection
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
              No active NodeMCU devices have sent telemetry in the last 30 seconds. Devices will automatically appear here once physically connected and broadcasting.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
            {activeList.map(drain => {
              const live = latestByDevice[drain.device_id]
              const t = live ? { ...drain.latest_telemetry, ...live } : drain.latest_telemetry
              const isSelected = drain.device_id === selectedDrainId

              // Check connection / staleness
              const ageMs = t?.timestamp ? (Date.now() - new Date(t.timestamp).getTime()) : Infinity
              const isStale = ageMs > 30000 && t?.sensor_status !== 'OFFLINE'
              const isOffline = !t || t.sensor_status === 'OFFLINE'

              const drRisk = t?.risk_level || 'UNKNOWN'
              const drScore = t?.risk_score ?? 0
              const drPriority = t?.priority || (drRisk === 'CRITICAL' ? 'P1' : drRisk === 'HIGH' ? 'P2' : drRisk === 'MEDIUM' ? 'P3' : 'P4')

              const severityClass = isOffline
                ? 'device-offline'
                : isStale
                  ? 'device-stale'
                  : drRisk === 'CRITICAL'
                    ? 'severity-critical'
                    : drRisk === 'HIGH'
                      ? 'severity-high'
                        : drRisk === 'MEDIUM'
                        ? 'severity-medium'
                        : 'severity-low'

              const riskIcon = drRisk === 'CRITICAL' ? '🚨' : drRisk === 'HIGH' ? '⚠️' : drRisk === 'MEDIUM' ? '⚡' : '✓'

              return (
                <div
                  key={drain.device_id}
                  className={`drain-status-card ${severityClass} ${isSelected ? 'active-selected' : ''}`}
                  onClick={() => setSelectedDrainId(drain.device_id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Card Top: ID, Location & Device Connectivity */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          className="mono"
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: isSelected ? 'var(--primary-blue)' : 'var(--text-primary)',
                            background: isSelected ? '#EFF6FF' : '#F1F5F9',
                            padding: '3px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                          }}
                        >
                          {drain.device_id}
                        </span>
                        {isSelected && (
                          <span style={{ fontSize: 10, background: '#2563EB', color: '#FFFFFF', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                            ACTIVE
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isOffline ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            📡 OFFLINE
                          </span>
                        ) : isStale ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', gap: 4 }}>
                            ⏳ STALE (&gt;30s)
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-ok)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="pulse-dot" style={{ width: 6, height: 6 }} /> ONLINE
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {drain.name || drain.device_id}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
                      {drain.location_name || 'Location not configured'}
                    </div>

                    {/* Source label badge */}
                    {t?.source === 'hardware' && (
                      <div style={{ marginBottom: 10 }}>
                        <span style={{
                          background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0',
                          borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
                          LIVE HARDWARE
                        </span>
                      </div>
                    )}

                    {/* Visual + Key Telemetry Split */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      {/* Compact Animated Water Tank with 5-point scale */}
                      <div style={{ flexShrink: 0 }}>
                        <WaterLevelVisual
                          percent={t?.water_level_percent}
                          waterLevelCm={t?.water_level_cm}
                          drainDepthCm={drain.drain_depth_cm || 15}
                          criticalLevelPercent={drain.critical_level_percent || 80}
                          riskLevel={drRisk}
                          compact={true}
                          showRuler={true}
                        />
                      </div>

                      {/* Numeric breakdown */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14 }}>{riskIcon}</span>
                          <RiskBadge level={drRisk} />
                          <PriorityBadge priority={drPriority} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                            {drScore}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ 100 risk score</span>
                        </div>

                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Water Level: </span>
                          <strong>{t?.water_level_cm != null ? `${t.water_level_cm.toFixed(1)} cm` : '—'}</strong>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                            ({t?.water_level_percent ?? 0}%)
                          </span>
                        </div>

                        {t?.water_distance_cm != null && (
                          <div style={{ fontSize: 12 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Sensor Distance: </span>
                            <span className="mono">{t.water_distance_cm.toFixed(1)} cm</span>
                          </div>
                        )}

                        {drain.device_id !== 'DRAIN_001' && (t?.rain_value == null || t?.flow_rate_lpm == null) && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                            Rain & flow shared from DRAIN_001
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Timestamp and Inspect Action */}
                  <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {t?.timestamp ? `Updated ${new Date(t.timestamp).toLocaleTimeString('en-IN')}` : 'Awaiting signal'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedDrainId(drain.device_id)
                          if (onNavigate) onNavigate('drains')
                        }}
                      >
                        Details →
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Main Monitoring Section — Animated Water Level + Authoritative Risk for Selected Drain */}
      {activeList.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center', marginBottom: 24, background: '#FFFFFF', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚰</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            No Active Drain Hardware Connected
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 16px' }}>
            Live sensor metrics, water visualization, and risk engine analysis will automatically activate once a physical NodeMCU connects and begins streaming telemetry.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: '#F1F5F9', borderRadius: 20, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            <span className="pulse-dot" style={{ background: '#94A3B8' }} />
            Awaiting ESP8266 telemetry packets on backend port 3001
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <div className="card-header" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="card-title">Live Water Monitoring & Risk Assessment — Selected Drain</span>
                {selectedDrain && (
                  <span className="mono" style={{ fontSize: 12, color: 'var(--primary-blue)', background: '#EFF6FF', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                    {selectedDrain.device_id}
                  </span>
                )}
              </div>
              {activeTelemetry && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Last reading: {new Date(activeTelemetry.timestamp).toLocaleTimeString('en-IN')}
                </span>
              )}
            </div>

            <div className="section-grid">
              {/* Prominent Animated Water Level Visualization */}
              <WaterLevelVisual
                percent={activeTelemetry?.water_level_percent}
                waterLevelCm={activeTelemetry?.water_level_cm}
                drainDepthCm={selectedDrain?.drain_depth_cm || 15}
                criticalLevelPercent={selectedDrain?.critical_level_percent || 80}
                riskLevel={riskLevel}
                deviceName={selectedDrain?.device_id}
                timestamp={activeTelemetry?.timestamp}
              />

              {/* Authoritative Rule-Based Risk Assessment Card */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="card-header" style={{ marginBottom: 12 }}>
                    <span className="card-title">Authoritative Risk Assessment</span>
                    <RiskBadge level={riskLevel} />
                  </div>

                  {/* Large Score & Priority Display */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{
                        fontSize: 48,
                        fontWeight: 800,
                        lineHeight: 1,
                        letterSpacing: -1,
                        color:
                          riskLevel === 'CRITICAL' ? 'var(--risk-critical)' :
                          riskLevel === 'HIGH'     ? 'var(--risk-high)' :
                          riskLevel === 'MEDIUM'   ? 'var(--risk-medium)' :
                          riskLevel === 'LOW'      ? 'var(--risk-low)' : 'var(--text-secondary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {riskScore}
                        <span style={{ fontSize: 16, color: 'var(--text-muted)', marginLeft: 4, fontWeight: 500 }}>/100</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Rule-Based Risk Score
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <PriorityBadge priority={priority} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Intervention Priority
                      </span>
                    </div>
                  </div>

                  {/* ETA Warning if predicted failure minutes exists */}
                  {activeTelemetry?.predicted_failure_minutes != null && (
                    <div style={{ marginTop: 14 }}>
                      <EtaWarning minutes={activeTelemetry.predicted_failure_minutes} />
                    </div>
                  )}

                  {/* Rule-Based Reasons */}
                  <div style={{ marginTop: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'block', marginBottom: 8 }}>
                      Authoritative Risk Reasons:
                    </span>
                    <RiskReasons reasons={activeTelemetry?.risk_reasons} riskLevel={riskLevel} />
                  </div>
                </div>

                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Location: {selectedDrain?.location_name || 'Location not configured'} {selectedDrain?.ward ? `(${selectedDrain.ward})` : ''}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onNavigate('drains')}
                  >
                    Inspect Drain Details →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Live Sensor Telemetry Readings Grid */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="card-title">Live Telemetry Metrics — {selectedDrain?.device_id}</span>
                {activeTelemetry?.source === 'hardware' && (
                  <span style={{
                    background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0',
                    borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
                    LIVE HARDWARE
                  </span>
                )}
              </div>
              {activeTelemetry && (
                <SensorStatusBadge status={activeTelemetry.sensor_status} />
              )}
            </div>
            <div className="metric-grid">
              <div className="metric-item">
                <span className="metric-label">Water Level</span>
                <span className="metric-value">
                  {activeTelemetry?.water_level_cm != null ? activeTelemetry.water_level_cm.toFixed(1) : 'No reading'}
                </span>
                <span className="metric-unit">
                  {activeTelemetry?.water_level_percent != null ? `cm (${activeTelemetry.water_level_percent}%)` : 'Waiting for sensor data'}
                </span>
              </div>

              <div className="metric-item">
                <span className="metric-label">Sensor Distance</span>
                <span className="metric-value">
                  {activeTelemetry?.water_distance_cm != null ? activeTelemetry.water_distance_cm.toFixed(1) : '—'}
                </span>
                <span className="metric-unit">cm to water</span>
              </div>

              <div className="metric-item">
                <span className="metric-label">Flow Rate</span>
                <span className="metric-value">
                  {selectedDrain?.device_id !== 'DRAIN_001' && (activeTelemetry?.flow_rate_lpm == null)
                    ? 'Shared'
                    : activeTelemetry?.flow_rate_lpm != null ? activeTelemetry.flow_rate_lpm.toFixed(1) : '—'}
                </span>
                <span className="metric-unit">
                  {selectedDrain?.device_id !== 'DRAIN_001' && (activeTelemetry?.flow_rate_lpm == null) ? 'from DRAIN_001' : 'L/min'}
                </span>
              </div>

              <div className="metric-item">
                <span className="metric-label">Rain Intensity</span>
                <span className="metric-value" style={{ fontSize: 18 }}>
                  {selectedDrain?.device_id !== 'DRAIN_001' && (activeTelemetry?.rain_value == null)
                    ? 'Shared'
                    : activeTelemetry?.rain_intensity || 'NONE'}
                </span>
                <span className="metric-unit">
                  {selectedDrain?.device_id !== 'DRAIN_001' && (activeTelemetry?.rain_value == null)
                    ? 'from DRAIN_001'
                    : activeTelemetry?.rain_value != null ? `value: ${activeTelemetry.rain_value}` : 'dry'}
                </span>
              </div>

              <div className="metric-item">
                <span className="metric-label">Rise Rate</span>
                <span className="metric-value">
                  {activeTelemetry?.water_rise_rate_cm_min != null ? activeTelemetry.water_rise_rate_cm_min.toFixed(2) : '0.00'}
                </span>
                <span className="metric-unit">cm/min</span>
              </div>

              <div className="metric-item">
                <span className="metric-label">Hardware Wi-Fi</span>
                <span className="metric-value" style={{ fontSize: 18, color: 'var(--status-ok)' }}>
                  {activeTelemetry?.wifi_status || 'ONLINE'}
                </span>
                <span className="metric-unit">NodeMCU link</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Monitored Municipal Drainage Assets Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">All Monitored Municipal Drainage Assets</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Click any row to switch active view</span>
        </div>

        {effectiveDrains.length === 0 ? (
          <EmptyState icon="🚰" text="No drainage assets found" />
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Location & Asset</th>
                  <th>Hardware Link</th>
                  <th>Risk Status</th>
                  <th>Water Level</th>
                  <th>Rain Sensor</th>
                  <th>Outflow</th>
                  <th>Sensor Health</th>
                  <th>Last Telemetry</th>
                </tr>
              </thead>
              <tbody>
                {effectiveDrains.map(drain => {
                  const live = latestByDevice[drain.device_id]
                  const t = live ? { ...drain.latest_telemetry, ...live } : drain.latest_telemetry
                  const isSelected = drain.device_id === selectedDrainId
                  const isOnline = activeList.some(a => a.device_id === drain.device_id)

                  return (
                    <tr
                      key={drain.device_id}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.04)' : undefined,
                        opacity: isOnline ? 1 : 0.75,
                      }}
                      onClick={() => setSelectedDrainId(drain.device_id)}
                      title="Click to view on dashboard"
                    >
                      <td>
                        <span className="mono" style={{ color: 'var(--primary-blue)', fontWeight: 700 }}>
                          {drain.device_id}
                        </span>
                        {isSelected && (
                          <span style={{ marginLeft: 6, fontSize: 10, background: '#EFF6FF', color: '#2563EB', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                            SELECTED
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: 220 }}>
                        {drain.location_name}
                      </td>
                      <td>
                        {isOnline ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-ok)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span className="pulse-dot" style={{ width: 6, height: 6 }} /> ONLINE
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                            ○ OFFLINE
                          </span>
                        )}
                      </td>
                      <td>{t ? <RiskBadge level={t.risk_level} /> : '—'}</td>
                      <td>
                        {t?.water_level_percent != null ? (
                          <span className="mono" style={{ fontWeight: 700 }}>
                            {t.water_level_percent}%
                            {t.water_level_cm != null && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                                ({t.water_level_cm.toFixed(1)} cm)
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {drain.device_id !== 'DRAIN_001' && (t?.rain_value == null) ? (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            shared · DRAIN_001
                          </span>
                        ) : (
                          <span style={{ fontWeight: 500 }}>{t?.rain_intensity ?? '—'}</span>
                        )}
                      </td>
                      <td>
                        {drain.device_id !== 'DRAIN_001' && (t?.flow_rate_lpm == null) ? (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            shared · DRAIN_001
                          </span>
                        ) : (
                          <span className="mono">
                            {t?.flow_rate_lpm != null ? `${t.flow_rate_lpm.toFixed(1)} L/m` : '—'}
                          </span>
                        )}
                      </td>
                      <td>
                        {t ? <SensorStatusBadge status={t.sensor_status} /> : '—'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {t ? new Date(t.timestamp).toLocaleTimeString('en-IN') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Trend MultiChart */}
      {history.length > 1 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">System Historical Trend — Water Level & Risk Score</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Last 60 readings for {selectedDrainId}</span>
          </div>
          <MultiChart history={history} />
        </div>
      )}
    </div>
  )
}
