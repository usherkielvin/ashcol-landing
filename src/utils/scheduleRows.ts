import { sanitizeDisplayText } from './textSanitize'
import {
  resolveScopedBranchId,
  resolveTicketScheduleBranchId,
  branchScopesMatch,
  isTaguigBranchRef,
  isTaguigServicesScope,
  type InstallerBranchIndexEntry,
} from './api'
import type { Ticket, ScheduleOutcome, ScheduleGhostKind } from './ticketTypes'
import { parseAcMeta, mergeAcMeta } from './ticketPatch'
import {
  getScheduleOutcome,
  getScheduleStatusValue,
  isInstalledWorkflowStatus,
  CLOSING_SCHEDULE_STATUSES,
  stripArchivedRemarkSuffix,
  dedupeMovedToRemark,
  isMovedToRescheduleRemark,
} from './scheduleStatus'
import {
  getPreferredDateKey,
  getFinalDateKey,
  getEffectiveScheduleDateKey,
  getPreviousScheduleDates,
  getRescheduleHistoryDates,
  getRescheduleTargetDateKey,
  getContinuationDates,
  formatDateKeyLabel,
  getRescheduleSnapshot,
} from './ticketDates'

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

export function ticketMatchesDateKey(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return true
  const isResched = (ticket.status || '').toUpperCase() === 'RESCHED'
  const meta = parseAcMeta(ticket)
  const scheduledDate = String(meta.scheduledDate || '').split('T')[0].split(' ')[0].trim()
  const archived = String(meta.archivedScheduleDate || '').split('T')[0].split(' ')[0].trim()
  const preferred = getPreferredDateKey(ticket)
  const cancelledScheduleDate = String(meta.cancelledScheduleDate || '').split('T')[0].split(' ')[0].trim()
  const finalDate = !isResched ? getFinalDateKey(ticket) : ''
  const dateCandidates = [finalDate, preferred, scheduledDate, archived, cancelledScheduleDate].filter(Boolean)

  for (const candidate of dateCandidates) {
    if (candidate === dateKey) return true
  }
  return false
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
  if (ticket.actualCompletion || (ticket as any).actual_completion) {
    const raw = ticket.actualCompletion || (ticket as any).actual_completion
    return String(raw).split('T')[0].split(' ')[0].trim()
  }
  const status = (ticket.status || '').toUpperCase()
  const outcome = String(meta.scheduleOutcome || '').toUpperCase()
  if (isInstalledWorkflowStatus(status) || outcome === 'DONE_INSTALLED') {
    return getFinalDateKey(ticket) || getPreferredDateKey(ticket) || ''
  }
  return ''
}

export function isCompletedGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  if (!isInstalledWorkflowStatus(ticket.status)) return false

  const currentKey = getEffectiveScheduleDateKey(ticket) || getArchivedScheduleDate(ticket)
  if (currentKey && currentKey === dateKey) return false

  // getArchivedScheduleDate is the single source of truth for "where this completed
  // ticket's ghost belongs" (it already falls back to the last previousScheduleDates
  // entry when archivedScheduleDate itself is empty). Also checking every raw entry in
  // previousScheduleDates here caused a stale duplicate to keep rendering a ghost on the
  // old date even after archivedScheduleDate was corrected to the new one, since a
  // ticket can only reach first-completion once and this array is never pruned on read.
  const sched = getArchivedScheduleDate(ticket)
  return sched === dateKey
}

export function isRescheduledGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  // A closed ticket (completed under any outcome, or cancelled) has no live pending reschedule
  // anymore — without this guard, a stale entry in rescheduleHistoryDates (e.g. a "move to
  // tomorrow" note logged shortly before the ticket was actually closed on a different date)
  // keeps rendering a RESCHED ghost on that old target date forever, even though the ticket is
  // long since done. isCompletedGhostOnDate/isCancelledScheduleGhost (checked before this in
  // getScheduleGhostKind) are the only ghosts a closed ticket should still produce.
  //
  // Exception: a date with a crew snapshot (rescheduleSnapshots) was recorded by an actual
  // reschedule save, not a stray note — that day's RESCHED record must survive the ticket later
  // being completed or cancelled on its new date.
  const stat = String(ticket.status || '').toUpperCase()
  const isClosed = isInstalledWorkflowStatus(stat) || stat.startsWith('DONE') || stat === 'CANCELLED'
  if (isClosed && !getRescheduleSnapshot(ticket, dateKey)) return false
  const currentKey = getEffectiveScheduleDateKey(ticket)
  if (currentKey && currentKey === dateKey) return false
  return getRescheduleHistoryDates(ticket).includes(dateKey)
}

