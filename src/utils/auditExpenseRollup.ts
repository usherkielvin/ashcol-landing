import type { AuditExpense, AuditExpenseCategory, MonthlySalesExpenseRelease } from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import { formatDisplayDate, monthKeyFromDateKey, parseExpenseDateKey } from './auditExpenseDates'

export interface DailyExpenseGroup {
  dateKey: string
  displayDate: string
  expenses: AuditExpense[]
  total: number
  receiptCount: number
}

export interface CategoryTotals {
  category: AuditExpenseCategory
  auditAmount: number
  releasedAmount: number
  variance: number
}

export interface MonthlyReconciliation {
  monthKey: string
  branchId: string
  dailyGroups: DailyExpenseGroup[]
  auditTotal: number
  releasedTotal: number
  variance: number
  receiptCount: number
  dayCount: number
  byCategory: CategoryTotals[]
  matched: boolean
}

export function expensesForBranchMonth(
  expenses: AuditExpense[],
  branchId: string,
  monthKey: string
): AuditExpense[] {
  return expenses.filter((e) => {
    if (e.branchId !== branchId) return false
    const dk = parseExpenseDateKey(e.date, e.createdAt)
    return dk ? monthKeyFromDateKey(dk) === monthKey : false
  })
}

export function groupExpensesByDay(expenses: AuditExpense[]): DailyExpenseGroup[] {
  const map = new Map<string, AuditExpense[]>()
  for (const e of expenses) {
    const dk = parseExpenseDateKey(e.date, e.createdAt)
    if (!dk) continue
    const list = map.get(dk) ?? []
    list.push(e)
    map.set(dk, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, list]) => ({
      dateKey,
      displayDate: formatDisplayDate(dateKey),
      expenses: list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
      total: list.reduce((s, x) => s + (Number.isFinite(x.amount) ? x.amount : 0), 0),
      receiptCount: list.length,
    }))
}

export function buildMonthlyReconciliation(
  expenses: AuditExpense[],
  branchId: string,
  monthKey: string,
  release: MonthlySalesExpenseRelease | null
): MonthlyReconciliation {
  const monthExpenses = expensesForBranchMonth(expenses, branchId, monthKey)
  const dailyGroups = groupExpensesByDay(monthExpenses)
  const auditTotal = monthExpenses.reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0)
  const releasedTotal = release?.totalReleased ?? 0

  const byCategory: CategoryTotals[] = AUDIT_EXPENSE_CATEGORIES.map((category) => {
    const auditAmount = monthExpenses
      .filter((e) => e.expenseCategory === category)
      .reduce((s, e) => s + e.amount, 0)
    const releasedAmount = release?.byCategory?.[category] ?? 0
    return { category, auditAmount, releasedAmount, variance: releasedAmount - auditAmount }
  })

  const variance = releasedTotal - auditTotal
  return {
    monthKey,
    branchId,
    dailyGroups,
    auditTotal,
    releasedTotal,
    variance,
    receiptCount: monthExpenses.length,
    dayCount: dailyGroups.length,
    byCategory,
    matched: Math.abs(variance) <= 0.01,
  }
}
