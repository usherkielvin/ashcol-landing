import { CreditCard, Plus, Trash2 } from 'lucide-react'
import { FormField } from './FormField'
import type { RelayFormTheme } from './theme'

export type PaymentRow = { mode: string; amount: number; customMode?: string }

const NO_CHARGE_MODES = new Set(['NO_PAYMENT', 'FREE', 'FREE INSTALL'])

export function PaymentSection({
  step,
  payments,
  onPaymentsChange,
  theme,
}: {
  step?: number
  payments: PaymentRow[]
  onPaymentsChange: (next: PaymentRow[]) => void
  theme: RelayFormTheme
}) {
  const { isLight, textPrimary, border, inputBg, inputBorder, inputClassName, getInputStyle } = theme
  const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  const updateRow = (idx: number, patch: Partial<PaymentRow>) => {
    const next = [...payments]
    next[idx] = { ...next[idx], ...patch }
    onPaymentsChange(next)
  }

  return (
    <section>
      <div className="flex items-center justify-between border-b pb-2 mb-3" style={{ borderColor: border }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
            {step != null ? <span className="text-[11px] font-black">{step}</span> : <CreditCard className="w-3.5 h-3.5" />}
          </div>
          <p className="text-[11.5px] font-black uppercase tracking-wider text-emerald-600 leading-tight">Payment Details</p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg border" style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#10B981' }}>
              Total: ₱{total.toLocaleString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => onPaymentsChange([...payments, { mode: 'CASH', amount: 0, customMode: '' }])}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-3 h-3" />
            <span>Add Payment</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {payments.map((p, idx) => {
          const isCustom = p.mode === 'CUSTOM'
          const isNoCharge = NO_CHARGE_MODES.has(p.mode)
          return (
            <div key={`pay-${idx}`} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end p-2.5 rounded-xl border" style={{ borderColor: border, backgroundColor: isLight ? 'rgba(248,250,252,0.6)' : 'rgba(255,255,255,0.02)' }}>
              <div className={isCustom ? 'sm:col-span-4' : 'sm:col-span-6'}>
                <FormField label={idx === 0 ? 'Mode of Payment' : `Payment #${idx + 1} Mode`}>
                  <select
                    value={p.mode}
                    onChange={e => updateRow(idx, { mode: e.target.value, amount: NO_CHARGE_MODES.has(e.target.value) ? 0 : p.amount })}
                    className={inputClassName}
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    <option value="NO_PAYMENT">NO PAYMENT / FREE</option>
                    <option value="CASH">CASH</option>
                    <option value="GCASH">GCASH</option>
                    <option value="BANK TRANSFER">BANK TRANSFER</option>
                    <option value="CHEQUE">CHEQUE</option>
                    <option value="FOR COLLECTION">FOR COLLECTION</option>
                    <option value="FREE INSTALL">FREE INSTALL</option>
                    <option value="CUSTOM">+ CUSTOM PAYMENT TYPE...</option>
                  </select>
                </FormField>
              </div>
              {isCustom && (
                <div className="sm:col-span-3">
                  <FormField label="Custom Type Name">
                    <input
                      type="text"
                      value={p.customMode || ''}
                      placeholder="e.g. PAYMAYA, VOUCHER"
                      onChange={e => updateRow(idx, { customMode: e.target.value.toUpperCase() })}
                      className={inputClassName}
                      style={getInputStyle(p.customMode)}
                    />
                  </FormField>
                </div>
              )}
              <div className={isCustom ? 'sm:col-span-4' : 'sm:col-span-5'}>
                <FormField label="Amount (₱)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={isNoCharge ? '' : (p.amount || '')}
                    disabled={isNoCharge}
                    onChange={e => updateRow(idx, { amount: Number(e.target.value) || 0 })}
                    className={inputClassName}
                    style={getInputStyle(p.amount ? String(p.amount) : '')}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-1 flex items-center justify-end pb-1">
                {payments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onPaymentsChange(payments.filter((_, i) => i !== idx))}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Remove payment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
