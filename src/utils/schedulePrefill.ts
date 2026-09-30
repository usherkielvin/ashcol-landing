import { API_BASE_URL } from './api'
import { getScheduleStatusValue, resolveTicketPayment, parseAcMeta, parseBrand, getTicketCommitDisplay, getTicketNumberDisplay, getInstalledDateKey, getF, CLOSING_SCHEDULE_STATUSES, type Ticket } from './ticketHelpers'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CashTxRow {
  id: string
  ticketNumber?: string
  customer: string
  installer: string
  amount: string
}

export type PrefillError = 'auth_missing' | 'network_error' | 'http_error' | 'timeout'

export type PrefillResult =
  | { ok: true; rows: CashTxRow[] }
  | { ok: false; error: PrefillError }

export interface PrefillOptions {
  branchId: string
  dateKey: string       // Report date (YYYY-MM-DD) — the service subtracts 1 day internally
  branchName: string
  signal?: AbortSignal
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2)

/**
 * Strip branch/company prefixes from an installer name.
 * Re-implements the logic from DTR_Form.tsx `cleanInstallerName`.
 */
export function cleanInstallerName(name: string, currentBranchName?: string): string {
  let cleaned = name.trim()
  cleaned = cleaned.replace(/^ASHCOL\s*[-|:]?\s*/i, '').trim()
  if (currentBranchName) {
    const cleanBranch = currentBranchName.toUpperCase().replace('ASHCOL', '').trim()
    if (cleanBranch) {
      const prefixes = [cleanBranch]

      if (cleanBranch.endsWith('SERVICES')) {
        prefixes.push(cleanBranch.slice(0, -1))
      } else if (cleanBranch.endsWith('SERVICE')) {
        prefixes.push(cleanBranch + 'S')
      }

      const firstWord = cleanBranch.split(' ')[0]
      if (firstWord && firstWord !== 'ASHCOL' && firstWord.length > 2) {
        prefixes.push(firstWord)
      }

      // Branch may be spelled with or without the ñ (BIÑAN / BINAN) in installer text.
      const plain = cleanBranch.normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (plain !== cleanBranch) prefixes.push(plain)
      if (/BINAN/.test(cleanBranch)) prefixes.push(cleanBranch.replace(/BINAN/g, 'BIÑAN'))

      prefixes.sort((a, b) => b.length - a.length)

      for (const prefix of prefixes) {
        const escaped = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        const regex = new RegExp(`^(${escaped})\\s*[-|:]?\\s*`, 'i')
        const newCleaned = cleaned.replace(regex, '')
        if (newCleaned !== cleaned) {
          cleaned = newCleaned
          break
        }
      }

      const normalizedCleaned = cleaned.toUpperCase().replace(/^ASHCOL\s+/, '').trim()
      if (normalizedCleaned === cleanBranch || prefixes.includes(normalizedCleaned)) {
        return ''
      }
    }
  }

  // Force aliases & spelling variations: in Taguig Services, Justin Roi Bien is frequently written as "JUSTINE"
  const upper = cleaned.toUpperCase()
  if (upper === 'JUSTINE' || upper === 'JUSTINE ROI' || upper === 'JUSTINE BIEN' || upper === 'JUSTINE ROI BIEN') {
    return 'JUSTIN ROI BIEN'
  }

  return cleaned
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Subtract 1 day from a YYYY-MM-DD string.
 * The DTR report for July 13 contains schedule data from July 12.
 */
export function getPreviousDayKey(reportDateKey: string): string {
  const [year, month, day] = reportDateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() - 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Fetch tickets from the branch-scoped tickets API for a specific schedule date.
 * Throws on auth missing, network error, non-2xx, or abort.
 */
export async function fetchScheduleTickets(
  branchId: string,
  scheduleDateKey: string,
  signal?: AbortSignal,
): Promise<Ticket[]> {
  const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
  if (!token) {
    throw new Error('auth_missing')
  }

  // Use the same endpoint and params as the Schedules page
  const url = `${API_BASE_URL}/tickets/branch?branchId=${encodeURIComponent(branchId)}&date=${scheduleDateKey}&size=200`
  console.log('[schedulePrefill] Fetching:', url)

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (!res.ok) {
    console.error('[schedulePrefill] HTTP error:', res.status, await res.text().catch(() => ''))
    throw new Error('http_error')
  }

  const data = await res.json()
  // Handle multiple possible response shapes (same as fetchTicketsPage)
  const payload = data?.data ?? data ?? {}
  const tickets = payload?.tickets || data?.tickets || (Array.isArray(data) ? data : [])
  console.log('[schedulePrefill] Raw tickets from API:', tickets.length)
  return tickets
}

/**
 * Helper to check if a schedule ticket is closed/completed (DONE_INSTALLED, DONE_CLEANING, DONE_CHECKUP, etc.).
 */
export function isCompletedScheduleTicket(ticket: Ticket): boolean {
  const status = getScheduleStatusValue(ticket)
  const rawStatus = (ticket.status || '').toUpperCase()

  if (status === 'CANCELLED' || rawStatus === 'CANCELLED') return false

  return (
    CLOSING_SCHEDULE_STATUSES.has(status) ||
    rawStatus === 'INSTALLED' ||
    rawStatus === 'COMPLETED' ||
    rawStatus.startsWith('DONE_')
  )
}

/**
 * Filter tickets to only those qualifying for cash prefill:
 * - Status = Any completed outcome (DONE_INSTALLED, DONE_CLEANING, DONE_CHECKUP, etc.) or raw INSTALLED/COMPLETED
 * - Payment mode = CASH
 * - Amount > 0
 */
export function filterQualifyingTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((ticket) => {
    const status = getScheduleStatusValue(ticket)
    const rawStatus = (ticket.status || '').toUpperCase()
    if (status === 'CANCELLED' || rawStatus === 'CANCELLED') return false

    // 2. Payment mode check
    const payment = resolveTicketPayment(ticket)
    if (payment.mode !== 'CASH') return false

    // 3. Amount check
    if (!payment.amount || payment.amount <= 0 || isNaN(payment.amount)) return false

    return true
  })
}

/**
 * Strip trailing number counters from installer names.
 * Examples: "JHUMAR - 3" → "JHUMAR", "RYAN (2)" → "RYAN", "KENNAN 4" → "KENNAN"
 */
export function stripInstallerCounter(name: string): string {
  return name
    .replace(/\s*[-–—]\s*\d+\s*$/, '')   // "JHUMAR - 3" or "JHUMAR -3"
    .replace(/\s*\(\d+\)\s*$/, '')        // "RYAN (2)"
    .replace(/\s+\d+\s*$/, '')            // "KENNAN 4"
    .trim()
}

/**
 * Map a qualifying ticket to a CashTxRow.
 * Uses the INSTALLER column logic (not negotiator) and UPPERCASES both names.
 */
export function mapTicketToCashRow(ticket: Ticket, branchName: string): CashTxRow {
  // Installer: use installerName field or acDetails.installerName/installer/technicianName
  // This matches the INSTALLER column in the schedules table (not the negotiator)
  const meta = parseAcMeta(ticket)
  const rawInstaller =
    ticket.installerName
    || (ticket as any).installer_name
    || String(meta.installerName || meta.installer || meta.technicianName || '')
    || ''
  const customer = (ticket.customerName || ticket.customer_name || '').trim().toUpperCase()
  const installer = stripInstallerCounter(cleanInstallerName(rawInstaller, branchName)).toUpperCase()
  const amount = String(resolveTicketPayment(ticket).amount)

  const ticketNumber = getTicketNumberDisplay(ticket)

  return {
    id: uid(),
    ticketNumber,
    customer,
    installer,
    amount,
  }
}

/**
 * Orchestrator: fetches schedule tickets for the PREVIOUS day (report date - 1),
 * filters qualifying ones, and maps them to CashTxRows.
 * Never throws — returns a discriminated result union.
 */
export async function fetchAndMapTickets(options: PrefillOptions): Promise<PrefillResult> {
  try {
    // The report date refers to the day being reported ON.
    // Schedule tickets to prefill are from the PREVIOUS day.
    const scheduleDateKey = getPreviousDayKey(options.dateKey)
    console.log('[schedulePrefill] Report date:', options.dateKey, '→ fetching schedule for:', scheduleDateKey, 'branch:', options.branchId)

    const tickets = await fetchScheduleTickets(options.branchId, scheduleDateKey, options.signal)
    console.log('[schedulePrefill] Fetched', tickets.length, 'tickets total')

    // Debug: log statuses and payment modes for first few tickets
    tickets.slice(0, 10).forEach((t, i) => {
      const status = getScheduleStatusValue(t)
      const rawStatus = (t.status || '').toUpperCase()
      const payment = resolveTicketPayment(t)
      console.log(`[schedulePrefill]   ticket[${i}]:`, {
        customer: t.customerName || t.customer_name,
        rawStatus,
        resolvedStatus: status,
        paymentMode: payment.mode,
        paymentAmount: payment.amount,
      })
    })

    const qualifying = filterQualifyingTickets(tickets)
    console.log('[schedulePrefill] Qualifying (INSTALLED + CASH + amount>0):', qualifying.length)

    const rows = qualifying.map((t) => mapTicketToCashRow(t, options.branchName))

    return { ok: true, rows }
  } catch (err: any) {
    console.error('[schedulePrefill] Error:', err)
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'timeout' }
    }
    const msg = err?.message || ''
    if (msg === 'auth_missing') {
      return { ok: false, error: 'auth_missing' }
    }
    if (msg === 'http_error') {
      return { ok: false, error: 'http_error' }
    }
    return { ok: false, error: 'network_error' }
  }
}

