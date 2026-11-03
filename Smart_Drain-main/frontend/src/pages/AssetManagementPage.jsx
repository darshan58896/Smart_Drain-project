import React, { useState, useEffect } from 'react'
import { api, getAuthToken, setAuthToken, clearAuthToken } from '../api'

export default function AssetManagementPage({ onNavigate, onSelectDrain }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  // Login form state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)

  // Assets list & stats
  const [drains, setDrains] = useState([])
  const [loadingDrains, setLoadingDrains] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])
  const [activeTab, setActiveTab] = useState('assets') // 'assets' | 'audit'

  // Register modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [registerForm, setRegisterForm] = useState({
    device_id: '',
    location_name: '',
    ward: '',
    street_landmark: '',
    total_depth_cm: 100,
    latitude: '',
    longitude: '',
    installation_notes: '',
  })
  const [registerError, setRegisterError] = useState('')
  const [registerSubmitting, setRegisterSubmitting] = useState(false)

  // Edit modal state
  const [editingDrain, setEditingDrain] = useState(null)
  const [editForm, setEditForm] = useState({
    location_name: '',
    ward: '',
    street_landmark: '',
    latitude: '',
    longitude: '',
    installation_notes: '',
  })
  const [editError, setEditError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Check auth session
  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setAuthLoading(false)
      return
    }
    api.getMe()
      .then(res => {
        if (res.user) setCurrentUser(res.user)
      })
      .catch(() => {
        clearAuthToken()
      })
      .finally(() => setAuthLoading(false))
  }, [])

  // Load drains whenever user is authenticated or refresh occurs
  const loadDrains = () => {
    setLoadingDrains(true)
    api.getDrains()
      .then(list => {
        if (Array.isArray(list)) setDrains(list)
      })
      .catch(err => console.error('Failed to load drains:', err))
      .finally(() => setLoadingDrains(false))
  }

  const loadAuditLogs = () => {
    api.getAuditLogs()
      .then(res => {
        if (Array.isArray(res.audit_logs)) setAuditLogs(res.audit_logs)
      })
      .catch(err => console.error('Failed to load audit logs:', err))
  }

  useEffect(() => {
    loadDrains()
    if (currentUser) {
      loadAuditLogs()
    }
  }, [currentUser])

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthError('')
    setLoginSubmitting(true)
    try {
      const res = await api.login(username.trim(), password)
      setAuthToken(res.token)
      setCurrentUser(res.user)
      setUsername('')
      setPassword('')
    } catch (err) {
      setAuthError(err.message || 'Login failed. Invalid municipal credentials.')
    } finally {
      setLoginSubmitting(false)
    }
  }

  // Handle Logout
  const handleLogout = () => {
    clearAuthToken()
    setCurrentUser(null)
  }

  // Handle Register Asset
  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    setRegisterError('')

    const deviceId = registerForm.device_id.trim().toUpperCase()
    if (!deviceId) {
      setRegisterError('Device ID is required (e.g., DRAIN_003).')
      return
    }
    if (!registerForm.location_name.trim()) {
      setRegisterError('Drainage Location Name is required.')
      return
    }

    // Coordinate validation
    let lat = null
    let lng = null
    if (registerForm.latitude !== '' && registerForm.latitude !== null && registerForm.latitude !== undefined) {
      lat = parseFloat(registerForm.latitude)
      if (isNaN(lat) || lat < -90 || lat > 90) {
        setRegisterError('Latitude must be a valid number between -90 and 90.')
        return
      }
    }
    if (registerForm.longitude !== '' && registerForm.longitude !== null && registerForm.longitude !== undefined) {
      lng = parseFloat(registerForm.longitude)
      if (isNaN(lng) || lng < -180 || lng > 180) {
        setRegisterError('Longitude must be a valid number between -180 and 180.')
        return
      }
    }

    setRegisterSubmitting(true)
    try {
      await api.registerDrain({
        device_id: deviceId,
        location_name: registerForm.location_name.trim(),
        ward: registerForm.ward.trim() || 'General Zone',
        street_landmark: registerForm.street_landmark.trim(),
        total_depth_cm: Number(registerForm.total_depth_cm) || 100,
        latitude: lat,
        longitude: lng,
        installation_notes: registerForm.installation_notes.trim(),
      })

      setShowRegisterModal(false)
      setRegisterForm({
        device_id: '',
        location_name: '',
        ward: '',
        street_landmark: '',
        total_depth_cm: 100,
        latitude: '',
        longitude: '',
        installation_notes: '',
      })
      loadDrains()
      loadAuditLogs()
    } catch (err) {
      setRegisterError(err.message || 'Failed to register drainage asset.')
    } finally {
      setRegisterSubmitting(false)
    }
  }

  // Handle Open Edit Modal
  const openEditModal = (drain) => {
    setEditingDrain(drain)
    setEditForm({
      location_name: drain.location_name || '',
      ward: drain.ward || '',
      street_landmark: drain.street_landmark || '',
      latitude: drain.latitude !== null && drain.latitude !== undefined ? drain.latitude : '',
      longitude: drain.longitude !== null && drain.longitude !== undefined ? drain.longitude : '',
      installation_notes: drain.installation_notes || '',
    })
    setEditError('')
  }

  // Handle Edit Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setEditError('')

    if (!editForm.location_name.trim()) {
      setEditError('Location Name cannot be empty.')
      return
    }

    let lat = null
    let lng = null
    if (editForm.latitude !== '' && editForm.latitude !== null && editForm.latitude !== undefined) {
      lat = parseFloat(editForm.latitude)
      if (isNaN(lat) || lat < -90 || lat > 90) {
        setEditError('Latitude must be a valid number between -90 and 90.')
        return
      }
    }
    if (editForm.longitude !== '' && editForm.longitude !== null && editForm.longitude !== undefined) {
      lng = parseFloat(editForm.longitude)
      if (isNaN(lng) || lng < -180 || lng > 180) {
        setEditError('Longitude must be a valid number between -180 and 180.')
        return
      }
    }

    setEditSubmitting(true)
    try {
      await api.updateDrainLocation(editingDrain.device_id, {
        location_name: editForm.location_name.trim(),
        ward: editForm.ward.trim(),
        street_landmark: editForm.street_landmark.trim(),
        latitude: lat,
        longitude: lng,
        installation_notes: editForm.installation_notes.trim(),
      })

      setEditingDrain(null)
      loadDrains()
      loadAuditLogs()
    } catch (err) {
      setEditError(err.message || 'Failed to update location metadata.')
    } finally {
      setEditSubmitting(false)
    }
  }

  // Render Status Badge
  const renderStatusBadge = (drain) => {
    const status = drain.status || (drain.is_active_hardware ? 'ONLINE' : (drain.hardware_last_seen ? 'OFFLINE' : 'NO DATA RECEIVED'))
    if (status === 'ONLINE') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--risk-low-bg)', color: 'var(--risk-low)',
          border: '1px solid var(--risk-low-border)',
          borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--risk-low)', display: 'inline-block', boxShadow: '0 0 6px var(--risk-low)' }} />
          ONLINE
        </span>
      )
    }
    if (status === 'OFFLINE') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--risk-medium-bg)', color: 'var(--risk-medium)',
          border: '1px solid var(--risk-medium-border)',
          borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--risk-medium)', display: 'inline-block' }} />
          OFFLINE
        </span>
      )
    }
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: '#EFF6FF', color: 'var(--primary-blue)',
        border: '1px solid #BFDBFE',
        borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary-blue)', display: 'inline-block' }} />
        NO DATA RECEIVED
      </span>
    )
  }

  // Calculation of counts
  const totalAssets = drains.length
  const onlineCount = drains.filter(d => (d.status === 'ONLINE' || d.is_active_hardware)).length
  const offlineCount = drains.filter(d => (d.status === 'OFFLINE' || (!d.is_active_hardware && d.hardware_last_seen))).length
  const noDataCount = drains.filter(d => (d.status === 'NO DATA RECEIVED' || (!d.is_active_hardware && !d.hardware_last_seen))).length
  const gpsCount = drains.filter(d => d.latitude !== null && d.latitude !== undefined && d.longitude !== null && d.longitude !== undefined).length

  return (
    <div className="page-container" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>📍</span>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Drainage Asset Management
            </h1>
            <span style={{
              background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700
            }}>
              MUNICIPAL AUTHORITY
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Register new drainage sensors, configure installation landmarks and verified GPS coordinates, and audit device lifecycle.
          </p>
        </div>

        {/* User Auth Info / Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {currentUser ? (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  👤 {currentUser.name || currentUser.username}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  Role: <strong style={{ color: 'var(--primary-blue)' }}>{currentUser.role}</strong>
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleLogout}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                Log Out
              </button>
            </div>
          ) : (
            <div style={{
              background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E',
              borderRadius: 8, padding: '8px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span>🔒 Read-only view. Sign in with municipal credentials to register or edit assets.</span>
            </div>
          )}

          {currentUser && (
            <button
              className="btn btn-primary"
              onClick={() => { setShowRegisterModal(true); setRegisterError('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}
            >
              <span>➕</span> Register New Asset
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16, marginBottom: 24
      }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>REGISTERED ASSETS</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{totalAssets}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Authorized in allowlist</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 12, color: 'var(--risk-low)', fontWeight: 600 }}>ONLINE HARDWARE</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--risk-low)', marginTop: 4 }}>{onlineCount}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Communicating ≤ 30s</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 12, color: 'var(--risk-medium)', fontWeight: 600 }}>OFFLINE / STALE</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--risk-medium)', marginTop: 4 }}>{offlineCount}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Hardware packet expired</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 12, color: 'var(--primary-blue)', fontWeight: 600 }}>NO DATA RECEIVED</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary-blue)', marginTop: 4 }}>{noDataCount}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Registered, awaiting field power</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>GPS POSITIONED</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#4F46E5', marginTop: 4 }}>{gpsCount} / {totalAssets}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Coordinates configured</div>
        </div>
      </div>

      {/* Authority Login Card (shown if not logged in) */}
      {!currentUser && !authLoading && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
          borderRadius: 12, padding: '24px 28px', marginBottom: 28,
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)', maxWidth: 600
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🔑</span>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Municipal Authority Sign In
            </h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Modifying drainage assets or registering new physical devices requires municipal authorization.
          </p>

          {authError && (
            <div style={{
              background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B',
              padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14
            }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Authority Username
              </label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g., authority_admin"
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Password
              </label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loginSubmitting}
              style={{ marginTop: 6, padding: '10px 16px', fontWeight: 700 }}
            >
              {loginSubmitting ? 'Authenticating...' : 'Sign In as Authority'}
            </button>
          </form>
        </div>
      )}

      {/* Tabs navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 20 }}>
        <button
          onClick={() => setActiveTab('assets')}
          style={{
            background: 'none', border: 'none', padding: '10px 4px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
            color: activeTab === 'assets' ? 'var(--primary-blue)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'assets' ? '2px solid var(--primary-blue)' : '2px solid transparent'
          }}
        >
          Registered Assets ({drains.length})
        </button>
        {currentUser && (
          <button
            onClick={() => setActiveTab('audit')}
            style={{
              background: 'none', border: 'none', padding: '10px 4px', fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              color: activeTab === 'audit' ? 'var(--primary-blue)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'audit' ? '2px solid var(--primary-blue)' : '2px solid transparent'
            }}
          >
            Authority Audit Log
          </button>
        )}
      </div>

      {/* TAB 1: Registered Assets Table */}
      {activeTab === 'assets' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '12px 16px' }}>Device ID</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Installation Location</th>
                  <th style={{ padding: '12px 16px' }}>Ward / Zone</th>
                  <th style={{ padding: '12px 16px' }}>Street / Landmark</th>
                  <th style={{ padding: '12px 16px' }}>Coordinates</th>
                  <th style={{ padding: '12px 16px' }}>Depth (cm)</th>
                  <th style={{ padding: '12px 16px' }}>Last Telemetry</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drains.map(dr => {
                  const hasGps = dr.latitude !== null && dr.latitude !== undefined && dr.longitude !== null && dr.longitude !== undefined
                  return (
                    <tr key={dr.device_id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary-blue)' }}>
                        {dr.device_id}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {renderStatusBadge(dr)}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {dr.location_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Location not configured</span>}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                        {dr.ward || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                        {dr.street_landmark || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {hasGps ? (
                          <span style={{ color: 'var(--text-primary)' }}>
                            {Number(dr.latitude).toFixed(4)}, {Number(dr.longitude).toFixed(4)}
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block', background: '#F1F5F9', color: '#64748B',
                            padding: '2px 8px', borderRadius: 4, fontSize: 11
                          }}>
                            GPS unavailable
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                        {dr.total_depth_cm || 100} cm
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {dr.hardware_last_seen ? (
                          new Date(dr.hardware_last_seen).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Never</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          {currentUser && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEditModal(dr)}
                              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600 }}
                            >
                              ✏️ Edit Location
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              if (onSelectDrain) onSelectDrain(dr.device_id)
                              if (onNavigate) onNavigate('drains')
                            }}
                            style={{ padding: '4px 10px', fontSize: 11, color: 'var(--primary-blue)' }}
                          >
                            Monitor →
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {drains.length === 0 && !loadingDrains && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                      No drainage assets registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Authority Audit Log */}
      {activeTab === 'audit' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            Authority Activity Trail (Last 100 events)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Timestamp</th>
                  <th style={{ padding: '10px 14px' }}>Action</th>
                  <th style={{ padding: '10px 14px' }}>Device ID</th>
                  <th style={{ padding: '10px 14px' }}>Performed By</th>
                  <th style={{ padding: '10px 14px' }}>Changes / Notes</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {new Date(log.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                      <span style={{
                        background: log.action.includes('REGISTER') ? '#DCFCE7' : '#FEF3C7',
                        color: log.action.includes('REGISTER') ? '#166534' : '#92400E',
                        padding: '2px 8px', borderRadius: 4
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {log.device_id}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                      {log.performed_by || 'authority_admin'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {log.changes ? JSON.stringify(log.changes) : log.notes || '—'}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                      No audit records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Register New Drainage Asset */}
      {showRegisterModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 560,
            padding: 28, boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🚰</span>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Register Drainage Sensor Asset
                </h2>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {registerError && (
              <div style={{
                background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B',
                padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 16
              }}>
                ⚠️ {registerError}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    DEVICE ID *
                  </label>
                  <input
                    type="text"
                    value={registerForm.device_id}
                    onChange={e => setRegisterForm({ ...registerForm, device_id: e.target.value })}
                    placeholder="e.g., DRAIN_003"
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    TOTAL DEPTH (CM) *
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="1000"
                    value={registerForm.total_depth_cm}
                    onChange={e => setRegisterForm({ ...registerForm, total_depth_cm: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  LOCATION NAME *
                </label>
                <input
                  type="text"
                  value={registerForm.location_name}
                  onChange={e => setRegisterForm({ ...registerForm, location_name: e.target.value })}
                  placeholder="e.g., Ward 42 - Main Road Junction"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    WARD / ZONE
                  </label>
                  <input
                    type="text"
                    value={registerForm.ward}
                    onChange={e => setRegisterForm({ ...registerForm, ward: e.target.value })}
                    placeholder="e.g., Yelahanka Zone - Ward 42"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    STREET / LANDMARK
                  </label>
                  <input
                    type="text"
                    value={registerForm.street_landmark}
                    onChange={e => setRegisterForm({ ...registerForm, street_landmark: e.target.value })}
                    placeholder="e.g., Near Bus Stand, Gate 2"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{
                background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 10, padding: 14
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  GPS Coordinates (Optional — leave blank if unavailable)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Must be precise coordinates (-90 to 90 lat, -180 to 180 lng). SmartDrain does not invent or assume coordinates.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      LATITUDE (-90 to 90)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={registerForm.latitude}
                      onChange={e => setRegisterForm({ ...registerForm, latitude: e.target.value })}
                      placeholder="e.g. 13.1310"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      LONGITUDE (-180 to 180)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={registerForm.longitude}
                      onChange={e => setRegisterForm({ ...registerForm, longitude: e.target.value })}
                      placeholder="e.g. 77.5680"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  INSTALLATION NOTES
                </label>
                <textarea
                  rows={2}
                  value={registerForm.installation_notes}
                  onChange={e => setRegisterForm({ ...registerForm, installation_notes: e.target.value })}
                  placeholder="Notes about bracket height, pipe diameter, power supply..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowRegisterModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={registerSubmitting}
                  style={{ fontWeight: 700 }}
                >
                  {registerSubmitting ? 'Registering...' : 'Register Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Location Metadata */}
      {editingDrain && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 560,
            padding: 28, boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>✏️</span>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Edit Location — {editingDrain.device_id}
                  </h2>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Telemetry history will be preserved. Only asset location metadata is updated.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setEditingDrain(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {editError && (
              <div style={{
                background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B',
                padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 16
              }}>
                ⚠️ {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  LOCATION NAME *
                </label>
                <input
                  type="text"
                  value={editForm.location_name}
                  onChange={e => setEditForm({ ...editForm, location_name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    WARD / ZONE
                  </label>
                  <input
                    type="text"
                    value={editForm.ward}
                    onChange={e => setEditForm({ ...editForm, ward: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    STREET / LANDMARK
                  </label>
                  <input
                    type="text"
                    value={editForm.street_landmark}
                    onChange={e => setEditForm({ ...editForm, street_landmark: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{
                background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 10, padding: 14
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  GPS Coordinates
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Enter verified coordinates or leave empty to mark as GPS unavailable.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      LATITUDE (-90 to 90)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.latitude}
                      onChange={e => setEditForm({ ...editForm, latitude: e.target.value })}
                      placeholder="e.g. 13.1310"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      LONGITUDE (-180 to 180)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editForm.longitude}
                      onChange={e => setEditForm({ ...editForm, longitude: e.target.value })}
                      placeholder="e.g. 77.5680"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  INSTALLATION NOTES
                </label>
                <textarea
                  rows={2}
                  value={editForm.installation_notes}
                  onChange={e => setEditForm({ ...editForm, installation_notes: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingDrain(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={editSubmitting}
                  style={{ fontWeight: 700 }}
                >
                  {editSubmitting ? 'Saving...' : 'Save Location Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
