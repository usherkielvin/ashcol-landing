import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Trash2, X, Edit3, AlertTriangle, Building2, CalendarDays,
  Eye, Phone, MapPin, User, Wrench, Clock, Upload, ChevronDown, Camera, Loader2, Pencil,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, fetchTicketsPage, resolveScopedBranchId } from '../utils/api'
import * as XLSX from 'xlsx'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import {
  FIELD_TICKET_CATEGORIES,
  categoryDefaultServiceType,
  inferCategoryFromTicket,
  isFieldCategory,
  type TicketCategoryValue,
} from '../constants/ticketCategories'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Ticket {
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
  customer_phone?: string
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
  remarks?: string
  remarksUpdate?: string
  note?: string
  commitTerms?: string
  commitType?: string
  amountCharged?: number
  dealer?: string
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
}

type ImportUpdate = {
  ticket: Ticket
  updatedFields: Partial<Ticket>
  originalTicket: Ticket
  rowIdx: number
}

type ImportPaymentConfirmation = {
  ticket: Ticket
  value: string
  amount: string
  modeOfPayment: string
  controlNumber: string
  rowIdx: number
}

type ImportUnmatchedRow = {
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



const STATUS_OPTS = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'COMPLETED', 'CANCELLED']

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatAddress(loc: any): string {
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

function parseDistrict(loc: any, explicit?: string): string {
  if (explicit) return explicit
  if (!loc) return ''
  if (typeof loc === 'string') {
    try { const p: any = JSON.parse(loc); return p?.district || p?.city || '' } catch { return '' }
  }
  return (loc?.district || loc?.city || '').trim()
}

function parseBrand(ticket: Ticket): string {
  if (ticket.unitType || ticket.unit_type) return ticket.unitType || ticket.unit_type || ''
  const raw = ticket.acDetails || ticket.ac_details
  if (raw) {
    try {
      const arr = JSON.parse(raw)
      const a = Array.isArray(arr) ? arr : [arr]
      const brands: string[] = []
      for (const u of a) {
        ;(Array.isArray(u?.details) ? u.details : []).forEach((d: any) => { if (d?.brand) brands.push(d.brand) })
        if (u?.brand) brands.push(u.brand)
      }
      if (brands.length) return brands.join(', ')
      for (const u of a) { if (u?.unitType) return u.unitType }
    } catch { /* fall through */ }
  }
  return ticket.unitType || ticket.unit_type || ''
}

function parseAcMeta(ticket: Ticket): any {
  const raw = ticket.acDetails || ticket.ac_details
  if (!raw || typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function mergeAcMeta(ticket: Ticket, updates: Record<string, any>) {
  const parsed = parseAcMeta(ticket)
  if (Array.isArray(parsed)) {
    const next = parsed.length ? [...parsed] : [{}]
    next[0] = { ...(next[0] || {}), ...updates }
    return JSON.stringify(next)
  }
  return JSON.stringify({ ...(parsed || {}), ...updates })
}

function getPreferredDateKey(ticket: Ticket): string {
  const dateStr = ticket.preferredDate || ticket.preferred_date || ''
  if (!dateStr) return ''
  return dateStr.split('T')[0].split(' ')[0].trim()
}

function getPreviousScheduleDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.previousScheduleDates
  if (!Array.isArray(raw)) return []
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
}

function ticketMatchesDateKey(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return true
  const dateStr = ticket.preferredDate || ticket.preferred_date || ticket.createdAt || ticket.created_at
  if (!dateStr) return false

  const parsedDate = dateStr.split('T')[0].split(' ')[0].trim()
  if (parsedDate === dateKey) return true

  if (dateStr.includes('T') || dateStr.includes(':')) {
    try {
      const d = new Date(dateStr)
      if (!isNaN(d.getTime())) {
        const localY = d.getFullYear()
        const localM = String(d.getMonth() + 1).padStart(2, '0')
        const localD = String(d.getDate()).padStart(2, '0')
        if (`${localY}-${localM}-${localD}` === dateKey) return true
      }
    } catch { /* ignore */ }
  }
  return false
}

function isCompletedGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  if ((ticket.status || '').toUpperCase() !== 'COMPLETED') return false
  const sched = getArchivedScheduleDate(ticket)
  if (sched === dateKey) return true
  if (getPreviousScheduleDates(ticket).includes(dateKey)) return true
  return ticketMatchesDateKey(ticket, dateKey)
}

function isRescheduledGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  if ((ticket.status || '').toUpperCase() === 'COMPLETED') return false
  if (ticketMatchesDateKey(ticket, dateKey)) return false
  return getPreviousScheduleDates(ticket).includes(dateKey)
}

function getScheduleGhostKind(ticket: Ticket, dateKey: string): 'completed' | 'resched' | null {
  if (!dateKey) return null
  if (isCompletedGhostOnDate(ticket, dateKey)) return 'completed'
  if (isRescheduledGhostOnDate(ticket, dateKey)) return 'resched'
  return null
}

function isInstalledRemarks(text?: string | null): boolean {
  return (text || '').toLowerCase().includes('installed')
}

function ticketRemarksText(ticket: Partial<Ticket>, fields?: Partial<Ticket>): string {
  return [
    fields?.remarksUpdate,
    fields?.remarks,
    ticket.remarksUpdate,
    ticket.remarks,
    fields?.note,
    ticket.note,
  ].filter(Boolean).join(' ')
}

function hasInstallPayment(ticket: Partial<Ticket>, fields?: Partial<Ticket>): boolean {
  const mode = String(fields?.modeOfPayment ?? ticket.modeOfPayment ?? ticket.mode_of_payment ?? '').toUpperCase().trim()
  if (!mode) return false
  if (mode === 'FREE' || mode === 'FREE INSTALL') return true
  const charges = fields?.installationCharges ?? ticket.installationCharges ?? ticket.installation_charges ?? ticket.amountCharged
  return charges != null && !Number.isNaN(Number(charges)) && Number(charges) > 0
}

function qualifiesForInstallComplete(ticket: Partial<Ticket>, fields?: Partial<Ticket>): boolean {
  const remarks = ticketRemarksText(ticket, fields)
  const status = String(fields?.status ?? ticket.status ?? '').toUpperCase()
  const installed = isInstalledRemarks(remarks) || status === 'COMPLETED'
  return installed && hasInstallPayment(ticket, fields)
}

function getArchivedScheduleDate(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  if (typeof meta.archivedScheduleDate === 'string' && meta.archivedScheduleDate.trim()) {
    return meta.archivedScheduleDate.split('T')[0].split(' ')[0].trim()
  }
  const prev = getPreviousScheduleDates(ticket)
  if (prev.length) return prev[prev.length - 1]
  return getPreferredDateKey(ticket)
}

function getInstalledDateKey(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  if (typeof meta.installedDate === 'string' && meta.installedDate.trim()) {
    return meta.installedDate.split('T')[0].split(' ')[0].trim()
  }
  const raw = ticket.actualCompletion || (ticket as any).actual_completion || ticket.updatedAt || ticket.updated_at
  if (!raw) return ''
  return String(raw).split('T')[0].split(' ')[0].trim()
}

function isScheduleGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  return isRescheduledGhostOnDate(ticket, dateKey) || isCompletedGhostOnDate(ticket, dateKey)
}

function buildArchiveAcMeta(ticket: Ticket, scheduleDateKey: string) {
  const existing = parseAcMeta(ticket)
  const prevDates: string[] = Array.isArray(existing.previousScheduleDates) ? [...existing.previousScheduleDates] : []
  const sched = (scheduleDateKey || getPreferredDateKey(ticket)).split('T')[0].split(' ')[0].trim()
  if (sched && !prevDates.includes(sched)) prevDates.push(sched)
  return {
    previousScheduleDates: prevDates,
    archivedScheduleDate: sched,
    installedDate: todayDateKey(),
  }
}

function formatPaymentAmount(ticket: Ticket): string {
  const amt = ticket.installationCharges ?? ticket.installation_charges ?? ticket.amountCharged
  if (amt == null || Number.isNaN(Number(amt))) return ''
  return `₱${Number(amt).toLocaleString('en-PH')}`
}

function getPaymentMode(ticket: Ticket): string {
  return getF(ticket, 'modeOfPayment', 'mode_of_payment')
}

function ticketHasPaymentInfo(ticket: Partial<Ticket>): boolean {
  const mode = (ticket.modeOfPayment ?? ticket.mode_of_payment ?? '').trim()
  const charges = ticket.installationCharges ?? ticket.installation_charges
  return Boolean(mode || (charges != null && !Number.isNaN(Number(charges)) && Number(charges) > 0))
}

function formatDateKeyLabel(key: string) {
  if (!key) return ''
  const d = new Date(`${key}T00:00:00`)
  if (isNaN(d.getTime())) return key
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getCustomerDisplayName(ticket: Ticket): string {
  return (getF(ticket, 'customerName', 'customer_name') || ticket.title || '').trim()
}

function normalizeCustomerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function branchesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const clean = (s: string) => s.toUpperCase().replace(/-(SALES|SERVICES|SERVICE)$/g, '').trim()
  return clean(a) === clean(b)
}

function parseImportMoney(raw?: string | number | null): number | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  const text = String(raw).trim()
  if (!text) return undefined
  const numeric = parseFloat(text.replace(/[₱phpPHP,\s]/gi, ''))
  return Number.isNaN(numeric) ? undefined : numeric
}

function normalizeImportPaymentMode(raw?: string | null): string {
  const v = (raw || '').toUpperCase().trim()
  if (!v) return ''
  if (v === 'FREE' || v.includes('FREE INSTALL')) return 'FREE INSTALL'
  if (v.includes('GCASH') || v === 'G-CASH') return 'GCASH'
  if (v.includes('BANK') || v.includes('TRANSFER')) return 'BANK TRANSFER'
  if (v.includes('CHEQUE') || v.includes('CHECK')) return 'CHEQUE'
  if (v === 'CASH' || v.includes('CASH')) return 'CASH'
  return v
}

function getInstallerDisplay(ticket: Ticket): string {
  const direct = (ticket.installerName || (ticket as any).installer_name || '').trim()
  if (direct) return direct
  const meta = parseAcMeta(ticket)
  const fromMeta = String(meta.installerName || meta.installer || meta.technicianName || '').trim()
  return fromMeta
}

function applyImportFieldsFromRow(row: Pick<
  ImportUnmatchedRow,
  'name' | 'phone' | 'location' | 'district' | 'brand' | 'dlr' | 'note' | 'commit' | 'update' |
  'controlNo' | 'installer' | 'service' | 'charges' | 'paymentMode' | 'status'
>): Partial<Ticket> {
  const updatedFields: Partial<Ticket> = {}
  const set = (field: keyof Ticket, val?: string) => {
    if (val?.trim()) updatedFields[field] = val.trim() as any
  }

  set('customerName', row.name)
  set('location', row.location)
  set('district', row.district)
  set('contactPhone', row.phone)
  set('unitType', row.brand)
  set('sourceVendor', row.dlr)
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
    updatedFields.serviceType = 'S/I'
    updatedFields.ticketCategory = 'INSTALLATION'
  }
  let statusVal = (row.status || '').toUpperCase().trim().replace(/\s+/g, '_')
  if (statusVal === 'FOR_QUOTATION') statusVal = 'FOR_APPROVAL'
  if (statusVal && STATUS_OPTS.includes(statusVal)) updatedFields.status = statusVal
  return updatedFields
}

function formatServiceDriver(ticket: Ticket): string {
  const vehicle = getF(ticket, 'serviceVehicle', 'service_vehicle')
  const type = getF(ticket, 'serviceType', 'service_type')
  if (vehicle && type && !vehicle.toLowerCase().includes(type.toLowerCase())) {
    return `${type} · ${vehicle}`
  }
  return vehicle || type || ''
}

/** Parse "ALLAN - 3" / "T3 (DOMINIC) - 7" into name + site number for grouping. */
function parseNameSiteToken(raw: string): { name: string; site: number; label: string } {
  const v = (raw || '').trim()
  if (!v || v === '—') return { name: '', site: Number.MAX_SAFE_INTEGER, label: '' }
  const m = v.match(/^(.+?)\s*-\s*(\d+)\s*$/i)
  if (m) {
    const label = m[1].trim()
    return {
      name: label.toUpperCase(),
      site: parseInt(m[2], 10) || 0,
      label,
    }
  }
  return { name: v.toUpperCase(), site: Number.MAX_SAFE_INTEGER, label: v }
}

function compareNameSiteStrings(a: string, b: string): number {
  const pa = parseNameSiteToken(a)
  const pb = parseNameSiteToken(b)
  if (!pa.name && !pb.name) return 0
  if (!pa.name) return 1
  if (!pb.name) return -1
  const byName = pa.name.localeCompare(pb.name, undefined, { sensitivity: 'base' })
  if (byName !== 0) return byName
  return pa.site - pb.site
}

function ticketColumnText(ticket: Ticket, colLabel: string): string {
  switch (colLabel) {
    case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title || ''
    case 'DESTINATION': return formatAddress(ticket.location)
    case 'BRAND': return parseBrand(ticket)
    case 'DLR': return getF(ticket, 'sourceVendor', 'source_vendor', 'dealer') || ''
    case 'STATUS': return ticket.status || ''
    case 'COMMIT': return getF(ticket, 'commitType', 'commitTerms', 'description')
    case 'INSTALLER': return getInstallerDisplay(ticket)
    case 'SERVICE': return formatServiceDriver(ticket)
    case 'UPDATE': return ticket.remarksUpdate || ticket.remarks || ''
    default: return ''
  }
}

function compareTicketsByColumn(a: Ticket, b: Ticket, colLabel: string): number {
  const av = ticketColumnText(a, colLabel)
  const bv = ticketColumnText(b, colLabel)
  if (colLabel === 'INSTALLER' || colLabel === 'SERVICE') {
    return compareNameSiteStrings(av, bv)
  }
  return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
}

function parseServiceDriverValue(
  raw?: string,
  category: TicketCategoryValue = 'INSTALLATION',
): { serviceType: string; serviceVehicle: string } {
  const val = (raw || '').trim()
  return { serviceType: categoryDefaultServiceType(category), serviceVehicle: val }
}

