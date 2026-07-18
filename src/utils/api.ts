const PROD_API_BASE_URL = 'https://api.ashcol.com.ph/api'

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
/** Taguig Sales vs Services classification precedence: explicit id > job title > email > default Sales (mirrors resolveTaguigAuditLine on the backend). */
export function parseGlobalBranchScope(
  globalOrBranchId?: string | null,
  email?: string | null,
  jobTitle?: string | null,
): {
  branchId: string
  auditLine: string | null
  branchName: string
} {
  const raw = (globalOrBranchId || '').trim()
  const lower = raw.toLowerCase()
  const emailLower = (email || '').toLowerCase()
  const jobTitleLower = (jobTitle || '').toLowerCase()

  if (isTaguigBranchRef(raw)) {
    let isServices: boolean
    if (
      lower.endsWith('-services')
      || lower.endsWith('-service')
      || lower === 'br-taguig-services'
      || (lower.includes('taguig') && lower.includes('service'))
    ) {
      isServices = true
    } else if (
      lower.endsWith('-sales')
      || lower === 'br-taguig-sales'
      || lower.includes('sales')
    ) {
      isServices = false
    } else if (jobTitleLower.includes('service')) {
      isServices = true
    } else {
      isServices = emailLower.includes('service')
    }

    return {
      branchId: isServices ? 'BR-TAGUIG-SERVICES' : 'BR-TAGUIG-SALES',
      auditLine: isServices ? 'TAGUIG_SERVICE' : 'TAGUIG_SALES',
      branchName: isServices ? 'TAGUIG SERVICES' : 'TAGUIG-SALES',
    }
  }

  let baseName = raw.replace(/^BR-/i, '').replace(/-(sales|services|service)$/i, '').replace(/_/g, ' ').toUpperCase().trim()
  if (baseName.startsWith('ASHCOL ')) {
    baseName = baseName.slice(7).trim()
  }
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
export function isTaguigServicesScope(branchId?: string | null, email?: string | null, jobTitle?: string | null): boolean {
  if (!isTaguigBranchRef(branchId)) return false
  return parseGlobalBranchScope(branchId, email, jobTitle).auditLine === 'TAGUIG_SERVICE'
}

export function getCleanBranchName(name?: string | null): string {
  if (!name) return ''
  let upper = name.toUpperCase().trim()
  if (upper.startsWith('ASHCOL ')) {
    upper = upper.slice(7).trim()
  }
  if (upper === 'TAGUIG') {
    return 'TAGUIG-SALES'
  }
  if (upper === 'TAGUIG - SERVICES' || upper === 'TAGUIG-SERVICES' || upper === 'TAGUIG SERVICES' || upper === 'TAGUIG - SERVICE') {
    return 'TAGUIG SERVICES'
  }
  return upper.replace(' - ', ' ').replace('-', ' ').trim()
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
  const isAdmin = user && (String(user.role).toUpperCase() === 'ADMIN' || String(user.role).toUpperCase() === 'MANAGEMENT')
  if (raw === 'ALL_BRANCHES' && isAdmin) return 'ALL_BRANCHES'

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
  const branchId = String(ticket.branchId || ticket.branch_id || '').toUpperCase()
  // Explicit branch on the ticket wins over dealer/installer heuristics.
  if (branchId === 'BR-TAGUIG-SERVICES') return true
  if (branchId === 'BR-TAGUIG-SALES') return false

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
    dealer: String(ticket.dealer || ticket.sourceVendor || ticket.source_vendor || meta.dealer || meta.dlr || ''),
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
  phone?: string | null
}

/** Staff who may appear as negotiator — any branch employee (incl. field crew and OIC/management). */
export function isNegotiatorCandidate(user: {
  role?: string | null
  jobTitle?: string | null
}): boolean {
  const roleLower = (user.role || '').toLowerCase().replace(/\s+/g, '_')
  if (roleLower === 'customer') return false
  // Only exclude system-wide admin accounts — they aren't tied to a single branch.
  if (roleLower === 'admin' || roleLower === 'administrator') return false

  return roleLower !== ''
}

/** Branch-scoped negotiator dropdown list (uses branchScopesMatch, not strict id equality). */
export function filterBranchNegotiators(
  users: BranchStaffOption[],
  branchSource?: string | null,
  options?: { strict?: boolean },
): BranchStaffOption[] {
  const eligible = users.filter(isNegotiatorCandidate)
  if (!branchSource || branchSource === 'ALL_BRANCHES' || branchSource === 'ALL') {
    if (options?.strict) return []
    return eligible.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }
  const matched = eligible.filter((u) => {
    const isGlobal = !u.branchId?.trim() ||
      u.branchId.toUpperCase() === 'ALL' ||
      u.branchId.toUpperCase() === 'ALL_BRANCHES' ||
      u.role?.toLowerCase() === 'admin' ||
      u.role?.toLowerCase() === 'administrator'
    if (isGlobal) return true

    const normalizedSource = branchSource.toUpperCase()
    const normalizedUserBranch = (u.branchId || '').toUpperCase()

    const isSourceTaguigSales = normalizedSource === 'BR-TAGUIG-SALES'
      || (normalizedSource.includes('TAGUIG') && !normalizedSource.includes('SERVICE'))
    const isUserTaguigServices = normalizedUserBranch === 'BR-TAGUIG-SERVICES'
      || (normalizedUserBranch.includes('TAGUIG') && normalizedUserBranch.includes('SERVICE'))

    if (isSourceTaguigSales && isUserTaguigServices) {
      return true
    }

    return branchScopesMatch(u.branchId, branchSource, u.email)
  })
  if (matched.length > 0) {
    return matched.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }
  if (options?.strict) {
    return []
  }
  // Fallback: staff without branch on file still selectable for active branch
  const unassigned = eligible.filter((u) => !u.branchId?.trim())
  return (unassigned.length > 0 ? unassigned : eligible)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

/** Ensure the signed-in negotiator can select themselves on branch schedules. */
export function appendCurrentNegotiator(
  users: BranchStaffOption[],
  current?: BranchStaffOption | null,
): BranchStaffOption[] {
  if (!current?.id || !current.name?.trim() || !isNegotiatorCandidate(current)) return users
  if (users.some((u) => u.id === current.id)) return users
  return [...users, current].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
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

/** Schedules tab branch filter — stored branch_id wins over lineup installer roster. */
export function resolveTicketScheduleBranchId(
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
  const stored = resolveScopedBranchId(ticket.branchId || ticket.branch_id)
  if (stored && stored !== 'ALL_BRANCHES') return stored
  return resolveTicketEffectiveBranchId(ticket, lineupIndex, driverOnlyNames)
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
export const EMPLOYEES_DIRECTORY_UPDATED_EVENT = 'ashcol-employees-directory-updated'
export const DEALERS_UPDATED_EVENT = 'ashcol-dealers-updated'

export function notifyDealersUpdated(): void {
  window.dispatchEvent(new Event(DEALERS_UPDATED_EVENT))
}

export function isPortalStaffUser(role?: string | null): boolean {
  return (role || '').toLowerCase() !== 'customer'
}

export function notifyEmployeesDirectoryUpdated(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.includes('portal-dir:') && key.includes(':employees:')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    // ignore cache clear errors
  }
  window.dispatchEvent(new Event(EMPLOYEES_DIRECTORY_UPDATED_EVENT))
}
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

/** Canonical short labels used in the admin branch switcher (prod UI). */
const BRANCH_DISPLAY_BY_ID: Record<string, string> = {
  'BR-BATANGAS': 'BATANGAS',
  'BR-BULACAN': 'BULACAN',
  'BR-CALAUAN': 'CALAUAN',
  'BR-CANDELARIA': 'CANDELARIA',
  'BR-DASMA': 'DASMA',
  'BR-GENTRI': 'GENTRI',
  'BR-LAGUNA': 'LAGUNA',
  'BR-PAMPANGA': 'PAMPANGA',
  'BR-RIZAL': 'RIZAL',
  'BR-SILANG': 'SILANG',
  'BR-TAGUIG-SALES': 'TAGUIG-SALES',
  'BR-TAGUIG-SERVICES': 'TAGUIG SERVICES',
  'BR-VALENZUELA': 'VALENZUELA',
}

/**
 * Short branch label for UI (matches production switcher).
 * Prefer `branchId` (BR-*) when available so legacy long DB names still render cleanly.
 */
export function formatBranchName(name?: string | null, branchId?: string | null): string {
  const id = (branchId || '').trim().toUpperCase()
  if (id && BRANCH_DISPLAY_BY_ID[id]) return BRANCH_DISPLAY_BY_ID[id]

  const upper = (name || id || '').trim().toUpperCase()
  if (!upper) return ''

  if (
    id.includes('TAGUIG') && (id.includes('SERVICE') || id.includes('SERVICES'))
    || (upper.includes('TAGUIG') && (upper.includes('SERVICE') || upper.includes('SERVICES') || upper.includes('DEPT')))
  ) {
    return 'TAGUIG SERVICES'
  }
  if (id.includes('TAGUIG') || upper.includes('TAGUIG') || upper.includes('HEAD OFFICE')) {
    return 'TAGUIG-SALES'
  }
  if (upper.includes('SILANG') || upper.includes('STA ROSA') || upper.includes('STA. ROSA') || upper.includes('STO ROSA') || upper.includes('STO. ROSA')) {
    return 'SILANG'
  }
  if (upper.includes('DASMA') || upper.includes('DASMARIÑAS') || upper.includes('DASMARINAS')) {
    return 'DASMA'
  }
  if (upper.includes('CALAUAN')) return 'CALAUAN'
  if (upper.includes('CANDELARIA')) return 'CANDELARIA'
  if (upper.includes('BULACAN')) return 'BULACAN'
  if (upper.includes('PAMPANGA')) return 'PAMPANGA'
  if (upper.includes('RIZAL') || upper.includes('RODRIGUEZ')) return 'RIZAL'
  if (upper.includes('BATANGAS')) return 'BATANGAS'
  if (upper.includes('GENTRI') || upper.includes('GENERAL TRIAS')) return 'GENTRI'
  if (upper.includes('VALENZUELA')) return 'VALENZUELA'
  if (upper.includes('LAGUNA') && !upper.includes('CALAUAN')) return 'LAGUNA'

  // Strip "ASHCOL", then leftover separators ("- CALAUAN…", "– …")
  return upper
    .replace(/^ASHCOL\b[\s\-–—:]*/i, '')
    .replace(/^[\s\-–—:]+/, '')
    .trim()
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

export function getPortalHomePath(_user?: PortalUserLike | null) {
  return '/search'
}

/** Fetch tickets; retries without categoryGroup if the API rejects the filter (older DB / deploy). */
export type TicketsPageResult = {
  tickets: unknown[]
  currentPage: number
  totalPages: number
  totalTickets: number
}

const ticketsPageInFlight = new Map<string, Promise<TicketsPageResult>>()

function ticketsPageCacheKey(
  endpoint: string,
  options: {
    page?: number
    size?: number
    categoryGroup?: string
    status?: string
    date?: string
    statusGroup?: string
    branchId?: string
  },
): string {
  return [
    endpoint,
    options.page ?? 0,
    options.size ?? 200,
    options.categoryGroup || '',
    options.status || '',
    options.date || '',
    options.statusGroup || '',
    options.branchId || '',
  ].join('|')
}

async function fetchTicketsPageOnce(
  endpoint: string,
  token: string,
  options: {
    page?: number
    size?: number
    categoryGroup?: 'FIELD' | 'OFFICE'
    status?: string
    date?: string
    statusGroup?: string
    branchId?: string
    signal?: AbortSignal
  } = {},
): Promise<TicketsPageResult> {
  const size = options.size ?? 200
  const page = options.page ?? 0
  const key = ticketsPageCacheKey(endpoint, { ...options, page, size })
  const existing = ticketsPageInFlight.get(key)
  if (existing) return existing

  const headers = { Authorization: `Bearer ${token}` }
  const base: Record<string, string> = { page: String(page), size: String(size) }
  if (options.status) base.status = options.status
  if (options.date) base.date = options.date
  if (options.statusGroup) base.statusGroup = options.statusGroup
  if (options.branchId) base.branchId = options.branchId

  const attempts: Record<string, string>[] = options.categoryGroup
    ? [{ ...base, categoryGroup: options.categoryGroup }, base]
    : [base]

  const job = (async (): Promise<TicketsPageResult> => {
    let lastStatus = 0
    let lastBody = ''
    for (const params of attempts) {
      const res = await fetch(`${API_BASE_URL}${endpoint}?${new URLSearchParams(params)}`, {
        headers,
        signal: options.signal,
      })
      if (res.ok) {
        const data = await res.json()
        const payload = data?.data ?? data ?? {}
        const tickets = payload?.tickets || data?.tickets || []
        const currentPage = Number(payload?.currentPage ?? page)
        const totalPages = Math.max(1, Number(payload?.totalPages ?? 1))
        const totalTickets = Number(payload?.totalTickets ?? tickets.length)
        return { tickets, currentPage, totalPages, totalTickets }
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
  })()

  ticketsPageInFlight.set(key, job)
  try {
    return await job
  } finally {
    if (ticketsPageInFlight.get(key) === job) ticketsPageInFlight.delete(key)
  }
}

export async function fetchTicketsPage(
  endpoint: string,
  token: string,
  options: {
    size?: number
    categoryGroup?: 'FIELD' | 'OFFICE'
    status?: string
    date?: string
    statusGroup?: string
    branchId?: string
    /** When true, fetches additional pages (max 5). Default: single page only. */
    paginate?: boolean
    maxPages?: number
  } = {},
): Promise<unknown[]> {
  const pageSize = options.size ?? 200
  const paginate = options.paginate === true
  const maxPages = options.maxPages ?? 5

  if (!paginate) {
    const result = await fetchTicketsPageOnce(endpoint, token, { ...options, page: 0, size: pageSize })
    return result.tickets
  }

  const all: unknown[] = []
  let page = 0
  let totalPages = 1
  while (page < totalPages && page < maxPages) {
    const result = await fetchTicketsPageOnce(endpoint, token, { ...options, page, size: pageSize })
    if (result.tickets.length === 0) break
    all.push(...result.tickets)
    totalPages = Math.max(1, result.totalPages)
    page += 1
    if (result.tickets.length < pageSize) break
    if (page >= totalPages) break
  }
  return all
}

export async function fetchTicketByNumber(token: string, ticketNumber: string): Promise<unknown | null> {
  const tn = ticketNumber.trim()
  if (!tn || !token) return null
  const res = await fetch(`${API_BASE_URL}/tickets/by-number/${encodeURIComponent(tn)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return parseCreatedTicketResponse(data)
}

export async function fetchTicketsByNumbers(token: string, ticketNumbers: string[]): Promise<unknown[]> {
  const numbers = [...new Set(ticketNumbers.map(n => n.trim().toUpperCase()).filter(Boolean))]
  if (!numbers.length || !token) return []
  const res = await fetch(
    `${API_BASE_URL}/tickets/by-numbers?numbers=${encodeURIComponent(numbers.join(','))}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return []
  const data = await res.json()
  const payload = data?.data ?? data
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.tickets)) return payload.tickets
  return []
}

export function parseCreatedTicketResponse(payload: unknown): any {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const data = root.data
  if (data && typeof data === 'object') {
    const dataObj = data as Record<string, unknown>
    if (dataObj.ticket && typeof dataObj.ticket === 'object') {
      return dataObj.ticket
    }
    if (typeof dataObj.id === 'string' && dataObj.id) {
      return dataObj
    }
    if (typeof dataObj.ticketId === 'string' && dataObj.ticketId) {
      return { id: dataObj.ticketId }
    }
  }
  if (root.ticket && typeof root.ticket === 'object') {
    return root.ticket
  }
  if (typeof root.id === 'string' && root.id) {
    return root
  }
  return null
}

function extractErrorMessage(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return ''
    try {
      return extractErrorMessage(JSON.parse(text)) || text
    } catch {
      return text
    }
  }
  if (typeof value !== 'object') return String(value)
  const obj = value as Record<string, unknown>
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim()
  if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim()
  if (typeof obj.error === 'object' && obj.error) {
    const nested = extractErrorMessage(obj.error)
    if (nested) return nested
  }
  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    const parts = obj.errors
      .map(item => extractErrorMessage(item))
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail.trim()
  return ''
}

export async function readApiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return `Request failed (HTTP ${res.status})`
  const parsed = extractErrorMessage(text)
  if (parsed) return parsed
  return `Request failed (HTTP ${res.status})`
}

export function formatFetchError(err: unknown): string {
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (err instanceof Error && err.message.trim()) {
    return extractErrorMessage(err.message) || err.message.trim()
  }
  const parsed = extractErrorMessage(err)
  if (parsed) return parsed
  return 'Unknown error'
}
