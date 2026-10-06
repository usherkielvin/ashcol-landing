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
import { CLOSING_SCHEDULE_STATUSES } from './scheduleStatus'

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
  /** The ticket's own remarks, carried only so the one-time clear can recognise old auto-filled text. Never saved. */
  ticketRemarks?: string
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

// Negotiation/Quotation close out a sales conversation, not a job order a crew performs.
// Survey is NOT excluded: a done survey earns the branch's flat Survey fee (₱100 default, see
// PayrollRates.survey), so it shows up as a payroll job row.
const NON_INSTALLER_CLOSINGS = new Set(['DONE_NEGOTIATION', 'DONE_QUOTATION'])

/** Every job order an installer actually finished — install and cleaning, plus checkups,
 *  services, backjobs, mounting, dismantling, relocation, reprocess. Service branches
 *  run mostly non-install work, so limiting payroll to installs left their crews looking idle. */
function isCompletedInstallerJob(ticket: Ticket): boolean {
  const rateKey = classifyJobRateKey(ticket)
  if (rateKey === 'install' || rateKey === 'cleaning') return true
  const status = getScheduleStatusValue(ticket)
  return CLOSING_SCHEDULE_STATUSES.has(status) && !NON_INSTALLER_CLOSINGS.has(status)
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
  // Only an explicit collection/downpayment mode on the ticket pre-marks the row unpaid; staff set the rest.
  const payMode = payment.mode.toUpperCase()
  const payStatus: PaymentStatus | '' = payMode.includes('COLLECTION') ? 'FOR_COLLECTION' : payMode.includes('DOWN') ? 'DOWNPAYMENT' : ''

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
    // Payroll's own per-ticket note: starts blank and is typed by payroll — never pulled from the ticket's remarks.
    remarks: '',
    ticketRemarks: (ticket.remarksUpdate || ticket.remarks || '').trim(),
    audited: '',
    status: 'PENDING',
    customFields: (payStatus ? { 'pay:status': payStatus } : {}) as Record<string, string>,
  }))
}

/** customFields flag marking a row's auto-stamped fee (Allowance / Earth Grounding) as hand-edited,
 *  e.g. "manual:dailyAllowance" = "1". Flagged fields keep the user's value on every re-sync;
 *  unflagged ones follow the branch's Payroll Settings rate. Not a fee — skip when summing. */
export const MANUAL_FEE_PREFIX = 'manual:'
export type AutoStampedFee = 'dailyAllowance' | 'earthGrounding' | 'installationFee'
const isManualFee = (row: PayrollRow, field: AutoStampedFee) =>
  row.customFields?.[MANUAL_FEE_PREFIX + field] === '1'

/** Stamps Daily Allowance once per (installer, workDate) — onto that day's first row only.
 *  A zero rate stamps blank rather than "0" so the column reads empty, not ₱0.00. */
export function applyDailyAllowance(rows: PayrollRow[], rates: PayrollRates): PayrollRow[] {
  const seen = new Set<string>()
  const allowance = rates.dailyAllowance > 0 ? String(rates.dailyAllowance) : ''
  const grounding = rates.earthGrounding > 0 ? String(rates.earthGrounding) : ''
  return rows.map((row) => {
    if (!row.workDate) return row
    const key = `${row.installerName}|${row.workDate}`
    if (seen.has(key)) return row
    seen.add(key)
    return { ...row, dailyAllowance: allowance, earthGrounding: grounding }
  })
}

// ── Fetch + orchestrate ─────────────────────────────────────────────────────

const REMARKS_CHECKED_KEY = 'installer:remarksChecked'
const normRemark = (t: string | undefined) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Payroll's per-ticket Remarks used to be auto-filled from the ticket. Each saved row is checked once: if its
 * remark is exactly the ticket's remarks it is cleared, then the row is stamped so anything payroll types later
 * (even the same words) is kept.
 */
const clearOldAutoFilledRemarks = (row: PayrollRow, fresh: PayrollRow): Pick<PayrollRow, 'remarks' | 'customFields'> => {
  if (row.customFields?.[REMARKS_CHECKED_KEY] === '1') return { remarks: row.remarks || '', customFields: row.customFields }
  const remarks = row.remarks && normRemark(row.remarks) === normRemark(fresh.ticketRemarks) ? '' : (row.remarks || '')
  return { remarks, customFields: { ...(row.customFields || {}), [REMARKS_CHECKED_KEY]: '1' } }
}

