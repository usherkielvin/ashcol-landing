/**
 * Excel Relay Ticket Extraction
 *
 * Reads relay schedule Excel files and extracts:
 * 1. The schedule date from the header area
 * 2. Customer ticket records with all business rules applied
 *
 * Business rules:
 * - Filters accounting/summary rows
 * - Propagates drivers across vehicle groups
 * - Splits brand/capacity
 * - Maps ticket types and statuses
 * - Cleans installer names
 * - Handles payment fields
 */

import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedRelayTicket {
  customerName: string
  contactPhone: string
  address: string
  district: string
  dealer: string
  dealerBranch: string
  brand: string
  capacity: string
  commitType: string
  negotiator: string
  remarks: string
  status: string
  serviceType: string
  vehicle: string
  driver: string
  installer: string
  modeOfPayment: string
  installationCharges: number
  /** Individual payment lines (for multi-payment scenarios) */
  payments: { mode: string; amount: number }[]
  /** ISO date string from the Excel header — the active schedule/dispatch date */
  scheduleDate: string
  /** ISO date string from the Excel 'DATE RALAYED' column — when relay was received */
  relayedDate: string
  /** Whether this ticket is a reschedule (UPDATE contains "RESCHED") */
  isResched: boolean
}

export interface ExcelExtractionResult {
  tickets: ExtractedRelayTicket[]
  /** The date extracted from the Excel header row */
  scheduleDate: string
  /** Total raw data rows found */
  totalRows: number
  /** Accounting rows that were skipped */
  skippedRows: number
  fileName: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_HEADERS = [
  "COSTUMER'S NAME", "CUSTOMER'S NAME", "DESTINATION",
  "BRAND", "DLR", "UPDATE", "STATUS", "SERVICE", "INSTALLER",
]

const KNOWN_BRANDS = [
  'AMERICAN HOME', 'CONDURA', 'CARRIER', 'DAIKIN', 'EVEREST',
  'FUJIDENZO', 'GREE', 'HAIER', 'HISENSE', 'HITACHI',
  'KOLIN', 'LG', 'MIDEA', 'MIEDA', 'MITSUBISHI', 'PANASONIC',
  'SAMSUNG', 'SHARP', 'TCL', 'TOSHIBA', 'UNION', 'WHIRLPOOL', 'YORK',
]

const BRAND_CORRECTIONS: Record<string, string> = { 'MIEDA': 'MIDEA' }

const ACCOUNTING_KEYWORDS = [
  'FOR COLLECTION', 'CASH', 'CHECK PAYMENT', 'BANK TRANSFER',
  'GCASH', 'TOTAL', 'SUMMARY', 'SUB-TOTAL', 'SUBTOTAL',
]

const TICKET_TYPE_MAP: Record<string, string> = {
  'DONE INSTALL': 'DONE_INSTALLED', 'DONE INSTALLED': 'DONE_INSTALLED',
  'DONE SURVEY': 'DONE_SURVEY', 'DONE SERVICE': 'DONE_SERVICE',
  'SURVEY & INSTALL': 'S/I', 'S/I': 'S/I',
  'INSTALL': 'INSTALL', 'SURVEY': 'SURVEY',
  'CLEANING': 'CLEANING', 'CHECKUP': 'CHECKUP',
  'BACKJOB': 'BACKJOB', 'SERVICE': 'SERVICE',
  'RESCHED': 'RESCHED', 'RESCHEDULE': 'RESCHED',
  'CONTINUATION': 'CONTINUATION', 'DISMANTLE': 'DISMANTLE',
}

const PAYMENT_MAP: Record<string, string> = {
  'NO PAYMENT': 'NO_PAYMENT', 'FREE': 'NO_PAYMENT', 'WW': 'NO_PAYMENT',
  'N/A': 'NO_PAYMENT', '': 'NO_PAYMENT',
  'CASH': 'CASH', 'BANK TRANSFER': 'BANK TRANSFER',
  'GCASH': 'GCASH', 'CHECK': 'CHEQUE', 'CHEQUE': 'CHEQUE',
  'CHECKE': 'CHEQUE', 'FOR COLLECTION': 'FOR COLLECTION',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectHeaderRow(aoa: unknown[][]): number {
  const maxScan = Math.min(20, aoa.length)
  for (let i = 0; i < maxScan; i++) {
    const row = aoa[i]
    if (!row) continue
    const normalized = (row as string[]).map(c => String(c ?? '').trim().toUpperCase())
    const cnt = KNOWN_HEADERS.filter(h => normalized.some(c => c === h.toUpperCase())).length
    if (cnt >= 3) return i
  }
  return 0
}

function extractDateFromHeader(aoa: unknown[][]): string {
  // The date is usually in the first few rows before the column headers
  // Pattern: row has "DATE" label and a date value next to it
  for (let i = 0; i < Math.min(10, aoa.length); i++) {
    const row = aoa[i] as string[]
    if (!row) continue
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? '').trim().toUpperCase()
      if (cell === 'DATE' && row[j + 1]) {
        const dateVal = String(row[j + 1]).trim()
        // Try to parse the date
        const parsed = parseDateValue(dateVal)
        if (parsed) return parsed
      }
      // Also check if a cell itself looks like a date (e.g. "10-Jan-26", "January 10, 2026")
      const cellStr = String(row[j] ?? '').trim()
      if (cellStr && /\d/.test(cellStr) && /[a-zA-Z]/.test(cellStr)) {
        const parsed = parseDateValue(cellStr)
        if (parsed) return parsed
      }
    }
  }
  return ''
}

