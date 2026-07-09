import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import ReactDOM from 'react-dom'
import {
  Plus, Search, Trash2, X, Edit3, AlertTriangle, CalendarDays,
  Eye, Upload, ChevronDown, Camera, Loader2, Pencil, Clock,
  ArrowUp, ArrowDown, ArrowUpDown, Copy, MapPin, Menu, Moon, Sun,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, fetchTicketsPage, formatFetchError, readApiError, parseCreatedTicketResponse, resolvePortalWriteBranchId, resolveTicketArchiveBranchId, resolveTicketScheduleBranchId, resolveScopedBranchId, branchScopesMatch, appendCurrentNegotiator, filterBranchNegotiators, isNegotiatorCandidate, isTaguigBranchRef, isTaguigServicesScope, isTaguigServiceTicket, parseGlobalBranchScope, isPortalAdmin, EMPLOYEES_DIRECTORY_UPDATED_EVENT, PROFILE_UPDATED_EVENT, type InstallerBranchIndexEntry, type BranchStaffOption } from '../utils/api'
import { readTabCache, readTabCacheEntry, readSchedulesTabCache, isTabCacheFresh, SCHEDULES_CACHE_TTL_MS, schedulesCacheKey, writeSchedulesTabCache, getInitialSchedulesFromCache, markSchedulesSessionLoaded, isSchedulesSessionLoaded, type SchedulesTabCache, clearRelaysCache, clearWarrantyCache, TAB_CACHE_UPDATED, syncTicketAcrossTabCaches } from '../utils/ticketTabCache'
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
import { formatBrandCapacityLabel, parseBrandFromAcDetails } from '../utils/warrantyTicketDisplay'

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



const STATUS_OPTS = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'INSTALLED', 'COMPLETED', 'CANCELLED', 'CONTINUATION']
const TABLE_ROW_HEIGHT = 38

/** Schedule install closed — DB uses INSTALLED; legacy rows may still be COMPLETED. */
function isInstalledWorkflowStatus(status?: string | null): boolean {
  const s = (status || '').toUpperCase()
  return s === 'INSTALLED' || s === 'COMPLETED'
}

type ScheduleOutcome = 'DONE_INSTALLED' | 'DONE_CLEANING' | 'DONE_SURVEY' | 'DONE_CHECKUP'
type ScheduleStatusGroup = 'pending' | 'closing'

const SCHEDULE_STATUS_OPTS: { value: string; label: string; group: ScheduleStatusGroup }[] = [
  // Pending first
  { value: 'SURVEY', label: 'SURVEY', group: 'pending' },
  { value: 'CLEANING', label: 'CLEANING', group: 'pending' },
  { value: 'INSTALLATION', label: 'INSTALLATION', group: 'pending' },
  { value: 'SERVICES', label: 'SERVICE', group: 'pending' },
  { value: 'RESCHED', label: 'RESCHED', group: 'pending' },
  { value: 'CONTINUATION', label: 'CONTINUATION', group: 'pending' },
  { value: 'FOR_APPROVAL', label: 'FOR APPROVAL', group: 'pending' },
  // Closing
  { value: 'DONE_INSTALLED', label: 'DONE INSTALL', group: 'closing' },
  { value: 'DONE_CLEANING', label: 'DONE CLEANING', group: 'closing' },
  { value: 'DONE_SURVEY', label: 'DONE SURVEY', group: 'closing' },
  { value: 'DONE_CHECKUP', label: 'DONE CHECKUP', group: 'closing' },
  { value: 'CANCELLED', label: 'CANCELLED', group: 'closing' },
]

const SCHEDULE_PENDING_OPTS = SCHEDULE_STATUS_OPTS.filter(o => o.group === 'pending')
const SCHEDULE_CLOSING_OPTS = SCHEDULE_STATUS_OPTS.filter(o => o.group === 'closing')
const CLOSING_SCHEDULE_STATUSES = new Set(['DONE_INSTALLED', 'DONE_CLEANING', 'DONE_SURVEY', 'DONE_CHECKUP'])
const SCHEDULE_PENDING_STATUS_VALUES = new Set(SCHEDULE_PENDING_OPTS.map(o => o.value))
const SCHEDULE_CLOSING_STATUS_VALUES = new Set(SCHEDULE_CLOSING_OPTS.map(o => o.value))

function statusShowsScheduleDetails(statusVal: string): boolean {
  return SCHEDULE_PENDING_STATUS_VALUES.has(statusVal) || SCHEDULE_CLOSING_STATUS_VALUES.has(statusVal)
}

function getScheduleTicketKind(ticket: Ticket): TicketCategoryValue {
  const kind = inferCategoryFromTicket(ticket)
  if (kind === 'SURVEY' || kind === 'SERVICES') return kind
  return 'INSTALLATION'
}

function getScheduleStatusBadgeStyle(value: string, isLight: boolean): { color: string; backgroundColor: string; borderColor: string } {
  const normalized = value.toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'INSTALLATION' || normalized === 'SCHEDULED' || normalized === 'S/I' || normalized === 'S_I' || normalized === 'SI') {
    return { color: isLight ? '#1d4ed8' : '#93c5fd', backgroundColor: isLight ? '#dbeafe' : 'rgba(59,130,246,0.18)', borderColor: isLight ? '#93c5fd' : 'rgba(59,130,246,0.35)' }
  }
  if (normalized === 'CLEANING') {
    return { color: isLight ? '#0369a1' : '#7dd3fc', backgroundColor: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.16)', borderColor: isLight ? '#7dd3fc' : 'rgba(14,165,233,0.35)' }
  }
  if (normalized === 'SURVEY') {
    return { color: isLight ? '#6d28d9' : '#c4b5fd', backgroundColor: isLight ? '#ede9fe' : 'rgba(139,92,246,0.18)', borderColor: isLight ? '#c4b5fd' : 'rgba(139,92,246,0.35)' }
  }
  if (normalized === 'DONE_SURVEY') {
    return { color: isLight ? '#5b21b6' : '#ddd6fe', backgroundColor: isLight ? '#f3e8ff' : 'rgba(139,92,246,0.28)', borderColor: isLight ? '#c4b5fd' : 'rgba(167,139,250,0.45)' }
  }
  if (normalized === 'RESCHED') {
    return { color: isLight ? '#a16207' : '#fbbf24', backgroundColor: isLight ? '#fef9c3' : 'rgba(251,191,36,0.14)', borderColor: isLight ? '#fcd34d' : 'rgba(251,191,36,0.35)' }
  }
  if (normalized === 'FOR_APPROVAL') {
    return { color: isLight ? '#047857' : '#6ee7b7', backgroundColor: isLight ? '#d1fae5' : 'rgba(16,185,129,0.15)', borderColor: isLight ? '#6ee7b7' : 'rgba(16,185,129,0.3)' }
  }
  if (normalized === 'DONE_INSTALLED' || normalized === 'INSTALLED' || normalized === 'COMPLETED') {
    return { color: isLight ? '#15803d' : '#86efac', backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.18)', borderColor: isLight ? '#86efac' : 'rgba(22,163,74,0.35)' }
  }
  if (normalized === 'DONE_CHECKUP') {
    return { color: isLight ? '#1d4ed8' : '#93c5fd', backgroundColor: isLight ? '#dbeafe' : 'rgba(59,130,246,0.18)', borderColor: isLight ? '#93c5fd' : 'rgba(59,130,246,0.35)' }
  }
  if (normalized === 'DONE_CLEANING') {
    return { color: isLight ? '#0369a1' : '#7dd3fc', backgroundColor: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.22)', borderColor: isLight ? '#38bdf8' : 'rgba(14,165,233,0.4)' }
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
  if (explicit === 'DONE_CLEANING' || explicit === 'DONE_INSTALLED' || explicit === 'DONE_SURVEY' || explicit === 'DONE_CHECKUP') {
    return explicit
  }
  const remarks = ticketRemarksText(ticket as Ticket).toLowerCase()
  const stat = String(ticket.status || '').toUpperCase()
  if (isInstalledWorkflowStatus(stat)) {
    if (/clean/i.test(remarks)) return 'DONE_CLEANING'
    if (/checkup|check-up/i.test(remarks)) return 'DONE_CHECKUP'
    if (/survey/i.test(remarks)) return 'DONE_SURVEY'
    if (isInstalledRemarks(remarks)) return 'DONE_INSTALLED'
  }
  if (stat === 'SURVEY' && /done.*survey|survey.*done|surveyed/i.test(remarks)) return 'DONE_SURVEY'
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

  let stat = (ticket.status || 'SCHEDULED').toUpperCase().replace(/\s+/g, '_')
  if (stat === 'S/I' || stat === 'S_I' || stat === 'SI' || stat === 'INSTALLATION') return 'INSTALLATION'
  if (stat === 'FOR_QUOTATION') stat = 'FOR_APPROVAL'
  if (stat === 'RESCHED') return 'RESCHED'
  if (stat === 'SURVEY') return 'SURVEY'
  if (stat === 'FOR_APPROVAL') return 'FOR_APPROVAL'
  if (stat === 'CANCELLED') return 'CANCELLED'
  if (stat === 'INSTALLED' || stat === 'COMPLETED') return 'DONE_INSTALLED'

  const kind = getScheduleTicketKind(ticket)
  if (kind === 'SURVEY') return 'SURVEY'
  if (kind === 'SERVICES') return 'SERVICES'
  return 'INSTALLATION'
}

function getScheduleStatusLabel(value: string): string {
  const normalized = value.toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'INSTALLED') return 'INSTALLED'
  if (normalized === 'S/I' || normalized === 'S_I' || normalized === 'SI') return 'INSTALLATION'
  const found = SCHEDULE_STATUS_OPTS.find(opt => opt.value === normalized)
  return (found?.label ?? value.replace(/_/g, ' ')).toUpperCase()
}

/** Rank overview search hits — exact / prefix name matches float to the top. */
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

/** Overview search cards: one badge — workflow status (SCHEDULED) beats duplicate INSTALLATION phase. */
function getOverviewStatusBadge(ticket: Ticket): { value: string; label: string } {
  const workflow = (ticket.status || '').toUpperCase().replace(/\s+/g, '_')
  if (workflow === 'ASSIGNED' && hasFinalScheduleDate(ticket)) {
    return { value: 'SCHEDULED', label: getScheduleStatusLabel('SCHEDULED') }
  }
  const workflowStatuses = new Set([
    'SCHEDULED', 'ASSIGNED', 'RESCHED', 'PENDING', 'IN_PROGRESS', 'ON_THE_WAY',
    'FOR_APPROVAL', 'FOR_QUOTATION', 'CANCELLED', 'COMPLETED', 'INSTALLED',
  ])
  if (workflowStatuses.has(workflow)) {
    const norm = workflow === 'FOR_QUOTATION' ? 'FOR_APPROVAL' : workflow
    return { value: norm, label: getScheduleStatusLabel(norm) }
  }
  const phase = getScheduleStatusValue(ticket)
  return { value: phase, label: getScheduleStatusLabel(phase) }
}

/** True when ticket still carries reschedule ghost metadata (old date row / Moved to…). */
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

  acUpdates.previousScheduleDates = []
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
  } else if (val === 'DONE_INSTALLED') {
    body.status = 'INSTALLED'
    body.scheduleOutcome = 'DONE_INSTALLED'
    acUpdates.scheduleOutcome = 'DONE_INSTALLED'
    acUpdates.schedulePhase = ''
  } else if (val === 'DONE_SURVEY') {
    setClosing('DONE_SURVEY')
  } else if (val === 'FOR_QUOTATION') {
    body.status = 'FOR_APPROVAL'
    acUpdates.scheduleOutcome = ''
  } else if (val === 'CLEANING') {
    body.status = 'SCHEDULED'
    body.ticketCategory = 'SERVICES'
    body.serviceType = categoryDefaultServiceType('SERVICES')
    acUpdates.scheduleOutcome = ''
    acUpdates.schedulePhase = 'CLEANING'
  } else if (val === 'INSTALLATION' || val === 'S/I' || val === 'S_I' || val === 'SI') {
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
  } else if (val === 'CANCELLED') {
    body.status = 'CANCELLED'
    acUpdates.scheduleOutcome = ''
  } else if (SCHEDULE_STATUS_OPTS.some(opt => opt.value === val)) {
    body.status = val
    acUpdates.scheduleOutcome = ''
  }

  // Leaving RESCHED → active status: drop ghost on old date and "Moved to…" remarks
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
  return merged
}

function resolveTicketScheduleDateKey(ticket: Ticket): string {
  return getFinalDateKey(ticket) || getPreferredDateKey(ticket) || ''
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
  ghostKind: 'completed' | 'resched' | null,
  isLight: boolean,
  idx: number,
  rowEven: string,
  rowOdd: string,
  isDuplicateName: boolean,
): { baseBg: string; accent?: string } {
  const outcome = getScheduleOutcome(ticket)

  if (ghostKind === 'completed') {
    if (outcome === 'DONE_CLEANING') {
      return {
        baseBg: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.2)',
        accent: '#0EA5E9',
      }
    }
    if (outcome === 'DONE_SURVEY') {
      return {
        baseBg: isLight ? '#f3e8ff' : 'rgba(139,92,246,0.22)',
        accent: '#8B5CF6',
      }
    }
    if (outcome === 'DONE_CHECKUP') {
      return {
        baseBg: isLight ? '#dbeafe' : 'rgba(59,130,246,0.22)',
        accent: '#3B82F6',
      }
    }
    return {
      baseBg: isLight ? '#dcfce7' : 'rgba(22,163,74,0.2)',
      accent: '#16A34A',
    }
  }

  if (ghostKind === 'resched') {
    return {
      baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.14)',
      accent: '#fbbf24',
    }
  }

  if (outcome === 'DONE_INSTALLED') {
    return {
      baseBg: isLight ? '#dcfce7' : 'rgba(22,163,74,0.2)',
      accent: '#16A34A',
    }
  }

  if (outcome === 'DONE_SURVEY') {
    return {
      baseBg: isLight ? '#f3e8ff' : 'rgba(139,92,246,0.18)',
      accent: '#8B5CF6',
    }
  }

  if (outcome === 'DONE_CLEANING') {
    return {
      baseBg: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.16)',
      accent: '#0EA5E9',
    }
  }

  if (outcome === 'DONE_CHECKUP') {
    return {
      baseBg: isLight ? '#eff6ff' : 'rgba(59,130,246,0.14)',
      accent: '#3B82F6',
    }
  }

  const statusVal = getScheduleStatusValue(ticket)
  if (statusVal === 'RESCHED') {
    return {
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.1)',
      accent: '#fbbf24',
    }
  }
  if (statusVal === 'SURVEY') {
    return {
      baseBg: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.1)',
      accent: '#8B5CF6',
    }
  }
  if (statusVal === 'CLEANING') {
    return {
      baseBg: isLight ? '#f0f9ff' : 'rgba(14,165,233,0.1)',
      accent: '#0EA5E9',
    }
  }
  if (statusVal === 'INSTALLATION' || statusVal === 'SERVICES') {
    return {
      baseBg: isLight ? '#eff6ff' : 'rgba(59,130,246,0.08)',
      accent: '#3B82F6',
    }
  }
  if (statusVal === 'FOR_APPROVAL') {
    return {
      baseBg: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.08)',
      accent: '#10B981',
    }
  }

  if (isDuplicateName) {
    return { baseBg: isLight ? '#fef9c3' : '#3d3418' }
  }

  return { baseBg: idx % 2 === 0 ? rowEven : rowOdd }
}

function shouldArchiveCompletedSchedule(ticket: Ticket, body: Record<string, unknown>): boolean {
  const outcome = getScheduleOutcome({
    ...ticket,
    ...body,
    acDetails: typeof body.acDetails === 'string' ? body.acDetails : ticket.acDetails,
  } as Ticket)
  if (outcome === 'DONE_CLEANING' || outcome === 'DONE_SURVEY' || outcome === 'DONE_CHECKUP') return false
  if (outcome === 'DONE_INSTALLED') return true
  return qualifiesForInstallComplete(ticket, body as Partial<Ticket>)
}

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

function isGenericUnitTypeLabel(value?: string | null): boolean {
  const normalized = (value || '').trim().toLowerCase()
  return !normalized
    || normalized === 'split ac'
    || normalized === 'split'
    || normalized === 'ac'
    || normalized === 'window ac'
    || normalized === 'window'
}

/** Brand / HP for schedules — prefer acDetails brand+capacity over generic unitType like "Split AC". */
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
  return trimmed.replace(/\s*·\s*Archived(?:\s*·\s*.+)?$/i, '').trim()
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

