import {
  API_BASE_URL,
  fetchTicketByNumber,
  formatFetchError,
  readApiError,
  parseCreatedTicketResponse,
  resolveTicketScheduleBranchId,
  resolveScopedBranchId,
  branchScopesMatch,
  isNegotiatorCandidate,
  isTaguigBranchRef,
  isTaguigServicesScope,
  parseGlobalBranchScope,
  type InstallerBranchIndexEntry,
  type BranchStaffOption,
} from './api'
import {
  cacheTicketByNumber,
  getTicketByNumber,
  normalizeTicketNumberKey,
} from './ticketNumberStore'
import { EMPTY_CELL, sanitizeDisplayText } from './textSanitize'
import {
  applyRelayScheduleSyncToPatch,
  mergeRelayScheduleTicketPatch,
  normalizeRelayScheduleTicket,
} from './relayScheduleSync'
import {
  categoryDefaultServiceType,
  inferCategoryFromTicket,
  resolveScheduleStatusFields,
  type TicketCategoryValue,
} from '../constants/ticketCategories'
import { formatBrandCapacityLabel, parseBrandFromAcDetails } from './warrantyTicketDisplay'
import { notifyArchiveUpdated } from './ticketArchive'

export interface Ticket {
  id: string
  title: string
  description?: string
  serviceType?: string
  service_type?: string
  ticketCategory?: string
  ticket_category?: string
  serviceVehicle?: string
  service_vehicle?: string
  customerName?: string
  customer_name?: string
  customerEmail?: string
  customer_email?: string
  contactPhone?: string
  contact_phone?: string
  customerPhone?: string
  customer_phone?: string
  contactNumber?: string
  contact_number?: string
  mobile?: string
  mobileNumber?: string
  mobile_number?: string
  email?: string
  phone?: string
  location?: any
  unitType?: string
  unit_type?: string
  acDetails?: string
  ac_details?: string
  status: string
  createdAt?: string
  created_at?: string
  preferredDate?: string
  preferred_date?: string
  actualCompletion?: string
  actual_completion?: string
  updatedAt?: string
  updated_at?: string
  assignedTo?: string
  assigned_employee_name?: string
  assignedEmployeeName?: string
  branchId?: string
  branch_id?: string
  installerLineupBranchId?: string
  installer_lineup_branch_id?: string
  remarks?: string
  remarksUpdate?: string
  note?: string
  commitTerms?: string
  commitType?: string
  amountCharged?: number
  dealer?: string
  sourceVendor?: string
  source_vendor?: string
  district?: string
  installerName?: string
  negotiatorId?: string
  negotiator_id?: string
  controlNumber?: string
  control_number?: string
  ticketNumber?: string
  ticket_number?: string
  installationCharges?: number
  installation_charges?: number
  modeOfPayment?: string
  mode_of_payment?: string
  createdBy?: string
  driverName?: string
  driver_name?: string
  confirmationChecklist?: string | null
  confirmation_checklist?: string | null
}

export type ImportUpdate = {
  ticket: Ticket
  updatedFields: Partial<Ticket>
  originalTicket: Ticket
  rowIdx: number
}

export type ImportPaymentConfirmation = {
  ticket: Ticket
  value: string
  amount: string
  modeOfPayment: string
  controlNumber: string
  rowIdx: number
}

export type ImportUnmatchedRow = {
  name: string
  phone: string
  location: string
  district: string
  brand: string
  dlr: string
  status: string
  commit: string
  installer: string
  confirmation: string
  note: string
  service: string
  update: string
  charges: number | undefined
  paymentMode: string
  controlNo: string
  rowIdx: number
}



export const STATUS_OPTS = [
  'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY',
  'INSTALLED', 'COMPLETED', 'CONTINUATION',
  'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_DISMANTLE', 'PENDING_APPROVAL',
]
export const TABLE_ROW_HEIGHT = 50

/** Schedule install closed — DB uses INSTALLED; legacy rows may still be COMPLETED. */
export function isInstalledWorkflowStatus(status?: string | null): boolean {
  const s = (status || '').toUpperCase()
  return s === 'INSTALLED' || s === 'COMPLETED'
}

export type ScheduleOutcome = 'DONE_INSTALLED' | 'DONE_CLEANING' | 'DONE_SURVEY' | 'DONE_CHECKUP' | 'DONE_BACKJOB' | 'DONE_SERVICE' | 'DONE_SYSTEM_REPROCESS' | 'DONE_DISMANTLE' | 'DONE_QUOTATION'
export type ScheduleStatusGroup = 'pending' | 'closing'

export const SCHEDULE_STATUS_OPTS: { value: string; label: string; group: ScheduleStatusGroup }[] = [
  // Pending
  { value: 'S/I', label: 'SURVEY & INSTALL', group: 'pending' },
  { value: 'INSTALL', label: 'INSTALL', group: 'pending' },
  { value: 'SURVEY', label: 'SURVEY', group: 'pending' },
  { value: 'CLEANING', label: 'CLEANING', group: 'pending' },
  { value: 'CHECKUP', label: 'CHECKUP', group: 'pending' },
  { value: 'BACKJOB', label: 'BACKJOB', group: 'pending' },
  { value: 'SERVICE', label: 'SERVICE', group: 'pending' },
  { value: 'RESCHED', label: 'RESCHED', group: 'pending' },
  { value: 'CONTINUATION', label: 'CONTINUATION', group: 'pending' },
  { value: 'FOR_APPROVAL', label: 'FOR QUOTATION', group: 'pending' },
  { value: 'PENDING_APPROVAL', label: 'PENDING APPROVAL', group: 'pending' },
  { value: 'SYSTEM_REPROCESS', label: 'SYSTEM REPROCESS', group: 'pending' },
  { value: 'DISMANTLE', label: 'DISMANTLE', group: 'pending' },
  // Closing
  { value: 'DONE_INSTALLED', label: 'DONE INSTALL', group: 'closing' },
  { value: 'DONE_CLEANING', label: 'DONE CLEANING', group: 'closing' },
  { value: 'DONE_SURVEY', label: 'DONE SURVEY', group: 'closing' },
  { value: 'DONE_CHECKUP', label: 'DONE CHECKUP', group: 'closing' },
  { value: 'DONE_BACKJOB', label: 'DONE BACKJOB', group: 'closing' },
  { value: 'DONE_SERVICE', label: 'DONE SERVICE', group: 'closing' },
  { value: 'DONE_SYSTEM_REPROCESS', label: 'DONE SYSTEM REPROCESS', group: 'closing' },
  { value: 'DONE_DISMANTLE', label: 'DONE DISMANTLE', group: 'closing' },
  { value: 'DONE_QUOTATION', label: 'DONE QUOTATION', group: 'closing' },
  { value: 'CANCELLED', label: 'CANCELLED', group: 'closing' },
]

export const SCHEDULE_PENDING_OPTS = SCHEDULE_STATUS_OPTS.filter(o => o.group === 'pending')
export const SCHEDULE_CLOSING_OPTS = SCHEDULE_STATUS_OPTS.filter(o => o.group === 'closing')
export const CLOSING_SCHEDULE_STATUSES = new Set([
  'DONE_INSTALLED', 'DONE_CLEANING', 'DONE_SURVEY', 'DONE_CHECKUP', 'DONE_BACKJOB', 'DONE_SERVICE',
  'DONE_SYSTEM_REPROCESS', 'DONE_DISMANTLE', 'DONE_QUOTATION',
])
export const SCHEDULE_PENDING_STATUS_VALUES = new Set(SCHEDULE_PENDING_OPTS.map(o => o.value))
export const SCHEDULE_CLOSING_STATUS_VALUES = new Set(SCHEDULE_CLOSING_OPTS.map(o => o.value))

export function statusShowsScheduleDetails(_statusVal?: string): boolean {
  return true
}

export function getScheduleTicketKind(ticket: Ticket): string {
  const kind = inferCategoryFromTicket(ticket) as string
  if (kind === 'SURVEY' || kind === 'SERVICES' || kind === 'SURVEY & INSTALL' || kind === 'S/I' || kind === 'INSTALL' || kind === 'CLEANING' || kind === 'CHECKUP' || kind === 'BACKJOB') return kind
  return 'INSTALLATION'
}

export function getScheduleStatusBadgeStyle(value: string, isLight: boolean, isOverdue = false): { color: string; backgroundColor: string; borderColor: string } {
  if (isOverdue) {
    return { color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.35)', borderColor: '#ffffff' }
  }
  const normalized = value.toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'INSTALLATION' || normalized === 'INSTALL' || normalized === 'SCHEDULED' || normalized === 'S/I' || normalized === 'S_I' || normalized === 'SI') {
    return { color: isLight ? '#1d4ed8' : '#93c5fd', backgroundColor: isLight ? '#dbeafe' : 'rgba(59,130,246,0.18)', borderColor: isLight ? '#93c5fd' : 'rgba(59,130,246,0.35)' }
  }
  if (normalized === 'CLEANING') {
    return { color: isLight ? '#0369a1' : '#7dd3fc', backgroundColor: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.16)', borderColor: isLight ? '#7dd3fc' : 'rgba(14,165,233,0.35)' }
  }
  if (normalized === 'CHECKUP') {
    return { color: isLight ? '#0ea5e9' : '#38bdf8', backgroundColor: isLight ? '#f0f9ff' : 'rgba(14,165,233,0.16)', borderColor: isLight ? '#bae6fd' : 'rgba(14,165,233,0.35)' }
  }
  if (normalized === 'BACKJOB') {
    return { color: isLight ? '#c2410c' : '#fdba74', backgroundColor: isLight ? '#ffedd5' : 'rgba(234,88,12,0.16)', borderColor: isLight ? '#fdba74' : 'rgba(234,88,12,0.35)' }
  }
  if (normalized === 'SYSTEM_REPROCESS' || normalized === 'DONE_SYSTEM_REPROCESS') {
    return { color: isLight ? '#4338ca' : '#a5b4fc', backgroundColor: isLight ? '#e0e7ff' : 'rgba(99,102,241,0.18)', borderColor: isLight ? '#a5b4fc' : 'rgba(99,102,241,0.35)' }
  }
  if (normalized === 'DISMANTLE' || normalized === 'DONE_DISMANTLE') {
    return { color: isLight ? '#be123c' : '#fb7185', backgroundColor: isLight ? '#ffe4e6' : 'rgba(244,63,94,0.16)', borderColor: isLight ? '#fb7185' : 'rgba(244,63,94,0.35)' }
  }
  if (normalized === 'SURVEY') {
    return { color: isLight ? '#6d28d9' : '#c4b5fd', backgroundColor: isLight ? '#ede9fe' : 'rgba(139,92,246,0.18)', borderColor: isLight ? '#c4b5fd' : 'rgba(139,92,246,0.35)' }
  }
  if (normalized === 'DONE_SURVEY' || normalized === 'DONE_CHECKUP' || normalized === 'DONE_BACKJOB') {
    return { color: isLight ? '#a16207' : '#fbbf24', backgroundColor: isLight ? '#fef9c3' : 'rgba(251,191,36,0.18)', borderColor: isLight ? '#fcd34d' : 'rgba(251,191,36,0.35)' }
  }
  if (normalized === 'RESCHED') {
    return { color: isLight ? '#a16207' : '#fbbf24', backgroundColor: isLight ? '#fef9c3' : 'rgba(251,191,36,0.14)', borderColor: isLight ? '#fcd34d' : 'rgba(251,191,36,0.35)' }
  }
  if (normalized === 'CONTINUATION') {
    return { color: isLight ? '#7c3aed' : '#c084fc', backgroundColor: isLight ? '#f3e8ff' : 'rgba(124,58,237,0.18)', borderColor: isLight ? '#c084fc' : 'rgba(124,58,237,0.35)' }
  }
  if (normalized === 'FOR_APPROVAL') {
    return { color: isLight ? '#047857' : '#6ee7b7', backgroundColor: isLight ? '#d1fae5' : 'rgba(16,185,129,0.15)', borderColor: isLight ? '#6ee7b7' : 'rgba(16,185,129,0.3)' }
  }
  if (normalized === 'PENDING_APPROVAL') {
    return { color: isLight ? '#b45309' : '#fcd34d', backgroundColor: isLight ? '#fef3c7' : 'rgba(245,158,11,0.16)', borderColor: isLight ? '#fcd34d' : 'rgba(245,158,11,0.35)' }
  }
  if (
    normalized === 'DONE_INSTALLED' ||
    normalized === 'INSTALLED' ||
    normalized === 'COMPLETED' ||
    normalized === 'DONE_CLEANING' ||
    normalized === 'DONE_QUOTATION' ||
    normalized === 'DONE_SERVICE'
  ) {
    return { color: isLight ? '#15803d' : '#86efac', backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.18)', borderColor: isLight ? '#86efac' : 'rgba(22,163,74,0.35)' }
  }
  if (normalized === 'SERVICES') {
    return { color: isLight ? '#0e7490' : '#67e8f9', backgroundColor: isLight ? '#cffafe' : 'rgba(6,182,212,0.15)', borderColor: isLight ? '#67e8f9' : 'rgba(6,182,212,0.3)' }
  }
  return { color: isLight ? '#475569' : '#cbd5e1', backgroundColor: isLight ? '#f1f5f9' : 'rgba(148,163,184,0.12)', borderColor: isLight ? '#cbd5e1' : 'rgba(148,163,184,0.3)' }
}

export function getScheduleOutcome(ticket: Partial<Ticket>): ScheduleOutcome | null {
  const meta = parseAcMeta(ticket as Ticket)
  const explicit = String(meta.scheduleOutcome || '').toUpperCase()
  if (
    explicit === 'DONE_CLEANING'
    || explicit === 'DONE_INSTALLED'
    || explicit === 'DONE_SURVEY'
    || explicit === 'DONE_CHECKUP'
    || explicit === 'DONE_BACKJOB'
    || explicit === 'DONE_SERVICE'
    || explicit === 'DONE_SYSTEM_REPROCESS'
    || explicit === 'DONE_DISMANTLE'
    || explicit === 'DONE_QUOTATION'
  ) {
    return explicit
  }
  const remarks = ticketRemarksText(ticket as Ticket).toLowerCase()
  const stat = String(ticket.status || '').toUpperCase()
  if (isInstalledWorkflowStatus(stat)) {
    if (/clean/i.test(remarks)) return 'DONE_CLEANING'
    if (/checkup|check-up/i.test(remarks)) return 'DONE_CHECKUP'
    if (/backjob|back-job|back job/i.test(remarks)) return 'DONE_BACKJOB'
    if (/survey/i.test(remarks)) return 'DONE_SURVEY'
    if (isInstalledRemarks(remarks)) return 'DONE_INSTALLED'
  }
  if (stat === 'SURVEY' && /done.*survey|survey.*done|surveyed/i.test(remarks)) return 'DONE_SURVEY'
  if (stat === 'DONE_SYSTEM_REPROCESS') return 'DONE_SYSTEM_REPROCESS'
  if (stat === 'DONE_DISMANTLE') return 'DONE_DISMANTLE'
  return null
}

export function getScheduleStatusValue(ticket: Ticket): string {
  const outcome = getScheduleOutcome(ticket)
  if (outcome) return outcome

  const meta = parseAcMeta(ticket)
  const phase = String(meta.schedulePhase || '').toUpperCase().replace(/\s+/g, '_')
  if (phase === 'CLEANING') return 'CLEANING'
  if (phase === 'SURVEY') return 'SURVEY'
  if (phase === 'INSTALLATION') return 'INSTALLATION'
  if (phase === 'SERVICES' || phase === 'SERVICE') return 'SERVICES'
  if (phase === 'CHECKUP') return 'CHECKUP'
  if (phase === 'BACKJOB') return 'BACKJOB'
  if (phase === 'SYSTEM_REPROCESS') return 'SYSTEM_REPROCESS'
  if (phase === 'DISMANTLE') return 'DISMANTLE'
  if (phase === 'PENDING_APPROVAL') return 'PENDING_APPROVAL'

  let stat = (ticket.status || 'SCHEDULED').toUpperCase().replace(/\s+/g, '_')
  if (stat === 'S/I' || stat === 'S_I' || stat === 'SI') return 'S/I'
  if (stat === 'INSTALL') return 'INSTALL'
  if (stat === 'CHECKUP') return 'CHECKUP'
  if (stat === 'INSTALLATION') return 'INSTALLATION'
  if (stat === 'FOR_QUOTATION') stat = 'FOR_APPROVAL'
  if (stat === 'RESCHED') return 'RESCHED'
  if (stat === 'SURVEY') return 'SURVEY'
  if (stat === 'FOR_APPROVAL') return 'FOR_APPROVAL'
  if (stat === 'PENDING_APPROVAL') return 'PENDING_APPROVAL'
  if (stat === 'CONTINUATION') return 'CONTINUATION'
  if (stat === 'SYSTEM_REPROCESS') return 'SYSTEM_REPROCESS'
  if (stat === 'DONE_SYSTEM_REPROCESS') return 'DONE_SYSTEM_REPROCESS'
  if (stat === 'DISMANTLE') return 'DISMANTLE'
  if (stat === 'DONE_DISMANTLE') return 'DONE_DISMANTLE'
  if (stat === 'CANCELLED') return 'CANCELLED'
  if (stat === 'INSTALLED' || stat === 'COMPLETED') return 'DONE_INSTALLED'

  const kind = getScheduleTicketKind(ticket)
  if (kind === 'SURVEY') return 'SURVEY'
  if (kind === 'SERVICES') return 'SERVICES'
  if (kind === 'SURVEY & INSTALL' || kind === 'S/I') return 'SURVEY & INSTALL'
  if (kind === 'INSTALL') return 'INSTALL'
  if (kind === 'CLEANING') return 'CLEANING'
  if (kind === 'CHECKUP') return 'CHECKUP'
  if (kind === 'BACKJOB') return 'BACKJOB'
  return 'INSTALLATION'
}

