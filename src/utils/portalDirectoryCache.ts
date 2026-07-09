import { API_BASE_URL, readApiError } from './api'
import { isTabCacheFresh, readTabCache, readTabCacheEntry, writeTabCache } from './ticketTabCache'

const VERSION = 1

function employeesKey(role?: string) {
  return `portal-dir:v${VERSION}:employees:${role || 'all'}`
}

function branchesKey() {
  return `portal-dir:v${VERSION}:branches`
}

function lineupKey(kind: 'installer-index' | 'driver-names') {
  return `portal-dir:v${VERSION}:lineup:${kind}`
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export function clearPortalEmployeesCache(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.includes('portal-dir:') && key.includes(':employees:')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
  } catch (e) {
    console.warn('Error clearing portal employees cache:', e)
  }
}

export async function fetchCachedEmployees(
  token: string,
  role?: string,
  options?: { force?: boolean },
): Promise<Array<Record<string, unknown>>> {
  const key = employeesKey(role)
  if (!options?.force) {
    const cached = readTabCacheEntry<Array<Record<string, unknown>>>(key)
    if (cached && isTabCacheFresh(cached.savedAt)) {
      return cached.data
    }
  }

  const qs = role ? `?role=${encodeURIComponent(role)}` : ''
  const res = await fetch(`${API_BASE_URL}/user/all${qs}`, { headers: authHeaders(token) })
  if (!res.ok) {
    if (cached?.data?.length) return cached.data
    throw new Error(await readApiError(res))
  }
  const data = await res.json()
  const list = Array.isArray(data) ? data : (data?.data || [])
  const normalized = Array.isArray(list) ? list as Array<Record<string, unknown>> : []
  writeTabCache(key, normalized)
  return normalized
}

export async function fetchCachedBranches(
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const key = branchesKey()
  const cached = readTabCacheEntry<Array<Record<string, unknown>>>(key)
  if (cached && isTabCacheFresh(cached.savedAt)) {
    return cached.data
  }

  const res = await fetch(`${API_BASE_URL}/branches`, { headers: authHeaders(token) })
  if (!res.ok) {
    if (cached?.data?.length) return cached.data
    throw new Error(await readApiError(res))
  }
  const data = await res.json()
  const list = data?.data || data || []
  const normalized = Array.isArray(list) ? list as Array<Record<string, unknown>> : []
  writeTabCache(key, normalized)
  return normalized
}

export async function fetchCachedLineupInstallerIndex(token: string): Promise<unknown[]> {
  const key = lineupKey('installer-index')
  const cached = readTabCache<unknown[]>(key)
  const entry = readTabCacheEntry<unknown[]>(key)
  if (entry && isTabCacheFresh(entry.savedAt) && Array.isArray(cached)) {
    return cached
  }

  const res = await fetch(`${API_BASE_URL}/v1/lineup/installer-branch-index`, { headers: authHeaders(token) })
  if (!res.ok) {
    return Array.isArray(cached) ? cached : []
  }
  const list = await res.json()
  const normalized = Array.isArray(list) ? list : []
  writeTabCache(key, normalized)
  return normalized
}

export async function fetchCachedDriverOnlyNames(token: string): Promise<string[]> {
  const key = lineupKey('driver-names')
  const cached = readTabCache<string[]>(key)
  const entry = readTabCacheEntry<string[]>(key)
  if (entry && isTabCacheFresh(entry.savedAt) && Array.isArray(cached)) {
    return cached
  }

  const res = await fetch(`${API_BASE_URL}/v1/lineup/driver-only-names`, { headers: authHeaders(token) })
  if (!res.ok) {
    return Array.isArray(cached) ? cached : []
  }
  const list = await res.json()
  const normalized = Array.isArray(list) ? list.map(String) : []
  writeTabCache(key, normalized)
  return normalized
}
