import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { RiskBadge, PriorityBadge, EmptyState, Spinner } from '../components/Shared'

export default function PriorityQueuePage({ dashboardData }) {
  const [queue,   setQueue]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    api.getPriorityQueue()
      .then(setQueue)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (dashboardData) load() }, [dashboardData])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Priority Intervention Queue</h1>
        <p className="page-subtitle">Drains requiring attention, ordered by severity and response urgency</p>
      </div>

      {queue.length === 0 ? (
        <EmptyState icon="✅" text="No drains currently require intervention. All municipal drainage systems normal." />
      ) : (
        queue.map(item => (
          <div key={item.device_id} className={`queue-row ${item.priority}`}>
            <PriorityBadge priority={item.priority} />
            <div className="queue-info">
              <div className="queue-location">
                <span className="mono" style={{ color: 'var(--primary-blue)', marginRight: 8, fontWeight: 700 }}>
                  {item.device_id}
                </span>
                {item.location_name || 'Location not configured'}
              </div>
              <div className="queue-detail">
                Ward: {item.ward} ·
                Team: <strong>{item.team_name}</strong> ·
                <span style={{ color: 'var(--text-secondary)' }}> {item.contact_phone}</span>
              </div>
              {item.risk_reasons && item.risk_reasons.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {item.risk_reasons.slice(0, 3).map((r, i) => (
                    <span key={i} style={{
                      fontSize: 11, padding: '3px 8px',
                      background: '#F8FAFC',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      fontWeight: 500,
                    }}>
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <RiskBadge level={item.risk_level} />
            </div>

            {item.predicted_failure_minutes != null ? (
              <div className="queue-eta">
                <span className="queue-eta-value">{item.predicted_failure_minutes}<span style={{ fontSize: 11 }}>m</span></span>
                <span className="queue-eta-label">ETA (est.)</span>
              </div>
            ) : (
              <div className="queue-eta">
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
              </div>
            )}

            {item.incident_status && (
              <span className={`incident-status ${item.incident_status}`}>
                {item.incident_status}
              </span>
            )}
          </div>
        ))
      )}

      <div style={{ marginTop: 20, padding: 16, background: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Priority System:</strong>{' '}
          <strong style={{ color: 'var(--risk-critical)' }}>P1</strong> = CRITICAL (immediate intervention) ·
          <strong style={{ color: 'var(--risk-high)' }}> P2</strong> = HIGH (respond within minutes) ·
          <strong style={{ color: 'var(--risk-medium)' }}> P3</strong> = MEDIUM (monitor closely) ·
          <strong style={{ color: 'var(--risk-low)' }}> P4</strong> = LOW (no action needed)
        </div>
      </div>
    </div>
  )
}
