import { API_BASE_URL } from '../utils/api'

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''}`,
})

export async function fetchBranchStock(branchId: string) {
  const res = await fetch(`${API_BASE_URL}/inventory/branch/${branchId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Inventory stock failed: ${res.status}`)
  const d = await res.json()
  const list = d?.data ?? d
  return Array.isArray(list) ? list : []
}

export async function fetchPartRequests(branchId: string) {
  const res = await fetch(`${API_BASE_URL}/inventory/requests?branchId=${encodeURIComponent(branchId)}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Part requests failed: ${res.status}`)
  const d = await res.json()
  const list = d?.data ?? d
  return Array.isArray(list) ? list : []
}
