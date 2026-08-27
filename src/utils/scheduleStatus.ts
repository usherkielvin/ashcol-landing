import { sanitizeDisplayText } from './textSanitize'
import type { Ticket, ScheduleOutcome, ScheduleStatusGroup } from './ticketTypes'
import { inferCategoryFromTicket } from '../constants/ticketCategories'
import { parseAcMeta } from './ticketPatch'
import {
  hasFinalScheduleDate,
  getFinalDateKey,
  formatDateKeyLabel,
  isReschedulePending,
} from './ticketDates'

export const STATUS_OPTS = [
  'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY',
  'INSTALLED', 'COMPLETED', 'CONTINUATION',
  'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_DISMANTLE', 'PENDING_APPROVAL',
  'FOR_NEGOTIATION', 'DONE_NEGOTIATION', 'FOR_COLLECTION',
]

export const TABLE_ROW_HEIGHT = 50

export function isInstalledWorkflowStatus(status?: string | null): boolean {
  const s = (status || '').toUpperCase()
  return s === 'INSTALLED' || s === 'COMPLETED'
}

export const SCHEDULE_STATUS_OPTS: { value: string; label: string; group: ScheduleStatusGroup }[] = [
  // Pending
  { value: 'INSTALL', label: 'INSTALL', group: 'pending' },
  { value: 'SURVEY', label: 'SURVEY', group: 'pending' },
  { value: 'CLEANING', label: 'CLEANING', group: 'pending' },
  { value: 'CHECKUP', label: 'CHECKUP', group: 'pending' },
  { value: 'BACKJOB', label: 'BACKJOB', group: 'pending' },
  { value: 'SERVICE', label: 'SERVICE', group: 'pending' },
  { value: 'MOUNTING', label: 'MOUNTING', group: 'pending' },
  { value: 'RESCHED', label: 'RESCHED', group: 'pending' },
  { value: 'CONTINUATION', label: 'CONTINUATION', group: 'pending' },
  { value: 'FOR_APPROVAL', label: 'FOR QUOTATION', group: 'pending' },
  { value: 'PENDING_APPROVAL', label: 'PENDING APPROVAL', group: 'pending' },
  { value: 'FOR_NEGOTIATION', label: 'FOR NEGOTIATION', group: 'pending' },
  { value: 'FOR_COLLECTION', label: 'FOR COLLECTION', group: 'pending' },
  { value: 'SYSTEM_REPROCESS', label: 'SYSTEM REPROCESS', group: 'pending' },
  { value: 'DISMANTLE', label: 'DISMANTLE', group: 'pending' },
  // Closing
  { value: 'DONE_INSTALLED', label: 'DONE INSTALL', group: 'closing' },
  { value: 'DONE_CLEANING', label: 'DONE CLEANING', group: 'closing' },
  { value: 'DONE_SURVEY', label: 'DONE SURVEY', group: 'closing' },
  { value: 'DONE_CHECKUP', label: 'DONE CHECKUP', group: 'closing' },
  { value: 'DONE_BACKJOB', label: 'DONE BACKJOB', group: 'closing' },
  { value: 'DONE_SERVICE', label: 'DONE SERVICE', group: 'closing' },
  { value: 'DONE_MOUNTING', label: 'DONE MOUNTING', group: 'closing' },
  { value: 'DONE_NEGOTIATION', label: 'DONE NEGOTIATION', group: 'closing' },
  { value: 'DONE_SYSTEM_REPROCESS', label: 'DONE SYSTEM REPROCESS', group: 'closing' },
  { value: 'DONE_DISMANTLE', label: 'DONE DISMANTLE', group: 'closing' },
  { value: 'DONE_QUOTATION', label: 'DONE QUOTATION', group: 'closing' },
  { value: 'CANCELLED', label: 'CANCELLED', group: 'closing' },
]

