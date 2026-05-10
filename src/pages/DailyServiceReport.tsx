import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Wrench, RefreshCw, CalendarDays, Upload, Plus, Edit3, Trash2,
  X, Search, AlertTriangle, Building2,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string
  branchId: string | null
  branchName: string | null
  reportDate: string | null
  customerName: string | null
  customerAddress: string | null
  customerPhone: string | null
  serviceType: string | null
  unitBrandModel: string | null
  unitSerial: string | null
  quantity: number | null
  technicianName: string | null
  scheduleTime: string | null
  timeStarted: string | null
  timeEnded: string | null
  amountCharged: number | null
  paymentStatus: string | null
  jobStatus: string | null
  remarks: string | null
}

interface BranchOption { id: string; name: string }

const SERVICE_TYPES = ['INSTALLATION', 'REPAIR', 'MAINTENANCE', 'CHECK_UP', 'RELOCATION'] as const
const PAYMENT_STATUSES = ['PAID', 'UNPAID', 'PARTIAL'] as const
const JOB_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] as const

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const blankRow = (date: string, branchId?: string | null): Partial<ServiceRow> => ({
  reportDate: date,
  branchId: branchId ?? null,
  customerName: '',
  customerAddress: '',
  customerPhone: '',
  serviceType: 'INSTALLATION',
  unitBrandModel: '',
  unitSerial: '',
  quantity: 1,
  technicianName: '',
  scheduleTime: '',
  timeStarted: '',
  timeEnded: '',
  amountCharged: 0,
  paymentStatus: 'UNPAID',
  jobStatus: 'SCHEDULED',
  remarks: '',
})

// ── Component ────────────────────────────────────────────────────────────────

