import React, { useState, useEffect } from 'react'
import { useSocket } from './hooks/useSocket'
import { api } from './api'

import Sidebar        from './components/Sidebar'
import GlobalAlertBanner from './components/GlobalAlertBanner'
import DashboardPage  from './pages/DashboardPage'
import DrainDetailPage from './pages/DrainDetailPage'
import MapPage        from './pages/MapPage'
import PriorityQueuePage from './pages/PriorityQueuePage'
import IncidentsPage  from './pages/IncidentsPage'
import SensorHealthPage from './pages/SensorHealthPage'
import DemoControlPage from './pages/DemoControlPage'
import AssetManagementPage from './pages/AssetManagementPage'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [refreshKey, setRefreshKey] = useState(0)
  const [drains, setDrains] = useState([])
  const [selectedDrainId, setSelectedDrainId] = useState('DRAIN_001')
  const [now, setNow] = useState(Date.now())

  const {
    connected,
    lastTelemetry,
    latestByDevice,
    dashboardUpdate,
    newIncident,
    incidentUpdate,
    deviceStatus,
  } = useSocket()

  // 1-second heartbeat to dynamically expire disconnected hardware (>30s)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Load registered drains with initial presence info
  useEffect(() => {
    api.getDrains()
      .then(d => { if (Array.isArray(d)) setDrains(d) })
      .catch(() => {})
  }, [refreshKey, dashboardUpdate])

  // Update device presence when device_status event is broadcasted
  useEffect(() => {
    if (!deviceStatus || !Array.isArray(deviceStatus.active_devices)) return
    const activeIds = deviceStatus.active_devices
    setDrains(prev =>
      prev.map(dr => ({
        ...dr,
        is_active_hardware: activeIds.includes(dr.device_id),
        is_online: activeIds.includes(dr.device_id),
      }))
    )
  }, [deviceStatus])

  // Update drains array in-place when fresh telemetry arrives
  // Only valid physical hardware telemetry (source === 'hardware') refreshes hardware_last_seen
  useEffect(() => {
    if (!lastTelemetry) return
    const isHardware = lastTelemetry.source === 'hardware'
    setDrains(prev =>
      prev.map(dr => {
        if (dr.device_id === lastTelemetry.device_id) {
          return {
            ...dr,
            latest_telemetry: { ...dr.latest_telemetry, ...lastTelemetry },
            ...(isHardware ? {
              hardware_last_seen: lastTelemetry.timestamp,
              is_active_hardware: true,
              is_online: true,
            } : {}),
          }
        }
        return dr
      })
    )
  }, [lastTelemetry])

  // Actively communicating physical hardware devices (received hardware packet within last 30s)
  const activeDrains = React.useMemo(() => {
    return drains.filter(dr => {
      if (!dr.hardware_last_seen) return false
      const ageMs = now - new Date(dr.hardware_last_seen).getTime()
      return ageMs <= 30000
    })
  }, [drains, now])

  // Synchronize selectedDrainId to an active drain if available
  useEffect(() => {
    if (activeDrains.length > 0) {
      if (!activeDrains.some(d => d.device_id === selectedDrainId)) {
        setSelectedDrainId(activeDrains[0].device_id)
      }
    }
  }, [activeDrains, selectedDrainId])

  const [criticalCount, setCriticalCount] = useState(0)

  // Track critical incidents for sidebar badge
  useEffect(() => {
    if (dashboardUpdate) {
      setCriticalCount((dashboardUpdate.critical_drains || 0) + (dashboardUpdate.active_incidents || 0))
    }
  }, [dashboardUpdate])

  // Flash notification on new incident
  const [notification, setNotification] = useState(null)
  useEffect(() => {
    if (!newIncident) return
    setNotification(newIncident)
    const t = setTimeout(() => setNotification(null), 8000)
    return () => clearTimeout(t)
  }, [newIncident])

  return (
    <div className="app-layout">
      {/* Top Header */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">🚰</div>
          <div>
            <div className="topbar-title">SmartDrain</div>
            <div className="topbar-subtitle">Predictive Drainage Command Center</div>
          </div>
        </div>

        <div className="topbar-status">
          <span className="live-badge">LIVE</span>
          <div className={`status-pill ${connected ? 'online' : 'offline'}`}>
            <span className="pulse-dot" />
            {connected ? 'Backend Online' : 'Backend Offline'}
          </div>

          {lastTelemetry && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Updated:{' '}
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {new Date(lastTelemetry.timestamp).toLocaleTimeString('en-IN')}
              </span>
            </div>
          )}

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRefreshKey(k => k + 1)}
            title="Refresh dashboard data"
            style={{ padding: '5px 10px', fontSize: 12 }}
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      <div className="app-body">
        <Sidebar
          currentPage={page}
          onNavigate={setPage}
          criticalCount={criticalCount}
        />

        <main className="main-content">
          {/* Floating notification for new incidents */}
          {notification && (
            <div style={{
              position: 'fixed', top: 80, right: 24, zIndex: 1000,
              background: '#FFFFFF',
              border: '1px solid #FECACA',
              borderRadius: 12,
              padding: '14px 20px',
              boxShadow: '0 8px 30px rgba(15, 23, 42, 0.12)',
              display: 'flex', alignItems: 'center', gap: 12,
              animation: 'slide-in 0.3s ease',
              maxWidth: 380,
            }}>
              <span style={{ fontSize: 24 }}>🚨</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: 'var(--risk-critical)', fontSize: 13 }}>
                  NEW INCIDENT — {notification.priority}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {notification.deviceId} · {notification.riskLevel} risk detected
                </div>
                <button
                  style={{ marginTop: 6, fontSize: 11, background: 'none', border: 'none',
                           color: 'var(--primary-blue)', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                  onClick={() => {
                    if (notification.deviceId) setSelectedDrainId(notification.deviceId)
                    setPage('drains')
                    setNotification(null)
                  }}
                >
                  View Incidents →
                </button>
              </div>
              <button
                style={{ marginLeft: 'auto', background: 'none', border: 'none',
                         color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}
                onClick={() => setNotification(null)}
              >×</button>
            </div>
          )}

          {/* Global Alert Banner — Visible only when an actively connected hardware drain reaches HIGH or CRITICAL */}
          <GlobalAlertBanner
            drains={activeDrains}
            latestByDevice={latestByDevice}
            onSelectDrain={setSelectedDrainId}
            onNavigate={setPage}
          />

          {/* Pages */}
          {page === 'dashboard' && (
            <DashboardPage
              dashboardData={dashboardUpdate}
              lastTelemetry={lastTelemetry}
              latestByDevice={latestByDevice}
              connected={connected}
              refreshKey={refreshKey}
              onNavigate={setPage}
              selectedDrainId={selectedDrainId}
              setSelectedDrainId={setSelectedDrainId}
              drains={drains}
              activeDrains={activeDrains}
            />
          )}
          {page === 'assets' && (
            <AssetManagementPage
              onNavigate={setPage}
              onSelectDrain={setSelectedDrainId}
            />
          )}
          {page === 'drains' && (
            <DrainDetailPage
              lastTelemetry={lastTelemetry}
              latestByDevice={latestByDevice}
              refreshKey={refreshKey}
              selectedDrainId={selectedDrainId}
              onSelectDrain={setSelectedDrainId}
              drains={drains}
              activeDrains={activeDrains}
            />
          )}
          {page === 'map' && (
            <MapPage dashboardData={dashboardUpdate} />
          )}
          {page === 'priority' && (
            <PriorityQueuePage dashboardData={dashboardUpdate} />
          )}
          {page === 'incidents' && (
            <IncidentsPage incidentUpdate={incidentUpdate} />
          )}
          {page === 'sensors' && (
            <SensorHealthPage
              lastTelemetry={lastTelemetry}
              latestByDevice={latestByDevice}
              drains={drains}
              activeDrains={activeDrains}
            />
          )}
          {page === 'demo' && (
            <DemoControlPage drains={drains} />
          )}
        </main>
      </div>
    </div>
  )
}
