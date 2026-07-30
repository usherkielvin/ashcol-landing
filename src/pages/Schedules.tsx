import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import ReactDOM from 'react-dom'
import { ResponsiveTable, type ColumnDef as ResponsiveColumnDef } from '../components/ResponsiveTable'
import {
  Plus, Search, Trash2, X, Edit3, AlertTriangle, CalendarDays,
  Eye, ChevronDown, Loader2, Pencil, Clock, Car,
  ArrowUp, ArrowDown, ArrowUpDown, Copy, Maximize2, MapPin, Moon, Sun, Menu,
  UsersRound, SlidersHorizontal, CalendarRange,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, fetchTicketsPage, fetchTicketByNumber, formatFetchError, readApiError, parseCreatedTicketResponse, resolvePortalWriteBranchId, resolveTicketArchiveBranchId, resolveTicketScheduleBranchId, resolveScopedBranchId, branchScopesMatch, appendCurrentNegotiator, filterBranchNegotiators, isNegotiatorCandidate, isTaguigBranchRef, isTaguigServicesScope, isTaguigServiceTicket, parseGlobalBranchScope, isPortalAdmin, isCoordinatorOrOicUser, getActivePortalBranchId, EMPLOYEES_DIRECTORY_UPDATED_EVENT, PROFILE_UPDATED_EVENT, DEALERS_UPDATED_EVENT, notifyDealersUpdated, type InstallerBranchIndexEntry, type BranchStaffOption } from '../utils/api'
import { readTabCache, readTabCacheEntry, readSchedulesTabCache, isTabCacheFresh, SCHEDULES_CACHE_TTL_MS, schedulesCacheKey, writeSchedulesTabCache, getInitialSchedulesFromCache, markSchedulesSessionLoaded, isSchedulesSessionLoaded, type SchedulesTabCache, clearRelaysCache, clearWarrantyCache, TAB_CACHE_UPDATED, syncTicketAcrossTabCaches } from '../utils/ticketTabCache'
import { applyRelayScheduleSyncToPatch, mergeRelayScheduleTicketPatch, normalizeRelayScheduleTicket, normalizeRelayScheduleTicketList } from '../utils/relayScheduleSync'
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
import { normalizeRelayScheduleTicket, normalizeRelayScheduleTicketList } from '../utils/relayScheduleSync'
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
import { fetchCachedDriverOnlyNames, fetchCachedEmployees, fetchCachedLineupInstallerIndex, fetchCachedBranches } from '../utils/portalDirectoryCache'
import { resetTicketTableScroll } from '../utils/tabSwitch'
<<<<<<<< HEAD:src/pages/Schedules.tsx
import { notifyArchiveUpdated } from '../utils/ticketArchive'
========
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
import * as XLSX from 'xlsx'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import { SearchFilterDropdown } from '../components/SearchFilterDropdown'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import { SchedulesShowcase, type ScheduleShowcaseRow } from '../components/schedules/SchedulesShowcase'
import {
  FIELD_TICKET_CATEGORIES,
  categoryDefaultServiceType,
  inferCategoryFromTicket,
  isFieldCategory,
  type TicketCategoryValue,
} from '../constants/ticketCategories'
<<<<<<<< HEAD:src/pages/Schedules.tsx
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
  driverName?: string
  driver_name?: string
  /** Site/trip sequence for this installer on this day (1 = first site, 2 = second etc.) */
  tripNumber?: number
  trip_number?: number
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



