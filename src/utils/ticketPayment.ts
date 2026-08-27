import { sanitizeDisplayText } from './textSanitize'
import type { Ticket, ScheduleGhostKind, PaymentBreakdownEntry } from './ticketTypes'
import { parseAcMeta } from './ticketPatch'
import { getScheduleStatusValue } from './scheduleStatus'
import { shouldBlankReschedGhostPayment } from './ticketDates'
import {
  getF,
  parseBrand,
  resolveInstallerFieldRaw,
  formatServiceDriver,
} from './ticketDisplay'

export function parseImportMoney(raw?: string | number | null): number | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  const text = String(raw).trim()
  if (!text) return undefined
  const numeric = parseFloat(text.replace(/[\u20B1phpPHP,\s]/gi, ''))
  return Number.isNaN(numeric) ? undefined : numeric
}

export function normalizeImportPaymentMode(raw?: string | null): string {
  const v = (raw || '').toUpperCase().trim()
  if (!v) return ''
  if (v === 'FREE' || v.includes('FREE INSTALL')) return 'FREE INSTALL'
  if (v.includes('GCASH') || v === 'G-CASH') return 'GCASH'
  if (v.includes('BANK') || v.includes('TRANSFER')) return 'BANK TRANSFER'
  if (v.includes('CHEQUE') || v.includes('CHECK')) return 'CHEQUE'
  if (v === 'CASH' || v.includes('CASH')) return 'CASH'
  return v
}

export function parsePaymentFromModeString(raw: string): { mode: string; amount?: number } {
  const v = (raw || '').trim()
  if (!v) return { mode: '' }
  const amountMatch = v.match(/(\d[\d,]*(?:\.\d+)?)\s*$/u)
  if (amountMatch) {
    const amount = parseImportMoney(amountMatch[1])
    const modePart = v.slice(0, amountMatch.index).trim()
    const mode = normalizeImportPaymentMode(modePart) || modePart.toUpperCase()
    return { mode, amount: amount && amount > 0 ? amount : undefined }
  }
  return { mode: normalizeImportPaymentMode(v) || v.toUpperCase() }
}

export function resolveTicketPaymentAmount(ticket: Ticket): number | undefined {
  const meta = parseAcMeta(ticket)
  const candidates: unknown[] = [
    ticket.installationCharges,
    ticket.installation_charges,
    ticket.amountCharged,
    meta.installationCharges,
    meta.installation_charges,
    meta.amountCharged,
    meta.charges,
  ]
  for (const raw of candidates) {
    const parsed = parseImportMoney(raw as string | number | null | undefined)
    if (parsed != null && parsed > 0) return parsed
  }
  return undefined
}

export function resolveTicketPaymentModeRaw(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const ext = ticket as Ticket & { paymentStatus?: string; paymentMode?: string }
  const raw = (
    getF(ticket, 'modeOfPayment', 'mode_of_payment')
    || String(ext.paymentStatus || ext.paymentMode || meta.modeOfPayment || meta.paymentStatus || meta.paymentMode || '').trim()
  )
  return sanitizeDisplayText(raw)
}

export function isNoPaymentMode(mode?: string | null): boolean {
  const v = String(mode || '').trim().toUpperCase().replace(/\s+/g, '_')
  return v === 'NO_PAYMENT' || v === 'NONE' || v === 'NO'
}

export function resolveTicketPayment(ticket: Ticket): { mode: string; amount: number } {
  let mode = resolveTicketPaymentModeRaw(ticket)
  let amount = resolveTicketPaymentAmount(ticket)

  if (mode === 'FREE' || mode === 'FREE INSTALL' || mode === 'FREE_INSTALL') {
    return { mode: 'FREE INSTALL', amount: 0 }
  }

  if (isNoPaymentMode(mode)) {
    return { mode: 'NO PAYMENT', amount: 0 }
  }

  const st = getScheduleStatusValue(ticket)
  const isCheckupStatus = st === 'DONE_CHECKUP' || st === 'DONE_BACKJOB' || st === 'DONE_SYSTEM_REPROCESS' || st === 'DONE_DISMANTLE'
  if (isCheckupStatus && (!amount || amount <= 0)) {
    return { mode: mode || 'NO PAYMENT', amount: 0 }
  }

  if ((!amount || amount <= 0) && mode) {
    const parsed = parsePaymentFromModeString(mode)
    if (parsed.amount) amount = parsed.amount
    if (parsed.mode) mode = parsed.mode
  } else if (mode) {
    mode = normalizeImportPaymentMode(mode) || mode.toUpperCase()
  }

  return {
    mode: (mode || '').trim().toUpperCase() || 'NO PAYMENT',
    amount: amount && amount > 0 ? amount : 0,
  }
}

export function formatPaymentAmount(ticket: Ticket): string {
  const { mode, amount } = resolveTicketPayment(ticket)
  if (mode === 'FREE' || mode === 'FREE INSTALL') return 'FREE ₱0'
  if (!amount || amount <= 0) return ''
  return `₱${amount.toLocaleString('en-PH')}`
}

export function getSchedulePaymentDisplay(
  ticket: Ticket,
  dateKey?: string,
  ghostKind?: ScheduleGhostKind,
): string {
  if (shouldBlankReschedGhostPayment(dateKey, ghostKind)) return ''
  const resolved = resolveTicketPayment(ticket)
  if (resolved.mode === 'FREE' || resolved.mode === 'FREE INSTALL') return 'FREE ₱0'

  const amount = resolved.amount
  const mode = resolved.mode

  if (amount === 0 && (!mode || mode === 'NO PAYMENT')) return ''

  const amountStr = amount > 0 ? Math.round(amount).toLocaleString('en-PH') : '0'
  const breakdownStr = mode === 'HYBRID' ? formatPaymentBreakdownText(getPaymentBreakdown(ticket)) : ''

  if (mode && amountStr !== '0') return breakdownStr ? `${amountStr} ${mode} ${breakdownStr}` : `${amountStr} ${mode}`
  if (mode && mode !== 'NO PAYMENT') return `${mode} ₱${amountStr}`
  return amount > 0 ? `₱${amountStr}` : ''
}

