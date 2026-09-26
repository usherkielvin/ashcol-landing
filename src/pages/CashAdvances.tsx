import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search, Building2, Calendar, CheckCircle2,
  Users, ChevronRight, ArrowLeft, Layers,
  Check, Clock, Edit3, X, Filter, SlidersHorizontal,
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
  const [filtersOpen, setFiltersOpen] = useState(false)

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

  const activeFilterCount = [
    statusFilter !== 'ALL',
    !!monthFilter && monthFilter !== `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    isAdmin && !!branchFilter,
  ].filter(Boolean).length

  const fmtDate = (d?: string) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div className="flex flex-col gap-3 pb-16">
      <style>{`
        @keyframes caFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes caSlideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .ca-filter-panel { animation: caSlideDown 0.15s ease-out; }
        .ca-fade { animation: caFadeUp 0.18s ease-out; }
      `}</style>

      {/* ── Search + Filter Toggle Row ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search member or purpose..."
              value={rawSearch}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all border"
              style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
            />
            {rawSearch && (
              <button onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setFiltersOpen(v => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-[13px] font-semibold transition-all shrink-0 relative"
            style={{ backgroundColor: filtersOpen ? '#10B981' : cardBg, borderColor: filtersOpen ? '#10B981' : inputBorder, color: filtersOpen ? '#ffffff' : textPrimary }}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {fetching && !initialLoading && (
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          )}
        </div>

        {/* ── Collapsible Filter Panel ── */}
        {filtersOpen && (
          <div className="ca-filter-panel rounded-xl border p-3 grid grid-cols-2 gap-2"
            style={{ backgroundColor: cardBg, borderColor: border }}>
            {isAdmin ? (
              <div className="relative col-span-2">
                <Building2 className="absolute left-2.5 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 rounded-lg text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 border transition-all"
                  style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}>
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-slate-400" />
              </div>
            ) : (
              <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">
                  {branches.find(b => b.id === branchFilter)?.name
                    ? formatBranchName(branches.find(b => b.id === branchFilter)!.name)
                    : formatBranchName(user?.branchId || 'My Branch')}
                </span>
              </div>
            )}

            <div className="relative">
              <Calendar className="absolute left-2.5 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
              <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                className="w-full pl-8 pr-7 py-2 rounded-lg text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 border transition-all"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}>
                <option value="">All Months</option>
                {monthOptions.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-slate-400" />
            </div>

            <div className="relative">
              <Filter className="absolute left-2.5 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full pl-8 pr-7 py-2 rounded-lg text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 border transition-all"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}>
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-slate-400" />
            </div>

            {(statusFilter !== 'ALL' || monthFilter) && (
              <div className="col-span-2 flex flex-wrap items-center gap-1.5 pt-1">
                {monthFilter && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Calendar className="w-3 h-3" />{monthLabel(monthFilter)}
                  </span>
                )}
                {statusFilter !== 'ALL' && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusFilter === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}`}>
                    {statusFilter === 'PAID' ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}{statusFilter}
                  </span>
                )}
                <button onClick={() => { setStatusFilter('ALL'); setMonthFilter('') }}
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors ml-auto">
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── View Switcher (list only) ── */}
        {!selectedMember && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center p-0.5 rounded-xl border shrink-0" style={{ backgroundColor: cardBg2, borderColor: border }}>
              <button onClick={() => setViewTab('members')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewTab === 'members' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                <Users className="w-3.5 h-3.5" />
                <span>Members</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${viewTab === 'members' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{memberGroups.length}</span>
              </button>
              <button onClick={() => setViewTab('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewTab === 'all' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                <Layers className="w-3.5 h-3.5" />
                <span>All</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${viewTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{filteredItems.length}</span>
              </button>
            </div>

            {filteredItems.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold"
                style={{ backgroundColor: cardBg, borderColor: border, color: textMuted }}>
                <Wallet className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="font-bold" style={{ color: textPrimary }}>
                  ₱{peso(filteredItems.reduce((s, i) => s + (i.amount || 0), 0))}
                </span>
                <span>total</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {initialLoading ? (
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ backgroundColor: cardBg }} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 ca-fade">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: cardBg }}>
            <CheckCircle2 className="w-7 h-7 text-emerald-500 opacity-40" />
          </div>
          <p className="text-sm font-semibold" style={{ color: textMuted }}>No entries found</p>
          <p className="text-xs text-center max-w-[200px]" style={{ color: textMuted }}>Try adjusting your filters or search</p>
        </div>

      ) : selectedMember && activeMemberGroup ? (
        /* ── DRILL-DOWN: SINGLE MEMBER ── */
        <div className="flex flex-col gap-3 ca-fade">
          <div className="rounded-2xl overflow-hidden border" style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex items-center gap-3 p-3.5" style={{ borderBottom: `1px solid ${border}` }}>
              <button onClick={() => setSelectedMember(null)}
                className="flex items-center justify-center w-8 h-8 rounded-xl border transition-all hover:border-emerald-500 hover:text-emerald-500 shrink-0"
                style={{ borderColor: border, color: textMuted }}>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0"
                style={{ backgroundColor: avatarColor(activeMemberGroup.name) }}>
                {getInitials(activeMemberGroup.name)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold truncate" style={{ color: textPrimary }}>{activeMemberGroup.name}</h2>
                <p className="text-[11px] truncate mt-0.5" style={{ color: textMuted }}>
                  {activeMemberGroup.branchName ? formatBranchName(activeMemberGroup.branchName) : 'Member'}
                  {' · '}{activeMemberGroup.items.length} record{activeMemberGroup.items.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3" style={{ borderTop: `1px solid ${border}` }}>
              {([
                { label: 'Pending', value: activeMemberGroup.pendingAmount, color: '#F59E0B' },
                { label: 'Paid', value: activeMemberGroup.paidAmount, color: '#10B981' },
                { label: 'Total', value: activeMemberGroup.totalAmount, color: textPrimary },
              ] as { label: string; value: number; color: string }[]).map(({ label, value, color }, i) => (
                <div key={label} className="flex flex-col items-center justify-center py-3 gap-0.5"
                  style={{ borderLeft: i > 0 ? `1px solid ${border}` : 'none' }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>{label}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color }}>₱{peso(value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {activeMemberGroup.items.map((item, idx) => {
              const desc = parseAdvanceDetails(item.details)
              const isPaid = (item.status || '').toUpperCase() === 'PAID'
              const isSavingThis = savingStatusId === item.id
              return (
                <div key={item.id || idx} className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
                  <div className="flex items-start justify-between gap-3 p-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[11px] font-medium tabular-nums" style={{ color: textMuted }}>{fmtDate(item.reportDate)}</span>
                        <button onClick={() => handleToggleStatus(item)} disabled={isSavingThis}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${isPaid ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25' : 'bg-amber-500/10 text-amber-500 border-amber-500/25'}`}>
                          {isSavingThis ? <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" /> : isPaid ? <Check className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                          {isPaid ? 'PAID' : 'PENDING'}
                        </button>
                      </div>
                      <p className={`text-[13px] font-semibold leading-snug ${desc === '—' ? 'italic' : ''}`}
                        style={{ color: desc === '—' ? textMuted : textPrimary }}>{desc}</p>
                    </div>
                    <span className="text-base font-bold tabular-nums text-amber-500 shrink-0">₱{peso(item.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3.5 pb-3">
                    <div className="flex-1 min-w-0">
                      {item.remarks
                        ? <p className="text-[11px] font-medium truncate" style={{ color: textMuted }}>
                            <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: textMuted }}>Note:</span>{item.remarks}
                          </p>
                        : <p className="text-[11px] italic" style={{ color: textMuted }}>No remarks</p>}
                    </div>
                    <button onClick={() => { setEditingItem(item); setRemarksDraft(item.remarks || '') }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all hover:border-emerald-500 hover:text-emerald-500 shrink-0"
                      style={{ borderColor: border, color: textMuted }}>
                      <Edit3 className="w-3 h-3" /><span>Note</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="rounded-2xl border px-4 py-3 flex items-center justify-between" style={{ backgroundColor: cardBg2, borderColor: border }}>
            <span className="text-xs font-semibold" style={{ color: textMuted }}>
              {activeMemberGroup.items.filter(i => (i.status || '').toUpperCase() === 'PAID').length} paid ·{' '}
              {activeMemberGroup.items.filter(i => (i.status || '').toUpperCase() !== 'PAID').length} pending
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold" style={{ color: textMuted }}>Total</span>
              <span className="text-sm font-bold text-amber-500 tabular-nums">₱{peso(activeMemberGroup.totalAmount)}</span>
            </div>
          </div>
        </div>

      ) : viewTab === 'members' ? (
        /* ── MEMBER CARDS LIST ── */
        <div className="flex flex-col gap-2 ca-fade">
          {memberGroups.map((group) => (
            <button key={group.name} onClick={() => setSelectedMember(group.name)}
              className="w-full text-left rounded-2xl border transition-all duration-150 overflow-hidden group active:scale-[0.99]"
              style={{ backgroundColor: cardBg, borderColor: border }}>
              <div className="flex items-center gap-3 p-3.5">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
                  style={{ backgroundColor: avatarColor(group.name) }}>
                  {getInitials(group.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-bold truncate group-hover:text-emerald-500 transition-colors" style={{ color: textPrimary }}>
                      {group.name}
                    </h3>
                    <span className="text-base font-bold text-amber-500 tabular-nums shrink-0">₱{peso(group.totalAmount)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px]" style={{ color: textMuted }}>{group.branchName ? formatBranchName(group.branchName) : 'Member'}</span>
                    <span className="text-[10px]" style={{ color: textMuted }}>·</span>
                    <span className="text-[11px]" style={{ color: textMuted }}>{group.items.length} record{group.items.length !== 1 ? 's' : ''}</span>
                    {group.pendingAmount > 0 && (
                      <>
                        <span className="text-[10px]" style={{ color: textMuted }}>·</span>
                        <span className="text-[11px] font-semibold text-amber-500">₱{peso(group.pendingAmount)} pending</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              {group.totalAmount > 0 && (
                <div className="h-0.5 w-full" style={{ backgroundColor: border }}>
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(group.paidAmount / group.totalAmount) * 100}%` }} />
                </div>
              )}
            </button>
          ))}
        </div>

      ) : (
        /* ── ALL RECORDS FLAT LIST ── */
        <div className="flex flex-col gap-2 ca-fade">
          {filteredItems.map((item, idx) => {
            const desc = parseAdvanceDetails(item.details)
            const isPaid = (item.status || '').toUpperCase() === 'PAID'
            const isSavingThis = savingStatusId === item.id
            return (
              <div key={item.id || idx} className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
                <div className="flex items-start gap-3 p-3.5">
                  <button onClick={() => setSelectedMember(item.memberName || null)} className="shrink-0 mt-0.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-[11px] shadow-sm hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: avatarColor(item.memberName || '—') }}>
                      {getInitials(item.memberName || '—')}
                    </div>
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <button onClick={() => setSelectedMember(item.memberName || null)}
                          className="text-[13px] font-bold truncate hover:text-emerald-500 transition-colors text-left block w-full"
                          style={{ color: textPrimary }}>
                          {item.memberName || '—'}
                        </button>
                        <p className={`text-[11px] mt-0.5 truncate ${desc === '—' ? 'italic' : 'font-medium'}`} style={{ color: textMuted }}>{desc}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-amber-500 shrink-0">₱{peso(item.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium tabular-nums" style={{ color: textMuted }}>{fmtDate(item.reportDate)}</span>
                        {item.branchName && (
                          <>
                            <span className="text-[10px]" style={{ color: textMuted }}>·</span>
                            <span className="text-[10px] font-medium" style={{ color: textMuted }}>{formatBranchName(item.branchName)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setEditingItem(item); setRemarksDraft(item.remarks || '') }}
                          className="p-1 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleToggleStatus(item)} disabled={isSavingThis}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${isPaid ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25' : 'bg-amber-500/10 text-amber-500 border-amber-500/25'}`}>
                          {isSavingThis ? <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" /> : isPaid ? <Check className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                          {isPaid ? 'PAID' : 'PENDING'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {item.remarks && (
                  <div className="px-3.5 pb-3">
                    <p className="text-[11px] font-medium truncate" style={{ color: textMuted }}>
                      <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: textMuted }}>Note:</span>{item.remarks}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Remarks Modal (bottom sheet on mobile, centered on desktop) ── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: textPrimary }}>Remarks & Notes</h3>
                <p className="text-xs mt-0.5" style={{ color: textMuted }}>{editingItem.memberName || 'Member'} · ₱{peso(editingItem.amount)}</p>
              </div>
              <button onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-xl border transition-colors hover:border-slate-400"
                style={{ borderColor: border, color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: textMuted }}>
                  Notes & Reconciliation
                </label>
                <textarea
                  rows={3}
                  value={remarksDraft}
                  onChange={e => setRemarksDraft(e.target.value)}
                  placeholder="e.g. Deducted on Sep 15 payroll, paid in cash, etc."
                  className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40 border transition-all resize-none"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: border, backgroundColor: cardBg2 }}>
                <span className="text-xs font-semibold" style={{ color: textMuted }}>Payment Status</span>
                <button type="button"
                  onClick={() => {
                    handleToggleStatus(editingItem)
                    setEditingItem(prev => prev ? { ...prev, status: prev.status === 'PAID' ? 'PENDING' : 'PAID' } : null)
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${editingItem.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/30'}`}>
                  {editingItem.status === 'PAID' ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  {editingItem.status === 'PAID' ? 'PAID' : 'PENDING'}
                  <span className="text-[10px] opacity-60">(tap to toggle)</span>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderTop: `1px solid ${border}` }}>
              <button type="button" onClick={() => setEditingItem(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                style={{ borderColor: border, color: textMuted }}>
                Cancel
              </button>
              <button type="button" onClick={handleSaveRemarks}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm">
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

