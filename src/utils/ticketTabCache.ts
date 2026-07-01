import { getActivePortalBranchId } from './api'
import { readLocalCache, writeLocalCache } from './localDataCache'

export const TAB_CACHE_UPDATED = 'ashcol-tab-cache-updated'

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

export type SchedulesTabCache = { tickets: unknown[] }

export function schedulesCacheKey(
  user: PortalUserLike,
  globalBranchId?: string | null,
  isCustomer?: boolean,
  isAdmin?: boolean,
): string {
  const ep = isCustomer ? 'my' : isAdmin ? 'all' : 'branch'
  return `schedules:v${VERSION}:${ep}:${branchCachePart(user, globalBranchId)}`
}

export type RelaysTabCache = {
  tickets: unknown[]
  branches?: unknown[]
  employees?: unknown[]
}

export function relaysCacheKey(
  ticketScope: 'ALL' | 'MY',
  user?: PortalUserLike,
  globalBranchId?: string | null,
): string {
  return `relays:v${VERSION}:${ticketScope}:${branchCachePart(user, globalBranchId)}`
}

export type ArchivesTabCache = { rows: unknown[]; lastSyncAt?: number }

export function archivesCacheKey(branchId: string, monthFilter: string): string {
  return `archives:v${VERSION}:${branchId || 'none'}:${monthFilter?.trim() || 'all'}`
}

export type WarrantyTabCache = {
  pending: unknown[]
  registered: unknown[]
  lastSyncAt?: number
}

export function warrantyCacheKey(branchId?: string): string {
  return `warranty-reg:v${VERSION}:${branchId || 'all'}`
}
