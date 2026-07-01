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
  if (cleanA === cleanB) return true
  const aliasA = branchAliasKey(a)
  const aliasB = branchAliasKey(b)
  return !!(aliasA && aliasB && aliasA === aliasB)
}

/** Map legacy UUID / BR-* ids to a shared branch keyword for staff matching. */
function branchAliasKey(branchId?: string | null): string | null {
  if (!branchId?.trim()) return null
  const id = branchId.trim().toLowerCase()
  const aliases: Record<string, string> = {
    '2880bf12-581c-11f1-bf8c-74d4dd6dfc0b': 'calauan',
    'br-calauan': 'calauan',
    '2880c15e-581c-11f1-bf8c-74d4dd6dfc0b': 'silang',
    'br-silang': 'silang',
    '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b': 'taguig',
    'br-taguig': 'taguig',
    'br-taguig-sales': 'taguig',
    'br-taguig-services': 'taguig',
    '2880c35a-581c-11f1-bf8c-74d4dd6dfc0b': 'rizal',
    'br-rizal': 'rizal',
    '2880c3b7-581c-11f1-bf8c-74d4dd6dfc0b': 'pampanga',
    'br-pampanga': 'pampanga',
    '2880c407-581c-11f1-bf8c-74d4dd6dfc0b': 'bulacan',
    'br-bulacan': 'bulacan',
    '2880c4af-581c-11f1-bf8c-74d4dd6dfc0b': 'dasma',
    'br-dasma': 'dasma',
    '2880c5fa-581c-11f1-bf8c-74d4dd6dfc0b': 'candelaria',
    'br-candelaria': 'candelaria',
  }
  if (aliases[id]) return aliases[id]
  if (id.startsWith('br-')) return id.slice(3)
  for (const kw of Object.values(aliases)) {
    if (id.includes(kw)) return kw
  }
  return null
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

/**
 * Resolve active portal branch to a concrete write id (Taguig Sales vs Services).
 * Uses sidebar scope + email/job title — not raw UUID alone.
 */
export function resolvePortalWriteBranchId(
  branchId?: string | null,
  email?: string | null,
  jobTitle?: string | null,
): string {
  const raw = (branchId || '').trim()
  if (!raw || raw === 'ALL_BRANCHES') return ''
  if (isTaguigBranchRef(raw)) {
    const scope = parseGlobalBranchScope(raw, email)
    const jt = (jobTitle || '').toUpperCase()
    if (jt.includes('SERVICE') && scope.auditLine !== 'TAGUIG_SERVICE') {
      return 'BR-TAGUIG-SERVICES'
    }
    return scope.branchId
  }
  return resolveScopedBranchId(raw)
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
export function isTaguigServiceArchiveRecord(
  row: TaguigArchiveRowSignals & { ticketBranchId?: string | null; installerLineupBranchId?: string | null },
): boolean {
  const lineup = (row.installerLineupBranchId || '').toUpperCase()
  if (lineup === 'BR-TAGUIG-SERVICES') return true
  if (lineup === 'BR-TAGUIG-SALES') return false

  const ticketBranch = (row.ticketBranchId || '').toUpperCase()
  if (ticketBranch === 'BR-TAGUIG-SERVICES') return true
  if (ticketBranch === 'BR-TAGUIG-SALES') return false

  if (row.branchId?.toUpperCase() === 'BR-TAGUIG-SERVICES') return true

  const code = (row.statusCode || '').trim().toUpperCase().replace(/\s+/g, '')
  if (code === 'S/I' || code.startsWith('SI') || code === 'I' || code.startsWith('INSTALL')) return false
  if (code.startsWith('S') && !code.startsWith('SI')) return true

  const type = (row.serviceType || '').toUpperCase()
  if (type.includes('INSTALL')) return false
  if (['REPAIR', 'MAINT', 'PMS', 'CLEANING', 'CHECK'].some((k) => type.includes(k))) return true
  if (type.includes('SERVICE') && !type.includes('INSTALL')) return true

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

export type ArchiveBranchRowSignals = TaguigArchiveRowSignals & {
  branchName?: string | null
  customerAddress?: string | null
  district?: string | null
  ticketBranchId?: string | null
  installerLineupBranchId?: string | null
}

/** True branch: lineup installer roster > ticket branch > stored branch_id. */
export function resolveEffectiveArchiveBranchId(row: ArchiveBranchRowSignals): string {
  if (row.installerLineupBranchId?.trim()) return resolveScopedBranchId(row.installerLineupBranchId)
  if (row.ticketBranchId?.trim()) return resolveScopedBranchId(row.ticketBranchId)
  return resolveScopedBranchId(row.branchId)
}

/** Whether an Archives row belongs under the active branch filter (Taguig Sales/Services + all branches). */
export function archiveRowMatchesBranch(
  row: ArchiveBranchRowSignals,
  branchFilter?: string | null,
  lineupIndex: InstallerBranchIndexEntry[] = [],
  driverOnlyNames: string[] = [],
): boolean {
  if (!branchFilter || branchFilter === 'ALL_BRANCHES') return false

  const stored = resolveScopedBranchId(row.branchId)
  const filterKey = resolveScopedBranchId(branchFilter)
  if (stored && filterKey && stored === filterKey) return true

  const installer = row.technicianName || ''
  if (isTaguigBranchRef(branchFilter)) {
    if (!isDriverOnlyOnLineup(installer, driverOnlyNames)
        && isListedOnNonTaguigLineup(installer, lineupIndex, driverOnlyNames)) return false
    if (row.ticketBranchId?.trim() && !isTaguigBranchRef(row.ticketBranchId)) return false
  }

  const effective = resolveEffectiveArchiveBranchId(row)
  if (!effective) return false

  if (isTaguigBranchRef(branchFilter)) {
    if (!isTaguigBranchRef(effective)) return false
    const wantServices = isTaguigServicesScope(branchFilter)
    const isService = isTaguigServiceArchiveRecord(row)
    return wantServices ? isService : !isService
  }

  if (isTaguigBranchRef(effective)) return false
  return branchScopesMatch(effective, branchFilter)
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

export type BranchStaffOption = {
  id: string
  name: string
  branchId?: string | null
  email?: string | null
  role?: string | null
  jobTitle?: string | null
}

/** Staff who may appear as negotiator (office roles incl. OIC; excludes field crew). */
export function isNegotiatorCandidate(user: {
  role?: string | null
  jobTitle?: string | null
}): boolean {
  const roleLower = (user.role || '').toLowerCase().replace(/\s+/g, '_')
  const jobLower = (user.jobTitle || '').toLowerCase()
  if (roleLower === 'customer') return false

  const officeRoles = ['admin', 'management', 'administrator', 'manager', 'oic', 'employee', 'staff']
  if (officeRoles.includes(roleLower)) return true
  if (
    jobLower.includes('oic')
    || jobLower.includes('office in charge')
    || jobLower.includes('negotiator')
    || jobLower.includes('manager')
  ) {
    return true
  }

  const fieldJobs = ['technician', 'installer', 'driver', 'helper', 'crew', 'lineman']
  if (fieldJobs.some((k) => jobLower.includes(k))) return false

  return roleLower !== ''
}

/** Branch-scoped negotiator dropdown list (uses branchScopesMatch, not strict id equality). */
export function filterBranchNegotiators(
  users: BranchStaffOption[],
  branchSource?: string | null,
): BranchStaffOption[] {
  const eligible = users.filter(isNegotiatorCandidate)
  if (!branchSource || branchSource === 'ALL_BRANCHES' || branchSource === 'ALL') {
    return eligible.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }
  const matched = eligible.filter((u) => {
    const isGlobal = !u.branchId?.trim() ||
      u.branchId.toUpperCase() === 'ALL' ||
      u.branchId.toUpperCase() === 'ALL_BRANCHES' ||
      u.role?.toLowerCase() === 'admin' ||
      u.role?.toLowerCase() === 'administrator' ||
      u.role?.toLowerCase() === 'management'
    return isGlobal || branchScopesMatch(u.branchId, branchSource, u.email)
  })
  if (matched.length > 0) {
    return matched.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }
  // Fallback: staff without branch on file still selectable for active branch
  const unassigned = eligible.filter((u) => !u.branchId?.trim())
  return (unassigned.length > 0 ? unassigned : eligible)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
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

export type InstallerBranchIndexEntry = { installerName: string; branchId: string }

function normalizeInstallerName(name: string): string {
  return name.toUpperCase().trim().replace(/\s+/g, ' ')
}

function installerBaseName(name: string): string {
  return normalizeInstallerName(name).replace(/\s+\d+$/, '').trim()
}

function installerNamesMatch(left: string, right: string): boolean {
  const l = normalizeInstallerName(left)
  const r = normalizeInstallerName(right)
  if (!l || !r) return false
  if (l === r) return true
  if (installerBaseName(l).length >= 3 && installerBaseName(l) === installerBaseName(r)) return true
  const wordEq = (whole: string, word: string) => {
    const w = installerBaseName(word)
    if (w.length < 3) return false
    return normalizeInstallerName(whole).split(/\s+/).some((t) => installerBaseName(t) === w)
  }
  return wordEq(l, r) || wordEq(r, l)
}

/** True when name is on a lineup driver roster but not on any installer roster. */
export function isDriverOnlyOnLineup(
  name: string | null | undefined,
  driverOnlyNames: string[] = [],
): boolean {
  if (!name?.trim() || driverOnlyNames.length === 0) return false
  return driverOnlyNames.some((d) => installerNamesMatch(name, d))
}

/** Resolve branch from lineup installer roster (client-side index from /lineup/installer-branch-index). */
export function resolveInstallerLineupBranchId(
  installerName: string | null | undefined,
  index: InstallerBranchIndexEntry[],
  driverOnlyNames: string[] = [],
): string {
  const matches = resolveInstallerLineupBranchMatches(installerName, index, driverOnlyNames)
  return matches.length === 1 ? matches[0] : ''
}

export function resolveInstallerLineupBranchMatches(
  installerName: string | null | undefined,
  index: InstallerBranchIndexEntry[],
  driverOnlyNames: string[] = [],
): string[] {
  if (!installerName?.trim() || index.length === 0) return []
  if (isDriverOnlyOnLineup(installerName, driverOnlyNames)) return []
  const matches = index
    .filter((e) => installerNamesMatch(installerName, e.installerName))
    .map((e) => resolveScopedBranchId(e.branchId))
    .filter((id) => id && id !== 'ALL_BRANCHES')
  return [...new Set(matches)]
}

export function isListedOnNonTaguigLineup(
  installerName: string | null | undefined,
  index: InstallerBranchIndexEntry[],
  driverOnlyNames: string[] = [],
): boolean {
  if (isDriverOnlyOnLineup(installerName, driverOnlyNames)) return false
  return resolveInstallerLineupBranchMatches(installerName, index, driverOnlyNames).some((id) => !isTaguigBranchRef(id))
}

/** Locked branch scope for a ticket (lineup installer roster, then stored branch_id). */
export function resolveTicketEffectiveBranchId(
  ticket: {
    branchId?: string | null
    branch_id?: string | null
    installerLineupBranchId?: string | null
    installer_lineup_branch_id?: string | null
    installerName?: string | null
    installer_name?: string | null
    technicianName?: string | null
  },
  lineupIndex?: InstallerBranchIndexEntry[],
  driverOnlyNames: string[] = [],
): string {
  return resolveTicketArchiveBranchId(ticket, lineupIndex, driverOnlyNames)
}

/** Archives branch for a schedule ticket — lineup installer roster, then ticket branch, then fallbacks. */
export function resolveTicketArchiveBranchId(
  ticket: {
    branchId?: string | null
    branch_id?: string | null
    installerLineupBranchId?: string | null
    installer_lineup_branch_id?: string | null
    installerName?: string | null
    installer_name?: string | null
    technicianName?: string | null
  },
  lineupIndex?: InstallerBranchIndexEntry[],
  driverOnlyNames: string[] = [],
  ...fallbackCandidates: Array<string | null | undefined>
): string {
  const fromLineupField = resolveScopedBranchId(
    ticket.installerLineupBranchId || ticket.installer_lineup_branch_id,
  )
  if (fromLineupField && fromLineupField !== 'ALL_BRANCHES') return fromLineupField

  const installer = (
    ticket.installerName
    || ticket.installer_name
    || ticket.technicianName
    || ''
  ).trim()
  if (lineupIndex && installer) {
    const fromIndex = resolveInstallerLineupBranchId(installer, lineupIndex, driverOnlyNames)
    if (fromIndex) return fromIndex
  }

  const fromTicket = resolveScopedBranchId(ticket.branchId || ticket.branch_id)
  if (fromTicket && fromTicket !== 'ALL_BRANCHES') return fromTicket

  return resolveArchiveBranchId(...fallbackCandidates)
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

export const PROFILE_UPDATED_EVENT = 'ashcol-profile-updated'
export { ARCHIVE_UPDATED_EVENT, notifyArchiveUpdated } from './ticketArchive'

const NAME_PARTICLES = new Set(['de', 'del', 'dela', 'la', 'las', 'los', 'y', 'san', 'santa', 'sto'])

/** Title-case person names for display and save (e.g. "JUAN DELA CRUZ" → "Juan Dela Cruz"). */
export function formatPersonName(name: string): string {
  if (!name?.trim()) return ''
  return name
    .trim()
    .split(/\s+/)
    .map((part, index) => {
      const bare = part.toLowerCase().replace(/\./g, '')
      if (index > 0 && NAME_PARTICLES.has(bare)) {
        return bare === 'sto' ? 'Sto.' : part.toLowerCase()
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

/** Maps backend roles to readable labels */
export function formatRole(role?: string): string {
  if (!role) return ''
  const r = role.toLowerCase()
  const labels: Record<string, string> = {
    admin: 'Admin',
    management: 'Management',
    manager: 'Office In Charge',
    oic: 'Office In Charge',
    employee: 'Employee',
    staff: 'Staff',
    customer: 'Customer',
  }
  return labels[r] || formatPersonName(role.replace(/_/g, ' '))
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
  return r === 'admin' || r === 'management' || r === 'administrator'
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
  // Negotiator / field-sales employees (EMPLOYEE role, not service/coordinator) → My Tickets
  if (role === 'employee' || role === 'staff') return '/my-tickets'
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
