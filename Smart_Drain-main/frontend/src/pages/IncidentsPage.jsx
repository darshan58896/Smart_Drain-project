import React, { useEffect, useState } from 'react'
import { api } from '../api'
import {
  RiskBadge, PriorityBadge, IncidentStatusBadge,
  RiskReasons, Spinner, EmptyState,
} from '../components/Shared'

const LIFECYCLE_STEPS = [
  { key: 'DETECTED',     label: 'Detected',      icon: '🔍' },
  { key: 'ALERTED',      label: 'Alerted',        icon: '📢' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged',   icon: '✅' },
  { key: 'DISPATCHED',   label: 'Dispatched',     icon: '🚐' },
  { key: 'INTERVENTION', label: 'Intervention',   icon: '🔧' },
  { key: 'RESOLVED',     label: 'Resolved',       icon: '✔' },
]

const STATUS_ORDER = {
  DETECTED: 0, PREDICTED: 0.5, ALERTED: 1, ASSIGNED: 1.5,
  ACKNOWLEDGED: 2, DISPATCHED: 3, INTERVENTION: 4, RESOLVED: 5,
}

function IncidentCard({ incident, onRefresh }) {
  const [loading, setLoading] = useState(false)

  const doAction = async (action) => {
    setLoading(true)
    try {
      await action()
      onRefresh()
    } finally {
      setLoading(false)
    }
  }

  const currentOrder = STATUS_ORDER[incident.status] ?? 0

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PriorityBadge priority={incident.priority} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              <span className="mono" style={{ color: 'var(--text-accent)' }}>{incident.device_id}</span>
              {' '}— {incident.location_name || 'Location not configured'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {incident.incident_id} · Detected {new Date(incident.detected_at).toLocaleString('en-IN')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <RiskBadge level={incident.risk_level} />
          <IncidentStatusBadge status={incident.status} />
        </div>
      </div>

      {/* Lifecycle Timeline */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
          {LIFECYCLE_STEPS.map((step, idx) => {
            const order   = STATUS_ORDER[step.key] ?? idx
            const isDone  = currentOrder > order
            const isActive = Math.abs(currentOrder - order) < 0.5
            return (
              <React.Fragment key={step.key}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 4, minWidth: 70,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    border: `2px solid ${isActive ? 'var(--accent)' : isDone ? 'var(--risk-low)' : 'var(--border)'}`,
                    background: isActive ? 'var(--accent-glow)' : isDone ? 'rgba(34,197,94,0.1)' : 'var(--bg-deep)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                  }}>
                    {step.icon}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    color: isActive ? 'var(--text-accent)' : isDone ? 'var(--risk-low)' : 'var(--text-muted)',
                    textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.3px',
                  }}>
                    {step.label}
                  </span>
                </div>
                {idx < LIFECYCLE_STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, minWidth: 20,
                    background: isDone ? 'var(--risk-low)' : 'var(--border)',
                    marginBottom: 18,
                  }} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Risk Reasons */}
      {incident.risk_reasons && incident.risk_reasons.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <RiskReasons reasons={incident.risk_reasons} riskLevel={incident.risk_level} />
        </div>
      )}

      {/* Authority */}
      <div style={{
        padding: '10px 14px',
        background: 'var(--bg-deep)',
        borderRadius: 6,
        fontSize: 12,
        color: 'var(--text-muted)',
        marginBottom: 12,
        lineHeight: 1.8,
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Authority:</strong> {incident.authority_name} ·{' '}
        <strong style={{ color: 'var(--text-secondary)' }}>Team:</strong> {incident.team_name} ·{' '}
        <strong style={{ color: 'var(--text-secondary)' }}>Contact:</strong> {incident.contact_phone}
      </div>

      {/* Actions */}
      {incident.status !== 'RESOLVED' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {incident.status === 'DETECTED' || incident.status === 'ALERTED' ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={loading}
              onClick={() => doAction(() => api.acknowledge(incident.incident_id))}
            >
              ✅ Acknowledge
            </button>
          ) : null}
          {incident.status === 'ACKNOWLEDGED' || incident.status === 'ASSIGNED' ? (
            <button
              className="btn btn-warning btn-sm"
              disabled={loading}
              onClick={() => doAction(() => api.dispatch(incident.incident_id))}
            >
              🚐 Dispatch Team
            </button>
          ) : null}
          {(incident.status === 'DISPATCHED' || incident.status === 'INTERVENTION') && (
            <button
              className="btn btn-success btn-sm"
              disabled={loading}
              onClick={() => doAction(() => api.resolve(incident.incident_id))}
            >
              ✔ Mark Resolved
            </button>
          )}
          {/* Always allow acknowledge → dispatch → resolve */}
          {!['DETECTED','ALERTED','ACKNOWLEDGED','ASSIGNED','DISPATCHED','INTERVENTION'].includes(incident.status) && (
            <button
              className="btn btn-success btn-sm"
              disabled={loading}
              onClick={() => doAction(() => api.resolve(incident.incident_id))}
            >
              ✔ Mark Resolved
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function IncidentsPage({ incidentUpdate }) {
  const [incidents, setIncidents] = useState([])
  const [filter,    setFilter]    = useState('ALL')
  const [loading,   setLoading]   = useState(true)

  const load = () => {
    api.getIncidents()
      .then(setIncidents)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (incidentUpdate) load() }, [incidentUpdate])

  const filters  = ['ALL', 'DETECTED', 'ACKNOWLEDGED', 'DISPATCHED', 'RESOLVED']
  const filtered = incidents.filter(i => filter === 'ALL' || i.status === filter)

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Incident Management</h1>
        <p className="page-subtitle">Track detection → response → resolution lifecycle</p>
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        {filters.map(f => (
          <div key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f}
            {f !== 'ALL' && (
              <span style={{
                marginLeft: 6, fontSize: 10, padding: '1px 5px',
                background: 'var(--bg-card)', borderRadius: 3,
              }}>
                {incidents.filter(i => i.status === f).length}
              </span>
            )}
            {f === 'ALL' && (
              <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', background: 'var(--bg-card)', borderRadius: 3 }}>
                {incidents.length}
              </span>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="📋" text={filter === 'ALL' ? 'No incidents yet. Incidents auto-create when risk is HIGH or CRITICAL.' : `No ${filter} incidents.`} />
      ) : (
        filtered.map(incident => (
          <IncidentCard key={incident.incident_id} incident={incident} onRefresh={load} />
        ))
      )}
    </div>
  )
}
