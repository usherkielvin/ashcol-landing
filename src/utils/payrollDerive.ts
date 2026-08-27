import { fetchTicketsPage } from './api'
import {
  getScheduleStatusValue,
  getScheduleStatusDisplay,
  resolveTicketPayment,
  formatAddress,
  getTicketCommitDisplay,
  getInstallerDisplay,
  getInstalledDateKey,
  getEffectiveScheduleDateKey,
  isGenericUnitTypeLabel,
  parseAcMeta,
  type Ticket,
} from './ticketHelpers'
import { parseBrandFromAcDetails } from './warrantyTicketDisplay'
import { cleanInstallerName, stripInstallerCounter } from './schedulePrefill'

/** Brand only, no capacity/HP — the payroll sheet's Brand column doesn't need the unit size. */
function parseBrandOnly(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const fromAc = parseBrandFromAcDetails(ticket.acDetails || ticket.ac_details)
  const explicitBrand = String(fromAc || meta.brand || meta.unitBrand || '').trim()
  if (explicitBrand) return explicitBrand
  const unit = (ticket.unitType || ticket.unit_type || '').trim()
  return unit && !isGenericUnitTypeLabel(unit) ? unit : ''
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PayrollRow {
  id: string
  ticketId?: string
  ticketNumber: string
  installerName: string
  workDate: string
  customerName: string
  cityAddress: string
  brandCapacity: string
  sifQuotation: string
  totalPipeLength: string
  amountCollected: string
  actualCollected: string
  installationUpload: string
  installationFee: string
  earthGrounding: string
  dailyAllowance: string
  // Fee-type breakdown, mirroring the branch's real payroll worksheet — most are blank per
  // job, shown only when unhidden via the column menu (see COLUMN_DEFS in Payroll.tsx).
  excessCopperTube: string
  hauling: string
  dismantling: string
  electricalWorks: string
  chippingWorks: string
  breaker: string
  powerSupplyLaborOnly: string
  powerSupplyLaborMaterials: string
  specialBracketCatwalk: string
  specialBracketWelding: string
  excessCopperTubeLaborOnly: string
  relocationAccuFcu: string
  systemReprocessLabor: string
  drainPumpInstallation: string
  scaffoldingInstallation: string
  flushingOldPipe: string
  sterneBracket: string
  breakerInstallationLabor: string
  chargingOfFreon: string
  materialsReturn: string
  installationChecklist: string
  videoUpload: string
  remarks: string
  audited: string
}

export interface PayrollRates {
  install: number
  cleaning: number
  survey: number
  rescheduled: number
  earthGrounding: number
  dailyAllowance: number
}

export const DEFAULT_PAYROLL_RATES: PayrollRates = {
  install: 1500,
  cleaning: 700,
  survey: 100,
  rescheduled: 0,
  earthGrounding: 100,
  dailyAllowance: 100,
}

export type PrefillError = 'auth_missing' | 'network_error' | 'http_error' | 'timeout'
export type PayrollPrefillResult =
  | { ok: true; rows: PayrollRow[] }
  | { ok: false; error: PrefillError }

const uid = () => Math.random().toString(36).slice(2)

// ── Job classification ──────────────────────────────────────────────────────

/** The rate key to look up a fee by — separate from the display label below. */
function classifyJobRateKey(ticket: Ticket): keyof PayrollRates | null {
  const status = getScheduleStatusValue(ticket)
  const rawStatus = (ticket.status || '').toUpperCase()

  if (rawStatus === 'RESCHED' || status === 'RESCHED') return 'rescheduled'
  // 'CLEANING'/'SURVEY'/'INSTALL' (no DONE_ prefix) are the *pending*, not-yet-worked
  // schedule statuses (see SCHEDULE_STATUS_OPTS groups in scheduleStatus.ts) — a job only
  // owes a fee once it's actually been done, so only the DONE_/closing variants count here.
  if (status === 'DONE_CLEANING') return 'cleaning'
  if (status === 'DONE_SURVEY') return 'survey'
  if (
    status === 'DONE_INSTALLED'
    || status === 'S/I'
    || rawStatus === 'INSTALLED'
    || rawStatus === 'COMPLETED'
  ) {
    return 'install'
  }
  // Any other outcome (pending install/cleaning, checkup, backjob, negotiation, etc.) —
  // not yet completed, or not a billable job type — no fee guess.
  return null
}

/** Label shown in the Status column — exactly what the ticket's own Schedule Status shows (e.g. "DONE INSTALL"). */
function classifyJob(ticket: Ticket): { label: string; rateKey: keyof PayrollRates | null } {
  return { label: getScheduleStatusDisplay(ticket), rateKey: classifyJobRateKey(ticket) }
}

/** Installer field can hold "JHUMAR / RANIL" for a teamwork job — the payroll sheet is per-installer. */
function splitInstallerNames(raw: string): string[] {
  return raw
    .split(/[/&,+]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ── Row mapping ──────────────────────────────────────────────────────────────

export function mapTicketToPayrollRows(ticket: Ticket, branchName: string, rates: PayrollRates): PayrollRow[] {
  const rawInstaller = getInstallerDisplay(ticket)
  if (!rawInstaller) return []

  const names = splitInstallerNames(rawInstaller)
    .map((n) => stripInstallerCounter(cleanInstallerName(n, branchName)).toUpperCase())
    .filter(Boolean)
  if (names.length === 0) return []

  const workDate = getInstalledDateKey(ticket) || getEffectiveScheduleDateKey(ticket)
  const ticketNumber = (ticket.ticketNumber || ticket.ticket_number || '').trim()
  const customerName = (ticket.customerName || ticket.customer_name || '').trim().toUpperCase()
  const cityAddress = formatAddress(ticket.location).toUpperCase()
  const brandCapacity = parseBrandOnly(ticket)
  const commit = getTicketCommitDisplay(ticket).toUpperCase()
  const sifQuotation = commit.includes('FREE') ? 'N/A' : (brandCapacity ? 'SIF' : 'N/A')

  const payment = resolveTicketPayment(ticket)
  const amountCollected = payment.amount > 0 ? String(payment.amount) : ''
  const actualCollected = payment.mode === 'FREE' || payment.mode === 'FREE INSTALL'
    ? 'FREE'
    : payment.amount > 0
      ? `${payment.amount.toLocaleString('en-PH')} ${payment.mode || 'CASH'}`.trim()
      : ''

  const { label, rateKey } = classifyJob(ticket)
  const installationFee = rateKey ? rates[rateKey] : 0

  return names.map((installerName) => ({
    id: uid(),
    ticketId: ticket.id,
    ticketNumber,
    installerName,
    workDate,
    customerName,
    cityAddress,
    brandCapacity,
    sifQuotation,
    totalPipeLength: '',
    amountCollected,
    actualCollected,
    installationUpload: label,
    installationFee: String(installationFee),
    earthGrounding: '',
    dailyAllowance: '',
    excessCopperTube: '',
    hauling: '',
    dismantling: '',
    electricalWorks: '',
    chippingWorks: '',
    breaker: '',
    powerSupplyLaborOnly: '',
    powerSupplyLaborMaterials: '',
    specialBracketCatwalk: '',
    specialBracketWelding: '',
    excessCopperTubeLaborOnly: '',
    relocationAccuFcu: '',
    systemReprocessLabor: '',
    drainPumpInstallation: '',
    scaffoldingInstallation: '',
    flushingOldPipe: '',
    sterneBracket: '',
    breakerInstallationLabor: '',
    chargingOfFreon: '',
    materialsReturn: '',
    installationChecklist: '',
    videoUpload: '',
    remarks: '',
    audited: '',
  }))
}

/** Stamps Daily Allowance once per (installer, workDate) — onto that day's first row only. */
export function applyDailyAllowance(rows: PayrollRow[], rates: PayrollRates): PayrollRow[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    if (!row.workDate) return row
    const key = `${row.installerName}|${row.workDate}`
    if (seen.has(key)) return row
    seen.add(key)
    return { ...row, dailyAllowance: String(rates.dailyAllowance), earthGrounding: String(rates.earthGrounding) }
  })
}

// ── Fetch + orchestrate ─────────────────────────────────────────────────────

export async function fetchAndMapPayroll(
  branchId: string,
  monthKey: string,
  branchName: string,
  rates: PayrollRates,
): Promise<PayrollPrefillResult> {
  try {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    if (!token) return { ok: false, error: 'auth_missing' }

    const list = await fetchTicketsPage('/tickets/branch', token, {
      month: monthKey,
      branchId,
      paginate: true,
      size: 200,
    })

    const tickets = (list as Ticket[]).filter((t) => (t.status || '').toUpperCase() !== 'CANCELLED')

    let rows: PayrollRow[] = []
    for (const ticket of tickets) {
      // Only pull completed jobs into payroll — skip reschedules, surveys, for-approval, etc.
      const rateKey = classifyJobRateKey(ticket)
      if (rateKey !== 'install' && rateKey !== 'cleaning') continue
      rows.push(...mapTicketToPayrollRows(ticket, branchName, rates))
    }
    // The backend's ?month= match is a broad OR across several schedule date fields (preferred,
    // rescheduled-to, archived, etc.), not strictly "job actually done this month" — so it can
    // return tickets whose real work date falls in a different month. Re-check here.
    rows = rows.filter((r) => !r.workDate || r.workDate.slice(0, 7) === monthKey)
    rows = applyDailyAllowance(rows, rates)
    rows.sort((a, b) => (a.workDate || '').localeCompare(b.workDate || ''))

    return { ok: true, rows }
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, error: 'timeout' }
    return { ok: false, error: 'network_error' }
  }
}

/** Dedupe by ticketId+installerName so re-syncing never duplicates rows or clobbers hand edits. */
export function deduplicateAndMergePayroll(existing: PayrollRow[], incoming: PayrollRow[]): PayrollRow[] {
  const nonEmpty = existing.filter(
    (row) => row.customerName.trim() || row.installerName.trim() || row.amountCollected.trim() || row.installationFee.trim(),
  )

  const existingKeys = new Set<string>()
  for (const row of nonEmpty) {
    const key = row.ticketId
      ? `tk:${row.ticketId}|${row.installerName.trim().toLowerCase()}`
      : `manual:${row.id}`
    existingKeys.add(key)
  }

  const deduped: PayrollRow[] = []
  for (const row of incoming) {
    const key = row.ticketId
      ? `tk:${row.ticketId}|${row.installerName.trim().toLowerCase()}`
      : `manual:${row.id}`
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    deduped.push(row)
  }

  return [...nonEmpty, ...deduped]
}