function parseDateValue(val: string): string {
  if (!val) return ''

  // Clean up: remove trailing text like "THRU GC", "THRU MESSENGER", "THRU GMAIL", etc.
  const cleaned = val.replace(/\s+THRU\s+.*/i, '').trim()

  // Try "10-Jan-26" or "10-Jan-2026" format (DD-Mon-YY) first — most common in these files
  const match = cleaned.match(/^(\d{1,2})-(\w{3})-(\d{2,4})$/)
  if (match) {
    const day = match[1].padStart(2, '0')
    const monthStr = match[2]
    const yearRaw = match[3]
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw
    const months: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    }
    const month = months[monthStr.charAt(0).toUpperCase() + monthStr.slice(1).toLowerCase()]
    if (month) return `${year}-${month}-${day}`
  }

  // Try "JANUARY 8, 2026" or "DECEMBER 29, 2025" (full month name)
  const fullMonthMatch = cleaned.match(/^(\w+)\s+(\d{1,2}),?\s*(\d{4})$/i)
  if (fullMonthMatch) {
    const monthNames: Record<string, string> = {
      JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04', MAY: '05', JUNE: '06',
      JULY: '07', AUGUST: '08', SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12',
      JAN: '01', FEB: '02', MAR: '03', APR: '04', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    }
    const monthKey = fullMonthMatch[1].toUpperCase()
    const month = monthNames[monthKey]
    if (month) {
      const day = fullMonthMatch[2].padStart(2, '0')
      const year = fullMonthMatch[3]
      return `${year}-${month}-${day}`
    }
  }
  // Try native Date parsing — CRITICAL: parse in local time, not UTC
  // Avoid Date constructor on string without time component to prevent timezone shift
  // e.g., new Date('2026-01-16') may be treated as UTC, causing -2 day shift in UTC+8 timezones
  const d = new Date(val)
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
    // Use UTC getters to avoid local timezone shift when parsing ambiguous date strings
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return ''
}

function findValue(record: Record<string, string>, ...candidates: string[]): string {
  for (const candidate of candidates) {
    if (candidate in record) return String(record[candidate] ?? '').trim()
    const upper = candidate.toUpperCase()
    for (const key of Object.keys(record)) {
      if (key.toUpperCase() === upper) return String(record[key] ?? '').trim()
    }
  }
  return ''
}

function isAccountingRow(record: Record<string, string>): boolean {
  const name = findValue(record, "COSTUMER'S NAME", "CUSTOMER'S NAME")
  const dest = findValue(record, 'DESTINATION', 'ADDRESS')
  if (!name && !dest) return true
  const update = findValue(record, 'UPDATE').toUpperCase()
  if (!name && !dest && ACCOUNTING_KEYWORDS.some(kw => update.startsWith(kw))) return true
  return false
}

