import React from 'react'

const NAV_ITEMS = [
  { id: 'dashboard', icon: '📊', label: 'Command Dashboard' },
  { id: 'assets',    icon: '📍', label: 'Asset Management' },
  { id: 'drains',    icon: '🚰', label: 'Drain Monitor' },
  { id: 'map',       icon: '🗺️', label: 'Live Map' },
  { id: 'priority',  icon: '🚨', label: 'Priority Queue' },
  { id: 'incidents', icon: '📋', label: 'Incidents' },
  { id: 'sensors',   icon: '📡', label: 'Sensor Health' },
  { id: 'demo',      icon: '🎮', label: 'Demo Control' },
]

export default function Sidebar({ currentPage, onNavigate, criticalCount }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Navigation</div>
        {NAV_ITEMS.map(item => (
          <div
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onNavigate(item.id) }}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'incidents' && criticalCount > 0 && (
              <span className="nav-badge">{criticalCount}</span>
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}
