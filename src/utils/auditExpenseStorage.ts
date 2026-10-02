import type { AuditExpense } from '../types/auditExpense'
import { API_BASE_URL } from './api'
import { readLocalCache, writeLocalCache } from './localDataCache'

const BASE_URL = `${API_BASE_URL}/v1/audit-expenses`

function getToken() {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

/** The branch a list request is for. Without it the server returns every branch the caller may see. */
export type AuditExpenseScope = { branchId?: string; branchName?: string }

function listUrl(scope?: AuditExpenseScope) {
  const params = new URLSearchParams()
  if (scope?.branchId) params.set('branchId', scope.branchId)
  if (scope?.branchName) params.set('branchName', scope.branchName)
  const qs = params.toString()
  return qs ? `${BASE_URL}?${qs}` : BASE_URL
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

// Last-loaded records per branch, shown at once on the next visit while a fresh copy loads behind them. Memory keeps
// every branch opened this session; localStorage keeps only the most recent one (records are too big to keep them all).
const branchExpensesMemory = new Map<string, AuditExpense[]>()
const LAST_BRANCH_EXPENSES_KEY = 'expense-records:v1:last'
const MAX_PERSISTED_CHARS = 2_000_000

export function readCachedBranchExpenses(cacheKey: string): AuditExpense[] | null {
  if (!cacheKey) return null
  const inMemory = branchExpensesMemory.get(cacheKey)
  if (inMemory) return inMemory
  const stored = readLocalCache<{ key: string; rows: AuditExpense[] }>(LAST_BRANCH_EXPENSES_KEY)
  return stored && stored.key === cacheKey && Array.isArray(stored.rows) ? stored.rows : null
}

export function writeCachedBranchExpenses(cacheKey: string, rows: AuditExpense[]): void {
  if (!cacheKey) return
  branchExpensesMemory.set(cacheKey, rows)
  try {
    if (JSON.stringify(rows).length <= MAX_PERSISTED_CHARS) {
      writeLocalCache(LAST_BRANCH_EXPENSES_KEY, { key: cacheKey, rows })
    }
  } catch {
    // not serializable / out of memory — the in-memory copy is enough
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
