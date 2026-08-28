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
  /** PENDING until the payroll officer reviews and finalizes the row, then COMPLETE. */
  status: string
  /** Values for any branch-defined custom column (see CustomColumnDef in Payroll.tsx), keyed
   *  by that column's generated key. Empty object for a row with no custom columns filled in. */
  customFields: Record<string, string>
}

// ── Standard rate table ─────────────────────────────────────────────────────
// Mirrors the branch's real "Installation Standard Rates" / "Standard Rates for Service
// Payroll" worksheets. Install/cleaning fees are no longer one flat number — they're tiered by
// unit mount type + capacity (HP/TR), matched automatically from the ticket's own unit data
// where possible (see matchRateLineItem below), and independently overridable per branch (a
// branch's saved PayrollRates.lineItemOverrides is a sparse map keyed by RateLineItem.key).

export type MountCategory = 'SPLIT' | 'WINDOW' | 'FLOOR' | 'CEILING_MOUNTED' | 'CEILING_CASSETTE'

export interface RateLineItem {
  key: string
  label: string
  /** Subheading the Payroll Settings modal groups this row under. */
  group: string
  category: 'installation' | 'service'
  /** Head-Office standard rate — the fallback when a branch has no override for this key. */
  defaultRate: number
  /** Auto-match criteria against a ticket's own unit-type/HP/TR text. Omitted for line items
   *  that can't be told apart from ticket data alone (e.g. Pull Down vs General Cleaning look
   *  identical in the schedule status) — those are settings-only, never auto-applied. */
  match?: { mount: MountCategory; hpMin?: number; hpMax?: number; tr?: number }
  /** Eligible to be auto-filled onto a synced row's Install Fee for this job type. Installation
   *  rows always are; only the "General Cleaning" service rows are for cleaning jobs — Pull
   *  Down/System Reprocess/Check Up/Freon can't be distinguished from ticket data, so staff
   *  pick/correct those by hand, same as today. */
  autoDetectFor?: 'install' | 'cleaning'
}

