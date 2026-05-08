import { useState } from 'react'
import {
  FileText, Plus, Trash2, Check, ChevronDown, ChevronUp,
  DollarSign, CreditCard, Receipt, ShoppingCart, Send,
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

const TYPE_CONFIG: Record<ItemType, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  CASH_SALE:   { label: 'Cash Sale',    color: '#10B981', icon: DollarSign },
  ONLINE_SALE: { label: 'Online/GCash', color: '#3B82F6', icon: CreditCard },
  EXPENSE:     { label: 'Expense',      color: '#EF4444', icon: Receipt },
  PURCHASE:    { label: 'Purchase',     color: '#F59E0B', icon: ShoppingCart },
}

// ── Component ────────────────────────────────────────────────────────────────

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

  const role = (user?.role || '').toLowerCase()
  const canSubmit = role === 'manager' || role === 'staff' || role === 'admin'

  const today = new Date().toISOString().split('T')[0]
  const [reportDate, setReportDate]   = useState(today)
  const [receivedBy, setReceivedBy]   = useState(user?.name || '')
  const [items, setItems]             = useState<LineItem[]>([
    { id: uid(), type: 'CASH_SALE',   description: '', amount: '' },
    { id: uid(), type: 'ONLINE_SALE', description: '', amount: '' },
  ])
  const [denoms, setDenoms]           = useState<Denomination[]>(DENOMS.map(d => ({ ...d })))
  const [showCounter, setShowCounter] = useState(true)
  const [submitting, setSubmitting]   = useState(false)
  const [success, setSuccess]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // ── Line Item Handlers ──────────────────────────────────────────

  const addItem = (type: ItemType) => {
    setItems(prev => [...prev, { id: uid(), type, description: '', amount: '' }])
  }

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const updateItem = (id: string, field: 'description' | 'amount' | 'type', value: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  // ── Denomination Counter ────────────────────────────────────────

  const setDenomQty = (idx: number, qty: string) => {
    setDenoms(prev => prev.map((d, i) => i === idx ? { ...d, qty } : d))
  }

  const cashFromDenoms = denoms.reduce((sum, d) => {
    const q = parseInt(d.qty) || 0
    return sum + q * d.value
  }, 0)

  // ── Totals ──────────────────────────────────────────────────────

  const sum = (type: ItemType) =>
    items.filter(i => i.type === type).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)

  const totalCash    = sum('CASH_SALE')
  const totalOnline  = sum('ONLINE_SALE')
  const totalExp     = sum('EXPENSE')
  const totalPurch   = sum('PURCHASE')
  const cashForOffice = totalCash - totalExp - totalPurch

  // ── Submit ──────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const payload = {
        branchId: user?.branchId,
        reportDate,
        receivedBy,
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
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  const inputCls = 'w-full rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/30'
  const inputStyle = { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
          <Check className="w-10 h-10" style={{ color: '#10B981' }} />
        </div>
        <h2 className="text-2xl font-black" style={{ color: textPrimary }}>Report Submitted!</h2>
        <p className="text-sm" style={{ color: textMuted }}>Your daily sales and expenses report has been recorded.</p>
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

  return (
    <div className="flex flex-col gap-5 pb-10 max-w-4xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #10B981, transparent)' }} />
        <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#10B981' }}>Branch Report</p>
        <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
          Daily Sales &amp; Expenses Report
        </h2>
        <p className="text-sm" style={{ color: textMuted }}>Ashcol Airconditioning Corporation — End of Day Submission</p>
      </div>

      {!canSubmit && (
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <Receipt className="w-5 h-5 shrink-0" style={{ color: '#EF4444' }} />
          <p className="text-sm" style={{ color: '#EF4444' }}>
            <strong>Read Only:</strong> Only Managers and Staff can submit daily reports.
          </p>
        </div>
      )}

      {/* ── Report Meta ─────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Report Date</label>
          <input
            id="report-date-input"
            type="date"
            value={reportDate}
            onChange={e => setReportDate(e.target.value)}
            className={inputCls}
            style={inputStyle}
            disabled={!canSubmit}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Received By</label>
          <input
            id="received-by-input"
            type="text"
            placeholder="Name of recipient"
            value={receivedBy}
            onChange={e => setReceivedBy(e.target.value)}
            className={inputCls}
            style={inputStyle}
            disabled={!canSubmit}
          />
        </div>
      </div>

      {/* ── Line Items by Type ───────────────────────────────────── */}
      {(['CASH_SALE', 'ONLINE_SALE', 'EXPENSE', 'PURCHASE'] as ItemType[]).map(type => {
        const cfg   = TYPE_CONFIG[type]
        const Icon  = cfg.icon
        const typeItems = items.filter(i => i.type === type)
        const typeTotal = typeItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)

        return (
          <div
            key={type}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            {/* Section header */}
            <div
              className="px-5 py-3.5 flex items-center gap-2"
              style={{ borderBottom: `1px solid ${border}`, borderLeft: `4px solid ${cfg.color}` }}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${cfg.color}18` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
              </div>
              <span className="font-black text-sm" style={{ color: textPrimary }}>{cfg.label}</span>
              <span className="ml-auto font-black text-sm" style={{ color: cfg.color }}>
                ₱{typeTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-4 flex flex-col gap-2.5">
              {typeItems.length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: textMuted }}>No items yet</p>
              )}
              {typeItems.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Description (e.g. Ryan - Neil Martinez)"
                    value={item.description}
                    onChange={e => updateItem(item.id, 'description', e.target.value)}
                    className={`${inputCls} flex-1`}
                    style={inputStyle}
                    disabled={!canSubmit}
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={item.amount}
                    onChange={e => updateItem(item.id, 'amount', e.target.value)}
                    className={`${inputCls} w-32`}
                    style={inputStyle}
                    disabled={!canSubmit}
                    min="0"
                    step="0.01"
                  />
                  {canSubmit && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-2 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400 shrink-0"
                      style={{ color: textMuted }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {canSubmit && (
                <button
                  id={`add-item-${type.toLowerCase()}`}
                  onClick={() => addItem(type)}
                  className="flex items-center gap-1.5 text-xs font-bold mt-1 transition-opacity hover:opacity-70 self-start"
                  style={{ color: cfg.color }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add {cfg.label}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* ── Cash Denomination Counter ────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <button
          id="denomination-counter-toggle"
          onClick={() => setShowCounter(c => !c)}
          className="w-full px-5 py-3.5 flex items-center gap-2 transition-colors hover:opacity-80"
          style={{ borderBottom: showCounter ? `1px solid ${border}` : 'none' }}
        >
          <DollarSign className="w-4 h-4" style={{ color: '#F59E0B' }} />
          <span className="font-black text-sm" style={{ color: textPrimary }}>Cash Denomination Counter</span>
          <span className="ml-auto font-black text-sm" style={{ color: '#F59E0B' }}>
            ₱{cashFromDenoms.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
          {showCounter
            ? <ChevronUp className="w-4 h-4 ml-1 shrink-0" style={{ color: textMuted }} />
            : <ChevronDown className="w-4 h-4 ml-1 shrink-0" style={{ color: textMuted }} />
          }
        </button>

        {showCounter && (
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {denoms.map((denom, idx) => {
                const subtotal = (parseInt(denom.qty) || 0) * denom.value
                return (
                  <div
                    key={denom.label}
                    className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                  >
                    <span className="text-xs font-black w-14 shrink-0" style={{ color: '#F59E0B' }}>{denom.label}</span>
                    <span className="text-xs" style={{ color: textMuted }}>×</span>
                    <input
                      id={`denom-qty-${idx}`}
                      type="number"
                      min="0"
                      placeholder="0"
                      value={denom.qty}
                      onChange={e => setDenomQty(idx, e.target.value)}
                      className="w-12 bg-transparent outline-none text-xs font-bold text-center"
                      style={{ color: textPrimary }}
                      disabled={!canSubmit}
                    />
                    <span className="text-xs font-black ml-auto" style={{ color: subtotal > 0 ? '#F59E0B' : textMuted }}>
                      {subtotal > 0 ? `₱${subtotal.toLocaleString('en-PH')}` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            <div className="mt-4 p-4 rounded-xl flex flex-col gap-2" style={{ backgroundColor: inputBg }}>
              {[
                { label: 'Cash From Bills',    value: cashFromDenoms, color: '#F59E0B' },
                { label: 'Total Cash Sales',   value: totalCash,      color: '#10B981' },
                { label: 'Total Expenses',     value: totalExp,       color: '#EF4444' },
                { label: 'Total Purchases',    value: totalPurch,     color: '#F59E0B' },
                { label: 'Cash For Office',    value: cashForOffice,  color: cashForOffice >= 0 ? '#10B981' : '#EF4444' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs font-semibold" style={{ color: textMuted }}>{label}</span>
                  <span className="text-xs font-black" style={{ color }}>
                    ₱{value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              <div className="mt-1 pt-2" style={{ borderTop: `1px solid ${border}` }}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Total Cash For Office</span>
                  <span className="text-lg font-black" style={{ color: cashForOffice >= 0 ? '#10B981' : '#EF4444' }}>
                    ₱{cashForOffice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Error Banner ────────────────────────────────────────── */}
      {error && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p className="text-sm font-semibold" style={{ color: '#EF4444' }}>{error}</p>
        </div>
      )}

      {/* ── Submit ─────────────────────────────────────────────── */}
      {canSubmit && (
        <button
          id="submit-report-btn"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-60"
          style={{ backgroundColor: '#10B981', boxShadow: '0 4px 20px rgba(16,185,129,0.3)' }}
        >
          {submitting ? (
            <>Submitting...</>
          ) : (
            <><Send className="w-4 h-4" /> Submit Daily Report</>
          )}
        </button>
      )}
    </div>
  )
}
