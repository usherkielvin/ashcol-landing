import type { AuditExpense } from '../types/auditExpense'
import { API_BASE_URL } from './api'

const BASE_URL = `${API_BASE_URL}/v1/audit-expenses`

function getToken() {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

/**
 * Like loadAuditExpenses, but a failure or a server that does not answer within 90 seconds throws instead of looking like
 * "no records". The Expense Records page uses it so it can say so (and never sit on its loading screen forever).
 */
export async function loadAuditExpensesStrict(): Promise<AuditExpense[]> {
  const res = await fetch(BASE_URL, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal: AbortSignal.timeout(90000), // the full list is a big download; give it time, but never wait forever
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function loadAuditExpenses(): Promise<AuditExpense[]> {
  try {
    const res = await fetch(BASE_URL, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    if (!res.ok) return []
    return await res.json()
  } catch (err) {
    console.error('[AuditExpenseStorage] Load error:', err)
    return []
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
