import type { TicketCategoryValue } from '../constants/ticketCategories'
import type { RelayEditDraft } from '../components/relays/relayEditForm'
import { combineStoreVendor } from './parseStoreVendor'

export type TicketEditSurface = 'relay' | 'schedules' | 'my-tickets' | 'overview'

export type ScheduleEditFormShape = {
  id?: string
  preferredDate?: string
  finalDate?: string
  customerName?: string
  contactPhone?: string
  location?: string
  district?: string
  commitTerms?: string
  unitType?: string
  sourceVendor?: string
  serviceDriver?: string
  driverName?: string
  installerName?: string
  negotiatorId?: string
  branchId?: string
  ticketNumber?: string
  controlNumber?: string
  ticketCategory?: TicketCategoryValue
  status?: string
  installationCharges?: number
  modeOfPayment?: string
  remarks?: string
  acDetails?: string
  rescheduleToDate?: string
  reschedulePending?: boolean
}

/** Map unified relay+field draft back into Tickets.tsx edit form for PATCH pipeline. */
export function mapRelayDraftToScheduleEditForm(
  draft: RelayEditDraft,
  base: ScheduleEditFormShape,
): ScheduleEditFormShape {
  const isBuiltInStore = draft.storeVendor === 'Robinsons' || draft.storeVendor === 'Abenson' || draft.storeVendor === 'Direct'
  const resolvedStore = isBuiltInStore
    ? combineStoreVendor(draft.storeVendor as 'Robinsons' | 'Abenson' | 'Direct', draft.storeBranch)
    : (draft.storeBranch ? `${draft.storeVendor} - ${draft.storeBranch}` : draft.storeVendor)

  const contactPhone = (draft.phoneNumbers[0] || '').trim()
  const remarksCombined = (draft.remarks || draft.remarksUpdate || '').trim()

  return {
    ...base,
    customerName: draft.customerName,
    contactPhone,
    location: draft.location,
    district: draft.district,
    commitTerms: draft.commitType || draft.commitTerms || base.commitTerms,
    unitType: draft.brandHp || draft.unitType || base.unitType,
    sourceVendor: resolvedStore || base.sourceVendor || 'Direct',
    serviceDriver: draft.serviceDriver !== undefined ? draft.serviceDriver : base.serviceDriver,
    driverName: draft.driverName !== undefined ? draft.driverName : base.driverName,
    installerName: draft.installerName !== undefined ? draft.installerName : base.installerName,
    negotiatorId: draft.assignTechId !== undefined ? draft.assignTechId : base.negotiatorId,
    branchId: draft.assignBranchId !== undefined ? draft.assignBranchId : base.branchId,
    ticketNumber: draft.ticketNumber !== undefined ? draft.ticketNumber : base.ticketNumber,
    controlNumber: draft.controlNumber !== undefined ? draft.controlNumber : base.controlNumber,
    ticketCategory: (draft.ticketCategory || base.ticketCategory || 'INSTALLATION') as TicketCategoryValue,
    status: draft.scheduleStatus || draft.updateStatus || base.status,
    preferredDate: draft.finalDate || draft.preferredDate || base.preferredDate,
    finalDate: draft.finalDate !== undefined ? draft.finalDate : base.finalDate,
    installationCharges: draft.installationCharges ?? base.installationCharges,
    modeOfPayment: draft.modeOfPayment !== undefined ? draft.modeOfPayment : base.modeOfPayment,
    remarks: remarksCombined !== undefined ? remarksCombined : base.remarks,
    rescheduleToDate: draft.rescheduleToDate !== undefined ? draft.rescheduleToDate : base.rescheduleToDate,
    reschedulePending: draft.reschedulePending ?? base.reschedulePending,
  }
}
