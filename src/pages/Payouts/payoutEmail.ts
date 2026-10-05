import {
  installerTotal,
  installerNet,
  deductionValue,
  lateDeduction,
  LATE_RATE_PER_MINUTE,
  type DeductionKey,
  type PayrollRow,
} from '../../utils/payrollDerive'
import type { PayoutEmailSummary } from '../../utils/payoutShareApi'
import { completedJobsBreakdown, completedJobsCount, shortDate, titleCase } from './payoutUtils'

// Pure helpers for the "email the technician their payout" feature (components live in PayoutEmailParts.tsx).

/** Same lines, same labels as the public payout page's summary card, so the email and the page agree. */
const DEDUCTION_LINES: { key: DeductionKey; label: string }[] = [
  { key: 'loan', label: 'AC Loan / CA' },
  { key: 'incompleteUpload', label: 'Incomplete Upload' },
  { key: 'losses', label: 'Losses / Material Checklist' },
  { key: 'remitPenalty', label: 'Remit' },
  { key: 'uniform', label: 'Uniform' },
  { key: 'grooming', label: 'Grooming' },
  { key: 'backjob', label: 'Backjob' },
]

const round2 = (n: number) => Math.round(n * 100) / 100

/** The numbers the email shows, from the very same helpers the modal and roster use for the net. */
export function buildPayoutEmailSummary(rows: PayrollRow[], verifiedBy: string, remarks: string): PayoutEmailSummary {
  const lateMinutes = deductionValue(rows, 'lateMinutes')
  const deductions = [
    ...(lateMinutes > 0
      ? [{ label: `Late (${lateMinutes} min × ₱${LATE_RATE_PER_MINUTE.toFixed(2)})`, amount: round2(lateDeduction(rows)) }]
      : []),
    ...DEDUCTION_LINES.map(l => ({ label: l.label, amount: round2(deductionValue(rows, l.key)) })),
  ].filter(l => l.amount > 0)
  return {
    jobCount: completedJobsCount(rows),
    jobBreakdown: completedJobsBreakdown(rows).split(' · ').join(', '),
    grossPay: round2(installerTotal(rows)),
    deductions,
    netPayout: round2(installerNet(rows)),
    verifiedBy: titleCase(verifiedBy),
    remarks: remarks.trim(),
  }
}

/** j•••••@gmail.com — enough to recognise the address, not enough to read it off a shared screen. */
export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '•••'
  return `${trimmed[0]}•••••${trimmed.slice(at)}`
}

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/

/** "Oct 5" from an ISO timestamp without letting the browser's timezone shift the day. */
export const emailedDay = (iso: string | null | undefined): string =>
  iso && ISO_DATE_PREFIX.test(iso) ? shortDate(iso.slice(0, 10)) : ''
