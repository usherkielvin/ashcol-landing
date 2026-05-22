import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Wrench, CalendarDays, Upload, Plus, Edit3, Trash2,
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
  district: string | null
  serviceType: string | null
  statusCode: string | null
  commitTerms: string | null
  dealer: string | null
  unitBrandModel: string | null
  unitSerial: string | null
  quantity: number | null
  technicianName: string | null
  negotiator: string | null
  scheduleTime: string | null
  scheduleStatus: string | null
  timeStarted: string | null
  timeEnded: string | null
  amountCharged: number | null
  paymentStatus: string | null
  jobStatus: string | null
  remarks: string | null
  note: string | null
  controlNumber: string | null
  serviceColumn: string | null
  papers: string | null
  costing: string | null
  relayStatus: string | null
  fifteenQuestions: string | null
  freeInstallation: boolean | null
}

interface BranchOption { id: string; name: string }

const SERVICE_TYPES = ['INSTALLATION', 'FREE_INSTALLATION', 'SERVICE', 'REPAIR', 'MAINTENANCE', 'CHECK_UP', 'RELOCATION'] as const

// Heuristic that mirrors the backend's isFreeInstallation logic so the modal
// can keep the freeInstallation flag in sync as the user edits the COMMIT box.
const detectFreeInstall = (commit: string | null | undefined) => {
  if (!commit) return false
  const u = commit.toUpperCase()
  if (!u.includes('FREE')) return false
  return u.includes('INSTAL') || u.includes('IDFT') || /\bFREE\s+\d+(ST|ND|RD|TH)\b/.test(u)
}
const PAYMENT_MODES = ['CASH', 'BANK TRANSFER', 'GCASH', 'CHEQUE', 'PAID', 'UNPAID', 'PARTIAL'] as const
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
  district: '',
  serviceType: 'INSTALLATION',
  statusCode: 'I',
  commitTerms: '',
  dealer: '',
  unitBrandModel: '',
  unitSerial: '',
  quantity: 1,
  technicianName: '',
  negotiator: '',
  scheduleTime: '',
  scheduleStatus: '',
  timeStarted: '',
  timeEnded: '',
  amountCharged: 0,
  paymentStatus: 'CASH',
  jobStatus: 'SCHEDULED',
  remarks: '',
  note: '',
  controlNumber: '',
  serviceColumn: '',
  papers: '',
  costing: '',
  relayStatus: '',
  fifteenQuestions: '',
  freeInstallation: false,
})

