import {
  API_BASE_URL,
  fetchTicketByNumber,
  formatFetchError,
  parseCreatedTicketResponse,
  isNegotiatorCandidate,
  isTaguigBranchRef,
  parseGlobalBranchScope,
  type BranchStaffOption,
} from './api'
import {
  cacheTicketByNumber,
  getTicketByNumber,
  normalizeTicketNumberKey,
} from './ticketNumberStore'
import { EMPTY_CELL, sanitizeDisplayText } from './textSanitize'
import { normalizeRelayScheduleTicket } from './relayScheduleSync'
import {
  categoryDefaultServiceType,
} from '../constants/ticketCategories'
import { formatBrandCapacityLabel, parseBrandFromAcDetails } from './warrantyTicketDisplay'
import type { Ticket, PendingTicketSave, ImportUnmatchedRow } from './ticketTypes'
import { parseAcMeta, mergeTicketPatch } from './ticketPatch'
import { getFinalDateKey } from './ticketDates'
import {
  STATUS_OPTS,
  SCHEDULE_STATUS_OPTS,
  getScheduleUpdateDisplay,
} from './scheduleStatus'
import { normalizeImportPaymentMode } from './ticketPayment'

export function getF(ticket: any, ...keys: string[]): string {
  if (!ticket) return ''
  for (const k of keys) {
    const v = ticket[k]
    if (v != null && typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export function formatAddress(loc: any): string {
  if (!loc) return ''
  if (typeof loc === 'string') {
    const s = loc.trim()
    if (!s) return ''
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const p: any = JSON.parse(s)
        const addr = (p?.address ?? '').trim()
        const region = (p?.region ?? '').trim()
        return addr && region && !addr.toLowerCase().includes(region.toLowerCase())
          ? `${addr}, ${region}` : addr || region || s
      } catch { /* fall through */ }
    }
    return s
  }
  const addr = (loc.address ?? '').trim()
  const region = (loc.region ?? '').trim()
  return addr && region && !addr.toLowerCase().includes(region.toLowerCase())
    ? `${addr}, ${region}` : addr || region || ''
}

export function parseDistrict(loc: any, explicit?: string): string {
  if (explicit) return explicit
  if (!loc) return ''
  if (typeof loc === 'string') {
    try { const p: any = JSON.parse(loc); return p?.district || p?.city || '' } catch { return '' }
  }
  return (loc?.district || loc?.city || '').trim()
}

export function resolveTicketDistrict(ticket: Ticket): string {
  const explicit = (ticket.district || '').trim()
  if (explicit) return explicit
  const parsed = parseDistrict(ticket.location, ticket.district)
  if (parsed) return parsed
  const addr = formatAddress(ticket.location)
  const paren = addr.match(/\(([^)]+)\)\s*$/)
  if (paren?.[1]?.trim()) return paren[1].trim()
  return ''
}

export function isGenericUnitTypeLabel(value?: string | null): boolean {
  const normalized = (value || '').trim().toLowerCase()
  return !normalized
    || normalized === 'split ac'
    || normalized === 'split'
    || normalized === 'ac'
    || normalized === 'window ac'
    || normalized === 'window'
}

export function parseBrand(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const fromAc = parseBrandFromAcDetails(ticket.acDetails || ticket.ac_details)
  const explicitBrand = String(fromAc || meta.brand || meta.unitBrand || '').trim()
  const explicitCap = String(meta.capacity || meta.unitCapacity || meta.hp || '').trim()
  const joined = formatBrandCapacityLabel(explicitBrand, explicitCap)
  if (joined) return joined
  const unit = (ticket.unitType || ticket.unit_type || '').trim()
  if (unit && !isGenericUnitTypeLabel(unit)) return unit
  return joined || unit || ''
}

export function getCustomerDisplayName(ticket: Ticket): string {
  return (getF(ticket, 'customerName', 'customer_name') || ticket.title || '').trim()
}

