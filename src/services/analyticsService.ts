import { API_BASE_URL } from '../utils/api'

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''}`,
})

function buildQuery(from?: Date | null, to?: Date | null): string {
  const params = new URLSearchParams()
  if (from) params.set('from', from.toISOString().split('T')[0])
  if (to)   params.set('to',   to.toISOString().split('T')[0])
  const q = params.toString()
  return q ? `?${q}` : ''
}

export async function fetchEfficiencyMetrics(from?: Date | null, to?: Date | null) {
  const res = await fetch(`${API_BASE_URL}/analytics/efficiency${buildQuery(from, to)}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Analytics efficiency failed: ${res.status}`)
  const d = await res.json()
  return d?.data ?? d
}

export async function fetchBranchPerformance(from?: Date | null, to?: Date | null) {
  const res = await fetch(`${API_BASE_URL}/analytics/branches${buildQuery(from, to)}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Analytics branches failed: ${res.status}`)
  const d = await res.json()
  const list = d?.data ?? d
  return Array.isArray(list) ? list : []
}