const FormatPhone = ({ raw }: { raw: string | null | undefined }): React.ReactNode => {
  if (!raw) return null
  
  let digits = raw.replace(/\D/g, '')
  const numbers: string[] = []

  while (digits.length >= 10) {
    if (digits.startsWith('63') && digits.length >= 12) {
      numbers.push('0' + digits.slice(2, 12))
      digits = digits.slice(12)
    } else if (digits.startsWith('09') && digits.length >= 11) {
      numbers.push(digits.slice(0, 11))
      digits = digits.slice(11)
    } else if (digits.startsWith('9') && digits.length >= 10) {
      numbers.push('0' + digits.slice(0, 10))
      digits = digits.slice(10)
    } else {
      digits = digits.slice(1) // Shift 1 if invalid format to keep looking
    }
  }

  const finalNumbers = numbers.slice(0, 2).map(num => {
    return num.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')
  })

  if (finalNumbers.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {finalNumbers.map((num, i) => (
        <span key={i} className="whitespace-nowrap">{num}</span>
      ))}
    </div>
  )
}

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
  const [viewMode] = useState<'daily' | 'weekly'>('daily')
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Modal state for create / edit
  const [editing, setEditing] = useState<Partial<ServiceRow> | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: ServiceRow } | null>(null)

  // Pending Excel import waiting for the admin to choose a target branch
  const [pendingImport, setPendingImport] = useState<{ file: File; branchId: string } | null>(null)

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

  useEffect(() => {
    if (isAdmin && !branchFilter && branches.length > 0) {
      setBranchFilter(branches[0].id)
    }
  }, [isAdmin, branchFilter, branches])

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
  const handleImportFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (isManager) {
      // Manager → branch is implicit (their own); skip picker
      runImport(file, user?.branchId || '')
    } else {
      // Admin → must pick which branch this workbook is for
      const seedBranch = branchFilter || (branches[0]?.id || '')
      setPendingImport({ file, branchId: seedBranch })
    }
  }

  const runImport = async (file: File, branchId: string) => {
    if (!isManager && !branchId) {
      alert('Please pick a target branch')
      return
    }
    const targetDate = date
    const branchName = branches.find(b => b.id === branchId)?.name
      || (isManager ? 'your branch' : 'the chosen branch')
    const pretty = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const ok = window.confirm(
      `Import "${file.name}" into ${branchName} for ${pretty}?\n\n` +
      `Existing ${branchName} service rows for ${pretty} will be REPLACED.`
    )
    if (!ok) { setPendingImport(null); return }

    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ date: targetDate })
      if (!isManager && branchId) params.set('branchId', branchId)
      const url = `${API_BASE_URL}/v1/service-reports/import?${params.toString()}`
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
      setImporting(false); setPendingImport(null)
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
  const rowSearchBlob = (r: ServiceRow) => {
    const amt = r.amountCharged != null ? String(r.amountCharged) : ''
    const amtPeso = r.amountCharged != null ? peso(r.amountCharged) : ''
    return [
      r.customerName, r.customerAddress, r.customerPhone, r.district,
      r.branchName, r.serviceType, r.statusCode, r.commitTerms, r.dealer,
      r.unitBrandModel, r.unitSerial, r.technicianName, r.negotiator,
      r.scheduleTime, r.scheduleStatus, r.timeStarted, r.timeEnded,
      r.paymentStatus, r.jobStatus, r.remarks, r.note, r.controlNumber,
      r.serviceColumn, r.papers, r.costing, r.relayStatus, r.fifteenQuestions,
      r.freeInstallation ? 'free installation' : '',
      r.reportDate, amt, amtPeso,
    ].filter(Boolean).join(' ').toLowerCase()
  }

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => rowSearchBlob(r).includes(q))
  }, [rows, searchQuery])

  const totals = useMemo(() => visible.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      qty: acc.qty + (r.quantity || 0),
      amount: acc.amount + (r.amountCharged || 0),
      completed: acc.completed + (r.jobStatus === 'COMPLETED' ? 1 : 0),
      cancelled: acc.cancelled + (r.jobStatus === 'CANCELLED' ? 1 : 0),
      freeInstalls: acc.freeInstalls + (r.freeInstallation ? 1 : 0),
    }),
    { count: 0, qty: 0, amount: 0, completed: 0, cancelled: 0, freeInstalls: 0 }
  ), [visible])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pb-8" onClick={() => setContextMenu(null)}>

      {/* Header */}
      <div
        className="rounded-2xl p-5 md:p-6 relative overflow-hidden"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        {/* Title Section */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-5 h-5" style={{ color: '#3B82F6' }} />
            <h2 className="text-xl md:text-2xl font-bold tracking-tight" style={{ color: textPrimary }}>
              Daily Service Report
            </h2>
          </div>
          <p className="text-xs" style={{ color: textMuted }}>
            Service and installation records
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Record Counter */}
          <div className="px-4 py-2 rounded-lg text-sm font-bold"
               style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>
            {visible.length} {visible.length === 1 ? 'record' : 'records'}
          </div>

          {/* Add Service */}
          {canEdit && (
            <button type="button"
                    onClick={() => setEditing(blankRow(date, isManager ? user?.branchId ?? null : ''))}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:scale-105"
                    style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>
              <Plus className="w-4 h-4" /> Add Service
            </button>
          )}

          {/* Excel Import */}
          {canImport && (
            <>
              <input type="file" accept=".xlsx,.xls" id="svc-import-input" className="hidden" onChange={handleImportFilePicked} />
              <button id="svc-import-btn" type="button" disabled={importing || viewMode === 'weekly'}
                      onClick={() => document.getElementById('svc-import-input')?.click()}
                      title={viewMode === 'weekly'
                        ? 'Excel import is per-day. Switch to Daily view to import.'
                        : isManager
                          ? `Import only YOUR branch's rows into ${date}`
                          : `Import every branch into ${date}`}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#3B82F6', color: '#fff' }}>
                <Upload className={`w-4 h-4 ${importing ? 'animate-bounce' : ''}`} />
                {importing ? 'Importing…' : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI strip */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'Service Records', value: totals.count.toString(), color: '#3B82F6' },
            { label: 'Total Units',     value: totals.qty.toString(),   color: '#8B5CF6' },
            { label: 'Total Charged',   value: `₱${peso(totals.amount)}`, color: '#10B981' },
            { label: 'Free Installs',   value: totals.freeInstalls.toString(), color: '#06B6D4' },
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
        <div className="px-5 py-4 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs shadow-sm transition-colors hover:border-blue-400"
                   style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
                <select
                  value={branchFilter}
                  onChange={e => setBranchFilter(e.target.value)}
                  className="bg-transparent outline-none text-xs font-bold cursor-pointer"
                  style={{ color: textPrimary }}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shadow-sm"
                 style={{ backgroundColor: 'rgba(59,130,246,0.12)', border: `1px solid rgba(59,130,246,0.2)`, color: '#3B82F6' }}>
              <CalendarDays className="w-4 h-4" />
              <div className="flex items-center gap-2">
                {viewMode !== 'weekly' && (
                  <span className="uppercase tracking-widest opacity-80 border-r border-blue-500/20 pr-2">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short' })}
                  </span>
                )}
                {viewMode === 'weekly' ? (
                  <span className="tracking-tight">{weekRange.label}</span>
                ) : (
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                         className="bg-transparent outline-none cursor-pointer" />
                )}
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs min-w-0"
                 style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: '#3B82F6' }} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-xs min-w-0 w-32 md:w-48"
                style={{ color: textPrimary }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} title="Clear"
                        className="shrink-0 p-0.5 rounded hover:bg-slate-200/20" style={{ color: textMuted }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <span className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm"
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
              {searchQuery.trim()
                ? `No records match “${searchQuery.trim()}”${rows.length > 0 ? ` (${rows.length} loaded)` : ''}`
                : `No service records for ${viewMode === 'weekly' ? weekRange.label : 'this date'}`}
            </p>
            {searchQuery.trim() ? (
              <button type="button" onClick={() => setSearchQuery('')}
                      className="text-xs font-bold text-[#3B82F6] hover:underline">Clear search</button>
            ) : canEdit && (
              <button onClick={() => setEditing(blankRow(date, isManager ? user?.branchId ?? null : ''))}
                      className="text-xs font-bold text-[#3B82F6] hover:underline">+ Add the first one</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                  {["CUSTOMER'S NAME", 'DESTINATION', 'DISTRICT', 'CONTACT NO.', 'BRAND', 'DLR', 'COMMIT', 'INSTALLER', 'NOTE', 'SERVICE', 'UPDATE', 'CHARGES', 'PAYMENT']
                    .map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: textMuted, fontWeight: 600, whiteSpace: 'nowrap', borderRight: `1px solid ${border}`, letterSpacing: '0.03em', fontSize: '11px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, idx) => (
                  <tr key={r.id}
                      onContextMenu={e => {
                        e.preventDefault()
                        if (canEdit || canDelete) setContextMenu({ x: e.clientX, y: e.clientY, row: r })
                      }}
                      style={{ borderBottom: `1px solid ${border}`, backgroundColor: contextMenu?.row.id === r.id ? (isLight ? '#eff6ff' : '#172554') : (idx % 2 === 0 ? 'transparent' : (isLight ? '#fafafa' : '#080f1c')) }}
                      onMouseEnter={e => { if (contextMenu?.row.id !== r.id) e.currentTarget.style.backgroundColor = rowHover }}
                      onMouseLeave={e => { if (contextMenu?.row.id !== r.id) e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'transparent' : (isLight ? '#fafafa' : '#080f1c') }}>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, minWidth: 140, fontSize: '11px' }}>
                      <span style={{ color: textMuted, fontSize: '10px', marginRight: 5 }}>{idx + 1}</span>{r.customerName || ''}
                    </td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, minWidth: 160, fontSize: '11px' }}>{r.customerAddress || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap', fontSize: '11px' }}>{r.district || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, maxWidth: 130, whiteSpace: 'nowrap', lineHeight: '1.6', fontSize: '11px' }}>
                      <FormatPhone raw={r.customerPhone} />
                    </td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, minWidth: 120, maxWidth: 120, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.4', fontSize: '11px' }}>{r.unitBrandModel || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, minWidth: 120, maxWidth: 120, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.4', fontSize: '11px' }}>{r.dealer || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, minWidth: 130, fontSize: '11px' }}>{r.commitTerms || ''}{r.freeInstallation ? ' (FREE)' : ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap', fontSize: '11px' }}>{r.technicianName || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, minWidth: 120, fontSize: '11px' }}>{r.note || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap', fontSize: '11px' }}>{r.serviceColumn || r.serviceType || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, minWidth: 130, fontSize: '11px' }}>{r.remarks || ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap', textAlign: 'right', fontSize: '11px' }}>{r.amountCharged ? r.amountCharged.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : ''}</td>
                    <td style={{ padding: '6px 10px', color: textPrimary, fontSize: '11px' }}>{r.paymentStatus || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Right-click context menu ─────────────────────────────────── */}
      {contextMenu && (
        <div className="fixed z-[200]" style={{ top: contextMenu.y, left: contextMenu.x }}
             onClick={e => e.stopPropagation()}>
          <div className="rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            {canEdit && (
              <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-blue-500/10"
                      style={{ color: textPrimary }}
                      onClick={() => { setEditing(contextMenu.row); setContextMenu(null) }}>
                <Edit3 className="w-3.5 h-3.5 text-blue-400" /> Edit row
              </button>
            )}
            {canDelete && (
              <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-red-500/10"
                      style={{ color: '#EF4444' }}
                      onClick={() => { handleDelete(contextMenu.row); setContextMenu(null) }}>
                <Trash2 className="w-3.5 h-3.5" /> Delete row
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Branch Picker (admin Excel import) ─────────────────────── */}
      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
             onClick={() => setPendingImport(null)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
               onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm" style={{ color: textPrimary }}>Choose Target Branch</h3>
              <button onClick={() => setPendingImport(null)} className="p-1.5 rounded-lg" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <p className="text-xs" style={{ color: textMuted }}>
                Every row in <span className="font-bold" style={{ color: textPrimary }}>{pendingImport.file.name}</span> will be saved
                under the branch you pick. Existing rows for that branch on{' '}
                <span className="font-bold" style={{ color: textPrimary }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>{' '}will be replaced.
              </p>
              <Field label="Branch" required>
                <select value={pendingImport.branchId}
                        onChange={e => setPendingImport({ ...pendingImport, branchId: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                  <option value="" style={{ color: '#000' }}>— Choose branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button onClick={() => setPendingImport(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold border"
                      style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={() => runImport(pendingImport.file, pendingImport.branchId)}
                      disabled={!pendingImport.branchId || importing}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                      style={{ backgroundColor: '#3B82F6', opacity: !pendingImport.branchId || importing ? 0.5 : 1 }}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit / Create Modal ─────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-[9999] flex flex-col" style={{ backgroundColor: isLight ? '#f8fafc' : '#0a1628' }}>

          {/* Sticky Header Bar */}
          <div className="px-6 py-4 flex flex-wrap gap-4 items-center justify-between shrink-0 shadow-sm"
               style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditing(null)} className="p-2 rounded-lg transition-colors"
                      style={{ color: textMuted }} title="Close">
                <X className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-black text-base tracking-tight" style={{ color: textPrimary }}>
                  {editing.id ? 'Edit Service Record' : 'New Service Record'}
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>
                  {editing.id || 'Draft'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditing(null)}
                      className="px-5 py-2 text-xs font-bold rounded-xl"
                      style={{ border: `1px solid ${inputBorder}`, color: textMuted, backgroundColor: 'transparent' }}>
                Cancel
              </button>
              <button onClick={handleSave}
                      className="px-6 py-2 text-xs font-bold text-white rounded-xl shadow-md"
                      style={{ backgroundColor: '#3B82F6' }}>
                {editing.id ? 'Save Changes' : 'Create Record'}
              </button>
            </div>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-5 md:p-10">
            <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-16">

              {/* Section 1 — Customer & Location */}
              <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: '#3B82F6' }}>① Customer &amp; Location</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    <input value={editing.customerName || ''}
                           onChange={e => setEditing({ ...editing, customerName: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Contact Number">
                    <input value={editing.customerPhone || ''}
                           onChange={e => setEditing({ ...editing, customerPhone: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="District / City">
                    <input value={editing.district || ''}
                           onChange={e => setEditing({ ...editing, district: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Full Address">
                    <input value={editing.customerAddress || ''}
                           onChange={e => setEditing({ ...editing, customerAddress: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              {/* Section 2 — Equipment & Service */}
              <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: '#8B5CF6' }}>② Equipment &amp; Service</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Brand / Unit Model">
                    <input value={editing.unitBrandModel || ''}
                           onChange={e => setEditing({ ...editing, unitBrandModel: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Dealer (DLR)">
                    <input value={editing.dealer || ''}
                           onChange={e => setEditing({ ...editing, dealer: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Service Type">
                    <select value={editing.serviceType || ''}
                            onChange={e => {
                              const v = e.target.value
                              setEditing({ ...editing, serviceType: v, statusCode: v === 'INSTALLATION' ? 'I' : v === 'SERVICE' ? 'S' : editing.statusCode })
                            }}
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
                  <Field label="Status Code (S/I)">
                    <input value={editing.statusCode || ''}
                           onChange={e => setEditing({ ...editing, statusCode: e.target.value })}
                           maxLength={4}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold uppercase"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <div className="lg:col-span-3">
                    <Field label='Commit Terms — e.g. "FREE 1ST IDFT"' full>
                      <textarea rows={2} value={editing.commitTerms || ''}
                                onChange={e => {
                                  const v = e.target.value
                                  const free = detectFreeInstall(v)
                                  setEditing({ ...editing, commitTerms: v, freeInstallation: free,
                                    serviceType: free && (editing.serviceType === 'INSTALLATION' || !editing.serviceType) ? 'FREE_INSTALLATION'
                                      : (!free && editing.serviceType === 'FREE_INSTALLATION' ? 'INSTALLATION' : editing.serviceType) })
                                }}
                                className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                      <label className="flex items-center gap-2 mt-1.5 text-[11px] font-bold cursor-pointer"
                             style={{ color: editing.freeInstallation ? '#06B6D4' : textMuted }}>
                        <input type="checkbox" checked={!!editing.freeInstallation}
                               onChange={e => setEditing({ ...editing, freeInstallation: e.target.checked,
                                 serviceType: e.target.checked ? 'FREE_INSTALLATION'
                                   : (editing.serviceType === 'FREE_INSTALLATION' ? 'INSTALLATION' : editing.serviceType) })} />
                        Free Installation Verified
                      </label>
                    </Field>
                  </div>
                </div>
              </div>

              {/* Section 3 — Personnel & Schedule */}
              <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: '#F59E0B' }}>③ Personnel &amp; Schedule</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Installer / Technician">
                    <input value={editing.technicianName || ''}
                           onChange={e => setEditing({ ...editing, technicianName: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Negotiator">
                    <input value={editing.negotiator || ''}
                           onChange={e => setEditing({ ...editing, negotiator: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Schedule Time (e.g. 9:00 AM)">
                    <input value={editing.scheduleTime || ''}
                           onChange={e => setEditing({ ...editing, scheduleTime: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Time Started">
                    <input value={editing.timeStarted || ''}
                           onChange={e => setEditing({ ...editing, timeStarted: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Time Ended">
                    <input value={editing.timeEnded || ''}
                           onChange={e => setEditing({ ...editing, timeEnded: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Schedule Status">
                    <input value={editing.scheduleStatus || ''}
                           onChange={e => setEditing({ ...editing, scheduleStatus: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              {/* Section 4 — Finance & Closing */}
              <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: '#10B981' }}>④ Finance &amp; Closing</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Installation Charges (PHP)">
                    <input type="number" min={0} step="0.01" value={editing.amountCharged ?? 0}
                           onChange={e => setEditing({ ...editing, amountCharged: parseFloat(e.target.value || '0') })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Mode of Payment">
                    <select value={editing.paymentStatus || 'CASH'}
                            onChange={e => setEditing({ ...editing, paymentStatus: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      {PAYMENT_MODES.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Job Status">
                    <select value={editing.jobStatus || 'SCHEDULED'}
                            onChange={e => setEditing({ ...editing, jobStatus: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      {JOB_STATUSES.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Control # / SI">
                    <input value={editing.controlNumber || ''}
                           onChange={e => setEditing({ ...editing, controlNumber: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Relay Status">
                    <input value={editing.relayStatus || ''}
                           onChange={e => setEditing({ ...editing, relayStatus: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Costing (e.g. FOR ACTUAL)">
                    <input value={editing.costing || ''}
                           onChange={e => setEditing({ ...editing, costing: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Papers (e.g. SEND, PENDING)">
                    <input value={editing.papers || ''}
                           onChange={e => setEditing({ ...editing, papers: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="15 Questions (DONE / notes)">
                    <input value={editing.fifteenQuestions || ''}
                           onChange={e => setEditing({ ...editing, fifteenQuestions: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Update / Remarks" full>
                      <textarea rows={2} value={editing.remarks || ''}
                                onChange={e => setEditing({ ...editing, remarks: e.target.value })}
                                className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    </Field>
                    <Field label="Internal Note" full>
                      <textarea rows={2} value={editing.note || ''}
                                onChange={e => setEditing({ ...editing, note: e.target.value })}
                                className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    </Field>
                  </div>
                </div>
              </div>

            </div>

          {/* Bottom Action Bar */}
          <div className="shrink-0 px-6 py-4 flex items-center justify-end gap-3"
               style={{ backgroundColor: cardBg, borderTop: `2px solid ${border}` }}>
            <button onClick={() => setEditing(null)}
                    className="px-5 py-2.5 text-xs font-bold rounded-xl"
                    style={{ border: `1px solid ${inputBorder}`, color: textMuted, backgroundColor: 'transparent' }}>
              Cancel
            </button>
            <button onClick={handleSave}
                    className="px-7 py-2.5 text-xs font-bold text-white rounded-xl"
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