/** Relay-board stage — mirrors ClientMasterlist getRelayStatusLabel. */
function getRelayQueueLabel(ticket: Ticket): string {
  const status = (ticket.status || '').toUpperCase()
  if (status === 'CANCELLED') return 'CANCELLED'
  const outcome = getScheduleOutcome(ticket)
  if (outcome === 'DONE_CHECKUP') return 'DONE CHECKUP'
  if (outcome === 'DONE_CLEANING') return 'DONE CLEANING'
  if (outcome === 'DONE_SURVEY') return 'DONE SURVEY'
  if (outcome === 'DONE_INSTALLED') return 'DONE INSTALL'
  if (isInstalledWorkflowStatus(status)) return 'INSTALLED'

  if (hasFinalScheduleDate(ticket)) return 'Scheduled'
  if (['SCHEDULED', 'RESCHED', 'IN_PROGRESS', 'ON_THE_WAY', 'FOR_APPROVAL', 'SURVEY'].includes(status)) {
    return 'Scheduled'
  }

  if (status === 'ASSIGNED' || ticket.branchId || ticket.branch_id || ticket.assignedTo) return 'Assigned'
  return 'Pending'
}

/** Tickets entered on Schedules (manual / import) must not appear on My Tickets. */
function isScheduleTabIntakeTicket(ticket: Ticket): boolean {
  const stat = (ticket.status || '').toUpperCase()
  if (stat === 'SCHEDULED' || stat === 'RESCHED') return true
  if (hasFinalScheduleDate(ticket)) return true
  const meta = parseAcMeta(ticket)
  if (!Array.isArray(meta) && meta && typeof meta === 'object') {
    const scheduledDate = String((meta as { scheduledDate?: string }).scheduledDate || '').trim()
    if (scheduledDate) return true
    const intake = (meta as { scheduleIntake?: boolean | string }).scheduleIntake
    if (intake === true || intake === 'true') return true
  }
  return false
}

function shouldShowOnMyTickets(ticket: Ticket): boolean {
  const stat = (ticket.status || '').toUpperCase()
  if (isInstalledWorkflowStatus(stat) || stat === 'CANCELLED') return false
  if (isScheduleTabIntakeTicket(ticket)) return false
  if (hasFinalScheduleDate(ticket)) return false

  const label = getRelayQueueLabel(ticket)
  if (label === 'Installed' || label === 'Scheduled' || label === 'Cancelled') return false
  if (label !== 'Assigned') return false

  return Boolean(
    ticket.assignedTo
    || ticket.negotiatorId
    || ticket.negotiator_id
    || stat === 'ASSIGNED',
  )
}

function resolveTicketDistrict(ticket: Ticket): string {
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

function getContinuationDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.continuationDates
  if (!Array.isArray(raw)) return []
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
}

function isReschedulePending(ticket: Ticket): boolean {
  const meta = parseAcMeta(ticket)
  return meta.reschedulePending === true || String(meta.reschedulePending).toLowerCase() === 'true'
}

function getScheduleStatusDisplay(ticket: Ticket): string {
  const val = getScheduleStatusValue(ticket)
  if (val === 'RESCHED') {
    return 'RESCHED'
  }
  return getScheduleStatusLabel(val)
}

function getScheduleUpdateDisplay(ticket: Ticket): string {
  const base = stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim())
  if (getScheduleStatusValue(ticket) === 'RESCHED' && isReschedulePending(ticket)) {
    return base || 'PENDING'
  }
  return dedupeMovedToRemark(base)
}

/** Collapse "Moved to X · Moved to X" from legacy ghost-row display or double saves. */
function dedupeMovedToRemark(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const dup = trimmed.match(/^(Moved to .+?)\s*·\s*\1$/i)
  if (dup) return dup[1].trim()
  return trimmed
}

function isMovedToRescheduleRemark(text: string): boolean {
  return /^Moved to /i.test(text.trim())
}

