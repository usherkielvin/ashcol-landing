/**
 * Shared relay ↔ schedules ticket sync (one row, matching status/dates/customer).
 */

export type RelayScheduleTicket = any

function syncAlias(ticket: RelayScheduleTicket, camel: string, snake: string): void {
  const c = ticket[camel]
  const s = ticket[snake]
  if (typeof c === 'string' && c.trim() && !s) ticket[snake] = c
  if (typeof s === 'string' && s.trim() && !c) ticket[camel] = s
}

export function readFinalDateFromAc(acDetails?: string | null): string {
  if (!acDetails?.trim()) return ''
  try {
    const parsed = JSON.parse(acDetails)
    const raw = String(parsed?.finalDate || parsed?.final_date || '').trim()
    if (!raw) return ''
    return raw.split('T')[0].split(' ')[0].trim()
  } catch {
    return ''
  }
}

export function resolveRelayFinalDate(ticket: RelayScheduleTicket): string {
  const top = String(ticket.finalDate || ticket.final_date || '').trim()
  if (top) return top.split('T')[0].split(' ')[0].trim()
  const ac = String(ticket.acDetails || ticket.ac_details || '')
  return readFinalDateFromAc(ac)
}

export function parseRelayAcDetails(ticket: RelayScheduleTicket) {
  const fallback = {
    finalDate: '',
    schedulePhase: '',
    scheduleOutcome: '',
    scheduleIntake: '',
    scheduledDate: '',
  }
  const ac = String(ticket.acDetails || ticket.ac_details || '')
  if (!ac.trim()) {
    return { ...fallback, finalDate: resolveRelayFinalDate(ticket) }
  }
  try {
    const parsed = JSON.parse(ac)
    const finalDate = resolveRelayFinalDate(ticket)
      || String(parsed?.finalDate || parsed?.final_date || '').trim().split('T')[0].split(' ')[0]
    return { ...fallback, ...parsed, finalDate }
  } catch {
    return { ...fallback, finalDate: resolveRelayFinalDate(ticket) }
  }
}

export function isRelayStoreVendor(ticket: RelayScheduleTicket): boolean {
  const vendor = String(ticket.sourceVendor || '').trim().toLowerCase()
  return Boolean(vendor && vendor !== 'direct' && vendor !== 'other' && !vendor.startsWith('direct '))
}

/** Ticket has left relay negotiator queue and belongs on Schedules. */
export function hasRelayLeftQueue(ticket: RelayScheduleTicket): boolean {
  if (resolveRelayFinalDate(ticket)) return true

  const details = parseRelayAcDetails(ticket)
  const outcome = String(details.scheduleOutcome || '').trim().toUpperCase()
  if (outcome.startsWith('DONE_')) return true

  const phase = String(details.schedulePhase || '').trim().toUpperCase().replace(/\s+/g, '_')
  if (['SURVEY', 'INSTALLATION', 'CLEANING', 'SERVICES', 'SERVICE'].includes(phase)) return true

  const stat = String(ticket.status || '').toUpperCase()
  if (['SURVEY', 'FOR_APPROVAL', 'FOR_QUOTATION', 'RESCHED'].includes(stat)) return true

  if (stat === 'SCHEDULED') {
    const preferred = String(ticket.preferredDate || ticket.preferred_date || '').trim().split('T')[0]
    const negotiator = String(ticket.negotiatorId || ticket.negotiator_id || '').trim()
    if (preferred && negotiator) {
      if (isRelayStoreVendor(ticket) && !resolveRelayFinalDate(ticket)) return false
      return true
    }
  }

  return false
}

function mergeAcJson(acDetails: string | undefined, updates: Record<string, unknown>): string {
  let base: Record<string, unknown> = {}
  if (acDetails?.trim()) {
    try {
      const parsed = JSON.parse(acDetails)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) base = parsed
    } catch { /* ignore */ }
  }
  return JSON.stringify({ ...base, ...updates })
}

