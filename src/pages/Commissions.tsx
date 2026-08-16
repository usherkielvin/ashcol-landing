import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Percent, Search, Building2, Calendar, CheckCircle2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin } from '../utils/api'

interface CommissionItem {
  id: string
  ticketNumber?: string
  store?: string
  diser?: string
  customer?: string
  dateInstalled?: string
  amount?: number
  collectionResolved: boolean
  status?: string
  collectionResolvedBy?: string
  collectionResolvedAt?: string
  reportId?: string
  reportDate?: string
  branchId?: string
  branchName?: string
}

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Commissions() {
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
  const canMarkPaid = isAdmin || role === 'manager' || role === 'management'

  const [items, setItems] = useState<CommissionItem[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)
  const hasFetchedOnce = useRef(false)

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL')

  const [branchFilter, setBranchFilter] = useState(() => {
    if (isAdmin) {
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      return activeBranch && activeBranch !== 'ALL_BRANCHES' ? activeBranch : ''
    }
    return user?.branchId || ''
  })

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

  const cacheKey = () => `ashcol-commissions-cache-${branchFilter}`

  const fetchCommissions = useCallback(async (silent = false) => {
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
      const res = await fetch(`${API_BASE_URL}/v1/reports/commission-expenses?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      if (res.ok) {
        const list: CommissionItem[] = await res.json()
        setItems(list)
        try { sessionStorage.setItem(cacheKey(), JSON.stringify(list)) } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Failed to fetch commission expenses', e)
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
    const commReq = fetchCommissions()
    Promise.all([branchReq, commReq])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hasFetchedOnce.current) return
    fetchCommissions()
  }, [fetchCommissions])

  const markAsPaid = async (item: CommissionItem) => {
    if (markingPaidId) return
    setMarkingPaidId(item.id)
    const now = new Date().toISOString()
    // Optimistic update
    setItems(prev => prev.map(it => it.id === item.id
      ? { ...it, collectionResolved: true, status: 'PAID', collectionResolvedBy: user?.name || '', collectionResolvedAt: now }
      : it))
    try {
      const res = await fetch(`${API_BASE_URL}/v1/reports/collections/${item.id}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, collectionResolved: false, status: 'PENDING' } : it))
      } else {
        try { sessionStorage.removeItem(cacheKey()) } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Failed to mark commission as paid', e)
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, collectionResolved: false, status: 'PENDING' } : it))
    } finally {
      setMarkingPaidId(null)
    }
  }

  const filteredItems = useMemo(() => {
    const term = search.toLowerCase()
    return items.filter(item => {
      const matchSearch =
        (item.store || '').toLowerCase().includes(term) ||
        (item.diser || '').toLowerCase().includes(term) ||
        (item.customer || '').toLowerCase().includes(term) ||
        (item.ticketNumber || '').toLowerCase().includes(term) ||
        (item.branchName || '').toLowerCase().includes(term)
      const monthKey = item.dateInstalled || item.reportDate || ''
      const matchMonth = !monthFilter || monthKey.startsWith(monthFilter)
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter
      return matchSearch && matchMonth && matchStatus
    })
  }, [items, search, monthFilter, statusFilter])

  const totalCommission = useMemo(
    () => filteredItems.reduce((acc, item) => acc + (item.amount || 0), 0),
    [filteredItems]
  )
  const totalPending = useMemo(
    () => filteredItems.filter(i => !i.collectionResolved).reduce((acc, item) => acc + (item.amount || 0), 0),
    [filteredItems]
  )

  const monthOptions = useMemo(() => {
    const seen = new Set<string>()
    items.forEach(item => {
      const key = item.dateInstalled || item.reportDate
      if (key) seen.add(key.slice(0, 7))
    })
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
    <div className="flex flex-col gap-6 pb-8 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Percent className="w-5 h-5" style={{ color: '#10B981' }} />
        <h1 className="text-lg font-extrabold" style={{ color: textPrimary }}>Commission Expenses</h1>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search diser, customer, ticket no. or branch..."
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
                <option value="">All Branches</option>
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
              style={{ color: monthFilter ? textPrimary : textMuted, backgroundColor: inputBg, borderColor: monthFilter ? '#10B981' : inputBorder }}
              aria-label="Filter by Month"
            >
              <option value="">All Months</option>
              {monthOptions.map(ym => (
                <option key={ym} value={ym}>{monthLabel(ym)}</option>
              ))}
            </select>
          </div>

          <div className="relative min-w-[150px]">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'PAID')}
              className="w-full pl-3 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all"
              style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
              aria-label="Filter by Status"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Payment</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 md:justify-end">
          <div className="px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2"
            style={{ backgroundColor: inputBg, borderColor: border }}>
            <span style={{ color: textMuted }}>Pending:</span>
            <span style={{ color: '#F59E0B' }}>₱{peso(totalPending)}</span>
          </div>
          <div className="px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2"
            style={{ backgroundColor: inputBg, borderColor: border }}>
            <span style={{ color: textMuted }}>Total:</span>
            <span style={{ color: '#10B981' }}>₱{peso(totalCommission)}</span>
          </div>
        </div>
      </div>

      {/* Commissions Table */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}`, position: 'relative' }}>
        {fetching && !initialLoading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', zIndex: 10, overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
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
          @keyframes fadeInTable { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {initialLoading ? (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{
                height: '40px', borderRadius: '8px',
                background: isLight
                  ? `linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)`
                  : `linear-gradient(90deg, #0d1520 25%, #1E2D48 50%, #0d1520 75%)`,
                backgroundSize: '200% 100%',
                animation: `shimmerBar 1.4s ease-in-out ${i * 0.08}s infinite`
              }} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 className="w-12 h-12 opacity-25 text-emerald-500" />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>No commission expenses found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ animation: 'fadeInTable 0.18s ease-out' }}>
            <table className="w-full text-left border-collapse" style={{ fontSize: '12px', color: textPrimary }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${border}`, color: textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                  <th className="px-3 py-3" style={{ width: 120 }}>Ticket No.</th>
                  <th className="px-3 py-3">Store</th>
                  <th className="px-3 py-3">Diser</th>
                  <th className="px-3 py-3">Customer Name</th>
                  <th className="px-3 py-3" style={{ width: 110 }}>Date Installed</th>
                  <th className="px-3 py-3 text-right" style={{ width: 110 }}>Amount</th>
                  <th className="px-3 py-3 text-center" style={{ width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const paid = item.collectionResolved
                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: idx < filteredItems.length - 1 ? `1px solid ${border}` : 'none', color: textPrimary }}
                    >
                      <td className="px-3 py-3" style={{ fontSize: '11px', fontWeight: 500 }}>
                        {item.ticketNumber || <span style={{ color: textMuted }}>—</span>}
                      </td>
                      <td className="px-3 py-3" style={{ whiteSpace: 'nowrap' }}>
                        {item.store || (item.branchName ? formatBranchName(item.branchName) : <span style={{ color: textMuted }}>—</span>)}
                      </td>
                      <td className="px-3 py-3" style={{ fontWeight: 500 }}>
                        {item.diser || <span style={{ color: textMuted, fontWeight: 400 }}>—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {item.customer || <span style={{ color: textMuted }}>—</span>}
                      </td>
                      <td className="px-3 py-3" style={{ color: textMuted, fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {item.dateInstalled
                          ? new Date(item.dateInstalled + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums" style={{ fontWeight: 500, color: '#10B981', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        ₱{peso(item.amount)}
                      </td>
                      <td className="px-3 py-3 text-center" style={{ fontSize: '11px', fontWeight: 500 }}>
                        {paid ? (
                          <span style={{ color: '#10B981' }}>Paid</span>
                        ) : canMarkPaid ? (
                          <button
                            type="button"
                            onClick={() => markAsPaid(item)}
                            disabled={markingPaidId === item.id}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all hover:opacity-80 disabled:opacity-50"
                            style={{ color: '#F59E0B', border: '1px solid #F59E0B' }}
                          >
                            {markingPaidId === item.id ? 'Marking…' : 'Pending — Mark Paid'}
                          </button>
                        ) : (
                          <span style={{ color: '#F59E0B' }}>Pending</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
