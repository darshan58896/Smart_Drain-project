import React, { useEffect, useState } from 'react'
import { api } from '../api'
import {
  RiskBadge, SensorStatusBadge, PriorityBadge,
  DataRow, EtaWarning, RiskReasons, AlertBanner, Spinner, EmptyState,
} from '../components/Shared'
import { WaterLevelChart, FlowChart, RiseRateChart } from '../components/Charts'
import WaterLevelVisual from '../components/WaterLevelVisual'

export default function DrainDetailPage({
  selectedDrainId = 'DRAIN_001',
  onSelectDrain,
  drains = [],
  latestByDevice = {},
  lastTelemetry,
  refreshKey,
}) {
  const activeDrainId = selectedDrainId || 'DRAIN_001'
  const [drain,    setDrain]    = useState(null)
  const [history,  setHistory]  = useState([])
  const [tab,      setTab]      = useState('overview')
  const [loading,  setLoading]  = useState(true)
  const [mlHealth, setMlHealth] = useState(null)

  const loadData = () => {
    setLoading(true)
    Promise.all([
      api.getDrain(activeDrainId),
      api.getHistory(activeDrainId, 100),
      api.getMlHealth().catch(e => ({ integration: 'unavailable', error: e.message })),
    ])
      .then(([d, h, m]) => { setDrain(d); setHistory(h); setMlHealth(m) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [activeDrainId, refreshKey])

  useEffect(() => {
    if (!lastTelemetry || lastTelemetry.device_id !== activeDrainId) return
    setDrain(prev => prev ? { ...prev, latest_telemetry: { ...prev.latest_telemetry, ...lastTelemetry } } : prev)
    setHistory(prev => [...prev.slice(-199), lastTelemetry].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    ))
  }, [lastTelemetry, activeDrainId])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>
  if (!drain)  return <EmptyState icon="🚰" text="Drain not found" />

  const live = latestByDevice[activeDrainId]
  const t = live ? { ...drain.latest_telemetry, ...live } : drain.latest_telemetry
  const risk = t?.risk_level || 'UNKNOWN'
  const priority = t?.priority || (risk === 'CRITICAL' ? 'P1' : risk === 'HIGH' ? 'P2' : risk === 'MEDIUM' ? 'P3' : 'P4')

  const effectiveDrainsList = drains.length > 0 ? drains : [drain]

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              <span className="mono" style={{ color: 'var(--primary-blue)', marginRight: 10 }}>{drain.device_id}</span>
              Drain Monitor
            </h1>

            {/* Drain Switcher Dropdown */}
            {effectiveDrainsList.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFFFFF', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Switch Drain:</span>
                <select
                  value={activeDrainId}
                  onChange={e => onSelectDrain && onSelectDrain(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontWeight: 700,
                    color: 'var(--primary-blue)',
                    fontSize: 12,
                    cursor: 'pointer',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {effectiveDrainsList.map(dr => (
                    <option key={dr.device_id} value={dr.device_id}>
                      {dr.device_id} ({dr.location_name})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="page-subtitle">{drain.location_name} · Ward {drain.ward} · Managed by {drain.authority_name}</p>
        </div>

        {t && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RiskBadge level={risk} />
            <PriorityBadge priority={priority} />
            <SensorStatusBadge status={t.sensor_status} />
          </div>
        )}
      </div>

      {/* Alert Banners */}
      {risk === 'CRITICAL' && t && (
        <AlertBanner
          level="CRITICAL"
          title={`⚠️ CRITICAL RISK — ${drain.device_id}`}
          message={`Water level at ${t.water_level_percent}% · ${t.predicted_failure_minutes != null ? `Estimated ${t.predicted_failure_minutes} min to critical overflow` : 'Rising rapidly'} · Assigned Team: ${drain.team_name}`}
        />
      )}
      {risk === 'HIGH' && t && (
        <AlertBanner
          level="HIGH"
          title={`HIGH RISK — Intervention Required`}
          message={`Water level: ${t.water_level_percent}% · Rain: ${t.rain_intensity} · Flow Out: ${t.flow_rate_lpm?.toFixed(1) ?? '—'} L/min · Contact: ${drain.contact_phone}`}
        />
      )}

      {/* Tabs */}
      <div className="tabs">
        {['overview', 'charts', 'authority', 'alerts'].map(tab_id => (
          <div
            key={tab_id}
            className={`tab ${tab === tab_id ? 'active' : ''}`}
            onClick={() => setTab(tab_id)}
          >
            {tab_id === 'overview' && '🌊 Overview & Water Level'}
            {tab_id === 'charts' && '📈 Historical Charts'}
            {tab_id === 'authority' && '🏢 Municipal Authority'}
            {tab_id === 'alerts' && '📋 Technical Alert Log'}
          </div>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && t && (
        <div>
          {/* Main Visual Section: Animated Water Level + Authoritative Risk Card */}
          <div className="section-grid" style={{ marginBottom: 20 }}>
            {/* Prominent Animated Water Level Visualization */}
            <WaterLevelVisual
              percent={t.water_level_percent}
              waterLevelCm={t.water_level_cm}
              drainDepthCm={drain.drain_depth_cm || 15}
              criticalLevelPercent={drain.critical_level_percent || 80}
              riskLevel={risk}
              deviceName={drain.device_id}
              timestamp={t.timestamp}
            />

            {/* Authoritative Risk Assessment Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="card-header">
                  <span className="card-title">Authoritative Risk Assessment</span>
                  <RiskBadge level={risk} />
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                  <div style={{
                    fontSize: 48,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: -1,
                    color:
                      risk === 'CRITICAL' ? 'var(--risk-critical)' :
                      risk === 'HIGH'     ? 'var(--risk-high)'     :
                      risk === 'MEDIUM'   ? 'var(--risk-medium)'   :
                      risk === 'LOW'      ? 'var(--risk-low)'      : 'var(--text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {t.risk_score ?? 0}
                  </div>
                  <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 600 }}>/ 100</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8, fontWeight: 600 }}>
                    Rule-Based Severity Score
                  </span>
                </div>

                {t.predicted_failure_minutes != null && (
                  <div style={{ marginBottom: 12 }}>
                    <EtaWarning minutes={t.predicted_failure_minutes} />
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'block', marginBottom: 8 }}>
                    Risk Evaluation Reasons:
                  </span>
                  <RiskReasons reasons={t.risk_reasons} riskLevel={risk} />
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Assigned Unit: <strong>{drain.team_name}</strong>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Decision Engine: Rule-Based (Authoritative)
                </span>
              </div>
            </div>
          </div>

          {/* Sensor Readings Grid & Physical Parameters */}
          <div className="section-grid" style={{ marginBottom: 20 }}>
            {/* Live Sensor Readings */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="card-title">Sensor Readings</span>
                  {t.source === 'hardware' ? (
                    <span style={{
                      background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0',
                      borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
                      LIVE HARDWARE
                    </span>
                  ) : (
                    <span style={{
                      background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0',
                      borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 700
                    }}>
                      {t.source_label || 'HISTORICAL RECORD'}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {new Date(t.timestamp).toLocaleTimeString('en-IN')}
                </span>
              </div>
              <div className="metric-grid" style={{ marginBottom: 16 }}>
                <div className="metric-item">
                  <span className="metric-label">Water Level</span>
                  <span className="metric-value">{t.water_level_cm != null ? t.water_level_cm.toFixed(1) : 'No reading'}</span>
                  <span className="metric-unit">{t.water_level_cm != null ? 'cm' : 'Waiting for sensor data'}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Capacity Fill</span>
                  <span className="metric-value" style={{
                    color: risk === 'CRITICAL' ? 'var(--risk-critical)' : risk === 'HIGH' ? 'var(--risk-high)' : 'var(--text-primary)'
                  }}>
                    {t.water_level_percent != null ? `${t.water_level_percent}%` : '—'}
                  </span>
                  <span className="metric-unit">of {drain.total_depth_cm || drain.drain_depth_cm || 100} cm</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Flow Rate</span>
                  <span className="metric-value">
                    {t.flow_rate_lpm != null
                      ? t.flow_rate_lpm.toFixed(1)
                      : (drain.device_id !== 'DRAIN_001' ? 'Shared' : '—')}
                  </span>
                  <span className="metric-unit">
                    {t.flow_rate_lpm != null ? 'L/min' : (drain.device_id !== 'DRAIN_001' ? 'shared · DRAIN_001' : 'L/min')}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Rise Rate</span>
                  <span className="metric-value" style={{ color: (t.water_rise_rate_cm_min || 0) > 0.5 ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                    {t.water_rise_rate_cm_min != null ? t.water_rise_rate_cm_min.toFixed(2) : '—'}
                  </span>
                  <span className="metric-unit">cm/min</span>
                </div>
              </div>

              <DataRow label="Distance to Water" value={t.water_distance_cm != null ? t.water_distance_cm.toFixed(2) : 'No reading'} unit={t.water_distance_cm != null ? 'cm' : ''} />
              <DataRow label="Total Drain Depth" value={(drain.total_depth_cm || drain.drain_depth_cm || 100).toFixed(1)} unit="cm" />
              <DataRow
                label="Rain Sensor Reading"
                value={t.rain_value != null ? t.rain_value : (drain.device_id !== 'DRAIN_001' ? 'Shared from DRAIN_001' : 'No current reading')}
                unit={t.rain_value != null ? '/ 1023' : ''}
                mono={t.rain_value != null}
              />
              <DataRow
                label="Rain Classification"
                value={t.rain_intensity || (drain.device_id !== 'DRAIN_001' ? 'Shared from DRAIN_001' : 'Waiting for sensor data')}
                mono={false}
              />
              <DataRow label="Hardware Wi-Fi Link" value={t.wifi_status || 'ONLINE'} mono={false} />
            </div>

            {/* Drain Asset & Location Specs */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Drain Asset Specifications</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--primary-blue)', fontWeight: 700 }}>
                  {drain.ward || 'WARD UNASSIGNED'}
                </span>
              </div>
              <DataRow label="Asset Location" value={drain.location_name || 'Location not configured'} mono={false} />
              <DataRow label="Street / Landmark" value={drain.street_landmark || '—'} mono={false} />
              <DataRow label="Critical Threshold" value={`${drain.critical_level_percent || 80}%`} />
              <DataRow label="Latitude" value={drain.latitude != null ? Number(drain.latitude).toFixed(4) : 'GPS unavailable'} mono={drain.latitude != null} />
              <DataRow label="Longitude" value={drain.longitude != null ? Number(drain.longitude).toFixed(4) : 'GPS unavailable'} mono={drain.longitude != null} />
              <DataRow label="Sensor Health" value={t.sensor_status || 'WAITING'} mono={false} />
              <DataRow label="Installation Notes" value={drain.installation_notes || '—'} mono={false} />
              <DataRow label="Responsible Authority" value={drain.authority_name || 'Municipal Corporation'} mono={false} />
              <DataRow label="Emergency Dispatch Phone" value={drain.contact_phone || 'Emergency Desk: 112'} mono={false} />
            </div>
          </div>

          {/* Experimental ML Prediction — STRICTLY SEPARATE CARD (Preservation Rules) */}
          {(() => {
            const ml = t?.ml_prediction
            const mlAvail = ml?.status === 'available'
            const mlSkip  = ml?.status === 'skipped'
            const mlBadge = mlAvail
              ? { LOW: '#16A34A', MEDIUM: '#D97706', HIGH: '#EA580C', CRITICAL: '#DC2626' }[ml.risk_prediction_experimental] || '#64748B'
              : '#64748B'

            return (
              <div
                className="card"
                style={{
                  marginTop: 20,
                  border: '1.5px dashed #CBD5E1',
                  background: '#FFFFFF',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <div className="card-header">
                  <span className="card-title" style={{ color: 'var(--primary-blue)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    🤖 Experimental ML Prediction
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      background: '#F1F5F9',
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--border)',
                    }}>
                      EXPERIMENTAL / ADVISORY ONLY
                    </span>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Authoritative safety decision remains rule-based
                  </span>
                </div>

                {mlAvail ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: '0.5px',
                        background: mlBadge,
                        color: '#FFFFFF',
                      }}>
                        {ml.risk_prediction_experimental}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          Experimental Predicted Risk Class
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          Model: <span className="mono" style={{ fontWeight: 600 }}>{ml.model_type}</span> · trained on synthetic data
                        </div>
                      </div>
                    </div>

                    {ml.class_probabilities && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                          Class Probabilities:
                        </span>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {Object.entries(ml.class_probabilities).map(([cls, prob]) => (
                            <div
                              key={cls}
                              style={{
                                padding: '8px 14px',
                                background: '#F8FAFC',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                textAlign: 'center',
                                minWidth: 80,
                              }}
                            >
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                                {cls}
                              </div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                                {(prob * 100).toFixed(1)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{
                      fontSize: 12,
                      color: '#92400E',
                      padding: '10px 14px',
                      background: '#FFFBEB',
                      borderRadius: 8,
                      border: '1px solid #FDE68A',
                      lineHeight: 1.5,
                      fontWeight: 500,
                    }}>
                      ⚠️ {ml.warning || 'Experimental prediction — trained on synthetic rule-derived labels. Do not use as a standalone safety decision.'}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                    {mlSkip ? `ML prediction skipped: ${ml.reason}` : `ML service unavailable: ${ml?.reason || 'not reachable'}`}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'overview' && !t && (
        <EmptyState icon="📡" text="No telemetry received yet. Connect the ESP8266 or run a Demo Control scenario." />
      )}

      {/* Charts Tab */}
      {tab === 'charts' && (
        <div>
          {history.length < 2 ? (
            <EmptyState icon="📈" text="Need at least 2 readings to generate trend charts. Send telemetry or run demo." />
          ) : (
            <>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span className="card-title">Water Level History (%) — {activeDrainId}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Last {history.length} data points</span>
                </div>
                <WaterLevelChart history={history} />
              </div>
              <div className="section-grid">
                <div className="card">
                  <div className="card-header"><span className="card-title">Outflow Flow Rate (L/min) — {activeDrainId}</span></div>
                  <FlowChart history={history} />
                </div>
                <div className="card">
                  <div className="card-header"><span className="card-title">Water Rise Rate (cm/min) — {activeDrainId}</span></div>
                  <RiseRateChart history={history} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Authority Tab */}
      {tab === 'authority' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Responsible Municipal Authority</span></div>
          <DataRow label="Ward Number" value={drain.ward} mono={false} />
          <DataRow label="Authority Jurisdiction" value={drain.authority_name} mono={false} />
          <DataRow label="Assigned Rapid Response Team" value={drain.team_name} mono={false} />
          <DataRow label="Direct Emergency Contact" value={drain.contact_phone} mono={false} />
          <DataRow label="Official Notification Email" value={drain.contact_email} mono={false} />

          <div style={{ marginTop: 24, padding: '18px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700 }}>
              Broadcast Public Alert Template
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
              ⚠️ <strong>MUNICIPAL ADVISORY:</strong> Elevated drainage flooding risk detected near <strong>{drain.location_name}</strong> (Ward {drain.ward}).
              Please exercise caution, avoid waterlogged sidewalks, and use designated bypass routes.
              For emergency assistance, contact <strong>{drain.authority_name}</strong> at <strong>{drain.contact_phone}</strong>.
            </div>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {tab === 'alerts' && t && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Authority Technical Incident Dispatch Format — {drain.device_id}</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            background: '#F8FAFC',
            padding: 20,
            borderRadius: 10,
            border: '1px solid var(--border)',
            lineHeight: 2,
            color: 'var(--text-primary)',
          }}>
            <div><strong>SMARTDRAIN INCIDENT DISPATCH — {t.timestamp ? new Date(t.timestamp).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')}</strong></div>
            <div style={{ color: 'var(--text-muted)' }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div>Drain Identifier       : <strong>{drain.device_id}</strong></div>
            <div>Location Description   : {drain.location_name}</div>
            <div>Administrative Ward    : Ward {drain.ward}</div>
            <div>Authoritative Risk     : <span style={{ fontWeight: 700, color: risk === 'CRITICAL' ? 'var(--risk-critical)' : 'inherit' }}>{t.risk_level}</span></div>
            <div>Risk Severity Score    : {t.risk_score} / 100</div>
            <div>Measured Water Level   : {t.water_level_cm?.toFixed(1)} cm ({t.water_level_percent}% of {drain.drain_depth_cm || 15} cm)</div>
            <div>Surface Rise Velocity  : {t.water_rise_rate_cm_min?.toFixed(2) ?? '—'} cm/min</div>
            <div>Rain Intensity Reading : {drain.device_id !== 'DRAIN_001' && (t.rain_value == null) ? 'Shared from DRAIN_001' : t.rain_intensity} (raw: {t.rain_value ?? '—'})</div>
            <div>Outflow Discharge Rate : {drain.device_id !== 'DRAIN_001' && (t.flow_rate_lpm == null) ? 'Not installed' : `${t.flow_rate_lpm?.toFixed(2) ?? '—'} L/min`}</div>
            <div>Estimated Time to Crit : {t.predicted_failure_minutes != null ? `~${t.predicted_failure_minutes} min (ESTIMATE)` : 'N/A'}</div>
            <div>Hardware Sensor Status : {t.sensor_status}</div>
            <div>Intervention Priority  : {t.risk_level === 'CRITICAL' ? 'P1 (IMMEDIATE)' : t.risk_level === 'HIGH' ? 'P2 (URGENT)' : 'P3 (STANDARD)'}</div>
            <div style={{ color: 'var(--text-muted)' }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div><strong>Authoritative Risk Triggers:</strong></div>
            {(t.risk_reasons || []).map((r, i) => <div key={i} style={{ paddingLeft: 12 }}>• {r}</div>)}
            <div style={{ color: 'var(--text-muted)' }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div>Dispatched Team        : {drain.team_name}</div>
            <div>Emergency Contact      : {drain.contact_phone}</div>
            <div>Responsible Authority  : {drain.authority_name}</div>
          </div>
        </div>
      )}
    </div>
  )
}
