import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart2, CalendarDays, TrendingUp, TrendingDown,
  AlertTriangle, X, Receipt, ChevronRight, FileText, Eye, EyeOff,
  Search, ArrowUp, ArrowDown, Trophy, Award, Crown
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import { loadAuditExpenses } from '../utils/auditExpenseStorage'
import type { AuditExpense } from '../types/auditExpense'

// ── Types ────────────────────────────────────────────────────────────────────

interface AuditRow {
  /** Physical branch for counting (8 locations); Taguig audit lines share "ASHCOL TAGUIG". */
  logicalBranchName?: string | null
  branchName: string
  timeUploaded: string | null
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
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Component ────────────────────────────────────────────────────────────────

export default function DailyAuditReport() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'
  const rowHover    = isLight ? '#f1f5f9'  : '#0f1e36'

  const [rows, setRows]           = useState<AuditRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [importing, setImporting] = useState(false)
  const [viewMode, setViewMode] = useState<'single' | 'range'>('single')
  // NOTE: use LOCAL date (not toISOString which is UTC) so a Filipino user at
  // 1 AM doesn't see "yesterday" as the default.
  const [date, setDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [rangeTo, setRangeTo] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const [drilldown, setDrilldown] = useState<{ branchName: string; items: DrilldownItem[]; auditExpenses: AuditExpense[] } | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)
  const [hiddenBranches, setHiddenBranches] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const role = (user?.role || '').toLowerCase()
  const isManagerOrStaff = role === 'manager' || role === 'staff'
  const isManager = role === 'manager'
  const isAdmin = role === 'admin'
  // Admins can import every branch from the workbook; managers can also
  // upload the same workbook but the backend will only save the row matching
  // their own branchId.
  const canImportExcel = isAdmin || isManager

  const fetchAudit = useCallback(async () => {
    if (viewMode === 'range' && (!rangeFrom || !rangeTo)) return
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      
      let url = `${API_BASE_URL}/v1/reports/audit-summary`
      if (viewMode === 'single') {
        url += `?date=${date}`
      } else if (rangeFrom && rangeTo) {
        url = `${API_BASE_URL}/v1/reports/audit-summary-range?from=${rangeFrom}&to=${rangeTo}`
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setRows(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [viewMode, date, rangeFrom, rangeTo])

  useEffect(() => { fetchAudit() }, [fetchAudit])

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      e.target.value = ''
      return
    }

    // Capture the date the user has selected RIGHT NOW so there's no ambiguity
    // about which day will receive the imported data.
    const targetDate = viewMode === 'single' ? date : rangeFrom
    const prettyDate = viewMode === 'single'
      ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const confirmed = window.confirm(
      `Import "${file.name}" into ${prettyDate}?\n\n` +
      `The backend will look for a sheet matching this date (e.g. "${targetDate}" or "${prettyDate.split(',')[1]?.trim()}") ` +
      `and save the data under that day. Existing reports for ${prettyDate} will be REPLACED.`
    )
    if (!confirmed) {
      e.target.value = ''
      return
    }

    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const url = `${API_BASE_URL}/v1/reports/import?date=${encodeURIComponent(targetDate)}`
      console.log('[Audit] Importing Excel ->', url)
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (res.ok) {
        const result = await res.json()
        const importedDate = (result?.date as string) || targetDate
        const sheetMsg = result?.sheet ? ` (from sheet "${result.sheet}")` : ''
        alert(`${result.message || 'Import successful!'}${sheetMsg}`)
        // Jump audit view to whichever date the server actually wrote into.
        if (viewMode === 'single') {
          if (importedDate !== date) setDate(importedDate)
          else fetchAudit()
        } else {
          if (importedDate !== rangeFrom) {
             setRangeFrom(importedDate)
             setRangeTo(importedDate)
          } else fetchAudit()
        }
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.error || `Import failed (HTTP ${res.status})`)
      }
    } catch (err) {
      console.error(err)
      alert('Network error during import')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const openDrilldown = async (branchName: string) => {
    setDrillLoading(true)
    
    // Also fetch Audit Expenses for this branch & date
    const allExpenses = await loadAuditExpenses()
    
    // Normalize date and branch matching
    const dObj = viewMode === 'single' ? new Date(date + 'T00:00:00') : new Date(rangeFrom + 'T00:00:00')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const format1 = `${dObj.getDate()}-${months[dObj.getMonth()]}-${String(dObj.getFullYear()).slice(-2)}` // e.g. 1-May-26
    const format2 = `${String(dObj.getDate()).padStart(2, '0')}-${months[dObj.getMonth()]}-${String(dObj.getFullYear()).slice(-2)}` // e.g. 01-May-26
    const isoFormat = dObj.toISOString().split('T')[0]
    
    const matchedExpenses = allExpenses.filter(e => 
      e.branchName.toLowerCase() === branchName.toLowerCase() && 
      (e.date === format1 || e.date === format2 || e.date === isoFormat)
    )

    setDrilldown({ branchName, items: [], auditExpenses: matchedExpenses })
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const drillDate = dObj.toISOString().split('T')[0]
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/items?branchName=${encodeURIComponent(branchName)}&date=${drillDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const items = await res.json()
        setDrilldown({ branchName, items, auditExpenses: matchedExpenses })
      }
    } catch {
      setDrilldown({ branchName, items: [], auditExpenses: matchedExpenses })
    } finally {
      setDrillLoading(false)
    }
  }