export default function DailyServiceReport() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const rowHover    = isLight ? '#f1f5f9' : '#0f1e36'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const canImport = isAdmin || isManager
  const canDelete = isAdmin || isManager
  const canEdit = isAdmin || isManager || role === 'staff' || role === 'employee'

  const [rows, setRows] = useState<ServiceRow[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [date, setDate] = useState(todayLocal)
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily')
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Modal state for create / edit
  const [editing, setEditing] = useState<Partial<ServiceRow> | null>(null)

  // ── Week helpers ──────────────────────────────────────────────────────────
  const weekRange = useMemo(() => {
    const d = new Date(date + 'T00:00:00')
    const dow = d.getDay()
    const offsetToMonday = dow === 0 ? -6 : 1 - dow
    const monday = new Date(d); monday.setDate(d.getDate() + offsetToMonday)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    const pretty = (x: Date) => x.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return { label: `${pretty(monday)} – ${pretty(sunday)}, ${sunday.getFullYear()}` }
  }, [date])

  // ── Data loaders ──────────────────────────────────────────────────────────
  const fetchBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list = (data?.data || []) as { id: string; name: string }[]
      setBranches(list.map(b => ({ id: b.id, name: b.name })))
    } catch (e) { console.error(e) }
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ date, weekly: String(viewMode === 'weekly') })
      if (branchFilter) params.set('branchId', branchFilter)
      const res = await fetch(`${API_BASE_URL}/v1/service-reports?${params.toString()}`, {
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
  }, [date, viewMode, branchFilter])

  useEffect(() => { fetchBranches() }, [fetchBranches])
  useEffect(() => { fetchRows() }, [fetchRows])

  // ── Excel import ──────────────────────────────────────────────────────────
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) { e.target.value = ''; return }

    const targetDate = date
    const pretty = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const ok = window.confirm(
      `Import "${file.name}" as the Daily Service Report for ${pretty}?\n\n` +
      `Existing service rows for ${pretty} will be REPLACED.`
    )
    if (!ok) { e.target.value = ''; return }

    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const url = `${API_BASE_URL}/v1/service-reports/import?date=${encodeURIComponent(targetDate)}`
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (res.ok) {
        const result = await res.json()
        const importedDate = (result?.date as string) || targetDate
        const sheetMsg = result?.sheet ? ` (sheet "${result.sheet}")` : ''
        alert(`${result.message || 'Import successful!'}${sheetMsg}`)
        if (importedDate !== date) setDate(importedDate); else fetchRows()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Import failed (HTTP ${res.status})`)
      }
    } catch (err) {
      console.error(err); alert('Network error during import')
    } finally {
      setImporting(false); e.target.value = ''
    }
  }

  // ── Save (create / update) ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editing) return
    if (!editing.customerName || !editing.customerName.trim()) {
      alert('Customer name is required'); return
    }
    if (!editing.branchId && !isManager) {
      alert('Please choose a branch'); return
    }
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const isNew = !editing.id
      const url = isNew
        ? `${API_BASE_URL}/v1/service-reports`
        : `${API_BASE_URL}/v1/service-reports/${editing.id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Save failed (HTTP ${res.status})`)
        return
      }
      setEditing(null)
      fetchRows()
    } catch (e) {
      console.error(e); alert('Network error while saving')
    }
  }

  const handleDelete = async (row: ServiceRow) => {
    if (!window.confirm(`Delete service record for ${row.customerName}?`)) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/service-reports/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Delete failed (HTTP ${res.status})`)
        return
      }
      fetchRows()
    } catch (e) {
      console.error(e); alert('Network error while deleting')
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    if (!searchQuery) return rows
    const q = searchQuery.toLowerCase()
    return rows.filter(r =>
      (r.customerName || '').toLowerCase().includes(q)
      || (r.branchName || '').toLowerCase().includes(q)
      || (r.technicianName || '').toLowerCase().includes(q)
      || (r.unitBrandModel || '').toLowerCase().includes(q)
      || (r.serviceType || '').toLowerCase().includes(q)
    )
  }, [rows, searchQuery])

  const totals = useMemo(() => visible.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      qty: acc.qty + (r.quantity || 0),
      amount: acc.amount + (r.amountCharged || 0),
      completed: acc.completed + (r.jobStatus === 'COMPLETED' ? 1 : 0),
      cancelled: acc.cancelled + (r.jobStatus === 'CANCELLED' ? 1 : 0),
    }),
    { count: 0, qty: 0, amount: 0, completed: 0, cancelled: 0 }
  ), [visible])

  const statusColor = (s: string | null) => {
    switch (s) {
      case 'COMPLETED':   return '#10B981'
      case 'IN_PROGRESS': return '#3B82F6'
      case 'CANCELLED':   return '#EF4444'
      case 'RESCHEDULED': return '#F59E0B'
      case 'SCHEDULED':   return '#8B5CF6'
      default: return textMuted
    }
  }

  const paymentColor = (p: string | null) => p === 'PAID' ? '#10B981' : p === 'PARTIAL' ? '#F59E0B' : '#EF4444'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pb-8">

      {/* Header */}
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-[0.05] pointer-events-none"
             style={{ background: 'radial-gradient(circle, #3B82F6, transparent)' }} />
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#3B82F6' }}>
            Service Hub
          </p>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            Daily Service Report
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            Per-branch service / installation visits, customer details &amp; technician schedule
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
               style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
            <Search className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
            <input
              type="text"
              placeholder="Search customer / tech…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-xs w-32 md:w-44"
              style={{ color: textPrimary }}
            />
          </div>

          {/* Branch filter (admin only — managers always see their own branch) */}
          {isAdmin && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                 style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
              <Building2 className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="bg-transparent outline-none text-xs"
                style={{ color: textPrimary }}
              >
                <option value="" style={{ color: '#000' }}>All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Daily / Weekly toggle */}
          <div className="flex items-center rounded-xl text-xs font-bold overflow-hidden"
               style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
            {(['daily', 'weekly'] as const).map(mode => {
              const active = viewMode === mode
              return (
                <button key={mode} type="button" onClick={() => setViewMode(mode)}
                        className="px-3 py-2 transition-colors capitalize"
                        style={{ backgroundColor: active ? '#3B82F6' : 'transparent', color: active ? '#fff' : textMuted }}>
                  {mode}
                </button>
              )
            })}
          </div>

          {/* Date picker */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
               style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
            <CalendarDays className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                   className="bg-transparent outline-none text-xs" style={{ color: textPrimary }} />
            {viewMode === 'weekly' && (
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3B82F6' }}>
                {weekRange.label}
              </span>
            )}
          </div>

          {/* Refresh */}
          <button type="button" onClick={fetchRows}
                  className="p-2 rounded-xl text-xs font-bold transition-all hover:scale-105"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
                  title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Add */}
          {canEdit && (
            <button type="button"
                    onClick={() => setEditing(blankRow(date, isManager ? user?.branchId ?? null : ''))}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                    style={{ backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)', color: '#3B82F6' }}>
              <Plus className="w-4 h-4" /> Add Service
            </button>
          )}

          {/* Excel Import */}
          {canImport && (
            <>
              <input type="file" accept=".xlsx,.xls" id="svc-import-input" className="hidden" onChange={handleImportExcel} />
              <button id="svc-import-btn" type="button" disabled={importing || viewMode === 'weekly'}
                      onClick={() => document.getElementById('svc-import-input')?.click()}
                      title={viewMode === 'weekly'
                        ? 'Excel import is per-day. Switch to Daily view to import.'
                        : isManager
                          ? `Import only YOUR branch's rows into ${date}`
                          : `Import every branch into ${date}`}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                      style={{
                        backgroundColor: '#3B82F6', borderColor: '#3B82F6', color: '#fff',
                        opacity: (importing || viewMode === 'weekly') ? 0.5 : 1,
                        cursor: viewMode === 'weekly' ? 'not-allowed' : undefined,
                      }}>
                <Upload className={`w-4 h-4 ${importing ? 'animate-bounce' : ''}`} />
                {importing
                  ? 'Importing…'
                  : `${isManager ? 'Import My Branch' : 'Import Excel'} for ${new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI strip */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Service Records', value: totals.count.toString(), color: '#3B82F6' },
            { label: 'Total Units',     value: totals.qty.toString(),   color: '#8B5CF6' },
            { label: 'Total Charged',   value: `₱${peso(totals.amount)}`, color: '#10B981' },
            { label: 'Completed',       value: totals.completed.toString(), color: '#10B981' },
            { label: 'Cancelled',       value: totals.cancelled.toString(), color: '#EF4444' },
          ].map((k, i) => (
            <div key={i} className="rounded-2xl p-4 relative overflow-hidden"
                 style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: k.color }} />
              <div className="pl-2">
                <div className="text-lg font-black tracking-tight" style={{ color: k.color }}>{k.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textMuted }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}` }}>
          <Wrench className="w-4 h-4" style={{ color: '#3B82F6' }} />
          <h3 className="font-black text-sm" style={{ color: textPrimary }}>
            Service Records — {viewMode === 'weekly'
              ? `Week of ${weekRange.label}`
              : new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                style={{ color: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.12)' }}>
            {visible.length} records
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              No service records for {viewMode === 'weekly' ? weekRange.label : 'this date'}
            </p>
            {canEdit && (
              <button onClick={() => setEditing(blankRow(date, isManager ? user?.branchId ?? null : ''))}
                      className="text-xs font-bold text-[#3B82F6] hover:underline">+ Add the first one</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '1700px' }}>
              <thead>
                <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                  {['#', 'Date', 'Branch', 'Customer', 'Address', 'Phone', 'Service', 'Unit / Model', 'Serial', 'Qty',
                    'Technician', 'Schedule', 'Started', 'Ended', 'Amount', 'Payment', 'Status', 'Remarks', 'Actions'
                  ].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider whitespace-nowrap"
                        style={{ color: textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, idx) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${border}` }}
                      className="transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = rowHover)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <td className="px-3 py-3 font-bold" style={{ color: textMuted }}>{idx + 1}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>{r.reportDate || '—'}</td>
                    <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: textPrimary }}>{r.branchName || '—'}</td>
                    <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: textPrimary }}>{r.customerName || '—'}</td>
                    <td className="px-3 py-3 max-w-xs truncate" title={r.customerAddress || ''} style={{ color: textMuted }}>{r.customerAddress || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>{r.customerPhone || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#8B5CF6', fontWeight: 700 }}>{r.serviceType || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: textPrimary }}>{r.unitBrandModel || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>{r.unitSerial || '—'}</td>
                    <td className="px-3 py-3 text-center font-bold" style={{ color: textPrimary }}>{r.quantity ?? 1}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: textPrimary }}>{r.technicianName || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>{r.scheduleTime || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>{r.timeStarted || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>{r.timeEnded || '—'}</td>
                    <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: '#10B981' }}>₱{peso(r.amountCharged)}</td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase whitespace-nowrap"
                            style={{ color: paymentColor(r.paymentStatus), backgroundColor: `${paymentColor(r.paymentStatus)}1f` }}>
                        {r.paymentStatus || 'UNPAID'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase whitespace-nowrap"
                            style={{ color: statusColor(r.jobStatus), backgroundColor: `${statusColor(r.jobStatus)}1f` }}>
                        {r.jobStatus || 'SCHEDULED'}
                      </span>
                    </td>
                    <td className="px-3 py-3 max-w-[16rem] truncate" title={r.remarks || ''} style={{ color: textMuted }}>{r.remarks || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {canEdit && (
                          <button onClick={() => setEditing(r)}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10 text-blue-400"
                                  title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(r)}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 text-red-400"
                                  title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit / Create Modal ─────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
             onClick={() => setEditing(null)}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
               onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm" style={{ color: textPrimary }}>
                {editing.id ? 'Edit Service Record' : 'New Service Record'}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Branch (admins only — managers locked to their branch) */}
              <Field label="Branch" required={!isManager}>
                {isManager ? (
                  <input value={branches.find(b => b.id === user?.branchId)?.name || 'Your Branch'} disabled
                         className="w-full rounded-lg px-3 py-2 text-xs font-semibold opacity-70"
                         style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                ) : (
                  <select value={editing.branchId || ''}
                          onChange={e => setEditing({ ...editing, branchId: e.target.value })}
                          className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                    <option value="" style={{ color: '#000' }}>— Choose branch —</option>
                    {branches.map(b => <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>)}
                  </select>
                )}
              </Field>

              <Field label="Date" required>
                <input type="date" value={editing.reportDate || ''}
                       onChange={e => setEditing({ ...editing, reportDate: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>

              <Field label="Customer Name" required>
                <input value={editing.customerName || ''} onChange={e => setEditing({ ...editing, customerName: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Phone">
                <input value={editing.customerPhone || ''} onChange={e => setEditing({ ...editing, customerPhone: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Address" full>
                <input value={editing.customerAddress || ''} onChange={e => setEditing({ ...editing, customerAddress: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>

              <Field label="Service Type">
                <select value={editing.serviceType || ''} onChange={e => setEditing({ ...editing, serviceType: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                  {SERVICE_TYPES.map(t => <option key={t} value={t} style={{ color: '#000' }}>{t}</option>)}
                </select>
              </Field>
              <Field label="Quantity">
                <input type="number" min={1} value={editing.quantity ?? 1}
                       onChange={e => setEditing({ ...editing, quantity: parseInt(e.target.value || '1', 10) })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>

              <Field label="Unit / Brand / Model">
                <input value={editing.unitBrandModel || ''} onChange={e => setEditing({ ...editing, unitBrandModel: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Serial Number">
                <input value={editing.unitSerial || ''} onChange={e => setEditing({ ...editing, unitSerial: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>

              <Field label="Technician">
                <input value={editing.technicianName || ''} onChange={e => setEditing({ ...editing, technicianName: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Schedule Time (e.g. 9:00 AM)">
                <input value={editing.scheduleTime || ''} onChange={e => setEditing({ ...editing, scheduleTime: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Time Started">
                <input value={editing.timeStarted || ''} onChange={e => setEditing({ ...editing, timeStarted: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Time Ended">
                <input value={editing.timeEnded || ''} onChange={e => setEditing({ ...editing, timeEnded: e.target.value })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>

              <Field label="Amount Charged (PHP)">
                <input type="number" min={0} step="0.01" value={editing.amountCharged ?? 0}
                       onChange={e => setEditing({ ...editing, amountCharged: parseFloat(e.target.value || '0') })}
                       className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                       style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Payment Status">
                <select value={editing.paymentStatus || 'UNPAID'} onChange={e => setEditing({ ...editing, paymentStatus: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                  {PAYMENT_STATUSES.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                </select>
              </Field>

              <Field label="Job Status" full>
                <select value={editing.jobStatus || 'SCHEDULED'} onChange={e => setEditing({ ...editing, jobStatus: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                  {JOB_STATUSES.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                </select>
              </Field>

              <Field label="Remarks" full>
                <textarea rows={3} value={editing.remarks || ''} onChange={e => setEditing({ ...editing, remarks: e.target.value })}
                          className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
            </div>

            <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button onClick={() => setEditing(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold border"
                      style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={handleSave}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                      style={{ backgroundColor: '#3B82F6' }}>
                {editing.id ? 'Save Changes' : 'Create Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tiny helper ──────────────────────────────────────────────────────────────
function Field({ label, required, full, children }: {
  label: string
  required?: boolean
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
        {label}{required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  )
}
