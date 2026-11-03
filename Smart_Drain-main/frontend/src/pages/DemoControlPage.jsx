import React, { useState } from 'react'
import { api } from '../api'
import WaterLevelVisual from '../components/WaterLevelVisual'
import { RiskBadge, PriorityBadge } from '../components/Shared'

const SCENARIOS = [
  {
    num: 1,
    name: 'Normal Drainage',
    desc: 'Water entering and draining normally. Rain dry. Flow healthy.',
    risk: 'LOW',
    color: 'var(--risk-low)',
    details: 'Distance: 12 cm → Level: 3 cm (20%) · Rain: DRY · Flow: 6.5 L/min',
  },
  {
    num: 2,
    name: 'Rising Water',
    desc: 'Rain increases. Water begins rising. Flow still adequate.',
    risk: 'MEDIUM',
    color: 'var(--risk-medium)',
    details: 'Distance: 8.5 cm → Level: 6.5 cm (43%) · Rain: MODERATE · Flow: 4.0 L/min',
  },
  {
    num: 3,
    name: 'Partial Blockage',
    desc: 'Outlet partially blocked. Water rises. Flow decreasing.',
    risk: 'HIGH',
    color: 'var(--risk-high)',
    details: 'Distance: 3.2 cm → Level: 11.8 cm (79%) · Rain: HEAVY · Flow: 0.8 L/min',
  },
  {
    num: 4,
    name: 'Critical Failure',
    desc: 'Drain nearly full. Heavy rain. Outflow minimal. Failure imminent.',
    risk: 'CRITICAL',
    color: 'var(--risk-critical)',
    details: 'Distance: 1.8 cm → Level: 13.2 cm (88%) · Rain: HEAVY · Flow: 0.3 L/min',
  },
  {
    num: 5,
    name: 'Recovery',
    desc: 'Blockage cleared. Water falling. Flow restored. Risk decreasing.',
    risk: 'MEDIUM→LOW',
    color: 'var(--risk-low)',
    details: 'Distance: 9 cm → Level: 6 cm (40%) · Rain: MODERATE · Flow: 5.5 L/min',
  },
]

