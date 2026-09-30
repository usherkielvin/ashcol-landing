import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { NumericFormat } from 'react-number-format'
import { Plus, Trash2, Check, Receipt, Send, Edit, CalendarDays, ChevronDown, History as HistoryIcon, Lock } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import {
  API_BASE_URL,
  formatDisplayUserLabel,
  isSameBaseBranch,
  resolveScopedBranchId,
  isMayDtrEditWindow,
  isEmployeePortalRole,
  findBranchListEntry,
  branchEntryMatchesGlobal,
  parseGlobalBranchScope,
  formatBranchName,
  isPortalAdmin,
  type BranchListEntry,
} from '../utils/api'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import { fetchAndMapTickets, fetchAndMapOnlineTickets, fetchAndMapCheckTickets, fetchAndMapForCollTickets, fetchAndMapRebateTickets, fetchAndMapCommissionTickets, fetchAndCountUnitSummary, lookupRebateRate, type CommissionRow } from '../utils/schedulePrefill'
import { DtrHistoryModal } from '../components/DtrHistoryModal'
import ReceiptScanDialog, { type ReceiptDialogResult } from '../components/ReceiptScanDialog'
import { upsertAuditExpense, deleteAuditExpense, loadAuditExpenses } from '../utils/auditExpenseStorage'
import { parseSmartDate } from '../utils/smartDate'
import type { AuditExpense, AuditExpenseCategory } from '../types/auditExpense'

// ── Types ────────────────────────────────────────────────────────────────────


// DTR-specific row types
interface CashTxRow    { id: string; ticketNumber?: string; customer: string; installer: string; amount: string }
interface CashRetRow   { id: string; name: string; description: string; amount: string }
interface OnlineTxRow  { id: string; ticketNumber?: string; installer: string; customer: string; bank: string; amount: string }
interface CheckRow     { id: string; ticketNumber?: string; installer: string; customer: string; bank: string; amount: string }
interface PartsSaleRow { id: string; customer: string; description: string; amount: string; paymentMethod: 'CASH' | 'ONLINE' }
interface ForCollRow   { id: string; ticketNumber?: string; installer: string; customer: string; amount: string; collectionResolved?: boolean }
interface RebateRow    { id: string; ticketNumber: string; customer: string; company: string; raNumber: string; hp: string; amount: string }
interface OrderRow     { id: string; customer: string; description: string; amount: string; receiptReturned?: boolean; actualAmount?: string; receiptNo?: string; receiptDate?: string; resolvedExpenseId?: string; receiptStatus?: string }
interface ExpenseRow   { id: string; name: string; description: string; amount: string; receiptReturned?: boolean; actualAmount?: string; receiptNo?: string; receiptDate?: string; resolvedExpenseId?: string; receiptStatus?: string; receiptImage?: string; company?: string; expenseCategory?: string; sourceOfFunds?: string }
interface IncentiveRow { id: string; customer: string; company: string; hp: string; promodiser: string; amount: string; collectionResolved?: boolean }
interface CashAdvanceRow { id: string; memberName: string; details: string; amount: string; resolvedExpenseId?: string }
interface DepositRow   { id: string; description: string; referenceNo: string; amount: string; receiptImage?: string; bank?: string; resolvedExpenseId?: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2)



const php = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const num = (s: string) => parseFloat(s) || 0
const sumArr = (arr: string[]) => arr.reduce((a, b) => a + num(b), 0)
const formatReviewDateTime = (date: Date) =>
  date.toLocaleString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).replace(/, (?=\d{1,2}:)/, ' ').replace(/\s(AM|PM)$/i, (_, meridiem) => meridiem.toUpperCase()).toUpperCase()

const formatReportDateDisplay = (dateStr: string) => {
  if (!dateStr) return 'SELECT DATE'
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
  const monthAbbr = dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  const dayPadded = String(d).padStart(2, '0')
  const yearTwoDigits = y.slice(-2)
  return `${monthAbbr}-${dayPadded}-${yearTwoDigits}`
}

const getIsoDateParts = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

/** Native date inputs fire onChange when month arrows move but the day-of-month stays the same. */
const isLikelyMonthNavigation = (fromIso: string, toIso: string) => {
  if (!fromIso || !toIso || fromIso === toIso) return false
  const from = getIsoDateParts(fromIso)
  const to = getIsoDateParts(toIso)
  return from.day === to.day && (from.month !== to.month || from.year !== to.year)
}

const DATE_PICKER_MONTH_NAV_MS = 350

type EditPermissionContext = {
  isAdmin: boolean
  role: string
  isManager: boolean
  globalBranchId?: string | null
  user?: {
    branchId?: string | null
    email?: string | null
    jobTitle?: string | null
  } | null
}

const resolveCanEditExistingReport = (
  ctx: EditPermissionContext,
  report: {
    reportDate: string
    status?: string | null
    branchId?: string | null
    auditLine?: string | null
    submittedAt?: string | null
  },
) => {
  if (ctx.isAdmin) {
    if (!ctx.globalBranchId) return false
    return branchEntryMatchesGlobal(
      { id: report.branchId || '', auditLine: report.auditLine },
      ctx.globalBranchId,
    )
  }

  // "DTR OVERRIDE" job-title subrole (see Employees admin edit) — lets a non-admin member edit
  // any of their own branch's DTR forms every day, bypassing the 24h window and the audited-report
  // lock below. Branch scoping further down still applies.
  const hasDtrLockdownOverride = (ctx.user?.jobTitle || '').toLowerCase().includes('dtr override')

  // 24-hour edit window enforcement for non-admin users (members / OIC)
  if (!hasDtrLockdownOverride && report.submittedAt) {
    const submittedMs = new Date(report.submittedAt).getTime()
    if (!isNaN(submittedMs) && Date.now() - submittedMs > 24 * 60 * 60 * 1000) {
      return false
    }
  }

  const role = ctx.role
  const mayEmployeeEdit = hasDtrLockdownOverride || (isEmployeePortalRole(role) && isMayDtrEditWindow(report.reportDate))
  const mayCorrectionEdit = mayEmployeeEdit || (ctx.isManager && isMayDtrEditWindow(report.reportDate))
  const reportStatus = report.status || 'SUBMITTED'

  if (reportStatus === 'AUDITED') {
    if (!mayCorrectionEdit) return false
  } else if (!ctx.isManager && !mayEmployeeEdit) {
    return false
  }

  const selectedBranchId = report.branchId
  if (!ctx.user?.branchId || !selectedBranchId) return false
  if (!isSameBaseBranch(ctx.user.branchId, selectedBranchId)) return false

  const resolvedSelected = resolveScopedBranchId(selectedBranchId)
  const isTaguigRow = resolvedSelected.toUpperCase().includes('TAGUIG')
  if (isTaguigRow) {
    const emailLower = (ctx.user.email || '').toLowerCase()
    const titleLower = (ctx.user.jobTitle || '').toLowerCase()
    const resolvedUserBranch = resolveScopedBranchId(ctx.user.branchId).toLowerCase()
    const isServiceUser = resolvedUserBranch.includes('service')
      || emailLower.includes('service')
      || titleLower.includes('service')
    const isServiceRow = report.auditLine === 'TAGUIG_SERVICE'
    return isServiceUser === isServiceRow
  }
  return true
}