function splitBrandCapacity(brandField: string): { brand: string; capacity: string } {
  const val = brandField.replace(/\s+/g, ' ').trim()
  if (!val || val.toUpperCase() === 'N/A' || val === '-') return { brand: '', capacity: '' }
  const upper = val.toUpperCase()
  const sorted = [...KNOWN_BRANDS].sort((a, b) => b.length - a.length)
  for (const kb of sorted) {
    if (upper.startsWith(kb)) {
      let brand = kb
      if (BRAND_CORRECTIONS[brand]) brand = BRAND_CORRECTIONS[brand]
      return { brand, capacity: val.substring(kb.length).trim() }
    }
  }
  const parts = val.split(/\s+/)
  if (parts.length > 1 && !/\d/.test(parts[0])) {
    let brand = parts[0].toUpperCase()
    if (BRAND_CORRECTIONS[brand]) brand = BRAND_CORRECTIONS[brand]
    return { brand, capacity: parts.slice(1).join(' ') }
  }
  return { brand: val.toUpperCase(), capacity: '' }
}

/**
 * Known valid vehicle/service codes used by the branch.
 * Fuzzy matching normalizes common typos against this list before giving up.
 * Add new codes here as the fleet grows.
 */
const KNOWN_VEHICLE_CODES = ['FB19', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']

/**
 * Normalize a raw vehicle/service code extracted from the Excel SERVICE column.
 *
 * Handles:
 *  - Exact matches (FB19, T2)
 *  - Strip trailing "-N" sequence numbers: "FB19-1" → "FB19", "T2-3" → "T2"
 *  - Common typos:
 *      "F19" → "FB19"  (missing the 'B')
 *      "T"   → "T2"    (single letter, no digit)
 *      "T-1" → "T2"    (stripped sequence leaves bare "T")
 *
 * Strategy:
 *  1. Strip a trailing dash+digits sequence number if present.
 *  2. Check exact match against KNOWN_VEHICLE_CODES.
 *  3. Try simple suffix-based fuzzy corrections.
 *  4. Return the candidate as-is if nothing matches (best-effort).
 */
function cleanDriverName(raw: string): string {
  if (!raw) return ''
  let d = raw.toUpperCase().trim()
  // Remove "ON CALL", "ON-CALL", "ONCALL" prefix
  d = d.replace(/^(?:ON\s*-?\s*CALL|ONCALL)\s+/i, '').trim()
  return d
}

function normalizeVehicleCode(raw: string): string {
  if (!raw) return ''
  // 1. Remove all spaces and inner dashes between letters and digits e.g. "FB - 19" -> "FB19", "T 3" -> "T3", "FB-19" -> "FB19"
  let compact = raw.toUpperCase().replace(/\s+/g, '').trim()

  // 2. Strip a trailing sequence number e.g. "FB19-1" -> "FB19", "FB19-2" -> "FB19", "T3-1" -> "T3", "T2-1" -> "T2"
  compact = compact.replace(/-\d+$/, '').trim()

  // 3. Normalize "FB-19" or "FB19"
  if (/^FB-?19$/.test(compact)) return 'FB19'

  // If bare "FB" without number, treat as FB19 (default FB vehicle)
  if (compact === 'FB' || compact === 'FB-') return 'FB19'

  // Check exact match in known list
  if (KNOWN_VEHICLE_CODES.includes(compact)) return compact

  // Handle "F19" -> "FB19"
  if (/^F\d+$/.test(compact)) {
    const candidate = 'FB' + compact.slice(1)
    if (KNOWN_VEHICLE_CODES.includes(candidate)) return candidate
    return candidate
  }

  // Handle "T-1", "T-2", etc. where single T was left
  if (compact === 'T') return 'T2'

  // Handle "T-3" -> "T3", "T-2" -> "T2", "T-4" -> "T4"
  if (/^T-\d+$/.test(compact)) {
    return compact.replace('-', '')
  }

  return compact
}

/**
 * Parse the SERVICE column value into a vehicle code and driver name.
 *
 * Supported formats:
 *  "FB - 19 (JOSHUA)"     → vehicle: FB19, driver: JOSHUA
 *  "FB19 - 2"             → vehicle: FB19, driver: ''
 *  "T3 - 1(ANGELO)"       → vehicle: T3,   driver: ANGELO
 *  "T 3 - 2"              → vehicle: T3,   driver: ''
 *  "T2 - 1 ( ON CALL RONNIE)" → vehicle: T2, driver: RONNIE
 */
function parseService(service: string): { vehicle: string; driver: string } {
  const svc = service.trim()
  if (!svc) return { vehicle: '', driver: '' }

  // Extract parenthesised driver name first: "FB - 19 (JOSHUA)" → driver = "JOSHUA"
  // or "T2 - 1 ( ON CALL RONNIE)" → driver = "RONNIE"
  const driverMatch = svc.match(/\(([^)]+)\)/i)
  const rawDriver = driverMatch ? driverMatch[1].trim() : ''
  const driver = cleanDriverName(rawDriver)

  // Strip driver parenthesis
  const withoutParens = svc.replace(/\([^)]*\)/g, '').trim()

  const vehicle = normalizeVehicleCode(withoutParens)
  return { vehicle, driver }
}