export function getScheduleStatusLabel(value: string): string {
  const normalized = value.toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'INSTALLED') return 'INSTALLED'
  if (normalized === 'S/I' || normalized === 'S_I' || normalized === 'SI') return 'INSTALLATION'
  const found = SCHEDULE_STATUS_OPTS.find(opt => opt.value === normalized)
  return (found?.label ?? value.replace(/_/g, ' ')).toUpperCase()
}

/** Rank overview search hits Ã¢â‚¬â€ exact / prefix name matches float to the top. */
export function getOverviewSearchRelevanceScore(ticket: Ticket, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return 0

  const scoredFields: { value: string; weight: number; exactBonus: number; prefixBonus: number }[] = [
    {
      value: ticket.customerName || ticket.customer_name || ticket.title || '',
      weight: 100,
      exactBonus: 250,
      prefixBonus: 120,
    },
    {
      value: ticket.ticketNumber || ticket.ticket_number || ticket.id || '',
      weight: 90,
      exactBonus: 200,
      prefixBonus: 100,
    },
    {
      value: ticket.controlNumber || ticket.control_number || '',
      weight: 75,
      exactBonus: 150,
      prefixBonus: 70,
    },
    {
      value: ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '',
      weight: 65,
      exactBonus: 120,
      prefixBonus: 50,
    },
    {
      value: formatAddress(ticket.location),
      weight: 45,
      exactBonus: 0,
      prefixBonus: 25,
    },
    {
      value: ticket.assignedEmployeeName || ticket.assigned_employee_name || '',
      weight: 40,
      exactBonus: 80,
      prefixBonus: 30,
    },
    {
      value: ticket.remarks || ticket.remarksUpdate || ticket.note || '',
      weight: 25,
      exactBonus: 0,
      prefixBonus: 10,
    },
  ]

  let score = 0
  for (const { value, weight, exactBonus, prefixBonus } of scoredFields) {
    const v = value.toLowerCase().trim()
    if (!v) continue
    if (v === q) score += weight + exactBonus
    else if (v.startsWith(q)) score += weight + prefixBonus
    else if (v.includes(q)) score += weight
    else if (q.length >= 2 && v.split(/\s+/).some(word => word.startsWith(q))) {
      score += Math.round(weight * 0.75)
    }
  }
  return score
}

export function sortOverviewSearchResults(tickets: Ticket[], query: string): Ticket[] {
  const q = query.trim()
  if (!q) return tickets
  return [...tickets].sort((a, b) => {
    const diff = getOverviewSearchRelevanceScore(b, q) - getOverviewSearchRelevanceScore(a, q)
    if (diff !== 0) return diff
    const aDate = a.updatedAt || a.updated_at || a.createdAt || a.created_at || ''
    const bDate = b.updatedAt || b.updated_at || b.createdAt || b.created_at || ''
    return bDate.localeCompare(aDate)
  })
}

export function ticketMatchesOverviewQuery(ticket: Ticket, rawQuery: string): boolean {
  const q = rawQuery.trim()
  if (!q) return false

  const qUpper = q.toUpperCase()
  const qLower = q.toLowerCase()
  const qDigits = q.replace(/\D/g, '')

  if (/^AS-\d+/i.test(q) || /^TKT-\d+/i.test(q)) {
    const tn = normalizeTicketNumberKey(ticket.ticketNumber || ticket.ticket_number)
    return tn === qUpper || tn.startsWith(qUpper)
  }

  const ticketNum = normalizeTicketNumberKey(ticket.ticketNumber || ticket.ticket_number)
  if (ticketNum && (ticketNum === qUpper || ticketNum.startsWith(qUpper))) return true

  const control = (ticket.controlNumber || ticket.control_number || '').trim().toLowerCase()
  if (control && (control === qLower || control.includes(qLower))) return true

  if (qDigits.length >= 7) {
    const phone = (ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '')
      .replace(/\D/g, '')
    if (phone && phone.includes(qDigits)) return true
    const negPhone = ((ticket as any).negotiatorPhone || (ticket as any).negotiator_phone || '').replace(/\D/g, '')
    if (negPhone && negPhone.includes(qDigits)) return true
  }

  return getOverviewSearchRelevanceScore(ticket, q) >= 25
}

export function filterOverviewSearchResults(tickets: Ticket[], query: string): Ticket[] {
  const q = query.trim()
  if (!q) return []
  return tickets.filter(ticket => ticketMatchesOverviewQuery(ticket, q))
}

/** Overview search cards: one badge Ã¢â‚¬â€ workflow status (SCHEDULED) beats duplicate INSTALLATION phase. */
export function getOverviewStatusBadge(ticket: Ticket): { value: string; label: string } {
  const workflow = (ticket.status || '').toUpperCase().replace(/\s+/g, '_')
  if (workflow === 'ASSIGNED' && hasFinalScheduleDate(ticket)) {
    return { value: 'SCHEDULED', label: getScheduleStatusLabel('SCHEDULED') }
  }
  const workflowStatuses = new Set([
    'SCHEDULED', 'ASSIGNED', 'RESCHED', 'PENDING', 'IN_PROGRESS', 'ON_THE_WAY',
    'FOR_APPROVAL', 'FOR_QUOTATION', 'CANCELLED', 'COMPLETED', 'INSTALLED',
    'CONTINUATION', 'SURVEY',
    'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_DISMANTLE',
  ])
  if (workflowStatuses.has(workflow)) {
    const norm = workflow === 'FOR_QUOTATION' ? 'FOR_APPROVAL' : workflow
    return { value: norm, label: getScheduleStatusLabel(norm) }
  }
  const phase = getScheduleStatusValue(ticket)
  return { value: phase, label: getScheduleStatusLabel(phase) }
}

/** True when ticket still carries reschedule ghost metadata (old date row / Moved toÃ¢â‚¬Â¦). */
export function ticketHasRescheduleMeta(ticket: Ticket): boolean {
  if ((ticket.status || '').toUpperCase() === 'RESCHED') return true
  if (getScheduleStatusValue(ticket) === 'RESCHED') return true
  if (isReschedulePending(ticket)) return true
  if (getPreviousScheduleDates(ticket).length > 0) return true
  const meta = parseAcMeta(ticket)
  if (String(meta.rescheduledTo || '').trim()) return true
  const remarks = (ticket.remarksUpdate || ticket.remarks || '').trim()
  return isMovedToRescheduleRemark(remarks)
}

/** Clear ghost-date / Moved-to state when leaving RESCHED for an active status. */
export function clearRescheduleMetaInto(
  ticket: Ticket,
  body: Record<string, unknown>,
  acUpdates: Record<string, unknown>,
) {
  if (!ticketHasRescheduleMeta(ticket)) return

  // previousScheduleDates is kept (not cleared) — it's the permanent ghost-row history for the
  // old date, and should survive the ticket moving on to an active status on its new date.
  acUpdates.rescheduledTo = ''
  acUpdates.reschedulePending = false

  const remarks = (ticket.remarksUpdate || ticket.remarks || '').trim()
  if (isMovedToRescheduleRemark(remarks) || /^PENDING$/i.test(remarks)) {
    body.remarks = ''
    body.remarksUpdate = ''
    acUpdates.update = ''
    acUpdates.remarksUpdate = ''
  }

  // Keep the ticket on its current preferred date (the reschedule target), as an active row
  const meta = parseAcMeta(ticket)
  const target = String(meta.rescheduledTo || '').split('T')[0].trim()
  const preferred = getPreferredDateKey(ticket)
  if (target) body.preferredDate = target
  else if (preferred) body.preferredDate = preferred
}

export function applyScheduleStatusPatch(ticket: Ticket, scheduleValue: string): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const val = scheduleValue.toUpperCase().replace(/\s+/g, '_')
  const acUpdates: Record<string, unknown> = { schedulePhase: '' }

  const setClosing = (outcome: ScheduleOutcome) => {
    body.status = 'COMPLETED'
    body.scheduleOutcome = outcome
    acUpdates.scheduleOutcome = outcome
    acUpdates.schedulePhase = ''
  }

  if (val === 'DONE_CLEANING') {
    setClosing('DONE_CLEANING')
  } else if (val === 'DONE_CHECKUP') {
    setClosing('DONE_CHECKUP')
  } else if (val === 'DONE_BACKJOB') {
    setClosing('DONE_BACKJOB')
  } else if (val === 'DONE_SERVICE') {
    setClosing('DONE_SERVICE')
  } else if (val === 'DONE_INSTALLED') {
    body.status = 'INSTALLED'
    body.scheduleOutcome = 'DONE_INSTALLED'
    acUpdates.scheduleOutcome = 'DONE_INSTALLED'
    acUpdates.schedulePhase = ''
  } else if (val === 'DONE_SURVEY') {
    setClosing('DONE_SURVEY')
  } else if (val === 'DONE_SYSTEM_REPROCESS') {
    body.status = 'DONE_SYSTEM_REPROCESS'
    body.scheduleOutcome = 'DONE_SYSTEM_REPROCESS'
    acUpdates.scheduleOutcome = 'DONE_SYSTEM_REPROCESS'
    acUpdates.schedulePhase = ''
  } else if (val === 'DONE_DISMANTLE') {
    body.status = 'DONE_DISMANTLE'
    body.scheduleOutcome = 'DONE_DISMANTLE'
    acUpdates.scheduleOutcome = 'DONE_DISMANTLE'
    acUpdates.schedulePhase = ''
  } else if (val === 'DONE_QUOTATION') {
    setClosing('DONE_QUOTATION')
  } else if (val === 'SYSTEM_REPROCESS') {
    body.status = 'SYSTEM_REPROCESS'
    body.ticketCategory = 'SERVICES'
    body.serviceType = 'SYSTEM REPROCESS'
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'SYSTEM_REPROCESS'
  } else if (val === 'DISMANTLE') {
    body.status = 'DISMANTLE'
    body.ticketCategory = 'SERVICES'
    body.serviceType = 'DISMANTLE'
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'DISMANTLE'
  } else if (val === 'FOR_QUOTATION') {
    body.status = 'FOR_APPROVAL'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CLEANING') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'CLEANING'
  } else if (val === 'CHECKUP') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'CHECKUP'
  } else if (val === 'BACKJOB') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'BACKJOB'
  } else if (val === 'INSTALLATION' || val === 'S/I' || val === 'S_I' || val === 'SI' || val === 'INSTALL') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'INSTALLATION'
    body.serviceType = categoryDefaultServiceType('INSTALLATION')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'INSTALLATION'
  } else if (val === 'SERVICES' || val === 'SERVICE') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'SERVICES'
  } else if (val === 'SURVEY') {
    body.status = 'SURVEY'
    body.ticketCategory = 'SURVEY'
    body.serviceType = categoryDefaultServiceType('SURVEY')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'SURVEY'
  } else if (val === 'RESCHED') {
    body.status = 'RESCHED'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'FOR_APPROVAL') {
    body.status = 'FOR_APPROVAL'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'PENDING_APPROVAL') {
    body.status = 'PENDING_APPROVAL'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CONTINUATION') {
    body.status = 'CONTINUATION'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CANCELLED') {
    body.status = 'CANCELLED'
    acUpdates.scheduleOutcome = ''
    // Preserve branch so the muted Schedules ghost survives reload (branch-scoped fetch + filter).
    const cancelBranch = resolveScopedBranchId(ticket.branchId || ticket.branch_id)
    if (cancelBranch) {
      body.branchId = cancelBranch
      acUpdates.cancelledBranchId = cancelBranch
    }
    // Keep date anchors so the row stays on this Schedules day after reload (preferred_date + ac_details).
    const cancelDate = getFinalDateKey(ticket)
      || getPreferredDateKey(ticket)
      || String(parseAcMeta(ticket).scheduledDate || '').split('T')[0].split(' ')[0].trim()
    if (cancelDate) {
      body.finalDate = cancelDate
      body.preferredDate = cancelDate
      acUpdates.finalDate = cancelDate
      acUpdates.scheduledDate = cancelDate
      acUpdates.cancelledScheduleDate = cancelDate
    }
  } else if (SCHEDULE_STATUS_OPTS.some(opt => opt.value === val)) {
    // Safety net for any pending/closing option added to SCHEDULE_STATUS_OPTS without an
    // explicit branch above — resolve through the shared mapper instead of sending the raw
    // button value straight through (that crashes with "No enum constant Ticket.Status.X").
    const resolved = resolveScheduleStatusFields(val)
    body.status = resolved.status
    if (resolved.ticketCategory) body.ticketCategory = resolved.ticketCategory
    if (resolved.serviceType) body.serviceType = resolved.serviceType
    acUpdates.scheduleOutcome = resolved.scheduleOutcome ?? ''
    if (resolved.schedulePhase !== undefined) acUpdates.schedulePhase = resolved.schedulePhase
  }

  // ─────────────────────────────────────────────────────────────
  if (val !== 'RESCHED') {
    clearRescheduleMetaInto(ticket, body, acUpdates)
  }

  if (Object.keys(acUpdates).length > 0) {
    body.acDetails = mergeAcMeta(ticket, acUpdates)
  }
  return body
}

export function mergeTicketPatch(ticket: Ticket, body: Record<string, unknown>): Ticket {
  const merged = mergeRelayScheduleTicketPatch(ticket, body)
  if (Object.prototype.hasOwnProperty.call(body, 'serviceVehicle')) {
    const sv = body.serviceVehicle
    const cleared = sv == null || sv === ''
    merged.serviceVehicle = cleared ? undefined : String(sv)
    merged.service_vehicle = merged.serviceVehicle
  }
  if (Object.prototype.hasOwnProperty.call(body, 'driverName') || Object.prototype.hasOwnProperty.call(body, 'driver_name')) {
    const dn = body.driverName !== undefined ? body.driverName : body.driver_name
    const cleared = dn == null || dn === ''
    merged.driverName = cleared ? undefined : String(dn)
    merged.driver_name = merged.driverName
  }
  return merged
}

export function hasLocalScheduleValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

/** Normalize a list of raw tickets (e.g. from cache) through the same relay-schedule normalization as a single ticket. */
export function normalizeRelayScheduleTicketList(tickets: Ticket[]): Ticket[] {
  return tickets.map(t => normalizeRelayScheduleTicket(t) as Ticket)
}

