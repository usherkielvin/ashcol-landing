import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import {
  FileSpreadsheet, Calendar, RefreshCw, Plus, Upload, Search, AlertCircle
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────
interface TelecomAccount {
  id: string
  user: string
  branch: string
  remarks: string
  telecom: string
  accountNumber: string
  contactNumber: string
  renewal: string
  monthlyPlan: number
  dueDates: string
  active: boolean
  createdAt: string
}

interface TelecomPayment {
  id: string
  telecomAccountId: string
  billingMonth: string
  dueDate?: string
  paymentDate?: string
  amountPaid?: number
  status: string
}

export default function Telecom() {
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  
  // Data lists
  const [telecomAccounts, setTelecomAccounts] = useState<TelecomAccount[]>([])
  const [telecomPayments, setTelecomPayments] = useState<TelecomPayment[]>([])
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [billingMonthFilter, setBillingMonthFilter] = useState(() => new Date().toISOString().substring(0, 7))

  // Telecom Form Fields
  const [showTelecomAccountModal, setShowTelecomAccountModal] = useState(false)
  const [editingTelecomAccount, setEditingTelecomAccount] = useState<TelecomAccount | null>(null)
  const [telUser, setTelUser] = useState('')
  const [telBranch, setTelBranch] = useState('')
  const [telRemarks, setTelRemarks] = useState('')
  const [telTelecom, setTelTelecom] = useState('GLOBE')
  const [telAccountNumber, setTelAccountNumber] = useState('')
  const [telContactNumber, setTelContactNumber] = useState('')
  const [telRenewal, setTelRenewal] = useState('')
  const [telMonthlyPlan, setTelMonthlyPlan] = useState('')
  const [telDueDates, setTelDueDates] = useState('')

  // Telecom Log Dues Form Fields
  const [showTelecomPaymentModal, setShowTelecomPaymentModal] = useState(false)
  const [selectedTelecomPayment, setSelectedTelecomPayment] = useState<TelecomPayment | null>(null)
  const [telPayAmount, setTelPayAmount] = useState('')
  const [telPayStatus, setTelPayStatus] = useState('PAID')
  const [telPayDate, setTelPayDate] = useState(() => new Date().toISOString().substring(0, 10))

  const fileInputRef = useRef<HTMLInputElement>(null)

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
      const telecomRes = await fetch(`${API_BASE_URL}/telecom/accounts`, { headers })
      const telPaymentsRes = await fetch(`${API_BASE_URL}/telecom/payments?month=${billingMonthFilter}`, { headers })
      if (telecomRes.ok) setTelecomAccounts(await telecomRes.json())
      if (telPaymentsRes.ok) setTelecomPayments(await telPaymentsRes.json())
    } catch (err: any) {
      setError(err?.message || 'Failed to sync data with the server.')
    } finally {
      setLoading(false)
    }
  }, [billingMonthFilter, getToken])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Action Handlers ───────────────────────────────────────────────
  
  // Submit Telecom Account (Create or Update)
  const handleTelecomAccountRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    const url = editingTelecomAccount 
      ? `${API_BASE_URL}/telecom/accounts/${editingTelecomAccount.id}` 
      : `${API_BASE_URL}/telecom/accounts`
    const method = editingTelecomAccount ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user: telUser,
          branch: telBranch,
          remarks: telRemarks,
          telecom: telTelecom,
          accountNumber: telAccountNumber,
          contactNumber: telContactNumber,
          renewal: telRenewal || null,
          monthlyPlan: parseFloat(telMonthlyPlan) || 0,
          dueDates: telDueDates,
          active: editingTelecomAccount ? editingTelecomAccount.active : true
        })
      })
      if (res.ok) {
        setShowTelecomAccountModal(false)
        setEditingTelecomAccount(null)
        setTelUser('')
        setTelBranch('')
        setTelRemarks('')
        setTelTelecom('GLOBE')
        setTelAccountNumber('')
        setTelContactNumber('')
        setTelRenewal('')
        setTelMonthlyPlan('')
        setTelDueDates('')
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Generate Telecom Payments
  const handleGenerateTelecomPayments = async () => {
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/telecom/payments/generate?month=${billingMonthFilter}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Log Telecom Payment
  const handlePayTelecom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTelecomPayment) return
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/telecom/payments/${selectedTelecomPayment.id}/pay`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: telPayStatus,
          amountPaid: telPayStatus === 'PAID' ? parseFloat(telPayAmount) : undefined,
          datePaid: telPayStatus === 'PAID' ? telPayDate : undefined
        })
      })
      if (res.ok) {
        setShowTelecomPaymentModal(false)
        setSelectedTelecomPayment(null)
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Excel file upload import
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const ok = window.confirm(`Import telecom accounts from "${file.name}"?`)
    if (!ok) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE_URL}/telecom/accounts/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      })
      if (res.ok) {
        const result = await res.json()
        alert(result.message || 'Successfully imported telecom accounts!')
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Import failed (HTTP ${res.status})`)
      }
    } catch (err) {
      console.error(err)
      alert('Network error during import')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Telecoms Computations (Excel Summary) ──────────────────────────
  const filteredTelecomAccounts = useMemo(() => {
    return telecomAccounts.filter(a => {
      const q = searchQuery.toLowerCase()
      return a.user.toLowerCase().includes(q) ||
             a.branch.toLowerCase().includes(q) ||
             a.telecom.toLowerCase().includes(q) ||
             (a.accountNumber && a.accountNumber.toLowerCase().includes(q))
    })
  }, [telecomAccounts, searchQuery])

  const sortedTelecomAccounts = useMemo(() => {
    const customOrder: Record<string, number> = { 'GLOBE': 1, 'WIFI': 2, 'SMART': 3 }
    return [...filteredTelecomAccounts].sort((a, b) => {
      const orderA = customOrder[a.telecom.toUpperCase()] || 99
      const orderB = customOrder[b.telecom.toUpperCase()] || 99
      if (orderA !== orderB) return orderA - orderB
      return a.user.localeCompare(b.user)
    })
  }, [filteredTelecomAccounts])

  const telecomSummary = useMemo(() => {
    let monthlyPlanSum = 0
    let paidSum = 0
    let unpaidSum = 0

    sortedTelecomAccounts.forEach(acc => {
      if (acc.active) {
        monthlyPlanSum += acc.monthlyPlan
      }
      
      const p = telecomPayments.find(pay => pay.telecomAccountId === acc.id)
      if (p) {
        const amt = p.amountPaid != null ? p.amountPaid : acc.monthlyPlan
        if (p.status === 'PAID') {
          paidSum += amt
        } else {
          unpaidSum += amt
        }
      } else {
        unpaidSum += acc.monthlyPlan
      }
    })

    return {
      monthlyPlanSum,
      paidSum,
      unpaidSum,
      totalCount: sortedTelecomAccounts.length,
      activeCount: sortedTelecomAccounts.filter(a => a.active).length
    }
  }, [sortedTelecomAccounts, telecomPayments])

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
            Telecoms Monitoring Ledger
          </h2>
          <p className="text-xs" style={{ color: textMuted }}>
            Corporate mobile plans, broadband connections, and bill logs
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
                placeholder="Search telecoms…"
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
                onClick={handleGenerateTelecomPayments}
                className="px-3 py-2 rounded-xl text-xs font-bold hover:opacity-95 bg-slate-100 dark:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200"
              >
                Generate Cycle
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportExcel}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all"
            >
              <Upload className={`w-4 h-4 ${importing ? 'animate-bounce' : ''}`} />
              {importing ? 'Importing...' : 'Import via Excel'}
            </button>
            <button
              onClick={() => {
                setEditingTelecomAccount(null)
                setTelUser('')
                setTelBranch('')
                setTelRemarks('')
                setTelTelecom('GLOBE')
                setTelAccountNumber('')
                setTelContactNumber('')
                setTelRenewal('')
                setTelMonthlyPlan('')
                setTelDueDates('')
                setShowTelecomAccountModal(true)
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981] text-white hover:opacity-90 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" /> Add Telecom Account
            </button>
          </div>
        </div>

        {/* Sheet Sub-Table A: TELECOM ACCOUNTS CONFIGURATION */}
        <div>
          <div className="px-4 py-2 border-b font-bold text-xs bg-slate-50 dark:bg-slate-800/20 text-slate-500" style={{ borderColor: border }}>
            A. TELECOM ACCOUNTS REGISTRATION & CONFIGURATIONS
          </div>
          <div className="overflow-x-auto">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Branch</th>
                  <th>Remarks</th>
                  <th>Telecom</th>
                  <th>Account Number</th>
                  <th>Contact Number</th>
                  <th>Renewal Date</th>
                  <th>Monthly Plan</th>
                  <th>Due Dates</th>
                  <th>Status</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTelecomAccounts.map(acc => (
                  <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="font-semibold">{acc.user}</td>
                    <td className="font-semibold">{acc.branch}</td>
                    <td className="text-xs text-slate-500">{acc.remarks || '—'}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {acc.telecom}
                      </span>
                    </td>
                    <td className="font-mono text-xs select-all">{acc.accountNumber || '—'}</td>
                    <td className="font-mono text-xs select-all">{acc.contactNumber || '—'}</td>
                    <td>{acc.renewal ? new Date(acc.renewal).toLocaleDateString() : '—'}</td>
                    <td className="font-semibold">₱{acc.monthlyPlan.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{acc.dueDates || '—'}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                        style={{
                          backgroundColor: acc.active ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
                          color: acc.active ? '#10B981' : '#64748b'
                        }}
                      >
                        {acc.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingTelecomAccount(acc)
                            setTelUser(acc.user)
                            setTelBranch(acc.branch)
                            setTelRemarks(acc.remarks || '')
                            setTelTelecom(acc.telecom)
                            setTelAccountNumber(acc.accountNumber || '')
                            setTelContactNumber(acc.contactNumber || '')
                            setTelRenewal(acc.renewal || '')
                            setTelMonthlyPlan(acc.monthlyPlan.toString())
                            setTelDueDates(acc.dueDates || '')
                            setShowTelecomAccountModal(true)
                          }}
                          className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[10px] font-bold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            const token = getToken()
                            try {
                              await fetch(`${API_BASE_URL}/telecom/accounts/${acc.id}`, {
                                method: 'PUT',
                                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ...acc, active: !acc.active })
                              })
                              fetchData()
                            } catch (e) {}
                          }}
                          className="px-2 py-1 rounded bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 text-[10px] font-bold"
                        >
                          Toggle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Excel Summary Row */}
                <tr className="excel-total-row">
                  <td colSpan={2}>Total Accounts: {telecomSummary.totalCount} ({telecomSummary.activeCount} Active)</td>
                  <td colSpan={5}>Total Recurring plan commits (Active accounts):</td>
                  <td>₱{telecomSummary.monthlyPlanSum.toLocaleString(undefined, { minimumFractionDigits: 2 })} /mo</td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Sheet Sub-Table B: TELECOM PAYMENTS SCHEDULE */}
        <div className="pt-4">
          <div className="px-4 py-2 border-b font-bold text-xs bg-slate-50 dark:bg-slate-800/20 text-slate-500" style={{ borderColor: border }}>
            B. TELECOMS MONTHLY PAYMENT LOGS FOR CYCLING PERIOD: {billingMonthFilter}
          </div>
          <div className="overflow-x-auto">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Branch</th>
                  <th>Telecom</th>
                  <th>Account Number</th>
                  <th>Plan Monthly</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Date Paid</th>
                  <th>Amount Paid</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTelecomAccounts.map(acc => {
                  const p = telecomPayments.find(pay => pay.telecomAccountId === acc.id)
                  const isPaid = p?.status === 'PAID'
                  return (
                    <tr key={`pay-${acc.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="font-semibold">{acc.user}</td>
                      <td>{acc.branch}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-500">
                          {acc.telecom}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{acc.accountNumber || '—'}</td>
                      <td className="font-semibold">₱{acc.monthlyPlan.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="font-medium">{p?.dueDate ? new Date(p.dueDate).toLocaleDateString() : '—'}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                          style={{
                            backgroundColor: isPaid ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: isPaid ? '#10B981' : '#EF4444'
                          }}
                        >
                          {p?.status || 'UNPAID'}
                        </span>
                      </td>
                      <td>{p?.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}</td>
                      <td className="font-semibold">
                        {p?.amountPaid ? `₱${p.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td>
                        {p ? (
                          <button
                            onClick={() => {
                              setSelectedTelecomPayment(p)
                              setTelPayAmount(p.amountPaid ? p.amountPaid.toString() : acc.monthlyPlan.toString())
                              setTelPayStatus(p.status)
                              setTelPayDate(p.paymentDate ? p.paymentDate.substring(0, 10) : new Date().toISOString().substring(0, 10))
                              setShowTelecomPaymentModal(true)
                            }}
                            className={`px-2.5 py-1 rounded font-bold text-[10px] ${
                              isPaid ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200' : 'bg-[#10B981] hover:bg-[#059669] text-white'
                            }`}
                          >
                            {isPaid ? 'Edit Pay' : 'Record Pay'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold select-none">No Log</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {/* Excel Summary Row */}
                <tr className="excel-total-row">
                  <td colSpan={4}>Period Dues Summary:</td>
                  <td>₱{telecomSummary.monthlyPlanSum.toLocaleString(undefined, { minimumFractionDigits: 2 })} Plan</td>
                  <td>Total Paid:</td>
                  <td className="text-emerald-500">₱{telecomSummary.paidSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>Outstanding:</td>
                  <td className="text-rose-500" colSpan={2}>₱{telecomSummary.unpaidSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modals: Telecom Account Create/Update ────────────────── */}
      {showTelecomAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowTelecomAccountModal(false); setEditingTelecomAccount(null); }} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">{editingTelecomAccount ? 'Edit Telecom Account' : 'Register Telecom Account'}</h3>
            <form onSubmit={handleTelecomAccountRequest} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Account User (Employee)</label>
                <input
                  type="text"
                  required
                  placeholder="E.g., Jane Martos, Dhen Yadao"
                  value={telUser}
                  onChange={e => setTelUser(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Branch</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., TAGUIG, SILANG"
                    value={telBranch}
                    onChange={e => setTelBranch(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Telecom Carrier</label>
                  <select
                    value={telTelecom}
                    onChange={e => setTelTelecom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  >
                    <option value="GLOBE">GLOBE</option>
                    <option value="SMART">SMART</option>
                    <option value="PLDT">PLDT</option>
                    <option value="WIFI">WIFI</option>
                    <option value="DITO">DITO</option>
                    <option value="BAYANTEL">BAYANTEL</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Account Number</label>
                  <input
                    type="text"
                    placeholder="Optional acct #"
                    value={telAccountNumber}
                    onChange={e => setTelAccountNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Contact / Sim Number</label>
                  <input
                    type="text"
                    placeholder="Optional sim #"
                    value={telContactNumber}
                    onChange={e => setTelContactNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Contract Renewal Date</label>
                  <input
                    type="date"
                    value={telRenewal}
                    onChange={e => setTelRenewal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Monthly Plan Cost (PHP)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={telMonthlyPlan}
                    onChange={e => setTelMonthlyPlan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Due Dates description</label>
                <input
                  type="text"
                  placeholder="E.g., 26th of the month"
                  value={telDueDates}
                  onChange={e => setTelDueDates(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Remarks</label>
                <textarea
                  rows={2}
                  placeholder="E.g., Director phone plan, OIC pocket wifi..."
                  value={telRemarks}
                  onChange={e => setTelRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTelecomAccountModal(false); setEditingTelecomAccount(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#10B981]"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Telecom Pay Log ────────────────────────────── */}
      {showTelecomPaymentModal && selectedTelecomPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowTelecomPaymentModal(false); setSelectedTelecomPayment(null); }} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">Record Telecom Dues Payment</h3>
            <form onSubmit={handlePayTelecom} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Status</label>
                <select
                  value={telPayStatus}
                  onChange={e => setTelPayStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  <option value="UNPAID">UNPAID</option>
                  <option value="PAID">PAID</option>
                </select>
              </div>
              {telPayStatus === 'PAID' && (
                <>
                  <div>
                    <label className="text-xs font-bold mb-1.5 block">Amount Paid (PHP)</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={telPayAmount}
                      onChange={e => setTelPayAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold mb-1.5 block">Date Paid</label>
                    <input
                      type="date"
                      required
                      value={telPayDate}
                      onChange={e => setTelPayDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTelecomPaymentModal(false); setSelectedTelecomPayment(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#10B981]"
                >
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