export const SCHEDULE_PENDING_OPTS = SCHEDULE_STATUS_OPTS.filter(o => o.group === 'pending')
export const SCHEDULE_CLOSING_OPTS = SCHEDULE_STATUS_OPTS.filter(o => o.group === 'closing')
export const CLOSING_SCHEDULE_STATUSES = new Set([
  'DONE_INSTALLED', 'DONE_CLEANING', 'DONE_SURVEY', 'DONE_CHECKUP', 'DONE_BACKJOB', 'DONE_SERVICE', 'DONE_MOUNTING',
  'DONE_NEGOTIATION', 'DONE_SYSTEM_REPROCESS', 'DONE_DISMANTLE', 'DONE_QUOTATION',
])
export const SCHEDULE_PENDING_STATUS_VALUES = new Set(SCHEDULE_PENDING_OPTS.map(o => o.value))
export const SCHEDULE_CLOSING_STATUS_VALUES = new Set(SCHEDULE_CLOSING_OPTS.map(o => o.value))

export function statusShowsScheduleDetails(_statusVal?: string): boolean {
  return true
}

export function getScheduleTicketKind(ticket: Ticket): string {
  const kind = inferCategoryFromTicket(ticket) as string
  if (kind === 'SURVEY' || kind === 'SERVICES' || kind === 'SURVEY & INSTALL' || kind === 'S/I' || kind === 'INSTALL' || kind === 'CLEANING' || kind === 'CHECKUP' || kind === 'BACKJOB') return kind
  return 'INSTALL'
}