/**
 * Merge incoming prefilled rows with existing rows, skipping duplicates.
 * A duplicate is defined as matching customer name (case-insensitive, trimmed)
 * AND amount (compared numerically).
 *
 * For multiple matches: skips only as many incoming as there are matching existing rows.
 */
export function deduplicateAndMerge(existing: CashTxRow[], incoming: CashTxRow[]): CashTxRow[] {
  // Keep only non-empty existing rows (at least one field populated)
  const nonEmpty = existing.filter(
    (row) => row.customer.trim() || row.installer.trim() || row.amount.trim(),
  )

  // Build a count map from existing rows: key -> remaining count
  const existingCounts = new Map<string, number>()
  for (const row of nonEmpty) {
    const key = `${row.customer.trim().toLowerCase()}|${parseFloat(row.amount) || 0}`
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
  }

  // Filter incoming, skipping duplicates up to the count of matching existing rows
  const deduped: CashTxRow[] = []
  for (const row of incoming) {
    const key = `${row.customer.trim().toLowerCase()}|${parseFloat(row.amount) || 0}`
    const remaining = existingCounts.get(key) || 0
    if (remaining > 0) {
      // This incoming row matches an existing one — skip it
      existingCounts.set(key, remaining - 1)
    } else {
      deduped.push(row)
    }
  }

  return [...nonEmpty, ...deduped]
}

