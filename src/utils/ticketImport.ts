import { categoryDefaultServiceType } from '../constants/ticketCategories'
import type { Ticket, ImportUnmatchedRow } from './ticketTypes'
import { parseBrand, getCustomerDisplayName, getF } from './ticketDisplay'
import { normalizeImportPaymentMode } from './ticketPayment'
import { mergeAcMeta } from './ticketPatch'

export function importPhonesMatch(a: string, b: string): boolean {
  const da = (a || '').replace(/\D/g, '')
  const db = (b || '').replace(/\D/g, '')
  if (da.length < 10 || db.length < 10) return false
  const ta = da.length >= 10 ? da.slice(-10) : da
  const tb = db.length >= 10 ? db.slice(-10) : db
  return ta === tb
}

export function importNamesMatch(a: string, b: string): boolean {
  const na = (a || '').toLowerCase().trim()
  const nb = (b || '').toLowerCase().trim()
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

export function importBrandsMatch(rowBrand: string, ticket: Ticket): boolean {
  const rb = (rowBrand || '').trim().toLowerCase()
  const tb = parseBrand(ticket).trim().toLowerCase()
  if (!rb && !tb) return true
  if (!rb || !tb) return false
  return rb === tb || tb.includes(rb) || rb.includes(tb)
}

export function importRowMatchesTicket(row: ImportUnmatchedRow, ticket: Ticket): boolean {
  const status = (ticket.status || '').toUpperCase()
  if (
    status === 'COMPLETED'
    || status === 'CANCELLED'
    || status === 'INSTALLED'
    || status === 'DONE_SYSTEM_REPROCESS'
    || status === 'DONE_DISMANTLE'
  ) return false

  const rowCtrl = (row.controlNo || '').trim().toLowerCase()
  const tCtrl = (ticket.controlNumber || ticket.control_number || '').trim().toLowerCase()
  if (rowCtrl && tCtrl) return rowCtrl === tCtrl

  if (!importNamesMatch(row.name, getCustomerDisplayName(ticket))) return false
  const tPhone = getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
  if (!importPhonesMatch(row.phone, tPhone)) return false
  return importBrandsMatch(row.brand, ticket)
}

export function isUnmatchedImportComplete(item: ImportUnmatchedRow): boolean {
  return Boolean(
    (item.status && item.status.toUpperCase() === 'COMPLETED') ||
    (item.update && item.update.toLowerCase().includes('installed'))
  )
}

export function buildImportCreateRow(
  item: ImportUnmatchedRow,
  importTargetDate?: string,
  options?: { taguigServices?: boolean; branchId?: string; negotiatorId?: string },
): Record<string, unknown> {
  const location = (item.location
    ? (typeof item.location === 'object' ? JSON.stringify(item.location) : item.location)
    : '').trim() || 'No Address Provided'

  const taguigServices = options?.taguigServices === true
  const defaultServiceLabel = taguigServices ? categoryDefaultServiceType('SERVICES') : 'S/I'

  const row: Record<string, unknown> = {
    title: `${item.service || defaultServiceLabel} service`.trim(),
    description: (item.note || item.update || 'Excel imported ticket').trim(),
    customerName: (item.name || 'Unknown Customer').trim(),
    serviceType: taguigServices ? defaultServiceLabel : (item.service || 'S/I'),
    ticketCategory: taguigServices ? 'SERVICES' : 'INSTALLATION',
    unitType: item.brand || 'Split AC',
    location,
    dealer: item.dlr || 'Direct',
    status: importTargetDate ? 'SCHEDULED' : 'PENDING',
  }

  if (importTargetDate) {
    row.preferredDate = importTargetDate
    row.source = 'SCHEDULE_MANUAL'
    row.acDetails = JSON.stringify({
      scheduleOutcome: '',
      finalDate: '',
      scheduledDate: importTargetDate,
      scheduleIntake: true,
    })
  }
  if (options?.branchId) row.branchId = options.branchId
  if (options?.negotiatorId) {
    row.negotiatorId = options.negotiatorId
    row.assignedTo = options.negotiatorId
  }

  if (item.phone?.trim()) row.contactPhone = item.phone.trim()
  if (item.district?.trim()) row.district = item.district.trim()
  if (item.commit?.trim()) row.commitType = item.commit.trim()
  if (item.installer?.trim()) row.installerName = item.installer.trim()
  if (item.service?.trim()) row.serviceVehicle = item.service.trim()
  if (item.update?.trim()) row.remarksUpdate = item.update.trim()
  if (item.charges != null && !Number.isNaN(Number(item.charges))) row.installationCharges = item.charges
  const mode = normalizeImportPaymentMode(item.paymentMode)
  if (mode) row.modeOfPayment = mode
  if (item.controlNo?.trim()) row.controlNumber = item.controlNo.trim()

  return row
}

export function buildPatchImportBody(
  ticket: Ticket,
  updatedFields: Partial<Ticket>,
  importTargetDate?: string,
  assignToUserId?: string,
  branchId?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  const set = (key: string, val: unknown) => {
    if (val !== undefined && val !== null && val !== '') body[key] = val
  }

  set('customerName', updatedFields.customerName)
  set('location', updatedFields.location)
  set('district', updatedFields.district)
  set('contactPhone', updatedFields.contactPhone)
  set('unitType', updatedFields.unitType)
  set('dealer', updatedFields.dealer)
  set('commitType', updatedFields.commitType ?? updatedFields.commitTerms)
  set('serviceVehicle', updatedFields.serviceVehicle)
  set('remarksUpdate', updatedFields.remarksUpdate ?? updatedFields.remarks)
  set('controlNumber', updatedFields.controlNumber)
  set('ticketNumber', (updatedFields as Ticket).ticketNumber)
  set('installerName', updatedFields.installerName)
  set('negotiatorId', (updatedFields as Ticket).negotiatorId)
  if (updatedFields.serviceVehicle) body.serviceType = updatedFields.serviceType || 'S/I'
  if (updatedFields.installationCharges != null) body.installationCharges = updatedFields.installationCharges
  if (updatedFields.modeOfPayment) body.modeOfPayment = updatedFields.modeOfPayment
  if (updatedFields.status) body.status = updatedFields.status
  if (importTargetDate) {
    body.preferredDate = importTargetDate
    body.source = 'SCHEDULE_MANUAL'
    if (!body.status) body.status = 'SCHEDULED'
  }
  if (assignToUserId) body.assignedTo = assignToUserId
  if (branchId) body.branchId = branchId

  let acBase: Ticket = ticket
  if (updatedFields.location) {
    const acDetails = mergeAcMeta(acBase, { destination: updatedFields.location, address: updatedFields.location })
    body.acDetails = acDetails
    acBase = { ...ticket, acDetails }
  }
  if (updatedFields.district) {
    const acDetails = mergeAcMeta(acBase, { district: updatedFields.district })
    body.acDetails = acDetails
    acBase = { ...ticket, acDetails }
  }
  if (updatedFields.unitType) {
    const acDetails = mergeAcMeta(acBase, { brand: updatedFields.unitType, unitType: updatedFields.unitType })
    body.acDetails = acDetails
    acBase = { ...ticket, acDetails }
  }
  if (updatedFields.dealer) {
    const acDetails = mergeAcMeta(acBase, { dealer: updatedFields.dealer, dlr: updatedFields.dealer })
    body.acDetails = acDetails
    acBase = { ...ticket, acDetails }
  }
  if (updatedFields.remarksUpdate || updatedFields.remarks) {
    const remark = updatedFields.remarksUpdate ?? updatedFields.remarks
    body.acDetails = mergeAcMeta(acBase, { update: remark, remarksUpdate: remark })
    acBase = { ...ticket, acDetails: body.acDetails as string }
  }
  if (updatedFields.installerName) {
    body.acDetails = mergeAcMeta(acBase, {
      installerName: updatedFields.installerName,
      installer: updatedFields.installerName,
      technicianName: updatedFields.installerName,
    })
    acBase = { ...ticket, acDetails: body.acDetails as string }
  }
  if (importTargetDate) {
    body.acDetails = mergeAcMeta(acBase, {
      scheduledDate: importTargetDate,
      scheduleIntake: true,
    })
  }

  return body
}
