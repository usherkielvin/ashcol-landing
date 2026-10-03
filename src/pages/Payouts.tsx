import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom'
import { NumericFormat } from 'react-number-format'
import {
  Search, Building2, Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  SlidersHorizontal, Plus, X, RotateCcw, RefreshCw, Save, Loader2, EyeOff, Trash2,
  Stethoscope, Lightbulb, HardHat, PiggyBank, Wind, Recycle, ArrowBigDownDash, Snowflake,
  Users, Receipt, ArrowRightLeft, ExternalLink, Lock, Unlock, FileSpreadsheet,
  Archive, PauseCircle, Send, Undo2, MoreVertical, Maximize2, Copy, Clock,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { fetchCachedEmployees, readSavedBranches } from '../utils/portalDirectoryCache'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin, isPayrollMember, resolvePortalWriteBranchId, isFranchiseBranch, formatPersonName, fetchTicketByNumber } from '../utils/api'
import {
  branchWeekCycle,
  weeksOfMonth,
  weekContaining,
  prevMonth,
  nextMonth,
  formatMonth,
  todayYMD,
  type PayrollWeek,
} from '../utils/payrollWeeks'
import AdjustBalanceModal from './Payouts/AdjustBalanceModal'
import CorrectionHistoryModal from './Payouts/CorrectionHistoryModal'
import HoldModal from './Payouts/HoldModal'
import CompletePayoutModal from './Payouts/CompletePayoutModal'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import WeekSummaryModal from '../components/WeekSummaryModal'
import { TicketDetailsModal } from '../components/tickets/TicketDetailsModal'
import type { Ticket } from '../utils/ticketTypes'
import {
  fetchAndMapPayroll,
  deduplicateAndMergePayroll,
  DEFAULT_PAYROLL_RATES,
  STANDARD_RATE_TABLE,
  MANUAL_FEE_PREFIX,
  mapSavedPayrollEntry,
  rowTotal,
  installerTotal,
  installerNet,
  deductionTotal,
  deductionValue,
  lateDeduction,
  rawDeduction,
  LATE_RATE_PER_MINUTE,
  UNIFORM_PRICE_PER_PC,
  DEDUCTION_PREFIX,
  BALANCE_DEDUCTION_KEYS,
  HOLD_PREFIX,
  TEXT_FIELD_PREFIX,
  PAY_PREFIX,
  PAYMENT_STATUS_OPTIONS,
  payFactor,
  paymentStatusOf,
  paymentStatusLabel,
  hasPendingBalance,
  parseAdjustmentLog,
  type AdjustmentLogEntry,
  customFieldsForSave,
  isHeldRow,
  isCarryOver,
  isActivePayRow,
  type DeductionKey,
  type AutoStampedFee,
  type PayrollRow,
  type PayrollRates,
} from '../utils/payrollDerive'
import { num, peso, pesoSigned, shortDate, longDate, getInitials, titleCase, avatarColor, rowAddOns, completedJobsCount, completedJobsBreakdown, remittanceTotal, baseInstallTotal, type ColumnKey, type ColumnCategory, CATEGORY_META, type ColumnDef, COLUMN_DEFS, ROSTER_GRID_TEMPLATE, COLUMN_PRESETS, DEFAULT_HIDDEN_COLUMNS, HIDDEN_COLUMNS_KEY, COLUMN_WIDTHS_KEY, CUSTOM_COLUMNS_KEY, PAYROLL_BRANCH_KEY, PAYROLL_WEEK_KEY, PAYROLL_LAST_SELECTION_KEY, MIN_COLUMN_WIDTH, normalizeSlug, compactSlug, type PayrollWeekClosure, getSavedPayrollSelection, LIST_PINNED_KEYS, LIST_CELL_FONT, LIST_CELL_BOLD_FONT, LIST_HEAD_FONT, LIST_HEAD_TRACKING, measureText, DEFAULT_COLUMN_WIDTHS, type CustomColumnDef } from './Payouts/payoutUtils';

