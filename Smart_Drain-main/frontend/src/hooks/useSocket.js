import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || ''

let globalSocket = null

export function useSocket() {
  const [connected, setConnected]           = useState(false)
  const [lastTelemetry, setLastTelemetry]   = useState(null)
  const [latestByDevice, setLatestByDevice] = useState({}) // device_id → latest telemetry
  const [dashboardUpdate, setDashboardUpdate] = useState(null)
  const [newIncident, setNewIncident]       = useState(null)
  const [incidentUpdate, setIncidentUpdate] = useState(null)
  const [deviceStatus, setDeviceStatus]     = useState(null)

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      })
    }

    const socket = globalSocket

    const onConnect    = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    // Hardware telemetry — updates hardware presence and latestByDevice
    const onTelemetry = (data) => {
      setLastTelemetry(data)
      if (data && data.device_id) {
        setLatestByDevice(prev => ({ ...prev, [data.device_id]: data }))
      }
    }

    // Demo telemetry — updates latestByDevice for UI charts but does NOT
    // affect hardware presence (App.jsx checks source === 'hardware' separately)
    const onDemoTelemetry = (data) => {
      if (data && data.device_id) {
        setLatestByDevice(prev => ({ ...prev, [data.device_id]: data }))
      }
    }

    const onDashboard      = (data) => setDashboardUpdate(data)
    const onNewIncident    = (data) => setNewIncident(data)
    const onIncidentUpdate = (data) => setIncidentUpdate(data)

    // Device-level status broadcast (active_devices array from backend)
    const onDeviceStatus     = (data) => setDeviceStatus(data)
    const onDeviceRegistered = (data) => setDeviceStatus(prev => ({ ...(prev || {}), newly_registered: data }))
    const onDeviceUpdated    = (data) => setDeviceStatus(prev => ({ ...(prev || {}), newly_updated: data }))

    socket.on('connect',           onConnect)
    socket.on('disconnect',        onDisconnect)
    socket.on('telemetry',         onTelemetry)
    socket.on('demo_telemetry',    onDemoTelemetry)
    socket.on('dashboard_update',  onDashboard)
    socket.on('new_incident',      onNewIncident)
    socket.on('incident_update',   onIncidentUpdate)
    socket.on('device_status',     onDeviceStatus)
    socket.on('device_registered', onDeviceRegistered)
    socket.on('device_updated',    onDeviceUpdated)

    setConnected(socket.connected)

    return () => {
      socket.off('connect',           onConnect)
      socket.off('disconnect',        onDisconnect)
      socket.off('telemetry',         onTelemetry)
      socket.off('demo_telemetry',    onDemoTelemetry)
      socket.off('dashboard_update',  onDashboard)
      socket.off('new_incident',      onNewIncident)
      socket.off('incident_update',   onIncidentUpdate)
      socket.off('device_status',     onDeviceStatus)
      socket.off('device_registered', onDeviceRegistered)
      socket.off('device_updated',    onDeviceUpdated)
    }
  }, [])

  return { connected, lastTelemetry, latestByDevice, dashboardUpdate, newIncident, incidentUpdate, deviceStatus }
}
