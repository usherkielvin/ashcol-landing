import { rowTotal, payFactor, isCarryOver, isActivePayRow, normalizeInstallerName, type PayrollRow } from '../../utils/payrollDerive'
import { parseCorrectionChanges, type PayrollCorrection } from '../../utils/payrollCorrectionsApi'


export const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const cleaned = String(v).replace(/[^0-9.-]/g, '')
  if (!cleaned) return 0
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

export const peso = (v: number | string | null | undefined) => {
  const n = num(v)
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
export const pesoSigned = (n: number) => `${n < 0 ? '−' : ''}₱${peso(Math.abs(n))}`
export const shortDate = (ymd: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
export const longDate = (ymd: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
export const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
// Display-only formatting — the underlying name stays ALL-CAPS everywhere it's used as a
// key/lookup (grouping, aliasing, avatar color hashing); this just softens how it reads on screen.
export const titleCase = (name: string) =>
  name.trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
// A handful of deterministic flat colors so each installer's avatar reads as a distinct
// person at a glance, without storing per-user color state anywhere.
export const AVATAR_COLORS: string[] = ['#10B981', '#F59E0B', '#8B5CF6', '#0EA5E9', '#84CC16', '#F97316', '#EC4899', '#06B6D4']
export const avatarColor = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// Legacy date helpers removed — week logic now lives in payrollWeeks.ts

const round2 = (n: number) => Math.round(n * 100) / 100

/** Posted corrections that belong to this ticket row. Matched by the saved row id, falling back to the
 *  ticket + installer when the row was rebuilt from a schedule sync under a different id. */
export const postedCorrectionsFor = (r: PayrollRow, all: PayrollCorrection[]): PayrollCorrection[] =>
  all.filter(c => c.status === 'POSTED' && (
    c.originEntryId === r.id
    || (Boolean(r.ticketId) && c.originTicketId === r.ticketId && c.installerName.trim().toLowerCase() === r.installerName.trim().toLowerCase())
  ))

/** What was actually released for one column of a ticket: the cell value scaled by the share paid
 *  (50% until the balance is released), plus every correction already posted on that column. */
export const paidColumnAmount = (r: PayrollRow, key: string, raw: number | string | null | undefined, posted: PayrollCorrection[]): number => {
  const factor = r.customFields?.['pay:balanceReleased'] === '1' ? 1 : payFactor(r)
  const adjusted = posted.reduce(
    (sum, c) => sum + parseCorrectionChanges(c).filter(ch => ch.key === key).reduce((a, ch) => a + ch.delta, 0), 0)
  return round2(num(raw) * factor + adjusted)
}

export const rowAddOns =(r: PayrollRow): number => Math.max(0, rowTotal(r) - num(r.installationFee) * payFactor(r))

// A job counts once its schedule status is a DONE outcome — install, cleaning, checkup, service,
// etc. — so service branches (mostly cleanings) don't read as zero work. installerRows is already
// scoped to the active date-range filter, so this is automatically "within the selected range" too.
export const isCompletedRow = (r: PayrollRow) => /^DONE\b/i.test(r.installationUpload.trim())
// Carry-over copies are a payout landing in this week, not a job actually done in it — they'd
// otherwise double-count (or mis-attribute) completed-job stats against the copy's own workDate.
export const completedJobsCount = (installerRows: PayrollRow[]) => installerRows.filter(r => !isCarryOver(r) && isCompletedRow(r)).length
/** "2 Cleaning · 1 Install" — what kind of work those completed jobs were, most frequent first. */
export const completedJobsBreakdown = (installerRows: PayrollRow[]) => {
  const counts = new Map<string, number>()
  for (const r of installerRows) {
    if (isCarryOver(r) || !isCompletedRow(r)) continue
    const kind = titleCase(r.installationUpload.trim().replace(/^DONE\s*/i, '')) || 'Job'
    counts.set(kind, (counts.get(kind) || 0) + 1)
  }
  return Array.from(counts).sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${n} ${kind}`).join(' · ')
}

// Money owed BACK to the branch — parses the free-text remit field ("2,000 CASH", "FREE")
// down to its numeric amount, ignoring the payment-method text.
export const parseMoneyText = (s: string | number | null | undefined) => num(s)
export const remittanceTotal = (rowsIn: PayrollRow[]) => rowsIn.reduce((sum, r) => sum + parseMoneyText(r.actualCollected), 0)
// A carry-over's full payout counts as Add-ons (Add-ons = gross − base), never Base Install.
export const baseInstallTotal = (rowsIn: PayrollRow[]) => rowsIn.reduce((sum, r) => sum + (isCarryOver(r) ? 0 : num(r.installationFee) * payFactor(r)), 0)



export type ColumnKey =
  | 'date' | 'ticketNumber' | 'customerName' | 'brandCapacity' | 'remit'
  | 'installationUpload' | 'paymentStatus' | 'installationFee' | 'totalPipeLength' | 'earthGrounding' | 'dailyAllowance'
  | 'excessCopperTube' | 'hauling' | 'dismantling' | 'electricalWorks' | 'chippingWorks' | 'breaker'
  | 'powerSupplyLaborOnly' | 'powerSupplyLaborMaterials' | 'specialBracketCatwalk' | 'specialBracketWelding'
  | 'excessCopperTubeLaborOnly' | 'relocationAccuFcu' | 'systemReprocessLabor' | 'drainPumpInstallation'
  | 'scaffoldingInstallation' | 'flushingOldPipe' | 'sterneBracket' | 'breakerInstallationLabor'
  | 'chargingOfFreon' | 'materialsReturn' | 'installationChecklist' | 'videoUpload' | 'remarks' | 'audited'

export type ColumnCategory = 'standard' | 'piping' | 'electrical' | 'structural' | 'masonry' | 'admin'

export const CATEGORY_META: Record<ColumnCategory, { label: string }> = {
  standard: { label: 'Standard Add-ons' },
  piping: { label: 'Piping & Copper' },
  electrical: { label: 'Electrical & Power' },
  structural: { label: 'Structural Work' },
  masonry: { label: 'Masonry & Labor' },
  admin: { label: 'Admin & Notes' },
}

export interface ColumnDef {
  // Widened to `string` (not just ColumnKey) so branch-created custom columns — which have no
  // fixed field on PayrollRow, just a generated key into row.customFields — can be described
  // with this same shape. See CustomColumnDef/customColumnDefs below.
  key: string
  label: string
  width: number
  align: 'left' | 'right'
  /** Always shown, no toggle in the column manager — the identifying/core columns. */
  pinned?: boolean
  /** Group shown under in the column manager. Omitted for pinned columns. */
  category?: ColumnCategory
  /** Comma-thousands formatted via NumericFormat instead of a plain text input. */
  isMoney?: boolean
  /** Read-only once the row is synced from a schedule ticket (row.ticketId set) — corrected
   *  at the source instead of here. Manually added rows (no ticketId) stay editable. */
  readOnlyWhenSynced?: boolean
}

// Column order + widths. Any non-pinned column can be hidden via the column manager (the
// options button beside each installer's name) — rows have no delete control of their own,
// so this is the only per-column control surface. This mirrors the branch's real payroll
// worksheet ("Standard Rates of Installer Payroll"), which has ~24 possible fee/misc columns
// per job — most blank for any given job. Everything past Daily Allowance is hidden by
// default (see DEFAULT_HIDDEN_COLUMNS) so staff unhide only what that sheet actually needs.
export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'date', label: 'Date', width: 128, align: 'left', pinned: true, readOnlyWhenSynced: true },
  { key: 'ticketNumber', label: 'Ticket', width: 110, align: 'left', pinned: true, readOnlyWhenSynced: true },
  { key: 'customerName', label: 'Customer', width: 220, align: 'left', pinned: true, readOnlyWhenSynced: true },
  { key: 'brandCapacity', label: 'Brand', width: 150, align: 'left', pinned: true },
  { key: 'remit', label: 'Remit', width: 120, align: 'right', pinned: true },
  { key: 'installationUpload', label: 'Status', width: 130, align: 'left', pinned: true, readOnlyWhenSynced: true },
  { key: 'paymentStatus', label: 'Payment', width: 130, align: 'left', pinned: true },
  { key: 'installationFee', label: 'Install Fee', width: 100, align: 'right', pinned: true, isMoney: true },
  { key: 'totalPipeLength', label: 'Pipe Length', width: 90, align: 'right', category: 'standard' },
  { key: 'earthGrounding', label: 'Earth Grounding', width: 100, align: 'right', category: 'standard', isMoney: true },
  { key: 'dailyAllowance', label: 'Allowance', width: 100, align: 'right', category: 'standard', isMoney: true },
  { key: 'excessCopperTube', label: 'Excess Copper Tube', width: 110, align: 'right', category: 'piping', isMoney: true },
  { key: 'excessCopperTubeLaborOnly', label: 'Copper Tube Labor', width: 120, align: 'right', category: 'piping', isMoney: true },
  { key: 'flushingOldPipe', label: 'Flushing Old Pipe', width: 110, align: 'right', category: 'piping', isMoney: true },
  { key: 'electricalWorks', label: 'Electrical Works', width: 110, align: 'right', category: 'electrical', isMoney: true },
  { key: 'breaker', label: 'Breaker', width: 100, align: 'right', category: 'electrical', isMoney: true },
  { key: 'breakerInstallationLabor', label: 'Breaker Install Labor', width: 130, align: 'right', category: 'electrical', isMoney: true },
  { key: 'powerSupplyLaborOnly', label: 'Power Supply (Labor)', width: 120, align: 'right', category: 'electrical', isMoney: true },
  { key: 'powerSupplyLaborMaterials', label: 'Power Supply (L+M)', width: 120, align: 'right', category: 'electrical', isMoney: true },
  { key: 'chargingOfFreon', label: 'Charging of Freon', width: 110, align: 'right', category: 'electrical', isMoney: true },
  { key: 'hauling', label: 'Hauling', width: 100, align: 'right', category: 'structural', isMoney: true },
  { key: 'dismantling', label: 'Dismantling', width: 100, align: 'right', category: 'structural', isMoney: true },
  { key: 'chippingWorks', label: 'Chipping Works', width: 110, align: 'right', category: 'masonry', isMoney: true },
  { key: 'specialBracketCatwalk', label: 'Bracket w/ Catwalk', width: 120, align: 'right', category: 'structural', isMoney: true },
  { key: 'specialBracketWelding', label: 'Bracket Welding', width: 110, align: 'right', category: 'structural', isMoney: true },
  { key: 'sterneBracket', label: 'Sterne Bracket', width: 110, align: 'right', category: 'structural', isMoney: true },
  { key: 'scaffoldingInstallation', label: 'Scaffolding', width: 100, align: 'right', category: 'structural', isMoney: true },
  { key: 'drainPumpInstallation', label: 'Drain Pump', width: 100, align: 'right', category: 'structural', isMoney: true },
  { key: 'relocationAccuFcu', label: 'Relocation ACCU/FCU', width: 130, align: 'right', category: 'structural', isMoney: true },
  { key: 'systemReprocessLabor', label: 'System Reprocess', width: 120, align: 'right', category: 'structural', isMoney: true },
  // Free-text note of what was returned (e.g. "2pcs wire"), not a peso amount.
  { key: 'materialsReturn', label: 'Materials Return', width: 130, align: 'left', category: 'admin' },
  { key: 'installationChecklist', label: 'Install Checklist', width: 110, align: 'left', category: 'admin' },
  { key: 'videoUpload', label: 'Video Upload', width: 110, align: 'left', category: 'admin' },
  // Always trail the table, not part of the hide/show system — any unhidden column lands
  // between Install Fee and these two, never after them.
  { key: 'remarks', label: 'Remarks', width: 150, align: 'left', pinned: true },
  { key: 'audited', label: 'Audited', width: 90, align: 'left', pinned: true },
]

// Roster columns: Installer (completed-jobs count folded into its subtitle) | Payroll Amount |
// Payroll Status | Remarks. There's no action column — the whole row opens that installer's payroll.
/** customFields key of the roster's own Remarks note (per installer-week; not the ticket remarks). */
export const PAYOUT_NOTE_KEY = 'installer:payoutRemarks'
export const ROSTER_GRID_TEMPLATE = 'minmax(260px, 2fr) 160px 200px minmax(220px, 1.6fr)'

export const COLUMN_PRESETS: { label: string; cats: ColumnCategory[] }[] = [
  { label: 'Standard', cats: ['standard'] },
  { label: 'Electrical Heavy', cats: ['standard', 'electrical'] },
  { label: 'Structural Heavy', cats: ['standard', 'structural'] },
]

// "Standard Add-ons" and "Admin & Notes" (Materials Return, Install Checklist, Video Upload)
// show on first visit — every other fee category starts hidden since most are blank for any
// given installer/job (see COLUMN_DEFS comment above).
export const DEFAULT_HIDDEN_COLUMNS: ColumnKey[] = COLUMN_DEFS
  .filter(c => !c.pinned && c.category !== 'standard' && c.category !== 'admin')
  .map(c => c.key as ColumnKey)

export const HIDDEN_COLUMNS_KEY = 'ashcol-payroll-hidden-columns'
export const COLUMN_WIDTHS_KEY = 'ashcol-payroll-column-widths'
export const CUSTOM_COLUMNS_KEY = 'ashcol-payroll-custom-columns'
// Payroll keeps its own branch selection, independent of the app-wide branch switcher — once
// picked here it must survive a reload and only change when this page's dropdown is used.
export const PAYROLL_BRANCH_KEY = 'ashcol-payroll-branch-id'
export const PAYROLL_WEEK_KEY = (branchId: string) => `ashcol-payroll-week-${branchId}`
export const PAYROLL_LAST_SELECTION_KEY = 'ashcol-payroll-last-selection'
export const MIN_COLUMN_WIDTH = 70

export const normalizeSlug = (str: string) =>
  str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export const compactSlug = (str: string) =>
  str.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The date that decides which week a row belongs to: a carry-over / adjustment is paid in the week it was released
 *  into, everything else in the week it was worked. */
const weekDateOf = (r: PayrollRow): string =>
  isCarryOver(r) ? (r.customFields?.['hold:targetWeekFrom'] ?? '') : r.workDate

/** True if the row sits in a week that has been closed. A closed week is final: it is never changed or re-sent. */
export const isClosedWeekRow = (r: PayrollRow, closures: PayrollWeekClosure[], branchId: string): boolean => {
  const d = weekDateOf(r)
  return Boolean(d) && closures.some(c => c.branchId === branchId && d >= c.weekFrom && d <= c.weekTo)
}

const identityKey = (r: PayrollRow): string => r.ticketId
  ? `tk:${r.ticketId}|${r.installerName.trim().toLowerCase()}`
  : `nt:${(r.ticketNumber || '').trim().toLowerCase()}|${r.installerName.trim().toLowerCase()}|${r.workDate || ''}|${r.customFields?.['hold:copyMarker'] ?? ''}`

/**
 * After merging fresh Schedules data into a month, put every closed-week row back exactly as it was saved: a sync
 * must not re-stamp fees, change a status or add late rows to a week that is already paid. (Anything found wrong in
 * a closed week is fixed with a correction in an open week.) A row new to a closed week is not added.
 */
export const freezeClosedWeekRows = (merged: PayrollRow[], saved: PayrollRow[], closures: PayrollWeekClosure[], branchId: string): PayrollRow[] => {
  const savedByKey = new Map(saved.map(r => [identityKey(r), r]))
  const out: PayrollRow[] = []
  const kept = new Set<string>()
  for (const r of merged) {
    if (!isClosedWeekRow(r, closures, branchId)) { out.push(r); continue }
    const original = savedByKey.get(identityKey(r))
    if (original) { out.push(original); kept.add(identityKey(r)) }
  }
  // Never lose a saved closed row the merge happened to drop.
  for (const r of saved) {
    if (isClosedWeekRow(r, closures, branchId) && !kept.has(identityKey(r))) out.push(r)
  }
  return out
}

/** Why a reassigned ticket's old row was left in place instead of being removed by a sync. */
export type ReassignKeptReason = 'closed' | 'completed' | 'held' | 'deductions'

/** A reassigned ticket still listed under its previous tech, and why. */
export interface ReassignKept {
  ticketNumber: string
  customerName: string
  /** The previous tech, whose row was kept. */
  installerName: string
  /** Who the ticket is under now. */
  nowUnder: string[]
  reason: ReassignKeptReason
}

/**
 * Removes a saved row whose ticket has since been reassigned to someone else.
 *
 * The sync matches rows by ticket + installer, so when a ticket moves from tech A to tech B it adds a row for B
 * but nothing ever took A's row away — the job was then paid twice. `fresh` is what Schedules reports right now:
 * a saved row is stale when its ticket IS in `fresh` but no longer under that row's installer.
 *
 * Deliberately narrow, so a sync can't wipe pay by accident — and every row it leaves is reported in `kept`
 * with the reason, so the user is never left wondering why a reassigned ticket still shows under the old tech:
 *  - only when the ticket is still in `fresh` under another name (a ticket merely missing from `fresh` is left alone);
 *  - 'closed': the row's week is closed — a closed week keeps whoever it paid;
 *  - 'completed': the payout was already Completed (released) and the row pays something (a ₱0 row is removed anyway);
 *  - 'held': the row is on hold / released into another week;
 *  - 'deductions': the installer's weekly deductions and remarks ride on one of their rows; they are moved to another
 *    of that installer's rows in the same week first, and only if there is none is the row kept rather than lose them.
 * `weekKeyOf` maps a work date to its payout week (e.g. the week's start date).
 */
export const dropReassignedRows = (
  merged: PayrollRow[],
  fresh: PayrollRow[],
  weekKeyOf: (workDate: string) => string,
  isClosed: (r: PayrollRow) => boolean,
): { rows: PayrollRow[]; kept: ReassignKept[] } => {
  const who = (r: PayrollRow) => normalizeInstallerName(r.installerName).toLowerCase()
  const freshNames = new Map<string, string[]>()   // ticketId -> who it is under now
  const freshPairs = new Set<string>()
  for (const r of fresh) {
    if (!r.ticketId) continue
    freshNames.set(r.ticketId, [...(freshNames.get(r.ticketId) ?? []), r.installerName])
    freshPairs.add(`${r.ticketId}|${who(r)}`)
  }
  const reassigned = (r: PayrollRow) =>
    Boolean(r.ticketId) && freshNames.has(r.ticketId as string) && !freshPairs.has(`${r.ticketId}|${who(r)}`) && !isCarryOver(r)
  const carriesWeekly = (k: string) => k.startsWith('ded:') || k.startsWith('installer:')

  const kept: ReassignKept[] = []
  const note = (r: PayrollRow, reason: ReassignKeptReason) => kept.push({
    ticketNumber: r.ticketNumber || '', customerName: r.customerName || '', installerName: r.installerName,
    nowUnder: freshNames.get(r.ticketId as string) ?? [], reason,
  })

  const stale: PayrollRow[] = []
  for (const r of merged) {
    if (!reassigned(r)) continue
    if (isClosed(r)) note(r, 'closed')
    // A Completed payout was released, so its rows stay — unless the row pays nothing, in which case taking it
    // away changes no one's money.
    else if (r.status === 'COMPLETE' && rowTotal(r) !== 0) note(r, 'completed')
    else if (!isActivePayRow(r) || r.customFields?.['pay:balanceReleased'] === '1') note(r, 'held')
    else stale.push(r)
  }
  if (stale.length === 0) return { rows: merged, kept }
  const staleIds = new Set(stale.map(r => r.id))
  const moved = new Map<string, Record<string, string>>()   // surviving row id -> weekly keys handed to it
  const keep = new Set<string>()                             // stale rows kept because their weekly keys have nowhere to go

  for (const r of stale) {
    const weekly = Object.entries(r.customFields || {}).filter(([k, v]) => carriesWeekly(k) && v !== '')
    if (weekly.length === 0) continue
    const heir = merged.find(o =>
      !staleIds.has(o.id) && who(o) === who(r) && !isCarryOver(o) && isActivePayRow(o)
      && Boolean(o.workDate) && Boolean(r.workDate) && weekKeyOf(o.workDate) === weekKeyOf(r.workDate))
    if (!heir) { keep.add(r.id); note(r, 'deductions'); continue }
    const given = moved.get(heir.id) ?? {}
    for (const [k, v] of weekly) {
      if ((heir.customFields?.[k] ?? '') === '' && given[k] === undefined) given[k] = v
    }
    moved.set(heir.id, given)
  }

  return {
    rows: merged
      .filter(r => !staleIds.has(r.id) || keep.has(r.id))
      .map(r => moved.has(r.id) ? { ...r, customFields: { ...(r.customFields || {}), ...moved.get(r.id) } } : r),
    kept,
  }
}

/** One line per kept row: what it is, who has it now, why it stayed and what to do about it. */
export const describeReassignKept = (k: ReassignKept, displayName: (name: string) => string): string => {
  const what = `${k.ticketNumber || 'No ticket no.'}${k.customerName ? ` (${k.customerName})` : ''}`
  const now = k.nowUnder.length ? ` now under ${k.nowUnder.map(displayName).join(' / ')}` : ''
  const why = k.reason === 'closed' ? 'that week is closed, so it stays as paid — post a correction (Adjust Balance) to take it back'
    : k.reason === 'completed' ? 'the payout is already Completed — set it back to Pending and sync again, or post a correction if it was paid'
    : k.reason === 'held' ? 'the ticket is on hold or was released into another week'
    : 'it holds this tech\u2019s deductions or remarks for the week and they have no other job to move them to — clear or move them, then sync again'
  return `${what}: still under ${displayName(k.installerName)}${now} because ${why}.`
}

export interface SavedPayrollSelection {
  month: string
  weekFrom: string
  weekTo: string
  weekNumber?: number
  label?: string
}

export interface PayrollWeekClosure {
  id?: number
  branchId: string
  weekFrom: string
  weekTo: string
  closedAt?: string
  closedBy?: string
  notes?: string | null
  /** JSON: per-installer gross / deductions / net as shown when the week was closed. */
  closeSnapshot?: string | null
}

export function getSavedPayrollSelection(branchId?: string): SavedPayrollSelection | null {
  try {
    if (branchId) {
      const raw = localStorage.getItem(PAYROLL_WEEK_KEY(branchId))
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed.month === 'string' && typeof parsed.weekFrom === 'string' && typeof parsed.weekTo === 'string') {
          return parsed
        }
      }
    }
    const general = localStorage.getItem(PAYROLL_LAST_SELECTION_KEY)
    if (general) {
      const parsed = JSON.parse(general)
      if (parsed && typeof parsed.month === 'string' && typeof parsed.weekFrom === 'string' && typeof parsed.weekTo === 'string') {
        return parsed
      }
    }
  } catch {
    // Corrupt/foreign localStorage value — fall through to null, same as "nothing saved yet".
  }
  return null
}

// Installer job list: columns are sized from their real rendered text (see listWidths in the
// detail view), so fonts here must match the list's classes. Date/Ticket/Customer stay pinned.
export const LIST_PINNED_KEYS = ['date', 'ticketNumber', 'customerName']
export const LIST_CELL_FONT = '400 13px Inter, system-ui, sans-serif'
export const LIST_CELL_BOLD_FONT = '700 13px Inter, system-ui, sans-serif'
export const LIST_HEAD_FONT = '700 11px Inter, system-ui, sans-serif'
export const LIST_HEAD_TRACKING = 0.275 // Tailwind tracking-wide (0.025em) at 11px, per character
let measureCtx: CanvasRenderingContext2D | null | undefined
export const measureText = (text: string, font: string, trackingPerChar = 0): number => {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7.5
  measureCtx.font = font
  return measureCtx.measureText(text).width + text.length * trackingPerChar
}

// Widths default to COLUMN_DEFS but are user-adjustable (drag the header edge) and shared
// across every installer table — a resize is a layout preference, not per-installer state.
export const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = COLUMN_DEFS.reduce((acc, c) => {
  acc[c.key as ColumnKey] = c.width
  return acc
}, {} as Record<ColumnKey, number>)

// A column a branch adds by hand from the "Manage Columns" modal — no fixed field on
// PayrollRow, its values live in row.customFields keyed by `key`. Always money-type (a fee),
// always visible once created (no per-installer hide/show or resize in this first pass), and
// removable from the same modal.
export interface CustomColumnDef {
  key: string
  label: string
}

/** Same label ignoring case, spacing and punctuation: "General Cleaning" == "GENERAL_CLEANING". */
export const columnLabelKey = (label: string) => label.toUpperCase().replace(/[^A-Z0-9]+/g, '')

/** Identity used to spot the same column entered twice: also ignores a trailing counter, so "Check Up 2" (what people type
 *  to get around the exists check) counts as "Check Up". */
export const duplicateLabelKey = (label: string) => columnLabelKey(label.trim().replace(/[\s_-]+\(?\d{1,2}\)?$/, ""))

/** Custom columns that share a label. The first of each group is the one to keep. */
export function findDuplicateColumnGroups(defs: CustomColumnDef[]): CustomColumnDef[][] {
  const byLabel = new Map<string, CustomColumnDef[]>()
  for (const d of defs) {
    const k = duplicateLabelKey(d.label)
    if (!k) continue
    byLabel.set(k, [...(byLabel.get(k) ?? []), d])
  }
  return Array.from(byLabel.values()).filter(g => g.length > 1)
}

/** Last column of every installer table: what this ticket pays (all fees, scaled by payment share).
 *  Read-only and always shown — its value comes from rowTotal(), not from a stored field. */
export const NET_COLUMN: ColumnDef = { key: 'net', label: 'Net', width: 110, align: 'right', pinned: true, isMoney: true }
