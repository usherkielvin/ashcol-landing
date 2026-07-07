import { getActivePortalBranchId, isPortalAdmin } from './api'
import { readLocalCache, readLocalCacheEnvelope, writeLocalCache } from './localDataCache'
import { normalizeRelayScheduleTicket, shouldExcludeRelayFromTab } from './relayScheduleSync'

export const TAB_CACHE_UPDATED = 'ashcol-tab-cache-updated'
export const TAB_CACHE_TTL_MS = 5 * 60 * 1000
/** Background re-fetch interval; cached rows are always shown instantly regardless of age. */
export const SCHEDULES_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const VERSION = 2

type PortalUserLike = { role?: string | null; branchId?: string | null } | null | undefined

export function branchCachePart(user?: PortalUserLike, globalBranchId?: string | null): string {
  if (globalBranchId && globalBranchId !== 'ALL_BRANCHES') return globalBranchId
  const active = getActivePortalBranchId(user)
  if (active && active !== 'ALL_BRANCHES') return active
  if (user?.branchId) return user.branchId
  return 'all'
}

export function readTabCache<T>(key: string): T | null {
  return readLocalCache<T>(key)
}

export function readTabCacheEntry<T>(key: string): { data: T; savedAt: number } | null {
  const env = readLocalCacheEnvelope<T>(key)
  if (!env) return null
  return { data: env.data, savedAt: env.at }
}

export function isTabCacheFresh(savedAt: number | undefined, ttlMs = TAB_CACHE_TTL_MS): boolean {
  if (!savedAt) return false
  return Date.now() - savedAt < ttlMs
}

export function writeTabCache<T>(key: string, data: T): void {
  writeLocalCache(key, data, VERSION)
  window.dispatchEvent(new CustomEvent(TAB_CACHE_UPDATED, { detail: { key } }))
}

export function patchTabCache<T extends object>(key: string, patch: Partial<T>): T | null {
  const current = readTabCache<T>(key)
  if (!current) return null
  const next = { ...current, ...patch }
  writeTabCache(key, next)
  return next
}

export type SchedulesTabCache = { tickets: unknown[]; lastSyncAt?: number }

export function readSchedulesTabCache(key: string): SchedulesTabCache | null {
  return readTabCache<SchedulesTabCache>(key)
}

