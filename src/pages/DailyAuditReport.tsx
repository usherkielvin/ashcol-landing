import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ReactDOM from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  AlertTriangle, X, ChevronRight, Eye, Download,
  ArrowUp, ArrowDown,
  MoreVertical,
  Loader2,
  Trash2, ClipboardList, Upload, Check, FileEdit
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatDisplayUserLabel, formatBranchName, isSameBaseBranch, resolveScopedBranchId, isDtrMayEditOpenForView, isEmployeePortalRole, isPortalAdmin } from '../utils/api'
import DTR_Form from './DTR_Form'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import { exportDtrReportToPdf } from '../utils/pdfExport'
import { useArctic } from '../contexts/ArcticContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditRow {
  id?: string | null
  branchId: string
  auditLine?: string | null
  /** Physical branch for counting (8 locations); Taguig audit lines share "ASHCOL TAGUIG". */
  logicalBranchName?: string | null
  branchName: string
  timeUploaded: string | null
  createdAt?: string | null
  status: string
  grossSales: number
  targetDailyQuota: number
  difference: number
  remarks: string
  cohPreviousDay: number
  fundFromHo: number
  cashReturns: number
  totalCohCfd: number
  totalCashCollection: number
  totalOnlineCollection: number
  payrollExpenses: number
  totalExpenses: number
  totalForPurchase: number
  totalPayables: number
  totalUnitsScheduled?: number
  totalUnitsSurveyOnly?: number
  totalRescheduled?: number
  totalUnitsInstalledServiced: number
  totalUnitsInstalled?: number
  totalUnitsServiced: number
  totalCancelled: number
  totalUnitsCancelled?: number
  totalUnitsFreeInstall: number
  forCollection: number
  rebatesForCollection: number
  paidCommissionExpenses?: number
}

interface DrilldownItem {
  type: string
  description: string
  amount: number
  receiptReturned?: boolean
  receiptStatus?: 'PENDING' | 'UPLOADED' | string
  company?: string
  units?: number
  customer?: string
  collectionResolved?: boolean
  ticketNumber?: string
  promodiser?: string
  dateInstalled?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Net Sales = Gross Sales - Expenses - Payables - Purchases - paid Commission Expenses. */
const computeNetSales = (row: Pick<AuditRow, 'grossSales' | 'totalExpenses' | 'totalPayables' | 'totalForPurchase' | 'paidCommissionExpenses'>) =>
  row.grossSales - (row.totalExpenses || 0) - (row.totalPayables || 0) - (row.totalForPurchase || 0) - (row.paidCommissionExpenses || 0)

const formatLocalTime = (utcString: string | null | undefined, fallback: string | null | undefined) => {
  if (!utcString) return fallback || ''
  try {
    const d = new Date(utcString)
    if (isNaN(d.getTime())) return fallback || ''
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return fallback || ''
  }
}

const formatDateTime = (value?: string | null) => {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return value || ''
    return d.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return value || ''
  }
}

