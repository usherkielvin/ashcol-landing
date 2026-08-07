import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NumericFormat } from 'react-number-format'
import {
  FileText, CreditCard, Clock, Plus, Search, Filter, Loader2,
  Check, X, ChevronLeft, AlertCircle, Trash2,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, isPortalAdmin } from '../utils/api'
import { AshcolFormHeader } from '../components/operations/AshcolFormHeader'
import { FormField, formInputStyle } from '../components/operations/FormField'

type TabId = 'cash-advance' | 'budget' | 'overtime'

interface LineItem { particulars: string; amount: number }
interface OtEntry {
  dateRequested: string
  timeIn: string
  reason: string
  otFrom: string
  otTo: string
  approvedBy: string
}

interface CashAdvance {
  id: string
  employeeId: string
  amount: number
  purpose: string
  status: string
  createdAt: string
  branchId?: string
}

interface BudgetRequest {
  id: string
  employeeId: string
  requestDate: string
  fromBranch?: string
  totalAmount: number
  status: string
  createdAt: string
  lineItemsJson?: string
}

interface OvertimeRequest {
  id: string
  employeeId: string
  employeeName?: string
  cutoffPeriod?: string
  status: string
  createdAt: string
  entriesJson?: string
}

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'cash-advance', label: 'Cash Advance', icon: CreditCard },
  { id: 'budget', label: 'Request for Budget', icon: FileText },
  { id: 'overtime', label: 'Overtime Authorization', icon: Clock },
]

const inputCls = 'w-full px-3 py-2 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatPeso(n: number) {
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getBranchLabel(id: string | null | undefined): string {
  if (!id) return ''
  return id.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').replace(/-/g, ' ').toUpperCase()
}

function emptyOtRows(count = 5): OtEntry[] {
  return Array.from({ length: count }, () => ({
    dateRequested: '', timeIn: '', reason: '', otFrom: '', otTo: '', approvedBy: '',
  }))
}