/** Align relay + schedules fields on a ticket row (after fetch or save). */
export function normalizeRelayScheduleTicket(ticket: any): any {
  const next = { ...ticket }
  syncAlias(next, 'customerName', 'customer_name')
  syncAlias(next, 'preferredDate', 'preferred_date')
  syncAlias(next, 'negotiatorId', 'negotiator_id')
  syncAlias(next, 'acDetails', 'ac_details')
  syncAlias(next, 'ticketNumber', 'ticket_number')
  syncAlias(next, 'remarksUpdate', 'remarks_update')
  syncAlias(next, 'sourceVendor', 'source_vendor')

  const finalDate = resolveRelayFinalDate(next)
  const stat = String(next.status || '').toUpperCase()
  if (finalDate) {
    next.finalDate = finalDate
    next.final_date = finalDate
    if (!String(next.preferredDate || next.preferred_date || '').trim()) {
      next.preferredDate = finalDate
      next.preferred_date = finalDate
    }
    const ac = String(next.acDetails || next.ac_details || '')
    next.acDetails = mergeAcJson(ac, { finalDate })
    next.ac_details = next.acDetails
    if (['PENDING', 'ASSIGNED'].includes(stat)) {
      next.status = 'SCHEDULED'
    }
  } else {
    const preferred = String(next.preferredDate || next.preferred_date || '').trim().split('T')[0]
    const shouldBackfill = Boolean(
      preferred && (
        ['SCHEDULED', 'RESCHED', 'SURVEY', 'FOR_APPROVAL', 'FOR_QUOTATION'].includes(stat)
        || hasRelayLeftQueue(next)
      ),
    )
    if (shouldBackfill) {
      next.finalDate = preferred
      next.final_date = preferred
      const ac = String(next.acDetails || next.ac_details || '')
      next.acDetails = mergeAcJson(ac, { finalDate: preferred })
      next.ac_details = next.acDetails
      if (stat === 'ASSIGNED') next.status = 'SCHEDULED'
    }
  }

  return next
}

/** Ensure PATCH body keeps relay + schedules columns in sync. */
export function applyRelayScheduleSyncToPatch(
  body: Record<string, unknown>,
  ticket?: RelayScheduleTicket,
): Record<string, unknown> {
  const next = { ...body }

  if (typeof next.customerName === 'string' && next.customerName.trim()) {
    next.customer_name = next.customerName
  }
  if (typeof next.customer_name === 'string' && next.customer_name.trim()) {
    next.customerName = next.customer_name
  }

  const finalDate = String(
    next.finalDate
    || (typeof next.acDetails === 'string' ? readFinalDateFromAc(next.acDetails) : '')
    || (ticket ? resolveRelayFinalDate(ticket) : ''),
  ).trim().split('T')[0]

  const preferred = String(next.preferredDate || next.preferred_date || '').trim().split('T')[0]
  const scheduleDate = finalDate || preferred

  if (scheduleDate) {
    if (!finalDate) next.finalDate = scheduleDate
    next.preferredDate = String(next.preferredDate || next.preferred_date || scheduleDate)
    next.preferred_date = next.preferredDate

    const acBase = typeof next.acDetails === 'string'
      ? next.acDetails
      : String(ticket?.acDetails || ticket?.ac_details || '')
    next.acDetails = mergeAcJson(acBase, { finalDate: scheduleDate })

    const stat = String(next.status || ticket?.status || '').toUpperCase()
    if (!next.status && ['PENDING', 'ASSIGNED'].includes(stat)) {
      next.status = 'SCHEDULED'
    }
  }

  return next
}

export function mergeRelayScheduleTicketPatch(
  ticket: any,
  body: Record<string, unknown>,
): any {
  const syncedBody = applyRelayScheduleSyncToPatch(body, ticket)
  const merged = { ...ticket, ...syncedBody }
  if (typeof syncedBody.acDetails === 'string') {
    merged.acDetails = syncedBody.acDetails
    merged.ac_details = syncedBody.acDetails
  }
  return normalizeRelayScheduleTicket(merged)
}

export function normalizeRelayScheduleTicketList(list: any[]): any[] {
  return list.map(t => normalizeRelayScheduleTicket(t))
}

export function shouldExcludeRelayFromTab(ticket: RelayScheduleTicket): boolean {
  if (hasRelayLeftQueue(ticket)) return true
  const stat = String(ticket.status || '').toUpperCase()
  if (stat === 'COMPLETED' || stat === 'CANCELLED') return true
  return false
}