/** Keep installer / driver / payment / remarks from the user's local row when server sync returns stale data. */
export function preserveLocalScheduleFields(local: Ticket, server: Ticket): Ticket {
  const normalizedServer = normalizeRelayScheduleTicket(server)
  let next = mergeTicketPatch(local, normalizedServer as unknown as Record<string, unknown>)

  // ── Terminal-status downgrade guard ──────────────────────────────────
  // If the local ticket has a completion/terminal status (INSTALLED, COMPLETED, DONE_DISMANTLE,
  // DONE_SYSTEM_REPROCESS, CANCELLED), a stale server response must never revert it to a non-terminal status
  // (SCHEDULED, PENDING, ASSIGNED, etc.). Terminal statuses are monotonic — once a ticket is marked
  // done, only another terminal status or an explicit user action should change it.
  const TERMINAL_STATUSES = new Set(['INSTALLED', 'COMPLETED', 'DONE_DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'CANCELLED'])
  const localStatus = String(local.status || '').toUpperCase()
  const mergedStatus = String(next.status || '').toUpperCase()
  if (TERMINAL_STATUSES.has(localStatus) && !TERMINAL_STATUSES.has(mergedStatus)) {
    next.status = local.status
    // Also preserve the scheduleOutcome so the display label stays correct
    const localMeta = parseAcMeta(local)
    if (localMeta.scheduleOutcome) {
      next.acDetails = mergeAcMeta(next, { scheduleOutcome: localMeta.scheduleOutcome, schedulePhase: '' })
      next.ac_details = next.acDetails
    }
  }

  const copyIfLocal = (field: keyof Ticket) => {
    const localVal = local[field]
    if (hasLocalScheduleValue(localVal)) {
      (next as unknown as Record<string, unknown>)[field as string] = localVal
    }
  }

  copyIfLocal('installerName')
  copyIfLocal('serviceVehicle')
  copyIfLocal('driverName')
  copyIfLocal('modeOfPayment')
  copyIfLocal('installationCharges')
  copyIfLocal('remarksUpdate')
  copyIfLocal('remarks')
  copyIfLocal('status')
  copyIfLocal('serviceType')
  copyIfLocal('commitType')
  copyIfLocal('preferredDate')
  // Every other Edit-Ticket-modal field must survive the same stale-server-refetch race as
  // driver/vehicle/date above — branchId especially, since a just-moved branch (e.g. Taguig
  // Sales -> Services) getting reverted by a lagging read silently reassigns the ticket back
  // to the wrong branch's table.
  copyIfLocal('branchId')
  copyIfLocal('customerName')
  copyIfLocal('location')
  copyIfLocal('contactPhone')
  copyIfLocal('unitType')
  copyIfLocal('dealer')
  copyIfLocal('sourceVendor')
  copyIfLocal('district')
  copyIfLocal('negotiatorId')
  copyIfLocal('ticketNumber')
  copyIfLocal('controlNumber')

  if (hasLocalScheduleValue(local.mode_of_payment)) next.mode_of_payment = local.mode_of_payment
  if (hasLocalScheduleValue(local.installation_charges)) next.installation_charges = local.installation_charges
  if (hasLocalScheduleValue(local.service_vehicle)) next.service_vehicle = local.service_vehicle
  if (hasLocalScheduleValue(local.driver_name)) next.driver_name = local.driver_name
  if (hasLocalScheduleValue(local.branch_id)) next.branch_id = local.branch_id
  if (hasLocalScheduleValue(local.customer_name)) next.customer_name = local.customer_name
  if (hasLocalScheduleValue(local.contact_phone)) next.contact_phone = local.contact_phone
  if (hasLocalScheduleValue(local.unit_type)) next.unit_type = local.unit_type
  if (hasLocalScheduleValue(local.source_vendor)) next.source_vendor = local.source_vendor
  if (hasLocalScheduleValue(local.negotiator_id)) next.negotiator_id = local.negotiator_id
  if (hasLocalScheduleValue(local.control_number)) next.control_number = local.control_number
  if (hasLocalScheduleValue(local.ticket_number)) next.ticket_number = local.ticket_number
  const localFinalDate = (local as Ticket & { finalDate?: string; final_date?: string }).finalDate
    || (local as Ticket & { final_date?: string }).final_date
  if (hasLocalScheduleValue(localFinalDate)) {
    (next as Ticket & { finalDate?: string; final_date?: string }).finalDate = localFinalDate;
    (next as Ticket & { final_date?: string }).final_date = localFinalDate
  }
  const localPreferredDate = local.preferred_date
  if (hasLocalScheduleValue(localPreferredDate)) next.preferred_date = localPreferredDate
  const localRemarksUpdate = (local as Ticket & { remarks_update?: string }).remarks_update
  if (hasLocalScheduleValue(localRemarksUpdate)) {
    (next as Ticket & { remarks_update?: string }).remarks_update = localRemarksUpdate
  }

  if (local.acDetails?.trim()) {
    try {
      const localMeta = parseAcMeta(local)
      const serverMeta = parseAcMeta(next)
      const mergedMeta: Record<string, unknown> = { ...serverMeta }
      for (const key of [
        'installerName', 'installer', 'technicianName', 'driverName', 'serviceVehicle', 'driver_name',
        'modeOfPayment', 'installationCharges', 'installation_charges', 'update', 'remarksUpdate',
        'scheduleOutcome', 'paymentMode', 'paymentStatus', 'charges', 'amountCharged',
        // Schedule date fields — a just-saved date move must never be clobbered by a stale
        // server re-fetch (e.g. read-after-write lag on the prod DB pooler); local is fresher.
        'finalDate', 'scheduledDate', 'previousScheduleDates', 'rescheduledTo', 'reschedulePending',
        'archivedScheduleDate', 'installedDate', 'cancelledScheduleDate', 'cancelledBranchId',
        'rescheduleHistoryDates',
        // Remaining Edit-Ticket-modal fields — same read-after-write race applies to these as
        // to driver/vehicle/date above, so they need the same "local wins" protection.
        'destination', 'address', 'district', 'brand', 'unitType', 'dealer', 'dlr',
        'negotiatorId', 'negotiatorName',
      ]) {
        const v = localMeta[key]
        if (hasLocalScheduleValue(v)) mergedMeta[key] = v
      }
      next.acDetails = JSON.stringify(mergedMeta)
      next.ac_details = next.acDetails
    } catch {
      next.acDetails = local.acDetails
      next.ac_details = local.acDetails
    }
  }

  return normalizeRelayScheduleTicket(next)
}

export function mergeServerListWithLocalEdits(
  serverList: Ticket[],
  localList: Ticket[],
  editedIds: Set<string>,
  options?: {
    dateFilter?: string
    extraLocal?: Ticket[]
    /** Active branch — required so date-retained cancelled edits can't reappear after a branch switch. */
    branchId?: string | null
    email?: string | null
    jobTitle?: string | null
    lineupIndex?: InstallerBranchIndexEntry[]
    driverOnlyNames?: string[]
  },
): Ticket[] {
  // The server response is the source of truth for what's ON this date/branch. Only rows this
  // browser genuinely has unconfirmed state for — recently edited within the 5-minute window,
  // still queued/in-flight saves, or not-yet-created temp rows, all folded into editedIds by the
  // caller — survive a server response that omits them. Anything else is trusted to reflect real
  // backend state: if the server no longer returns it, it no longer belongs here.
  // (This used to also re-add ANY row ever cached for this date regardless of age, via a
  // "stickyLocal" flag — meant to stop a stale/incomplete server response from making rows vanish,
  // but it meant a browser that had once loaded a ticket kept showing it forever even after it was
  // deleted/moved elsewhere, while other devices with no such cache correctly stopped showing it.
  // That per-device divergence is exactly what this function must prevent.)
  if (editedIds.size === 0) return serverList

  const localById = new Map<string, Ticket>()
  for (const t of localList) localById.set(t.id, t)
  for (const t of options?.extraLocal || []) {
    if (!localById.has(t.id)) localById.set(t.id, t)
  }
  if (localById.size === 0) return serverList

  const serverIds = new Set(serverList.map(t => t.id))
  const merged = serverList.map(serverTicket => {
    const local = localById.get(serverTicket.id)
    if (!local || !editedIds.has(serverTicket.id)) return serverTicket
    return preserveLocalScheduleFields(local, serverTicket)
  })

  const dateKey = options?.dateFilter
  const branchKey = options?.branchId
  const lineup = options?.lineupIndex
  const drivers = options?.driverOnlyNames || []
  for (const local of localById.values()) {
    if (serverIds.has(local.id)) continue
    if (!editedIds.has(local.id)) continue
    if (dateKey && !ticketMatchesDateKey(local, dateKey) && !isScheduleGhostOnDate(local, dateKey)) continue
    // Date match alone is not enough — a just-cancelled ticket stays "protected" for ~5 min and
    // would otherwise reappear when the admin switches Active Branch on the same schedule date.
    if (branchKey && branchKey !== 'ALL_BRANCHES'
      && !ticketBelongsOnScheduleBranch(local, branchKey, options?.email, options?.jobTitle, lineup, drivers)) {
      continue
    }
    merged.unshift(normalizeRelayScheduleTicket(local) as Ticket)
  }

  return merged
}

export function resolveTicketScheduleDateKey(ticket: Ticket): string {
  const final = getFinalDateKey(ticket)
  if (final) return final
  const scheduled = String(parseAcMeta(ticket).scheduledDate || '').split('T')[0].split(' ')[0].trim()
  if (scheduled) return scheduled
  return getPreferredDateKey(ticket) || ''
}

export function resolveFormScheduleDateKey(form: { finalDate?: string; preferredDate?: string }): string {
  const final = form.finalDate?.split('T')[0]?.trim() || ''
  const preferred = form.preferredDate?.split('T')[0]?.trim() || ''
  return final || preferred
}

export function mergeAcDetailsStrings(base?: string, overlay?: string): string | undefined {
  if (!overlay) return base
  if (!base) return overlay
  try {
    const baseParsed = JSON.parse(base)
    const overlayParsed = JSON.parse(overlay)
    const baseMeta = (Array.isArray(baseParsed) ? baseParsed[0] : baseParsed) || {}
    const overlayMeta = (Array.isArray(overlayParsed) ? overlayParsed[0] : overlayParsed) || {}
    return JSON.stringify({ ...baseMeta, ...overlayMeta })
  } catch {
    return overlay
  }
}

export function mergePatchBodies(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...a, ...b }
  const ac = mergeAcDetailsStrings(
    typeof a.acDetails === 'string' ? a.acDetails : undefined,
    typeof b.acDetails === 'string' ? b.acDetails : undefined,
  )
  if (ac !== undefined) merged.acDetails = ac
  return merged
}

/** Ensure PATCH body is valid for schedule status saves (esp. INSTALLED/COMPLETED + scheduleOutcome). */
export function sanitizeTicketPatchBody(body: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body }
  const outcomeRaw = typeof next.scheduleOutcome === 'string' ? next.scheduleOutcome.trim() : ''
  if (outcomeRaw) {
    next.scheduleOutcome = outcomeRaw
  } else {
    delete next.scheduleOutcome
  }

  let status = String(next.status || '').toUpperCase()
  const outcome = String(next.scheduleOutcome || '').toUpperCase()
  if (status === 'COMPLETED' && outcome === 'DONE_INSTALLED') {
    status = 'INSTALLED'
    next.status = 'INSTALLED'
  }
  // Only restore scheduleOutcome from acDetails for INSTALLED/COMPLETED statuses that should have an outcome.
  // Don't restore for RESCHED or other non-completion statuses - they should have empty scheduleOutcome.
  if ((status === 'INSTALLED' || status === 'COMPLETED') && !next.scheduleOutcome) {
    let fromAc = ''
    if (typeof next.acDetails === 'string') {
      try {
        const parsed = JSON.parse(next.acDetails)
        const meta = (Array.isArray(parsed) ? parsed[0] : parsed) || {}
        fromAc = String(meta.scheduleOutcome || '').trim()
      } catch { /* ignore */ }
    }
    next.scheduleOutcome = fromAc || 'DONE_INSTALLED'
    if (status === 'INSTALLED' || (!fromAc && status === 'COMPLETED')) {
      next.status = 'INSTALLED'
    }
    if (typeof next.acDetails === 'string') {
      next.acDetails = mergeAcMeta(
        { acDetails: next.acDetails } as Ticket,
        { scheduleOutcome: next.scheduleOutcome, schedulePhase: '' },
      )
    }
  }
  // For non-completion statuses like RESCHED, ensure scheduleOutcome is cleared in acDetails
  if (status !== 'INSTALLED' && status !== 'COMPLETED' && status !== 'DONE_DISMANTLE' && status !== 'DONE_SYSTEM_REPROCESS' && !next.scheduleOutcome) {
    if (typeof next.acDetails === 'string') {
      next.acDetails = mergeAcMeta(
        { acDetails: next.acDetails } as Ticket,
        { scheduleOutcome: '', schedulePhase: '' },
      )
    }
  }
  return applyRelayScheduleSyncToPatch(next)
}

export function getScheduleRowColors(
  ticket: Ticket,
  ghostKind: 'completed' | 'resched' | 'cancelled' | null,
  isLight: boolean,
  idx: number,
  rowEven: string,
  rowOdd: string,
  isDuplicateName: boolean,
): { baseBg: string; hoverBg?: string; accent?: string } {
  const outcome = getScheduleOutcome(ticket)

  // Dark mode: use higher-alpha color washes (~0.22–0.28) so closed rows clearly stand out.
  // Colors are vivid enough to read as colored without blowing out text contrast.
  if (ghostKind === 'cancelled' || (ticket.status || '').toUpperCase() === 'CANCELLED') {
    return {
      baseBg: isLight ? '#fee2e2' : 'rgba(239,68,68,0.28)',
      hoverBg: isLight ? '#fca5a5' : 'rgba(239,68,68,0.38)',
      accent: '#EF4444',
    }
  }

  if (ghostKind === 'completed') {
    if (outcome === 'DONE_CLEANING') {
      return {
        baseBg: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.22)',
        hoverBg: isLight ? '#bae6fd' : 'rgba(14,165,233,0.34)',
        accent: '#0EA5E9',
      }
    }
    if (outcome === 'DONE_SURVEY') {
      return {
        baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.22)',
        hoverBg: isLight ? '#fde68a' : 'rgba(251,191,36,0.34)',
        accent: '#fbbf24',
      }
    }
    if (outcome === 'DONE_CHECKUP') {
      return {
        baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.22)',
        hoverBg: isLight ? '#fde68a' : 'rgba(251,191,36,0.34)',
        accent: '#fbbf24',
      }
    }
    if (outcome === 'DONE_BACKJOB') {
      return {
        baseBg: isLight ? '#dbeafe' : 'rgba(59,130,246,0.22)',
        hoverBg: isLight ? '#bfdbfe' : 'rgba(59,130,246,0.34)',
        accent: '#3B82F6',
      }
    }
    if (outcome === 'DONE_SYSTEM_REPROCESS') {
      return {
        baseBg: isLight ? '#e0e7ff' : 'rgba(99,102,241,0.22)',
        hoverBg: isLight ? '#c7d2fe' : 'rgba(99,102,241,0.34)',
        accent: '#6366F1',
      }
    }
    if (outcome === 'DONE_DISMANTLE') {
      return {
        baseBg: isLight ? '#ffe4e6' : 'rgba(244,63,94,0.22)',
        hoverBg: isLight ? '#fecdd3' : 'rgba(244,63,94,0.34)',
        accent: '#F43F5E',
      }
    }
    if (outcome === 'DONE_QUOTATION' || outcome === 'DONE_SERVICE') {
      return {
        baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.28)',
        hoverBg: isLight ? '#86efac' : 'rgba(22,163,74,0.38)',
        accent: '#16A34A',
      }
    }
    return {
      baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.28)',
      hoverBg: isLight ? '#86efac' : 'rgba(22,163,74,0.38)',
      accent: '#16A34A',
    }
  }

  if (ghostKind === 'resched') {
    return {
      baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.28)',
      hoverBg: isLight ? '#fde68a' : 'rgba(251,191,36,0.38)',
      accent: '#fbbf24',
    }
  }

  if (outcome === 'DONE_INSTALLED') {
    return {
      baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.28)',
      hoverBg: isLight ? '#86efac' : 'rgba(22,163,74,0.38)',
      accent: '#16A34A',
    }
  }

  if (outcome === 'DONE_SURVEY') {
    return {
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.28)',
      hoverBg: isLight ? '#fde68a' : 'rgba(251,191,36,0.38)',
      accent: '#fbbf24',
    }
  }

  if (outcome === 'DONE_CLEANING') {
    return {
      baseBg: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.28)',
      hoverBg: isLight ? '#bae6fd' : 'rgba(14,165,233,0.38)',
      accent: '#0EA5E9',
    }
  }

  if (outcome === 'DONE_CHECKUP') {
    return {
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.28)',
      hoverBg: isLight ? '#fde68a' : 'rgba(251,191,36,0.38)',
      accent: '#fbbf24',
    }
  }

  if (outcome === 'DONE_BACKJOB') {
    return {
      baseBg: isLight ? '#fef9c3' : 'rgba(59,130,246,0.28)',
      hoverBg: isLight ? '#fef08a' : 'rgba(59,130,246,0.38)',
      accent: '#f59e0b',
    }
  }

  if (outcome === 'DONE_SYSTEM_REPROCESS') {
    return {
      baseBg: isLight ? '#eef2ff' : 'rgba(99,102,241,0.28)',
      hoverBg: isLight ? '#c7d2fe' : 'rgba(99,102,241,0.38)',
      accent: '#6366F1',
    }
  }

  if (outcome === 'DONE_DISMANTLE') {
    return {
      baseBg: isLight ? '#fff1f2' : 'rgba(244,63,94,0.28)',
      hoverBg: isLight ? '#fecdd3' : 'rgba(244,63,94,0.38)',
      accent: '#F43F5E',
    }
  }

  if (outcome === 'DONE_QUOTATION' || outcome === 'DONE_SERVICE') {
    return {
      baseBg: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.28)',
      hoverBg: isLight ? '#a7f3d0' : 'rgba(16,185,129,0.38)',
      accent: '#10B981',
    }
  }

  const statusVal = getScheduleStatusValue(ticket)
  // getScheduleOutcome() above can return null (e.g. a ticket whose acDetails.scheduleOutcome
  // never got populated even though ticket.status is literally INSTALLED/COMPLETED) while
  // getScheduleStatusValue() still falls back to the raw status and resolves to DONE_INSTALLED —
  // which is exactly why the STATUS TEXT correctly reads "DONE INSTALL" while the row background
  // fell through to the plain zebra stripe instead of green. Match that same fallback here.
  if (statusVal === 'DONE_INSTALLED') {
    return {
      baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.28)',
      hoverBg: isLight ? '#86efac' : 'rgba(22,163,74,0.38)',
      accent: '#16A34A',
    }
  }
  if (statusVal === 'RESCHED') {
    return {
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.18)',
      hoverBg: isLight ? '#fef3c7' : 'rgba(251,191,36,0.28)',
      accent: '#fbbf24',
    }
  }
  // Pending schedule rows (SURVEY, INSTALL, CLEANING, CHECKUP, BACKJOB, etc.)
  // Turn red to highlight pending rows that haven't been updated yet
  // Overdue pending schedule rows (>24h past schedule date 3pm) highlight red
  if (isOverduePendingScheduleTicket(ticket, ghostKind)) {
    return {
      baseBg: isLight ? '#ef4444' : '#dc2626',
      hoverBg: isLight ? '#dc2626' : '#b91c1c',
      accent: '#ffffff',
    }
  }

  if (isDuplicateName) {
    return {
      baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.12)',
      hoverBg: isLight ? '#fef08a' : 'rgba(251,191,36,0.22)',
    }
  }

  return { baseBg: idx % 2 === 0 ? rowEven : rowOdd }
}

export function isOverduePendingScheduleTicket(
  ticket: Ticket,
  ghostKind?: string | null,
  activeDateKey?: string,
): boolean {
  if (ghostKind) return false

  const outcome = getScheduleOutcome(ticket)
  if (outcome) return false

  const resolvedStatus = getScheduleStatusValue(ticket)
  if (CLOSING_SCHEDULE_STATUSES.has(resolvedStatus)) return false

  const rawStat = String(ticket.status || '').toUpperCase().replace(/\s+/g, '_')
  if (isInstalledRemarks(ticket.remarksUpdate) || isInstalledWorkflowStatus(ticket.status)) return false
  if (rawStat.startsWith('DONE_') || rawStat.startsWith('INSTALLED') || rawStat.startsWith('COMPLETED')) return false

  // EXCEPTIONS: pending continuation, pending resched, for quotation/approval, pending approval, cancelled, done
  const EXEMPT_STATUSES = new Set([
    'CANCELLED',
    'RESCHED',
    'CONTINUATION',
    'FOR_APPROVAL',
    'FOR_QUOTATION',
    'PENDING_APPROVAL',
    'DONE_INSTALLED',
    'DONE_CLEANING',
    'DONE_SURVEY',
    'DONE_CHECKUP',
    'DONE_BACKJOB',
    'DONE_SERVICE',
    'DONE_SYSTEM_REPROCESS',
    'DONE_DISMANTLE',
    'DONE_QUOTATION',
  ])
  if (EXEMPT_STATUSES.has(rawStat) || EXEMPT_STATUSES.has(resolvedStatus)) return false

  const schedDateStr = activeDateKey
    || getFinalDateKey(ticket)
    || getPreferredDateKey(ticket)
    || String(parseAcMeta(ticket).scheduledDate || '').split('T')[0].split(' ')[0].trim()

  if (!schedDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(schedDateStr)) return false

  const parts = schedDateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return false

  // Cutoff threshold: 24h past schedule date at 3:00 PM (e.g. Aug 7 schedule -> Aug 8 at 3:00 PM)
  const cutoffDate = new Date(parts[0], parts[1] - 1, parts[2] + 1, 15, 0, 0, 0)
  return Date.now() >= cutoffDate.getTime()
}