/**
 * Intelligent status/remarks detection.
 *
 * Priority order (highest wins):
 *  1. Cancellation signals: "C/O", "CANCELLED", "CANCEL"
 *  2. Explicit completion: INSTALLED, DONE SERVICE, DONE SURVEY, etc.
 *  3. Dismantle: "DISMANTLE" keyword anywhere in remarks/status
 *  4. Reschedule: "RESCHED", "MAY EMERGENCY", "NO CONFIRMATION", etc.
 *  5. Continuation: "CONT", "CONTINUATION", "FOR DAY", "BABALIKAN", "ONGOING"
 *  6. Status-column fallback
 *  7. Default: S/I (installation)
 */
function mapTicketType(update: string, status: string): { serviceType: string; ticketStatus: string } {
  const up = update.toUpperCase().replace(/\s+/g, ' ').trim()
  const st = status.toUpperCase().replace(/\s+/g, ' ').trim()

  // ── 1. Cancellation detection ───────────────────────────────────────────────
  // "C/O" = Cancelled Out; also "C/O ASHVAL", "C/O CUSTOMER", etc.
  // Anchored to avoid false positives: must be a standalone token or at word boundary.
  if (/\bC\/O\b/.test(up) || up.startsWith('C/O') || up.includes(' C/O')
      || up.includes('CANCEL')) {
    return { serviceType: 'CANCELLED', ticketStatus: 'Cancelled' }
  }

  // ── 2. Completion signals ───────────────────────────────────────────────────
  if (up.includes('INSTALLED') || up.includes('TAPOS NA'))
    return { serviceType: 'DONE_INSTALLED', ticketStatus: 'Closing' }
  if (up.includes('DONE SERVICE'))
    return { serviceType: 'DONE_SERVICE', ticketStatus: 'Closing' }
  if (up.includes('SURVEY W/') || up.includes('SURVEY ONLY') || up.includes('SURVEY W/ OUT'))
    return { serviceType: 'DONE_SURVEY', ticketStatus: 'Closing' }
  if (up.includes('DONE'))
    return { serviceType: 'DONE_SERVICE', ticketStatus: 'Closing' }

  // ── 3. Dismantle detection ──────────────────────────────────────────────────
  // Explicit DISMANTLE keyword takes priority over other status signals
  if (up.includes('DISMANTLE') || st.includes('DISMANTLE'))
    return { serviceType: 'DISMANTLE', ticketStatus: 'Pending' }

  // ── 4. Reschedule detection ─────────────────────────────────────────────────
  if (up.includes('RESCHED') || up.includes('RESCHEDULE'))
    return { serviceType: 'RESCHED', ticketStatus: 'Pending' }
  // Filipino/informal reschedule signals
  if (up.includes('MAY EMERGENCY') || up.includes('EMERGENCY PO')
      || up.includes('NO CONFIRMATION') || up.includes('NO RESPONSE')
      || up.includes('NO ANSWER') || up.includes('WALA CONFIRM')
      || up.includes('HINDI NAKA') || up.includes('DI NAKA'))
    return { serviceType: 'RESCHED', ticketStatus: 'Pending' }

  // ── 5. Continuation detection ───────────────────────────────────────────────
  // "CONT" alone or as word prefix (not "CONTACT", "CONTRACT")
  if (/\bCONT\b/.test(up) || up.includes('CONTINUATION'))
    return { serviceType: 'CONTINUATION', ticketStatus: 'Pending' }
  if (up.includes('FOR DAY') || up.includes('BABALIKAN')
      || up.includes('ON- GOING') || up.includes('ON-GOING') || up.includes('ONGOING'))
    return { serviceType: 'CONTINUATION', ticketStatus: 'Pending' }

  // ── 6. Status-column fallback ───────────────────────────────────────────────
  if (st.includes('BACKJOB')) return { serviceType: 'BACKJOB', ticketStatus: 'Pending' }
  if (st === 'SURVEY' || st.startsWith('SURVEY')) return { serviceType: 'SURVEY', ticketStatus: 'Pending' }
  if (st === 'S/I') return { serviceType: 'S/I', ticketStatus: 'Pending' }
  if (st.includes('CHECK UP') || st.includes('CHECKUP')) return { serviceType: 'CHECKUP', ticketStatus: 'Pending' }
  if (st.includes('DISMANTLE')) return { serviceType: 'DISMANTLE', ticketStatus: 'Pending' }
  if (st.includes('RESCHED') || st.includes('RESCHEDULE')) return { serviceType: 'RESCHED', ticketStatus: 'Pending' }
  if (/\bCONT\b/.test(st) || st.includes('CONTINUATION')) return { serviceType: 'CONTINUATION', ticketStatus: 'Pending' }
  if (st.includes('CANCEL') || /\bC\/O\b/.test(st)) return { serviceType: 'CANCELLED', ticketStatus: 'Cancelled' }

  // Mapped types from both columns
  const mapped = TICKET_TYPE_MAP[up] || TICKET_TYPE_MAP[st]
  if (mapped) return { serviceType: mapped, ticketStatus: mapped.startsWith('DONE') ? 'Closing' : 'Pending' }

  // ── 7. Default ───────────────────────────────────────────────────────────────
  return { serviceType: 'S/I', ticketStatus: 'Pending' }
}

