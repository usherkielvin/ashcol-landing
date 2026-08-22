import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Wallet, Search, Building2, Calendar, CheckCircle2, RefreshCw, Save, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin } from '../utils/api'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import {
  fetchAndMapPayroll,
  deduplicateAndMergePayroll,
  DEFAULT_PAYROLL_RATES,
  type PayrollRow,
  type PayrollRates,
} from '../utils/payrollDerive'

const peso = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) || 0 : (v ?? 0)
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const num = (s: string) => parseFloat(s) || 0
const uid = () => Math.random().toString(36).slice(2)

const mkRow = (installerName: string): PayrollRow => ({
  id: uid(),
  installerName,
  workDate: '',
  customerName: '',
  cityAddress: '',
  brandCapacity: '',
  sifQuotation: '',
  totalPipeLength: '',
  amountCollected: '',
  actualCollected: '',
  installationUpload: '',
  installationFee: '',
  earthGrounding: '',
  dailyAllowance: '',
})

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
  const isAdmin = isPortalAdmin(role)

  const [rows, setRows] = useState<PayrollRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const hasFetchedOnce = useRef(false)

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [branchFilter, setBranchFilter] = useState(() => {
    if (isAdmin) {
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      return activeBranch && activeBranch !== 'ALL_BRANCHES' ? activeBranch : ''
    }
    return user?.branchId || ''
  })

  const [rates, setRates] = useState<PayrollRates>(DEFAULT_PAYROLL_RATES)

  useEffect(() => {
    if (!isAdmin) return
    const sync = () => {
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      setBranchFilter(activeBranch && activeBranch !== 'ALL_BRANCHES' ? activeBranch : '')
    }
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [isAdmin])

  const getToken = () =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  const handleSearchChange = (value: string) => {
    setRawSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 200)
  }

  const branchName = branches.find(b => b.id === branchFilter)?.name || ''

  const fetchEntries = useCallback(async () => {
    if (!branchFilter || !monthFilter) {
      setRows([])
      setInitialLoading(false)
      return
    }
    try {
      const params = new URLSearchParams({ branchId: branchFilter, month: monthFilter })
      const res = await fetch(`${API_BASE_URL}/v1/payroll?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (res.ok) {
        const list = await res.json()
        const mapped: PayrollRow[] = (Array.isArray(list) ? list : []).map((e: any) => ({
          id: e.id || uid(),
          ticketId: e.ticketId || undefined,
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
        }))
        setRows(mapped)
      }
    } catch (e) {
      console.error('Failed to fetch payroll entries', e)
    } finally {
      if (!hasFetchedOnce.current) hasFetchedOnce.current = true
      setInitialLoading(false)
    }
  }, [branchFilter, monthFilter])

  useEffect(() => {
    const token = getToken()
    fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const list = (data?.data || data || []).map((b: any) => ({ id: b.id, name: b.name }))
        setBranches(list.sort((a: any, b: any) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setInitialLoading(true)
    void fetchEntries()
  }, [fetchEntries])

  const runSync = useCallback(async () => {
    if (!branchFilter || !monthFilter) return
    setSyncing(true)
    try {
      const result = await fetchAndMapPayroll(branchFilter, monthFilter, branchName, rates)
      if (result.ok) {
        setRows(prev => deduplicateAndMergePayroll(prev, result.rows))
      } else {
        alert(`Could not sync from schedules (${result.error}).`)
      }
    } finally {
      setSyncing(false)
    }
  }, [branchFilter, monthFilter, branchName, rates])

  const handleSyncClick = () => {
    if (rows.length === 0) {
      void runSync()
      return
    }
    setConfirmDialog({
      title: 'Sync from Schedules',
      message: 'This will add any new completed jobs from this month\'s schedules. Existing rows (including your edits) are kept.',
      confirmText: 'Sync',
      variant: 'info',
      onConfirm: () => {
        setConfirmDialog(null)
        void runSync()
      },
    })
  }

  const updateRow = (id: string, patch: Partial<PayrollRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id))
  const addRow = (installerName: string) => setRows(prev => [...prev, mkRow(installerName)])

  const handleSave = async () => {
    if (!branchFilter || !monthFilter) return
    setSaving(true)
    try {
      const entries = rows.map((r, idx) => ({
        ticketId: r.ticketId || null,
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
      }))
      const res = await fetch(`${API_BASE_URL}/v1/payroll`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: branchFilter, periodMonth: monthFilter, entries }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchEntries()
    } catch (e) {
      alert('Failed to save payroll.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const filteredRows = useMemo(() => {
    const term = search.toLowerCase()
    if (!term) return rows
    return rows.filter(r =>
      r.installerName.toLowerCase().includes(term)
      || r.customerName.toLowerCase().includes(term)
      || r.cityAddress.toLowerCase().includes(term),
    )
  }, [rows, search])

  const grouped = useMemo(() => {
    const map = new Map<string, PayrollRow[]>()
    for (const row of filteredRows) {
      const key = row.installerName.trim() || 'UNASSIGNED'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredRows])

  const installerTotal = (installerRows: PayrollRow[]) =>
    installerRows.reduce((sum, r) => sum + num(r.installationFee) + num(r.earthGrounding) + num(r.dailyAllowance), 0)

  const grandTotal = useMemo(() => grouped.reduce((sum, [, r]) => sum + installerTotal(r), 0), [grouped])

  const toggleCollapsed = (name: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const monthOptions = useMemo(() => {
    const seen = new Set<string>()
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(seen).sort((a, b) => b.localeCompare(a))
  }, [])

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const inputCls = "w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500/40 border bg-transparent"
  const thCls = "px-2 py-2 text-left text-[9px] font-extrabold uppercase tracking-wider whitespace-nowrap"

  return (
    <div className="flex flex-col gap-6 pb-8 md:pb-8">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5" style={{ color: '#10B981' }} />
        <h1 className="text-lg font-extrabold" style={{ color: textPrimary }}>Payroll</h1>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search installer, customer or address..."
              value={rawSearch}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all border"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>

          {isAdmin ? (
            <div className="relative min-w-[180px]">
              <Building2 className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                aria-label="Filter by Branch"
              >
                <option value="">Select branch…</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
              <Building2 className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
              <span className="truncate max-w-[160px]">
                {branches.find(b => b.id === branchFilter)?.name
                  ? formatBranchName(branches.find(b => b.id === branchFilter)!.name)
                  : formatBranchName(user?.branchId || 'My Branch')}
              </span>
            </div>
          )}

          <div className="relative min-w-[160px]">
            <Calendar className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all"
              style={{ color: textPrimary, backgroundColor: inputBg, borderColor: '#10B981' }}
              aria-label="Filter by Month"
            >
              {monthOptions.map(ym => (
                <option key={ym} value={ym}>{monthLabel(ym)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 md:justify-end">
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={syncing || !branchFilter}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all disabled:opacity-50"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync from Schedules
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !branchFilter}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50"
            style={{ background: '#10B981' }}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Rate strip */}
      <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: textMuted }}>Standard Rates</span>
        {([
          ['install', 'Install'],
          ['cleaning', 'Cleaning'],
          ['survey', 'Survey'],
          ['rescheduled', 'Rescheduled'],
          ['earthGrounding', 'Earth Grounding'],
          ['dailyAllowance', 'Daily Allowance'],
        ] as [keyof PayrollRates, string][]).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: textPrimary }}>
            {label}
            <input
              type="number"
              value={rates[key]}
              onChange={e => setRates(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
              className="w-20 px-2 py-1 rounded-lg text-[11px] font-bold border focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </label>
        ))}
      </div>

      {/* Grand total */}
      <div className="flex items-center justify-end">
        <div className="px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2"
          style={{ backgroundColor: inputBg, borderColor: border }}>
          <span style={{ color: textMuted }}>Grand Total:</span>
          <span style={{ color: '#10B981' }}>₱{peso(grandTotal)}</span>
        </div>
      </div>

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
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([installerName, installerRows]) => {
            const isCollapsed = collapsed.has(installerName)
            return (
              <div key={installerName} className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                  style={{ backgroundColor: isLight ? '#f8fafc' : '#0d1520', borderBottom: isCollapsed ? 'none' : `1px solid ${border}` }}
                  onClick={() => toggleCollapsed(installerName)}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    <span className="text-sm font-extrabold" style={{ color: textPrimary }}>{installerName}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: inputBg, color: textMuted }}>
                      {installerRows.length} job{installerRows.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-sm font-extrabold" style={{ color: '#10B981' }}>₱{peso(installerTotal(installerRows))}</span>
                </div>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse" style={{ fontSize: '11px', color: textPrimary }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${border}`, color: textMuted, backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                          <th className={thCls}>Date</th>
                          <th className={thCls}>Customer Name</th>
                          <th className={thCls}>City Address</th>
                          <th className={thCls}>Brand / Capacity</th>
                          <th className={thCls}>S.I.F. / Quotation</th>
                          <th className={thCls}>Total Pipe Length</th>
                          <th className={thCls}>Amount Collected (PR)</th>
                          <th className={thCls}>Actual Collected</th>
                          <th className={thCls}>Installation Upload</th>
                          <th className={thCls}>Installation Fee</th>
                          <th className={thCls}>Earth Grounding</th>
                          <th className={thCls}>Daily Allowance</th>
                          <th className={thCls} style={{ width: 32 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {installerRows.map(row => (
                          <tr key={row.id} style={{ borderBottom: `1px solid ${border}` }}>
                            <td className="px-2 py-1.5"><input type="date" value={row.workDate} onChange={e => updateRow(row.id, { workDate: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.customerName} onChange={e => updateRow(row.id, { customerName: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.cityAddress} onChange={e => updateRow(row.id, { cityAddress: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.brandCapacity} onChange={e => updateRow(row.id, { brandCapacity: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.sifQuotation} onChange={e => updateRow(row.id, { sifQuotation: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.totalPipeLength} onChange={e => updateRow(row.id, { totalPipeLength: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.amountCollected} onChange={e => updateRow(row.id, { amountCollected: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.actualCollected} onChange={e => updateRow(row.id, { actualCollected: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.installationUpload} onChange={e => updateRow(row.id, { installationUpload: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.installationFee} onChange={e => updateRow(row.id, { installationFee: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.earthGrounding} onChange={e => updateRow(row.id, { earthGrounding: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5"><input type="text" value={row.dailyAllowance} onChange={e => updateRow(row.id, { dailyAllowance: e.target.value })} className={inputCls} style={{ borderColor: inputBorder }} /></td>
                            <td className="px-2 py-1.5 text-center">
                              <button type="button" onClick={() => removeRow(row.id)} className="p-1 rounded hover:bg-red-500/10">
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      onClick={() => addRow(installerName)}
                      className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold"
                      style={{ color: '#10B981' }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add row
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* SUMMARY */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="px-4 py-3" style={{ backgroundColor: isLight ? '#f8fafc' : '#0d1520', borderBottom: `1px solid ${border}` }}>
              <span className="text-sm font-extrabold" style={{ color: textPrimary }}>Summary</span>
            </div>
            <table className="w-full text-left border-collapse" style={{ fontSize: '12px', color: textPrimary }}>
              <tbody>
                {grouped.map(([installerName, installerRows]) => (
                  <tr key={installerName} style={{ borderBottom: `1px solid ${border}` }}>
                    <td className="px-4 py-2.5 font-semibold">{installerName}</td>
                    <td className="px-4 py-2.5 text-right font-bold" style={{ color: '#10B981' }}>₱{peso(installerTotal(installerRows))}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                  <td className="px-4 py-3 font-extrabold">Grand Total</td>
                  <td className="px-4 py-3 text-right font-extrabold" style={{ color: '#10B981' }}>₱{peso(grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}
