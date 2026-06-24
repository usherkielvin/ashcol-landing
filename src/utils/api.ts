const PROD_API_BASE_URL = 'https://ashcol.up.railway.app/api'

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? PROD_API_BASE_URL : 'http://localhost:8080/api')
export const SERVER_BASE_URL = API_BASE_URL.replace(/\/api$/, '')

/** Normalize branch id for API writes (mirrors backend scopedBranchId). */
export function resolveScopedBranchId(branchId?: string | null): string {
  const raw = (branchId || '').trim()
  if (!raw) return ''
  const upper = raw.toUpperCase()
  if (upper.startsWith('BR-TAGUIG') || upper.startsWith('2880C29E-581C-11F1-BF8C-74D4DD6DFC0B')) {
    if (upper.includes('SERVICE')) return 'BR-TAGUIG-SERVICES'
    return 'BR-TAGUIG-SALES'
  }
  return raw.replace(/-(sales|services|service)$/i, '')
}

export function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return `${SERVER_BASE_URL}${path}`
}

/** Maps backend roles to user-friendly titles */
export function formatRole(role?: string): string {
  if (!role) return ''
  const r = role.toUpperCase()
  if (r === 'MANAGER') return 'OIC'
  if (r === 'ADMIN') return 'ADMIN'
  if (r === 'OIC') return 'OIC'
  return r
}

/** Strips or replaces legacy role suffixes like " - MANAGER" with " - OIC" for UI display */
export function formatDisplayUserLabel(label?: string | null): string {
  if (!label) return '-'
  return label
    .replace(/\s*-\s*MANAGER$/i, ' - OIC')
    .replace(/\s*-\s*manager$/i, ' - OIC')
}

/** Simplifies and formats branch names for display */
export function formatBranchName(name?: string | null): string {
  if (!name) return ''
  const upper = name.trim().toUpperCase()
  if (upper.includes('TAGUIG') && (upper.includes('SERVICE') || upper.includes('SERVICES') || upper.includes('DEPT'))) {
    return 'TAGUIG - SERVICES'
  }
  if (upper.includes('TAGUIG') || upper.includes('HEAD OFFICE')) {
    return 'TAGUIG - SALES'
  }
  if (upper.includes('SILANG') || upper.includes('STA ROSA') || upper.includes('STA. ROSA') || upper.includes('STO ROSA') || upper.includes('STO. ROSA')) {
    return 'SILANG'
  }
  if (upper.includes('DASMA') || upper.includes('DASMARIÑAS') || upper.includes('DASMARINAS')) {
    return 'DASMA'
  }
  // Strip "ASHCOL" prefix (with optional dash/hyphen and space) from all other branches
  return upper.replace(/^ASHCOL\s*-?\s*/i, '').trim()
}

type PortalUserLike = {
  role?: string | null
  branchId?: string | null
  jobTitle?: string | null
}

const normalizeUserValue = (value?: string | null) => (value || '').trim().toLowerCase()

export function isCoordinatorOrOicUser(user?: PortalUserLike | null) {
  if (!user) return false
  const role = normalizeUserValue(user.role)
  const jobTitle = normalizeUserValue(user.jobTitle)
  return role === 'oic'
    || jobTitle === 'coordinator'
    || jobTitle.includes('coor')
    || jobTitle === 'office in charge'
    || jobTitle === 'officer in charge'
    || jobTitle === 'oic'
}

export function isSalesWorkspaceUser(user?: PortalUserLike | null) {
  if (!user) return false
  if (isCoordinatorOrOicUser(user)) return true
  const branchId = normalizeUserValue(user.branchId)
  const jobTitle = normalizeUserValue(user.jobTitle)

  return branchId.endsWith('-sales')
    || branchId === 'br-taguig-sales'
    || jobTitle.includes('sales')
}

export function isServiceWorkspaceUser(user?: PortalUserLike | null) {
  if (!user) return false
  if (isCoordinatorOrOicUser(user)) return false
  const branchId = normalizeUserValue(user.branchId)
  const jobTitle = normalizeUserValue(user.jobTitle)

  return branchId.endsWith('-services')
    || branchId.endsWith('-service')
    || branchId === 'br-taguig-services'
    || branchId === 'br-taguig-service'
    || jobTitle.includes('service')
}

export function getPortalHomePath(user?: PortalUserLike | null) {
  const role = normalizeUserValue(user?.role)
  if (role === 'admin') return '/audit-report'
  if (isSalesWorkspaceUser(user)) return '/audit-report?tab=submit'
  if (isServiceWorkspaceUser(user)) return '/service-report'
  return '/audit-report?tab=submit'
}

/** Fetch tickets; retries without categoryGroup if the API rejects the filter (older DB / deploy). */
export async function fetchTicketsPage(
  endpoint: string,
  token: string,
  options: { size?: number; categoryGroup?: 'FIELD' | 'OFFICE' } = {},
): Promise<unknown[]> {
  const size = options.size ?? 200
  const headers = { Authorization: `Bearer ${token}` }
  const base = { page: '0', size: String(size) }

  const attempts: Record<string, string>[] = options.categoryGroup
    ? [{ ...base, categoryGroup: options.categoryGroup }, base]
    : [base]

  let lastStatus = 0
  let lastBody = ''
  for (const params of attempts) {
    const res = await fetch(`${API_BASE_URL}${endpoint}?${new URLSearchParams(params)}`, { headers })
    if (res.ok) {
      const data = await res.json()
      return data?.data?.tickets || data?.tickets || []
    }
    lastStatus = res.status
    lastBody = await res.text().catch(() => '')
    if (params.categoryGroup) {
      console.warn(
        `Tickets fetch with categoryGroup=${params.categoryGroup} failed (${res.status}), retrying without filter`,
        lastBody.slice(0, 200),
      )
    }
  }

  throw new Error(lastBody || `Tickets fetch failed (${lastStatus})`)
}
