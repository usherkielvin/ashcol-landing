import { useState, useEffect, useCallback } from 'react'
import { 
  ClipboardList, Search, CheckCircle2, 
  Loader2, Building2, Check, Eye, X 
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
  receivedBy?: string
  trNo?: string
  auditLine?: string
  collectionNotes?: string
  collectionResolvedBy?: string
  collectionResolvedAt?: string
  collectionUpdatedBy?: string
  collectionUpdatedAt?: string
}

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatDateTime = (value?: string | null) => {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return value || ''
    return d.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return value || ''
  }
}

const isNoTransactionRemarks = (remarks: string) =>
  remarks === 'NO SCHED' || remarks === 'NO TRANSACTION' || remarks === 'NO RECORD' || remarks === 'NO REPORT'

const formatRemarksLabel = (remarks: string, compact: boolean) => {
  if (isNoTransactionRemarks(remarks)) return compact ? 'No Trans' : 'No Transaction'
  if (compact && remarks === 'ABOVE QUOTA') return 'ABOVE'
  if (compact && remarks === 'BELOW QUOTA') return 'BELOW'
  return remarks
}

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
  const [notesText, setNotesText] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  
  // Details Modal state
  const [selectedRow, setSelectedRow] = useState<CollectionItem | null>(null)
  const [rowExpenses, setRowExpenses] = useState<{
    items: any[];
    receivedBy?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    updatedBy?: string | null;
    branchName?: string;
    reportDate?: string;
    grossSales?: number;
    targetDailyQuota?: number;
    difference?: number;
    remarks?: string;
    cohPreviousDay?: number;
    fundFromHo?: number;
    cashReturns?: number;
    forCollection?: number;
    rebatesForCollection?: number;
    totalUnitsScheduled?: number;
    totalUnitsSurveyOnly?: number;
    totalUnitsInstalled?: number;
    totalUnitsServiced?: number;
    totalUnitsCancelled?: number;
    totalUnitsFreeInstall?: number;
  } | null>(null)
  const [rowExpensesLoading, setRowExpensesLoading] = useState(false)

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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: item.id === selectedRow?.id ? notesText : '' })
      })
      if (res.ok) {
        setConfirmItem(null)
        setSelectedRow(null)
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

  const handleSaveNotes = async () => {
    if (!selectedRow) return
    setSavingNotes(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/collections/${selectedRow.id}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: notesText })
      })
      if (res.ok) {
        const updatedItems = items.map(it => {
          if (it.id === selectedRow.id) {
            const updated = {
              ...it,
              collectionNotes: notesText,
              collectionUpdatedBy: user?.name || 'Staff',
              collectionUpdatedAt: new Date().toISOString()
            }
            setSelectedRow(updated)
            return updated
          }
          return it
        })
        setItems(updatedItems)
        alert('Notes updated successfully.')
      } else {
        alert('Failed to update notes.')
      }
    } catch {
      alert('Error connecting to server.')
    } finally {
      setSavingNotes(false)
    }
  }

  const fetchRowExpenses = async (reportId: string) => {
    setRowExpensesLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/${reportId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setRowExpenses({
          items: data.items || [],
          receivedBy: data.receivedBy || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          updatedBy: data.updatedBy || null,
          branchName: data.branchName || '',
          reportDate: data.reportDate || '',
          grossSales: data.grossSales || 0,
          targetDailyQuota: data.targetDailyQuota || 0,
          difference: data.difference || 0,
          remarks: data.remarks || '',
          cohPreviousDay: data.cohPreviousDay || 0,
          fundFromHo: data.fundFromHo || 0,
          cashReturns: data.cashReturns || 0,
          forCollection: data.forCollection || 0,
          rebatesForCollection: data.rebatesForCollection || 0,
          totalUnitsScheduled: data.totalUnitsScheduled || 0,
          totalUnitsSurveyOnly: data.totalUnitsSurveyOnly || 0,
          totalUnitsInstalled: data.totalUnitsInstalled || 0,
          totalUnitsServiced: data.totalUnitsServiced || 0,
          totalUnitsCancelled: data.totalUnitsCancelled || 0,
          totalUnitsFreeInstall: data.totalUnitsFreeInstall || 0,
        })
      }
    } catch (err) {
      console.error('Failed to fetch DTR details:', err)
      setRowExpenses({ items: [], receivedBy: '', createdAt: null, updatedAt: null, updatedBy: null })
    } finally {
      setRowExpensesLoading(false)
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
                  <th className="px-5 py-3.5">TR No.</th>
                  <th className="px-5 py-3.5">Submitted By</th>
                  <th className="px-5 py-3.5">Assigned Tech / Installer</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5">Notes</th>
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
                      <td className="px-5 py-3.5 font-mono text-[11px]" style={{ color: textPrimary }}>{item.trNo || '—'}</td>
                      <td className="px-5 py-3.5 font-medium" style={{ color: textMuted }}>{formatDisplayUserLabel(item.receivedBy)}</td>
                      <td className="px-5 py-3.5 font-bold" style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</td>
                      <td className="px-5 py-3.5" style={{ color: textPrimary }}>{item.customer || '—'}</td>
                      <td className="px-5 py-3.5 text-right font-black tabular-nums" style={{ color: '#F59E0B' }}>₱{peso(item.amount)}</td>
                      <td className="px-5 py-3.5 max-w-[200px] truncate" style={{ color: textMuted }} title={item.collectionNotes || ''}>
                        {item.collectionNotes ? (
                          <div className="flex flex-col gap-0.5 text-left">
                            <span className="text-slate-800 dark:text-slate-200 font-medium line-clamp-1">{item.collectionNotes}</span>
                            {(item.collectionUpdatedBy || item.collectionUpdatedAt) && (
                              <span className="text-[9px] opacity-75">
                                By {item.collectionUpdatedBy || '—'} ({item.collectionUpdatedAt ? new Date(item.collectionUpdatedAt).toLocaleDateString('en-PH', {month:'short', day:'numeric'}) : ''})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="italic opacity-50">No notes</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{ backgroundColor: statusBg, color: statusColor }}>
                          {resolved ? 'RESOLVED' : 'PENDING'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center no-print">
                        <div className="flex items-center justify-center gap-2">
                          {item.reportId && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRow(item)
                                setNotesText(item.collectionNotes || '')
                                setRowExpenses(null)
                                fetchRowExpenses(item.reportId!)
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                              style={{ borderColor: inputBorder, color: textMuted }}
                            >
                              <Eye className="w-3.5 h-3.5" /> Details
                            </button>
                          )}
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
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── DTR Details Modal ───────────────────────────────────────── */}
      {selectedRow && (() => {
        const itemsList = rowExpenses?.items || []
        
        // Cash Transactions
        const cashTxItems = itemsList.filter(it => it.type === 'CASH_SALE' && !it.description?.startsWith('PARTS|') && !it.description?.startsWith('RETURN|'))
        // Cash Returns
        const cashRetItems = itemsList.filter(it => it.type === 'CASH_SALE' && it.description?.startsWith('RETURN|'))
        // Online Transactions
        const onlineTxItems = itemsList.filter(it => it.type === 'ONLINE_SALE' && !it.description?.startsWith('CHECK|'))
        // Check Remits
        const checkItems = itemsList.filter(it => it.type === 'ONLINE_SALE' && it.description?.startsWith('CHECK|'))
        // Parts Sales
        const partsSaleItems = itemsList.filter(it => it.type === 'CASH_SALE' && it.description?.startsWith('PARTS|'))
        // Expenses
        const expenseItems = itemsList.filter(it => it.type === 'EXPENSE')
        // Purchases (non-orders)
        const purchaseItems = itemsList.filter(it => it.type === 'PURCHASE' && !it.description?.startsWith('ORDER|'))
        // Orders
        const orderItems = itemsList.filter(it => it.type === 'PURCHASE' && it.description?.startsWith('ORDER|'))
        // Rebates
        const rebateItems = itemsList.filter(it => it.type === 'REBATE')
        // Collections Breakdown
        const forCollItems = itemsList.filter(it => it.type === 'COLLECTION')

        // Calculate totals from items list
        const totalCashCollection = cashTxItems.reduce((sum, it) => sum + (it.amount || 0), 0) + partsSaleItems.reduce((sum, it) => sum + (it.amount || 0), 0)
        const totalOnlineCollection = onlineTxItems.reduce((sum, it) => sum + (it.amount || 0), 0) + checkItems.reduce((sum, it) => sum + (it.amount || 0), 0)
        const cashReturns = cashRetItems.reduce((sum, it) => sum + (it.amount || 0), 0)
        const totalCohCfd = (rowExpenses?.cohPreviousDay || 0) + (rowExpenses?.fundFromHo || 0) + cashReturns + totalCashCollection

        const renderItemTable = (title: string, itemsList: any[], columns: { label: string; render: (item: any) => React.ReactNode; align?: 'left' | 'right' | 'center' }[], customTotal?: number) => {
          if (itemsList.length === 0) return null
          const sumValue = customTotal !== undefined ? customTotal : itemsList.reduce((acc, it) => acc + (it.amount || 0), 0)
          const isExpenseType = title.includes('Expense') || title.includes('Purchase') || title.includes('Order')
          
          return (
            <div className="px-6 py-5 border-b" style={{ borderColor: border }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>{title}</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black tabular-nums" style={{ color: itemsList.length === 0 ? textMuted : isExpenseType ? '#EF4444' : '#10B981' }}>
                    ₱{peso(sumValue)}
                  </span>
                  <span className="text-[10px] font-medium" style={{ color: textMuted }}>({itemsList.length} {itemsList.length === 1 ? 'item' : 'items'})</span>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-900/30 font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${border}`, color: textMuted, fontSize: '9px' }}>
                      {columns.map((col, idx) => (
                        <th key={idx} className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsList.map((item, i) => (
                      <tr key={i} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/20 transition-colors" style={{ borderBottom: i < itemsList.length - 1 ? `1px solid ${border}` : 'none' }}>
                        {columns.map((col, idx) => (
                          <td key={idx} className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                            {col.render(item)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-pointer backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', cursor: 'pointer' }}
            onClick={() => setSelectedRow(null)}
          >
            <div
              className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-4xl flex flex-col cursor-default"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh', cursor: 'default' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${border}` }}>
                <div className="flex items-start justify-between w-full sm:w-auto">
                  <div>
                    <h4 className="font-black text-base" style={{ color: textPrimary }}>{selectedRow.branchName || 'DTR Report Details'}</h4>
                    <p className="text-[11px] mt-0.5" style={{ color: textMuted }}>
                      {selectedRow.reportDate ? new Date(selectedRow.reportDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </p>
                  </div>
                  <button onClick={() => setSelectedRow(null)}
                    className="sm:hidden p-1.5 rounded-lg transition-colors hover:bg-slate-500/10" style={{ color: textMuted }} aria-label="Close details dialog">
                    <X size={22} />
                  </button>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start">
                  {canResolve && selectedRow.reportId && (
                    <a
                      href={`/daily-report?id=${selectedRow.reportId}`}
                      className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity text-center flex items-center justify-center text-white bg-emerald-500"
                      style={{ border: 'none' }}
                    >
                      Edit Report
                    </a>
                  )}
                  <button onClick={() => setSelectedRow(null)}
                    className="hidden sm:block p-1.5 rounded-lg transition-colors hover:bg-slate-500/10" style={{ color: textMuted }} aria-label="Close details dialog">
                    <X size={22} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {rowExpensesLoading ? (
                  <div className="px-6 py-10 flex flex-col gap-3 justify-center items-center">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-400">Loading transaction details...</span>
                  </div>
                ) : (
                  <>
                    {/* Status strip */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-6 py-3 text-xs" style={{ borderBottom: `1px solid ${border}`, backgroundColor: inputBg }}>
                      <span className="flex items-center gap-1.5 font-bold">
                        <span style={{
                          display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
                          backgroundColor: rowExpenses?.remarks === 'PENDING' ? '#F59E0B' : '#10B981'
                        }} />
                        <span style={{ color: rowExpenses?.remarks === 'PENDING' ? '#F59E0B' : '#10B981' }}>
                          {rowExpenses?.remarks || 'SUBMITTED'}
                        </span>
                      </span>
                      {rowExpenses?.createdAt && (
                        <span style={{ color: textMuted }}>
                          Submitted: <span style={{ color: textPrimary, fontWeight: 600 }}>{formatDateTime(rowExpenses.createdAt)}</span>
                          {rowExpenses.receivedBy && <> by <span style={{ color: textPrimary, fontWeight: 600 }}>{formatDisplayUserLabel(rowExpenses.receivedBy)}</span></>}
                        </span>
                      )}
                      {rowExpenses?.updatedAt && rowExpenses.updatedAt !== rowExpenses.createdAt && (
                        <span style={{ color: '#F59E0B' }}>
                          Last Edited: <span style={{ fontWeight: 600 }}>{formatDateTime(rowExpenses.updatedAt)}</span>
                          {rowExpenses.updatedBy && <> by <span style={{ fontWeight: 600 }}>{formatDisplayUserLabel(rowExpenses.updatedBy)}</span></>}
                        </span>
                      )}
                    </div>

                    {/* Main metrics — 3 flat columns */}
                    <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderBottom: `1px solid ${border}` }}>

                      {/* Sales Summary */}
                      <div className="px-6 py-5" style={{ borderRight: `1px solid ${border}` }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>Sales Summary</p>
                        <div className="flex flex-col gap-2.5">
                          {[
                            { label: 'Gross Sales', value: `₱${peso(rowExpenses?.grossSales)}`, color: textPrimary },
                            { label: 'Target Quota', value: `₱${peso(rowExpenses?.targetDailyQuota)}`, color: '#8B5CF6' },
                            { label: 'Difference', value: `${(rowExpenses?.difference || 0) >= 0 ? '+' : ''}₱${peso(rowExpenses?.difference)}`, color: (rowExpenses?.difference || 0) >= 0 ? '#10B981' : '#EF4444' },
                            { label: 'Remarks', value: formatRemarksLabel(rowExpenses?.remarks || '', false), color: rowExpenses?.remarks === 'ABOVE QUOTA' ? '#10B981' : rowExpenses?.remarks === 'PENDING' ? '#F59E0B' : '#EF4444' },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between gap-3">
                              <span className="text-xs" style={{ color: textMuted }}>{r.label}</span>
                              <span className="text-xs font-bold tabular-nums" style={{ color: r.color }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Cash Flow */}
                      <div className="px-6 py-5" style={{ borderRight: `1px solid ${border}` }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>Cash Flow</p>
                        <div className="flex flex-col gap-2.5">
                          {[
                            { label: 'COH Prev Day', value: `₱${peso(rowExpenses?.cohPreviousDay)}`, bold: false },
                            { label: 'Fund from HO', value: `₱${peso(rowExpenses?.fundFromHo)}`, bold: false },
                            { label: 'Cash Returns', value: `₱${peso(cashReturns)}`, bold: false },
                            { label: 'Total COH/CFD', value: `₱${peso(totalCohCfd)}`, bold: true },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between gap-3">
                              <span className="text-xs" style={{ color: textMuted }}>{r.label}</span>
                              <span className={`text-xs tabular-nums ${r.bold ? 'font-black' : 'font-semibold'}`} style={{ color: textPrimary }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Collections */}
                      <div className="px-6 py-5">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>Collections</p>
                        <div className="flex flex-col gap-2.5">
                          {[
                            { label: 'Cash Collection', value: `₱${peso(totalCashCollection)}`, color: '#10B981' },
                            { label: 'Online Collection', value: `₱${peso(totalOnlineCollection)}`, color: '#3B82F6' },
                            { label: 'For Collection', value: `₱${peso(rowExpenses?.forCollection)}`, color: '#F59E0B' },
                            { label: 'Rebates', value: `₱${peso(rowExpenses?.rebatesForCollection)}`, color: textMuted },
                          ].map(r => (
                            <div key={r.label} className="flex items-center justify-between gap-3">
                              <span className="text-xs" style={{ color: textMuted }}>{r.label}</span>
                              <span className="text-xs font-bold tabular-nums" style={{ color: r.color }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Collection Note & Status Updates */}
                    <div className="px-6 py-5 border-b" style={{ borderColor: border }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>Collection Updates & Notes</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Audit Log / Status Column */}
                        <div className="rounded-xl p-4 border text-left" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                          <h5 className="text-xs font-bold mb-3" style={{ color: textPrimary }}>Status & Audit Info</h5>
                          <div className="flex flex-col gap-2 text-xs">
                            <div className="flex justify-between border-b pb-1.5" style={{ borderColor: border }}>
                              <span style={{ color: textMuted }}>Current Status:</span>
                              <span className="font-bold uppercase" style={{ color: selectedRow.collectionResolved ? '#10B981' : '#F59E0B' }}>
                                {selectedRow.collectionResolved ? 'RESOLVED' : 'PENDING'}
                              </span>
                            </div>
                            
                            {selectedRow.collectionResolved && (
                              <>
                                <div className="flex justify-between border-b pb-1.5" style={{ borderColor: border }}>
                                  <span style={{ color: textMuted }}>Resolved By:</span>
                                  <span className="font-bold" style={{ color: textPrimary }}>{selectedRow.collectionResolvedBy || '—'}</span>
                                </div>
                                <div className="flex justify-between border-b pb-1.5" style={{ borderColor: border }}>
                                  <span style={{ color: textMuted }}>Resolved At:</span>
                                  <span className="font-mono text-[11px]" style={{ color: textPrimary }}>{formatDateTime(selectedRow.collectionResolvedAt)}</span>
                                </div>
                              </>
                            )}

                            <div className="flex justify-between border-b pb-1.5" style={{ borderColor: border }}>
                              <span style={{ color: textMuted }}>Last Updated By:</span>
                              <span className="font-semibold" style={{ color: textPrimary }}>{selectedRow.collectionUpdatedBy || '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: textMuted }}>Last Updated At:</span>
                              <span className="font-mono text-[11px]" style={{ color: textPrimary }}>{formatDateTime(selectedRow.collectionUpdatedAt)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Note Field */}
                        <div className="flex flex-col gap-2 text-left">
                          <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Notes / Updates</label>
                          <textarea
                            rows={3}
                            placeholder="Type updates or notes here..."
                            className="w-full rounded-xl p-3 text-xs border focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all resize-none"
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                            value={notesText}
                            onChange={(e) => setNotesText(e.target.value)}
                          />
                          <div className="flex gap-2 justify-end mt-1">
                            <button
                              type="button"
                              disabled={savingNotes}
                              onClick={handleSaveNotes}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-500 hover:bg-slate-600 transition-all flex items-center gap-1.5 disabled:opacity-50 border-none"
                            >
                              {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Update Notes'}
                            </button>
                            {!selectedRow.collectionResolved && canResolve && (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmItem(selectedRow)
                                }}
                                className="px-5 py-2 rounded-xl text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600 transition-all flex items-center gap-1.5 border-none"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Resolve Collection
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Rebate Summary stats grid */}
                    <div className="px-6 py-5 flex flex-col gap-3" style={{ borderBottom: `1px solid ${border}` }}>
                      <div className="flex items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: border }}>
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textPrimary }}>Rebate Summary</span>
                        <span className="text-[11px] font-black tabular-nums" style={{ color: '#10B981' }}>₱{peso(rowExpenses?.rebatesForCollection)}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2">
                        {[
                          { label: 'Total', value: `₱${peso(rowExpenses?.rebatesForCollection)}`, color: '#10B981' },
                          { label: 'Scheduled', value: String(rowExpenses?.totalUnitsScheduled || 0), color: textPrimary },
                          { label: 'Installed', value: String(rowExpenses?.totalUnitsInstalled || 0), color: textPrimary },
                          { label: 'Serviced', value: String(rowExpenses?.totalUnitsServiced || 0), color: textPrimary },
                          { label: 'Cancelled', value: String(rowExpenses?.totalUnitsCancelled || 0), color: textPrimary },
                          { label: 'Free Install', value: String(rowExpenses?.totalUnitsFreeInstall || 0), color: textPrimary },
                          { label: 'Survey Only', value: String(rowExpenses?.totalUnitsSurveyOnly || 0), color: textPrimary },
                        ].map((item) => (
                          <div key={item.label} className="rounded-lg px-3 py-2" style={{ border: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                            <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>{item.label}</div>
                            <div className="mt-0.5 text-xs font-black tabular-nums" style={{ color: item.color }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Detailed Lists */}
                    {/* Cash Transactions */}
                    {renderItemTable('Cash Transactions', cashTxItems, [
                      { label: 'Name (Installer/Technician)', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: '#10B981' }}>₱{peso(item.amount)}</span> }
                    ])}

                    {/* Online Transactions */}
                    {renderItemTable('Online Transactions', onlineTxItems, [
                      { label: 'Installer', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                      { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                      { label: 'Bank', render: (item) => <span style={{ color: textPrimary }}>{item.bank || '—'}</span> },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: '#3B82F6' }}>₱{peso(item.amount)}</span> }
                    ])}

                    {/* Check Remits */}
                    {renderItemTable('Check Remits', checkItems, [
                      { label: 'Installer', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description.replace('CHECK|', ''))}</span> },
                      { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                      { label: 'Bank', render: (item) => <span style={{ color: textPrimary }}>{item.bank || '—'}</span> },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: '#3B82F6' }}>₱{peso(item.amount)}</span> }
                    ])}

                    {/* Cash Returns */}
                    {renderItemTable('Cash Returns', cashRetItems, [
                      { label: 'Returned By (Installer/Technician/Driver)', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description.replace('RETURN|', ''))}</span> },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: '#10B981' }}>₱{peso(item.amount)}</span> }
                    ])}

                    {/* Parts Sales / Unit Sales */}
                    {renderItemTable('Parts Sales / Unit Sales', partsSaleItems, [
                      { label: 'Customer', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                      { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[2] || '—'}</span> },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                    ])}

                    {/* Expenses with Receipts */}
                    {renderItemTable('Expenses with Receipts', expenseItems, [
                      { label: 'Name', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{item.description.split('|')[0] ? formatDisplayUserLabel(item.description.split('|')[0]) : '—'}</span> },
                      { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                      {
                        label: 'Receipt',
                        render: (item) => (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{
                            backgroundColor: item.receiptReturned ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                            color: item.receiptReturned ? '#10B981' : '#EF4444'
                          }}>
                            {item.receiptReturned ? 'UPLOADED' : 'PENDING'}
                          </span>
                        )
                      },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: '#EF4444' }}>₱{peso(item.amount)}</span> }
                    ])}

                    {/* Expenses for Purchase */}
                    {renderItemTable('Expenses for Purchase', purchaseItems, [
                      { label: 'Name', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{item.description.split('|')[0] ? formatDisplayUserLabel(item.description.split('|')[0]) : '—'}</span> },
                      { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                      {
                        label: 'Receipt',
                        render: (item) => (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{
                            backgroundColor: item.receiptReturned ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                            color: item.receiptReturned ? '#10B981' : '#F59E0B'
                          }}>
                            {item.receiptStatus || (item.receiptReturned ? 'UPLOADED' : 'PENDING')}
                          </span>
                        )
                      },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: '#F59E0B' }}>₱{peso(item.amount)}</span> }
                    ])}

                    {/* Parts Order / Units Order */}
                    {renderItemTable('Parts Order / Units Order', orderItems, [
                      { label: 'Customer', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                      { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[2] || '—'}</span> },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums" style={{ color: '#F59E0B' }}>₱{peso(item.amount)}</span> }
                    ])}

                    {/* Rebates Breakdown */}
                    {renderItemTable('Rebates Breakdown', rebateItems, [
                      { label: 'Company', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                      { label: 'Brand', render: (item) => <span style={{ color: textPrimary }}>{item.company || '—'}</span> },
                      {
                        label: 'HP',
                        render: (item) => (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                            {item.description.split('|')[2] || '—'}
                          </span>
                        )
                      },
                      { label: 'Rate', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                      { label: 'Unit', align: 'center', render: (item) => <span className="font-bold tabular-nums" style={{ color: textPrimary }}>{item.units || 1}</span> },
                      { label: 'Total', align: 'right', render: (item) => <span className="font-black tabular-nums text-emerald-600 dark:text-emerald-400">₱{peso(item.amount * (item.units || 1))}</span> }
                    ])}

                    {/* For Collection Breakdown */}
                    {renderItemTable('For Collection Breakdown', forCollItems, [
                      { label: 'Installer/Negotiator', render: (item) => <span className="font-bold" style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                      { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                      { label: 'Amount', align: 'right', render: (item) => <span className="font-black tabular-nums text-amber-500">₱{peso(item.amount)}</span> },
                      {
                        label: 'Status',
                        align: 'center',
                        render: (item) => (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{
                            backgroundColor: item.collectionResolved ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                            color: item.collectionResolved ? '#10B981' : '#F59E0B'
                          }}>
                            {item.collectionResolved ? 'RESOLVED' : 'PENDING'}
                          </span>
                        )
                      }
                    ])}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t flex items-center justify-between shrink-0"
                style={{ borderColor: border, backgroundColor: isLight ? 'rgba(248,250,252,0.8)' : 'rgba(6,11,24,0.5)' }}>
                <span className="text-[11px]" style={{ color: textMuted }}>
                  {user?.name && <>Viewing as <strong style={{ color: textPrimary }}>{user.name}</strong></>}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRow(null)}
                  className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 transition-all active:scale-95"
                  style={{ backgroundColor: '#10B981' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