// ── Online Transactions Prefill (BANK TRANSFER, GCASH, CHEQUE, etc.) ─────────

export interface OnlineTxRow {
  id: string
  ticketNumber?: string
  installer: string
  customer: string
  bank: string
  amount: string
}

export type OnlinePrefillResult =
  | { ok: true; rows: OnlineTxRow[] }
  | { ok: false; error: PrefillError }

/** Payment modes that qualify as "online" transactions */
const ONLINE_PAYMENT_MODES = new Set([
  'BANK TRANSFER', 'GCASH', 'ONLINE',
])

/**
 * Filter tickets to those qualifying for online transactions prefill:
 * - Status = Any completed outcome (DONE_INSTALLED, DONE_CLEANING, DONE_CHECKUP, etc.)
 * - Payment mode = BANK TRANSFER, GCASH, ONLINE, or CHEQUE
 * - Amount > 0
 */
export function filterOnlineTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((ticket) => {
    const status = getScheduleStatusValue(ticket)
    const rawStatus = (ticket.status || '').toUpperCase()
    if (status === 'CANCELLED' || rawStatus === 'CANCELLED') return false

    const payment = resolveTicketPayment(ticket)
    if (!ONLINE_PAYMENT_MODES.has(payment.mode)) return false
    if (!payment.amount || payment.amount <= 0 || isNaN(payment.amount)) return false

    return true
  })
}

/**
 * Map a qualifying online ticket to an OnlineTxRow.
 */
export function mapTicketToOnlineRow(ticket: Ticket, branchName: string): OnlineTxRow {
  const meta = parseAcMeta(ticket)
  const rawInstaller =
    ticket.installerName
    || (ticket as any).installer_name
    || String(meta.installerName || meta.installer || meta.technicianName || '')
    || ''
  const customer = (ticket.customerName || ticket.customer_name || '').trim().toUpperCase()
  const installer = stripInstallerCounter(cleanInstallerName(rawInstaller, branchName)).toUpperCase()
  const payment = resolveTicketPayment(ticket)
  const amount = String(payment.amount)
  const bank = payment.mode || ''

  const ticketNumber = getTicketNumberDisplay(ticket)

  return {
    id: uid(),
    ticketNumber,
    installer,
    customer,
    bank,
    amount,
  }
}

/**
 * Orchestrator for online transactions: fetches schedule tickets for the PREVIOUS day,
 * filters to online payment modes, maps to OnlineTxRow.
 */
export async function fetchAndMapOnlineTickets(options: PrefillOptions): Promise<OnlinePrefillResult> {
  try {
    const scheduleDateKey = getPreviousDayKey(options.dateKey)
    console.log('[schedulePrefill:online] Report date:', options.dateKey, '→ fetching schedule for:', scheduleDateKey)

    const tickets = await fetchScheduleTickets(options.branchId, scheduleDateKey, options.signal)
    const qualifying = filterOnlineTickets(tickets)
    console.log('[schedulePrefill:online] Qualifying (INSTALLED + ONLINE/GCASH/BANK):', qualifying.length)

    const rows = qualifying.map((t) => mapTicketToOnlineRow(t, options.branchName))
    return { ok: true, rows }
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, error: 'timeout' }
    const msg = err?.message || ''
    if (msg === 'auth_missing') return { ok: false, error: 'auth_missing' }
    if (msg === 'http_error') return { ok: false, error: 'http_error' }
    return { ok: false, error: 'network_error' }
  }
}

