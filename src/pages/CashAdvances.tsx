import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, Building2, CheckCircle2,
  Users, ChevronRight, ChevronLeft, ArrowLeft, Layers,
  Check, Clock, Edit3, X,
  ChevronDown, Wallet
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin } from '../utils/api'

interface CashAdvanceItem {
  id: string
  memberName?: string
  details?: string
  amount?: number
  reportId?: string
  reportDate?: string
  branchId?: string
  branchName?: string
  status?: 'PAID' | 'PENDING' | string
  remarks?: string
  datePaid?: string
  resolvedBy?: string
}

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const AVATAR_COLORS: string[] = ['#10B981', '#F59E0B', '#8B5CF6', '#0EA5E9', '#84CC16', '#F97316', '#EC4899', '#06B6D4']
const avatarColor = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Extracts clean description from raw details.
 * Removes redundant "CASH ADVANCE" prefixes so description is clean and meaningful.
 */
function parseAdvanceDetails(rawDetails?: string): string {
  const d = (rawDetails || '').trim()
  if (!d) return '—'

  if (/^cash\s*advance$/i.test(d)) {
    return '—'
  }

  let cleaned = d
  if (/^cash\s*advance/i.test(cleaned)) {
    cleaned = cleaned.replace(/^cash\s*advance/i, '').trim()
    while (cleaned && (cleaned.startsWith('-') || cleaned.startsWith(':') || cleaned.startsWith('–') || cleaned.startsWith('—'))) {
      cleaned = cleaned.slice(1).trim()
    }
  }

  cleaned = cleaned.replace(/^cash\s*advance\s*\((.*?)\)$/i, '$1').trim()

  if (!cleaned || /^cash\s*advance$/i.test(cleaned)) {
    return '—'
  }

  return cleaned
}

