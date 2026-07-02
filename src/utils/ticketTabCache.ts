import { getActivePortalBranchId } from './api'
import { readLocalCache, readLocalCacheEnvelope, writeLocalCache } from './localDataCache'

export const TAB_CACHE_UPDATED = 'ashcol-tab-cache-updated'
export const TAB_CACHE_TTL_MS = 3 * 60 * 1000

const VERSION = 1

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

export function schedulesCacheKey(
  user: PortalUserLike,
  globalBranchId?: string | null,
  isCustomer?: boolean,
  isAdmin?: boolean,
  isMyTickets?: boolean,
): string {
  const ep = isMyTickets ? 'assigned' : isCustomer ? 'my' : isAdmin ? 'all' : 'branch'
  return `schedules:v${VERSION}:${ep}:${branchCachePart(user, globalBranchId)}`
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
