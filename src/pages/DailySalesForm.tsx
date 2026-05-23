import { useState } from 'react'
import {
  Plus, Trash2, Check, ChevronDown, ChevronUp,
  DollarSign, CreditCard, Receipt, ShoppingCart, Send,
  FileText, ClipboardList,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

// ── Types ────────────────────────────────────────────────────────────────────

type ItemType = 'CASH_SALE' | 'ONLINE_SALE' | 'EXPENSE' | 'PURCHASE'

interface LineItem {
  id: string
  type: ItemType
  description: string
  amount: string
}

interface Denomination {
  label: string
  value: number
  qty: string
}

// DTR-specific row types
interface CashTxRow    { id: string; name: string; amount: string }
interface CashRetRow   { id: string; name: string; amount: string }
interface OnlineTxRow  { id: string; installer: string; customer: string; bank: string; amount: string }
interface CheckRow     { id: string; installer: string; customer: string; bank: string; amount: string }
interface PartsSaleRow { id: string; customer: string; description: string; capital: string; salePrice: string }
interface ForCollRow   { id: string; installer: string; customer: string; amount: string }
interface RebateRow    { id: string; company: string; amount: string; units: string; total: string }
interface OrderRow     { id: string; customer: string; description: string; amount: string }
interface ExpenseRow   { id: string; name: string; description: string; amount: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2)

const DENOMS: Denomination[] = [
  { label: '₱1,000', value: 1000, qty: '' },
  { label: '₱500',   value: 500,  qty: '' },
  { label: '₱200',   value: 200,  qty: '' },
  { label: '₱100',   value: 100,  qty: '' },
  { label: '₱50',    value: 50,   qty: '' },
  { label: '₱20',    value: 20,   qty: '' },
  { label: '₱10',    value: 10,   qty: '' },
  { label: '₱5',     value: 5,    qty: '' },
  { label: '₱1',     value: 1,    qty: '' },
]

const TYPE_CONFIG: Record<ItemType, { label: string; color: string; icon: React.FC<{ className?: string; style?: React.CSSProperties }> }> = {
  CASH_SALE:   { label: 'Cash Sale',    color: '#10B981', icon: DollarSign },
  ONLINE_SALE: { label: 'Online/GCash', color: '#3B82F6', icon: CreditCard },
  EXPENSE:     { label: 'Expense',      color: '#EF4444', icon: Receipt },
  PURCHASE:    { label: 'Purchase',     color: '#F59E0B', icon: ShoppingCart },
}

const php = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const num = (s: string) => parseFloat(s) || 0
const sumArr = (arr: string[]) => arr.reduce((a, b) => a + num(b), 0)

const mkCash = (): CashTxRow   => ({ id: uid(), name: '', amount: '' })
const mkRet  = (): CashRetRow  => ({ id: uid(), name: '', amount: '' })
const mkOnl  = (): OnlineTxRow => ({ id: uid(), installer: '', customer: '', bank: '', amount: '' })
const mkChk  = (): CheckRow    => ({ id: uid(), installer: '', customer: '', bank: '', amount: '' })
const mkPart = (): PartsSaleRow => ({ id: uid(), customer: '', description: '', capital: '', salePrice: '' })
const mkColl = (): ForCollRow  => ({ id: uid(), installer: '', customer: '', amount: '' })
const mkReb  = (): RebateRow   => ({ id: uid(), company: '', amount: '', units: '', total: '' })
const mkOrd  = (): OrderRow    => ({ id: uid(), customer: '', description: '', amount: '' })
const mkExp  = (): ExpenseRow  => ({ id: uid(), name: '', description: '', amount: '' })

// ── Component ────────────────────────────────────────────────────────────────

type Tab = 'simplified' | 'dtr'

export default function DailySalesForm() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'
  const sectionBg   = isLight ? '#f1f5f9'  : '#070E1C'

  const role = (user?.role || '').toLowerCase()
  const canSubmit = role === 'manager' || role === 'staff' || role === 'admin'

  const today = new Date().toISOString().split('T')[0]

  // ── Shared ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab]   = useState<Tab>('dtr')
  const [reportDate, setReportDate] = useState(today)
  const [receivedBy, setReceivedBy] = useState(user?.name || '')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // ── Simplified tab state ─────────────────────────────────────────
  const [items, setItems]             = useState<LineItem[]>([
    { id: uid(), type: 'CASH_SALE',   description: '', amount: '' },
    { id: uid(), type: 'ONLINE_SALE', description: '', amount: '' },
  ])
  const [denoms, setDenoms]           = useState<Denomination[]>(DENOMS.map(d => ({ ...d })))
  const [showCounter, setShowCounter] = useState(true)

  // ── DTR tab state (per paper form sections) ──────────────────────
  const [trNo, setTrNo]         = useState('')
  const [branchName, setBranch] = useState('')

  // I. Cash Transactions
  const [cashTx, setCashTx]     = useState<CashTxRow[]>([mkCash()])
  // II. Cash Returns
  const [cashRet, setCashRet]   = useState<CashRetRow[]>([mkRet()])
  // III. Fund Transfer from HO
  const [cashOnHand, setCashOnHand]     = useState('')
  const [fundFromHo, setFundFromHo]     = useState('')
  // IV. Online Transactions
  const [onlineTx, setOnlineTx]         = useState<OnlineTxRow[]>([mkOnl()])
  // V. Check Remits
  const [checkRem, setCheckRem]         = useState<CheckRow[]>([mkChk()])
  // VI. Parts Sales / Unit Sales
  const [partsSales, setPartsSales]     = useState<PartsSaleRow[]>([mkPart()])
  // VII. For Collection
  const [forColl, setForColl]           = useState<ForCollRow[]>([mkColl()])
  // VIII. Estimate Rebates
  const [rebates, setRebates]           = useState<RebateRow[]>([mkReb()])
  // IX. Parts Order / Units Order
  const [orders, setOrders]             = useState<OrderRow[]>([mkOrd()])
  // X. Expenses with Receipts
  const [expReceipt, setExpReceipt]     = useState<ExpenseRow[]>([mkExp()])
  // XI. Expenses for Purchase
  const [expPurch, setExpPurch]         = useState<ExpenseRow[]>([mkExp()])
  // XIII. Cash Breakdown (shared denominations grid)
  const [dtrDenoms, setDtrDenoms]       = useState<Denomination[]>(DENOMS.map(d => ({ ...d })))

  // ── DTR Calculations ─────────────────────────────────────────────
  const totalCashCollection  = sumArr(cashTx.map(r => r.amount))
  const totalCashReturns     = sumArr(cashRet.map(r => r.amount))
  const totalOnline          = sumArr(onlineTx.map(r => r.amount))
  const totalCheck           = sumArr(checkRem.map(r => r.amount))
  const totalForColl         = sumArr(forColl.map(r => r.amount))
  const totalRebates         = sumArr(rebates.map(r => r.total || String(num(r.amount) * num(r.units))))
  const totalOrders          = sumArr(orders.map(r => r.amount))
  const totalExpReceipt      = sumArr(expReceipt.map(r => r.amount))
  const totalExpPurch        = sumArr(expPurch.map(r => r.amount))
  const grandTotalExpenses   = totalExpReceipt + totalExpPurch
  const totalFundReceived    = num(cashOnHand) + num(fundFromHo) + totalCashCollection + totalOnline + totalCheck
  const dtrCashFromDenoms    = dtrDenoms.reduce((s, d) => s + (parseInt(d.qty) || 0) * d.value, 0)
  const totalCashOnHand      = totalFundReceived - grandTotalExpenses

  // ── Simplified helpers ───────────────────────────────────────────
  const addItem = (type: ItemType) =>
    setItems(prev => [...prev, { id: uid(), type, description: '', amount: '' }])
  const removeItem = (id: string) =>
    setItems(prev => prev.filter(i => i.id !== id))
  const updateItem = (id: string, field: 'description' | 'amount' | 'type', value: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  const setDenomQty = (idx: number, qty: string) =>
    setDenoms(prev => prev.map((d, i) => i === idx ? { ...d, qty } : d))

  const cashFromDenoms = denoms.reduce((s, d) => s + (parseInt(d.qty) || 0) * d.value, 0)
  const sumType = (t: ItemType) => items.filter(i => i.type === t).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const totalCash    = sumType('CASH_SALE')
  const totalExp     = sumType('EXPENSE')
  const totalPurch   = sumType('PURCHASE')
  const cashForOffice = totalCash - totalExp - totalPurch

  // ── Submit handlers ──────────────────────────────────────────────

  const handleSimplifiedSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const payload = {
        branchId: user?.branchId, reportDate, receivedBy,
        cashBreakdownJson: JSON.stringify(denoms.map(d => ({ label: d.label, value: d.value, qty: parseInt(d.qty) || 0 }))),
        items: items
          .filter(i => i.description.trim() || parseFloat(i.amount) > 0)
          .map(i => ({ type: i.type, description: i.description, amount: parseFloat(i.amount) || 0 })),
      }
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setSuccess(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally { setSubmitting(false) }
  }

  const handleDtrSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

      // Build unified items array from all DTR sections
      const dtrItems: object[] = [
        ...cashTx.filter(r => r.name || r.amount).map(r => ({
          type: 'CASH_SALE', description: r.name, amount: parseFloat(r.amount) || 0
        })),
        ...onlineTx.filter(r => r.installer || r.amount).map(r => ({
          type: 'ONLINE_SALE', description: r.installer, customer: r.customer, bank: r.bank, amount: parseFloat(r.amount) || 0
        })),
        ...checkRem.filter(r => r.installer || r.amount).map(r => ({
          type: 'ONLINE_SALE', description: `CHECK|${r.installer}`, customer: r.customer, bank: r.bank, amount: parseFloat(r.amount) || 0
        })),
        ...partsSales.filter(r => r.customer || r.salePrice).map(r => ({
          type: 'CASH_SALE', description: `PARTS|${r.customer}|${r.description}`, amount: parseFloat(r.salePrice) || 0
        })),
        ...expReceipt.filter(r => r.name || r.amount).map(r => ({
          type: 'EXPENSE', description: `${r.name}|${r.description}`, amount: parseFloat(r.amount) || 0
        })),
        ...expPurch.filter(r => r.name || r.amount).map(r => ({
          type: 'PURCHASE', description: `${r.name}|${r.description}`, amount: parseFloat(r.amount) || 0
        })),
        ...orders.filter(r => r.customer || r.amount).map(r => ({
          type: 'PURCHASE', description: `ORDER|${r.customer}|${r.description}`, amount: parseFloat(r.amount) || 0
        })),
      ]

      const payload = {
        branchId: user?.branchId,
        reportDate,
        receivedBy,
        trNo,
        branchName,
        cohPreviousDay: parseFloat(cashOnHand) || 0,
        fundFromHo: parseFloat(fundFromHo) || 0,
        cashReturns: totalCashReturns,
        forCollection: totalForColl,
        rebatesForCollection: totalRebates,
        cashBreakdownJson: JSON.stringify(dtrDenoms.map(d => ({ label: d.label, value: d.value, qty: parseInt(d.qty) || 0 }))),
        items: dtrItems,
      }

      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setSuccess(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally { setSubmitting(false) }
  }

  // ── Style helpers ────────────────────────────────────────────────

  const inputCls   = 'w-full rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/30'
  const inputStyle = { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }
  const smInput    = 'rounded-lg px-2.5 py-1.5 text-xs outline-none w-full focus:ring-1 focus:ring-emerald-500/30'
  const smStyle    = { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }

  const SectionHeader = ({ label, color = '#10B981', total }: { label: string; color?: string; total?: number }) => (
    <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}`, borderLeft: `3px solid ${color}` }}>
      <span className="text-xs font-black uppercase tracking-wider" style={{ color }}>{label}</span>
      {total !== undefined && (
        <span className="ml-auto text-xs font-black" style={{ color }}>{php(total)}</span>
      )}
    </div>
  )

  const AddRowBtn = ({ onClick, label, color = '#10B981' }: { onClick: () => void; label: string; color?: string }) => (
    <button onClick={onClick} className="flex items-center gap-1 text-[11px] font-bold mt-1 hover:opacity-70 self-start" style={{ color }}>
      <Plus className="w-3 h-3" /> {label}
    </button>
  )

  const DelBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="p-1.5 rounded-lg hover:bg-red-500/10 shrink-0 transition-colors" style={{ color: textMuted }}>
      <Trash2 className="w-3 h-3" />
    </button>
  )

  // ── Success screen ───────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
          <Check className="w-10 h-10" style={{ color: '#10B981' }} />
        </div>
        <h2 className="text-2xl font-black" style={{ color: textPrimary }}>Report Submitted!</h2>
        <p className="text-sm" style={{ color: textMuted }}>Your daily report has been recorded successfully.</p>
        <div className="flex gap-3">
          <button
            onClick={() => setSuccess(false)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold border transition-all hover:scale-105"
            style={{ borderColor: inputBorder, color: textMuted }}
          >
            Submit Another
          </button>
          <a
            href="/audit-report"
            className="px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:scale-105"
            style={{ backgroundColor: '#10B981' }}
          >
            View Audit Report
          </a>
        </div>
      </div>
    )
  }

  // ── Main Render ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pb-10 max-w-5xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 md:p-7 relative overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #10B981, transparent)' }} />
        <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#10B981' }}>Branch Report</p>
        <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
          Daily Report Submission
        </h2>
        <p className="text-sm" style={{ color: textMuted }}>ASHCOL Airconditioning Corporation — End of Day Submission</p>
      </div>

      {!canSubmit && (
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <Receipt className="w-5 h-5 shrink-0" style={{ color: '#EF4444' }} />
          <p className="text-sm" style={{ color: '#EF4444' }}>
            <strong>Read Only:</strong> Only Managers and Staff can submit daily reports.
          </p>
        </div>
      )}

      {/* ── Tab Switcher ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex" style={{ borderBottom: `1px solid ${border}` }}>
          {([
            { key: 'dtr',        label: 'DTR Report',       icon: ClipboardList },
            { key: 'simplified', label: 'Simplified Report', icon: FileText },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex items-center gap-2 px-5 py-3.5 text-sm font-bold transition-all flex-1 justify-center"
              style={{
                color: activeTab === key ? '#10B981' : textMuted,
                borderBottom: activeTab === key ? '2px solid #10B981' : '2px solid transparent',
                backgroundColor: activeTab === key ? 'rgba(16,185,129,0.05)' : 'transparent',
              }}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Shared meta fields */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Report Date</label>
            <input id="report-date-input" type="date" value={reportDate}
              onChange={e => setReportDate(e.target.value)} className={inputCls} style={inputStyle} disabled={!canSubmit} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Prepared By</label>
            <input id="received-by-input" type="text" placeholder="Name" value={receivedBy}
              onChange={e => setReceivedBy(e.target.value)} className={inputCls} style={inputStyle} disabled={!canSubmit} />
          </div>
          {activeTab === 'dtr' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>TR No.</label>
                <input id="tr-no-input" type="text" placeholder="e.g. HO-0002" value={trNo}
                  onChange={e => setTrNo(e.target.value)} className={inputCls} style={inputStyle} disabled={!canSubmit} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Branch</label>
                <input id="branch-name-input" type="text" placeholder="Branch name" value={branchName}
                  onChange={e => setBranch(e.target.value)} className={inputCls} style={inputStyle} disabled={!canSubmit} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ── SIMPLIFIED TAB ─────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'simplified' && (
        <>
          {(['CASH_SALE', 'ONLINE_SALE', 'EXPENSE', 'PURCHASE'] as ItemType[]).map(type => {
            const cfg = TYPE_CONFIG[type]
            const Icon = cfg.icon
            const typeItems = items.filter(i => i.type === type)
            const typeTotal = typeItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
            return (
              <div key={type} className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}`, borderLeft: `4px solid ${cfg.color}` }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${cfg.color}18` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                  </div>
                  <span className="font-black text-sm" style={{ color: textPrimary }}>{cfg.label}</span>
                  <span className="ml-auto font-black text-sm" style={{ color: cfg.color }}>₱{typeTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="p-4 flex flex-col gap-2.5">
                  {typeItems.length === 0 && <p className="text-xs text-center py-3" style={{ color: textMuted }}>No items yet</p>}
                  {typeItems.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input type="text" placeholder="Description" value={item.description}
                        onChange={e => updateItem(item.id, 'description', e.target.value)}
                        className={`${inputCls} flex-1`} style={inputStyle} disabled={!canSubmit} />
                      <input type="number" placeholder="Amount" value={item.amount}
                        onChange={e => updateItem(item.id, 'amount', e.target.value)}
                        className={`${inputCls} w-32`} style={inputStyle} disabled={!canSubmit} min="0" step="0.01" />
                      {canSubmit && <button onClick={() => removeItem(item.id)} className="p-2 rounded-lg transition-colors hover:bg-red-500/10" style={{ color: textMuted }}><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  ))}
                  {canSubmit && (
                    <button id={`add-item-${type.toLowerCase()}`} onClick={() => addItem(type)}
                      className="flex items-center gap-1.5 text-xs font-bold mt-1 transition-opacity hover:opacity-70 self-start" style={{ color: cfg.color }}>
                      <Plus className="w-3.5 h-3.5" /> Add {cfg.label}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Cash Denomination Counter */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <button id="denomination-counter-toggle" onClick={() => setShowCounter(c => !c)}
              className="w-full px-5 py-3.5 flex items-center gap-2 transition-colors hover:opacity-80"
              style={{ borderBottom: showCounter ? `1px solid ${border}` : 'none' }}>
              <DollarSign className="w-4 h-4" style={{ color: '#F59E0B' }} />
              <span className="font-black text-sm" style={{ color: textPrimary }}>Cash Denomination Counter</span>
              <span className="ml-auto font-black text-sm" style={{ color: '#F59E0B' }}>₱{cashFromDenoms.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              {showCounter ? <ChevronUp className="w-4 h-4 ml-1" style={{ color: textMuted }} /> : <ChevronDown className="w-4 h-4 ml-1" style={{ color: textMuted }} />}
            </button>
            {showCounter && (
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {denoms.map((denom, idx) => {
                    const subtotal = (parseInt(denom.qty) || 0) * denom.value
                    return (
                      <div key={denom.label} className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                        <span className="text-xs font-black w-14 shrink-0" style={{ color: '#F59E0B' }}>{denom.label}</span>
                        <span className="text-xs" style={{ color: textMuted }}>×</span>
                        <input id={`denom-qty-${idx}`} type="number" min="0" placeholder="0" value={denom.qty}
                          onChange={e => setDenomQty(idx, e.target.value)}
                          className="w-12 bg-transparent outline-none text-xs font-bold text-center" style={{ color: textPrimary }} disabled={!canSubmit} />
                        <span className="text-xs font-black ml-auto" style={{ color: subtotal > 0 ? '#F59E0B' : textMuted }}>
                          {subtotal > 0 ? `₱${subtotal.toLocaleString('en-PH')}` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 p-4 rounded-xl flex flex-col gap-2" style={{ backgroundColor: inputBg }}>
                  {[
                    { label: 'Cash From Bills',   value: cashFromDenoms, color: '#F59E0B' },
                    { label: 'Total Cash Sales',  value: totalCash,      color: '#10B981' },
                    { label: 'Total Expenses',    value: totalExp,       color: '#EF4444' },
                    { label: 'Total Purchases',   value: totalPurch,     color: '#F59E0B' },
                    { label: 'Cash For Office',   value: cashForOffice,  color: cashForOffice >= 0 ? '#10B981' : '#EF4444' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-xs font-semibold" style={{ color: textMuted }}>{label}</span>
                      <span className="text-xs font-black" style={{ color }}>₱{value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <p className="text-sm font-semibold" style={{ color: '#EF4444' }}>{error}</p>
            </div>
          )}

          {canSubmit && (
            <button id="submit-report-btn" onClick={handleSimplifiedSubmit} disabled={submitting}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-60"
              style={{ backgroundColor: '#10B981', boxShadow: '0 4px 20px rgba(16,185,129,0.3)' }}>
              {submitting ? <>Submitting...</> : <><Send className="w-4 h-4" /> Submit Simplified Report</>}
            </button>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ── DTR TAB ─────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'dtr' && (
        <>
          {/* Left + Right two-column layout for sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* ── I. Cash Transactions ─────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="I. Cash Transactions" color="#10B981" total={totalCashCollection} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_auto] gap-1.5 mb-1">
                  <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Name (Installer/Technician)</span>
                  <span className="text-[10px] font-bold uppercase text-right" style={{ color: textMuted }}>Amount</span>
                </div>
                {cashTx.map(row => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input type="text" placeholder="Name" value={row.name}
                      onChange={e => setCashTx(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="0.00" value={row.amount} min="0" step="0.01"
                      onChange={e => setCashTx(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      className={`${smInput} w-28`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setCashTx(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setCashTx(p => [...p, mkCash()])} label="Add Row" color="#10B981" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total Cash Collection</span>
                  <span className="text-xs font-black" style={{ color: '#10B981' }}>{php(totalCashCollection)}</span>
                </div>
              </div>
            </div>

            {/* ── IX. Parts Order / Units Order ────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="IX. Parts Order / Units Order" color="#8B5CF6" total={totalOrders} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 mb-1">
                  <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Customer</span>
                  <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Description</span>
                  <span className="text-[10px] font-bold uppercase text-right" style={{ color: textMuted }}>Amount</span>
                </div>
                {orders.map(row => (
                  <div key={row.id} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Customer" value={row.customer}
                      onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Description" value={row.description}
                      onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="0.00" value={row.amount} min="0" step="0.01"
                      onChange={e => setOrders(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setOrders(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setOrders(p => [...p, mkOrd()])} label="Add Row" color="#8B5CF6" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total</span>
                  <span className="text-xs font-black" style={{ color: '#8B5CF6' }}>{php(totalOrders)}</span>
                </div>
              </div>
            </div>

            {/* ── II. Cash Returns ─────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="II. Cash Returns (Change from Purchases)" color="#F59E0B" total={totalCashReturns} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_auto] gap-1.5 mb-1">
                  <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Name (Installer/Technician/Driver)</span>
                  <span className="text-[10px] font-bold uppercase text-right" style={{ color: textMuted }}>Amount</span>
                </div>
                {cashRet.map(row => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input type="text" placeholder="Name" value={row.name}
                      onChange={e => setCashRet(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="0.00" value={row.amount} min="0" step="0.01"
                      onChange={e => setCashRet(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      className={`${smInput} w-28`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setCashRet(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setCashRet(p => [...p, mkRet()])} label="Add Row" color="#F59E0B" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total Cash Returns</span>
                  <span className="text-xs font-black" style={{ color: '#F59E0B' }}>{php(totalCashReturns)}</span>
                </div>
              </div>
            </div>

            {/* ── X. Expenses with Receipts (Reimbursements) ───────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="X. Expenses with Receipts (Reimbursements)" color="#EF4444" total={totalExpReceipt} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 mb-1">
                  <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Name</span>
                  <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Description</span>
                  <span className="text-[10px] font-bold uppercase text-right" style={{ color: textMuted }}>Amount</span>
                </div>
                {expReceipt.map(row => (
                  <div key={row.id} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Name" value={row.name}
                      onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Description" value={row.description}
                      onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="0.00" value={row.amount} min="0" step="0.01"
                      onChange={e => setExpReceipt(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setExpReceipt(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setExpReceipt(p => [...p, mkExp()])} label="Add Row" color="#EF4444" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total</span>
                  <span className="text-xs font-black" style={{ color: '#EF4444' }}>{php(totalExpReceipt)}</span>
                </div>
              </div>
            </div>

            {/* ── III. Fund Transfer from HO ───────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="III. Fund Transfer from HO" color="#06B6D4" />
              <div className="p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Cash on Hand (Previous Day)</label>
                  <input type="number" placeholder="0.00" value={cashOnHand} min="0" step="0.01"
                    onChange={e => setCashOnHand(e.target.value)} className={inputCls} style={inputStyle} disabled={!canSubmit} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Fund Transfer from HO</label>
                  <input type="number" placeholder="0.00" value={fundFromHo} min="0" step="0.01"
                    onChange={e => setFundFromHo(e.target.value)} className={inputCls} style={inputStyle} disabled={!canSubmit} />
                </div>
                <div className="flex justify-between items-center pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total Fund</span>
                  <span className="text-xs font-black" style={{ color: '#06B6D4' }}>{php(num(cashOnHand) + num(fundFromHo))}</span>
                </div>
              </div>
            </div>

            {/* ── XI. Expenses for Purchase ────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="XI. Expenses for Purchase" color="#F97316" total={totalExpPurch} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 mb-1">
                  <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Name</span>
                  <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Description</span>
                  <span className="text-[10px] font-bold uppercase text-right" style={{ color: textMuted }}>Amount</span>
                </div>
                {expPurch.map(row => (
                  <div key={row.id} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Name" value={row.name}
                      onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Description" value={row.description}
                      onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="0.00" value={row.amount} min="0" step="0.01"
                      onChange={e => setExpPurch(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setExpPurch(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setExpPurch(p => [...p, mkExp()])} label="Add Row" color="#F97316" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total</span>
                  <span className="text-xs font-black" style={{ color: '#F97316' }}>{php(totalExpPurch)}</span>
                </div>
              </div>
            </div>

            {/* ── IV. Online Transactions ──────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="IV. Online Transactions" color="#3B82F6" total={totalOnline} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-1 mb-1">
                  {['Installer', 'Customer Name', 'Bank', 'Amount Paid'].map(h => (
                    <span key={h} className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>{h}</span>
                  ))}
                </div>
                {onlineTx.map(row => (
                  <div key={row.id} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Installer" value={row.installer}
                      onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Customer" value={row.customer}
                      onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Bank" value={row.bank}
                      onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, bank: e.target.value } : r))}
                      className={`${smInput} w-20`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="0.00" value={row.amount} min="0" step="0.01"
                      onChange={e => setOnlineTx(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setOnlineTx(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setOnlineTx(p => [...p, mkOnl()])} label="Add Row" color="#3B82F6" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total Online</span>
                  <span className="text-xs font-black" style={{ color: '#3B82F6' }}>{php(totalOnline)}</span>
                </div>
              </div>
            </div>

            {/* ── XII. Grand Total Expenses + XIV Cash On Hand ─────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="XII–XIV. Expense Summary & Cash Position" color="#10B981" />
              <div className="p-4 flex flex-col gap-3">
                {[
                  { label: 'XII. Grand Total Expenses',  value: grandTotalExpenses,  color: '#EF4444' },
                  { label: 'XIV. Total Fund Received',    value: totalFundReceived,   color: '#06B6D4' },
                  { label: 'Grand Total Expenses',        value: grandTotalExpenses,  color: '#EF4444' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-xs font-semibold" style={{ color: textMuted }}>{label}</span>
                    <span className="text-sm font-black" style={{ color }}>{php(value)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center p-3 rounded-xl mt-1" style={{ backgroundColor: totalCashOnHand >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${totalCashOnHand >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                  <span className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Total Cash On Hand / For Deposit</span>
                  <span className="text-lg font-black" style={{ color: totalCashOnHand >= 0 ? '#10B981' : '#EF4444' }}>{php(totalCashOnHand)}</span>
                </div>
              </div>
            </div>

            {/* ── V. Check Remits ──────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="V. Check Remits" color="#6366F1" total={totalCheck} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-1 mb-1">
                  {['Installer', 'Customer Name', 'Bank', 'Amount Paid'].map(h => (
                    <span key={h} className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>{h}</span>
                  ))}
                </div>
                {checkRem.map(row => (
                  <div key={row.id} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Installer" value={row.installer}
                      onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Customer" value={row.customer}
                      onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Bank" value={row.bank}
                      onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, bank: e.target.value } : r))}
                      className={`${smInput} w-20`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="0.00" value={row.amount} min="0" step="0.01"
                      onChange={e => setCheckRem(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setCheckRem(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setCheckRem(p => [...p, mkChk()])} label="Add Row" color="#6366F1" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total Check Transactions</span>
                  <span className="text-xs font-black" style={{ color: '#6366F1' }}>{php(totalCheck)}</span>
                </div>
              </div>
            </div>

            {/* ── VI. Parts Sales / Unit Sales ─────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="VI. Parts Sales / Unit Sales" color="#10B981" />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-1 mb-1">
                  {['Customer', 'Description', 'Capital', 'Sale Price'].map(h => (
                    <span key={h} className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>{h}</span>
                  ))}
                </div>
                {partsSales.map(row => (
                  <div key={row.id} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Customer" value={row.customer}
                      onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Description" value={row.description}
                      onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="Capital" value={row.capital} min="0" step="0.01"
                      onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, capital: e.target.value } : r))}
                      className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="Sale Price" value={row.salePrice} min="0" step="0.01"
                      onChange={e => setPartsSales(p => p.map(r => r.id === row.id ? { ...r, salePrice: e.target.value } : r))}
                      className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setPartsSales(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setPartsSales(p => [...p, mkPart()])} label="Add Row" color="#10B981" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total Parts/Unit Sales</span>
                  <span className="text-xs font-black" style={{ color: '#10B981' }}>{php(sumArr(partsSales.map(r => r.salePrice)))}</span>
                </div>
              </div>
            </div>

            {/* ── VII. For Collection ──────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="VII. For Collection" color="#EC4899" total={totalForColl} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1 mb-1">
                  {['Installer', 'Customer', 'Amount'].map(h => (
                    <span key={h} className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>{h}</span>
                  ))}
                </div>
                {forColl.map(row => (
                  <div key={row.id} className="flex items-center gap-1.5">
                    <input type="text" placeholder="Installer" value={row.installer}
                      onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, installer: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="text" placeholder="Customer" value={row.customer}
                      onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, customer: e.target.value } : r))}
                      className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                    <input type="number" placeholder="0.00" value={row.amount} min="0" step="0.01"
                      onChange={e => setForColl(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                      className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                    {canSubmit && <DelBtn onClick={() => setForColl(p => p.filter(r => r.id !== row.id))} />}
                  </div>
                ))}
                {canSubmit && <AddRowBtn onClick={() => setForColl(p => [...p, mkColl()])} label="Add Row" color="#EC4899" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total Amount for Collection</span>
                  <span className="text-xs font-black" style={{ color: '#EC4899' }}>{php(totalForColl)}</span>
                </div>
              </div>
            </div>

            {/* ── VIII. Estimate Rebates for Collection ────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <SectionHeader label="VIII. Estimate Rebates for Collection (Gross Amount)" color="#14B8A6" total={totalRebates} />
              <div className="p-4 flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-1 mb-1">
                  {['Company', 'Amount', 'Units', 'Total'].map(h => (
                    <span key={h} className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>{h}</span>
                  ))}
                </div>
                {rebates.map(row => {
                  const calc = num(row.amount) * num(row.units)
                  return (
                    <div key={row.id} className="flex items-center gap-1.5">
                      <input type="text" placeholder="Company" value={row.company}
                        onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, company: e.target.value } : r))}
                        className={`${smInput} flex-1`} style={smStyle} disabled={!canSubmit} />
                      <input type="number" placeholder="Amount" value={row.amount} min="0" step="0.01"
                        onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                        className={`${smInput} w-24`} style={smStyle} disabled={!canSubmit} />
                      <input type="number" placeholder="Units" value={row.units} min="0"
                        onChange={e => setRebates(p => p.map(r => r.id === row.id ? { ...r, units: e.target.value } : r))}
                        className={`${smInput} w-16`} style={smStyle} disabled={!canSubmit} />
                      <span className="text-xs font-black w-24 text-right" style={{ color: '#14B8A6' }}>{php(calc)}</span>
                      {canSubmit && <DelBtn onClick={() => setRebates(p => p.filter(r => r.id !== row.id))} />}
                    </div>
                  )
                })}
                {canSubmit && <AddRowBtn onClick={() => setRebates(p => [...p, mkReb()])} label="Add Row" color="#14B8A6" />}
                <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                  <span className="text-xs font-black uppercase" style={{ color: textMuted }}>Total Estimated Rebates</span>
                  <span className="text-xs font-black" style={{ color: '#14B8A6' }}>{php(totalRebates)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── XIII. Cash Breakdown (full width) ────────────────────── */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <SectionHeader label="XIII. Cash Breakdown" color="#F59E0B" total={dtrCashFromDenoms} />
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {dtrDenoms.map((denom, idx) => {
                  const subtotal = (parseInt(denom.qty) || 0) * denom.value
                  return (
                    <div key={denom.label} className="flex flex-col gap-1 p-3 rounded-xl" style={{ backgroundColor: sectionBg, border: `1px solid ${inputBorder}` }}>
                      <span className="text-xs font-black text-center" style={{ color: '#F59E0B' }}>{denom.label}</span>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-[10px]" style={{ color: textMuted }}>×</span>
                        <input id={`dtr-denom-qty-${idx}`} type="number" min="0" placeholder="0" value={denom.qty}
                          onChange={e => setDtrDenoms(prev => prev.map((d, i) => i === idx ? { ...d, qty: e.target.value } : d))}
                          className="w-14 text-center bg-transparent outline-none text-sm font-black"
                          style={{ color: textPrimary }} disabled={!canSubmit} />
                        <span className="text-[10px]" style={{ color: textMuted }}>pcs</span>
                      </div>
                      <span className="text-[10px] font-black text-center" style={{ color: subtotal > 0 ? '#F59E0B' : textMuted }}>
                        {subtotal > 0 ? php(subtotal) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Summary */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Cash Breakdown Total',   value: dtrCashFromDenoms, color: '#F59E0B' },
                  { label: 'Total Fund Received',     value: totalFundReceived, color: '#06B6D4' },
                  { label: 'Grand Total Expenses',    value: grandTotalExpenses, color: '#EF4444' },
                  { label: 'Cash On Hand / Deposit',  value: totalCashOnHand, color: totalCashOnHand >= 0 ? '#10B981' : '#EF4444' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-xl flex flex-col gap-1" style={{ backgroundColor: sectionBg, border: `1px solid ${inputBorder}` }}>
                    <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>{label}</span>
                    <span className="text-sm font-black" style={{ color }}>{php(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <p className="text-sm font-semibold" style={{ color: '#EF4444' }}>{error}</p>
            </div>
          )}

          {canSubmit && (
            <button id="submit-dtr-btn" onClick={handleDtrSubmit} disabled={submitting}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-60"
              style={{ backgroundColor: '#10B981', boxShadow: '0 4px 20px rgba(16,185,129,0.3)' }}>
              {submitting ? <>Submitting...</> : <><Send className="w-4 h-4" /> Submit DTR Report</>}
            </button>
          )}
        </>
      )}
    </div>
  )
}
