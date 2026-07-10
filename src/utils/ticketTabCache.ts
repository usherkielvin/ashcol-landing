import { getActivePortalBranchId, isPortalAdmin } from './api'
import { readLocalCache, readLocalCacheEnvelope, writeLocalCache } from './localDataCache'
import {
  normalizeRelayScheduleTicket,
  resolveRelayScheduleDateKey,
  shouldExcludeRelayFromTab,
} from './relayScheduleSync'
import { cacheTicketByNumber, normalizeTicketNumberKey } from './ticketNumberStore'

export const TAB_CACHE_UPDATED = 'ashcol-tab-cache-updated'
/** Fired before logout — schedules page should flush rows into local cache. */
export const SCHEDULES_PERSIST_LOCAL = 'ashcol-schedules-persist-local'
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

/** Survives route unmount within the same SPA session (localStorage can miss / lag). */
const schedulesMemory = new Map<string, SchedulesTabCache>()

export function readSchedulesTabCache(key: string): SchedulesTabCache | null {
  const mem = schedulesMemory.get(key)
  if (mem && Array.isArray(mem.tickets)) return mem
  const disk = readTabCache<SchedulesTabCache>(key)
  if (disk && Array.isArray(disk.tickets)) {
    schedulesMemory.set(key, disk)
    return disk
  }
  return disk
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

/** Clears per-session sync markers so the next login fetches once from the server. Keeps localStorage cache. */
export function clearSchedulesSessionMarkers(): void {
  try {
    const sessionKeys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith('ashcol-schedules-loaded:')) sessionKeys.push(key)
    }
    sessionKeys.forEach(k => sessionStorage.removeItem(k))
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
    sessionLoaded: isSchedulesSessionLoaded(cacheKey) || hasCache,
  }
}

export function writeSchedulesTabCache(key: string, tickets: unknown[], source: 'server' | 'local' | 'prefetch'): void {
  const existing = readSchedulesTabCache(key)
  const next: SchedulesTabCache = {
    tickets,
    lastSyncAt: source === 'server' || source === 'prefetch' ? Date.now() : existing?.lastSyncAt,
  }
  schedulesMemory.set(key, next)
  writeTabCache(key, next)
  if (source === 'server') markSchedulesSessionLoaded(key)
}

/** Flush in-memory schedule caches to localStorage (e.g. before logout / PDF). */
export function persistSchedulesMemoryToDisk(): void {
  for (const [key, val] of schedulesMemory.entries()) {
    if (!Array.isArray(val?.tickets)) continue
    writeTabCache(key, val)
  }
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

function schedulesCacheDateFromKey(logicalKey: string): string | null {
  const match = logicalKey.match(/:(\d{4}-\d{2}-\d{2})$/)
  return match ? match[1] : null
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
    schedulesMemory.clear()
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('ashcol-cache:schedules:') || key.startsWith('schedules:'))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
    const sessionKeys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith('ashcol-schedules-loaded:')) sessionKeys.push(key)
    }
    sessionKeys.forEach(k => sessionStorage.removeItem(k))
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
  const ticketNumberKey = normalizeTicketNumberKey(
    ticket.ticketNumber || ticket.ticket_number,
  )
  if (!id && !ticketNumberKey) return

  try {
    const normalized = normalizeRelayScheduleTicket(ticket)
    if (ticketNumberKey) {
      cacheTicketByNumber(normalized)
    }
    const PREFIX = 'ashcol-cache:'

    const matchesRow = (row: unknown): boolean => {
      if (!row || typeof row !== 'object') return false
      const rowObj = row as { id?: string; ticketNumber?: string; ticket_number?: string }
      if (id && String(rowObj.id || '') === id) return true
      if (!ticketNumberKey) return false
      return normalizeTicketNumberKey(rowObj.ticketNumber || rowObj.ticket_number) === ticketNumberKey
    }

    const touchKey = (logicalKey: string, cached: { tickets?: unknown[]; branches?: unknown[]; employees?: unknown[]; lastSyncAt?: number }) => {
      if (!Array.isArray(cached?.tickets)) return

      const ticketDate = resolveRelayScheduleDateKey(normalized)
      const cacheDate = logicalKey.startsWith('schedules:') ? schedulesCacheDateFromKey(logicalKey) : null

      const hadRow = cached.tickets.some(matchesRow)
      let tickets = cached.tickets.map((t: unknown) => (matchesRow(t) ? { ...(t as object), ...normalized } : t))

      if (logicalKey.startsWith('relays:')) {
        tickets = tickets.filter((t: unknown) => !shouldExcludeRelayFromTab(t as Record<string, unknown>))
      } else if (logicalKey.startsWith('schedules:')) {
        if (hadRow && cacheDate && ticketDate && cacheDate !== ticketDate) {
          tickets = tickets.filter((t: unknown) => !matchesRow(t))
        } else if (!hadRow && !shouldExcludeRelayFromTab(normalized)) {
          if (cacheDate && ticketDate && cacheDate === ticketDate) {
            tickets = [normalized, ...tickets]
          }
        }
      }

      const next = { ...cached, tickets, lastSyncAt: Date.now() }
      if (logicalKey.startsWith('schedules:')) {
        schedulesMemory.set(logicalKey, { tickets, lastSyncAt: next.lastSyncAt })
      }
      writeTabCache(logicalKey, next)
    }

    for (const [memKey, memVal] of schedulesMemory.entries()) {
      touchKey(memKey, memVal)
    }

    for (let i = 0; i < localStorage.length; i++) {
      const rawKey = localStorage.key(i)
      if (!rawKey) continue
      const logicalKey = rawKey.startsWith(PREFIX) ? rawKey.slice(PREFIX.length) : rawKey
      if (!logicalKey.startsWith('relays:') && !logicalKey.startsWith('schedules:')) continue
      if (logicalKey.startsWith('schedules:') && schedulesMemory.has(logicalKey)) continue

      const cached = readTabCache<{ tickets?: unknown[]; branches?: unknown[]; employees?: unknown[]; lastSyncAt?: number }>(logicalKey)
      if (!cached) continue
      touchKey(logicalKey, cached)
    }

    window.dispatchEvent(new CustomEvent(TAB_CACHE_UPDATED, { detail: { ticketId: id, ticket: normalized } }))
  } catch (e) {
    console.warn('syncTicketAcrossTabCaches failed', e)
  }
}