/**
 * Merge incoming online rows with existing, skipping duplicates by customer+amount.
 */
export function deduplicateAndMergeOnline(existing: OnlineTxRow[], incoming: OnlineTxRow[]): OnlineTxRow[] {
  const nonEmpty = existing.filter(
    (row) => row.customer.trim() || row.installer.trim() || row.amount.trim(),
  )

  const existingCounts = new Map<string, number>()
  for (const row of nonEmpty) {
    const key = `${row.customer.trim().toLowerCase()}|${parseFloat(row.amount) || 0}`
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
  }

  const deduped: OnlineTxRow[] = []
  for (const row of incoming) {
    const key = `${row.customer.trim().toLowerCase()}|${parseFloat(row.amount) || 0}`
    const remaining = existingCounts.get(key) || 0
    if (remaining > 0) {
      existingCounts.set(key, remaining - 1)
    } else {
      deduped.push(row)
    }
  }

  return [...nonEmpty, ...deduped]
}

// ── Check Remits Prefill (CHEQUE payments) ───────────────────────────────────

export interface CheckRow {
  id: string
  ticketNumber?: string
  installer: string
  customer: string
  bank: string
  amount: string
}

export type CheckPrefillResult =
  | { ok: true; rows: CheckRow[] }
  | { ok: false; error: PrefillError }

/**
 * Filter tickets for cheque/check payments:
 * - Status = Any completed outcome (DONE_INSTALLED, DONE_CLEANING, DONE_CHECKUP, etc.)
 * - Payment mode = CHEQUE or CHECK
 * - Amount > 0
 */
export function filterCheckTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((ticket) => {
    const status = getScheduleStatusValue(ticket)
    const rawStatus = (ticket.status || '').toUpperCase()
    if (status === 'CANCELLED' || rawStatus === 'CANCELLED') return false

    const payment = resolveTicketPayment(ticket)
    const mode = payment.mode.toUpperCase()
    if (mode !== 'CHEQUE' && mode !== 'CHECK') return false
    if (!payment.amount || payment.amount <= 0 || isNaN(payment.amount)) return false

    return true
  })
}

/**
 * Map a cheque ticket to CheckRow.
 */
export function mapTicketToCheckRow(ticket: Ticket, branchName: string): CheckRow {
  const meta = parseAcMeta(ticket)
  const rawInstaller =
    ticket.installerName
    || (ticket as any).installer_name
    || String(meta.installerName || meta.installer || meta.technicianName || '')
    || ''
  const customer = (ticket.customerName || ticket.customer_name || '').trim().toUpperCase()
  const installer = stripInstallerCounter(cleanInstallerName(rawInstaller, branchName)).toUpperCase()
  const payment = resolveTicketPayment(ticket)

  const ticketNumber = getTicketNumberDisplay(ticket)

  return {
    id: uid(),
    ticketNumber,
    installer,
    customer,
    bank: 'CHEQUE',
    amount: String(payment.amount),
  }
}

/**
 * Fetch and map cheque payment tickets.
 */
export async function fetchAndMapCheckTickets(options: PrefillOptions): Promise<CheckPrefillResult> {
  try {
    const scheduleDateKey = getPreviousDayKey(options.dateKey)
    const tickets = await fetchScheduleTickets(options.branchId, scheduleDateKey, options.signal)
    const qualifying = filterCheckTickets(tickets)
    console.log('[schedulePrefill:check] Qualifying (INSTALLED + CHEQUE):', qualifying.length)
    const rows = qualifying.map((t) => mapTicketToCheckRow(t, options.branchName))
    return { ok: true, rows }
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, error: 'timeout' }
    const msg = err?.message || ''
    if (msg === 'auth_missing') return { ok: false, error: 'auth_missing' }
    if (msg === 'http_error') return { ok: false, error: 'http_error' }
    return { ok: false, error: 'network_error' }
  }
}

export function deduplicateAndMergeCheck(existing: CheckRow[], incoming: CheckRow[]): CheckRow[] {
  const nonEmpty = existing.filter(
    (row) => row.customer.trim() || row.installer.trim() || row.amount.trim(),
  )
  const existingCounts = new Map<string, number>()
  for (const row of nonEmpty) {
    const key = `${row.customer.trim().toLowerCase()}|${parseFloat(row.amount) || 0}`
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
  }
  const deduped: CheckRow[] = []
  for (const row of incoming) {
    const key = `${row.customer.trim().toLowerCase()}|${parseFloat(row.amount) || 0}`
    const remaining = existingCounts.get(key) || 0
    if (remaining > 0) {
      existingCounts.set(key, remaining - 1)
    } else {
      deduped.push(row)
    }
  }
  return [...nonEmpty, ...deduped]
}

// ── For Collection Prefill (FOR COLLECTION payments) ─────────────────────────

