/** Alphabetical ticket categories shared across portal pages. */

export type TicketCategoryValue =
  | 'ADMIN_TASK'
  | 'CLAIMS'
  | 'HR_TASKS'
  | 'INSTALLATION'
  | 'PARTS_SALES'
  | 'PAYROLL_TASKS'
  | 'QUOTATION'
  | 'REQUEST_FOR_FUND'
  | 'SERVICES'
  | 'SURVEY'
  | 'WTY_REGISTRATION'

export type TicketCategoryOption = {
  value: TicketCategoryValue
  label: string
}

export const ALL_TICKET_CATEGORIES: TicketCategoryOption[] = [
  { value: 'ADMIN_TASK', label: 'Admin task' },
  { value: 'CLAIMS', label: 'Claims' },
  { value: 'HR_TASKS', label: 'HR tasks' },
  { value: 'INSTALLATION', label: 'Installation' },
  { value: 'PARTS_SALES', label: 'Parts Sales' },
  { value: 'PAYROLL_TASKS', label: 'Payroll tasks' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'REQUEST_FOR_FUND', label: 'Request for Fund (RF)' },
  { value: 'SERVICES', label: 'Services' },
  { value: 'SURVEY', label: 'Survey' },
  { value: 'WTY_REGISTRATION', label: 'Wty Registration' },
]

export const FIELD_TICKET_CATEGORIES = ALL_TICKET_CATEGORIES.filter(c =>
  ['INSTALLATION', 'SERVICES', 'SURVEY'].includes(c.value),
)

export const OFFICE_TICKET_CATEGORIES = ALL_TICKET_CATEGORIES.filter(c =>
  !['INSTALLATION', 'SERVICES', 'SURVEY'].includes(c.value),
)

export const OFFICE_STATUS_OPTS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const

export function getCategoryLabel(value?: string | null): string {
  if (!value) return '—'
  const found = ALL_TICKET_CATEGORIES.find(
    c => c.value === value || c.value === value.toUpperCase().replace(/[\s/-]+/g, '_'),
  )
  return found?.label ?? value.replace(/_/g, ' ')
}

export function isFieldCategory(value?: string | null): boolean {
  if (!value) return true
  const upper = value.toUpperCase()
  return upper === 'INSTALLATION' || upper === 'SERVICES' || upper === 'SURVEY'
}

export function isOfficeCategory(value?: string | null): boolean {
  return Boolean(value) && !isFieldCategory(value)
}

export function categoryDefaultServiceType(value: TicketCategoryValue): string {
  const map: Record<TicketCategoryValue, string> = {
    ADMIN_TASK: 'Admin task',
    CLAIMS: 'Claims',
    HR_TASKS: 'HR tasks',
    INSTALLATION: 'SURVEY & INSTALL',
    PARTS_SALES: 'Parts Sales',
    PAYROLL_TASKS: 'Payroll tasks',
    QUOTATION: 'Quotation',
    REQUEST_FOR_FUND: 'Request for Fund (RF)',
    SERVICES: 'Service',
    SURVEY: 'SURVEY',
    WTY_REGISTRATION: 'Wty Registration',
  }
  return map[value]
}

export type ResolvedScheduleStatus = {
  /** Always a valid com.ashcol.model.Ticket.Status constant — safe to send as `status`. */
  status: string
  ticketCategory?: TicketCategoryValue
  serviceType?: string
  schedulePhase?: string
  scheduleOutcome?: string
}

/**
 * Maps a status-picker button value (CHECKUP, INSTALL, BACKJOB, DONE_CHECKUP, ...) to a
 * status the backend's Ticket.Status enum actually has, plus the ticketCategory/serviceType/
 * schedulePhase metadata needed to reconstruct the finer label for display. Ticket.Status has
 * no CHECKUP/INSTALL/BACKJOB/DONE_* constants — those are field-type distinctions carried via
 * ticketCategory + acDetails.schedulePhase/scheduleOutcome, not the status column itself.
 * Sending one of those raw button values straight through as `status` throws
 * "No enum constant com.ashcol.model.Ticket.Status.X" on save.
 */
