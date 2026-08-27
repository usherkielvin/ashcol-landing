import {
  API_BASE_URL,
  branchScopesMatch,
  resolveScopedBranchId,
  type BranchStaffOption,
} from './api'

export type BranchRoster = {
  drivers: string[]
  installers: string[]
}

export const BRANCH_ROSTER_UPDATED_EVENT = 'ashcol-branch-roster-updated'

export function notifyBranchRosterUpdated(): void {
  window.dispatchEvent(new Event(BRANCH_ROSTER_UPDATED_EVENT))
}

export function mergeRosterNames(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const raw of list || []) {
      const name = (raw || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(name)
    }
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export function isSalesCoordinatorEmployee(emp: {
  jobTitle?: string | null
  role?: string | null
}): boolean {
  const title = (emp.jobTitle || '').toLowerCase()
  const role = (emp.role || '').toLowerCase()
  return title.includes('sales coordinator') || role.includes('sales coordinator') || title.includes('coordinator')
}

/** An employee whose job title or role contains 'coordinator' — the tag used for negotiator accounts. */
export function isCoordinatorEmployee(emp: {
  jobTitle?: string | null
  role?: string | null
}): boolean {
  const title = (emp.jobTitle || '').toLowerCase()
  const role = (emp.role || '').toLowerCase()
  return title.includes('coordinator') || role.includes('coordinator')
}

export function isDriverEmployee(emp: { jobTitle?: string | null }): boolean {
  return (emp.jobTitle || '').toLowerCase().includes('driver')
}

export function isInstallerEmployee(emp: {
  jobTitle?: string | null
  role?: string | null
}): boolean {
  const title = (emp.jobTitle || '').toLowerCase()
  if (title.includes('driver')) return false
  if (isSalesCoordinatorEmployee(emp)) return false
  return title.includes('installer') || title.includes('technician') || title.includes('helper')
}

export function resolveBranchApiId(branchId?: string | null): string {
  return resolveScopedBranchId(branchId)
}

function branchSuffix(branchId: string): 'sales' | 'services' | null {
  const lower = branchId.toLowerCase()
  if (lower.endsWith('-services') || lower.endsWith('-service')) return 'services'
  if (lower.endsWith('-sales')) return 'sales'
  return null
}

export function employeeMatchesBranchScope(
  emp: BranchStaffOption,
  branchId: string,
): boolean {
  const suffix = branchSuffix(branchId)
  const empBranch = (emp.branchId || '').trim()
  if (!empBranch) return false

  const apiId = resolveBranchApiId(branchId)
  if (
    empBranch === branchId
    || empBranch === apiId
    || branchScopesMatch(empBranch, branchId)
    || branchScopesMatch(empBranch, apiId)
  ) {
    if (!suffix) return true
    const emailLower = (emp.email || '').toLowerCase()
    const titleLower = (emp.jobTitle || '').toLowerCase()
    const isServiceStaff = emailLower.includes('service') || titleLower.includes('service')
    return suffix === 'services' ? isServiceStaff : !isServiceStaff
  }

  if (suffix === 'sales' && empBranch === 'BR-TAGUIG-SALES') return true
  if (suffix === 'services' && empBranch === 'BR-TAGUIG-SERVICES') return true
  return false
}

function extractStaffFirstName(emp: BranchStaffOption): string {
  const nickname = ((emp as { nickname?: string }).nickname || '').trim()
  if (nickname) return nickname.toUpperCase()
  const raw = (emp.name || '').trim().replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '').trim()
  if (!raw) return ''
  return raw.split(/\s+/)[0].toUpperCase()
}

export function deriveRosterFromEmployees(
  employees: BranchStaffOption[],
  branchId: string,
): BranchRoster {
  const drivers: string[] = []
  const installers: string[] = []
  for (const emp of employees) {
    if (emp.isActive === false || emp.active === false) continue
    if (typeof emp.status === 'string' && emp.status.toUpperCase() === 'INACTIVE') continue
    if (!employeeMatchesBranchScope(emp, branchId)) continue
    if (isSalesCoordinatorEmployee(emp)) continue
    const firstName = extractStaffFirstName(emp)
    if (!firstName) continue
    if (isDriverEmployee(emp)) {
      drivers.push(firstName)
    } else if (isInstallerEmployee(emp)) {
      installers.push(firstName)
    } else {
      const title = (emp.jobTitle || '').toLowerCase()
      if (!title.includes('coordinator')) installers.push(firstName)
    }
  }
  return { drivers, installers }
}

/** Coordinator/negotiator names scoped to a branch — for lineup negotiator dropdowns. */
export function deriveCoordinatorsFromEmployees(
  employees: BranchStaffOption[],
  branchId: string,
): string[] {
  const names: string[] = []
  for (const emp of employees) {
    if (emp.isActive === false || emp.active === false) continue
    if (typeof emp.status === 'string' && emp.status.toUpperCase() === 'INACTIVE') continue
    if (!employeeMatchesBranchScope(emp, branchId)) continue
    if (!isCoordinatorEmployee(emp)) continue
    const firstName = extractStaffFirstName(emp)
    if (firstName) names.push(firstName)
  }
  return mergeRosterNames(names)
}