export function normalizeCustomerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function resolveNegotiatorDisplayName(
  ticket: Ticket,
  employees?: { id: string; name: string }[],
): string {
  const negId = (ticket.negotiatorId || ticket.negotiator_id || '').trim()
  if (negId && employees?.length) {
    const match = employees.find(e => e.id === negId)
    if (match?.name?.trim()) return match.name.trim()
  }
  const meta = parseAcMeta(ticket)
  const fromMeta = String(meta.negotiatorName || meta.negotiator || '').trim()
  if (fromMeta) return fromMeta

  const assignedTo = (ticket.assignedTo || '').trim()
  if (negId && assignedTo && negId === assignedTo) {
    const assignedName = (
      ticket.assignedEmployeeName
      || ticket.assigned_employee_name
      || (ticket as Ticket & { negotiatorName?: string }).negotiatorName
      || ''
    ).trim()
    if (assignedName) return assignedName
  }
  return ''
}

export function namesMatchLoosely(a: string, b: string): boolean {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (!na || !nb) return false
  if (na === nb) return true
  const fa = na.split(/\s+/)[0]
  const fb = nb.split(/\s+/)[0]
  if (fa.length >= 2 && fb.length >= 2 && fa === fb) return true
  const wordsA = na.split(/\s+/)
  const wordsB = nb.split(/\s+/)
  if (wordsA.some(wa => wa.length >= 2 && wordsB.includes(wa))) return true
  return false
}

export function namesMatchExactly(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\s+/g, ' ')
  const nb = b.trim().toLowerCase().replace(/\s+/g, ' ')
  return !!na && na === nb
}

export function isTicketAssigneeNegotiator(
  ticket: Ticket,
  employees?: BranchStaffOption[],
): boolean {
  const negId = (ticket.negotiatorId || ticket.negotiator_id || '').trim()
  const assignedTo = (ticket.assignedTo || '').trim()
  if (negId && assignedTo && negId === assignedTo) return true
  if (assignedTo && employees?.length) {
    const emp = employees.find(e => e.id === assignedTo)
    if (emp && isNegotiatorCandidate(emp)) return true
  }
  return false
}

export function isNegotiatorInstallerName(
  ticket: Ticket,
  installer: string,
  employees?: BranchStaffOption[],
  _branchId?: string | null,
): boolean {
  const val = installer.trim()
  if (!val) return false

  const meta = parseAcMeta(ticket)
  const ticketNegotiatorNames = [
    resolveNegotiatorDisplayName(ticket, employees),
    String(meta.negotiatorName || meta.negotiator || '').trim(),
  ].filter(Boolean)

  for (const candidate of ticketNegotiatorNames) {
    if (namesMatchExactly(val, candidate)) return true
  }

  const shortNeg = getTicketNegotiatorName(ticket, employees)
  if (shortNeg && namesMatchExactly(val, shortNeg)) return true

  return false
}

export function resolveInstallerFieldRaw(ticket: Ticket): string {
  const direct = sanitizeDisplayText(ticket.installerName || (ticket as any).installer_name || '')
  const meta = parseAcMeta(ticket)
  const fromMeta = sanitizeDisplayText(String(meta.installerName || meta.installer || meta.technicianName || ''))
  return direct || fromMeta
}

export function getInstallerDisplay(
  ticket: Ticket,
  _employees?: BranchStaffOption[],
  _branchId?: string | null,
): string {
  return resolveInstallerFieldRaw(ticket)
}

export function getInstallerSortKey(
  ticket: Ticket,
  employees?: BranchStaffOption[],
  branchId?: string | null,
): string {
  const fromField = getInstallerDisplay(ticket)
  if (fromField) return fromField
  if (isTicketAssigneeNegotiator(ticket, employees)) return ''
  const assigned = (ticket.assignedEmployeeName || ticket.assigned_employee_name || '').trim()
  if (assigned && !isNegotiatorInstallerName(ticket, assigned, employees, branchId)) return assigned
  return ''
}