export interface ForCollRow {
  id: string
  ticketNumber?: string
  installer: string
  customer: string
  amount: string
  collectionResolved?: boolean
}

export type ForCollPrefillResult =
  | { ok: true; rows: ForCollRow[] }
  | { ok: false; error: PrefillError }

/**
 * Filter tickets for "For Collection" payments:
 * - Status = Any completed outcome (DONE_INSTALLED, DONE_CLEANING, DONE_CHECKUP, etc.)
 * - Payment mode = FOR COLLECTION
 * - Amount > 0
 */
export function filterForCollectionTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((ticket) => {
    const status = getScheduleStatusValue(ticket)
    const rawStatus = (ticket.status || '').toUpperCase()
    if (status === 'CANCELLED' || rawStatus === 'CANCELLED') return false

    const payment = resolveTicketPayment(ticket)
    const mode = payment.mode.toUpperCase()
    if (mode !== 'FOR COLLECTION' && mode !== 'FOR_COLLECTION' && mode !== 'COLLECTION') return false
    if (!payment.amount || payment.amount <= 0 || isNaN(payment.amount)) return false

    return true
  })
}

/**
 * Map a for-collection ticket to ForCollRow.
 */
export function mapTicketToForCollRow(ticket: Ticket, branchName: string): ForCollRow {
  const meta = parseAcMeta(ticket)
  const rawInstaller =
    ticket.installerName
    || (ticket as any).installer_name
    || String(meta.installerName || meta.installer || meta.technicianName || '')
    || ''
  const customer = (ticket.customerName || ticket.customer_name || '').trim().toUpperCase()
  const installer = stripInstallerCounter(cleanInstallerName(rawInstaller, branchName)).toUpperCase()
  const payment = resolveTicketPayment(ticket)

  const ticketNumber = getTicketNumberDisplay(ticket)

  return {
    id: uid(),
    ticketNumber,
    installer,
    customer,
    amount: String(payment.amount),
    collectionResolved: false,
  }
}

/**
 * Fetch and map for-collection tickets.
 */
export async function fetchAndMapForCollTickets(options: PrefillOptions): Promise<ForCollPrefillResult> {
  try {
    const scheduleDateKey = getPreviousDayKey(options.dateKey)
    const tickets = await fetchScheduleTickets(options.branchId, scheduleDateKey, options.signal)
    const qualifying = filterForCollectionTickets(tickets)
    console.log('[schedulePrefill:forColl] Qualifying (INSTALLED + FOR COLLECTION):', qualifying.length)
    const rows = qualifying.map((t) => mapTicketToForCollRow(t, options.branchName))
    return { ok: true, rows }
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, error: 'timeout' }
    const msg = err?.message || ''
    if (msg === 'auth_missing') return { ok: false, error: 'auth_missing' }
    if (msg === 'http_error') return { ok: false, error: 'http_error' }
    return { ok: false, error: 'network_error' }
  }
}

export function deduplicateAndMergeForColl(existing: ForCollRow[], incoming: ForCollRow[]): ForCollRow[] {
  const nonEmpty = existing.filter(
    (row) => row.customer.trim() || row.installer.trim() || row.amount.trim(),
  )
  const existingCounts = new Map<string, number>()
  for (const row of nonEmpty) {
    const key = `${row.customer.trim().toLowerCase()}|${parseFloat(row.amount) || 0}`
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
  }
  const deduped: ForCollRow[] = []
  for (const row of incoming) {
    const key = `${row.customer.trim().toLowerCase()}|${parseFloat(row.amount) || 0}`
    const remaining = existingCounts.get(key) || 0
    if (remaining > 0) {
      existingCounts.set(key, remaining - 1)
    } else {
      deduped.push(row)
    }
  }
  return [...nonEmpty, ...deduped]
}

// ── Rebates for Collection Prefill (FREE commit tickets) ─────────────────────

export interface RebateRow {
  id: string
  ticketNumber: string
  customer: string
  company: string
  raNumber: string
  hp: string
  amount: string
}

export type RebatePrefillResult =
  | { ok: true; rows: RebateRow[] }
  | { ok: false; error: PrefillError }

// Rebate rate table: amount per dealer/brand (company) per HP capacity.
// Shared across all branches.
export const REBATE_RATE_TABLE: Record<string, Record<string, number>> = {
  RA:          { '1': 7200, '1.5': 7500, '2': 7500, '2.5': 8500 },
  MIDEA:       { '1': 8000, '1.5': 8500, '2': 8500, '2.5': 9000 },
}

/** Normalize an HP value like "1.0", "1.0HP", "1.5 hp", "2H" to a rate-table key ("1", "1.5", "2", "2.5"). */
export const normalizeHpKey = (raw: string): string => {
  if (!raw) return ''
  const match = raw.trim().match(/(\d+(?:\.\d+)?)/)
  if (!match) return ''
  const num = parseFloat(match[1])
  if (isNaN(num)) return ''
  return num % 1 === 0 ? String(Math.floor(num)) : String(num)
}

