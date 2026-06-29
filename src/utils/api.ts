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

export type BranchListEntry = {
  id: string
  name: string
  auditLine?: string | null
  isActive?: boolean
}

export function isTaguigBranchRef(branchId?: string | null, name?: string | null): boolean {
  const id = (branchId || '').toLowerCase()
  const n = (name || '').toUpperCase()
  return id.includes('taguig')
    || id.startsWith('2880c29e-581c-11f1-bf8c-74d4dd6dfc0b')
    || n.includes('TAGUIG')
}

export function branchAuditLineIsService(auditLine?: string | null, name?: string | null): boolean {
  if (auditLine === 'TAGUIG_SERVICE') return true
  const n = (name || '').toUpperCase()
  return n.includes('SERVICE') && !n.includes('SALES')
}

/** Normalize admin global branch id or user branch id for list matching. */
export function parseGlobalBranchScope(globalOrBranchId?: string | null, email?: string | null): {
  branchId: string
  auditLine: string | null
  branchName: string
} {
  const raw = (globalOrBranchId || '').trim()
  const lower = raw.toLowerCase()
  const emailLower = (email || '').toLowerCase()
  const isServices = lower.endsWith('-services')
    || lower.endsWith('-service')
    || lower === 'br-taguig-services'
    || emailLower.includes('service')

  if (isTaguigBranchRef(raw)) {
    return {
      branchId: isServices ? 'BR-TAGUIG-SERVICES' : 'BR-TAGUIG-SALES',
      auditLine: isServices ? 'TAGUIG_SERVICE' : 'TAGUIG_SALES',
      branchName: isServices ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES',
    }
  }

  let baseName = raw.replace(/^BR-/i, '').replace(/-(sales|services|service)$/i, '').replace(/_/g, ' ').toUpperCase().trim()
  if (!baseName) baseName = 'BRANCH'

  return {
    branchId: raw.replace(/-(sales|services|service)$/i, '').toUpperCase(),
    auditLine: null,
    branchName: baseName,
  }
}

/** Match admin global branch id to a row from the /branches list (handles Taguig + UUID ids). */
export function findBranchListEntry(
  globalOrBranchId: string | null | undefined,
  list: BranchListEntry[],
  email?: string | null,
): BranchListEntry | undefined {
  if (!globalOrBranchId?.trim() || list.length === 0) return undefined

  const raw = globalOrBranchId.trim()
  const norm = parseGlobalBranchScope(raw, email)

  const direct = list.find((b) => {
    if (b.id !== raw && b.id.toUpperCase() !== raw.toUpperCase()) return false
    if (norm.auditLine && isTaguigBranchRef(b.id, b.name)) {
      return branchAuditLineIsService(b.auditLine, b.name) === (norm.auditLine === 'TAGUIG_SERVICE')
    }
    return true
  })
  if (direct) return direct

  return list.find((b) => {
    if (isTaguigBranchRef(norm.branchId) && isTaguigBranchRef(b.id, b.name)) {
      return branchAuditLineIsService(b.auditLine, b.name) === (norm.auditLine === 'TAGUIG_SERVICE')
    }
    if (b.id.toUpperCase() === norm.branchId.toUpperCase()) {
      return (b.auditLine || null) === norm.auditLine
    }
    return isSameBaseBranch(b.id, norm.branchId) || isSameBaseBranch(b.id, raw)
  })
}

export function branchEntryMatchesGlobal(
  entry: { id: string; auditLine?: string | null; name?: string | null },
  globalOrBranchId?: string | null,
): boolean {
  return !!findBranchListEntry(globalOrBranchId, [{
    id: entry.id,
    name: entry.name || '',
    auditLine: entry.auditLine,
  }])
}

/** True when branch scope is Taguig Services (not Sales). */
export function isTaguigServicesScope(branchId?: string | null, email?: string | null): boolean {
  if (!isTaguigBranchRef(branchId)) return false
  return parseGlobalBranchScope(branchId, email).auditLine === 'TAGUIG_SERVICE'
}

/** Signals used to classify Taguig Archives rows as Services vs Sales. */
export type TaguigArchiveRowSignals = {
  branchId?: string | null
  serviceType?: string | null
  statusCode?: string | null
  dealer?: string | null
  technicianName?: string | null
  remarks?: string | null
  note?: string | null
  inputBy?: string | null
  serviceColumn?: string | null
}

