import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { SensorStatusBadge, Spinner } from '../components/Shared'

function SensorCard({ icon, name, status, detail, value, unit }) {
  return (
    <div className="sensor-item">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="sensor-icon">{icon}</span>
        <SensorStatusBadge status={status} />
      </div>
      <span className="sensor-name">{name}</span>
      {value != null && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
          {value}
          {unit && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
        </div>
      )}
      {detail && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{detail}</div>
      )}
    </div>
  )
}

export default function SensorHealthPage({ lastTelemetry, latestByDevice = {} }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState('DRAIN_001')
  const [drains,   setDrains]   = useState([])
  const [drain,    setDrain]    = useState(null)
  const [loading,  setLoading]  = useState(true)

  // Fetch all registered devices for the selector
  useEffect(() => {
    api.getDrains()
      .then(d => { if (Array.isArray(d)) setDrains(d) })
      .catch(console.error)
  }, [])

  // Load selected device detail
  useEffect(() => {
    setLoading(true)
    api.getDrain(selectedDeviceId)
      .then(setDrain)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedDeviceId])

  // Update when new telemetry arrives for the currently selected device
  useEffect(() => {
    if (!lastTelemetry || lastTelemetry.device_id !== selectedDeviceId) return
    setDrain(prev => prev ? {
      ...prev,
      latest_telemetry: { ...prev.latest_telemetry, ...lastTelemetry },
    } : prev)
  }, [lastTelemetry, selectedDeviceId])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>

  // Merge stored latest_telemetry with live Socket.IO packet (if any) for this device
  const livePacket = latestByDevice[selectedDeviceId]
  const t = livePacket
    ? { ...drain?.latest_telemetry, ...livePacket }
    : drain?.latest_telemetry

  // NodeMCU 1 (DRAIN_001) has: ultrasonic + rain + flow + buzzer
  // Secondary nodes (if registered) have: ultrasonic only — rain and flow sensors are NOT present
  const isDrain1 = selectedDeviceId === 'DRAIN_001'

  // Derive individual sensor statuses
  const us100Status = !t ? 'OFFLINE'
    : t.sensor_status === 'INVALID_READING' || t.sensor_status === 'OFFLINE' ? t.sensor_status
    : t.sensor_status === 'POSSIBLE_OBSTRUCTION' ? 'POSSIBLE_OBSTRUCTION'
    : 'OK'

  const rainStatus = !isDrain1 ? 'N/A'
    : !t ? 'OFFLINE'
    : (t.rain_value === null || t.rain_value === undefined) ? 'OFFLINE'
    : t.rain_value < 0 || t.rain_value > 1023 ? 'WARNING'
    : 'OK'

  const flowStatus = !isDrain1 ? 'N/A'
    : !t ? 'OFFLINE'
    : t.flow_rate_lpm === null ? 'OFFLINE'
    : t.flow_rate_lpm < 0 ? 'WARNING'
    : 'OK'

  const espStatus  = t ? 'OK' : 'OFFLINE'
  const wifiStatus = t?.wifi_status === 'ONLINE' ? 'OK' : 'OFFLINE'

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Sensor Health</h1>
          <p className="page-subtitle">
            {selectedDeviceId} · {drain?.location_name || 'Location not configured'} · {drain?.ward || 'Ward unassigned'}
          </p>
        </div>

        {/* Device selector */}
        {drains.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', padding: '6px 12px', borderRadius: 10, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Device:</span>
            <select
              value={selectedDeviceId}
              onChange={e => setSelectedDeviceId(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontWeight: 700, color: 'var(--primary-blue)', fontSize: 13, cursor: 'pointer', outline: 'none', fontFamily: 'var(--font-mono)' }}
            >
              {drains.map(d => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_id} ({d.location_name || 'Location not configured'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="card-title">Sensor Overview — {selectedDeviceId}</span>
            {t?.source === 'hardware' && (
              <span style={{
                background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0',
                borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
                LIVE HARDWARE
              </span>
            )}
          </div>
        </div>
        <div className="sensor-grid">
          {/* US-100 Ultrasonic — present on both NodeMCUs */}
          <SensorCard
            icon="📏"
            name="US-100 Ultrasonic"
            status={us100Status}
            value={t?.water_distance_cm?.toFixed(2)}
            unit="cm"
            detail={t?.sensor_detail || (us100Status === 'POSSIBLE_OBSTRUCTION' ? 'Possible obstruction detected' : null)}
          />

          {/* Rain sensor — NodeMCU 1 only */}
          <SensorCard
            icon="🌧"
            name={isDrain1 ? 'Rain Sensor (AO)' : 'Rain Sensor — not installed'}
            status={rainStatus}
            value={isDrain1 ? t?.rain_value : null}
            detail={
              isDrain1
                ? `Intensity: ${t?.rain_intensity || '—'}`
                : 'Rain sensor is connected to NodeMCU 1 (DRAIN_001) only. Readings are shared to risk engine for both locations.'
            }
          />

          {/* Flow sensor — NodeMCU 1 only */}
          <SensorCard
            icon="💧"
            name={isDrain1 ? 'YF-S201 Flow' : 'Flow Sensor — not installed'}
            status={flowStatus}
            value={isDrain1 ? t?.flow_rate_lpm?.toFixed(2) : null}
            unit={isDrain1 ? 'L/min' : undefined}
            detail={
              isDrain1
                ? 'Pulse-based outflow measurement'
                : 'Flow sensor is connected to NodeMCU 1 (DRAIN_001) only. Not present on this board.'
            }
          />

          <SensorCard
            icon="🔌"
            name="ESP8266 NodeMCU"
            status={espStatus}
            value={t ? 'Online' : 'Offline'}
            detail={t ? `Last seen: ${new Date(t.timestamp).toLocaleTimeString('en-IN')}` : 'No data received'}
          />
          <SensorCard
            icon="📶"
            name="Wi-Fi / Connectivity"
            status={wifiStatus}
            value={t?.wifi_status || 'OFFLINE'}
            detail={wifiStatus === 'OK' ? 'Connected to backend' : 'Local monitoring mode active'}
          />
        </div>
      </div>

      {/* Sensor Health Rules Explanation */}
      <div className="card">
        <div className="card-header"><span className="card-title">Sensor Fault Detection Rules</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 2 }}>
          {[
            ['US-100 OFFLINE', 'No echo pulse received (timeout). Sensor may be disconnected or obstructed.'],
            ['US-100 INVALID_READING', 'Distance ≤ 0 cm or > 400 cm — outside valid range.'],
            ['US-100 POSSIBLE_OBSTRUCTION', 'Sudden distance jump > 80% of drain depth in a single reading cycle.'],
            ['Rain Sensor WARNING', 'Analog value outside 0–1023 ADC range.'],
            ['Flow Sensor WARNING', 'Negative flow rate reported (sensor fault).'],
            ['Sensor Fault ≠ Drainage Failure', 'A sensor fault does NOT automatically trigger a HIGH/CRITICAL risk. Risk is capped and reasons are flagged separately.'],
            ['Secondary Nodes — Rain/Flow absent', 'Nodes with ultrasonic only are assessed on water level and rise rate only without triggering missing sensor alerts.'],
          ].map(([rule, desc], i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', minWidth: 220, flexShrink: 0 }}>{rule}</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