/** Look up the rebate rate for a dealer/brand + HP capacity. Returns null if not found. */
export const lookupRebateRate = (company: string, hp: string): number | null => {
  const hpKey = normalizeHpKey(hp)
  if (!hpKey) return null

  const cleanedCompany = (company || '').trim().toUpperCase()

  // 1. Check for specific rate overrides (MIDEA)
  let dealerKey = Object.keys(REBATE_RATE_TABLE).find(k => {
    if (k === 'RA') return false
    const keyUpper = k.toUpperCase()
    return cleanedCompany === keyUpper || cleanedCompany.includes(keyUpper) || keyUpper.includes(cleanedCompany)
  })

  // 2. All non-Midea brands fall back to RA rate table
  if (!dealerKey) {
    dealerKey = 'RA'
  }

  const rate = REBATE_RATE_TABLE[dealerKey]?.[hpKey]
  return rate != null ? rate : null
}

/**
 * Separate a combined brand+capacity string (e.g. "MIDEA WALLMOUNTED 1.0HP") into
 * brand ("MIDEA") and hp ("1") parts.
 */
export function splitBrandAndHp(combined: string): { brand: string; hp: string } {
  const trimmed = combined.trim()
  if (!trimmed) return { brand: '', hp: '' }

  // 1. Extract HP capacity token
  let hp = ''
  let brandText = trimmed

  const hpMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:H\.?P\.?|HP|H)?\b/i)
  if (hpMatch) {
    hp = normalizeHpKey(hpMatch[1])
    brandText = trimmed.replace(hpMatch[0], '').trim()
  }

  // 2. Clean descriptor noise words (WALLMOUNTED, WALL MOUNTED, INVERTER, SPLIT TYPE, etc.)
  let cleanedBrand = brandText
    .replace(/\b(WALLMOUNTED|WALL\s*MOUNTED|WALLMOUNT|WALL\s*MOUNT|INVERTER|NON-INVERTER|NON\s*INVERTER|SPLIT\s*TYPE|WINDOW\s*TYPE|PACKAGE\s*TYPE|FLOOR\s*STANDING|CASSETTE|CEILING\s*CASSETTE|AC|UNIT|SET)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // 3. Match against known primary brands
  const knownBrands = ['MIDEA', 'CARRIER', 'PANASONIC', 'LG', 'DAIKIN', 'KOPPEL', 'SAMSUNG', 'SHARP', 'HAIER', 'AUX', 'GREE', 'KOLIN', 'YORK', 'FUJI', 'RA', 'SMILE SERVE']
  const matchedBrand = knownBrands.find(b => cleanedBrand.toUpperCase().includes(b))
  if (matchedBrand) {
    cleanedBrand = matchedBrand
  }

  return {
    brand: (cleanedBrand || brandText || trimmed).toUpperCase(),
    hp: hp || ''
  }
}

/**
 * Filter tickets qualifying for Rebates for Collection prefill:
 * - Status = Any completed outcome (DONE_INSTALLED, DONE_CLEANING, DONE_CHECKUP, etc.)
 * - Commit / commit type contains "FREE" (e.g. "FREE", "FREE INSTALL")
 */
export function filterFreeCommitTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((ticket) => {
    if (!isCompletedScheduleTicket(ticket)) return false

    const commit = getTicketCommitDisplay(ticket).toUpperCase()
    if (!commit.includes('FREE')) return false

    return true
  })
}

/**
 * Map a qualifying FREE-commit ticket to a RebateRow.
 * Brand and HP are parsed separately from the schedules "Brand" column value
 * (which combines brand + capacity, e.g. "MIDEA 1.5HP").
 */
export function mapTicketToRebateRow(ticket: Ticket): RebateRow {
  const ticketNumber = getTicketNumberDisplay(ticket)
  const customer = (ticket.customerName || ticket.customer_name || '').trim().toUpperCase()
  const dealer = getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || ''
  const combinedBrand = parseBrand(ticket)
  const { brand, hp } = splitBrandAndHp(combinedBrand)

  // Auto-calculate rebate rate from table if brand and HP match
  const rate = lookupRebateRate(brand, hp)
  const amountStr = rate != null ? String(rate) : ''

  return {
    id: uid(),
    ticketNumber,
    customer,
    company: brand,
    raNumber: dealer,
    hp,
    amount: amountStr,
  }
}

/**
 * Fetch and map FREE-commit tickets for Rebates for Collection.
 */