export function getScheduleStatusBadgeStyle(value: string, isLight: boolean, isOverdue = false): { color: string; backgroundColor: string; borderColor: string } {
  if (isOverdue) {
    return { color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.35)', borderColor: '#ffffff' }
  }
  const normalized = value.toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'INSTALLATION' || normalized === 'INSTALL' || normalized === 'SCHEDULED' || normalized === 'S/I' || normalized === 'S_I' || normalized === 'SI') {
    return { color: isLight ? '#15803d' : '#86efac', backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.18)', borderColor: isLight ? '#86efac' : 'rgba(22,163,74,0.35)' }
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
  if (normalized === 'MOUNTING' || normalized === 'DONE_MOUNTING') {
    return { color: isLight ? '#0284c7' : '#38bdf8', backgroundColor: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.16)', borderColor: isLight ? '#7dd3fc' : 'rgba(14,165,233,0.35)' }
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
  if (normalized === 'FOR_NEGOTIATION') {
    return { color: isLight ? '#7c3aed' : '#c084fc', backgroundColor: isLight ? '#f3e8ff' : 'rgba(124,58,237,0.18)', borderColor: isLight ? '#c084fc' : 'rgba(124,58,237,0.35)' }
  }
  if (normalized === 'FOR_COLLECTION') {
    return { color: isLight ? '#059669' : '#34d399', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.18)', borderColor: isLight ? '#34d399' : 'rgba(16,185,129,0.35)' }
  }
  if (
    normalized === 'DONE_INSTALLED' ||
    normalized === 'INSTALLED' ||
    normalized === 'COMPLETED' ||
    normalized === 'DONE_CLEANING' ||
    normalized === 'DONE_QUOTATION' ||
    normalized === 'DONE_SERVICE' ||
    normalized === 'DONE_NEGOTIATION'
  ) {
    return { color: isLight ? '#15803d' : '#86efac', backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.18)', borderColor: isLight ? '#86efac' : 'rgba(22,163,74,0.35)' }
  }
  if (normalized === 'SERVICES') {
    return { color: isLight ? '#0e7490' : '#67e8f9', backgroundColor: isLight ? '#cffafe' : 'rgba(6,182,212,0.15)', borderColor: isLight ? '#67e8f9' : 'rgba(6,182,212,0.3)' }
  }
  return { color: isLight ? '#475569' : '#cbd5e1', backgroundColor: isLight ? '#f1f5f9' : 'rgba(148,163,184,0.12)', borderColor: isLight ? '#cbd5e1' : 'rgba(148,163,184,0.3)' }
}

function ticketRemarksText(ticket: Partial<Ticket>, fields?: Partial<Ticket>): string {
  return (
    fields?.remarksUpdate
    || fields?.remarks
    || ticket.remarksUpdate
    || ticket.remarks
    || (ticket as any)?.note
    || ''
  ).trim()
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
    || explicit === 'DONE_MOUNTING'
    || explicit === 'DONE_NEGOTIATION'
    || explicit === 'DONE_SYSTEM_REPROCESS'
    || explicit === 'DONE_DISMANTLE'
    || explicit === 'DONE_QUOTATION'
  ) {
    return explicit as ScheduleOutcome
  }
  const remarks = ticketRemarksText(ticket as Ticket).toLowerCase()
  const stat = String(ticket.status || '').toUpperCase()
  const svc = String(ticket.serviceType || (ticket as any).service_type || '').toLowerCase()
  const cat = String(ticket.ticketCategory || (ticket as any).ticket_category || '').toLowerCase()

  const matchOutcomeText = (text: string): ScheduleOutcome | null => {
    if (/clean/i.test(text)) return 'DONE_CLEANING'
    if (/checkup|check-up/i.test(text)) return 'DONE_CHECKUP'
    if (/backjob|back-job|back job/i.test(text)) return 'DONE_BACKJOB'
    if (/survey/i.test(text)) return 'DONE_SURVEY'
    if (/mount/i.test(text)) return 'DONE_MOUNTING'
    if (/dismantle/i.test(text)) return 'DONE_DISMANTLE'
    if (/quotation/i.test(text)) return 'DONE_QUOTATION'
    if (/system.*reprocess|reprocess/i.test(text)) return 'DONE_SYSTEM_REPROCESS'
    if (/repair|service|maintenance/i.test(text)) return 'DONE_SERVICE'
    if (/install|s[\/_]?i/i.test(text)) return 'DONE_INSTALLED'
    return null
  }

  if (isInstalledWorkflowStatus(stat) || stat.startsWith('DONE') || stat === 'COMPLETED' || stat === 'COMPLETE') {
    // Remarks reflect what the staff actually did just now — check them before falling back to
    // the ticket's service type/category, which can still say "SURVEY" on a combo "Survey &
    // Install" ticket even after the install leg is the one that got completed.
    return matchOutcomeText(remarks) || matchOutcomeText(`${svc} ${cat}`) || 'DONE_SERVICE'
  }
  if (stat === 'SURVEY' && /done.*survey|survey.*done|surveyed/i.test(remarks)) return 'DONE_SURVEY'
  if (stat === 'DONE_SYSTEM_REPROCESS') return 'DONE_SYSTEM_REPROCESS'
  if (stat === 'DONE_DISMANTLE') return 'DONE_DISMANTLE'
  if (stat === 'DONE_NEGOTIATION') return 'DONE_NEGOTIATION'
  return null
}

