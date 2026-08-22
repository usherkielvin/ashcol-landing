import { fetchTicketsPage } from './api'
import {
  getScheduleStatusValue,
  resolveTicketPayment,
  parseBrand,
  formatAddress,
  getTicketCommitDisplay,
  getInstallerDisplay,
  getInstalledDateKey,
  getEffectiveScheduleDateKey,
  type Ticket,
} from './ticketHelpers'
import { cleanInstallerName, stripInstallerCounter } from './schedulePrefill'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PayrollRow {
  id: string
  ticketId?: string
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

/** Label shown in the INSTALLATION UPLOAD column, and the key used to look up a rate. */
function classifyJob(ticket: Ticket): { label: string; rateKey: keyof PayrollRates | null } {
  const status = getScheduleStatusValue(ticket)
  const rawStatus = (ticket.status || '').toUpperCase()

  if (rawStatus === 'RESCHED' || status === 'RESCHED') {
    return { label: 'RESCHEDULED', rateKey: 'rescheduled' }
  }
  if (status === 'DONE_CLEANING' || status === 'CLEANING') {
    return { label: 'CLEANING', rateKey: 'cleaning' }
  }
  if (status === 'DONE_SURVEY' || status === 'SURVEY') {
    return { label: 'SURVEY', rateKey: 'survey' }
  }
  if (
    status === 'DONE_INSTALLED'
    || status === 'INSTALL'
    || status === 'S/I'
    || rawStatus === 'INSTALLED'
    || rawStatus === 'COMPLETED'
  ) {
    return { label: 'INSTALL', rateKey: 'install' }
  }
  // Any other outcome (checkup, backjob, negotiation, etc.) — show the raw status, no fee guess.
  return { label: status.replace(/_/g, ' '), rateKey: null }
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
  const customerName = (ticket.customerName || ticket.customer_name || '').trim().toUpperCase()
  const cityAddress = formatAddress(ticket.location).toUpperCase()
  const brandCapacity = parseBrand(ticket)
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
      rows.push(...mapTicketToPayrollRows(ticket, branchName, rates))
    }
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