export async function fetchAndMapRebateTickets(options: PrefillOptions): Promise<RebatePrefillResult> {
  try {
    const scheduleDateKey = getPreviousDayKey(options.dateKey)
    const tickets = await fetchScheduleTickets(options.branchId, scheduleDateKey, options.signal)
    const qualifying = filterFreeCommitTickets(tickets)
    console.log('[schedulePrefill:rebate] Qualifying (INSTALLED + FREE commit):', qualifying.length)
    const rows = qualifying.map((t) => mapTicketToRebateRow(t))
    return { ok: true, rows }
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, error: 'timeout' }
    const msg = err?.message || ''
    if (msg === 'auth_missing') return { ok: false, error: 'auth_missing' }
    if (msg === 'http_error') return { ok: false, error: 'http_error' }
    return { ok: false, error: 'network_error' }
  }
}

/**
 * Merge incoming rebate rows with existing, skipping duplicates by ticket number
 * (falls back to customer+company match if ticket number is blank).
 */
export function deduplicateAndMergeRebates(existing: RebateRow[], incoming: RebateRow[]): RebateRow[] {
  const nonEmpty = existing.filter(
    (row) => row.ticketNumber.trim() || row.customer.trim() || row.company.trim() || row.amount.trim(),
  )

  const existingKeys = new Set<string>()
  for (const row of nonEmpty) {
    const key = row.ticketNumber.trim()
      ? `tn:${row.ticketNumber.trim().toLowerCase()}`
      : `cc:${row.customer.trim().toLowerCase()}|${row.company.trim().toLowerCase()}`
    existingKeys.add(key)
  }

  const deduped: RebateRow[] = []
  for (const row of incoming) {
    const key = row.ticketNumber.trim()
      ? `tn:${row.ticketNumber.trim().toLowerCase()}`
      : `cc:${row.customer.trim().toLowerCase()}|${row.company.trim().toLowerCase()}`
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    deduped.push(row)
  }

  return [...nonEmpty, ...deduped]
}

// ── Commission Expenses Prefill (all installed tickets, amount keyed manually) ──

export interface CommissionRow {
  id: string
  ticketNumber: string
  store: string
  diser: string
  customer: string
  brand: string
  hp: string
  dateInstalled: string
  amount: string
}

export type CommissionPrefillResult =
  | { ok: true; rows: CommissionRow[] }
  | { ok: false; error: PrefillError }

/**
 * Filter tickets qualifying for Commission Expenses prefill:
 * - Status = DONE_INSTALLED specifically (not other closing outcomes like DONE_CLEANING,
 *   DONE_CHECKUP, DONE_SERVICE, etc.) — only actually-installed schedule tickets qualify.
 */
export function filterInstalledTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((ticket) => getScheduleStatusValue(ticket) === 'DONE_INSTALLED')
}

/**
 * Map a qualifying installed ticket to a CommissionRow.
 * Brand and HP are auto-fetched and parsed from schedule ticket.
 * Amount is intentionally left blank — branch staff key it in manually per row.
 */
export function mapTicketToCommissionRow(ticket: Ticket): CommissionRow {
  const ticketNumber = getTicketNumberDisplay(ticket)
  const customer = (ticket.customerName || ticket.customer_name || '').trim().toUpperCase()
  const store = getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || ''
  const diser = getF(ticket, 'diser') || ''
  const combinedBrand = parseBrand(ticket)
  const { brand, hp } = splitBrandAndHp(combinedBrand)
  const dateInstalled = getInstalledDateKey(ticket)

  return {
    id: uid(),
    ticketNumber,
    store,
    diser,
    customer,
    brand: brand || '',
    hp: hp || '',
    dateInstalled,
    amount: '',
  }
}

/**
 * Fetch and map all installed tickets for Commission Expenses.
 */
export async function fetchAndMapCommissionTickets(options: PrefillOptions): Promise<CommissionPrefillResult> {
  try {
    const scheduleDateKey = getPreviousDayKey(options.dateKey)
    const tickets = await fetchScheduleTickets(options.branchId, scheduleDateKey, options.signal)
    const qualifying = filterInstalledTickets(tickets)
    console.log('[schedulePrefill:commission] Qualifying (installed):', qualifying.length)
    const rows = qualifying.map((t) => mapTicketToCommissionRow(t))
    return { ok: true, rows }
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, error: 'timeout' }
    const msg = err?.message || ''
    if (msg === 'auth_missing') return { ok: false, error: 'auth_missing' }
    if (msg === 'http_error') return { ok: false, error: 'http_error' }
    return { ok: false, error: 'network_error' }
  }
}

/**
 * Merge incoming commission rows with existing, skipping duplicates by ticket number
 * (falls back to customer+store match if ticket number is blank).
 */