export const STANDARD_RATE_TABLE: RateLineItem[] = [
  // Installation
  { key: 'install_split_1_2hp', label: 'Split Type 1.0 HP to 2.0 HP', group: 'Installation', category: 'installation', defaultRate: 1500, match: { mount: 'SPLIT', hpMin: 1.0, hpMax: 2.0 }, autoDetectFor: 'install' },
  { key: 'install_split_2_5_3hp', label: 'Split Type 2.5 HP to 3.0 HP', group: 'Installation', category: 'installation', defaultRate: 1600, match: { mount: 'SPLIT', hpMin: 2.5, hpMax: 3.0 }, autoDetectFor: 'install' },
  { key: 'install_window', label: 'Window Type Mounting Only', group: 'Installation', category: 'installation', defaultRate: 500, match: { mount: 'WINDOW' }, autoDetectFor: 'install' },
  { key: 'install_floor_3tr', label: '3.0 TR Floor Mounted (= 4.0 HP)', group: 'Installation', category: 'installation', defaultRate: 2300, match: { mount: 'FLOOR', tr: 3.0 }, autoDetectFor: 'install' },
  { key: 'install_floor_4tr', label: '4.0 TR Floor Mounted (= 5.0 HP)', group: 'Installation', category: 'installation', defaultRate: 2400, match: { mount: 'FLOOR', tr: 4.0 }, autoDetectFor: 'install' },
  { key: 'install_floor_5tr', label: '5.0 TR Floor Mounted (= 6.0 HP)', group: 'Installation', category: 'installation', defaultRate: 2600, match: { mount: 'FLOOR', tr: 5.0 }, autoDetectFor: 'install' },
  { key: 'install_floor_7_5tr', label: '7.5 TR Floor Mounted', group: 'Installation', category: 'installation', defaultRate: 3500, match: { mount: 'FLOOR', tr: 7.5 }, autoDetectFor: 'install' },
  { key: 'install_ceiling_mounted_3tr', label: '3.0 TR Ceiling Mounted', group: 'Installation', category: 'installation', defaultRate: 2600, match: { mount: 'CEILING_MOUNTED', tr: 3.0 }, autoDetectFor: 'install' },
  { key: 'install_ceiling_cassette_3tr', label: '3.0 TR Ceiling Cassette', group: 'Installation', category: 'installation', defaultRate: 2900, match: { mount: 'CEILING_CASSETTE', tr: 3.0 }, autoDetectFor: 'install' },
  { key: 'install_ceiling_mounted_5tr', label: '5.0 TR Ceiling Mounted', group: 'Installation', category: 'installation', defaultRate: 2700, match: { mount: 'CEILING_MOUNTED', tr: 5.0 }, autoDetectFor: 'install' },
  { key: 'install_ceiling_cassette_5tr', label: '5.0 TR Ceiling Cassette', group: 'Installation', category: 'installation', defaultRate: 3200, match: { mount: 'CEILING_CASSETTE', tr: 5.0 }, autoDetectFor: 'install' },
  // General Cleaning — auto-detected default for a "cleaning" job; the closest capacity match.
  { key: 'service_gen_clean_split_1_1_5hp', label: 'General Cleaning — Split Type 1.0 HP to 1.5 HP', group: 'General Cleaning', category: 'service', defaultRate: 500, match: { mount: 'SPLIT', hpMin: 1.0, hpMax: 1.5 }, autoDetectFor: 'cleaning' },
  { key: 'service_gen_clean_split_2_3hp', label: 'General Cleaning — Split Type 2.0 HP to 3.0 HP', group: 'General Cleaning', category: 'service', defaultRate: 600, match: { mount: 'SPLIT', hpMin: 2.0, hpMax: 3.0 }, autoDetectFor: 'cleaning' },
  { key: 'service_gen_clean_window', label: 'General Cleaning — Window Type', group: 'General Cleaning', category: 'service', defaultRate: 450, match: { mount: 'WINDOW' }, autoDetectFor: 'cleaning' },
  { key: 'service_gen_clean_ceiling_cassette', label: 'General Cleaning — Ceiling Cassette', group: 'General Cleaning', category: 'service', defaultRate: 1000, match: { mount: 'CEILING_CASSETTE' }, autoDetectFor: 'cleaning' },
  { key: 'service_gen_clean_floor_3tr', label: 'General Cleaning — 3.0 TR Floor Mounted', group: 'General Cleaning', category: 'service', defaultRate: 1000, match: { mount: 'FLOOR', tr: 3.0 }, autoDetectFor: 'cleaning' },
  // Everything below can't be told apart from ticket status alone — settings-only, staff
  // apply/correct the fee by hand on the row (exactly like today's behavior).
  { key: 'service_sys_reprocess_split', label: 'System Reprocess — Split Type', group: 'System Reprocess', category: 'service', defaultRate: 1000 },
  { key: 'service_sys_reprocess_floor_3tr', label: 'System Reprocess — 3.0 TR Floor Mounted', group: 'System Reprocess', category: 'service', defaultRate: 1200 },
  { key: 'service_sys_reprocess_ceiling_cassette_3tr', label: 'System Reprocess — 3.0 TR Ceiling Cassette', group: 'System Reprocess', category: 'service', defaultRate: 1300 },
  { key: 'service_sys_reprocess_window', label: 'System Reprocess — Window Type', group: 'System Reprocess', category: 'service', defaultRate: 900 },
  { key: 'service_warranty_checkup', label: 'Warranty Check Up', group: 'Check Up', category: 'service', defaultRate: 100 },
  { key: 'service_out_of_warranty_checkup', label: 'Out of Warranty Check Up', group: 'Check Up', category: 'service', defaultRate: 300 },
  { key: 'service_pulldown_split', label: 'Pull Down Cleaning — Split Type', group: 'Pull Down Cleaning', category: 'service', defaultRate: 1000 },
  { key: 'service_pulldown_3tr', label: 'Pull Down Cleaning — 3.0 TR', group: 'Pull Down Cleaning', category: 'service', defaultRate: 1200 },
  { key: 'service_charging_freon', label: 'Charging Freon Only', group: 'Other Service Fees', category: 'service', defaultRate: 300 },
]

/** Sparse per-branch override map, keyed by RateLineItem.key — only entries a branch has
 *  actually changed from the Head Office default are present. */
export type RateOverrides = Record<string, number>

export function effectiveRate(key: string, overrides: RateOverrides): number {
  const override = overrides[key]
  if (override != null) return override
  return STANDARD_RATE_TABLE.find((item) => item.key === key)?.defaultRate ?? 0
}

export interface PayrollRates {
  survey: number
  rescheduled: number
  earthGrounding: number
  dailyAllowance: number
  lineItemOverrides: RateOverrides
}

export const DEFAULT_PAYROLL_RATES: PayrollRates = {
  survey: 100,
  rescheduled: 0,
  earthGrounding: 100,
  dailyAllowance: 100,
  lineItemOverrides: {},
}

export type PrefillError = 'auth_missing' | 'network_error' | 'http_error' | 'timeout'
export type PayrollPrefillResult =
  | { ok: true; rows: PayrollRow[] }
  | { ok: false; error: PrefillError }

const uid = () => Math.random().toString(36).slice(2)

// ── Tier matching ────────────────────────────────────────────────────────────
// Ticket unit data is loosely-structured free text (hand-typed or Excel-imported), not a fixed
// enum — so this is a best-effort match. No confident match just means the fee is left blank
// for the payroll officer to fill in by hand, same as any other job the sheet can't auto-price.

