import {
  API_BASE_URL,
  readApiError,
  resolveScopedBranchId,
  type InstallerBranchIndexEntry,
  type BranchStaffOption,
} from './api'
import {
  applyRelayScheduleSyncToPatch,
  mergeRelayScheduleTicketPatch,
  normalizeRelayScheduleTicket,
} from './relayScheduleSync'
import {
  categoryDefaultServiceType,
  resolveScheduleStatusFields,
} from '../constants/ticketCategories'
import { notifyArchiveUpdated } from './ticketArchive'
import type { Ticket, ScheduleOutcome } from './ticketTypes'
import {
  getPreferredDateKey,
  getFinalDateKey,
  getEffectiveScheduleDateKey,
  getPreviousScheduleDates,
  getRescheduleHistoryDates,
  formatDateKeyLabel,
  todayDateKey,
  resolveScheduleCompletionDateKey,
} from './ticketDates'
import {
  getScheduleStatusValue,
  getScheduleOutcome,
  isMovedToRescheduleRemark,
  stripArchivedRemarkSuffix,
  SCHEDULE_STATUS_OPTS,
  getScheduleUpdateDisplay,
} from './scheduleStatus'
import {
  getF,
  formatAddress,
  parseDistrict,
  parseBrand,
  getInstallerDisplay,
  getTicketNegotiatorName,
  getTicketDriverDisplay,
  getTicketVehicleDisplay,
  getTicketCommitDisplay,
  getTicketNumberDisplay,
  formatRelayTicketTypeShort,
  formatServiceDriver,
  normalizeDriverInput,
} from './ticketDisplay'
import {
  ticketMatchesDateKey,
  isScheduleGhostOnDate,
  ticketBelongsOnScheduleBranch,
  qualifiesForInstallComplete,
  getArchivedScheduleDate,
  buildArchiveAcMeta,
} from './scheduleRows'

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

export function mergeAcMeta(ticket: Ticket, updates: Record<string, any>): string {
  const parsed = parseAcMeta(ticket)
  if (Array.isArray(parsed)) {
    const next = parsed.length ? [...parsed] : [{}]
    next[0] = { ...(next[0] || {}), ...updates }
    return JSON.stringify(next)
  }
  return JSON.stringify({ ...(parsed || {}), ...updates })
}

export function ticketHasRescheduleMeta(ticket: Ticket): boolean {
  if ((ticket.status || '').toUpperCase() === 'RESCHED') return true
  if (getScheduleStatusValue(ticket) === 'RESCHED') return true
  if (parseAcMeta(ticket).reschedulePending === true || String(parseAcMeta(ticket).reschedulePending).toLowerCase() === 'true') return true
  if (getPreviousScheduleDates(ticket).length > 0) return true
  const meta = parseAcMeta(ticket)
  if (String(meta.rescheduledTo || '').trim()) return true
  const remarks = (ticket.remarksUpdate || ticket.remarks || '').trim()
  return isMovedToRescheduleRemark(remarks)
}

export function clearRescheduleMetaInto(
  ticket: Ticket,
  body: Record<string, unknown>,
  acUpdates: Record<string, unknown>,
): void {
  if (!ticketHasRescheduleMeta(ticket)) return

  acUpdates.rescheduledTo = ''
  acUpdates.reschedulePending = false

  const remarks = (ticket.remarksUpdate || ticket.remarks || '').trim()
  if (isMovedToRescheduleRemark(remarks) || /^PENDING$/i.test(remarks)) {
    body.remarks = ''
    body.remarksUpdate = ''
    acUpdates.update = ''
    acUpdates.remarksUpdate = ''
  }

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
  } else if (val === 'DONE_MOUNTING') {
    setClosing('DONE_MOUNTING')
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
  } else if (val === 'MOUNTING') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'MOUNTING'
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
  } else if (val === 'FOR_NEGOTIATION') {
    body.status = 'FOR_NEGOTIATION'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'DONE_NEGOTIATION') {
    body.status = 'COMPLETED'
    acUpdates.scheduleOutcome = 'DONE_NEGOTIATION'
  } else if (val === 'FOR_COLLECTION') {
    body.status = 'FOR_COLLECTION'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CONTINUATION') {
    body.status = 'CONTINUATION'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CANCELLED') {
    body.status = 'CANCELLED'
    acUpdates.scheduleOutcome = ''
    const cancelBranch = resolveScopedBranchId(ticket.branchId || ticket.branch_id)
    if (cancelBranch) {
      body.branchId = cancelBranch
      acUpdates.cancelledBranchId = cancelBranch
    }
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
    const resolved = resolveScheduleStatusFields(val)
    body.status = resolved.status
    if (resolved.ticketCategory) body.ticketCategory = resolved.ticketCategory
    if (resolved.serviceType) body.serviceType = resolved.serviceType
    acUpdates.scheduleOutcome = resolved.scheduleOutcome ?? ''
    if (resolved.schedulePhase !== undefined) acUpdates.schedulePhase = resolved.schedulePhase
  }

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