export default function Payouts() {
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
  // Everyone else on staff (branch OIC, office members, installers) gets a read-only view of their
  // own branch: only payouts payroll has marked COMPLETED, no syncing, no editing, no remittance.
  // The backend enforces the same scope — see PayrollService.getEntriesFor.
  const viewOnly = !canManagePayroll
  const canManageClosures = canManagePayroll && (isPortalAdmin(role) || role === 'manager')

  const userFirstName = useMemo(() => {
    const raw = (user as any)?.firstName || user?.name || (user as any)?.username || 'ADMIN'
    return String(raw).trim().split(/\s+/)[0].toUpperCase()
  }, [user])
  // Full logged-in user name — recorded on hold/release actions (see docs/payroll-hold-release-plan.md).
  const userDisplayName = useMemo(() => {
    const raw = user?.name || (user as any)?.fullName || (user as any)?.firstName || (user?.email ? user.email.split('@')[0] : 'ADMIN')
    return formatPersonName(String(raw).trim()) || 'Admin'
  }, [user])

  const [rows, setRows] = useState<PayrollRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  // The saved sheet is on screen but the first sync with Schedules is still running behind it: the list is locked
  // (read-only) until that finishes, so nothing can be edited against rows the sync is about to merge into.
  const [earlyView, setEarlyView] = useState(false)
  const loadRequest = useRef(0)
  const monthCache = useRef<Record<string, { rows: PayrollRow[]; fetchedAt: number }>>({})
  // True when the last pull from Schedules failed — the table is then only showing previously
  // saved rows, which can stop partway through the period.
  const [syncFailed, setSyncFailed] = useState(false)
  // Header shows no save-status indicator per the simplified toolbar — the setter still
  // drives autosave logic below, the value itself just isn't rendered anywhere right now.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')

  const [branches, setBranches] = useState<{ id: string; name: string; payrollRates?: string | null }[]>([])
  const [branchFilter, setBranchFilter] = useState(() => {
    if (canManagePayroll) {
      const savedPayrollBranch = localStorage.getItem(PAYROLL_BRANCH_KEY)
      if (savedPayrollBranch) return savedPayrollBranch
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      if (activeBranch && activeBranch !== 'ALL_BRANCHES') return activeBranch
      return 'BR-TAGUIG-SALES'
    }
    return resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle) || user?.branchId || 'BR-TAGUIG-SALES'
  })
  useEffect(() => {
    if (canManagePayroll && branchFilter) localStorage.setItem(PAYROLL_BRANCH_KEY, branchFilter)
  }, [canManagePayroll, branchFilter])

  const { branchSlug, installerSlug } = useParams<{ branchSlug?: string; installerSlug?: string }>()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const installerFromUrl = searchParams.get('installer') || searchParams.get('member')

  // null = the roster (list of installers); a name = that installer's own table.
  const [selectedInstaller, setSelectedInstaller] = useState<string | null>(installerFromUrl || null)

  // Seamlessly redirect legacy /payroll paths to clean /payouts URLs
  useEffect(() => {
    if (location.pathname.startsWith('/payroll')) {
      const newPath = location.pathname.replace(/^\/payroll/, '/payouts')
      navigate(newPath + location.search, { replace: true })
    }
  }, [location.pathname, location.search, navigate])

  // Sync active branch with branchSlug in URL (e.g. /payouts/taguig-sales or /payouts/taguigsales)
  useEffect(() => {
    if (viewOnly || !branchSlug || branches.length === 0) return
    const clean = normalizeSlug(branchSlug)
    const compact = compactSlug(branchSlug)
    const matched = branches.find(b =>
      normalizeSlug(b.id) === clean ||
      compactSlug(b.id) === compact ||
      normalizeSlug(b.name) === clean ||
      compactSlug(b.name) === compact
    )
    if (matched && matched.id !== branchFilter) {
      setBranchFilter(matched.id)
    }
  }, [branchSlug, branches, branchFilter, viewOnly])

  // Sync selected installer from URL path slug or fallback searchParams
  useEffect(() => {
    if (installerSlug) {
      const clean = normalizeSlug(installerSlug)
      const compact = compactSlug(installerSlug)
      // Only installers who actually have rows in the viewed week can be re-selected from the URL —
      // otherwise this fights the "fall back to the roster" effect below (e.g. right after an
      // adjustment/hold is undone and the installer has nothing left in the week) and the page blinks.
      const allNames = Array.from(new Set(rows.filter(r => rowInActiveWindow(r)).map(r => resolveGroupKey(r.installerName)).filter(Boolean)))
      // 1. Exact slug match (e.g. "allan-bellen" or "allanbellen")
      let matched = allNames.find(n => normalizeSlug(n) === clean || compactSlug(n) === compact)
      // 2. Prefix / first name match (e.g. "allan" matches "ALLAN BELLEN")
      if (!matched) {
        matched = allNames.find(n => {
          const nClean = normalizeSlug(n)
          const nCompact = compactSlug(n)
          return nClean.split('-')[0] === clean || nClean.startsWith(clean + '-') || nCompact.startsWith(compact)
        })
      }
      // 3. Fallback: resolve clean slug via installer aliases (e.g. "justine" -> "JUSTIN ROI BIEN")
      if (!matched) {
        const resolved = resolveGroupKey(clean)
        matched = allNames.find(n => n === resolved || normalizeSlug(n) === normalizeSlug(resolved))
      }
      if (matched) {
        if (matched !== selectedInstaller) {
          setSelectedInstaller(matched)
        }
        return
      }
    }

    // Fallback: searchParams (?installer=... or ?member=...)
    const urlInstaller = searchParams.get('installer') || searchParams.get('member')
    if (urlInstaller && urlInstaller !== selectedInstaller) {
      setSelectedInstaller(urlInstaller)
    } else if (!installerSlug && !urlInstaller && selectedInstaller) {
      setSelectedInstaller(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installerSlug, searchParams, rows, selectedInstaller])

  const handleSelectInstaller = useCallback((name: string | null) => {
    setSelectedInstaller(name)
    const currentBranch = branches.find(b => b.id === branchFilter)
    const bSlug = currentBranch ? normalizeSlug(currentBranch.name) : (branchFilter ? normalizeSlug(branchFilter) : '')
    if (name) {
      const iSlug = normalizeSlug(name)
      const targetPath = bSlug ? `/payouts/${bSlug}/${iSlug}` : `/payouts/all/${iSlug}`
      navigate(targetPath, { replace: false })
    } else {
      const targetPath = bSlug ? `/payouts/${bSlug}` : '/payouts'
      navigate(targetPath, { replace: false })
    }
  }, [branches, branchFilter, navigate])
  // The job row whose full fee breakdown is open in the popup (desktop list view).
  const [detailRow, setDetailRow] = useState<PayrollRow | null>(null)
  // Active cell being edited inline in the desktop table (null = none).
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null)
  const lastCellTapRef = useRef<{ rowId: string; colKey: string; time: number } | null>(null)
  // Which installer's Deductions modal is open (null = closed).
  const [deductionsModalInstaller, setDeductionsModalInstaller] = useState<string | null>(null)
  // Hold & release (carry-over to a later week) — see docs/payroll-hold-release-plan.md.
  const [holdModalRow, setHoldModalRow] = useState<PayrollRow | null>(null)
  const [holdSubmitting, setHoldSubmitting] = useState(false)
  const [heldTicketsOpen, setHeldTicketsOpen] = useState(false)
  const [heldTicketsLoading, setHeldTicketsLoading] = useState(false)
  const [heldTickets, setHeldTickets] = useState<{ row: PayrollRow; month: string }[]>([])
  const [heldInstallerFilter, setHeldInstallerFilter] = useState('')
  const [heldSearch, setHeldSearch] = useState('')
  const [releaseFor, setReleaseFor] = useState<{ row: PayrollRow; month: string; kind?: 'balance' } | null>(null)
  // Unpaid-ticket 50% balances still owed (see payFactor) — shown in the Held Tickets modal.
  const [balanceTickets, setBalanceTickets] = useState<{ row: PayrollRow; month: string }[]>([])
  const [releaseTargetWeek, setReleaseTargetWeek] = useState<PayrollWeek | null>(null)
  const [releaseApprovalNote, setReleaseApprovalNote] = useState('')
  const [releaseSubmitting, setReleaseSubmitting] = useState(false)
  const [undoingRowKey, setUndoingRowKey] = useState<string | null>(null)
  // Balance adjustment on a closed week's ticket + its correction history.
  const [adjustRow, setAdjustRow] = useState<{ row: PayrollRow; month: string } | null>(null)
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)
  const [correctionsOpen, setCorrectionsOpen] = useState(false)
  // What the Correction History search box starts with (a ticket number when opened from that ticket).
  const [correctionsSearch, setCorrectionsSearch] = useState('')
  const [corrections, setCorrections] = useState<{ row: PayrollRow; month: string }[]>([])
  const [selectedTicketForModal, setSelectedTicketForModal] = useState<Ticket | null>(null)
  const [loadingTicketModal, setLoadingTicketModal] = useState(false)

  const handleOpenTicketModal = async (row: PayrollRow) => {
    const tn = (row.ticketNumber || row.ticketId || '').trim()
    if (!tn) return

    setLoadingTicketModal(true)
    try {
      const token = getToken()
      let ticketData: Ticket | null = null
      if (row.ticketNumber) {
        ticketData = await fetchTicketByNumber(token, row.ticketNumber) as Ticket | null
      }
      if (!ticketData && row.ticketId) {
        const res = await fetch(`${API_BASE_URL}/tickets/${encodeURIComponent(row.ticketId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const json = await res.json()
          ticketData = json?.data?.ticket || json?.data || json?.ticket || json
        }
      }

      if (ticketData) {
        setSelectedTicketForModal(ticketData)
      } else {
        setSelectedTicketForModal({
          id: row.ticketId || tn,
          ticketNumber: tn,
          customerName: row.customerName || 'Customer',
          location: { address: row.cityAddress || '' },
          installerName: row.installerName || '',
          unitType: row.brandCapacity || '',
          status: row.installationUpload || 'DONE',
          branchId: branchFilter,
          remarks: row.remarks || '',
        } as unknown as Ticket)
      }
    } catch (err) {
      console.warn('Failed to load ticket details:', err)
      setSelectedTicketForModal({
        id: row.ticketId || tn,
        ticketNumber: tn,
        customerName: row.customerName || 'Customer',
        location: { address: row.cityAddress || '' },
        installerName: row.installerName || '',
        unitType: row.brandCapacity || '',
        status: row.installationUpload || 'DONE',
        branchId: branchFilter,
        remarks: row.remarks || '',
      } as unknown as Ticket)
    } finally {
      setLoadingTicketModal(false)
    }
  }
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
  // Inline-edited Remarks cell in the roster table — which installer (null = none) and its draft text.
  const [editingRemarksFor, setEditingRemarksFor] = useState<string | null>(null)
  const [remarksDraft, setRemarksDraft] = useState('')
  // Showcase full-view modal state
  const [showcaseOpen, setShowcaseOpen] = useState(false)
  const [showcaseCopying, setShowcaseCopying] = useState(false)
  const [showcasePdfing, setShowcasePdfing] = useState(false)
  const showcaseRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!showcaseOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowcaseOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showcaseOpen])

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // '' = all installers. Narrows the roster list to one technician, independent of the free-text
  // search box above — the dropdown's own options always list the branch's full roster.
  const [technicianFilter, setTechnicianFilter] = useState('')

  // Track the previous branch to distinguish between initial mount / branch list loading
  // vs. an actual user-initiated branch change.
  const lastBranchRef = useRef<string>(branchFilter)

  // Week picker state — drives dateFrom/dateTo for all downstream filtering and saving.
  // Persisted in localStorage so reloading the page permanently preserves the selected
  // month and week until the user explicitly changes them.
  const [activeMonth, setActiveMonth] = useState<string>(() => {
    const saved = getSavedPayrollSelection(branchFilter)
    if (saved?.month) return saved.month

    const c = branchWeekCycle(branchFilter)
    return weekContaining(todayYMD(), c).owningMonth
  })

  const [activeWeek, setActiveWeek] = useState<PayrollWeek | null>(() => {
    const saved = getSavedPayrollSelection(branchFilter)
    const c = branchWeekCycle(branchFilter)
    const m = saved?.month || weekContaining(todayYMD(), c).owningMonth
    const weeks = weeksOfMonth(m, c)
    if (saved?.weekFrom && saved?.weekTo) {
      const match = weeks.find(w => w.from === saved.weekFrom && w.to === saved.weekTo)
      if (match) return match
    }
    const today = todayYMD()
    const todaySlot = weeks.find(w => w.from <= today && today <= w.to)
    return todaySlot ?? weeks[weeks.length - 1] ?? null
  })
  // Derived date range — stays YYYY-MM-DD and feeds the same downstream logic unchanged.
  const dateFrom = activeWeek?.from ?? ''
  const dateTo   = activeWeek?.to   ?? ''

  // Week closure / locking state (Phase 2 backend integration)
  const [closures, setClosures] = useState<PayrollWeekClosure[]>([])
  const [closingWeek, setClosingWeek] = useState(false)
  const [reopeningWeek, setReopeningWeek] = useState(false)

  const activeWeekClosure = useMemo(() => {
    if (!activeWeek || !branchFilter) return null
    return closures.find(c => c.branchId === branchFilter && c.weekFrom === activeWeek.from && c.weekTo === activeWeek.to) || null
  }, [closures, branchFilter, activeWeek])

  const isWeekClosed = Boolean(activeWeekClosure)

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
  const [weekSummaryOpen, setWeekSummaryOpen] = useState(false)
  // Mobile toolbar: every filter (branch/period/technician/search) plus the overflow actions
  // collapse into a small icon that opens one of these popovers — only one open at a time,
  // all sharing one outside-click-to-close handler — so the header stays a single tidy row
  // instead of a wall of text pills (desktop keeps the full inline controls, untouched).
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [mobilePopover, setMobilePopover] = useState<'branch' | 'period' | 'technician' | 'search' | 'more' | null>(null)
  const mobileToolbarRef = useRef<HTMLDivElement | null>(null)
  const toggleMobilePopover = (key: 'branch' | 'period' | 'technician' | 'search' | 'more') =>
    setMobilePopover(p => (p === key ? null : key))
  useEffect(() => {
    if (!mobilePopover) return
    const onPointerDown = (e: MouseEvent) => {
      if (mobileToolbarRef.current && !mobileToolbarRef.current.contains(e.target as Node)) {
        setMobilePopover(null)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [mobilePopover])
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
  const [hiddenColumnsByInstaller, setHiddenColumnsByInstaller] = useState<Record<string, Set<string>>>(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_COLUMNS_KEY)
      if (!raw) return {}
      const obj = JSON.parse(raw) as Record<string, string[]>
      const result: Record<string, Set<string>> = {}
      for (const [name, arr] of Object.entries(obj)) {
        result[name] = new Set(arr)
      }
      return result
    } catch {
      return {}
    }
  })
  useEffect(() => {
    const serializable: Record<string, string[]> = {}
    for (const [name, set] of Object.entries(hiddenColumnsByInstaller)) serializable[name] = Array.from(set)
    localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(serializable))
  }, [hiddenColumnsByInstaller])
  const hiddenColumnsFor = (installerName: string): Set<string> =>
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
      const saved: CustomColumnDef[] = raw ? JSON.parse(raw) : []
      return saved.filter(c => !/^(ded:|xfer:|manual:|hold:|txt:|pay:)/.test(c.key))
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
  // Schedule tickets only ever carry an installer's first name/nickname (see
  // cleanInstallerName in schedulePrefill.ts — that's what payrollDerive.ts groups rows by),
  // so the payroll page has to resolve that short form back to the real technician account.
  // Fetches every employee/technician to map names back to their full account names.
  const [branchTechnicians, setBranchTechnicians] = useState<{ id: string; name: string; nickname: string; jobTitle: string; inHouse: boolean; branchId?: string }[]>([])
  useEffect(() => {
    let cancelled = false
    const loadUsers = async () => {
      try {
        let list: any[] | null = null
        try {
          list = await fetchCachedEmployees(getToken())
        } catch {
          try {
            list = await fetchCachedEmployees(getToken(), 'EMPLOYEE')
          } catch {
            list = null
          }
        }
        if (list) {
          if (cancelled) return
          const mapped = list
            .filter(u => u && u.name)
            .map(u => ({
              id: u.id,
              name: String(u.name || '').trim(),
              nickname: String(u.nickname || '').trim(),
              jobTitle: u.jobTitle || '',
              inHouse: !!u.inHouse,
              branchId: u.branchId || '',
            }))
          setBranchTechnicians(mapped)
        }
      } catch {}
    }
    loadUsers()
    return () => { cancelled = true }
  }, [branchFilter])

  // In-house (salaried) technicians are paid a fixed wage, not per job — their completed jobs
  // shouldn't show up on this pakyaw/contract payroll sheet at all. Keyed by resolved real name
  // (same identity the roster groups rows by), so it applies regardless of which alias/nickname
  // a given ticket happened to use.
  const inHouseTechnicianNames = useMemo(() => {
    const set = new Set<string>()
    for (const t of branchTechnicians) {
      if (t.inHouse && t.name) {
        set.add(t.name.trim().toUpperCase())
        if (t.nickname) set.add(t.nickname.trim().toUpperCase())
      }
    }
    return set
  }, [branchTechnicians])

  // Exact aliases and word lookups to resolve ticket nicknames or first names to full account names.
  const installerAliases = useMemo(() => {
    const map: Record<string, string> = {}
    
    // Sort so technicians in the active branch have highest priority on name collision
    const sorted = [...branchTechnicians].sort((a, b) => {
      const aMatch = branchFilter && a.branchId === branchFilter ? 1 : 0
      const bMatch = branchFilter && b.branchId === branchFilter ? 1 : 0
      return bMatch - aMatch
    })

    for (const t of sorted) {
      const fullName = t.name.trim()
      if (!fullName) continue
      const fullUpper = fullName.toUpperCase()

      // Exact full name maps to full name
      if (!map[fullUpper]) map[fullUpper] = fullUpper

      // Exact nickname maps to full name
      if (t.nickname) {
        const nickUpper = t.nickname.trim().toUpperCase()
        if (nickUpper && !map[nickUpper]) map[nickUpper] = fullUpper
      }

      // Every word in their full name (e.g. "JHON", "MARIANO", "PRIZA")
      for (const word of fullName.split(/[\s-]+/)) {
        const key = word.trim().toUpperCase()
        if (key && key.length >= 2 && !map[key]) {
          map[key] = fullUpper
        }
      }
    }

    // Specific technician aliases / spelling normalization:
    // In Taguig Services, Justin Roi Bien is frequently entered as "JUSTINE", "JUSTINE ROI", or "JUSTIN ROI"
    const justinAccount = sorted.find(t => {
      const u = (t.name || '').trim().toUpperCase()
      return u.includes('JUSTIN') && (u.includes('ROI') || u.includes('BIEN'))
    })
    const justinTarget = justinAccount?.name?.trim().toUpperCase() || 'JUSTIN ROI BIEN'
    map['JUSTINE'] = justinTarget
    map['JUSTINE ROI'] = justinTarget
    map['JUSTINE BIEN'] = justinTarget
    map['JUSTINE ROI BIEN'] = justinTarget
    map['JUSTIN ROI'] = justinTarget
    map['JUSTIN'] = justinTarget

    return map
  }, [branchTechnicians, branchFilter])

  // Fuzzy fallback for shortened-but-related nicknames ("CRIS" for "CRISANTO") that aren't
  // worth a manual nickname entry.
  const resolvePrefixAlias = (word: string): string | null => {
    if (word.length < 3) return null
    const wUpper = word.toUpperCase()

    // Explicit override for Justine -> Justin Roi Bien
    if (wUpper === 'JUSTINE' || wUpper.startsWith('JUSTINE')) {
      const justin = branchTechnicians.find(t => {
        const u = (t.name || '').trim().toUpperCase()
        return u.includes('JUSTIN') && (u.includes('ROI') || u.includes('BIEN'))
      })
      return justin?.name?.trim().toUpperCase() || 'JUSTIN ROI BIEN'
    }

    const sorted = [...branchTechnicians].sort((a, b) => {
      const aMatch = branchFilter && a.branchId === branchFilter ? 1 : 0
      const bMatch = branchFilter && b.branchId === branchFilter ? 1 : 0
      return bMatch - aMatch
    })

    for (const t of sorted) {
      const fullUpper = (t.name || '').trim().toUpperCase()
      if (!fullUpper) continue
      if (fullUpper.startsWith(wUpper)) return fullUpper
      for (const real of fullUpper.split(/[\s-]+/)) {
        if (real.length >= word.length && real.startsWith(wUpper)) return fullUpper
      }
    }
    return null
  }

  /** The one true name-resolution function — resolves ticket short names back to full account name. */
  const resolveInstallerIdentity = (raw: string): string => {
    const trimmed = raw.trim()
    if (!trimmed) return trimmed
    const upper = trimmed.toUpperCase()

    // 1. Direct alias or whole-string match in dictionary
    const whole = installerAliases[upper]
    if (whole) return whole.toUpperCase()

    // 2. Direct exact match against any user account
    for (const t of branchTechnicians) {
      const tName = (t.name || '').trim().toUpperCase()
      const tNick = (t.nickname || '').trim().toUpperCase()
      if (tName === upper || (tNick && tNick === upper)) return tName
    }

    // 3. Match each segment or fuzzy prefix
    for (const word of trimmed.split(/[\s-]+/)) {
      const wUpper = word.toUpperCase()
      const exact = installerAliases[wUpper]
      if (exact) return exact.toUpperCase()
      const fuzzy = resolvePrefixAlias(word)
      if (fuzzy) return fuzzy.toUpperCase()
    }

    return upper
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

  // ---------------------------------------------------------------------------
  // Payroll week cycle — derived from the selected branch’s name/id.
  // ---------------------------------------------------------------------------
  const cycle = useMemo(() => {
    const branch = branches.find(b => b.id === branchFilter)
    // Use name first (more readable); fall back to raw id (works even before branch list loads
    // because branch IDs like BR-TAGUIG-SALES contain the keyword directly).
    return branchWeekCycle(branch?.name || branchFilter || '')
  }, [branchFilter, branches])

  // All 7-day weeks whose end date falls in activeMonth for this branch’s cycle.
  const branchWeeks = useMemo(() => weeksOfMonth(activeMonth, cycle), [activeMonth, cycle])

  // When the branch changes, restore the saved selection for that branch or jump to today.
  // We check lastBranchRef to avoid resetting on initial mount or when the branches list loads.
  useEffect(() => {
    if (!branchFilter) return
    if (lastBranchRef.current === branchFilter) return
    lastBranchRef.current = branchFilter
    monthCache.current = {}

    const branch = branches.find(b => b.id === branchFilter)
    const c = branchWeekCycle(branch?.name || branchFilter || '')
    const saved = getSavedPayrollSelection(branchFilter)

    if (saved) {
      setActiveMonth(saved.month)
      const weeks = weeksOfMonth(saved.month, c)
      const match = weeks.find(w => w.from === saved.weekFrom && w.to === saved.weekTo)
      if (match) {
        setActiveWeek(match)
        return
      }
    }

    const todayWeek = weekContaining(todayYMD(), c)
    setActiveMonth(todayWeek.owningMonth)
    const weeks = weeksOfMonth(todayWeek.owningMonth, c)
    const today = todayYMD()
    const todaySlot = weeks.find(w => w.from <= today && today <= w.to)
    setActiveWeek(todaySlot ?? weeks[weeks.length - 1] ?? null)
  }, [branchFilter, branches])

  // Whenever the week list for the active month changes, auto-select:
  //   • the current selection if it still exists in this month's list, OR
  //   • the saved week for this branch if it matches activeMonth, OR
  //   • the week that contains today, if today falls in this month, OR
  //   • the last week of the month (for past/future month navigation).
  useEffect(() => {
    if (branchWeeks.length === 0) return
    setActiveWeek(prev => {
      // Don’t disturb an explicit user choice that still exists in this month’s list.
      if (prev && branchWeeks.some(w => w.from === prev.from && w.to === prev.to)) return prev

      const saved = getSavedPayrollSelection(branchFilter)
      if (saved && saved.month === activeMonth) {
        const match = branchWeeks.find(w => w.from === saved.weekFrom && w.to === saved.weekTo)
        if (match) return match
      }

      const today = todayYMD()
      const todaySlot = branchWeeks.find(w => w.from <= today && today <= w.to)
      return todaySlot ?? branchWeeks[branchWeeks.length - 1] ?? null
    })
  }, [branchWeeks, branchFilter, activeMonth])

  // Persist week and month selection to localStorage whenever user changes them
  useEffect(() => {
    if (!branchFilter || !activeWeek || !activeMonth) return
    // Guard against saving when branchFilter has just changed but activeWeek hasn't updated yet
    if (lastBranchRef.current !== branchFilter) return
    // Guard against temporary mismatch while navigating between months
    if (activeWeek.owningMonth && activeWeek.owningMonth !== activeMonth) return

    const payload = JSON.stringify({
      month: activeMonth,
      weekFrom: activeWeek.from,
      weekTo: activeWeek.to,
      weekNumber: activeWeek.weekNumber,
      label: activeWeek.label,
    })
    try {
      localStorage.setItem(PAYROLL_WEEK_KEY(branchFilter), payload)
      localStorage.setItem(PAYROLL_LAST_SELECTION_KEY, payload)
    } catch (e) {
      console.error('Failed to persist payroll week selection:', e)
    }
  }, [branchFilter, activeMonth, activeWeek])

  const getToken = () =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  const fetchClosures = useCallback(async () => {
    if (!branchFilter) {
      setClosures([])
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/v1/payroll/closures?branchId=${encodeURIComponent(branchFilter)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (res.ok) {
        const list = await res.json()
        setClosures(Array.isArray(list) ? list : [])
      }
    } catch (e) {
      console.error('Failed to fetch payroll week closures:', e)
    }
  }, [branchFilter])

  useEffect(() => {
    void fetchClosures()
  }, [fetchClosures])

  const handleCloseWeek = () => {
    if (!activeWeek || !branchFilter || !canManageClosures) return
    setConfirmDialog({
      title: 'Close & Lock Payroll Week',
      message: `Are you sure you want to close Week ${activeWeek.weekNumber} (${activeWeek.label})?`,
      detail: 'Once closed, this payroll week will be locked. No further job synchronizations, manual additions, or edits can be made until the week is reopened by an administrator.',
      confirmText: 'Close & Lock Week',
      cancelText: 'Cancel',
      variant: 'discard',
      onConfirm: async () => {
        setClosingWeek(true)
        try {
          const res = await fetch(`${API_BASE_URL}/v1/payroll/closures`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${getToken()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              branchId: branchFilter,
              weekFrom: activeWeek.from,
              weekTo: activeWeek.to,
            }),
          })
          if (res.ok) {
            await fetchClosures()
          } else {
            const err = await res.json().catch(() => ({}))
            alert(err.message || err.error || 'Failed to close payroll week.')
          }
        } catch (e) {
          console.error('Failed to close week:', e)
        } finally {
          setClosingWeek(false)
        }
      },
    })
  }

  const handleReopenWeek = () => {
    if (!activeWeek || !branchFilter || !canManageClosures) return
    setConfirmDialog({
      title: 'Reopen Payroll Week',
      message: `Are you sure you want to reopen Week ${activeWeek.weekNumber} (${activeWeek.label})?`,
      detail: 'This will unlock the payroll week, allowing new job orders to be synced and existing entries to be edited.',
      confirmText: 'Reopen Week',
      cancelText: 'Keep Locked',
      variant: 'info',
      onConfirm: async () => {
        setReopeningWeek(true)
        try {
          const params = new URLSearchParams({
            branchId: branchFilter,
            weekFrom: activeWeek.from,
            weekTo: activeWeek.to,
          })
          const res = await fetch(`${API_BASE_URL}/v1/payroll/closures?${params.toString()}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${getToken()}`,
            },
          })
          if (res.ok) {
            await fetchClosures()
          } else {
            const err = await res.json().catch(() => ({}))
            alert(err.message || err.error || 'Failed to reopen payroll week.')
          }
        } catch (e) {
          console.error('Failed to reopen week:', e)
        } finally {
          setReopeningWeek(false)
        }
      },
    })
  }

  const handleSearchChange = (value: string) => {
    setRawSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 200)
  }

  // Row -> backend entry payload shape, shared by the debounced full-month save below and
  // mutateSavedMonth (hold/release/undo — see docs/payroll-hold-release-plan.md).
  const buildPayrollEntries = (data: PayrollRow[]) => data.map((r, idx) => ({
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
    materialsReturn: r.materialsReturn || null,
    installationChecklist: r.installationChecklist || null,
    videoUpload: r.videoUpload || null,
    remarks: r.remarks || null,
    audited: r.audited || null,
    status: r.status || 'PENDING',
    customFields: (() => {
      const cf = customFieldsForSave(r)
      return Object.keys(cf).length > 0 ? JSON.stringify(cf) : null
    })(),
  }))

  // Core background save routine
  const savePayrollToBackend = useCallback(async (data: PayrollRow[], bId: string, mKey: string): Promise<boolean> => {
    if (!bId || !mKey) return false
    // Guard against saving a locked week
    if (activeWeek && closures.some(c => c.branchId === bId && c.weekFrom === activeWeek.from && c.weekTo === activeWeek.to)) {
      return false
    }
    setSaveStatus('saving')
    try {
      const res = await fetch(`${API_BASE_URL}/v1/payroll`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: bId, periodMonth: mKey, entries: buildPayrollEntries(data) }),
      })
      if (res.ok) {
        setSaveStatus('saved')
      // Keep cache in sync: the saved data is now the ground truth for this month
        monthCache.current[`${bId}:${mKey}`] = { rows: data, fetchedAt: Date.now() }
        return true
      } else if (res.status === 423) {
        setSaveStatus('error')
        console.warn('Cannot save payroll: this week is closed/locked.')
      } else {
        setSaveStatus('error')
      }
    } catch (e) {
      console.error('Failed to auto-save payroll:', e)
      setSaveStatus('error')
    }
    return false
  }, [activeWeek, closures])

  // Fetches exactly one branch+month's saved rows, applies `mutate`, and PUTs the result back —
  // used by hold/release/undo so they never touch a month that isn't already loaded into `rows`
  // (a debounced full-month save racing a partial month would overwrite it with just the mutation).
  const mutateSavedMonth = useCallback(async (
    bId: string,
    monthKey: string,
    mutate: (rowsIn: PayrollRow[]) => PayrollRow[],
    // The backend answers a save that touched a locked (closed-week) row with 200 but silently
    // drops it. When given, this must find proof of the write in the saved entries the PUT returns.
    expect?: string,
  ): Promise<boolean> => {
    if (!bId || !monthKey) return false
    try {
      const params = new URLSearchParams({ branchId: bId, month: monthKey })
      const getRes = await fetch(`${API_BASE_URL}/v1/payroll?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      // A failed GET must never fall through to an empty/partial list — that would PUT a wiped
      // month back (this is a full-month replace endpoint). Bail out instead of risking data loss.
      if (!getRes.ok) return false
      const list = await getRes.json()
      const monthRows: PayrollRow[] = (Array.isArray(list) ? list : []).map(mapSavedPayrollEntry)
      const mutated = mutate(monthRows)
      const putRes = await fetch(`${API_BASE_URL}/v1/payroll`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: bId, periodMonth: monthKey, entries: buildPayrollEntries(mutated) }),
      })
      if (!putRes.ok) return false
      if (expect) {
        const saved = await putRes.json().catch(() => null)
        return JSON.stringify(saved ?? '').includes(expect)
      }
      return true
    } catch (e) {
      console.error('Failed to mutate saved payroll month:', e)
      return false
    }
  }, [])

  // Backend PUTs regenerate every row's id on each save (a full month replace, not a per-row
  // upsert — see PayrollService.replaceEntries) so an id captured from an earlier fetch can't be
  // trusted against a fresh one. Match by business identity instead: ticketId is a stable ticket
  // reference; hand-added rows fall back to ticketNumber+installer+workDate.
  const rowMatchKey = (r: PayrollRow): string =>
    r.ticketId
      ? `tk:${r.ticketId}|${r.installerName.trim().toLowerCase()}`
      : `nt:${(r.ticketNumber || '').trim().toLowerCase()}|${r.installerName.trim().toLowerCase()}|${r.workDate || ''}`

  // A carry-over copy keeps its origin's ticketNumber/installerName/workDate (and its
  // hold:originTicketId), so this reproduces the ORIGINAL row's own rowMatchKey from the copy.
  const originMatchKeyOf = (copy: PayrollRow): string => {
    const origTicketId = copy.customFields?.['hold:originTicketId']
    return origTicketId
      ? `tk:${origTicketId}|${copy.installerName.trim().toLowerCase()}`
      : `nt:${(copy.ticketNumber || '').trim().toLowerCase()}|${copy.installerName.trim().toLowerCase()}|${copy.workDate || ''}`
  }

  // Which month a row's own save belongs to — a carry-over copy pins its month via hold:saveMonth
  // (its workDate is the ORIGIN's, which is the wrong month to group it under; see flushSave below).
  const saveMonthOf = (r: PayrollRow): string =>
    r.customFields?.[HOLD_PREFIX + 'saveMonth'] || (r.workDate ? r.workDate.slice(0, 7) : (dateFrom ? dateFrom.slice(0, 7) : new Date().toISOString().slice(0, 7)))

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
    // Latest call wins: a slow earlier one must not overwrite (or unlock) what a newer one is showing.
    const requestId = ++loadRequest.current
    const isLatest = () => requestId === loadRequest.current
    if (!branchFilter) {
      setRows([])
      setInitialLoading(false)
      setEarlyView(false)
      return
    }
    if (isManualRefresh) setSyncing(true)
    else setInitialLoading(true)

    let anySyncFailed = false
    try {
      const currentBranchName = branches.find(b => b.id === branchFilter)?.name || ''
      // If the active week is closed, use saved rows only and skip schedule sync & auto-save
      // A read-only viewer is treated the same way: saved rows only, never the Schedules merge (which
      // would compute unreleased installers' pay in their browser).
      const weekIsClosed = !canManagePayroll || Boolean(activeWeek && closures.some(c => c.branchId === branchFilter && c.weekFrom === activeWeek.from && c.weekTo === activeWeek.to))

      // Week switches within a month: show the last copy of the month(s) at once (locked, like the early view below).
      // It is only ever displayed — the merge and the auto-save always work from the fresh copy fetched next, because
      // holds/releases/adjustments (mutateSavedMonth) and other users write to the month without touching this cache,
      // and saving a stale month back would undo them.
      const CACHE_TTL = 5 * 60 * 1000
      if (!isManualRefresh && !weekIsClosed) {
        const cachedMonths = monthsToFetch.map(mKey => monthCache.current[`${branchFilter}:${mKey}`])
        if (cachedMonths.every(c => c && Date.now() - c.fetchedAt < CACHE_TTL)) {
          let cachedRows: PayrollRow[] = []
          for (const c of cachedMonths) cachedRows = deduplicateAndMergePayroll(cachedRows, c!.rows)
          setRows(cachedRows)
          setEarlyView(true)
          setSyncing(true)
          setInitialLoading(false)
        }
      }

      // Saved entries, always fresh. A week that crosses two months needs both; requested together, combined in month order.
      const savedByMonth = await Promise.all(monthsToFetch.map(async (mKey): Promise<PayrollRow[]> => {
        const cacheKey = `${branchFilter}:${mKey}`
        const params = new URLSearchParams({ branchId: branchFilter, month: mKey })
        const res = await fetch(`${API_BASE_URL}/v1/payroll?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        if (!res.ok) return []
        const list = await res.json()
        const rows = (Array.isArray(list) ? list : []).map(mapSavedPayrollEntry)
        monthCache.current[cacheKey] = { rows, fetchedAt: Date.now() }
        return rows
      }))
      if (!isLatest()) return
      let combinedSavedRows: PayrollRow[] = []
      for (const monthRows of savedByMonth) combinedSavedRows = deduplicateAndMergePayroll(combinedSavedRows, monthRows)

      if (!isManualRefresh && !weekIsClosed) {
        // Show the saved sheet now instead of a loading screen for the whole Schedules sync (the slow part);
        // the list stays locked until the sync below has merged in.
        setRows(combinedSavedRows)
        setEarlyView(true)
        setSyncing(true)
        setInitialLoading(false)
      }

      const perMonth = await Promise.all(monthsToFetch.map(async (mKey, i): Promise<PayrollRow[]> => {
        const savedRows = savedByMonth[i]
        if (weekIsClosed) return savedRows

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

        // Update the month cache with fully-merged rows so week switches within this month are instant
        monthCache.current[`${branchFilter}:${mKey}`] = { rows: merged, fetchedAt: Date.now() }

        // Auto-save when the sync added rows or changed existing ones (e.g. a Payroll Settings
        // rate change re-stamping Allowance / Earth Grounding), so the saved sheet matches.
        if (canManagePayroll && JSON.stringify(merged) !== JSON.stringify(savedRows)) {
          void savePayrollToBackend(merged, branchFilter, mKey)
        }

        return merged
      }))
      if (!isLatest()) return
      combinedSavedRows = []
      for (const monthRows of perMonth) combinedSavedRows = deduplicateAndMergePayroll(combinedSavedRows, monthRows)

      // Auto-discover custom fee columns stored in row customFields so they show up
      setCustomColumnDefs(prev => {
        const known = new Set(prev.map(c => c.key))
        const added: CustomColumnDef[] = []
        for (const r of combinedSavedRows) {
          if (r.customFields) {
            for (const k of Object.keys(r.customFields)) {
              if (k.startsWith('ded:') || k.startsWith('xfer:') || k.startsWith(MANUAL_FEE_PREFIX) || k.startsWith(HOLD_PREFIX) || k.startsWith(TEXT_FIELD_PREFIX) || k.startsWith(PAY_PREFIX)) continue
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
      if (isLatest()) {
        setSyncFailed(anySyncFailed)
        setInitialLoading(false)
        setSyncing(false)
        setEarlyView(false)
      }
    }
  }, [branchFilter, monthsToFetch, branches, rates, canManagePayroll, savePayrollToBackend, activeWeek, closures])

  useEffect(() => {
    const token = getToken()
    let appliedJson = ''
    const apply = (data: any) => {
      const raw = (data?.data || data || [])
        .filter((b: any) => !b.isFranchise && !isFranchiseBranch(b.id) && !isFranchiseBranch(b.name))
        .map((b: any) => ({
          id: b.id,
          name: b.name,
          payrollRates: b.payrollRates,
          isFranchise: false,
        }))
      const sorted = raw.sort((a: any, b: any) => a.name.localeCompare(b.name))
      // The saved list and the fresh one are usually identical: applying it twice would load the sheet twice.
      const json = JSON.stringify(sorted)
      if (json === appliedJson) return
      appliedJson = json
      setBranches(sorted)

      setBranchFilter(prev => {
        if (prev && sorted.some((b: any) => b.id === prev)) return prev
        const taguigSales = sorted.find((b: any) => /TAGUIG.*SALES/i.test(b.name))
          || sorted.find((b: any) => /TAGUIG/i.test(b.name))
        return taguigSales ? taguigSales.id : (sorted[0]?.id || '')
      })
    }
    // Last copy of the branch list (rates included) so the sheet can start loading without waiting for the API.
    const saved = readSavedBranches()
    if (saved) apply(saved)
    fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        apply(data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    void loadAndSync()
  }, [loadAndSync])

  // Held Tickets — the whole branch, scanning the active month + the 2 months before it (the
  // payroll API only takes a single ?month=, there's no all-months endpoint). Kept live (not just
  // fetched when the modal opens) so the toolbar's "Held Tickets (N)" badge stays accurate.
  const refreshHeldTickets = useCallback(async () => {
    if (!branchFilter) {
      setHeldTickets([])
      return
    }
    setHeldTicketsLoading(true)
    try {
      const months = [activeMonth, prevMonth(activeMonth), prevMonth(prevMonth(activeMonth))]
      const collected: { row: PayrollRow; month: string }[] = []
      // Deduplicate across months by business key (ticketId|installer or ticket#+installer+date).
      // Also auto-cleans any duplicate held rows from the DB in the background.
      const seenKeys = new Set<string>()
      // Requested together (each call can take seconds); processed in month order below.
      const monthLists = await Promise.all(months.map(async (m) => {
        // A failed request still ends in the outer catch (the badge keeps its last value), as before.
        const params = new URLSearchParams({ branchId: branchFilter, month: m })
        const res = await fetch(`${API_BASE_URL}/v1/payroll?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        return res.ok ? await res.json() : null
      }))
      for (let mi = 0; mi < months.length; mi++) {
        const m = months[mi]
        const list = monthLists[mi]
        if (list === null) continue
        const monthRows: PayrollRow[] = (Array.isArray(list) ? list : []).map(mapSavedPayrollEntry)

        // Track which held rows in this month are unique vs duplicate.
        const heldInMonth = monthRows.filter(r => isHeldRow(r))
        const uniqueKeysThisMonth = new Set<string>()
        let hasDuplicatesInMonth = false
        for (const r of heldInMonth) {
          const installer = (r.installerName || '').trim().toLowerCase()
          const dedupKey = r.ticketId
            ? `tk:${r.ticketId}|${installer}`
            : `nt:${(r.ticketNumber || '').trim().toLowerCase()}|${installer}|${r.workDate || ''}`
          if (uniqueKeysThisMonth.has(dedupKey)) {
            hasDuplicatesInMonth = true
          } else {
            uniqueKeysThisMonth.add(dedupKey)
          }
          // Cross-month dedup (display only)
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey)
            collected.push({ row: r, month: m })
          }
        }

        // If this month had duplicate held rows, silently clean the DB:
        // strip all but the first unique occurrence of each held key.
        if (hasDuplicatesInMonth && canManagePayroll) {
          const seenInMonth = new Set<string>()
          void mutateSavedMonth(branchFilter, m, rowsIn => {
            return rowsIn.filter(r => {
              if (!isHeldRow(r)) return true  // keep non-held rows untouched
              const installer = (r.installerName || '').trim().toLowerCase()
              const key = r.ticketId
                ? `tk:${r.ticketId}|${installer}`
                : `nt:${(r.ticketNumber || '').trim().toLowerCase()}|${installer}|${r.workDate || ''}`
              if (seenInMonth.has(key)) return false  // drop duplicate
              seenInMonth.add(key)
              return true
            })
          })
        }
      }
      setHeldTickets(collected)
    } catch (e) {
      console.error('Failed to load held payroll tickets:', e)
    } finally {
      setHeldTicketsLoading(false)
    }
  }, [branchFilter, activeMonth, canManagePayroll, mutateSavedMonth])

  useEffect(() => {
    void refreshHeldTickets()
  }, [refreshHeldTickets])

  // Automatically fetch fresh held tickets on time whenever the popup opens
  useEffect(() => {
    if (heldTicketsOpen) {
      void refreshHeldTickets()
    }
  }, [heldTicketsOpen, refreshHeldTickets])

  // Put a job on hold — excludes it from its own week's totals until released. See "Hold action"
  // in docs/payroll-hold-release-plan.md. Reason is required; the row must not already be a
  // carry-over copy (only an original job can be held).
  //
  // Uses mutateSavedMonth (atomic GET → mutate → PUT) so the hold is saved reliably even when
  // the row sits in a frozen/closed week — flushSave sends the full month and fails isSameExcept
  // checks on frozen rows, causing the "Could Not Put on Hold" error and silent duplicates.
  const submitHold = async (reason: string) => {
    if (!holdModalRow || !branchFilter || !activeWeek || !reason.trim() || isWeekClosed) return
    setHoldSubmitting(true)
    const heldFields = {
      ...(holdModalRow.customFields || {}),
      'hold:state': 'held',
      'hold:reason': reason.trim(),
      'hold:heldAt': new Date().toISOString(),
      'hold:heldBy': userDisplayName,
      'hold:heldWeekFrom': activeWeek.from,
      'hold:heldWeekTo': activeWeek.to,
    }
    const originMonth = saveMonthOf(holdModalRow)
    const origKey = rowMatchKey(holdModalRow)
    try {
      const ok = await mutateSavedMonth(branchFilter, originMonth, rowsIn =>
        rowsIn.map(r => rowMatchKey(r) === origKey ? { ...r, customFields: heldFields } : r)
      )
      if (!ok) {
        setConfirmDialog({
          title: 'Could Not Put on Hold',
          message: 'Something went wrong saving this hold. Please try again.',
          confirmText: 'OK',
          variant: 'info',
          onConfirm: () => {},
        })
        return
      }
      // Update local rows to reflect the held state instantly — no re-fetch needed.
      setRows(prev => prev.map(r => r.id === holdModalRow.id ? { ...r, customFields: heldFields } : r))
      setHoldModalRow(null)
      // Refresh the held tickets list from server so the count and list are accurate.
      void refreshHeldTickets()
    } finally {
      setHoldSubmitting(false)
    }
  }

  // Undo a hold — strips the hold tags so the job goes back into its own week's payout. Only a
  // still-held original can be un-held (a released one has a carry-over copy; use Undo release).
  const [unholdingKey, setUnholdingKey] = useState<string | null>(null)
  const submitUnhold = async (row: PayrollRow, month: string) => {
    if (!branchFilter) return
    const origKey = rowMatchKey(row)
    setUnholdingKey(origKey)
    try {
      const ok = await mutateSavedMonth(branchFilter, month, rowsIn => rowsIn.map(r => {
        if (rowMatchKey(r) !== origKey || r.customFields?.['hold:state'] !== 'held') return r
        const cf = { ...(r.customFields || {}) }
        for (const k of ['hold:state', 'hold:reason', 'hold:heldAt', 'hold:heldBy', 'hold:heldWeekFrom', 'hold:heldWeekTo']) delete cf[k]
        return { ...r, customFields: cf }
      }))
      if (!ok) {
        setConfirmDialog({
          title: 'Undo Hold Failed',
          message: 'Could not take this ticket off hold. Please try again.',
          confirmText: 'OK',
          variant: 'info',
          onConfirm: () => {},
        })
        return
      }
      setRows(prev => prev.map(r => {
        if (rowMatchKey(r) !== origKey || r.customFields?.['hold:state'] !== 'held') return r
        const cf = { ...(r.customFields || {}) }
        for (const k of ['hold:state', 'hold:reason', 'hold:heldAt', 'hold:heldBy', 'hold:heldWeekFrom', 'hold:heldWeekTo']) delete cf[k]
        return { ...r, customFields: cf }
      }))
      void refreshHeldTickets()
    } finally {
      setUnholdingKey(null)
    }
  }

  // Same 3-month scan as refreshHeldTickets, for tickets whose withheld 50% is still unreleased.
  const refreshBalances = useCallback(async () => {
    if (!branchFilter) { setBalanceTickets([]); return }
    try {
      const months = [activeMonth, prevMonth(activeMonth), prevMonth(prevMonth(activeMonth))]
      const collected: { row: PayrollRow; month: string }[] = []
      const seen = new Set<string>()
      for (const m of months) {
        const params = new URLSearchParams({ branchId: branchFilter, month: m })
        const res = await fetch(`${API_BASE_URL}/v1/payroll?${params.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } })
        if (!res.ok) continue
        const list = await res.json()
        for (const r of (Array.isArray(list) ? list : []).map(mapSavedPayrollEntry)) {
          if (!hasPendingBalance(r)) continue
          const k = rowMatchKey(r)
          if (seen.has(k)) continue
          seen.add(k)
          collected.push({ row: r, month: m })
        }
      }
      setBalanceTickets(collected)
    } catch (e) {
      console.error('Failed to load pending payout balances:', e)
    }
  }, [branchFilter, activeMonth])

  useEffect(() => { void refreshBalances() }, [refreshBalances])
  // A status change autosaves after a short debounce; re-scan a moment later so the count catches up.
  useEffect(() => {
    const t = setTimeout(() => { void refreshBalances() }, 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  // Change a split ticket's payment status from the balances list. Works in a closed week too
  // (backend allows pay: tag changes there) and always keeps the split so the payout can't jump.
  const setBalancePaymentStatus = async (row: PayrollRow, month: string, status: string) => {
    if (!branchFilter) return
    const key = rowMatchKey(row)
    const ok = await mutateSavedMonth(branchFilter, month, rowsIn => rowsIn.map(r => rowMatchKey(r) === key ? {
      ...r,
      customFields: { ...(r.customFields || {}), 'pay:status': status, 'pay:split': '1' },
    } : r))
    if (!ok) {
      setConfirmDialog({ title: 'Update Failed', message: 'Could not update the payment status. Please try again.', confirmText: 'OK', variant: 'info', onConfirm: () => {} })
      return
    }
    await loadAndSync(true)
    void refreshBalances()
  }

  // Every ticket with at least one logged correction (same 3-month scan as the held/balance lists).
  const refreshCorrections = useCallback(async () => {
    if (!branchFilter) { setCorrections([]); return }
    try {
      const months = [activeMonth, prevMonth(activeMonth), prevMonth(prevMonth(activeMonth))]
      const collected: { row: PayrollRow; month: string }[] = []
      const seen = new Set<string>()
      for (const m of months) {
        const params = new URLSearchParams({ branchId: branchFilter, month: m })
        const res = await fetch(`${API_BASE_URL}/v1/payroll?${params.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } })
        if (!res.ok) continue
        const list = await res.json()
        for (const r of (Array.isArray(list) ? list : []).map(mapSavedPayrollEntry)) {
          if (isCarryOver(r) || parseAdjustmentLog(r).length === 0) continue
          const k = rowMatchKey(r)
          if (seen.has(k)) continue
          seen.add(k)
          collected.push({ row: r, month: m })
        }
      }
      setCorrections(collected)
    } catch (e) {
      console.error('Failed to load correction history:', e)
    }
  }, [branchFilter, activeMonth])

  useEffect(() => { void refreshCorrections() }, [refreshCorrections])

  // Money columns a correction can touch (Materials Return is free text, so it's excluded).
  const getAdjustableCols = (): { key: string; label: string }[] => [
    ...COLUMN_DEFS.filter(c => c.isMoney && c.key !== 'materialsReturn').map(c => ({ key: c.key, label: c.label })),
    ...customColumnDefs.map(c => ({ key: c.key, label: c.label })),
  ]

  const openAdjustModal = (row: PayrollRow) => {
    setAdjustRow({ row, month: saveMonthOf(row) })
  }

  // Post a balance correction for a closed-week ticket: the closed row stays frozen, the difference
  // (per fee column, add OR deduct) lands as an adjustment row in the chosen open week, and the
  // change is logged on the original ticket. Inserted first; rolled back if logging fails.
  const submitAdjust = async (adjustEdits: Record<string, string>, adjustTargetWeek: PayrollWeek, adjustReason: string) => {
    if (!adjustRow || !branchFilter || !adjustTargetWeek || !adjustReason.trim()) return
    const { row: origin, month: originMonth } = adjustRow
    const changes = getAdjustableCols().flatMap(col => {
      const raw = adjustEdits[col.key]
      if (raw === undefined || raw === '') return []
      const from = num(getColAccessor(col.key).get(origin))
      const to = num(raw)
      const delta = Math.round((to - from) * 100) / 100
      return delta === 0 ? [] : [{ key: col.key, label: col.label, from, to, delta }]
    })
    if (changes.length === 0) return
    setAdjustSubmitting(true)
    try {
      const targetWeek = adjustTargetWeek
      const copyMonth = targetWeek.from.slice(0, 7)
      const marker = `adj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const at = new Date().toISOString()
      const by = userDisplayName
      const reason = adjustReason.trim()
      const net = Math.round(changes.reduce((sum, c) => sum + c.delta, 0) * 100) / 100
      const summary = changes.map(c => `${c.label} ${c.delta > 0 ? '+' : '−'}₱${peso(Math.abs(c.delta))}`).join(' · ')
      const fixedMoney = new Set(COLUMN_DEFS.filter(c => c.isMoney).map(c => c.key))
      const originWeek = origin.workDate ? weekContaining(origin.workDate, cycle) : null

      const adj: Record<string, unknown> = { ...origin, id: marker, ticketId: undefined, installationUpload: 'ADJUSTMENT', amountCollected: '', actualCollected: '', remarks: '', audited: '' }
      fixedMoney.forEach(k => { adj[k] = '' })
      const cf: Record<string, string> = {}
      for (const c of changes) {
        if (fixedMoney.has(c.key)) adj[c.key] = String(c.delta)
        else cf[c.key] = String(c.delta)
      }
      cf['hold:carryOver'] = '1'
      cf['hold:originMonth'] = originMonth
      cf['hold:originWeekFrom'] = originWeek?.from || ''
      cf['hold:originWeekTo'] = originWeek?.to || ''
      cf['hold:originTicketId'] = origin.ticketId || ''
      cf['hold:targetWeekFrom'] = targetWeek.from
      cf['hold:targetWeekTo'] = targetWeek.to
      cf['hold:saveMonth'] = copyMonth
      cf['hold:approvalNote'] = reason
      cf['hold:releasedBy'] = by
      cf['hold:releasedAt'] = at
      cf['hold:copyMarker'] = marker
      cf['pay:adjust'] = '1'
      cf['pay:factor'] = '1'
      cf['pay:adjSummary'] = summary
      adj.customFields = cf

      const insertOk = await mutateSavedMonth(branchFilter, copyMonth, rowsIn => [...rowsIn, adj as unknown as PayrollRow], marker)
      if (!insertOk) {
        setConfirmDialog({ title: 'Adjustment Failed', message: 'Could not post the adjustment into the target week. No changes were made.', confirmText: 'OK', variant: 'info', onConfirm: () => {} })
        return
      }
      const entry: AdjustmentLogEntry = { id: marker, at, by, reason, targetWeekFrom: targetWeek.from, targetWeekTo: targetWeek.to, net, changes }
      const origKey = rowMatchKey(origin)
      const logOk = await mutateSavedMonth(branchFilter, originMonth, rowsIn => rowsIn.map(r => rowMatchKey(r) === origKey ? {
        ...r,
        customFields: { ...(r.customFields || {}), 'pay:adjLog': JSON.stringify([...parseAdjustmentLog(r), entry]) },
      } : r), marker)
      if (!logOk) {
        await mutateSavedMonth(branchFilter, copyMonth, rowsIn => rowsIn.filter(r => r.customFields?.['hold:copyMarker'] !== marker))
        setConfirmDialog({ title: 'Adjustment Failed', message: 'Could not record the correction on the original ticket, so it was rolled back. No changes were made.', confirmText: 'OK', variant: 'info', onConfirm: () => {} })
        return
      }
      setAdjustRow(null)
      void refreshCorrections()
      // Jump to the week the adjustment landed in so the new row (and the updated payout) is visible
      // right away — the closed week you came from intentionally still shows the original paid amounts.
      setActiveMonth(targetWeek.owningMonth)
      setActiveWeek(targetWeek)
      setConfirmDialog({
        title: 'Adjustment Posted',
        message: `${net < 0 ? 'Deducted' : 'Added'} ${pesoSigned(net)} on ${origin.ticketNumber || 'this ticket'} in Week ${targetWeek.weekNumber} (${targetWeek.label}).`,
        detail: summary,
        confirmText: 'OK',
        variant: 'info',
        onConfirm: () => {},
      })
    } finally {
      setAdjustSubmitting(false)
    }
  }

  const openReleaseModal = (row: PayrollRow, month: string, kind?: 'balance') => {
    const defaultOpen = activeWeek && !closures.some(c => c.branchId === branchFilter && c.weekFrom === activeWeek.from && c.weekTo === activeWeek.to)
    setReleaseFor({ row, month, kind })
    setReleaseTargetWeek(defaultOpen ? activeWeek : null)
    setReleaseApprovalNote('')
    setHeldTicketsOpen(false)
  }

  // Release a held ticket's full payout as a carry-over into an open target week — see "Release
  // flow" in docs/payroll-hold-release-plan.md. The copy is inserted first; if marking the
  // original as released then fails, the copy is removed so the payout is never counted twice.
  const submitRelease = async () => {
    if (!releaseFor || !branchFilter || !releaseTargetWeek) return
    setReleaseSubmitting(true)
    try {
      const { row: heldRow, month: originMonth, kind } = releaseFor
      const isBalance = kind === 'balance'
      const targetWeek = releaseTargetWeek
      const releasedAt = new Date().toISOString()
      const releasedBy = userDisplayName
      const approvalNote = releaseApprovalNote.trim() || (isBalance ? 'Remaining 50% balance' : '')
      const originWeek = isBalance && heldRow.workDate ? weekContaining(heldRow.workDate, cycle) : null
      const copyMarker = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const copyMonth = targetWeek.from.slice(0, 7)

      // Deductions are per-period, attached to whichever row happens to hold them for that
      // installer's week (see setDeduction) — never carry them into the copy's own new period.
      const copyFields: Record<string, string> = {}
      for (const [k, v] of Object.entries(heldRow.customFields || {})) {
        if (k.startsWith(HOLD_PREFIX) || k.startsWith(DEDUCTION_PREFIX) || k.startsWith(PAY_PREFIX)) continue
        copyFields[k] = v
      }
      if (isBalance) {
        copyFields['pay:factor'] = '0.5'
        copyFields['pay:balance'] = '1'
      }
      copyFields['hold:carryOver'] = '1'
      copyFields['hold:originRowId'] = heldRow.id
      copyFields['hold:originMonth'] = originMonth
      copyFields['hold:originWeekFrom'] = originWeek?.from || heldRow.customFields?.['hold:heldWeekFrom'] || ''
      copyFields['hold:originWeekTo'] = originWeek?.to || heldRow.customFields?.['hold:heldWeekTo'] || ''
      copyFields['hold:originTicketId'] = heldRow.ticketId || ''
      copyFields['hold:targetWeekFrom'] = targetWeek.from
      copyFields['hold:targetWeekTo'] = targetWeek.to
      copyFields['hold:saveMonth'] = copyMonth
      copyFields['hold:approvalNote'] = approvalNote
      copyFields['hold:releasedBy'] = releasedBy
      copyFields['hold:releasedAt'] = releasedAt
      copyFields['hold:copyMarker'] = copyMarker

      const copyRow: PayrollRow = { ...heldRow, id: copyMarker, ticketId: undefined, customFields: copyFields }

      const insertOk = await mutateSavedMonth(branchFilter, copyMonth, rowsIn => [...rowsIn, copyRow], copyMarker)
      if (!insertOk) {
        setConfirmDialog({
          title: 'Release Failed',
          message: 'Could not save the carry-over into the target week. No changes were made.',
          confirmText: 'OK',
          variant: 'info',
          onConfirm: () => {},
        })
        return
      }

      const origKey = rowMatchKey(heldRow)
      const markOk = await mutateSavedMonth(branchFilter, originMonth, rowsIn => rowsIn.map(r => rowMatchKey(r) === origKey ? (isBalance ? {
        ...r,
        customFields: {
          ...(r.customFields || {}),
          'pay:split': '1',
          'pay:balanceReleased': '1',
          'pay:copyId': copyMarker,
        },
      } : {
        ...r,
        customFields: {
          ...(r.customFields || {}),
          'hold:state': 'released',
          'hold:releasedAt': releasedAt,
          'hold:releasedBy': releasedBy,
          'hold:approvalNote': approvalNote,
          'hold:targetWeekFrom': targetWeek.from,
          'hold:targetWeekTo': targetWeek.to,
          'hold:copyId': copyMarker,
        },
      }) : r), copyMarker)

      if (!markOk) {
        // Roll back the copy so the payout is never counted both as held AND released.
        await mutateSavedMonth(branchFilter, copyMonth, rowsIn => rowsIn.filter(r => r.customFields?.['hold:copyMarker'] !== copyMarker))
        setConfirmDialog({
          title: 'Release Failed',
          message: 'Could not update the original held ticket, so the release was rolled back. No changes were made.',
          confirmText: 'OK',
          variant: 'info',
          onConfirm: () => {},
        })
        return
      }

      setReleaseFor(null)
      setReleaseTargetWeek(null)
      setReleaseApprovalNote('')
      // Both writes already landed on the server (mutateSavedMonth above) — patch local state
      // with the same change instead of a full loadAndSync, which re-runs the schedule sync for
      // every visible month and made this feel stuck. Only splice in the copy if its month is
      // actually in view; otherwise it wouldn't render here anyway.
      setRows(prev => {
        const updated = prev.map(r => rowMatchKey(r) === origKey ? {
          ...r,
          customFields: {
            ...(r.customFields || {}),
            'hold:state': 'released',
            'hold:releasedAt': releasedAt,
            'hold:releasedBy': releasedBy,
            'hold:approvalNote': approvalNote,
            'hold:targetWeekFrom': targetWeek.from,
            'hold:targetWeekTo': targetWeek.to,
            'hold:copyId': copyMarker,
          },
        } : r)
        return monthsToFetch.includes(copyMonth) ? [...updated, copyRow] : updated
      })
      void refreshHeldTickets()
      void refreshBalances()
    } finally {
      setReleaseSubmitting(false)
    }
  }

  // Undo a release — removes the carry-over copy and puts the original back on hold.
  const submitUndoRelease = async (copy: PayrollRow) => {
    if (!branchFilter) return
    const marker = copy.customFields?.['hold:copyMarker']
    const copyMonth = copy.customFields?.['hold:saveMonth'] || copy.customFields?.['hold:targetWeekFrom']?.slice(0, 7) || ''
    const originMonth = copy.customFields?.['hold:originMonth'] || ''
    if (!marker || !copyMonth || !originMonth) return
    const undoKey = marker
    setUndoingRowKey(undoKey)
    try {
      const removeOk = await mutateSavedMonth(branchFilter, copyMonth, rowsIn => rowsIn.filter(r => r.customFields?.['hold:copyMarker'] !== marker))
      if (!removeOk) {
        setConfirmDialog({
          title: 'Undo Failed',
          message: 'Could not remove the carry-over. Please try again.',
          confirmText: 'OK',
          variant: 'info',
          onConfirm: () => {},
        })
        return
      }

      const origKey = originMatchKeyOf(copy)
      const restoreOk = await mutateSavedMonth(branchFilter, originMonth, rowsIn => rowsIn.map(r => {
        if (rowMatchKey(r) !== origKey) return r
        const cf = { ...(r.customFields || {}) }
        if (copy.customFields?.['pay:adjust'] === '1') {
          // Adjustment: the original was never held — just drop this correction from its history.
          const left = parseAdjustmentLog(r).filter(e => e.id !== marker)
          if (left.length > 0) cf['pay:adjLog'] = JSON.stringify(left)
          else delete cf['pay:adjLog']
          return { ...r, customFields: cf }
        }
        if (copy.customFields?.['pay:balance'] === '1') {
          // Balance release: the original was never held — just make its withheld half pending again.
          delete cf['pay:balanceReleased']
          delete cf['pay:copyId']
          return { ...r, customFields: cf }
        }
        cf['hold:state'] = 'held'
        delete cf['hold:releasedAt']
        delete cf['hold:releasedBy']
        delete cf['hold:approvalNote']
        delete cf['hold:targetWeekFrom']
        delete cf['hold:targetWeekTo']
        delete cf['hold:copyId']
        return { ...r, customFields: cf }
      }))

      if (!restoreOk) {
        // Put the copy back — otherwise the payout would vanish (neither held nor released).
        await mutateSavedMonth(branchFilter, copyMonth, rowsIn => [...rowsIn, copy])
        setConfirmDialog({
          title: 'Undo Failed',
          message: 'Could not restore the original hold, so the undo was rolled back. No changes were made.',
          confirmText: 'OK',
          variant: 'info',
          onConfirm: () => {},
        })
        return
      }

      // Both writes already landed (mutateSavedMonth above) — patch local state instead of a
      // full loadAndSync, which re-runs the schedule sync for every visible month.
      setRows(prev => prev
        .filter(r => r.customFields?.['hold:copyMarker'] !== marker)
        .map(r => {
          if (rowMatchKey(r) !== origKey) return r
          const cf = { ...(r.customFields || {}) }
          cf['hold:state'] = 'held'
          delete cf['hold:releasedAt']
          delete cf['hold:releasedBy']
          delete cf['hold:approvalNote']
          delete cf['hold:targetWeekFrom']
          delete cf['hold:targetWeekTo']
          delete cf['hold:copyId']
          return { ...r, customFields: cf }
        }))
      void refreshHeldTickets()
      void refreshBalances()
      void refreshCorrections()
    } finally {
      setUndoingRowKey(null)
    }
  }

  // Shared by every mutation below — groups by month (a row can belong to a different month
  // than the active filter) and pushes each group to its own backend save.
  // Rows edited but not yet written. Held in a ref so Save / unload / unmount always flush the LATEST edits.
  const pendingRowsRef = useRef<PayrollRow[] | null>(null)
  const flushSave = async (updated: PayrollRow[]): Promise<boolean> => {
    if (isWeekClosed || !canManagePayroll || !branchFilter) return false
    const monthGroups = new Map<string, PayrollRow[]>()
    for (const r of updated) {
      const m = saveMonthOf(r)
      if (!monthGroups.has(m)) monthGroups.set(m, [])
      monthGroups.get(m)!.push(r)
    }
    const results = await Promise.all(Array.from(monthGroups.entries()).map(([mKey, mRows]) => savePayrollToBackend(mRows, branchFilter, mKey)))
    const ok = results.every(Boolean)
    // Only clear the pending edits if nothing newer was typed while the request was in flight.
    if (ok && pendingRowsRef.current === updated) { pendingRowsRef.current = null; setSaveStatus('saved') }
    return ok
  }
  const scheduleAutoSave = (updated: PayrollRow[]) => {
    if (isWeekClosed) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    pendingRowsRef.current = updated
    setSaveStatus('dirty')
    autoSaveTimer.current = setTimeout(() => { void flushSave(updated) }, 1500)
  }
  // Explicit Save — writes every edit on the table right now and reports the result.
  const saveTableNow = async () => {
    if (isWeekClosed || !canManagePayroll) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    const toSave = pendingRowsRef.current ?? rows
    pendingRowsRef.current = toSave
    setSaveStatus('saving')
    const ok = await flushSave(toSave)
    if (!ok) {
      setSaveStatus('error')
      setConfirmDialog({
        title: 'Save Failed',
        message: 'Could not save the table. Your changes are still on screen — please try Save again.',
        confirmText: 'OK',
        variant: 'info',
        onConfirm: () => {},
      })
    }
  }
  // Never lose pending edits: warn on reload/close, and flush when the tab is hidden or the page unmounts.
  const flushRef = useRef(flushSave)
  flushRef.current = flushSave
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pendingRowsRef.current) return
      void flushRef.current(pendingRowsRef.current)
      e.preventDefault()
      e.returnValue = ''
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && pendingRowsRef.current) void flushRef.current(pendingRowsRef.current)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onHidden)
      if (pendingRowsRef.current) void flushRef.current(pendingRowsRef.current)
    }
  }, [])
  // Save-now for the Deductions modal — skips the debounce so "Save" persists immediately.
  const saveDeductionsNow = () => {
    if (isWeekClosed) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setSaveStatus('saving')
    void flushSave(pendingRowsRef.current ?? rows)
    setDeductionsModalInstaller(null)
  }

  // Debounced auto-save on row edits (supports functional patch so custom fields never read stale state)
  const updateRow = (id: string, patch: Partial<PayrollRow> | ((prevRow: PayrollRow) => Partial<PayrollRow>)) => {
    if (isWeekClosed) return
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
    if (isWeekClosed || viewOnly) return
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
    if (isWeekClosed || installerRows.length === 0) return
    // A carry-over copy sorts by its ORIGIN's (older) workDate, so it can land first/last in the
    // period — never let it hold a deduction, or undoing the release deletes it (see plan landmine 5).
    const eligible = installerRows.filter(r => !isCarryOver(r) && isActivePayRow(r))
    const pool = eligible.length > 0 ? eligible : installerRows
    let targetId = pool[0].id
    let stored = value
    if (BALANCE_DEDUCTION_KEYS.has(key)) {
      const holder = [...pool].reverse().find(r => rawDeduction(r, key))
      targetId = (holder ?? pool[pool.length - 1]).id
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

  // Ticket payment status. Anything short of Fully Paid pays the tech 50% (see payFactor). Marking
  // a row Fully Paid while its week is still open just makes it a full payout again; the split is
  // only kept for a row whose week already closed (handled from the Held Tickets balances list).
  const setPaymentStatus = (id: string, status: string) => {
    if (isWeekClosed) return
    updateRow(id, prevRow => {
      const cf = { ...(prevRow.customFields || {}) }
      cf['pay:status'] = status
      if (status === 'PAID') delete cf['pay:split']
      else cf['pay:split'] = '1'
      return { customFields: cf }
    })
  }

  // Allowance / Earth Grounding are auto-stamped from the branch rate on every sync; a hand edit
  // (including clearing to zero) flags the row so re-syncs keep the user's value instead.
  const setAutoStampedFee = (id: string, field: AutoStampedFee, v: string) => {
    if (isWeekClosed) return
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
    paymentStatus: { get: r => paymentStatusOf(r), set: (id, v) => setPaymentStatus(id, v) },
    installationFee: { get: r => r.installationFee, set: (id, v) => setAutoStampedFee(id, 'installationFee', v) },
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
  const toggleColumnForInstaller = (installerName: string, key: string) => {
    if (COLUMN_DEFS.find(c => c.key === key)?.pinned) return
    setHiddenColumnsByInstaller(prev => {
      const current = prev[installerName] ?? new Set(DEFAULT_HIDDEN_COLUMNS)
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, [installerName]: next }
    })
  }
  const toggleColumn = (key: string) => {
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
    const toHide = [
      ...COLUMN_DEFS.filter(c => !c.pinned && !cats.includes(c.category as ColumnCategory)).map(c => c.key),
      ...customColumnDefs.map(c => c.key),
    ]
    setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set(toHide) }))
  }

  // Checks whether every ticket/row for this installer has zero or empty input in the column
  const isColumnEmpty = useCallback((key: string, installerRows: PayrollRow[]): boolean => {
    if (!installerRows || installerRows.length === 0) return true
    for (const r of installerRows) {
      const accessor = columnAccessors[key]
      const raw = accessor ? accessor.get(r) : r.customFields?.[key]
      const colDef = COLUMN_DEFS.find(c => c.key === key)
      const isMoney = colDef ? !!colDef.isMoney : (key.startsWith('custom_') || true)
      if (isMoney) {
        if (num(String(raw)) !== 0) return false
      } else {
        const str = String(raw || '').trim()
        if (str !== '' && str !== '—' && str !== '-') return false
      }
    }
    return true
  }, [columnAccessors])

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
  // Held rows and released originals never belong to a week's view (their payout, if any, now
  // lives on their carry-over copy — see isActivePayRow). A carry-over copy keeps its ORIGIN's
  // workDate, so it must be matched against the range by its hold:targetWeekFrom/To instead.
  const rowInActiveWindow = (row: PayrollRow): boolean => {
    if (!isActivePayRow(row)) return false
    if (isCarryOver(row)) {
      if (dateFrom && row.customFields?.['hold:targetWeekFrom'] !== dateFrom) return false
      if (dateTo && row.customFields?.['hold:targetWeekTo'] !== dateTo) return false
      return true
    }
    // Rows with no date (rare hand-added rows) aren't excluded by a date range —
    // there's nothing to range-check, so they stay visible regardless of the filter.
    if (row.workDate) {
      if (dateFrom && row.workDate < dateFrom) return false
      if (dateTo && row.workDate > dateTo) return false
    }
    return true
  }

  const technicianOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      if (!rowInActiveWindow(row)) continue
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
      if (!rowInActiveWindow(r)) return false
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

  // Active tickets for the selected installer in the currently selected week (following the week selected on the list)
  const selectedInstallerRows = useMemo(() => {
    if (!selectedInstaller) return []
    const term = search.toLowerCase()
    const memberRows = rows.filter(r => {
      const key = resolveGroupKey(r.installerName)
      if (key !== selectedInstaller) return false
      if (!isActivePayRow(r)) return false
      if (!rowInActiveWindow(r)) return false
      if (term && !(
        r.installerName.toLowerCase().includes(term)
        || r.customerName.toLowerCase().includes(term)
        || r.cityAddress.toLowerCase().includes(term)
      )) return false
      return true
    })
    return memberRows.sort((a, b) => {
      if (!a.workDate) return 1
      if (!b.workDate) return -1
      return a.workDate.localeCompare(b.workDate)
    })
  }, [rows, selectedInstaller, search, installerAliases, dateFrom, dateTo])

  // Automatically hides any non-pinned columns that have no input across all rows for this installer
  const hideEmptyColumnsFor = useCallback((installerName: string) => {
    const installerRows = selectedInstaller === installerName
      ? selectedInstallerRows
      : (grouped.find(([name]) => name === installerName)?.[1] || [])
    const allCols: { key: string; pinned?: boolean }[] = [
      ...COLUMN_DEFS,
      ...customColumnDefs.map(c => ({ key: c.key, pinned: false })),
    ]
    const newHidden = new Set<string>()
    for (const c of allCols) {
      if (c.pinned) continue
      if (isColumnEmpty(c.key, installerRows)) {
        newHidden.add(c.key)
      }
    }
    setHiddenColumnsByInstaller(prev => ({ ...prev, [installerName]: newHidden }))
  }, [selectedInstaller, selectedInstallerRows, grouped, customColumnDefs, isColumnEmpty])

  const grandTotal = useMemo(() => grouped.reduce((sum, [, r]) => sum + installerTotal(r), 0), [grouped])
  const globalDeductionTotal = useMemo(() => grouped.reduce((sum, [, r]) => sum + deductionTotal(r), 0), [grouped])
  const globalBaseInstallTotal = useMemo(() => baseInstallTotal(filteredRows), [filteredRows])
  const globalRemittanceTotal = useMemo(() => remittanceTotal(filteredRows), [filteredRows])
  const globalAddOnTotal = grandTotal - globalBaseInstallTotal

  const currentBranchDisplay = branchFilter
    ? formatBranchName(branches.find(b => b.id === branchFilter)?.name || user?.branchId || '')
    : ''


  // If filters change out from under the selected installer (different week/month/branch/search
  // leaves them with zero rows), fall back to the roster instead of showing a stuck blank page.
  useEffect(() => {
    if (selectedInstaller && rows.length > 0 && !initialLoading) {
      const exists = rows.some(r => resolveGroupKey(r.installerName) === selectedInstaller && isActivePayRow(r) && rowInActiveWindow(r))
      if (!exists) {
        handleSelectInstaller(null)
      }
    }
  }, [rows, selectedInstaller, initialLoading, handleSelectInstaller, dateFrom, dateTo])

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
    // Non-trailing columns from standard definitions
    const fixedMiddle = COLUMN_DEFS.filter(
      c => c.key !== 'remarks' && c.key !== 'audited' && (c.pinned || !hidden.has(c.key))
        // Remittance (money owed back to the branch) is payroll-only.
        && (canManagePayroll || c.key !== 'remit')
    )
    // Custom added columns (always stay on the left side of remarks and audited)
    const custom: ColumnDef[] = customColumnDefs
      .filter(cc => !hidden.has(cc.key))
      .map(cc => ({
        key: cc.key, label: cc.label, width: 120, align: 'right', isMoney: true,
      }))
    // Remarks and Audited are permanently fixed to the far-right last columns
    const trailing: ColumnDef[] = COLUMN_DEFS.filter(
      c => (c.key === 'remarks' || c.key === 'audited') && (c.pinned || !hidden.has(c.key))
    )
    return [...fixedMiddle, ...custom, ...trailing]
  }
  const zebraBg = isLight ? '#f8fafc' : '#0c1420'
  const headerBg = isLight ? '#f8fafc' : '#0d1520'
  // Grid lines — darker + thicker than default for better scanability
  const gridLine = isLight ? '#64748b' : '#334155'

  // ── Date-band colour palette ─────────────────────────────────────────────────
  // Alternating between white/gray shades and green shades for each date group.
  // Within a date group, rows alternate light ↔ dark.
  const DATE_BAND_PALETTES: Array<{ light: string; dark: string; border: string }> =
    isLight
      ? [
          { light: '#FFFFFF', dark: '#F1F5F9', border: gridLine }, // white & gray shades
          { light: '#F0FDF4', dark: '#DCFCE7', border: gridLine }, // green shades
        ]
      : [
          { light: '#0F172A', dark: '#0B1120', border: gridLine }, // dark gray shades
          { light: '#062316', dark: '#03170E', border: gridLine }, // dark green shades
        ]

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
    if (col.key === 'materialsReturn' && String(raw).trim() && !/^-?[\d,]*\.?\d*$/.test(String(raw).trim())) {
      return String(raw).trim()
    }
    if (col.isMoney) {
      const n = num(String(raw))
      return n === 0 ? '' : `₱${peso(n)}`
    }
    if (col.key === 'date') return row.workDate ? shortDate(row.workDate) : ''
    if (col.key === 'paymentStatus') return paymentStatusLabel(row)
    return String(raw).trim()
  }

  // PDF of an installer's payout table, drawn as real text (see utils/payoutPdf.ts). `onlyWithData`
  // (Showcase) drops columns with no values; the main table exports exactly the columns it shows.
  const runPayoutPdf = async (installerName: string, onlyWithData: boolean) => {
    setShowcasePdfing(true)
    try {
      const { exportPayoutPdf } = await import('../utils/payoutPdf')
      const allRows = selectedInstallerRows
      const regular = allRows.filter(r => !isCarryOver(r))
      let cols = visibleColumnsFor(installerName)
      if (onlyWithData) {
        cols = cols.filter(col => ['date', 'ticketNumber', 'customerName', 'brandCapacity', 'installationUpload', 'paymentStatus'].includes(col.key)
          || regular.some(r => { const t = listCellText(col, r).trim(); return t && t !== '—' && t !== '₱0.00' && t !== '0' }))
      }
      const bands = [{ light: '#FFFFFF', dark: '#F1F5F9' }, { light: '#F0FDF4', dark: '#DCFCE7' }]
      const dates = Array.from(new Set(regular.map(r => r.workDate || ''))).sort()
      const bandOf: Record<string, number> = {}
      dates.forEach((d, i) => { bandOf[d] = i % bands.length })
      const seen: Record<string, number> = {}
      const rows = regular.map(row => {
        const dk = row.workDate || ''
        const n = seen[dk] ?? 0
        seen[dk] = n + 1
        const tones: Record<number, 'done' | 'warn'> = {}
        const cells = cols.map((col, i) => {
          const text = listCellText(col, row)
          if (col.key === 'installationUpload' && text) tones[i] = /^DONE\b/i.test(text) ? 'done' : 'warn'
          if (col.key === 'paymentStatus' && paymentStatusOf(row) !== 'PAID') tones[i] = 'warn'
          return text
        })
        return { cells, fill: n % 2 === 0 ? bands[bandOf[dk] ?? 0].light : bands[bandOf[dk] ?? 0].dark, tones }
      })
      const totals = cols.map((col, i) => {
        if (i === 0) return 'TOTAL'
        if (col.key === 'remit') { const t = remittanceTotal(regular); return t ? `₱${peso(t)}` : '' }
        if (col.isMoney) { const t = regular.reduce((sum, r) => sum + num(String(getColAccessor(col.key).get(r) ?? '')), 0); return t ? `₱${peso(t)}` : '' }
        return ''
      })
      const gross = installerTotal(allRows)
      const ded = deductionTotal(allRows)
      const awaiting = allRows.filter(hasPendingBalance).reduce((sum, r) => sum + rowTotal(r), 0)
      const net = gross - ded
      const weekLabel = activeWeek ? `Week ${activeWeek.weekNumber} (${activeWeek.label})` : formatMonth(activeMonth)
      const safe = (t: string) => t.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
      exportPayoutPdf({
        filename: `Payout_${safe(displayInstallerName(installerName))}_${activeWeek ? `${activeWeek.from}_${activeWeek.to}` : activeMonth}.pdf`,
        branch: currentBranchDisplay || 'Branch',
        title: displayInstallerName(installerName),
        chips: [
          { label: weekLabel },
          { label: `${regular.length} ${regular.length === 1 ? 'ticket' : 'tickets'}` },
          { label: 'Gross', value: `₱${peso(gross)}` },
          ...(awaiting > 0 ? [{ label: 'Awaiting payment', value: `₱${peso(awaiting)}`, tone: 'warn' as const }] : []),
          ...(ded > 0 ? [{ label: 'Deductions', value: `-₱${peso(ded)}`, tone: 'bad' as const }] : []),
          { label: 'Net payout', value: `${net < 0 ? '-' : ''}₱${peso(Math.abs(net))}`, tone: 'good' as const },
        ],
        columns: cols.map(col => ({
          key: col.key,
          label: col.label,
          align: col.key === 'paymentStatus' ? 'center' as const : (col.align === 'right' || col.isMoney) ? 'right' as const : 'left' as const,
          remit: col.key === 'remit',
        })),
        rows,
        totals,
        footerLeft: `${currentBranchDisplay} | ${displayInstallerName(installerName).toUpperCase()} | ${weekLabel} | Printed ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      })
    } catch (e) {
      console.error('Payout PDF export failed:', e)
      setConfirmDialog({ title: 'PDF Export Failed', message: 'Could not create the PDF. Please try again.', confirmText: 'OK', variant: 'info', onConfirm: () => {} })
    } finally {
      setShowcasePdfing(false)
    }
  }

  // Mobile card value cell — same accessors as the desktop grid, just without the
  // sticky/pin plumbing a card list doesn't need. Date/Ticket #/Customer Name and Job
  // Total are never passed in here — the mobile card shows those in its header instead.
  const renderMobileCellValue = (col: ColumnDef, row: PayrollRow) => {
    const smallInputCls = "w-full text-right px-2.5 py-2.5 rounded-lg text-base font-semibold uppercase bg-transparent border-0 outline-none focus:ring-1 focus:ring-emerald-500/40"
    const acc = getColAccessor(col.key)

    // Fields that come from the ticketing system (Status, and Date/Ticket/Customer) aren't editable
    // on a synced row — they're corrected on the ticket itself. Hand-added rows stay editable.
    if (col.readOnlyWhenSynced && row.ticketId) {
      return (
        <div
          className="w-full text-right px-2.5 py-2.5 text-base font-semibold uppercase select-text"
          style={{ color: /^DONE\b/i.test(String(acc.get(row)).trim()) ? '#059669' : textPrimary }}
        >
          {String(acc.get(row)).trim() || '—'}
        </div>
      )
    }

    // A closed week (or a carried-over row) is read-only: show the value as text, not an input —
    // otherwise the field still accepts typing even though nothing gets saved.
    if ((isWeekClosed || isCarryOver(row)) && col.key !== 'paymentStatus') {
      const shown = listCellText(col, row)
      return (
        <div className="w-full text-right px-2.5 py-2.5 text-base font-semibold select-text" style={{ color: shown ? textPrimary : textMuted, opacity: shown ? 1 : 0.5 }}>
          {shown || '—'}
        </div>
      )
    }

    if (col.key === 'paymentStatus') {
      const unpaid = paymentStatusOf(row) !== 'PAID'
      return (
        <select
          value={paymentStatusOf(row)}
          disabled={isWeekClosed || isCarryOver(row)}
          onChange={e => acc.set(row.id, e.target.value)}
          className="w-full text-center px-2.5 py-2.5 rounded-lg text-xs font-black tracking-wide uppercase bg-transparent border-0 outline-none cursor-pointer disabled:cursor-not-allowed appearance-none"
          style={{ color: unpaid ? '#D97706' : textPrimary, WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', textAlign: 'center', textAlignLast: 'center' }}
        >
          {PAYMENT_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }

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
    <div className="flex flex-col gap-4 pb-4 md:pb-4 h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y [&>*]:shrink-0">
      {/* Toolbar — branch, date, range, and search filters plus a sync action. */}
      <div
        className={`relative z-30 -mx-1.5 md:mx-0 rounded-none md:rounded-2xl p-2.5 md:p-3.5 overflow-visible shadow-none md:shadow-xs border border-transparent md:border-[var(--tb-border)] bg-[var(--tb-page-bg)] md:bg-[var(--tb-card-bg)] ${selectedInstaller ? 'hidden' : ''}`}
        style={{
          ['--tb-card-bg' as string]: cardBg,
          ['--tb-border' as string]: border,
          ['--tb-page-bg' as string]: isLight ? '#f1f5f9' : '#060B18',
        }}
      >
        {/* Desktop/tablet — full inline controls, unchanged */}
        <div className="hidden md:flex items-center gap-2.5">
          {/* Branch filter */}
          {canManagePayroll ? (
            <div className="relative flex-1 min-w-[130px] md:flex-none md:w-48 lg:w-52 shrink-0">
              <Building2 className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
              <select
                value={branchFilter}
                onChange={e => {
                  const newBranchId = e.target.value
                  setBranchFilter(newBranchId)
                  setSelectedInstaller(null)
                  const b = branches.find(x => x.id === newBranchId)
                  if (b) {
                    navigate(`/payouts/${normalizeSlug(b.name)}`)
                  } else {
                    navigate('/payouts')
                  }
                }}
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

          {/* Month navigator — compact pill with prev/next arrows */}
          <div className="flex items-center gap-0.5 rounded-xl border px-1 py-0.5 shrink-0" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <button
              type="button"
              onClick={() => setActiveMonth(m => prevMonth(m))}
              className="p-1 rounded-lg transition-colors hover:bg-emerald-500/15 active:scale-90"
              title="Previous month"
              style={{ color: textMuted }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-xs font-bold tracking-tight whitespace-nowrap" style={{ color: textPrimary }}>
              {formatMonth(activeMonth)}
            </span>
            <button
              type="button"
              onClick={() => setActiveMonth(m => nextMonth(m))}
              className="p-1 rounded-lg transition-colors hover:bg-emerald-500/15 active:scale-90"
              title="Next month"
              style={{ color: textMuted }}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Technician filter — narrows the roster below to one installer */}
          {branchFilter && (
            <div className="relative flex-1 min-w-[120px] md:flex-none md:w-44 lg:w-48 shrink-0">
              <Users className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
              <select
                value={technicianFilter}
                onChange={e => setTechnicianFilter(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 md:py-2 rounded-xl text-xs font-bold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all truncate"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                aria-label="Filter by Technician"
              >
                <option value="">ALL TECHNICIANS</option>
                {technicianOptions.map(name => (
                  <option key={name} value={name}>{displayInstallerName(name).toUpperCase()}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[120px] md:flex-none md:w-60 lg:w-64 shrink-0">
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
          {branchFilter && canManagePayroll && (
            <button
              type="button"
              onClick={() => void loadAndSync(true)}
              disabled={syncing || initialLoading || isWeekClosed}
              className="hidden md:flex items-center gap-2 px-3.5 py-1.5 md:py-2 rounded-xl border text-xs font-bold shrink-0 transition-all shadow-xs disabled:opacity-50 cursor-pointer hover:border-emerald-500/50 active:scale-95"
              style={
                isWeekClosed
                  ? {
                      backgroundColor: inputBg,
                      borderColor: inputBorder,
                      color: textMuted,
                      cursor: 'not-allowed',
                    }
                  : syncFailed && !syncing
                  ? {
                      backgroundColor: isLight ? 'rgba(220,38,38,0.08)' : 'rgba(248,113,113,0.14)',
                      borderColor: isLight ? '#DC262660' : '#F8717160',
                      color: isLight ? '#DC2626' : '#F87171',
                    }
                  : {
                      backgroundColor: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)',
                      borderColor: '#10B98150',
                      color: '#10B981',
                    }
              }
              title={
                isWeekClosed
                  ? 'This payout week is closed and locked — syncing is disabled'
                  : syncFailed
                  ? "Couldn't pull the latest jobs from Schedules — showing only previously saved rows, which may stop partway through the period. Click to retry."
                  : 'Sync latest completed job orders from Schedules (DONE INSTALL, DONE CLEANING, DONE CHECKUP, DONE SERVICE, etc.)'
              }
            >
              {isWeekClosed ? (
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              )}
              <span>{isWeekClosed ? 'Week Locked' : syncing ? 'Syncing…' : syncFailed ? 'Sync failed — Retry' : 'Sync Latest'}</span>
            </button>
          )}

          {/* Payroll Settings — per-branch rate presets (e.g. SILANG's cleaning fee differs
              from other branches). Only meaningful once a branch is selected. */}
          {canManagePayroll && branchFilter && (
            <button
              type="button"
              onClick={openRatesModal}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl border text-xs font-bold shrink-0 transition-all hover:border-emerald-500/50"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              title="Set this branch's payout rates"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden md:inline">Payout Settings</span>
            </button>
          )}



          {/* Week Summary Showcase button — hidden on member table view */}
          {branchFilter && canManagePayroll && !selectedInstaller && (
            <button
              type="button"
              onClick={() => setWeekSummaryOpen(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl border text-xs font-bold shrink-0 transition-all hover:border-emerald-500/50 shadow-xs cursor-pointer active:scale-95"
              style={{
                backgroundColor: isLight ? 'rgba(5,150,105,0.08)' : 'rgba(5,150,105,0.18)',
                borderColor: '#05966950',
                color: isLight ? '#059669' : '#34D399',
              }}
              title="Showcase weekly payouts summary breakdown for North or South branches"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline font-black">Week Summary</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                North / South
              </span>
            </button>
          )}
        </div>

        {/* Mobile — one compact row of icon buttons, each opening its own popover.
            Replaces the text-heavy selects/pills above, which don't fit a phone header. */}
        <div className="flex md:hidden items-center gap-2" ref={mobileToolbarRef}>
          {/* Branch */}
          {canManagePayroll ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMobilePopover('branch')}
                className="flex items-center justify-center w-9 h-9 rounded-xl border transition-all active:scale-95 shrink-0"
                style={{ backgroundColor: inputBg, borderColor: mobilePopover === 'branch' ? '#10B981' : inputBorder }}
                title="Filter by branch"
                aria-label="Filter by branch"
                aria-expanded={mobilePopover === 'branch'}
              >
                <Building2 className="w-4 h-4" style={{ color: branchFilter ? '#10B981' : textMuted }} />
              </button>
              {mobilePopover === 'branch' && (
                <div
                  className="absolute left-0 top-full mt-1.5 z-40 w-64 max-h-80 overflow-y-auto rounded-xl border shadow-lg py-1"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                >
                  {branches.filter(b => !(Boolean((b as any).isFranchise) || isFranchiseBranch(b.id) || isFranchiseBranch(b.name))).map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setBranchFilter(b.id)
                        setSelectedInstaller(null)
                        navigate(`/payouts/${normalizeSlug(b.name)}`)
                        setMobilePopover(null)
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-bold text-left"
                      style={{ color: b.id === branchFilter ? '#10B981' : textPrimary, backgroundColor: b.id === branchFilter ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)') : 'transparent' }}
                    >
                      <span className="truncate">{formatBranchName(b.name)}</span>
                      {b.id === branchFilter && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#10B981' }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl border shrink-0"
              style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              title={branches.find(b => b.id === branchFilter)?.name ? formatBranchName(branches.find(b => b.id === branchFilter)!.name) : formatBranchName(user?.branchId || 'My Branch')}
            >
              <Building2 className="w-4 h-4 text-emerald-500" />
            </div>
          )}

          {/* Period — month nav + week list combined into one popover */}
          {branchFilter && branchWeeks.length > 0 && !selectedInstaller && (
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMobilePopover('period')}
                className="flex items-center justify-center w-9 h-9 rounded-xl border transition-all active:scale-95 shrink-0"
                style={{ backgroundColor: inputBg, borderColor: mobilePopover === 'period' ? '#10B981' : inputBorder }}
                title="Select payout period"
                aria-label="Select payout period"
                aria-expanded={mobilePopover === 'period'}
              >
                <Calendar className="w-4 h-4 text-emerald-500" />
              </button>
              {mobilePopover === 'period' && (
                <div
                  className="absolute left-0 top-full mt-1.5 z-40 w-72 rounded-xl border shadow-lg overflow-hidden"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                >
                  <div className="flex items-center justify-between px-2 py-2 border-b" style={{ borderColor: border }}>
                    <button
                      type="button"
                      onClick={() => setActiveMonth(m => prevMonth(m))}
                      className="p-1.5 rounded-lg transition-colors hover:bg-emerald-500/15 active:scale-90"
                      title="Previous month"
                      style={{ color: textMuted }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-black tracking-tight" style={{ color: textPrimary }}>
                      {formatMonth(activeMonth)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveMonth(m => nextMonth(m))}
                      className="p-1.5 rounded-lg transition-colors hover:bg-emerald-500/15 active:scale-90"
                      title="Next month"
                      style={{ color: textMuted }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {branchWeeks.map(w => {
                      const isActive = activeWeek?.from === w.from && activeWeek?.to === w.to
                      const today = todayYMD()
                      const isCurrent = w.from <= today && today <= w.to
                      const isClosed = closures.some(c => c.branchId === branchFilter && c.weekFrom === w.from && c.weekTo === w.to)
                      return (
                        <button
                          key={w.from}
                          type="button"
                          onClick={() => { setActiveWeek(w); setMobilePopover(null) }}
                          className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-bold text-left"
                          style={{ color: isActive ? '#10B981' : textPrimary, backgroundColor: isActive ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)') : 'transparent' }}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {isClosed && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                            <span className="truncate">Week {w.weekNumber} · {w.label}</span>
                          </span>
                          {isCurrent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#10B981' }} />}
                        </button>
                      )
                    })}
                  </div>
                  <div
                    className="px-3.5 py-2 border-t text-[10px] font-bold uppercase tracking-widest text-center"
                    style={{ borderColor: border, color: textMuted }}
                  >
                    {cycle === 'friday' ? 'Fri - Thu cycle' : 'Mon - Sun cycle'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Technician */}
          {branchFilter && (
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMobilePopover('technician')}
                className="flex items-center justify-center w-9 h-9 rounded-xl border transition-all active:scale-95 shrink-0"
                style={{ backgroundColor: inputBg, borderColor: mobilePopover === 'technician' ? '#10B981' : (technicianFilter ? '#10B981' : inputBorder) }}
                title="Filter by technician"
                aria-label="Filter by technician"
                aria-expanded={mobilePopover === 'technician'}
              >
                <Users className="w-4 h-4" style={{ color: technicianFilter ? '#10B981' : textMuted }} />
              </button>
              {mobilePopover === 'technician' && (
                <div
                  className="absolute left-0 top-full mt-1.5 z-40 w-64 max-h-80 overflow-y-auto rounded-xl border shadow-lg py-1"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                >
                  <button
                    type="button"
                    onClick={() => { setTechnicianFilter(''); setMobilePopover(null) }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-bold text-left"
                    style={{ color: !technicianFilter ? '#10B981' : textPrimary, backgroundColor: !technicianFilter ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)') : 'transparent' }}
                  >
                    ALL TECHNICIANS
                  </button>
                  {technicianOptions.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setTechnicianFilter(name); setMobilePopover(null) }}
                      className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-bold text-left"
                      style={{ color: technicianFilter === name ? '#10B981' : textPrimary, backgroundColor: technicianFilter === name ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)') : 'transparent' }}
                    >
                      <span className="truncate">{displayInstallerName(name).toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMobilePopover('search')}
              className="flex items-center justify-center w-9 h-9 rounded-xl border transition-all active:scale-95 shrink-0"
              style={{ backgroundColor: inputBg, borderColor: mobilePopover === 'search' ? '#10B981' : (rawSearch ? '#10B981' : inputBorder) }}
              title="Search"
              aria-label="Search"
              aria-expanded={mobilePopover === 'search'}
            >
              <Search className="w-4 h-4" style={{ color: rawSearch ? '#10B981' : textMuted }} />
            </button>
            {mobilePopover === 'search' && (
              <div
                className="absolute left-0 top-full mt-1.5 z-40 w-64 rounded-xl border shadow-lg p-2"
                style={{ backgroundColor: cardBg, borderColor: border }}
              >
                <div className="relative">
                  <Search className="absolute left-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search installer..."
                    value={rawSearch}
                    onChange={e => handleSearchChange(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-2 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all border"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* More actions — Sync/Payout Settings/Week Summary */}
          {branchFilter && canManagePayroll && (
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={() => toggleMobilePopover('more')}
                className="flex items-center justify-center w-9 h-9 rounded-xl border transition-all active:scale-95 shrink-0"
                style={{
                  backgroundColor: syncFailed && !syncing ? (isLight ? 'rgba(220,38,38,0.08)' : 'rgba(248,113,113,0.14)') : inputBg,
                  borderColor: syncFailed && !syncing ? (isLight ? '#DC262660' : '#F8717160') : inputBorder,
                  color: syncFailed && !syncing ? (isLight ? '#DC2626' : '#F87171') : textPrimary,
                }}
                title="More actions"
                aria-label="More actions"
                aria-expanded={mobilePopover === 'more'}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {mobilePopover === 'more' && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-40 w-60 rounded-xl border shadow-lg overflow-hidden py-1"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                >
                  <button
                    type="button"
                    onClick={() => { void loadAndSync(true); setMobilePopover(null) }}
                    disabled={syncing || initialLoading || isWeekClosed}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-bold text-left disabled:opacity-50"
                    style={{
                      color: isWeekClosed
                        ? textMuted
                        : syncFailed && !syncing
                          ? (isLight ? '#DC2626' : '#F87171')
                          : '#10B981',
                    }}
                  >
                    {isWeekClosed ? (
                      <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : (
                      <RefreshCw className={`w-4 h-4 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
                    )}
                    <span>{isWeekClosed ? 'Week Locked' : syncing ? 'Syncing…' : syncFailed ? 'Sync failed — Retry' : 'Sync Latest'}</span>
                  </button>

                  {canManagePayroll && (
                    <button
                      type="button"
                      onClick={() => { openRatesModal(); setMobilePopover(null) }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-bold text-left"
                      style={{ color: textPrimary }}
                    >
                      <SlidersHorizontal className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Payout Settings</span>
                    </button>
                  )}

                  {!selectedInstaller && (
                    <button
                      type="button"
                      onClick={() => { setWeekSummaryOpen(true); setMobilePopover(null) }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-bold text-left"
                      style={{ color: isLight ? '#059669' : '#34D399' }}
                    >
                      <FileSpreadsheet className="w-4 h-4 shrink-0" />
                      <span>Week Summary (North / South)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Week selector — desktop/tablet pill strip. Mobile handles this inside the Period
          popover above instead (a horizontally-scrolling strip doesn't fit a phone header). */}
      {branchFilter && branchWeeks.length > 0 && !selectedInstaller && (
        <div
          className="hidden md:block px-0 py-2.5"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              {branchWeeks.map(w => {
                const isActive = activeWeek?.from === w.from && activeWeek?.to === w.to
                const today = todayYMD()
                const isCurrent = w.from <= today && today <= w.to
                const isClosed = closures.some(c => c.branchId === branchFilter && c.weekFrom === w.from && c.weekTo === w.to)
                return (
                  <button
                    key={w.from}
                    type="button"
                    onClick={() => setActiveWeek(w)}
                    className={`flex items-center gap-2 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 whitespace-nowrap border ${isClosed ? 'pl-1.5 pr-3' : 'px-3'}`}
                    style={isClosed ? {
                      // Sealed look: diagonal hatch over a cool slate tint, amber edge when selected.
                      backgroundColor: isActive ? (isLight ? '#fffbeb' : 'rgba(245,158,11,0.14)') : (isLight ? '#eef2f7' : '#0f1a2e'),
                      backgroundImage: `repeating-linear-gradient(135deg, ${isLight ? 'rgba(100,116,139,0.09)' : 'rgba(148,163,184,0.07)'} 0 6px, transparent 6px 12px)`,
                      borderColor: isActive ? '#F59E0B' : (isLight ? '#cbd5e1' : '#2a3a58'),
                      color: isActive ? '#B45309' : textMuted,
                      boxShadow: isActive ? '0 0 0 1px #F59E0B40' : 'none',
                    } : {
                      backgroundColor: isActive ? (isLight ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.2)') : inputBg,
                      borderColor: isActive ? '#10B981' : inputBorder,
                      color: isActive ? '#10B981' : textMuted,
                      boxShadow: isActive ? '0 0 0 1px #10B98140' : 'none',
                    }}
                  >
                    {isClosed && (
                      <span
                        title="Week closed & locked"
                        className="inline-flex items-center justify-center shrink-0 w-5 h-5 rounded-full"
                        style={{ backgroundColor: isActive ? '#F59E0B' : (isLight ? '#94a3b8' : '#475569') }}
                      >
                        <Lock className="w-3 h-3 text-white" strokeWidth={2.5} />
                      </span>
                    )}
                    <span className="font-black" style={{ color: isClosed ? (isActive ? '#B45309' : textPrimary) : (isActive ? '#10B981' : textPrimary) }}>
                      Week {w.weekNumber}
                    </span>
                    <span className="opacity-70">{w.label}</span>
                    {isClosed && (
                      <span
                        className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: isActive ? 'rgba(245,158,11,0.2)' : (isLight ? 'rgba(100,116,139,0.14)' : 'rgba(148,163,184,0.14)'), color: isActive ? '#B45309' : textMuted }}
                      >
                        Closed
                      </span>
                    )}
                    {isCurrent && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#10B981' }} title="Current week" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Week cycle — a plain label, not a badge. Close/Reopen controls live at the bottom
                of the installer list now (see the roster footer below). */}
            <span
              className="text-[10px] font-bold uppercase tracking-widest shrink-0"
              style={{ color: textMuted }}
              title={cycle === 'friday' ? 'North branch cycle: Fri-Thu' : 'South branch cycle: Mon-Sun'}
            >
              {cycle === 'friday' ? 'Fri - Thu' : 'Mon - Sun'}
            </span>
          </div>
        </div>
      )}
      {/* The letterhead and the roster below it read as one continuous payroll ledger — same
          document metaphor as the branch's own printed weekly sheet — so they're fused with a
          shared border/no gap whenever the roster table is actually what's rendered below. */}
      {(() => {
        const showRosterLedger = !initialLoading && !!branchFilter && grouped.length > 0 && !selectedInstaller
        return (
      <div
        className={`flex flex-col ${showRosterLedger ? 'rounded-2xl shadow-sm' : ''}`}
        style={{ gap: showRosterLedger ? 0 : '1rem', opacity: earlyView ? 0.7 : 1, transition: 'opacity 150ms' }}
        inert={earlyView}
        aria-busy={earlyView}
      >
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
              <div className="text-base font-bold tracking-tight truncate uppercase" style={{ color: textPrimary }}>
                {currentBranchDisplay ? `${currentBranchDisplay.toUpperCase()} WEEKLY PAYOUTS` : 'WEEKLY PAYOUTS'}
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
                {isWeekClosed && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md ml-1">
                    <Lock className="w-3 h-3" />
                    Locked
                  </span>
                )}
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
          <p className="text-sm font-semibold" style={{ color: textMuted }}>Select a branch to view payouts.</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <CheckCircle2 className="w-10 h-10 opacity-25 text-emerald-500" />
          <p className="text-sm font-semibold" style={{ color: textMuted }}>{viewOnly ? 'No payouts released for this week yet.' : 'No payout entries yet — try "Sync Latest".'}</p>
        </div>
      ) : selectedInstaller ? (
        // Detail view — just the selected installer's own table for the selected week.
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => handleSelectInstaller(null)}
              aria-label="Back to all installers"
              className="flex items-center justify-center gap-2 w-8 h-8 md:w-auto md:h-auto md:px-3.5 md:py-2 rounded-xl text-xs font-bold transition-all border shadow-2xs hover:border-emerald-500/50 cursor-pointer active:scale-95"
              style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
              title="Return to installers list"
            >
              <ChevronLeft className="w-4 h-4 text-emerald-500" />
              <span className="hidden md:inline">Back to All Installers</span>
            </button>
            <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 h-8 md:h-auto md:py-2 rounded-xl border text-[11px] md:text-xs font-bold shadow-2xs" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}>
              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              <span className="md:hidden">{activeWeek ? `Wk ${activeWeek.weekNumber}` : formatMonth(activeMonth)}</span>
              <span className="hidden md:inline">{activeWeek ? `Week ${activeWeek.weekNumber} (${activeWeek.label})` : formatMonth(activeMonth)}</span>
              <span className="mx-0.5 md:mx-1 text-slate-300 dark:text-slate-700">•</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                {selectedInstallerRows.length}<span className="hidden md:inline"> {selectedInstallerRows.length === 1 ? 'ticket' : 'tickets'}</span>
              </span>
            </div>
          </div>

          {(() => {
            const installerName = selectedInstaller
            const installerRows = selectedInstallerRows
            const groupVisibleColumns = visibleColumnsFor(installerName)
            // The job table/cards render only this period's own jobs; a released hold's carry-over
            // copy gets its own table below instead (see docs/payroll-hold-release-plan.md). Gross,
            // Net and roster totals still use the full installerRows (both lists) — see footer below.
            const regularRows = installerRows.filter(r => !isCarryOver(r))
            const carryRows = installerRows.filter(isCarryOver)
            // Each column is sized to its own content — the longest value (or the column's
            // total), or its header wrapped onto two lines — so nothing gets squashed or cut
            // off. Wide screens share the spare room out; narrow ones scroll sideways.
            const listTotals = groupVisibleColumns.map(col => {
              if (col.key === 'remit') return remittanceTotal(regularRows)
              if (!col.isMoney) return null
              return regularRows.reduce((sum, r) => sum + num(String(columnAccessors[col.key]?.get(r) ?? '')), 0)
            })
            const listWidths = groupVisibleColumns.map((col, i) => {
              const label = col.label.toUpperCase()
              const headW = measureText(label, LIST_HEAD_FONT, LIST_HEAD_TRACKING)
              let cellW = 0
              for (const row of regularRows) {
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
              ...(i < groupVisibleColumns.length - 1 ? { borderRight: `2px solid ${gridLine}` } : {}),
              textAlign: 'left',
              ...(listPinLeft[col.key] !== undefined ? { position: 'sticky', left: listPinLeft[col.key], zIndex: 2, backgroundColor: bg } : {}),
            })
            return (
              <div key={installerName} data-main-table={installerName} className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: cardBg, border: `2px solid ${gridLine}` }}>
                <div
                  className="flex items-center justify-between gap-2 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-3 px-3 md:px-6 py-2.5 md:py-4"
                  style={{ backgroundColor: headerBg, borderBottom: `2px solid ${gridLine}` }}
                >
                  <div className="hidden md:flex items-center gap-2 min-w-0" title="Branch">
                    <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 text-emerald-500" />
                    <span className="text-[11px] md:text-sm font-extrabold uppercase tracking-wider truncate" style={{ color: textMuted }}>
                      {currentBranchDisplay || 'Branch'}
                    </span>
                  </div>
                  <span className="order-1 md:order-none flex-1 min-w-0 text-[13px] md:text-2xl font-black uppercase tracking-wide text-left md:text-center truncate md:whitespace-nowrap" style={{ color: textPrimary }}>
                    {displayInstallerName(installerName).toUpperCase()}
                  </span>
                  <div data-html2canvas-ignore="true" className="order-2 md:order-none flex items-center gap-1.5 md:gap-2 justify-end shrink-0">
                    {/* Kept on the installer view even though the filter bar is hidden here */}
                    {canManagePayroll && (<button
                      type="button"
                      onClick={() => void loadAndSync(true)}
                      disabled={syncing || initialLoading || isWeekClosed}
                      title={isWeekClosed ? 'This payout week is closed and locked — syncing is disabled' : 'Sync latest completed job orders from Schedules'}
                      className="flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-semibold transition-colors border hover:border-emerald-500/50 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ color: '#10B981', backgroundColor: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)', borderColor: '#10B98150' }}
                    >
                      {isWeekClosed ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />}
                      <span className="hidden lg:inline">{isWeekClosed ? 'Week Locked' : syncing ? 'Syncing…' : 'Sync Latest'}</span>
                    </button>)}
                    {canManagePayroll && !isWeekClosed && (
                      <button
                        type="button"
                        onClick={() => void saveTableNow()}
                        disabled={saveStatus === 'saving'}
                        title={saveStatus === 'dirty' ? 'You have unsaved changes — click to save the whole table' : saveStatus === 'error' ? 'Last save failed — click to retry' : 'Save all table changes'}
                        className="flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-bold transition-colors border cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-wait"
                        style={saveStatus === 'dirty' || saveStatus === 'error'
                          ? { color: '#fff', backgroundColor: saveStatus === 'error' ? '#DC2626' : '#D97706', borderColor: 'transparent' }
                          : { color: '#10B981', backgroundColor: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)', borderColor: '#10B98150' }}
                      >
                        {saveStatus === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saveStatus === 'saved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                        <span className="hidden lg:inline">{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Retry Save' : saveStatus === 'dirty' ? 'Save Changes' : 'Save'}</span>
                      </button>
                    )}
                    {canManagePayroll && (
                      <button
                        type="button"
                        onClick={openRatesModal}
                        title="Set this branch's payout rates"
                        className="flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-semibold transition-colors border hover:border-emerald-500/50 cursor-pointer shadow-xs"
                        style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="hidden lg:inline">Payout Settings</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => hideEmptyColumnsFor(installerName)}
                      title="Hide all columns that have no values across all tickets for this technician"
                      className="hidden md:flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-semibold transition-colors border hover:border-emerald-500/50 cursor-pointer shadow-xs"
                      style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      <span className="hidden md:inline">Hide Empty Columns</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openColumnManager(installerName)}
                      title="Show/hide columns"
                      className="flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-semibold transition-colors border hover:border-emerald-500/50 cursor-pointer shadow-xs"
                      style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="hidden md:inline">Columns</span>
                    </button>
                    <button
                      type="button"
                      disabled={showcasePdfing}
                      onClick={() => void runPayoutPdf(installerName, false)}
                      title="Export this table (the columns currently shown) as a landscape PDF"
                      className="hidden md:flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-semibold transition-colors border hover:border-emerald-500/60 cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-wait"
                      style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      {showcasePdfing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
                      <span className="hidden lg:inline">{showcasePdfing ? 'Creating PDF…' : 'Export PDF'}</span>
                    </button>
                    {/* Showcase — full-view with copy-as-image */}
                    <button
                      type="button"
                      onClick={() => setShowcaseOpen(true)}
                      title="Showcase full tab view — copy as image"
                      className="hidden md:flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-semibold transition-colors border hover:border-emerald-500/60 cursor-pointer shadow-xs"
                      style={{ color: '#10B981', backgroundColor: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)', borderColor: 'rgba(16,185,129,0.35)' }}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Showcase</span>
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
                      .pl-row { --pl-bg: ${cardBg}; background-color: var(--pl-bg); transition: background-color 0.12s; }
                      .pl-row:hover, .pl-row:focus-visible { filter: brightness(${isLight ? '0.95' : '1.18'}); outline: none; }
                      .pl-scroll { scrollbar-width: auto; scrollbar-color: ${isLight ? '#94a3b8' : '#3b4f72'} ${headerBg}; }
                      .pl-scroll::-webkit-scrollbar { height: 16px; }
                      .pl-scroll::-webkit-scrollbar-track { background: ${headerBg}; }
                      .pl-scroll::-webkit-scrollbar-thumb { background: ${isLight ? '#94a3b8' : '#3b4f72'}; border-radius: 999px; border: 3px solid ${headerBg}; }
                      .pl-scroll::-webkit-scrollbar-thumb:hover { background: #10B981; }
                      .pl-scroll[data-scrolled="1"] .pl-pin-edge { box-shadow: 8px 0 14px -6px rgba(15,23,42,${isLight ? 0.25 : 0.7}); }
                    `}</style>
                    <div
                      ref={listScrollRef}
                      data-sc-scroll="1"
                      className="pl-scroll w-full overflow-x-auto"
                      onScroll={e => updateListEdges(e.currentTarget)}
                    >
                      <div style={{ minWidth: listMinWidth }}>
                        {/* Header */}
                        <div
                          data-sc-head="1"
                          className="grid text-[11px] font-bold uppercase tracking-wide"
                          style={{ gridTemplateColumns: listGridTemplate, borderBottom: `2px solid ${gridLine}`, color: textMuted, backgroundColor: headerBg }}
                        >
                          {groupVisibleColumns.map((col, i) => (
                            <div
                              key={col.key}
                              className={`relative px-3 py-3 flex items-center leading-tight select-none text-left ${col.key === lastListPinKey ? 'pl-pin-edge' : ''}`}
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
                              <span className="flex-1 min-w-0 overflow-hidden whitespace-nowrap text-left">{col.label}</span>
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

                        {/* Job rows — date-grouped colour bands */}
                        {(() => {
                          // Build a stable date→palette-index map from sorted unique dates
                          const uniqueDates = Array.from(new Set(regularRows.map(r => r.workDate || ''))).sort()
                          const dateColorIdx: Record<string, number> = {}
                          uniqueDates.forEach((d, i) => { dateColorIdx[d] = i % DATE_BAND_PALETTES.length })
                          // Track per-date row counter for alternating light/dark within the band
                          const dateRowCount: Record<string, number> = {}
                          return regularRows.map((row) => {
                            const dk = row.workDate || ''
                            const palette = DATE_BAND_PALETTES[dateColorIdx[dk] ?? 0]
                            const countWithinDate = dateRowCount[dk] ?? 0
                            dateRowCount[dk] = countWithinDate + 1
                            const rowBg = countWithinDate % 2 === 0 ? palette.light : palette.dark
                            return (
                          <div
                            key={row.id}
                            tabIndex={0}
                            data-sc-row="1"
                            title="Right-click to view job details · Double-click cell to edit"
                            onContextMenu={e => {
                              e.preventDefault()
                              setDetailRow(row)
                            }}
                            className="pl-row grid"
                            style={{
                              gridTemplateColumns: listGridTemplate,
                              borderBottom: `2px solid ${gridLine}`,
                              fontSize: '13px',
                              color: textPrimary,
                              backgroundColor: rowBg,
                            } as React.CSSProperties}
                          >
                            {groupVisibleColumns.map((col, i) => {
                              const text = listCellText(col, row)
                              const empty = !text || text === '—'
                              const isStatus = col.key === 'installationUpload'
                              const isDone = isStatus && /^DONE\b/i.test(text)
                              const isReadOnly = viewOnly || isWeekClosed || Boolean(col.readOnlyWhenSynced && row.ticketId)
                              const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key
                              const acc = getColAccessor(col.key)

                              const handleCellKeyDown = (e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  e.preventDefault()
                                  setEditingCell(null)
                                } else if (e.key === 'Tab') {
                                  e.preventDefault()
                                  const editableCols = (isWeekClosed || viewOnly) ? [] : groupVisibleColumns.filter(c => !(c.readOnlyWhenSynced && Boolean(row.ticketId)))
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
                                if (!isReadOnly && !isWeekClosed) {
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
                                color: textPrimary,
                                boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)',
                              }

                              // Payment status is always a live dropdown in the list — no double-click needed.
                              if (col.key === 'paymentStatus') {
                                const unpaid = paymentStatusOf(row) !== 'PAID'
                                return (
                                  <div
                                    key={col.key}
                                    className={`px-2 py-1 flex items-center justify-center min-w-0 overflow-hidden text-center ${col.key === lastListPinKey ? 'pl-pin-edge' : ''}`}
                                    style={listCellStyle(col, i, 'var(--pl-bg)')}
                                    onClick={e => e.stopPropagation()}
                                    onDoubleClick={e => e.stopPropagation()}
                                    onContextMenu={e => e.stopPropagation()}
                                  >
                                    <select
                                      value={paymentStatusOf(row)}
                                      disabled={isWeekClosed}
                                      onChange={e => acc.set(row.id, e.target.value)}
                                      title={unpaid ? 'Not fully paid — the tech is paid 50% until the ticket is paid' : 'Paid'}
                                      className="w-full text-[12px] font-black tracking-wide uppercase bg-transparent border-0 outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 appearance-none text-center"
                                      style={{
                                        color: unpaid ? '#D97706' : textPrimary,
                                        WebkitAppearance: 'none',
                                        MozAppearance: 'none',
                                        appearance: 'none',
                                        backgroundImage: 'none',
                                        textAlign: 'center',
                                        textAlignLast: 'center',
                                      }}
                                    >
                                      {PAYMENT_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                    {hasPendingBalance(row) && (
                                      <span className="ml-1 shrink-0 text-[10px] font-semibold whitespace-nowrap" style={{ color: '#D97706' }}>
                                        ₱{peso(rowTotal(row))} awaiting
                                      </span>
                                    )}
                                  </div>
                                )
                              }

                              if (isEditing) {
                                return (
                                  <div
                                    key={col.key}
                                    className={`px-1.5 py-1 flex items-center justify-start min-w-0 overflow-hidden text-left ${col.key === lastListPinKey ? 'pl-pin-edge' : ''}`}
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
                                  className={`px-3 py-3.5 flex items-center justify-start min-w-0 overflow-hidden tabular-nums text-left transition-colors select-none ${col.key === lastListPinKey ? 'pl-pin-edge' : ''} ${!isReadOnly ? 'cursor-text hover:bg-black/5' : ''}`}
                                  style={{
                                    ...listCellStyle(col, i, rowBg),
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
                                    className={`whitespace-nowrap text-left ${col.key === 'customerName' ? 'font-semibold text-xs' : isStatus ? 'font-medium' : ''}`}
                                    style={{
                                      color: empty
                                        ? textMuted
                                        : isStatus
                                          ? (isDone ? (isLight ? '#047857' : '#34D399') : (isLight ? '#b45309' : '#fbbf24'))
                                          : textPrimary,
                                      opacity: empty ? 0.45 : 1,
                                      fontWeight: col.key === 'date' ? 700 : undefined,
                                    }}
                                  >
                                    {text}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )
                          })
                        })()}

                        {regularRows.length === 0 ? (
                          <div className="px-6 py-8 text-center text-xs font-semibold" style={{ color: textMuted, borderBottom: `2px solid ${gridLine}` }}>
                            No jobs for this period.
                          </div>
                        ) : (
                          /* Totals — one sum under every money column, aligned to the grid. */
                          <div data-sc-row="1" className="grid text-[13px]" style={{ gridTemplateColumns: listGridTemplate, backgroundColor: headerBg, borderBottom: `2px solid ${gridLine}` }}>
                            {groupVisibleColumns.map((col, i) => {
                              const total = listTotals[i]
                              return (
                                <div
                                  key={col.key}
                                  className={`px-3 py-3.5 flex items-center min-w-0 overflow-hidden tabular-nums font-bold text-left ${col.key === lastListPinKey ? 'pl-pin-edge' : ''}`}
                                  style={{
                                    ...listCellStyle(col, i, headerBg),
                                    ...(col.key === 'remit' ? { backgroundColor: remitTint, color: remitAccent } : {}),
                                  }}
                                >
                                  {i === 0 ? null : total ? (
                                    <span className="whitespace-nowrap" style={{ color: col.key === 'remit' ? remitAccent : textPrimary }}>₱{peso(total)}</span>
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
                      <div data-html2canvas-ignore="true" className="absolute top-0 bottom-[14px] pointer-events-none flex items-center" style={{ left: listPinLeft[lastListPinKey ?? ''] !== undefined ? (listWidths[groupVisibleColumns.findIndex(c => c.key === lastListPinKey)] + listPinLeft[lastListPinKey!]) : 0 }}>
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
                      <div data-html2canvas-ignore="true" className="absolute top-0 right-0 bottom-[14px] pointer-events-none flex items-center justify-end">
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
                  <div className="md:hidden flex flex-col gap-2 p-2.5" style={{ backgroundColor: headerBg }}>
                    {regularRows.map(row => {
                      const expanded = expandedJobId === row.id
                      const colOf = (k: string) => COLUMN_DEFS.find(c => c.key === k)
                      const cellOf = (k: string) => { const c = colOf(k); return c ? listCellText(c, row) : '' }
                      const clean = (t: string) => (t && t !== '—' ? t : '')
                      const statusText = clean(cellOf('installationUpload'))
                      const isDoneStatus = /^DONE\b/i.test(statusText)
                      const brandText = clean(cellOf('brandCapacity'))
                      const remitText = clean(cellOf('remit'))
                      const unpaid = paymentStatusOf(row) !== 'PAID'
                      const toggle = () => setExpandedJobId(id => (id === row.id ? null : row.id))
                      return (
                        <div
                          key={row.id}
                          className="rounded-xl border overflow-hidden"
                          style={{ backgroundColor: cardBg, borderColor: expanded ? '#10B981' : border }}
                        >
                          <div className="px-3 py-2.5 flex flex-col gap-1.5 cursor-pointer" onClick={toggle}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                {row.ticketId ? (
                                  <>
                                    <div className="text-[13px] font-extrabold truncate leading-tight" style={{ color: textPrimary }}>
                                      {row.customerName || 'No customer'}
                                    </div>
                                    <div className="text-[11px] font-semibold mt-0.5" style={{ color: textMuted }}>
                                      {row.workDate ? shortDate(row.workDate) : 'No date'} &middot; {row.ticketNumber || 'No ticket'}
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      placeholder="Customer name"
                                      value={row.customerName}
                                      disabled={isWeekClosed}
                                      onChange={e => updateRow(row.id, { customerName: e.target.value })}
                                      className="text-[13px] font-extrabold bg-transparent border-0 outline-none w-full disabled:opacity-70 disabled:cursor-not-allowed"
                                      style={{ color: textPrimary }}
                                    />
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="date"
                                        value={row.workDate}
                                        disabled={isWeekClosed}
                                        onChange={e => updateRow(row.id, { workDate: e.target.value })}
                                        className="text-[11px] font-semibold bg-transparent border-0 outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                                        style={{ color: textMuted, colorScheme: isLight ? 'light' : 'dark' }}
                                      />
                                      <input
                                        type="text"
                                        placeholder="Ticket"
                                        value={row.ticketNumber}
                                        disabled={isWeekClosed}
                                        onChange={e => updateRow(row.id, { ticketNumber: e.target.value })}
                                        className="text-[11px] font-semibold bg-transparent border-0 outline-none w-20 disabled:opacity-70 disabled:cursor-not-allowed"
                                        style={{ color: textMuted }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-sm font-black tabular-nums" style={{ color: '#10B981' }}>₱{peso(rowTotal(row))}</span>
                                <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1">
                              {statusText && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                                  style={{
                                    backgroundColor: isDoneStatus ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.14)',
                                    color: isDoneStatus ? (isLight ? '#047857' : '#34D399') : (isLight ? '#b45309' : '#fbbf24'),
                                  }}
                                >
                                  {statusText}
                                </span>
                              )}
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                                style={{
                                  backgroundColor: unpaid ? 'rgba(217,119,6,0.14)' : 'rgba(16,185,129,0.12)',
                                  color: unpaid ? '#D97706' : '#10B981',
                                }}
                              >
                                {unpaid ? 'Unpaid' : 'Paid'}
                              </span>
                              {brandText && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: inputBg, color: textMuted }}>
                                  {brandText}
                                </span>
                              )}
                              {remitText && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums" style={{ backgroundColor: remitTint, color: remitAccent }}>
                                  {remitText}
                                </span>
                              )}
                            </div>
                          </div>

                          {expanded && (
                            <div className="px-3 pb-2 flex flex-col" style={{ borderTop: `1px solid ${border}` }}>
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
                          )}
                        </div>
                      )
                    })}
                  </div>

{/* Released Hold Tickets (Carried Over) — a released hold's full payout, counted
                      under Add-ons in the footer below, not inline with this period's own jobs. */}
                  {carryRows.length > 0 && (
                    <div style={{ borderTop: `1px solid ${border}` }}>
                      <div className="px-6 py-3 flex items-center gap-2" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
                        <Undo2 className="w-3.5 h-3.5 text-violet-500" />
                        <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>
                          Released Hold Tickets (Carried Over)
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.16)', color: '#8B5CF6' }}>
                          {carryRows.length}
                        </span>
                      </div>

                      {/* Desktop table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-[13px]" style={{ color: textPrimary }}>
                          <thead>
                            <tr className="text-[11px] font-bold uppercase tracking-wide" style={{ color: textMuted, backgroundColor: cardBg }}>
                              <th className="px-6 py-2 text-left" style={{ borderBottom: `1px solid ${border}` }}>Date</th>
                              <th className="px-3 py-2 text-left" style={{ borderBottom: `1px solid ${border}` }}>Ticket</th>
                              <th className="px-3 py-2 text-left" style={{ borderBottom: `1px solid ${border}` }}>Customer</th>
                              <th className="px-3 py-2 text-left" style={{ borderBottom: `1px solid ${border}` }}>Released From</th>
                              <th className="px-3 py-2 text-left" style={{ borderBottom: `1px solid ${border}` }}>Note / Approver</th>
                              <th className="px-3 py-2 text-right" style={{ borderBottom: `1px solid ${border}` }}>Payout</th>
                              <th className="px-6 py-2 text-right" style={{ borderBottom: `1px solid ${border}` }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {carryRows.map((row, idx) => {
                              const undoKey = row.customFields?.['hold:copyMarker'] || row.id
                              const fromLabel = row.customFields?.['hold:originWeekFrom'] && row.customFields?.['hold:originWeekTo']
                                ? `${shortDate(row.customFields['hold:originWeekFrom'])} – ${shortDate(row.customFields['hold:originWeekTo'])}`
                                : '—'
                              return (
                                <tr key={row.id} className={idx % 2 === 1 ? '' : ''} style={{ backgroundColor: idx % 2 === 1 ? zebraBg : cardBg }}>
                                  <td className="px-6 py-2.5">{row.workDate ? shortDate(row.workDate) : '—'}</td>
                                  <td className="px-3 py-2.5">{row.ticketNumber || '—'}</td>
                                  <td className="px-3 py-2.5 font-semibold">{row.customerName || '—'}</td>
                                  <td className="px-3 py-2.5">
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.14)', color: '#8B5CF6' }}>
                                      {row.customFields?.['pay:adjust'] === '1' ? 'Adjustment' : `Week of ${fromLabel}`}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 max-w-[220px] truncate" style={{ color: textMuted }} title={row.customFields?.['hold:approvalNote'] || ''}>
                                    {row.customFields?.['hold:approvalNote'] || '—'}
                                    {row.customFields?.['pay:adjSummary'] && (
                                      <span className="block text-[10px] font-semibold" style={{ color: '#8B5CF6' }}>{row.customFields['pay:adjSummary']}</span>
                                    )}
                                    {row.customFields?.['hold:releasedBy'] && (
                                      <span className="block text-[10px] font-semibold opacity-70">by {formatPersonName(row.customFields['hold:releasedBy'])}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{pesoSigned(rowTotal(row))}</td>
                                  <td className="px-6 py-2.5 text-right">
                                    {canManagePayroll && !isWeekClosed && (
                                      <button
                                        type="button"
                                        onClick={() => void submitUndoRelease(row)}
                                        disabled={undoingRowKey === undoKey}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors hover:border-rose-500/50 hover:text-rose-500 disabled:opacity-50 cursor-pointer"
                                        style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
                                      >
                                        <Undo2 className="w-3 h-3" />
                                        {undoingRowKey === undoKey ? 'Undoing…' : row.customFields?.['pay:adjust'] === '1' ? 'Undo adjustment' : 'Undo release'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile cards */}
                      <div className="md:hidden flex flex-col gap-2 p-3" style={{ backgroundColor: headerBg }}>
                        {carryRows.map(row => {
                          const undoKey = row.customFields?.['hold:copyMarker'] || row.id
                          const fromLabel = row.customFields?.['hold:originWeekFrom'] && row.customFields?.['hold:originWeekTo']
                            ? `${shortDate(row.customFields['hold:originWeekFrom'])} – ${shortDate(row.customFields['hold:originWeekTo'])}`
                            : '—'
                          return (
                            <div key={row.id} className="rounded-xl border p-3 flex flex-col gap-1.5" style={{ backgroundColor: cardBg, borderColor: border }}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-extrabold truncate" style={{ color: textPrimary }}>{row.customerName || 'No customer'}</span>
                                <span className="font-bold tabular-nums shrink-0" style={{ color: textPrimary }}>{pesoSigned(rowTotal(row))}</span>
                              </div>
                              <div className="text-[11px] font-semibold" style={{ color: textMuted }}>
                                {row.workDate ? shortDate(row.workDate) : 'No date'} &middot; {row.ticketNumber || 'No ticket'}
                              </div>
                              <span className="self-start px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.14)', color: '#8B5CF6' }}>
                                {row.customFields?.['pay:adjust'] === '1' ? `Adjustment · ${row.customFields['pay:adjSummary'] || ''}` : `Released from week of ${fromLabel}`}
                              </span>
                              {row.customFields?.['hold:approvalNote'] && (
                                <span className="text-[11px]" style={{ color: textMuted }}>{row.customFields['hold:approvalNote']}</span>
                              )}
                              {canManagePayroll && !isWeekClosed && (
                                <button
                                  type="button"
                                  onClick={() => void submitUndoRelease(row)}
                                  disabled={undoingRowKey === undoKey}
                                  className="self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors hover:border-rose-500/50 hover:text-rose-500 disabled:opacity-50 cursor-pointer mt-1"
                                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
                                >
                                  <Undo2 className="w-3 h-3" />
                                  {undoingRowKey === undoKey ? 'Undoing…' : 'Undo release'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Jobs tab footer: Deductions summary with button on the left, Net payroll summary on the right */}
                  {(() => {
                    const gross = installerTotal(installerRows)
                    const base = baseInstallTotal(installerRows)
                    const awaitingPayment = installerRows.filter(hasPendingBalance).reduce((sum, r) => sum + rowTotal(r), 0)
                    const totalDeduction = deductionTotal(installerRows)
                    const net = gross - totalDeduction
                    const dedRed = isLight ? '#DC2626' : '#F87171'
                    return (
                      <div className="flex flex-col lg:flex-row items-stretch" style={{ backgroundColor: headerBg, borderTop: `1px solid ${border}` }}>
                        {/* Deductions & Actions footer buttons — clean buttons, no icons, rich background colors */}
                        <div className="flex-1 min-w-0 px-5 md:px-6 py-4 flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setDeductionsModalInstaller(installerName)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                            style={{
                              backgroundColor: totalDeduction > 0 ? (isLight ? '#F59E0B' : '#D97706') : (isLight ? '#FEF3C7' : '#78350F40'),
                              color: totalDeduction > 0 ? '#FFFFFF' : (isLight ? '#92400E' : '#FDE68A'),
                              border: totalDeduction > 0 ? '1px solid #D97706' : (isLight ? '1px solid #FCD34D' : '1px solid #92400E'),
                            }}
                          >
                            <span>View Deductions</span>
                            {totalDeduction > 0 && (
                              <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-md bg-black/20 text-white">
                                −₱{peso(totalDeduction)}
                              </span>
                            )}
                          </button>

                          {canManagePayroll && (() => {
                            const installerHeldCount = heldTickets.filter(h => resolveGroupKey(h.row.installerName) === resolveGroupKey(installerName)).length
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setHeldInstallerFilter(resolveGroupKey(installerName))
                                  setHeldTicketsOpen(true)
                                  void refreshHeldTickets()
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                                style={{
                                  backgroundColor: installerHeldCount > 0 ? (isLight ? '#EA580C' : '#C2410C') : (isLight ? '#F1F5F9' : '#1E293B'),
                                  color: installerHeldCount > 0 ? '#FFFFFF' : (isLight ? '#475569' : '#94A3B8'),
                                  border: installerHeldCount > 0 ? '1px solid #C2410C' : (isLight ? '1px solid #CBD5E1' : '1px solid #334155'),
                                }}
                                title={`View held tickets for ${displayInstallerName(installerName)}`}
                              >
                                <span>Held Tickets ({installerHeldCount})</span>
                              </button>
                            )
                          })()}
                        </div>

                        {/* Net payroll — compact single counter summary, avoids duplicate counters if identical */}
                        <div className="lg:w-72 shrink-0 px-4 py-3 flex flex-col gap-2 border-t lg:border-t-0 lg:border-l" style={{ borderColor: border }}>
                          {(totalDeduction > 0 || awaitingPayment > 0 || (gross !== net && totalDeduction > 0)) && (
                            <div className="flex flex-col gap-1 text-xs">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: textMuted }}>Gross Labor</span>
                                <span className="font-bold tabular-nums" style={{ color: textPrimary }}>₱{peso(gross)}</span>
                              </div>
                              {awaitingPayment > 0 && (
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: '#D97706' }}>Awaiting Payment</span>
                                  <span className="font-bold tabular-nums" style={{ color: '#D97706' }}>₱{peso(awaitingPayment)}</span>
                                </div>
                              )}
                              {totalDeduction > 0 && (
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: textMuted }}>Total Deduction</span>
                                  <span className="font-bold tabular-nums" style={{ color: dedRed }}>
                                    −₱{peso(totalDeduction)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          <div
                            className="rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                            style={{ backgroundColor: isLight ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.40)' }}
                          >
                            <div className="flex flex-col">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: isLight ? '#047857' : '#34D399' }}>Net Payout</span>
                              {gross !== base && totalDeduction === 0 && awaitingPayment === 0 && (
                                <span className="text-[10px] font-semibold" style={{ color: isLight ? '#059669' : '#6EE7B7' }}>
                                  Base ₱{peso(base)} · Add-ons ₱{peso(gross - base)}
                                </span>
                              )}
                            </div>
                            <span className="text-lg font-black tabular-nums" style={{ color: net < 0 ? dedRed : (isLight ? '#047857' : '#34D399') }}>
                              {net < 0 ? '−' : ''}₱{peso(Math.abs(net))}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
              </div>
            )
          })()}
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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-right opacity-70" style={{ color: textMuted }}>Payout Amount</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-center opacity-70" style={{ color: textMuted }}>Payout Status</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70" style={{ color: textMuted }}>Remarks</span>
          </div>

          {/* Data rows — hairline dividers, no per-row cards/shadows, just a row-hover tint */}
          {grouped.map(([installerName, installerRows], rowIndex) => {
            // Net of this period's deductions (Late / Loan / Uniform …) — what the installer takes home.
            const total = installerNet(installerRows)
            const isComplete = installerRows.length > 0 && installerRows.every(r => r.status === 'COMPLETE')
            // A carry-over copy keeps its ORIGIN's (older) workDate, so it can sort first in the
            // period — never read the period's own remarks/audited off of it (same landmine as
            // setDeduction above; see docs/payroll-hold-release-plan.md).
            const summaryRow = installerRows.find(r => !isCarryOver(r)) ?? installerRows[0]
            const summaryRemarks = summaryRow?.remarks || ''
            const summaryAudited = summaryRow?.audited || ''
            return (
              <div
                key={installerName}
                role="button"
                tabIndex={0}
                title={`Open ${displayInstallerName(installerName).toUpperCase()}'s payout`}
                onClick={() => handleSelectInstaller(installerName)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSelectInstaller(installerName)
                  }
                }}
                className="grid grid-cols-[minmax(0,1fr)_auto] md:[grid-template-columns:var(--roster-cols)] items-center gap-x-3 md:gap-x-4 gap-y-2 md:gap-y-3 px-4 md:px-7 py-3.5 md:py-6 transition-colors cursor-pointer"
                style={{
                  ['--roster-cols' as string]: ROSTER_GRID_TEMPLATE,
                  borderTop: rowIndex === 0 ? 'none' : `1px solid ${border}`,
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = isLight ? '#f8fafc' : '#0d1520' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                    {/* 1. INSTALLER — name, with completed-jobs count/breakdown folded into a subtitle */}
                    <div className="flex items-center gap-3 md:gap-3.5 min-w-0">
                      <div
                        className="w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: avatarColor(installerName) }}
                      >
                        {getInitials(displayInstallerName(installerName))}
                      </div>
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <span className="text-sm md:text-base font-bold truncate uppercase tracking-tight" style={{ color: textPrimary }}>
                          {displayInstallerName(installerName).toUpperCase()}
                        </span>
                        <span className="text-[11px] font-semibold truncate" style={{ color: textMuted }} title={completedJobsBreakdown(installerRows) || undefined}>
                          <span className="tabular-nums" style={{ color: textPrimary }}>{completedJobsCount(installerRows)}</span> completed
                          {completedJobsBreakdown(installerRows) ? ` · ${completedJobsBreakdown(installerRows)}` : ''}
                        </span>
                      </div>
                    </div>

                    {/* 2. PAYROLL AMOUNT — negative when deductions outweigh the period's gross
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

                    {/* 3. STATUS — A clean confirmation button instead of a dropdown.
                        Clicking opens the confirmation & validation popup. */}
                    <div className="order-4 md:order-none flex flex-col items-end md:items-center justify-center gap-1">
                      {isComplete ? (
                        <button
                          type="button"
                          disabled={isWeekClosed}
                          onClick={e => {
                            e.stopPropagation()
                            setCompleteModalFor(installerName)
                            setCompleteRemarks(summaryRemarks)
                          }}
                          title={`Completed & finalized by ${titleCase(summaryAudited || userDisplayName || userFirstName)}. Click to view validation details.`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-150 shadow-xs cursor-pointer active:scale-95 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                          style={{
                            color: isLight ? '#065F46' : '#34D399',
                            backgroundColor: isLight ? '#D1FAE5' : 'rgba(16, 185, 129, 0.16)',
                            border: `1px solid ${isLight ? '#6EE7B7' : 'rgba(16, 185, 129, 0.35)'}`,
                          }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>Completed</span>
                          <Lock className="w-2.5 h-2.5 shrink-0 opacity-70 ml-0.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isWeekClosed}
                          onClick={e => {
                            e.stopPropagation()
                            setCompleteModalFor(installerName)
                            setCompleteRemarks(summaryRemarks)
                          }}
                          title="Click to validate and finalize payout as Completed"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-150 shadow-xs cursor-pointer active:scale-95 hover:scale-102 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            color: '#D97706',
                            backgroundColor: isLight ? '#FEF3C7' : 'rgba(217, 119, 6, 0.15)',
                            border: `1px solid ${isLight ? '#FCD34D' : 'rgba(217, 119, 6, 0.35)'}`,
                          }}
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                          <span>Pending</span>
                        </button>
                      )}
                      {isComplete && summaryAudited && (
                        <span
                          className="text-[10px] font-semibold truncate max-w-[130px] opacity-80"
                          style={{ color: textMuted }}
                          title={`Audited by ${summaryAudited}`}
                        >
                          by {summaryAudited}
                        </span>
                      )}
                    </div>

                    {/* 4. REMARKS — wide column, click to edit inline instead of a truncated
                        sliver inside the status badge. */}
                    <div className="order-3 md:order-none min-w-0 flex items-center" onClick={e => e.stopPropagation()}>
                      {editingRemarksFor === installerName ? (
                        <textarea
                          autoFocus
                          rows={2}
                          value={remarksDraft}
                          onChange={e => setRemarksDraft(e.target.value.toUpperCase())}
                          onBlur={() => {
                            updateInstallerRows(installerName, { remarks: remarksDraft.trim() })
                            setEditingRemarksFor(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              ;(e.target as HTMLTextAreaElement).blur()
                            } else if (e.key === 'Escape') {
                              setEditingRemarksFor(null)
                            }
                          }}
                          className="w-full text-xs font-medium leading-snug bg-transparent border rounded-lg px-2.5 py-1.5 outline-none resize-none focus:ring-2 focus:ring-emerald-500/40"
                          style={{ color: textPrimary, borderColor: inputBorder, backgroundColor: inputBg }}
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={isWeekClosed || viewOnly}
                          onClick={() => { setRemarksDraft(summaryRemarks); setEditingRemarksFor(installerName) }}
                          className="w-full text-left rounded-lg px-2.5 py-1 md:py-1.5 -mx-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-text disabled:cursor-default disabled:hover:bg-transparent"
                          title={viewOnly ? (summaryRemarks || undefined) : (summaryRemarks || 'Click to add a remark')}
                        >
                          {summaryRemarks ? (
                            <span className="text-xs font-medium leading-snug line-clamp-2 block" style={{ color: textPrimary }}>
                              {summaryRemarks}
                            </span>
                          ) : !viewOnly ? (
                            <span className="text-xs italic" style={{ color: textMuted, opacity: 0.6 }}>Click to add a remark</span>
                          ) : null}
                        </button>
                      )}
                    </div>
              </div>
            )
          })}

          {/* Totals footer */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 md:gap-4 px-4 md:px-7 py-4 md:py-5"
            style={{ backgroundColor: isLight ? '#f8fafc' : '#0d1520', borderTop: `1px solid ${border}` }}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              {branchFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setHeldInstallerFilter('')
                    setHeldTicketsOpen(true)
                    void refreshHeldTickets()
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                  style={{
                    backgroundColor: (heldTickets.length + balanceTickets.length) > 0 ? (isLight ? '#EA580C' : '#C2410C') : (isLight ? '#F1F5F9' : '#1E293B'),
                    color: (heldTickets.length + balanceTickets.length) > 0 ? '#FFFFFF' : (isLight ? '#475569' : '#94A3B8'),
                    border: (heldTickets.length + balanceTickets.length) > 0 ? '1px solid #C2410C' : (isLight ? '1px solid #CBD5E1' : '1px solid #334155'),
                  }}
                  title="View every job currently on hold across this branch"
                >
                  <span>Held Tickets ({heldTickets.length + balanceTickets.length})</span>
                </button>
              )}

              {branchFilter && (
                <button
                  type="button"
                  onClick={() => { setCorrectionsSearch(''); setCorrectionsOpen(true); void refreshCorrections() }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all shadow-xs active:scale-95 cursor-pointer"
                  style={{ color: isLight ? '#475569' : '#94A3B8', borderColor: isLight ? '#CBD5E1' : '#334155', backgroundColor: isLight ? '#F1F5F9' : '#1E293B' }}
                  title="Who corrected which ticket amounts after a week closed"
                >
                  <span>Corrections ({corrections.reduce((n, c) => n + parseAdjustmentLog(c.row).length, 0)})</span>
                </button>
              )}

              {/* Close/Reopen this week — moved down here, out of the week-tab strip, and
                  labeled with the branch so it's unambiguous which payout period it locks. */}
              {canManageClosures && activeWeek && (
                isWeekClosed ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      title={activeWeekClosure?.closedBy ? `Closed by ${activeWeekClosure.closedBy}${activeWeekClosure.closedAt ? ` on ${new Date(activeWeekClosure.closedAt).toLocaleDateString()}` : ''}` : 'Week is closed & locked'}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Week Closed</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleReopenWeek}
                      disabled={reopeningWeek}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-emerald-500/10 hover:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 active:scale-95 cursor-pointer disabled:opacity-50 shadow-xs"
                      title="Reopen this week for edits"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>{reopeningWeek ? 'Reopening…' : `Reopen This Week — ${currentBranchDisplay || 'Branch'} Payouts`}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCloseWeek}
                    disabled={closingWeek}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-amber-500/10 hover:border-amber-500/40 text-amber-600 dark:text-amber-400 border-amber-500/30 active:scale-95 cursor-pointer disabled:opacity-50 shadow-xs"
                    title="Close and lock this payout week"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{closingWeek ? 'Closing…' : `Close This Week — ${currentBranchDisplay || 'Branch'} Payouts`}</span>
                  </button>
                )
              )}
            </div>
            <div className="grid grid-cols-2 w-full gap-x-4 gap-y-3 md:flex md:flex-wrap md:items-center md:justify-end md:gap-x-9 md:gap-y-2 md:ml-auto md:w-auto">
              {([
                { label: 'Remittance Collected', value: globalRemittanceTotal, color: remitAccent },
                { label: 'Base Install Total', value: globalBaseInstallTotal, color: textPrimary },
                { label: 'Total Add-on Pay', value: globalAddOnTotal, color: textPrimary },
                { label: 'Total Deductions', value: globalDeductionTotal, color: globalDeductionTotal > 0 ? (isLight ? '#DC2626' : '#F87171') : textPrimary },
                { label: 'Net Payout Due', value: grandTotal - globalDeductionTotal, color: '#10B981' },
              ] as const).filter(tile => canManagePayroll || tile.label !== 'Remittance Collected').map(tile => (
                <div key={tile.label} className="flex flex-col items-start md:items-end">
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
        const activeInstallerRows = grouped.find(([name]) => name === columnManagerFor)?.[1] || []
        const allToggleableCols = [
          ...COLUMN_DEFS.filter(c => !c.pinned),
          ...customColumnDefs.map(c => ({ key: c.key, label: c.label, pinned: false, category: 'admin' as ColumnCategory })),
        ]
        const totalVisible = allToggleableCols.filter(c => !hidden.has(c.key)).length
        const totalToggleable = allToggleableCols.length

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
                  {displayInstallerName(columnManagerFor).toUpperCase()} &mdash; <span style={{ color: '#10B981' }}>{totalVisible}</span>/{totalToggleable} visible
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
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all hover:border-emerald-500/60 hover:text-emerald-500 cursor-pointer"
                    style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => columnManagerFor && hideEmptyColumnsFor(columnManagerFor)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all hover:border-emerald-500/60 hover:text-emerald-500 flex items-center gap-1.5 cursor-pointer"
                  style={{ color: '#10B981', backgroundColor: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)', borderColor: '#10B98150' }}
                  title="Automatically hide any columns that have zero/empty values across all tickets for this installer"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>Hide Empty Columns</span>
                </button>
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
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all hover:border-emerald-500/60 cursor-pointer"
                style={{ color: '#10B981', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.10)', borderColor: isLight ? '#a7f3d0' : 'rgba(16,185,129,0.25)' }}
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set(allToggleableCols.map(c => c.key)) }))}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all hover:border-red-400/50 hover:text-red-400 cursor-pointer"
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
                  const visibleCount = cols.filter(c => !hidden.has(c.key)).length
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
                            cols.forEach(c => newHidden.add(c.key))
                          } else {
                            cols.forEach(c => newHidden.delete(c.key))
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
                          const on = !hidden.has(col.key)
                          const empty = isColumnEmpty(col.key, activeInstallerRows)
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
                                  onChange={() => toggleColumn(col.key)}
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
                              {empty && (
                                <span
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase opacity-60"
                                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#0d1520', color: textMuted }}
                                >
                                  No inputs
                                </span>
                              )}
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
                  customColumnDefs.map((cc, idx) => {
                    const on = !hidden.has(cc.key)
                    const empty = isColumnEmpty(cc.key, activeInstallerRows)
                    return (
                      <div
                        key={cc.key}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors col-mgr-row"
                        style={{ borderTop: idx > 0 ? `1px solid ${border}` : 'none', backgroundColor: cardBg }}
                      >
                        <span className="col-toggle">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleColumn(cc.key)}
                          />
                          <span className="col-toggle-track" />
                          <span className="col-toggle-thumb" />
                        </span>
                        <span className="text-xs font-bold flex-1 truncate" style={{ color: on ? textPrimary : textMuted }}>{cc.label}</span>
                        {empty && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase opacity-60 shrink-0"
                            style={{ backgroundColor: isLight ? '#f1f5f9' : '#0d1520', color: textMuted }}
                          >
                            No inputs
                          </span>
                        )}
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
                          className="p-1.5 rounded-lg hover:bg-red-500/15 transition-colors shrink-0 cursor-pointer"
                          title={`Delete "${cc.label}" from all installer tables`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    )
                  })
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
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
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
            ...COLUMN_DEFS.filter(c => !['date', 'ticketNumber', 'customerName', 'brandCapacity', 'paymentStatus'].includes(c.key)),
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

          const unpaid = payFactor(liveRow) !== 1 && !isCarryOver(liveRow)
          const payAcc = getColAccessor('paymentStatus')
          const jobStatus = (liveRow.installationUpload || '').trim()
          const addOnItems = activeFeeItems.filter(i => !i.isBase)
          const closePopup = () => { setDetailRow(null); setPopupCategory('all'); setPopupSearch('') }
          const actionBtn = 'w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer'

          return (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
              <div
                className="w-full max-w-5xl max-h-[92vh] md:h-[82vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
                style={{ backgroundColor: cardBg, borderColor: border }}
              >
                {/* Header — who / what, at a glance */}
                <div className="flex items-start justify-between gap-4 px-6 py-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
                  {liveRow.ticketId ? (
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                        <span className="text-3xl font-black tracking-tight tabular-nums text-emerald-500 leading-none">
                          {liveRow.ticketNumber || 'No ticket'}
                        </span>
                        <span className="text-2xl font-extrabold leading-tight break-words" style={{ color: textPrimary }}>
                          {liveRow.customerName || 'No customer'}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ color: textMuted }}>
                        {[
                          liveRow.workDate ? shortDate(liveRow.workDate) : 'No date',
                          liveRow.brandCapacity,
                          jobStatus,
                        ].filter(Boolean).map((part, idx) => (
                          <span key={idx} className="flex items-center gap-2">
                            {idx > 0 && <span className="opacity-40">•</span>}
                            <span>{part}</span>
                          </span>
                        ))}
                        <span className="opacity-40">•</span>
                        <span className="font-bold text-emerald-500">{displayInstallerName(liveRow.installerName)}</span>
                      </div>
                      {liveRow.customFields?.['xfer:fromBranch'] && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <ArrowRightLeft className="w-3 h-3" style={{ color: '#8B5CF6' }} />
                          <span className="text-[11px] font-bold" style={{ color: '#8B5CF6' }}>
                            Transferred from {liveRow.customFields['xfer:fromBranch']}
                            {liveRow.customFields['xfer:transferredAt']
                              ? ` · ${new Date(liveRow.customFields['xfer:transferredAt']).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
                              : ''}
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
                        disabled={isWeekClosed}
                        onChange={e => updateRow(liveRow.id, { customerName: e.target.value })}
                        className="text-xl font-extrabold bg-transparent border-0 outline-none w-full disabled:cursor-not-allowed"
                        style={{ color: textPrimary }}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={liveRow.workDate || ''}
                          disabled={isWeekClosed}
                          onChange={e => updateRow(liveRow.id, { workDate: e.target.value })}
                          className="text-sm font-semibold bg-transparent border-0 outline-none disabled:cursor-not-allowed"
                          style={{ color: textMuted }}
                        />
                        <input
                          type="text"
                          placeholder="Ticket"
                          value={liveRow.ticketNumber}
                          disabled={isWeekClosed}
                          onChange={e => updateRow(liveRow.id, { ticketNumber: e.target.value })}
                          className="text-sm font-semibold bg-transparent border-0 outline-none w-28 disabled:cursor-not-allowed"
                          style={{ color: textMuted }}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={closePopup}
                    className="p-2.5 rounded-full shrink-0 transition-all border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white active:scale-90"
                    style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>

                {/* Body: fields on the left, payout summary + actions on the right */}
                <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px]">
                  {/* Payout summary + actions */}
                  <aside
                    className="order-first md:order-2 md:overflow-y-auto flex flex-col gap-4 p-5 border-b md:border-b-0 md:border-l"
                    style={{ backgroundColor: headerBg, borderColor: border }}
                  >
                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        backgroundColor: unpaid ? (isLight ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)') : (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)'),
                        borderColor: unpaid ? 'rgba(245,158,11,0.35)' : 'rgba(16,185,129,0.35)',
                      }}
                    >
                      <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: unpaid ? '#D97706' : '#059669' }}>
                        {unpaid ? 'Payout this week (50%)' : 'Total payout'}
                      </div>
                      <div className="text-3xl font-black tabular-nums leading-tight mt-0.5" style={{ color: unpaid ? '#D97706' : '#10B981' }}>
                        ₱{peso(rowGrandTotal)}
                      </div>
                      {unpaid && (
                        <div className="mt-2 pt-2 flex items-center justify-between text-xs font-semibold" style={{ borderTop: '1px dashed rgba(245,158,11,0.4)', color: '#D97706' }}>
                          <span>Awaiting collection</span>
                          <span className="tabular-nums font-bold">₱{peso(rowGrandTotal)}</span>
                        </div>
                      )}
                    </div>

                    {/* Payment status */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Customer payment</span>
                      <select
                        value={paymentStatusOf(liveRow)}
                        disabled={isWeekClosed || isCarryOver(liveRow)}
                        onChange={e => payAcc.set(liveRow.id, e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm font-bold outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                        style={{ backgroundColor: cardBg, borderColor: unpaid ? 'rgba(245,158,11,0.5)' : inputBorder, color: unpaid ? '#D97706' : '#10B981' }}
                      >
                        {PAYMENT_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {unpaid && (
                        <span className="text-[11px] leading-relaxed" style={{ color: textMuted }}>
                          50% payout credited now. The remaining 50% balance will be released once fully collected.
                        </span>
                      )}
                    </div>

                    {/* Fee breakdown */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Breakdown</span>
                      <div className="rounded-xl border overflow-hidden text-xs" style={{ borderColor: border, backgroundColor: cardBg }}>
                        <div className="flex items-center justify-between px-3 py-2 font-bold" style={{ color: textPrimary }}>
                          <span>Base install</span>
                          <span className="tabular-nums">₱{peso(baseFee)}</span>
                        </div>
                        {addOnItems.map(item => (
                          <div key={item.key} className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: `1px solid ${border}`, color: textMuted }}>
                            <span className="truncate pr-2">{item.label}</span>
                            <span className="tabular-nums font-semibold" style={{ color: textPrimary }}>₱{peso(item.amount)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 py-2 font-bold" style={{ borderTop: `1px solid ${border}`, backgroundColor: headerBg, color: textPrimary }}>
                          <span>Add-ons ({addOnItems.length})</span>
                          <span className="tabular-nums" style={{ color: addOns > 0 ? '#059669' : textPrimary }}>₱{peso(addOns)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 mt-auto">
                      {canManagePayroll && !isWeekClosed && !isCarryOver(liveRow) && (
                        <button
                          type="button"
                          onClick={() => { setDetailRow(null); setHoldModalRow(liveRow); }}
                          className={`${actionBtn} hover:bg-amber-500/10 hover:border-amber-500/50`}
                          style={{ color: '#D97706', borderColor: isLight ? '#fde68a' : 'rgba(217,119,6,0.35)', backgroundColor: isLight ? '#fffbeb' : 'rgba(217,119,6,0.08)' }}
                          title="Carry this payout to a later week"
                        >
                          <PauseCircle className="w-4 h-4" />
                          <span>Hold Payout</span>
                        </button>
                      )}
                      {canManagePayroll && isWeekClosed && !isCarryOver(liveRow) && (
                        <button
                          type="button"
                          onClick={() => { setDetailRow(null); openAdjustModal(liveRow) }}
                          className={`${actionBtn} hover:bg-violet-500/10 hover:border-violet-500/50`}
                          style={{ color: '#8B5CF6', borderColor: isLight ? '#ddd6fe' : 'rgba(139,92,246,0.35)', backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.08)' }}
                          title="Correct this ticket's amounts — the difference is added or deducted in an open week"
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                          <span>Adjust Balance</span>
                        </button>
                      )}
                      {parseAdjustmentLog(liveRow).length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setDetailRow(null); setCorrectionsSearch(liveRow.ticketNumber || ''); setCorrectionsOpen(true) }}
                          className={`${actionBtn} hover:bg-violet-500/10`}
                          style={{ color: '#8B5CF6', borderColor: isLight ? '#ddd6fe' : 'rgba(139,92,246,0.35)', backgroundColor: 'transparent' }}
                        >
                          <span>Correction history ({parseAdjustmentLog(liveRow).length})</span>
                        </button>
                      )}
                      {(liveRow.ticketId || liveRow.ticketNumber) && (
                        <button
                          type="button"
                          disabled={loadingTicketModal}
                          onClick={() => void handleOpenTicketModal(liveRow)}
                          className={`${actionBtn} hover:bg-emerald-500/10 hover:border-emerald-500/50 disabled:opacity-50`}
                          style={{ color: '#10B981', borderColor: isLight ? '#a7f3d0' : 'rgba(16,185,129,0.35)', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.08)' }}
                        >
                          {loadingTicketModal ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                          <span>{loadingTicketModal ? 'Loading Ticket…' : 'View Ticket'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={closePopup}
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer text-white"
                        style={{ backgroundColor: isLight ? '#0f172a' : '#334155' }}
                      >
                        Done
                      </button>
                    </div>
                  </aside>

                  {/* Fields */}
                  <section className="order-last md:order-1 min-w-0 flex flex-col md:min-h-0">
                    <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-2 border-b shrink-0 text-xs" style={{ borderColor: border }}>
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
                            className="px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] whitespace-nowrap cursor-pointer"
                            style={{
                              backgroundColor: popupCategory === tab.id ? (isLight ? '#10B981' : '#059669') : (isLight ? '#f1f5f9' : '#111d33'),
                              color: popupCategory === tab.id ? '#ffffff' : (tab.badgeColor || textMuted),
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <div className="relative w-44 shrink-0">
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

                    <div className="md:flex-1 md:overflow-y-auto px-6 py-1">
                      {filteredCols.length === 0 ? (
                        <div className="py-12 text-center text-xs font-semibold" style={{ color: textMuted }}>No fields match the selected filter.</div>
                      ) : (
                        filteredCols.map(col => {
                          const curVal = getColAccessor(col.key).get(liveRow)
                          const isMoneyVal = col.isMoney && num(curVal) > 0
                          return (
                            <div
                              key={col.key}
                              className="flex items-center justify-between gap-4 py-2.5"
                              style={{ borderBottom: `1px solid ${border}`, backgroundColor: isMoneyVal ? (isLight ? 'rgba(16,185,129,0.04)' : 'rgba(16,185,129,0.06)') : undefined }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-bold uppercase tracking-wide truncate" style={{ color: col.key === 'remit' ? remitAccent : textPrimary }}>
                                  {col.label}
                                </span>
                                {col.category && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider hidden lg:inline" style={{ backgroundColor: isLight ? '#f1f5f9' : '#111d33', color: textMuted }}>
                                    {col.category}
                                  </span>
                                )}
                              </div>
                              <div className="max-w-[55%] flex-1">{renderMobileCellValue(col, liveRow)}</div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </section>
                </div>
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
                          Payout Rate Settings
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
              disabled={!canManagePayroll || isWeekClosed}
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
            { label: 'Grooming', amount: moneyField('grooming', deductionValue(installerRows, 'grooming')), remarks: remark('Haircut, uniform cleanliness, etc.') },
            { label: 'Backjob', amount: moneyField('backjob', deductionValue(installerRows, 'backjob')), remarks: remark('Redo / return visit caused by faulty work') },
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
                      <h2 className="text-base font-extrabold tracking-tight truncate uppercase" style={{ color: textPrimary }}>
                        {displayInstallerName(deductionsModalInstaller).toUpperCase()}&rsquo;s Deductions &amp; Adjustments
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
                      <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: isLight ? '#047857' : '#34D399' }}>Net Payout</span>
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
                  {!isWeekClosed && (
                    <button
                      type="button"
                      onClick={saveDeductionsNow}
                      className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-xs font-black text-white transition-all shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
                      style={{ background: '#10B981' }}
                    >
                      <Save className="w-4 h-4" />
                      <span>Save</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      {completeModalFor && (() => {
        const modalRows = grouped.find(([name]) => name === completeModalFor)?.[1] ?? []
        const modalNet = modalRows.length > 0 ? installerNet(modalRows) : 0
        const modalJobCount = modalRows.length > 0 ? completedJobsCount(modalRows) : 0
        const modalJobBreakdown = modalRows.length > 0 ? completedJobsBreakdown(modalRows) : ''
        const modalIsComplete = modalRows.length > 0 && modalRows.every(r => r.status === 'COMPLETE')
        const modalAudited = modalRows.find(r => !isCarryOver(r))?.audited || modalRows[0]?.audited || ''

        return (
          <CompletePayoutModal
            installerName={completeModalFor}
            userDisplayName={userDisplayName}
            userFirstName={userFirstName}
            userRole={role || (user as any)?.jobTitle || 'STAFF'}
            totalAmount={modalNet}
            jobCount={modalJobCount}
            jobBreakdown={modalJobBreakdown}
            isAlreadyComplete={modalIsComplete}
            auditedBy={modalAudited}
            isWeekClosed={isWeekClosed}
            canManagePayroll={canManagePayroll}
            onClose={() => setCompleteModalFor(null)}
            onComplete={(remarks, validatorName) => {
              const upperRemarks = remarks.trim().toUpperCase()
              updateInstallerRows(completeModalFor, {
                status: 'COMPLETE',
                audited: validatorName || userDisplayName || userFirstName,
                remarks: upperRemarks,
              })
              setCompleteModalFor(null)
            }}
            onRevertToPending={() => {
              updateInstallerRows(completeModalFor, {
                status: 'PENDING',
                audited: '',
              })
              setCompleteModalFor(null)
            }}
            displayInstallerName={displayInstallerName}
            initialRemarks={completeRemarks}
          />
        )
      })()}
      {/* Hold modal — see docs/payroll-hold-release-plan.md */}
      {holdModalRow && (
        <HoldModal
          holdModalRow={holdModalRow}
          onClose={() => setHoldModalRow(null)}
          onSubmit={submitHold}
          holdSubmitting={holdSubmitting}
          displayInstallerName={displayInstallerName}
          rowTotal={rowTotal}
        />
      )}

      {/* Held Tickets — branch-wide, spans the active month + the 2 months before it; see
          docs/payroll-hold-release-plan.md */}
      {heldTicketsOpen && createPortal(
        (() => {
          const term = heldSearch.trim().toLowerCase()
          const heldInstallerOptions = Array.from(new Set([
            ...heldTickets.map(({ row }) => resolveGroupKey(row.installerName)),
            ...(heldInstallerFilter ? [heldInstallerFilter] : []),
            ...technicianOptions,
          ])).sort((a, b) => a.localeCompare(b))
          const visibleHeld = heldTickets.filter(({ row }) => {
            const groupKey = resolveGroupKey(row.installerName)
            if (heldInstallerFilter && groupKey !== heldInstallerFilter) return false
            if (term && !(
              row.customerName.toLowerCase().includes(term)
              || (row.ticketNumber || '').toLowerCase().includes(term)
              || row.installerName.toLowerCase().includes(term)
            )) return false
            return true
          })
          return (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
              <div
                className="w-full max-w-7xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '92vh', backgroundColor: cardBg, borderColor: border }}
              >
                <div className="flex items-start justify-between gap-3 px-6 py-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Archive className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-base font-extrabold uppercase tracking-wide truncate" style={{ color: textPrimary }}>
                          Held Tickets — {heldInstallerFilter ? displayInstallerName(heldInstallerFilter).toUpperCase() : (currentBranchDisplay || 'Branch')}
                        </div>
                        {heldTicketsLoading && <Loader2 className="w-4 h-4 animate-spin text-amber-500 shrink-0" />}
                      </div>
                      <div className="text-xs font-semibold" style={{ color: textMuted }}>
                        {heldTicketsLoading ? 'Loading latest tickets…' : `${visibleHeld.length} held job${visibleHeld.length === 1 ? '' : 's'}`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHeldTicketsOpen(false)}
                    className="p-2.5 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all"
                    style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>

                <div className="px-6 py-3 flex flex-wrap items-center gap-2 border-b shrink-0" style={{ borderColor: border }}>
                  <div className="relative w-48 md:w-60">
                    <Users className="absolute left-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
                    <select
                      value={heldInstallerFilter}
                      onChange={e => setHeldInstallerFilter(e.target.value)}
                      className="w-full pl-8 pr-6 py-1.5 rounded-lg text-xs font-bold appearance-none cursor-pointer border truncate"
                      style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <option value="">ALL TECHNICIANS</option>
                      {heldInstallerOptions.map(name => (
                        <option key={name} value={name}>{displayInstallerName(name).toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative w-48 md:w-64">
                    <Search className="absolute left-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
                    <input
                      type="text"
                      placeholder="Search…"
                      value={heldSearch}
                      onChange={e => setHeldSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs font-semibold border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  {visibleHeld.length === 0 ? (
                    <div className="py-16 text-center text-xs font-semibold" style={{ color: textMuted }}>
                      {heldTicketsLoading ? 'Loading held tickets…' : 'No held tickets match this filter.'}
                    </div>
                  ) : (
                    <table className="w-full text-[13px]" style={{ color: textPrimary }}>
                      <thead className="sticky top-0" style={{ backgroundColor: headerBg }}>
                        <tr className="text-[11px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>
                          <th className="px-6 py-2.5 text-left" style={{ borderBottom: `1px solid ${border}` }}>Date</th>
                          <th className="px-3 py-2.5 text-left" style={{ borderBottom: `1px solid ${border}` }}>Ticket</th>
                          <th className="px-3 py-2.5 text-left" style={{ borderBottom: `1px solid ${border}` }}>Customer</th>
                          <th className="px-3 py-2.5 text-left" style={{ borderBottom: `1px solid ${border}` }}>Installer</th>
                          <th className="px-3 py-2.5 text-left" style={{ borderBottom: `1px solid ${border}` }}>Original Week</th>
                          <th className="px-3 py-2.5 text-left" style={{ borderBottom: `1px solid ${border}` }}>Reason</th>
                          <th className="px-3 py-2.5 text-left" style={{ borderBottom: `1px solid ${border}` }}>Held By</th>
                          <th className="px-3 py-2.5 text-right" style={{ borderBottom: `1px solid ${border}` }}>Payout</th>
                          <th className="px-6 py-2.5 text-right" style={{ borderBottom: `1px solid ${border}` }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleHeld.map(({ row, month }, idx) => {
                          const weekLabel = row.customFields?.['hold:heldWeekFrom'] && row.customFields?.['hold:heldWeekTo']
                            ? `${shortDate(row.customFields['hold:heldWeekFrom'])} – ${shortDate(row.customFields['hold:heldWeekTo'])}`
                            : '—'
                          return (
                            <tr key={`${month}-${row.id}`} style={{ backgroundColor: idx % 2 === 1 ? zebraBg : cardBg }}>
                              <td className="px-6 py-2.5 whitespace-nowrap">{row.workDate ? shortDate(row.workDate) : '—'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">{row.ticketNumber || '—'}</td>
                              <td className="px-3 py-2.5 font-semibold max-w-[180px] truncate">{row.customerName || '—'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400 font-bold">{displayInstallerName(row.installerName)}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">{weekLabel}</td>
                              <td className="px-3 py-2.5 max-w-[220px] truncate" style={{ color: textMuted }} title={row.customFields?.['hold:reason'] || ''}>
                                {row.customFields?.['hold:reason'] || '—'}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: textMuted }}>
                                {row.customFields?.['hold:heldBy'] ? formatPersonName(row.customFields['hold:heldBy']) : '—'}
                                {row.customFields?.['hold:heldAt'] && (
                                  <span className="block text-[10px] opacity-70">{new Date(row.customFields['hold:heldAt']).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap">₱{peso(rowTotal(row))}</td>
                              <td className="px-6 py-2.5 text-right whitespace-nowrap">
                                {canManagePayroll && (
                                  <button
                                    type="button"
                                    onClick={() => void submitUnhold(row, month)}
                                    disabled={unholdingKey === rowMatchKey(row)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-lg text-[11px] font-bold border transition-colors hover:border-rose-500/50 hover:text-rose-500 disabled:opacity-50 cursor-pointer"
                                    style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
                                  >
                                    <Undo2 className="w-3 h-3" />
                                    {unholdingKey === rowMatchKey(row) ? 'Undoing…' : 'Undo hold'}
                                  </button>
                                )}
                                {canManagePayroll && (
                                  <button
                                    type="button"
                                    onClick={() => openReleaseModal(row, month)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 cursor-pointer"
                                    style={{ color: '#10B981', borderColor: isLight ? '#a7f3d0' : 'rgba(16,185,129,0.35)', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.08)' }}
                                  >
                                    <Send className="w-3 h-3" />
                                    Release to Payouts
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* Pending 50% balances — tickets not fully paid pay the tech half now; the other
                      half waits here until the ticket is paid and closed, then releases to any open week. */}
                  {(() => {
                    const bTerm = heldSearch.trim().toLowerCase()
                    const visibleBalances = balanceTickets.filter(({ row }) => {
                      if (heldInstallerFilter && resolveGroupKey(row.installerName) !== heldInstallerFilter) return false
                      if (bTerm && !(row.customerName.toLowerCase().includes(bTerm) || (row.ticketNumber || '').toLowerCase().includes(bTerm) || row.installerName.toLowerCase().includes(bTerm))) return false
                      return true
                    })
                    if (visibleBalances.length === 0) return null
                    return (
                      <div style={{ borderTop: `2px solid ${border}` }}>
                        <div className="px-6 py-3 flex items-center gap-2" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
                          <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>Pending Balances (50% of unpaid tickets)</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: isLight ? '#fff7ed' : 'rgba(234,88,12,0.16)', color: '#EA580C' }}>{visibleBalances.length}</span>
                        </div>
                        <table className="w-full text-[13px]" style={{ color: textPrimary }}>
                          <thead>
                            <tr className="text-[11px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>
                              <th className="px-6 py-2.5 text-left">Date</th>
                              <th className="px-3 py-2.5 text-left">Ticket</th>
                              <th className="px-3 py-2.5 text-left">Customer</th>
                              <th className="px-3 py-2.5 text-left">Installer</th>
                              <th className="px-3 py-2.5 text-left">Payment Status</th>
                              <th className="px-3 py-2.5 text-right">Balance Owed</th>
                              <th className="px-6 py-2.5 text-right"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleBalances.map(({ row, month }, idx) => {
                              const paid = paymentStatusOf(row) === 'PAID'
                              return (
                                <tr key={`bal-${month}-${row.id}`} style={{ backgroundColor: idx % 2 === 1 ? zebraBg : cardBg }}>
                                  <td className="px-6 py-2.5 whitespace-nowrap">{row.workDate ? shortDate(row.workDate) : '—'}</td>
                                  <td className="px-3 py-2.5 whitespace-nowrap">{row.ticketNumber || '—'}</td>
                                  <td className="px-3 py-2.5 font-semibold max-w-[180px] truncate">{row.customerName || '—'}</td>
                                  <td className="px-3 py-2.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400 font-bold">{displayInstallerName(row.installerName)}</td>
                                  <td className="px-3 py-2.5">
                                    <select
                                      value={paymentStatusOf(row)}
                                      disabled={!canManagePayroll}
                                      onChange={e => void setBalancePaymentStatus(row, month, e.target.value)}
                                      className="text-xs font-bold bg-transparent border-0 outline-none cursor-pointer"
                                      style={{ color: paid ? '#10B981' : '#D97706' }}
                                    >
                                      {PAYMENT_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap">₱{peso(rowTotal(row))}</td>
                                  <td className="px-6 py-2.5 text-right whitespace-nowrap">
                                    {canManagePayroll && (
                                      <button
                                        type="button"
                                        disabled={!paid}
                                        onClick={() => openReleaseModal(row, month, 'balance')}
                                        title={paid ? 'Release the remaining 50% into an open week' : 'Mark the ticket Fully Paid first'}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{ color: '#10B981', borderColor: isLight ? '#a7f3d0' : 'rgba(16,185,129,0.35)', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.08)' }}
                                      >
                                        <Send className="w-3 h-3" />
                                        {paid ? 'Release Balance' : 'Awaiting payment'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      {/* Balance adjustment modal */}
      {adjustRow && (
        <AdjustBalanceModal
          adjustRow={adjustRow}
          closures={closures}
          activeMonth={activeMonth}
          cycle={cycle}
          branchFilter={branchFilter}
          getAdjustableCols={getAdjustableCols}
          getColAccessor={getColAccessor}
          onClose={() => setAdjustRow(null)}
          onSubmit={submitAdjust}
          adjustSubmitting={adjustSubmitting}
          displayInstallerName={displayInstallerName}
        />
      )}

      {/* Correction history modal */}
      {correctionsOpen && (
        <CorrectionHistoryModal
          corrections={corrections}
          currentBranchDisplay={currentBranchDisplay}
          onClose={() => setCorrectionsOpen(false)}
          displayInstallerName={displayInstallerName}
          initialSearch={correctionsSearch}
        />
      )}

      {/* Release modal — see docs/payroll-hold-release-plan.md */}
      {releaseFor && createPortal(
        (() => {
          const targetWeekOptions = [
            ...weeksOfMonth(activeMonth, cycle),
            ...weeksOfMonth(nextMonth(activeMonth), cycle),
          ].filter(w => !closures.some(c => c.branchId === branchFilter && c.weekFrom === w.from && c.weekTo === w.to))
          return (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
              <div className="w-full max-w-md rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
                <div className="flex items-start justify-between gap-3 px-6 py-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-extrabold uppercase tracking-wide" style={{ color: textPrimary }}>Release to Payouts</span>
                    </div>
                    <div className="text-xs font-semibold mt-1 truncate" style={{ color: textMuted }}>
                      {releaseFor.row.customerName || 'No customer'} · {releaseFor.row.ticketNumber || 'No ticket'}
                      {' · '}<span className="text-emerald-500">{displayInstallerName(releaseFor.row.installerName)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setReleaseFor(null); setReleaseTargetWeek(null); setReleaseApprovalNote('') }}
                    className="p-2 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all"
                    style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                </div>
                <div className="px-6 py-5 flex flex-col gap-3">
                  <div
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{ backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.08)', border: `1px solid ${isLight ? '#a7f3d0' : 'rgba(16,185,129,0.3)'}` }}
                  >
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#059669' }}>{releaseFor.kind === 'balance' ? 'Remaining 50% Balance (counts as Add-ons)' : 'Full Payout (counts as Add-ons)'}</span>
                    <span className="text-lg font-extrabold tabular-nums" style={{ color: '#059669' }}>₱{peso(rowTotal(releaseFor.row))}</span>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Target Week (open weeks only)</span>
                    <select
                      value={releaseTargetWeek ? `${releaseTargetWeek.from}|${releaseTargetWeek.to}` : ''}
                      onChange={e => {
                        const [from, to] = e.target.value.split('|')
                        setReleaseTargetWeek(targetWeekOptions.find(w => w.from === from && w.to === to) || null)
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    >
                      <option value="">Select a target week…</option>
                      {targetWeekOptions.map(w => (
                        <option key={`${w.from}|${w.to}`} value={`${w.from}|${w.to}`}>
                          {formatMonth(w.owningMonth)} — Week {w.weekNumber} ({w.label})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Approval Note (optional)</span>
                    <textarea
                      rows={2}
                      value={releaseApprovalNote}
                      onChange={e => setReleaseApprovalNote(e.target.value)}
                      placeholder="e.g. Approved by Ma'am Patt"
                      className="w-full rounded-xl border p-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </label>
                </div>
                <div
                  className="flex items-center justify-end gap-3 px-6 py-4 shrink-0"
                  style={{ backgroundColor: isLight ? 'rgba(241, 245, 249, 0.7)' : 'rgba(15, 26, 46, 0.7)', borderTop: `1px solid ${border}` }}
                >
                  <button
                    type="button"
                    onClick={() => { setReleaseFor(null); setReleaseTargetWeek(null); setReleaseApprovalNote('') }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold border transition-all hover:opacity-80 cursor-pointer"
                    style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitRelease()}
                    disabled={!releaseTargetWeek || releaseSubmitting}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black text-white transition-all shadow-md disabled:opacity-50 cursor-pointer"
                    style={{ background: '#10B981' }}
                  >
                    {releaseSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{releaseSubmitting ? 'Releasing…' : 'Confirm Release'}</span>
                  </button>
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />

      <WeekSummaryModal
        isOpen={weekSummaryOpen}
        onClose={() => setWeekSummaryOpen(false)}
        activeBranchId={branchFilter}
        branches={branches}
        activeWeek={activeWeek}
        activeMonth={activeMonth}
      />

      {selectedTicketForModal && (
        <TicketDetailsModal
          ticket={selectedTicketForModal}
          isLight={isLight}
          activeBranchId={branchFilter}
          user={user}
          onClose={() => setSelectedTicketForModal(null)}
          onUpdateTicket={(updated) => setSelectedTicketForModal(updated)}
        />
      )}

      {/* ── Showcase full-view tab popup ──────────────────────────────────── */}
      {showcaseOpen && selectedInstaller && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            width: '100vw',
            height: '100vh',
            backgroundColor: isLight ? '#0f172a' : '#020617',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Top action bar */}
          <div style={{
            width: '100%',
            height: 54,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexShrink: 0,
            backgroundColor: isLight ? '#ffffff' : '#09111e',
            borderBottom: `2px solid ${isLight ? '#e2e8f0' : '#1e293b'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 8,
                backgroundColor: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                color: '#10B981', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                <Maximize2 size={13} /> FULL TAB SHOWCASE
              </div>
              <span style={{ color: isLight ? '#0f172a' : '#F1F5F9', fontWeight: 800, fontSize: 14, textTransform: 'uppercase' }}>
                {displayInstallerName(selectedInstaller)}
              </span>
              <span style={{ fontSize: 12, color: isLight ? '#64748b' : '#94a3b8', fontWeight: 500 }}>
                {activeWeek ? `${shortDate(activeWeek.from)} – ${shortDate(activeWeek.to)}` : ''} · {currentBranchDisplay}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                disabled={showcaseCopying}
                onClick={async () => {
                  if (!showcaseRef.current) return
                  setShowcaseCopying(true)
                  try {
                    const html2canvas = (await import('html2canvas')).default
                    const canvas = await html2canvas(showcaseRef.current, {
                      backgroundColor: isLight ? '#ffffff' : '#0a1120',
                      scale: 2,
                      useCORS: true,
                      logging: false,
                    })
                    canvas.toBlob(async blob => {
                      if (!blob) return
                      try {
                        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                      } catch {
                        const url = URL.createObjectURL(blob)
                        window.open(url, '_blank')
                      }
                    }, 'image/png')
                  } finally {
                    setShowcaseCopying(false)
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 18px', borderRadius: 10,
                  border: '1px solid rgba(16,185,129,0.5)',
                  backgroundColor: showcaseCopying ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.12)',
                  color: '#10B981', fontSize: 13, fontWeight: 700,
                  cursor: showcaseCopying ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Copy size={14} />
                {showcaseCopying ? 'Copying…' : 'Copy as Image'}
              </button>
              <button
                type="button"
                disabled={showcasePdfing}
                onClick={() => void runPayoutPdf(selectedInstaller, true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 18px', borderRadius: 10,
                  border: '1px solid rgba(16,185,129,0.5)',
                  backgroundColor: '#10B981',
                  color: '#ffffff', fontSize: 13, fontWeight: 700,
                  cursor: showcasePdfing ? 'wait' : 'pointer',
                  opacity: showcasePdfing ? 0.7 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <FileSpreadsheet size={14} />
                {showcasePdfing ? 'Creating PDF…' : 'Export PDF'}
              </button>
              <button
                type="button"
                onClick={() => setShowcaseOpen(false)}
                title="Close full tab (Esc)"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 10,
                  border: `1px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                  backgroundColor: isLight ? '#f1f5f9' : '#1e293b',
                  color: isLight ? '#334155' : '#cbd5e1',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <X size={15} /> Close
              </button>
            </div>
          </div>

          {/* Captured showcase panel — occupies full height, scrolls internally */}
          {(() => {
            const showRows = selectedInstallerRows.filter(r => !isCarryOver(r))
            const gross = installerTotal(selectedInstallerRows)
            const totalDed = deductionTotal(selectedInstallerRows)
            const net = gross - totalDed
            const uniqueDates2 = Array.from(new Set(showRows.map(r => r.workDate || ''))).sort()
            const dateColorIdx2: Record<string, number> = {}
            uniqueDates2.forEach((d, i) => { dateColorIdx2[d] = i % DATE_BAND_PALETTES.length })
            const dateRowCount2: Record<string, number> = {}

            const groupVisibleColumns = visibleColumnsFor(selectedInstaller)
            // Dynamically select ALL columns that have data for this installer in this period
            const showcaseCols = groupVisibleColumns.filter(col => {
              if (['date', 'ticketNumber', 'customerName', 'brandCapacity', 'installationUpload', 'paymentStatus'].includes(col.key)) {
                return true
              }
              return showRows.some(row => {
                const txt = listCellText(col, row).trim()
                return txt && txt !== '—' && txt !== '₱0.00' && txt !== '0'
              })
            })

            const getColWidth = (colKey: string): string => {
              if (colKey === 'date') return '92px'
              if (colKey === 'ticketNumber') return '100px'
              if (colKey === 'customerName') return '240px'
              if (colKey === 'brandCapacity') return '130px'
              if (colKey === 'installationUpload') return '140px'
              if (colKey === 'paymentStatus') return '100px'
              if (colKey === 'remit') return '140px'
              return '130px'
            }
            const scGridTemplate = showcaseCols.map(c => getColWidth(c.key)).join(' ')

            const scBg = isLight ? '#ffffff' : '#0a1120'
            const scCard = isLight ? '#ffffff' : '#0a1120'
            const scBord = isLight ? '#64748b' : '#334155'
            const scTextPrimary = isLight ? '#0f172a' : '#E2E8F0'
            const scTextMuted = isLight ? '#475569' : '#7A95B8'
            const scHeaderBg = isLight ? '#f1f5f9' : '#0d1628'
            const remitTintSC = isLight ? '#EFF6FF' : 'rgba(56,189,248,0.10)'
            const remitAccentSC = isLight ? '#0369A1' : '#7DD3FC'

            return (
              <div
                ref={showcaseRef}
                data-showcase-capture="1"
                style={{
                  flex: 1,
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: scBg,
                  overflowY: 'auto',
                  fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
                }}
              >
                {/* Clean, green executive banner */}
                <div style={{
                  padding: '24px 36px',
                  background: isLight
                    ? 'linear-gradient(135deg, #064e3b 0%, #065f46 55%, #047857 100%)'
                    : 'linear-gradient(135deg, #022c22 0%, #064e3b 55%, #065f46 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
                  flexShrink: 0,
                  borderBottom: `2px solid ${scBord}`,
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6EE7B7', marginBottom: 5 }}>
                      Installer Payout Showcase · {currentBranchDisplay}
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      {displayInstallerName(selectedInstaller)}
                    </div>
                    <div style={{ fontSize: 13, color: '#A7F3D0', marginTop: 4, fontWeight: 500 }}>
                      {activeWeek ? `${shortDate(activeWeek.from)} – ${shortDate(activeWeek.to)}` : ''}
                      {showRows.length > 0 ? ` · ${showRows.length} ticket${showRows.length !== 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6EE7B7' }}>Net Payout</div>
                    <div style={{ fontSize: 44, fontWeight: 900, color: net < 0 ? '#F87171' : '#34D399', letterSpacing: '-0.02em', marginTop: 2 }}>
                      {net < 0 ? '−' : ''}₱{peso(Math.abs(net))}
                    </div>
                  </div>
                </div>

                {/* Table with all columns that have data */}
                <div data-sc-scroll="1" style={{ flex: 1, overflowX: 'auto', backgroundColor: scCard }}>
                  <div style={{ minWidth: '100%' }}>
                    {/* Column headers */}
                    <div data-sc-head="1" style={{
                      display: 'grid',
                      gridTemplateColumns: scGridTemplate,
                      backgroundColor: scHeaderBg,
                      borderBottom: `2px solid ${scBord}`,
                    }}>
                      {showcaseCols.map((col, hi) => (
                        <div key={col.key} style={{
                          padding: '14px 12px', fontSize: 11, fontWeight: 800,
                          textTransform: 'uppercase', letterSpacing: '0.08em',
                          color: col.key === 'remit' ? remitAccentSC : scTextMuted,
                          borderRight: hi < showcaseCols.length - 1 ? `2px solid ${scBord}` : undefined,
                          backgroundColor: col.key === 'remit' ? remitTintSC : undefined,
                          textAlign: col.key === 'date' || col.key === 'ticketNumber' || col.key === 'customerName' ? 'left' : (col.isMoney || col.key === 'remit' ? 'right' : 'center'),
                        }}>{col.label}</div>
                      ))}
                    </div>

                    {showRows.length === 0 ? (
                      <div style={{ padding: '48px', textAlign: 'center', color: scTextMuted, fontSize: 14, fontWeight: 600 }}>
                        No jobs for this period.
                      </div>
                    ) : showRows.map((row) => {
                      const dk = row.workDate || ''
                      const palette = DATE_BAND_PALETTES[dateColorIdx2[dk] ?? 0]
                      const cnt2 = dateRowCount2[dk] ?? 0
                      dateRowCount2[dk] = cnt2 + 1
                      const rowBg2 = cnt2 % 2 === 0 ? palette.light : palette.dark
                      const isDone2 = /^DONE\b/i.test((row.installationUpload || '').trim())
                      const statusColor = isDone2 ? (isLight ? '#047857' : '#34D399') : (isLight ? '#b45309' : '#fbbf24')
                      const paid2 = paymentStatusOf(row) === 'PAID'
                      const remitAmt = num(row.actualCollected)
                      return (
                        <div key={row.id} data-sc-row="1" style={{
                          display: 'grid',
                          gridTemplateColumns: scGridTemplate,
                          backgroundColor: rowBg2,
                          borderBottom: `2px solid ${scBord}`,
                          minHeight: 52,
                          alignItems: 'center',
                        }}>
                          {showcaseCols.map((col, ci) => {
                            const isLast = ci === showcaseCols.length - 1
                            const borderR = isLast ? undefined : `2px solid ${scBord}`

                            if (col.key === 'date') {
                              return (
                                <div key={col.key} style={{ padding: '14px 12px', fontSize: 12, fontWeight: 800, color: scTextPrimary, borderRight: borderR, height: '100%', display: 'flex', alignItems: 'center' }}>
                                  {row.workDate ? shortDate(row.workDate) : '—'}
                                </div>
                              )
                            }
                            if (col.key === 'ticketNumber') {
                              return (
                                <div key={col.key} style={{ padding: '14px 12px', fontSize: 11, color: scTextPrimary, borderRight: borderR, height: '100%', display: 'flex', alignItems: 'center' }}>
                                  {row.ticketNumber || row.ticketId || '—'}
                                </div>
                              )
                            }
                            if (col.key === 'customerName') {
                              return (
                                <div key={col.key} style={{ padding: '14px 12px', fontSize: 11, fontWeight: 600, color: scTextPrimary, borderRight: borderR, height: '100%', display: 'flex', alignItems: 'center' }}>
                                  {row.customerName || '—'}
                                </div>
                              )
                            }
                            if (col.key === 'brandCapacity') {
                              return (
                                <div key={col.key} style={{ padding: '14px 12px', fontSize: 11, color: scTextPrimary, borderRight: borderR, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                  {row.brandCapacity || '—'}
                                </div>
                              )
                            }
                            if (col.key === 'installationUpload') {
                              return (
                                <div key={col.key} style={{ padding: '14px 12px', fontSize: 11, fontWeight: 700, color: statusColor, borderRight: borderR, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                  {row.installationUpload || '—'}
                                </div>
                              )
                            }
                            if (col.key === 'paymentStatus') {
                              return (
                                <div key={col.key} style={{ padding: '14px 12px', fontSize: 11, fontWeight: 800, color: paid2 ? scTextPrimary : '#D97706', borderRight: borderR, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {paymentStatusLabel(row)}
                                </div>
                              )
                            }
                            if (col.key === 'remit') {
                              return (
                                <div key={col.key} style={{ padding: '14px 12px', fontSize: 12, fontWeight: 700, color: scTextPrimary, backgroundColor: remitAmt > 0 ? remitTintSC : undefined, borderRight: borderR, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                  {remitAmt > 0 ? `₱${peso(remitAmt)}` : (row.actualCollected || '—')}
                                </div>
                              )
                            }
                            // All other columns with data (earth grounding, allowance, install fee, etc.)
                            const text = listCellText(col, row)
                            return (
                              <div key={col.key} style={{
                                padding: '14px 12px',
                                fontSize: 12,
                                fontWeight: col.isMoney ? 700 : 500,
                                color: text && text !== '—' ? scTextPrimary : scTextMuted,
                                borderRight: borderR,
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: col.align === 'right' || col.isMoney ? 'flex-end' : 'flex-start',
                                fontVariantNumeric: 'tabular-nums',
                              }}>
                                {text || '—'}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}

                    {/* Column totals bar aligned with table columns */}
                    {showRows.length > 0 && (
                      <div data-sc-row="1" style={{
                        display: 'grid',
                        gridTemplateColumns: scGridTemplate,
                        backgroundColor: scHeaderBg,
                        borderBottom: `2px solid ${scBord}`,
                        fontWeight: 800,
                        fontSize: 12,
                      }}>
                        {showcaseCols.map((col, ci) => {
                          const isLast = ci === showcaseCols.length - 1
                          const borderR = isLast ? undefined : `2px solid ${scBord}`
                          if (ci === 0) {
                            return (
                              <div key={col.key} style={{ padding: '10px 12px', borderRight: borderR, color: scTextMuted, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em', display: 'flex', alignItems: 'center' }}>
                                Totals
                              </div>
                            )
                          }
                          if (col.key === 'remit') {
                            const totRemit = remittanceTotal(showRows)
                            return (
                              <div key={col.key} style={{ padding: '10px 12px', borderRight: borderR, textAlign: 'right', color: remitAccentSC, backgroundColor: remitTintSC, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                {totRemit > 0 ? `₱${peso(totRemit)}` : '—'}
                              </div>
                            )
                          }
                          if (col.isMoney) {
                            const tot = showRows.reduce((sum, r) => sum + num(String(columnAccessors[col.key]?.get(r) ?? '')), 0)
                            return (
                              <div key={col.key} style={{ padding: '10px 12px', borderRight: borderR, textAlign: 'right', color: scTextPrimary, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                {tot > 0 ? `₱${peso(tot)}` : '—'}
                              </div>
                            )
                          }
                          return (
                            <div key={col.key} style={{ padding: '10px 12px', borderRight: borderR }} />
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>,
        document.body,
      )}
    </div>
  )
}
