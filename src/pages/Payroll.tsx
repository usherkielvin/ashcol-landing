import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { NumericFormat } from 'react-number-format'
import {
  Search, Building2, Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  SlidersHorizontal, Plus, X, RotateCcw, RefreshCw, Save, Loader2, EyeOff, Trash2,
  Stethoscope, Lightbulb, HardHat, PiggyBank, Wind, Recycle, ArrowBigDownDash, Snowflake,
  Users, Clock, Receipt, ArrowRightLeft, ExternalLink,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin, isPayrollMember, isFranchiseBranch } from '../utils/api'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import {
  fetchAndMapPayroll,
  deduplicateAndMergePayroll,
  DEFAULT_PAYROLL_RATES,
  STANDARD_RATE_TABLE,
  MANUAL_FEE_PREFIX,
  type AutoStampedFee,
  type PayrollRow,
  type PayrollRates,
} from '../utils/payrollDerive'

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const cleaned = String(v).replace(/[^0-9.-]/g, '')
  if (!cleaned) return 0
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

const peso = (v: number | string | null | undefined) => {
  const n = num(v)
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const uid = () => Math.random().toString(36).slice(2)
const shortDate = (ymd: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const longDate = (ymd: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
// Display-only formatting — the underlying name stays ALL-CAPS everywhere it's used as a
// key/lookup (grouping, aliasing, avatar color hashing); this just softens how it reads on screen.
const titleCase = (name: string) =>
  name.trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
// A handful of deterministic flat colors so each installer's avatar reads as a distinct
// person at a glance, without storing per-user color state anywhere.
const AVATAR_COLORS: string[] = ['#10B981', '#F59E0B', '#8B5CF6', '#0EA5E9', '#84CC16', '#F97316', '#EC4899', '#06B6D4']
const avatarColor = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function getFridayToFriday(d: Date = new Date()): { from: string; to: string } {
  const day = d.getDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const daysBack = (day + 2) % 7 // Fri=0, Sat=1, Sun=2, Mon=3, Tue=4, Wed=5, Thu=6
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBack)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  }
}

function getLastWeekFridayToFriday(d: Date = new Date()): { from: string; to: string } {
  const current = getFridayToFriday(d)
  const [y, m, day] = current.from.split('-').map(Number)
  const lastStart = new Date(y, m - 1, day - 7)
  const lastEnd = new Date(lastStart.getFullYear(), lastStart.getMonth(), lastStart.getDate() + 7)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${lastStart.getFullYear()}-${pad(lastStart.getMonth() + 1)}-${pad(lastStart.getDate())}`,
    to: `${lastEnd.getFullYear()}-${pad(lastEnd.getMonth() + 1)}-${pad(lastEnd.getDate())}`,
  }
}

function getThisMonthRange(d: Date = new Date()): { from: string; to: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  }
}

function getLastMonthRange(d: Date = new Date()): { from: string; to: string } {
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const end = new Date(d.getFullYear(), d.getMonth(), 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  }
}

const customFieldsFeeTotal = (r: PayrollRow): number => {
  if (!r.customFields) return 0
  let sum = 0
  for (const [k, v] of Object.entries(r.customFields)) {
    if (k.startsWith('ded:') || k.startsWith('xfer:') || k.startsWith(MANUAL_FEE_PREFIX)) continue
    sum += num(v)
  }
  return sum
}

// Mirrors the sheet's "PAYROLL DUE" — sum of every fee-type column, whether or not that
// column is currently shown (a hidden column can still hold an amount), including branch custom columns.
const rowTotal = (r: PayrollRow): number =>
  num(r.installationFee) + num(r.earthGrounding) + num(r.dailyAllowance)
  + num(r.excessCopperTube) + num(r.hauling) + num(r.dismantling) + num(r.electricalWorks)
  + num(r.chippingWorks) + num(r.breaker) + num(r.powerSupplyLaborOnly) + num(r.powerSupplyLaborMaterials)
  + num(r.specialBracketCatwalk) + num(r.specialBracketWelding) + num(r.excessCopperTubeLaborOnly)
  + num(r.relocationAccuFcu) + num(r.systemReprocessLabor) + num(r.drainPumpInstallation)
  + num(r.scaffoldingInstallation) + num(r.flushingOldPipe) + num(r.sterneBracket)
  + num(r.breakerInstallationLabor) + num(r.chargingOfFreon) + num(r.materialsReturn)
  + customFieldsFeeTotal(r)

const rowAddOns = (r: PayrollRow): number => Math.max(0, rowTotal(r) - num(r.installationFee))

const installerTotal = (installerRows: PayrollRow[]) =>
  installerRows.reduce((sum, r) => sum + rowTotal(r), 0)

// A job counts once its schedule status is a DONE outcome — install, cleaning, checkup, service,
// etc. — so service branches (mostly cleanings) don't read as zero work. installerRows is already
// scoped to the active date-range filter, so this is automatically "within the selected range" too.
const isCompletedRow = (r: PayrollRow) => /^DONE\b/i.test(r.installationUpload.trim())
const completedJobsCount = (installerRows: PayrollRow[]) => installerRows.filter(isCompletedRow).length
/** "2 Cleaning · 1 Install" — what kind of work those completed jobs were, most frequent first. */
const completedJobsBreakdown = (installerRows: PayrollRow[]) => {
  const counts = new Map<string, number>()
  for (const r of installerRows) {
    if (!isCompletedRow(r)) continue
    const kind = titleCase(r.installationUpload.trim().replace(/^DONE\s*/i, '')) || 'Job'
    counts.set(kind, (counts.get(kind) || 0) + 1)
  }
  return Array.from(counts).sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${n} ${kind}`).join(' · ')
}

// Money owed BACK to the branch — parses the free-text remit field ("2,000 CASH", "FREE")
// down to its numeric amount, ignoring the payment-method text.
const parseMoneyText = (s: string | number | null | undefined) => num(s)
const remittanceTotal = (rowsIn: PayrollRow[]) => rowsIn.reduce((sum, r) => sum + parseMoneyText(r.actualCollected), 0)
const baseInstallTotal = (rowsIn: PayrollRow[]) => rowsIn.reduce((sum, r) => sum + num(r.installationFee), 0)

// Per-installer deductions for the period — the bottom block of the branch's payroll sheet
// (Late / AC Loan-CA / Incomplete Upload / Losses / Remit / Uniform). They ride along in each
// row's customFields under reserved "ded:" keys, so the existing payroll save persists them.
const LATE_RATE_PER_MINUTE = 1.6
const UNIFORM_PRICE_PER_PC = 850
type DeductionKey =
  | 'lateMinutes' | 'loan' | 'loanBalance' | 'incompleteUpload' | 'losses' | 'remitPenalty' | 'uniform' | 'uniformBalance'
const DEDUCTION_PREFIX = 'ded:'
// Balances are a snapshot (latest wins); every other key is an amount that adds up.
const BALANCE_DEDUCTION_KEYS = new Set<DeductionKey>(['loanBalance', 'uniformBalance'])
const rawDeduction = (r: PayrollRow, key: DeductionKey) => r.customFields?.[DEDUCTION_PREFIX + key] || ''
/** Amounts sum across every row in range — each week's value sits on that week's first job —
 *  so a month view shows the month's total. Balances take the latest row that has one. */
const deductionValue = (rowsIn: PayrollRow[], key: DeductionKey): number => {
  if (BALANCE_DEDUCTION_KEYS.has(key)) {
    for (let i = rowsIn.length - 1; i >= 0; i--) {
      const v = rawDeduction(rowsIn[i], key)
      if (v) return num(v)
    }
    return 0
  }
  return rowsIn.reduce((sum, r) => sum + num(rawDeduction(r, key)), 0)
}
const lateDeduction = (rowsIn: PayrollRow[]) => deductionValue(rowsIn, 'lateMinutes') * LATE_RATE_PER_MINUTE
const deductionTotal = (rowsIn: PayrollRow[]) =>
  lateDeduction(rowsIn) + deductionValue(rowsIn, 'loan') + deductionValue(rowsIn, 'incompleteUpload')
  + deductionValue(rowsIn, 'losses') + deductionValue(rowsIn, 'remitPenalty') + deductionValue(rowsIn, 'uniform')
const installerNet = (installerRows: PayrollRow[]) => installerTotal(installerRows) - deductionTotal(installerRows)


type ColumnKey =
  | 'date' | 'ticketNumber' | 'customerName' | 'brandCapacity' | 'remit'
  | 'installationUpload' | 'installationFee' | 'totalPipeLength' | 'earthGrounding' | 'dailyAllowance'
  | 'excessCopperTube' | 'hauling' | 'dismantling' | 'electricalWorks' | 'chippingWorks' | 'breaker'
  | 'powerSupplyLaborOnly' | 'powerSupplyLaborMaterials' | 'specialBracketCatwalk' | 'specialBracketWelding'
  | 'excessCopperTubeLaborOnly' | 'relocationAccuFcu' | 'systemReprocessLabor' | 'drainPumpInstallation'
  | 'scaffoldingInstallation' | 'flushingOldPipe' | 'sterneBracket' | 'breakerInstallationLabor'
  | 'chargingOfFreon' | 'materialsReturn' | 'installationChecklist' | 'videoUpload' | 'remarks' | 'audited'

type ColumnCategory = 'standard' | 'piping' | 'electrical' | 'structural' | 'masonry' | 'admin'

const CATEGORY_META: Record<ColumnCategory, { label: string }> = {
  standard: { label: 'Standard Add-ons' },
  piping: { label: 'Piping & Copper' },
  electrical: { label: 'Electrical & Power' },
  structural: { label: 'Structural Work' },
  masonry: { label: 'Masonry & Labor' },
  admin: { label: 'Admin & Notes' },
}

interface ColumnDef {
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
const COLUMN_DEFS: ColumnDef[] = [
  { key: 'date', label: 'Date', width: 128, align: 'left', pinned: true, readOnlyWhenSynced: true },
  { key: 'ticketNumber', label: 'Ticket', width: 110, align: 'left', pinned: true, readOnlyWhenSynced: true },
  { key: 'customerName', label: 'Customer', width: 220, align: 'left', pinned: true, readOnlyWhenSynced: true },
  { key: 'brandCapacity', label: 'Brand', width: 150, align: 'left', pinned: true },
  { key: 'remit', label: 'Remit', width: 120, align: 'right', pinned: true },
  { key: 'installationUpload', label: 'Status', width: 130, align: 'left', pinned: true },
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
  { key: 'materialsReturn', label: 'Materials Return', width: 110, align: 'right', category: 'admin', isMoney: true },
  { key: 'installationChecklist', label: 'Install Checklist', width: 110, align: 'left', category: 'admin' },
  { key: 'videoUpload', label: 'Video Upload', width: 110, align: 'left', category: 'admin' },
  // Always trail the table, not part of the hide/show system — any unhidden column lands
  // between Install Fee and these two, never after them.
  { key: 'remarks', label: 'Remarks', width: 150, align: 'left', pinned: true },
  { key: 'audited', label: 'Audited', width: 90, align: 'left', pinned: true },
]

// Roster columns: Installer | Aircon Units | Payroll Amount | Payroll Status. There's no action
// column — the whole row opens that installer's payroll.
const ROSTER_GRID_TEMPLATE = 'minmax(240px, 2fr) 190px 170px 220px'

const COLUMN_PRESETS: { label: string; cats: ColumnCategory[] }[] = [
  { label: 'Standard', cats: ['standard'] },
  { label: 'Electrical Heavy', cats: ['standard', 'electrical'] },
  { label: 'Structural Heavy', cats: ['standard', 'structural'] },
]

// "Standard Add-ons" and "Admin & Notes" (Materials Return, Install Checklist, Video Upload)
// show on first visit — every other fee category starts hidden since most are blank for any
// given installer/job (see COLUMN_DEFS comment above).
const DEFAULT_HIDDEN_COLUMNS: ColumnKey[] = COLUMN_DEFS
  .filter(c => !c.pinned && c.category !== 'standard' && c.category !== 'admin')
  .map(c => c.key as ColumnKey)

const HIDDEN_COLUMNS_KEY = 'ashcol-payroll-hidden-columns'
const COLUMN_WIDTHS_KEY = 'ashcol-payroll-column-widths'
const CUSTOM_COLUMNS_KEY = 'ashcol-payroll-custom-columns'
// Payroll keeps its own branch selection, independent of the app-wide branch switcher — once
// picked here it must survive a reload and only change when this page's dropdown is used.
const PAYROLL_BRANCH_KEY = 'ashcol-payroll-branch-id'
const MIN_COLUMN_WIDTH = 70

// Installer job list: columns are sized from their real rendered text (see listWidths in the
// detail view), so fonts here must match the list's classes. Date/Ticket/Customer stay pinned.
const LIST_PINNED_KEYS = ['date', 'ticketNumber', 'customerName']
const LIST_CELL_FONT = '400 13px Inter, system-ui, sans-serif'
const LIST_CELL_BOLD_FONT = '700 13px Inter, system-ui, sans-serif'
const LIST_HEAD_FONT = '700 11px Inter, system-ui, sans-serif'
const LIST_HEAD_TRACKING = 0.275 // Tailwind tracking-wide (0.025em) at 11px, per character
let measureCtx: CanvasRenderingContext2D | null | undefined
const measureText = (text: string, font: string, trackingPerChar = 0): number => {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7.5
  measureCtx.font = font
  return measureCtx.measureText(text).width + text.length * trackingPerChar
}

// Widths default to COLUMN_DEFS but are user-adjustable (drag the header edge) and shared
// across every installer table — a resize is a layout preference, not per-installer state.
const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = COLUMN_DEFS.reduce((acc, c) => {
  acc[c.key as ColumnKey] = c.width
  return acc
}, {} as Record<ColumnKey, number>)

// A column a branch adds by hand from the "Manage Columns" modal — no fixed field on
// PayrollRow, its values live in row.customFields keyed by `key`. Always money-type (a fee),
// always visible once created (no per-installer hide/show or resize in this first pass), and
// removable from the same modal.
interface CustomColumnDef {
  key: string
  label: string
}

export default function Payroll() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const role = (user?.role || '').toLowerCase()
  // Admins and members carrying a payroll job title get the same payroll toolset: the
  // all-branch dropdown, saving/autosave, and Payroll Settings. Without this a payroll-tagged
  // member was pinned to their own branch and their edits were silently never saved.
  const canManagePayroll = isPortalAdmin(role) || isPayrollMember(user?.jobTitle)

  const userFirstName = useMemo(() => {
    const raw = (user as any)?.firstName || user?.name || (user as any)?.username || 'ADMIN'
    return String(raw).trim().split(/\s+/)[0].toUpperCase()
  }, [user])