export function formatRelayTicketTypeShort(ticket: Ticket): string {
  const phase = String(parseAcMeta(ticket).schedulePhase || '').toUpperCase().replace(/\s+/g, '_')
  if (phase === 'CHECKUP') return 'CHECKUP'
  if (phase === 'BACKJOB') return 'BACKJOB'
  if (phase === 'MOUNTING') return 'MOUNTING'

  const raw = `${ticket.serviceType || ticket.service_type || ''} ${ticket.title || ''}`.toLowerCase()
  if (/collect/.test(raw)) return 'COLLECTION'
  if (/install|s\/i|\bsi\b|survey\s*&\s*install/.test(raw)) return 'SURVEY & INSTALL'
  if (/survey/.test(raw)) return 'SURVEY'
  if (/service|clean/.test(raw)) return 'SERVICE'
  const st = String(ticket.serviceType || ticket.service_type || '').trim()
  if (st) return /install|s\/i/i.test(st) ? 'SURVEY & INSTALL' : st.toUpperCase()
  return 'SURVEY & INSTALL'
}

export function getTicketNumberDisplay(ticket: Ticket): string {
  return String(ticket.ticketNumber || ticket.ticket_number || '').trim()
}

export function isTempTicketId(id: string | undefined | null): boolean {
  if (!id) return false
  return id.startsWith('temp-import-') || id.startsWith('temp-')
}

export function promoteTempTicketState(
  tempId: string,
  realTicket: Ticket,
  pendingSaves: Map<string, PendingTicketSave>,
  activeSaves: Set<string>,
  optimistic: Map<string, Ticket>,
  deleted: Set<string>,
): { ticket: Ticket; shouldFlush: boolean; wasDeleted: boolean } {
  const wasDeleted = deleted.has(tempId)
  deleted.delete(tempId)
  activeSaves.delete(tempId)

  const pending = pendingSaves.get(tempId)
  pendingSaves.delete(tempId)
  optimistic.delete(tempId)

  if (wasDeleted) {
    return { ticket: realTicket, shouldFlush: false, wasDeleted: true }
  }

  if (pending) {
    const merged = mergeTicketPatch(realTicket, pending.body)
    pendingSaves.set(realTicket.id, {
      body: pending.body,
      rollback: realTicket,
      afterSave: pending.afterSave,
    })
    optimistic.set(realTicket.id, merged)
    return { ticket: merged, shouldFlush: true, wasDeleted: false }
  }

  optimistic.set(realTicket.id, realTicket)
  return { ticket: realTicket, shouldFlush: false, wasDeleted: false }
}

export function isTicketNotFoundError(err: unknown): boolean {
  return /ticket not found/i.test(formatFetchError(err))
}

export async function fetchTicketById(authToken: string, ticketId: string): Promise<Ticket | null> {
  if (!ticketId || !authToken || isTempTicketId(ticketId)) return null
  try {
    const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    const ticket = parseCreatedTicketResponse(data) as Ticket | null
    if (!ticket?.id) return null
    return normalizeRelayScheduleTicket(ticket) as Ticket
  } catch {
    return null
  }
}

export async function lookupTicketByNumberOnServer(
  authToken: string,
  ticketNumber: string,
): Promise<Ticket | null> {
  const tn = ticketNumber.trim()
  if (!tn || !authToken) return null
  const upper = normalizeTicketNumberKey(tn)
  const direct = await fetchTicketByNumber(authToken, tn)
  if (direct && typeof direct === 'object') {
    const ticket = normalizeRelayScheduleTicket(direct) as Ticket
    if (ticket?.id) {
      cacheTicketByNumber(ticket as unknown as Record<string, unknown>)
      return ticket
    }
  }
  const urls = [
    `${API_BASE_URL}/tickets/search?q=${encodeURIComponent(tn)}&size=25`,
    `${API_BASE_URL}/tickets?q=${encodeURIComponent(tn)}&size=25`,
    `${API_BASE_URL}/tickets/branch?q=${encodeURIComponent(tn)}&size=25`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!res.ok) continue
      const data = await res.json()
      const list: Ticket[] = data?.data?.tickets || data?.tickets || []
      const exact = list.find(t => normalizeTicketNumberKey(t.ticketNumber || t.ticket_number) === upper)
      if (exact?.id) {
        cacheTicketByNumber(exact as unknown as Record<string, unknown>)
        return exact
      }
      if (list.length === 1 && list[0]?.id) {
        cacheTicketByNumber(list[0] as unknown as Record<string, unknown>)
        return list[0]
      }
    } catch {
      /* try next endpoint */
    }
  }
  return null
}

