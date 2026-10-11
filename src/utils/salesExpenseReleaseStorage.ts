import type { AuditExpenseCategory, MonthlySalesExpenseRelease } from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'

const STORAGE_KEY = 'ashcol_portal_sales_expense_releases'

type ReleaseMap = Record<string, MonthlySalesExpenseRelease>

function storageKey(branchId: string, monthKey: string): string {
  return `${branchId}::${monthKey}`
}

function loadMap(): ReleaseMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ReleaseMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveMap(map: ReleaseMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function loadMonthlySalesRelease(
  branchId: string,
  monthKey: string
): MonthlySalesExpenseRelease | null {
  const map = loadMap()
  return map[storageKey(branchId, monthKey)] ?? null
}

export function saveMonthlySalesRelease(
  branchId: string,
  branchName: string,
  monthKey: string,
  input: {
    totalReleased?: number
    byCategory: Partial<Record<AuditExpenseCategory, number>>
    notes?: string
  }
): MonthlySalesExpenseRelease {
  const map = loadMap()
  const key = storageKey(branchId, monthKey)
  const categorySum = AUDIT_EXPENSE_CATEGORIES.reduce((s, cat) => s + (input.byCategory[cat] ?? 0), 0)
  const totalReleased =
    typeof input.totalReleased === 'number' && input.totalReleased > 0
      ? input.totalReleased
      : categorySum

  const record: MonthlySalesExpenseRelease = {
    branchId,
    branchName,
    monthKey,
    totalReleased,
    byCategory: input.byCategory,
    notes: input.notes ?? map[key]?.notes ?? '',
    updatedAt: new Date().toISOString(),
  }
  map[key] = record
  saveMap(map)
  return record
}
