import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  BarChart2, CalendarDays, TrendingUp, TrendingDown,
  AlertTriangle, X, ChevronRight, FileText, Eye, Download,
  ArrowUp, ArrowDown,
  Minimize2, Maximize2, MoreVertical,
  CheckCircle2, XCircle, Gift, Receipt, HelpCircle, Loader2
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

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
  totalUnitsInstalledServiced: number
  totalCancelled: number
  totalUnitsFreeInstall: number
  forCollection: number
  rebatesForCollection: number
}

interface DrilldownItem {
  type: string
  description: string
  amount: number
  receiptReturned?: boolean
  receiptStatus?: 'PENDING' | 'UPLOADED' | string
  company?: string
  units?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

// ── Component ─────────────────────────────────────────────────────────────────



const isNoTransactionRemarks = (remarks: string) =>
  remarks === 'NO SCHED' || remarks === 'NO TRANSACTION' || remarks === 'NO RECORD' || remarks === 'NO REPORT'

const formatRemarksLabel = (remarks: string, compact: boolean) => {
  if (isNoTransactionRemarks(remarks)) return compact ? 'No Trans' : 'No Transaction'
  if (compact && remarks === 'ABOVE QUOTA') return 'ABOVE'
  if (compact && remarks === 'BELOW QUOTA') return 'BELOW'
  return remarks
}

const remarksBadgeStyle = (remarks: string, noRecord: boolean, isAbove: boolean) => {
  if (remarks === 'PENDING') {
    return { backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
  }
  if (isNoTransactionRemarks(remarks) || noRecord) {
    return { backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }
  }
  if (isAbove) {
    return { backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }
  }
  return { backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }
}

export default function DailyAuditReport() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'
  const rowHover    = isLight ? '#f1f5f9'  : '#0f1e36'

  const [rows, setRows]           = useState<AuditRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [importing, setImporting] = useState(false)
  const [viewMode, setViewMode]   = useState<'single' | 'range'>(() => {
    const stored = localStorage.getItem('perf-view-mode')
    return (stored === 'single' || stored === 'range') ? stored : 'single'
  })

  const [date, setDate] = useState(() => {
    const stored = localStorage.getItem('perf-selected-date')
    if (stored) return stored
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
    localStorage.setItem('perf-selected-date', date)
  }, [date])

  useEffect(() => {
    localStorage.setItem('perf-range-from', rangeFrom)
  }, [rangeFrom])

  useEffect(() => {
    localStorage.setItem('perf-range-to', rangeTo)
  }, [rangeTo])

  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null)
  const [rowExpenses, setRowExpenses] = useState<{ items: DrilldownItem[]; receivedBy?: string } | null>(null)
  const [rowExpensesLoading, setRowExpensesLoading] = useState(false)
  const [hiddenBranches, setHiddenBranches] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'remarks', direction: 'desc' })
  const [compactView, setCompactView] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileDateRef = useRef<HTMLInputElement>(null)
  const desktopDateRef = useRef<HTMLInputElement>(null)
  const desktopRangeFromRef = useRef<HTMLInputElement>(null)
  const desktopRangeToRef = useRef<HTMLInputElement>(null)

  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) return
    input.showPicker?.()
    input.focus()
  }

  const handleClearRow = async (row: AuditRow) => {
    if (!row.id) return
    const confirmed = window.confirm(
      `Are you sure you want to clear all data for ${row.branchName} on this date?\n\nThis will permanently delete the report.`
    )
    if (!confirmed) return
    let clearing = false; void clearing
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ id: row.id })
      const res = await fetch(`${API_BASE_URL}/v1/reports/audit-summary?${params.toString()}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setSelectedRow(null)
        fetchAudit()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Clear failed (HTTP ${res.status})`)
      }
    } catch {
      alert('Failed to clear row data')
    }
  }


  const role = (user?.role || '').toLowerCase()
  const jobTitleLower = (user?.jobTitle || '').trim().toLowerCase()
  const isSalesCoordinator = role === 'employee' && (
    jobTitleLower === 'sales coordinator'
    || jobTitleLower === 'coordinator'
    || jobTitleLower.includes('coor')
  )
  const isManagerOrStaff = role === 'manager' || role === 'staff' || isSalesCoordinator || role === 'admin' || role === 'oic'
  const isManager = role === 'manager' || isSalesCoordinator || role === 'oic'
  const isAdmin = role === 'admin'
  const canImportExcel = isAdmin || isManager

  const hasAlreadySubmitted = useMemo(() => {
    if (!user?.branchId) return false
    const userBid = user.branchId.toLowerCase().trim()
    const userEmailLower = (user.email || '').toLowerCase()
    const isUserServices = userEmailLower.includes('service')

    return rows.some(row => {
      const isSubmitted = row.status !== 'NO RECORD' && row.status !== 'NO REPORT' && row.status !== 'NO SCHED'
      if (!isSubmitted) return false

      const isSameBranchId = row.branchId.toLowerCase().trim() === userBid
      const isTaguig = userBid === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b' || userBid.startsWith('br-taguig') || userBid.includes('taguig')

      if (isTaguig) {
        const isRowService = row.auditLine === 'TAGUIG_SERVICE' || row.branchName.toLowerCase().includes('service') || row.branchName.toLowerCase().includes('services')
        return isSameBranchId && (isUserServices === isRowService)
      }

      return isSameBranchId
    })
  }, [user, rows])

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

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) { e.target.value = ''; return }
    const targetDate = viewMode === 'single' ? date : rangeFrom
    const prettyDate = viewMode === 'single'
      ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const confirmed = window.confirm(
      `Import "${file.name}" into ${prettyDate}?\n\n` +
      `The backend will look for a sheet matching this date and save the data under that day. Existing reports for ${prettyDate} will be REPLACED.`
    )
    if (!confirmed) { e.target.value = ''; return }
    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/import?date=${encodeURIComponent(targetDate)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      })
      if (res.ok) {
        const result = await res.json()
        if (!result?.count) {
          alert(`Import finished but no report rows were saved. Please check that the Excel sheet matches ${prettyDate} and contains branch rows.`)
          return
        }
        const importedDate = (result?.date as string) || targetDate
        alert(`${result.message || 'Import successful!'}${result?.sheet ? ` (from sheet "${result.sheet}")` : ''}`)
        if (viewMode === 'single') { if (importedDate !== date) setDate(importedDate); else fetchAudit() }
        else { if (importedDate !== rangeFrom) { setRangeFrom(importedDate); setRangeTo(importedDate) } else fetchAudit() }
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || `Import failed (HTTP ${res.status})`)
      }
    } catch { alert('Network error during import') }
    finally { setImporting(false); e.target.value = '' }
  }

  const fetchRowExpenses = async (row: AuditRow) => {
    setRowExpensesLoading(true)
    const branchName = (row.logicalBranchName ?? row.branchName).trim()
    const dObj = viewMode === 'single' ? new Date(date + 'T00:00:00') : new Date(rangeFrom + 'T00:00:00')
    const isoFormat = dObj.toISOString().split('T')[0]
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      let items = []
      let receivedBy = ''
      if (row.id) {
        const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/${row.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          items = data.items || []
          receivedBy = data.receivedBy || ''
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
      setRowExpenses({ items, receivedBy })
    } catch {
      setRowExpenses({ items: [], receivedBy: '' })
    } finally {
      setRowExpensesLoading(false)
    }
  }

  // const toggleHideBranch = (branchName: string) => {
  //   setHiddenBranches(prev => prev.includes(branchName) ? prev.filter(b => b !== branchName) : [...prev, branchName])
  // }

  const canViewPerformanceRow = (_row: AuditRow) => true

  let visibleRows = rows.filter(r => !hiddenBranches.includes(r.branchName) && canViewPerformanceRow(r))

  const logicalBranchCount = useMemo(
    () => new Set(rows.map(r => (r.logicalBranchName ?? r.branchName).trim())).size,
    [rows]
  )

  if (sortConfig !== null) {
    const keyMap: Record<string, keyof AuditRow> = {
      branch: 'branchName', time: 'timeUploaded', status: 'status', grossSales: 'grossSales',
      target: 'targetDailyQuota', difference: 'difference', remarks: 'remarks',
      coh: 'cohPreviousDay', fundHo: 'fundFromHo', cashReturns: 'cashReturns',
      totalCohCfd: 'totalCohCfd', cashColl: 'totalCashCollection', onlineColl: 'totalOnlineCollection',
      totalExp: 'totalExpenses', units: 'totalUnitsInstalledServiced', cancelled: 'totalCancelled',
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
      const av = a[k], bv = b[k]
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
    targetDailyQuota:     acc.targetDailyQuota + r.targetDailyQuota,
    totalCohCfd:          acc.totalCohCfd + r.totalCohCfd,
    totalCashCollection:  acc.totalCashCollection + r.totalCashCollection,
    totalOnlineCollection:acc.totalOnlineCollection + r.totalOnlineCollection,
    totalExpenses:        acc.totalExpenses + r.totalExpenses,
    forCollection:        acc.forCollection + r.forCollection,
    rebatesForCollection: acc.rebatesForCollection + r.rebatesForCollection,
  }), { grossSales:0, targetDailyQuota:0, totalCohCfd:0, totalCashCollection:0, totalOnlineCollection:0, totalExpenses:0, forCollection:0, rebatesForCollection:0 })

  const handleExportExcel = () => {
    if (visibleRows.length === 0) {
      alert('No performance data to export.')
      return
    }

    const exportLabel = viewMode === 'single'
      ? `Daily_${date}`
      : `Range_${rangeFrom}_to_${rangeTo}`

    const wsData = visibleRows.map((row, index) => ({
      '#': index + 1,
      Branch: row.branchName,
      Time: formatLocalTime(row.createdAt, row.timeUploaded) || '',
      Status: row.status,
      'Gross Sales': row.grossSales,
      'Target Quota': row.targetDailyQuota,
      Difference: row.difference,
      Remarks: row.remarks,
      'COH Prev Day': row.cohPreviousDay,
      'Fund from HO': row.fundFromHo,
      'Cash Returns': row.cashReturns,
      'Total COH/CFD': row.totalCohCfd,
      'Cash Collection': row.totalCashCollection,
      'Online Collection': row.totalOnlineCollection,
      'Total Expenses': row.totalExpenses,
      'For Collection': row.forCollection,
      Rebates: row.rebatesForCollection,
      'Units Installed/Serviced': row.totalUnitsInstalledServiced,
      Cancelled: row.totalCancelled,
      'Free Install': row.totalUnitsFreeInstall,
    }))

    const ws = XLSX.utils.json_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Performance')
    XLSX.writeFile(wb, `ASHCOL_Performance_${exportLabel}.xlsx`)
  }

  // Column definitions — key/label/compact label pairs
  const columns = [
    { key: 'branch',      label: 'Branch',                 short: 'Branch' },
    { key: 'grossSales',  label: 'Gross Sales',            short: 'Sales' },
    { key: 'target',      label: 'Target Quota',           short: 'Quota' },
    { key: 'difference',  label: 'Diff / Remarks',         short: 'Diff/Rem.' },
    { key: 'coh',         label: 'COH Prev Day',           short: 'COH' },
    { key: 'fundHo',      label: 'Fund from HO',           short: 'HO' },
    { key: 'cashReturns', label: 'Cash Returns',           short: 'Ret.' },
    { key: 'totalCohCfd', label: 'Total COH/CFD',          short: 'CFD' },
    { key: 'cashColl',    label: 'Cash Collection',        short: 'Cash' },
    { key: 'onlineColl',  label: 'Online Collection',      short: 'Online' },
    { key: 'totalExp',    label: 'Total Expenses',         short: 'Exp.' },
    { key: 'forColl',     label: 'For Collection',         short: 'Coll.' },
    { key: 'rebates',     label: 'Rebates',                short: 'Reb.' },
    { key: 'units',       label: 'Units Inst./Serv.',      short: 'Units' },
    { key: 'cancelled',   label: 'Cancelled',              short: 'Canc.' },
    { key: 'freeInstall', label: 'Free Install',           short: 'Free' },
  ]

  const mobileSortOptions = [
    { key: 'remarks', label: 'Remarks' },
    { key: 'difference', label: 'Difference' },
    { key: 'grossSales', label: 'Sales' },
  ]



  const mobileDateLabel = viewMode === 'single'
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
    : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`

  const renderMobileMetric = (label: string, value: string, color = textPrimary) => (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-medium truncate" style={{ color: textMuted }}>{label}</span>
      <span className="text-xs font-semibold tabular-nums truncate" style={{ color }}>{value}</span>
    </div>
  )

  const mobileKpiChip = (label: string, value: string, color: string) => (
    <div className="mobile-kpi-chip" style={{ borderColor: `${color}40`, backgroundColor: `${color}12` }}>
      <span className="text-[10px] font-medium" style={{ color: textMuted }}>{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color }}>{value}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 pb-8 md:pb-8">

      <input type="file" accept=".xlsx,.xls" className="hidden" id="excel-import-input" onChange={handleImportExcel} />

      {/* ── Mobile header ──────────────────────────────────────────────────── */}
      <div className="md:hidden rounded-xl no-print" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: textPrimary }}>
              <BarChart2 className="w-4 h-4" style={{ color: '#10B981' }} />
              Daily Branch Performance
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>{mobileDateLabel}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={handleExportExcel}
              disabled={visibleRows.length === 0}
              title="Export Excel"
              className="w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-white bg-blue-500 hover:bg-blue-600 transition-colors"
              style={{ border: 'none' }}>
              <Download className="w-4 h-4" />
            </button>
            <div className="relative shrink-0">
              <button type="button" onClick={() => setMobileMenuOpen(o => !o)}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ border: `1px solid ${inputBorder}`, color: textMuted }}>
                <MoreVertical className="w-4 h-4" />
              </button>
              {mobileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-50 w-40 rounded-lg overflow-hidden"
                    style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                    <div className="py-1">
                      <button type="button" onClick={() => { handleExportExcel(); setMobileMenuOpen(false) }}
                        disabled={visibleRows.length === 0}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed" style={{ color: textPrimary }}>
                        <Download className="w-3.5 h-3.5" style={{ color: textMuted }} /> Export Excel
                      </button>

                    {canImportExcel && (
                      <>
                        <button type="button" onClick={() => { document.getElementById('excel-import-input')?.click(); setMobileMenuOpen(false) }}
                          disabled={importing || (viewMode === 'range' && rangeFrom !== rangeTo)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium disabled:opacity-40" style={{ color: textPrimary }}>
                          <TrendingUp className="w-3.5 h-3.5" style={{ color: textMuted }} /> Import
                        </button>
                      </>
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

        <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg text-xs font-medium overflow-hidden"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
            {(['single', 'range'] as const).map(m => (
              <button key={m} type="button" onClick={() => setViewMode(m)} className="px-3 py-1.5"
                style={{ backgroundColor: viewMode === m ? '#10B981' : 'transparent', color: viewMode === m ? '#fff' : textMuted }}>
                {m === 'single' ? 'Daily' : 'Range'}
              </button>
            ))}
          </div>
          {viewMode === 'single' ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs flex-1 min-w-[130px] cursor-pointer"
              onClick={() => openDatePicker(mobileDateRef.current)}
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
              <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
              <input ref={mobileDateRef} type="date" value={date} onChange={e => setDate(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="bg-transparent outline-none text-xs w-full cursor-pointer" style={{ color: textPrimary }} />
            </div>
          ) : (
            <>
              <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs flex-1 min-w-0 cursor-pointer" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs flex-1 min-w-0 cursor-pointer" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
            </>
          )}
        </div>

        {!loading && rows.length > 0 && (
          <div className="mobile-scroll-snap px-4 py-3" style={{ borderTop: `1px solid ${border}` }}>
            {mobileKpiChip('Gross', `₱${peso(totals.grossSales)}`, '#3B82F6')}
            {mobileKpiChip('Cash', `₱${peso(totals.totalCashCollection)}`, '#10B981')}
            {mobileKpiChip('Online', `₱${peso(totals.totalOnlineCollection)}`, '#6366F1')}
            {mobileKpiChip('Expenses', `₱${peso(totals.totalExpenses)}`, '#EF4444')}
            {mobileKpiChip('For coll.', `₱${peso(totals.forCollection)}`, '#F59E0B')}
          </div>
        )}

      </div>

      {/* ── Desktop toolbar ─────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 py-1 no-print">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div id="audit-view-toggle" className="flex items-center rounded-lg text-xs font-bold overflow-hidden"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
            {(['single','range'] as const).map(m => (
              <button key={m} type="button" onClick={() => setViewMode(m)} className="px-2.5 py-1.5 transition-colors"
                style={{ backgroundColor: viewMode===m ? '#10B981' : 'transparent', color: viewMode===m ? '#fff' : textMuted }}>
                {m === 'single' ? 'Daily' : 'Range'}
              </button>
            ))}
          </div>

          {/* Date picker(s) */}
          {viewMode === 'single' ? (
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
              onClick={() => openDatePicker(desktopDateRef.current)}
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
              <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              <input id="audit-date-picker" ref={desktopDateRef} type="date" value={date} onChange={e => setDate(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="bg-transparent outline-none text-xs cursor-pointer" style={{ color: textPrimary }} />
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {[{ val: rangeFrom, set: setRangeFrom }, { val: rangeTo, set: setRangeTo }].map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                  onClick={() => openDatePicker(i === 0 ? desktopRangeFromRef.current : desktopRangeToRef.current)}
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                  <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                  <input
                    ref={i === 0 ? desktopRangeFromRef : desktopRangeToRef}
                    type="date"
                    value={p.val}
                    onChange={e => p.set(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="bg-transparent outline-none text-xs cursor-pointer"
                    style={{ color: textPrimary }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button type="button" onClick={handleExportExcel}
            disabled={visibleRows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs border transition-all hover:scale-105 no-print disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#3B82F6', borderColor: '#3B82F6', color: '#fff' }}>
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>

          {hiddenBranches.length > 0 && (
            <button type="button" onClick={() => setHiddenBranches([])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs border transition-all hover:scale-105"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#EF4444' }}>
              <Eye className="w-3.5 h-3.5" />Show {hiddenBranches.length} Hidden
            </button>
          )}

          {canImportExcel && (
            <button id="audit-import-btn" type="button"
              disabled={importing || (viewMode === 'range' && rangeFrom !== rangeTo)}
              onClick={() => document.getElementById('excel-import-input')?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs border transition-all hover:scale-105"
              style={{ backgroundColor: '#10B981', borderColor: '#10B981', color: '#fff',
                opacity: importing || (viewMode === 'range' && rangeFrom !== rangeTo) ? 0.5 : 1 }}>
              <TrendingUp className={`w-3.5 h-3.5 ${importing ? 'animate-bounce' : ''}`} />
              {importing ? 'Importing…' : `Import Excel`}
            </button>
          )}
        </div>
      </div>

      {/* ── Print area enclosing KPI Counters and Table ─────────────────────────── */}
      <div className="print-area flex flex-col gap-5">

      {/* ── Smaller Cleaner KPI Counters Bar (desktop) ─────────────────────── */}
      {!loading && rows.length > 0 && (
        <div className="hidden md:flex flex-wrap items-center gap-y-2 gap-x-6 px-4 py-2.5 rounded-xl border text-xs"
          style={{ backgroundColor: cardBg, borderColor: border }}>
          {[
            { label: 'Gross Sales',      value: peso(totals.grossSales),             color: '#3B82F6', icon: BarChart2 },
            { label: 'Cash Collected',   value: peso(totals.totalCashCollection),    color: '#10B981', icon: TrendingUp },
            { label: 'Online Collected', value: peso(totals.totalOnlineCollection),  color: '#8B5CF6', icon: TrendingUp },
            { label: 'Total Expenses',         value: peso(totals.totalExpenses),          color: '#EF4444', icon: TrendingDown },
          ].map((k, i, arr) => {
            const Icon = k.icon
            return (
              <div key={i} className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5" style={{ color: k.color }} />
                <span style={{ color: textMuted }}>{k.label}:</span>
                <strong className="font-extrabold" style={{ color: k.color }}>₱{k.value}</strong>
                {i < arr.length - 1 && <span className="ml-4 opacity-25" style={{ color: textMuted }}>|</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Manager/Staff CTA ─────────────────────────────────────────── */}
      {isManagerOrStaff && !hasAlreadySubmitted && (
        <div className="hidden md:flex rounded-xl px-4 py-2.5 items-center justify-between gap-3 text-xs no-print"
          style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />
            <span style={{ color: textPrimary }} className="font-bold">Submit Today's Branch Report:</span>
            <span style={{ color: textMuted }}>Daily Sales &amp; Expenses encoder</span>
          </div>
          <a href="/daily-report" id="submit-daily-report-btn"
            className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90 shrink-0"
            style={{ backgroundColor: '#10B981' }}>
            Open Form <ChevronRight className="w-3 h-3" />
          </a>
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
            <span className="font-black uppercase tracking-wider text-[10px]" style={{ color: '#10B981' }}>Above Quota:</span>
            <div className="flex flex-wrap gap-2">
              {aboveQuotaBranches.map((branch) => (
                <div key={branch.branchName} className="flex items-center gap-2 px-3 py-1 rounded-full border text-xs"
                  style={{ backgroundColor: inputBg, borderColor: border }}>
                  <span className="font-bold" style={{ color: textPrimary }}>{branch.branchName}</span>
                  <span className="font-extrabold text-[11px]" style={{ color: '#10B981' }}>+₱{peso(branch.difference)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Audit Table (desktop) ──────────────────────────────────────────── */}
      <div className="hidden md:block rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Table toolbar */}
        <div className="px-5 py-3.5 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${border}` }}>
          <BarChart2 className="w-4 h-4" style={{ color: '#10B981' }} />
          <h3 className="font-black text-sm" style={{ color: textPrimary }}>
            Daily Branch Performance —{' '}
            {viewMode === 'single'
              ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
          </h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color: '#10B981', backgroundColor: 'rgba(16,185,129,0.12)' }}>
            {logicalBranchCount} Branches
          </span>
          <button
            id="audit-compact-toggle"
            type="button"
            onClick={() => { setCompactView(v => !v) }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all hover:scale-105 no-print"
            style={compactView
              ? { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.4)', color: '#3B82F6' }
              : { backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
          >
            {compactView ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            {compactView ? 'Full View' : 'Compact View'}
          </button>
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
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 210px)' }}>
            <table
              style={compactView
                ? { minWidth: '1180px', fontSize: '10px', tableLayout: 'auto', width: '100%', borderCollapse: 'separate', borderSpacing: 0 }
                : { minWidth: '1700px', fontSize: '12px' }
              }
            >
              {/* ── Table Head ── */}
              <thead>
                <tr style={{ backgroundColor: inputBg, borderBottom: `1px solid ${border}` }}>
                  {columns.map(col => {
                    const sorted = sortConfig?.key === col.key
                    return (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="text-left font-bold uppercase tracking-wider cursor-pointer select-none transition-colors"
                        style={{
                          color: sorted ? textPrimary : textMuted,
                          padding: compactView ? '7px 6px' : '10px 12px',
                          whiteSpace: 'nowrap',
                          fontSize: compactView ? 9 : 10,
                          letterSpacing: 0,
                          position: 'sticky',
                          top: 0,
                          left: col.key === 'branch' ? 0 : undefined,
                          zIndex: col.key === 'branch' ? 25 : 20,
                          backgroundColor: inputBg,
                        }}
                      >
                        <div className="flex items-center gap-0.5">
                          {compactView ? col.short : col.label}
                          {sorted
                            ? sortConfig!.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5 ml-0.5 shrink-0" /> : <ArrowDown className="w-2.5 h-2.5 ml-0.5 shrink-0" />
                            : null}
                        </div>
                      </th>
                    )
                  })}
                  
                </tr>
              </thead>

              {/* ── Table Body ── */}
              <tbody>
                {visibleRows.map((row, idx) => {

                  const isAbove    = row.remarks === 'ABOVE QUOTA'
                  const isPending  = row.remarks === 'PENDING'
                  const noRecord   = row.status === 'NO RECORD' || row.status === 'NO REPORT' || row.status === 'NO SCHED'
                  const noTransaction = isNoTransactionRemarks(row.remarks) || noRecord
                  const p          = compactView ? '7px 6px' : '10px 12px'
                  const isSelected = selectedRow && `${selectedRow.branchId}:${selectedRow.auditLine || ''}` === `${row.branchId}:${row.auditLine || ''}`

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
                        borderBottom: `1px solid ${border}`,
                        backgroundColor: isSelected
                          ? (isLight ? '#E0F2FE' : '#1E293B')
                          : 'transparent',
                        cursor: 'pointer'
                      }}
                      className="transition-colors group"
                      onMouseEnter={e => {
                        e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => {
                          td.style.backgroundColor = rowHover
                        })
                      }}
                      onMouseLeave={e => {
                        const isSel = selectedRow && `${selectedRow.branchId}:${selectedRow.auditLine || ''}` === `${row.branchId}:${row.auditLine || ''}`
                        e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => {
                          td.style.backgroundColor = td.classList.contains('sticky')
                            ? (isSel ? (isLight ? '#E0F2FE' : '#1E293B') : cardBg)
                            : (isSel ? (isLight ? '#E0F2FE' : '#1E293B') : 'transparent')
                        })
                      }}
                    >
                      {/* ① Branch (with combined status & time upload inline) */}
                      <td className="font-semibold sticky left-0"
                        style={{
                          color: textPrimary,
                          backgroundColor: isSelected
                            ? (isLight ? '#E0F2FE' : '#1E293B')
                            : cardBg,
                          padding: p,
                          whiteSpace: 'nowrap',
                          transition: 'background-color 0.15s ease-in-out'
                        }}>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span style={{ color: textMuted, fontSize: compactView ? 8 : 9, minWidth: '14px' }}>{idx + 1}.</span>
                              <span className="font-bold" style={{ fontSize: compactView ? 10 : 12 }}>{row.branchName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5" style={{ fontSize: compactView ? '8px' : '10px' }}>
                              <span style={{
                                display: 'inline-block',
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: isPending ? '#F59E0B' : noRecord ? '#EF4444' : '#10B981'
                              }} />
                              <span style={{ color: noTransaction && !isPending ? '#EF4444' : isPending ? '#F59E0B' : '#10B981', fontWeight: 600 }}>
                                {isPending
                                  ? (compactView ? 'Pending' : 'Pending')
                                  : noTransaction
                                    ? (compactView ? 'No Trans' : 'No Transaction')
                                    : 'Checked'}
                              </span>
                              {!noRecord && (row.createdAt || row.timeUploaded) && (
                                <span style={{ color: textMuted }}>
                                  • {formatLocalTime(row.createdAt, row.timeUploaded)}
                                </span>
                              )}
                            </div>
                          </div>
                      </td>

                      {/* ④ Gross Sales */}
                      <td className="font-semibold" style={{ color: textPrimary, padding: p, whiteSpace: 'nowrap' }}>₱{peso(row.grossSales)}</td>

                      {/* ⑤ Target Quota */}
                      <td style={{ color: '#8B5CF6', fontWeight: 600, padding: p, whiteSpace: 'nowrap' }} >
                        <>₱{peso(row.targetDailyQuota)}</>
                      </td>

                      {/* ⑥ Difference & Remarks */}
                      <td style={{ padding: p, whiteSpace: 'nowrap' }}>
                        <div className="flex flex-col gap-0.5">
                          <span style={{
                            display: 'inline-block',
                            alignSelf: 'start',
                            padding: compactView ? '1px 3px' : '1.5px 5px',
                            borderRadius: 4,
                            fontSize: compactView ? 7 : 9,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            ...remarksBadgeStyle(row.remarks, noRecord, isAbove),
                          }}>
                            {formatRemarksLabel(row.remarks, compactView)}
                          </span>
                          {noRecord ? (
                            <span style={{ color: textMuted }}>—</span>
                          ) : (
                            <span className="font-bold text-[11px]" style={{ color: isAbove ? '#10B981' : '#EF4444' }}>
                              {isAbove ? '+' : ''}₱{peso(row.difference)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* ⑧ COH Prev Day */}
                      <td style={{ color: textMuted, padding: p, whiteSpace: 'nowrap' }} >
                        <>₱{peso(row.cohPreviousDay)}</>
                      </td>

                      {/* ⑨ Fund from HO */}
                      <td style={{ color: textMuted, padding: p, whiteSpace: 'nowrap' }} >
                        <>₱{peso(row.fundFromHo)}</>
                      </td>

                      {/* ⑩ Cash Returns */}
                      <td style={{ color: textMuted, padding: p, whiteSpace: 'nowrap' }} >
                        <>₱{peso(row.cashReturns)}</>
                      </td>

                      {/* ⑪ Total COH/CFD */}
                      <td className="font-semibold" style={{ color: textPrimary, padding: p, whiteSpace: 'nowrap' }}>₱{peso(row.totalCohCfd)}</td>

                      {/* ⑫ Cash Collection */}
                      <td className="font-semibold" style={{ color: '#10B981', padding: p, whiteSpace: 'nowrap' }} >
                        <>₱{peso(row.totalCashCollection)}</>
                      </td>

                      {/* ⑬ Online Collection */}
                      <td className="font-semibold" style={{ color: '#3B82F6', padding: p, whiteSpace: 'nowrap' }} >
                        <>₱{peso(row.totalOnlineCollection)}</>
                      </td>

                      {/* ⑭ Total Expenses — clickable drilldown */}
                      <td className="font-semibold" style={{ padding: p, whiteSpace: 'nowrap' }}>
                        <button
                          id={`expense-drilldown-${idx}`}
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedRow(row)
                            setRowExpenses(null)
                            fetchRowExpenses(row)
                          }}
                          className="flex items-center gap-1 hover:underline transition-opacity hover:opacity-75"
                          style={{ color: '#EF4444' }}
                        >
                          ₱{peso(row.totalExpenses)}
                        </button>
                      </td>

                      {/* ⑱ For Collection */}
                      <td className="font-semibold" style={{ color: '#F59E0B', padding: p, whiteSpace: 'nowrap' }} >
                        <>₱{peso(row.forCollection)}</>
                      </td>

                      {/* ⑲ Rebates */}
                      <td style={{ color: textMuted, padding: p, whiteSpace: 'nowrap' }}>
                        <>₱{peso(row.rebatesForCollection)}</>
                      </td>

                      {/* ⑮ Units */}
                      <td className="text-center font-semibold" style={{ color: textPrimary, padding: p }} >
                        {row.totalUnitsInstalledServiced}
                      </td>

                      {/* ⑯ Cancelled */}
                      <td className="text-center" style={{ color: row.totalCancelled > 0 ? '#EF4444' : textMuted, padding: p }} >
                        {row.totalCancelled}
                      </td>

                      {/* ⑰ Free Install */}
                      <td className="text-center" style={{ color: textMuted, padding: p }} >
                        {row.totalUnitsFreeInstall}
                      </td>

                    </tr>
                  )
                })}
              </tbody>

              {/* ── Totals Footer ── */}
              <tfoot>
                <tr style={{ borderTop: `2px solid ${border}`, backgroundColor: inputBg }}>
                  <td colSpan={1} style={{ padding: compactView ? '5px 5px' : '10px 12px' }} />
                  {/* Gross Sales */}
                  <td className="font-black whitespace-nowrap" style={{ color: '#3B82F6', fontSize: compactView ? 9 : 11, padding: compactView ? '5px 5px' : '10px 12px' }}>
                    ₱{peso(totals.grossSales)}
                  </td>
                  {/* Target Quota */}
                  <td className="font-black whitespace-nowrap" style={{ color: '#8B5CF6', fontSize: compactView ? 9 : 11, padding: compactView ? '5px 5px' : '10px 12px' }}>
                    ₱{peso(totals.targetDailyQuota)}
                  </td>
                  {/* Difference + Remarks + COH + HO + Returns + CFD */}
                  <td colSpan={5} />
                  {/* Cash Collection */}
                  <td className="font-black whitespace-nowrap" style={{ color: '#10B981', fontSize: compactView ? 9 : 11, padding: compactView ? '5px 5px' : '10px 12px' }}>
                    ₱{peso(totals.totalCashCollection)}
                  </td>
                  {/* Online Collection */}
                  <td className="font-black whitespace-nowrap" style={{ color: '#3B82F6', fontSize: compactView ? 9 : 11, padding: compactView ? '5px 5px' : '10px 12px' }}>
                    ₱{peso(totals.totalOnlineCollection)}
                  </td>
                  {/* Total Expenses */}
                  <td className="font-black whitespace-nowrap" style={{ color: '#EF4444', fontSize: compactView ? 9 : 11, padding: compactView ? '5px 5px' : '10px 12px' }}>
                    ₱{peso(totals.totalExpenses)}
                  </td>
                  {/* For Collection */}
                  <td className="font-black whitespace-nowrap" style={{ color: '#F59E0B', fontSize: compactView ? 9 : 11, padding: compactView ? '5px 5px' : '10px 12px' }}>
                    ₱{peso(totals.forCollection)}
                  </td>
                  {/* Rebates */}
                  <td className="font-black whitespace-nowrap" style={{ color: textMuted, fontSize: compactView ? 9 : 11, padding: compactView ? '5px 5px' : '10px 12px' }}>
                    ₱{peso(totals.rebatesForCollection)}
                  </td>
                  {/* Units + Cancelled + Free */}
                  <td colSpan={3} />
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

      {/* ── Mobile branch cards ────────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-3 no-print">
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
              <div key={idx} className="relative rounded-xl overflow-hidden"
                style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <button type="button" className="w-full text-left px-4 py-3"
                  onClick={() => {
                    setSelectedRow(row)
                    setRowExpenses(null)
                    fetchRowExpenses(row)
                  }}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium tabular-nums shrink-0 pt-0.5" style={{ color: textMuted }}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: textPrimary }}>{row.branchName}</span>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="mobile-status-dot" style={{ backgroundColor: statusColor }} />
                        <span className="text-xs font-medium" style={{ color: statusColor }}>
                          {isPending ? 'Pending' : noTransaction ? 'No transaction' : 'Checked'}
                        </span>
                        {!noRecord && (row.createdAt || row.timeUploaded) && (
                          <span className="text-xs" style={{ color: textMuted }}>{formatLocalTime(row.createdAt, row.timeUploaded)}</span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                          style={remarksBadgeStyle(row.remarks, noRecord, isAbove)}>
                          {formatRemarksLabel(row.remarks, false)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-2.5 pt-2.5" style={{ borderTop: `1px solid ${border}` }}>
                        {renderMobileMetric('Sales', `₱${peso(row.grossSales)}`, '#3B82F6')}
                        {renderMobileMetric('Quota', `₱${peso(row.targetDailyQuota)}`, '#8B5CF6')}
                        {renderMobileMetric('Diff', noRecord ? '—' : `${isAbove ? '+' : ''}₱${peso(row.difference)}`, diffColor)}
                      </div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4" style={{ borderTop: `1px solid ${border}` }}>
                    <div className="grid grid-cols-2 gap-2 pt-3">
                      {[
                        { label: 'Cash', field: 'totalCashCollection', val: row.totalCashCollection, color: '#10B981', money: true },
                        { label: 'Online', field: 'totalOnlineCollection', val: row.totalOnlineCollection, color: '#6366F1', money: true },
                        { label: 'Expenses', field: 'totalExpenses', val: row.totalExpenses, color: '#EF4444', money: true },
                        { label: 'For coll.', field: 'forCollection', val: row.forCollection, color: '#F59E0B', money: true },
                        { label: 'COH prev', field: 'cohPreviousDay', val: row.cohPreviousDay, color: textPrimary, money: true },
                        { label: 'Total CFD', val: row.totalCohCfd, color: textPrimary, money: true, readOnly: true },
                        { label: 'Units', field: 'totalUnitsInstalledServiced', val: row.totalUnitsInstalledServiced, color: textPrimary, int: true },
                        { label: 'Cancelled', field: 'totalCancelled', val: row.totalCancelled, color: row.totalCancelled > 0 ? '#EF4444' : textMuted, int: true },
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

      {/* ── For Collection Banner ──────────────────────────────────── */}
      {!loading && totals.forCollection > 0 && (
        <div className="hidden md:flex rounded-2xl p-4 items-center justify-between no-print"
          style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <span className="text-sm font-bold uppercase tracking-wider" style={{ color: '#F59E0B' }}>Total for Collection</span>
          <span className="text-xl font-black" style={{ color: '#F59E0B' }}>₱{peso(totals.forCollection)}</span>
        </div>
      )}

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
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-4xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div>
                <h4 className="font-black text-base" style={{ color: textPrimary }}>{selectedRow.branchName}</h4>
                <p className="text-[11px] mt-0.5" style={{ color: textMuted }}>
                  {viewMode === 'single'
                    ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                    : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && selectedRow.id && (
                  <button type="button" onClick={() => handleClearRow(selectedRow)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                    style={{ border: 'none' }}>
                    Clear Row
                  </button>
                )}
                {(isAdmin || isManager) && (
                  <a
                    href={selectedRow.id
                      ? `/daily-report?id=${selectedRow.id}`
                      : `/daily-report?branchId=${selectedRow.branchId}&date=${date}&auditLine=${selectedRow.auditLine || ''}`
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                    style={{ color: '#fff', backgroundColor: '#10B981', border: 'none' }}
                  >
                    {selectedRow.id ? 'Edit DTR' : 'Create DTR'}
                  </a>
                )}
                <button onClick={() => setSelectedRow(null)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10" style={{ color: textMuted }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">

              {/* Status strip */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-6 py-3 text-xs" style={{ borderBottom: `1px solid ${border}`, backgroundColor: inputBg }}>
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
                {selectedRow.timeUploaded && (
                  <span style={{ color: textMuted }}>Time: <span style={{ color: textPrimary, fontWeight: 600 }}>{selectedRow.timeUploaded}</span></span>
                )}
                {rowExpenses?.receivedBy && (
                  <span style={{ color: textMuted }}>Submitted by: <span style={{ color: textPrimary, fontWeight: 600 }}>{rowExpenses.receivedBy}</span></span>
                )}
              </div>

              {/* Main metrics — 3 flat columns, no icon headers, no inner boxes */}
              <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderBottom: `1px solid ${border}` }}>

                {/* Sales Summary */}
                <div className="px-6 py-5" style={{ borderRight: `1px solid ${border}` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>Sales Summary</p>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { label: 'Gross Sales', value: `₱${peso(selectedRow.grossSales)}`, color: textPrimary },
                      { label: 'Target Quota', value: `₱${peso(selectedRow.targetDailyQuota)}`, color: '#8B5CF6' },
                      { label: 'Difference', value: `${selectedRow.remarks === 'ABOVE QUOTA' ? '+' : ''}₱${peso(selectedRow.difference)}`, color: selectedRow.remarks === 'ABOVE QUOTA' ? '#10B981' : '#EF4444' },
                      { label: 'Remarks', value: formatRemarksLabel(selectedRow.remarks, false), color: selectedRow.remarks === 'ABOVE QUOTA' ? '#10B981' : selectedRow.remarks === 'PENDING' ? '#F59E0B' : isNoTransactionRemarks(selectedRow.remarks) ? textMuted : '#EF4444' },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between gap-3">
                        <span className="text-xs" style={{ color: textMuted }}>{r.label}</span>
                        <span className="text-xs font-bold tabular-nums" style={{ color: r.color }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cash Flow */}
                <div className="px-6 py-5" style={{ borderRight: `1px solid ${border}` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>Cash Flow</p>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { label: 'COH Prev Day', value: `₱${peso(selectedRow.cohPreviousDay)}`, bold: false },
                      { label: 'Fund from HO', value: `₱${peso(selectedRow.fundFromHo)}`, bold: false },
                      { label: 'Cash Returns', value: `₱${peso(selectedRow.cashReturns)}`, bold: false },
                      { label: 'Total COH/CFD', value: `₱${peso(selectedRow.totalCohCfd)}`, bold: true },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between gap-3">
                        <span className="text-xs" style={{ color: textMuted }}>{r.label}</span>
                        <span className={`text-xs tabular-nums ${r.bold ? 'font-black' : 'font-semibold'}`} style={{ color: textPrimary }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Collections */}
                <div className="px-6 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>Collections</p>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { label: 'Cash Collection', value: `₱${peso(selectedRow.totalCashCollection)}`, color: '#10B981' },
                      { label: 'Online Collection', value: `₱${peso(selectedRow.totalOnlineCollection)}`, color: '#3B82F6' },
                      { label: 'For Collection', value: `₱${peso(selectedRow.forCollection)}`, color: '#F59E0B' },
                      { label: 'Rebates', value: `₱${peso(selectedRow.rebatesForCollection)}`, color: textMuted },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between gap-3">
                        <span className="text-xs" style={{ color: textMuted }}>{r.label}</span>
                        <span className="text-xs font-bold tabular-nums" style={{ color: r.color }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Redesigned Rebate Summary */}
              <div className="px-6 py-5 flex flex-col gap-4.5" style={{ borderBottom: `1px solid ${border}` }}>
                <div className="flex items-center gap-1.5 pb-1 border-b" style={{ borderColor: border }}>
                  <FileText className="w-4 h-4 text-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textPrimary }}>Rebate Summary</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Rebates Total', value: `₱${peso(selectedRow.rebatesForCollection)}`, icon: <Receipt className="w-4 h-4 text-emerald-500" />, bg: 'rgba(16,185,129,0.04)', border: 'rgba(16,185,129,0.12)', text: '#10B981' },
                    { label: 'Installed', value: String(selectedRow.totalUnitsInstalledServiced), icon: <CheckCircle2 className="w-4 h-4 text-blue-500" />, bg: 'rgba(59,130,246,0.04)', border: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
                    { label: 'Cancelled', value: String(selectedRow.totalCancelled), icon: <XCircle className="w-4 h-4 text-red-500" />, bg: 'rgba(239,68,68,0.04)', border: 'rgba(239,68,68,0.12)', text: '#EF4444' },
                    { label: 'Free Install', value: String(selectedRow.totalUnitsFreeInstall), icon: <Gift className="w-4 h-4 text-amber-500" />, bg: 'rgba(245,158,11,0.04)', border: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border p-3 flex items-center justify-between transition-all duration-300 hover:scale-[1.02] hover:shadow-sm" style={{ borderColor: item.border, backgroundColor: item.bg }}>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{item.label}</span>
                        <span className="text-sm font-black tracking-tight" style={{ color: item.text }}>{item.value}</span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 shadow-xs border border-slate-100 dark:border-slate-800">
                        {item.icon}
                      </div>
                    </div>
                  ))}
                </div>

                {rowExpensesLoading ? (
                  <div className="mt-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: textMuted }}>Loading detailed breakdown...</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {[1, 2].map(i => (
                        <div key={i} className="flex gap-4 animate-pulse">
                          <div className="h-5 flex-1 rounded bg-slate-200 dark:bg-slate-800" />
                          <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                          <div className="h-5 w-12 rounded bg-slate-200 dark:bg-slate-800" />
                          <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (() => {
                  const rebateItems = (rowExpenses?.items || []).filter(
                    (item: any) => item.type === 'REBATE'
                  )
                  if (rebateItems.length > 0) {
                    return (
                      <div className="mt-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider mb-2 block" style={{ color: textMuted }}>Detailed Rebates Breakdown</span>
                        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 dark:bg-slate-900/30 font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${border}`, color: textMuted, fontSize: '9px' }}>
                                <th className="px-3 py-2">Brand / Company</th>
                                <th className="px-3 py-2">RA Number</th>
                                <th className="px-3 py-2">HP</th>
                                <th className="px-3 py-2 text-right">Amount Each</th>
                                <th className="px-3 py-2 text-center">Units</th>
                                <th className="px-3 py-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rebateItems.map((item: any, i: number) => {
                                const desc = item.description || ''
                                const parts = desc.startsWith('REBATE|') ? desc.split('|') : ['', '', '']
                                const raNumber = parts[1] || '—'
                                const hp = parts[2] || '—'
                                const amt = item.amount || 0
                                const qty = item.units || 0
                                return (
                                  <tr key={i} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/20 transition-colors" style={{ borderBottom: i < rebateItems.length - 1 ? `1px solid ${border}` : 'none' }}>
                                    <td className="px-3 py-2 font-bold" style={{ color: textPrimary }}>{item.company || '—'}</td>
                                    <td className="px-3 py-2">
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        {raNumber}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                                        {hp}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: textPrimary }}>₱{peso(amt)}</td>
                                    <td className="px-3 py-2 text-center font-bold tabular-nums" style={{ color: textPrimary }}>{qty}</td>
                                    <td className="px-3 py-2 text-right font-black tabular-nums text-emerald-600 dark:text-emerald-400">₱{peso(amt * qty)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  }
                  if (selectedRow.rebatesForCollection > 0) {
                    return (
                      <div className="mt-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider mb-2 block" style={{ color: textMuted }}>Detailed Rebates Breakdown</span>
                        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 dark:bg-slate-900/30 font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${border}`, color: textMuted, fontSize: '9px' }}>
                                <th className="px-3 py-2">Brand / Company</th>
                                <th className="px-3 py-2">RA Number</th>
                                <th className="px-3 py-2">HP</th>
                                <th className="px-3 py-2 text-right">Amount Each</th>
                                <th className="px-3 py-2 text-center">Units</th>
                                <th className="px-3 py-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="hover:bg-slate-50/20 dark:hover:bg-slate-900/20 transition-colors">
                                <td className="px-3 py-2 font-bold" style={{ color: textPrimary }}>Rebates (Total)</td>
                                <td className="px-3 py-2"><span className="text-slate-400">—</span></td>
                                <td className="px-3 py-2"><span className="text-slate-400">—</span></td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: textPrimary }}>₱{peso(selectedRow.rebatesForCollection)}</td>
                                <td className="px-3 py-2 text-center font-bold tabular-nums" style={{ color: textPrimary }}>1</td>
                                <td className="px-3 py-2 text-right font-black tabular-nums text-emerald-600 dark:text-emerald-400">₱{peso(selectedRow.rebatesForCollection)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div className="mt-1 text-center py-4 flex flex-col items-center justify-center gap-1">
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-[11px] font-bold" style={{ color: textMuted }}>No detailed rebates recorded today.</p>
                    </div>
                  )
                })()}
              </div>

              {/* Expenses Breakdown */}
              <div className="px-6 py-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Expenses Breakdown</p>
                  <span className="text-xs font-black" style={{ color: '#EF4444' }}>₱{peso(selectedRow.totalExpenses)}</span>
                </div>

                {rowExpensesLoading ? (
                  <div className="flex flex-col gap-2">
                    <div className="h-5 rounded animate-pulse" style={{ backgroundColor: border }} />
                    <div className="h-5 rounded animate-pulse" style={{ backgroundColor: border }} />
                    <div className="h-5 rounded animate-pulse w-3/4" style={{ backgroundColor: border }} />
                  </div>
                ) : (() => {
                  const filteredItems = (rowExpenses?.items || []).filter(
                    (item: any) => item.type === 'EXPENSE' || item.type === 'PURCHASE'
                  )
                  if (filteredItems.length === 0) {
                    return <p className="text-xs py-4 text-center" style={{ color: textMuted }}>No detailed expenses recorded.</p>
                  }
                  return (
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${border}` }}>
                          <th className="pb-2 text-left text-[10px] font-bold uppercase" style={{ color: textMuted }}>Type</th>
                          <th className="pb-2 text-left text-[10px] font-bold uppercase" style={{ color: textMuted }}>Description</th>
                          <th className="pb-2 text-left text-[10px] font-bold uppercase" style={{ color: textMuted }}>Receipt</th>
                          <th className="pb-2 text-right text-[10px] font-bold uppercase" style={{ color: textMuted }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((item: any, i: number) => {
                          const tc = item.type === 'EXPENSE' ? '#EF4444' : '#F59E0B'
                          return (
                            <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                              <td className="py-2 pr-3">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ backgroundColor: `${tc}18`, color: tc }}>
                                  {item.type.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="py-2" style={{ color: textPrimary }}>{item.description}</td>
                              <td className="py-2 px-2">
                                {item.type === 'PURCHASE' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{
                                    backgroundColor: item.receiptReturned ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                                    color: item.receiptReturned ? '#10B981' : '#F59E0B'
                                  }}>
                                    {item.receiptStatus || (item.receiptReturned ? 'UPLOADED' : 'PENDING')}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
                                    UPLOADED
                                  </span>
                                )}
                              </td>
                              <td className="py-2 text-right font-bold" style={{ color: tc }}>₱{peso(item.amount)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                })()}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  )
}
