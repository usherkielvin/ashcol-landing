import type { AuditExpense } from '../types/auditExpense'
import { API_BASE_URL } from './api'
import { clearLocalCache, readLocalCache, readLocalCacheEnvelope, writeLocalCache } from './localDataCache'

const BASE_URL = `${API_BASE_URL}/v1/audit-expenses`

function getToken() {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

/** The branch a list request is for. Without it the server returns every branch the caller may see. */
export type AuditExpenseScope = { branchId?: string; branchName?: string }

function scopeParams(scope?: AuditExpenseScope) {
  const params = new URLSearchParams()
  if (scope?.branchId) params.set('branchId', scope.branchId)
  if (scope?.branchName) params.set('branchName', scope.branchName)
  return params
}

function listUrl(scope?: AuditExpenseScope, updatedSince?: string) {
  const params = scopeParams(scope)
  if (updatedSince) params.set('updatedSince', updatedSince)
  const qs = params.toString()
  return qs ? `${BASE_URL}?${qs}` : BASE_URL
}

function idsUrl(scope?: AuditExpenseScope) {
  return `${BASE_URL}/ids?${scopeParams(scope).toString()}`
}

/**
 * Like loadAuditExpenses, but a failure or a server that does not answer within 90 seconds throws instead of looking like
 * "no records". The Expense Records page uses it so it can say so (and never sit on its loading screen forever).
 * With a scope the server sends only that branch's records (a superset: both Taguig lines, legacy ids), which the page
 * narrows down itself; an older server ignores the scope and sends everything, which still works.
 */
export async function loadAuditExpensesStrict(scope?: AuditExpenseScope): Promise<AuditExpense[]> {
  const res = await fetch(listUrl(scope), {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal: AbortSignal.timeout(90000), // give a slow link time, but never wait forever
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function loadAuditExpenses(scope?: AuditExpenseScope): Promise<AuditExpense[]> {
  try {
    const res = await fetch(listUrl(scope), {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    if (!res.ok) return []
    return await res.json()
  } catch (err) {
    console.error('[AuditExpenseStorage] Load error:', err)
    return []
  }
}

/**
 * Another record that already carries this receipt number, in any branch the caller may see — or null. The page only
 * holds the branch it is showing, so its duplicate check asks the server for the rest. Never blocks a save: an older
 * server (no such endpoint), an error or a slow answer all count as "no duplicate found".
 */
export async function findExpenseByReceiptNo(receiptNo: string, excludeId?: string): Promise<AuditExpense | null> {
  try {
    const params = new URLSearchParams({ receiptNo })
    if (excludeId) params.set('excludeId', excludeId)
    const res = await fetch(`${BASE_URL}/receipt-check?${params.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status !== 200) return null
    return await res.json()
  } catch {
    return null
  }
}

// Saved copy of each branch's records, shown at once on the next visit. Memory keeps every branch opened this session;
// localStorage keeps the last few branches (records are too big to keep them all), each with the time it was saved, so a
// returning user only downloads what changed since (see syncBranchExpenses) instead of the whole branch again.
const branchExpensesMemory = new Map<string, { rows: AuditExpense[]; at: number }>()
const SAVED_KEY_PREFIX = 'expense-records:v2:'
const SAVED_INDEX_KEY = 'expense-records:v2:index'
const MAX_SAVED_BRANCHES = 4
const MAX_PERSISTED_CHARS = 2_000_000
// Older than this, the saved copy is dropped and the branch is downloaded in full again.
const MAX_SAVED_AGE_MS = 14 * 24 * 60 * 60 * 1000

export function readSavedBranchExpenses(cacheKey: string): { rows: AuditExpense[]; at: number } | null {
  if (!cacheKey) return null
  const inMemory = branchExpensesMemory.get(cacheKey)
  if (inMemory) return inMemory
  const stored = readLocalCacheEnvelope<AuditExpense[]>(SAVED_KEY_PREFIX + cacheKey)
  if (!stored || !Array.isArray(stored.data)) return null
  const saved = { rows: stored.data, at: stored.at }
  branchExpensesMemory.set(cacheKey, saved)
  return saved
}

export function readCachedBranchExpenses(cacheKey: string): AuditExpense[] | null {
  return readSavedBranchExpenses(cacheKey)?.rows ?? null
}

export function writeCachedBranchExpenses(cacheKey: string, rows: AuditExpense[]): void {
  if (!cacheKey) return
  branchExpensesMemory.set(cacheKey, { rows, at: Date.now() })
  try {
    if (JSON.stringify(rows).length > MAX_PERSISTED_CHARS) return
    writeLocalCache(SAVED_KEY_PREFIX + cacheKey, rows)
    const index = (readLocalCache<string[]>(SAVED_INDEX_KEY) || []).filter((k) => k !== cacheKey)
    index.unshift(cacheKey)
    for (const dropped of index.splice(MAX_SAVED_BRANCHES)) clearLocalCache(SAVED_KEY_PREFIX + dropped)
    writeLocalCache(SAVED_INDEX_KEY, index)
    clearLocalCache('expense-records:v1:last') // the older single-branch copy
  } catch {
    // not serializable / out of memory — the in-memory copy is enough
  }
}

/**
 * Small saved feeds (a branch's purchases, a month's DTR totals) kept in the browser with the time they were saved, so a
 * returning user sees them at once and the page can skip a refresh that is not needed yet. Only the newest few per kind
 * are kept; the least recently written are dropped.
 */
export function readSavedFeed<T>(kind: string, key: string): { data: T; at: number } | null {
  const env = readLocalCacheEnvelope<T>(`feed:${kind}:${key}`)
  return env ? { data: env.data, at: env.at } : null
}

export function writeSavedFeed<T>(kind: string, key: string, data: T, maxEntries: number): void {
  try {
    const indexKey = `feed:${kind}:index`
    const index = (readLocalCache<string[]>(indexKey) || []).filter((k) => k !== key)
    index.unshift(key)
    for (const dropped of index.splice(maxEntries)) clearLocalCache(`feed:${kind}:${dropped}`)
    writeLocalCache(`feed:${kind}:${key}`, data)
    writeLocalCache(indexKey, index)
  } catch {
    // quota / private mode — the in-memory copy is enough
  }
}

/** Newest creation/update time among the rows (ISO strings from the server compare correctly as text), or ''. */
function newestChange(rows: AuditExpense[]): string {
  let newest = ''
  for (const r of rows) {
    const t = r.updatedAt || r.createdAt || ''
    // Anything but an ISO string (or a row without a time) cannot be compared: leave it to a full download.
    if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(t)) return ''
    if (t > newest) newest = t
  }
  return newest
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return (await res.json()) as T
}

/**
 * Brings a saved copy of a branch up to date by downloading only what changed: records created/changed since the newest
 * one it holds, plus the (tiny) list of ids that still exist so records deleted elsewhere drop out. No saved copy, one
 * older than two weeks, or a server without these endpoints all fall back to the full download.
 */
export async function syncBranchExpenses(
  scope: AuditExpenseScope,
  saved: { rows: AuditExpense[]; at: number } | null,
): Promise<AuditExpense[]> {
  const since = saved && saved.rows.length > 0 && Date.now() - saved.at <= MAX_SAVED_AGE_MS ? newestChange(saved.rows) : ''
  if (!saved || !since) return loadAuditExpensesStrict(scope)
  try {
    const [changed, ids] = await Promise.all([
      getJson<AuditExpense[]>(listUrl(scope, since), 30000),
      getJson<string[]>(idsUrl(scope), 30000),
    ])
    const byId = new Map(saved.rows.map((r) => [r.id, r]))
    for (const r of changed) byId.set(r.id, r)
    const alive = new Set(ids)
    // A record the server has but neither the saved copy nor the changes carry: do not guess, download in full.
    for (const id of alive) if (!byId.has(id)) return loadAuditExpensesStrict(scope)
    return [...byId.values()].filter((r) => alive.has(r.id))
  } catch (err) {
    // An answer without these endpoints (older server) means a full download; no answer at all is left to the caller.
    if ((err as { status?: number }).status) return loadAuditExpensesStrict(scope)
    throw err
  }
}

export async function upsertAuditExpense(expense: AuditExpense): Promise<AuditExpense> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify(expense)
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  return await res.json()
}

export async function deleteAuditExpense(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` }
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
}

export async function clearAuditExpensesByBranch(branchId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/branch/${branchId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` }
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
}

export async function bulkImportAuditExpenses(expenses: AuditExpense[]): Promise<AuditExpense[]> {
  const res = await fetch(`${BASE_URL}/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify(expenses)
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  return await res.json()
}

export function createExpenseId(): string {
  // Backend now generates UUIDs, but we can provide a temporary one or let it be null for new ones
  // We'll keep it for now as a placeholder for frontend-only state if needed
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