export function findTicketInListByRef(
  list: Ticket[],
  ticket: Ticket,
  optimistic?: Map<string, Ticket>,
): Ticket | null {
  const byId = list.find(t => t.id === ticket.id) || optimistic?.get(ticket.id)
  if (byId) return byId
  const tn = normalizeTicketNumberKey(ticket.ticketNumber || ticket.ticket_number)
  if (!tn) return null
  const fromStore = getTicketByNumber(tn) as Ticket | null
  if (fromStore?.id) return fromStore
  return list.find(t => normalizeTicketNumberKey(t.ticketNumber || t.ticket_number) === tn) || null
}

export function computeSafePopoverPosition(
  anchor: DOMRect,
  popoverW: number,
  popoverH: number,
  align: 'left' | 'center' | 'right' = 'left',
): { left: number; top: number; width: number } {
  const margin = 8
  const width = Math.min(popoverW, window.innerWidth - margin * 2)
  const height = popoverH
  let left = anchor.left
  if (align === 'right') left = anchor.right - width
  else if (align === 'center') left = anchor.left + anchor.width / 2 - width / 2
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
  let top = anchor.bottom + 4
  if (top + height > window.innerHeight - margin) {
    const above = anchor.top - height - 4
    top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin)
  }
  return { left, top, width }
}

export function normalizeDriverToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '_').replace(/\//g, '_')
}

export function isDriverPlaceholderToken(raw: string): boolean {
  const val = (raw || '').trim()
  if (!val) return true
  const norm = normalizeDriverToken(val)
  const upper = val.toUpperCase()
  if (/^S[\/_]?I(\s|$|[-·•])/i.test(val)) return true
  if (/^SURVEY(\s|&|$|[-·•])/i.test(val)) return true
  if (/^SERVICE(\s|&|$|[-·•])/i.test(val)) return true
  if (/^INSTALL(\s|&|$|[-·•])/i.test(val)) return true
  if (upper.includes('SURVEY') && upper.includes('INSTALL')) return true
  if (/^S[\/_]?I$/i.test(val)) return true
  if (SCHEDULE_STATUS_OPTS.some(opt => opt.value === norm || opt.label.toUpperCase() === upper)) {
    return true
  }
  const placeholders = new Set([
    'INSTALLATION', 'INSTALL', 'INSTALLED', 'SERVICE', 'SERVICES', 'SURVEY', 'CLEANING',
    'RESCHED', 'FOR_APPROVAL', 'FOR_QUOTATION', 'SCHEDULED', 'PENDING', 'ASSIGNED',
    'IN_PROGRESS', 'ON_THE_WAY', 'COMPLETED', 'CANCELLED',
    'DONE_INSTALLED', 'DONE_SURVEY', 'DONE_CLEANING', 'DONE_CHECKUP', 'DONE_BACKJOB',
    'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_DISMANTLE',
    'FREE_INSTALLATION', 'ADMIN_TASK', 'CLAIMS', 'HR_TASKS', 'PARTS_SALES',
    'PAYROLL_TASKS', 'QUOTATION', 'REQUEST_FOR_FUND', 'WTY_REGISTRATION',
    'SURVEY_&_INSTALL', 'SURVEY_AND_INSTALL',
  ])
  return placeholders.has(norm)
}

export function normalizeDriverInput(raw: string): string {
  const trimmed = (raw || '').trim()
  if (!trimmed || isDriverPlaceholderToken(trimmed)) return ''
  return trimmed
}

