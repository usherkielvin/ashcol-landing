import { useState, useEffect, useCallback } from 'react'
import { 
  ClipboardList, Search, CheckCircle2, 
  Loader2, Building2, Check 
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatDisplayUserLabel } from '../utils/api'

interface CollectionItem {
  id: string
  description: string // Installer/Negotiator
  amount: number
  customer: string
  collectionResolved: boolean
  status: 'PENDING' | 'RESOLVED'
  reportId?: string
  reportDate?: string
  branchId?: string
  branchName?: string
}

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ForCollections() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const [items, setItems] = useState<CollectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  
  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('PENDING')
  const [branchFilter, setBranchFilter] = useState('')
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  
  const [confirmItem, setConfirmItem] = useState<CollectionItem | null>(null)

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const canResolve = isAdmin || isManager || role === 'staff' || role === 'employee'

  const loadBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        const list = (data?.data || data || []).map((b: any) => ({ id: b.id, name: b.name }))
        setBranches(list.sort((a: any, b: any) => a.name.localeCompare(b.name)))
      }
    } catch (err) {
      console.error('Failed to load branches', err)
    }
  }, [])

  const fetchCollections = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams()
      if (branchFilter) params.append('branchId', branchFilter)
      if (statusFilter === 'PENDING') params.append('pendingOnly', 'true')
      
      const res = await fetch(`${API_BASE_URL}/v1/reports/collections?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        let list: CollectionItem[] = await res.json()
        // If status filter is RESOLVED, we filter manually (or let backend handle it, but we can filter manually to be safe since pendingOnly is only true/false)
        if (statusFilter === 'RESOLVED') {
          list = list.filter(item => item.collectionResolved)
        }
        setItems(list)
      }
    } catch (e) {
      console.error('Failed to fetch collections', e)
    } finally {
      setLoading(false)
    }
  }, [branchFilter, statusFilter])

  useEffect(() => {
    loadBranches()
  }, [loadBranches])

  useEffect(() => {
    fetchCollections()
  }, [fetchCollections])

  const handleResolve = async (item: CollectionItem) => {
    setResolvingId(item.id)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/collections/${item.id}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setConfirmItem(null)
        fetchCollections()
      } else {
        alert('Failed to resolve collection item.')
      }
    } catch {
      alert('Error connecting to server.')
    } finally {
      setResolvingId(null)
    }
  }

  // Filtered list
  const filteredItems = items.filter(item => {
    const term = search.toLowerCase()
    const matchSearch = 
      (item.description || '').toLowerCase().includes(term) ||
      (item.customer || '').toLowerCase().includes(term) ||
      (item.branchName || '').toLowerCase().includes(term)
    return matchSearch
  })

  const totalAmount = filteredItems.reduce((acc, item) => acc + item.amount, 0)

  return (
    <div className="flex flex-col gap-6 pb-8 md:pb-8">
      {/* Filters Toolbar */}
      <div className="rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search installer, customer or branch..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all border"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>

          {/* Branch filter */}
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
                <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="relative min-w-[140px]">
            <ClipboardList className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all"
              style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
              aria-label="Filter by Resolution Status"
            >
              <option value="PENDING">Pending Collections</option>
              <option value="RESOLVED">Resolved Collections</option>
              <option value="ALL">All Collections</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 md:justify-end">
          <div className="px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2"
            style={{ backgroundColor: inputBg, borderColor: border }}>
            <span style={{ color: textMuted }}>Total Amount:</span>
            <span style={{ color: '#F59E0B' }}>₱{peso(totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Collections List Table */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        {loading ? (
          <div className="flex flex-col gap-3 p-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 className="w-12 h-12 opacity-25 text-emerald-500" />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              No collection items found matching the selected filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/30 font-bold uppercase tracking-wider"
                  style={{ borderBottom: `1px solid ${border}`, color: textMuted, fontSize: '10px' }}>
                  <th className="px-5 py-3.5">Date Submitted</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">Installer/Negotiator</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-center no-print">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const resolved = item.collectionResolved
                  const statusBg = resolved ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'
                  const statusColor = resolved ? '#10B981' : '#F59E0B'
                  
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/20 dark:hover:bg-slate-900/20 transition-colors"
                      style={{ borderBottom: idx < filteredItems.length - 1 ? `1px solid ${border}` : 'none' }}
                    >
                      <td className="px-5 py-3.5 font-medium" style={{ color: textMuted }}>
                        {item.reportDate ? new Date(item.reportDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-5 py-3.5 font-semibold" style={{ color: textPrimary }}>{item.branchName || '—'}</td>
                      <td className="px-5 py-3.5 font-bold" style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</td>
                      <td className="px-5 py-3.5" style={{ color: textPrimary }}>{item.customer || '—'}</td>
                      <td className="px-5 py-3.5 text-right font-black tabular-nums" style={{ color: '#F59E0B' }}>₱{peso(item.amount)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{ backgroundColor: statusBg, color: statusColor }}>
                          {resolved ? 'RESOLVED' : 'PENDING'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center no-print">
                        {!resolved && canResolve ? (
                          <button
                            type="button"
                            onClick={() => setConfirmItem(item)}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                            style={{ border: 'none' }}
                          >
                            Resolve
                          </button>
                        ) : resolved ? (
                          <span className="text-[10px] font-bold text-slate-400">—</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">Restricted</span>
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

      {/* Confirmation Modal */}
      {confirmItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConfirmItem(null)}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-md flex flex-col p-6 cursor-default"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-emerald-500 mb-4">
              <CheckCircle2 size={24} />
              <h4 className="font-black text-base" style={{ color: textPrimary }}>Resolve Collection</h4>
            </div>
            
            <p className="text-xs mb-5" style={{ color: textMuted }}>
              Are you sure you want to mark the collection of <strong style={{ color: textPrimary }}>₱{peso(confirmItem.amount)}</strong> from <strong style={{ color: textPrimary }}>{confirmItem.customer || '—'}</strong> (assigned to <strong style={{ color: textPrimary }}>{confirmItem.description}</strong>) as <strong style={{ color: '#10B981' }}>RESOLVED</strong>?
            </p>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all border"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resolvingId === confirmItem.id}
                onClick={() => handleResolve(confirmItem)}
                className="px-5 py-2 rounded-xl text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600 transition-all flex items-center gap-2"
                style={{ border: 'none' }}
              >
                {resolvingId === confirmItem.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Confirm Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