export async function fetchAndMapPayroll(
  branchId: string,
  monthKey: string,
  branchName: string,
  rates: PayrollRates,
): Promise<PayrollPrefillResult> {
  try {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    if (!token) return { ok: false, error: 'auth_missing' }

    // The month match is broad (any ticket with any date key in the month — including
    // reschedule/ghost history), so a busy branch-month can exceed the default 5-page cap;
    // pages come back newest-first, so hitting the cap would silently drop part of the month.
    const list = await fetchTicketsPage('/tickets/branch', token, {
      month: monthKey,
      branchId,
      paginate: true,
      size: 200,
      maxPages: 20,
    })

    const tickets = (list as Ticket[]).filter((t) => (t.status || '').toUpperCase() !== 'CANCELLED')

    let rows: PayrollRow[] = []
    for (const ticket of tickets) {
      // Only pull completed job orders into payroll — skip pending, rescheduled, for-approval, etc.
      if (!isCompletedInstallerJob(ticket)) continue
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

export function normalizeInstallerName(name: string): string {
  const upper = (name || '').trim().toUpperCase()
  if (upper === 'JUSTINE' || upper === 'JUSTINE ROI' || upper === 'JUSTINE BIEN' || upper === 'JUSTINE ROI BIEN') {
    return 'JUSTIN ROI BIEN'
  }
  return (name || '').trim()
}

/** Dedupe by ticketId+installerName so re-syncing never duplicates rows or clobbers hand edits,
 *  while automatically backfilling missing ticket numbers on previously saved rows. */
export function deduplicateAndMergePayroll(existing: PayrollRow[], incoming: PayrollRow[]): PayrollRow[] {
  const nonEmpty = existing.filter(
    (row) => row.customerName.trim() || row.installerName.trim() || row.amountCollected.trim() || row.installationFee.trim(),
  )

  const makeRowKey = (row: PayrollRow) => {
    const inst = normalizeInstallerName(row.installerName).toLowerCase()
    return row.ticketId ? `tk:${row.ticketId}|${inst}` : `manual:${row.id}`
  }

  const incomingMap = new Map<string, PayrollRow>()
  for (const row of incoming) {
    incomingMap.set(makeRowKey(row), row)
  }

  // Update existing saved rows with fresh ticket metadata and missing details/fees
  const updatedExisting = nonEmpty.map((row) => {
    const key = makeRowKey(row)
    const fresh = incomingMap.get(key)
    if (fresh) {
      const isFreshDone = /^DONE\b/i.test(fresh.installationUpload?.trim() || '')
      const isRowDone = /^DONE\b/i.test(row.installationUpload?.trim() || '')
      const rowInstallFeeNum = parseFloat(String(row.installationFee || '').replace(/[^0-9.-]/g, '')) || 0
      const freshInstallFeeNum = parseFloat(String(fresh.installationFee || '').replace(/[^0-9.-]/g, '')) || 0
      return {
        ...row,
        installerName: normalizeInstallerName(row.installerName || fresh.installerName || ''),
        ticketNumber: row.ticketNumber?.trim() || fresh.ticketNumber || '',
        workDate: row.workDate || fresh.workDate || '',
        customerName: row.customerName || fresh.customerName || '',
        cityAddress: row.cityAddress || fresh.cityAddress || '',
        brandCapacity: row.brandCapacity || fresh.brandCapacity || '',
        installationUpload: (!isRowDone && isFreshDone) ? fresh.installationUpload : (row.installationUpload || fresh.installationUpload || ''),
        // A hand-edited fee (survey, or cleared to zero) is kept as typed; otherwise a blank/zero fee follows the ticket's rate.
        installationFee: isManualFee(row, 'installationFee') ? row.installationFee : rowInstallFeeNum > 0 ? row.installationFee : (freshInstallFeeNum > 0 ? fresh.installationFee : (row.installationFee || '')),
        // Auto-stamped from the branch rate: follow the current rate (so a Payroll Settings change,
        // including to zero, reaches existing rows) unless the user edited this row's value by hand.
        dailyAllowance: isManualFee(row, 'dailyAllowance') ? row.dailyAllowance : fresh.dailyAllowance,
        earthGrounding: isManualFee(row, 'earthGrounding') ? row.earthGrounding : fresh.earthGrounding,
        actualCollected: row.actualCollected?.trim() ? row.actualCollected : (fresh.actualCollected || ''),
        amountCollected: row.amountCollected?.trim() ? row.amountCollected : (fresh.amountCollected || ''),
        sifQuotation: row.sifQuotation?.trim() ? row.sifQuotation : (fresh.sifQuotation || ''),
        // Whatever payroll saved stays as saved (including blank); a sync never fills it from the ticket.
        // One time per row, text identical to the ticket's own remarks is the OLD auto-fill, so it is cleared.
        ...clearOldAutoFilledRemarks(row, fresh),
      }
    }
    return {
      ...row,
      installerName: normalizeInstallerName(row.installerName),
    }
  })

  const existingKeys = new Set<string>()
  for (const row of updatedExisting) {
    existingKeys.add(makeRowKey(row))
  }

  const deduped: PayrollRow[] = []
  for (const row of incoming) {
    const key = makeRowKey(row)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    deduped.push({
      ...row,
      installerName: normalizeInstallerName(row.installerName),
    })
  }

  return [...updatedExisting, ...deduped]
}

// ── Saved entries + totals ───────────────────────────────────────────────────
// Shared by the Payroll page and the week summary so both compute an installer's pay the same way.

const toNum = (v: number | string | null | undefined): number => {
  if (v == null) return 0
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const cleaned = String(v).replace(/[^0-9.-]/g, '')
  if (!cleaned) return 0
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}
const moneyStr = (v: unknown) => (v != null ? String(v) : '')

/** Maps a raw /v1/payroll entry (fees as numbers, customFields as a JSON string) to a PayrollRow. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSavedPayrollEntry(e: any): PayrollRow {
  const row: PayrollRow = {
    id: e.id || uid(),
    ticketId: e.ticketId || undefined,
    ticketNumber: e.ticketNumber || '',
    installerName: normalizeInstallerName(e.installerName || ''),
    workDate: e.workDate || '',
    customerName: e.customerName || '',
    cityAddress: e.cityAddress || '',
    brandCapacity: e.brandCapacity || '',
    sifQuotation: e.sifQuotation || '',
    totalPipeLength: e.totalPipeLength || '',
    amountCollected: moneyStr(e.amountCollected),
    actualCollected: e.actualCollected || '',
    installationUpload: e.installationUpload || '',
    installationFee: moneyStr(e.installationFee),
    earthGrounding: moneyStr(e.earthGrounding),
    dailyAllowance: moneyStr(e.dailyAllowance),
    excessCopperTube: moneyStr(e.excessCopperTube),
    hauling: moneyStr(e.hauling),
    dismantling: moneyStr(e.dismantling),
    electricalWorks: moneyStr(e.electricalWorks),
    chippingWorks: moneyStr(e.chippingWorks),
    breaker: moneyStr(e.breaker),
    powerSupplyLaborOnly: moneyStr(e.powerSupplyLaborOnly),
    powerSupplyLaborMaterials: moneyStr(e.powerSupplyLaborMaterials),
    specialBracketCatwalk: moneyStr(e.specialBracketCatwalk),
    specialBracketWelding: moneyStr(e.specialBracketWelding),
    excessCopperTubeLaborOnly: moneyStr(e.excessCopperTubeLaborOnly),
    relocationAccuFcu: moneyStr(e.relocationAccuFcu),
    systemReprocessLabor: moneyStr(e.systemReprocessLabor),
    drainPumpInstallation: moneyStr(e.drainPumpInstallation),
    scaffoldingInstallation: moneyStr(e.scaffoldingInstallation),
    flushingOldPipe: moneyStr(e.flushingOldPipe),
    sterneBracket: moneyStr(e.sterneBracket),
    breakerInstallationLabor: moneyStr(e.breakerInstallationLabor),
    chargingOfFreon: moneyStr(e.chargingOfFreon),
    materialsReturn: e.materialsReturn || '',
    installationChecklist: e.installationChecklist || '',
    videoUpload: e.videoUpload || '',
    remarks: e.remarks || '',
    audited: e.audited || '',
    status: e.status || 'PENDING',
    customFields: (() => {
      if (e.customFields && typeof e.customFields === 'object') return e.customFields
      try { return e.customFields ? JSON.parse(e.customFields) : {} } catch { return {} }
    })(),
  }
  return restoreTextFields(row)
}

/** materialsReturn is a numeric column server-side, but staff type notes into it ("2pcs wire").
 *  The typed text rides in customFields under this key and wins over the numeric value on load. */
export const TEXT_FIELD_PREFIX = 'txt:'
export const MATERIALS_RETURN_TEXT_KEY = TEXT_FIELD_PREFIX + 'materialsReturn'
const restoreTextFields = (row: PayrollRow): PayrollRow => {
  const text = row.customFields?.[MATERIALS_RETURN_TEXT_KEY]
  if (text == null) return row
  const { [MATERIALS_RETURN_TEXT_KEY]: _omit, ...rest } = row.customFields
  void _omit
  return { ...row, materialsReturn: text, customFields: rest }
}
/** customFields to persist for a row: re-adds the materialsReturn note only when it isn't a plain number. */
export const customFieldsForSave = (r: PayrollRow): Record<string, string> => {
  const { [MATERIALS_RETURN_TEXT_KEY]: _omit, ...rest } = r.customFields || {}
  void _omit
  const mr = String(r.materialsReturn ?? '').trim()
  if (mr && !/^-?[\d,]*\.?\d*$/.test(mr)) rest[MATERIALS_RETURN_TEXT_KEY] = mr
  return rest
}

// Per-installer deductions ride along in each row's customFields under reserved "ded:" keys.
export const LATE_RATE_PER_MINUTE = 1.6
export const UNIFORM_PRICE_PER_PC = 850
export type DeductionKey =
  | 'lateMinutes' | 'loan' | 'loanBalance' | 'incompleteUpload' | 'losses' | 'remitPenalty' | 'uniform' | 'uniformBalance' | 'grooming' | 'backjob'
export const DEDUCTION_PREFIX = 'ded:'
// Balances are a snapshot (latest wins); every other key is an amount that adds up.
export const BALANCE_DEDUCTION_KEYS = new Set<DeductionKey>(['loanBalance', 'uniformBalance'])

// Hold & release (carry-over) state rides along in customFields under reserved "hold:" keys —
// same pattern as "ded:" deductions and "manual:" fee flags. See docs/payroll-hold-release-plan.md.
export const HOLD_PREFIX = 'hold:'
/** On hold in its own week — excluded from that week's totals, shown in the branch's Held Tickets view. */
export const isHeldRow = (r: PayrollRow): boolean => r.customFields?.['hold:state'] === 'held'
/** The original row after its hold was released — the payout now lives on its carry-over copy instead. */
export const isReleasedOrig = (r: PayrollRow): boolean => r.customFields?.['hold:state'] === 'released'
/** A carry-over copy landed in a later (target) week's month by a release. */
export const isCarryOver = (r: PayrollRow): boolean => r.customFields?.['hold:carryOver'] === '1'
/** Counts toward its own week's totals: not held, not a released original (its copy counts instead). */
export const isActivePayRow = (r: PayrollRow): boolean => !isHeldRow(r) && !isReleasedOrig(r)

export const customFieldsFeeTotal = (r: PayrollRow): number => {
  if (!r.customFields) return 0
  let sum = 0
  for (const [k, v] of Object.entries(r.customFields)) {
    if (k.startsWith(DEDUCTION_PREFIX) || k.startsWith('xfer:') || k.startsWith(MANUAL_FEE_PREFIX) || k.startsWith(HOLD_PREFIX) || k.startsWith(TEXT_FIELD_PREFIX) || k.startsWith(PAY_PREFIX) || k.startsWith('installer:')) continue
    sum += toNum(v)
  }
  return sum
}

// Ticket payment status — a ticket the customer hasn't fully paid yet pays the tech only 50%; the
// other 50% is a pending balance released into an open week once the ticket is paid and closed.
// A row with no status is treated as fully paid, so every pre-existing payout is unchanged.
export const PAY_PREFIX = 'pay:'
export type PaymentStatus = 'PAID' | 'DOWNPAYMENT' | 'FOR_COLLECTION' | 'PENDING'
export const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'PAID', label: 'PAID' },
  { value: 'DOWNPAYMENT', label: 'DOWNPAYMENT' },
  { value: 'FOR_COLLECTION', label: 'FOR COLLECTION' },
  { value: 'PENDING', label: 'PENDING' },
]
export const paymentStatusOf = (r: PayrollRow): PaymentStatus => {
  const v = r.customFields?.['pay:status']
  return v === 'DOWNPAYMENT' || v === 'FOR_COLLECTION' || v === 'PENDING' ? v : 'PAID'
}
export const paymentStatusLabel = (r: PayrollRow): string =>
  PAYMENT_STATUS_OPTIONS.find(o => o.value === paymentStatusOf(r))?.label ?? 'PAID'
/** Share of the row's fees this week owes the tech: a carry-over balance copy carries its own
 *  factor; an unpaid ticket (or one already split when its week closed) pays 50%. */
export const payFactor = (r: PayrollRow): number => {
  const explicit = parseFloat(r.customFields?.['pay:factor'] || '')
  if (!isNaN(explicit)) return explicit
  if (paymentStatusOf(r) !== 'PAID' || r.customFields?.['pay:split'] === '1') return 0.5
  return 1
}
/** The withheld half of a split ticket is still owed and hasn't been released to any week yet. */
export const hasPendingBalance = (r: PayrollRow): boolean =>
  !isCarryOver(r) && isActivePayRow(r) && r.customFields?.['pay:balanceReleased'] !== '1' && payFactor(r) === 0.5

/** Mirrors the sheet's "PAYROLL DUE" — every fee-type column (shown or hidden) plus custom columns,
 *  scaled by payFactor (50% while the ticket isn't fully paid). */
export const rowTotal = (r: PayrollRow): number => {
  const raw = toNum(r.installationFee) + toNum(r.earthGrounding) + toNum(r.dailyAllowance)
    + toNum(r.excessCopperTube) + toNum(r.hauling) + toNum(r.dismantling) + toNum(r.electricalWorks)
    + toNum(r.chippingWorks) + toNum(r.breaker) + toNum(r.powerSupplyLaborOnly) + toNum(r.powerSupplyLaborMaterials)
    + toNum(r.specialBracketCatwalk) + toNum(r.specialBracketWelding) + toNum(r.excessCopperTubeLaborOnly)
    + toNum(r.relocationAccuFcu) + toNum(r.systemReprocessLabor) + toNum(r.drainPumpInstallation)
    + toNum(r.scaffoldingInstallation) + toNum(r.flushingOldPipe) + toNum(r.sterneBracket)
    + toNum(r.breakerInstallationLabor) + toNum(r.chargingOfFreon)
    + customFieldsFeeTotal(r)
  const factor = payFactor(r)
  return factor === 1 ? raw : Math.round(raw * factor * 100) / 100
}

export const installerTotal = (installerRows: PayrollRow[]) =>
  installerRows.reduce((sum, r) => sum + rowTotal(r), 0)

// ── Daily pay items ─────────────────────────────────────────────────────────
// Allowance and Driving are paid per DAY worked, not per ticket (allowance is stamped on a day's first ticket;
// driving is a custom column such as "Driving 500 Day"). The shared payout page shows them once in its summary
// ("Driving · 5 days × ₱500") instead of inside each ticket, so a ticket's own total leaves them out.
// Held and carry-over tickets are not days worked this week, so they keep everything on the ticket.

export interface DailyItem {
  key: string
  label: string
  /** Distinct work dates that carry this item. */
  days: number
  /** The per-day amount when every day is the same, otherwise null. */
  rate: number | null
  /** What it adds to the payout: Σ amount × the ticket's payFactor, so a 50%-paid ticket counts 50%. */
  amount: number
}

const DAILY_ALLOWANCE_KEY = 'dailyAllowance'
const isDrivingKey = (k: string) => /driving/i.test(k) && !/^(ded|txt|pay|hold|xfer|manual|installer):/.test(k)
const dailyLabel = (key: string) =>
  key === DAILY_ALLOWANCE_KEY
    ? 'Allowance'
    : key.replace(/^custom_/i, '').replace(/_/g, ' ').trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())