export function formatSpecificDoneStatus(ticket: Partial<Ticket> | any): string {
  if (!ticket) return 'TICKET'

  const meta = parseAcMeta(ticket as Ticket)
  const explicit = String(meta.scheduleOutcome || ticket.scheduleOutcome || '').toUpperCase().trim()
  if (explicit) {
    if (explicit === 'DONE_INSTALLED' || explicit === 'INSTALLED') return 'INSTALLED'
    if (explicit === 'DONE_CLEANING') return 'DONE CLEANING'
    if (explicit === 'DONE_CHECKUP') return 'DONE CHECKUP'
    if (explicit === 'DONE_BACKJOB') return 'DONE BACKJOB'
    if (explicit === 'DONE_SERVICE') return 'DONE SERVICE'
    if (explicit === 'DONE_MOUNTING') return 'DONE MOUNTING'
    if (explicit === 'DONE_SURVEY') return 'DONE SURVEY'
    if (explicit === 'DONE_DISMANTLE') return 'DONE DISMANTLE'
    if (explicit === 'DONE_QUOTATION') return 'DONE QUOTATION'
    if (explicit === 'DONE_SYSTEM_REPROCESS') return 'DONE SYSTEM REPROCESS'
    if (explicit === 'DONE_NEGOTIATION') return 'DONE NEGOTIATION'
    return explicit.replace(/_/g, ' ')
  }

  const rawStat = String(ticket.status || '').toUpperCase().trim().replace(/\s+/g, '_')
  const svc = String(ticket.serviceType || ticket.service_type || '').toUpperCase().trim()
  const cat = String(ticket.ticketCategory || ticket.ticket_category || '').toUpperCase().trim()
  const phase = String(meta.schedulePhase || '').toUpperCase().trim()
  const remarks = String(ticket.remarksUpdate || ticket.remarks || ticket.description || ticket.title || '').toUpperCase().trim()
  const combined = `${rawStat} ${svc} ${cat} ${phase} ${remarks}`

  const isClosed = rawStat === 'COMPLETED' || rawStat === 'COMPLETE' || rawStat === 'INSTALLED' || rawStat === 'DONE' || rawStat.startsWith('DONE_') || rawStat.startsWith('DONE ')

  if (isClosed) {
    if (combined.includes('CLEAN')) return 'DONE CLEANING'
    if (combined.includes('CHECK')) return 'DONE CHECKUP'
    if (combined.includes('BACKJOB') || combined.includes('BACK JOB') || combined.includes('BACK-JOB')) return 'DONE BACKJOB'
    if (combined.includes('MOUNT')) return 'DONE MOUNTING'
    if (combined.includes('DISMANTLE')) return 'DONE DISMANTLE'
    if (combined.includes('SURVEY')) return 'DONE SURVEY'
    if (combined.includes('QUOTATION')) return 'DONE QUOTATION'
    if (combined.includes('REPROCESS')) return 'DONE SYSTEM REPROCESS'
    if (combined.includes('REPAIR') || combined.includes('MAINTENANCE') || combined.includes('SERVICE')) return 'DONE SERVICE'
    if (combined.includes('INSTALL') || combined.includes('S/I') || combined.includes('S_I') || combined.includes('SI')) return 'INSTALLED'
    return 'DONE SERVICE'
  }

  if (rawStat === 'CANCELLED' || rawStat === 'CANCEL') return 'CANCELLED'
  if (rawStat === 'RESCHED') return 'RESCHED'
  if (rawStat === 'CONTINUATION') return 'CONTINUATION'
  if (rawStat === 'FOR_APPROVAL' || rawStat === 'FOR QUOTATION') return 'FOR QUOTATION'
  if (rawStat === 'SYSTEM_REPROCESS') return 'SYSTEM REPROCESS'
  if (rawStat === 'DISMANTLE') return 'DISMANTLE'
  if (combined.includes('CLEAN')) return 'CLEANING'
  if (combined.includes('CHECK')) return 'CHECKUP'
  if (combined.includes('BACKJOB') || combined.includes('BACK JOB')) return 'BACKJOB'
  if (combined.includes('MOUNT')) return 'MOUNTING'
  if (combined.includes('SURVEY')) return 'SURVEY'
  if (combined.includes('INSTALL') || combined.includes('S/I')) return 'INSTALL'
  if (combined.includes('SERVICE') || combined.includes('REPAIR')) return 'SERVICE'

  return rawStat ? rawStat.replace(/_/g, ' ') : (svc || 'TICKET')
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
  if (phase === 'MOUNTING') return 'MOUNTING'
  if (phase === 'SYSTEM_REPROCESS') return 'SYSTEM_REPROCESS'
  if (phase === 'DISMANTLE') return 'DISMANTLE'
  if (phase === 'PENDING_APPROVAL') return 'PENDING_APPROVAL'
  if (phase === 'FOR_NEGOTIATION') return 'FOR_NEGOTIATION'
  if (phase === 'DONE_NEGOTIATION') return 'DONE_NEGOTIATION'
  if (phase === 'FOR_COLLECTION') return 'FOR_COLLECTION'

  let stat = (ticket.status || 'SCHEDULED').toUpperCase().replace(/\s+/g, '_')
  if (stat === 'S/I' || stat === 'S_I' || stat === 'SI' || stat === 'INSTALLATION' || stat === 'INSTALL') return 'INSTALL'
  if (stat === 'CHECKUP') return 'CHECKUP'
  if (stat === 'FOR_QUOTATION') stat = 'FOR_APPROVAL'
  if (stat === 'RESCHED') return 'RESCHED'
  if (stat === 'SURVEY') return 'SURVEY'
  if (stat === 'FOR_APPROVAL') return 'FOR_APPROVAL'
  if (stat === 'PENDING_APPROVAL') return 'PENDING_APPROVAL'
  if (stat === 'FOR_NEGOTIATION') return 'FOR_NEGOTIATION'
  if (stat === 'DONE_NEGOTIATION') return 'DONE_NEGOTIATION'
  if (stat === 'FOR_COLLECTION') return 'FOR_COLLECTION'
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
  if (kind === 'SURVEY & INSTALL' || kind === 'S/I' || kind === 'INSTALL' || kind === 'INSTALLATION') return 'INSTALL'
  if (kind === 'CLEANING') return 'CLEANING'
  if (kind === 'CHECKUP') return 'CHECKUP'
  if (kind === 'BACKJOB') return 'BACKJOB'
  return 'INSTALL'
}

