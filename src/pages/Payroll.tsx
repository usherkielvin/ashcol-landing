import { useState, useEffect, useCallback, useRef, useMemo, type FocusEvent, type MouseEvent as ReactMouseEvent, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NumericFormat } from 'react-number-format'
import {
  Search, Building2, Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  SlidersHorizontal, Plus, X, RotateCcw, RefreshCw, Save, Loader2, EyeOff, Trash2,
  Stethoscope, Lightbulb, HardHat, PiggyBank, Wind, Recycle, ArrowBigDownDash, Snowflake,
  Users, Clock,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin, isPayrollMember } from '../utils/api'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import {
  fetchAndMapPayroll,
  deduplicateAndMergePayroll,
  DEFAULT_PAYROLL_RATES,
  STANDARD_RATE_TABLE,
  type PayrollRow,
  type PayrollRates,
} from '../utils/payrollDerive'

const peso = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) || 0 : (v ?? 0)
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const num = (s: string) => parseFloat(s) || 0
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

// Mirrors the sheet's "PAYROLL DUE" — sum of every fee-type column, whether or not that
// column is currently shown (a hidden column can still hold an amount).
const rowTotal = (r: PayrollRow) =>
  num(r.installationFee) + num(r.earthGrounding) + num(r.dailyAllowance)
  + num(r.excessCopperTube) + num(r.hauling) + num(r.dismantling) + num(r.electricalWorks)
  + num(r.chippingWorks) + num(r.breaker) + num(r.powerSupplyLaborOnly) + num(r.powerSupplyLaborMaterials)
  + num(r.specialBracketCatwalk) + num(r.specialBracketWelding) + num(r.excessCopperTubeLaborOnly)
  + num(r.relocationAccuFcu) + num(r.systemReprocessLabor) + num(r.drainPumpInstallation)
  + num(r.scaffoldingInstallation) + num(r.flushingOldPipe) + num(r.sterneBracket)
  + num(r.breakerInstallationLabor) + num(r.chargingOfFreon) + num(r.materialsReturn)

const installerTotal = (installerRows: PayrollRow[]) =>
  installerRows.reduce((sum, r) => sum + rowTotal(r), 0)

// Counts only actually-completed installs (schedule status "DONE INSTALL") — not cleanings,
// surveys, or manually added rows of some other job type. installerRows is already scoped to
// the active date-range filter, so this is automatically "within the selected range" too.
const installedUnitsCount = (installerRows: PayrollRow[]) =>
  installerRows.filter(r => r.installationUpload.trim().toUpperCase() === 'DONE INSTALL').length

// Money owed BACK to the branch — parses the free-text remit field ("2,000 CASH", "FREE")
// down to its numeric amount, ignoring the payment-method text.
const parseMoneyText = (s: string) => {
  const cleaned = (s || '').replace(/[^0-9.]/g, '')
  return cleaned ? parseFloat(cleaned) || 0 : 0
}
const remittanceTotal = (rowsIn: PayrollRow[]) => rowsIn.reduce((sum, r) => sum + parseMoneyText(r.actualCollected), 0)
const baseInstallTotal = (rowsIn: PayrollRow[]) => rowsIn.reduce((sum, r) => sum + num(r.installationFee), 0)


type ColumnKey =
  | 'date' | 'ticketNumber' | 'customerName' | 'brandCapacity' | 'remit'
  | 'installationUpload' | 'installationFee' | 'totalPipeLength' | 'earthGrounding' | 'dailyAllowance'
  | 'excessCopperTube' | 'hauling' | 'dismantling' | 'electricalWorks' | 'chippingWorks' | 'breaker'
  | 'powerSupplyLaborOnly' | 'powerSupplyLaborMaterials' | 'specialBracketCatwalk' | 'specialBracketWelding'
  | 'excessCopperTubeLaborOnly' | 'relocationAccuFcu' | 'systemReprocessLabor' | 'drainPumpInstallation'
  | 'scaffoldingInstallation' | 'flushingOldPipe' | 'sterneBracket' | 'breakerInstallationLabor'
  | 'chargingOfFreon' | 'materialsReturn' | 'installationChecklist' | 'videoUpload' | 'remarks' | 'audited'

// Date / Ticket # / Customer Name are fetched from the schedule ticket — glued to the left edge
// while the fee columns scroll, and read-only for synced rows (see readOnlyWhenSynced below).
const STICKY_LEFT_KEYS: ColumnKey[] = ['date', 'ticketNumber', 'customerName']

