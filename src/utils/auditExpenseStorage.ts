import type { AuditExpense } from '../types/auditExpense'
import { monthKeyFromDateKey, parseExpenseDateKey } from './auditExpenseDates'

const STORAGE_KEY = 'ashcol_portal_audit_expenses'

export function loadAuditExpenses(): AuditExpense[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AuditExpense[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAuditExpenses(expenses: AuditExpense[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses))
}

export function upsertAuditExpense(expense: AuditExpense): AuditExpense[] {
  const all = loadAuditExpenses()
  const idx = all.findIndex((e) => e.id === expense.id)
  const next = [...all]
  if (idx >= 0) next[idx] = expense
  else next.unshift(expense)
  saveAuditExpenses(next)
  return next
}

export function deleteAuditExpense(id: string): AuditExpense[] {
  const next = loadAuditExpenses().filter((e) => e.id !== id)
  saveAuditExpenses(next)
  return next
}

export function bulkImportAuditExpenses(
  incoming: AuditExpense[],
  opts: { branchId: string; monthKey: string; replaceExisting: boolean }
): AuditExpense[] {
  const all = loadAuditExpenses()
  const kept = opts.replaceExisting
    ? all.filter((e) => {
        if (e.branchId !== opts.branchId) return true
        const mk = expenseMonthKey(e)
        return mk !== opts.monthKey
      })
    : all
  const next = [...incoming, ...kept]
  saveAuditExpenses(next)
  return next
}

function expenseMonthKey(e: AuditExpense): string | null {
  const dk = parseExpenseDateKey(e.date, e.createdAt)
  return dk ? monthKeyFromDateKey(dk) : null
}

export function createExpenseId(): string {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
