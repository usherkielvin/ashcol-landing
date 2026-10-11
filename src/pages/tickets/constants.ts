/**
 * Shared column and UI constants for Tickets pages/tabs.
 */

export const AUTOFIT_COLUMNS = new Set(['DESTINATION', 'DLR', 'COMMIT', 'BRAND'])

/** Schedules columns the user can hide (right-click a header); remembered per browser. */
export const SCHEDULE_HIDDEN_COLS_KEY = 'ashcol_schedule_hidden_cols_v1'

/** Always visible: the row's identity and the status control everything else hangs off. */
export const PROTECTED_SCHEDULE_COLS = new Set(['TICKET NO', "CUSTOMER'S NAME", 'STATUS'])

export const DEFAULT_COL_WIDTHS: Record<string, number> = {
  'TICKET NO': 115,
  'FINAL DATE': 130,
  "CUSTOMER'S NAME": 210,
  'DESTINATION': 135,
  'BRAND': 120,
  'DLR': 135,
  'COMMIT': 105,
  'INSTALLER': 125,
  'NEGOTIATOR': 110,
  'SERVICE': 120,
  'VEHICLE': 110,
  'STATUS': 130,
  'UPDATE': 160,
  'PAYMENT': 115,
}

export const MIN_COL_WIDTHS: Record<string, number> = {
  'TICKET NO': 65,
  'FINAL DATE': 75,
  "CUSTOMER'S NAME": 85,
  'DESTINATION': 70,
  'BRAND': 65,
  'DLR': 70,
  'COMMIT': 60,
  'INSTALLER': 70,
  'NEGOTIATOR': 65,
  'SERVICE': 65,
  'VEHICLE': 60,
  'STATUS': 75,
  'UPDATE': 80,
  'PAYMENT': 65,
}

/** Modes offered by the Payment Details popup. The popup's value must always be one of these, otherwise the <select> shows
 *  the first option (CASH) while the saved value is something else (e.g. "NO PAYMENT", which the backend treats as "clear"). */
export const PAYMENT_PROMPT_MODES = [
  'NO PAYMENT',
  'CASH',
  'BANK TRANSFER',
  'GCASH',
  'CHEQUE',
  'FOR COLLECTION',
  'HYBRID',
  'FREE INSTALL',
  'PENDING',
]

/** What the popup starts on for a ticket whose payment is `mode`. A ticket with no payment starts on NO PAYMENT, which has no
 *  amount field and cannot be saved: the person has to pick a real mode (CASH, GCASH…) first, which is what reveals the amount. */
export function initialPaymentPromptMode(mode?: string | null): string {
  const v = String(mode || '').trim().toUpperCase().replace(/_/g, ' ')
  if (!v || v === 'NO PAYMENT' || v === 'NONE' || v === 'NO') return 'NO PAYMENT'
  return v
}