function getF(ticket: Ticket, ...keys: (keyof Ticket)[]): string {
  for (const k of keys) {
    const v = ticket[k]
    if (v != null && typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function statusCode(s: string) {
  return { PENDING: 'P', ASSIGNED: 'A', ON_THE_WAY: 'OTW', IN_PROGRESS: 'IP', COMPLETED: 'C', CANCELLED: 'X' }[s.toUpperCase()] || s.slice(0, 3)
}

function statusColor(s: string, light: boolean) {
  switch (s.toUpperCase()) {
    case 'PENDING':     return { text: '#FB923C', bg: light ? '#fff7ed' : 'rgba(251,146,60,0.13)',  b: 'rgba(251,146,60,0.4)' }
    case 'ASSIGNED':    return { text: '#3B82F6', bg: light ? '#eff6ff' : 'rgba(59,130,246,0.13)',  b: 'rgba(59,130,246,0.4)'  }
    case 'ON_THE_WAY':  return { text: '#06B6D4', bg: light ? '#ecfeff' : 'rgba(6,182,212,0.13)',   b: 'rgba(6,182,212,0.4)'   }
    case 'IN_PROGRESS': return { text: '#10B981', bg: light ? '#f0fdf4' : 'rgba(16,185,129,0.13)',  b: 'rgba(16,185,129,0.4)'  }
    case 'CANCELLED':   return { text: '#EF4444', bg: light ? '#fef2f2' : 'rgba(239,68,68,0.10)',   b: 'rgba(239,68,68,0.35)'  }
    default:            return { text: '#94A3B8', bg: 'transparent',                                b: 'rgba(148,163,184,0.3)' }
  }
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const nums: string[] = []
  let rem = digits
  while (rem.length >= 10) {
    if (rem.startsWith('63') && rem.length >= 12)      { nums.push('0' + rem.slice(2, 12)); rem = rem.slice(12) }
    else if (rem.startsWith('09') && rem.length >= 11) { nums.push(rem.slice(0, 11));        rem = rem.slice(11) }
    else if (rem.startsWith('9') && rem.length >= 10)  { nums.push('0' + rem.slice(0, 10));  rem = rem.slice(10) }
    else break
  }
  return nums.slice(0, 2).map(n => n.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')).join(' / ')
}

function getBranchDisplayName(id: string | null): string {
  if (!id || id === 'ALL_BRANCHES') return 'All branches'
  const upper = id.toUpperCase()
  if (upper === 'BR-TAGUIG-SALES-SALES' || upper === 'BR-TAGUIG-SALES') {
    return 'TAGUIG - SALES'
  }
  if (upper === 'BR-TAGUIG-SALES-SERVICES' || upper === 'BR-TAGUIG-SERVICES' || upper === 'BR-TAGUIG-SERVICE') {
    return 'TAGUIG - SERVICES'
  }
  return id.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').replace(/-/g, ' ').toUpperCase()
}

function todayDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateToKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateTriggerLabel(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${month}/${day}/${year}` : value || 'Select date'
}

async function readApiError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data === 'string') return data
    if (data?.message) return data.message
    return data.error || JSON.stringify(data)
  } catch {
    try {
      const text = await res.text()
      return text || `HTTP ${res.status}`
    } catch {
      return `HTTP ${res.status}`
    }
  }
}

function isUnmatchedImportComplete(item: ImportUnmatchedRow): boolean {
  return Boolean(
    (item.status && item.status.toUpperCase() === 'COMPLETED') ||
    (item.update && item.update.toLowerCase().includes('installed'))
  )
}

function buildImportCreateRow(item: ImportUnmatchedRow, importTargetDate?: string): Record<string, unknown> {
  const location = (item.location
    ? (typeof item.location === 'object' ? JSON.stringify(item.location) : item.location)
    : '').trim() || 'No Address Provided'

  const row: Record<string, unknown> = {
    title: `${item.service || 'S/I'} service`.trim(),
    description: (item.note || item.update || 'Excel imported ticket').trim(),
    customerName: (item.name || 'Unknown Customer').trim(),
    serviceType: item.service || 'S/I',
    ticketCategory: 'INSTALLATION',
    unitType: item.brand || 'Split AC',
    location,
    sourceVendor: item.dlr || 'Direct',
    status: importTargetDate ? 'SCHEDULED' : 'PENDING',
  }

  if (importTargetDate) row.preferredDate = importTargetDate

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

function buildPatchImportBody(
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
  set('sourceVendor', updatedFields.sourceVendor)
  set('commitType', updatedFields.commitType ?? updatedFields.commitTerms)
  set('serviceVehicle', updatedFields.serviceVehicle)
  set('remarksUpdate', updatedFields.remarksUpdate ?? updatedFields.remarks)
  set('controlNumber', updatedFields.controlNumber)
  set('ticketNumber', (updatedFields as Ticket).ticketNumber)
  set('installerName', updatedFields.installerName ?? updatedFields.assignedEmployeeName)
  set('negotiatorId', (updatedFields as Ticket).negotiatorId)
  if (updatedFields.serviceVehicle) body.serviceType = updatedFields.serviceType || 'S/I'
  if (updatedFields.installationCharges != null) body.installationCharges = updatedFields.installationCharges
  if (updatedFields.modeOfPayment) body.modeOfPayment = updatedFields.modeOfPayment
  if (updatedFields.status) body.status = updatedFields.status
  if (importTargetDate) {
    body.preferredDate = importTargetDate
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
  if (updatedFields.sourceVendor) {
    const acDetails = mergeAcMeta(acBase, { dealer: updatedFields.sourceVendor, dlr: updatedFields.sourceVendor })
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
  }

  return body
}

function enrichCompletePatchBody(
  body: Record<string, unknown>,
  ticket: Ticket,
  scheduleDateKey: string,
): Record<string, unknown> {
  return {
    ...body,
    status: 'COMPLETED',
    actualCompletion: new Date().toISOString(),
    acDetails: mergeAcMeta(ticket, buildArchiveAcMeta(ticket, scheduleDateKey)),
  }
}

function getCellRawValue(ticket: Ticket, colLabel: string): string {
  switch (colLabel) {
    case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title || ''
    case 'DESTINATION': return formatAddress(ticket.location)
    case 'BRAND': return parseBrand(ticket)
    case 'DLR': return getF(ticket, 'sourceVendor', 'source_vendor', 'dealer') || ''
    case 'STATUS': return ticket.status || ''
    case 'COMMIT': return getF(ticket, 'commitType', 'commitTerms', 'description')
    case 'INSTALLER': return getInstallerDisplay(ticket)
    case 'SERVICE': return formatServiceDriver(ticket)
    case 'UPDATE': return ticket.remarksUpdate || ticket.remarks || ''
    default: return ''
  }
}

function buildCellPatchBody(ticket: Ticket, colLabel: string, rawValue: string): Record<string, unknown> {
  const v = rawValue.trim()
  const body: Record<string, unknown> = {}
  let acBase: Ticket = ticket

  switch (colLabel) {
    case "CUSTOMER'S NAME":
      if (v) {
        body.customerName = v
        const st = getF(ticket, 'serviceType', 'service_type') || 'S/I'
        body.title = `${st} service`
      }
      break
    case 'DESTINATION':
      if (v) {
        body.location = v
        body.acDetails = mergeAcMeta(acBase, { destination: v, address: v })
      }
      break
    case 'BRAND':
      body.unitType = v || undefined
      body.acDetails = mergeAcMeta(acBase, { brand: v, unitType: v })
      break
    case 'DLR':
      body.sourceVendor = v || undefined
      body.acDetails = mergeAcMeta(acBase, { dealer: v, dlr: v })
      break
    case 'STATUS': {
      let statusVal = v.toUpperCase().replace(/\s+/g, '_')
      if (statusVal === 'FOR_QUOTATION') statusVal = 'FOR_APPROVAL'
      if (statusVal && STATUS_OPTS.includes(statusVal)) body.status = statusVal
      break
    }
    case 'COMMIT':
      body.commitType = v || undefined
      break
    case 'INSTALLER':
      body.installerName = v || undefined
      body.acDetails = mergeAcMeta(acBase, { installerName: v, installer: v, technicianName: v })
      break
    case 'SERVICE': {
      const { serviceType, serviceVehicle } = parseServiceDriverValue(v)
      body.serviceType = serviceType
      body.serviceVehicle = serviceVehicle || undefined
      break
    }
    case 'UPDATE':
      body.remarks = v || undefined
      body.remarksUpdate = v || undefined
      body.acDetails = mergeAcMeta(acBase, { update: v, remarksUpdate: v })
      break
    default:
      break
  }
  return body
}
export default function Tickets() {
  const { theme } = useTheme()
  const { user }  = useAuth()
  const navigate   = useNavigate()
  const isLight    = theme === 'light'

  const role      = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'
  const isAdmin    = role === 'admin'
  const isManager  = role === 'manager'
  const isEmployee = ['employee', 'oic', 'staff'].includes(role)
  const canEdit    = isAdmin || isManager || isEmployee

  // ── Global branch ─────────────────────────────────────────────────────────
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )
  useEffect(() => {
    const sync = () => setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [])

  const activeBranch = (globalBranchId || user?.branchId || '').toUpperCase()
  const isTaguigServices = activeBranch.includes('TAGUIG') && (activeBranch.includes('SERVICES') || activeBranch.includes('SERVICE'))
  const isTaguig = activeBranch.includes('TAGUIG')

  // ── Color tokens ──────────────────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#cbd5e1' : '#334155'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg     = isLight ? '#f1f5f9' : '#060C18'
  const rowEven     = isLight ? '#ffffff' : '#0A1120'
  const rowOdd      = isLight ? '#f9fafb' : '#0d1626'
  const rowHover    = isLight ? '#f1f5f9' : '#0f1e36'
  const green       = '#16A34A'

  // ── Data state ────────────────────────────────────────────────────────────
  const [tickets, setTickets]         = useState<Ticket[]>([])
  const [loading, setLoading]         = useState(true)
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null)
  const [installerFilter, setInstallerFilter] = useState('')
  const [dateFilter, setDateFilter]   = useState(() => todayDateKey())
  const dateFilterInputRef = useRef<HTMLInputElement>(null)
  const [hoveredRow, setHoveredRow]   = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ ticketId: string; colLabel: string } | null>(null)
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null)

  // ── Weekly Tabs Calculation ───────────────────────────────────────────────
  const weeklyTabs = useMemo(() => {
    const list = []
    const start = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = formatDateToKey(d)
      const dayName = i === 0 ? 'Today' : d.toLocaleDateString('en-PH', { weekday: 'short' })
      const dateLabel = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      list.push({ key, dayName, dateLabel })
    }
    return list
  }, [])

  const isCustomSelected = useMemo(() => {
    return dateFilter !== '' && !weeklyTabs.some(tab => tab.key === dateFilter)
  }, [dateFilter, weeklyTabs])

  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState<string | null>(null)

  useEffect(() => {
    if (isTaguig) {
      setDateFilter(todayDateKey())
    }
  }, [isTaguig])

  // ── Context menu ──────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ticket: Ticket } | null>(null)
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)

  // ── History state ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ── Completion prompt state ───────────────────────────────────────────────
  const [completionPrompt, setCompletionPrompt] = useState<{
    ticket: Ticket
    value: string
    modeOfPayment: string
    amount: string
  } | null>(null)

  // ── Manual Add Modal State ───────────────────────────────────────────────
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addFormSnapshot, setAddFormSnapshot] = useState('')
  const [addForm, setAddForm] = useState<Partial<Ticket> & { serviceDriver?: string; ticketCategory?: TicketCategoryValue }>({
    preferredDate: '',
    customerName: '',
    contactPhone: '',
    location: '',
    district: '',
    commitTerms: '',
    unitType: '',
    sourceVendor: 'Direct',
    serviceDriver: '',
    installerName: '',
    negotiatorId: '',
    ticketNumber: '',
    controlNumber: '',
    modeOfPayment: '',
    installationCharges: undefined,
    ticketCategory: 'INSTALLATION',
  })
  const [branchEmployees, setBranchEmployees] = useState<{ id: string; name: string; branchId?: string }[]>([])
  const [savingManual, setSavingManual] = useState(false)

  // ── Manual Edit Modal State ──────────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Ticket> & { serviceDriver?: string; rescheduleToDate?: string; ticketCategory?: TicketCategoryValue }>({})
  const [editFormSnapshot, setEditFormSnapshot] = useState('')
  const [editOriginalDate, setEditOriginalDate] = useState('')
  const [editInitialStatus, setEditInitialStatus] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmModal, setConfirmModal] = useState<ConfirmDialogState | null>(null)

  // ── Excel Import State ───────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanFileInputRef = useRef<HTMLInputElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{
    isOpen: boolean
    fileName: string
    rowRangeLabel: string
    totalRows: number
    matchedCount: number
    unmatchedCount: number
    autoCompletedCount: number
    updates: ImportUpdate[]
    needsConfirmation: ImportPaymentConfirmation[]
    unmatched: ImportUnmatchedRow[]
  } | null>(null)

  const [importTargetDate, setImportTargetDate] = useState('')

  useEffect(() => {
    if (importResults?.isOpen) {
      setImportTargetDate(dateFilter || todayDateKey())
    }
  }, [importResults?.isOpen, dateFilter])

  const handlePaymentFieldChange = (idx: number, field: 'amount' | 'modeOfPayment' | 'controlNumber', val: string) => {
    setImportResults(prev => {
      if (!prev) return null
      const nextNeeds = [...prev.needsConfirmation]
      nextNeeds[idx] = { ...nextNeeds[idx], [field]: val }
      return { ...prev, needsConfirmation: nextNeeds }
    })
  }

  const processImportSheetRows = (
    sheetRows: ImportUnmatchedRow[],
    fileName: string,
    rowRangeLabel: string,
    scanDate?: string,
  ) => {
    const updatesList: ImportUpdate[] = []
    const needsConfirmationList: ImportPaymentConfirmation[] = []
    const unmatchedList: ImportUnmatchedRow[] = []
    const usedTicketIds = new Set<string>()

    let matchedCount = 0
    let autoCompletedCount = 0

    for (const row of sheetRows) {
      const rowName = row.name
      const rowPhone = row.phone

      const match = tickets.find(t => {
        if (usedTicketIds.has(t.id)) return false

        const status = (t.status || '').toUpperCase()
        const isDone = status === 'COMPLETED' || status === 'CANCELLED'

        // 1. Match by control number if both have it
        const rowCtrl = (row.controlNo || '').trim().toLowerCase()
        const tCtrl = (t.controlNumber || t.control_number || '').trim().toLowerCase()
        if (rowCtrl && tCtrl && rowCtrl === tCtrl) {
          if (isDone) {
            // "dont fetch done for control #"
            return false
          }
          return true
        }

        // 2. Otherwise fall back to name and phone matching, but ignore done tickets
        if (isDone) return false

        const tName = (t.customerName || t.customer_name || t.title || '').toLowerCase().trim()
        const cleanRowName = rowName.toLowerCase().trim()

        if (cleanRowName && tName) {
          if (tName === cleanRowName || tName.includes(cleanRowName) || cleanRowName.includes(tName)) {
            return true
          }
        }

        const tPhone = (t.contactPhone || t.contact_phone || t.customer_phone || t.phone || '').replace(/\D/g, '')
        const cleanRowPhone = rowPhone.replace(/\D/g, '')
        if (cleanRowPhone && tPhone) {
          if (tPhone === cleanRowPhone || tPhone.includes(cleanRowPhone) || cleanRowPhone.includes(tPhone)) {
            return true
          }
        }

        return false
      })

      if (match) {
        usedTicketIds.add(match.id)
        matchedCount++

        const updatedFields = applyImportFieldsFromRow(row)
        const statusVal = (updatedFields.status || '').toUpperCase()
        const updateRemarks = (row.update || '').toLowerCase()
        const isInstalled = updateRemarks.includes('installed') || statusVal === 'COMPLETED'

        if (isInstalled) {
          const charges = updatedFields.installationCharges ?? match.installationCharges ?? match.amountCharged
          const mode = updatedFields.modeOfPayment ?? match.modeOfPayment ?? match.mode_of_payment
          const ctrlVal = updatedFields.controlNumber ?? match.controlNumber ?? ''

          const hasPayment = Boolean(
            mode && (mode === 'FREE' || mode === 'FREE INSTALL' || (charges !== undefined && Number(charges) > 0)),
          )

          if (hasPayment) {
            autoCompletedCount++
            updatesList.push({
              ticket: match,
              updatedFields: { ...updatedFields, status: 'COMPLETED' },
              originalTicket: match,
              rowIdx: row.rowIdx,
            })
          } else {
            needsConfirmationList.push({
              ticket: match,
              value: row.update || 'Installed',
              amount: charges != null ? String(charges) : '',
              modeOfPayment: mode || 'CASH',
              controlNumber: ctrlVal,
              rowIdx: row.rowIdx,
            })
          }
        } else {
          updatesList.push({
            ticket: match,
            updatedFields,
            originalTicket: match,
            rowIdx: row.rowIdx,
          })
        }
      } else {
        unmatchedList.push({
          ...row,
          paymentMode: normalizeImportPaymentMode(row.paymentMode) || row.paymentMode,
        })
      }
    }

    if (scanDate?.trim()) {
      const dateKey = scanDate.split('T')[0].split(' ')[0].trim()
      if (dateKey) setImportTargetDate(dateKey)
    }

    setImportResults({
      isOpen: true,
      fileName,
      rowRangeLabel,
      totalRows: sheetRows.length,
      matchedCount,
      unmatchedCount: unmatchedList.length,
      autoCompletedCount,
      updates: updatesList,
      needsConfirmation: needsConfirmationList,
      unmatched: unmatchedList,
    })
  }

  const parseImportFile = async (file: File) => {
    setImporting(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const sName = wb.SheetNames[0]
      const sheet = wb.Sheets[sName]
      const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' })

      if (grid.length === 0) {
        alert('The Excel file is empty.')
        setImporting(false)
        return
      }

      // Find the header row
      let headerIdx = -1
      for (let r = 0; r < Math.min(25, grid.length); r++) {
        const row = grid[r]
        if (!Array.isArray(row)) continue
        const cells = row.map(c => String(c ?? '').toLowerCase().trim())
        const hasName = cells.some(c => c.includes('name') || c.includes('costumer') || c.includes('customer'))
        const hasDest = cells.some(c => c.includes('destination') || c.includes('address') || c.includes('location'))
        if (hasName || hasDest) {
          headerIdx = r
          break
        }
      }

      if (headerIdx === -1) {
        headerIdx = 0
      }

      const headers = grid[headerIdx].map((h: any) => String(h ?? '').toUpperCase().trim())
      const startIdx = headerIdx + 1
      const endIdx = grid.length - 1
      const rowRangeLabel = `rows ${startIdx + 1}-${endIdx + 1}`
      
      const findColIdx = (aliases: string[]): number => {
        // 1. Try exact match first
        const exactIdx = headers.findIndex((h: string) => aliases.some(alias => h === alias))
        if (exactIdx !== -1) return exactIdx
        // 2. Fall back to includes, but only for aliases that are longer than 2 characters
        return headers.findIndex((h: string) => aliases.some(alias => {
          if (alias.length <= 2) return h === alias
          return h.includes(alias)
        }))
      }

      const colMap = {
        name: findColIdx(["CUSTOMER'S NAME", "COSTUMER'S NAME", "CUSTOMER NAME", "COSTUMER NAME", "COSTUMERS NAME", "NAME"]),
        destination: findColIdx(["DESTINATION", "ADDRESS", "LOCATION"]),
        district: findColIdx(["DISTRICT"]),
        phone: findColIdx(["CONTACT NO.", "CONTACT NO", "CONTACT", "PHONE", "TELEPHONE", "NUMBER"]),
        brand: findColIdx(["BRAND", "UNIT", "AC"]),
        dlr: findColIdx(["ENDORSED BY", "DLR", "DEALER", "VENDOR"]),
        status: findColIdx(["STATUS"]),
        installer: findColIdx(["INSTALLER", "TECHNICIAN", "CREW", "INSTALLER NAME", "TECH", "INSTALLER/TECHNICIAN"]),
        note: findColIdx(["NOTE", "NOTES"]),
        confirmation: findColIdx(["CONFIRMATION"]),
        service: findColIdx(["SERVICE", "SERVICE TYPE", "DRIVER", "VEHICLE"]),
        update: findColIdx(["SERVICE STATUS", "UPDATE", "REMARKS", "ADMIN REMARKS", "INSTALLATION STATUS"]),
        charges: findColIdx(["INSTALLATION CHARGES", "INSTALLATION CHARGE", "AMOUNT CHARGED", "CHARGES", "CHARGE", "AMOUNT", "AMT"]),
        paymentMode: findColIdx(["MOP", "MODE OF PAYMENT", "PAYMENT MODE", "PAYMENT STATUS", "MODE OF PAYMENT (MOP)"]),
        controlNo: findColIdx(["PAPERS", "CONTROL# / SI", "CONTROL NUMBER", "CONTROL #", "SI NO", "SI NUMBER", "CONTROL", "RCVD", "PR"]),
        commit: findColIdx(["COMMIT", "COMMIT TERMS"]),
      }

      const sheetRows: ImportUnmatchedRow[] = []

      for (let r = startIdx; r <= endIdx; r++) {
        const row = grid[r]
        if (!Array.isArray(row) || row.every(c => c === null || c === '')) continue

        const val = (idx: number) => (idx !== -1 && row[idx] !== undefined) ? String(row[idx]).trim() : ''

        const rowName = val(colMap.name)
        const rowDest = val(colMap.destination)
        const rowPhone = val(colMap.phone)

        if (!rowName ||
            ['closed', 'total', 'grand total', 'subtotal', 'online', 'cash'].includes(rowName.toLowerCase().trim()) ||
            (!rowDest && !rowPhone)) {
          continue
        }

        const paymentModeRaw = val(colMap.paymentMode)
        sheetRows.push({
          name: rowName || 'Unknown Customer',
          phone: rowPhone,
          location: rowDest,
          district: val(colMap.district),
          brand: val(colMap.brand),
          dlr: val(colMap.dlr),
          status: val(colMap.status),
          commit: val(colMap.commit),
          installer: val(colMap.installer),
          confirmation: val(colMap.confirmation),
          note: val(colMap.note),
          service: val(colMap.service),
          update: val(colMap.update),
          charges: parseImportMoney(val(colMap.charges)),
          paymentMode: normalizeImportPaymentMode(paymentModeRaw) || paymentModeRaw,
          controlNo: val(colMap.controlNo),
          rowIdx: r + 1,
        })
      }

      processImportSheetRows(sheetRows, file.name, rowRangeLabel)

    } catch (err: any) {
      console.error(err)
      alert(`Failed to parse Excel file: ${err.message || 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await parseImportFile(file)
    } finally {
      e.target.value = ''
    }
  }

  const handleScanFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    try {
      const tokenVal = token()
      const formData = new FormData()
      formData.append('image', file)

      let targetBranchId = globalBranchId || user?.branchId || localStorage.getItem('ashcol-global-branch-id') || ''
      if (targetBranchId && /-(sales|services)$/i.test(targetBranchId)) {
        targetBranchId = targetBranchId.replace(/-sales$|-services$/i, '')
      }
      if (targetBranchId && targetBranchId !== 'ALL_BRANCHES') {
        formData.append('branchId', targetBranchId)
      }

      const res = await fetch(`${API_BASE_URL}/v1/service-reports/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenVal}` },
        body: formData,
      })
      if (!res.ok) throw new Error(await readApiError(res))
      const data = await res.json()
      if (data.error) {
        alert(`Scan failed: ${data.error}`)
        return
      }

      const rows = Array.isArray(data.rows) ? data.rows : []
      if (rows.length === 0) {
        alert('No table rows were detected in the image.')
        return
      }

      const sheetRows: ImportUnmatchedRow[] = rows
        .map((row: any, index: number) => {
          const customerName = String(row.customerName || '').trim()
          const customerAddress = String(row.customerAddress || '').trim()
          const customerPhone = String(row.customerPhone || '').trim()
          if (!customerName || (!customerAddress && !customerPhone)) return null

          const remarks = String(row.remarks || row.scheduleStatus || '').trim()
          const paymentRaw = row.paymentStatus || row.modeOfPayment || ''
          return {
            name: customerName,
            phone: customerPhone,
            location: customerAddress,
            district: String(row.district || '').trim(),
            brand: String(row.unitBrandModel || row.brand || '').trim(),
            dlr: String(row.dealer || '').trim(),
            status: String(row.statusCode || row.status || '').trim(),
            commit: String(row.commitTerms || '').trim(),
            installer: String(row.technicianName || row.installerName || row.installer || '').trim(),
            confirmation: '',
            note: String(row.note || '').trim(),
            service: String(row.serviceColumn || row.service || '').trim(),
            update: remarks,
            charges: parseImportMoney(row.amountCharged ?? row.charges),
            paymentMode: normalizeImportPaymentMode(paymentRaw) || String(paymentRaw).trim(),
            controlNo: String(row.controlNumber || '').trim(),
            rowIdx: index + 1,
          } satisfies ImportUnmatchedRow
        })
        .filter((row: ImportUnmatchedRow | null): row is ImportUnmatchedRow => row !== null)

      if (sheetRows.length === 0) {
        alert('No valid customer rows were detected in the scanned image.')
        return
      }

      processImportSheetRows(
        sheetRows,
        file.name,
        `image rows 1-${sheetRows.length}`,
        typeof data.date === 'string' ? data.date : undefined,
      )
    } catch (err: any) {
      console.error(err)
      alert(`Could not scan schedule sheet: ${err.message || 'Unknown error'}`)
    } finally {
      setScanning(false)
      if (scanFileInputRef.current) scanFileInputRef.current.value = ''
    }
  }



  const promptSaveManualTicket = () => {
    if (!addForm.preferredDate) {
      alert('Preferred Date is required')
      return
    }
    if (!addForm.customerName?.trim()) {
      alert('Customer Name is required')
      return
    }
    if (!addForm.contactPhone?.trim()) {
      alert('Contact No. is required')
      return
    }
    if (!addForm.location?.trim()) {
      alert('Destination/Address is required')
      return
    }
    const name = addForm.customerName.trim()
    setConfirmModal({
      title: 'Create ticket?',
      message: `Add ${name} to the schedule for ${addForm.preferredDate}.`,
      variant: 'save',
      confirmText: 'Create Ticket',
      cancelText: 'Not Yet',
      onConfirm: () => void commitSaveManualTicket(),
    })
  }

  const commitSaveManualTicket = async () => {
    setSavingManual(true)
    try {
      const tokenVal = token()
      const category = addForm.ticketCategory || 'INSTALLATION'
      const { serviceType, serviceVehicle } = parseServiceDriverValue(addForm.serviceDriver, category)
      const titleVal = `${categoryDefaultServiceType(category)} service`
      const descVal = addForm.commitTerms?.trim() || 'No additional details provided.'
      
      const payload = {
        customerName: (addForm.customerName || '').trim(),
        title: titleVal,
        description: descVal,
        serviceType,
        ticketCategory: category,
        location: (addForm.location || '').trim(),
        contactPhone: (addForm.contactPhone || '').trim(),
        unitType: addForm.unitType?.trim() || undefined,
        preferredDate: addForm.preferredDate,
        sourceVendor: addForm.sourceVendor?.trim() || 'Direct',
        district: addForm.district?.trim() || undefined,
        commitType: addForm.commitTerms?.trim() || undefined,
        serviceVehicle: serviceVehicle || undefined,
        installerName: addForm.installerName?.trim() || undefined,
        negotiatorId: addForm.negotiatorId || undefined,
        ticketNumber: addForm.ticketNumber?.trim() || undefined,
        controlNumber: addForm.controlNumber?.trim() || undefined,
        modeOfPayment: addForm.modeOfPayment?.trim() || undefined,
        installationCharges: addForm.installationCharges != null && !Number.isNaN(Number(addForm.installationCharges))
          ? Number(addForm.installationCharges)
          : undefined,
        branchId: resolveScopedBranchId(globalBranchId || user?.branchId || localStorage.getItem('ashcol-global-branch-id')),
      }

      const res = await fetch(`${API_BASE_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenVal}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || `Failed (HTTP ${res.status})`)
      }

      await fetchTickets()
      setAddModalOpen(false)
    } catch (err: any) {
      console.error(err)
      alert(`Could not add ticket: ${err.message || 'Unknown error'}`)
    } finally {
      setSavingManual(false)
    }
  }

  const openEditModal = (ticket: Ticket) => {
    const preferred = getPreferredDateKey(ticket)
    const status = ticket.status || 'PENDING'
    setEditOriginalDate(preferred)
    setEditInitialStatus(status)
    const form = {
      id: ticket.id,
      preferredDate: preferred,
      customerName: ticket.customerName || ticket.customer_name || ticket.title || '',
      contactPhone: ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '',
      location: formatAddress(ticket.location),
      district: ticket.district || parseDistrict(ticket.location) || '',
      commitTerms: ticket.commitTerms || ticket.commitType || ticket.description || '',
      unitType: ticket.unitType || ticket.unit_type || parseBrand(ticket) || '',
      sourceVendor: ticket.sourceVendor || ticket.source_vendor || ticket.dealer || 'Direct',
      serviceDriver: formatServiceDriver(ticket),
      installerName: getInstallerDisplay(ticket) || ticket.installerName || getF(ticket, 'assignedEmployeeName', 'assigned_employee_name') || '',
      negotiatorId: ticket.negotiatorId || ticket.negotiator_id || '',
      ticketNumber: ticket.ticketNumber || ticket.ticket_number || '',
      controlNumber: ticket.controlNumber || ticket.control_number || '',
      ticketCategory: inferCategoryFromTicket(ticket),
      status,
      installationCharges: ticket.installationCharges ?? ticket.installation_charges,
      modeOfPayment: ticket.modeOfPayment ?? ticket.mode_of_payment,
      remarks: ticket.remarks || ticket.remarksUpdate || '',
      acDetails: ticket.acDetails || ticket.ac_details,
      rescheduleToDate: (ticket.status || '').toUpperCase() === 'RESCHED' ? preferred : '',
    }
    setEditForm(form)
    setEditFormSnapshot(JSON.stringify(form))
    setEditModalOpen(true)
  }

  const isEditFormDirty = () => JSON.stringify(editForm) !== editFormSnapshot

  const requestCloseEditModal = () => {
    if (isEditFormDirty()) {
      setConfirmModal({
        title: 'Discard changes?',
        message: 'You have unsaved edits on this ticket.',
        detail: editForm.customerName?.trim() || undefined,
        variant: 'discard',
        confirmText: 'Discard',
        cancelText: 'Keep Editing',
        onConfirm: () => setEditModalOpen(false),
      })
      return
    }
    setEditModalOpen(false)
  }

  const openAddModal = () => {
    const form = {
      preferredDate: todayDateKey(),
      customerName: '',
      contactPhone: '',
      location: '',
      district: '',
      commitTerms: '',
      unitType: '',
      sourceVendor: 'Direct',
      serviceDriver: '',
      installerName: '',
      negotiatorId: '',
      ticketNumber: '',
      controlNumber: '',
      modeOfPayment: '',
      installationCharges: undefined as number | undefined,
      ticketCategory: 'INSTALLATION' as TicketCategoryValue,
    }
    setAddForm(form)
    setAddFormSnapshot(JSON.stringify(form))
    setAddModalOpen(true)
  }

  const isAddFormDirty = () => JSON.stringify(addForm) !== addFormSnapshot

  const requestCloseAddModal = () => {
    if (isAddFormDirty()) {
      setConfirmModal({
        title: 'Discard new ticket?',
        message: 'Unsaved details will be lost.',
        detail: addForm.customerName?.trim() || undefined,
        variant: 'discard',
        confirmText: 'Discard',
        cancelText: 'Keep Editing',
        onConfirm: () => setAddModalOpen(false),
      })
      return
    }
    setAddModalOpen(false)
  }

  const validateEditForm = (): string | null => {
    if (!editForm.id) return 'Ticket not found'
    const isReschedStatusEarly = (editForm.status || '').toUpperCase() === 'RESCHED'
    if (isReschedStatusEarly) {
      if (!editForm.rescheduleToDate?.trim()) return 'Select a reschedule date beside the RESCHED status'
    } else if (!editForm.preferredDate) {
      return 'Preferred Date is required'
    }
    if (!editForm.customerName?.trim()) return 'Customer Name is required'
    if (!editForm.contactPhone?.trim()) return 'Contact No. is required'
    if (!editForm.location?.trim()) return 'Destination/Address is required'
    return null
  }

  const promptSaveEditTicket = () => {
    const error = validateEditForm()
    if (error) {
      alert(error)
      return
    }
    const name = editForm.customerName?.trim() || 'this customer'
    setConfirmModal({
      title: 'Save ticket changes?',
      message: `Your updates will be applied to the schedule for ${name}.`,
      variant: 'save',
      confirmText: 'Save Changes',
      cancelText: 'Not Yet',
      onConfirm: () => void commitSaveEditTicket(),
    })
  }
  const commitSaveEditTicket = async () => {
    if (!editForm.id) return
    const isReschedStatusEarly = (editForm.status || '').toUpperCase() === 'RESCHED'
    const isReschedStatus = isReschedStatusEarly
    setSavingEdit(true)
    try {
      const tokenVal = token()
      const category = editForm.ticketCategory || 'INSTALLATION'
      const { serviceType, serviceVehicle } = parseServiceDriverValue(editForm.serviceDriver, category)
      const titleVal = `${categoryDefaultServiceType(category)} service`
      const descVal = editForm.commitTerms?.trim() || 'No additional details provided.'

      const oldDateKey = editOriginalDate?.split('T')[0]?.trim() || ''
      const newDateKey = isReschedStatus
        ? editForm.rescheduleToDate?.split('T')[0]?.trim() || ''
        : editForm.preferredDate?.split('T')[0]?.trim() || ''
      const isDateMove = Boolean(oldDateKey && newDateKey && oldDateKey !== newDateKey)

      const body: Record<string, any> = {
        customerName: (editForm.customerName || '').trim(),
        title: titleVal,
        description: descVal,
        serviceType,
        ticketCategory: category,
        location: (editForm.location || '').trim(),
        contactPhone: (editForm.contactPhone || '').trim(),
        unitType: editForm.unitType?.trim() || undefined,
        preferredDate: newDateKey,
        sourceVendor: editForm.sourceVendor?.trim() || 'Direct',
        district: editForm.district?.trim() || undefined,
        commitType: editForm.commitTerms?.trim() || undefined,
        serviceVehicle: serviceVehicle || undefined,
        installerName: editForm.installerName?.trim() || undefined,
        negotiatorId: editForm.negotiatorId || undefined,
        ticketNumber: editForm.ticketNumber?.trim() || undefined,
        controlNumber: editForm.controlNumber?.trim() || undefined,
        status: isReschedStatus ? 'RESCHED' : (isDateMove ? 'SCHEDULED' : (editForm.status || 'PENDING')),
        remarks: editForm.remarks?.trim() || undefined,
        remarksUpdate: editForm.remarks?.trim() || undefined,
      }

      const originalTicket = tickets.find(t => t.id === editForm.id)
      const paymentCharges = editForm.installationCharges ?? originalTicket?.installationCharges ?? originalTicket?.installation_charges
      const paymentMode = editForm.modeOfPayment ?? originalTicket?.modeOfPayment ?? originalTicket?.mode_of_payment
      if (paymentCharges != null && !Number.isNaN(Number(paymentCharges))) {
        body.installationCharges = Number(paymentCharges)
      }
      if (paymentMode) body.modeOfPayment = paymentMode

      const acMetaExtras: Record<string, any> = {}
      if (isDateMove) {
        const existing = parseAcMeta(editForm as Ticket)
        const prevDates: string[] = Array.isArray(existing.previousScheduleDates)
          ? [...existing.previousScheduleDates]
          : []
        if (!prevDates.includes(oldDateKey)) prevDates.push(oldDateKey)
        acMetaExtras.previousScheduleDates = prevDates
        acMetaExtras.rescheduledTo = newDateKey
      }

      body.acDetails = mergeAcMeta(editForm as Ticket, {
        ...acMetaExtras,
        destination: editForm.location.trim(),
        address: editForm.location.trim(),
        district: editForm.district?.trim() || undefined,
        brand: editForm.unitType?.trim() || undefined,
        unitType: editForm.unitType?.trim() || undefined,
        dealer: editForm.sourceVendor?.trim() || undefined,
        dlr: editForm.sourceVendor?.trim() || undefined,
        update: editForm.remarks?.trim() || undefined,
        remarksUpdate: editForm.remarks?.trim() || undefined,
        installerName: editForm.installerName?.trim() || undefined,
      })

      const shouldComplete = Boolean(
        originalTicket
        && !isReschedStatus
        && (originalTicket.status || '').toUpperCase() !== 'COMPLETED'
        && qualifiesForInstallComplete(
          { ...originalTicket, ...body, remarksUpdate: body.remarksUpdate, remarks: body.remarks },
          { remarksUpdate: body.remarksUpdate, remarks: body.remarks, installationCharges: body.installationCharges, modeOfPayment: body.modeOfPayment },
        ),
      )

      let finalBody: Record<string, any> = body
      if (shouldComplete && originalTicket) {
        const schedKey = oldDateKey || getPreferredDateKey(originalTicket)
        const ticketWithEdits = { ...originalTicket, ...body, acDetails: body.acDetails }
        finalBody = enrichCompletePatchBody({ ...body }, ticketWithEdits, schedKey)
      }

      const res = await fetch(`${API_BASE_URL}/tickets/${editForm.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenVal}`,
        },
        body: JSON.stringify(finalBody),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || `Failed (HTTP ${res.status})`)
      }

      if (shouldComplete && originalTicket) {
        const reportDate = oldDateKey || newDateKey || todayDateKey()
        const charges = finalBody.installationCharges ?? paymentCharges ?? 0
        const mode = finalBody.modeOfPayment ?? paymentMode ?? 'CASH'
        const remarks = finalBody.remarksUpdate || finalBody.remarks || 'Installed'
        try {
          const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
            body: JSON.stringify({
              branchId: resolveImportBranchId(originalTicket.branchId),
              reportDate,
              customerName: body.customerName,
              customerAddress: body.location,
              customerPhone: body.contactPhone,
              district: body.district,
              serviceType: String(mode).toUpperCase() === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
              statusCode: 'I',
              commitTerms: body.commitType || '',
              dealer: body.sourceVendor,
              unitBrandModel: body.unitType,
              technicianName: body.installerName,
              amountCharged: parseFloat(String(charges)) || 0,
              paymentStatus: mode,
              jobStatus: 'COMPLETED',
              remarks,
              note: originalTicket.note || '',
              controlNumber: body.controlNumber || originalTicket.controlNumber || '',
              serviceColumn: body.serviceVehicle || originalTicket.serviceVehicle || '',
            }),
          })
          if (!reportRes.ok) console.warn('Archive service report failed:', await reportRes.text())
        } catch (err) {
          console.warn('Archive service report failed:', err)
        }
      }

      showToast(shouldComplete
        ? 'Ticket completed — see Archives tab ✓'
        : isDateMove
          ? `Rescheduled to ${formatDateKeyLabel(newDateKey)} ✓`
          : 'Ticket updated successfully ✓')
      await fetchTickets()
      setEditModalOpen(false)
    } catch (err: any) {
      console.error(err)
      alert(`Could not update ticket: ${err.message || 'Unknown error'}`)
    } finally {
      setSavingEdit(false)
    }
  }

  const resolveImportBranchId = useCallback((ticketBranchId?: string) => {
    const branchEmployee = isEmployee && !isAdmin && !isManager
    const branchSource = branchEmployee
      ? (user?.branchId || localStorage.getItem('ashcol-global-branch-id'))
      : (globalBranchId || user?.branchId || localStorage.getItem('ashcol-global-branch-id'))
    return resolveScopedBranchId(ticketBranchId || branchSource)
  }, [globalBranchId, user?.branchId, isEmployee, isAdmin, isManager])

  const handleApplyImport = async () => {
    if (!importResults) return
    if (!importTargetDate?.trim()) {
      alert('Select an import date first — tickets will be saved as SCHEDULED for that date.')
      return
    }
    setSaving(true)
    let successCount = 0
    let completeCount = 0
    let failCount = 0
    let createdCount = 0

    const tokenVal = token()
    const todayStr = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

    const targetBranch = resolveImportBranchId()
    const importerUserId = user?.id
    const scheduleDate = importTargetDate?.trim() || ''
    const isScheduleImport = scheduleDate.length > 0

    const normalUpdates = importResults.updates.filter(item => item.updatedFields.status !== 'COMPLETED')
    const completedUpdates = importResults.updates.filter(item => item.updatedFields.status === 'COMPLETED')

    if (!targetBranch && (importResults.unmatched.length > 0 || (completedUpdates.length > 0 && !isScheduleImport))) {
      setSaving(false)
      alert('Select a branch before importing — use the branch selector in the sidebar.')
      return
    }

    const importErrors: string[] = []

    const scheduleUpdates = isScheduleImport
      ? importResults.updates.map(item => {
          const merged = { ...item.ticket, ...item.updatedFields }
          if (qualifiesForInstallComplete(merged, item.updatedFields)) {
            return { ...item, updatedFields: { ...item.updatedFields, status: 'COMPLETED' as Ticket['status'] } }
          }
          if ((item.updatedFields.status || '').toUpperCase() === 'COMPLETED') {
            return { ...item, updatedFields: { ...item.updatedFields, status: 'SCHEDULED' as Ticket['status'] } }
          }
          return item
        })
      : normalUpdates

    const postCompletedServiceReport = async (ticket: Ticket, updatedFields: Partial<Ticket>, reportDate: string) => {
      const custName = getF(ticket, 'customerName', 'customer_name') || ticket.title
      const charges = updatedFields.installationCharges ?? ticket.installationCharges ?? ticket.amountCharged ?? 0
      const mode = updatedFields.modeOfPayment ?? ticket.modeOfPayment ?? 'CASH'
      const remarks = (updatedFields.remarksUpdate ?? ticket.remarksUpdate ?? ticket.remarks) || 'Installed'
      const controlNo = updatedFields.controlNumber ?? ticket.controlNumber ?? ''
      const serviceReportPayload = {
        branchId: resolveImportBranchId(ticket.branchId),
        reportDate: reportDate || todayStr,
        customerName: custName,
        customerAddress: formatAddress(updatedFields.location ? updatedFields.location : ticket.location),
        customerPhone: getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
        district: parseDistrict(updatedFields.location ? updatedFields.location : ticket.location, updatedFields.district || ticket.district),
        serviceType: mode === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
        statusCode: 'I',
        commitTerms: getF(ticket, 'commitTerms', 'description') || ticket.description || '',
        dealer: updatedFields.sourceVendor || getF(ticket, 'dealer'),
        unitBrandModel: updatedFields.unitType || parseBrand(ticket),
        technicianName: updatedFields.installerName || getF(ticket, 'assignedEmployeeName', 'assigned_employee_name'),
        amountCharged: parseFloat(String(charges)) || 0,
        paymentStatus: mode,
        jobStatus: 'COMPLETED',
        remarks,
        note: updatedFields.note || ticket.note || '',
        controlNumber: controlNo,
        serviceColumn: updatedFields.serviceVehicle || ticket.serviceVehicle || ticket.service_vehicle || '',
      }
      const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
        body: JSON.stringify(serviceReportPayload),
      })
      if (!reportRes.ok) throw new Error(await readApiError(reportRes))
    }

    for (const item of scheduleUpdates) {
      const { ticket, updatedFields } = item
      const merged = { ...ticket, ...updatedFields }
      const shouldComplete = qualifiesForInstallComplete(merged, updatedFields)
        || (updatedFields.status || '').toUpperCase() === 'COMPLETED'

      let body = buildPatchImportBody(ticket, updatedFields, scheduleDate || undefined, importerUserId, targetBranch || undefined)
      if (Object.keys(body).length === 0 && !shouldComplete) continue

      if (shouldComplete && isScheduleImport) {
        body = enrichCompletePatchBody({ ...body }, ticket, scheduleDate || getPreferredDateKey(ticket))
      }

      try {
        const res = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          successCount++
          if (shouldComplete && isScheduleImport) {
            try {
              await postCompletedServiceReport(ticket, updatedFields, scheduleDate || todayStr)
              completeCount++
            } catch (err: any) {
              importErrors.push(`Completed ticket but archive report failed: ${err?.message || 'unknown'}`)
            }
          }
        } else {
          failCount++
          importErrors.push(await readApiError(res))
        }
      } catch (err: any) {
        failCount++
        importErrors.push(err?.message || 'Update failed')
      }
    }

    if (isScheduleImport) {
      for (const item of importResults.needsConfirmation) {
        const { ticket, value, amount, modeOfPayment, controlNumber } = item
        const body = buildPatchImportBody(
          ticket,
          {
            remarksUpdate: value,
            installationCharges: parseFloat(amount) || undefined,
            modeOfPayment: modeOfPayment,
            controlNumber: controlNumber,
            status: 'SCHEDULED',
          },
          scheduleDate,
          importerUserId,
          targetBranch || undefined,
        )
        if (Object.keys(body).length === 0) continue
        try {
          const res = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
            body: JSON.stringify(body),
          })
          if (res.ok) successCount++
          else {
            failCount++
            importErrors.push(await readApiError(res))
          }
        } catch (err: any) {
          failCount++
          importErrors.push(err?.message || 'Confirmation update failed')
        }
      }
    }

    if (!isScheduleImport) for (const item of completedUpdates) {
      const { ticket, updatedFields } = item
      const custName = getF(ticket, 'customerName', 'customer_name') || ticket.title
      const charges = updatedFields.installationCharges ?? ticket.installationCharges ?? ticket.amountCharged ?? 0
      const mode = updatedFields.modeOfPayment ?? ticket.modeOfPayment ?? 'CASH'
      const remarks = (updatedFields.remarksUpdate ?? ticket.remarks) || 'Installed'
      const controlNo = updatedFields.controlNumber ?? ticket.controlNumber ?? ''

      const serviceReportPayload = {
        branchId: resolveImportBranchId(ticket.branchId),
        reportDate: importTargetDate || todayStr,
        customerName: custName,
        customerAddress: formatAddress(updatedFields.location ? updatedFields.location : ticket.location),
        customerPhone: getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
        district: parseDistrict(updatedFields.location ? updatedFields.location : ticket.location, updatedFields.district || ticket.district),
        serviceType: mode === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
        statusCode: 'I',
        commitTerms: getF(ticket, 'commitTerms', 'description') || ticket.description || '',
        dealer: updatedFields.sourceVendor || getF(ticket, 'dealer'),
        unitBrandModel: updatedFields.unitType || parseBrand(ticket),
        technicianName: updatedFields.installerName || getF(ticket, 'assignedEmployeeName', 'assigned_employee_name'),
        amountCharged: parseFloat(String(charges)) || 0,
        paymentStatus: mode,
        jobStatus: 'COMPLETED',
        remarks: remarks,
        note: updatedFields.note || ticket.note || '',
        controlNumber: controlNo,
        serviceColumn: updatedFields.serviceVehicle || ticket.serviceVehicle || ticket.service_vehicle || ''
      }

      try {
        const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
          body: JSON.stringify(serviceReportPayload)
        })
        if (!reportRes.ok) throw new Error(await readApiError(reportRes))

        const deleteRes = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenVal}` }
        })
        if (deleteRes.ok) {
          completeCount++
        } else {
          failCount++
          importErrors.push(await readApiError(deleteRes))
        }
      } catch (err: any) {
        console.error('Error completing ticket:', err)
        failCount++
        importErrors.push(err?.message || 'Complete failed')
      }
    }

    if (!isScheduleImport) for (const item of importResults.needsConfirmation) {
      const { ticket, value, amount, modeOfPayment, controlNumber } = item
      const custName = getF(ticket, 'customerName', 'customer_name') || ticket.title

      const serviceReportPayload = {
        branchId: resolveImportBranchId(ticket.branchId),
        reportDate: importTargetDate || todayStr,
        customerName: custName,
        customerAddress: formatAddress(ticket.location),
        customerPhone: getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
        district: parseDistrict(ticket.location, ticket.district),
        serviceType: modeOfPayment === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
        statusCode: 'I',
        commitTerms: getF(ticket, 'commitTerms', 'description') || ticket.description || '',
        dealer: getF(ticket, 'dealer'),
        unitBrandModel: parseBrand(ticket),
        technicianName: getF(ticket, 'assignedEmployeeName', 'assigned_employee_name'),
        amountCharged: parseFloat(amount) || 0,
        paymentStatus: modeOfPayment,
        jobStatus: 'COMPLETED',
        remarks: value || 'Installed',
        note: ticket.note || '',
        controlNumber: controlNumber
      }

      try {
        const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
          body: JSON.stringify(serviceReportPayload)
        })
        if (!reportRes.ok) throw new Error(await readApiError(reportRes))

        const deleteRes = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenVal}` }
        })
        if (deleteRes.ok) {
          completeCount++
        } else {
          failCount++
          importErrors.push(await readApiError(deleteRes))
        }
      } catch (err: any) {
        console.error('Error completing ticket:', err)
        failCount++
        importErrors.push(err?.message || 'Complete failed')
      }
    }

    // Save unmatched rows as new tickets (schedule import keeps everything on tickets table)
    const unmatchedToCreate = isScheduleImport
      ? importResults.unmatched
      : importResults.unmatched.filter(item => !isUnmatchedImportComplete(item))
    const unmatchedToComplete = isScheduleImport
      ? []
      : importResults.unmatched.filter(item => isUnmatchedImportComplete(item))

    if (unmatchedToCreate.length > 0) {
      try {
        const res = await fetch(`${API_BASE_URL}/tickets/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenVal}`,
          },
          body: JSON.stringify({
            branchId: targetBranch,
            preferredDate: scheduleDate || undefined,
            rows: unmatchedToCreate.map(item => buildImportCreateRow(item, scheduleDate || undefined)),
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const result = data?.data
          createdCount += result?.created ?? 0
          if (result?.failed) {
            failCount += result.failed
            if (Array.isArray(result.errors) && result.errors.length > 0) {
              importErrors.push(...result.errors)
            }
          }
        } else {
          failCount += unmatchedToCreate.length
          importErrors.push(await readApiError(res))
        }
      } catch (err: any) {
        console.error('Failed to bulk import unmatched tickets:', err)
        failCount += unmatchedToCreate.length
        importErrors.push(err?.message || 'Bulk create failed')
      }
    }

    for (const item of unmatchedToComplete) {
        const charges = item.charges ?? 0
        const mode = item.paymentMode || 'CASH'
        const remarks = item.update || 'Installed'
        const controlNo = item.controlNo || ''

        const serviceReportPayload = {
          branchId: targetBranch,
          reportDate: importTargetDate || todayStr,
          customerName: item.name,
          customerAddress: formatAddress(item.location),
          customerPhone: item.phone,
          district: parseDistrict(item.location, item.district),
          serviceType: mode === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
          statusCode: 'I',
          commitTerms: item.commit || item.note || 'Excel imported completed ticket',
          dealer: item.dlr,
          unitBrandModel: item.brand || 'Split AC',
          technicianName: item.installer,
          amountCharged: parseFloat(String(charges)) || 0,
          paymentStatus: mode,
          jobStatus: 'COMPLETED',
          remarks: remarks,
          note: item.note || '',
          controlNumber: controlNo,
          serviceColumn: item.service || ''
        }

        try {
          const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
            body: JSON.stringify(serviceReportPayload)
          })
          if (reportRes.ok) {
            completeCount++
          } else {
            failCount++
            importErrors.push(await readApiError(reportRes))
          }
        } catch (err: any) {
          console.error('Error completing unmatched ticket:', err)
          failCount++
          importErrors.push(err?.message || 'Unmatched complete failed')
        }
    }

    setSaving(false)
    setImportResults(null)
    const failHint = failCount > 0 && importErrors.length > 0 ? ` First error: ${importErrors[0]}` : ''
    showToast(`Updated ${successCount} tickets, Completed & Paid ${completeCount} tickets, Created ${createdCount} new tickets!${failCount > 0 ? ` (Failed: ${failCount})${failHint}` : ''}`)
    fetchTickets()
  }

  useEffect(() => {
    if (!detailTicket) {
      setHistory([])
      return
    }
    setLoadingHistory(true)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    fetch(`${API_BASE_URL}/tickets/${detailTicket.id}/history`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setHistory(res.data)
        }
      })
      .catch(err => console.error('Error fetching history:', err))
      .finally(() => setLoadingHistory(false))
  }, [detailTicket])

  // ── Expand cols / cells ───────────────────────────────────────────────────
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})
  const [editingCell, setEditingCell] = useState<{ ticketId: string; colLabel: string; value: string } | null>(null)
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null)
  const cellEditBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const toggleCol = useCallback((label: string) =>
    setExpandedCols(p => ({ ...p, [label]: !p[label] })), [])

  const activeCellOverlay = Boolean(editingCell || hoveredCell)

  useEffect(() => {
    const target = editingCell || hoveredCell
    if (!target) return
    const timer = setTimeout(() => {
      const el = tableScrollRef.current?.querySelector(
        `[data-cell-key="${target.ticketId}:${target.colLabel}"]`,
      )
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }, 40)
    return () => clearTimeout(timer)
  }, [editingCell, hoveredCell])



  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  // ── Column config ─────────────────────────────────────────────────────────
  const columns = useMemo(() => {
    const raw = [
      { label: "CUSTOMER'S NAME", display: "CUSTOMER", w: 180, expW: 300, sticky: true,  freeze: false, align: 'left' as const },
      { label: 'DESTINATION',     display: "ADDRESS", w: 250, expW: 450, sticky: true,  freeze: true,  align: 'center' as const },
      { label: 'BRAND',           display: "BRAND", w: 150, expW: 260, sticky: false, freeze: false, align: 'center' as const },
      { label: 'DLR',             display: isTaguigServices ? "ENDORSED BY" : "DEALER", w: 130, expW: 200, sticky: false, freeze: false, align: 'center' as const },
      { label: 'STATUS',          display: "STATUS", w: 100, expW: 150, sticky: false, freeze: false, align: 'center' as const },
      { label: 'COMMIT',          display: isTaguigServices ? "COMMIT" : "COMMIT", w: 160, expW: 300, sticky: false, freeze: false, align: 'center' as const },
      { label: 'INSTALLER',       display: isTaguigServices ? "TECHNICIAN" : "INSTALLER", w: 150, expW: 260, sticky: false, freeze: false, align: 'center' as const, sortable: true },
      { label: 'SERVICE',         display: "DRIVER", w: 120, expW: 200, sticky: false, freeze: false, align: 'center' as const, sortable: true },
      { label: 'UPDATE',          display: isTaguigServices ? "SERVICE STATUS" : "REMARKS", w: 180, expW: 360, sticky: false, freeze: false, align: 'right' as const },
    ]
    let left = 0
    return raw.map(c => {
      const isExpanded = !!expandedCols[c.label]
      const width = isExpanded ? c.expW : c.w
      const l = c.sticky ? left : 0
      if (c.sticky) left += width
      return { ...c, isExpanded, width, baseWidth: c.w, expWidth: c.expW, left: l }
    })
  }, [expandedCols, isTaguigServices])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const token = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const fetchTickets = useCallback(async () => {
    if (!user) return
    setLoading(true); setFetchError(null)
    try {
      const ep   = isCustomer ? '/tickets/my' : isAdmin ? '/tickets' : '/tickets/branch'
      const size = isAdmin ? 300 : 200
      const list = await fetchTicketsPage(ep, token(), { size })
      setTickets(list as Ticket[])
    } catch { setFetchError('Failed to load tickets. Check your connection.') }
    finally  { setLoading(false) }
  }, [user, isCustomer, isAdmin, token])

  useEffect(() => { fetchTickets() }, [fetchTickets])
  useEffect(() => { if (isAdmin) fetchTickets() }, [globalBranchId, isAdmin])

  useEffect(() => {
    if (canEdit) {
      const headers = { Authorization: `Bearer ${token()}` }
      const branchSource = resolveScopedBranchId(globalBranchId || user?.branchId || localStorage.getItem('ashcol-global-branch-id') || '')
      fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers })
        .then(res => res.json())
        .then(data => {
          const list = Array.isArray(data) ? data : (data?.data || [])
          if (!Array.isArray(list)) return
          const mapped = list.map((u: any) => ({
            id: u.id,
            name: u.name,
            branchId: u.branchId || u.branch_id,
          }))
          const filtered = branchSource
            ? mapped.filter((u: { branchId?: string }) => branchesMatch(u.branchId, branchSource))
            : mapped
          setBranchEmployees(filtered.length > 0 ? filtered : mapped)
        })
        .catch(err => console.error('Failed to load branch employees:', err))
    }
  }, [canEdit, token, globalBranchId, user?.branchId])

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = tickets.filter(t => {
      if (!isFieldCategory(inferCategoryFromTicket(t))) return false
      const stat = (t.status || '').toUpperCase()

      if (stat === 'COMPLETED') {
        return Boolean(dateFilter && isCompletedGhostOnDate(t, dateFilter))
      }

      let hasFinalDate = false
      if (t.acDetails) {
        try {
          const parsed = JSON.parse(t.acDetails)
          hasFinalDate = !!parsed.finalDate
        } catch {}
      }

      const isScheduled = stat === 'SCHEDULED' || hasFinalDate
      const isResched = stat === 'RESCHED'
      const isForApproval = stat === 'FOR APPROVAL' || stat === 'FOR_APPROVAL' || stat === 'FOR QUOTATION' || stat === 'FOR_QUOTATION' || stat.includes('QUOTATION')
      
      const cat = `${t.serviceType || ''} ${t.title || ''}`.toLowerCase()
      const isSurvey = cat.includes('survey') || stat === 'SURVEY'

      return isScheduled || isResched || isForApproval || isSurvey
    })
    if (isAdmin && globalBranchId && globalBranchId !== 'ALL_BRANCHES') {
      list = list.filter(t => {
        const b = (t.branchId || t.branch_id || '').toUpperCase()
        if (!b) return true
        const g = (globalBranchId || '').toUpperCase()
        const cleanB = b.replace(/-(SALES|SERVICES)$/, '').replace(/-(SALES|SERVICES)$/, '')
        const cleanG = g.replace(/-(SALES|SERVICES)$/, '').replace(/-(SALES|SERVICES)$/, '')
        return cleanB === cleanG
      })
    }
    if (dateFilter) {
      list = list.filter(t => ticketMatchesDateKey(t, dateFilter) || isScheduleGhostOnDate(t, dateFilter))
      list = [...list].sort((a, b) => {
        const aGhost = isScheduleGhostOnDate(a, dateFilter)
        const bGhost = isScheduleGhostOnDate(b, dateFilter)
        if (aGhost === bGhost) return 0
        return aGhost ? 1 : -1
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        [t.customerName, t.customer_name, t.contactPhone, t.assignedEmployeeName,
         t.assigned_employee_name, t.serviceType, t.service_type, t.description,
         t.remarks, t.note, t.id, t.ticketNumber, t.ticket_number].some(v => v?.toLowerCase().includes(q))
        || formatAddress(t.location).toLowerCase().includes(q)
      )
    }
    return list
  }, [tickets, isAdmin, globalBranchId, dateFilter, searchQuery])

  const installerOptions = useMemo(() => {
    const names = new Map<string, string>()
    filtered.forEach(t => {
      const raw = getInstallerDisplay(t).trim()
      if (!raw) return
      const { name, label } = parseNameSiteToken(raw)
      if (!name) return
      if (!names.has(name)) names.set(name, label || raw)
    })
    return [...names.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
      .map(([key, label]) => ({ key, label }))
  }, [filtered])

  const visible = useMemo(() => {
    let list = filtered
    if (installerFilter) {
      list = list.filter(t => parseNameSiteToken(getInstallerDisplay(t)).name === installerFilter)
    }
    if (sortConfig) {
      list = [...list].sort((a, b) => {
        const cmp = compareTicketsByColumn(a, b, sortConfig.column)
        return sortConfig.direction === 'desc' ? -cmp : cmp
      })
    }
    return list
  }, [filtered, installerFilter, sortConfig])

  const handleColumnSort = useCallback((colLabel: string) => {
    setSortConfig(prev => {
      if (prev?.column !== colLabel) return { column: colLabel, direction: 'asc' }
      if (prev.direction === 'asc') return { column: colLabel, direction: 'desc' }
      return null
    })
  }, [])

  const duplicateNameKeys = useMemo(() => {
    const counts = new Map<string, number>()
    visible.forEach(t => {
      const key = normalizeCustomerKey(getCustomerDisplayName(t))
      if (!key) return
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return new Set(
      [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key)
    )
  }, [visible])

  const counts = useMemo(() => {
    let scheduledOrRescheduled = 0
    let survey = 0
    let forQuotationOrForApproval = 0

    visible.forEach(t => {
      if (dateFilter && isScheduleGhostOnDate(t, dateFilter)) return
      const stat = (t.status || '').toUpperCase()
      const category = (t.serviceType || t.title || '').toLowerCase()
      const isSurvey = category.includes('survey') || stat === 'SURVEY'
      
      let hasFinalDate = false
      if (t.acDetails) {
        try {
          const parsed = JSON.parse(t.acDetails)
          hasFinalDate = !!parsed.finalDate
        } catch {}
      }

      const isScheduled = stat === 'SCHEDULED' || hasFinalDate
      const isResched = stat === 'RESCHED'
      const isForApproval = stat === 'FOR APPROVAL' || stat === 'FOR_APPROVAL' || stat === 'FOR QUOTATION' || stat === 'FOR_QUOTATION' || stat.includes('QUOTATION')

      if (isScheduled || isResched) {
        scheduledOrRescheduled++
      } else if (isSurvey) {
        survey++
      } else if (isForApproval) {
        forQuotationOrForApproval++
      }
    })

    return {
      scheduledOrRescheduled,
      survey,
      forQuotationOrForApproval
    }
  }, [visible, dateFilter])

  // ── Get display value for a column ────────────────────────────────────────
  function getCellDisplay(ticket: Ticket, colLabel: string): string {
    switch (colLabel) {
      case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title
      case 'DESTINATION':     return formatAddress(ticket.location)
      case 'DISTRICT':        return parseDistrict(ticket.location, ticket.district)
      case 'CONTACT NO.':     return getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
      case 'BRAND':           return parseBrand(ticket)
      case 'DLR':             return getF(ticket, 'sourceVendor', 'source_vendor', 'dealer') || ''
      case 'STATUS':          return ticket.status
      case 'SCHEDULED DATE':  return formatDateKeyLabel(getArchivedScheduleDate(ticket))
      case 'INSTALLED DATE':  return formatDateKeyLabel(getInstalledDateKey(ticket))
      case 'PAYMENT':         return formatPaymentAmount(ticket)
      case 'MOP':             return getPaymentMode(ticket)
      case 'COMMIT':          return getF(ticket, 'commitType', 'commitTerms', 'description')
      case 'INSTALLER':       return getInstallerDisplay(ticket)
      case 'NOTE':            return ticket.note || ''
      case 'SERVICE':         return formatServiceDriver(ticket)
      case 'UPDATE':          return ticket.remarksUpdate || ticket.remarks || ''
      default: return ''
    }
  }

  const cancelEdit = () => {
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    setEditingCell(null)
  }

  const cellEditKey = (ticketId: string, colLabel: string) => `${ticketId}:${colLabel}`

  const startCellEdit = (ticket: Ticket, colLabel: string) => {
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    setEditingCell({ ticketId: ticket.id, colLabel, value: getCellRawValue(ticket, colLabel) })
  }

  const saveCellEdit = async (ticket: Ticket, colLabel: string, value: string) => {
    const key = cellEditKey(ticket.id, colLabel)
    if (savingCellKey === key) return
    const body = buildCellPatchBody(ticket, colLabel, value)
    if (Object.keys(body).length === 0) {
      cancelEdit()
      return
    }
    setSavingCellKey(key)
    try {
      const res = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      setTickets(prev => prev.map(t => {
        if (t.id !== ticket.id) return t
        return {
          ...t,
          ...(body as Partial<Ticket>),
          acDetails: typeof body.acDetails === 'string' ? body.acDetails : t.acDetails,
        }
      }))
      showToast('Cell updated ✓')
      cancelEdit()
    } catch (err: any) {
      alert(`Could not save cell: ${err.message || 'Unknown error'}`)
    } finally {
      setSavingCellKey(null)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId)
    const name = ticket?.customerName || ticket?.customer_name || ticket?.title || 'this ticket'
    setContextMenu(null)
    setConfirmModal({
      title: 'Delete ticket?',
      message: 'This action cannot be undone.',
      detail: name,
      variant: 'danger',
      confirmText: 'Delete',
      onConfirm: () => void commitDeleteTicket(ticketId),
    })
  }

  const commitDeleteTicket = async (ticketId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token()}` }
      })
      if (!res.ok) throw new Error('Failed')
      setTickets(p => p.filter(t => t.id !== ticketId))
      showToast('Deleted')
    } catch { alert('Could not delete.') }
  }

  const promptClearAllVisible = () => {
    if (!isAdmin || visible.length === 0) return
    const count = visible.length
    const scope = [
      globalBranchId && globalBranchId !== 'ALL_BRANCHES' ? getBranchDisplayName(globalBranchId) : 'all branches',
      dateFilter ? formatDateTriggerLabel(dateFilter) : 'all dates',
      searchQuery.trim() ? `search "${searchQuery.trim()}"` : '',
    ].filter(Boolean).join(' / ')

    setConfirmModal({
      title: `Clear ${count} ticket${count === 1 ? '' : 's'}?`,
      message: 'All visible tickets in the current view will be permanently deleted.',
      detail: scope,
      variant: 'danger',
      confirmText: 'Clear All',
      onConfirm: () => void commitClearAllVisible(),
    })
  }

  const commitClearAllVisible = async () => {
    if (!isAdmin || visible.length === 0) return
    const count = visible.length

    setSaving(true)
    setContextMenu(null)
    try {
      const ids = visible.map(t => t.id)
      const results = await Promise.allSettled(ids.map(id =>
        fetch(`${API_BASE_URL}/tickets/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token()}` },
        })
      ))

      const deletedIds = new Set<string>()
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.ok) deletedIds.add(ids[index])
      })

      if (deletedIds.size > 0) {
        setTickets(prev => prev.filter(t => !deletedIds.has(t.id)))
      }

      const failed = count - deletedIds.size
      showToast(failed ? `Cleared ${deletedIds.size}; ${failed} failed` : `Cleared ${deletedIds.size} tickets`)
    } catch {
      alert('Could not clear tickets.')
    } finally {
      setSaving(false)
    }
  }

  function wrapEditingCell(editor: React.ReactNode, colLabel: string) {
    const col = columns.find(c => c.label === colLabel)
    const expW = col?.expWidth ?? 200
    const isTall = colLabel === 'DESTINATION' || colLabel === 'COMMIT' || colLabel === 'UPDATE'
    return (
      <div
        className="rounded-md"
        style={{
          minWidth: expW,
          width: '100%',
          minHeight: isTall ? 72 : 36,
          backgroundColor: isLight ? '#ffffff' : inputBg,
          border: `2px solid ${green}`,
          padding: '6px 8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        }}
      >
        {editor}
      </div>
    )
  }

  function renderInlineCellEditor(ticket: Ticket, colLabel: string, rowGhost?: boolean) {
    if (!editingCell || editingCell.ticketId !== ticket.id || editingCell.colLabel !== colLabel || rowGhost) return null

    const key = cellEditKey(ticket.id, colLabel)
    const isSaving = savingCellKey === key
    const inputStyle: React.CSSProperties = {
      width: '100%',
      fontSize: '11px',
      fontWeight: 600,
      padding: '4px 6px',
      borderRadius: 6,
      outline: 'none',
      backgroundColor: 'transparent',
      border: 'none',
      color: textPrimary,
      userSelect: 'text',
    }

    const commit = () => {
      if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
      void saveCellEdit(ticket, colLabel, editingCell.value)
    }

    const onBlur = () => {
      cellEditBlurTimer.current = setTimeout(commit, 120)
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      } else if (e.key === 'Enter' && !e.shiftKey && colLabel !== 'DESTINATION' && colLabel !== 'COMMIT' && colLabel !== 'UPDATE') {
        e.preventDefault()
        commit()
      }
    }

    if (colLabel === 'STATUS') {
      return wrapEditingCell(
        <select
          autoFocus
          disabled={isSaving}
          value={editingCell.value}
          onChange={e => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
          onBlur={onBlur}
          onClick={e => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className="w-full text-xs font-semibold rounded-md outline-none"
          style={inputStyle}
        >
          {STATUS_OPTS.map(opt => (
            <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
          ))}
        </select>,
        colLabel,
      )
    }

    if (colLabel === 'DESTINATION' || colLabel === 'COMMIT' || colLabel === 'UPDATE') {
      return wrapEditingCell(
        <textarea
          autoFocus
          disabled={isSaving}
          rows={3}
          value={editingCell.value}
          onChange={e => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
          onBlur={onBlur}
          onClick={e => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className="w-full resize-y rounded-md outline-none"
          style={{ ...inputStyle, minHeight: 52, maxHeight: 110 }}
        />,
        colLabel,
      )
    }

    return wrapEditingCell(
      <input
        autoFocus
        disabled={isSaving}
        type="text"
        value={editingCell.value}
        onChange={e => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
        onBlur={onBlur}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full rounded-md outline-none"
        style={inputStyle}
      />,
      colLabel,
    )
  }

  function withEditPencil(
    content: React.ReactNode,
    ticket: Ticket,
    colLabel: string,
    rowGhost?: boolean,
  ) {
    if (!canEdit || rowGhost) return content
    const isEditing = editingCell?.ticketId === ticket.id && editingCell?.colLabel === colLabel
    if (isEditing) return content
    const isHovered = hoveredCell?.ticketId === ticket.id && hoveredCell?.colLabel === colLabel
    if (!isHovered) return content
    return (
      <div className="relative">
        <div style={{ paddingRight: 18 }}>{content}</div>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
          onClick={e => { e.stopPropagation(); startCellEdit(ticket, colLabel) }}
          title="Edit in cell"
          className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 rounded hover:bg-emerald-500/15"
          style={{ color: textMuted, lineHeight: 1 }}
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    )
  }

  function renderCell(ticket: Ticket, col: (typeof columns)[0], idx?: number, rowGhost?: boolean, ghostKind?: 'completed' | 'resched' | null) {
    const { label } = col

    const inlineEditor = renderInlineCellEditor(ticket, label, rowGhost)
    if (inlineEditor) return inlineEditor

    // ── DISPLAY STATE ──
    const val = getCellDisplay(ticket, label)
    const ghostMuted = rowGhost
      ? (ghostKind === 'completed' ? (isLight ? '#166534' : '#86efac') : ghostKind === 'resched' ? (isLight ? '#a16207' : '#fbbf24') : textMuted)
      : textPrimary
    const isHoveredCell = hoveredCell?.ticketId === ticket.id && hoveredCell?.colLabel === label
    const showExpanded = col.isExpanded || (canEdit && !rowGhost && label !== 'STATUS' && isHoveredCell)
    const truncStyle: React.CSSProperties = showExpanded
      ? { wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45, display: 'block', paddingRight: '4px', color: ghostMuted, opacity: rowGhost ? 0.72 : 1 }
      : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', color: ghostMuted, opacity: rowGhost ? 0.72 : 1 }

    if (label === 'STATUS') {
      if (rowGhost) {
        if (ghostKind === 'completed' || isCompletedGhostOnDate(ticket, dateFilter)) {
          const installed = getInstalledDateKey(ticket)
          return (
            <span style={{ ...truncStyle, fontWeight: 700, fontStyle: 'italic', color: isLight ? '#15803d' : '#86efac' }} title={`Installed ${formatDateKeyLabel(installed)} — see Archives tab`}>
              INSTALLED → {formatDateKeyLabel(installed)}
            </span>
          )
        }
        const movedTo = getPreferredDateKey(ticket)
        return (
          <span style={{ ...truncStyle, fontWeight: 700, fontStyle: 'italic', color: isLight ? '#a16207' : '#fbbf24' }} title={`Rescheduled to ${formatDateKeyLabel(movedTo)}`}>
            RESCHED → {formatDateKeyLabel(movedTo)}
          </span>
        )
      }
      return (
        <span style={{ ...truncStyle, fontWeight: 700 }} title={val}>
          {val ? val.replace(/_/g, ' ') : '—'}
        </span>
      )
    }

    if (label === 'SERVICE') {
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 500 }} title={val}>
          {val || '—'}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'CONTACT NO.') {
      const formatted = val ? fmtPhone(val) || val : ''
      return withEditPencil(
        <a href={val ? `tel:${val.replace(/\D/g,'').replace(/^0/,'+63')}` : '#'}
           style={{ color: '#10B981', ...truncStyle }}
           onClick={e => { e.stopPropagation(); }}
           title={val}>
          {formatted}
        </a>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'NOTE') {
      return withEditPencil(
        <span style={{ ...truncStyle, color: val ? '#EF4444' : textMuted, fontWeight: val ? 600 : 400 }}
              title={val} className={showExpanded ? '' : 'line-clamp-2'}>
          {val || ''}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'UPDATE') {
      if (rowGhost) {
        if (ghostKind === 'completed' || isCompletedGhostOnDate(ticket, dateFilter)) {
          return (
            <span style={{ ...truncStyle, color: isLight ? '#15803d' : '#86efac', fontWeight: 600, fontStyle: 'italic' }}
                  title="Completed — see Archives tab">
              Archived
            </span>
          )
        }
        const movedTo = getPreferredDateKey(ticket)
        return (
          <span style={{ ...truncStyle, color: isLight ? '#a16207' : '#fbbf24', fontWeight: 600, fontStyle: 'italic' }}
                title={`Moved to ${formatDateKeyLabel(movedTo)}`}>
            Moved to {formatDateKeyLabel(movedTo)}
          </span>
        )
      }
      return withEditPencil(
        <span style={{ ...truncStyle, color: val ? green : textMuted, fontWeight: val ? 600 : 400 }}
              title={val} className={showExpanded ? '' : 'line-clamp-2'}>
          {val || ''}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === "CUSTOMER'S NAME") {
      const prefix = idx !== undefined ? `${idx + 1}. ` : ''
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 600 }} title={`${prefix}${val}`}>{prefix}{val}</span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'INSTALLER') {
      return withEditPencil(
        <span style={{ ...truncStyle }} title={val}>{val}</span>,
        ticket, label, rowGhost,
      )
    }

    return withEditPencil(
      <span style={truncStyle} title={val}>{val}</span>,
      ticket, label, rowGhost,
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-8" onClick={() => {
      setContextMenu(null)
      if (!saving && !editModalOpen && !addModalOpen) cancelEdit()
      setHoveredCell(null)
      setAddMenuOpen(false)
    }}>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[9999] px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-2xl transition-all"
             style={{ backgroundColor: green }}>
          {saving ? '⏳ Saving…' : toast}
        </div>
      )}
      {saving && !toast && (
        <div className="fixed bottom-5 right-5 z-[9999] px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-2xl"
             style={{ backgroundColor: '#6366F1' }}>
          ⏳ Saving…
        </div>
      )}
      {scanning && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 animate-spin text-[#10B981] mb-2" />
          <span className="text-sm font-bold text-white">AI OCR scanning voucher/receipt...</span>
        </div>
      )}

      {/* ── Header bar ── */}
      <div className="rounded-2xl px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm"
           style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold"
                 style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', borderColor: inputBorder, color: textMuted }}>
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>{getBranchDisplayName(globalBranchId)}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 max-w-full overflow-x-auto no-scrollbar py-0.5">
            {/* Weekly Tabs */}
            {weeklyTabs.map(tab => {
              const isActive = dateFilter === tab.key
              return (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setDateFilter(tab.key)}
                  className="flex flex-col items-center justify-center px-3.5 py-1.5 rounded-xl text-center border min-w-[75px] cursor-pointer transition-all hover:scale-105"
                  style={{
                    backgroundColor: isActive ? green : inputBg,
                    borderColor: isActive ? green : inputBorder,
                    color: isActive ? '#ffffff' : textPrimary,
                    boxShadow: isActive ? '0 4px 12px rgba(22, 163, 74, 0.2)' : 'none'
                  }}
                >
                  <span className="text-[9px] uppercase tracking-wider font-black opacity-80">{tab.dayName}</span>
                  <span className="text-xs font-bold">{tab.dateLabel}</span>
                </button>
              )
            })}

            {/* Custom Tab if selected date is outside weekly tabs */}
            {isCustomSelected && (
              <button
                type="button"
                onClick={() => dateFilterInputRef.current?.showPicker?.()}
                className="flex flex-col items-center justify-center px-3.5 py-1.5 rounded-xl text-center border min-w-[75px] cursor-pointer transition-all hover:scale-105"
                style={{
                  backgroundColor: green,
                  borderColor: green,
                  color: '#ffffff',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.2)'
                }}
              >
                <span className="text-[9px] uppercase tracking-wider font-black opacity-80">Custom</span>
                <span className="text-xs font-bold">
                  {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </span>
              </button>
            )}

            {/* Calendar Picker Trigger */}
            {!isCustomSelected && (
              <div
                onClick={() => dateFilterInputRef.current?.showPicker?.()}
                className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl text-center border min-w-[45px] cursor-pointer transition-all hover:scale-105"
                style={{
                  backgroundColor: inputBg,
                  borderColor: inputBorder,
                  color: textPrimary
                }}
              >
                <CalendarDays className="w-3.5 h-3.5" style={{ color: green }} />
                <span className="text-[9px] uppercase tracking-wider font-black mt-0.5 opacity-60">Pick</span>
              </div>
            )}

            {/* Hidden date input */}
            <input
              ref={dateFilterInputRef}
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              tabIndex={-1}
              className="absolute opacity-0 pointer-events-none w-0 h-0"
              aria-label="Ticket date filter"
            />

            {/* All Tab */}
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="flex flex-col items-center justify-center px-3.5 py-1.5 rounded-xl text-center border min-w-[60px] cursor-pointer transition-all hover:scale-105"
              style={{
                backgroundColor: dateFilter === '' ? green : inputBg,
                borderColor: dateFilter === '' ? green : inputBorder,
                color: dateFilter === '' ? '#ffffff' : textPrimary,
                boxShadow: dateFilter === '' ? '0 4px 12px rgba(22, 163, 74, 0.2)' : 'none'
              }}
            >
              <span className="text-[9px] uppercase tracking-wider font-black opacity-80">View</span>
              <span className="text-xs font-bold">All</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canEdit && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddMenuOpen(!addMenuOpen);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:scale-105 shrink-0"
                style={{ backgroundColor: green, borderColor: green, color: '#ffffff' }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ticket</span>
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {addMenuOpen && (
                <div
                  className="absolute right-0 mt-1.5 rounded-xl shadow-2xl overflow-hidden z-[100] w-48 border"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                  onClick={() => setAddMenuOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAddMenuOpen(false)
                      openAddModal()
                    }}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors hover:bg-slate-500/10"
                    style={{ color: textPrimary }}
                  >
                    <Plus className="w-3.5 h-3.5" style={{ color: green }} />
                    Manual Add
                  </button>
                  <button
                    type="button"
                    onClick={() => scanFileInputRef.current?.click()}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors hover:bg-slate-500/10"
                    style={{ color: textPrimary }}
                  >
                    <Camera className="w-3.5 h-3.5 text-emerald-500" />
                    Scan Schedule Sheet
                  </button>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors hover:bg-slate-500/10 disabled:opacity-50"
                    style={{ color: textPrimary }}
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-500" />
                    Import Excel
                  </button>
                </div>
              )}
            </div>
          )}

          {canEdit && (
            <>
              {isAdmin && (
                <button
                  type="button"
                  onClick={promptClearAllVisible}
                  disabled={visible.length === 0 || saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:scale-105 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.45)', color: '#EF4444' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImport}
              />

              <input
                ref={scanFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleScanFilePicked}
              />
            </>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0"
               style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Wrench className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
            <select
              value={installerFilter}
              onChange={e => {
                const val = e.target.value
                setInstallerFilter(val)
                if (val) setSortConfig({ column: 'INSTALLER', direction: 'asc' })
              }}
              className="bg-transparent outline-none text-xs font-semibold max-w-[140px] cursor-pointer"
              style={{ color: textPrimary }}
              onClick={e => e.stopPropagation()}
            >
              <option value="">All installers</option>
              {installerOptions.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            {installerFilter && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setInstallerFilter('') }}
                style={{ color: textMuted }}
                title="Clear installer filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border flex-1 min-w-[150px] max-w-xs"
               style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
            <input type="text" placeholder="Search..." value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   className="bg-transparent outline-none text-xs flex-1 font-medium"
                   style={{ color: textPrimary }}
                   onClick={e => e.stopPropagation()} />
            {searchQuery && (
              <button onClick={e => { e.stopPropagation(); setSearchQuery('') }} style={{ color: textMuted }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {isCustomer && (
            <button onClick={() => navigate('/tickets/create')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs text-white hover:opacity-90 shadow-sm"
                    style={{ backgroundColor: green }}>
              <Plus className="w-3.5 h-3.5" /> New Ticket
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {!loading && tickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs font-bold px-5 py-2.5 rounded-2xl border"
             style={{ backgroundColor: cardBg, borderColor: border }}>
          <span style={{ color: textMuted }} className="uppercase tracking-wider text-[10px]">Active Tickets:</span>
          <div className="flex items-center gap-1">
            <span style={{ color: textMuted }}>Scheduled / Rescheduled</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>{counts.scheduledOrRescheduled}</span>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ color: textMuted }}>Survey</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>{counts.survey}</span>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ color: textMuted }}>For Quotation / For Approval</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981' }}>{counts.forQuotationOrForApproval}</span>
          </div>
          {(sortConfig || installerFilter) && (
            <button
              type="button"
              onClick={() => { setSortConfig(null); setInstallerFilter('') }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wide hover:underline"
              style={{ color: green }}
            >
              Reset sort / filter
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {fetchError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold"
             style={{ color: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />{fetchError}
          <button onClick={fetchTickets} className="ml-2 px-2 py-0.5 rounded text-white font-bold text-xs" style={{ backgroundColor: green }}>Retry</button>
        </div>
      )}

      {/* ── Table card ── */}
      <div className="rounded-2xl shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}`, overflow: 'visible' }}
           onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />)}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="overflow-x-auto rounded-2xl"
            style={{
              maxHeight: 'calc(100vh - 280px)',
              overflowY: 'auto',
              paddingBottom: activeCellOverlay ? 72 : 12,
            }}
          >
            <table className="text-xs" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                <tr style={{ backgroundColor: theadBg, borderBottom: `2px solid ${border}` }}>
                  {columns.map(col => {
                    const canSort = 'sortable' in col && col.sortable
                    const isSorted = canSort && sortConfig?.column === col.label
                    const SortIcon = isSorted
                      ? (sortConfig!.direction === 'asc' ? ArrowUp : ArrowDown)
                      : ArrowUpDown
                    return (
                    <th key={col.label}
                        onMouseEnter={() => setHoveredHeader(col.label)}
                        onMouseLeave={() => setHoveredHeader(null)}
                        onClick={e => {
                          if (canSort) {
                            if (e.detail > 1) return
                            handleColumnSort(col.label)
                            return
                          }
                          const isExpanding = !expandedCols[col.label]
                          toggleCol(col.label)
                          if (isExpanding) {
                            const th = e.currentTarget
                            setTimeout(() => {
                              th.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                            }, 80)
                          }
                        }}
                        onDoubleClick={canSort ? (e => {
                          e.preventDefault()
                          e.stopPropagation()
                          const isExpanding = !expandedCols[col.label]
                          toggleCol(col.label)
                          if (isExpanding) {
                            const th = e.currentTarget
                            setTimeout(() => {
                              th.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                            }, 80)
                          }
                        }) : undefined}
                        title={canSort ? 'Click to sort · Double-click to widen column' : 'Click to widen column'}
                        style={{
                          padding: '12px 14px',
                          color: (col.isExpanded || hoveredHeader === col.label || isSorted) ? (isLight ? '#16A34A' : '#4ADE80') : textMuted,
                          fontWeight: 700, whiteSpace: 'nowrap',
                          borderRight: `1px solid ${border}`,
                          borderBottom: `2px solid ${border}`,
                          fontSize: '10px', letterSpacing: '0.08em',
                          width: col.width, minWidth: col.width, maxWidth: col.width,
                          backgroundColor: theadBg, cursor: 'pointer', userSelect: 'none',
                          transition: 'color 0.15s ease',
                          textAlign: col.align || 'left',
                          ...(col.sticky ? { position: 'sticky' as const, left: col.left, zIndex: 15 } : {}),
                        }}>
                      <div className={`flex items-center gap-1 w-full ${
                        col.align === 'center' ? 'justify-center text-center' :
                        col.align === 'right' ? 'justify-end text-right' :
                        'justify-start text-left'
                      }`}>
                        <span>{col.display}</span>
                        {canSort && (
                          <SortIcon
                            className="w-3 h-3 shrink-0 opacity-70"
                            style={{ color: isSorted ? green : textMuted }}
                          />
                        )}
                      </div>
                    </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={{ borderBottom: `1px solid ${border}`, padding: '40px 10px' }}>
                      <div className="flex flex-col items-center justify-center gap-3">
                        <p className="text-sm font-semibold" style={{ color: textMuted }}>
                          No records
                        </p>
                        {searchQuery && (
                          <button onClick={() => setSearchQuery('')} className="text-xs font-bold hover:underline" style={{ color: green }}>Clear search</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visible.map((ticket, idx) => {
                    const isHovered = hoveredRow === ticket.id
                    const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null
                    const isGhost = Boolean(ghostKind)
                    const isDuplicateName = duplicateNameKeys.has(normalizeCustomerKey(getCustomerDisplayName(ticket)))
                    const baseBg = ghostKind === 'completed'
                      ? (isLight ? '#dcfce7' : 'rgba(22,163,74,0.2)')
                      : ghostKind === 'resched'
                        ? (isLight ? '#fef9c3' : 'rgba(251,191,36,0.14)')
                        : isDuplicateName
                          ? (isLight ? '#fef9c3' : '#3d3418')
                          : (idx % 2 === 0 ? rowEven : rowOdd)
                    const bg       = isHovered && !isGhost ? rowHover : baseBg
                    const ghostAccent = ghostKind === 'completed' ? green : ghostKind === 'resched' ? '#fbbf24' : undefined
                    const rowIsActive = columns.some(col =>
                      (editingCell?.ticketId === ticket.id && editingCell?.colLabel === col.label)
                      || (hoveredCell?.ticketId === ticket.id && hoveredCell?.colLabel === col.label),
                    )
                  return (
                    <tr key={`${ticket.id}${isGhost ? `-ghost-${ghostKind}` : ''}`}
                        style={{
                          borderBottom: `1px solid ${border}`,
                          boxShadow: ghostAccent ? `inset 3px 0 0 ${ghostAccent}` : undefined,
                          position: rowIsActive ? 'relative' : undefined,
                          zIndex: rowIsActive ? 6 : undefined,
                        }}
                        onMouseEnter={() => setHoveredRow(ticket.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onContextMenu={e => {
                          e.preventDefault()
                          if (canEdit || isAdmin) setContextMenu({ x: e.clientX, y: e.clientY, ticket })
                        }}>



                      {/* Data cells */}
                      {columns.map((col) => {
                        const isEditingCell = editingCell?.ticketId === ticket.id && editingCell?.colLabel === col.label
                        const isStatusCol = col.label === 'STATUS'
                        const isHoveredCell = hoveredCell?.ticketId === ticket.id && hoveredCell?.colLabel === col.label
                        const isActiveCell = isEditingCell || isHoveredCell
                        const cellWidth = isActiveCell ? (col.expWidth ?? col.width) : col.width
                        return (
                          <td key={col.label}
                              data-cell-key={`${ticket.id}:${col.label}`}
                              onMouseEnter={() => setHoveredCell({ ticketId: ticket.id, colLabel: col.label })}
                              onMouseLeave={() => setHoveredCell(prev =>
                                prev?.ticketId === ticket.id && prev?.colLabel === col.label ? null : prev
                              )}
                              onClick={e => {
                                e.stopPropagation()
                                if (isEditingCell) return
                                if (isStatusCol && canEdit && !isGhost) {
                                  startCellEdit(ticket, 'STATUS')
                                }
                              }}
                              onDoubleClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              style={{
                                padding: isEditingCell ? '6px' : '10px 14px',
                                color: isGhost ? textMuted : textPrimary,
                                fontSize: '11px', fontWeight: isGhost ? 500 : 500,
                                backgroundColor: bg,
                                borderRight: `1px solid ${border}`,
                                borderBottom: `1px solid ${border}`,
                                width: cellWidth,
                                minWidth: cellWidth,
                                maxWidth: isActiveCell ? 'none' : cellWidth,
                                overflow: isActiveCell ? 'visible' : 'hidden',
                                transition: 'background-color 0.1s ease, width 0.15s ease, min-height 0.15s ease',
                                cursor: canEdit && !isGhost ? 'default' : 'default',
                                verticalAlign: 'top',
                                textAlign: col.align || 'left',
                                userSelect: canEdit && !isGhost ? 'none' : undefined,
                                WebkitUserSelect: canEdit && !isGhost ? 'none' : undefined,
                                ...(col.sticky
                                  ? { position: 'sticky' as const, left: col.left, zIndex: isEditingCell ? 12 : isHoveredCell ? 8 : 5 }
                                  : isActiveCell ? { position: 'relative' as const, zIndex: isEditingCell ? 10 : 4 } : {}),
                              }}>
                            {renderCell(ticket, col, idx, isGhost, ghostKind)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ── Right-click context menu ── */}
      {contextMenu && (() => {
        const menuW = 220
        const menuH = 180
        const leftPos = contextMenu.x + menuW > window.innerWidth ? Math.max(10, window.innerWidth - menuW - 10) : contextMenu.x
        const topPos = contextMenu.y + menuH > window.innerHeight ? Math.max(10, window.innerHeight - menuH - 10) : contextMenu.y
        return (
          <div className="fixed z-[200]" style={{ top: topPos, left: leftPos }}
               onClick={e => e.stopPropagation()}>
            <div className="rounded-2xl shadow-2xl overflow-hidden"
                 style={{ backgroundColor: cardBg, border: `1px solid ${border}`, minWidth: 200 }}>

              {/* Current status label */}
              <div className="px-4 py-2.5 flex items-center gap-2"
                   style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
                {(() => { const sc = statusColor(contextMenu.ticket.status, isLight); return (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black border"
                        style={{ color: sc.text, backgroundColor: sc.bg, borderColor: sc.b }}>
                    {statusCode(contextMenu.ticket.status)}
                  </span>
                ) })()}
                <span className="text-[11px] font-bold truncate" style={{ color: textMuted }}>
                  {(contextMenu.ticket.customerName || contextMenu.ticket.customer_name || contextMenu.ticket.title || '').split(' ').slice(0,3).join(' ')}
                </span>
              </div>

              {/* View full details */}
              <button onClick={() => { setDetailTicket(contextMenu.ticket); setContextMenu(null) }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors"
                      style={{ color: textPrimary }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : '#0f1e36'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                <Eye className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
                View Full Details
              </button>

              {/* Edit Details */}
              {canEdit && (
                <button onClick={() => { openEditModal(contextMenu.ticket); setContextMenu(null) }}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors"
                        style={{ color: textPrimary }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : '#0f1e36'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                  <Edit3 className="w-3.5 h-3.5 shrink-0" style={{ color: '#6366F1' }} />
                  Edit Details
                </button>
              )}

              {/* Delete — admin only */}
              {isAdmin && (
                <button onClick={() => handleDelete(contextMenu.ticket.id)}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors"
                        style={{ color: '#EF4444', borderTop: `1px solid ${border}` }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.06)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  Delete
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Full Details Modal ── */}
      {detailTicket && (() => {
        const t = detailTicket
        const sc = statusColor(t.status, isLight)
        const addr = formatAddress(t.location)
        const district = parseDistrict(t.location, t.district)
        const brand = parseBrand(t)
        const phone = getF(t, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
        const installer = getInstallerDisplay(t)
        const serviceDriver = formatServiceDriver(t)
        const update = t.remarks || ''
        const note = t.note || ''
        const commit = getF(t, 'commitType', 'commitTerms', 'description')
        const custName = getCustomerDisplayName(t) || t.title
        const negotiatorId = t.negotiatorId || t.negotiator_id || ''
        const negotiatorName = branchEmployees.find(e => e.id === negotiatorId)?.name || ''
        const preferredDate = t.preferredDate || t.preferred_date
        const dealer = getF(t, 'dealer')
        const isCompleted = (t.status || '').toUpperCase() === 'COMPLETED'
        const hasPayment = ticketHasPaymentInfo(t)
        const paymentAmt = formatPaymentAmount(t)
        const paymentMode = getPaymentMode(t)
        const archivedSched = formatDateKeyLabel(getArchivedScheduleDate(t))
        const installedDate = formatDateKeyLabel(getInstalledDateKey(t))
        const isDuplicateName = duplicateNameKeys.has(normalizeCustomerKey(custName))

        const Row = ({ icon: Icon, label, val, color }: { icon: any; label: string; val: string; color?: string }) =>
          val ? (
            <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
              <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: textMuted }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: textMuted }}>{label}</p>
                <p className="text-xs font-semibold leading-relaxed break-words" style={{ color: color || textPrimary }}>
                  {['TECHNICIAN', 'INSTALLER', 'ASSIGNED', 'BY', 'CREATED BY'].includes(label.toUpperCase()) ? (
                    <EmployeeNameLink nameOrId={val} />
                  ) : val}
                </p>
              </div>
            </div>
          ) : null

        return (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6"
               style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
               onClick={() => setDetailTicket(null)}>
            <div className="flex flex-col w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden"
                 style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
                 onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="px-6 py-4 flex items-start justify-between gap-3 shrink-0"
                   style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Ticket Details</p>
                  <h3 className="font-black text-sm leading-tight" style={{ color: textPrimary }}>{custName}</h3>
                  <p className="text-[10px] font-semibold font-mono" style={{ color: textMuted }}>
                    Ticket No: {t.ticketNumber || t.ticket_number || '—'}
                  </p>
                  <p className="text-[10px] font-semibold font-mono" style={{ color: textMuted }}>ID: {t.id}</p>
                  {isDuplicateName && (
                    <p className="text-[10px] font-bold" style={{ color: isLight ? '#a16207' : '#fbbf24' }}>
                      Duplicate customer name on this date — each row has its own ticket ID.
                    </p>
                  )}
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black border inline-flex items-center gap-1.5 self-start"
                        style={{ color: sc.text, backgroundColor: sc.bg, borderColor: sc.b }}>
                    <Clock className="w-3 h-3" />{t.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <button onClick={() => setDetailTicket(null)}
                        className="p-2 rounded-lg shrink-0 hover:bg-slate-500/10 transition-colors"
                        style={{ color: textMuted }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Two Column Body */}
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x">
                
                {/* Left Column: Details */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-1">
                  <Row icon={User}    label="Customer"   val={custName} />
                  <Row icon={Wrench}  label="Ticket No." val={t.ticketNumber || t.ticket_number || ''} />
                  <Row icon={Wrench}  label="Control No. / SI (Aircon)" val={t.controlNumber || t.control_number || ''} />
                  <Row icon={Phone}   label="Contact"    val={phone ? (fmtPhone(phone) || phone) : ''} />
                  <Row icon={MapPin}  label="Address"    val={addr} />
                  <Row icon={MapPin}  label="District"   val={district} />
                  <Row icon={Wrench}  label="Service / Driver" val={serviceDriver} />
                  <Row icon={Wrench}  label="Brand / Unit" val={brand} />
                  <Row icon={Wrench}  label={isTaguigServices ? "Endorsed By" : "Dealer"}     val={dealer} />
                  <Row icon={User}    label={isTaguigServices ? "Technician" : "Installer"}  val={installer} />
                  <Row icon={User}    label="Negotiator" val={negotiatorName} />
                  <Row icon={Clock}   label="Preferred Date" val={preferredDate ? new Date(preferredDate).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''} />
                  {isCompleted && archivedSched && (
                    <Row icon={Clock} label="Scheduled Date" val={archivedSched} />
                  )}
                  {isCompleted && installedDate && (
                    <Row icon={Clock} label="Installed Date" val={installedDate} />
                  )}
                  {hasPayment && paymentAmt && (
                    <Row icon={Wrench} label="Payment Amount" val={paymentAmt} color={green} />
                  )}
                  {hasPayment && paymentMode && (
                    <Row icon={Wrench} label="Mode of Payment" val={paymentMode} />
                  )}
                  
                  {commit && (
                    <div className="py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>{isTaguigServices ? "Commit (Amount)" : "Commit / Description"}</p>
                      <p className="text-xs leading-relaxed" style={{ color: textPrimary }}>{commit}</p>
                    </div>
                  )}
                  {note && (
                    <div className="py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>{isTaguigServices ? "Confirmation" : "Note"}</p>
                      <p className="text-xs leading-relaxed font-semibold" style={{ color: '#EF4444' }}>{note}</p>
                    </div>
                  )}
                  {update && (
                    <div className="py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>{isTaguigServices ? "Service Status" : "Update"}</p>
                      <p className="text-xs leading-relaxed font-semibold" style={{ color: green }}>{update}</p>
                    </div>
                  )}
                </div>

                {/* Right Column: Update History */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col min-h-0"
                     style={{ backgroundColor: isLight ? '#f8fafc' : '#070E1C' }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider mb-4" style={{ color: textMuted }}>
                    Update History
                  </h4>
                  
                  {loadingHistory ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12 gap-2">
                      <Clock className="w-5 h-5 animate-spin" style={{ color: textMuted }} />
                      <span className="text-xs font-semibold" style={{ color: textMuted }}>Loading logs...</span>
                    </div>
                  ) : (
                    <div className="relative border-l ml-3 pl-5 space-y-6" style={{ borderColor: border }}>
                      {(() => {
                        const listToRender = [...history]
                        const hasSubmission = listToRender.some(h => !h.previousStatus && h.newStatus === 'PENDING')
                        
                        if (!hasSubmission && t.createdAt) {
                          listToRender.push({
                            id: 'initial-sub',
                            changeNote: 'Submitted',
                            changedByUserName: custName,
                            createdAt: t.createdAt,
                            newPreferredDate: preferredDate
                          })
                        }
                        
                        listToRender.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        
                        if (listToRender.length === 0) {
                          return (
                            <div className="text-xs font-semibold py-8" style={{ color: textMuted }}>
                              No update history recorded.
                            </div>
                          )
                        }

                        return listToRender.map((h, idx) => {
                          const dt = new Date(h.createdAt).toLocaleString('en-PH', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit', hour12: true
                          })
                          
                          return (
                            <div key={h.id || idx} className="relative">
                              <span className="absolute -left-[27px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2"
                                    style={{
                                      borderColor: idx === 0 ? green : border,
                                      backgroundColor: idx === 0 ? green : cardBg
                                    }} />
                              
                              <div className="text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-extrabold leading-tight" style={{ color: textPrimary }}>
                                    {h.changeNote || 'Ticket details updated'}
                                  </span>
                                  <span className="text-[9px] font-semibold opacity-60 shrink-0 mt-0.5" style={{ color: textMuted }}>
                                    {dt}
                                  </span>
                                </div>
                                
                                <div className="mt-1 space-y-0.5" style={{ color: textMuted }}>
                                  <p className="text-[10px] font-semibold">
                                    By: <span className="font-bold" style={{ color: textPrimary }}><EmployeeNameLink nameOrId={h.changedByUserName} /></span>
                                  </p>
                                  {h.newStatus && h.newStatus !== h.previousStatus && (
                                    <p className="text-[10px]">
                                      Status: <span className="font-bold opacity-80">{h.previousStatus || 'NONE'}</span> ➔ <span className="font-bold text-indigo-500">{h.newStatus}</span>
                                    </p>
                                  )}
                                  {h.newPreferredDate && h.newPreferredDate !== h.previousPreferredDate && (
                                    <p className="text-[10px]">
                                      Scheduled: <span className="font-bold opacity-80">{h.previousPreferredDate || 'none'}</span> ➔ <span className="font-bold text-amber-500">{h.newPreferredDate}</span>
                                    </p>
                                  )}
                                  {h.newAssignedToName && (
                                    <p className="text-[10px]">
                                      Assigned: <span className="font-bold text-teal-500"><EmployeeNameLink nameOrId={h.newAssignedToName} /></span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="shrink-0 px-6 py-4 flex flex-col sm:flex-row justify-end gap-3"
                   style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
                {canEdit && (
                  <button onClick={() => { openEditModal(t); setDetailTicket(null) }}
                          className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/5"
                          style={{ borderColor: inputBorder, color: textPrimary }}>
                    <Edit3 className="w-3.5 h-3.5" style={{ color: '#6366F1' }} />
                    Edit Update
                  </button>
                )}

              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Completion Prompt Modal ── */}
      {completionPrompt && (() => {
        const cp = completionPrompt
        const t = cp.ticket
        const custName = getF(t, 'customerName', 'customer_name') || t.title

        const handleSubmitCompletion = async (e: React.FormEvent) => {
          e.preventDefault()
          setCompletionPrompt(null)
          setSaving(true)
          
          try {
            const d = new Date()
            const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

             // 1. Post to Daily Service Report
             const serviceReportPayload = {
               branchId: resolveScopedBranchId(t.branchId || localStorage.getItem('ashcol-global-branch-id')),
               reportDate: todayStr,
               customerName: custName,
               customerAddress: formatAddress(t.location),
               customerPhone: getF(t, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
               district: parseDistrict(t.location, t.district),
               serviceType: cp.modeOfPayment === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
               statusCode: 'I',
               commitTerms: getF(t, 'commitTerms', 'description') || t.description || '',
               dealer: getF(t, 'dealer'),
               unitBrandModel: parseBrand(t),
               technicianName: getF(t, 'assignedEmployeeName', 'assigned_employee_name'),
               amountCharged: parseFloat(cp.amount) || 0,
               paymentStatus: cp.modeOfPayment,
               jobStatus: 'COMPLETED',
               remarks: cp.value || 'Installed',
               note: t.note || '',
               controlNumber: t.controlNumber || ''
             }

            const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token()}`
              },
              body: JSON.stringify(serviceReportPayload)
            })
            if (!reportRes.ok) throw new Error('Failed to create Service Report')

            // 2. Delete the ticket from the active list
            const deleteRes = await fetch(`${API_BASE_URL}/tickets/${t.id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token()}`
              }
            })
            if (!deleteRes.ok) throw new Error('Failed to delete Ticket')

            // 3. Remove from local list state
            setTickets(prev => prev.filter(x => x.id !== t.id))
            showToast('Ticket completed & moved to Service Report ✓')
          } catch (error: any) {
            console.error('Error completing ticket:', error)
            alert(`Could not complete ticket: ${error.message || 'Unknown error'}`)
          } finally {
            setSaving(false)
          }
        }

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
               style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
            <form onSubmit={handleSubmitCompletion}
                  className="flex flex-col w-full max-w-md rounded-3xl shadow-2xl p-6 gap-4"
                  style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
                  onClick={e => e.stopPropagation()}>
              
              <div className="flex flex-col gap-1">
                <h3 className="font-black text-sm leading-tight" style={{ color: textPrimary }}>
                  Complete Ticket: {custName}
                </h3>
                <p className="text-[10px] font-semibold" style={{ color: textMuted }}>
                  Enter payment details to move this ticket to the Service Report.
                </p>
              </div>

              {/* Mode of Payment select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Mode of Payment
                </label>
                <select
                  value={cp.modeOfPayment}
                  onChange={e => {
                    const nextMode = e.target.value
                    setCompletionPrompt(prev => {
                      if (!prev) return null
                      const nextAmount = nextMode === 'FREE' || nextMode === 'FREE INSTALL' ? '0' : prev.amount
                      return { ...prev, modeOfPayment: nextMode, amount: nextAmount }
                    })
                  }}
                  className="w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all focus:ring-2 focus:ring-green-500"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                  <option value="CASH">CASH</option>
                  <option value="BANK TRANSFER">BANK TRANSFER</option>
                  <option value="GCASH">GCASH</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="FREE INSTALL">FREE INSTALL</option>
                </select>
              </div>
 
              {/* Amount charged */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Amount Charged (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={cp.amount}
                  disabled={cp.modeOfPayment === 'FREE' || cp.modeOfPayment === 'FREE INSTALL'}
                  onChange={e => setCompletionPrompt(prev => prev ? { ...prev, amount: e.target.value } : null)}
                  className="w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all focus:ring-2 focus:ring-green-500 font-semibold disabled:opacity-60"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCompletionPrompt(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/5"
                  style={{ borderColor: inputBorder, color: textPrimary }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm"
                  style={{ backgroundColor: green }}>
                  Confirm & Move
                </button>
              </div>

            </form>
          </div>
        )
      })()}

      {/* ── Excel Import Results Modal ── */}
      {importResults && importResults.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="flex flex-col w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between gap-3 shrink-0 border-b"
                 style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
              <div className="min-w-0">
                <h3 className="font-black text-sm leading-tight" style={{ color: textPrimary }}>
                  Excel Import: {importResults.fileName}
                </h3>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: textMuted }}>
                  Review parsed updates from {importResults.rowRangeLabel} (Excel or scanned image) and confirm payment completion before saving.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setImportResults(null)}
                        className="p-2 rounded-lg hover:bg-slate-500/10 transition-colors"
                        style={{ color: textMuted }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              
              {/* Stats dashboard */}
              <div className="grid grid-cols-4 gap-3 shrink-0">
                {[
                  { label: 'Total Rows', value: importResults.totalRows, color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
                  { label: 'Matched', value: importResults.matchedCount, color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
                  { label: 'Auto-Completed', value: importResults.autoCompletedCount, color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
                  { label: 'Unmatched', value: importResults.unmatchedCount, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
                ].map(stat => (
                  <div key={stat.label} className="rounded-2xl p-3 border" style={{ backgroundColor: stat.bg, borderColor: `rgba(0,0,0,0.08)` }}>
                    <div className="text-lg font-black" style={{ color: stat.color }}>{stat.value}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textMuted }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Section 1: Tickets marked as installed but needing payment info */}
              {importResults.needsConfirmation.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#F59E0B' }}>
                    ⚠️ Needs Payment Confirmation ({importResults.needsConfirmation.length})
                  </h4>
                  <p className="text-[10px]" style={{ color: textMuted }}>
                    These tickets are marked as installed in the spreadsheet but did not contain valid payment details. Please complete them below:
                  </p>
                  <div className="flex flex-col gap-2 border rounded-2xl overflow-hidden" style={{ borderColor: border, backgroundColor: inputBg }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f1f5f9' : '#070E1C' }}>
                            <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Customer</th>
                            <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Remarks</th>
                            <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Payment Mode</th>
                            <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Amount Charged</th>
                            <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Control # / SI</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {importResults.needsConfirmation.map((item, idx) => {
                            const custName = getF(item.ticket, 'customerName', 'customer_name') || item.ticket.title
                            return (
                              <tr key={`${item.ticket.id}-row-${item.rowIdx}`} className="hover:bg-slate-500/5">
                                <td className="px-3 py-2 font-semibold" style={{ color: textPrimary }}>{custName}</td>
                                <td className="px-3 py-2 italic opacity-85" style={{ color: textMuted }}>{item.value}</td>
                                <td className="px-3 py-2">
                                  <select
                                    value={item.modeOfPayment}
                                    onChange={e => handlePaymentFieldChange(idx, 'modeOfPayment', e.target.value)}
                                    className="rounded px-2 py-1 outline-none text-xs w-full"
                                    style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                                  >
                                    <option value="CASH">CASH</option>
                                    <option value="BANK TRANSFER">BANK TRANSFER</option>
                                    <option value="GCASH">GCASH</option>
                                    <option value="CHEQUE">CHEQUE</option>
                                    <option value="FREE INSTALL">FREE INSTALL</option>
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.amount}
                                    disabled={item.modeOfPayment === 'FREE INSTALL'}
                                    onChange={e => handlePaymentFieldChange(idx, 'amount', e.target.value)}
                                    placeholder="0.00"
                                    className="rounded px-2 py-1 outline-none text-xs w-24 font-bold disabled:opacity-50"
                                    style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={item.controlNumber}
                                    onChange={e => handlePaymentFieldChange(idx, 'controlNumber', e.target.value)}
                                    placeholder="SI / Control #"
                                    className="rounded px-2 py-1 outline-none text-xs w-28"
                                    style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                                  />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 2: Regular matched updates and auto-completions */}
              {importResults.updates.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: green }}>
                    ✅ Ready to Update ({importResults.updates.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto border rounded-2xl p-3 flex flex-col gap-2"
                       style={{ borderColor: border, backgroundColor: inputBg }}>
                    {importResults.updates.map((item) => {
                      const custName = getF(item.ticket, 'customerName', 'customer_name') || item.ticket.title
                      const fields = Object.keys(item.updatedFields).filter(k => item.updatedFields[k as keyof Ticket] !== undefined)
                      const isComplete = item.updatedFields.status === 'COMPLETED'
                      return (
                        <div key={`${item.ticket.id}-row-${item.rowIdx}`} className="flex items-start justify-between text-xs py-1 border-b last:border-b-0" style={{ borderColor: border }}>
                          <div>
                            <span className="font-bold" style={{ color: textPrimary }}>{custName}</span>
                            <span className="ml-2 text-[10px] opacity-70" style={{ color: textMuted }}>
                              (Excel row {item.rowIdx})
                            </span>
                            <p className="text-[10px] opacity-75 mt-0.5" style={{ color: textMuted }}>
                              Changes: {fields.length > 0 ? fields.join(', ') : 'no changes'}
                            </p>
                          </div>
                          {isComplete ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/25">
                              Auto-Complete
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-emerald-500 bg-emerald-500/10 border border-emerald-500/25">
                              Update Info
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Section 3: Unmatched Rows Table */}
              {importResults.unmatched.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#F59E0B' }}>
                    ℹ️ Unmatched Rows ({importResults.unmatchedCount})
                  </h4>
                  <div className="border rounded-2xl overflow-hidden" style={{ borderColor: border }}>
                    <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                      <table className="text-xs text-left" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                          <tr className="border-b font-bold" style={{ borderColor: border }}>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>CUSTOMER'S NAME</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>DESTINATION</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>DISTRICT</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>CONTACT NO.</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>BRAND</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'ENDORSED BY' : 'DLR'}</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>STATUS</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'COMMIT (AMOUNT)' : 'COMMIT'}</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'TECHNICIAN' : 'INSTALLER'}</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'CONFIRMATION' : 'NOTE'}</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>SERVICE</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'SERVICE STATUS' : 'UPDATE'}</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>CHARGES</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>PAYMENT MODE</th>
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}` }}>CONTROL #</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: border }}>
                          {importResults.unmatched.map((row, idx) => {
                            const rowBg = idx % 2 === 0 ? rowEven : rowOdd
                            return (
                              <tr key={row.rowIdx} className="hover:bg-slate-500/5" style={{ backgroundColor: rowBg }}>
                                <td className="px-3 py-2 font-semibold" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.rowIdx}. {row.name}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.location || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.district || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.phone || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.brand || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.dlr || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.status || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.commit || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.installer || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.confirmation || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.service || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.update || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.charges !== undefined ? `₱${Number(row.charges).toLocaleString('en-PH')}` : '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.paymentMode || '—'}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, whiteSpace: 'nowrap' }}>{row.controlNo || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex items-center justify-end gap-3 shrink-0 border-t"
                 style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
              <div className="flex items-center gap-2 mr-auto">
                <span className="text-xs font-bold" style={{ color: textMuted }}>Scheduled Target Date:</span>
                <input
                  type="date"
                  value={importTargetDate}
                  onChange={e => setImportTargetDate(e.target.value)}
                  className="rounded-xl px-2.5 py-1.5 outline-none border text-xs font-bold transition-all focus:ring-2 focus:ring-green-500"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>
              <button onClick={() => setImportResults(null)}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/5"
                      style={{ borderColor: inputBorder, color: textPrimary }}>
                Cancel
              </button>
              <button onClick={handleApplyImport}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm disabled:opacity-50"
                      style={{ backgroundColor: green }}>
                {saving ? '⏳ Saving updates...' : `Apply & Save All (${importResults.matchedCount} updates, ${importResults.unmatchedCount} new)`}
              </button>
            </div>

          </div>
        </div>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
             onClick={e => e.stopPropagation()}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
               onClick={e => e.stopPropagation()}
               onMouseDown={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>
                Add Ticket Details
              </h3>
              <button onClick={requestCloseAddModal} className="p-1.5 rounded-lg hover:bg-slate-200/20" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
              {/* Customer Info Section */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Customer Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Preferred Date" required>
                    <input type="date" value={addForm.preferredDate || ''} 
                      onChange={e => setAddForm({ ...addForm, preferredDate: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Customer Name" required>
                    <input type="text" value={addForm.customerName || ''} 
                      onChange={e => setAddForm({ ...addForm, customerName: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Contact No." required>
                    <input type="text" value={addForm.contactPhone || ''} 
                      onChange={e => setAddForm({ ...addForm, contactPhone: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Destination/Address" required full>
                    <textarea value={addForm.location || ''} 
                      onChange={e => setAddForm({ ...addForm, location: e.target.value })}
                      rows={2}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] resize-none w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="District">
                    <input type="text" value={addForm.district || ''} 
                      onChange={e => setAddForm({ ...addForm, district: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Commit Terms">
                    <textarea value={addForm.commitTerms || ''} 
                      onChange={e => setAddForm({ ...addForm, commitTerms: e.target.value })}
                      rows={1}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] resize-none w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              {/* Service & Unit Info Section */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Service & Unit Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Ticket Type" required>
                    <select
                      value={addForm.ticketCategory || 'INSTALLATION'}
                      onChange={e => setAddForm({ ...addForm, ticketCategory: e.target.value as TicketCategoryValue })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    >
                      {FIELD_TICKET_CATEGORIES.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Brand / Unit Type">
                    <input type="text" value={addForm.unitType || ''} 
                      onChange={e => setAddForm({ ...addForm, unitType: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Dealer (DLR)">
                    <input type="text" value={addForm.sourceVendor || ''} 
                      onChange={e => setAddForm({ ...addForm, sourceVendor: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label={isTaguigServices ? 'Service / Driver' : 'Service / Driver'}>
                    <input type="text" value={addForm.serviceDriver || ''}
                      placeholder="e.g. T3 (DOMINIC) - 1"
                      onChange={e => setAddForm({ ...addForm, serviceDriver: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label={isTaguigServices ? 'Technician' : 'Installer / Technician'}>
                    <input type="text" value={addForm.installerName || ''}
                      placeholder="e.g. RYAN - 1"
                      onChange={e => setAddForm({ ...addForm, installerName: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Negotiator">
                    <select value={addForm.negotiatorId || ''}
                      onChange={e => setAddForm({ ...addForm, negotiatorId: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      <option value="">-- Select negotiator --</option>
                      {branchEmployees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ticket No.">
                    <input type="text" value={addForm.ticketNumber || ''}
                      placeholder="Auto-generated if left blank (e.g. TKT-00001)"
                      onChange={e => setAddForm({ ...addForm, ticketNumber: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Control No. / SI (Aircon)">
                    <input type="text" value={addForm.controlNumber || ''}
                      placeholder="From import only — aircon papers / SI"
                      onChange={e => setAddForm({ ...addForm, controlNumber: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Payment (optional)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Mode of Payment">
                    <select value={addForm.modeOfPayment || ''}
                      onChange={e => {
                        const nextMode = e.target.value
                        setAddForm(prev => ({
                          ...prev,
                          modeOfPayment: nextMode,
                          installationCharges: (nextMode === 'FREE' || nextMode === 'FREE INSTALL')
                            ? 0
                            : prev.installationCharges,
                        }))
                      }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      <option value="">-- Select --</option>
                      <option value="CASH">CASH</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
                      <option value="GCASH">GCASH</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="FREE INSTALL">FREE INSTALL</option>
                    </select>
                  </Field>
                  <Field label="Payment Amount (₱)">
                    <input type="number" step="0.01" min="0"
                      placeholder="0.00"
                      value={addForm.installationCharges ?? ''}
                      disabled={addForm.modeOfPayment === 'FREE' || addForm.modeOfPayment === 'FREE INSTALL'}
                      onChange={e => setAddForm({ ...addForm, installationCharges: e.target.value ? Number(e.target.value) : undefined })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full disabled:opacity-60"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-end gap-3 border-t" style={{ borderColor: border }}>
              <button onClick={requestCloseAddModal}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
                style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={promptSaveManualTicket}
                disabled={savingManual}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: green }}>
                {savingManual ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && (() => {
        const isReschedStatus = (editForm.status || '').toUpperCase() === 'RESCHED'
        const justChangedToResched = isReschedStatus && editInitialStatus.toUpperCase() !== 'RESCHED'
        const showPaymentSection = ticketHasPaymentInfo(editForm) || Boolean(editForm.modeOfPayment || editForm.installationCharges != null)
        const reschedFieldStyle = {
          backgroundColor: isLight ? '#fffbeb' : 'rgba(251,191,36,0.08)',
          border: `2px solid ${isLight ? '#fbbf24' : 'rgba(251,191,36,0.55)'}`,
          boxShadow: isLight ? '0 0 0 3px rgba(251,191,36,0.2)' : '0 0 0 3px rgba(251,191,36,0.15)',
        }

        return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
             onClick={e => e.stopPropagation()}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
               onClick={e => e.stopPropagation()}
               onMouseDown={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <div>
                <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>
                  Edit Ticket Details
                </h3>
                {editForm.id && (
                  <p className="text-[10px] font-mono font-semibold mt-1" style={{ color: textMuted }}>
                    Ticket No: {editForm.ticketNumber || 'Auto on create'}
                  </p>
                )}
                {editOriginalDate && !isReschedStatus && (
                  <p className="text-[10px] font-semibold mt-1" style={{ color: textMuted }}>
                    Scheduled: <span style={{ color: textPrimary }}>{formatDateKeyLabel(editOriginalDate)}</span>
                  </p>
                )}
              </div>
              <button onClick={requestCloseEditModal} className="p-1.5 rounded-lg hover:bg-slate-200/20" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Customer Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!(editForm.status === 'SCHEDULED' || editForm.status === 'RESCHED' || editOriginalDate) && (
                    <Field label="Preferred Date" required>
                      <input type="date" value={editForm.preferredDate || ''}
                        onChange={e => setEditForm({ ...editForm, preferredDate: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    </Field>
                  )}
                  <Field label="Customer Name" required>
                    <input type="text" value={editForm.customerName || ''} 
                      onChange={e => setEditForm({ ...editForm, customerName: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Contact No." required>
                    <input type="text" value={editForm.contactPhone || ''} 
                      onChange={e => setEditForm({ ...editForm, contactPhone: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Destination/Address" required full>
                    <textarea value={editForm.location || ''} 
                      onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                      rows={2}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] resize-none w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="District">
                    <input type="text" value={editForm.district || ''} 
                      onChange={e => setEditForm({ ...editForm, district: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Commit Terms">
                    <textarea value={editForm.commitTerms || ''} 
                      onChange={e => setEditForm({ ...editForm, commitTerms: e.target.value })}
                      rows={1}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] resize-none w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              {/* Service & Unit Info Section */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Service & Unit Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Ticket Type" required>
                    <select
                      value={editForm.ticketCategory || 'INSTALLATION'}
                      onChange={e => setEditForm({ ...editForm, ticketCategory: e.target.value as TicketCategoryValue })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    >
                      {FIELD_TICKET_CATEGORIES.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Brand / Unit Type">
                    <input type="text" value={editForm.unitType || ''} 
                      onChange={e => setEditForm({ ...editForm, unitType: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Dealer (DLR)">
                    <input type="text" value={editForm.sourceVendor || ''} 
                      onChange={e => setEditForm({ ...editForm, sourceVendor: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Service / Driver">
                    <input type="text" value={editForm.serviceDriver || ''}
                      placeholder="e.g. T3 (DOMINIC) - 1"
                      onChange={e => setEditForm({ ...editForm, serviceDriver: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label={isTaguigServices ? 'Technician' : 'Installer / Technician'}>
                    <input type="text" value={editForm.installerName || ''}
                      placeholder="e.g. RYAN - 1"
                      onChange={e => setEditForm({ ...editForm, installerName: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Negotiator">
                    <select value={editForm.negotiatorId || ''}
                      onChange={e => setEditForm({ ...editForm, negotiatorId: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      <option value="">-- Select negotiator --</option>
                      {branchEmployees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ticket No.">
                    <input type="text" value={editForm.ticketNumber || ''}
                      placeholder="e.g. TKT-00001"
                      onChange={e => setEditForm({ ...editForm, ticketNumber: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Control No. / SI (Aircon)">
                    <input type="text" value={editForm.controlNumber || ''}
                      placeholder="Aircon papers / SI — leave empty if N/A"
                      onChange={e => setEditForm({ ...editForm, controlNumber: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <div className={`grid grid-cols-1 gap-4 md:col-span-2 ${isReschedStatus ? 'md:grid-cols-2' : ''}`}>
                    <Field label="Status" required>
                      <select value={editForm.status || 'PENDING'}
                        onChange={e => {
                          const next = e.target.value
                          setEditForm({
                            ...editForm,
                            status: next,
                            rescheduleToDate: next === 'RESCHED'
                              ? (editForm.rescheduleToDate || editForm.preferredDate || editOriginalDate || '')
                              : '',
                          })
                        }}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                        {STATUS_OPTS.map(opt => (
                          <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </Field>
                    {isReschedStatus && (
                      <Field label="Reschedule To" required>
                        <input
                          type="date"
                          autoFocus={justChangedToResched}
                          value={editForm.rescheduleToDate || ''}
                          onChange={e => setEditForm({ ...editForm, rescheduleToDate: e.target.value })}
                          className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-400 w-full"
                          style={reschedFieldStyle}
                        />
                      </Field>
                    )}
                  </div>
                  {isReschedStatus && editOriginalDate && (
                    <p className="text-[11px] font-semibold leading-relaxed md:col-span-2" style={{ color: isLight ? '#92400e' : '#fcd34d' }}>
                      {editForm.rescheduleToDate && editForm.rescheduleToDate !== editOriginalDate
                        ? `Row will gray out on ${formatDateKeyLabel(editOriginalDate)} and appear on ${formatDateKeyLabel(editForm.rescheduleToDate)}.`
                        : `Currently on ${formatDateKeyLabel(editOriginalDate)} — pick a new date beside RESCHED.`}
                    </p>
                  )}
                  <Field label="Remarks / Update" full>
                    <textarea value={editForm.remarks || ''} 
                      onChange={e => setEditForm({ ...editForm, remarks: e.target.value })}
                      rows={2}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] resize-none w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h4 className="text-[10px] font-black uppercase tracking-wider opacity-60 text-slate-400">
                    Payment
                  </h4>
                  {!showPaymentSection && (
                    <button
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, modeOfPayment: prev.modeOfPayment || 'CASH' }))}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors hover:opacity-80"
                      style={{ borderColor: inputBorder, color: green }}>
                      + Add payment
                    </button>
                  )}
                </div>
                {showPaymentSection && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl p-4"
                       style={{
                         border: `1px solid ${ticketHasPaymentInfo(editForm) ? (isLight ? '#86efac' : 'rgba(34,197,94,0.35)') : inputBorder}`,
                         backgroundColor: ticketHasPaymentInfo(editForm)
                           ? (isLight ? '#f0fdf4' : 'rgba(22,163,74,0.06)')
                           : inputBg,
                       }}>
                    <Field label="Mode of Payment">
                      <select value={editForm.modeOfPayment || ''}
                        onChange={e => {
                          const nextMode = e.target.value
                          setEditForm(prev => ({
                            ...prev,
                            modeOfPayment: nextMode,
                            installationCharges: (nextMode === 'FREE' || nextMode === 'FREE INSTALL')
                              ? 0
                              : prev.installationCharges,
                          }))
                        }}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                        style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                        <option value="">-- Select --</option>
                        <option value="CASH">CASH</option>
                        <option value="BANK TRANSFER">BANK TRANSFER</option>
                        <option value="GCASH">GCASH</option>
                        <option value="CHEQUE">CHEQUE</option>
                        <option value="FREE INSTALL">FREE INSTALL</option>
                      </select>
                    </Field>
                    <Field label="Payment Amount (₱)">
                      <input type="number" step="0.01" min="0"
                        placeholder="0.00"
                        value={editForm.installationCharges ?? ''}
                        disabled={editForm.modeOfPayment === 'FREE' || editForm.modeOfPayment === 'FREE INSTALL'}
                        onChange={e => setEditForm({ ...editForm, installationCharges: e.target.value ? Number(e.target.value) : undefined })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full disabled:opacity-60"
                        style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    </Field>
                    {qualifiesForInstallComplete(editForm, { remarksUpdate: editForm.remarks, remarks: editForm.remarks, installationCharges: editForm.installationCharges, modeOfPayment: editForm.modeOfPayment }) && (editForm.status || '').toUpperCase() !== 'COMPLETED' && (
                      <p className="text-[11px] font-semibold md:col-span-2" style={{ color: green }}>
                        Installed remarks + payment detected — saving will complete this ticket (view in Archives tab).
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-end gap-3 border-t" style={{ borderColor: border }}>
              <button onClick={requestCloseEditModal}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
                style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={promptSaveEditTicket}
                disabled={savingEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: green }}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      <ConfirmDialog dialog={confirmModal} onClose={() => setConfirmModal(null)} />
    </div>
  )
}

function Field({ label, required, full, children }: {
  label: string
  required?: boolean
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  )
}
