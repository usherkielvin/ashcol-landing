import { fetchTicketsPage, isPortalAdmin } from './api'
import { normalizeRelayScheduleTicketList } from './relayScheduleSync'
import { cacheTicketsByNumber, extractTicketNumbers, writeScheduleDateTicketNumbers } from './ticketNumberStore'
import {
  isSchedulesSessionLoaded,
  readSchedulesTabCache,
  schedulesCacheKey,
  writeSchedulesTabCache,
} from './ticketTabCache'

type PortalUserLike = { role?: string | null; branchId?: string | null } | null | undefined

const prefetchInFlight = new Map<string, Promise<void>>()
const prefetchDoneAt = new Map<string, number>()
const PREFETCH_COOLDOWN_MS = 90_000
const PREFETCH_PAGE_SIZE = 300
const PREFETCH_CONCURRENCY = 2

export function adjacentScheduleDateKeys(center = new Date()): string[] {
  const base = new Date(center)
  base.setHours(0, 0, 0, 0)
  const dow = base.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(base)
  monday.setDate(base.getDate() + offset)

  const keys: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    keys.push(formatDateKey(d))
  }
  return keys
}

/** Active date plus the day before and after — used for lightweight warm-cache. */
export function nearScheduleDateKeys(center = new Date()): string[] {
  const base = new Date(center)
  base.setHours(0, 0, 0, 0)
  const keys = new Set<string>()
  for (const offset of [-1, 0, 1]) {
    const d = new Date(base)
    d.setDate(base.getDate() + offset)
    keys.add(formatDateKey(d))
  }
  return [...keys]
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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

function prefetchKey(user: PortalUserLike, globalBranchId?: string | null, dateKeys?: string[]): string {
  const role = (user?.role || '').toLowerCase()
  const branch = globalBranchId || user?.branchId || 'all'
  const dates = dateKeys?.length ? dateKeys.join(',') : nearScheduleDateKeys().join(',')
  return `${role}:${branch}:${dates}`
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  })
  await Promise.all(runners)
}

/** Warm schedules cache for given dates (defaults: yesterday, today, tomorrow). */
export function prefetchSchedulesDateWindow(
  user: PortalUserLike,
  globalBranchId?: string | null,
  options?: { force?: boolean; dateKeys?: string[] },
): Promise<void> {
  if (!user) return Promise.resolve()
  const token = readAuthToken()
  if (!token) return Promise.resolve()

  const endpoint = schedulesEndpoint(user)
  if (!endpoint) return Promise.resolve()

  const dates = options?.dateKeys?.length
    ? [...new Set(options.dateKeys.map(d => d.split('T')[0].split(' ')[0].trim()).filter(Boolean))]
    : nearScheduleDateKeys()

  const key = prefetchKey(user, globalBranchId, dates)
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
    await runWithConcurrency(dates, PREFETCH_CONCURRENCY, async dateKey => {
      const cacheKey = schedulesCacheKey(user, globalBranchId, isCustomer, isAdmin, false, dateKey)
      if (!options?.force && isSchedulesSessionLoaded(cacheKey)) return
      try {
        const list = await fetchTicketsPage(endpoint, token, { size: PREFETCH_PAGE_SIZE, date: dateKey })
          const merged = normalizeRelayScheduleTicketList(list as unknown[])
          cacheTicketsByNumber(merged)
          writeScheduleDateTicketNumbers(dateKey, extractTicketNumbers(merged))
          writeSchedulesTabCache(cacheKey, merged, 'prefetch')
      } catch (err) {
        console.warn('[SchedulesPrefetch] failed for', dateKey, err)
      }
    })
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
