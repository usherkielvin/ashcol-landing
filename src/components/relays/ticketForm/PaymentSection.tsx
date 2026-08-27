import { CreditCard } from 'lucide-react'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

export type PaymentRow = { mode: string; amount: number }

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
  const { textPrimary, inputBg, inputBorder, inputClassName, getInputStyle } = theme

  return (
    <section>
      <FormSectionHead step={step} icon={<CreditCard className="w-3.5 h-3.5" />} title="Payment Details" subtitle="Mode of payment and amount" />
      <div className="space-y-2">
        {payments.map((payment, pIdx) => (
          <div key={`pay-${pIdx}`} className="grid grid-cols-12 gap-2 items-end">
            <FormField label={pIdx === 0 ? 'Mode of Payment' : ''} className="col-span-5">
              <select
                value={payment.mode}
                onChange={e => {
                  const next = [...payments]
                  next[pIdx] = { ...next[pIdx], mode: e.target.value }
                  onPaymentsChange(next)
                }}
                className={inputClassName}
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                <option value="">Select...</option>
                <option value="CASH">CASH</option>
                <option value="GCASH">GCASH</option>
                <option value="BANK TRANSFER">BANK TRANSFER</option>
                <option value="CHEQUE">CHEQUE</option>
                <option value="FOR COLLECTION">FOR COLLECTION</option>
                <option value="FREE INSTALL">FREE INSTALL</option>
                <option value="NO_PAYMENT">NO PAYMENT / FREE</option>
              </select>
            </FormField>
            <FormField label={pIdx === 0 ? 'Amount (₱)' : ''} className="col-span-4">
              <input
                type="number"
                value={payment.amount || ''}
                onChange={e => {
                  const next = [...payments]
                  next[pIdx] = { ...next[pIdx], amount: Number(e.target.value) || 0 }
                  onPaymentsChange(next)
                }}
                placeholder="0"
                className={inputClassName}
                style={getInputStyle(payment.amount ? String(payment.amount) : '')}
              />
            </FormField>
            <div className="col-span-3 flex gap-1 pb-[2px]">
              {pIdx === payments.length - 1 && (
                <button
                  type="button"
                  onClick={() => onPaymentsChange([...payments, { mode: '', amount: 0 }])}
                  className="px-2.5 py-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 font-bold text-xs"
                >
                  +
                </button>
              )}
              {payments.length > 1 && (
                <button
                  type="button"
                  onClick={() => onPaymentsChange(payments.filter((_, i) => i !== pIdx))}
                  className="px-2.5 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 font-bold text-xs"
                >
                  −
                </button>
              )}
            </div>
          </div>
        ))}
        {payments.length > 1 && (
          <p className="text-[10px] font-bold mt-1" style={{ color: '#10B981' }}>
            Total: ₱{payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
          </p>
        )}
      </div>
    </section>
  )
}