export function shouldArchiveCompletedSchedule(ticket: Ticket, body: Record<string, unknown>): boolean {
  const outcome = getScheduleOutcome({
    ...ticket,
    ...body,
    acDetails: typeof body.acDetails === 'string' ? body.acDetails : ticket.acDetails,
  } as Ticket)
  if (
    outcome === 'DONE_CLEANING'
    || outcome === 'DONE_SURVEY'
    || outcome === 'DONE_CHECKUP'
    || outcome === 'DONE_BACKJOB'
    || outcome === 'DONE_SYSTEM_REPROCESS'
    || outcome === 'DONE_DISMANTLE'
  ) return false
  if (outcome === 'DONE_INSTALLED') return true
  return qualifiesForInstallComplete(ticket, body as Partial<Ticket>)
}

// ─────────────────────────────────────────────────────────────
export function formatAddress(loc: any): string {
  if (!loc) return ''
  if (typeof loc === 'string') {
    const s = loc.trim()
    if (!s) return ''
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const p: any = JSON.parse(s)
        const addr = (p?.address ?? '').trim()
        const region = (p?.region ?? '').trim()
        return addr && region && !addr.toLowerCase().includes(region.toLowerCase())
          ? `${addr}, ${region}` : addr || region || s
      } catch { /* fall through */ }
    }
    return s
  }
  const addr = (loc.address ?? '').trim()
  const region = (loc.region ?? '').trim()
  return addr && region && !addr.toLowerCase().includes(region.toLowerCase())
    ? `${addr}, ${region}` : addr || region || ''
}

export function parseDistrict(loc: any, explicit?: string): string {
  if (explicit) return explicit
  if (!loc) return ''
  if (typeof loc === 'string') {
    try { const p: any = JSON.parse(loc); return p?.district || p?.city || '' } catch { return '' }
  }
  return (loc?.district || loc?.city || '').trim()
}

export function isGenericUnitTypeLabel(value?: string | null): boolean {
  const normalized = (value || '').trim().toLowerCase()
  return !normalized
    || normalized === 'split ac'
    || normalized === 'split'
    || normalized === 'ac'
    || normalized === 'window ac'
    || normalized === 'window'
}

/** Brand / HP for schedules Ã¢â‚¬â€ prefer acDetails brand+capacity over generic unitType like "Split AC". */
export function parseBrand(ticket: Ticket): string {
  const fromAc = parseBrandFromAcDetails(ticket.acDetails || ticket.ac_details)
  if (fromAc) return fromAc

  const meta = parseAcMeta(ticket)
  const joined = formatBrandCapacityLabel(
    typeof meta.brand === 'string' ? meta.brand : '',
    typeof meta.capacity === 'string' ? meta.capacity : '',
  )
  if (joined && !isGenericUnitTypeLabel(joined)) return joined

  const unit = (ticket.unitType || ticket.unit_type || '').trim()
  if (unit && !isGenericUnitTypeLabel(unit)) return unit
  return joined || unit || ''
}

export function parseAcMeta(ticket: Ticket): Record<string, unknown> {
  const raw = ticket.acDetails || ticket.ac_details
  if (!raw || typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const first = parsed.find(item => item && typeof item === 'object' && !Array.isArray(item))
      return (first && typeof first === 'object') ? first as Record<string, unknown> : {}
    }
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function mergeAcMeta(ticket: Ticket, updates: Record<string, any>) {
  const parsed = parseAcMeta(ticket)
  if (Array.isArray(parsed)) {
    const next = parsed.length ? [...parsed] : [{}]
    next[0] = { ...(next[0] || {}), ...updates }
    return JSON.stringify(next)
  }
  return JSON.stringify({ ...(parsed || {}), ...updates })
}

export function getPreferredDateKey(ticket: Ticket): string {
  const dateStr = ticket.preferredDate || ticket.preferred_date || ''
  if (!dateStr) return ''
  return dateStr.split('T')[0].split(' ')[0].trim()
}

export function getEffectiveScheduleDateKey(ticket: Ticket): string {
  return getFinalDateKey(ticket) || getPreferredDateKey(ticket)
}

/** Schedule date to anchor completion ghost rows and archive sync (active tab date wins when it matches). */
export function resolveScheduleCompletionDateKey(ticket: Ticket, activeDateKey?: string): string {
  const active = (activeDateKey || '').split('T')[0].split(' ')[0].trim()
  if (active && (ticketMatchesDateKey(ticket, active) || getPreviousScheduleDates(ticket).includes(active))) {
    return active
  }
  return getEffectiveScheduleDateKey(ticket) || todayDateKey()
}

export function stripArchivedRemarkSuffix(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  return trimmed.replace(/\s*Ã‚Â·\s*Archived(?:\s*Ã‚Â·\s*.+)?$/i, '').trim()
}

export function getFinalDateKey(ticket: Ticket): string {
  const top = String(
    (ticket as Ticket & { finalDate?: string; final_date?: string }).finalDate
    || (ticket as Ticket & { final_date?: string }).final_date
    || '',
  ).trim()
  if (top) return top.split('T')[0].split(' ')[0].trim()
  const raw = parseAcMeta(ticket).finalDate || (parseAcMeta(ticket) as { final_date?: string }).final_date
  if (!raw) return ''
  return String(raw).split('T')[0].split(' ')[0].trim()
}

export function hasFinalScheduleDate(ticket: Ticket): boolean {
  return Boolean(getFinalDateKey(ticket))
}

export function shouldShowOnMyTickets(ticket: Ticket): boolean {
  const stat = (ticket.status || '').toUpperCase()
  if (isInstalledWorkflowStatus(stat) || stat === 'CANCELLED') return false
  // IN_PROGRESS/ON_THE_WAY are active field-crew statuses; CONTINUATION tracks its own
  // continuationDates array instead of finalDate — none of these belong in the negotiator's queue.
  if (['IN_PROGRESS', 'ON_THE_WAY', 'CONTINUATION'].includes(stat)) return false
  // A finalDate no longer means "done with the negotiator" — RESCHED/QUOTATION/SURVEY/CHECKUP/
  // BACKJOB etc. can already carry a scheduled date and still need monitoring until they reach a
  // closing (DONE_*) outcome, instead of dropping off this queue the moment they get a date —
  // that was hiding tickets Schedules' "All Pending" still counts as pending. Deny-list on
  // CLOSING_SCHEDULE_STATUSES rather than allow-list on SCHEDULE_PENDING_STATUS_VALUES: the
  // pending set only covers named sub-statuses, not fallback values like plain 'INSTALLATION'/
  // 'SERVICES' that getScheduleStatusValue returns for tickets with no sub-status picked yet.
  return !CLOSING_SCHEDULE_STATUSES.has(getScheduleStatusValue(ticket))
}

export function ticketMatchesNegotiatorFilter(
  ticket: Ticket,
  negotiatorId?: string | null,
): boolean {
  const wanted = (negotiatorId || '').trim()
  if (!wanted) return true
  const ids = [
    ticket.negotiatorId,
    ticket.negotiator_id,
    ticket.assignedTo,
  ].map(v => String(v || '').trim()).filter(Boolean)
  return ids.includes(wanted)
}

export function resolveTicketDistrict(ticket: Ticket): string {
  const explicit = (ticket.district || '').trim()
  if (explicit) return explicit
  const parsed = parseDistrict(ticket.location, ticket.district)
  if (parsed) return parsed
  const addr = formatAddress(ticket.location)
  const paren = addr.match(/\(([^)]+)\)\s*$/)
  if (paren?.[1]?.trim()) return paren[1].trim()
  return ''
}

export function getPreviousScheduleDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.previousScheduleDates
  if (!Array.isArray(raw)) return []
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
}

/** Target day after reschedule (preferred / rescheduledTo). */
export function getRescheduleTargetDateKey(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const to = String(meta.rescheduledTo || '').split('T')[0].split(' ')[0].trim()
  if (to) return to
  return getPreferredDateKey(ticket) || getEffectiveScheduleDateKey(ticket)
}

/** Every old date this ticket was rescheduled away from (dedicated key — see isRescheduledGhostOnDate). */
export function getRescheduleHistoryDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.rescheduleHistoryDates
  if (!Array.isArray(raw)) return []
  return raw
    .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    .map(d => d.split('T')[0].split(' ')[0].trim())
}

export function shouldBlankReschedGhostPayment(
  dateKey?: string,
  ghostKind?: 'completed' | 'resched' | 'cancelled' | null,
): boolean {
  if (!dateKey) return false
  return ghostKind === 'resched'
}

export function getContinuationDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.continuationDates
  if (!Array.isArray(raw)) return []
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
}

export function formatSimpleDateShort(dateStr: string): string {
  const dateParts = dateStr.split('-')
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return dateParts.length === 3
    ? `${monthNames[parseInt(dateParts[1], 10) - 1] || ''} ${parseInt(dateParts[2], 10)}`
    : dateStr
}

export function getNextContinuationDate(ticket: Ticket, currentDateKey: string): string | null {
  const dates = getContinuationDates(ticket)
  if (dates.length === 0) return null
  const sorted = [...dates].sort()
  const next = sorted.find(d => d > currentDateKey)
  if (next) return next
  return sorted[sorted.length - 1]
}

export function isReschedulePending(ticket: Ticket): boolean {
  const meta = parseAcMeta(ticket)
  return meta.reschedulePending === true || String(meta.reschedulePending).toLowerCase() === 'true'
}

export function getScheduleStatusDisplay(ticket: Ticket): string {
  const val = getScheduleStatusValue(ticket)
  if (val === 'RESCHED') {
    return 'RESCHED'
  }
  return getScheduleStatusLabel(val)
}

export function getScheduleUpdateDisplay(ticket: Ticket): string {
  const base = sanitizeDisplayText(stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim()))
  if (getScheduleStatusValue(ticket) === 'RESCHED' && isReschedulePending(ticket)) {
    return base || 'PENDING'
  }
  const deduped = dedupeMovedToRemark(base)
  // If the remark is "Moved to [date]" but the ticket is already on that date, suppress it.
  if (isMovedToRescheduleRemark(deduped)) {
    const finalDateKey = getFinalDateKey(ticket)
    if (finalDateKey) {
      const formattedFinalDate = formatDateKeyLabel(finalDateKey)
      // Extract the date portion from "Moved to [DATE]"
      const movedToDate = deduped.replace(/^Moved to\s+/i, '').trim()
      if (formattedFinalDate && movedToDate.toLowerCase() === formattedFinalDate.toLowerCase()) {
        return ''
      }
    }
  }
  return deduped
}

/** Collapse "Moved to X · Moved to X" from legacy ghost-row display or double saves. */
export function dedupeMovedToRemark(text: string): string {
  const trimmed = sanitizeDisplayText(text).trim()
  if (!trimmed) return trimmed
  const dup = trimmed.match(/^(Moved to .+?)\s*[·Ã‚Â·]\s*\1$/i)
  if (dup) return dup[1].trim()
  return trimmed
}

export function isMovedToRescheduleRemark(text: string): boolean {
  return /^Moved to /i.test(text.trim())
}

/**
 * Builds the patch for the inline "Reschedule appointment" dialog. Moves the ticket's Final Date
 * in place — no ghost/duplicate row is left on the old date (previousScheduleDates/rescheduledTo
 * are no longer written here; see isRescheduledGhostOnDate). "Pending" leaves the date untouched
 * and just flags the ticket as awaiting a new slot.
 */
export function buildReschedulePatchBody(
  ticket: Ticket,
  options: { newDateKey?: string | null; pending: boolean; remarks?: string },
): Record<string, unknown> {
  const oldDateKey = getEffectiveScheduleDateKey(ticket) || getPreferredDateKey(ticket)
  const body: Record<string, unknown> = { status: 'RESCHED' }
  const acUpdates: Record<string, unknown> = { scheduleOutcome: '' }
  // Strip any pre-existing "RESCHED PENDING:" prefix before re-adding it below — guards against
  // the prefix nesting/doubling if this ever runs twice for the same remark (retry, merged patch).
  const userRemarks = (options.remarks || '').trim().replace(/^RESCHED PENDING:\s*/i, '')

  if (options.pending) {
    acUpdates.reschedulePending = true
    const formattedRemarks = userRemarks
      ? `RESCHED PENDING: ${userRemarks}`
      : 'PENDING'
    body.remarks = formattedRemarks
    body.remarksUpdate = formattedRemarks
    acUpdates.remarksUpdate = formattedRemarks
    acUpdates.update = formattedRemarks
  } else {
    const newDateKey = (options.newDateKey || '').split('T')[0].trim()
    if (!newDateKey) return {}
    acUpdates.reschedulePending = false
    acUpdates.finalDate = newDateKey
    acUpdates.scheduledDate = newDateKey
    body.preferredDate = newDateKey
    body.finalDate = newDateKey
    // The ticket moves to its new date as a normal pending row, so status resolves to SCHEDULED
    // (not RESCHED) — the new date must NOT show a RESCHED badge. Because this sends SCHEDULED
    // straight to the backend, the backend can't infer "this was a reschedule" from status alone,
    // so this dialog (the one path with unambiguous reschedule intent + both dates in hand) is the
    // authoritative place to record the ghost. See isRescheduledGhostOnDate for the read side.
    body.status = 'SCHEDULED'
    if (oldDateKey && oldDateKey !== newDateKey) {
      // Append the old date to the dedicated ghost-history array (dedupe, keep full history for
      // repeat reschedules). Dedicated key — never previousScheduleDates, which completed/cancelled
      // ghosts also read; sharing it is what made rows ambiguously belong to two ghost kinds and
      // vanish/duplicate in the original incident. This is a bounded, single-date append driven by
      // an explicit user action, not the unbounded client-side bookkeeping that caused that bug.
      const priorHistory = getRescheduleHistoryDates(ticket)
      acUpdates.rescheduleHistoryDates = priorHistory.includes(oldDateKey)
        ? priorHistory
        : [...priorHistory, oldDateKey]
      // Cosmetic — drives the ghost row's "Moved to <date>" label; never used for date-matching.
      acUpdates.rescheduledTo = newDateKey
    }
    const formattedNewDate = formatDateKeyLabel(newDateKey)
    const formattedRemarks = userRemarks
      ? `Moved to ${formattedNewDate} - ${userRemarks}`
      : `Moved to ${formattedNewDate}`
    body.remarks = formattedRemarks
    body.remarksUpdate = formattedRemarks
    acUpdates.remarksUpdate = formattedRemarks
    acUpdates.update = formattedRemarks
  }

  body.acDetails = mergeAcMeta(ticket, acUpdates)
  return body
}

/** True when the ticket currently has a schedule date (final or preferred). */
export function ticketHadScheduleDate(ticket: Ticket): boolean {
  return Boolean(
    getFinalDateKey(ticket)
    || getPreferredDateKey(ticket)
    || String(parseAcMeta(ticket).scheduledDate || '').trim(),
  )
}

/** Drop schedule dates and move ticket back to negotiator My Tickets (ASSIGNED, no date). */
export function applyReturnToNegotiatorMyTicketsPatch(
  ticket: Ticket,
  body: Record<string, unknown>,
  acUpdates: Record<string, unknown>,
): void {
  body.status = 'ASSIGNED'
  body.preferredDate = ''
  body.preferred_date = ''   // snake_case alias
  body.finalDate = ''         // explicitly clear the DB column so row disappears from schedule
  body.scheduleOutcome = ''

  acUpdates.finalDate = ''
  acUpdates.scheduledDate = ''
  acUpdates.scheduleIntake = false
  acUpdates.rescheduledTo = ''
  acUpdates.reschedulePending = false
  acUpdates.previousScheduleDates = []
  acUpdates.scheduleOutcome = ''

  const phase = getScheduleStatusValue(ticket)
  if (['SURVEY', 'CLEANING', 'SERVICES', 'INSTALLATION'].includes(phase)) {
    acUpdates.schedulePhase = phase
  }

  const negoId = ticket.negotiatorId || ticket.negotiator_id || ticket.assignedTo
  if (negoId) body.assignedTo = negoId

  const remarks = String(ticket.remarksUpdate || ticket.remarks || '').trim()
  if (isMovedToRescheduleRemark(remarks) || /^PENDING$/i.test(remarks)) {
    body.remarks = ''
    body.remarksUpdate = ''
    acUpdates.update = ''
    acUpdates.remarksUpdate = ''
  }
}

export function ticketMatchesDateKey(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return true
  const isResched = (ticket.status || '').toUpperCase() === 'RESCHED'
  const meta = parseAcMeta(ticket)
  const scheduledDate = String(meta.scheduledDate || '').split('T')[0].split(' ')[0].trim()
  const archived = String(meta.archivedScheduleDate || '').split('T')[0].split(' ')[0].trim()
  const installed = String(meta.installedDate || '').split('T')[0].split(' ')[0].trim()
  const cancelledScheduleDate = String(meta.cancelledScheduleDate || '').split('T')[0].split(' ')[0].trim()
  const finalDate = !isResched ? getFinalDateKey(ticket) : ''
  // rescheduledTo is legacy-only and no longer written by any reschedule flow — matching on it
  // made a ticket stick forever to whatever old date a stale value happened to carry (the exact
  // "grayed-out, uneditable row still on the old date" bug after a plain finalDate move).
  const dateCandidates = [finalDate, scheduledDate, archived, installed, cancelledScheduleDate].filter(Boolean)

  for (const candidate of dateCandidates) {
    if (candidate === dateKey) return true
  }
  return false
}

export function isCompletedGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  if (!isInstalledWorkflowStatus(ticket.status)) return false

  // The ticket's own current/real date is never a ghost — only duplicate rows left
  // behind on OLD dates are. Otherwise every completed ticket becomes permanently
  // read-only (no remarks edits) even on the date it actually belongs on.
  const currentKey = getEffectiveScheduleDateKey(ticket) || getInstalledDateKey(ticket) || getArchivedScheduleDate(ticket)
  if (currentKey && currentKey === dateKey) return false

  const sched = getArchivedScheduleDate(ticket)
  if (sched === dateKey) return true
  if (getPreviousScheduleDates(ticket).includes(dateKey)) return true
  if (getInstalledDateKey(ticket) === dateKey) return true
  return false
}

