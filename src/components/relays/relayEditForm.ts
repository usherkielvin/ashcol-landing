import { formatBrandCapacityLabel } from '../../utils/warrantyTicketDisplay'

export type RelayEditDraft = {
  customerName: string
  controlNumber: string
  phoneNumbers: string[]
  storeVendor: string
  storeBranch: string
  location: string
  district: string
  landmarks: string
  brandHp: string
  brand: string
  capacity: string
  sku: string
  serialNumber: string
  serviceType: string
  commitType: string
  unitType: string
  installerName: string
  serviceVehicle: string
  updateStatus: string
  assignBranchId: string
  assignTechId: string
  relayedDate: string
  preferredDate: string
  storeReferralFee: string
  referralRecipient: string
  referralAmount: string
  referralStatus: string
  referralDatePaid: string
  referralReferenceNo: string
  rebatesClaim: string
  rebatesCompany: string
  rebatesAmountDue: string
  rebatesStatus: string
  rebatesReferenceNo: string
  warrantyStatus: string
  warrantyRegisteredBy: string
  remarksUpdate: string
  installationCharges: number
  modeOfPayment: string
  images: string
  priorityTag: string
  /** Field schedules / my-tickets / overview */
  ticketNumber: string
  ticketCategory: string
  serviceDriver: string
  finalDate: string
  scheduleStatus: string
  rescheduleToDate: string
  reschedulePending: boolean
  remarks: string
  commitTerms: string
}

type TicketLike = {
  customerName?: string
  controlNumber?: string
  contactPhone?: string
  sourceVendor?: string
  location?: string
  district?: string
  serviceType?: string
  commitType?: string
  unitType?: string
  installerName?: string
  serviceVehicle?: string
  status?: string
  branchId?: string
  assignedTo?: string
  negotiatorId?: string
  negotiator_id?: string
  preferredDate?: string
  remarksUpdate?: string
  installationCharges?: number
  modeOfPayment?: string
  images?: string
  priorityTag?: string
  acDetails?: string
  createdAt?: string
  storeReferralFee?: number | string
  store_referral_fee?: number | string
  warrantyDocsStatus?: string
  warrantyRegistrationCompleted?: boolean
  warrantyRegistrationCompletedBy?: string
  ticketNumber?: string
  ticket_number?: string
  ticketCategory?: string
  ticket_category?: string
  serviceDriver?: string
  service_driver?: string
  finalDate?: string
  final_date?: string
  remarks?: string
  rescheduleToDate?: string
  reschedulePending?: boolean
  commitTerms?: string
}

type ParsedStore = { store: string; branch: string; customStore?: string }

type BranchRef = { id: string }

export function buildRelayEditDraft(
  ticket: TicketLike,
  parseStoreVendor: (sourceVendor?: string) => ParsedStore,
  resolveBranch?: (branchId?: string) => BranchRef | null,
  extensions?: Partial<RelayEditDraft>,
): RelayEditDraft {
  let parsedDetails: Record<string, string> = {}
  if (ticket.acDetails) {
    try {
      parsedDetails = JSON.parse(ticket.acDetails)
    } catch {
      parsedDetails = {}
    }
  }

  const parsedStore = parseStoreVendor(ticket.sourceVendor)
  const openedStoreVendor = parsedStore.store === 'Other' && parsedStore.customStore
    ? parsedStore.customStore
    : parsedStore.store

  const phonesList = [ticket.contactPhone || '']
    .concat(parsedDetails.alternatePhone
      ? parsedDetails.alternatePhone.split(',').map((s: string) => s.trim())
      : [])
    .filter(Boolean)

  return {
    customerName: ticket.customerName || '',
    controlNumber: ticket.controlNumber || '',
    phoneNumbers: phonesList.length ? phonesList : [''],
    storeVendor: openedStoreVendor,
    storeBranch: parsedStore.branch,
    location: ticket.location || '',
    district: ticket.district || '',
    landmarks: parsedDetails.landmarks || '',
    brandHp: formatBrandCapacityLabel(parsedDetails.brand, parsedDetails.capacity),
    brand: parsedDetails.brand || '',
    capacity: parsedDetails.capacity || '',
    sku: parsedDetails.sku || '',
    serialNumber: parsedDetails.serialNumber || '',
    serviceType: ticket.serviceType || '',
    commitType: ticket.commitType || '',
    unitType: ticket.unitType || '',
    installerName: ticket.installerName || '',
    serviceVehicle: ticket.serviceVehicle || '',
    updateStatus: ticket.status || 'PENDING',
    assignBranchId: resolveBranch?.(ticket.branchId)?.id || ticket.branchId || '',
    assignTechId: ticket.assignedTo || ticket.negotiatorId || ticket.negotiator_id || '',
    relayedDate: parsedDetails.relayedDate || (ticket.createdAt ? ticket.createdAt.split('T')[0] : ''),
    preferredDate: ticket.preferredDate ? ticket.preferredDate.split('T')[0] : '',
    storeReferralFee: String(ticket.storeReferralFee ?? ticket.store_referral_fee ?? ''),
    referralRecipient: String(parsedDetails.referralFeeRecipient || parsedDetails.promodiserName || ''),
    referralAmount: String(parsedDetails.referralFeeAmount || ticket.storeReferralFee || ticket.store_referral_fee || ''),
    referralStatus: String(parsedDetails.referralFeeStatus || ''),
    referralDatePaid: String(parsedDetails.referralFeeDatePaid || ''),
    referralReferenceNo: String(parsedDetails.referralFeeReferenceNo || ''),
    rebatesClaim: String(parsedDetails.forRebatesClaim || 'YES'),
    rebatesCompany: String(parsedDetails.rebatesCompany || ''),
    rebatesAmountDue: String(parsedDetails.rebatesAmountDue || ''),
    rebatesStatus: String(parsedDetails.rebatesStatus || ''),
    rebatesReferenceNo: String(parsedDetails.rebatesReferenceNo || ''),
    warrantyStatus: String(
      parsedDetails.warrantyRegistrationStatus
      || ticket.warrantyDocsStatus
      || (ticket.warrantyRegistrationCompleted ? 'REGISTERED' : ''),
    ),
    warrantyRegisteredBy: String(
      parsedDetails.warrantyRegisteredBy
      || ticket.warrantyRegistrationCompletedBy
      || '',
    ),
    remarksUpdate: '',
    installationCharges: ticket.installationCharges || 0,
    modeOfPayment: ticket.modeOfPayment || '',
    images: ticket.images || '',
    priorityTag: ticket.priorityTag || '',
    ticketNumber: ticket.ticketNumber || ticket.ticket_number || '',
    ticketCategory: ticket.ticketCategory || ticket.ticket_category || 'INSTALLATION',
    serviceDriver: ticket.serviceDriver || ticket.service_driver || '',
    finalDate: parsedDetails.finalDate || ticket.finalDate || ticket.final_date || '',
    scheduleStatus: ticket.status || 'INSTALLATION',
    rescheduleToDate: '',
    reschedulePending: Boolean(parsedDetails.reschedulePending),
    remarks: ticket.remarks || ticket.remarksUpdate || '',
    commitTerms: ticket.commitType || ticket.commitTerms || '',
    ...extensions,
  }
}
