import * as XLSX from 'xlsx'
import type {
  AuditExpense,
  AuditExpenseCategory,
  AuditExpenseExcelImportResult,
} from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import { monthKeyFromDateKey, parseExpenseDateKey } from './auditExpenseDates'
import { createExpenseId } from './auditExpenseStorage'

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'transaction date', 'expense date'],
  incurredBy: ['incurred by', 'incurred_by', 'employee', 'name', 'paid by'],
  description: ['description', 'desc', 'particulars', 'details'],
  company: ['company', 'vendor', 'establishment', 'supplier', 'payee'],
  receiptNo: ['receipt no', 'receipt no.', 'receipt #', 'receipt number', 'or no', 'or #', 'si no', 'invoice'],
  amount: ['amount', 'total', 'amt', 'value', 'expense amount'],
  expenseCategory: ['expense category', 'category', 'expense type', 'type'],
  sourceOfFunds: ['source of funds', 'source', 'fund source', 'funding'],
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function mapHeaders(row: Record<string, unknown>): Record<string, string> {
  const keys = Object.keys(row)
  const mapped: Record<string, string> = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const match = keys.find((k) => aliases.includes(normalizeHeader(k)))
    if (match) mapped[field] = match
  }
  return mapped
}

function cellStr(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'number' && !Number.isNaN(val)) return String(val)
  return String(val).trim()
}

function parseAmount(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const s = cellStr(val).replace(/[₱php,\s]/gi, '')
  const n = parseFloat(s)
  return Number.isNaN(n) ? 0 : n
}

function parseCategory(raw: string): AuditExpenseCategory {
  const u = raw.trim().toUpperCase()
  const hit = AUDIT_EXPENSE_CATEGORIES.find((c) => c === u || u.includes(c))
  if (hit) return hit
  if (/material|spare/i.test(raw)) return 'SERVICE MATERIALS'
  if (/gas|fuel|mobil|parking|transport/i.test(raw)) return 'MOBILIZATION'
  if (/misc|fee/i.test(raw)) return 'MISCELLANEOUS FEES'
  return 'OTHER'
}

function excelDateToDisplay(val: unknown): string {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${val.getDate()}-${months[val.getMonth()]}-${String(val.getFullYear()).slice(-2)}`
  }
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const utc = new Date((val - 25569) * 86400 * 1000)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${utc.getUTCDate()}-${months[utc.getUTCMonth()]}-${String(utc.getUTCFullYear()).slice(-2)}`
  }
  return cellStr(val)
}

export function rowsToAuditExpenses(
  rows: Record<string, unknown>[],
  opts: {
    branchId: string
    branchName: string
    monthKey: string
    filterToMonth?: boolean
  }
): AuditExpenseExcelImportResult {
  const imported: AuditExpense[] = []
  const errors: string[] = []
  let skipped = 0
  const now = new Date().toISOString()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const headers = mapHeaders(row)
    const dateRaw = row[headers.date ?? ''] ?? row['DATE'] ?? row['Date']
    const amount = parseAmount(row[headers.amount ?? ''] ?? row['AMOUNT'] ?? row['Amount'])
    const dateStr = excelDateToDisplay(dateRaw)
    const dateKey = parseExpenseDateKey(dateStr)

    if (!dateStr && amount <= 0) {
      skipped++
      continue
    }
    if (opts.filterToMonth !== false && dateKey && monthKeyFromDateKey(dateKey) !== opts.monthKey) {
      skipped++
      continue
    }
    if (amount <= 0) {
      errors.push(`Row ${i + 2}: invalid or missing amount`)
      skipped++
      continue
    }

    const description = cellStr(row[headers.description ?? ''] ?? row['DESCRIPTION'] ?? '')
    const company = cellStr(row[headers.company ?? ''] ?? row['COMPANY'] ?? '')
    if (!description && !company) {
      skipped++
      continue
    }

    imported.push({
      id: createExpenseId(),
      branchId: opts.branchId,
      branchName: opts.branchName,
      date: dateStr,
      incurredBy: cellStr(row[headers.incurredBy ?? ''] ?? row['INCURRED BY'] ?? 'IMPORT'),
      description,
      company,
      receiptNo: cellStr(row[headers.receiptNo ?? ''] ?? row['RECEIPT NO'] ?? ''),
      amount,
      expenseCategory: parseCategory(
        cellStr(row[headers.expenseCategory ?? ''] ?? row['EXPENSE CATEGORY'] ?? '')
      ),
      sourceOfFunds: cellStr(row[headers.sourceOfFunds ?? ''] ?? row['SOURCE OF FUNDS'] ?? ''),
      createdAt: now,
      updatedAt: now,
    })
  }

  return { imported, skipped, errors }
}

export async function parseAuditExpenseExcelFile(
  file: File,
  opts: {
    branchId: string
    branchName: string
    monthKey: string
    filterToMonth?: boolean
  }
): Promise<AuditExpenseExcelImportResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { imported: [], skipped: 0, errors: ['Workbook has no sheets.'] }
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (rows.length === 0) {
    return { imported: [], skipped: 0, errors: ['No data rows found in the first sheet.'] }
  }
  return rowsToAuditExpenses(rows, opts)
}