// Resched ghost rows: the old duplicate-row mechanism (driven by rescheduledTo/
// previousScheduleDates, shared with other ghost kinds) was the root cause of schedule dates
// losing rows — any staleness in that shared bookkeeping made rows vanish or duplicate across
// dates. This version fixes the root cause instead of just disabling the feature:
//   - rescheduleHistoryDates is a DEDICATED key, never read/written by the completed or
//     cancelled ghost paths, so a date can never ambiguously mean two different ghost kinds.
//   - It's only ever written by the backend (TicketService, single choke point for every save
//     path — inline cell, modal, mobile) at the exact moment a ticket leaves RESCHED for a new
//     date, using the pre-mutation DB values for that request. No client ever assembles or
//     merges this array, so there's no client-side staleness/race to reintroduce.
//   - Legacy tickets with old rescheduledTo/previousScheduleDates values never carry
//     rescheduleHistoryDates, so they render exactly as before (no stale ghosts resurrected).
export function isRescheduledGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  // The ticket's own current/live date is never a ghost — same guard as completed-ghost,
  // otherwise the ticket's real post-reschedule row would render permanently read-only.
  const currentKey = getEffectiveScheduleDateKey(ticket)
  if (currentKey && currentKey === dateKey) return false
  return getRescheduleHistoryDates(ticket).includes(dateKey)
}

export function isCancelledTicket(ticket: Partial<Ticket> | null | undefined): boolean {
  return (ticket?.status || '').toUpperCase() === 'CANCELLED'
}

/** Cancelled rows stay on Schedules as a red ghost for their date — never hide them. */
export function isCancelledScheduleGhost(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey || !isCancelledTicket(ticket)) return false
  if (ticketMatchesDateKey(ticket, dateKey)) return true
  if (getEffectiveScheduleDateKey(ticket) === dateKey) return true
  if (getPreviousScheduleDates(ticket).includes(dateKey)) return true
  const cancelledScheduleDate = String(parseAcMeta(ticket).cancelledScheduleDate || '')
    .split('T')[0].split(' ')[0].trim()
  return cancelledScheduleDate === dateKey
}

export function getScheduleGhostKind(ticket: Ticket, dateKey: string): 'completed' | 'resched' | 'cancelled' | null {
  if (!dateKey) return null
  if (isCompletedGhostOnDate(ticket, dateKey)) return 'completed'
  // Cancelled tickets keep their one schedule-date row (no duplicate-date bookkeeping like
  // completed/resched ghosts) — just render read-only + muted so staff can still see the
  // cancellation instead of the ticket silently vanishing off Schedules.
  if (isCancelledScheduleGhost(ticket, dateKey)) return 'cancelled'
  if (isRescheduledGhostOnDate(ticket, dateKey)) return 'resched'
  return null
}

export function ticketBelongsOnScheduleDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return true
  // A row is on this day if ANY of its schedule dates match: finalDate, scheduledDate,
  // preferredDate, archived/installed. The server date query (ac_details LIKE) can return
  // rows where the day only lives in one of these, so mirror that here — never require finalDate only.
  if (ticketMatchesDateKey(ticket, dateKey)) return true
  if (getEffectiveScheduleDateKey(ticket) === dateKey) return true
  if (isCancelledScheduleGhost(ticket, dateKey)) return true
  if (isScheduleGhostOnDate(ticket, dateKey)) return true
  if ((ticket.status || '').toUpperCase() === 'CONTINUATION' && getContinuationDates(ticket).includes(dateKey)) {
    return true
  }
  return false
}

export function ticketBelongsOnScheduleBranch(
  ticket: Ticket,
  effectiveBranch: string | null | undefined,
  email?: string | null,
  jobTitle?: string | null,
  lineupIndex?: InstallerBranchIndexEntry[],
  driverOnlyNames: string[] = [],
): boolean {
  if (!effectiveBranch || effectiveBranch === 'ALL_BRANCHES') return true
  const wanted = resolveScopedBranchId(effectiveBranch)
  // Prefer lineup-resolved branch (same as My Tickets / Archives) so cancelled rows that
  // still retain their schedule date cannot leak onto another Active Branch view.
  const meta = parseAcMeta(ticket)
  const stored = resolveScopedBranchId(
    resolveTicketScheduleBranchId(ticket, lineupIndex, driverOnlyNames)
    || ticket.branchId
    || ticket.branch_id
    // Legacy cancels used to null branchId on the server — recover from acDetails when present.
    || (typeof meta.cancelledBranchId === 'string' ? meta.cancelledBranchId : '')
    || (typeof meta.branchId === 'string' ? meta.branchId : ''),
  )
  // Missing branch on a specific-branch Schedules view → exclude. (Previously returned true
  // to "trust the server", which let cancelled/date-retained rows with empty branchId, and
  // local merge re-adds, appear under every Active Branch.)
  // Schedules UI filters use isCancelledScheduleGhost separately so red ghosts still show.
  if (!stored) return false
  if (wanted && stored === wanted) return true
  if (branchScopesMatch(stored, effectiveBranch, email)) return true
  if (branchScopesMatch(stored, wanted, email)) return true
  if (isTaguigBranchRef(effectiveBranch) && isTaguigBranchRef(stored)) {
    const wantServices = isTaguigServicesScope(effectiveBranch, email, jobTitle)
      || (wanted ? isTaguigServicesScope(wanted, email, jobTitle) : false)
    return wantServices
      ? stored === 'BR-TAGUIG-SERVICES'
      : stored !== 'BR-TAGUIG-SERVICES'
  }
  return false
}

export function isInstalledRemarks(_text?: string | null): boolean {
  return false
}

export function ticketRemarksText(ticket: Partial<Ticket>, fields?: Partial<Ticket>): string {
  return [
    fields?.remarksUpdate,
    fields?.remarks,
    ticket.remarksUpdate,
    ticket.remarks,
    fields?.note,
    ticket.note,
  ].filter(Boolean).join(' ')
}


export function qualifiesForInstallComplete(ticket: Partial<Ticket>, fields?: Partial<Ticket>): boolean {
  const remarks = ticketRemarksText(ticket, fields)
  const status = String(fields?.status ?? ticket.status ?? '').toUpperCase()
  const installed = isInstalledRemarks(remarks) || isInstalledWorkflowStatus(status)
  return installed
}

export function getArchivedScheduleDate(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  if (typeof meta.archivedScheduleDate === 'string' && meta.archivedScheduleDate.trim()) {
    return meta.archivedScheduleDate.split('T')[0].split(' ')[0].trim()
  }
  const prev = getPreviousScheduleDates(ticket)
  if (prev.length) return prev[prev.length - 1]
  return getPreferredDateKey(ticket)
}

export function getInstalledDateKey(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  if (typeof meta.installedDate === 'string' && meta.installedDate.trim()) {
    return meta.installedDate.split('T')[0].split(' ')[0].trim()
  }
  const raw = ticket.actualCompletion || (ticket as any).actual_completion || ticket.updatedAt || ticket.updated_at
  if (!raw) return ''
  return String(raw).split('T')[0].split(' ')[0].trim()
}

/** Whole months elapsed between a YYYY-MM-DD date key and today. Returns 0 for invalid/empty input. */
export function monthsSince(dateKey: string): number {
  if (!dateKey) return 0
  const then = new Date(dateKey)
  if (Number.isNaN(then.getTime())) return 0
  const now = new Date()
  let months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
  if (now.getDate() < then.getDate()) months -= 1
  return Math.max(0, months)
}

export function isScheduleGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  return isRescheduledGhostOnDate(ticket, dateKey)
    || isCompletedGhostOnDate(ticket, dateKey)
    || getScheduleGhostKind(ticket, dateKey) === 'cancelled'
}

export function formatGhostRemarks(
  ticket: Ticket,
  ghostKind: 'completed' | 'resched' | 'cancelled' | null,
  dateKey?: string,
): string {
  const base = sanitizeDisplayText(stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim()))
  if (ghostKind === 'completed' || (dateKey && isCompletedGhostOnDate(ticket, dateKey))) {
    return base
  }
  if (ghostKind === 'resched') {
    const movedTo = formatDateKeyLabel(getRescheduleTargetDateKey(ticket))
    const suffix = movedTo ? `Moved to ${movedTo}` : 'Rescheduled'
    if (!base) return suffix
    const normalizedBase = dedupeMovedToRemark(base)
    if (normalizedBase === suffix || isMovedToRescheduleRemark(normalizedBase)) return normalizedBase
    return `${normalizedBase} \u00B7 ${suffix}`
  }
  return base
}

export function buildArchiveAcMeta(ticket: Ticket, scheduleDateKey: string, outcome: ScheduleOutcome | null = 'DONE_INSTALLED') {
  const existing = parseAcMeta(ticket)
  const prevDates: string[] = Array.isArray(existing.previousScheduleDates) ? [...existing.previousScheduleDates] : []
  const sched = (scheduleDateKey || getPreferredDateKey(ticket)).split('T')[0].split(' ')[0].trim()
  if (sched && !prevDates.includes(sched)) prevDates.push(sched)
  return {
    previousScheduleDates: prevDates,
    archivedScheduleDate: sched,
    installedDate: sched,
    scheduleOutcome: outcome || 'DONE_INSTALLED',
  }
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
  ghostKind?: 'completed' | 'resched' | 'cancelled' | null,
): string {
  if (shouldBlankReschedGhostPayment(dateKey, ghostKind)) return ''
  const resolved = resolveTicketPayment(ticket)
  if (resolved.mode === 'FREE' || resolved.mode === 'FREE INSTALL') return 'FREE ₱0'

  const amount = resolved.amount
  const mode = resolved.mode

  // No payment set — leave blank instead of showing ₱0
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

export type PaymentBreakdownEntry = { mode: string; amount: number }

/** Split payment lines (e.g. CASH 1,000 + GCASH 9,000) stashed in acDetails when mode is HYBRID. */
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

export function isNoPaymentMode(mode?: string | null): boolean {
  const v = String(mode || '').trim().toUpperCase().replace(/\s+/g, '_')
  return v === 'NO_PAYMENT' || v === 'NONE' || v === 'NO'
}

export function ticketHasPaymentInfo(ticket: Partial<Ticket>): boolean {
  const mode = (ticket.modeOfPayment ?? ticket.mode_of_payment ?? '').trim()
  if (isNoPaymentMode(mode)) return false
  const charges = ticket.installationCharges ?? ticket.installation_charges
  return Boolean(mode || (charges != null && !Number.isNaN(Number(charges)) && Number(charges) > 0))
}

export function getEmptyRequiredColumnsForClose(
  ticketOrForm: Partial<Ticket> & { serviceDriver?: string; ticketCategory?: any },
): string[] {
  const missing: string[] = []

  // 1. Ticket No
  const ticketNo = (ticketOrForm.ticketNumber || (ticketOrForm as any).ticket_number || '').trim()
  if (!ticketNo) missing.push('Ticket No')

  // 2. Customer
  const customer = (ticketOrForm.customerName || (ticketOrForm as any).customer_name || ticketOrForm.title || '').trim()
  if (!customer) missing.push('Customer')

  // 3. District
  const district = (ticketOrForm.district || ticketOrForm.location || '').trim()
  if (!district) missing.push('District')

  // 4. Brand
  const brand = (
    ticketOrForm.id
      ? parseBrand(ticketOrForm as Ticket)
      : (ticketOrForm.unitType || (ticketOrForm as any).unit_type || '')
  ).trim()
  if (!brand) missing.push('Brand')

  // 5. Dealer
  const dealer = ((ticketOrForm as any).dealer || ticketOrForm.sourceVendor || (ticketOrForm as any).source_vendor || (ticketOrForm as any).dealerName || (ticketOrForm as any).dealer_name || '').trim()
  if (!dealer) missing.push('Dealer')

  // 6. Commit
  const commit = (
    ticketOrForm.id
      ? getF(ticketOrForm as Ticket, 'commitType', 'commitTerms', 'description')
      : (ticketOrForm.commitTerms || ticketOrForm.commitType || ticketOrForm.description || '')
  ).trim()
  if (!commit) missing.push('Commit')

  // 7. Negotiator
  const negotiator = (ticketOrForm.negotiatorId || (ticketOrForm as any).negotiator_id || (ticketOrForm as any).assignedTo || '').trim()
  if (!negotiator) missing.push('Negotiator')

  // 8. Installer — check the raw stored/typed value, not getInstallerDisplay(): that helper
  // also suppresses names that match the negotiator (a display de-dup for stale legacy data)
  // and would wrongly report "empty" for a real installer who is also this ticket's negotiator.
  const installer = (
    ticketOrForm.id
      ? resolveInstallerFieldRaw(ticketOrForm as Ticket)
      : (ticketOrForm.installerName || '')
  ).trim()
  if (!installer) missing.push('Installer')

  // 9. Driver
  const driver = (
    ticketOrForm.id
      ? formatServiceDriver(ticketOrForm as Ticket)
      : (ticketOrForm.serviceDriver || '')
  ).trim()
  if (!driver) missing.push('Driver')

  return missing
}

export function formatDateKeyLabel(key: string) {
  if (!key) return ''
  const datePart = key.split('T')[0].split(' ')[0].trim()
  if (!datePart) return ''
  const d = new Date(`${datePart}T00:00:00`)
  if (isNaN(d.getTime())) return key
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  return `${month} ${day} ${year}`
}

export function formatDisplayDate(key?: string | null, fallback = EMPTY_CELL): string {
  const normalized = (key || '').split('T')[0].split(' ')[0].trim()
  if (!normalized) return fallback
  const label = formatDateKeyLabel(normalized)
  return label || fallback
}

/** "2026-07" → "Jul 2026", for the Filters button's active-month label. */
export function formatMonthFilterLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const year = Number(y)
  const monthIdx = Number(m) - 1
  if (!year || monthIdx < 0 || monthIdx > 11) return monthKey
  return new Date(year, monthIdx, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

export function getCustomerDisplayName(ticket: Ticket): string {
  return (getF(ticket, 'customerName', 'customer_name') || ticket.title || '').trim()
}

export function normalizeCustomerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function importPhonesMatch(a: string, b: string): boolean {
  const da = (a || '').replace(/\D/g, '')
  const db = (b || '').replace(/\D/g, '')
  if (da.length < 10 || db.length < 10) return false
  const ta = da.length >= 10 ? da.slice(-10) : da
  const tb = db.length >= 10 ? db.slice(-10) : db
  return ta === tb
}

export function importNamesMatch(a: string, b: string): boolean {
  const na = (a || '').toLowerCase().trim()
  const nb = (b || '').toLowerCase().trim()
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

export function importBrandsMatch(rowBrand: string, ticket: Ticket): boolean {
  const rb = (rowBrand || '').trim().toLowerCase()
  const tb = parseBrand(ticket).trim().toLowerCase()
  if (!rb && !tb) return true
  if (!rb || !tb) return false
  return rb === tb || tb.includes(rb) || rb.includes(tb)
}

/** Match import row to ticket Ã¢â‚¬â€ same customer + phone may have multiple units (different brand). */
export function importRowMatchesTicket(row: ImportUnmatchedRow, ticket: Ticket): boolean {
  const status = (ticket.status || '').toUpperCase()
  if (
    status === 'COMPLETED'
    || status === 'CANCELLED'
    || status === 'INSTALLED'
    || status === 'DONE_SYSTEM_REPROCESS'
    || status === 'DONE_DISMANTLE'
  ) return false

  const rowCtrl = (row.controlNo || '').trim().toLowerCase()
  const tCtrl = (ticket.controlNumber || ticket.control_number || '').trim().toLowerCase()
  if (rowCtrl && tCtrl) return rowCtrl === tCtrl

  if (!importNamesMatch(row.name, getCustomerDisplayName(ticket))) return false
  const tPhone = getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
  if (!importPhonesMatch(row.phone, tPhone)) return false
  return importBrandsMatch(row.brand, ticket)
}

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

export function resolveNegotiatorDisplayName(
  ticket: Ticket,
  employees?: { id: string; name: string }[],
): string {
  const negId = (ticket.negotiatorId || ticket.negotiator_id || '').trim()
  if (negId && employees?.length) {
    const match = employees.find(e => e.id === negId)
    if (match?.name?.trim()) return match.name.trim()
  }
  const meta = parseAcMeta(ticket)
  const fromMeta = String(meta.negotiatorName || meta.negotiator || '').trim()
  if (fromMeta) return fromMeta

  const assignedTo = (ticket.assignedTo || '').trim()
  if (negId && assignedTo && negId === assignedTo) {
    const assignedName = (
      ticket.assignedEmployeeName
      || ticket.assigned_employee_name
      || (ticket as Ticket & { negotiatorName?: string }).negotiatorName
      || ''
    ).trim()
    if (assignedName) return assignedName
  }
  return ''
}

export function namesMatchLoosely(a: string, b: string): boolean {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const fa = na.split(/\s+/)[0]
  const fb = nb.split(/\s+/)[0]
  return fa.length >= 2 && fb.length >= 2 && fa === fb
}

/** Exact (whitespace/case-normalized) match only — deliberately not `namesMatchLoosely`'s
 * substring/first-name fuzz, which false-positives whenever an installer and negotiator
 * happen to share a first name or one name contains the other (e.g. small-branch staff who
 * both negotiate and install). Used where a false match would wrongly blank a real field. */
export function namesMatchExactly(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\s+/g, ' ')
  const nb = b.trim().toLowerCase().replace(/\s+/g, ' ')
  return !!na && na === nb
}

export function isTicketAssigneeNegotiator(
  ticket: Ticket,
  employees?: BranchStaffOption[],
): boolean {
  const negId = (ticket.negotiatorId || ticket.negotiator_id || '').trim()
  const assignedTo = (ticket.assignedTo || '').trim()
  if (negId && assignedTo && negId === assignedTo) return true
  if (assignedTo && employees?.length) {
    const emp = employees.find(e => e.id === assignedTo)
    if (emp && isNegotiatorCandidate(emp)) return true
  }
  return false
}

/** True when a name is an exact match for this ticket's own negotiator (stale-data guard only —
 * a real installer who happens to share a name with staff elsewhere must not be suppressed). */
export function isNegotiatorInstallerName(
  ticket: Ticket,
  installer: string,
  employees?: BranchStaffOption[],
  _branchId?: string | null,
): boolean {
  const val = installer.trim()
  if (!val) return false

  const meta = parseAcMeta(ticket)
  const ticketNegotiatorNames = [
    resolveNegotiatorDisplayName(ticket, employees),
    String(meta.negotiatorName || meta.negotiator || '').trim(),
  ].filter(Boolean)

  for (const candidate of ticketNegotiatorNames) {
    if (namesMatchExactly(val, candidate)) return true
  }

  const shortNeg = getTicketNegotiatorName(ticket, employees)
  if (shortNeg && namesMatchExactly(val, shortNeg)) return true

  // Branch-wide negotiator fallback intentionally omitted: `filterBranchNegotiators` falls
  // back to the whole company's staff list when no negotiator matches the branch, which
  // would make an exact-match check here fire on unrelated same-named staff elsewhere.
  // Matching this ticket's own negotiator (above) is enough to catch the stale-data case
  // this function exists for.

  return false
}

export function resolveInstallerFieldRaw(ticket: Ticket): string {
  const direct = sanitizeDisplayText(ticket.installerName || (ticket as any).installer_name || '')
  const meta = parseAcMeta(ticket)
  const fromMeta = sanitizeDisplayText(String(meta.installerName || meta.installer || meta.technicianName || ''))
  return direct || fromMeta
}

/** Explicit installer/technician field only Ã¢â‚¬â€ never negotiator or assigned sales staff. */
export function getInstallerDisplay(
  ticket: Ticket,
  _employees?: BranchStaffOption[],
  _branchId?: string | null,
): string {
  return resolveInstallerFieldRaw(ticket)
}

/** Sort key Ã¢â‚¬â€ may fall back to assigned field tech when installer column is empty. */
export function getInstallerSortKey(
  ticket: Ticket,
  employees?: BranchStaffOption[],
  branchId?: string | null,
): string {
  const fromField = getInstallerDisplay(ticket)
  if (fromField) return fromField
  if (isTicketAssigneeNegotiator(ticket, employees)) return ''
  const assigned = (ticket.assignedEmployeeName || ticket.assigned_employee_name || '').trim()
  if (assigned && !isNegotiatorInstallerName(ticket, assigned, employees, branchId)) return assigned
  return ''
}

export function formatRelayTicketTypeShort(ticket: Ticket): string {
  // schedulePhase is the authoritative signal for CHECKUP/BACKJOB — the generic serviceType/
  // title text (e.g. "Service service") that a saved schedule status leaves behind can't tell
  // CHECKUP/BACKJOB apart from plain SERVICE, and worse, a stale pre-patch title still
  // containing "Install" would wrongly win the regex checks below. Check it first.
  const phase = String(parseAcMeta(ticket).schedulePhase || '').toUpperCase().replace(/\s+/g, '_')
  if (phase === 'CHECKUP') return 'CHECKUP'
  if (phase === 'BACKJOB') return 'BACKJOB'

  const raw = `${ticket.serviceType || ticket.service_type || ''} ${ticket.title || ''}`.toLowerCase()
  if (/collect/.test(raw)) return 'COLLECTION'
  if (/install|s\/i|\bsi\b|survey\s*&\s*install/.test(raw)) return 'SURVEY & INSTALL'
  if (/survey/.test(raw)) return 'SURVEY'
  if (/service|clean/.test(raw)) return 'SERVICE'
  const st = String(ticket.serviceType || ticket.service_type || '').trim()
  if (st) return /install|s\/i/i.test(st) ? 'SURVEY & INSTALL' : st.toUpperCase()
  return 'SURVEY & INSTALL'
}

export function getTicketNumberDisplay(ticket: Ticket): string {
  return String(ticket.ticketNumber || ticket.ticket_number || '').trim()
}

/** Optimistic rows not yet persisted (manual add or Excel import). */
export function isTempTicketId(id: string | undefined | null): boolean {
  if (!id) return false
  return id.startsWith('temp-import-') || id.startsWith('temp-')
}

export type PendingTicketSave = {
  body: Record<string, unknown>
  rollback: Ticket
  afterSave?: () => Promise<void>
  lookupRetried?: boolean
}

/**
 * Move optimistic/pending state from a temp id to the real server ticket.
 * Pending cell edits are kept queued so they PATCH the real id, not temp-*.
 */
export function promoteTempTicketState(
  tempId: string,
  realTicket: Ticket,
  pendingSaves: Map<string, PendingTicketSave>,
  activeSaves: Set<string>,
  optimistic: Map<string, Ticket>,
  deleted: Set<string>,
): { ticket: Ticket; shouldFlush: boolean; wasDeleted: boolean } {
  const wasDeleted = deleted.has(tempId)
  deleted.delete(tempId)
  activeSaves.delete(tempId)

  const pending = pendingSaves.get(tempId)
  pendingSaves.delete(tempId)
  optimistic.delete(tempId)

  if (wasDeleted) {
    return { ticket: realTicket, shouldFlush: false, wasDeleted: true }
  }

  if (pending) {
    const merged = mergeTicketPatch(realTicket, pending.body)
    pendingSaves.set(realTicket.id, {
      body: pending.body,
      rollback: realTicket,
      afterSave: pending.afterSave,
    })
    optimistic.set(realTicket.id, merged)
    return { ticket: merged, shouldFlush: true, wasDeleted: false }
  }

  optimistic.set(realTicket.id, realTicket)
  return { ticket: realTicket, shouldFlush: false, wasDeleted: false }
}

export function isTicketNotFoundError(err: unknown): boolean {
  return /ticket not found/i.test(formatFetchError(err))
}

export async function fetchTicketById(authToken: string, ticketId: string): Promise<Ticket | null> {
  if (!ticketId || !authToken || isTempTicketId(ticketId)) return null
  try {
    const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    const ticket = parseCreatedTicketResponse(data) as Ticket | null
    if (!ticket?.id) return null
    return normalizeRelayScheduleTicket(ticket) as Ticket
  } catch {
    return null
  }
}

export async function lookupTicketByNumberOnServer(
  authToken: string,
  ticketNumber: string,
): Promise<Ticket | null> {
  const tn = ticketNumber.trim()
  if (!tn || !authToken) return null
  const upper = normalizeTicketNumberKey(tn)
  const direct = await fetchTicketByNumber(authToken, tn)
  if (direct && typeof direct === 'object') {
    const ticket = normalizeRelayScheduleTicket(direct) as Ticket
    if (ticket?.id) {
      cacheTicketByNumber(ticket as unknown as Record<string, unknown>)
      return ticket
    }
  }
  const urls = [
    `${API_BASE_URL}/tickets/search?q=${encodeURIComponent(tn)}&size=25`,
    `${API_BASE_URL}/tickets?q=${encodeURIComponent(tn)}&size=25`,
    `${API_BASE_URL}/tickets/branch?q=${encodeURIComponent(tn)}&size=25`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!res.ok) continue
      const data = await res.json()
      const list: Ticket[] = data?.data?.tickets || data?.tickets || []
      const exact = list.find(t => normalizeTicketNumberKey(t.ticketNumber || t.ticket_number) === upper)
      if (exact?.id) {
        cacheTicketByNumber(exact as unknown as Record<string, unknown>)
        return exact
      }
      if (list.length === 1 && list[0]?.id) {
        cacheTicketByNumber(list[0] as unknown as Record<string, unknown>)
        return list[0]
      }
    } catch {
      /* try next endpoint */
    }
  }
  return null
}

