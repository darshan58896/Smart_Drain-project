import React from 'react'

export function RiskBadge({ level }) {
  if (!level) return null
  return (
    <span className={`risk-badge ${level}`}>
      {level === 'CRITICAL' && '🔴'}
      {level === 'HIGH'     && '🟠'}
      {level === 'MEDIUM'   && '🟡'}
      {level === 'LOW'      && '🟢'}
      {level === 'UNKNOWN'  && '⚫'}
      {' '}{level}
    </span>
  )
}

export function PriorityBadge({ priority }) {
  if (!priority) return null
  return <span className={`priority-badge ${priority}`}>{priority}</span>
}

export function SensorStatusBadge({ status }) {
  const icons = {
    OK: '✓',
    WARNING: '⚠',
    OFFLINE: '✗',
    INVALID_READING: '!',
    POSSIBLE_OBSTRUCTION: '?',
  }
  return (
    <span className={`sensor-status ${status || 'OFFLINE'}`}>
      {icons[status] || '?'} {status || 'OFFLINE'}
    </span>
  )
}

export function IncidentStatusBadge({ status }) {
  return <span className={`incident-status ${status}`}>{status}</span>
}

export function LevelBar({ percent, riskLevel }) {
  const clamped = Math.min(100, Math.max(0, percent || 0))
  return (
    <div className="level-bar-container">
      <div className="level-bar-header">
        <span className="data-label">Water Level</span>
        <span className="data-value" style={{ fontSize: '18px' }}>{clamped.toFixed(0)}%</span>
      </div>
      <div className="level-bar-track">
        <div
          className={`level-bar-fill ${riskLevel || 'LOW'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

export function DataRow({ label, value, unit, mono = true }) {
  return (
    <div className="data-row">
      <span className="data-label">{label}</span>
      <span className={`data-value${mono ? '' : ' '}`} style={!mono ? { fontFamily: 'var(--font-sans)' } : {}}>
        {value ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
        {unit && value != null && <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  )
}

export function Spinner() {
  return <div className="spinner" />
}

export function EmptyState({ icon = '📭', text = 'No data yet' }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-text">{text}</div>
    </div>
  )
}

export function RiskReasons({ reasons, riskLevel }) {
  if (!reasons || reasons.length === 0) return null
  return (
    <div className="risk-reasons">
      {reasons.map((r, i) => (
        <div key={i} className={`risk-reason ${riskLevel || ''}`}>
          <span>⚑</span>
          <span>{r}</span>
        </div>
      ))}
    </div>
  )
}

export function EtaWarning({ minutes }) {
  if (minutes == null) return null
  return (
    <div className="eta-critical">
      <span className="eta-icon">⏱</span>
      <span>
        Estimated time to critical level:{' '}
        <strong>{minutes} min</strong>
        <span style={{ fontSize: '11px', marginLeft: 6, opacity: 0.7 }}>(estimate)</span>
      </span>
    </div>
  )
}

export function AlertBanner({ level, title, message }) {
  if (!level) return null
  return (
    <div className={`alert-banner ${level.toLowerCase()}`}>
      <span className="alert-icon">
        {level === 'CRITICAL' ? '🚨' : '⚠️'}
      </span>
      <div className="alert-content">
        <div className="alert-title">{title}</div>
        <div className="alert-message">{message}</div>
      </div>
    </div>
  )
}
