/**
 * Shared relay ↔ schedules ticket sync (one row, matching status/dates/customer).
 */

export type RelayScheduleTicket = any

function syncAlias(ticket: RelayScheduleTicket, camel: string, snake: string): void {
  const c = ticket[camel]
  const s = ticket[snake]
  if (c === s) return

  const cVal = typeof c === 'string' ? c.trim() : c
  const sVal = typeof s === 'string' ? s.trim() : s

  const hasC = cVal !== undefined && cVal !== null && cVal !== ''
  const hasS = sVal !== undefined && sVal !== null && sVal !== ''

  if (hasC && !hasS) {
    ticket[snake] = c
  } else if (hasS && !hasC) {
    ticket[camel] = s
  } else {
    const val = c !== undefined ? c : s
    ticket[camel] = val
    ticket[snake] = val
  }
}


export function readFinalDateFromAc(acDetails?: string | null): string {
  if (!acDetails?.trim()) return ''
  try {
    const parsed = JSON.parse(acDetails)
    const obj = Array.isArray(parsed)
      ? parsed.find(item => item && typeof item === 'object' && !Array.isArray(item))
      : parsed
    const raw = String(obj?.finalDate || obj?.final_date || '').trim()
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
    const obj = Array.isArray(parsed)
      ? parsed.find(item => item && typeof item === 'object' && !Array.isArray(item))
      : parsed
    const finalDate = resolveRelayFinalDate(ticket)
      || String(obj?.finalDate || obj?.final_date || '').trim().split('T')[0].split(' ')[0]
    return { ...fallback, ...obj, finalDate }
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
  if (acDetails?.trim()) {
    try {
      const parsed = JSON.parse(acDetails)
      if (Array.isArray(parsed)) {
        const next = parsed.length ? [...parsed] : [{}]
        next[0] = { ...(next[0] || {}), ...updates }
        return JSON.stringify(next)
      } else if (parsed && typeof parsed === 'object') {
        return JSON.stringify({ ...parsed, ...updates })
      }
    } catch { /* ignore */ }
  }
  return JSON.stringify(updates)
}

/** Align relay + schedules fields on a ticket row (after fetch or save). */
import { sanitizeDisplayText } from './textSanitize'

const TICKET_TEXT_FIELDS = [
  'remarks', 'remarksUpdate', 'remarks_update',
  'serviceVehicle', 'service_vehicle',
  'installer', 'installerName', 'installer_name',
  'assignedEmployeeName', 'assigned_employee_name',
  'modeOfPayment', 'mode_of_payment', 'note',
  'commitType', 'commitTerms', 'description',
  'sourceVendor', 'source_vendor',
] as const

function sanitizeTicketTextFields(ticket: Record<string, unknown>): void {
  for (const key of TICKET_TEXT_FIELDS) {
    const v = ticket[key]
    if (typeof v === 'string') ticket[key] = sanitizeDisplayText(v)
  }
}

export function normalizeRelayScheduleTicket(ticket: any): any {
  const next = { ...ticket }
  sanitizeTicketTextFields(next)
  syncAlias(next, 'customerName', 'customer_name')
  syncAlias(next, 'preferredDate', 'preferred_date')
  syncAlias(next, 'negotiatorId', 'negotiator_id')
  syncAlias(next, 'acDetails', 'ac_details')
  syncAlias(next, 'ticketNumber', 'ticket_number')
  syncAlias(next, 'remarksUpdate', 'remarks_update')
  syncAlias(next, 'sourceVendor', 'source_vendor')
  syncAlias(next, 'installationCharges', 'installation_charges')
  syncAlias(next, 'modeOfPayment', 'mode_of_payment')
  syncAlias(next, 'driverName', 'driver_name')
  syncAlias(next, 'serviceVehicle', 'service_vehicle')

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

  const preferred = String(
    next.preferredDate
    || next.preferred_date
    || (ticket ? (ticket.preferredDate || ticket.preferred_date) : '')
    || ''
  ).trim().split('T')[0]
  const scheduleDate = finalDate || preferred

  if (scheduleDate) {
    if (!finalDate) next.finalDate = scheduleDate
    
    const currentPreferred = String(next.preferredDate || next.preferred_date || '').trim()
    if (!preferred) {
      next.preferredDate = scheduleDate
      next.preferred_date = scheduleDate
    } else if (currentPreferred) {
      next.preferredDate = currentPreferred
      next.preferred_date = currentPreferred
    }

    const acBase = typeof next.acDetails === 'string'
      ? next.acDetails
      : String(ticket?.acDetails || ticket?.ac_details || '')
    next.acDetails = mergeAcJson(acBase, { finalDate: scheduleDate, scheduledDate: scheduleDate })

    const stat = String(next.status || ticket?.status || '').toUpperCase()
    if (!next.status && ['PENDING', 'ASSIGNED'].includes(stat)) {
      next.status = 'SCHEDULED'
    }
  }

  if ('driverName' in next || 'driver_name' in next) {
    const val = next.driverName !== undefined ? next.driverName : next.driver_name
    next.driverName = val
    next.driver_name = val
  }
  if ('serviceVehicle' in next || 'service_vehicle' in next) {
    const val = next.serviceVehicle !== undefined ? next.serviceVehicle : next.service_vehicle
    next.serviceVehicle = val
    next.service_vehicle = val
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

/**
 * Does this ticket reference `dateKey` in ANY of its schedule date fields — top-level
 * final/preferred, or acDetails finalDate/scheduledDate/archivedScheduleDate/installedDate,
 * or the previousScheduleDates ghost history. Unlike resolveRelayScheduleDateKey (which picks a
 * single "primary" date), this answers "does the ticket still belong on this date at all", so a
 * cross-tab cache sync never evicts a row from a date it legitimately still sits on just because
 * a different field became its primary (e.g. a rescheduled ticket that keeps a ghost row, or a
 * row whose finalDate momentarily dropped so the primary fell back to a stale preferredDate).
 */
export function ticketReferencesScheduleDate(ticket: RelayScheduleTicket, dateKey: string): boolean {
  const target = String(dateKey || '').trim().split('T')[0].split(' ')[0]
  if (!target) return false
  const norm = (v: unknown) => String(v || '').trim().split('T')[0].split(' ')[0]
  if (norm(ticket.finalDate) === target || norm(ticket.final_date) === target) return true
  if (norm(ticket.preferredDate) === target || norm(ticket.preferred_date) === target) return true
  try {
    const acRaw = ticket.acDetails || ticket.ac_details
    const ac = typeof acRaw === 'string' ? JSON.parse(acRaw) : acRaw
    const meta = Array.isArray(ac) ? ac[0] : ac
    if (meta && typeof meta === 'object') {
      for (const k of ['finalDate', 'scheduledDate', 'archivedScheduleDate', 'installedDate']) {
        if (norm((meta as Record<string, unknown>)[k]) === target) return true
      }
      const prev = (meta as Record<string, unknown>).previousScheduleDates
      if (Array.isArray(prev) && prev.some(d => norm(d) === target)) return true
      const cont = (meta as Record<string, unknown>).continuationDates
      if (Array.isArray(cont) && cont.some(d => norm(d) === target)) return true
    }
  } catch {
    /* ignore malformed acDetails */
  }
  return false
}

/** Primary schedule date for cache placement (final → scheduled → preferred). */
export function resolveRelayScheduleDateKey(ticket: any): string {
  const normalized = normalizeRelayScheduleTicket(ticket)
  const final = String(normalized.finalDate || normalized.final_date || '').trim().split('T')[0].split(' ')[0]
  if (final) return final
  try {
    const acRaw = normalized.acDetails || normalized.ac_details
    const ac = typeof acRaw === 'string' ? JSON.parse(acRaw) : acRaw
    const meta = Array.isArray(ac) ? ac[0] : ac
    const scheduled = String(meta?.scheduledDate || '').trim().split('T')[0].split(' ')[0]
    if (scheduled) return scheduled
  } catch {
    /* ignore malformed acDetails */
  }
  const preferred = String(normalized.preferredDate || normalized.preferred_date || '').trim().split('T')[0].split(' ')[0]
  return preferred
}

export function shouldExcludeRelayFromTab(ticket: RelayScheduleTicket): boolean {
  if (hasRelayLeftQueue(ticket)) return true
  const stat = String(ticket.status || '').toUpperCase()
  if (stat === 'COMPLETED' || stat === 'CANCELLED') return true
  return false
}
