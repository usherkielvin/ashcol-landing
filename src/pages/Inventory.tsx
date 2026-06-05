import { useState, useEffect, useCallback } from 'react'
import {
  Package, AlertTriangle, XCircle, CheckCircle2,
  RefreshCw, ChevronDown, Search, Building2,
  ClipboardList, Boxes,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import { fetchBranchStock, fetchPartRequests } from '../services/inventoryService'

// ── Types ────────────────────────────────────────────────────────────────────

interface Part {
  id: string
  partName: string
  partNumber: string
  category: string
  unitPrice: number
}

interface BranchStock {
  id: string
  branch: { id: string; name: string }
  part: Part
  quantityAvailable: number
  reorderLevel: number
  updatedAt: string
}

interface PartRequest {
  id: string
  workOrderId: string
  part: Part
  quantityNeeded: number
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'FULFILLED'
  requestedAt: string
}

interface Branch {
  id: string
  name: string
}

type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

function getStockStatus(qty: number, reorder: number): StockStatus {
  if (qty === 0) return 'OUT_OF_STOCK'
  if (qty <= reorder) return 'LOW_STOCK'
  return 'IN_STOCK'
}

const STOCK_CFG: Record<StockStatus, { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }> = {
  IN_STOCK:     { label: 'In Stock',     color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)',  icon: CheckCircle2 },
  LOW_STOCK:    { label: 'Low Stock',    color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)',  icon: AlertTriangle },
  OUT_OF_STOCK: { label: 'Out of Stock', color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   icon: XCircle },
}

const REQUEST_CFG: Record<string, { color: string; bg: string }> = {
  PENDING:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  APPROVED:  { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  DENIED:    { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  FULFILLED: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
}

const getToken = () =>
  localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Inventory() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()

  // Color tokens — matching the rest of the portal
  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const [branches, setBranches]       = useState<Branch[]>([])
  const [selectedBranch, setSelected] = useState<string>('')
  const [stock, setStock]             = useState<BranchStock[]>([])
  const [requests, setRequests]       = useState<PartRequest[]>([])
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [tab, setTab]                 = useState<'stock' | 'requests'>('stock')
  const [filterStatus, setFilterStatus] = useState<'ALL' | StockStatus>('ALL')

  // ── Fetch branches ───────────────────────────────────────────────
  useEffect(() => {
    const headers = { Authorization: `Bearer ${getToken()}` }
    fetch(`${API_BASE_URL}/branches`, { headers })
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : [])
        setBranches(list)
        // Auto-select manager's branch, or first branch for admin
        if (user?.branchId) {
          setSelected(user.branchId)
        } else if (list.length > 0) {
          setSelected(list[0].id)
        }
      })
      .catch(console.error)
  }, [user?.branchId])

  useEffect(() => {
    if (role !== 'admin') return
    const syncFromGlobal = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      if (gId) {
        setSelected(gId)
      }
    }
    syncFromGlobal()
    window.addEventListener('ashcol-global-branch-change', syncFromGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncFromGlobal)
  }, [role])

  // ── Fetch stock for selected branch ─────────────────────────────
  const fetchStock = useCallback(async () => {
    if (!selectedBranch) return
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        fetchBranchStock(selectedBranch),
        fetchPartRequests(selectedBranch),
      ])
      setStock(s as BranchStock[])
      setRequests(r as PartRequest[])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedBranch])

  useEffect(() => { fetchStock() }, [fetchStock])

  // ── Derived data ─────────────────────────────────────────────────
  const filtered = (Array.isArray(stock) ? stock : [])
    .filter(s => {
      if (!s.part) return false
      const st = getStockStatus(s.quantityAvailable, s.reorderLevel)
      if (filterStatus !== 'ALL' && st !== filterStatus) return false
      const q = search.toLowerCase()
      return (
        s.part.partName.toLowerCase().includes(q) ||
        s.part.partNumber.toLowerCase().includes(q) ||
        s.part.category.toLowerCase().includes(q)
      )
    })

  const safeStock = Array.isArray(stock) ? stock : []
  const safeReqs = Array.isArray(requests) ? requests : []
  const inStock    = safeStock.filter(s => getStockStatus(s.quantityAvailable, s.reorderLevel) === 'IN_STOCK').length
  const lowStock   = safeStock.filter(s => getStockStatus(s.quantityAvailable, s.reorderLevel) === 'LOW_STOCK').length
  const outOfStock = safeStock.filter(s => getStockStatus(s.quantityAvailable, s.reorderLevel) === 'OUT_OF_STOCK').length
  const pendingReq = safeReqs.filter(r => r.status === 'PENDING').length

  const selectedBranchName = (Array.isArray(branches) ? branches : []).find(b => b.id === selectedBranch)?.name || 'Branch'

  return (
    <div className="flex flex-col gap-5 pb-8">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #F59E0B, transparent)' }} />
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#F59E0B' }}>
            Inventory
          </p>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            Branch Stock Manager
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            {lowStock > 0 || outOfStock > 0
              ? `⚠️ ${lowStock} low stock · ${outOfStock} out of stock in ${selectedBranchName}`
              : `All parts are well-stocked at ${selectedBranchName}`}
          </p>
        </div>

        {/* Branch selector (admin only) */}
        {role === 'admin' && (
          <div className="relative shrink-0">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: textMuted }} />
            <select
              id="branch-selector"
              value={selectedBranch}
              onChange={e => setSelected(e.target.value)}
              disabled={true}
              className="pl-9 pr-8 py-2.5 rounded-xl text-sm font-semibold border appearance-none cursor-not-allowed bg-slate-100 dark:bg-slate-900/50"
              style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', borderColor: inputBorder, color: textMuted }}
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
          </div>
        )}
      </div>

      {/* ── Summary KPI Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Parts',   value: stock.length, color: '#3B82F6', icon: Boxes,        filter: 'ALL' as const },
          { label: 'In Stock',      value: inStock,      color: '#10B981', icon: CheckCircle2, filter: 'IN_STOCK' as const },
          { label: 'Low Stock',     value: lowStock,     color: '#F59E0B', icon: AlertTriangle, filter: 'LOW_STOCK' as const },
          { label: 'Out of Stock',  value: outOfStock,   color: '#EF4444', icon: XCircle,      filter: 'OUT_OF_STOCK' as const },
        ].map((s, i) => {
          const Icon = s.icon
          const isActive = filterStatus === s.filter
          return (
            <button
              key={i}
              type="button"
              onClick={() => setFilterStatus(isActive && s.filter !== 'ALL' ? 'ALL' : s.filter)}
              className="rounded-2xl p-4 md:p-5 text-left transition-all hover:shadow-md relative overflow-hidden"
              style={{
                backgroundColor: isActive ? `${s.color}18` : cardBg,
                border: `1px solid ${isActive ? s.color + '60' : border}`,
              }}
            >
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: s.color }} />
              <div className="flex items-center justify-between mb-3 pl-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}18`, color: s.color }}>
                  <Icon className="w-4 h-4" />
                </div>
                {isActive && s.filter !== 'ALL' && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ color: s.color, backgroundColor: `${s.color}18` }}>Active</span>
                )}
              </div>
              <div className="pl-2">
                <div className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: s.color }}>
                  {loading ? '—' : s.value}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textMuted }}>
                  {s.label}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Tabs + Main Panel ───────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Tab bar */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex gap-1">
            {([
              { key: 'stock',    label: 'Stock Levels', icon: Package },
              { key: 'requests', label: `Part Requests${pendingReq > 0 ? ` (${pendingReq})` : ''}`, icon: ClipboardList },
            ] as const).map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={tab === t.key
                  ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.12)' }
                  : { color: textMuted }
                }
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            {tab === 'stock' && (
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
                <input
                  type="text"
                  placeholder="Search parts..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-xl text-xs border w-48"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>
            )}
            <button
              type="button"
              onClick={fetchStock}
              disabled={loading}
              className="p-2 rounded-xl transition-all hover:scale-105"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Stock Table ──────────────────────────────────────── */}
        {tab === 'stock' && (
          loading ? (
            <div className="flex flex-col gap-3 p-5">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: inputBg }}>
                <Package className="w-6 h-6" style={{ color: textMuted }} />
              </div>
              <p className="font-bold text-sm" style={{ color: textPrimary }}>
                {search ? 'No parts match your search' : 'No stock data for this branch'}
              </p>
              <p className="text-xs" style={{ color: textMuted }}>
                {search ? 'Try a different keyword' : 'Stock will appear once parts are configured in the backend.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${border}` }}>
                    {['Part Name', 'Part #', 'Category', 'Qty Available', 'Reorder Level', 'Status', 'Last Updated'].map(h => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-wider"
                        style={{ color: textMuted }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const status = getStockStatus(s.quantityAvailable, s.reorderLevel)
                    const cfg = STOCK_CFG[status]
                    const Icon = cfg.icon
                    return (
                      <tr
                        key={s.id}
                        style={{ borderBottom: `1px solid ${border}` }}
                        className="transition-colors"
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = inputBg)}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-semibold" style={{ color: textPrimary }}>{s.part.partName}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ backgroundColor: inputBg, color: textMuted }}>
                            {s.part.partNumber}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: textMuted }}>
                          {s.part.category}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className="text-base font-black"
                            style={{ color: status === 'IN_STOCK' ? textPrimary : cfg.color }}
                          >
                            {s.quantityAvailable}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm" style={{ color: textMuted }}>
                          {s.reorderLevel}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                            style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
                          >
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: textMuted }}>
                          {timeAgo(s.updatedAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Part Requests Queue ──────────────────────────────── */}
        {tab === 'requests' && (
          requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: inputBg }}>
                <ClipboardList className="w-6 h-6" style={{ color: textMuted }} />
              </div>
              <p className="font-bold text-sm" style={{ color: textPrimary }}>No part requests</p>
              <p className="text-xs" style={{ color: textMuted }}>Requests submitted by technicians will appear here.</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: border }}>
              {requests.map(req => {
                const cfg = REQUEST_CFG[req.status] || { color: textMuted, bg: inputBg }
                return (
                  <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                      >
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: textPrimary }}>{req.part.partName}</p>
                        <p className="text-xs" style={{ color: textMuted }}>
                          Qty: {req.quantityNeeded} · Ticket #{req.workOrderId.slice(0, 8).toUpperCase()} · {timeAgo(req.requestedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}
                      >
                        {req.status}
                      </span>
                      {req.status === 'PENDING' && (role === 'admin' || role === 'manager') && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleRequestAction(req.id, 'APPROVED')}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-[#10B981] hover:bg-emerald-500 transition-all"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestAction(req.id, 'DENIED')}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
                            style={{ borderColor: '#EF4444', color: '#EF4444' }}
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )

  async function handleRequestAction(requestId: string, action: 'APPROVED' | 'DENIED') {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
    try {
      await fetch(`${API_BASE_URL}/inventory/requests/${requestId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: action }),
      })
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: action } : r))
    } catch (e) {
      console.error(e)
    }
  }
}