const STATUS_OPTS = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'SCHEDULED', 'RESCHED', 'FOR_APPROVAL', 'SURVEY', 'INSTALLED', 'COMPLETED', 'CANCELLED']
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
  if (Object.prototype.hasOwnProperty.call(body, 'driverName')) {
    const dn = body.driverName
    const cleared = dn == null || dn === ''
    merged.driverName = cleared ? undefined : String(dn)
    merged.driver_name = merged.driverName
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
        baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.14)',
        accent: '#fbbf24',
      }
    }
    if (outcome === 'DONE_CHECKUP') {
      return {
        baseBg: isLight ? '#fef9c3' : 'rgba(251,191,36,0.14)',
        accent: '#fbbf24',
      }
    }
    if (outcome === 'DONE_BACKJOB') {
      return {
        baseBg: isLight ? '#dbeafe' : 'rgba(59,130,246,0.22)',
        accent: '#3B82F6',
      }
    }
    return {
      baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.2)',
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
      baseBg: isLight ? '#bbf7d0' : 'rgba(22,163,74,0.2)',
      accent: '#16A34A',
    }
  }

  if (outcome === 'DONE_SURVEY') {
    return {
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.1)',
      accent: '#fbbf24',
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
      baseBg: isLight ? '#fffbeb' : 'rgba(251,191,36,0.1)',
      accent: '#fbbf24',
    }
  }

  if (outcome === 'DONE_BACKJOB') {
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
  if (statusVal === 'CLEANING' || statusVal === 'CHECKUP' || statusVal === 'BACKJOB') {
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

/** Returns payment display text for a ticket. Blanks out for rescheduled ghosts. */
function getSchedulePaymentDisplay(
  ticket: Ticket,
  _dateKey?: string,
  ghostKind?: 'completed' | 'resched' | null,
): string {
  if (ghostKind === 'resched') return ''
  return formatCombinedPayment(ticket)
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

/** Vehicle code — serviceVehicle column only, never guessed/split from driverName. Blank means "+ Add". */
function getTicketVehicleDisplay(ticket: Ticket): string {
  return getF(ticket, 'serviceVehicle', 'service_vehicle')
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
    case 'VEHICLE': return getF(ticket, 'serviceVehicle', 'service_vehicle')
    case 'SERVICE': return myTickets ? formatRelayTicketTypeShort(ticket) : getF(ticket, 'driverName', 'driver_name')
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
  'FINAL DATE', 'SERVICE', 'VEHICLE', 'UPDATE', 'DESTINATION', 'NOTE',
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
    case 'PENDING': return { text: '#FB923C', bg: light ? '#fff7ed' : 'rgba(251,146,60,0.13)', b: 'rgba(251,146,60,0.4)' }
    case 'ASSIGNED': return { text: '#3B82F6', bg: light ? '#eff6ff' : 'rgba(59,130,246,0.13)', b: 'rgba(59,130,246,0.4)' }
    case 'ON_THE_WAY': return { text: '#06B6D4', bg: light ? '#ecfeff' : 'rgba(6,182,212,0.13)', b: 'rgba(6,182,212,0.4)' }
    case 'IN_PROGRESS': return { text: '#10B981', bg: light ? '#f0fdf4' : 'rgba(16,185,129,0.13)', b: 'rgba(16,185,129,0.4)' }
    case 'CANCELLED': return { text: '#EF4444', bg: light ? '#fef2f2' : 'rgba(239,68,68,0.10)', b: 'rgba(239,68,68,0.35)' }
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

function formatDateTriggerLabel(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${month}/${day}/${year}` : value || 'Select date'
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
  const acBase: Ticket = ticket

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
    case 'VEHICLE': {
      const vehicle = v.toUpperCase()
      body.serviceVehicle = vehicle || undefined
      body.acDetails = mergeAcMeta(acBase, {
        serviceVehicle: vehicle,
        service_vehicle: vehicle,
      })
      break
    }
    case 'SERVICE': {
      const driver = normalizeDriverInput(v)
      body.driverName = driver || undefined
      body.acDetails = mergeAcMeta(acBase, {
        driverName: driver,
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

export default function Schedules({ isMyTicketsProp }: { isMyTicketsProp?: boolean } = {}) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const location = useLocation()
  
  const isMyTickets = isMyTicketsProp || location.pathname === '/my-tickets'
  const isLight = theme === 'light'

  const [activeTab] = useState<'schedules'>('schedules')
========
import { SchedulesShowcase, type ScheduleShowcaseRow } from '../components/schedules/SchedulesShowcase'
import { VehicleTripLabel } from '../components/tickets/VehicleTripLabel'
import { Field } from '../components/tickets/Field'
import { TicketDetailsModal } from '../components/tickets/TicketDetailsModal'
import { TicketStatusPickerPopover } from '../components/tickets/TicketStatusPickerPopover'
import { TicketScheduleDetailsPopover } from '../components/tickets/TicketScheduleDetailsPopover'
import { TicketFinalDatePickerPopover } from '../components/tickets/TicketFinalDatePickerPopover'
import { AssignDriversModal } from '../components/tickets/AssignDriversModal'
import { ExcelImportResultsModal } from '../components/tickets/ExcelImportResultsModal'
import { CustomDatePickerModal } from '../components/tickets/CustomDatePickerModal'
import { ConfirmationChecklistModal } from '../components/tickets/ConfirmationChecklistModal'
import {
  CLOSING_SCHEDULE_STATUSES, INLINE_EDIT_COLUMNS, SCHEDULES_ACTIVE_DATE_KEY, SCHEDULE_CLOSING_OPTS,
  SCHEDULE_PENDING_OPTS, SCHEDULE_PENDING_STATUS_VALUES, TABLE_ROW_HEIGHT,
  applyImportFieldsFromRow, applyReturnToNegotiatorMyTicketsPatch, applyScheduleStatusPatch,
  buildArchiveServiceReportPayload, buildCellPatchBody, buildImportCreateRow, buildPatchImportBody,
  buildReschedulePatchBody, buildVehicleTripLabels, compareTicketsByColumn, computeSafePopoverPosition,
  currentWeekMondayDateKey, defaultSortForSchedulesView, enrichCompletePatchBody, filterOverviewSearchResults,
  fetchTicketById, findTicketInListByRef, fmtPhone, formatAddress, formatDateKeyLabel, formatDateToKey,
  formatDisplayDate, formatGhostRemarks, formatMonthFilterLabel, formatNegotiatorLabel, formatPaymentAmount,
  formatPaymentBreakdownText, formatRelayTicketTypeShort, formatServiceDriver, formatSimpleDateShort,
  getArchivedScheduleDate, getBranchDisplayName, getCellRawValue, getContinuationDates, getCustomerDisplayName,
  getEmptyRequiredColumnsForClose, getF, getFinalDateKey, getInstalledDateKey,
  getInstallerDisplay, getNextContinuationDate, getOverviewStatusBadge, getPaymentBreakdown, getPaymentMode,
  getPreferredDateKey, getScheduleGhostKind, getScheduleOutcome, getSchedulePaymentDisplay, getScheduleRowColors,
  getScheduleStatusBadgeStyle, getScheduleStatusDisplay, getScheduleStatusLabel, getScheduleStatusValue,
  getScheduleUpdateDisplay, getTicketCommitDisplay, getTicketDriverDisplay, getTicketDriverName,
  getTicketNegotiatorName, getTicketNumberDisplay, getTicketVehicleDisplay, importRowMatchesTicket,
  isCancelledScheduleGhost, isCancelledTicket, isCompletedGhostOnDate, isInstalledRemarks, isInstalledWorkflowStatus,
  isMovedToRescheduleRemark, isNoPaymentMode, isReschedulePending, isScheduleGhostOnDate, isTempTicketId,
  isTicketNotFoundError, isUnmatchedImportComplete, lookupTicketByNumberOnServer, mergeAcMeta, mergePatchBodies, mergeServerListWithLocalEdits,
  mergeTicketPatch, namesMatchLoosely, normalizeCustomerKey, normalizeImportPaymentMode, parseAcMeta, parseBrand,
  parseDistrict, parseImportMoney, parseNameSiteToken, parseServiceDriverValue,
  pathnameForSurface, postArchiveServiceReport, preserveLocalScheduleFields, promoteTempTicketState, qualifiesForInstallComplete,
  resolveFormScheduleDateKey, resolveInitialScheduleDate, resolveNegotiatorDisplayName, resolveNegotiatorName,
  resolveScheduleCompletionDateKey, resolveTicketDistrict, resolveTicketPayment, resolveTicketScheduleDateKey,
  sanitizeTicketPatchBody, shouldArchiveCompletedSchedule, shouldBlankReschedGhostPayment, shouldShowOnMyTickets,
  sortOverviewSearchResults, statusCode, statusColor, statusShowsScheduleDetails, stripArchivedRemarkSuffix,
  ticketBelongsOnScheduleBranch, ticketBelongsOnScheduleDate, ticketHadScheduleDate,
  ticketHasRescheduleMeta, ticketMatchesDateKey, ticketMatchesNegotiatorFilter, ticketMatchesOverviewQuery,
  todayDateKey, wantsTicketArchive,
  type Ticket,
  type TicketsSurface,
  type ImportUpdate,
  type ImportPaymentConfirmation,
  type ImportUnmatchedRow,
  type PaymentBreakdownEntry,
  type PendingTicketSave,
  type ScheduleOutcome,
} from '../utils/ticketHelpers'

export type { Ticket, TicketsSurface }
export {
  resolveTicketDistrict,
  getScheduleStatusDisplay,
  ticketBelongsOnScheduleDate,
  ticketBelongsOnScheduleBranch,
  getInstallerDisplay,
  getTicketDriverDisplay,
  getTicketVehicleDisplay,
  parseNameSiteToken,
  getTicketNegotiatorName,
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx

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

<<<<<<<< HEAD:src/pages/Schedules.tsx
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx


  // ── Bulk Assign modal state ─────────────────────────────────────────────────
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  // ── Showcase state ────────────────────────────────────────────────────────
  const [showcaseOpen, setShowcaseOpen] = useState(false)
  const [bulkAssignInstaller, setBulkAssignInstaller] = useState('')
  const [bulkAssignDriver, setBulkAssignDriver] = useState('')
  const [bulkAssignVehicle, setBulkAssignVehicle] = useState('')
  const [bulkAssignTrip, setBulkAssignTrip] = useState<string>('1')
  void bulkAssignTrip
  const [bulkAssignSaving, setBulkAssignSaving] = useState(false)



  const role = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'
  const isAdmin = isPortalAdmin(role)
  const isManager = role === 'manager'
  const isEmployee = ['employee', 'oic', 'staff'].includes(role)
  const canEdit = isAdmin || isManager || isEmployee

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Global branch ─────────────────────────────────────────────────────────
========
  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Color tokens (aligned with origin/main Schedules table) ───────────────
  const cardBg = isLight ? '#ffffff' : '#111827'
  const border = isLight ? '#cbd5e1' : '#334155'
  const tableBorder = isLight ? '#e2e8f0' : '#1a2d42'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg = isLight ? '#e8edf3' : '#0d1b2e'
  const myTicketsTheadBg = isLight ? '#DEF2E6' : '#0B2C30'
  const myTicketsTheadText = isLight ? '#14532D' : '#6EE7B7'
  const myTicketsTheadBorder = isLight ? 'rgba(22,163,74,0.42)' : 'rgba(74,222,128,0.35)'
  const schedTheadBg = isLight ? '#E3F4E9' : '#0B272D'
  const schedTheadText = isLight ? '#166534' : '#86EFAC'
  const schedTheadBorder = isLight ? 'rgba(22,163,74,0.38)' : 'rgba(74,222,128,0.28)'
  const rowEven = isLight ? '#ffffff' : '#111827'
  const rowOdd = isLight ? '#f7fbf8' : '#131f30'
  const rowHover = isLight ? '#edf7f1' : '#172438'
========
  // ─────────────────────────────────────────────────────────────
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const tableBorder = isLight ? '#e2e8f0' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const myTicketsTheadBg = isLight ? '#DEF2E6' : '#0a1f24'
  const myTicketsTheadText = isLight ? '#14532D' : '#34d399'
  const myTicketsTheadBorder = isLight ? 'rgba(22,163,74,0.42)' : '#0f3c33'
  const schedTheadBg = isLight ? '#E3F4E9' : '#0a1f24'
  const schedTheadText = isLight ? '#166534' : '#4ade80'
  const schedTheadBorder = isLight ? 'rgba(22,163,74,0.38)' : '#0f3c33'
  const rowEven = isLight ? '#ffffff' : '#0f172a'
  const rowOdd = isLight ? '#f7fbf8' : '#1b2330'
  const rowHover = isLight ? '#edf7f1' : '#222f44'
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  const green = '#16A34A'
  const textGreen = isLight ? '#16A34A' : '#4ade80'

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Data state ────────────────────────────────────────────────────────────
  const initialSchedulesRef = useRef<ReturnType<typeof getInitialSchedulesFromCache> | null>(null)
  if (!initialSchedulesRef.current) {
    const pathname = window.location.pathname
    const dateKey = pathname === '/my-tickets' ? '' : todayDateKey()
========
  // ─────────────────────────────────────────────────────────────
  const initialSchedulesRef = useRef<ReturnType<typeof getInitialSchedulesFromCache> | null>(null)
  if (!initialSchedulesRef.current) {
    const dateKey = resolveInitialScheduleDate(pathname)
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
  const [dateFilter, setDateFilter] = useState(() => resolveInitialScheduleDate(location.pathname))
  const dateFilterInputRef = useRef<HTMLInputElement>(null)
========
  const [dateFilter, setDateFilter] = useState(() => resolveInitialScheduleDate(pathname))
  // Live mirror of dateFilter — read this inside setState updaters / async callbacks so a stale
  // closure (e.g. a background save's applyTicketLocally that resolves after the date tab auto-jumped)
  // never writes the current on-screen rows into a *different* date's cache key.
  const dateFilterRef = useRef(dateFilter)
  dateFilterRef.current = dateFilter
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
  const pendingSavesRef = useRef(new Map<string, {
    body: Record<string, unknown>
    rollback: Ticket
    afterSave?: () => Promise<void>
  }>())
  const activeSavesRef = useRef(new Set<string>())
  /** Local optimistic tickets that must survive in-flight list refreshes until PATCH/POST settles. */
  const optimisticTicketsRef = useRef(new Map<string, Ticket>())
  /** Ticket ids removed in UI while DELETE runs (or until server list confirms absence). */
  const deletedTicketsRef = useRef(new Set<string>())
  /** Latest flushTicketSave — used by create/import paths defined earlier in the component. */
  const flushTicketSaveRef = useRef<(ticketId: string) => void>(() => { })

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
    // Month view populates `tickets` directly from its own fetch — the per-day/branch cache
    // underneath belongs to a different (single-day) query shape and must not overwrite it.
    if (monthViewActiveRef.current) return false
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
    setTickets(normalizeRelayScheduleTicketList(list))
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
    setLoading(false)
    setHasHydratedOnce(true)
    hasLoadedOnceRef.current = true
    const cacheKey = schedulesCacheKeyForTab()
    markSchedulesSessionLoaded(cacheKey)
    writeSchedulesTabCache(cacheKey, normalizeRelayScheduleTicketList(list), 'local')
    return true
<<<<<<<< HEAD:src/pages/Schedules.tsx
  }, [schedulesCacheKeyForTab])

  // Paint cached rows before first paint when switching branch/date — no loading screen flash.
  useLayoutEffect(() => {
    if (isMyTickets) return
    hydrateFromTabCache()
  }, [isMyTickets, hydrateFromTabCache, dateFilter, globalBranchId, user])

  // ── Weekly Tabs Calculation (Mon–Sun week, matches origin/main) ─────────
========
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

  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
    // Picking a specific day is an explicit "go back to normal Schedules" action.
    setMonthViewActive(false)
    setDateFilter(next)
    resetTicketTableScroll()
  }, [])

  useLayoutEffect(() => {
    resetTicketTableScroll()
  }, [dateFilter])

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
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
      setDateFilter(currentWeekMondayDateKey())
    }
  }, [isMyTickets, isTaguig])

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Context menu ──────────────────────────────────────────────────────────
========
  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── History state ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ── Manual Add Modal State ───────────────────────────────────────────────
========
  // ─────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Manual Edit Modal State ──────────────────────────────────────────────
========

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
  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Ticket> & { serviceDriver?: string; rescheduleToDate?: string; reschedulePending?: boolean; ticketCategory?: TicketCategoryValue; finalDate?: string; branchId?: string }>({})
  const [editFormSnapshot, setEditFormSnapshot] = useState('')
  const [editOriginalDate, setEditOriginalDate] = useState('')
  const [editInitialStatus, setEditInitialStatus] = useState('')

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

  // Drop negotiator if branch filter no longer includes them
  useEffect(() => {
    if (!addModalOpen || !addForm.negotiatorId) return
    if (!addModalNegotiators.some(n => n.id === addForm.negotiatorId)) {
      setAddForm(prev => ({ ...prev, negotiatorId: '' }))
    }
  }, [addModalOpen, addModalNegotiators, addForm.negotiatorId])

<<<<<<<< HEAD:src/pages/Schedules.tsx
========
  useEffect(() => {
    if (!editModalOpen || !editForm.negotiatorId) return
    // ─────────────────────────────────────────────────────────────
    if (editModalNegotiators.length === 0) return
    if (!editModalNegotiators.some(n => n.id === editForm.negotiatorId)) {
      setEditForm(prev => ({ ...prev, negotiatorId: '' }))
    }
  }, [editModalOpen, editModalNegotiators, editForm.negotiatorId])

>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  const [confirmModal, setConfirmModal] = useState<ConfirmDialogState | null>(null)
  const [reschedDialog, setReschedDialog] = useState<{ ticket: Ticket } | null>(null)
  const [reschedToDate, setReschedToDate] = useState('')
  const [reschedPending, setReschedPending] = useState(false)
  const [reschedCalMonth, setReschedCalMonth] = useState<{ year: number; month: number } | null>(null)
  const [reschedRemarks, setReschedRemarks] = useState('')
  const [customDatePickerOpen, setCustomDatePickerOpen] = useState(false)
  const [customDateCalMonth, setCustomDateCalMonth] = useState<{ year: number; month: number } | null>(null)

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Excel Import State ───────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanFileInputRef = useRef<HTMLInputElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  void addMenuOpen
========
  const [continuationDialog, setContinuationDialog] = useState<{ ticket: Ticket } | null>(null)
  const [continuationSelectedDates, setContinuationSelectedDates] = useState<string[]>([])
  const [continuationCalMonth, setContinuationCalMonth] = useState<{ year: number; month: number } | null>(null)

  // ─────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanFileInputRef = useRef<HTMLInputElement>(null)
  const [showcaseOpen, setShowcaseOpen] = useState(false)

  // ── Schedules "more filters" popup: whole-month + branch-negotiator view ──
  const [monthFilterModalOpen, setMonthFilterModalOpen] = useState(false)
  const [monthFilterMonth, setMonthFilterMonth] = useState(() => todayDateKey().slice(0, 7))
  const [monthFilterNegotiatorId, setMonthFilterNegotiatorId] = useState('')
  /** Specific SCHEDULE_STATUS_OPTS value (e.g. 'INSTALL', 'DONE_CLEANING'), or '' for all statuses. */
  const [monthFilterStatus, setMonthFilterStatus] = useState('')
  const [monthFilterLoading, setMonthFilterLoading] = useState(false)
  const [monthFilterError, setMonthFilterError] = useState('')
  /** True once "Apply" has populated the main table with a whole month's tickets instead of one day. */
  const [monthViewActive, setMonthViewActive] = useState(false)
  const monthViewActiveRef = useRef(false)
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  void importing
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

      setDateFilter(scheduledDate)
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
          // Swap temp → real id (carry any cell edits made while create was in flight)
========
          // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
    const form = {
      id: ticket.id,
      preferredDate: preferred,
      finalDate: getFinalDateKey(ticket) || preferred || '',
      customerName: ticket.customerName || ticket.customer_name || ticket.title || '',
      contactPhone: ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '',
      location: formatAddress(ticket.location),
      district: ticket.district || parseDistrict(ticket.location) || '',
      commitTerms: getTicketCommitDisplay(ticket),
      unitType: parseBrand(ticket) || ticket.unitType || ticket.unit_type || '',
      sourceVendor: ticket.sourceVendor || ticket.source_vendor || ticket.dealer || 'Direct',
      serviceDriver: isMyTickets ? formatRelayTicketTypeShort(ticket) : formatServiceDriver(ticket),
      installerName: getInstallerDisplay(ticket, branchEmployees, activeBranchId),
      negotiatorId: ticket.negotiatorId || ticket.negotiator_id || (isMyTickets && user?.id ? user.id : ''),
      branchId: ticket.branchId || ticket.branch_id || '',
      ticketNumber: ticket.ticketNumber || ticket.ticket_number || '',
      controlNumber: ticket.controlNumber || ticket.control_number || '',
      ticketCategory: inferCategoryFromTicket(ticket),
      status,
<<<<<<<< HEAD:src/pages/Schedules.tsx
      installationCharges: ticket.installationCharges ?? ticket.installation_charges,
      modeOfPayment: ticket.modeOfPayment ?? ticket.mode_of_payment,
      remarks: ticket.remarks || ticket.remarksUpdate || '',
========
      installationCharges: ticket.installationCharges ?? ticket.installation_charges ?? payment.amount,
      modeOfPayment: (ticket.modeOfPayment ?? ticket.mode_of_payment ?? payment.mode) || 'NO_PAYMENT',
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  void openAddModal

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
<<<<<<<< HEAD:src/pages/Schedules.tsx
    if (!editForm.negotiatorId) return 'Negotiator is required'
    if (!editForm.customerName?.trim()) return 'Customer Name is required'
    if (!editForm.contactPhone?.trim()) return 'Contact No. is required'
    if (!editForm.location?.trim()) return 'Destination/Address is required'
========
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

>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
    // Modal still has the row data — save by id even if the list no longer holds it.
========
    // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
    if (!editForm.id) return
    const isReschedStatusEarly = (editForm.status || '').toUpperCase() === 'RESCHED'
    const isReschedStatus = isReschedStatusEarly
    const scheduleVal = (editForm.status || 'SCHEDULED').toUpperCase().replace(/\s+/g, '_')
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
        ticketNumber: editForm.ticketNumber?.trim() || undefined,
        controlNumber: editForm.controlNumber?.trim() || undefined,
        remarks: remarksVal,
        remarksUpdate: remarksVal,
      }

      const selectedNegotiator = branchEmployees.find(emp => emp.id === editForm.negotiatorId)
      const explicitBranch = resolvePortalWriteBranchId(
        editForm.branchId,
        user?.email,
        user?.jobTitle,
      ) || (editForm.branchId || '').trim()
      if (explicitBranch) {
        body.branchId = explicitBranch
      } else if (selectedNegotiator) {
        const negoBranchRaw = (selectedNegotiator.branchId || '').trim()
        if (negoBranchRaw) {
          body.branchId = resolvePortalWriteBranchId(negoBranchRaw, selectedNegotiator.email, selectedNegotiator.jobTitle) || negoBranchRaw
        }
      }

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

<<<<<<<< HEAD:src/pages/Schedules.tsx
      const paymentCharges = editForm.installationCharges ?? originalTicket?.installationCharges ?? originalTicket?.installation_charges
      const paymentMode = editForm.modeOfPayment ?? originalTicket?.modeOfPayment ?? originalTicket?.mode_of_payment
      if (paymentCharges != null && !Number.isNaN(Number(paymentCharges))) {
        body.installationCharges = Number(paymentCharges)
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
      }

      if (finalDateKey && !isReschedStatus) {
        body.finalDate = finalDateKey
        body.preferredDate = finalDateKey
        const origStat = (originalTicket?.status || '').toUpperCase()
<<<<<<<< HEAD:src/pages/Schedules.tsx
        if (['PENDING', 'ASSIGNED'].includes(origStat) && !isDateMove && String(body.status || '').toUpperCase() !== 'COMPLETED') {
========
        const bodyStat = String(body.status || '').toUpperCase()
        if (
          !isReschedStatus
          && ['PENDING', 'ASSIGNED'].includes(origStat)
          && !isDateMove
          && bodyStat !== 'COMPLETED'
          && bodyStat !== 'CANCELLED'
        ) {
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
          body.status = 'SCHEDULED'
        }
      }

<<<<<<<< HEAD:src/pages/Schedules.tsx
========
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

      // Persist branch + date anchors for cancelled Schedules ghosts (survives reload).
      if (String(body.status || scheduleVal || '').toUpperCase() === 'CANCELLED') {
        const cancelBranch = resolveScopedBranchId(
          body.branchId || body.branch_id || activeForm.branchId || originalTicket?.branchId || originalTicket?.branch_id,
        )
        if (cancelBranch) {
          body.branchId = cancelBranch
          body.branch_id = cancelBranch
          acMetaExtras.cancelledBranchId = cancelBranch
        }
        const cancelDate = finalDateKey
          || oldDateKey
          || resolveTicketScheduleDateKey(originalTicket)
          || dateFilter
          || ''
        if (cancelDate) {
          body.finalDate = cancelDate
          body.preferredDate = cancelDate
          acMetaExtras.finalDate = cancelDate
          acMetaExtras.scheduledDate = cancelDate
          acMetaExtras.cancelledScheduleDate = cancelDate
        }
      }

      // A normal date move just updates finalDate/scheduledDate in place (set below) — no ghost
      // row or reschedule history is written for it anymore.
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
      // Leaving RESCHED for Installation/etc. — never re-apply ghost-date metadata
========
      // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

      if (['COMPLETED', 'DONE_DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'INSTALLED'].includes(String(body.status || '').toUpperCase())) {
        const outcome = (statusOutcome || String(statusAcMeta.scheduleOutcome || '') || (
          String(body.status || '').toUpperCase() === 'DONE_DISMANTLE' ? 'DONE_DISMANTLE'
            : String(body.status || '').toUpperCase() === 'DONE_SYSTEM_REPROCESS' ? 'DONE_SYSTEM_REPROCESS'
              : 'DONE_INSTALLED'
        )) as ScheduleOutcome
        body.scheduleOutcome = outcome
        body.acDetails = mergeAcMeta({ ...editForm, acDetails: body.acDetails } as Ticket, {
          scheduleOutcome: outcome,
          schedulePhase: '',
        })
      }

      const alreadyClosed = ['COMPLETED', 'INSTALLED', 'DONE_DISMANTLE', 'DONE_SYSTEM_REPROCESS']
        .includes((originalTicket?.status || '').toUpperCase())
      const shouldComplete = Boolean(
        originalTicket
        && !isReschedStatus
        && !isDateMove
        && !alreadyClosed
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

      queueTicketPatch(
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
      showToast('Saved — syncing in background')
    } catch (err: unknown) {
      console.error(err)
      alert(`Could not update ticket: ${formatFetchError(err)}`)
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
      const successCount = patchJobs.length
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Cell edit / expand ────────────────────────────────────────────────────
========
  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})
  const [editingCell, setEditingCell] = useState<{ ticketId: string; colLabel: string; value: string } | null>(null)
  const [statusPicker, setStatusPicker] = useState<{
    ticket: Ticket
    mode: 'inline' | 'edit-form'
    x: number
    y: number
  } | null>(null)
<<<<<<<< HEAD:src/pages/Schedules.tsx
  const [savingCellKey] = useState<string | null>(null)
========
  const [scheduleDetailsPopup, setScheduleDetailsPopup] = useState<{
    ticket: Ticket
    x: number
    y: number
    ghostKind?: 'completed' | 'resched' | 'cancelled' | null
  } | null>(null)
  const [checklistTicket, setChecklistTicket] = useState<Ticket | null>(null)
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  const cellEditBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cellEditDraftRef = useRef<{ ticketId: string; colLabel: string; value: string } | null>(null)
  const saveCellEditRef = useRef<(ticket: Ticket, colLabel: string, value: string, injectedPayment?: { amount: number; modeOfPayment: string }) => void>(() => { })
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
      const popover = tableScrollRef.current?.querySelector('[data-expanded-popover="true"]')
      if (popover?.contains(target)) return
      const cell = tableScrollRef.current?.querySelector(
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



  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Column config ─────────────────────────────────────────────────────────
========
  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  const columns = useMemo(() => {
    const scheduleCols = [
      { label: 'TICKET NO', display: 'TICKET NO', weight: 9, expMul: 1.2, sticky: true, freeze: false, align: 'center' as const },
      // Month view spans many days, so surface the date up front — reuses the same
      // already-editable 'FINAL DATE' column My Tickets has, just conditionally shown here too.
      ...(monthViewActive
        ? [{ label: 'FINAL DATE', display: 'DATE', weight: 9, expMul: 1.2, sticky: false, freeze: false, align: 'center' as const }]
        : []),
      { label: "CUSTOMER'S NAME", display: "CUSTOMER", weight: 15, expMul: 1.5, sticky: true, freeze: false, align: 'left' as const },
      { label: 'DESTINATION', display: 'DISTRICT', weight: 8, expMul: 1.5, sticky: true, freeze: true, align: 'center' as const, sortable: true },
      { label: 'BRAND', display: "BRAND", weight: 11, expMul: 1.5, sticky: false, freeze: false, align: 'center' as const },
      { label: 'DLR', display: isTaguigServices ? "ENDORSED BY" : "DEALER", weight: 10, expMul: 1.4, sticky: false, freeze: false, align: 'center' as const },
      { label: 'COMMIT', display: "COMMIT", weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'INSTALLER', display: isTaguigServices ? "TECHNICIAN" : "INSTALLER", weight: 10, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'NEGOTIATOR', display: 'NEGOTIATOR', weight: 8, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
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
      { label: 'FINAL DATE', display: 'FINAL DATE', weight: 10, expMul: 1.3, sticky: false, freeze: false, align: 'center' as const },
      { label: 'NEGOTIATOR', display: 'NEGOTIATOR', weight: 10, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const, sortable: true },
      { label: 'SERVICE', display: 'TYPE', weight: 8, editHint: true, expMul: 1.25, sticky: false, freeze: false, align: 'center' as const },
      { label: 'STATUS', display: 'STATUS', weight: 12, expMul: 1.25, sticky: false, freeze: false, align: 'center' as const },
      { label: 'UPDATE', display: 'REMARKS', weight: 13, expMul: 1.5, sticky: false, freeze: false, align: 'right' as const },
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
  }, [expandedCols, isTaguigServices, isMyTickets, monthViewActive])

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Fetch ─────────────────────────────────────────────────────────────────
========
  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  const token = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  /** Negotiators assigned to the Active Branch — populates the month-filter popup's dropdown. */
  const monthFilterNegotiatorOptions = useMemo(
    () => negotiatorsForBranch(activeBranchId),
    [negotiatorsForBranch, activeBranchId],
  )

  // Drop the selected negotiator if Active Branch changes and they're no longer listed.
  useEffect(() => {
    if (!monthFilterNegotiatorId) return
    if (monthFilterNegotiatorOptions.some(n => n.id === monthFilterNegotiatorId)) return
    setMonthFilterNegotiatorId('')
  }, [monthFilterNegotiatorId, monthFilterNegotiatorOptions])

  /** Whole-month ticket lookup for the Active Branch — populates the *same* `tickets` state and
   * table the single-day view uses (see `monthViewActive` branches in `filtered`/`visible`
   * below), rather than a separate report view, so editing/columns/sorting all keep working.
   * Negotiator narrows further via the existing `filtered` memo, same as My Tickets does. */
  const runMonthFilterQuery = useCallback(async () => {
    if (!monthFilterMonth) return
    setMonthFilterLoading(true)
    setMonthFilterError('')
    try {
      const auth = token()
      const scheduleBranchId = activeBranchId && activeBranchId !== 'ALL_BRANCHES'
        ? resolveScopedBranchId(activeBranchId)
        : undefined
      const raw = await fetchTicketsPage('/tickets/branch', auth, {
        size: 200,
        paginate: true,
        maxPages: 10,
        month: monthFilterMonth,
        ...(scheduleBranchId ? { branchId: scheduleBranchId } : {}),
      })
      let list = normalizeRelayScheduleTicketList(raw as Ticket[])
      if (activeBranchId && activeBranchId !== 'ALL_BRANCHES') {
        list = list.filter(t => ticketBelongsOnScheduleBranch(
          t, activeBranchId, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
        ))
      }
      monthViewActiveRef.current = true
      setTickets(list)
      setMonthViewActive(true)
      setMonthFilterModalOpen(false)
    } catch (e) {
      setMonthFilterError(formatFetchError(e))
    } finally {
      setMonthFilterLoading(false)
    }
  }, [monthFilterMonth, activeBranchId, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames, token])

  // Switching Active Branch while month view is showing another branch's data would be
  // misleading — exit back to the normal single-day view instead of silently keeping stale rows.
  const prevActiveBranchForMonthViewRef = useRef(activeBranchId)
  useEffect(() => {
    const changed = prevActiveBranchForMonthViewRef.current !== activeBranchId
    prevActiveBranchForMonthViewRef.current = activeBranchId
    if (changed && monthViewActive) setMonthViewActive(false)
  }, [activeBranchId, monthViewActive])

  const fetchTickets = useCallback(async (options?: { soft?: boolean; force?: boolean; quiet?: boolean }) => {
    if (!user) return
    // Month view owns `tickets` while active — the normal per-day/branch fetch must not stomp it.
    if (monthViewActiveRef.current) return
    const seq = ++fetchSeqRef.current
    const cacheKey = schedulesCacheKeyForTab()
    const cached = readTabCache<SchedulesTabCache>(cacheKey)
    const cacheEntry = readTabCacheEntry<SchedulesTabCache>(cacheKey)
    const cacheAt = cacheEntry?.data.lastSyncAt ?? cacheEntry?.savedAt
    const cacheFresh = cacheAt ? isTabCacheFresh(cacheAt, SCHEDULES_CACHE_TTL_MS) : false
    const hasCache = Array.isArray(cached?.tickets)
    const sessionLoaded = isSchedulesSessionLoaded(cacheKey)
    const showSkeleton = !options?.soft && !hasLoadedOnceRef.current && !hasCache && !sessionLoaded

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
        if (!serverIds.has(id) && !deleted.has(id)) merged.unshift(local)
      }
      return merged
    }

    // Never soft-skip on an empty cache — that pins a blank Schedules day for up to 24h
    // after a failed/bootstrapping fetch (e.g. backend restart), even once rows exist in DB.
    const cachedCount = Array.isArray(cached?.tickets) ? cached!.tickets!.length : 0
    if (options?.soft && !options?.force && cacheFresh && hasCache && cachedCount > 0) {
      setTickets(applyOptimisticOverlay(cached!.tickets as Ticket[]))
      hasLoadedOnceRef.current = true
      setHasHydratedOnce(true)
      setLoading(false)
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
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
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
      }
    }
<<<<<<<< HEAD:src/pages/Schedules.tsx
  }, [user, isCustomer, isAdmin, isMyTickets, globalBranchId, dateFilter, token, schedulesCacheKeyForTab])
========
  }, [user, isCustomer, isAdmin, isMyTickets, globalBranchId, dateFilter, activeBranchId, token, schedulesCacheKeyForTab, installerLineupIndex, driverOnlyNames])

  // Keep the ref in sync for the guarded fetch/hydrate callbacks above (they read the ref, not
  // the state, so they see the change immediately — no stale-closure risk). On the true→false
  // transition (user exits month view), kick a real refetch to restore the current day's data,
  // since the guarded effects were silently no-op-ing the whole time month view was active.
  const monthViewWasActiveRef = useRef(false)
  useEffect(() => {
    monthViewActiveRef.current = monthViewActive
    if (monthViewWasActiveRef.current && !monthViewActive) {
      void fetchTickets({ soft: false, force: true })
    }
    monthViewWasActiveRef.current = monthViewActive
  }, [monthViewActive, fetchTickets])

  const schedulesDateFetchMountedRef = useRef(false)
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx

  useEffect(() => {
    const hadCache = hydrateFromTabCache()
    void fetchTickets({ soft: hadCache || hasLoadedOnceRef.current, force: !hadCache, quiet: true })
  }, [fetchTickets, globalBranchId, user, isCustomer, isAdmin, isMyTickets, hydrateFromTabCache])

  useEffect(() => {
    if (!hasLoadedOnceRef.current || isMyTickets) return
    const hadCache = hydrateFromTabCache()
    void fetchTickets({ soft: true, quiet: true, force: !hadCache })
  }, [dateFilter, fetchTickets, isMyTickets, hydrateFromTabCache])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && hasLoadedOnceRef.current) {
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
    fetchCachedEmployees(authToken)
      .then((list) => {
        const mapped: BranchStaffOption[] = list.map((u) => ({
          id: String(u.id || ''),
          name: String(u.name || ''),
          branchId: (u.branchId || u.branch_id) as string | undefined,
          email: u.email as string | undefined,
          role: (u.role as string | undefined),
          jobTitle: (u.jobTitle || u.job_title) as string | undefined,
        })).filter((u) => u.id && u.name)
        setBranchEmployees(mapped)
      })
      .catch(err => console.error('Failed to load branch employees:', err))
  }, [canEdit, token])

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

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
========
  // ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const effectiveBranch = activeBranchId

    // Month view: `tickets` already IS the whole month for this branch (see runMonthFilterQuery)
    // — skip the single-day date scoping entirely and just apply negotiator + search on top.
    if (!isMyTickets && monthViewActive) {
      let list = tickets.filter(t => isFieldCategory(inferCategoryFromTicket(t)))
      if (monthFilterNegotiatorId) {
        list = list.filter(t => ticketMatchesNegotiatorFilter(t, monthFilterNegotiatorId))
      }
      if (monthFilterStatus === 'PENDING_GROUP') {
        list = list.filter(t => SCHEDULE_PENDING_STATUS_VALUES.has(getScheduleStatusValue(t)))
      } else if (monthFilterStatus === 'CLOSING_GROUP') {
        list = list.filter(t => CLOSING_SCHEDULE_STATUSES.has(getScheduleStatusValue(t)))
      } else if (monthFilterStatus) {
        list = list.filter(t => getScheduleStatusValue(t) === monthFilterStatus)
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
    }

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

>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
    let list = tickets.filter(t => {
      const stat = (t.status || '').toUpperCase()
      // Cancelled tickets stay off the negotiator's My Tickets queue (shouldShowOnMyTickets
      // below also excludes them), but they should still surface on Schedules as a muted ghost
      // row on their scheduled date instead of vanishing outright.
      if (stat === 'CANCELLED' && isMyTickets) return false
      if (stat === 'CANCELLED' && dateFilter && isCancelledScheduleGhost(t, dateFilter)) return true

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
        if (isAdmin) {
          if (myTicketsNegotiatorFilter && !ticketMatchesNegotiatorFilter(t, myTicketsNegotiatorFilter)) return false
        } else if (user?.id && !ticketMatchesNegotiatorFilter(t, user.id)) {
          return false
        }
        return true
      }

      if (!isFieldCategory(inferCategoryFromTicket(t))) return false

      if (isInstalledWorkflowStatus(stat)) {
        return Boolean(dateFilter && isCompletedGhostOnDate(t, dateFilter))
      }

      const hasFinalDate = Boolean(getFinalDateKey(t))
<<<<<<<< HEAD:src/pages/Schedules.tsx
========
      const hasScheduleDate = hasFinalDate
        || Boolean(getPreferredDateKey(t))
        || Boolean(String(parseAcMeta(t).scheduledDate || '').trim())
        || getContinuationDates(t).length > 0
      const isScheduledOrActive = [
        'SCHEDULED', 'RESCHED', 'IN_PROGRESS', 'ON_THE_WAY', 'FOR_APPROVAL', 'SURVEY', 'CONTINUATION',
        'SYSTEM_REPROCESS', 'DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'DONE_DISMANTLE',
      ].includes(stat)
      if (!hasScheduleDate && !isScheduledOrActive) return false
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx

      const scheduleValue = getScheduleStatusValue(t)
      const isResched = stat === 'RESCHED' || scheduleValue === 'RESCHED'
      const isForApproval = stat === 'FOR APPROVAL' || stat === 'FOR_APPROVAL' || stat === 'FOR QUOTATION' || stat === 'FOR_QUOTATION' || stat.includes('QUOTATION') || scheduleValue === 'FOR_APPROVAL'
      const isSurvey = scheduleValue === 'SURVEY' || scheduleValue === 'DONE_SURVEY'
      const isCleaning = scheduleValue === 'CLEANING' || scheduleValue === 'DONE_CLEANING'
<<<<<<<< HEAD:src/pages/Schedules.tsx
      const isInstallation = scheduleValue === 'INSTALLATION' || scheduleValue === 'SERVICES' || scheduleValue === 'DONE_INSTALLED' || scheduleValue === 'DONE_CHECKUP'
      const isActiveSchedule = ['SCHEDULED', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_THE_WAY'].includes(stat) || hasFinalDate

      return isInstallation || isCleaning || isResched || isForApproval || isSurvey || isActiveSchedule
========
      const isSystemReprocess = scheduleValue === 'SYSTEM_REPROCESS' || scheduleValue === 'DONE_SYSTEM_REPROCESS'
      const isDismantle = scheduleValue === 'DISMANTLE' || scheduleValue === 'DONE_DISMANTLE'
      const isInstallation = scheduleValue === 'INSTALLATION' || scheduleValue === 'SERVICES' || scheduleValue === 'DONE_INSTALLED' || scheduleValue === 'DONE_CHECKUP' || scheduleValue === 'DONE_BACKJOB'
      const isActiveSchedule = ['SCHEDULED', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_THE_WAY'].includes(stat) || hasScheduleDate

      return isInstallation || isCleaning || isSystemReprocess || isDismantle || isResched || isContinuation || isForApproval || isSurvey || isActiveSchedule
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
    })
    if (!isMyTickets) {
      const effectiveBranch = isAdmin ? globalBranchId : user?.branchId
      if (effectiveBranch && effectiveBranch !== 'ALL_BRANCHES') {
<<<<<<<< HEAD:src/pages/Schedules.tsx
        list = list.filter(t => {
          const b = resolveTicketScheduleBranchId(t, installerLineupIndex, driverOnlyNames)
          // If no branch can be resolved (no installer assigned yet), show the ticket —
          // it's a newly scheduled ticket waiting to be assigned.
          if (!b) return true
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
      list = list.filter(t => ticketMatchesDateKey(t, dateFilter) || isScheduleGhostOnDate(t, dateFilter))
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
  }, [tickets, isAdmin, isMyTickets, globalBranchId, dateFilter, searchQuery, user?.id, user?.email, user?.branchId, installerLineupIndex, driverOnlyNames, branchEmployees])
========
  }, [tickets, isMyTickets, activeBranchId, dateFilter, searchQuery, user?.id, user?.email, user?.branchId, user?.jobTitle, installerLineupIndex, driverOnlyNames, isAdmin, myTicketsNegotiatorFilter, branchEmployees, isBranchMatch, monthViewActive, monthFilterNegotiatorId, monthFilterStatus])

  // Auto-numbered vehicle trip labels ("STRADA - 1", "STRADA - 2") for the current filtered set —
  // the vehicle is now the dispatch unit, so staff never type a manual "- N" suffix into the
  // Driver or Vehicle fields; the trip number is derived from assignment order instead.
  const vehicleTripLabels = useMemo(() => buildVehicleTripLabels(filtered), [filtered])
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx

  const visible = useMemo(() => {
    let list = filtered
    const cmpOpts = { myTickets: isMyTickets, employees: branchEmployees, branchId: activeBranchId, vehicleTripLabels }
    // Month view spans many days — vehicle/driver grouping (built for one day's dispatch lineup)
    // doesn't apply across dates, so sort chronologically by schedule date instead.
    if (!isMyTickets && monthViewActive) {
      return [...list].sort((a, b) => {
        const cmp = getFinalDateKey(a).localeCompare(getFinalDateKey(b))
        if (cmp !== 0) return cmp
        return compareTicketsByColumn(a, b, 'TICKET NO', cmpOpts)
      })
    }
    list = [...list].sort((a, b) => {
<<<<<<<< HEAD:src/pages/Schedules.tsx
      // Schedules: sort Driver ASC → Installer ASC → Trip Number ASC
      if (!isMyTickets) {
        // 1. Driver name
        const drvA = (a.driverName || a.driver_name || '').toUpperCase().trim()
        const drvB = (b.driverName || b.driver_name || '').toUpperCase().trim()
        // Rows with no driver sink to the bottom
        if (drvA !== drvB) {
          if (!drvA && drvB) return 1
          if (drvA && !drvB) return -1
          const drvCmp = drvA.localeCompare(drvB)
          if (drvCmp !== 0) {
            const desc = sortConfig.column === 'SERVICE' && sortConfig.direction === 'desc'
            return desc ? -drvCmp : drvCmp
          }
        }
        // 2. Installer name
        const byInstaller = compareTicketsByColumn(a, b, 'INSTALLER', cmpOpts)
        if (byInstaller !== 0) {
          const desc = sortConfig.column === 'INSTALLER' && sortConfig.direction === 'desc'
          return desc ? -byInstaller : byInstaller
        }
        // 3. Trip number
        const tripA = a.tripNumber ?? a.trip_number ?? 1
        const tripB = b.tripNumber ?? b.trip_number ?? 1
        if (tripA !== tripB) return tripA - tripB
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
  }, [filtered, sortConfig, isMyTickets, branchEmployees, activeBranchId, vehicleTripLabels, monthViewActive])

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

  // ── Showcase data ──────────────────────────────────────────────────────────
  const showcaseDateLabel = useMemo(
    () => (dateFilter ? formatDateKeyLabel(dateFilter) : 'All Dates'),
    [dateFilter],
  )

  const showcaseRows = useMemo<ScheduleShowcaseRow[]>(() => {
    if (isMyTickets) return []
<<<<<<<< HEAD:src/pages/Schedules.tsx
========
    // Mirror exactly what the schedules grid shows (all visible rows, including ghosts).
    // INSTALLER / DRIVER (SERVICE column): name only — never trip "- N" suffixes.
    // VEHICLE (exported as service): use the same auto trip labels as the table.
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
        contact: getF(live, 'contactPhone', 'contact_phone', 'customerPhone', 'customer_phone', 'phone', 'contactNumber', 'contact_number', 'mobile', 'mobileNumber', 'mobile_number') || '',
        brand: parseBrand(live),
        dealer: getF(live, 'dealer', 'sourceVendor', 'source_vendor') || '',
        status: getScheduleStatusLabel(getScheduleStatusValue(live)),
        commit: getTicketCommitDisplay(live),
        installer: parseNameSiteToken(installerRaw).label || installerRaw,
        negotiator: getTicketNegotiatorName(live, branchEmployees) || '',
        update: getScheduleUpdateDisplay(live),
        payment: getSchedulePaymentDisplay(live, dateFilter, dateFilter ? getScheduleGhostKind(live, dateFilter) : null),
<<<<<<<< HEAD:src/pages/Schedules.tsx
        driver: getF(live, 'driverName', 'driver_name') || getTicketDriverName(live) || '',
        service: getTicketVehicleDisplay(live) || '',
========
        driver: parseNameSiteToken(driverRaw).label || driverRaw,
        service: vehicleTrip,
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Get display value for a column ────────────────────────────────────────
  function getCellDisplay(ticket: Ticket, colLabel: string): string {
    switch (colLabel) {
      case 'TICKET NO': return getTicketNumberDisplay(ticket)
      case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title
      case 'DESTINATION': return resolveTicketDistrict(ticket)
      case 'DISTRICT': return parseDistrict(ticket.location, ticket.district)
      case 'CONTACT NO.': return getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
      case 'BRAND': return parseBrand(ticket)
      case 'DLR': return getF(ticket, 'sourceVendor', 'source_vendor', 'dealer') || ''
      case 'STATUS': return getScheduleStatusLabel(getScheduleStatusValue(ticket))
      case 'SCHEDULED DATE': return formatDateKeyLabel(getArchivedScheduleDate(ticket))
      case 'INSTALLED DATE': return formatDateKeyLabel(getInstalledDateKey(ticket))
      case 'FINAL DATE': return formatDateKeyLabel(getFinalDateKey(ticket))
      case 'PAYMENT': return formatCombinedPayment(ticket)
      case 'MOP': return getPaymentMode(ticket)
      case 'COMMIT': return getF(ticket, 'commitType', 'commitTerms', 'description')
      case 'INSTALLER': return getInstallerDisplay(ticket, branchEmployees, activeBranchId)
      case 'NEGOTIATOR': return getTicketNegotiatorName(ticket, branchEmployees)
      case 'NOTE': return ticket.note || ''
      case 'VEHICLE': return getF(ticket, 'serviceVehicle', 'service_vehicle')
      case 'SERVICE': return isMyTickets ? formatRelayTicketTypeShort(ticket) : getF(ticket, 'driverName', 'driver_name')
      case 'UPDATE': return getScheduleUpdateDisplay(ticket)
      default: return ''
    }
========
  // ─────────────────────────────────────────────────────────────
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
        case 'COMMIT': return getTicketCommitDisplay(ticket)
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
  const startCellEdit = (ticket: Ticket, colLabel: string) => {
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
    setExpandedCell(null)
    if (colLabel === 'STATUS') {
      openStatusPicker(ticket)
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
    if (!isMyTickets) {
      const prevDate = prevTicket ? resolveTicketScheduleDateKey(prevTicket) : ''
      const nextDate = resolveTicketScheduleDateKey(normalized)
      if (nextDate && nextDate !== prevDate) {
        setDateFilter(nextDate)
========
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
      const prevOnDate = Boolean(
        liveDateFilter
        && prevTicket
        && (
          ticketMatchesDateKey(prevTicket, liveDateFilter)
          || resolveTicketScheduleDateKey(prevTicket) === liveDateFilter
          || isScheduleGhostOnDate(prevTicket, liveDateFilter)
        ),
      )
      // Cancelled must remain a red ghost on the date it was cancelled from — never drop the row
      // just because date fields briefly lag the status flip.
      const cancelledStayOnDate = Boolean(
        liveDateFilter
        && isCancelledTicket(normalized)
        && (isCancelledScheduleGhost(normalized, liveDateFilter) || prevOnDate),
      )
      const showOnCurrentFilter = !liveDateFilter
        || ticketMatchesDateKey(normalized, liveDateFilter)
        || isScheduleGhostOnDate(normalized, liveDateFilter)
        || cancelledStayOnDate

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
          || (isCancelledTicket(normalized) && (
            isCancelledScheduleGhost(normalized, prevDate) || prevDate === resolveTicketScheduleDateKey(prevTicket || normalized)
          ))
        patchCacheForDate(prevDate, list => {
          const without = list.filter(t => t.id !== ticketId)
          return stillGhostOnPrevDate ? [normalized, ...without] : without
        })
      }
      // Cancelled tickets always stay on their schedule date cache (the date they were on when cancelled).
      const cancelAnchorDate = isCancelledTicket(normalized)
        ? (nextDate || prevDate || dateFilterRef.current || '')
        : ''
      if (cancelAnchorDate && isCancelledTicket(normalized)) {
        patchCacheForDate(cancelAnchorDate, list => {
          const without = list.filter(t => t.id !== ticketId)
          return [normalized, ...without]
        })
      } else if (nextDate) {
        patchCacheForDate(nextDate, list => {
          const without = list.filter(t => t.id !== ticketId)
          return [normalized, ...without]
        })
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
    setDetailTicket(prev => (prev?.id === ticketId ? { ...prev, ...normalized } : prev))
    syncTicketAcrossTabCaches(normalized)
  }, [tickets, user, globalBranchId, isCustomer, isAdmin, isMyTickets, schedulesCacheKeyForTab])

  const restoreTicketLocally = useCallback((ticketId: string, rollback: Ticket) => {
    optimisticTicketsRef.current.delete(ticketId)
    setTickets(prev => {
      const next = prev.map(t => (t.id === ticketId ? rollback : t))
      const cacheKey = schedulesCacheKeyForTab()
      writeSchedulesTabCache(cacheKey, next, 'local')
      return next
    })
    setDetailTicket(prev => (prev?.id === ticketId ? { ...prev, ...rollback } : prev))
  }, [user, globalBranchId, isCustomer, isAdmin, isMyTickets, schedulesCacheKeyForTab])

  const flushTicketSave = useCallback(async (ticketId: string) => {
<<<<<<<< HEAD:src/pages/Schedules.tsx
    // Never PATCH optimistic temp ids — edits stay queued until promoteTempTicketState.
========
    // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
    if (isTempTicketId(ticketId)) return
    if (activeSavesRef.current.has(ticketId)) return
    activeSavesRef.current.add(ticketId)
    try {
      while (pendingSavesRef.current.has(ticketId)) {
        const job = pendingSavesRef.current.get(ticketId)!
        pendingSavesRef.current.delete(ticketId)
        const payload = sanitizeTicketPatchBody(job.body)
        try {
          const auth = token()
          if (!auth) throw new Error('Not signed in — refresh and try again')
          const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth}`,
            },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(await readApiError(res))
          const savedPayload = await res.json().catch(() => null)
          const savedTicket = parseCreatedTicketResponse(savedPayload) as Ticket | null
          if (savedTicket?.id) {
            const base = optimisticTicketsRef.current.get(ticketId)
              || tickets.find(t => t.id === ticketId)
            if (base) {
              const mergedSaved = mergeTicketPatch(base, savedTicket as unknown as Record<string, unknown>)
              optimisticTicketsRef.current.set(ticketId, mergedSaved)
              setTickets(prev => prev.map(t => (t.id === ticketId ? mergedSaved : t)))
              syncTicketAcrossTabCaches(mergedSaved)
            }
          }
          console.log('[Schedules] Saved to database', {
            ticketId,
            status: payload.status,
            scheduleOutcome: payload.scheduleOutcome,
            ticketCategory: payload.ticketCategory,
            serviceType: payload.serviceType,
          })
          // Keep local ticket in optimisticTicketsRef until a list fetch confirms it on the server
          // so refreshes (e.g. cache TTL) do not wipe the row from the UI.
          clearRelaysCache()
          clearWarrantyCache()
          void fetchTickets({ soft: true, force: true, quiet: true })
          if (job.afterSave) await job.afterSave()
        } catch (err: unknown) {
          console.error('[Schedules] Background save FAILED', ticketId, payload, err)
          // A newer edit may already be queued — retry that without wiping UI
          if (pendingSavesRef.current.has(ticketId)) {
            continue
          }
          restoreTicketLocally(ticketId, job.rollback)
          alert(`Could not save ticket: ${formatFetchError(err)}`)
          break
        }
      }
    } finally {
      activeSavesRef.current.delete(ticketId)
      if (pendingSavesRef.current.has(ticketId)) {
        void flushTicketSave(ticketId)
      }
    }
  }, [restoreTicketLocally, token, fetchTickets, tickets])
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
    let patchBody = body
    // Cancelling from Schedules must permanently anchor the row to this date so it stays as a
    // red ghost after save/reload — never rely on a fleeting finalDate that sync might drop.
    if (String(body.status || '').toUpperCase() === 'CANCELLED') {
      const liveDate = (dateFilterRef.current || '').split('T')[0].split(' ')[0].trim()
      const cancelDate = liveDate
        || getFinalDateKey(baseTicket)
        || getPreferredDateKey(baseTicket)
        || resolveTicketScheduleDateKey(baseTicket)
      if (cancelDate) {
        const cancelBranch = resolveScopedBranchId(baseTicket.branchId || baseTicket.branch_id)
        patchBody = {
          ...body,
          finalDate: cancelDate,
          preferredDate: cancelDate,
          ...(cancelBranch ? { branchId: cancelBranch } : {}),
          acDetails: mergeAcMeta(baseTicket, {
            ...(typeof body.acDetails === 'string' ? parseAcMeta({ acDetails: body.acDetails } as Ticket) : {}),
            finalDate: cancelDate,
            scheduledDate: cancelDate,
            cancelledScheduleDate: cancelDate,
            ...(cancelBranch ? { cancelledBranchId: cancelBranch } : {}),
          }),
        }
      }
    }
    const mergedBody = sanitizeTicketPatchBody(
      existing ? mergePatchBodies(existing.body, patchBody) : patchBody,
    )
    const nextTicket = mergeTicketPatch(baseTicket, mergedBody)
    pendingSavesRef.current.set(ticketId, {
      body: mergedBody,
      rollback: existing?.rollback ?? ticket,
      afterSave: afterSave ?? existing?.afterSave,
    })
    applyTicketLocally(ticketId, nextTicket)
