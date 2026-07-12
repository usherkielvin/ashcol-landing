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
  if (raw.includes('wty') || raw.includes('warranty')) return 'WTY_REGISTRATION'
  return 'INSTALLATION'
}
