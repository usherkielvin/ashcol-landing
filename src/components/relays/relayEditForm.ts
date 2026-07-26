import { formatBrandCapacityLabel } from '../../utils/warrantyTicketDisplay'
import { ROBINSON_APPLIANCES_RE } from '../../utils/dealer'

export type RelayEditDraft = {
  customerName: string
  controlNumber: string
  robinsonsTransactionId: string
  phoneNumbers: string[]
  dealerName: string
  dealerBranch: string
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
  negotiatorPhone: string
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
  /** Vehicle code only (e.g. "T2") — driver name is tracked separately in driverName. */
  serviceDriver: string
  driverName: string
  finalDate: string
  scheduleStatus: string
  reschedulePending: boolean
  remarks: string
  commitTerms: string
}

type TicketLike = {
  customerName?: string
  controlNumber?: string
  contactPhone?: string
  dealer?: string
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
  installation_charges?: number
  modeOfPayment?: string
  mode_of_payment?: string
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
  driverName?: string
  driver_name?: string
  finalDate?: string
  final_date?: string
  remarks?: string
  reschedulePending?: boolean
  commitTerms?: string
}

type ParsedStore = { store: string; branch: string; customStore?: string }

type BranchRef = { id: string }

export function buildRelayEditDraft(
  ticket: TicketLike,
  parseDealer: (dealer?: string) => ParsedStore,
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

  const parsedDealer = parseDealer(ticket.dealer || ticket.sourceVendor)
  const openedDealerName = parsedDealer.store === 'Other' && parsedDealer.customStore
    ? parsedDealer.customStore
    : parsedDealer.store === 'Robinsons'
    ? 'ROBINSON APPLIANCES'
    : parsedDealer.store === 'Abenson'
    ? 'ABENSONS'
    : parsedDealer.store

  const isRobinsons = ROBINSON_APPLIANCES_RE.test(openedDealerName)
  const hasRobinsonsTxId = parsedDetails.robinsonsTransactionId !== undefined

  const robinsonsTxId = hasRobinsonsTxId
    ? (parsedDetails.robinsonsTransactionId || '')
    : (isRobinsons ? (ticket.controlNumber || '') : '')

  const ctrlNumber = hasRobinsonsTxId
    ? (ticket.controlNumber || '')
    : (isRobinsons ? '' : (ticket.controlNumber || ''))

  const phonesList = [ticket.contactPhone || '']
    .concat(parsedDetails.alternatePhone
      ? parsedDetails.alternatePhone.split(',').map((s: string) => s.trim())
      : [])
    .filter(Boolean)

  return {
    customerName: ticket.customerName || '',
    controlNumber: ctrlNumber,
    robinsonsTransactionId: robinsonsTxId,
    phoneNumbers: phonesList.length ? phonesList : [''],
    dealerName: openedDealerName,
    dealerBranch: parsedDealer.branch,
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
    negotiatorPhone: String(parsedDetails.negotiatorPhone || (ticket as any).negotiatorPhone || (ticket as any).negotiator_phone || (ticket as any).negotiatorContact || (ticket as any).negotiator_contact || ''),
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
    modeOfPayment: ticket.modeOfPayment || ticket.mode_of_payment || 'NO_PAYMENT',
    images: ticket.images || '',
    priorityTag: ticket.priorityTag || '',
    ticketNumber: ticket.ticketNumber || ticket.ticket_number || '',
    ticketCategory: ticket.ticketCategory || ticket.ticket_category || 'INSTALLATION',
    serviceDriver: ticket.serviceVehicle || ticket.serviceDriver || ticket.service_driver || '',
    driverName: ticket.driverName || ticket.driver_name || parsedDetails.driverName || '',
    finalDate: parsedDetails.finalDate || ticket.finalDate || ticket.final_date || '',
    scheduleStatus: ticket.status || 'INSTALLATION',
    reschedulePending: Boolean(parsedDetails.reschedulePending),
    remarks: ticket.remarks || ticket.remarksUpdate || '',
    commitTerms: ticket.commitType || ticket.commitTerms || '',
    ...extensions,
  }
}