<<<<<<<< HEAD:src/pages/Schedules.tsx
    // Temp rows are not on the server yet — flush after create promotes to a real id.
========
    // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
    if (!isTempTicketId(ticketId)) {
      void flushTicketSave(ticketId)
    }
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
    injectedPayment?: { amount: number; modeOfPayment: string }
  ) => {
    const key = cellEditKey(ticket.id, colLabel)
    if (savingCellKey === key) return

    const normalizedStatus = value.toUpperCase().replace(/\s+/g, '_')
    const body = buildCellPatchBody(ticket, colLabel, value, branchEmployees)
    if (Object.keys(body).length === 0) {
      cancelEdit()
      setStatusPicker(null)
      return
    }

    if (injectedPayment) {
      body.modeOfPayment = injectedPayment.modeOfPayment
      body.installationCharges = injectedPayment.amount
    }

<<<<<<<< HEAD:src/pages/Schedules.tsx
    // Remarks always save in-cell — never open a payment popup.
========
    // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
    let finalBody: Record<string, unknown> = body
    const schedKey = resolveScheduleCompletionDateKey(ticket, dateFilter)
    const remarkText = colLabel === 'UPDATE'
      ? stripArchivedRemarkSuffix(value.trim())
      : ''
    if (colLabel === 'UPDATE' && isInstalledRemarks(remarkText)) {
      finalBody = enrichCompletePatchBody(body, ticket, schedKey)
    } else if (
      (body.status as string | undefined)?.toUpperCase() === 'COMPLETED'
      || (body.status as string | undefined)?.toUpperCase() === 'INSTALLED'
      || (body.status as string | undefined)?.toUpperCase() === 'DONE_DISMANTLE'
      || (body.status as string | undefined)?.toUpperCase() === 'DONE_SYSTEM_REPROCESS'
    ) {
      finalBody = enrichCompletePatchBody(body, ticket, schedKey)
    }

    cancelEdit()
    setStatusPicker(null)

    // After marking DONE INSTALL / DONE CLEANING / DONE DISMANTLE, put the caret in REMARKS.
    const focusRemarksAfterStatus = colLabel === 'STATUS'
      && (normalizedStatus === 'DONE_INSTALLED' || normalizedStatus === 'DONE_CLEANING' || normalizedStatus === 'DONE_DISMANTLE')

    const shouldArchive = shouldArchiveCompletedSchedule(ticket, finalBody)
      || (
        colLabel === 'UPDATE'
        && isInstalledRemarks(stripArchivedRemarkSuffix(value.trim()))
        && (String(finalBody.status || '').toUpperCase() === 'COMPLETED' || String(finalBody.status || '').toUpperCase() === 'INSTALLED')
      )

    const archiveBody = finalBody
    queueTicketPatch(
      ticket,
      finalBody,
      shouldArchive
        ? async () => {
          const branchId = resolveTicketArchiveBranch(ticket, {
            installerName: body.installerName as string | undefined,
            installationCharges: archiveBody.installationCharges as number | undefined,
            modeOfPayment: archiveBody.modeOfPayment as string | undefined,
            remarks: archiveBody.remarksUpdate as string | undefined,
            remarksUpdate: archiveBody.remarksUpdate as string | undefined,
          })
          const archivePayload = buildArchiveServiceReportPayload(
            ticket,
            branchId,
            {
              installationCharges: archiveBody.installationCharges as number | undefined,
              modeOfPayment: archiveBody.modeOfPayment as string | undefined,
              remarks: archiveBody.remarksUpdate as string | undefined,
              remarksUpdate: archiveBody.remarksUpdate as string | undefined,
              negotiatorName: resolveNegotiatorName(ticket, branchEmployees),
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
      const nextTicket = mergeTicketPatch(ticket, finalBody)
      requestAnimationFrame(() => startCellEdit(nextTicket, 'UPDATE'))
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
    if (cellEditBlurTimer.current) clearTimeout(cellEditBlurTimer.current)
    cancelEdit()
    const preferred = getPreferredDateKey(ticket)
    const meta = parseAcMeta(ticket)
    const existingTarget = typeof meta.rescheduledTo === 'string' ? meta.rescheduledTo.split('T')[0].trim() : ''
    const initDate = isReschedulePending(ticket) ? '' : (existingTarget || preferred || dateFilter || todayDateKey())
    setReschedDialog({ ticket })
    setReschedToDate(initDate)
    setReschedPending(isReschedulePending(ticket))
    setReschedRemarks('')
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
    setReschedRemarks('')
  }

  const commitInlineReschedule = async () => {
    if (!reschedDialog) return
    const { ticket } = reschedDialog
    if (!reschedPending && !reschedToDate.trim()) {
      alert('Pick a new date or mark as Pending if no slot is available yet.')
      return
    }
    const cleanRemarks = reschedRemarks.trim()
    if (!cleanRemarks) {
      alert('Please enter a reason/remarks why this ticket is being rescheduled.')
      return
    }

    const body = buildReschedulePatchBody(ticket, {
      newDateKey: reschedPending ? null : reschedToDate,
      pending: reschedPending,
      remarks: cleanRemarks,
    })
    if (Object.keys(body).length === 0) {
      alert('Could not build reschedule update.')
      return
    }

    closeReschedDialog()
    queueTicketPatch(ticket, body)
  }

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Delete — remove row instantly, DELETE in background ───────────────────
========
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

  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
    // Temp rows are not on the server yet — local remove is enough.
========
    // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  void promptClearAllVisible

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

<<<<<<<< HEAD:src/pages/Schedules.tsx
  function renderInlineCellEditor(ticket: Ticket, colLabel: string, rowGhost?: boolean) {
    if (!editingCell || editingCell.ticketId !== ticket.id || editingCell.colLabel !== colLabel || rowGhost) return null
========
  function renderInlineCellEditor(ticket: Ticket, colLabel: string, rowIndex: number | undefined, rowGhost?: boolean) {
    // Resched ghosts are the one ghost kind where remarks stay editable — a single shared
    // remarksUpdate field, not per-date state, so editing it from the ghost row is safe.
    const isReschedRemarksGhost = Boolean(rowGhost) && colLabel === 'UPDATE'
      && getScheduleGhostKind(ticket, dateFilter) === 'resched'
    if (!editingCell || editingCell.ticketId !== ticket.id || editingCell.colLabel !== colLabel
      || (rowGhost && !isReschedRemarksGhost)) return null
    if (rowIndex != null && editingCell.rowIndex !== rowIndex) return null
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx

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
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Enter always saves inline edits (including COMMIT / DESTINATION / REMARKS textareas).
        // Shift+Enter still inserts a newline in multiline fields.
        e.preventDefault()
        commit()
      }
    }

    if (colLabel === 'STATUS') {
      // Status uses the dedicated popup picker instead of an inline select.
      return null
    }

    if (colLabel === 'FINAL DATE') {
      return wrapEditingCell(
        <input
          autoFocus
          disabled={isSaving}
          type="date"
          value={editingCell.value}
          onChange={e => syncDraftValue(e.target.value)}
          onBlur={onBlur}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className="w-full rounded-md outline-none"
          style={{ ...inputStyle, minWidth: '10rem', colorScheme: isLight ? 'light' : 'dark' }}
        />,
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
          onChange={e => syncDraftValue(colLabel === 'UPDATE' ? e.target.value.toUpperCase() : e.target.value)}
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
          className="w-full resize-y rounded-md outline-none"
          style={{ ...inputStyle, minHeight: 52, maxHeight: 110 }}
          placeholder={colLabel === 'UPDATE' ? 'Type remarks…' : undefined}
========
          className={`w-full resize-y rounded-md outline-none ${colLabel === 'UPDATE' ? 'uppercase' : ''}`}
          style={{ ...inputStyle, minHeight: 52, maxHeight: 110, textTransform: colLabel === 'UPDATE' ? 'uppercase' : undefined }}
          placeholder={colLabel === 'UPDATE' ? 'Type remarks\u2026' : undefined}
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
  ) {
    if (!canEdit || rowGhost) return content
    const isEditing = editingCell?.ticketId === ticket.id && editingCell?.colLabel === colLabel
========
    rowIndex?: number,
    allowGhostEdit?: boolean,
  ) {
    if (!canEdit || (rowGhost && !allowGhostEdit)) return content
    const isEditing = editingCell?.ticketId === ticket.id
      && editingCell?.colLabel === colLabel
      && (rowIndex === undefined || editingCell.rowIndex === rowIndex)
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

  function renderCell(ticket: Ticket, col: (typeof columns)[0], idx?: number, rowGhost?: boolean, ghostKind?: 'completed' | 'resched' | 'cancelled' | null, cellExpanded = false) {
    const { label } = col

    const inlineEditor = renderInlineCellEditor(ticket, label, rowGhost)
    if (inlineEditor) return inlineEditor

<<<<<<<< HEAD:src/pages/Schedules.tsx
    // ── DISPLAY STATE ──
========
    // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
          return (
            <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#15803d' : '#86efac' }} title="Installed — see Archives tab">
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
      const badgeStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
      const display = getScheduleStatusDisplay(ticket) || '—'
      const displayLabel = display === 'INSTALLATION' ? 'INSTALL' : (display === 'FOR APPROVAL' ? 'APPROVAL' : display)
      return (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-normal border cursor-pointer select-none"
          style={{ color: badgeStyle.color, backgroundColor: badgeStyle.backgroundColor, borderColor: badgeStyle.borderColor, maxWidth: '100%' }}
          title={canEdit ? `${display} — CLICK TO CHANGE` : display}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLabel}</span>
          {canEdit && <ChevronDown className="w-2.5 h-2.5 shrink-0 opacity-70" />}
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
        </span>
      )
    }

    if (label === 'TICKET NO') {
<<<<<<<< HEAD:src/pages/Schedules.tsx
      const prefix = idx !== undefined ? `${idx + 1}. ` : ''
      const displayVal = val ? `${prefix}${val}` : `${prefix}—`
      return withEditPencil(
        <span style={{ ...truncStyle, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }} title={displayVal}>
          {displayVal}
        </span>,
        ticket, label, rowGhost,
========
      const rawVal = val || EMPTY_CELL
      const isRowSaving = savingTicketIds.has(ticket.id)
      return (
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
        </div>
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
      )
    }

    if (label === 'FINAL DATE') {
      const hasDate = Boolean(val)
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

    if (label === 'VEHICLE') {
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 600, color: val ? (isLight ? '#0369a1' : '#7dd3fc') : textMuted }} title={val}>
          {val || '—'}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'SERVICE') {
<<<<<<<< HEAD:src/pages/Schedules.tsx
========
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
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all hover:opacity-80"
            style={{
              color: isLight ? '#16a34a' : '#86efac',
              backgroundColor: isLight ? 'rgba(22,163,74,0.08)' : 'rgba(148,163,184,0.08)',
              border: `1px dashed ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(148,163,184,0.28)'}`,
            }}
          >
            + Add
          </button>
        )
      }
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 500 }} title={val}>
          {val || '—'}
        </span>,
<<<<<<<< HEAD:src/pages/Schedules.tsx
        ticket, label, rowGhost,
========
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
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all hover:opacity-80"
            style={{
              color: isLight ? '#2563eb' : '#93c5fd',
              backgroundColor: isLight ? 'rgba(37,99,235,0.08)' : 'rgba(148,163,184,0.08)',
              border: `1px dashed ${isLight ? 'rgba(37,99,235,0.35)' : 'rgba(148,163,184,0.28)'}`,
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
      if (rowGhost) {
        const ghostRemarks = formatGhostRemarks(ticket, ghostKind ?? null, dateFilter)
        const isCompletedGhost = ghostKind === 'completed' || isCompletedGhostOnDate(ticket, dateFilter)
        const ghostRemarkColor = isCompletedGhost
          ? (isLight ? '#15803d' : '#86efac')
          : ghostKind === 'cancelled' ? (isLight ? '#dc2626' : '#f87171') : (isLight ? '#a16207' : '#fbbf24')
        const ghostSpan = (
          <span
            style={{
              ...truncStyle,
              color: ghostRemarkColor,
              fontWeight: 600,
              fontStyle: 'italic',
            }}
            title={ghostRemarks}
          >
            {ghostRemarks || '—'}
          </span>
        )
        // Resched ghosts alone stay editable — the old date row is still a legitimate place to
        // leave a remark (e.g. why it moved), and remarksUpdate is one shared field, not
        // per-date, so there's no per-ghost state to keep in sync.
        if (ghostKind === 'resched') {
          return withEditPencil(ghostSpan, ticket, label, rowGhost, rowIndex, true)
        }
        return ghostSpan
      }
      return withEditPencil(
        <span style={{ ...truncStyle, color: val ? textGreen : textMuted, fontWeight: val ? 600 : 400 }}
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
      if (!combined) {
        return <span style={{ ...truncStyle, color: textMuted }}>—</span>
========
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
      if (!combined || combined === '0') {
        return <span style={{ ...truncStyle, fontWeight: 700, color: textMuted }} title="0">0</span>
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
        <span style={{ ...truncStyle, fontWeight: 600 }} title={val}>{val}</span>,
        ticket, label, rowGhost,
========
        <span style={{ ...truncStyle, fontWeight: 600 }} title={val}>
          {val}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'COMMIT') {
      const commitVal = (val || '').trim()
      if (!commitVal && canEdit && !isMyTickets && !rowGhost) {
        return (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={e => {
              e.stopPropagation()
              const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
              startCellEdit(ticket, label, cell, rowIndex)
            }}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all hover:opacity-80"
            style={{
              color: isLight ? '#16a34a' : '#86efac',
              backgroundColor: isLight ? 'rgba(22,163,74,0.08)' : 'rgba(148,163,184,0.08)',
              border: `1px dashed ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(148,163,184,0.28)'}`,
            }}
          >
            + Add
          </button>
        )
      }
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 600 }} title={commitVal || undefined}>
          {commitVal || EMPTY_CELL}
        </span>,
        ticket, label, rowGhost, rowIndex,
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
========
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
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all hover:opacity-80"
              style={{
                color: isLight ? '#16a34a' : '#86efac',
                backgroundColor: isLight ? 'rgba(22,163,74,0.08)' : 'rgba(148,163,184,0.08)',
                border: `1px dashed ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(148,163,184,0.28)'}`,
              }}
            >
              + Add
            </button>
          )
        }
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
        return withEditPencil(
          <div
            className="w-full flex items-center justify-center rounded px-2 py-0.5 font-black text-[9px] border"
            style={{
              backgroundColor: isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.15)',
              color: isLight ? '#b91c1c' : '#fca5a5',
              borderColor: isLight ? '#fca5a5' : 'rgba(239, 68, 68, 0.3)',
            }}
          >
            EMPTY
          </div>,
          ticket, label, rowGhost
        )
      }

<<<<<<<< HEAD:src/pages/Schedules.tsx
      // Build trip suffix: 'JHUMAR - 1' for first site, 'JHUMAR - 2' for second
      const tripNum = ticket.tripNumber ?? ticket.trip_number ?? 1
      const hasTripSuffix = tripNum > 0
      const displayInstaller = hasTripSuffix
        ? `${curInstaller} - ${tripNum}`
        : curInstaller

      // Visual group separator when driver changes between consecutive rows
      const prevTicket = idx != null && idx > 0 ? visible[idx - 1] : null
      const curDriver = (ticket.driverName || ticket.driver_name || '').trim()
      const prevDriver = prevTicket ? (prevTicket.driverName || prevTicket.driver_name || '').trim() : ''
      const isNewDriverGroup = !isMyTickets && idx != null && idx > 0 && curDriver && prevDriver !== curDriver

========
      // Use .label (strips "- N" trip suffix) not .name — .name also chops "MANNY / ROMAR" to "MANNY".
      const displayInstaller = curToken.label || rawInstaller
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
      return withEditPencil(
        <span
          style={{
            ...truncStyle,
            display: 'block',
            borderTop: (isNewInstallerGroup || isNewDriverGroup) ? `2px solid ${isLight ? '#d1d5db' : '#475569'}` : undefined,
            paddingTop: (isNewInstallerGroup || isNewDriverGroup) ? 8 : 0,
            marginTop: (isNewInstallerGroup || isNewDriverGroup) ? 4 : 0,
          }}
          title={displayInstaller}
        >
          {displayInstaller}
        </span>,
        ticket, label, rowGhost,
      )
    }

    if (label === 'NEGOTIATOR') {
      const negName = getTicketNegotiatorName(ticket, branchEmployees) || '—'
      return withEditPencil(
        <span style={{ ...truncStyle, fontWeight: 600 }} title={negName}>
          {negName !== '—' ? <EmployeeNameLink nameOrId={negName} /> : negName}
        </span>,
        ticket, label, rowGhost,
      )
    }

    return withEditPencil(
      <span style={truncStyle} title={val}>{val}</span>,
      ticket, label, rowGhost,
    )
  }