export function getTicketDriverName(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const candidates = [
    getF(ticket, 'driverName', 'driver_name'),
    getF(ticket, 'serviceVehicle', 'service_vehicle'),
    String(meta.driverName || meta.driver || meta.serviceVehicle || meta.driver_name || ''),
  ]
  for (const c of candidates) {
    const trimmed = sanitizeDisplayText(c)
    if (trimmed && !isDriverPlaceholderToken(trimmed)) return trimmed
  }
  return ''
}

export function formatServiceDriver(ticket: Ticket): string {
  return getTicketDriverName(ticket)
}

export function getTicketDriverDisplay(ticket: Ticket): string {
  const direct = sanitizeDisplayText(getF(ticket, 'driverName', 'driver_name'))
  return direct && !isDriverPlaceholderToken(direct) ? direct : ''
}

export function getTicketVehicleDisplay(ticket: Ticket): string {
  return sanitizeDisplayText(getF(ticket, 'serviceVehicle', 'service_vehicle'))
}

export function parseNameSiteToken(raw: string): { name: string; site: number; label: string } {
  const v = (raw || '').trim()
  if (!v || v === EMPTY_CELL) return { name: '', site: Number.MAX_SAFE_INTEGER, label: '' }
  const m = v.match(/^(.+?)\s*-\s*(\d+)\s*$/i)
  if (m) {
    const label = m[1].trim()
    const baseName = (label.split('/')[0] || label).trim()
    return {
      name: baseName.toUpperCase(),
      site: parseInt(m[2], 10) || 0,
      label,
    }
  }
  const baseName = (v.includes('/') ? v.split('/')[0] : v).trim()
  return { name: baseName.toUpperCase(), site: Number.MAX_SAFE_INTEGER, label: v }
}

export function compareNameSiteStrings(a: string, b: string): number {
  const pa = parseNameSiteToken(a)
  const pb = parseNameSiteToken(b)
  if (!pa.name && !pb.name) return 0
  if (!pa.name) return 1
  if (!pb.name) return -1
  const byName = pa.name.localeCompare(pb.name, undefined, { sensitivity: 'base' })
  if (byName !== 0) return byName
  return pa.site - pb.site
}

export function buildVehicleTripLabels(ticketsList: Ticket[]): Map<string, string> {
  const groups = new Map<string, { ticket: Ticket; explicitSite: number | null }[]>()
  for (const t of ticketsList) {
    if (!t.id) continue
    const raw = getTicketVehicleDisplay(t)
    if (!raw) continue
    const parsed = parseNameSiteToken(raw)
    if (!parsed.name) continue
    const explicitSite = parsed.site === Number.MAX_SAFE_INTEGER ? null : parsed.site
    const arr = groups.get(parsed.name) || []
    arr.push({ ticket: t, explicitSite })
    groups.set(parsed.name, arr)
  }

  const labels = new Map<string, string>()
  for (const [base, entries] of groups) {
    const sorted = [...entries].sort((a, b) => {
      const aPin = a.explicitSite ?? Number.MAX_SAFE_INTEGER
      const bPin = b.explicitSite ?? Number.MAX_SAFE_INTEGER
      if (aPin !== bPin) return aPin - bPin
      const at = a.ticket.createdAt || a.ticket.created_at || ''
      const bt = b.ticket.createdAt || b.ticket.created_at || ''
      if (at && bt && at !== bt) return at.localeCompare(bt)
      const an = a.ticket.ticketNumber || a.ticket.ticket_number || a.ticket.id || ''
      const bn = b.ticket.ticketNumber || b.ticket.ticket_number || b.ticket.id || ''
      return an.localeCompare(bn, undefined, { numeric: true })
    })
    sorted.forEach((e, idx) => {
      labels.set(e.ticket.id, `${base} - ${idx + 1}`)
    })
  }
  return labels
}