export default function DemoControlPage({ drains: propDrains }) {
  const [activeScenario, setActiveScenario] = useState(null)
  const [targetDevice,   setTargetDevice]   = useState('DRAIN_001')
  const [deviceList,     setDeviceList]     = useState(propDrains || [])
  const [streaming,      setStreaming]       = useState(false)
  const [streamScenario, setStreamScenario] = useState(null)
  const [lastResult,     setLastResult]     = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [interval,       setInterval_]      = useState(3000)

  // Sync registered devices from prop or API
  React.useEffect(() => {
    if (propDrains && propDrains.length > 0) {
      setDeviceList(propDrains)
    } else {
      api.getDrains()
        .then(d => { if (Array.isArray(d) && d.length > 0) setDeviceList(d) })
        .catch(() => {})
    }
  }, [propDrains])

  // Ensure targetDevice is valid among registered devices
  React.useEffect(() => {
    if (deviceList.length > 0 && !deviceList.some(d => d.device_id === targetDevice)) {
      setTargetDevice(deviceList[0].device_id)
    }
  }, [deviceList, targetDevice])

  const simulate = async (num) => {
    setLoading(true)
    setActiveScenario(num)
    try {
      const result = await api.simulate(num, targetDevice)
      setLastResult(result)
    } catch (err) {
      console.error('Simulate error:', err)
      setLastResult({ error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const startStream = async (num) => {
    try {
      await api.startAutoStream(num, interval)
      setStreaming(true)
      setStreamScenario(num)
      setActiveScenario(num)
    } catch (err) {
      console.error(err)
    }
  }

  const stopStream = async () => {
    try {
      await api.stopAutoStream()
      setStreaming(false)
      setStreamScenario(null)
    } catch (err) {
      console.error(err)
    }
  }

  const p = lastResult?.processed

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Demo Control & Simulation Studio</h1>
        <p className="page-subtitle">
          Inject test scenarios to simulate real-time water levels, sensor readings, and risk assessment transitions
        </p>
      </div>

      {/* Auto-stream Active Banner */}
      {streaming && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px',
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          borderRadius: 'var(--radius)', marginBottom: 20,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ animation: 'pulse-anim 1.2s infinite', color: 'var(--primary-blue)', fontSize: 20 }}>⏵</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: 'var(--primary-blue)', fontSize: 13 }}>
              Auto-Streaming Scenario {streamScenario} every {interval / 1000}s
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Real-time telemetry and animated water levels are broadcasting live via Socket.IO
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={stopStream}>⏹ Stop Stream</button>
        </div>
      )}

      {/* Live Simulation Response & Animated Water Level Visualization */}
      {lastResult && (
        <div style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <span className="card-title">Live Simulation Response</span>
            {p && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RiskBadge level={p.risk_level} />
                <PriorityBadge priority={p.priority} />
              </div>
            )}
          </div>

          {lastResult.error ? (
            <div className="card" style={{ color: 'var(--risk-critical)', background: '#FEF2F2', borderColor: '#FECACA' }}>
              <strong>Simulation Error:</strong> {lastResult.error}
            </div>
          ) : p ? (
            <div className="section-grid" style={{ marginBottom: 16 }}>
              {/* Animated Water Level Driven Directly by the Simulation Result */}
              <WaterLevelVisual
                percent={p.water_level_percent}
                waterLevelCm={p.water_level_cm}
                drainDepthCm={15}
                criticalLevelPercent={80}
                riskLevel={p.risk_level}
                deviceName={`${p.device_id || targetDevice} (Simulation)`}
                timestamp={p.timestamp || new Date()}
              />

              {/* Authoritative Simulation Metrics */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="card-header">
                    <span className="card-title">Authoritative Rule-Based Output</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Scenario #{activeScenario}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
                    <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Risk Score</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {p.risk_score} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ 100</span>
                      </div>
                    </div>

                    <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Flow Rate</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {p.flow_rate_lpm?.toFixed(1) ?? '—'} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>L/min</span>
                      </div>
                    </div>

                    <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Rain Intensity</div>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {p.rain_intensity}
                      </div>
                    </div>

                    <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Time to Critical</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: p.predicted_failure_minutes ? 'var(--risk-critical)' : 'var(--text-primary)' }}>
                        {p.predicted_failure_minutes ? `~${p.predicted_failure_minutes} min` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {p.risk_reasons && p.risk_reasons.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Rule Reasons:</div>
                      {p.risk_reasons.map((r, idx) => (
                        <div key={idx} style={{ padding: '3px 0' }}>• {r}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
                  Hardware Sensor Status: <strong>{p.sensor_status}</strong> · Wi-Fi: <strong>{p.wifi_status}</strong>
                </div>
              </div>
            </div>
          ) : null}

          {/* Experimental ML Output — Strictly in a Separate Section */}
          {p?.ml_prediction && (() => {
            const ml = p.ml_prediction
            const mlAvail = ml?.status === 'available'
            const mlBadge = mlAvail
              ? { LOW: '#16A34A', MEDIUM: '#D97706', HIGH: '#EA580C', CRITICAL: '#DC2626' }[ml.risk_prediction_experimental] || '#64748B'
              : '#64748B'

            return (
              <div
                className="card"
                style={{
                  border: '1.5px dashed #CBD5E1',
                  background: '#FFFFFF',
                  marginBottom: 16,
                }}
              >
                <div className="card-header" style={{ marginBottom: 10 }}>
                  <span className="card-title" style={{ color: 'var(--primary-blue)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🤖 Experimental ML Prediction
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#B45309', background: '#FEF3C7', padding: '2px 6px', borderRadius: 4, border: '1px solid #FDE68A' }}>
                      NOT FOR SAFETY DECISIONS
                    </span>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Advisory ML Output
                  </span>
                </div>

                {mlAvail ? (
                  <div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                      <div style={{
                        padding: '6px 16px',
                        borderRadius: 8,
                        background: `${mlBadge}15`,
                        border: `2px solid ${mlBadge}`,
                        fontWeight: 800,
                        fontSize: 18,
                        color: mlBadge,
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {ml.risk_prediction_experimental}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Model: <span className="mono" style={{ fontWeight: 600 }}>{ml.model_type}</span> · trained on synthetic data
                      </div>
                    </div>

                    {ml.class_probabilities && (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {Object.entries(ml.class_probabilities).map(([cls, prob]) => (
                          <div key={cls} style={{ padding: '6px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>{cls}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {(prob * 100).toFixed(1)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {ml.status === 'skipped' ? `Skipped: ${ml.reason}` : `Unavailable: ${ml.reason || 'ML service offline'}`}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Target Device Selector */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px', background: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Simulation Target Device Node
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Select which NodeMCU hardware node receives the simulated telemetry packet
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(deviceList.length > 0
              ? deviceList.map(d => ({ id: d.device_id, label: `${d.name || d.device_id} (${d.device_id})` }))
              : [{ id: 'DRAIN_001', label: 'NodeMCU 1 — DRAIN_001 (US + Rain + Flow)' }]
            ).map(dev => (
              <button
                key={dev.id}
                className={`btn btn-sm ${targetDevice === dev.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  borderColor: targetDevice === dev.id ? 'var(--primary-blue)' : 'var(--border)',
                }}
                onClick={() => setTargetDevice(dev.id)}
              >
                {dev.id === targetDevice ? '● ' : ''}{dev.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scenario Cards Grid */}
      <div className="card-header" style={{ marginBottom: 12 }}>
        <span className="card-title">Select Simulation Scenario</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Click Single Shot or Auto-stream</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {SCENARIOS.map(s => {
          const isActive = activeScenario === s.num
          return (
            <div
              key={s.num}
              className="card"
              style={{
                borderColor: isActive ? 'var(--primary-blue)' : 'var(--border)',
                boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.12)' : 'var(--shadow-card)',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: '#EFF6FF',
                    border: '2px solid var(--primary-blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 16, color: 'var(--primary-blue)',
                  }}>
                    {s.num}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{s.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase' }}>
                      Target Risk: {s.risk}
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                  {s.desc}
                </p>

                <div style={{
                  padding: '8px 12px',
                  background: '#F8FAFC',
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  marginBottom: 16,
                  lineHeight: 1.6,
                  border: '1px solid var(--border)',
                }}>
                  {s.details}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={loading}
                  onClick={() => simulate(s.num)}
                  style={{ flex: 1 }}
                >
                  ▶ Single Shot
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={streaming && streamScenario !== s.num}
                  onClick={() => streaming && streamScenario === s.num ? stopStream() : startStream(s.num)}
                  style={{ flex: 1 }}
                >
                  {streaming && streamScenario === s.num ? '⏹ Stop' : '⏵ Auto-stream'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Stream Interval Control */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><span className="card-title">Auto-Stream Interval Configuration</span></div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 14 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Broadcast Interval:
            </label>
            <input
              type="range" min="1000" max="10000" step="500"
              value={interval}
              onChange={e => setInterval_(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--primary-blue)', height: 6 }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--primary-blue)', minWidth: 50 }}>
              {interval / 1000}s
            </span>
          </div>
        </div>
      </div>

      {/* Instructions for Demonstration */}
      <div className="card">
        <div className="card-header"><span className="card-title">Recommended Demonstration Flow</span></div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8 }}>
          {[
            ['1', 'Normal Baseline (Scenario 1)', 'Low water level (20%). Tank animation shows gentle waves at base. System risk green.'],
            ['2', 'Rising Inflow (Scenario 2)', 'Moderate rainfall triggers water rise to 43%. Tank fill smoothly animates upward to medium risk.'],
            ['3', 'Blockage Emergence (Scenario 3)', 'Water reaches 79% (11.8 cm). Wave moves higher; amber alert triggers.'],
            ['4', 'Critical Threshold (Scenario 4)', 'Water reaches 88% crossing critical threshold line. Tank displays critical warning, P1 incident auto-creates.'],
            ['5', 'Resolution & Recovery (Scenario 5)', 'Drainage restored, water level smoothly recedes back to 40% with healthy flow restored.'],
          ].map(([num, title, desc]) => (
            <div key={num} style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: '#EFF6FF', border: '1.5px solid var(--primary-blue)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: 'var(--primary-blue)', flexShrink: 0,
              }}>{num}</div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
