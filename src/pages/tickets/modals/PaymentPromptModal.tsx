import React from 'react'
import ReactDOM from 'react-dom'
import { X } from 'lucide-react'
import type { PaymentPromptState } from '../types'
import type { Ticket, PaymentBreakdownEntry } from '../../../utils/ticketHelpers'
import { getCustomerDisplayName } from '../../../utils/ticketHelpers'
import { PAYMENT_PROMPT_MODES, initialPaymentPromptMode } from '../constants'

export function PaymentPromptModal({
  paymentPrompt,
  promptAmount,
  setPromptAmount,
  promptMode,
  setPromptMode,
  promptHybridCash,
  setPromptHybridCash,
  promptHybridGcash,
  setPromptHybridGcash,
  cardBg,
  border,
  inputBg,
  inputBorder,
  isLight,
  textPrimary,
  textMuted,
  onClose,
  onSave,
}: {
  paymentPrompt: PaymentPromptState | null
  promptAmount: string
  setPromptAmount: (v: string) => void
  promptMode: string
  setPromptMode: (v: string) => void
  promptHybridCash: string
  setPromptHybridCash: (v: string) => void
  promptHybridGcash: string
  setPromptHybridGcash: (v: string) => void
  cardBg: string
  border: string
  inputBg: string
  inputBorder: string
  isLight: boolean
  textPrimary: string
  textMuted: string
  onClose: () => void
  onSave: (
    ticket: Ticket,
    colLabel: string,
    value: string,
    injectedPayment?: { amount?: number; modeOfPayment: string; breakdown?: PaymentBreakdownEntry[] },
  ) => void
}) {
  if (!paymentPrompt) return null

  const { ticket, nextStatus, updateOnly } = paymentPrompt
  const modeValue = initialPaymentPromptMode(promptMode)
  const modeOptions = PAYMENT_PROMPT_MODES.includes(modeValue) ? PAYMENT_PROMPT_MODES : [modeValue, ...PAYMENT_PROMPT_MODES]
  const isNoPayment = modeValue === 'NO PAYMENT'
  const isFreeOrPending = modeValue === 'FREE' || modeValue === 'FREE INSTALL' || modeValue === 'PENDING'
  const isHybrid = modeValue === 'HYBRID'
  const hybridCashNum = parseFloat(promptHybridCash) || 0
  const hybridGcashNum = parseFloat(promptHybridGcash) || 0
  const hybridTotal = hybridCashNum + hybridGcashNum
  const isDoneCleaning = nextStatus === 'DONE_CLEANING'
  const isDoneDismantle = nextStatus === 'DONE_DISMANTLE'
  const isDoneRelocated = nextStatus === 'DONE_RELOCATED'
  const paymentPromptHint = updateOnly
    ? 'Update the payment mode and amount for this ticket'
    : isDoneCleaning
    ? 'Set payment to mark this cleaning ticket done'
    : isDoneDismantle
    ? 'Set payment to mark this dismantle ticket done'
    : isDoneRelocated
      ? 'Set payment to mark this relocation ticket done'
      : 'Set payment to complete and archive this ticket'
  const paymentSubmitLabel = updateOnly
    ? 'Update Payment'
    : isDoneCleaning
    ? 'Complete Cleaning'
    : isDoneDismantle
      ? 'Complete Dismantle'
      : isDoneRelocated
        ? 'Complete Relocation'
        : 'Complete & Archive'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isNoPayment) return
    if (updateOnly) {
      const amt = isFreeOrPending ? 0 : (isHybrid ? hybridTotal : (parseFloat(promptAmount) || 0))
      const mop = modeValue
      let breakdown: PaymentBreakdownEntry[] | undefined
      if (isHybrid) {
        breakdown = []
        if (hybridCashNum > 0) breakdown.push({ mode: 'CASH', amount: hybridCashNum })
        if (hybridGcashNum > 0) breakdown.push({ mode: 'GCASH', amount: hybridGcashNum })
      }
      onSave(ticket, 'PAYMENT', '', { amount: amt, modeOfPayment: mop, breakdown })
      onClose()
      return
    }
    if (isHybrid) {
      if (hybridTotal <= 0) return
      const breakdown: PaymentBreakdownEntry[] = []
      if (hybridCashNum > 0) breakdown.push({ mode: 'CASH', amount: hybridCashNum })
      if (hybridGcashNum > 0) breakdown.push({ mode: 'GCASH', amount: hybridGcashNum })
      onSave(ticket, 'STATUS', nextStatus, { amount: hybridTotal, modeOfPayment: 'HYBRID', breakdown })
      onClose()
      return
    }
    const amt = isFreeOrPending ? undefined : parseFloat(promptAmount) || 0
    onSave(ticket, 'STATUS', nextStatus, { amount: amt, modeOfPayment: modeValue })
    onClose()
  }

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: border }}>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>
                Payment Details
              </h3>
              <p className="text-[11px] font-semibold mt-0.5" style={{ color: textMuted }}>
                {paymentPromptHint}
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-slate-500/10" style={{ color: textMuted }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 flex flex-col gap-4">
            <div className="p-3.5 rounded-xl border flex flex-col gap-1" style={{ backgroundColor: isLight ? '#f8fafc' : '#1a2537', borderColor: border }}>
              <span className="text-[10px] font-black uppercase tracking-wider opacity-60" style={{ color: textMuted }}>Customer</span>
              <span className="text-xs font-bold" style={{ color: textPrimary }}>{getCustomerDisplayName(ticket)}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Mode of Payment</label>
              <select
                value={modeValue}
                onChange={e => {
                  const m = e.target.value
                  setPromptMode(m)
                  if (m === 'FREE' || m === 'FREE INSTALL') setPromptAmount('0')
                  else if (m === 'PENDING' || m === 'NO PAYMENT') setPromptAmount('')
                }}
                required
                className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
              >
                {modeOptions.map(m => (
                  <option key={m} value={m}>{m === 'HYBRID' ? 'HYBRID (SPLIT PAYMENT)' : m}</option>
                ))}
              </select>
              {isNoPayment && (
                <p className="text-[10.5px] font-semibold" style={{ color: textMuted }}>
                  Choose how the customer paid (e.g. CASH) to enter the amount.
                </p>
              )}
            </div>

            {isNoPayment ? null : isHybrid ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Cash Amount (&#8369;)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={promptHybridCash}
                    onChange={e => setPromptHybridCash(e.target.value)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>GCash Amount (&#8369;)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={promptHybridGcash}
                    onChange={e => setPromptHybridGcash(e.target.value)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div className="p-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: isLight ? '#f0fdf4' : '#0d2a1a' }}>
                  <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Total</span>
                  <span className="text-sm font-black" style={{ color: isLight ? '#047857' : '#6ee7b7', fontVariantNumeric: 'tabular-nums' }}>
                    {`\u20B1${hybridTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
                {hybridTotal <= 0 ? (
                  <p className="text-[10.5px] font-semibold" style={{ color: '#dc2626' }}>Enter at least one amount above zero.</p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Payment Amount (&#8369;)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required={!isFreeOrPending}
                  disabled={isFreeOrPending}
                  placeholder="0.00"
                  value={promptAmount}
                  onChange={e => setPromptAmount(e.target.value)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full disabled:opacity-60"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
            )}
          </div>

          <div className="px-6 py-4 flex justify-end gap-3 border-t" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold border transition-all" style={{ borderColor: inputBorder, color: textMuted }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={isNoPayment || (isHybrid && hybridTotal <= 0)}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              {paymentSubmitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