/** True for the customFields / row keys that are paid per day (Allowance, any "driving" column). */
export const isDailyPayKey = (key: string) => key === DAILY_ALLOWANCE_KEY || isDrivingKey(key)

/** False for held and carry-over tickets, which keep their allowance / driving on the ticket itself. */
export const movesDailyItemsToSummary = (r: PayrollRow) => !isCarryOver(r) && isActivePayRow(r)

/** The day-based amounts a single ticket carries (before payFactor), empty for held / carry-over tickets. */
const dailyAmountsOf = (r: PayrollRow): { key: string; value: number }[] => {
  if (isCarryOver(r) || !isActivePayRow(r)) return []
  const out: { key: string; value: number }[] = []
  const allowance = toNum(r.dailyAllowance)
  if (allowance !== 0) out.push({ key: DAILY_ALLOWANCE_KEY, value: allowance })
  for (const [k, v] of Object.entries(r.customFields || {})) {
    if (!isDrivingKey(k)) continue
    const n = toNum(v)
    if (n !== 0) out.push({ key: k, value: n })
  }
  return out
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Day-based items across an installer's tickets, one entry per item (Allowance first, then each driving column). */
export const dailyItems = (rows: PayrollRow[]): DailyItem[] => {
  const byKey = new Map<string, { dates: Set<string>; values: number[]; amount: number }>()
  rows.forEach((r, i) => {
    for (const { key, value } of dailyAmountsOf(r)) {
      const e = byKey.get(key) ?? { dates: new Set<string>(), values: [], amount: 0 }
      // A ticket with no date still counts as its own day rather than vanishing.
      e.dates.add(r.workDate || `undated-${i}`)
      e.values.push(value)
      e.amount += value * payFactor(r)
      byKey.set(key, e)
    }
  })
  const items: DailyItem[] = Array.from(byKey, ([key, e]) => ({
    key,
    label: dailyLabel(key),
    days: e.dates.size,
    rate: e.values.every(v => v === e.values[0]) ? e.values[0] : null,
    amount: round2(e.amount),
  }))
  return items.sort((a, b) => (a.key === DAILY_ALLOWANCE_KEY ? -1 : b.key === DAILY_ALLOWANCE_KEY ? 1 : a.label.localeCompare(b.label)))
}

/** A ticket's own total: everything on it except its day-based items (same payFactor scaling as rowTotal). */
export const ticketTotal = (r: PayrollRow): number => {
  const factor = payFactor(r)
  const daily = dailyAmountsOf(r).reduce((sum, d) => sum + d.value, 0)
  return round2(rowTotal(r) - daily * factor)
}

export const rawDeduction = (r: PayrollRow, key: DeductionKey) => r.customFields?.[DEDUCTION_PREFIX + key] || ''
/** Amounts sum across every row in range (each week's value sits on that week's first job);
 *  balances take the latest row that has one. */
export const deductionValue = (rowsIn: PayrollRow[], key: DeductionKey): number => {
  if (BALANCE_DEDUCTION_KEYS.has(key)) {
    for (let i = rowsIn.length - 1; i >= 0; i--) {
      const v = rawDeduction(rowsIn[i], key)
      if (v) return toNum(v)
    }
    return 0
  }
  return rowsIn.reduce((sum, r) => sum + toNum(rawDeduction(r, key)), 0)
}
export const lateDeduction = (rowsIn: PayrollRow[]) => deductionValue(rowsIn, 'lateMinutes') * LATE_RATE_PER_MINUTE
export const deductionTotal = (rowsIn: PayrollRow[]) =>
  lateDeduction(rowsIn) + deductionValue(rowsIn, 'loan') + deductionValue(rowsIn, 'incompleteUpload')
  + deductionValue(rowsIn, 'losses') + deductionValue(rowsIn, 'remitPenalty') + deductionValue(rowsIn, 'uniform')
  + deductionValue(rowsIn, 'grooming') + deductionValue(rowsIn, 'backjob')
export const installerNet = (installerRows: PayrollRow[]) => installerTotal(installerRows) - deductionTotal(installerRows)

// Balance adjustments on a closed week's ticket: the closed row stays frozen; each correction is
// posted as a separate adjustment row in an open week and logged here (JSON in customFields
// "pay:adjLog") so the ticket carries its own correction history — who, when, which columns.
export interface AdjustmentChange { key: string; label: string; from: number; to: number; delta: number }
export interface AdjustmentLogEntry {
  id: string
  at: string
  by: string
  reason: string
  targetWeekFrom: string
  targetWeekTo: string
  net: number
  changes: AdjustmentChange[]
}
export const parseAdjustmentLog = (r: PayrollRow): AdjustmentLogEntry[] => {
  try {
    const parsed = JSON.parse(r.customFields?.['pay:adjLog'] || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}