  const [rows, setRows] = useState<PayrollRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  // True when the last pull from Schedules failed — the table is then only showing previously
  // saved rows, which can stop partway through the period.
  const [syncFailed, setSyncFailed] = useState(false)
  // Header shows no save-status indicator per the simplified toolbar — the setter still
  // drives autosave logic below, the value itself just isn't rendered anywhere right now.
  const [, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // null = the roster (list of installers); a name = that installer's own table.
  const [selectedInstaller, setSelectedInstaller] = useState<string | null>(null)
  // The job row whose full fee breakdown is open in the popup (desktop list view).
  const [detailRow, setDetailRow] = useState<PayrollRow | null>(null)
  // Active cell being edited inline in the desktop table (null = none).
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null)
  const lastCellTapRef = useRef<{ rowId: string; colKey: string; time: number } | null>(null)
  // Which installer's Deductions modal is open (null = closed).
  const [deductionsModalInstaller, setDeductionsModalInstaller] = useState<string | null>(null)
  // Installer job list's horizontal scroll — which edges still hide columns (drives the fade +
  // arrow cues) and whether it's scrolled at all (drives the pinned-column shadow).
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const [listEdges, setListEdges] = useState({ left: false, right: false })
  const updateListEdges = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    el.dataset.scrolled = left ? '1' : '0'
    setListEdges(prev => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [completeModalFor, setCompleteModalFor] = useState<string | null>(null)
  const [completeRemarks, setCompleteRemarks] = useState('')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // '' = all installers. Narrows the roster list to one technician, independent of the free-text
  // search box above — the dropdown's own options always list the branch's full roster.
  const [technicianFilter, setTechnicianFilter] = useState('')
  const [branches, setBranches] = useState<{ id: string; name: string; payrollRates?: string | null }[]>([])
  const defaultWeek = useMemo(() => getFridayToFriday(new Date()), [])
  const [dateFrom, setDateFrom] = useState(() => defaultWeek.from)
  const [dateTo, setDateTo] = useState(() => defaultWeek.to)
  const [draftDateFrom, setDraftDateFrom] = useState(() => defaultWeek.from)
  const [draftDateTo, setDraftDateTo] = useState(() => defaultWeek.to)
  const [dateRangeOpen, setDateRangeOpen] = useState(false)
  const dateRangeRef = useRef<HTMLDivElement>(null)

  const [branchFilter, setBranchFilter] = useState(() => {
    if (canManagePayroll) {
      const savedPayrollBranch = localStorage.getItem(PAYROLL_BRANCH_KEY)
      if (savedPayrollBranch) return savedPayrollBranch
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      if (activeBranch && activeBranch !== 'ALL_BRANCHES') return activeBranch
      return 'BR-TAGUIG-SALES'
    }
    return user?.branchId || 'BR-TAGUIG-SALES'
  })
  // Persist Payroll's own branch choice so a reload comes back to it, not whatever the
  // app-wide branch switcher happens to be set to elsewhere.
  useEffect(() => {
    if (canManagePayroll && branchFilter) localStorage.setItem(PAYROLL_BRANCH_KEY, branchFilter)
  }, [canManagePayroll, branchFilter])

  // Per-branch override of the standard rates (e.g. SILANG's cleaning fee differs from other
  // branches) — parsed from Branch.payrollRates (see "Payroll Settings" modal below), falling
  // back to the app-wide defaults for any branch with no override saved, or a corrupt value.
  const rates = useMemo<PayrollRates>(() => {
    const raw = branches.find(b => b.id === branchFilter)?.payrollRates
    if (!raw) return DEFAULT_PAYROLL_RATES
    try {
      return { ...DEFAULT_PAYROLL_RATES, ...JSON.parse(raw) }
    } catch {
      return DEFAULT_PAYROLL_RATES
    }
  }, [branches, branchFilter])

  const [ratesModalOpen, setRatesModalOpen] = useState(false)
  const [ratesSearch, setRatesSearch] = useState('')
  const [draftRates, setDraftRates] = useState<PayrollRates>(DEFAULT_PAYROLL_RATES)
  const [savingRates, setSavingRates] = useState(false)
  const openRatesModal = () => {
    const initialOverrides: Record<string, number> = {}
    STANDARD_RATE_TABLE.forEach(item => {
      initialOverrides[item.key] = rates.lineItemOverrides?.[item.key] ?? item.defaultRate
    })
    setDraftRates({
      ...rates,
      dailyAllowance: rates.dailyAllowance ?? DEFAULT_PAYROLL_RATES.dailyAllowance,
      earthGrounding: rates.earthGrounding ?? DEFAULT_PAYROLL_RATES.earthGrounding,
      survey: rates.survey ?? DEFAULT_PAYROLL_RATES.survey,
      rescheduled: rates.rescheduled ?? DEFAULT_PAYROLL_RATES.rescheduled,
      lineItemOverrides: initialOverrides,
    })
    setRatesSearch('')
    setRatesModalOpen(true)
  }
  const saveRates = async () => {
    if (!branchFilter) return
    setSavingRates(true)
    try {
      const res = await fetch(`${API_BASE_URL}/branches/${branchFilter}/payroll-rates`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payrollRates: JSON.stringify(draftRates) }),
      })
      if (res.ok) {
        setBranches(prev => prev.map(b => b.id === branchFilter ? { ...b, payrollRates: JSON.stringify(draftRates) } : b))
        setRatesModalOpen(false)
      }
    } catch (e) {
      console.error('Failed to save branch payroll rates:', e)
    } finally {
      setSavingRates(false)
    }
  }

  // Keyed by installer name — column visibility is per-installer-table, not shared globally.
  const [hiddenColumnsByInstaller, setHiddenColumnsByInstaller] = useState<Record<string, Set<ColumnKey>>>(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_COLUMNS_KEY)
      if (!raw) return {}
      const obj = JSON.parse(raw) as Record<string, string[]>
      const result: Record<string, Set<ColumnKey>> = {}
      for (const [name, arr] of Object.entries(obj)) {
        result[name] = new Set(arr.filter((k): k is ColumnKey => COLUMN_DEFS.some(c => c.key === k)))
      }
      return result
    } catch {
      return {}
    }
  })
  useEffect(() => {
    const serializable: Record<string, ColumnKey[]> = {}
    for (const [name, set] of Object.entries(hiddenColumnsByInstaller)) serializable[name] = Array.from(set)
    localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(serializable))
  }, [hiddenColumnsByInstaller])
  const hiddenColumnsFor = (installerName: string): Set<ColumnKey> =>
    hiddenColumnsByInstaller[installerName] ?? new Set(DEFAULT_HIDDEN_COLUMNS)
  const [columnManagerFor, setColumnManagerFor] = useState<string | null>(null)
  const [columnSearch, setColumnSearch] = useState('')
  const [popupCategory, setPopupCategory] = useState<string>('all')
  const [popupSearch, setPopupSearch] = useState<string>('')
  // { x, y } = screen coords of right-click; col = which header was right-clicked;
  // installerName = which installer table it belongs to (for per-installer hide toggle).
  const [colCtxMenu, setColCtxMenu] = useState<{ x: number; y: number; col: ColumnDef; installerName: string } | null>(null)

  // Branch-created custom columns, shared across every installer table (a new column applies
  // everywhere, not just one installer's sheet) and persisted so it survives a reload.
  const [customColumnDefs, setCustomColumnDefs] = useState<CustomColumnDef[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_COLUMNS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    localStorage.setItem(CUSTOM_COLUMNS_KEY, JSON.stringify(customColumnDefs))
  }, [customColumnDefs])
  const [newColumnName, setNewColumnName] = useState('')
  const addCustomColumn = () => {
    const label = newColumnName.trim()
    if (!label) return
    const slug = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    let key = `custom_${slug || 'column'}`
    // Guarantee uniqueness even if two columns slugify to the same thing.
    let n = 2
    while (customColumnDefs.some(c => c.key === key)) { key = `custom_${slug || 'column'}_${n}`; n++ }
    setCustomColumnDefs(prev => [...prev, { key, label }])
    setNewColumnName('')
  }
  const removeCustomColumn = (key: string) => {
    setCustomColumnDefs(prev => prev.filter(c => c.key !== key))
  }

  // Schedule tickets only ever carry an installer's first name/nickname (see
  // cleanInstallerName in schedulePrefill.ts — that's what payrollDerive.ts groups rows by),
  // so the payroll page has to resolve that short form back to the real technician. Fetches
  // every EMPLOYEE tagged INSTALLER or TECHNICIAN for the selected branch.
  const [branchTechnicians, setBranchTechnicians] = useState<{ id: string; name: string; nickname: string; jobTitle: string; inHouse: boolean }[]>([])
  useEffect(() => {
    if (!branchFilter) { setBranchTechnicians([]); return }
    let cancelled = false
    fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        const list: any[] = data?.data || []
        const filtered = list
          .filter(u => u.branchId === branchFilter)
          .filter(u => /INSTALLER|TECHNICIAN/i.test(u.jobTitle || ''))
          .map(u => ({ id: u.id, name: String(u.name || '').trim(), nickname: String(u.nickname || '').trim(), jobTitle: u.jobTitle || '', inHouse: !!u.inHouse }))
        setBranchTechnicians(filtered)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [branchFilter])

  // In-house (salaried) technicians are paid a fixed wage, not per job — their completed jobs
  // shouldn't show up on this pakyaw/contract payroll sheet at all. Keyed by resolved real name
  // (same identity the roster groups rows by), so it applies regardless of which alias/nickname
  // a given ticket happened to use.
  const inHouseTechnicianNames = useMemo(() => {
    const set = new Set<string>()
    for (const t of branchTechnicians) {
      if (t.inHouse && t.name) set.add(t.name.toUpperCase())
    }
    return set
  }, [branchTechnicians])

  // Exact aliases only — the account's own `nickname` field (set by hand for cases like
  // "RYAN" for "MARCYAN ZANTUA" that have zero textual relationship to the real name — see
  // scripts/postgres/set_installer_nicknames.sql) plus every word of their real name (covers
  // "JHON PATRICK PRIZA" going by "PATRICK" on tickets). First match wins on a collision.
  const installerAliases = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of branchTechnicians) {
      if (t.nickname && !map[t.nickname.toUpperCase()]) map[t.nickname.toUpperCase()] = t.name
      for (const word of t.name.split(/\s+/)) {
        const key = word.toUpperCase()
        if (key && !map[key]) map[key] = t.name
      }
    }
    return map
  }, [branchTechnicians])

  // Fuzzy fallback for shortened-but-related nicknames ("CRIS" for "CRISANTO") that aren't
  // worth a manual nickname entry — only kicks in once the exact alias map above has no hit,
  // and only for a >=4-char prefix so it doesn't over-match short/common fragments.
  const resolvePrefixAlias = (word: string): string | null => {
    if (word.length < 4) return null
    for (const t of branchTechnicians) {
      for (const real of t.name.split(/\s+/)) {
        if (real.length > word.length && real.toUpperCase().startsWith(word.toUpperCase())) return t.name
      }
    }
    return null
  }

  /** The one true name-resolution function — used both to LABEL a roster group and to decide
   *  which group a row belongs to in the first place (resolveGroupKey below), so "CRIS" and
   *  "CRISANTO" collapse into the same installer instead of showing as two separate rows. */
  const resolveInstallerIdentity = (raw: string): string => {
    const trimmed = raw.trim()
    if (!trimmed) return trimmed
    // Uppercased throughout — matches how every ticket-derived short name already arrives
    // (payrollDerive.ts uppercases those) and the table's own all-caps styling, regardless of
    // whatever casing the account's real name was typed in ("Allan Bellen" → "ALLAN BELLEN").
    const whole = installerAliases[trimmed.toUpperCase()]
    if (whole) return whole.toUpperCase()
    for (const word of trimmed.split(/[\s-]+/)) {
      const exact = installerAliases[word.toUpperCase()]
      if (exact) return exact.toUpperCase()
      const fuzzy = resolvePrefixAlias(word)
      if (fuzzy) return fuzzy.toUpperCase()
    }
    return trimmed
  }
  const displayInstallerName = (shortName: string) => resolveInstallerIdentity(shortName)

  // Drag-to-resize column widths — shared across every installer table, persisted so a
  // widened column stays widened next visit.
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(() => {
    try {
      const raw = localStorage.getItem(COLUMN_WIDTHS_KEY)
      if (!raw) return DEFAULT_COLUMN_WIDTHS
      const saved = JSON.parse(raw) as Partial<Record<ColumnKey, number>>
      return { ...DEFAULT_COLUMN_WIDTHS, ...saved }
    } catch {
      return DEFAULT_COLUMN_WIDTHS
    }
  })
  useEffect(() => {
    localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths))
  }, [columnWidths])
  // Custom columns have no entry in columnWidths/DEFAULT_COLUMN_WIDTHS (both strictly
  // ColumnKey-keyed) — they fall back to a fixed width.
  const widthFor = (key: string) => columnWidths[key as ColumnKey] ?? DEFAULT_COLUMN_WIDTHS[key as ColumnKey] ?? 120
  // A width someone dragged (or set from the right-click column menu). Anything still at its
  // default auto-sizes to its content in the job list instead.
  const userWidthFor = (key: string): number | undefined => {
    const w = columnWidths[key as ColumnKey]
    return w !== undefined && w !== DEFAULT_COLUMN_WIDTHS[key as ColumnKey] ? w : undefined
  }
  // Drag a header's right edge to resize — starts from the column's real on-screen width (it
  // may be auto-sized or stretched), saves to localStorage, so it's still that size on reload.
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null)
  const [resizingKey, setResizingKey] = useState<string | null>(null)
  const startColumnResize = (key: string) => (e: ReactMouseEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const cell = e.currentTarget.parentElement
    resizeRef.current = { key, startX: e.clientX, startWidth: cell ? cell.getBoundingClientRect().width : widthFor(key) }
    setResizingKey(key)
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current
      if (!r) return
      const next = Math.round(Math.min(600, Math.max(MIN_COLUMN_WIDTH, r.startWidth + ev.clientX - r.startX)))
      setColumnWidths(prev => ({ ...prev, [r.key as ColumnKey]: next }))
    }
    const onUp = () => {
      resizeRef.current = null
      setResizingKey(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  // Double-click the handle: drop the saved width so the column auto-fits its content again.
  const resetColumnWidth = (key: string) => {
    setColumnWidths(prev => {
      const next = { ...prev }
      if (key in DEFAULT_COLUMN_WIDTHS) next[key as ColumnKey] = DEFAULT_COLUMN_WIDTHS[key as ColumnKey]
      else delete next[key as ColumnKey]
      return next
    })
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dateRangeRef.current && !dateRangeRef.current.contains(e.target as Node)) setDateRangeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close the column right-click context menu on any click or scroll outside it.
  useEffect(() => {
    if (!colCtxMenu) return
    const close = () => setColCtxMenu(null)
    document.addEventListener('click', close, true)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close, true)
      document.removeEventListener('scroll', close, true)
    }
  }, [colCtxMenu])

  const openDateRange = () => {
    setDraftDateFrom(dateFrom)
    setDraftDateTo(dateTo)
    setDateRangeOpen(o => !o)
  }
  const applyDateRange = () => {
    setDateFrom(draftDateFrom)
    setDateTo(draftDateTo)
    setDateRangeOpen(false)
  }
  const clearDateRange = () => {
    setDateFrom('')
    setDateTo('')
    setDraftDateFrom('')
    setDraftDateTo('')
    setDateRangeOpen(false)
  }
  const applyPreset = (from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
    setDraftDateFrom(from)
    setDraftDateTo(to)
    setDateRangeOpen(false)
  }

  const getToken = () =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  const handleSearchChange = (value: string) => {
    setRawSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 200)
  }

  // Core background save routine
  const savePayrollToBackend = useCallback(async (data: PayrollRow[], bId: string, mKey: string) => {
    if (!bId || !mKey) return
    setSaveStatus('saving')
    try {
      const entries = data.map((r, idx) => ({
        ticketId: r.ticketId || null,
        ticketNumber: r.ticketNumber || null,
        installerName: r.installerName,
        sortOrder: idx,
        workDate: r.workDate || null,
        customerName: r.customerName || null,
        cityAddress: r.cityAddress || null,
        brandCapacity: r.brandCapacity || null,
        sifQuotation: r.sifQuotation || null,
        totalPipeLength: r.totalPipeLength || null,
        installationUpload: r.installationUpload || null,
        amountCollected: r.amountCollected ? num(r.amountCollected) : null,
        actualCollected: r.actualCollected || null,
        installationFee: r.installationFee ? num(r.installationFee) : null,
        earthGrounding: r.earthGrounding ? num(r.earthGrounding) : null,
        dailyAllowance: r.dailyAllowance ? num(r.dailyAllowance) : null,
        excessCopperTube: r.excessCopperTube ? num(r.excessCopperTube) : null,
        hauling: r.hauling ? num(r.hauling) : null,
        dismantling: r.dismantling ? num(r.dismantling) : null,
        electricalWorks: r.electricalWorks ? num(r.electricalWorks) : null,
        chippingWorks: r.chippingWorks ? num(r.chippingWorks) : null,
        breaker: r.breaker ? num(r.breaker) : null,
        powerSupplyLaborOnly: r.powerSupplyLaborOnly ? num(r.powerSupplyLaborOnly) : null,
        powerSupplyLaborMaterials: r.powerSupplyLaborMaterials ? num(r.powerSupplyLaborMaterials) : null,
        specialBracketCatwalk: r.specialBracketCatwalk ? num(r.specialBracketCatwalk) : null,
        specialBracketWelding: r.specialBracketWelding ? num(r.specialBracketWelding) : null,
        excessCopperTubeLaborOnly: r.excessCopperTubeLaborOnly ? num(r.excessCopperTubeLaborOnly) : null,
        relocationAccuFcu: r.relocationAccuFcu ? num(r.relocationAccuFcu) : null,
        systemReprocessLabor: r.systemReprocessLabor ? num(r.systemReprocessLabor) : null,
        drainPumpInstallation: r.drainPumpInstallation ? num(r.drainPumpInstallation) : null,
        scaffoldingInstallation: r.scaffoldingInstallation ? num(r.scaffoldingInstallation) : null,
        flushingOldPipe: r.flushingOldPipe ? num(r.flushingOldPipe) : null,
        sterneBracket: r.sterneBracket ? num(r.sterneBracket) : null,
        breakerInstallationLabor: r.breakerInstallationLabor ? num(r.breakerInstallationLabor) : null,
        chargingOfFreon: r.chargingOfFreon ? num(r.chargingOfFreon) : null,
        materialsReturn: r.materialsReturn ? num(r.materialsReturn) : null,
        installationChecklist: r.installationChecklist || null,
        videoUpload: r.videoUpload || null,
        remarks: r.remarks || null,
        audited: r.audited || null,
        status: r.status || 'PENDING',
        customFields: r.customFields && Object.keys(r.customFields).length > 0 ? JSON.stringify(r.customFields) : null,
      }))
      const res = await fetch(`${API_BASE_URL}/v1/payroll`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: bId, periodMonth: mKey, entries }),
      })
      if (res.ok) {
        setSaveStatus('saved')
      } else {
        setSaveStatus('error')
      }
    } catch (e) {
      console.error('Failed to auto-save payroll:', e)
      setSaveStatus('error')
    }
  }, [])

  const monthsToFetch = useMemo(() => {
    const set = new Set<string>()
    if (dateFrom) set.add(dateFrom.slice(0, 7))
    if (dateTo) set.add(dateTo.slice(0, 7))
    if (set.size === 0) {
      const now = new Date()
      set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(set)
  }, [dateFrom, dateTo])

  // Auto-fetch: loads saved entries AND automatically fetches latest jobs from Schedules
  const loadAndSync = useCallback(async (isManualRefresh = false) => {
    if (!branchFilter) {
      setRows([])
      setInitialLoading(false)
      return
    }
    if (isManualRefresh) setSyncing(true)
    else setInitialLoading(true)

    let anySyncFailed = false
    try {
      let combinedSavedRows: PayrollRow[] = []
      const currentBranchName = branches.find(b => b.id === branchFilter)?.name || ''

      for (const mKey of monthsToFetch) {
        const params = new URLSearchParams({ branchId: branchFilter, month: mKey })
        const res = await fetch(`${API_BASE_URL}/v1/payroll?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        let savedRows: PayrollRow[] = []
        if (res.ok) {
          const list = await res.json()
          savedRows = (Array.isArray(list) ? list : []).map((e: any) => ({
            id: e.id || uid(),
            ticketId: e.ticketId || undefined,
            ticketNumber: e.ticketNumber || '',
            installerName: e.installerName || '',
            workDate: e.workDate || '',
            customerName: e.customerName || '',
            cityAddress: e.cityAddress || '',
            brandCapacity: e.brandCapacity || '',
            sifQuotation: e.sifQuotation || '',
            totalPipeLength: e.totalPipeLength || '',
            amountCollected: e.amountCollected != null ? String(e.amountCollected) : '',
            actualCollected: e.actualCollected || '',
            installationUpload: e.installationUpload || '',
            installationFee: e.installationFee != null ? String(e.installationFee) : '',
            earthGrounding: e.earthGrounding != null ? String(e.earthGrounding) : '',
            dailyAllowance: e.dailyAllowance != null ? String(e.dailyAllowance) : '',
            excessCopperTube: e.excessCopperTube != null ? String(e.excessCopperTube) : '',
            hauling: e.hauling != null ? String(e.hauling) : '',
            dismantling: e.dismantling != null ? String(e.dismantling) : '',
            electricalWorks: e.electricalWorks != null ? String(e.electricalWorks) : '',
            chippingWorks: e.chippingWorks != null ? String(e.chippingWorks) : '',
            breaker: e.breaker != null ? String(e.breaker) : '',
            powerSupplyLaborOnly: e.powerSupplyLaborOnly != null ? String(e.powerSupplyLaborOnly) : '',
            powerSupplyLaborMaterials: e.powerSupplyLaborMaterials != null ? String(e.powerSupplyLaborMaterials) : '',
            specialBracketCatwalk: e.specialBracketCatwalk != null ? String(e.specialBracketCatwalk) : '',
            specialBracketWelding: e.specialBracketWelding != null ? String(e.specialBracketWelding) : '',
            excessCopperTubeLaborOnly: e.excessCopperTubeLaborOnly != null ? String(e.excessCopperTubeLaborOnly) : '',
            relocationAccuFcu: e.relocationAccuFcu != null ? String(e.relocationAccuFcu) : '',
            systemReprocessLabor: e.systemReprocessLabor != null ? String(e.systemReprocessLabor) : '',
            drainPumpInstallation: e.drainPumpInstallation != null ? String(e.drainPumpInstallation) : '',
            scaffoldingInstallation: e.scaffoldingInstallation != null ? String(e.scaffoldingInstallation) : '',
            flushingOldPipe: e.flushingOldPipe != null ? String(e.flushingOldPipe) : '',
            sterneBracket: e.sterneBracket != null ? String(e.sterneBracket) : '',
            breakerInstallationLabor: e.breakerInstallationLabor != null ? String(e.breakerInstallationLabor) : '',
            chargingOfFreon: e.chargingOfFreon != null ? String(e.chargingOfFreon) : '',
            materialsReturn: e.materialsReturn != null ? String(e.materialsReturn) : '',
            installationChecklist: e.installationChecklist || '',
            videoUpload: e.videoUpload || '',
            remarks: e.remarks || '',
            audited: e.audited || '',
            status: e.status || 'PENDING',
            customFields: (() => {
              try { return e.customFields ? JSON.parse(e.customFields) : {} } catch { return {} }
            })(),
          }))
        }

        // Automatically fetch latest results from schedules
        const scheduleResult = await fetchAndMapPayroll(branchFilter, mKey, currentBranchName, rates)
        if (!scheduleResult.ok) {
          anySyncFailed = true
          console.error(`[Payroll] Schedules sync failed for ${branchFilter} ${mKey}:`, scheduleResult.error)
        }
        let merged = savedRows
        if (scheduleResult.ok && scheduleResult.rows.length > 0) {
          merged = deduplicateAndMergePayroll(savedRows, scheduleResult.rows)
        }

        // Auto-save when the sync added rows or changed existing ones (e.g. a Payroll Settings
        // rate change re-stamping Allowance / Earth Grounding), so the saved sheet matches.
        if (canManagePayroll && JSON.stringify(merged) !== JSON.stringify(savedRows)) {
          void savePayrollToBackend(merged, branchFilter, mKey)
        }

        combinedSavedRows = deduplicateAndMergePayroll(combinedSavedRows, merged)
      }

      // Auto-discover custom fee columns stored in row customFields so they show up
      setCustomColumnDefs(prev => {
        const known = new Set(prev.map(c => c.key))
        const added: CustomColumnDef[] = []
        for (const r of combinedSavedRows) {
          if (r.customFields) {
            for (const k of Object.keys(r.customFields)) {
              if (k.startsWith('ded:') || k.startsWith('xfer:') || k.startsWith(MANUAL_FEE_PREFIX)) continue
              if (!known.has(k)) {
                known.add(k)
                const label = k.replace(/^custom_/, '').replace(/_/g, ' ')
                added.push({ key: k, label: titleCase(label) })
              }
            }
          }
        }
        return added.length ? [...prev, ...added] : prev
      })

      setRows(combinedSavedRows)
    } catch (e) {
      anySyncFailed = true
      console.error('Failed to auto-fetch payroll and schedules:', e)
    } finally {
      setSyncFailed(anySyncFailed)
      setInitialLoading(false)
      setSyncing(false)
    }
  }, [branchFilter, monthsToFetch, branches, rates, canManagePayroll, savePayrollToBackend])

  useEffect(() => {
    const token = getToken()
    fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const raw = (data?.data || data || [])
          .filter((b: any) => !b.isFranchise && !isFranchiseBranch(b.id) && !isFranchiseBranch(b.name))
          .map((b: any) => ({
            id: b.id,
            name: b.name,
            payrollRates: b.payrollRates,
            isFranchise: false,
          }))
        const sorted = raw.sort((a: any, b: any) => a.name.localeCompare(b.name))
        setBranches(sorted)

        setBranchFilter(prev => {
          if (prev && sorted.some((b: any) => b.id === prev)) return prev
          const taguigSales = sorted.find((b: any) => /TAGUIG.*SALES/i.test(b.name))
            || sorted.find((b: any) => /TAGUIG/i.test(b.name))
          return taguigSales ? taguigSales.id : (sorted[0]?.id || '')
        })
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadAndSync()
  }, [loadAndSync])

  // Shared by every mutation below — groups by month (a row can belong to a different month
  // than the active filter) and pushes each group to its own backend save.
  const flushSave = (updated: PayrollRow[]) => {
    if (canManagePayroll && branchFilter) {
      const monthGroups = new Map<string, PayrollRow[]>()
      for (const r of updated) {
        const m = r.workDate ? r.workDate.slice(0, 7) : (dateFrom ? dateFrom.slice(0, 7) : new Date().toISOString().slice(0, 7))
        if (!monthGroups.has(m)) monthGroups.set(m, [])
        monthGroups.get(m)!.push(r)
      }
      for (const [mKey, mRows] of monthGroups.entries()) {
        void savePayrollToBackend(mRows, branchFilter, mKey)
      }
    }
  }
  const scheduleAutoSave = (updated: PayrollRow[]) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setSaveStatus('saving')
    autoSaveTimer.current = setTimeout(() => flushSave(updated), 700)
  }
  // Save-now for the Deductions modal — skips the debounce so "Save" persists immediately.
  const saveDeductionsNow = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setSaveStatus('saving')
    flushSave(rows)
    setDeductionsModalInstaller(null)
  }

  // Debounced auto-save on row edits (supports functional patch so custom fields never read stale state)
  const updateRow = (id: string, patch: Partial<PayrollRow> | ((prevRow: PayrollRow) => Partial<PayrollRow>)) => {
    setRows(prev => {
      const updated = prev.map(r => {
        if (r.id !== id) return r
        const resolved = typeof patch === 'function' ? patch(r) : patch
        return { ...r, ...resolved }
      })
      scheduleAutoSave(updated)
      return updated
    })
  }

  // Summary-row fields (Remarks/Audited/Payroll Status) apply to the installer's whole period,
  // not one job — so editing them writes the same value across every row grouped under that
  // installer's name, rather than a single row's field.
  const updateInstallerRows = (installerName: string, patch: Partial<PayrollRow>) => {
    setRows(prev => {
      const updated = prev.map(r => resolveGroupKey(r.installerName) === installerName ? { ...r, ...patch } : r)
      scheduleAutoSave(updated)
      return updated
    })
  }

  // Writes one installer's deduction for the visible period. An amount lands on the period's
  // first job, adjusted so the sum across the range equals what was typed (see deductionValue);
  // a balance overwrites the latest row that holds one, else the latest job.
  const setDeduction = (installerRows: PayrollRow[], key: DeductionKey, value: string) => {
    if (installerRows.length === 0) return
    let targetId = installerRows[0].id
    let stored = value
    if (BALANCE_DEDUCTION_KEYS.has(key)) {
      const holder = [...installerRows].reverse().find(r => rawDeduction(r, key))
      targetId = (holder ?? installerRows[installerRows.length - 1]).id
    } else {
      const others = installerRows.reduce((sum, r) => r.id === targetId ? sum : sum + num(rawDeduction(r, key)), 0)
      const own = num(value) - others
      stored = own === 0 ? '' : String(Math.round(own * 100) / 100)
    }
    setRows(prev => {
      const updated = prev.map(r => r.id === targetId
        ? { ...r, customFields: { ...(r.customFields || {}), [DEDUCTION_PREFIX + key]: stored } }
        : r)
      scheduleAutoSave(updated)
      return updated
    })
  }

  // Allowance / Earth Grounding are auto-stamped from the branch rate on every sync; a hand edit
  // (including clearing to zero) flags the row so re-syncs keep the user's value instead.
  const setAutoStampedFee = (id: string, field: AutoStampedFee, v: string) => {
    setRows(prev => {
      const updated = prev.map(r => r.id === id
        ? { ...r, [field]: v, customFields: { ...(r.customFields || {}), [MANUAL_FEE_PREFIX + field]: '1' } }
        : r)
      scheduleAutoSave(updated)
      return updated
    })
  }

  const columnAccessors: Record<string, { get: (r: PayrollRow) => string; set: (id: string, v: string) => void }> = {
    date: { get: r => r.workDate, set: (id, v) => updateRow(id, { workDate: v }) },
    ticketNumber: { get: r => r.ticketNumber, set: (id, v) => updateRow(id, { ticketNumber: v }) },
    customerName: { get: r => r.customerName, set: (id, v) => updateRow(id, { customerName: v }) },
    brandCapacity: { get: r => r.brandCapacity, set: (id, v) => updateRow(id, { brandCapacity: v }) },
    remit: { get: r => r.actualCollected, set: (id, v) => updateRow(id, { actualCollected: v }) },
    installationUpload: { get: r => r.installationUpload, set: (id, v) => updateRow(id, { installationUpload: v }) },
    installationFee: { get: r => r.installationFee, set: (id, v) => updateRow(id, { installationFee: v }) },
    totalPipeLength: { get: r => r.totalPipeLength, set: (id, v) => updateRow(id, { totalPipeLength: v }) },
    earthGrounding: { get: r => r.earthGrounding, set: (id, v) => setAutoStampedFee(id, 'earthGrounding', v) },
    dailyAllowance: { get: r => r.dailyAllowance, set: (id, v) => setAutoStampedFee(id, 'dailyAllowance', v) },
    excessCopperTube: { get: r => r.excessCopperTube, set: (id, v) => updateRow(id, { excessCopperTube: v }) },
    hauling: { get: r => r.hauling, set: (id, v) => updateRow(id, { hauling: v }) },
    dismantling: { get: r => r.dismantling, set: (id, v) => updateRow(id, { dismantling: v }) },
    electricalWorks: { get: r => r.electricalWorks, set: (id, v) => updateRow(id, { electricalWorks: v }) },
    chippingWorks: { get: r => r.chippingWorks, set: (id, v) => updateRow(id, { chippingWorks: v }) },
    breaker: { get: r => r.breaker, set: (id, v) => updateRow(id, { breaker: v }) },
    powerSupplyLaborOnly: { get: r => r.powerSupplyLaborOnly, set: (id, v) => updateRow(id, { powerSupplyLaborOnly: v }) },
    powerSupplyLaborMaterials: { get: r => r.powerSupplyLaborMaterials, set: (id, v) => updateRow(id, { powerSupplyLaborMaterials: v }) },
    specialBracketCatwalk: { get: r => r.specialBracketCatwalk, set: (id, v) => updateRow(id, { specialBracketCatwalk: v }) },
    specialBracketWelding: { get: r => r.specialBracketWelding, set: (id, v) => updateRow(id, { specialBracketWelding: v }) },
    excessCopperTubeLaborOnly: { get: r => r.excessCopperTubeLaborOnly, set: (id, v) => updateRow(id, { excessCopperTubeLaborOnly: v }) },
    relocationAccuFcu: { get: r => r.relocationAccuFcu, set: (id, v) => updateRow(id, { relocationAccuFcu: v }) },
    systemReprocessLabor: { get: r => r.systemReprocessLabor, set: (id, v) => updateRow(id, { systemReprocessLabor: v }) },
    drainPumpInstallation: { get: r => r.drainPumpInstallation, set: (id, v) => updateRow(id, { drainPumpInstallation: v }) },
    scaffoldingInstallation: { get: r => r.scaffoldingInstallation, set: (id, v) => updateRow(id, { scaffoldingInstallation: v }) },
    flushingOldPipe: { get: r => r.flushingOldPipe, set: (id, v) => updateRow(id, { flushingOldPipe: v }) },
    sterneBracket: { get: r => r.sterneBracket, set: (id, v) => updateRow(id, { sterneBracket: v }) },
    breakerInstallationLabor: { get: r => r.breakerInstallationLabor, set: (id, v) => updateRow(id, { breakerInstallationLabor: v }) },
    chargingOfFreon: { get: r => r.chargingOfFreon, set: (id, v) => updateRow(id, { chargingOfFreon: v }) },
    materialsReturn: { get: r => r.materialsReturn, set: (id, v) => updateRow(id, { materialsReturn: v }) },
    installationChecklist: { get: r => r.installationChecklist, set: (id, v) => updateRow(id, { installationChecklist: v }) },
    videoUpload: { get: r => r.videoUpload, set: (id, v) => updateRow(id, { videoUpload: v }) },
    remarks: { get: r => r.remarks, set: (id, v) => updateRow(id, { remarks: v }) },
    audited: { get: r => r.audited, set: (id, v) => updateRow(id, { audited: v }) },
  }
  // Custom columns read/write row.customFields[key], merging safely via functional update
  for (const cc of customColumnDefs) {
    columnAccessors[cc.key] = {
      get: r => r.customFields?.[cc.key] || '',
      set: (id, v) => updateRow(id, prevRow => ({
        customFields: { ...(prevRow.customFields || {}), [cc.key]: v },
      })),
    }
  }

  const getColAccessor = (key: string) => {
    if (columnAccessors[key]) return columnAccessors[key]
    return {
      get: (r: PayrollRow) => r.customFields?.[key] || (r as any)[key] || '',
      set: (id: string, v: string) => updateRow(id, prevRow => ({
        customFields: { ...(prevRow.customFields || {}), [key]: v },
      })),
    }
  }

  // Shared helper — used both by the column manager checkboxes (via toggleColumn) and the
  // right-click context menu (which knows the installer name directly, without the modal).
  const toggleColumnForInstaller = (installerName: string, key: ColumnKey) => {
    if (COLUMN_DEFS.find(c => c.key === key)?.pinned) return
    setHiddenColumnsByInstaller(prev => {
      const current = prev[installerName] ?? new Set(DEFAULT_HIDDEN_COLUMNS)
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, [installerName]: next }
    })
  }
  const toggleColumn = (key: ColumnKey) => {
    if (!columnManagerFor) return
    toggleColumnForInstaller(columnManagerFor, key)
  }
  const openColumnManager = (installerName: string) => {
    setColumnSearch('')
    setColumnManagerFor(installerName)
  }
  // Swaps the whole visible set in one click — still just writes to the same
  // hiddenColumnsByInstaller state the per-checkbox toggles use, so it's fully undoable.
  const applyColumnPreset = (cats: ColumnCategory[]) => {
    if (!columnManagerFor) return
    const toHide = COLUMN_DEFS.filter(c => !c.pinned && !cats.includes(c.category as ColumnCategory)).map(c => c.key as ColumnKey)
    setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set(toHide) }))
  }

  // The grouping key IS the resolved identity now (not the raw ticket text), so "CRIS" and
  // "CRISANTO" — or any other alias of the same technician — collapse into one roster row
  // instead of showing as separate bogus entries. A hyphenated blob like "MARIANO-PATRICK"
  // (not caught by splitInstallerNames' /,&+/ delimiters — those are left alone in
  // payrollDerive.ts since a hyphen can also be part of one real name, e.g. "JHAY-AR") is
  // folded to its first segment before resolution, unless the whole string is itself a real
  // alias.
  const resolveGroupKey = (raw: string): string => {
    const trimmed = raw.trim()
    if (!trimmed) return 'UNASSIGNED'
    const folded = (!installerAliases[trimmed.toUpperCase()] && trimmed.includes('-'))
      ? (trimmed.split('-')[0].trim() || trimmed)
      : trimmed
    return resolveInstallerIdentity(folded)
  }

  // Every technician option the dropdown can offer — scoped to the selected date range (only
  // installers with a job in that window show up), but independent of technicianFilter itself
  // (so picking one doesn't collapse the list to just itself) and of the free-text search.
  const technicianOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      if (row.workDate) {
        if (dateFrom && row.workDate < dateFrom) continue
        if (dateTo && row.workDate > dateTo) continue
      }
      const key = resolveGroupKey(row.installerName)
      if (inHouseTechnicianNames.has(key)) continue
      set.add(key)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dateFrom, dateTo, installerAliases, inHouseTechnicianNames])

  const filteredRows = useMemo(() => {
    const term = search.toLowerCase()
    return rows.filter(r => {
      const groupKey = resolveGroupKey(r.installerName)
      // In-house (salaried) technicians are paid a fixed wage, not per job — keep them off
      // this pakyaw/contract payroll sheet entirely.
      if (inHouseTechnicianNames.has(groupKey)) return false
      if (technicianFilter && groupKey !== technicianFilter) return false
      if (term && !(
        r.installerName.toLowerCase().includes(term)
        || r.customerName.toLowerCase().includes(term)
        || r.cityAddress.toLowerCase().includes(term)
      )) return false
      // Rows with no date (rare hand-added rows) aren't excluded by a date range —
      // there's nothing to range-check, so they stay visible regardless of the filter.
      if (r.workDate) {
        if (dateFrom && r.workDate < dateFrom) return false
        if (dateTo && r.workDate > dateTo) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, dateFrom, dateTo, technicianFilter, installerAliases, inHouseTechnicianNames])

  const grouped = useMemo(() => {
    const map = new Map<string, PayrollRow[]>()
    for (const row of filteredRows) {
      const key = resolveGroupKey(row.installerName)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    // Job order = chronological sequence — keep each installer's rows sorted by date
    // regardless of sync/insertion order. Undated (manually added) rows sort to the end.
    for (const installerRows of map.values()) {
      installerRows.sort((a, b) => {
        if (!a.workDate) return 1
        if (!b.workDate) return -1
        return a.workDate.localeCompare(b.workDate)
      })
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, installerAliases])

  const grandTotal = useMemo(() => grouped.reduce((sum, [, r]) => sum + installerTotal(r), 0), [grouped])
  const globalDeductionTotal = useMemo(() => grouped.reduce((sum, [, r]) => sum + deductionTotal(r), 0), [grouped])
  const globalBaseInstallTotal = useMemo(() => baseInstallTotal(filteredRows), [filteredRows])
  const globalRemittanceTotal = useMemo(() => remittanceTotal(filteredRows), [filteredRows])
  const globalAddOnTotal = grandTotal - globalBaseInstallTotal

  const currentBranchDisplay = branchFilter
    ? formatBranchName(branches.find(b => b.id === branchFilter)?.name || user?.branchId || '')
    : ''


  // If filters change out from under the selected installer (different month/branch/search
  // leaves them with zero rows), fall back to the roster instead of showing a stuck blank page.
  useEffect(() => {
    if (selectedInstaller && !grouped.some(([name]) => name === selectedInstaller)) {
      setSelectedInstaller(null)
    }
  }, [grouped, selectedInstaller])

  // Same fallback for the technician dropdown — narrowing the date range can drop the
  // selected technician's only job out of range, so clear it instead of showing a stuck
  // "no rows for this technician" roster.
  useEffect(() => {
    if (technicianFilter && !technicianOptions.includes(technicianFilter)) {
      setTechnicianFilter('')
    }
  }, [technicianOptions, technicianFilter])

  // Re-check the job list's scroll edges whenever its width or its columns can change.
  useEffect(() => {
    const el = listScrollRef.current
    if (!el) return
    updateListEdges(el)
    const ro = new ResizeObserver(() => updateListEdges(el))
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [selectedInstaller, grouped, hiddenColumnsByInstaller, customColumnDefs, updateListEdges])


  const visibleColumnsFor = (installerName: string): ColumnDef[] => {
    const hidden = hiddenColumnsFor(installerName)
    const fixed = COLUMN_DEFS.filter(c => c.pinned || !hidden.has(c.key as ColumnKey))
    // Custom columns always show, right after the fixed set — no per-installer hide/show yet.
    const custom: ColumnDef[] = customColumnDefs.map(cc => ({
      key: cc.key, label: cc.label, width: 120, align: 'right', isMoney: true,
    }))
    return [...fixed, ...custom]
  }
  const zebraBg = isLight ? '#f8fafc' : '#0c1420'
  const rowHoverBg = isLight ? '#eef2f7' : '#111d33'
  const headerBg = isLight ? '#f8fafc' : '#0d1520'

  // Amount + Method live in one free-text `remit` field today — tinted distinctly from the
  // Technician Labor & Add-ons columns so remittance (money owed BACK to the branch) never
  // reads as part of the crew's payout.
  const remitTint = isLight ? '#F0F9FF' : 'rgba(56,189,248,0.10)'
  const remitAccent = isLight ? '#0369A1' : '#7DD3FC'

  /** Read-only text for a list cell. Editing lives in the row popup, so the list only needs
   *  a display value — money right-aligned and blanked when zero so the eye lands on the
   *  columns that actually carry a fee. Custom columns resolve through the same accessors. */
  const listCellText = (col: ColumnDef, row: PayrollRow): string => {
    const raw = getColAccessor(col.key).get(row)
    if (col.isMoney) {
      const n = num(String(raw))
      return n === 0 ? '—' : `₱${peso(n)}`
    }
    if (col.key === 'date') return row.workDate ? shortDate(row.workDate) : '—'
    return String(raw).trim() || '—'
  }

  // Mobile card value cell — same accessors as the desktop grid, just without the
  // sticky/pin plumbing a card list doesn't need. Date/Ticket #/Customer Name and Job
  // Total are never passed in here — the mobile card shows those in its header instead.
  const renderMobileCellValue = (col: ColumnDef, row: PayrollRow) => {
    const smallInputCls = "w-full text-right px-2.5 py-2.5 rounded-lg text-base font-semibold uppercase bg-transparent border-0 outline-none focus:ring-1 focus:ring-emerald-500/40"
    const acc = getColAccessor(col.key)

    if (col.key === 'remit') {
      return (
        <input
          type="text"
          value={acc.get(row)}
          onChange={e => acc.set(row.id, e.target.value)}
          className={smallInputCls}
          style={{ backgroundColor: remitTint, borderRadius: 8 }}
        />
      )
    }

    // Free text, not amount-only — installers note what was returned (e.g. "2pcs wire"),
    // not just a peso figure, so it can't be locked to a numeric-only input like the other
    // money columns. Still summed into rowTotal() via num(), same as remit above.
    if (col.key === 'materialsReturn') {
      return (
        <input
          type="text"
          value={acc.get(row)}
          onChange={e => acc.set(row.id, e.target.value)}
          className={smallInputCls}
        />
      )
    }

    if (col.isMoney) {
      return (
        <NumericFormat
          thousandSeparator=","
          decimalScale={2}
          allowNegative={false}
          value={acc.get(row)}
          onValueChange={values => acc.set(row.id, values.value)}
          className={smallInputCls}
        />
      )
    }

    return (
      <input
        type="text"
        value={acc.get(row)}
        onChange={e => acc.set(row.id, e.target.value)}
        className={smallInputCls}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-4 md:pb-4 h-full min-h-0 overflow-y-auto overflow-x-hidden [&>*]:shrink-0">
      {/* Toolbar — branch, date, range, and search filters plus a sync action. */}
      <div
        className="relative z-30 -mx-5 md:mx-0 rounded-none md:rounded-2xl p-2.5 md:p-3.5 flex items-center gap-1.5 md:gap-2.5 overflow-visible shadow-xs"
        style={{ backgroundColor: cardBg, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}` }}
      >
          {/* Branch filter */}
          {canManagePayroll ? (
            <div className="relative w-36 md:w-48 lg:w-52 shrink-0">
              <Building2 className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 md:py-2 rounded-xl text-xs font-bold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all truncate"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                aria-label="Filter by Branch"
              >
                <option value="">Select branch…</option>
                {branches.filter(b => !(Boolean((b as any).isFranchise) || isFranchiseBranch(b.id) || isFranchiseBranch(b.name))).map(b => {
                  return (
                    <option key={b.id} value={b.id}>
                      {formatBranchName(b.name)}
                    </option>
                  )
                })}
              </select>
              <ChevronDown className="absolute right-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl border text-xs font-bold shrink-0 whitespace-nowrap" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
              <Building2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span className="truncate max-w-[120px]">
                {branches.find(b => b.id === branchFilter)?.name
                  ? formatBranchName(branches.find(b => b.id === branchFilter)!.name)
                  : formatBranchName(user?.branchId || 'My Branch')}
              </span>
            </div>
          )}

          {/* Date Range Filter with Quick Presets */}
          <div ref={dateRangeRef} className="relative z-40 shrink-0">
            <button
              type="button"
              onClick={openDateRange}
              className="flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl border text-xs font-bold transition-all whitespace-nowrap shadow-xs hover:border-emerald-500/50"
              style={{
                backgroundColor: (dateFrom || dateTo) ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)') : inputBg,
                borderColor: (dateFrom || dateTo) ? '#10B98160' : inputBorder,
                color: (dateFrom || dateTo) ? (isLight ? '#047857' : '#10B981') : textMuted,
              }}
            >
              <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                {dateFrom && dateTo
                  ? `${shortDate(dateFrom)} – ${shortDate(dateTo)}`
                  : dateFrom
                    ? `From ${shortDate(dateFrom)}`
                    : dateTo
                      ? `Until ${shortDate(dateTo)}`
                      : 'Date range'}
              </span>
              {(dateFrom || dateTo) ? (
                <span
                  onClick={e => { e.stopPropagation(); clearDateRange() }}
                  className="ml-0.5 p-0.5 rounded-full hover:bg-emerald-500/20 transition-colors"
                  title="Clear date filter"
                >
                  <X className="w-3.5 h-3.5 text-emerald-500" />
                </span>
              ) : (
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${dateRangeOpen ? 'rotate-180' : ''}`} />
              )}
            </button>

            {dateRangeOpen && (
              <div
                className="absolute top-full left-0 mt-2 rounded-2xl overflow-hidden p-3.5 flex flex-col gap-3 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                style={{
                  backgroundColor: cardBg,
                  border: `1px solid ${border}`,
                  minWidth: '280px',
                  boxShadow: isLight ? '0 20px 60px rgba(0,0,0,0.14)' : '0 20px 60px rgba(0,0,0,0.7)',
                }}
              >
                {/* Quick presets */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500">Quick Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const r = getFridayToFriday(new Date())
                        applyPreset(r.from, r.to)
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left border transition-all hover:border-emerald-500"
                      style={{
                        backgroundColor: (dateFrom === defaultWeek.from && dateTo === defaultWeek.to) ? (isLight ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.2)') : inputBg,
                        borderColor: (dateFrom === defaultWeek.from && dateTo === defaultWeek.to) ? '#10B981' : inputBorder,
                        color: (dateFrom === defaultWeek.from && dateTo === defaultWeek.to) ? '#10B981' : textPrimary,
                      }}
                    >
                      This Week (Fri–Fri)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = getLastWeekFridayToFriday(new Date())
                        applyPreset(r.from, r.to)
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left border transition-all hover:border-emerald-500"
                      style={{
                        backgroundColor: inputBg,
                        borderColor: inputBorder,
                        color: textPrimary,
                      }}
                    >
                      Last Week (Fri–Fri)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = getThisMonthRange(new Date())
                        applyPreset(r.from, r.to)
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left border transition-all hover:border-emerald-500"
                      style={{
                        backgroundColor: inputBg,
                        borderColor: inputBorder,
                        color: textPrimary,
                      }}
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = getLastMonthRange(new Date())
                        applyPreset(r.from, r.to)
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left border transition-all hover:border-emerald-500"
                      style={{
                        backgroundColor: inputBg,
                        borderColor: inputBorder,
                        color: textPrimary,
                      }}
                    >
                      Last Month
                    </button>
                  </div>
                </div>

                <div className="h-px w-full" style={{ backgroundColor: border }} />

                {/* Custom range input */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Custom Range</span>
                  <div className="flex flex-col gap-2">
                    {/* From Date Button */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold" style={{ color: textMuted }}>From Date</label>
                      <div
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input')
                          try { input?.showPicker() } catch { input?.focus() }
                        }}
                        className="relative flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all hover:border-emerald-500 group shadow-xs select-none"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                      >
                        <div className="flex items-center gap-2 pointer-events-none">
                          <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-bold" style={{ color: draftDateFrom ? textPrimary : textMuted }}>
                            {draftDateFrom ? new Date(draftDateFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select start date...'}
                          </span>
                        </div>
                        <input
                          type="date"
                          value={draftDateFrom}
                          onChange={e => setDraftDateFrom(e.target.value)}
                          max={draftDateTo || undefined}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors pointer-events-none" />
                      </div>
                    </div>

                    {/* To Date Button */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold" style={{ color: textMuted }}>To Date</label>
                      <div
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input')
                          try { input?.showPicker() } catch { input?.focus() }
                        }}
                        className="relative flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all hover:border-emerald-500 group shadow-xs select-none"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                      >
                        <div className="flex items-center gap-2 pointer-events-none">
                          <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-bold" style={{ color: draftDateTo ? textPrimary : textMuted }}>
                            {draftDateTo ? new Date(draftDateTo + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select end date...'}
                          </span>
                        </div>
                        <input
                          type="date"
                          value={draftDateTo}
                          onChange={e => setDraftDateTo(e.target.value)}
                          min={draftDateFrom || undefined}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t" style={{ borderColor: border }}>
                  <button
                    type="button"
                    onClick={clearDateRange}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all hover:bg-slate-500/10"
                    style={{ color: textMuted }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={applyDateRange}
                    className="flex-1 py-1.5 rounded-xl text-xs font-black text-white transition-all shadow-xs active:scale-95"
                    style={{ backgroundColor: '#10B981' }}
                  >
                    Apply Range
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Technician filter — narrows the roster below to one installer */}
          {branchFilter && (
            <div className="relative w-32 md:w-44 lg:w-48 shrink-0">
              <Users className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
              <select
                value={technicianFilter}
                onChange={e => setTechnicianFilter(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 md:py-2 rounded-xl text-xs font-bold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all truncate"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                aria-label="Filter by Technician"
              >
                <option value="">All technicians</option>
                {technicianOptions.map(name => (
                  <option key={name} value={name}>{titleCase(displayInstallerName(name))}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
            </div>
          )}

          {/* Search */}
          <div className="relative w-32 md:w-60 lg:w-64 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search..."
              value={rawSearch}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all border"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>

          {/* Sync Latest Button */}
          {branchFilter && (
            <button
              type="button"
              onClick={() => void loadAndSync(true)}
              disabled={syncing || initialLoading}
              className="flex items-center gap-2 px-3.5 py-1.5 md:py-2 rounded-xl border text-xs font-bold shrink-0 transition-all shadow-xs disabled:opacity-50 cursor-pointer hover:border-emerald-500/50 active:scale-95"
              style={syncFailed && !syncing
                ? {
                    backgroundColor: isLight ? 'rgba(220,38,38,0.08)' : 'rgba(248,113,113,0.14)',
                    borderColor: isLight ? '#DC262660' : '#F8717160',
                    color: isLight ? '#DC2626' : '#F87171',
                  }
                : {
                    backgroundColor: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)',
                    borderColor: '#10B98150',
                    color: '#10B981',
                  }}
              title={syncFailed
                ? "Couldn't pull the latest jobs from Schedules — showing only previously saved rows, which may stop partway through the period. Click to retry."
                : 'Sync latest completed job orders from Schedules (DONE INSTALL, DONE CLEANING, DONE CHECKUP, DONE SERVICE, etc.)'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing…' : syncFailed ? 'Sync failed — Retry' : 'Sync Latest'}</span>
            </button>
          )}

          {/* Payroll Settings — per-branch rate presets (e.g. SILANG's cleaning fee differs
              from other branches). Only meaningful once a branch is selected. */}
          {canManagePayroll && branchFilter && (
            <button
              type="button"
              onClick={openRatesModal}
              className="flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl border text-xs font-bold shrink-0 transition-all hover:border-emerald-500/50"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              title="Set this branch's payroll rates"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden md:inline">Payroll Settings</span>
            </button>
          )}
      </div>

      {/* The letterhead and the roster below it read as one continuous payroll ledger — same
          document metaphor as the branch's own printed weekly sheet — so they're fused with a
          shared border/no gap whenever the roster table is actually what's rendered below. */}
      {(() => {
        const showRosterLedger = !initialLoading && !!branchFilter && grouped.length > 0 && !selectedInstaller
        return (
      <div className={`flex flex-col ${showRosterLedger ? 'rounded-2xl shadow-sm' : ''}`} style={{ gap: showRosterLedger ? 0 : '1rem' }}>
      {branchFilter && !selectedInstaller && (
        <div
          className={`${showRosterLedger ? 'rounded-t-2xl border border-b-0' : 'rounded-2xl border shadow-sm'}`}
          style={{
            borderColor: border,
            backgroundColor: cardBg,
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 sm:px-7 py-5">
            <div className="min-w-0">
              <div className="text-base font-bold tracking-tight truncate" style={{ color: textPrimary }}>
                {currentBranchDisplay || 'Branch'} Installer&rsquo;s Payroll
              </div>
              <div className="text-xs font-medium opacity-70" style={{ color: textMuted }}>
                Weekly payroll &amp; allowance summary
              </div>
            </div>

            {(dateFrom || dateTo) && (
              <div
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 self-start sm:self-auto"
                style={{
                  backgroundColor: inputBg,
                  border: `1px solid ${border}`,
                  color: textPrimary,
                }}
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{dateFrom ? longDate(dateFrom) : '—'} – {dateTo ? longDate(dateTo) : '—'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {initialLoading ? (
        <div className="rounded-2xl p-6 flex flex-col gap-2" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: '40px', borderRadius: '8px',
              background: isLight ? '#f1f5f9' : '#0d1520',
            }} />
          ))}
        </div>
      ) : !branchFilter ? (
        <div className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <Building2 className="w-10 h-10 opacity-25" />
          <p className="text-sm font-semibold" style={{ color: textMuted }}>Select a branch to view payroll.</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <CheckCircle2 className="w-10 h-10 opacity-25 text-emerald-500" />
          <p className="text-sm font-semibold" style={{ color: textMuted }}>No payroll entries yet — try "Sync from Schedules".</p>
        </div>
      ) : selectedInstaller ? (
        // Detail view — just the selected installer's own table. No branch letterhead here —
        // the installer's own name in the masthead below already says whose payroll this is.
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setSelectedInstaller(null)}
            className="flex items-center gap-1.5 self-start px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={{ color: textMuted, backgroundColor: isLight ? '#eef2f7' : '#111d33' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            All installers
          </button>

          {grouped.filter(([name]) => name === selectedInstaller).map(([installerName, installerRows]) => {
            const groupVisibleColumns = visibleColumnsFor(installerName)
            // Each column is sized to its own content — the longest value (or the column's
            // total), or its header wrapped onto two lines — so nothing gets squashed or cut
            // off. Wide screens share the spare room out; narrow ones scroll sideways.
            const listTotals = groupVisibleColumns.map(col => {
              if (col.key === 'remit') return remittanceTotal(installerRows)
              if (!col.isMoney) return null
              return installerRows.reduce((sum, r) => sum + num(String(columnAccessors[col.key]?.get(r) ?? '')), 0)
            })
            const listWidths = groupVisibleColumns.map((col, i) => {
              const label = col.label.toUpperCase()
              const headW = measureText(label, LIST_HEAD_FONT, LIST_HEAD_TRACKING)
              let cellW = 0
              for (const row of installerRows) {
                const text = listCellText(col, row)
                const w = measureText(text, col.key === 'customerName' ? LIST_CELL_BOLD_FONT : LIST_CELL_FONT)
                if (w > cellW) cellW = w
              }
              const total = listTotals[i]
              if (total) cellW = Math.max(cellW, measureText(`₱${peso(total)}`, LIST_CELL_BOLD_FONT))
              const pad = 36 + (i === 0 ? 12 : 0)
              const autoW = Math.ceil(Math.max(60, headW, cellW) + pad)
              const dragged = userWidthFor(col.key)
              return dragged ?? autoW
            })
            // Date + Ticket stay a fixed width so Customer's sticky offset is exact; Customer
            // takes the biggest share of spare room, every other column an even share.
            const listGridTemplate = groupVisibleColumns.map((col, i) => {
              // A dragged width is exact; so are Date + Ticket (Customer's sticky offset needs them).
              if (col.key === 'date' || col.key === 'ticketNumber' || userWidthFor(col.key)) return `${listWidths[i]}px`
              return `minmax(${listWidths[i]}px, ${col.key === 'customerName' ? 3 : 1}fr)`
            }).join(' ')
            const listMinWidth = listWidths.reduce((sum, w) => sum + w, 0)
            const listPinLeft: Record<string, number> = {}
            {
              let running = 0
              groupVisibleColumns.forEach((col, i) => {
                if (!LIST_PINNED_KEYS.includes(col.key)) return
                listPinLeft[col.key] = running
                running += listWidths[i]
              })
            }
            const lastListPinKey = [...groupVisibleColumns].reverse().find(c => LIST_PINNED_KEYS.includes(c.key))?.key
            const listCellStyle = (col: ColumnDef, i: number, bg: string): CSSProperties => ({
              ...(i < groupVisibleColumns.length - 1 ? { borderRight: `1px solid ${border}` } : {}),
              textAlign: 'left',
              ...(listPinLeft[col.key] !== undefined ? { position: 'sticky', left: listPinLeft[col.key], zIndex: 2, backgroundColor: bg } : {}),
            })
            return (
              <div key={installerName} className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
                <div
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-4"
                  style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}
                >
                  <div />
                  <span className="text-xl md:text-2xl font-extrabold uppercase tracking-wide text-center whitespace-nowrap" style={{ color: textPrimary }}>
                    {titleCase(displayInstallerName(installerName))}
                  </span>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => openColumnManager(installerName)}
                      title="Show/hide columns"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border hover:border-emerald-500/50 cursor-pointer"
                      style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                      Columns
                    </button>
                  </div>
                </div>

                {/* Desktop list — the columns the column manager leaves visible (including
                      any custom ones), read-only, one line per job. Clicking a row opens the
                      popup, which is where editing happens. Content-sized columns with grid
                      lines; Date/Ticket/Customer stay pinned while the rest scrolls sideways
                      on a big, easy-to-grab scrollbar, with fade + arrow cues at each edge. */}
                  <div className="hidden md:block relative">
                    <style>{`
                      .pl-row { --pl-bg: ${cardBg}; background-color: var(--pl-bg); }
                      .pl-row.pl-zebra { --pl-bg: ${zebraBg}; }
                      .pl-row:hover, .pl-row:focus-visible { --pl-bg: ${rowHoverBg}; outline: none; }
                      .pl-scroll { scrollbar-width: auto; scrollbar-color: ${isLight ? '#94a3b8' : '#3b4f72'} ${headerBg}; }
                      .pl-scroll::-webkit-scrollbar { height: 14px; }
                      .pl-scroll::-webkit-scrollbar-track { background: ${headerBg}; border-top: 1px solid ${border}; }
                      .pl-scroll::-webkit-scrollbar-thumb { background: ${isLight ? '#94a3b8' : '#3b4f72'}; border-radius: 999px; border: 3px solid ${headerBg}; }
                      .pl-scroll::-webkit-scrollbar-thumb:hover { background: #10B981; }
                      .pl-scroll[data-scrolled="1"] .pl-pin-edge { box-shadow: 8px 0 10px -8px rgba(15,23,42,${isLight ? 0.2 : 0.6}); }
                    `}</style>
                    <div
                      ref={listScrollRef}
                      className="pl-scroll w-full overflow-x-auto"
                      onScroll={e => updateListEdges(e.currentTarget)}
                    >
                      <div style={{ minWidth: listMinWidth }}>
                        {/* Header */}
                        <div
                          className="grid text-[11px] font-bold uppercase tracking-wide"
                          style={{ gridTemplateColumns: listGridTemplate, borderBottom: `2px solid ${border}`, color: textMuted, backgroundColor: headerBg }}
                        >
                          {groupVisibleColumns.map((col, i) => (
                            <div
                              key={col.key}
                              className={`relative px-3 py-2.5 flex items-center leading-tight select-none text-left ${i === 0 ? 'pl-6' : ''} ${col.key === lastListPinKey ? 'pl-pin-edge' : ''}`}
                              style={{
                                ...listCellStyle(col, i, headerBg),
                                color: col.key === 'remit' ? remitAccent : textMuted,
                                ...(col.key === 'remit' ? { backgroundColor: remitTint } : {}),
                              }}
                              title={col.label}
                              onContextMenu={e => {
                                e.preventDefault()
                                setColCtxMenu({ x: e.clientX, y: e.clientY, col, installerName })
                              }}
                            >
                              <span className="flex-1 min-w-0 overflow-hidden whitespace-nowrap">{col.label}</span>
                              {/* Drag to resize (saved across reloads); double-click to auto-fit again. */}
                              <span
                                onMouseDown={startColumnResize(col.key)}
                                onDoubleClick={() => resetColumnWidth(col.key)}
                                onClick={e => e.stopPropagation()}
                                title="Drag to resize · double-click to auto-fit"
                                className="group absolute top-0 -right-[4px] h-full w-[9px] cursor-col-resize z-10 flex justify-center"
                              >
                                <span
                                  className="h-full w-[3px] rounded-full transition-colors group-hover:bg-emerald-500/70"
                                  style={resizingKey === col.key ? { backgroundColor: '#10B981' } : undefined}
                                />
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Job rows */}
                        {installerRows.map((row, idx) => (
                          <div
                            key={row.id}
                            tabIndex={0}
                            title="Right-click to view job details · Double-click cell to edit"
                            onContextMenu={e => {
                              e.preventDefault()
                              setDetailRow(row)
                            }}
                            className={`pl-row grid ${idx % 2 === 1 ? 'pl-zebra' : ''}`}
                            style={{ gridTemplateColumns: listGridTemplate, borderBottom: `1px solid ${border}`, fontSize: '13px', color: textPrimary }}
                          >
                            {groupVisibleColumns.map((col, i) => {
                              const text = listCellText(col, row)
                              const empty = text === '—'
                              const isStatus = col.key === 'installationUpload'
                              const isDone = isStatus && /^DONE\b/i.test(text)
                              const isReadOnly = Boolean(col.readOnlyWhenSynced && row.ticketId)
                              const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key
                              const acc = getColAccessor(col.key)

                              const handleCellKeyDown = (e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  e.preventDefault()
                                  setEditingCell(null)
                                } else if (e.key === 'Tab') {
                                  e.preventDefault()
                                  const editableCols = groupVisibleColumns.filter(c => !(c.readOnlyWhenSynced && Boolean(row.ticketId)))
                                  const curIdx = editableCols.findIndex(c => c.key === col.key)
                                  if (curIdx !== -1) {
                                    const step = e.shiftKey ? -1 : 1
                                    const nextCol = editableCols[curIdx + step]
                                    if (nextCol) {
                                      setEditingCell({ rowId: row.id, colKey: nextCol.key })
                                      return
                                    }
                                  }
                                  setEditingCell(null)
                                }
                              }

                              const startCellEdit = () => {
                                if (!isReadOnly) {
                                  setEditingCell({ rowId: row.id, colKey: col.key })
                                }
                              }

                              const handleCellTouchEnd = (e: React.TouchEvent) => {
                                if (isReadOnly) return
                                const now = Date.now()
                                if (
                                  lastCellTapRef.current &&
                                  lastCellTapRef.current.rowId === row.id &&
                                  lastCellTapRef.current.colKey === col.key &&
                                  now - lastCellTapRef.current.time < 350
                                ) {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  startCellEdit()
                                  lastCellTapRef.current = null
                                } else {
                                  lastCellTapRef.current = { rowId: row.id, colKey: col.key, time: now }
                                }
                              }

                              const inlineInputStyle: React.CSSProperties = {
                                backgroundColor: isLight ? '#ffffff' : '#0f172a',
                                borderColor: '#10B981',
                                color: col.key === 'remit' ? remitAccent : textPrimary,
                                boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)',
                              }

                              if (isEditing) {
                                return (
                                  <div
                                    key={col.key}
                                    className={`px-1.5 py-1 flex items-center justify-start min-w-0 overflow-hidden text-left ${i === 0 ? 'pl-4' : ''} ${col.key === lastListPinKey ? 'pl-pin-edge' : ''}`}
                                    style={{
                                      ...listCellStyle(col, i, 'var(--pl-bg)'),
                                      ...(col.key === 'remit' ? { backgroundColor: remitTint } : {}),
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    onDoubleClick={e => e.stopPropagation()}
                                  >
                                    {col.isMoney ? (
                                      <NumericFormat
                                        autoFocus
                                        thousandSeparator=","
                                        decimalScale={2}
                                        allowNegative={false}
                                        placeholder="0.00"
                                        value={acc.get(row)}
                                        onValueChange={values => acc.set(row.id, values.value)}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={handleCellKeyDown}
                                        onBlur={() => setEditingCell(null)}
                                        onContextMenu={e => e.stopPropagation()}
                                        className="w-full h-7 px-2 py-0.5 text-[13px] font-semibold rounded-md border outline-none text-right tabular-nums"
                                        style={inlineInputStyle}
                                      />
                                    ) : col.key === 'date' ? (
                                      <input
                                        autoFocus
                                        type="date"
                                        value={acc.get(row)}
                                        onChange={e => acc.set(row.id, e.target.value)}
                                        onKeyDown={handleCellKeyDown}
                                        onBlur={() => setEditingCell(null)}
                                        onContextMenu={e => e.stopPropagation()}
                                        className="w-full h-7 px-2 py-0.5 text-[13px] font-medium rounded-md border outline-none text-left"
                                        style={{ ...inlineInputStyle, colorScheme: isLight ? 'light' : 'dark' }}
                                      />
                                    ) : (
                                      <input
                                        autoFocus
                                        type="text"
                                        value={acc.get(row)}
                                        onChange={e => acc.set(row.id, e.target.value)}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={handleCellKeyDown}
                                        onBlur={() => setEditingCell(null)}
                                        onContextMenu={e => e.stopPropagation()}
                                        placeholder={col.key === 'remit' ? 'e.g. 1,000 CASH' : ''}
                                        className={`w-full h-7 px-2 py-0.5 text-[13px] font-medium rounded-md border outline-none ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                                        style={inlineInputStyle}
                                      />
                                    )}
                                  </div>
                                )
                              }

                              return (
                                <div
                                  key={col.key}
                                  className={`px-3 py-2.5 flex items-center justify-start min-w-0 overflow-hidden tabular-nums text-left transition-colors select-none ${i === 0 ? 'pl-6' : ''} ${col.key === lastListPinKey ? 'pl-pin-edge' : ''} ${!isReadOnly ? 'cursor-text hover:bg-emerald-500/5' : ''}`}
                                  style={{
                                    ...listCellStyle(col, i, 'var(--pl-bg)'),
                                    ...(col.key === 'remit' ? { backgroundColor: remitTint } : {}),
                                  }}
                                  title={isReadOnly ? (empty ? undefined : text) : empty ? 'Double-click to edit' : `${text} · Double-click to edit`}
                                  onDoubleClick={e => {
                                    e.stopPropagation()
                                    startCellEdit()
                                  }}
                                  onTouchEnd={handleCellTouchEnd}
                                >
                                  <span
                                    className={`whitespace-nowrap ${col.key === 'customerName' ? 'font-semibold' : isStatus ? 'font-medium' : ''}`}
                                    style={{
                                      color: empty
                                        ? textMuted
                                        : isStatus
                                          ? (isDone ? (isLight ? '#047857' : '#34D399') : (isLight ? '#b45309' : '#fbbf24'))
                                          : col.key === 'remit'
                                            ? remitAccent
                                            : col.key === 'date' || col.key === 'ticketNumber'
                                              ? textMuted
                                              : undefined,
                                      opacity: empty ? 0.45 : 1,
                                    }}
                                  >
                                    {text}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        ))}

                        {installerRows.length === 0 ? (
                          <div className="px-6 py-8 text-center text-xs font-semibold" style={{ color: textMuted }}>
                            No jobs for this period.
                          </div>
                        ) : (
                          /* Totals — one sum under every money column, aligned to the grid. */
                          <div className="grid text-[13px]" style={{ gridTemplateColumns: listGridTemplate, backgroundColor: headerBg }}>
                            {groupVisibleColumns.map((col, i) => {
                              const total = listTotals[i]
                              return (
                                <div
                                  key={col.key}
                                  className={`px-3 py-2.5 flex items-center min-w-0 overflow-hidden tabular-nums font-bold text-left ${i === 0 ? 'pl-6' : ''} ${col.key === lastListPinKey ? 'pl-pin-edge' : ''}`}
                                  style={{
                                    ...listCellStyle(col, i, headerBg),
                                    ...(col.key === 'remit' ? { backgroundColor: remitTint, color: remitAccent } : {}),
                                  }}
                                >
                                  {i === 0 ? null : total ? (
                                    <span className="whitespace-nowrap" style={{ color: col.key === 'remit' ? remitAccent : textPrimary }}>₱{peso(total)}</span>
                                  ) : total === 0 ? (
                                    <span style={{ color: textMuted, opacity: 0.45 }}>—</span>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Edge cues — fade + arrow wherever more columns are hidden off-screen. */}
                    {listEdges.left && (
                      <div className="absolute top-0 bottom-[14px] pointer-events-none flex items-center" style={{ left: listPinLeft[lastListPinKey ?? ''] !== undefined ? (listWidths[groupVisibleColumns.findIndex(c => c.key === lastListPinKey)] + listPinLeft[lastListPinKey!]) : 0 }}>
                        <div className="h-full w-10" style={{ background: `linear-gradient(to right, ${cardBg}, transparent)` }} />
                        <button
                          type="button"
                          onClick={() => listScrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                          className="pointer-events-auto absolute left-1 w-8 h-8 rounded-full flex items-center justify-center border shadow-md transition-colors hover:border-emerald-500"
                          style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
                          aria-label="Scroll columns left"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {listEdges.right && (
                      <div className="absolute top-0 right-0 bottom-[14px] pointer-events-none flex items-center justify-end">
                        <div className="h-full w-12" style={{ background: `linear-gradient(to left, ${cardBg}, transparent)` }} />
                        <button
                          type="button"
                          onClick={() => listScrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                          className="pointer-events-auto absolute right-2 w-8 h-8 rounded-full flex items-center justify-center border shadow-md transition-colors hover:border-emerald-500"
                          style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
                          aria-label="Scroll columns right"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                {/* Mobile card view — one card per job instead of a horizontally-scrolling
                    spreadsheet row. Date/Ticket #/Customer Name become the card header
                    (editable only for manually added rows with no ticketId); every other
                    visible column becomes a label/value row below it. */}
                  <div className="md:hidden flex flex-col gap-2 p-3" style={{ backgroundColor: headerBg }}>
                    {installerRows.map(row => (
                      <div
                        key={row.id}
                        className="rounded-xl border p-3 flex flex-col gap-2"
                        style={{ backgroundColor: cardBg, borderColor: border }}
                      >
                        <div className="min-w-0">
                          <div className="min-w-0">
                            {row.ticketId ? (
                              <>
                                <div className="text-sm font-extrabold truncate" style={{ color: textPrimary }}>
                                  {row.customerName || 'No customer'}
                                </div>
                                <div className="text-[11px] font-semibold" style={{ color: textMuted }}>
                                  {row.workDate ? shortDate(row.workDate) : 'No date'} &middot; {row.ticketNumber || 'No ticket'}
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  placeholder="Customer name"
                                  value={row.customerName}
                                  onChange={e => updateRow(row.id, { customerName: e.target.value })}
                                  className="text-sm font-extrabold bg-transparent border-0 outline-none w-full"
                                  style={{ color: textPrimary }}
                                />
                                <div className="flex items-center gap-2">
                                  <input
                                    type="date"
                                    value={row.workDate}
                                    onChange={e => updateRow(row.id, { workDate: e.target.value })}
                                    className="text-[11px] font-semibold bg-transparent border-0 outline-none"
                                    style={{ color: textMuted, colorScheme: isLight ? 'light' : 'dark' }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Ticket"
                                    value={row.ticketNumber}
                                    onChange={e => updateRow(row.id, { ticketNumber: e.target.value })}
                                    className="text-[11px] font-semibold bg-transparent border-0 outline-none w-20"
                                    style={{ color: textMuted }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col" style={{ borderTop: `1px solid ${border}` }}>
                          {groupVisibleColumns
                            .filter(col => !['date', 'ticketNumber', 'customerName'].includes(col.key))
                            .map(col => (
                              <div
                                key={col.key}
                                className="flex items-center justify-between gap-2 py-1.5"
                                style={{ borderBottom: `1px solid ${border}` }}
                              >
                                <span
                                  className="text-[10px] font-bold uppercase tracking-wide shrink-0"
                                  style={{ color: col.key === 'remit' ? remitAccent : textMuted }}
                                >
                                  {col.label}
                                </span>
                                <div className="max-w-[55%] flex-1">
                                  {renderMobileCellValue(col, row)}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Jobs tab footer: Deductions summary with button on the left, Net payroll summary on the right */}
                  {(() => {
                    const gross = installerTotal(installerRows)
                    const base = baseInstallTotal(installerRows)
                    const totalDeduction = deductionTotal(installerRows)
                    const net = gross - totalDeduction
                    const dedRed = isLight ? '#DC2626' : '#F87171'
                    return (
                      <div className="flex flex-col lg:flex-row items-stretch" style={{ backgroundColor: headerBg, borderTop: `1px solid ${border}` }}>
                        {/* Deductions banner */}
                        <div className="flex-1 min-w-0 px-5 md:px-6 py-4 flex flex-col justify-center gap-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <Receipt className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textPrimary }}>Period Deductions</span>
                            {totalDeduction > 0 ? (
                              <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full" style={{ backgroundColor: isLight ? '#fee2e2' : '#7f1d1d', color: dedRed }}>
                                −₱{peso(totalDeduction)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: isLight ? '#f1f5f9' : '#0d1520', color: textMuted }}>
                                ₱0.00
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeductionsModalInstaller(installerName)}
                              className="ml-auto sm:ml-2 px-3 py-1 rounded-lg text-xs font-bold border transition-colors hover:border-amber-500/50 cursor-pointer flex items-center gap-1.5"
                              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                            >
                              <span>View Deductions</span>
                              <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
                            </button>
                          </div>
                          <p className="text-xs font-medium" style={{ color: textMuted }}>
                            Late minutes, AC loans &amp; cash advances, incomplete uploads, losses, uniform, and remit penalties.
                          </p>
                        </div>

                        {/* Net payroll */}
                        <div className="lg:w-80 shrink-0 px-5 md:px-6 py-4 flex flex-col gap-3 border-t lg:border-t-0 lg:border-l" style={{ borderColor: border }}>
                          <div className="flex flex-col gap-1.5 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold uppercase tracking-wide text-[11px]" style={{ color: textMuted }}>Gross Total Labor</span>
                              <span className="font-bold tabular-nums" style={{ color: textPrimary }}>₱{peso(gross)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: textMuted }}>
                              <span>Base install ₱{peso(base)} · Add-ons ₱{peso(gross - base)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold uppercase tracking-wide text-[11px]" style={{ color: textMuted }}>Total Deduction</span>
                              <span className="font-bold tabular-nums" style={{ color: totalDeduction > 0 ? dedRed : textMuted }}>
                                {totalDeduction > 0 ? `−₱${peso(totalDeduction)}` : '₱0.00'}
                              </span>
                            </div>
                          </div>
                          <div
                            className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                            style={{ backgroundColor: isLight ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.45)' }}
                          >
                            <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: isLight ? '#047857' : '#34D399' }}>Net Payroll</span>
                            <span className="text-xl font-extrabold tabular-nums" style={{ color: net < 0 ? dedRed : (isLight ? '#047857' : '#34D399') }}>
                              {net < 0 ? '−' : ''}₱{peso(Math.abs(net))}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
              </div>
            )
          })}
        </div>
      ) : (
        // Roster / summary — one continuous ledger table covering the whole selected period (not
        // a single job). Remarks/Payroll Due/Audited/Status live here, not in an installer's own
        // per-job table. Click a row to open that installer's job-level table.
        <div className="rounded-b-2xl border overflow-hidden" style={{ borderColor: border, backgroundColor: cardBg }}>
          {/* Column header row */}
          <div
            className="hidden md:grid items-center px-6 md:px-7 py-3.5"
            style={{ gridTemplateColumns: ROSTER_GRID_TEMPLATE, backgroundColor: isLight ? '#f8fafc' : '#0d1520', borderBottom: `1px solid ${border}` }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70" style={{ color: textMuted }}>Installer</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-center opacity-70" style={{ color: textMuted }}>Completed Jobs</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-right opacity-70" style={{ color: textMuted }}>Payroll Amount</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-center opacity-70" style={{ color: textMuted }}>Payroll Status</span>
          </div>

          {/* Data rows — hairline dividers, no per-row cards/shadows, just a row-hover tint */}
          {grouped.map(([installerName, installerRows], rowIndex) => {
            // Net of this period's deductions (Late / Loan / Uniform …) — what the installer takes home.
            const total = installerNet(installerRows)
            const isComplete = installerRows.length > 0 && installerRows.every(r => r.status === 'COMPLETE')
            const summaryRemarks = installerRows[0]?.remarks || ''
            const summaryAudited = installerRows[0]?.audited || ''
            return (
              <div
                key={installerName}
                role="button"
                tabIndex={0}
                title={`Open ${titleCase(displayInstallerName(installerName))}'s payroll`}
                onClick={() => setSelectedInstaller(installerName)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedInstaller(installerName)
                  }
                }}
                className="grid items-center gap-x-4 gap-y-3 px-6 md:px-7 py-5 md:py-6 transition-colors cursor-pointer"
                style={{
                  gridTemplateColumns: ROSTER_GRID_TEMPLATE,
                  borderTop: rowIndex === 0 ? 'none' : `1px solid ${border}`,
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = isLight ? '#f8fafc' : '#0d1520' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                    {/* 1. INSTALLER */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: avatarColor(installerName) }}
                      >
                        {getInitials(installerName)}
                      </div>
                      <span className="text-sm md:text-base font-semibold truncate" style={{ color: textPrimary }}>
                        {titleCase(displayInstallerName(installerName))}
                      </span>
                    </div>

                    {/* 2. COMPLETED JOBS — count plus what kind of work it was */}
                    <div className="flex flex-col items-center justify-center min-w-0">
                      <span className="text-lg md:text-xl font-bold tabular-nums tracking-tight" style={{ color: textPrimary }}>
                        {completedJobsCount(installerRows)}
                      </span>
                      {completedJobsBreakdown(installerRows) && (
                        <span className="text-[11px] font-medium truncate max-w-full" style={{ color: textMuted }} title={completedJobsBreakdown(installerRows)}>
                          {completedJobsBreakdown(installerRows)}
                        </span>
                      )}
                    </div>

                    {/* 3. PAYROLL AMOUNT — negative when deductions outweigh the period's gross
                        (e.g. an unpaid loan balance), so this needs the same sign-then-peso
                        formatting and red/green split as the Net Payroll tiles below. */}
                    <div className="flex items-center justify-end">
                      <span
                        className="text-base md:text-lg font-bold tabular-nums text-right tracking-tight"
                        style={{ color: total < 0 ? (isLight ? '#DC2626' : '#F87171') : '#10B981' }}
                      >
                        {total < 0 ? '−' : ''}₱{peso(Math.abs(total))}
                      </span>
                    </div>

                    {/* 4. STATUS (LAST COLUMN TO THE RIGHT) */}
                    <div className="flex justify-center">
                      {isComplete ? (
                        <div
                          className="w-full flex flex-col items-center justify-center px-3.5 py-2 rounded-xl border text-center select-none"
                          style={{
                            color: '#10B981',
                            backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.14)',
                            borderColor: '#10B98160',
                          }}
                          title={summaryRemarks ? `Remarks: ${summaryRemarks}` : undefined}
                        >
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold max-w-full">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                            <span className="truncate">Completed by {titleCase(summaryAudited || userFirstName)}</span>
                          </div>
                          <span className="text-[10px] font-medium mt-0.5 opacity-60">
                            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          {summaryRemarks && (
                            <span className="text-[10px] font-medium truncate max-w-full mt-0.5 px-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              {summaryRemarks}
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={e => {
                            // The whole row opens the payroll — completing is its own action.
                            e.stopPropagation()
                            setCompleteModalFor(installerName)
                            setCompleteRemarks(summaryRemarks)
                          }}
                          title="Click to complete payroll"
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer"
                          style={{
                            color: '#D97706',
                            backgroundColor: isLight ? '#FFFBEB' : 'rgba(245,158,11,0.14)',
                            borderColor: '#F59E0B60',
                          }}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending</span>
                        </button>
                      )}
                    </div>
              </div>
            )
          })}

          {/* Totals footer — reads as a ledger's own TOTAL line, not a KPI dashboard: no icon
              chips, no rainbow palette, just labels-over-numbers with the net payout accented. */}
          <div
            className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3 px-6 md:px-7 py-5"
            style={{ backgroundColor: isLight ? '#f8fafc' : '#0d1520', borderTop: `1px solid ${border}` }}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium opacity-60" style={{ color: textMuted }}>
              <Users className="w-3.5 h-3.5" />
              {grouped.length} installer{grouped.length !== 1 ? 's' : ''}
            </div>
            <div className="flex flex-wrap items-center gap-x-9 gap-y-2">
              {([
                { label: 'Remittance Collected', value: globalRemittanceTotal, color: remitAccent },
                { label: 'Base Install Total', value: globalBaseInstallTotal, color: textPrimary },
                { label: 'Total Add-on Pay', value: globalAddOnTotal, color: textPrimary },
                { label: 'Total Deductions', value: globalDeductionTotal, color: globalDeductionTotal > 0 ? (isLight ? '#DC2626' : '#F87171') : textPrimary },
                { label: 'Net Payout Due', value: grandTotal - globalDeductionTotal, color: '#10B981' },
              ] as const).map(tile => (
                <div key={tile.label} className="flex flex-col items-end">
                  <span className="text-[10px] font-medium uppercase tracking-wider opacity-60" style={{ color: textMuted }}>{tile.label}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: tile.color }}>₱{peso(tile.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
        )
      })()}

      {columnManagerFor && (() => {
        const hidden = hiddenColumnsFor(columnManagerFor)
        const totalVisible = COLUMN_DEFS.filter(c => !c.pinned && !hidden.has(c.key as ColumnKey)).length
        const totalToggleable = COLUMN_DEFS.filter(c => !c.pinned).length

        /* Category accent palette */
        const CAT_ACCENT: Record<ColumnCategory, { color: string; bg: string }> = {
          standard:   { color: '#10B981', bg: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.10)' },
          piping:     { color: '#38BDF8', bg: isLight ? '#f0f9ff' : 'rgba(56,189,248,0.10)' },
          electrical: { color: '#FBBF24', bg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.10)' },
          structural: { color: '#A78BFA', bg: isLight ? '#f5f3ff' : 'rgba(167,139,250,0.10)' },
          masonry:    { color: '#FB923C', bg: isLight ? '#fff7ed' : 'rgba(251,146,60,0.10)' },
          admin:      { color: '#94A3B8', bg: isLight ? '#f8fafc' : 'rgba(148,163,184,0.10)' },
        }

        return createPortal(
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(4,8,20,0.75)', backdropFilter: 'blur(4px)' }}
        >
          <style>{`
            .col-toggle { position:relative; display:inline-flex; align-items:center; cursor:pointer; width:36px; height:20px; flex-shrink:0; }
            .col-toggle input { opacity:0; width:0; height:0; position:absolute; }
            .col-toggle-track {
              position:absolute; inset:0; border-radius:999px; transition:background .2s;
              background: ${isLight ? '#cbd5e1' : '#243452'};
            }
            .col-toggle input:checked + .col-toggle-track { background:#10B981; }
            .col-toggle-thumb {
              position:absolute; top:3px; left:3px; width:14px; height:14px;
              border-radius:50%; background:white; box-shadow:0 1px 3px rgba(0,0,0,.3);
              transition:transform .2s; pointer-events:none;
            }
            .col-toggle input:checked ~ .col-toggle-thumb { transform:translateX(16px); }
            .col-mgr-row:hover { background:${isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.08)'}; }
            .col-cat-hdr:hover { background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'}; }
            .col-mgr-scroll::-webkit-scrollbar { width:6px; }
            .col-mgr-scroll::-webkit-scrollbar-track { background:transparent; }
            .col-mgr-scroll::-webkit-scrollbar-thumb { background:${isLight ? '#cbd5e1' : '#243452'}; border-radius:999px; }
            .col-mgr-scroll::-webkit-scrollbar-thumb:hover { background:#10B981; }
            .col-mgr-scroll { scrollbar-width:thin; scrollbar-color:${isLight ? '#cbd5e1' : '#243452'} transparent; }
          `}</style>
          <div
            className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{
              maxWidth: 900,
              maxHeight: '92vh',
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
              boxShadow: isLight
                ? '0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(16,185,129,0.15)'
                : '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(16,185,129,0.20)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{
                borderBottom: `1px solid ${border}`,
                background: isLight
                  ? 'linear-gradient(135deg,#f0fdf4 0%,#f8fafc 100%)'
                  : 'linear-gradient(135deg,rgba(16,185,129,0.08) 0%,rgba(10,17,32,0) 100%)',
              }}
            >
              <div>
                <h2 className="text-sm font-extrabold leading-tight uppercase tracking-wide" style={{ color: textPrimary }}>
                  Manage Columns
                </h2>
                <p className="text-[11px] font-medium mt-0.5" style={{ color: textMuted }}>
                  {displayInstallerName(columnManagerFor)} &mdash; <span style={{ color: '#10B981' }}>{totalVisible}</span>/{totalToggleable} visible
                </p>
              </div>
              <button
                type="button"
                onClick={() => setColumnManagerFor(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-red-500/12"
                style={{ border: `1px solid ${border}` }}
              >
                <X className="w-4 h-4" style={{ color: textMuted }} />
              </button>
            </div>

            {/* ── Toolbar: Presets + Search + Bulk actions ── */}
            <div
              className="flex flex-wrap items-center gap-3 px-6 py-3 shrink-0"
              style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#fafafa' : '#080f1c' }}
            >
              {/* Presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-wider shrink-0" style={{ color: textMuted }}>Preset</span>
                {COLUMN_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyColumnPreset(preset.cats)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all hover:border-emerald-500/60 hover:text-emerald-500"
                    style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex-1" />

              {/* Search */}
              <div className="relative" style={{ minWidth: 180 }}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search columns…"
                  value={columnSearch}
                  onChange={e => setColumnSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs font-semibold border focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>

              {/* Bulk */}
              <button
                type="button"
                onClick={() => setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set() }))}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all hover:border-emerald-500/60"
                style={{ color: '#10B981', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.10)', borderColor: isLight ? '#a7f3d0' : 'rgba(16,185,129,0.25)' }}
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set(COLUMN_DEFS.filter(c => !c.pinned).map(c => c.key as ColumnKey)) }))}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all hover:border-red-400/50 hover:text-red-400"
                style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
              >
                Hide all
              </button>
            </div>

            {/* ── Scrollable body: categories + custom ── */}
            <div className="col-mgr-scroll flex-1 min-h-0 overflow-y-auto">

              {/* Categorized column grid */}
              <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Object.keys(CATEGORY_META) as ColumnCategory[]).map(cat => {
                  const cols = COLUMN_DEFS.filter(c =>
                    c.category === cat &&
                    c.label.toLowerCase().includes(columnSearch.trim().toLowerCase())
                  )
                  if (cols.length === 0) return null
                  const meta = CATEGORY_META[cat]
                  const acc = CAT_ACCENT[cat]
                  const visibleCount = cols.filter(c => !hidden.has(c.key as ColumnKey)).length
                  const allOn = visibleCount === cols.length
                  const anyOn = visibleCount > 0

                  return (
                    <div
                      key={cat}
                      className="rounded-2xl overflow-hidden flex flex-col"
                      style={{
                        border: `1px solid ${border}`,
                        boxShadow: isLight ? '0 1px 4px rgba(0,0,0,0.06)' : '0 1px 8px rgba(0,0,0,0.25)',
                      }}
                    >
                      {/* Category header — click to toggle all */}
                      <button
                        type="button"
                        className="col-cat-hdr flex items-center gap-3 px-4 py-3 w-full text-left transition-colors cursor-pointer"
                        style={{ backgroundColor: acc.bg, borderBottom: `1px solid ${border}` }}
                        onClick={() => {
                          if (!columnManagerFor) return
                          const newHidden = new Set(hidden)
                          if (allOn) {
                            cols.forEach(c => newHidden.add(c.key as ColumnKey))
                          } else {
                            cols.forEach(c => newHidden.delete(c.key as ColumnKey))
                          }
                          setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: newHidden }))
                        }}
                        title={allOn ? 'Click to hide all in this group' : 'Click to show all in this group'}
                      >
                        <div className="flex-1 min-w-0" style={{ borderLeft: `3px solid ${acc.color}`, paddingLeft: 10 }}>
                          <div className="text-[12px] font-extrabold leading-tight truncate uppercase tracking-wide" style={{ color: textPrimary }}>{meta.label}</div>
                        </div>
                        {/* Pill count */}
                        <span
                          className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: anyOn ? acc.color + '22' : (isLight ? '#f1f5f9' : '#0d1520'),
                            color: anyOn ? acc.color : textMuted,
                            border: `1px solid ${anyOn ? acc.color + '40' : border}`,
                          }}
                        >
                          {visibleCount}/{cols.length}
                        </span>
                      </button>

                      {/* Column rows */}
                      <div className="flex flex-col" style={{ backgroundColor: cardBg }}>
                        {cols.map((col, i) => {
                          const on = !hidden.has(col.key as ColumnKey)
                          return (
                            <label
                              key={col.key}
                              className="col-mgr-row flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                              style={{
                                borderTop: i > 0 ? `1px solid ${border}` : 'none',
                              }}
                            >
                              {/* Custom toggle switch */}
                              <span className="col-toggle">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleColumn(col.key as ColumnKey)}
                                />
                                <span className="col-toggle-track" />
                                <span className="col-toggle-thumb" />
                              </span>
                              <span
                                className="text-[12px] font-semibold flex-1 leading-tight"
                                style={{ color: on ? textPrimary : textMuted, transition: 'color .15s' }}
                              >
                                {col.label}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Custom Columns section */}
              <div
                className="mx-6 mb-6 rounded-2xl overflow-hidden flex flex-col"
                style={{ border: `1px solid ${border}` }}
              >
                {/* Custom section header */}
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    backgroundColor: isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.08)',
                    borderBottom: `1px solid ${border}`,
                  }}
                >
                  <div className="flex-1">
                    <div className="text-[12px] font-extrabold uppercase tracking-wide" style={{ color: textPrimary }}>Custom Columns</div>
                  </div>
                  {customColumnDefs.length > 0 && (
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: '#10B981', color: 'white' }}
                    >
                      {customColumnDefs.length}
                    </span>
                  )}
                </div>

                {/* Add input */}
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: customColumnDefs.length > 0 ? `1px solid ${border}` : 'none', backgroundColor: cardBg }}>
                  <input
                    type="text"
                    placeholder="Column name, e.g. Roof Access Fee"
                    value={newColumnName}
                    onChange={e => setNewColumnName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomColumn() } }}
                    className="flex-1 rounded-xl border px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                  <button
                    type="button"
                    onClick={addCustomColumn}
                    disabled={!newColumnName.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-opacity"
                    style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>

                {/* Custom list */}
                {customColumnDefs.length > 0 ? (
                  customColumnDefs.map((cc, idx) => (
                    <div
                      key={cc.key}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors col-mgr-row"
                      style={{ borderTop: idx > 0 ? `1px solid ${border}` : 'none', backgroundColor: cardBg }}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10B981' }} />
                      <span className="text-xs font-bold flex-1 truncate" style={{ color: textPrimary }}>{cc.label}</span>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 truncate max-w-[120px]"
                        title={cc.key}
                        style={{ backgroundColor: isLight ? '#f1f5f9' : '#0d1520', color: textMuted }}
                      >
                        {cc.key}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCustomColumn(cc.key)}
                        className="p-1.5 rounded-lg hover:bg-red-500/15 transition-colors shrink-0"
                        title={`Delete "${cc.label}" from all installer tables`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div
                    className="text-xs font-medium text-center py-5 px-4"
                    style={{ color: textMuted, backgroundColor: cardBg }}
                  >
                    No custom columns yet — type a name above and press Enter or click Add.
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer ── */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#fafafa' : '#080f1c' }}
            >
              <p className="text-[11px]" style={{ color: textMuted }}>
                <span style={{ color: '#10B981', fontWeight: 700 }}>{totalVisible}</span> of <span style={{ fontWeight: 600 }}>{totalToggleable}</span> optional columns visible
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColumnManagerFor(null)}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.30)' }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
        )
      })()}

      {/* Column right-click context menu — portal-rendered so it always clears the header. */}
      {colCtxMenu && createPortal(
        <div
          className="fixed z-[999999] rounded-xl shadow-2xl overflow-hidden"
          style={{
            left: Math.min(colCtxMenu.x + 2, window.innerWidth - 224),
            top: Math.min(colCtxMenu.y + 2, window.innerHeight - 230),
            backgroundColor: cardBg,
            border: `1px solid ${border}`,
            minWidth: 204,
            boxShadow: isLight ? '0 16px 48px rgba(0,0,0,0.16)' : '0 16px 48px rgba(0,0,0,0.7)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Column identity header */}
          <div className="px-3.5 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: textMuted }}>Column</div>
            <div className="text-xs font-extrabold truncate" style={{ color: textPrimary, maxWidth: 180 }}>
              {colCtxMenu.col.label}
            </div>
          </div>

          {/* Hide — only for non-pinned columns */}
          {!colCtxMenu.col.pinned && (
            <button
              type="button"
              onClick={() => {
                toggleColumnForInstaller(colCtxMenu.installerName, colCtxMenu.col.key as ColumnKey)
                setColCtxMenu(null)
              }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs font-semibold text-left transition-colors hover:bg-red-500/10"
              style={{ color: '#f87171' }}
            >
              <EyeOff className="w-3.5 h-3.5" />
              Hide this column
            </button>
          )}

          {/* Delete — only for user-created custom columns */}
          {customColumnDefs.some(c => c.key === colCtxMenu.col.key) && (
            <button
              type="button"
              onClick={() => {
                removeCustomColumn(colCtxMenu.col.key)
                setColCtxMenu(null)
              }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs font-semibold text-left transition-colors hover:bg-red-500/10"
              style={{ color: '#f87171' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete custom column
            </button>
          )}

          {/* Width controls — only for standard (resizable) columns */}
          {COLUMN_DEFS.some(c => c.key === colCtxMenu.col.key) && (
            <>
              <div style={{ borderTop: `1px solid ${border}` }} />
              <button
                type="button"
                onClick={() => {
                  setColumnWidths(prev => ({ ...prev, [colCtxMenu.col.key as ColumnKey]: Math.min(widthFor(colCtxMenu.col.key) + 40, 420) }))
                  setColCtxMenu(null)
                }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs font-semibold text-left transition-colors hover:bg-emerald-500/10"
                style={{ color: textPrimary }}
              >
                <ChevronRight className="w-3.5 h-3.5 text-emerald-500" />
                Expand column
              </button>
              <button
                type="button"
                onClick={() => {
                  setColumnWidths(prev => ({ ...prev, [colCtxMenu.col.key as ColumnKey]: Math.max(widthFor(colCtxMenu.col.key) - 40, MIN_COLUMN_WIDTH) }))
                  setColCtxMenu(null)
                }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs font-semibold text-left transition-colors hover:bg-slate-500/10"
                style={{ color: textPrimary }}
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                Shrink column
              </button>
              <button
                type="button"
                onClick={() => {
                  setColumnWidths(prev => ({ ...prev, [colCtxMenu.col.key as ColumnKey]: DEFAULT_COLUMN_WIDTHS[colCtxMenu.col.key as ColumnKey] }))
                  setColCtxMenu(null)
                }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs font-semibold text-left transition-colors hover:bg-slate-500/10"
                style={{ color: textMuted }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset width
              </button>
            </>
          )}

          {/* Open full column manager */}
          <div style={{ borderTop: `1px solid ${border}` }} />
          <button
            type="button"
            onClick={() => {
              openColumnManager(colCtxMenu.installerName)
              setColCtxMenu(null)
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs font-semibold text-left transition-colors hover:bg-emerald-500/10"
            style={{ color: '#10B981' }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Manage all columns…
          </button>
        </div>,
        document.body
      )}

      {/* Job detail popup — opened by clicking a row in the desktop list. Renders all fee and
          detail columns as editable label/value rows, with category filters and an itemized breakdown. */}
      {detailRow && createPortal(
        (() => {
          // Re-read from `rows` so edits made inside the popup stay live; fallback to ticketId + installer match
          const liveRow = rows.find(r => r.id === detailRow.id || (detailRow.ticketId && r.ticketId === detailRow.ticketId && r.installerName === detailRow.installerName)) || detailRow

          // All candidate fee & detail columns for this ticket (including all categories & custom columns)
          const allDetailCols: ColumnDef[] = [
            ...COLUMN_DEFS.filter(c => !['date', 'ticketNumber', 'customerName', 'brandCapacity'].includes(c.key)),
            ...customColumnDefs.map(cc => ({
              key: cc.key, label: cc.label, width: 120, align: 'right' as const, isMoney: true, category: 'admin' as const,
            })),
          ]

          // Collect every active fee added to this ticket row
          const activeFeeItems: { key: string; label: string; amount: number; isBase?: boolean }[] = []
          if (num(liveRow.installationFee) > 0) {
            activeFeeItems.push({ key: 'installationFee', label: 'Base Install Fee', amount: num(liveRow.installationFee), isBase: true })
          }
          for (const col of allDetailCols) {
            if (col.key === 'installationFee' || !col.isMoney) continue
            const val = num(getColAccessor(col.key).get(liveRow))
            if (val > 0) {
              activeFeeItems.push({ key: col.key, label: col.label, amount: val })
            }
          }

          const baseFee = num(liveRow.installationFee)
          const addOns = rowAddOns(liveRow)
          const rowGrandTotal = rowTotal(liveRow)

          // Filter columns by selected category & search
          const filteredCols = allDetailCols.filter(col => {
            if (popupSearch.trim() && !col.label.toLowerCase().includes(popupSearch.toLowerCase())) {
              return false
            }
            if (popupCategory === 'active') {
              const val = getColAccessor(col.key).get(liveRow)
              return col.key === 'remit' || col.key === 'installationUpload' || (col.isMoney ? num(val) > 0 : Boolean(String(val).trim()))
            }
            if (popupCategory === 'standard') {
              return col.pinned || col.category === 'standard'
            }
            if (popupCategory === 'piping') {
              return col.category === 'piping'
            }
            if (popupCategory === 'electrical') {
              return col.category === 'electrical'
            }
            if (popupCategory === 'structural') {
              return col.category === 'structural' || col.category === 'masonry'
            }
            if (popupCategory === 'admin') {
              return col.category === 'admin'
            }
            return true
          })

          return (
            <div
              className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150"
            >
              <div
                className="w-full max-w-3xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
                style={{ backgroundColor: cardBg, borderColor: border }}
              >
                {/* Header */}
                <div
                  className="flex items-start justify-between gap-3 px-6 py-4 shrink-0"
                  style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}
                >
                  {liveRow.ticketId ? (
                    <div className="min-w-0">
                      <div className="text-lg font-extrabold truncate" style={{ color: textPrimary }}>
                        {liveRow.customerName || 'No customer'}
                      </div>
                      <div className="text-sm font-semibold mt-0.5 truncate" style={{ color: textMuted }}>
                        {liveRow.workDate ? shortDate(liveRow.workDate) : 'No date'}
                        {' · '}{liveRow.ticketNumber || 'No ticket'}
                        {liveRow.brandCapacity ? ` · ${liveRow.brandCapacity}` : ''}
                        {' · '}<span className="text-emerald-500 font-bold">{displayInstallerName(liveRow.installerName)}</span>
                      </div>
                      {liveRow.customFields?.['xfer:fromBranch'] && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <ArrowRightLeft className="w-3 h-3" style={{ color: '#8B5CF6' }} />
                          <span className="text-[11px] font-bold" style={{ color: '#8B5CF6' }}>
                            Transferred from {liveRow.customFields['xfer:fromBranch']}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="min-w-0 flex flex-col gap-1.5">
                      <input
                        type="text"
                        placeholder="Customer name"
                        value={liveRow.customerName}
                        onChange={e => updateRow(liveRow.id, { customerName: e.target.value })}
                        className="text-lg font-extrabold bg-transparent border-0 outline-none w-full"
                        style={{ color: textPrimary }}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={liveRow.workDate || ''}
                          onChange={e => updateRow(liveRow.id, { workDate: e.target.value })}
                          className="text-sm font-semibold bg-transparent border-0 outline-none"
                          style={{ color: textMuted }}
                        />
                        <input
                          type="text"
                          placeholder="Ticket"
                          value={liveRow.ticketNumber}
                          onChange={e => updateRow(liveRow.id, { ticketNumber: e.target.value })}
                          className="text-sm font-semibold bg-transparent border-0 outline-none w-28"
                          style={{ color: textMuted }}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setDetailRow(null); setPopupCategory('all'); setPopupSearch('') }}
                    className="p-2.5 rounded-full shrink-0 transition-all border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white active:scale-90"
                    style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>

                {/* Category navigation & fast search toolbar */}
                <div
                  className="px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b shrink-0 text-xs"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                >
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
                    {[
                      { id: 'all', label: `All (${allDetailCols.length})` },
                      { id: 'active', label: `Active (${activeFeeItems.length})`, badgeColor: activeFeeItems.length > 0 ? '#10B981' : undefined },
                      { id: 'standard', label: 'Standard' },
                      { id: 'piping', label: 'Piping' },
                      { id: 'electrical', label: 'Electrical' },
                      { id: 'structural', label: 'Structural & Masonry' },
                      { id: 'admin', label: 'Admin & Custom' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setPopupCategory(tab.id)}
                        className="px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] whitespace-nowrap cursor-pointer flex items-center gap-1"
                        style={{
                          backgroundColor: popupCategory === tab.id
                            ? (isLight ? '#10B981' : '#059669')
                            : (isLight ? '#f1f5f9' : '#111d33'),
                          color: popupCategory === tab.id ? '#ffffff' : (tab.badgeColor || textMuted),
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-40 shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter fields..."
                      value={popupSearch}
                      onChange={e => setPopupSearch(e.target.value)}
                      className="w-full pl-8 pr-2 py-1 rounded-lg text-xs border outline-none bg-transparent"
                      style={{ borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                </div>

                {/* Column rows */}
                <div className="flex-1 overflow-y-auto px-6 py-1">
                  {filteredCols.length === 0 ? (
                    <div className="py-12 text-center text-xs font-semibold" style={{ color: textMuted }}>
                      No fields match the selected filter.
                    </div>
                  ) : (
                    filteredCols.map(col => {
                      const curVal = getColAccessor(col.key).get(liveRow)
                      const isMoneyVal = col.isMoney && num(curVal) > 0
                      return (
                        <div
                          key={col.key}
                          className="flex items-center justify-between gap-4 py-2.5 transition-colors"
                          style={{
                            borderBottom: `1px solid ${border}`,
                            backgroundColor: isMoneyVal ? (isLight ? 'rgba(16,185,129,0.04)' : 'rgba(16,185,129,0.06)') : undefined,
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="text-xs font-bold uppercase tracking-wide truncate"
                              style={{ color: col.key === 'remit' ? remitAccent : textPrimary }}
                            >
                              {col.label}
                            </span>
                            {col.category && (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider hidden sm:inline"
                                style={{ backgroundColor: isLight ? '#f1f5f9' : '#111d33', color: textMuted }}
                              >
                                {col.category}
                              </span>
                            )}
                            {isMoneyVal && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 tabular-nums">
                                ₱{peso(curVal)}
                              </span>
                            )}
                          </div>
                          <div className="max-w-[55%] flex-1">
                            {renderMobileCellValue(col, liveRow)}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Itemized active fees breakdown (if any add-on is present) */}
                {activeFeeItems.length > 0 && (
                  <div
                    className="px-6 py-2.5 border-t shrink-0 flex flex-col gap-1.5"
                    style={{ backgroundColor: isLight ? '#f8fafc' : '#0b1322', borderColor: border }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Added Ticket Details &amp; Fee Breakdown ({activeFeeItems.length})
                      </span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: textPrimary }}>
                        Total: ₱{peso(rowGrandTotal)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 max-h-20 overflow-y-auto">
                      {activeFeeItems.map(item => (
                        <span
                          key={item.key}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border tabular-nums"
                          style={{
                            backgroundColor: item.isBase ? (isLight ? '#e0f2fe' : 'rgba(56,189,248,0.15)') : (isLight ? '#ecfdf5' : 'rgba(16,185,129,0.15)'),
                            borderColor: item.isBase ? (isLight ? '#bae6fd' : 'rgba(56,189,248,0.3)') : (isLight ? '#a7f3d0' : 'rgba(16,185,129,0.3)'),
                            color: item.isBase ? (isLight ? '#0284c7' : '#38bdf8') : (isLight ? '#059669' : '#34d399'),
                          }}
                        >
                          <span>{item.label}:</span>
                          <strong className="font-extrabold">₱{peso(item.amount)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-Ticket Total Summary bar */}
                <div className="grid grid-cols-3 shrink-0" style={{ backgroundColor: headerBg, borderTop: `1px solid ${border}` }}>
                  <div className="px-5 py-3.5 min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider truncate opacity-70" style={{ color: textMuted }}>Install Fee</div>
                    <div className="text-base sm:text-lg font-bold tabular-nums" style={{ color: textPrimary }}>₱{peso(baseFee)}</div>
                  </div>
                  <div className="px-5 py-3.5 min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider truncate opacity-70" style={{ color: textMuted }}>
                      Add-on Pay ({activeFeeItems.filter(i => !i.isBase).length})
                    </div>
                    <div className="text-base sm:text-lg font-bold tabular-nums" style={{ color: addOns > 0 ? (isLight ? '#047857' : '#34d399') : textPrimary }}>
                      ₱{peso(addOns)}
                    </div>
                  </div>
                  <div className="px-5 py-3.5 min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider truncate opacity-70 text-emerald-600 dark:text-emerald-400">
                      Per Ticket Total
                    </div>
                    <div className="text-lg sm:text-xl font-extrabold tabular-nums" style={{ color: '#10B981' }}>
                      ₱{peso(rowGrandTotal)}
                    </div>
                  </div>
                </div>

                {/* View Ticket action — jumps to the actual ticket behind this payroll row */}
                {(liveRow.ticketId || liveRow.ticketNumber) && (
                  <div
                    className="flex items-center justify-between gap-3 px-6 py-2.5 shrink-0"
                    style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#fafafa' : '#080f1c' }}
                  >
                    <span className="text-[11px] font-medium opacity-60" style={{ color: textMuted }}>
                      Ticket #{liveRow.ticketNumber || liveRow.ticketId}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/search?ticket=${encodeURIComponent(liveRow.ticketId || liveRow.ticketNumber)}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 shrink-0 cursor-pointer"
                      style={{ color: '#10B981', borderColor: isLight ? '#a7f3d0' : 'rgba(16,185,129,0.35)', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.08)' }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Ticket
                    </button>
                  </div>
                )}

                {/* Already-transferred badge */}
                {liveRow.customFields?.['xfer:fromBranch'] && (
                  <div
                    className="flex items-center gap-2 px-6 py-3 shrink-0"
                    style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.08)' }}
                  >
                    <ArrowRightLeft className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                    <span className="text-xs font-semibold" style={{ color: '#8B5CF6' }}>
                      Transferred from <strong>{liveRow.customFields['xfer:fromBranch']}</strong>
                      {liveRow.customFields['xfer:transferredAt']
                        ? ` · ${new Date(liveRow.customFields['xfer:transferredAt']).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })(),
        document.body
      )}
      {ratesModalOpen && createPortal(
        (() => {
          const headerBgColor = isLight ? '#f8fafc' : '#0F1A2E'
          const overrideCount = Object.entries(draftRates.lineItemOverrides || {}).filter(([k, v]) => {
            const std = STANDARD_RATE_TABLE.find(item => item.key === k)
            return std ? v !== std.defaultRate : false
          }).length + (
            (draftRates.dailyAllowance !== DEFAULT_PAYROLL_RATES.dailyAllowance ? 1 : 0) +
            (draftRates.earthGrounding !== DEFAULT_PAYROLL_RATES.earthGrounding ? 1 : 0) +
            (draftRates.survey !== DEFAULT_PAYROLL_RATES.survey ? 1 : 0) +
            (draftRates.rescheduled !== DEFAULT_PAYROLL_RATES.rescheduled ? 1 : 0)
          )

          const renderRateItemRow = (item: typeof STANDARD_RATE_TABLE[0]) => {
            const currentVal = draftRates.lineItemOverrides?.[item.key] ?? item.defaultRate
            const overridden = currentVal !== item.defaultRate
            return (
              <div
                key={item.key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 px-5 py-3.5 transition-colors hover:bg-slate-500/5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold leading-relaxed" style={{ color: textPrimary }}>
                      {item.label}
                    </span>
                    {overridden && (
                      <span className="text-[9px] font-black text-emerald-500 uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        Custom
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative w-32 sm:w-36">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none text-slate-400">₱</span>
                    <NumericFormat
                      thousandSeparator=","
                      decimalScale={2}
                      allowNegative={false}
                      placeholder={String(item.defaultRate)}
                      value={currentVal}
                      onValueChange={values => setDraftRates(prev => ({
                        ...prev,
                        lineItemOverrides: { ...prev.lineItemOverrides, [item.key]: values.floatValue ?? item.defaultRate },
                      }))}
                      className="w-full pl-7 pr-3 py-2 rounded-xl text-xs font-bold border text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                      style={{
                        backgroundColor: inputBg,
                        borderColor: overridden ? '#10B981' : inputBorder,
                        color: textPrimary,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraftRates(prev => ({
                      ...prev,
                      lineItemOverrides: { ...prev.lineItemOverrides, [item.key]: item.defaultRate },
                    }))}
                    disabled={!overridden}
                    title="Reset to default rate"
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-500/10 disabled:opacity-0 cursor-pointer transition-colors shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          }

          /** Flat colored icon chip used for every card header — a light tinted square keeps the
           *  category glanceable without competing with the (now-unabbreviated) row labels. */
          const iconChip = (icon: ReactNode, bgLight: string, bgDark: string) => (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: isLight ? bgLight : bgDark }}
            >
              {icon}
            </div>
          )

          return (
            <div
              className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
            >
              <div
                className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border animate-in zoom-in-95 duration-200"
                style={{
                  maxWidth: '1060px',
                  height: 'min(86vh, 840px)',
                  maxHeight: '90vh',
                  backgroundColor: cardBg,
                  borderColor: border,
                  boxShadow: isLight
                    ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    : '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div
                  className="flex items-center justify-between gap-4 px-8 py-5 shrink-0"
                  style={{
                    backgroundColor: isLight ? '#ffffff' : '#0B1324',
                    borderBottom: `1px solid ${border}`,
                  }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.14)' }}
                    >
                      <SlidersHorizontal className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-base font-extrabold tracking-tight" style={{ color: textPrimary }}>
                          Payroll Rate Settings
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          {currentBranchDisplay || 'Branch'}
                        </span>
                      </div>
                      <p className="text-xs font-semibold mt-1 leading-snug" style={{ color: textMuted }}>
                        Configure standard branch rates and automatic schedule-match defaults
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRatesModalOpen(false)}
                      className="p-2.5 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
                      style={{ color: textMuted }}
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Info & Search Toolbar */}
                <div
                  className="px-8 py-4 shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5"
                  style={{
                    backgroundColor: isLight ? 'rgba(241, 245, 249, 0.7)' : 'rgba(15, 26, 46, 0.7)',
                    borderBottom: `1px solid ${border}`,
                  }}
                >
                  <div className="flex items-center gap-3 text-xs font-medium min-w-0 flex-1" style={{ color: textMuted }}>
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                    </div>
                    <span className="leading-relaxed">
                      Install and General Cleaning fees auto-fill on sync based on capacity. Customized rates will apply to this branch.
                    </span>
                  </div>

                  <div className="relative w-full md:w-80 shrink-0">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search rate items (e.g. 3.0 TR, Split, Freon)…"
                      value={ratesSearch}
                      onChange={e => setRatesSearch(e.target.value)}
                      className="w-full pl-10 pr-9 py-2 rounded-xl text-xs font-semibold outline-none border focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-400"
                      style={{
                        backgroundColor: inputBg,
                        borderColor: inputBorder,
                        color: textPrimary,
                      }}
                    />
                    {ratesSearch && (
                      <button
                        type="button"
                        onClick={() => setRatesSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Modal Body: 2-Column Responsive Layout */}
                <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start pb-8">
                    {/* Column 1 (Left): Installation & Other Standard Allowances */}
                    <div className="flex flex-col gap-6">
                      {/* Installation Rates Card */}
                      {(() => {
                        const group = 'Installation'
                        const items = STANDARD_RATE_TABLE.filter(item =>
                          item.group === group &&
                          (!ratesSearch || item.label.toLowerCase().includes(ratesSearch.toLowerCase()))
                        )
                        if (items.length === 0) return null
                        return (
                          <div className="rounded-2xl overflow-hidden shadow-xs border" style={{ borderColor: border, backgroundColor: cardBg }}>
                            <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ backgroundColor: headerBgColor, borderColor: border }}>
                              <div className="flex items-center gap-3">
                                {iconChip(<HardHat className="w-4 h-4 text-emerald-500" />, '#ecfdf5', 'rgba(16,185,129,0.14)')}
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>{group} Rates</span>
                              </div>
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 shrink-0">
                                {items.length} items
                              </span>
                            </div>
                            <div className="divide-y" style={{ borderColor: border }}>
                              {items.map(item => renderRateItemRow(item))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Other Rates Card (Survey, Rescheduled, Earth Grounding, Daily Allowance) */}
                      {(() => {
                        const otherRatesList = [
                          { key: 'dailyAllowance', label: 'Daily Allowance', defaultVal: DEFAULT_PAYROLL_RATES.dailyAllowance },
                          { key: 'earthGrounding', label: 'Earth Grounding', defaultVal: DEFAULT_PAYROLL_RATES.earthGrounding },
                          { key: 'survey', label: 'Survey Standard Fee', defaultVal: DEFAULT_PAYROLL_RATES.survey },
                          { key: 'rescheduled', label: 'Rescheduled Fee', defaultVal: DEFAULT_PAYROLL_RATES.rescheduled },
                        ] as const
                        const filteredOther = otherRatesList.filter(item =>
                          !ratesSearch || item.label.toLowerCase().includes(ratesSearch.toLowerCase())
                        )
                        if (filteredOther.length === 0) return null
                        return (
                          <div className="rounded-2xl overflow-hidden shadow-xs border" style={{ borderColor: border, backgroundColor: cardBg }}>
                            <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ backgroundColor: headerBgColor, borderColor: border }}>
                              <div className="flex items-center gap-3">
                                {iconChip(<PiggyBank className="w-4 h-4 text-indigo-500" />, 'rgba(99,102,241,0.12)', 'rgba(99,102,241,0.18)')}
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>Other Standard Allowances & Fees</span>
                              </div>
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-500 shrink-0">
                                {filteredOther.length} items
                              </span>
                            </div>
                            <div className="divide-y" style={{ borderColor: border }}>
                              {filteredOther.map(item => {
                                const val = draftRates[item.key]
                                const isOverridden = val !== item.defaultVal
                                return (
                                  <div
                                    key={item.key}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 px-5 py-3.5 transition-colors hover:bg-slate-500/5"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold leading-relaxed" style={{ color: textPrimary }}>
                                          {item.label}
                                        </span>
                                        {isOverridden && (
                                          <span className="text-[9px] font-black text-emerald-500 uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                            Custom
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <div className="relative w-32 sm:w-36">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none text-slate-400">₱</span>
                                        <NumericFormat
                                          thousandSeparator=","
                                          decimalScale={2}
                                          allowNegative={false}
                                          placeholder={String(item.defaultVal)}
                                          value={draftRates[item.key]}
                                          onValueChange={values => setDraftRates(prev => ({ ...prev, [item.key]: values.floatValue ?? 0 }))}
                                          className="w-full pl-7 pr-3 py-2 rounded-xl text-xs font-bold border text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                                          style={{
                                            backgroundColor: inputBg,
                                            borderColor: isOverridden ? '#10B981' : inputBorder,
                                            color: textPrimary,
                                          }}
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setDraftRates(prev => ({ ...prev, [item.key]: item.defaultVal }))}
                                        disabled={!isOverridden}
                                        title="Reset to default rate"
                                        className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-500/10 disabled:opacity-0 cursor-pointer transition-colors shrink-0"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Column 2 (Right): General Cleaning, System Reprocess, Check Up, Pull Down, Other Service Fees */}
                    <div className="flex flex-col gap-6">
                      {['General Cleaning', 'System Reprocess', 'Check Up', 'Pull Down Cleaning', 'Other Service Fees'].map(group => {
                        const items = STANDARD_RATE_TABLE.filter(item =>
                          item.group === group &&
                          (!ratesSearch || item.label.toLowerCase().includes(ratesSearch.toLowerCase()))
                        )
                        if (items.length === 0) return null

                        const [groupIcon, chipBgLight, chipBgDark] = group === 'General Cleaning' ? [<Wind className="w-4 h-4 text-cyan-500" key="i" />, 'rgba(6,182,212,0.12)', 'rgba(6,182,212,0.18)']
                          : group === 'System Reprocess' ? [<Recycle className="w-4 h-4 text-amber-500" key="i" />, 'rgba(245,158,11,0.12)', 'rgba(245,158,11,0.18)']
                          : group === 'Check Up' ? [<Stethoscope className="w-4 h-4 text-blue-500" key="i" />, 'rgba(59,130,246,0.12)', 'rgba(59,130,246,0.18)']
                          : group === 'Pull Down Cleaning' ? [<ArrowBigDownDash className="w-4 h-4 text-purple-500" key="i" />, 'rgba(168,85,247,0.12)', 'rgba(168,85,247,0.18)']
                          : [<Snowflake className="w-4 h-4 text-sky-500" key="i" />, 'rgba(56,189,248,0.12)', 'rgba(56,189,248,0.18)']

                        return (
                          <div key={group} className="rounded-2xl overflow-hidden shadow-xs border" style={{ borderColor: border, backgroundColor: cardBg }}>
                            <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ backgroundColor: headerBgColor, borderColor: border }}>
                              <div className="flex items-center gap-3">
                                {iconChip(groupIcon, chipBgLight, chipBgDark)}
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>{group}</span>
                              </div>
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-500/10 shrink-0" style={{ color: textMuted }}>
                                {items.length} items
                              </span>
                            </div>
                            <div className="divide-y" style={{ borderColor: border }}>
                              {items.map(item => renderRateItemRow(item))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div
                  className="flex items-center justify-between flex-wrap gap-4 px-8 py-5 shrink-0 border-t shadow-xs"
                  style={{
                    backgroundColor: isLight ? '#f8fafc' : '#0B1324',
                    borderColor: border,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const defaults: Record<string, number> = {}
                        STANDARD_RATE_TABLE.forEach(item => { defaults[item.key] = item.defaultRate })
                        setDraftRates({
                          dailyAllowance: DEFAULT_PAYROLL_RATES.dailyAllowance,
                          earthGrounding: DEFAULT_PAYROLL_RATES.earthGrounding,
                          survey: DEFAULT_PAYROLL_RATES.survey,
                          rescheduled: DEFAULT_PAYROLL_RATES.rescheduled,
                          lineItemOverrides: defaults,
                        })
                      }}
                      disabled={overrideCount === 0}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-30 cursor-pointer border hover:border-rose-500/40 hover:text-rose-500"
                      style={{
                        borderColor: border,
                        backgroundColor: inputBg,
                        color: textMuted,
                      }}
                      title="Reset all branch rates to defaults"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset All to Defaults</span>
                    </button>
                    {overrideCount > 0 && (
                      <span className="text-[11px] font-extrabold text-emerald-500 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        {overrideCount} custom {overrideCount === 1 ? 'override' : 'overrides'} active
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setRatesModalOpen(false)}
                      className="px-6 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer hover:opacity-80 active:scale-95"
                      style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveRates}
                      disabled={savingRates}
                      className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-xs font-black text-white transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 cursor-pointer"
                      style={{ background: '#10B981' }}
                    >
                      {savingRates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>{savingRates ? 'Saving Rates…' : 'Save Rates'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      {/* Deductions modal — big popup, no click-outside/Escape dismiss. Only Close, Save, or the
          X button in the header may close it, so an in-progress edit is never lost to a stray click. */}
      {deductionsModalInstaller && createPortal(
        (() => {
          const installerRows = grouped.find(([name]) => name === deductionsModalInstaller)?.[1] ?? []
          const gross = installerTotal(installerRows)
          const base = baseInstallTotal(installerRows)
          const totalDeduction = deductionTotal(installerRows)
          const net = gross - totalDeduction
          const lateMinutes = deductionValue(installerRows, 'lateMinutes')
          const loan = deductionValue(installerRows, 'loan')
          const loanBalance = deductionValue(installerRows, 'loanBalance')
          const uniformBalance = deductionValue(installerRows, 'uniformBalance')
          const dedRed = isLight ? '#DC2626' : '#F87171'
          const fieldCls = "w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-right tabular-nums border outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          const fieldStyle = { backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', borderColor: inputBorder, color: textPrimary }
          const moneyField = (key: DeductionKey, value: number, compact = false) => (
            <NumericFormat
              thousandSeparator=","
              decimalScale={key === 'lateMinutes' ? 0 : 2}
              allowNegative={false}
              prefix={key === 'lateMinutes' ? undefined : '₱'}
              suffix={key === 'lateMinutes' ? ' min' : undefined}
              value={value || ''}
              placeholder={key === 'lateMinutes' ? '0 min' : '₱0.00'}
              disabled={!canManagePayroll}
              onValueChange={(values, info) => {
                if (info.source === 'event') setDeduction(installerRows, key, values.value)
              }}
              className={`${fieldCls} ${compact ? 'max-w-[120px]' : ''}`}
              style={fieldStyle}
            />
          )
          const remark = (text: ReactNode) => (
            <span className="text-[11px] font-medium" style={{ color: textMuted }}>{text}</span>
          )
          const lines: { label: string; sub?: string; amount: ReactNode; remarks: ReactNode }[] = [
            {
              label: 'Late',
              sub: `₱${LATE_RATE_PER_MINUTE.toFixed(2)} / minute`,
              amount: moneyField('lateMinutes', lateMinutes),
              remarks: lateMinutes > 0
                ? remark(<>{lateMinutes} min × ₱{LATE_RATE_PER_MINUTE.toFixed(2)} = <b style={{ color: dedRed }}>₱{peso(lateDeduction(installerRows))}</b></>)
                : remark('No lates'),
            },
            {
              label: 'AC Loan / CA',
              amount: moneyField('loan', loan),
              remarks: (
                <div className="flex items-center gap-2 min-w-0">
                  {loan === 0 && loanBalance === 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ backgroundColor: isLight ? '#f1f5f9' : '#111d33', color: textMuted }}>NO LOAN</span>
                  )}
                  <span className="text-[11px] font-medium shrink-0" style={{ color: textMuted }}>Balance</span>
                  {moneyField('loanBalance', loanBalance, true)}
                </div>
              ),
            },
            { label: 'Incomplete Upload', amount: moneyField('incompleteUpload', deductionValue(installerRows, 'incompleteUpload')), remarks: remark('Missing photos, video or checklist') },
            { label: 'Losses / Material Checklist', amount: moneyField('losses', deductionValue(installerRows, 'losses')), remarks: remark('Lost tools or unreturned materials') },
            { label: 'Remit', amount: moneyField('remitPenalty', deductionValue(installerRows, 'remitPenalty')), remarks: remark('No remit — ×3 charges') },
            {
              label: 'Uniform',
              sub: `₱${peso(UNIFORM_PRICE_PER_PC)} / pc`,
              amount: moneyField('uniform', deductionValue(installerRows, 'uniform')),
              remarks: (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-medium shrink-0" style={{ color: textMuted }}>Balance</span>
                  {moneyField('uniformBalance', uniformBalance, true)}
                </div>
              ),
            },
          ]
          const lineGrid = "grid grid-cols-[minmax(0,1fr)_130px] md:grid-cols-[minmax(0,1.1fr)_150px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5"
          return (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
              <div
                className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border animate-in zoom-in-95 duration-200"
                style={{
                  maxWidth: '1060px',
                  height: 'min(86vh, 760px)',
                  maxHeight: '90vh',
                  backgroundColor: cardBg,
                  borderColor: border,
                  boxShadow: isLight
                    ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    : '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between gap-4 px-8 py-5 shrink-0"
                  style={{ backgroundColor: isLight ? '#ffffff' : '#0B1324', borderBottom: `1px solid ${border}` }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: isLight ? '#fef3c7' : 'rgba(251,191,36,0.14)' }}
                    >
                      <Receipt className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-extrabold tracking-tight truncate" style={{ color: textPrimary }}>
                        {titleCase(displayInstallerName(deductionsModalInstaller))}&rsquo;s Deductions &amp; Adjustments
                      </h2>
                      <p className="text-xs font-semibold mt-1 leading-snug" style={{ color: textMuted }}>
                        Late minutes, AC loans &amp; cash advances, incomplete uploads, losses, uniform, and remit penalties.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeductionsModalInstaller(null)}
                    className="p-2.5 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                    style={{ color: textMuted }}
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col lg:flex-row" style={{ backgroundColor: cardBg }}>
                  {/* Deductions Editor */}
                  <div className="flex-1 min-w-0 px-6 md:px-8 py-5">
                    <div className={`${lineGrid} pb-2 mb-1 text-[10px] font-bold uppercase tracking-wider`} style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>
                      <span>Deductions</span>
                      <span className="text-right">Amount</span>
                      <span className="hidden md:block">Remarks</span>
                    </div>
                    {lines.map(line => (
                      <div key={line.label} className={`${lineGrid} py-2`}>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate" style={{ color: textPrimary }}>{line.label}</div>
                          {line.sub && <div className="text-[10px] font-medium" style={{ color: textMuted }}>{line.sub}</div>}
                        </div>
                        {line.amount}
                        <div className="col-span-2 md:col-span-1 min-w-0">{line.remarks}</div>
                      </div>
                    ))}
                    <div className={`${lineGrid} pt-2.5 mt-1`} style={{ borderTop: `1px solid ${border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: dedRed }}>Total Deduction</span>
                      <span className="text-sm font-bold tabular-nums text-right pr-2.5" style={{ color: totalDeduction > 0 ? dedRed : textMuted }}>
                        {totalDeduction > 0 ? `−₱${peso(totalDeduction)}` : '₱0.00'}
                      </span>
                    </div>
                  </div>

                  {/* Net payroll */}
                  <div className="lg:w-80 shrink-0 px-6 md:px-8 py-5 flex flex-col gap-3 border-t lg:border-t-0 lg:border-l" style={{ borderColor: border, backgroundColor: headerBg }}>
                    <div className="flex flex-col gap-1.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold uppercase tracking-wide text-[11px]" style={{ color: textMuted }}>Gross Total Labor</span>
                        <span className="font-bold tabular-nums" style={{ color: textPrimary }}>₱{peso(gross)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: textMuted }}>
                        <span>Base install ₱{peso(base)} · Add-ons ₱{peso(gross - base)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold uppercase tracking-wide text-[11px]" style={{ color: textMuted }}>Total Deduction</span>
                        <span className="font-bold tabular-nums" style={{ color: totalDeduction > 0 ? dedRed : textMuted }}>
                          {totalDeduction > 0 ? `−₱${peso(totalDeduction)}` : '₱0.00'}
                        </span>
                      </div>
                    </div>
                    <div
                      className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                      style={{ backgroundColor: isLight ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.45)' }}
                    >
                      <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: isLight ? '#047857' : '#34D399' }}>Net Payroll</span>
                      <span className="text-xl font-extrabold tabular-nums" style={{ color: net < 0 ? dedRed : (isLight ? '#047857' : '#34D399') }}>
                        {net < 0 ? '−' : ''}₱{peso(Math.abs(net))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer — Close and Save are the only other ways out of this modal. */}
                <div
                  className="flex items-center justify-end gap-3 px-8 py-4 shrink-0"
                  style={{ backgroundColor: isLight ? 'rgba(241, 245, 249, 0.7)' : 'rgba(15, 26, 46, 0.7)', borderTop: `1px solid ${border}` }}
                >
                  <button
                    type="button"
                    onClick={() => setDeductionsModalInstaller(null)}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer hover:opacity-80 active:scale-95"
                    style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={saveDeductionsNow}
                    className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-xs font-black text-white transition-all shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
                    style={{ background: '#10B981' }}
                  >
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </button>
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      {completeModalFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setCompleteModalFor(null)}
        >
          <div
            className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border animate-in zoom-in-95 duration-150"
            style={{ maxWidth: 460, backgroundColor: cardBg, borderColor: border }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: textPrimary }}>
                  COMPLETE PAYROLL — {displayInstallerName(completeModalFor)}
                </h2>
              </div>
              <button type="button" onClick={() => setCompleteModalFor(null)} className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors">
                <X className="w-4 h-4" style={{ color: textMuted }} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                  COMPLETED BY
                </span>
                <div
                  className="w-full rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wider select-none opacity-90"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: '#10B981' }}
                >
                  {userFirstName}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                  DATE SUBMITTED
                </span>
                <div
                  className="w-full rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wider select-none"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                >
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                  REMARKS (OPTIONAL)
                </span>
                <textarea
                  rows={3}
                  placeholder="ADD ANY REMARKS OR AUDIT NOTES..."
                  value={completeRemarks}
                  onChange={e => setCompleteRemarks(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border p-3 text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 shrink-0 border-t" style={{ borderColor: border }}>
              <button
                type="button"
                onClick={() => setCompleteModalFor(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase transition-colors"
                style={{ color: textMuted, backgroundColor: isLight ? '#f1f5f9' : '#0d1520' }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!completeModalFor) return
                  const upperRemarks = completeRemarks.trim().toUpperCase()
                  updateInstallerRows(completeModalFor, {
                    status: 'COMPLETE',
                    audited: userFirstName,
                    remarks: upperRemarks,
                  })
                  setCompleteModalFor(null)
                }}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase text-white shadow-md active:scale-95 transition-all"
                style={{ backgroundColor: '#10B981' }}
              >
                SAVE &amp; COMPLETE
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}
