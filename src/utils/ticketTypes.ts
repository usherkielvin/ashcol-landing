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
  diser?: string
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
  finalDate?: string
  final_date?: string
  paymentStatus?: string
  paymentMode?: string
  source?: string
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

export type ScheduleOutcome =
  | 'DONE_INSTALLED'
  | 'DONE_CLEANING'
  | 'DONE_SURVEY'
  | 'DONE_CHECKUP'
  | 'DONE_BACKJOB'
  | 'DONE_SERVICE'
  | 'DONE_MOUNTING'
  | 'DONE_NEGOTIATION'
  | 'DONE_SYSTEM_REPROCESS'
  | 'DONE_DISMANTLE'
  | 'DONE_RELOCATED'
  | 'DONE_QUOTATION'

export type ScheduleStatusGroup = 'pending' | 'closing'

export type ScheduleGhostKind = 'completed' | 'resched' | 'cancelled' | 'historical' | 'continuation' | null

export type PaymentBreakdownEntry = { mode: string; amount: number }

export type PendingTicketSave = {
  body: Record<string, unknown>
  rollback: Ticket
  afterSave?: () => Promise<void>
  lookupRetried?: boolean
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

export type TicketsSurface = 'my-tickets' | 'schedules' | 'search'