export function resolveScheduleStatusFields(rawValue: string): ResolvedScheduleStatus {
  const val = (rawValue || '').toUpperCase().replace(/\s+/g, '_')

  switch (val) {
    case 'DONE_CLEANING':
      return { status: 'COMPLETED', ticketCategory: 'SERVICES', scheduleOutcome: 'DONE_CLEANING', schedulePhase: '' }
    case 'DONE_CHECKUP':
      return { status: 'COMPLETED', ticketCategory: 'SERVICES', scheduleOutcome: 'DONE_CHECKUP', schedulePhase: '' }
    case 'DONE_BACKJOB':
      return { status: 'COMPLETED', ticketCategory: 'SERVICES', scheduleOutcome: 'DONE_BACKJOB', schedulePhase: '' }
    case 'DONE_SERVICE':
      return { status: 'COMPLETED', ticketCategory: 'SERVICES', scheduleOutcome: 'DONE_SERVICE', schedulePhase: '' }
    case 'DONE_SURVEY':
      return { status: 'COMPLETED', ticketCategory: 'SURVEY', scheduleOutcome: 'DONE_SURVEY', schedulePhase: '' }
    case 'DONE_INSTALLED':
      return { status: 'INSTALLED', ticketCategory: 'INSTALLATION', scheduleOutcome: 'DONE_INSTALLED', schedulePhase: '' }
    case 'DONE_SYSTEM_REPROCESS':
      return { status: 'DONE_SYSTEM_REPROCESS', ticketCategory: 'SERVICES', scheduleOutcome: 'DONE_SYSTEM_REPROCESS', schedulePhase: '' }
    case 'DONE_DISMANTLE':
      return { status: 'DONE_DISMANTLE', ticketCategory: 'SERVICES', scheduleOutcome: 'DONE_DISMANTLE', schedulePhase: '' }
    case 'DONE_QUOTATION':
      return { status: 'COMPLETED', scheduleOutcome: 'DONE_QUOTATION', schedulePhase: '' }
    case 'SYSTEM_REPROCESS':
      return { status: 'SYSTEM_REPROCESS', ticketCategory: 'SERVICES', serviceType: 'SYSTEM REPROCESS', scheduleOutcome: '', schedulePhase: 'SYSTEM_REPROCESS' }
    case 'DISMANTLE':
      return { status: 'DISMANTLE', ticketCategory: 'SERVICES', serviceType: 'DISMANTLE', scheduleOutcome: '', schedulePhase: 'DISMANTLE' }
    case 'FOR_QUOTATION':
      return { status: 'FOR_APPROVAL', scheduleOutcome: '' }
    case 'CLEANING':
      return { status: 'SCHEDULED', ticketCategory: 'SERVICES', serviceType: categoryDefaultServiceType('SERVICES'), scheduleOutcome: '', schedulePhase: 'CLEANING' }
    case 'CHECKUP':
      return { status: 'SCHEDULED', ticketCategory: 'SERVICES', serviceType: categoryDefaultServiceType('SERVICES'), scheduleOutcome: '', schedulePhase: 'CHECKUP' }
    case 'BACKJOB':
      return { status: 'SCHEDULED', ticketCategory: 'SERVICES', serviceType: categoryDefaultServiceType('SERVICES'), scheduleOutcome: '', schedulePhase: 'BACKJOB' }
    case 'INSTALLATION':
    case 'S/I':
    case 'S_I':
    case 'SI':
    case 'INSTALL':
      return { status: 'SCHEDULED', ticketCategory: 'INSTALLATION', serviceType: categoryDefaultServiceType('INSTALLATION'), scheduleOutcome: '', schedulePhase: 'INSTALLATION' }
    case 'SERVICES':
    case 'SERVICE':
      return { status: 'SCHEDULED', ticketCategory: 'SERVICES', serviceType: categoryDefaultServiceType('SERVICES'), scheduleOutcome: '', schedulePhase: 'SERVICES' }
    case 'SURVEY':
      return { status: 'SURVEY', ticketCategory: 'SURVEY', serviceType: categoryDefaultServiceType('SURVEY'), scheduleOutcome: '', schedulePhase: 'SURVEY' }
    case 'RESCHED':
      return { status: 'RESCHED', scheduleOutcome: '' }
    case 'FOR_APPROVAL':
      return { status: 'FOR_APPROVAL', scheduleOutcome: '' }
    case 'PENDING_APPROVAL':
      return { status: 'PENDING_APPROVAL', scheduleOutcome: '' }
    case 'FOR_NEGOTIATION':
      return { status: 'FOR_NEGOTIATION', scheduleOutcome: '' }
    case 'CONTINUATION':
      return { status: 'CONTINUATION', scheduleOutcome: '' }
    case 'CANCELLED':
      return { status: 'CANCELLED', scheduleOutcome: '' }
    default:
      // Already a plain backend status (PENDING, ASSIGNED, SCHEDULED, ...) — pass through.
      return { status: val }
  }
}

export function inferCategoryFromTicket(ticket: {
  ticketCategory?: string
  ticket_category?: string
  serviceType?: string
  service_type?: string
  title?: string
}): TicketCategoryValue {
  const explicit = (ticket.ticketCategory || ticket.ticket_category || '').toUpperCase()
  if (explicit && ALL_TICKET_CATEGORIES.some(c => c.value === explicit)) {
    return explicit as TicketCategoryValue
  }
  const raw = `${ticket.serviceType || ticket.service_type || ''} ${ticket.title || ''}`.toLowerCase()
  if (raw.includes('survey')) return 'SURVEY'
  if (raw.includes('service') || raw.includes('repair') || raw.includes('clean')) return 'SERVICES'
  if (raw.includes('admin')) return 'ADMIN_TASK'
  if (raw.includes('claim')) return 'CLAIMS'
  if (raw.includes('hr')) return 'HR_TASKS'
  if (raw.includes('parts')) return 'PARTS_SALES'
  if (raw.includes('payroll')) return 'PAYROLL_TASKS'
  if (raw.includes('quotation') || raw.includes('quote')) return 'QUOTATION'
  if (raw.includes('fund') || raw.includes('rf')) return 'REQUEST_FOR_FUND'
  return 'INSTALLATION'
}
