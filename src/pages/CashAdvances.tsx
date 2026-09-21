import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search, Building2, Calendar, CheckCircle2,
  Users, ChevronRight, ArrowLeft, Layers,
  Check, Clock, Edit3, X, Filter
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
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F1F5F9'
  const textMuted   = isLight ? '#64748b'  : '#94A3B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#22324F'

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

  // Selected member for detail drilldown: null = list/overview
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  // Active view tab: 'members' (by member) vs 'all' (flat chronological table)
  const [viewTab, setViewTab] = useState<'members' | 'all'>('members')
  // Status filter: 'ALL' | 'PENDING' | 'PAID'
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

  return (
    <div className="flex flex-col gap-3.5 pb-12">
      {/* Filters Toolbar & View Switcher */}
      <div className="rounded-xl p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 border shadow-xs"
        style={{ backgroundColor: cardBg, borderColor: border }}>
        <div className="flex flex-col md:flex-row gap-2 flex-1 flex-wrap items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search member, purpose or remarks..."
              value={rawSearch}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all border"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>

          {/* Branch Filter (near Month dropdown) */}
          {isAdmin ? (
            <div className="relative min-w-[150px]">
              <Building2 className="absolute left-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="w-full pl-9 pr-7 py-2 rounded-lg text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 border transition-all"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                aria-label="Filter by Branch"
              >
                <option value="">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate max-w-[150px]">
                {branches.find(b => b.id === branchFilter)?.name
                  ? formatBranchName(branches.find(b => b.id === branchFilter)!.name)
                  : formatBranchName(user?.branchId || 'My Branch')}
              </span>
            </div>
          )}

          {/* Month Filter */}
          <div className="relative min-w-[140px]">
            <Calendar className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="w-full pl-9 pr-7 py-2 rounded-lg text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 border transition-all"
              style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
              aria-label="Filter by Month"
            >
              <option value="">All Months</option>
              {monthOptions.map(ym => (
                <option key={ym} value={ym}>{monthLabel(ym)}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative min-w-[130px]">
            <Filter className="absolute left-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full pl-9 pr-7 py-2 rounded-lg text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 border transition-all"
              style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
              aria-label="Filter by Status"
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending Only</option>
              <option value="PAID">Paid Only</option>
            </select>
          </div>

          {/* Member Quick Filter */}
          <div className="relative min-w-[160px]">
            <Users className="absolute left-3 w-3.5 h-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            <select
              value={selectedMember || ''}
              onChange={e => setSelectedMember(e.target.value || null)}
              className="w-full pl-9 pr-7 py-2 rounded-lg text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 border transition-all"
              style={{ color: selectedMember ? '#10B981' : textPrimary, backgroundColor: inputBg, borderColor: selectedMember ? '#10B981' : inputBorder }}
              aria-label="Filter by Member"
            >
              <option value="">All Members ({memberGroups.length})</option>
              {memberGroups.map(m => (
                <option key={m.name} value={m.name}>
                  {m.name} (₱{peso(m.totalAmount)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View Switcher Tabs (Only when on top level) */}
        {!selectedMember && (
          <div className="flex items-center p-1 rounded-xl border shrink-0 self-start xl:self-auto" style={{ backgroundColor: inputBg, borderColor: border }}>
            <button
              onClick={() => setViewTab('members')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewTab === 'members'
                  ? 'shadow-xs bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>By Member ({memberGroups.length})</span>
            </button>
            <button
              onClick={() => setViewTab('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewTab === 'all'
                  ? 'shadow-xs bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Records ({filteredItems.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="rounded-xl overflow-hidden border shadow-xs" style={{ backgroundColor: cardBg, borderColor: border, position: 'relative' }}>
        {fetching && !initialLoading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', zIndex: 10, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, transparent, #10B981, transparent)',
              animation: 'shimmerBar 1.2s ease-in-out infinite',
              backgroundSize: '200% 100%'
            }} />
          </div>
        )}
        <style>{`
          @keyframes shimmerBar { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
          @keyframes fadeInTable { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {initialLoading ? (
          <div className="p-6 flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 rounded-lg animate-pulse"
                style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2.5">
            <CheckCircle2 className="w-10 h-10 opacity-20 text-emerald-500" />
            <p className="text-xs font-semibold text-slate-400">No cash advance entries found for this filter.</p>
          </div>
        ) : selectedMember && activeMemberGroup ? (
          /* ========================================================================= */
          /* DRILL-DOWN: SINGLE MEMBER CLEAN VIEW                                       */
          /* ========================================================================= */
          <div className="flex flex-col" style={{ animation: 'fadeInTable 0.15s ease-out' }}>
            {/* Member Profile Clean Banner */}
            <div className="p-5 border-b flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{ borderColor: border, backgroundColor: isLight ? '#fcfdfd' : '#0E1726' }}>
              <div className="flex items-center gap-3.5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0"
                  style={{ backgroundColor: avatarColor(activeMemberGroup.name) }}
                >
                  {getInitials(activeMemberGroup.name)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold tracking-tight" style={{ color: textPrimary }}>
                      {activeMemberGroup.name}
                    </h2>
                    {activeMemberGroup.branchName && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold border"
                        style={{
                          backgroundColor: '#10B98110',
                          borderColor: '#10B98125',
                          color: '#10B981'
                        }}>
                        {formatBranchName(activeMemberGroup.branchName)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs mt-1 text-slate-400">
                    <span>{activeMemberGroup.items.length} records</span>
                    {activeMemberGroup.latestDate && (
                      <>
                        <span>•</span>
                        <span>Latest: {new Date(activeMemberGroup.latestDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats & Back action */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs"
                  style={{ backgroundColor: cardBg, borderColor: border }}>
                  <span className="text-slate-400">Pending:</span>
                  <span className="font-semibold text-amber-500 tabular-nums">₱{peso(activeMemberGroup.pendingAmount)}</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="text-slate-400">Paid:</span>
                  <span className="font-semibold text-emerald-500 tabular-nums">₱{peso(activeMemberGroup.paidAmount)}</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="text-slate-400">Total:</span>
                  <span className="font-bold tabular-nums" style={{ color: textPrimary }}>₱{peso(activeMemberGroup.totalAmount)}</span>
                </div>

                <button
                  onClick={() => setSelectedMember(null)}
                  className="px-3 py-2 rounded-lg border text-xs font-semibold transition-all hover:border-emerald-500 hover:text-emerald-500 flex items-center gap-1.5"
                  style={{ color: textPrimary, borderColor: border, backgroundColor: cardBg }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Members</span>
                </button>
              </div>
            </div>

            {/* Member's Individual Entries Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr style={{
                    borderBottom: `1px solid ${border}`,
                    color: textMuted,
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    backgroundColor: isLight ? '#f8fafc' : '#0B132B'
                  }}>
                    <th className="px-4 py-3" style={{ width: 130 }}>Date</th>
                    <th className="px-4 py-3">Description / Purpose</th>
                    <th className="px-4 py-3 text-right" style={{ width: 120 }}>Amount</th>
                    <th className="px-4 py-3 text-center" style={{ width: 120 }}>Status</th>
                    <th className="px-4 py-3" style={{ width: 220 }}>Remarks</th>
                    <th className="px-4 py-3" style={{ width: 140 }}>Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMemberGroup.items.map((item, idx) => {
                    const desc = parseAdvanceDetails(item.details)
                    const isPaid = (item.status || '').toUpperCase() === 'PAID'
                    const isSavingThis = savingStatusId === item.id

                    return (
                      <tr
                        key={item.id || idx}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        style={{
                          borderBottom: idx < activeMemberGroup.items.length - 1 ? `1px solid ${border}` : 'none',
                          color: textPrimary
                        }}
                      >
                        {/* Date */}
                        <td className="px-4 py-3 tabular-nums font-medium text-slate-500 whitespace-nowrap">
                          {item.reportDate
                            ? new Date(item.reportDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </td>

                        {/* Description / Purpose (No icon, clean text) */}
                        <td className="px-4 py-3 font-medium">
                          <span className={desc === '—' ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}>
                            {desc}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-500 whitespace-nowrap">
                          ₱{peso(item.amount)}
                        </td>

                        {/* Status (Paid / Pending switch) */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleToggleStatus(item)}
                            disabled={isSavingThis}
                            title="Click to toggle status"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                              isPaid
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100'
                                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100'
                            }`}
                          >
                            {isPaid ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            <span>{isPaid ? 'PAID' : 'PENDING'}</span>
                          </button>
                        </td>

                        {/* Remarks */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 group">
                            <span className={`truncate max-w-[190px] ${item.remarks ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 italic'}`}>
                              {item.remarks || 'No remarks'}
                            </span>
                            <button
                              onClick={() => {
                                setEditingItem(item)
                                setRemarksDraft(item.remarks || '')
                              }}
                              title="Edit remarks"
                              className="p-1 rounded-md text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* Branch */}
                        <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                          {item.branchName ? formatBranchName(item.branchName) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{
                    borderTop: `2px solid ${border}`,
                    backgroundColor: isLight ? '#fcfdfd' : '#0B132B'
                  }}>
                    <td colSpan={2} className="px-4 py-3 font-semibold text-right text-slate-400">
                      Total for {activeMemberGroup.name}:
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-500 tabular-nums">
                      ₱{peso(activeMemberGroup.totalAmount)}
                    </td>
                    <td colSpan={3} className="px-4 py-3 text-xs text-slate-400">
                      <span>({activeMemberGroup.items.filter(i => (i.status || '').toUpperCase() === 'PAID').length} Paid, {activeMemberGroup.items.filter(i => (i.status || '').toUpperCase() !== 'PAID').length} Pending)</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : viewTab === 'members' ? (
          /* ========================================================================= */
          /* VIEW 1: BY MEMBER CLEAN CARDS ROSTER                                      */
          /* ========================================================================= */
          <div className="p-5" style={{ animation: 'fadeInTable 0.15s ease-out' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {memberGroups.map((group) => {
                const initials = getInitials(group.name)
                const color = avatarColor(group.name)

                return (
                  <div
                    key={group.name}
                    onClick={() => setSelectedMember(group.name)}
                    className="p-4 rounded-xl border transition-all duration-150 cursor-pointer flex flex-col justify-between gap-3.5 group hover:border-emerald-500/50 hover:shadow-xs"
                    style={{
                      backgroundColor: isLight ? '#ffffff' : '#0F1A2E',
                      borderColor: border,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                          style={{ backgroundColor: color }}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold truncate group-hover:text-emerald-500 transition-colors" style={{ color: textPrimary }}>
                            {group.name}
                          </h3>
                          <p className="text-[11px] truncate mt-0.5 text-slate-400">
                            {group.branchName ? formatBranchName(group.branchName) : 'Team Member'}
                          </p>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border text-slate-400"
                        style={{
                          backgroundColor: isLight ? '#f8fafc' : '#172238',
                          borderColor: border,
                        }}>
                        {group.items.length} {group.items.length === 1 ? 'record' : 'records'}
                      </span>
                    </div>

                    <div className="pt-2.5 border-t flex items-center justify-between" style={{ borderColor: border }}>
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                          Total Advance
                        </span>
                        <span className="text-sm font-bold text-amber-500 tabular-nums">
                          ₱{peso(group.totalAmount)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-xs font-semibold text-slate-400 group-hover:text-emerald-500 transition-colors">
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* VIEW 2: FLAT ALL RECORDS TABLE                                            */
          /* ========================================================================= */
          <div className="overflow-x-auto" style={{ animation: 'fadeInTable 0.15s ease-out' }}>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr style={{
                  borderBottom: `1px solid ${border}`,
                  color: textMuted,
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  backgroundColor: isLight ? '#f8fafc' : '#0B132B'
                }}>
                  <th className="px-4 py-3">Member Name</th>
                  <th className="px-4 py-3" style={{ width: 120 }}>Date</th>
                  <th className="px-4 py-3">Description / Purpose</th>
                  <th className="px-4 py-3 text-right" style={{ width: 110 }}>Amount</th>
                  <th className="px-4 py-3 text-center" style={{ width: 120 }}>Status</th>
                  <th className="px-4 py-3" style={{ width: 180 }}>Remarks</th>
                  <th className="px-4 py-3" style={{ width: 130 }}>Branch</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const desc = parseAdvanceDetails(item.details)
                  const isPaid = (item.status || '').toUpperCase() === 'PAID'
                  const isSavingThis = savingStatusId === item.id

                  return (
                    <tr
                      key={item.id || idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      style={{ borderBottom: idx < filteredItems.length - 1 ? `1px solid ${border}` : 'none', color: textPrimary }}
                    >
                      {/* Member Name */}
                      <td className="px-4 py-3 font-semibold">
                        <button
                          onClick={() => setSelectedMember(item.memberName || null)}
                          className="flex items-center gap-2 hover:text-emerald-500 transition-colors text-left"
                        >
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center text-white font-bold text-[9px] shrink-0"
                            style={{ backgroundColor: avatarColor(item.memberName || '—') }}
                          >
                            {getInitials(item.memberName || '—')}
                          </div>
                          <span className="truncate max-w-[160px]">{item.memberName || '—'}</span>
                        </button>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums">
                        {item.reportDate
                          ? new Date(item.reportDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3 font-medium">
                        <span className={desc === '—' ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}>
                          {desc}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-500 whitespace-nowrap">
                        ₱{peso(item.amount)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(item)}
                          disabled={isSavingThis}
                          title="Click to toggle status"
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                            isPaid
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100'
                              : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100'
                          }`}
                        >
                          {isPaid ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span>{isPaid ? 'PAID' : 'PENDING'}</span>
                        </button>
                      </td>

                      {/* Remarks */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 group">
                          <span className={`truncate max-w-[150px] ${item.remarks ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 italic'}`}>
                            {item.remarks || 'No remarks'}
                          </span>
                          <button
                            onClick={() => {
                              setEditingItem(item)
                              setRemarksDraft(item.remarks || '')
                            }}
                            title="Edit remarks"
                            className="p-1 rounded-md text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Branch */}
                      <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                        {item.branchName ? formatBranchName(item.branchName) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Remarks Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl p-5 border shadow-xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
            style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold" style={{ color: textPrimary }}>Remarks & Notes</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingItem.memberName || 'Member'} • ₱{peso(editingItem.amount)}
                </p>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Notes & Reconciliation Remarks
              </label>
              <textarea
                rows={3}
                value={remarksDraft}
                onChange={e => setRemarksDraft(e.target.value)}
                placeholder="e.g. Deducted on Sep 15 payroll, paid in cash, etc."
                className="w-full px-3 py-2 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 border transition-all resize-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: border }}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Status:</span>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleStatus(editingItem)
                    setEditingItem(prev => prev ? { ...prev, status: prev.status === 'PAID' ? 'PENDING' : 'PAID' } : null)
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                    editingItem.status === 'PAID'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200'
                      : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 border-amber-200'
                  }`}
                >
                  {editingItem.status === 'PAID' ? 'PAID' : 'PENDING'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border text-slate-400 hover:text-slate-200 transition-colors"
                  style={{ borderColor: border }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRemarks}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-xs"
                >
                  Save Remarks
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