export default function CashAdvances() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0B132B'
  const cardBg2     = isLight ? '#f8fafc'  : '#0F1A2E'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F1F5F9'
  const textMuted   = isLight ? '#64748b'  : '#64748B'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#e2e8f0'  : '#1E2D48'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)

  const [items, setItems] = useState<CashAdvanceItem[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
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

  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [viewTab, setViewTab] = useState<'members' | 'all'>('members')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL')

  // Remarks modal editing state
  const [editingItem, setEditingItem] = useState<CashAdvanceItem | null>(null)
  const [remarksDraft, setRemarksDraft] = useState('')
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null)

  // Follow the sidebar's "active branch" selector for admins
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

  const cacheKey = () => `ashcol-cash-advances-cache-${branchFilter}`

  const fetchCashAdvances = useCallback(async (silent = false) => {
    const cached = sessionStorage.getItem(cacheKey())
    if (cached) {
      try {
        setItems(JSON.parse(cached))
        setInitialLoading(false)
      } catch { /* ignore */ }
    }

    if (!silent) setFetching(true)
    try {
      const params = new URLSearchParams()
      if (branchFilter) params.append('branchId', branchFilter)
      const res = await fetch(`${API_BASE_URL}/v1/reports/cash-advances?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      if (res.ok) {
        const list: CashAdvanceItem[] = await res.json()
        setItems(list)
        try { sessionStorage.setItem(cacheKey(), JSON.stringify(list)) } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Failed to fetch cash advances', e)
    } finally {
      setFetching(false)
      if (!hasFetchedOnce.current) hasFetchedOnce.current = true
      setInitialLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter])

  useEffect(() => {
    const token = getToken()
    const branchReq = fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const list = (data?.data || data || []).map((b: any) => ({ id: b.id, name: b.name }))
        setBranches(list.sort((a: any, b: any) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
    const req = fetchCashAdvances()
    Promise.all([branchReq, req])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hasFetchedOnce.current) return
    fetchCashAdvances()
  }, [fetchCashAdvances])

  // Update status (Paid <-> Pending)
  const handleToggleStatus = async (item: CashAdvanceItem, targetStatus?: 'PAID' | 'PENDING') => {
    const nextStatus = targetStatus || (item.status === 'PAID' ? 'PENDING' : 'PAID')
    setSavingStatusId(item.id)

    // Optimistic UI update
    const updated = items.map(it => it.id === item.id ? { ...it, status: nextStatus } : it)
    setItems(updated)
    try { sessionStorage.setItem(cacheKey(), JSON.stringify(updated)) } catch { /* ignore */ }

    try {
      await fetch(`${API_BASE_URL}/v1/reports/cash-advances/${item.id}/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: nextStatus })
      })
    } catch (e) {
      console.error('Failed to update status', e)
    } finally {
      setSavingStatusId(null)
    }
  }

  // Save remarks
  const handleSaveRemarks = async () => {
    if (!editingItem) return
    const id = editingItem.id
    const newRemarks = remarksDraft.trim()

    // Optimistic UI update
    const updated = items.map(it => it.id === id ? { ...it, remarks: newRemarks } : it)
    setItems(updated)
    try { sessionStorage.setItem(cacheKey(), JSON.stringify(updated)) } catch { /* ignore */ }
    setEditingItem(null)

    try {
      await fetch(`${API_BASE_URL}/v1/reports/cash-advances/${id}/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ remarks: newRemarks })
      })
    } catch (e) {
      console.error('Failed to update remarks', e)
    }
  }

  // Filtered items (by search, month, status)
  const filteredItems = useMemo(() => {
    const term = search.toLowerCase()
    return items.filter(item => {
      const matchSearch =
        (item.memberName || '').toLowerCase().includes(term) ||
        (item.details || '').toLowerCase().includes(term) ||
        (item.remarks || '').toLowerCase().includes(term) ||
        (item.branchName || '').toLowerCase().includes(term)
      const matchMonth = !monthFilter || (item.reportDate || '').startsWith(monthFilter)
      const isPaid = (item.status || '').toUpperCase() === 'PAID'
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PAID' && isPaid) ||
        (statusFilter === 'PENDING' && !isPaid)

      return matchSearch && matchMonth && matchStatus
    })
  }, [items, search, monthFilter, statusFilter])

  // Group items by member
  const memberGroups = useMemo(() => {
    const map = new Map<string, {
      name: string
      branchName?: string
      items: CashAdvanceItem[]
      totalAmount: number
      pendingAmount: number
      paidAmount: number
      latestDate: string
    }>()

    filteredItems.forEach(item => {
      const key = (item.memberName || 'Unassigned').trim()
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          branchName: item.branchName,
          items: [],
          totalAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          latestDate: item.reportDate || '',
        })
      }
      const g = map.get(key)!
      g.items.push(item)
      const amt = item.amount || 0
      g.totalAmount += amt
      if ((item.status || '').toUpperCase() === 'PAID') {
        g.paidAmount += amt
      } else {
        g.pendingAmount += amt
      }
      if (item.reportDate && (!g.latestDate || item.reportDate > g.latestDate)) {
        g.latestDate = item.reportDate
      }
      if (!g.branchName && item.branchName) {
        g.branchName = item.branchName
      }
    })

    // Sort entries within each member group chronologically descending
    map.forEach(g => {
      g.items.sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''))
    })

    // Sort members descending by total cash advance amount
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount)
  }, [filteredItems])

  // Current active member details (if drilled down)
  const activeMemberGroup = useMemo(() => {
    if (!selectedMember) return null
    return memberGroups.find(g => g.name.toLowerCase() === selectedMember.toLowerCase()) || null
  }, [memberGroups, selectedMember])

  const monthOptions = useMemo(() => {
    const seen = new Set<string>()
    items.forEach(item => { if (item.reportDate) seen.add(item.reportDate.slice(0, 7)) })
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(seen).sort((a, b) => b.localeCompare(a))
  }, [items])

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const fmtDate = (d?: string) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const stepMonth = (dir: 1 | -1) => {
    // monthOptions is sorted newest → oldest; dir 1 = older, -1 = newer
    const idx = monthOptions.indexOf(monthFilter)
    const next = monthOptions[(idx < 0 ? 0 : idx) + dir]
    if (next) setMonthFilter(next)
  }
  const monthIdx = monthOptions.indexOf(monthFilter)
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const totals = useMemo(() => {
    let total = 0, pending = 0, paid = 0
    filteredItems.forEach(i => {
      const a = i.amount || 0
      total += a
      if ((i.status || '').toUpperCase() === 'PAID') paid += a
      else pending += a
    })
    return { total, pending, paid, pct: total > 0 ? Math.round((paid / total) * 100) : 0 }
  }, [filteredItems])

  const branchLabelText = branchFilter
    ? formatBranchName(branches.find(b => b.id === branchFilter)?.name || user?.branchId || 'Branch')
    : isAdmin ? 'All branches' : formatBranchName(user?.branchId || 'My branch')

  const statusPill = (item: CashAdvanceItem) => {
    const isPaid = (item.status || '').toUpperCase() === 'PAID'
    const saving = savingStatusId === item.id
    return (
      <button onClick={() => handleToggleStatus(item)} disabled={saving}
        title="Tap to toggle paid / pending"
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${isPaid ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25' : 'bg-amber-500/10 text-amber-500 border-amber-500/25'}`}>
        {saving ? <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" /> : isPaid ? <Check className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
        {isPaid ? 'Paid' : 'Pending'}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      <style>{`
        @keyframes caFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .ca-fade { animation: caFadeUp 0.18s ease-out; }
      `}</style>

      {/* ── Header: title + every filter in one always-visible bar ── */}
      <div className="rounded-2xl border px-4 py-3.5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        style={{ backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-center gap-3 min-w-0">
          {selectedMember ? (
            <button onClick={() => setSelectedMember(null)} aria-label="Back"
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all hover:border-emerald-500 hover:text-emerald-500"
              style={{ borderColor: border, color: textMuted }}>
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
              <Wallet className="w-[18px] h-[18px]" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-extrabold tracking-tight leading-tight truncate" style={{ color: textPrimary }}>
              {selectedMember && activeMemberGroup ? activeMemberGroup.name : 'Cash Advance'}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] font-medium min-w-0" style={{ color: textMuted }}>
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{branchLabelText}</span>
              <span className="opacity-40">•</span>
              <span className="truncate">{monthFilter ? monthLabel(monthFilter) : 'All months'}</span>
              {fetching && !initialLoading && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {/* Month stepper */}
          <div className="flex items-center rounded-xl border shrink-0" style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
            <button onClick={() => stepMonth(1)} disabled={monthFilter === '' || monthIdx >= monthOptions.length - 1}
              className="p-2 rounded-l-xl hover:bg-slate-500/10 disabled:opacity-30 transition-colors" style={{ color: textMuted }} aria-label="Older month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setMonthFilter(monthFilter ? '' : currentMonthKey)}
              title={monthFilter ? 'Show all months' : 'Back to current month'}
              className="px-2 min-w-[118px] text-xs font-bold text-center" style={{ color: textPrimary }}>
              {monthFilter ? monthLabel(monthFilter) : 'All months'}
            </button>
            <button onClick={() => stepMonth(-1)} disabled={monthFilter === '' || monthIdx <= 0}
              className="p-2 rounded-r-xl hover:bg-slate-500/10 disabled:opacity-30 transition-colors" style={{ color: textMuted }} aria-label="Newer month">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Branch — compact select for admins */}
          {isAdmin && (
            <div className="relative shrink-0">
              <Building2 className="absolute left-2.5 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                className="w-40 pl-8 pr-7 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer outline-none border focus:border-emerald-500"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}>
                <option value="">All branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: textMuted }} />
            </div>
          )}

          {/* Status segmented control */}
          <div className="flex items-center p-0.5 rounded-xl border shrink-0" style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
            {([['ALL', 'All'], ['PENDING', 'Pending'], ['PAID', 'Paid']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                style={statusFilter === key
                  ? { backgroundColor: key === 'PENDING' ? '#F59E0B' : '#10B981', color: '#fff' }
                  : { color: textMuted }}>
                {label}
              </button>
            ))}
          </div>

          {/* Search — compact, grows on focus */}
          <div className="relative flex-1 lg:flex-none min-w-[130px] lg:w-44 lg:focus-within:w-60 transition-all">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search"
              value={rawSearch}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-8 pr-7 py-2 rounded-xl text-xs font-medium outline-none border focus:border-emerald-500 transition-all"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
            {rawSearch && (
              <button onClick={() => handleSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600" aria-label="Clear search">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary strip ── */}
      {!initialLoading && filteredItems.length > 0 && (
        <div className="rounded-2xl border p-4 ca-fade" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            {([
              { label: 'Total advanced', value: `₱${peso(totals.total)}`, color: textPrimary },
              { label: 'Pending', value: `₱${peso(totals.pending)}`, color: '#F59E0B' },
              { label: 'Paid', value: `₱${peso(totals.paid)}`, color: '#10B981' },
              { label: 'Members · Records', value: `${memberGroups.length} · ${filteredItems.length}`, color: textPrimary },
            ]).map(k => (
              <div key={k.label} className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{k.label}</span>
                <span className="text-lg font-black tabular-nums truncate" style={{ color: k.color }}>{k.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: border }}>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${totals.pct}%` }} />
            </div>
            <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: textMuted }}>{totals.pct}% settled</span>
          </div>
        </div>
      )}

      {/* ── View switcher ── */}
      {!selectedMember && !initialLoading && filteredItems.length > 0 && (
        <div className="flex items-center gap-1 -mb-1">
          {([
            { key: 'members' as const, label: 'By member', icon: Users, count: memberGroups.length },
            { key: 'all' as const, label: 'All records', icon: Layers, count: filteredItems.length },
          ]).map(t => (
            <button key={t.key} onClick={() => setViewTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={viewTab === t.key
                ? { backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }
                : { color: textMuted }}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              <span className="text-[10px] font-bold opacity-70 tabular-nums">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {initialLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ backgroundColor: cardBg }} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 ca-fade rounded-2xl border" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-sm font-bold" style={{ color: textPrimary }}>No cash advances found</p>
          <p className="text-xs text-center max-w-[240px]" style={{ color: textMuted }}>Try a different month, status or search.</p>
          {(statusFilter !== 'ALL' || monthFilter || rawSearch) && (
            <button onClick={() => { setStatusFilter('ALL'); setMonthFilter(''); handleSearchChange('') }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all hover:border-emerald-500 hover:text-emerald-500"
              style={{ borderColor: border, color: textMuted }}>
              Clear filters
            </button>
          )}
        </div>

      ) : selectedMember && activeMemberGroup ? (
        /* ── DRILL-DOWN: SINGLE MEMBER ── */
        <div className="flex flex-col gap-3 ca-fade">
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: avatarColor(activeMemberGroup.name) }}>
                {getInitials(activeMemberGroup.name)}
              </div>
              <p className="text-xs flex-1 min-w-0 truncate" style={{ color: textMuted }}>
                {activeMemberGroup.branchName ? formatBranchName(activeMemberGroup.branchName) : 'Member'} · {activeMemberGroup.items.length} record{activeMemberGroup.items.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="grid grid-cols-3">
              {([
                { label: 'Pending', value: activeMemberGroup.pendingAmount, color: '#F59E0B' },
                { label: 'Paid', value: activeMemberGroup.paidAmount, color: '#10B981' },
                { label: 'Total', value: activeMemberGroup.totalAmount, color: textPrimary },
              ] as { label: string; value: number; color: string }[]).map(({ label, value, color }, i) => (
                <div key={label} className="flex flex-col items-center justify-center py-3 gap-0.5" style={{ borderLeft: i > 0 ? `1px solid ${border}` : 'none' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{label}</span>
                  <span className="text-base font-black tabular-nums" style={{ color }}>₱{peso(value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
            {activeMemberGroup.items.map((item, idx) => {
              const desc = parseAdvanceDetails(item.details)
              return (
                <div key={item.id || idx} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: idx > 0 ? `1px solid ${border}` : 'none' }}>
                  <div className="w-20 shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: textMuted }}>{fmtDate(item.reportDate)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${desc === '—' ? 'italic' : ''}`} style={{ color: desc === '—' ? textMuted : textPrimary }}>{desc}</p>
                    {item.remarks && <p className="text-[11px] truncate" style={{ color: textMuted }}>{item.remarks}</p>}
                  </div>
                  <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: textPrimary }}>₱{peso(item.amount)}</span>
                  {statusPill(item)}
                  <button onClick={() => { setEditingItem(item); setRemarksDraft(item.remarks || '') }} aria-label="Edit note"
                    className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors shrink-0" style={{ color: textMuted }}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

      ) : viewTab === 'members' ? (
        /* ── MEMBER CARD GRID ── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 ca-fade">
          {memberGroups.map(group => {
            const pct = group.totalAmount > 0 ? (group.paidAmount / group.totalAmount) * 100 : 0
            const settled = group.pendingAmount <= 0
            return (
              <button key={group.name} onClick={() => setSelectedMember(group.name)}
                className="text-left rounded-2xl border p-4 flex flex-col gap-3 transition-all hover:border-emerald-500/50 hover:shadow-md active:scale-[0.99] group"
                style={{ backgroundColor: cardBg, borderColor: border }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: avatarColor(group.name) }}>
                    {getInitials(group.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold truncate group-hover:text-emerald-500 transition-colors" style={{ color: textPrimary }}>{group.name}</h3>
                    <p className="text-[11px] truncate" style={{ color: textMuted }}>
                      {group.branchName ? formatBranchName(group.branchName) : 'Member'} · {group.items.length} record{group.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{settled ? 'Total' : 'Pending'}</span>
                    <span className="text-xl font-black tabular-nums leading-tight" style={{ color: settled ? '#10B981' : '#F59E0B' }}>
                      ₱{peso(settled ? group.totalAmount : group.pendingAmount)}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={settled
                      ? { color: '#10B981', borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.1)' }
                      : { color: textMuted, borderColor: border }}>
                    {settled ? 'Settled' : `of ₱${peso(group.totalAmount)}`}
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: border }}>
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </button>
            )
          })}
        </div>

      ) : (
        /* ── ALL RECORDS ── */
        <div className="rounded-2xl border overflow-hidden ca-fade" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="hidden md:grid grid-cols-[100px_1.1fr_1.6fr_120px_100px_40px] gap-3 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: cardBg2, color: textMuted, borderBottom: `1px solid ${border}` }}>
            <span>Date</span><span>Member</span><span>Details</span><span className="text-right">Amount</span><span>Status</span><span />
          </div>
          {filteredItems.map((item, idx) => {
            const desc = parseAdvanceDetails(item.details)
            return (
              <div key={item.id || idx}
                className="grid grid-cols-[1fr_auto] md:grid-cols-[100px_1.1fr_1.6fr_120px_100px_40px] items-center gap-x-3 gap-y-1 px-4 py-3"
                style={{ borderTop: idx > 0 ? `1px solid ${border}` : 'none' }}>
                <span className="hidden md:block text-[11px] font-semibold tabular-nums" style={{ color: textMuted }}>{fmtDate(item.reportDate)}</span>
                <button onClick={() => setSelectedMember(item.memberName || null)} className="flex items-center gap-2.5 min-w-0 text-left group">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                    style={{ backgroundColor: avatarColor(item.memberName || '—') }}>
                    {getInitials(item.memberName || '—')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold truncate group-hover:text-emerald-500 transition-colors" style={{ color: textPrimary }}>{item.memberName || '—'}</p>
                    <p className="md:hidden text-[10px] tabular-nums" style={{ color: textMuted }}>{fmtDate(item.reportDate)}</p>
                  </div>
                </button>
                <div className="hidden md:block min-w-0">
                  <p className={`text-xs truncate ${desc === '—' ? 'italic' : 'font-medium'}`} style={{ color: desc === '—' ? textMuted : textPrimary }}>{desc}</p>
                  {item.remarks && <p className="text-[10px] truncate" style={{ color: textMuted }}>{item.remarks}</p>}
                </div>
                <span className="text-sm font-bold tabular-nums text-right" style={{ color: textPrimary }}>₱{peso(item.amount)}</span>
                <div className="col-span-2 md:col-span-1 flex items-center justify-between md:justify-start gap-2">
                  <p className={`md:hidden text-[11px] truncate ${desc === '—' ? 'italic' : ''}`} style={{ color: textMuted }}>{desc}</p>
                  {statusPill(item)}
                </div>
                <button onClick={() => { setEditingItem(item); setRemarksDraft(item.remarks || '') }} aria-label="Edit note"
                  className="hidden md:flex p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors justify-self-end" style={{ color: textMuted }}>
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Remarks Modal (portaled; bottom sheet on mobile, centered on desktop) ── */}
      {editingItem && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onMouseDown={e => { if (e.target === e.currentTarget) setEditingItem(null) }}>
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="min-w-0">
                <h3 className="text-sm font-bold" style={{ color: textPrimary }}>Note</h3>
                <p className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>{editingItem.memberName || 'Member'} · ₱{peso(editingItem.amount)}</p>
              </div>
              <button onClick={() => setEditingItem(null)} aria-label="Close"
                className="p-1.5 rounded-xl hover:bg-slate-500/10 transition-colors" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4">
              <textarea
                rows={3}
                value={remarksDraft}
                onChange={e => setRemarksDraft(e.target.value)}
                placeholder="e.g. Deducted on Sep 15 payroll, paid in cash…"
                className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium outline-none border focus:border-emerald-500 transition-all resize-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                autoFocus
              />
              <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: border, backgroundColor: cardBg2 }}>
                <span className="text-xs font-semibold" style={{ color: textMuted }}>Payment status</span>
                <button type="button"
                  onClick={() => {
                    handleToggleStatus(editingItem)
                    setEditingItem(prev => prev ? { ...prev, status: prev.status === 'PAID' ? 'PENDING' : 'PAID' } : null)
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${editingItem.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/30'}`}>
                  {editingItem.status === 'PAID' ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  {editingItem.status === 'PAID' ? 'Paid' : 'Pending'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${border}` }}>
              <button type="button" onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-500/10 transition-colors" style={{ color: textMuted }}>
                Cancel
              </button>
              <button type="button" onClick={handleSaveRemarks}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm">
                Save note
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