const formatDateTriggerLabel = (value: string) => {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${month}/${day}/${year}` : value
}

const todayLocalKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────



const isNoTransactionRemarks = (remarks: string) =>
  remarks === 'NO SCHED' || remarks === 'NO TRANSACTION' || remarks === 'NO RECORD' || remarks === 'NO REPORT'

const formatRemarksLabel = (remarks: string, compact: boolean) => {
  if (isNoTransactionRemarks(remarks)) return compact ? 'No Trans' : 'No Transaction'
  if (compact && remarks === 'ABOVE QUOTA') return 'ABOVE'
  if (compact && remarks === 'BELOW QUOTA') return 'BELOW'
  return remarks
}

const remarksBadgeStyle = (remarks: string, noRecord: boolean, isAbove: boolean, isLight: boolean) => {
  if (remarks === 'PENDING') {
    return { backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
  }
  if (isNoTransactionRemarks(remarks) || noRecord) {
    return { backgroundColor: 'rgba(239,68,68,0.12)', color: isLight ? '#DC2626' : '#F87171' }
  }
  if (isAbove) {
    return { backgroundColor: 'rgba(16,185,129,0.12)', color: isLight ? '#047857' : '#34D399' }
  }
  return { backgroundColor: 'rgba(239,68,68,0.12)', color: isLight ? '#DC2626' : '#F87171' }
}

export default function DailyAuditReport() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const { setPageContext, setDataContext } = useArctic()
  const location = useLocation()
  const navigate = useNavigate()
  const isLight = theme === 'light'

  // ── Tab state (driven by ?tab= query param) ───────────────────────────────
  const activeTab = new URLSearchParams(location.search).get('tab') === 'submit' ? 'submit' : 'summary'
  const setActiveTab = (tab: 'summary' | 'submit') => {
    const params = new URLSearchParams(location.search)
    if (tab === 'summary') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    navigate(`/audit-report${params.toString() ? '?' + params.toString() : ''}`, { replace: true })
  }

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const [rows, setRows]           = useState<AuditRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [viewMode, setViewMode]   = useState<'single' | 'range'>(() => {
    const stored = localStorage.getItem('perf-view-mode')
    return (stored === 'single' || stored === 'range') ? stored : 'single'
  })

  const [date, setDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [rangeFrom, setRangeFrom] = useState(() => {
    const stored = localStorage.getItem('perf-range-from')
    if (stored) return stored
    const d = new Date(); d.setDate(d.getDate() - 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [rangeTo, setRangeTo] = useState(() => {
    const stored = localStorage.getItem('perf-range-to')
    if (stored) return stored
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  useEffect(() => {
    localStorage.setItem('perf-view-mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    localStorage.setItem('perf-range-from', rangeFrom)
  }, [rangeFrom])

  useEffect(() => {
    localStorage.setItem('perf-range-to', rangeTo)
  }, [rangeTo])

  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )

  useEffect(() => {
    const syncGlobal = () => {
      setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    }
    window.addEventListener('ashcol-global-branch-change', syncGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncGlobal)
  }, [])

  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null)
  const [rowExpenses, setRowExpenses] = useState<{
    items: DrilldownItem[];
    receivedBy?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    updatedBy?: string | null;
  } | null>(null)
  const [rowExpensesLoading, setRowExpensesLoading] = useState(false)
  const [hiddenBranches, setHiddenBranches] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'remarks', direction: 'desc' })
  const compactView = false
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileDateRef = useRef<HTMLInputElement>(null)

  interface ConfirmModalState {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    type?: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  }
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null)

  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const handleExportPdf = async () => {
    if (isExportingPdf || !selectedRow) return
    setIsExportingPdf(true)
    try {
      const reportDateDisplay = viewMode === 'single'
        ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
        : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`

      const submittedByStr = rowExpenses?.receivedBy
        ? formatDisplayUserLabel(rowExpenses.receivedBy)
        : selectedRow.timeUploaded || undefined

      const updatedByStr = rowExpenses?.updatedBy
        ? formatDisplayUserLabel(rowExpenses.updatedBy)
        : undefined

      await exportDtrReportToPdf('dtr-report-modal-content', {
        branchName: formatBranchName(selectedRow.branchName),
        dateDisplay: reportDateDisplay,
        submittedBy: submittedByStr,
        updatedBy: updatedByStr,
        updatedAt: rowExpenses?.updatedAt ? formatDateTime(rowExpenses.updatedAt) : undefined,
        status: selectedRow.remarks === 'PENDING' ? 'PENDING' : selectedRow.status,
      }, 'DTR_Report')
    } catch (err) {
      console.error('PDF Export Error:', err)
    } finally {
      setIsExportingPdf(false)
    }
  }

  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) return
    input.showPicker?.()
  }

  // ── Custom Date Picker State (desktop command bar — replaces native <input type="date">) ──
  const [datePickerState, setDatePickerState] = useState<{
    isOpen: boolean;
    target: 'single' | 'rangeFrom' | 'rangeTo' | null;
    pos: { top: number; left: number } | null;
    calYear: number;
    calMonth: number;
  }>({
    isOpen: false, target: null, pos: null,
    calYear: new Date().getFullYear(), calMonth: new Date().getMonth()
  })

  const datePickerPopRef = useRef<HTMLDivElement>(null)

  // Close custom picker on outside click or scroll
  useEffect(() => {
    if (!datePickerState.isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerPopRef.current && !datePickerPopRef.current.contains(e.target as Node)) {
        setDatePickerState(prev => ({ ...prev, isOpen: false }))
      }
    }
    const handleScroll = () => setDatePickerState(prev => ({ ...prev, isOpen: false }))

    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [datePickerState.isOpen])

  const openCustomDatePicker = (target: 'single' | 'rangeFrom' | 'rangeTo', e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const seed = target === 'single' ? date : target === 'rangeFrom' ? rangeFrom : rangeTo
    const seedDate = seed ? new Date(seed + 'T00:00:00') : new Date()
    setDatePickerState({
      isOpen: true,
      target,
      pos: { top: rect.bottom + 6, left: Math.max(10, Math.min(rect.left, window.innerWidth - 300)) },
      calYear: seedDate.getFullYear(),
      calMonth: seedDate.getMonth(),
    })
  }

  const toDateKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const handleCalendarDayClick = (day: number) => {
    const key = toDateKey(datePickerState.calYear, datePickerState.calMonth, day)
    if (datePickerState.target === 'single') setDate(key)
    else if (datePickerState.target === 'rangeFrom') setRangeFrom(key)
    else if (datePickerState.target === 'rangeTo') setRangeTo(key)
    setDatePickerState(prev => ({ ...prev, isOpen: false }))
  }

  const handleClearRow = (row: AuditRow) => {
    if (!row.id) return
    setConfirmModal({
      title: 'Clear DTR Record',
      message: `Are you sure you want to clear all data for ${row.branchName} on this date?\n\nThis will permanently delete the report.`,
      confirmText: 'Clear',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        try {
          const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
          const params = new URLSearchParams({ id: row.id! })
          const res = await fetch(`${API_BASE_URL}/v1/reports/audit-summary?${params.toString()}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
          if (res.ok) {
            setSelectedRow(null)
            fetchAudit()
          } else {
            const err = await res.json().catch(() => ({}))
            alert(err.error || err.message || `Clear failed (HTTP ${res.status})`)
          }
        } catch {
          alert('Failed to clear row data')
        }
      }
    })
  }


  const role = (user?.role || '').toLowerCase()
  const jobTitleLower = (user?.jobTitle || '').trim().toLowerCase()
  const isSalesCoordinator = role === 'employee' && (
    jobTitleLower === 'sales coordinator'
    || jobTitleLower === 'coordinator'
    || jobTitleLower.includes('coor')
  )
  const isManager = role === 'manager' || isSalesCoordinator || role === 'oic'
  const isAdmin = isPortalAdmin(role)
  const canSubmitForm = role === 'manager' || role === 'staff' || isPortalAdmin(role) || role === 'employee' || role === 'oic'

  const showEditButton = useMemo(() => {
    if (!selectedRow) return false
    if (isAdmin) {
      if (!globalBranchId) return false

      const resolvedGlobal = resolveScopedBranchId(globalBranchId)
      const resolvedRow = resolveScopedBranchId(selectedRow.branchId)
      const isTaguigGlobal = resolvedGlobal.toUpperCase().includes('TAGUIG')
      const isTaguigRow = resolvedRow.toUpperCase().includes('TAGUIG')

      if (isTaguigGlobal && isTaguigRow) {
        const lowerGlobal = globalBranchId.toLowerCase()
        if (lowerGlobal.endsWith('-sales') || lowerGlobal.endsWith('-sales-sales') || lowerGlobal === 'br-taguig-sales') {
          const line = selectedRow.auditLine || ''
          return line === '' || line === 'TAGUIG_SALES'
        }
        if (lowerGlobal.endsWith('-services') || lowerGlobal.endsWith('-services-services') || lowerGlobal === 'br-taguig-services') {
          return selectedRow.auditLine === 'TAGUIG_SERVICE'
        }
      }

      return isSameBaseBranch(selectedRow.branchId, globalBranchId)
    }

    // Managers/coordinators/OIC, or any employee during the May DTR correction window
    const mayEmployeeEdit = isDtrMayEditOpenForView(viewMode, date, rangeFrom, rangeTo)
      && isEmployeePortalRole(role)
    if (!isManager && !mayEmployeeEdit) return false
    if (!user?.branchId) return false

    // A non-admin user can only edit their own branch DTR
    if (!isSameBaseBranch(user.branchId, selectedRow.branchId)) return false

    // For Taguig, match the sub-branch/audit line
    const resolvedRow = resolveScopedBranchId(selectedRow.branchId)
    const isTaguigRow = resolvedRow.toUpperCase().includes('TAGUIG')
    if (isTaguigRow) {
      const emailLower = (user.email || '').toLowerCase()
      const titleLower = (user.jobTitle || '').toLowerCase()
      const resolvedUserBranch = resolveScopedBranchId(user.branchId).toLowerCase()
      const isServiceUser = resolvedUserBranch.includes('service') || emailLower.includes('service') || titleLower.includes('service')
      const isServiceRow = selectedRow.auditLine === 'TAGUIG_SERVICE'
      return isServiceUser === isServiceRow
    }

    return true
  }, [selectedRow, isAdmin, isManager, globalBranchId, user, viewMode, date, rangeFrom, rangeTo, role])



  const fetchAudit = useCallback(async () => {
    if (viewMode === 'range' && (!rangeFrom || !rangeTo)) return
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      let url = `${API_BASE_URL}/v1/reports/audit-summary`
      if (viewMode === 'single') url += `?date=${date}`
      else url = `${API_BASE_URL}/v1/reports/audit-summary-range?from=${rangeFrom}&to=${rangeTo}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setRows(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [viewMode, date, rangeFrom, rangeTo])

  useEffect(() => { fetchAudit() }, [fetchAudit])



  const fetchRowExpenses = async (row: AuditRow) => {
    setRowExpensesLoading(true)
    const branchName = (row.logicalBranchName ?? row.branchName).trim()
    const dObj = viewMode === 'single' ? new Date(date + 'T00:00:00') : new Date(rangeFrom + 'T00:00:00')
    const isoFormat = dObj.toISOString().split('T')[0]
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      let items = []
      let receivedBy = ''
      let createdAt = null
      let updatedAt = null
      let updatedBy = null
      if (row.id) {
        const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/${row.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          items = data.items || []
          receivedBy = data.receivedBy || ''
          createdAt = data.createdAt || null
          updatedAt = data.updatedAt || null
          updatedBy = data.updatedBy || null
        }
      } else {
        const params = new URLSearchParams({
          branchId: row.branchId,
          branchName,
          date: isoFormat,
        })
        if (row.auditLine) params.set('auditLine', row.auditLine)
        const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/items?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          items = await res.json()
        }
      }
      setRowExpenses({ items, receivedBy, createdAt, updatedAt, updatedBy })
    } catch {
      setRowExpenses({ items: [], receivedBy: '', createdAt: null, updatedAt: null, updatedBy: null })
    } finally {
      setRowExpensesLoading(false)
    }
  }

  // const toggleHideBranch = (branchName: string) => {
  //   setHiddenBranches(prev => prev.includes(branchName) ? prev.filter(b => b !== branchName) : [...prev, branchName])
  // }

  const canViewPerformanceRow = (_row: AuditRow) => true

  let visibleRows = rows.filter(r => !hiddenBranches.includes(r.branchName) && canViewPerformanceRow(r))



  if (sortConfig !== null) {
    const keyMap: Record<string, keyof AuditRow | string> = {
      branch: 'branchName', time: 'timeUploaded', status: 'status', grossSales: 'grossSales', netSales: 'netSales',
      target: 'targetDailyQuota', difference: 'difference', remarks: 'remarks',
      coh: 'cohPreviousDay', fundHo: 'fundFromHo', cashReturns: 'cashReturns',
      totalCohCfd: 'totalCohCfd', cashColl: 'totalCashCollection', onlineColl: 'totalOnlineCollection',
      totalExp: 'totalExpenses', totalPurch: 'totalForPurchase', scheduled: 'totalUnitsScheduled', surveyOnly: 'totalUnitsSurveyOnly', units: 'totalUnitsInstalledServiced', serviced: 'totalUnitsServiced', cancelled: 'totalCancelled',
      freeInstall: 'totalUnitsFreeInstall', forColl: 'forCollection', rebates: 'rebatesForCollection',
    }
    visibleRows.sort((a, b) => {
      const k = keyMap[sortConfig.key] || sortConfig.key as keyof AuditRow
      if (sortConfig.key === 'remarks') {
        const rank = (row: AuditRow) => {
          if (row.remarks === 'ABOVE QUOTA' || row.difference > 0) return 3
          if (row.remarks === 'PENDING') return 2
          if (isNoTransactionRemarks(row.remarks) || row.status === 'NO RECORD' || row.status === 'NO REPORT') return 0
          return 1
        }
        const ar = rank(a), br = rank(b)
        if (ar !== br) return sortConfig.direction === 'desc' ? br - ar : ar - br
        if (a.difference !== b.difference) {
          return sortConfig.direction === 'desc' ? b.difference - a.difference : a.difference - b.difference
        }
        return a.branchName.localeCompare(b.branchName)
      }
      const av = k === 'netSales' ? computeNetSales(a) : (a as any)[k]
      const bv = k === 'netSales' ? computeNetSales(b) : (b as any)[k]
      if (av === bv) return 0
      if (av == null) return 1; if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string')
        return sortConfig.direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortConfig.direction === 'asc' ? (av < bv ? -1 : 1) : (av < bv ? 1 : -1)
    })
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc'
    setSortConfig({ key, direction })
  }

  const totals = visibleRows.reduce((acc, r) => ({
    grossSales:           acc.grossSales + r.grossSales,
    netSales:             acc.netSales + computeNetSales(r),
    targetDailyQuota:     acc.targetDailyQuota + r.targetDailyQuota,
    totalCohCfd:          acc.totalCohCfd + r.totalCohCfd,
    totalCashCollection:  acc.totalCashCollection + r.totalCashCollection,
    totalOnlineCollection:acc.totalOnlineCollection + r.totalOnlineCollection,
    totalExpenses:        acc.totalExpenses + r.totalExpenses,
    totalForPurchase:     acc.totalForPurchase + (r.totalForPurchase || 0),
    forCollection:        acc.forCollection + r.forCollection,
    rebatesForCollection: acc.rebatesForCollection + r.rebatesForCollection,
  }), { grossSales:0, netSales:0, targetDailyQuota:0, totalCohCfd:0, totalCashCollection:0, totalOnlineCollection:0, totalExpenses:0, totalForPurchase:0, forCollection:0, rebatesForCollection:0 })





  const mobileSortOptions = [
    { key: 'remarks', label: 'Remarks' },
    { key: 'difference', label: 'Difference' },
    { key: 'grossSales', label: 'Gross Sales' },
    { key: 'netSales', label: 'Net Sales' },
  ]



  const mobileDateLabel = viewMode === 'single'
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
    : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`

  const weeklyDayTabs = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const toKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - (6 - i))
      const key = toKey(d)
      const isToday = i === 6
      const dayName = isToday ? 'Today' : d.toLocaleDateString('en-PH', { weekday: 'short' })
      const dateLabel = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      return { key, dayName, dateLabel }
    })
  }, [])

  const isCustomAuditDate = viewMode === 'single' && date !== '' && !weeklyDayTabs.some(t => t.key === date)

  // Ground Arctic in the active Daily Transaction date, KPI totals, and branch breakdown table
  useEffect(() => {
    const branchName = formatBranchName(globalBranchId || user?.branchId || 'All Branches')
    setPageContext(`Page: Daily Transaction | Branch: ${branchName} | Date: ${mobileDateLabel}`)

    if (activeTab === 'submit') {
      setDataContext(`Daily Transaction — Submit DTR Form view for ${branchName} (${mobileDateLabel})`)
      return
    }

    if (loading) {
      setDataContext(`Daily Transaction (${mobileDateLabel}): Loading report data…`)
      return
    }

    if (visibleRows.length === 0) {
      setDataContext(`Daily Transaction (${mobileDateLabel}): No transaction records found for this date.`)
      return
    }

    const summaryText = [
      `Daily Transaction Summary (${mobileDateLabel} | ${branchName}):`,
      `Totals: Gross Sales: ₱${peso(totals.grossSales)} | Net Sales: ₱${peso(totals.netSales)} | Cash Collected: ₱${peso(totals.totalCashCollection)} | Online Collected: ₱${peso(totals.totalOnlineCollection)} | Total Expenses: ₱${peso(totals.totalExpenses)} | Total Purchases: ₱${peso(totals.totalForPurchase)} | For Collection: ₱${peso(totals.forCollection)}`,
      `\nBranch Breakdown (${visibleRows.length} branches):`,
      ...visibleRows.map(r => {
        const net = computeNetSales(r)
        return `- ${r.branchName}: Gross Sales: ₱${peso(r.grossSales)}, Net Sales: ₱${peso(net)}, Cash: ₱${peso(r.totalCashCollection)}, Online: ₱${peso(r.totalOnlineCollection)}, Expenses: ₱${peso(r.totalExpenses)}, Target: ₱${peso(r.targetDailyQuota)}, Diff: ₱${peso(r.difference)}, Remarks: ${r.remarks || r.status}`
      })
    ].join('\n')

    setDataContext(summaryText)

    return () => setDataContext(null)
  }, [activeTab, mobileDateLabel, globalBranchId, user?.branchId, loading, visibleRows, totals, setDataContext, setPageContext])

  return (
    <div className="flex flex-col gap-4 pb-8 md:pb-8">



      {/* ── Submit Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'submit' && (
        <DTR_Form onSwitchToSummary={() => {
          const params = new URLSearchParams(location.search)
          params.delete('tab')
          params.delete('id')
          params.delete('branchId')
          params.delete('date')
          params.delete('auditLine')
          navigate(`/audit-report${params.toString() ? `?${params.toString()}` : ''}`, { replace: true })
          fetchAudit()
        }} />
      )}

      {/* ── Summary Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'summary' && <>

      {/* ── Mobile header "Command Card" ─────────────────────────────────────── */}
      <div className="md:hidden bg-white dark:bg-[#0A1120] rounded-b-2xl border-b shadow-sm p-4 flex flex-col gap-4 no-print" style={{ borderColor: border }}>

        {/* Row 1: Title & Actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold uppercase tracking-wider" style={{ color: textPrimary }}>
              DAILY TRANSACTION SUMMARY
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>{mobileDateLabel}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative shrink-0">
              <button type="button" onClick={() => setMobileMenuOpen(o => !o)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors focus:outline-none"
                style={{ borderColor: inputBorder, color: textMuted }}>
                <MoreVertical className="w-4 h-4" />
              </button>
              {mobileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-50 w-40 rounded-lg overflow-hidden"
                    style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                    <div className="py-1">
                      {canSubmitForm && (
                        <button type="button" onClick={() => { setActiveTab('submit'); setMobileMenuOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold" style={{ color: textPrimary }}>
                          <FileEdit className="w-3.5 h-3.5 text-emerald-500" /> Submit Daily Report
                        </button>
                      )}

                    {hiddenBranches.length > 0 && (
                      <button type="button" onClick={() => { setHiddenBranches([]); setMobileMenuOpen(false) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium" style={{ color: textPrimary }}>
                        <Eye className="w-3.5 h-3.5" style={{ color: textMuted }} /> Show hidden ({hiddenBranches.length})
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        </div>

        {/* Row 2: View & Dates */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg text-xs font-medium overflow-hidden shrink-0"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
            {(['single', 'range'] as const).map(m => (
              <button key={m} type="button" onClick={() => setViewMode(m)} className="px-3 py-1.5"
                style={{ backgroundColor: viewMode === m ? '#047857' : 'transparent', color: viewMode === m ? '#fff' : textMuted }}>
                {m === 'single' ? 'Daily' : 'Range'}
              </button>
            ))}
          </div>
          {viewMode === 'single' ? (
            <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar py-0.5">
              {weeklyDayTabs.map(tab => {
                const isActive = date === tab.key
                return (
                  <button key={tab.key} type="button"
                    onClick={() => setDate(tab.key)}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold border whitespace-nowrap shrink-0 transition-colors"
                    style={{
                      backgroundColor: isActive ? '#047857' : 'transparent',
                      borderColor: isActive ? '#047857' : inputBorder,
                      color: isActive ? '#ffffff' : textMuted,
                    }}
                  >
                    {tab.dayName} {tab.dateLabel}
                  </button>
                )
              })}

              {isCustomAuditDate && (
                <button type="button"
                  onClick={() => openDatePicker(mobileDateRef.current)}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold border whitespace-nowrap shrink-0"
                  style={{ backgroundColor: '#047857', borderColor: '#047857', color: '#ffffff' }}
                >
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </button>
              )}

              <button type="button"
                onClick={() => openDatePicker(mobileDateRef.current)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border whitespace-nowrap shrink-0"
                style={{ borderColor: inputBorder, color: textMuted }}
                title="Pick a custom date"
              >
                <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                Custom
              </button>

              <input ref={mobileDateRef} type="date" value={date} onChange={e => setDate(e.target.value)}
                tabIndex={-1}
                className="date-input-no-indicator absolute opacity-0 pointer-events-none w-0 h-0" aria-label="Audit date" />
            </div>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                className="date-input-no-indicator px-2 py-1.5 rounded-lg text-xs flex-1 min-w-0 cursor-pointer" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                className="date-input-no-indicator px-2 py-1.5 rounded-lg text-xs flex-1 min-w-0 cursor-pointer" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
            </div>
          )}
        </div>

        {/* Row 3: Mobile KPIs — horizontally scrolling, accent-colored borders */}
        {!loading && rows.length > 0 && (
          <div className="flex overflow-x-auto gap-2 no-scrollbar pb-1">
            {[
              { label: 'Gross',     value: `₱${peso(totals.grossSales)}`,           color: isLight ? '#047857' : '#34D399' },
              { label: 'Net',       value: `₱${peso(totals.netSales)}`,             color: totals.netSales >= 0 ? (isLight ? '#047857' : '#34D399') : (isLight ? '#DC2626' : '#F87171') },
              { label: 'Cash',      value: `₱${peso(totals.totalCashCollection)}`,  color: isLight ? '#047857' : '#34D399' },
              { label: 'Online',    value: `₱${peso(totals.totalOnlineCollection)}`,color: isLight ? '#047857' : '#34D399' },
              { label: 'Expenses',  value: `₱${peso(totals.totalExpenses)}`,        color: isLight ? '#DC2626' : '#F87171' },
              { label: 'Purchases', value: `₱${peso(totals.totalForPurchase)}`,     color: textPrimary },
              { label: 'For Coll.', value: `₱${peso(totals.forCollection)}`,        color: textPrimary },
              { label: 'Rebates',   value: `₱${peso(totals.rebatesForCollection)}`, color: isLight ? '#047857' : '#34D399' },
            ].map(k => (
              <div key={k.label} className="min-w-[110px] p-3 border rounded-xl shrink-0 flex flex-col gap-1 bg-white dark:bg-[#0A1120]" style={{ borderColor: border }}>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{k.label}</span>
                <span className="text-base font-extrabold tabular-nums" style={{ color: k.color }}>{k.value}</span>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ── Desktop unified command bar ──────────────────────────────────────── */}
      <div className="hidden md:flex w-full px-4 py-3 border-b flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#0A1120] no-print"
        style={{ borderColor: border }}>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {canSubmitForm && (
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white shadow-md transition-colors hover:opacity-90 focus:outline-none bg-[#047857]"
            >
              <FileEdit className="w-4 h-4" /> Submit Daily Report
            </button>
          )}
          {hiddenBranches.length > 0 && (
            <button type="button" onClick={() => setHiddenBranches([])}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border transition-colors hover:opacity-90"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#EF4444' }}>
              <Eye className="w-4 h-4" />Show {hiddenBranches.length} Hidden
            </button>
          )}
        </div>

        {/* Daily/Range toggle + date ribbon — one scrolling track so nothing wraps */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {/* View mode toggle */}
          <div id="audit-view-toggle" className="flex items-center rounded-lg text-sm font-semibold overflow-hidden shrink-0"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
            {(['single','range'] as const).map(m => (
              <button key={m} type="button" onClick={() => setViewMode(m)} className="px-4 py-2 transition-colors"
                style={{ backgroundColor: viewMode===m ? '#047857' : 'transparent', color: viewMode===m ? '#fff' : textMuted }}>
                {m === 'single' ? 'Daily' : 'Range'}
              </button>
            ))}
          </div>

          {/* Date picker(s) - desktop */}
          {viewMode === 'single' ? (
            <div className="flex items-center gap-1 shrink-0">
              {weeklyDayTabs.map(tab => {
                const isActive = date === tab.key
                return (
                  <button key={tab.key} type="button"
                    onClick={() => setDate(tab.key)}
                    className="px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 transition-colors"
                    style={{
                      backgroundColor: isActive ? '#047857' : 'transparent',
                      borderColor: isActive ? '#047857' : inputBorder,
                      color: isActive ? '#ffffff' : textMuted,
                    }}
                  >
                    {tab.dayName} {tab.dateLabel}
                  </button>
                )
              })}

              {isCustomAuditDate && (
                <button type="button"
                  onClick={(e) => openCustomDatePicker('single', e)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0"
                  style={{ backgroundColor: '#047857', borderColor: '#047857', color: '#ffffff' }}
                >
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </button>
              )}

              <button type="button"
                onClick={(e) => openCustomDatePicker('single', e)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 transition-colors"
                style={{ borderColor: datePickerState.isOpen && datePickerState.target === 'single' ? '#10B981' : inputBorder, color: textMuted }}
                title="Pick a custom date"
              >
                <CalendarDays className="w-4 h-4" style={{ color: '#10B981' }} />
                Custom Date
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              {([
                { target: 'rangeFrom' as const, val: rangeFrom, label: 'Audit range from date' },
                { target: 'rangeTo' as const, val: rangeTo, label: 'Audit range to date' },
              ]).map((p) => (
                <button
                  key={p.target}
                  type="button"
                  onClick={(e) => openCustomDatePicker(p.target, e)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${datePickerState.isOpen && datePickerState.target === p.target ? '#10B981' : inputBorder}`,
                  }}
                  aria-label={p.label}
                >
                  <CalendarDays className="w-4 h-4" style={{ color: '#10B981' }} />
                  <span className="text-sm font-semibold select-none" style={{ color: textPrimary }}>
                    {formatDateTriggerLabel(p.val)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── SaaS Calendar Popover — portal, replaces native <input type="date"> ── */}
        {datePickerState.isOpen && datePickerState.pos && ReactDOM.createPortal(
          <div
            ref={datePickerPopRef}
            className="fixed z-[99999] rounded-2xl border shadow-2xl p-4 bg-white dark:bg-[#0a1120]"
            style={{
              top: datePickerState.pos.top,
              left: datePickerState.pos.left,
              width: 280,
              borderColor: isLight ? '#cbd5e1' : '#334155',
            }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {/* Header — month navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setDatePickerState(prev => {
                  const m = prev.calMonth - 1
                  return m < 0 ? { ...prev, calMonth: 11, calYear: prev.calYear - 1 } : { ...prev, calMonth: m }
                })}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors hover:bg-slate-500/10"
                style={{ color: textMuted }}
              >
                {'<'}
              </button>
              <span className="text-sm font-bold" style={{ color: textPrimary }}>
                {new Date(datePickerState.calYear, datePickerState.calMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={() => setDatePickerState(prev => {
                  const m = prev.calMonth + 1
                  return m > 11 ? { ...prev, calMonth: 0, calYear: prev.calYear + 1 } : { ...prev, calMonth: m }
                })}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors hover:bg-slate-500/10"
                style={{ color: textMuted }}
              >
                {'>'}
              </button>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <span key={d} className="text-[10px] font-bold text-center uppercase" style={{ color: textMuted }}>{d}</span>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const firstOfMonth = new Date(datePickerState.calYear, datePickerState.calMonth, 1)
                const offset = firstOfMonth.getDay()
                const daysInMonth = new Date(datePickerState.calYear, datePickerState.calMonth + 1, 0).getDate()
                const todayKey = todayLocalKey()
                const selectedKey = datePickerState.target === 'single' ? date
                  : datePickerState.target === 'rangeFrom' ? rangeFrom
                  : rangeTo
                const cells: React.ReactNode[] = []
                for (let i = 0; i < offset; i++) cells.push(<span key={`empty-${i}`} />)
                for (let day = 1; day <= daysInMonth; day++) {
                  const key = toDateKey(datePickerState.calYear, datePickerState.calMonth, day)
                  const isSelected = key === selectedKey
                  const isToday = key === todayKey
                  cells.push(
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCalendarDayClick(day)}
                      className="h-8 rounded-lg text-xs font-bold transition-all relative"
                      style={{
                        color: isSelected ? '#ffffff' : isToday ? (isLight ? '#047857' : '#34D399') : textPrimary,
                        backgroundColor: isSelected ? '#047857' : 'transparent',
                      }}
                    >
                      {day}
                      {isToday && !isSelected && (
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-0.5 w-1 h-1 rounded-full" style={{ backgroundColor: isLight ? '#047857' : '#34D399' }} />
                      )}
                    </button>
                  )
                }
                return cells
              })()}
            </div>
          </div>,
          document.body,
        )}
      </div>

      {/* ── Print area enclosing KPI Counters and Table ─────────────────────────── */}
      <div className="print-area flex flex-col gap-5">

      {/* ── Prominent KPI strip (desktop) — bigger, icon-free, clean ── */}
      {!loading && rows.length > 0 && (
        <div className="hidden md:grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 px-4 py-3 border-b" style={{ borderColor: border }}>
          {[
            { label: 'Gross Sales',      value: peso(totals.grossSales),           color: isLight ? '#047857' : '#34D399' },
            { label: 'Net Sales',        value: peso(totals.netSales),             color: totals.netSales >= 0 ? (isLight ? '#047857' : '#34D399') : (isLight ? '#DC2626' : '#F87171') },
            { label: 'Cash Collected',   value: peso(totals.totalCashCollection),  color: isLight ? '#047857' : '#34D399' },
            { label: 'Online Collected', value: peso(totals.totalOnlineCollection),color: isLight ? '#047857' : '#34D399' },
            { label: 'Total Expenses',   value: peso(totals.totalExpenses),        color: isLight ? '#DC2626' : '#F87171' },
            { label: 'Total Purchases',  value: peso(totals.totalForPurchase),     color: textPrimary },
            { label: 'For Collection',   value: peso(totals.forCollection),        color: textPrimary },
            { label: 'Rebates',          value: peso(totals.rebatesForCollection), color: isLight ? '#047857' : '#34D399' },
          ].map((k, i) => (
            <div key={i}
              className="flex flex-col p-3.5 rounded-xl border bg-white dark:bg-[#0A1120] shadow-sm transition-all hover:border-emerald-500/40"
              style={{ borderColor: border }}>
              <span className="text-[11px] font-bold uppercase tracking-wider truncate mb-1" style={{ color: textMuted }}>{k.label}</span>
              <strong className="text-base font-extrabold tabular-nums truncate" style={{ color: k.color }}>₱{k.value}</strong>
            </div>
          ))}
        </div>
      )}



      {/* ── Above Quota Spotlight ─────────────────────────────────────── */}
      {!loading && rows.length > 0 && (() => {
        const aboveQuotaBranches = rows.filter(r =>
          r.remarks === 'ABOVE QUOTA' && r.status !== 'NO RECORD' && r.status !== 'NO REPORT'
        ).sort((a, b) => b.difference - a.difference)
        if (aboveQuotaBranches.length === 0) return null
        return (
          <div className="flex items-center gap-2.5 flex-wrap px-4 py-2.5 rounded-xl border no-print hidden md:flex"
            style={{ backgroundColor: cardBg, borderColor: border }}>
            <span className="font-semibold uppercase tracking-wider text-[11px]" style={{ color: isLight ? '#047857' : '#34D399' }}>Above Quota:</span>
            <div className="flex flex-wrap gap-2">
              {aboveQuotaBranches.map((branch) => (
                <div key={branch.branchName} className="flex items-center gap-2 px-3 py-1 rounded-full border text-xs"
                  style={{ backgroundColor: inputBg, borderColor: border }}>
                  <span className="font-semibold" style={{ color: textPrimary }}>{formatBranchName(branch.branchName)}</span>
                  <span className="font-semibold text-[11px]" style={{ color: isLight ? '#047857' : '#34D399' }}>+₱{peso(branch.difference)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Audit Table (desktop) — borderless, no outer card wrapper ───────── */}
      <div className="hidden md:flex flex-col">

        {/* Transparent title row — no longer a bordered "toolbar" box */}
        <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
          <h3 className="font-extrabold text-sm uppercase tracking-wider" style={{ color: textPrimary }}>
            DAILY TRANSACTION SUMMARY —{' '}
            {viewMode === 'single'
              ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
          </h3>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />)}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              {viewMode === 'range'
                ? `No reports found for ${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} (or all are hidden)`
                : 'No reports found for this date (or all are hidden)'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto rounded-lg" style={{ maxHeight: 'calc(100vh - 210px)' }}>
              <table
                style={{ minWidth: '1500px', fontSize: compactView ? '11px' : '13px', width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}
              >
                {/* ── Table Head ── */}
                <thead>
                  <tr>
                    {/* BRANCH header */}
                    <th
                      key="branch"
                      onClick={() => handleSort('branch')}
                      className="text-left cursor-pointer select-none whitespace-nowrap sticky left-0"
                      style={{
                        padding: compactView ? '8px 12px' : '10px 16px',
                        fontSize: compactView ? 10 : 11,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: '#ffffff',
                        backgroundColor: isLight ? '#065f46' : '#052e16',
                        borderBottom: `1px solid ${isLight ? '#047857' : '#064e3b'}`,
                        borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}`,
                        position: 'sticky',
                        top: 0,
                        left: 0,
                        zIndex: 30,
                      }}
                    >
                      <div className="flex items-center gap-0.5">
                        Branch
                        {sortConfig?.key === 'branch' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 ml-0.5" /> : <ArrowDown className="w-3 h-3 ml-0.5" />) : null}
                      </div>
                    </th>

                    {/* All remaining headers — unified neutral header */}
                    {([
                      { key: 'grossSales',  label: 'Gross Sales',     short: 'Sales',      align: 'center' },
                      { key: 'netSales',    label: 'Net Sales',        short: 'Net',        align: 'center' },
                      { key: 'difference',  label: 'Diff / Remarks',   short: 'Diff/Rem.',  align: 'center' },
                      { key: 'target',      label: 'Target',           short: 'Quota',      align: 'center' },
                      { key: 'totalCohCfd', label: 'COH / CFD',        short: 'CFD',        align: 'center' },
                      { key: 'cashColl',    label: 'Cash',             short: 'Cash',       align: 'center' },
                      { key: 'onlineColl',  label: 'Online / Bank',    short: 'Online',     align: 'center' },
                      { key: 'totalExp',    label: 'Expenses',         short: 'Exp.',       align: 'center' },
                      { key: 'forColl',     label: 'For Collection',   short: 'F.Coll.',    align: 'center' },
                      { key: 'rebates',     label: 'Rebates',          short: 'Reb.',       align: 'center' },
                    ] as { key: string; label: string; short: string; align: 'left' | 'right' | 'center' }[]).map(col => (
                      <th key={col.key} onClick={() => handleSort(col.key)}
                        className={`text-${col.align} cursor-pointer select-none whitespace-nowrap`}
                        style={{
                          padding: compactView ? '8px 10px' : '10px 14px',
                          fontSize: compactView ? 10 : 11,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          color: '#ffffff',
                          backgroundColor: isLight ? '#065f46' : '#052e16',
                          borderBottom: `1px solid ${isLight ? '#047857' : '#064e3b'}`,
                          borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}`,
                          position: 'sticky',
                          top: 0,
                          zIndex: 20,
                        }}
                      >
                        <div className={`flex items-center justify-${col.align === 'right' ? 'end' : col.align === 'center' ? 'center' : 'start'} gap-0.5`}>
                          {compactView ? col.short : col.label}
                          {sortConfig?.key === col.key ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : null}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

              {/* ── Table Body ── */}
              <tbody>
                {visibleRows.map((row, idx) => {

                  const isAbove    = row.remarks === 'ABOVE QUOTA'
                  const isPending  = row.remarks === 'PENDING'
                  const noRecord   = row.status === 'NO RECORD' || row.status === 'NO REPORT' || row.status === 'NO SCHED'
                  const noTransaction = isNoTransactionRemarks(row.remarks) || noRecord
                  const p          = compactView ? '6px 10px' : '9px 14px'
                  const isSelected = selectedRow && `${selectedRow.branchId}:${selectedRow.auditLine || ''}` === `${row.branchId}:${row.auditLine || ''}`
                  const isEven     = idx % 2 === 0

                  // Row background based on status
                  const rowBg = isSelected
                    ? (isLight ? '#dbeafe' : '#1e3a5f')
                    : isEven
                      ? (isLight ? '#f8faff' : '#070e1c')
                      : (isLight ? '#ffffff' : '#0A1120')

                  const colBorder = `1px solid ${isLight ? '#cbd5e1' : '#243452'}`

                  return (
                    <tr
                      key={idx}
                      id={`audit-row-${idx}`}
                      onClick={() => {
                        setSelectedRow(row)
                        setRowExpenses(null)
                        fetchRowExpenses(row)
                      }}
                      onContextMenu={e => {
                        e.preventDefault()
                        setSelectedRow(row)
                        setRowExpenses(null)
                        fetchRowExpenses(row)
                      }}
                      style={{
                        backgroundColor: rowBg,
                        cursor: 'pointer',
                        transition: 'background-color 0.12s ease',
                      }}
                      className="group hover:brightness-95 dark:hover:brightness-110"
                    >
                      {/* Branch */}
                      <td className="font-semibold sticky left-0"
                        style={{
                          color: textPrimary,
                          backgroundColor: isSelected
                            ? (isLight ? '#eff6ff' : '#172554')
                            : isEven ? (isLight ? '#f8fafc' : '#070e1c') : (isLight ? '#ffffff' : '#0A1120'),
                          padding: p,
                          whiteSpace: 'nowrap',
                          borderRight: colBorder,
                          borderBottom: colBorder,
                          transition: 'background-color 0.12s ease',
                        }}>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span style={{ color: isLight ? '#94a3b8' : '#64748b', fontSize: compactView ? 9 : 11, fontWeight: 600, minWidth: '16px' }}>{idx + 1}.</span>
                              <span className="font-bold" style={{ fontSize: compactView ? 12 : 13, color: textPrimary }}>{formatBranchName(row.branchName)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5" style={{ fontSize: compactView ? '9px' : '11px' }}>
                              <span style={{
                                display: 'inline-block',
                                width: '5px',
                                height: '5px',
                                borderRadius: '50%',
                                backgroundColor: isPending ? '#f59e0b' : noRecord ? '#ef4444' : '#10b981'
                              }} />
                              <span style={{ color: noTransaction && !isPending ? '#ef4444' : isPending ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                                {isPending ? 'Pending' : noTransaction ? (compactView ? 'No Trans' : 'No Transaction') : 'Checked'}
                              </span>
                              {!noRecord && (row.createdAt || row.timeUploaded) && (
                                <span style={{ color: isLight ? '#94a3b8' : '#64748b', fontWeight: 400 }}>• {formatLocalTime(row.createdAt, row.timeUploaded)}</span>
                              )}
                            </div>
                          </div>
                      </td>

                      {/* Gross Sales — positive, emerald */}
                      <td className="text-center tabular-nums font-semibold" style={{ color: isLight ? '#059669' : '#34d399', padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                        {peso(row.grossSales)}
                      </td>

                      {/* Net Sales — green if positive, red if negative */}
                      {(() => {
                        const netVal = computeNetSales(row)
                        const netColor = netVal >= 0
                          ? (isLight ? '#059669' : '#34d399')
                          : (isLight ? '#dc2626' : '#f87171')
                        return (
                          <td className="text-center tabular-nums font-semibold" style={{ color: netColor, padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                            {peso(netVal)}
                          </td>
                        )
                      })()}

                      {/* Difference & Remarks */}
                      <td style={{ padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span style={{
                            display: 'inline-block',
                            padding: compactView ? '1px 5px' : '2px 7px',
                            borderRadius: 4,
                            fontSize: compactView ? 9 : 11,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            ...remarksBadgeStyle(row.remarks, noRecord, isAbove, isLight),
                          }}>
                            {formatRemarksLabel(row.remarks, compactView)}
                          </span>
                          {!noRecord && (
                            <span className="font-semibold text-xs tabular-nums" style={{ color: isAbove ? (isLight ? '#059669' : '#34d399') : (isLight ? '#dc2626' : '#f87171') }}>
                              {isAbove ? '+' : ''}{peso(row.difference)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Target Quota — primary text for readability */}
                      <td className="text-center tabular-nums font-medium" style={{ color: textPrimary, padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                        {peso(row.targetDailyQuota)}
                      </td>

                      {/* COH/CFD — neutral */}
                      <td className="text-center tabular-nums font-medium" style={{ color: textPrimary, padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                        {peso(row.totalCohCfd)}
                      </td>

                      {/* Cash Collection — positive */}
                      <td className="text-center tabular-nums font-semibold" style={{ color: isLight ? '#059669' : '#34d399', padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                        {peso(row.totalCashCollection)}
                      </td>

                      {/* Online Collection — positive */}
                      <td className="text-center tabular-nums font-semibold" style={{ color: isLight ? '#059669' : '#34d399', padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                        {peso(row.totalOnlineCollection)}
                      </td>

                      {/* Total Expenses — negative, rose */}
                      <td className="text-center tabular-nums font-semibold" style={{ padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                        <button
                          id={`expense-drilldown-${idx}`}
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedRow(row)
                            setRowExpenses(null)
                            fetchRowExpenses(row)
                          }}
                          className="hover:underline transition-opacity hover:opacity-75"
                          style={{ color: isLight ? '#dc2626' : '#f87171', fontWeight: 600 }}
                        >
                          {peso(row.totalExpenses)}
                        </button>
                      </td>

                      {/* For Collection — neutral */}
                      <td className="text-center tabular-nums font-medium" style={{ color: textPrimary, padding: p, whiteSpace: 'nowrap', borderRight: colBorder, borderBottom: colBorder }}>
                        {peso(row.forCollection)}
                      </td>

                      {/* Rebates — neutral */}
                      <td className="text-center tabular-nums font-medium" style={{ color: textPrimary, padding: p, whiteSpace: 'nowrap', borderBottom: colBorder }}>
                        {peso(row.rebatesForCollection)}
                      </td>

                    </tr>

                  )
                })}
              </tbody>

              {/* ── Totals Footer ── */}
              <tfoot>
                <tr style={{ backgroundColor: isLight ? '#065f46' : '#052e16' }}>
                  <td
                    className="sticky left-0 font-black uppercase tracking-widest whitespace-nowrap"
                    style={{
                      color: '#ffffff',
                      fontSize: compactView ? 10 : 11,
                      padding: compactView ? '8px 12px' : '11px 16px',
                      backgroundColor: isLight ? '#065f46' : '#052e16',
                      borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`,
                      borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}`,
                      letterSpacing: '0.1em',
                    }}
                  >
                    TOTALS
                  </td>
                  {/* Gross Sales */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: '#6ee7b7', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.grossSales)}
                  </td>
                  {/* Net Sales — dynamic color */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: totals.netSales >= 0 ? '#6ee7b7' : '#fca5a5', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.netSales)}
                  </td>
                  {/* Difference + Remarks */}
                  <td colSpan={1} style={{ borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }} />
                  {/* Target Quota */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: '#e2e8f0', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.targetDailyQuota)}
                  </td>
                  {/* CFD */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: '#ffffff', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.totalCohCfd)}
                  </td>
                  {/* Cash Collection */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: '#6ee7b7', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.totalCashCollection)}
                  </td>
                  {/* Online Collection */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: '#6ee7b7', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.totalOnlineCollection)}
                  </td>
                  {/* Total Expenses */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: '#fca5a5', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.totalExpenses)}
                  </td>
                  {/* For Collection */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: '#ffffff', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}`, borderRight: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.forCollection)}
                  </td>
                  {/* Rebates */}
                  <td className="text-center font-bold whitespace-nowrap tabular-nums" style={{ color: '#ffffff', fontSize: compactView ? 11 : 12, padding: compactView ? '8px 10px' : '11px 14px', borderTop: `1px solid ${isLight ? '#047857' : '#064e3b'}` }}>
                    {peso(totals.rebatesForCollection)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <div className="md:hidden no-print rounded-xl p-2 flex items-center gap-2"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <select
            value={sortConfig?.key || ''}
            onChange={e => {
              const key = e.target.value
              setSortConfig(key ? { key, direction: 'desc' } : null)
            }}
            className="flex-1 min-w-0 rounded-lg px-3 py-2 text-xs font-medium outline-none"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            aria-label="Filter performance list"
          >
            <option value="">All</option>
            {mobileSortOptions.map(option => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!sortConfig}
            onClick={() => setSortConfig(prev => prev ? { ...prev, direction: prev.direction === 'desc' ? 'asc' : 'desc' } : prev)}
            className="h-9 w-9 rounded-lg flex items-center justify-center disabled:opacity-40"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
            title={sortConfig?.direction === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortConfig?.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* ── Mobile branch DTR cards ──────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-3 px-3 pb-6 no-print">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }} />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-center justify-center py-16 gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold text-center px-6" style={{ color: textMuted }}>No reports for this date</p>
          </div>
        ) : (
          visibleRows.map((row, idx) => {

            const isAbove = row.remarks === 'ABOVE QUOTA'
            const isPending = row.remarks === 'PENDING'
            const noRecord = row.status === 'NO RECORD' || row.status === 'NO REPORT' || row.status === 'NO SCHED'
            const noTransaction = isNoTransactionRemarks(row.remarks) || noRecord
            const isExpanded = false
            const statusColor = isPending ? '#F59E0B' : noTransaction ? '#EF4444' : '#10B981'
            const diffColor = noRecord ? textMuted : isAbove ? '#10B981' : '#EF4444'

            return (
              <div key={idx} className="relative bg-white dark:bg-[#0A1120] rounded-xl border p-3 flex flex-col gap-2"
                style={{ borderColor: border }}>
                <button type="button" className="w-full text-left flex flex-col gap-2"
                  onClick={() => {
                    setSelectedRow(row)
                    setRowExpenses(null)
                    fetchRowExpenses(row)
                  }}>
                  {/* Card Row 1: index, branch name, chevron */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium tabular-nums shrink-0" style={{ color: textMuted }}>{idx + 1}</span>
                      <span className="text-sm font-semibold truncate" style={{ color: textPrimary }}>{formatBranchName(row.branchName)}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
                  </div>

                  {/* Card Row 2: status dot + status text + remarks badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="mobile-status-dot" style={{ backgroundColor: statusColor }} />
                    <span className="text-xs font-medium" style={{ color: statusColor }}>
                      {isPending ? 'Pending' : noTransaction ? 'No transaction' : 'Checked'}
                    </span>
                    {!noRecord && (row.createdAt || row.timeUploaded) && (
                      <span className="text-xs" style={{ color: textMuted }}>{formatLocalTime(row.createdAt, row.timeUploaded)}</span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      style={remarksBadgeStyle(row.remarks, noRecord, isAbove, isLight)}>
                      {formatRemarksLabel(row.remarks, false)}
                    </span>
                  </div>

                  {/* Card Row 3: Sales / Net / Quota / Diff */}
                  <div className="grid grid-cols-4 pt-2 mt-1 border-t" style={{ borderColor: border }}>
                    {[
                      { label: 'Sales', value: `₱${peso(row.grossSales)}`, color: '#3B82F6' },
                      { label: 'Net', value: `₱${peso(computeNetSales(row))}`, color: textPrimary },
                      { label: 'Quota', value: `₱${peso(row.targetDailyQuota)}`, color: textMuted },
                      { label: 'Diff', value: noRecord ? '—' : `${isAbove ? '+' : ''}₱${peso(row.difference)}`, color: diffColor },
                    ].map(m => (
                      <div key={m.label} className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[10px] font-medium truncate" style={{ color: textMuted }}>{m.label}</span>
                        <span className="text-xs font-bold tabular-nums truncate" style={{ color: m.color }}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4" style={{ borderTop: `1px solid ${border}` }}>
                    <div className="grid grid-cols-2 gap-2 pt-3">
                      {[
                        { label: 'Cash', field: 'totalCashCollection', val: row.totalCashCollection, color: '#10B981', money: true },
                        { label: 'Online', field: 'totalOnlineCollection', val: row.totalOnlineCollection, color: '#6366F1', money: true },
                        { label: 'Expenses', field: 'totalExpenses', val: row.totalExpenses, color: '#EF4444', money: true },
                        { label: 'Purchases', field: 'totalForPurchase', val: row.totalForPurchase, color: '#F59E0B', money: true },
                        { label: 'For coll.', field: 'forCollection', val: row.forCollection, color: '#F59E0B', money: true },
                        { label: 'COH prev', field: 'cohPreviousDay', val: row.cohPreviousDay, color: textPrimary, money: true },
                        { label: 'Total CFD', val: row.totalCohCfd, color: textPrimary, money: true, readOnly: true },
                        { label: 'Scheduled', field: 'totalUnitsScheduled', val: row.totalUnitsScheduled, color: textPrimary, int: true },
                        { label: 'Rescheduled', field: 'totalRescheduled', val: row.totalRescheduled, color: textPrimary, int: true },

                        { label: 'Survey Only', field: 'totalUnitsSurveyOnly', val: row.totalUnitsSurveyOnly, color: textPrimary, int: true },
                      ].map(item => (
                        <div key={item.label} className="rounded-lg px-3 py-2" style={{ backgroundColor: inputBg }}>
                          <span className="text-[10px] font-medium block mb-0.5" style={{ color: textMuted }}>{item.label}</span>
                          <span className="text-xs font-medium tabular-nums" style={{ color: item.color }}>
                            {item.money ? `₱${peso(item.val as number)}` : String(item.val ?? 0)}
                          </span>
                        </div>
                      ))}
                    </div>



                    <div className="flex items-center gap-2 mt-3">
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setSelectedRow(row); setRowExpenses(null); fetchRowExpenses(row) }}
                        className="flex-1 py-2 rounded-lg text-xs font-medium"
                        style={{ color: textPrimary, border: `1px solid ${inputBorder}` }}>
                        Details
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>


      {/* Printable footer */}
      <div className="hidden print:block text-center mt-6 pt-4 border-t text-[10px]" style={{ borderColor: border }}>
        <span>Printed on: {new Date().toLocaleString('en-PH')}</span>
      </div>

      </div> {/* Close print-area */}

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-area, .print-area * {
            visibility: visible !important;
          }
          .print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            background: white !important;
            color: black !important;
            max-height: none !important;
            overflow: visible !important;
          }
          .print-area table,
          .print-area tr,
          .print-area th,
          .print-area td,
          .print-area div,
          .print-area span,
          .print-area p,
          .print-area h3,
          .print-area strong {
            background: transparent !important;
            color: black !important;
            border-color: #cbd5e1 !important;
          }
          .print-area th {
            position: static !important;
          }
          .print-area .overflow-x-auto,
          .print-area .overflow-y-auto {
            max-height: none !important;
            overflow: visible !important;
          }
          .no-print,
          .print-hidden,
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      {/* ── Row Details Modal ───────────────────────────────────────── */}
      {selectedRow && ReactDOM.createPortal(
        <div
          className="fixed inset-0 left-0 md:left-[220px] lg:left-[240px] z-[9999] flex items-center justify-center p-2 sm:p-3 backdrop-blur-md safe-area-top safe-area-bottom"
          style={{ backgroundColor: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-6xl xl:max-w-7xl h-[96vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '96vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-start justify-between w-full sm:w-auto">
                <div>
                  <h4 className="font-black text-base" style={{ color: textPrimary }}>{formatBranchName(selectedRow.branchName)}</h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
                    <span className="text-[11px]" style={{ color: textMuted }}>
                      {viewMode === 'single'
                        ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                        : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="flex items-center gap-1.5 font-bold">
                      <span style={{
                        display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
                        backgroundColor: selectedRow.remarks === 'PENDING' ? '#F59E0B'
                          : (selectedRow.status === 'NO RECORD' || selectedRow.status === 'NO REPORT' || selectedRow.status === 'NO SCHED' ? '#EF4444' : '#10B981')
                      }} />
                      <span style={{ color: selectedRow.remarks === 'PENDING' ? '#F59E0B' : (selectedRow.status === 'NO RECORD' || selectedRow.status === 'NO REPORT' || selectedRow.status === 'NO SCHED' ? '#EF4444' : '#10B981') }}>
                        {selectedRow.remarks === 'PENDING' ? 'PENDING'
                          : isNoTransactionRemarks(selectedRow.remarks) || selectedRow.status === 'NO RECORD' || selectedRow.status === 'NO REPORT'
                            ? 'NO TRANSACTION' : selectedRow.status}
                      </span>
                    </span>
                    {rowExpenses?.createdAt ? (
                      <span style={{ color: textMuted }}>
                        Submitted: <span style={{ color: textPrimary, fontWeight: 600 }}>{formatDateTime(rowExpenses.createdAt)}</span>
                        {rowExpenses.receivedBy && <> by <span style={{ color: textPrimary, fontWeight: 600 }}><EmployeeNameLink nameOrId={formatDisplayUserLabel(rowExpenses.receivedBy)} /></span></>}
                      </span>
                    ) : (
                      <>
                        {selectedRow.timeUploaded && (
                          <span style={{ color: textMuted }}>Time: <span style={{ color: textPrimary, fontWeight: 600 }}>{selectedRow.timeUploaded}</span></span>
                        )}
                        {rowExpenses?.receivedBy && (
                          <span style={{ color: textMuted }}>Submitted by: <span style={{ color: textPrimary, fontWeight: 600 }}><EmployeeNameLink nameOrId={formatDisplayUserLabel(rowExpenses.receivedBy)} /></span></span>
                        )}
                      </>
                    )}
                    {rowExpenses?.updatedAt && rowExpenses.updatedAt !== rowExpenses.createdAt && (
                      <span style={{ color: '#F59E0B' }}>
                        Last Edited: <span style={{ fontWeight: 600 }}>{formatDateTime(rowExpenses.updatedAt)}</span>
                        {rowExpenses.updatedBy && <> by <span style={{ fontWeight: 600 }}><EmployeeNameLink nameOrId={formatDisplayUserLabel(rowExpenses.updatedBy)} /></span></>}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedRow(null)}
                  className="sm:hidden p-1.5 rounded-lg transition-colors hover:bg-slate-500/10" style={{ color: textMuted }} aria-label="Close details dialog">
                  <X size={22} />
                </button>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center justify-center gap-1.5 shadow-sm border-none disabled:opacity-50"
                >
                  {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Export PDF
                </button>

                {showEditButton && (
                  <a
                    href={selectedRow.id
                      ? `/audit-report?tab=submit&id=${selectedRow.id}`
                      : `/audit-report?tab=submit&branchId=${selectedRow.branchId}&date=${date}&auditLine=${selectedRow.auditLine || ''}`
                    }
                    className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5 shadow-sm border-none"
                  >
                    <FileEdit className="w-3.5 h-3.5" />
                    {selectedRow.id ? 'Edit Report' : 'Create Report'}
                  </a>
                )}

                <button
                  onClick={() => setSelectedRow(null)}
                  className="hidden sm:flex items-center justify-center p-2 rounded-xl transition-colors hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Close details dialog"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div id="dtr-report-modal-content" className="flex-1 overflow-y-auto">
              {(() => {
                const items = rowExpenses?.items || []
                
                // Cash Transactions
                const cashTxItems = items.filter(it => it.type === 'CASH_SALE' && !it.description?.startsWith('PARTS|') && !it.description?.startsWith('RETURN|'))
                // Cash Returns
                const cashRetItems = items.filter(it => it.type === 'CASH_SALE' && it.description?.startsWith('RETURN|'))
                // Online Transactions
                const onlineTxItems = items.filter(it => it.type === 'ONLINE_SALE' && !it.description?.startsWith('CHECK|'))
                // Check Remits
                const checkItems = items.filter(it => it.type === 'ONLINE_SALE' && it.description?.startsWith('CHECK|'))
                // Parts Sales
                const partsSaleItems = items.filter(it => it.type === 'CASH_SALE' && it.description?.startsWith('PARTS|'))
                // Expenses
                const expenseItems = items.filter(it => it.type === 'EXPENSE')
                // Purchases (non-orders)
                const purchaseItems = items.filter(it => it.type === 'PURCHASE' && !it.description?.startsWith('ORDER|'))
                // Orders
                const orderItems = items.filter(it => it.type === 'PURCHASE' && it.description?.startsWith('ORDER|'))
                // Rebates
                const rebateItems = items.filter(it => it.type === 'REBATE')
                // Collections Breakdown
                const forCollItems = items.filter(it => it.type === 'COLLECTION')
                // Incentives Breakdown
                const incentiveItems = items.filter(it => it.type === 'INCENTIVE')
                const totalIncentives = incentiveItems.reduce((sum, it) => sum + (it.amount || 0), 0)
                // Commission Expenses Breakdown
                const commissionItems = items.filter(it => it.type === 'COMMISSION')
                const paidCommissionItems = commissionItems.filter(it => it.collectionResolved)
                const totalPaidCommissionExpenses = paidCommissionItems.reduce((sum, it) => sum + (it.amount || 0), 0)
                // Cash Advance Breakdown
                const cashAdvanceItems = items.filter(it => it.type === 'CASH_ADVANCE')

                const formatHpDisplay = (raw?: any) => {
                  if (!raw || raw === '—') return '—'
                  const s = String(raw).trim()
                  if (!s) return '—'
                  if (/hp$/i.test(s)) return s.toUpperCase()
                  return `${s}HP`
                }

                const renderItemTable = (title: string, itemsList: any[], columns: { label: string; render: (item: any) => React.ReactNode; align?: 'left' | 'right' | 'center' }[], customTotal?: number, noBorderBottom?: boolean) => {
                  if (itemsList.length === 0) return null
                  const sumValue = customTotal !== undefined ? customTotal : itemsList.reduce((acc, it) => acc + (it.amount || 0), 0)
                  const isExpenseType = title.includes('Expense') || title.includes('Purchase') || title.includes('Order') || title.includes('Cash Advance')
                  
                  return (
                    <div className={`px-6 py-5 ${noBorderBottom ? '' : 'border-b'}`} style={{ borderColor: border }}>
                      <div className="flex items-center justify-between mb-4">
                        <p className={`text-xs font-extrabold uppercase tracking-wider ${isExpenseType ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {title}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold tabular-nums" style={{ color: isExpenseType ? '#EF4444' : '#10B981' }}>
                            ₱{peso(sumValue)}
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-900/30 text-[11px] font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${border}`, color: textMuted }}>
                              {columns.map((col, idx) => (
                                <th key={idx} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {itemsList.length === 0 ? (
                              <tr>
                                <td colSpan={columns.length} className="px-4 py-3 text-center text-xs" style={{ color: textMuted }}>
                                  — No entries —
                                </td>
                              </tr>
                            ) : itemsList.map((item, i) => (
                              <tr key={i} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/20 transition-colors" style={{ borderBottom: i < itemsList.length - 1 ? `1px solid ${border}` : 'none' }}>
                                {columns.map((col, idx) => (
                                  <td key={idx} className={`px-4 py-3 text-xs sm:text-sm ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                                    {idx === 0 ? (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-normal tabular-nums shrink-0" style={{ color: textPrimary }}>{i + 1}.</span>
                                        <span>{col.render(item)}</span>
                                      </div>
                                    ) : (
                                      col.render(item)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                }

                return (
                  <>

                    {/* Main metrics — 4 clean separated columns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ borderBottom: `1px solid ${border}` }}>

                      {/* 1. Sales & Target */}
                      <div className="px-5 py-5" style={{ borderRight: `1px solid ${border}` }}>
                        <p className="text-xs font-black uppercase tracking-wider mb-3.5 text-blue-600 dark:text-blue-400">Sales &amp; Target</p>
                        <div className="flex flex-col gap-2.5">
                          {[
                            { label: 'Gross Sales', value: `₱${peso(selectedRow.grossSales)}`, color: textPrimary, bold: true },
                            { label: 'Net Sales', value: `₱${peso(computeNetSales(selectedRow))}`, color: '#2563EB', bold: true },
                            { label: 'Target Quota', value: `₱${peso(selectedRow.targetDailyQuota)}`, color: textMuted },
                            { label: 'Difference', value: `${selectedRow.remarks === 'ABOVE QUOTA' ? '+' : ''}₱${peso(selectedRow.difference)}`, color: selectedRow.remarks === 'ABOVE QUOTA' ? '#10B981' : '#EF4444', bold: true },
                            { label: 'Remarks', value: formatRemarksLabel(selectedRow.remarks, false), color: selectedRow.remarks === 'ABOVE QUOTA' ? '#10B981' : selectedRow.remarks === 'PENDING' ? '#F59E0B' : isNoTransactionRemarks(selectedRow.remarks) ? textMuted : '#EF4444', bold: true },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-medium" style={{ color: textMuted }}>{r.label}</span>
                              <span className={`text-xs sm:text-sm tabular-nums ${r.bold ? 'font-bold' : 'font-semibold'}`} style={{ color: r.color }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 2. Expenses & Deductions */}
                      <div className="px-5 py-5" style={{ borderRight: `1px solid ${border}` }}>
                        <p className="text-xs font-black uppercase tracking-wider mb-3.5 text-rose-600 dark:text-rose-400">Expenses &amp; Payables</p>
                        <div className="flex flex-col gap-2.5">
                          {[
                            { label: 'Total Expenses', value: `₱${peso(selectedRow.totalExpenses)}`, bold: true },
                            { label: 'Total Payables', value: `₱${peso(selectedRow.totalPayables || 0)}`, bold: true },
                            { label: 'Total Purchases', value: `₱${peso(selectedRow.totalForPurchase || 0)}`, bold: false },
                            { label: 'Incentives', value: `₱${peso(totalIncentives)}`, bold: false },
                            { label: 'Commission Expenses (Paid)', value: `₱${peso(selectedRow.paidCommissionExpenses ?? totalPaidCommissionExpenses)}`, bold: false },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-medium" style={{ color: textMuted }}>{r.label}</span>
                              <span className={`text-xs sm:text-sm tabular-nums ${r.bold ? 'font-bold' : 'font-semibold'}`} style={{ color: textPrimary }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 3. Cash Flow */}
                      <div className="px-5 py-5" style={{ borderRight: `1px solid ${border}` }}>
                        <p className="text-xs font-black uppercase tracking-wider mb-3.5 text-emerald-600 dark:text-emerald-400">Cash Flow (COH/CFD)</p>
                        <div className="flex flex-col gap-2.5">
                          {[
                            { label: 'COH Prev Day', value: `₱${peso(selectedRow.cohPreviousDay)}`, bold: false },
                            { label: 'Fund from HO', value: `₱${peso(selectedRow.fundFromHo || 0)}`, bold: false },
                            { label: 'Cash Returns', value: `₱${peso(selectedRow.cashReturns)}`, bold: false },
                            { label: 'Total COH/CFD', value: `₱${peso(selectedRow.totalCohCfd)}`, bold: true },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-medium" style={{ color: textMuted }}>{r.label}</span>
                              <span className={`text-xs sm:text-sm tabular-nums ${r.bold ? 'font-bold' : 'font-semibold'}`} style={{ color: textPrimary }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 4. Collections */}
                      <div className="px-5 py-5">
                        <p className="text-xs font-black uppercase tracking-wider mb-3.5 text-indigo-600 dark:text-indigo-400">Collections &amp; Rebates</p>
                        <div className="flex flex-col gap-2.5">
                          {[
                            { label: 'Cash Collection', value: `₱${peso(selectedRow.totalCashCollection)}`, bold: true },
                            { label: 'Online Collection', value: `₱${peso(selectedRow.totalOnlineCollection)}`, bold: true },
                            { label: 'For Collection', value: `₱${peso(selectedRow.forCollection)}`, bold: false },
                            { label: 'Rebates', value: `₱${peso(selectedRow.rebatesForCollection)}`, bold: false },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-medium" style={{ color: textMuted }}>{r.label}</span>
                              <span className={`text-xs sm:text-sm tabular-nums ${r.bold ? 'font-bold' : 'font-semibold'}`} style={{ color: textPrimary }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Lists */}

                    {/* Detailed Lists */}
                    {rowExpensesLoading ? (
                      <div className="px-6 py-10 flex flex-col gap-3 justify-center items-center">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                        <span className="text-xs font-semibold text-slate-400">Loading transaction details...</span>
                      </div>
                    ) : (
                      <>
                        {/* 2-Column Grid: Left (Cash Transactions + Check Remits) | Right (Online Transactions + Cash Returns) */}
                        {(cashTxItems.length > 0 || onlineTxItems.length > 0 || cashRetItems.length > 0 || checkItems.length > 0) && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x border-b" style={{ borderColor: border }}>
                            {/* Left Column: Cash Transactions & Check Remits */}
                            <div className="flex flex-col divide-y" style={{ borderColor: border }}>
                              {renderItemTable('Cash Transactions', cashTxItems, [
                                { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                                { label: 'Installer', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                                { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                              ], undefined, true)}
                              {renderItemTable('Check Remits', checkItems, [
                                { label: 'Installer', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description.replace('CHECK|', ''))}</span> },
                                { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                                { label: 'Bank', render: (item) => <span style={{ color: textPrimary }}>{item.bank || '—'}</span> },
                                { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                              ], undefined, true)}
                            </div>

                            {/* Right Column: Vertical stack of Online Transactions and Cash Returns */}
                            <div className="flex flex-col">
                              {renderItemTable('Online Transactions', onlineTxItems, [
                                { label: 'Installer', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                                { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                                { label: 'Bank', render: (item) => <span style={{ color: textPrimary }}>{item.bank || '—'}</span> },
                                { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                              ], undefined, true)}
                              {renderItemTable('Cash Returns', cashRetItems, [
                                { label: 'Returned By (Installer/Technician/Driver)', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description.replace('RETURN|', ''))}</span> },
                                { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                              ], undefined, true)}
                            </div>
                          </div>
                        )}

                        {/* Parts Sales / Unit Sales */}
                        {renderItemTable('Parts Sales / Unit Sales', partsSaleItems, [
                          { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                          { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[2] || '—'}</span> },
                          { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                        ])}

                        {/* Expenses Grid: Expenses with Receipts (left) | Expenses for Purchase (right) */}
                        {(expenseItems.length > 0 || purchaseItems.length > 0) && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x border-b" style={{ borderColor: border }}>
                            <div>
                              {renderItemTable('Expenses with Receipts', expenseItems, [
                                { label: 'Name', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[0] ? formatDisplayUserLabel(item.description.split('|')[0]) : '—'}</span> },
                                { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                                { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                              ], undefined, true)}
                            </div>
                            <div>
                              {renderItemTable('Expenses for Purchase', purchaseItems, [
                                { label: 'Name', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[0] ? formatDisplayUserLabel(item.description.split('|')[0]) : '—'}</span> },
                                { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                                { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                              ], undefined, true)}
                            </div>
                          </div>
                        )}

                        {/* Parts Order / Units Order */}
                        {renderItemTable('Parts Order / Units Order', orderItems, [
                          { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                          { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[2] || '—'}</span> },
                          { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                        ])}

                        {/* For Collection Breakdown */}
                        {renderItemTable('For Collection Breakdown', forCollItems, [
                          { label: 'Installer/Negotiator', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                          { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                          { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                          {
                            label: 'Status',
                            align: 'center',
                            render: (item) => (
                              <span className="text-xs sm:text-sm font-normal uppercase" style={{ color: textPrimary }}>
                                {item.collectionResolved ? 'RESOLVED' : 'PENDING'}
                              </span>
                            )
                          }
                        ])}

                        {/* Rebates Breakdown */}
                        {renderItemTable('Rebates Breakdown', rebateItems, [
                          { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                          { label: 'Company', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                          { label: 'Brand', render: (item) => <span style={{ color: textPrimary }}>{item.company || '—'}</span> },
                          {
                            label: 'HP',
                            render: (item) => (
                              <span className="text-xs sm:text-sm font-normal" style={{ color: textPrimary }}>
                                {formatHpDisplay(item.description.split('|')[2])}
                              </span>
                            )
                          },
                          { label: 'Rate', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                        ])}

                        {/* Commission Expenses Breakdown */}
                        {renderItemTable('Commission Expenses', commissionItems, [
                          { label: 'Ticket No.', render: (item) => <span style={{ color: textPrimary }}>{item.ticketNumber || '—'}</span> },
                          { label: 'Store', render: (item) => <span style={{ color: textPrimary }}>{item.company || '—'}</span> },
                          { label: 'Diser', render: (item) => <span style={{ color: textPrimary }}>{item.promodiser || '—'}</span> },
                          { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                          { label: 'Brand', render: (item) => <span style={{ color: textPrimary }}>{item.brand || item.bank || (item.description && item.description.startsWith('COMMISSION|') ? item.description.split('|')[2] : '') || '—'}</span> },
                          {
                            label: 'HP',
                            render: (item) => {
                              const hpVal = item.hp || (item.description && item.description.startsWith('COMMISSION|') ? item.description.split('|')[3] : '')
                              return (
                                <span className="text-xs sm:text-sm font-normal" style={{ color: textPrimary }}>
                                  {formatHpDisplay(hpVal)}
                                </span>
                              )
                            }
                          },
                          { label: 'Date Installed', render: (item) => <span style={{ color: textPrimary }}>{item.dateInstalled || '—'}</span> },
                          { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                          {
                            label: 'Status',
                            align: 'center',
                            render: (item) => (
                              <span className="text-xs sm:text-sm font-normal uppercase" style={{ color: item.collectionResolved ? '#10B981' : '#F59E0B' }}>
                                {item.collectionResolved ? 'PAID' : 'PENDING'}
                              </span>
                            )
                          }
                        ])}

                        {/* Cash Advance Breakdown */}
                        {renderItemTable('Cash Advance', cashAdvanceItems, [
                          { label: 'Member Name', render: (item) => <span style={{ color: textPrimary }}>{item.description?.split('|')[0] || '—'}</span> },
                          { label: 'Details', render: (item) => <span style={{ color: textPrimary }}>{item.description?.split('|').slice(1).join('|') || '—'}</span> },
                          { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                        ])}

                        {/* Unit Summary stats grid */}
                        <div className="px-6 py-5 flex flex-col gap-3" style={{ borderBottom: `1px solid ${border}` }}>
                          <div className="flex items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: border }}>
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Unit Summary</span>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                            {[
                              { label: 'Scheduled', value: String(selectedRow.totalUnitsScheduled || 0) },
                              { label: 'Rescheduled', value: String(selectedRow.totalRescheduled || 0) },
                              { label: 'Installed', value: String(selectedRow.totalUnitsInstalled || 0) },
                              { label: 'Serviced', value: String(selectedRow.totalUnitsServiced || 0) },
                              { label: 'Cancelled', value: String(selectedRow.totalUnitsCancelled || 0) },
                              { label: 'Free Install', value: String(selectedRow.totalUnitsFreeInstall || 0) },
                              { label: 'Survey Only', value: String(selectedRow.totalUnitsSurveyOnly || 0) },
                            ].map((item) => (
                              <div key={item.label} className="rounded-lg px-3 py-2.5 flex flex-col justify-between" style={{ border: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{item.label}</div>
                                <div className="mt-1 text-sm font-normal tabular-nums" style={{ color: textPrimary }}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Incentives Breakdown */}
                        {renderItemTable('Incentives Breakdown', incentiveItems, [
                          { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                          { label: 'Brand', render: (item) => <span style={{ color: textPrimary }}>{item.company || '—'}</span> },
                          { label: 'Promodiser', render: (item) => <span style={{ color: textPrimary }}>{item.promodiser || item.description?.split('|')[1] || '—'}</span> },
                          {
                            label: 'HP',
                            render: (item) => (
                              <span className="text-xs sm:text-sm font-normal" style={{ color: textPrimary }}>
                                {formatHpDisplay(item.hp || item.description?.split('|')[2])}
                              </span>
                            )
                          },
                          { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                          {
                            label: 'Status',
                            align: 'center',
                            render: (item) => (
                              <span className="text-xs sm:text-sm font-normal uppercase" style={{ color: textPrimary }}>
                                {item.collectionResolved ? 'RESOLVED' : 'PENDING'}
                              </span>
                            )
                          }
                        ])}
                      </>
                    )}
                  </>
                )
              })()}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t flex items-center justify-between shrink-0"
                style={{ borderColor: border, backgroundColor: isLight ? 'rgba(248,250,252,0.8)' : 'rgba(6,11,24,0.5)' }}>
                <div className="flex items-center gap-3">
                  {isAdmin && selectedRow.id && showEditButton && (
                    <button
                      type="button"
                      onClick={() => handleClearRow(selectedRow)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-all flex items-center gap-1.5 shadow-sm border-none active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Report
                    </button>
                  )}
                  <span className="text-[11px]" style={{ color: textMuted }}>
                    {user?.name && <>Viewing as <strong style={{ color: textPrimary }}>{user.name}</strong></>}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRow(null)}
                  className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 transition-all active:scale-95"
                  style={{ backgroundColor: '#10B981' }}
                >
                  Close
                </button>
              </div>

            </div>
          </div>,
          document.body
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="rounded-2xl shadow-2xl flex flex-col gap-0 overflow-hidden"
            style={{
              backgroundColor: isLight ? '#ffffff' : '#1E293B',
              border: `1px solid ${
                confirmModal.type === 'danger'  ? 'rgba(239,68,68,0.25)'
                : confirmModal.type === 'warning' ? 'rgba(245,158,11,0.25)'
                : 'rgba(59,130,246,0.25)'
              }`,
              width: '100%',
              maxWidth: '380px',
              margin: '0 20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Accent bar */}
            <div style={{
              height: '3px',
              background: confirmModal.type === 'danger'  ? 'linear-gradient(90deg, #EF4444, #F87171)'
                        : confirmModal.type === 'warning' ? 'linear-gradient(90deg, #F59E0B, #FCD34D)'
                        : 'linear-gradient(90deg, #3B82F6, #60A5FA)',
            }} />
            {/* Body */}
            <div className="px-6 py-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: confirmModal.type === 'danger'  ? 'rgba(239,68,68,0.1)'
                                   : confirmModal.type === 'warning' ? 'rgba(245,158,11,0.1)'
                                   : 'rgba(59,130,246,0.1)',
                  }}
                >
                  {confirmModal.type === 'danger'  && <Trash2 className="w-4 h-4" style={{ color: '#EF4444' }} />}
                  {confirmModal.type === 'warning' && <ClipboardList className="w-4 h-4" style={{ color: '#F59E0B' }} />}
                  {confirmModal.type === 'info'    && <Upload className="w-4 h-4" style={{ color: '#3B82F6' }} />}
                  {!confirmModal.type             && <Check className="w-4 h-4" style={{ color: '#10B981' }} />}
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <p className="text-sm font-black" style={{ color: textPrimary }}>{confirmModal.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: textMuted }}>{confirmModal.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 justify-end">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: isLight ? '#F1F5F9' : '#0F172A',
                    color: textMuted,
                    border: `1px solid ${border}`,
                  }}
                >
                  {confirmModal.cancelText ?? 'Cancel'}
                </button>
                <button
                  onClick={() => { confirmModal.onConfirm(); setConfirmModal(null) }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{
                    background: confirmModal.type === 'danger'  ? 'linear-gradient(135deg, #EF4444, #DC2626)'
                              : confirmModal.type === 'warning' ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                              : 'linear-gradient(135deg, #3B82F6, #2563EB)',
                  }}
                >
                  {confirmModal.confirmText ?? 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </> /* end summary tab */}

    </div>
  )
}