export function formatCombinedPayment(ticket: Ticket): string {
  const { mode, amount } = resolveTicketPayment(ticket)
  if (mode === 'FREE' || mode === 'FREE INSTALL') return 'FREE ₱0'
  const amountStr = amount > 0 ? `₱${amount.toLocaleString('en-PH')}` : '₱0'
  if (mode && mode !== 'NO PAYMENT') return `${mode} ${amountStr}`
  return amountStr
}

export function getPaymentMode(ticket: Ticket): string {
  const { mode } = resolveTicketPayment(ticket)
  return mode || 'NO PAYMENT'
}

export function getPaymentBreakdown(ticket: Ticket): PaymentBreakdownEntry[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.paymentBreakdown
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry): PaymentBreakdownEntry | null => {
      if (!entry || typeof entry !== 'object') return null
      const mode = sanitizeDisplayText(String((entry as Record<string, unknown>).mode || '')).toUpperCase()
      const amount = parseImportMoney((entry as Record<string, unknown>).amount as string | number | null | undefined)
      if (!mode || amount == null || amount <= 0) return null
      return { mode, amount }
    })
    .filter((entry): entry is PaymentBreakdownEntry => entry != null)
}

export function formatPaymentBreakdownText(breakdown: PaymentBreakdownEntry[]): string {
  if (!breakdown.length) return ''
  return `(${breakdown.map(e => `${e.mode} ${Math.round(e.amount).toLocaleString('en-PH')}`).join(' + ')})`
}

export function ticketHasPaymentInfo(ticket: Partial<Ticket>): boolean {
  const mode = (ticket.modeOfPayment ?? ticket.mode_of_payment ?? '').trim()
  if (isNoPaymentMode(mode)) return false
  const charges = ticket.installationCharges ?? ticket.installation_charges
  return Boolean(mode || (charges != null && !Number.isNaN(Number(charges)) && Number(charges) > 0))
}

export type PaymentSectionRow = { mode: string; amount: number; customMode?: string }

/** Collapses the multi-row split-payment UI (PaymentSection) into the single `modeOfPayment` /
 *  `installationCharges` fields tickets are actually saved with, plus the `paymentBreakdown`
 *  array persisted in acDetails. A CUSTOM row resolves to its typed-in customMode name.
 *  Multiple rows become `HYBRID`. */
export function derivePaymentSummary(
  rows: PaymentSectionRow[],
): { modeOfPayment: string; installationCharges: number; paymentBreakdown: { mode: string; amount: number }[] } {
  const installationCharges = rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const paymentBreakdown = rows.map(p => ({
    mode: p.mode === 'CUSTOM' ? (p.customMode?.trim().toUpperCase() || 'CUSTOM') : p.mode,
    amount: Number(p.amount) || 0,
  }))
  const modeOfPayment = paymentBreakdown.length > 1
    ? 'HYBRID'
    : (paymentBreakdown[0]?.mode || 'NO_PAYMENT')
  return { modeOfPayment, installationCharges, paymentBreakdown }
}

export function getEmptyRequiredColumnsForClose(
  ticketOrForm: Partial<Ticket> & { serviceDriver?: string; ticketCategory?: any },
): string[] {
  const missing: string[] = []

  const ticketNo = (ticketOrForm.ticketNumber || (ticketOrForm as any).ticket_number || '').trim()
  if (!ticketNo) missing.push('Ticket No')

  const customer = (ticketOrForm.customerName || (ticketOrForm as any).customer_name || ticketOrForm.title || '').trim()
  if (!customer) missing.push('Customer')

  const district = (ticketOrForm.district || ticketOrForm.location || '').trim()
  if (!district) missing.push('District')

  const brand = (
    ticketOrForm.id
      ? parseBrand(ticketOrForm as Ticket)
      : (ticketOrForm.unitType || (ticketOrForm as any).unit_type || '')
  ).trim()
  if (!brand) missing.push('Brand')

  const dealer = ((ticketOrForm as any).dealer || ticketOrForm.sourceVendor || (ticketOrForm as any).source_vendor || (ticketOrForm as any).dealerName || (ticketOrForm as any).dealer_name || '').trim()
  if (!dealer) missing.push('Dealer')

  const commit = (
    ticketOrForm.id
      ? getF(ticketOrForm as Ticket, 'commitType', 'commitTerms', 'description')
      : (ticketOrForm.commitTerms || ticketOrForm.commitType || ticketOrForm.description || '')
  ).trim()
  if (!commit) missing.push('Commit')

  const negotiator = (ticketOrForm.negotiatorId || (ticketOrForm as any).negotiator_id || (ticketOrForm as any).assignedTo || '').trim()
  if (!negotiator) missing.push('Negotiator')

  const installer = (
    ticketOrForm.id
      ? resolveInstallerFieldRaw(ticketOrForm as Ticket)
      : (ticketOrForm.installerName || '')
  ).trim()
  if (!installer) missing.push('Installer')

  const driver = (
    ticketOrForm.id
      ? formatServiceDriver(ticketOrForm as Ticket)
      : (ticketOrForm.serviceDriver || '')
  ).trim()
  if (!driver) missing.push('Driver')

  return missing
}