function cleanInstaller(val: string): string {
  return val.replace(/\s*-\s*\d+\s*$/, '').trim()
}

/** Extract known payment mode from a string that may contain extra text */
function extractKnownPaymentMode(raw: string): string {
  const upper = raw.toUpperCase().trim()
  // Check exact matches first
  if (PAYMENT_MAP[upper]) return PAYMENT_MAP[upper]
  // Check if string starts with or contains a known mode (longest first)
  const knownModes = ['FOR COLLECTION', 'BANK TRANSFER', 'CHECK PAYMENT', 'GCASH', 'CHEQUE', 'CHECK', 'CASH']
  for (const mode of knownModes) {
    if (upper.includes(mode)) return PAYMENT_MAP[mode] || mode
  }
  return upper || 'NO_PAYMENT'
}

function parseChargeAmount(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/[^\d.,]/g, ' ').trim()
  const match = cleaned.match(/[\d,]+(?:\.\d+)?/)
  if (match) {
    const num = parseFloat(match[0].replace(/,/g, ''))
    return isNaN(num) ? 0 : num
  }
  return 0
}

function mapPayment(mode: string, charges: string): { modeOfPayment: string; amount: number; payments: { mode: string; amount: number }[] } {
  const mop = mode.toUpperCase().trim()
  const ch = charges.toUpperCase().trim()

  if (ch === '' || ch === 'FREE' || ch === 'WW' || ch === '0' || ch === '-' || ch === 'N/A') {
    return { modeOfPayment: 'NO_PAYMENT', amount: 0, payments: [{ mode: 'NO_PAYMENT', amount: 0 }] }
  }

  // If the mode column was empty or unknown, check if the charges column itself contains the payment mode
  // e.g. "FOR COLLECTION 156,500" or "CASH 1,500"
  const embeddedModeInCharges = extractKnownPaymentMode(charges)
  const defaultMode = (mop && mop !== 'NO_PAYMENT' && mop !== 'NO PAYMENT')
    ? (PAYMENT_MAP[mop] || mop)
    : (embeddedModeInCharges !== 'NO_PAYMENT' ? embeddedModeInCharges : 'NO_PAYMENT')

  // Handle multiple payments in one cell (separated by newlines, multiple spaces, or /)
  const chargeLines = charges.split(/[\n\r]|\s{2,}/).map(p => p.trim()).filter(Boolean)
  const modeLines = mode.split(/[\n\r]|\s{2,}/).map(p => p.trim()).filter(Boolean)

  const payments: { mode: string; amount: number }[] = []
  let totalAmount = 0
  const modes: string[] = []

  for (let i = 0; i < Math.max(chargeLines.length, modeLines.length); i++) {
    const chargeStr = chargeLines[i] || ''
    const amt = parseChargeAmount(chargeStr)
    totalAmount += amt

    const lineMode = (modeLines[i] || modeLines[0] || defaultMode || '').toUpperCase().trim()
    const mapped = extractKnownPaymentMode(lineMode) !== 'NO_PAYMENT'
      ? extractKnownPaymentMode(lineMode)
      : extractKnownPaymentMode(chargeStr)
    if (mapped && mapped !== 'NO_PAYMENT' && !modes.includes(mapped)) {
      modes.push(mapped)
    }
    if (amt > 0 || mapped) {
      payments.push({ mode: (mapped && mapped !== 'NO_PAYMENT' ? mapped : defaultMode) || 'NO_PAYMENT', amount: amt })
    }
  }

  // If no valid charges parsed from lines, try whole string parse
  if (totalAmount === 0) {
    totalAmount = parseChargeAmount(charges)
  }

  if (payments.length === 0) {
    const singleMode = (modes[0] || defaultMode || 'NO_PAYMENT')
    payments.push({ mode: singleMode, amount: totalAmount })
  }

  const finalMode = modes.length > 0 ? modes.join(' / ') : defaultMode

  return { modeOfPayment: finalMode, amount: totalAmount, payments }
}