export function ticketColumnText(
  ticket: Ticket,
  colLabel: string,
  options?: { myTickets?: boolean; employees?: BranchStaffOption[]; branchId?: string | null; vehicleTripLabels?: Map<string, string> },
): string {
  const myTickets = options?.myTickets ?? false
  const employees = options?.employees
  const branchId = options?.branchId
  switch (colLabel) {
    case 'TICKET NO': return getTicketNumberDisplay(ticket)
    case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title || ''
    case 'DESTINATION': return resolveTicketDistrict(ticket)
    case 'BRAND': return parseBrand(ticket)
    case 'DLR': return getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || ''
    case 'STATUS': return ticket.status || ''
    case 'COMMIT': return getTicketCommitDisplay(ticket)
    case 'FINAL DATE': return getFinalDateKey(ticket)
    case 'INSTALLER': return getInstallerSortKey(ticket, employees, branchId)
    case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, employees)
    case 'SERVICE': return myTickets ? formatRelayTicketTypeShort(ticket) : getTicketDriverDisplay(ticket)
    case 'VEHICLE': return myTickets ? '' : (options?.vehicleTripLabels?.get(ticket.id || '') || getTicketVehicleDisplay(ticket))
    case 'UPDATE': return getScheduleUpdateDisplay(ticket)
    default: return ''
  }
}

export function compareTicketsByColumn(
  a: Ticket,
  b: Ticket,
  colLabel: string,
  options?: { myTickets?: boolean; employees?: BranchStaffOption[]; branchId?: string | null; vehicleTripLabels?: Map<string, string> },
): number {
  const av = ticketColumnText(a, colLabel, options)
  const bv = ticketColumnText(b, colLabel, options)
  if (colLabel === 'INSTALLER' || colLabel === 'SERVICE' || colLabel === 'VEHICLE') {
    return compareNameSiteStrings(av, bv)
  }
  return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
}

export function getTicketNegotiatorName(ticket: Ticket, employees?: { id: string; name: string }[]): string {
  const fullname = resolveNegotiatorDisplayName(ticket, employees)
  if (!fullname) return ''
  let cleanName = fullname.trim()
  cleanName = cleanName.replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '')
  const firstName = cleanName.split(/\s+/)[0]
  return firstName.toUpperCase()
}

export function getTicketCommitDisplay(ticket: Partial<Ticket> | null | undefined): string {
  if (!ticket) return ''
  const raw = getF(ticket as Ticket, 'commitType', 'commitTerms')
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (
    lower === 'service ticket'
    || lower === 'excel imported ticket'
    || lower === 'no additional details provided.'
    || lower === 'no additional details provided'
  ) {
    return ''
  }
  return raw
}

export function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const nums: string[] = []
  let rem = digits
  while (rem.length >= 10) {
    if (rem.startsWith('63') && rem.length >= 12) { nums.push('0' + rem.slice(2, 12)); rem = rem.slice(12) }
    else if (rem.startsWith('09') && rem.length >= 11) { nums.push(rem.slice(0, 11)); rem = rem.slice(11) }
    else if (rem.startsWith('9') && rem.length >= 10) { nums.push('0' + rem.slice(0, 10)); rem = rem.slice(10) }
    else break
  }
  return nums.slice(0, 2).map(n => n.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')).join(' / ')
}

export function getFirstNameUpper(raw?: string | null): string {
  if (!raw || !raw.trim()) return EMPTY_CELL
  let cleaned = raw.trim()
  if (cleaned.includes('@')) {
    cleaned = cleaned.split('@')[0].replace(/[\._]/g, ' ')
  }
  cleaned = cleaned.replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '')
  const firstWord = cleaned.split(/\s+/)[0]
  return firstWord ? firstWord.toUpperCase() : EMPTY_CELL
}

