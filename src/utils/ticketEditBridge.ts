import type { TicketCategoryValue } from '../constants/ticketCategories'
import type { RelayEditDraft } from '../components/relays/relayEditForm'
import { combineDealerForSave } from './dealer'

export type TicketEditSurface = 'relay' | 'schedules' | 'my-tickets' | 'overview'

export type ScheduleEditFormShape = {
  id?: string
  preferredDate?: string
  finalDate?: string
  actualCompletion?: string
  customerName?: string
  contactPhone?: string
  location?: string
  district?: string
  commitTerms?: string
  unitType?: string
  dealer?: string
  diser?: string
  serviceDriver?: string
  driverName?: string
  installerName?: string
  negotiatorId?: string
  branchId?: string
  ticketNumber?: string
  controlNumber?: string
  robinsonsTransactionId?: string
  ticketCategory?: TicketCategoryValue
  status?: string
  installationCharges?: number
  modeOfPayment?: string
  remarks?: string
  acDetails?: string
  reschedulePending?: boolean
  landmarks?: string
  capacity?: string
  sku?: string
  serialNumber?: string
  relayedDate?: string
  alternatePhone?: string
  storeReferralFee?: string
  referralRecipient?: string
  referralAmount?: string
  referralStatus?: string
  referralDatePaid?: string
  referralReferenceNo?: string
  rebatesClaim?: string
  rebatesCompany?: string
  rebatesAmountDue?: string
  rebatesStatus?: string
  rebatesReferenceNo?: string
  warrantyStatus?: string
  warrantyRegisteredBy?: string
}

/** Map unified relay+field draft back into Tickets.tsx edit form for PATCH pipeline. */
export function mapRelayDraftToScheduleEditForm(
  draft: RelayEditDraft,
  base: ScheduleEditFormShape,
): ScheduleEditFormShape {
  const resolvedDealer = combineDealerForSave(draft.dealerName, draft.dealerBranch)

  const contactPhone = (draft.phoneNumbers[0] || '').trim()
  // draft.remarksUpdate is the "Add New Remark" field the user actually types a fresh update
  // into; draft.remarks is just a read-only mirror of the ticket's last-saved remark shown for
  // context. Preferring draft.remarks here silently discarded every new remark/reschedule reason
  // whenever the ticket already had prior remark text (i.e. almost always).
  const remarksCombined = (draft.remarksUpdate || draft.remarks || '').trim()

  return {
    ...base,
    customerName: draft.customerName,
    contactPhone,
    location: draft.location,
    district: draft.district,
    commitTerms: draft.commitType || draft.commitTerms || base.commitTerms,
    unitType: draft.brandHp || draft.unitType || base.unitType,
    dealer: resolvedDealer || base.dealer || 'Direct',
    diser: draft.diser !== undefined ? draft.diser : base.diser,
    serviceDriver: draft.serviceDriver !== undefined ? draft.serviceDriver : base.serviceDriver,
    driverName: draft.driverName !== undefined ? draft.driverName : base.driverName,
    installerName: draft.installerName !== undefined ? draft.installerName : base.installerName,
    negotiatorId: draft.assignTechId !== undefined ? draft.assignTechId : base.negotiatorId,
    branchId: draft.assignBranchId !== undefined ? draft.assignBranchId : base.branchId,
    ticketNumber: draft.ticketNumber !== undefined ? draft.ticketNumber : base.ticketNumber,
    controlNumber: draft.controlNumber !== undefined ? draft.controlNumber : base.controlNumber,
    robinsonsTransactionId: draft.robinsonsTransactionId !== undefined ? draft.robinsonsTransactionId : base.robinsonsTransactionId,
    ticketCategory: (draft.ticketCategory || base.ticketCategory || 'INSTALLATION') as TicketCategoryValue,
    status: draft.scheduleStatus || draft.updateStatus || base.status,
    preferredDate: draft.finalDate || draft.preferredDate || base.preferredDate,
    finalDate: draft.finalDate !== undefined ? draft.finalDate : base.finalDate,
    actualCompletion: draft.actualCompletion !== undefined ? draft.actualCompletion : base.actualCompletion,
    installationCharges: draft.installationCharges ?? base.installationCharges,
    modeOfPayment: draft.modeOfPayment !== undefined ? draft.modeOfPayment : base.modeOfPayment,
    remarks: remarksCombined !== undefined ? remarksCombined : base.remarks,
    reschedulePending: draft.reschedulePending ?? base.reschedulePending,
    // Fields RelayEditTicketModal exposes (referral fee, rebates, warranty registration,
    // unit details) that ScheduleEditTicketModal has no UI for — carry them through so a
    // save from Tickets.tsx's overview tab doesn't silently discard what the user typed.
    landmarks: draft.landmarks !== undefined ? draft.landmarks : base.landmarks,
    capacity: draft.capacity !== undefined ? draft.capacity : base.capacity,
    sku: draft.sku !== undefined ? draft.sku : base.sku,
    serialNumber: draft.serialNumber !== undefined ? draft.serialNumber : base.serialNumber,
    relayedDate: draft.relayedDate !== undefined ? draft.relayedDate : base.relayedDate,
    alternatePhone: draft.phoneNumbers.slice(1).filter(Boolean).join(', '),
    storeReferralFee: draft.storeReferralFee !== undefined ? draft.storeReferralFee : base.storeReferralFee,
    referralRecipient: draft.referralRecipient !== undefined ? draft.referralRecipient : base.referralRecipient,
    referralAmount: draft.referralAmount !== undefined ? draft.referralAmount : base.referralAmount,
    referralStatus: draft.referralStatus !== undefined ? draft.referralStatus : base.referralStatus,
    referralDatePaid: draft.referralDatePaid !== undefined ? draft.referralDatePaid : base.referralDatePaid,
    referralReferenceNo: draft.referralReferenceNo !== undefined ? draft.referralReferenceNo : base.referralReferenceNo,
    rebatesClaim: draft.rebatesClaim !== undefined ? draft.rebatesClaim : base.rebatesClaim,
    rebatesCompany: draft.rebatesCompany !== undefined ? draft.rebatesCompany : base.rebatesCompany,
    rebatesAmountDue: draft.rebatesAmountDue !== undefined ? draft.rebatesAmountDue : base.rebatesAmountDue,
    rebatesStatus: draft.rebatesStatus !== undefined ? draft.rebatesStatus : base.rebatesStatus,
    rebatesReferenceNo: draft.rebatesReferenceNo !== undefined ? draft.rebatesReferenceNo : base.rebatesReferenceNo,
    warrantyStatus: draft.warrantyStatus !== undefined ? draft.warrantyStatus : base.warrantyStatus,
    warrantyRegisteredBy: draft.warrantyRegisteredBy !== undefined ? draft.warrantyRegisteredBy : base.warrantyRegisteredBy,
  }
}