export function findTicketInListByRef(
  list: Ticket[],
  ticket: Ticket,
  optimistic?: Map<string, Ticket>,
): Ticket | null {
  const byId = list.find(t => t.id === ticket.id) || optimistic?.get(ticket.id)
  if (byId) return byId
  const tn = normalizeTicketNumberKey(ticket.ticketNumber || ticket.ticket_number)
  if (!tn) return null
  const fromStore = getTicketByNumber(tn) as Ticket | null
  if (fromStore?.id) return fromStore
  return list.find(t => normalizeTicketNumberKey(t.ticketNumber || t.ticket_number) === tn) || null
}

export function computeSafePopoverPosition(
  anchor: DOMRect,
  popoverW: number,
  popoverH: number,
  align: 'left' | 'center' | 'right' = 'left',
): { left: number; top: number; width: number } {
  const margin = 8
  const width = Math.min(popoverW, window.innerWidth - margin * 2)
  const height = popoverH
  let left = anchor.left
  if (align === 'right') left = anchor.right - width
  else if (align === 'center') left = anchor.left + anchor.width / 2 - width / 2
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
  let top = anchor.bottom + 4
  if (top + height > window.innerHeight - margin) {
    const above = anchor.top - height - 4
    top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin)
  }
  return { left, top, width }
}

export function applyImportFieldsFromRow(
  row: Pick<
    ImportUnmatchedRow,
    'name' | 'phone' | 'location' | 'district' | 'brand' | 'dlr' | 'note' | 'commit' | 'update' |
    'controlNo' | 'installer' | 'service' | 'charges' | 'paymentMode' | 'status'
  >,
  isTaguigServices = false,
): Partial<Ticket> {
  const updatedFields: Partial<Ticket> = {}
  const set = (field: keyof Ticket, val?: string) => {
    if (val?.trim()) updatedFields[field] = val.trim() as any
  }

  set('customerName', row.name)
  set('location', row.location)
  set('district', row.district)
  set('contactPhone', row.phone)
  set('unitType', row.brand)
  set('dealer', row.dlr)
  set('note', row.note)
  set('commitType', row.commit)
  set('remarksUpdate', row.update)
  set('remarks', row.update)
  set('controlNumber', row.controlNo)
  if (row.installer?.trim()) updatedFields.installerName = row.installer.trim()
  if (row.charges != null && !Number.isNaN(Number(row.charges))) {
    updatedFields.installationCharges = Number(row.charges)
  }
  const mode = normalizeImportPaymentMode(row.paymentMode)
  if (mode) updatedFields.modeOfPayment = mode
  if (row.service?.trim()) {
    updatedFields.serviceVehicle = row.service.trim()
    if (isTaguigServices) {
      updatedFields.serviceType = categoryDefaultServiceType('SERVICES')
      updatedFields.ticketCategory = 'SERVICES'
    } else {
      updatedFields.serviceType = 'S/I'
      updatedFields.ticketCategory = 'INSTALLATION'
    }
  } else if (isTaguigServices) {
    updatedFields.ticketCategory = 'SERVICES'
    updatedFields.serviceType = categoryDefaultServiceType('SERVICES')
  }
  let statusVal = (row.status || '').toUpperCase().trim().replace(/\s+/g, '_')
  if (statusVal === 'FOR_QUOTATION') statusVal = 'FOR_APPROVAL'
  if (statusVal && STATUS_OPTS.includes(statusVal)) updatedFields.status = statusVal
  return updatedFields
}

export function normalizeDriverToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '_').replace(/\//g, '_')
}

/** Tokens that belong in serviceType / schedule status Ã¢â‚¬â€ not driver names. */
export function isDriverPlaceholderToken(raw: string): boolean {
  const val = (raw || '').trim()
  if (!val) return true
  const norm = normalizeDriverToken(val)
  const upper = val.toUpperCase()
  if (/^S[\/_]?I(\s|$|[-Ã‚Â·Ã¢â‚¬Â¢])/i.test(val)) return true
  if (/^SURVEY(\s|&|$|[-Ã‚Â·Ã¢â‚¬Â¢])/i.test(val)) return true
  if (/^SERVICE(\s|&|$|[-Ã‚Â·Ã¢â‚¬Â¢])/i.test(val)) return true
  if (/^INSTALL(\s|&|$|[-Ã‚Â·Ã¢â‚¬Â¢])/i.test(val)) return true
  if (upper.includes('SURVEY') && upper.includes('INSTALL')) return true
  if (/^S[\/_]?I$/i.test(val)) return true
  if (SCHEDULE_STATUS_OPTS.some(opt => opt.value === norm || opt.label.toUpperCase() === upper)) {
    return true
  }
  const placeholders = new Set([
    'INSTALLATION', 'INSTALL', 'INSTALLED', 'SERVICE', 'SERVICES', 'SURVEY', 'CLEANING',
    'RESCHED', 'FOR_APPROVAL', 'FOR_QUOTATION', 'SCHEDULED', 'PENDING', 'ASSIGNED',
    'IN_PROGRESS', 'ON_THE_WAY', 'COMPLETED', 'CANCELLED',
    'DONE_INSTALLED', 'DONE_SURVEY', 'DONE_CLEANING', 'DONE_CHECKUP', 'DONE_BACKJOB',
    'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_DISMANTLE',
    'FREE_INSTALLATION', 'ADMIN_TASK', 'CLAIMS', 'HR_TASKS', 'PARTS_SALES',
    'PAYROLL_TASKS', 'QUOTATION', 'REQUEST_FOR_FUND', 'WTY_REGISTRATION',
    'SURVEY_&_INSTALL', 'SURVEY_AND_INSTALL',
  ])
  return placeholders.has(norm)
}

export function normalizeDriverInput(raw: string): string {
  const trimmed = (raw || '').trim()
  if (!trimmed || isDriverPlaceholderToken(trimmed)) return ''
  return trimmed
}

export function getTicketDriverName(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const candidates = [
    getF(ticket, 'driverName', 'driver_name'),
    getF(ticket, 'serviceVehicle', 'service_vehicle'),
    String(meta.driverName || meta.driver || meta.serviceVehicle || meta.driver_name || ''),
  ]
  for (const c of candidates) {
    const trimmed = sanitizeDisplayText(c)
    if (trimmed && !isDriverPlaceholderToken(trimmed)) return trimmed
  }
  return ''
}

export function formatServiceDriver(ticket: Ticket): string {
  return getTicketDriverName(ticket)
}

/** Driver name — driverName column only, never guessed from serviceVehicle. Blank means "+ Add". */
export function getTicketDriverDisplay(ticket: Ticket): string {
  const direct = sanitizeDisplayText(getF(ticket, 'driverName', 'driver_name'))
  return direct && !isDriverPlaceholderToken(direct) ? direct : ''
}

/** Vehicle code — serviceVehicle column only, never guessed/split from driverName. Blank means "+ Add". */
export function getTicketVehicleDisplay(ticket: Ticket): string {
  return sanitizeDisplayText(getF(ticket, 'serviceVehicle', 'service_vehicle'))
}

/** Parse "ALLAN - 3" / "MANNY / ROMAR - 2" / "MANNY / ROMAR" into crew name + site for grouping. */
export function parseNameSiteToken(raw: string): { name: string; site: number; label: string } {
  const v = (raw || '').trim()
  if (!v || v === EMPTY_CELL) return { name: '', site: Number.MAX_SAFE_INTEGER, label: '' }
  const m = v.match(/^(.+?)\s*-\s*(\d+)\s*$/i)
  if (m) {
    const label = m[1].trim()
    const baseName = (label.split('/')[0] || label).trim()
    return {
      name: baseName.toUpperCase(),
      site: parseInt(m[2], 10) || 0,
      label,
    }
  }
  const baseName = (v.includes('/') ? v.split('/')[0] : v).trim()
  return { name: baseName.toUpperCase(), site: Number.MAX_SAFE_INTEGER, label: v }
}

export function compareNameSiteStrings(a: string, b: string): number {
  const pa = parseNameSiteToken(a)
  const pb = parseNameSiteToken(b)
  if (!pa.name && !pb.name) return 0
  if (!pa.name) return 1
  if (!pb.name) return -1
  const byName = pa.name.localeCompare(pb.name, undefined, { sensitivity: 'base' })
  if (byName !== 0) return byName
  return pa.site - pb.site
}


/**
 * Auto-computed vehicle trip label ("STRADA - 2") for Schedules ordering. The vehicle (not the
 * driver) is the dispatch unit, so rows group by vehicle and are numbered by trip automatically —
 * staff type a plain vehicle name ("STRADA"), no manual "- 1"/"- 2" suffix needed. Legacy tickets
 * that already carry an explicit "- N" suffix in the Vehicle field keep that number as a pin;
 * auto-numbered trips continue the sequence after the highest pinned number in the group.
 */
export function buildVehicleTripLabels(ticketsList: Ticket[]): Map<string, string> {
  type Entry = { ticket: Ticket; explicitSite: number | null }
  const groups = new Map<string, Entry[]>()
  for (const t of ticketsList) {
    if (!t.id) continue
    const raw = getTicketVehicleDisplay(t)
    if (!raw) continue
    const parsed = parseNameSiteToken(raw)
    if (!parsed.name) continue
    const explicitSite = parsed.site === Number.MAX_SAFE_INTEGER ? null : parsed.site
    const arr = groups.get(parsed.name) || []
    arr.push({ ticket: t, explicitSite })
    groups.set(parsed.name, arr)
  }
  const labels = new Map<string, string>()
  for (const [base, entries] of groups) {
    let nextAuto = entries.reduce((m, e) => (e.explicitSite != null ? Math.max(m, e.explicitSite) : m), 0)
    const autoOrdered = entries
      .filter(e => e.explicitSite == null)
      .sort((a, b) => {
        const at = a.ticket.createdAt || a.ticket.created_at || ''
        const bt = b.ticket.createdAt || b.ticket.created_at || ''
        if (at && bt && at !== bt) return at.localeCompare(bt)
        const an = a.ticket.ticketNumber || a.ticket.ticket_number || a.ticket.id || ''
        const bn = b.ticket.ticketNumber || b.ticket.ticket_number || b.ticket.id || ''
        return an.localeCompare(bn, undefined, { numeric: true })
      })
    for (const e of autoOrdered) {
      nextAuto += 1
      labels.set(e.ticket.id, `${base} - ${nextAuto}`)
    }
    for (const e of entries) {
      if (e.explicitSite != null) labels.set(e.ticket.id, `${base} - ${e.explicitSite}`)
    }
  }
  return labels
}

