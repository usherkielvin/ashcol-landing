import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { NumericFormat } from 'react-number-format'
import { Plus, Trash2, Check, Receipt, Send, Edit, CalendarDays, ChevronDown } from 'lucide-react'
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
  isPortalAdmin,
  type BranchListEntry,
} from '../utils/api'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import { fetchAndMapTickets, fetchAndMapOnlineTickets, fetchAndMapCheckTickets, fetchAndMapForCollTickets, fetchAndMapRebateTickets, fetchAndCountUnitSummary, lookupRebateRate } from '../utils/schedulePrefill'

// ── Types ────────────────────────────────────────────────────────────────────


// DTR-specific row types
interface CashTxRow    { id: string; ticketNumber?: string; customer: string; installer: string; amount: string }
interface CashRetRow   { id: string; name: string; amount: string }
interface OnlineTxRow  { id: string; ticketNumber?: string; installer: string; customer: string; bank: string; amount: string }
interface CheckRow     { id: string; ticketNumber?: string; installer: string; customer: string; bank: string; amount: string }
interface PartsSaleRow { id: string; customer: string; description: string; capital: string; salePrice: string }
interface ForCollRow   { id: string; ticketNumber?: string; installer: string; customer: string; amount: string; collectionResolved?: boolean }
interface RebateRow    { id: string; ticketNumber: string; customer: string; company: string; raNumber: string; hp: string; amount: string }
interface OrderRow     { id: string; customer: string; description: string; amount: string; receiptReturned?: boolean; actualAmount?: string; receiptNo?: string; receiptDate?: string; resolvedExpenseId?: string; receiptStatus?: string }
interface ExpenseRow   { id: string; name: string; description: string; amount: string; receiptReturned?: boolean; actualAmount?: string; receiptNo?: string; receiptDate?: string; resolvedExpenseId?: string; receiptStatus?: string }
interface IncentiveRow { id: string; customer: string; company: string; hp: string; promodiser: string; amount: string; collectionResolved?: boolean }

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

  // 24-hour edit window enforcement for non-admin users (members / OIC)
  if (report.submittedAt) {
    const submittedMs = new Date(report.submittedAt).getTime()
    if (!isNaN(submittedMs) && Date.now() - submittedMs > 24 * 60 * 60 * 1000) {
      return false
    }
  }

  const role = ctx.role
  const mayEmployeeEdit = isEmployeePortalRole(role) && isMayDtrEditWindow(report.reportDate)
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
const mkRet  = (): CashRetRow  => ({ id: uid(), name: '', amount: '' })
const mkOnl  = (): OnlineTxRow => ({ id: uid(), ticketNumber: '', installer: '', customer: '', bank: '', amount: '' })
const mkChk  = (): CheckRow    => ({ id: uid(), ticketNumber: '', installer: '', customer: '', bank: '', amount: '' })
const mkPart = (): PartsSaleRow => ({ id: uid(), customer: '', description: '', capital: '', salePrice: '' })
const mkColl = (): ForCollRow  => ({ id: uid(), ticketNumber: '', installer: '', customer: '', amount: '', collectionResolved: false })
const mkReb  = (): RebateRow   => ({ id: uid(), ticketNumber: '', customer: '', company: '', raNumber: '', hp: '', amount: '' })

const mkOrd  = (): OrderRow    => ({ id: uid(), customer: '', description: '', amount: '', receiptReturned: false })
const mkPay  = (): OrderRow    => ({ id: uid(), customer: '', description: '', amount: '', receiptReturned: false })
const mkExp  = (): ExpenseRow  => ({ id: uid(), name: '', description: '', amount: '', receiptReturned: false })
const mkInc  = (): IncentiveRow => ({ id: uid(), customer: '', company: '', hp: '', promodiser: '', amount: '', collectionResolved: false })

// Temporarily hidden: saving a report with INCENTIVE items crashes the production backend
// (Jackson classpath mismatch — NoClassDefFoundError: JsonMappingException$Reference) until
// it's redeployed with a clean build. Hides the section and strips INCENTIVE rows from the
// submit payload so previously-saved incentive data doesn't retrigger the crash either.
const INCENTIVES_ENABLED = false

