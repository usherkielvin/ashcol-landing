export type AuditExpenseCategory = string

export interface AuditExpense {
  id: string
  branchId: string
  branchName: string
  date: string
  incurredBy: string
  description: string
  company: string
  receiptNo: string
  amount: number
  expenseCategory: AuditExpenseCategory
  sourceOfFunds: string
  receiptImageUri?: string
  inputBy?: string
  createdBy?: string
  updatedBy?: string
  updateHistory?: Array<{
    action: 'created' | 'updated'
    by: string
    at: string
  }>
  createdAt: string
  updatedAt: string
}

export interface MonthlySalesExpenseRelease {
  branchId: string
  branchName: string
  monthKey: string
  totalReleased: number
  byCategory: Partial<Record<AuditExpenseCategory, number>>
  notes?: string
  updatedAt: string
}

export interface AuditExpenseExcelImportResult {
  imported: AuditExpense[]
  skipped: number
  errors: string[]
}

/** General, company-wide categories — keep this short so members can always find the right one. */
/** General, company-wide categories — keep this short so members can always find the right one. */
export const AUDIT_EXPENSE_CATEGORIES: AuditExpenseCategory[] = [
  'CASH ADVANCE',
  'DELIVERY & FREIGHT',
  'DEPOSIT',
  'FUND TRANSFER',
  'INCENTIVES',
  'INSTALLATION MATERIALS',
  'LOAN PAYMENT',
  'MISCELLANEOUS FEES',
  'MOBILIZATION',
  'OFFICE SUPPLIES & EQUIPMENT',
  'OTHER',
  'PARTS',
  'REFUND / REIMBURSEMENT',
  'RENT',
  'REPAIR & MAINTENANCE',
  'SALARY & WAGES',
  'SERVICE MATERIALS',
  'TAXES & GOVERNMENT FEES',
  'TELECOMMUNICATION',
  'UTILITIES',
]
