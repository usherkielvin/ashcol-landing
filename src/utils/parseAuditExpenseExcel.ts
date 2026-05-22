import * as XLSX from 'xlsx'
import type {
  AuditExpense,
  AuditExpenseCategory,
  AuditExpenseExcelImportResult,
} from '../types/auditExpense'
import { AUDIT_EXPENSE_CATEGORIES } from '../types/auditExpense'
import { monthKeyFromDateKey, parseExpenseDateKey } from './auditExpenseDates'

// ── Helpers ─────────────────────────────────────────────────────────────────

function cellStr(val: unknown): string {
  if (val == null) return ''
  if (val instanceof Date) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${val.getDate()}-${months[val.getMonth()]}-${String(val.getFullYear()).slice(-2)}`
  }
  if (typeof val === 'number' && !Number.isNaN(val)) return String(val)
  return String(val).trim()
}

function parseAmount(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const s = cellStr(val).replace(/[₱phpPHP,\s]/g, '')
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
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${val.getDate()}-${months[val.getMonth()]}-${String(val.getFullYear()).slice(-2)}`
  }
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const utc = new Date((val - 25569) * 86400 * 1000)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${utc.getUTCDate()}-${months[utc.getUTCMonth()]}-${String(utc.getUTCFullYear()).slice(-2)}`
  }
  return cellStr(val)
}

// Normalize a cell value to a plain lowercase string for header matching
function norm(val: unknown): string {
  if (val instanceof Date) return ''            // date-formatted cells are never headers
  return String(val ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// Return true if the string contains any of the keywords
function contains(s: string, ...kws: string[]): boolean {
  return kws.some(k => s.includes(k))
}

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0
  return Math.abs(h).toString(16)
}

function generateDeterministicId(branchId: string, dateStr: string, company: string, amount: number, description: string, occurrence: number = 0): string {
  const payload = `${branchId}|${dateStr}|${company}|${amount}|${description}|${occurrence}`.toLowerCase()
  const hash = hashString(payload)
  // Ensure we don't exceed 36 chars. format: ext_branch_hash
  return `exp_${branchId.substring(0, 8)}_${hash}`.substring(0, 36)
}

// ── Core export ──────────────────────────────────────────────────────────────

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
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })

  // ── Step 1: Pick the right sheet ────────────────────────────────────────
  // Scan every sheet; prefer the one whose header row contains both DATE and AMOUNT
  // (so we skip "Installation Sales Report" cover sheets, etc.)

  let bestSheetName: string | null = null
  let bestGrid: unknown[][] = []
  let headerIdx = -1

  for (const sName of wb.SheetNames) {
    const sSheet = wb.Sheets[sName]
    const sGrid = XLSX.utils.sheet_to_json<unknown[]>(sSheet, { header: 1, defval: null })

    console.log(`[AuditExpense] Scanning sheet "${sName}" (${sGrid.length} rows)`)

    // Find a header row in this sheet
    for (let r = 0; r < Math.min(25, sGrid.length); r++) {
      const row = sGrid[r]
      if (!Array.isArray(row)) continue

      const cells = row.map(norm)
      const hasDate   = cells.some(c => c === 'date' || (c.includes('date') && !c.includes('update') && !c.includes('create') && !c.includes('validated')))
      const hasAmount = cells.some(c => c === 'amount' || c.includes('amount'))

      if (hasDate && hasAmount) {
        console.log(`[AuditExpense] ✅ Found expense header in sheet "${sName}" at row ${r}:`, cells.filter(Boolean).join(' | '))
        bestSheetName = sName
        bestGrid = sGrid
        headerIdx = r
        break
      }
    }

    if (bestSheetName) break   // stop at the first sheet that has expense columns
  }

  // Hard fallback: use first sheet and best-guess header row
  if (!bestSheetName) {
    bestSheetName = wb.SheetNames[0]
    const sSheet = wb.Sheets[bestSheetName]
    bestGrid = XLSX.utils.sheet_to_json<unknown[]>(sSheet, { header: 1, defval: null })
    console.warn('[AuditExpense] No expense sheet found — falling back to sheet 0')
  }

  const grid = bestGrid
  console.log('[AuditExpense] Using sheet:', bestSheetName, '| Total rows:', grid.length)

  for (let r = 0; r < Math.min(25, grid.length); r++) {
    const row = grid[r]
    if (!Array.isArray(row)) continue

    const cells = row.map(norm)
    const hasDate   = cells.some(c => c === 'date' || (c.includes('date') && !c.includes('update') && !c.includes('create')))
    const hasAmount = cells.some(c => contains(c, 'amount', 'amt'))

    console.log(`[AuditExpense] Row ${r}:`, cells.filter(Boolean).join(' | '), '→ hasDate:', hasDate, 'hasAmount:', hasAmount)

    if (hasDate && hasAmount) {
      headerIdx = r
      break
    }
  }

  // Fallback: pick first row with ≥4 non-null string cells
  if (headerIdx === -1) {
    for (let r = 0; r < Math.min(25, grid.length); r++) {
      const row = grid[r]
      if (!Array.isArray(row)) continue
      const nonNull = row.filter(c => c !== null && c !== '' && !(c instanceof Date)).length
      if (nonNull >= 4) {
        headerIdx = r
        console.log('[AuditExpense] Header fallback: using row', r, 'with', nonNull, 'non-null cells')
        break
      }
    }
  }

  if (headerIdx === -1) {
    return { imported: [], skipped: 0, errors: ['Could not find header row (need DATE and AMOUNT columns).'] }
  }

  const headerRow = grid[headerIdx] as unknown[]
  console.log('[AuditExpense] Header row index:', headerIdx, 'values:', headerRow)

  // ── Step 2: Map column names to indices ─────────────────────────────────
  const colIdx: Record<string, number> = {}
  for (let c = 0; c < headerRow.length; c++) {
    const h = norm(headerRow[c])
    if (!h) continue
    // Direct category mapping
    if (h === 'date' || contains(h, 'expense date', 'transaction date')) colIdx.date = c
    else if (contains(h, 'incurred by', 'incurred_by', 'paid by'))        colIdx.incurredBy = c
    else if (contains(h, 'description', 'desc', 'particulars'))           colIdx.description = c
    else if (contains(h, 'company', 'vendor', 'supplier', 'payee'))       colIdx.company = c
    else if (contains(h, 'receipt no', 'or no', 'si no', 'invoice'))      colIdx.receiptNo = c
    else if (h === 'amount' || contains(h, 'expense amount'))             colIdx.amount = c
    else if (contains(h, 'expense category', 'category'))                 colIdx.expenseCategory = c
    else if (contains(h, 'source of funds', 'fund source', 'funding'))    colIdx.sourceOfFunds = c
  }

  console.log('[AuditExpense] Column map:', colIdx)

  if (colIdx.date === undefined || colIdx.amount === undefined) {
    return { imported: [], skipped: 0, errors: [`Header found at row ${headerIdx + 1} but missing DATE (col ${colIdx.date}) or AMOUNT (col ${colIdx.amount}) columns. Headers found: ${headerRow.map(norm).filter(Boolean).join(', ')}`] }
  }

  // ── Step 3: Now re-read the SAME sheet with cellDates for proper date parsing ──
  const wbDate = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetDate = wbDate.Sheets[bestSheetName!]
  const gridDate = XLSX.utils.sheet_to_json<unknown[]>(sheetDate, { header: 1, defval: null })

  // ── Step 4: Parse data rows ─────────────────────────────────────────────
  const imported: AuditExpense[] = []
  const errors: string[] = []
  let skipped = 0
  const now = new Date().toISOString()
  const payloadCounts: Record<string, number> = {}

  for (let r = headerIdx + 1; r < gridDate.length; r++) {
    const row = gridDate[r]
    if (!Array.isArray(row)) continue

    // Skip completely empty rows
    const allEmpty = row.every(c => c === null || c === '')
    if (allEmpty) { continue }

    const dateRaw   = row[colIdx.date]
    const amountRaw = row[colIdx.amount]
    const amount    = parseAmount(amountRaw)
    const dateStr   = excelDateToDisplay(dateRaw)
    const dateKey   = parseExpenseDateKey(dateStr)

    if (!dateStr || amount <= 0) {
      if (!dateStr && amount <= 0) {
        skipped++
        continue
      }
      if (!dateStr) {
        errors.push(`Row ${r + 1}: missing Date (amount is "${amountRaw}")`)
      } else {
        errors.push(`Row ${r + 1}: amount is 0 or missing (raw="${amountRaw}")`)
      }
      skipped++
      continue
    }

    if (opts.filterToMonth === true && dateKey && monthKeyFromDateKey(dateKey) !== opts.monthKey) {
      errors.push(`Row ${r + 1}: date is outside the filtered month (${dateStr})`)
      skipped++
      continue
    }

    let description  = colIdx.description  !== undefined ? cellStr(row[colIdx.description])  : ''
    let company      = colIdx.company       !== undefined ? cellStr(row[colIdx.company])       : ''
    const incurredBy   = colIdx.incurredBy    !== undefined ? cellStr(row[colIdx.incurredBy])    : 'IMPORT'
    const receiptNo    = colIdx.receiptNo     !== undefined ? cellStr(row[colIdx.receiptNo])     : ''
    const rawCategory  = colIdx.expenseCategory !== undefined ? cellStr(row[colIdx.expenseCategory]) : ''
    const sourceOfFunds = colIdx.sourceOfFunds !== undefined ? cellStr(row[colIdx.sourceOfFunds]) : ''

    if (!description && !company) {
      description = 'UNSPECIFIED'
      company = 'UNSPECIFIED'
    }

    const payloadKey = `${opts.branchId}|${dateStr}|${company}|${amount}|${description}`.toLowerCase()
    const occurrence = payloadCounts[payloadKey] || 0
    payloadCounts[payloadKey] = occurrence + 1

    imported.push({
      id: generateDeterministicId(opts.branchId, dateStr, company, amount, description, occurrence),
      branchId: opts.branchId,
      branchName: opts.branchName,
      date: dateStr,
      incurredBy: incurredBy || 'IMPORT',
      description,
      company,
      receiptNo,
      amount,
      expenseCategory: parseCategory(rawCategory),
      sourceOfFunds,
      createdAt: now,
      updatedAt: now,
    })
  }

  console.log('[AuditExpense] Result: imported', imported.length, 'skipped', skipped, 'errors', errors)
  return { imported, skipped, errors }
}

// Keep rowsToAuditExpenses exported for any other callers
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
  const payloadCounts: Record<string, number> = {}

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const lowerRow: Record<string, unknown> = {}
    for (const k of Object.keys(row)) {
      lowerRow[k.toLowerCase().trim().replace(/\s+/g, ' ')] = row[k]
    }
    const get = (...aliases: string[]): unknown => {
      for (const a of aliases) {
        const v = lowerRow[a]
        if (v !== undefined && v !== null && v !== '') return v
      }
      return ''
    }

    const dateRaw = get('date', 'transaction date', 'expense date')
    const amount  = parseAmount(get('amount', 'amt', 'total', 'value', 'expense amount'))
    const dateStr = excelDateToDisplay(dateRaw)
    const dateKey = parseExpenseDateKey(dateStr)

    if (!dateStr && amount <= 0) { skipped++; continue }
    if (opts.filterToMonth === true && dateKey && monthKeyFromDateKey(dateKey) !== opts.monthKey) { skipped++; continue }
    if (amount <= 0) { errors.push(`Row ${i + 2}: invalid amount`); skipped++; continue }

    const description = cellStr(get('description', 'desc', 'particulars', 'details'))
    const company     = cellStr(get('company', 'vendor', 'establishment', 'supplier', 'payee'))
    if (!description && !company) { skipped++; continue }

    const payloadKey = `${opts.branchId}|${dateStr}|${company}|${amount}|${description}`.toLowerCase()
    const occurrence = payloadCounts[payloadKey] || 0
    payloadCounts[payloadKey] = occurrence + 1

    imported.push({
      id: generateDeterministicId(opts.branchId, dateStr, company, amount, description, occurrence),
      branchId: opts.branchId,
      branchName: opts.branchName,
      date: dateStr,
      incurredBy: cellStr(get('incurred by', 'incurred_by', 'employee', 'name', 'paid by')) || 'IMPORT',
      description,
      company,
      receiptNo: cellStr(get('receipt no', 'receipt no.', 'receipt #', 'receipt number', 'or no', 'or #', 'si no', 'invoice')),
      amount,
      expenseCategory: parseCategory(cellStr(get('expense category', 'category', 'expense type', 'type'))),
      sourceOfFunds: cellStr(get('source of funds', 'source', 'fund source', 'funding')),
      createdAt: now,
      updatedAt: now,
    })
  }

  return { imported, skipped, errors }
}