const getTrNoPrefix = (branchName: string, auditLine?: string | null) => {
  const clean = branchName.toUpperCase()
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
          const hasExplicitTaguigSales = list.some((b: { id: string; name: string }) => {
            const id = b.id.toUpperCase()
            const name = b.name.toUpperCase()
            return id === 'BR-TAGUIG-SALES-EXPLICIT' || (name.includes('TAGUIG') && name.includes('SALES') && id !== 'BR-TAGUIG-SALES')
          })
          const hasExplicitTaguigServices = list.some((b: { id: string; name: string }) => {
            const id = b.id.toUpperCase()
            const name = b.name.toUpperCase()
            return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || name.includes('TAGUIG') && name.includes('SERVICE')
          })

          const newList: { id: string; name: string; auditLine?: string; isActive?: boolean }[] = []
          for (const b of list) {
            const cleanName = b.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
            if (cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG') {
              if (!hasExplicitTaguigSales) newList.push({ id: b.id, name: 'TAGUIG - SALES', auditLine: 'TAGUIG_SALES', isActive: b.isActive })
              if (!hasExplicitTaguigServices) newList.push({ id: b.id, name: 'TAGUIG - SERVICES', auditLine: 'TAGUIG_SERVICE', isActive: b.isActive })
            } else if (cleanName.includes('TAGUIG')) {
              const isServ = cleanName.includes('SERVICE')
              newList.push({
                id: b.id,
                name: isServ ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES',
                auditLine: isServ ? 'TAGUIG_SERVICE' : 'TAGUIG_SALES',
                isActive: b.isActive
              })
            } else {
              newList.push({ id: b.id, name: cleanName, isActive: b.isActive })
            }
          }
          // Filter to active branches only (where submission isn't disabled)
          const finalList = newList.filter(b => b.isActive !== false)
          
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
  // Cash Returns
  const [cashRet, setCashRet]   = useState<CashRetRow[]>([mkRet()])
  // Fund Transfer from HO
  const [cashOnHand, setCashOnHand]     = useState('')
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
  // Parts Order / Units Order
  const [orders, setOrders]             = useState<OrderRow[]>([mkOrd()])
  // Payables
  const [payables, setPayables]         = useState<OrderRow[]>([mkPay()])
  // Expenses with Receipts
  const [expReceipt, setExpReceipt]     = useState<ExpenseRow[]>([mkExp()])
  // Expenses for Purchase
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
    if (hasCashData && hasRebateData) return

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
    ]).then(([cashResult, onlineResult, checkResult, forCollResult, unitSummaryResult, rebateResult]) => {
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
    }).catch(() => {
      clearTimeout(timeout)
    })

    return () => { controller.abort(); clearTimeout(timeout) }
  }, [reportDate, selectedBranchId, reportId])

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
      setInstalledUnits(data.totalUnitsInstalled != null ? String(data.totalUnitsInstalled) : '0')
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
                capital: '',
                salePrice: amt
              })
            } else if (desc.startsWith('RETURN|')) {
              cashReturnsList.push({
                id: uid(),
                name: formatDisplayUserLabel(desc.replace('RETURN|', '')),
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
            if (desc.startsWith('CHECK|')) {
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
              receiptStatus: item.receiptStatus || ''
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
                receiptStatus: item.receiptStatus || ''
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
          receiptStatus: ''
        })
      }
      setExpReceipt(expReceiptList.length > 0 ? expReceiptList : [mkExp()])

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
          receiptStatus: ''
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
    setOrders([mkOrd()])
    setExpReceipt([mkExp()])
    setExpPurch([mkExp()])
    setScheduledUnits('0')
    setSurveyOnlyUnits('0')
    setRescheduledUnits('0')
    setInstalledUnits('0')
    setServicedUnits('0')
    setCancelledUnits('0')
    setFreeInstallUnits('0')
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

  const handleSyncFromSchedule = () => {
    if (!selectedBranchId || !reportDate || syncLoading) return
    const hasExistingTxData =
      cashTx.some(r => r.customer.trim() || r.installer.trim() || r.amount.trim() || r.ticketNumber?.trim()) ||
      onlineTx.some(r => r.customer.trim() || r.installer.trim() || r.bank.trim() || r.amount.trim() || r.ticketNumber?.trim()) ||
      checkRem.some(r => r.customer.trim() || r.installer.trim() || r.bank.trim() || r.amount.trim() || r.ticketNumber?.trim()) ||
      forColl.some(r => r.customer.trim() || r.installer.trim() || r.amount.trim() || r.ticketNumber?.trim())

    if (hasExistingTxData) {
      setConfirmDialog({
        title: 'Overwrite Current Transactions?',
        message: 'You have existing entries in transaction tables. Syncing from schedule will clear current entries and replace them with fetched schedule data.',
        detail: 'Click OK to clear and overwrite with schedule data, or Cancel to keep current entries.',
        confirmText: 'OK',
        cancelText: 'Cancel',
        variant: 'discard',
        onConfirm: () => {
          setConfirmDialog(null)
          void executeSyncFromSchedule()
        },
      })
    } else {
      void executeSyncFromSchedule()
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

  const handleSyncRebatesFromSchedule = () => {
    if (!selectedBranchId || !reportDate || rebateSyncLoading) return
    const hasExistingRebateData = rebates.some(
      r => r.ticketNumber.trim() || r.customer.trim() || r.company.trim() || r.amount.trim() || r.raNumber.trim()
    )

    if (hasExistingRebateData) {
      setConfirmDialog({
        title: 'Overwrite Current Rebates?',
        message: 'You have existing entries in Rebates for Collection. Syncing from schedule will clear current entries and replace them with fetched schedule data.',
        detail: 'Click OK to clear and overwrite with schedule data, or Cancel to keep current entries.',
        confirmText: 'OK',
        cancelText: 'Cancel',
        variant: 'discard',
        onConfirm: () => {
          setConfirmDialog(null)
          void executeSyncRebatesFromSchedule()
        },
      })
    } else {
      void executeSyncRebatesFromSchedule()
    }
  }

  // (DTR Image paste and upload handlers removed)

  // ── DTR Calculations ─────────────────────────────────────────────
  const totalCashCollection  = sumArr(cashTx.map(r => r.amount))
  const totalCashReturns     = sumArr(cashRet.map(r => r.amount))
  const totalOnline          = sumArr(onlineTx.map(r => r.amount))
  const totalCheck           = sumArr(checkRem.map(r => r.amount))
  const totalForColl         = sumArr(forColl.map(r => r.amount))
  const totalRebates         = rebates.reduce((s, r) => s + num(r.amount), 0)
  const totalOrders          = sumArr(orders.map(r => r.amount))
  const totalPayables        = sumArr(payables.map(r => r.amount))
  const totalExpReceipt      = sumArr(expReceipt.map(r => r.amount))
  const totalExpPurch        = sumArr(expPurch.map(r => r.amount))
  const totalIncentives      = sumArr(incentives.map(r => r.amount))
  // Incentives reduce Gross Sales (applied server-side in ReportService), but they're not cash
  // that left the branch's hand — they must NOT be subtracted from Cash on Hand / Deposit here.
  const grandTotalExpenses   = totalExpReceipt + totalExpPurch
  const totalFundReceived    = num(cashOnHand) + num(fundFromHo) + totalCashCollection + totalCashReturns
  const totalCashOnHand      = totalFundReceived - grandTotalExpenses

  // ── Submit handler ───────────────────────────────────────────────
  // ── Submit & Action Handlers ─────────────────────────────────────
  const executeDtrSubmit = async () => {
    setSubmitting(true); setError(null)
    const wasEdit = Boolean(reportId)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

      // Build unified items array from all DTR sections
      const dtrItems: object[] = [
        ...cashTx.filter(r => r.customer || r.installer || r.amount).map(r => ({
          type: 'CASH_SALE', description: r.installer, customer: r.customer, amount: parseFloat(r.amount) || 0
        })),
        ...cashRet.filter(r => r.name || r.amount).map(r => ({
          type: 'CASH_SALE', description: `RETURN|${r.name}`, amount: parseFloat(r.amount) || 0
        })),
        ...onlineTx.filter(r => r.installer || r.amount).map(r => ({
          type: 'ONLINE_SALE', description: r.installer, customer: r.customer, bank: r.bank, amount: parseFloat(r.amount) || 0
        })),
        ...checkRem.filter(r => r.installer || r.amount).map(r => ({
          type: 'ONLINE_SALE', description: `CHECK|${r.installer}`, customer: r.customer, bank: r.bank, amount: parseFloat(r.amount) || 0
        })),
        ...partsSales.filter(r => r.customer || r.salePrice).map(r => ({
          type: 'CASH_SALE', description: `PARTS|${r.customer}|${r.description}`, amount: parseFloat(r.salePrice) || 0
        })),
        ...expReceipt.filter(r => r.name || r.amount).map(r => ({
          type: 'EXPENSE',
          description: `${r.name}|${r.description}`,
          amount: parseFloat(r.amount) || 0,
          receiptReturned: r.receiptReturned || false,
          actualAmount: (r.actualAmount && !isNaN(parseFloat(r.actualAmount))) ? parseFloat(r.actualAmount) : null,
          receiptNo: r.receiptNo || null,
          receiptDate: r.receiptDate || null,
          resolvedExpenseId: r.resolvedExpenseId || null
        })),
        ...expPurch.filter(r => r.name || r.amount).map(r => ({
          type: 'PURCHASE',
          description: `${r.name}|${r.description}`,
          amount: parseFloat(r.amount) || 0,
          receiptReturned: r.receiptReturned || false,
          actualAmount: (r.actualAmount && !isNaN(parseFloat(r.actualAmount))) ? parseFloat(r.actualAmount) : null,
          receiptNo: r.receiptNo || null,
          receiptDate: r.receiptDate || null,
          resolvedExpenseId: r.resolvedExpenseId || null
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
    const hasParts = partsSales.some(r => r.customer.trim() || r.description.trim() || r.salePrice.trim())
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
        <div className="rounded-xl p-4 flex items-center gap-3 bg-blue-500/5 border border-blue-500/20">
          <Receipt className="w-5 h-5 shrink-0 text-blue-500" />
          <p className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Note:</strong> This report is currently in view-only mode. Click the <strong>Edit Report</strong> button at the bottom of the page to unlock and edit this daily report.
          </p>
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
                  onClick={handleSyncFromSchedule}
                  disabled={syncLoading || isFormDisabled}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shrink-0"
                  style={{ backgroundColor: '#10B981', border: '1px solid #059669', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)' }}
                >
                  {syncLoading ? (
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-7.5 4"/><path d="M3 12a9 9 0 0 0 9 9 9 9 0 0 0 7.5-4"/><polyline points="3 4 3 8 7 8"/><polyline points="21 20 21 16 17 16"/></svg>
                  )}
                  Sync Transactions from Sched
                </button>
                <button
                  type="button"
                  onClick={handleSyncRebatesFromSchedule}
                  disabled={rebateSyncLoading || isFormDisabled}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shrink-0"
                  style={{ backgroundColor: '#10B981', border: '1px solid #059669', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)' }}
                >
                  {rebateSyncLoading ? (
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-7.5 4"/><path d="M3 12a9 9 0 0 0 9 9 9 9 0 0 0 7.5-4"/><polyline points="3 4 3 8 7 8"/><polyline points="21 20 21 16 17 16"/></svg>
                  )}
                  Sync Rebates from Sched
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
        {!!reportId && (submittedAt || lastUpdatedAt || lastUpdatedBy) && (
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
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Ticket No.</th>
                    <th className={tableTh}>Customer Name</th>
                    <th className={tableTh}>Installer</th>
                    <th className={tableTh + ' text-right w-32'}>Amount</th>
                    {canSubmit && !reviewMode && <th className={tableTh + ' w-10'}></th>}
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
                    <th className={tableTh}>Name (Installer/Technician/Driver)</th>
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
            <SectionHeader label="Parts Sales / Unit Sales" total={sumArr(partsSales.map(r => r.salePrice))} variant="income" />
            <div className="p-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={tableTh}>Customer</th>
                    <th className={tableTh}>Description</th>
                    <th className={tableTh + ' text-right w-24'}>Capital</th>
                    <th className={tableTh + ' text-right w-24'}>Sale Price</th>
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
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.capital}
                          onValueChange={(values) => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, capital: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.salePrice}
                          onValueChange={(values) => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, salePrice: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
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
                            className={flushInput} />
                        )}
                      </td>
                      <td className={tableTd}>
                        <input type="text" placeholder="Description" value={row.description}
                          onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                          className={flushInput} disabled={isFormDisabled} />
                      </td>
                      <td className={tableTd}>
                        <NumericFormat thousandSeparator="," decimalScale={2} fixedDecimalScale={true} allowNegative={false} placeholder="0.00" value={row.amount}
                          onValueChange={(values) => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, amount: values.value } : r))}
                          className={flushInputNumber} disabled={isFormDisabled} />
                      </td>
                      {canSubmit && !reviewMode && (
                        <td className={tableTd + ' text-center'}>
                          <DelBtn onClick={() => setExpReceipt(p => p.filter(r => r.id !== row.id))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSubmit && !reviewMode && <AddRowBtn onClick={() => setExpReceipt(p => [...p, mkExp()])} label="Add row" />}
            </div>
          </div>

          {/* Expenses for Purchase */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <SectionHeader label="Expenses for Purchase" total={totalExpPurch} variant="expense" />
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
                {(branchName || 'No branch selected').toUpperCase()} - {formatReviewDateTime(reviewStartedAt || new Date())}
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

    </div>
  )
}