const cleanInstallerName = (name: string, currentBranchName?: string) => {
  let cleaned = name.trim()
  cleaned = cleaned.replace(/^ASHCOL\s*[-|:]?\s*/i, '').trim()
  if (currentBranchName) {
    const cleanBranch = currentBranchName.toUpperCase().replace('ASHCOL', '').trim()
    if (cleanBranch) {
      const prefixes = [cleanBranch]
      
      // If it ends with SERVICES, also add SERVICE
      if (cleanBranch.endsWith('SERVICES')) {
        prefixes.push(cleanBranch.slice(0, -1))
      } else if (cleanBranch.endsWith('SERVICE')) {
        prefixes.push(cleanBranch + 'S')
      }
      
      // Also add first word (e.g. "TAGUIG", "DASMA", "RIZAL")
      const firstWord = cleanBranch.split(' ')[0]
      if (firstWord && firstWord !== 'ASHCOL' && firstWord.length > 2) {
        prefixes.push(firstWord)
      }

      // Branch may be spelled with or without the ñ (BIÑAN / BINAN) in installer text.
      const plain = cleanBranch.normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (plain !== cleanBranch) prefixes.push(plain)
      if (/BINAN/.test(cleanBranch)) prefixes.push(cleanBranch.replace(/BINAN/g, 'BIÑAN'))

      // Sort by length descending to match longest first
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
  return cleaned
}

const normalizeTransactionBranch = (branchId?: string | null, email?: string | null) =>
  parseGlobalBranchScope(branchId, email)

const applyBranchListEntry = (
  branch: BranchListEntry,
  setters: {
    setSelectedBranchId: (id: string) => void
    setSelectedAuditLine: (line: string | null) => void
    setBranch: (name: string) => void
  },
) => {
  setters.setSelectedBranchId(branch.id)
  setters.setSelectedAuditLine(branch.auditLine || null)
  setters.setBranch(branch.name)
}

const syncAdminBranchFromGlobal = (
  globalId: string | null | undefined,
  branchesList: BranchListEntry[],
  email?: string | null,
  setters?: {
    setSelectedBranchId: (id: string) => void
    setSelectedAuditLine: (line: string | null) => void
    setBranch: (name: string) => void
  },
): BranchListEntry | null => {
  if (!globalId || !setters) return null
  const found = findBranchListEntry(globalId, branchesList, email)
  if (found) {
    applyBranchListEntry(found, setters)
    return found
  }
  const norm = parseGlobalBranchScope(globalId, email)
  setters.setSelectedBranchId(norm.branchId)
  setters.setSelectedAuditLine(norm.auditLine)
  setters.setBranch(norm.branchName)
  return null
}

const mkCash = (): CashTxRow   => ({ id: uid(), ticketNumber: '', customer: '', installer: '', amount: '' })
const mkRet  = (): CashRetRow  => ({ id: uid(), name: '', description: '', amount: '' })
const mkOnl  = (): OnlineTxRow => ({ id: uid(), ticketNumber: '', installer: '', customer: '', bank: '', amount: '' })
const mkChk  = (): CheckRow    => ({ id: uid(), ticketNumber: '', installer: '', customer: '', bank: '', amount: '' })
const mkPart = (): PartsSaleRow => ({ id: uid(), customer: '', description: '', amount: '', paymentMethod: 'CASH' })
const mkColl = (): ForCollRow  => ({ id: uid(), ticketNumber: '', installer: '', customer: '', amount: '', collectionResolved: false })
const mkReb  = (): RebateRow   => ({ id: uid(), ticketNumber: '', customer: '', company: '', raNumber: '', hp: '', amount: '' })

const mkOrd  = (): OrderRow    => ({ id: uid(), customer: '', description: '', amount: '', receiptReturned: false })
const mkPay  = (): OrderRow    => ({ id: uid(), customer: '', description: '', amount: '', receiptReturned: false })
const mkExp  = (): ExpenseRow  => ({ id: uid(), name: '', description: '', amount: '', receiptReturned: false, receiptImage: '', company: '', expenseCategory: '', sourceOfFunds: '' })
const mkInc  = (): IncentiveRow => ({ id: uid(), customer: '', company: '', hp: '', promodiser: '', amount: '', collectionResolved: false })
const mkComm = (): CommissionRow => ({ id: uid(), ticketNumber: '', store: '', diser: '', customer: '', brand: '', hp: '', dateInstalled: '', amount: '' })
const mkCashAdv = (): CashAdvanceRow => ({ id: uid(), memberName: '', details: '', amount: '' })
/** DTRs dated on/after this must have complete receipt documentation (see handleDtrSubmit). */
const DOCUMENTATION_REQUIRED_FROM = '2026-10-01'

const mkDeposit = (): DepositRow => ({ id: uid(), description: '', referenceNo: '', amount: '', receiptImage: '' })

// Temporarily hidden: saving a report with INCENTIVE items crashes the production backend
// (Jackson classpath mismatch — NoClassDefFoundError: JsonMappingException$Reference) until
// it's redeployed with a clean build. Hides the section and strips INCENTIVE rows from the
// submit payload so previously-saved incentive data doesn't retrigger the crash either.
const INCENTIVES_ENABLED = false

const getTrNoPrefix = (branchName: string, auditLine?: string | null) => {
  const clean = branchName.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // BIÑAN → BINAN so the ñ isn't stripped to "BIAN"
    .replace(/^(ASHCOL|ASHCOL\s*-)\s*/i, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()

  if (clean.includes('TAGUIG')) {
    if (auditLine === 'TAGUIG_SERVICE' || clean.includes('SERVICE') || clean.includes('SERVICES')) {
      return 'TGS'
    }
    return 'TGL'
  }
  const branchCodes: Array<[string[], string]> = [
    [['BINAN', 'BIÑAN', 'SAN PEDRO', 'SANPEDRO'], 'BIN'],
    [['DASMA', 'DASMARI', 'DASMARINAS'], 'DAS'],
    [['CALAUAN'], 'CAL'],
    [['CANDELARIA'], 'CAN'],
    [['VALENZUELA'], 'VAL'],
    [['RODRIGUEZ', 'RIZAL'], 'RIZ'],
    [['PAMPANGA'], 'PAM'],
    [['BULACAN'], 'BUL'],
    [['GENTRI', 'GEN TRI', 'GENERAL TRIAS'], 'GEN'],
    [['SILANG'], 'SIL'],
    [['STA ROSA', 'SANTA ROSA', 'TAGAYTAY'], 'STR'],
    [['BATANGAS'], 'BAT'],
    [['LAGUNA'], 'LAG'],
    [['HEAD OFFICE', 'MAIN OFFICE'], 'HOF'],
  ]

  for (const [matches, code] of branchCodes) {
    if (matches.some(match => clean.includes(match))) return code
  }

  const words = clean.split(/\s+/).filter(Boolean)
  return words.map(w => w[0]).join('').slice(0, 3).padEnd(3, 'X') || 'DTR'
}

const getTrNoDateCode = (date: string) => {
  const dateParts = date.split('-')
  const year = dateParts[0] || '2026'
  const yearShort = year.length >= 4 ? year.substring(2) : year
  const month = dateParts[1] || '01'
  const day = dateParts[2] || '01'
  return `${yearShort}${month}${day}`
}

const getRefundOptionText = (p: any) => {
  let worker = 'STAFF'
  let desc = p.description
  if (p.description && p.description.includes('|')) {
    const parts = p.description.split('|')
    worker = parts[0].trim()
    desc = parts[1].trim()
  }
  return `${worker} (REFUND - ${desc})`
}

const getWorkerName = (p: any) => {
  let worker = 'STAFF'
  if (p.description && p.description.includes('|')) {
    const parts = p.description.split('|')
    worker = parts[0].trim()
  }
  return worker
}

// ── Helper Components ─────────────────────────────────────────

const SectionHeader = ({ label, total, variant = 'neutral' }: { label: string; total?: number; variant?: 'income' | 'expense' | 'neutral' }) => {
  const styles = {
    income: {
      wrap: 'bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-900/40',
      label: 'text-emerald-800 dark:text-emerald-300',
      total: '#059669',
    },
    expense: {
      wrap: 'bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-900/40',
      label: 'text-red-800 dark:text-red-300',
      total: '#DC2626',
    },
    neutral: {
      wrap: 'bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800',
      label: 'text-slate-700 dark:text-slate-200',
      total: '#10B981',
    },
  }[variant]

  return (
    <div className={`px-4 py-3 flex items-center justify-between gap-2 ${styles.wrap}`}>
      <span className={`text-xs md:text-sm font-extrabold uppercase tracking-wider ${styles.label}`}>{label}</span>
      {total !== undefined && (
        <span className="text-sm md:text-base font-black tabular-nums" style={{ color: styles.total }}>
          ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )}
    </div>
  )
}

const AddRowBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button onClick={onClick} className="flex items-center gap-1.5 text-xs md:text-sm font-bold my-2 px-3 py-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-500 dark:hover:text-emerald-300 transition-all self-start ml-2">
    <Plus className="w-4 h-4" /> {label}
  </button>
)

const DelBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors shrink-0">
    <Trash2 className="w-4 h-4" />
  </button>
)

// ── Component ────────────────────────────────────────────────────────────────

export default function DTR_Form({ onSwitchToSummary }: { onSwitchToSummary?: () => void } = {}) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const location = useLocation()
  const isLight = theme === 'light'

  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'

  const role = (user?.role || '').toLowerCase()
  const jobTitleLower = (user?.jobTitle || '').trim().toLowerCase()
  const isSalesCoordinator = role === 'employee' && (
    jobTitleLower === 'sales coordinator'
    || jobTitleLower === 'coordinator'
    || jobTitleLower.includes('coor')
  )
  const isManager = role === 'manager' || role === 'oic' || isSalesCoordinator
  const canSubmit = role === 'manager' || role === 'staff' || isPortalAdmin(role) || role === 'employee' || role === 'oic'
  const isAdmin = isPortalAdmin(role)


  const today = new Date().toISOString().split('T')[0]

  const emailLower = (user?.email || '').toLowerCase()
  const normalizedAssignedBranch = normalizeTransactionBranch(user?.branchId, emailLower)
  
  const initialBranchId = normalizedAssignedBranch.branchId
  const initialAuditLine = normalizedAssignedBranch.auditLine
  const initialBranchName = normalizedAssignedBranch.branchName

  const [reportId, setReportId] = useState<string | null>(null)
  const [reportDate, setReportDate] = useState(today)
  const [receivedBy, setReceivedBy] = useState(user?.name || '')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [reviewMode, setReviewMode] = useState(false)
  const [isEditingExisting, setIsEditingExisting] = useState(false)
  const [reviewStartedAt, setReviewStartedAt] = useState<Date | null>(null)
  const [trNo, setTrNo]         = useState('')
  const [branchName, setBranch] = useState(initialBranchName)
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId)
  const [selectedAuditLine, setSelectedAuditLine] = useState<string | null>(initialAuditLine)
  const [branchesList, setBranchesList] = useState<BranchListEntry[]>([])
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id'),
  )
  // Submission metadata (populated when viewing existing report)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null)
  const [reportStatus, setReportStatus] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [checkingExistingReport, setCheckingExistingReport] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const trNoExample = branchName && reportDate
    ? `${getTrNoPrefix(branchName, selectedAuditLine)}-${getTrNoDateCode(reportDate)}`
    : 'DAS-260604'

  const canEditExistingReport = useMemo(() => {
    if (!reportId) return true
    return resolveCanEditExistingReport(
      { isAdmin, role, isManager, user, globalBranchId },
      {
        reportDate,
        status: reportStatus,
        branchId: selectedBranchId,
        auditLine: selectedAuditLine,
        submittedAt,
      },
    )
  }, [reportId, reportStatus, isAdmin, isManager, role, reportDate, user, selectedBranchId, selectedAuditLine, globalBranchId, submittedAt])

  const canEditOrSubmit = useMemo(() => {
    if (!canSubmit) return false
    if (reportId) return canEditExistingReport

    const selectedBranch = branchesList.find(
      b => b.id === selectedBranchId && (b.auditLine || null) === (selectedAuditLine || null),
    )

    if (selectedBranch && selectedBranch.isActive === false) {
      return false
    }

    if (isAdmin) {
      if (!globalBranchId) return false
      return branchEntryMatchesGlobal(
        { id: selectedBranchId, auditLine: selectedAuditLine, name: branchName },
        globalBranchId,
      )
    }

    return true
  }, [canSubmit, reportId, canEditExistingReport, selectedBranchId, selectedAuditLine, branchesList, isAdmin, globalBranchId, branchName])

  const isFormDisabled = !canEditOrSubmit || reviewMode || (!!reportId && !isEditingExisting)
  const isViewOnlyReport = !!reportId && !isEditingExisting && !reviewMode

  const ignoreNextCohFetch = useRef(false)
  const loadedReportDate = useRef<string | null>(null)
  const isTypingReportDate = useRef(false)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const loadedBranchId = useRef<string | null>(null)
  const loadedAuditLine = useRef<string | null>(null)
  const userInitiatedDateChange = useRef(false)
  const branchEmployeeNamesRef = useRef<string[]>([])
  const existingReportLookupCache = useRef<Map<string, any | null>>(new Map())
  // Expense Records linked to the loaded DTR's rows — the source of category/company/source when a row
  // (saved without them) is reopened, so a re-save never overwrites real values with defaults.
  const linkedExpenseCache = useRef<Map<string, AuditExpense>>(new Map())
  const linkedExpenseLoad = useRef<Promise<void>>(Promise.resolve())

  const lookupCacheKey = (date: string, branchId = selectedBranchId, auditLine = selectedAuditLine) =>
    `${branchId}|${auditLine || ''}|${date}`

  const invalidateLookupCache = (date?: string, branchId?: string, auditLine?: string | null) => {
    if (!date && !branchId) {
      existingReportLookupCache.current.clear()
      return
    }
    const key = lookupCacheKey(
      date || reportDate,
      branchId || selectedBranchId,
      auditLine === undefined ? selectedAuditLine : auditLine,
    )
    existingReportLookupCache.current.delete(key)
  }
  const datePickerLastValue = useRef<string | null>(null)
  const datePickerCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    const syncGlobal = () => setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    syncGlobal()
    window.addEventListener('ashcol-global-branch-change', syncGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncGlobal)
  }, [isAdmin])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (user && !reportId && !params.get('id')) {
      if (user.name && !receivedBy) {
        setReceivedBy(user.name)
      }
      if (isAdmin) return
      const emailLower = (user.email || '').toLowerCase()
      const norm = normalizeTransactionBranch(user.branchId, emailLower)
      if (norm.branchId) {
        setSelectedBranchId(norm.branchId)
        setSelectedAuditLine(norm.auditLine)
        setBranch(norm.branchName)
      }
    }
  }, [user, reportId, receivedBy, isAdmin])

  useEffect(() => {
    if (!canSubmit) return
    const loadBranchesList = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          const list: { id: string; name: string; isActive?: boolean }[] = (data?.data || data || []).map((b: { id: string; name: string; isActive?: boolean }) => ({ id: b.id, name: b.name, isActive: b.isActive }))
          const hasExplicitTaguigSales = list.some((b: { id: string; name: string; isActive?: boolean }) => {
            if (b.isActive === false) return false
            const id = b.id.toUpperCase()
            const name = b.name.toUpperCase()
            return id === 'BR-TAGUIG-SALES-EXPLICIT' || (name.includes('TAGUIG') && name.includes('SALES') && id !== 'BR-TAGUIG-SALES')
          })
          const hasExplicitTaguigServices = list.some((b: { id: string; name: string; isActive?: boolean }) => {
            if (b.isActive === false) return false
            const id = b.id.toUpperCase()
            const name = b.name.toUpperCase()
            return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || (name.includes('TAGUIG') && name.includes('SERVICE'))
          })

          const newList: { id: string; name: string; auditLine?: string; isActive?: boolean }[] = []
          for (const b of list) {
            const cleanName = b.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
            if (cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG') {
              if (!hasExplicitTaguigSales) newList.push({ id: b.id, name: 'TAGUIG - SALES', auditLine: 'TAGUIG_SALES', isActive: true })
              if (!hasExplicitTaguigServices) newList.push({ id: b.id, name: 'TAGUIG - SERVICES', auditLine: 'TAGUIG_SERVICE', isActive: true })
            } else if (cleanName.includes('TAGUIG')) {
              const isServ = cleanName.includes('SERVICE')
              newList.push({
                id: b.id,
                name: isServ ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES',
                auditLine: isServ ? 'TAGUIG_SERVICE' : 'TAGUIG_SALES',
                isActive: true
              })
            } else {
              newList.push({ id: b.id, name: cleanName, isActive: b.isActive })
            }
          }
          // Keep all branches (even if inactive; submission is checked separately)
          let finalList = [...newList]

          // Guarantee Taguig Sales and Taguig Services are NEVER missing
          const detectedSalesBranch = list.find(b => {
            const id = b.id.toUpperCase()
            const name = b.name.toUpperCase()
            return (id.includes('TAGUIG') || name.includes('TAGUIG')) && (id.includes('SALES') || name.includes('SALES') || (!id.includes('SERVICE') && !name.includes('SERVICE')))
          })
          const detectedServiceBranch = list.find(b => {
            const id = b.id.toUpperCase()
            const name = b.name.toUpperCase()
            return (id.includes('TAGUIG') || name.includes('TAGUIG')) && (id.includes('SERVICE') || name.includes('SERVICE'))
          })

          if (!finalList.some(b => b.name === 'TAGUIG - SALES')) {
            finalList.push({
              id: detectedSalesBranch?.id || 'BR-TAGUIG-SALES',
              name: 'TAGUIG - SALES',
              auditLine: 'TAGUIG_SALES',
              isActive: true,
            })
          }
          if (!finalList.some(b => b.name === 'TAGUIG - SERVICES')) {
            finalList.push({
              id: detectedServiceBranch?.id || 'BR-TAGUIG-SERVICES',
              name: 'TAGUIG - SERVICES',
              auditLine: 'TAGUIG_SERVICE',
              isActive: true,
            })
          }

          // Deduplicate by name and auditLine
          const seen = new Set<string>()
          finalList = finalList.filter(b => {
            const key = `${b.name}|${b.auditLine || ''}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })

          finalList.sort((a, b) => a.name.localeCompare(b.name))
          setBranchesList(finalList)

          const params = new URLSearchParams(window.location.search)
          const isEditingExistingReport = !!(reportId || params.get('id'))
          if (finalList.length > 0 && isAdmin && !isEditingExistingReport) {
            const branchSetters = {
              setSelectedBranchId,
              setSelectedAuditLine,
              setBranch,
            }
            const globalId = localStorage.getItem('ashcol-global-branch-id')
            const activeEntry = globalId ? findBranchListEntry(globalId, finalList, user?.email) : null
            const currentEntry = findBranchListEntry(selectedBranchId, finalList, user?.email)
            if (activeEntry) {
              const sameAsActive = currentEntry?.id === activeEntry.id
                && (currentEntry.auditLine || null) === (activeEntry.auditLine || null)
              if (!sameAsActive) {
                applyBranchListEntry(activeEntry, branchSetters)
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading branches list:', err)
      }
    }
    loadBranchesList()
  }, [canSubmit, isAdmin, reportId])

  useEffect(() => {
    if (!isAdmin) return
    const syncFromGlobal = (isInitial = false) => {
      if (isInitial) {
        const params = new URLSearchParams(window.location.search)
        if (reportId || params.get('id')) return
      }
      ignoreNextCohFetch.current = false
      const gId = localStorage.getItem('ashcol-global-branch-id')
      if (!gId) return

      syncAdminBranchFromGlobal(gId, branchesList, user?.email, {
        setSelectedBranchId,
        setSelectedAuditLine,
        setBranch,
      })
    }

    syncFromGlobal(true)
    const handleSync = () => {
      syncFromGlobal(false)
      const params = new URLSearchParams(window.location.search)
      const isEditing = !!(reportId || params.get('id'))
      if (isEditing) {
        setReportId(null)
        clearForm(true)
        loadedReportDate.current = null
        loadedBranchId.current = null
        loadedAuditLine.current = null
        const url = new URL(window.location.href)
        url.searchParams.delete('id')
        window.history.replaceState({}, '', url.toString())
      }
    }
    window.addEventListener('ashcol-global-branch-change', handleSync)
    return () => window.removeEventListener('ashcol-global-branch-change', handleSync)
  }, [isAdmin, branchesList, user, reportId])

  useEffect(() => {
    if (!reviewMode) return
    const scrollToTop = () => {
      const mainEl = document.querySelector('main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'auto' })
      }
      window.scrollTo({ top: 0, behavior: 'auto' })
      document.documentElement.scrollTo({ top: 0, behavior: 'auto' })
      document.body.scrollTo({ top: 0, behavior: 'auto' })
    }
    
    // Scroll immediately and on a short delay to handle layout adjustments after entering review mode
    scrollToTop()
    const t = setTimeout(scrollToTop, 50)
    return () => clearTimeout(t)
  }, [reviewMode])

  // Cash Transactions
  const [cashTx, setCashTx]     = useState<CashTxRow[]>([mkCash()])
  const [syncLoading, setSyncLoading] = useState(false)
  const [rebateSyncLoading, setRebateSyncLoading] = useState(false)
  const [commissionSyncLoading, setCommissionSyncLoading] = useState(false)
  // Cash Returns
  const [cashRet, setCashRet]   = useState<CashRetRow[]>([mkRet()])
  // Fund Transfer from HO
  const [cashOnHand, setCashOnHand]     = useState('')
  // Ending balance of the most recent earlier DTR — cash on hand must chain from it.
  const [prevDayCoh, setPrevDayCoh]     = useState<{ amount: number; date: string } | null>(null)
  // Admin acknowledgement that a cash-on-hand mismatch with the previous DTR is intentional.
  const [cohOverrideAck, setCohOverrideAck] = useState(false)
  const [fundFromHo, setFundFromHo]     = useState('')
  // Online Transactions
  const [onlineTx, setOnlineTx]         = useState<OnlineTxRow[]>([mkOnl()])
  // Check Remits
  const [checkRem, setCheckRem]         = useState<CheckRow[]>([mkChk()])
  // Parts Sales / Unit Sales
  const [partsSales, setPartsSales]     = useState<PartsSaleRow[]>([mkPart()])
  // For Collection
  const [forColl, setForColl]           = useState<ForCollRow[]>([mkColl()])
  // Rebates
  const [rebates, setRebates]           = useState<RebateRow[]>([mkReb()])
  // Commission Expenses
  const [commissions, setCommissions]   = useState<CommissionRow[]>([mkComm()])
  // Parts Order / Units Order
  const [orders, setOrders]             = useState<OrderRow[]>([mkOrd()])
  // Payables
  const [payables, setPayables]         = useState<OrderRow[]>([mkPay()])
  // Expenses with Receipts
  const [expReceipt, setExpReceipt]     = useState<ExpenseRow[]>([mkExp()])
  const [receiptDialog, setReceiptDialog] = useState<{ mode: 'expense' | 'deposit'; rowId: string } | null>(null)
  // Cash Advance
  const [cashAdvances, setCashAdvances] = useState<CashAdvanceRow[]>([mkCashAdv()])
  // Bank Deposits (cash physically dropped off at the company bank)
  const [deposits, setDeposits] = useState<DepositRow[]>([])
  // Purchases (separate cash-out category, never counted in or synced to Expenses)
  const [expPurch, setExpPurch]         = useState<ExpenseRow[]>([mkExp()])
  // Incentives
  const [incentives, setIncentives]     = useState<IncentiveRow[]>([mkInc()])
  // Unit summary
  const [scheduledUnits, setScheduledUnits]     = useState('0')
  const [surveyOnlyUnits, setSurveyOnlyUnits]   = useState('0')
  const [rescheduledUnits, setRescheduledUnits] = useState('0')
  const [installedUnits, setInstalledUnits]     = useState('0')
  const [servicedUnits, setServicedUnits]       = useState('0')
  const [cancelledUnits, setCancelledUnits]     = useState('0')
  const [freeInstallUnits, setFreeInstallUnits] = useState('0')

  // (Draft state removed)

  // ── Auto Prefill & Suggestions Hook ──────────────────────────────
  const [techSuggestions, setTechSuggestions] = useState<string[]>([])
  const [refundablePurchases, setRefundablePurchases] = useState<any[]>([])

  // Fetch branch details, closing cash, and rosters
  useEffect(() => {
    if (!selectedBranchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const headers = { Authorization: `Bearer ${token}` }

    const loadBranchData = async () => {
      try {
        if (!isAdmin) {
          const resBranch = await fetch(`${API_BASE_URL}/branches/${selectedBranchId}`, { headers })
          if (resBranch.ok) {
            const data = await resBranch.json()
            if (data?.data?.name) {
              const cleanName = data.data.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
              if (cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG') {
                setBranch(selectedAuditLine === 'TAGUIG_SERVICE' ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES')
              } else {
                setBranch(cleanName)
              }
            }
          }
        }

        const cleanBranchIdForPurchases = selectedBranchId.replace(/-(sales|services)$/, '')
        const [resEmployees, resPurchases] = await Promise.all([
          fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers }),
          fetch(`${API_BASE_URL}/v1/reports/purchases?branchId=${cleanBranchIdForPurchases}`, { headers }),
        ])

        const employeeNames: string[] = []
        if (resEmployees.ok) {
          const data = await resEmployees.json()
          const list = data?.data || []
          list.forEach((emp: any) => {
            const empBranch = normalizeTransactionBranch(emp.branchId, emp.email).branchId
            if (empBranch === selectedBranchId && emp.isActive !== false && emp.name?.trim()) {
              employeeNames.push(cleanInstallerName(emp.name, branchName))
            }
          })
        }
        branchEmployeeNamesRef.current = employeeNames

        if (resPurchases && resPurchases.ok) {
          const purchasesData = await resPurchases.json()
          const refPurchases = (purchasesData || []).filter((p: any) => p.receiptReturned && p.amount > p.actualAmount)
          setRefundablePurchases(refPurchases)
        } else {
          setRefundablePurchases([])
        }
      } catch (err) {
        console.error('Error loading branch data:', err)
      }
    }

    loadBranchData()
  }, [selectedBranchId, selectedAuditLine, isAdmin, branchName])

  useEffect(() => {
    invalidateLookupCache()
  }, [selectedBranchId, selectedAuditLine])

  // Reference balance for the cash-on-hand chain check (new and reopened reports alike).
  useEffect(() => {
    setCohOverrideAck(false)
    if (!selectedBranchId || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || reportDate < DOCUMENTATION_REQUIRED_FROM) {
      setPrevDayCoh(null)
      return
    }
    let cancelled = false
    findPreviousDayCoh(selectedBranchId, selectedAuditLine, reportDate)
      .then(prev => { if (!cancelled) setPrevDayCoh(prev) })
      .catch(err => {
        console.error('[prevDayCoh] Failed to load previous DTR balance:', err)
        if (!cancelled) setPrevDayCoh(null)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, selectedAuditLine, reportDate])

  useEffect(() => {
    if (!selectedBranchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const headers = { Authorization: `Bearer ${token}` }

    const loadDateData = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const isEditing = !!(reportId || urlParams.get('id'))
        if (!isEditing && !ignoreNextCohFetch.current && !userInitiatedDateChange.current) {
          const existing = await lookupExistingReport(reportDate, { skipCache: true })
          if (existing?.id) {
            void loadExistingReportById(existing.id, reportDate)
            return
          }
          setCashOnHand('')
          // No report yet for this date — prefill COH from yesterday's ending balance (already net
          // of any bank deposit recorded that day) instead of leaving staff to retype it from memory.
          try {
            const prev = await findPreviousDayCoh(selectedBranchId, selectedAuditLine, reportDate)
            if (prev) setCashOnHand(String(prev.amount))
          } catch (err) {
            console.error('[loadDateData] Failed to prefill COH from previous day:', err)
          }
        }

        const lineupQueryBranchId = selectedAuditLine
          ? `${selectedBranchId}-${selectedAuditLine === 'TAGUIG_SERVICE' ? 'services' : 'sales'}`
          : selectedBranchId

        const [resLineup, resService] = await Promise.all([
          fetch(`${API_BASE_URL}/v1/lineup?date=${reportDate}&branchId=${lineupQueryBranchId}`, { headers }),
          fetch(`${API_BASE_URL}/v1/service-reports?date=${reportDate}&branchId=${selectedBranchId}`, { headers }),
        ])

        const namesSet = new Set<string>(branchEmployeeNamesRef.current)

        if (resLineup.ok) {
          const list = await resLineup.json()
          list.forEach((r: any) => {
            if (r.installerName?.trim()) namesSet.add(cleanInstallerName(r.installerName, branchName))
            if (r.driverName?.trim()) namesSet.add(cleanInstallerName(r.driverName, branchName))
          })
        }

        if (resService.ok) {
          const list = await resService.json()
          list.forEach((r: any) => {
            if (selectedAuditLine) {
              const type = (r.serviceType || '').toUpperCase()
              const code = (r.statusCode || '').toUpperCase()
              const isSales = type.includes('INSTALL') || code === 'I'
              const isServiceTarget = selectedAuditLine === 'TAGUIG_SERVICE'
              if (isSales === isServiceTarget) return
            }
            if (r.technicianName?.trim()) {
              r.technicianName.split(/[,/&]+/).forEach((n: string) => {
                const cleaned = cleanInstallerName(n, branchName)
                if (cleaned) namesSet.add(cleaned)
              })
            }
          })
        }

        setTechSuggestions(Array.from(namesSet).sort())
      } catch (err) {
        console.error('Error pre-filling date data:', err)
      } finally {
        ignoreNextCohFetch.current = false
      }
    }

    loadDateData()
  }, [reportDate, selectedBranchId, selectedAuditLine, isAdmin, reportId])

  // ── Auto-prefill Cash & Online Transactions from schedule ──
  useEffect(() => {
    // Only auto-prefill when creating a new report (no reportId) and branch/date are set
    if (reportId || !selectedBranchId || !reportDate) return
    const hasCashData = cashTx.some(r => r.customer || r.installer || r.amount)
    const hasRebateData = rebates.some(r => r.ticketNumber || r.customer || r.company || r.amount)
    const hasCommissionData = commissions.some(r => r.ticketNumber || r.customer || r.store || r.diser || r.amount)
    if (hasCashData && hasRebateData && hasCommissionData) return

    const scheduleBranchId = selectedAuditLine
      ? `${selectedBranchId.replace(/-(sales|services)$/i, '')}-${selectedAuditLine === 'TAGUIG_SERVICE' ? 'services' : 'sales'}`
      : selectedBranchId.replace(/-(sales|services)$/i, '')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    const prefillOptions = {
      branchId: scheduleBranchId,
      dateKey: reportDate,
      branchName: branchName,
      signal: controller.signal,
    }

    Promise.all([
      fetchAndMapTickets(prefillOptions),
      fetchAndMapOnlineTickets(prefillOptions),
      fetchAndMapCheckTickets(prefillOptions),
      fetchAndMapForCollTickets(prefillOptions),
      fetchAndCountUnitSummary(prefillOptions),
      fetchAndMapRebateTickets(prefillOptions),
      fetchAndMapCommissionTickets(prefillOptions),
    ]).then(([cashResult, onlineResult, checkResult, forCollResult, unitSummaryResult, rebateResult, commissionResult]) => {
      clearTimeout(timeout)
      if (!hasCashData) {
        if (cashResult.ok && cashResult.rows.length > 0) setCashTx(cashResult.rows)
        if (onlineResult.ok && onlineResult.rows.length > 0) setOnlineTx(onlineResult.rows)
        if (checkResult.ok && checkResult.rows.length > 0) setCheckRem(checkResult.rows)
        if (forCollResult.ok && forCollResult.rows.length > 0) setForColl(forCollResult.rows)
        if (unitSummaryResult.ok) {
          setScheduledUnits(String(unitSummaryResult.counts.scheduledUnits))
          setRescheduledUnits(String(unitSummaryResult.counts.rescheduledUnits))
          setInstalledUnits(String(unitSummaryResult.counts.installedUnits))
          setServicedUnits(String(unitSummaryResult.counts.servicedUnits))
          setCancelledUnits(String(unitSummaryResult.counts.cancelledUnits))
          setFreeInstallUnits(String(unitSummaryResult.counts.freeInstallUnits))
          setSurveyOnlyUnits(String(unitSummaryResult.counts.surveyOnlyUnits))
        }
      }
      if (!hasRebateData && rebateResult.ok && rebateResult.rows.length > 0) {
        setRebates(rebateResult.rows)
      }
      if (!hasCommissionData && commissionResult.ok && commissionResult.rows.length > 0) {
        setCommissions(commissionResult.rows)
      }
    }).catch(() => {
      clearTimeout(timeout)
    })

    return () => { controller.abort(); clearTimeout(timeout) }
  }, [reportDate, selectedBranchId, selectedAuditLine, reportId])

  const fetchReportDetails = async (id: string, options?: { enterEditMode?: boolean }) => {
    console.log('[fetchReportDetails] Requested ID:', id)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      console.log('[fetchReportDetails] Response Status:', res.status)
      if (!res.ok) {
        const text = await res.text()
        console.error('[fetchReportDetails] Error body:', text)
        throw new Error(`Failed to fetch report details (HTTP ${res.status})`)
      }
      const data = await res.json()
      console.log('[fetchReportDetails] Response Data:', data)

      // Set ignoreNextCohFetch to true so that the branch details/COH pre-fill useEffect doesn't overwrite cashOnHand
      ignoreNextCohFetch.current = true

      // Restore branch from the report so no useEffect overrides it
      if (data.branchId) {
        setSelectedBranchId(data.branchId)
        loadedBranchId.current = data.branchId
        setSelectedAuditLine(data.auditLine || null)
        loadedAuditLine.current = data.auditLine || null
        if (data.branchName) {
          const cleanName = data.branchName.replace(/^(ashcol\s+)/i, '').toUpperCase()
          setBranch(cleanName)
        }
      }

      // Populate metadata
      setReportDate(data.reportDate)
      loadedReportDate.current = data.reportDate
      const rawReceivedBy = (data.receivedBy || '').trim()
      setReceivedBy(rawReceivedBy ? formatDisplayUserLabel(rawReceivedBy) : (user?.name || ''))
      setTrNo(data.trNo || '')
      setCashOnHand(data.cohPreviousDay != null && data.cohPreviousDay !== 0 ? String(data.cohPreviousDay) : '')
      setFundFromHo(data.fundFromHo != null && data.fundFromHo !== 0 ? String(data.fundFromHo) : '')
      // Submission metadata
      setSubmittedAt(data.createdAt || null)
      setLastUpdatedAt(data.updatedAt || null)
      setLastUpdatedBy(data.updatedBy || null)
      setReportStatus(data.status || 'SUBMITTED')

      // Populate rebates
      const rebatesList: RebateRow[] = []
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.type === 'REBATE') {
            const desc = item.description || ''
            const parts = desc.startsWith('REBATE|') ? desc.split('|') : ['', '', '']
            const raNumber = parts[1] || ''
            const hpRaw = parts[2] || ''
            const hp = hpRaw.replace(/hp/i, '').trim()
            const amt = item.amount != null ? String(item.amount) : ''
            rebatesList.push({
              id: uid(),
              ticketNumber: item.ticketNumber || item.ticket_number || '',
              customer: item.customer || '',
              company: item.company || '',
              raNumber,
              hp,
              amount: amt
            })
          }
        })
      }
      if (rebatesList.length === 0 && data.rebatesForCollection != null && data.rebatesForCollection > 0) {
        rebatesList.push({
          id: uid(),
          ticketNumber: '',
          customer: '',
          company: 'Rebates',
          raNumber: '',
          hp: '',
          amount: String(data.rebatesForCollection)
        })
      }
      setRebates(rebatesList.length > 0 ? rebatesList : [mkReb()])

      // Populate commission expenses
      const commissionsList: CommissionRow[] = []
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.type === 'COMMISSION') {
            let brandVal = item.bank || item.brand || ''
            let hpVal = item.hp || ''
            if (!brandVal && item.description && item.description.startsWith('COMMISSION|')) {
              const parts = item.description.split('|')
              if (parts.length > 2) brandVal = parts[2]
              if (parts.length > 3 && !hpVal) hpVal = parts[3]
            }
            commissionsList.push({
              id: uid(),
              ticketNumber: item.ticketNumber || item.ticket_number || '',
              store: item.company || '',
              diser: item.promodiser || '',
              customer: item.customer || '',
              brand: brandVal,
              hp: hpVal,
              dateInstalled: item.dateInstalled || item.date_installed || '',
              amount: item.amount != null ? String(item.amount) : '',
            })
          }
        })
      }
      if (commissionsList.length === 0 && data.commissionExpensesTotal != null && data.commissionExpensesTotal > 0) {
        commissionsList.push({
          id: uid(),
          ticketNumber: '',
          store: '',
          diser: '',
          customer: '',
          brand: '',
          hp: '',
          dateInstalled: '',
          amount: String(data.commissionExpensesTotal),
        })
      }
      setCommissions(commissionsList.length > 0 ? commissionsList : [mkComm()])

      // Populate incentives
      const incentivesList: IncentiveRow[] = []
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.type === 'INCENTIVE') {
            // Dedicated hp/promodiser columns (V100 migration) are the source of truth — fall
            // back to parsing the legacy packed description for rows saved before that existed.
            let hp = item.hp || ''
            let promodiser = item.promodiser || ''
            if (!hp && !promodiser) {
              const desc = item.description || ''
              const parts = desc.startsWith('INCENTIVE|') ? desc.split('|') : ['', '', '']
              promodiser = parts[1] || ''
              hp = (parts[2] || '').replace(/hp/i, '').trim()
            }
            const amt = item.amount != null ? String(item.amount) : ''
            incentivesList.push({
              id: uid(),
              customer: item.customer || '',
              company: item.company || '',
              hp,
              promodiser,
              amount: amt,
              collectionResolved: item.collectionResolved || false
            })
          }
        })
      }
      setIncentives(incentivesList.length > 0 ? incentivesList : [mkInc()])

      // Populate units
      setScheduledUnits(data.totalUnitsScheduled != null ? String(data.totalUnitsScheduled) : '0')
      setSurveyOnlyUnits(data.totalUnitsSurveyOnly != null ? String(data.totalUnitsSurveyOnly) : '0')
      setRescheduledUnits(data.totalRescheduled != null ? String(data.totalRescheduled) : '0')
      const loadedInstalled = data.totalUnitsInstalled ?? data.totalUnitsInstalledServiced
      setInstalledUnits(loadedInstalled != null ? String(loadedInstalled) : '0')
      setServicedUnits(data.totalUnitsServiced != null ? String(data.totalUnitsServiced) : '0')
      setCancelledUnits(data.totalUnitsCancelled != null ? String(data.totalUnitsCancelled) : '0')
      setFreeInstallUnits(data.totalUnitsFreeInstall != null ? String(data.totalUnitsFreeInstall) : '0')

      // Map items lists
      const cashSales: CashTxRow[] = []
      const cashReturnsList: CashRetRow[] = []
      const partsSalesList: PartsSaleRow[] = []
      const onlineTxList: OnlineTxRow[] = []
      const checkRemList: CheckRow[] = []
      const expReceiptList: ExpenseRow[] = []
      const cashAdvancesList: CashAdvanceRow[] = []
      const depositsList: DepositRow[] = []
      const expPurchList: ExpenseRow[] = []
      const ordersList: OrderRow[] = []
      const forCollList: ForCollRow[] = []
      const payablesList: OrderRow[] = []

      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const type = item.type
          const desc = item.description || ''
          const amt = item.amount != null ? String(item.amount) : ''

          if (type === 'CASH_SALE') {
            if (desc.startsWith('PARTS|')) {
              const parts = desc.split('|')
              partsSalesList.push({
                id: uid(),
                customer: parts[1] || '',
                description: parts[2] || '',
                amount: amt,
                paymentMethod: 'CASH'
              })
            } else if (desc.startsWith('RETURN|')) {
              const [retName = '', ...retDesc] = desc.replace('RETURN|', '').split('|')
              cashReturnsList.push({
                id: uid(),
                name: formatDisplayUserLabel(retName),
                description: retDesc.join('|'),
                amount: amt
              })
            } else {
              cashSales.push({
                id: uid(),
                customer: item.customer || '',
                installer: formatDisplayUserLabel(desc),
                amount: amt
              })
            }
          } else if (type === 'ONLINE_SALE') {
            if (desc.startsWith('PARTS|')) {
              const parts = desc.split('|')
              partsSalesList.push({
                id: uid(),
                customer: parts[1] || '',
                description: parts[2] || '',
                amount: amt,
                paymentMethod: 'ONLINE'
              })
            } else if (desc.startsWith('CHECK|')) {
              checkRemList.push({
                id: uid(),
                installer: formatDisplayUserLabel(desc.replace('CHECK|', '')),
                customer: item.customer || '',
                bank: item.bank || '',
                amount: amt
              })
            } else {
              onlineTxList.push({
                id: uid(),
                installer: formatDisplayUserLabel(desc),
                customer: item.customer || '',
                bank: item.bank || '',
                amount: amt
              })
            }
          } else if (type === 'EXPENSE') {
            const parts = desc.split('|')
            expReceiptList.push({
              id: uid(),
              name: parts[0] ? formatDisplayUserLabel(parts[0]) : '',
              description: parts[1] || '',
              amount: amt,
              receiptReturned: item.receiptReturned || false,
              actualAmount: item.actualAmount != null ? String(item.actualAmount) : '',
              receiptNo: item.receiptNo || '',
              receiptDate: item.receiptDate || '',
              resolvedExpenseId: item.resolvedExpenseId || '',
              receiptStatus: item.receiptStatus || '',
              receiptImage: item.receiptImage || '',
              company: item.company || ''
            })
          } else if (type === 'CASH_ADVANCE') {
            const parts = desc.split('|')
            cashAdvancesList.push({
              id: uid(),
              memberName: parts[0] ? formatDisplayUserLabel(parts[0]) : '',
              details: parts[1] || '',
              amount: amt,
              resolvedExpenseId: item.resolvedExpenseId || ''
            })
          } else if (type === 'DEPOSIT') {
            depositsList.push({
              id: uid(),
              description: desc || '',
              referenceNo: item.receiptNo || '',
              amount: amt,
              receiptImage: item.receiptImage || '',
              bank: item.bank || '',
              resolvedExpenseId: item.resolvedExpenseId || ''
            })
          } else if (type === 'PURCHASE') {
            if (desc.startsWith('ORDER|')) {
              const parts = desc.split('|')
              ordersList.push({
                id: uid(),
                customer: parts[1] || '',
                description: parts[2] || '',
                amount: amt,
                receiptReturned: item.receiptReturned || false,
                actualAmount: item.actualAmount != null ? String(item.actualAmount) : '',
                receiptNo: item.receiptNo || '',
                receiptDate: item.receiptDate || '',
                resolvedExpenseId: item.resolvedExpenseId || '',
                receiptStatus: item.receiptStatus || ''
              })
            } else {
              const parts = desc.split('|')
              expPurchList.push({
                id: uid(),
                name: parts[0] ? formatDisplayUserLabel(parts[0]) : '',
                description: parts[1] || '',
                amount: amt,
                receiptReturned: item.receiptReturned || false,
                actualAmount: item.actualAmount != null ? String(item.actualAmount) : '',
                receiptNo: item.receiptNo || '',
                receiptDate: item.receiptDate || '',
                resolvedExpenseId: item.resolvedExpenseId || '',
                receiptStatus: item.receiptStatus || '',
                receiptImage: item.receiptImage || '',
                company: item.company || ''
              })
            }
          } else if (type === 'COLLECTION') {
            forCollList.push({
              id: uid(),
              installer: desc ? formatDisplayUserLabel(desc) : '',
              customer: item.customer || '',
              amount: amt,
              collectionResolved: item.collectionResolved || false
            })
          } else if (type === 'PAYABLE') {
            const parts = desc.split('|')
            payablesList.push({
              id: uid(),
              customer: parts[1] || '',
              description: parts[2] || '',
              amount: amt,
              receiptReturned: false,
              actualAmount: '',
              receiptNo: '',
              receiptDate: '',
              resolvedExpenseId: '',
              receiptStatus: ''
            })
          }
        })
      }

      if (forCollList.length === 0 && data.forCollection != null && data.forCollection > 0) {
        forCollList.push({
          id: uid(),
          installer: 'Scanned Collection',
          customer: '',
          amount: String(data.forCollection),
          collectionResolved: false
        })
      }

      // Map item lists with fallback for Excel imports
      if (cashSales.length === 0 && data.totalCashRemits != null && Number(data.totalCashRemits) > 0) {
        cashSales.push({
          id: uid(),
          customer: 'Imported Total',
          installer: '',
          amount: String(data.totalCashRemits)
        })
      }
      setCashTx(cashSales.length > 0 ? cashSales : [mkCash()])

      if (cashReturnsList.length === 0 && data.cashReturns != null && Number(data.cashReturns) > 0) {
        cashReturnsList.push({
          id: uid(),
          name: 'Imported Returns',
          description: '',
          amount: String(data.cashReturns)
        })
      }
      setCashRet(cashReturnsList.length > 0 ? cashReturnsList : [mkRet()])

      setPartsSales(partsSalesList.length > 0 ? partsSalesList : [mkPart()])

      if (onlineTxList.length === 0 && data.totalOnlineRemits != null && Number(data.totalOnlineRemits) > 0) {
        onlineTxList.push({
          id: uid(),
          installer: '',
          customer: 'Imported Total',
          bank: '',
          amount: String(data.totalOnlineRemits)
        })
      }
      setOnlineTx(onlineTxList.length > 0 ? onlineTxList : [mkOnl()])

      setCheckRem(checkRemList.length > 0 ? checkRemList : [mkChk()])

      if (expReceiptList.length === 0 && data.totalExpenses != null && Number(data.totalExpenses) > 0) {
        expReceiptList.push({
          id: uid(),
          name: 'Imported Total',
          description: '',
          amount: String(data.totalExpenses),
          receiptReturned: false,
          actualAmount: '',
          receiptNo: '',
          receiptDate: '',
          resolvedExpenseId: '',
          receiptStatus: '',
          receiptImage: ''
        })
      }
      setExpReceipt(expReceiptList.length > 0 ? expReceiptList : [mkExp()])
      linkedExpenseCache.current = new Map()
      linkedExpenseLoad.current = Promise.resolve()
      const linkedIds = new Set(expReceiptList.map(r => r.resolvedExpenseId).filter(Boolean) as string[])
      if (linkedIds.size > 0) {
        linkedExpenseLoad.current = loadAuditExpenses().then(all => {
          const byId = new Map(all.filter(e => linkedIds.has(e.id)).map(e => [e.id, e] as const))
          linkedExpenseCache.current = byId
          setExpReceipt(prev => prev.map(r => {
            const rec = r.resolvedExpenseId ? byId.get(r.resolvedExpenseId) : undefined
            if (!rec) return r
            return {
              ...r,
              company: r.company || rec.company || '',
              expenseCategory: r.expenseCategory || rec.expenseCategory || '',
              sourceOfFunds: r.sourceOfFunds || rec.sourceOfFunds || '',
              receiptDate: r.receiptDate || rec.date || '',
            }
          }))
        }).catch(err => {
          console.error('[fetchReportDetails] Failed to load linked expense records:', err)
        })
      }
      setCashAdvances(cashAdvancesList.length > 0 ? cashAdvancesList : [mkCashAdv()])
      setDeposits(depositsList)

      if (expPurchList.length === 0 && data.totalForPurchase != null && Number(data.totalForPurchase) > 0) {
        expPurchList.push({
          id: uid(),
          name: 'Imported Total',
          description: '',
          amount: String(data.totalForPurchase),
          receiptReturned: false,
          actualAmount: '',
          receiptNo: '',
          receiptDate: '',
          resolvedExpenseId: '',
          receiptStatus: '',
          receiptImage: '',
          company: ''
        })
      }
      setExpPurch(expPurchList.length > 0 ? expPurchList : [mkExp()])

      setOrders(ordersList.length > 0 ? ordersList : [mkOrd()])
      setPayables(payablesList.length > 0 ? payablesList : [mkPay()])
      setForColl(forCollList.length > 0 ? forCollList : [mkColl()])

      if (options?.enterEditMode) {
        const canEdit = resolveCanEditExistingReport(
          { isAdmin, role, isManager, user },
          {
            reportDate: data.reportDate,
            status: data.status || 'SUBMITTED',
            branchId: data.branchId,
            auditLine: data.auditLine || null,
          },
        )
        setIsEditingExisting(canEdit)
      } else {
        setIsEditingExisting(false)
      }

      return data
    } catch (err) {
      console.error('[fetchReportDetails] Error:', err)
      const msg = err instanceof Error ? err.message : 'Error loading existing DTR report details.'
      setError(msg)
      return null
    }
  }

  // Generate TR No suggestion based on branch initials and date
  useEffect(() => {
    if (reportId) return
    if (branchName && reportDate) {
      const prefix = getTrNoPrefix(branchName, selectedAuditLine)
      setTrNo(`${prefix}-${getTrNoDateCode(reportDate)}`)
    }
  }, [branchName, reportDate, selectedAuditLine])

  const clearForm = (clearTrNo = true) => {
    setError(null)
    setSuccess(false)
    setReportId(null)
    setIsEditingExisting(false)
    ignoreNextCohFetch.current = false
    if (clearTrNo) setTrNo('')
    setCashOnHand('')
    setFundFromHo('')
    setCashTx([mkCash()])
    setCashRet([mkRet()])
    setOnlineTx([mkOnl()])
    setCheckRem([mkChk()])
    setPartsSales([mkPart()])
    setForColl([mkColl()])
    setRebates([mkReb()])
    setCommissions([mkComm()])
    setOrders([mkOrd()])
    setExpReceipt([mkExp()])
    setCashAdvances([mkCashAdv()])
    setDeposits([])
    setExpPurch([mkExp()])
    setScheduledUnits('0')
    setSurveyOnlyUnits('0')
    setRescheduledUnits('0')
    setInstalledUnits('0')
    setServicedUnits('0')
    setCancelledUnits('0')
    setFreeInstallUnits('0')
  }

  // Walks back from `date` (up to 7 days, so Mondays see Saturday's DTR) to the latest earlier DTR.
  // Plain fetch on purpose: it must not touch existingReportLookupCache, which is keyed by the selected branch.
  const findPreviousDayCoh = async (branchId: string, auditLine: string | null, date: string) => {
    if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const { year, month, day } = getIsoDateParts(date)
    for (let back = 1; back <= 7; back++) {
      const d = new Date(year, month - 1, day - back)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const params = new URLSearchParams({ branchId, date: dateStr })
      if (auditLine) params.set('auditLine', auditLine)
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/lookup?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) continue
      const data = await res.json()
      if (data?.found && data?.id && data.totalCohCfd != null) {
        return { amount: Number(data.totalCohCfd), date: dateStr }
      }
    }
    return null
  }

  const lookupExistingReport = async (date: string, options?: { skipCache?: boolean }) => {
    if (!selectedBranchId || !date) return null
    const cacheKey = lookupCacheKey(date)
    if (!options?.skipCache && existingReportLookupCache.current.has(cacheKey)) {
      return existingReportLookupCache.current.get(cacheKey)
    }

    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const params = new URLSearchParams({
      branchId: selectedBranchId,
      date,
    })
    if (selectedAuditLine) params.set('auditLine', selectedAuditLine)

    const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/lookup?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    let row = null
    if (res.ok) {
      const data = await res.json()
      if (data?.found && data?.id) {
        row = data
      }
    }
    existingReportLookupCache.current.set(cacheKey, row)
    return row
  }

  const formatExpenseDate = (dateStr?: string) => {
    if (dateStr) {
      const parsed = parseSmartDate(dateStr)
      if (parsed) return parsed
    }
    return parseSmartDate(reportDate) || reportDate
  }

  // The scan dialog hands back reviewed details: write them to the row and push the expense to Expense Records.
  const commitExpenseReceipt = async (rowId: string, result: ReceiptDialogResult) => {
    const branchIdToUse = selectedBranchId || user?.branchId || ''
    const current = expReceipt.find(r => r.id === rowId)
    const resolvedId = current?.resolvedExpenseId || `dtr-${branchIdToUse || 'branch'}-${reportDate}-exp-${rowId}`
    setExpReceipt(p => p.map(r => r.id !== rowId ? r : {
      ...r,
      name: result.incurredBy,
      description: result.description,
      amount: result.amount,
      receiptNo: result.receiptNo,
      receiptDate: result.receiptDate,
      company: result.company,
      expenseCategory: result.expenseCategory,
      sourceOfFunds: result.sourceOfFunds,
      receiptImage: result.receiptImage,
      resolvedExpenseId: resolvedId,
    }))
    setReceiptDialog(null)
    try {
      await upsertAuditExpense({
        id: resolvedId,
        branchId: branchIdToUse,
        branchName: branchName || '',
        date: formatExpenseDate(result.receiptDate),
        incurredBy: result.incurredBy || (user?.name || 'STAFF').trim().toUpperCase(),
        description: result.description || 'Expense with Receipt',
        company: result.company,
        receiptNo: result.receiptNo,
        amount: parseFloat(result.amount) || 0,
        expenseCategory: (result.expenseCategory as AuditExpenseCategory) || 'OTHER',
        sourceOfFunds: result.sourceOfFunds || 'CASH',
        receiptImageUri: result.receiptImage,
        createdAt: '',
        updatedAt: '',
        updateHistory: []
      })
    } catch (err) {
      console.error('[commitExpenseReceipt] Failed to push expense to Expense Records:', err)
      setError('Saved on the DTR, but could not add it to Expense Records. Save the DTR to retry.')
      setTimeout(() => setError(null), 5000)
    }
  }

  // A COH deposit is recorded in Expense Records as a DEPOSIT, linked by the item's resolvedExpenseId
  // so re-saving the DTR updates the same record instead of adding another.
  const depositExpenseId = (rowId: string) => `dtr-${selectedBranchId || user?.branchId || 'branch'}-${reportDate}-dep-${rowId}`
  const pushDepositToExpenses = async (row: DepositRow) => {
    if (!row.resolvedExpenseId) return
    await upsertAuditExpense({
      id: row.resolvedExpenseId,
      branchId: selectedBranchId || user?.branchId || '',
      branchName: branchName || '',
      date: formatExpenseDate(),
      incurredBy: (receivedBy || user?.name || 'STAFF').trim().toUpperCase(),
      description: (row.description || 'COH Deposit to HO').trim(),
      company: (row.bank || '').trim().toUpperCase(),
      receiptNo: (row.referenceNo || '').trim(),
      amount: parseFloat(String(row.amount).replace(/,/g, '')) || 0,
      expenseCategory: 'DEPOSIT' as AuditExpenseCategory,
      sourceOfFunds: 'COLLECTION',
      receiptImageUri: row.receiptImage || '',
      createdAt: '',
      updatedAt: '',
      updateHistory: []
    })
  }

  const commitDepositReceipt = async (rowId: string, result: ReceiptDialogResult) => {
    const current = deposits.find(r => r.id === rowId)
    const next: DepositRow = {
      ...(current || mkDeposit()),
      id: rowId,
      description: result.description,
      referenceNo: result.receiptNo,
      amount: result.amount,
      receiptImage: result.receiptImage,
      bank: result.company,
      resolvedExpenseId: current?.resolvedExpenseId || depositExpenseId(rowId),
    }
    setDeposits(p => p.map(r => r.id !== rowId ? r : next))
    setReceiptDialog(null)
    try {
      await pushDepositToExpenses(next)
    } catch (err) {
      console.error('[commitDepositReceipt] Failed to push deposit to Expense Records:', err)
      setError('Saved on the DTR, but could not add the deposit to Expense Records. Save the DTR to retry.')
      setTimeout(() => setError(null), 5000)
    }
  }

  // Only used by "Expenses with Receipts" rows — Purchases are never synced into the Expenses list.
  const syncExpenseRowOnBlur = async (row: ExpenseRow) => {
    if (!row.resolvedExpenseId) return
    const branchIdToUse = selectedBranchId || user?.branchId || ''
    const numAmt = typeof row.amount === 'string'
      ? (parseFloat(row.amount.replace(/,/g, '')) || 0)
      : (Number(row.amount) || 0)
    try {
      await upsertAuditExpense({
        id: row.resolvedExpenseId,
        branchId: branchIdToUse,
        branchName: branchName || '',
        date: formatExpenseDate(row.receiptDate),
        incurredBy: (row.name || user?.name || 'STAFF').trim().toUpperCase(),
        description: (row.description || 'Expense with Receipt').trim(),
        company: (row.company || linkedExpenseCache.current.get(row.resolvedExpenseId)?.company || '').trim().toUpperCase(),
        receiptNo: (row.receiptNo || '').trim(),
        amount: numAmt,
        expenseCategory: (row.expenseCategory || linkedExpenseCache.current.get(row.resolvedExpenseId)?.expenseCategory || 'OTHER') as AuditExpenseCategory,
        sourceOfFunds: (row.sourceOfFunds || linkedExpenseCache.current.get(row.resolvedExpenseId)?.sourceOfFunds || 'CASH').trim().toUpperCase(),
        receiptImageUri: row.receiptImage || '',
        createdAt: '',
        updatedAt: '',
        updateHistory: []
      })
    } catch (err) {
      console.error('[syncExpenseRowOnBlur] Failed to sync on blur:', err)
    }
  }

  const applyFreshDateChange = (newDate: string) => {
    ignoreNextCohFetch.current = false
    const wasEditing = !!reportId
    setReportDate(newDate)
    if (wasEditing) {
      setReportId(null)
      clearForm(true)
      loadedReportDate.current = null
      loadedBranchId.current = null
      loadedAuditLine.current = null
      const url = new URL(window.location.href)
      url.searchParams.delete('id')
      window.history.replaceState({}, '', url.toString())
    }
  }

  const loadExistingReportById = async (id: string, newDate: string, enterEditMode = false) => {
    setReportDate(newDate)
    setReportId(id)
    setIsEditingExisting(false)
    ignoreNextCohFetch.current = true
    const url = new URL(window.location.href)
    url.searchParams.set('id', id)
    url.searchParams.delete('date')
    window.history.replaceState({}, '', url.toString())
    await fetchReportDetails(id, { enterEditMode })
  }

  const resetReportDateInput = () => {
    if (dateInputRef.current) dateInputRef.current.value = reportDate
  }

  const handleReportDateChange = async (newDate: string) => {
    if (!newDate || newDate === reportDate || reviewMode) return

    const wasEditing = !!reportId
    userInitiatedDateChange.current = true
    setCheckingExistingReport(true)

    if (!wasEditing) {
      setReportDate(newDate)
    }

    try {
      invalidateLookupCache(newDate)
      const existing = await lookupExistingReport(newDate, { skipCache: true })
      if (existing?.id) {
        await loadExistingReportById(existing.id, newDate)
        return
      }

      if (wasEditing) {
        applyFreshDateChange(newDate)
      } else {
        ignoreNextCohFetch.current = false
      }
    } catch (err) {
      console.error('[handleReportDateChange] Failed to check existing report:', err)
      if (wasEditing) {
        applyFreshDateChange(newDate)
      } else if (!wasEditing) {
        setReportDate(newDate)
      }
    } finally {
      userInitiatedDateChange.current = false
      setCheckingExistingReport(false)
    }
  }

  useEffect(() => {
    if (dateInputRef.current && document.activeElement !== dateInputRef.current) {
      dateInputRef.current.value = reportDate
    }
  }, [reportDate])

  const finalizeReportDateSelection = (newDate: string) => {
    if (!newDate || newDate === reportDate || reviewMode || checkingExistingReport) return
    void handleReportDateChange(newDate)
  }

  const clearDatePickerCommitTimer = () => {
    if (datePickerCommitTimer.current) {
      clearTimeout(datePickerCommitTimer.current)
      datePickerCommitTimer.current = null
    }
  }

  const queueDatePickerCommit = (newDate: string) => {
    if (!newDate || newDate === reportDate || reviewMode || checkingExistingReport) return

    clearDatePickerCommitTimer()

    const anchor = datePickerLastValue.current || reportDate
    const monthBrowse = isLikelyMonthNavigation(anchor, newDate)
      || isLikelyMonthNavigation(reportDate, newDate)

    datePickerLastValue.current = newDate

    if (monthBrowse) {
      datePickerCommitTimer.current = setTimeout(() => {
        datePickerCommitTimer.current = null
        finalizeReportDateSelection(newDate)
      }, DATE_PICKER_MONTH_NAV_MS)
      return
    }

    finalizeReportDateSelection(newDate)
  }

  useEffect(() => () => clearDatePickerCommitTimer(), [])

  // Load query params on mount/URL change
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlId = params.get('id')
    const urlBranchId = params.get('branchId')
    const urlDate = params.get('date')
    const urlAuditLine = params.get('auditLine')

    if (urlId) {
      setReportId(urlId)
      void fetchReportDetails(urlId, { enterEditMode: false })
    } else {
      // If we were previously editing a report but now there is no id in the URL,
      // reset/clear the form so we transition back to a clean submission form.
      const urlParams = new URLSearchParams(window.location.search)
      const currentId = reportId || urlParams.get('id')
      if (currentId) {
        setReportId(null)
        clearForm(true)
        loadedReportDate.current = null
        loadedBranchId.current = null
        loadedAuditLine.current = null
      }
      if (urlBranchId) setSelectedBranchId(urlBranchId)
      if (urlDate) setReportDate(urlDate)
      if (urlAuditLine) setSelectedAuditLine(urlAuditLine || null)
    }
  }, [location.search])

  // (DTR Image upload and paste scanner functions removed)

  const executeSyncFromSchedule = async () => {
    if (!selectedBranchId || !reportDate || syncLoading) return
    const scheduleBranchId = selectedAuditLine
      ? `${selectedBranchId.replace(/-(sales|services)$/i, '')}-${selectedAuditLine === 'TAGUIG_SERVICE' ? 'services' : 'sales'}`
      : selectedBranchId.replace(/-(sales|services)$/i, '')
    console.log('[Sync from Schedule] Triggered. branchId:', scheduleBranchId, '(raw:', selectedBranchId, ') reportDate:', reportDate, 'branchName:', branchName)
    setSyncLoading(true)
    try {
      const prefillOptions = {
        branchId: scheduleBranchId,
        dateKey: reportDate,
        branchName: branchName,
      }

      // Fetch cash, online, check, for-collection transactions, and unit summary counters in parallel
      const [cashResult, onlineResult, checkResult, forCollResult, unitSummaryResult] = await Promise.all([
        fetchAndMapTickets(prefillOptions),
        fetchAndMapOnlineTickets(prefillOptions),
        fetchAndMapCheckTickets(prefillOptions),
        fetchAndMapForCollTickets(prefillOptions),
        fetchAndCountUnitSummary(prefillOptions),
      ])

      console.log('[Sync from Schedule] Cash result:', cashResult)
      console.log('[Sync from Schedule] Online result:', onlineResult)
      console.log('[Sync from Schedule] Check result:', checkResult)
      console.log('[Sync from Schedule] ForColl result:', forCollResult)
      console.log('[Sync from Schedule] UnitSummary result:', unitSummaryResult)

      let hasData = false

      if (unitSummaryResult.ok) {
        setScheduledUnits(String(unitSummaryResult.counts.scheduledUnits))
        setRescheduledUnits(String(unitSummaryResult.counts.rescheduledUnits))
        setInstalledUnits(String(unitSummaryResult.counts.installedUnits))
        setServicedUnits(String(unitSummaryResult.counts.servicedUnits))
        setCancelledUnits(String(unitSummaryResult.counts.cancelledUnits))
        setFreeInstallUnits(String(unitSummaryResult.counts.freeInstallUnits))
        setSurveyOnlyUnits(String(unitSummaryResult.counts.surveyOnlyUnits))
        hasData = true
      }

      // Overwrite/replace cash transactions
      if (cashResult.ok && cashResult.rows.length > 0) {
        setCashTx(cashResult.rows)
        hasData = true
      } else {
        setCashTx([mkCash()])
      }

      // Overwrite/replace online transactions (BANK TRANSFER, GCASH)
      if (onlineResult.ok && onlineResult.rows.length > 0) {
        setOnlineTx(onlineResult.rows)
        hasData = true
      } else {
        setOnlineTx([mkOnl()])
      }

      // Overwrite/replace check remits (CHEQUE)
      if (checkResult.ok && checkResult.rows.length > 0) {
        setCheckRem(checkResult.rows)
        hasData = true
      } else {
        setCheckRem([mkChk()])
      }

      // Overwrite/replace for-collection
      if (forCollResult.ok && forCollResult.rows.length > 0) {
        setForColl(forCollResult.rows)
        hasData = true
      } else {
        setForColl([mkColl()])
      }

      if (!hasData) {
        const errMsg = !cashResult.ok ? `Cash sync failed: ${cashResult.error}` : 'No qualifying tickets found for this date.'
        setError(errMsg)
        setTimeout(() => setError(null), 4000)
      }
    } catch (err) {
      console.error('[Sync from Schedule] Error:', err)
      setError('Failed to sync from schedule.')
      setTimeout(() => setError(null), 4000)
    } finally {
      setSyncLoading(false)
    }
  }

  const executeSyncRebatesFromSchedule = async () => {
    if (!selectedBranchId || !reportDate || rebateSyncLoading) return
    const scheduleBranchId = selectedAuditLine
      ? `${selectedBranchId.replace(/-(sales|services)$/i, '')}-${selectedAuditLine === 'TAGUIG_SERVICE' ? 'services' : 'sales'}`
      : selectedBranchId.replace(/-(sales|services)$/i, '')
    console.log('[Sync Rebates] Triggered. branchId:', scheduleBranchId, 'reportDate:', reportDate)
    setRebateSyncLoading(true)
    try {
      const result = await fetchAndMapRebateTickets({
        branchId: scheduleBranchId,
        dateKey: reportDate,
        branchName: branchName,
      })
      console.log('[Sync Rebates] Result:', result)
      if (!result.ok) {
        setError(`Rebates sync failed: ${result.error}`)
        setTimeout(() => setError(null), 4000)
        return
      }
      if (result.rows.length === 0) {
        setRebates([mkReb()])
        setError('No FREE-commit installed tickets found for this date.')
        setTimeout(() => setError(null), 4000)
        return
      }
      setRebates(result.rows)
    } catch (err) {
      console.error('[Sync Rebates] Error:', err)
      setError('Failed to sync rebates from schedule.')
      setTimeout(() => setError(null), 4000)
    } finally {
      setRebateSyncLoading(false)
    }
  }

  const executeSyncCommissionsFromSchedule = async () => {
    if (!selectedBranchId || !reportDate || commissionSyncLoading) return
    const scheduleBranchId = selectedAuditLine
      ? `${selectedBranchId.replace(/-(sales|services)$/i, '')}-${selectedAuditLine === 'TAGUIG_SERVICE' ? 'services' : 'sales'}`
      : selectedBranchId.replace(/-(sales|services)$/i, '')
    setCommissionSyncLoading(true)
    try {
      const result = await fetchAndMapCommissionTickets({
        branchId: scheduleBranchId,
        dateKey: reportDate,
        branchName: branchName,
      })
      if (!result.ok) {
        setError(`Commission Expenses sync failed: ${result.error}`)
        setTimeout(() => setError(null), 4000)
        return
      }
      if (result.rows.length === 0) {
        setCommissions([mkComm()])
        setError('No installed tickets found for this date.')
        setTimeout(() => setError(null), 4000)
        return
      }
      setCommissions(result.rows)
    } catch (err) {
      console.error('[Sync Commissions] Error:', err)
      setError('Failed to sync commission expenses from schedule.')
      setTimeout(() => setError(null), 4000)
    } finally {
      setCommissionSyncLoading(false)
    }
  }

  const handleSyncAllFromSchedule = () => {
    if (!selectedBranchId || !reportDate || syncLoading || rebateSyncLoading || commissionSyncLoading) return
    const hasExistingData =
      cashTx.some(r => r.customer.trim() || r.installer.trim() || r.amount.trim() || r.ticketNumber?.trim()) ||
      onlineTx.some(r => r.customer.trim() || r.installer.trim() || r.bank.trim() || r.amount.trim() || r.ticketNumber?.trim()) ||
      checkRem.some(r => r.customer.trim() || r.installer.trim() || r.bank.trim() || r.amount.trim() || r.ticketNumber?.trim()) ||
      forColl.some(r => r.customer.trim() || r.installer.trim() || r.amount.trim() || r.ticketNumber?.trim()) ||
      rebates.some(r => r.ticketNumber.trim() || r.customer.trim() || r.company.trim() || r.amount.trim() || r.raNumber.trim()) ||
      commissions.some(r => r.ticketNumber.trim() || r.customer.trim() || r.store.trim() || r.diser.trim() || r.amount.trim())
    const run = () => {
      void Promise.all([
        executeSyncFromSchedule(),
        executeSyncRebatesFromSchedule(),
        executeSyncCommissionsFromSchedule(),
      ])
    }
    if (hasExistingData) {
      setConfirmDialog({
        title: 'Overwrite Current Entries?',
        message: 'You have existing entries in Transactions, Rebates or Commission Expenses. Syncing from schedule will clear them and replace them with fetched schedule data.',
        detail: 'Click OK to clear and overwrite with schedule data, or Cancel to keep current entries.',
        confirmText: 'OK',
        cancelText: 'Cancel',
        variant: 'discard',
        onConfirm: () => { setConfirmDialog(null); run() },
      })
    } else {
      run()
    }
  }

  // (DTR Image paste and upload handlers removed)

  // ── DTR Calculations ─────────────────────────────────────────────
  const totalCashCollection  = sumArr(cashTx.map(r => r.amount))
  const totalCashReturns     = sumArr(cashRet.map(r => r.amount))
  const totalOnline          = sumArr(onlineTx.map(r => r.amount))
  const totalPartsCash       = sumArr(partsSales.filter(r => r.paymentMethod !== 'ONLINE').map(r => r.amount))
  const totalPartsOnline     = sumArr(partsSales.filter(r => r.paymentMethod === 'ONLINE').map(r => r.amount))
  const totalCheck           = sumArr(checkRem.map(r => r.amount))
  const totalForColl         = sumArr(forColl.map(r => r.amount))
  const totalRebates         = rebates.reduce((s, r) => s + num(r.amount), 0)
  const totalCommissionExpenses = commissions.reduce((s, r) => s + num(r.amount), 0)
  const totalOrders          = sumArr(orders.map(r => r.amount))
  const totalPayables        = sumArr(payables.map(r => r.amount))
  const totalExpReceipt      = sumArr(expReceipt.map(r => r.amount))
  const totalCashAdvance     = sumArr(cashAdvances.map(r => r.amount))
  const totalDeposits        = sumArr(deposits.map(r => r.amount))
  const totalExpPurch        = sumArr(expPurch.map(r => r.amount))
  const totalIncentives      = sumArr(incentives.map(r => r.amount))
  // Incentives reduce Gross Sales (applied server-side in ReportService), but they're not cash
  // that left the branch's hand — they must NOT be subtracted from Cash on Hand / Deposit here.
  // Cash Advance IS a real cash outflow (unlike Rebates/Commission/Payables, which are
  // informational-only totals), so it belongs in the deduction alongside the Expenses sections.
  const grandTotalExpenses   = totalExpReceipt + totalExpPurch + totalCashAdvance
  // Parts sales paid in cash are real cash the branch is holding, same as any other cash
  // transaction — they must add to Cash on Hand. Parts sold online settle to the bank, not
  // the branch's physical cash, so only the CASH-tagged rows belong here.
  const cohMismatch = prevDayCoh != null && Math.abs(num(cashOnHand) - prevDayCoh.amount) >= 0.01
  const totalFundReceived    = num(cashOnHand) + num(fundFromHo) + totalCashCollection + totalCashReturns + totalPartsCash
  const totalCashOnHand      = totalFundReceived - grandTotalExpenses - totalDeposits

  // ── Submit handler ───────────────────────────────────────────────
  // ── Submit & Action Handlers ─────────────────────────────────────
  const executeDtrSubmit = async () => {
    setSubmitting(true); setError(null)
    const wasEdit = Boolean(reportId)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

      // Stamp a stable audit-expense id on every expense row BEFORE building the payload, so it
      // rides along in the report item's resolvedExpenseId. Row ids are regenerated (uid()) each
      // time the form reloads, so an id derived from them at push time would differ on every
      // re-save and make the backend insert a new audit_expenses row instead of updating the
      // existing one — that's what produced duplicate entries in the Expenses table.
      const expenseBranchKey = selectedBranchId || user?.branchId || 'branch'
      const expReceiptForSave = expReceipt.map(r =>
        (r.name || r.amount || r.receiptImage || r.receiptNo) && !r.resolvedExpenseId
          ? { ...r, resolvedExpenseId: `dtr-${expenseBranchKey}-${reportDate}-exp-${r.id}` }
          : r
      )
      setExpReceipt(expReceiptForSave)
      const depositsForSave = deposits.map(r =>
        (r.description || r.referenceNo || r.amount) && !r.resolvedExpenseId
          ? { ...r, resolvedExpenseId: depositExpenseId(r.id) }
          : r
      )
      setDeposits(depositsForSave)
      const cashAdvForSave = cashAdvances.map(r =>
        (r.memberName || r.amount) && !r.resolvedExpenseId
          ? { ...r, resolvedExpenseId: `dtr-${expenseBranchKey}-${reportDate}-ca-${r.id}` }
          : r
      )
      setCashAdvances(cashAdvForSave)

      // Build unified items array from all DTR sections
      const dtrItems: object[] = [
        ...cashTx.filter(r => r.customer || r.installer || r.amount).map(r => ({
          type: 'CASH_SALE', description: r.installer, customer: r.customer, amount: parseFloat(r.amount) || 0
        })),
        ...cashRet.filter(r => r.name || r.description || r.amount).map(r => ({
          type: 'CASH_SALE', description: `RETURN|${r.name}|${(r.description || '').replace(/\|/g, '/')}`, amount: parseFloat(r.amount) || 0
        })),
        ...onlineTx.filter(r => r.installer || r.amount).map(r => ({
          type: 'ONLINE_SALE', description: r.installer, customer: r.customer, bank: r.bank, amount: parseFloat(r.amount) || 0
        })),
        ...checkRem.filter(r => r.installer || r.amount).map(r => ({
          type: 'ONLINE_SALE', description: `CHECK|${r.installer}`, customer: r.customer, bank: r.bank, amount: parseFloat(r.amount) || 0
        })),
        ...partsSales.filter(r => r.customer || r.amount).map(r => ({
          type: r.paymentMethod === 'ONLINE' ? 'ONLINE_SALE' : 'CASH_SALE',
          description: `PARTS|${r.customer}|${r.description}`,
          amount: parseFloat(r.amount) || 0
        })),
        ...expReceiptForSave.filter(r => r.name || r.amount).map(r => ({
          type: 'EXPENSE',
          description: `${r.name}|${r.description}`,
          company: r.company || null,
          amount: parseFloat(r.amount) || 0,
          receiptReturned: r.receiptReturned || false,
          actualAmount: (r.actualAmount && !isNaN(parseFloat(r.actualAmount))) ? parseFloat(r.actualAmount) : null,
          receiptNo: r.receiptNo || null,
          receiptDate: r.receiptDate || null,
          resolvedExpenseId: r.resolvedExpenseId || null,
          receiptImage: r.receiptImage || null
        })),
        ...cashAdvForSave.filter(r => r.memberName || r.amount).map(r => ({
          type: 'CASH_ADVANCE',
          description: `${r.memberName}|${r.details}`,
          amount: parseFloat(r.amount) || 0,
          resolvedExpenseId: r.resolvedExpenseId || null,
        })),
        ...depositsForSave.filter(r => r.description || r.referenceNo || r.amount).map(r => ({
          type: 'DEPOSIT',
          description: r.description || 'COH Deposit',
          receiptNo: r.referenceNo || null,
          receiptImage: r.receiptImage || null,
          bank: r.bank || null,
          resolvedExpenseId: r.resolvedExpenseId || null,
          amount: parseFloat(r.amount) || 0,
        })),
        ...expPurch.filter(r => r.name || r.amount).map(r => ({
          type: 'PURCHASE',
          description: `${r.name}|${r.description}`,
          amount: parseFloat(r.amount) || 0,
          receiptReturned: r.receiptReturned || false,
          actualAmount: (r.actualAmount && !isNaN(parseFloat(r.actualAmount))) ? parseFloat(r.actualAmount) : null,
          receiptNo: r.receiptNo || null,
          receiptDate: r.receiptDate || null,
          resolvedExpenseId: r.resolvedExpenseId || null,
          receiptImage: r.receiptImage || null,
          company: r.company || null
        })),
        ...orders.filter(r => r.customer || r.amount).map(r => ({
          type: 'PURCHASE',
          description: `ORDER|${r.customer}|${r.description}`,
          amount: parseFloat(r.amount) || 0,
          receiptReturned: r.receiptReturned || false,
          actualAmount: (r.actualAmount && !isNaN(parseFloat(r.actualAmount))) ? parseFloat(r.actualAmount) : null,
          receiptNo: r.receiptNo || null,
          receiptDate: r.receiptDate || null,
          resolvedExpenseId: r.resolvedExpenseId || null
        })),
        ...payables.filter(r => r.customer || r.amount).map(r => ({
          type: 'PAYABLE',
          description: `PAYABLE|${r.customer}|${r.description}`,
          amount: parseFloat(r.amount) || 0,
          receiptReturned: false,
          actualAmount: null,
          receiptNo: null,
          receiptDate: null,
          resolvedExpenseId: null
        })),
        ...rebates.filter(r => r.customer || r.company || r.amount).map(r => ({
          type: 'REBATE',
          customer: r.customer,
          company: r.company,
          units: 1,
          amount: parseFloat(r.amount) || 0,
          description: `REBATE|${r.raNumber}|${r.hp}`,
          ticketNumber: r.ticketNumber || '',
        })),
        ...commissions.filter(r => r.ticketNumber || r.customer || r.store || r.diser || r.brand || r.hp || r.amount).map(r => {
          const amt = parseFloat(r.amount) || 0
          return {
            type: 'COMMISSION',
            customer: r.customer,
            company: r.store,
            promodiser: r.diser,
            bank: r.brand || '',
            hp: r.hp || '',
            amount: amt,
            description: `COMMISSION|${r.diser || ''}|${r.brand || ''}|${r.hp || ''}`,
            ticketNumber: r.ticketNumber || '',
            dateInstalled: r.dateInstalled || null,
            collectionResolved: amt > 0,
          }
        }),
        ...forColl.filter(r => r.installer || r.amount).map(r => ({
          type: 'COLLECTION',
          description: r.installer,
          customer: r.customer,
          amount: parseFloat(r.amount) || 0,
          collectionResolved: r.collectionResolved || false
        })),
        ...(INCENTIVES_ENABLED ? incentives.filter(r => r.customer || r.promodiser || r.amount).map(r => ({
          type: 'INCENTIVE',
          customer: r.customer,
          company: r.company,
          amount: parseFloat(r.amount) || 0,
          description: `INCENTIVE|${r.promodiser}|${r.hp}`,
          hp: r.hp,
          promodiser: r.promodiser,
          collectionResolved: r.collectionResolved || false
        })) : []),
      ]

      const payload = {
        id: reportId,
        branchId: selectedBranchId,
        auditLine: selectedAuditLine,
        reportDate,
        receivedBy,
        trNo: trNo.trim() || trNoExample,
        branchName,
        cohPreviousDay: parseFloat(cashOnHand) || 0,
        fundFromHo: parseFloat(fundFromHo) || 0,
        cashReturns: totalCashReturns,
        forCollection: totalForColl,
        rebatesForCollection: totalRebates,
        commissionExpensesTotal: totalCommissionExpenses,
        totalUnitsScheduled: parseInt(scheduledUnits) || 0,
        totalUnitsSurveyOnly: parseInt(surveyOnlyUnits) || 0,
        totalRescheduled: parseInt(rescheduledUnits) || 0,
        totalUnitsInstalled: parseInt(installedUnits) || 0,
        totalUnitsServiced: parseInt(servicedUnits) || 0,
        totalUnitsCancelled: parseInt(cancelledUnits) || 0,
        totalUnitsFreeInstall: parseInt(freeInstallUnits) || 0,
        items: dtrItems,
      }

      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let msg = await res.text()
        try {
          const json = JSON.parse(msg) as { error?: string; message?: string }
          msg = json.error || json.message || msg
        } catch { /* plain text */ }
        throw new Error(msg || `Save failed (HTTP ${res.status})`)
      }
      const saved = await res.json() as { id?: string; success?: boolean; message?: string }
      invalidateLookupCache(reportDate)

      // Auto-push expense rows to Audit Expenses with complete details
      const reportIdForExpenses = saved?.id || reportId
      if (reportIdForExpenses) {
        const formatExpenseDate = (dateStr?: string) => {
          if (dateStr) {
            const parsed = parseSmartDate(dateStr)
            if (parsed) return parsed
          }
          return parseSmartDate(reportDate) || reportDate
        }

        // 1. Push Expenses with Receipts — reuses the id stamped above (and persisted on the
        // report item), so re-saving an existing DTR updates its expense rows instead of
        // inserting duplicates.
        const expensesToPush = expReceiptForSave.filter(r => r.name || r.amount || r.receiptImage || r.receiptNo)
        // A save right after reopening must not race the record lookup and fall back to defaults.
        await linkedExpenseLoad.current
        for (const row of expensesToPush) {
          try {
            const rawAmt = row.amount
            const numAmt = typeof rawAmt === 'string'
              ? (parseFloat(rawAmt.replace(/,/g, '')) || 0)
              : (Number(rawAmt) || 0)
            const expenseId = row.resolvedExpenseId || `dtr-${expenseBranchKey}-${reportDate}-exp-${row.id}`
            await upsertAuditExpense({
              id: expenseId,
              branchId: selectedBranchId || user?.branchId || '',
              branchName: branchName || '',
              date: formatExpenseDate(row.receiptDate),
              incurredBy: (row.name || user?.name || 'STAFF').trim().toUpperCase(),
              description: (row.description || 'Expense with Receipt').trim(),
              company: (row.company || linkedExpenseCache.current.get(expenseId)?.company || '').trim().toUpperCase(),
              receiptNo: (row.receiptNo || '').trim(),
              amount: numAmt,
              expenseCategory: (row.expenseCategory || linkedExpenseCache.current.get(expenseId)?.expenseCategory || 'OTHER') as AuditExpenseCategory,
              sourceOfFunds: (row.sourceOfFunds || linkedExpenseCache.current.get(expenseId)?.sourceOfFunds || 'CASH').trim().toUpperCase(),
              receiptImageUri: row.receiptImage || '',
              createdAt: '',
              updatedAt: '',
              updateHistory: []
            })
          } catch (err) {
            console.error('[DTR→AuditExpenses] Failed to push expense:', err)
          }
        }

        for (const row of cashAdvForSave.filter(r => (r.memberName || r.amount) && r.resolvedExpenseId)) {
          try {
            await upsertAuditExpense({
              id: row.resolvedExpenseId!,
              branchId: selectedBranchId || user?.branchId || '',
              branchName: branchName || '',
              date: formatExpenseDate(),
              incurredBy: (row.memberName || user?.name || 'STAFF').trim().toUpperCase(),
              description: `CASH ADVANCE${row.details ? `: ${row.details.trim()}` : ''}`,
              company: '',
              receiptNo: '',
              amount: parseFloat(String(row.amount).replace(/,/g, '')) || 0,
              expenseCategory: 'CASH ADVANCED' as AuditExpenseCategory,
              sourceOfFunds: 'CASH',
              receiptImageUri: '',
              createdAt: '',
              updatedAt: '',
              updateHistory: []
            })
          } catch (err) {
            console.error('[DTR→AuditExpenses] Failed to push cash advance:', err)
          }
        }

        for (const row of depositsForSave.filter(r => r.description || r.referenceNo || r.amount)) {
          try {
            await pushDepositToExpenses(row)
          } catch (err) {
            console.error('[DTR→AuditExpenses] Failed to push deposit:', err)
          }
        }

        // Purchases ("Expenses for Purchase") are intentionally NOT pushed into the shared
        // Expenses list — they're a separate cash-out category from actual expenses.
      }
      setReviewMode(false)
      setReviewStartedAt(null)
      if (wasEdit) {
        if (onSwitchToSummary) onSwitchToSummary()
        else window.location.href = '/audit-report'
        return
      }
      if (saved?.id) {
        await loadExistingReportById(saved.id, reportDate)
        return
      }
      setSuccess(true)
      clearForm(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally { setSubmitting(false) }
  }

  const handleDtrSubmit = () => {
    if (!canEditOrSubmit) {
      setError(reportStatus === 'AUDITED'
        ? (isMayDtrEditWindow(reportDate)
          ? 'You do not have permission to edit this audited May report for this branch.'
          : 'This report has been audited. Only admin accounts can edit audited reports.')
        : 'You do not have permission to edit this report.')
      return
    }
    setError(null)

    // From October 2026 every DTR must reconcile with Expense Records: each expense and deposit
    // needs its photo, and deposits to HO belong in COH Deposit, not in Expenses.
    if (reportDate >= DOCUMENTATION_REQUIRED_FROM) {
      const issues: string[] = []
      const looksLikeDeposit = (t: string) => /deposit|\bcoh\b|\bho\b|head\s*office/i.test(t)
      const expRows = expReceipt.filter(r => num(r.amount) > 0)
      const noPhoto = expRows.filter(r => !r.receiptImage).length
      if (noPhoto) issues.push(`${noPhoto} expense${noPhoto === 1 ? '' : 's'} with no receipt photo — use Scan on each row`)
      const depositAsExpense = expRows.filter(r => looksLikeDeposit(`${r.name} ${r.description}`)).length
      if (depositAsExpense) issues.push(`${depositAsExpense} deposit${depositAsExpense === 1 ? '' : 's'} entered under Expenses — move ${depositAsExpense === 1 ? 'it' : 'them'} to COH Deposit`)
      const depNoSlip = deposits.filter(r => num(r.amount) > 0 && !r.receiptImage).length
      if (depNoSlip) issues.push(`${depNoSlip} COH deposit${depNoSlip === 1 ? '' : 's'} with no deposit slip photo`)
      if (cohMismatch && prevDayCoh && !(isAdmin && cohOverrideAck)) {
        issues.push(`Cash on hand does not match the ending balance of the ${prevDayCoh.date} DTR (${php(prevDayCoh.amount)})${isAdmin ? ' — confirm the admin override under Cash on Hand' : ''}`)
      }
      const expNoCategory = expRows.filter(r => !r.expenseCategory).length
      if (expNoCategory) issues.push(`${expNoCategory} expense${expNoCategory === 1 ? '' : 's'} with no category — open Scan on each to pick one`)
      const expNoName = expRows.filter(r => !r.name.trim() || !r.description.trim()).length
      if (expNoName) issues.push(`${expNoName} expense${expNoName === 1 ? '' : 's'} missing a name or description`)
      if (issues.length > 0) {
        setError(`Before submitting: ${issues.join('; ')}.`)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }

    if (!reviewMode && !reportId) {
      setReviewStartedAt(new Date())
      setReviewMode(true)
      
      const mainEl = document.querySelector('main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'auto' })
      }
      window.scrollTo({ top: 0, behavior: 'auto' })
      document.documentElement.scrollTo({ top: 0, behavior: 'auto' })
      document.body.scrollTo({ top: 0, behavior: 'auto' })
      
      return
    }

    setConfirmDialog({
      title: reportId ? 'Confirm Report Update?' : 'Confirm Report Submission?',
      message: reportId
        ? 'Are you sure you want to update this Daily Transaction Report?'
        : 'Are you sure you want to submit this Daily Transaction Report?',
      detail: 'Please verify that all transaction totals, cash on hand, and unit summary counts are accurate before confirming.',
      confirmText: reportId ? 'Update Report' : 'Submit Report',
      cancelText: 'Cancel',
      variant: 'save',
      onConfirm: () => {
        setConfirmDialog(null)
        void executeDtrSubmit()
      },
    })
  }

  const hasFormChanges = useMemo(() => {
    const hasCash = cashTx.some(r => r.customer.trim() || r.installer.trim() || r.amount.trim() || r.ticketNumber?.trim())
    const hasCashRet = cashRet.some(r => r.name.trim() || r.amount.trim())
    const hasOnline = onlineTx.some(r => r.customer.trim() || r.installer.trim() || r.bank.trim() || r.amount.trim() || r.ticketNumber?.trim())
    const hasCheck = checkRem.some(r => r.customer.trim() || r.installer.trim() || r.bank.trim() || r.amount.trim() || r.ticketNumber?.trim())
    const hasParts = partsSales.some(r => r.customer.trim() || r.description.trim() || r.amount.trim())
    const hasForColl = forColl.some(r => r.customer.trim() || r.installer.trim() || r.amount.trim() || r.ticketNumber?.trim())
    const hasRebates = rebates.some(r => r.ticketNumber.trim() || r.customer.trim() || r.company.trim() || r.amount.trim() || r.raNumber?.trim())
    const hasOrders = orders.some(r => r.customer.trim() || r.description.trim() || r.amount.trim())
    const hasExpReceipt = expReceipt.some(r => r.name.trim() || r.description.trim() || r.amount.trim())
    const hasExpPurch = expPurch.some(r => r.name.trim() || r.description.trim() || r.amount.trim())
    const hasCoh = Boolean(cashOnHand && cashOnHand.trim() !== '')
    const hasFund = Boolean(fundFromHo && fundFromHo.trim() !== '')

    return (
      hasCash || hasCashRet || hasOnline || hasCheck || hasParts ||
      hasForColl || hasRebates || hasOrders || hasExpReceipt || hasExpPurch ||
      hasCoh || hasFund
    )
  }, [
    cashTx, cashRet, onlineTx, checkRem, partsSales, forColl, rebates,
    orders, expReceipt, expPurch, cashOnHand, fundFromHo
  ])

  const handleClearForm = () => {
    if (!canEditOrSubmit) return
    if (hasFormChanges) {
      setConfirmDialog({
        title: 'Clear Entire Form?',
        message: 'Are you sure you want to clear all entered data in this form? This action cannot be undone.',
        confirmText: 'Clear Form',
        cancelText: 'Cancel',
        variant: 'danger',
        onConfirm: () => {
          setConfirmDialog(null)
          clearForm(true)
        },
      })
    } else {
      clearForm(true)
    }
  }

  const handleCancelForm = () => {
    const doCancel = () => {
      if (isEditingExisting) {
        setIsEditingExisting(false)
      } else if (onSwitchToSummary) {
        onSwitchToSummary()
      } else {
        window.location.href = '/audit-report'
      }
    }

    if (hasFormChanges) {
      setConfirmDialog({
        title: 'Discard Unsaved Changes?',
        message: 'You have entered data in this form. Are you sure you want to cancel and discard your changes?',
        confirmText: 'Discard Changes',
        cancelText: 'Cancel',
        variant: 'discard',
        onConfirm: () => {
          setConfirmDialog(null)
          doCancel()
        },
      })
    } else {
      doCancel()
    }
  }

  // ── Style helper tokens ──────────────────────────────────────────

  const tableTh = 'px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider'
  const tableTd = 'px-3 py-2 border-b border-slate-100 dark:border-slate-800/40'
  const readOnlyFieldClass = reviewMode || isViewOnlyReport
    ? 'opacity-70 cursor-not-allowed bg-slate-100/30 dark:bg-slate-800/20'
    : ''
  const flushInput = `w-full bg-transparent border-0 outline-none text-sm py-1.5 px-2 transition-all focus:bg-slate-100/60 dark:focus:bg-slate-800/40 focus:ring-1 focus:ring-emerald-500/20 rounded font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 ${readOnlyFieldClass}`
  const flushInputNumber = `w-full bg-transparent border-0 outline-none text-sm py-1.5 px-2 text-right transition-all focus:bg-slate-100/60 dark:focus:bg-slate-800/40 focus:ring-1 focus:ring-emerald-500/20 rounded font-bold text-slate-800 dark:text-slate-200 placeholder-slate-400 ${readOnlyFieldClass}`

  // (Helper subcomponents extracted outside the component)

  // ── Success screen ───────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
          <Check className="w-10 h-10" style={{ color: '#10B981' }} />
        </div>
        <h2 className="text-2xl font-black" style={{ color: textPrimary }}>Report Submitted!</h2>
        <p className="text-sm" style={{ color: textMuted }}>Your daily report has been recorded successfully.</p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              clearForm(true)
              setSuccess(false)
            }}
            className="px-5 py-2.5 rounded-xl text-sm font-bold border transition-all hover:scale-105"
            style={{ borderColor: border, color: textMuted }}
          >
            Submit Another
          </button>
          {onSwitchToSummary ? (
            <button
              onClick={onSwitchToSummary}
              className="px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:scale-105"
              style={{ backgroundColor: '#10B981' }}
            >
              View Daily Transaction Summary
            </button>
          ) : (
            <a
              href="/audit-report"
              className="px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:scale-105"
              style={{ backgroundColor: '#10B981' }}
            >
              View Daily Transaction Summary
            </a>
          )}
        </div>
      </div>
    )
  }

  // ── Main Render ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pb-10 w-full max-w-[1600px] mx-auto px-2 md:px-4">

      {reportId && !isEditingExisting && canEditExistingReport && (
        <div className="rounded-xl p-4 flex flex-wrap items-center gap-3 bg-blue-500/5 border border-blue-500/20">
          <div className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-blue-500/10">
            <Lock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">View-only mode</p>
            <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
              This report is locked. Click <strong>Edit Report</strong> to make changes to this daily report.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingExisting(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs text-white transition-all hover:brightness-110"
            style={{ backgroundColor: '#10B981', border: '1px solid #059669', boxShadow: '0 2px 8px rgba(16,185,129,0.25)' }}
          >
            <Edit className="w-3.5 h-3.5" /> Edit Report
          </button>
        </div>
      )}

      {reviewMode && (
        <div className="rounded-xl p-4 flex items-center gap-3 bg-amber-500/5 border border-amber-500/20">
          <Receipt className="w-5 h-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>Review Mode:</strong> Please double-check all details below. All fields are locked. Scroll down and click <strong>{reportId ? 'Confirm & Update' : 'Confirm & Submit'}</strong> to record the report, or <strong>Go Back & Edit</strong> to make adjustments.
          </p>
        </div>
      )}

      {!canSubmit && (
        <div className="rounded-xl px-4 py-2.5 bg-slate-500/5 border border-slate-500/20">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Read Only Mode: Only Managers and Staff can submit daily branch reports.
          </p>
        </div>
      )}

      {!!reportId && !canEditOrSubmit && (
        <div className="rounded-xl px-4 py-2.5 bg-slate-500/5 border border-slate-500/20">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Read Only Mode: {reportStatus === 'AUDITED'
              ? 'This report has been audited. Only admin accounts can edit audited reports.'
              : 'You are viewing this report in read-only mode.'}
          </p>
        </div>
      )}

      {/* Draft banner removed */}

      {/* ── Header ─────────────────────────────────────────── */}
      <div className={`rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 transition-opacity ${isViewOnlyReport ? 'opacity-80' : ''}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex flex-col gap-1 w-52">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                Report Date
                {checkingExistingReport && (
                  <span className="normal-case font-medium text-emerald-600 dark:text-emerald-400">Checking…</span>
                )}
              </label>
              <div className="relative group">
                <div
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl border text-sm font-extrabold transition-all shadow-sm ${
                    reviewMode
                      ? 'bg-slate-100 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 group-hover:border-emerald-500/50 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                    <span className="tracking-wider font-extrabold text-sm">
                      {formatReportDateDisplay(reportDate)}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 opacity-60 shrink-0 ml-1" />
                </div>
                <input
                  ref={dateInputRef}
                  id="report-date-input"
                  type="date"
                  value={reportDate}
                  onFocus={() => {
                    datePickerLastValue.current = reportDate
                    clearDatePickerCommitTimer()
                  }}
                  onKeyDown={e => {
                    isTypingReportDate.current = true
                    if (e.key === 'Enter') {
                      isTypingReportDate.current = false
                      clearDatePickerCommitTimer()
                      finalizeReportDateSelection((e.target as HTMLInputElement).value)
                    }
                  }}
                  onChange={e => {
                    if (isTypingReportDate.current) return
                    queueDatePickerCommit(e.target.value)
                  }}
                  onBlur={e => {
                    if (isTypingReportDate.current) {
                      isTypingReportDate.current = false
                      clearDatePickerCommitTimer()
                      finalizeReportDateSelection(e.target.value)
                      return
                    }

                    const pending = e.target.value
                    if (pending && pending !== reportDate && datePickerCommitTimer.current) {
                      clearDatePickerCommitTimer()
                      finalizeReportDateSelection(pending)
                    }
                  }}
                  disabled={reviewMode}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                  onClick={(e) => {
                    try {
                      if ('showPicker' in e.currentTarget) {
                        (e.currentTarget as any).showPicker()
                      }
                    } catch (_) {}
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 w-44">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">TR No.</label>
              <input
                id="tr-no-input"
                type="text"
                placeholder={`e.g. ${trNoExample}`}
                value={trNo}
                readOnly={true}
                className="w-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-500 dark:text-slate-400 focus:outline-none cursor-not-allowed font-semibold"
              />
            </div>
            <div className="flex flex-col gap-1 w-44">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Prepared By</label>
              <input
                id="received-by-input"
                type="text"
                placeholder="Name"
                value={receivedBy || user?.name || ''}
                readOnly={true}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none cursor-default font-semibold"
              />
            </div>

            {/* Sync Buttons aligned to the left */}
            {canSubmit && !reviewMode && (
              <>
                <button
                  type="button"
                  onClick={handleSyncAllFromSchedule}
                  disabled={syncLoading || rebateSyncLoading || commissionSyncLoading || isFormDisabled}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shrink-0"
                  style={{ backgroundColor: '#10B981', border: '1px solid #059669', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)' }}
                >
                  {(syncLoading || rebateSyncLoading || commissionSyncLoading) ? (
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-7.5 4"/><path d="M3 12a9 9 0 0 0 9 9 9 9 0 0 0 7.5-4"/><polyline points="3 4 3 8 7 8"/><polyline points="21 20 21 16 17 16"/></svg>
                  )}
                  Sync from Sched
                </button>
              </>
            )}
          </div>

          {/* Back button aligned to the right */}
          <div className="flex items-center gap-2 shrink-0">
            {onSwitchToSummary && !reviewMode && (
              <button
                type="button"
                onClick={onSwitchToSummary}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-900/50 focus:outline-none shrink-0 shadow-sm"
                style={{ borderColor: border, color: textMuted }}
              >
                ← Back to Summary
              </button>
            )}
          </div>
        </div>

        {/* Submission info — only visible when viewing an existing report */}
        {!!reportId && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-6 gap-y-2 items-center">
            {submittedAt && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Submitted:</span>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {new Date(submittedAt).toLocaleString('en-PH', {
                    month: 'long', day: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: true,
                  }).toUpperCase()}
                </span>
              </div>
            )}
            {lastUpdatedAt && lastUpdatedAt !== submittedAt && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500">Last Edited:</span>
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  {new Date(lastUpdatedAt).toLocaleString('en-PH', {
                    month: 'long', day: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: true,
                  }).toUpperCase()}
                </span>
              </div>
            )}
            {lastUpdatedBy && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Updated By:</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <EmployeeNameLink nameOrId={lastUpdatedBy} />
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors hover:bg-slate-500/10"
              style={{ borderColor: border, color: textMuted }}
            >
              <HistoryIcon className="w-3 h-3" />
              View History
            </button>
          </div>
        )}
      </div>



      {/* ── Sections ───────────────────────────────────────────────── */}
      <div className={isViewOnlyReport ? 'opacity-80 pointer-events-none select-none' : undefined}>
      <div className="flex flex-col gap-4">

        {/* Money In (left) | Money Out (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

          {/* ── LEFT: Money In ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

          {/* Cash Transactions */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Cash Transactions" total={totalCashCollection} variant="income" />
            <div className="p-2">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr>
                    <th className={tableTh + ' w-36 whitespace-nowrap'}>Ticket No.</th>
                    <th className={tableTh}>Customer Name</th>
                    <th className={tableTh + ' w-28'}>Installer</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-9'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {cashTx.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Ticket No." value={row.ticketNumber || ''}
                          onChange={e => setCashTx(p => p.map(r => r.id === row.id ? { ...r, ticketNumber: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setCashTx(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        {isFormDisabled ? (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <EmployeeNameLink nameOrId={row.installer} />
                          </div>
                        ) : (
                          <input type="text" placeholder="Installer" value={row.installer}
                            onChange={e => setCashTx(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                            list="tech-suggestions"
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setCashTx(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCashTx(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setCashTx(p => [...p, mkCash()])} label="Add row" />}
            </div>
          </div>

          {/* Cash Returns */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Cash Returns" total={totalCashReturns} variant="income" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-32'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {cashRet.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        {isFormDisabled ? (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <EmployeeNameLink nameOrId={row.name} />
                          </div>
                        ) : (
                          <input type="text" placeholder="Name" value={row.name}
                            onChange={e => {
                              const val = e.target.value
                              const matched = refundablePurchases.find(p => getRefundOptionText(p) === val)
                              if (matched) {
                                const worker = getWorkerName(matched)
                                const refundAmt = String((matched.amount - matched.actualAmount).toFixed(2))
                                setCashRet(p => p.map(r => r.id === row.id ? { ...r, name: worker, amount: refundAmt } : r))
                              } else {
                                setCashRet(p => p.map(r => r.id === row.id ? { ...r, name: val } : r))
                              }
                            }}
                            list="cash-return-suggestions"
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description || ''}
                          onChange={e => setCashRet(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setCashRet(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCashRet(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setCashRet(p => [...p, mkRet()])} label="Add row" />}
            </div>
          </div>

          {/* Fund Transfer from HO */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="HO Transfers & Cash on Hand" variant="income" />
            <div className="p-2">
              <table className="w-full text-left border-collapse text-xs">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Fund Transfer from HO</td>
                    <td className="px-2 py-1 text-right w-36">
                      <NumericFormat
                        thousandSeparator=","
                        decimalScale={2}
                        fixedDecimalScale={true}
                        allowNegative={false}
                        placeholder="0.00"
                        value={fundFromHo}
                        onValueChange={(values) => setFundFromHo(values.value)}
                        className={flushInputNumber}
                        disabled={isFormDisabled}
                        autoComplete="off"
                      />
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Cash on Hand (Previous Day)</td>
                    <td className="px-2 py-1 text-right w-36">
                      <NumericFormat
                        thousandSeparator=","
                        decimalScale={2}
                        fixedDecimalScale={true}
                        allowNegative={false}
                        placeholder="0.00"
                        value={cashOnHand}
                        onValueChange={(values) => setCashOnHand(values.value)}
                        className={flushInputNumber}
                        disabled={isFormDisabled}
                        autoComplete="off"
                      />
                    </td>
                  </tr>
                  {cohMismatch && prevDayCoh && (
                    <tr className="border-b border-slate-100 dark:border-slate-800/40">
                      <td colSpan={2} className="px-3 py-2">
                        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                          <p>
                            The DTR for {prevDayCoh.date} ended with {php(prevDayCoh.amount)}. If cash left the branch, record it
                            (COH Deposit / expense) on that DTR instead of changing this amount.
                          </p>
                          {!isFormDisabled && (
                            <button
                              type="button"
                              onClick={() => setCashOnHand(String(prevDayCoh.amount))}
                              className="mt-1.5 rounded-md bg-amber-600 px-2 py-1 font-bold text-white hover:bg-amber-700"
                            >
                              Use {php(prevDayCoh.amount)}
                            </button>
                          )}
                          {isAdmin && (
                            <label className="mt-2 flex items-start gap-2 font-semibold">
                              <input
                                type="checkbox"
                                checked={cohOverrideAck}
                                onChange={e => setCohOverrideAck(e.target.checked)}
                                disabled={isFormDisabled}
                                className="mt-0.5"
                              />
                              <span>Admin override: I verified this amount differs from the previous DTR on purpose.</span>
                            </label>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 dark:bg-slate-900/40 font-bold">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">Total Fund</td>
                    <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                      {php(num(cashOnHand) + num(fundFromHo))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Online Transactions */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Online Transactions" total={totalOnline} variant="income" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Ticket No.</th>
                    <th className={tableTh}>Customer Name</th>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh + ' w-24'}>Bank</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {onlineTx.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Ticket No." value={row.ticketNumber || ''}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, ticketNumber: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        {isFormDisabled ? (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <EmployeeNameLink nameOrId={row.installer} />
                          </div>
                        ) : (
                          <input type="text" placeholder="Installer" value={row.installer}
                            onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Bank" value={row.bank}
                          onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, bank: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setOnlineTx(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setOnlineTx(p => [...p, mkOnl()])} label="Add row" />}
            </div>
          </div>

          {/* Check Remits */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Check Remits" total={totalCheck} variant="income" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Ticket No.</th>
                    <th className={tableTh}>Customer Name</th>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh + ' w-24'}>Bank</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {checkRem.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Ticket No." value={row.ticketNumber || ''}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, ticketNumber: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        {isFormDisabled ? (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <EmployeeNameLink nameOrId={row.installer} />
                          </div>
                        ) : (
                          <input type="text" placeholder="Installer" value={row.installer}
                            onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Bank" value={row.bank}
                          onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, bank: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setCheckRem(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setCheckRem(p => [...p, mkChk()])} label="Add row" />}
            </div>
          </div>

          {/* Parts Sales / Unit Sales */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Parts Sales / Unit Sales" total={sumArr(partsSales.map(r => r.amount))} variant="income" />
            {(totalPartsCash > 0 || totalPartsOnline > 0) && (
              <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800/40 flex gap-4">
                <span>Cash: {php(totalPartsCash)}</span>
                <span>Online: {php(totalPartsOnline)}</span>
              </div>
            )}
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-24'}>Amount</th>
                    <th className={tableTh + ' w-28'}>Paid Via</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {partsSales.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden text-[11px] font-bold">
                          {(['CASH', 'ONLINE'] as const).map(method => (
                            <button
                              key={method}
                              type="button"
                              disabled={isFormDisabled}
                              onClick={() => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, paymentMethod: method } : r))}
                              className={`flex-1 py-1 px-1.5 transition-colors ${
                                row.paymentMethod === method
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                              } disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                            >
                              {method === 'CASH' ? 'Cash' : 'Online'}
                            </button>
                          ))}
                        </div>
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setPartsSales(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setPartsSales(p => [...p, mkPart()])} label="Add row" />}
            </div>
          </div>

          </div>

          {/* ── RIGHT: Money Out ───────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

          {/* Expenses with Receipts */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Expenses with Receipts" total={totalExpReceipt} variant="expense" />
            <div className="p-2">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr>
                    <th className={tableTh + ' w-28'}>Name</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    <th className={tableTh + ' text-center w-24'}>Receipt</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-9'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {expReceipt.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        {isFormDisabled ? (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <EmployeeNameLink nameOrId={row.name} />
                          </div>
                        ) : (
                          <input type="text" placeholder="Name" value={row.name}
                            onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                            onBlur={() => void syncExpenseRowOnBlur(row)}
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          onBlur={() => void syncExpenseRowOnBlur(row)}
                          className={flushInput} disabled={isFormDisabled} />
                        {(row.company || row.receiptNo) && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                            {row.company && <span className="truncate max-w-[130px]" title={row.company}>🏢 {row.company}</span>}
                            {row.company && row.receiptNo && <span>•</span>}
                            {row.receiptNo && <span>OR: {row.receiptNo}</span>}
                          </div>
                        )}
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          onBlur={() => void syncExpenseRowOnBlur(row)}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd + ' text-center'}>
                        {row.receiptImage ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button type="button" onClick={() => setReceiptDialog({ mode: 'expense', rowId: row.id })} title={isFormDisabled ? 'View receipt details' : 'Review / edit receipt details'}>
                              <img src={row.receiptImage} alt="Receipt" className="h-8 w-8 object-cover rounded border border-slate-300 dark:border-slate-700 hover:opacity-80 transition cursor-pointer" />
                            </button>
                            {!isFormDisabled && (
                              <button type="button" onClick={() => {
                                setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, receiptImage: '' } : r))
                                if (row.resolvedExpenseId) {
                                  void syncExpenseRowOnBlur({ ...row, receiptImage: '' })
                                }
                              }}
                                className="text-[10px] text-red-500 font-bold uppercase hover:underline">
                                Remove
                              </button>
                            )}
                          </div>
                        ) : (
                          !isFormDisabled ? (
                            <button type="button" onClick={() => setReceiptDialog({ mode: 'expense', rowId: row.id })}
                              className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:underline">
                              Scan
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )
                        )}
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => {
                            if (row.resolvedExpenseId) {
                              deleteAuditExpense(row.resolvedExpenseId).catch(err => console.error('[DTR] Failed to delete expense:', err))
                            }
                            setExpReceipt(p => p.filter(r => r.id !== row.id))
                          }} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setExpReceipt(p => [...p, mkExp()])} label="Add row" />}
            </div>
          </div>

          {/* Cash Advance */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Cash Advance" total={totalCashAdvance} variant="expense" />
            <p className="px-3 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Record advances <strong>already given</strong> to branch members from branch cash. To request an advance from the company, use Operations → Request Forms.
            </p>
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Member Name</th>
                    <th className={tableTh}>Details</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {cashAdvances.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        {isFormDisabled ? (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <EmployeeNameLink nameOrId={row.memberName} />
                          </div>
                        ) : (
                          <input type="text" placeholder="Member Name" value={row.memberName}
                            onChange={e => setCashAdvances(p => p.map(r => r.id === row.id ? { ...r, memberName: e.target.value } : r))}
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Details" value={row.details}
                          onChange={e => setCashAdvances(p => p.map(r => r.id === row.id ? { ...r, details: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setCashAdvances(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => {
                            if (row.resolvedExpenseId) {
                              deleteAuditExpense(row.resolvedExpenseId).catch(err => console.error('[DTR] Failed to delete cash advance record:', err))
                            }
                            setCashAdvances(p => p.filter(r => r.id !== row.id))
                          }} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setCashAdvances(p => [...p, mkCashAdv()])} label="Add row" />}
            </div>
          </div>

          {/* Purchases — a separate cash-out category, never counted in or synced to Expenses */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Purchases" total={totalExpPurch} variant="expense" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Name</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {expPurch.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        {isFormDisabled ? (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <EmployeeNameLink nameOrId={row.name} />
                          </div>
                        ) : (
                          <input type="text" placeholder="Name" value={row.name}
                            onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setExpPurch(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setExpPurch(p => [...p, mkExp()])} label="Add row" />}
            </div>
          </div>

          {/* Payables */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Payables" total={totalPayables} variant="expense" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {payables.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setPayables(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setPayables(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setPayables(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setPayables(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setPayables(p => [...p, mkPay()])} label="Add row" />}
            </div>
          </div>

          {/* Parts Order / Units Order */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Parts Order / Units Order" total={totalOrders} variant="expense" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer" value={row.customer}
                          onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setOrders(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setOrders(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setOrders(p => [...p, mkOrd()])} label="Add row" />}
            </div>
          </div>

          {/* COH Deposit — cash physically sent to the main branch/company bank once COH crosses
              the branch's cash-handling limit. Recorded here (with a receipt photo) so the
              reduction in tomorrow's COH has an explanation on file instead of just showing up
              smaller. */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="COH Deposit" total={totalDeposits} variant="expense" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh}>Reference / OR No.</th>
                    <th className={tableTh + ' text-right w-28'}>Amount</th>
                    <th className={tableTh + ' w-28'}>Receipt</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {deposits.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setDeposits(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Reference / OR No." value={row.referenceNo}
                          onChange={e => setDeposits(p => p.map(r => r.id === row.id ? { ...r, referenceNo: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setDeposits(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd + ' text-center'}>
                        {row.receiptImage ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button type="button" onClick={() => setReceiptDialog({ mode: 'deposit', rowId: row.id })} title={isFormDisabled ? 'View deposit details' : 'Review / edit deposit details'}>
                              <img src={row.receiptImage} alt="Deposit slip" className="h-8 w-8 object-cover rounded border border-slate-300 dark:border-slate-700 hover:opacity-80 transition cursor-pointer" />
                            </button>
                            {!isFormDisabled && (
                              <button type="button" onClick={() => setDeposits(p => p.map(r => r.id === row.id ? { ...r, receiptImage: '' } : r))}
                                className="text-[10px] text-red-500 font-bold uppercase hover:underline">
                                Remove
                              </button>
                            )}
                          </div>
                        ) : (
                          !isFormDisabled && (
                            <button type="button" onClick={() => setReceiptDialog({ mode: 'deposit', rowId: row.id })}
                              className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:underline">
                              Scan
                            </button>
                          )
                        )}
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => {
                            if (row.resolvedExpenseId) {
                              deleteAuditExpense(row.resolvedExpenseId).catch(err => console.error('[DTR] Failed to delete deposit record:', err))
                            }
                            setDeposits(p => p.filter(r => r.id !== row.id))
                          }} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setDeposits(p => [...p, mkDeposit()])} label="Add row" />}
            </div>
          </div>

          {/* Incentives */}
          {INCENTIVES_ENABLED && (
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Incentives" total={totalIncentives} variant="expense" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Brand</th>
                    <th className={tableTh + ' w-20 text-center'}>HP</th>
                    <th className={tableTh}>Promodiser</th>
                    <th className={tableTh + ' text-right w-32'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                  </tr>
                </thead>
                <tbody>
                  {incentives.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className={tableTd}>
                        <input type="text" placeholder="Customer name" value={row.customer}
                          onChange={e => setIncentives(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="e.g. MIDEA" value={row.company}
                          onChange={e => setIncentives(p => p.map(r => r.id === row.id ? { ...r, company: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="1.5" value={row.hp}
                          onChange={e => setIncentives(p => p.map(r => r.id === row.id ? { ...r, hp: e.target.value } : r))}
                          className={`${flushInput} text-center`} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        {isFormDisabled ? (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <EmployeeNameLink nameOrId={row.promodiser} />
                          </div>
                        ) : (
                          <input type="text" placeholder="Promodiser name" value={row.promodiser}
                            onChange={e => setIncentives(p => p.map(r => r.id === row.id ? { ...r, promodiser: e.target.value } : r))}
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setIncentives(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setIncentives(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setIncentives(p => [...p, mkInc()])} label="Add row" />}
            </div>
          </div>
          )}

          </div>

        </div>

        {/* For Collection */}
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 mt-4">
          <SectionHeader label="For Collection" total={totalForColl} variant="income" />
          <div className="p-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className={tableTh}>Ticket No.</th>
                  <th className={tableTh}>Customer</th>
                  <th className={tableTh}>Installer</th>
                  <th className={tableTh + ' text-right w-28'}>Amount</th>
                  {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                </tr>
              </thead>
              <tbody>
                {forColl.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className={tableTd}>
                      <input type="text" placeholder="Ticket No." value={row.ticketNumber || ''}
                        onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, ticketNumber: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="Customer" value={row.customer}
                        onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      {isFormDisabled ? (
                        <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <EmployeeNameLink nameOrId={row.installer} />
                        </div>
                      ) : (
                        <input type="text" placeholder="Installer" value={row.installer}
                          onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                          className={flushInput} />
                      )}
                    </td>
                    <td className={tableTd}>
                      <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                        onValueChange={(values) => setForColl(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                        className={flushInputNumber} disabled={isFormDisabled} />
                    </td>
                    {canSubmit && !reviewMode && (
                      <td className={tableTd + ' text-center'}>
                        <DelBtn onClick={() => setForColl(p => p.filter(r => r.id !== row.id))} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {canSubmit && !reviewMode && <AddRowBtn onClick={() => setForColl(p => [...p, mkColl()])} label="Add row" />}
          </div>
        </div>

        {/* Rebates for Collection */}
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 mt-4">
          <SectionHeader label="Rebates for Collection" total={totalRebates} variant="income" />
          <div className="p-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className={tableTh}>Ticket No.</th>
                  <th className={tableTh}>Customer</th>
                  <th className={tableTh}>Company / RA No.</th>
                  <th className={tableTh}>Brand</th>
                  <th className={tableTh + ' w-20 text-center'}>HP</th>
                  <th className={tableTh + ' text-right w-32'}>Amount</th>
                  {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                </tr>
              </thead>
              <tbody>
                {rebates.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className={tableTd}>
                      <input type="text" placeholder="Ticket No." value={row.ticketNumber}
                        onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, ticketNumber: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="Customer name" value={row.customer}
                        onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="e.g. ROBINSONS" value={row.raNumber}
                        onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, raNumber: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="e.g. MIDEA" value={row.company}
                        onChange={e => setRebates(p => p.map(r => {
                          if (r.id !== row.id) return r
                          const nextCompany = e.target.value
                          const rate = lookupRebateRate(nextCompany, r.hp)
                          return { ...r, company: nextCompany, amount: rate != null ? String(rate) : r.amount }
                        }))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="1.5" value={row.hp}
                        onChange={e => setRebates(p => p.map(r => {
                          if (r.id !== row.id) return r
                          const nextHp = e.target.value
                          const rate = lookupRebateRate(r.company, nextHp)
                          return { ...r, hp: nextHp, amount: rate != null ? String(rate) : r.amount }
                        }))}
                        className={`${flushInput} text-center`} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                        onValueChange={(values) => setRebates(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                        className={flushInputNumber} disabled={isFormDisabled} />
                    </td>
                    {canSubmit && !reviewMode && (
                      <td className={tableTd + ' text-center'}>
                        <DelBtn onClick={() => setRebates(p => p.filter(r => r.id !== row.id))} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {canSubmit && !reviewMode && <AddRowBtn onClick={() => setRebates(p => [...p, mkReb()])} label="Add row" />}
          </div>
        </div>

        {/* Commission Expenses */}
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 mt-4">
          <SectionHeader label="Commission Expenses" total={totalCommissionExpenses} variant="expense" />
          <div className="p-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className={tableTh}>Ticket No.</th>
                  <th className={tableTh}>Customer Name</th>
                  <th className={tableTh}>Store</th>
                  <th className={tableTh}>Diser</th>
                  <th className={tableTh}>Brand</th>
                  <th className={tableTh + ' w-20'}>HP</th>
                  <th className={tableTh + ' w-36'}>Date Installed</th>
                  <th className={tableTh + ' text-right w-32'}>Amount</th>
                  {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
                </tr>
              </thead>
              <tbody>
                {commissions.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className={tableTd}>
                      <input type="text" placeholder="Ticket No." value={row.ticketNumber}
                        onChange={e => setCommissions(p => p.map(r => r.id === row.id ? { ...r, ticketNumber: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="Customer name" value={row.customer}
                        onChange={e => setCommissions(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="Store" value={row.store}
                        onChange={e => setCommissions(p => p.map(r => r.id === row.id ? { ...r, store: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="Diser" value={row.diser}
                        onChange={e => setCommissions(p => p.map(r => r.id === row.id ? { ...r, diser: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="Brand" value={row.brand}
                        onChange={e => setCommissions(p => p.map(r => r.id === row.id ? { ...r, brand: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="HP" value={row.hp}
                        onChange={e => setCommissions(p => p.map(r => r.id === row.id ? { ...r, hp: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <input type="text" placeholder="YYYY-MM-DD" value={row.dateInstalled}
                        onChange={e => setCommissions(p => p.map(r => r.id === row.id ? { ...r, dateInstalled: e.target.value } : r))}
                        className={flushInput} disabled={isFormDisabled} />
                    </td>
                    <td className={tableTd}>
                      <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                        onValueChange={(values) => setCommissions(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                        className={flushInputNumber} disabled={isFormDisabled} />
                    </td>
                    {canSubmit && !reviewMode && (
                      <td className={tableTd + ' text-center'}>
                        <DelBtn onClick={() => setCommissions(p => p.filter(r => r.id !== row.id))} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {canSubmit && !reviewMode && <AddRowBtn onClick={() => setCommissions(p => [...p, mkComm()])} label="Add row" />}
          </div>
        </div>

        {/* Row: Unit Summary | Final Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">

          {/* Unit Summary */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Unit Summary" />
            <div className="p-3">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center w-28">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: 'Scheduled Units',          value: scheduledUnits,   setter: setScheduledUnits },
                    { label: 'Rescheduled Units',        value: rescheduledUnits, setter: setRescheduledUnits },
                    { label: 'Installed Units',          value: installedUnits,   setter: setInstalledUnits },
                    { label: 'Serviced Units',           value: servicedUnits,    setter: setServicedUnits },
                    { label: 'Cancelled Units',          value: cancelledUnits,   setter: setCancelledUnits },
                    { label: 'Free Install Units',       value: freeInstallUnits, setter: setFreeInstallUnits },
                    { label: 'Survey Only Units',        value: surveyOnlyUnits,  setter: setSurveyOnlyUnits },
                  ] as { label: string; value: string; setter: (v: string) => void }[]).map(({ label, value, setter }) => (
                    <tr key={label} className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className="px-3 py-1.5 font-medium text-slate-600 dark:text-slate-400">{label}</td>
                      <td className="px-3 py-1 text-center w-28">
                        <NumericFormat
                          thousandSeparator={false}
                          decimalScale={0}
                          fixedDecimalScale={false}
                          allowNegative={false}
                          placeholder="0"
                          value={value}
                          onValueChange={(values) => setter(values.value || '')}
                          className="w-20 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs font-bold rounded focus:outline-none focus:ring-1 focus:ring-emerald-500/30 py-0.5 px-2 text-slate-800 dark:text-slate-200"
                          disabled={isFormDisabled}
                          autoComplete="off"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final Summary */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Final Summary" />
            <div className="p-3">
              <table className="w-full text-left border-collapse text-xs">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Total Fund Received</td>
                    <td className="px-3 py-2 text-right font-bold text-cyan-600 dark:text-cyan-400">{php(totalFundReceived)}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/40">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Grand Total Expenses</td>
                    <td className="px-3 py-2 text-right font-bold text-red-500">{php(grandTotalExpenses)}</td>
                  </tr>
                  {totalDeposits > 0 && (
                    <tr className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">COH Deposit</td>
                      <td className="px-3 py-2 text-right font-bold text-red-500">{php(totalDeposits)}</td>
                    </tr>
                  )}
                  {INCENTIVES_ENABLED && totalIncentives > 0 && (
                    <tr className="border-b border-slate-100 dark:border-slate-800/40">
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">Incentives (affects Gross Sales only)</td>
                      <td className="px-3 py-2 text-right font-bold text-red-500">{php(totalIncentives)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 dark:bg-slate-900/40 font-bold">
                    <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 font-bold text-sm">Total Cash on Hand / Deposit</td>
                    <td className="px-3 py-2.5 text-right text-base text-emerald-600 dark:text-emerald-400 font-black">
                      {php(totalCashOnHand)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {(formatBranchName(branchName) || 'No branch selected').toUpperCase()} - {formatReviewDateTime(reviewStartedAt || new Date())}
              </div>
            </div>
          </div>

        </div>

      </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 bg-red-500/5 border border-red-500/20">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Footer Action Buttons */}
      {canEditOrSubmit && (
        reviewMode ? (
          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <div>
              <button
                type="button"
                onClick={() => {
                  setReviewMode(false)
                  setReviewStartedAt(null)
                }}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105 disabled:opacity-50 border shadow-sm"
                style={{ borderColor: border, color: textMuted, backgroundColor: isLight ? '#f8fafc' : '#0f172a' }}
              >
                ← Go Back & Edit
              </button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                id="confirm-submit-dtr-btn"
                onClick={handleDtrSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 hover:shadow-lg disabled:opacity-50"
                style={{ backgroundColor: '#10B981', border: '1px solid #059669', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(16,185,129,0.25)' }}
              >
                {submitting ? (reportId ? <>Updating...</> : <>Submitting...</>) : <><Check className="w-4 h-4" /> {reportId ? 'Confirm & Update' : 'Confirm & Submit'}</>}
              </button>
            </div>
          </div>
        ) : (
          reportId && !isEditingExisting ? (
            <div className="flex items-center justify-end gap-3 mt-4 flex-wrap">
              {canEditExistingReport && (
                <button
                  type="button"
                  onClick={() => setIsEditingExisting(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 hover:shadow-lg"
                  style={{ backgroundColor: '#10B981', border: '1px solid #059669', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(16,185,129,0.25)' }}
                >
                  <Edit className="w-4 h-4" /> Edit Report
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (onSwitchToSummary) onSwitchToSummary()
                  else window.location.href = '/audit-report'
                }}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105 border shadow-sm"
                style={{ borderColor: border, color: textMuted, backgroundColor: isLight ? '#f8fafc' : '#0f172a' }}
              >
                Back to Summary
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
              <div>
                <button
                  type="button"
                  onClick={handleClearForm}
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105 hover:bg-red-500/10 text-red-500 border border-red-500/30 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Clear Form
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105 disabled:opacity-50 border shadow-sm"
                  style={{ borderColor: border, color: textMuted, backgroundColor: isLight ? '#f8fafc' : '#0f172a' }}
                >
                  Cancel
                </button>
                <button
                  id="submit-dtr-btn"
                  onClick={handleDtrSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 hover:shadow-lg disabled:opacity-50"
                  style={{ backgroundColor: '#10B981', border: '1px solid #059669', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(16,185,129,0.25)' }}
                >
                  {submitting ? (
                    reportId ? <>Updating...</> : <>Submitting...</>
                  ) : (
                    <><Send className="w-4 h-4" /> {reportId ? 'Update Report' : 'Submit Daily Report'}</>
                  )}
                </button>
              </div>
            </div>
          )
        )
      )}

      {/* Autocomplete Datalist */}
      <datalist id="tech-suggestions">
        {techSuggestions.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Cash Return Autocomplete Datalist */}
      {receiptDialog && (() => {
        const isExp = receiptDialog.mode === 'expense'
        const expRow = isExp ? expReceipt.find(r => r.id === receiptDialog.rowId) : undefined
        const depRow = !isExp ? deposits.find(r => r.id === receiptDialog.rowId) : undefined
        const otherNos = isExp
          ? expReceipt.filter(r => r.id !== receiptDialog.rowId).map(r => r.receiptNo || '').filter(Boolean)
          : deposits.filter(r => r.id !== receiptDialog.rowId).map(r => r.referenceNo || '').filter(Boolean)
        return (
          <ReceiptScanDialog
            key={`${receiptDialog.mode}-${receiptDialog.rowId}`}
            mode={receiptDialog.mode}
            branchName={branchName}
            reportDate={reportDate}
            nameSuggestions={techSuggestions}
            otherReceiptNos={otherNos}
            initial={isExp && expRow ? {
              receiptImage: expRow.receiptImage, receiptDate: expRow.receiptDate, company: expRow.company, receiptNo: expRow.receiptNo,
              amount: expRow.amount, description: expRow.description, incurredBy: expRow.name,
              expenseCategory: expRow.expenseCategory, sourceOfFunds: expRow.sourceOfFunds,
            } : depRow ? {
              receiptImage: depRow.receiptImage, receiptNo: depRow.referenceNo, amount: depRow.amount, description: depRow.description, company: depRow.bank,
            } : undefined}
            onClose={() => setReceiptDialog(null)}
            onConfirm={result => isExp ? commitExpenseReceipt(receiptDialog.rowId, result) : commitDepositReceipt(receiptDialog.rowId, result)}
          />
        )
      })()}

      <datalist id="cash-return-suggestions">
        {techSuggestions.map(name => (
          <option key={name} value={name} />
        ))}
        {refundablePurchases.map(p => {
          const optionText = getRefundOptionText(p)
          return <option key={p.id} value={optionText} />
        })}
      </datalist>

      <ConfirmDialog
        dialog={confirmDialog}
        onClose={() => {
          setConfirmDialog(null)
          resetReportDateInput()
        }}
      />

      <DtrHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        reportId={reportId}
        isLight={isLight}
        border={border}
        textPrimary={textPrimary}
        textMuted={textMuted}
      />

    </div>
  )
}
