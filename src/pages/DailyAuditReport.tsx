import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart2, CalendarDays, TrendingUp, TrendingDown,
  AlertTriangle, X, Receipt, ChevronRight, FileText, Eye, EyeOff,
  ArrowUp, ArrowDown, Trophy, Trash2,
  Minimize2, Maximize2, Printer
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import { loadAuditExpenses } from '../utils/auditExpenseStorage'
import type { AuditExpense } from '../types/auditExpense'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditRow {
  id?: string | null
  branchId: string
  auditLine?: string | null
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Component ─────────────────────────────────────────────────────────────────

// Helper to convert backend time string to HH:mm for native time input
const parseTimeForInput = (t: string | null | undefined) => {
  if (!t || t === '—' || t === 'N/A' || t === 'NO SCHED') return ''
  const match = t.match(/(\d+):(\d+)\s*(AM|PM)?/i)
  if (match) {
    let [, h, m, ampm] = match
    let hr = parseInt(h)
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hr < 12) hr += 12
      if (ampm.toUpperCase() === 'AM' && hr === 12) hr = 0
    }
    return `${hr.toString().padStart(2, '0')}:${m}`
  }
  return t
}

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
  const [clearing, setClearing]   = useState(false)
  const [viewMode, setViewMode]   = useState<'single' | 'range'>('single')

  const [date, setDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [rangeTo, setRangeTo] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null)
  const [rowExpenses, setRowExpenses] = useState<{ items: DrilldownItem[]; auditExpenses: AuditExpense[] } | null>(null)
  const [rowExpensesLoading, setRowExpensesLoading] = useState(false)
  const [hiddenBranches, setHiddenBranches] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [compactView, setCompactView] = useState(false)

  // Edit state
  // Edit state
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const rowKey = (row: AuditRow) => `${row.branchId}:${row.auditLine || ''}`

  const startEditing = (row: AuditRow, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingRowKey(rowKey(row))
    setEditValues({
      timeUploaded: parseTimeForInput(row.timeUploaded),
      targetDailyQuota: String(row.targetDailyQuota || 0).replace(/,/g, ''),
      cohPreviousDay: String(row.cohPreviousDay || 0).replace(/,/g, ''),
      fundFromHo: String(row.fundFromHo || 0).replace(/,/g, ''),
      cashReturns: String(row.cashReturns || 0).replace(/,/g, ''),
      totalCashCollection: String(row.totalCashCollection || 0).replace(/,/g, ''),
      totalOnlineCollection: String(row.totalOnlineCollection || 0).replace(/,/g, ''),
      totalExpenses: String(row.totalExpenses || 0).replace(/,/g, ''),
      totalUnitsInstalledServiced: String(row.totalUnitsInstalledServiced || 0),
      totalCancelled: String(row.totalCancelled || 0),
      totalUnitsFreeInstall: String(row.totalUnitsFreeInstall || 0),
      forCollection: String(row.forCollection || 0).replace(/,/g, ''),
      rebatesForCollection: String(row.rebatesForCollection || 0).replace(/,/g, ''),
    })
  }

  const handleSaveRow = async (row: AuditRow, e: React.MouseEvent) => {
    e.stopPropagation()
    setSaving(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const payload = {
        id: row.id,
        branchId: row.branchId,
        date: viewMode === 'single' ? date : rangeFrom,
        auditLine: row.auditLine,
        excelTimeUploaded: editValues.timeUploaded || '',
        targetDailyQuota:           parseFloat(editValues.targetDailyQuota) || 0,
        cohPreviousDay:             parseFloat(editValues.cohPreviousDay) || 0,
        fundFromHo:                 parseFloat(editValues.fundFromHo) || 0,
        cashReturns:                parseFloat(editValues.cashReturns) || 0,
        totalCashCollection:        parseFloat(editValues.totalCashCollection) || 0,
        totalOnlineCollection:      parseFloat(editValues.totalOnlineCollection) || 0,
        totalExpenses:              parseFloat(editValues.totalExpenses) || 0,
        totalUnitsInstalledServiced:parseInt(editValues.totalUnitsInstalledServiced) || 0,
        totalCancelled:             parseInt(editValues.totalCancelled) || 0,
        totalUnitsFreeInstall:      parseInt(editValues.totalUnitsFreeInstall) || 0,
        forCollection:              parseFloat(editValues.forCollection) || 0,
        rebatesForCollection:       parseFloat(editValues.rebatesForCollection) || 0,
      }
      const res = await fetch(`${API_BASE_URL}/v1/reports/audit-summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setEditingRowKey(null)
        fetchAudit()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Save failed (HTTP ${res.status})`)
      }
    } catch { alert('Failed to save changes') }
    finally { setSaving(false) }
  }

  const role = (user?.role || '').toLowerCase()
  const isManagerOrStaff = role === 'manager' || role === 'staff'
  const isManager = role === 'manager'
  const isAdmin = role === 'admin'
  const canImportExcel = isAdmin || isManager
  const canEdit = isAdmin || isManager

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

  const handleClearDate = async () => {
    const targetDate = viewMode === 'single' ? date : rangeFrom
    const prettyDate = viewMode === 'single'
      ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const confirmationMsg = isManager
      ? `Are you sure you want to clear your branch's daily report for ${prettyDate}? This cannot be undone.`
      : `Are you sure you want to clear ALL branch reports for ${prettyDate}? This will permanently delete all records for this date.`
    if (!window.confirm(confirmationMsg)) return
    setClearing(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/audit-summary?date=${encodeURIComponent(targetDate)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { alert('Data cleared successfully.'); fetchAudit() }
      else { const error = await res.json().catch(() => ({})); alert(error.error || `Clear failed (HTTP ${res.status})`) }
    } catch { alert('Network error during delete operation') }
    finally { setClearing(false) }
  }

  const fetchRowExpenses = async (branchName: string) => {
    setRowExpensesLoading(true)
    const allExpenses = await loadAuditExpenses()
    const dObj = viewMode === 'single' ? new Date(date + 'T00:00:00') : new Date(rangeFrom + 'T00:00:00')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const format1 = `${dObj.getDate()}-${months[dObj.getMonth()]}-${String(dObj.getFullYear()).slice(-2)}`
    const format2 = `${String(dObj.getDate()).padStart(2, '0')}-${months[dObj.getMonth()]}-${String(dObj.getFullYear()).slice(-2)}`
    const isoFormat = dObj.toISOString().split('T')[0]
    const matchedExpenses = allExpenses.filter(e =>
      e.branchName.toLowerCase() === branchName.toLowerCase() &&
      (e.date === format1 || e.date === format2 || e.date === isoFormat)
    )
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/items?branchName=${encodeURIComponent(branchName)}&date=${isoFormat}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setRowExpenses({ items: await res.json(), auditExpenses: matchedExpenses })
      } else {
        setRowExpenses({ items: [], auditExpenses: matchedExpenses })
      }
    } catch {
      setRowExpenses({ items: [], auditExpenses: matchedExpenses })
    } finally {
      setRowExpensesLoading(false)
    }
  }

  const toggleHideBranch = (branchName: string) => {
    setHiddenBranches(prev => prev.includes(branchName) ? prev.filter(b => b !== branchName) : [...prev, branchName])
  }

  let visibleRows = rows.filter(r => !hiddenBranches.includes(r.branchName))

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

  // A small styled input for edit mode
  const renderEditInput = (field: string, isInt = false, color?: string) => (
    <input
      type="text"
      inputMode={isInt ? 'numeric' : 'decimal'}
      value={editValues[field] || ''}
      onChange={e => setEditValues(prev => ({ ...prev, [field]: e.target.value.replace(/,/g, '') }))}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Escape') setEditingRowKey(null)
      }}
      disabled={saving}
      style={{
        width: compactView ? '44px' : '70px',
        background: 'transparent',
        border: 'none',
        borderBottom: `1px solid ${isLight ? '#93C5FD' : '#3B82F6'}`,
        outline: 'none',
        textAlign: 'right',
        color: color || textPrimary,
        fontSize: 'inherit',
        padding: '0 1px',
        opacity: saving ? 0.5 : 1,
      }}
    />
  )

  const isEditing = (row: AuditRow) => editingRowKey === rowKey(row)

  return (
    <div className="flex flex-col gap-5 pb-8">

      {/* ── Thinner, Simpler Header Toolbar ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 py-1 no-print">
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
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
              <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              <input id="audit-date-picker" type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-transparent outline-none text-xs" style={{ color: textPrimary }} />
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {[{ val: rangeFrom, set: setRangeFrom }, { val: rangeTo, set: setRangeTo }].map((p, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                  <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                  <input type="date" value={p.val} onChange={e => p.set(e.target.value)}
                    className="bg-transparent outline-none text-xs" style={{ color: textPrimary }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {hiddenBranches.length > 0 && (
            <button type="button" onClick={() => setHiddenBranches([])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs border transition-all hover:scale-105"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#EF4444' }}>
              <Eye className="w-3.5 h-3.5" />Show {hiddenBranches.length} Hidden
            </button>
          )}

          <button id="audit-print-btn" type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs border transition-all hover:scale-105"
            style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>

          {canImportExcel && (
            <>
              <input type="file" accept=".xlsx,.xls" className="hidden" id="excel-import-input" onChange={handleImportExcel} />
              <button id="audit-import-btn" type="button"
                disabled={importing || (viewMode === 'range' && rangeFrom !== rangeTo)}
                onClick={() => document.getElementById('excel-import-input')?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs border transition-all hover:scale-105"
                style={{ backgroundColor: '#10B981', borderColor: '#10B981', color: '#fff',
                  opacity: importing || (viewMode === 'range' && rangeFrom !== rangeTo) ? 0.5 : 1 }}>
                <TrendingUp className={`w-3.5 h-3.5 ${importing ? 'animate-bounce' : ''}`} />
                {importing ? 'Importing…' : `Import Excel`}
              </button>
              <button id="audit-clear-btn" type="button"
                disabled={clearing || (viewMode === 'range' && rangeFrom !== rangeTo)}
                onClick={handleClearDate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs border transition-all hover:scale-105"
                style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444',
                  opacity: clearing || (viewMode === 'range' && rangeFrom !== rangeTo) ? 0.5 : 1 }}>
                <Trash2 className="w-3.5 h-3.5" />
                {clearing ? 'Clearing…' : 'Clear'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Print area enclosing KPI Counters and Table ─────────────────────────── */}
      <div className="print-area flex flex-col gap-5">

      {/* ── Smaller Cleaner KPI Counters Bar ─────────────────────────────────── */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-y-2 gap-x-6 px-4 py-2.5 rounded-xl border text-xs"
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
      {isManagerOrStaff && (
        <div className="rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs no-print"
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
          r.remarks === 'ABOVE QUOTA' && r.status !== 'NO SCHED' && r.status !== 'NO RECORD' && r.status !== 'NO REPORT'
        ).sort((a, b) => b.difference - a.difference)
        if (aboveQuotaBranches.length === 0) return null
        return (
          <div className="flex items-center gap-2.5 flex-wrap px-4 py-2.5 rounded-xl border no-print"
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

      {/* ── Audit Table ──────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

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
            onClick={() => { setCompactView(v => !v); setEditingRowKey(null) }}
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
                ? { minWidth: 'unset', fontSize: '10px', tableLayout: 'auto', width: '100%' }
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
                          padding: compactView ? '6px 5px' : '10px 12px',
                          whiteSpace: 'nowrap',
                          fontSize: compactView ? 9 : 10,
                          letterSpacing: '0.05em',
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
                  
                {viewMode === 'single' && canEdit && (
                    <th className="no-print" style={{ 
                      padding: compactView ? '6px 5px' : '10px 12px', 
                      width: compactView ? '30px' : '60px',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      backgroundColor: inputBg,
                    }} />
                  )}
                </tr>
              </thead>

              {/* ── Table Body ── */}
              <tbody>
                {visibleRows.map((row, idx) => {
                  const editing    = isEditing(row)
                  const isAbove    = row.remarks === 'ABOVE QUOTA'
                  const noRecord   = row.status === 'NO RECORD' || row.status === 'NO REPORT' || row.status === 'NO SCHED'
                  const noSched    = row.remarks === 'NO SCHED'
                  const p          = compactView ? '4px 5px' : '10px 12px'
                  const isSelected = selectedRow && `${selectedRow.branchId}:${selectedRow.auditLine || ''}` === `${row.branchId}:${row.auditLine || ''}`

                  return (
                    <tr
                      key={idx}
                      id={`audit-row-${idx}`}
                      onClick={() => {
                        if (editing) return
                        setSelectedRow(row)
                        setRowExpenses(null)
                        fetchRowExpenses((row.logicalBranchName ?? row.branchName).trim())
                      }}
                      onContextMenu={e => {
                        if (editing) return
                        e.preventDefault()
                        setSelectedRow(row)
                        setRowExpenses(null)
                        fetchRowExpenses((row.logicalBranchName ?? row.branchName).trim())
                      }}
                      style={{
                        borderBottom: `1px solid ${border}`,
                        backgroundColor: isSelected
                          ? (isLight ? '#E0F2FE' : '#1E293B')
                          : 'transparent',
                        cursor: editing ? 'pointer' : 'pointer'
                      }}
                      className="transition-colors group"
                      onMouseEnter={e => {
                        if (editingRowKey !== rowKey(row)) {
                          e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => {
                            td.style.backgroundColor = rowHover
                          })
                        }
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
                        {editing ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span style={{ color: textMuted, fontSize: compactView ? 8 : 9, minWidth: '14px' }}>{idx + 1}.</span>
                              <span style={{ fontSize: compactView ? 9 : undefined }}>{row.branchName}</span>
                            </div>
                            {viewMode === 'single' && (
                              <div className="flex items-center gap-1">
                                <span style={{ color: textMuted, fontSize: compactView ? 8 : 10 }}>Time:</span>
                                <input 
                                  type="time" 
                                  value={editValues.timeUploaded || ''}
                                  onChange={e => setEditValues(prev => ({ ...prev, timeUploaded: e.target.value }))}
                                  onClick={e => e.stopPropagation()}
                                  className="bg-transparent focus:outline-none"
                                  style={{ 
                                    color: textPrimary, 
                                    borderBottom: `1px solid ${inputBorder}`,
                                    width: compactView ? '55px' : '80px',
                                    fontSize: compactView ? 8 : 10
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span style={{ color: textMuted, fontSize: compactView ? 8 : 9, minWidth: '14px' }}>{idx + 1}.</span>
                              <span className="font-bold" style={{ fontSize: compactView ? 10 : 12 }}>{row.branchName}</span>
                              {!compactView && (
                                <button
                                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-red-400 ml-1 no-print"
                                  onClick={e => { e.stopPropagation(); toggleHideBranch(row.branchName) }}
                                  title="Hide branch"
                                >
                                  <EyeOff className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5" style={{ fontSize: compactView ? '8px' : '10px' }}>
                              <span style={{
                                display: 'inline-block',
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: noRecord ? '#EF4444' : '#10B981'
                              }} />
                              <span style={{ color: noRecord ? '#EF4444' : '#10B981', fontWeight: 600 }}>
                                {noSched
                                  ? (compactView ? 'No Sch' : 'No Sched')
                                  : noRecord
                                    ? (compactView ? 'No Trans' : 'No Transaction')
                                    : 'Checked'}
                              </span>
                              {!noRecord && row.timeUploaded && (
                                <span style={{ color: textMuted }}>
                                  • {row.timeUploaded}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* ④ Gross Sales */}
                      <td className="font-semibold" style={{ color: textPrimary, padding: p, whiteSpace: 'nowrap' }}>₱{peso(row.grossSales)}</td>

                      {/* ⑤ Target Quota */}
                      <td style={{ color: '#8B5CF6', fontWeight: 600, padding: p, whiteSpace: 'nowrap' }} >
                        {editing ? renderEditInput('targetDailyQuota', false, '#8B5CF6') : <>₱{peso(row.targetDailyQuota)}</>}
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
                            ...(noSched
                              ? { backgroundColor: 'rgba(148,163,184,0.15)', color: '#94A3B8' }
                              : noRecord
                                ? { backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }
                                : isAbove
                                  ? { backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }
                                  : { backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' })
                          }}>
                            {noSched
                              ? (compactView ? 'No Sch' : 'No Sched')
                              : noRecord
                                ? (compactView ? 'No Trans' : 'No Transaction')
                                : compactView && row.remarks === 'ABOVE QUOTA' ? 'ABOVE'
                                : compactView && row.remarks === 'BELOW QUOTA' ? 'BELOW'
                                : row.remarks}
                          </span>
                          {noRecord ? (
                            noSched ? null : <span style={{ color: textMuted }}>—</span>
                          ) : (
                            <span className="font-bold text-[11px]" style={{ color: isAbove ? '#10B981' : '#EF4444' }}>
                              {isAbove ? '+' : ''}₱{peso(row.difference)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* ⑧ COH Prev Day */}
                      <td style={{ color: textMuted, padding: p, whiteSpace: 'nowrap' }} >
                        {editing ? renderEditInput('cohPreviousDay') : <>₱{peso(row.cohPreviousDay)}</>}
                      </td>

                      {/* ⑨ Fund from HO */}
                      <td style={{ color: textMuted, padding: p, whiteSpace: 'nowrap' }} >
                        {editing ? renderEditInput('fundFromHo') : <>₱{peso(row.fundFromHo)}</>}
                      </td>

                      {/* ⑩ Cash Returns */}
                      <td style={{ color: textMuted, padding: p, whiteSpace: 'nowrap' }} >
                        {editing ? renderEditInput('cashReturns') : <>₱{peso(row.cashReturns)}</>}
                      </td>

                      {/* ⑪ Total COH/CFD */}
                      <td className="font-semibold" style={{ color: textPrimary, padding: p, whiteSpace: 'nowrap' }}>₱{peso(row.totalCohCfd)}</td>

                      {/* ⑫ Cash Collection */}
                      <td className="font-semibold" style={{ color: '#10B981', padding: p, whiteSpace: 'nowrap' }} >
                        {editing ? renderEditInput('totalCashCollection', false, '#10B981') : <>₱{peso(row.totalCashCollection)}</>}
                      </td>

                      {/* ⑬ Online Collection */}
                      <td className="font-semibold" style={{ color: '#3B82F6', padding: p, whiteSpace: 'nowrap' }} >
                        {editing ? renderEditInput('totalOnlineCollection', false, '#3B82F6') : <>₱{peso(row.totalOnlineCollection)}</>}
                      </td>

                      {/* ⑭ Total Expenses — clickable drilldown (but editable when editing) */}
                      <td className="font-semibold" style={{ padding: p, whiteSpace: 'nowrap' }}>
                        {editing
                          ? renderEditInput('totalExpenses', false, '#EF4444')
                          : (
                            <button
                              id={`expense-drilldown-${idx}`}
                              onClick={e => {
                                e.stopPropagation()
                                setSelectedRow(row)
                                setRowExpenses(null)
                                fetchRowExpenses((row.logicalBranchName ?? row.branchName).trim())
                              }}
                              className="flex items-center gap-1 hover:underline transition-opacity hover:opacity-75"
                              style={{ color: '#EF4444' }}
                            >
                              ₱{peso(row.totalExpenses)}
                            </button>
                          )}
                      </td>

                      {/* ⑱ For Collection */}
                      <td className="font-semibold" style={{ color: '#F59E0B', padding: p, whiteSpace: 'nowrap' }} >
                        {editing ? renderEditInput('forCollection', false, '#F59E0B') : <>₱{peso(row.forCollection)}</>}
                      </td>

                      {/* ⑲ Rebates */}
                      <td style={{ color: textMuted, padding: p, whiteSpace: 'nowrap' }}>
                        {editing ? renderEditInput('rebatesForCollection') : <>₱{peso(row.rebatesForCollection)}</>}
                      </td>

                      {/* ⑮ Units */}
                      <td className="text-center font-semibold" style={{ color: textPrimary, padding: p }} >
                        {editing ? renderEditInput('totalUnitsInstalledServiced', true) : row.totalUnitsInstalledServiced}
                      </td>

                      {/* ⑯ Cancelled */}
                      <td className="text-center" style={{ color: row.totalCancelled > 0 ? '#EF4444' : textMuted, padding: p }} >
                        {editing ? renderEditInput('totalCancelled', true, row.totalCancelled > 0 ? '#EF4444' : textMuted) : row.totalCancelled}
                      </td>

                      {/* ⑰ Free Install */}
                      <td className="text-center" style={{ color: textMuted, padding: p }} >
                        {editing ? renderEditInput('totalUnitsFreeInstall', true) : row.totalUnitsFreeInstall}
                      </td>

                      {/* ⑳ Actions */}
                      {viewMode === 'single' && canEdit && (
                        <td className="no-print" style={{ padding: p, textAlign: 'right' }}>
                          {editing ? (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={e => handleSaveRow(row, e)} disabled={saving} className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-[9px] font-bold rounded">
                                Save
                              </button>
                              <button onClick={e => { e.stopPropagation(); setEditingRowKey(null) }} disabled={saving} className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9px] font-bold rounded">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={e => startEditing(row, e)}
                              className="px-2 py-1 border border-slate-300 hover:bg-slate-100 text-slate-600 text-[9px] font-bold rounded transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      )}
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
                  {viewMode === 'single' && canEdit && <td className="no-print" />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── For Collection Banner ──────────────────────────────────── */}
      {!loading && totals.forCollection > 0 && (
        <div className="rounded-2xl p-4 flex items-center justify-between no-print"
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
            className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-2xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-emerald-500" />
                <div>
                  <h4 className="font-black text-base" style={{ color: textPrimary }}>
                    {selectedRow.branchName}
                  </h4>
                  <p className="text-[11px] font-semibold" style={{ color: textMuted }}>
                    {viewMode === 'single'
                      ? new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                      : `${new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedRow(null)}
                className="p-2 rounded-xl transition-colors hover:bg-red-500/10 hover:text-red-400" style={{ color: textMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Top status info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl p-3 border flex flex-col gap-1" style={{ backgroundColor: inputBg, borderColor: border }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Status</span>
                  <span style={{
                    alignSelf: 'start',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    ...(selectedRow.status === 'NO RECORD' || selectedRow.status === 'NO REPORT' || selectedRow.status === 'NO SCHED'
                      ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }
                      : { backgroundColor: 'rgba(16,185,129,0.1)', color: '#10B981' })
                  }}>
                    {selectedRow.remarks === 'NO SCHED'
                      ? 'NO SCHED'
                      : (selectedRow.status === 'NO RECORD' || selectedRow.status === 'NO REPORT')
                        ? 'NO TRANSACTION'
                        : selectedRow.status}
                  </span>
                </div>
                <div className="rounded-xl p-3 border flex flex-col gap-1" style={{ backgroundColor: inputBg, borderColor: border }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Time Uploaded</span>
                  <span className="text-xs font-bold" style={{ color: textPrimary }}>
                    {selectedRow.timeUploaded || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Main metrics grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Sales & Quota */}
                <div className="rounded-xl p-4 border flex flex-col gap-3" style={{ backgroundColor: inputBg, borderColor: border }}>
                  <div className="flex items-center gap-1.5 border-b pb-1.5" style={{ borderColor: border }}>
                    <BarChart2 className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>Sales Summary</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span style={{ color: textMuted }}>Gross Sales:</span>
                    <span className="font-bold text-right" style={{ color: textPrimary }}>₱{peso(selectedRow.grossSales)}</span>
                    <span style={{ color: textMuted }}>Target Quota:</span>
                    <span className="font-bold text-right" style={{ color: '#8B5CF6' }}>₱{peso(selectedRow.targetDailyQuota)}</span>
                    <span style={{ color: textMuted }}>Difference:</span>
                    <span className="font-bold text-right" style={{ color: selectedRow.remarks === 'ABOVE QUOTA' ? '#10B981' : '#EF4444' }}>
                      {selectedRow.remarks === 'ABOVE QUOTA' ? '+' : ''}₱{peso(selectedRow.difference)}
                    </span>
                    <span style={{ color: textMuted }}>Remarks:</span>
                    <span className="font-bold text-right" style={{
                      color: selectedRow.remarks === 'ABOVE QUOTA' ? '#10B981' : selectedRow.remarks === 'NO SCHED' ? textMuted : '#EF4444'
                    }}>
                      {selectedRow.remarks === 'NO SCHED'
                        ? 'NO SCHED'
                        : (selectedRow.remarks === 'NO RECORD' || selectedRow.remarks === 'NO REPORT')
                          ? 'NO TRANSACTION'
                          : selectedRow.remarks}
                    </span>
                  </div>
                </div>

                {/* 2. Cash Flow */}
                <div className="rounded-xl p-4 border flex flex-col gap-3" style={{ backgroundColor: inputBg, borderColor: border }}>
                  <div className="flex items-center gap-1.5 border-b pb-1.5" style={{ borderColor: border }}>
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>Cash Flow</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span style={{ color: textMuted }}>COH Prev Day:</span>
                    <span className="font-semibold text-right" style={{ color: textPrimary }}>₱{peso(selectedRow.cohPreviousDay)}</span>
                    <span style={{ color: textMuted }}>Fund from HO:</span>
                    <span className="font-semibold text-right" style={{ color: textPrimary }}>₱{peso(selectedRow.fundFromHo)}</span>
                    <span style={{ color: textMuted }}>Cash Returns:</span>
                    <span className="font-semibold text-right" style={{ color: textPrimary }}>₱{peso(selectedRow.cashReturns)}</span>
                    <span className="font-bold" style={{ color: textPrimary }}>Total COH/CFD:</span>
                    <span className="font-bold text-right" style={{ color: textPrimary }}>₱{peso(selectedRow.totalCohCfd)}</span>
                  </div>
                </div>

                {/* 3. Collections */}
                <div className="rounded-xl p-4 border flex flex-col gap-3" style={{ backgroundColor: inputBg, borderColor: border }}>
                  <div className="flex items-center gap-1.5 border-b pb-1.5" style={{ borderColor: border }}>
                    <Receipt className="w-4 h-4 text-purple-500" />
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>Collections</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span style={{ color: textMuted }}>Cash Collection:</span>
                    <span className="font-bold text-right" style={{ color: '#10B981' }}>₱{peso(selectedRow.totalCashCollection)}</span>
                    <span style={{ color: textMuted }}>Online Collection:</span>
                    <span className="font-bold text-right" style={{ color: '#3B82F6' }}>₱{peso(selectedRow.totalOnlineCollection)}</span>
                    <span style={{ color: textMuted }}>For Collection:</span>
                    <span className="font-bold text-right" style={{ color: '#F59E0B' }}>₱{peso(selectedRow.forCollection)}</span>
                    <span style={{ color: textMuted }}>Rebates:</span>
                    <span className="font-semibold text-right" style={{ color: textMuted }}>₱{peso(selectedRow.rebatesForCollection)}</span>
                  </div>
                </div>

                {/* 4. Operations */}
                <div className="rounded-xl p-4 border flex flex-col gap-3" style={{ backgroundColor: inputBg, borderColor: border }}>
                  <div className="flex items-center gap-1.5 border-b pb-1.5" style={{ borderColor: border }}>
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>Operations</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span style={{ color: textMuted }}>Units Installed/Serviced:</span>
                    <span className="font-bold text-right" style={{ color: textPrimary }}>{selectedRow.totalUnitsInstalledServiced}</span>
                    <span style={{ color: textMuted }}>Cancelled:</span>
                    <span className="font-bold text-right" style={{ color: selectedRow.totalCancelled > 0 ? '#EF4444' : textMuted }}>{selectedRow.totalCancelled}</span>
                    <span style={{ color: textMuted }}>Free Install:</span>
                    <span className="font-semibold text-right" style={{ color: textMuted }}>{selectedRow.totalUnitsFreeInstall}</span>
                  </div>
                </div>
              </div>

              {/* 5. Expense Breakdown details */}
              <div className="rounded-xl p-4 border flex flex-col gap-3" style={{ backgroundColor: inputBg, borderColor: border }}>
                <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: border }}>
                  <div className="flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>
                      Expenses Breakdown (₱{peso(selectedRow.totalExpenses)})
                    </span>
                  </div>
                </div>

                {rowExpensesLoading ? (
                  <div className="flex flex-col gap-2 py-4">
                    <div className="h-6 rounded animate-pulse" style={{ backgroundColor: border }} />
                    <div className="h-6 rounded animate-pulse" style={{ backgroundColor: border }} />
                  </div>
                ) : !rowExpenses || (rowExpenses.items.length === 0 && rowExpenses.auditExpenses.length === 0) ? (
                  <p className="text-xs text-center py-4" style={{ color: textMuted }}>No detailed expenses recorded for this row.</p>
                ) : (
                  <div className="flex flex-col gap-5 text-xs">
                    {rowExpenses.items.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: textMuted }}>Summary Breakdown</span>
                        <table className="w-full">
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${border}` }}>
                              <th className="pb-1 text-left text-[10px] font-bold uppercase" style={{ color: textMuted }}>Type</th>
                              <th className="pb-1 text-left text-[10px] font-bold uppercase" style={{ color: textMuted }}>Description</th>
                              <th className="pb-1 text-right text-[10px] font-bold uppercase" style={{ color: textMuted }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rowExpenses.items.map((item, i) => {
                              const tc = item.type === 'EXPENSE' ? '#EF4444' : item.type === 'PURCHASE' ? '#F59E0B' : item.type === 'CASH_SALE' ? '#10B981' : '#3B82F6'
                              return (
                                <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                                  <td className="py-1.5 pr-2">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ backgroundColor: `${tc}18`, color: tc }}>
                                      {item.type.replace('_',' ')}
                                    </span>
                                  </td>
                                  <td className="py-1.5" style={{ color: textPrimary }}>{item.description}</td>
                                  <td className="py-1.5 text-right font-bold" style={{ color: tc }}>₱{peso(item.amount)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {rowExpenses.auditExpenses.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#10B981' }}>Detailed Audit Expenses (Excel format)</span>
                        <div className="overflow-x-auto border rounded-lg" style={{ borderColor: border }}>
                          <table className="w-full min-w-[500px]">
                            <thead>
                              <tr style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                                {['Date', 'Incurred By', 'Description', 'Amount', 'Category'].map(h => (
                                  <th key={h} className="text-left px-2 py-1 text-[9px] font-bold uppercase" style={{ color: textMuted }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rowExpenses.auditExpenses.map((row, i) => (
                                <tr key={i} style={{ borderTop: `1px solid ${border}` }}>
                                  <td className="px-2 py-1.5" style={{ color: textPrimary }}>{row.date}</td>
                                  <td className="px-2 py-1.5" style={{ color: textPrimary }}>{row.incurredBy}</td>
                                  <td className="px-2 py-1.5" style={{ color: textPrimary }}>{row.description}</td>
                                  <td className="px-2 py-1.5 font-bold text-red-500">₱{peso(row.amount)}</td>
                                  <td className="px-2 py-1.5" style={{ color: textPrimary }}>{row.expenseCategory}</td>
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
        </div>
      )}

    </div>
  )
}
