import { API_BASE_URL } from '../utils/api'

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''}`,
})

export async function fetchEfficiencyMetrics() {
  const res = await fetch(`${API_BASE_URL}/analytics/efficiency`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Analytics efficiency failed: ${res.status}`)
  const d = await res.json()
  return d?.data ?? d
}

export async function fetchBranchPerformance() {
  const res = await fetch(`${API_BASE_URL}/analytics/branches`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Analytics branches failed: ${res.status}`)
  const d = await res.json()
  return (d?.data ?? d ?? []) as unknown[]
}