function detectMountCategory(text: string): MountCategory | null {
  const t = text.toUpperCase()
  if (t.includes('CASSETTE')) return 'CEILING_CASSETTE'
  if (t.includes('CEILING')) return 'CEILING_MOUNTED'
  if (t.includes('FLOOR')) return 'FLOOR'
  if (t.includes('WINDOW')) return 'WINDOW'
  if (t.includes('SPLIT')) return 'SPLIT'
  return null
}

function extractHp(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*HP\b/i)
  return m ? parseFloat(m[1]) : null
}

function extractTr(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:TR|TONS?)\b/i)
  return m ? parseFloat(m[1]) : null
}

/** Free-text blob combining every field that might carry unit-type/HP/TR info, for the regex
 *  matchers above — mirrors how brandCapacity/parseBrandOnly already reads the same ticket. */
function ticketCapacityText(ticket: Ticket): string {
  const meta = parseAcMeta(ticket) as Record<string, any>
  const detail = Array.isArray(meta?.details) ? meta.details[0] : null
  return [
    meta?.unitType,
    ticket.unitType,
    ticket.unit_type,
    detail?.hp,
    ticket.acDetails,
    ticket.ac_details,
  ].filter(Boolean).join(' ')
}

/** Best-guess match among `candidates` (already narrowed to install-tier or general-cleaning
 *  rows) for this ticket's unit — null when the mount type or capacity can't be read confidently. */
function matchRateLineItem(ticket: Ticket, candidates: RateLineItem[]): RateLineItem | null {
  const text = ticketCapacityText(ticket)
  const mount = detectMountCategory(text)
  if (!mount) return null
  const hp = extractHp(text)
  const tr = extractTr(text)
  return candidates.find((item) => {
    if (!item.match || item.match.mount !== mount) return false
    if (item.match.tr != null) return tr === item.match.tr
    if (item.match.hpMin != null) return hp != null && hp >= item.match.hpMin && hp <= (item.match.hpMax ?? item.match.hpMin)
    return true
  }) ?? null
}

// ── Job classification ──────────────────────────────────────────────────────

type JobRateKind = 'install' | 'cleaning' | 'survey' | 'rescheduled'

/** The rate kind to price by — separate from the display label below. */
function classifyJobRateKey(ticket: Ticket): JobRateKind | null {
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
function classifyJob(ticket: Ticket): { label: string; rateKey: JobRateKind | null } {
  return { label: getScheduleStatusDisplay(ticket), rateKey: classifyJobRateKey(ticket) }
}

/** Fee for a synced row: install/cleaning are tiered + auto-matched against the ticket's own
 *  unit data (see matchRateLineItem); survey/rescheduled stay flat per-branch rates. */
function computeInstallationFee(ticket: Ticket, rateKey: JobRateKind, rates: PayrollRates): number {
  if (rateKey === 'survey') return rates.survey
  if (rateKey === 'rescheduled') return rates.rescheduled
  const candidates = STANDARD_RATE_TABLE.filter((item) => item.autoDetectFor === rateKey)
  const match = matchRateLineItem(ticket, candidates)
  return match ? effectiveRate(match.key, rates.lineItemOverrides) : 0
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
  const installationFee = rateKey ? computeInstallationFee(ticket, rateKey, rates) : 0

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
    status: 'PENDING',
    customFields: {},
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

/** Dedupe by ticketId+installerName so re-syncing never duplicates rows or clobbers hand edits,
 *  while automatically backfilling missing ticket numbers on previously saved rows. */
export function deduplicateAndMergePayroll(existing: PayrollRow[], incoming: PayrollRow[]): PayrollRow[] {
  const nonEmpty = existing.filter(
    (row) => row.customerName.trim() || row.installerName.trim() || row.amountCollected.trim() || row.installationFee.trim(),
  )

  const incomingMap = new Map<string, PayrollRow>()
  for (const row of incoming) {
    const key = row.ticketId
      ? `tk:${row.ticketId}|${row.installerName.trim().toLowerCase()}`
      : `manual:${row.id}`
    incomingMap.set(key, row)
  }

  // Update existing saved rows with fresh ticket metadata (like ticketNumber) if previously blank
  const updatedExisting = nonEmpty.map((row) => {
    const key = row.ticketId
      ? `tk:${row.ticketId}|${row.installerName.trim().toLowerCase()}`
      : `manual:${row.id}`
    const fresh = incomingMap.get(key)
    if (fresh) {
      return {
        ...row,
        ticketNumber: row.ticketNumber?.trim() || fresh.ticketNumber || '',
        workDate: row.workDate || fresh.workDate || '',
        customerName: row.customerName || fresh.customerName || '',
        cityAddress: row.cityAddress || fresh.cityAddress || '',
        brandCapacity: row.brandCapacity || fresh.brandCapacity || '',
      }
    }
    return row
  })

  const existingKeys = new Set<string>()
  for (const row of updatedExisting) {
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

  return [...updatedExisting, ...deduped]
}
