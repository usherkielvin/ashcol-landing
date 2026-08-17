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
  // Try native Date parsing — use local date parts (NOT toISOString which is UTC)
  const d = new Date(val)
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
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

function parseService(service: string): { vehicle: string; driver: string } {
  const svc = service.trim()
  if (!svc) return { vehicle: '', driver: '' }
  const upper = svc.toUpperCase()
  if (upper.includes('FB19')) {
    const m = svc.match(/\(([^)]+)\)/i)
    return { vehicle: 'FB19', driver: m ? m[1].trim().toUpperCase() : '' }
  }
  const tMatch = upper.match(/^(T\d+)/i)
  if (tMatch) {
    const vehicle = tMatch[1].toUpperCase()
    const m = svc.match(/\(([^)]+)\)/i)
    return { vehicle, driver: m ? m[1].trim().toUpperCase() : '' }
  }
  return { vehicle: svc.toUpperCase(), driver: '' }
}

function mapTicketType(update: string, status: string): { serviceType: string; ticketStatus: string } {
  const up = update.toUpperCase().replace(/\s+/g, ' ').trim()
  const st = status.toUpperCase().replace(/\s+/g, ' ').trim()

  if (up.includes('INSTALLED') || up.includes('TAPOS NA'))
    return { serviceType: 'DONE_INSTALLED', ticketStatus: 'Closing' }
  if (up.includes('DONE SERVICE'))
    return { serviceType: 'DONE_SERVICE', ticketStatus: 'Closing' }
  if (up.includes('SURVEY W/') || up.includes('SURVEY ONLY') || up.includes('SURVEY W/ OUT'))
    return { serviceType: 'DONE_SURVEY', ticketStatus: 'Closing' }
  if (up.includes('RESCHED'))
    return { serviceType: 'RESCHED', ticketStatus: 'Pending' }
  if (up.includes('NO CONFIRMATION') || up.includes('NO RESPONSE') || up.includes('NO ANSWER'))
    return { serviceType: 'RESCHED', ticketStatus: 'Pending' }
  if (up.includes('FOR DAY') || up.includes('BABALIKAN') || up.includes('ON- GOING') || up.includes('ON-GOING') || up.includes('ONGOING'))
    return { serviceType: 'CONTINUATION', ticketStatus: 'Pending' }
  if (up.includes('DONE'))
    return { serviceType: 'DONE_SERVICE', ticketStatus: 'Closing' }

  if (st.includes('BACKJOB')) return { serviceType: 'BACKJOB', ticketStatus: 'Pending' }
  if (st === 'SURVEY' || st.startsWith('SURVEY')) return { serviceType: 'SURVEY', ticketStatus: 'Pending' }
  if (st === 'S/I') return { serviceType: 'S/I', ticketStatus: 'Pending' }
  if (st.includes('CHECK UP')) return { serviceType: 'CHECKUP', ticketStatus: 'Pending' }

  // Fallback
  const mapped = TICKET_TYPE_MAP[up] || TICKET_TYPE_MAP[st]
  if (mapped) return { serviceType: mapped, ticketStatus: mapped.startsWith('DONE') ? 'Closing' : 'Pending' }

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

function mapPayment(mode: string, charges: string): { modeOfPayment: string; amount: number; payments: { mode: string; amount: number }[] } {
  const mop = mode.toUpperCase().trim()
  const ch = charges.toUpperCase().trim()

  if (ch === '' || ch === 'FREE' || ch === 'WW' || ch === '0' || ch === '-' || ch === 'N/A') {
    return { modeOfPayment: 'NO_PAYMENT', amount: 0, payments: [{ mode: 'NO_PAYMENT', amount: 0 }] }
  }

  // Handle multiple payments in one cell (separated by newlines, multiple spaces, or /)
  const chargeLines = charges.split(/[\n\r]|\s{2,}/).map(p => p.trim()).filter(Boolean)
  const modeLines = mode.split(/[\n\r]|\s{2,}/).map(p => p.trim()).filter(Boolean)

  const payments: { mode: string; amount: number }[] = []
  let totalAmount = 0
  const modes: string[] = []

  for (let i = 0; i < Math.max(chargeLines.length, modeLines.length); i++) {
    const chargeStr = chargeLines[i] || ''
    const num = parseFloat(chargeStr.replace(/,/g, ''))
    const amt = isNaN(num) ? 0 : num
    totalAmount += amt

    const lineMode = (modeLines[i] || modeLines[0] || mop || '').toUpperCase().trim()
    const mapped = extractKnownPaymentMode(lineMode)
    if (mapped && mapped !== 'NO_PAYMENT' && !modes.includes(mapped)) {
      modes.push(mapped)
    }
    if (amt > 0 || mapped) {
      payments.push({ mode: mapped || 'NO_PAYMENT', amount: amt })
    }
  }

  // If no valid charges parsed, try single parse
  if (totalAmount === 0) {
    const num = parseFloat(charges.replace(/,/g, ''))
    if (!isNaN(num)) totalAmount = num
  }

  if (payments.length === 0) {
    const singleMode = PAYMENT_MAP[mop] || mop || 'NO_PAYMENT'
    payments.push({ mode: singleMode, amount: totalAmount })
  }

  const finalMode = modes.length > 0 ? modes.join(' / ') : extractKnownPaymentMode(mop)

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

  // 5. Build driver map (first pass)
  const driverMap: Record<string, string> = {}
  for (const rec of customerRecords) {
    const svc = findValue(rec, 'SERVICE')
    if (!svc) continue
    const { vehicle, driver } = parseService(svc)
    if (vehicle && driver) driverMap[vehicle] = driver
  }

  // 6. Extract tickets (second pass)
  const tickets: ExtractedRelayTicket[] = []
  for (const rec of customerRecords) {
    const { brand, capacity } = splitBrandCapacity(findValue(rec, 'BRAND'))
    const updateField = findValue(rec, 'UPDATE')
    const statusField = findValue(rec, 'STATUS')
    const { serviceType } = mapTicketType(updateField, statusField)
    const svcField = findValue(rec, 'SERVICE')
    const { vehicle } = parseService(svcField)
    const explicitDriver = parseService(svcField).driver
    const driver = explicitDriver || (vehicle ? (driverMap[vehicle] || '') : '')
    const mopField = findValue(rec, 'MODE OF PAYMENT')
    const chargesField = findValue(rec, 'INSTALLATION CHARGES')
    const { modeOfPayment, amount, payments } = mapPayment(mopField, chargesField)
    const dlrField = findValue(rec, 'DLR')
    const { dealer, branch } = splitDealer(dlrField)

    // Extract relayed date from the row's DATE RALAYED column
    const rawRelayedDate = findValue(rec, 'DATE RALAYED', 'DATE RELAYED', 'RELAYED DATE')
    const relayedDate = rawRelayedDate ? parseDateValue(rawRelayedDate) : ''

    // Detect reschedule from UPDATE field
    const isResched = updateField.toUpperCase().includes('RESCHED')

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

  // 7. Merge continuation rows — if a row has no customer name OR same name as previous, it's extra payment
  const mergedTickets: ExtractedRelayTicket[] = []
  for (const ticket of tickets) {
    const prevTicket = mergedTickets.length > 0 ? mergedTickets[mergedTickets.length - 1] : null
    const isContinuation = !ticket.customerName
      || (prevTicket && ticket.customerName === prevTicket.customerName && ticket.installationCharges > 0)

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