/** Classify a Taguig archive row as Services dept (field crew, coordinator, repair/PMS, etc.). */
export function isTaguigServiceArchiveRecord(row: TaguigArchiveRowSignals): boolean {
  if (row.branchId?.toUpperCase() === 'BR-TAGUIG-SERVICES') return true

  const code = (row.statusCode || '').trim().toUpperCase()
  if (code.startsWith('S') && !code.startsWith('SI')) return true

  const type = (row.serviceType || '').toUpperCase()
  if (['REPAIR', 'MAINT', 'PMS', 'CLEANING', 'CHECK', 'SERVICE'].some((k) => type.includes(k))) {
    return true
  }

  const blob = [
    row.dealer,
    row.inputBy,
    row.technicianName,
    row.remarks,
    row.note,
    row.serviceColumn,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  if (blob.includes('JEYNE') || blob.includes('JANE') || blob.includes('MARTOS')) return true
  if (blob.includes('MANNY') || blob.includes('FROILAN') || blob.includes('JUSTINE') || blob.includes('ROLDAN')) {
    return true
  }
  return blob.includes('DONE BY')
}

/** Whether an Archives row belongs under the active branch filter (Taguig Sales/Services + all branches). */
export function archiveRowMatchesBranch(
  row: TaguigArchiveRowSignals & { branchName?: string | null },
  branchFilter?: string | null,
): boolean {
  if (!branchFilter || branchFilter === 'ALL_BRANCHES') return false
  if (!row.branchId && !row.branchName) return false

  if (isTaguigBranchRef(branchFilter)) {
    if (!isTaguigBranchRef(row.branchId, row.branchName)) return false
    const wantServices = isTaguigServicesScope(branchFilter)
    const isService = isTaguigServiceArchiveRecord(row)
    return wantServices ? isService : !isService
  }

  if (isTaguigBranchRef(row.branchId, row.branchName)) return false
  return branchScopesMatch(row.branchId, branchFilter)
}

/** Resolve Archives page branch filter — never ALL_BRANCHES. */
export function resolveArchivesBranchFilter(
  raw: string | null | undefined,
  branchList: Array<{ id: string; name?: string }>,
  user?: { role?: string | null; branchId?: string | null } | null,
): string {
  const realBranches = branchList.filter((b) => b.id && b.id !== 'ALL_BRANCHES')
  if (realBranches.length === 0) return ''

  const pick = (candidate?: string | null) => {
    if (!candidate || candidate === 'ALL_BRANCHES') return ''
    const direct = realBranches.find(
      (b) => b.id === candidate || b.id.toUpperCase() === candidate.toUpperCase(),
    )
    if (direct) return direct.id
    return realBranches.find((b) => branchScopesMatch(b.id, candidate))?.id || ''
  }

  return (
    pick(raw)
    || pick(getActivePortalBranchId(user))
    || pick(user?.branchId)
    || realBranches[0].id
  )
}

/** Taguig Sales vs Services classification for schedule tickets. */
export function isTaguigServiceTicket(ticket: Record<string, unknown>): boolean {
  const branchId = String(ticket.branchId || ticket.branch_id || '')
  if (branchId.toUpperCase() === 'BR-TAGUIG-SERVICES') return true

  let meta: Record<string, unknown> = {}
  const acRaw = ticket.acDetails || ticket.ac_details
  if (typeof acRaw === 'string' && acRaw.trim()) {
    try {
      const parsed = JSON.parse(acRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed
      else if (Array.isArray(parsed) && parsed[0]) meta = parsed[0] as Record<string, unknown>
    } catch { /* ignore */ }
  }

  const installer = String(
    ticket.installerName || ticket.installer_name || meta.installerName || meta.installer || meta.technicianName || '',
  )

  return isTaguigServiceArchiveRecord({
    branchId,
    serviceType: String(ticket.serviceType || ticket.service_type || ''),
    statusCode: String(ticket.statusCode || ticket.status_code || meta.statusCode || ''),
    dealer: String(ticket.sourceVendor || ticket.source_vendor || meta.dealer || meta.dlr || ''),
    technicianName: installer,
    remarks: String(ticket.remarks || ticket.remarksUpdate || meta.update || meta.remarksUpdate || ''),
    note: String(ticket.note || meta.note || ''),
    inputBy: String(ticket.inputBy || meta.inputBy || ''),
    serviceColumn: String(ticket.serviceVehicle || ticket.service_vehicle || meta.serviceVehicle || ''),
  })
}

/**
 * Match two branch ids including Taguig Sales vs Services split.
 * Use instead of isSameBaseBranch when filtering schedules/tickets/employees.
 */
export function branchScopesMatch(
  a?: string | null,
  b?: string | null,
  bEmail?: string | null,
): boolean {
  if (!a || !b) return false
  if (b === 'ALL_BRANCHES') return true

  const aScope = parseGlobalBranchScope(a)
  const bScope = parseGlobalBranchScope(b, bEmail)
  const aTaguig = isTaguigBranchRef(a)
  const bTaguig = isTaguigBranchRef(b)

  if (aTaguig && bTaguig) {
    return aScope.auditLine === bScope.auditLine && isSameBaseBranch(a, b)
  }

  if (aTaguig || bTaguig) {
    return isSameBaseBranch(a, b) && aScope.auditLine === bScope.auditLine
  }

  return isSameBaseBranch(a, b)
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

/** Archives branch for a schedule ticket — always prefer the ticket's own branch. */
export function resolveTicketArchiveBranchId(
  ticket: { branchId?: string | null; branch_id?: string | null },
  ...fallbacks: Array<string | null | undefined>
): string {
  const fromTicket = resolveScopedBranchId(ticket.branchId || ticket.branch_id)
  if (fromTicket && fromTicket !== 'ALL_BRANCHES') return fromTicket
  return resolveArchiveBranchId(...fallbacks)
}

/** Branch id for API writes (preserves Taguig Sales vs Services). */
export function resolveArchiveWriteBranchId(branchId?: string | null): string {
  return resolveScopedBranchId(branchId)
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
  if (r === 'MANAGEMENT') return 'MANAGEMENT'
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

/** System admin only — user/role management, branch create/delete. */
export function isSystemAdmin(role?: string | null): boolean {
  return normalizeUserValue(role) === 'admin'
}

/** Admin portal view — branch switcher, all branches, schedules, DTR, etc. */
export function isPortalAdmin(role?: string | null): boolean {
  const r = normalizeUserValue(role)
  return r === 'admin' || r === 'management'
}

export function isPortalAdminUser(user?: PortalUserLike | null): boolean {
  return isPortalAdmin(user?.role)
}

/** Active branch for portal admin / management — sidebar switcher value. */
export function getActivePortalBranchId(user?: PortalUserLike | null): string | null {
  if (!isPortalAdmin(user?.role)) return user?.branchId ?? null
  return localStorage.getItem('ashcol-global-branch-id') || user?.branchId || null
}

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
  if (isPortalAdmin(user.role)) return false
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
  if (isPortalAdmin(user.role)) return false
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
  if (isPortalAdmin(role)) return '/audit-report'
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