type ColumnCategory = 'standard' | 'piping' | 'electrical' | 'structural' | 'masonry' | 'admin'

const CATEGORY_META: Record<ColumnCategory, { label: string; blurb: string }> = {
  standard: { label: 'Standard Add-ons', blurb: 'Shown by default — the usual per-job extras' },
  piping: { label: 'Piping & Copper', blurb: 'Copper tube and flushing-related fees' },
  electrical: { label: 'Electrical & Power', blurb: 'Wiring, breakers, and power supply labor' },
  structural: { label: 'Structural Work', blurb: 'Brackets, scaffolding, hauling, relocation' },
  masonry: { label: 'Masonry & Labor', blurb: 'Chipping and other masonry-type labor fees' },
  admin: { label: 'Admin & Notes', blurb: 'Paperwork, uploads, and remarks' },
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
  { key: 'customerName', label: 'Customer Name', width: 220, align: 'left', pinned: true, readOnlyWhenSynced: true },
  { key: 'brandCapacity', label: 'Brand', width: 150, align: 'left', pinned: true },
  { key: 'remit', label: 'Remit', width: 120, align: 'right', pinned: true },
  { key: 'installationUpload', label: 'Status', width: 130, align: 'left', pinned: true },
  { key: 'installationFee', label: 'Install Fee', width: 100, align: 'right', pinned: true, isMoney: true },
  { key: 'totalPipeLength', label: 'Pipe Length', width: 90, align: 'right', category: 'standard' },
  { key: 'earthGrounding', label: 'Earth Grounding', width: 100, align: 'right', category: 'standard', isMoney: true },
  { key: 'dailyAllowance', label: 'Daily Allowance', width: 100, align: 'right', category: 'standard', isMoney: true },
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

const COLUMN_PRESETS: { label: string; cats: ColumnCategory[] }[] = [
  { label: 'Standard', cats: ['standard'] },
  { label: 'Electrical Heavy', cats: ['standard', 'electrical'] },
  { label: 'Structural Heavy', cats: ['standard', 'structural'] },
]

// Only "Standard Add-ons" show on first visit — every other fee category starts hidden
// since most are blank for any given installer/job (see COLUMN_DEFS comment above).
const DEFAULT_HIDDEN_COLUMNS: ColumnKey[] = COLUMN_DEFS
  .filter(c => !c.pinned && c.category !== 'standard')
  .map(c => c.key as ColumnKey)

const HIDDEN_COLUMNS_KEY = 'ashcol-payroll-hidden-columns'
const COLUMN_WIDTHS_KEY = 'ashcol-payroll-column-widths'
const CUSTOM_COLUMNS_KEY = 'ashcol-payroll-custom-columns'
const MIN_COLUMN_WIDTH = 70

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
  // Header shows no save-status indicator per the simplified toolbar — the setter still
  // drives autosave logic below, the value itself just isn't rendered anywhere right now.
  const [, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // null = the roster (list of installers); a name = that installer's own table.
  const [selectedInstaller, setSelectedInstaller] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [completeModalFor, setCompleteModalFor] = useState<string | null>(null)
  const [completeRemarks, setCompleteRemarks] = useState('')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      if (activeBranch && activeBranch !== 'ALL_BRANCHES') return activeBranch
      return 'BR-TAGUIG-SALES'
    }
    return user?.branchId || 'BR-TAGUIG-SALES'
  })

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
  const [branchTechnicians, setBranchTechnicians] = useState<{ id: string; name: string; nickname: string; jobTitle: string }[]>([])
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
          .map(u => ({ id: u.id, name: String(u.name || '').trim(), nickname: String(u.nickname || '').trim(), jobTitle: u.jobTitle || '' }))
        setBranchTechnicians(filtered)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [branchFilter])

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
  // Custom columns aren't resizable in this first pass (no entry in columnWidths/
  // DEFAULT_COLUMN_WIDTHS, both still strictly ColumnKey-keyed) — they just get a fixed width.
  const widthFor = (key: string) => columnWidths[key as ColumnKey] ?? DEFAULT_COLUMN_WIDTHS[key as ColumnKey] ?? 120

  const resizingRef = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null)
  const [resizingKey, setResizingKey] = useState<ColumnKey | null>(null)
  const handleResizeMove = (e: MouseEvent) => {
    const r = resizingRef.current
    if (!r) return
    const next = Math.max(MIN_COLUMN_WIDTH, r.startWidth + (e.clientX - r.startX))
    setColumnWidths(prev => ({ ...prev, [r.key]: next }))
  }
  const handleResizeEnd = () => {
    resizingRef.current = null
    setResizingKey(null)
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', handleResizeEnd)
  }
  const handleResizeStart = (key: ColumnKey) => (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = { key, startX: e.clientX, startWidth: widthFor(key) }
    setResizingKey(key)
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
  }
  const handleResizeDoubleClick = (key: ColumnKey) => () => {
    setColumnWidths(prev => ({ ...prev, [key]: DEFAULT_COLUMN_WIDTHS[key] }))
  }

  useEffect(() => {
    if (!canManagePayroll) return
    const sync = () => {
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      setBranchFilter(activeBranch && activeBranch !== 'ALL_BRANCHES' ? activeBranch : '')
    }
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [canManagePayroll])

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
        let merged = savedRows
        if (scheduleResult.ok && scheduleResult.rows.length > 0) {
          merged = deduplicateAndMergePayroll(savedRows, scheduleResult.rows)
        }

        // Auto-save merged state if new schedule entries were discovered
        if (canManagePayroll && merged.length > savedRows.length) {
          void savePayrollToBackend(merged, branchFilter, mKey)
        }

        combinedSavedRows = deduplicateAndMergePayroll(combinedSavedRows, merged)
      }

      setRows(combinedSavedRows)
    } catch (e) {
      console.error('Failed to auto-fetch payroll and schedules:', e)
    } finally {
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
        const list = (data?.data || data || []).map((b: any) => ({ id: b.id, name: b.name, payrollRates: b.payrollRates }))
        const sorted = list.sort((a: any, b: any) => a.name.localeCompare(b.name))
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
  const scheduleAutoSave = (updated: PayrollRow[]) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setSaveStatus('saving')
    autoSaveTimer.current = setTimeout(() => {
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
    }, 700)
  }

  // Debounced auto-save on row edits
  const updateRow = (id: string, patch: Partial<PayrollRow>) => {
    setRows(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...patch } : r)
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

  const columnAccessors: Record<string, { get: (r: PayrollRow) => string; set: (id: string, v: string) => void }> = {
    date: { get: r => r.workDate, set: (id, v) => updateRow(id, { workDate: v }) },
    ticketNumber: { get: r => r.ticketNumber, set: (id, v) => updateRow(id, { ticketNumber: v }) },
    customerName: { get: r => r.customerName, set: (id, v) => updateRow(id, { customerName: v }) },
    brandCapacity: { get: r => r.brandCapacity, set: (id, v) => updateRow(id, { brandCapacity: v }) },
    remit: { get: r => r.actualCollected, set: (id, v) => updateRow(id, { actualCollected: v }) },
    installationUpload: { get: r => r.installationUpload, set: (id, v) => updateRow(id, { installationUpload: v }) },
    installationFee: { get: r => r.installationFee, set: (id, v) => updateRow(id, { installationFee: v }) },
    totalPipeLength: { get: r => r.totalPipeLength, set: (id, v) => updateRow(id, { totalPipeLength: v }) },
    earthGrounding: { get: r => r.earthGrounding, set: (id, v) => updateRow(id, { earthGrounding: v }) },
    dailyAllowance: { get: r => r.dailyAllowance, set: (id, v) => updateRow(id, { dailyAllowance: v }) },
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
  // Custom columns read/write row.customFields[key], merging so setting one custom value
  // never clobbers another custom value already on that row.
  for (const cc of customColumnDefs) {
    columnAccessors[cc.key] = {
      get: r => r.customFields?.[cc.key] || '',
      set: (id, v) => updateRow(id, { customFields: { ...(rows.find(r => r.id === id)?.customFields || {}), [cc.key]: v } }),
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

  const filteredRows = useMemo(() => {
    const term = search.toLowerCase()
    return rows.filter(r => {
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
  }, [rows, search, dateFrom, dateTo])

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


  // Cell input: no box of its own — it fills its grid cell edge-to-edge like a
  // spreadsheet cell. The grid line (border) lives on the cell wrapper, not the input.
  const inputCls = "w-full h-full px-3 py-3 text-sm font-semibold uppercase bg-transparent border-0 outline-none focus:outline-none focus:ring-0"
  // No text-align baked in — alignment is set per-column (numeric columns go right-aligned).
  const thCls = "px-3 py-3 text-[11px] font-semibold uppercase tracking-wider opacity-70 whitespace-nowrap overflow-hidden text-ellipsis"
  const visibleColumnsFor = (installerName: string): ColumnDef[] => {
    const hidden = hiddenColumnsFor(installerName)
    const fixed = COLUMN_DEFS.filter(c => c.pinned || !hidden.has(c.key as ColumnKey))
    // Custom columns always show, right after the fixed set — no per-installer hide/show yet.
    const custom: ColumnDef[] = customColumnDefs.map(cc => ({
      key: cc.key, label: cc.label, width: 120, align: 'right', isMoney: true,
    }))
    return [...fixed, ...custom]
  }
  const cellBorder = { borderRight: `1px solid ${border}` }
  const cellFocusBg = isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)'
  const onCellFocus = (e: FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = cellFocusBg }
  const onCellBlur = (e: FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = 'transparent' }
  // Sticky cells can't blur back to 'transparent' — with position:sticky, transparent would let
  // scrolled-under content show through. They reset to their own row's real (opaque) background.
  const onCellBlurBg = (bg: string) => (e: FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = bg }
  const zebraBg = isLight ? '#f8fafc' : '#0c1420'
  const rowHoverBg = isLight ? '#eef2f7' : '#111d33'
  const headerBg = isLight ? '#f8fafc' : '#0d1520'
  const numericStyle = { textAlign: 'right' as const }

  // Amount + Method live in one free-text `remit` field today — tinted distinctly from the
  // Technician Labor & Add-ons columns so remittance (money owed BACK to the branch) never
  // reads as part of the crew's payout.
  const remitTint = isLight ? '#F0F9FF' : 'rgba(56,189,248,0.10)'
  const remitAccent = isLight ? '#0369A1' : '#7DD3FC'
  const remitFocusBg = isLight ? 'rgba(2,132,199,0.14)' : 'rgba(56,189,248,0.22)'
  const onRemitFocus = (e: FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = remitFocusBg }
  const onRemitBlur = (e: FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = remitTint }

  // Sticky-left columns are all `pinned: true` and never hidden, so their cumulative left
  // offset only changes when one of them is resized — recomputed from live widths.
  const stickyLeftOffsets = useMemo(() => {
    const offsets: Partial<Record<ColumnKey, number>> = {}
    let running = 0
    for (const key of STICKY_LEFT_KEYS) {
      offsets[key] = running
      running += widthFor(key)
    }
    return offsets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnWidths])

  /** Date / Ticket # / Customer Name stay glued to the left edge — needs an explicit opaque
   *  background since sticky content would otherwise show whatever scrolls underneath it. */
  const stickyCellStyle = (colKey: string, opaqueBg: string): CSSProperties => {
    const leftOffset = stickyLeftOffsets[colKey as ColumnKey]
    if (leftOffset !== undefined) {
      return { position: 'sticky', left: leftOffset, zIndex: 2, backgroundColor: opaqueBg }
    }
    return {}
  }

  // Payout breakdown tile — used both per-installer (below each table) and for the
  // all-crew total (in the Summary card), so remittance always reads as separate from payout.
  const footerTile = (label: string, value: number, color: string) => (
    <div className="px-4 py-3.5 min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wider truncate opacity-60" style={{ color: textMuted }}>{label}</div>
      <div className="text-sm font-bold tabular-nums" style={{ color }}>₱{peso(value)}</div>
    </div>
  )

  // Mobile card value cell — same accessors as the desktop grid, just without the
  // sticky/pin plumbing a card list doesn't need. Date/Ticket #/Customer Name and Job
  // Total are never passed in here — the mobile card shows those in its header instead.
  const renderMobileCellValue = (col: ColumnDef, row: PayrollRow) => {
    const smallInputCls = "w-full text-right px-2 py-2 rounded-lg text-sm font-semibold uppercase bg-transparent border-0 outline-none focus:ring-1 focus:ring-emerald-500/40"

    if (col.key === 'remit') {
      const acc = columnAccessors[col.key]
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

    if (col.isMoney) {
      const acc = columnAccessors[col.key]
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

    const acc = columnAccessors[col.key]
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
    <div className="flex flex-col gap-4 pb-4 md:pb-4 h-full min-h-0">
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
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>
                ))}
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
              style={{
                backgroundColor: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)',
                borderColor: '#10B98150',
                color: '#10B981',
              }}
              title="Sync latest updated tickets from Schedules (DONE CLEANING / DONE INSTALL)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing…' : 'Sync Latest'}</span>
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
            const groupGridTemplate = groupVisibleColumns.map(c => `${widthFor(c.key)}px`).join(' ')
            const groupMinWidth = groupVisibleColumns.reduce((sum, c) => sum + widthFor(c.key), 0)
            return (
              <div key={installerName} className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
                <div
                  className="flex items-center justify-between px-6 py-4"
                  style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base md:text-lg font-bold" style={{ color: textPrimary }}>
                      {titleCase(displayInstallerName(installerName))}
                    </span>
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium"
                      style={{
                        backgroundColor: isLight ? '#f1f5f9' : '#0d1520',
                        color: textMuted,
                      }}
                    >
                      {installedUnitsCount(installerRows)} aircon units
                    </span>
                    <button
                      type="button"
                      onClick={() => openColumnManager(installerName)}
                      title="Show/hide columns"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border hover:border-emerald-500/50"
                      style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                      Columns
                    </button>
                  </div>
                  <span className="text-base md:text-lg font-bold tabular-nums" style={{ color: '#10B981' }}>₱{peso(installerTotal(installerRows))}</span>
                </div>

                  <div className="hidden md:block w-full overflow-x-auto">
                    <div
                      className="w-full"
                      style={{ fontSize: '14px', color: textPrimary, minWidth: groupMinWidth }}
                    >
                      <div
                        className="grid sticky top-0 z-10"
                        style={{ gridTemplateColumns: groupGridTemplate, borderBottom: `2px solid ${border}`, color: textMuted, backgroundColor: headerBg }}
                      >
                        {groupVisibleColumns.map((col, i) => {
                          const isRemit = col.key === 'remit'
                          return (
                            <div
                              key={col.key}
                              className={`${thCls} ${col.align === 'right' ? 'text-right' : 'text-left'} relative select-none cursor-default`}
                              title={col.label}
                              style={{
                                ...(i < groupVisibleColumns.length - 1 ? cellBorder : {}),
                                ...stickyCellStyle(col.key, headerBg),
                                ...(isRemit ? { backgroundColor: remitTint, color: remitAccent } : {}),
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                setColCtxMenu({ x: e.clientX, y: e.clientY, col, installerName })
                              }}
                            >
                              {col.label}
                              {/* Drag to resize; double-click resets to default width. Custom
                                  columns aren't resizable yet, so no handle for those. */}
                              {COLUMN_DEFS.some(c => c.key === col.key) && (
                                <span
                                  onMouseDown={handleResizeStart(col.key as ColumnKey)}
                                  onDoubleClick={handleResizeDoubleClick(col.key as ColumnKey)}
                                  onClick={e => e.stopPropagation()}
                                  title="Drag to resize"
                                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-10 hover:bg-emerald-500/40"
                                  style={resizingKey === col.key ? { backgroundColor: 'rgba(16,185,129,0.6)' } : undefined}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {installerRows.map((row, idx) => {
                        const rowBg = idx % 2 === 1 ? zebraBg : 'transparent'
                        // Sticky cells need a real (non-'transparent') background — this is
                        // what they show instead so scrolled-under content never bleeds through.
                        const rowOpaqueBg = idx % 2 === 1 ? zebraBg : cardBg
                        return (
                          <div
                            key={row.id}
                            className="grid"
                            style={{ gridTemplateColumns: groupGridTemplate, borderBottom: `1px solid ${border}`, backgroundColor: rowBg }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = rowHoverBg }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = rowBg }}
                          >
                            {groupVisibleColumns.map((col, i) => {
                              const cellStyle = {
                                ...(i < groupVisibleColumns.length - 1 ? cellBorder : {}),
                                ...(col.align === 'right' ? numericStyle : {}),
                              }
                              const sticky = stickyCellStyle(col.key, rowOpaqueBg)

                              // Date / Ticket # / Customer Name — fetched from the schedule ticket,
                              // read-only once synced (manually added rows with no ticketId stay editable).
                              if (col.readOnlyWhenSynced) {
                                const isReadOnly = !!row.ticketId
                                const readOnlyStyle = { ...cellStyle, ...sticky, opacity: isReadOnly ? 0.65 : 1, cursor: isReadOnly ? 'default' as const : 'text' as const }
                                if (col.key === 'date') {
                                  return (
                                    <input
                                      key={col.key}
                                      type="date"
                                      value={row.workDate}
                                      onChange={e => updateRow(row.id, { workDate: e.target.value })}
                                      readOnly={isReadOnly}
                                      title={isReadOnly ? 'Synced from the ticket — not editable here' : undefined}
                                      className={inputCls}
                                      style={readOnlyStyle}
                                      onFocus={isReadOnly ? undefined : onCellFocus}
                                      onBlur={isReadOnly ? undefined : onCellBlurBg(rowOpaqueBg)}
                                    />
                                  )
                                }
                                const acc = columnAccessors[col.key]
                                return (
                                  <input
                                    key={col.key}
                                    type="text"
                                    value={acc.get(row)}
                                    onChange={e => acc.set(row.id, e.target.value)}
                                    readOnly={isReadOnly}
                                    title={isReadOnly ? 'Synced from the ticket — not editable here' : undefined}
                                    className={inputCls}
                                    style={readOnlyStyle}
                                    onFocus={isReadOnly ? undefined : onCellFocus}
                                    onBlur={isReadOnly ? undefined : onCellBlurBg(rowOpaqueBg)}
                                  />
                                )
                              }

                              // Remit — visually separated from labor/add-on fees (blue tint), since
                              // it's money owed BACK to the branch, not part of the crew's payout.
                              if (col.key === 'remit') {
                                const acc = columnAccessors[col.key]
                                return (
                                  <input
                                    key={col.key}
                                    type="text"
                                    value={acc.get(row)}
                                    onChange={e => acc.set(row.id, e.target.value)}
                                    className={inputCls}
                                    style={{ ...cellStyle, backgroundColor: remitTint }}
                                    onFocus={onRemitFocus}
                                    onBlur={onRemitBlur}
                                  />
                                )
                              }

                              // Fee/add-on amounts — comma-formatted (e.g. 1,500.00) via the same
                              // NumericFormat component the DTR form already uses for money fields.
                              if (col.isMoney) {
                                const acc = columnAccessors[col.key]
                                return (
                                  <NumericFormat
                                    key={col.key}
                                    thousandSeparator=","
                                    decimalScale={2}
                                    allowNegative={false}
                                    value={acc.get(row)}
                                    onValueChange={values => acc.set(row.id, values.value)}
                                    className={inputCls}
                                    style={cellStyle}
                                    onFocus={onCellFocus}
                                    onBlur={onCellBlur}
                                  />
                                )
                              }

                              const acc = columnAccessors[col.key]
                              return (
                                <input
                                  key={col.key}
                                  type="text"
                                  value={acc.get(row)}
                                  onChange={e => acc.set(row.id, e.target.value)}
                                  className={inputCls}
                                  style={cellStyle}
                                  onFocus={onCellFocus}
                                  onBlur={onCellBlur}
                                />
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
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

                {/* Payout breakdown — remittance is money owed BACK to the branch, shown
                    separately from the crew's own labor/add-on payout. */}
                  <div className="grid grid-cols-2 sm:grid-cols-4" style={{ backgroundColor: headerBg, borderTop: `1px solid ${border}` }}>
                    {footerTile('Total Remittance Collected', remittanceTotal(installerRows), remitAccent)}
                    {footerTile('Base Install Total', baseInstallTotal(installerRows), textPrimary)}
                    {footerTile('Total Add-on Pay', installerTotal(installerRows) - baseInstallTotal(installerRows), textPrimary)}
                    {footerTile('Net Payout Due', installerTotal(installerRows), '#10B981')}
                  </div>
              </div>
            )
          })}
        </div>
      ) : (
        // Roster / summary — one continuous ledger table covering the whole selected period (not
        // a single job). Remarks/Payroll Due/Audited/Status live here, not in an installer's own
        // per-job table. Click "View Payroll" to open that job-level table.
        <div className="rounded-b-2xl border overflow-hidden" style={{ borderColor: border, backgroundColor: cardBg }}>
          {/* Column header row */}
          <div
            className="hidden md:grid items-center px-6 md:px-7 py-3.5"
            style={{ gridTemplateColumns: 'minmax(240px, 2fr) 130px 170px 170px 220px', backgroundColor: isLight ? '#f8fafc' : '#0d1520', borderBottom: `1px solid ${border}` }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70" style={{ color: textMuted }}>Installer</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-center opacity-70" style={{ color: textMuted }}>Aircon Units</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-right opacity-70" style={{ color: textMuted }}>Payroll Amount</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-center opacity-70" style={{ color: textMuted }}>Action</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-center opacity-70" style={{ color: textMuted }}>Payroll Status</span>
          </div>

          {/* Data rows — hairline dividers, no per-row cards/shadows, just a row-hover tint */}
          {grouped.map(([installerName, installerRows], rowIndex) => {
            const total = installerTotal(installerRows)
            const isComplete = installerRows.length > 0 && installerRows.every(r => r.status === 'COMPLETE')
            const summaryRemarks = installerRows[0]?.remarks || ''
            const summaryAudited = installerRows[0]?.audited || ''
            return (
              <div
                key={installerName}
                className="grid items-center gap-x-4 gap-y-3 px-6 md:px-7 py-5 md:py-6 transition-colors"
                style={{
                  gridTemplateColumns: 'minmax(240px, 2fr) 130px 170px 170px 220px',
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

                    {/* 2. AIRCON UNITS */}
                    <div className="flex items-center justify-center">
                      <span className="text-lg md:text-xl font-bold tabular-nums tracking-tight" style={{ color: textPrimary }}>
                        {installedUnitsCount(installerRows)}
                      </span>
                    </div>

                    {/* 3. PAYROLL AMOUNT */}
                    <div className="flex items-center justify-end">
                      <span className="text-base md:text-lg font-bold tabular-nums text-right tracking-tight" style={{ color: '#10B981' }}>
                        ₱{peso(total)}
                      </span>
                    </div>

                    {/* 4. ACTION (VIEW PAYROLL) */}
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => setSelectedInstaller(installerName)}
                        className="group flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
                        style={{ color: '#10B981', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.14)' }}
                      >
                        <span>View Payroll</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>

                    {/* 5. STATUS (LAST COLUMN TO THE RIGHT) */}
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
                          onClick={() => {
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
                { label: 'Net Payout Due', value: grandTotal, color: '#10B981' },
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

      {columnManagerFor && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(8,12,20,0.60)' }}
          onClick={() => setColumnManagerFor(null)}
        >
          <div
            className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxWidth: 720, maxHeight: '82vh', backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" style={{ color: '#10B981' }} />
                <h2 className="text-sm font-extrabold" style={{ color: textPrimary }}>
                  Manage Columns — {displayInstallerName(columnManagerFor)}
                </h2>
              </div>
              <button type="button" onClick={() => setColumnManagerFor(null)} className="p-1.5 rounded-lg hover:bg-red-500/10">
                <X className="w-4 h-4" style={{ color: textMuted }} />
              </button>
            </div>

            {/* Select preset — swaps the whole visible set in one click */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: textMuted }}>Preset</span>
              {COLUMN_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyColumnPreset(preset.cats)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition-colors"
                  style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Columns — branch-defined extra fee columns added to every installer table.
                Values live in row.customFields[key]; no fixed PayrollRow field exists for them. */}
            <div className="flex flex-col gap-3 px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              {/* Section heading + live count badge */}
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: textMuted }}>Custom Columns</span>
                {customColumnDefs.length > 0 && (
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#10B981', color: 'white' }}
                  >
                    {customColumnDefs.length}
                  </span>
                )}
              </div>

              {/* Add-new input row */}
              <div className="flex items-center gap-2">
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  style={{ background: '#10B981' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Column
                </button>
              </div>

              {/* Custom columns list — proper table */}
              {customColumnDefs.length > 0 ? (
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                  <div
                    className="grid px-3 py-2 text-[10px] font-black uppercase tracking-wider"
                    style={{
                      gridTemplateColumns: '1fr auto auto',
                      backgroundColor: headerBg,
                      borderBottom: `1px solid ${border}`,
                      color: textMuted,
                    }}
                  >
                    <span>Column Name</span>
                    <span className="pr-2">Field Key</span>
                    <span className="text-center w-8">Del</span>
                  </div>
                  {customColumnDefs.map((cc, idx) => (
                    <div
                      key={cc.key}
                      className="grid items-center px-3 py-2.5 transition-colors hover:bg-emerald-500/5"
                      style={{
                        gridTemplateColumns: '1fr auto auto',
                        borderBottom: idx < customColumnDefs.length - 1 ? `1px solid ${border}` : 'none',
                        gap: '8px',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10B981' }} />
                        <span className="text-xs font-bold truncate" style={{ color: textPrimary }}>{cc.label}</span>
                      </div>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 truncate max-w-[120px]"
                        title={cc.key}
                        style={{ backgroundColor: isLight ? '#f1f5f9' : '#0d1520', color: textMuted }}
                      >
                        {cc.key}
                      </span>
                      <div className="flex justify-center w-8">
                        <button
                          type="button"
                          onClick={() => removeCustomColumn(cc.key)}
                          className="p-1.5 rounded-lg hover:bg-red-500/15 transition-colors"
                          title={`Delete "${cc.label}" from all installer tables`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="text-xs font-medium text-center py-3 rounded-xl border border-dashed"
                  style={{ color: textMuted, borderColor: border }}
                >
                  No custom columns yet — type a name above and click Add Column.
                </div>
              )}
            </div>

            {/* Search + bulk actions */}
            <div className="flex items-center gap-2 px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: textMuted }} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search columns..."
                  value={columnSearch}
                  onChange={e => setColumnSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>
              <button
                type="button"
                onClick={() => setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set() }))}
                className="px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap"
                style={{ color: '#10B981', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)' }}
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set(COLUMN_DEFS.filter(c => !c.pinned).map(c => c.key as ColumnKey)) }))}
                className="px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap"
                style={{ color: textMuted, backgroundColor: isLight ? '#f1f5f9' : '#0d1520' }}
              >
                Hide all
              </button>
            </div>

            {/* Categorized checklist */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
              {(() => {
                const hidden = hiddenColumnsFor(columnManagerFor)
                return (Object.keys(CATEGORY_META) as ColumnCategory[]).map(cat => {
                  const cols = COLUMN_DEFS.filter(c => c.category === cat && c.label.toLowerCase().includes(columnSearch.trim().toLowerCase()))
                  if (cols.length === 0) return null
                  const meta = CATEGORY_META[cat]
                  const visibleCount = cols.filter(c => !hidden.has(c.key as ColumnKey)).length
                  return (
                    <div key={cat} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                      <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: headerBg }}>
                        <div>
                          <div className="text-[11px] font-extrabold" style={{ color: textPrimary }}>{meta.label}</div>
                          <div className="text-[10px] font-medium" style={{ color: textMuted }}>{meta.blurb}</div>
                        </div>
                        <span className="text-[10px] font-bold shrink-0 ml-2" style={{ color: visibleCount > 0 ? '#10B981' : textMuted }}>
                          {visibleCount}/{cols.length}
                        </span>
                      </div>
                      <div>
                        {cols.map(col => (
                          <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold cursor-pointer" style={{ color: textPrimary }}>
                            <input type="checkbox" checked={!hidden.has(col.key as ColumnKey)} onChange={() => toggleColumn(col.key as ColumnKey)} />
                            {col.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-5 py-3 shrink-0" style={{ borderTop: `1px solid ${border}` }}>
              <button
                type="button"
                onClick={() => setColumnManagerFor(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: '#10B981' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <div className="text-xs font-bold leading-relaxed" style={{ color: textPrimary }}>
                    {item.label}
                  </div>
                  <div className="text-[10px] font-medium flex items-center flex-wrap gap-x-1.5 gap-y-1 mt-1" style={{ color: textMuted }}>
                    <span>Head Office default: ₱{item.defaultRate.toLocaleString('en-PH')}</span>
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
                    title="Reset to Head Office default"
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
                      Install and General Cleaning fees auto-fill on sync based on capacity. Everything else uses the Head Office default until you set your own.
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
                                      <div className="text-xs font-bold leading-relaxed" style={{ color: textPrimary }}>
                                        {item.label}
                                      </div>
                                      <div className="text-[10px] font-medium flex items-center flex-wrap gap-x-1.5 gap-y-1 mt-1" style={{ color: textMuted }}>
                                        <span>Head Office default: ₱{item.defaultVal.toLocaleString('en-PH')}</span>
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
                                        title="Reset to Head Office default"
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
                      title="Reset all branch rates to Head Office defaults"
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