export function getScheduleStatusLabel(value: string): string {
  const normalized = value.toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'INSTALLED') return 'INSTALLED'
  if (normalized === 'S/I' || normalized === 'S_I' || normalized === 'SI' || normalized === 'INSTALLATION') return 'INSTALL'
  const found = SCHEDULE_STATUS_OPTS.find(opt => opt.value === normalized)
  return (found?.label ?? value.replace(/_/g, ' ')).toUpperCase()
}

export function getScheduleStatusDisplay(ticket: Ticket): string {
  const val = getScheduleStatusValue(ticket)
  if (val === 'RESCHED') {
    return 'RESCHED'
  }
  return getScheduleStatusLabel(val)
}

export function dedupeMovedToRemark(text: string): string {
  const trimmed = sanitizeDisplayText(text).trim()
  if (!trimmed) return trimmed
  const dup = trimmed.match(/^(Moved to .+?)\s*[·Â·]\s*\1$/i)
  if (dup) return dup[1].trim()
  return trimmed
}

export function isMovedToRescheduleRemark(text: string): boolean {
  return /^Moved to /i.test(text.trim())
}

export function stripArchivedRemarkSuffix(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  return trimmed.replace(/\s*·\s*Archived(?:\s*·\s*.+)?$/i, '').trim()
}

export function getScheduleUpdateDisplay(ticket: Ticket): string {
  const base = sanitizeDisplayText(stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim()))
  if (getScheduleStatusValue(ticket) === 'RESCHED' && isReschedulePending(ticket)) {
    return base || 'PENDING'
  }
  const deduped = dedupeMovedToRemark(base)
  if (isMovedToRescheduleRemark(deduped)) {
    const finalDateKey = getFinalDateKey(ticket)
    if (finalDateKey) {
      const formattedFinalDate = formatDateKeyLabel(finalDateKey)
      const movedToDate = deduped.replace(/^Moved to\s+/i, '').trim()
      if (formattedFinalDate && movedToDate.toLowerCase() === formattedFinalDate.toLowerCase()) {
        return ''
      }
    }
  }
  return deduped
}

export function statusCode(s: string): string {
  return { PENDING: 'P', ASSIGNED: 'A', ON_THE_WAY: 'OTW', IN_PROGRESS: 'IP', COMPLETED: 'C', CANCELLED: 'X' }[s.toUpperCase()] || s.slice(0, 3)
}

export function statusColor(s: string, light: boolean): { text: string; bg: string; b: string } {
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
    case 'MOUNTING':
    case 'DONE_MOUNTING':
      return { text: '#0D9488', bg: light ? '#f0fdfa' : 'rgba(13,148,136,0.15)', b: 'rgba(13,148,136,0.4)' }
    default: return { text: '#94A3B8', bg: 'transparent', b: 'rgba(148,163,184,0.3)' }
  }
}

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