<<<<<<<< HEAD:src/pages/Schedules.tsx
  // ── Render ────────────────────────────────────────────────────────────────
========
  // ─────────────────────────────────────────────────────────────
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
  return (
    <>
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
      {/* ── Portal: Toolbar into header slot (matches origin/main) ── */}
      {!isMyTickets && ReactDOM.createPortal(
        <div className="w-full px-3 md:px-5 pt-2 pb-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">

          {/* Left: Date chips & search */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1 min-w-0">
========
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

      {/* Portal: Toolbar into header slot */}
      {!isMyTickets && activeTab !== 'overview' && ReactDOM.createPortal(
        <div className="w-full min-w-0 max-w-full px-3 md:px-4 pt-2 pb-2.5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 md:gap-3 items-center">

          {/* Left: date chips (scroll) + search — can shrink */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-2.5 min-w-0 overflow-hidden">
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
            {activeTab === 'schedules' && (
              <>
                {/* Mobile: Date picker + Search (in between) + Filters button */}
                <div className="md:hidden flex items-center gap-2 w-full min-w-0 py-0.5">
                  {/* Mobile Date picker button — uses native dynamic OS date picker for iOS & Android */}
                  <div className="relative shrink-0 flex items-center">
                    <div
                      className="flex items-center gap-1.5 h-9 px-2.5 rounded-full border transition-transform pointer-events-none"
                      style={{
<<<<<<<< HEAD:src/pages/Schedules.tsx
                        backgroundColor: isActive ? green : inputBg,
                        borderColor: isActive ? green : inputBorder,
                        color: isActive ? '#ffffff' : textMuted,
                        boxShadow: isActive ? '0 2px 8px rgba(16,185,129,0.35)' : 'none',
========
                        backgroundColor: inputBg,
                        borderColor: green,
                        color: textPrimary,
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
                      }}
                    >
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: green }} strokeWidth={2.2} />
                      <span className="text-[11px] font-semibold whitespace-nowrap">
                        {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <input
                      type="date"
                      value={dateFilter}
                      onChange={e => handleDateFilterChange(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                      aria-label="Pick schedule date"
                    />
                  </div>

                  {/* Search field — in between Custom Date and Filters */}
                  <div
                    className="flex items-center gap-1.5 flex-1 min-w-0 h-9 px-3 rounded-full border"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                  >
                    <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                    <input
                      type="search"
                      inputMode="search"
                      placeholder="Search…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-transparent outline-none text-[11.5px] flex-1 min-w-0 font-medium"
                      style={{ color: textPrimary }}
                      onClick={e => e.stopPropagation()}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setSearchQuery('') }}
                        className="shrink-0 p-0.5 rounded-full"
                        style={{ color: textMuted }}
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

<<<<<<<< HEAD:src/pages/Schedules.tsx
                <button
                  type="button"
                  onClick={() => dateFilterInputRef.current?.showPicker?.()}
                  className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full border shrink-0 transition-all hover:opacity-80 active:scale-90"
                  style={{ borderColor: inputBorder, backgroundColor: inputBg }}
                  title="Pick date"
                >
                  <CalendarDays className="w-4 h-4" style={{ color: green }} />
                </button>
========
                  {/* Filters button */}
                  {!isMyTickets && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMonthFilterModalOpen(true) }}
                      className="flex items-center gap-1.5 h-9 px-3 rounded-full text-[11.5px] font-bold shrink-0 transition-all active:scale-95 border shadow-sm"
                      style={{
                        backgroundColor: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? green : inputBg,
                        borderColor: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? green : inputBorder,
                        color: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? '#ffffff' : textPrimary,
                      }}
                      title="Filter by month, negotiator, or status"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" style={{ color: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? '#ffffff' : green }} strokeWidth={2.2} />
                      <span>Filters</span>
                    </button>
                  )}
                </div>
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx

                {/* Desktop: week chips + custom date (scrolls when tight) */}
                <div className="hidden md:flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
                  {weeklyTabs.map(tab => {
                    const isActive = dateFilter === tab.key
                    return (
                      <button
                        type="button"
                        key={tab.key}
                        onClick={() => handleDateFilterChange(tab.key)}
                        className="h-10 px-4 lg:px-5 rounded-full text-[12px] lg:text-[13px] font-semibold border whitespace-nowrap shrink-0 transition-all active:scale-95"
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

                  {/* Custom Date Picker Trigger */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const now = dateFilter ? new Date(dateFilter + 'T00:00:00') : new Date()
                        setCustomDateCalMonth({ year: now.getFullYear(), month: now.getMonth() })
                        setCustomDatePickerOpen(o => !o)
                      }}
                      className="relative flex items-center gap-2 h-10 min-w-[10.5rem] px-3 lg:px-4 rounded-full border shrink-0 cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{
                        backgroundColor: isCustomSelected ? green : inputBg,
                        borderColor: isCustomSelected ? green : inputBorder,
                        color: isCustomSelected ? '#ffffff' : textPrimary,
                        boxShadow: isCustomSelected ? '0 2px 8px rgba(16,185,129,0.35)' : 'none',
                      }}
                      title="Pick a custom schedule date"
                    >
                      <CalendarDays
                        className="w-[18px] h-[18px] shrink-0"
                        style={{ color: isCustomSelected ? '#ffffff' : green }}
                        strokeWidth={2.2}
                      />
                      <span className="text-[12px] lg:text-[13px] font-semibold whitespace-nowrap truncate flex-1 min-w-0 text-left">
                        {isCustomSelected
                          ? new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })
                          : 'Custom date'}
                      </span>
                      <ChevronDown
                        className="w-4 h-4 shrink-0 opacity-70"
                        style={{ color: isCustomSelected ? '#ffffff' : textMuted }}
                      />
                    </button>
                  </div>
                  {/* Filters button — next to Custom date */}
                  {!isMyTickets && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMonthFilterModalOpen(true) }}
                      className="flex items-center gap-1.5 h-10 px-2.5 xl:px-3 rounded-full text-[12px] xl:text-[13px] font-semibold shrink-0 transition-all hover:opacity-90 active:scale-95"
                      style={{
                        backgroundColor: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? green : inputBg,
                        border: `1px solid ${(monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? green : inputBorder}`,
                        color: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? '#ffffff' : textPrimary,
                      }}
                      title="Whole-month view for this branch, filterable by negotiator"
                    >
                      <SlidersHorizontal className="w-4 h-4 shrink-0" style={{ color: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? '#ffffff' : green }} strokeWidth={2.1} />
                      <span className="hidden xl:inline">{monthViewActive ? `Month: ${formatMonthFilterLabel(monthFilterMonth)}` : 'Filters'}</span>
                    </button>
                  )}
                </div>
              </>
            )}