export function storedPortalUser(): { role?: string | null; branchId?: string | null } | null {
  try {
    const raw = sessionStorage.getItem('ashcol-user') || localStorage.getItem('ashcol-user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function schedulesDateKeyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function schedulesSessionLoadedKey(cacheKey: string): string {
  return `ashcol-schedules-loaded:${cacheKey}`
}

export function markSchedulesSessionLoaded(cacheKey: string): void {
  try {
    sessionStorage.setItem(schedulesSessionLoadedKey(cacheKey), String(Date.now()))
  } catch {
    // ignore
  }
}

export function isSchedulesSessionLoaded(cacheKey: string): boolean {
  try {
    return sessionStorage.getItem(schedulesSessionLoadedKey(cacheKey)) != null
  } catch {
    return false
  }
}

/** Synchronous cache read for useState initializers — survives route unmount/remount. */
export function getInitialSchedulesFromCache(
  pathname: string,
  dateFilter?: string,
): { tickets: unknown[]; hasCache: boolean; cacheKey: string; sessionLoaded: boolean } {
  const isMyTickets = pathname === '/my-tickets'
  if (pathname !== '/schedules' && !isMyTickets) {
    return { tickets: [], hasCache: false, cacheKey: '', sessionLoaded: false }
  }

  const user = storedPortalUser()
  const globalBranchId = localStorage.getItem('ashcol-global-branch-id')
  const role = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'
  const isAdmin = isPortalAdmin(role)
  const datePart = isMyTickets ? undefined : (dateFilter?.trim() || schedulesDateKeyLocal())

  const cacheKey = schedulesCacheKey(user, globalBranchId, isCustomer, isAdmin, isMyTickets, datePart)
  const cached = readSchedulesTabCache(cacheKey)
  const hasCache = Array.isArray(cached?.tickets)
  const tickets = hasCache ? cached!.tickets! : []
  return {
    tickets,
    hasCache,
    cacheKey,
    sessionLoaded: isSchedulesSessionLoaded(cacheKey),
  }
}

export function writeSchedulesTabCache(key: string, tickets: unknown[], source: 'server' | 'local'): void {
  const existing = readTabCache<SchedulesTabCache>(key)
  writeTabCache(key, {
    tickets,
    lastSyncAt: source === 'server' ? Date.now() : existing?.lastSyncAt,
  })
}

export function schedulesCacheKey(
  user: PortalUserLike,
  globalBranchId?: string | null,
  isCustomer?: boolean,
  isAdmin?: boolean,
  isMyTickets?: boolean,
  dateFilter?: string,
): string {
  const ep = isMyTickets ? 'assigned' : isCustomer ? 'my' : isAdmin ? 'all' : 'branch'
  const datePart = !isMyTickets && dateFilter?.trim() ? `:${dateFilter.trim()}` : ''
  return `schedules:v${VERSION}:${ep}:${branchCachePart(user, globalBranchId)}${datePart}`
}

export type RelaysTabCache = {
  tickets: unknown[]
  branches?: unknown[]
  employees?: unknown[]
  lastSyncAt?: number
}

export function relaysCacheKey(
  ticketScope: 'ALL' | 'MY',
  user?: PortalUserLike,
  globalBranchId?: string | null,
): string {
  return `relays:v${VERSION}:${ticketScope}:${branchCachePart(user, globalBranchId)}`
}

export function relaysCacheIsFresh(
  ticketScope: 'ALL' | 'MY',
  user?: PortalUserLike,
  globalBranchId?: string | null,
): boolean {
  const entry = readTabCacheEntry<RelaysTabCache>(relaysCacheKey(ticketScope, user, globalBranchId))
  if (!entry) return false
  const at = entry.data.lastSyncAt ?? entry.savedAt
  return isTabCacheFresh(at)
}

export type ArchivesTabCache = { rows: unknown[]; lastSyncAt?: number }

export function archivesCacheKey(branchId: string, monthFilter: string): string {
  return `archives:v${VERSION}:${branchId || 'none'}:${monthFilter?.trim() || 'all'}`
}

export function readArchivesCache(branchId: string, monthFilter: string): ArchivesTabCache | null {
  return readTabCache<ArchivesTabCache>(archivesCacheKey(branchId, monthFilter))
}

export function writeArchivesCache(branchId: string, monthFilter: string, rows: unknown[]): void {
  writeTabCache(archivesCacheKey(branchId, monthFilter), {
    rows,
    lastSyncAt: Date.now(),
  })
}

export function archivesCacheIsFresh(branchId: string, monthFilter: string): boolean {
  const entry = readTabCacheEntry<ArchivesTabCache>(archivesCacheKey(branchId, monthFilter))
  if (!entry) return false
  const at = entry.data.lastSyncAt ?? entry.savedAt
  return isTabCacheFresh(at)
}

export function getInitialArchivesFromCache(
  branchId: string,
  monthFilter: string,
): { rows: unknown[]; hasCache: boolean } {
  if (!branchId || branchId === 'ALL_BRANCHES') {
    return { rows: [], hasCache: false }
  }
  const cached = readArchivesCache(branchId, monthFilter)
  const rows = Array.isArray(cached?.rows) ? cached.rows : []
  return { rows, hasCache: rows.length > 0 }
}

export function currentArchivesMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function storedArchivesBranchId(): string {
  const stored = localStorage.getItem('ashcol-global-branch-id')
  return stored && stored !== 'ALL_BRANCHES' ? stored : ''
}

export type WarrantyTabCache = {
  pending: unknown[]
  registered: unknown[]
  lastSyncAt?: number
}

export function warrantyCacheKey(branchId?: string): string {
  return `warranty-reg:v${VERSION}:${branchId || 'all'}`
}

export function readWarrantyTabCache(branchId?: string): WarrantyTabCache | null {
  return readTabCache<WarrantyTabCache>(warrantyCacheKey(branchId))
}

export function warrantyCacheIsFresh(branchId?: string): boolean {
  const entry = readTabCacheEntry<WarrantyTabCache>(warrantyCacheKey(branchId))
  if (!entry) return false
  const at = entry.data.lastSyncAt ?? entry.savedAt
  return isTabCacheFresh(at)
}

export function clearSchedulesCache(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('schedules:')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
  } catch (e) {
    console.warn('Error clearing schedules cache:', e)
  }
}
export function clearRelaysCache(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('relays:')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
  } catch (e) {
    console.warn('Error clearing relays cache:', e)
  }
}

export function clearWarrantyCache(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('warranty-reg:') || key.startsWith('warranty:'))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
  } catch (e) {
    console.warn('Error clearing warranty cache:', e)
  }
}

/** Clear schedules + relays tab caches (use after cross-tab ticket sync). */
export function clearRelayScheduleCaches(): void {
  clearSchedulesCache()
  clearRelaysCache()
}

/** Push one ticket into every relays/schedules tab cache so both tabs stay aligned. */
export function syncTicketAcrossTabCaches(ticket: any): void {
  const id = String(ticket.id || '').trim()
  if (!id) return

  try {
    const normalized = normalizeRelayScheduleTicket(ticket)

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || (!key.startsWith('relays:') && !key.startsWith('schedules:'))) continue

      const cached = readTabCache<{ tickets?: unknown[]; branches?: unknown[]; employees?: unknown[]; lastSyncAt?: number }>(key)
      if (!Array.isArray(cached?.tickets)) continue

      const hadRow = cached.tickets.some((t: unknown) => String((t as { id?: string })?.id) === id)
      let tickets = cached.tickets.map((t: unknown) => {
        if (String((t as { id?: string })?.id) !== id) return t
        return { ...(t as object), ...normalized }
      })

      if (key.startsWith('relays:')) {
        tickets = tickets.filter((t: unknown) => !shouldExcludeRelayFromTab(t as Record<string, unknown>))
      } else if (!hadRow && !shouldExcludeRelayFromTab(normalized)) {
        tickets = [normalized, ...tickets]
      }

      writeTabCache(key, { ...cached, tickets, lastSyncAt: Date.now() })
    }

    window.dispatchEvent(new CustomEvent(TAB_CACHE_UPDATED, { detail: { ticketId: id, ticket: normalized } }))
  } catch (e) {
    console.warn('syncTicketAcrossTabCaches failed', e)
  }
}
