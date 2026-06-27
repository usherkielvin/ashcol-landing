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

export function isSameBaseBranch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const cleanA = resolveScopedBranchId(a).replace(/-(sales|services|service)$/i, '').toLowerCase()
  const cleanB = resolveScopedBranchId(b).replace(/-(sales|services|service)$/i, '').toLowerCase()
  return cleanA === cleanB
}

/** Pick a concrete branch id for archive writes (never ALL_BRANCHES). */
export function resolveArchiveBranchId(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const resolved = resolveScopedBranchId(candidate)
    if (resolved && resolved !== 'ALL_BRANCHES') return resolved
  }
  return ''
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

/** May DTR correction window — all assigned employees may edit their branch reports. */
export function isMayDtrEditWindow(date?: string | null): boolean {
  if (!date) return false
  const iso = date.split('T')[0]
  const match = iso.match(/^(\d{4})-(\d{2})/)
  if (!match) return false
  return parseInt(match[2], 10) === 5
}

export function isDtrMayEditOpenForView(
  viewMode: 'single' | 'range',
  singleDate: string,
  rangeFrom: string,
  rangeTo: string,
): boolean {
  if (viewMode === 'single') return isMayDtrEditWindow(singleDate)
  if (isMayDtrEditWindow(rangeFrom) || isMayDtrEditWindow(rangeTo)) return true
  const year = rangeFrom.slice(0, 4)
  if (!/^\d{4}$/.test(year)) return false
  return rangeFrom <= `${year}-05-31` && rangeTo >= `${year}-05-01`
}

export function isEmployeePortalRole(role?: string | null): boolean {
  const r = normalizeUserValue(role)
  return r === 'employee' || r === 'staff' || r === 'oic'
}

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

export function isServiceWorkspaceBranchOrTitle(user?: PortalUserLike | null): boolean {
  if (!user) return false
  const branchId = resolveScopedBranchId(user.branchId).toLowerCase()
  const jobTitle = normalizeUserValue(user.jobTitle)
  const email = normalizeUserValue((user as any).email)
  return branchId.includes('service')
    || jobTitle.includes('service')
    || email.includes('service')
}

export function isSalesWorkspaceUser(user?: PortalUserLike | null) {
  if (!user) return false
  if (isServiceWorkspaceBranchOrTitle(user)) return false
  if (isCoordinatorOrOicUser(user)) return true
  const branchId = normalizeUserValue(user.branchId)
  const jobTitle = normalizeUserValue(user.jobTitle)

  return branchId.endsWith('-sales')
    || branchId === 'br-taguig-sales'
    || jobTitle.includes('sales')
}

export function isServiceWorkspaceUser(user?: PortalUserLike | null) {
  if (!user) return false
  if (isServiceWorkspaceBranchOrTitle(user)) return true
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

export async function readApiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return `Request failed (HTTP ${res.status})`
  try {
    const json = JSON.parse(text)
    if (typeof json.message === 'string' && json.message.trim()) return json.message
    if (typeof json.error === 'string' && json.error.trim()) return json.error
    return text
  } catch {
    return text
  }
}

export function formatFetchError(err: unknown): string {
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return 'Unknown error'
}