function buildReschedulePatchBody(
  ticket: Ticket,
  options: { newDateKey?: string | null; pending: boolean },
): Record<string, unknown> {
  const oldDateKey = getPreferredDateKey(ticket)
  const body: Record<string, unknown> = { status: 'RESCHED' }
  const acUpdates: Record<string, unknown> = { scheduleOutcome: '' }

  if (options.pending) {
    acUpdates.reschedulePending = true
    acUpdates.rescheduledTo = ''
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
    acUpdates.rescheduledTo = newDateKey
    acUpdates.finalDate = ''
    body.preferredDate = newDateKey
    body.status = 'RESCHED'
    if (oldDateKey && oldDateKey !== newDateKey) {
      const existing = parseAcMeta(ticket)
      const prevDates: string[] = Array.isArray(existing.previousScheduleDates)
        ? [...existing.previousScheduleDates]
        : []
      if (!prevDates.includes(oldDateKey)) prevDates.push(oldDateKey)
      acUpdates.previousScheduleDates = prevDates
      
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

function ticketMatchesDateKey(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return true
  const isResched = (ticket.status || '').toUpperCase() === 'RESCHED'
  const finalDate = !isResched ? getFinalDateKey(ticket) : ''
  const dateStr = finalDate || ticket.preferredDate || ticket.preferred_date || ticket.createdAt || ticket.created_at
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
  if (!isInstalledWorkflowStatus(ticket.status)) return false
  const sched = getArchivedScheduleDate(ticket)
  if (sched === dateKey) return true
  if (getPreviousScheduleDates(ticket).includes(dateKey)) return true
  return ticketMatchesDateKey(ticket, dateKey)
}

function isRescheduledGhostOnDate(ticket: Ticket, dateKey: string): boolean {
  if (!dateKey) return false
  if (isInstalledWorkflowStatus(ticket.status)) return false
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
  return isRescheduledGhostOnDate(ticket, dateKey) || isCompletedGhostOnDate(ticket, dateKey)
}

function formatGhostRemarks(
  ticket: Ticket,
  ghostKind: 'completed' | 'resched' | null,
  dateKey?: string,
): string {
  const base = stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim())
  if (ghostKind === 'completed' || (dateKey && isCompletedGhostOnDate(ticket, dateKey))) {
    return base
  }
  if (ghostKind === 'resched') {
    const movedTo = formatDateKeyLabel(getPreferredDateKey(ticket))
    const suffix = movedTo ? `Moved to ${movedTo}` : 'Rescheduled'
    if (!base) return suffix
    const normalizedBase = dedupeMovedToRemark(base)
    if (normalizedBase === suffix || isMovedToRescheduleRemark(normalizedBase)) return normalizedBase
    return `${normalizedBase} · ${suffix}`
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

function formatPaymentAmount(ticket: Ticket): string {
  const amt = ticket.installationCharges ?? ticket.installation_charges ?? ticket.amountCharged
  if (amt == null || Number.isNaN(Number(amt))) return ''
  return Number(amt).toLocaleString('en-PH')
}

function formatCombinedPayment(ticket: Ticket): string {
  const mode = getPaymentMode(ticket).trim().toUpperCase()
  const amt = ticket.installationCharges ?? ticket.installation_charges ?? ticket.amountCharged
  if (mode === 'FREE' || mode === 'FREE INSTALL') return 'FREE'
  const amountStr = formatPaymentAmount(ticket)
  if (mode && amountStr) return `${mode} ${amountStr}`
  if (mode) return mode
  if (amountStr && Number(amt) > 0) return amountStr
  return ''
}

function getPaymentMode(ticket: Ticket): string {
  return getF(ticket, 'modeOfPayment', 'mode_of_payment')
}

function ticketHasPaymentInfo(ticket: Partial<Ticket>): boolean {
  const mode = (ticket.modeOfPayment ?? ticket.mode_of_payment ?? '').trim()
  const charges = ticket.installationCharges ?? ticket.installation_charges
  return Boolean(mode || (charges != null && !Number.isNaN(Number(charges)) && Number(charges) > 0))
}

function getEmptyRequiredColumnsForClose(
  ticketOrForm: Partial<Ticket> & { serviceDriver?: string; ticketCategory?: any },
  employees: any[],
  branchId: string | null
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
  const dealer = (ticketOrForm.sourceVendor || (ticketOrForm as any).source_vendor || (ticketOrForm as any).dealerName || (ticketOrForm as any).dealer_name || (ticketOrForm as any).dealer || '').trim()
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

  // 8. Installer
  const installer = (
    ticketOrForm.id
      ? getInstallerDisplay(ticketOrForm as Ticket, employees, branchId)
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

function formatDisplayDate(key?: string | null, fallback = '—'): string {
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

/** Match import row to ticket — same customer + phone may have multiple units (different brand). */
function importRowMatchesTicket(row: ImportUnmatchedRow, ticket: Ticket): boolean {
  const status = (ticket.status || '').toUpperCase()
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'INSTALLED') return false

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

/** True when a name belongs to this ticket's negotiator or any branch negotiator (e.g. Jane Martos on Sales). */
function isNegotiatorInstallerName(
  ticket: Ticket,
  installer: string,
  employees?: BranchStaffOption[],
  branchId?: string | null,
): boolean {
  const val = installer.trim()
  if (!val) return false

  const meta = parseAcMeta(ticket)
  const ticketNegotiatorNames = [
    resolveNegotiatorDisplayName(ticket, employees),
    String(meta.negotiatorName || meta.negotiator || '').trim(),
  ].filter(Boolean)

  for (const candidate of ticketNegotiatorNames) {
    if (namesMatchLoosely(val, candidate)) return true
  }

  const shortNeg = getTicketNegotiatorName(ticket, employees)
  if (shortNeg && namesMatchLoosely(val, shortNeg)) return true

  if (employees?.length) {
    const negotiators = filterBranchNegotiators(employees, branchId)
    for (const n of negotiators) {
      if (n.name?.trim() && namesMatchLoosely(val, n.name)) return true
    }
  }

  return false
}

function resolveInstallerFieldRaw(ticket: Ticket): string {
  const direct = (ticket.installerName || (ticket as any).installer_name || '').trim()
  const meta = parseAcMeta(ticket)
  const fromMeta = String(meta.installerName || meta.installer || meta.technicianName || '').trim()
  return direct || fromMeta
}

/** Explicit installer/technician field only — never negotiator or assigned sales staff. */
function getInstallerDisplay(
  ticket: Ticket,
  employees?: BranchStaffOption[],
  branchId?: string | null,
): string {
  const installer = resolveInstallerFieldRaw(ticket)
  if (installer && !isNegotiatorInstallerName(ticket, installer, employees, branchId)) return installer
  return ''
}

/** Sort key — may fall back to assigned field tech when installer column is empty. */
function getInstallerSortKey(
  ticket: Ticket,
  employees?: BranchStaffOption[],
  branchId?: string | null,
): string {
  const fromField = getInstallerDisplay(ticket, employees, branchId)
  if (fromField) return fromField
  if (isTicketAssigneeNegotiator(ticket, employees)) return ''
  const assigned = (ticket.assignedEmployeeName || ticket.assigned_employee_name || '').trim()
  if (assigned && !isNegotiatorInstallerName(ticket, assigned, employees, branchId)) return assigned
  return ''
}

function resolveInstallerFieldForCarry(
  ticket: Ticket,
  employees?: BranchStaffOption[],
  branchId?: string | null,
): string {
  const raw = resolveInstallerFieldRaw(ticket)
  if (raw && !isNegotiatorInstallerName(ticket, raw, employees, branchId)) return raw
  return ''
}


function formatRelayTicketTypeShort(ticket: Ticket): string {
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

function normalizeTicketNumberKey(ticketNumber?: string | null): string {
  return (ticketNumber || '').trim().toUpperCase()
}

function isTicketNotFoundError(err: unknown): boolean {
  return /ticket not found/i.test(formatFetchError(err))
}

async function lookupTicketByNumberOnServer(
  authToken: string,
  ticketNumber: string,
): Promise<Ticket | null> {
  const tn = ticketNumber.trim()
  if (!tn || !authToken) return null
  const upper = normalizeTicketNumberKey(tn)
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
      if (exact?.id) return exact
      if (list.length === 1 && list[0]?.id) return list[0]
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

/** Tokens that belong in serviceType / schedule status — not driver names. */
function isDriverPlaceholderToken(raw: string): boolean {
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
    'DONE_INSTALLED', 'DONE_SURVEY', 'DONE_CLEANING', 'DONE_CHECKUP',
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
    getF(ticket, 'serviceVehicle', 'service_vehicle'),
    String(meta.driverName || meta.driver || meta.serviceVehicle || meta.driver_name || ''),
  ]
  for (const c of candidates) {
    const trimmed = c.trim()
    if (trimmed && !isDriverPlaceholderToken(trimmed)) return trimmed
  }
  return ''
}

function formatServiceDriver(ticket: Ticket): string {
  return getTicketDriverName(ticket)
}

/** Parse "ALLAN - 3" / "MANNY / ROMAR - 2" / "MANNY / ROMAR" into crew name + site for grouping. */
function parseNameSiteToken(raw: string): { name: string; site: number; label: string } {
  const v = (raw || '').trim()
  if (!v || v === '—') return { name: '', site: Number.MAX_SAFE_INTEGER, label: '' }
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

function ticketColumnText(
  ticket: Ticket,
  colLabel: string,
  options?: { myTickets?: boolean; employees?: BranchStaffOption[]; branchId?: string | null },
): string {
  const myTickets = options?.myTickets ?? false
  const employees = options?.employees
  const branchId = options?.branchId
  switch (colLabel) {
    case 'TICKET NO': return getTicketNumberDisplay(ticket)
    case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title || ''
    case 'DESTINATION': return formatAddress(ticket.location)
    case 'BRAND': return parseBrand(ticket)
    case 'DLR': return getF(ticket, 'sourceVendor', 'source_vendor', 'dealer') || ''
    case 'STATUS': return ticket.status || ''
    case 'COMMIT': return getF(ticket, 'commitType', 'commitTerms', 'description')
    case 'FINAL DATE': return getFinalDateKey(ticket)
    case 'INSTALLER': return getInstallerSortKey(ticket, employees, branchId)
    case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, employees)
    case 'SERVICE': return myTickets ? formatRelayTicketTypeShort(ticket) : formatServiceDriver(ticket)
    case 'UPDATE': return getScheduleUpdateDisplay(ticket)
    default: return ''
  }
}

function compareTicketsByColumn(
  a: Ticket,
  b: Ticket,
  colLabel: string,
  options?: { myTickets?: boolean; employees?: BranchStaffOption[]; branchId?: string | null },
): number {
  const av = ticketColumnText(a, colLabel, options)
  const bv = ticketColumnText(b, colLabel, options)
  if (colLabel === 'INSTALLER' || colLabel === 'SERVICE') {
    return compareNameSiteStrings(av, bv)
  }
  return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
}

function getTicketNegotiatorName(ticket: Ticket, employees?: { id: string; name: string }[]): string {
  const fullname = resolveNegotiatorDisplayName(ticket, employees)
  if (!fullname) return ''
  let cleanName = fullname.trim()
  cleanName = cleanName.replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '')
  const firstName = cleanName.split(/\s+/)[0]
  return firstName.toUpperCase()
}

const INLINE_EDIT_COLUMNS = new Set([
  'INSTALLER', 'NEGOTIATOR', 'COMMIT', 'BRAND', 'DLR', "CUSTOMER'S NAME",
  'FINAL DATE', 'SERVICE', 'UPDATE', 'DESTINATION', 'NOTE',
])
const DEFAULT_MY_TICKETS_SORT = { column: 'NEGOTIATOR', direction: 'asc' as const }
const DEFAULT_SCHEDULE_SORT = { column: 'INSTALLER', direction: 'asc' as const }

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

function formatDateTriggerLabel(value: string) {
  return value ? formatDateKeyLabel(value) : 'Select date'
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
    sourceVendor: item.dlr || 'Direct',
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
  set('sourceVendor', updatedFields.sourceVendor)
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
    sourceVendor?: string
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
    dealer: fields.sourceVendor ?? getF(ticket, 'sourceVendor', 'source_vendor', 'dealer') ?? '',
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
    case 'DLR': return getF(ticket, 'sourceVendor', 'source_vendor', 'dealer') || ''
    case 'STATUS': return getScheduleStatusValue(ticket)
    case 'COMMIT': return getF(ticket, 'commitType', 'commitTerms', 'description')
    case 'FINAL DATE': return getFinalDateKey(ticket)
    case 'INSTALLER': return getInstallerDisplay(ticket, employees, branchId)
    case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, employees)
    case 'SERVICE': return myTickets ? formatRelayTicketTypeShort(ticket) : formatServiceDriver(ticket)
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
    case 'SERVICE': {
      const category = inferCategoryFromTicket(ticket)
      const driver = normalizeDriverInput(v)
      const { serviceType } = parseServiceDriverValue('', category)
      body.serviceType = serviceType
      body.serviceVehicle = driver
      body.acDetails = mergeAcMeta(acBase, {
        driverName: driver,
        serviceVehicle: driver,
        driver_name: driver,
      })
      break
    }
    case 'UPDATE': {
      const remark = stripArchivedRemarkSuffix(v)
      body.remarks = remark || undefined
      body.remarksUpdate = remark || undefined
      if (isInstalledRemarks(remark)) {
        body.acDetails = mergeAcMeta(acBase, {
          update: remark,
          remarksUpdate: remark,
          scheduleOutcome: 'DONE_INSTALLED',
        })
      } else {
        body.acDetails = mergeAcMeta(acBase, { update: remark, remarksUpdate: remark })
      }
      break
    }
    case 'FINAL DATE': {
      const dateKey = v.split('T')[0].split(' ')[0].trim()
      if (!dateKey) break
      body.finalDate = dateKey
      body.preferredDate = dateKey
      body.acDetails = mergeAcMeta(acBase, { finalDate: dateKey })
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

export default function Tickets() {
  const { theme, toggleTheme } = useTheme()
  const { user }  = useAuth()
  const location = useLocation()
  const { setSidebarOpen } = useOutletContext<{ setSidebarOpen: (v: boolean) => void }>() || {}
  const isMyTickets = location.pathname === '/my-tickets'
  const isLight    = theme === 'light'

  const [activeTab, setActiveTab] = useState<'schedules' | 'overview'>(
    () => location.pathname === '/tickets' ? 'overview' : 'schedules'
  )

  useEffect(() => {
    const handleTabCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent
      const updatedTicket = customEvent.detail?.ticket
      if (!updatedTicket?.id) return
      
      setTickets(prev => {
        if (!prev.some(t => t.id === updatedTicket.id)) return prev
        return prev.map(t => (t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t))
      })
    }
    window.addEventListener(TAB_CACHE_UPDATED, handleTabCacheUpdate)
    return () => window.removeEventListener(TAB_CACHE_UPDATED, handleTabCacheUpdate)
  }, [])

  useEffect(() => {
    if (location.pathname === '/tickets') {
      setActiveTab('overview')
    } else if (location.pathname === '/schedules') {
      setActiveTab('schedules')
    }
  }, [location.pathname])

  const [overviewSearchInput, setOverviewSearchInput] = useState('')
  const [overviewSearchFocused, setOverviewSearchFocused] = useState(false)
  const [overviewResults, setOverviewResults] = useState<Ticket[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)

  const fetchOverviewTickets = useCallback(async (query: string) => {
    if (!query.trim()) {
      setOverviewResults([])
      return
    }
    setOverviewLoading(true)
    try {
      const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${tokenStr}` }
      const url = `${API_BASE_URL}/tickets/search?q=${encodeURIComponent(query)}&size=100`
      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        const list = data?.data?.tickets || data?.tickets || []
        setOverviewResults(sortOverviewSearchResults(list, query))
      } else {
        console.error('Failed to search tickets:', res.statusText)
      }
    } catch (err) {
      console.error('Error searching tickets:', err)
    } finally {
      setOverviewLoading(false)
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

  const role      = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'
  const isAdmin    = isPortalAdmin(role)
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

  const activeBranchId = globalBranchId || user?.branchId || ''
  const isTaguig = isTaguigBranchRef(activeBranchId)
  const isTaguigServices = isTaguigServicesScope(activeBranchId, user?.email)

  // ── Color tokens ──────────────────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#cbd5e1' : '#334155'
  const tableBorder = isLight ? '#e2e8f0' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg     = isLight ? '#e8edf3' : '#060C18'
  const myTicketsTheadBg = isLight ? '#DEF2E6' : '#0B2C30'
  const myTicketsTheadText = isLight ? '#14532D' : '#6EE7B7'
  const myTicketsTheadBorder = isLight ? 'rgba(22,163,74,0.42)' : 'rgba(74,222,128,0.35)'
  const schedTheadBg     = isLight ? '#E3F4E9' : '#0B272D'
  const schedTheadText   = isLight ? '#166534' : '#86EFAC'
  const schedTheadBorder = isLight ? 'rgba(22,163,74,0.38)' : 'rgba(74,222,128,0.28)'
  const rowEven     = isLight ? '#ffffff' : '#0A1120'
  const rowOdd      = isLight ? '#f7fbf8' : '#0b1620'
  const rowHover    = isLight ? '#edf7f1' : '#0e242d'
  const green       = '#16A34A'

  // ── Data state ────────────────────────────────────────────────────────────
  const initialSchedulesRef = useRef<ReturnType<typeof getInitialSchedulesFromCache> | null>(null)
  if (!initialSchedulesRef.current) {
    const pathname = window.location.pathname
    const dateKey = resolveInitialScheduleDate(pathname)
    initialSchedulesRef.current = getInitialSchedulesFromCache(pathname, dateKey || undefined)
  }
  const initialSchedules = initialSchedulesRef.current
  const initialSchedulesReady = initialSchedules.hasCache || initialSchedules.sessionLoaded

  const fetchSeqRef = useRef(0)
  const hasLoadedOnceRef = useRef(initialSchedulesReady)

  const [tickets, setTickets] = useState<Ticket[]>(() =>
    initialSchedules.hasCache
      ? normalizeRelayScheduleTicketList(initialSchedules.tickets as Ticket[])
      : [],
  )
  const [loading, setLoading] = useState(() => !initialSchedulesReady)
  const [syncing, setSyncing] = useState(() => !initialSchedulesReady || initialSchedules.hasCache)
  const [hasHydratedOnce, setHasHydratedOnce] = useState(() => initialSchedulesReady)
  const [progress, setProgress]       = useState(0)

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
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' }>(
    () => defaultSortForSchedulesView(location.pathname === '/my-tickets'),
  )

  useEffect(() => {
    setSortConfig(defaultSortForSchedulesView(isMyTickets))
  }, [isMyTickets])
  const [dateFilter, setDateFilter]   = useState(() => resolveInitialScheduleDate(location.pathname))
  const dateFilterInputRef = useRef<HTMLInputElement>(null)
  const [hoveredRow, setHoveredRow]   = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ ticketId: string; colLabel: string } | null>(null)
  const [expandedCell, setExpandedCell] = useState<{ ticketId: string; colLabel: string } | null>(null)
  const [expandedPopoverPos, setExpandedPopoverPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const pendingSavesRef = useRef(new Map<string, PendingTicketSave>())
  const activeSavesRef = useRef(new Set<string>())
  /** Local optimistic tickets that must survive in-flight list refreshes until PATCH/POST settles. */
  const optimisticTicketsRef = useRef(new Map<string, Ticket>())
  /** Ticket ids removed in UI while DELETE runs (or until server list confirms absence). */
  const deletedTicketsRef = useRef(new Set<string>())
  /** Latest flushTicketSave — used by create/import paths defined earlier in the component. */
  const flushTicketSaveRef = useRef<(ticketId: string) => void>(() => {})

  const schedulesCacheKeyForTab = useCallback(
    (dateOverride?: string) => schedulesCacheKey(
      user,
      globalBranchId,
      isCustomer,
      isAdmin,
      isMyTickets,
      isMyTickets ? undefined : (dateOverride ?? dateFilter),
    ),
    [user, globalBranchId, isCustomer, isAdmin, isMyTickets, dateFilter],
  )

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

    setTickets(normalizeRelayScheduleTicketList(list))
    setLoading(false)
    setHasHydratedOnce(true)
    hasLoadedOnceRef.current = true
    const cacheKey = schedulesCacheKeyForTab()
    markSchedulesSessionLoaded(cacheKey)
    writeSchedulesTabCache(cacheKey, normalizeRelayScheduleTicketList(list), 'local')
    return true
  }, [schedulesCacheKeyForTab])

  // Paint cached rows before first paint when switching branch/date — no loading screen flash.
  useLayoutEffect(() => {
    if (isMyTickets) return
    hydrateFromTabCache()
  }, [isMyTickets, hydrateFromTabCache, dateFilter, globalBranchId, user])

  // ── Weekly Tabs Calculation ───────────────────────────────────────────────
  const weeklyTabs = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - (6 - i))
      const key = formatDateToKey(d)
      const isToday = i === 6
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
    setSyncing(true)
    resetTicketTableScroll()
  }, [])

  useLayoutEffect(() => {
    resetTicketTableScroll()
  }, [dateFilter])

  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState<string | null>(null)
  const [paymentPrompt, setPaymentPrompt] = useState<{ ticket: Ticket; nextStatus: string } | null>(null)
  const [promptAmount, setPromptAmount] = useState<string>('')
  const [promptMode, setPromptMode] = useState<string>('CASH')

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
      setDateFilter(todayDateKey())
    }
  }, [isMyTickets, isTaguig])

  // ── Context menu ──────────────────────────────────────────────────────────
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

  // ── History state ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

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
    if (!resolved && !branchId) return '—'
    const id = (resolved?.id || branchId || '').toUpperCase()
    const name = resolved?.name || ''
    if (id === 'BR-TAGUIG-SALES' || id.endsWith('-SALES')) return 'TAGUIG - SALES'
    if (id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || id.endsWith('-SERVICES') || id.endsWith('-SERVICE')) {
      return 'TAGUIG - SERVICES'
    }
    return name || getBranchDisplayName(branchId || null)
  }, [resolveBranch])
  // ── Manual Edit Modal State ──────────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Ticket> & { serviceDriver?: string; rescheduleToDate?: string; reschedulePending?: boolean; ticketCategory?: TicketCategoryValue; finalDate?: string; branchId?: string }>({})
  const [editFormSnapshot, setEditFormSnapshot] = useState('')
  const [editOriginalDate, setEditOriginalDate] = useState('')
  const [editInitialStatus, setEditInitialStatus] = useState('')

  useEffect(() => {
    if (!editModalOpen || branches.length > 0) return
    const authToken = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    if (!authToken) return
    fetchCachedBranches(authToken)
      .then((list) => setBranches(Array.isArray(list) ? list as { id: string; name: string }[] : []))
      .catch(() => {})
  }, [editModalOpen, branches.length])

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
    return {
      id: user.id,
      name: user.name,
      branchId: user.branchId,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
    }
  }, [user?.id, user?.name, user?.branchId, user?.email, user?.role, user?.jobTitle])

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
    if (!addModalNegotiators.some(n => n.id === addForm.negotiatorId)) {
      setAddForm(prev => ({ ...prev, negotiatorId: '' }))
    }
  }, [addModalOpen, addModalNegotiators, addForm.negotiatorId])

  useEffect(() => {
    if (!editModalOpen || !editForm.negotiatorId) return
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
        throw new Error('Not signed in — refresh the page and try again.')
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
        customerName: (addForm.customerName || '').trim(),
        title: titleVal,
        description: descVal,
        serviceType,
        ticketCategory: category,
        status: 'SCHEDULED',
        source: 'SCHEDULE_MANUAL',
        location: (addForm.location || '').trim(),
        contactPhone: (addForm.contactPhone || '').trim(),
        unitType: addForm.unitType?.trim() || undefined,
        preferredDate: scheduledDate,
        sourceVendor: addForm.sourceVendor?.trim() || 'Direct',
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
            // Keep temp row visible; refresh will merge when server has it
            void fetchTickets({ soft: true, force: true, quiet: true })
            console.log('[Schedules] Created ticket in database (refreshing list)', { tempId })
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

          // Swap temp → real id (carry any cell edits made while create was in flight)
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

  const openEditModal = (ticket: Ticket) => {
    const preferred = getPreferredDateKey(ticket)
    const status = getScheduleStatusValue(ticket)
    setEditOriginalDate(preferred)
    setEditInitialStatus(status)
    const rawBranch = ticket.branchId || ticket.branch_id || ''
    const resolvedBranch = resolveBranch(rawBranch)
    const form = {
      id: ticket.id,
      preferredDate: preferred,
      finalDate: getFinalDateKey(ticket) || preferred || '',
      customerName: ticket.customerName || ticket.customer_name || ticket.title || '',
      contactPhone: ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '',
      location: formatAddress(ticket.location),
      district: ticket.district || parseDistrict(ticket.location) || '',
      commitTerms: ticket.commitTerms || ticket.commitType || ticket.description || '',
      unitType: parseBrand(ticket) || ticket.unitType || ticket.unit_type || '',
      sourceVendor: ticket.sourceVendor || ticket.source_vendor || ticket.dealer || 'Direct',
      serviceDriver: isMyTickets ? formatRelayTicketTypeShort(ticket) : formatServiceDriver(ticket),
      installerName: getInstallerDisplay(ticket, branchEmployees, activeBranchId),
      negotiatorId: ticket.negotiatorId || ticket.negotiator_id || ticket.assignedTo || (isMyTickets && user?.id ? user.id : ''),
      branchId: resolvedBranch?.id || rawBranch || activeBranchId || '',
      ticketNumber: ticket.ticketNumber || ticket.ticket_number || '',
      controlNumber: ticket.controlNumber || ticket.control_number || '',
      ticketCategory: inferCategoryFromTicket(ticket),
      status,
      installationCharges: ticket.installationCharges ?? ticket.installation_charges,
      modeOfPayment: ticket.modeOfPayment ?? ticket.mode_of_payment,
      remarks: ticket.remarks || ticket.remarksUpdate || '',
      acDetails: ticket.acDetails || ticket.ac_details,
      rescheduleToDate: (ticket.status || '').toUpperCase() === 'RESCHED' && !isReschedulePending(ticket) ? preferred : '',
      reschedulePending: isReschedulePending(ticket),
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
      preferredDate: dateFilter || todayDateKey(),
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
      if (!editForm.reschedulePending && !editForm.rescheduleToDate?.trim()) {
        return 'Select a reschedule date or choose Pending if no slot is available yet'
      }
    }
    if (!editForm.negotiatorId) return 'Negotiator is required'
    if (!editForm.branchId?.trim()) return 'Assigned branch is required'
    const selectedNeg = branchEmployees.find(emp => emp.id === editForm.negotiatorId)
    if (selectedNeg?.branchId && editForm.branchId
      && !branchScopesMatch(selectedNeg.branchId, editForm.branchId, selectedNeg.email)) {
      return 'Negotiator must belong to the assigned branch'
    }
    if (!editForm.customerName?.trim()) return 'Customer Name is required'
    if (!editForm.contactPhone?.trim()) return 'Contact No. is required'
    if (!editForm.location?.trim()) return 'Destination/Address is required'
    
    const targetStatus = (editForm.status || '').toUpperCase().replace(/\s+/g, '_')
    const isClosing = ['DONE_INSTALLED', 'DONE_CLEANING', 'DONE_SURVEY', 'DONE_CHECKUP', 'COMPLETED', 'INSTALLED'].includes(targetStatus)
    if (isClosing) {
      const missing = getEmptyRequiredColumnsForClose(editForm, branchEmployees, activeBranchId)
      if (missing.length > 0) {
        return `Cannot close ticket because the following columns are empty:\n• ${missing.join('\n• ')}`
      }
    }

    return null
  }

  const promptSaveEditTicket = () => {
    const error = validateEditForm()
    if (error) {
      alert(error)
      return
    }
    void commitSaveEditTicket()
  }
  /** Resolve the ticket being edited even if a list refresh dropped it from `tickets`. */
  const resolveEditOriginalTicket = (): Ticket | null => {
    const formId = (editForm.id || '').trim()
    if (!formId) return null

    const fromList = tickets.find(t => t.id === formId)
    if (fromList) return fromList

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

    // Modal still has the row data — save by id even if the list no longer holds it.
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
        sourceVendor: editForm.sourceVendor,
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
        acDetails: editForm.acDetails,
      } as Ticket
    }

    return null
  }

  const commitSaveEditTicket = async () => {
    if (!editForm.id || editSaving) return
    const isReschedStatusEarly = (editForm.status || '').toUpperCase() === 'RESCHED'
    const isReschedStatus = isReschedStatusEarly
    const scheduleVal = (editForm.status || 'SCHEDULED').toUpperCase().replace(/\s+/g, '_')
    setEditSaving(true)
    try {
      const originalTicket = resolveEditOriginalTicket()
      if (!originalTicket?.id) {
        throw new Error('Ticket not found — refresh the page and try again.')
      }
      // Keep editForm.id aligned if we resolved via ticket number.
      if (editForm.id !== originalTicket.id) {
        editForm.id = originalTicket.id
      }

      const tokenVal = token()
      const category = editForm.ticketCategory || 'INSTALLATION'
      const { serviceType, serviceVehicle } = parseServiceDriverValue(editForm.serviceDriver, category)
      const titleVal = `${categoryDefaultServiceType(category)} service`
      const descVal = editForm.commitTerms?.trim() || 'No additional details provided.'

      const oldDateKey = editOriginalDate?.split('T')[0]?.trim() || ''
      const newDateKey = isReschedStatus
        ? (editForm.reschedulePending ? '' : editForm.rescheduleToDate?.split('T')[0]?.trim() || '')
        : editForm.preferredDate?.split('T')[0]?.trim() || ''
      const isDateMove = Boolean(oldDateKey && newDateKey && oldDateKey !== newDateKey)
      
      let remarksVal = editForm.remarks?.trim() || undefined
      if (isDateMove) {
        const reschedMsg = isReschedStatus && newDateKey
          ? `Moved to ${formatDateKeyLabel(newDateKey)}`
          : `Scheduled moved from ${formatDateKeyLabel(oldDateKey)}`
        remarksVal = isReschedStatus && newDateKey
          ? reschedMsg
          : (remarksVal ? `${remarksVal} (${reschedMsg})` : reschedMsg)
        editForm.remarks = remarksVal
      }
      
      const acMetaExtras: Record<string, any> = {}

      const body: Record<string, any> = {
        customerName: (editForm.customerName || '').trim(),
        title: titleVal,
        description: descVal,
        serviceType,
        ticketCategory: category,
        location: (editForm.location || '').trim(),
        contactPhone: (editForm.contactPhone || '').trim(),
        unitType: editForm.unitType?.trim() || undefined,
        preferredDate: isReschedStatus && editForm.reschedulePending
          ? (oldDateKey || editForm.preferredDate?.split('T')[0]?.trim() || undefined)
          : newDateKey,
        sourceVendor: editForm.sourceVendor?.trim() || 'Direct',
        district: editForm.district?.trim() || undefined,
        commitType: editForm.commitTerms?.trim() || undefined,
        serviceVehicle: serviceVehicle || undefined,
        installerName: editForm.installerName?.trim() || undefined,
        negotiatorId: editForm.negotiatorId,
        assignedTo: editForm.negotiatorId,
        ticketNumber: editForm.ticketNumber?.trim() || undefined,
        controlNumber: editForm.controlNumber?.trim() || undefined,
        remarks: remarksVal,
        remarksUpdate: remarksVal,
      }

      const selectedNegotiator = branchEmployees.find(emp => emp.id === editForm.negotiatorId)
      if (!selectedNegotiator) {
        alert('Select a negotiator for the assigned branch.')
        return
      }
      if (selectedNegotiator.branchId && editForm.branchId
        && !branchScopesMatch(selectedNegotiator.branchId, editForm.branchId, selectedNegotiator.email)) {
        alert('Negotiator must belong to the assigned branch.')
        return
      }
      const explicitBranch = resolvePortalWriteBranchId(
        editForm.branchId,
        selectedNegotiator?.email || user?.email,
        selectedNegotiator?.jobTitle || user?.jobTitle,
      ) || (editForm.branchId || '').trim()
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
        (originalTicket || editForm) as Ticket,
        branchEmployees,
        editForm.negotiatorId,
      )
      if (resolvedNegoName) body.negotiatorName = resolvedNegoName

      const leavingResched = !isReschedStatus && ticketHasRescheduleMeta(originalTicket)

      if (isReschedStatus) {
        body.status = 'RESCHED'
        if (editForm.reschedulePending) {
          acMetaExtras.reschedulePending = true
          acMetaExtras.rescheduledTo = ''
          if (!remarksVal) {
            remarksVal = 'PENDING'
            body.remarks = remarksVal
            body.remarksUpdate = remarksVal
          }
        } else {
          acMetaExtras.reschedulePending = false
          acMetaExtras.rescheduledTo = newDateKey
        }
      } else if (isDateMove && !leavingResched) {
        body.status = 'SCHEDULED'
      } else {
        Object.assign(body, applyScheduleStatusPatch((originalTicket || editForm) as Ticket, scheduleVal))
        // Status patch may clear Moved-to remarks / set preferredDate
        if (typeof body.remarksUpdate === 'string') remarksVal = body.remarksUpdate
        else if (typeof body.remarks === 'string') remarksVal = body.remarks
        if (body.remarksUpdate === '') {
          remarksVal = ''
          body.remarks = ''
          body.remarksUpdate = ''
        }
      }

      const statusOutcome = typeof body.scheduleOutcome === 'string' ? body.scheduleOutcome : ''
      const statusAcMeta = typeof body.acDetails === 'string'
        ? parseAcMeta({ acDetails: body.acDetails } as Ticket)
        : {}

      const finalDateKey = editForm.finalDate?.split('T')[0]?.trim() || ''

      const paymentCharges = editForm.installationCharges ?? originalTicket?.installationCharges ?? originalTicket?.installation_charges
      const paymentMode = editForm.modeOfPayment ?? originalTicket?.modeOfPayment ?? originalTicket?.mode_of_payment
      if (paymentCharges != null && !Number.isNaN(Number(paymentCharges))) {
        body.installationCharges = Number(paymentCharges)
      }
      if (paymentMode) body.modeOfPayment = paymentMode

      if (finalDateKey && !isReschedStatus) {
        body.finalDate = finalDateKey
        body.preferredDate = finalDateKey
        const origStat = (originalTicket?.status || '').toUpperCase()
        if (['PENDING', 'ASSIGNED'].includes(origStat) && !isDateMove && String(body.status || '').toUpperCase() !== 'COMPLETED') {
          body.status = 'SCHEDULED'
        }
      }

      if (isDateMove && !leavingResched) {
        const existing = parseAcMeta(editForm as Ticket)
        const prevDates: string[] = Array.isArray(existing.previousScheduleDates)
          ? [...existing.previousScheduleDates]
          : []
        if (!prevDates.includes(oldDateKey)) prevDates.push(oldDateKey)
        acMetaExtras.previousScheduleDates = prevDates
        acMetaExtras.rescheduledTo = newDateKey
        acMetaExtras.reschedulePending = false
      }

      // Leaving RESCHED for Installation/etc. — never re-apply ghost-date metadata
      if (leavingResched) {
        acMetaExtras.previousScheduleDates = []
        acMetaExtras.rescheduledTo = ''
        acMetaExtras.reschedulePending = false
        if (isMovedToRescheduleRemark(remarksVal || '') || /^PENDING$/i.test((remarksVal || '').trim())) {
          remarksVal = ''
          body.remarks = ''
          body.remarksUpdate = ''
        }
      }

      const acBaseTicket = (typeof body.acDetails === 'string'
        ? { ...(originalTicket || editForm), acDetails: body.acDetails }
        : (originalTicket || editForm)) as Ticket

      body.acDetails = mergeAcMeta(acBaseTicket, {
        ...acMetaExtras,
        destination: editForm.location.trim(),
        address: editForm.location.trim(),
        district: editForm.district?.trim() || undefined,
        brand: editForm.unitType?.trim() || undefined,
        unitType: editForm.unitType?.trim() || undefined,
        dealer: editForm.sourceVendor?.trim() || undefined,
        dlr: editForm.sourceVendor?.trim() || undefined,
        update: remarksVal || '',
        remarksUpdate: remarksVal || '',
        installerName: editForm.installerName?.trim() || undefined,
        negotiatorId: editForm.negotiatorId,
        negotiatorName: resolveNegotiatorName(
          (originalTicket || editForm) as Ticket,
          branchEmployees,
          editForm.negotiatorId,
        ) || undefined,
        finalDate: isReschedStatus ? '' : finalDateKey,
        scheduleOutcome: statusOutcome || statusAcMeta.scheduleOutcome || '',
        schedulePhase: statusAcMeta.schedulePhase ?? '',
        ...(leavingResched
          ? { previousScheduleDates: [], rescheduledTo: '', reschedulePending: false }
          : {}),
      })

      if (String(body.status || '').toUpperCase() === 'COMPLETED') {
        const outcome = (statusOutcome || String(statusAcMeta.scheduleOutcome || '') || 'DONE_INSTALLED') as ScheduleOutcome
        body.scheduleOutcome = outcome
        body.acDetails = mergeAcMeta({ ...editForm, acDetails: body.acDetails } as Ticket, {
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

      await queueTicketPatch(
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
                  sourceVendor: archiveBody.sourceVendor,
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
                  negotiatorName: resolveNegotiatorName(archiveOriginal, branchEmployees, editForm.negotiatorId),
                },
                schedKey,
              )
              if (!archivePayload) {
                alert('Ticket marked completed but not added to Archives — select a branch (e.g. Taguig Sales) in the sidebar, then add the record manually in Archives.')
                return
              }
              try {
                await postArchiveServiceReport(archivePayload, tokenVal)
              } catch (err) {
                console.warn('Archive service report failed:', err)
                alert(`Ticket saved as completed but Archives entry failed: ${formatFetchError(err)}`)
              }
              void fetchTickets({ soft: true, force: true, quiet: true })
            }
          : undefined,
      )

      setEditFormSnapshot(JSON.stringify(editForm))
      setEditModalOpen(false)
      showToast('Saved')
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
      alert('Select an import date first — tickets will be saved as SCHEDULED for that date.')
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
      alert('Select a branch before importing — use the branch selector in the sidebar.')
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
        sourceVendor: updatedFields.sourceVendor,
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
          sourceVendor: updatedFields.sourceVendor,
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
    console.log('[Schedules] Import applied on UI — saving to database in background', {
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

            // Confirm list from server (temps already swapped / removed)
            await fetchTickets({ soft: true, force: true, quiet: true })
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

  // ── Cell edit / expand ────────────────────────────────────────────────────
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})
  const [editingCell, setEditingCell] = useState<{ ticketId: string; colLabel: string; value: string } | null>(null)
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
    ghostKind?: 'completed' | 'resched' | null
  } | null>(null)
  const [finalDatePicker, setFinalDatePicker] = useState<{
    ticket: Ticket
    x: number
    y: number
    value: string
    preferredDate: string
  } | null>(null)
  const [finalDateCalMonth, setFinalDateCalMonth] = useState<{ year: number; month: number } | null>(null)
  const [savingCellKey] = useState<string | null>(null)
  const cellEditBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cellEditDraftRef = useRef<{ ticketId: string; colLabel: string; value: string } | null>(null)
  const saveCellEditRef = useRef<(ticket: Ticket, colLabel: string, value: string, injectedPayment?: { amount: number; modeOfPayment: string }) => void>(() => {})
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

  // ── Column config ─────────────────────────────────────────────────────────
  const columns = useMemo(() => {
    const scheduleCols = [
      { label: 'TICKET NO',       display: 'TICKET NO',                                 weight: 9,  expMul: 1.2,  sticky: true,  freeze: false, align: 'center' as const },
      { label: "CUSTOMER'S NAME", display: "CUSTOMER",                                  weight: 15, expMul: 1.5,  sticky: true,  freeze: false, align: 'left' as const },
      { label: 'DESTINATION',     display: 'DISTRICT',                                    weight: 12, expMul: 1.5,  sticky: true,  freeze: true,  align: 'center' as const },
      { label: 'BRAND',           display: "BRAND",                                     weight: 11, expMul: 1.5,  sticky: false, freeze: false, align: 'center' as const },
      { label: 'DLR',             display: isTaguigServices ? "ENDORSED BY" : "DEALER", weight: 10, expMul: 1.4,  sticky: false, freeze: false, align: 'center' as const },
      { label: 'COMMIT',          display: "COMMIT",                                    weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'NEGOTIATOR',      display: 'NEGOTIATOR',                                weight: 10, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'INSTALLER',       display: isTaguigServices ? "TECHNICIAN" : "INSTALLER", weight: 10, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'SERVICE',         display: "DRIVER",                                    weight: 9,  expMul: 1.3,  sticky: false, freeze: false, align: 'center' as const },
      { label: 'STATUS',          display: "STATUS",                                    weight: 9,  expMul: 1.3,  sticky: false, freeze: false, align: 'center' as const },
      { label: 'UPDATE',          display: "REMARKS",                                   weight: 14, expMul: 1.55, sticky: false, freeze: false, align: 'right' as const },
      { label: 'PAYMENT',         display: "PAYMENT",                                   weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'right' as const },
    ]
    const myTicketsCols = [
      { label: 'TICKET NO',       display: 'TICKET NO',                                 weight: 9,  expMul: 1.2,  sticky: true,  freeze: false, align: 'center' as const },
      { label: "CUSTOMER'S NAME", display: 'CUSTOMER',                                  weight: 14, expMul: 1.5,  sticky: true,  freeze: false, align: 'left' as const },
      { label: 'DESTINATION',     display: 'DISTRICT',                                  weight: 11, expMul: 1.5,  sticky: true,  freeze: true,  align: 'center' as const },
      { label: 'BRAND',           display: 'BRAND',                                     weight: 10, expMul: 1.45, sticky: false, freeze: false, align: 'center' as const },
      { label: 'DLR',             display: isTaguigServices ? 'ENDORSED BY' : 'DEALER', weight: 9,  expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'COMMIT',          display: 'COMMIT',                                    weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'NEGOTIATOR',      display: 'NEGOTIATOR',                                weight: 10, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const, sortable: true },
      { label: 'SERVICE',         display: 'TYPE',                                      weight: 8,  editHint: true, expMul: 1.25, sticky: false, freeze: false, align: 'center' as const },
      { label: 'STATUS',          display: 'STATUS',                                    weight: 8,  expMul: 1.25, sticky: false, freeze: false, align: 'center' as const },
      { label: 'UPDATE',          display: 'REMARKS',                                   weight: 13, expMul: 1.5,  sticky: false, freeze: false, align: 'right' as const },
      { label: 'FINAL DATE',      display: 'FINAL DATE',                                weight: 10, expMul: 1.3,  sticky: false, freeze: false, align: 'center' as const },
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

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const token = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const fetchTickets = useCallback(async (options?: { soft?: boolean; force?: boolean; quiet?: boolean }) => {
    if (!user) return
    const seq = ++fetchSeqRef.current
    const cacheKey = schedulesCacheKeyForTab()
    const cached = readSchedulesTabCache(cacheKey)
    const cacheEntry = readTabCacheEntry<SchedulesTabCache>(cacheKey)
    const cacheAt = cached?.lastSyncAt ?? cacheEntry?.data.lastSyncAt ?? cacheEntry?.savedAt
    const cacheFresh = cacheAt ? isTabCacheFresh(cacheAt, SCHEDULES_CACHE_TTL_MS) : false
    const hasCache = Array.isArray(cached?.tickets)
    const cacheHasRows = hasCache && (cached!.tickets as Ticket[]).length > 0
    const sessionLoaded = isSchedulesSessionLoaded(cacheKey) || hasCache
    const skipNetwork = Boolean(
      options?.soft && !options?.force && options?.quiet && cacheFresh && cacheHasRows,
    )
    // Soft / quiet refreshes must never show the full-page loading UI.
    const showSkeleton = !options?.soft && !options?.quiet && !hasLoadedOnceRef.current && !hasCache && !sessionLoaded
    if ((options?.soft || options?.quiet || hasCache || sessionLoaded || hasLoadedOnceRef.current) && !skipNetwork) {
      setLoading(false)
      setHasHydratedOnce(true)
    }
    if (!skipNetwork) {
      setSyncing(true)
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
      setTickets(applyOptimisticOverlay(cached!.tickets as Ticket[]))
      hasLoadedOnceRef.current = true
      setHasHydratedOnce(true)
      setLoading(false)
      setSyncing(false)
      markSchedulesSessionLoaded(cacheKey)
      return
    }

    if (hasCache || sessionLoaded) {
      if (hasCache) {
        setTickets(applyOptimisticOverlay(cached!.tickets as Ticket[]))
      }
      hasLoadedOnceRef.current = true
      setHasHydratedOnce(true)
      setLoading(false)
      if (hasCache) markSchedulesSessionLoaded(cacheKey)
    } else if (showSkeleton) {
      setLoading(true)
    }
    setFetchError(null)
    try {
      const ep = isMyTickets
        ? (isAdmin ? '/tickets/branch' : '/tickets/assigned')
        : isCustomer ? '/tickets/my' : isAdmin ? '/tickets' : '/tickets/branch'
      const size = isMyTickets ? 200 : (!isMyTickets && dateFilter ? 500 : isAdmin ? 300 : 200)
      const list = await fetchTicketsPage(ep, token(), {
        size,
        ...(isMyTickets && isAdmin ? { categoryGroup: 'FIELD' as const, status: 'ASSIGNED' } : {}),
        ...(!isMyTickets && dateFilter ? { date: dateFilter } : {}),
      })
      if (seq !== fetchSeqRef.current) return
      const merged = applyOptimisticOverlay(list as Ticket[])
      setTickets(merged)
      writeSchedulesTabCache(cacheKey, merged, 'server')
      hasLoadedOnceRef.current = true
      setHasHydratedOnce(true)
      markSchedulesSessionLoaded(cacheKey)
    } catch {
      if (seq !== fetchSeqRef.current) return
      if (!hasCache) setFetchError('Failed to load tickets. Check your connection.')
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false)
        setSyncing(false)
      }
    }
  }, [user, isCustomer, isAdmin, isMyTickets, globalBranchId, dateFilter, token, schedulesCacheKeyForTab])

  const schedulesDateFetchMountedRef = useRef(false)

  useEffect(() => {
    hydrateFromTabCache()
    // Always refresh from server on mount / branch change — cache is paint-only.
    void fetchTickets({
      soft: true,
      force: true,
      quiet: true,
    })
  }, [fetchTickets, globalBranchId, user, isCustomer, isAdmin, isMyTickets, hydrateFromTabCache])

  useEffect(() => {
    if (isMyTickets) return
    if (!schedulesDateFetchMountedRef.current) {
      schedulesDateFetchMountedRef.current = true
      return
    }
    hydrateFromTabCache()
    void fetchTickets({ soft: true, quiet: true, force: true })
  }, [dateFilter, fetchTickets, isMyTickets, hydrateFromTabCache])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && hasLoadedOnceRef.current) {
        // Quiet background refresh only — never hard loading UI.
        void fetchTickets({ soft: true, force: true, quiet: true })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchTickets])

  useEffect(() => {
    const onCacheUpdated = () => {
      const cacheKey = schedulesCacheKeyForTab()
      const cached = readTabCache<SchedulesTabCache>(cacheKey)
      if (Array.isArray(cached?.tickets)) {
        setTickets(normalizeRelayScheduleTicketList(cached.tickets as Ticket[]))
      }
    }
    window.addEventListener(TAB_CACHE_UPDATED, onCacheUpdated)
    return () => window.removeEventListener(TAB_CACHE_UPDATED, onCacheUpdated)
  }, [user, globalBranchId, isCustomer, isAdmin, isMyTickets, schedulesCacheKeyForTab])

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

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = tickets.filter(t => {
      const stat = (t.status || '').toUpperCase()
      if (stat === 'CANCELLED') return false

      if (isMyTickets) {
        const effectiveBranch = isAdmin ? globalBranchId : user?.branchId
        if (effectiveBranch && effectiveBranch !== 'ALL_BRANCHES') {
          const b = resolveTicketScheduleBranchId(t, installerLineupIndex, driverOnlyNames)
          if (!b) return false
          if (!branchScopesMatch(b, effectiveBranch, user?.email) && !isBranchMatch(b, effectiveBranch)) return false
          if (isTaguigBranchRef(effectiveBranch)) {
            const wantServices = isTaguigServicesScope(effectiveBranch, user?.email)
            const isService = isTaguigServiceTicket(t as unknown as Record<string, unknown>)
            if (wantServices ? !isService : isService) return false
          }
        }
        if (!shouldShowOnMyTickets(t)) return false
        return true
      }

      if (!isFieldCategory(inferCategoryFromTicket(t))) return false

      if (isInstalledWorkflowStatus(stat)) {
        return Boolean(dateFilter && isCompletedGhostOnDate(t, dateFilter))
      }

      let hasFinalDate = Boolean(getFinalDateKey(t))

      const scheduleValue = getScheduleStatusValue(t)
      const isResched = stat === 'RESCHED' || scheduleValue === 'RESCHED'
      const isForApproval = stat === 'FOR APPROVAL' || stat === 'FOR_APPROVAL' || stat === 'FOR QUOTATION' || stat === 'FOR_QUOTATION' || stat.includes('QUOTATION') || scheduleValue === 'FOR_APPROVAL'
      const isSurvey = scheduleValue === 'SURVEY' || scheduleValue === 'DONE_SURVEY'
      const isCleaning = scheduleValue === 'CLEANING' || scheduleValue === 'DONE_CLEANING'
      const isInstallation = scheduleValue === 'INSTALLATION' || scheduleValue === 'SERVICES' || scheduleValue === 'DONE_INSTALLED' || scheduleValue === 'DONE_CHECKUP'
      const isActiveSchedule = ['SCHEDULED', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_THE_WAY'].includes(stat) || hasFinalDate

      return isInstallation || isCleaning || isResched || isForApproval || isSurvey || isActiveSchedule
    })
    if (!isMyTickets) {
      const effectiveBranch = isAdmin ? globalBranchId : user?.branchId
      if (effectiveBranch && effectiveBranch !== 'ALL_BRANCHES') {
        list = list.filter(t => {
          const b = resolveTicketScheduleBranchId(t, installerLineupIndex, driverOnlyNames)
          if (!b) return false
          if (!branchScopesMatch(b, effectiveBranch, user?.email) && !isBranchMatch(b, effectiveBranch)) return false
          if (isTaguigBranchRef(effectiveBranch)) {
            const wantServices = isTaguigServicesScope(effectiveBranch, user?.email)
            const isService = isTaguigServiceTicket(t as unknown as Record<string, unknown>)
            return wantServices ? isService : !isService
          }
          return true
        })
      }
    }
    if (dateFilter) {
      list = list.filter(t =>
        ticketMatchesDateKey(t, dateFilter) ||
        isScheduleGhostOnDate(t, dateFilter) ||
        ((t.status || '').toUpperCase() === 'CONTINUATION' && getContinuationDates(t).includes(dateFilter))
      )
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
  }, [tickets, isAdmin, isMyTickets, globalBranchId, dateFilter, searchQuery, user?.id, user?.email, user?.branchId, installerLineupIndex, driverOnlyNames])

  const visible = useMemo(() => {
    let list = filtered
    const cmpOpts = { myTickets: isMyTickets, employees: branchEmployees, branchId: activeBranchId }
    list = [...list].sort((a, b) => {
      // Schedules: always group rows by installer/technician name first.
      if (!isMyTickets) {
        const byInstaller = compareTicketsByColumn(a, b, 'INSTALLER', cmpOpts)
        if (byInstaller !== 0) {
          const desc = sortConfig.column === 'INSTALLER' && sortConfig.direction === 'desc'
          return desc ? -byInstaller : byInstaller
        }
      }
      if (isMyTickets || sortConfig.column !== 'INSTALLER') {
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
  }, [filtered, sortConfig, isMyTickets, branchEmployees, activeBranchId])

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

  const counts = useMemo(() => {
    let installation = 0
    let survey = 0
    let resched = 0
    let forApproval = 0

    visible.forEach(t => {
      if (dateFilter && isScheduleGhostOnDate(t, dateFilter)) return
      const scheduleValue = getScheduleStatusValue(t)
      if (scheduleValue === 'RESCHED') {
        resched++
      } else if (scheduleValue === 'SURVEY' || scheduleValue === 'DONE_SURVEY') {
        survey++
      } else if (scheduleValue === 'FOR_APPROVAL') {
        forApproval++
      } else if (
        scheduleValue === 'INSTALLATION'
        || scheduleValue === 'SERVICES'
        || scheduleValue === 'CLEANING'
        || scheduleValue === 'DONE_INSTALLED'
        || scheduleValue === 'DONE_CLEANING'
        || scheduleValue === 'DONE_CHECKUP'
      ) {
        installation++
      }
    })

    return {
      installation,
      survey,
      resched,
      forApproval,
    }
  }, [visible, dateFilter])

  // ── Get display value for a column ────────────────────────────────────────
  function getCellDisplay(ticket: Ticket, colLabel: string): string {
    switch (colLabel) {
      case 'TICKET NO':       return getTicketNumberDisplay(ticket)
      case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title
      case 'DESTINATION':     return resolveTicketDistrict(ticket)
      case 'DISTRICT':        return parseDistrict(ticket.location, ticket.district)
      case 'CONTACT NO.':     return getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
      case 'BRAND':           return parseBrand(ticket)
      case 'DLR':             return getF(ticket, 'sourceVendor', 'source_vendor', 'dealer') || ''
      case 'STATUS':          return getScheduleStatusLabel(getScheduleStatusValue(ticket))
      case 'SCHEDULED DATE':  return formatDateKeyLabel(getArchivedScheduleDate(ticket))
      case 'INSTALLED DATE':  return formatDateKeyLabel(getInstalledDateKey(ticket))
      case 'FINAL DATE':      return formatDateKeyLabel(getFinalDateKey(ticket))
      case 'PAYMENT':         return formatCombinedPayment(ticket)
      case 'MOP':             return getPaymentMode(ticket)
      case 'COMMIT':          return getF(ticket, 'commitType', 'commitTerms', 'description')
      case 'INSTALLER':       return getInstallerDisplay(ticket, branchEmployees, activeBranchId)
      case 'NEGOTIATOR':      return getTicketNegotiatorName(ticket, branchEmployees)
      case 'NOTE':            return ticket.note || ''
      case 'SERVICE':         return isMyTickets ? formatRelayTicketTypeShort(ticket) : formatServiceDriver(ticket)
      case 'UPDATE':          return getScheduleUpdateDisplay(ticket)
      default: return ''
    }
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
      || (editingCell ? { ticketId: editingCell.ticketId, colLabel: editingCell.colLabel, value: editingCell.value } : null)
    if (!draft) return
    cellEditDraftRef.current = null
    setEditingCell(null)
    const ticket = tickets.find(t => t.id === draft.ticketId)
      || optimisticTicketsRef.current.get(draft.ticketId)
    if (!ticket) return
    void saveCellEditRef.current(ticket, draft.colLabel, draft.value)
  }, [editingCell, tickets])

  const cancelEdit = discardCellEdit

  const cellEditKey = (ticketId: string, colLabel: string) => `${ticketId}:${colLabel}`

  const openStatusPicker = useCallback((
    ticket: Ticket,
    mode: 'inline' | 'edit-form' = 'inline',
    anchorEl?: HTMLElement | null,
  ) => {
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    cancelEdit()
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
    ghostKind?: 'completed' | 'resched' | null,
  ) => {
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    cancelEdit()
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
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    cancelEdit()
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

  const startCellEdit = (ticket: Ticket, colLabel: string, anchorEl?: HTMLElement | null) => {
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    setExpandedCell(null)
    if (colLabel === 'STATUS') {
      openStatusPicker(ticket)
      return
    }
    if (colLabel === 'FINAL DATE') {
      openFinalDatePicker(ticket, anchorEl)
      return
    }
    const value = getCellRawValue(ticket, colLabel, isMyTickets, branchEmployees, activeBranchId)
    cellEditDraftRef.current = { ticketId: ticket.id, colLabel, value }
    setEditingCell({ ticketId: ticket.id, colLabel, value })
  }

  const applyTicketLocally = useCallback((ticketId: string, nextTicket: Ticket) => {
    const normalized = normalizeRelayScheduleTicket(nextTicket)
    const prevTicket = tickets.find(t => t.id === ticketId) || optimisticTicketsRef.current.get(ticketId)
    optimisticTicketsRef.current.set(ticketId, normalized)

    if (!isMyTickets) {
      const prevDate = prevTicket ? resolveTicketScheduleDateKey(prevTicket) : ''
      const nextDate = resolveTicketScheduleDateKey(normalized)
      if (nextDate && nextDate !== prevDate) {
        handleDateFilterChange(nextDate)
      }
    }

    setTickets(prev => {
      const exists = prev.some(t => t.id === ticketId)
      const next = exists
        ? prev.map(t => (t.id === ticketId ? normalized : t))
        : [normalized, ...prev]
      writeSchedulesTabCache(schedulesCacheKeyForTab(), next, 'local')
      return next
    })
    setOverviewResults(prev => prev.map(t => (t.id === ticketId ? { ...t, ...normalized } : t)))
    setDetailTicket(prev => (prev?.id === ticketId ? { ...prev, ...normalized } : prev))
    syncTicketAcrossTabCaches(normalized)
  }, [tickets, user, globalBranchId, isCustomer, isAdmin, isMyTickets, schedulesCacheKeyForTab, handleDateFilterChange])

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
    // Never PATCH optimistic temp ids — edits stay queued until promoteTempTicketState.
    if (isTempTicketId(ticketId)) return
    if (activeSavesRef.current.has(ticketId)) return
    activeSavesRef.current.add(ticketId)
    let saveId = ticketId
    try {
      while (pendingSavesRef.current.has(saveId)) {
        const job = pendingSavesRef.current.get(saveId)!
        pendingSavesRef.current.delete(saveId)
        const payload = sanitizeTicketPatchBody(job.body)
        try {
          const auth = token()
          if (!auth) throw new Error('Not signed in — refresh and try again')
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
              const found = ticketNumber
                ? await lookupTicketByNumberOnServer(auth, ticketNumber)
                : null
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
          if (savedTicket?.id) {
            const base = optimisticTicketsRef.current.get(saveId)
              || tickets.find(t => t.id === saveId)
            if (base) {
              const mergedSaved = mergeTicketPatch(base, savedTicket as unknown as Record<string, unknown>)
              optimisticTicketsRef.current.set(saveId, mergedSaved)
              setTickets(prev => prev.map(t => (t.id === saveId ? mergedSaved : t)))
              setOverviewResults(prev => prev.map(t => (t.id === saveId ? { ...t, ...mergedSaved } : t)))
              syncTicketAcrossTabCaches(mergedSaved)
            }
          }
          console.log('[Schedules] Saved to database', {
            ticketId: saveId,
            status: payload.status,
            scheduleOutcome: payload.scheduleOutcome,
            ticketCategory: payload.ticketCategory,
            serviceType: payload.serviceType,
          })
          clearRelaysCache()
          clearWarrantyCache()
          void fetchTickets({ soft: true, force: true, quiet: true })
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
            alert(`Could not save ticket — it may have been removed or replaced. Refreshed the list. (${formatFetchError(err)})`)
          } else {
            alert(`Could not save ticket: ${formatFetchError(err)}`)
          }
          break
        }
      }
    } finally {
      activeSavesRef.current.delete(ticketId)
      activeSavesRef.current.delete(saveId)
      const nextId = saveId !== ticketId ? saveId : ticketId
      if (pendingSavesRef.current.has(nextId)) {
        void flushTicketSave(nextId)
      } else if (pendingSavesRef.current.has(ticketId)) {
        void flushTicketSave(ticketId)
      }
    }
  }, [restoreTicketLocally, token, fetchTickets, tickets, remapScheduleTicketId, purgeStaleScheduleTicket])
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
    // Temp rows are not on the server yet — flush after create promotes to a real id.
    if (!isTempTicketId(ticketId)) {
      return flushTicketSave(ticketId)
    }
    return Promise.resolve()
  }, [applyTicketLocally, flushTicketSave])

  const saveCellEdit = (
    ticket: Ticket,
    colLabel: string,
    value: string,
    injectedPayment?: { amount: number; modeOfPayment: string }
  ) => {
    const liveTicket = resolveLiveScheduleTicket(ticket)
    const key = cellEditKey(liveTicket.id, colLabel)
    if (savingCellKey === key) return

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
    }

    // Remarks always save in-cell — never open a payment popup.
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
              alert('Ticket completed but not added to Archives — select a branch in the sidebar.')
              return
            }
            try {
              await postArchiveServiceReport(archivePayload, token())
            } catch (err) {
              alert(`Ticket completed but Archives entry failed: ${formatFetchError(err)}`)
            }
            void fetchTickets({ soft: true, force: true, quiet: true })
          }
        : undefined,
    )

    if (focusRemarksAfterStatus) {
      const nextTicket = mergeTicketPatch(liveTicket, finalBody)
      requestAnimationFrame(() => startCellEdit(nextTicket, 'UPDATE'))
    }
  }
  saveCellEditRef.current = (ticket, colLabel, value, injectedPayment) => { void saveCellEdit(ticket, colLabel, value, injectedPayment) }

  const openReschedDialog = (ticket: Ticket) => {
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    cancelEdit()
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
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    cancelEdit()
    const existingDates = getContinuationDates(ticket)
    setContinuationDialog({ ticket })
    setContinuationSelectedDates(existingDates)
    
    const todayKey = todayDateKey()
    const startKey = existingDates[0] || todayKey
    const startDate = new Date(`${startKey}T00:00:00`)
    const todayDate = new Date(`${todayKey}T00:00:00`)
    const calViewDate = startDate >= todayDate ? startDate : todayDate
    setContinuationCalMonth({ year: calViewDate.getFullYear(), month: calViewDate.getMonth() })
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

  // ── Delete — remove row instantly, DELETE in background ───────────────────
  const handleDelete = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId)
      || optimisticTicketsRef.current.get(ticketId)
    const name = ticket?.customerName || ticket?.customer_name || ticket?.title || 'this ticket'
    setContextMenu(null)
    setDetailTicket(prev => (prev?.id === ticketId ? null : prev))
    setConfirmModal({
      title: 'Delete ticket?',
      message: 'This action cannot be undone.',
      detail: name,
      variant: 'danger',
      confirmText: 'Delete',
      onConfirm: () => commitDeleteTicket(ticketId),
    })
  }

  const commitDeleteTicket = (ticketId: string) => {
    const rollback = tickets.find(t => t.id === ticketId)
      || optimisticTicketsRef.current.get(ticketId)
    if (!rollback) {
      alert('Ticket not found.')
      return
    }

    // Instant UI remove
    deletedTicketsRef.current.add(ticketId)
    pendingSavesRef.current.delete(ticketId)
    optimisticTicketsRef.current.delete(ticketId)
    setTickets(prev => {
      const next = prev.filter(t => t.id !== ticketId)
      const cacheKey = schedulesCacheKeyForTab()
              writeSchedulesTabCache(cacheKey, next, 'local')
      return next
    })
    setEditModalOpen(false)
    setConfirmModal(null)

    // Temp rows are not on the server yet — local remove is enough.
    // If an in-flight Excel import later creates the real ticket, it will DELETE that id.
    if (isTempTicketId(ticketId)) {
      console.log('[Schedules] Removed unsaved ticket locally', { ticketId })
      return
    }

    void (async () => {
      try {
        const auth = token()
        if (!auth) throw new Error('Not signed in — refresh and try again.')
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

  const promptClearAllVisible = () => {
    if (!canEdit || visible.length === 0) return
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
    if (!canEdit || visible.length === 0) return
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
      void commitCellEdit()
    }

    const onBlur = () => {
      cellEditBlurTimer.current = setTimeout(commit, 80)
    }

    const syncDraftValue = (value: string) => {
      cellEditDraftRef.current = { ticketId: ticket.id, colLabel, value }
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
          <option value="">— Select negotiator —</option>
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

    if (colLabel === 'INSTALLER' || (colLabel === 'SERVICE' && !isMyTickets)) {
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
            placeholder={colLabel === 'INSTALLER' ? 'Select or type installer…' : 'Select or type driver…'}
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
          placeholder={colLabel === 'UPDATE' ? 'Type remarks…' : undefined}
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
          onClick={e => {
            e.stopPropagation()
            const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
            startCellEdit(ticket, colLabel, cell)
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
      showToast('Address copied ✓')
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      showToast('Address copied ✓')
    }
  }

  function renderCell(ticket: Ticket, col: (typeof columns)[0], idx?: number, rowGhost?: boolean, ghostKind?: 'completed' | 'resched' | null, cellExpanded = false) {
    const { label } = col

    const inlineEditor = renderInlineCellEditor(ticket, label, rowGhost)
    if (inlineEditor) return inlineEditor

    // ── DISPLAY STATE ──
    const val = getCellDisplay(ticket, label)
    const ghostMuted = rowGhost
      ? (ghostKind === 'completed' ? (isLight ? '#166534' : '#86efac') : ghostKind === 'resched' ? (isLight ? '#a16207' : '#fbbf24') : textMuted)
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
              {fullAddress || '—'}
            </div>
          </>
        )
      }
      return withEditPencil(
        <span style={truncStyle} title={fullAddress}>
          {district || '—'}
        </span>,
        ticket, label, rowGhost,
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
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#5b21b6' : '#ddd6fe' }} title="Done Survey">
                DONE SURVEY
              </span>
            )
          }
          if (outcome === 'DONE_CHECKUP') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#1d4ed8' : '#93c5fd' }} title="Done Checkup">
                DONE CHECKUP
              </span>
            )
          }
          return (
            <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#15803d' : '#86efac' }} title="Installed — see Archives tab">
              INSTALLED
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
      const badgeStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
      const display = getScheduleStatusDisplay(ticket) || '—'
      const displayLabel = display === 'INSTALLATION' ? 'INSTALL' : (display === 'FOR APPROVAL' ? 'APPROVAL' : display)
      const showsDetails = statusShowsScheduleDetails(statusVal)
      const statusTitle = showsDetails
        ? `${display} — click to view remarks & payment`
        : (canEdit ? `${display} — click to change` : display)
      return (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-normal border cursor-pointer select-none"
          style={{ color: badgeStyle.color, backgroundColor: badgeStyle.backgroundColor, borderColor: badgeStyle.borderColor, maxWidth: '100%' }}
          title={statusTitle}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLabel}</span>
          {canEdit && <ChevronDown className="w-2.5 h-2.5 shrink-0 opacity-70" />}
        </span>
      )
    }

    if (label === 'TICKET NO') {
      const prefix = idx !== undefined ? `${idx + 1}. ` : ''
      const displayVal = val ? `${prefix}${val}` : `${prefix}—`
      return withEditPencil(
        <span style={{ ...truncStyle, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }} title={displayVal}>
          {displayVal}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'FINAL DATE') {
      const hasDate = Boolean(val)
      if (!hasDate && canEdit && !rowGhost) {
        return (
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); startCellEdit(ticket, label, e.currentTarget as HTMLElement) }}
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
          {val || '—'}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'SERVICE' && isMyTickets) {
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 700, letterSpacing: '0.04em' }} title={val}>
          {val || 'SURVEY & INSTALL'}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'SERVICE') {
      if (!val && canEdit && !isMyTickets && !rowGhost) {
        return (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={e => {
              e.stopPropagation()
              const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
              startCellEdit(ticket, label, cell)
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
              title={val}>
          {val || ''}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'UPDATE') {
      const remarksText = rowGhost
        ? formatGhostRemarks(ticket, ghostKind ?? null, dateFilter)
        : getScheduleUpdateDisplay(ticket)
      if (cellExpanded) {
        const isCompletedGhost = ghostKind === 'completed' || isCompletedGhostOnDate(ticket, dateFilter)
        return (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>Remarks</div>
            <div
              className="whitespace-normal break-words leading-relaxed"
              style={{
                color: remarksText
                  ? (rowGhost
                    ? (isCompletedGhost ? (isLight ? '#15803d' : '#86efac') : (isLight ? '#a16207' : '#fbbf24'))
                    : green)
                  : textMuted,
                fontWeight: remarksText ? 600 : 400,
                fontStyle: rowGhost ? 'italic' : undefined,
              }}
            >
              {remarksText || '—'}
            </div>
          </>
        )
      }
      if (rowGhost) {
        const ghostRemarks = remarksText
        const isCompletedGhost = ghostKind === 'completed' || isCompletedGhostOnDate(ticket, dateFilter)
        return (
          <span
            style={{
              ...truncStyle,
              color: isCompletedGhost ? (isLight ? '#15803d' : '#86efac') : (isLight ? '#a16207' : '#fbbf24'),
              fontWeight: 600,
              fontStyle: 'italic',
            }}
            title={ghostRemarks}
          >
            {ghostRemarks || '—'}
          </span>
        )
      }
      return withEditPencil(
        <span style={{ ...truncStyle, color: val ? green : textMuted, fontWeight: val ? 600 : 400 }}
              title={val}>
          {val || ''}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'PAYMENT') {
      const combined = formatCombinedPayment(ticket)
      const mode = getPaymentMode(ticket).trim().toUpperCase()
      const amountStr = formatPaymentAmount(ticket)
      if (cellExpanded) {
        return (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>Payment</div>
            {!combined ? (
              <div style={{ color: textMuted }}>—</div>
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
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: textPrimary }}>₱{amountStr}</span>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )
      }
      if (!combined) {
        return <span style={{ ...truncStyle, color: textMuted }}>—</span>
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
          {mode && (
            <span style={{ fontWeight: 600, color: isLight ? '#475569' : '#94a3b8', letterSpacing: '0.03em' }}>
              {mode}
            </span>
          )}
          {mode && amountStr ? ' ' : null}
          {amountStr ? (
            <span style={{ fontWeight: 700, color: isLight ? '#0f172a' : '#f1f5f9' }}>{amountStr}</span>
          ) : null}
        </span>
      )
    }

    if (label === "CUSTOMER'S NAME") {
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 600 }} title={val}>{val}</span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'INSTALLER') {
      const rawInstaller = getInstallerDisplay(ticket, branchEmployees, activeBranchId)
      let curInstaller = rawInstaller
      if (!curInstaller && idx != null && idx > 0) {
        for (let i = idx - 1; i >= 0; i--) {
          const prev = resolveInstallerFieldForCarry(visible[i], branchEmployees, activeBranchId)
          if (prev) {
            curInstaller = prev
            break
          }
        }
      }
      const isEmpty = !curInstaller

      const prevInstaller = idx != null && idx > 0
        ? resolveInstallerFieldForCarry(visible[idx - 1], branchEmployees, activeBranchId)
        : ''
      const curToken = parseNameSiteToken(curInstaller)
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
                startCellEdit(ticket, label, cell)
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
            —
          </span>,
          ticket, label, rowGhost
        )
      }

      return withEditPencil(
        <span
          style={{
            ...truncStyle,
            display: 'block',
            borderTop: isNewInstallerGroup ? `2px solid ${isLight ? '#d1d5db' : '#475569'}` : undefined,
            paddingTop: isNewInstallerGroup ? 8 : 0,
            marginTop: isNewInstallerGroup ? 4 : 0,
          }}
          title={curInstaller}
        >
          {curInstaller}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'NEGOTIATOR') {
      const negName = getTicketNegotiatorName(ticket, branchEmployees) || '—'
      return withEditPencil(
        <div className="flex flex-col items-center justify-center text-center">
          <span style={{ ...truncStyle, fontWeight: 600 }} title={negName}>
            {negName !== '—' ? <EmployeeNameLink nameOrId={negName} /> : negName}
          </span>
        </div>,
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
    <div className="flex flex-col flex-1 w-full min-h-0 h-full" onClick={() => {
      setContextMenu(null)
      if (!saving && !editModalOpen && !addModalOpen) commitCellEdit()
      setHoveredCell(null)
      setExpandedCell(null)
      setAddMenuOpen(false)
    }}>

      {/* Toast — success/info only; saves run silently in background */}
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

      {/* ── Portal: Toolbar into header slot ────────────────── */}
      {!isMyTickets && ReactDOM.createPortal(
        <div className="flex flex-col gap-2 w-full px-3 md:px-4 py-2">
          <div className="flex flex-wrap items-center gap-2 w-full">
            {/* Weekly Date Tabs Picker */}
            {activeTab === 'schedules' && (
              <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar py-0.5 max-w-xs md:max-w-md lg:max-w-xl">
                {weeklyTabs.map(tab => {
                  const isActive = dateFilter === tab.key
                  return (
                    <button
                      type="button"
                      key={tab.key}
                      onClick={() => handleDateFilterChange(tab.key)}
                      className="px-2 py-1 rounded-md text-[10px] font-semibold border whitespace-nowrap shrink-0 transition-colors"
                      style={{
                        backgroundColor: isActive ? green : 'transparent',
                        borderColor: isActive ? green : inputBorder,
                        color: isActive ? '#ffffff' : textMuted,
                      }}
                    >
                      {tab.dayName} {tab.dateLabel}
                    </button>
                  )
                })}

                {isCustomSelected && (
                  <button
                    type="button"
                    onClick={() => dateFilterInputRef.current?.showPicker?.()}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold border whitespace-nowrap shrink-0"
                    style={{ backgroundColor: green, borderColor: green, color: '#ffffff' }}
                  >
                    {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => dateFilterInputRef.current?.showPicker?.()}
                  className="flex items-center justify-center px-1.5 py-1 rounded-md border shrink-0"
                  style={{ borderColor: inputBorder, color: textMuted }}
                  title="Pick date"
                >
                  <CalendarDays className="w-3.5 h-3.5" style={{ color: green }} />
                </button>

                <input
                  ref={dateFilterInputRef}
                  type="date"
                  value={dateFilter}
                  onChange={e => handleDateFilterChange(e.target.value)}
                  tabIndex={-1}
                  className="absolute opacity-0 pointer-events-none w-0 h-0"
                  aria-label="Ticket date filter"
                />

                <button
                  type="button"
                  onClick={() => handleDateFilterChange('')}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold border whitespace-nowrap shrink-0 transition-colors"
                  style={{
                    backgroundColor: dateFilter === '' ? green : 'transparent',
                    borderColor: dateFilter === '' ? green : inputBorder,
                    color: dateFilter === '' ? '#ffffff' : textMuted,
                  }}
                >
                  All
                </button>
              </div>
            )}

            {/* Search bar */}
            {activeTab === 'schedules' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border flex-1 min-w-[120px] max-w-xs"
                   style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
                <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent outline-none text-xs flex-1 min-w-0"
                  style={{ color: textPrimary }}
                  onClick={e => e.stopPropagation()}
                />
                {searchQuery && (
                  <button type="button" onClick={e => { e.stopPropagation(); setSearchQuery('') }} style={{ color: textMuted }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Action Button: Add Schedule */}
            {activeTab === 'schedules' && canEdit && !isMyTickets && (
              <div className="relative shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAddMenuOpen(!addMenuOpen)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: green, color: '#ffffff' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Schedule
                  <ChevronDown className="w-3 h-3 opacity-80" />
                </button>

                {addMenuOpen && (
                  <div
                    className="absolute right-0 mt-1.5 rounded-xl shadow-xl overflow-hidden z-[100] w-48 border"
                    style={{ backgroundColor: cardBg, borderColor: border }}
                    onClick={() => setAddMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false)
                        openAddModal()
                      }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-slate-500/10"
                      style={{ color: textPrimary }}
                    >
                      <Plus className="w-3.5 h-3.5" style={{ color: green }} />
                      Manual Add
                    </button>
                    <button
                      type="button"
                      onClick={() => scanFileInputRef.current?.click()}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-slate-500/10"
                      style={{ color: textPrimary }}
                    >
                      <Camera className="w-3.5 h-3.5 text-emerald-500" />
                      Scan Schedule Sheet
                    </button>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-slate-500/10 disabled:opacity-50"
                      style={{ color: textPrimary }}
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-500" />
                      Import Excel
                    </button>
                    {canEdit && (
                      <>
                        <div className="h-px mx-2" style={{ backgroundColor: border }} />
                        <button
                          type="button"
                          onClick={() => {
                            setAddMenuOpen(false)
                            promptClearAllVisible()
                          }}
                          disabled={visible.length === 0 || saving}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-red-500/10 disabled:opacity-40"
                          style={{ color: '#EF4444' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Clear All Visible
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {/* Stats bar */}
      {!isMyTickets && activeTab === 'schedules' && (hasHydratedOnce || tickets.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 border-b text-xs shrink-0"
             style={{ backgroundColor: cardBg, borderColor: border }}>
          <span style={{ color: textMuted }} className="text-[10px] font-bold uppercase tracking-wide">Active</span>
          <div className="flex items-center gap-1">
            <span style={{ color: textMuted }}>Installation</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>{counts.installation}</span>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ color: textMuted }}>Survey</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>{counts.survey}</span>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ color: textMuted }}>Resched</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: '#d97706' }}>{counts.resched}</span>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ color: textMuted }}>For Approval</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981' }}>{counts.forApproval}</span>
          </div>
          {sortDiffersFromDefault && (
            <button
              type="button"
              onClick={() => setSortConfig(defaultSortForSchedulesView(isMyTickets))}
              className="ml-auto text-[10px] font-bold uppercase tracking-wide hover:underline"
              style={{ color: green }}
            >
              Reset sort
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {fetchError && activeTab === 'schedules' && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b text-xs font-semibold shrink-0"
             style={{ color: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)', borderColor: border }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />{fetchError}
          <button onClick={() => void fetchTickets({ soft: false })} className="ml-2 px-2 py-0.5 rounded text-white font-bold text-xs" style={{ backgroundColor: green }}>Retry</button>
        </div>
      )}

      {/* ── Table card ── */}
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
            {(syncing || loading) && !searchQuery && visible.length > 0 && (
              <div
                className="flex items-center justify-center gap-2 px-4 py-2 border-b shrink-0 animate-in fade-in duration-200"
                style={{
                  backgroundColor: isLight ? 'rgba(236,253,245,0.96)' : 'rgba(11,39,45,0.96)',
                  borderColor: isMyTickets ? myTicketsTheadBorder : schedTheadBorder,
                  color: green,
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
            <table key={dateFilter || 'all'} className="text-xs w-full" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
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
                        title={canSort ? 'Click to widen column · Use arrow to sort' : 'Click to widen column'}
                        style={{
                          padding: '11px 12px',
                          color: (col.isExpanded || isSorted)
                            ? (isLight ? '#16A34A' : '#4ADE80')
                            : (isMyTickets ? myTicketsTheadText : schedTheadText),
                          fontWeight: 700, whiteSpace: 'nowrap',
                          borderRight: `1px solid ${isMyTickets ? myTicketsTheadBorder : schedTheadBorder}`,
                          borderBottom: isMyTickets ? `1px solid ${myTicketsTheadBorder}` : `1px solid ${schedTheadBorder}`,
                          fontSize: '10px', letterSpacing: '0.08em',
                          width: col.w, minWidth: 0, maxWidth: col.w,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          backgroundColor: isMyTickets ? myTicketsTheadBg : schedTheadBg,
                          cursor: 'pointer',
                          userSelect: 'none',
                          transition: 'color 0.15s ease',
                          textAlign: col.align || 'left',
                          ...(col.sticky ? { position: 'sticky' as const, left: `${col.left}%`, zIndex: 15, boxShadow: `2px 0 0 ${isMyTickets ? myTicketsTheadBorder : schedTheadBorder}` } : {}),
                        }}>
                      <div className={`flex items-center gap-1 w-full ${
                        col.align === 'center' ? 'justify-center text-center' :
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
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={{ borderBottom: `1px solid ${tableBorder}`, padding: '40px 10px' }}>
                      <div className="flex flex-col items-center justify-center gap-3 py-6">
                        {(loading || syncing) && !searchQuery ? (
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
                    const bg       = isHovered && !isGhost ? rowHover : baseBg
                    const ghostAccent = rowColors.accent
                    const rowIsActive = columns.some(col =>
                      (editingCell?.ticketId === ticket.id && editingCell?.colLabel === col.label)
                      || (expandedCell?.ticketId === ticket.id && expandedCell?.colLabel === col.label),
                    )
                  return (
                    <tr key={`${ticket.id}${isGhost ? `-ghost-${ghostKind}` : ''}`}
                        style={{
                          borderBottom: `1px solid ${tableBorder}`,
                          boxShadow: ghostAccent ? `inset 3px 0 0 ${ghostAccent}` : undefined,
                          position: rowIsActive ? 'relative' : undefined,
                          zIndex: rowIsActive ? 80 : undefined,
                          height: rowIsActive ? undefined : TABLE_ROW_HEIGHT,
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
                        const isEditingCell = editingCell?.ticketId === ticket.id && editingCell?.colLabel === col.label
                        const isExpandedCell = expandedCell?.ticketId === ticket.id && expandedCell?.colLabel === col.label
                        const isStatusCol = col.label === 'STATUS'
                        const SKIP_EMPTY_HIGHLIGHT = new Set(['STATUS', 'INSTALLER', 'NOTE', 'UPDATE', 'PAYMENT', 'TICKET NO', 'FINAL DATE'])
                        const cellVal = getCellDisplay(ticket, col.label)
                        const isCellEmpty = !SKIP_EMPTY_HIGHLIGHT.has(col.label) && !isGhost && !isEditingCell && !cellVal.trim()
                        const emptyCellBg = isCellEmpty
                          ? (isLight ? 'rgba(251,146,60,0.13)' : 'rgba(251,146,60,0.18)')
                          : undefined
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
                                if (INLINE_EDIT_COLUMNS.has(col.label)) {
                                  startCellEdit(ticket, col.label)
                                }
                              }}
                              style={{
                                padding: isEditingCell ? '6px' : '0 12px',
                                color: isGhost ? textMuted : textPrimary,
                                fontSize: '11px', fontWeight: isGhost ? 500 : 500,
                                backgroundColor: emptyCellBg ?? bg,
                                borderRight: `1px solid ${tableBorder}`,
                                borderBottom: `1px solid ${tableBorder}`,
                                width: col.w,
                                minWidth: 0,
                                maxWidth: col.w,
                                height: isEditingCell ? 'auto' : TABLE_ROW_HEIGHT,
                                maxHeight: isEditingCell ? undefined : TABLE_ROW_HEIGHT,
                                overflow: 'visible',
                                textOverflow: 'ellipsis',
                                transition: 'background-color 0.1s ease',
                                cursor: canEdit && !isGhost && INLINE_EDIT_COLUMNS.has(col.label) ? 'text' : 'default',
                                verticalAlign: 'middle',
                                textAlign: col.align || 'left',
                                userSelect: isEditingCell ? 'text' : (canEdit && !isGhost ? 'none' : undefined),
                                WebkitUserSelect: isEditingCell ? 'text' : (canEdit && !isGhost ? 'none' : undefined),
                                ...(col.sticky
                                  ? { position: 'sticky' as const, left: `${col.left}%`, zIndex: (isEditingCell || isExpandedCell) ? 95 : 5, boxShadow: `2px 0 0 ${tableBorder}` }
                                  : { position: 'relative' as const, zIndex: (isEditingCell || isExpandedCell) ? (isEditingCell ? 90 : 85) : undefined }),
                              }}>
                            {isEditingCell ? (
                              renderCell(ticket, col, idx, isGhost, ghostKind, false)
                            ) : (
                              <div
                                className={`relative w-full h-full flex items-center ${
                                  col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''
                                }`}
                                style={{ minHeight: TABLE_ROW_HEIGHT - 2 }}
                              >
                                <div className={`min-w-0 overflow-hidden ${col.align === 'center' ? 'w-auto max-w-full' : 'w-full'}`}>
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
            </table>
          </div>
          </div>
        )) : (
          /* Render Overview Search Panel */
          <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden bg-white dark:bg-[#0a1120]">
            {/* Mobile Top Header (< md) */}
            <header className="flex md:hidden items-center justify-between w-full px-3 py-3 bg-white dark:bg-[#0a1120] border-b border-gray-200 dark:border-gray-800 shrink-0 safe-area-top">
              <button
                onClick={() => setSidebarOpen?.(true)}
                className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex flex-col items-center justify-center">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">OVERVIEW</span>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {isPortalAdmin(user?.role) && localStorage.getItem('ashcol-global-branch-id') ? (localStorage.getItem('ashcol-global-branch-id') === 'BR-TAGUIG-SERVICES' ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES') : 'TAGUIG - SALES'}
                </span>
              </div>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 transition-colors"
              >
                {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />}
              </button>
            </header>

            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-3 py-4 md:px-8 md:py-6 bg-transparent">
              <div className="max-w-4xl w-full mx-auto flex flex-col gap-4 md:gap-6 animate-in fade-in duration-200">
              
              {/* Header Section */}
              <div className="text-center md:text-center">
                <h2 className="text-lg md:text-xl font-black tracking-tight" style={{ color: textPrimary }}>
                  Portal Overview Search
                </h2>
                <p className="text-[11px] md:text-xs mt-1 leading-relaxed" style={{ color: textMuted }}>
                  Search by customer name, ticket #, control #, contact, or location — best matches appear first.
                </p>
              </div>

              {/* Search Input Box */}
              <div 
                className="sticky top-0 z-10 -mx-3 px-3 md:mx-0 md:px-0 pt-1 pb-3 md:pb-0 md:pt-0"
              >
                <div
                  className="flex items-center gap-2.5 md:gap-3 px-3.5 md:px-4 py-3 rounded-xl md:rounded-2xl shadow-sm border-2 transition-all duration-200"
                  style={{
                    backgroundColor: cardBg,
                    borderColor: overviewSearchFocused ? green : border,
                    boxShadow: overviewSearchFocused ? `0 0 0 3px ${green}15` : 'none'
                  }}
                >
                <Search className="w-4 h-4 shrink-0" style={{ color: green }} />
                <input
                  type="text"
                  placeholder="Search customer, ticket #, contact, location..."
                  value={overviewSearchInput}
                  onChange={e => setOverviewSearchInput(e.target.value)}
                  onFocus={() => setOverviewSearchFocused(true)}
                  onBlur={() => setOverviewSearchFocused(false)}
                  enterKeyHint="search"
                  autoComplete="off"
                  className="bg-transparent outline-none text-sm flex-1 min-w-0 font-medium"
                  style={{ color: textPrimary }}
                />
                {overviewSearchInput && (
                  <button 
                    type="button" 
                    onClick={() => { setOverviewSearchInput(''); setOverviewResults([]); }} 
                    style={{ color: textMuted }}
                    className="hover:scale-110 transition-transform"
                  >
                    <X className="w-4 h-4" />
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
                      const negotiatorLabel = getTicketNegotiatorName(ticket, branchEmployees) || '—';
                      const scheduleDateLabel = formatDisplayDate(getEffectiveScheduleDateKey(ticket), 'No Date');
                      
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
                                {branchLabel && branchLabel !== '—' && (
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
                              {negotiatorLabel !== '—' && (
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
                            <button
                              type="button"
                              onClick={() => openEditModal(ticket)}
                              className="w-full sm:w-auto px-3 py-2 sm:py-1 rounded-lg text-[11px] sm:text-[10px] font-bold text-white transition-opacity hover:opacity-90 active:opacity-80"
                              style={{ backgroundColor: green }}
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : overviewSearchInput.trim() ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertTriangle className="w-8 h-8 mb-2" style={{ color: textMuted }} />
                  <h3 className="font-bold text-xs" style={{ color: textPrimary }}>No results found</h3>
                  <p className="text-[11px] max-w-xs mt-1" style={{ color: textMuted }}>
                    We couldn't find any tickets matching "{overviewSearchInput}". Try another search term.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-80">
                  <Search className="w-10 h-10 mb-2" style={{ color: textMuted }} />
                  <h3 className="font-bold text-xs" style={{ color: textPrimary }}>Ready to Search</h3>
                  <p className="text-[11px] max-w-md mt-1" style={{ color: textMuted }}>
                    Start typing to search tickets by customer name, ticket/control number, technician, contact phone, or address.
                  </p>
                </div>
              )}

            </div>
          </div>
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
          <div ref={contextMenuRef} className="fixed z-[200]" style={{ top: topPos, left: leftPos }}
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

              {/* Delete — accessible by admin and non-admins */}
              {canEdit && (
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
        const updateColor = scheduleStatusValue === 'DONE_CLEANING' || scheduleStatusValue === 'DONE_CHECKUP'
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
              ) : value || '—'}
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
                    style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
                 
                 {/* Header Row 1 */}
                 <div className="flex items-center justify-between w-full">
                   <div className="min-w-0 flex-1 mr-4">
                     <div className="flex items-center gap-3 flex-wrap">
                       <h2 className="text-base font-black leading-tight uppercase tracking-wide" style={{ color: textPrimary }}>
                         {custName || 'Direct Client'}
                       </h2>
                       <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase" style={{
                         backgroundColor: scheduleBadgeStyle.backgroundColor,
                         color: scheduleBadgeStyle.color,
                         border: `1px solid ${scheduleBadgeStyle.borderColor || 'transparent'}`,
                       }}>
                         {scheduleStatusDisplay}
                       </span>
                       {branchName && branchName !== '—' && (
                         <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase" style={{
                           backgroundColor: inputBg,
                           color: textMuted,
                           border: `1px solid ${border}`,
                         }}>
                           {branchName}
                         </span>
                       )}
                       <span className="text-sm sm:text-base font-black font-mono tracking-wider uppercase" style={{ color: textPrimary }}>
                         TICKET NO: {t.ticketNumber || t.ticket_number || '—'}
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
                     <span className="font-semibold text-xs text-emerald-500 uppercase">{t.ticketCategory || t.ticket_category || '—'}</span>
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
                       {negotiatorName ? <EmployeeNameLink nameOrId={negotiatorName} /> : '—'}
                     </span>
                   </div>
                   <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                   <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Negotiator Number</span>
                      <span className="font-semibold text-xs animate-in fade-in duration-200" style={{ color: negotiatorPhone ? '#10B981' : textMuted }}>
                        {negotiatorPhone ? (
                          <a href={`tel:${negotiatorPhone.replace(/\D/g,'').replace(/^0/,'+63')}`} className="hover:underline">
                            {fmtPhone(negotiatorPhone) || negotiatorPhone}
                          </a>
                        ) : '—'}
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
                       <DField label="Contact" value={phone ? (fmtPhone(phone) || phone) : '—'} />
                       {!isMyTickets && (
                         <DField label="Address" value={addr} className="sm:col-span-2" />
                       )}
                       <DField label="District" value={district || resolveTicketDistrict(t) || '—'} className={isMyTickets ? "sm:col-span-2" : ""} />
                     </div>
                   </div>

                   {/* Grid 2: Service & Equipment Details */}
                   <div>
                     <SHead title="Service & Equipment Details" />
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                       <DField label="Ticket Category" value={t.ticketCategory || t.ticket_category || '—'} />
                       <DField label="Brand / Unit" value={brand || '—'} />
                       <DField label="Service / Driver" value={serviceDriver || '—'} />
                       <DField label={isTaguigServices ? "Technician" : "Installer / Technician"} value={installer || '—'} />
                       <DField label="Negotiator" value={negotiatorName ? <EmployeeNameLink nameOrId={negotiatorName} /> : '—'} />
                       <DField label={isTaguigServices ? "Endorsed By" : "Dealer (DLR)"} value={dealer || '—'} />
                       <DField label="Ticket No." value={t.ticketNumber || t.ticket_number || '—'} />
                       <DField label="Control No. / SI" value={t.controlNumber || t.control_number || '—'} />
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
                         <DField label="Mode of Payment" value={paymentMode || '—'} />
                         <DField label="Payment Amount" value={paymentAmt || '—'} green />
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
                      style={{ backgroundColor: isLight ? '#f8fafc' : '#070E1C' }}>
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
                 )}
               </div>

               {/* Footer Actions */}
               <div className="shrink-0 px-6 py-4 flex flex-col sm:flex-row justify-end gap-3"
                    style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
                 <button type="button" onClick={() => setShowHistoryPanel(prev => !prev)}
                   className="px-5 py-2 rounded-lg text-xs font-bold border transition-all hover:bg-slate-50 dark:hover:bg-slate-800 mr-auto flex items-center gap-1.5"
                   style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>
                   <Clock className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                   {showHistoryPanel ? 'Hide Update History' : 'View Update History'}
                 </button>
                 {canEdit && (
                   <button onClick={() => { handleDelete(t.id); setDetailTicket(null); setShowHistoryPanel(false) }}
                           className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-sm">
                     <Trash2 className="w-3.5 h-3.5 shrink-0" />
                     Delete Ticket
                   </button>
                 )}
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

      {/* ── Status Picker Modal ── */}
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
            setEditForm(prev => ({
              ...prev,
              status: value,
              rescheduleToDate: value === 'RESCHED'
                ? (prev.rescheduleToDate || prev.preferredDate || editOriginalDate || '')
                : '',
            }))
            return
          }
          const isClosing = ['DONE_INSTALLED', 'DONE_CLEANING', 'DONE_SURVEY', 'DONE_CHECKUP', 'COMPLETED', 'INSTALLED'].includes(value.toUpperCase())
          if (isClosing) {
            const missing = getEmptyRequiredColumnsForClose(pickerTicket, branchEmployees, activeBranchId)
            if (missing.length > 0) {
              alert(`Cannot close ticket because the following columns are empty:\n• ${missing.join('\n• ')}`)
              return
            }
          }
          if (value === 'RESCHED') {
            openReschedDialog(pickerTicket)
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
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}
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
                  { title: 'CLOSING', opts: SCHEDULE_CLOSING_OPTS },
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
                            style={{
                              backgroundColor: active ? (isLight ? '#f1f5f9' : '#1e293b') : 'transparent',
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
                                style={{ backgroundColor: style.color, borderColor: style.borderColor }}
                              />
                              <span
                                className="text-[11px] font-bold uppercase tracking-wide truncate"
                                style={{ color: active ? (isLight ? '#0f172a' : '#f8fafc') : textPrimary }}
                              >
                                {opt.label}
                              </span>
                            </span>
                            {active && (
                              <span className="text-[9px] font-black uppercase tracking-wider shrink-0" style={{ color: green }}>
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

      {/* ── Schedule row details (remarks + payment) ── */}
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
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}
              >
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>Schedule details</p>
                  <p className="text-[12px] font-bold truncate mt-0.5" style={{ color: textPrimary }} title={customerName}>
                    {customerName || '—'}
                  </p>
                  <span
                    className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border"
                    style={{ color: statusStyle.color, backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor }}
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
                      color: remarksText ? green : textMuted,
                      fontStyle: isGhost ? 'italic' : undefined,
                    }}
                  >
                    {remarksText || '—'}
                  </p>
                </div>
                <div style={{ borderTop: `1px solid ${border}` }} className="pt-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-1.5" style={{ color: textMuted }}>Payment</p>
                  {!paymentCombined ? (
                    <p className="text-[12px]" style={{ color: textMuted }}>—</p>
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
                          <span className="font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: textPrimary }}>₱{paymentAmount}</span>
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {canEdit && !isGhost ? (
                <div
                  className="px-3 py-2.5 flex items-center justify-end gap-2 shrink-0"
                  style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}
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

      {/* ── Final Date Picker Popup (My Tickets) ── */}
      {finalDatePicker && (() => {
        const { ticket, x, y, value, preferredDate } = finalDatePicker
        const todayKey = todayDateKey()
        const todayParts = todayKey.split('-').map(Number)
        const fallback = new Date(`${todayKey}T00:00:00`)
        const calYear = finalDateCalMonth?.year ?? fallback.getFullYear()
        const calMonth = finalDateCalMonth?.month ?? fallback.getMonth()
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
        const firstDow = new Date(calYear, calMonth, 1).getDay()
        const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
        const selLabel = value ? formatDateKeyLabel(value) : ''
        const preferredLabel = preferredDate ? formatDateKeyLabel(preferredDate) : ''
        const isPast = (yr: number, mo: number, d: number) => {
          if (yr < todayParts[0]) return true
          if (yr === todayParts[0] && mo < todayParts[1]) return true
          if (yr === todayParts[0] && mo === todayParts[1] && d < todayParts[2]) return true
          return false
        }
        const goMonth = (delta: number) => {
          const cur = new Date(calYear, calMonth, 1)
          cur.setMonth(cur.getMonth() + delta)
          setFinalDateCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
        }
        const atTodayMonth = calYear === todayParts[0] && calMonth === todayParts[1] - 1
        const pickDate = (dateKey: string) => {
          setFinalDatePicker(prev => (prev ? { ...prev, value: dateKey } : null))
        }
        const commitFinalDate = () => {
          if (!value.trim()) return
          const pickerTicket = ticket
          closeFinalDatePicker()
          void saveCellEdit(pickerTicket, 'FINAL DATE', value)
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
                  style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}
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
                    ‹
                  </button>
                  <span className="text-[11px] font-bold" style={{ color: textPrimary }}>{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => goMonth(1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                    style={{ color: textMuted }}
                  >
                    ›
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
                    const past = isPast(calYear, calMonth + 1, day)
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
                style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}
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
            <div className="shrink-0 border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
              <div className="px-5 sm:px-6 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-black text-base leading-tight" style={{ color: textPrimary }}>Add Schedule Ticket</h2>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: textMuted }}>
                      Branch: {activeBranchLabel || 'Select branch'} · Negotiators for this branch only
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
                      onChange={e => setAddForm({ ...addForm, customerName: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
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
                      onChange={e => setAddForm({ ...addForm, location: e.target.value })}
                      rows={2}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none w-full normal-case"
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
                    <input type="text" value={addForm.sourceVendor || ''}
                      onChange={e => setAddForm({ ...addForm, sourceVendor: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Service / Driver">
                    <input type="text" value={addForm.serviceDriver || ''}
                      list="add-ticket-driver-roster"
                      placeholder={activeBranchRoster.drivers.length ? 'Select or type driver…' : 'e.g. T3 (DOMINIC) - 1'}
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
                      placeholder={activeBranchRoster.installers.length ? 'Select or type installer…' : 'e.g. RYAN - 1'}
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
                      placeholder="Auto-generated if left blank (e.g. AS-01)"
                      onChange={e => setAddForm({ ...addForm, ticketNumber: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Control No. / SI (Aircon)">
                    <input type="text" value={addForm.controlNumber || ''}
                      placeholder="From import only — aircon papers / SI"
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
                    </select>
                  </Field>
                  <Field label="Payment Amount (₱)">
                    <input type="number" step="0.01" min="0"
                      placeholder="0.00"
                      value={addForm.installationCharges ?? ''}
                      disabled={addForm.modeOfPayment === 'FREE' || addForm.modeOfPayment === 'FREE INSTALL'}
                      onChange={e => setAddForm({ ...addForm, installationCharges: e.target.value ? Number(e.target.value) : undefined })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full disabled:opacity-60"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>
            </div>

            <div
              className="shrink-0 px-5 sm:px-6 py-3 flex items-center justify-end gap-2.5 border-t"
              style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}
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

      {editModalOpen && ReactDOM.createPortal((() => {
        const isReschedStatus = (editForm.status || '').toUpperCase() === 'RESCHED'
        const justChangedToResched = isReschedStatus && editInitialStatus.toUpperCase() !== 'RESCHED'
        const showPaymentSection = ticketHasPaymentInfo(editForm)
          || Boolean(editForm.modeOfPayment || editForm.installationCharges != null)
          || (editForm.status || '').toUpperCase() === 'INSTALLED'
          || (editForm.status || '').toUpperCase() === 'DONE_INSTALLED'
        const reschedFieldStyle = {
          backgroundColor: isLight ? '#fffbeb' : 'rgba(251,191,36,0.08)',
          border: `2px solid ${isLight ? '#fbbf24' : 'rgba(251,191,36,0.55)'}`,
          boxShadow: isLight ? '0 0 0 3px rgba(251,191,36,0.2)' : '0 0 0 3px rgba(251,191,36,0.15)',
        }

        const isOverviewEdit = activeTab === 'overview'

        return (
        <div className={`fixed inset-0 z-[9999] flex flex-col sm:items-center sm:justify-center sm:p-4 backdrop-blur-sm ${isOverviewEdit ? 'bg-white dark:bg-[#0a1120] sm:bg-slate-900/60' : 'bg-slate-900/60'}`}
             onClick={e => e.stopPropagation()}>
          <div className="w-full h-full sm:h-auto sm:max-w-3xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col sm:max-h-[90vh]"
               style={{ backgroundColor: cardBg, border: isOverviewEdit ? 'none' : `1px solid ${border}` }}
               onClick={e => e.stopPropagation()}
               onMouseDown={e => e.stopPropagation()}>
            <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between safe-area-top" style={{ borderBottom: `1px solid ${border}` }}>
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
                {editForm.branchId ? (
                  <p className="text-[10px] font-semibold mt-1" style={{ color: textMuted }}>
                    Branch: <span style={{ color: textPrimary }}>{formatAssignedBranchLabel(editForm.branchId)}</span>
                  </p>
                ) : null}
              </div>
              <button onClick={requestCloseEditModal} className="p-2 -mr-1 rounded-lg hover:bg-slate-200/20 active:bg-slate-200/30" style={{ color: textMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-4 sm:px-6 py-4 sm:py-6 overflow-y-auto flex-1 flex flex-col gap-5 sm:gap-6 min-h-0">
              <div
                className="rounded-xl p-4"
                style={{
                  border: `1px solid ${isLight ? 'rgba(22,163,74,0.28)' : 'rgba(74,222,128,0.25)'}`,
                  backgroundColor: isLight ? 'rgba(240,253,244,0.85)' : 'rgba(22,163,74,0.08)',
                }}
              >
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 text-emerald-600">
                  Branch & OIC Assignment
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Assigned Branch" required>
                    <select
                      value={editForm.branchId || ''}
                      onChange={e => {
                        const nextBranchId = resolveBranch(e.target.value)?.id || e.target.value
                        setEditForm(prev => ({
                          ...prev,
                          branchId: nextBranchId,
                          negotiatorId: '',
                        }))
                      }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                    >
                      <option value="">{branches.length ? 'Select branch...' : 'Loading branches...'}</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    {editForm.branchId ? (
                      <p className="text-[10px] font-semibold mt-1.5 leading-relaxed" style={{ color: textMuted }}>
                        Currently: {formatAssignedBranchLabel(editForm.branchId)}
                      </p>
                    ) : null}
                  </Field>
                  <Field label="OIC / Negotiator" required>
                    <select
                      value={editForm.negotiatorId || ''}
                      onChange={e => {
                        const val = e.target.value
                        const foundEmp = editModalNegotiators.find(emp => emp.id === val)
                        const negoBranchId = foundEmp?.branchId
                          ? (resolveBranch(foundEmp.branchId)?.id || foundEmp.branchId)
                          : editForm.branchId
                        setEditForm(prev => ({
                          ...prev,
                          negotiatorId: val,
                          branchId: negoBranchId || prev.branchId,
                        }))
                      }}
                      disabled={!editForm.branchId}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full disabled:opacity-50"
                      style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                    >
                      <option value="">{editForm.branchId ? 'Select negotiator' : 'Select branch first'}</option>
                      {editModalNegotiators.map(emp => (
                        <option key={emp.id} value={emp.id}>{formatNegotiatorLabel(emp)}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Customer Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!(editForm.status === 'SCHEDULED' || editForm.status === 'INSTALLATION' || editForm.status === 'RESCHED' || editOriginalDate) && (
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
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
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
                      list="edit-ticket-driver-roster"
                      placeholder={editModalRoster.drivers.length ? 'Select or type driver…' : 'e.g. T3 (DOMINIC) - 1'}
                      onChange={e => setEditForm({ ...editForm, serviceDriver: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    <datalist id="edit-ticket-driver-roster">
                      {editModalRoster.drivers.map(name => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={isTaguigServices ? 'Technician' : 'Installer / Technician'}>
                    <input type="text" value={editForm.installerName || ''}
                      list="edit-ticket-installer-roster"
                      placeholder={editModalRoster.installers.length ? 'Select or type installer…' : 'e.g. RYAN - 1'}
                      onChange={e => setEditForm({ ...editForm, installerName: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    <datalist id="edit-ticket-installer-roster">
                      {editModalRoster.installers.map(name => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Ticket No.">
                    <input type="text" value={editForm.ticketNumber || ''}
                      placeholder="e.g. AS-01"
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
                  <Field label="Final Schedule Date" full={isMyTickets || Boolean(editForm.finalDate || editOriginalDate)}>
                    <input
                      type="date"
                      value={editForm.finalDate || ''}
                      onChange={e => setEditForm({ ...editForm, finalDate: e.target.value, preferredDate: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full max-w-xs"
                      style={{
                        minWidth: '11rem',
                        backgroundColor: (isMyTickets || editForm.finalDate || editOriginalDate)
                          ? (isLight ? '#f0fdf4' : 'rgba(22,163,74,0.08)')
                          : inputBg,
                        border: `1px solid ${(isMyTickets || editForm.finalDate || editOriginalDate)
                          ? (isLight ? '#86efac' : 'rgba(22,163,74,0.35)')
                          : inputBorder}`,
                        color: textPrimary,
                        colorScheme: isLight ? 'light' : 'dark',
                      }}
                    />
                    {(isMyTickets || editForm.finalDate || editOriginalDate) && (
                      <p className="text-[10px] font-semibold mt-1.5 leading-relaxed" style={{ color: textMuted }}>
                        {isMyTickets
                          ? 'Set the install date here — once saved, this ticket moves to the Schedules tab.'
                          : 'Change the date or branch — the ticket appears on Schedules for that branch and date.'}
                      </p>
                    )}
                  </Field>
                  <div className={`grid grid-cols-1 gap-4 md:col-span-2 ${isReschedStatus ? 'md:grid-cols-2' : ''}`}>
                    <Field label="Status" required>
                      {(() => {
                        const statusVal = String(editForm.status || 'INSTALLATION').toUpperCase().replace(/\s+/g, '_')
                        const statusStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
                        const formTicket = (tickets.find(t => t.id === editForm.id) || { id: editForm.id || '', title: editForm.customerName || '' }) as Ticket
                        return (
                          <button
                            type="button"
                            onClick={e => openStatusPicker(formTicket, 'edit-form', e.currentTarget)}
                            className="w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition-all hover:opacity-95"
                            style={{
                              backgroundColor: statusStyle.backgroundColor,
                              border: `2px solid ${statusStyle.borderColor}`,
                              minHeight: 48,
                            }}
                          >
                            <span
                              className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border"
                              style={{ color: statusStyle.color, backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor }}
                            >
                              {getScheduleStatusLabel(statusVal)}
                            </span>
                            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: statusStyle.color }} />
                          </button>
                        )
                      })()}
                    </Field>
                    {isReschedStatus && (
                      <div className="flex flex-col gap-3">
                        <Field label="Reschedule To" required={!editForm.reschedulePending}>
                          <input
                            type="date"
                            autoFocus={justChangedToResched && !editForm.reschedulePending}
                            disabled={editForm.reschedulePending}
                            value={editForm.rescheduleToDate || ''}
                            onChange={e => setEditForm({
                              ...editForm,
                              rescheduleToDate: e.target.value,
                              reschedulePending: false,
                            })}
                            className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-400 w-full disabled:opacity-50"
                            style={reschedFieldStyle}
                          />
                        </Field>
                        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: textPrimary }}>
                          <input
                            type="checkbox"
                            checked={Boolean(editForm.reschedulePending)}
                            onChange={e => setEditForm({
                              ...editForm,
                              reschedulePending: e.target.checked,
                              rescheduleToDate: e.target.checked ? '' : (editForm.rescheduleToDate || editOriginalDate || ''),
                            })}
                            className="rounded border-slate-300"
                          />
                          Pending — no date slot available yet
                        </label>
                      </div>
                    )}
                  </div>
                  {isReschedStatus && editOriginalDate && (
                    <p className="text-[11px] font-semibold leading-relaxed md:col-span-2" style={{ color: isLight ? '#92400e' : '#fcd34d' }}>
                      {editForm.reschedulePending
                        ? `Stays on ${formatDateKeyLabel(editOriginalDate)} as rescheduled (pending new date).`
                        : editForm.rescheduleToDate && editForm.rescheduleToDate !== editOriginalDate
                          ? `Row will gray out on ${formatDateKeyLabel(editOriginalDate)} and appear on ${formatDateKeyLabel(editForm.rescheduleToDate)}.`
                          : `Currently on ${formatDateKeyLabel(editOriginalDate)} — pick a new date or mark as pending.`}
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
                        style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}>
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

            <div
              className={`shrink-0 px-4 sm:px-6 py-3 sm:py-4 flex gap-2.5 sm:gap-3 border-t safe-area-bottom ${isOverviewEdit ? 'flex-col-reverse sm:flex-row sm:items-center sm:justify-end' : 'flex-col-reverse sm:flex-row sm:items-center sm:justify-between'}`}
              style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}
            >
              {!isOverviewEdit && canEdit ? (
                <button
                  type="button"
                  onClick={() => { handleDelete(editForm.id!); setEditModalOpen(false) }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  Delete Ticket
                </button>
              ) : !isOverviewEdit ? <div className="hidden sm:block" /> : null}
              <div className={`flex gap-2.5 sm:gap-3 ${isOverviewEdit ? 'w-full sm:w-auto' : 'w-full sm:w-auto sm:ml-auto'}`}>
                <button
                  type="button"
                  onClick={requestCloseEditModal}
                  className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold border transition-colors"
                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={promptSaveEditTicket}
                  disabled={editSaving}
                  className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                  style={{ backgroundColor: green }}
                >
                  {editSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
        )
      })(), document.body)}

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
        const todayParts = todayKey.split('-').map(Number)
        const fallback = new Date(`${todayKey}T00:00:00`)
        const calYear = reschedCalMonth?.year ?? fallback.getFullYear()
        const calMonth = reschedCalMonth?.month ?? fallback.getMonth()
        const calKey = `resched-cal-${reschedDialog.ticket.id}`
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
        const firstDow = new Date(calYear, calMonth, 1).getDay()
        const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
        const selLabel = reschedToDate ? formatDateKeyLabel(reschedToDate) : ''
        const isPast = (y: number, m: number, d: number) => {
          if (y < todayParts[0]) return true
          if (y === todayParts[0] && m < todayParts[1]) return true
          if (y === todayParts[0] && m === todayParts[1] && d < todayParts[2]) return true
          return false
        }
        const goMonth = (delta: number) => {
          const cur = new Date(calYear, calMonth, 1)
          cur.setMonth(cur.getMonth() + delta)
          setReschedCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
        }
        // Prevent navigating back before the current month
        const atTodayMonth = calYear === todayParts[0] && calMonth === todayParts[1] - 1
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
                    ? ` · currently ${formatDateKeyLabel(getPreferredDateKey(reschedDialog.ticket))}`
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
                    ‹
                  </button>
                  <span className="text-xs font-bold" style={{ color: textPrimary }}>{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => goMonth(1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold"
                    style={{ color: textMuted, backgroundColor: 'transparent' }}
                  >
                    ›
                  </button>
                </div>

                {/* Day-of-week header */}
                <div className="grid grid-cols-7 mb-1">
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: textMuted }}>{d}</div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-y-0.5 mb-1">
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const past = isPast(calYear, calMonth + 1, day)
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
                    Pending — no date slot available yet
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
        const todayParts = todayKey.split('-').map(Number)
        const fallback = new Date(`${todayKey}T00:00:00`)
        const calYear = continuationCalMonth?.year ?? fallback.getFullYear()
        const calMonth = continuationCalMonth?.month ?? fallback.getMonth()
        const calKey = `continuation-cal-${continuationDialog.ticket.id}`
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
        const firstDow = new Date(calYear, calMonth, 1).getDay()
        const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

        const isPast = (y: number, m: number, d: number) => {
          if (y < todayParts[0]) return true
          if (y === todayParts[0] && m < todayParts[1]) return true
          if (y === todayParts[0] && m === todayParts[1] && d < todayParts[2]) return true
          return false
        }
        const goMonth = (delta: number) => {
          const cur = new Date(calYear, calMonth, 1)
          cur.setMonth(cur.getMonth() + delta)
          setContinuationCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
        }
        const atTodayMonth = calYear === todayParts[0] && calMonth === todayParts[1] - 1

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
              </div>

              {/* Selected Dates Badges */}
              <div className="px-4 py-2 bg-slate-500/5 border-b flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto" style={{ borderColor: border }}>
                {continuationSelectedDates.length === 0 ? (
                  <span className="text-[11px] text-slate-400 font-medium py-0.5">No continuation dates selected. Click on the calendar below to toggle dates.</span>
                ) : (
                  continuationSelectedDates.map(d => {
                    const label = new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
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
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-indigo-500/20 text-[9px] font-extrabold"
                        >
                          ×
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
                    onClick={() => !atTodayMonth && goMonth(-1)}
                    disabled={atTodayMonth}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors text-sm font-bold"
                    style={{ color: atTodayMonth ? (isLight ? '#cbd5e1' : '#2d3f5a') : textMuted, backgroundColor: 'transparent', cursor: atTodayMonth ? 'not-allowed' : 'pointer' }}
                  >
                    ‹
                  </button>
                  <span className="text-xs font-bold" style={{ color: textPrimary }}>{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => goMonth(1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold"
                    style={{ color: textMuted, backgroundColor: 'transparent' }}
                  >
                    ›
                  </button>
                </div>

                {/* Day-of-week header */}
                <div className="grid grid-cols-7 mb-1">
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: textMuted }}>{d}</div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-y-0.5 mb-1">
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const past = isPast(calYear, calMonth + 1, day)
                    const isToday = dKey === todayKey
                    const isSel = continuationSelectedDates.includes(dKey)
                    return (
                      <button
                        key={dKey}
                        type="button"
                        disabled={past}
                        onClick={() => toggleDate(dKey)}
                        className="relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-full transition-all"
                        style={{
                          color: isSel ? '#fff' : past ? (isLight ? '#cbd5e1' : '#2d3f5a') : isToday ? green : textPrimary,
                          backgroundColor: isSel ? '#4f46e5' : 'transparent',
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
        const isFree = promptMode === 'FREE' || promptMode === 'FREE INSTALL'
        const handleSubmit = (e: React.FormEvent) => {
          e.preventDefault()
          const amt = isFree ? 0 : parseFloat(promptAmount) || 0
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
                  <div className="p-3.5 rounded-xl border flex flex-col gap-1" style={{ backgroundColor: isLight ? '#f8fafc' : '#070d19', borderColor: border }}>
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
                      }}
                      required
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                    >
                      <option value="CASH">CASH</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
                      <option value="GCASH">GCASH</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="FREE INSTALL">FREE INSTALL</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Payment Amount (₱)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required={!isFree}
                      disabled={isFree}
                      placeholder="0.00"
                      value={promptAmount}
                      onChange={e => setPromptAmount(e.target.value)}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full disabled:opacity-60"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    />
                  </div>
                </div>

                <div className="px-6 py-4 flex justify-end gap-3 border-t" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
                  <button type="button" onClick={() => setPaymentPrompt(null)} className="px-4 py-2 rounded-xl text-xs font-bold border transition-all" style={{ borderColor: inputBorder, color: textMuted }}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-md"
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
