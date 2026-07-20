import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, type DragEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import ReactDOM from 'react-dom'
import {
  Plus, Search, X, Edit3, AlertTriangle, CalendarDays,
  Eye, Loader2, Pencil, Clock, Moon, Sun, Car, Trash2,
  ArrowUp, ArrowDown, ArrowUpDown, Copy, MapPin, Menu, Maximize2,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, fetchTicketsPage, fetchTicketByNumber, formatFetchError, readApiError, parseCreatedTicketResponse, resolvePortalWriteBranchId, resolveTicketArchiveBranchId, resolveTicketScheduleBranchId, resolveScopedBranchId, branchScopesMatch, appendCurrentNegotiator, isNegotiatorCandidate, isTaguigBranchRef, isTaguigServicesScope, isTaguigServiceTicket, parseGlobalBranchScope, isPortalAdmin, isCoordinatorOrOicUser, getActivePortalBranchId, EMPLOYEES_DIRECTORY_UPDATED_EVENT, PROFILE_UPDATED_EVENT, DEALERS_UPDATED_EVENT, notifyDealersUpdated, type InstallerBranchIndexEntry, type BranchStaffOption } from '../utils/api'
import {
  cacheTicketsByNumber,
  cacheTicketByNumber,
  extractTicketNumbers,
  getRecentlyLocallyEditedTicketIds,
  getTicketByNumber,
  markTicketLocallyEdited,
  normalizeTicketNumberKey,
  writeScheduleDateTicketNumbers,
} from '../utils/ticketNumberStore'
import { EMPTY_CELL, sanitizeDisplayText, formatPesoPrefix } from '../utils/textSanitize'
import { readSchedulesTabCache, schedulesCacheKey, writeSchedulesTabCache, getInitialSchedulesFromCache, isSchedulesSessionLoaded, clearRelaysCache, clearWarrantyCache, TAB_CACHE_UPDATED, SCHEDULES_PERSIST_LOCAL, syncTicketAcrossTabCaches, persistSchedulesMemoryToDisk } from '../utils/ticketTabCache'
import { beginActiveScheduleFetch, endActiveScheduleFetch } from '../utils/schedulesPrefetch'
import { applyRelayScheduleSyncToPatch, mergeRelayScheduleTicketPatch, normalizeRelayScheduleTicket, normalizeRelayScheduleTicketList } from '../utils/relayScheduleSync'
import { fetchCachedDriverOnlyNames, fetchCachedEmployees, fetchCachedLineupInstallerIndex, fetchCachedBranches } from '../utils/portalDirectoryCache'
import {
  BRANCH_ROSTER_UPDATED_EVENT,
  buildBranchRoster,
  fetchAllBranchRosters,
  type BranchRoster,
} from '../utils/branchRoster'
import { resetTicketTableScroll } from '../utils/tabSwitch'
import { notifyArchiveUpdated } from '../utils/ticketArchive'
import { ROBINSON_APPLIANCES_RE } from '../utils/dealer'
import * as XLSX from 'xlsx'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import { RelayEditTicketModal } from '../components/relays/RelayEditTicketModal'
import { type RelayEditDraft } from '../components/relays/relayEditForm'
import { parseStoreVendor } from '../utils/parseStoreVendor'
import { mapRelayDraftToScheduleEditForm } from '../utils/ticketEditBridge'
import {
  FIELD_TICKET_CATEGORIES,
  categoryDefaultServiceType,
  inferCategoryFromTicket,
  isFieldCategory,
  resolveScheduleStatusFields,
  type TicketCategoryValue,
} from '../constants/ticketCategories'
import { SchedulesShowcase, type ScheduleShowcaseRow } from '../components/schedules/SchedulesShowcase'
import { formatBrandCapacityLabel, parseBrandFromAcDetails } from '../utils/warrantyTicketDisplay'

// Ã¢â€â‚¬Ã¢â€â‚¬ Types Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
  installerLineupBranchId?: string
  installer_lineup_branch_id?: string
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
  createdBy?: string
  driverName?: string
  driver_name?: string
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



const STATUS_OPTS = [
  'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY',
  'INSTALLED', 'COMPLETED', 'CONTINUATION',
  'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_DISMANTLE',
]
const TABLE_ROW_HEIGHT = 48

/** Schedule install closed — DB uses INSTALLED; legacy rows may still be COMPLETED. */
function isInstalledWorkflowStatus(status?: string | null): boolean {
  const s = (status || '').toUpperCase()
  return s === 'INSTALLED' || s === 'COMPLETED'
}

type ScheduleOutcome = 'DONE_INSTALLED' | 'DONE_CLEANING' | 'DONE_SURVEY' | 'DONE_CHECKUP' | 'DONE_BACKJOB' | 'DONE_SYSTEM_REPROCESS' | 'DONE_DISMANTLE' | 'DONE_QUOTATION'
type ScheduleStatusGroup = 'pending' | 'closing'

const SCHEDULE_STATUS_OPTS: { value: string; label: string; group: ScheduleStatusGroup }[] = [
  // Pending
  { value: 'S/I', label: 'SURVEY & INSTALL', group: 'pending' },
  { value: 'INSTALL', label: 'INSTALL', group: 'pending' },
  { value: 'SURVEY', label: 'SURVEY', group: 'pending' },
  { value: 'CLEANING', label: 'CLEANING', group: 'pending' },
  { value: 'CHECKUP', label: 'CHECKUP', group: 'pending' },
  { value: 'BACKJOB', label: 'BACKJOB', group: 'pending' },
  { value: 'SERVICE', label: 'SERVICE', group: 'pending' },
  { value: 'RESCHED', label: 'RESCHED', group: 'pending' },
  { value: 'CONTINUATION', label: 'CONTINUATION', group: 'pending' },
  { value: 'FOR_APPROVAL', label: 'FOR QUOTATION', group: 'pending' },
  { value: 'SYSTEM_REPROCESS', label: 'SYSTEM REPROCESS', group: 'pending' },
  { value: 'DISMANTLE', label: 'DISMANTLE', group: 'pending' },
  // Closing
  { value: 'DONE_INSTALLED', label: 'DONE INSTALL', group: 'closing' },
  { value: 'DONE_CLEANING', label: 'DONE CLEANING', group: 'closing' },
  { value: 'DONE_SURVEY', label: 'DONE SURVEY', group: 'closing' },
  { value: 'DONE_CHECKUP', label: 'DONE CHECKUP', group: 'closing' },
  { value: 'DONE_BACKJOB', label: 'DONE BACKJOB', group: 'closing' },
  { value: 'DONE_SYSTEM_REPROCESS', label: 'DONE SYSTEM REPROCESS', group: 'closing' },
  { value: 'DONE_DISMANTLE', label: 'DONE DISMANTLE', group: 'closing' },
  { value: 'DONE_QUOTATION', label: 'DONE QUOTATION', group: 'closing' },
  { value: 'CANCELLED', label: 'CANCELLED', group: 'closing' },
]

const SCHEDULE_PENDING_OPTS = SCHEDULE_STATUS_OPTS.filter(o => o.group === 'pending')
const SCHEDULE_CLOSING_OPTS = SCHEDULE_STATUS_OPTS.filter(o => o.group === 'closing')
const CLOSING_SCHEDULE_STATUSES = new Set([
  'DONE_INSTALLED', 'DONE_CLEANING', 'DONE_SURVEY', 'DONE_CHECKUP', 'DONE_BACKJOB',
  'DONE_SYSTEM_REPROCESS', 'DONE_DISMANTLE', 'DONE_QUOTATION',
])
const SCHEDULE_PENDING_STATUS_VALUES = new Set(SCHEDULE_PENDING_OPTS.map(o => o.value))
const SCHEDULE_CLOSING_STATUS_VALUES = new Set(SCHEDULE_CLOSING_OPTS.map(o => o.value))

function statusShowsScheduleDetails(statusVal: string): boolean {
  return SCHEDULE_PENDING_STATUS_VALUES.has(statusVal) || SCHEDULE_CLOSING_STATUS_VALUES.has(statusVal)
}

function getScheduleTicketKind(ticket: Ticket): string {
  const kind = inferCategoryFromTicket(ticket) as string
  if (kind === 'SURVEY' || kind === 'SERVICES' || kind === 'SURVEY & INSTALL' || kind === 'S/I' || kind === 'INSTALL' || kind === 'CLEANING' || kind === 'CHECKUP' || kind === 'BACKJOB') return kind
  return 'INSTALLATION'
}

function getScheduleStatusBadgeStyle(value: string, isLight: boolean): { color: string; backgroundColor: string; borderColor: string } {
  const normalized = value.toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'INSTALLATION' || normalized === 'INSTALL' || normalized === 'SCHEDULED' || normalized === 'S/I' || normalized === 'S_I' || normalized === 'SI') {
    return { color: isLight ? '#1d4ed8' : '#93c5fd', backgroundColor: isLight ? '#dbeafe' : 'rgba(59,130,246,0.18)', borderColor: isLight ? '#93c5fd' : 'rgba(59,130,246,0.35)' }
  }
  if (normalized === 'CLEANING') {
    return { color: isLight ? '#0369a1' : '#7dd3fc', backgroundColor: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.16)', borderColor: isLight ? '#7dd3fc' : 'rgba(14,165,233,0.35)' }
  }
  if (normalized === 'CHECKUP') {
    return { color: isLight ? '#0ea5e9' : '#38bdf8', backgroundColor: isLight ? '#f0f9ff' : 'rgba(14,165,233,0.16)', borderColor: isLight ? '#bae6fd' : 'rgba(14,165,233,0.35)' }
  }
  if (normalized === 'BACKJOB') {
    return { color: isLight ? '#c2410c' : '#fdba74', backgroundColor: isLight ? '#ffedd5' : 'rgba(234,88,12,0.16)', borderColor: isLight ? '#fdba74' : 'rgba(234,88,12,0.35)' }
  }
  if (normalized === 'SYSTEM_REPROCESS' || normalized === 'DONE_SYSTEM_REPROCESS') {
    return { color: isLight ? '#4338ca' : '#a5b4fc', backgroundColor: isLight ? '#e0e7ff' : 'rgba(99,102,241,0.18)', borderColor: isLight ? '#a5b4fc' : 'rgba(99,102,241,0.35)' }
  }
  if (normalized === 'DISMANTLE' || normalized === 'DONE_DISMANTLE') {
    return { color: isLight ? '#be123c' : '#fb7185', backgroundColor: isLight ? '#ffe4e6' : 'rgba(244,63,94,0.16)', borderColor: isLight ? '#fb7185' : 'rgba(244,63,94,0.35)' }
  }
  if (normalized === 'SURVEY') {
    return { color: isLight ? '#6d28d9' : '#c4b5fd', backgroundColor: isLight ? '#ede9fe' : 'rgba(139,92,246,0.18)', borderColor: isLight ? '#c4b5fd' : 'rgba(139,92,246,0.35)' }
  }
  if (normalized === 'DONE_SURVEY' || normalized === 'DONE_CHECKUP') {
    return { color: isLight ? '#a16207' : '#fbbf24', backgroundColor: isLight ? '#fef9c3' : 'rgba(251,191,36,0.14)', borderColor: isLight ? '#fcd34d' : 'rgba(251,191,36,0.35)' }
  }
  if (normalized === 'RESCHED') {
    return { color: isLight ? '#a16207' : '#fbbf24', backgroundColor: isLight ? '#fef9c3' : 'rgba(251,191,36,0.14)', borderColor: isLight ? '#fcd34d' : 'rgba(251,191,36,0.35)' }
  }
  if (normalized === 'CONTINUATION') {
    return { color: isLight ? '#7c3aed' : '#c084fc', backgroundColor: isLight ? '#f3e8ff' : 'rgba(124,58,237,0.18)', borderColor: isLight ? '#c084fc' : 'rgba(124,58,237,0.35)' }
  }
  if (normalized === 'FOR_APPROVAL') {
    return { color: isLight ? '#047857' : '#6ee7b7', backgroundColor: isLight ? '#d1fae5' : 'rgba(16,185,129,0.15)', borderColor: isLight ? '#6ee7b7' : 'rgba(16,185,129,0.3)' }
  }
  if (
    normalized === 'DONE_INSTALLED' ||
    normalized === 'INSTALLED' ||
    normalized === 'COMPLETED' ||
    normalized === 'DONE_CLEANING' ||
    normalized === 'DONE_BACKJOB' ||
    normalized === 'DONE_QUOTATION'
  ) {
    return { color: isLight ? '#15803d' : '#86efac', backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.18)', borderColor: isLight ? '#86efac' : 'rgba(22,163,74,0.35)' }
  }
  if (normalized === 'SERVICES') {
    return { color: isLight ? '#0e7490' : '#67e8f9', backgroundColor: isLight ? '#cffafe' : 'rgba(6,182,212,0.15)', borderColor: isLight ? '#67e8f9' : 'rgba(6,182,212,0.3)' }
  }
  if (normalized === 'CANCELLED') {
    return { color: isLight ? '#b91c1c' : '#fca5a5', backgroundColor: isLight ? '#fee2e2' : 'rgba(239,68,68,0.12)', borderColor: isLight ? '#fca5a5' : 'rgba(239,68,68,0.3)' }
  }
  return { color: isLight ? '#475569' : '#94a3b8', backgroundColor: isLight ? '#f1f5f9' : 'rgba(148,163,184,0.12)', borderColor: isLight ? '#cbd5e1' : 'rgba(148,163,184,0.25)' }
}

function getScheduleOutcome(ticket: Partial<Ticket>): ScheduleOutcome | null {
  const meta = parseAcMeta(ticket as Ticket)
  const explicit = String(meta.scheduleOutcome || '').toUpperCase()
  if (
    explicit === 'DONE_CLEANING'
    || explicit === 'DONE_INSTALLED'
    || explicit === 'DONE_SURVEY'
    || explicit === 'DONE_CHECKUP'
    || explicit === 'DONE_BACKJOB'
    || explicit === 'DONE_SYSTEM_REPROCESS'
    || explicit === 'DONE_DISMANTLE'
    || explicit === 'DONE_QUOTATION'
  ) {
    return explicit
  }
  const remarks = ticketRemarksText(ticket as Ticket).toLowerCase()
  const stat = String(ticket.status || '').toUpperCase()
  if (isInstalledWorkflowStatus(stat)) {
    if (/clean/i.test(remarks)) return 'DONE_CLEANING'
    if (/checkup|check-up/i.test(remarks)) return 'DONE_CHECKUP'
    if (/backjob|back-job|back job/i.test(remarks)) return 'DONE_BACKJOB'
    if (/survey/i.test(remarks)) return 'DONE_SURVEY'
    if (isInstalledRemarks(remarks)) return 'DONE_INSTALLED'
  }
  if (stat === 'SURVEY' && /done.*survey|survey.*done|surveyed/i.test(remarks)) return 'DONE_SURVEY'
  if (stat === 'DONE_SYSTEM_REPROCESS') return 'DONE_SYSTEM_REPROCESS'
  if (stat === 'DONE_DISMANTLE') return 'DONE_DISMANTLE'
  return null
}

function getScheduleStatusValue(ticket: Ticket): string {
  const outcome = getScheduleOutcome(ticket)
  if (outcome) return outcome

  const meta = parseAcMeta(ticket)
  const phase = String(meta.schedulePhase || '').toUpperCase().replace(/\s+/g, '_')
  if (phase === 'CLEANING') return 'CLEANING'
  if (phase === 'SURVEY') return 'SURVEY'
  if (phase === 'INSTALLATION') return 'INSTALLATION'
  if (phase === 'SERVICES' || phase === 'SERVICE') return 'SERVICES'
  if (phase === 'CHECKUP') return 'CHECKUP'
  if (phase === 'BACKJOB') return 'BACKJOB'
  if (phase === 'SYSTEM_REPROCESS') return 'SYSTEM_REPROCESS'
  if (phase === 'DISMANTLE') return 'DISMANTLE'

  let stat = (ticket.status || 'SCHEDULED').toUpperCase().replace(/\s+/g, '_')
  if (stat === 'S/I' || stat === 'S_I' || stat === 'SI') return 'S/I'
  if (stat === 'INSTALL') return 'INSTALL'
  if (stat === 'CHECKUP') return 'CHECKUP'
  if (stat === 'INSTALLATION') return 'INSTALLATION'
  if (stat === 'FOR_QUOTATION') stat = 'FOR_APPROVAL'
  if (stat === 'RESCHED') return 'RESCHED'
  if (stat === 'SURVEY') return 'SURVEY'
  if (stat === 'FOR_APPROVAL') return 'FOR_APPROVAL'
  if (stat === 'CONTINUATION') return 'CONTINUATION'
  if (stat === 'SYSTEM_REPROCESS') return 'SYSTEM_REPROCESS'
  if (stat === 'DONE_SYSTEM_REPROCESS') return 'DONE_SYSTEM_REPROCESS'
  if (stat === 'DISMANTLE') return 'DISMANTLE'
  if (stat === 'DONE_DISMANTLE') return 'DONE_DISMANTLE'
  if (stat === 'CANCELLED') return 'CANCELLED'
  if (stat === 'INSTALLED' || stat === 'COMPLETED') return 'DONE_INSTALLED'

  const kind = getScheduleTicketKind(ticket)
  if (kind === 'SURVEY') return 'SURVEY'
  if (kind === 'SERVICES') return 'SERVICES'
  if (kind === 'SURVEY & INSTALL' || kind === 'S/I') return 'SURVEY & INSTALL'
  if (kind === 'INSTALL') return 'INSTALL'
  if (kind === 'CLEANING') return 'CLEANING'
  if (kind === 'CHECKUP') return 'CHECKUP'
  if (kind === 'BACKJOB') return 'BACKJOB'
  return 'INSTALLATION'
}

function getScheduleStatusLabel(value: string): string {
  const normalized = value.toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'INSTALLED') return 'INSTALLED'
  if (normalized === 'S/I' || normalized === 'S_I' || normalized === 'SI') return 'INSTALLATION'
  const found = SCHEDULE_STATUS_OPTS.find(opt => opt.value === normalized)
  return (found?.label ?? value.replace(/_/g, ' ')).toUpperCase()
}

/** Rank overview search hits Ã¢â‚¬â€ exact / prefix name matches float to the top. */
function getOverviewSearchRelevanceScore(ticket: Ticket, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return 0

  const scoredFields: { value: string; weight: number; exactBonus: number; prefixBonus: number }[] = [
    {
      value: ticket.customerName || ticket.customer_name || ticket.title || '',
      weight: 100,
      exactBonus: 250,
      prefixBonus: 120,
    },
    {
      value: ticket.ticketNumber || ticket.ticket_number || ticket.id || '',
      weight: 90,
      exactBonus: 200,
      prefixBonus: 100,
    },
    {
      value: ticket.controlNumber || ticket.control_number || '',
      weight: 75,
      exactBonus: 150,
      prefixBonus: 70,
    },
    {
      value: ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '',
      weight: 65,
      exactBonus: 120,
      prefixBonus: 50,
    },
    {
      value: formatAddress(ticket.location),
      weight: 45,
      exactBonus: 0,
      prefixBonus: 25,
    },
    {
      value: ticket.assignedEmployeeName || ticket.assigned_employee_name || '',
      weight: 40,
      exactBonus: 80,
      prefixBonus: 30,
    },
    {
      value: ticket.remarks || ticket.remarksUpdate || ticket.note || '',
      weight: 25,
      exactBonus: 0,
      prefixBonus: 10,
    },
  ]

  let score = 0
  for (const { value, weight, exactBonus, prefixBonus } of scoredFields) {
    const v = value.toLowerCase().trim()
    if (!v) continue
    if (v === q) score += weight + exactBonus
    else if (v.startsWith(q)) score += weight + prefixBonus
    else if (v.includes(q)) score += weight
    else if (q.length >= 2 && v.split(/\s+/).some(word => word.startsWith(q))) {
      score += Math.round(weight * 0.75)
    }
  }
  return score
}

function sortOverviewSearchResults(tickets: Ticket[], query: string): Ticket[] {
  const q = query.trim()
  if (!q) return tickets
  return [...tickets].sort((a, b) => {
    const diff = getOverviewSearchRelevanceScore(b, q) - getOverviewSearchRelevanceScore(a, q)
    if (diff !== 0) return diff
    const aDate = a.updatedAt || a.updated_at || a.createdAt || a.created_at || ''
    const bDate = b.updatedAt || b.updated_at || b.createdAt || b.created_at || ''
    return bDate.localeCompare(aDate)
  })
}

function ticketMatchesOverviewQuery(ticket: Ticket, rawQuery: string): boolean {
  const q = rawQuery.trim()
  if (!q) return false

  const qUpper = q.toUpperCase()
  const qLower = q.toLowerCase()
  const qDigits = q.replace(/\D/g, '')

  if (/^AS-\d+/i.test(q) || /^TKT-\d+/i.test(q)) {
    const tn = normalizeTicketNumberKey(ticket.ticketNumber || ticket.ticket_number)
    return tn === qUpper || tn.startsWith(qUpper)
  }

  const ticketNum = normalizeTicketNumberKey(ticket.ticketNumber || ticket.ticket_number)
  if (ticketNum && (ticketNum === qUpper || ticketNum.startsWith(qUpper))) return true

  const control = (ticket.controlNumber || ticket.control_number || '').trim().toLowerCase()
  if (control && (control === qLower || control.includes(qLower))) return true

  if (qDigits.length >= 7) {
    const phone = (ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '')
      .replace(/\D/g, '')
    if (phone && phone.includes(qDigits)) return true
  }

  return getOverviewSearchRelevanceScore(ticket, q) >= 25
}

function filterOverviewSearchResults(tickets: Ticket[], query: string): Ticket[] {
  const q = query.trim()
  if (!q) return []
  return tickets.filter(ticket => ticketMatchesOverviewQuery(ticket, q))
}

/** Overview search cards: one badge Ã¢â‚¬â€ workflow status (SCHEDULED) beats duplicate INSTALLATION phase. */
function getOverviewStatusBadge(ticket: Ticket): { value: string; label: string } {
  const workflow = (ticket.status || '').toUpperCase().replace(/\s+/g, '_')
  if (workflow === 'ASSIGNED' && hasFinalScheduleDate(ticket)) {
    return { value: 'SCHEDULED', label: getScheduleStatusLabel('SCHEDULED') }
  }
  const workflowStatuses = new Set([
    'SCHEDULED', 'ASSIGNED', 'RESCHED', 'PENDING', 'IN_PROGRESS', 'ON_THE_WAY',
    'FOR_APPROVAL', 'FOR_QUOTATION', 'CANCELLED', 'COMPLETED', 'INSTALLED',
    'CONTINUATION', 'SURVEY',
    'SYSTEM_REPROCESS', 'DONE_SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_DISMANTLE',
  ])
  if (workflowStatuses.has(workflow)) {
    const norm = workflow === 'FOR_QUOTATION' ? 'FOR_APPROVAL' : workflow
    return { value: norm, label: getScheduleStatusLabel(norm) }
  }
  const phase = getScheduleStatusValue(ticket)
  return { value: phase, label: getScheduleStatusLabel(phase) }
}

/** True when ticket still carries reschedule ghost metadata (old date row / Moved toÃ¢â‚¬Â¦). */
function ticketHasRescheduleMeta(ticket: Ticket): boolean {
  if ((ticket.status || '').toUpperCase() === 'RESCHED') return true
  if (getScheduleStatusValue(ticket) === 'RESCHED') return true
  if (isReschedulePending(ticket)) return true
  if (getPreviousScheduleDates(ticket).length > 0) return true
  const meta = parseAcMeta(ticket)
  if (String(meta.rescheduledTo || '').trim()) return true
  const remarks = (ticket.remarksUpdate || ticket.remarks || '').trim()
  return isMovedToRescheduleRemark(remarks)
}

/** Clear ghost-date / Moved-to state when leaving RESCHED for an active status. */
function clearRescheduleMetaInto(
  ticket: Ticket,
  body: Record<string, unknown>,
  acUpdates: Record<string, unknown>,
) {
  if (!ticketHasRescheduleMeta(ticket)) return

  // previousScheduleDates is kept (not cleared) — it's the permanent ghost-row history for the
  // old date, and should survive the ticket moving on to an active status on its new date.
  acUpdates.rescheduledTo = ''
  acUpdates.reschedulePending = false

  const remarks = (ticket.remarksUpdate || ticket.remarks || '').trim()
  if (isMovedToRescheduleRemark(remarks) || /^PENDING$/i.test(remarks)) {
    body.remarks = ''
    body.remarksUpdate = ''
    acUpdates.update = ''
    acUpdates.remarksUpdate = ''
  }

  // Keep the ticket on its current preferred date (the reschedule target), as an active row
  const meta = parseAcMeta(ticket)
  const target = String(meta.rescheduledTo || '').split('T')[0].trim()
  const preferred = getPreferredDateKey(ticket)
  if (target) body.preferredDate = target
  else if (preferred) body.preferredDate = preferred
}

function applyScheduleStatusPatch(ticket: Ticket, scheduleValue: string): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const val = scheduleValue.toUpperCase().replace(/\s+/g, '_')
  const acUpdates: Record<string, unknown> = { schedulePhase: '' }

  const setClosing = (outcome: ScheduleOutcome) => {
    body.status = 'COMPLETED'
    body.scheduleOutcome = outcome
    acUpdates.scheduleOutcome = outcome
    acUpdates.schedulePhase = ''
  }

  if (val === 'DONE_CLEANING') {
    setClosing('DONE_CLEANING')
  } else if (val === 'DONE_CHECKUP') {
    setClosing('DONE_CHECKUP')
  } else if (val === 'DONE_BACKJOB') {
    setClosing('DONE_BACKJOB')
  } else if (val === 'DONE_INSTALLED') {
    body.status = 'INSTALLED'
    body.scheduleOutcome = 'DONE_INSTALLED'
    acUpdates.scheduleOutcome = 'DONE_INSTALLED'
    acUpdates.schedulePhase = ''
  } else if (val === 'DONE_SURVEY') {
    setClosing('DONE_SURVEY')
  } else if (val === 'DONE_SYSTEM_REPROCESS') {
    body.status = 'DONE_SYSTEM_REPROCESS'
    body.scheduleOutcome = 'DONE_SYSTEM_REPROCESS'
    acUpdates.scheduleOutcome = 'DONE_SYSTEM_REPROCESS'
    acUpdates.schedulePhase = ''
  } else if (val === 'DONE_DISMANTLE') {
    body.status = 'DONE_DISMANTLE'
    body.scheduleOutcome = 'DONE_DISMANTLE'
    acUpdates.scheduleOutcome = 'DONE_DISMANTLE'
    acUpdates.schedulePhase = ''
  } else if (val === 'DONE_QUOTATION') {
    setClosing('DONE_QUOTATION')
  } else if (val === 'SYSTEM_REPROCESS') {
    body.status = 'SYSTEM_REPROCESS'
    body.ticketCategory = 'SERVICES'
    body.serviceType = 'SYSTEM REPROCESS'
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'SYSTEM_REPROCESS'
  } else if (val === 'DISMANTLE') {
    body.status = 'DISMANTLE'
    body.ticketCategory = 'SERVICES'
    body.serviceType = 'DISMANTLE'
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'DISMANTLE'
  } else if (val === 'FOR_QUOTATION') {
    body.status = 'FOR_APPROVAL'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CLEANING') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'CLEANING'
  } else if (val === 'CHECKUP') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'CHECKUP'
  } else if (val === 'BACKJOB') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'BACKJOB'
  } else if (val === 'INSTALLATION' || val === 'S/I' || val === 'S_I' || val === 'SI' || val === 'INSTALL') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'INSTALLATION'
    body.serviceType = categoryDefaultServiceType('INSTALLATION')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'INSTALLATION'
  } else if (val === 'SERVICES' || val === 'SERVICE') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'SERVICES'
  } else if (val === 'SURVEY') {
    body.status = 'SURVEY'
    body.ticketCategory = 'SURVEY'
    body.serviceType = categoryDefaultServiceType('SURVEY')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'SURVEY'
  } else if (val === 'RESCHED') {
    body.status = 'RESCHED'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'FOR_APPROVAL') {
    body.status = 'FOR_APPROVAL'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CONTINUATION') {
    body.status = 'CONTINUATION'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CANCELLED') {
    body.status = 'CANCELLED'
    acUpdates.scheduleOutcome = ''
    // Preserve branch so the muted Schedules ghost survives reload (branch-scoped fetch + filter).
    const cancelBranch = resolveScopedBranchId(ticket.branchId || ticket.branch_id)
    if (cancelBranch) {
      body.branchId = cancelBranch
      acUpdates.cancelledBranchId = cancelBranch
    }
    // Keep date anchors so the row stays on this Schedules day after reload (preferred_date + ac_details).
    const cancelDate = getFinalDateKey(ticket)
      || getPreferredDateKey(ticket)
      || String(parseAcMeta(ticket).scheduledDate || '').split('T')[0].split(' ')[0].trim()
    if (cancelDate) {
      body.preferredDate = cancelDate
      acUpdates.finalDate = getFinalDateKey(ticket) || cancelDate
      acUpdates.scheduledDate = cancelDate
    }
  } else if (SCHEDULE_STATUS_OPTS.some(opt => opt.value === val)) {
    // Safety net for any pending/closing option added to SCHEDULE_STATUS_OPTS without an
    // explicit branch above — resolve through the shared mapper instead of sending the raw
    // button value straight through (that crashes with "No enum constant Ticket.Status.X").
    const resolved = resolveScheduleStatusFields(val)
    body.status = resolved.status
    if (resolved.ticketCategory) body.ticketCategory = resolved.ticketCategory
    if (resolved.serviceType) body.serviceType = resolved.serviceType
    acUpdates.scheduleOutcome = resolved.scheduleOutcome ?? ''
    if (resolved.schedulePhase !== undefined) acUpdates.schedulePhase = resolved.schedulePhase
  }

  // Leaving RESCHED Ã¢â€ â€™ active status: drop ghost on old date and "Moved toÃ¢â‚¬Â¦" remarks
  if (val !== 'RESCHED') {
    clearRescheduleMetaInto(ticket, body, acUpdates)
  }

  if (Object.keys(acUpdates).length > 0) {
    body.acDetails = mergeAcMeta(ticket, acUpdates)
  }
  return body
}

function mergeTicketPatch(ticket: Ticket, body: Record<string, unknown>): Ticket {
  const merged = mergeRelayScheduleTicketPatch(ticket, body)
  if (Object.prototype.hasOwnProperty.call(body, 'serviceVehicle')) {
    const sv = body.serviceVehicle
    const cleared = sv == null || sv === ''
    merged.serviceVehicle = cleared ? undefined : String(sv)
    merged.service_vehicle = merged.serviceVehicle
  }
  if (Object.prototype.hasOwnProperty.call(body, 'driverName') || Object.prototype.hasOwnProperty.call(body, 'driver_name')) {
    const dn = body.driverName !== undefined ? body.driverName : body.driver_name
    const cleared = dn == null || dn === ''
    merged.driverName = cleared ? undefined : String(dn)
    merged.driver_name = merged.driverName
  }
  return merged
}

function hasLocalScheduleValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

/** Keep installer / driver / payment / remarks from the user's local row when server sync returns stale data. */
function preserveLocalScheduleFields(local: Ticket, server: Ticket): Ticket {
  const normalizedServer = normalizeRelayScheduleTicket(server)
  let next = mergeTicketPatch(local, normalizedServer as unknown as Record<string, unknown>)

  const copyIfLocal = (field: keyof Ticket) => {
    const localVal = local[field]
    if (hasLocalScheduleValue(localVal)) {
      (next as unknown as Record<string, unknown>)[field as string] = localVal
    }
  }

  copyIfLocal('installerName')
  copyIfLocal('serviceVehicle')
  copyIfLocal('driverName')
  copyIfLocal('modeOfPayment')
  copyIfLocal('installationCharges')
  copyIfLocal('remarksUpdate')
  copyIfLocal('remarks')
  copyIfLocal('status')
  copyIfLocal('serviceType')
  copyIfLocal('commitType')
  copyIfLocal('preferredDate')
  // Every other Edit-Ticket-modal field must survive the same stale-server-refetch race as
  // driver/vehicle/date above — branchId especially, since a just-moved branch (e.g. Taguig
  // Sales -> Services) getting reverted by a lagging read silently reassigns the ticket back
  // to the wrong branch's table.
  copyIfLocal('branchId')
  copyIfLocal('customerName')
  copyIfLocal('location')
  copyIfLocal('contactPhone')
  copyIfLocal('unitType')
  copyIfLocal('dealer')
  copyIfLocal('sourceVendor')
  copyIfLocal('district')
  copyIfLocal('negotiatorId')
  copyIfLocal('ticketNumber')
  copyIfLocal('controlNumber')

  if (hasLocalScheduleValue(local.mode_of_payment)) next.mode_of_payment = local.mode_of_payment
  if (hasLocalScheduleValue(local.installation_charges)) next.installation_charges = local.installation_charges
  if (hasLocalScheduleValue(local.service_vehicle)) next.service_vehicle = local.service_vehicle
  if (hasLocalScheduleValue(local.driver_name)) next.driver_name = local.driver_name
  if (hasLocalScheduleValue(local.branch_id)) next.branch_id = local.branch_id
  if (hasLocalScheduleValue(local.customer_name)) next.customer_name = local.customer_name
  if (hasLocalScheduleValue(local.contact_phone)) next.contact_phone = local.contact_phone
  if (hasLocalScheduleValue(local.unit_type)) next.unit_type = local.unit_type
  if (hasLocalScheduleValue(local.source_vendor)) next.source_vendor = local.source_vendor
  if (hasLocalScheduleValue(local.negotiator_id)) next.negotiator_id = local.negotiator_id
  if (hasLocalScheduleValue(local.control_number)) next.control_number = local.control_number
  if (hasLocalScheduleValue(local.ticket_number)) next.ticket_number = local.ticket_number
  const localFinalDate = (local as Ticket & { finalDate?: string; final_date?: string }).finalDate
    || (local as Ticket & { final_date?: string }).final_date
  if (hasLocalScheduleValue(localFinalDate)) {
    (next as Ticket & { finalDate?: string; final_date?: string }).finalDate = localFinalDate;
    (next as Ticket & { final_date?: string }).final_date = localFinalDate
  }
  const localPreferredDate = local.preferred_date
  if (hasLocalScheduleValue(localPreferredDate)) next.preferred_date = localPreferredDate
  const localRemarksUpdate = (local as Ticket & { remarks_update?: string }).remarks_update
  if (hasLocalScheduleValue(localRemarksUpdate)) {
    (next as Ticket & { remarks_update?: string }).remarks_update = localRemarksUpdate
  }

  if (local.acDetails?.trim()) {
    try {
      const localMeta = parseAcMeta(local)
      const serverMeta = parseAcMeta(next)
      const mergedMeta: Record<string, unknown> = { ...serverMeta }
      for (const key of [
        'installerName', 'installer', 'technicianName', 'driverName', 'serviceVehicle', 'driver_name',
        'modeOfPayment', 'installationCharges', 'installation_charges', 'update', 'remarksUpdate',
        'scheduleOutcome', 'paymentMode', 'paymentStatus', 'charges', 'amountCharged',
        // Schedule date fields — a just-saved date move must never be clobbered by a stale
        // server re-fetch (e.g. read-after-write lag on the prod DB pooler); local is fresher.
        'finalDate', 'scheduledDate', 'previousScheduleDates', 'rescheduledTo', 'reschedulePending',
        'archivedScheduleDate', 'installedDate',
        // Remaining Edit-Ticket-modal fields — same read-after-write race applies to these as
        // to driver/vehicle/date above, so they need the same "local wins" protection.
        'destination', 'address', 'district', 'brand', 'unitType', 'dealer', 'dlr',
        'negotiatorId', 'negotiatorName',
      ]) {
        const v = localMeta[key]
        if (hasLocalScheduleValue(v)) mergedMeta[key] = v
      }
      next.acDetails = JSON.stringify(mergedMeta)
      next.ac_details = next.acDetails
    } catch {
      next.acDetails = local.acDetails
      next.ac_details = local.acDetails
    }
  }

  return normalizeRelayScheduleTicket(next)
}

function mergeServerListWithLocalEdits(
  serverList: Ticket[],
  localList: Ticket[],
  editedIds: Set<string>,
  options?: {
    dateFilter?: string
    extraLocal?: Ticket[]
    /** Active branch — required so date-retained cancelled edits can't reappear after a branch switch. */
    branchId?: string | null
    email?: string | null
    jobTitle?: string | null
    lineupIndex?: InstallerBranchIndexEntry[]
    driverOnlyNames?: string[]
  },
): Ticket[] {
  // The server response is the source of truth for what's ON this date/branch. Only rows this
  // browser genuinely has unconfirmed state for — recently edited within the 5-minute window,
  // still queued/in-flight saves, or not-yet-created temp rows, all folded into editedIds by the
  // caller — survive a server response that omits them. Anything else is trusted to reflect real
  // backend state: if the server no longer returns it, it no longer belongs here.
  // (This used to also re-add ANY row ever cached for this date regardless of age, via a
  // "stickyLocal" flag — meant to stop a stale/incomplete server response from making rows vanish,
  // but it meant a browser that had once loaded a ticket kept showing it forever even after it was
  // deleted/moved elsewhere, while other devices with no such cache correctly stopped showing it.
  // That per-device divergence is exactly what this function must prevent.)
  if (editedIds.size === 0) return serverList

  const localById = new Map<string, Ticket>()
  for (const t of localList) localById.set(t.id, t)
  for (const t of options?.extraLocal || []) {
    if (!localById.has(t.id)) localById.set(t.id, t)
  }
  if (localById.size === 0) return serverList

  const serverIds = new Set(serverList.map(t => t.id))
  const merged = serverList.map(serverTicket => {
    const local = localById.get(serverTicket.id)
    if (!local || !editedIds.has(serverTicket.id)) return serverTicket
    return preserveLocalScheduleFields(local, serverTicket)
  })

  const dateKey = options?.dateFilter
  const branchKey = options?.branchId
  const lineup = options?.lineupIndex
  const drivers = options?.driverOnlyNames || []
  for (const local of localById.values()) {
    if (serverIds.has(local.id)) continue
    if (!editedIds.has(local.id)) continue
    if (dateKey && !ticketMatchesDateKey(local, dateKey) && !isScheduleGhostOnDate(local, dateKey)) continue
    // Date match alone is not enough — a just-cancelled ticket stays "protected" for ~5 min and
    // would otherwise reappear when the admin switches Active Branch on the same schedule date.
    if (branchKey && branchKey !== 'ALL_BRANCHES'
      && !ticketBelongsOnScheduleBranch(local, branchKey, options?.email, options?.jobTitle, lineup, drivers)) {
      continue
    }
    merged.unshift(normalizeRelayScheduleTicket(local) as Ticket)
  }

  return merged
}

function resolveTicketScheduleDateKey(ticket: Ticket): string {
  const final = getFinalDateKey(ticket)
  if (final) return final
  const scheduled = String(parseAcMeta(ticket).scheduledDate || '').split('T')[0].split(' ')[0].trim()
  if (scheduled) return scheduled
  return getPreferredDateKey(ticket) || ''
}

function resolveFormScheduleDateKey(form: { finalDate?: string; preferredDate?: string }): string {
  const final = form.finalDate?.split('T')[0]?.trim() || ''
  const preferred = form.preferredDate?.split('T')[0]?.trim() || ''
  return final || preferred
}

function mergeAcDetailsStrings(base?: string, overlay?: string): string | undefined {
  if (!overlay) return base
  if (!base) return overlay
  try {
    const baseParsed = JSON.parse(base)
    const overlayParsed = JSON.parse(overlay)
    const baseMeta = (Array.isArray(baseParsed) ? baseParsed[0] : baseParsed) || {}
    const overlayMeta = (Array.isArray(overlayParsed) ? overlayParsed[0] : overlayParsed) || {}
    return JSON.stringify({ ...baseMeta, ...overlayMeta })
  } catch {
    return overlay
  }
}

function mergePatchBodies(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...a, ...b }
  const ac = mergeAcDetailsStrings(
    typeof a.acDetails === 'string' ? a.acDetails : undefined,
    typeof b.acDetails === 'string' ? b.acDetails : undefined,
  )
  if (ac !== undefined) merged.acDetails = ac
  return merged
}

/** Ensure PATCH body is valid for schedule status saves (esp. INSTALLED/COMPLETED + scheduleOutcome). */
function sanitizeTicketPatchBody(body: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body }
  const outcomeRaw = typeof next.scheduleOutcome === 'string' ? next.scheduleOutcome.trim() : ''
  if (outcomeRaw) {
    next.scheduleOutcome = outcomeRaw
  } else {
    delete next.scheduleOutcome
  }

  let status = String(next.status || '').toUpperCase()
  const outcome = String(next.scheduleOutcome || '').toUpperCase()
  if (status === 'COMPLETED' && outcome === 'DONE_INSTALLED') {
    status = 'INSTALLED'
    next.status = 'INSTALLED'
  }
  if ((status === 'INSTALLED' || status === 'COMPLETED') && !next.scheduleOutcome) {
    let fromAc = ''
    if (typeof next.acDetails === 'string') {
      try {
        const parsed = JSON.parse(next.acDetails)
        const meta = (Array.isArray(parsed) ? parsed[0] : parsed) || {}
        fromAc = String(meta.scheduleOutcome || '').trim()
      } catch { /* ignore */ }
    }
    next.scheduleOutcome = fromAc || 'DONE_INSTALLED'
    if (status === 'INSTALLED' || (!fromAc && status === 'COMPLETED')) {
      next.status = 'INSTALLED'
    }
    if (typeof next.acDetails === 'string') {
      next.acDetails = mergeAcMeta(
        { acDetails: next.acDetails } as Ticket,
        { scheduleOutcome: next.scheduleOutcome, schedulePhase: '' },
      )
    }
  }
  return applyRelayScheduleSyncToPatch(next)
}

function getScheduleRowColors(
  ticket: Ticket,
  ghostKind: 'completed' | 'resched' | 'cancelled' | null,
  isLight: boolean,
  idx: number,
  rowEven: string,
  rowOdd: string,
  isDuplicateName: boolean,
): { baseBg: string; accent?: string } {
  const outcome = getScheduleOutcome(ticket)

  // Dark mode: every status wash below is intentionally low-alpha (0.05–0.10) so the row reads
  // as a subtle tint over the base surface, not a saturated block — the accent color still carries
  // the full-strength hue as a thin 3px left border (see boxShadow at the call site), which is
  // enough signal without turning the whole table into a wall of neon on black.
  if (ghostKind === 'cancelled' || (ticket.status || '').toUpperCase() === 'CANCELLED') {
    return {
      baseBg: isLight ? '#fee2e2' : 'rgba(239,68,68,0.10)',
      accent: '#EF4444',
    }
  }

  if (ghostKind === 'completed') {
    // Ghost/duplicate rows are secondary (already muted + italic text elsewhere) — keep their
    // wash a touch dimmer than an active row's so they read as clearly lower-priority.
    if (outcome === 'DONE_CLEANING') {
      return {
        baseBg: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.07)',
        accent: '#0EA5E9',
      }
    }
    if (outcome === 'DONE_SURVEY') {
      return {
        baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.06)',
        accent: '#fbbf24',
      }
    }
    if (outcome === 'DONE_CHECKUP') {
      return {
        baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.06)',
        accent: '#fbbf24',
      }
    }
  if (outcome === 'DONE_BACKJOB') {
    return {
      baseBg: isLight ? '#dbeafe' : 'rgba(59,130,246,0.08)',
      accent: '#3B82F6',
    }
  }
  if (outcome === 'DONE_SYSTEM_REPROCESS') {
    return {
      baseBg: isLight ? '#e0e7ff' : 'rgba(99,102,241,0.07)',
      accent: '#6366F1',
    }
  }
  if (outcome === 'DONE_DISMANTLE') {
    return {
      baseBg: isLight ? '#ffe4e6' : 'rgba(244,63,94,0.07)',
      accent: '#F43F5E',
    }
  }
  if (outcome === 'DONE_QUOTATION') {
    return {
      baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.07)',
      accent: '#16A34A',
    }
  }
    return {
      baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.07)',
      accent: '#16A34A',
    }
  }

  if (ghostKind === 'resched') {
    return {
      baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.06)',
      accent: '#fbbf24',
    }
  }

  if (outcome === 'DONE_INSTALLED') {
    return {
      baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.09)',
      accent: '#16A34A',
    }
  }

  if (outcome === 'DONE_SURVEY') {
    return {
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.07)',
      accent: '#fbbf24',
    }
  }

  if (outcome === 'DONE_CLEANING') {
    return {
      baseBg: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.08)',
      accent: '#0EA5E9',
    }
  }

  if (outcome === 'DONE_CHECKUP') {
    return {
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.07)',
      accent: '#fbbf24',
    }
  }

  if (outcome === 'DONE_BACKJOB') {
    return {
      baseBg: isLight ? '#eff6ff' : 'rgba(59,130,246,0.07)',
      accent: '#3B82F6',
    }
  }

  if (outcome === 'DONE_SYSTEM_REPROCESS') {
    return {
      baseBg: isLight ? '#eef2ff' : 'rgba(99,102,241,0.07)',
      accent: '#6366F1',
    }
  }

  if (outcome === 'DONE_DISMANTLE') {
    return {
      baseBg: isLight ? '#fff1f2' : 'rgba(244,63,94,0.07)',
      accent: '#F43F5E',
    }
  }

  if (outcome === 'DONE_QUOTATION') {
    return {
      baseBg: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.06)',
      accent: '#10B981',
    }
  }

  const statusVal = getScheduleStatusValue(ticket)
  if (statusVal === 'RESCHED') {
    return {
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.07)',
      accent: '#fbbf24',
    }
  }
  if (statusVal === 'SURVEY') {
    return {
      baseBg: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.07)',
      accent: '#8B5CF6',
    }
  }
  if (statusVal === 'CLEANING' || statusVal === 'CHECKUP' || statusVal === 'BACKJOB') {
    return {
      baseBg: isLight ? '#f0f9ff' : 'rgba(14,165,233,0.07)',
      accent: '#0EA5E9',
    }
  }
  if (statusVal === 'SYSTEM_REPROCESS') {
    return {
      baseBg: isLight ? '#eef2ff' : 'rgba(99,102,241,0.07)',
      accent: '#6366F1',
    }
  }
  if (statusVal === 'DISMANTLE') {
    return {
      baseBg: isLight ? '#fff1f2' : 'rgba(244,63,94,0.07)',
      accent: '#F43F5E',
    }
  }
  if (statusVal === 'INSTALLATION' || statusVal === 'SERVICES') {
    return {
      baseBg: isLight ? '#eff6ff' : 'rgba(59,130,246,0.06)',
      accent: '#3B82F6',
    }
  }
  if (statusVal === 'FOR_APPROVAL') {
    return {
      baseBg: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.06)',
      accent: '#10B981',
    }
  }

  if (isDuplicateName) {
    return { baseBg: isLight ? '#fef9c3' : '#221d0f' }
  }

  return { baseBg: idx % 2 === 0 ? rowEven : rowOdd }
}

function shouldArchiveCompletedSchedule(ticket: Ticket, body: Record<string, unknown>): boolean {
  const outcome = getScheduleOutcome({
    ...ticket,
    ...body,
    acDetails: typeof body.acDetails === 'string' ? body.acDetails : ticket.acDetails,
  } as Ticket)
  if (
    outcome === 'DONE_CLEANING'
    || outcome === 'DONE_SURVEY'
    || outcome === 'DONE_CHECKUP'
    || outcome === 'DONE_BACKJOB'
    || outcome === 'DONE_SYSTEM_REPROCESS'
    || outcome === 'DONE_DISMANTLE'
  ) return false
  if (outcome === 'DONE_INSTALLED') return true
  return qualifiesForInstallComplete(ticket, body as Partial<Ticket>)
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

function isGenericUnitTypeLabel(value?: string | null): boolean {
  const normalized = (value || '').trim().toLowerCase()
  return !normalized
    || normalized === 'split ac'
    || normalized === 'split'
    || normalized === 'ac'
    || normalized === 'window ac'
    || normalized === 'window'
}

/** Brand / HP for schedules Ã¢â‚¬â€ prefer acDetails brand+capacity over generic unitType like "Split AC". */
function parseBrand(ticket: Ticket): string {
  const fromAc = parseBrandFromAcDetails(ticket.acDetails || ticket.ac_details)
  if (fromAc) return fromAc

  const meta = parseAcMeta(ticket)
  const joined = formatBrandCapacityLabel(
    typeof meta.brand === 'string' ? meta.brand : '',
    typeof meta.capacity === 'string' ? meta.capacity : '',
  )
  if (joined && !isGenericUnitTypeLabel(joined)) return joined

  const unit = (ticket.unitType || ticket.unit_type || '').trim()
  if (unit && !isGenericUnitTypeLabel(unit)) return unit
  return joined || unit || ''
}

function parseAcMeta(ticket: Ticket): Record<string, unknown> {
  const raw = ticket.acDetails || ticket.ac_details
  if (!raw || typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const first = parsed.find(item => item && typeof item === 'object' && !Array.isArray(item))
      return (first && typeof first === 'object') ? first as Record<string, unknown> : {}
    }
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
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

function getEffectiveScheduleDateKey(ticket: Ticket): string {
  return getFinalDateKey(ticket) || getPreferredDateKey(ticket)
}

/** Schedule date to anchor completion ghost rows and archive sync (active tab date wins when it matches). */
function resolveScheduleCompletionDateKey(ticket: Ticket, activeDateKey?: string): string {
  const active = (activeDateKey || '').split('T')[0].split(' ')[0].trim()
  if (active && (ticketMatchesDateKey(ticket, active) || getPreviousScheduleDates(ticket).includes(active))) {
    return active
  }
  return getEffectiveScheduleDateKey(ticket) || todayDateKey()
}

function stripArchivedRemarkSuffix(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  return trimmed.replace(/\s*Ã‚Â·\s*Archived(?:\s*Ã‚Â·\s*.+)?$/i, '').trim()
}

function getFinalDateKey(ticket: Ticket): string {
  const top = String(
    (ticket as Ticket & { finalDate?: string; final_date?: string }).finalDate
    || (ticket as Ticket & { final_date?: string }).final_date
    || '',
  ).trim()
  if (top) return top.split('T')[0].split(' ')[0].trim()
  const raw = parseAcMeta(ticket).finalDate || (parseAcMeta(ticket) as { final_date?: string }).final_date
  if (!raw) return ''
  return String(raw).split('T')[0].split(' ')[0].trim()
}

function hasFinalScheduleDate(ticket: Ticket): boolean {
  return Boolean(getFinalDateKey(ticket))
}

function shouldShowOnMyTickets(ticket: Ticket): boolean {
  const stat = (ticket.status || '').toUpperCase()
  if (isInstalledWorkflowStatus(stat) || stat === 'CANCELLED') return false
  // Once a finalDate exists the ticket belongs on Schedules, not the negotiator queue.
  if (hasFinalScheduleDate(ticket)) return false
  // SCHEDULED/SURVEY without a finalDate yet just means a pending sub-status was picked
  // (e.g. INSTALL, SURVEY) — it still belongs in the negotiator's queue until a real date is set.
  // IN_PROGRESS/ON_THE_WAY are active field-crew statuses (always date-backed by then); CONTINUATION
  // tracks its own continuationDates array instead of finalDate, so it needs its own exclusion here.
  if (['IN_PROGRESS', 'ON_THE_WAY', 'CONTINUATION'].includes(stat)) return false

  return Boolean(
    ticket.assignedTo
    || ticket.negotiatorId
    || ticket.negotiator_id
    || stat === 'ASSIGNED',
  )
}

function ticketMatchesNegotiatorFilter(
  ticket: Ticket,
  negotiatorId?: string | null,
): boolean {
  const wanted = (negotiatorId || '').trim()
  if (!wanted) return true
  const ids = [
    ticket.negotiatorId,
    ticket.negotiator_id,
    ticket.assignedTo,
  ].map(v => String(v || '').trim()).filter(Boolean)
  return ids.includes(wanted)
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

function getPreviousScheduleDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.previousScheduleDates
  if (!Array.isArray(raw)) return []
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
}

/** Target day after reschedule (preferred / rescheduledTo). */
function getRescheduleTargetDateKey(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const to = String(meta.rescheduledTo || '').split('T')[0].split(' ')[0].trim()
  if (to) return to
  return getPreferredDateKey(ticket) || getEffectiveScheduleDateKey(ticket)
}

function shouldBlankReschedGhostPayment(
  dateKey?: string,
  ghostKind?: 'completed' | 'resched' | 'cancelled' | null,
): boolean {
  if (!dateKey) return false
  if (ghostKind === 'resched') return true
  return isRescheduledGhostOnDate()
}

function getContinuationDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.continuationDates
  if (!Array.isArray(raw)) return []
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
}

function formatSimpleDateShort(dateStr: string): string {
  const dateParts = dateStr.split('-')
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return dateParts.length === 3
    ? `${monthNames[parseInt(dateParts[1], 10) - 1] || ''} ${parseInt(dateParts[2], 10)}`
    : dateStr
}

function getNextContinuationDate(ticket: Ticket, currentDateKey: string): string | null {
  const dates = getContinuationDates(ticket)
  if (dates.length === 0) return null
  const sorted = [...dates].sort()
  const next = sorted.find(d => d > currentDateKey)
  if (next) return next
  return sorted[sorted.length - 1]
}

function isReschedulePending(ticket: Ticket): boolean {
  const meta = parseAcMeta(ticket)
  return meta.reschedulePending === true || String(meta.reschedulePending).toLowerCase() === 'true'
}

export function getScheduleStatusDisplay(ticket: Ticket): string {
  const val = getScheduleStatusValue(ticket)
  if (val === 'RESCHED') {
    return 'RESCHED'
  }
  return getScheduleStatusLabel(val)
}

function getScheduleUpdateDisplay(ticket: Ticket): string {
  const base = sanitizeDisplayText(stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim()))
  if (getScheduleStatusValue(ticket) === 'RESCHED' && isReschedulePending(ticket)) {
    return base || 'PENDING'
  }
  const deduped = dedupeMovedToRemark(base)
  // If the remark is "Moved to [date]" but the ticket is already on that date, suppress it.
  if (isMovedToRescheduleRemark(deduped)) {
    const finalDateKey = getFinalDateKey(ticket)
    if (finalDateKey) {
      const formattedFinalDate = formatDateKeyLabel(finalDateKey)
      // Extract the date portion from "Moved to [DATE]"
      const movedToDate = deduped.replace(/^Moved to\s+/i, '').trim()
      if (formattedFinalDate && movedToDate.toLowerCase() === formattedFinalDate.toLowerCase()) {
        return ''
      }
    }
  }
  return deduped
}

/** Collapse "Moved to X · Moved to X" from legacy ghost-row display or double saves. */
function dedupeMovedToRemark(text: string): string {
  const trimmed = sanitizeDisplayText(text).trim()
  if (!trimmed) return trimmed
  const dup = trimmed.match(/^(Moved to .+?)\s*[·Ã‚Â·]\s*\1$/i)
  if (dup) return dup[1].trim()
  return trimmed
}

function isMovedToRescheduleRemark(text: string): boolean {
  return /^Moved to /i.test(text.trim())
}

/**
 * Builds the patch for the inline "Reschedule appointment" dialog. Moves the ticket's Final Date
 * in place — no ghost/duplicate row is left on the old date (previousScheduleDates/rescheduledTo
 * are no longer written here; see isRescheduledGhostOnDate). "Pending" leaves the date untouched
 * and just flags the ticket as awaiting a new slot.
 */
function buildReschedulePatchBody(
  ticket: Ticket,
  options: { newDateKey?: string | null; pending: boolean },
): Record<string, unknown> {
  const oldDateKey = getEffectiveScheduleDateKey(ticket) || getPreferredDateKey(ticket)
  const body: Record<string, unknown> = { status: 'RESCHED' }
  const acUpdates: Record<string, unknown> = { scheduleOutcome: '' }

  if (options.pending) {
    acUpdates.reschedulePending = true
    const base = (ticket.remarksUpdate || ticket.remarks || '').trim()
    if (!base) {
      body.remarks = 'PENDING'
      body.remarksUpdate = 'PENDING'
      acUpdates.remarksUpdate = 'PENDING'
      acUpdates.update = 'PENDING'
    }
  } else {
    const newDateKey = (options.newDateKey || '').split('T')[0].trim()
    if (!newDateKey) return {}
    acUpdates.reschedulePending = false
    acUpdates.finalDate = newDateKey
    acUpdates.scheduledDate = newDateKey
    body.preferredDate = newDateKey
    body.finalDate = newDateKey
    body.status = 'SCHEDULED'
    if (oldDateKey && oldDateKey !== newDateKey) {
      const formattedNewDate = formatDateKeyLabel(newDateKey)
      const reschedMsg = `Moved to ${formattedNewDate}`
      body.remarks = reschedMsg
      body.remarksUpdate = reschedMsg
      acUpdates.remarksUpdate = reschedMsg
      acUpdates.update = reschedMsg
    }
  }

  body.acDetails = mergeAcMeta(ticket, acUpdates)
  return body
}

/** True when the ticket currently has a schedule date (final or preferred). */
function ticketHadScheduleDate(ticket: Ticket): boolean {
  return Boolean(
    getFinalDateKey(ticket)
    || getPreferredDateKey(ticket)
    || String(parseAcMeta(ticket).scheduledDate || '').trim(),
  )
}

/** Drop schedule dates and move ticket back to negotiator My Tickets (ASSIGNED, no date). */
function applyReturnToNegotiatorMyTicketsPatch(
  ticket: Ticket,
  body: Record<string, unknown>,
  acUpdates: Record<string, unknown>,
): void {
  body.status = 'ASSIGNED'
  body.preferredDate = ''
  body.preferred_date = ''   // snake_case alias
  body.finalDate = ''         // explicitly clear the DB column so row disappears from schedule
  body.scheduleOutcome = ''

  acUpdates.finalDate = ''
  acUpdates.scheduledDate = ''
  acUpdates.scheduleIntake = false
  acUpdates.rescheduledTo = ''
  acUpdates.reschedulePending = false
  acUpdates.previousScheduleDates = []
  acUpdates.scheduleOutcome = ''

  const phase = getScheduleStatusValue(ticket)
  if (['SURVEY', 'CLEANING', 'SERVICES', 'INSTALLATION'].includes(phase)) {
    acUpdates.schedulePhase = phase
  }

  const negoId = ticket.negotiatorId || ticket.negotiator_id || ticket.assignedTo
  if (negoId) body.assignedTo = negoId

  const remarks = String(ticket.remarksUpdate || ticket.remarks || '').trim()
  if (isMovedToRescheduleRemark(remarks) || /^PENDING$/i.test(remarks)) {
    body.remarks = ''
    body.remarksUpdate = ''
    acUpdates.update = ''
    acUpdates.remarksUpdate = ''
  }
}

function ticketMatchesDateKey(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return true
  const isResched = (ticket.status || '').toUpperCase() === 'RESCHED'
  const meta = parseAcMeta(ticket)
  const scheduledDate = String(meta.scheduledDate || '').split('T')[0].split(' ')[0].trim()
  const archived = String(meta.archivedScheduleDate || '').split('T')[0].split(' ')[0].trim()
  const installed = String(meta.installedDate || '').split('T')[0].split(' ')[0].trim()
  const finalDate = !isResched ? getFinalDateKey(ticket) : ''
  const preferred = getPreferredDateKey(ticket)
  // rescheduledTo is legacy-only and no longer written by any reschedule flow — matching on it
  // made a ticket stick forever to whatever old date a stale value happened to carry (the exact
  // "grayed-out, uneditable row still on the old date" bug after a plain finalDate move).
  const dateCandidates = [finalDate, scheduledDate, preferred, archived, installed].filter(Boolean)

  for (const candidate of dateCandidates) {
    if (candidate === dateKey) return true
  }
  return false
}

function isCompletedGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  if (!isInstalledWorkflowStatus(ticket.status)) return false

  // The ticket's own current/real date is never a ghost — only duplicate rows left
  // behind on OLD dates are. Otherwise every completed ticket becomes permanently
  // read-only (no remarks edits) even on the date it actually belongs on.
  const currentKey = getEffectiveScheduleDateKey(ticket) || getInstalledDateKey(ticket) || getArchivedScheduleDate(ticket)
  if (currentKey && currentKey === dateKey) return false

  const sched = getArchivedScheduleDate(ticket)
  if (sched === dateKey) return true
  if (getPreviousScheduleDates(ticket).includes(dateKey)) return true
  if (getInstalledDateKey(ticket) === dateKey) return true
  return false
}

// Resched ghost rows are retired — rescheduling now moves a ticket in place (new date only)
// instead of leaving a muted duplicate behind on its old date. That duplicate-row mechanism
// (driven by rescheduledTo/previousScheduleDates) was the root cause of schedule dates losing
// rows: any staleness in that bookkeeping made rows vanish or duplicate across dates. Stubbed
// to `false` (rather than deleted) so legacy tickets that still carry old rescheduledTo/
// previousScheduleDates values from before this change don't render stale ghosts either, and so
// the handful of downstream call sites (shouldBlankReschedGhostPayment, formatGhostRemarks)
// don't need touching.
function isRescheduledGhostOnDate(): boolean {
  return false
}

function isCancelledTicket(ticket: Partial<Ticket> | null | undefined): boolean {
  return (ticket?.status || '').toUpperCase() === 'CANCELLED'
}

/** Cancelled rows stay on Schedules as a red ghost for their date — never hide them. */
function isCancelledScheduleGhost(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey || !isCancelledTicket(ticket)) return false
  return ticketMatchesDateKey(ticket, dateKey)
    || getEffectiveScheduleDateKey(ticket) === dateKey
    || getPreviousScheduleDates(ticket).includes(dateKey)
}

function getScheduleGhostKind(ticket: Ticket, dateKey: string): 'completed' | 'resched' | 'cancelled' | null {
  if (!dateKey) return null
  if (isCompletedGhostOnDate(ticket, dateKey)) return 'completed'
  // Cancelled tickets keep their one schedule-date row (no duplicate-date bookkeeping like
  // completed/resched ghosts) — just render read-only + muted so staff can still see the
  // cancellation instead of the ticket silently vanishing off Schedules.
  if (isCancelledScheduleGhost(ticket, dateKey)) return 'cancelled'
  return null
}

export function ticketBelongsOnScheduleDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return true
  // A row is on this day if ANY of its schedule dates match: finalDate, scheduledDate,
  // preferredDate, archived/installed. The server date query (ac_details LIKE) can return
  // rows where the day only lives in one of these, so mirror that here — never require finalDate only.
  if (ticketMatchesDateKey(ticket, dateKey)) return true
  if (getEffectiveScheduleDateKey(ticket) === dateKey) return true
  if (isCancelledScheduleGhost(ticket, dateKey)) return true
  if (isScheduleGhostOnDate(ticket, dateKey)) return true
  if ((ticket.status || '').toUpperCase() === 'CONTINUATION' && getContinuationDates(ticket).includes(dateKey)) {
    return true
  }
  return false
}

export function ticketBelongsOnScheduleBranch(
  ticket: Ticket,
  effectiveBranch: string | null | undefined,
  email?: string | null,
  jobTitle?: string | null,
  lineupIndex?: InstallerBranchIndexEntry[],
  driverOnlyNames: string[] = [],
): boolean {
  if (!effectiveBranch || effectiveBranch === 'ALL_BRANCHES') return true
  const wanted = resolveScopedBranchId(effectiveBranch)
  // Prefer lineup-resolved branch (same as My Tickets / Archives) so cancelled rows that
  // still retain their schedule date cannot leak onto another Active Branch view.
  const meta = parseAcMeta(ticket)
  const stored = resolveScopedBranchId(
    resolveTicketScheduleBranchId(ticket, lineupIndex, driverOnlyNames)
    || ticket.branchId
    || ticket.branch_id
    // Legacy cancels used to null branchId on the server — recover from acDetails when present.
    || (typeof meta.cancelledBranchId === 'string' ? meta.cancelledBranchId : '')
    || (typeof meta.branchId === 'string' ? meta.branchId : ''),
  )
  // Missing branch on a specific-branch Schedules view → exclude. (Previously returned true
  // to "trust the server", which let cancelled/date-retained rows with empty branchId, and
  // local merge re-adds, appear under every Active Branch.)
  // Schedules UI filters use isCancelledScheduleGhost separately so red ghosts still show.
  if (!stored) return false
  if (wanted && stored === wanted) return true
  if (branchScopesMatch(stored, effectiveBranch, email)) return true
  if (branchScopesMatch(stored, wanted, email)) return true
  if (isTaguigBranchRef(effectiveBranch) && isTaguigBranchRef(stored)) {
    const wantServices = isTaguigServicesScope(effectiveBranch, email, jobTitle)
      || (wanted ? isTaguigServicesScope(wanted, email, jobTitle) : false)
    return wantServices
      ? stored === 'BR-TAGUIG-SERVICES'
      : stored !== 'BR-TAGUIG-SERVICES'
  }
  return false
}

function isInstalledRemarks(_text?: string | null): boolean {
  return false
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


function qualifiesForInstallComplete(ticket: Partial<Ticket>, fields?: Partial<Ticket>): boolean {
  const remarks = ticketRemarksText(ticket, fields)
  const status = String(fields?.status ?? ticket.status ?? '').toUpperCase()
  const installed = isInstalledRemarks(remarks) || isInstalledWorkflowStatus(status)
  return installed
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
  return isRescheduledGhostOnDate()
    || isCompletedGhostOnDate(ticket, dateKey)
    || getScheduleGhostKind(ticket, dateKey) === 'cancelled'
}

function formatGhostRemarks(
  ticket: Ticket,
  ghostKind: 'completed' | 'resched' | 'cancelled' | null,
  dateKey?: string,
): string {
  const base = sanitizeDisplayText(stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim()))
  if (ghostKind === 'completed' || (dateKey && isCompletedGhostOnDate(ticket, dateKey))) {
    return base
  }
  if (ghostKind === 'resched') {
    const movedTo = formatDateKeyLabel(getRescheduleTargetDateKey(ticket))
    const suffix = movedTo ? `Moved to ${movedTo}` : 'Rescheduled'
    if (!base) return suffix
    const normalizedBase = dedupeMovedToRemark(base)
    if (normalizedBase === suffix || isMovedToRescheduleRemark(normalizedBase)) return normalizedBase
    return `${normalizedBase} \u00B7 ${suffix}`
  }
  return base
}

function buildArchiveAcMeta(ticket: Ticket, scheduleDateKey: string, outcome: ScheduleOutcome | null = 'DONE_INSTALLED') {
  const existing = parseAcMeta(ticket)
  const prevDates: string[] = Array.isArray(existing.previousScheduleDates) ? [...existing.previousScheduleDates] : []
  const sched = (scheduleDateKey || getPreferredDateKey(ticket)).split('T')[0].split(' ')[0].trim()
  if (sched && !prevDates.includes(sched)) prevDates.push(sched)
  return {
    previousScheduleDates: prevDates,
    archivedScheduleDate: sched,
    installedDate: sched,
    scheduleOutcome: outcome || 'DONE_INSTALLED',
  }
}

function parsePaymentFromModeString(raw: string): { mode: string; amount?: number } {
  const v = (raw || '').trim()
  if (!v) return { mode: '' }
  const amountMatch = v.match(/(\d[\d,]*(?:\.\d+)?)\s*$/u)
  if (amountMatch) {
    const amount = parseImportMoney(amountMatch[1])
    const modePart = v.slice(0, amountMatch.index).trim()
    const mode = normalizeImportPaymentMode(modePart) || modePart.toUpperCase()
    return { mode, amount: amount && amount > 0 ? amount : undefined }
  }
  return { mode: normalizeImportPaymentMode(v) || v.toUpperCase() }
}

function resolveTicketPaymentAmount(ticket: Ticket): number | undefined {
  const meta = parseAcMeta(ticket)
  const candidates: unknown[] = [
    ticket.installationCharges,
    ticket.installation_charges,
    ticket.amountCharged,
    meta.installationCharges,
    meta.installation_charges,
    meta.amountCharged,
    meta.charges,
  ]
  for (const raw of candidates) {
    const parsed = parseImportMoney(raw as string | number | null | undefined)
    if (parsed != null && parsed > 0) return parsed
  }
  return undefined
}

function resolveTicketPaymentModeRaw(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const ext = ticket as Ticket & { paymentStatus?: string; paymentMode?: string }
  const raw = (
    getF(ticket, 'modeOfPayment', 'mode_of_payment')
    || String(ext.paymentStatus || ext.paymentMode || meta.modeOfPayment || meta.paymentStatus || meta.paymentMode || '').trim()
  )
  return sanitizeDisplayText(raw)
}

function resolveTicketPayment(ticket: Ticket): { mode: string; amount?: number } {
  let mode = resolveTicketPaymentModeRaw(ticket)
  let amount = resolveTicketPaymentAmount(ticket)

  if (isNoPaymentMode(mode)) {
    return { mode: '', amount: undefined }
  }

  if ((!amount || amount <= 0) && mode) {
    const parsed = parsePaymentFromModeString(mode)
    if (parsed.amount) amount = parsed.amount
    if (parsed.mode) mode = parsed.mode
  } else if (mode) {
    mode = normalizeImportPaymentMode(mode) || mode.toUpperCase()
  }

  if (mode === 'FREE' || mode === 'FREE INSTALL') {
    return { mode: 'FREE', amount: undefined }
  }

  return {
    mode: (mode || '').trim().toUpperCase(),
    amount: amount && amount > 0 ? amount : undefined,
  }
}

function formatPaymentAmount(ticket: Ticket): string {
  const amount = resolveTicketPayment(ticket).amount
  if (amount == null) return ''
  return amount.toLocaleString('en-PH')
}

function getSchedulePaymentDisplay(
  ticket: Ticket,
  dateKey?: string,
  ghostKind?: 'completed' | 'resched' | 'cancelled' | null,
): string {
  if (shouldBlankReschedGhostPayment(dateKey, ghostKind)) return ''
  const resolved = resolveTicketPayment(ticket)
  if (resolved.mode === 'FREE' || resolved.mode === 'FREE INSTALL') return 'FREE'

  const mode = resolved.mode || (() => {
    const ext = ticket as Ticket & { paymentStatus?: string; paymentMode?: string }
    const modeRaw = (
      ticket.modeOfPayment
      ?? ticket.mode_of_payment
      ?? ext.paymentStatus
      ?? ext.paymentMode
      ?? ''
    ).trim()
    return normalizeImportPaymentMode(modeRaw) || modeRaw.toUpperCase()
  })()

  const amount = resolved.amount ?? parseImportMoney(
    ticket.installationCharges ?? ticket.installation_charges ?? ticket.amountCharged,
  )
  const amountStr = amount != null && amount > 0
    ? Math.round(amount).toLocaleString('en-PH')
    : ''
  const breakdownStr = mode === 'HYBRID' ? formatPaymentBreakdownText(getPaymentBreakdown(ticket)) : ''

  if (mode && amountStr) return breakdownStr ? `${amountStr} ${mode} ${breakdownStr}` : `${amountStr} ${mode}`
  if (mode) return mode
  if (amountStr) return amountStr
  return ''
}

function formatCombinedPayment(ticket: Ticket): string {
  const { mode, amount } = resolveTicketPayment(ticket)
  if (mode === 'FREE' || mode === 'FREE INSTALL') return 'FREE'
  const amountStr = amount != null ? amount.toLocaleString('en-PH') : ''
  if (mode && amountStr) return `${mode} ${amountStr}`
  if (mode) return mode
  if (amountStr) return amountStr
  return ''
}

function getPaymentMode(ticket: Ticket): string {
  return resolveTicketPayment(ticket).mode
}

type PaymentBreakdownEntry = { mode: string; amount: number }

/** Split payment lines (e.g. CASH 1,000 + GCASH 9,000) stashed in acDetails when mode is HYBRID. */
function getPaymentBreakdown(ticket: Ticket): PaymentBreakdownEntry[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.paymentBreakdown
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry): PaymentBreakdownEntry | null => {
      if (!entry || typeof entry !== 'object') return null
      const mode = sanitizeDisplayText(String((entry as Record<string, unknown>).mode || '')).toUpperCase()
      const amount = parseImportMoney((entry as Record<string, unknown>).amount as string | number | null | undefined)
      if (!mode || amount == null || amount <= 0) return null
      return { mode, amount }
    })
    .filter((entry): entry is PaymentBreakdownEntry => entry != null)
}

function formatPaymentBreakdownText(breakdown: PaymentBreakdownEntry[]): string {
  if (!breakdown.length) return ''
  return `(${breakdown.map(e => `${e.mode} ${Math.round(e.amount).toLocaleString('en-PH')}`).join(' + ')})`
}

function isNoPaymentMode(mode?: string | null): boolean {
  const v = String(mode || '').trim().toUpperCase().replace(/\s+/g, '_')
  return v === 'NO_PAYMENT' || v === 'NONE' || v === 'NO'
}

function ticketHasPaymentInfo(ticket: Partial<Ticket>): boolean {
  const mode = (ticket.modeOfPayment ?? ticket.mode_of_payment ?? '').trim()
  if (isNoPaymentMode(mode)) return false
  const charges = ticket.installationCharges ?? ticket.installation_charges
  return Boolean(mode || (charges != null && !Number.isNaN(Number(charges)) && Number(charges) > 0))
}

function getEmptyRequiredColumnsForClose(
  ticketOrForm: Partial<Ticket> & { serviceDriver?: string; ticketCategory?: any },
): string[] {
  const missing: string[] = []

  // 1. Ticket No
  const ticketNo = (ticketOrForm.ticketNumber || (ticketOrForm as any).ticket_number || '').trim()
  if (!ticketNo) missing.push('Ticket No')

  // 2. Customer
  const customer = (ticketOrForm.customerName || (ticketOrForm as any).customer_name || ticketOrForm.title || '').trim()
  if (!customer) missing.push('Customer')

  // 3. District
  const district = (ticketOrForm.district || ticketOrForm.location || '').trim()
  if (!district) missing.push('District')

  // 4. Brand
  const brand = (
    ticketOrForm.id
      ? parseBrand(ticketOrForm as Ticket)
      : (ticketOrForm.unitType || (ticketOrForm as any).unit_type || '')
  ).trim()
  if (!brand) missing.push('Brand')

  // 5. Dealer
  const dealer = ((ticketOrForm as any).dealer || ticketOrForm.sourceVendor || (ticketOrForm as any).source_vendor || (ticketOrForm as any).dealerName || (ticketOrForm as any).dealer_name || '').trim()
  if (!dealer) missing.push('Dealer')

  // 6. Commit
  const commit = (
    ticketOrForm.id
      ? getF(ticketOrForm as Ticket, 'commitType', 'commitTerms', 'description')
      : (ticketOrForm.commitTerms || ticketOrForm.commitType || ticketOrForm.description || '')
  ).trim()
  if (!commit) missing.push('Commit')

  // 7. Negotiator
  const negotiator = (ticketOrForm.negotiatorId || (ticketOrForm as any).negotiator_id || (ticketOrForm as any).assignedTo || '').trim()
  if (!negotiator) missing.push('Negotiator')

  // 8. Installer — check the raw stored/typed value, not getInstallerDisplay(): that helper
  // also suppresses names that match the negotiator (a display de-dup for stale legacy data)
  // and would wrongly report "empty" for a real installer who is also this ticket's negotiator.
  const installer = (
    ticketOrForm.id
      ? resolveInstallerFieldRaw(ticketOrForm as Ticket)
      : (ticketOrForm.installerName || '')
  ).trim()
  if (!installer) missing.push('Installer')

  // 9. Driver
  const driver = (
    ticketOrForm.id
      ? formatServiceDriver(ticketOrForm as Ticket)
      : (ticketOrForm.serviceDriver || '')
  ).trim()
  if (!driver) missing.push('Driver')

  return missing
}

function formatDateKeyLabel(key: string) {
  if (!key) return ''
  const datePart = key.split('T')[0].split(' ')[0].trim()
  if (!datePart) return ''
  const d = new Date(`${datePart}T00:00:00`)
  if (isNaN(d.getTime())) return key
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  return `${month} ${day} ${year}`
}

function formatDisplayDate(key?: string | null, fallback = EMPTY_CELL): string {
  const normalized = (key || '').split('T')[0].split(' ')[0].trim()
  if (!normalized) return fallback
  const label = formatDateKeyLabel(normalized)
  return label || fallback
}

function getCustomerDisplayName(ticket: Ticket): string {
  return (getF(ticket, 'customerName', 'customer_name') || ticket.title || '').trim()
}

function normalizeCustomerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function importPhonesMatch(a: string, b: string): boolean {
  const da = (a || '').replace(/\D/g, '')
  const db = (b || '').replace(/\D/g, '')
  if (da.length < 10 || db.length < 10) return false
  const ta = da.length >= 10 ? da.slice(-10) : da
  const tb = db.length >= 10 ? db.slice(-10) : db
  return ta === tb
}

function importNamesMatch(a: string, b: string): boolean {
  const na = (a || '').toLowerCase().trim()
  const nb = (b || '').toLowerCase().trim()
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function importBrandsMatch(rowBrand: string, ticket: Ticket): boolean {
  const rb = (rowBrand || '').trim().toLowerCase()
  const tb = parseBrand(ticket).trim().toLowerCase()
  if (!rb && !tb) return true
  if (!rb || !tb) return false
  return rb === tb || tb.includes(rb) || rb.includes(tb)
}

/** Match import row to ticket Ã¢â‚¬â€ same customer + phone may have multiple units (different brand). */
function importRowMatchesTicket(row: ImportUnmatchedRow, ticket: Ticket): boolean {
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

function parseImportMoney(raw?: string | number | null): number | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  const text = String(raw).trim()
  if (!text) return undefined
  const numeric = parseFloat(text.replace(/[\u20B1phpPHP,\s]/gi, ''))
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

function resolveNegotiatorDisplayName(
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

function namesMatchLoosely(a: string, b: string): boolean {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const fa = na.split(/\s+/)[0]
  const fb = nb.split(/\s+/)[0]
  return fa.length >= 2 && fb.length >= 2 && fa === fb
}

/** Exact (whitespace/case-normalized) match only — deliberately not `namesMatchLoosely`'s
 * substring/first-name fuzz, which false-positives whenever an installer and negotiator
 * happen to share a first name or one name contains the other (e.g. small-branch staff who
 * both negotiate and install). Used where a false match would wrongly blank a real field. */
function namesMatchExactly(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\s+/g, ' ')
  const nb = b.trim().toLowerCase().replace(/\s+/g, ' ')
  return !!na && na === nb
}

function isTicketAssigneeNegotiator(
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

/** True when a name is an exact match for this ticket's own negotiator (stale-data guard only —
 * a real installer who happens to share a name with staff elsewhere must not be suppressed). */
function isNegotiatorInstallerName(
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

  // Branch-wide negotiator fallback intentionally omitted: `filterBranchNegotiators` falls
  // back to the whole company's staff list when no negotiator matches the branch, which
  // would make an exact-match check here fire on unrelated same-named staff elsewhere.
  // Matching this ticket's own negotiator (above) is enough to catch the stale-data case
  // this function exists for.

  return false
}

function resolveInstallerFieldRaw(ticket: Ticket): string {
  const direct = sanitizeDisplayText(ticket.installerName || (ticket as any).installer_name || '')
  const meta = parseAcMeta(ticket)
  const fromMeta = sanitizeDisplayText(String(meta.installerName || meta.installer || meta.technicianName || ''))
  return direct || fromMeta
}

/** Explicit installer/technician field only Ã¢â‚¬â€ never negotiator or assigned sales staff. */
export function getInstallerDisplay(
  ticket: Ticket,
  _employees?: BranchStaffOption[],
  _branchId?: string | null,
): string {
  return resolveInstallerFieldRaw(ticket)
}

/** Sort key Ã¢â‚¬â€ may fall back to assigned field tech when installer column is empty. */
function getInstallerSortKey(
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

function formatRelayTicketTypeShort(ticket: Ticket): string {
  // schedulePhase is the authoritative signal for CHECKUP/BACKJOB — the generic serviceType/
  // title text (e.g. "Service service") that a saved schedule status leaves behind can't tell
  // CHECKUP/BACKJOB apart from plain SERVICE, and worse, a stale pre-patch title still
  // containing "Install" would wrongly win the regex checks below. Check it first.
  const phase = String(parseAcMeta(ticket).schedulePhase || '').toUpperCase().replace(/\s+/g, '_')
  if (phase === 'CHECKUP') return 'CHECKUP'
  if (phase === 'BACKJOB') return 'BACKJOB'

  const raw = `${ticket.serviceType || ticket.service_type || ''} ${ticket.title || ''}`.toLowerCase()
  if (/collect/.test(raw)) return 'COLLECTION'
  if (/install|s\/i|\bsi\b|survey\s*&\s*install/.test(raw)) return 'SURVEY & INSTALL'
  if (/survey/.test(raw)) return 'SURVEY'
  if (/service|clean/.test(raw)) return 'SERVICE'
  const st = String(ticket.serviceType || ticket.service_type || '').trim()
  if (st) return /install|s\/i/i.test(st) ? 'SURVEY & INSTALL' : st.toUpperCase()
  return 'SURVEY & INSTALL'
}

function getTicketNumberDisplay(ticket: Ticket): string {
  return String(ticket.ticketNumber || ticket.ticket_number || '').trim()
}

/** Optimistic rows not yet persisted (manual add or Excel import). */
function isTempTicketId(id: string | undefined | null): boolean {
  if (!id) return false
  return id.startsWith('temp-import-') || id.startsWith('temp-')
}

type PendingTicketSave = {
  body: Record<string, unknown>
  rollback: Ticket
  afterSave?: () => Promise<void>
  lookupRetried?: boolean
}

/**
 * Move optimistic/pending state from a temp id to the real server ticket.
 * Pending cell edits are kept queued so they PATCH the real id, not temp-*.
 */
function promoteTempTicketState(
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

function isTicketNotFoundError(err: unknown): boolean {
  return /ticket not found/i.test(formatFetchError(err))
}

async function fetchTicketById(authToken: string, ticketId: string): Promise<Ticket | null> {
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

async function lookupTicketByNumberOnServer(
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

function findTicketInListByRef(
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

function computeSafePopoverPosition(
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

function applyImportFieldsFromRow(
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

function normalizeDriverToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '_').replace(/\//g, '_')
}

/** Tokens that belong in serviceType / schedule status Ã¢â‚¬â€ not driver names. */
function isDriverPlaceholderToken(raw: string): boolean {
  const val = (raw || '').trim()
  if (!val) return true
  const norm = normalizeDriverToken(val)
  const upper = val.toUpperCase()
  if (/^S[\/_]?I(\s|$|[-Ã‚Â·Ã¢â‚¬Â¢])/i.test(val)) return true
  if (/^SURVEY(\s|&|$|[-Ã‚Â·Ã¢â‚¬Â¢])/i.test(val)) return true
  if (/^SERVICE(\s|&|$|[-Ã‚Â·Ã¢â‚¬Â¢])/i.test(val)) return true
  if (/^INSTALL(\s|&|$|[-Ã‚Â·Ã¢â‚¬Â¢])/i.test(val)) return true
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

function normalizeDriverInput(raw: string): string {
  const trimmed = (raw || '').trim()
  if (!trimmed || isDriverPlaceholderToken(trimmed)) return ''
  return trimmed
}

function getTicketDriverName(ticket: Ticket): string {
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

function formatServiceDriver(ticket: Ticket): string {
  return getTicketDriverName(ticket)
}

/** Driver name — driverName column only, never guessed from serviceVehicle. Blank means "+ Add". */
export function getTicketDriverDisplay(ticket: Ticket): string {
  const direct = sanitizeDisplayText(getF(ticket, 'driverName', 'driver_name'))
  return direct && !isDriverPlaceholderToken(direct) ? direct : ''
}

/** Vehicle code — serviceVehicle column only, never guessed/split from driverName. Blank means "+ Add". */
export function getTicketVehicleDisplay(ticket: Ticket): string {
  return sanitizeDisplayText(getF(ticket, 'serviceVehicle', 'service_vehicle'))
}

/** Parse "ALLAN - 3" / "MANNY / ROMAR - 2" / "MANNY / ROMAR" into crew name + site for grouping. */
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

/** Vehicle name + red trip # — shrinks the name font to fit the cell; trip # stays readable. */
function VehicleTripLabel({
  name,
  tripNumber,
  nameColor,
  tripColor,
  opacity,
  title,
  canDrag,
  onDragStart,
  onDragEnd,
}: {
  name: string
  tripNumber: string
  nameColor: string
  tripColor: string
  opacity?: number
  title?: string
  canDrag?: boolean
  onDragStart?: (e: DragEvent<HTMLSpanElement>) => void
  onDragEnd?: (e: DragEvent<HTMLSpanElement>) => void
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const tripRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const nameEl = nameRef.current
    if (!wrap || !nameEl || !name) return

    const MIN_PX = 6
    const TRIP_MIN_PX = 9
    const fit = () => {
      // Prefer the cell's fixed width — without a hard cap the wrap grows with content
      // and scrollWidth === clientWidth, so the shrink loop never runs.
      const parent = wrap.parentElement
      const available = Math.max(
        0,
        (parent?.clientWidth && parent.clientWidth > 0 ? parent.clientWidth : wrap.clientWidth) - 2,
      )
      if (available <= 0) return

      wrap.style.width = '100%'
      wrap.style.maxWidth = `${available}px`

      const base = parseFloat(getComputedStyle(wrap).fontSize) || 12.5
      let lo = MIN_PX
      let hi = base
      let best = MIN_PX

      nameEl.style.overflow = 'visible'
      nameEl.style.textOverflow = 'clip'
      nameEl.style.maxWidth = 'none'

      const overflows = (size: number) => {
        nameEl.style.fontSize = `${size}px`
        if (tripRef.current) tripRef.current.style.fontSize = `${Math.max(size, TRIP_MIN_PX)}px`
        // Include the flex gap between name and red counter in the fit check
        return wrap.scrollWidth > available + 0.5
      }

      // Start a bit smaller than the cell's base font so long names don't look packed
      hi = Math.min(base, 11.5)

      // Binary search the largest name font that still fits the cell
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        if (!overflows(mid)) {
          best = mid
          lo = mid
        } else {
          hi = mid
        }
      }

      nameEl.style.fontSize = `${best}px`
      if (tripRef.current) tripRef.current.style.fontSize = `${Math.max(best, TRIP_MIN_PX)}px`

      // Still overflowing at minimum — ellipsis the name only; never clip the red trip #
      if (wrap.scrollWidth > available + 0.5) {
        const tripW = tripRef.current?.offsetWidth ?? 0
        const gap = tripNumber ? 10 : 0
        nameEl.style.maxWidth = `${Math.max(12, available - tripW - gap)}px`
        nameEl.style.overflow = 'hidden'
        nameEl.style.textOverflow = 'ellipsis'
      }
    }

    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    if (wrap.parentElement) ro.observe(wrap.parentElement)
    return () => ro.disconnect()
  }, [name, tripNumber])

  return (
    <span
      ref={wrapRef}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="flex w-full min-w-0 max-w-full items-center justify-center font-bold uppercase leading-tight rounded whitespace-nowrap overflow-hidden"
      style={{
        color: nameColor,
        opacity,
        cursor: canDrag ? 'grab' : undefined,
        gap: 8,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        letterSpacing: '0.01em',
      }}
      title={title}
    >
      <span
        ref={nameRef}
        className="min-w-0 shrink"
        style={{ whiteSpace: 'nowrap' }}
      >
        {name}
      </span>
      {tripNumber ? (
        <span
          ref={tripRef}
          className="shrink-0"
          style={{ color: tripColor, paddingLeft: 2 }}
        >
          {tripNumber}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Auto-computed vehicle trip label ("STRADA - 2") for Schedules ordering. The vehicle (not the
 * driver) is the dispatch unit, so rows group by vehicle and are numbered by trip automatically —
 * staff type a plain vehicle name ("STRADA"), no manual "- 1"/"- 2" suffix needed. Legacy tickets
 * that already carry an explicit "- N" suffix in the Vehicle field keep that number as a pin;
 * auto-numbered trips continue the sequence after the highest pinned number in the group.
 */
function buildVehicleTripLabels(ticketsList: Ticket[]): Map<string, string> {
  type Entry = { ticket: Ticket; explicitSite: number | null }
  const groups = new Map<string, Entry[]>()
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
    let nextAuto = entries.reduce((m, e) => (e.explicitSite != null ? Math.max(m, e.explicitSite) : m), 0)
    const autoOrdered = entries
      .filter(e => e.explicitSite == null)
      .sort((a, b) => {
        const at = a.ticket.createdAt || a.ticket.created_at || ''
        const bt = b.ticket.createdAt || b.ticket.created_at || ''
        if (at && bt && at !== bt) return at.localeCompare(bt)
        const an = a.ticket.ticketNumber || a.ticket.ticket_number || a.ticket.id || ''
        const bn = b.ticket.ticketNumber || b.ticket.ticket_number || b.ticket.id || ''
        return an.localeCompare(bn, undefined, { numeric: true })
      })
    for (const e of autoOrdered) {
      nextAuto += 1
      labels.set(e.ticket.id, `${base} - ${nextAuto}`)
    }
    for (const e of entries) {
      if (e.explicitSite != null) labels.set(e.ticket.id, `${base} - ${e.explicitSite}`)
    }
  }
  return labels
}

function ticketColumnText(
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
    case 'COMMIT': return getF(ticket, 'commitType', 'commitTerms', 'description')
    case 'FINAL DATE': return getFinalDateKey(ticket)
    case 'INSTALLER': return getInstallerSortKey(ticket, employees, branchId)
    case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, employees)
    case 'SERVICE': return myTickets ? formatRelayTicketTypeShort(ticket) : getTicketDriverDisplay(ticket)
    case 'VEHICLE': return myTickets ? '' : (options?.vehicleTripLabels?.get(ticket.id || '') || getTicketVehicleDisplay(ticket))
    case 'UPDATE': return getScheduleUpdateDisplay(ticket)
    default: return ''
  }
}

function compareTicketsByColumn(
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

// VEHICLE is deliberately excluded — double-click there selects the cell (green highlight) for
// arrow-key reordering instead of opening the text editor.
const INLINE_EDIT_COLUMNS = new Set([
  'INSTALLER', 'NEGOTIATOR', 'COMMIT', 'BRAND', 'DLR', "CUSTOMER'S NAME",
  'FINAL DATE', 'SERVICE', 'UPDATE', 'DESTINATION', 'NOTE',
])
const DEFAULT_MY_TICKETS_SORT = { column: 'FINAL DATE', direction: 'asc' as const }
const DEFAULT_SCHEDULE_SORT = { column: 'VEHICLE', direction: 'asc' as const }

function defaultSortForSchedulesView(isMyTickets: boolean) {
  return isMyTickets ? DEFAULT_MY_TICKETS_SORT : DEFAULT_SCHEDULE_SORT
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
    case 'PENDING': return { text: '#FB923C', bg: light ? '#fff7ed' : 'rgba(251,146,60,0.13)', b: 'rgba(251,146,60,0.4)' }
    case 'ASSIGNED': return { text: '#3B82F6', bg: light ? '#eff6ff' : 'rgba(59,130,246,0.13)', b: 'rgba(59,130,246,0.4)' }
    case 'ON_THE_WAY': return { text: '#06B6D4', bg: light ? '#ecfeff' : 'rgba(6,182,212,0.13)', b: 'rgba(6,182,212,0.4)' }
    case 'IN_PROGRESS': return { text: '#10B981', bg: light ? '#f0fdf4' : 'rgba(16,185,129,0.13)', b: 'rgba(16,185,129,0.4)' }
    case 'CANCELLED': return { text: '#EF4444', bg: light ? '#fef2f2' : 'rgba(239,68,68,0.10)', b: 'rgba(239,68,68,0.35)' }
    case 'CONTINUATION': return { text: '#7C3AED', bg: light ? '#F3E8FF' : 'rgba(124,58,237,0.18)', b: 'rgba(124,58,237,0.35)' }
    case 'SYSTEM_REPROCESS':
    case 'DONE_SYSTEM_REPROCESS':
      return { text: '#6366F1', bg: light ? '#eef2ff' : 'rgba(99,102,241,0.15)', b: 'rgba(99,102,241,0.4)' }
    case 'DISMANTLE':
    case 'DONE_DISMANTLE':
      return { text: '#F43F5E', bg: light ? '#fff1f2' : 'rgba(244,63,94,0.15)', b: 'rgba(244,63,94,0.4)' }
    default: return { text: '#94A3B8', bg: 'transparent', b: 'rgba(148,163,184,0.3)' }
  }
}

function fmtPhone(raw: string): string {
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

function getBranchDisplayName(id: string | null): string {
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

/** Format negotiator for dropdown: FIRSTNAME (BRANCH_SHORT), e.g. BEVERLYN (RIZAL) */
function formatNegotiatorLabel(emp: { name?: string | null; branchId?: string | null }): string {
  const fullName = (emp.name || '').trim()
  const firstName = fullName.split(/\s+/)[0].toUpperCase()
  const branch = getBranchDisplayName(emp.branchId || null)
  return branch ? `${firstName} (${branch})` : firstName
}

function todayDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentWeekMondayDateKey() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SCHEDULES_ACTIVE_DATE_KEY = 'ashcol-schedules-active-date'

function resolveInitialScheduleDate(pathname: string): string {
  if (pathname === '/my-tickets') return ''
  try {
    const persisted = sessionStorage.getItem(SCHEDULES_ACTIVE_DATE_KEY)
    if (persisted && /^\d{4}-\d{2}-\d{2}$/.test(persisted)) return persisted
  } catch {
    // ignore
  }
  return todayDateKey()
}


function formatDateToKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}



function isUnmatchedImportComplete(item: ImportUnmatchedRow): boolean {
  return Boolean(
    (item.status && item.status.toUpperCase() === 'COMPLETED') ||
    (item.update && item.update.toLowerCase().includes('installed'))
  )
}

function buildImportCreateRow(
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

function toApiDateTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function enrichCompletePatchBody(
  body: Record<string, unknown>,
  ticket: Ticket,
  scheduleDateKey: string,
): Record<string, unknown> {
  const schedKey = resolveScheduleCompletionDateKey(ticket, scheduleDateKey)
  const baseAc = typeof body.acDetails === 'string' ? body.acDetails : ticket.acDetails
  const merged = { ...ticket, ...body, acDetails: baseAc } as Ticket
  const outcome = getScheduleOutcome(merged) || 'DONE_INSTALLED'
  const remarksUpdate = typeof body.remarksUpdate === 'string'
    ? stripArchivedRemarkSuffix(body.remarksUpdate)
    : undefined
  return {
    ...body,
    ...(remarksUpdate !== undefined ? { remarksUpdate, remarks: remarksUpdate } : {}),
    status: 'COMPLETED',
    scheduleOutcome: outcome,
    actualCompletion: toApiDateTime(),
    acDetails: mergeAcMeta(
      { ...ticket, acDetails: baseAc } as Ticket,
      {
        ...buildArchiveAcMeta(ticket, schedKey, outcome),
        ...(remarksUpdate ? { update: remarksUpdate, remarksUpdate } : {}),
      },
    ),
  }
}

function wantsTicketArchive(ticket: Partial<Ticket>, fields?: Partial<Ticket>): boolean {
  const status = String(fields?.status ?? ticket.status ?? '').toUpperCase()
  if (status === 'COMPLETED') return true
  return qualifiesForInstallComplete(ticket, fields)
}

function resolveNegotiatorName(
  ticket: Ticket,
  employees: { id: string; name: string }[],
  negotiatorId?: string,
): string {
  if (negotiatorId === '') return ''
  const id = (negotiatorId ?? ticket.negotiatorId ?? ticket.negotiator_id ?? '').trim()
  if (id) {
    const match = employees.find(e => e.id === id)
    if (match?.name) return match.name.trim()
  }
  const meta = parseAcMeta(ticket)
  return String(meta.negotiatorName || meta.negotiator || '').trim()
}

function buildArchiveServiceReportPayload(
  ticket: Ticket,
  branchId: string,
  fields: {
    customerName?: string
    location?: string
    contactPhone?: string
    district?: string
    commitType?: string
    dealer?: string
    unitType?: string
    installerName?: string
    serviceVehicle?: string
    installationCharges?: number
    modeOfPayment?: string
    remarks?: string
    remarksUpdate?: string
    controlNumber?: string
    ticketNumber?: string
    note?: string
    negotiatorName?: string
    serviceType?: string
    unitSerial?: string
    quantity?: number
    scheduleStatus?: string
    complainRequest?: string
  } = {},
  scheduleDateKey?: string,
): Record<string, unknown> | null {
  if (!branchId) return null
  const merged = { ...ticket, ...fields } as Ticket
  const meta = parseAcMeta(merged)
  const scheduleKey =
    scheduleDateKey ||
    getArchivedScheduleDate(merged) ||
    getEffectiveScheduleDateKey(merged) ||
    todayDateKey()
  const installedKey =
    String(meta.installedDate || '').split('T')[0].split(' ')[0].trim() ||
    scheduleKey ||
    todayDateKey()
  const mode = String(
    fields.modeOfPayment ?? ticket.modeOfPayment ?? ticket.mode_of_payment ?? 'CASH',
  ).toUpperCase()
  const charges =
    fields.installationCharges ??
    ticket.installationCharges ??
    ticket.installation_charges ??
    ticket.amountCharged ??
    0
  const remarks =
    fields.remarksUpdate ??
    fields.remarks ??
    ticket.remarksUpdate ??
    ticket.remarks ??
    'Installed'
  const commitTerms =
    fields.commitType ??
    getF(merged, 'commitType', 'commitTerms', 'description') ??
    merged.description ??
    ''
  const freeInstall =
    mode === 'FREE INSTALL' ||
    mode === 'FREE' ||
    /FREE/i.test(commitTerms)
  const serviceType =
    fields.serviceType ??
    (freeInstall ? 'FREE_INSTALLATION' : 'INSTALLATION')
  const negotiator =
    (fields.negotiatorName || '').trim() ||
    String(meta.negotiatorName || meta.negotiator || '').trim() ||
    String((merged as Ticket & { negotiatorName?: string }).negotiatorName || '').trim() ||
    ''
  const controlNo =
    fields.controlNumber ??
    ticket.controlNumber ??
    ticket.control_number ??
    ''
  const unitSerial =
    fields.unitSerial ??
    (String(meta.serialNumber || meta.unitSerial || meta.si || '').trim() || '')
  const quantity =
    fields.quantity ??
    (typeof meta.quantity === 'number' ? meta.quantity : parseInt(String(meta.quantity || ''), 10) || 1)

  return {
    branchId,
    ticketId: ticket.id,
    reportDate: installedKey,
    scheduledDate: scheduleKey,
    installedDate: installedKey,
    customerName: (fields.customerName ?? getF(ticket, 'customerName', 'customer_name') ?? ticket.title ?? '').trim(),
    customerAddress: formatAddress(fields.location ?? ticket.location),
    customerPhone: fields.contactPhone ?? getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
    district: fields.district ?? parseDistrict(ticket.location, ticket.district),
    serviceType,
    statusCode: 'I',
    commitTerms,
    dealer: fields.dealer ?? getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') ?? '',
    unitBrandModel: fields.unitType ?? parseBrand(ticket),
    unitSerial: unitSerial || undefined,
    quantity: quantity > 0 ? quantity : 1,
    technicianName: fields.installerName ?? getInstallerDisplay(ticket),
    negotiator: negotiator || undefined,
    serviceColumn: formatServiceDriver({
      ...ticket,
      serviceVehicle: fields.serviceVehicle ?? ticket.serviceVehicle ?? ticket.service_vehicle,
      serviceType: ticket.serviceType ?? ticket.service_type,
    }),
    amountCharged: parseFloat(String(charges)) || 0,
    paymentStatus: mode,
    jobStatus: 'COMPLETED',
    remarks,
    note: fields.note ?? ticket.note ?? '',
    controlNumber: controlNo || undefined,
    scheduleStatus: fields.scheduleStatus ?? String(meta.scheduleStatus || 'COMPLETED'),
    complainRequest: fields.complainRequest ?? (String(meta.complainRequest || meta.complain || '').trim() || undefined),
    freeInstallation: freeInstall,
  }
}

async function postArchiveServiceReport(
  payload: Record<string, unknown>,
  tokenVal: string,
): Promise<void> {
  const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
    body: JSON.stringify(payload),
  })
  if (!reportRes.ok) throw new Error(await readApiError(reportRes))
  notifyArchiveUpdated()
}

function getCellRawValue(
  ticket: Ticket,
  colLabel: string,
  myTickets = false,
  employees?: BranchStaffOption[],
  branchId?: string | null,
): string {
  switch (colLabel) {
    case 'TICKET NO': return getTicketNumberDisplay(ticket)
    case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title || ''
    case 'DESTINATION': return formatAddress(ticket.location)
    case 'BRAND': return parseBrand(ticket)
    case 'DLR': return getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || ''
    case 'STATUS': return getScheduleStatusValue(ticket)
    case 'COMMIT': return getF(ticket, 'commitType', 'commitTerms', 'description')
    case 'FINAL DATE': return getFinalDateKey(ticket)
    case 'INSTALLER': return getInstallerDisplay(ticket, employees, branchId)
    case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, employees)
    case 'SERVICE': return myTickets ? formatRelayTicketTypeShort(ticket) : getTicketDriverDisplay(ticket)
    case 'VEHICLE': return myTickets ? '' : getTicketVehicleDisplay(ticket)
    case 'UPDATE': return getScheduleUpdateDisplay(ticket)
    default: return ''
  }
}

function buildCellPatchBody(
  ticket: Ticket,
  colLabel: string,
  rawValue: string,
  employees: BranchStaffOption[] = [],
): Record<string, unknown> {
  const v = rawValue.trim()
  const body: Record<string, unknown> = {}
  let acBase: Ticket = ticket

  switch (colLabel) {
    case "CUSTOMER'S NAME":
      if (v) {
        body.customerName = v.toUpperCase()
        const st = getF(ticket, 'serviceType', 'service_type') || 'S/I'
        body.title = `${st} service`
      }
      break
    case 'DESTINATION':
      if (v) {
        body.location = v.toUpperCase()
        body.acDetails = mergeAcMeta(acBase, { destination: v.toUpperCase(), address: v.toUpperCase() })
      }
      break
    case 'BRAND':
      body.unitType = v || undefined
      body.acDetails = mergeAcMeta(acBase, { brand: v, unitType: v })
      break
    case 'DLR':
      body.dealer = v || undefined
      body.acDetails = mergeAcMeta(acBase, { dealer: v, dlr: v })
      break
    case 'STATUS': {
      const patch = applyScheduleStatusPatch(ticket, v)
      Object.assign(body, patch)
      break
    }
    case 'COMMIT':
      body.commitType = v || undefined
      break
    case 'INSTALLER':
      body.installerName = v
      body.acDetails = mergeAcMeta(acBase, { installerName: v, installer: v, technicianName: v })
      break
    // SERVICE (driver) and VEHICLE are separate cells with their own dedicated inputs — each
    // edit writes ONLY the field the user actually typed into, full stop. An earlier version also
    // tried a "one-time migration" here (if driverName was empty, re-derive the OTHER field from
    // whatever combined text sat in serviceVehicle using getServiceVehicleParts). That's just as
    // unsafe as splitting the freshly-typed input: getServiceVehicleParts happily "splits" plain
    // text like "TAMARAW JV1" or "FB4 SEDRICK2" into a fake driver+vehicle pair (see the SQL
    // cleanup script for real examples), so editing DRIVER on one of those tickets was silently
    // overwriting VEHICLE with a wrong guessed value. There is no reliable way to auto-split
    // free-text without a real vehicle roster, so this never guesses — ambiguous legacy tickets
    // are left for a human to clean up by hand (see backfill_split_driver_service_vehicle.sql).
    case 'SERVICE': {
      const driverVal = normalizeDriverInput(v)
      body.driverName = driverVal
      body.acDetails = mergeAcMeta(acBase, { driverName: driverVal, driver_name: driverVal })
      break
    }
    case 'VEHICLE': {
      const vehicleVal = normalizeDriverInput(v)
      body.serviceVehicle = vehicleVal
      body.acDetails = mergeAcMeta(acBase, { serviceVehicle: vehicleVal, service_vehicle: vehicleVal })
      break
    }
    case 'UPDATE': {
      const remark = stripArchivedRemarkSuffix(v)
      body.remarks = remark
      body.remarksUpdate = remark
      body.acDetails = mergeAcMeta(acBase, { update: remark, remarksUpdate: remark })
      break
    }
    case 'FINAL DATE': {
      const dateKey = v.split('T')[0].split(' ')[0].trim()
      if (!dateKey) {
        if (ticketHadScheduleDate(ticket)) {
          const acUpdates: Record<string, unknown> = {}
          applyReturnToNegotiatorMyTicketsPatch(ticket, body, acUpdates)
          body.acDetails = mergeAcMeta(acBase, acUpdates)
        }
        break
      }
      body.finalDate = dateKey
      body.preferredDate = dateKey
      body.acDetails = mergeAcMeta(acBase, { finalDate: dateKey, scheduledDate: dateKey })
      const stat = (ticket.status || '').toUpperCase()
      if (['PENDING', 'ASSIGNED'].includes(stat)) body.status = 'SCHEDULED'
      break
    }
    case 'NEGOTIATOR': {
      if (!v) break
      const needle = v.toLowerCase()
      const emp = employees.find(e =>
        e.id === v
        || (e.name || '').trim().toLowerCase() === needle
        || (e.name || '').toLowerCase().includes(needle),
      )
      if (emp?.id) body.negotiatorId = emp.id
      break
    }
    default:
      break
  }
  return applyRelayScheduleSyncToPatch(body, ticket)
}

export type TicketsSurface = 'my-tickets' | 'schedules' | 'search'

/**
 * Each surface maps to exactly the pathname string the old route-sniffing logic used to read
 * from useLocation() — kept as literal strings (not the actual URL) so the surface-specific
 * cache-key/date-resolution helpers below (which take a raw pathname) behave identically.
 */
function pathnameForSurface(surface: TicketsSurface): string {
  if (surface === 'my-tickets') return '/my-tickets'
  if (surface === 'schedules') return '/schedules'
  return '/search'
}

export default function Tickets({ surface }: { surface: TicketsSurface }) {
  const { theme, toggleTheme } = useTheme()
  const { user } = useAuth()
  const pathname = pathnameForSurface(surface)
  const { setSidebarOpen } = useOutletContext<{ setSidebarOpen: (v: boolean) => void }>() || {}
  const isMyTickets = surface === 'my-tickets'
  const isLight = theme === 'light'

  const [activeTab, setActiveTab] = useState<'schedules' | 'overview'>(
    () => surface === 'search' ? 'overview' : 'schedules'
  )

  useEffect(() => {
    const handleTabCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent
      const updatedTicket = customEvent.detail?.ticket
      if (!updatedTicket?.id) return

      setTickets(prev => {
        if (!prev.some(t => t.id === updatedTicket.id)) return prev
        return prev.map(t => (
          t.id === updatedTicket.id
            ? preserveLocalScheduleFields(t, updatedTicket as Ticket)
            : t
        ))
      })
    }
    window.addEventListener(TAB_CACHE_UPDATED, handleTabCacheUpdate)
    return () => window.removeEventListener(TAB_CACHE_UPDATED, handleTabCacheUpdate)
  }, [])

  useEffect(() => {
    if (surface === 'search') {
      setActiveTab('overview')
    } else if (surface === 'schedules') {
      setActiveTab('schedules')
      setDateFilter(resolveInitialScheduleDate('/schedules'))
    } else if (surface === 'my-tickets') {
      setActiveTab('schedules')
      setDateFilter('')
    }
  }, [surface])

  const [overviewSearchInput, setOverviewSearchInput] = useState('')
  const [overviewSearchFocused, setOverviewSearchFocused] = useState(false)
  const [overviewResults, setOverviewResults] = useState<Ticket[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const overviewSearchSeqRef = useRef(0)

  const fetchOverviewTickets = useCallback(async (query: string) => {
    const seq = ++overviewSearchSeqRef.current
    if (!query.trim()) {
      if (seq === overviewSearchSeqRef.current) setOverviewResults([])
      return
    }
    setOverviewLoading(true)
    try {
      const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const trimmed = query.trim()
      const looksLikeTicketNumber = /^AS-\d+/i.test(trimmed) || /^TKT-\d+/i.test(trimmed)

      if (looksLikeTicketNumber) {
        const cached = getTicketByNumber(trimmed) as Ticket | null
        if (cached?.id && ticketMatchesOverviewQuery(cached, trimmed)) {
          if (seq === overviewSearchSeqRef.current) setOverviewResults([cached])
          return
        }
        const direct = await fetchTicketByNumber(tokenStr, trimmed)
        if (seq !== overviewSearchSeqRef.current) return
        if (direct && typeof direct === 'object') {
          const ticket = normalizeRelayScheduleTicket(direct) as Ticket
          if (ticket?.id && ticketMatchesOverviewQuery(ticket, trimmed)) {
            cacheTicketByNumber(ticket as unknown as Record<string, unknown>)
            setOverviewResults([ticket])
            return
          }
        }
        setOverviewResults([])
        return
      }

      const headers = { Authorization: `Bearer ${tokenStr}` }
      const url = `${API_BASE_URL}/tickets/search?q=${encodeURIComponent(trimmed)}&size=300`
      const res = await fetch(url, { headers })
      if (seq !== overviewSearchSeqRef.current) return
      if (res.ok) {
        const data = await res.json()
        const list = data?.data?.tickets || data?.tickets || []
        cacheTicketsByNumber(list)
        const matched = filterOverviewSearchResults(list as Ticket[], trimmed)
        setOverviewResults(sortOverviewSearchResults(matched, trimmed))
      } else {
        setOverviewResults([])
        console.error('Failed to search tickets:', res.statusText)
      }
    } catch (err) {
      if (seq === overviewSearchSeqRef.current) setOverviewResults([])
      console.error('Error searching tickets:', err)
    } finally {
      if (seq === overviewSearchSeqRef.current) setOverviewLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'overview') return
    const trimmed = overviewSearchInput.trim()
    if (!trimmed) {
      setOverviewResults([])
      return
    }

    const timer = setTimeout(() => {
      void fetchOverviewTickets(trimmed)
    }, 300)

    return () => clearTimeout(timer)
  }, [overviewSearchInput, activeTab, fetchOverviewTickets])

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{ backgroundColor: '#fef08a', color: '#000', fontWeight: 600 }}>{part}</mark>
      ) : (
        part
      )
    )
  }

  const role = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'
  const isAdmin = isPortalAdmin(role)
  const isManager = role === 'manager'
  const isEmployee = ['employee', 'oic', 'staff'].includes(role)
  const canEdit = isAdmin || isManager || isEmployee

  // Ã¢â€â‚¬Ã¢â€â‚¬ Global branch Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )
  useEffect(() => {
    const sync = () => setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [])

  const activeBranchId = (() => {
    // Only branch-switcher-capable roles honor the shared global branch
    // selection — plain employees must always stay scoped to their own
    // branch, otherwise a stale selection left by another user on the same
    // device silently overrides their Schedules/My Tickets branch.
    if (isAdmin || isCoordinatorOrOicUser(user)) {
      if (globalBranchId && globalBranchId !== 'ALL_BRANCHES') return globalBranchId
      if (isAdmin) {
        const fromSidebar = getActivePortalBranchId(user)
        if (fromSidebar && fromSidebar !== 'ALL_BRANCHES') return fromSidebar
      }
    }
    return user?.branchId || ''
  })()
  const isTaguig = isTaguigBranchRef(activeBranchId)
  const isTaguigServices = isTaguigServicesScope(activeBranchId, user?.email, user?.jobTitle)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Color tokens Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const tableBorder = isLight ? '#e2e8f0' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const theadBg = isLight ? '#e8edf3' : '#0f172a'
  const myTicketsTheadBg = isLight ? '#DEF2E6' : '#0a1f24'
  const myTicketsTheadText = isLight ? '#14532D' : '#34d399'
  const myTicketsTheadBorder = isLight ? 'rgba(22,163,74,0.42)' : '#0f3c33'
  const schedTheadBg = isLight ? '#E3F4E9' : '#0a1f24'
  const schedTheadText = isLight ? '#166534' : '#4ade80'
  const schedTheadBorder = isLight ? 'rgba(22,163,74,0.38)' : '#0f3c33'
  const rowEven = isLight ? '#ffffff' : '#0f172a'
  const rowOdd = isLight ? '#f7fbf8' : '#1b2330'
  const rowHover = isLight ? '#edf7f1' : '#222f44'
  const green = '#16A34A'
  const textGreen = isLight ? '#16A34A' : '#4ade80'

  // Ã¢â€â‚¬Ã¢â€â‚¬ Data state Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const initialSchedulesRef = useRef<ReturnType<typeof getInitialSchedulesFromCache> | null>(null)
  if (!initialSchedulesRef.current) {
    const dateKey = resolveInitialScheduleDate(pathname)
    initialSchedulesRef.current = getInitialSchedulesFromCache(pathname, dateKey || undefined)
  }
  const initialSchedules = initialSchedulesRef.current
  const initialSchedulesReady = initialSchedules.hasCache || initialSchedules.sessionLoaded

  const fetchSeqRef = useRef(0)
  const hasLoadedOnceRef = useRef(initialSchedulesReady)

  /** Local row edits (installer / driver / payment / remarks) Ã¢â‚¬â€ never let server refresh overwrite these. */
  const locallyEditedTicketIdsRef = useRef(new Set<string>())
  const [tickets, setTickets] = useState<Ticket[]>(() =>
    initialSchedules.hasCache
      ? normalizeRelayScheduleTicketList(initialSchedules.tickets as Ticket[])
      : [],
  )
  const ticketsRef = useRef<Ticket[]>(tickets)
  ticketsRef.current = tickets
  const [loading, setLoading] = useState(() => !initialSchedulesReady)
  const [syncing, setSyncing] = useState(false)
  const [backgroundSyncing, setBackgroundSyncing] = useState(false)
  const [hasHydratedOnce, setHasHydratedOnce] = useState(() => initialSchedulesReady)
  const [progress, setProgress] = useState(0)

  // ── Assign Drivers state ───────────────────────────────────────
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkAssignInstaller, setBulkAssignInstaller] = useState('')
  const [bulkAssignDriver, setBulkAssignDriver] = useState('')
  const [bulkAssignVehicle, setBulkAssignVehicle] = useState('')
  const [bulkAssignTrip, setBulkAssignTrip] = useState<string>('1')
  void bulkAssignTrip
  void setBulkAssignTrip
  const [bulkAssignSaving, setBulkAssignSaving] = useState(false)
  const [bulkClearSaving, setBulkClearSaving] = useState(false)

  useEffect(() => {
    if (loading) {
      setProgress(0)
      const timer = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            return prev
          }
          const diff = Math.max(1, Math.floor((100 - prev) * 0.15))
          return prev + diff
        })
      }, 100)
      return () => clearInterval(timer)
    } else {
      setProgress(100)
    }
  }, [loading])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  /** Admin My Tickets: filter pending/assigned rows to one negotiator (e.g. GLESEL). */
  const [myTicketsNegotiatorFilter, setMyTicketsNegotiatorFilter] = useState('')
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' }>(
    () => defaultSortForSchedulesView(isMyTickets),
  )

  useEffect(() => {
    setSortConfig(defaultSortForSchedulesView(isMyTickets))
  }, [isMyTickets])
  const [dateFilter, setDateFilter] = useState(() => resolveInitialScheduleDate(pathname))
  // Live mirror of dateFilter — read this inside setState updaters / async callbacks so a stale
  // closure (e.g. a background save's applyTicketLocally that resolves after the date tab auto-jumped)
  // never writes the current on-screen rows into a *different* date's cache key.
  const dateFilterRef = useRef(dateFilter)
  dateFilterRef.current = dateFilter
  const dateFilterInputRef = useRef<HTMLInputElement>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ ticketId: string; colLabel: string } | null>(null)
  const [draggedVehicleTicketId, setDraggedVehicleTicketId] = useState<string | null>(null)
  const [vehicleDropTargetId, setVehicleDropTargetId] = useState<string | null>(null)
  // Per-row dragover/drop relies on native hit-testing, which gets ambiguous once sibling rows
  // are mid-slide (translateY + z-index during the "make room" animation) — the browser can end
  // up firing drop on a row other than the one visually under the cursor, so the reorder silently
  // no-ops and everything reverts once the drag state clears. Tracking the target row directly
  // from cursor Y position against the table body sidesteps that hit-testing ambiguity entirely.
  const vehicleDragTbodyRef = useRef<HTMLTableSectionElement>(null)
  const getVehicleDragRowIndex = useCallback((clientY: number): number => {
    const el = vehicleDragTbodyRef.current
    if (!el) return -1
    const rect = el.getBoundingClientRect()
    return Math.floor((clientY - rect.top) / TABLE_ROW_HEIGHT)
  }, [])
  // Double-click a VEHICLE cell to select it (green highlight) instead of opening a text editor —
  // arrow keys then move that ticket up/down within its vehicle group.
  const [selectedVehicleTicketId, setSelectedVehicleTicketId] = useState<string | null>(null)
  // A live table row rendered as a native drag-image looks garbled (browsers don't snapshot
  // table layout cleanly) — preload a transparent 1x1 pixel once and use that as the drag image
  // instead, so nothing follows the cursor. The row stays put in place (dimmed) and the "make
  // room" slide animation on the other rows communicates the move instead of a ghost.
  const dragGhostImgRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    const img = new Image()
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'
    dragGhostImgRef.current = img
  }, [])
  const [expandedCell, setExpandedCell] = useState<{ ticketId: string; colLabel: string } | null>(null)
  const [expandedPopoverPos, setExpandedPopoverPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const pendingSavesRef = useRef(new Map<string, PendingTicketSave>())
  const activeSavesRef = useRef(new Set<string>())
  /** Local optimistic tickets that must survive in-flight list refreshes until PATCH/POST settles. */
  const optimisticTicketsRef = useRef(new Map<string, Ticket>())
  /** Ticket ids removed in UI while DELETE runs (or until server list confirms absence). */
  const deletedTicketsRef = useRef(new Set<string>())
  /** Latest flushTicketSave Ã¢â‚¬â€ used by create/import paths defined earlier in the component. */
  const flushTicketSaveRef = useRef<(ticketId: string) => void>(() => { })

  const schedulesCacheKeyForTab = useCallback(
    // Default to the LIVE dateFilter (via ref), never the render-time closure value. Every date-keyed
    // cache write goes through here; if this captured a stale dateFilter, an async caller (a background
    // save/rollback/remap that resolves after the date tab moved) would write the current on-screen
    // rows into a *different* date's cache slot and wipe that date's roster. Reading the ref keeps the
    // key aligned with whatever date `prev` actually reflects at call time.
    (dateOverride?: string) => schedulesCacheKey(
      user,
      globalBranchId,
      isCustomer,
      isAdmin,
      isMyTickets,
      isMyTickets ? undefined : (dateOverride ?? dateFilterRef.current),
    ),
    [user, globalBranchId, isCustomer, isAdmin, isMyTickets],
  )

  const persistSchedulesSnapshot = useCallback(() => {
    if (isMyTickets) return
    const list = normalizeRelayScheduleTicketList(ticketsRef.current)
    writeSchedulesTabCache(schedulesCacheKeyForTab(), list, 'local')
    persistSchedulesMemoryToDisk()
  }, [isMyTickets, schedulesCacheKeyForTab])

  useEffect(() => {
    const onPersist = () => { persistSchedulesSnapshot() }
    window.addEventListener(SCHEDULES_PERSIST_LOCAL, onPersist)
    return () => window.removeEventListener(SCHEDULES_PERSIST_LOCAL, onPersist)
  }, [persistSchedulesSnapshot])

  const hydrateFromTabCache = useCallback((): boolean => {
    const cached = readSchedulesTabCache(schedulesCacheKeyForTab())
    if (!Array.isArray(cached?.tickets)) return false

    const pending = optimisticTicketsRef.current
    const deleted = deletedTicketsRef.current
    let list = (cached.tickets as Ticket[]).filter(t =>
      !deleted.has(t.id) && (!isTempTicketId(t.id) || pending.has(t.id)),
    )
    if (pending.size > 0) {
      const serverIds = new Set(list.map(t => t.id))
      list = list.map(t => pending.get(t.id) || t)
      for (const [id, local] of pending) {
        if (!serverIds.has(id) && !deleted.has(id)) list.unshift(local)
      }
    }

    // Drop stale oversized cache rows that don't belong on this date/branch.
    // NB: filter the in-memory list only — never writeSchedulesTabCache here,
    // that dispatches TAB_CACHE_UPDATED which re-triggers hydrate (infinite loop).
    list = normalizeRelayScheduleTicketList(list)
    if (isMyTickets) {
      list = list.filter(t => {
        if (!shouldShowOnMyTickets(t)) return false
        if (activeBranchId && activeBranchId !== 'ALL_BRANCHES') {
          return ticketBelongsOnScheduleBranch(t, activeBranchId, user?.email, user?.jobTitle)
        }
        return true
      })
    } else if (dateFilter) {
      list = list.filter(t => {
        if (!ticketBelongsOnScheduleDate(t, dateFilter)) return false
        // Cancelled red ghosts must remain on their schedule date even when legacy branchId is empty.
        if (isCancelledScheduleGhost(t, dateFilter)) return true
        return ticketBelongsOnScheduleBranch(t, activeBranchId, user?.email, user?.jobTitle)
      })
    }

    setTickets(list)
    setLoading(false)
    setHasHydratedOnce(true)
    hasLoadedOnceRef.current = true
    return true
  }, [schedulesCacheKeyForTab, isMyTickets, dateFilter, activeBranchId, user?.email, user?.jobTitle])

  // Paint cached rows before first paint when switching branch/date — no loading screen flash.
  useLayoutEffect(() => {
    const hydrated = hydrateFromTabCache()
    if (hydrated) {
      setSyncing(false)
      return
    }
    // No cache for this date/branch — clear stale rows from the previous tab immediately.
    setTickets([])
    setHasHydratedOnce(true)
    setLoading(false)
  }, [isMyTickets, hydrateFromTabCache, dateFilter, globalBranchId, user])

  // Ã¢â€â‚¬Ã¢â€â‚¬ Weekly Tabs Calculation Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const weeklyTabs = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = formatDateToKey(today)

    const dow = today.getDay()
    const offset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(today)
    monday.setDate(today.getDate() + offset)

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const key = formatDateToKey(d)
      const isToday = key === todayKey
      const dayName = isToday ? 'Today' : d.toLocaleDateString('en-PH', { weekday: 'short' })
      const dateLabel = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      return { key, dayName, dateLabel }
    })
  }, [])

  const isCustomSelected = useMemo(() => {
    return dateFilter !== '' && !weeklyTabs.some(tab => tab.key === dateFilter)
  }, [dateFilter, weeklyTabs])

  const handleDateFilterChange = useCallback((next: string) => {
    if (next) { try { sessionStorage.setItem(SCHEDULES_ACTIVE_DATE_KEY, next) } catch { /* ignore */ } }
    setDateFilter(next)
    resetTicketTableScroll()
  }, [])

  useLayoutEffect(() => {
    resetTicketTableScroll()
  }, [dateFilter])

  const [saving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [paymentPrompt, setPaymentPrompt] = useState<{ ticket: Ticket; nextStatus: string } | null>(null)
  const [promptAmount, setPromptAmount] = useState<string>('')
  const [promptMode, setPromptMode] = useState<string>('CASH')
  const [promptHybridCash, setPromptHybridCash] = useState<string>('')
  const [promptHybridGcash, setPromptHybridGcash] = useState<string>('')

  useEffect(() => {
    if (isMyTickets) {
      setDateFilter('')
      return
    }
    if (isTaguig) {
      try {
        const persisted = sessionStorage.getItem(SCHEDULES_ACTIVE_DATE_KEY)
        if (persisted && /^\d{4}-\d{2}-\d{2}$/.test(persisted)) return
      } catch {
        // ignore
      }
      setDateFilter(currentWeekMondayDateKey())
    }
  }, [isMyTickets, isTaguig])

  // Ã¢â€â‚¬Ã¢â€â‚¬ Context menu Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ticket: Ticket } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)

  useEffect(() => {
    if (!contextMenu) return

    const closeIfOutside = (event: MouseEvent | PointerEvent) => {
      const target = event.target
      if (target instanceof Node && contextMenuRef.current?.contains(target)) return
      setContextMenu(null)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    const closeMenu = () => setContextMenu(null)

    document.addEventListener('pointerdown', closeIfOutside, true)
    document.addEventListener('contextmenu', closeIfOutside, true)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('blur', closeMenu)

    return () => {
      document.removeEventListener('pointerdown', closeIfOutside, true)
      document.removeEventListener('contextmenu', closeIfOutside, true)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('blur', closeMenu)
    }
  }, [contextMenu])

  // Ã¢â€â‚¬Ã¢â€â‚¬ History state Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Manual Add Modal State Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
    dealer: 'Direct',
    serviceDriver: '',
    installerName: '',
    negotiatorId: '',
    ticketNumber: '',
    controlNumber: '',
    modeOfPayment: '',
    installationCharges: undefined,
    ticketCategory: 'INSTALLATION',
  })
  const [branchEmployees, setBranchEmployees] = useState<BranchStaffOption[]>([])
  const [branchRosters, setBranchRosters] = useState<Record<string, BranchRoster>>({})
  const [installerLineupIndex, setInstallerLineupIndex] = useState<InstallerBranchIndexEntry[]>([])
  const [driverOnlyNames, setDriverOnlyNames] = useState<string[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])

  const resolveNormalizedBranchName = useCallback((branchIdOrName?: string | null): string => {
    if (!branchIdOrName) return ''
    const found = branches.find(b => b.id === branchIdOrName)
      || branches.find(b => b.name.toLowerCase() === branchIdOrName.toLowerCase())
    if (found) {
      let name = found.name.toUpperCase()
      name = name.replace(/^ASHCOL\b/i, '').replace(/[\s\-\_]+/g, ' ').trim()
      return name.toLowerCase()
    }
    const upper = branchIdOrName.toUpperCase()
    let name = upper.replace(/^BR-/i, '').replace(/-(sales|services|service)$/i, '').replace(/[\s\-\_]+/g, ' ').trim()
    if (name.startsWith('ASHCOL ')) {
      name = name.slice(7).trim()
    }
    return name.toLowerCase()
  }, [branches])

  const isBranchMatch = useCallback((idA?: string | null, idB?: string | null): boolean => {
    if (!idA || !idB) return false
    if (idA === idB) return true
    const nameA = resolveNormalizedBranchName(idA)
    const nameB = resolveNormalizedBranchName(idB)
    return nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA)
  }, [resolveNormalizedBranchName])

  useEffect(() => {
    const authToken = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    if (!authToken) return
    fetchCachedBranches(authToken)
      .then((list) => setBranches(Array.isArray(list) ? list as { id: string; name: string }[] : []))
      .catch(() => setBranches([]))
  }, [])

  const resolveBranch = useCallback((branchIdOrName?: string | null) => {
    if (!branchIdOrName) return null
    let found = branches.find(b => b.id === branchIdOrName)
    if (found) return found
    found = branches.find(b => b.name.toLowerCase() === branchIdOrName.toLowerCase())
    if (found) return found
    const idLower = branchIdOrName.toLowerCase()
    let keyword = ''
    if (idLower === '2880bf12-581c-11f1-bf8c-74d4dd6dfc0b' || idLower === 'br-calauan') keyword = 'calauan'
    else if (idLower === '2880c15e-581c-11f1-bf8c-74d4dd6dfc0b' || idLower === 'br-silang') keyword = 'silang'
    else if (idLower.startsWith('2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') || idLower === 'br-taguig-sales' || idLower === 'br-taguig-services' || idLower === 'br-taguig') keyword = 'taguig'
    else if (idLower === '2880c35a-581c-11f1-bf8c-74d4dd6dfc0b' || idLower === 'br-rizal') keyword = 'rizal'
    else if (idLower === '2880c3b7-581c-11f1-bf8c-74d4dd6dfc0b' || idLower === 'br-pampanga') keyword = 'pampanga'
    else if (idLower === '2880c407-581c-11f1-bf8c-74d4dd6dfc0b' || idLower === 'br-bulacan') keyword = 'bulacan'
    else if (idLower === '2880c4af-581c-11f1-bf8c-74d4dd6dfc0b' || idLower === 'br-dasma') keyword = 'dasma'
    else if (idLower === '2880c5fa-581c-11f1-bf8c-74d4dd6dfc0b' || idLower === 'br-candelaria') keyword = 'candelaria'
    if (keyword) {
      found = branches.find(b => b.name.toLowerCase().includes(keyword))
      if (found) return found
    }
    found = branches.find(b => b.name.toLowerCase().includes(idLower) || idLower.includes(b.name.toLowerCase()))
    return found || null
  }, [branches])

  const formatAssignedBranchLabel = useCallback((branchId?: string | null) => {
    const resolved = resolveBranch(branchId)
    if (!resolved && !branchId) return EMPTY_CELL
    const id = (resolved?.id || branchId || '').toUpperCase()
    const name = resolved?.name || ''
    if (id === 'BR-TAGUIG-SALES' || id.endsWith('-SALES')) return 'TAGUIG - SALES'
    if (id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || id.endsWith('-SERVICES') || id.endsWith('-SERVICE')) {
      return 'TAGUIG - SERVICES'
    }
    return name || getBranchDisplayName(branchId || null)
  }, [resolveBranch])
  // Ã¢â€â‚¬Ã¢â€â‚¬ Manual Edit Modal State Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTicket, setEditTicket] = useState<Ticket | null>(null)
  const [relayCustomStores, setRelayCustomStores] = useState<string[]>([])
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Ticket> & {
    serviceDriver?: string; reschedulePending?: boolean; ticketCategory?: TicketCategoryValue; finalDate?: string; branchId?: string
    // Present only when the edit originated from RelayEditTicketModal (overview tab) — see
    // ticketEditBridge.ts. Left undefined when saved via ScheduleEditTicketModal so commitSaveEditTicket
    // knows not to touch these acDetails keys (and not clobber them with undefined).
    landmarks?: string; capacity?: string; sku?: string; serialNumber?: string; relayedDate?: string; alternatePhone?: string
    robinsonsTransactionId?: string
    storeReferralFee?: string; referralRecipient?: string; referralAmount?: string; referralStatus?: string
    referralDatePaid?: string; referralReferenceNo?: string
    rebatesClaim?: string; rebatesCompany?: string; rebatesAmountDue?: string; rebatesStatus?: string; rebatesReferenceNo?: string
    warrantyStatus?: string; warrantyRegisteredBy?: string
  }>({})
  const [editOriginalDate, setEditOriginalDate] = useState('')
  const [editFormSnapshot, setEditFormSnapshot] = useState('')

  useEffect(() => {
    if (!editModalOpen || branches.length > 0) return
    const authToken = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    if (!authToken) return
    fetchCachedBranches(authToken)
      .then((list) => setBranches(Array.isArray(list) ? list as { id: string; name: string }[] : []))
      .catch(() => { })
  }, [editModalOpen, branches.length])

  const fetchDealers = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/dealers`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const list = await res.json()
        setDealers(list)
        setRelayCustomStores(list.map((d: any) => d.name.toUpperCase()))
      }
    } catch (err) {
      console.error('Error fetching dealers in Tickets.tsx:', err)
    }
  }, [])

  useEffect(() => {
    fetchDealers()
  }, [fetchDealers])

  useEffect(() => {
    window.addEventListener(DEALERS_UPDATED_EVENT, fetchDealers)
    return () => window.removeEventListener(DEALERS_UPDATED_EVENT, fetchDealers)
  }, [fetchDealers])

  const handlePersistCustomStores = async (nextStores: string[]) => {
    const uppercaseStores = nextStores.map(s => s.trim().toUpperCase()).filter(Boolean)
    const newStore = uppercaseStores.find(name => !relayCustomStores.includes(name))
    if (newStore) {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/dealers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ name: newStore })
        })
        if (res.ok) {
          await fetchDealers()
          notifyDealersUpdated()
        }
      } catch (err) {
        console.error('Error auto-creating dealer from edit modal:', err)
      }
    }
  }

  useEffect(() => {
    if (!editModalOpen || activeTab !== 'overview') return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [editModalOpen, activeTab])

  const resolveSchedulesNegotiatorBranch = useCallback((overrideBranchId?: string | null): string | null => {
    const scoped = (overrideBranchId || '').trim()
    if (scoped && scoped !== 'ALL' && scoped !== 'ALL_BRANCHES') {
      return resolvePortalWriteBranchId(scoped, user?.email, user?.jobTitle) || scoped
    }
    const raw = (globalBranchId || user?.branchId || '').trim()
    if (!raw || raw === 'ALL_BRANCHES' || raw === 'ALL') {
      return resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle) || user?.branchId || null
    }
    return resolvePortalWriteBranchId(raw, user?.email, user?.jobTitle) || raw
  }, [globalBranchId, user?.branchId, user?.email, user?.jobTitle])

  const currentNegotiatorOption = useMemo((): BranchStaffOption | null => {
    if (!user?.id) return null
    // Prefer the employee-directory record (matched by email) over the raw JWT user id —
    // if the two diverge (e.g. account recreated in the directory after the token was
    // issued), selecting "self" would produce a negotiatorId that branchEmployees.find()
    // can never match, and Save fails with "Selected negotiator was not found for this
    // branch" even though the same person is clearly assigned. Falls back to the JWT
    // fields only when no directory match exists.
    const userEmail = (user.email || '').trim().toLowerCase()
    const directoryMatch = userEmail
      ? branchEmployees.find(emp => (emp.email || '').trim().toLowerCase() === userEmail)
      : undefined
    if (directoryMatch) {
      return {
        id: directoryMatch.id,
        name: directoryMatch.name || user.name,
        branchId: directoryMatch.branchId || user.branchId,
        email: directoryMatch.email || user.email,
        role: directoryMatch.role || user.role,
        jobTitle: directoryMatch.jobTitle || user.jobTitle,
      }
    }
    return {
      id: user.id,
      name: user.name,
      branchId: user.branchId,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
    }
  }, [user?.id, user?.name, user?.branchId, user?.email, user?.role, user?.jobTitle, branchEmployees])

  /** Negotiators assigned to a branch only (no cross-branch / global fallback). */
  const negotiatorsForBranch = useCallback((branchId?: string | null) => {
    const filterBranch =
      resolveSchedulesNegotiatorBranch(branchId)
      || resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle)
      || user?.branchId
      || null
    const isAll = !branchId || branchId === 'ALL' || branchId === 'ALL_BRANCHES'
    const matched = branchEmployees
      .filter(isNegotiatorCandidate)
      .filter(u => {
        if (isAll) return true
        const bid = (u.branchId || '').trim()
        if (!bid || bid.toUpperCase() === 'ALL' || bid.toUpperCase() === 'ALL_BRANCHES') return false
        return isBranchMatch(bid, filterBranch)
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    // Include signed-in user only when they belong to this branch
    if (
      currentNegotiatorOption
      && currentNegotiatorOption.branchId
      && (isAll || isBranchMatch(currentNegotiatorOption.branchId, filterBranch))
    ) {
      return appendCurrentNegotiator(matched, currentNegotiatorOption)
    }
    return matched
  }, [branchEmployees, resolveSchedulesNegotiatorBranch, currentNegotiatorOption, user?.branchId, user?.email, user?.jobTitle, isBranchMatch])

  const addModalNegotiators = useMemo(
    () => negotiatorsForBranch(activeBranchId),
    [negotiatorsForBranch, activeBranchId],
  )

  const myTicketsNegotiatorOptions = useMemo(
    () => negotiatorsForBranch(activeBranchId),
    [negotiatorsForBranch, activeBranchId],
  )

  // Drop My Tickets negotiator filter when Active Branch changes and they are no longer listed.
  useEffect(() => {
    if (!isMyTickets || !myTicketsNegotiatorFilter) return
    if (myTicketsNegotiatorOptions.some(n => n.id === myTicketsNegotiatorFilter)) return
    setMyTicketsNegotiatorFilter('')
  }, [isMyTickets, myTicketsNegotiatorFilter, myTicketsNegotiatorOptions, activeBranchId])

  const editModalNegotiators = useMemo(() => {
    const base = negotiatorsForBranch(editForm.branchId || activeBranchId)
    let list = [...base]
    const ticketNegoId = (editForm.negotiatorId || '').trim()
    if (ticketNegoId) {
      const fromEmp = branchEmployees.find(e => e.id === ticketNegoId)
      if (fromEmp) list = appendCurrentNegotiator(list, fromEmp)
    }
    if (currentNegotiatorOption) {
      list = appendCurrentNegotiator(list, currentNegotiatorOption)
    }
    return list
  }, [negotiatorsForBranch, editForm.branchId, editForm.negotiatorId, activeBranchId, branchEmployees, currentNegotiatorOption])

  const activeBranchLabel = useMemo(
    () => getBranchDisplayName(resolveSchedulesNegotiatorBranch(activeBranchId) || activeBranchId),
    [activeBranchId, resolveSchedulesNegotiatorBranch],
  )

  const rosterForBranch = useCallback((branchId?: string | null): BranchRoster => {
    const key = (branchId || '').trim()
    if (!key) return { drivers: [], installers: [] }
    if (branchRosters[key]) return branchRosters[key]
    const scoped = resolveScopedBranchId(key)
    if (branchRosters[scoped]) return branchRosters[scoped]
    return buildBranchRoster(branchEmployees, key)
  }, [branchRosters, branchEmployees])

  const rosterForTicket = useCallback((ticket: Ticket): BranchRoster => {
    const branchId = resolveTicketScheduleBranchId(ticket, installerLineupIndex, driverOnlyNames)
      || activeBranchId
      || user?.branchId
      || null
    return rosterForBranch(branchId)
  }, [rosterForBranch, installerLineupIndex, driverOnlyNames, activeBranchId, user?.branchId])

  const activeBranchRoster = useMemo(
    () => rosterForBranch(activeBranchId || user?.branchId),
    [rosterForBranch, activeBranchId, user?.branchId],
  )

  const editModalRoster = useMemo(
    () => rosterForBranch(editForm.branchId || activeBranchId),
    [rosterForBranch, editForm.branchId, activeBranchId],
  )

  // Drop negotiator if branch filter no longer includes them
  useEffect(() => {
    if (!addModalOpen || !addForm.negotiatorId) return
    if (addModalNegotiators.length === 0) return
    if (!addModalNegotiators.some(n => n.id === addForm.negotiatorId)) {
      setAddForm(prev => ({ ...prev, negotiatorId: '' }))
    }
  }, [addModalOpen, addModalNegotiators, addForm.negotiatorId])

  useEffect(() => {
    if (!editModalOpen || !editForm.negotiatorId) return
    // Wait for negotiator list Ã¢â‚¬â€ clearing while still loading falsely marks the form dirty.
    if (editModalNegotiators.length === 0) return
    if (!editModalNegotiators.some(n => n.id === editForm.negotiatorId)) {
      setEditForm(prev => ({ ...prev, negotiatorId: '' }))
    }
  }, [editModalOpen, editModalNegotiators, editForm.negotiatorId])

  const [confirmModal, setConfirmModal] = useState<ConfirmDialogState | null>(null)
  const [reschedDialog, setReschedDialog] = useState<{ ticket: Ticket } | null>(null)
  const [reschedToDate, setReschedToDate] = useState('')
  const [reschedPending, setReschedPending] = useState(false)
  const [reschedCalMonth, setReschedCalMonth] = useState<{ year: number; month: number } | null>(null)

  const [continuationDialog, setContinuationDialog] = useState<{ ticket: Ticket } | null>(null)
  const [continuationSelectedDates, setContinuationSelectedDates] = useState<string[]>([])
  const [continuationCalMonth, setContinuationCalMonth] = useState<{ year: number; month: number } | null>(null)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Excel Import State Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanFileInputRef = useRef<HTMLInputElement>(null)
  const [showcaseOpen, setShowcaseOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [_importing, setImporting] = useState(false)
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
      const match = tickets.find(t => {
        if (usedTicketIds.has(t.id)) return false
        return importRowMatchesTicket(row, t)
      })

      if (match) {
        usedTicketIds.add(match.id)
        matchedCount++

        const updatedFields = applyImportFieldsFromRow(row, isTaguigServices)
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
    if (!addForm.negotiatorId) {
      alert('Negotiator is required')
      return
    }
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
    void commitSaveManualTicket()
  }

  const commitSaveManualTicket = () => {
    let tempId = ''
    try {
      const tokenVal = token()
      if (!tokenVal) {
        throw new Error('Not signed in Ã¢â‚¬â€ refresh the page and try again.')
      }
      const category = addForm.ticketCategory || 'INSTALLATION'
      const { serviceType, serviceVehicle } = parseServiceDriverValue(addForm.serviceDriver, category)
      const titleVal = `${categoryDefaultServiceType(category)} service`
      const descVal = addForm.commitTerms?.trim() || 'No additional details provided.'

      const lockedBranch = resolveTicketArchiveBranchId(
        { installerName: addForm.installerName?.trim() },
        installerLineupIndex,
        driverOnlyNames,
      )
      const activeWriteBranch = resolveSchedulesNegotiatorBranch(activeBranchId)
      if (!activeWriteBranch) {
        throw new Error('Select a branch before adding a scheduled ticket.')
      }
      if (!addForm.negotiatorId) {
        throw new Error('Negotiator is required.')
      }
      const selectedNegotiator = addModalNegotiators.find(emp => emp.id === addForm.negotiatorId)
        || branchEmployees.find(emp => emp.id === addForm.negotiatorId)
      if (!selectedNegotiator) {
        throw new Error('Selected negotiator not found in employee records.')
      }
      const negoBranchRaw = (selectedNegotiator.branchId || '').trim()
      const isAllBranches = !activeBranchId || activeBranchId === 'ALL' || activeBranchId === 'ALL_BRANCHES'
      if (!isAllBranches && negoBranchRaw && !isBranchMatch(negoBranchRaw, activeWriteBranch)) {
        throw new Error(
          `${selectedNegotiator.name} is not assigned to ${getBranchDisplayName(activeWriteBranch)}. `
          + 'Pick a negotiator from this branch.',
        )
      }
      // Use the negotiator's own branch id so backend branch checks match exactly
      const targetBranch = negoBranchRaw
        || resolvePortalWriteBranchId(negoBranchRaw, selectedNegotiator.email, selectedNegotiator.jobTitle)
        || activeWriteBranch
        || lockedBranch
        || resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle)
      if (!targetBranch) {
        throw new Error('Select a branch before adding a scheduled ticket.')
      }
      const scheduledDate = (addForm.preferredDate || '').split('T')[0].trim()
      if (!scheduledDate) {
        throw new Error('Preferred Date is required.')
      }
      const payload = {
        customerName: (addForm.customerName || '').trim().toUpperCase(),
        title: titleVal,
        description: descVal,
        serviceType,
        ticketCategory: category,
        status: 'SCHEDULED',
        source: 'SCHEDULE_MANUAL',
        location: (addForm.location || '').trim().toUpperCase(),
        contactPhone: (addForm.contactPhone || '').trim(),
        unitType: addForm.unitType?.trim() || undefined,
        preferredDate: scheduledDate,
        dealer: addForm.dealer?.trim() || 'Direct',
        district: addForm.district?.trim() || undefined,
        commitType: addForm.commitTerms?.trim() || undefined,
        serviceVehicle: serviceVehicle || undefined,
        installerName: addForm.installerName?.trim() || undefined,
        negotiatorId: addForm.negotiatorId || undefined,
        assignedTo: addForm.negotiatorId || undefined,
        ticketNumber: addForm.ticketNumber?.trim() || undefined,
        controlNumber: addForm.controlNumber?.trim() || undefined,
        modeOfPayment: addForm.modeOfPayment?.trim() || undefined,
        installationCharges: addForm.installationCharges != null && !Number.isNaN(Number(addForm.installationCharges))
          ? Number(addForm.installationCharges)
          : undefined,
        acDetails: JSON.stringify({
          scheduleOutcome: '',
          finalDate: '',
          scheduledDate,
          scheduleIntake: true,
        }),
        branchId: targetBranch,
      }
      tempId = `temp-${Date.now()}`
      const optimisticTicket = {
        id: tempId,
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Ticket

      handleDateFilterChange(scheduledDate)
      optimisticTicketsRef.current.set(tempId, optimisticTicket)
      setTickets(prev => {
        const next = [optimisticTicket, ...prev.filter(t => t.id !== tempId)]
        const cacheKey = schedulesCacheKeyForTab()
        writeSchedulesTabCache(cacheKey, next, 'local')
        return next
      })
      setAddFormSnapshot(JSON.stringify(addForm))
      setAddModalOpen(false)

      void (async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/tickets/schedule`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenVal}`,
            },
            body: JSON.stringify(payload),
          })

          if (!res.ok) {
            throw new Error(await readApiError(res))
          }

          const payloadResult = await res.json().catch(() => null)
          const createdTicket = (parseCreatedTicketResponse(payloadResult)
            || payloadResult?.data?.ticket
            || payloadResult?.data
            || payloadResult?.ticket
            || payloadResult) as Ticket | null
          if (!createdTicket?.id) {
            // POST succeeded but the response couldn't be parsed into a ticket — the temp row has
            // no confirmed backend id, so it must not linger as a local-only ghost that only this
            // browser ever sees. Force a real fetch now so this device converges to whatever the
            // server actually persisted instead of silently waiting on a refresh that never comes.
            console.log('[Schedules] Created ticket in database but response unparseable — forcing refresh', { tempId })
            optimisticTicketsRef.current.delete(tempId)
            pendingSavesRef.current.delete(tempId)
            activeSavesRef.current.delete(tempId)
            setTickets(prev => {
              const next = prev.filter(t => t.id !== tempId)
              writeSchedulesTabCache(schedulesCacheKeyForTab(), next, 'local')
              return next
            })
            void fetchTickets({ force: true, quiet: true })
            return
          }

          const promoted = promoteTempTicketState(
            tempId,
            createdTicket,
            pendingSavesRef.current,
            activeSavesRef.current,
            optimisticTicketsRef.current,
            deletedTicketsRef.current,
          )

          if (promoted.wasDeleted) {
            try {
              const deleteRes = await fetch(`${API_BASE_URL}/tickets/${createdTicket.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${tokenVal}` },
              })
              if (!deleteRes.ok) throw new Error(await readApiError(deleteRes))
            } catch (err: unknown) {
              console.error('[Schedules] Deferred delete of manual ticket FAILED', createdTicket.id, err)
            }
            setTickets(prev => {
              const next = prev.filter(t => t.id !== tempId && t.id !== createdTicket.id)
              const cacheKey = schedulesCacheKeyForTab()
              writeSchedulesTabCache(cacheKey, next, 'local')
              return next
            })
            return
          }

          // Swap temp Ã¢â€ â€™ real id (carry any cell edits made while create was in flight)
          setTickets(prev => {
            const next = [promoted.ticket, ...prev.filter(t => t.id !== tempId && t.id !== createdTicket.id)]
            const cacheKey = schedulesCacheKeyForTab()
            writeSchedulesTabCache(cacheKey, next, 'local')
            return next
          })
          if (promoted.shouldFlush) {
            flushTicketSaveRef.current(createdTicket.id)
          }
          console.log('[Schedules] Created ticket in database', {
            ticketId: createdTicket.id,
            ticketNumber: createdTicket.ticketNumber || createdTicket.ticket_number,
            status: createdTicket.status,
            preferredDate: createdTicket.preferredDate || scheduledDate,
          })
        } catch (err: unknown) {
          const reason = formatFetchError(err)
          console.error('[Schedules] Create ticket FAILED', { tempId, reason, err })
          pendingSavesRef.current.delete(tempId)
          activeSavesRef.current.delete(tempId)
          optimisticTicketsRef.current.delete(tempId)
          deletedTicketsRef.current.delete(tempId)
          setTickets(prev => {
            const next = prev.filter(t => t.id !== tempId)
            const cacheKey = schedulesCacheKeyForTab()
            writeSchedulesTabCache(cacheKey, next, 'local')
            return next
          })
          setAddModalOpen(true)
          alert(`Could not add ticket: ${reason}`)
        }
      })()
    } catch (err: unknown) {
      const reason = formatFetchError(err)
      console.error('[Schedules] Create ticket FAILED', { tempId, reason, err })
      if (tempId) {
        pendingSavesRef.current.delete(tempId)
        activeSavesRef.current.delete(tempId)
        optimisticTicketsRef.current.delete(tempId)
        deletedTicketsRef.current.delete(tempId)
        setTickets(prev => prev.filter(t => t.id !== tempId))
      }
      alert(`Could not add ticket: ${reason}`)
    }
  }

  const buildScheduleEditForm = useCallback((ticket: Ticket) => {
    const preferred = getPreferredDateKey(ticket)
    const status = getScheduleStatusValue(ticket)
    const payment = resolveTicketPayment(ticket)
    const rawBranch = ticket.branchId || ticket.branch_id || ''
    const resolvedBranch = resolveBranch(rawBranch)
    return {
      id: ticket.id,
      preferredDate: preferred,
      finalDate: getFinalDateKey(ticket) || preferred || '',
      customerName: ticket.customerName || ticket.customer_name || ticket.title || '',
      contactPhone: ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '',
      location: formatAddress(ticket.location),
      district: ticket.district || parseDistrict(ticket.location) || '',
      commitTerms: ticket.commitTerms || ticket.commitType || ticket.description || '',
      unitType: parseBrand(ticket) || ticket.unitType || ticket.unit_type || '',
      dealer: getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || 'Direct',
      serviceDriver: isMyTickets ? formatRelayTicketTypeShort(ticket) : getTicketVehicleDisplay(ticket),
      driverName: isMyTickets ? '' : getTicketDriverDisplay(ticket),
      installerName: getInstallerDisplay(ticket, branchEmployees, activeBranchId),
      negotiatorId: ticket.negotiatorId || ticket.negotiator_id || ticket.assignedTo || (isMyTickets && user?.id ? user.id : ''),
      branchId: resolvedBranch?.id || rawBranch || activeBranchId || '',
      ticketNumber: ticket.ticketNumber || ticket.ticket_number || '',
      controlNumber: ticket.controlNumber || ticket.control_number || '',
      ticketCategory: inferCategoryFromTicket(ticket),
      status,
      installationCharges: ticket.installationCharges ?? ticket.installation_charges ?? payment.amount,
      modeOfPayment: ticket.modeOfPayment ?? ticket.mode_of_payment ?? payment.mode,
      remarks: (() => {
        const AUTO_STATUS_REMARKS = new Set([
          'done installed', 'done install', 'done_installed',
          'done cleaning', 'done_cleaning',
          'done survey', 'done_survey',
          'done checkup', 'done_checkup',
          'done backjob', 'done_backjob',
          'installed', 'completed', 'cancelled',
        ])
        const raw = (ticket.remarks || ticket.remarksUpdate || '').trim()
        return AUTO_STATUS_REMARKS.has(raw.toLowerCase()) ? '' : raw
      })(),
      acDetails: ticket.acDetails || ticket.ac_details,
      reschedulePending: isReschedulePending(ticket),
    }
  }, [branchEmployees, activeBranchId, isMyTickets, user?.id, resolveBranch])

  const openEditModal = (ticket: Ticket) => {
    const localTicket = findTicketInListByRef(tickets, ticket, optimisticTicketsRef.current) || ticket
    setEditOriginalDate(resolveTicketScheduleDateKey(localTicket))
    setEditTicket(localTicket)
    const form = buildScheduleEditForm(localTicket)
    setEditForm(form)
    setEditFormSnapshot(JSON.stringify(form))
    setEditModalOpen(true)

    const auth = token()
    if (!auth || isTempTicketId(localTicket.id)) return
    void (async () => {
      const ticketNumber = localTicket.ticketNumber || localTicket.ticket_number || ''
      const fresh = ticketNumber
        ? await fetchTicketByNumber(auth, ticketNumber)
        : await fetchTicketById(auth, localTicket.id)
      if (!fresh || typeof fresh !== 'object') return
      const freshTicket = normalizeRelayScheduleTicket(fresh) as Ticket
      if (!freshTicket?.id) return
      cacheTicketByNumber(freshTicket as unknown as Record<string, unknown>)
      const merged = locallyEditedTicketIdsRef.current.has(localTicket.id)
        ? preserveLocalScheduleFields(localTicket, freshTicket)
        : normalizeRelayScheduleTicket(mergeTicketPatch(freshTicket, localTicket as unknown as Record<string, unknown>)) as Ticket

      setTickets(prev => prev.map(t => (t.id === merged.id ? merged : t)))
      setOverviewResults(prev => prev.map(t => (t.id === merged.id ? { ...t, ...merged } : t)))
      setDetailTicket(prev => (prev?.id === merged.id ? { ...prev, ...merged } : prev))
      syncTicketAcrossTabCaches(merged)

      const nextForm = buildScheduleEditForm(merged)
      setEditTicket(merged)
      setEditForm(prev => (JSON.stringify(prev) === JSON.stringify(form) ? nextForm : prev))
      setEditFormSnapshot(prevSnap => (prevSnap === JSON.stringify(form) ? JSON.stringify(nextForm) : prevSnap))
    })()
  }

  const closeEditModal = useCallback(() => {
    setEditModalOpen(false)
    setEditTicket(null)
    setConfirmModal(null)
  }, [])

  const requestCloseEditModal = useCallback(() => {
    if (JSON.stringify(editForm) !== editFormSnapshot) {
      setConfirmModal({
        title: 'Discard changes?',
        message: 'Unsaved edits on this ticket will be lost.',
        detail: editForm.customerName?.trim() || undefined,
        variant: 'discard',
        confirmText: 'Discard',
        cancelText: 'Keep Editing',
        onConfirm: () => closeEditModal(),
      })
      return
    }
    closeEditModal()
  }, [closeEditModal, editForm, editFormSnapshot])

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
  const validateEditFormFor = (form: typeof editForm): string | null => {
    if (!form.id) return 'Ticket not found'
    const isReschedStatusEarly = (form.status || '').toUpperCase() === 'RESCHED'
    if (isReschedStatusEarly) {
      if (!form.reschedulePending && !form.finalDate?.trim()) {
        return 'Pick a Final Date or choose Pending if no slot is available yet'
      }
    }
    if (!form.negotiatorId) return 'Negotiator is required'
    if (!form.branchId?.trim()) return 'Assigned branch is required'
    const selectedNeg = branchEmployees.find(emp => emp.id === form.negotiatorId)
    if (selectedNeg?.branchId && form.branchId
      && !branchScopesMatch(selectedNeg.branchId, form.branchId, selectedNeg.email)) {
      return 'Negotiator must belong to the assigned branch'
    }
    if (!form.customerName?.trim()) return 'Customer Name is required'
    if (!form.contactPhone?.trim()) return 'Contact No. is required'
    if (!form.location?.trim()) return 'Destination/Address is required'

    const targetStatus = (form.status || '').toUpperCase().replace(/\s+/g, '_')
    const isClosing = CLOSING_SCHEDULE_STATUSES.has(targetStatus)
      || ['COMPLETED', 'INSTALLED', 'CANCELLED'].includes(targetStatus)
    if (isClosing && targetStatus !== 'CANCELLED') {
      const missing = getEmptyRequiredColumnsForClose(form)
      if (missing.length > 0) {
        return `Cannot close ticket because the following columns are empty:\n\u2022 ${missing.join('\n\u2022 ')}`
      }
    }

    return null
  }



  const handleUnifiedEditSave = (draft: RelayEditDraft) => {
    const nextForm = mapRelayDraftToScheduleEditForm(draft, {
      ...editForm,
      id: editForm.id || editTicket?.id,
      acDetails: editForm.acDetails || editTicket?.acDetails || editTicket?.ac_details,
    })
    const error = validateEditFormFor(nextForm)
    if (error) {
      alert(error)
      return
    }
    setEditForm(nextForm)
    void commitSaveEditTicket(nextForm)
  }


  /** Resolve the ticket being edited even if a list refresh dropped it from `tickets`. */
  const resolveEditOriginalTicket = (): Ticket | null => {
    const formId = (editForm.id || '').trim()
    if (!formId) return null

    const fromList = tickets.find(t => t.id === formId)
    if (fromList) return fromList

    const fromOverview = overviewResults.find(t => t.id === formId)
    if (fromOverview) return fromOverview

    const fromOptimistic = optimisticTicketsRef.current.get(formId)
    if (fromOptimistic) return fromOptimistic

    const formTn = (editForm.ticketNumber || '').trim().toUpperCase()
    if (formTn) {
      const byNumber = tickets.find(t =>
        (t.ticketNumber || t.ticket_number || '').trim().toUpperCase() === formTn,
      )
      if (byNumber) return byNumber
      for (const t of optimisticTicketsRef.current.values()) {
        if ((t.ticketNumber || t.ticket_number || '').trim().toUpperCase() === formTn) return t
      }
    }

    // Modal still has the row data Ã¢â‚¬â€ save by id even if the list no longer holds it.
    if (!isTempTicketId(formId)) {
      return {
        id: formId,
        title: editForm.customerName || '',
        status: editForm.status || 'SCHEDULED',
        customerName: editForm.customerName,
        customer_name: editForm.customerName,
        contactPhone: editForm.contactPhone,
        contact_phone: editForm.contactPhone,
        location: editForm.location,
        district: editForm.district,
        commitTerms: editForm.commitTerms,
        commitType: editForm.commitTerms,
        unitType: editForm.unitType,
        dealer: editForm.dealer,
        installerName: editForm.installerName,
        negotiatorId: editForm.negotiatorId,
        branchId: editForm.branchId,
        ticketNumber: editForm.ticketNumber,
        ticket_number: editForm.ticketNumber,
        controlNumber: editForm.controlNumber,
        ticketCategory: editForm.ticketCategory,
        installationCharges: editForm.installationCharges,
        modeOfPayment: editForm.modeOfPayment,
        remarks: editForm.remarks,
        remarksUpdate: editForm.remarks,
        preferredDate: editForm.preferredDate,
        finalDate: editForm.finalDate,
        acDetails: editForm.acDetails,
      } as Ticket
    }

    return null
  }

  const commitSaveEditTicket = async (formOverride?: typeof editForm) => {
    const activeForm = formOverride || editForm
    if (!activeForm.id || editSaving) return
    const isReschedStatusEarly = (activeForm.status || '').toUpperCase() === 'RESCHED'
    const isReschedStatus = isReschedStatusEarly
    const scheduleVal = (activeForm.status || 'SCHEDULED').toUpperCase().replace(/\s+/g, '_')
    setEditSaving(true)
    try {
      const originalTicket = resolveEditOriginalTicket() || editTicket
      if (!originalTicket?.id) {
        throw new Error('Ticket not found Ã¢â‚¬â€ refresh the page and try again.')
      }
      if (activeForm.id !== originalTicket.id) {
        activeForm.id = originalTicket.id
      }

      const tokenVal = token()
      const category = activeForm.ticketCategory || 'INSTALLATION'
      const { serviceType, serviceVehicle } = parseServiceDriverValue(activeForm.serviceDriver, category)
      const titleVal = `${categoryDefaultServiceType(category)} service`
      const descVal = activeForm.commitTerms?.trim() || 'No additional details provided.'

      const oldDateKey = editOriginalDate?.split('T')[0]?.trim()
        || resolveTicketScheduleDateKey(originalTicket)
      // Final Date is the single source of truth for "where this ticket is" — used regardless of
      // status, including RESCHED (no more separate rescheduleToDate field/indirection). "Pending"
      // means no new date has been decided yet, so the ticket doesn't move.
      const newDateKey = (isReschedStatus && activeForm.reschedulePending)
        ? ''
        : resolveFormScheduleDateKey(activeForm)
      const isDateMove = Boolean(oldDateKey && newDateKey && oldDateKey !== newDateKey)
      const hadScheduleDate = Boolean(
        oldDateKey
        || (originalTicket && ticketHadScheduleDate(originalTicket)),
      )

      // A plain Final Date edit in this modal moves the ticket in place — it must not inject an
      // auto-generated "Scheduled moved from X" remark; the remarks field stays exactly what the
      // user typed. An explicit RESCHED status change still stamps "Moved to X" since that's a
      // distinct, deliberate reschedule action (not a routine date edit).
      let remarksVal = activeForm.remarks?.trim() ?? ''
      if (isDateMove && isReschedStatus && newDateKey) {
        remarksVal = `Moved to ${formatDateKeyLabel(newDateKey)}`
        activeForm.remarks = remarksVal
      }

      const acMetaExtras: Record<string, any> = {}

      const body: Record<string, any> = {
        customerName: (activeForm.customerName || '').trim().toUpperCase(),
        title: titleVal,
        description: descVal,
        serviceType,
        ticketCategory: category,
        location: (activeForm.location || '').trim().toUpperCase(),
        contactPhone: (activeForm.contactPhone || '').trim(),
        unitType: activeForm.unitType?.trim() || undefined,
        preferredDate: isReschedStatus && activeForm.reschedulePending
          ? (oldDateKey || activeForm.preferredDate?.split('T')[0]?.trim() || undefined)
          : newDateKey,
        dealer: activeForm.dealer?.trim() || 'Direct',
        district: activeForm.district?.trim() || undefined,
        commitType: activeForm.commitTerms?.trim() || undefined,
        serviceVehicle: serviceVehicle || undefined,
        driverName: activeForm.driverName?.trim() || undefined,
        installerName: activeForm.installerName?.trim() || undefined,
        negotiatorId: activeForm.negotiatorId,
        assignedTo: activeForm.negotiatorId,
        ticketNumber: activeForm.ticketNumber?.trim() || undefined,
        controlNumber: activeForm.controlNumber?.trim() || undefined,
        remarks: remarksVal,
        remarksUpdate: remarksVal,
      }

      const selectedNegotiator = branchEmployees.find(emp => emp.id === activeForm.negotiatorId)
      if (!selectedNegotiator && activeForm.negotiatorId) {
        alert('Selected negotiator was not found for this branch — re-select and try again.')
        return
      }
      // Overview edits tickets that may never have gone through relay assignment (completed/imported
      // rows with no negotiator) — only Schedules/My Tickets saves require picking one.
      if (!selectedNegotiator && activeTab !== 'overview') {
        alert('Select a negotiator for the assigned branch.')
        return
      }
      if (selectedNegotiator?.branchId && activeForm.branchId
        && !branchScopesMatch(selectedNegotiator.branchId, activeForm.branchId, selectedNegotiator.email)) {
        alert('Negotiator must belong to the assigned branch.')
        return
      }
      const explicitBranch = resolvePortalWriteBranchId(
        activeForm.branchId,
        selectedNegotiator?.email || user?.email,
        selectedNegotiator?.jobTitle || user?.jobTitle,
      ) || (activeForm.branchId || '').trim()
      if (explicitBranch) {
        body.branchId = explicitBranch
        body.branch_id = explicitBranch
      } else if (selectedNegotiator) {
        const negoBranchRaw = (selectedNegotiator.branchId || '').trim()
        if (negoBranchRaw) {
          body.branchId = resolvePortalWriteBranchId(negoBranchRaw, selectedNegotiator.email, selectedNegotiator.jobTitle) || negoBranchRaw
          body.branch_id = body.branchId
        }
      }

      const resolvedNegoName = resolveNegotiatorName(
        (originalTicket || activeForm) as Ticket,
        branchEmployees,
        activeForm.negotiatorId,
      )
      if (resolvedNegoName) body.negotiatorName = resolvedNegoName

      const leavingResched = !isReschedStatus && ticketHasRescheduleMeta(originalTicket)

      if (isReschedStatus) {
        body.status = 'RESCHED'
        if (activeForm.reschedulePending) {
          acMetaExtras.reschedulePending = true
          if (!remarksVal) {
            remarksVal = 'PENDING'
            body.remarks = remarksVal
            body.remarksUpdate = remarksVal
          }
        } else {
          acMetaExtras.reschedulePending = false
        }
      } else if (isDateMove && !leavingResched) {
        body.status = 'SCHEDULED'
      } else {
        const statusPatch = applyScheduleStatusPatch((originalTicket || activeForm) as Ticket, scheduleVal)
        Object.assign(body, statusPatch)
        // The status patch can correct ticketCategory (e.g. picking CHECKUP/BACKJOB resolves to
        // SERVICES) after `titleVal` above was already built from the pre-patch category — left
        // alone, body.title keeps saying "Survey & Install service" while ticketCategory says
        // SERVICES, and anything that infers ticket type from title text (formatRelayTicketTypeShort,
        // Relays' getCategoryLabel) shows the stale "SURVEY & INSTALL" instead of the real type.
        if (typeof statusPatch.ticketCategory === 'string' && statusPatch.ticketCategory !== category) {
          body.title = `${categoryDefaultServiceType(statusPatch.ticketCategory as TicketCategoryValue)} service`
        }
        // Status patch auto-clears stale "Moved to…"/PENDING placeholder remarks — but only
        // apply that when the user didn't just type fresh remarks in this save, otherwise it
        // silently discards what they typed (e.g. any ticket whose remark was left as "PENDING").
        const originalRemarks = String(originalTicket?.remarksUpdate || originalTicket?.remarks || '').trim()
        const userTypedNewRemarks = remarksVal !== originalRemarks
        if (!userTypedNewRemarks) {
          if (typeof body.remarksUpdate === 'string') remarksVal = body.remarksUpdate
          else if (typeof body.remarks === 'string') remarksVal = body.remarks
          if (body.remarksUpdate === '') {
            remarksVal = ''
            body.remarks = ''
            body.remarksUpdate = ''
          }
        } else {
          body.remarks = remarksVal
          body.remarksUpdate = remarksVal
        }
      }

      const statusOutcome = typeof body.scheduleOutcome === 'string' ? body.scheduleOutcome : ''
      const statusAcMeta = typeof body.acDetails === 'string'
        ? parseAcMeta({ acDetails: body.acDetails } as Ticket)
        : {}

      const finalDateKey = activeForm.finalDate?.split('T')[0]?.trim() || ''

      const paymentCharges = activeForm.installationCharges ?? originalTicket?.installationCharges ?? originalTicket?.installation_charges
      const paymentMode = activeForm.modeOfPayment ?? originalTicket?.modeOfPayment ?? originalTicket?.mode_of_payment
      if (isNoPaymentMode(activeForm.modeOfPayment)) {
        // Explicit No Payment toggle — clear so PAYMENT column stays blank after save/reload.
        body.modeOfPayment = 'NO_PAYMENT'
        body.installationCharges = null
        acMetaExtras.modeOfPayment = ''
        acMetaExtras.paymentMode = ''
        acMetaExtras.paymentStatus = ''
        acMetaExtras.installationCharges = ''
      } else {
        if (paymentCharges != null && !Number.isNaN(Number(paymentCharges))) {
          body.installationCharges = Number(paymentCharges)
        }
        if (paymentMode) body.modeOfPayment = paymentMode
      }

      if (finalDateKey) {
        body.finalDate = finalDateKey
        body.preferredDate = activeForm.preferredDate || finalDateKey
        const origStat = (originalTicket?.status || '').toUpperCase()
        const bodyStat = String(body.status || '').toUpperCase()
        if (
          !isReschedStatus
          && ['PENDING', 'ASSIGNED'].includes(origStat)
          && !isDateMove
          && bodyStat !== 'COMPLETED'
          && bodyStat !== 'CANCELLED'
        ) {
          body.status = 'SCHEDULED'
        }
      } else if (!isReschedStatus && !hadScheduleDate && String(body.status || '').toUpperCase() === 'SCHEDULED') {
        // Picking a pending field-type sub-status (CLEANING/CHECKUP/BACKJOB/INSTALLATION/SERVICES)
        // always resolves body.status to SCHEDULED regardless of whether a date was actually
        // picked — a ticket with no final date must show PENDING, not SCHEDULED (that implies
        // day-of Schedules placement) and not ASSIGNED (this is what the field-type buttons used
        // to fall back to before — status must read PENDING until a real date is chosen).
        body.status = 'PENDING'
      }

      const schedulePlacementDate = finalDateKey || newDateKey

      const isReturningToMyTickets = !isReschedStatus
        && !finalDateKey
        && hadScheduleDate
        && !CLOSING_SCHEDULE_STATUSES.has(scheduleVal)
        && scheduleVal !== 'COMPLETED'
        && scheduleVal !== 'CANCELLED'
      if (isReturningToMyTickets && originalTicket) {
        applyReturnToNegotiatorMyTicketsPatch(originalTicket, body, acMetaExtras)
      }

      // Persist branch anchor for cancelled Schedules ghosts (survives legacy branchId clears).
      if (String(body.status || scheduleVal || '').toUpperCase() === 'CANCELLED') {
        const cancelBranch = resolveScopedBranchId(
          body.branchId || body.branch_id || activeForm.branchId || originalTicket?.branchId || originalTicket?.branch_id,
        )
        if (cancelBranch) {
          body.branchId = cancelBranch
          body.branch_id = cancelBranch
          acMetaExtras.cancelledBranchId = cancelBranch
        }
      }

      // A normal date move just updates finalDate/scheduledDate in place (set below) — no ghost
      // row or reschedule history is written for it anymore.
      if (isDateMove && !leavingResched) {
        acMetaExtras.reschedulePending = false
      }

      // Leaving RESCHED for Installation/etc. Ã¢â‚¬â€ never re-apply ghost-date metadata
      if (leavingResched) {
        acMetaExtras.reschedulePending = false
        if (isMovedToRescheduleRemark(remarksVal || '') || /^PENDING$/i.test((remarksVal || '').trim())) {
          remarksVal = ''
          body.remarks = ''
          body.remarksUpdate = ''
        }
      }

      const acBaseTicket = (typeof body.acDetails === 'string'
        ? { ...(originalTicket || activeForm), acDetails: body.acDetails }
        : (originalTicket || activeForm)) as Ticket

      // Referral fee / rebates / warranty-registration / unit-detail fields only exist on
      // activeForm when this save came from RelayEditTicketModal (overview tab, via
      // mapRelayDraftToScheduleEditForm). Only include a key here when it was actually
      // provided — spreading an explicit `undefined` would still shadow the prior acDetails
      // value once JSON.stringify drops it, wiping the field on every plain Schedules save.
      const overviewAcExtras: Record<string, unknown> = {}
      if (activeForm.robinsonsTransactionId !== undefined) overviewAcExtras.robinsonsTransactionId = activeForm.robinsonsTransactionId
      if (activeForm.landmarks !== undefined) overviewAcExtras.landmarks = activeForm.landmarks
      if (activeForm.capacity !== undefined) overviewAcExtras.capacity = activeForm.capacity
      if (activeForm.sku !== undefined) overviewAcExtras.sku = activeForm.sku
      if (activeForm.serialNumber !== undefined) overviewAcExtras.serialNumber = activeForm.serialNumber
      if (activeForm.relayedDate !== undefined) overviewAcExtras.relayedDate = activeForm.relayedDate
      if (activeForm.alternatePhone !== undefined) overviewAcExtras.alternatePhone = activeForm.alternatePhone
      if (activeForm.referralRecipient !== undefined) {
        overviewAcExtras.promodiserName = activeForm.referralRecipient
        overviewAcExtras.referralFeeRecipient = activeForm.referralRecipient
      }
      if (activeForm.referralAmount !== undefined || activeForm.storeReferralFee !== undefined) {
        overviewAcExtras.referralFeeAmount = activeForm.referralAmount || activeForm.storeReferralFee
      }
      if (activeForm.referralStatus !== undefined) overviewAcExtras.referralFeeStatus = activeForm.referralStatus
      if (activeForm.referralDatePaid !== undefined) overviewAcExtras.referralFeeDatePaid = activeForm.referralDatePaid
      if (activeForm.referralReferenceNo !== undefined) overviewAcExtras.referralFeeReferenceNo = activeForm.referralReferenceNo
      if (activeForm.rebatesClaim !== undefined) overviewAcExtras.forRebatesClaim = activeForm.rebatesClaim
      if (activeForm.rebatesCompany !== undefined) overviewAcExtras.rebatesCompany = activeForm.rebatesCompany
      if (activeForm.rebatesAmountDue !== undefined) overviewAcExtras.rebatesAmountDue = activeForm.rebatesAmountDue
      if (activeForm.rebatesStatus !== undefined) overviewAcExtras.rebatesStatus = activeForm.rebatesStatus
      if (activeForm.rebatesReferenceNo !== undefined) overviewAcExtras.rebatesReferenceNo = activeForm.rebatesReferenceNo
      if (activeForm.warrantyStatus !== undefined) overviewAcExtras.warrantyRegistrationStatus = activeForm.warrantyStatus
      if (activeForm.warrantyRegisteredBy !== undefined) overviewAcExtras.warrantyRegisteredBy = activeForm.warrantyRegisteredBy
      if (activeForm.storeReferralFee !== undefined || activeForm.referralAmount !== undefined) {
        const fee = (activeForm.referralAmount || activeForm.storeReferralFee || '').trim()
        body.storeReferralFee = fee ? fee : '0'
      }
      if (activeForm.warrantyStatus !== undefined) {
        body.warrantyDocsStatus = activeForm.warrantyStatus || null
      }

      body.acDetails = mergeAcMeta(acBaseTicket, {
        ...acMetaExtras,
        ...overviewAcExtras,
        destination: activeForm.location.trim(),
        address: activeForm.location.trim(),
        district: activeForm.district?.trim() || undefined,
        brand: activeForm.unitType?.trim() || undefined,
        unitType: activeForm.unitType?.trim() || undefined,
        dealer: activeForm.dealer?.trim() || undefined,
        dlr: activeForm.dealer?.trim() || undefined,
        update: remarksVal || '',
        remarksUpdate: remarksVal || '',
        driverName: activeForm.driverName?.trim() || undefined,
        driver_name: activeForm.driverName?.trim() || undefined,
        serviceVehicle: serviceVehicle || undefined,
        service_vehicle: serviceVehicle || undefined,
        installerName: activeForm.installerName?.trim() || undefined,
        negotiatorId: activeForm.negotiatorId,
        negotiatorName: resolveNegotiatorName(
          (originalTicket || activeForm) as Ticket,
          branchEmployees,
          activeForm.negotiatorId,
        ) || undefined,
        finalDate: finalDateKey,
        scheduledDate: schedulePlacementDate,
        scheduleOutcome: statusOutcome || statusAcMeta.scheduleOutcome || '',
        schedulePhase: statusAcMeta.schedulePhase ?? '',
        ...(leavingResched
          ? { reschedulePending: false }
          : {}),
      })

      if (String(body.status || '').toUpperCase() === 'COMPLETED') {
        const outcome = (statusOutcome || String(statusAcMeta.scheduleOutcome || '') || 'DONE_INSTALLED') as ScheduleOutcome
        body.scheduleOutcome = outcome
        body.acDetails = mergeAcMeta({ ...activeForm, acDetails: body.acDetails } as Ticket, {
          scheduleOutcome: outcome,
          schedulePhase: '',
        })
      }

      const shouldComplete = Boolean(
        originalTicket
        && !isReschedStatus
        && !isDateMove
        && (originalTicket.status || '').toUpperCase() !== 'COMPLETED'
        && (
          CLOSING_SCHEDULE_STATUSES.has(scheduleVal)
          || scheduleVal === 'COMPLETED'
          || wantsTicketArchive(
            { ...originalTicket, ...body, remarksUpdate: body.remarksUpdate, remarks: body.remarks },
            { ...body, remarksUpdate: body.remarksUpdate, remarks: body.remarks, installationCharges: body.installationCharges, modeOfPayment: body.modeOfPayment },
          )
        ),
      )

      let finalBody: Record<string, any> = body
      if (shouldComplete && originalTicket) {
        const schedKey = oldDateKey || resolveScheduleCompletionDateKey(originalTicket, dateFilter)
        const ticketWithEdits = { ...originalTicket, ...body, acDetails: body.acDetails }
        finalBody = enrichCompletePatchBody({ ...body }, ticketWithEdits, schedKey)
      }

      const archiveOriginal = originalTicket
      const archiveFinalBody = finalBody
      const archiveBody = body
      const needsArchive = shouldComplete && shouldArchiveCompletedSchedule(originalTicket, finalBody)
      const schedKey = oldDateKey || resolveScheduleCompletionDateKey(originalTicket, dateFilter) || todayDateKey()

      void queueTicketPatch(
        originalTicket,
        finalBody,
        needsArchive
          ? async () => {
            const branchId = resolveTicketArchiveBranch(
              { ...archiveOriginal, ...archiveBody },
              { installerName: archiveBody.installerName as string | undefined },
            )
            const archivePayload = buildArchiveServiceReportPayload(
              archiveOriginal,
              branchId,
              {
                customerName: archiveBody.customerName,
                location: archiveBody.location,
                contactPhone: archiveBody.contactPhone,
                district: archiveBody.district,
                commitType: archiveBody.commitType,
                dealer: archiveBody.dealer,
                unitType: archiveBody.unitType,
                installerName: archiveBody.installerName,
                serviceVehicle: archiveBody.serviceVehicle,
                installationCharges: archiveFinalBody.installationCharges as number | undefined,
                modeOfPayment: archiveFinalBody.modeOfPayment as string | undefined,
                remarks: archiveFinalBody.remarksUpdate as string | undefined,
                remarksUpdate: archiveFinalBody.remarksUpdate as string | undefined,
                controlNumber: archiveBody.controlNumber,
                ticketNumber: archiveBody.ticketNumber,
                note: archiveOriginal.note,
                negotiatorName: resolveNegotiatorName(archiveOriginal, branchEmployees, activeForm.negotiatorId),
              },
              schedKey,
            )
            if (!archivePayload) {
              alert('Ticket marked completed but not added to Archives Ã¢â‚¬â€ select a branch (e.g. Taguig Sales) in the sidebar, then add the record manually in Archives.')
              return
            }
            try {
              await postArchiveServiceReport(archivePayload, tokenVal)
            } catch (err) {
              console.warn('Archive service report failed:', err)
              alert(`Ticket saved as completed but Archives entry failed: ${formatFetchError(err)}`)
            }
          }
          : undefined,
      )

      setEditForm(activeForm)
      closeEditModal()
      showToast(isReturningToMyTickets && !isMyTickets ? 'Returned to My Tickets' : 'Saved')
    } catch (err: unknown) {
      console.error(err)
      alert(`Could not update ticket: ${formatFetchError(err)}`)
    } finally {
      setEditSaving(false)
    }
  }

  const resolveImportBranchId = useCallback((ticketBranchId?: string) => {
    if (ticketBranchId) {
      return resolveTicketArchiveBranchId({ branchId: ticketBranchId })
    }
    const branchEmployee = isEmployee && !isAdmin && !isManager
    const branchSource = branchEmployee
      ? (user?.branchId || localStorage.getItem('ashcol-global-branch-id'))
      : (globalBranchId || user?.branchId || localStorage.getItem('ashcol-global-branch-id'))
    return resolvePortalWriteBranchId(branchSource, user?.email, user?.jobTitle)
  }, [globalBranchId, user?.branchId, user?.email, user?.jobTitle, isEmployee, isAdmin, isManager])

  const resolveTicketArchiveBranch = useCallback((ticket: Ticket, fields?: Partial<Ticket>) =>
    resolveTicketArchiveBranchId(
      { ...ticket, ...fields },
      installerLineupIndex,
      driverOnlyNames,
      globalBranchId,
      user?.branchId,
      typeof localStorage !== 'undefined' ? localStorage.getItem('ashcol-global-branch-id') : null,
    ),
    [installerLineupIndex, driverOnlyNames, globalBranchId, user?.branchId])

  const handleApplyImport = () => {
    if (!importResults) return
    if (!importTargetDate?.trim()) {
      alert('Select an import date first Ã¢â‚¬â€ tickets will be saved as SCHEDULED for that date.')
      return
    }

    const tokenVal = token()
    const todayStr = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

    const targetBranch = resolveImportBranchId()
    const importerUserId = user?.id
    const importOpts = { taguigServices: isTaguigServices, branchId: targetBranch || undefined, negotiatorId: importerUserId || undefined }
    const scheduleDate = importTargetDate?.trim() || ''
    const isScheduleImport = scheduleDate.length > 0

    const normalUpdates = importResults.updates.filter(item => item.updatedFields.status !== 'COMPLETED')
    const completedUpdates = importResults.updates.filter(item => item.updatedFields.status === 'COMPLETED')

    if (!targetBranch && (importResults.unmatched.length > 0 || (completedUpdates.length > 0 && !isScheduleImport))) {
      alert('Select a branch before importing Ã¢â‚¬â€ use the branch selector in the sidebar.')
      return
    }

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
      const branchId = resolveTicketArchiveBranch(ticket, updatedFields)
      const merged = { ...ticket, ...updatedFields }
      const payload = buildArchiveServiceReportPayload(ticket, branchId, {
        customerName: updatedFields.customerName,
        location: updatedFields.location,
        contactPhone: updatedFields.contactPhone,
        district: updatedFields.district,
        commitType: updatedFields.commitType,
        dealer: updatedFields.dealer,
        unitType: updatedFields.unitType,
        installerName: updatedFields.installerName,
        serviceVehicle: updatedFields.serviceVehicle,
        installationCharges: updatedFields.installationCharges,
        modeOfPayment: updatedFields.modeOfPayment,
        remarksUpdate: updatedFields.remarksUpdate,
        remarks: updatedFields.remarks,
        controlNumber: updatedFields.controlNumber,
        ticketNumber: updatedFields.ticketNumber,
        note: updatedFields.note,
        negotiatorName: resolveNegotiatorName(merged, branchEmployees, updatedFields.negotiatorId),
      }, reportDate)
      if (!payload) throw new Error('No branch selected for archive')
      await postArchiveServiceReport(payload, tokenVal)
    }

    type ImportPatchJob = {
      ticket: Ticket
      body: Record<string, unknown>
      shouldComplete: boolean
      updatedFields: Partial<Ticket>
    }
    const patchJobs: ImportPatchJob[] = []

    for (const item of scheduleUpdates) {
      const { ticket, updatedFields } = item
      const merged = { ...ticket, ...updatedFields }
      const shouldComplete = qualifiesForInstallComplete(merged, updatedFields)
        || (updatedFields.status || '').toUpperCase() === 'COMPLETED'

      let body = buildPatchImportBody(
        ticket,
        updatedFields,
        scheduleDate || undefined,
        importerUserId,
        isTaguigServices && targetBranch ? targetBranch : undefined,
      )
      if (Object.keys(body).length === 0 && !shouldComplete) continue

      if (shouldComplete && isScheduleImport) {
        body = enrichCompletePatchBody({ ...body }, ticket, scheduleDate || resolveScheduleCompletionDateKey(ticket, scheduleDate))
      }
      patchJobs.push({ ticket, body, shouldComplete: shouldComplete && isScheduleImport, updatedFields })
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
          isTaguigServices && targetBranch ? targetBranch : undefined,
        )
        if (Object.keys(body).length === 0) continue
        patchJobs.push({ ticket, body, shouldComplete: false, updatedFields: { remarksUpdate: value, status: 'SCHEDULED' } })
      }
    }

    const unmatchedToCreate = isScheduleImport
      ? importResults.unmatched
      : importResults.unmatched.filter(item => !isUnmatchedImportComplete(item))
    const unmatchedToComplete = isScheduleImport
      ? []
      : importResults.unmatched.filter(item => isUnmatchedImportComplete(item))

    const createRows = unmatchedToCreate.map(item => buildImportCreateRow(item, scheduleDate || undefined, importOpts))
    const createTemps = createRows.map((row, index) => {
      const tempId = `temp-import-${Date.now()}-${index}`
      const optimisticTicket = {
        id: tempId,
        ...row,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Ticket
      return { tempId, row, optimisticTicket }
    })

    // Instant UI: apply all patches + new rows, then close import modal
    for (const job of patchJobs) {
      queueTicketPatch(
        job.ticket,
        job.body,
        job.shouldComplete
          ? async () => {
            try {
              await postCompletedServiceReport(job.ticket, job.updatedFields, scheduleDate || todayStr)
              console.log('[Schedules] Import archived completed ticket', { ticketId: job.ticket.id })
            } catch (err: unknown) {
              console.error('[Schedules] Import archive FAILED', job.ticket.id, err)
            }
          }
          : undefined,
      )
    }
    for (const created of createTemps) {
      applyTicketLocally(created.tempId, created.optimisticTicket)
    }

    // Non-schedule complete paths: remove from list instantly, archive+delete in background
    const removeJobs: { ticket: Ticket; rollback: Ticket; run: () => Promise<void> }[] = []
    if (!isScheduleImport) {
      for (const item of completedUpdates) {
        const { ticket, updatedFields } = item
        const merged = { ...ticket, ...updatedFields }
        const branchId = resolveTicketArchiveBranch(ticket, updatedFields)
        const archivePayload = buildArchiveServiceReportPayload(ticket, branchId, {
          location: updatedFields.location,
          district: updatedFields.district,
          dealer: updatedFields.dealer,
          unitType: updatedFields.unitType,
          installerName: updatedFields.installerName,
          serviceVehicle: updatedFields.serviceVehicle,
          installationCharges: updatedFields.installationCharges,
          modeOfPayment: updatedFields.modeOfPayment,
          remarksUpdate: updatedFields.remarksUpdate,
          remarks: updatedFields.remarks,
          controlNumber: updatedFields.controlNumber,
          ticketNumber: updatedFields.ticketNumber,
          note: updatedFields.note,
          negotiatorName: resolveNegotiatorName(merged, branchEmployees, updatedFields.negotiatorId),
        }, importTargetDate || todayStr)
        removeJobs.push({
          ticket,
          rollback: ticket,
          run: async () => {
            if (!archivePayload) throw new Error('No branch selected for archive')
            await postArchiveServiceReport(archivePayload, tokenVal)
            const deleteRes = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${tokenVal}` },
            })
            if (!deleteRes.ok) throw new Error(await readApiError(deleteRes))
          },
        })
      }
      for (const item of importResults.needsConfirmation) {
        const { ticket, value, amount, modeOfPayment, controlNumber } = item
        const branchId = resolveTicketArchiveBranch(ticket, {
          installationCharges: parseFloat(amount) || 0,
          modeOfPayment,
        })
        const archivePayload = buildArchiveServiceReportPayload(
          ticket,
          branchId,
          {
            installationCharges: parseFloat(amount) || 0,
            modeOfPayment: modeOfPayment,
            remarks: value || 'Installed',
            remarksUpdate: value || 'Installed',
            controlNumber,
            negotiatorName: resolveNegotiatorName(ticket, branchEmployees),
          },
          importTargetDate || todayStr,
        )
        removeJobs.push({
          ticket,
          rollback: ticket,
          run: async () => {
            if (!archivePayload) throw new Error('No branch selected for archive')
            await postArchiveServiceReport(archivePayload, tokenVal)
            const deleteRes = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${tokenVal}` },
            })
            if (!deleteRes.ok) throw new Error(await readApiError(deleteRes))
          },
        })
      }
    }

    for (const job of removeJobs) {
      optimisticTicketsRef.current.delete(job.ticket.id)
      setTickets(prev => {
        const next = prev.filter(t => t.id !== job.ticket.id)
        const cacheKey = schedulesCacheKeyForTab()
        writeSchedulesTabCache(cacheKey, next, 'local')
        return next
      })
    }

    setImportResults(null)
    if (scheduleDate) handleDateFilterChange(scheduleDate)
    console.log('[Schedules] Import applied on UI Ã¢â‚¬â€ saving to database in background', {
      patches: patchJobs.length,
      creates: createTemps.length,
      removals: removeJobs.length,
    })

    void (async () => {
      let successCount = patchJobs.length
      let completeCount = 0
      let failCount = 0
      let createdCount = 0
      const importErrors: string[] = []

      // Patches are already queued via queueTicketPatch (each logs on success)

      if (createTemps.length > 0) {
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
              rows: createTemps.map(item => item.row),
            }),
          })
          if (res.ok) {
            const data = await res.json()
            const result = data?.data
            const createdTickets: Array<Ticket | null> = Array.isArray(result?.tickets) ? result.tickets : []
            createdCount += typeof result?.created === 'number'
              ? result.created
              : createdTickets.filter(t => t?.id).length
            if (result?.failed) {
              failCount += result.failed
              if (Array.isArray(result.errors) && result.errors.length > 0) {
                importErrors.push(...result.errors)
              }
            }
            console.log('[Schedules] Import created tickets in database', {
              created: createdCount,
              failed: result?.failed ?? 0,
              ticketNumbers: createdTickets
                .filter((t): t is Ticket => Boolean(t?.id))
                .map(t => t.ticketNumber || t.ticket_number),
            })

            // Swap temp-import-* rows for real server tickets (id + unique ticket number).
            // Carry any cell edits made while create was in flight; delete if user removed the row.
            const deferredDeletes: string[] = []
            const flushIds: string[] = []
            const tempIds = new Set(createTemps.map(c => c.tempId))
            const replacements = new Map<string, Ticket>()

            for (let i = 0; i < createTemps.length; i++) {
              const { tempId } = createTemps[i]
              const created = createdTickets[i]

              if (!created?.id) {
                pendingSavesRef.current.delete(tempId)
                activeSavesRef.current.delete(tempId)
                optimisticTicketsRef.current.delete(tempId)
                deletedTicketsRef.current.delete(tempId)
                continue
              }

              const promoted = promoteTempTicketState(
                tempId,
                created,
                pendingSavesRef.current,
                activeSavesRef.current,
                optimisticTicketsRef.current,
                deletedTicketsRef.current,
              )

              if (promoted.wasDeleted) {
                deferredDeletes.push(created.id)
                continue
              }

              replacements.set(tempId, promoted.ticket)
              if (promoted.shouldFlush) flushIds.push(created.id)
            }

            setTickets(prev => {
              const usedRealIds = new Set<string>()
              const next: Ticket[] = []
              for (const t of prev) {
                if (tempIds.has(t.id)) {
                  const real = replacements.get(t.id)
                  if (real && !usedRealIds.has(real.id)) {
                    usedRealIds.add(real.id)
                    next.push(real)
                  }
                  continue
                }
                if (usedRealIds.has(t.id)) continue
                next.push(t)
              }
              for (const real of replacements.values()) {
                if (!usedRealIds.has(real.id)) {
                  usedRealIds.add(real.id)
                  next.unshift(real)
                }
              }
              const cacheKey = schedulesCacheKeyForTab()
              writeSchedulesTabCache(cacheKey, next, 'local')
              return next
            })

            for (const realId of flushIds) {
              flushTicketSaveRef.current(realId)
            }

            for (const realId of deferredDeletes) {
              try {
                const deleteRes = await fetch(`${API_BASE_URL}/tickets/${realId}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${tokenVal}` },
                })
                if (!deleteRes.ok) throw new Error(await readApiError(deleteRes))
              } catch (err: unknown) {
                console.error('[Schedules] Deferred delete of imported ticket FAILED', realId, err)
              }
            }
          } else {
            failCount += createTemps.length
            importErrors.push(await readApiError(res))
            for (const created of createTemps) {
              pendingSavesRef.current.delete(created.tempId)
              activeSavesRef.current.delete(created.tempId)
              optimisticTicketsRef.current.delete(created.tempId)
              deletedTicketsRef.current.delete(created.tempId)
            }
            setTickets(prev => {
              const tempIds = new Set(createTemps.map(c => c.tempId))
              const next = prev.filter(t => !tempIds.has(t.id))
              const cacheKey = schedulesCacheKeyForTab()
              writeSchedulesTabCache(cacheKey, next, 'local')
              return next
            })
            console.error('[Schedules] Import create FAILED', importErrors)
          }
        } catch (err: unknown) {
          console.error('[Schedules] Import create FAILED', err)
          failCount += createTemps.length
          importErrors.push(formatFetchError(err))
          for (const created of createTemps) {
            pendingSavesRef.current.delete(created.tempId)
            activeSavesRef.current.delete(created.tempId)
            optimisticTicketsRef.current.delete(created.tempId)
            deletedTicketsRef.current.delete(created.tempId)
          }
          setTickets(prev => {
            const tempIds = new Set(createTemps.map(c => c.tempId))
            const next = prev.filter(t => !tempIds.has(t.id))
            const cacheKey = schedulesCacheKeyForTab()
            writeSchedulesTabCache(cacheKey, next, 'local')
            return next
          })
        }
      }

      for (const job of removeJobs) {
        try {
          await job.run()
          completeCount++
          console.log('[Schedules] Import completed & archived ticket in database', { ticketId: job.ticket.id })
        } catch (err: unknown) {
          failCount++
          importErrors.push(formatFetchError(err))
          restoreTicketLocally(job.ticket.id, job.rollback)
          console.error('[Schedules] Import complete FAILED', job.ticket.id, err)
        }
      }

      for (const item of unmatchedToComplete) {
        const charges = item.charges ?? 0
        const mode = item.paymentMode || 'CASH'
        const remarks = item.update || 'Installed'
        const controlNo = item.controlNo || ''
        const archiveBranch = resolveTicketArchiveBranchId(
          { installerName: item.installer },
          installerLineupIndex,
          driverOnlyNames,
        ) || targetBranch

        const serviceReportPayload = {
          branchId: archiveBranch,
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
          serviceColumn: item.service || '',
        }

        try {
          const reportRes = await fetch(`${API_BASE_URL}/v1/service-reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
            body: JSON.stringify(serviceReportPayload),
          })
          if (reportRes.ok) {
            completeCount++
            console.log('[Schedules] Import archived unmatched ticket in database', { customerName: item.name })
          } else {
            failCount++
            importErrors.push(await readApiError(reportRes))
          }
        } catch (err: unknown) {
          failCount++
          importErrors.push(formatFetchError(err))
          console.error('[Schedules] Import unmatched complete FAILED', err)
        }
      }

      clearRelaysCache()
      clearWarrantyCache()
      console.log('[Schedules] Import background sync finished', {
        updated: successCount,
        created: createdCount,
        completed: completeCount,
        failed: failCount,
      })
      if (failCount > 0) {
        alert(`Import finished with ${failCount} error(s).${importErrors[0] ? ` First: ${importErrors[0]}` : ''}`)
      }
    })()
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Cell edit / expand Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})
  const [editingCell, setEditingCell] = useState<{ ticketId: string; rowIndex: number; colLabel: string; value: string } | null>(null)
  const [statusPicker, setStatusPicker] = useState<{
    ticket: Ticket
    mode: 'inline' | 'edit-form'
    x: number
    y: number
  } | null>(null)
  const [scheduleDetailsPopup, setScheduleDetailsPopup] = useState<{
    ticket: Ticket
    x: number
    y: number
    ghostKind?: 'completed' | 'resched' | 'cancelled' | null
  } | null>(null)
  const [finalDatePicker, setFinalDatePicker] = useState<{
    ticket: Ticket
    x: number
    y: number
    value: string
    preferredDate: string
  } | null>(null)
  const [finalDateCalMonth, setFinalDateCalMonth] = useState<{ year: number; month: number } | null>(null)
  // Which ticket ids currently have a PATCH in flight — drives the row-level "Saving…" indicator.
  const [savingTicketIds, setSavingTicketIds] = useState<Set<string>>(new Set())
  const cellEditBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cellEditDraftRef = useRef<{ ticketId: string; rowIndex: number; colLabel: string; value: string } | null>(null)
  const saveCellEditRef = useRef<(ticket: Ticket, colLabel: string, value: string, injectedPayment?: { amount: number; modeOfPayment: string }) => void>(() => { })
  const commitCellEditRef = useRef<() => void>(() => { })
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const toggleCol = useCallback((label: string) =>
    setExpandedCols(p => ({ ...p, [label]: !p[label] })), [])

  const activeCellOverlay = Boolean(editingCell || expandedCell)

  useEffect(() => {
    const target = editingCell || expandedCell
    if (!target) return
    const timer = setTimeout(() => {
      const el = tableScrollRef.current?.querySelector(
        `[data-cell-key="${target.ticketId}:${target.colLabel}"]`,
      )
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }, 40)
    return () => clearTimeout(timer)
  }, [editingCell, expandedCell])

  useEffect(() => {
    if (!expandedCell) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const popover = document.querySelector('[data-expanded-popover="true"]')
      if (popover?.contains(target)) return
      const cell = document.querySelector(
        `[data-cell-key="${expandedCell.ticketId}:${expandedCell.colLabel}"]`,
      )
      if (cell?.contains(target)) return
      setExpandedCell(null)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedCell(null)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expandedCell])

  useLayoutEffect(() => {
    if (!expandedCell) {
      setExpandedPopoverPos(null)
      return
    }

    const position = () => {
      const cell = document.querySelector(
        `[data-cell-key="${expandedCell.ticketId}:${expandedCell.colLabel}"]`,
      ) as HTMLElement | null
      if (!cell) return
      const align: 'left' | 'center' | 'right' =
        expandedCell.colLabel === 'UPDATE' || expandedCell.colLabel === 'PAYMENT'
          ? 'right'
          : expandedCell.colLabel === 'DESTINATION'
            ? 'left'
            : 'left'
      const anchor = cell.getBoundingClientRect()
      const baseW = Math.min(380, window.innerWidth - 16)
      const popover = document.querySelector('[data-expanded-popover="true"]') as HTMLElement | null
      const h = popover?.offsetHeight || 120
      setExpandedPopoverPos(computeSafePopoverPosition(anchor, baseW, h, align))
    }

    position()
    const raf = requestAnimationFrame(position)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [expandedCell])



  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Column config Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const columns = useMemo(() => {
    const scheduleCols = [
      { label: 'TICKET NO', display: 'TICKET NO', weight: 9, expMul: 1.2, sticky: true, freeze: false, align: 'center' as const },
      { label: "CUSTOMER'S NAME", display: "CUSTOMER", weight: 15, expMul: 1.5, sticky: true, freeze: false, align: 'left' as const },
      { label: 'DESTINATION', display: 'DISTRICT', weight: 8, expMul: 1.5, sticky: true, freeze: true, align: 'center' as const, sortable: true },
      { label: 'BRAND', display: "BRAND", weight: 11, expMul: 1.5, sticky: false, freeze: false, align: 'center' as const },
      { label: 'DLR', display: isTaguigServices ? "ENDORSED BY" : "DEALER", weight: 10, expMul: 1.4, sticky: false, freeze: false, align: 'center' as const },
      { label: 'COMMIT', display: "COMMIT", weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'NEGOTIATOR', display: 'NEGOTIATOR', weight: 8, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'INSTALLER', display: isTaguigServices ? "TECHNICIAN" : "INSTALLER", weight: 10, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'SERVICE', display: "DRIVER", weight: 9, expMul: 1.3, sticky: false, freeze: false, align: 'center' as const },
      { label: 'VEHICLE', display: "VEHICLE", weight: 9, expMul: 1.2, sticky: false, freeze: false, align: 'center' as const },
      { label: 'STATUS', display: "STATUS", weight: 13, expMul: 1.3, sticky: false, freeze: false, align: 'center' as const },
      { label: 'UPDATE', display: "REMARKS", weight: 14, expMul: 1.55, sticky: false, freeze: false, align: 'right' as const },
      { label: 'PAYMENT', display: "PAYMENT", weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'right' as const },
    ]
    const myTicketsCols = [
      { label: 'TICKET NO', display: 'TICKET NO', weight: 9, expMul: 1.2, sticky: true, freeze: false, align: 'center' as const },
      { label: "CUSTOMER'S NAME", display: 'CUSTOMER', weight: 14, expMul: 1.5, sticky: true, freeze: false, align: 'left' as const },
      { label: 'DESTINATION', display: 'DISTRICT', weight: 8, expMul: 1.5, sticky: true, freeze: true, align: 'center' as const, sortable: true },
      { label: 'BRAND', display: 'BRAND', weight: 10, expMul: 1.45, sticky: false, freeze: false, align: 'center' as const },
      { label: 'DLR', display: isTaguigServices ? 'ENDORSED BY' : 'DEALER', weight: 9, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'COMMIT', display: 'COMMIT', weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'NEGOTIATOR', display: 'NEGOTIATOR', weight: 8, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const, sortable: true },
      { label: 'SERVICE', display: 'TYPE', weight: 8, editHint: true, expMul: 1.25, sticky: false, freeze: false, align: 'center' as const },
      { label: 'STATUS', display: 'STATUS', weight: 12, expMul: 1.25, sticky: false, freeze: false, align: 'center' as const },
      { label: 'UPDATE', display: 'REMARKS', weight: 13, expMul: 1.5, sticky: false, freeze: false, align: 'right' as const },
      { label: 'FINAL DATE', display: 'FINAL DATE', weight: 10, expMul: 1.3, sticky: false, freeze: false, align: 'center' as const },
    ]
    const raw = isMyTickets ? myTicketsCols : scheduleCols
    const weights = raw.map(c => c.weight * (expandedCols[c.label] ? c.expMul : 1))
    const totalWeight = weights.reduce((s, w) => s + w, 0)
    let left = 0
    return raw.map((c, idx) => {
      const isExpanded = !!expandedCols[c.label]
      const pct = `${((weights[idx] / totalWeight) * 100).toFixed(2)}%`
      const l = c.sticky ? left : 0
      // sticky columns: accumulate by base weight share only
      if (c.sticky) left += (c.weight / totalWeight) * 100
      return { ...c, isExpanded, w: pct, left: l }
    })
  }, [expandedCols, isTaguigServices, isMyTickets])

  // Ã¢â€â‚¬Ã¢â€â‚¬ Fetch Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const token = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const fetchTickets = useCallback(async (options?: { soft?: boolean; force?: boolean; quiet?: boolean }) => {
    if (!user) return
    const seq = ++fetchSeqRef.current
    const cacheKey = schedulesCacheKeyForTab()
    const cached = readSchedulesTabCache(cacheKey)
    const hasCache = Array.isArray(cached?.tickets) && cached!.tickets!.length > 0
    const sessionSynced = isSchedulesSessionLoaded(cacheKey)
    const cacheAgeMs = cached?.lastSyncAt ? Date.now() - cached.lastSyncAt : Number.POSITIVE_INFINITY
    // Quiet remounts can reuse session cache longer; active soft refresh revalidates after 90s.
    // Never skip network when the cache is empty — that locks the table on "No tickets".
    const skipTtlMs = options?.quiet ? 5 * 60_000 : 90_000
    const skipNetwork = !options?.force && hasCache && cacheAgeMs < skipTtlMs
    // Soft / quiet refreshes must never show the full-page loading UI.
    const showSkeleton = !options?.soft && !options?.quiet && !hasLoadedOnceRef.current && !hasCache
    if ((options?.soft || options?.quiet || hasCache || hasLoadedOnceRef.current) && !skipNetwork) {
      setLoading(false)
      setHasHydratedOnce(true)
    }
    if (!skipNetwork) {
      if (options?.quiet || hasCache || sessionSynced) {
        setBackgroundSyncing(true)
      } else {
        setSyncing(true)
      }
    }

    const applyOptimisticOverlay = (list: Ticket[]) => {
      const normalized = normalizeRelayScheduleTicketList(list)
      const deleted = deletedTicketsRef.current
      const pending = optimisticTicketsRef.current
      const withoutDeleted = normalized.filter(t =>
        !deleted.has(t.id) && (!isTempTicketId(t.id) || pending.has(t.id)),
      )
      for (const id of [...deleted]) {
        if (!list.some(t => t.id === id) && !isTempTicketId(id)) deleted.delete(id)
      }
      if (pending.size === 0) return withoutDeleted
      const serverIds = new Set(withoutDeleted.map(t => t.id))
      const merged = withoutDeleted.map(t => {
        const local = pending.get(t.id)
        if (!local) return t
        if (pendingSavesRef.current.has(t.id) || activeSavesRef.current.has(t.id)) {
          return local
        }
        pending.delete(t.id)
        return mergeTicketPatch(t, local as unknown as Record<string, unknown>)
      })
      for (const [id, local] of pending) {
        if (!serverIds.has(id) && !deleted.has(id)) {
          if (isTempTicketId(id) || pendingSavesRef.current.has(id) || activeSavesRef.current.has(id)) {
            merged.unshift(local)
          } else {
            optimisticTicketsRef.current.delete(id)
          }
        }
      }
      return merged
    }

    if (skipNetwork) {
      if (hasCache) {
        setTickets(applyOptimisticOverlay(cached!.tickets as Ticket[]))
      }
      hasLoadedOnceRef.current = true
      setHasHydratedOnce(true)
      setLoading(false)
      setSyncing(false)
      setBackgroundSyncing(false)
      return
    }

    if (hasCache) {
      setTickets(applyOptimisticOverlay(cached!.tickets as Ticket[]))
      hasLoadedOnceRef.current = true
      setHasHydratedOnce(true)
      setLoading(false)
    } else if (showSkeleton) {
      setLoading(true)
    }
    setFetchError(null)
    const requestDate = isMyTickets ? '' : (dateFilter || '')
    const requestCacheKey = cacheKey
    beginActiveScheduleFetch()
    try {
      const auth = token()
      const scheduleBranchId = activeBranchId && activeBranchId !== 'ALL_BRANCHES'
        ? resolveScopedBranchId(activeBranchId)
        : undefined
      let list: unknown[] = []

      // Always load from /tickets/branch — skip by-number index (those calls were 500ing).
      const ep = isMyTickets
        ? (isAdmin ? '/tickets/branch' : '/tickets/assigned')
        : isCustomer ? '/tickets/my' : '/tickets/branch'
      const size = isMyTickets ? 200 : 200
      list = await fetchTicketsPage(ep, auth, {
        size,
        paginate: false,
        ...(scheduleBranchId ? { branchId: scheduleBranchId } : {}),
        // Admin My Tickets = negotiator queue (PENDING or ASSIGNED, no finalDate) for Active Branch —
        // not Schedules statuses. Filtering the server query to status=ASSIGNED only used to drop
        // any ticket still sitting in PENDING (assigned to a negotiator but never formally flipped
        // to ASSIGNED) before it even reached the client, showing an empty queue for that negotiator.
        // shouldShowOnMyTickets below already excludes Scheduled/Cancelled/Installed/etc., so it's
        // safe to let the server return the full FIELD category range and filter client-side.
        ...(isMyTickets && isAdmin ? { categoryGroup: 'FIELD' as const } : {}),
        ...(!isMyTickets && requestDate ? { date: requestDate } : {}),
      })
      list = normalizeRelayScheduleTicketList(list as Ticket[])
      if (isMyTickets) {
        list = (list as Ticket[]).filter(t => {
          if (!shouldShowOnMyTickets(t)) return false
          if (activeBranchId && activeBranchId !== 'ALL_BRANCHES'
            && !ticketBelongsOnScheduleBranch(
              t, activeBranchId, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
            )) return false
          // Non-admin: only own assigned queue (API should already scope; keep as safety net).
          if (!isAdmin && user?.id) {
            return ticketMatchesNegotiatorFilter(t, user.id)
          }
          return true
        })
      }
      // The server's branchId param on /tickets/branch does not always scope tightly enough
      // (e.g. Taguig Sales/Services split, installer-lineup overrides) — always re-apply the
      // client branch filter as a safety net instead of trusting it outright when scheduleBranchId is set.
      // Every ticket shown here must match BOTH date and branch — never fall back to showing
      // other-branch tickets just because the branch-scoped result is empty (that previously
      // masked the real problem AND silently leaked cross-branch rows, e.g. Taguig Sales seeing
      // Taguig Services or other branches' tickets). If branch-scoped comes back empty, the retry
      // below tries harder instead.
      if (!isMyTickets && requestDate) {
        const dateScoped = (list as Ticket[]).filter(t => ticketBelongsOnScheduleDate(t, requestDate))
        list = (activeBranchId && activeBranchId !== 'ALL_BRANCHES')
          ? dateScoped.filter(t =>
            ticketBelongsOnScheduleBranch(
              t, activeBranchId, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
            )
            // Legacy CANCELLED rows had branchId cleared server-side; the branch-scoped date
            // query already decided they belong here (negotiator visibility), so keep the ghost.
            || (t.status || '').toUpperCase() === 'CANCELLED',
          )
          : dateScoped
        // Stamp Active Branch onto legacy cancelled ghosts with null branchId so later client
        // filters (and cache) treat them as belonging here instead of dropping them again.
        if (scheduleBranchId) {
          list = (list as Ticket[]).map(t => {
            if ((t.status || '').toUpperCase() !== 'CANCELLED') return t
            if (resolveScopedBranchId(t.branchId || t.branch_id)) return t
            return normalizeRelayScheduleTicket({
              ...t,
              branchId: scheduleBranchId,
              branch_id: scheduleBranchId,
              acDetails: mergeAcMeta(t, { cancelledBranchId: scheduleBranchId }),
            }) as Ticket
          })
        }
      }
      // If still empty, retry date-only then apply the same strict branch+date filter.
      if (!isMyTickets && requestDate && scheduleBranchId && list.length === 0) {
        const unscoped = await fetchTicketsPage(ep, auth, {
          size,
          paginate: false,
          date: requestDate,
        })
        list = normalizeRelayScheduleTicketList(unscoped as Ticket[]).filter(t =>
          ticketBelongsOnScheduleDate(t, requestDate)
          && ticketBelongsOnScheduleBranch(
            t, activeBranchId, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
          ),
        )
      }
      cacheTicketsByNumber(list)
      if (!isMyTickets && requestDate) {
        writeScheduleDateTicketNumbers(requestDate, extractTicketNumbers(list))
      }
      // Drop stale responses when the user switched date/branch while this request was in flight.
      if (seq !== fetchSeqRef.current) return
      if (!isMyTickets && requestDate !== (dateFilter || '')) return
      if (requestCacheKey !== schedulesCacheKeyForTab()) return

      // Date-scoped server list is authoritative for what's ON this date, but a ticket just
      // edited elsewhere (e.g. Overview) may not be in the server response yet if its save
      // (or the backend's previousScheduleDates indexing) hasn't landed — mergeServerListWithLocalEdits
      // re-filters extraLocal by date AND active branch, so a cancelled ticket retained on its
      // schedule date cannot reappear after an Active Branch switch.
      // locallyEditedTicketIdsRef only covers edits made in THIS mount; Overview/Schedules/My Tickets
      // are separate routes (separate <Tickets> mounts), so an edit made on one route has no in-memory
      // record on another — seed from the persisted cross-route marker so it still gets protected here.
      for (const id of getRecentlyLocallyEditedTicketIds()) locallyEditedTicketIdsRef.current.add(id)
      // Also protect saves still queued/in-flight and not-yet-created temp rows — these have no
      // confirmed backend state yet, so the server response can't be trusted to include them. Any
      // row NOT in this protected set defers entirely to the server response (see
      // mergeServerListWithLocalEdits) so this browser can't keep showing a row forever after
      // another device/the backend has deleted or moved it.
      const protectedIds = new Set(locallyEditedTicketIdsRef.current)
      for (const id of pendingSavesRef.current.keys()) protectedIds.add(id)
      for (const id of activeSavesRef.current) protectedIds.add(id)
      for (const t of ticketsRef.current) if (isTempTicketId(t.id)) protectedIds.add(t.id)
      const mergeOpts = {
        dateFilter: isMyTickets ? undefined : requestDate,
        extraLocal: ticketsRef.current,
        branchId: activeBranchId,
        email: user?.email,
        jobTitle: user?.jobTitle,
        lineupIndex: installerLineupIndex,
        driverOnlyNames,
      }
      const withLocalEdits = mergeServerListWithLocalEdits(
        list as Ticket[],
        (readSchedulesTabCache(requestCacheKey)?.tickets as Ticket[]) || [],
        protectedIds,
        mergeOpts,
      )
      // Final safety net: never paint / cache another branch's rows (Schedules or My Tickets).
      // Cancelled red ghosts that match this schedule date stay visible even when legacy
      // branchId is empty (they were already admitted/stamped from the date fetch above).
      let branchSafe = (activeBranchId && activeBranchId !== 'ALL_BRANCHES')
        ? withLocalEdits.filter(t =>
          ticketBelongsOnScheduleBranch(
            t, activeBranchId, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
          )
          || (!isMyTickets && !!requestDate && isCancelledScheduleGhost(t, requestDate)),
        )
        : withLocalEdits
      if (isMyTickets) {
        branchSafe = branchSafe.filter(t => shouldShowOnMyTickets(t))
      }
      const merged = applyOptimisticOverlay(branchSafe)
      setTickets(merged)
      writeSchedulesTabCache(requestCacheKey, merged, 'server')
      hasLoadedOnceRef.current = true
      setHasHydratedOnce(true)
      if (merged.length === 0 && !isMyTickets) {
        setFetchError(null)
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current) return
      if (!isMyTickets && requestDate !== (dateFilter || '')) return
      setFetchError(`Failed to load schedules: ${formatFetchError(err)}`)
    } finally {
      endActiveScheduleFetch()
      if (seq === fetchSeqRef.current) {
        setLoading(false)
        setSyncing(false)
        setBackgroundSyncing(false)
      }
    }
  }, [user, isCustomer, isAdmin, isMyTickets, globalBranchId, dateFilter, activeBranchId, token, schedulesCacheKeyForTab, installerLineupIndex, driverOnlyNames])

  const schedulesDateFetchMountedRef = useRef(false)

  useEffect(() => {
    hydrateFromTabCache()
    // Always hit the network for the active schedules date — empty/wrong client filters
    // must not be locked behind a "fresh" cache skip.
    void fetchTickets({ soft: true, quiet: true, force: true })
    // fetchTickets is intentionally excluded — it's recreated on every dateFilter change (it
    // reads dateFilter internally), and listing it here made this effect re-fire on every date
    // change too, duplicating the dedicated date-change effect right below it (confirmed via
    // network tab: two identical /tickets/branch requests per date-tab click). This effect
    // should only re-run for branch/user/mount changes; the effect below owns date changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalBranchId, user, isCustomer, isAdmin, isMyTickets, hydrateFromTabCache])

  useEffect(() => {
    if (isMyTickets) return
    if (!schedulesDateFetchMountedRef.current) {
      schedulesDateFetchMountedRef.current = true
      return
    }
    const hydrated = hydrateFromTabCache()
    if (hydrated) {
      setSyncing(false)
    } else {
      setTickets([])
      setSyncing(true)
    }
    // Always refresh the active date from the server after a tab change.
    void fetchTickets({ soft: true, quiet: false, force: true })
  }, [dateFilter, fetchTickets, isMyTickets, hydrateFromTabCache])

  useEffect(() => {
    const onCacheUpdated = () => {
      hydrateFromTabCache()
    }
    window.addEventListener(TAB_CACHE_UPDATED, onCacheUpdated)
    return () => window.removeEventListener(TAB_CACHE_UPDATED, onCacheUpdated)
  }, [hydrateFromTabCache])

  useEffect(() => {
    if (isMyTickets || activeTab !== 'schedules') return
    hydrateFromTabCache()
  }, [activeTab, isMyTickets, hydrateFromTabCache])

  useEffect(() => {
    if (!canEdit) return
    const authToken = token()
    if (!authToken) return

    const loadEmployees = (force = false) => {
      fetchCachedEmployees(authToken, undefined, { force })
        .then((list) => {
          const mapped: BranchStaffOption[] = list.map((u) => ({
            id: String(u.id || ''),
            name: String(u.name || ''),
            branchId: (u.branchId || u.branch_id) as string | undefined,
            email: u.email as string | undefined,
            role: (u.role as string | undefined),
            jobTitle: (u.jobTitle || u.job_title) as string | undefined,
            phone: u.phone as string | undefined,
          })).filter((u) => u.id && u.name)
          setBranchEmployees(mapped)
        })
        .catch(err => console.error('Failed to load branch employees:', err))
    }

    loadEmployees(false)

    const onDirectoryUpdated = () => loadEmployees(true)
    window.addEventListener(EMPLOYEES_DIRECTORY_UPDATED_EVENT, onDirectoryUpdated)
    window.addEventListener(PROFILE_UPDATED_EVENT, onDirectoryUpdated)
    return () => {
      window.removeEventListener(EMPLOYEES_DIRECTORY_UPDATED_EVENT, onDirectoryUpdated)
      window.removeEventListener(PROFILE_UPDATED_EVENT, onDirectoryUpdated)
    }
  }, [canEdit, token])

  useEffect(() => {
    if (!canEdit) return
    const authToken = token()
    if (!authToken) return

    const loadRosters = (force = false) => {
      if (branchEmployees.length === 0 && !force) return
      void fetchCachedBranches(authToken)
        .then(async (branches) => {
          const ids = branches
            .map((b) => String(b.id || ''))
            .filter(Boolean)
            .flatMap((id) => [id, `${id}-sales`, `${id}-services`])
          const allIds = [
            ...new Set(
              [...ids, activeBranchId, user?.branchId, globalBranchId].filter(Boolean) as string[],
            ),
          ]
          const map = await fetchAllBranchRosters(authToken, allIds, branchEmployees)
          setBranchRosters(map)
        })
        .catch((err) => console.error('Failed to load branch rosters:', err))
    }

    loadRosters(false)
    const onRosterUpdated = () => loadRosters(true)
    window.addEventListener(BRANCH_ROSTER_UPDATED_EVENT, onRosterUpdated)
    window.addEventListener(EMPLOYEES_DIRECTORY_UPDATED_EVENT, onRosterUpdated)
    return () => {
      window.removeEventListener(BRANCH_ROSTER_UPDATED_EVENT, onRosterUpdated)
      window.removeEventListener(EMPLOYEES_DIRECTORY_UPDATED_EVENT, onRosterUpdated)
    }
  }, [canEdit, token, branchEmployees, activeBranchId, user?.branchId, globalBranchId])

  useEffect(() => {
    const authToken = token()
    if (!authToken) return
    fetchCachedLineupInstallerIndex(authToken)
      .then((list) => setInstallerLineupIndex(Array.isArray(list) ? list as InstallerBranchIndexEntry[] : []))
      .catch(() => setInstallerLineupIndex([]))
    fetchCachedDriverOnlyNames(authToken)
      .then((list) => setDriverOnlyNames(list))
      .catch(() => setDriverOnlyNames([]))
  }, [token])

  // Ã¢â€â‚¬Ã¢â€â‚¬ Filter Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const filtered = useMemo(() => {
    const effectiveBranch = activeBranchId

    // Schedules date tab: active branch + schedule date (server already scopes branch for admin).
    if (!isMyTickets && dateFilter) {
      let list = tickets.filter(t => {
        // Cancelled = red ghost on this date — always keep (field-category / branch gaps must not hide it).
        if (isCancelledScheduleGhost(t, dateFilter)) return true
        if (!isFieldCategory(inferCategoryFromTicket(t))) return false
        if (!ticketBelongsOnScheduleDate(t, dateFilter)) return false
        if (effectiveBranch && effectiveBranch !== 'ALL_BRANCHES'
          && !ticketBelongsOnScheduleBranch(
            t, effectiveBranch, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
          )) return false
        return true
      })
      list = [...list].sort((a, b) => {
        const aGhost = isScheduleGhostOnDate(a, dateFilter) || isCancelledTicket(a)
        const bGhost = isScheduleGhostOnDate(b, dateFilter) || isCancelledTicket(b)
        if (aGhost === bGhost) return 0
        return aGhost ? 1 : -1
      })
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        list = list.filter(t =>
          [t.customerName, t.customer_name, t.contactPhone, t.assignedEmployeeName,
          t.assigned_employee_name, t.serviceType, t.service_type, t.description,
          t.remarks, t.note, t.id, t.ticketNumber, t.ticket_number,
          resolveNegotiatorDisplayName(t, branchEmployees)].some(v => v?.toLowerCase().includes(q))
          || formatAddress(t.location).toLowerCase().includes(q)
        )
      }
      return list
    }

    let list = tickets.filter(t => {
      const stat = (t.status || '').toUpperCase()
      // Cancelled tickets stay off the negotiator's My Tickets queue (shouldShowOnMyTickets
      // below also excludes them), but they should still surface on Schedules as a muted ghost
      // row on their scheduled date instead of vanishing outright.
      if (stat === 'CANCELLED' && isMyTickets) return false
      if (stat === 'CANCELLED' && dateFilter && isCancelledScheduleGhost(t, dateFilter)) return true

      if (isMyTickets) {
        if (effectiveBranch && effectiveBranch !== 'ALL_BRANCHES') {
          const b = resolveTicketScheduleBranchId(t, installerLineupIndex, driverOnlyNames)
            || resolveScopedBranchId(t.branchId || t.branch_id)
            || resolveScopedBranchId(user?.branchId)
          if (!b) return false
          if (!branchScopesMatch(b, effectiveBranch, user?.email) && !isBranchMatch(b, effectiveBranch)) return false
          if (isTaguigBranchRef(effectiveBranch)) {
            const wantServices = isTaguigServicesScope(effectiveBranch, user?.email, user?.jobTitle)
            const isService = isTaguigServiceTicket(t as unknown as Record<string, unknown>)
            if (wantServices ? !isService : isService) return false
          }
        }
        if (!shouldShowOnMyTickets(t)) return false
        if (isAdmin) {
          if (myTicketsNegotiatorFilter && !ticketMatchesNegotiatorFilter(t, myTicketsNegotiatorFilter)) return false
        } else if (user?.id && !ticketMatchesNegotiatorFilter(t, user.id)) {
          return false
        }
        return true
      }

      if (!isFieldCategory(inferCategoryFromTicket(t))) return false

      if (isInstalledWorkflowStatus(stat)) {
        if (!dateFilter) return false
        return ticketBelongsOnScheduleDate(t, dateFilter)
      }

      const hasFinalDate = Boolean(getFinalDateKey(t))
      const hasScheduleDate = hasFinalDate
        || Boolean(getPreferredDateKey(t))
        || Boolean(String(parseAcMeta(t).scheduledDate || '').trim())
        || getContinuationDates(t).length > 0
      const isScheduledOrActive = [
        'SCHEDULED', 'RESCHED', 'IN_PROGRESS', 'ON_THE_WAY', 'FOR_APPROVAL', 'SURVEY', 'CONTINUATION',
        'SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'DONE_DISMANTLE',
      ].includes(stat)
      if (!hasScheduleDate && !isScheduledOrActive) return false

      const scheduleValue = getScheduleStatusValue(t)
      const isResched = stat === 'RESCHED' || scheduleValue === 'RESCHED'
      const isContinuation = stat === 'CONTINUATION' || scheduleValue === 'CONTINUATION'
      const isForApproval = stat === 'FOR APPROVAL' || stat === 'FOR_APPROVAL' || stat === 'FOR QUOTATION' || stat === 'FOR_QUOTATION' || stat.includes('QUOTATION') || scheduleValue === 'FOR_APPROVAL'
      const isSurvey = scheduleValue === 'SURVEY' || scheduleValue === 'DONE_SURVEY'
      const isCleaning = scheduleValue === 'CLEANING' || scheduleValue === 'DONE_CLEANING'
      const isSystemReprocess = scheduleValue === 'SYSTEM_REPROCESS' || scheduleValue === 'DONE_SYSTEM_REPROCESS'
      const isDismantle = scheduleValue === 'DISMANTLE' || scheduleValue === 'DONE_DISMANTLE'
      const isInstallation = scheduleValue === 'INSTALLATION' || scheduleValue === 'SERVICES' || scheduleValue === 'DONE_INSTALLED' || scheduleValue === 'DONE_CHECKUP' || scheduleValue === 'DONE_BACKJOB'
      const isActiveSchedule = ['SCHEDULED', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_THE_WAY'].includes(stat) || hasScheduleDate

      return isInstallation || isCleaning || isSystemReprocess || isDismantle || isResched || isContinuation || isForApproval || isSurvey || isActiveSchedule
    })
    if (!isMyTickets) {
      if (effectiveBranch && effectiveBranch !== 'ALL_BRANCHES') {
        list = list.filter(t =>
          (dateFilter && isCancelledScheduleGhost(t, dateFilter))
          || ticketBelongsOnScheduleBranch(
            t, effectiveBranch, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
          ),
        )
      }
    }
    if (dateFilter) {
      list = list.filter(t => ticketBelongsOnScheduleDate(t, dateFilter) || isCancelledScheduleGhost(t, dateFilter))
      list = [...list].sort((a, b) => {
        const aGhost = isScheduleGhostOnDate(a, dateFilter) || isCancelledTicket(a)
        const bGhost = isScheduleGhostOnDate(b, dateFilter) || isCancelledTicket(b)
        if (aGhost === bGhost) return 0
        return aGhost ? 1 : -1
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        [t.customerName, t.customer_name, t.contactPhone, t.assignedEmployeeName,
        t.assigned_employee_name, t.serviceType, t.service_type, t.description,
        t.remarks, t.note, t.id, t.ticketNumber, t.ticket_number,
        resolveNegotiatorDisplayName(t, branchEmployees)].some(v => v?.toLowerCase().includes(q))
        || formatAddress(t.location).toLowerCase().includes(q)
      )
    }
    return list
  }, [tickets, isMyTickets, activeBranchId, dateFilter, searchQuery, user?.id, user?.email, user?.branchId, user?.jobTitle, installerLineupIndex, driverOnlyNames, isAdmin, myTicketsNegotiatorFilter, branchEmployees, isBranchMatch])

  // Auto-numbered vehicle trip labels ("STRADA - 1", "STRADA - 2") for the current filtered set —
  // the vehicle is now the dispatch unit, so staff never type a manual "- N" suffix into the
  // Driver or Vehicle fields; the trip number is derived from assignment order instead.
  const vehicleTripLabels = useMemo(() => buildVehicleTripLabels(filtered), [filtered])

  const visible = useMemo(() => {
    let list = filtered
    const cmpOpts = { myTickets: isMyTickets, employees: branchEmployees, branchId: activeBranchId, vehicleTripLabels }
    list = [...list].sort((a, b) => {
      // Schedules: always group rows by vehicle first — the vehicle (e.g. "STRADA - 1",
      // "STRADA - 2") is the actual dispatch unit and trip order, auto-numbered from assignment
      // order. Driver name is the secondary tiebreaker so rows stay readable within a vehicle group.
      if (!isMyTickets) {
        const byVehicle = compareTicketsByColumn(a, b, 'VEHICLE', cmpOpts)
        if (byVehicle !== 0) {
          const desc = sortConfig.column === 'VEHICLE' && sortConfig.direction === 'desc'
          return desc ? -byVehicle : byVehicle
        }
        const byDriver = compareTicketsByColumn(a, b, 'SERVICE', cmpOpts)
        if (byDriver !== 0) {
          const desc = sortConfig.column === 'SERVICE' && sortConfig.direction === 'desc'
          return desc ? -byDriver : byDriver
        }
      }
      if (isMyTickets || (sortConfig.column !== 'SERVICE' && sortConfig.column !== 'VEHICLE')) {
        const cmp = compareTicketsByColumn(a, b, sortConfig.column, cmpOpts)
        if (cmp !== 0) return sortConfig.direction === 'desc' ? -cmp : cmp
      }
      if (sortConfig.column !== "CUSTOMER'S NAME") {
        const byCustomer = compareTicketsByColumn(a, b, "CUSTOMER'S NAME", cmpOpts)
        if (byCustomer !== 0) return byCustomer
      }
      return compareTicketsByColumn(a, b, 'TICKET NO', cmpOpts)
    })
    return list
  }, [filtered, sortConfig, isMyTickets, branchEmployees, activeBranchId, vehicleTripLabels])

  // Each ticket's position within its contiguous vehicle-group run in `visible` — visible is
  // already sorted with same-vehicle rows contiguous, so this is a single linear scan. Used to
  // animate the "make room" row slide while dragging a VEHICLE cell.
  const vehicleGroupPositions = useMemo(() => {
    const map = new Map<string, { base: string; relIndex: number }>()
    let i = 0
    while (i < visible.length) {
      const parsed = parseNameSiteToken(getTicketVehicleDisplay(visible[i]))
      if (!parsed.name) { i += 1; continue }
      let j = i
      let rel = 0
      while (j < visible.length && parseNameSiteToken(getTicketVehicleDisplay(visible[j])).name === parsed.name) {
        map.set(visible[j].id, { base: parsed.name, relIndex: rel })
        rel += 1
        j += 1
      }
      i = j
    }
    return map
  }, [visible])

  // The would-be order of the currently-dragged vehicle group if dropped on the current hover
  // target — drives both the live row-slide animation and (on drop) what actually gets saved, so
  // what the user sees sliding into place is exactly what gets persisted.
  const vehicleDragPreview = useMemo(() => {
    if (!draggedVehicleTicketId || !vehicleDropTargetId || draggedVehicleTicketId === vehicleDropTargetId) return null
    const draggedPos = vehicleGroupPositions.get(draggedVehicleTicketId)
    const targetPos = vehicleGroupPositions.get(vehicleDropTargetId)
    if (!draggedPos || !targetPos || draggedPos.base !== targetPos.base) return null
    const groupIds = visible
      .filter(t => vehicleGroupPositions.get(t.id)?.base === draggedPos.base)
      .map(t => t.id)
    const fromIndex = groupIds.indexOf(draggedVehicleTicketId)
    const toIndex = groupIds.indexOf(vehicleDropTargetId)
    if (fromIndex === -1 || toIndex === -1) return null
    const reordered = [...groupIds]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    return { base: draggedPos.base, order: reordered }
  }, [draggedVehicleTicketId, vehicleDropTargetId, vehicleGroupPositions, visible])

  const sortDiffersFromDefault =
    sortConfig.column !== defaultSortForSchedulesView(isMyTickets).column
    || sortConfig.direction !== defaultSortForSchedulesView(isMyTickets).direction

  const handleColumnSort = useCallback((colLabel: string) => {
    setSortConfig(prev => {
      if (prev.column !== colLabel) return { column: colLabel, direction: 'asc' }
      if (prev.direction === 'asc') return { column: colLabel, direction: 'desc' }
      return defaultSortForSchedulesView(isMyTickets)
    })
  }, [isMyTickets])

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

  // counts removed — stats bar removed from UI

  const showcaseDateLabel = useMemo(
    () => (dateFilter ? formatDateKeyLabel(dateFilter) : 'All Dates'),
    [dateFilter],
  )

  const showcaseRows = useMemo<ScheduleShowcaseRow[]>(() => {
    if (isMyTickets) return []
    // Mirror exactly what the schedules grid shows (all visible rows, including ghosts).
    // INSTALLER / DRIVER (SERVICE column): name only — never trip "- N" suffixes.
    // VEHICLE (exported as service): use the same auto trip labels as the table.
    return visible.map((ticket, index) => {
      const live = optimisticTicketsRef.current.get(ticket.id) || ticket
      const installerRaw = getInstallerDisplay(live, branchEmployees, activeBranchId)
      const driverRaw = getTicketDriverDisplay(live) || getTicketDriverName(live) || formatServiceDriver(live) || ''
      const vehicleTrip = vehicleTripLabels.get(live.id || '') || getTicketVehicleDisplay(live) || ''
      return {
        id: String(live.id ?? index),
        index: index + 1,
        ticketNumber: getTicketNumberDisplay(live) || '',
        name: getF(live, 'customerName', 'customer_name') || live.title || '',
        destination: formatAddress(live.location),
        district: parseDistrict(live.location, live.district) || resolveTicketDistrict(live),
        contact: getF(live, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
        brand: parseBrand(live),
        dealer: getF(live, 'dealer', 'sourceVendor', 'source_vendor') || '',
        status: getScheduleStatusLabel(getScheduleStatusValue(live)),
        commit: getF(live, 'commitType', 'commitTerms', 'description'),
        installer: parseNameSiteToken(installerRaw).label || installerRaw,
        update: getScheduleUpdateDisplay(live),
        payment: getSchedulePaymentDisplay(live, dateFilter, dateFilter ? getScheduleGhostKind(live, dateFilter) : null),
        driver: parseNameSiteToken(driverRaw).label || driverRaw,
        service: vehicleTrip,
      }
    })
  }, [visible, isMyTickets, branchEmployees, activeBranchId, tickets, dateFilter, vehicleTripLabels])

  const showcasePaymentByRowId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const ticket of visible) {
      const live = optimisticTicketsRef.current.get(ticket.id) || ticket
      const payment = getSchedulePaymentDisplay(
        live,
        dateFilter,
        dateFilter ? getScheduleGhostKind(live, dateFilter) : null,
      )
      if (!payment) continue
      const ticketNo = getTicketNumberDisplay(live)
      if (ticketNo) map[ticketNo] = payment
      if (live.id) map[String(live.id)] = payment
    }
    return map
  }, [visible, tickets, dateFilter])

  // Ã¢â€â‚¬Ã¢â€â‚¬ Get display value for a column Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  function getCellDisplay(ticket: Ticket, colLabel: string): string {
    const raw = (() => {
      switch (colLabel) {
        case 'TICKET NO': return getTicketNumberDisplay(ticket)
        case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title
        case 'DESTINATION': return resolveTicketDistrict(ticket)
        case 'DISTRICT': return parseDistrict(ticket.location, ticket.district)
        case 'CONTACT NO.': return getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
        case 'BRAND': return parseBrand(ticket)
        case 'DLR': return getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || ''
        case 'STATUS': return getScheduleStatusLabel(getScheduleStatusValue(ticket))
        case 'SCHEDULED DATE': return formatDateKeyLabel(getArchivedScheduleDate(ticket))
        case 'INSTALLED DATE': return formatDateKeyLabel(getInstalledDateKey(ticket))
        case 'FINAL DATE': return formatDateKeyLabel(getFinalDateKey(ticket))
        case 'PAYMENT': return getSchedulePaymentDisplay(ticket, dateFilter, getScheduleGhostKind(ticket, dateFilter))
        case 'MOP': return getPaymentMode(ticket)
        case 'COMMIT': return getF(ticket, 'commitType', 'commitTerms', 'description')
        case 'INSTALLER': return getInstallerDisplay(ticket, branchEmployees, activeBranchId)
        case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, branchEmployees)
        case 'NOTE': return ticket.note || ''
        case 'SERVICE': return isMyTickets ? formatRelayTicketTypeShort(ticket) : getTicketDriverDisplay(ticket)
        case 'VEHICLE': return isMyTickets ? '' : (vehicleTripLabels.get(ticket.id || '') || getTicketVehicleDisplay(ticket))
        case 'UPDATE': return getScheduleUpdateDisplay(ticket)
        default: return ''
      }
    })()
    return sanitizeDisplayText(raw)
  }

  const discardCellEdit = () => {
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    cellEditBlurTimer.current = null
    cellEditDraftRef.current = null
    setEditingCell(null)
  }

  const commitCellEdit = useCallback(() => {
    if (cellEditBlurTimer.current) {
      clearTimeout(cellEditBlurTimer.current)
      cellEditBlurTimer.current = null
    }
    const draft = cellEditDraftRef.current
      || (editingCell
        ? {
          ticketId: editingCell.ticketId,
          rowIndex: editingCell.rowIndex,
          colLabel: editingCell.colLabel,
          value: editingCell.value,
        }
        : null)
    if (!draft) return
    cellEditDraftRef.current = null
    setEditingCell(null)
    const ticket = tickets.find(t => t.id === draft.ticketId)
      || optimisticTicketsRef.current.get(draft.ticketId)
    if (!ticket) return
    void saveCellEditRef.current(ticket, draft.colLabel, draft.value)
  }, [editingCell, tickets])
  commitCellEditRef.current = commitCellEdit

  const cancelEdit = discardCellEdit

  const openStatusPicker = useCallback((
    ticket: Ticket,
    mode: 'inline' | 'edit-form' = 'inline',
    anchorEl?: HTMLElement | null,
  ) => {
    commitCellEditRef.current()
    setExpandedCell(null)

    const popupW = 300
    const popupH = 520
    const el = anchorEl
      || (mode === 'inline'
        ? document.querySelector(`[data-cell-key="${ticket.id}:STATUS"]`) as HTMLElement | null
        : null)
    const rect = el?.getBoundingClientRect()
    const left = rect
      ? Math.min(Math.max(8, rect.left), window.innerWidth - popupW - 8)
      : Math.max(8, (window.innerWidth - popupW) / 2)
    const below = rect ? rect.bottom + 6 : 80
    const above = rect ? rect.top - popupH - 6 : 80
    const fitsBelow = below + Math.min(popupH, window.innerHeight * 0.7) <= window.innerHeight - 8
    const top = fitsBelow
      ? Math.min(below, window.innerHeight - 120)
      : Math.max(8, above)

    setStatusPicker({ ticket, mode, x: left, y: top })
  }, [])

  const openScheduleDetailsPopup = useCallback((
    ticket: Ticket,
    anchorEl?: HTMLElement | null,
    ghostKind?: 'completed' | 'resched' | 'cancelled' | null,
  ) => {
    commitCellEditRef.current()
    setExpandedCell(null)
    setStatusPicker(null)

    const popupW = 360
    const popupH = 320
    const el = anchorEl
      || (document.querySelector(`[data-cell-key="${ticket.id}:STATUS"]`) as HTMLElement | null)
    const rect = el?.getBoundingClientRect()
    const left = rect
      ? Math.min(Math.max(8, rect.left + rect.width / 2 - popupW / 2), window.innerWidth - popupW - 8)
      : Math.max(8, (window.innerWidth - popupW) / 2)
    const below = rect ? rect.bottom + 6 : 80
    const above = rect ? rect.top - popupH - 6 : 80
    const fitsBelow = below + Math.min(popupH, window.innerHeight * 0.75) <= window.innerHeight - 8
    const top = fitsBelow
      ? Math.min(below, window.innerHeight - 120)
      : Math.max(8, above)

    setScheduleDetailsPopup({ ticket, x: left, y: top, ghostKind })
  }, [])

  const closeFinalDatePicker = useCallback(() => {
    setFinalDatePicker(null)
    setFinalDateCalMonth(null)
  }, [])

  const openFinalDatePicker = useCallback((
    ticket: Ticket,
    anchorEl?: HTMLElement | null,
  ) => {
    commitCellEditRef.current()
    setExpandedCell(null)

    const preferredDate = getPreferredDateKey(ticket)
    const existingFinal = getFinalDateKey(ticket)
    const initDate = existingFinal || preferredDate || ''

    const popupW = 288
    const popupH = 400
    const el = anchorEl
      || (document.querySelector(`[data-cell-key="${ticket.id}:FINAL DATE"]`) as HTMLElement | null)
    const rect = el?.getBoundingClientRect()
    const left = rect
      ? Math.min(Math.max(8, rect.left + rect.width / 2 - popupW / 2), window.innerWidth - popupW - 8)
      : Math.max(8, (window.innerWidth - popupW) / 2)
    const below = rect ? rect.bottom + 6 : 80
    const above = rect ? rect.top - popupH - 6 : 80
    const fitsBelow = below + Math.min(popupH, window.innerHeight * 0.75) <= window.innerHeight - 8
    const top = fitsBelow
      ? Math.min(below, window.innerHeight - 120)
      : Math.max(8, above)

    const calSeed = initDate ? new Date(`${initDate}T00:00:00`) : new Date()
    setFinalDateCalMonth({ year: calSeed.getFullYear(), month: calSeed.getMonth() })
    setFinalDatePicker({ ticket, x: left, y: top, value: initDate, preferredDate })
  }, [])

  const startCellEdit = (ticket: Ticket, colLabel: string, anchorEl?: HTMLElement | null, rowIndex?: number) => {
    // Clicking straight from one open cell editor into another must save the first cell's
    // draft rather than silently drop it — previously this only cleared the pending blur
    // timer, which cancelled the SERVICE/VEHICLE (and other) cell's save entirely.
    commitCellEdit()
    setExpandedCell(null)
    if (colLabel === 'STATUS') {
      openStatusPicker(ticket)
      return
    }
    if (colLabel === 'FINAL DATE') {
      openFinalDatePicker(ticket, anchorEl)
      return
    }
    const resolvedRowIndex = rowIndex ?? visible.findIndex(t => t.id === ticket.id)
    const value = getCellRawValue(ticket, colLabel, isMyTickets, branchEmployees, activeBranchId)
    const draft = {
      ticketId: ticket.id,
      rowIndex: resolvedRowIndex >= 0 ? resolvedRowIndex : 0,
      colLabel,
      value,
    }
    cellEditDraftRef.current = draft
    setEditingCell(draft)
  }

  const applyTicketLocally = useCallback((ticketId: string, nextTicket: Ticket) => {
    const normalized = normalizeRelayScheduleTicket(nextTicket)
    cacheTicketByNumber(normalized as unknown as Record<string, unknown>)
    locallyEditedTicketIdsRef.current.add(ticketId)
    markTicketLocallyEdited(ticketId)
    const prevTicket = tickets.find(t => t.id === ticketId)
      || optimisticTicketsRef.current.get(ticketId)
      || overviewResults.find(t => t.id === ticketId)
    optimisticTicketsRef.current.set(ticketId, normalized)

    const prevDate = prevTicket ? resolveTicketScheduleDateKey(prevTicket) : ''
    const nextDate = resolveTicketScheduleDateKey(normalized)

    const patchCacheForDate = (dateKey: string | undefined, listUpdater: (list: Ticket[]) => Ticket[]) => {
      if (!dateKey || isMyTickets) return
      const cacheKey = schedulesCacheKey(user, globalBranchId, isCustomer, isAdmin, isMyTickets, dateKey)
      const cached = readSchedulesTabCache(cacheKey)
      const base = Array.isArray(cached?.tickets) ? (cached!.tickets as Ticket[]) : []
      const nextList = normalizeRelayScheduleTicketList(listUpdater(base))
      writeSchedulesTabCache(cacheKey, nextList, 'local')
    }

    // NB: intentionally NO auto-jump of the date filter here. Rescheduling / changing a schedule
    // date must keep the user on the date they're viewing — the edited ticket "copies" in place
    // (a muted ghost stays on the current date; the active copy is written into the new date's cache
    // below via patchCacheForDate), rather than yanking the view to the new date. Jumping the tab was
    // also what opened the stale-closure window that clobbered the old date's cached roster.

    setTickets(prev => {
      // Use the LIVE dateFilter, not the closure's — `prev` always reflects the current on-screen
      // date, so a stale closure here would classify/cache rows against the wrong date (this is the
      // exact race that clobbered the old date's cache after a reschedule auto-jumped the tab).
      const liveDateFilter = dateFilterRef.current
      const exists = prev.some(t => t.id === ticketId)
      const showOnCurrentFilter = !liveDateFilter
        || ticketMatchesDateKey(normalized, liveDateFilter)
        || isScheduleGhostOnDate(normalized, liveDateFilter)

      let next: Ticket[]
      if (showOnCurrentFilter) {
        next = exists
          ? prev.map(t => (t.id === ticketId ? normalized : t))
          : [normalized, ...prev]
      } else {
        next = prev.filter(t => t.id !== ticketId)
      }

      if (!isMyTickets && liveDateFilter) {
        writeSchedulesTabCache(schedulesCacheKeyForTab(liveDateFilter), next, 'local')
      }
      return next
    })

    if (!isMyTickets) {
      if (prevDate && prevDate !== nextDate) {
        // The old date must keep a ghost row (previousScheduleDates) rather than lose the ticket
        // outright — otherwise a page reload while viewing the old date depends entirely on the
        // backend also returning the ghost, and if that lags (or its previousScheduleDates OR-clause
        // misses it), the row vanishes from the old date instead of showing muted.
        const stillGhostOnPrevDate = isScheduleGhostOnDate(normalized, prevDate)
        patchCacheForDate(prevDate, list => {
          const without = list.filter(t => t.id !== ticketId)
          return stillGhostOnPrevDate ? [normalized, ...without] : without
        })
      }
      if (nextDate) {
        patchCacheForDate(nextDate, list => {
          const without = list.filter(t => t.id !== ticketId)
          return [normalized, ...without]
        })
      }
    }

    setOverviewResults(prev => prev.map(t => (t.id === ticketId ? { ...t, ...normalized } : t)))
    setDetailTicket(prev => (prev?.id === ticketId ? { ...prev, ...normalized } : prev))
    syncTicketAcrossTabCaches(normalized)
  }, [tickets, overviewResults, user, globalBranchId, isCustomer, isAdmin, isMyTickets, schedulesCacheKeyForTab])

  const resolveLiveScheduleTicket = useCallback((ticket: Ticket): Ticket => {
    return findTicketInListByRef(tickets, ticket, optimisticTicketsRef.current) || ticket
  }, [tickets])

  const remapScheduleTicketId = useCallback((oldId: string, serverTicket: Ticket) => {
    const normalized = normalizeRelayScheduleTicket(serverTicket)
    const newId = normalized.id
    if (!newId || newId === oldId) return newId

    const pending = pendingSavesRef.current.get(oldId)
    if (pending) {
      pendingSavesRef.current.delete(oldId)
      pendingSavesRef.current.set(newId, pending)
    }
    const optimistic = optimisticTicketsRef.current.get(oldId)
    optimisticTicketsRef.current.delete(oldId)
    const mergedOptimistic = optimistic
      ? mergeTicketPatch(normalized, optimistic as unknown as Record<string, unknown>)
      : normalized
    optimisticTicketsRef.current.set(newId, mergedOptimistic)
    activeSavesRef.current.delete(oldId)

    setTickets(prev => {
      let replaced = false
      const next = prev.map(t => {
        if (t.id !== oldId) return t
        replaced = true
        return mergedOptimistic
      })
      const result = replaced ? next : [mergedOptimistic, ...next.filter(t => t.id !== newId)]
      writeSchedulesTabCache(schedulesCacheKeyForTab(), result, 'local')
      return result
    })
    setOverviewResults(prev => prev.map(t => (t.id === oldId ? { ...t, ...mergedOptimistic, id: newId } : t)))
    setDetailTicket(prev => (prev?.id === oldId ? { ...prev, ...mergedOptimistic, id: newId } : prev))
    syncTicketAcrossTabCaches(mergedOptimistic)
    return newId
  }, [schedulesCacheKeyForTab])

  const purgeStaleScheduleTicket = useCallback((ticketId: string) => {
    pendingSavesRef.current.delete(ticketId)
    optimisticTicketsRef.current.delete(ticketId)
    activeSavesRef.current.delete(ticketId)
    deletedTicketsRef.current.add(ticketId)
    setTickets(prev => {
      const next = prev.filter(t => t.id !== ticketId)
      writeSchedulesTabCache(schedulesCacheKeyForTab(), next, 'local')
      return next
    })
    setOverviewResults(prev => prev.filter(t => t.id !== ticketId))
  }, [schedulesCacheKeyForTab])

  const restoreTicketLocally = useCallback((ticketId: string, rollback: Ticket) => {
    optimisticTicketsRef.current.delete(ticketId)
    setTickets(prev => {
      const next = prev.map(t => (t.id === ticketId ? rollback : t))
      const cacheKey = schedulesCacheKeyForTab()
      writeSchedulesTabCache(cacheKey, next, 'local')
      return next
    })
    setOverviewResults(prev => prev.map(t => (t.id === ticketId ? { ...t, ...rollback } : t)))
    setDetailTicket(prev => (prev?.id === ticketId ? { ...prev, ...rollback } : prev))
  }, [user, globalBranchId, isCustomer, isAdmin, isMyTickets, schedulesCacheKeyForTab])

  const flushTicketSave = useCallback(async (ticketId: string) => {
    // Never PATCH optimistic temp ids Ã¢â‚¬â€ edits stay queued until promoteTempTicketState.
    if (isTempTicketId(ticketId)) return
    if (activeSavesRef.current.has(ticketId)) return
    activeSavesRef.current.add(ticketId)
    setSavingTicketIds(prev => (prev.has(ticketId) ? prev : new Set(prev).add(ticketId)))
    let saveId = ticketId
    try {
      while (pendingSavesRef.current.has(saveId)) {
        const job = pendingSavesRef.current.get(saveId)!
        pendingSavesRef.current.delete(saveId)
        const payload = sanitizeTicketPatchBody(job.body)
        try {
          const auth = token()
          if (!auth) throw new Error('Not signed in Ã¢â‚¬â€ refresh and try again')
          const res = await fetch(`${API_BASE_URL}/tickets/${saveId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth}`,
            },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const errText = await readApiError(res)
            if (res.status === 404 && !job.lookupRetried) {
              const lookupTicket = job.rollback
                || optimisticTicketsRef.current.get(saveId)
                || tickets.find(t => t.id === saveId)
              const ticketNumber = lookupTicket?.ticketNumber || lookupTicket?.ticket_number || ''
              const wantedNumber = normalizeTicketNumberKey(ticketNumber)
              // Prefer the copy already shown on THIS date/branch view over a blind global
              // by-number/keyword search — if the ticket number has duplicate rows server-side
              // (a known legacy data issue), a global search's first match can be the wrong
              // duplicate, silently writing this edit onto an unrelated record while the row the
              // user is actually looking at never gets updated (looks like the edit "reverted").
              const localMatch = wantedNumber
                ? ticketsRef.current.find(t =>
                  t.id !== saveId && normalizeTicketNumberKey(t.ticketNumber || t.ticket_number) === wantedNumber,
                )
                : undefined
              const found = localMatch
                || (ticketNumber ? await lookupTicketByNumberOnServer(auth, ticketNumber) : null)
              if (found?.id && found.id !== saveId) {
                const remappedId = remapScheduleTicketId(saveId, found)
                pendingSavesRef.current.set(remappedId, {
                  ...job,
                  rollback: found,
                  lookupRetried: true,
                })
                saveId = remappedId
                continue
              }
            }
            throw new Error(errText)
          }
          const savedPayload = await res.json().catch(() => null)
          const savedTicket = parseCreatedTicketResponse(savedPayload) as Ticket | null
          const base = optimisticTicketsRef.current.get(saveId)
            || tickets.find(t => t.id === saveId)
            || overviewResults.find(t => t.id === saveId)
          let mergedSaved = base
          if (base) {
            mergedSaved = savedTicket?.id
              ? preserveLocalScheduleFields(base, savedTicket)
              : base
            optimisticTicketsRef.current.delete(saveId)
            locallyEditedTicketIdsRef.current.add(saveId)
            // The PATCH response already runs through the same enrichTicketResponse pipeline as
            // a plain GET (negotiatorName, branch resolution, etc. are all resolved server-side
            // before it's returned) — apply it directly instead of firing a redundant follow-up
            // GET /tickets/by-number for every single save. That second round trip used to be
            // "just" wasted latency, but it was also the exact race that could revert a just-saved
            // date/status if it happened to read before the write was visible; removing it fixes
            // both at once.
            applyTicketLocally(saveId, mergedSaved)
            cacheTicketByNumber(mergedSaved as unknown as Record<string, unknown>)
          }
          console.log('[Schedules] Saved to database', {
            ticketId: saveId,
            ticketNumber: mergedSaved?.ticketNumber || mergedSaved?.ticket_number,
            status: payload.status,
            scheduleOutcome: payload.scheduleOutcome,
            ticketCategory: payload.ticketCategory,
            serviceType: payload.serviceType,
          })
          if (job.afterSave) await job.afterSave()
        } catch (err: unknown) {
          console.error('[Schedules] Background save FAILED', saveId, payload, err)
          if (pendingSavesRef.current.has(saveId)) {
            continue
          }
          restoreTicketLocally(saveId, job.rollback)
          if (isTicketNotFoundError(err)) {
            purgeStaleScheduleTicket(saveId)
            void fetchTickets({ soft: false, force: true, quiet: false })
            alert(`Could not save ticket Ã¢â‚¬â€ it may have been removed or replaced. Refreshed the list. (${formatFetchError(err)})`)
          } else {
            alert(`Could not save ticket: ${formatFetchError(err)}`)
          }
          break
        }
      }
    } finally {
      activeSavesRef.current.delete(ticketId)
      activeSavesRef.current.delete(saveId)
      setSavingTicketIds(prev => {
        if (!prev.has(ticketId) && !prev.has(saveId)) return prev
        const next = new Set(prev)
        next.delete(ticketId)
        next.delete(saveId)
        return next
      })
      const nextId = saveId !== ticketId ? saveId : ticketId
      if (pendingSavesRef.current.has(nextId)) {
        void flushTicketSave(nextId)
      } else if (pendingSavesRef.current.has(ticketId)) {
        void flushTicketSave(ticketId)
      }
    }
  }, [restoreTicketLocally, token, fetchTickets, tickets, overviewResults, remapScheduleTicketId, purgeStaleScheduleTicket, applyTicketLocally])
  flushTicketSaveRef.current = (ticketId: string) => { void flushTicketSave(ticketId) }

  /** Apply UI instantly, merge into per-ticket queue, persist silently in background. */
  const queueTicketPatch = useCallback((
    ticket: Ticket,
    body: Record<string, unknown>,
    afterSave?: () => Promise<void>,
  ) => {
    const ticketId = ticket.id
    const existing = pendingSavesRef.current.get(ticketId)
    const baseTicket = optimisticTicketsRef.current.get(ticketId) || ticket
    const mergedBody = sanitizeTicketPatchBody(
      existing ? mergePatchBodies(existing.body, body) : body,
    )
    const nextTicket = mergeTicketPatch(baseTicket, mergedBody)
    pendingSavesRef.current.set(ticketId, {
      body: mergedBody,
      rollback: existing?.rollback ?? ticket,
      afterSave: afterSave ?? existing?.afterSave,
    })
    applyTicketLocally(ticketId, nextTicket)
    // Temp rows are not on the server yet Ã¢â‚¬â€ flush after create promotes to a real id.
    if (!isTempTicketId(ticketId)) {
      return flushTicketSave(ticketId)
    }
    return Promise.resolve()
  }, [applyTicketLocally, flushTicketSave])

  /** Clear driver + vehicle on every active (non-ghost) schedule row for the current date. */
  const clearAllDriversAndVehiclesForDate = useCallback(() => {
    const dateKey = dateFilter || todayDateKey()
    const targets = tickets.filter(t => {
      const stat = (t.status || '').toUpperCase()
      if (stat === 'CANCELLED') return false
      if (!isFieldCategory(inferCategoryFromTicket(t))) return false
      if (!ticketBelongsOnScheduleDate(t, dateKey)) return false
      if (isScheduleGhostOnDate(t, dateKey)) return false
      if (
        activeBranchId
        && activeBranchId !== 'ALL_BRANCHES'
        && !ticketBelongsOnScheduleBranch(
          t, activeBranchId, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
        )
      ) {
        return false
      }
      return Boolean(getTicketDriverDisplay(t) || getTicketVehicleDisplay(t))
    })

    if (targets.length === 0) {
      showToast('No drivers or vehicles to clear on this date.')
      return
    }

    const targetIds = new Set(targets.map(t => t.id))

    setConfirmModal({
      title: 'Clear all drivers & vehicles?',
      message: `Remove driver and vehicle from all ${targets.length} ticket${targets.length === 1 ? '' : 's'} on ${dateKey}.`,
      detail: 'Applies to every row on this schedule date (current branch). Installer assignments stay. This cannot be undone from here.',
      variant: 'danger',
      confirmText: 'Clear All',
      onConfirm: () => {
        setBulkClearSaving(true)

        // Drop any in-flight per-ticket driver/vehicle patches so they can't undo the bulk clear
        for (const id of targetIds) {
          pendingSavesRef.current.delete(id)
          optimisticTicketsRef.current.delete(id)
        }

        // Instant UI clear
        setTickets(prev => {
          const next = prev.map(t => {
            if (!targetIds.has(t.id)) return t
            const cleared = {
              ...t,
              driverName: undefined,
              driver_name: undefined,
              serviceVehicle: undefined,
              service_vehicle: undefined,
              acDetails: mergeAcMeta(t, {
                driverName: '',
                driver_name: '',
                serviceVehicle: '',
                service_vehicle: '',
              }),
            }
            optimisticTicketsRef.current.set(t.id, cleared)
            return cleared
          })
          writeSchedulesTabCache(schedulesCacheKeyForTab(), next, 'local')
          return next
        })

        // Close modal immediately — persist in background
        setBulkAssignOpen(false)
        setBulkAssignInstaller('')
        setBulkAssignDriver('')
        setBulkAssignVehicle('')
        showToast(`Clearing ${targets.length} ticket${targets.length !== 1 ? 's' : ''}…`)

        void (async () => {
          const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenStr}`,
          }

          // Prod pool is often only 3 connections — fallback must be strictly sequential.
          const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
          const clearOne = async (t: Ticket) => {
            const body = {
              driverName: '',
              serviceVehicle: '',
              acDetails: mergeAcMeta(t, {
                driverName: '',
                driver_name: '',
                serviceVehicle: '',
                service_vehicle: '',
              }),
            }
            const res = await fetch(`${API_BASE_URL}/tickets/${t.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify(body),
            })
            if (!res.ok) throw new Error(await readApiError(res))
          }

          const clearSequential = async () => {
            let failures = 0
            for (const t of targets) {
              if (String(t.id || '').startsWith('temp-') || String(t.id || '').startsWith('tmp-')) continue
              try {
                await clearOne(t)
              } catch {
                failures += 1
                // Back off when pool is saturated
                await sleep(150)
              }
              await sleep(40)
            }
            return failures
          }

          try {
            let usedBulk = false
            try {
              const res = await fetch(`${API_BASE_URL}/tickets/bulk-clear-driver-vehicle`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  scheduleDate: dateKey,
                  branchId: activeBranchId && activeBranchId !== 'ALL_BRANCHES' ? activeBranchId : undefined,
                  ticketIds: targets.map(t => t.id).filter(id => id && !id.startsWith('temp-') && !id.startsWith('tmp-')),
                }),
              })
              if (res.ok) {
                usedBulk = true
                const data = await res.json().catch(() => ({}))
                const count: number = data?.data?.updatedCount ?? targets.length
                showToast(`Cleared drivers & vehicles on ${count} ticket${count !== 1 ? 's' : ''}`)
              } else {
                console.warn('[Schedules] bulk-clear failed, falling back to sequential PATCH', res.status)
              }
            } catch {
              // fall through
            }

            if (!usedBulk) {
              const failures = await clearSequential()
              if (failures > 0) {
                showToast(`Cleared locally · ${failures} still syncing — refresh if needed`)
              } else {
                showToast(`Cleared drivers & vehicles on ${targets.length} ticket${targets.length !== 1 ? 's' : ''}`)
              }
            }
          } catch (err: unknown) {
            // UI already cleared — don't block the user with a hard alert
            console.error('[Schedules] clear persist failed', err)
            showToast('Cleared in view · server sync lagged — refresh later if needed')
          } finally {
            setBulkClearSaving(false)
          }
        })()
      },
    })
  }, [
    tickets,
    dateFilter,
    activeBranchId,
    user?.email,
    user?.jobTitle,
    showToast,
    fetchTickets,
    schedulesCacheKeyForTab,
  ])

  const saveCellEdit = (
    ticket: Ticket,
    colLabel: string,
    value: string,
    injectedPayment?: { amount?: number; modeOfPayment: string; breakdown?: PaymentBreakdownEntry[] }
  ) => {
    const liveTicket = resolveLiveScheduleTicket(ticket)

    const normalizedStatus = value.toUpperCase().replace(/\s+/g, '_')
    const body = buildCellPatchBody(liveTicket, colLabel, value, branchEmployees)
    if (Object.keys(body).length === 0) {
      cancelEdit()
      setStatusPicker(null)
      closeFinalDatePicker()
      return
    }

    if (injectedPayment) {
      body.modeOfPayment = injectedPayment.modeOfPayment
      body.installationCharges = injectedPayment.amount
      body.acDetails = mergeAcMeta(liveTicket, {
        paymentBreakdown: injectedPayment.breakdown && injectedPayment.breakdown.length
          ? injectedPayment.breakdown
          : undefined,
      })
    }

    // Remarks always save in-cell Ã¢â‚¬â€ never open a payment popup.
    let finalBody: Record<string, unknown> = body
    const schedKey = resolveScheduleCompletionDateKey(liveTicket, dateFilter)
    const remarkText = colLabel === 'UPDATE'
      ? stripArchivedRemarkSuffix(value.trim())
      : ''
    if (colLabel === 'UPDATE' && isInstalledRemarks(remarkText)) {
      finalBody = enrichCompletePatchBody(body, liveTicket, schedKey)
    } else if (
      (body.status as string | undefined)?.toUpperCase() === 'COMPLETED'
      || (body.status as string | undefined)?.toUpperCase() === 'INSTALLED'
    ) {
      finalBody = enrichCompletePatchBody(body, liveTicket, schedKey)
    }

    cancelEdit()
    setStatusPicker(null)
    setFinalDatePicker(null)
    setFinalDateCalMonth(null)

    // After marking DONE INSTALL, put the caret in REMARKS so the user types there.
    const focusRemarksAfterStatus = colLabel === 'STATUS' && normalizedStatus === 'DONE_INSTALLED'

    const shouldArchive = shouldArchiveCompletedSchedule(liveTicket, finalBody)
      || (
        colLabel === 'UPDATE'
        && isInstalledRemarks(stripArchivedRemarkSuffix(value.trim()))
        && (String(finalBody.status || '').toUpperCase() === 'COMPLETED' || String(finalBody.status || '').toUpperCase() === 'INSTALLED')
      )

    const archiveBody = finalBody
    queueTicketPatch(
      liveTicket,
      finalBody,
      shouldArchive
        ? async () => {
          const branchId = resolveTicketArchiveBranch(liveTicket, {
            installerName: body.installerName as string | undefined,
            installationCharges: archiveBody.installationCharges as number | undefined,
            modeOfPayment: archiveBody.modeOfPayment as string | undefined,
            remarks: archiveBody.remarksUpdate as string | undefined,
            remarksUpdate: archiveBody.remarksUpdate as string | undefined,
          })
          const archivePayload = buildArchiveServiceReportPayload(
            liveTicket,
            branchId,
            {
              installationCharges: archiveBody.installationCharges as number | undefined,
              modeOfPayment: archiveBody.modeOfPayment as string | undefined,
              remarks: archiveBody.remarksUpdate as string | undefined,
              remarksUpdate: archiveBody.remarksUpdate as string | undefined,
              negotiatorName: resolveNegotiatorName(liveTicket, branchEmployees),
            },
            schedKey,
          )
          if (!archivePayload) {
            alert('Ticket completed but not added to Archives â€” select a branch in the sidebar.')
            return
          }
          try {
            await postArchiveServiceReport(archivePayload, token())
          } catch (err) {
            alert(`Ticket completed but Archives entry failed: ${formatFetchError(err)}`)
          }
        }
        : undefined,
    )

    if (focusRemarksAfterStatus) {
      const nextTicket = mergeTicketPatch(liveTicket, finalBody)
      requestAnimationFrame(() => {
        const rowIndex = visible.findIndex(t => t.id === nextTicket.id)
        startCellEdit(nextTicket, 'UPDATE', undefined, rowIndex >= 0 ? rowIndex : undefined)
      })
    }
  }
  saveCellEditRef.current = (ticket, colLabel, value, injectedPayment) => { void saveCellEdit(ticket, colLabel, value, injectedPayment) }

  // Writes a new trip order (1..N) for a vehicle group, skipping tickets whose PARSED position
  // already matches — legacy formatting quirks (extra spaces, lowercase) otherwise look
  // "different" every render and force a rewrite (and a save) of the whole group on every single
  // move, which is what made this feel unreliable/slow.
  const persistVehicleGroupOrder = useCallback((orderedGroup: Ticket[], baseName: string) => {
    orderedGroup.forEach((t, i) => {
      const existing = parseNameSiteToken(getTicketVehicleDisplay(t))
      if (existing.name === baseName && existing.site === i + 1) return
      const nextLabel = `${baseName} - ${i + 1}`
      const body = buildCellPatchBody(t, 'VEHICLE', nextLabel, branchEmployees)
      if (Object.keys(body).length > 0) queueTicketPatch(t, body)
    })
  }, [branchEmployees, queueTicketPatch])

  // Click-and-drag reorder: commits directly from whichever row the drop actually landed on,
  // recomputed fresh at drop time — not from the separately-tracked hover-preview state, which
  // can only ever be as current as the last dragover event. Trusting that indirection was the
  // likely source of drops that visually landed but silently failed to save.
  const commitVehicleDrop = useCallback((targetTicket: Ticket) => {
    if (!draggedVehicleTicketId || draggedVehicleTicketId === targetTicket.id) return
    const draggedTicket = visible.find(t => t.id === draggedVehicleTicketId)
      || tickets.find(t => t.id === draggedVehicleTicketId)
    if (!draggedTicket) return
    const parsed = parseNameSiteToken(getTicketVehicleDisplay(draggedTicket))
    if (!parsed.name) return
    const targetParsed = parseNameSiteToken(getTicketVehicleDisplay(targetTicket))
    if (targetParsed.name !== parsed.name) return

    const group = visible.filter(t => parseNameSiteToken(getTicketVehicleDisplay(t)).name === parsed.name)
    const fromIndex = group.findIndex(t => t.id === draggedTicket.id)
    const toIndex = group.findIndex(t => t.id === targetTicket.id)
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return

    const reordered = [...group]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    persistVehicleGroupOrder(reordered, parsed.name)
  }, [draggedVehicleTicketId, visible, tickets, persistVehicleGroupOrder])

  // Keyboard reorder: with a VEHICLE cell selected (double-click), Up/Down swaps it with its
  // immediate neighbor in the same vehicle group — same rule as drag-and-drop, never crosses into
  // a different vehicle's rows.
  const moveSelectedVehicleTrip = useCallback((direction: 'up' | 'down') => {
    if (!selectedVehicleTicketId) return
    const ticket = visible.find(t => t.id === selectedVehicleTicketId) || tickets.find(t => t.id === selectedVehicleTicketId)
    if (!ticket) return
    const parsed = parseNameSiteToken(getTicketVehicleDisplay(ticket))
    if (!parsed.name) return
    const group = visible.filter(t => parseNameSiteToken(getTicketVehicleDisplay(t)).name === parsed.name)
    const currentIndex = group.findIndex(t => t.id === ticket.id)
    if (currentIndex === -1) return
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= group.length) return

    const reordered = [...group]
    const [moved] = reordered.splice(currentIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    persistVehicleGroupOrder(reordered, parsed.name)
  }, [selectedVehicleTicketId, visible, tickets, persistVehicleGroupOrder])

  useEffect(() => {
    if (!selectedVehicleTicketId) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        moveSelectedVehicleTrip(e.key === 'ArrowUp' ? 'up' : 'down')
      } else if (e.key === 'Escape') {
        setSelectedVehicleTicketId(null)
      }
    }
    // Any click outside the currently-selected VEHICLE cell deselects it.
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const cell = target.closest('[data-cell-key]')
      if (cell?.getAttribute('data-cell-key') === `${selectedVehicleTicketId}:VEHICLE`) return
      setSelectedVehicleTicketId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('click', handleClickAway)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('click', handleClickAway)
    }
  }, [selectedVehicleTicketId, moveSelectedVehicleTrip])

  const openReschedDialog = (ticket: Ticket) => {
    commitCellEdit()
    const preferred = getPreferredDateKey(ticket)
    const meta = parseAcMeta(ticket)
    const existingTarget = typeof meta.rescheduledTo === 'string' ? meta.rescheduledTo.split('T')[0].trim() : ''
    const initDate = isReschedulePending(ticket) ? '' : (existingTarget || preferred || dateFilter || todayDateKey())
    setReschedDialog({ ticket })
    setReschedToDate(initDate)
    setReschedPending(isReschedulePending(ticket))
    const startKey = initDate || todayDateKey()
    const startDate = new Date(`${startKey}T00:00:00`)
    const todayDate = new Date(`${todayDateKey()}T00:00:00`)
    // Always open on today's month (or the selected date's month if it's in the future)
    const calViewDate = startDate >= todayDate ? startDate : todayDate
    setReschedCalMonth({ year: calViewDate.getFullYear(), month: calViewDate.getMonth() })
  }

  const closeReschedDialog = () => {
    setReschedDialog(null)
    setReschedToDate('')
    setReschedPending(false)
    setReschedCalMonth(null)
  }

  const commitInlineReschedule = async () => {
    if (!reschedDialog) return
    const { ticket } = reschedDialog
    if (!reschedPending && !reschedToDate.trim()) {
      alert('Pick a new date or mark as Pending if no slot is available yet.')
      return
    }

    const body = buildReschedulePatchBody(ticket, {
      newDateKey: reschedPending ? null : reschedToDate,
      pending: reschedPending,
    })
    if (Object.keys(body).length === 0) {
      alert('Could not build reschedule update.')
      return
    }

    closeReschedDialog()
    queueTicketPatch(ticket, body)
  }

  const openContinuationDialog = (ticket: Ticket) => {
    commitCellEdit()
    const existingDates = getContinuationDates(ticket)
    setContinuationDialog({ ticket })
    setContinuationSelectedDates(existingDates)

    const todayKey = todayDateKey()
    const startKey = existingDates[0] || todayKey
    const startDate = new Date(`${startKey}T00:00:00`)
    setContinuationCalMonth({ year: startDate.getFullYear(), month: startDate.getMonth() })
  }

  const closeContinuationDialog = () => {
    setContinuationDialog(null)
    setContinuationSelectedDates([])
    setContinuationCalMonth(null)
  }

  const commitInlineContinuation = async () => {
    if (!continuationDialog) return
    const { ticket } = continuationDialog

    const body: Record<string, unknown> = { status: 'CONTINUATION' }
    const acUpdates: Record<string, unknown> = {
      continuationDates: continuationSelectedDates
    }
    body.acDetails = mergeAcMeta(ticket, acUpdates)

    closeContinuationDialog()
    queueTicketPatch(ticket, body)
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Delete Ã¢â‚¬â€ remove row instantly, DELETE in background Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleDelete = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId)
      || optimisticTicketsRef.current.get(ticketId)
      || overviewResults.find(t => t.id === ticketId)
    const name = ticket?.customerName || ticket?.customer_name || ticket?.title || "this ticket"
    setContextMenu(null)
    setDetailTicket(prev => (prev?.id === ticketId ? null : prev))
    setConfirmModal({
      title: "Delete ticket?",
      message: "This action cannot be undone.",
      detail: name,
      variant: "danger",
      confirmText: "Delete",
      onConfirm: () => commitDeleteTicket(ticketId),
    })
  }

  const commitDeleteTicket = (ticketId: string) => {
    const rollback = tickets.find(t => t.id === ticketId)
      || optimisticTicketsRef.current.get(ticketId)
      || overviewResults.find(t => t.id === ticketId)
    if (!rollback) {
      alert("Ticket not found.")
      return
    }

    // Instant UI remove
    deletedTicketsRef.current.add(ticketId)
    pendingSavesRef.current.delete(ticketId)
    optimisticTicketsRef.current.delete(ticketId)
    setTickets(prev => {
      const next = prev.filter(t => t.id !== ticketId)
      const cacheKey = schedulesCacheKeyForTab()
      writeSchedulesTabCache(cacheKey, next, "local")
      return next
    })
    setOverviewResults(prev => prev.filter(t => t.id !== ticketId))
    setEditModalOpen(false)
    setConfirmModal(null)

    // Temp rows are not on the server yet Ã¢â‚¬â€ local remove is enough.
    // If an in-flight Excel import later creates the real ticket, it will DELETE that id.
    if (isTempTicketId(ticketId)) {
      console.log('[Schedules] Removed unsaved ticket locally', { ticketId })
      return
    }

    void (async () => {
      try {
        const auth = token()
        if (!auth) throw new Error('Not signed in Ã¢â‚¬â€ refresh and try again.')
        const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${auth}` },
        })
        if (!res.ok) throw new Error(await readApiError(res))
        console.log('[Schedules] Deleted ticket in database', { ticketId })
        clearRelaysCache()
        clearWarrantyCache()
      } catch (err: unknown) {
        const reason = formatFetchError(err)
        console.error('[Schedules] Delete ticket FAILED', { ticketId, reason, err })
        deletedTicketsRef.current.delete(ticketId)
        optimisticTicketsRef.current.set(ticketId, rollback)
        setTickets(prev => {
          if (prev.some(t => t.id === ticketId)) return prev
          const next = [rollback, ...prev]
          const cacheKey = schedulesCacheKeyForTab()
          writeSchedulesTabCache(cacheKey, next, 'local')
          return next
        })
        alert(`Could not delete ticket: ${reason}`)
      }
    })()
  }



  function wrapEditingCell(editor: React.ReactNode, colLabel: string) {
    const expW = 200
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

  function renderInlineCellEditor(ticket: Ticket, colLabel: string, rowIndex: number | undefined, rowGhost?: boolean) {
    if (!editingCell || editingCell.ticketId !== ticket.id || editingCell.colLabel !== colLabel || rowGhost) return null
    if (rowIndex != null && editingCell.rowIndex !== rowIndex) return null

    const isSaving = savingTicketIds.has(ticket.id)
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
      void commitCellEdit()
    }

    const onBlur = () => {
      cellEditBlurTimer.current = setTimeout(commit, 80)
    }

    const syncDraftValue = (value: string) => {
      cellEditDraftRef.current = {
        ticketId: ticket.id,
        rowIndex: editingCell.rowIndex,
        colLabel,
        value,
      }
      setEditingCell(prev => (prev ? { ...prev, value } : null))
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        discardCellEdit()
      } else if (e.key === 'Enter' && !e.shiftKey && colLabel !== 'DESTINATION' && colLabel !== 'COMMIT') {
        e.preventDefault()
        commit()
      }
    }

    if (colLabel === 'STATUS') {
      // Status uses the dedicated popup picker instead of an inline select.
      return null
    }

    if (colLabel === 'FINAL DATE') {
      // FINAL DATE uses the floating calendar popup.
      return null
    }

    if (colLabel === 'NEGOTIATOR') {
      const ticketBranchId = resolveTicketScheduleBranchId(ticket, installerLineupIndex, driverOnlyNames) || activeBranchId
      const options = negotiatorsForBranch(ticketBranchId)
      const current = editingCell.value
      return wrapEditingCell(
        <select
          autoFocus
          disabled={isSaving}
          value={current}
          onChange={e => syncDraftValue(e.target.value)}
          onBlur={onBlur}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className="w-full rounded-md outline-none cursor-pointer"
          style={{ ...inputStyle, paddingRight: 4 }}
        >
          <option value="">{EMPTY_CELL} Select negotiator {EMPTY_CELL}</option>
          {options.map(emp => (
            <option key={emp.id} value={emp.name}>{formatNegotiatorLabel(emp)}</option>
          ))}
          {current && !options.some(emp => emp.name === current) && (
            <option value={current}>{current}</option>
          )}
        </select>,
        colLabel,
      )
    }

    if (colLabel === 'INSTALLER' || (colLabel === 'SERVICE' && !isMyTickets) || (colLabel === 'VEHICLE' && !isMyTickets)) {
      const roster = rosterForTicket(ticket)
      const options = colLabel === 'INSTALLER' ? roster.installers : roster.drivers
      const listId = `ticket-roster-${ticket.id}-${colLabel}`
      return wrapEditingCell(
        <>
          <input
            autoFocus
            disabled={isSaving}
            type="text"
            list={listId}
            value={editingCell.value}
            onChange={e => syncDraftValue(e.target.value)}
            onBlur={onBlur}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={onKeyDown}
            className="w-full rounded-md outline-none"
            style={inputStyle}
            placeholder={
              colLabel === 'INSTALLER' ? 'Select or type installer\u2026'
                : colLabel === 'VEHICLE' ? 'Type vehicle code\u2026'
                  : 'Select or type driver\u2026'
            }
          />
          <datalist id={listId}>
            {options.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>,
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
          onChange={e => syncDraftValue(e.target.value)}
          onBlur={onBlur}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={onKeyDown}
          ref={el => {
            if (!el || el.dataset.caretReady === '1') return
            el.dataset.caretReady = '1'
            setTimeout(() => {
              el.focus()
              const len = el.value.length
              try { el.setSelectionRange(len, len) } catch { /* ignore */ }
            }, 50)
          }}
          className="w-full resize-y rounded-md outline-none"
          style={{ ...inputStyle, minHeight: 52, maxHeight: 110 }}
          placeholder={colLabel === 'UPDATE' ? 'Type remarks\u2026' : undefined}
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
        onChange={e => syncDraftValue(e.target.value)}
        onBlur={onBlur}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
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
    rowIndex?: number,
  ) {
    if (!canEdit || rowGhost) return content
    const isEditing = editingCell?.ticketId === ticket.id
      && editingCell?.colLabel === colLabel
      && (rowIndex === undefined || editingCell.rowIndex === rowIndex)
    if (isEditing) return content
    const isHovered = hoveredCell?.ticketId === ticket.id && hoveredCell?.colLabel === colLabel
    if (!isHovered) return content
    return (
      <div className="relative">
        <div style={{ paddingRight: 18 }}>{content}</div>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
          onClick={e => {
            e.stopPropagation()
            const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
            startCellEdit(ticket, colLabel, cell, rowIndex)
          }}
          title="Edit in cell"
          className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 rounded hover:bg-emerald-500/15"
          style={{ color: textMuted, lineHeight: 1 }}
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    )
  }

  const copyTextToClipboard = async (text: string) => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      showToast('Address copied Ã¢Å“â€œ')
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      showToast('Address copied Ã¢Å“â€œ')
    }
  }

  function renderCell(ticket: Ticket, col: (typeof columns)[0], idx?: number, rowGhost?: boolean, ghostKind?: 'completed' | 'resched' | 'cancelled' | null, cellExpanded = false) {
    const { label } = col
    const rowIndex = idx ?? visible.findIndex(t => t.id === ticket.id)

    const inlineEditor = renderInlineCellEditor(ticket, label, rowIndex >= 0 ? rowIndex : undefined, rowGhost)
    if (inlineEditor) return inlineEditor

    // Ã¢â€â‚¬Ã¢â€â‚¬ DISPLAY STATE Ã¢â€â‚¬Ã¢â€â‚¬
    const val = getCellDisplay(ticket, label)
    const ghostMuted = rowGhost
      ? (ghostKind === 'completed' ? (isLight ? '#166534' : '#86efac')
        : ghostKind === 'resched' ? (isLight ? '#a16207' : '#fbbf24')
        : ghostKind === 'cancelled' ? (isLight ? '#dc2626' : '#f87171')
        : textMuted)
      : textPrimary
    const showExpanded = cellExpanded
    const truncStyle: React.CSSProperties = showExpanded
      ? { wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45, display: 'block', paddingRight: '4px', color: ghostMuted, opacity: rowGhost ? 0.72 : 1, textTransform: label !== 'UPDATE' ? 'uppercase' : undefined }
      : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%', color: ghostMuted, opacity: rowGhost ? 0.72 : 1, textTransform: label !== 'UPDATE' ? 'uppercase' : undefined }

    if (label === 'DESTINATION') {
      const fullAddress = formatAddress(ticket.location)
      const district = resolveTicketDistrict(ticket)
      if (cellExpanded) {
        return (
          <>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Full Address</div>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  void copyTextToClipboard(fullAddress)
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-slate-500/10"
                style={{ color: textMuted }}
                title="Copy address"
                aria-label="Copy address"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              className="whitespace-normal break-words text-left normal-case font-semibold leading-relaxed"
              style={{ color: textPrimary }}
            >
              {fullAddress || EMPTY_CELL}
            </div>
          </>
        )
      }
      return withEditPencil(
        <span style={truncStyle} title={fullAddress}>
          {district || EMPTY_CELL}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'STATUS') {
      const outcome = getScheduleOutcome(ticket)
      if (rowGhost) {
        if (ghostKind === 'completed' || isCompletedGhostOnDate(ticket, dateFilter)) {
          if (outcome === 'DONE_CLEANING') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#0369a1' : '#7dd3fc' }} title="Done Cleaning">
                DONE CLEANING
              </span>
            )
          }
          if (outcome === 'DONE_SURVEY') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#a16207' : '#fbbf24' }} title="Done Survey">
                DONE SURVEY
              </span>
            )
          }
          if (outcome === 'DONE_CHECKUP') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#a16207' : '#fbbf24' }} title="Done Checkup">
                DONE CHECKUP
              </span>
            )
          }
          if (outcome === 'DONE_BACKJOB') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#c2410c' : '#fdba74' }} title="Done Backjob">
                DONE BACKJOB
              </span>
            )
          }
          if (outcome === 'DONE_SYSTEM_REPROCESS') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#4338ca' : '#a5b4fc' }} title="Done System Reprocess">
                DONE SYSTEM REPROCESS
              </span>
            )
          }
          if (outcome === 'DONE_DISMANTLE') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#be123c' : '#fb7185' }} title="Done Dismantle">
                DONE DISMANTLE
              </span>
            )
          }
          return (
            <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#15803d' : '#86efac' }} title={`Installed ${EMPTY_CELL} see Archives tab`}>
              INSTALLED
            </span>
          )
        }
        if (ghostKind === 'cancelled') {
          return (
            <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#dc2626' : '#f87171' }} title="Cancelled">
              CANCELLED
            </span>
          )
        }
        return (
          <span style={{ ...truncStyle, fontWeight: 700, fontStyle: 'italic', color: isLight ? '#a16207' : '#fbbf24' }} title="Rescheduled">
            RESCHED
          </span>
        )
      }
      const statusVal = getScheduleStatusValue(ticket)
      const statusColor = getScheduleStatusBadgeStyle(statusVal, isLight).color
      const display = getScheduleStatusDisplay(ticket) || EMPTY_CELL
      let displayLabel = display === 'INSTALLATION' ? 'INSTALL' : ((display === 'FOR APPROVAL' || display === 'FOR QUOTATION') ? 'QUOTATION' : display)
      if (display === 'CONTINUATION') {
        const nextDate = getNextContinuationDate(ticket, dateFilter || todayDateKey())
        if (nextDate) {
          const formattedDate = formatSimpleDateShort(nextDate)
          displayLabel = `CONT · ${formattedDate}`
        } else {
          displayLabel = 'CONT'
        }
      }
      const showsDetails = statusShowsScheduleDetails(statusVal)
      const statusTitle = showsDetails
        ? `${display} ${EMPTY_CELL} click to view remarks & payment`
        : (canEdit ? `${display} ${EMPTY_CELL} click to change` : display)
      return (
        <span
          style={{
            ...truncStyle,
            fontWeight: 700,
            color: statusColor,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
          title={statusTitle}
        >
          {displayLabel}
        </span>
      )
    }

    if (label === 'TICKET NO') {
      const rawVal = val || EMPTY_CELL
      const isRowSaving = savingTicketIds.has(ticket.id)
      return withEditPencil(
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }} title={rawVal}>
          {idx !== undefined && (
            <span style={{ color: isLight ? '#94a3b8' : '#64748b', marginRight: 6, flexShrink: 0, fontWeight: 600, fontSize: '0.7rem' }}>
              {idx + 1}.
            </span>
          )}
          <span style={{ ...truncStyle, fontWeight: 900, letterSpacing: '0.05em', color: textPrimary }}>
            {rawVal}
          </span>
          {isRowSaving && (
            <Loader2
              className="w-3 h-3 shrink-0 animate-spin"
              style={{ color: green, marginLeft: 4 }}
              aria-label="Saving"
            />
          )}
        </div>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'FINAL DATE') {
      const hasDate = Boolean(val)
      if (!hasDate && canEdit && !rowGhost) {
        return (
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); startCellEdit(ticket, label, e.currentTarget as HTMLElement, rowIndex) }}
            className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md border border-dashed text-[9.5px] font-bold uppercase tracking-wide transition-colors"
            style={{
              color: isLight ? '#15803D' : '#6EE7B7',
              borderColor: isLight ? 'rgba(22,163,74,0.32)' : 'rgba(110,231,183,0.35)',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isLight ? 'rgba(22,163,74,0.07)' : 'rgba(16,185,129,0.12)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <CalendarDays className="w-3 h-3 shrink-0 opacity-90" />
            Add Date
          </button>
        )
      }
      return withEditPencil(
        <span
          style={{
            ...truncStyle,
            fontWeight: hasDate ? 700 : 500,
            color: hasDate ? green : textMuted,
          }}
          title={val}
        >
          {val || EMPTY_CELL}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'SERVICE' && isMyTickets) {
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 700, letterSpacing: '0.04em' }} title={val}>
          {val || 'SURVEY & INSTALL'}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'SERVICE') {
      // Driver name only — val is already getTicketDriverDisplay's clean driverName-only read
      // (no vehicle text ever leaks in here, no re-parsing needed). Strip any legacy "- N"
      // suffix some older tickets still carry — trip numbering now lives on VEHICLE only.
      // Use .label (not .name) so "MANNY / ROMAR - 2" keeps both names.
      const driverName = parseNameSiteToken(val).label || val
      if (!driverName && canEdit && !isMyTickets && !rowGhost) {
        return (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={e => {
              e.stopPropagation()
              const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
              startCellEdit(ticket, label, cell, rowIndex)
            }}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide transition-all hover:opacity-80"
            style={{
              color: isLight ? '#16a34a' : '#4ade80',
              backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.15)',
              border: `1px dashed ${isLight ? '#86efac' : 'rgba(74,222,128,0.35)'}`,
            }}
          >
            + Add
          </button>
        )
      }
      return withEditPencil(
        <span
          className="block w-full text-center font-bold tracking-wide uppercase leading-tight"
          style={{ color: ghostMuted, opacity: rowGhost ? 0.72 : 1 }}
          title={driverName}
        >
          {driverName || EMPTY_CELL}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'VEHICLE' && !isMyTickets) {
      // Prefer auto trip label ("STRADA - 2") so the red number always matches table ordering.
      const vehicleCode = vehicleTripLabels.get(ticket.id || '') || getTicketVehicleDisplay(ticket) || val
      if (!vehicleCode && canEdit && !rowGhost) {
        return (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={e => {
              e.stopPropagation()
              const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
              startCellEdit(ticket, label, cell, rowIndex)
            }}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide transition-all hover:opacity-80"
            style={{
              color: isLight ? '#2563eb' : '#60a5fa',
              backgroundColor: isLight ? '#dbeafe' : 'rgba(37,99,235,0.15)',
              border: `1px dashed ${isLight ? '#93c5fd' : 'rgba(96,165,250,0.35)'}`,
            }}
          >
            + Add
          </button>
        )
      }
      const canDragVehicle = canEdit && !rowGhost && Boolean(vehicleCode)
      // "MIRAGE - 2" splits into a plain name and a red trip number that live-updates as the
      // ticket's position in its vehicle group changes (drag-and-drop) — never manually typed.
      const parsedVehicle = parseNameSiteToken(vehicleCode)
      // .label keeps full crew/vehicle text and strips only the "- N" trip suffix
      const vehicleBaseName = parsedVehicle.label || vehicleCode
      const vehicleTripNumber = parsedVehicle.site === Number.MAX_SAFE_INTEGER ? '' : String(parsedVehicle.site)
      if (!vehicleCode) {
        return (
          <span
            className="block w-full text-center font-bold tracking-wide uppercase leading-tight rounded"
            style={{ color: ghostMuted, opacity: rowGhost ? 0.72 : 1 }}
          >
            {EMPTY_CELL}
          </span>
        )
      }
      return (
        <VehicleTripLabel
          name={vehicleBaseName}
          tripNumber={vehicleTripNumber}
          nameColor={ghostMuted}
          tripColor={isLight ? '#DC2626' : '#F87171'}
          opacity={rowGhost ? 0.72 : 1}
          title={vehicleCode}
          canDrag={canDragVehicle}
          onDragStart={e => {
            e.stopPropagation()
            e.dataTransfer.effectAllowed = 'move'
            // No visible drag ghost — a live table row rendered as a drag image comes out garbled
            // (overlapping/duplicated text). The row stays exactly where it is horizontally AND
            // vertically; the slide animation on the other rows is what shows the move happening.
            if (dragGhostImgRef.current) e.dataTransfer.setDragImage(dragGhostImgRef.current, 0, 0)
            setDraggedVehicleTicketId(ticket.id)
          }}
          onDragEnd={e => {
            e.stopPropagation()
            setDraggedVehicleTicketId(null)
            setVehicleDropTargetId(null)
          }}
        />
      )
    }

    if (label === 'CONTACT NO.') {
      const formatted = val ? fmtPhone(val) || val : ''
      return withEditPencil(
        <a href={val ? `tel:${val.replace(/\D/g, '').replace(/^0/, '+63')}` : '#'}
          style={{ color: '#10B981', ...truncStyle }}
          onClick={e => { e.stopPropagation(); }}
          title={val}>
          {formatted}
        </a>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'NOTE') {
      return withEditPencil(
        <span style={{ ...truncStyle, color: val ? '#EF4444' : textMuted, fontWeight: val ? 600 : 400 }}
          title={val}>
          {val || ''}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'UPDATE') {
      const remarksText = rowGhost
        ? formatGhostRemarks(ticket, ghostKind ?? null, dateFilter)
        : getScheduleUpdateDisplay(ticket)
      if (cellExpanded) {
        const isCompletedGhost = ghostKind === 'completed' || isCompletedGhostOnDate(ticket, dateFilter)
        const ghostRemarkColor = isCompletedGhost
          ? (isLight ? '#15803d' : '#86efac')
          : ghostKind === 'cancelled' ? (isLight ? '#dc2626' : '#f87171') : (isLight ? '#a16207' : '#fbbf24')
        return (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>Remarks</div>
            <div
              className="whitespace-normal break-words leading-relaxed"
              style={{
                color: remarksText
                  ? (rowGhost ? ghostRemarkColor : textGreen)
                  : textMuted,
                fontWeight: remarksText ? 600 : 400,
                fontStyle: rowGhost ? 'italic' : undefined,
              }}
            >
              {remarksText || EMPTY_CELL}
            </div>
          </>
        )
      }
      if (rowGhost) {
        const ghostRemarks = remarksText
        const isCompletedGhost = ghostKind === 'completed' || isCompletedGhostOnDate(ticket, dateFilter)
        const ghostRemarkColor = isCompletedGhost
          ? (isLight ? '#15803d' : '#86efac')
          : ghostKind === 'cancelled' ? (isLight ? '#dc2626' : '#f87171') : (isLight ? '#a16207' : '#fbbf24')
        return (
          <span
            style={{
              ...truncStyle,
              color: ghostRemarkColor,
              fontWeight: 600,
              fontStyle: 'italic',
            }}
            title={ghostRemarks}
          >
            {ghostRemarks || EMPTY_CELL}
          </span>
        )
      }
      return withEditPencil(
        <span style={{ ...truncStyle, color: val ? textGreen : textMuted, fontWeight: val ? 600 : 400 }}
          title={val}>
          {val || EMPTY_CELL}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'PAYMENT') {
      if (shouldBlankReschedGhostPayment(dateFilter, ghostKind)) {
        return <span style={{ ...truncStyle, color: textMuted }}>{EMPTY_CELL}</span>
      }
      const combined = sanitizeDisplayText(getSchedulePaymentDisplay(ticket, dateFilter, ghostKind))
      const mode = getPaymentMode(ticket).trim().toUpperCase()
      const amountStr = formatPaymentAmount(ticket)
      const isHybrid = mode === 'HYBRID'
      const breakdown = isHybrid ? getPaymentBreakdown(ticket) : []
      const breakdownStr = formatPaymentBreakdownText(breakdown)
      if (cellExpanded) {
        return (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>Payment</div>
            {!combined ? (
              <div style={{ color: textMuted }}>{EMPTY_CELL}</div>
            ) : mode === 'FREE' || mode === 'FREE INSTALL' ? (
              <div style={{ fontWeight: 700, color: isLight ? '#047857' : '#6ee7b7' }}>FREE</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {mode ? (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Mode </span>
                    <span style={{ fontWeight: 600, color: textPrimary }}>{mode}</span>
                  </div>
                ) : null}
                {amountStr ? (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Amount </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: textPrimary }}>{formatPesoPrefix(amountStr)}</span>
                  </div>
                ) : null}
                {isHybrid && breakdown.length ? (
                  <div className="flex flex-col gap-0.5">
                    {breakdown.map((entry, i) => (
                      <div key={`${entry.mode}-${i}`} className="text-[10.5px]" style={{ color: textMuted }}>
                        {entry.mode} <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: textPrimary }}>{Math.round(entry.amount).toLocaleString('en-PH')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )
      }
      if (!combined) {
        return <span style={{ ...truncStyle, color: textMuted }}>{EMPTY_CELL}</span>
      }
      if (mode === 'FREE' || mode === 'FREE INSTALL') {
        return (
          <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#047857' : '#6ee7b7' }} title={combined}>
            FREE
          </span>
        )
      }
      return (
        <span style={{ ...truncStyle, fontVariantNumeric: 'tabular-nums' }} title={combined}>
          {amountStr ? (
            <span style={{ fontWeight: 700, color: isLight ? '#0f172a' : '#f1f5f9' }}>{amountStr}</span>
          ) : null}
          {mode && amountStr ? ' ' : null}
          {mode && (
            <span style={{ fontWeight: 600, color: isLight ? '#475569' : '#94a3b8', letterSpacing: '0.03em' }}>
              {mode}
            </span>
          )}
          {isHybrid && breakdownStr ? (
            <span style={{ fontWeight: 500, color: textMuted, marginLeft: 4 }}>
              {breakdownStr}
            </span>
          ) : null}
        </span>
      )
    }

    if (label === "CUSTOMER'S NAME") {
      const phoneNum = getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
      const formattedPhone = phoneNum ? fmtPhone(phoneNum) || phoneNum : ''
      if (cellExpanded) {
        return (
          <>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Contact Number</div>
              {phoneNum && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    void copyTextToClipboard(phoneNum)
                  }}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-slate-500/10"
                  style={{ color: textMuted }}
                  title="Copy phone number"
                  aria-label="Copy phone number"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div
              className="whitespace-normal break-words text-left normal-case font-semibold leading-relaxed"
              style={{ color: textPrimary }}
            >
              {formattedPhone || 'No contact number available'}
            </div>
          </>
        )
      }
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 600 }} title={val}>
          {val}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'INSTALLER') {
      const rawInstaller = getInstallerDisplay(ticket, branchEmployees, activeBranchId)
      const isEmpty = !rawInstaller

      const prevInstaller = idx != null && idx > 0
        ? getInstallerDisplay(visible[idx - 1], branchEmployees, activeBranchId)
        : ''
      const curToken = parseNameSiteToken(rawInstaller)
      const prevToken = parseNameSiteToken(prevInstaller)
      const isNewInstallerGroup = idx != null && idx > 0 && curToken.name && prevToken.name && curToken.name !== prevToken.name

      if (isEmpty) {
        if (canEdit && !isMyTickets && !rowGhost) {
          return (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
              onClick={e => {
                e.stopPropagation()
                const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
                startCellEdit(ticket, label, cell, rowIndex)
              }}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all hover:opacity-80"
              style={{
                color: isLight ? '#16a34a' : '#4ade80',
                backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.15)',
                border: `1px dashed ${isLight ? '#86efac' : 'rgba(74,222,128,0.35)'}`,
              }}
            >
              + Add
            </button>
          )
        }
        return withEditPencil(
          <span style={{ ...truncStyle, color: textMuted }} title="No Installer">
            {EMPTY_CELL}
          </span>,
          ticket, label, rowGhost, rowIndex,
        )
      }

      // Use .label (strips "- N" trip suffix) not .name — .name also chops "MANNY / ROMAR" to "MANNY".
      const displayInstaller = curToken.label || rawInstaller
      return withEditPencil(
        <span
          style={{
            ...truncStyle,
            display: 'block',
            borderTop: isNewInstallerGroup ? `2px solid ${isLight ? '#d1d5db' : '#475569'}` : undefined,
            paddingTop: isNewInstallerGroup ? 8 : 0,
            marginTop: isNewInstallerGroup ? 4 : 0,
          }}
          title={displayInstaller}
        >
          {displayInstaller}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'NEGOTIATOR') {
      const negName = getTicketNegotiatorName(ticket, branchEmployees) || EMPTY_CELL
      return withEditPencil(
        <div className="flex flex-col items-center justify-center text-center">
          <span style={{ ...truncStyle, fontWeight: 600 }} title={negName}>
            {negName !== EMPTY_CELL ? <EmployeeNameLink nameOrId={negName} /> : negName}
          </span>
        </div>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    return withEditPencil(
      <span style={truncStyle} title={val}>{val || (label === 'UPDATE' || label === 'SERVICE' ? EMPTY_CELL : '')}</span>,
      ticket, label, rowGhost,
    )
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Render Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full" onClick={() => {
      setContextMenu(null)
      if (!saving && !editModalOpen && !addModalOpen) commitCellEdit()
      setHoveredCell(null)
      setExpandedCell(null)
    }}>

      {/* Toast Ã¢â‚¬â€ success/info only; saves run silently in background */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[9999] px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-2xl transition-all"
          style={{ backgroundColor: green }}>
          {toast}
        </div>
      )}
      {scanning && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 animate-spin text-[#10B981] mb-2" />
          <span className="text-sm font-bold text-white">AI OCR scanning voucher/receipt...</span>
        </div>
      )}

      {/* Hidden file inputs */}
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

      {/* ── Portal: My Tickets toolbar (Active Branch + negotiator filter) ── */}
      {isMyTickets && ReactDOM.createPortal(
        <div className="w-full px-3 md:px-5 pt-2 pb-2.5 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2.5 w-full md:w-[240px] lg:w-[320px] h-9 md:h-11 px-3 md:px-4 rounded-xl md:rounded-2xl border transition-all shrink-0"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search names, phone…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-[12px] md:text-sm flex-1 min-w-0"
              style={{ color: textPrimary }}
              onClick={e => e.stopPropagation()}
            />
            {searchQuery && (
              <button type="button" onClick={e => { e.stopPropagation(); setSearchQuery('') }}
                className="shrink-0 p-1 md:p-1.5 rounded-full hover:bg-slate-500/10 transition-colors" style={{ color: textMuted }}>
                <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
            )}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 min-w-0 flex-1 md:flex-none">
              <label className="text-[10px] md:text-[11px] font-black uppercase tracking-wider shrink-0" style={{ color: textMuted }}>
                Negotiator
              </label>
              <select
                value={myTicketsNegotiatorFilter}
                onChange={e => setMyTicketsNegotiatorFilter(e.target.value)}
                className="h-9 md:h-11 px-3 rounded-xl md:rounded-2xl border text-[12px] md:text-sm font-semibold min-w-0 flex-1 md:w-[260px] outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                title={activeBranchLabel ? `Negotiators for ${activeBranchLabel}` : 'Filter by negotiator'}
              >
                <option value="">All negotiators{activeBranchLabel ? ` · ${activeBranchLabel}` : ''}</option>
                {myTicketsNegotiatorOptions.map(emp => (
                  <option key={emp.id} value={emp.id}>{formatNegotiatorLabel(emp)}</option>
                ))}
              </select>
            </div>
          )}
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body,
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Portal: Toolbar into header slot Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {!isMyTickets && activeTab !== 'overview' && ReactDOM.createPortal(
        <div className="w-full px-3 md:px-5 pt-2 pb-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">

          {/* ── Left Side: Date Chips & Search ── */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1 min-w-0">
            {activeTab === 'schedules' && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                {weeklyTabs.map(tab => {
                  const isActive = dateFilter === tab.key
                  return (
                    <button
                      type="button"
                      key={tab.key}
                      onClick={() => handleDateFilterChange(tab.key)}
                      className="h-8 md:h-10 px-3 md:px-5 rounded-full text-[11px] md:text-[13px] font-semibold border whitespace-nowrap shrink-0 transition-all active:scale-95"
                      style={{
                        backgroundColor: isActive ? green : inputBg,
                        borderColor: isActive ? green : inputBorder,
                        color: isActive ? '#ffffff' : textMuted,
                        boxShadow: isActive ? `0 2px 8px rgba(16,185,129,0.35)` : 'none',
                      }}
                    >
                      {tab.dayName} {tab.dateLabel}
                    </button>
                  )
                })}

                {isCustomSelected && (
                  <div className="relative">
                    <button
                      type="button"
                      className="h-8 md:h-10 px-3 md:px-5 rounded-full text-[11px] md:text-[13px] font-semibold border whitespace-nowrap shrink-0 active:scale-95"
                      style={{ backgroundColor: green, borderColor: green, color: '#ffffff', boxShadow: '0 2px 8px rgba(16,185,129,0.35)' }}
                    >
                      {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </button>
                    <input
                      type="date"
                      value={dateFilter}
                      onChange={e => handleDateFilterChange(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      aria-label="Ticket date filter"
                    />
                  </div>
                )}

                <div className="relative">
                  <button
                    type="button"
                    className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full border shrink-0 transition-all hover:opacity-80 active:scale-90"
                    style={{ borderColor: inputBorder, backgroundColor: inputBg }}
                    title="Pick date"
                  >
                    <CalendarDays className="w-4 h-4 md:w-4.5 md:h-4.5" style={{ color: green }} />
                  </button>
                  <input
                    ref={dateFilterInputRef}
                    type="date"
                    value={dateFilter}
                    onChange={e => handleDateFilterChange(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    aria-label="Ticket date filter"
                  />
                </div>
              </div>
            )}

            {/* ── Search bar (Next to Date Chips on Desktop) ── */}
            {activeTab === 'schedules' && (
              <div className="flex items-center gap-2.5 w-full md:w-[240px] lg:w-[320px] h-9 md:h-11 px-3 md:px-4 rounded-xl md:rounded-2xl border transition-all shrink-0"
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
                <Search className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" style={{ color: textMuted }} />
                <input
                  type="text"
                  placeholder="Search names, phone…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent outline-none text-[12px] md:text-sm flex-1 min-w-0"
                  style={{ color: textPrimary }}
                  onClick={e => e.stopPropagation()}
                />
                {searchQuery && (
                  <button type="button" onClick={e => { e.stopPropagation(); setSearchQuery('') }}
                    className="shrink-0 p-1 md:p-1.5 rounded-full hover:bg-slate-500/10 transition-colors" style={{ color: textMuted }}>
                    <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Assign Drivers button */}
          {activeTab === 'schedules' && canEdit && !isMyTickets && (
            <button
              type="button"
              id="bulk-assign-driver-btn"
              onClick={(e) => { e.stopPropagation(); setBulkAssignOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-black tracking-wide shrink-0 transition-all hover:opacity-90 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #2563EB, #1d4ed8)',
                color: '#ffffff',
                boxShadow: '0 2px 12px rgba(37,99,235,0.45)',
                border: '1.5px solid rgba(255,255,255,0.12)',
              }}
              title="Assign driver and vehicle to an installer's tickets"
            >
              <Car className="w-4 h-4" />
              Assign Drivers
            </button>
          )}

          {/* ── Right: Showcase button ─────────────── */}
          {activeTab === 'schedules' && !isMyTickets && (
            <div className="flex items-center gap-1.5 shrink-0 relative justify-end hidden md:flex">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  persistSchedulesSnapshot()
                  setShowcaseOpen(true)
                }}
                className="flex items-center gap-1.5 md:gap-2 h-8 md:h-10 px-4 md:px-6 rounded-full text-[12px] md:text-[14px] font-bold transition-all shrink-0 active:scale-95"
                style={{
                  backgroundColor: showcaseOpen ? 'transparent' : green,
                  border: `1.5px solid ${green}`,
                  color: showcaseOpen ? green : '#ffffff',
                  boxShadow: showcaseOpen ? 'none' : '0 2px 8px rgba(16,185,129,0.3)',
                }}
                title="Open fullscreen schedule showcase for print / PDF"
              >
                <Maximize2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">{showcaseOpen ? 'Active' : 'Showcase'}</span>
              </button>
            </div>
          )}
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {!isMyTickets && showcaseOpen && ReactDOM.createPortal(
        <div className="flex items-center justify-between gap-3 px-5 md:px-8 py-2 bg-red-500/10 border-b border-red-500/20">
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
             Full-screen view &mdash; click <em>Export PDF to Print</em>, then Exit Showcase.
          </span>
          <button
            type="button"
            onClick={() => setShowcaseOpen(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
            style={{
              backgroundColor: 'transparent',
              border: `2px solid ${green}`,
              color: green,
            }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Exit Showcase
          </button>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {/* Sort reset strip — replaces the old stats bar */}
      {!isMyTickets && activeTab === 'schedules' && sortDiffersFromDefault && (
        <div className="flex items-center justify-end px-4 py-1.5 border-b shrink-0"
          style={{ backgroundColor: cardBg, borderColor: border }}>
          <button
            type="button"
            onClick={() => setSortConfig(defaultSortForSchedulesView(isMyTickets))}
            className="text-[10px] font-bold uppercase tracking-wide hover:underline"
            style={{ color: green }}
          >
            Reset sort
          </button>
        </div>
      )}

      {/* Error */}
      {fetchError && activeTab === 'schedules' && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b text-xs font-semibold shrink-0"
          style={{ color: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)', borderColor: border }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />{fetchError}
          <button onClick={() => void fetchTickets({ soft: false, force: true })} className="ml-2 px-2 py-0.5 rounded text-white font-bold text-xs" style={{ backgroundColor: green }}>Retry</button>
        </div>
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Table card Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden" style={{ backgroundColor: cardBg, borderTop: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}>
        {activeTab === 'schedules' ? (
          loading && !hasHydratedOnce && !initialSchedulesReady && tickets.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 select-none animate-in fade-in duration-300"
              style={{ backgroundColor: cardBg }}>
              <div className="relative flex items-center justify-center w-36 h-36">
                {(() => {
                  const radius = 52
                  const circumference = 2 * Math.PI * radius
                  const strokeDashoffset = circumference - (progress / 100) * circumference
                  return (
                    <>
                      <svg className="w-36 h-36 transform -rotate-90">
                        {/* Trailing Background */}
                        <circle
                          cx="72"
                          cy="72"
                          r={radius}
                          stroke={isLight ? '#e2e8f0' : '#1e293b'}
                          strokeWidth="8"
                          fill="transparent"
                        />
                        {/* Animated Active Ring */}
                        <circle
                          cx="72"
                          cy="72"
                          r={radius}
                          stroke={green}
                          strokeWidth="8"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          fill="transparent"
                          className="transition-all duration-150 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-black font-mono tracking-tight" style={{ color: textPrimary }}>
                          {progress}%
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5">
                          {progress === 100 ? 'Ready' : 'Loading'}
                        </span>
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className="flex flex-col items-center gap-1.5 text-center">
                <h4 className="font-extrabold text-sm" style={{ color: textPrimary }}>
                  {progress === 100 ? 'Loaded Schedules!' : 'Fetching Schedules'}
                </h4>
                <p className="text-xs" style={{ color: textMuted }}>
                  Please wait while we synchronize branch lineup and dates.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {(syncing || backgroundSyncing) && !searchQuery && (
                <div
                  className="flex items-center justify-center gap-2 px-4 py-2 border-b shrink-0 animate-in fade-in duration-200"
                  style={{
                    backgroundColor: isLight ? 'rgba(236,253,245,0.96)' : 'rgba(11,39,45,0.96)',
                    borderColor: isMyTickets ? myTicketsTheadBorder : schedTheadBorder,
                    color: textGreen,
                  }}
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="text-[11px] font-bold tracking-wide">Syncing with portal database...</span>
                </div>
              )}
              <div
                ref={tableScrollRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
                data-ticket-table-scroll
                style={{
                  paddingBottom: activeCellOverlay ? 72 : 12,
                }}
              >
                <table key={dateFilter || 'all'} className="text-xs w-full hidden md:table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                  <colgroup>
                    {columns.map(col => (
                      <col key={col.label} style={{ width: col.w }} />
                    ))}
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <tr
                      style={{
                        backgroundColor: isMyTickets ? myTicketsTheadBg : schedTheadBg,
                        borderBottom: isMyTickets ? `1px solid ${myTicketsTheadBorder}` : `1px solid ${schedTheadBorder}`,
                      }}
                    >
                      {columns.map(rawCol => {
                        const col = rawCol as any
                        const canSort = 'sortable' in col && col.sortable
                        const isSorted = canSort && sortConfig?.column === col.label
                        const SortIcon = isSorted
                          ? (sortConfig!.direction === 'asc' ? ArrowUp : ArrowDown)
                          : ArrowUpDown
                        return (
                          <th key={col.label}
                            onClick={e => {
                              const isExpanding = !expandedCols[col.label]
                              toggleCol(col.label)
                              if (isExpanding) {
                                const th = e.currentTarget
                                setTimeout(() => {
                                  th.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                                }, 80)
                              }
                            }}
                            title={canSort ? 'Click to widen column Ã‚Â· Use arrow to sort' : 'Click to widen column'}
                            style={{
                              padding: '13px 12px',
                              color: (col.isExpanded || isSorted)
                                ? (isLight ? '#16A34A' : '#4ADE80')
                                : (isMyTickets ? myTicketsTheadText : schedTheadText),
                              fontWeight: 700, whiteSpace: 'nowrap',
                              borderRight: `1px solid ${isMyTickets ? myTicketsTheadBorder : schedTheadBorder}`,
                              borderBottom: isMyTickets ? `1px solid ${myTicketsTheadBorder}` : `1px solid ${schedTheadBorder}`,
                              fontSize: '11px', letterSpacing: '0.06em',
                              width: col.w, minWidth: 0, maxWidth: col.w,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              backgroundColor: isMyTickets ? myTicketsTheadBg : schedTheadBg,
                              cursor: 'pointer',
                              userSelect: 'none',
                              transition: 'color 0.15s ease',
                              textAlign: col.align || 'left',
                              ...(col.sticky ? { position: 'sticky' as const, left: `${col.left}%`, zIndex: 15, boxShadow: `2px 0 0 ${isMyTickets ? myTicketsTheadBorder : schedTheadBorder}` } : {}),
                            }}>
                            <div className={`flex items-center gap-1 w-full ${col.align === 'center' ? 'justify-center text-center' :
                                col.align === 'right' ? 'justify-end text-right' :
                                  'justify-start text-left'
                              }`}>
                              <span>{col.display as any}</span>
                              {canSort && (
                                <button
                                  type="button"
                                  data-sort-trigger
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleColumnSort(col.label)
                                  }}
                                  className="flex items-center justify-center rounded hover:bg-emerald-500/10"
                                  title="Sort column"
                                >
                                  <SortIcon
                                    className="w-3 h-3 shrink-0 opacity-70"
                                    style={{ color: isSorted ? green : (isMyTickets ? myTicketsTheadText : schedTheadText) }}
                                  />
                                </button>
                              )}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody
                    ref={vehicleDragTbodyRef}
                    onDragOver={e => {
                      if (!draggedVehicleTicketId) return
                      const idx = getVehicleDragRowIndex(e.clientY)
                      const targetTicket = visible[idx]
                      if (!targetTicket) return
                      const draggedTicket = visible.find(t => t.id === draggedVehicleTicketId)
                      if (!draggedTicket) return
                      const draggedBase = parseNameSiteToken(getTicketVehicleDisplay(draggedTicket)).name
                      const targetBase = parseNameSiteToken(getTicketVehicleDisplay(targetTicket)).name
                      if (!draggedBase || draggedBase !== targetBase) return
                      e.preventDefault()
                      setVehicleDropTargetId(prev => (prev === targetTicket.id ? prev : targetTicket.id))
                    }}
                    onDrop={e => {
                      if (!draggedVehicleTicketId) return
                      e.preventDefault()
                      const idx = getVehicleDragRowIndex(e.clientY)
                      const targetTicket = visible[idx]
                      if (targetTicket) commitVehicleDrop(targetTicket)
                      setDraggedVehicleTicketId(null)
                      setVehicleDropTargetId(null)
                    }}
                  >
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length} style={{ borderBottom: `1px solid ${tableBorder}`, padding: '40px 10px' }}>
                          <div className="flex flex-col items-center justify-center gap-3 py-6">
                            {(syncing || backgroundSyncing) && !searchQuery ? (
                              <div className="flex flex-col items-center justify-center gap-2 animate-in fade-in duration-200">
                                <Loader2 className="w-8 h-8 animate-spin" style={{ color: green }} />
                                <p className="text-sm font-bold tracking-wide" style={{ color: textMuted }}>
                                  Syncing with portal database...
                                </p>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm font-semibold" style={{ color: textMuted }}>
                                  {isMyTickets
                                    ? (searchQuery
                                      ? 'No pending or assigned tickets match your search'
                                      : 'No pending or assigned tickets — scheduled jobs are on Schedules, installed jobs on Archives')
                                    : tickets.length > 0
                                      ? 'No tickets match this date or branch view'
                                      : fetchError
                                        ? 'Could not load schedules — use Retry above'
                                        : 'No records'}
                                </p>
                                {searchQuery && (
                                  <button onClick={() => setSearchQuery('')} className="text-xs font-bold hover:underline" style={{ color: green }}>Clear search</button>
                                )}
                              </>
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
                        const rowColors = getScheduleRowColors(ticket, ghostKind, isLight, idx, rowEven, rowOdd, isDuplicateName)
                        const baseBg = rowColors.baseBg
                        const isDragSourceRow = draggedVehicleTicketId === ticket.id
                        const isDropTargetRow = vehicleDropTargetId === ticket.id && draggedVehicleTicketId !== null && !isDragSourceRow
                        const dropTargetBg = isLight ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.28)'
                        const bg = isDropTargetRow ? dropTargetBg : (isHovered && !isGhost ? rowHover : baseBg)
                        const ghostAccent = rowColors.accent
                        const rowIsActive = columns.some(col =>
                          (editingCell?.ticketId === ticket.id && editingCell?.rowIndex === idx && editingCell?.colLabel === col.label)
                          || (expandedCell?.ticketId === ticket.id && expandedCell?.colLabel === col.label),
                        )
                        // "Make room" slide: every row in the affected vehicle group — INCLUDING
                        // the dragged one — animates to its previewed slot. Exempting the dragged
                        // row from this (leaving it static while its neighbor slid onto it) is what
                        // caused the two rows to visually overlap; sliding both is what a normal
                        // reorder-list swap looks like, and nothing else is left static to collide with.
                        let vehicleDragOffsetPx = 0
                        if (vehicleDragPreview) {
                          const groupPos = vehicleGroupPositions.get(ticket.id)
                          if (groupPos && groupPos.base === vehicleDragPreview.base) {
                            const previewRel = vehicleDragPreview.order.indexOf(ticket.id)
                            if (previewRel !== -1 && previewRel !== groupPos.relIndex) {
                              vehicleDragOffsetPx = (previewRel - groupPos.relIndex) * TABLE_ROW_HEIGHT
                            }
                          }
                        }
                        return (
                          // Key must never include idx — visible re-sorts on every edit (installer/customer
                          // grouping), and an index-based key made React remount the row each time instead of
                          // reconciling it in place, which is what caused rows to visibly flicker/reorder on save.
                          // ticket.id is already unique per date view (a ticket shows as either its active row or
                          // one ghost row for that date, never both), so id + ghost-kind is enough.
                          <tr key={`${ticket.id}${isGhost ? `-ghost-${ghostKind}` : ''}`}
                            style={{
                              borderBottom: `1px solid ${tableBorder}`,
                              boxShadow: ghostAccent ? `inset 3px 0 0 ${ghostAccent}` : undefined,
                              position: (rowIsActive || vehicleDragOffsetPx) ? 'relative' : undefined,
                              zIndex: rowIsActive ? 80 : (isDragSourceRow ? 20 : (vehicleDragOffsetPx ? 10 : undefined)),
                              height: rowIsActive ? undefined : TABLE_ROW_HEIGHT,
                              // Dimmed so it's obvious which row is being moved, but it slides right
                              // along with everyone else in the group — it never sits still while
                              // another row slides onto it (that's what caused the overlap).
                              opacity: isDragSourceRow ? 0.65 : undefined,
                              transform: vehicleDragOffsetPx ? `translateY(${vehicleDragOffsetPx}px)` : undefined,
                              transition: 'transform 150ms ease, opacity 150ms ease',
                            }}
                            onMouseEnter={() => setHoveredRow(ticket.id)}
                            onMouseLeave={() => setHoveredRow(null)}
                            onDoubleClick={() => setDetailTicket(ticket)}
                            onContextMenu={e => {
                              e.preventDefault()
                              if (canEdit || isAdmin) setContextMenu({ x: e.clientX, y: e.clientY, ticket })
                            }}>



                            {/* Data cells */}
                            {columns.map((col) => {
                              const isEditingCell = editingCell?.ticketId === ticket.id
                                && editingCell?.rowIndex === idx
                                && editingCell?.colLabel === col.label
                              const isExpandedCell = expandedCell?.ticketId === ticket.id && expandedCell?.colLabel === col.label
                              const isStatusCol = col.label === 'STATUS'
                              const SKIP_EMPTY_HIGHLIGHT = new Set(['STATUS', 'INSTALLER', 'NOTE', 'UPDATE', 'PAYMENT', 'TICKET NO', 'FINAL DATE'])
                              const cellVal = getCellDisplay(ticket, col.label)
                              const isCellEmpty = !SKIP_EMPTY_HIGHLIGHT.has(col.label) && !isGhost && !isEditingCell && !cellVal.trim()
                              const emptyCellBg = isCellEmpty
                                ? (isLight ? 'rgba(251,146,60,0.13)' : 'rgba(251,146,60,0.18)')
                                : undefined
                              const isSelectedVehicleCell = col.label === 'VEHICLE' && selectedVehicleTicketId === ticket.id
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
                                    if (isStatusCol && !isMyTickets) {
                                      const statusVal = getScheduleStatusValue(ticket)
                                      if (isGhost || statusShowsScheduleDetails(statusVal)) {
                                        openScheduleDetailsPopup(ticket, e.currentTarget as HTMLElement, ghostKind)
                                        return
                                      }
                                      if (canEdit && !isGhost) {
                                        openStatusPicker(ticket, 'inline', e.currentTarget as HTMLElement)
                                        return
                                      }
                                    }
                                    if (isStatusCol && canEdit && !isGhost) {
                                      openStatusPicker(ticket, 'inline', e.currentTarget as HTMLElement)
                                      return
                                    }
                                    // VEHICLE is drag-to-reorder now — a tap-to-view-details popup
                                    // on the same cell just gets in the way of grabbing it.
                                    if (col.label === 'VEHICLE') return
                                    setExpandedCell(prev =>
                                      prev?.ticketId === ticket.id && prev?.colLabel === col.label
                                        ? null
                                        : { ticketId: ticket.id, colLabel: col.label },
                                    )
                                  }}
                                  onDoubleClick={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (!canEdit || isGhost || isEditingCell) return
                                    if (col.label === 'VEHICLE') {
                                      setSelectedVehicleTicketId(prev => (prev === ticket.id ? null : ticket.id))
                                      return
                                    }
                                    if (INLINE_EDIT_COLUMNS.has(col.label)) {
                                      startCellEdit(ticket, col.label, undefined, idx)
                                    }
                                  }}
                                  style={{
                                    padding: isEditingCell ? '6px' : '0 12px',
                                    color: isGhost ? textMuted : textPrimary,
                                    fontSize: '12.5px', fontWeight: isGhost ? 500 : 600,
                                    backgroundColor: isSelectedVehicleCell ? `${green}22` : (emptyCellBg ?? bg),
                                    borderRight: `1px solid ${tableBorder}`,
                                    borderBottom: `1px solid ${tableBorder}`,
                                    width: col.w,
                                    minWidth: 0,
                                    maxWidth: col.w,
                                    height: isEditingCell ? 'auto' : TABLE_ROW_HEIGHT,
                                    maxHeight: isEditingCell ? undefined : TABLE_ROW_HEIGHT,
                                    overflow: 'visible',
                                    textOverflow: 'ellipsis',
                                    transition: isDropTargetRow ? 'background-color 1s ease' : 'background-color 0.1s ease',
                                    cursor: canEdit && !isGhost && INLINE_EDIT_COLUMNS.has(col.label) ? 'text' : 'default',
                                    verticalAlign: 'middle',
                                    textAlign: col.align || 'left',
                                    userSelect: isEditingCell ? 'text' : (canEdit && !isGhost ? 'none' : undefined),
                                    WebkitUserSelect: isEditingCell ? 'text' : (canEdit && !isGhost ? 'none' : undefined),
                                    ...(col.sticky
                                      ? { position: 'sticky' as const, left: `${col.left}%`, zIndex: (isEditingCell || isExpandedCell) ? 95 : 5 }
                                      : { position: 'relative' as const, zIndex: (isEditingCell || isExpandedCell) ? (isEditingCell ? 90 : 85) : undefined }),
                                    boxShadow: isSelectedVehicleCell
                                      ? `inset 0 0 0 2px ${green}`
                                      : (col.sticky ? `2px 0 0 ${tableBorder}` : undefined),
                                  }}>
                                  {isEditingCell ? (
                                    renderCell(ticket, col, idx, isGhost, ghostKind, false)
                                  ) : (
                                    <div
                                      className={`relative w-full h-full flex items-center ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''
                                        }`}
                                      style={{ minHeight: TABLE_ROW_HEIGHT - 2 }}
                                    >
                                      <div className={`min-w-0 overflow-hidden ${col.align === 'center' && col.label !== 'VEHICLE' ? 'w-auto max-w-full' : 'w-full'}`}>
                                        {renderCell(ticket, col, idx, isGhost, ghostKind, false)}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      }))}
                  </tbody>
                  {(() => {
                    let totalCash = 0;
                    let totalGcash = 0;
                    let totalBankTransfer = 0;
                    let totalOther = 0;

                    visible.forEach(ticket => {
                      const rawMode = getPaymentMode(ticket).trim().toUpperCase();
                      const amountStr = formatPaymentAmount(ticket);
                      let amount = parseFloat(amountStr.replace(/,/g, ''));
                      if (isNaN(amount)) amount = 0;

                      if (rawMode === 'HYBRID') {
                        const breakdown = getPaymentBreakdown(ticket);
                        breakdown.forEach(entry => {
                          const subRawMode = entry.mode.toUpperCase();
                          const subAmount = entry.amount;
                          if (subRawMode === 'CASH') totalCash += subAmount;
                          else if (subRawMode === 'GCASH') totalGcash += subAmount;
                          else if (subRawMode === 'BANK TRANSFER') totalBankTransfer += subAmount;
                          else totalOther += subAmount;
                        });
                      } else {
                        if (rawMode === 'CASH') totalCash += amount;
                        else if (rawMode === 'GCASH') totalGcash += amount;
                        else if (rawMode === 'BANK TRANSFER') totalBankTransfer += amount;
                        else totalOther += amount;
                      }
                    });

                    const totalEstimated = totalCash + totalGcash + totalBankTransfer + totalOther;
                    // Hide the green TOTAL COLLECTION footer when nothing has been paid yet.
                    if (totalEstimated <= 0) return null;

                    return (
                      <tfoot style={{ position: 'relative' }}>
                        <tr>
                          <td colSpan={columns.length - 2} style={{ border: 'none', background: 'transparent' }}></td>
                          <td className="px-3 py-2 text-right font-black" style={{ backgroundColor: '#16a34a', color: '#fff', border: `1px solid ${tableBorder}` }}>
                            TOTAL COLLECTION
                          </td>
                          <td className="px-3 py-2 text-right font-black tracking-wide" style={{ backgroundColor: '#16a34a', color: '#fff', border: `1px solid ${tableBorder}` }}>
                            {totalEstimated.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        {totalGcash > 0 && (
                          <tr>
                            <td colSpan={columns.length - 2} style={{ border: 'none', background: 'transparent' }}></td>
                            <td className="px-3 py-2 text-right font-bold" style={{ backgroundColor: '#dbeafe', color: '#000', border: `1px solid ${tableBorder}` }}>
                              GCASH
                            </td>
                            <td className="px-3 py-2 text-right font-bold tracking-wide" style={{ backgroundColor: '#dbeafe', color: '#000', border: `1px solid ${tableBorder}` }}>
                              {totalGcash.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                        {totalCash > 0 && (
                          <tr>
                            <td colSpan={columns.length - 2} style={{ border: 'none', background: 'transparent' }}></td>
                            <td className="px-3 py-2 text-right font-bold" style={{ backgroundColor: '#dcfce7', color: '#000', border: `1px solid ${tableBorder}` }}>
                              CASH
                            </td>
                            <td className="px-3 py-2 text-right font-bold tracking-wide" style={{ backgroundColor: '#dcfce7', color: '#000', border: `1px solid ${tableBorder}` }}>
                              {totalCash.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                        {totalBankTransfer > 0 && (
                          <tr>
                            <td colSpan={columns.length - 2} style={{ border: 'none', background: 'transparent' }}></td>
                            <td className="px-3 py-2 text-right font-bold" style={{ backgroundColor: '#f3e8ff', color: '#000', border: `1px solid ${tableBorder}` }}>
                              BANK TRANSFER
                            </td>
                            <td className="px-3 py-2 text-right font-bold tracking-wide" style={{ backgroundColor: '#f3e8ff', color: '#000', border: `1px solid ${tableBorder}` }}>
                              {totalBankTransfer.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                        {totalOther > 0 && (
                          <tr>
                            <td colSpan={columns.length - 2} style={{ border: 'none', background: 'transparent' }}></td>
                            <td className="px-3 py-2 text-right font-bold" style={{ backgroundColor: '#f3e8ff', color: '#000', border: `1px solid ${tableBorder}` }}>
                              OTHER
                            </td>
                            <td className="px-3 py-2 text-right font-bold tracking-wide" style={{ backgroundColor: '#f3e8ff', color: '#000', border: `1px solid ${tableBorder}` }}>
                              {totalOther.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    );
                  })()}
                </table>
                {/* Mobile Card View */}
                <div className="flex flex-col md:hidden p-3 gap-3">
                  {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <p className="text-sm font-semibold" style={{ color: textMuted }}>
                        No records found
                      </p>
                    </div>
                  ) : (
                    visible.map((ticket, idx) => {
                      const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null
                      const isGhost = Boolean(ghostKind)
                      const isDuplicateName = duplicateNameKeys.has(normalizeCustomerKey(getCustomerDisplayName(ticket)))
                      const rowColors = getScheduleRowColors(ticket, ghostKind, isLight, idx, rowEven, rowOdd, isDuplicateName)

                      return (
                        <div
                          key={`${ticket.id}${isGhost ? `-ghost-${ghostKind}` : ''}`}
                          onClick={() => setDetailTicket(ticket)}
                          className="w-full rounded-xl p-3 flex flex-col gap-2 shadow-sm border transition-transform active:scale-[0.98] cursor-pointer"
                          style={{
                            backgroundColor: rowColors.baseBg,
                            borderColor: tableBorder,
                            borderLeft: rowColors.accent ? `4px solid ${rowColors.accent}` : undefined,
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <h4
                              onClick={e => {
                                e.stopPropagation()
                                const phoneNum = getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
                                if (phoneNum) {
                                  void copyTextToClipboard(phoneNum)
                                  showToast(`Copied ${getCustomerDisplayName(ticket)}'s number: ${fmtPhone(phoneNum) || phoneNum}`)
                                } else {
                                  showToast(`No contact number for ${getCustomerDisplayName(ticket)}`)
                                }
                              }}
                              className="font-bold text-sm truncate mr-2 hover:underline cursor-pointer"
                              style={{ color: isDuplicateName ? (isLight ? '#9f1239' : '#f43f5e') : textPrimary }}
                            >
                              {getCustomerDisplayName(ticket)}
                            </h4>
                            {(() => {
                              const statusVal = getScheduleStatusValue(ticket)
                              const statusColor = getScheduleStatusBadgeStyle(statusVal, isLight).color
                              const display = getScheduleStatusDisplay(ticket) || ticket.status || ''
                              if (!display) return null
                              return (
                                <span
                                  className="text-[10px] font-bold uppercase shrink-0 tracking-wide"
                                  style={{ color: statusColor }}
                                >
                                  {display === 'INSTALLATION' ? 'INSTALL' : display}
                                </span>
                              )
                            })()}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs" style={{ color: textMuted }}>
                            <div className="flex items-center gap-1.5">
                               <Copy className="w-3 h-3 shrink-0" />
                               <span className="font-semibold truncate" style={{color: textPrimary}}>{ticket.ticketNumber || ticket.controlNumber || '—'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-right justify-end">
                               <span className="truncate">{ticket.branchId ? (resolveBranch(ticket.branchId)?.name || ticket.branchId) : (ticket.district || '—')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 col-span-2">
                               <MapPin className="w-3 h-3 shrink-0" />
                               <span className="truncate">{ticket.district || '—'} • {ticket.acDetails || '—'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 col-span-2">
                               <span className="font-medium" style={{color: getInstallerDisplay(ticket, branchEmployees, activeBranchId) ? (isLight ? '#0369a1' : '#7dd3fc') : undefined}}>
                                 {getInstallerDisplay(ticket, branchEmployees, activeBranchId) || 'Unassigned'}
                               </span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )) : (
          /* Render Overview Search Panel */
          <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden relative" style={{ backgroundColor: isLight ? '#f1f5f9' : '#060B18' }}>
            {/* Top Header Row */}
            <div className="flex items-center justify-center p-4 md:p-6 pb-2 w-full shrink-0 z-50 relative">
              {/* Mobile Menu Button (absolute to keep branches perfectly centered) */}
              <button
                onClick={() => setSidebarOpen?.(true)}
                className="md:hidden absolute left-4 p-2.5 rounded-xl border shadow-sm transition-transform active:scale-95 shrink-0 z-10"
                style={{ borderColor: border, backgroundColor: cardBg, color: textPrimary }}
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Branches Showcase (Centered) */}
              <div
                className="flex items-center justify-start overflow-x-auto hide-scrollbar py-1 w-full max-w-full"
                style={{ WebkitOverflowScrolling: 'touch', maskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)' }}
              >
                <div className="flex items-center justify-center gap-4 px-4 mx-auto w-max">
                  {[
                    "BATANGAS", "BULACAN", "CANDELARIA", "DASMA, CAVITE", 
                    "GENTRI, CAVITE", "LAGUNA", "PAMPANGA", "RIZAL", 
                    "SILANG, CAVITE", "TAGUIG", "VALENZUELA"
                  ].map((branch, idx, arr) => (
                    <div key={branch} className="flex items-center gap-4 shrink-0">
                      <span 
                        className="text-[13px] md:text-[16px] font-black uppercase tracking-[0.15em]"
                        style={{ color: idx % 2 === 0 ? green : textPrimary }}
                      >
                        {branch}
                      </span>
                      {idx < arr.length - 1 && (
                        <span className="text-[10px] opacity-40" style={{ color: textMuted }}>&bull;</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`flex-1 flex flex-col min-h-0 px-3 md:px-8 bg-transparent ${overviewSearchInput || overviewResults.length > 0 ? 'overflow-y-auto justify-start' : 'overflow-hidden justify-center py-4 md:py-6'}`}>
              <div className={`max-w-4xl w-full mx-auto flex flex-col animate-in fade-in transition-all duration-500 ease-out ${overviewSearchInput || overviewResults.length > 0 ? '' : 'pb-[15vh] gap-6 md:gap-8'}`}>

                {/* Sticky Header: Logo + Search Input (opaque bg so results don't show through while scrolling) */}
                <div
                  className={overviewSearchInput || overviewResults.length > 0
                    ? 'sticky top-0 z-10 -mx-3 px-3 md:mx-0 md:px-0 pt-4 pb-3 md:pt-6 md:pb-4 flex flex-col gap-3 md:gap-4'
                    : 'flex flex-col gap-6 md:gap-8'}
                  style={overviewSearchInput || overviewResults.length > 0 ? { backgroundColor: isLight ? '#f1f5f9' : '#060B18' } : undefined}
                >
                  {/* Big Logo / Name (Google Style) */}
                  <div className="flex flex-col items-center justify-center text-center">
                    <h1
                      className={`font-black tracking-tighter transition-all duration-500 ease-out ${overviewSearchInput || overviewResults.length > 0 ? 'text-2xl md:text-3xl mb-0 opacity-80' : 'text-5xl md:text-7xl mb-2 opacity-100'}`}
                    >
                      <span style={{ color: green }}>ASHCOL</span>
                      <span style={{ color: textPrimary }} className="ml-2 md:ml-3">PORTAL</span>
                    </h1>
                  </div>

                  {/* Search Input Box */}
                  <div
                    className="flex items-center gap-3 px-8 py-5 md:px-10 md:py-6 rounded-full shadow-md border-2 transition-all duration-200"
                    style={{
                      backgroundColor: cardBg,
                      borderColor: overviewSearchFocused ? green : border,
                      boxShadow: overviewSearchFocused ? `0 0 0 4px ${green}15` : 'none'
                    }}
                  >
                    <Search className="w-5 h-5 shrink-0" style={{ color: green }} />
                    <input
                      type="text"
                      placeholder="Search tickets, customers, or contacts..."
                      value={overviewSearchInput}
                      onChange={e => setOverviewSearchInput(e.target.value)}
                      onFocus={() => setOverviewSearchFocused(true)}
                      onBlur={() => setOverviewSearchFocused(false)}
                      enterKeyHint="search"
                      autoComplete="off"
                      className="bg-transparent outline-none text-base flex-1 min-w-0 font-medium"
                      style={{ color: textPrimary }}
                    />
                    {overviewSearchInput && (
                      <button
                        type="button"
                        onClick={() => { setOverviewSearchInput(''); setOverviewResults([]); }}
                        style={{ color: textMuted }}
                        className="hover:scale-110 transition-transform p-1"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Results Section */}
                {overviewLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: green }} />
                    <span className="text-xs font-semibold" style={{ color: textMuted }}>Searching portal database...</span>
                  </div>
                ) : overviewResults.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                        Found {overviewResults.length} {overviewResults.length === 1 ? 'ticket' : 'tickets'}
                      </span>
                    </div>

                    {/* Results Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      {overviewResults.map(ticket => {
                        const ticketNum = ticket.ticketNumber || ticket.ticket_number || ticket.id;
                        const customer = ticket.customerName || ticket.customer_name || 'No Customer Name';
                        const { value: statusVal, label: statusLabel } = getOverviewStatusBadge(ticket);
                        const statusStyle = getScheduleStatusBadgeStyle(statusVal, isLight);
                        const rawBranch = ticket.branchId || ticket.branch_id || null;
                        const branchLabel = formatAssignedBranchLabel(
                          resolveScopedBranchId(rawBranch) || rawBranch,
                        );
                        const negotiatorLabel = getTicketNegotiatorName(ticket, branchEmployees) || EMPTY_CELL;
                        const finalDateKey = getFinalDateKey(ticket);
                        const scheduleDateLabel = finalDateKey
                          ? `Scheduled: ${formatDisplayDate(finalDateKey, '')}`
                          : getPreferredDateKey(ticket)
                            ? `Preferred: ${formatDisplayDate(getPreferredDateKey(ticket), '')}`
                            : 'No Date';

                        return (
                          <div
                            key={ticket.id}
                            className="rounded-xl md:rounded-2xl p-3.5 md:p-4 border shadow-sm transition-all duration-300 md:hover:shadow-md md:hover:-translate-y-0.5 flex flex-col justify-between active:scale-[0.99]"
                            style={{ backgroundColor: cardBg, borderColor: border }}
                          >
                            <div>
                              {/* Card Header */}
                              <div className="flex justify-between items-start gap-2 mb-2">
                                <span className="text-[10px] font-extrabold tracking-wide uppercase" style={{ color: textMuted }}>
                                  {ticketNum}
                                </span>
                                <div className="flex gap-1.5 items-center flex-wrap justify-end">
                                  {branchLabel && branchLabel !== EMPTY_CELL && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textMuted }}>
                                      {branchLabel}
                                    </span>
                                  )}
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}>
                                    {statusLabel}
                                  </span>
                                </div>
                              </div>

                              {/* Customer & Location */}
                              <h3 className="font-bold text-sm leading-tight mb-2" style={{ color: textPrimary }}>
                                {highlightMatch(customer, overviewSearchInput)}
                              </h3>

                              <div className="flex flex-col gap-1 text-[11px] mb-3" style={{ color: textMuted }}>
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="w-3 h-3 shrink-0" style={{ color: green }} />
                                  <span className="truncate">{formatAddress(ticket.location)}</span>
                                </div>
                                {ticket.contactPhone && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold">Contact:</span>
                                    <span>{ticket.contactPhone}</span>
                                  </div>
                                )}
                                {negotiatorLabel !== EMPTY_CELL && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold">Negotiator:</span>
                                    <span>{negotiatorLabel}</span>
                                  </div>
                                )}
                                {ticket.assignedEmployeeName && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold">Technician:</span>
                                    <span>{ticket.assignedEmployeeName}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Card Footer */}
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pt-2.5 border-t border-dashed" style={{ borderColor: border }}>
                              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textMuted }}>
                                {scheduleDateLabel}
                              </span>
                              <div className="flex gap-2 w-full sm:w-auto">
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(ticket.id); }}
                                    className="flex-1 sm:flex-none px-3 py-2 sm:py-1 rounded-lg text-[11px] sm:text-[10px] font-bold text-white bg-red-600 transition-opacity hover:opacity-90 active:opacity-80"
                                  >
                                    Delete
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDetailTicket(ticket);
                                    setShowHistoryPanel(true);
                                  }}
                                  className="flex-1 sm:w-auto px-3 py-2 sm:py-1 rounded-lg text-[11px] sm:text-[10px] font-bold text-white transition-opacity hover:opacity-90 active:opacity-80"
                                  style={{ backgroundColor: green }}
                                >
                                  View Details
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : overviewSearchInput.trim() ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertTriangle className="w-10 h-10 mb-3" style={{ color: textMuted }} />
                    <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>No results found</h3>
                    <p className="text-xs max-w-sm mt-2" style={{ color: textMuted }}>
                      We couldn't find any tickets matching "{overviewSearchInput}". Try adjusting your search term.
                    </p>
                  </div>
                ) : null}

              </div>
            </div>

            {/* Dark Mode Toggle - Bottom Right Floating */}
            <div className="absolute bottom-6 right-6 z-50">
              <button
                onClick={toggleTheme}
                title={isLight ? 'Switch to Dark' : 'Switch to Light'}
                className="flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95"
                style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              >
                {isLight ? (
                  <Moon className="w-5 h-5" style={{ color: textMuted }} />
                ) : (
                  <Sun className="w-5 h-5" style={{ color: '#F59E0B' }} />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Right-click context menu Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {contextMenu && (() => {
        const menuW = 220
        const menuH = 180
        const leftPos = contextMenu.x + menuW > window.innerWidth ? Math.max(10, window.innerWidth - menuW - 10) : contextMenu.x
        const topPos = contextMenu.y + menuH > window.innerHeight ? Math.max(10, window.innerHeight - menuH - 10) : contextMenu.y
        return (
          <div ref={contextMenuRef} className="fixed z-[200]" style={{ top: topPos, left: leftPos }}
            onClick={e => e.stopPropagation()}>
            <div className="rounded-2xl shadow-2xl overflow-hidden"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}`, minWidth: 200 }}>

              {/* Current status label */}
              <div className="px-4 py-2.5 flex items-center gap-2"
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
                {(() => {
                  const sc = statusColor(contextMenu.ticket.status, isLight); return (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black border"
                      style={{ color: sc.text, backgroundColor: sc.bg, borderColor: sc.b }}>
                      {statusCode(contextMenu.ticket.status)}
                    </span>
                  )
                })()}
                <span className="text-[11px] font-bold truncate" style={{ color: textMuted }}>
                  {(contextMenu.ticket.customerName || contextMenu.ticket.customer_name || contextMenu.ticket.title || '').split(' ').slice(0, 3).join(' ')}
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


            </div>
          </div>
        )
      })()}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Full Details Modal Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {detailTicket && ReactDOM.createPortal((() => {
        const t = detailTicket
        const scheduleStatusValue = getScheduleStatusValue(t)
        const scheduleBadgeStyle = getScheduleStatusBadgeStyle(scheduleStatusValue, isLight)
        const scheduleStatusDisplay = getScheduleStatusDisplay(t)
        const addr = formatAddress(t.location)
        const district = parseDistrict(t.location, t.district)
        const brand = parseBrand(t)
        const phone = getF(t, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
        const installer = getInstallerDisplay(t, branchEmployees, activeBranchId)
        const serviceDriver = formatServiceDriver(t)
        const update = t.remarks || ''
        const note = t.note || ''
        const commit = getF(t, 'commitType', 'commitTerms', 'description')
        const custName = getCustomerDisplayName(t) || t.title
        const negotiatorId = t.negotiatorId || t.negotiator_id || ''
        const negotiatorName = getTicketNegotiatorName(t, branchEmployees)
          || branchEmployees.find(e => e.id === negotiatorId)?.name
          || ''
        const negotiatorEmp = branchEmployees.find(e => {
          if (negotiatorId && e.id === negotiatorId) return true
          const resolvedFull = resolveNegotiatorDisplayName(t, branchEmployees)
          if (resolvedFull && e.name && namesMatchLoosely(e.name, resolvedFull)) return true
          return false
        })
        const negotiatorPhone = negotiatorEmp?.phone
          || (negotiatorId && user?.id === negotiatorId ? (user?.phone || '') : '')
          || ''
        const preferredDate = t.preferredDate || t.preferred_date
        const finalScheduleDate = getFinalDateKey(t)
        const dealer = getF(t, 'dealer')
        const isCompleted = isInstalledWorkflowStatus(t.status)
        const hasPayment = ticketHasPaymentInfo(t)
        const paymentAmt = formatPaymentAmount(t)
        const paymentMode = getPaymentMode(t)
        const archivedSched = formatDateKeyLabel(getArchivedScheduleDate(t))
        const installedDate = formatDateKeyLabel(getInstalledDateKey(t))
        const isDuplicateName = duplicateNameKeys.has(normalizeCustomerKey(custName))
        const updateColor = scheduleStatusValue === 'DONE_CLEANING'
          || scheduleStatusValue === 'DONE_CHECKUP'
          || scheduleStatusValue === 'DONE_BACKJOB'
          || scheduleStatusValue === 'DONE_SYSTEM_REPROCESS'
          || scheduleStatusValue === 'DONE_DISMANTLE'
          ? (isLight ? '#1d4ed8' : '#93c5fd')
          : green
        const branchName = formatAssignedBranchLabel(t.branchId || t.branch_id)

        const DField = ({ label, value, green, className = "" }: { label: string; value: React.ReactNode; green?: boolean; className?: string }) => (
          <div className={`flex flex-col gap-0.5 py-2 px-3 rounded-lg ${className}`} style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
            <span className={`text-xs font-semibold break-words leading-snug ${green ? 'text-emerald-500' : ''}`}
              style={green ? undefined : { color: textPrimary }}>
              {['TECHNICIAN', 'INSTALLER', 'ASSIGNED', 'BY', 'CREATED BY', 'NEGOTIATOR', 'INSTALLER / TECHNICIAN'].includes(label.toUpperCase()) && typeof value === 'string' ? (
                <EmployeeNameLink nameOrId={value} />
              ) : value || EMPTY_CELL}
            </span>
          </div>
        )

        const SHead = ({ title }: { title: string }) => (
          <div className="pt-2 pb-1 border-b pb-2 mb-3" style={{ borderColor: border }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">{title}</p>
          </div>
        )

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-[3px]"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => { setDetailTicket(null); setShowHistoryPanel(false) }}>
            <div className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 animate-in zoom-in-95"
              style={{
                backgroundColor: cardBg,
                border: `1px solid ${border}`,
                height: 'calc(100vh - 6px)',
                maxHeight: 'calc(100vh - 6px)',
                maxWidth: showHistoryPanel
                  ? 'min(1480px, calc(100vw - 6px))'
                  : 'min(1180px, calc(100vw - 6px))',
              }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex flex-col px-6 py-4 shrink-0 gap-3"
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#111827' }}>

                {/* Header Row 1 */}
                <div className="flex items-center justify-between w-full">
                  <div className="min-w-0 flex-1 mr-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-base font-black leading-tight uppercase tracking-wide" style={{ color: textPrimary }}>
                        {custName || 'Direct Client'}
                      </h2>
                      <span
                        className="text-[11px] font-bold shrink-0 uppercase tracking-wide"
                        style={{ color: scheduleBadgeStyle.color }}
                      >
                        {scheduleStatusDisplay}
                      </span>
                      {branchName && branchName !== EMPTY_CELL && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase" style={{
                          backgroundColor: inputBg,
                          color: textMuted,
                          border: `1px solid ${border}`,
                        }}>
                          {branchName}
                        </span>
                      )}
                      <span className="text-sm sm:text-base font-black font-mono tracking-wider uppercase" style={{ color: textPrimary }}>
                        TICKET NO: {t.ticketNumber || t.ticket_number || EMPTY_CELL}
                      </span>
                      {isDuplicateName && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-500/10" style={{ color: isLight ? '#a16207' : '#fbbf24' }}>
                          Duplicate Name
                        </span>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={() => { setDetailTicket(null); setShowHistoryPanel(false) }}
                    className="p-1.5 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X className="w-4.5 h-4.5" style={{ color: textMuted }} />
                  </button>
                </div>

                {/* Header Row 2 */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t text-xs w-full" style={{ borderColor: border }}>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Category</span>
                    <span className="font-semibold text-xs text-emerald-500 uppercase">{t.ticketCategory || t.ticket_category || EMPTY_CELL}</span>
                  </div>
                  <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Relayed By</span>
                    <span className="font-semibold text-xs font-mono" style={{ color: textPrimary }}>
                      {t.createdBy || (t.customerEmail || 'System')}
                    </span>
                  </div>
                  <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Negotiator</span>
                    <span className="font-semibold text-xs" style={{ color: textPrimary }}>
                      {negotiatorName ? <EmployeeNameLink nameOrId={negotiatorName} /> : EMPTY_CELL}
                    </span>
                  </div>
                  <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Negotiator Number</span>
                    <span className="font-semibold text-xs animate-in fade-in duration-200" style={{ color: negotiatorPhone ? '#10B981' : textMuted }}>
                      {negotiatorPhone ? (
                        <a href={`tel:${negotiatorPhone.replace(/\D/g, '').replace(/^0/, '+63')}`} className="hover:underline">
                          {fmtPhone(negotiatorPhone) || negotiatorPhone}
                        </a>
                      ) : EMPTY_CELL}
                    </span>
                  </div>
                </div>
              </div>

              {/* Two Column Body */}
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x">

                {/* Left Column: Details */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Grid 1: Client & Location Info */}
                  <div>
                    <SHead title="Client & Location Details" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DField label="Customer" value={custName} />
                      <DField label="Contact" value={phone ? (fmtPhone(phone) || phone) : EMPTY_CELL} />
                      {!isMyTickets && (
                        <DField label="Address" value={addr} className="sm:col-span-2" />
                      )}
                      <DField label="District" value={district || resolveTicketDistrict(t) || EMPTY_CELL} className={isMyTickets ? "sm:col-span-2" : ""} />
                    </div>
                  </div>

                  {/* Grid 2: Service & Equipment Details */}
                  <div>
                    <SHead title="Service & Equipment Details" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DField label="Ticket Category" value={t.ticketCategory || t.ticket_category || EMPTY_CELL} />
                      <DField label="Brand / Unit" value={brand || EMPTY_CELL} />
                      <DField label="Service / Driver" value={serviceDriver || EMPTY_CELL} />
                      <DField label={isTaguigServices ? "Technician" : "Installer / Technician"} value={installer || EMPTY_CELL} />
                      <DField label="Negotiator" value={negotiatorName ? <EmployeeNameLink nameOrId={negotiatorName} /> : EMPTY_CELL} />
                      <DField label={isTaguigServices ? "Endorsed By" : "Dealer (DLR)"} value={dealer || EMPTY_CELL} />
                      <DField label="Ticket No." value={t.ticketNumber || t.ticket_number || EMPTY_CELL} />
                      <DField label="Control No. / SI" value={t.controlNumber || t.control_number || EMPTY_CELL} />
                      {ROBINSON_APPLIANCES_RE.test(dealer || '') && (
                        <DField label="Transaction ID" value={String(parseAcMeta(t).robinsonsTransactionId || '') || EMPTY_CELL} />
                      )}
                    </div>
                  </div>

                  {/* Grid 3: Scheduling Details */}
                  <div>
                    <SHead title="Scheduling Details" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DField label="Assigned Branch" value={branchName} />
                      <DField label="Preferred Date" value={formatDisplayDate(preferredDate)} />
                      <DField label="Final Schedule" value={formatDisplayDate(finalScheduleDate)} green />
                      {isCompleted && archivedSched && (
                        <DField label="Scheduled Date" value={archivedSched} />
                      )}
                      {isCompleted && installedDate && (
                        <DField label="Installed Date" value={installedDate} />
                      )}
                    </div>
                  </div>

                  {/* Grid 4: Payment Details */}
                  {(hasPayment || t.modeOfPayment || t.mode_of_payment || t.amountCharged || t.installationCharges || t.installation_charges) && (
                    <div>
                      <SHead title="Payment Details" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <DField label="Mode of Payment" value={paymentMode || EMPTY_CELL} />
                        <DField label="Payment Amount" value={paymentAmt || EMPTY_CELL} green />
                      </div>
                    </div>
                  )}

                  {/* Commit terms / note / remarks */}
                  {(commit || note || update) && (
                    <div className="space-y-4">
                      {commit && (
                        <div>
                          <SHead title={isTaguigServices ? "Commit (Amount)" : "Commit / Description"} />
                          <p className="text-xs leading-relaxed rounded-xl p-4"
                            style={{ backgroundColor: inputBg, color: textPrimary, border: `1px solid ${border}` }}>
                            {commit}
                          </p>
                        </div>
                      )}
                      {note && (
                        <div>
                          <SHead title={isTaguigServices ? "Confirmation" : "Note"} />
                          <p className="text-xs leading-relaxed rounded-xl p-4 font-semibold"
                            style={{ backgroundColor: inputBg, color: '#EF4444', border: `1px solid ${border}` }}>
                            {note}
                          </p>
                        </div>
                      )}
                      {update && (
                        <div>
                          <SHead title={isTaguigServices ? "Service Status" : "Remarks / Update"} />
                          <p className="text-xs leading-relaxed rounded-xl p-4 font-semibold"
                            style={{ backgroundColor: inputBg, color: updateColor, border: `1px solid ${border}` }}>
                            {update}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column: Update History */}
                {showHistoryPanel && (
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col min-h-0"
                    style={{ backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
                    <h4 className="text-[10px] font-black uppercase tracking-wider mb-4" style={{ color: textMuted }}>
                      Update History
                    </h4>

                    {loadingHistory ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
                        <div className="relative w-10 h-10">
                          <svg viewBox="0 0 40 40" fill="none" style={{ width: 40, height: 40, transform: "rotate(-90deg)" }}>
                            <circle cx="20" cy="20" r="16" stroke={isLight ? "#e2e8f0" : "#1e293b"} strokeWidth="3" />
                            <circle cx="20" cy="20" r="16" stroke={green} strokeWidth="3" strokeDasharray="100.53" strokeDashoffset="25.13" strokeLinecap="round" className="animate-spin" style={{ transformOrigin: "20px 20px" }} />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold" style={{ color: textMuted }}>Loading logs&#x2026;</span>
                      </div>
                    ) : (
                      <div className="relative border-l ml-3 pl-5 space-y-6" style={{ borderColor: border }}>
                        {(() => {
                          const listToRender = [...history]
                          // Removed virtual initial submission

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
                                        Scheduled: <span className="font-bold opacity-80">{formatDisplayDate(h.previousPreferredDate, 'none')}</span> ➔ <span className="font-bold text-amber-500">{formatDisplayDate(h.newPreferredDate)}</span>
                                      </p>
                                    )}
                                    {h.newAssignedTo !== h.previousAssignedTo && (
                                      <p className="text-[10px]">
                                        Assigned: <span className="font-bold opacity-80"><EmployeeNameLink nameOrId={h.previousAssignedToName || 'none'} /></span> ➔ <span className="font-bold text-teal-500"><EmployeeNameLink nameOrId={h.newAssignedToName || 'none'} /></span>
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
                )}
              </div>

              {/* Footer Actions */}
              <div className="shrink-0 px-6 py-4 flex flex-col sm:flex-row justify-end gap-3"
                style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
                <button type="button" onClick={() => setShowHistoryPanel(prev => !prev)}
                  className="px-5 py-2 rounded-lg text-xs font-bold border transition-all hover:bg-slate-50 dark:hover:bg-slate-800 mr-auto flex items-center gap-1.5"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>
                  <Clock className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                  {showHistoryPanel ? 'Hide Update History' : 'View Update History'}
                </button>
                {canEdit && (
                  <button onClick={() => { openEditModal(t); setDetailTicket(null); setShowHistoryPanel(false) }}
                    className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/5"
                    style={{ borderColor: inputBorder, color: textPrimary }}>
                    <Edit3 className="w-3.5 h-3.5" style={{ color: '#6366F1' }} />
                    Edit Details
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })(), document.body)}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Status Picker Modal Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {statusPicker && (() => {
        const pickerTicket = statusPicker.ticket
        const pickerMode = statusPicker.mode
        const currentStatus = pickerMode === 'edit-form'
          ? String(editForm.status || getScheduleStatusValue(pickerTicket)).toUpperCase().replace(/\s+/g, '_')
          : getScheduleStatusValue(pickerTicket)
        const currentLabel = getScheduleStatusLabel(currentStatus)
        const currentStyle = getScheduleStatusBadgeStyle(currentStatus, isLight)

        const pickStatus = (value: string) => {
          setStatusPicker(null)
          if (pickerMode === 'edit-form') {
            setEditForm(prev => ({ ...prev, status: value }))
            return
          }
          const picked = value.toUpperCase().replace(/\s+/g, '_')
          const isClosing = CLOSING_SCHEDULE_STATUSES.has(picked)
            || ['COMPLETED', 'INSTALLED'].includes(picked)
          if (isClosing) {
            const missing = getEmptyRequiredColumnsForClose(pickerTicket)
            if (missing.length > 0) {
              alert(`Cannot close ticket because the following columns are empty:\n\u2022 ${missing.join('\n\u2022 ')}`)
              return
            }
          }
          if (value === 'RESCHED') {
            if (activeTab === 'overview') {
              openEditModal(pickerTicket)
              setTimeout(() => {
                setEditForm(prev => ({ ...prev, status: 'RESCHED' }))
              }, 0)
            } else {
              openReschedDialog(pickerTicket)
            }
            return
          }
          if (value === 'CONTINUATION') {
            openContinuationDialog(pickerTicket)
            return
          }
          if (value === 'DONE_INSTALLED') {
            if (!ticketHasPaymentInfo(pickerTicket)) {
              setPaymentPrompt({ ticket: pickerTicket, nextStatus: value })
              setPromptAmount('')
              setPromptMode('CASH')
              setPromptHybridCash('')
              setPromptHybridGcash('')
              return
            }
          }
          if (value === currentStatus) return
          const livePickerTicket = findTicketInListByRef(tickets, pickerTicket, optimisticTicketsRef.current) || pickerTicket
          void saveCellEdit(livePickerTicket, 'STATUS', value)
        }

        return ReactDOM.createPortal(
          <div className="fixed inset-0 z-[12000]" onClick={() => setStatusPicker(null)}>
            <div
              className="fixed w-[230px] rounded-xl shadow-2xl overflow-hidden flex flex-col"
              style={{
                left: statusPicker.x,
                top: statusPicker.y,
                backgroundColor: cardBg,
                border: `1px solid ${border}`,
                maxHeight: 'min(450px, 70vh)',
                boxShadow: isLight
                  ? '0 10px 25px -5px rgba(15,23,42,0.1), 0 8px 10px -6px rgba(15,23,42,0.1)'
                  : '0 10px 25px -5px rgba(0,0,0,0.5)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="px-3 py-2 flex items-center justify-between gap-2 shrink-0"
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
              >
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>STATUS</p>
                  <p className="text-[11px] font-black uppercase truncate mt-0.5" style={{ color: currentStyle.color }}>
                    {currentLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusPicker(null)}
                  className="p-1 rounded-md hover:bg-slate-500/10 shrink-0"
                  style={{ color: textMuted }}
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {([
                  { title: 'PENDING', opts: SCHEDULE_PENDING_OPTS },
                  ...((activeTab === 'schedules' || pickerMode === 'edit-form')
                    ? [{ title: 'CLOSING', opts: SCHEDULE_CLOSING_OPTS }]
                    : []),
                ] as const).map((section, sectionIdx) => (
                  <div
                    key={section.title}
                    className={sectionIdx > 0 ? 'pt-2' : ''}
                    style={sectionIdx > 0 ? { borderTop: `1px solid ${border}` } : undefined}
                  >
                    <p className="px-2 pb-1.5 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>
                      {section.title}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {section.opts.map(opt => {
                        const active = currentStatus === opt.value
                        const style = getScheduleStatusBadgeStyle(opt.value, isLight)
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => pickStatus(opt.value)}
                            className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-left transition-colors"
                            style={active ? {
                              backgroundColor: '#10B981',
                              border: 'none',
                            } : {
                              backgroundColor: 'transparent',
                              border: 'none',
                            }}
                            onMouseEnter={e => {
                              if (!active) {
                                (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : '#1e293b'
                              }
                            }}
                            onMouseLeave={e => {
                              if (!active) {
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0 border"
                                style={active ? {
                                  backgroundColor: '#ffffff',
                                  borderColor: '#ffffff',
                                } : {
                                  backgroundColor: style.color,
                                  borderColor: style.borderColor,
                                }}
                              />
                              <span
                                className="text-[11px] font-bold uppercase tracking-wide truncate"
                                style={{ color: active ? '#ffffff' : textPrimary }}
                              >
                                {opt.label}
                              </span>
                            </span>
                            {active && (
                              <span className="text-[9px] font-black uppercase tracking-wider shrink-0" style={{ color: '#ffffff' }}>
                                Active
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )
      })()}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Schedule row details (remarks + payment) Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {scheduleDetailsPopup && (() => {
        const detailTicket = scheduleDetailsPopup.ticket
        const ghostKind = scheduleDetailsPopup.ghostKind
        const isGhost = Boolean(ghostKind)
        const statusVal = getScheduleStatusValue(detailTicket)
        const statusLabel = getScheduleStatusDisplay(detailTicket) || getScheduleStatusLabel(statusVal)
        const statusStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
        const remarksText = isGhost
          ? formatGhostRemarks(detailTicket, ghostKind ?? null, dateFilter)
          : getScheduleUpdateDisplay(detailTicket)
        const paymentCombined = formatCombinedPayment(detailTicket)
        const paymentMode = getPaymentMode(detailTicket).trim().toUpperCase()
        const paymentAmount = formatPaymentAmount(detailTicket)
        const customerName = getCustomerDisplayName(detailTicket)

        return ReactDOM.createPortal(
          <div className="fixed inset-0 z-[12000]" onClick={() => setScheduleDetailsPopup(null)}>
            <div
              className="fixed w-[min(22.5rem,calc(100vw-1.5rem))] rounded-xl shadow-2xl overflow-hidden flex flex-col"
              style={{
                left: scheduleDetailsPopup.x,
                top: scheduleDetailsPopup.y,
                backgroundColor: cardBg,
                border: `1px solid ${border}`,
                maxHeight: 'min(420px, 75vh)',
                boxShadow: isLight
                  ? '0 10px 25px -5px rgba(15,23,42,0.12), 0 8px 10px -6px rgba(15,23,42,0.1)'
                  : '0 10px 25px -5px rgba(0,0,0,0.5)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="px-3 py-2.5 flex items-start justify-between gap-2 shrink-0"
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
              >
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>Schedule details</p>
                  <p className="text-[12px] font-bold truncate mt-0.5" style={{ color: textPrimary }} title={customerName}>
                    {customerName || EMPTY_CELL}
                  </p>
                  <span
                    className="inline-block mt-1.5 text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: statusStyle.color }}
                  >
                    {statusLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleDetailsPopup(null)}
                  className="p-1 rounded-md hover:bg-slate-500/10 shrink-0"
                  style={{ color: textMuted }}
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-1.5" style={{ color: textMuted }}>Remarks</p>
                  <p
                    className="text-[12px] font-semibold whitespace-pre-wrap break-words leading-relaxed"
                    style={{
                      color: remarksText ? textGreen : textMuted,
                      fontStyle: isGhost ? 'italic' : undefined,
                    }}
                  >
                    {remarksText || EMPTY_CELL}
                  </p>
                </div>
                <div style={{ borderTop: `1px solid ${border}` }} className="pt-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-1.5" style={{ color: textMuted }}>Payment</p>
                  {!paymentCombined ? (
                    <p className="text-[12px]" style={{ color: textMuted }}>{EMPTY_CELL}</p>
                  ) : paymentMode === 'FREE' || paymentMode === 'FREE INSTALL' ? (
                    <p className="text-[12px] font-bold" style={{ color: isLight ? '#047857' : '#6ee7b7' }}>FREE</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {paymentMode ? (
                        <p className="text-[12px]">
                          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Mode </span>
                          <span className="font-semibold" style={{ color: textPrimary }}>{paymentMode}</span>
                        </p>
                      ) : null}
                      {paymentAmount ? (
                        <p className="text-[12px]">
                          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Amount </span>
                          <span className="font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: textPrimary }}>{formatPesoPrefix(paymentAmount)}</span>
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {canEdit && !isGhost ? (
                <div
                  className="px-3 py-2.5 flex items-center justify-end gap-2 shrink-0"
                  style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const t = detailTicket
                      setScheduleDetailsPopup(null)
                      openStatusPicker(t, 'inline', document.querySelector(`[data-cell-key="${t.id}:STATUS"]`) as HTMLElement)
                    }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors"
                    style={{ color: green, border: `1px solid ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(74,222,128,0.3)'}` }}
                  >
                    Change status
                  </button>
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      })()}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Final Date Picker Popup (My Tickets) Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {finalDatePicker && (() => {
        const { ticket, x, y, value, preferredDate } = finalDatePicker
        const todayKey = todayDateKey()
        const fallback = new Date(`${todayKey}T00:00:00`)
        const calYear = finalDateCalMonth?.year ?? fallback.getFullYear()
        const calMonth = finalDateCalMonth?.month ?? fallback.getMonth()
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
        const firstDow = new Date(calYear, calMonth, 1).getDay()
        const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
        const selLabel = value ? formatDateKeyLabel(value) : ''
        const preferredLabel = preferredDate ? formatDateKeyLabel(preferredDate) : ''
        const goMonth = (delta: number) => {
          const cur = new Date(calYear, calMonth, 1)
          cur.setMonth(cur.getMonth() + delta)
          setFinalDateCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
        }
        const atTodayMonth = false
        const pickDate = (dateKey: string) => {
          setFinalDatePicker(prev => (prev ? { ...prev, value: dateKey } : null))
        }
        const commitFinalDate = () => {
          if (!value.trim()) return
          const pickerTicket = ticket
          closeFinalDatePicker()
          void saveCellEdit(pickerTicket, 'FINAL DATE', value)
        }
        const clearFinalDate = () => {
          const pickerTicket = ticket
          closeFinalDatePicker()
          void saveCellEdit(pickerTicket, 'FINAL DATE', '')
        }

        return ReactDOM.createPortal(
          <div className="fixed inset-0 z-[12000]" onClick={closeFinalDatePicker}>
            <div
              className="fixed w-[min(18rem,calc(100vw-1rem))] rounded-xl shadow-2xl overflow-hidden flex flex-col"
              style={{
                left: x,
                top: y,
                backgroundColor: cardBg,
                border: `1px solid ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(74,222,128,0.3)'}`,
                maxHeight: 'min(420px, 75vh)',
                boxShadow: isLight
                  ? '0 12px 28px -6px rgba(15,23,42,0.18), 0 8px 12px -8px rgba(15,23,42,0.12)'
                  : '0 12px 28px -6px rgba(0,0,0,0.55)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="px-3 py-2.5 flex items-start justify-between gap-2 shrink-0"
                style={{
                  borderBottom: `1px solid ${isLight ? 'rgba(22,163,74,0.2)' : 'rgba(74,222,128,0.2)'}`,
                  backgroundColor: isLight ? 'rgba(22,163,74,0.08)' : 'rgba(16,185,129,0.1)',
                }}
              >
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: isLight ? '#166534' : '#6EE7B7' }}>
                    Final schedule date
                  </p>
                  <p className="text-[11px] font-bold truncate mt-0.5" style={{ color: textPrimary }}>
                    {getCustomerDisplayName(ticket)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeFinalDatePicker}
                  className="p-1 rounded-md hover:bg-slate-500/10 shrink-0"
                  style={{ color: textMuted }}
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {preferredLabel && (
                <div
                  className="px-3 py-2 shrink-0"
                  style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
                >
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] mb-1.5" style={{ color: textMuted }}>
                    Customer preferred date
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      pickDate(preferredDate)
                      const d = new Date(`${preferredDate}T00:00:00`)
                      setFinalDateCalMonth({ year: d.getFullYear(), month: d.getMonth() })
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors"
                    style={{
                      borderColor: value === preferredDate
                        ? (isLight ? 'rgba(22,163,74,0.45)' : 'rgba(110,231,183,0.45)')
                        : inputBorder,
                      backgroundColor: value === preferredDate
                        ? (isLight ? 'rgba(22,163,74,0.1)' : 'rgba(16,185,129,0.14)')
                        : (isLight ? '#ffffff' : inputBg),
                    }}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
                      <span className="text-[11px] font-bold truncate" style={{ color: textPrimary }}>
                        {preferredLabel}
                      </span>
                    </span>
                    {value === preferredDate && (
                      <span className="text-[9px] font-black uppercase shrink-0" style={{ color: green }}>Selected</span>
                    )}
                  </button>
                </div>
              )}

              <div className="px-3 pt-2.5 pb-1 flex-1 overflow-y-auto">
                <div className="mb-2 text-center">
                  <span className="text-[11px] font-extrabold tracking-tight" style={{ color: value ? green : textMuted }}>
                    {value ? selLabel : 'Pick a date below'}
                  </span>
                </div>

                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <button
                    type="button"
                    onClick={() => !atTodayMonth && goMonth(-1)}
                    disabled={atTodayMonth}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      color: atTodayMonth ? (isLight ? '#cbd5e1' : '#2d3f5a') : textMuted,
                      cursor: atTodayMonth ? 'not-allowed' : 'pointer',
                    }}
                  >
                    &lt;
                  </button>
                  <span className="text-[11px] font-bold" style={{ color: textPrimary }}>{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => goMonth(1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                    style={{ color: textMuted }}
                  >
                    &gt;
                  </button>
                </div>

                <div className="grid grid-cols-7 mb-1">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-center text-[9px] font-bold py-0.5" style={{ color: textMuted }}>{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-y-0.5">
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`fd-empty-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    // Past dates are selectable — a ticket's schedule date can be moved to any
                    // date, including catching up a record that should have been on an earlier day.
                    const past = false
                    const isToday = dKey === todayKey
                    const isSel = dKey === value
                    const isPreferred = Boolean(preferredDate && dKey === preferredDate)
                    return (
                      <button
                        key={dKey}
                        type="button"
                        disabled={past}
                        onClick={() => pickDate(dKey)}
                        className="relative w-full aspect-square flex items-center justify-center text-[11px] font-semibold rounded-full transition-all"
                        style={{
                          color: isSel ? '#fff' : past ? (isLight ? '#cbd5e1' : '#2d3f5a') : isToday ? green : textPrimary,
                          backgroundColor: isSel ? green : isPreferred && !isSel ? (isLight ? 'rgba(22,163,74,0.12)' : 'rgba(16,185,129,0.16)') : 'transparent',
                          border: isPreferred && !isSel ? `1px dashed ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(110,231,183,0.35)'}` : '1px solid transparent',
                          cursor: past ? 'not-allowed' : 'pointer',
                          fontWeight: isToday && !isSel ? 800 : 600,
                        }}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div
                className="px-3 py-2 flex items-center justify-between gap-2 border-t shrink-0"
                style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
              >
                <button
                  type="button"
                  onClick={() => pickDate(todayKey)}
                  className="text-[10px] font-bold transition-colors"
                  style={{ color: green }}
                >
                  Today
                </button>
                <div className="flex items-center gap-1.5">
                  {!isMyTickets && value.trim() && (
                    <button
                      type="button"
                      onClick={clearFinalDate}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border"
                      style={{ borderColor: isLight ? '#fca5a5' : 'rgba(239,68,68,0.35)', color: isLight ? '#b91c1c' : '#fca5a5', backgroundColor: 'transparent' }}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeFinalDatePicker}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold border"
                    style={{ borderColor: inputBorder, color: textMuted, backgroundColor: 'transparent' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={commitFinalDate}
                    disabled={!value.trim()}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white disabled:opacity-40"
                    style={{ backgroundColor: green }}
                  >
                    Set Date
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      })()}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Excel Import Results Modal Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {importResults && importResults.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="flex flex-col w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between gap-3 shrink-0 border-b"
              style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
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
                    Ã¢Å¡Â Ã¯Â¸Â Needs Payment Confirmation ({importResults.needsConfirmation.length})
                  </h4>
                  <p className="text-[10px]" style={{ color: textMuted }}>
                    These tickets are marked as installed in the spreadsheet but did not contain valid payment details. Please complete them below:
                  </p>
                  <div className="flex flex-col gap-2 border rounded-2xl overflow-hidden" style={{ borderColor: border, backgroundColor: inputBg }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f1f5f9' : '#0d1b2e' }}>
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
                    Ã¢Å“â€¦ Ready to Update ({importResults.updates.length})
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
                    Ã¢â€žÂ¹Ã¯Â¸Â Unmatched Rows ({importResults.unmatchedCount})
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
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>REMARKS</th>
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
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.location || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.district || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.phone || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.brand || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.dlr || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.status || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.commit || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.installer || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.confirmation || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.service || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.update || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.charges !== undefined ? `\u20B1${Number(row.charges).toLocaleString('en-PH')}` : EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.paymentMode || EMPTY_CELL}</td>
                                <td className="px-3 py-2" style={{ color: textPrimary, whiteSpace: 'nowrap' }}>{row.controlNo || EMPTY_CELL}</td>
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
              style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
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
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm"
                style={{ backgroundColor: green }}>
                {`Apply & Save All (${importResults.matchedCount} updates, ${importResults.unmatchedCount} new)`}
              </button>
            </div>

          </div>
        </div>
      )}

      {addModalOpen && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-4 sm:pt-8 px-3 sm:px-6 pb-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="flex flex-col w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border, maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="shrink-0 border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#111827' }}>
              <div className="px-5 sm:px-6 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-black text-base leading-tight" style={{ color: textPrimary }}>Add Schedule Ticket</h2>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: textMuted }}>
                      Branch: {activeBranchLabel || 'Select branch'} Ã‚Â· Negotiators for this branch only
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={requestCloseAddModal}
                  className="p-1.5 rounded-lg border transition-colors hover:bg-slate-500/10 shrink-0"
                  style={{ borderColor: inputBorder, color: textMuted }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 flex flex-col gap-5">
              <div>
                <div className="pt-0.5 pb-1.5 border-b mb-3" style={{ borderColor: border }}>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Customer Information</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Preferred Date" required>
                    <input type="date" value={addForm.preferredDate || ''}
                      onChange={e => setAddForm({ ...addForm, preferredDate: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Customer Name" required>
                    <input type="text" value={addForm.customerName || ''}
                      onChange={e => setAddForm({ ...addForm, customerName: e.target.value.toUpperCase() })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Contact No." required>
                    <input type="text" value={addForm.contactPhone || ''}
                      onChange={e => setAddForm({ ...addForm, contactPhone: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="District">
                    <input type="text" value={addForm.district || ''}
                      onChange={e => setAddForm({ ...addForm, district: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Destination/Address" required full>
                    <textarea value={addForm.location || ''}
                      onChange={e => setAddForm({ ...addForm, location: e.target.value.toUpperCase() })}
                      rows={2}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Commit Terms" full>
                    <input type="text" value={addForm.commitTerms || ''}
                      onChange={e => setAddForm({ ...addForm, commitTerms: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              <div>
                <div className="pt-0.5 pb-1.5 border-b mb-3" style={{ borderColor: border }}>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Service & Assignment</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Ticket Type" required>
                    <select
                      value={addForm.ticketCategory || 'INSTALLATION'}
                      onChange={e => setAddForm({ ...addForm, ticketCategory: e.target.value as TicketCategoryValue })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
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
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Dealer (DLR)">
                    <input type="text" value={addForm.dealer || ''}
                      list="add-ticket-dealer-list"
                      onChange={e => setAddForm({ ...addForm, dealer: e.target.value })}
                      onBlur={e => {
                        const name = e.target.value.trim().toUpperCase()
                        if (!name || name.includes(' - ')) return
                        if (!relayCustomStores.some(d => d.toUpperCase() === name)) {
                          handlePersistCustomStores([...relayCustomStores, name])
                        }
                      }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    <datalist id="add-ticket-dealer-list">{relayCustomStores.map(d => <option key={d} value={d} />)}</datalist>
                  </Field>
                  <Field label="Service / Driver">
                    <input type="text" value={addForm.serviceDriver || ''}
                      list="add-ticket-driver-roster"
                      placeholder={activeBranchRoster.drivers.length ? 'Select or type driver\u2026' : 'e.g. T3 (DOMINIC) - 1'}
                      onChange={e => setAddForm({ ...addForm, serviceDriver: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    <datalist id="add-ticket-driver-roster">
                      {activeBranchRoster.drivers.map(name => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={isTaguigServices ? 'Technician' : 'Installer / Technician'}>
                    <input type="text" value={addForm.installerName || ''}
                      list="add-ticket-installer-roster"
                      placeholder={activeBranchRoster.installers.length ? 'Select or type installer\u2026' : 'e.g. RYAN - 1'}
                      onChange={e => setAddForm({ ...addForm, installerName: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    <datalist id="add-ticket-installer-roster">
                      {activeBranchRoster.installers.map(name => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Negotiator" required>
                    <select
                      value={addForm.negotiatorId || ''}
                      onChange={e => setAddForm({ ...addForm, negotiatorId: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                    >
                      <option value="">
                        {addModalNegotiators.length ? 'Select negotiator' : 'No negotiators for this branch'}
                      </option>
                      {addModalNegotiators.map(emp => (
                        <option key={emp.id} value={emp.id}>{formatNegotiatorLabel(emp)}</option>
                      ))}
                    </select>
                    {addModalNegotiators.length === 0 && (
                      <span className="text-[10px] font-semibold text-amber-600 mt-1">
                        No negotiators assigned to {activeBranchLabel || 'this branch'}.
                      </span>
                    )}
                  </Field>
                  <Field label="Ticket No.">
                    <input type="text" value={addForm.ticketNumber || ''}
                      placeholder="Auto-generated if left blank (e.g. AS-001)"
                      onChange={e => setAddForm({ ...addForm, ticketNumber: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Control No. / SI (Aircon)">
                    <input type="text" value={addForm.controlNumber || ''}
                      placeholder={`From import only ${EMPTY_CELL} aircon papers / SI`}
                      onChange={e => setAddForm({ ...addForm, controlNumber: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              <div>
                <div className="pt-0.5 pb-1.5 border-b mb-3" style={{ borderColor: border }}>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Payment (optional)</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Mode of Payment">
                    <select value={addForm.modeOfPayment || ''}
                      onChange={e => {
                        const nextMode = e.target.value
                        setAddForm(prev => ({
                          ...prev,
                          modeOfPayment: nextMode,
                          installationCharges: (nextMode === 'FREE' || nextMode === 'FREE INSTALL')
                            ? 0
                            : nextMode === 'PENDING'
                              ? undefined
                              : prev.installationCharges,
                        }))
                      }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      <option value="">-- Select --</option>
                      <option value="CASH">CASH</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
                      <option value="GCASH">GCASH</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="FREE INSTALL">FREE INSTALL</option>
                      <option value="PENDING">PENDING</option>
                    </select>
                  </Field>
                  <Field label="Payment Amount (\u20B1)">
                    <input type="number" step="0.01" min="0"
                      placeholder="0.00"
                      value={addForm.installationCharges ?? ''}
                      disabled={addForm.modeOfPayment === 'FREE' || addForm.modeOfPayment === 'FREE INSTALL' || addForm.modeOfPayment === 'PENDING'}
                      onChange={e => setAddForm({ ...addForm, installationCharges: e.target.value ? Number(e.target.value) : undefined })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full disabled:opacity-60"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>
            </div>

            <div
              className="shrink-0 px-5 sm:px-6 py-3 flex items-center justify-end gap-2.5 border-t"
              style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#111827' }}
            >
              <button
                type="button"
                onClick={requestCloseAddModal}
                className="px-5 py-2 rounded-lg text-xs font-bold border transition-colors"
                style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={promptSaveManualTicket}
                disabled={!addForm.negotiatorId || addModalNegotiators.length === 0}
                className="px-6 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 shadow-md"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                Save Ticket
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {editModalOpen && editTicket && activeTab === 'overview' && (
        <RelayEditTicketModal
          ticket={editTicket}
          ticketNumberLabel={editTicket.ticketNumber || editTicket.ticket_number || editTicket.id}
          surface={activeTab === 'overview' ? 'overview' : isMyTickets ? 'my-tickets' : 'schedules'}
          isAdmin={isAdmin}
          isLight={isLight}
          cardBg={cardBg}
          border={border}
          textPrimary={textPrimary}
          textMuted={textMuted}
          inputBg={inputBg}
          inputBorder={inputBorder}
          compactInput="w-full border rounded-xl px-3.5 py-2.5 sm:py-2.5 text-[13px] outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 normal-case"
          branches={branches}
          relayCustomStores={relayCustomStores}
          onPersistCustomStores={handlePersistCustomStores}
          dealers={dealers}
          onDealersChanged={fetchDealers}
          parseStoreVendor={parseStoreVendor}
          resolveBranch={resolveBranch}
          negotiatorsForBranch={negotiatorsForBranch}
          saving={editSaving}
          showDelete={canEdit && activeTab !== 'overview'}
          driverRoster={editModalRoster.drivers}
          installerRoster={editModalRoster.installers}
          isTaguigServices={isTaguigServices}

          editOriginalDate={editOriginalDate ? formatDateKeyLabel(editOriginalDate) : ''}
          onClose={closeEditModal}
          onDelete={() => { if (editTicket?.id) { handleDelete(editTicket.id); closeEditModal() } }}
          onSave={handleUnifiedEditSave}
          getTicketNumber={(t) => (t.ticketNumber || t.ticket_number || t.id || '')}
          parseAcDetails={(t) => { try { return t.acDetails ? JSON.parse(t.acDetails) : {} } catch { return {} } }}
          draftExtensions={{
            ticketNumber: editForm.ticketNumber || editTicket.ticketNumber || editTicket.ticket_number || '',
            ticketCategory: editForm.ticketCategory || inferCategoryFromTicket(editTicket),
            scheduleStatus: editForm.status || getScheduleStatusValue(editTicket),
            finalDate: editForm.finalDate || getFinalDateKey(editTicket) || getPreferredDateKey(editTicket) || '',
            serviceDriver: editForm.serviceDriver || (isMyTickets ? formatRelayTicketTypeShort(editTicket) : getTicketVehicleDisplay(editTicket)),
            driverName: editForm.driverName || (isMyTickets ? '' : getTicketDriverDisplay(editTicket)),
            installerName: editForm.installerName || getInstallerDisplay(editTicket, branchEmployees, activeBranchId),
            reschedulePending: Boolean(editForm.reschedulePending),
            remarks: editForm.remarks || editTicket.remarks || editTicket.remarksUpdate || '',
            commitTerms: editForm.commitTerms || editTicket.commitTerms || editTicket.commitType || '',
            assignTechId: editForm.negotiatorId || editTicket.negotiatorId || editTicket.negotiator_id || editTicket.assignedTo || '',
            assignBranchId: editForm.branchId || editTicket.branchId || editTicket.branch_id || activeBranchId || '',
            modeOfPayment: editForm.modeOfPayment || resolveTicketPayment(editTicket).mode || '',
            installationCharges: editForm.installationCharges ?? resolveTicketPayment(editTicket).amount ?? 0,
          }}
        />
      )}

      {editModalOpen && editTicket && activeTab !== 'overview' && (
        <RelayEditTicketModal
          ticket={editTicket}
          ticketNumberLabel={editTicket.ticketNumber || editTicket.ticket_number || editTicket.id}
          surface={isMyTickets ? 'my-tickets' : 'schedules'}
          isAdmin={isAdmin}
          isLight={isLight}
          cardBg={cardBg}
          border={border}
          textPrimary={textPrimary}
          textMuted={textMuted}
          inputBg={inputBg}
          inputBorder={inputBorder}
          compactInput="w-full border rounded-xl px-3.5 py-2.5 sm:py-2.5 text-[13px] outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 normal-case"
          branches={branches}
          relayCustomStores={relayCustomStores}
          onPersistCustomStores={handlePersistCustomStores}
          dealers={dealers}
          onDealersChanged={fetchDealers}
          parseStoreVendor={parseStoreVendor}
          resolveBranch={resolveBranch}
          negotiatorsForBranch={negotiatorsForBranch}
          saving={editSaving}
          showDelete={canEdit}
          driverRoster={editModalRoster.drivers}
          installerRoster={editModalRoster.installers}
          isTaguigServices={isTaguigServices}
          editOriginalDate={editOriginalDate ? formatDateKeyLabel(editOriginalDate) : ''}
          onClose={requestCloseEditModal}
          onDelete={canEdit ? () => { if (editTicket?.id) { handleDelete(editTicket.id); closeEditModal() } } : undefined}
          onSave={handleUnifiedEditSave}
          getTicketNumber={(t) => (t.ticketNumber || t.ticket_number || t.id || '')}
          parseAcDetails={(t) => { try { return t.acDetails ? JSON.parse(t.acDetails) : {} } catch { return {} } }}
          draftExtensions={{
            ticketNumber: editForm.ticketNumber || editTicket.ticketNumber || editTicket.ticket_number || '',
            ticketCategory: editForm.ticketCategory || inferCategoryFromTicket(editTicket),
            scheduleStatus: editForm.status || getScheduleStatusValue(editTicket),
            finalDate: editForm.finalDate || getFinalDateKey(editTicket) || getPreferredDateKey(editTicket) || '',
            serviceDriver: editForm.serviceDriver || getTicketVehicleDisplay(editTicket),
            driverName: editForm.driverName || getTicketDriverDisplay(editTicket),
            installerName: editForm.installerName || getInstallerDisplay(editTicket, branchEmployees, activeBranchId),
            reschedulePending: Boolean(editForm.reschedulePending),
            remarks: editForm.remarks || editTicket.remarks || editTicket.remarksUpdate || '',
            commitTerms: editForm.commitTerms || editTicket.commitTerms || editTicket.commitType || '',
            assignTechId: editForm.negotiatorId || editTicket.negotiatorId || editTicket.negotiator_id || editTicket.assignedTo || '',
            assignBranchId: editForm.branchId || editTicket.branchId || editTicket.branch_id || activeBranchId || '',
            modeOfPayment: editForm.modeOfPayment || resolveTicketPayment(editTicket).mode || '',
            installationCharges: editForm.installationCharges ?? resolveTicketPayment(editTicket).amount ?? 0,
          }}
        />
      )}


      <ConfirmDialog dialog={confirmModal} onClose={() => setConfirmModal(null)} />

      {expandedCell && expandedPopoverPos && (() => {
        const ticket = tickets.find(t => t.id === expandedCell.ticketId)
          || optimisticTicketsRef.current.get(expandedCell.ticketId)
        if (!ticket) return null
        const col = columns.find(c => c.label === expandedCell.colLabel)
        if (!col) return null
        const idx = visible.findIndex(t => t.id === ticket.id)
        const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null
        const isGhost = Boolean(ghostKind)
        return ReactDOM.createPortal(
          <div
            data-expanded-popover="true"
            className="rounded-lg border px-3 py-2 text-xs"
            style={{
              position: 'fixed',
              left: expandedPopoverPos.left,
              top: expandedPopoverPos.top,
              width: expandedPopoverPos.width,
              maxWidth: 'calc(100vw - 1rem)',
              maxHeight: 'min(320px, calc(100vh - 1rem))',
              overflowY: 'auto',
              zIndex: 14000,
              backgroundColor: cardBg,
              borderColor: inputBorder,
              boxShadow: isLight
                ? '0 8px 24px rgba(15,23,42,0.12)'
                : '0 8px 24px rgba(0,0,0,0.35)',
            }}
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            {renderCell(ticket, col, idx >= 0 ? idx : undefined, isGhost, ghostKind, true)}
          </div>,
          document.body,
        )
      })()}

      {reschedDialog && (() => {
        const todayKey = todayDateKey()
        const fallback = new Date(`${todayKey}T00:00:00`)
        const calYear = reschedCalMonth?.year ?? fallback.getFullYear()
        const calMonth = reschedCalMonth?.month ?? fallback.getMonth()
        const calKey = `resched-cal-${reschedDialog.ticket.id}`
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
        const firstDow = new Date(calYear, calMonth, 1).getDay()
        const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
        const selLabel = reschedToDate ? formatDateKeyLabel(reschedToDate) : ''
        const goMonth = (delta: number) => {
          const cur = new Date(calYear, calMonth, 1)
          cur.setMonth(cur.getMonth() + delta)
          setReschedCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
        }
        const atTodayMonth = false
        return (
          <div
            key={calKey}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }}
            onClick={closeReschedDialog}
          >
            <div
              className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b" style={{ borderColor: border }}>
                <h3 className="text-sm font-black" style={{ color: textPrimary }}>Reschedule appointment</h3>
                <p className="text-xs mt-1" style={{ color: textMuted }}>
                  {getCustomerDisplayName(reschedDialog.ticket)}
                  {getPreferredDateKey(reschedDialog.ticket)
                    ? ` Ã‚Â· currently ${formatDateKeyLabel(getPreferredDateKey(reschedDialog.ticket))}`
                    : ''}
                </p>
              </div>

              {/* Calendar */}
              <div className="px-4 pt-4 pb-1" style={{ opacity: reschedPending ? 0.4 : 1, pointerEvents: reschedPending ? 'none' : 'auto' }}>
                {/* Selected date display */}
                <div className="mb-3 text-center">
                  <span
                    className="text-base font-extrabold tracking-tight"
                    style={{ color: reschedToDate ? green : textMuted }}
                  >
                    {reschedToDate ? selLabel : 'No date selected'}
                  </span>
                </div>

                {/* Month nav */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    type="button"
                    onClick={() => !atTodayMonth && goMonth(-1)}
                    disabled={atTodayMonth}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors text-sm font-bold"
                    style={{ color: atTodayMonth ? (isLight ? '#cbd5e1' : '#2d3f5a') : textMuted, backgroundColor: 'transparent', cursor: atTodayMonth ? 'not-allowed' : 'pointer' }}
                  >
                    &lt;
                  </button>
                  <span className="text-xs font-bold" style={{ color: textPrimary }}>{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => goMonth(1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold"
                    style={{ color: textMuted, backgroundColor: 'transparent' }}
                  >
                    &gt;
                  </button>
                </div>

                {/* Day-of-week header */}
                <div className="grid grid-cols-7 mb-1">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: textMuted }}>{d}</div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-y-0.5 mb-1">
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    // Past dates are selectable — rescheduling to an earlier date (e.g.
                    // correcting a record) is allowed, same as the Final Date picker.
                    const past = false
                    const isToday = dKey === todayKey
                    const isSel = dKey === reschedToDate
                    return (
                      <button
                        key={dKey}
                        type="button"
                        disabled={past}
                        onClick={() => { setReschedToDate(dKey); setReschedPending(false) }}
                        className="relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-full transition-all"
                        style={{
                          color: isSel ? '#fff' : past ? (isLight ? '#cbd5e1' : '#2d3f5a') : isToday ? green : textPrimary,
                          backgroundColor: isSel ? green : 'transparent',
                          cursor: past ? 'not-allowed' : 'pointer',
                          fontWeight: isToday && !isSel ? 800 : 600,
                        }}
                      >
                        {day}
                        {isToday && !isSel && (
                          <span
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                            style={{ backgroundColor: green }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Pending checkbox */}
              <div className="px-5 pb-4">
                <label className="flex items-start gap-2.5 text-xs font-semibold cursor-pointer" style={{ color: textPrimary }}>
                  <input
                    type="checkbox"
                    checked={reschedPending}
                    onChange={e => {
                      setReschedPending(e.target.checked)
                      if (e.target.checked) setReschedToDate('')
                    }}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    Pending {EMPTY_CELL} no date slot available yet
                    <span className="block text-[11px] font-medium mt-0.5 opacity-70" style={{ color: textMuted }}>
                      Ticket stays on the current schedule date until a new slot is confirmed.
                    </span>
                  </span>
                </label>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 flex items-center justify-end gap-2 border-t" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={closeReschedDialog}
                  className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
                  style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void commitInlineReschedule()}
                  disabled={!reschedPending && !reschedToDate.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: green }}
                >
                  {reschedPending ? 'Mark Pending' : 'Reschedule'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {continuationDialog && (() => {
        const todayKey = todayDateKey()
        const fallback = new Date(`${todayKey}T00:00:00`)
        const calYear = continuationCalMonth?.year ?? fallback.getFullYear()
        const calMonth = continuationCalMonth?.month ?? fallback.getMonth()
        const calKey = `continuation-cal-${continuationDialog.ticket.id}`
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
        const firstDow = new Date(calYear, calMonth, 1).getDay()
        const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

        const goMonth = (delta: number) => {
          const cur = new Date(calYear, calMonth, 1)
          cur.setMonth(cur.getMonth() + delta)
          setContinuationCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
        }

        const toggleDate = (dKey: string) => {
          setContinuationSelectedDates(prev => {
            if (prev.includes(dKey)) {
              return prev.filter(d => d !== dKey)
            } else {
              return [...prev, dKey].sort()
            }
          })
        }

        return (
          <div
            key={calKey}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }}
            onClick={closeContinuationDialog}
          >
            <div
              className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b" style={{ borderColor: border }}>
                <h3 className="text-sm font-black" style={{ color: textPrimary }}>Set Continuation Dates</h3>
                <p className="text-xs mt-1" style={{ color: textMuted }}>
                  {getCustomerDisplayName(continuationDialog.ticket)}
                </p>
                <p className="text-[10px] mt-1 font-medium" style={{ color: textMuted }}>
                  Past and future dates can be selected.
                </p>
              </div>

              {/* Selected Dates Badges */}
              <div className="px-4 py-2 bg-slate-500/5 border-b flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto" style={{ borderColor: border }}>
                {continuationSelectedDates.length === 0 ? (
                  <span className="text-[11px] text-slate-400 font-medium py-0.5">No continuation dates selected. Click on the calendar below to toggle dates.</span>
                ) : (
                  continuationSelectedDates.map(d => {
                    const label = formatSimpleDateShort(d)
                    return (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition-colors"
                        style={{
                          color: isLight ? '#4f46e5' : '#a5b4fc',
                          backgroundColor: isLight ? '#e0e7ff' : 'rgba(79,70,229,0.18)',
                          border: `1px solid ${isLight ? '#c7d2fe' : 'rgba(79,70,229,0.35)'}`,
                        }}
                      >
                        {label}
                        <button
                          type="button"
                          onClick={() => toggleDate(d)}
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-indigo-500/20 text-[9px] font-extrabold ml-1"
                        >
                          x
                        </button>
                      </span>
                    )
                  })
                )}
              </div>

              {/* Calendar */}
              <div className="px-4 pt-4 pb-4">
                {/* Month nav */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    type="button"
                    onClick={() => goMonth(-1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold"
                    style={{ color: textMuted, backgroundColor: 'transparent', cursor: 'pointer' }}
                  >
                    &lt;
                  </button>
                  <span className="text-xs font-bold" style={{ color: textPrimary }}>{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => goMonth(1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold"
                    style={{ color: textMuted, backgroundColor: 'transparent' }}
                  >
                    &gt;
                  </button>
                </div>

                {/* Day-of-week header */}
                <div className="grid grid-cols-7 mb-1">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: textMuted }}>{d}</div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-y-0.5 mb-1">
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const isToday = dKey === todayKey
                    const isSel = continuationSelectedDates.includes(dKey)
                    return (
                      <button
                        key={dKey}
                        type="button"
                        onClick={() => toggleDate(dKey)}
                        className="relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-full transition-all"
                        style={{
                          color: isSel ? '#fff' : isToday ? green : textPrimary,
                          backgroundColor: isSel ? '#4f46e5' : 'transparent',
                          cursor: 'pointer',
                          fontWeight: isToday && !isSel ? 800 : 600,
                        }}
                      >
                        {day}
                        {isToday && !isSel && (
                          <span
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                            style={{ backgroundColor: green }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 flex items-center justify-end gap-2 border-t" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={closeContinuationDialog}
                  className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
                  style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void commitInlineContinuation()}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: '#4f46e5' }}
                >
                  Save Continuation
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {paymentPrompt && (() => {
        const { ticket } = paymentPrompt
        const isFreeOrPending = promptMode === 'FREE' || promptMode === 'FREE INSTALL' || promptMode === 'PENDING'
        const isHybrid = promptMode === 'HYBRID'
        const hybridCashNum = parseFloat(promptHybridCash) || 0
        const hybridGcashNum = parseFloat(promptHybridGcash) || 0
        const hybridTotal = hybridCashNum + hybridGcashNum
        const handleSubmit = (e: React.FormEvent) => {
          e.preventDefault()
          if (isHybrid) {
            if (hybridTotal <= 0) return
            const breakdown: PaymentBreakdownEntry[] = []
            if (hybridCashNum > 0) breakdown.push({ mode: 'CASH', amount: hybridCashNum })
            if (hybridGcashNum > 0) breakdown.push({ mode: 'GCASH', amount: hybridGcashNum })
            void saveCellEdit(ticket, 'STATUS', paymentPrompt.nextStatus, { amount: hybridTotal, modeOfPayment: 'HYBRID', breakdown })
            setPaymentPrompt(null)
            return
          }
          const amt = isFreeOrPending ? undefined : parseFloat(promptAmount) || 0
          void saveCellEdit(ticket, 'STATUS', paymentPrompt.nextStatus, { amount: amt, modeOfPayment: promptMode })
          setPaymentPrompt(null)
        }
        return ReactDOM.createPortal(
          <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setPaymentPrompt(null)}>
            <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              onClick={e => e.stopPropagation()}>
              <form onSubmit={handleSubmit}>
                <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: border }}>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>
                      Payment Details
                    </h3>
                    <p className="text-[11px] font-semibold mt-0.5" style={{ color: textMuted }}>
                      Set payment to complete and archive this ticket
                    </p>
                  </div>
                  <button type="button" onClick={() => setPaymentPrompt(null)} className="p-1 rounded-md hover:bg-slate-500/10" style={{ color: textMuted }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 flex flex-col gap-4">
                  <div className="p-3.5 rounded-xl border flex flex-col gap-1" style={{ backgroundColor: isLight ? '#f8fafc' : '#1a2537', borderColor: border }}>
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-60" style={{ color: textMuted }}>Customer</span>
                    <span className="text-xs font-bold" style={{ color: textPrimary }}>{getCustomerDisplayName(ticket)}</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Mode of Payment</label>
                    <select
                      value={promptMode}
                      onChange={e => {
                        const m = e.target.value
                        setPromptMode(m)
                        if (m === 'FREE' || m === 'FREE INSTALL') setPromptAmount('0')
                        else if (m === 'PENDING') setPromptAmount('')
                      }}
                      required
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                    >
                      <option value="CASH">CASH</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
                      <option value="GCASH">GCASH</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="HYBRID">HYBRID (SPLIT PAYMENT)</option>
                      <option value="FREE INSTALL">FREE INSTALL</option>
                      <option value="PENDING">PENDING</option>
                    </select>
                  </div>

                  {isHybrid ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Cash Amount (\u20B1)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={promptHybridCash}
                          onChange={e => setPromptHybridCash(e.target.value)}
                          className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>GCash Amount (\u20B1)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={promptHybridGcash}
                          onChange={e => setPromptHybridGcash(e.target.value)}
                          className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                        />
                      </div>
                      <div className="p-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: isLight ? '#f0fdf4' : '#0d2a1a' }}>
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Total</span>
                        <span className="text-sm font-black" style={{ color: isLight ? '#047857' : '#6ee7b7', fontVariantNumeric: 'tabular-nums' }}>
                          {`\u20B1${hybridTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>
                      {hybridTotal <= 0 ? (
                        <p className="text-[10.5px] font-semibold" style={{ color: '#dc2626' }}>Enter at least one amount above zero.</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Payment Amount (\u20B1)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required={!isFreeOrPending}
                        disabled={isFreeOrPending}
                        placeholder="0.00"
                        value={promptAmount}
                        onChange={e => setPromptAmount(e.target.value)}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full disabled:opacity-60"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                      />
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 flex justify-end gap-3 border-t" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
                  <button type="button" onClick={() => setPaymentPrompt(null)} className="px-4 py-2 rounded-xl text-xs font-bold border transition-all" style={{ borderColor: inputBorder, color: textMuted }}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isHybrid && hybridTotal <= 0}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                  >
                    Complete & Archive
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      })()}

      {/* ── Assign Drivers Modal ──────────────────────────────────────── */}
      {bulkAssignOpen && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={() => setBulkAssignOpen(false)}
        >
          <div
            className="rounded-2xl shadow-2xl w-full max-w-sm border overflow-hidden"
            style={{ backgroundColor: cardBg, borderColor: 'rgba(37,99,235,0.35)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{
                borderColor: 'rgba(37,99,235,0.2)',
                background: isLight
                  ? 'linear-gradient(135deg, #eff6ff, #dbeafe)'
                  : 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(29,78,216,0.12))',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl" style={{ background: 'linear-gradient(135deg, #2563EB, #1d4ed8)', boxShadow: '0 2px 8px rgba(37,99,235,0.4)' }}>
                  <Car className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-black tracking-wide" style={{ color: textPrimary }}>Assign Drivers</div>
                  <div className="text-[10px] font-semibold" style={{ color: textMuted }}>Bulk update driver &amp; vehicle for an installer</div>
                </div>
              </div>
              <button type="button" onClick={() => setBulkAssignOpen(false)} style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <form
              id="bulk-assign-form"
              className="px-5 py-4 flex flex-col gap-3"
              onSubmit={async e => {
                e.preventDefault()
                if (!bulkAssignInstaller.trim()) { alert('Select an installer.'); return }
                if (!bulkAssignDriver.trim() && !bulkAssignVehicle.trim()) {
                  alert('Provide at least a driver or vehicle.'); return
                }
                setBulkAssignSaving(true)

                const installer = bulkAssignInstaller.trim()
                const driverVal = bulkAssignDriver.trim()
                const vehicleVal = bulkAssignVehicle.trim()
                const targetDate = dateFilter || todayDateKey()
                const targetInstaller = installer.toLowerCase()

                const matchesAssignTarget = (t: Ticket) => {
                  const rawInstaller = (t.installerName || '').trim().toLowerCase()
                  const cleanInstaller = rawInstaller.split(/\s*[-–—]\s*|\s+\d+/)[0].trim()
                  if (cleanInstaller !== targetInstaller) return false
                  // visible is already scoped to the current schedule date
                  if (targetDate && isScheduleGhostOnDate(t, targetDate)) return false
                  return true
                }

                const targets = visible.filter(matchesAssignTarget)
                if (targets.length === 0) {
                  setBulkAssignSaving(false)
                  alert(`No schedule rows found for installer "${installer}" on ${targetDate}.`)
                  return
                }
                const applyLocal = (list: Ticket[]) => list.map(t => {
                  if (!matchesAssignTarget(t)) return t
                  return {
                    ...t,
                    ...(driverVal ? { driverName: driverVal, driver_name: driverVal } : {}),
                    ...(vehicleVal ? { serviceVehicle: vehicleVal, service_vehicle: vehicleVal } : {}),
                    acDetails: mergeAcMeta(t, {
                      ...(driverVal ? { driverName: driverVal, driver_name: driverVal } : {}),
                      ...(vehicleVal ? { serviceVehicle: vehicleVal, service_vehicle: vehicleVal } : {}),
                    }),
                  }
                })

                // Instant UI update
                setTickets(prev => {
                  const next = applyLocal(prev)
                  writeSchedulesTabCache(schedulesCacheKeyForTab(), next, 'local')
                  return next
                })
                setBulkAssignOpen(false)
                setBulkAssignInstaller('')
                setBulkAssignDriver('')
                setBulkAssignVehicle('')
                showToast(`Assigning ${installer}…`)

                void (async () => {
                  const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
                  const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenStr}`,
                  }
                  try {
                    let usedBulk = false
                    try {
                      const res = await fetch(`${API_BASE_URL}/tickets/bulk-assign-driver`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                          installerName: installer,
                          driverName: driverVal || undefined,
                          serviceVehicle: vehicleVal || undefined,
                          scheduleDate: targetDate,
                          branchId: activeBranchId && activeBranchId !== 'ALL_BRANCHES' ? activeBranchId : undefined,
                        }),
                      })
                      if (res.ok) {
                        usedBulk = true
                        const data = await res.json().catch(() => ({}))
                        const count: number = data?.data?.updatedCount ?? targets.length
                        showToast(`Updated ${count} ticket${count !== 1 ? 's' : ''} for ${installer}`)
                      } else {
                        console.warn('[Schedules] bulk-assign failed, falling back to sequential PATCH', res.status)
                      }
                    } catch {
                      // fall through
                    }

                    if (!usedBulk) {
                      let failures = 0
                      for (const t of targets) {
                        if (String(t.id || '').startsWith('temp-') || String(t.id || '').startsWith('tmp-')) continue
                        const body: Record<string, unknown> = {
                          acDetails: mergeAcMeta(t, {
                            ...(driverVal ? { driverName: driverVal, driver_name: driverVal } : {}),
                            ...(vehicleVal ? { serviceVehicle: vehicleVal, service_vehicle: vehicleVal } : {}),
                          }),
                        }
                        if (driverVal) body.driverName = driverVal
                        if (vehicleVal) body.serviceVehicle = vehicleVal
                        try {
                          const res = await fetch(`${API_BASE_URL}/tickets/${t.id}`, {
                            method: 'PATCH',
                            headers,
                            body: JSON.stringify(body),
                          })
                          if (!res.ok) failures += 1
                        } catch {
                          failures += 1
                        }
                        await new Promise<void>(r => setTimeout(r, 40))
                      }
                      if (failures > 0) {
                        showToast(`Assigned ${installer} · ${failures} still syncing`)
                      } else {
                        showToast(`Updated ${targets.length} ticket${targets.length !== 1 ? 's' : ''} for ${installer}`)
                      }
                    }
                  } catch (err: unknown) {
                    console.error('[Schedules] bulk assign persist failed', err)
                    showToast(`Assigned in view · server sync lagged`)
                  } finally {
                    setBulkAssignSaving(false)
                  }
                })()
              }}
            >
              {/* Installer dropdown */}
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: textMuted }}>
                  Installer *
                </span>
                <select
                  id="bulk-assign-installer"
                  value={bulkAssignInstaller}
                  onChange={e => setBulkAssignInstaller(e.target.value)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  required
                >
                  <option value="">— Select installer —</option>
                  {[...new Set(
                    visible
                      .map(t => (t.installerName || '').split(/\s*[-–—]\s*|\s+\d+/)[0].trim())
                      .filter(Boolean)
                  )].sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>

              {/* Driver input */}
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: textMuted }}>
                  Driver
                </span>
                <input
                  id="bulk-assign-driver"
                  type="text"
                  list="bulk-assign-driver-list"
                  value={bulkAssignDriver}
                  onChange={e => setBulkAssignDriver(e.target.value)}
                  placeholder="e.g. IAN"
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
                <datalist id="bulk-assign-driver-list">
                  {driverOnlyNames.map(name => <option key={name} value={name} />)}
                  {[...new Set(
                    visible
                      .map(t => (t.driverName || t.driver_name || '').trim())
                      .filter(n => n && !driverOnlyNames.includes(n))
                  )].map(name => <option key={`t-${name}`} value={name} />)}
                </datalist>
              </label>

              {/* Vehicle input */}
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: textMuted }}>
                  Vehicle
                </span>
                <input
                  id="bulk-assign-vehicle"
                  type="text"
                  list="bulk-assign-vehicle-list"
                  value={bulkAssignVehicle}
                  onChange={e => setBulkAssignVehicle(e.target.value)}
                  placeholder="e.g. FB19 or T2"
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
                <datalist id="bulk-assign-vehicle-list">
                  {[...new Set(
                    visible
                      .map(t => (t.serviceVehicle || t.service_vehicle || '').trim())
                      .filter(Boolean)
                  )].sort().map(name => <option key={name} value={name} />)}
                </datalist>
              </label>
            </form>

            {/* Footer */}
            <div
              className="flex flex-col gap-2.5 px-5 py-4 border-t"
              style={{ borderColor: 'rgba(37,99,235,0.2)', backgroundColor: isLight ? '#eff6ff' : 'rgba(37,99,235,0.06)' }}
            >
              <button
                type="button"
                onClick={clearAllDriversAndVehiclesForDate}
                disabled={bulkAssignSaving || bulkClearSaving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                style={{
                  borderColor: isLight ? 'rgba(239,68,68,0.35)' : 'rgba(248,113,113,0.4)',
                  color: isLight ? '#DC2626' : '#F87171',
                  backgroundColor: isLight ? 'rgba(254,242,242,0.9)' : 'rgba(239,68,68,0.12)',
                }}
                title="Clear driver and vehicle on every row for this schedule date"
              >
                {bulkClearSaving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Clearing…</>
                ) : (
                  <><Trash2 className="w-3.5 h-3.5" /> Clear All Drivers &amp; Vehicles</>
                )}
              </button>
              <p className="text-[10px] font-semibold text-center" style={{ color: textMuted }}>
                Clears driver + vehicle on all rows for {dateFilter || todayDateKey()} (current branch)
              </p>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setBulkAssignOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border"
                  style={{ borderColor: inputBorder, color: textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="bulk-assign-form"
                  disabled={bulkAssignSaving || bulkClearSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 active:scale-95 shadow-lg disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #1d4ed8)', boxShadow: '0 3px 14px rgba(37,99,235,0.5)' }}
                >
                  {bulkAssignSaving ? (
                    <>⏳ Saving&hellip;</>
                  ) : (
                    <><Car className="w-4 h-4" /> Assign Drivers</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {!isMyTickets && (
        <SchedulesShowcase
          open={showcaseOpen}
          onClose={() => setShowcaseOpen(false)}
          branchLabel={activeBranchLabel}
          dateLabel={showcaseDateLabel}
          dateKey={dateFilter || ''}
          isTaguigServices={isTaguigServices}
          rows={showcaseRows}
          paymentByRowId={showcasePaymentByRowId}
          onBeforeExport={persistSchedulesSnapshot}
        />
      )}
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
    <label className={`edit-field flex flex-col gap-1.5 min-w-0 w-full max-w-full ${full ? 'md:col-span-2 col-span-1' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  )
}
