import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import {
  FileSpreadsheet, Calendar, CreditCard, Plus, Check, X,
  Search, Filter, AlertCircle
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────
interface User {
  id: string
  name: string
  email: string
  role: string
}

interface LeaveRequest {
  id: string
  employeeId: string
  leaveType: string
  startDate: string
  endDate: string
  reason: string
  status: string
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  attachmentUrl?: string
  createdAt: string
}

interface LeaveBalance {
  id: string
  employeeId: string
  year: number
  vacationAllocated: number
  vacationUsed: number
  sickAllocated: number
  sickUsed: number
  emergencyAllocated: number
  emergencyUsed: number
}

interface CashAdvance {
  id: string
  employeeId: string
  amount: number
  repaymentTermMonths: number
  monthlyDeduction: number
  purpose: string
  status: string
  approvedBy?: string
  approvedAt?: string
  disbursedAt?: string
  remainingBalance: number
  createdAt: string;
}

export default function Hris() {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  // Theme Colors
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const pageBg      = isLight ? '#f8fafc' : '#060B18'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#ffffff' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const excelGreen  = '#10B981'

  // ── States ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'leaves' | 'advances'>('leaves')

  const [error, setError] = useState<string | null>(null)
  
  // Data lists
  const [users, setUsers] = useState<User[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [advances, setAdvances] = useState<CashAdvance[]>([])
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Modals state
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [selectedAdvance, setSelectedAdvance] = useState<CashAdvance | null>(null)
  const [showRepaymentModal, setShowRepaymentModal] = useState(false)

  // Leave Form Fields
  const [leaveType, setLeaveType] = useState('VACATION')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')

  // Cash Advance Form Fields
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceTerms, setAdvanceTerms] = useState('3')
  const [advancePurpose, setAdvancePurpose] = useState('')

  // Cash Advance Repayment Fields
  const [repayAmount, setRepayAmount] = useState('')
  const [repayMethod, setRepayMethod] = useState('CASH_PAYMENT')
  const [repayRemarks, setRepayRemarks] = useState('')

  // ── Helper: Get JWT Token ─────────────────────────────────────────
  const getToken = useCallback((): string => {
    return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
  }, [])

  // ── Fetch Operations ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setError(null)
    const token = getToken()
    const headers = { Authorization: `Bearer ${token}` }

    try {
      // Fetch users
      const usersRes = await fetch(`${API_BASE_URL}/user/all`, { headers })
      if (usersRes.ok) {
        const uData = await usersRes.json()
        setUsers(uData?.data || uData || [])
      }

      if (activeTab === 'leaves') {
        const leavesRes = await fetch(`${API_BASE_URL}/hris/leaves`, { headers })
        const balancesRes = await fetch(`${API_BASE_URL}/hris/leaves/balances`, { headers })
        if (leavesRes.ok) setLeaves(await leavesRes.json())
        if (balancesRes.ok) setBalances(await balancesRes.json())
      } else if (activeTab === 'advances') {
        const advancesRes = await fetch(`${API_BASE_URL}/hris/cash-advances`, { headers })
        if (advancesRes.ok) setAdvances(await advancesRes.json())
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sync data with the server.')
    }
  }, [activeTab, getToken])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── User ID Helper ───────────────────────────────────────────────
  const getUserName = (userId: string) => {
    const found = users.find(u => u.id === userId)
    return found ? found.name : 'Unknown Employee'
  }

  // ── Action Handlers ───────────────────────────────────────────────
  
  // Submit Leave Request
  const handleLeaveRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/leaves`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          leaveType,
          startDate: leaveStart,
          endDate: leaveEnd,
          reason: leaveReason
        })
      })
      if (res.ok) {
        setShowLeaveModal(false)
        setLeaveReason('')
        setLeaveStart('')
        setLeaveEnd('')
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Approve/Reject Leave
  const handleLeaveApproval = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const token = getToken()
    const rejectionReason = status === 'REJECTED' ? prompt('Enter reason for rejection:') : null
    if (status === 'REJECTED' && rejectionReason === null) return

    try {
      const res = await fetch(`${API_BASE_URL}/hris/leaves/${id}/approve`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, rejectionReason })
      })
      if (res.ok) {
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Submit Cash Advance Request
  const handleAdvanceRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/cash-advances`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: parseFloat(advanceAmount),
          repaymentTermMonths: parseInt(advanceTerms),
          purpose: advancePurpose
        })
      })
      if (res.ok) {
        setShowAdvanceModal(false)
        setAdvanceAmount('')
        setAdvancePurpose('')
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Approve/Disburse Cash Advance
  const handleAdvanceApproval = async (id: string, status: 'APPROVED' | 'DISBURSED' | 'REJECTED') => {
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/cash-advances/${id}/approve`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      })
      if (res.ok) {
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Log Repayment
  const handleLogRepayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAdvance) return
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/cash-advances/${selectedAdvance.id}/repayments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: parseFloat(repayAmount),
          deductionMethod: repayMethod,
          remarks: repayRemarks
        })
      })
      if (res.ok) {
        setShowRepaymentModal(false)
        setRepayAmount('')
        setRepayRemarks('')
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // ── Leaves Computations (Excel Summary) ───────────────────────────
  const filteredLeaves = useMemo(() => {
    return leaves.filter(l => {
      const matchesSearch = getUserName(l.employeeId).toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' ? true : l.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [leaves, searchQuery, statusFilter, users])

  const leavesSummary = useMemo(() => {
    const total = filteredLeaves.length
    const pending = filteredLeaves.filter(l => l.status === 'PENDING').length
    const approved = filteredLeaves.filter(l => l.status === 'APPROVED').length
    return { total, pending, approved }
  }, [filteredLeaves])

  // ── Cash Advances Computations (Excel Summary) ────────────────────
  const filteredAdvances = useMemo(() => {
    return advances.filter(a => {
      const matchesSearch = getUserName(a.employeeId).toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' ? true : a.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [advances, searchQuery, statusFilter, users])

  const advancesSummary = useMemo(() => {
    let originalSum = 0
    let remainingSum = 0
    filteredAdvances.forEach(a => {
      originalSum += a.amount
      remainingSum += a.remainingBalance
    })
    return {
      originalSum,
      remainingSum,
      paidSum: originalSum - remainingSum
    }
  }, [filteredAdvances])

  // ── CSS Injection for spreadsheet cells ───────────────────────────
  useEffect(() => {
    const id = 'excel-workspace-styles'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      .excel-table { border-collapse: collapse; width: 100%; font-size: 13px; }
      .excel-table th { font-weight: 700; text-align: left; padding: 8px 12px; border: 1px solid var(--excel-border); background: var(--excel-header-bg); color: var(--excel-header-text); }
      .excel-table td { padding: 6px 12px; border: 1px solid var(--excel-border); color: var(--excel-cell-text); }
      .excel-total-row td { font-weight: 800; background: var(--excel-total-bg); border-top: 2px solid var(--excel-border); border-bottom: 2px double var(--excel-border); }
      .excel-tab-bar { display: flex; border-bottom: 1px solid var(--excel-border); background: var(--excel-tab-bar-bg); }
      .excel-tab { padding: 8px 24px; font-weight: 700; border-right: 1px solid var(--excel-border); cursor: pointer; transition: all 0.15s; font-size: 13px; position: relative; }
      .excel-tab-active { background: var(--excel-tab-active-bg); color: #10B981; border-top: 3px solid #10B981; font-weight: 800; }
    `
    document.head.appendChild(style)
  }, [])

  return (
    <div
      className="flex flex-col gap-5 min-h-full"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: pageBg,
        color: textPrimary,
        ['--excel-border' as any]: border,
        ['--excel-header-bg' as any]: isLight ? '#f1f5f9' : '#0F1A2E',
        ['--excel-header-text' as any]: textPrimary,
        ['--excel-cell-text' as any]: textPrimary,
        ['--excel-total-bg' as any]: isLight ? '#f8fafc' : '#0B132B',
        ['--excel-tab-bar-bg' as any]: isLight ? '#e2e8f0' : '#070C19',
        ['--excel-tab-active-bg' as any]: cardBg,
      }}
    >
      {/* ── Title Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-1 flex items-center gap-2.5">
            <FileSpreadsheet className="w-7 h-7" style={{ color: excelGreen }} />
            HRIS Ledger
          </h2>
          <p className="text-xs" style={{ color: textMuted }}>
            Corporate human resources, leaves, and cash advance spreadsheets
          </p>
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────────────── */}
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
          <span className="text-xs font-semibold">{error}</span>
        </div>
      )}

      {/* ── Excel style sheet tabs ───────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="excel-tab-bar">
          {[
            { id: 'leaves', label: 'Leaves Sheet', icon: Calendar },
            { id: 'advances', label: 'Cash Advances Sheet', icon: CreditCard }
          ].map(tab => {
            const TabIcon = tab.icon
            const active = activeTab === tab.id
            return (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any)
                  setStatusFilter('ALL')
                  setSearchQuery('')
                }}
                className={`excel-tab flex items-center gap-2 ${active ? 'excel-tab-active' : ''}`}
                style={{ borderRightColor: border }}
              >
                <TabIcon className="w-4 h-4" style={{ color: active ? excelGreen : textMuted }} />
                {tab.label}
              </div>
            )
          })}
        </div>

        {/* Filter & Toolbar Area */}
        <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3.5 top-3 w-4 h-4" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search employee name…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              />
            </div>

            {/* Filter status */}
            <div className="flex items-center gap-1.5 w-full md:w-auto">
              <Filter className="w-3.5 h-3.5" style={{ color: textMuted }} />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-bold appearance-none focus:outline-none"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              >
                <option value="ALL">Status: All</option>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                {activeTab === 'leaves' ? (
                  <option value="REJECTED">REJECTED</option>
                ) : (
                  <>
                    <option value="DISBURSED">DISBURSED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="FULLY_PAID">FULLY PAID</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Add Request Buttons */}
          <div>
            {activeTab === 'leaves' && (
              <button
                onClick={() => setShowLeaveModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Apply Leave
              </button>
            )}
            {activeTab === 'advances' && (
              <button
                onClick={() => setShowAdvanceModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Request Cash Advance
              </button>
            )}
          </div>
        </div>

        {/* ── Leaves Grid Table View ─────────────────────────────── */}
        {activeTab === 'leaves' && (
          <>
            <div className="overflow-x-auto">
              <table className="excel-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Employee Name</th>
                    <th>Leave Type</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                    <th>Approved By</th>
                    <th>Approved At</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaves.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="font-mono text-xs select-all">{l.id.substring(0, 8).toUpperCase()}</td>
                      <td className="font-semibold">{getUserName(l.employeeId)}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase"
                          style={{
                            backgroundColor: l.leaveType === 'SICK' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                            color: l.leaveType === 'SICK' ? '#EF4444' : '#3B82F6'
                          }}
                        >
                          {l.leaveType}
                        </span>
                      </td>
                      <td className="font-medium">{l.startDate}</td>
                      <td className="font-medium">{l.endDate}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                          style={{
                            backgroundColor: l.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : l.status === 'APPROVED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: l.status === 'PENDING' ? '#F59E0B' : l.status === 'APPROVED' ? '#10B981' : '#EF4444'
                          }}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td>{l.approvedBy ? getUserName(l.approvedBy) : '—'}</td>
                      <td>{l.approvedAt ? new Date(l.approvedAt).toLocaleDateString() : '—'}</td>
                      <td>
                        {l.status === 'PENDING' ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleLeaveApproval(l.id, 'APPROVED')}
                              className="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                              title="Approve Leave"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleLeaveApproval(l.id, 'REJECTED')}
                              className="p-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              title="Reject Leave"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-semibold select-none">No Action</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* Excel Summary Row */}
                  <tr className="excel-total-row">
                    <td colSpan={2}>Total Leaves Count:</td>
                    <td>{leavesSummary.total} Total</td>
                    <td colSpan={2}>Approved: {leavesSummary.approved}</td>
                    <td>Pending: {leavesSummary.pending}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* Sheet Sub-Table B: LEAVE BALANCES */}
            <div className="mt-6">
              <div className="px-4 py-2 border-b font-bold text-xs bg-slate-50 dark:bg-slate-800/20 text-slate-500" style={{ borderColor: border }}>
                B. EMPLOYEE LEAVE CREDITS BALANCES SHEET
              </div>
              <div className="overflow-x-auto border-t">
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Year</th>
                      <th>Vacation (Allocated)</th>
                      <th>Vacation (Used)</th>
                      <th>Sick (Allocated)</th>
                      <th>Sick (Used)</th>
                      <th>Emergency (Allocated)</th>
                      <th>Emergency (Used)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="font-semibold">{getUserName(b.employeeId)}</td>
                        <td className="font-mono text-xs">{b.year}</td>
                        <td>{b.vacationAllocated}</td>
                        <td className="text-rose-500 font-medium">{b.vacationUsed}</td>
                        <td>{b.sickAllocated}</td>
                        <td className="text-rose-500 font-medium">{b.sickUsed}</td>
                        <td>{b.emergencyAllocated}</td>
                        <td className="text-rose-500 font-medium">{b.emergencyUsed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Cash Advances Grid Table View ───────────────────────── */}
        {activeTab === 'advances' && (
          <div className="overflow-x-auto">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Employee Name</th>
                  <th>Request Amount</th>
                  <th>Term (Months)</th>
                  <th>Monthly Deduction</th>
                  <th>Remaining Balance</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th style={{ width: 150 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdvances.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="font-mono text-xs select-all">{a.id.substring(0, 8).toUpperCase()}</td>
                    <td className="font-semibold">{getUserName(a.employeeId)}</td>
                    <td className="font-semibold">₱{a.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{a.repaymentTermMonths} mo</td>
                    <td className="font-medium text-slate-500">₱{a.monthlyDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="font-black text-rose-500">₱{a.remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                        style={{
                          backgroundColor: a.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : a.status === 'APPROVED' ? 'rgba(59,130,246,0.1)' : a.status === 'DISBURSED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: a.status === 'PENDING' ? '#F59E0B' : a.status === 'APPROVED' ? '#3B82F6' : a.status === 'DISBURSED' ? '#10B981' : '#EF4444'
                        }}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {a.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleAdvanceApproval(a.id, 'APPROVED')}
                              className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[10px] font-bold"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleAdvanceApproval(a.id, 'REJECTED')}
                              className="px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[10px] font-bold"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {a.status === 'APPROVED' && (
                          <button
                            onClick={() => handleAdvanceApproval(a.id, 'DISBURSED')}
                            className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold"
                          >
                            Disburse
                          </button>
                        )}
                        {a.status === 'DISBURSED' && (
                          <button
                            onClick={() => {
                              setSelectedAdvance(a)
                              setShowRepaymentModal(true)
                            }}
                            className="px-2 py-1 rounded bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 text-[10px] font-bold"
                          >
                            Repay Dues
                          </button>
                        )}
                        {a.status === 'FULLY_PAID' && (
                          <span className="text-[10px] text-slate-400 font-bold select-none">Fully Paid Log</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Excel Summary Row */}
                <tr className="excel-total-row">
                  <td colSpan={2}>Grand Totals:</td>
                  <td>₱{advancesSummary.originalSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td colSpan={2}>Paid Back: ₱{advancesSummary.paidSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-rose-500">₱{advancesSummary.remainingSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td colSpan={3}>Remaining Balance Dues</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals: Apply Leave ──────────────────────────────────── */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLeaveModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">Apply for Leave</h3>
            <form onSubmit={handleLeaveRequest} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={e => setLeaveType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  <option value="VACATION">Vacation Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="EMERGENCY">Emergency Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Start Date</label>
                  <input
                    type="date"
                    required
                    value={leaveStart}
                    onChange={e => setLeaveStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block">End Date</label>
                  <input
                    type="date"
                    required
                    value={leaveEnd}
                    onChange={e => setLeaveEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Reason</label>
                <textarea
                  required
                  rows={3}
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  placeholder="State the reason for leave request…"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ backgroundColor: excelGreen }}
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Request Cash Advance ─────────────────────────── */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAdvanceModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">Request Cash Advance</h3>
            <form onSubmit={handleAdvanceRequest} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Advance Amount (PHP)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={advanceAmount}
                  onChange={e => setAdvanceAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Repayment Term (Months)</label>
                <select
                  value={advanceTerms}
                  onChange={e => setAdvanceTerms(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  <option value="1">1 Month</option>
                  <option value="2">2 Months</option>
                  <option value="3">3 Months</option>
                  <option value="6">6 Months</option>
                  <option value="12">12 Months</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Purpose / Reason</label>
                <textarea
                  required
                  rows={3}
                  value={advancePurpose}
                  onChange={e => setAdvancePurpose(e.target.value)}
                  placeholder="State the reason/purpose of this cash advance…"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ backgroundColor: excelGreen }}
                >
                  Request Advance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Log Cash Advance Repayment ───────────────────── */}
      {showRepaymentModal && selectedAdvance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowRepaymentModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-2">Log Repayment Payment</h3>
            <p className="text-xs mb-4" style={{ color: textMuted }}>
              Log a payment for {getUserName(selectedAdvance.employeeId)}'s cash advance.
              Remaining balance: <span className="font-bold text-rose-500">₱{selectedAdvance.remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </p>
            <form onSubmit={handleLogRepayment} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Repayment Amount paid (PHP)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  max={selectedAdvance.remainingBalance.toString()}
                  placeholder="0.00"
                  value={repayAmount}
                  onChange={e => setRepayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Deduction / Payment Method</label>
                <select
                  value={repayMethod}
                  onChange={e => setRepayMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  <option value="CASH_PAYMENT">Cash Payment (Over-the-counter)</option>
                  <option value="SALARY_DEDUCTION">Salary Deduction (Payroll deduction)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Remarks</label>
                <textarea
                  rows={2}
                  value={repayRemarks}
                  onChange={e => setRepayRemarks(e.target.value)}
                  placeholder="E.g., paid cash for June cycle installment…"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRepaymentModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ backgroundColor: excelGreen }}
                >
                  Log Repayment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