export default function OperationsForms() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const [searchParams, setSearchParams] = useSearchParams()

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const pageBg = isLight ? '#f8fafc' : '#060B18'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#ffffff' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const paperBg = isLight ? '#ffffff' : '#0D1528'
  const accent = '#10B981'
  const istyle = formInputStyle(inputBg, inputBorder, textPrimary)

  const activeTab = (searchParams.get('tab') as TabId) || 'cash-advance'
  const setActiveTab = (tab: TabId) => setSearchParams({ tab })

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role) || role === 'manager'

  const [view, setView] = useState<'list' | 'form'>('list')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [cashAdvances, setCashAdvances] = useState<CashAdvance[]>([])
  const [budgetRequests, setBudgetRequests] = useState<BudgetRequest[]>([])
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([])

  // Cash advance form
  const [caAmount, setCaAmount] = useState('')
  const [caPurpose, setCaPurpose] = useState('')
  const [caRepaymentMonths, setCaRepaymentMonths] = useState('1')

  // Budget form
  const [budgetDate, setBudgetDate] = useState(todayKey())
  const [budgetBranch, setBudgetBranch] = useState(getBranchLabel(user?.branchId))
  const [budgetDept, setBudgetDept] = useState('')
  const [budgetPo, setBudgetPo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CHECK' | 'PDC'>('CHECK')
  const [payeeName, setPayeeName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNo, setAccountNo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { particulars: '', amount: 0 },
    { particulars: '', amount: 0 },
    { particulars: '', amount: 0 },
  ])

  // Overtime form
  const [otName, setOtName] = useState(user?.name || '')
  const [otPosition, setOtPosition] = useState('')
  const [otDepartment, setOtDepartment] = useState('')
  const [otCutoff, setOtCutoff] = useState('')
  const [otEntries, setOtEntries] = useState<OtEntry[]>(emptyOtRows())

  const getToken = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const budgetTotal = useMemo(
    () => lineItems.reduce((sum, li) => sum + (li.amount || 0), 0),
    [lineItems]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const headers = { Authorization: `Bearer ${getToken()}` }
    const listEndpoint = isAdmin ? '' : '/my'

    try {
      if (activeTab === 'cash-advance') {
        const res = await fetch(`${API_BASE_URL}/hris/cash-advances${isAdmin ? '' : '/my'}`, { headers })
        if (res.ok) setCashAdvances(await res.json())
        else setError('Failed to load cash advance requests.')
      } else if (activeTab === 'budget') {
        const res = await fetch(`${API_BASE_URL}/operations/budget-requests${listEndpoint}`, { headers })
        if (res.ok) setBudgetRequests(await res.json())
        else setError('Failed to load budget requests.')
      } else {
        const res = await fetch(`${API_BASE_URL}/operations/overtime-requests${listEndpoint}`, { headers })
        if (res.ok) setOvertimeRequests(await res.json())
        else setError('Failed to load overtime requests.')
      }
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }, [activeTab, getToken, isAdmin])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    setView('list')
    setSearchQuery('')
    setStatusFilter('ALL')
  }, [activeTab])

  const resetForms = () => {
    setCaAmount('')
    setCaPurpose('')
    setCaRepaymentMonths('1')
    setBudgetDate(todayKey())
    setBudgetBranch(getBranchLabel(user?.branchId))
    setBudgetDept('')
    setBudgetPo('')
    setPaymentMethod('CHECK')
    setPayeeName('')
    setBankName('')
    setAccountNo('')
    setDueDate('')
    setLineItems([{ particulars: '', amount: 0 }, { particulars: '', amount: 0 }, { particulars: '', amount: 0 }])
    setOtName(user?.name || '')
    setOtPosition('')
    setOtDepartment('')
    setOtCutoff('')
    setOtEntries(emptyOtRows())
  }

  const openNewForm = () => {
    resetForms()
    setView('form')
  }

  const handleSubmitCashAdvance = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/hris/cash-advances`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(caAmount.replace(/,/g, '')),
          purpose: caPurpose,
          repaymentTermMonths: parseInt(caRepaymentMonths, 10) || 1,
          branchId: user?.branchId,
        }),
      })
      if (res.ok) {
        setView('list')
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || err.message || 'Failed to submit cash advance.')
      }
    } catch {
      setError('Failed to submit cash advance.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = lineItems.filter(li => li.particulars.trim())
    if (validItems.length === 0) {
      setError('Add at least one line item with particulars.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/operations/budget-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestDate: budgetDate,
          fromBranch: budgetBranch,
          fromDept: budgetDept,
          poNumber: budgetPo,
          paymentMethod,
          payeeName,
          bankName,
          accountNo,
          dueDate: dueDate || null,
          lineItemsJson: JSON.stringify(validItems),
          totalAmount: budgetTotal,
          branchId: user?.branchId,
        }),
      })
      if (res.ok) {
        setView('list')
        fetchData()
      } else {
        setError('Failed to submit budget request.')
      }
    } catch {
      setError('Failed to submit budget request.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault()
    const validEntries = otEntries.filter(en => en.dateRequested || en.reason)
    if (validEntries.length === 0) {
      setError('Add at least one overtime entry.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/operations/overtime-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: otName,
          position: otPosition,
          department: otDepartment,
          cutoffPeriod: otCutoff,
          entriesJson: JSON.stringify(validEntries),
          branchId: user?.branchId,
        }),
      })
      if (res.ok) {
        setView('list')
        fetchData()
      } else {
        setError('Failed to submit overtime request.')
      }
    } catch {
      setError('Failed to submit overtime request.')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusUpdate = async (type: TabId, id: string, status: string) => {
    const endpoints: Record<string, string> = {
      budget: `${API_BASE_URL}/operations/budget-requests/${id}/status`,
      overtime: `${API_BASE_URL}/operations/overtime-requests/${id}/status`,
      'cash-advance': `${API_BASE_URL}/hris/cash-advances/${id}/approve`,
    }
    const body = type === 'cash-advance' ? { status, notes: '' } : { status }
    try {
      const res = await fetch(endpoints[type], {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) fetchData()
    } catch { /* ignore */ }
  }

  const filteredCash = cashAdvances.filter(a =>
    (statusFilter === 'ALL' || a.status === statusFilter) &&
    (a.purpose || '').toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredBudget = budgetRequests.filter(b =>
    (statusFilter === 'ALL' || b.status === statusFilter) &&
    (b.fromBranch || '').toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredOt = overtimeRequests.filter(o =>
    (statusFilter === 'ALL' || o.status === statusFilter) &&
    (o.employeeName || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: isLight ? '#fef3c7' : 'rgba(234,179,8,0.15)',
      APPROVED: isLight ? '#dcfce7' : 'rgba(34,197,94,0.15)',
      NOTED: isLight ? '#dbeafe' : 'rgba(59,130,246,0.15)',
      REJECTED: isLight ? '#fee2e2' : 'rgba(239,68,68,0.15)',
      DISBURSED: isLight ? '#e0e7ff' : 'rgba(99,102,241,0.15)',
    }
    const textColors: Record<string, string> = {
      PENDING: '#b45309', APPROVED: '#15803d', NOTED: '#1d4ed8',
      REJECTED: '#dc2626', DISBURSED: '#4338ca',
    }
    return (
      <span
        className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
        style={{ backgroundColor: colors[status] || colors.PENDING, color: textColors[status] || textColors.PENDING }}
      >
        {status}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-5 min-h-full" style={{ backgroundColor: pageBg, color: textPrimary }}>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-1 flex items-center gap-2.5">
            <FileText className="w-7 h-7" style={{ color: accent }} />
            Operations Forms
          </h2>
          <p className="text-xs" style={{ color: textMuted }}>
            Submit cash advance, budget, and overtime authorization requests
          </p>
        </div>
        {view === 'list' && (
          <button
            onClick={openNewForm}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md hover:opacity-90 transition-all"
            style={{ backgroundColor: accent }}
          >
            <Plus className="w-4 h-4" />
            New {TABS.find(t => t.id === activeTab)?.label}
          </button>
        )}
        {view === 'form' && (
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
            style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textPrimary }}
          >
            <ChevronLeft className="w-4 h-4" />
            Back to list
          </button>
        )}
      </div>

      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{
            backgroundColor: isLight ? '#fef2f2' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isLight ? '#fecaca' : '#7f1d1d'}`,
            color: isLight ? '#dc2626' : '#f87171',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tab bar */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="p-3" style={{ borderBottom: `1px solid ${border}` }}>
          <div
            className="inline-flex p-1.5 rounded-xl shadow-inner max-w-full overflow-x-auto no-scrollbar gap-1"
            style={{ backgroundColor: isLight ? '#f1f5f9' : '#030712', border: `1px solid ${isLight ? '#e2e8f0' : '#1e293b'}` }}
          >
            {TABS.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm transition-colors whitespace-nowrap border outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]/50 ${
                    active
                      ? isLight
                        ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-slate-200 text-slate-900 font-bold'
                        : 'bg-gradient-to-b from-slate-700 to-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.4)] border-slate-600 text-white font-bold'
                      : isLight
                        ? 'text-slate-500 hover:text-slate-900 font-medium border-transparent'
                        : 'text-slate-400 hover:text-white font-medium border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" style={{ color: active ? accent : undefined }} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* List view toolbar */}
        {view === 'list' && (
          <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-3" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-56">
                <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: textMuted }} />
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`${inputCls} pl-9`}
                  style={istyle}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" style={{ color: textMuted }} />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className={`${inputCls} appearance-none`}
                  style={istyle}
                >
                  <option value="ALL">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="NOTED">Noted</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="DISBURSED">Disbursed</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* List view */}
        {view === 'list' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2" style={{ color: textMuted }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-xs font-semibold">Loading…</span>
              </div>
            ) : activeTab === 'cash-advance' ? (
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                    {['Date', 'Purpose', 'Amount', 'Status', ...(isAdmin ? ['Actions'] : [])].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-bold" style={{ borderBottom: `1px solid ${border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCash.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 5 : 4} className="text-center py-12" style={{ color: textMuted }}>No cash advance requests yet.</td></tr>
                  ) : filteredCash.map(a => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td className="px-4 py-3">{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 max-w-xs truncate">{a.purpose}</td>
                      <td className="px-4 py-3 font-bold">{formatPeso(a.amount)}</td>
                      <td className="px-4 py-3">{statusBadge(a.status)}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {a.status === 'PENDING' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleStatusUpdate('cash-advance', a.id, 'APPROVED')} className="p-1.5 rounded-lg bg-green-500/10 text-green-600"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleStatusUpdate('cash-advance', a.id, 'REJECTED')} className="p-1.5 rounded-lg bg-red-500/10 text-red-600"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeTab === 'budget' ? (
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                    {['Date', 'Branch', 'Total', 'Status', ...(isAdmin ? ['Actions'] : [])].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-bold" style={{ borderBottom: `1px solid ${border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBudget.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 5 : 4} className="text-center py-12" style={{ color: textMuted }}>No budget requests yet.</td></tr>
                  ) : filteredBudget.map(b => (
                    <tr key={b.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td className="px-4 py-3">{b.requestDate || new Date(b.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{b.fromBranch || '—'}</td>
                      <td className="px-4 py-3 font-bold">{formatPeso(Number(b.totalAmount))}</td>
                      <td className="px-4 py-3">{statusBadge(b.status)}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {b.status === 'PENDING' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleStatusUpdate('budget', b.id, 'NOTED')} className="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600">Note</button>
                              <button onClick={() => handleStatusUpdate('budget', b.id, 'APPROVED')} className="p-1.5 rounded-lg bg-green-500/10 text-green-600"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleStatusUpdate('budget', b.id, 'REJECTED')} className="p-1.5 rounded-lg bg-red-500/10 text-red-600"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                          {b.status === 'NOTED' && (
                            <button onClick={() => handleStatusUpdate('budget', b.id, 'APPROVED')} className="p-1.5 rounded-lg bg-green-500/10 text-green-600"><Check className="w-3.5 h-3.5" /></button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                    {['Date', 'Employee', 'Cut-off', 'Status', ...(isAdmin ? ['Actions'] : [])].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-bold" style={{ borderBottom: `1px solid ${border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOt.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 5 : 4} className="text-center py-12" style={{ color: textMuted }}>No overtime requests yet.</td></tr>
                  ) : filteredOt.map(o => (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td className="px-4 py-3">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{o.employeeName || '—'}</td>
                      <td className="px-4 py-3">{o.cutoffPeriod || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(o.status)}</td>
                      {isAdmin && o.status === 'PENDING' && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => handleStatusUpdate('overtime', o.id, 'APPROVED')} className="p-1.5 rounded-lg bg-green-500/10 text-green-600"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleStatusUpdate('overtime', o.id, 'REJECTED')} className="p-1.5 rounded-lg bg-red-500/10 text-red-600"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Form views */}
        {view === 'form' && (
          <div className="p-6 md:p-10">
            <div
              className="max-w-4xl mx-auto rounded-xl shadow-lg p-8 md:p-12"
              style={{ backgroundColor: paperBg, border: `1px solid ${isLight ? '#d1d5db' : border}` }}
            >
              {/* ── Cash Advance Form ── */}
              {activeTab === 'cash-advance' && (
                <form onSubmit={handleSubmitCashAdvance}>
                  <AshcolFormHeader
                    title="Cash Advance Request Form"
                    subtitle="For employee salary advance requests"
                    isLight={isLight}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                    border={border}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <FormField label="Employee Name">
                      <input className={inputCls} style={istyle} value={user?.name || ''} readOnly />
                    </FormField>
                    <FormField label="Branch">
                      <input className={inputCls} style={istyle} value={getBranchLabel(user?.branchId)} readOnly />
                    </FormField>
                    <FormField label="Date" required>
                      <input className={inputCls} style={istyle} type="date" value={todayKey()} readOnly />
                    </FormField>
                    <FormField label="Repayment Term (months)" required>
                      <select className={inputCls} style={istyle} value={caRepaymentMonths} onChange={e => setCaRepaymentMonths(e.target.value)}>
                        {[1, 2, 3, 4, 5, 6].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Amount (₱)" required colSpan={2}>
                      <NumericFormat
                        className={inputCls}
                        style={istyle}
                        thousandSeparator=","
                        decimalScale={2}
                        fixedDecimalScale
                        allowNegative={false}
                        placeholder="0.00"
                        value={caAmount}
                        onValueChange={v => setCaAmount(v.value)}
                        required
                      />
                    </FormField>
                    <FormField label="Purpose / Reason" required colSpan={2}>
                      <textarea
                        className={inputCls}
                        style={istyle}
                        rows={3}
                        value={caPurpose}
                        onChange={e => setCaPurpose(e.target.value)}
                        placeholder="State the purpose for this cash advance…"
                        required
                      />
                    </FormField>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 mt-6" style={{ borderTop: `1px solid ${border}` }}>
                    {['Requested by', 'Noted by', 'Approved by'].map(sig => (
                      <div key={sig} className="text-center">
                        <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{sig}</div>
                        <div className="text-[10px] mt-1" style={{ color: textMuted }}>Signature Over Printed Name</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2 mt-8">
                    <button type="button" onClick={() => setView('list')} className="px-5 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}>Cancel</button>
                    <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: accent }}>
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Submit Request
                    </button>
                  </div>
                </form>
              )}

              {/* ── Budget / Payment Request Form ── */}
              {activeTab === 'budget' && (
                <form onSubmit={handleSubmitBudget}>
                  <AshcolFormHeader
                    title="Request for Payment Form"
                    isLight={isLight}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                    border={border}
                  />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 text-xs">
                    <FormField label="To">
                      <input className={inputCls} style={istyle} value="Finance / Accounting Dept" readOnly />
                    </FormField>
                    <FormField label="Date" required>
                      <input className={inputCls} style={istyle} type="date" value={budgetDate} onChange={e => setBudgetDate(e.target.value)} required />
                    </FormField>
                    <FormField label="From — Branch" required>
                      <input className={inputCls} style={istyle} value={budgetBranch} onChange={e => setBudgetBranch(e.target.value)} required />
                    </FormField>
                    <FormField label="Dept.">
                      <input className={inputCls} style={istyle} value={budgetDept} onChange={e => setBudgetDept(e.target.value)} />
                    </FormField>
                    <FormField label="P.O. No.">
                      <input className={inputCls} style={istyle} value={budgetPo} onChange={e => setBudgetPo(e.target.value)} />
                    </FormField>
                  </div>

                  <p className="text-xs mb-4 leading-relaxed" style={{ color: textPrimary }}>
                    Please facilitate the processing of{' '}
                    {(['CASH', 'CHECK', 'PDC'] as const).map(m => (
                      <label key={m} className="inline-flex items-center gap-1 mx-1 cursor-pointer">
                        <input type="radio" name="payMethod" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} className="accent-emerald-600" />
                        <span className="font-bold">{m}</span>
                      </label>
                    ))}
                    {' '}for{' '}
                    <input className="inline-block w-32 px-1 py-0.5 border-b text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 0, border: 'none', borderBottom: `1px solid ${inputBorder}` }} value={payeeName} onChange={e => setPayeeName(e.target.value)} placeholder="payee name" />
                    {' '}with{' '}
                    <input className="inline-block w-28 px-1 py-0.5 border-b text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 0, border: 'none', borderBottom: `1px solid ${inputBorder}` }} value={bankName} onChange={e => setBankName(e.target.value)} placeholder="bank" />
                    {' '}account no.{' '}
                    <input className="inline-block w-24 px-1 py-0.5 border-b text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 0, border: 'none', borderBottom: `1px solid ${inputBorder}` }} value={accountNo} onChange={e => setAccountNo(e.target.value)} placeholder="acct #" />
                    {' '}due on{' '}
                    <input className="inline-block w-28 px-1 py-0.5 text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 4 }} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    {' '}as payment for the ff:
                  </p>

                  <table className="w-full text-xs mb-2" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                        <th className="text-left px-3 py-2 font-bold w-12" style={{ border: `1px solid ${border}` }}>#</th>
                        <th className="text-left px-3 py-2 font-bold" style={{ border: `1px solid ${border}` }}>PARTICULARS</th>
                        <th className="text-right px-3 py-2 font-bold w-36" style={{ border: `1px solid ${border}` }}>AMOUNT</th>
                        <th className="w-10" style={{ border: `1px solid ${border}` }} />
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-center font-bold" style={{ border: `1px solid ${border}` }}>{i + 1}</td>
                          <td style={{ border: `1px solid ${border}` }}>
                            <input
                              className="w-full px-2 py-1.5 text-xs focus:outline-none bg-transparent"
                              style={{ color: textPrimary }}
                              value={li.particulars}
                              onChange={e => {
                                const next = [...lineItems]
                                next[i] = { ...next[i], particulars: e.target.value }
                                setLineItems(next)
                              }}
                              placeholder="Description of item…"
                            />
                          </td>
                          <td style={{ border: `1px solid ${border}` }}>
                            <NumericFormat
                              className="w-full px-2 py-1.5 text-xs text-right focus:outline-none bg-transparent"
                              style={{ color: textPrimary }}
                              thousandSeparator=","
                              decimalScale={2}
                              fixedDecimalScale
                              allowNegative={false}
                              prefix="₱ "
                              value={li.amount || ''}
                              onValueChange={v => {
                                const next = [...lineItems]
                                next[i] = { ...next[i], amount: parseFloat(v.value) || 0 }
                                setLineItems(next)
                              }}
                            />
                          </td>
                          <td className="text-center" style={{ border: `1px solid ${border}` }}>
                            {lineItems.length > 1 && (
                              <button type="button" onClick={() => setLineItems(lineItems.filter((_, j) => j !== i))} className="p-1 text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#0B132B' }}>
                        <td colSpan={2} className="px-3 py-2 text-right font-black uppercase text-[10px] tracking-wider" style={{ border: `1px solid ${border}` }}>Total</td>
                        <td className="px-3 py-2 text-right font-black" style={{ border: `1px solid ${border}` }}>{formatPeso(budgetTotal)}</td>
                        <td style={{ border: `1px solid ${border}` }} />
                      </tr>
                    </tbody>
                  </table>
                  <button
                    type="button"
                    onClick={() => setLineItems([...lineItems, { particulars: '', amount: 0 }])}
                    className="text-[10px] font-bold mb-6 flex items-center gap-1"
                    style={{ color: accent }}
                  >
                    <Plus className="w-3 h-3" /> Add line item
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6" style={{ borderTop: `1px solid ${border}` }}>
                    <div className="text-center">
                      <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                      <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Requested by</div>
                      <div className="text-xs font-semibold mt-1">{user?.name}</div>
                      <div className="text-[9px] mt-0.5" style={{ color: textMuted }}>Signature Over Printed Name</div>
                    </div>
                    <div className="text-center">
                      <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                      <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Noted by</div>
                      <div className="text-[9px] mt-1" style={{ color: textMuted }}>Accounting Staff</div>
                    </div>
                    <div className="text-center">
                      <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                      <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Approved by</div>
                      <div className="text-[9px] mt-1" style={{ color: textMuted }}>VP / COO · President / CEO</div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-8">
                    <button type="button" onClick={() => setView('list')} className="px-5 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}>Cancel</button>
                    <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: accent }}>
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Submit Request
                    </button>
                  </div>
                </form>
              )}

              {/* ── Overtime Authorization Form ── */}
              {activeTab === 'overtime' && (
                <form onSubmit={handleSubmitOvertime}>
                  <AshcolFormHeader
                    title="Over Time Authorization Form"
                    subtitle="ASHCOL-OT-FORM V02"
                    isLight={isLight}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                    border={border}
                  />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    <FormField label="Employee Name" required>
                      <input className={inputCls} style={istyle} value={otName} onChange={e => setOtName(e.target.value)} required />
                    </FormField>
                    <FormField label="Position">
                      <input className={inputCls} style={istyle} value={otPosition} onChange={e => setOtPosition(e.target.value)} />
                    </FormField>
                    <FormField label="Department">
                      <input className={inputCls} style={istyle} value={otDepartment} onChange={e => setOtDepartment(e.target.value)} />
                    </FormField>
                    <FormField label="Cut Off Date" required>
                      <input className={inputCls} style={istyle} value={otCutoff} onChange={e => setOtCutoff(e.target.value)} placeholder="e.g. JUNE 1-15" required />
                    </FormField>
                  </div>

                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-[10px]" style={{ borderCollapse: 'collapse', minWidth: 700 }}>
                      <thead>
                        <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                          <th rowSpan={2} className="px-2 py-2 font-bold w-8" style={{ border: `1px solid ${border}` }}>#</th>
                          <th colSpan={4} className="px-2 py-1 font-bold text-center" style={{ border: `1px solid ${border}` }}>TO BE FILLED UP BY THE REQUESTER</th>
                          <th colSpan={2} className="px-2 py-1 font-bold text-center" style={{ border: `1px solid ${border}` }}>APPROVER</th>
                        </tr>
                        <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                          {['Date', 'Time In', 'Reason for Extending Work Hours', 'OT From', 'OT To', 'Approved By'].map(h => (
                            <th key={h} className="px-2 py-1.5 font-bold text-left" style={{ border: `1px solid ${border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {otEntries.map((en, i) => (
                          <tr key={i}>
                            <td className="text-center font-bold px-1" style={{ border: `1px solid ${border}` }}>{i + 1}</td>
                            {(['dateRequested', 'timeIn', 'reason', 'otFrom', 'otTo', 'approvedBy'] as const).map(field => (
                              <td key={field} style={{ border: `1px solid ${border}` }}>
                                <input
                                  className="w-full px-1.5 py-1.5 focus:outline-none bg-transparent"
                                  style={{ color: textPrimary }}
                                  type={field === 'dateRequested' ? 'date' : field.includes('ot') || field === 'timeIn' ? 'time' : 'text'}
                                  value={en[field]}
                                  onChange={e => {
                                    const next = [...otEntries]
                                    next[i] = { ...next[i], [field]: e.target.value }
                                    setOtEntries(next)
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOtEntries([...otEntries, { dateRequested: '', timeIn: '', reason: '', otFrom: '', otTo: '', approvedBy: '' }])}
                    className="text-[10px] font-bold mb-4 flex items-center gap-1"
                    style={{ color: accent }}
                  >
                    <Plus className="w-3 h-3" /> Add row
                  </button>

                  <p className="text-[9px] leading-relaxed mb-5 p-3 rounded-lg" style={{ backgroundColor: isLight ? '#f8fafc' : '#0B132B', color: textMuted, border: `1px solid ${border}` }}>
                    The employee is under no obligation to work more than 45 hours per week. All overtime is voluntary and may only be worked by agreement between employer and employee and must have written approval first. Maximum permissible overtime is 5 hours in a day if badly needed specially during peak season. I hereby declare above over time claims are true and correct. ART. 119. False Reporting. — It shall be unlawful for any person to make any statement, report, or record filed or kept pursuant to the provisions of this Code knowing such statement, report or record to be false in any material respect. (P.D. 442, Labor Code)
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4" style={{ borderTop: `1px solid ${border}` }}>
                    <div className="text-center">
                      <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                      <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Employee Name & Signature</div>
                      <div className="text-xs font-semibold mt-1">{otName}</div>
                    </div>
                    <div className="text-center">
                      <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                      <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>HR Manager</div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-8">
                    <button type="button" onClick={() => setView('list')} className="px-5 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}>Cancel</button>
                    <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: accent }}>
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Submit Authorization
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
