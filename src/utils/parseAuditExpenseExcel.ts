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
  const errors: string[] = []\
  let skipped = 0
  const now = new Date().toISOString()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    // Build a case-insensitive key map so "DATE", "Date", "date" all resolve
    const lowerRow: Record<string, unknown> = {}
    for (const k of Object.keys(row)) {
      lowerRow[k.toLowerCase().trim().replace(/\s+/g, ' ')] = row[k]
    }

    // Helper to get a cell value by any of the given lowercase aliases
    const get = (...aliases: string[]): unknown => {
      for (const a of aliases) {
        const v = lowerRow[a]
        if (v !== undefined && v !== '') return v
      }
      return ''
    }

    const dateRaw = get('date', 'transaction date', 'expense date')
    const amount  = parseAmount(get('amount', 'amt', 'total', 'value', 'expense amount'))
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

    const description = cellStr(get('description', 'desc', 'particulars', 'details'))
    const company     = cellStr(get('company', 'vendor', 'establishment', 'supplier', 'payee'))
    if (!description && !company) {
      skipped++
      continue
    }

    imported.push({
      id: createExpenseId(),
      branchId: opts.branchId,
      branchName: opts.branchName,
      date: dateStr,
      incurredBy: cellStr(get('incurred by', 'incurred_by', 'employee', 'name', 'paid by')) || 'IMPORT',
      description,
      company,
      receiptNo: cellStr(get('receipt no', 'receipt no.', 'receipt #', 'receipt number', 'or no', 'or #', 'si no', 'invoice')),
      amount,
      expenseCategory: parseCategory(
        cellStr(get('expense category', 'category', 'expense type', 'type'))
      ),
      sourceOfFunds: cellStr(get('source of funds', 'source', 'fund source', 'funding')),
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

  // Read once WITHOUT cellDates so header text cells that live in a date-formatted
  // column are returned as strings, not Date objects.
  const wbRaw  = XLSX.read(buffer, { type: 'array', cellDates: false })
  // Read again WITH cellDates so data cells parse properly as dates.
  const wbDate = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheetName = wbRaw.SheetNames[0]
  if (!sheetName) {
    return { imported: [], skipped: 0, errors: ['Workbook has no sheets.'] }
  }

  const sheetRaw  = wbRaw.Sheets[sheetName]
  const sheetDate = wbDate.Sheets[sheetName]

  // Read all rows as raw 2D array (no header conversion) using the non-date workbook
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheetRaw, { header: 1, defval: '' })
  if (rawRows.length === 0) {
    return { imported: [], skipped: 0, errors: ['No data rows found in the first sheet.'] }
  }

  // Also read date-parsed rows for actual data
  const dateRows = XLSX.utils.sheet_to_json<unknown[]>(sheetDate, { header: 1, defval: '' })

  // Scan up to the first 20 rows to find the header row.
  // We look for ANY row that contains cells matching 'date' AND 'amount' (loose substring check).
  let headerRowIdx = -1

  for (let r = 0; r < Math.min(20, rawRows.length); r++) {
    const row = rawRows[r]
    if (!Array.isArray(row)) continue

    let hasDate = false
    let hasAmount = false

    for (let c = 0; c < row.length; c++) {
      // Safely stringify; skip actual Date objects (they're data cells, not headers)
      const rawVal = row[c]
      if (rawVal instanceof Date) continue
      const cell = String(rawVal).toLowerCase().trim().replace(/\s+/g, ' ')
      if (!cell || cell === '0') continue

      // Loose substring check — handles "DATE", "transaction date", etc.
      if (cell === 'date' || cell.includes('date')) hasDate = true
      if (cell === 'amount' || cell.includes('amount') || cell === 'amt' || cell === 'total') hasAmount = true
    }

    if (hasDate && hasAmount) {
      headerRowIdx = r
      break
    }
  }

  if (headerRowIdx === -1) {
    // Fallback: take the first row that has more than 4 non-empty string cells as the header
    for (let r = 0; r < Math.min(20, rawRows.length); r++) {
      const row = rawRows[r]
      if (!Array.isArray(row)) continue
      const nonEmpty = row.filter((c) => !(c instanceof Date) && String(c).trim() !== '').length
      if (nonEmpty >= 4) {
        headerRowIdx = r
        break
      }
    }
  }

  if (headerRowIdx === -1) {
    return { imported: [], skipped: 0, errors: ['Could not find a valid header row. Make sure your file has DATE and AMOUNT columns.'] }
  }

  // Build object rows from date-parsed sheet using header row from raw sheet
  const headerRow = rawRows[headerRowIdx] as unknown[]
  const objectRows: Record<string, unknown>[] = []

  for (let r = headerRowIdx + 1; r < dateRows.length; r++) {
    const row = dateRows[r]
    if (!Array.isArray(row)) continue

    const obj: Record<string, unknown> = {}
    for (let c = 0; c < Math.max(headerRow.length, row.length); c++) {
      const rawKey = headerRow[c]
      // If header cell is a Date (column with date format), skip it — not a real header
      const key = (rawKey instanceof Date || !rawKey)
        ? `__EMPTY_${c}`
        : String(rawKey).trim() || `__EMPTY_${c}`
      obj[key] = row[c]
    }
    objectRows.push(obj)
  }

  if (objectRows.length === 0) {
    return { imported: [], skipped: 0, errors: ['No data rows found after the header.'] }
  }

  return rowsToAuditExpenses(objectRows, opts)
}
