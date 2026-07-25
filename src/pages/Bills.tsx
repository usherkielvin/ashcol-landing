import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import {
  FileSpreadsheet, Calendar, Plus, FileText,
  Search, AlertCircle
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────
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

export default function Bills() {
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

  const [error, setError] = useState<string | null>(null)
  
  // Data lists
  const [bills, setBills] = useState<MonthlyBill[]>([])
  const [payments, setPayments] = useState<BillPayment[]>([])
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [billingMonthFilter, setBillingMonthFilter] = useState(() => new Date().toISOString().substring(0, 7))

  // Modals state
  const [showBillModal, setShowBillModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedBillPayment, setSelectedBillPayment] = useState<BillPayment | null>(null)

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
      const billsRes = await fetch(`${API_BASE_URL}/bills`, { headers })
      const paymentsRes = await fetch(`${API_BASE_URL}/bills/payments?month=${billingMonthFilter}`, { headers })
      if (billsRes.ok) setBills(await billsRes.json())
      if (paymentsRes.ok) setPayments(await paymentsRes.json())
    } catch (err: any) {
      setError(err?.message || 'Failed to sync data with the server.')
    }
  }, [billingMonthFilter, getToken])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Action Handlers ───────────────────────────────────────────────
  
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

  // Toggle Bill Active Status
  const handleToggleBillStatus = async (bill: MonthlyBill) => {
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/bills/${bill.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...bill, active: !bill.active })
      })
      if (res.ok) {
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

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
      }}
    >
      {/* ── Title Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-1 flex items-center gap-2.5">
            <FileSpreadsheet className="w-7 h-7" style={{ color: excelGreen }} />
            Recurring Bills Ledger
          </h2>
          <p className="text-xs" style={{ color: textMuted }}>
            Corporate recurring asset dues, utility bills, and payment cycles
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

      {/* ── Spreadsheet Layout ──────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-xl p-4 space-y-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: border }}>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3.5 top-3 w-4 h-4" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search bill configuration…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              />
            </div>

            {/* Month Filter */}
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
                className="px-3 py-2 rounded-xl text-xs font-bold hover:opacity-95 bg-slate-100 dark:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200"
              >
                Generate Cycle
              </button>
            </div>
          </div>

          {/* Add Bill button */}
          <div>
            <button
              onClick={() => setShowBillModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all"
            >
              <Plus className="w-4 h-4" /> Configure Recurring Bill
            </button>
          </div>
        </div>

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
                  <th style={{ width: 100 }}>Actions</th>
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
                    <td>
                      <button
                        onClick={() => handleToggleBillStatus(b)}
                        className="px-2 py-1 rounded bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 text-[10px] font-bold"
                      >
                        Toggle Status
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Excel Summary Row */}
                <tr className="excel-total-row">
                  <td colSpan={2}>Total Recurring Commits (Active Dues):</td>
                  <td>₱{billsSummaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} /mo</td>
                  <td colSpan={5}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Sheet Sub-Table B: PAYMENTS SCHEDULE LOG */}
        <div className="pt-4">
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

      {/* ── Modals: Configure Recurring Bill ─────────────────────── */}
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
                  placeholder="E.g., Office Rent, PLDT DSL"
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
                    <option value="RENT">Rent</option>
                    <option value="UTILITY">Utility / Power</option>
                    <option value="INTERNET">Internet / Wifi</option>
                    <option value="VEHICLE">Vehicle Loan / Insurance</option>
                    <option value="TAX">Taxes / Government Dues</option>
                    <option value="OTHER">Other Expense</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Dues Amount (PHP)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={billAmount}
                    onChange={e => setBillAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Day of Month Due</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="31"
                  value={billDueDay}
                  onChange={e => setBillDueDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Description</label>
                <textarea
                  rows={2}
                  value={billDescription}
                  onChange={e => setBillDescription(e.target.value)}
                  placeholder="Optional billing details…"
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
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Pay Bill ─────────────────────────────────────── */}
      {showPaymentModal && selectedBillPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-2">Record Bill Payment</h3>
            <p className="text-xs mb-4" style={{ color: textMuted }}>
              Settle payment for period {selectedBillPayment.billingMonth}.
            </p>
            <form onSubmit={handlePayBill} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Amount Paid (PHP)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Receipt URL / Link</label>
                <input
                  type="text"
                  placeholder="https://drive.google.com/..."
                  value={payReceipt}
                  onChange={e => setPayReceipt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Remarks</label>
                <textarea
                  rows={2}
                  value={payRemarks}
                  onChange={e => setPayRemarks(e.target.value.toUpperCase())}
                  placeholder="Payment transaction details or reference #…"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none uppercase"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, textTransform: 'uppercase' }}
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
                  Settle Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
