import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import {
  FileSpreadsheet, Calendar, CreditCard, Landmark, RefreshCw, Plus, Check, X,
  FileText, Search, Filter, AlertCircle, Upload
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


interface MonthlyBill {
  id: string
  billName: string
  category: string
  amount: number
  dueDayOfMonth: number
  description: string;
  active: boolean
  createdAt: string
}

interface BillPayment {
  id: string
  billId: string
  billingMonth: string
  dueDate: string
  paymentDate?: string
  amountPaid?: number
  status: string
  receiptUrl?: string
  remarks?: string
}

export default function HrisAndBills() {
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
  const [activeTab, setActiveTab] = useState<'leaves' | 'advances' | 'bills'>('leaves')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Data lists
  const [users, setUsers] = useState<User[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [advances, setAdvances] = useState<CashAdvance[]>([])
  const [bills, setBills] = useState<MonthlyBill[]>([])
  const [payments, setPayments] = useState<BillPayment[]>([])
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [billingMonthFilter, setBillingMonthFilter] = useState(() => new Date().toISOString().substring(0, 7))

  // Modals state
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [showBillModal, setShowBillModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedBillPayment, setSelectedBillPayment] = useState<BillPayment | null>(null)
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

  // Bill Config Form Fields
  const [billName, setBillName] = useState('')
  const [billCategory, setBillCategory] = useState('VEHICLE')
  const [billAmount, setBillAmount] = useState('')
  const [billDueDay, setBillDueDay] = useState('15')
  const [billDescription, setBillDescription] = useState('')

  // Pay Bill Form Fields
  const [payAmount, setPayAmount] = useState('')
  const [payReceipt, setPayReceipt] = useState('')
  const [payRemarks, setPayRemarks] = useState('')

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
    setLoading(true)
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
      } else if (activeTab === 'bills') {
        const billsRes = await fetch(`${API_BASE_URL}/bills`, { headers })
        const paymentsRes = await fetch(`${API_BASE_URL}/bills/payments?month=${billingMonthFilter}`, { headers })
        if (billsRes.ok) setBills(await billsRes.json())
        if (paymentsRes.ok) setPayments(await paymentsRes.json())
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sync data with the server.')
    } finally {
      setLoading(false)
    }
  }, [activeTab, billingMonthFilter, getToken])

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

  // Add Recurring Bill Configuration
  const handleAddBill = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/bills`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          billName,
          category: billCategory,
          amount: parseFloat(billAmount),
          dueDayOfMonth: parseInt(billDueDay),
          description: billDescription
        })
      })
      if (res.ok) {
        setShowBillModal(false)
        setBillName('')
        setBillAmount('')
        setBillDescription('')
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Generate Current Month Billing Cycle
  const handleGenerateBillingCycles = async () => {
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/bills/payments/generate?month=${billingMonthFilter}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Pay Bill
  const handlePayBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBillPayment) return
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/bills/payments/${selectedBillPayment.id}/pay`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amountPaid: parseFloat(payAmount) || undefined,
          receiptUrl: payReceipt || undefined,
          remarks: payRemarks
        })
      })
      if (res.ok) {
        setShowPaymentModal(false)
        setPayAmount('')
        setPayReceipt('')
        setPayRemarks('')
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

  // ── Bills Computations (Excel Summary) ─────────────────────────────
  const filteredBills = useMemo(() => {
    return bills.filter(b => b.billName.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [bills, searchQuery])

  const billsSummaryTotal = useMemo(() => {
    return filteredBills.reduce((sum, b) => sum + (b.active ? b.amount : 0), 0)
  }, [filteredBills])

  const paymentsSummary = useMemo(() => {
    let paidTotal = 0
    let unpaidTotal = 0
    payments.forEach(p => {
      const origBill = bills.find(b => b.id === p.billId)
      const amt = p.amountPaid || (origBill ? origBill.amount : 0)
      if (p.status === 'PAID') {
        paidTotal += amt
      } else {
        unpaidTotal += amt
      }
    })
    return { paidTotal, unpaidTotal, total: paidTotal + unpaidTotal }
  }, [payments, bills])

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
        // Set CSS Variables dynamically for theme matching
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
            HRIS & Bills Ledger
          </h2>
          <p className="text-xs" style={{ color: textMuted }}>
            Corporate human resources and recurring asset expense spreadsheets
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #10B981, #059669)',
            color: '#fff',
            opacity: loading ? 0.7 : 1,
            boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync Data
        </button>
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
            { id: 'advances', label: 'Cash Advances Sheet', icon: CreditCard },
            { id: 'bills', label: 'Recurring Bills Sheet', icon: Landmark }
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
                placeholder={activeTab === 'bills' ? "Search bill configuration…" : "Search employee name…"}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              />
            </div>

            {/* Filter status (for Leaves and Cash Advances) */}
            {activeTab !== 'bills' && (
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
            )}

            {/* Month Filter for Bills Payment Cycle */}
            {activeTab === 'bills' && (
              <div className="flex items-center gap-1.5 w-full md:w-auto">
                <Calendar className="w-3.5 h-3.5" style={{ color: textMuted }} />
                <input
                  type="month"
                  value={billingMonthFilter}
                  onChange={e => setBillingMonthFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
                <button
                  onClick={handleGenerateBillingCycles}
                  className="px-3 py-2 rounded-xl text-xs font-bold hover:opacity-95 bg-slate-100 dark:bg-slate-800 transition-colors"
                >
                  Generate Cycle
                </button>
              </div>
            )}
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
            {activeTab === 'bills' && (
              <button
                onClick={() => setShowBillModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Configure Recurring Bill
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

        {/* ── Recurring Bills split-sheets View ───────────────────── */}
        {activeTab === 'bills' && (
          <div className="flex flex-col gap-6">
            {/* Sheet Sub-Table A: CONFIGURATIONS */}
            <div>
              <div className="px-4 py-2 border-b font-bold text-xs bg-slate-50 dark:bg-slate-800/20 text-slate-500" style={{ borderColor: border }}>
                A. RECURRING MONTHLY DUES CONFIGURATION (ASSETS & LIABILITIES)
              </div>
              <div className="overflow-x-auto">
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th>Bill Name</th>
                      <th>Category</th>
                      <th>Monthly Dues Amount</th>
                      <th>Day of Month Due</th>
                      <th>Description</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="font-semibold">{b.billName}</td>
                        <td>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {b.category}
                          </span>
                        </td>
                        <td className="font-semibold">₱{b.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>{b.dueDayOfMonth}th of month</td>
                        <td className="text-xs text-slate-500">{b.description || '—'}</td>
                        <td>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                            style={{
                              backgroundColor: b.active ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
                              color: b.active ? '#10B981' : '#64748b'
                            }}
                          >
                            {b.active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {/* Excel Summary Row */}
                    <tr className="excel-total-row">
                      <td colSpan={2}>Total Recurring Commits (Active Dues):</td>
                      <td>₱{billsSummaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} /mo</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sheet Sub-Table B: PAYMENTS SCHEDULE LOG */}
            <div>
              <div className="px-4 py-2 border-b font-bold text-xs bg-slate-50 dark:bg-slate-800/20 text-slate-500" style={{ borderColor: border }}>
                B. BILL PAYMENTS SCHEDULE FOR CYCLING MONTH: {billingMonthFilter}
              </div>
              <div className="overflow-x-auto">
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th>Bill Name</th>
                      <th>Billing Period</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Amount Paid</th>
                      <th>Payment Date</th>
                      <th>Receipt File</th>
                      <th style={{ width: 100 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => {
                      const origBill = bills.find(b => b.id === p.billId)
                      const billTitle = origBill ? origBill.billName : 'Unknown Config'
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="font-semibold">{billTitle}</td>
                          <td className="font-mono text-xs">{p.billingMonth}</td>
                          <td className="font-medium">{p.dueDate}</td>
                          <td>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                              style={{
                                backgroundColor: p.status === 'PAID' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                color: p.status === 'PAID' ? '#10B981' : '#EF4444'
                              }}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="font-semibold">
                            {p.amountPaid ? `₱${p.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}</td>
                          <td>
                            {p.receiptUrl ? (
                              <a
                                href={p.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-500 font-bold hover:underline inline-flex items-center gap-1 text-[11px]"
                              >
                                <FileText className="w-3 h-3" /> View Receipt
                              </a>
                            ) : '—'}
                          </td>
                          <td>
                            {p.status === 'UNPAID' ? (
                              <button
                                onClick={() => {
                                  setSelectedBillPayment(p)
                                  setPayAmount((origBill ? origBill.amount : '').toString())
                                  setShowPaymentModal(true)
                                }}
                                className="px-2.5 py-1 rounded bg-[#10B981] hover:bg-[#059669] text-white font-bold text-[10px]"
                              >
                                Pay Bill
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold select-none">Settled</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {/* Excel Summary Row */}
                    <tr className="excel-total-row">
                      <td colSpan={3}>Month Totals Paid:</td>
                      <td>₱{paymentsSummary.paidTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td colSpan={2}>Outstanding: ₱{paymentsSummary.unpaidTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td colSpan={2}>Grand Total Dues: ₱{paymentsSummary.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
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
                <label className="text-xs font-bold mb-1.5 block">Requested Amount (₱)</label>
                <input
                  type="number"
                  required
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
                  <option value="3">3 Months</option>
                  <option value="6">6 Months</option>
                  <option value="12">12 Months</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Purpose</label>
                <textarea
                  required
                  rows={3}
                  value={advancePurpose}
                  onChange={e => setAdvancePurpose(e.target.value)}
                  placeholder="Describe the purpose of cash advance request…"
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
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Pay Bill Dues ────────────────────────────────── */}
      {showPaymentModal && selectedBillPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">Settle Monthly Bill Dues</h3>
            <form onSubmit={handlePayBill} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Amount Paid (₱)</label>
                <input
                  type="number"
                  required
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Receipt File URL (Dummy/Simulated)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="https://example.com/receipt.pdf"
                    value={payReceipt}
                    onChange={e => setPayReceipt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                  <button
                    type="button"
                    onClick={() => setPayReceipt('/uploads/receipts/bill_receipt_' + Date.now() + '.pdf')}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-[#10B981]"
                    title="Simulate Upload"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Remarks</label>
                <textarea
                  rows={2}
                  value={payRemarks}
                  onChange={e => setPayRemarks(e.target.value)}
                  placeholder="Dues reference numbers or payment confirmation remarks…"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
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
                  Complete Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Configure Recurring Monthly Bill ─────────────── */}
      {showBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowBillModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">Configure Recurring Bill</h3>
            <form onSubmit={handleAddBill} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Bill Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Toyota Fortuner (Plate: ABC-1234)"
                  value={billName}
                  onChange={e => setBillName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Category</label>
                  <select
                    value={billCategory}
                    onChange={e => setBillCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  >
                    <option value="VEHICLE">Vehicle Lease</option>
                    <option value="RENT">Office Rent</option>
                    <option value="UTILITIES">Utilities</option>
                    <option value="OTHER">Other Expense</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Monthly Amount (₱)</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={billAmount}
                    onChange={e => setBillAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Due Day of Month</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={billDueDay}
                  onChange={e => setBillDueDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Description / Remarks</label>
                <textarea
                  rows={2}
                  value={billDescription}
                  onChange={e => setBillDescription(e.target.value)}
                  placeholder="Asset description or bank lease details…"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBillModal(false)}
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
                  Create Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Log Repayment for Cash Advance ───────────────── */}
      {showRepaymentModal && selectedAdvance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowRepaymentModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">Log Cash Advance Repayment</h3>
            <form onSubmit={handleLogRepayment} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Repayment Amount (₱)</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={repayAmount}
                  onChange={e => setRepayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Deduction Method</label>
                <select
                  value={repayMethod}
                  onChange={e => setRepayMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  <option value="CASH_PAYMENT">Cash Payment (Over Counter)</option>
                  <option value="PAYROLL_DEDUCTION">Payroll Deduction</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Remarks</label>
                <textarea
                  rows={2}
                  value={repayRemarks}
                  onChange={e => setRepayRemarks(e.target.value)}
                  placeholder="Enter receipt references or payroll comments…"
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
