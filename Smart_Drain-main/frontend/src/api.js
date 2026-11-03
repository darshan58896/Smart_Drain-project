const BASE = '/api'

const AUTH_TOKEN_KEY = 'smartdrain_authority_token'

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {}
}

export function clearAuthToken() {
  setAuthToken(null)
}

async function apiFetch(path, options = {}) {
  const token = getAuthToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Auth
  login: (username, password) => apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  getMe: () => apiFetch('/auth/me'),

  // Drainage Assets (Authority-controlled)
  registerDrain: (drainData) => apiFetch('/drains', {
    method: 'POST',
    body: JSON.stringify(drainData),
  }),
  updateDrainLocation: (id, locationData) => apiFetch(`/drains/${id}/location`, {
    method: 'PATCH',
    body: JSON.stringify(locationData),
  }),
  updateDrain: (id, drainData) => apiFetch(`/drains/${id}`, {
    method: 'PUT',
    body: JSON.stringify(drainData),
  }),
  getAuditLogs: () => apiFetch('/drains/audit-log'),

  getDrains:         ()      => apiFetch('/drains'),
  getActiveDrains:   ()      => apiFetch('/drains/active'),
  getHardwareStatus: ()      => apiFetch('/drains/status'),
  getDrain:          (id)    => apiFetch(`/drains/${id}`),
  getHistory:        (id, limit = 100) => apiFetch(`/drains/${id}/history?limit=${limit}`),
  getIncidents:      ()      => apiFetch('/incidents'),
  getDashboard:      ()      => apiFetch('/dashboard'),
  getPriorityQueue:  ()      => apiFetch('/priority-queue'),
  getHealth:         ()      => apiFetch('/health'),
  getMlHealth:       ()      => apiFetch('/ml/health'),

  acknowledge: (id, notes) => apiFetch(`/incidents/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  }),
  dispatch: (id, notes) => apiFetch(`/incidents/${id}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  }),
  resolve: (id, notes) => apiFetch(`/incidents/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  }),

  // Demo
  simulate: (scenario, device_id = 'DRAIN_001') => apiFetch('/demo/simulate', {
    method: 'POST',
    body: JSON.stringify({ scenario, device_id }),
  }),
  startAutoStream: (scenario, interval_ms) => apiFetch('/demo/autostream', {
    method: 'POST',
    body: JSON.stringify({ scenario, interval_ms }),
  }),
  stopAutoStream: () => apiFetch('/demo/autostream/stop', { method: 'POST' }),
}