<<<<<<<< HEAD:src/pages/Schedules.tsx
            {activeTab === 'schedules' && (
              <div
                className="flex items-center gap-2.5 w-full md:w-[240px] lg:w-[320px] h-9 md:h-11 px-3 md:px-4 rounded-xl md:rounded-2xl border transition-all shrink-0"
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              >
                <Search className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" style={{ color: textMuted }} />
========
            {/* Search — desktop */}
            {activeTab === 'schedules' && (
              <div
                className="hidden md:flex items-center gap-2 w-[140px] lg:w-[180px] xl:w-[240px] h-10 px-3 rounded-2xl border transition-all shrink-0"
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              >
                <Search className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
                <input
                  type="search"
                  inputMode="search"
                  placeholder="Customer, installer, ticket no, phone…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder:font-medium"
                  style={{ color: textPrimary }}
                  onClick={e => e.stopPropagation()}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setSearchQuery('') }}
<<<<<<<< HEAD:src/pages/Schedules.tsx
                    className="shrink-0 p-1 md:p-1.5 rounded-full hover:bg-slate-500/10 transition-colors"
                    style={{ color: textMuted }}
                  >
                    <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
========
                    className="shrink-0 p-1 rounded-full hover:bg-slate-500/10 transition-colors"
                    style={{ color: textMuted }}
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
                  </button>
                )}
              </div>
            )}
          </div>