export function normalizeRelayScheduleTicketList(tickets: Ticket[]): Ticket[] {
  return tickets.map(t => normalizeRelayScheduleTicket(t) as Ticket)
}

export function preserveLocalScheduleFields(local: Ticket, server: Ticket): Ticket {
  const normalizedServer = normalizeRelayScheduleTicket(server)
  let next = mergeTicketPatch(local, normalizedServer as unknown as Record<string, unknown>)

  const TERMINAL_STATUSES = new Set(['INSTALLED', 'COMPLETED', 'DONE_DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'CANCELLED'])
  const localStatus = String(local.status || '').toUpperCase()
  const mergedStatus = String(next.status || '').toUpperCase()
  if (TERMINAL_STATUSES.has(localStatus) && !TERMINAL_STATUSES.has(mergedStatus)) {
    next.status = local.status
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
        'schedulePhase', 'scheduleOutcome', 'paymentMode', 'paymentStatus', 'charges', 'amountCharged',
        'finalDate', 'scheduledDate', 'previousScheduleDates', 'rescheduledTo', 'reschedulePending',
        'archivedScheduleDate', 'installedDate', 'cancelledScheduleDate', 'cancelledBranchId',
        'rescheduleHistoryDates',
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
    branchId?: string | null
    email?: string | null
    jobTitle?: string | null
    lineupIndex?: InstallerBranchIndexEntry[]
    driverOnlyNames?: string[]
  },
): Ticket[] {
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

  if (status !== 'INSTALLED' && status !== 'COMPLETED' && status !== 'DONE_DISMANTLE' && status !== 'DONE_SYSTEM_REPROCESS' && !next.scheduleOutcome) {
    if (typeof next.acDetails === 'string') {
      next.acDetails = mergeAcMeta(
        { acDetails: next.acDetails } as Ticket,
        { scheduleOutcome: '' },
      )
    }
  }
  return applyRelayScheduleSyncToPatch(next)
}

export function buildReschedulePatchBody(
  ticket: Ticket,
  options: { newDateKey?: string | null; pending: boolean; remarks?: string },
): Record<string, unknown> {
  const oldDateKey = getEffectiveScheduleDateKey(ticket) || getPreferredDateKey(ticket)
  const body: Record<string, unknown> = { status: 'RESCHED' }
  const acUpdates: Record<string, unknown> = { scheduleOutcome: '' }
  const userRemarks = (options.remarks || '').trim().replace(/^RESCHED PENDING:\s*/i, '')

  if (options.pending) {
    // schedulePhase (SURVEY/CLEANING/CHECKUP/...) must be cleared here — getScheduleStatusValue()
    // reads it before ticket.status, so a leftover phase from before the reschedule keeps the badge
    // showing the old phase (e.g. "SURVEY") forever even though status genuinely saved as RESCHED.
    // Not cleared in the "pick a new date" branch below, since SCHEDULED intentionally keeps the
    // sub-type phase (CLEANING/CHECKUP/BACKJOB/MOUNTING all save as status=SCHEDULED and rely on
    // schedulePhase to show their real badge).
    acUpdates.schedulePhase = ''
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
    body.status = 'SCHEDULED'
    if (oldDateKey && oldDateKey !== newDateKey) {
      const priorHistory = getRescheduleHistoryDates(ticket)
      acUpdates.rescheduleHistoryDates = priorHistory.includes(oldDateKey)
        ? priorHistory
        : [...priorHistory, oldDateKey]
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

export function applyReturnToNegotiatorMyTicketsPatch(
  ticket: Ticket,
  body: Record<string, unknown>,
  acUpdates: Record<string, unknown>,
): void {
  body.status = 'ASSIGNED'
  body.preferredDate = ''
  body.preferred_date = ''
  body.finalDate = ''
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

export function toApiDateTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

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
      body.commitType = v
      break
    case 'INSTALLER':
      body.installerName = v
      body.acDetails = mergeAcMeta(acBase, { installerName: v, installer: v, technicianName: v })
      break
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
        const hasDate = Boolean(
          getFinalDateKey(ticket)
          || getPreferredDateKey(ticket)
          || String(parseAcMeta(ticket).scheduledDate || '').trim(),
        )
        if (hasDate) {
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
