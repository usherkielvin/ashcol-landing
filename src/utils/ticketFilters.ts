import {
  categoryDefaultServiceType,
  type TicketCategoryValue,
} from '../constants/ticketCategories'
import type { Ticket, TicketsSurface } from './ticketTypes'
import {
  isInstalledWorkflowStatus,
  CLOSING_SCHEDULE_STATUSES,
  getScheduleStatusValue,
} from './scheduleStatus'

export function shouldShowOnMyTickets(ticket: Ticket): boolean {
  const stat = (ticket.status || '').toUpperCase()
  if (isInstalledWorkflowStatus(stat) || stat === 'CANCELLED') return false
  if (['IN_PROGRESS', 'ON_THE_WAY', 'CONTINUATION'].includes(stat)) return false
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

export const INLINE_EDIT_COLUMNS = new Set([
  'INSTALLER', 'NEGOTIATOR', 'COMMIT', 'BRAND', 'DLR', "CUSTOMER'S NAME",
  'FINAL DATE', 'SERVICE', 'UPDATE', 'DESTINATION', 'NOTE',
])

export const DEFAULT_MY_TICKETS_SORT = { column: 'FINAL DATE', direction: 'asc' as const }
export const DEFAULT_SCHEDULE_SORT = { column: 'VEHICLE', direction: 'asc' as const }

export function defaultSortForSchedulesView(isMyTickets: boolean): { column: string; direction: 'asc' | 'desc' } {
  return isMyTickets ? DEFAULT_MY_TICKETS_SORT : DEFAULT_SCHEDULE_SORT
}

export function parseServiceDriverValue(
  raw?: string,
  category: TicketCategoryValue = 'INSTALLATION',
): { serviceType: string; serviceVehicle: string } {
  const val = (raw || '').trim()
  return { serviceType: categoryDefaultServiceType(category), serviceVehicle: val }
}

export function pathnameForSurface(surface: TicketsSurface): string {
  if (surface === 'my-tickets') return '/my-tickets'
  if (surface === 'schedules') return '/schedules'
  return '/search'
}