export function buildBranchRoster(
  employees: BranchStaffOption[],
  branchId: string,
  lineup?: Partial<BranchRoster> | null,
): BranchRoster {
  const fromEmployees = deriveRosterFromEmployees(employees, branchId)
  return {
    drivers: mergeRosterNames(fromEmployees.drivers, lineup?.drivers),
    installers: mergeRosterNames(fromEmployees.installers, lineup?.installers),
  }
}

export function parseWeeklyRosterNames(remarks?: string | null): string[] {
  if (!remarks?.trim()) return []
  try {
    const parsed = JSON.parse(remarks)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row: { name?: string }) => (row?.name || '').trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export function toWeeklyRosterPayload(names: string[]): string {
  const rows = names.map((name, index) => ({
    id: `dir-${index}-${name.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    roleNote: '',
    photoUrl: '',
    days: {},
    totalUnitsTeamWork: '',
    totalUnitsCleaning: '',
    remarks: '',
  }))
  return JSON.stringify(rows)
}

export function getCurrentWeekMonday(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function fetchLineupSuggestions(
  token: string,
  branchId: string,
  apiBaseUrl = API_BASE_URL,
): Promise<BranchRoster> {
  const apiId = resolveBranchApiId(branchId)
  if (!apiId) return { drivers: [], installers: [] }
  try {
    const res = await fetch(
      `${apiBaseUrl}/v1/lineup/suggestions?branchId=${encodeURIComponent(apiId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return { drivers: [], installers: [] }
    const data = await res.json()
    return {
      drivers: Array.isArray(data?.drivers) ? data.drivers.filter(Boolean) : [],
      installers: Array.isArray(data?.installers) ? data.installers.filter(Boolean) : [],
    }
  } catch {
    return { drivers: [], installers: [] }
  }
}

export async function saveBranchRosterToLineup(
  token: string,
  branchId: string,
  roster: BranchRoster,
  apiBaseUrl = API_BASE_URL,
): Promise<void> {
  const apiBranchId = resolveBranchApiId(branchId)
  if (!apiBranchId) return

  const weekStart = getCurrentWeekMonday()
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  let driversRec: { id?: string } | null = null
  let installersRec: { id?: string } | null = null

  const weekRes = await fetch(
    `${apiBaseUrl}/v1/lineup/week?branchId=${encodeURIComponent(apiBranchId)}&weekStart=${weekStart}`,
    { headers },
  )
  if (weekRes.ok) {
    const data = await weekRes.json()
    driversRec = data.weeklyDrivers || null
    installersRec = data.weeklyInstallers || null
  }

  const saveWeekly = async (
    kind: 'drivers' | 'installers',
    names: string[],
    existing: { id?: string } | null,
    service: string,
    sortOrder: number,
  ) => {
    const payload = {
      id: existing?.id || `w-${kind}-${Date.now()}`,
      lineupDate: weekStart,
      branchId: apiBranchId,
      service,
      driverName: '',
      driverTime: '',
      installerName: '',
      installerTime: '',
      negotiator: '',
      route: '',
      remarks: toWeeklyRosterPayload(names),
      sortOrder,
    }
    const isNew = !existing?.id
    const url = isNew
      ? `${apiBaseUrl}/v1/lineup`
      : `${apiBaseUrl}/v1/lineup/${existing!.id}`
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      throw new Error(`Failed to save ${kind} roster`)
    }
  }

  await saveWeekly('drivers', roster.drivers, driversRec, '__WEEKLY_DRIVERS__', -100)
  await saveWeekly('installers', roster.installers, installersRec, '__WEEKLY_INSTALLERS__', -101)
}

export async function fetchAllBranchRosters(
  token: string,
  branchIds: string[],
  employees: BranchStaffOption[],
  apiBaseUrl = API_BASE_URL,
): Promise<Record<string, BranchRoster>> {
  const uniqueApiIds = [...new Set(branchIds.map(resolveBranchApiId).filter(Boolean))]
  const lineupByApiId: Record<string, BranchRoster> = {}

  await Promise.all(
    uniqueApiIds.map(async (apiId) => {
      lineupByApiId[apiId] = await fetchLineupSuggestions(token, apiId, apiBaseUrl)
    }),
  )

  const result: Record<string, BranchRoster> = {}
  for (const branchId of branchIds) {
    const apiId = resolveBranchApiId(branchId)
    result[branchId] = buildBranchRoster(employees, branchId, lineupByApiId[apiId])
    if (apiId && apiId !== branchId) {
      result[apiId] = result[branchId]
    }
  }
  return result
}