function splitDealer(dlr: string): { dealer: string; branch: string } {
  const val = dlr.replace(/\s+/g, ' ').trim()
  if (!val) return { dealer: '', branch: '' }
  const parts = val.split(/\s{2,}/)
  const dealer = parts[0]?.trim() || val
  const branch = parts.length >= 2 ? parts[1].trim() : val
  return { dealer, branch }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function extractRelayTicketsFromExcel(file: File): Promise<ExcelExtractionResult> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)
  const workbook = XLSX.read(data, { type: 'array' })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('No sheets found in the Excel file.')
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) throw new Error('Sheet is empty.')

  const aoa = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '', raw: false })
  if (aoa.length < 2) throw new Error('Not enough rows.')

  // 1. Extract date from header area
  const scheduleDate = extractDateFromHeader(aoa)

  // 2. Detect header row
  const headerRowIndex = detectHeaderRow(aoa)
  const rawHeaders = (aoa[headerRowIndex] as string[]).map(h => String(h ?? '').trim().replace(/\s+/g, ' '))

  // 3. Build row records
  const dataStartIndex = headerRowIndex + 1
  const records: Record<string, string>[] = []

  for (let i = dataStartIndex; i < aoa.length; i++) {
    const rowArray = aoa[i] as string[]
    if (!rowArray) continue
    const record: Record<string, string> = {}
    for (let col = 0; col < rawHeaders.length; col++) {
      if (rawHeaders[col]) record[rawHeaders[col]] = String(rowArray[col] ?? '').trim()
    }
    const hasData = Object.values(record).some(v => v && v !== '-' && v !== 'N/A')
    if (hasData) records.push(record)
  }

  // 4. Cut off at the first accounting/empty row — everything after the gap is excluded
  const customerRecords: Record<string, string>[] = []
  for (const rec of records) {
    if (isAccountingRow(rec)) break // Stop at the first non-customer row
    customerRecords.push(rec)
  }
  const skippedRows = records.length - customerRecords.length

  // 5. Build vehicle and driver sequence with section propagation
  // In Excel files, vehicles and drivers are color-coded in contiguous blocks.
  // The first row of each block has the driver (e.g. "FB - 19 (JOSHUA)", "T3 - 1(ANGELO)", "T2 - 1( ON CALL RONNIE)"),
  // and subsequent rows in that block might have vehicle only (e.g. "FB19 - 2", "T3 - 2", "T2 - 2") or even be blank.
  const driverMap: Record<string, string> = {}
  for (const rec of customerRecords) {
    const svc = findValue(rec, 'SERVICE')
    if (!svc) continue
    const { vehicle, driver } = parseService(svc)
    if (vehicle && driver) {
      driverMap[vehicle] = driver
    }
  }

  // 6. Extract tickets (second pass with forward-fill tracking)
  const tickets: ExtractedRelayTicket[] = []
  let currentBlockVehicle = ''
  let currentBlockDriver = ''

  for (const rec of customerRecords) {
    const { brand, capacity } = splitBrandCapacity(findValue(rec, 'BRAND'))
    const updateField = findValue(rec, 'UPDATE')
    const statusField = findValue(rec, 'STATUS')
    const { serviceType } = mapTicketType(updateField, statusField)
    const svcField = findValue(rec, 'SERVICE')
    const { vehicle: parsedVehicle, driver: parsedDriver } = parseService(svcField)

    // Update active block context if a new vehicle or driver is encountered
    if (parsedVehicle) {
      currentBlockVehicle = parsedVehicle
    }
    if (parsedDriver) {
      currentBlockDriver = parsedDriver
    } else if (parsedVehicle && driverMap[parsedVehicle]) {
      currentBlockDriver = driverMap[parsedVehicle]
    }

    const vehicle = parsedVehicle || currentBlockVehicle || ''
    const driver = parsedDriver || (vehicle ? (driverMap[vehicle] || currentBlockDriver || '') : currentBlockDriver) || ''
    const mopField = findValue(rec, 'MODE OF PAYMENT')
    const chargesField = findValue(rec, 'INSTALLATION CHARGES')
    const { modeOfPayment, amount, payments } = mapPayment(mopField, chargesField)
    const dlrField = findValue(rec, 'DLR')
    const { dealer, branch } = splitDealer(dlrField)

    // Extract relayed date from the row's DATE RALAYED column
    const rawRelayedDate = findValue(rec, 'DATE RALAYED', 'DATE RELAYED', 'RELAYED DATE')
    const relayedDate = rawRelayedDate ? parseDateValue(rawRelayedDate) : ''

    // Detect reschedule: match all the same signals as mapTicketType priority #4
    const upForResched = updateField.toUpperCase()
    const isResched = upForResched.includes('RESCHED') || upForResched.includes('RESCHEDULE')
      || upForResched.includes('MAY EMERGENCY') || upForResched.includes('EMERGENCY PO')
      || upForResched.includes('NO CONFIRMATION') || upForResched.includes('NO RESPONSE')
      || upForResched.includes('NO ANSWER') || upForResched.includes('WALA CONFIRM')
      || upForResched.includes('HINDI NAKA') || upForResched.includes('DI NAKA')

    tickets.push({
      customerName: findValue(rec, "COSTUMER'S NAME", "CUSTOMER'S NAME"),
      contactPhone: findValue(rec, 'CONTACT NO.', 'CONTACT NO', 'CONTACT NUMBER'),
      address: findValue(rec, 'DESTINATION', 'ADDRESS'),
      district: findValue(rec, 'DISTRICT'),
      dealer,
      dealerBranch: branch,
      brand,
      capacity,
      commitType: findValue(rec, 'COMMIT', 'COMMIT / PROMO'),
      negotiator: findValue(rec, 'NEGOTIATOR'),
      remarks: updateField,
      status: serviceType,
      serviceType,
      vehicle,
      driver,
      installer: cleanInstaller(findValue(rec, 'INSTALLER')),
      modeOfPayment,
      installationCharges: amount,
      payments,
      scheduleDate,
      relayedDate,
      isResched,
    })
  }

  // 7. Merge continuation rows — only merge if customer name is EMPTY (accounting/extra payment row)
  // Avoid merging legitimate separate tickets for the same customer with multiple payments
  const mergedTickets: ExtractedRelayTicket[] = []
  for (const ticket of tickets) {
    const prevTicket = mergedTickets.length > 0 ? mergedTickets[mergedTickets.length - 1] : null
    // ONLY treat as continuation if NO customer name (empty row = extra payment line)
    const isContinuation = !ticket.customerName && prevTicket

    if (isContinuation && prevTicket) {
      // Continuation row — add payment to previous ticket
      prevTicket.installationCharges += ticket.installationCharges
      // Merge payments array
      prevTicket.payments = [...prevTicket.payments, ...ticket.payments.filter(p => p.amount > 0)]
      if (ticket.modeOfPayment && ticket.modeOfPayment !== 'NO_PAYMENT') {
        if (prevTicket.modeOfPayment && prevTicket.modeOfPayment !== 'NO_PAYMENT' && prevTicket.modeOfPayment !== ticket.modeOfPayment) {
          prevTicket.modeOfPayment = `${prevTicket.modeOfPayment} / ${ticket.modeOfPayment}`
        } else if (!prevTicket.modeOfPayment || prevTicket.modeOfPayment === 'NO_PAYMENT') {
          prevTicket.modeOfPayment = ticket.modeOfPayment
        }
      }
      // Also merge remarks if present
      if (ticket.remarks && ticket.remarks !== prevTicket.remarks) {
        prevTicket.remarks = prevTicket.remarks ? `${prevTicket.remarks} | ${ticket.remarks}` : ticket.remarks
      }
    } else {
      mergedTickets.push({ ...ticket })
    }
  }

  return {
    tickets: mergedTickets,
    scheduleDate,
    totalRows: records.length,
    skippedRows,
    fileName: file.name,
  }
}