export function parseHistorySpecifics(rawNote?: string | null): {
  title: string
  remarks?: string
  driver?: string
  installer?: string
  dealer?: string
  serviceType?: string
  payment?: string
  controlNo?: string
} {
  if (!rawNote || !rawNote.trim()) return { title: 'Ticket updated' }
  const lines = rawNote.split('\n').map(l => l.trim()).filter(Boolean)
  const specifics: any = { title: lines[0] || 'Ticket updated' }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim().toLowerCase()
    const val = line.slice(colonIdx + 1).trim()
    if (!val) continue
    if (key.includes('remark') || key.includes('update')) specifics.remarks = val
    else if (key.includes('driver')) specifics.driver = val
    else if (key.includes('installer') || key.includes('tech')) specifics.installer = val
    else if (key.includes('dealer') || key.includes('dlr')) specifics.dealer = val
    else if (key.includes('service') || key.includes('type')) specifics.serviceType = val
    else if (key.includes('payment') || key.includes('mode') || key.includes('amount') || key.includes('charge')) specifics.payment = val
    else if (key.includes('control')) specifics.controlNo = val
  }
  return specifics
}

export function getBranchDisplayName(id: string | null): string {
  if (!id || id === 'ALL_BRANCHES') return 'All branches'
  if (isTaguigBranchRef(id)) {
    return parseGlobalBranchScope(id).branchName
  }
  const upper = id.toUpperCase()
  let name = upper.replace(/^BR-/i, '').replace(/-(sales|services|service)$/i, '').replace(/-/g, ' ').trim()
  if (name.startsWith('ASHCOL ')) {
    name = name.slice(7).trim()
  }
  return name
}

export function formatNegotiatorLabel(
  emp: { name?: string | null; branchId?: string | null },
  omitBranch = false,
): string {
  const fullName = (emp.name || '').trim().toUpperCase()
  const firstName = fullName.split(/\s+/)[0]
  if (omitBranch) return fullName || firstName
  const branch = getBranchDisplayName(emp.branchId || null)
  return branch ? `${fullName || firstName} (${branch.toUpperCase()})` : (fullName || firstName)
}

export function applyImportFieldsFromRow(
  row: Pick<
    ImportUnmatchedRow,
    'name' | 'phone' | 'location' | 'district' | 'brand' | 'dlr' | 'note' | 'commit' | 'update' |
    'controlNo' | 'installer' | 'service' | 'charges' | 'paymentMode' | 'status'
  >,
  isTaguigServices = false,
): Partial<Ticket> {
  const updatedFields: Partial<Ticket> = {}
  const set = (field: keyof Ticket, val?: string) => {
    if (val?.trim()) updatedFields[field] = val.trim() as any
  }

  set('customerName', row.name)
  set('location', row.location)
  set('district', row.district)
  set('contactPhone', row.phone)
  set('unitType', row.brand)
  set('dealer', row.dlr)
  set('note', row.note)
  set('commitType', row.commit)
  set('remarksUpdate', row.update)
  set('remarks', row.update)
  set('controlNumber', row.controlNo)
  if (row.installer?.trim()) updatedFields.installerName = row.installer.trim()
  if (row.charges != null && !Number.isNaN(Number(row.charges))) {
    updatedFields.installationCharges = Number(row.charges)
  }
  const mode = normalizeImportPaymentMode(row.paymentMode)
  if (mode) updatedFields.modeOfPayment = mode
  if (row.service?.trim()) {
    updatedFields.serviceVehicle = row.service.trim()
    if (isTaguigServices) {
      updatedFields.serviceType = categoryDefaultServiceType('SERVICES')
      updatedFields.ticketCategory = 'SERVICES'
    } else {
      updatedFields.serviceType = 'S/I'
      updatedFields.ticketCategory = 'INSTALLATION'
    }
  } else if (isTaguigServices) {
    updatedFields.ticketCategory = 'SERVICES'
    updatedFields.serviceType = categoryDefaultServiceType('SERVICES')
  }
  let statusVal = (row.status || '').toUpperCase().trim().replace(/\s+/g, '_')
  if (statusVal === 'FOR_QUOTATION') statusVal = 'FOR_APPROVAL'
  if (statusVal && STATUS_OPTS.includes(statusVal)) updatedFields.status = statusVal
  return updatedFields
}
