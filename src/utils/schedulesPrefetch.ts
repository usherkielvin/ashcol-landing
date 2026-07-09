import { fetchTicketsPage, isPortalAdmin } from './api'
import { normalizeRelayScheduleTicketList } from './relayScheduleSync'
import {
  markSchedulesSessionLoaded,
  readSchedulesTabCache,
  schedulesCacheKey,
  writeSchedulesTabCache,
} from './ticketTabCache'

type PortalUserLike = { role?: string | null; branchId?: string | null } | null | undefined

const prefetchInFlight = new Map<string, Promise<void>>()
const prefetchDoneAt = new Map<string, number>()
const PREFETCH_COOLDOWN_MS = 90_000

export function adjacentScheduleDateKeys(center = new Date()): string[] {
  const base = new Date(center)
  base.setHours(0, 0, 0, 0)
  const keys: string[] = []
  for (const offset of [-1, 0, 1]) {
    const d = new Date(base)
    d.setDate(base.getDate() + offset)
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return keys
}

function readAuthToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

function schedulesEndpoint(user: PortalUserLike): string | null {
  const role = (user?.role || '').toLowerCase()
  if (!role || role === 'customer') return null
  const isAdmin = isPortalAdmin(role)
  if (role === 'employee' || role === 'oic' || role === 'staff' || role === 'manager') {
    return '/tickets/branch'
  }
  if (isAdmin) return '/tickets'
  return '/tickets/branch'
}

function prefetchKey(user: PortalUserLike, globalBranchId?: string | null): string {
  const role = (user?.role || '').toLowerCase()
  const branch = globalBranchId || user?.branchId || 'all'
  return `${role}:${branch}:${adjacentScheduleDateKeys().join(',')}`
}

/** Warm schedules cache for yesterday, today, and tomorrow after login / branch change. */
export function prefetchSchedulesDateWindow(
  user: PortalUserLike,
  globalBranchId?: string | null,
  options?: { force?: boolean },
): Promise<void> {
  if (!user) return Promise.resolve()
  const token = readAuthToken()
  if (!token) return Promise.resolve()

  const endpoint = schedulesEndpoint(user)
  if (!endpoint) return Promise.resolve()

  const key = prefetchKey(user, globalBranchId)
  const lastAt = prefetchDoneAt.get(key) ?? 0
  if (!options?.force && Date.now() - lastAt < PREFETCH_COOLDOWN_MS) {
    return Promise.resolve()
  }

  const existing = prefetchInFlight.get(key)
  if (existing && !options?.force) return existing

  const role = (user.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  const isCustomer = role === 'customer'

  const job = (async () => {
    const dates = adjacentScheduleDateKeys()
    await Promise.all(
      dates.map(async dateKey => {
        const cacheKey = schedulesCacheKey(user, globalBranchId, isCustomer, isAdmin, false, dateKey)
        try {
          const list = await fetchTicketsPage(endpoint, token, { size: 500, date: dateKey })
          const merged = normalizeRelayScheduleTicketList(list as unknown[])
          writeSchedulesTabCache(cacheKey, merged, 'server')
          markSchedulesSessionLoaded(cacheKey)
        } catch (err) {
          console.warn('[SchedulesPrefetch] failed for', dateKey, err)
        }
      }),
    )
    prefetchDoneAt.set(key, Date.now())
  })()

  prefetchInFlight.set(key, job)
  return job.finally(() => {
    if (prefetchInFlight.get(key) === job) prefetchInFlight.delete(key)
  })
}

export function hasSchedulesCacheForDate(
  user: PortalUserLike,
  globalBranchId: string | null | undefined,
  isCustomer: boolean,
  isAdmin: boolean,
  isMyTickets: boolean,
  dateKey: string,
): boolean {
  const cacheKey = schedulesCacheKey(user, globalBranchId, isCustomer, isAdmin, isMyTickets, dateKey)
  const cached = readSchedulesTabCache(cacheKey)
  return Array.isArray(cached?.tickets)
}