<<<<<<<< HEAD:src/pages/Schedules.tsx
          {/* Assign Drivers */}
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

          {/* Showcase */}
          {activeTab === 'schedules' && !isMyTickets && (
            <div className="flex items-center gap-1.5 shrink-0 relative justify-end hidden md:flex">
========
          {/* Right actions — always pinned in view */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0 justify-self-end">


            {activeTab === 'schedules' && canEdit && !isMyTickets && (
              <button
                type="button"
                id="bulk-assign-driver-btn"
                onClick={(e) => { e.stopPropagation(); setBulkAssignOpen(true) }}
                className="flex items-center gap-1.5 h-10 px-2.5 xl:px-3 rounded-full text-[12px] xl:text-[13px] font-semibold shrink-0 transition-all hover:opacity-90 active:scale-95"
                style={{
                  backgroundColor: inputBg,
                  border: `1px solid ${inputBorder}`,
                  color: textPrimary,
                }}
                title="Assign driver and vehicle to an installer's tickets"
              >
                <UsersRound className="w-4 h-4 shrink-0" style={{ color: green }} strokeWidth={2.1} />
                <span className="hidden xl:inline">Assign Drivers</span>
              </button>
            )}

            {activeTab === 'schedules' && !isMyTickets && (
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowcaseOpen(true)
                }}
                className="flex items-center gap-1.5 h-10 px-2.5 xl:px-4 rounded-full text-[12px] xl:text-[13px] font-bold transition-all shrink-0 active:scale-95"
                style={{
                  backgroundColor: showcaseOpen ? 'transparent' : green,
                  border: `1.5px solid ${green}`,
                  color: showcaseOpen ? green : '#ffffff',
                  boxShadow: showcaseOpen ? 'none' : '0 2px 8px rgba(16,185,129,0.3)',
                }}
                title="Open fullscreen schedule showcase for print / PDF"
              >
                <Maximize2 className="w-4 h-4 shrink-0" />
                <span className="hidden xl:inline">{showcaseOpen ? 'Active' : 'Showcase'}</span>
              </button>
            )}
          </div>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

<<<<<<<< HEAD:src/pages/Schedules.tsx
      {/* Sort reset strip — replaces the old stats bar */}
      {!isMyTickets && activeTab === 'schedules' && sortDiffersFromDefault && (
        <div className="flex items-center justify-end px-4 py-1.5 border-b shrink-0"
          style={{ backgroundColor: cardBg, borderColor: border }}>
========
      {!isMyTickets && showcaseOpen && ReactDOM.createPortal(
        <div className="flex items-center justify-between gap-3 px-5 md:px-8 py-2 bg-red-500/10 border-b border-red-500/20">
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
            Full-screen view &mdash; click <em>Export PDF to Print</em>, then Exit Showcase.
          </span>
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
          <button
            type="button"
            onClick={() => setSortConfig(defaultSortForSchedulesView(isMyTickets))}
            className="text-[10px] font-bold uppercase tracking-wide hover:underline"
            style={{ color: green }}
          >
            Reset sort
          </button>
<<<<<<<< HEAD:src/pages/Schedules.tsx
========
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {/* Month view banner — lets the user see & explicitly exit the whole-month table view */}
      {!isMyTickets && monthViewActive && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b shrink-0"
          style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderColor: border }}>
          <span className="text-xs font-semibold" style={{ color: green }}>
            Month view — {formatMonthFilterLabel(monthFilterMonth)} · {activeBranchLabel || 'All branches'}
            {monthFilterNegotiatorId
              ? ` · ${formatNegotiatorLabel(monthFilterNegotiatorOptions.find(n => n.id === monthFilterNegotiatorId) || {})}`
              : ''}
            {monthFilterStatus
              ? ` · ${monthFilterStatus === 'PENDING_GROUP' ? 'All Pending' : monthFilterStatus === 'CLOSING_GROUP' ? 'All Closing' : getScheduleStatusLabel(monthFilterStatus)}`
              : ''}
            {' '}({visible.length} ticket{visible.length === 1 ? '' : 's'})
          </span>
          <button
            type="button"
            onClick={() => setMonthViewActive(false)}
            className="text-[11px] font-bold uppercase tracking-wide hover:underline shrink-0"
            style={{ color: green }}
          >
            Exit month view
          </button>
        </div>
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
        {(
          loading && !hasHydratedOnce && tickets.length === 0 ? (
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
            <div
              ref={tableScrollRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
              data-ticket-table-scroll
              style={{
                paddingBottom: activeCellOverlay ? 72 : 12,
              }}
            >
              {isMyTickets && (
                <div className="md:hidden w-full">
                  <ResponsiveTable
                    data={filtered}
                    columns={(() => {
                      const MOBILE_VISIBLE_COLS = new Set(['TICKET NO', 'STATUS', "CUSTOMER'S NAME", 'DESTINATION', 'TYPE'])
                      return columns.map((col: any) => {
                        const isMobileVisible = MOBILE_VISIBLE_COLS.has(col.label)

                        if (col.label === 'TICKET NO') {
                          return {
                            header: col.display,
                            accessorKey: col.label,
                            isMobileVisible,
                            cellRenderer: (ticket: Ticket, idx?: number) => {
                              const cleanTicketNo = String((ticket as any).ticketId || (ticket as any).ticket_id || ticket.id || getCellDisplay(ticket, col.label)).substring(0, 8).toUpperCase()
                              return (
                                <div className="flex items-center justify-end min-w-0 w-full" title={cleanTicketNo}>
                                  <span className="text-slate-400 dark:text-slate-500 mr-2 text-xs shrink-0">{idx !== undefined ? idx + 1 : ''}.</span>
                                  <span className="font-mono font-bold truncate max-w-[150px] block text-right" style={{ color: textPrimary }}>{cleanTicketNo}</span>
                                </div>
                              )
                            }
                          }
                        }

                        if (col.label === 'STATUS') {
                          return {
                            header: col.display,
                            accessorKey: col.label,
                            isMobileVisible,
                            cellRenderer: (ticket: Ticket) => {
                              return (
                                <div
                                  className="flex justify-end w-full cursor-pointer items-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (canEdit) {
                                      openStatusPicker(ticket, 'inline', e.currentTarget as HTMLElement);
                                    }
                                  }}
                                >
                                  {renderCell(ticket, col)}
                                </div>
                              )
                            }
                          }
                        }

                        if (col.label === "CUSTOMER'S NAME") {
                          return {
                            header: col.display,
                            accessorKey: col.label,
                            isMobileVisible,
                            cellRenderer: (ticket: Ticket) => {
                              const val = getCellDisplay(ticket, col.label)
                              return (
                                <span className="font-bold text-gray-900 dark:text-gray-100 block truncate max-w-[180px] text-right ml-auto" title={val}>
                                  {val || '-'}
                                </span>
                              )
                            }
                          }
                        }

                        return {
                          header: col.display,
                          accessorKey: col.label,
                          isMobileVisible,
                          cellRenderer: (ticket: Ticket) => {
                            const val = getCellDisplay(ticket, col.label)
                            return (
                              <span className="truncate block w-full text-sm text-right" title={val}>
                                {val || '-'}
                              </span>
                            )
                          }
                        }
                      }) as ResponsiveColumnDef<any>[]
                    })() as any}
                  />
========
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
                </div>
              )}

              {/* Schedules mobile card view (matches production / main) */}
              {!isMyTickets && (
                <div className="flex flex-col md:hidden p-3 gap-3">
                  {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <p className="text-sm font-semibold" style={{ color: textMuted }}>
                        {searchQuery ? 'No records found' : 'No records'}
                      </p>
                      {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="text-xs font-bold hover:underline" style={{ color: green }}>
                          Clear search
                        </button>
                      )}
                    </div>
                  ) : (
                    visible.map((ticket, idx) => {
                      const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null
                      const isGhost = Boolean(ghostKind)
                      const isDuplicateName = duplicateNameKeys.has(normalizeCustomerKey(getCustomerDisplayName(ticket)))
                      const rowColors = getScheduleRowColors(ticket, ghostKind, isLight, idx, rowEven, rowOdd, isDuplicateName)
                      const isInstalled = isInstalledWorkflowStatus(ticket.status) || ['DONE_INSTALLED', 'DONE_CLEANING'].includes(ticket.status || '')
                      const ticketNo = ticket.ticketNumber || ticket.ticket_number || ticket.controlNumber || ticket.control_number || getCellDisplay(ticket, 'TICKET NO') || '—'
                      const district = getCellDisplay(ticket, 'DESTINATION') || ticket.district || '—'
                      const brand = getCellDisplay(ticket, 'BRAND') || '—'
                      const installer = getInstallerDisplay(ticket, branchEmployees, activeBranchId) || 'Unassigned'

                      return (
                        <div
                          key={`${ticket.id}${isGhost ? `-ghost-${ghostKind}` : ''}`}
                          onClick={() => setDetailTicket(ticket)}
                          className="w-full rounded-xl p-3 flex flex-col gap-2 shadow-sm border transition-transform active:scale-[0.98] cursor-pointer"
                          style={{
                            backgroundColor: rowColors.baseBg,
                            borderColor: tableBorder,
                            borderLeft: rowColors.accent ? `4px solid ${rowColors.accent}` : undefined,
                            opacity: isGhost ? 0.72 : 1,
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <h4
                              className="font-bold text-sm truncate mr-2"
                              style={{ color: isDuplicateName ? (isLight ? '#9f1239' : '#f43f5e') : textPrimary }}
                            >
                              {getCustomerDisplayName(ticket) || '—'}
                            </h4>
                            {ticket.status && (
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0"
                                style={{
                                  backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)',
                                  color: isInstalled ? (isLight ? '#059669' : '#34d399') : (isLight ? '#0284c7' : '#38bdf8'),
                                }}
                              >
                                {ticket.status}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs" style={{ color: textMuted }}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Copy className="w-3 h-3 shrink-0" />
                              <span className="font-semibold truncate" style={{ color: textPrimary }}>{ticketNo}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-right justify-end min-w-0">
                              <span className="truncate">{district}</span>
                            </div>
                            <div className="flex items-center gap-1.5 col-span-2 min-w-0">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{district} · {brand}</span>
                            </div>
                            <div className="flex items-center gap-1.5 col-span-2 min-w-0">
                              <span
                                className="font-medium truncate"
                                style={{
                                  color: installer !== 'Unassigned'
                                    ? (isLight ? '#0369a1' : '#7dd3fc')
                                    : undefined,
                                }}
                              >
                                {installer}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              <div className="hidden md:block w-full">
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
                        const headBorder = isMyTickets ? myTicketsTheadBorder : schedTheadBorder
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
                              padding: '13px 12px',
                              color: (col.isExpanded || isSorted)
                                ? (isLight ? '#16A34A' : '#4ADE80')
                                : (isMyTickets ? myTicketsTheadText : schedTheadText),
                              fontWeight: 700, whiteSpace: 'nowrap',
                              borderRight: `1px solid ${headBorder}`,
                              borderBottom: `1px solid ${headBorder}`,
                              fontSize: '10px', letterSpacing: '0.08em',
                              width: col.w, minWidth: 0, maxWidth: col.w,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              backgroundColor: isMyTickets ? myTicketsTheadBg : schedTheadBg,
                              cursor: 'pointer',
                              userSelect: 'none',
                              transition: 'color 0.15s ease',
                              textAlign: col.align || 'left',
                              ...(col.sticky ? { position: 'sticky' as const, left: `${col.left}%`, zIndex: 15, boxShadow: `2px 0 0 ${headBorder}` } : {}),
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
                          <div className="flex flex-col items-center justify-center gap-3">
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
                        const rowIsActive = columns.some(col =>
                          (editingCell?.ticketId === ticket.id && editingCell?.colLabel === col.label)
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
                          <tr key={`${ticket.id}${isGhost ? `-ghost-${ghostKind}` : ''}`}
                            style={{
                              borderBottom: `1px solid ${tableBorder}`,
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
                              const isEditingCell = editingCell?.ticketId === ticket.id && editingCell?.colLabel === col.label
                              const isExpandedCell = expandedCell?.ticketId === ticket.id && expandedCell?.colLabel === col.label
                              const isStatusCol = col.label === 'STATUS'
                              const SKIP_EMPTY_HIGHLIGHT = new Set(['STATUS', 'INSTALLER', 'SERVICE', 'VEHICLE', 'COMMIT', 'NOTE', 'UPDATE', 'PAYMENT', 'TICKET NO', 'FINAL DATE'])
                              const cellVal = getCellDisplay(ticket, col.label)
                              const isCellEmpty = !SKIP_EMPTY_HIGHLIGHT.has(col.label) && !isGhost && !isEditingCell && !cellVal.trim()
                              // Quiet empty hint — no orange wash; subtle slate so dark mode stays clean.
                              const emptyCellBg = isCellEmpty
                                ? (isLight ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.07)')
                                : undefined
                              const emptyCellInset = isCellEmpty
                                ? `inset 0 0 0 1px ${isLight ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.18)'}`
                                : undefined
                              const isSelectedVehicleCell = col.label === 'VEHICLE' && selectedVehicleTicketId === ticket.id
                              // Resched ghosts alone keep remarks editable (one shared field, not
                              // per-date state) — every other edit affordance stays locked on ghosts.
                              const allowGhostCellEdit = isGhost && ghostKind === 'resched' && col.label === 'UPDATE'
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
                                      openStatusPicker(ticket, 'inline', e.currentTarget as HTMLElement)
                                      return
                                    }
<<<<<<<< HEAD:src/pages/Schedules.tsx
                                    if (col.label !== 'UPDATE') {
                                      setExpandedCell(prev =>
                                        prev?.ticketId === ticket.id && prev?.colLabel === col.label
                                          ? null
                                          : { ticketId: ticket.id, colLabel: col.label },
                                      )
                                    }
========
                                    // VEHICLE is drag-to-reorder now — a tap-to-view-details popup
                                    // on the same cell just gets in the way of grabbing it.
                                    if (col.label === 'VEHICLE' || col.label === 'TICKET NO') return
                                    setExpandedCell(prev =>
                                      prev?.ticketId === ticket.id && prev?.colLabel === col.label
                                        ? null
                                        : { ticketId: ticket.id, colLabel: col.label },
                                    )
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
                                  }}
                                  onDoubleClick={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (!canEdit || isEditingCell || (isGhost && !allowGhostCellEdit)) return
                                    if (col.label === 'VEHICLE' || col.label === 'TICKET NO') {
                                      if (col.label === 'VEHICLE') {
                                        setSelectedVehicleTicketId(prev => (prev === ticket.id ? null : ticket.id))
                                      }
                                      return
                                    }
                                    if (INLINE_EDIT_COLUMNS.has(col.label)) {
                                      startCellEdit(ticket, col.label)
                                    }
                                  }}
                                  style={{
                                    padding: isEditingCell ? '6px' : '0 12px',
                                    color: isGhost ? textMuted : textPrimary,
<<<<<<<< HEAD:src/pages/Schedules.tsx
                                    fontSize: '11px', fontWeight: isGhost ? 500 : 500,
                                    backgroundColor: emptyCellBg ?? bg,
========
                                    fontSize: '12.5px', fontWeight: isGhost ? 500 : 600,
                                    backgroundColor: isSelectedVehicleCell ? `${green}22` : (emptyCellBg ?? bg),
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
                                    cursor: canEdit && (!isGhost || allowGhostCellEdit) && INLINE_EDIT_COLUMNS.has(col.label) ? 'text' : 'default',
                                    verticalAlign: 'middle',
                                    textAlign: col.align || 'left',
                                    userSelect: isEditingCell ? 'text' : (canEdit && (!isGhost || allowGhostCellEdit) ? 'none' : undefined),
                                    WebkitUserSelect: isEditingCell ? 'text' : (canEdit && (!isGhost || allowGhostCellEdit) ? 'none' : undefined),
                                    ...(col.sticky
                                      ? { position: 'sticky' as const, left: `${col.left}%`, zIndex: (isEditingCell || isExpandedCell) ? 95 : 5 }
                                      : { position: 'relative' as const, zIndex: (isEditingCell || isExpandedCell) ? (isEditingCell ? 90 : 85) : undefined }),
                                    boxShadow: isSelectedVehicleCell
                                      ? `inset 0 0 0 2px ${green}`
                                      : emptyCellInset
                                        ? emptyCellInset
                                        : (col.sticky ? `2px 0 0 ${tableBorder}` : undefined),
                                  }}>
                                  {isEditingCell ? (
                                    renderCell(ticket, col, idx, isGhost, ghostKind, false)
                                  ) : (
<<<<<<<< HEAD:src/pages/Schedules.tsx
                                    <div className="relative w-full h-full flex items-center" style={{ minHeight: TABLE_ROW_HEIGHT - 2 }}>
                                      <div className="w-full min-w-0 overflow-hidden">
========
                                    <div
                                      className={`relative w-full h-full flex items-center ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''
                                        }`}
                                      style={{ minHeight: TABLE_ROW_HEIGHT - 2 }}
                                    >
                                      <div className={`min-w-0 overflow-hidden ${col.align === 'center' && col.label !== 'VEHICLE' ? 'w-auto max-w-full' : 'w-full'}`}>
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
                                        {renderCell(ticket, col, idx, isGhost, ghostKind, false)}
                                      </div>
                                      {isExpandedCell && (
                                        <div
                                          data-expanded-popover="true"
                                          className="absolute left-0 top-full z-[140] mt-1 w-[min(22rem,calc(100vw-2rem))] max-w-[380px] rounded-lg border px-3 py-2 text-xs"
                                          style={{
                                            backgroundColor: cardBg,
                                            borderColor: inputBorder,
                                            boxShadow: isLight
                                              ? '0 8px 24px rgba(15,23,42,0.12)'
                                              : '0 8px 24px rgba(0,0,0,0.35)',
                                          }}
                                          onClick={e => e.stopPropagation()}
                                          onPointerDown={e => e.stopPropagation()}
                                        >
                                          {renderCell(ticket, col, idx, isGhost, ghostKind, true)}
                                        </div>
                                      )}
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
                      const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null;
                      if (shouldBlankReschedGhostPayment(dateFilter, ghostKind)) return;

                      const { mode: rawMode, amount } = resolveTicketPayment(ticket);

                      if (rawMode === 'HYBRID') {
                        const breakdown = getPaymentBreakdown(ticket);
                        breakdown.forEach(entry => {
                          const subRawMode = (entry.mode || '').trim().toUpperCase();
                          const subAmount = entry.amount || 0;
                          if (subRawMode === 'CASH') totalCash += subAmount;
                          else if (subRawMode === 'GCASH') totalGcash += subAmount;
                          else if (subRawMode === 'BANK TRANSFER' || subRawMode === 'BANK_TRANSFER' || subRawMode === 'BANK' || subRawMode === 'ONLINE') totalBankTransfer += subAmount;
                          else if (subAmount > 0) totalOther += subAmount;
                        });
                      } else {
                        if (rawMode === 'CASH') totalCash += amount;
                        else if (rawMode === 'GCASH') totalGcash += amount;
                        else if (rawMode === 'BANK TRANSFER' || rawMode === 'BANK_TRANSFER' || rawMode === 'BANK' || rawMode === 'ONLINE') totalBankTransfer += amount;
                        else if (amount > 0) totalOther += amount;
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
<<<<<<<< HEAD:src/pages/Schedules.tsx
              </div>
            </div>
          ))}
========
                {/* Mobile Card View — important fields only (no branch; header already shows it) */}
                <div className="flex flex-col md:hidden p-3 gap-2.5">
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
                      const statusVal = getScheduleStatusValue(ticket)
                      const statusStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
                      const statusDisplay = getScheduleStatusDisplay(ticket) || ticket.status || ''
                      const ticketNo = ticket.ticketNumber || ticket.controlNumber || '—'
                      const district = resolveTicketDistrict(ticket) || ticket.district || ''
                      const fullAddress = ((ticket as any).address || (ticket as any).fullAddress || (ticket as any).full_address || (ticket as any).location || (ticket as any).siteAddress || (ticket as any).site_address || (ticket as any).streetAddress || (ticket as any).street_address || (ticket as any).city || (ticket as any).area || district || '').trim()
                      const brand = parseBrand(ticket)
                      const dealer = getF(ticket, 'dealer', 'sourceVendor', 'source_vendor')
                      const installer = getInstallerDisplay(ticket, branchEmployees, activeBranchId)
                      const driver = getTicketDriverDisplay(ticket)
                      const vehicle = vehicleTripLabels.get(ticket.id || '') || getTicketVehicleDisplay(ticket)
                      const payment = getSchedulePaymentDisplay(ticket, dateFilter, ghostKind)
                      const commit = getTicketCommitDisplay(ticket)
                      const phone = getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
                      const remarks = sanitizeDisplayText(
                        stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim()),
                      )
                      const negotiatorName = getTicketNegotiatorName(ticket, branchEmployees) || ''
                      const cardNegId = ticket.negotiatorId || ticket.negotiator_id || ''
                      const cardNegEmp = branchEmployees.find(e => {
                        if (cardNegId && e.id === cardNegId) return true
                        if (negotiatorName && e.name && namesMatchLoosely(e.name, negotiatorName)) return true
                        const resolvedFull = resolveNegotiatorDisplayName(ticket, branchEmployees)
                        if (resolvedFull && e.name && namesMatchLoosely(e.name, resolvedFull)) return true
                        return false
                      })
                      const negotiatorPhone = (ticket as any).negotiatorPhone
                        || (ticket as any).negotiator_phone
                        || (ticket as any).negotiatorContact
                        || (ticket as any).negotiator_contact
                        || cardNegEmp?.phone
                        || (cardNegId && user?.id === cardNegId ? (user?.phone || '') : '')
                        || ''


                      return (
                        <div
                          key={`${ticket.id}${isGhost ? `-ghost-${ghostKind}` : ''}`}
                          onClick={() => setDetailTicket(ticket)}
                          className="w-full rounded-xl overflow-hidden border transition-transform active:scale-[0.985] cursor-pointer"
                          style={{
                            backgroundColor: rowColors.baseBg,
                            borderColor: tableBorder,
                            opacity: isGhost ? 0.72 : 1,
                          }}
                        >
                          {/* ── Top section: name / ticket / phone / status ── */}
                          <div className="px-3 pt-2.5 pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <span
                                    className="font-extrabold text-[13px] uppercase tracking-wide leading-tight"
                                    style={{ color: isDuplicateName ? (isLight ? '#9f1239' : '#f43f5e') : textPrimary }}
                                  >
                                    {getCustomerDisplayName(ticket)}
                                  </span>
                                  <span className="text-[11px] font-bold tabular-nums" style={{ color: textMuted }}>
                                    {ticketNo}
                                  </span>
                                </div>
                                {phone ? (
                                  <a
                                    href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                                    onClick={e => e.stopPropagation()}
                                    onContextMenu={e => {
                                      e.preventDefault(); e.stopPropagation()
                                      void copyTextToClipboard(phone)
                                      showToast(`Copied ${fmtPhone(phone) || phone}`)
                                    }}
                                    className="text-[11px] font-semibold tabular-nums hover:underline"
                                    style={{ color: isLight ? '#0369a1' : '#7dd3fc' }}
                                  >
                                    {fmtPhone(phone) || phone}
                                  </a>
                                ) : null}
                                {/* Brand / Dealer */}
                                {(brand || dealer) ? (
                                  <div className="text-[10.5px] font-semibold truncate mt-0.5" style={{ color: textMuted }}>
                                    {[brand, dealer].filter(Boolean).join(' · ')}
                                  </div>
                                ) : null}
                              </div>
                              {statusDisplay ? (
                                <span
                                  className="text-[10.5px] font-black uppercase shrink-0 tracking-wider px-2.5 py-1 rounded-full border shadow-sm"
                                  style={{
                                    color: statusStyle.color,
                                    backgroundColor: statusStyle.backgroundColor,
                                    borderColor: statusStyle.borderColor,
                                  }}
                                >
                                  {statusDisplay === 'INSTALLATION' ? 'INSTALL' : statusDisplay}
                                </span>
                              ) : null}
                            </div>
                            {/* Full Width Address */}
                            {fullAddress ? (
                              <div className="flex items-center gap-1 mt-1 w-full" style={{ color: textMuted }}>
                                <MapPin className="w-2.5 h-2.5 shrink-0" style={{ color: green }} />
                                <span className="text-[10.5px] font-medium truncate w-full" title={fullAddress}>{fullAddress}</span>
                              </div>
                            ) : null}
                          </div>

                          {/* ── Crew section: tight table ── */}
                          <div
                            className="px-3 py-1.5 border-t"
                            style={{
                              borderColor: tableBorder,
                              backgroundColor: isLight ? 'rgba(15,23,42,0.04)' : 'rgba(148,163,184,0.08)',
                            }}
                          >
                            {/* Negotiator row */}
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-[9.5px] font-bold tracking-widest uppercase shrink-0" style={{ color: textMuted }}>NEGOTIATOR:</span>
                                <span className="text-[11.5px] font-semibold truncate" style={{ color: (negotiatorName && negotiatorName !== EMPTY_CELL) ? textPrimary : textMuted }}>
                                  {negotiatorName && negotiatorName !== EMPTY_CELL ? negotiatorName : '—'}
                                </span>
                              </div>
                              {negotiatorPhone ? (
                                <div className="flex items-center gap-1 shrink-0 ml-auto text-right">
                                  <span className="text-[9.5px] font-bold tracking-widest uppercase" style={{ color: textMuted }}>CONTACT NO:</span>
                                  <a
                                    href={`tel:${negotiatorPhone.replace(/[^\d+]/g, '')}`}
                                    onClick={e => e.stopPropagation()}
                                    onContextMenu={e => {
                                      e.preventDefault(); e.stopPropagation()
                                      void copyTextToClipboard(negotiatorPhone)
                                      showToast(`Copied ${fmtPhone(negotiatorPhone) || negotiatorPhone}`)
                                    }}
                                    className="text-[11px] tabular-nums font-bold hover:underline"
                                    style={{ color: isLight ? '#0369a1' : '#7dd3fc' }}
                                  >
                                    {fmtPhone(negotiatorPhone) || negotiatorPhone}
                                  </a>
                                </div>
                              ) : null}
                            </div>
                            {/* Installer · Vehicle · Driver in one line */}
                            <div className="grid grid-cols-3 gap-x-1 mt-0.5">
                              <div className="col-span-1 flex flex-col min-w-0">
                                <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: textMuted }}>Installer</span>
                                <span className="text-[11px] font-semibold truncate" style={{ color: installer ? (isLight ? '#0369a1' : '#7dd3fc') : textMuted }}>
                                  {installer || '—'}
                                </span>
                              </div>
                              <div className="col-span-1 flex flex-col min-w-0">
                                <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: textMuted }}>Vehicle</span>
                                <span className="text-[11px] font-semibold truncate uppercase tabular-nums" style={{ color: vehicle ? textPrimary : textMuted }}>
                                  {vehicle || '—'}
                                </span>
                              </div>
                              <div className="col-span-1 flex flex-col items-end text-right min-w-0">
                                <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: textMuted }}>Driver</span>
                                <span className="text-[11px] font-semibold truncate" style={{ color: driver ? textPrimary : textMuted }}>
                                  {driver || '—'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* ── Footer: commit / payment / remarks ── */}
                          {(commit || payment || remarks) ? (
                            <div
                              className="px-3 py-1.5 border-t"
                              style={{ borderColor: tableBorder }}
                            >
                              {(commit || payment) ? (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10.5px] font-medium truncate" style={{ color: textMuted }}>{commit || '—'}</span>
                                  {payment ? (
                                    <span className="text-[11px] shrink-0 font-bold tabular-nums" style={{ color: textPrimary }}>{payment}</span>
                                  ) : null}
                                </div>
                              ) : null}
                              {remarks ? (
                                <p className="text-[10.5px] truncate font-medium" style={{ color: textMuted }} title={remarks}>
                                  {remarks}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                  {(() => {
                    let totalCash = 0;
                    let totalGcash = 0;
                    let totalBankTransfer = 0;
                    let totalOther = 0;

                    visible.forEach(ticket => {
                      const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null;
                      if (shouldBlankReschedGhostPayment(dateFilter, ghostKind)) return;

                      const { mode: rawMode, amount } = resolveTicketPayment(ticket);

                      if (rawMode === 'HYBRID') {
                        const breakdown = getPaymentBreakdown(ticket);
                        breakdown.forEach(entry => {
                          const subRawMode = (entry.mode || '').trim().toUpperCase();
                          const subAmount = entry.amount || 0;
                          if (subRawMode === 'CASH') totalCash += subAmount;
                          else if (subRawMode === 'GCASH') totalGcash += subAmount;
                          else if (subRawMode === 'BANK TRANSFER' || subRawMode === 'BANK_TRANSFER' || subRawMode === 'BANK' || subRawMode === 'ONLINE') totalBankTransfer += subAmount;
                          else if (subAmount > 0) totalOther += subAmount;
                        });
                      } else {
                        if (rawMode === 'CASH') totalCash += amount;
                        else if (rawMode === 'GCASH') totalGcash += amount;
                        else if (rawMode === 'BANK TRANSFER' || rawMode === 'BANK_TRANSFER' || rawMode === 'BANK' || rawMode === 'ONLINE') totalBankTransfer += amount;
                        else if (amount > 0) totalOther += amount;
                      }
                    });

                    const totalEstimated = totalCash + totalGcash + totalBankTransfer + totalOther;
                    if (totalEstimated <= 0) return null;

                    return (
                      <div className="mt-3 p-3 rounded-xl border flex flex-col gap-2 shadow-sm" style={{ backgroundColor: cardBg, borderColor: tableBorder }}>
                        <div className="flex items-center justify-between px-3 py-2 rounded-lg font-black" style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                          <span className="text-[11px] uppercase tracking-wider">TOTAL COLLECTION</span>
                          <span className="text-xs font-black tracking-wide">
                            ₱{totalEstimated.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {totalGcash > 0 && (
                          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#dbeafe', color: '#000' }}>
                            <span>GCASH</span>
                            <span>₱{totalGcash.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {totalCash > 0 && (
                          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#dcfce7', color: '#000' }}>
                            <span>CASH</span>
                            <span>₱{totalCash.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {totalBankTransfer > 0 && (
                          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#f3e8ff', color: '#000' }}>
                            <span>BANK TRANSFER</span>
                            <span>₱{totalBankTransfer.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {totalOther > 0 && (
                          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#f3e8ff', color: '#000' }}>
                            <span>OTHER</span>
                            <span>₱{totalOther.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )) : (
          /* Render Overview Search Panel */
          <div className="flex-1 flex flex-col min-h-0 w-full h-full overflow-hidden relative" style={{ backgroundColor: isLight ? '#f1f5f9' : '#060B18' }}>
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

            <div
              className={`flex-1 min-h-0 px-3 md:px-8 bg-transparent relative ${overviewSearchInput || overviewResults.length > 0 ? 'overflow-y-auto flex flex-col' : 'overflow-hidden'
                }`}
            >
              <div
                className={
                  overviewSearchInput || overviewResults.length > 0
                    ? 'max-w-4xl w-full mx-auto flex flex-col'
                    : 'w-full max-w-4xl mx-auto px-3 md:px-0 pt-10 md:pt-16 flex flex-col items-center gap-6 md:gap-8'
                }
              >

                {/* Sticky Header: Logo + Search Input (opaque bg so results don't show through while scrolling) */}
                <div
                  className={overviewSearchInput || overviewResults.length > 0
                    ? 'sticky top-0 z-10 -mx-3 px-3 md:mx-0 md:px-0 pt-4 pb-3 md:pt-6 md:pb-4 flex flex-col gap-3 md:gap-4'
                    : 'w-full flex flex-col items-center gap-6 md:gap-8'}
                  style={overviewSearchInput || overviewResults.length > 0 ? { backgroundColor: isLight ? '#f1f5f9' : '#060B18' } : undefined}
                >
                  {/* Big Logo / Name (Google Style) */}
                  <div className="flex flex-col items-center justify-center text-center w-full">
                    <h1
                      className={`font-black tracking-tighter ${overviewSearchInput || overviewResults.length > 0 ? 'text-2xl md:text-3xl mb-0 opacity-80' : 'text-5xl md:text-7xl mb-2 opacity-100'}`}
                    >
                      <span style={{ color: green }}>ASHCOL</span>
                      <span style={{ color: textPrimary }} className="ml-2 md:ml-3">PORTAL</span>
                    </h1>
                  </div>

                  {/* Search Input Box with Filter Dropdown */}
                  <div className="w-full max-w-2xl mx-auto">
                    <SearchFilterDropdown
                      searchValue={overviewSearchInput}
                      onSearchChange={val => { setOverviewSearchInput(val); if (!val) setOverviewResults([]) }}
                      onFocus={() => setOverviewSearchFocused(true)}
                      onBlur={() => setOverviewSearchFocused(false)}
                      focused={overviewSearchFocused}
                      colors={{
                        cardBg,
                        border,
                        textPrimary,
                        textMuted,
                        green,
                      }}
                    />
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
                        const cardNegId = ticket.negotiatorId || ticket.negotiator_id || '';
                        const cardNegEmp = branchEmployees.find(e => {
                          if (cardNegId && e.id === cardNegId) return true;
                          const resolvedFull = resolveNegotiatorDisplayName(ticket, branchEmployees);
                          if (resolvedFull && e.name && namesMatchLoosely(e.name, resolvedFull)) return true;
                          return false;
                        });
                        const negotiatorPhone = (ticket as any).negotiatorPhone
                          || (ticket as any).negotiator_phone
                          || cardNegEmp?.phone
                          || (cardNegId && user?.id === cardNegId ? (user?.phone || '') : '')
                          || '';
                        const finalDateKey = getFinalDateKey(ticket);
                        const scheduleDateLabel = finalDateKey
                          ? `Scheduled: ${formatDisplayDate(finalDateKey, '')}`
                          : getPreferredDateKey(ticket)
                            ? `Preferred: ${formatDisplayDate(getPreferredDateKey(ticket), '')}`
                            : 'No Date';

                        const cleanBranch = branchLabel && branchLabel !== EMPTY_CELL ? branchLabel.replace(/^ASHCOL\s+/i, '') : '';
                        const custPhone = ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '';
                        const formattedCustPhone = custPhone ? (fmtPhone(custPhone) || custPhone) : '';

                        return (
                          <div
                            key={ticket.id}
                            className="rounded-2xl p-4 border shadow-sm transition-all duration-200 hover:shadow-md flex flex-col justify-between"
                            style={{ backgroundColor: cardBg, borderColor: border }}
                          >
                            <div className="space-y-2.5">
                              {/* Card Header */}
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-[11px] font-black font-mono tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                                  {ticketNum}
                                </span>
                                <div className="flex gap-1.5 items-center flex-wrap justify-end">
                                  {cleanBranch && (
                                    <span
                                      className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                                      style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textMuted }}
                                    >
                                      {cleanBranch}
                                    </span>
                                  )}
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide shadow-sm"
                                    style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
                                  >
                                    {statusLabel}
                                  </span>
                                </div>
                              </div>

                              {/* Customer Name & Contact Phone */}
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <h3 className="font-extrabold text-base leading-snug tracking-tight" style={{ color: textPrimary }}>
                                  {highlightMatch(customer, overviewSearchInput)}
                                </h3>
                                {formattedCustPhone && (
                                  <a
                                    href={`tel:${custPhone.replace(/\D/g, '').replace(/^0/, '+63')}`}
                                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline tracking-tight"
                                  >
                                    ({formattedCustPhone})
                                  </a>
                                )}
                              </div>

                              {/* Location */}
                              {formatAddress(ticket.location) && (
                                <div className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                  <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-500 mt-0.5" />
                                  <span className="line-clamp-2 leading-relaxed">{formatAddress(ticket.location)}</span>
                                </div>
                              )}

                              {/* Details Grid Box */}
                              <div
                                className="rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"
                                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                              >
                                {(negotiatorLabel !== EMPTY_CELL || negotiatorPhone) && (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Negotiator</span>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {negotiatorLabel !== EMPTY_CELL && (
                                        <span className="font-bold uppercase" style={{ color: textPrimary }}>{negotiatorLabel}</span>
                                      )}
                                      {negotiatorPhone && (
                                        <span className="text-[11px] font-medium" style={{ color: textMuted }}>
                                          ({negotiatorPhone ? (
                                            <a href={`tel:${negotiatorPhone.replace(/\D/g, '').replace(/^0/, '+63')}`} className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
                                              {fmtPhone(negotiatorPhone) || negotiatorPhone}
                                            </a>
                                          ) : null})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {ticket.assignedEmployeeName && (
                                  <div className="flex flex-col gap-0.5 sm:col-span-2">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Technician</span>
                                    <span className="font-semibold" style={{ color: textPrimary }}>{ticket.assignedEmployeeName}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Card Footer */}
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pt-3 mt-3 border-t border-dashed" style={{ borderColor: border }}>
                              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>
                                <CalendarDays className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                <span>{scheduleDateLabel}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDetailTicket(ticket);
                                    setShowHistoryPanel(false);
                                  }}
                                  className="flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
                                  style={{ backgroundColor: green }}
                                >
                                  <Eye className="w-3.5 h-3.5" />
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

            {/* Dark Mode Toggle - Bottom Right Floating (Hidden when search result rows exist) */}
            {overviewResults.length === 0 && (
              <div className="fixed sm:absolute bottom-6 right-6 z-50">
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
            )}
          </div>
        )}
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
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
        const branchName = branches.find(b => b.id === (t.branchId || t.branch_id))?.name || 'UNASSIGNED'

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
                      {branchName !== 'UNASSIGNED' && (
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
                    <span className="font-semibold text-xs" style={{ color: textMuted }}>
                      —
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
                      <DField label="Negotiator" value={negotiatorName || '—'} />
                      <DField label={isTaguigServices ? "Endorsed By" : "Dealer (DLR)"} value={dealer || '—'} />
                      <DField label="Ticket No." value={t.ticketNumber || t.ticket_number || '—'} />
                      <DField label="Control No. / SI" value={t.controlNumber || t.control_number || '—'} />
                    </div>
                  </div>

                  {/* Grid 3: Scheduling Details */}
                  <div>
                    <SHead title="Scheduling Details" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DField label="Preferred Date" value={preferredDate ? new Date(preferredDate).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—'} />
                      <DField label="Final Schedule" value={finalScheduleDate ? formatDateKeyLabel(finalScheduleDate) : '—'} green />
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
          if (value === 'RESCHED') {
            openReschedDialog(pickerTicket)
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
          void saveCellEdit(pickerTicket, 'STATUS', value)
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
========
      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Full Details Modal Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {detailTicket && (
        <TicketDetailsModal
          ticket={detailTicket}
          isLight={isLight}
          isMyTickets={isMyTickets}
          isTaguigServices={isTaguigServices}
          canEdit={canEdit}
          branchEmployees={branchEmployees}
          activeBranchId={activeBranchId}
          user={user}
          duplicateNameKeys={duplicateNameKeys}
          formatAssignedBranchLabel={formatAssignedBranchLabel}
          history={history}
          loadingHistory={loadingHistory}
          showHistoryPanel={showHistoryPanel}
          onClose={() => { setDetailTicket(null); setShowHistoryPanel(false) }}
          onToggleHistory={() => setShowHistoryPanel(prev => !prev)}
          onHideHistory={() => setShowHistoryPanel(false)}
          onEdit={() => { openEditModal(detailTicket); setDetailTicket(null); setShowHistoryPanel(false) }}
          onUpdateTicket={(updated) => {
            setDetailTicket(updated)
            setTickets(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)))
          }}
        />
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Status Picker Modal Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {statusPicker && (
        <TicketStatusPickerPopover
          picker={statusPicker}
          isLight={isLight}
          activeTab={activeTab}
          editFormStatus={editForm.status}
          tickets={tickets}
          optimisticTickets={optimisticTicketsRef.current}
          onClose={() => setStatusPicker(null)}
          onSetEditFormStatus={(status) => setEditForm(prev => ({ ...prev, status }))}
          onOpenEditModal={openEditModal}
          onOpenReschedDialog={openReschedDialog}
          onOpenContinuationDialog={openContinuationDialog}
          onOpenPaymentPrompt={(ticket, nextStatus) => {
            setPaymentPrompt({ ticket, nextStatus })
            setPromptAmount('')
            setPromptMode('CASH')
            setPromptHybridCash('')
            setPromptHybridGcash('')
          }}
          onSaveCellEdit={(ticket, colLabel, value) => { void saveCellEdit(ticket, colLabel, value) }}
        />
      )}

      {scheduleDetailsPopup && (
        <TicketScheduleDetailsPopover
          popup={scheduleDetailsPopup}
          isLight={isLight}
          dateFilter={dateFilter}
          canEdit={canEdit}
          onClose={() => setScheduleDetailsPopup(null)}
          onOpenStatusPicker={openStatusPicker}
          onOpenChecklist={(ticket) => {
            setScheduleDetailsPopup(null)
            setChecklistTicket(ticket)
          }}
          onUpdateTicket={(updated) => {
            setTickets(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)))
            setScheduleDetailsPopup(prev => prev ? { ...prev, ticket: updated } : null)
          }}
        />
      )}

      {checklistTicket && (
        <ConfirmationChecklistModal
          ticket={checklistTicket}
          isLight={isLight}
          onClose={() => setChecklistTicket(null)}
          onSaved={(updated) => {
            setTickets(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)))
            setChecklistTicket(null)
          }}
        />
      )}

      {finalDatePicker && (
        <TicketFinalDatePickerPopover
          picker={finalDatePicker}
          calMonth={finalDateCalMonth}
          isLight={isLight}
          isMyTickets={isMyTickets}
          onSetCalMonth={setFinalDateCalMonth}
          onPickDate={(dateKey) => setFinalDatePicker(prev => (prev ? { ...prev, value: dateKey } : null))}
          onClose={closeFinalDatePicker}
          onCommit={(ticket, value) => { void saveCellEdit(ticket, 'FINAL DATE', value) }}
          onClear={(ticket) => { void saveCellEdit(ticket, 'FINAL DATE', '') }}
        />
      )}

      {importResults && importResults.isOpen && (
        <ExcelImportResultsModal
          results={importResults}
          isLight={isLight}
          isTaguigServices={isTaguigServices}
          targetDate={importTargetDate}
          saving={saving}
          onClose={() => setImportResults(null)}
          onTargetDateChange={setImportTargetDate}
          onPaymentFieldChange={handlePaymentFieldChange}
          onApply={handleApplyImport}
        />
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
                      placeholder="e.g. T3 (DOMINIC) - 1"
                      onChange={e => setAddForm({ ...addForm, serviceDriver: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label={isTaguigServices ? 'Technician' : 'Installer / Technician'}>
                    <input type="text" value={addForm.installerName || ''}
                      placeholder="e.g. RYAN - 1"
                      onChange={e => setAddForm({ ...addForm, installerName: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Negotiator" required>
                    <select
                      value={addForm.negotiatorId || ''}
                      onChange={e => setAddForm({ ...addForm, negotiatorId: e.target.value })}
                      className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                      style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                    >
                      <option value="">
                        {addModalNegotiators.length ? `-- Select ${activeBranchLabel} negotiator --` : '-- No negotiators for this branch --'}
                      </option>
                      {addModalNegotiators.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
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

<<<<<<<< HEAD:src/pages/Schedules.tsx
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
========
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
            serviceDriver: editForm.serviceDriver || getTicketVehicleDisplay(editTicket),
            driverName: editForm.driverName || getTicketDriverDisplay(editTicket),
            installerName: editForm.installerName || getInstallerDisplay(editTicket, branchEmployees, activeBranchId),
            reschedulePending: Boolean(editForm.reschedulePending),
            remarks: editForm.remarks || editTicket.remarks || editTicket.remarksUpdate || '',
            commitTerms: editForm.commitTerms || editTicket.commitTerms || editTicket.commitType || '',
            assignTechId: editForm.negotiatorId || editTicket.negotiatorId || editTicket.negotiator_id || editTicket.assignedTo || '',
            assignBranchId: editForm.branchId || editTicket.branchId || editTicket.branch_id || activeBranchId || '',
            modeOfPayment: editForm.modeOfPayment || resolveTicketPayment(editTicket).mode || 'NO_PAYMENT',
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
            modeOfPayment: editForm.modeOfPayment || resolveTicketPayment(editTicket).mode || 'NO_PAYMENT',
            installationCharges: editForm.installationCharges ?? resolveTicketPayment(editTicket).amount ?? 0,
          }}
        />
      )}
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx

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
                    {isTaguigBranchRef(editForm.branchId || activeBranchId) && (
                      <Field label="Taguig branch" required>
                        <select
                          value={
                            String(editForm.branchId || '').toUpperCase().includes('SERVICE')
                              ? 'BR-TAGUIG-SERVICES'
                              : 'BR-TAGUIG-SALES'
                          }
                          onChange={e => setEditForm({ ...editForm, branchId: e.target.value })}
                          className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                        >
                          <option value="BR-TAGUIG-SALES">TAGUIG - SALES</option>
                          <option value="BR-TAGUIG-SERVICES">TAGUIG - SERVICES</option>
                        </select>
                      </Field>
                    )}
                    <Field label="Negotiator" required>
                      <select value={editForm.negotiatorId || ''}
                        onChange={e => setEditForm({ ...editForm, negotiatorId: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}>
                        <option value="">-- Select negotiator --</option>
                        {editModalNegotiators.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
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

              <div className="px-6 py-4 flex items-center justify-between border-t" style={{ borderColor: border }}>
                {canEdit ? (
                  <button onClick={() => { handleDelete(editForm.id!); setEditModalOpen(false) }}
                    className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-sm">
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    Delete Ticket
                  </button>
                ) : <div />}
                <div className="flex gap-3">
                  <button onClick={requestCloseEditModal}
                    className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
                    style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                    Cancel
                  </button>
                  <button onClick={promptSaveEditTicket}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                    style={{ backgroundColor: green }}>
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })(), document.body)}

      <ConfirmDialog dialog={confirmModal} onClose={() => setConfirmModal(null)} />

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
        const selLabel = reschedToDate
          ? new Date(`${reschedToDate}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
          : ''
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

              {/* Remarks / Reason Input */}
              <div className="px-5 pb-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>
                  Remarks / Reason <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  value={reschedRemarks}
                  onChange={e => setReschedRemarks(e.target.value.toUpperCase())}
                  placeholder="e.g. HINDI MATAWAGAN / CLIENT REQUEST"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border outline-none uppercase"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, textTransform: 'uppercase' }}
                />
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

      {paymentPrompt && (() => {
<<<<<<<< HEAD:src/pages/Schedules.tsx
        const { ticket } = paymentPrompt
        const isFree = promptMode === 'FREE' || promptMode === 'FREE INSTALL'
        const handleSubmit = (e: React.FormEvent) => {
          e.preventDefault()
          const amt = isFree ? 0 : parseFloat(promptAmount) || 0
          void saveCellEdit(ticket, 'STATUS', paymentPrompt.nextStatus, { amount: amt, modeOfPayment: promptMode })
========
        const { ticket, nextStatus } = paymentPrompt
        const isFreeOrPending = promptMode === 'FREE' || promptMode === 'FREE INSTALL' || promptMode === 'PENDING'
        const isHybrid = promptMode === 'HYBRID'
        const hybridCashNum = parseFloat(promptHybridCash) || 0
        const hybridGcashNum = parseFloat(promptHybridGcash) || 0
        const hybridTotal = hybridCashNum + hybridGcashNum
        const isDoneCleaning = nextStatus === 'DONE_CLEANING'
        const isDoneDismantle = nextStatus === 'DONE_DISMANTLE'
        const paymentPromptHint = isDoneCleaning
          ? 'Set payment to mark this cleaning ticket done'
          : isDoneDismantle
            ? 'Set payment to mark this dismantle ticket done'
            : 'Set payment to complete and archive this ticket'
        const paymentSubmitLabel = isDoneCleaning
          ? 'Complete Cleaning'
          : isDoneDismantle
            ? 'Complete Dismantle'
            : 'Complete & Archive'
        const handleSubmit = (e: React.FormEvent) => {
          e.preventDefault()
          if (isHybrid) {
            if (hybridTotal <= 0) return
            const breakdown: PaymentBreakdownEntry[] = []
            if (hybridCashNum > 0) breakdown.push({ mode: 'CASH', amount: hybridCashNum })
            if (hybridGcashNum > 0) breakdown.push({ mode: 'GCASH', amount: hybridGcashNum })
            void saveCellEdit(ticket, 'STATUS', nextStatus, { amount: hybridTotal, modeOfPayment: 'HYBRID', breakdown })
            setPaymentPrompt(null)
            return
          }
          const amt = isFreeOrPending ? undefined : parseFloat(promptAmount) || 0
          void saveCellEdit(ticket, 'STATUS', nextStatus, { amount: amt, modeOfPayment: promptMode })
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
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
                      {paymentPromptHint}
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
                    {paymentSubmitLabel}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      })()}

<<<<<<<< HEAD:src/pages/Schedules.tsx
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
========
      {/* ── Schedules "more filters" popup: whole-month + branch-negotiator, populates the main table ──── */}
      {monthFilterModalOpen && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="rounded-2xl shadow-2xl w-full max-w-2xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col border overflow-hidden shrink-0"
            style={{ backgroundColor: cardBg, borderColor: border }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b shrink-0"
              style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-full"
                  style={{ backgroundColor: isLight ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.18)' }}
                >
                  <CalendarRange className="w-4 h-4" style={{ color: green }} strokeWidth={2.1} />
                </div>
                <div>
                  <div className="text-sm font-bold tracking-wide" style={{ color: textPrimary }}>Schedule Filters</div>
                  <div className="text-[10px] font-medium" style={{ color: textMuted }}>
                    {activeBranchLabel || 'All branches'}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setMonthFilterModalOpen(false)} style={{ color: textMuted }}>
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
                <X className="w-4 h-4" />
              </button>
            </div>

<<<<<<<< HEAD:src/pages/Schedules.tsx
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
                try {
                  const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
                  const res = await fetch(`${API_BASE_URL}/tickets/bulk-assign-driver`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStr}` },
                    body: JSON.stringify({
                      installerName: bulkAssignInstaller.trim(),
                      driverName: bulkAssignDriver.trim() || undefined,
                      serviceVehicle: bulkAssignVehicle.trim() || undefined,
                      scheduleDate: dateFilter || todayDateKey(),
                      branchId: activeBranchId || undefined,
                    }),
                  })
                  if (!res.ok) throw new Error(await readApiError(res))
                  const data = await res.json()
                  const count: number = data?.data?.updatedCount ?? 0
                  // Optimistically update local tickets state
                  setTickets(prev => prev.map(t => {
                    const rawInstaller = (t.installerName || '').trim().toLowerCase()
                    const cleanInstaller = rawInstaller.split(/\s*[-–—]\s*|\s+\d+/)[0].trim()
                    const targetInstaller = bulkAssignInstaller.trim().toLowerCase()
                    const tDate = t.preferredDate || t.preferred_date || ''
                    const targetDate = dateFilter || todayDateKey()
                    if (cleanInstaller !== targetInstaller) return t
                    if (tDate && !tDate.startsWith(targetDate)) return t
                    return {
                      ...t,
                      driverName: bulkAssignDriver.trim() || t.driverName,
                      driver_name: bulkAssignDriver.trim() || t.driver_name,
                      serviceVehicle: bulkAssignVehicle.trim() || t.serviceVehicle,
                      service_vehicle: bulkAssignVehicle.trim() || t.service_vehicle,
                    }
                  }))
                  showToast(`✅ Updated ${count} ticket${count !== 1 ? 's' : ''} for ${bulkAssignInstaller}`)
                  setBulkAssignOpen(false)
                  setBulkAssignInstaller('')
                  setBulkAssignDriver('')
                  setBulkAssignVehicle('')
                  setBulkAssignTrip('1')
                } catch (err: unknown) {
                  alert(`Bulk assign failed: ${formatFetchError(err)}`)
                } finally {
                  setBulkAssignSaving(false)
                }
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

              {/* Driver dropdown */}
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
                  {/* API-sourced driver names */}
                  {driverOnlyNames.map(name => <option key={name} value={name} />)}
                  {/* Also include driver names already on visible tickets (fallback) */}
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
            <div className="flex justify-end gap-3 px-5 py-4 border-t" style={{ borderColor: 'rgba(37,99,235,0.2)', backgroundColor: isLight ? '#eff6ff' : 'rgba(37,99,235,0.06)' }}>
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
                disabled={bulkAssignSaving}
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
        </div>,
        document.body
========
            {/* Filter controls */}
            <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-col gap-1 sm:w-56 shrink-0">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                    Month
                  </label>
                  <input
                    type="month"
                    value={monthFilterMonth}
                    onChange={e => setMonthFilterMonth(e.target.value)}
                    className="h-10 px-3 rounded-xl border text-sm font-semibold outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                    Negotiator
                  </label>
                  <select
                    value={monthFilterNegotiatorId}
                    onChange={e => setMonthFilterNegotiatorId(e.target.value)}
                    className="h-10 px-3 rounded-xl border text-sm font-semibold outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    title={activeBranchLabel ? `Negotiators for ${activeBranchLabel}` : 'Filter by negotiator'}
                  >
                    <option value="">All negotiators</option>
                    {monthFilterNegotiatorOptions.map(emp => (
                      <option key={emp.id} value={emp.id}>{formatNegotiatorLabel(emp)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status — wide pill grid with colored dots, same visual language as the row STATUS picker */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                  Status
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: '', label: 'All statuses' },
                    { value: 'PENDING_GROUP', label: 'All Pending' },
                    { value: 'CLOSING_GROUP', label: 'All Closing' },
                  ].map(opt => {
                    const active = monthFilterStatus === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMonthFilterStatus(opt.value)}
                        className="px-3 h-8 rounded-full text-[11px] font-black uppercase tracking-wide transition-colors border"
                        style={active
                          ? { backgroundColor: green, borderColor: green, color: '#ffffff' }
                          : { backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {([
                  { title: 'PENDING', opts: SCHEDULE_PENDING_OPTS },
                  { title: 'CLOSING', opts: SCHEDULE_CLOSING_OPTS },
                ] as const).map(section => (
                  <div key={section.title} className="flex flex-col gap-1.5">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>
                      {section.title}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {section.opts.map(opt => {
                        const active = monthFilterStatus === opt.value
                        const style = getScheduleStatusBadgeStyle(opt.value, isLight)
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setMonthFilterStatus(active ? '' : opt.value)}
                            className="flex items-center gap-2 px-2.5 h-9 rounded-lg text-left transition-colors border min-w-0"
                            style={active
                              ? { backgroundColor: green, borderColor: green }
                              : { backgroundColor: 'transparent', borderColor: inputBorder }}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0 border"
                              style={active
                                ? { backgroundColor: '#ffffff', borderColor: '#ffffff' }
                                : { backgroundColor: style.color, borderColor: style.borderColor }}
                            />
                            <span
                              className="text-[10.5px] font-bold uppercase tracking-wide truncate"
                              style={{ color: active ? '#ffffff' : textPrimary }}
                            >
                              {opt.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {monthFilterError && (
                <div className="text-xs font-semibold text-red-500">{monthFilterError}</div>
              )}
              <button
                type="button"
                onClick={runMonthFilterQuery}
                disabled={monthFilterLoading || !monthFilterMonth}
                className="h-10 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2 shrink-0"
                style={{ backgroundColor: green }}
              >
                {monthFilterLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading…
                  </>
                ) : 'Apply'}
              </button>
              <p className="text-[11px] leading-relaxed" style={{ color: textMuted }}>
                Loads every ticket scheduled that month for this branch straight into the table below —
                narrow by negotiator and/or status. Click a day chip above (or pick a custom date) to go
                back to the normal single-day view.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {bulkAssignOpen && (
        <AssignDriversModal
          isLight={isLight}
          installer={bulkAssignInstaller}
          driver={bulkAssignDriver}
          vehicle={bulkAssignVehicle}
          saving={bulkAssignSaving}
          clearSaving={bulkClearSaving}
          visible={visible}
          dateFilter={dateFilter}
          activeBranchId={activeBranchId}
          driverOnlyNames={driverOnlyNames}
          onClose={() => setBulkAssignOpen(false)}
          onInstallerChange={setBulkAssignInstaller}
          onDriverChange={setBulkAssignDriver}
          onVehicleChange={setBulkAssignVehicle}
          onSetSaving={setBulkAssignSaving}
          setTickets={setTickets}
          schedulesCacheKeyForTab={schedulesCacheKeyForTab}
          onShowToast={showToast}
          onClearAll={clearAllDriversAndVehiclesForDate}
        />
      )}


      {customDatePickerOpen && (
        <CustomDatePickerModal
          isLight={isLight}
          calMonth={customDateCalMonth}
          dateFilter={dateFilter}
          onSetCalMonth={setCustomDateCalMonth}
          onSelectDate={(dateKey) => {
            handleDateFilterChange(dateKey)
            setCustomDatePickerOpen(false)
          }}
          onClose={() => setCustomDatePickerOpen(false)}
        />
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
>>>>>>>> 9eaec1af752f17756a4a81d7c292d3928586afd4:src/pages/Tickets.tsx
      )}
    </div>

    {/* ── Schedules Showcase (print / PDF view) ──────────────────────── */}
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
      />
    )}
    </>
  )
}

<<<<<<<< HEAD:src/pages/Schedules.tsx
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

