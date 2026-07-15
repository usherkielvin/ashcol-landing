import { API_BASE_URL, getActivePortalBranchId, readApiError } from './api'
import { readTabCache, TAB_CACHE_TTL_MS, warrantyCacheIsFresh, warrantyCacheKey, writeTabCache } from './ticketTabCache'

export { warrantyCacheIsFresh } from './ticketTabCache'

export type WarrantyTicket = {
  id: string
  ticketNumber?: string | null
  customerName?: string | null
  controlNumber?: string | null
  unitType?: string | null
  acDetails?: string | null
  unitBrandDisplay?: string | null
  dealer?: string | null
  sourceVendor?: string | null
  district?: string | null
  branchId?: string | null
  status?: string | null
  preferredDate?: string | null
  preferred_date?: string | null
  installerName?: string | null
  negotiatorId?: string | null
  negotiatorName?: string | null
  remarksUpdate?: string | null
  parentTicketId?: string | null
  parentCustomerName?: string | null
  parentTicketNumber?: string | null
  parentControlNumber?: string | null
  warrantyRegistrationCompleted?: boolean | null
  brandRegisteredTo?: string | null
  brandRegistrationNumber?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type WarrantyListsCache = {
  pending: WarrantyTicket[]
  registered: WarrantyTicket[]
  lastSyncAt?: number
}

export const WARRANTY_CACHE_UPDATED = 'ashcol-warranty-cache-updated'

/** Throttle server sync — every 3 min */
export const SYNC_INTERVAL_MS = TAB_CACHE_TTL_MS

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function warrantyCacheKeyForBranch(branchId?: string) {
  return warrantyCacheKey(branchId)
}

export function resolveWarrantyBranchId(user?: { role?: string | null; branchId?: string | null } | null) {
  const id = getActivePortalBranchId(user)
  if (!id || id === 'ALL_BRANCHES') return undefined
  return id
}

export function readWarrantyCache(branchId?: string): WarrantyListsCache | null {
  return readTabCache<WarrantyListsCache>(warrantyCacheKeyForBranch(branchId))
}

export function getInitialWarrantyFromStorage(): {
  pending: WarrantyTicket[]
  registered: WarrantyTicket[]
  hasCache: boolean
} {
  const g = typeof localStorage !== 'undefined' ? localStorage.getItem('ashcol-global-branch-id') : null
  const branchId = g && g !== 'ALL_BRANCHES' ? g : undefined
  const cached = readWarrantyCache(branchId)
  if (!cached) return { pending: [], registered: [], hasCache: false }
  const hasCache = cached.pending.length > 0 || cached.registered.length > 0
  return { pending: cached.pending, registered: cached.registered, hasCache }
}

export function writeWarrantyCache(branchId: string | undefined, data: WarrantyListsCache): void {
  writeTabCache(warrantyCacheKeyForBranch(branchId), data)
  window.dispatchEvent(new CustomEvent(WARRANTY_CACHE_UPDATED, { detail: { branchId } }))
}

export function patchWarrantyCache(
  branchId: string | undefined,
  patch: Partial<WarrantyListsCache>,
): WarrantyListsCache | null {
  const current = readWarrantyCache(branchId)
  if (!current) return null
  const next = { ...current, ...patch }
  writeWarrantyCache(branchId, next)
  return next
}

type WarrantySyncResult = {
  archivesCreated?: number
  warrantyCreated?: number
  warrantySkipped?: number
  archivesLinked?: number
  wtyLinked?: number
  wtyDeduped?: number
  parentStatusUpdated?: number
  customerDuplicatesMerged?: number
  duplicatesMerged?: number
}

const warrantySyncInFlight = new Map<string, Promise<WarrantySyncResult>>()

export async function syncWarrantyRegistrations(
  token: string,
  branchId?: string,
): Promise<WarrantySyncResult> {
  const key = branchId || '__all__'
  const existing = warrantySyncInFlight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const params = new URLSearchParams()
    if (branchId) params.set('branchId', branchId)
    const qs = params.toString()
    const res = await fetch(
      `${API_BASE_URL}/tickets/warranty-registrations/sync${qs ? `?${qs}` : ''}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw new Error(await readApiError(res))
    const payload = await res.json()
    return payload?.data || payload || {}
  })()

  warrantySyncInFlight.set(key, promise)
  try {
    return await promise
  } finally {
    warrantySyncInFlight.delete(key)
  }
}

export async function fetchWarrantyRegistrations(
  token: string,
  tab: 'pending' | 'registered',
  branchId?: string,
): Promise<WarrantyTicket[]> {
  const params = new URLSearchParams({ tab, page: '0', size: '200' })
  if (branchId) params.set('branchId', branchId)
  const res = await fetch(`${API_BASE_URL}/tickets/warranty-registrations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await readApiError(res))
  const payload = await res.json()
  const rows: WarrantyTicket[] = payload?.data?.tickets || payload?.tickets || []

  if (tab === 'pending') {
    // API pending tab = WTY_REGISTRATION tickets awaiting registration (status PENDING).
    return rows.filter((r) => {
      if (r.warrantyRegistrationCompleted) return false
      return (r.status || '').toUpperCase() !== 'CANCELLED'
    })
  }

  return rows.filter((r) => !!r.warrantyRegistrationCompleted)
}

/**
 * Load warranty lists from the API (no bulk sync — pending rows are created when
 * Schedules marks a ticket installed and the archive is saved).
 */
export async function refreshWarrantyRegistrations(
  token: string,
  branchId?: string,
  options?: { forceRefresh?: boolean },
): Promise<WarrantyListsCache> {
  const cached = readWarrantyCache(branchId)
  const cacheIsFresh = warrantyCacheIsFresh(branchId)

  if (cached && cacheIsFresh && !options?.forceRefresh) {
    return cached
  }

  const now = Date.now()
  const [pending, registered] = await Promise.all([
    fetchWarrantyRegistrations(token, 'pending', branchId),
    fetchWarrantyRegistrations(token, 'registered', branchId),
  ])

  const result: WarrantyListsCache = {
    pending,
    registered,
    lastSyncAt: now,
  }
  writeWarrantyCache(branchId, result)
  return result
}

export async function markWarrantyRegistered(token: string, ticketId: string): Promise<WarrantyTicket> {
  const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ warrantyRegistrationCompleted: true, status: 'COMPLETED' }),
  })
  if (!res.ok) throw new Error(await readApiError(res))
  const payload = await res.json()
  return payload?.data || payload
}
