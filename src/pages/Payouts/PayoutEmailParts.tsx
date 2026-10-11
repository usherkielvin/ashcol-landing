import { Mail, MailWarning } from 'lucide-react'
import type { PayoutEmailStatus } from '../../utils/payoutShareApi'
import { emailedDay } from './payoutEmail'

// Module-level on purpose: see CLAUDE.md on not defining components inside Payouts().

interface ChipProps {
  /** Latest attempt for this installer-week, if payroll has tried to email it. */
  status: PayoutEmailStatus | undefined
  /** The installer has no account, or the account has no personal email. */
  noEmailOnFile: boolean
  isLight: boolean
}

/** Small status pill for a completed payout: Emailed Oct 5 / Email failed / No email on file / Not emailed. */
export function PayoutEmailChip({ status, noEmailOnFile, isLight }: ChipProps) {
  let text: string
  let title: string
  let color: string
  let Icon = Mail
  if (status?.status === 'FAILED') {
    text = 'Email failed'
    title = status.error || 'The payout email could not be sent. Open the payout link options to resend it.'
    color = isLight ? '#DC2626' : '#F87171'
    Icon = MailWarning
  } else if (status?.lastSentAt) {
    text = `Emailed ${emailedDay(status.lastSentAt)}`
    title = `Payout emailed${status.maskedEmail ? ` to ${status.maskedEmail}` : ''}`
    color = isLight ? '#059669' : '#34D399'
  } else if (noEmailOnFile || status?.status === 'SKIPPED_NO_EMAIL') {
    text = 'No email on file'
    title = 'No personal email on this account. Add one in Employees to email the payout.'
    color = isLight ? '#B45309' : '#FBBF24'
    Icon = MailWarning
  } else {
    text = 'Not emailed'
    title = 'The technician has not been emailed this payout yet.'
    color = isLight ? '#64748b' : '#7A95B8'
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{ color }} title={title}>
      <Icon className="w-3 h-3 shrink-0" />
      {text}
    </span>
  )
}

export interface PayoutEmailToastState {
  kind: 'ok' | 'error'
  text: string
  /** Offered on failures so payroll can try the email again without reopening the modal. */
  retry?: () => void
}

/** Bottom-right notice after Confirm & Finalize / Resend. A failure stays until dismissed; a success fades. */
export function PayoutEmailToast({ toast, onDismiss }: { toast: PayoutEmailToastState | null; onDismiss: () => void }) {
  if (!toast) return null
  const isError = toast.kind === 'error'
  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-[9999] max-w-sm flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold animate-in fade-in slide-in-from-bottom-3"
      style={{
        backgroundColor: isError ? '#7f1d1d' : '#059669',
        borderColor: isError ? '#b91c1c' : '#10b981',
        color: '#ffffff',
      }}
    >
      <span className="flex-1">{toast.text}</span>
      {toast.retry && (
        <button
          type="button"
          onClick={toast.retry}
          className="shrink-0 underline underline-offset-2 font-black cursor-pointer"
        >
          Retry
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-80 hover:opacity-100 cursor-pointer">
        ×
      </button>
    </div>
  )
}
