import { API_BASE_URL, isPortalAdmin, parseCreatedTicketResponse, readApiError } from './api'
import { isFieldCategory } from '../constants/ticketCategories'
import type { Ticket, ScheduleOutcome } from './ticketTypes'
import { parseAcMeta } from './ticketPatch'
import { isReschedulePending } from './ticketDates'
import { getEmptyRequiredColumnsForClose, resolveTicketPaymentAmount, resolveTicketPaymentModeRaw, getPaymentBreakdown } from './ticketPayment'
import { getTicketPhotosRaw, parseTicketPhotos } from './ticketPhotos'
import { fetchTicketById } from './ticketDisplay'
import { normalizeRelayScheduleTicket } from './relayScheduleSync'

/**
 * Close Ticket — portal side of the guarded close. The rules (outcome per job type, required
 * details / payment / documents) are owned by the backend (TicketCloseRules.java) and read from
 * GET /tickets/close-rules; the checks here only mirror them so the dialog can show the same
 * checklist before the server re-runs it.
 */

export type CloseBlockerKind = 'detail' | 'payment' | 'document'
export type CloseBlocker = { kind: CloseBlockerKind; label: string }

export type CloseRules = {
  documents: { id: string; label: string; keywords: string[] }[]
  requiredDocuments: Record<string, string[]>
  paymentOutcomes: string[]
  proofOfPaymentModes: string[]
  closedStatuses: string[]
}

const CLOSED_STATUS_FALLBACK = new Set([
  'COMPLETED',
  'INSTALLED',
  'DONE_INSTALLED',
  'DONE_INSTALL',
  'DONE_CLEANING',
  'DONE_SURVEY',
  'DONE_CHECKUP',
  'DONE_BACKJOB',
  'DONE_SERVICE',
  'DONE_DISMANTLE',
  'DONE_SYSTEM_REPROCESS',
  'DONE_MOUNTING',
  'DONE_RELOCATED',
  'DONE_NEGOTIATION',
  'DONE_QUOTATION',
])

function normStatus(raw?: string | null): string {
  return String(raw || '').toUpperCase().trim().replace(/\s+/g, '_')
}

function readToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

// ─── closed state / lock ──────────────────────────────────────────────────────

/** Closed field-schedule ticket. Office tickets reuse COMPLETED as a plain workflow state. */
export function isTicketClosed(ticket: Partial<Ticket> | null | undefined): boolean {
  if (!ticket) return false
  const status = normStatus((ticket as any).scheduleStatus || (ticket as any).schedule_status || ticket.status)
  const outcome = normStatus(ticket.scheduleOutcome || (ticket as any).schedule_outcome)
  const isClosedStatus = CLOSED_STATUS_FALLBACK.has(status) || status.startsWith('DONE_') || (
    Boolean(outcome) && (CLOSED_STATUS_FALLBACK.has(outcome) || outcome.startsWith('DONE_'))
  )
  if (!isClosedStatus) return false
  return isFieldCategory(ticket.ticketCategory || ticket.ticket_category)
}

/** Only the administrator can still edit — and reopen — closed tickets. */
export function canEditClosedTicket(role?: string | null): boolean {
  return isPortalAdmin(role)
}

/** True when this viewer must treat the ticket as read-only. */
export function isTicketLockedFor(ticket: Partial<Ticket> | null | undefined, role?: string | null): boolean {
  return isTicketClosed(ticket) && !canEditClosedTicket(role)
}