export function ticketColumnText(
  ticket: Ticket,
  colLabel: string,
  options?: { myTickets?: boolean; employees?: BranchStaffOption[]; branchId?: string | null; vehicleTripLabels?: Map<string, string> },
): string {
  const myTickets = options?.myTickets ?? false
  const employees = options?.employees
  const branchId = options?.branchId
  switch (colLabel) {
    case 'TICKET NO': return getTicketNumberDisplay(ticket)
    case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title || ''
    case 'DESTINATION': return resolveTicketDistrict(ticket)
    case 'BRAND': return parseBrand(ticket)
    case 'DLR': return getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || ''
    case 'STATUS': return ticket.status || ''
    case 'COMMIT': return getTicketCommitDisplay(ticket)
    case 'FINAL DATE': return getFinalDateKey(ticket)
    case 'INSTALLER': return getInstallerSortKey(ticket, employees, branchId)
    case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, employees)
    case 'SERVICE': return myTickets ? formatRelayTicketTypeShort(ticket) : getTicketDriverDisplay(ticket)
    case 'VEHICLE': return myTickets ? '' : (options?.vehicleTripLabels?.get(ticket.id || '') || getTicketVehicleDisplay(ticket))
    case 'UPDATE': return getScheduleUpdateDisplay(ticket)
    default: return ''
  }
}

export function compareTicketsByColumn(
  a: Ticket,
  b: Ticket,
  colLabel: string,
  options?: { myTickets?: boolean; employees?: BranchStaffOption[]; branchId?: string | null; vehicleTripLabels?: Map<string, string> },
): number {
  const av = ticketColumnText(a, colLabel, options)
  const bv = ticketColumnText(b, colLabel, options)
  if (colLabel === 'INSTALLER' || colLabel === 'SERVICE' || colLabel === 'VEHICLE') {
    return compareNameSiteStrings(av, bv)
  }
  return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
}

export function getTicketNegotiatorName(ticket: Ticket, employees?: { id: string; name: string }[]): string {
  const fullname = resolveNegotiatorDisplayName(ticket, employees)
  if (!fullname) return ''
  let cleanName = fullname.trim()
  cleanName = cleanName.replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '')
  const firstName = cleanName.split(/\s+/)[0]
  return firstName.toUpperCase()
}

// VEHICLE is deliberately excluded — double-click there selects the cell (green highlight) for
// arrow-key reordering instead of opening the text editor.
export const INLINE_EDIT_COLUMNS = new Set([
  'INSTALLER', 'NEGOTIATOR', 'COMMIT', 'BRAND', 'DLR', "CUSTOMER'S NAME",
  'FINAL DATE', 'SERVICE', 'UPDATE', 'DESTINATION', 'NOTE',
])
export const DEFAULT_MY_TICKETS_SORT = { column: 'FINAL DATE', direction: 'asc' as const }
export const DEFAULT_SCHEDULE_SORT = { column: 'VEHICLE', direction: 'asc' as const }

export function defaultSortForSchedulesView(isMyTickets: boolean) {
  return isMyTickets ? DEFAULT_MY_TICKETS_SORT : DEFAULT_SCHEDULE_SORT
}

export function parseServiceDriverValue(
  raw?: string,
  category: TicketCategoryValue = 'INSTALLATION',
): { serviceType: string; serviceVehicle: string } {
  const val = (raw || '').trim()
  return { serviceType: categoryDefaultServiceType(category), serviceVehicle: val }
}

export function getF(ticket: any, ...keys: string[]): string {
  if (!ticket) return ''
  for (const k of keys) {
    const v = ticket[k]
    if (v != null && typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** COMMIT column only — never fall back to description (API default "Service ticket"). */
export function getTicketCommitDisplay(ticket: Partial<Ticket> | null | undefined): string {
  if (!ticket) return ''
  const raw = getF(ticket as Ticket, 'commitType', 'commitTerms')
  if (!raw) return ''
  const lower = raw.toLowerCase()
  // Legacy tickets sometimes stored the description default into commitType.
  if (
    lower === 'service ticket'
    || lower === 'excel imported ticket'
    || lower === 'no additional details provided.'
    || lower === 'no additional details provided'
  ) {
    return ''
  }
  return raw
}

export function statusCode(s: string) {
  return { PENDING: 'P', ASSIGNED: 'A', ON_THE_WAY: 'OTW', IN_PROGRESS: 'IP', COMPLETED: 'C', CANCELLED: 'X' }[s.toUpperCase()] || s.slice(0, 3)
}

export function statusColor(s: string, light: boolean) {
  switch (s.toUpperCase()) {
    case 'PENDING': return { text: '#FB923C', bg: light ? '#fff7ed' : 'rgba(251,146,60,0.13)', b: 'rgba(251,146,60,0.4)' }
    case 'ASSIGNED': return { text: '#3B82F6', bg: light ? '#eff6ff' : 'rgba(59,130,246,0.13)', b: 'rgba(59,130,246,0.4)' }
    case 'ON_THE_WAY': return { text: '#06B6D4', bg: light ? '#ecfeff' : 'rgba(6,182,212,0.13)', b: 'rgba(6,182,212,0.4)' }
    case 'IN_PROGRESS': return { text: '#10B981', bg: light ? '#f0fdf4' : 'rgba(16,185,129,0.13)', b: 'rgba(16,185,129,0.4)' }
    case 'CANCELLED': return { text: '#EF4444', bg: light ? '#fef2f2' : 'rgba(239,68,68,0.10)', b: 'rgba(239,68,68,0.35)' }
    case 'CONTINUATION': return { text: '#7C3AED', bg: light ? '#F3E8FF' : 'rgba(124,58,237,0.18)', b: 'rgba(124,58,237,0.35)' }
    case 'SYSTEM_REPROCESS':
    case 'DONE_SYSTEM_REPROCESS':
      return { text: '#6366F1', bg: light ? '#eef2ff' : 'rgba(99,102,241,0.15)', b: 'rgba(99,102,241,0.4)' }
    case 'DISMANTLE':
    case 'DONE_DISMANTLE':
      return { text: '#F43F5E', bg: light ? '#fff1f2' : 'rgba(244,63,94,0.15)', b: 'rgba(244,63,94,0.4)' }
    default: return { text: '#94A3B8', bg: 'transparent', b: 'rgba(148,163,184,0.3)' }
  }
}

export function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const nums: string[] = []
  let rem = digits
  while (rem.length >= 10) {
    if (rem.startsWith('63') && rem.length >= 12) { nums.push('0' + rem.slice(2, 12)); rem = rem.slice(12) }
    else if (rem.startsWith('09') && rem.length >= 11) { nums.push(rem.slice(0, 11)); rem = rem.slice(11) }
    else if (rem.startsWith('9') && rem.length >= 10) { nums.push('0' + rem.slice(0, 10)); rem = rem.slice(10) }
    else break
  }
  return nums.slice(0, 2).map(n => n.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')).join(' / ')
}

export function getFirstNameUpper(raw?: string | null): string {
  if (!raw || !raw.trim()) return EMPTY_CELL
  let cleaned = raw.trim()
  if (cleaned.includes('@')) {
    cleaned = cleaned.split('@')[0].replace(/[\._]/g, ' ')
  }
  cleaned = cleaned.replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '')
  const firstWord = cleaned.split(/\s+/)[0]
  return firstWord ? firstWord.toUpperCase() : EMPTY_CELL
}

export function formatDateKeyWithDay(dateKey: string): string {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey
  const d = new Date(`${dateKey}T00:00:00`)
  if (isNaN(d.getTime())) return dateKey
  const monthName = d.toLocaleDateString('en-US', { month: 'long' })
  const dayNum = d.getDate()
  const year = d.getFullYear()
  const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' })
  return `${monthName} ${dayNum}, ${year} ${dayOfWeek}`
}

export type HistorySpecifics = {
  title: string
  remarks?: string
  driver?: string
  installer?: string
  dealer?: string
  serviceType?: string
  payment?: string
  controlNo?: string
}

export function parseHistorySpecifics(rawNote?: string | null): HistorySpecifics {
  if (!rawNote || !rawNote.trim()) return { title: 'Ticket updated' }

  const fullRaw = rawNote.trim()
  const specifics: HistorySpecifics = { title: 'Ticket updated' }

  // 1. Extract bracketed [key=value] pairs first
  const bracketMatches = Array.from(fullRaw.matchAll(/\[([\w_]+)=([^\]]*)\]/g))
  let modeOfPay = ''
  let chargesAmt = ''

  for (const match of bracketMatches) {
    const key = match[1].toLowerCase()
    const val = match[2].trim()
    if (!val) continue

    if (['remarks', 'note', 'update', 'reason', 'change_note', 'changenote'].includes(key)) {
      specifics.remarks = val
    } else if (['driver', 'vehicle', 'service_driver'].includes(key)) {
      specifics.driver = val
    } else if (['installer', 'technician', 'tech'].includes(key)) {
      specifics.installer = val
    } else if (['dealer', 'store', 'dlr'].includes(key)) {
      if (val !== 'Direct') specifics.dealer = val
    } else if (['control_number', 'control_no', 'controlno', 'si', 'si_number'].includes(key)) {
      specifics.controlNo = val
    } else if (['mode_of_payment', 'payment_mode', 'payment'].includes(key)) {
      modeOfPay = val
    } else if (['amount_charged', 'charges', 'installation_charges', 'amount'].includes(key)) {
      chargesAmt = `₱${Number(val.replace(/\D/g, '') || val).toLocaleString()}`
    } else if (key === 'status' || key === 'new_status') {
      specifics.title = `Status set to ${val}`
    } else if (['preferred_date', 'new_preferred_date', 'rescheduled_to'].includes(key)) {
      specifics.title = `Moved to ${formatDateKeyWithDay(val)}`
    }
  }

  if (modeOfPay || chargesAmt) {
    specifics.payment = [modeOfPay, chargesAmt].filter(Boolean).join(' · ')
  }

  // 2. Clean bracket tags for free text analysis
  let text = fullRaw.replace(/\[\w+=[^\]]*\]/g, '').trim()
  text = text.replace(/^(Ticket details updated|Ticket updated|Update ticket|acDetails updated)[\s\:\.]*/i, '').trim()

  // 3. Free text reschedule & status patterns
  if (specifics.title === 'Ticket updated') {
    const reschedMatch = fullRaw.match(/(?:Rescheduled from \d{4}-\d{2}-\d{2} to|Moved to|Final date set to)\s*(\d{4}-\d{2}-\d{2})/i)
    if (reschedMatch && reschedMatch[1]) {
      specifics.title = `Moved to ${formatDateKeyWithDay(reschedMatch[1])}`
    } else if (/Status (changed|set) to/i.test(fullRaw)) {
      const stMatch = fullRaw.match(/Status (?:changed|set) to ([^\.\;]+)/i)
      specifics.title = stMatch ? `Status set to ${stMatch[1].trim()}` : 'Status updated'
    } else if (/Submitted|Created/i.test(fullRaw)) {
      specifics.title = 'Ticket created'
    } else if (/Assignee (changed|updated)/i.test(fullRaw)) {
      specifics.title = 'Assignee updated'
    }
  }

  // 4. Free text remarks / driver / installer / dealer / payment / control number
  if (!specifics.remarks) {
    const remarksMatch = text.match(/(?:Remarks|Update|Note|added remarks)[^\:\-\=]*[\:\=]\s*([^\.\;\n]+)/i)
      || text.match(/(?:Moved to|Rescheduled to)[^\-\:]*[\-\:]\s*(.+)/i)
    if (remarksMatch && remarksMatch[1]) {
      const rem = remarksMatch[1].trim()
      if (rem && !/^(SCHEDULED|PENDING)$/i.test(rem)) {
        specifics.remarks = rem
      }
    } else if (text && !/^(Ticket|acDetails|Details)/i.test(text) && text.length > 2) {
      specifics.remarks = text
    }
  }

  if (!specifics.driver) {
    const driverMatch = fullRaw.match(/Driver\s*(?:set to|changed to|\:)\s*([^\.\;\n\]]+)/i)
    const vehicleMatch = fullRaw.match(/Vehicle\s*(?:set to|changed to|\:)\s*([^\.\;\n\]]+)/i)
    if (driverMatch && driverMatch[1]) {
      const drv = driverMatch[1].trim()
      const veh = vehicleMatch && vehicleMatch[1] ? vehicleMatch[1].trim() : ''
      specifics.driver = veh ? `${drv} (${veh})` : drv
    } else if (vehicleMatch && vehicleMatch[1]) {
      specifics.driver = vehicleMatch[1].trim()
    }
  }

  if (!specifics.installer) {
    const installerMatch = fullRaw.match(/(?:Installer|Technician)\s*(?:name)?\s*(?:set to|changed to|\:)\s*([^\.\;\n\]]+)/i)
    if (installerMatch && installerMatch[1]) specifics.installer = installerMatch[1].trim()
  }

  if (!specifics.dealer) {
    const dealerMatch = fullRaw.match(/Dealer (?:set to|\:)\s*([^\.\;\n\]]+)/i)
    if (dealerMatch && dealerMatch[1]) {
      const dVal = dealerMatch[1].trim()
      if (dVal && dVal !== 'Direct') specifics.dealer = dVal
    }
  }

  if (!specifics.payment) {
    const chargesMatch = fullRaw.match(/Installation charges set to (\d+)/i)
    const modeMatch = fullRaw.match(/Mode of payment set to ([^\.\;\n\]]+)/i)
    if (chargesMatch || modeMatch) {
      const mode = modeMatch ? modeMatch[1].trim() : ''
      const charges = chargesMatch ? `₱${Number(chargesMatch[1]).toLocaleString()}` : ''
      specifics.payment = [mode, charges].filter(Boolean).join(' · ')
    }
  }

  if (!specifics.controlNo) {
    const controlMatch = fullRaw.match(/Control number set to ([^\.\;\n\]]+)/i)
    if (controlMatch && controlMatch[1]) specifics.controlNo = controlMatch[1].trim()
  }

  // Sanitize remarks: hide if it's just auto-generated system log sentences
  if (specifics.remarks) {
    const isSystemLog = /(?:Status changed|Assignee changed|Driver set to|Vehicle set to|Title set to|AC details updated|Actual completion|Dealer set to|Installer name set to|Installation charges|Mode of payment|Control number set to|Store referral fee)/i.test(specifics.remarks)
    if (isSystemLog) {
      specifics.remarks = undefined
    }
  }

  // 5. Intelligent title fallback
  if (specifics.title === 'Ticket updated') {
    if (specifics.remarks) {
      specifics.title = 'Remarks / Note updated'
    } else if (specifics.driver || specifics.installer) {
      specifics.title = 'Personnel assigned'
    } else if (specifics.payment) {
      specifics.title = 'Payment details updated'
    } else if (specifics.controlNo) {
      specifics.title = 'Control No. updated'
    } else if (specifics.dealer) {
      specifics.title = 'Dealer updated'
    }
  }

  return specifics
}


export function getBranchDisplayName(id: string | null): string {
  if (!id || id === 'ALL_BRANCHES') return 'All branches'
  if (isTaguigBranchRef(id)) {
    return parseGlobalBranchScope(id).branchName
  }
  const upper = id.toUpperCase()
  let name = upper.replace(/^BR-/i, '').replace(/-(sales|services|service)$/i, '').replace(/-/g, ' ').trim()
  if (name.startsWith('ASHCOL ')) {
    name = name.slice(7).trim()
  }
  return name
}

export function formatNegotiatorLabel(
  emp: { name?: string | null; branchId?: string | null },
  omitBranch = false,
): string {
  const fullName = (emp.name || '').trim().toUpperCase()
  const firstName = fullName.split(/\s+/)[0]
  if (omitBranch) return fullName || firstName
  const branch = getBranchDisplayName(emp.branchId || null)
  return branch ? `${fullName || firstName} (${branch.toUpperCase()})` : (fullName || firstName)
}

export function todayDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function currentWeekMondayDateKey() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const SCHEDULES_ACTIVE_DATE_KEY = 'ashcol-schedules-active-date'

export function resolveInitialScheduleDate(pathname: string): string {
  if (pathname === '/my-tickets') return ''
  try {
    const persisted = sessionStorage.getItem(SCHEDULES_ACTIVE_DATE_KEY)
    if (persisted && /^\d{4}-\d{2}-\d{2}$/.test(persisted)) return persisted
  } catch {
    // ignore
  }
  return todayDateKey()
}


export function formatDateToKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}



export function isUnmatchedImportComplete(item: ImportUnmatchedRow): boolean {
  return Boolean(
    (item.status && item.status.toUpperCase() === 'COMPLETED') ||
    (item.update && item.update.toLowerCase().includes('installed'))
  )
}