  const toggleHideBranch = (branchName: string) => {
    setHiddenBranches(prev => 
      prev.includes(branchName) 
        ? prev.filter(b => b !== branchName)
        : [...prev, branchName]
    )
  }

  let visibleRows = rows.filter(r => !hiddenBranches.includes(r.branchName))

  /** Eight physical branches — Taguig Sales + Service count as one. */
  const logicalBranchCount = useMemo(
    () => new Set(rows.map(r => (r.logicalBranchName ?? r.branchName).trim())).size,
    [rows]
  )

  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    visibleRows = visibleRows.filter(r => r.branchName.toLowerCase().includes(q))
  }

  if (sortConfig !== null) {
    visibleRows.sort((a, b) => {
      const keyMap: Record<string, keyof AuditRow> = {
        'branch': 'branchName',
        'time': 'timeUploaded',
        'status': 'status',
        'grossSales': 'grossSales',
        'target': 'targetDailyQuota',
        'difference': 'difference',
        'remarks': 'remarks',
        'coh': 'cohPreviousDay',
        'fundHo': 'fundFromHo',
        'cashReturns': 'cashReturns',
        'totalCohCfd': 'totalCohCfd',
        'cashColl': 'totalCashCollection',
        'onlineColl': 'totalOnlineCollection',
        'totalExp': 'totalExpenses',
        'units': 'totalUnitsInstalledServiced',
        'cancelled': 'totalCancelled',
        'freeInstall': 'totalUnitsFreeInstall',
        'forColl': 'forCollection',
        'rebates': 'rebatesForCollection',
      }
      const mappedKey = keyMap[sortConfig.key] || sortConfig.key as keyof AuditRow
      const aVal = a[mappedKey]
      const bVal = b[mappedKey]

      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      
      return sortConfig.direction === 'asc' 
        ? (aVal < bVal ? -1 : 1) 
        : (aVal < bVal ? 1 : -1)
    })
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc'
    }
    setSortConfig({ key, direction })
  }

  // Totals row
  const totals = visibleRows.reduce(
    (acc, r) => ({
      grossSales: acc.grossSales + r.grossSales,
      targetDailyQuota: acc.targetDailyQuota + r.targetDailyQuota,
      totalCohCfd: acc.totalCohCfd + r.totalCohCfd,
      totalCashCollection: acc.totalCashCollection + r.totalCashCollection,
      totalOnlineCollection: acc.totalOnlineCollection + r.totalOnlineCollection,
      totalExpenses: acc.totalExpenses + r.totalExpenses,
      forCollection: acc.forCollection + r.forCollection,
      rebatesForCollection: acc.rebatesForCollection + r.rebatesForCollection,
    }),
    { grossSales: 0, targetDailyQuota: 0, totalCohCfd: 0, totalCashCollection: 0, totalOnlineCollection: 0, totalExpenses: 0, forCollection: 0, rebatesForCollection: 0 }
  )

  const columns = [
    { key: 'branch',           label: 'BRANCH' },
    { key: 'time',             label: viewMode === 'single' ? 'TIME UPLOADED' : 'DAYS REPORTED' },
    { key: 'status',           label: 'STATUS' },
    { key: 'grossSales',       label: 'GROSS SALES' },
    { key: 'target',           label: 'TARGET DAILY QUOTA' },
    { key: 'difference',       label: 'DIFFERENCE' },
    { key: 'remarks',          label: 'REMARKS' },
    { key: 'coh',              label: 'COH (PREV. DAY)' },
    { key: 'fundHo',           label: 'FUND FROM HO' },
    { key: 'cashReturns',      label: 'CASH RETURNS' },
    { key: 'totalCohCfd',      label: 'TOTAL COH/CFD' },
    { key: 'cashColl',         label: 'TOTAL CASH COLLECTION' },
    { key: 'onlineColl',       label: 'TOTAL ONLINE COLLECTION' },
    { key: 'totalExp',         label: 'TOTAL EXPENSES' },
    { key: 'units',            label: 'TOTAL UNITS INSTALLED/SERVICED' },
    { key: 'cancelled',        label: 'TOTAL CANCELLED' },
    { key: 'freeInstall',      label: 'TOTAL UNITS FREE INSTALL' },
    { key: 'forColl',          label: 'FOR COLLECTION' },
    { key: 'rebates',          label: 'REBATES FOR COLLECTION' },
  ]

  return (
    <div className="flex flex-col gap-5 pb-8">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #10B981, transparent)' }} />
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#10B981' }}>
            Finance Hub
          </p>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            All-Branch Daily Audit Report
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            Real-time branch quota monitoring &amp; financial reconciliation
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Search input */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
          >
            <Search className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
            <input
              type="text"
              placeholder="Search branch..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-xs w-28 md:w-36"
              style={{ color: textPrimary }}
            />
          </div>

          {/* View mode toggle */}
          <div
            id="audit-view-toggle"
            className="flex items-center rounded-xl text-xs font-bold overflow-hidden"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
          >
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className="px-3 py-2 transition-colors"
              style={{
                backgroundColor: viewMode === 'single' ? '#10B981' : 'transparent',
                color: viewMode === 'single' ? '#fff' : textMuted,
              }}
            >
              Daily Snapshot
            </button>
            <button
              type="button"
              onClick={() => setViewMode('range')}
              className="px-3 py-2 transition-colors"
              style={{
                backgroundColor: viewMode === 'range' ? '#10B981' : 'transparent',
                color: viewMode === 'range' ? '#fff' : textMuted,
              }}
            >
              Range Summary
            </button>
          </div>

          {viewMode === 'single' ? (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            >
              <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              <input
                id="audit-date-picker"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-transparent outline-none text-xs"
                style={{ color: textPrimary }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              >
                <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={e => setRangeFrom(e.target.value)}
                  className="bg-transparent outline-none text-xs"
                  style={{ color: textPrimary }}
                />
              </div>
              <span className="text-xs font-bold" style={{ color: textMuted }}>TO</span>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              >
                <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                <input
                  type="date"
                  value={rangeTo}
                  onChange={e => setRangeTo(e.target.value)}
                  className="bg-transparent outline-none text-xs"
                  style={{ color: textPrimary }}
                />
              </div>
            </div>
          )}

          {hiddenBranches.length > 0 && (
            <button
              type="button"
              onClick={() => setHiddenBranches([])}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#EF4444' }}
            >
              <Eye className="w-4 h-4" />
              Show {hiddenBranches.length} Hidden
            </button>
          )}

          {canImportExcel && (
            <>
              <input
                type="file"
                accept=".xlsx, .xls"
                className="hidden"
                id="excel-import-input"
                onChange={handleImportExcel}
              />
              <button
                id="audit-import-btn"
                type="button"
                disabled={importing || (viewMode === 'range' && rangeFrom !== rangeTo)}
                onClick={() => document.getElementById('excel-import-input')?.click()}
                title={viewMode === 'range' && rangeFrom !== rangeTo
                  ? 'Excel import is per-day. Switch to Daily Snapshot or select a single day range to import.'
                  : isManager
                    ? `Will import only YOUR branch's row into ${viewMode === 'single' ? date : rangeFrom}.`
                    : `Will import every branch into ${viewMode === 'single' ? date : rangeFrom}.`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                style={{
                  backgroundColor: '#10B981',
                  borderColor: '#10B981',
                  color: '#fff',
                  opacity: (importing || (viewMode === 'range' && rangeFrom !== rangeTo)) ? 0.5 : 1,
                  cursor: (viewMode === 'range' && rangeFrom !== rangeTo) ? 'not-allowed' : undefined,
                }}
              >
                <TrendingUp className={`w-4 h-4 ${importing ? 'animate-bounce' : ''}`} />
                {importing
                  ? 'Importing…'
                  : `Import Excel for ${viewMode === 'single' ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
              </button>
            </>
          )}

        </div>
      </div>

      {/* ── Manager/Staff: Quick Submit CTA ────────────────────────── */}
      {isManagerOrStaff && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between gap-4"
          style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
              <FileText className="w-4 h-4" style={{ color: '#10B981' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: textPrimary }}>Submit Today's Branch Report</p>
              <p className="text-xs" style={{ color: textMuted }}>Click to open the Daily Sales &amp; Expenses encoder</p>
            </div>
          </div>
          <a
            href="/daily-report"
            id="submit-daily-report-btn"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:scale-105"
            style={{ backgroundColor: '#10B981' }}
          >
            Open Form <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* ── Summary KPI Strip ───────────────────────────────────────── */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Gross Sales',       value: peso(totals.grossSales),        color: '#3B82F6', icon: BarChart2 },
            { label: 'Total Cash Collected',    value: peso(totals.totalCashCollection), color: '#10B981', icon: TrendingUp },
            { label: 'Total Online Collected',  value: peso(totals.totalOnlineCollection), color: '#8B5CF6', icon: TrendingUp },
            { label: 'Total Expenses',          value: peso(totals.totalExpenses),      color: '#EF4444', icon: TrendingDown },
          ].map((k, i) => {
            const Icon = k.icon
            return (
              <div
                key={i}
                className="rounded-2xl p-4 relative overflow-hidden"
                style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              >
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: k.color }} />
                <div className="flex items-center justify-between mb-3 pl-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${k.color}18`, color: k.color }}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="pl-2">
                  <div className="text-lg font-black tracking-tight" style={{ color: k.color }}>₱{k.value}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textMuted }}>{k.label}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Above Quota Spotlight ───────────────────────────────────── */}
      {!loading && rows.length > 0 && (() => {
        const aboveQuotaBranches = rows.filter(r =>
          r.remarks === 'ABOVE QUOTA' &&
          r.status !== 'NO SCHED' &&
          r.status !== 'NO RECORD' &&
          r.status !== 'NO REPORT'
        ).sort((a, b) => b.difference - a.difference)

        if (aboveQuotaBranches.length === 0) return null

        return (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.12)' }}>
                <Trophy className="w-4 h-4" style={{ color: '#F59E0B' }} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>
                  {viewMode === 'single'
                    ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
                    : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} - ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
                </p>
                <h3 className="text-sm font-black tracking-tight" style={{ color: textPrimary }}>Above Quota Branches</h3>
              </div>
              <span
                className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}
              >
                {aboveQuotaBranches.length} exceeded
              </span>
            </div>

            {/* Cards */}
            <div className="p-4 flex flex-wrap gap-3">
              {aboveQuotaBranches.map((branch, idx) => {
                const RankIcon = idx === 0 ? Crown : Award
                const rankStyle = idx === 0
                  ? { iconBg: 'rgba(245,158,11,0.12)', iconColor: '#F59E0B', cardBorder: 'rgba(245,158,11,0.25)' }
                  : idx === 1
                    ? { iconBg: 'rgba(148,163,184,0.12)', iconColor: '#94A3B8', cardBorder: border }
                    : idx === 2
                      ? { iconBg: 'rgba(180,100,50,0.12)', iconColor: '#CD7F32', cardBorder: border }
                      : { iconBg: 'rgba(16,185,129,0.1)', iconColor: '#10B981', cardBorder: border }

                return (
                  <div
                    key={branch.branchName}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                    style={{
                      backgroundColor: inputBg,
                      border: `1px solid ${rankStyle.cardBorder}`,
                      minWidth: '210px',
                    }}
                  >
                    {/* Rank icon */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: rankStyle.iconBg }}
                    >
                      <RankIcon className="w-4 h-4" style={{ color: rankStyle.iconColor }} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-black text-xs truncate" style={{ color: textPrimary }}>{branch.branchName}</p>
                      <p className="text-[11px]" style={{ color: textMuted }}>₱{peso(branch.grossSales)}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs font-black" style={{ color: '#10B981' }}>+₱{peso(branch.difference)}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>#{idx + 1}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Audit Table ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}` }}>
          <BarChart2 className="w-4 h-4" style={{ color: '#10B981' }} />
          <h3 className="font-black text-sm" style={{ color: textPrimary }}>
            Branch Audit — {viewMode === 'single'
              ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} - ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
          </h3>
          <span
            className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color: '#10B981', backgroundColor: 'rgba(16,185,129,0.12)' }}
          >
            {logicalBranchCount} Branches
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              {viewMode === 'range'
                ? `No reports found for ${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} - ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} (or all are hidden)`
                : 'No reports found for this date (or all are hidden)'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '1600px' }}>
              <thead>
                <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                  <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider sticky left-0 z-10" style={{ color: textMuted, backgroundColor: inputBg }}>#</th>
                  {columns.map(col => (
                    <th 
                      key={col.key} 
                      className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity select-none" 
                      style={{ color: textMuted }}
                      onClick={() => handleSort(col.key)}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {sortConfig?.key === col.key ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <div className="w-3 h-3" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => {
                  const isAbove        = row.remarks === 'ABOVE QUOTA'
                  const noRecord       = row.status  === 'NO RECORD' || row.status === 'NO REPORT' || row.status === 'NO SCHED'
                  const remarksNoSched = row.remarks === 'NO SCHED'
                  return (
                    <tr
                      key={idx}
                      id={`audit-row-${idx}`}
                      style={{ borderBottom: `1px solid ${border}` }}
                      className="transition-colors cursor-pointer group"
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = rowHover)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      onClick={() => openDrilldown((row.logicalBranchName ?? row.branchName).trim())}
                    >
                      {/* Row # */}
                      <td className="px-3 py-3 font-bold sticky left-0" style={{ color: textMuted, backgroundColor: cardBg }}>{idx + 1}</td>

                      {/* Branch */}
                      <td className="px-3 py-3 font-black whitespace-nowrap" style={{ color: textPrimary }}>
                        <div className="flex items-center gap-2">
                          {row.branchName}
                          <button 
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/10 text-red-400"
                            onClick={(e) => { e.stopPropagation(); toggleHideBranch(row.branchName); }}
                            title="Hide Branch"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Time */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>{row.timeUploaded || '—'}</td>

                      {/* Status — independent of Remarks */}
                      <td className="px-3 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full font-bold text-[10px] uppercase whitespace-nowrap"
                          style={noRecord
                            ? { backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }
                            : { backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }
                          }
                        >
                          {noRecord ? 'No Record' : 'Checked'}
                        </span>
                      </td>

                      {/* Gross Sales */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: textPrimary }}>₱{peso(row.grossSales)}</td>

                      {/* Target Quota */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#8B5CF6', fontWeight: 700 }}>₱{peso(row.targetDailyQuota)}</td>

                      {/* Difference */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {noRecord ? (
                          <span style={{ color: textMuted }}>—</span>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded font-black"
                            style={{ color: isAbove ? '#10B981' : '#EF4444' }}
                          >
                            {isAbove ? '+' : ''}₱{peso(row.difference)}
                          </span>
                        )}
                      </td>

                      {/* Remarks — traffic light (independent of Status) */}
                      <td className="px-3 py-3">
                        <span
                          className="px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider whitespace-nowrap"
                          style={remarksNoSched
                            ? { backgroundColor: 'rgba(148,163,184,0.18)', color: '#94A3B8' }
                            : noRecord
                              ? { backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                              : isAbove
                                ? { backgroundColor: 'rgba(16,185,129,0.18)', color: '#10B981' }
                                : { backgroundColor: 'rgba(239,68,68,0.18)', color: '#EF4444' }
                          }
                        >
                          {remarksNoSched ? 'No Sched' : noRecord ? 'No Record' : row.remarks}
                        </span>
                      </td>

                      {/* COH Prev Day */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>₱{peso(row.cohPreviousDay)}</td>
                      {/* Fund from HO */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>₱{peso(row.fundFromHo)}</td>
                      {/* Cash Returns */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>₱{peso(row.cashReturns)}</td>
                      {/* Total COH/CFD */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: textPrimary }}>₱{peso(row.totalCohCfd)}</td>

                      {/* Cash Collection */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: '#10B981' }}>₱{peso(row.totalCashCollection)}</td>
                      {/* Online Collection */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: '#3B82F6' }}>₱{peso(row.totalOnlineCollection)}</td>

                      {/* Total Expenses — clickable */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap">
                        <button
                          id={`expense-drilldown-${idx}`}
                          onClick={e => { e.stopPropagation(); openDrilldown((row.logicalBranchName ?? row.branchName).trim()) }}
                          className="flex items-center gap-1 transition-opacity hover:opacity-80"
                          style={{ color: '#EF4444' }}
                        >
                          ₱{peso(row.totalExpenses)}
                          <Receipt className="w-3 h-3" />
                        </button>
                      </td>

                      {/* Units */}
                      <td className="px-3 py-3 text-center font-bold" style={{ color: textPrimary }}>{row.totalUnitsInstalledServiced}</td>
                      {/* Cancelled */}
                      <td className="px-3 py-3 text-center" style={{ color: row.totalCancelled > 0 ? '#EF4444' : textMuted }}>{row.totalCancelled}</td>
                      {/* Free Install */}
                      <td className="px-3 py-3 text-center" style={{ color: textMuted }}>{row.totalUnitsFreeInstall}</td>

                      {/* For Collection */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: '#F59E0B' }}>₱{peso(row.forCollection)}</td>
                      {/* Rebates */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>₱{peso(row.rebatesForCollection)}</td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Totals footer */}
              <tfoot>
                <tr style={{ borderTop: `2px solid ${border}`, backgroundColor: inputBg }}>
                  <td className="px-3 py-3" colSpan={4} />
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#3B82F6' }}>₱{peso(totals.grossSales)}</td>
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#8B5CF6' }}>₱{peso(totals.targetDailyQuota)}</td>
                  <td colSpan={5} />
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#10B981' }}>₱{peso(totals.totalCashCollection)}</td>
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#3B82F6' }}>₱{peso(totals.totalOnlineCollection)}</td>
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#EF4444' }}>₱{peso(totals.totalExpenses)}</td>
                  <td colSpan={3} />
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#F59E0B' }}>₱{peso(totals.forCollection)}</td>
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: textMuted }}>₱{peso(totals.rebatesForCollection)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Total For Collection Banner ─────────────────────────────── */}
      {!loading && totals.forCollection > 0 && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between"
          style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <span className="text-sm font-bold uppercase tracking-wider" style={{ color: '#F59E0B' }}>Total for Collection</span>
          <span className="text-xl font-black" style={{ color: '#F59E0B' }}>₱{peso(totals.forCollection)}</span>
        </div>
      )}

      {/* ── Drilldown Modal ─────────────────────────────────────────── */}
      {drilldown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={() => setDrilldown(null)}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-lg flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4" style={{ color: '#10B981' }} />
                <h4 className="font-black text-sm" style={{ color: textPrimary }}>{drilldown.branchName} — Expense Detail</h4>
              </div>
              <button
                id="drilldown-close-btn"
                onClick={() => setDrilldown(null)}
                className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400"
                style={{ color: textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5">
              {drillLoading ? (
                <div className="flex flex-col gap-2">
                  {[1,2,3].map(i => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />)}
                </div>
              ) : drilldown.items.length === 0 && drilldown.auditExpenses.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <Receipt className="w-8 h-8 opacity-20" style={{ color: textMuted }} />
                  <p className="text-sm" style={{ color: textMuted }}>No expense items recorded</p>
                </div>
              ) : (
                <div className="flex flex-col gap-8">
                  {/* API Drilldown Items */}
                  {drilldown.items.length > 0 && (
                    <div>
                      <h5 className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: textMuted }}>Summary Breakdown</h5>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${border}` }}>
                            {['Type', 'Description', 'Amount'].map(h => (
                              <th key={h} className="pb-2 text-left text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {drilldown.items.map((item, i) => {
                            const typeColor = item.type === 'EXPENSE' ? '#EF4444' : item.type === 'PURCHASE' ? '#F59E0B' : item.type === 'CASH_SALE' ? '#10B981' : '#3B82F6'
                            return (
                              <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                                <td className="py-2.5 pr-3">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ backgroundColor: `${typeColor}18`, color: typeColor }}>
                                    {item.type.replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-3 text-xs" style={{ color: textPrimary }}>{item.description}</td>
                                <td className="py-2.5 font-black text-xs whitespace-nowrap" style={{ color: typeColor }}>₱{peso(item.amount)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Excel-like Audit Expenses Details */}
                  {drilldown.auditExpenses.length > 0 && (
                    <div>
                      <h5 className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#10B981' }}>Detailed Audit Expenses (Excel format)</h5>
                      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${border}` }}>
                        <table className="w-full text-xs min-w-[700px]">
                          <thead>
                            <tr style={{ backgroundColor: `rgba(16,185,129,0.13)` }}>
                              {['DATE', 'INCURRED BY', 'DESCRIPTION', 'COMPANY', 'RECEIPT NO', 'AMOUNT', 'CATEGORY', 'SOURCE'].map((h) => (
                                <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {drilldown.auditExpenses.map((row) => (
                              <tr key={row.id} style={{ borderTop: `1px solid ${border}` }}>
                                <td className="px-3 py-2 whitespace-nowrap" style={{ color: textPrimary }}>{row.date}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary }}>{row.incurredBy}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary }}>{row.description}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary }}>{row.company}</td>
                                <td className="px-3 py-2" style={{ color: textMuted }}>{row.receiptNo || '—'}</td>
                                <td className="px-3 py-2 font-black" style={{ color: '#EF4444' }}>₱{peso(row.amount)}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary }}>{row.expenseCategory}</td>
                                <td className="px-3 py-2" style={{ color: textMuted }}>{row.sourceOfFunds || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