export function getClosedStamp(ticket: Partial<Ticket>): { by: string; at: string } {
  const by = String(ticket.closedBy ?? ticket.closed_by ?? '').trim()
  const raw = String(ticket.closedAt ?? ticket.closed_at ?? '').trim()
  let at = ''
  if (raw) {
    const d = new Date(raw)
    at = Number.isNaN(d.getTime())
      ? raw
      : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return { by, at }
}

// ─── outcome ──────────────────────────────────────────────────────────────────

export type CloseOutcomeResult = { outcome: ScheduleOutcome | null; reason?: string }

/** What this ticket closes as — mirrors TicketCloseRules.deriveOutcome on the backend. */
export function getCloseOutcome(ticket: Ticket): CloseOutcomeResult {
  const status = normStatus(ticket.status)
  if (isTicketClosed(ticket) || CLOSED_STATUS_FALLBACK.has(status)) return { outcome: null, reason: 'This ticket is already closed.' }
  if (status === 'CANCELLED') return { outcome: null, reason: 'A cancelled ticket cannot be closed.' }
  if (status === 'PENDING_APPROVAL' || status === 'FOR_COLLECTION') {
    return { outcome: null, reason: 'This ticket is waiting on something else and has no Done action.' }
  }
  if (status === 'RESCHED' && isReschedulePending(ticket)) {
    return { outcome: null, reason: 'Set the new schedule date before closing this ticket.' }
  }

  if (status === 'SURVEY') return { outcome: 'DONE_SURVEY' }
  if (status === 'FOR_APPROVAL' || status === 'FOR_QUOTATION') return { outcome: 'DONE_QUOTATION' }
  if (status === 'FOR_NEGOTIATION') return { outcome: 'DONE_NEGOTIATION' }
  if (status === 'SYSTEM_REPROCESS') return { outcome: 'DONE_SYSTEM_REPROCESS' }
  if (status === 'DISMANTLE') return { outcome: 'DONE_DISMANTLE' }
  if (status === 'RELOCATION') return { outcome: 'DONE_RELOCATED' }
  if (status === 'MOUNTING') return { outcome: 'DONE_MOUNTING' }

  const phase = String(parseAcMeta(ticket).schedulePhase || '').toUpperCase().replace(/\s+/g, '_')
  const fromPhase: Record<string, ScheduleOutcome> = {
    CLEANING: 'DONE_CLEANING',
    SURVEY: 'DONE_SURVEY',
    INSTALLATION: 'DONE_INSTALLED',
    INSTALL: 'DONE_INSTALLED',
    'S/I': 'DONE_INSTALLED',
    S_I: 'DONE_INSTALLED',
    SI: 'DONE_INSTALLED',
    SERVICES: 'DONE_SERVICE',
    SERVICE: 'DONE_SERVICE',
    CHECKUP: 'DONE_CHECKUP',
    BACKJOB: 'DONE_BACKJOB',
    MOUNTING: 'DONE_MOUNTING',
    SYSTEM_REPROCESS: 'DONE_SYSTEM_REPROCESS',
    DISMANTLE: 'DONE_DISMANTLE',
    RELOCATION: 'DONE_RELOCATED',
    FOR_NEGOTIATION: 'DONE_NEGOTIATION',
  }
  if (fromPhase[phase]) return { outcome: fromPhase[phase] }

  const category = String(ticket.ticketCategory || ticket.ticket_category || '').toUpperCase()
  if (category === 'SURVEY') return { outcome: 'DONE_SURVEY' }
  if (category === 'SERVICES') return { outcome: 'DONE_SERVICE' }
  return { outcome: 'DONE_INSTALLED' }
}

const OUTCOME_LABELS: Record<string, string> = {
  DONE_INSTALLED: 'Done Install',
  DONE_CLEANING: 'Done Cleaning',
  DONE_SURVEY: 'Done Survey',
  DONE_CHECKUP: 'Done Checkup',
  DONE_BACKJOB: 'Done Backjob',
  DONE_SERVICE: 'Done Service',
  DONE_MOUNTING: 'Done Mounting',
  DONE_NEGOTIATION: 'Done Negotiation',
  DONE_SYSTEM_REPROCESS: 'Done System Reprocess',
  DONE_DISMANTLE: 'Done Dismantle',
  DONE_RELOCATED: 'Done Relocated',
  DONE_QUOTATION: 'Done Quotation',
}

export function getCloseOutcomeLabel(outcome?: string | null): string {
  if (!outcome) return 'Done'
  return OUTCOME_LABELS[outcome] || outcome.replace(/_/g, ' ')
}

// ─── rules + blockers ─────────────────────────────────────────────────────────

let rulesPromise: Promise<CloseRules> | null = null

export function fetchCloseRules(): Promise<CloseRules> {
  if (rulesPromise) return rulesPromise
  rulesPromise = (async () => {
    const res = await fetch(`${API_BASE_URL}/tickets/close-rules`, {
      headers: { Authorization: `Bearer ${readToken()}` },
    })
    if (!res.ok) throw new Error(await readApiError(res))
    const json = await res.json()
    return (json?.data || json) as CloseRules
  })()
  rulesPromise.catch(() => { rulesPromise = null })
  return rulesPromise
}

function isFreeOrWarrantyCommit(ticket: Ticket): boolean {
  const meta = parseAcMeta(ticket)
  const commit = String(ticket.commitType || ticket.commitTerms || meta.commitTerms || '').toLowerCase()
  return commit.includes('free') || commit.includes('warranty')
}

function normalizeMode(raw?: string | null): string {
  return String(raw || '').trim().toUpperCase().replace(/_/g, ' ')
}

/** Details / payment / documents still missing for this outcome, evaluated on a FULL ticket. */
export function getCloseBlockers(ticket: Ticket, outcome: string, rules: CloseRules): CloseBlocker[] {
  const out: CloseBlocker[] = []

  for (const label of getEmptyRequiredColumnsForClose(ticket)) {
    out.push({ kind: 'detail', label })
  }

  const mode = normalizeMode(resolveTicketPaymentModeRaw(ticket))
  if (rules.paymentOutcomes.includes(outcome) && !isFreeOrWarrantyCommit(ticket)) {
    if (!mode || mode === 'NO PAYMENT' || mode === 'NONE') {
      out.push({ kind: 'payment', label: 'Mode of payment' })
    } else if (!mode.startsWith('FREE') && mode !== 'PENDING' && !((resolveTicketPaymentAmount(ticket) ?? 0) > 0)) {
      out.push({ kind: 'payment', label: 'Payment amount' })
    }
  }

  const descriptions = parseTicketPhotos(getTicketPhotosRaw(ticket)).map(p => String(p.description || '').toLowerCase())
  const required = [...(rules.requiredDocuments[outcome] || [])]
  const breakdownModes = getPaymentBreakdown(ticket).map(e => normalizeMode(e.mode))
  const needsProof = [mode, ...breakdownModes].some(m => rules.proofOfPaymentModes.includes(m))
  if (needsProof && !required.includes('receipt')) required.push('receipt')
  for (const id of required) {
    const rule = rules.documents.find(d => d.id === id)
    if (!rule) continue
    if (!descriptions.some(d => rule.keywords.some(k => d.includes(k)))) {
      out.push({ kind: 'document', label: rule.label })
    }
  }
  return out
}

/** Loads the full ticket (schedule rows are "light" and carry no attachments). */
export async function loadFullTicketForClose(ticket: Ticket): Promise<Ticket> {
  const fresh = await fetchTicketById(readToken(), ticket.id)
  return fresh ? ({ ...ticket, ...fresh } as Ticket) : ticket
}

/** Error text for a failed POST /close — includes the structured "what is missing" list. */
export async function readCloseError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const json = JSON.parse(text)
    const message = String(json?.message || '').trim()
    const missing = Array.isArray(json?.data?.missing) ? (json.data.missing as CloseBlocker[]) : []
    if (missing.length) {
      return `${message || 'Cannot close ticket yet.'}\n${missing.map(m => `• ${m.label}`).join('\n')}`
    }
    if (message) return message
  } catch { /* not JSON */ }
  return text.trim() || `Request failed (HTTP ${res.status})`
}

// ─── reopen ───────────────────────────────────────────────────────────────────

export async function reopenTicketRequest(ticketId: string, reason: string): Promise<Ticket> {
  const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readToken()}` },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await readApiError(res))
  const ticket = parseCreatedTicketResponse(await res.json()) as Ticket | null
  if (!ticket?.id) throw new Error('Ticket reopened, but the server returned no ticket — refresh the page.')
  return normalizeRelayScheduleTicket(ticket) as Ticket
}
