import { fetchTicketsPage, isPortalAdmin, resolveScopedBranchId } from './api'
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
const PREFETCH_COOLDOWN_MS = 300_000
const PREFETCH_PAGE_SIZE = 200
const PREFETCH_CACHE_FRESH_MS = 10 * 60_000

/** Block adjacent-date prefetch while the active schedules date is loading. */
let activeScheduleFetchCount = 0

export function beginActiveScheduleFetch(): void {
  activeScheduleFetchCount += 1
}

export function endActiveScheduleFetch(): void {
  activeScheduleFetchCount = Math.max(0, activeScheduleFetchCount - 1)
}

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

function prefetchKey(user: PortalUserLike, globalBranchId?: string | null, dateKeys?: string[]): string {
  const role = (user?.role || '').toLowerCase()
  const branch = globalBranchId || user?.branchId || 'all'
  const dates = dateKeys?.length ? dateKeys.join(',') : nearScheduleDateKeys().join(',')
  return `${role}:${branch}:${dates}`
}

function resolvePrefetchBranchId(globalBranchId?: string | null, user?: PortalUserLike): string | undefined {
  const raw = globalBranchId || user?.branchId
  if (!raw || raw === 'ALL_BRANCHES') return undefined
  return resolveScopedBranchId(raw)
}

function isCacheFreshEnough(cacheKey: string): boolean {
  if (isSchedulesSessionLoaded(cacheKey)) return true
  const cached = readSchedulesTabCache(cacheKey)
  if (!Array.isArray(cached?.tickets) || !cached.tickets.length) return false
  const at = cached.lastSyncAt ?? 0
  return at > 0 && Date.now() - at < PREFETCH_CACHE_FRESH_MS
}

/** Warm schedules cache for adjacent dates — never competes with the active date fetch. */
export function prefetchSchedulesDateWindow(
  user: PortalUserLike,
  globalBranchId?: string | null,
  options?: { force?: boolean; dateKeys?: string[] },
): Promise<void> {
  if (!user) return Promise.resolve()
  if (activeScheduleFetchCount > 0 && !options?.force) return Promise.resolve()
  const token = readAuthToken()
  if (!token) return Promise.resolve()

  const role = (user.role || '').toLowerCase()
  if (!role || role === 'customer') return Promise.resolve()

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

  const isAdmin = isPortalAdmin(role)
  const isCustomer = role === 'customer'
  const branchId = resolvePrefetchBranchId(globalBranchId, user)

  const job = (async () => {
    for (const dateKey of dates) {
      if (activeScheduleFetchCount > 0 && !options?.force) return
      const cacheKey = schedulesCacheKey(user, globalBranchId, isCustomer, isAdmin, false, dateKey)
      if (!options?.force && isCacheFreshEnough(cacheKey)) continue
      try {
        const list = await fetchTicketsPage('/tickets/branch', token, {
          size: PREFETCH_PAGE_SIZE,
          date: dateKey,
          paginate: false,
          ...(branchId ? { branchId } : {}),
        })
        const merged = normalizeRelayScheduleTicketList(list as unknown[])
        cacheTicketsByNumber(merged)
        writeScheduleDateTicketNumbers(dateKey, extractTicketNumbers(merged))
        writeSchedulesTabCache(cacheKey, merged, 'prefetch')
      } catch (err) {
        console.warn('[SchedulesPrefetch] failed for', dateKey, err)
      }
    }
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