/**
 * DISPLAY-ONLY view of a ticket on `dateKey`: when that date is a RESCHED ghost with a crew
 * snapshot, overlays the installer/driver/vehicle that were dispatched that day, so edits to the
 * active row on the new date don't rewrite the old day's record. Never pass the result to a save
 * path — it's for rendering, sorting, and branch-scoping only.
 */
export function withRescheduleSnapshot(ticket: Ticket, dateKey: string): Ticket {
  if (!dateKey || !isRescheduledGhostOnDate(ticket, dateKey)) return ticket
  const snap = getRescheduleSnapshot(ticket, dateKey)
  if (!snap) return ticket
  const installerName = snap.installerName || ''
  const driverName = snap.driverName || ''
  const serviceVehicle = snap.serviceVehicle || ''
  return {
    ...ticket,
    installerName,
    installer_name: installerName,
    installerId: undefined,
    driverName,
    driver_name: driverName,
    serviceVehicle,
    service_vehicle: serviceVehicle,
    acDetails: mergeAcMeta(ticket, {
      installerName,
      installer: installerName,
      technicianName: installerName,
      driverName,
      driver_name: driverName,
      driver: driverName,
      serviceVehicle,
      service_vehicle: serviceVehicle,
    }),
  } as Ticket
}

export function isContinuationGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  if (isCancelledTicket(ticket)) return false
  if (!getContinuationDates(ticket).includes(dateKey)) return false
  const stat = String(ticket.status || '').toUpperCase()
  // While status is still CONTINUATION the ticket is actively spanning every date in
  // continuationDates — those render as live rows (see ticketBelongsOnScheduleDate), not ghosts.
  if (stat === 'CONTINUATION') return false
  // A ticket can close out (INSTALLED/DONE_*) on only one of its several continuation days —
  // that specific day already renders as a 'completed' ghost via isCompletedGhostOnDate
  // (checked first in getScheduleGhostKind); every OTHER day it spanned still needs its
  // "Continuation" record kept alive here, or the board silently loses that history the moment
  // status moves off CONTINUATION (this used to bail out for any closed ticket entirely, which
  // dropped every continuation day except the one that happened to match the final archive date).
  if (isCompletedGhostOnDate(ticket, dateKey)) return false
  // If the ticket has since been rescheduled back onto a date that also happens to be in
  // continuationDates, that date is the current live row, not a ghost of the old one.
  const currentKey = getEffectiveScheduleDateKey(ticket)
  if (currentKey && currentKey === dateKey) return false
  return true
}

export function isCancelledTicket(ticket: Partial<Ticket> | null | undefined): boolean {
  return (ticket?.status || '').toUpperCase() === 'CANCELLED'
}

export function isCancelledScheduleGhost(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey || !isCancelledTicket(ticket)) return false
  if (ticketMatchesDateKey(ticket, dateKey)) return true
  if (getEffectiveScheduleDateKey(ticket) === dateKey) return true
  if (getPreviousScheduleDates(ticket).includes(dateKey)) return true
  const cancelledScheduleDate = String(parseAcMeta(ticket).cancelledScheduleDate || '')
    .split('T')[0].split(' ')[0].trim()
  return cancelledScheduleDate === dateKey
}

export function isHistoricalScheduleTicket(ticket: Ticket, dateKey?: string): boolean {
  if (!dateKey) return false
  const meta = parseAcMeta(ticket)
  if (meta.isHistorical || meta.supersededBy || meta.nextTicketId) {
    const ownDate = getEffectiveScheduleDateKey(ticket)
    return ownDate === dateKey
  }
  return false
}

export function getScheduleGhostKind(ticket: Ticket, dateKey: string): ScheduleGhostKind {
  if (!dateKey) return null
  if (isCompletedGhostOnDate(ticket, dateKey)) return 'completed'
  if (isCancelledScheduleGhost(ticket, dateKey)) return 'cancelled'
  if (isRescheduledGhostOnDate(ticket, dateKey)) return 'resched'
  if (isContinuationGhostOnDate(ticket, dateKey)) return 'continuation'
  if (isHistoricalScheduleTicket(ticket, dateKey)) return 'historical'
  return null
}

export function isScheduleGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  return isRescheduledGhostOnDate(ticket, dateKey)
    || isCompletedGhostOnDate(ticket, dateKey)
    || isContinuationGhostOnDate(ticket, dateKey)
    || getScheduleGhostKind(ticket, dateKey) === 'cancelled'
}

export function ticketBelongsOnScheduleDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return true
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
  const meta = parseAcMeta(ticket)
  const stored = resolveScopedBranchId(
    resolveTicketScheduleBranchId(ticket, lineupIndex, driverOnlyNames)
    || ticket.branchId
    || ticket.branch_id
    || (typeof meta.cancelledBranchId === 'string' ? meta.cancelledBranchId : '')
    || (typeof meta.branchId === 'string' ? meta.branchId : ''),
  )
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

export function formatGhostRemarks(
  ticket: Ticket,
  ghostKind: ScheduleGhostKind,
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
    return `${normalizedBase} · ${suffix}`
  }
  if (ghostKind === 'continuation') {
    const suffix = 'Continuation'
    if (!base) return suffix
    return base.toLowerCase().includes('continuation') ? base : `${base} · ${suffix}`
  }
  return base
}

export function buildArchiveAcMeta(ticket: Ticket, scheduleDateKey: string, outcome: ScheduleOutcome | null = 'DONE_INSTALLED'): {
  previousScheduleDates: string[]
  archivedScheduleDate: string
  installedDate: string
  scheduleOutcome: string
  continuationDates?: string[]
} {
  const existing = parseAcMeta(ticket)
  const prevDates: string[] = Array.isArray(existing.previousScheduleDates) ? [...existing.previousScheduleDates] : []
  const sched = (scheduleDateKey || getPreferredDateKey(ticket)).split('T')[0].split(' ')[0].trim()
  if (sched && !prevDates.includes(sched)) prevDates.push(sched)

  // `ticket` here is the pre-close snapshot, so if it was still CONTINUATION its effective date
  // is still the day the span started on (that field never advances while status stays
  // CONTINUATION — see commitInlineContinuation). That origin day only lives in continuationDates
  // today if the user happened to include it when picking days in the dialog; fold it in here
  // unconditionally so closing the ticket on a later continuation day can't silently drop the
  // first day's record.
  let continuationDates: string[] | undefined
  if (String(ticket.status || '').toUpperCase() === 'CONTINUATION') {
    const existingContinuation = getContinuationDates(ticket)
    const originDate = getEffectiveScheduleDateKey(ticket)
    continuationDates = (originDate && !existingContinuation.includes(originDate))
      ? [...existingContinuation, originDate]
      : existingContinuation
  }

  return {
    previousScheduleDates: prevDates,
    archivedScheduleDate: sched,
    installedDate: sched,
    scheduleOutcome: outcome || 'DONE_INSTALLED',
    ...(continuationDates ? { continuationDates } : {}),
  }
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
    'DONE_RELOCATED',
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
    || outcome === 'DONE_RELOCATED'
  ) return false
  if (outcome === 'DONE_INSTALLED') return true
  return qualifiesForInstallComplete(ticket, body as Partial<Ticket>)
}

export function getScheduleRowColors(
  ticket: Ticket,
  ghostKind: ScheduleGhostKind,
  isLight: boolean,
  idx: number,
  rowEven: string,
  rowOdd: string,
  isDuplicateName: boolean,
): { baseBg: string; hoverBg?: string; accent?: string } {
  const outcome = getScheduleOutcome(ticket)

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
    if (outcome === 'DONE_RELOCATED') {
      return {
        baseBg: isLight ? '#ffedd5' : 'rgba(234,88,12,0.22)',
        hoverBg: isLight ? '#fed7aa' : 'rgba(234,88,12,0.34)',
        accent: '#EA580C',
      }
    }
    if (outcome === 'DONE_MOUNTING') {
      return {
        baseBg: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.22)',
        hoverBg: isLight ? '#bae6fd' : 'rgba(14,165,233,0.34)',
        accent: '#0284C7',
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

  if (ghostKind === 'continuation') {
    return {
      baseBg: isLight ? '#f3e8ff' : 'rgba(124,58,237,0.22)',
      hoverBg: isLight ? '#e9d5ff' : 'rgba(124,58,237,0.32)',
      accent: '#7C3AED',
    }
  }

  if (ghostKind === 'historical') {
    return {
      baseBg: isLight ? '#f1f5f9' : 'rgba(100,116,139,0.18)',
      hoverBg: isLight ? '#e2e8f0' : 'rgba(100,116,139,0.28)',
      accent: isLight ? '#64748b' : '#94a3b8',
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

  if (outcome === 'DONE_RELOCATED') {
    return {
      baseBg: isLight ? '#fff7ed' : 'rgba(234,88,12,0.28)',
      hoverBg: isLight ? '#ffedd5' : 'rgba(234,88,12,0.38)',
      accent: '#EA580C',
    }
  }

  if (outcome === 'DONE_MOUNTING') {
    return {
      baseBg: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.22)',
      hoverBg: isLight ? '#bae6fd' : 'rgba(14,165,233,0.34)',
      accent: '#0284C7',
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