export function deduplicateAndMergeCommissions(existing: CommissionRow[], incoming: CommissionRow[]): CommissionRow[] {
  const nonEmpty = existing.filter(
    (row) =>
      row.ticketNumber.trim() ||
      row.customer.trim() ||
      row.store.trim() ||
      row.diser.trim() ||
      (row.brand || '').trim() ||
      (row.hp || '').trim() ||
      row.amount.trim(),
  )

  const existingKeys = new Set<string>()
  for (const row of nonEmpty) {
    const key = row.ticketNumber.trim()
      ? `tn:${row.ticketNumber.trim().toLowerCase()}`
      : `cs:${row.customer.trim().toLowerCase()}|${row.store.trim().toLowerCase()}`
    existingKeys.add(key)
  }

  const deduped: CommissionRow[] = []
  for (const row of incoming) {
    const key = row.ticketNumber.trim()
      ? `tn:${row.ticketNumber.trim().toLowerCase()}`
      : `cs:${row.customer.trim().toLowerCase()}|${row.store.trim().toLowerCase()}`
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    deduped.push(row)
  }

  return [...nonEmpty, ...deduped]
}

// ── Unit Summary Counters Prefill ────────────────────────────────────────────

export interface UnitSummaryCounts {
  scheduledUnits: number
  rescheduledUnits: number
  installedUnits: number
  servicedUnits: number
  cancelledUnits: number
  freeInstallUnits: number
  surveyOnlyUnits: number
}

export type UnitSummaryPrefillResult =
  | { ok: true; counts: UnitSummaryCounts }
  | { ok: false; error: PrefillError }

/**
 * Compute Unit Summary category counts based on schedule ticket statuses & commit types.
 */
export function computeUnitSummaryFromTickets(tickets: Ticket[]): UnitSummaryCounts {
  let scheduled = 0
  let rescheduled = 0
  let installed = 0
  let serviced = 0
  let cancelled = 0
  let freeInstall = 0
  let surveyOnly = 0

  for (const t of tickets) {
    const statusVal = getScheduleStatusValue(t)
    const rawStatus = (t.status || '').toUpperCase()
    const commitText = getTicketCommitDisplay(t).toUpperCase()
    const serviceType = (t.serviceType || t.service_type || '').toUpperCase()

    const payment = resolveTicketPayment(t)
    const paymentMode = (payment?.mode || '').toUpperCase()

    scheduled++

    if (statusVal === 'RESCHED' || rawStatus === 'RESCHED' || rawStatus === 'RESCHEDULED') {
      rescheduled++
    } else if (statusVal === 'CANCELLED' || rawStatus === 'CANCELLED' || statusVal === 'DONE_CANCELLED') {
      cancelled++
    } else if (statusVal === 'DONE_SURVEY' || rawStatus === 'SURVEY' || serviceType === 'SURVEY') {
      surveyOnly++
    } else {
      const isFreeInstall =
        commitText.includes('FREE') ||
        paymentMode === 'FREE INSTALL' ||
        paymentMode === 'FREE' ||
        paymentMode === 'FREE_INSTALL' ||
        serviceType.includes('FREE')

      const isInstall =
        isFreeInstall ||
        statusVal === 'DONE_INSTALLED' ||
        statusVal === 'DONE_INSTALLATION' ||
        rawStatus === 'INSTALLED' ||
        rawStatus === 'DONE_INSTALLED' ||
        serviceType.includes('INSTALL') ||
        statusVal === 'S/I'

      const isService =
        statusVal === 'DONE_CLEANING' ||
        statusVal === 'DONE_CHECKUP' ||
        statusVal === 'DONE_SERVICES' ||
        statusVal === 'DONE_SERVICE' ||
        statusVal === 'DONE_MOUNTING' ||
        statusVal === 'DONE_REPAIR' ||
        serviceType.includes('SERVICE') ||
        serviceType.includes('CLEAN') ||
        serviceType.includes('REPAIR')

      if (isFreeInstall) {
        // Free installs count toward Free Install Units and are also counted under Installed Units
        freeInstall++
      }

      if (isInstall) {
        installed++
      } else if (isService) {
        serviced++
      }
    }
  }

  return {
    scheduledUnits: scheduled,
    rescheduledUnits: rescheduled,
    installedUnits: installed,
    servicedUnits: serviced,
    cancelledUnits: cancelled,
    freeInstallUnits: freeInstall,
    surveyOnlyUnits: surveyOnly,
  }
}

/**
 * Fetch schedule tickets for the previous date and compute Unit Summary category counts.
 */
export async function fetchAndCountUnitSummary(options: PrefillOptions): Promise<UnitSummaryPrefillResult> {
  try {
    const scheduleDateKey = getPreviousDayKey(options.dateKey)
    const tickets = await fetchScheduleTickets(options.branchId, scheduleDateKey, options.signal)
    const counts = computeUnitSummaryFromTickets(tickets)
    return { ok: true, counts }
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, error: 'timeout' }
    const msg = err?.message || ''
    if (msg === 'auth_missing') return { ok: false, error: 'auth_missing' }
    if (msg === 'http_error') return { ok: false, error: 'http_error' }
    return { ok: false, error: 'network_error' }
  }
}
