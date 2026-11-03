import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api'

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const RISK_COLORS = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#22c55e',
  UNKNOWN:  '#6b7280',
}

function createColoredIcon(color) {
  return L.divIcon({
    html: `
      <div style="
        width: 22px; height: 22px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 10px ${color}90;
      "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    className: '',
  })
}

export default function MapPage({ dashboardData }) {
  const [drains, setDrains] = useState([])

  useEffect(() => {
    api.getDrains()
      .then(res => { if (Array.isArray(res)) setDrains(res) })
      .catch(console.error)
  }, [dashboardData])

  // STRICT REQUIREMENT: Only pin drains that have verified, valid GPS coordinates.
  // Never invent coordinates or default to BMSIT for drains missing GPS.
  const mappedDrains = drains.filter(d => {
    if (d.latitude === null || d.latitude === undefined || d.longitude === null || d.longitude === undefined) return false
    const lat = Number(d.latitude)
    const lng = Number(d.longitude)
    return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  })

  const unmappedDrains = drains.filter(d => !mappedDrains.some(m => m.device_id === d.device_id))

  // Map center defaults to the first mapped drain, or standard city view if no drains are mapped yet
  const defaultCenter = mappedDrains.length > 0
    ? [Number(mappedDrains[0].latitude), Number(mappedDrains[0].longitude)]
    : [13.1276, 77.5696]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Live Drainage Map</h1>
          <p className="page-subtitle">Real-time municipal risk visualization for verified GPS coordinates</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{mappedDrains.length}</strong> pinned on map · <strong>{unmappedDrains.length}</strong> GPS unavailable
          </span>
        </div>
      </div>

      {/* Legend & Summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Risk Legend:
            </span>
            {Object.entries(RISK_COLORS).map(([level, color]) => (
              <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid white', boxShadow: `0 0 6px ${color}80` }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{level}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Authority GPS Verification: <strong style={{ color: 'var(--primary-blue)' }}>Strict Coordinates Enforced</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: unmappedDrains.length > 0 ? '1fr 300px' : '1fr', gap: 16, marginBottom: 20 }}>
        {/* Map Container */}
        <div className="map-container" style={{ minHeight: 520, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <MapContainer
            center={defaultCenter}
            zoom={15}
            style={{ width: '100%', height: '100%', minHeight: 520 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {mappedDrains.map(drain => {
              const t     = drain.latest_telemetry
              const risk  = t?.risk_level || 'UNKNOWN'
              const color = RISK_COLORS[risk] || RISK_COLORS.UNKNOWN
              const lat   = Number(drain.latitude)
              const lng   = Number(drain.longitude)

              return (
                <React.Fragment key={drain.device_id}>
                  {/* Risk radius circle */}
                  <Circle
                    center={[lat, lng]}
                    radius={t?.risk_level === 'CRITICAL' ? 80 : t?.risk_level === 'HIGH' ? 50 : 30}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.15,
                      weight: 2,
                      opacity: 0.6,
                    }}
                  />
                  <Marker position={[lat, lng]} icon={createColoredIcon(color)}>
                    <Popup>
                      <div style={{ minWidth: 220, fontFamily: 'Inter, sans-serif' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--primary-blue)' }}>
                            {drain.device_id}
                          </span>
                          <span style={{
                            background: color, color: '#FFFFFF', padding: '2px 8px', borderRadius: 4,
                            fontSize: 10, fontWeight: 700
                          }}>
                            {risk}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {drain.location_name || 'Location not configured'}
                        </div>
                        {drain.street_landmark && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                            📍 {drain.street_landmark}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                          GPS: {lat.toFixed(4)}, {lng.toFixed(4)}
                        </div>

                        {t ? (
                          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 6, fontSize: 12, lineHeight: 1.8 }}>
                            <div>Water Level: <strong>{t.water_level_cm != null ? `${t.water_level_cm.toFixed(1)} cm (${t.water_level_percent}%)` : 'No reading'}</strong></div>
                            <div>Rain: <strong>{t.rain_value == null && t.rain_intensity == null ? 'Not installed (shared)' : (t.rain_intensity || 'Dry')}</strong></div>
                            <div>Flow: <strong>{t.flow_rate_lpm != null ? `${t.flow_rate_lpm.toFixed(1)} L/min` : 'Not installed'}</strong></div>
                            {t.predicted_failure_minutes != null && (
                              <div style={{ color: '#ef4444', fontWeight: 700 }}>
                                ⏱ ETA to overflow: ~{t.predicted_failure_minutes} min
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                            No live sensor readings received
                          </div>
                        )}
                        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #E2E8F0', fontSize: 10, color: '#94A3B8' }}>
                          Ward: {drain.ward || '—'} · Source: {t?.source === 'hardware' ? 'LIVE HARDWARE' : 'None'}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              )
            })}
          </MapContainer>
        </div>

        {/* Sidebar for Drains without GPS Coordinates */}
        {unmappedDrains.length > 0 && (
          <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>📍</span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                GPS Unavailable
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14 }}>
              The following registered drainage assets do not have verified GPS coordinates configured. Pins are strictly not guessed.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 420 }}>
              {unmappedDrains.map(dr => (
                <div
                  key={dr.device_id}
                  style={{
                    background: '#F8FAFC', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-blue)' }}>
                      {dr.device_id}
                    </span>
                    <span style={{
                      fontSize: 10, background: '#E2E8F0', color: '#475569',
                      padding: '1px 6px', borderRadius: 4, fontWeight: 600
                    }}>
                      GPS unavailable
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {dr.location_name || 'Location not configured'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Ward: {dr.ward || '—'} {dr.street_landmark ? `· ${dr.street_landmark}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