export function buildImportCreateRow(
  item: ImportUnmatchedRow,
  importTargetDate?: string,
  options?: { taguigServices?: boolean; branchId?: string; negotiatorId?: string },
): Record<string, unknown> {
  const location = (item.location
    ? (typeof item.location === 'object' ? JSON.stringify(item.location) : item.location)
    : '').trim() || 'No Address Provided'

  const taguigServices = options?.taguigServices === true
  const defaultServiceLabel = taguigServices ? categoryDefaultServiceType('SERVICES') : 'S/I'

  const row: Record<string, unknown> = {
    title: `${item.service || defaultServiceLabel} service`.trim(),
    description: (item.note || item.update || 'Excel imported ticket').trim(),
    customerName: (item.name || 'Unknown Customer').trim(),
    serviceType: taguigServices ? defaultServiceLabel : (item.service || 'S/I'),
    ticketCategory: taguigServices ? 'SERVICES' : 'INSTALLATION',
    unitType: item.brand || 'Split AC',
    location,
    dealer: item.dlr || 'Direct',
    status: importTargetDate ? 'SCHEDULED' : 'PENDING',
  }

  if (importTargetDate) {
    row.preferredDate = importTargetDate
    row.source = 'SCHEDULE_MANUAL'
    row.acDetails = JSON.stringify({
      scheduleOutcome: '',
      finalDate: '',
      scheduledDate: importTargetDate,
      scheduleIntake: true,
    })
  }
  if (options?.branchId) row.branchId = options.branchId
  if (options?.negotiatorId) {
    row.negotiatorId = options.negotiatorId
    row.assignedTo = options.negotiatorId
  }

  if (item.phone?.trim()) row.contactPhone = item.phone.trim()
  if (item.district?.trim()) row.district = item.district.trim()
  if (item.commit?.trim()) row.commitType = item.commit.trim()
  if (item.installer?.trim()) row.installerName = item.installer.trim()
  if (item.service?.trim()) row.serviceVehicle = item.service.trim()
  if (item.update?.trim()) row.remarksUpdate = item.update.trim()
  if (item.charges != null && !Number.isNaN(Number(item.charges))) row.installationCharges = item.charges
  const mode = normalizeImportPaymentMode(item.paymentMode)
  if (mode) row.modeOfPayment = mode
  if (item.controlNo?.trim()) row.controlNumber = item.controlNo.trim()

  return row
}

export function buildPatchImportBody(
  ticket: Ticket,
  updatedFields: Partial<Ticket>,
  importTargetDate?: string,
  assignToUserId?: string,
  branchId?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  const set = (key: string, val: unknown) => {
    if (val !== undefined && val !== null && val !== '') body[key] = val
  }

  set('customerName', updatedFields.customerName)
  set('location', updatedFields.location)
  set('district', updatedFields.district)
  set('contactPhone', updatedFields.contactPhone)
  set('unitType', updatedFields.unitType)
  set('dealer', updatedFields.dealer)
  set('commitType', updatedFields.commitType ?? updatedFields.commitTerms)
  set('serviceVehicle', updatedFields.serviceVehicle)
  set('remarksUpdate', updatedFields.remarksUpdate ?? updatedFields.remarks)
  set('controlNumber', updatedFields.controlNumber)
  set('ticketNumber', (updatedFields as Ticket).ticketNumber)
  set('installerName', updatedFields.installerName)
  set('negotiatorId', (updatedFields as Ticket).negotiatorId)
  if (updatedFields.serviceVehicle) body.serviceType = updatedFields.serviceType || 'S/I'
  if (updatedFields.installationCharges != null) body.installationCharges = updatedFields.installationCharges
  if (updatedFields.modeOfPayment) body.modeOfPayment = updatedFields.modeOfPayment
  if (updatedFields.status) body.status = updatedFields.status
  if (importTargetDate) {
    body.preferredDate = importTargetDate
    body.source = 'SCHEDULE_MANUAL'
    if (!body.status) body.status = 'SCHEDULED'
  }
  if (assignToUserId) body.assignedTo = assignToUserId
  if (branchId) body.branchId = branchId

  let acBase: Ticket = ticket
  if (updatedFields.location) {
    const acDetails = mergeAcMeta(acBase, { destination: updatedFields.location, address: updatedFields.location })
    body.acDetails = acDetails
    acBase = { ...ticket, acDetails }
  }
  if (updatedFields.district) {
    const acDetails = mergeAcMeta(acBase, { district: updatedFields.district })
    body.acDetails = acDetails
    acBase = { ...ticket, acDetails }
  }
  if (updatedFields.unitType) {
    const acDetails = mergeAcMeta(acBase, { brand: updatedFields.unitType, unitType: updatedFields.unitType })
    body.acDetails = acDetails
    acBase = { ...ticket, acDetails }
  }
  if (updatedFields.dealer) {
    const acDetails = mergeAcMeta(acBase, { dealer: updatedFields.dealer, dlr: updatedFields.dealer })
    body.acDetails = acDetails
    acBase = { ...ticket, acDetails }
  }
  if (updatedFields.remarksUpdate || updatedFields.remarks) {
    const remark = updatedFields.remarksUpdate ?? updatedFields.remarks
    body.acDetails = mergeAcMeta(acBase, { update: remark, remarksUpdate: remark })
    acBase = { ...ticket, acDetails: body.acDetails as string }
  }
  if (updatedFields.installerName) {
    body.acDetails = mergeAcMeta(acBase, {
      installerName: updatedFields.installerName,
      installer: updatedFields.installerName,
      technicianName: updatedFields.installerName,
    })
    acBase = { ...ticket, acDetails: body.acDetails as string }
  }
  if (importTargetDate) {
    body.acDetails = mergeAcMeta(acBase, {
      scheduledDate: importTargetDate,
      scheduleIntake: true,
    })
  }

  return body
}

export function toApiDateTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Terminal status for a schedule closing outcome — never collapse dismantle/reprocess to COMPLETED. */
export function resolveClosingStatusForOutcome(outcome: string, incomingStatus?: string): string {
  const o = (outcome || '').toUpperCase()
  const incoming = (incomingStatus || '').toUpperCase()
  if (o === 'DONE_DISMANTLE' || incoming === 'DONE_DISMANTLE') return 'DONE_DISMANTLE'
  if (o === 'DONE_SYSTEM_REPROCESS' || incoming === 'DONE_SYSTEM_REPROCESS') return 'DONE_SYSTEM_REPROCESS'
  if (o === 'DONE_INSTALLED' || incoming === 'INSTALLED') return 'INSTALLED'
  return 'COMPLETED'
}

export function enrichCompletePatchBody(
  body: Record<string, unknown>,
  ticket: Ticket,
  scheduleDateKey: string,
): Record<string, unknown> {
  const schedKey = resolveScheduleCompletionDateKey(ticket, scheduleDateKey)
  const baseAc = typeof body.acDetails === 'string' ? body.acDetails : ticket.acDetails
  const merged = { ...ticket, ...body, acDetails: baseAc } as Ticket
  const outcome = getScheduleOutcome(merged) || 'DONE_INSTALLED'
  const remarksUpdate = typeof body.remarksUpdate === 'string'
    ? stripArchivedRemarkSuffix(body.remarksUpdate)
    : undefined
  const closeStatus = resolveClosingStatusForOutcome(
    outcome,
    String(body.status || ticket.status || ''),
  )
  return {
    ...body,
    ...(remarksUpdate !== undefined ? { remarksUpdate, remarks: remarksUpdate } : {}),
    status: closeStatus,
    scheduleOutcome: outcome,
    actualCompletion: toApiDateTime(),
    acDetails: mergeAcMeta(
      { ...ticket, acDetails: baseAc } as Ticket,
      {
        ...buildArchiveAcMeta(ticket, schedKey, outcome),
        ...(remarksUpdate ? { update: remarksUpdate, remarksUpdate } : {}),
      },
    ),
  }
}

export function wantsTicketArchive(ticket: Partial<Ticket>, fields?: Partial<Ticket>): boolean {
  const status = String(fields?.status ?? ticket.status ?? '').toUpperCase()
  if (status === 'COMPLETED') return true
  return qualifiesForInstallComplete(ticket, fields)
}

export function resolveNegotiatorName(
  ticket: Ticket,
  employees: { id: string; name: string }[],
  negotiatorId?: string,
): string {
  if (negotiatorId === '') return ''
  const id = (negotiatorId ?? ticket.negotiatorId ?? ticket.negotiator_id ?? '').trim()
  if (id) {
    const match = employees.find(e => e.id === id)
    if (match?.name) return match.name.trim()
  }
  const meta = parseAcMeta(ticket)
  return String(meta.negotiatorName || meta.negotiator || '').trim()
}

export function buildArchiveServiceReportPayload(
  ticket: Ticket,
  branchId: string,
  fields: {
    customerName?: string
    location?: string
    contactPhone?: string
    district?: string
    commitType?: string
    dealer?: string
    unitType?: string
    installerName?: string
    serviceVehicle?: string
    installationCharges?: number
    modeOfPayment?: string
    remarks?: string
    remarksUpdate?: string
    controlNumber?: string
    ticketNumber?: string
    note?: string
    negotiatorName?: string
    serviceType?: string
    unitSerial?: string
    quantity?: number
    scheduleStatus?: string
    complainRequest?: string
  } = {},
  scheduleDateKey?: string,
): Record<string, unknown> | null {
  if (!branchId) return null
  const merged = { ...ticket, ...fields } as Ticket
  const meta = parseAcMeta(merged)
  const scheduleKey =
    scheduleDateKey ||
    getArchivedScheduleDate(merged) ||
    getEffectiveScheduleDateKey(merged) ||
    todayDateKey()
  const installedKey =
    String(meta.installedDate || '').split('T')[0].split(' ')[0].trim() ||
    scheduleKey ||
    todayDateKey()
  const mode = String(
    fields.modeOfPayment ?? ticket.modeOfPayment ?? ticket.mode_of_payment ?? 'CASH',
  ).toUpperCase()
  const charges =
    fields.installationCharges ??
    ticket.installationCharges ??
    ticket.installation_charges ??
    ticket.amountCharged ??
    0
  const remarks =
    fields.remarksUpdate ??
    fields.remarks ??
    ticket.remarksUpdate ??
    ticket.remarks ??
    'Installed'
  const commitTerms =
    fields.commitType ??
    getF(merged, 'commitType', 'commitTerms', 'description') ??
    merged.description ??
    ''
  const freeInstall =
    mode === 'FREE INSTALL' ||
    mode === 'FREE' ||
    /FREE/i.test(commitTerms)
  const serviceType =
    fields.serviceType ??
    (freeInstall ? 'FREE_INSTALLATION' : 'INSTALLATION')
  const negotiator =
    (fields.negotiatorName || '').trim() ||
    String(meta.negotiatorName || meta.negotiator || '').trim() ||
    String((merged as Ticket & { negotiatorName?: string }).negotiatorName || '').trim() ||
    ''
  const controlNo =
    fields.controlNumber ??
    ticket.controlNumber ??
    ticket.control_number ??
    ''
  const unitSerial =
    fields.unitSerial ??
    (String(meta.serialNumber || meta.unitSerial || meta.si || '').trim() || '')
  const quantity =
    fields.quantity ??
    (typeof meta.quantity === 'number' ? meta.quantity : parseInt(String(meta.quantity || ''), 10) || 1)

  return {
    branchId,
    ticketId: ticket.id,
    reportDate: installedKey,
    scheduledDate: scheduleKey,
    installedDate: installedKey,
    customerName: (fields.customerName ?? getF(ticket, 'customerName', 'customer_name') ?? ticket.title ?? '').trim(),
    customerAddress: formatAddress(fields.location ?? ticket.location),
    customerPhone: fields.contactPhone ?? getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
    district: fields.district ?? parseDistrict(ticket.location, ticket.district),
    serviceType,
    statusCode: 'I',
    commitTerms,
    dealer: fields.dealer ?? getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') ?? '',
    unitBrandModel: fields.unitType ?? parseBrand(ticket),
    unitSerial: unitSerial || undefined,
    quantity: quantity > 0 ? quantity : 1,
    technicianName: fields.installerName ?? getInstallerDisplay(ticket),
    negotiator: negotiator || undefined,
    serviceColumn: formatServiceDriver({
      ...ticket,
      serviceVehicle: fields.serviceVehicle ?? ticket.serviceVehicle ?? ticket.service_vehicle,
      serviceType: ticket.serviceType ?? ticket.service_type,
    }),
    amountCharged: parseFloat(String(charges)) || 0,
    paymentStatus: mode,
    jobStatus: 'COMPLETED',
    remarks,
    note: fields.note ?? ticket.note ?? '',
    controlNumber: controlNo || undefined,
    scheduleStatus: fields.scheduleStatus ?? String(meta.scheduleStatus || 'COMPLETED'),
    complainRequest: fields.complainRequest ?? (String(meta.complainRequest || meta.complain || '').trim() || undefined),
    freeInstallation: freeInstall,
  }
}

export async function postArchiveServiceReport(
  payload: Record<string, unknown>,
  tokenVal: string,
): Promise<void> {
  const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
    body: JSON.stringify(payload),
  })
  if (!reportRes.ok) throw new Error(await readApiError(reportRes))
  notifyArchiveUpdated()
}

export function getCellRawValue(
  ticket: Ticket,
  colLabel: string,
  myTickets = false,
  employees?: BranchStaffOption[],
  branchId?: string | null,
): string {
  switch (colLabel) {
    case 'TICKET NO': return getTicketNumberDisplay(ticket)
    case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title || ''
    case 'DESTINATION': return formatAddress(ticket.location)
    case 'BRAND': return parseBrand(ticket)
    case 'DLR': return getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || ''
    case 'STATUS': return getScheduleStatusValue(ticket)
    case 'COMMIT': return getTicketCommitDisplay(ticket)
    case 'FINAL DATE': return getFinalDateKey(ticket)
    case 'INSTALLER': return getInstallerDisplay(ticket, employees, branchId)
    case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, employees)
    case 'SERVICE': return myTickets ? formatRelayTicketTypeShort(ticket) : getTicketDriverDisplay(ticket)
    case 'VEHICLE': return myTickets ? '' : getTicketVehicleDisplay(ticket)
    case 'UPDATE': return getScheduleUpdateDisplay(ticket)
    default: return ''
  }
}

export function buildCellPatchBody(
  ticket: Ticket,
  colLabel: string,
  rawValue: string,
  employees: BranchStaffOption[] = [],
): Record<string, unknown> {
  const v = rawValue.trim()
  const body: Record<string, unknown> = {}
  let acBase: Ticket = ticket

  switch (colLabel) {
    case "CUSTOMER'S NAME":
      if (v) {
        body.customerName = v.toUpperCase()
        const st = getF(ticket, 'serviceType', 'service_type') || 'S/I'
        body.title = `${st} service`
      }
      break
    case 'DESTINATION':
      if (v) {
        body.location = v.toUpperCase()
        body.acDetails = mergeAcMeta(acBase, { destination: v.toUpperCase(), address: v.toUpperCase() })
      }
      break
    case 'BRAND':
      body.unitType = v || undefined
      body.acDetails = mergeAcMeta(acBase, { brand: v, unitType: v })
      break
    case 'DLR':
      body.dealer = v || undefined
      body.acDetails = mergeAcMeta(acBase, { dealer: v, dlr: v })
      break
    case 'STATUS': {
      const patch = applyScheduleStatusPatch(ticket, v)
      Object.assign(body, patch)
      break
    }
    case 'COMMIT':
      // Always send the field so empty clears commitType (don't omit / fall back to description).
      body.commitType = v
      break
    case 'INSTALLER':
      body.installerName = v
      body.acDetails = mergeAcMeta(acBase, { installerName: v, installer: v, technicianName: v })
      break
    // SERVICE (driver) and VEHICLE are separate cells with their own dedicated inputs — each
    // edit writes ONLY the field the user actually typed into, full stop. An earlier version also
    // tried a "one-time migration" here (if driverName was empty, re-derive the OTHER field from
    // whatever combined text sat in serviceVehicle using getServiceVehicleParts). That's just as
    // unsafe as splitting the freshly-typed input: getServiceVehicleParts happily "splits" plain
    // text like "TAMARAW JV1" or "FB4 SEDRICK2" into a fake driver+vehicle pair (see the SQL
    // cleanup script for real examples), so editing DRIVER on one of those tickets was silently
    // overwriting VEHICLE with a wrong guessed value. There is no reliable way to auto-split
    // free-text without a real vehicle roster, so this never guesses — ambiguous legacy tickets
    // are left for a human to clean up by hand (see backfill_split_driver_service_vehicle.sql).
    case 'SERVICE': {
      const driverVal = normalizeDriverInput(v)
      body.driverName = driverVal
      body.acDetails = mergeAcMeta(acBase, { driverName: driverVal, driver_name: driverVal })
      break
    }
    case 'VEHICLE': {
      const vehicleVal = normalizeDriverInput(v)
      body.serviceVehicle = vehicleVal
      body.acDetails = mergeAcMeta(acBase, { serviceVehicle: vehicleVal, service_vehicle: vehicleVal })
      break
    }
    case 'UPDATE': {
      const remark = stripArchivedRemarkSuffix(v)
      body.remarks = remark
      body.remarksUpdate = remark
      body.acDetails = mergeAcMeta(acBase, { update: remark, remarksUpdate: remark })
      break
    }
    case 'FINAL DATE': {
      const dateKey = v.split('T')[0].split(' ')[0].trim()
      if (!dateKey) {
        if (ticketHadScheduleDate(ticket)) {
          const acUpdates: Record<string, unknown> = {}
          applyReturnToNegotiatorMyTicketsPatch(ticket, body, acUpdates)
          body.acDetails = mergeAcMeta(acBase, acUpdates)
        }
        break
      }
      body.finalDate = dateKey
      body.preferredDate = dateKey
      body.acDetails = mergeAcMeta(acBase, { finalDate: dateKey, scheduledDate: dateKey })
      const stat = (ticket.status || '').toUpperCase()
      if (['PENDING', 'ASSIGNED'].includes(stat)) body.status = 'SCHEDULED'
      break
    }
    case 'NEGOTIATOR': {
      if (!v) break
      const needle = v.toLowerCase()
      const emp = employees.find(e =>
        e.id === v
        || (e.name || '').trim().toLowerCase() === needle
        || (e.name || '').toLowerCase().includes(needle),
      )
      if (emp?.id) body.negotiatorId = emp.id
      break
    }
    default:
      break
  }
  return applyRelayScheduleSyncToPatch(body, ticket)
}

export type TicketsSurface = 'my-tickets' | 'schedules' | 'search'

/**
 * Each surface maps to exactly the pathname string the old route-sniffing logic used to read
 * from useLocation() — kept as literal strings (not the actual URL) so the surface-specific
 * cache-key/date-resolution helpers below (which take a raw pathname) behave identically.
 */
export function pathnameForSurface(surface: TicketsSurface): string {
  if (surface === 'my-tickets') return '/my-tickets'
  if (surface === 'schedules') return '/schedules'
  return '/search'
}

