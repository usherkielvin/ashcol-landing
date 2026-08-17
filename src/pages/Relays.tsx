import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactDOM from 'react-dom'
import { ResponsiveTable, type ColumnDef as ResponsiveColumnDef } from '../components/ResponsiveTable'
import {
  Search, FileSpreadsheet, AlertTriangle, X, FileText, Loader2, Inbox,
  Building2, Trash2, MapPin,
  ChevronDown, Plus, CheckCircle2, AlertCircle, Package, CalendarDays,
  Eye, Phone, LayoutGrid, List, CheckSquare, Square, Edit3, Clock, Check,
  Store, UserRound, Wind, MessageSquare, Users, Settings, Truck, Wallet, CreditCard
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin, branchScopesMatch, filterBranchNegotiators, isNegotiatorCandidate, readApiError, resolvePortalWriteBranchId, fetchTicketsPage, parseCreatedTicketResponse, formatFetchError, EMPLOYEES_DIRECTORY_UPDATED_EVENT, PROFILE_UPDATED_EVENT, isTaguigServiceTicket, DEALERS_UPDATED_EVENT, notifyDealersUpdated, canMemberAccessRelaysAndTicketCreation } from '../utils/api'
import { deriveRosterFromEmployees } from '../utils/branchRoster'
import { readTabCache, readTabCacheEntry, relaysCacheKey, writeTabCache, isTabCacheFresh, type RelaysTabCache, clearWarrantyCache, TAB_CACHE_UPDATED, syncTicketAcrossTabCaches } from '../utils/ticketTabCache'
import {
  hasRelayLeftQueue,
  normalizeRelayScheduleTicket,
  normalizeRelayScheduleTicketList,
  resolveRelayFinalDate,
  mergeRelayScheduleTicketPatch,
  applyRelayScheduleSyncToPatch,
} from '../utils/relayScheduleSync'
import { fetchCachedBranches, fetchCachedEmployees } from '../utils/portalDirectoryCache'
import { formatBrandCapacityLabel, parseBrandFromAcDetails } from '../utils/warrantyTicketDisplay'
import { resolveScheduleStatusFields } from '../constants/ticketCategories'
import { RelayEditTicketModal } from '../components/relays/RelayEditTicketModal'
import { extractRelayTicketsFromExcel, type ExtractedRelayTicket } from '../utils/excelRelayExtraction'
import { matchExcelDealers, type DealerParseResult } from '../utils/excelBranchMatcher'
import { resetTicketTableScroll } from '../utils/tabSwitch'
import type { RelayEditDraft } from '../components/relays/relayEditForm'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import { DealerSelect } from '../components/DealerSelect'
import { ROBINSON_APPLIANCES_RE } from '../utils/dealer'
import { guessDistrict } from '../utils/districtGuesser'
import type { ReactNode } from 'react'

function RelayFormField({
  label,
  required,
  compact,
  className = '',
  children,
}: {
  label: string
  required?: boolean
  compact?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label className={`font-bold uppercase tracking-wide block text-slate-500 dark:text-slate-400 ${compact ? 'text-[10.5px] mb-1.5' : 'text-[11px] mb-1.5'}`}>
        {label}{required ? <span className="text-emerald-500 ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  )
}

function RelayFormSectionHead({
  title,
  subtitle,
  step,
  icon: Icon,
}: {
  title: string
  subtitle?: string
  step?: number
  icon?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 pt-0.5 pb-2.5 border-b border-slate-200 dark:border-slate-700 mb-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
        {Icon ?? <span className="text-[11px] font-black">{step}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-[11.5px] font-black uppercase tracking-wider text-emerald-600 leading-tight">{title}</p>
        {subtitle && <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-tight mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}



interface Ticket {
  id: string
  customerId: string
  createdBy?: string
  customerName?: string
  customerEmail?: string
  customerPersonalEmail?: string
  title: string
  description: string
  serviceType: string
  ticketCategory?: string
  ticket_category?: string
  status: string
  branchId?: string
  assignedTo?: string
  assignedEmployeeName?: string
  location?: string
  images?: string
  contactPhone?: string
  unitType?: string
  acDetails?: string
  preferredDate?: string
  createdAt: string
  updatedAt: string
  dealer?: string
  diser?: string
  sourceVendor?: string
  slaExpirationDate?: string
  priorityTag?: string
  district?: string
  commitType?: string
  installerName?: string
  driverName?: string
  serviceVehicle?: string
  remarksUpdate?: string
  installationCharges?: number
  modeOfPayment?: string
  controlNumber?: string
  ticketNumber?: string
  warrantyRegistrationCompleted?: boolean
  warrantyRegistrationCompletedAt?: string
  warrantyRegistrationCompletedBy?: string
  warrantyDocsStatus?: string
  assignedAt?: string
  negotiatorId?: string
  negotiator_id?: string
  negotiatorName?: string
  finalDate?: string
  final_date?: string
  storeReferralFee?: number | string
  store_referral_fee?: number | string
  promodiserCommission?: number | string
  promodiser_commission?: number | string
}


type DealerCategory = 'Robinsons' | 'Abenson' | 'Direct' | 'Other'

const parseDealer = (dealerValue?: string): { store: DealerCategory; branch: string; customStore?: string } => {
  const sv = (dealerValue || '').trim()
  const lower = sv.toLowerCase()

  if (lower === 'direct') {
    return { store: 'Direct', branch: '' }
  }

  // Robinson Appliances: saved as "RA <BRANCH>" going forward; also recognize legacy
  // "Robinsons ..." / "Robinsons Appliances - <branch>" formats already in the database.
  if (ROBINSON_APPLIANCES_RE.test(sv)) {
    const branch = sv.replace(/^(robinsons?(\s+appliances)?|ra)\s*-?\s*/i, '').trim()
    return { store: 'Robinsons', branch }
  }

  if (/^abenson/i.test(sv)) {
    const branch = sv.replace(/^abenson(\s+appliances|\s+app|\s+appl|\s+store|\s+b2b)?\s*-?\s*/i, '').trim()
    return { store: 'Abenson', branch }
  }

  // Fallback: split by ' - ' for any other/custom dealer
  const parts = sv.split(' - ')
  const dealerName = parts[0]?.trim() || ''
  const branchName = parts.slice(1).join(' - ').trim()
  return { store: 'Other', branch: branchName, customStore: dealerName }
}

const combineDealer = (store: DealerCategory, branch: string, customStore?: string): string => {
  if (store === 'Direct') return 'Direct'
  if (store === 'Other') {
    const s = (customStore || '').trim()
    const b = branch.trim()
    if (!s) return 'Other'
    return b ? `${s} - ${b}` : s
  }
  if (store === 'Robinsons') {
    const b = branch.trim()
    return b ? `RA ${b}` : 'RA'
  }
  const b = branch.trim()
  if (!b) return store
  if (b.toLowerCase().startsWith(store.toLowerCase())) return b
  return `${store} ${b}`
}

function resolveRelayDealerForSubmit(dealerValue: string, dealerBranch: string) {
  const vendor = (dealerValue || 'Direct').trim()
  const lower = vendor.toLowerCase()
  if (ROBINSON_APPLIANCES_RE.test(lower)) {
    return combineDealer('Robinsons', dealerBranch)
  }
  if (lower === 'abenson' || lower.startsWith('abenson')) {
    return combineDealer('Abenson', dealerBranch)
  }
  return combineDealer('Other', dealerBranch, vendor)
}



const FormatPhone = ({ raw }: { raw: string | null | undefined }): React.ReactNode => {
  if (!raw) return <span className="text-slate-400 font-normal italic">—</span>
  
  let digits = raw.replace(/\D/g, '')
  const numbers: string[] = []

  while (digits.length >= 10) {
    if (digits.startsWith('63') && digits.length >= 12) {
      numbers.push('0' + digits.slice(2, 12))
      digits = digits.slice(12)
    } else if (digits.startsWith('09') && digits.length >= 11) {
      numbers.push(digits.slice(0, 11))
      digits = digits.slice(11)
    } else if (digits.startsWith('9') && digits.length >= 10) {
      numbers.push('0' + digits.slice(0, 10))
      digits = digits.slice(10)
    } else {
      digits = digits.slice(1) // Shift 1 if invalid format to keep looking
    }
  }

  const finalNumbers = numbers.slice(0, 2).map(num => {
    return num.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')
  })

  if (finalNumbers.length === 0) return <span className="font-mono">{raw}</span>

  return (
    <div className="flex flex-col gap-1 font-mono font-semibold">
      {finalNumbers.map((num, i) => (
        <span key={i} className="whitespace-nowrap">{num}</span>
      ))}
    </div>
  )
}

function formatPhilippinePhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63')) {
    digits = `0${digits.slice(2)}`
  } else if (digits.startsWith('9') && !digits.startsWith('09')) {
    digits = `0${digits}`
  }
  digits = digits.slice(0, 11)
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
}

/** Splits a pasted blob like "0917 869 4260   0946 735 5566" (or comma/newline separated) into
 *  separate phone numbers. Only tokens with >=10 digits count as a distinct number, so pasting a
 *  single already-spaced number ("0917 869 4260") still yields one token, not three. */
function extractPhoneNumbers(raw: string): string[] {
  const tokens = raw.split(/[,;\n/]+|\s{2,}/).map(t => t.trim()).filter(Boolean)
  const candidates = tokens.length > 1 ? tokens : raw.trim().split(/\s+/)
  const numbers: string[] = []
  for (const tok of candidates) {
    const digits = tok.replace(/\D/g, '')
    if (digits.length >= 10) numbers.push(tok)
  }
  return numbers
}

const parseAcDetails = (ticket: Ticket) => {
  const fallback = {
    landmarks: '',
    brand: '',
    capacity: '',
    sku: '',
    serialNumber: '',
    alternatePhone: '',
    relayedDate: '',
    finalDate: '',
    scheduledDate: '',
    reschedulePending: false,
    promodiserName: '',
    referralFeeRecipient: '',
    referralFeeAmount: '',
    referralFeeStatus: '',
    referralFeeDatePaid: '',
    referralFeeReferenceNo: '',
    forRebatesClaim: 'YES',
    rebatesCompany: '',
    rebatesAmountDue: '',
    rebatesStatus: '',
    rebatesReferenceNo: '',
    warrantyRegistrationStatus: '',
    warrantyRegisteredBy: '',
  }
  if (!ticket.acDetails) {
    return { ...fallback, finalDate: resolveRelayFinalDate(ticket) }
  }
  try {
    const parsed = JSON.parse(ticket.acDetails)
    const finalDate = resolveRelayFinalDate(ticket)
      || String(parsed?.finalDate || parsed?.final_date || '').trim().split('T')[0].split(' ')[0]
    return { ...fallback, ...parsed, finalDate }
  } catch (e) {
    return { ...fallback, finalDate: resolveRelayFinalDate(ticket) }
  }
}

const resolveRelayActorName = (raw: string | undefined, employees: Array<Record<string, unknown>>) => {
  const value = (raw || '').trim()
  if (!value) return 'System'
  const match = employees.find(e =>
    String(e.id || '') === value
    || String(e.email || '').toLowerCase() === value.toLowerCase()
    || String(e.name || '').toLowerCase() === value.toLowerCase(),
  )
  return match?.name ? String(match.name) : value
}

const buildRelayHistoryTimeline = (
  ticket: Ticket,
  history: any[],
  employees: Array<Record<string, unknown>>,
  formatBranchLabel: (branchId?: string) => string,
) => {
  const list = [...history]
  const branchLabel = formatBranchLabel(ticket.branchId)
  const negotiatorName = (
    ticket.negotiatorName
    || ticket.assignedEmployeeName
    || resolveRelayActorName(ticket.assignedTo || ticket.negotiatorId || ticket.negotiator_id, employees)
    || ''
  ).trim()

  const hasSubmission = list.some(h => {
    const note = String(h.changeNote || '').toLowerCase()
    return note.includes('submitted') || note.includes('created') || (!h.previousStatus && h.newStatus === 'PENDING')
  })

  if (!hasSubmission && ticket.createdAt) {
    list.push({
      id: 'initial-sub',
      changeNote: 'Ticket submitted',
      changedByUserName: resolveRelayActorName(ticket.createdBy || ticket.customerEmail, employees),
      createdAt: ticket.createdAt,
      newPreferredDate: ticket.preferredDate,
    })
  }

  const hasBranchAssignment = list.some(h => {
    const note = String(h.changeNote || '').toLowerCase()
    return note.includes('assigned to') || (h.newAssignedToName && h.newStatus === 'ASSIGNED')
  })

  if (!hasBranchAssignment && branchLabel && branchLabel !== '—' && (ticket.assignedTo || ticket.negotiatorId || ticket.negotiator_id)) {
    list.push({
      id: 'branch-assignment',
      changeNote: `Assigned to ${branchLabel}${negotiatorName ? ` — ${negotiatorName}` : ''}`,
      changedByUserName: negotiatorName || resolveRelayActorName(ticket.createdBy, employees),
      createdAt: ticket.assignedAt || ticket.updatedAt || ticket.createdAt,
      newStatus: 'ASSIGNED',
      newAssignedToName: negotiatorName || undefined,
    })
  }

  const legacyRemark = (ticket.remarksUpdate || '').trim()
  if (legacyRemark) {
    const alreadyLogged = list.some((h) => String(h.changeNote || '').trim() === legacyRemark)
    if (!alreadyLogged) {
      list.push({
        id: 'legacy-remark',
        changeNote: legacyRemark,
        changedByUserName: resolveRelayActorName(ticket.createdBy || ticket.customerEmail, employees),
        createdAt: ticket.updatedAt || ticket.createdAt,
        isRemarkEntry: true,
      })
    }
  }

  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

const resolveNegotiatorUserId = (ticket: Pick<Ticket, 'negotiatorId' | 'negotiator_id' | 'assignedTo'>) =>
  String(ticket.negotiatorId || ticket.negotiator_id || ticket.assignedTo || '').trim()

const resolveRelayNegotiatorName = (
  ticket: Ticket,
  employees: Array<{ id?: string; name?: string }>,
) => {
  let fullName = ''
  const byField = (ticket.negotiatorName || '').trim()
  if (byField) {
    fullName = byField
  } else {
    const uid = resolveNegotiatorUserId(ticket)
    if (uid) {
      const match = employees.find((e) => String(e.id || '') === uid)
      if (match?.name) fullName = String(match.name).trim()
    }
  }
  if (!fullName) {
    fullName = (ticket.assignedEmployeeName || '').trim()
  }
  if (!fullName) return '—'
  return fullName.split(/\s+/)[0]
}

const resolveEmployeePhone = (employees: Array<Record<string, unknown>>, userId?: string) => {
  if (!userId) return ''
  const emp = employees.find(e => String(e.id || '') === userId)
  return String(emp?.phone || '').trim()
}

const formatMoney = (val?: string | number | null) => {
  if (val == null || val === '') return '—'
  const n = Number(val)
  if (Number.isNaN(n)) return String(val)
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const getRelayStatusLabel = (ticket: Ticket) => {
  const status = (ticket.status || '').toUpperCase()
  const finalDate = resolveRelayFinalDate(ticket)
  const negotiatorId = (ticket.negotiatorId || ticket.negotiator_id || '').trim()
  const details = parseAcDetails(ticket)
  const hasScheduledDate = Boolean(details.scheduledDate?.trim() || details.scheduleIntake || status === 'SCHEDULED')
  const isReschedPending = status === 'RESCHED'
    && (details.reschedulePending === true || String(details.reschedulePending).toLowerCase() === 'true')

  if (getTicketCategory(ticket) === 'Collection' && !isCollectionPaid(ticket)) return 'Pending'
  if (status === 'CANCELLED') return 'Cancelled'
  if (status === 'COMPLETED' || status === 'INSTALLED' || !!(ticket.installationCharges && ticket.installationCharges > 0)) return 'Installed'

  // A reschedule with no new date decided yet stays in the negotiator's queue (Assigned) — it
  // must not fall through to Schedules just because stale finalDate/scheduledDate metadata from
  // before the reschedule is still on the ticket.
  if (isReschedPending) return 'Assigned'

  // finalDate / schedule phase = on Schedules tab, not relay assigned queue
  if (finalDate || hasRelayLeftQueue(ticket) || hasScheduledDate) return 'Scheduled'
  
  // Check specific backend lifecycle statuses before the generic "has a negotiator" fallback below,
  // otherwise every assigned ticket collapses to "Assigned" regardless of its real stage.
  if (status === 'SURVEY') return 'Survey'
  if (status === 'FOR_APPROVAL') return 'For Quotation'
  if (status === 'CONTINUATION') return 'Continuation'
  if (status === 'SYSTEM_REPROCESS') return 'System Reprocess'
  if (status === 'DONE_SYSTEM_REPROCESS') return 'Done System Reprocess'
  if (status === 'DISMANTLE') return 'Dismantle'
  if (status === 'DONE_DISMANTLE') return 'Done Dismantle'
  if (status === 'IN_PROGRESS') return 'In Progress'
  if (status === 'ON_THE_WAY') return 'On the Way'
  
  // Backend stores the negotiator on negotiatorId and clears assignedTo for relay intake.
  if (
    status === 'ASSIGNED'
    || status === 'RESCHED'
    || ticket.assignedTo
    || negotiatorId
    || ticket.negotiatorName?.trim()
    || ticket.assignedEmployeeName?.trim()
  ) {
    return 'Assigned'
  }
  return 'Pending'
}

const ticketCategoryOf = (ticket: Ticket) =>
  (ticket.ticketCategory || ticket.ticket_category || '').trim().toUpperCase()

const isWarrantyRegistrationTicket = (ticket: Ticket) => {
  if (ticketCategoryOf(ticket) === 'WTY_REGISTRATION') return true
  const svc = (ticket.serviceType || '').toLowerCase()
  return svc.includes('wty') || svc.includes('warranty registration')
}

const hasPendingWarrantySignal = (ticket: Ticket) => {
  const details = parseAcDetails(ticket)
  const blob = [
    ticket.remarksUpdate,
    ticket.description,
    ticket.title,
    ticket.commitType,
    ticket.serviceType,
    ticket.warrantyDocsStatus,
    ticket.acDetails,
    details.warrantyRegistrationStatus,
  ].filter(Boolean).join(' ').toLowerCase()

  if (blob.includes('pending warranty')) return true
  if (blob.includes('warranty reg')) return true
  if (blob.includes('warranty') && blob.includes('pending')) return true
  if ((ticket.commitType || '').toLowerCase().includes('warranty')
    && (blob.includes('pending') || blob.includes('regi') || blob.includes('register'))) {
    return true
  }

  const wStatus = (details.warrantyRegistrationStatus || ticket.warrantyDocsStatus || '').trim().toUpperCase()
  if (wStatus === 'PENDING') return true

  return false
}

const isRelayPostInstallWarranty = (ticket: Ticket) => {
  const details = parseAcDetails(ticket)
  if (!details.finalDate?.trim()) return false
  return hasPendingWarrantySignal(ticket)
    || (ticket.warrantyDocsStatus || '').toUpperCase() === 'PENDING'
    || (ticket.commitType || '').toLowerCase().includes('warranty')
}

/** Negotiator set install date — ticket belongs on Schedules, not Relays. */
const hasRelayFinalScheduleDate = (ticket: Ticket) => hasRelayLeftQueue(ticket)

/** Ticket created/imported on Schedules (not a Relays negotiation row). */
const isScheduledManualTicket = (ticket: Ticket): boolean => {
  const details = parseAcDetails(ticket)
  const source = String((ticket as Ticket & { source?: string }).source || '').trim().toUpperCase()
  if (source === 'SCHEDULE_MANUAL') return true

  // Store/source vendors are relay intake. Older builds wrongly stamped scheduleIntake on
  // those rows when preferredDate was set — keep them on Relays until finalDate is set.
  const vendor = (ticket.dealer || ticket.sourceVendor || '').trim().toLowerCase()
  const isRelayVendor = Boolean(
    vendor
    && vendor !== 'direct'
    && vendor !== 'other'
    && !vendor.startsWith('direct '),
  )
  if (isRelayVendor) return false

  // Schedule-tab markers only (manual add / excel import on Schedules).
  if (details.scheduleIntake === true || details.scheduleIntake === 'true') return true
  if (details.scheduledDate?.trim()) return true
  return false
}

/** Warranty queue rows belong on Archives + Registration, not the Relays masterlist. */
const shouldExcludeFromRelaysTab = (ticket: Ticket) => {
  if (isWarrantyRegistrationTicket(ticket)) return true
  if (hasPendingWarrantySignal(ticket)) return true
  if (isRelayPostInstallWarranty(ticket)) return true
  // Schedule-tab intake (manual / import / input) must stay on Schedules only.
  if (isScheduledManualTicket(ticket)) return true
  if (hasRelayFinalScheduleDate(ticket)) return true
  if (getRelayStatusLabel(ticket) === 'Installed') return true
  return false
}

const filterRelaysTickets = (list: Ticket[]) => {
  const leftQueueNumbers = new Set(
    list.filter(hasRelayLeftQueue).map(t => normalizeRelayTicketNumber(t)).filter(Boolean) as string[],
  )
  const leftQueueCustomers = new Set(
    list.filter(hasRelayLeftQueue).map(normalizeRelayCustomerKey).filter(Boolean) as string[],
  )
  return list.filter(t => {
    if (shouldExcludeFromRelaysTab(t)) return false
    const ticketNo = normalizeRelayTicketNumber(t)
    if (ticketNo && leftQueueNumbers.has(ticketNo) && !hasRelayLeftQueue(t)) return false
    const customerKey = normalizeRelayCustomerKey(t)
    if (customerKey && leftQueueCustomers.has(customerKey) && !hasRelayLeftQueue(t)) return false
    return true
  })
}

const normalizeRelayTicketNumber = (ticket: Pick<Ticket, 'ticketNumber'>): string | null => {
  const raw = ticket.ticketNumber?.trim()
  if (!raw) return null
  const legacy = raw.match(/^TKT-0*(\d+)$/i)
  if (legacy) {
    const seq = parseInt(legacy[1], 10)
    return Number.isFinite(seq) ? `AS-${String(seq).padStart(3, '0')}` : raw.toUpperCase()
  }
  const ashcol = raw.match(/^AS-0*(\d+)$/i)
  if (ashcol) {
    const seq = parseInt(ashcol[1], 10)
    return Number.isFinite(seq) ? `AS-${String(seq).padStart(3, '0')}` : raw.toUpperCase()
  }
  return raw.toUpperCase()
}

const relayTicketDisplayScore = (ticket: Ticket) => {
  let score = 0
  if (resolveRelayFinalDate(ticket)) score += 100
  if (hasRelayLeftQueue(ticket)) score += 80
  const label = getRelayStatusLabel(ticket)
  if (label === 'Scheduled') score += 50
  if (label === 'Assigned') score += 25
  if (ticket.assignedTo) score += 20
  if (ticket.negotiatorId || ticket.negotiatorName) score += 10
  if (ticket.installerName) score += 5
  return score
}

const normalizeRelayCustomerKey = (ticket: Ticket): string | null => {
  const name = (ticket.customerName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (name.length < 4) return null
  const branch = (ticket.branchId || '').trim().toLowerCase()
  const phone = (ticket.contactPhone || '').replace(/\D/g, '').slice(-10)
  const preferred = (ticket.preferredDate || '').trim().slice(0, 10)
  const district = (ticket.district || '').trim().toLowerCase()
  const vendor = (ticket.dealer || ticket.sourceVendor || '').trim().toLowerCase()
  const commit = (ticket.commitType || '').trim().toLowerCase()
  return `${name}|${branch}|${phone}|${preferred}|${district}|${vendor}|${commit}`
}

const relayCustomerPhonesMatch = (a: Ticket, b: Ticket): boolean => {
  const phoneA = (a.contactPhone || '').replace(/\D/g, '').slice(-10)
  const phoneB = (b.contactPhone || '').replace(/\D/g, '').slice(-10)
  if (!phoneA || !phoneB) return true
  return phoneA === phoneB
}

const isRelayCustomerDuplicate = (candidate: Ticket, existing: Ticket): boolean => {
  const candidateKey = normalizeRelayCustomerKey(candidate)
  const existingKey = normalizeRelayCustomerKey(existing)
  if (!candidateKey || !existingKey || candidateKey !== existingKey) return false
  return relayCustomerPhonesMatch(candidate, existing)
}

/** One row per customer / ticket number on Relays — prefer the scheduled copy. */
const dedupeRelaysDisplay = (list: Ticket[]) => {
  const byCustomer = new Map<string, Ticket>()
  const withoutCustomerKey: Ticket[] = []
  for (const ticket of list) {
    const key = normalizeRelayCustomerKey(ticket)
    if (!key) {
      withoutCustomerKey.push(ticket)
      continue
    }
    const existing = byCustomer.get(key)
    if (!existing || relayTicketDisplayScore(ticket) > relayTicketDisplayScore(existing)) {
      byCustomer.set(key, ticket)
    }
  }
  return dedupeRelaysDisplayByTicketNumber([...byCustomer.values(), ...withoutCustomerKey])
}

/** One row per ticket number on Relays — prefer the scheduled copy. */
const dedupeRelaysDisplayByTicketNumber = (list: Ticket[]) => {
  const byNumber = new Map<string, Ticket>()
  const withoutNumber: Ticket[] = []
  for (const ticket of list) {
    const key = normalizeRelayTicketNumber(ticket)
    if (!key) {
      withoutNumber.push(ticket)
      continue
    }
    const existing = byNumber.get(key)
    if (!existing || relayTicketDisplayScore(ticket) > relayTicketDisplayScore(existing)) {
      byNumber.set(key, ticket)
    }
  }
  return [...byNumber.values(), ...withoutNumber].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  )
}

function mergeRelayTicketLists(server: Ticket[], local: Ticket[]): Ticket[] {
  const byId = new Map<string, Ticket>()
  const pick = (a: Ticket, b: Ticket) =>
    relayTicketDisplayScore(b) > relayTicketDisplayScore(a) ? b : a

  for (const t of server) {
    if (!t?.id) continue
    const existing = byId.get(t.id)
    byId.set(t.id, existing ? pick(existing, t) : t)
  }
  for (const t of local) {
    if (!t?.id) continue
    const existing = byId.get(t.id)
    if (!existing) {
      byId.set(t.id, t)
      continue
    }
    if (t.id.startsWith('temp-')) continue
    byId.set(t.id, pick(existing, t))
  }
  return Array.from(byId.values()).sort((a, b) => {
    const da = String(a.createdAt || '')
    const db = String(b.createdAt || '')
    return db.localeCompare(da)
  })
}

const getTicketCategory = (ticket: Ticket) => {
  const raw = `${ticket.serviceType || ''} ${ticket.title || ''}`.toLowerCase()
  if (raw.includes('collection') || raw.includes('collect')) return 'Collection'
  if (raw.includes('install') || raw.includes('s/i') || raw.includes(' si ')) return 'Survey & Install'
  if (raw.includes('survey')) return 'Survey'
  if (raw.includes('service') || raw.includes('clean')) return 'Service'
  return ticket.serviceType || 'Service'
}

const isCollectionPaid = (ticket: Ticket) => {
  const hasAmount = !!(ticket.installationCharges && ticket.installationCharges > 0)
  const hasPayment = !!(ticket.modeOfPayment && ticket.modeOfPayment.trim())
  const remarks = (ticket.remarksUpdate || '').toLowerCase()
  return hasAmount && (hasPayment || remarks.includes('paid') || remarks.includes('collected'))
}

/** Searchable dealer dropdown for resolving unmatched Excel dealers */
function UnmatchedDealerDropdown({ dealerName, dealers, value, onChange, isLight, inputBg, inputBorder, textPrimary, textMuted }: {
  dealerName: string
  dealers: { id: string; name: string }[]
  value: string
  onChange: (val: string) => void
  isLight: boolean
  inputBg: string
  inputBorder: string
  textPrimary: string
  textMuted: string
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return dealers
    const q = search.toUpperCase()
    return dealers.filter(d => d.name.toUpperCase().includes(q))
  }, [dealers, search])

  const selectedDealer = dealers.find(d => d.id === value)
  const displayValue = value === '__ADD_NEW__'
    ? `➕ Add "${dealerName}" as new dealer`
    : selectedDealer
      ? `✅ ${selectedDealer.name}`
      : ''

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left rounded-lg border px-3 py-2 text-[11px] font-bold outline-none transition-all"
        style={{
          backgroundColor: inputBg,
          borderColor: value ? (value === '__ADD_NEW__' ? '#f59e0b' : '#10B981') : inputBorder,
          color: value ? textPrimary : textMuted,
        }}
      >
        {displayValue || 'Select existing dealer or add new...'}
      </button>
      {open && (
        <div
          className="z-50 mt-1 w-full rounded-xl border shadow-xl overflow-hidden"
          style={{ backgroundColor: inputBg, borderColor: inputBorder }}
        >
          <div className="p-2" style={{ borderBottom: `1px solid ${inputBorder}` }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search dealers..."
              autoFocus
              className="w-full rounded-lg border px-2.5 py-1.5 text-[11px] font-medium outline-none"
              style={{ backgroundColor: isLight ? '#fff' : '#0A1120', borderColor: inputBorder, color: textPrimary }}
            />
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            {/* Add as new option */}
            <button
              type="button"
              onClick={() => { onChange('__ADD_NEW__'); setOpen(false); setSearch('') }}
              className="w-full text-left px-3 py-2 text-[11px] font-bold hover:bg-amber-500/10 transition-colors"
              style={{ color: '#f59e0b' }}
            >
              ➕ Add "{dealerName}" as new dealer
            </button>
            {/* Existing dealers */}
            {filtered.length > 0 ? filtered.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => { onChange(d.id); setOpen(false); setSearch('') }}
                className="w-full text-left px-3 py-2 text-[11px] font-medium hover:bg-emerald-500/10 transition-colors"
                style={{ color: textPrimary }}
              >
                {d.name}
              </button>
            )) : (
              <p className="px-3 py-2 text-[10px] font-medium" style={{ color: textMuted }}>No dealers found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Relays() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // Set when the Add Ticket modal was opened from a Bookings row ("Convert to Ticket") — the
  // originating booking gets marked CONVERTED once the ticket is actually created below.
  const bookingPrefillIdRef = useRef('')
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  const canEdit = !!user && role !== 'customer'
  const isAdminOrManagement = role === 'admin' || role === 'management' || role === 'administrator'

  // Colors
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const pageBg = isLight ? '#f1f5f9' : '#060B18'
  const hoverBg = isLight ? '#f1f5f9' : '#0F1A2E'
  const compactInput = `w-full border rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all duration-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15`

  // State
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [openFieldTickets, setOpenFieldTickets] = useState<Ticket[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  
  const resolveBranch = (branchIdOrName?: string) => {
    if (!branchIdOrName) return null
    // 1. Direct ID match
    let found = branches.find(b => b.id === branchIdOrName)
    if (found) return found

    // 2. Name-based match if branchIdOrName is a branch name
    found = branches.find(b => b.name.toLowerCase() === branchIdOrName.toLowerCase())
    if (found) return found

    // 3. Legacy hardcoded ID mapping
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

    // 4. Loose substring name match
    found = branches.find(b => b.name.toLowerCase().includes(idLower) || idLower.includes(b.name.toLowerCase()))
    if (found) return found

    return null
  }

  const formatAssignedBranchLabel = (branchId?: string) => {
    const resolved = resolveBranch(branchId)
    if (!resolved && !branchId) return '—'
    const id = (resolved?.id || branchId || '').toUpperCase()
    const name = resolved?.name || ''
    if (id === 'BR-TAGUIG-SALES' || id.endsWith('-SALES')) return 'TAGUIG - SALES'
    if (id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || id.endsWith('-SERVICES') || id.endsWith('-SERVICE')) {
      return 'TAGUIG - SERVICES'
    }
    return formatBranchName(name) || '—'
  }

  const [loading, setLoading] = useState(true)
  const [lastUpdatedTicketId, setLastUpdatedTicketId] = useState<string | null>(null)
  useEffect(() => {
    if (lastUpdatedTicketId) {
      const timer = setTimeout(() => {
        setLastUpdatedTicketId(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [lastUpdatedTicketId])

  const [refreshing, setRefreshing] = useState(false)

  const fetchSeqRef = useRef(0)
  const hasLoadedOnceRef = useRef(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [storeFilter, setStoreFilter] = useState('ALL')
  const [branchFilter, setBranchFilter] = useState('ALL')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const monthOptions = useMemo(() => {
    const seen = new Set<string>()
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(seen).sort().reverse()
  }, [])
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  const [activeTab, setActiveTab] = useState<'ALL_PENDING' | 'UNASSIGNED' | 'PENDING' | 'MY_TICKETS'>(() => {
    const roleLower = (localStorage.getItem('ashcol-role') || sessionStorage.getItem('ashcol-role') || '').toLowerCase()
    const isPriv = roleLower === 'admin' || roleLower === 'management' || roleLower === 'administrator'
    return isPriv ? 'ALL_PENDING' : 'MY_TICKETS'
  })
  const [isStoreFilterOpen, setIsStoreFilterOpen] = useState(false)

  const [isBranchFilterOpen, setIsBranchFilterOpen] = useState(false)
  const [isMonthFilterOpen, setIsMonthFilterOpen] = useState(false)

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
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (!target) return
      if (!target.closest('[data-dropdown-id="store-filter"]') && !target.closest('[data-dropdown-id="store-dropdown"]')) {
        setIsStoreFilterOpen(false)
      }
      if (!target.closest('[data-dropdown-id="branch-filter"]') && !target.closest('[data-dropdown-id="branch-dropdown"]')) {
        setIsBranchFilterOpen(false)
      }
      if (!target.closest('[data-dropdown-id="month-filter"]') && !target.closest('[data-dropdown-id="month-dropdown"]')) {
        setIsMonthFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const ticketScope: 'ALL' | 'MY' = !isAdmin ? 'MY' : 'ALL'

  // New States for Row-click Quick Actions and read-only Job Sheet View
  const [selectedPreviewTicket, setSelectedPreviewTicket] = useState<Ticket | null>(null)
  const [selectedColIndex, setSelectedColIndex] = useState<number>(-1)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (!selectedPreviewTicket || !isViewModalOpen) {
      setHistory([])
      return
    }
    setLoadingHistory(true)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    fetch(`${API_BASE_URL}/tickets/${selectedPreviewTicket.id}/history`, {
      headers: {
        Authorization: `Bearer ${token}`
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
  }, [selectedPreviewTicket, isViewModalOpen])

  // Excel Bulk Upload State
  const [excelPreview, setExcelPreview] = useState<any[]>([])
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [importTargetBranchId, setImportTargetBranchId] = useState('')
  const [previewView, setPreviewView] = useState<'grid' | 'list'>('grid')
  const [selectedPreviewIds, setSelectedPreviewIds] = useState<Set<string>>(new Set())

  // Manual & Scan Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([])

  // Excel Import State. Every extracted row becomes an independent draft so changing one
  // ticket's schedule, branch, or negotiator never changes the other imported tickets.
  type EditableExcelRelayTicket = ExtractedRelayTicket & {
    branchId: string
    assignedTo: string
  }
  const [excelTickets, setExcelTickets] = useState<EditableExcelRelayTicket[]>([])
  const [excelDate, setExcelDate] = useState('')
  const [excelFileName, setExcelFileName] = useState('')
  const [showExcelPicker, setShowExcelPicker] = useState(false)
  const [openedFromExcel, setOpenedFromExcel] = useState(false)
  const [excelEditingIndex, setExcelEditingIndex] = useState<number | null>(null)
  const [excelContextMenu, setExcelContextMenu] = useState<{ idx: number; x: number; y: number } | null>(null)
  const [excelSelectMode, setExcelSelectMode] = useState(false)
  const [excelSelectedIdxs, setExcelSelectedIdxs] = useState<Set<number>>(new Set())
  const [excelExistingMap, setExcelExistingMap] = useState<Map<string, Ticket>>(new Map())
  const excelFileRef = useRef<HTMLInputElement>(null)
  // Track which ticket indices have been individually overridden so bulk header changes
  // don't overwrite manual per-ticket selections.
  const [excelDateOverrides, setExcelDateOverrides] = useState<Set<number>>(new Set())
  const [excelBranchOverrides, setExcelBranchOverrides] = useState<Set<number>>(new Set())
  const [excelNegotiatorOverrides, setExcelNegotiatorOverrides] = useState<Set<number>>(new Set())
  // Refs to avoid stale closures in header change handlers
  const excelDateOverridesRef = useRef(excelDateOverrides)
  excelDateOverridesRef.current = excelDateOverrides
  const excelBranchOverridesRef = useRef(excelBranchOverrides)
  excelBranchOverridesRef.current = excelBranchOverrides
  const excelNegotiatorOverridesRef = useRef(excelNegotiatorOverrides)
  excelNegotiatorOverridesRef.current = excelNegotiatorOverrides
  // Header-level defaults applied to all non-overridden tickets
  const [excelDefaultBranchId, setExcelDefaultBranchId] = useState('')
  const [excelDefaultNegotiator, setExcelDefaultNegotiator] = useState('')
  // Dealer matching state — auto-match Excel dealer names to existing dealers via Gemini AI
  const [, setExcelDealerMatches] = useState<Map<string, DealerParseResult>>(new Map())
  const [excelUnmatchedDealers, setExcelUnmatchedDealers] = useState<string[]>([])
  const [showUnmatchedDealerPopup, setShowUnmatchedDealerPopup] = useState(false)
  const [addingDealers, setAddingDealers] = useState(false)
  // Map from unmatched dealer name → selected resolution (dealerId or '__ADD_NEW__')
  const [unmatchedDealerResolutions, setUnmatchedDealerResolutions] = useState<Map<string, string>>(new Map())

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await extractRelayTicketsFromExcel(file)
      const defaultBranchId = resolveRelayDefaultBranchId() || ''
      setExcelTickets(result.tickets.map(ticket => ({
        ...ticket,
        branchId: defaultBranchId,
        assignedTo: '',
      })))
      setExcelDate(result.scheduleDate)
      setExcelFileName(result.fileName)
      // Reset override tracking for fresh import
      setExcelDateOverrides(new Set())
      setExcelBranchOverrides(new Set())
      setExcelNegotiatorOverrides(new Set())
      setExcelDefaultBranchId(defaultBranchId)
      setExcelDefaultNegotiator('')

      // Fetch ALL tickets from API to detect duplicates by customer name
      const authToken = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const existingMap = new Map<string, Ticket>()

      try {
        const res = await fetch(`${API_BASE_URL}/tickets?size=1000`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        if (res.ok) {
          const data = await res.json()
          const payload = data?.data ?? data ?? {}
          const allTickets: Ticket[] = payload?.tickets || data?.tickets || (Array.isArray(data) ? data : [])
          for (const t of allTickets) {
            const name = (t.customerName || (t as any).customer_name || '').replace(/\s+/g, ' ').trim().toUpperCase()
            if (name) existingMap.set(name, t)
          }
        }
      } catch {
        // If fetch fails, fall back to local tickets
        for (const t of tickets) {
          const name = (t.customerName || (t as any).customer_name || '').replace(/\s+/g, ' ').trim().toUpperCase()
          if (name) existingMap.set(name, t)
        }
      }

      setExcelExistingMap(existingMap)
      setShowExcelPicker(true)

      // ── Search for any imported names not found in initial fetch ──
      const missingNames = result.tickets
        .map(t => (t.customerName || '').replace(/\s+/g, ' ').trim())
        .filter(name => name && !existingMap.has(name.toUpperCase()))
      if (missingNames.length > 0) {
        // Search each missing name individually (async, updates map as results come in)
        const token2 = authToken
        Promise.all(missingNames.map(async (name) => {
          try {
            const res = await fetch(`${API_BASE_URL}/tickets?search=${encodeURIComponent(name)}&size=5`, {
              headers: { Authorization: `Bearer ${token2}` },
            })
            if (!res.ok) return
            const data = await res.json()
            const payload = data?.data ?? data ?? {}
            const results: Ticket[] = payload?.tickets || data?.tickets || (Array.isArray(data) ? data : [])
            const match = results.find((t: any) => {
              const n = (t.customerName || (t as any).customer_name || '').replace(/\s+/g, ' ').trim().toUpperCase()
              return n === name.toUpperCase()
            })
            if (match) {
              existingMap.set(name.toUpperCase(), match)
            }
          } catch { /* skip */ }
        })).then(() => {
          setExcelExistingMap(new Map(existingMap))
        })
      }

      // ── Use Gemini AI to parse raw DLR strings into proper dealer + branch ──
      // Skip dealers already recognized by the system (RA/Robinsons, Abenson, Direct)
      const rawDealerStrings = [...new Set(result.tickets.map(t => t.dealer).filter(Boolean))]
        .filter(d => !ROBINSON_APPLIANCES_RE.test(d) && !/^abenson/i.test(d) && d.toLowerCase() !== 'direct')
      if (rawDealerStrings.length > 0 && dealers.length > 0) {
        matchExcelDealers(rawDealerStrings, dealers).then(summary => {
          setExcelDealerMatches(summary.parsed)
          setExcelUnmatchedDealers(summary.unmatchedDealers)

          // Update ticket dealer/dealerBranch fields with AI-parsed results
          // Skip tickets whose dealer is already recognized by the system (RA, Abenson, Direct)
          // Only set ticket.dealer if it actually matches an existing dealer in the DB
          setExcelTickets(prev => prev.map(ticket => {
            if (!ticket.dealer) return ticket
            const dlr = ticket.dealer.trim().toLowerCase()
            // System already handles these — don't overwrite
            if (ROBINSON_APPLIANCES_RE.test(dlr) || /^abenson/i.test(dlr) || dlr === 'direct') return ticket

            const parseResult = summary.parsed.get(ticket.dealer)
            if (parseResult?.matched && parseResult.matchedDealerName) {
              // Matched to an existing dealer — safe to update
              return {
                ...ticket,
                dealer: parseResult.matchedDealerName,
                dealerBranch: parseResult.dealerBranch || ticket.dealerBranch,
              }
            } else if (parseResult?.dealerBranch) {
              // Not matched but AI extracted a branch/location — only update dealerBranch
              return {
                ...ticket,
                dealerBranch: parseResult.dealerBranch,
              }
            }
            return ticket
          }))
        }).catch(() => { /* matching failed silently */ })
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to read Excel file')
    }
    // Reset file input so same file can be re-selected
    e.target.value = ''
  }

  const updateExcelTicket = (index: number, patch: Partial<EditableExcelRelayTicket>) => {
    setExcelTickets(prev => prev.map((ticket, ticketIndex) => (
      ticketIndex === index ? { ...ticket, ...patch } : ticket
    )))
    // Mark individual overrides so bulk header changes don't overwrite them
    if ('scheduleDate' in patch) {
      setExcelDateOverrides(prev => new Set(prev).add(index))
    }
    if ('branchId' in patch) {
      setExcelBranchOverrides(prev => new Set(prev).add(index))
    }
    if ('assignedTo' in patch) {
      setExcelNegotiatorOverrides(prev => new Set(prev).add(index))
    }
  }

  // Bulk header-level controls: update all non-overridden tickets
  const handleExcelHeaderDateChange = (newDate: string) => {
    setExcelDate(newDate)
    setExcelTickets(prev => prev.map((ticket, idx) => {
      if (excelDateOverridesRef.current.has(idx)) return ticket
      return { ...ticket, scheduleDate: newDate }
    }))
  }

  const handleExcelHeaderBranchChange = (newBranchId: string) => {
    setExcelDefaultBranchId(newBranchId)
    setExcelTickets(prev => prev.map((ticket, idx) => {
      if (excelBranchOverridesRef.current.has(idx)) return ticket
      const resetNegotiator = excelNegotiatorOverridesRef.current.has(idx) ? ticket.assignedTo : ''
      return { ...ticket, branchId: newBranchId, assignedTo: resetNegotiator }
    }))
  }

  const handleExcelHeaderNegotiatorChange = (newNegotiatorId: string) => {
    setExcelDefaultNegotiator(newNegotiatorId)
    setExcelTickets(prev => prev.map((ticket, idx) => {
      if (excelNegotiatorOverridesRef.current.has(idx)) return ticket
      return { ...ticket, assignedTo: newNegotiatorId }
    }))
  }

  const handlePickExcelTicket = (ticket: EditableExcelRelayTicket, ticketIdx: number) => {
    // Parse the dealer value properly — for RA/Robinsons/Abenson, use the system's parseDealer
    // to avoid putting raw messy values like "RA SHAN MICHAEL DAGDAG" into the dealer field
    // But if the dealer is already a clean value (exists in dealers list or is a known category),
    // don't re-parse — it was already saved correctly from a previous edit.
    const dealerLower = (ticket.dealer || '').trim().toLowerCase()
    const isKnownDealer = dealers.some(d => d.name.toLowerCase() === dealerLower)
      || ['direct', 'direct call', 'robinsons', 'robinsons appliances', 'abenson'].includes(dealerLower)

    let formDealer = ticket.dealer
    let formDealerBranch = ticket.dealerBranch

    if (!isKnownDealer) {
      const parsedDealer = parseDealer(ticket.dealer)
      if (parsedDealer.store === 'Robinsons') {
        formDealer = 'Robinsons Appliances'
        formDealerBranch = parsedDealer.branch || ticket.dealerBranch || ''
      } else if (parsedDealer.store === 'Abenson') {
        formDealer = 'Abenson'
        formDealerBranch = parsedDealer.branch || ticket.dealerBranch || ''
      } else if (parsedDealer.store === 'Direct') {
        formDealer = 'Direct'
        formDealerBranch = ''
      } else if (parsedDealer.store === 'Other' && parsedDealer.customStore) {
        formDealer = parsedDealer.customStore
        formDealerBranch = parsedDealer.branch || ticket.dealerBranch || ''
      }
    }

    // Fill the Create Ticket form with this ticket's data
    setAddForm((prev: any) => ({
      ...prev,
      customerName: ticket.customerName,
      contactPhone: ticket.contactPhone,
      locationRaw: ticket.address,
      district: ticket.district,
      dealer: formDealer,
      dealerBranch: formDealerBranch,
      brand: ticket.brand,
      capacity: ticket.capacity,
      commitType: ticket.commitType,
      installerName: ticket.installer,
      serviceVehicle: ticket.vehicle,
      driverName: ticket.driver,
      remarksUpdate: ticket.remarks,
      description: ticket.remarks,
      status: ticket.serviceType,
      serviceType: ticket.serviceType,
      modeOfPayment: ticket.modeOfPayment,
      installationCharges: ticket.installationCharges,
      // Preserve the imported ticket's independent branch and negotiator selection.
      branchId: ticket.branchId || prev.branchId,
      assignedTo: ticket.assignedTo || '',
      // Relayed Date: from Excel DATE RALAYED column when present, otherwise the same sheet date
      // used for schedule/requested date — not today's date, which was masking the real relay date.
      relayedDate: ticket.relayedDate || ticket.scheduleDate || excelDate || new Date().toISOString().split('T')[0],
      // Scheduled Date (finalDate): from the sheet's header date (dispatch date)
      finalDate: ticket.scheduleDate || excelDate,
      // Requested Date: same as schedule date (requested date is also the scheduled date from import)
      preferredDate: ticket.scheduleDate || excelDate,
    }))
    // Set phone numbers
    const phones = ticket.contactPhone.split(/[/,]|\s{2,}/).map(p => p.trim()).filter(Boolean)
    setAddPhoneNumbers(phones.length > 0 ? phones : [''])
    // Set payments — use the ticket's payments array directly if available
    if (ticket.payments && ticket.payments.length > 0 && ticket.payments.some(p => p.amount > 0 || p.mode)) {
      setAddPayments(ticket.payments.map(p => ({ mode: p.mode || '', amount: p.amount || 0 })))
    } else {
      const modes = (ticket.modeOfPayment || '').split(/[/,]/).map(m => m.trim()).filter(Boolean)
      if (modes.length > 1 && ticket.installationCharges > 0) {
        const perPayment = Math.round(ticket.installationCharges / modes.length)
        setAddPayments(modes.map((mode, i) => ({
          mode,
          amount: i === modes.length - 1 ? ticket.installationCharges - perPayment * (modes.length - 1) : perPayment,
        })))
      } else {
        setAddPayments([{ mode: modes[0] || ticket.modeOfPayment || '', amount: ticket.installationCharges || 0 }])
      }
    }
    // Close picker, open create modal
    setShowExcelPicker(false)
    setOpenedFromExcel(true)
    setExcelEditingIndex(ticketIdx)
    setIsAddModalOpen(true)
  }

  const [excelBulkCreating, setExcelBulkCreating] = useState(false)
  const [excelBulkProgress, setExcelBulkProgress] = useState({ done: 0, total: 0, errors: 0 })
  const [showExcelNegotiatorWarning, setShowExcelNegotiatorWarning] = useState(false)
  const [showExcelConfirmCreate, setShowExcelConfirmCreate] = useState(false)
  const [, setExcelConfirmSkipBranchCheck] = useState(false)
  const [excelResultModal, setExcelResultModal] = useState<{ created: number; updated: number; errors: number } | null>(null)

  const handleCreateAllExcelTickets = async (options?: { skipBranchCheck?: boolean }) => {
    if (excelTickets.length === 0) return

    // Check if any tickets have unmatched dealers — show popup to resolve them first
    if (!options?.skipBranchCheck) {
      if (excelUnmatchedDealers.length > 0) {
        setUnmatchedDealerResolutions(new Map())
        setShowUnmatchedDealerPopup(true)
        return
      }
    }

    // Check if all tickets have a negotiator assigned
    const ticketsWithoutNegotiator = excelTickets.filter(t => !t.assignedTo)
    if (ticketsWithoutNegotiator.length > 0) {
      setShowExcelNegotiatorWarning(true)
      return
    }

    // Show custom confirmation modal
    setExcelConfirmSkipBranchCheck(Boolean(options?.skipBranchCheck))
    setShowExcelConfirmCreate(true)
  }

  const executeExcelBulkCreate = async () => {
    setShowExcelConfirmCreate(false)

    setExcelBulkCreating(true)
    setExcelBulkProgress({ done: 0, total: excelTickets.length, errors: 0 })

    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    let errors = 0
    let created = 0
    let updated = 0

    for (let i = 0; i < excelTickets.length; i++) {
      const ticket = excelTickets[i]
      try {
        const phones = ticket.contactPhone.split(/[/,]|\s{2,}/).map((p: string) => p.trim()).filter(Boolean)
        const resolvedStatus = resolveScheduleStatusFields(ticket.serviceType)
        const brandHp = formatBrandCapacityLabel(ticket.brand, ticket.capacity)

        // Build schedule history for RESCHED tickets
        const scheduleHistory: Array<{ date: string; newDate: string; remarks: string; timestamp: string }> = []
        if (ticket.isResched && (ticket.scheduleDate || excelDate)) {
          scheduleHistory.push({
            date: ticket.scheduleDate || excelDate,
            newDate: '',
            remarks: ticket.remarks || 'RESCHED',
            timestamp: new Date().toISOString(),
          })
        }

        const acDetailsObj = {
          landmarks: '',
          brand: ticket.brand || '',
          capacity: ticket.capacity || '',
          sku: '',
          serialNumber: '',
          alternatePhone: phones.slice(1).join(', '),
          // Same fallback as the single-ticket prefill above: default to the sheet's schedule
          // date (not today) so relayed/requested/schedule all agree when the sheet has no
          // dedicated "DATE RALAYED" column.
          relayedDate: ticket.relayedDate || ticket.scheduleDate || excelDate || new Date().toISOString().split('T')[0],
          finalDate: ticket.isResched ? '' : (ticket.scheduleDate || excelDate || ''),
          installedDate: '',
          driverName: ticket.driver || '',
          ...(scheduleHistory.length > 0 ? { scheduleHistory: JSON.stringify(scheduleHistory) } : {}),
          ...(ticket.isResched ? { previousScheduleDates: JSON.stringify([ticket.scheduleDate || excelDate]) } : {}),
          ...(ticket.isResched ? { reschedulePending: true } : {}),
          ...(resolvedStatus.schedulePhase !== undefined ? { schedulePhase: resolvedStatus.schedulePhase } : {}),
          ...(resolvedStatus.scheduleOutcome !== undefined ? { scheduleOutcome: resolvedStatus.scheduleOutcome } : {}),
          // Multiple payments → store breakdown
          ...(ticket.payments && ticket.payments.length > 1 ? { paymentBreakdown: ticket.payments.filter(p => p.amount > 0) } : {}),
        }

        // Resolve payment mode: HYBRID if multiple payment types
        const hasMultiplePayments = ticket.payments && ticket.payments.filter(p => p.amount > 0).length > 1
        const resolvedMop = hasMultiplePayments ? 'HYBRID' : (ticket.modeOfPayment || undefined)
        const resolvedCharges = ticket.installationCharges || 0

        const selectedNegotiator = employees.find(employee => employee.id === ticket.assignedTo)
        const writeBranchId = resolvePortalWriteBranchId(
          ticket.branchId || resolveRelayDefaultBranchId() || '',
          selectedNegotiator?.email,
          selectedNegotiator?.jobTitle,
        )
        const relayBranchId = writeBranchId || resolveRelayDefaultBranchId() || user?.branchId || undefined

        // ─── Duplicate Detection ─────────────────────────────────────────
        // Search API for existing ticket with same customer name
        const customerNameNorm = (ticket.customerName || '').trim().toUpperCase()
        let existingTicketId: string | null = null

        // Check pre-built map first
        const mapMatch = excelExistingMap.get(customerNameNorm)
        if (mapMatch) {
          existingTicketId = mapMatch.id
        }

        // If not found in map, do a live API search
        if (!existingTicketId && ticket.customerName) {
          try {
            const searchRes = await fetch(`${API_BASE_URL}/tickets?search=${encodeURIComponent(ticket.customerName.trim())}&size=20`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (searchRes.ok) {
              const searchData = await searchRes.json()
              const payload = searchData?.data ?? searchData ?? {}
              const results: any[] = payload?.tickets || searchData?.tickets || (Array.isArray(searchData) ? searchData : (searchData?.results || []))
              const match = results.find((t: any) => {
                const n = (t.customerName || t.customer_name || '').trim().toUpperCase()
                return n === customerNameNorm
              })
              if (match?.id) existingTicketId = match.id
            }
          } catch { /* search failed — will create new */ }
        }

        if (existingTicketId) {
          // UPDATE existing ticket via PATCH
          const patchPayload: Record<string, any> = {
            customerName: ticket.customerName || undefined,
            contactPhone: ticket.contactPhone || '',
            location: ticket.address || undefined,
            district: ticket.district || undefined,
            dealer: resolveRelayDealerForSubmit(ticket.dealer || 'Direct', ticket.dealerBranch || ''),
            serviceType: ticket.serviceType,
            branchId: relayBranchId,
            assignedTo: ticket.assignedTo || undefined,
            negotiatorId: ticket.assignedTo || undefined,
            preferredDate: ticket.scheduleDate || excelDate || undefined,
            installerName: ticket.installer || undefined,
            serviceVehicle: ticket.vehicle || undefined,
            driverName: ticket.driver || undefined,
            remarksUpdate: ticket.remarks || undefined,
            installationCharges: resolvedCharges,
            modeOfPayment: resolvedMop,
            acDetails: JSON.stringify(acDetailsObj),
            status: resolvedStatus.status === 'SCHEDULED' && !(ticket.scheduleDate || excelDate) ? 'PENDING' : resolvedStatus.status,
          }

          const res = await fetch(`${API_BASE_URL}/tickets/${existingTicketId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(patchPayload),
          })
          if (!res.ok) {
            errors++
          } else {
            updated++
          }
        } else {
          // CREATE new ticket
          const createPayload = {
            title: `${ticket.serviceType} service`,
            description: ticket.remarks || '',
            customerName: ticket.customerName,
            serviceType: ticket.serviceType,
            ticketCategory: resolvedStatus.ticketCategory || 'INSTALLATION',
            unitType: brandHp || 'Split AC',
            contactPhone: phones[0] || undefined,
            location: ticket.address || 'No Address Provided',
            dealer: resolveRelayDealerForSubmit(ticket.dealer || 'Direct', ticket.dealerBranch || ''),
            preferredDate: ticket.scheduleDate || excelDate || undefined,
            district: ticket.district || undefined,
            commitType: ticket.commitType || undefined,
            installerName: ticket.installer || undefined,
            serviceVehicle: ticket.vehicle || undefined,
            driverName: ticket.driver || undefined,
            remarksUpdate: ticket.remarks || undefined,
            installationCharges: resolvedCharges,
            modeOfPayment: resolvedMop,
            acDetails: JSON.stringify(acDetailsObj),
            status: resolvedStatus.status === 'SCHEDULED' && !(ticket.scheduleDate || excelDate) ? 'PENDING' : resolvedStatus.status,
            branchId: relayBranchId,
            assignedTo: ticket.assignedTo || undefined,
            negotiatorId: ticket.assignedTo || undefined,
          }

          const res = await fetch(`${API_BASE_URL}/tickets`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(createPayload),
          })
          if (!res.ok) {
            errors++
          } else {
            created++
            const payload = await res.json().catch(() => null)
            const parsed = parseCreatedTicketResponse(payload)
            const createdTicket = (parsed || payload?.data || payload) as Ticket
            if (createdTicket?.id) {
              applyRelayTicketLocally(createdTicket.id, createdTicket)
            }
          }
        }
      } catch {
        errors++
      }
      setExcelBulkProgress({ done: i + 1, total: excelTickets.length, errors })
    }

    setExcelBulkCreating(false)
    setShowExcelPicker(false)
    setExcelResultModal({ created, updated, errors })
  }

  /** Resolve unmatched dealers: map to existing dealers or add new ones */
  const handleResolveUnmatchedDealers = async () => {
    setAddingDealers(true)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const added: { name: string; id: string; originalName: string }[] = []
    const failed: string[] = []

    // Separate resolutions into "map to existing" and "add new"
    const toAdd: string[] = []
    const mapped: { dealerName: string; existingDealerName: string }[] = []

    for (const dealerName of excelUnmatchedDealers) {
      const resolution = unmatchedDealerResolutions.get(dealerName)
      if (!resolution || resolution === '__ADD_NEW__') {
        toAdd.push(dealerName)
      } else {
        // Mapped to an existing dealer ID — find the dealer name
        const existingDealer = dealers.find(d => d.id === resolution)
        if (existingDealer) {
          mapped.push({ dealerName, existingDealerName: existingDealer.name })
        }
      }
    }

    // Apply mapped dealers to tickets — update the dealer field to the correct existing name
    if (mapped.length > 0) {
      setExcelTickets(prev => prev.map(ticket => {
        if (!ticket.dealer) return ticket
        const match = mapped.find(m => m.dealerName.toUpperCase() === ticket.dealer.toUpperCase())
        if (match) {
          return { ...ticket, dealer: match.existingDealerName }
        }
        return ticket
      }))
    }

    // Create new dealers for "add new" selections
    for (const dealerName of toAdd) {
      try {
        const res = await fetch(`${API_BASE_URL}/dealers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: dealerName.toUpperCase() }),
        })
        if (res.ok) {
          const data = await res.json()
          const newDealer = data?.data || data
          added.push({ name: newDealer.name || dealerName.toUpperCase(), id: newDealer.id, originalName: dealerName })
        } else {
          failed.push(dealerName)
        }
      } catch {
        failed.push(dealerName)
      }
    }

    // Refresh dealers list
    if (added.length > 0) {
      fetchDealers()
      notifyDealersUpdated()
    }

    // Clear resolved dealers from unmatched list
    const resolvedNames = [...mapped.map(m => m.dealerName), ...added.map(a => a.originalName)]
    setExcelUnmatchedDealers(prev => prev.filter(d => !resolvedNames.includes(d) || failed.includes(d)))

    setAddingDealers(false)
    setShowUnmatchedDealerPopup(false)

    const totalResolved = mapped.length + added.length
    if (failed.length > 0) {
      alert(`Resolved ${totalResolved} dealers. ${failed.length} failed to create: ${failed.join(', ')}`)
    } else if (totalResolved > 0) {
      alert(`Done! ${mapped.length > 0 ? `${mapped.length} matched to existing` : ''}${mapped.length > 0 && added.length > 0 ? ', ' : ''}${added.length > 0 ? `${added.length} added as new` : ''}. You can now create the tickets.`)
    }
  }

  /** Skip adding dealers and proceed with creation anyway */
  const handleSkipUnmatchedDealers = () => {
    setShowUnmatchedDealerPopup(false)
    handleCreateAllExcelTickets({ skipBranchCheck: true })
  }
  
  const relayCustomStores = useMemo(() => {
    return dealers.map(d => d.name).sort((a, b) => a.localeCompare(b))
  }, [dealers])

  const fetchDealers = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/dealers`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const list = await res.json()
        setDealers(list)
      }
    } catch (err) {
      console.error('Error fetching dealers:', err)
    }
  }, [])

  useEffect(() => {
    fetchDealers()
  }, [fetchDealers])

  useEffect(() => {
    window.addEventListener(DEALERS_UPDATED_EVENT, fetchDealers)
    return () => window.removeEventListener(DEALERS_UPDATED_EVENT, fetchDealers)
  }, [fetchDealers])

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [settingsNewDealerName, setSettingsNewDealerName] = useState('')
  const [settingsEditingDealerIndex, setSettingsEditingDealerIndex] = useState<number | null>(null)
  const [settingsEditDealerName, setSettingsEditDealerName] = useState('')

  const handleSettingsAddDealer = async () => {
    const name = settingsNewDealerName.trim().toUpperCase()
    if (!name) return
    if (dealers.some(d => d.name.toUpperCase() === name)) {
      alert('Dealer already exists')
      return
    }
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/dealers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name })
      })
      if (res.ok) {
        setSettingsNewDealerName('')
        fetchDealers()
        notifyDealersUpdated()
      } else {
        const errMsg = await res.text()
        alert(errMsg || 'Failed to add dealer')
      }
    } catch (err) {
      console.error('Error adding dealer:', err)
    }
  }

  const handleSettingsSaveRename = async (index: number) => {
    const oldDealer = dealers[index]
    const newName = settingsEditDealerName.trim().toUpperCase()
    if (!newName || newName === oldDealer.name.toUpperCase()) {
      setSettingsEditingDealerIndex(null)
      return
    }
    if (dealers.some((d, idx) => d.name.toUpperCase() === newName && idx !== index)) {
      alert('Dealer already exists')
      return
    }
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/dealers/${oldDealer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newName })
      })
      if (res.ok) {
        setSettingsEditingDealerIndex(null)
        fetchDealers()
        notifyDealersUpdated()
      } else {
        const errMsg = await res.text()
        alert(errMsg || 'Failed to rename dealer')
      }
    } catch (err) {
      console.error('Error renaming dealer:', err)
    }
  }

  const handleSettingsDeleteDealer = async (dealerId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete dealer "${name}"?`)) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/dealers/${dealerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        fetchDealers()
        notifyDealersUpdated()
      } else {
        alert('Failed to delete dealer')
      }
    } catch (err) {
      console.error('Error deleting dealer:', err)
    }
  }

  const handlePersistCustomStores = async (nextStores: string[]) => {
    const uppercaseStores = nextStores.map(s => s.trim().toUpperCase()).filter(Boolean)
    const newStore = uppercaseStores.find(name => !dealers.some(d => d.name.toUpperCase() === name))
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
        fetchDealers()
        if (res.ok) notifyDealersUpdated()
      } catch (err) {
        console.error('Error auto-creating dealer from edit drawer:', err)
      }
    }
  }

  const [addPhoneNumbers, setAddPhoneNumbers] = useState<string[]>([''])
  const [addPayments, setAddPayments] = useState<{ mode: string; amount: number }[]>([{ mode: '', amount: 0 }])
  const [addForm, _setAddForm] = useState({
    title: 'S/I service',
    description: '',
    serviceType: 'S/I',
    customerName: '',
    contactPhone: '',
    locationRaw: '',
    dealer: '',
    diser: '',
    otherStoreName: '',
    dealerBranch: '',
    unitType: 'Split AC',
    preferredDate: '',
    slaExpirationDate: '',
    priorityTag: '',
    district: '',
    commitType: '',
    installerName: '',
    driverName: '',
    serviceVehicle: '',
    remarksUpdate: '',
    installationCharges: 0,
    modeOfPayment: '',
    controlNumber: '',
    ticketNumber: '',
    assignedTo: '',
    landmarks: '',
    brand: '',
    capacity: '',
    sku: '',
    serialNumber: '',
    alternatePhone: '',
    images: '',
    status: 'S/I',
    branchId: '',
    relayedDate: new Date().toISOString().split('T')[0],
    finalDate: '',
    installedDate: '',
  })

  const setAddForm = (action: React.SetStateAction<typeof addForm>) => {
    _setAddForm((prev) => {
      const next = typeof action === 'function' ? (action as any)(prev) : action
      const uppercased: any = {}
      for (const key in next) {
        if (typeof (next as any)[key] === 'string' && !['id', 'assignedTo', 'branchId'].includes(key)) {
          uppercased[key] = (next as any)[key].toUpperCase()
        } else {
          uppercased[key] = (next as any)[key]
        }
      }
      return uppercased as typeof addForm
    })
  }
  const [employees, setEmployees] = useState<any[]>([])
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )
  useEffect(() => {
    const sync = () => setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [])

  const resolveRelayDefaultBranchId = useCallback(() => {
    const activeBranch = branchFilter
    if (activeBranch && activeBranch !== 'ALL' && activeBranch !== 'ALL_BRANCHES') {
      return activeBranch
    }
    return resolvePortalWriteBranchId(globalBranchId || user?.branchId, user?.email, user?.jobTitle)
  }, [branchFilter, globalBranchId, user?.branchId, user?.email, user?.jobTitle])

  const negotiatorsForBranch = useCallback((branchId?: string | null) => {
    const scoped = branchId && branchId !== 'ALL' && branchId !== 'ALL_BRANCHES'
      ? branchId
      : null
    const pageBranch = branchFilter
    const fallbackBranch = pageBranch && pageBranch !== 'ALL' && pageBranch !== 'ALL_BRANCHES'
      ? pageBranch
      : (globalBranchId || user?.branchId || null)
    const filterBranch = scoped || fallbackBranch
    const fromFilter = filterBranchNegotiators(employees, filterBranch)
    if (fromFilter.length > 0 || !scoped) return fromFilter

    // Selected branch in form may use a different id than employee.branchId — resolve via branches list
    const selected = resolveBranch(scoped)
    const matched = employees.filter((emp) => {
      if (!isNegotiatorCandidate(emp)) return false
      if (!emp.branchId?.trim()) return true
      if (branchScopesMatch(emp.branchId, scoped, emp.email)) return true
      const empBranch = resolveBranch(emp.branchId)
      return !!(selected && empBranch && selected.id === empBranch.id)
    })
    return matched.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [employees, branchFilter, globalBranchId, user?.branchId, branches])

  const addFormDuplicate = useMemo(() => {
    const writeBranchId = resolvePortalWriteBranchId(
      addForm.branchId || resolveRelayDefaultBranchId(),
      user?.email,
      user?.jobTitle,
    )
    const probe = {
      customerName: addForm.customerName,
      branchId: writeBranchId || resolveRelayDefaultBranchId() || user?.branchId,
      contactPhone: addPhoneNumbers[0] || addForm.contactPhone,
      preferredDate: addForm.preferredDate,
      district: addForm.district,
      dealer: resolveRelayDealerForSubmit(addForm.dealer || 'Direct', addForm.dealerBranch || ''),
      commitType: addForm.commitType,
    } as Ticket
    return openFieldTickets.find((t) => isRelayCustomerDuplicate(probe, t)) || null
  }, [addForm, addPhoneNumbers, openFieldTickets, user, resolveRelayDefaultBranchId])

  const addFormSyncTarget = useMemo(() => {
    const writeBranchId = resolvePortalWriteBranchId(
      addForm.branchId || resolveRelayDefaultBranchId(),
      user?.email,
      user?.jobTitle,
    )
    const probe = {
      customerName: addForm.customerName,
      branchId: writeBranchId || resolveRelayDefaultBranchId() || user?.branchId,
      contactPhone: addPhoneNumbers[0] || addForm.contactPhone,
    } as Ticket
    const name = (probe.customerName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (name.length < 4) return null

    const ticketNumberInput = addForm.ticketNumber?.trim()
    const byNumber = ticketNumberInput
      ? openFieldTickets.find((t) => {
          const candidateNo = normalizeRelayTicketNumber({ ticketNumber: ticketNumberInput })
          const existingNo = normalizeRelayTicketNumber(t)
          return candidateNo && existingNo && candidateNo === existingNo
        })
      : null
    if (byNumber) return byNumber

    return openFieldTickets.find((t) => {
      if (!isScheduledManualTicket(t)) return false
      const tName = (t.customerName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (tName !== name) return false
      return relayCustomerPhonesMatch(probe, t) && !!normalizeRelayTicketNumber(t)
    }) || null
  }, [addForm, addPhoneNumbers, openFieldTickets, user, resolveRelayDefaultBranchId])

  const addModalNegotiators = useMemo(
    () => negotiatorsForBranch(addForm.branchId || resolveRelayDefaultBranchId()),
    [negotiatorsForBranch, addForm.branchId, resolveRelayDefaultBranchId],
  )

  /** Driver/installer name suggestions for the add-ticket Dispatch section — same roster derivation as Schedules. */
  const addModalRoster = useMemo(
    () => deriveRosterFromEmployees(employees, addForm.branchId || resolveRelayDefaultBranchId() || ''),
    [employees, addForm.branchId, resolveRelayDefaultBranchId],
  )


  const openAddModal = useCallback(() => {
    const defaultBranch = resolveRelayDefaultBranchId()
    setAddPhoneNumbers([''])
    setAddForm(prev => ({
      ...prev,
      branchId: defaultBranch || prev.branchId,
    }))
    setOpenedFromExcel(false)
    setIsAddModalOpen(true)
  }, [resolveRelayDefaultBranchId])

  // Opened from the portal's Bookings page ("Convert to Ticket") — prefill and open the Add
  // Ticket modal from the booking's fields, same as a normal manual add otherwise.
  useEffect(() => {
    const prefill = (location.state as { bookingPrefill?: {
      id?: string; customerName?: string; contactPhone?: string
      region?: string; city?: string; barangay?: string; street?: string; landmark?: string
      brand?: string; capacity?: string; requestedDate?: string; issueDescription?: string
    } } | null)?.bookingPrefill
    if (!prefill) return

    const defaultBranch = resolveRelayDefaultBranchId()
    const addressLine = [prefill.street, prefill.barangay, prefill.city, prefill.region].filter(Boolean).join(', ')

    setAddPhoneNumbers([prefill.contactPhone || ''])
    setAddForm(prev => ({
      ...prev,
      branchId: defaultBranch || prev.branchId,
      customerName: prefill.customerName || '',
      contactPhone: prefill.contactPhone || '',
      locationRaw: addressLine,
      district: prefill.city || '',
      landmarks: prefill.landmark || '',
      brand: prefill.brand || '',
      capacity: prefill.capacity || '',
      preferredDate: prefill.requestedDate ? prefill.requestedDate.split('T')[0] : '',
      description: prefill.issueDescription || '',
      remarksUpdate: prefill.issueDescription || '',
    }))
    bookingPrefillIdRef.current = prefill.id || ''
    setOpenedFromExcel(false)
    setIsAddModalOpen(true)

    // Consume the nav state so a refresh/back doesn't reopen this prefill.
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Action Drawer / Assign Modal State
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [isActionDrawerOpen, setIsActionDrawerOpen] = useState(false)

  const [mergeTargetId, setMergeTargetId] = useState('')
  const [merging, setMerging] = useState(false)

  const pendingRelaySavesRef = useRef(new Map<string, {
    body: Record<string, unknown>
    rollback: Ticket
  }>())
  const activeRelaySavesRef = useRef(new Set<string>())

  const persistRelayTicketsCache = useCallback((nextTickets: Ticket[]) => {
    const cacheKey = relaysCacheKey(ticketScope, user, globalBranchId)
    const cached = readTabCache<RelaysTabCache>(cacheKey)
    writeTabCache(cacheKey, {
      tickets: nextTickets,
      branches: cached?.branches ?? branches,
      employees: cached?.employees,
      lastSyncAt: Date.now(),
    })
  }, [ticketScope, user, globalBranchId, branches])

  /** Instant list update; optional rollback restores prior ticket. null nextTicket = remove. */
  const applyRelayTicketLocally = useCallback((
    ticketId: string,
    nextTicket: Ticket | null,
    rollback?: Ticket,
  ) => {
    const normalizedNext = nextTicket ? normalizeRelayScheduleTicket(nextTicket) : null
    const patchList = (prev: Ticket[], filterOut: boolean) => {
      let list = prev.slice()
      if (rollback) {
        const idx = list.findIndex(t => t.id === ticketId)
        if (idx >= 0) list[idx] = rollback
        else list = [rollback, ...list]
      } else if (normalizedNext === null) {
        list = list.filter(t => t.id !== ticketId)
      } else {
        const idx = list.findIndex(t => t.id === ticketId)
        if (idx >= 0) list[idx] = normalizedNext
        else list = [normalizedNext, ...list]
      }
      return filterOut ? filterRelaysTickets(list) : list
    }

    setTickets(prev => {
      const next = patchList(prev, true)
      persistRelayTicketsCache(next)
      return next
    })
    setOpenFieldTickets(prev => patchList(prev, false))
    if (normalizedNext) syncTicketAcrossTabCaches(normalizedNext)
  }, [persistRelayTicketsCache])

  const flushRelaySave = useCallback(async (ticketId: string) => {
    if (ticketId.startsWith('temp-')) return
    if (activeRelaySavesRef.current.has(ticketId)) return
    activeRelaySavesRef.current.add(ticketId)
    try {
      while (pendingRelaySavesRef.current.has(ticketId)) {
        const job = pendingRelaySavesRef.current.get(ticketId)!
        pendingRelaySavesRef.current.delete(ticketId)
        try {
          const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
          const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(job.body),
          })
          if (!res.ok) {
            const errData = await res.json().catch(() => null)
            throw new Error(errData?.message || errData?.error || `Status ${res.status}`)
          }
          const saved = await res.json().catch(() => null)
          const savedTicket = (saved?.data?.ticket || saved?.ticket || saved) as Ticket | null
          if (savedTicket?.id) {
            syncTicketAcrossTabCaches(mergeRelayScheduleTicketPatch(savedTicket, job.body))
          }
          clearWarrantyCache()
        } catch (err: unknown) {
          applyRelayTicketLocally(ticketId, null, job.rollback)
          pendingRelaySavesRef.current.delete(ticketId)
          alert(`Failed to update ticket: ${formatFetchError(err)}`)
          break
        }
      }
    } finally {
      activeRelaySavesRef.current.delete(ticketId)
      if (pendingRelaySavesRef.current.has(ticketId)) {
        void flushRelaySave(ticketId)
      }
    }
  }, [applyRelayTicketLocally])

  const queueRelayPatch = useCallback((
    ticket: Ticket,
    body: Record<string, unknown>,
    optimisticTicket: Ticket,
  ) => {
    const ticketId = ticket.id
    const syncedBody = applyRelayScheduleSyncToPatch(body, ticket)
    const existing = pendingRelaySavesRef.current.get(ticketId)
    pendingRelaySavesRef.current.set(ticketId, {
      body: existing ? { ...existing.body, ...syncedBody } : syncedBody,
      rollback: existing?.rollback ?? ticket,
    })
    applyRelayTicketLocally(ticketId, mergeRelayScheduleTicketPatch(optimisticTicket, syncedBody))
    setLastUpdatedTicketId(ticketId)
    void flushRelaySave(ticketId)
  }, [applyRelayTicketLocally, flushRelaySave])

  const mergeCandidates = useMemo(() => {
    if (!selectedTicket) return []
    const currentNo = normalizeRelayTicketNumber(selectedTicket)
    const currentCustomerKey = normalizeRelayCustomerKey(selectedTicket)
    const currentName = (selectedTicket.customerName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    return tickets
      .filter(t => {
        if (t.id === selectedTicket.id) return false
        if (currentNo) {
          const candidateNo = normalizeRelayTicketNumber(t)
          if (candidateNo && candidateNo === currentNo) return true
        }
        if (currentCustomerKey) {
          const candidateKey = normalizeRelayCustomerKey(t)
          if (candidateKey && candidateKey === currentCustomerKey) return true
        }
        if (currentName.length < 3) return false
        const candidateName = (t.customerName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        return candidateName.includes(currentName) || currentName.includes(candidateName)
          || (currentName.slice(0, 8) === candidateName.slice(0, 8))
      })
      .sort((a, b) => relayTicketDisplayScore(b) - relayTicketDisplayScore(a))
  }, [selectedTicket, tickets])

  useEffect(() => {
    if (!isActionDrawerOpen || !selectedTicket || mergeCandidates.length === 0) return
    setMergeTargetId((prev) => prev || mergeCandidates[0]?.id || '')
  }, [isActionDrawerOpen, selectedTicket, mergeCandidates])

  // Column configuration for expand / collapse functionality
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})

  const tableRowBorder = isLight ? '#e2e8f0' : '#1e293b'
  const tableColBorder = `1px solid ${tableRowBorder}`
  const cellPadY = 12
  const cellPadX = 12
  const headerPadY = 12
  const tableFontSize = '13px'
  const headerFontSize = '11px'
  const TABLE_ROW_HEIGHT = 50

  const [expandedCell, setExpandedCell] = useState<{ ticketId: string; colLabel: string } | null>(null)

  const toggleColumn = useCallback((colLabel: string) => {
    setExpandedCols(prev => ({
      ...prev,
      [colLabel]: !prev[colLabel]
    }))
  }, [])

  const columns = useMemo(() => {
    const rawCols = activeTab === 'MY_TICKETS' ? [
      { label: 'TICKET NO',        weight: 6,  expMul: 1.3,  sticky: true,  freeze: true,  center: true, right: false },
      { label: 'CATEGORY',         weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'STATUS',           weight: 6,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
      { label: 'CUSTOMER NAME',    weight: 11, expMul: 1.45, sticky: false, freeze: false, center: false, right: false },
      { label: 'DISTRICT',         weight: 9,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'BRAND',            weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'DEALER',           weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'COMMIT',           weight: 9,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'BRANCH',           weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'NEGOTIATOR',       weight: 6,  expMul: 1.55, sticky: false, freeze: false, center: true, right: false },
      { label: 'SCHEDULED DATE',   weight: 9,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'REMARKS',          weight: 11, expMul: 1.45, sticky: false, freeze: false, center: false, right: true },
    ] : [
      { label: 'TICKET NO',    weight: 7,  expMul: 1.35, sticky: true,  freeze: true,  center: true, right: false },
      { label: 'STATUS',       weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'CATEGORY',     weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'CUSTOMER NAME', weight: 14, expMul: 1.5,  sticky: false, freeze: false, center: false, right: false },
      { label: 'DISTRICT',     weight: 8,  expMul: 1.4,  sticky: false, freeze: false, center: false, right: false },
      { label: 'DEALER',       weight: 9,  expMul: 1.4,  sticky: false, freeze: false, center: false, right: false },
      { label: 'DATE RELAYED', weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'BRANCH',       weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'COMMIT',       weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'NEGOTIATOR',   weight: 6,  expMul: 1.55, sticky: false, freeze: false, center: true, right: false },
      { label: 'SCHEDULED DATE', weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'REMARKS',      weight: 14, expMul: 1.55, sticky: false, freeze: false, center: false, right: true },
    ]

    const weights = rawCols.map(col => {
      const isExpanded = !!expandedCols[col.label]
      return col.weight * (isExpanded ? col.expMul : 1)
    })
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)

    return rawCols.map((col, idx) => ({
      ...col,
      isExpanded: !!expandedCols[col.label],
      w: `${((weights[idx] / totalWeight) * 100).toFixed(2)}%`,
      left: col.sticky ? 0 : undefined,
    }))
  }, [expandedCols, activeTab])

  const columnCellStyle = (col: (typeof columns)[number]) => ({
    width: col.w,
    minWidth: col.w,
    maxWidth: col.w,
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
  })

  const columnTextAlign = (col: (typeof columns)[number], cell?: { right?: boolean; center?: boolean }) => {
    if (cell?.right || col.right) return 'right' as const
    if (cell?.center ?? col.center) return 'center' as const
    return 'left' as const
  }

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ticket: Ticket } | null>(null)

  // Close context menu on any click (excluding clicks inside the context menu itself)
  useEffect(() => {
    const handleClose = (e: MouseEvent) => {
      const menu = document.getElementById('context-menu')
      if (menu && menu.contains(e.target as Node)) {
        return
      }
      setContextMenu(null)
    }
    window.addEventListener('click', handleClose)
    return () => window.removeEventListener('click', handleClose)
  }, [])

  useEffect(() => {
    if (user) {
      const roleLower = (user.role || '').toLowerCase()
      const isPriv = roleLower === 'admin' || roleLower === 'management' || roleLower === 'administrator'
      if (!isPriv) {
        setActiveTab('MY_TICKETS')
      }
    }
  }, [user])



  useLayoutEffect(() => {
    resetTicketTableScroll()
  }, [activeTab])

  // When Schedules tab saves, merge the same ticket into this Relays view.
  useEffect(() => {
    const onCacheUpdated = () => {
      const cacheKey = relaysCacheKey(ticketScope, user, globalBranchId)
      const cached = readTabCache<RelaysTabCache>(cacheKey)
      if (Array.isArray(cached?.tickets)) {
        setTickets(filterRelaysTickets(normalizeRelayScheduleTicketList(cached.tickets as Ticket[])))
        setOpenFieldTickets(normalizeRelayScheduleTicketList(cached.tickets as Ticket[]))
      }
    }
    window.addEventListener(TAB_CACHE_UPDATED, onCacheUpdated)
    return () => window.removeEventListener(TAB_CACHE_UPDATED, onCacheUpdated)
  }, [ticketScope, user, globalBranchId])

  // Load Initial Data — cache-first, background refresh
  const fetchData = useCallback(async (options?: { soft?: boolean }) => {
    const seq = ++fetchSeqRef.current
    const forceRefresh = options?.soft === false
    const cacheKey = relaysCacheKey(ticketScope, user, globalBranchId)
    const cached = readTabCache<RelaysTabCache>(cacheKey)
    const cacheEntry = readTabCacheEntry<RelaysTabCache>(cacheKey)
    const cacheSavedAt = cacheEntry?.data.lastSyncAt ?? cacheEntry?.savedAt
    const metaCacheFresh = cacheSavedAt ? isTabCacheFresh(cacheSavedAt) : false
    const hasCache = Array.isArray(cached?.tickets) && cached.tickets.length > 0
    const showSkeleton = !options?.soft && !hasLoadedOnceRef.current && !hasCache

    if (hasCache && !forceRefresh) {
      setTickets(filterRelaysTickets(normalizeRelayScheduleTicketList(cached!.tickets as Ticket[])))
      setOpenFieldTickets(cached!.tickets as Ticket[])
      if (cached!.branches?.length) setBranches(cached!.branches as { id: string; name: string }[])
      if (cached!.employees?.length) setEmployees(cached!.employees as any[])
      hasLoadedOnceRef.current = true
      if (!showSkeleton) setLoading(false)
    }
    if (showSkeleton) setLoading(true)
    else setRefreshing(true)

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const endpoint = ticketScope === 'MY' ? '/tickets/assigned' : '/tickets'

      const skipMetaFetch = Boolean(options?.soft && metaCacheFresh && cached?.branches?.length && cached?.employees?.length)

      const [tListRaw, branchList, employeeList] = await Promise.all([
        fetchTicketsPage(endpoint, token, {
          size: 300,
          categoryGroup: ticketScope === 'ALL' ? 'FIELD' : undefined,
        }).catch(() => [] as unknown[]),
        skipMetaFetch ? Promise.resolve(null) : fetchCachedBranches(token).catch(() => null),
        skipMetaFetch ? Promise.resolve(null) : fetchCachedEmployees(token).catch(() => null),
      ])

      if (seq !== fetchSeqRef.current) return

      let tList: Ticket[] = normalizeRelayScheduleTicketList((tListRaw as Ticket[]) || [])
      let bList: { id: string; name: string }[] = hasCache && cached!.branches
        ? (cached!.branches as { id: string; name: string }[])
        : []
      let eList: Array<Record<string, unknown>> = hasCache && cached!.employees
        ? (cached!.employees as Array<Record<string, unknown>>)
        : []

      setTickets(prev => {
        // Always merge so in-flight creates (temp-relay-*) and just-saved rows are not wiped
        // when the server page is briefly stale or paginated.
        const merged = mergeRelayTicketLists(tList, prev)
        setOpenFieldTickets(merged)
        tList = filterRelaysTickets(merged)
        return tList
      })

      if (branchList) {
        bList = branchList as { id: string; name: string }[]
        setBranches(bList)
      }

      if (employeeList) {
        eList = employeeList.map((e) => ({
          ...e,
          branchId: e.branchId || e.branch_id || '',
          jobTitle: e.jobTitle || e.job_title || '',
        }))
        setEmployees(eList as any[])
      }

      writeTabCache(cacheKey, { tickets: tList, branches: bList, employees: eList, lastSyncAt: Date.now() })
      hasLoadedOnceRef.current = true
    } catch (e) {
      console.error('Error fetching data:', e)
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [ticketScope, user, globalBranchId, isAdmin])

  useEffect(() => {
    const cacheKey = relaysCacheKey(ticketScope, user, globalBranchId)
    const cached = readTabCache<RelaysTabCache>(cacheKey)
    const hasCache = Array.isArray(cached?.tickets) && cached.tickets.length > 0
    if (hasCache) {
      setTickets(filterRelaysTickets(normalizeRelayScheduleTicketList(cached!.tickets as Ticket[])))
      setOpenFieldTickets(cached!.tickets as Ticket[])
      if (cached!.branches?.length) setBranches(cached!.branches as { id: string; name: string }[])
      if (cached!.employees?.length) {
        setEmployees(cached!.employees as any[])
      }
      setLoading(false)
      hasLoadedOnceRef.current = true
    } else {
      hasLoadedOnceRef.current = false
    }
    void fetchData({ soft: hasCache })
  }, [fetchData, ticketScope, user, globalBranchId])

  useEffect(() => {
    const reloadEmployees = async () => {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      if (!token) return
      try {
        const employeeList = await fetchCachedEmployees(token, undefined, { force: true })
        const eList = employeeList.map((e) => ({
          ...e,
          branchId: e.branchId || e.branch_id || '',
          jobTitle: e.jobTitle || e.job_title || '',
        }))
        setEmployees(eList as any[])
        const cacheKey = relaysCacheKey(ticketScope, user, globalBranchId)
        const cached = readTabCache<RelaysTabCache>(cacheKey)
        if (cached) {
          writeTabCache(cacheKey, { ...cached, employees: eList, lastSyncAt: Date.now() })
        }
      } catch {
        // keep current list on refresh failure
      }
    }
    const onDirectoryUpdated = () => { void reloadEmployees() }
    window.addEventListener(EMPLOYEES_DIRECTORY_UPDATED_EVENT, onDirectoryUpdated)
    window.addEventListener(PROFILE_UPDATED_EVENT, onDirectoryUpdated)
    return () => {
      window.removeEventListener(EMPLOYEES_DIRECTORY_UPDATED_EVENT, onDirectoryUpdated)
      window.removeEventListener(PROFILE_UPDATED_EVENT, onDirectoryUpdated)
    }
  }, [ticketScope, user, globalBranchId])

  // Decoupled global branch sync for admin in Relay Monitoring to display all tickets by default.

  // Bulk save Excel tickets
  const handleBulkUploadSubmit = async () => {
    if (!importTargetBranchId) {
      alert('Please select a target branch before importing.')
      return
    }
    setBulkUploading(true)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    
    let successCount = 0
    for (const item of excelPreview) {
      try {
        const res = await fetch(`${API_BASE_URL}/tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: `${item.serviceType || 'S/I'} service`,
            description: item.remarksUpdate || item.description || 'Excel imported ticket',
            customerName: item.customerName,
            serviceType: item.serviceType || 'S/I',
            unitType: item.unitType,
            contactPhone: item.contactPhone,
            location: item.location ? item.location.trim() : 'No Address Provided',
            dealer: item.dealer,
            priorityTag: item.priorityTag,
            district: item.district,
            commitType: item.commitType,
            installerName: item.installerName,
            serviceVehicle: item.serviceVehicle,
            remarksUpdate: item.remarksUpdate,
            installationCharges: item.installationCharges,
            modeOfPayment: item.modeOfPayment,
            controlNumber: item.controlNumber,
            branchId: importTargetBranchId,
            slaExpirationDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
          })
        })
        if (res.ok) successCount++
      } catch (e) {
        console.error('Failed to upload row:', item)
      }
    }

    alert(`Successfully imported ${successCount} of ${excelPreview.length} client tickets!`)
    setExcelPreview([])
    setIsExcelModalOpen(false)
    setImportTargetBranchId('')
    setBulkUploading(false)
    fetchData({ soft: true })
  }

  // Submit parsed/manual ticket — show on list instantly, save in background
  const handleFormCreateTicket = (e: React.FormEvent) => {
    e.preventDefault()
    const isAssignedOrScheduled = addForm.status !== 'PENDING' && addForm.status !== 'CANCELLED'
    if (isAssignedOrScheduled && !addForm.assignedTo) {
      alert('Negotiator is required')
      return
    }
    if (addFormDuplicate && !addFormSyncTarget) {
      const existingNo = getTicketNumber(addFormDuplicate)
      alert(
        `A relay ticket already exists for this customer (${existingNo}). `
        + 'Open the existing ticket or merge duplicates instead of creating a new one.',
      )
      return
    }

    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const cleanedPhones = addPhoneNumbers.map(p => p.trim()).filter(Boolean)
    // addForm.status carries the raw status-picker button value (CHECKUP, INSTALL, BACKJOB,
    // DONE_CHECKUP, ...) which Ticket.Status has no enum constant for — resolve to a value the
    // backend actually accepts before sending, same mapper used by Schedules/My Tickets saves.
    // schedulePhase/scheduleOutcome carry the finer sub-type (e.g. BACKJOB vs plain SERVICES)
    // that rows/labels read (getCategoryLabel, formatRelayTicketTypeShort) — must be in acDetails
    // from the start, or a new BACKJOB/CHECKUP ticket shows the wrong type from row one.
    const resolvedCreateStatus = resolveScheduleStatusFields(addForm.status)
    const acDetailsObj = {
      landmarks: addForm.landmarks || '',
      brand: addForm.brand || '',
      capacity: addForm.capacity || '',
      sku: addForm.sku || '',
      serialNumber: addForm.serialNumber || '',
      alternatePhone: cleanedPhones.slice(1).join(', '),
      relayedDate: addForm.relayedDate || new Date().toISOString().split('T')[0],
      finalDate: addForm.finalDate || '',
      installedDate: addForm.installedDate || '',
      driverName: addForm.driverName || '',
      ...(resolvedCreateStatus.schedulePhase !== undefined ? { schedulePhase: resolvedCreateStatus.schedulePhase } : {}),
      ...(resolvedCreateStatus.scheduleOutcome !== undefined ? { scheduleOutcome: resolvedCreateStatus.scheduleOutcome } : {}),
      ...(addPayments.length > 1 ? { paymentBreakdown: addPayments.filter(p => p.amount > 0) } : {}),
    }
    const writeBranchId = resolvePortalWriteBranchId(
      addForm.branchId || resolveRelayDefaultBranchId(),
      user?.email,
      user?.jobTitle,
    )
    const relayBranchId = writeBranchId || resolveRelayDefaultBranchId() || user?.branchId || undefined
    const syncTicketNumber = (addFormSyncTarget
      ? (normalizeRelayTicketNumber(addFormSyncTarget as Ticket) || addForm.ticketNumber?.trim())
      : addForm.ticketNumber?.trim()) || undefined

    const createBrandHp = formatBrandCapacityLabel(addForm.brand, addForm.capacity)
    // Same as edits: a pending field-type sub-status (CLEANING/CHECKUP/BACKJOB/INSTALLATION/
    // SERVICES) resolves to SCHEDULED regardless of whether a date was picked — with no date
    // yet, the new ticket must show PENDING, not SCHEDULED.
    const createStatus = (resolvedCreateStatus.status === 'SCHEDULED' && !addForm.finalDate?.trim() && !addForm.preferredDate?.trim())
      ? 'PENDING'
      : resolvedCreateStatus.status
    const createPayload = {
      title: addForm.title,
      description: addForm.description || addForm.remarksUpdate || '',
      customerName: addForm.customerName,
      serviceType: addForm.serviceType,
      ticketCategory: resolvedCreateStatus.ticketCategory,
      unitType: createBrandHp || addForm.unitType,
      contactPhone: cleanedPhones[0] || undefined,
      location: addForm.locationRaw?.trim() || 'No Address Provided',
      dealer: resolveRelayDealerForSubmit(addForm.dealer || 'Direct', addForm.dealerBranch || ''),
      diser: addForm.diser || undefined,
      preferredDate: addForm.preferredDate || undefined,
      actualCompletion: addForm.installedDate || undefined,
      slaExpirationDate: addForm.slaExpirationDate ? new Date(addForm.slaExpirationDate).toISOString() : undefined,
      priorityTag: addForm.priorityTag || undefined,
      district: addForm.district || undefined,
      commitType: addForm.commitType || undefined,
      installerName: addForm.installerName || undefined,
      assignedTo: addForm.assignedTo || undefined,
      negotiatorId: addForm.assignedTo || undefined,
      serviceVehicle: addForm.serviceVehicle || undefined,
      driverName: addForm.driverName || undefined,
      remarksUpdate: addForm.remarksUpdate || undefined,
      installationCharges: addPayments.reduce((sum, p) => sum + p.amount, 0) || (Number(addForm.installationCharges) || 0),
      modeOfPayment: addPayments.length > 1 ? 'HYBRID' : (addPayments[0]?.mode || addForm.modeOfPayment || undefined),
      controlNumber: addForm.controlNumber || undefined,
      ticketNumber: syncTicketNumber,
      acDetails: JSON.stringify(acDetailsObj),
      images: addForm.images || undefined,
      status: createStatus,
      branchId: relayBranchId,
    }

    const tempId = `temp-relay-${Date.now()}`
    const optimisticTicket = {
      id: tempId,
      customerId: '',
      title: createPayload.title,
      description: createPayload.description,
      customerName: createPayload.customerName,
      serviceType: createPayload.serviceType,
      unitType: createPayload.unitType,
      contactPhone: createPayload.contactPhone,
      location: createPayload.location,
      dealer: createPayload.dealer,
      preferredDate: createPayload.preferredDate,
      priorityTag: createPayload.priorityTag,
      district: createPayload.district,
      commitType: createPayload.commitType,
      installerName: undefined,
      driverName: undefined,
      assignedTo: createPayload.assignedTo,
      negotiatorId: createPayload.negotiatorId,
      serviceVehicle: createPayload.serviceVehicle,
      remarksUpdate: createPayload.remarksUpdate,
      installationCharges: createPayload.installationCharges,
      modeOfPayment: createPayload.modeOfPayment,
      controlNumber: createPayload.controlNumber,
      ticketNumber: createPayload.ticketNumber,
      acDetails: createPayload.acDetails,
      images: createPayload.images,
      status: createPayload.status,
      branchId: createPayload.branchId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Ticket

    applyRelayTicketLocally(tempId, optimisticTicket)
    setLastUpdatedTicketId(tempId)

    const statusLabel = getRelayStatusLabel(optimisticTicket)
    if (isAdmin) {
      if (statusLabel === 'Pending') setActiveTab('UNASSIGNED')
      else if (statusLabel === 'Assigned' || statusLabel === 'Scheduled') setActiveTab('PENDING')
      else setActiveTab('ALL_PENDING')
    } else if (statusLabel === 'Assigned') {
      setActiveTab('MY_TICKETS')
    } else {
      setActiveTab('UNASSIGNED')
    }

    setIsAddModalOpen(false)
    setAddPhoneNumbers([''])
    setAddForm({
      title: 'Installation service',
      description: '',
      serviceType: 'Installation',
      customerName: '',
      contactPhone: '',
      locationRaw: '',
      dealer: '',
      diser: '',
      otherStoreName: '',
      dealerBranch: '',
      unitType: 'Split AC',
      preferredDate: '',
      slaExpirationDate: '',
      priorityTag: '',
      district: '',
      commitType: '',
      installerName: '',
      driverName: '',
      serviceVehicle: '',
      remarksUpdate: '',
      installationCharges: 0,
      modeOfPayment: '',
      controlNumber: '',
      ticketNumber: '',
      assignedTo: '',
      landmarks: '',
      brand: '',
      capacity: '',
      sku: '',
      serialNumber: '',
      alternatePhone: '',
      images: '',
      status: 'PENDING',
      branchId: '',
      relayedDate: new Date().toISOString().split('T')[0],
      finalDate: '',
      installedDate: '',
    })

    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(createPayload),
        })
        if (!res.ok) throw new Error(await readApiError(res))

        const payload = await res.json().catch(() => null)
        const parsed = parseCreatedTicketResponse(payload)
        const createdTicket = (parsed || payload?.data || payload) as Ticket
        if (!createdTicket?.id) {
          applyRelayTicketLocally(tempId, null)
          void fetchData({ soft: true })
          return
        }

        if (bookingPrefillIdRef.current) {
          const bookingId = bookingPrefillIdRef.current
          bookingPrefillIdRef.current = ''
          fetch(`${API_BASE_URL}/bookings/${bookingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'CONVERTED', convertedTicketId: createdTicket.id }),
          }).catch(() => { /* best-effort — the ticket itself already saved */ })
        }

        let finalTicket = createdTicket
        const pendingSave = pendingRelaySavesRef.current.get(tempId)
        if (pendingSave) {
          pendingRelaySavesRef.current.delete(tempId)
          pendingRelaySavesRef.current.set(createdTicket.id, pendingSave)
          finalTicket = {
            ...createdTicket,
            ...pendingSave.body,
            acDetails: pendingSave.body.acDetails ? pendingSave.body.acDetails : createdTicket.acDetails
          } as Ticket
        }

        const onRelays = !shouldExcludeFromRelaysTab(finalTicket)
        setTickets(prev => {
          const withoutTemp = prev.filter(t => t.id !== tempId)
          const merged = onRelays
            ? mergeRelayTicketLists([finalTicket], withoutTemp)
            : withoutTemp
          const filtered = filterRelaysTickets(merged)
          persistRelayTicketsCache(filtered)
          return filtered
        })
        setOpenFieldTickets(prev => {
          const withoutTemp = prev.filter(t => t.id !== tempId)
          return onRelays
            ? mergeRelayTicketLists([finalTicket], withoutTemp)
            : withoutTemp
        })
        setLastUpdatedTicketId(onRelays ? finalTicket.id : '')

        if (selectedPreviewTicket?.id === tempId) {
          setSelectedPreviewTicket(onRelays ? finalTicket : null)
        }
        if (selectedTicket?.id === tempId) {
          setSelectedTicket(onRelays ? finalTicket : null)
        }
        if (contextMenu?.ticket.id === tempId) {
          setContextMenu(prev => (prev && onRelays ? { ...prev, ticket: finalTicket } : null))
        }

        // Keep relays cache (just written) so refresh retains the new row.
        clearWarrantyCache()

        if (onRelays) {
          const statusLabel = getRelayStatusLabel(finalTicket)
          if (isAdmin) {
            if (statusLabel === 'Pending') setActiveTab('UNASSIGNED')
            else if (statusLabel === 'Assigned' || statusLabel === 'Scheduled') setActiveTab('PENDING')
          } else if (statusLabel === 'Assigned') {
            setActiveTab('MY_TICKETS')
          } else {
            setActiveTab('UNASSIGNED')
          }
        }

        if (pendingSave && onRelays) {
          void flushRelaySave(finalTicket.id)
        }
      } catch (err: unknown) {
        applyRelayTicketLocally(tempId, null)
        alert(`Could not submit ticket: ${formatFetchError(err)}`)
      }
    })()
  }

  // Save changes in action drawer — update list instantly, persist in background
  const handleDrawerActionSave = (draft: RelayEditDraft) => {
    if (!selectedTicket) return
    const keepPendingAssignment = getTicketCategory(selectedTicket) === 'Collection'
    let finalStatus = (draft.assignTechId && draft.updateStatus === 'PENDING') ? 'ASSIGNED' : draft.updateStatus
    const existingDetails = parseAcDetails(selectedTicket)
    if (existingDetails.finalDate?.trim() && finalStatus === 'ASSIGNED') {
      finalStatus = 'SCHEDULED'
    }

    const isAssignedOrScheduled = finalStatus !== 'PENDING' && finalStatus !== 'CANCELLED'
    const isUnassignedPending = finalStatus === 'PENDING' && !keepPendingAssignment

    // finalStatus carries the raw status-picker button value (CHECKUP, INSTALL, BACKJOB,
    // DONE_CHECKUP, ...) — Ticket.Status has no enum constant for those; resolve to what the
    // backend actually accepts before sending (same mapper used at ticket creation and in
    // Schedules/My Tickets saves). schedulePhase/scheduleOutcome carry the finer sub-type that
    // status can't (e.g. BACKJOB vs plain SERVICES) — merged into acDetailsObj below.
    const resolvedEditStatus = resolveScheduleStatusFields(finalStatus)

    const payload: Record<string, any> = {}
    let branchId = ''
    let assignedTo = ''

    if (finalStatus === 'CANCELLED') {
      // Keep branch so cancelled tickets still appear as Schedules ghosts on their date/branch.
      // Only drop the active assignee — Relays/My Tickets already exclude CANCELLED.
      const selectedNegForCancel = employees.find((e: { id: string; branchId?: string; email?: string; jobTitle?: string }) => e.id === draft.assignTechId)
      const cancelBranchRaw = draft.assignBranchId || selectedTicket.branchId || ''
      branchId = cancelBranchRaw
        ? (resolvePortalWriteBranchId(cancelBranchRaw, selectedNegForCancel?.email, selectedNegForCancel?.jobTitle) || cancelBranchRaw)
        : ''
      if (branchId) payload.branchId = branchId
      payload.assignedTo = ''
      payload.status = finalStatus
    } else {
      const selectedNeg = employees.find((e: { id: string; branchId?: string; email?: string; jobTitle?: string }) => e.id === draft.assignTechId)
      branchId = draft.assignBranchId
        ? (resolvePortalWriteBranchId(draft.assignBranchId, selectedNeg?.email, selectedNeg?.jobTitle) || draft.assignBranchId)
        : ''

      if (isAssignedOrScheduled) {
        if (!draft.assignTechId) {
          alert('Negotiator is required')
          return
        }
        assignedTo = draft.assignTechId
      } else if (!isUnassignedPending) {
        assignedTo = draft.assignTechId || ''
      }

      if (assignedTo && branchId && selectedNeg?.branchId
        && !branchScopesMatch(selectedNeg.branchId, branchId, selectedNeg.email)) {
        alert('Selected negotiator does not belong to the chosen branch zone. Pick a negotiator from that branch.')
        return
      }

      payload.branchId = branchId
      payload.assignedTo = assignedTo
      // Picking a pending field-type sub-status (CLEANING/CHECKUP/BACKJOB/INSTALLATION/SERVICES)
      // always resolves to SCHEDULED regardless of whether a date was actually picked — a ticket
      // with no final date must show PENDING, not SCHEDULED (that implies day-of placement).
      payload.status = (resolvedEditStatus.status === 'SCHEDULED' && !existingDetails.finalDate?.trim())
        ? 'PENDING'
        : resolvedEditStatus.status
      if (resolvedEditStatus.ticketCategory) payload.ticketCategory = resolvedEditStatus.ticketCategory
    }
    const isPendingResched = finalStatus === 'RESCHED' && Boolean(draft.reschedulePending)
    // draft.finalDate is the "Schedule Date" field the negotiator actually edits to move a ticket
    // (including a pending RESCHED being resolved to a real slot) — send it as the request's
    // top-level finalDate so it goes through TicketService's authoritative finalDate choke point
    // (ghost-history capture + promoteRelayToScheduled), instead of being silently dropped like
    // before. A pending reschedule must NOT send it — that's what keeps it off Schedules.
    if (!isPendingResched && draft.finalDate) {
      payload.finalDate = draft.finalDate
    }
    payload.customerName = draft.customerName || null
    payload.location = draft.location || null
    payload.preferredDate = draft.preferredDate ? new Date(draft.preferredDate).toISOString() : null
    payload.priorityTag = draft.priorityTag || null
    payload.district = draft.district || null
    payload.commitType = draft.commitType || null
    // Never store negotiator name in installerName (schedules INSTALLER column is field crew only)
    const negotiatorName = String(employees.find((e: { id: string; name?: string }) => e.id === draft.assignTechId)?.name || '').trim()
    let installerName = (draft.installerName || '').trim()
    if (installerName && negotiatorName
      && installerName.localeCompare(negotiatorName, undefined, { sensitivity: 'base' }) === 0) {
      installerName = ''
    }
    payload.installerName = installerName
    payload.serviceVehicle = draft.serviceVehicle || null
    const newRemark = (draft.remarksUpdate || '').trim()
    if (newRemark) {
      payload.remarksUpdate = newRemark
    }
    const isNoPayment = !draft.modeOfPayment
      || String(draft.modeOfPayment).toUpperCase().replace(/\s+/g, '_') === 'NO_PAYMENT'
    payload.installationCharges = isNoPayment ? null : Number(draft.installationCharges)
    payload.modeOfPayment = isNoPayment ? 'NO_PAYMENT' : (draft.modeOfPayment || null)
    payload.controlNumber = draft.controlNumber || null
    const acDetailsObj = {
      // Start from the ticket's existing acDetails so keys this modal doesn't expose
      // (negotiatorName, destination, etc. set by the Schedules/My Tickets edit path) survive
      // a save from the Relays drawer.
      ...existingDetails,
      robinsonsTransactionId: draft.robinsonsTransactionId || '',
      // schedulePhase/scheduleOutcome must follow whatever status button was just picked here —
      // without this, they keep whatever value existingDetails had before (e.g. still SURVEY &
      // INSTALL from before), so rows/labels reading schedulePhase (getCategoryLabel,
      // formatRelayTicketTypeShort) keep showing the OLD type after switching to BACKJOB/CHECKUP.
      ...(resolvedEditStatus.schedulePhase !== undefined ? { schedulePhase: resolvedEditStatus.schedulePhase } : {}),
      ...(resolvedEditStatus.scheduleOutcome !== undefined ? { scheduleOutcome: resolvedEditStatus.scheduleOutcome } : {}),
      landmarks: draft.landmarks || '',
      brand: draft.brand || '',
      capacity: draft.capacity || '',
      sku: draft.sku || '',
      serialNumber: draft.serialNumber || '',
      alternatePhone: draft.phoneNumbers.slice(1).filter(Boolean).join(', '),
      relayedDate: draft.relayedDate || '',
      // Deliberately keep the old finalDate while a reschedule is pending — it's what lets the
      // Schedules ghost row for the old date keep showing a RESCHED badge instead of vanishing
      // (see promoteRelayToScheduled's reschedulePending guard on the backend). getRelayStatusLabel/
      // hasRelayLeftQueue below key off reschedulePending, not finalDate, to keep this ticket in
      // the negotiator's My Tickets queue while it's pending. Once resolved to a real date, mirror
      // draft.finalDate here too (backend's finalDate choke point will also set this from
      // payload.finalDate above, but keeping it in sync locally matches the optimistic update below).
      finalDate: isPendingResched ? (existingDetails.finalDate || '') : (draft.finalDate || existingDetails.finalDate || ''),
      reschedulePending: isPendingResched,
      promodiserName: draft.referralRecipient || '',
      referralFeeRecipient: draft.referralRecipient || '',
      referralFeeAmount: draft.referralAmount || draft.storeReferralFee || '',
      referralFeeStatus: draft.referralStatus || '',
      referralFeeDatePaid: draft.referralDatePaid || '',
      referralFeeReferenceNo: draft.referralReferenceNo || '',
      forRebatesClaim: draft.rebatesClaim || 'YES',
      rebatesCompany: draft.rebatesCompany || '',
      rebatesAmountDue: draft.rebatesAmountDue || '',
      rebatesStatus: draft.rebatesStatus || '',
      rebatesReferenceNo: draft.rebatesReferenceNo || '',
      warrantyRegistrationStatus: draft.warrantyStatus || '',
      warrantyRegisteredBy: draft.warrantyRegisteredBy || '',
    }
    payload.acDetails = JSON.stringify(acDetailsObj)
    payload.negotiatorId = draft.assignTechId || ''
    payload.storeReferralFee = (draft.referralAmount || draft.storeReferralFee).trim() ? (draft.referralAmount || draft.storeReferralFee).trim() : '0'
    payload.warrantyDocsStatus = draft.warrantyStatus || null
    payload.images = draft.images || null
    payload.contactPhone = draft.phoneNumbers[0] || null
    payload.dealer = resolveRelayDealerForSubmit(draft.dealerName, draft.dealerBranch) || null
    payload.diser = draft.diser || null
    const brandHpLabel = formatBrandCapacityLabel(draft.brand, draft.capacity)
    payload.unitType = brandHpLabel || draft.unitType || null
    payload.serviceType = draft.serviceType || null

    const optimisticTicket: Ticket = {
      ...selectedTicket,
      // Use the resolved backend status (payload.status), not the raw picker value (finalStatus,
      // e.g. 'BACKJOB') — the raw value has no Ticket.Status enum constant and previously leaked
      // into the local ticket's status field until a hard refresh replaced it with server data.
      status: payload.status ?? finalStatus,
      ...(payload.finalDate ? { finalDate: payload.finalDate, final_date: payload.finalDate } : {}),
      branchId: branchId || undefined,
      assignedTo: assignedTo || undefined,
      negotiatorId: draft.assignTechId || '',
      negotiator_id: draft.assignTechId || '',
      customerName: draft.customerName || selectedTicket.customerName,
      location: draft.location || selectedTicket.location,
      preferredDate: draft.preferredDate
        ? new Date(draft.preferredDate).toISOString()
        : selectedTicket.preferredDate,
      priorityTag: draft.priorityTag || selectedTicket.priorityTag,
      district: draft.district || selectedTicket.district,
      commitType: draft.commitType || selectedTicket.commitType,
      installerName: installerName || undefined,
      serviceVehicle: draft.serviceVehicle || selectedTicket.serviceVehicle,
      remarksUpdate: newRemark || selectedTicket.remarksUpdate,
      installationCharges: Number(draft.installationCharges),
      modeOfPayment: draft.modeOfPayment || selectedTicket.modeOfPayment,
      controlNumber: draft.controlNumber || selectedTicket.controlNumber,
      acDetails: payload.acDetails,
      storeReferralFee: payload.storeReferralFee,
      warrantyDocsStatus: draft.warrantyStatus || selectedTicket.warrantyDocsStatus,
      images: draft.images || selectedTicket.images,
      contactPhone: draft.phoneNumbers[0] || selectedTicket.contactPhone,
      dealer: payload.dealer || selectedTicket.dealer || selectedTicket.sourceVendor,
      diser: payload.diser || selectedTicket.diser,
      unitType: brandHpLabel || draft.unitType || selectedTicket.unitType,
      serviceType: draft.serviceType || selectedTicket.serviceType,
      updatedAt: new Date().toISOString(),
    }

    const original = selectedTicket
    setIsActionDrawerOpen(false)
    setSelectedTicket(null)
    queueRelayPatch(original, payload, optimisticTicket)
  }

  const handleMergeTickets = async () => {
    if (!selectedTicket || !mergeTargetId) return
    const target = tickets.find(t => t.id === mergeTargetId)
    if (!target) return
    if (!window.confirm(
      `Merge ticket ${getTicketNumber(selectedTicket)} into ${getTicketNumber(target)}?\n\n`
      + `Remarks will be combined and the duplicate record will be removed. The scheduled date is kept on the target ticket.`,
    )) return

    setMerging(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/tickets/${selectedTicket.id}/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetId: mergeTargetId })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `Failed to merge tickets (HTTP ${res.status})`)
      }

      setIsActionDrawerOpen(false)
      setSelectedTicket(null)
      fetchData({ soft: true })
      alert('Tickets merged successfully!')
    } catch (err: any) {
      alert(err.message || 'Error occurred while merging tickets.')
    } finally {
      setMerging(false)
    }
  }

  // Open action drawer for a ticket
  const openDrawer = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setMergeTargetId('')
    setIsActionDrawerOpen(true)
  }


  // Filtered lists
  const relayTabCounts = useMemo(() => {
    let allPending = 0
    let unassigned = 0
    let assigned = 0
    let mine = 0
    const activeBranch = branchFilter
    const eligible = dedupeRelaysDisplay(tickets.filter(t => {
      if (shouldExcludeFromRelaysTab(t)) return false
      const status = (t.status || '').toUpperCase()
      if (status === 'COMPLETED' || status === 'CANCELLED') return false

      if (monthFilter !== 'all') {
        const ticketMonth = (t.createdAt || '').slice(0, 7)
        if (ticketMonth !== monthFilter) return false
      }

      if (storeFilter !== 'ALL') {
        const vendorLower = (t.dealer || t.sourceVendor || 'Direct').toLowerCase()
        if (!vendorLower.includes(storeFilter.toLowerCase())) return false
      }
      if (activeBranch && activeBranch !== 'ALL' && activeBranch !== 'ALL_BRANCHES') {
        const resolved = resolveBranch(t.branchId)
        if (!resolved || resolved.id !== activeBranch) return false
      }
      if (!isAdmin && user?.branchId) {
        const resolved = resolveBranch(t.branchId)
        const userRootBranch = user.branchId.replace(/-(sales|services|service)$/i, '')
        const ticketRootBranch = (resolved?.id || '').replace(/-(sales|services|service)$/i, '')
        if (!ticketRootBranch || ticketRootBranch.toLowerCase() !== userRootBranch.toLowerCase()) return false
      }
      return true
    }))
    for (const t of eligible) {
      const statusLabel = getRelayStatusLabel(t)
      if (statusLabel !== 'Pending' && statusLabel !== 'Assigned') continue
      allPending++
      if (statusLabel === 'Pending') unassigned++
      else assigned++
      if (isAdmin) mine++
      else if (t.assignedTo === user?.id || t.negotiatorId === user?.id || t.negotiator_id === user?.id) {
        if (statusLabel === 'Assigned') mine++
      }
    }
    return {
      ALL_PENDING: allPending,
      UNASSIGNED: unassigned,
      PENDING: assigned,
      MY_TICKETS: mine,
    }
  }, [tickets, storeFilter, branchFilter, globalBranchId, user?.id, isAdmin, monthFilter, branches])

  // relayPillItems removed

  const filtered = useMemo(() => dedupeRelaysDisplay(tickets.filter(t => {
    if (shouldExcludeFromRelaysTab(t)) return false
    const status = (t.status || '').toUpperCase()
    if (status === 'COMPLETED' || status === 'CANCELLED') return false

    // Month filter
    if (monthFilter !== 'all') {
      const ticketMonth = (t.createdAt || '').slice(0, 7)
      if (ticketMonth !== monthFilter) return false
    }

    // Tab filtering
    const statusLabel = getRelayStatusLabel(t)
    
    if (activeTab === 'MY_TICKETS') {
      // Negotiator branch queue — assigned only, no finalDate (scheduled leaves Relays entirely)
      if (statusLabel !== 'Assigned') return false
      if (!t.assignedTo && !t.negotiatorId && !t.negotiator_id) return false
      if (!isAdmin && user?.id && t.assignedTo !== user.id && t.negotiatorId !== user.id && t.negotiator_id !== user.id) {
        return false
      }
    } else {
      if (statusLabel !== 'Pending' && statusLabel !== 'Assigned') return false

      if (activeTab === 'UNASSIGNED') {
        if (statusLabel !== 'Pending') return false
      } else if (activeTab === 'PENDING') {
        if (statusLabel !== 'Assigned') return false
      }
    }

    // Vendor filter
    if (storeFilter !== 'ALL') {
      const vendorLower = (t.dealer || t.sourceVendor || 'Direct').toLowerCase()
      const filterLower = storeFilter.toLowerCase()
      if (!vendorLower.includes(filterLower)) return false
    }

    // Branch filter
    const activeBranch = branchFilter
    if (activeBranch && activeBranch !== 'ALL' && activeBranch !== 'ALL_BRANCHES') {
      const resolved = resolveBranch(t.branchId)
      if (!resolved || resolved.id !== activeBranch) return false
    }
    // Branch filter for non-admin: fuzzy match root branch (strip -sales/-services suffix)
    // so Taguig Services employees see their tickets even if branchId says TAGUIG-SALES
    if (!isAdmin && user?.branchId) {
      const resolved = resolveBranch(t.branchId)
      const userRootBranch = user.branchId.replace(/-(sales|services|service)$/i, '')
      const ticketRootBranch = (resolved?.id || '').replace(/-(sales|services|service)$/i, '')
      if (!ticketRootBranch || ticketRootBranch.toLowerCase() !== userRootBranch.toLowerCase()) return false
    }

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const custName = (t.customerName || '').toLowerCase()
      const branchName = resolveBranch(t.branchId)?.name?.toLowerCase() || ''
      const techName = (t.assignedEmployeeName || '').toLowerCase()
      const id = t.id.toLowerCase()
      const loc = (t.location || '').toLowerCase()
      const ctrlNum = (t.controlNumber || '').toLowerCase()
      const phone = (t.contactPhone || '').toLowerCase()
      const vendor = (t.dealer || t.sourceVendor || '').toLowerCase()
      const svcType = (t.serviceType || '').toLowerCase()
      const commit = (t.commitType || '').toLowerCase()
      const installer = (t.installerName || '').toLowerCase()
      const district = (t.district || '').toLowerCase()
      const remarks = (t.remarksUpdate || '').toLowerCase()
      const desc = (t.description || '').toLowerCase()

      // Parse acDetails for brand/sku/serial number
      let acBrand = ''
      let acSku = ''
      let acSerial = ''
      if (t.acDetails) {
        try {
          const parsed = JSON.parse(t.acDetails)
          acBrand = (parsed.brand || '').toLowerCase()
          acSku = (parsed.sku || '').toLowerCase()
          acSerial = (parsed.serialNumber || '').toLowerCase()
        } catch (e) {}
      }

      const ticketNo = (normalizeRelayTicketNumber(t) || '').toLowerCase()
      return (
        custName.includes(q) ||
        ticketNo.includes(q) ||
        branchName.includes(q) ||
        techName.includes(q) ||
        id.includes(q) ||
        loc.includes(q) ||
        ctrlNum.includes(q) ||
        phone.includes(q) ||
        vendor.includes(q) ||
        svcType.includes(q) ||
        commit.includes(q) ||
        installer.includes(q) ||
        district.includes(q) ||
        remarks.includes(q) ||
        desc.includes(q) ||
        acBrand.includes(q) ||
        acSku.includes(q) ||
        acSerial.includes(q)
      )
    }

    return true
  })), [tickets, monthFilter, activeTab, storeFilter, branchFilter, globalBranchId, user?.id, isAdmin, searchQuery, branches])

  // Keyboard navigation for selected row & cell
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filtered.length === 0) return
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return

      // Don't intercept if user is typing in input/textarea/select fields
      const activeEl = document.activeElement
      if (activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return
      }

      e.preventDefault()

      // Find current selected index
      const currentIndex = filtered.findIndex(t => t.id === selectedPreviewTicket?.id)
      let nextIndex = currentIndex
      let currentCol = selectedColIndex >= 0 ? selectedColIndex : 0
      let nextCol = currentCol

      if (e.key === 'ArrowDown') {
        if (currentIndex === -1) {
          nextIndex = 0
        } else if (currentIndex < filtered.length - 1) {
          nextIndex = currentIndex + 1
        }
      } else if (e.key === 'ArrowUp') {
        if (currentIndex > 0) {
          nextIndex = currentIndex - 1
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex === -1) {
          nextIndex = 0
          nextCol = 0
        } else {
          if (currentCol < columns.length - 1) {
            nextCol = currentCol + 1
          } else if (currentIndex < filtered.length - 1) {
            nextCol = 0
            nextIndex = currentIndex + 1
          }
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex === -1) {
          nextIndex = 0
          nextCol = 0
        } else {
          if (currentCol > 0) {
            nextCol = currentCol - 1
          } else if (currentIndex > 0) {
            nextCol = columns.length - 1
            nextIndex = currentIndex - 1
          }
        }
      }

      const rowChanged = nextIndex !== currentIndex
      const colChanged = nextCol !== currentCol

      if (rowChanged || colChanged) {
        if (filtered[nextIndex]) {
          setSelectedPreviewTicket(filtered[nextIndex])
          setSelectedColIndex(nextCol)
          
          // Scroll the selected cell or row into view if needed
          const cellEl = document.getElementById(`cell-${filtered[nextIndex].id}-${nextCol}`)
          if (cellEl) {
            cellEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
          } else {
            const rowEl = document.getElementById(`row-${filtered[nextIndex].id}`)
            if (rowEl) {
              rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            }
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filtered, selectedPreviewTicket, selectedColIndex, columns.length])

  // Store style mappings
  const getDealerStyle = (dealerValue?: string) => {
    const parsed = parseDealer(dealerValue || '')
    if (parsed.store === 'Robinsons') {
      const displayLabel = parsed.branch ? `RA ${parsed.branch}` : 'RA'
      return { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', label: displayLabel }
    } else if (parsed.store === 'Abenson') {
      const displayLabel = parsed.branch ? `Abenson ${parsed.branch}` : 'Abenson'
      return { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', label: displayLabel }
    } else if (parsed.store === 'Direct') {
      return { bg: 'rgba(99,102,241,0.1)', color: '#6366F1', label: 'Direct Client' }
    }
    const displayLabel = parsed.branch ? `${parsed.customStore} - ${parsed.branch}` : (parsed.customStore || 'Other Store')
    return { bg: 'rgba(100,116,139,0.1)', color: '#64748B', label: displayLabel }
  }

  

  const formatRelayDate = (value?: string) => {
    if (!value) return '—'
    try {
      const d = new Date(value)
      if (isNaN(d.getTime())) return value
      const day = d.getDate()
      const mon = d.toLocaleDateString('en-US', { month: 'short' })
      const yr = String(d.getFullYear()).slice(-2)
      return `${day}-${mon}-${yr}`
    } catch {
      return value
    }
  }

  const getCategoryLabel = (ticket: Ticket) => {
    // schedulePhase is authoritative for CHECKUP/BACKJOB — the generic serviceType/title text a
    // saved schedule status leaves behind ("Service") can't distinguish them from plain SERVICE,
    // and a stale pre-patch title still containing "Install" would otherwise win below. Check first.
    const phase = String(parseAcDetails(ticket).schedulePhase || '').trim().toUpperCase().replace(/\s+/g, '_')
    if (phase === 'CHECKUP') return 'CHECKUP'
    if (phase === 'BACKJOB') return 'BACKJOB'
    if (phase === 'CLEANING') return 'CLEANING'

    const rawStatus = (ticket.status || '').trim().toUpperCase()
    if (rawStatus === 'S/I') return 'SURVEY & INSTALL'

    const svc = (ticket.serviceType || '').trim().toUpperCase()
    if (/S\/I|\bSI\b|INSTALL|SURVEY\s*&\s*INSTALL/.test(svc)) return 'SURVEY & INSTALL'
    if (svc.includes('SURVEY')) return 'SURVEY'
    if (svc.includes('INSTALLATION')) return 'INSTALLATION'
    if (svc.includes('SERVICE') || svc.includes('CLEAN')) return 'SERVICE'
    const cat = getTicketCategory(ticket)
    if (cat === 'Survey & Install') return 'SURVEY & INSTALL'
    if (cat === 'Survey') return 'SURVEY'
    if (cat === 'Service') return 'SERVICE'
    return svc || 'SERVICE'
  }

  // STATUS is the relay workflow stage only — never a field-type sub-status (BACKJOB, CHECKUP,
  // SURVEY & INSTALL, ...). Those belong on CATEGORY (getCategoryLabel). Purely a function of
  // negotiator assignment + final date, per the relay intake flow: no negotiator = PENDING,
  // negotiator but no final date = ASSIGNED, negotiator + final date = SCHEDULED.
  const getRelayStatusShort = (ticket: Ticket) => {
    const status = (ticket.status || '').toUpperCase()
    if (status === 'CANCELLED') return 'CANCELLED'
    if (getRelayStatusLabel(ticket) === 'Installed') return 'INSTALLED'

    const finalDate = resolveRelayFinalDate(ticket)
    const negotiatorId = (ticket.negotiatorId || ticket.negotiator_id || '').trim()
    const hasNegotiator = Boolean(
      negotiatorId || ticket.assignedTo || ticket.negotiatorName?.trim() || ticket.assignedEmployeeName?.trim(),
    )
    if (finalDate && hasNegotiator) return 'SCHEDULED'
    if (hasNegotiator) return 'ASSIGNED'
    return 'PENDING'
  }

  const formatBranchTableLabel = (branchId?: string, ticket?: Ticket) => {
    let full = formatAssignedBranchLabel(branchId)
    
    if (full.startsWith('TAGUIG') && ticket) {
      const isService = isTaguigServiceTicket(ticket as any)
      full = isService ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES'
    }

    if (full === '—') return '—'
    if (full === 'TAGUIG - SALES') return 'TAGUIG SALES'
    if (full === 'TAGUIG - SERVICES') return 'TAGUIG SERVICES'
    if (full.startsWith('TAGUIG')) return 'TAGUIG'
    return full
  }

  const getTicketNumber = (ticket: Ticket) => normalizeRelayTicketNumber(ticket) || '—'

  const displayUpper = (value?: string | null) => {
    const str = (value ?? '').trim()
    if (!str || str === '—') return '—'
    return str.toUpperCase()
  }

  


  // Helper to determine if a field was auto-extracted from voucher scan

  








  // Helper to determine if a field was auto-extracted from voucher scan
  const isFieldExtracted = (fieldValue: any) => {
    if (!addForm.images) return false
    if (fieldValue === undefined || fieldValue === null) return false
    const str = String(fieldValue).trim()
    if (str === '' || str === '0' || str === '0.00' || str === '00' || str === '000') return false
    if (str === 'Installation' || str === 'Installation service' || str === 'Voucher scanned via Gemini AI.') return false
    return true
  }

  const previewDetails = selectedPreviewTicket
    ? parseAcDetails(selectedPreviewTicket)
    : { landmarks: '', brand: '', capacity: '', sku: '', serialNumber: '', alternatePhone: '', relayedDate: '', finalDate: '' }

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full" style={{ backgroundColor: pageBg }}>
      {/* ── Portal: Toolbar into header slot ────────────────── */}
      {ReactDOM.createPortal(
        <div className="w-full px-3 md:px-5 pt-2 pb-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 relative">
          
          {/* ── Left Side: Filters & Search ── */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1 min-w-0">
            
            {/* Filter chips */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Branch Chip */}
              <div className="relative">
                <button
                  type="button"
                  disabled={!isAdmin}
                  data-dropdown-id="branch-filter"
                  onClick={() => setIsBranchFilterOpen(prev => !prev)}
                  className={`flex items-center gap-1.5 md:gap-2 h-8 md:h-10 pl-2.5 md:pl-4 pr-3 md:pr-5 rounded-full border text-[11px] md:text-[13px] font-semibold whitespace-nowrap transition-all ${
                    isAdmin ? 'cursor-pointer hover:opacity-80 active:scale-95' : 'opacity-60 cursor-default'
                  }`}
                  style={{
                    backgroundColor: branchFilter !== 'ALL'
                      ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)')
                      : inputBg,
                    borderColor: branchFilter !== 'ALL' ? '#10B981' : inputBorder,
                    color: branchFilter !== 'ALL' ? '#10B981' : textMuted,
                  }}
                >
                  <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" style={{ color: 'inherit' }} />
                  <span>
                    {branchFilter === 'ALL'
                      ? 'Branch'
                      : formatBranchName(branches.find(b => b.id === branchFilter)?.name || branchFilter)}
                  </span>
                  {isAdmin && <ChevronDown className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-50 -mr-0.5" />}
                </button>

                {/* Branch Dropdown */}
                {isAdmin && isBranchFilterOpen && (
                  <div data-dropdown-id="branch-dropdown" className="absolute left-0 top-full mt-2 w-52 rounded-xl border shadow-2xl z-[100] p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
                    style={{ backgroundColor: cardBg, borderColor: border }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5" style={{ color: textMuted }}>Select Branch</span>
                    <div className="max-h-60 overflow-y-auto flex flex-col gap-0.5 pr-1">
                      <button
                        type="button"
                        onClick={() => { setBranchFilter('ALL'); setIsBranchFilterOpen(false); }}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                        style={{
                          backgroundColor: branchFilter === 'ALL' ? hoverBg : 'transparent',
                          color: branchFilter === 'ALL' ? textPrimary : textMuted
                        }}
                      >
                        <span>All Branches</span>
                        {branchFilter === 'ALL' && <Check className="w-3.5 h-3.5" style={{ color: textPrimary }} />}
                      </button>
                      {branches.map(b => {
                        const isSelected = branchFilter === b.id
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => { setBranchFilter(b.id); setIsBranchFilterOpen(false); }}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                            style={{
                              backgroundColor: isSelected ? hoverBg : 'transparent',
                              color: isSelected ? textPrimary : textMuted
                            }}
                          >
                            <span>{formatBranchName(b.name)}</span>
                            {isSelected && <Check className="w-3.5 h-3.5" style={{ color: textPrimary }} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Dealer Chip */}
              <div className="relative">
                <button
                  type="button"
                  data-dropdown-id="store-filter"
                  onClick={() => setIsStoreFilterOpen(prev => !prev)}
                  className="flex items-center gap-1.5 md:gap-2 h-8 md:h-10 pl-2.5 md:pl-4 pr-3 md:pr-5 rounded-full border text-[11px] md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer hover:opacity-80 active:scale-95"
                  style={{
                    backgroundColor: storeFilter !== 'ALL'
                      ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)')
                      : inputBg,
                    borderColor: storeFilter !== 'ALL' ? '#10B981' : inputBorder,
                    color: storeFilter !== 'ALL' ? '#10B981' : textMuted,
                  }}
                >
                  <Package className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" style={{ color: 'inherit' }} />
                  <span>{storeFilter === 'ALL' ? 'Dealer' : storeFilter}</span>
                  <ChevronDown className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-50 -mr-0.5" />
                </button>

                {/* Dealer Dropdown */}
                {isStoreFilterOpen && (
                  <div data-dropdown-id="store-dropdown" className="absolute left-0 top-full mt-2 w-52 rounded-xl border shadow-2xl z-[100] p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
                    style={{ backgroundColor: cardBg, borderColor: border }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5" style={{ color: textMuted }}>Filter by Dealer</span>
                    <div className="max-h-60 overflow-y-auto flex flex-col gap-0.5 pr-1">
                      <button
                        type="button"
                        onClick={() => { setStoreFilter('ALL'); setIsStoreFilterOpen(false); }}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                        style={{
                          backgroundColor: storeFilter === 'ALL' ? hoverBg : 'transparent',
                          color: storeFilter === 'ALL' ? textPrimary : textMuted
                        }}
                      >
                        <span>All Dealers</span>
                        {storeFilter === 'ALL' && <Check className="w-3.5 h-3.5" style={{ color: textPrimary }} />}
                      </button>
                      {['ABENSONS', 'ROBINSONS APPLIANCES'].map(dealerName => {
                        const isSelected = storeFilter === dealerName
                        return (
                          <button
                            key={dealerName}
                            type="button"
                            onClick={() => { setStoreFilter(dealerName); setIsStoreFilterOpen(false); }}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                            style={{
                              backgroundColor: isSelected ? hoverBg : 'transparent',
                              color: isSelected ? textPrimary : textMuted
                            }}
                          >
                            <span>{dealerName}</span>
                            {isSelected && <Check className="w-3.5 h-3.5" style={{ color: textPrimary }} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Month Chip */}
              <div className="relative">
                <button
                  type="button"
                  data-dropdown-id="month-filter"
                  onClick={() => setIsMonthFilterOpen(prev => !prev)}
                  className="flex items-center gap-1.5 md:gap-2 h-8 md:h-10 pl-2.5 md:pl-4 pr-3 md:pr-5 rounded-full border text-[11px] md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer hover:opacity-80 active:scale-95 shrink-0"
                  style={{
                    backgroundColor: monthFilter !== 'all'
                      ? (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)')
                      : inputBg,
                    borderColor: monthFilter !== 'all' ? '#10B981' : inputBorder,
                    color: monthFilter !== 'all' ? '#10B981' : textMuted,
                  }}
                >
                  <CalendarDays className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" style={{ color: 'inherit' }} />
                  <span>{monthFilter === 'all' ? 'Month' : monthLabel(monthFilter)}</span>
                  <ChevronDown className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-50 -mr-0.5" />
                </button>

                {/* Month Dropdown */}
                {isMonthFilterOpen && (
                  <div data-dropdown-id="month-dropdown" className="absolute left-0 top-full mt-2 w-52 rounded-xl border shadow-2xl z-[100] p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
                    style={{ backgroundColor: cardBg, borderColor: border }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5" style={{ color: textMuted }}>Filter by Month</span>
                    <div className="max-h-60 overflow-y-auto flex flex-col gap-0.5 pr-1">
                      <button
                        type="button"
                        onClick={() => { setMonthFilter('all'); setIsMonthFilterOpen(false); }}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                        style={{
                          backgroundColor: monthFilter === 'all' ? hoverBg : 'transparent',
                          color: monthFilter === 'all' ? textPrimary : textMuted
                        }}
                      >
                        <span>All Months</span>
                        {monthFilter === 'all' && <Check className="w-3.5 h-3.5" style={{ color: textPrimary }} />}
                      </button>
                      {monthOptions.map(ym => {
                        const isSelected = monthFilter === ym
                        return (
                          <button
                            key={ym}
                            type="button"
                            onClick={() => { setMonthFilter(ym); setIsMonthFilterOpen(false); }}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                            style={{
                              backgroundColor: isSelected ? hoverBg : 'transparent',
                              color: isSelected ? textPrimary : textMuted
                            }}
                          >
                            <span>{monthLabel(ym)}</span>
                            {isSelected && <Check className="w-3.5 h-3.5" style={{ color: textPrimary }} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Search bar (Next to Month Chip on Desktop) */}
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
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="shrink-0 p-1 md:p-1.5 rounded-full hover:bg-slate-500/10 transition-colors" style={{ color: textMuted }}>
                  <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Action buttons */}
          {(isAdmin || canMemberAccessRelaysAndTicketCreation(user)) && (
            <div className="flex items-center gap-1.5 shrink-0 relative justify-end md:justify-end">
              {/* Settings icon */}
              {(isAdmin || canMemberAccessRelaysAndTicketCreation(user)) && (
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full border transition-all hover:opacity-80 active:scale-90"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
                  title="Manage Dealer Settings"
                >
                  <Settings className="w-4 h-4 md:w-4.5 md:h-4.5" />
                </button>
              )}
              {/* Excel Import — admin/management only */}
              {isAdminOrManagement && (
                <>
                  <button
                    type="button"
                    onClick={() => excelFileRef.current?.click()}
                    className="flex items-center gap-1.5 md:gap-2 h-8 md:h-10 px-3 md:px-5 rounded-full font-bold text-[12px] md:text-[14px] hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-md border"
                    style={{ background: isLight ? '#f8fafc' : '#1e293b', borderColor: border, color: textPrimary }}
                    title="Import tickets from Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-500" />
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                  <input
                    ref={excelFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleExcelFileChange}
                  />
                </>
              )}
              {/* Create Ticket Button */}
              <button
                type="button"
                onClick={openAddModal}
                className="flex items-center gap-1.5 md:gap-2 h-8 md:h-10 px-4 md:px-6 rounded-full font-bold text-[12px] md:text-[14px] text-white hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-md"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span>New Ticket</span>
              </button>
            </div>
          )}


        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      <div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden" style={{ backgroundColor: cardBg, borderTop: `1px solid ${border}` }}>
          <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto" data-ticket-table-scroll>
          <div className="md:hidden w-full">
            <ResponsiveTable 
              data={filtered} 
              columns={(() => {
                const MOBILE_VISIBLE_COLS = new Set(['TICKET NO', 'STATUS', 'CUSTOMER NAME', 'DISTRICT'])
                return columns.map((col: any) => {
                  const isMobileVisible = MOBILE_VISIBLE_COLS.has(col.label)
                  
                  if (col.label === 'TICKET NO') {
                    return {
                      header: col.label,
                      accessorKey: col.label,
                      isMobileVisible,
                      cellRenderer: (ticket: Ticket) => {
                        const rawId = ticket.id || (ticket as any).ticketId || (ticket as any).ticket_id || ''
                        const cleanTicketNo = String(rawId).substring(0, 8).toUpperCase()
                        return (
                          <div className="flex items-center justify-end min-w-0 w-full" title={cleanTicketNo}>
                            <span className="font-mono font-bold truncate max-w-[150px] block text-right" style={{ color: textPrimary }}>{cleanTicketNo}</span>
                          </div>
                        )
                      }
                    }
                  }
                  
                  if (col.label === 'STATUS') {
                    return {
                      header: col.label,
                      accessorKey: col.label,
                      isMobileVisible,
                      cellRenderer: (ticket: Ticket) => {
                        const st = getRelayStatusLabel(ticket)
                        return (
                          <div className="flex justify-end w-full cursor-pointer items-center"
                               onClick={(e) => {
                                 e.stopPropagation()
                                 setSelectedPreviewTicket(ticket)
                                 setIsViewModalOpen(true)
                               }}>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200">
                              {st}
                            </span>
                          </div>
                        )
                      }
                    }
                  }

                  if (col.label === 'CUSTOMER NAME') {
                    return {
                      header: col.label,
                      accessorKey: col.label,
                      isMobileVisible,
                      cellRenderer: (ticket: Ticket) => {
                        return (
                          <span className="font-bold text-gray-900 dark:text-gray-100 block truncate max-w-[180px] text-right ml-auto cursor-pointer" 
                                title={ticket.customerName || 'Direct Client'}
                                onClick={(e) => {
                                 e.stopPropagation()
                                 setSelectedPreviewTicket(ticket)
                                 setIsViewModalOpen(true)
                               }}>
                            {ticket.customerName || 'Direct Client'}
                          </span>
                        )
                      }
                    }
                  }
                  
                  return {
                    header: col.label,
                    accessorKey: col.label,
                    isMobileVisible,
                    cellRenderer: (ticket: Ticket) => {
                      let val = ''
                      switch(col.label) {
                        case 'DISTRICT': val = ticket.district || guessDistrict(ticket.location || ''); break;
                        case 'BRAND': val = (ticket as any).brand || '-'; break;
                        case 'STORE / SOURCE': val = ticket.sourceVendor || '-'; break;
                        case 'COMMIT': val = ticket.commitType || '-'; break;
                        case 'PREFERRED DATE': val = ticket.preferredDate ? formatRelayDate(ticket.preferredDate) : '-'; break;
                        case 'NEGOTIATOR': val = resolveRelayNegotiatorName(ticket, employees) || '-'; break;
                        case 'FINAL DATE': val = resolveRelayFinalDate(ticket) ? formatRelayDate(resolveRelayFinalDate(ticket)!) : '-'; break;
                        case 'REMARKS': val = ticket.description || '-'; break;
                        case 'CATEGORY': val = (ticket as any).category || '-'; break;
                        case 'STORE/SOURCE': val = ticket.sourceVendor || '-'; break;
                        case 'DATE RELAYED': val = ticket.createdAt ? formatRelayDate(ticket.createdAt) : '-'; break;
                        default: val = '-';
                      }
                      return (
                        <span className="truncate block w-full text-sm text-right" title={val}>
                          {val}
                        </span>
                      )
                    }
                  }
                }) as ResponsiveColumnDef<any>[]
              })() as any} 
            />
          </div>

          <div className="hidden md:block w-full">
          <table
            key={activeTab}
            className="w-full hidden md:table"
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              fontSize: tableFontSize,
            }}>
            <colgroup>
              {columns.map(col => (
                <col key={col.label} style={{ width: col.w }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${tableRowBorder}` }}>
                {columns.map(col => (
                  <th key={col.label}
                    onClick={() => col.label !== 'ACTIONS' && toggleColumn(col.label)}
                    title={col.label !== 'ACTIONS' ? `Click to ${col.isExpanded ? 'collapse' : 'expand'} column` : undefined}
                    style={{
                      padding: `${headerPadY}px ${cellPadX}px`,
                      textAlign: 'center',
                      color: col.isExpanded ? (isLight ? '#10B981' : '#34D399') : textMuted,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      borderRight: tableColBorder,
                      borderBottom: `2px solid ${tableRowBorder}`,
                      fontSize: headerFontSize,
                      letterSpacing: '0.09em',
                      backgroundColor: inputBg,
                      cursor: col.label !== 'ACTIONS' ? 'pointer' : 'default',
                      userSelect: 'none',
                      transition: 'all 0.15s ease-in-out',
                      position: 'sticky',
                      top: 0,
                      zIndex: col.sticky ? 25 : 20,
                      verticalAlign: 'middle',
                      ...columnCellStyle(col),
                      ...(col.sticky ? { left: col.left } : {}),
                    }}>
                    <div className={`flex items-center gap-1.5 w-full ${columnTextAlign(col) === 'left' ? 'justify-start text-left' : columnTextAlign(col) === 'right' ? 'justify-end text-right' : 'justify-center text-center'}`}>
                      <span>{col.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="uppercase">
              {refreshing && tickets.length > 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-1 text-center text-[10px] font-semibold" style={{ color: textMuted }}>
                    Refreshing relays…
                  </td>
                </tr>
              )}
              {loading && tickets.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#10B981]" />
                    <p className="text-sm font-semibold" style={{ color: textMuted }}>Loading masterlist...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-20 text-center">
                    <Inbox className="w-12 h-12 opacity-20 mx-auto mb-3" style={{ color: textMuted }} />
                    <p className="text-sm font-bold" style={{ color: textPrimary }}>No new relays</p>
                  </td>
                </tr>
              ) : (
                filtered.map((ticket, idx) => {
                  const storeStyle = getDealerStyle(ticket.dealer || ticket.sourceVendor)
                  const details = parseAcDetails(ticket)
                  const branchName = formatBranchTableLabel(ticket.branchId, ticket)
                  const category = getTicketCategory(ticket)
                  const categoryLabel = getCategoryLabel(ticket)
                  const negotiator = resolveRelayNegotiatorName(ticket, employees)
                  const brandLabel = formatBrandCapacityLabel(details.brand, details.capacity)
                    || parseBrandFromAcDetails(ticket.acDetails)
                    || formatBrandCapacityLabel(ticket.unitType, '')
                  const district = (() => {
                    if (ticket.district?.trim()) return ticket.district.trim()
                    const loc = ticket.location || ''
                    const paren = loc.match(/\(([^)]+)\)\s*$/)
                    if (paren?.[1]?.trim()) return paren[1].trim()
                    return guessDistrict(loc) || '—'
                  })()
                  const relayedDate = formatRelayDate(details.relayedDate || (ticket.createdAt ? ticket.createdAt.split('T')[0] : ''))
                  const lastUpdate = ticket.remarksUpdate || ticket.description || '—'
                  const isSelected = selectedPreviewTicket?.id === ticket.id || contextMenu?.ticket.id === ticket.id
                  const isBackjob = categoryLabel === 'BACKJOB'
                  const categoryTint = !isSelected
                    ? isBackjob
                      ? (isLight ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.1)')
                      : category === 'Survey'
                      ? (isLight ? 'rgba(234,179,8,0.07)' : 'rgba(234,179,8,0.06)')
                      : category === 'Survey & Install' ? (isLight ? '#f0fdf9' : 'rgba(16,185,129,0.06)')
                      : null
                    : null
                  const isHighlighted = ticket.id === lastUpdatedTicketId
                  const rowBaseBg = isHighlighted
                    ? (isLight ? '#dcfce7' : 'rgba(22,163,74,0.25)') // Flash green!
                    : isSelected
                      ? (isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.12)')
                      : categoryTint || (idx % 2 === 0 ? (isLight ? '#ffffff' : '#060B18') : (isLight ? '#fafafa' : '#080f1c'))
                  const rowHoverBg = isBackjob
                    ? (isLight ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.16)')
                    : category === 'Survey'
                    ? (isLight ? 'rgba(234,179,8,0.13)' : 'rgba(234,179,8,0.11)')
                    : category === 'Survey & Install' ? (isLight ? '#e6faf4' : 'rgba(16,185,129,0.09)')
                    : (isLight ? '#f1f5f9' : '#0f1e36')
                  const ticketNo = getTicketNumber(ticket)
                  const cleanTicketNo = ticketNo.replace(/^\d+\.\s*/, '')
                  const relayStatus = getRelayStatusShort(ticket)
                  const statusIsAssigned = relayStatus === 'ASSIGNED'
                  const statusIsScheduled = relayStatus === 'SCHEDULED' || relayStatus === 'INSTALLED'
                  const finalDateKey = resolveRelayFinalDate(ticket)
                  const finalDateLabel = finalDateKey ? formatRelayDate(finalDateKey) : ''
                  const cells: Array<{ value: React.ReactNode; right?: boolean }> = activeTab === 'MY_TICKETS' ? [
                    // TICKET NO
                    { value: (
                      <div className="flex items-center w-full min-w-0" title={cleanTicketNo}>
                        <span className="text-slate-400 dark:text-slate-500 mr-2 shrink-0 font-semibold text-xs">{idx + 1}.</span>
                        <span className="font-black tracking-wide truncate block" style={{ color: textPrimary }}>
                          {displayUpper(cleanTicketNo)}
                        </span>
                      </div>
                    ) },
                    // CATEGORY
                    { value: (
                      <span className="truncate block w-full font-bold" style={{ color: textPrimary }} title={categoryLabel}>
                        {categoryLabel}
                      </span>
                    ) },
                    // STATUS
                    { value: (
                      <span className="font-bold w-full truncate block tracking-wide" style={{
                        color: statusIsAssigned || statusIsScheduled ? '#10B981' : '#F59E0B'
                      }}>
                        {relayStatus}
                      </span>
                    ) },
                    // CUSTOMER NAME
                    { value: (
                      <span className="truncate block font-bold w-full" title={displayUpper(ticket.customerName || 'Direct Client')} style={{ color: textPrimary }}>
                        {displayUpper(ticket.customerName || 'Direct Client')}
                      </span>
                    ) },
                    // DISTRICT
                    { value: (
                      <span className="truncate block w-full font-semibold" title={displayUpper(district)}>
                        {displayUpper(district)}
                      </span>
                    ) },
                    // BRAND
                    { value: (
                      <span className="truncate block w-full font-semibold" title={displayUpper(brandLabel)} style={{ color: textPrimary }}>
                        {displayUpper(brandLabel) || <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}
                      </span>
                    ) },
                    // DEALER
                    { value: (
                      <span className="truncate block w-full font-semibold" title={displayUpper(storeStyle.label)} style={{ color: textPrimary }}>
                        {displayUpper(storeStyle.label)}
                      </span>
                    ) },
                    // COMMIT
                    { value: (
                      <span className="truncate block w-full font-semibold" title={displayUpper(ticket.commitType || '')} style={{ color: textMuted }}>
                        {displayUpper(ticket.commitType || '') || <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}
                      </span>
                    ) },
                    // BRANCH
                    { value: <span className="truncate block w-full font-semibold" title={displayUpper(branchName)}>{displayUpper(branchName)}</span> },
                    // NEGOTIATOR
                    { value: (
                      <span className="truncate block w-full font-bold max-w-full" title={displayUpper(negotiator)} style={{ color: textPrimary }}>
                        {displayUpper(negotiator)}
                      </span>
                    ) },
                    // SCHEDULED DATE — click to open edit drawer and set/change date
                    { value: (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openDrawer(ticket) }}
                        className="whitespace-nowrap block w-full font-bold text-left cursor-pointer"
                        style={{
                          color: finalDateLabel ? '#10B981' : (isLight ? '#94a3b8' : '#475569'),
                          background: 'none', border: 'none', padding: 0,
                        }}
                        title={finalDateLabel ? `Scheduled: ${finalDateLabel} — click to edit` : 'Click to add schedule date'}
                      >
                        {finalDateLabel ? displayUpper(finalDateLabel) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.7 }}>
                            <span style={{ fontSize: '0.85em' }}>+</span> ADD DATE
                          </span>
                        )}
                      </button>
                    ) },
                    // REMARKS
                    { value: (
                      <span className="truncate block w-full font-semibold" title={(ticket.remarksUpdate || lastUpdate || '').toUpperCase()}>
                        {(ticket.remarksUpdate || lastUpdate) ? (ticket.remarksUpdate || lastUpdate).toUpperCase() : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}
                      </span>
                    ) }
                  ] : [
                    { value: (
                      <div className="flex items-center w-full min-w-0" title={cleanTicketNo}>
                        <span className="text-slate-400 dark:text-slate-500 mr-2 shrink-0 font-semibold text-xs">{idx + 1}.</span>
                        <span className="font-black tracking-wide truncate block" style={{ color: textPrimary }}>
                          {displayUpper(cleanTicketNo)}
                        </span>
                      </div>
                    ) },
                    { value: (
                      <span
                        className="font-bold w-full truncate block tracking-wide"
                        title={relayStatus}
                        style={{ color: statusIsAssigned || statusIsScheduled ? '#10B981' : relayStatus === 'CANCELLED' ? '#EF4444' : '#F59E0B' }}>
                        {relayStatus}
                      </span>
                    ) },
                    { value: (
                      <span className="truncate block w-full font-bold" style={{ color: textPrimary }} title={categoryLabel}>
                        {categoryLabel}
                      </span>
                    ) },
                    { value: (
                      <span
                        className={`${!columns[3].isExpanded ? 'truncate' : 'break-words'} block font-bold w-full`}
                        title={displayUpper(ticket.customerName || 'Direct Client')}
                        style={{ color: textPrimary }}>
                        {displayUpper(ticket.customerName || 'Direct Client')}
                      </span>
                    ) },
                    { value: <span className="block w-full truncate font-semibold">{displayUpper(district)}</span> },
                    { value: <span className="truncate block w-full font-semibold" title={displayUpper(storeStyle.label)}>{displayUpper(storeStyle.label)}</span> },
                    { value: <span className="whitespace-nowrap block w-full font-semibold">{displayUpper(relayedDate)}</span> },
                    { value: <span className="truncate block w-full font-semibold" title={displayUpper(branchName)}>{displayUpper(branchName)}</span> },
                    { value: <span className="truncate block w-full font-semibold" title={displayUpper(ticket.commitType || '')}>{displayUpper(ticket.commitType || '') || <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</span> },
                    { value: (
                      <span className="truncate block w-full font-bold max-w-full" title={displayUpper(negotiator)}>
                        {displayUpper(negotiator)}
                      </span>
                    ) },
                    { value: (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openDrawer(ticket) }}
                        className="whitespace-nowrap block w-full font-bold text-left cursor-pointer"
                        style={{
                          color: finalDateLabel ? '#10B981' : (isLight ? '#94a3b8' : '#475569'),
                          background: 'none', border: 'none', padding: 0,
                        }}
                        title={finalDateLabel ? `Scheduled: ${finalDateLabel} — click to edit` : 'Click to add schedule date'}
                      >
                        {finalDateLabel ? displayUpper(finalDateLabel) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.7 }}>
                            <span style={{ fontSize: '0.85em' }}>+</span> ADD DATE
                          </span>
                        )}
                      </button>
                    ) },
                    { value: <span className={`${!columns[11].isExpanded ? 'truncate' : 'break-words'} block w-full font-semibold`} title={(lastUpdate || '').toUpperCase()}>{lastUpdate ? lastUpdate.toUpperCase() : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</span> },
                  ]
                  return (
                    <tr key={ticket.id}
                      id={`row-${ticket.id}`}
                      onContextMenu={e => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, ticket })
                      }}
                      style={{
                        backgroundColor: rowBaseBg,
                        cursor: 'pointer',
                        transition: isHighlighted ? 'background-color 1.5s ease-out' : undefined,
                        height: activeTab === 'MY_TICKETS' ? TABLE_ROW_HEIGHT : undefined,
                      }}
                      onMouseEnter={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowHoverBg }) }}
                      onMouseLeave={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowBaseBg }) }}
                      onClick={() => setSelectedPreviewTicket(ticket)}
                      className="transition-colors">
                      {cells.map((cell, colIdx) => {
                        const col = columns[colIdx]
                        const isExpandedCell = activeTab === 'MY_TICKETS'
                          && expandedCell?.ticketId === ticket.id
                          && expandedCell?.colLabel === col.label
                        const canExpandCell = activeTab === 'MY_TICKETS'
                        return (
                          <td key={col.label}
                            id={`cell-${ticket.id}-${colIdx}`}
                            onClick={(e) => {
                              setSelectedPreviewTicket(ticket)
                              setSelectedColIndex(colIdx)
                              if (!canExpandCell) return
                              e.stopPropagation()
                              setExpandedCell(prev =>
                                prev?.ticketId === ticket.id && prev?.colLabel === col.label
                                  ? null
                                  : { ticketId: ticket.id, colLabel: col.label },
                              )
                            }}
                            style={{
                              padding: activeTab === 'MY_TICKETS' ? `0 ${cellPadX}px` : `${cellPadY}px ${cellPadX}px`,
                              borderRight: tableColBorder,
                              borderBottom: `1px solid ${tableRowBorder}`,
                              color: textMuted,
                              fontSize: tableFontSize,
                              lineHeight: 1.4,
                              textAlign: columnTextAlign(col, cell),
                              verticalAlign: 'middle',
                              transition: 'background-color 0.15s ease-in-out',
                              backgroundColor: rowBaseBg,
                              height: activeTab === 'MY_TICKETS' ? TABLE_ROW_HEIGHT : undefined,
                              maxHeight: activeTab === 'MY_TICKETS' ? TABLE_ROW_HEIGHT : undefined,
                              ...columnCellStyle(col),
                              boxShadow: isSelected && selectedColIndex === colIdx ? 'inset 0 0 0 2px #10B981' : undefined,
                              ...(col.sticky
                                ? { position: 'sticky' as const, left: col.left, zIndex: isExpandedCell ? 30 : 5 }
                                : { position: 'relative' as const, zIndex: isExpandedCell ? 20 : undefined }),
                            }}>
                            {canExpandCell ? (
                              <div className={`relative w-full h-full flex items-center ${columnTextAlign(col, cell) === 'left' ? 'justify-start' : columnTextAlign(col, cell) === 'right' ? 'justify-end' : 'justify-center'}`} style={{ minHeight: TABLE_ROW_HEIGHT - 2 }}>
                                <div className={`w-full min-w-0 overflow-hidden ${columnTextAlign(col, cell) === 'left' ? 'text-left' : columnTextAlign(col, cell) === 'right' ? 'text-right' : 'text-center'}`}>
                                  {cell.value}
                                </div>
                                {isExpandedCell && (
                                  <div
                                    className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5 z-[70] min-w-[220px] max-w-[380px] rounded-xl shadow-2xl border p-3 text-xs text-center"
                                    style={{ backgroundColor: cardBg, borderColor: border }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {cell.value}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={`w-full min-w-0 overflow-hidden ${columnTextAlign(col, cell) === 'left' ? 'text-left' : columnTextAlign(col, cell) === 'right' ? 'text-right' : 'text-center'}`}>
                                {cell.value}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          </div>

          {/* Mobile Card View */}
          <div className="flex flex-col md:hidden p-3 gap-3 w-full">
             {loading && tickets.length === 0 ? (
                <div className="py-20 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#10B981]" />
                  <p className="text-sm font-semibold" style={{ color: textMuted }}>Loading masterlist...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-20 text-center">
                  <Inbox className="w-12 h-12 opacity-20 mx-auto mb-3" style={{ color: textMuted }} />
                  <p className="text-sm font-bold" style={{ color: textPrimary }}>No new relays</p>
                </div>
              ) : (
                filtered.map((ticket) => {
                  const storeStyle = getDealerStyle(ticket.dealer || ticket.sourceVendor)
                  const branchName = formatBranchTableLabel(ticket.branchId, ticket)
                  const negotiator = resolveRelayNegotiatorName(ticket, employees)
                  const district = (() => {
                    if (ticket.district?.trim()) return ticket.district.trim()
                    const loc = ticket.location || ''
                    const paren = loc.match(/\(([^)]+)\)\s*$/)
                    if (paren?.[1]?.trim()) return paren[1].trim()
                    return guessDistrict(loc) || '—'
                  })()
                  
                  const ticketNo = getTicketNumber(ticket)
                  const cleanTicketNo = ticketNo.replace(/^\d+\.\s*/, '')
                  const relayStatus = getRelayStatusShort(ticket)
                  const statusIsAssigned = relayStatus === 'ASSIGNED'
                  const statusIsScheduled = relayStatus === 'SCHEDULED' || relayStatus === 'INSTALLED'
                  
                  const isHighlighted = ticket.id === lastUpdatedTicketId
                  const isSelected = selectedPreviewTicket?.id === ticket.id || contextMenu?.ticket.id === ticket.id
                  const rowBaseBg = isHighlighted
                    ? (isLight ? '#dcfce7' : 'rgba(22,163,74,0.25)')
                    : isSelected
                      ? (isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.12)')
                      : (isLight ? '#ffffff' : '#060B18')

                  return (
                    <div
                      key={`card-${ticket.id}`}
                      onClick={() => setSelectedPreviewTicket(ticket)}
                      className="w-full rounded-xl p-3 flex flex-col gap-2 shadow-sm border transition-transform active:scale-[0.98] cursor-pointer"
                      style={{
                        backgroundColor: rowBaseBg,
                        borderColor: tableRowBorder,
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-sm truncate mr-2" style={{ color: textPrimary }}>
                          {displayUpper(ticket.customerName || 'Direct Client')}
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0" style={{
                          backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)',
                          color: statusIsAssigned || statusIsScheduled ? '#10B981' : '#F59E0B'
                        }}>
                          {relayStatus}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs" style={{ color: textMuted }}>
                        <div className="flex items-center gap-1.5">
                           <FileText className="w-3 h-3 shrink-0" />
                           <span className="font-semibold truncate" style={{color: textPrimary}}>{displayUpper(cleanTicketNo)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-right justify-end">
                           <span className="truncate">{displayUpper(branchName)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 col-span-2">
                           <span className="truncate">{displayUpper(district)} • {displayUpper(storeStyle.label)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 col-span-2">
                           <span className="font-medium" style={{color: negotiator ? (isLight ? '#0369a1' : '#7dd3fc') : undefined}}>
                             {displayUpper(negotiator || 'Unassigned')}
                           </span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
          </div>
        </div>

        {/* ── Combined Stats Counter & Danger Zone Footer Strip ─────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 flex-wrap shrink-0" style={{ borderTop: `1px solid ${border}` }}>
          {/* Counters */}
          <div className="flex flex-wrap items-center gap-5">
            {[
              { label: 'Unassigned', count: relayTabCounts.UNASSIGNED },
              { label: 'Assigned', count: relayTabCounts.PENDING },
              { label: 'My tickets', count: relayTabCounts.MY_TICKETS },
              { label: 'Total', count: relayTabCounts.ALL_PENDING },
            ].map((stat, idx, arr) => (
              <span key={stat.label} className="flex items-center gap-1.5 text-xs" style={{ color: textMuted }}>
                {stat.label}
                <strong className="font-bold" style={{ color: textPrimary }}>{stat.count}</strong>
                {idx < arr.length - 1 && <span className="ml-3 opacity-30">·</span>}
              </span>
            ))}
          </div>

        </div>
      </div>

      {/* Centered Manage/Edit Ticket Modal */}
      {isActionDrawerOpen && selectedTicket && (
        <RelayEditTicketModal
          surface="relay"
          ticket={selectedTicket}
          ticketNumberLabel={getTicketNumber(selectedTicket)}
          isAdmin={isAdmin}
          isLight={isLight}
          cardBg={cardBg}
          border={border}
          textPrimary={textPrimary}
          textMuted={textMuted}
          inputBg={inputBg}
          inputBorder={inputBorder}
          compactInput={compactInput}
          branches={branches}
          relayCustomStores={relayCustomStores}
          onPersistCustomStores={handlePersistCustomStores}
          dealers={dealers}
          onDealersChanged={fetchDealers}
          parseStoreVendor={parseDealer}
          resolveBranch={resolveBranch}
          negotiatorsForBranch={negotiatorsForBranch}
          mergeCandidates={mergeCandidates}
          mergeTargetId={mergeTargetId}
          merging={merging}
          actionSaving={false}
          onMergeTargetChange={setMergeTargetId}
          onMerge={handleMergeTickets}
          onClose={() => setIsActionDrawerOpen(false)}
          onSave={handleDrawerActionSave}
          getTicketNumber={(t) => getTicketNumber(t as Ticket)}
          parseAcDetails={(t) => parseAcDetails(t as Ticket)}
        />
      )}
      {/* Excel Ticket Picker Modal */}
      {showExcelPicker && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowExcelPicker(false)}
        >
          <div
            className="flex flex-col w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border, maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-wide" style={{ color: textPrimary }}>
                    Excel Import
                  </h2>
                  <p className="text-[11px] font-medium" style={{ color: textMuted }}>
                    {excelFileName} — {excelTickets.length} tickets extracted
                  </p>
                </div>
                <button type="button" onClick={() => setShowExcelPicker(false)} className="p-2 rounded-lg hover:bg-slate-500/10" style={{ color: textMuted }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Bulk defaults — changes apply to all non-overridden tickets */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="min-w-0">
                  <span className="block mb-1 text-[9px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Schedule Date (All)</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      const input = event.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null
                      input?.showPicker?.()
                    }}
                    className="relative flex w-full items-center justify-center rounded-lg border px-2 py-1.5 text-[11px] font-bold"
                    style={{ backgroundColor: excelDate ? (isLight ? '#f0fdf4' : 'rgba(22,163,74,0.08)') : inputBg, borderColor: excelDate ? '#10B981' : inputBorder, color: excelDate ? '#10B981' : textMuted, colorScheme: isLight ? 'light' : 'dark' }}
                  >
                    {excelDate ? new Date(excelDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'SET DATE'}
                    <input
                      type="date"
                      value={excelDate}
                      onChange={event => handleExcelHeaderDateChange(event.target.value)}
                      className="absolute h-0 w-0 pointer-events-none opacity-0"
                    />
                  </button>
                </label>
                <label className="min-w-0">
                  <span className="block mb-1 text-[9px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Branch (All)</span>
                  <select
                    value={excelDefaultBranchId}
                    onChange={event => handleExcelHeaderBranchChange(event.target.value)}
                    className="w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    <option value="">Select branch...</option>
                    {branches.map(branch => <option key={branch.id} value={branch.id}>{formatBranchName(branch.name)}</option>)}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="block mb-1 text-[9px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Negotiator (All)</span>
                  <select
                    value={excelDefaultNegotiator}
                    onChange={event => handleExcelHeaderNegotiatorChange(event.target.value)}
                    className="w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    <option value="">Select negotiator...</option>
                    {negotiatorsForBranch(excelDefaultBranchId || resolveRelayDefaultBranchId()).map(employee => {
                      const branchName = employee.branchId ? formatBranchName(resolveBranch(employee.branchId)?.name || '') : ''
                      const firstName = (employee.name || '').split(' ')[0]
                      return <option key={employee.id} value={employee.id}>{(branchName ? `${firstName} - ${branchName}` : firstName).toUpperCase()}</option>
                    })}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-[9px] font-medium" style={{ color: textMuted }}>
                ↑ Changing these updates all tickets. Override individual tickets below.
                {excelDateOverrides.size + excelBranchOverrides.size + excelNegotiatorOverrides.size > 0 && (
                  <span className="ml-2" style={{ color: '#f59e0b' }}>
                    ({excelDateOverrides.size + excelBranchOverrides.size + excelNegotiatorOverrides.size} individual override{excelDateOverrides.size + excelBranchOverrides.size + excelNegotiatorOverrides.size > 1 ? 's' : ''})
                  </span>
                )}
              </p>
            </div>

            {/* Ticket List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {excelTickets.map((ticket, idx) => {
                const nameKey = (ticket.customerName || '').replace(/\s+/g, ' ').trim().toUpperCase()
                const existingTicket = excelExistingMap.get(nameKey)
                const isExisting = Boolean(existingTicket)
                const hasUnmatchedDealer = Boolean(ticket.dealer && excelUnmatchedDealers.includes(ticket.dealer))

                return (
                <div
                  key={idx}
                  className="w-full overflow-hidden rounded-xl border transition-all hover:border-emerald-500/50"
                  style={{ backgroundColor: inputBg, borderColor: excelSelectMode && excelSelectedIdxs.has(idx) ? '#ef4444' : (isExisting ? (isLight ? '#60a5fa' : '#3b82f6') : inputBorder) }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setExcelContextMenu({ idx, x: e.clientX, y: e.clientY })
                  }}
                >
                  {excelSelectMode && (
                    <label className="flex items-center gap-2 px-3 pt-2 cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={excelSelectedIdxs.has(idx)}
                        onChange={() => {
                          setExcelSelectedIdxs(prev => {
                            const next = new Set(prev)
                            if (next.has(idx)) next.delete(idx)
                            else next.add(idx)
                            return next
                          })
                        }}
                        className="w-4 h-4 rounded accent-red-500"
                      />
                      <span className="text-[10px] font-bold" style={{ color: excelSelectedIdxs.has(idx) ? '#ef4444' : textMuted }}>
                        {excelSelectedIdxs.has(idx) ? 'Selected for removal' : 'Select'}
                      </span>
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePickExcelTicket(ticket, idx)}
                    className="w-full text-left p-3 transition-all hover:bg-emerald-500/5 active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold truncate" style={{ color: textPrimary }}>
                          {idx + 1}. {ticket.customerName}
                        </span>
                        {isExisting ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                            EXISTS — WILL UPDATE
                          </span>
                        ) : (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                            NEW
                          </span>
                        )}
                        {hasUnmatchedDealer && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                            ⚠️ NO DEALER
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{
                        backgroundColor: ticket.serviceType.startsWith('DONE') ? 'rgba(16,185,129,0.1)' : 'rgba(251,191,36,0.1)',
                        color: ticket.serviceType.startsWith('DONE') ? '#10B981' : '#f59e0b',
                      }}>
                        {ticket.serviceType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-medium" style={{ color: textMuted }}>
                      {ticket.address && <span className="truncate max-w-[200px]">{ticket.address}</span>}
                      {ticket.brand && <span>{ticket.brand} {ticket.capacity}</span>}
                      {ticket.dealerBranch && <span style={{ color: hasUnmatchedDealer ? '#ef4444' : textMuted }}>🏢 {ticket.dealerBranch}</span>}
                      {ticket.vehicle && <span>🚗 {ticket.vehicle}{ticket.driver ? ` (${ticket.driver})` : ''}</span>}
                    </div>
                    {ticket.remarks && (
                      <p className="mt-1 text-[10px] font-medium truncate max-w-full" style={{ color: textMuted, opacity: 0.8 }}>
                        💬 {ticket.remarks}
                      </p>
                    )}
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-3 py-2.5 border-t" style={{ borderColor: inputBorder, backgroundColor: isLight ? '#f8fafc' : 'rgba(255,255,255,0.02)' }}>
                    <label className="min-w-0">
                      <span className="block mb-1 text-[9px] font-black uppercase tracking-wider" style={{ color: excelDateOverrides.has(idx) ? '#f59e0b' : textMuted }}>Schedule Date{excelDateOverrides.has(idx) ? ' ✦' : ''}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          const input = event.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null
                          input?.showPicker?.()
                        }}
                        className="relative flex w-full items-center justify-center rounded-lg border px-2 py-1.5 text-[10px] font-bold"
                        style={{ backgroundColor: ticket.scheduleDate ? (isLight ? '#f0fdf4' : 'rgba(22,163,74,0.08)') : inputBg, borderColor: excelDateOverrides.has(idx) ? '#f59e0b' : (ticket.scheduleDate ? '#10B981' : inputBorder), color: ticket.scheduleDate ? '#10B981' : textMuted, colorScheme: isLight ? 'light' : 'dark' }}
                      >
                        {ticket.scheduleDate ? new Date(ticket.scheduleDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() : 'ADD DATE'}
                        <input
                          type="date"
                          value={ticket.scheduleDate}
                          onChange={event => updateExcelTicket(idx, { scheduleDate: event.target.value })}
                          className="absolute h-0 w-0 pointer-events-none opacity-0"
                        />
                      </button>
                    </label>
                    <label className="min-w-0">
                      <span className="block mb-1 text-[9px] font-black uppercase tracking-wider" style={{ color: excelBranchOverrides.has(idx) ? '#f59e0b' : textMuted }}>Branch Zone{excelBranchOverrides.has(idx) ? ' ✦' : ''}</span>
                      <select
                        value={ticket.branchId}
                        onChange={event => updateExcelTicket(idx, { branchId: event.target.value, assignedTo: '' })}
                        className="w-full rounded-lg border px-2 py-1.5 text-[10px] font-bold outline-none"
                        style={{ backgroundColor: inputBg, borderColor: excelBranchOverrides.has(idx) ? '#f59e0b' : inputBorder, color: textPrimary }}
                      >
                        <option value="">Select branch...</option>
                        {branches.map(branch => <option key={branch.id} value={branch.id}>{formatBranchName(branch.name)}</option>)}
                      </select>
                    </label>
                    <label className="min-w-0">
                      <span className="block mb-1 text-[9px] font-black uppercase tracking-wider" style={{ color: excelNegotiatorOverrides.has(idx) ? '#f59e0b' : textMuted }}>Negotiator{excelNegotiatorOverrides.has(idx) ? ' ✦' : ''}</span>
                      <select
                        value={ticket.assignedTo}
                        onChange={event => {
                          const assignedTo = event.target.value
                          const negotiator = negotiatorsForBranch(ticket.branchId || resolveRelayDefaultBranchId()).find(employee => employee.id === assignedTo)
                          updateExcelTicket(idx, {
                            assignedTo,
                            branchId: negotiator?.branchId || ticket.branchId,
                          })
                        }}
                        className="w-full rounded-lg border px-2 py-1.5 text-[10px] font-bold outline-none"
                        style={{ backgroundColor: inputBg, borderColor: excelNegotiatorOverrides.has(idx) ? '#f59e0b' : inputBorder, color: textPrimary }}
                      >
                        <option value="">Select negotiator...</option>
                        {negotiatorsForBranch(ticket.branchId || resolveRelayDefaultBranchId()).map(employee => {
                          const branchName = employee.branchId ? formatBranchName(resolveBranch(employee.branchId)?.name || '') : ''
                          const firstName = (employee.name || '').split(' ')[0]
                          return <option key={employee.id} value={employee.id}>{(branchName ? `${firstName} - ${branchName}` : firstName).toUpperCase()}</option>
                        })}
                      </select>
                    </label>
                  </div>
                </div>
                )
              })}
            </div>

            {/* Right-click context menu */}
            {excelContextMenu && (
              <div
                className="fixed z-[10001]"
                style={{ top: excelContextMenu.y, left: excelContextMenu.x }}
              >
                <div
                  className="rounded-xl border shadow-xl overflow-hidden py-1 min-w-[160px]"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      handlePickExcelTicket(excelTickets[excelContextMenu.idx], excelContextMenu.idx)
                      setExcelContextMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-[11px] font-medium flex items-center gap-2 hover:bg-emerald-500/10 transition-colors"
                    style={{ color: textPrimary }}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-500" /> Edit Ticket
                  </button>
                  {(excelDateOverrides.has(excelContextMenu.idx) || excelBranchOverrides.has(excelContextMenu.idx) || excelNegotiatorOverrides.has(excelContextMenu.idx)) && (
                    <button
                      type="button"
                      onClick={() => {
                        const idx = excelContextMenu.idx
                        setExcelDateOverrides(prev => { const next = new Set(prev); next.delete(idx); return next })
                        setExcelBranchOverrides(prev => { const next = new Set(prev); next.delete(idx); return next })
                        setExcelNegotiatorOverrides(prev => { const next = new Set(prev); next.delete(idx); return next })
                        // Reset ticket to header defaults
                        setExcelTickets(prev => prev.map((t, i) => {
                          if (i !== idx) return t
                          return { ...t, scheduleDate: excelDate, branchId: excelDefaultBranchId, assignedTo: excelDefaultNegotiator }
                        }))
                        setExcelContextMenu(null)
                      }}
                      className="w-full text-left px-4 py-2 text-[11px] font-medium flex items-center gap-2 hover:bg-amber-500/10 transition-colors"
                      style={{ color: '#f59e0b' }}
                    >
                      <X className="w-3.5 h-3.5" /> Reset Overrides
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const removedIdx = excelContextMenu.idx
                      setExcelTickets(prev => prev.filter((_, i) => i !== removedIdx))
                      // Shift override indices after removal
                      const shiftSet = (set: Set<number>) => {
                        const next = new Set<number>()
                        for (const i of set) {
                          if (i < removedIdx) next.add(i)
                          else if (i > removedIdx) next.add(i - 1)
                          // i === removedIdx is dropped
                        }
                        return next
                      }
                      setExcelDateOverrides(prev => shiftSet(prev))
                      setExcelBranchOverrides(prev => shiftSet(prev))
                      setExcelNegotiatorOverrides(prev => shiftSet(prev))
                      setExcelContextMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-[11px] font-medium flex items-center gap-2 hover:bg-red-500/10 transition-colors"
                    style={{ color: '#ef4444' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Ticket
                  </button>
                </div>
              </div>
            )}
            {excelContextMenu && (
              <div className="fixed inset-0 z-[10000]" onClick={() => setExcelContextMenu(null)} />
            )}

            {/* Footer */}
            <div className="px-6 py-3 flex items-center justify-between shrink-0" style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
              <div className="flex items-center gap-2">
                {excelSelectMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (excelSelectedIdxs.size === excelTickets.length) {
                          setExcelSelectedIdxs(new Set())
                        } else {
                          setExcelSelectedIdxs(new Set(excelTickets.map((_, i) => i)))
                        }
                      }}
                      className="px-3 py-1.5 border rounded-lg text-[10px] font-bold"
                      style={{ borderColor: inputBorder, color: textMuted }}
                    >
                      {excelSelectedIdxs.size === excelTickets.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (excelSelectedIdxs.size === 0) return
                        const toRemove = excelSelectedIdxs
                        setExcelTickets(prev => prev.filter((_, i) => !toRemove.has(i)))
                        // Shift override indices
                        const shiftSets = (set: Set<number>) => {
                          const sorted = [...toRemove].sort((a, b) => b - a)
                          let result = new Set(set)
                          for (const removedIdx of sorted) {
                            const next = new Set<number>()
                            for (const i of result) {
                              if (i < removedIdx) next.add(i)
                              else if (i > removedIdx) next.add(i - 1)
                            }
                            result = next
                          }
                          return result
                        }
                        setExcelDateOverrides(prev => shiftSets(prev))
                        setExcelBranchOverrides(prev => shiftSets(prev))
                        setExcelNegotiatorOverrides(prev => shiftSets(prev))
                        setExcelSelectedIdxs(new Set())
                        setExcelSelectMode(false)
                      }}
                      disabled={excelSelectedIdxs.size === 0}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white disabled:opacity-50"
                      style={{ backgroundColor: '#ef4444' }}
                    >
                      Remove {excelSelectedIdxs.size} Selected
                    </button>
                    <button
                      type="button"
                      onClick={() => { setExcelSelectMode(false); setExcelSelectedIdxs(new Set()) }}
                      className="px-3 py-1.5 text-[10px] font-bold"
                      style={{ color: textMuted }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <p className="text-[10px] font-medium" style={{ color: textMuted }}>
                    {excelBulkCreating
                      ? `Creating... ${excelBulkProgress.done}/${excelBulkProgress.total}${excelBulkProgress.errors > 0 ? ` (${excelBulkProgress.errors} errors)` : ''}`
                      : 'Click a ticket to fill form, or create all at once'
                    }
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!excelSelectMode && (
                  <button type="button" onClick={() => setExcelSelectMode(true)} disabled={excelBulkCreating} className="px-3 py-2 border rounded-xl text-[10px] font-bold disabled:opacity-50" style={{ borderColor: inputBorder, color: '#ef4444' }}>
                    <Trash2 className="w-3 h-3 inline mr-1" />Batch
                  </button>
                )}
                <button type="button" onClick={() => setShowExcelPicker(false)} disabled={excelBulkCreating} className="px-4 py-2 border rounded-xl text-xs font-bold disabled:opacity-50" style={{ borderColor: inputBorder, color: textMuted }}>
                  Close
                </button>
                {!excelSelectMode && (
                  <button
                    type="button"
                    onClick={() => handleCreateAllExcelTickets()}
                    disabled={excelBulkCreating || excelTickets.length === 0}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 shadow-md"
                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                  >
                    {excelBulkCreating
                      ? `${excelBulkProgress.done}/${excelBulkProgress.total}...`
                      : `Update ${excelTickets.length} Tickets`
                    }
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Unmatched Branch Popup */}
      {showUnmatchedDealerPopup && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowUnmatchedDealerPopup(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4" style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#fef2f2' : 'rgba(239,68,68,0.05)' }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-black" style={{ color: textPrimary }}>Unmatched Dealers</h3>
              </div>
              <p className="text-[11px] font-medium" style={{ color: textMuted }}>
                {excelUnmatchedDealers.length} dealer{excelUnmatchedDealers.length > 1 ? 's' : ''} from the Excel file {excelUnmatchedDealers.length > 1 ? 'don\'t' : 'doesn\'t'} exist in the system. Select an existing dealer or add as new.
              </p>
            </div>
            <div className="px-6 py-4 space-y-3 max-h-[400px] overflow-y-auto">
              {excelUnmatchedDealers.map((dealerName, i) => {
                const resolution = unmatchedDealerResolutions.get(dealerName)
                const isResolved = resolution && resolution !== '__ADD_NEW__'
                const isAddNew = resolution === '__ADD_NEW__'
                return (
                  <div key={i} className="rounded-xl border overflow-hidden" style={{ borderColor: isResolved ? '#10B981' : (isAddNew ? '#f59e0b' : 'rgba(239,68,68,0.5)'), backgroundColor: isLight ? (isResolved ? '#f0fdf4' : '#fef2f2') : (isResolved ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)') }}>
                    <div className="px-3 py-2 flex items-center gap-2">
                      <span className="text-[11px]">{isResolved ? '✅' : (isAddNew ? '➕' : '⚠️')}</span>
                      <span className="text-[11px] font-black flex-1 truncate" style={{ color: isResolved ? '#10B981' : (isAddNew ? '#f59e0b' : '#ef4444') }}>{dealerName}</span>
                    </div>
                    <div className="px-3 pb-2.5">
                      <UnmatchedDealerDropdown
                        dealerName={dealerName}
                        dealers={dealers}
                        value={resolution || ''}
                        onChange={(val) => {
                          setUnmatchedDealerResolutions(prev => {
                            const next = new Map(prev)
                            next.set(dealerName, val)
                            return next
                          })
                        }}
                        isLight={isLight}
                        inputBg={inputBg}
                        inputBorder={inputBorder}
                        textPrimary={textPrimary}
                        textMuted={textMuted}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-6 py-4 flex flex-col gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button
                type="button"
                onClick={handleResolveUnmatchedDealers}
                disabled={addingDealers}
                className="w-full px-4 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 shadow-md"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                {addingDealers ? 'Applying...' : 'Apply & Continue'}
              </button>
              <button
                type="button"
                onClick={handleSkipUnmatchedDealers}
                disabled={addingDealers}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-50"
                style={{ borderColor: inputBorder, color: textMuted }}
              >
                Skip — Create Tickets Anyway
              </button>
              <button
                type="button"
                onClick={() => setShowUnmatchedDealerPopup(false)}
                disabled={addingDealers}
                className="w-full px-4 py-1.5 text-[10px] font-medium disabled:opacity-50"
                style={{ color: textMuted }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Negotiator Required Warning */}
      {showExcelNegotiatorWarning && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowExcelNegotiatorWarning(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-black mb-2" style={{ color: textPrimary }}>Negotiator Required</h3>
              <p className="text-[12px] font-medium mb-1" style={{ color: textMuted }}>
                {excelTickets.filter(t => !t.assignedTo).length} ticket{excelTickets.filter(t => !t.assignedTo).length > 1 ? 's' : ''} {excelTickets.filter(t => !t.assignedTo).length > 1 ? 'don\'t' : 'doesn\'t'} have a negotiator assigned.
              </p>
              <p className="text-[11px] font-medium" style={{ color: textMuted }}>
                Please assign a negotiator to all tickets before importing.
              </p>
            </div>
            <div className="px-6 pb-5">
              <button
                type="button"
                onClick={() => setShowExcelNegotiatorWarning(false)}
                className="w-full px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
              >
                Go Back & Assign Negotiators
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Create All Tickets */}
      {showExcelConfirmCreate && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowExcelConfirmCreate(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-base font-black mb-2" style={{ color: textPrimary }}>Confirm Import</h3>
              <p className="text-[12px] font-medium" style={{ color: textMuted }}>
                Import {excelTickets.length} ticket{excelTickets.length > 1 ? 's' : ''} from the Excel file?
              </p>
              <p className="text-[11px] font-medium mt-1" style={{ color: textMuted }}>
                {(() => {
                  const newCount = excelTickets.filter(t => !excelExistingMap.has((t.customerName || '').trim().toUpperCase())).length
                  const syncCount = excelTickets.length - newCount
                  if (syncCount > 0) return `${newCount} new ticket${newCount !== 1 ? 's' : ''} will be created, ${syncCount} existing will be updated.`
                  return 'All tickets will be created as new.'
                })()}
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowExcelConfirmCreate(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold border"
                style={{ borderColor: inputBorder, color: textMuted }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeExcelBulkCreate}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                Yes, Import All
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Import Result Modal */}
      {excelResultModal && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border }}
          >
            <div className="px-6 py-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: excelResultModal.errors > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)' }}>
                {excelResultModal.errors > 0
                  ? <AlertTriangle className="w-6 h-6 text-red-500" />
                  : <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                }
              </div>
              <h3 className="text-base font-black mb-2" style={{ color: textPrimary }}>
                {excelResultModal.errors > 0 ? 'Import Completed with Errors' : 'Import Successful!'}
              </h3>
              <div className="space-y-1">
                {excelResultModal.created > 0 && (
                  <p className="text-[12px] font-bold" style={{ color: '#10B981' }}>
                    {excelResultModal.created} ticket{excelResultModal.created > 1 ? 's' : ''} created
                  </p>
                )}
                {excelResultModal.updated > 0 && (
                  <p className="text-[12px] font-bold" style={{ color: '#3b82f6' }}>
                    {excelResultModal.updated} ticket{excelResultModal.updated > 1 ? 's' : ''} updated
                  </p>
                )}
                {excelResultModal.errors > 0 && (
                  <p className="text-[12px] font-bold" style={{ color: '#ef4444' }}>
                    {excelResultModal.errors} failed
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 pb-5">
              <button
                type="button"
                onClick={() => { setExcelResultModal(null); window.location.reload() }}
                className="w-full px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Centered Create Ticket Modal */}
      {isAddModalOpen && ReactDOM.createPortal((() => {

        const fieldStyle = (value?: string) => ({
          backgroundColor: isFieldExtracted(value) ? (isLight ? 'rgba(16,185,129,0.04)' : 'rgba(16,185,129,0.08)') : inputBg,
          borderColor: isFieldExtracted(value) ? '#10B981' : inputBorder,
          color: textPrimary,
          fontFamily: 'inherit',
          textTransform: 'none' as const,
        })
        const addInput = 'w-full border rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 normal-case'

        return (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="flex flex-col w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border, maxHeight: '94vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
              {/* Top row: title + close */}
              <div className="px-6 sm:px-8 pt-6 pb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black leading-none uppercase tracking-wide" style={{ color: textPrimary }}>CREATE TICKET</h2>
                </div>
                <button type="button" onClick={() => setIsAddModalOpen(false)}
                  className="p-2 rounded-xl transition-all hover:bg-slate-500/10 shrink-0"
                  style={{ color: textMuted }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>



            {addForm.images && (
              <div className="mx-6 sm:mx-8 mt-4 rounded-xl border px-4 py-3 flex items-center justify-between gap-3"
                style={{ borderColor: 'rgba(16,185,129,0.3)', backgroundColor: isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.1)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-semibold truncate" style={{ color: textPrimary }}>AI extracted fields applied</span>
                </div>
                <a href={addForm.images.startsWith('http') ? addForm.images : `${API_BASE_URL.replace('/api', '')}${addForm.images}`}
                  target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold shrink-0"
                  style={{ borderColor: inputBorder, color: textMuted }}>
                  View voucher
                </a>
              </div>
            )}
            
            <form onSubmit={handleFormCreateTicket} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-6">

                <div className="flex flex-col gap-5 pb-6 border-b" style={{ borderColor: border }}>
                  <div className="flex flex-col gap-5">
                    {(() => {
                      const renderStatusButton = (st: { value: string, label: string }) => {
                         const isSelected = addForm.status === st.value
                         return (
                           <button
                             key={st.value}
                             type="button"
                             onClick={() => {
                               if (!isSelected) {
                                 if (window.confirm(`Are you sure you want to set the status to ${st.label}?`)) {
                                   setAddForm(prev => ({
                                     ...prev,
                                     status: st.value,
                                     serviceType: st.value,
                                     ticketCategory: resolveScheduleStatusFields(st.value).ticketCategory || 'INSTALLATION'
                                   }))
                                 }
                               }
                             }}
                             className="flex items-center justify-center py-3 px-2 rounded-xl border font-black text-[11px] uppercase tracking-wide transition-all duration-150 select-none cursor-pointer"
                             style={isSelected ? {
                               backgroundColor: '#10B981',
                               borderColor: '#10B981',
                               color: 'white',
                               boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
                             } : {
                               backgroundColor: isLight ? '#f8fafc' : 'rgba(255,255,255,0.02)',
                               borderColor: border,
                               color: textMuted
                             }}
                           >
                             {st.label}
                           </button>
                         )
                      }
                      
                      return (
                        <>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: textMuted }}>Pending</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {[
                                { value: 'S/I', label: 'SURVEY & INSTALL' },
                                { value: 'INSTALL', label: 'INSTALL' },
                                { value: 'SURVEY', label: 'SURVEY' },
                                { value: 'CLEANING', label: 'CLEANING' },
                                { value: 'CHECKUP', label: 'CHECKUP' },
                                { value: 'BACKJOB', label: 'BACKJOB' },
                                { value: 'SERVICE', label: 'SERVICE' },
                                { value: 'MOUNTING', label: 'MOUNTING' },
                                { value: 'RESCHED', label: 'RESCHED' },
                                { value: 'CONTINUATION', label: 'CONTINUATION' },
                                { value: 'FOR APPROVAL', label: 'FOR QUOTATION' },
                                { value: 'SYSTEM_REPROCESS', label: 'SYSTEM REPROCESS' },
                                { value: 'DISMANTLE', label: 'DISMANTLE' },
                              ].map(renderStatusButton)}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: textMuted }}>Closing</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {[
                                { value: 'DONE_INSTALLED', label: 'DONE INSTALL' },
                                { value: 'DONE_CLEANING', label: 'DONE CLEANING' },
                                { value: 'DONE_SURVEY', label: 'DONE SURVEY' },
                                { value: 'DONE_CHECKUP', label: 'DONE CHECKUP' },
                                { value: 'DONE_BACKJOB', label: 'DONE BACKJOB' },
                                { value: 'DONE_SERVICE', label: 'DONE SERVICE' },
                                { value: 'DONE_MOUNTING', label: 'DONE MOUNTING' },
                                { value: 'DONE_SYSTEM_REPROCESS', label: 'DONE SYSTEM REPROCESS' },
                                { value: 'DONE_DISMANTLE', label: 'DONE DISMANTLE' },
                                { value: 'DONE_QUOTATION', label: 'DONE QUOTATION' },
                                { value: 'CANCELLED', label: 'CANCELLED' },
                              ].map(renderStatusButton)}
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* 1. Dealer & Transaction */}
                <section>
                  <RelayFormSectionHead step={1} icon={<Store className="w-3.5 h-3.5" />} title="Dealer" subtitle="Where the relay came from" />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    <RelayFormField label="Dealer" compact className="md:col-span-4">
                      <DealerSelect
                        value={addForm.dealer}
                        dealers={dealers}
                        onChange={(name) => setAddForm(prev => ({ ...prev, dealer: name }))}
                        onDealersChanged={fetchDealers}
                        isLight={isLight}
                        inputBg={inputBg}
                        inputBorder={inputBorder}
                        textPrimary={textPrimary}
                        textMuted={textMuted}
                      />
                    </RelayFormField>
                    <RelayFormField label="Dealer Branch" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.dealerBranch}
                        onChange={e => setAddForm(prev => ({ ...prev, dealerBranch: e.target.value.toUpperCase() }))}
                        placeholder="Branch"
                        className={`${addInput} uppercase`}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, textTransform: 'uppercase' }}
                      />
                    </RelayFormField>
                    <RelayFormField label="Diser" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.diser}
                        onChange={e => setAddForm(prev => ({ ...prev, diser: e.target.value }))}
                        placeholder="Dealer's sales rep name"
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      />
                    </RelayFormField>
                    {ROBINSON_APPLIANCES_RE.test(addForm.dealer || '') && (
                      <RelayFormField label="Transaction ID" compact className="md:col-span-4">
                        <input type="text" value={addForm.controlNumber} onChange={e => setAddForm(prev => ({ ...prev, controlNumber: e.target.value }))} placeholder="Robinsons Transaction ID" className={addInput} style={fieldStyle(addForm.controlNumber)} />
                      </RelayFormField>
                    )}
                  </div>
                </section>

                {/* 2. Customer details */}
                <section>
                  <RelayFormSectionHead step={2} icon={<UserRound className="w-3.5 h-3.5" />} title="Customer Details" subtitle="Who and where to deliver service" />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    <RelayFormField label="Customer Name" required compact className="md:col-span-5">
                      <input type="text" required value={addForm.customerName} onChange={e => setAddForm(prev => ({ ...prev, customerName: e.target.value }))} placeholder="Full name" className={addInput} style={fieldStyle(addForm.customerName)} />
                    </RelayFormField>
                    {addFormSyncTarget && (
                      <div className="md:col-span-12 border rounded-xl px-3.5 py-3 flex flex-col gap-1"
                        style={{ backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.08)', borderColor: isLight ? '#a7f3d0' : 'rgba(16,185,129,0.25)' }}>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Will sync to existing ticket {getTicketNumber(addFormSyncTarget as Ticket)}
                        </span>
                        <p className="text-[11px] font-semibold" style={{ color: textMuted }}>
                          A scheduled ticket already exists for this customer
                          {parseAcDetails(addFormSyncTarget as Ticket).scheduledDate
                            ? ` (${parseAcDetails(addFormSyncTarget as Ticket).scheduledDate})`
                            : (addFormSyncTarget as Ticket).preferredDate
                              ? ` (${String((addFormSyncTarget as Ticket).preferredDate).slice(0, 10)})`
                              : ''}.
                          Relay details will be merged into that ticket number.
                        </p>
                      </div>
                    )}
                    {addFormDuplicate && !addFormSyncTarget && (
                      <div className="md:col-span-12 border rounded-xl px-3.5 py-3 flex flex-col gap-1"
                        style={{ backgroundColor: isLight ? '#fffbeb' : 'rgba(251,191,36,0.06)', borderColor: isLight ? '#fde68a' : 'rgba(251,191,36,0.2)' }}>
                        <span className="text-xs font-bold text-amber-600 dark:amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Duplicate customer on Relays
                        </span>
                        <p className="text-[11px] font-semibold" style={{ color: textMuted }}>
                          Ticket {getTicketNumber(addFormDuplicate)} already exists for this customer
                          {parseAcDetails(addFormDuplicate).finalDate ? ` (scheduled ${parseAcDetails(addFormDuplicate).finalDate})` : ''}.
                          Creating a new ticket is blocked — open or merge the existing row.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddModalOpen(false)
                            openDrawer(addFormDuplicate)
                          }}
                          className="self-start text-[11px] font-bold text-emerald-600 hover:text-emerald-500 underline"
                        >
                          Open existing ticket {getTicketNumber(addFormDuplicate)}
                        </button>
                      </div>
                    )}
                    <RelayFormField label="Contact Number" compact className="md:col-span-7">
                      <div className="flex flex-col gap-2">
                        {addPhoneNumbers.map((phone, pIdx) => (
                          <div key={pIdx} className="flex gap-2 items-center">
                            <input
                              type="tel"
                              inputMode="tel"
                              value={phone}
                              onChange={e => {
                                const formatted = formatPhilippinePhoneInput(e.target.value)
                                setAddPhoneNumbers(prev => {
                                  const next = [...prev]
                                  next[pIdx] = formatted
                                  return next
                                })
                              }}
                              onPaste={e => {
                                const pasted = e.clipboardData.getData('text')
                                const numbers = extractPhoneNumbers(pasted)
                                if (numbers.length < 2) return
                                e.preventDefault()
                                setAddPhoneNumbers(prev => {
                                  const next = [...prev]
                                  next[pIdx] = formatPhilippinePhoneInput(numbers[0])
                                  next.splice(pIdx + 1, 0, ...numbers.slice(1).map(formatPhilippinePhoneInput))
                                  return next
                                })
                              }}
                              placeholder="0917 869 4260"
                              className={`${addInput} font-mono tracking-wide`}
                              style={fieldStyle(phone)}
                            />
                            {pIdx === 0 ? (
                              <button
                                type="button"
                                onClick={() => setAddPhoneNumbers(prev => [...prev, ''])}
                                className="px-3 py-2 rounded-lg text-xs font-bold text-white shrink-0"
                                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                              >
                                Add
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setAddPhoneNumbers(prev => prev.filter((_, idx) => idx !== pIdx))}
                                className="px-3 py-2 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 shrink-0"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </RelayFormField>
                    <RelayFormField label="Address" required compact className="md:col-span-8">
                      <textarea
                        required
                        value={addForm.locationRaw}
                        onChange={e => {
                          const val = e.target.value
                          setAddForm(prev => {
                            const guessed = guessDistrict(val)
                            return { ...prev, locationRaw: val, district: guessed || prev.district }
                          })
                        }}
                        placeholder="Complete installation address"
                        rows={2}
                        className={`${addInput} resize-none`}
                        style={fieldStyle(addForm.locationRaw)}
                      />
                    </RelayFormField>
                    <RelayFormField label="District" compact className="md:col-span-2">
                      <input type="text" value={addForm.district} onChange={e => setAddForm(prev => ({ ...prev, district: e.target.value }))} placeholder="Area" className={addInput} style={fieldStyle(addForm.district)} />
                    </RelayFormField>
                    <RelayFormField label="Landmark" compact className="md:col-span-2">
                      <input type="text" value={addForm.landmarks} onChange={e => setAddForm(prev => ({ ...prev, landmarks: e.target.value }))} placeholder="Nearest landmark" className={addInput} style={fieldStyle(addForm.landmarks)} />
                    </RelayFormField>
                  </div>
                </section>

                {/* 3. Aircon / unit details */}
                <section>
                  <RelayFormSectionHead step={3} icon={<Wind className="w-3.5 h-3.5" />} title="Aircon Details" subtitle="Unit being serviced or installed" />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    <RelayFormField label="Brand" compact className="md:col-span-3">
                      <input type="text" value={addForm.brand} onChange={e => setAddForm(prev => ({ ...prev, brand: e.target.value }))} placeholder="Brand" className={addInput} style={fieldStyle(addForm.brand)} />
                    </RelayFormField>
                    <RelayFormField label="Capacity" compact className="md:col-span-2">
                      <input type="text" value={addForm.capacity} onChange={e => setAddForm(prev => ({ ...prev, capacity: e.target.value }))} placeholder="1.5 HP" className={addInput} style={fieldStyle(addForm.capacity)} />
                    </RelayFormField>
                    <RelayFormField label="SKU" compact className="md:col-span-3">
                      <input type="text" value={addForm.sku} onChange={e => setAddForm(prev => ({ ...prev, sku: e.target.value }))} placeholder="SKU" className={addInput} style={fieldStyle(addForm.sku)} />
                    </RelayFormField>
                    <RelayFormField label="Serial No." compact className="md:col-span-4">
                      <input type="text" value={addForm.serialNumber} onChange={e => setAddForm(prev => ({ ...prev, serialNumber: e.target.value }))} placeholder="Serial" className={addInput} style={fieldStyle(addForm.serialNumber)} />
                    </RelayFormField>
                    <RelayFormField label="Commit / Promo" compact className="md:col-span-12">
                      <input type="text" value={addForm.commitType} onChange={e => setAddForm(prev => ({ ...prev, commitType: e.target.value }))} placeholder="Promo terms" className={addInput} style={fieldStyle(addForm.commitType)} />
                    </RelayFormField>
                  </div>
                </section>

                {/* 4. Ashcol branch & assignment */}
                <section>
                  <RelayFormSectionHead step={4} icon={<Users className="w-3.5 h-3.5" />} title="Branch & Assignment" subtitle="Which Ashcol branch & negotiator owns this" />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    <RelayFormField label="Branch Zone" compact className="md:col-span-5">
                      <select
                        value={addForm.branchId}
                        onChange={e => setAddForm(prev => ({ ...prev, branchId: e.target.value, assignedTo: '' }))}
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      >
                        <option value="">Select branch...</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>)}
                      </select>
                    </RelayFormField>
                    <RelayFormField label="Negotiator" required compact className="md:col-span-7">
                      <select
                        required
                        value={addForm.assignedTo || ''}
                        onChange={e => {
                          const val = e.target.value
                          const foundEmp = addModalNegotiators.find(emp => emp.id === val)
                          setAddForm(prev => ({
                            ...prev,
                            assignedTo: val,
                            // Installer is field crew, assigned later on Schedules — never the
                            // negotiator/office-staff account picked here. Leave it untouched
                            // (empty until someone explicitly sets it) so it doesn't overlap with
                            // the negotiator's own name.
                            branchId: (foundEmp && foundEmp.branchId) ? foundEmp.branchId : prev.branchId,
                            // Only promote PENDING to ASSIGNED — don't clobber a status/service-type already
                            // chosen via the status buttons above (SURVEY, INSTALL, CONTINUATION, etc).
                            status: (val && prev.status === 'PENDING') ? 'ASSIGNED' : prev.status,
                          }))
                        }}
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      >
                        <option value="">Select negotiator...</option>
                        {addModalNegotiators.map(emp => {
                          const branchRaw = emp.branchId ? (resolveBranch(emp.branchId)?.name || '') : ''
                          const branchName = formatBranchName(branchRaw)
                          const firstName = (emp.name || '').split(' ')[0]
                          const nameWithBranch = branchName ? `${firstName} - ${branchName}` : firstName
                          return (
                            <option key={emp.id} value={emp.id}>{nameWithBranch.toUpperCase()}</option>
                          )
                        })}
                      </select>
                    </RelayFormField>
                  </div>
                </section>

                {/* 5. Remarks */}
                <section>
                  <RelayFormSectionHead step={5} icon={<MessageSquare className="w-3.5 h-3.5" />} title="Remarks" subtitle="Notes or special instructions" />
                  <div className="grid grid-cols-1 gap-3.5">
                    <RelayFormField label="Remarks" compact>
                      <textarea
                        value={addForm.description}
                        onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value, remarksUpdate: e.target.value }))}
                        placeholder="Notes or special instructions"
                        rows={3}
                        className={`${addInput} resize-none`}
                        style={fieldStyle(addForm.description)}
                      />
                    </RelayFormField>
                  </div>
                </section>

                {/* 6. Scheduling */}
                <section>
                  <RelayFormSectionHead
                    step={6}
                    icon={<CalendarDays className="w-3.5 h-3.5" />}
                    title="Scheduling"
                    subtitle="Requested, schedule & installed date details"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    {/* Requested Date */}
                    <RelayFormField label="Requested Date" compact className="md:col-span-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                          if (input && input.showPicker) input.showPicker();
                        }}
                        className={`${addInput} font-bold text-center relative flex flex-col items-center justify-center`}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
                      >
                        {addForm.preferredDate ? new Date(addForm.preferredDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : 'ADD DATE'}
                        <input type="date" value={addForm.preferredDate} onChange={e => setAddForm(prev => ({ ...prev, preferredDate: e.target.value }))} className="absolute opacity-0 pointer-events-none w-0 h-0" style={{ pointerEvents: 'none' }} />
                      </button>
                    </RelayFormField>
                    {/* Schedule Date */}
                    <RelayFormField label="Schedule Date" compact className="md:col-span-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                          if (input && input.showPicker) input.showPicker();
                        }}
                        className={`${addInput} font-bold text-center relative flex flex-col items-center justify-center`}
                        style={{
                          backgroundColor: addForm.finalDate ? (isLight ? '#f0fdf4' : 'rgba(22,163,74,0.08)') : inputBg,
                          borderColor: addForm.finalDate ? (isLight ? '#86efac' : 'rgba(22,163,74,0.4)') : inputBorder,
                          color: addForm.finalDate ? '#10B981' : textPrimary,
                          colorScheme: isLight ? 'light' : 'dark',
                          fontWeight: addForm.finalDate ? 700 : undefined,
                        }}
                      >
                        {addForm.finalDate ? new Date(addForm.finalDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : 'ADD DATE'}
                        <input
                          type="date"
                          value={addForm.finalDate}
                          onChange={e => setAddForm(prev => ({ ...prev, finalDate: e.target.value }))}
                          className="absolute opacity-0 pointer-events-none w-0 h-0"
                          style={{ pointerEvents: 'none' }}
                        />
                      </button>
                    </RelayFormField>
                    {/* Installed Date */}
                    <RelayFormField label="Installed Date" compact className="md:col-span-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                          if (input && input.showPicker) input.showPicker();
                        }}
                        className={`${addInput} font-bold text-center relative flex flex-col items-center justify-center`}
                        style={{
                          backgroundColor: addForm.installedDate ? (isLight ? '#eff6ff' : 'rgba(59,130,246,0.08)') : inputBg,
                          borderColor: addForm.installedDate ? (isLight ? '#93c5fd' : 'rgba(59,130,246,0.4)') : inputBorder,
                          color: addForm.installedDate ? '#3B82F6' : textPrimary,
                          colorScheme: isLight ? 'light' : 'dark',
                          fontWeight: addForm.installedDate ? 700 : undefined,
                        }}
                      >
                        {addForm.installedDate ? new Date(addForm.installedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : 'ADD DATE'}
                        <input
                          type="date"
                          value={addForm.installedDate}
                          onChange={e => setAddForm(prev => ({ ...prev, installedDate: e.target.value }))}
                          className="absolute opacity-0 pointer-events-none w-0 h-0"
                          style={{ pointerEvents: 'none' }}
                        />
                      </button>
                    </RelayFormField>
                  </div>
                </section>

                {/* 7. Dispatch — optional, can also be set later on Schedules */}
                <section>
                  <RelayFormSectionHead step={7} icon={<Truck className="w-3.5 h-3.5" />} title="Dispatch" subtitle="Optional — driver, vehicle & installer, if already known" />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    <RelayFormField label="Driver" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.driverName || ''}
                        list="add-ticket-driver-roster"
                        placeholder={addModalRoster.drivers.length ? 'Select or type driver…' : 'Driver name'}
                        onChange={e => setAddForm(prev => ({ ...prev, driverName: e.target.value }))}
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      />
                      <datalist id="add-ticket-driver-roster">
                        {addModalRoster.drivers.map(name => <option key={name} value={name} />)}
                      </datalist>
                    </RelayFormField>
                    <RelayFormField label="Vehicle" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.serviceVehicle || ''}
                        placeholder="e.g. T2"
                        onChange={e => setAddForm(prev => ({ ...prev, serviceVehicle: e.target.value }))}
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      />
                    </RelayFormField>
                    <RelayFormField label="Installer / Technician" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.installerName || ''}
                        list="add-ticket-installer-roster"
                        placeholder={addModalRoster.installers.length ? 'Select or type installer…' : 'Installer name'}
                        onChange={e => setAddForm(prev => ({ ...prev, installerName: e.target.value }))}
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      />
                      <datalist id="add-ticket-installer-roster">
                        {addModalRoster.installers.map(name => <option key={name} value={name} />)}
                      </datalist>
                    </RelayFormField>
                  </div>
                </section>

                {/* 8. Payment — optional, if already collected at intake */}
                <section>
                  <RelayFormSectionHead step={8} icon={<Wallet className="w-3.5 h-3.5" />} title="Payment" subtitle="Optional — if collected already at intake" />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    <RelayFormField label="Mode of Payment" compact className="md:col-span-6">
                      <select
                        value={addForm.modeOfPayment || 'NO_PAYMENT'}
                        onChange={e => {
                          const v = e.target.value
                          setAddForm(prev => ({
                            ...prev,
                            modeOfPayment: v,
                            installationCharges: (v === 'NO_PAYMENT' || v === 'FREE' || v === 'FREE INSTALL') ? 0 : prev.installationCharges,
                          }))
                        }}
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      >
                        <option value="NO_PAYMENT">NO PAYMENT</option>
                        <option value="CASH">CASH</option>
                        <option value="BANK TRANSFER">BANK TRANSFER</option>
                        <option value="GCASH">GCASH</option>
                        <option value="CHEQUE">CHEQUE</option>
                        <option value="FOR COLLECTION">FOR COLLECTION</option>
                        <option value="FREE INSTALL">FREE INSTALL</option>
                      </select>
                    </RelayFormField>
                    <RelayFormField label="Payment Amount (₱)" compact className="md:col-span-6">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={addForm.modeOfPayment === 'NO_PAYMENT' || !addForm.modeOfPayment ? '' : (addForm.installationCharges ?? '')}
                        disabled={!addForm.modeOfPayment || addForm.modeOfPayment === 'NO_PAYMENT' || addForm.modeOfPayment === 'FREE' || addForm.modeOfPayment === 'FREE INSTALL'}
                        onChange={e => setAddForm(prev => ({ ...prev, installationCharges: e.target.value ? Number(e.target.value) : 0 }))}
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      />
                    </RelayFormField>
                  </div>
                </section>

                {/* 7. Payment Details */}
                <section>
                  <RelayFormSectionHead step={7} icon={<CreditCard className="w-3.5 h-3.5" />} title="Payment Details" subtitle="Mode of payment and amount" />
                  <div className="space-y-2">
                    {addPayments.map((payment, pIdx) => (
                      <div key={`pay-${pIdx}`} className="grid grid-cols-12 gap-2 items-end">
                        <RelayFormField label={pIdx === 0 ? 'Mode of Payment' : ''} compact className="col-span-5">
                          <select
                            value={payment.mode}
                            onChange={e => { const next = [...addPayments]; next[pIdx] = { ...next[pIdx], mode: e.target.value }; setAddPayments(next); setAddForm(prev => ({ ...prev, modeOfPayment: next.map(p => p.mode).filter(Boolean).join(' / ') })) }}
                            className={addInput}
                            style={fieldStyle(payment.mode)}
                          >
                            <option value="">Select...</option>
                            <option value="CASH">CASH</option>
                            <option value="GCASH">GCASH</option>
                            <option value="BANK TRANSFER">BANK TRANSFER</option>
                            <option value="CHEQUE">CHEQUE</option>
                            <option value="FOR COLLECTION">FOR COLLECTION</option>
                            <option value="NO_PAYMENT">NO PAYMENT / FREE</option>
                          </select>
                        </RelayFormField>
                        <RelayFormField label={pIdx === 0 ? 'Amount (₱)' : ''} compact className="col-span-4">
                          <input
                            type="number"
                            value={payment.amount || ''}
                            onChange={e => { const next = [...addPayments]; next[pIdx] = { ...next[pIdx], amount: Number(e.target.value) || 0 }; setAddPayments(next); setAddForm(prev => ({ ...prev, installationCharges: next.reduce((sum, p) => sum + p.amount, 0) })) }}
                            placeholder="0"
                            className={addInput}
                            style={fieldStyle(payment.amount ? String(payment.amount) : '')}
                          />
                        </RelayFormField>
                        <div className="col-span-3 flex gap-1 pb-[2px]">
                          {pIdx === addPayments.length - 1 && (
                            <button type="button" onClick={() => { setAddPayments(prev => [...prev, { mode: '', amount: 0 }]); setAddForm(prev => ({ ...prev, modeOfPayment: 'HYBRID' })) }} className="px-2.5 py-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 font-bold text-xs">+</button>
                          )}
                          {addPayments.length > 1 && (
                            <button type="button" onClick={() => { const next = addPayments.filter((_, i) => i !== pIdx); setAddPayments(next); setAddForm(prev => ({ ...prev, modeOfPayment: next.map(p => p.mode).filter(Boolean).join(' / '), installationCharges: next.reduce((sum, p) => sum + p.amount, 0) })) }} className="px-2.5 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 font-bold text-xs">−</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {addPayments.length > 1 && (
                      <p className="text-[10px] font-bold mt-1" style={{ color: '#10B981' }}>
                        Total: ₱{addPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                      </p>
                    )}
                  </div>
                </section>

                {/* 8. Dispatch */}
                <section>
                  <RelayFormSectionHead step={8} icon={<Truck className="w-3.5 h-3.5" />} title="Dispatch" subtitle="Vehicle, driver & installer assignment" />
                  <div className="grid grid-cols-12 gap-3.5">
                    <RelayFormField label="Vehicle" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.serviceVehicle}
                        onChange={e => setAddForm(prev => ({ ...prev, serviceVehicle: e.target.value }))}
                        placeholder="e.g. FB19, T2, T3"
                        className={addInput}
                        style={fieldStyle(addForm.serviceVehicle)}
                      />
                    </RelayFormField>
                    <RelayFormField label="Driver" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.driverName}
                        onChange={e => setAddForm(prev => ({ ...prev, driverName: e.target.value }))}
                        placeholder="Driver name"
                        className={addInput}
                        style={fieldStyle(addForm.driverName)}
                      />
                    </RelayFormField>
                    <RelayFormField label="Installer / Technician" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.installerName}
                        onChange={e => setAddForm(prev => ({ ...prev, installerName: e.target.value }))}
                        placeholder="Installer name"
                        className={addInput}
                        style={fieldStyle(addForm.installerName)}
                      />
                    </RelayFormField>
                  </div>
                </section>
              </div>

              {/* Footer */}
              <div className="shrink-0 px-5 sm:px-7 py-3.5 flex items-center justify-between border-t" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
                <p className="text-[11px] font-medium hidden sm:block" style={{ color: textMuted }}>
                  Required: customer name, address, negotiator
                </p>
                <div className="flex items-center gap-3 ml-auto">
                  {openedFromExcel && (
                    <button type="button" onClick={() => {
                      // Save current form edits back to the excelTickets array
                      if (excelEditingIndex !== null) {
                        const form = addForm as any
                        setExcelTickets(prev => prev.map((t, i) => {
                          if (i !== excelEditingIndex) return t
                          return {
                            ...t,
                            customerName: form.customerName,
                            contactPhone: addPhoneNumbers.filter(Boolean).join(' / '),
                            address: form.locationRaw,
                            district: form.district,
                            brand: form.brand,
                            capacity: form.capacity,
                            commitType: form.commitType,
                            installer: form.installerName,
                            vehicle: form.serviceVehicle,
                            driver: form.driverName,
                            remarks: form.description || form.remarksUpdate,
                            serviceType: form.serviceType,
                            modeOfPayment: addPayments.map(p => p.mode).filter(Boolean).join(' / ') || form.modeOfPayment,
                            installationCharges: addPayments.reduce((sum, p) => sum + p.amount, 0) || form.installationCharges,
                            payments: addPayments.filter(p => p.mode || p.amount > 0),
                            scheduleDate: form.finalDate,
                            branchId: form.branchId,
                            assignedTo: form.assignedTo,
                            dealer: form.dealer,
                            dealerBranch: form.dealerBranch,
                          }
                        }))
                      }
                      setIsAddModalOpen(false)
                      setShowExcelPicker(true)
                    }} className="px-5 py-2.5 border rounded-xl text-sm font-bold transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30" style={{ borderColor: inputBorder, color: '#10B981' }}>
                      ← Save & Back to Excel
                    </button>
                  )}
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-5 py-2.5 border rounded-xl text-sm font-bold transition-all hover:bg-slate-500/10" style={{ borderColor: inputBorder, color: textMuted }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={!!addFormDuplicate && !addFormSyncTarget} className="px-7 py-2.5 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-md" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                    {addFormSyncTarget ? `Sync to ${getTicketNumber(addFormSyncTarget)}` : addFormDuplicate ? 'Duplicate Blocked' : 'Create Ticket'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
        )
      })(), document.body)}

      {/* Settings Modal */}
      {isSettingsModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsSettingsModalOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border, maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: border }}>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-500" />
                <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>Masterlist Settings</h3>
              </div>
              <button onClick={() => setIsSettingsModalOpen(false)} style={{ color: textMuted }} className="hover:opacity-85">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#090f1b' }}>
              <button
                type="button"
                className="px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all"
                style={{
                  borderColor: '#10B981',
                  color: '#10B981',
                }}
              >
                Dealers / Store Vendors
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Add New Dealer */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Add New Custom Dealer</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. S&R, ANSON'S"
                    value={settingsNewDealerName}
                    onChange={e => setSettingsNewDealerName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSettingsAddDealer()
                      }
                    }}
                    className="flex-1 border rounded-xl px-3 py-2.5 text-xs outline-none uppercase"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, textTransform: 'uppercase' }}
                  />
                  <button
                    type="button"
                    onClick={handleSettingsAddDealer}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shrink-0"
                  >
                    Add Dealer
                  </button>
                </div>
              </div>

              {/* List of Dealers */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Manage Active Dealers</label>
                  <span className="text-[10px] font-bold" style={{ color: textMuted }}>{dealers.length} Total</span>
                </div>
                
                <div className="border rounded-xl divide-y overflow-hidden" style={{ borderColor: border }}>
                  {/* Custom Dealers */}
                  {dealers.map((dealer, index) => {
                    const store = dealer.name
                    const isEditing = settingsEditingDealerIndex === index
                    return (
                      <div key={dealer.id} className="flex justify-between items-center p-3 text-xs font-semibold">
                        {isEditing ? (
                          <div className="flex gap-2 flex-1 mr-4">
                            <input
                              type="text"
                              value={settingsEditDealerName}
                              onChange={e => setSettingsEditDealerName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleSettingsSaveRename(index)
                                }
                              }}
                              className="flex-1 border rounded-lg px-2 py-1.5 text-xs outline-none uppercase"
                              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, textTransform: 'uppercase' }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSettingsSaveRename(index)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setSettingsEditingDealerIndex(null)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border"
                              style={{ borderColor: inputBorder, color: textPrimary }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span style={{ color: textPrimary, textTransform: 'uppercase' }}>{store}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSettingsEditingDealerIndex(index)
                                  setSettingsEditDealerName(store)
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-500/15"
                                style={{ color: textMuted }}
                                title="Rename"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSettingsDeleteDealer(dealer.id, store)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}


      {/* ── Excel Sheet Preview Modal ────────────────────────── */}
      {isExcelModalOpen && (() => {
        const allSelected = selectedPreviewIds.size === excelPreview.length && excelPreview.length > 0
        const someSelected = selectedPreviewIds.size > 0

        const toggleSelectAll = () => {
          if (allSelected) {
            setSelectedPreviewIds(new Set())
          } else {
            setSelectedPreviewIds(new Set(excelPreview.map(x => x.id)))
          }
        }

        const toggleSelectOne = (id: string) => {
          setSelectedPreviewIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
          })
        }

        const deleteSelected = () => {
          setExcelPreview(prev => prev.filter(x => !selectedPreviewIds.has(x.id)))
          setSelectedPreviewIds(new Set())
        }

        return (
          <div className="fixed inset-0 z-50 flex flex-col"
            style={{ backgroundColor: pageBg, overflow: 'hidden' }}>
            <div className="w-full h-full flex flex-col overflow-hidden animate-fade-in"
              style={{
                backgroundColor: pageBg,
              }}>

              {/* Header */}
              <div className="shrink-0" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
                <div className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.12)' }}>
                      <FileSpreadsheet className="w-4 h-4" style={{ color: '#3B82F6' }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-sm leading-tight" style={{ color: textPrimary }}>Spreadsheet Ingestion Preview</h3>
                      <p className="text-[10px] mt-0.5 leading-tight" style={{ color: textMuted }}>
                        <span className="font-bold" style={{ color: textPrimary }}>{excelPreview.length}</span> records
                        &nbsp;·&nbsp;{excelPreview.filter(x => x.serviceType === 'S/I').length} S/I
                        &nbsp;·&nbsp;{excelPreview.filter(x => x.serviceType === 'SURVEY').length} Survey
                      </p>
                    </div>
                  </div>

                  {/* Controls row */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {/* Select all toggle */}
                    <button type="button" onClick={toggleSelectAll}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all"
                      style={{ backgroundColor: allSelected ? 'rgba(59,130,246,0.1)' : inputBg, borderColor: allSelected ? '#3B82F6' : inputBorder, color: allSelected ? '#3B82F6' : textMuted }}>
                      {allSelected
                        ? <CheckSquare className="w-3.5 h-3.5" />
                        : <Square className="w-3.5 h-3.5" />}
                      <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                    </button>

                    {/* Bulk delete — only when selection active */}
                    {someSelected && (
                      <button type="button" onClick={deleteSelected}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all"
                        style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete {selectedPreviewIds.size} Selected
                      </button>
                    )}

                    {/* View toggle — Grid ↔ Row/List */}
                    <div className="flex items-center rounded-lg overflow-hidden border" style={{ borderColor: inputBorder }}>
                      <button type="button" onClick={() => setPreviewView('grid')}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold transition-all"
                        style={{ backgroundColor: previewView === 'grid' ? '#3B82F6' : inputBg, color: previewView === 'grid' ? '#fff' : textMuted }}
                        title="Card grid view">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Grid</span>
                      </button>
                      <button type="button" onClick={() => setPreviewView('list')}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold transition-all"
                        style={{ backgroundColor: previewView === 'list' ? '#3B82F6' : inputBg, color: previewView === 'list' ? '#fff' : textMuted }}
                        title="Compact row view">
                        <List className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Rows</span>
                      </button>
                    </div>

                    <button type="button" onClick={() => { setExcelPreview([]); setIsExcelModalOpen(false); setImportTargetBranchId(''); setSelectedPreviewIds(new Set()) }}
                      className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" style={{ color: textMuted }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-auto" style={{ minHeight: 0, padding: '24px' }}>
                {excelPreview.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-sm font-black" style={{ color: textMuted }}>No parsed records remaining</p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>Close this modal and upload another sheet if needed.</p>
                  </div>
                ) : previewView === 'grid' ? (
                  /* ── GRID / CARD VIEW ─────────────────────────────── */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
                    {excelPreview.map((item) => {
                      const isSelected = selectedPreviewIds.has(item.id)
                      return (
                        <div key={item.id}
                          className="relative rounded-2xl flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                          style={{
                            backgroundColor: cardBg,
                            border: `1.5px solid ${isSelected ? '#3B82F6' : border}`,
                            boxShadow: isSelected ? '0 0 0 3px rgba(59,130,246,0.15)' : undefined,
                            padding: '14px',
                          }}>

                          {/* Card header: select checkbox + tags + delete */}
                          <div className="flex items-center gap-2 mb-3">
                            <button type="button" onClick={() => toggleSelectOne(item.id)}
                              className="shrink-0 transition-colors"
                              style={{ color: isSelected ? '#3B82F6' : textMuted }}>
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>

                            <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                              {item.priorityTag ? (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  item.priorityTag.toUpperCase().includes('MORNING') ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                                  item.priorityTag.toUpperCase().includes('OLD') ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                                  'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                }`}>{item.priorityTag}</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-500/10 text-slate-500 border border-slate-500/20">Standard</span>
                              )}
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                item.serviceType === 'S/I' || item.serviceType === 'SURVEY & INSTALL' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                item.serviceType === 'SURVEY' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                                'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                              }`}>{item.serviceType}</span>
                            </div>

                            <button type="button" onClick={() => { setExcelPreview(prev => prev.filter(x => x.id !== item.id)); setSelectedPreviewIds(prev => { const n = new Set(prev); n.delete(item.id); return n }) }}
                              className="shrink-0 p-1 rounded-lg transition-all hover:text-rose-500 hover:bg-rose-500/10" style={{ color: textMuted }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Client */}
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-500 font-extrabold text-xs">
                              {item.customerName ? item.customerName.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-extrabold text-xs truncate" style={{ color: textPrimary }} title={item.customerName}>{item.customerName}</div>
                              {item.contactPhone && (
                                <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold">
                                  <Phone className="w-2.5 h-2.5" />
                                  <FormatPhone raw={item.contactPhone} />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Meta grid */}
                          <div className="grid grid-cols-2 gap-1.5 text-[10px] mb-3 p-2 rounded-xl" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
                            <div><span className="block text-[8px] uppercase font-black" style={{ color: textMuted }}>AC / Unit</span>
                              <span className="font-bold block truncate" style={{ color: textPrimary }}>{item.unitType || 'Split AC'}</span></div>
                            <div><span className="block text-[8px] uppercase font-black" style={{ color: textMuted }}>Vendor</span>
                              <span className="font-bold block truncate" style={{ color: textPrimary }}>{item.dealer || 'Direct'}</span></div>
                            <div><span className="block text-[8px] uppercase font-black" style={{ color: textMuted }}>Control #</span>
                              <span className="font-mono font-bold block truncate" style={{ color: textPrimary }}>{item.controlNumber || '—'}</span></div>
                            <div><span className="block text-[8px] uppercase font-black" style={{ color: textMuted }}>Charge</span>
                              <span className="font-bold block truncate" style={{ color: textPrimary }}>{item.installationCharges ? `₱${item.installationCharges.toLocaleString()}` : 'Free'}</span></div>
                          </div>

                          {/* Address */}
                          <div className="flex items-start gap-1.5 mb-3">
                            <MapPin className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              {item.district && <span className="inline-block px-1.5 bg-blue-500/10 text-blue-500 rounded text-[8px] font-black uppercase mr-1 mb-0.5">{item.district}</span>}
                              <span className="text-[10px] leading-relaxed block" style={{ color: textMuted }}>{item.location || '—'}</span>
                            </div>
                          </div>

                          {/* Remarks */}
                          <div className="rounded-lg p-2 text-[9px] italic" style={{ backgroundColor: inputBg, color: textMuted }}>
                            <span className="font-black uppercase text-[8px] not-italic block mb-0.5">Remarks</span>
                            <span className="line-clamp-2">{item.remarksUpdate || item.description || '—'}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* ── LIST / ROW VIEW ─────────────────────────────── */
                  <div className="flex flex-col gap-1.5">
                    {excelPreview.map((item) => {
                      const isSelected = selectedPreviewIds.has(item.id)
                      return (
                        <div key={item.id}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                          style={{
                            backgroundColor: isSelected ? (isLight ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.1)') : inputBg,
                            border: `1.5px solid ${isSelected ? '#3B82F6' : border}`,
                          }}>

                          {/* Checkbox */}
                          <button type="button" onClick={() => toggleSelectOne(item.id)}
                            className="shrink-0" style={{ color: isSelected ? '#3B82F6' : textMuted }}>
                            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>

                          {/* Avatar */}
                          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-500 font-extrabold text-[11px]">
                            {item.customerName ? item.customerName.charAt(0).toUpperCase() : 'U'}
                          </div>

                          {/* Name & phone */}
                          <div className="flex-1 min-w-0" style={{ minWidth: 120, maxWidth: 160 }}>
                            <div className="font-extrabold text-xs truncate" style={{ color: textPrimary }}>{item.customerName}</div>
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {item.contactPhone && (
                                <div className="text-[10px] text-emerald-500 font-bold flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5" /><FormatPhone raw={item.contactPhone} />
                                </div>
                              )}
                              {item.controlNumber && (
                                <span className="text-[9px] font-black font-mono text-slate-400 dark:text-slate-500 block truncate">
                                  {item.controlNumber}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Tags */}
                          <div className="flex gap-1 shrink-0 flex-wrap" style={{ minWidth: 90 }}>
                            {item.priorityTag
                              ? <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                  item.priorityTag.toUpperCase().includes('MORNING') ? 'bg-rose-500/10 text-rose-500' :
                                  item.priorityTag.toUpperCase().includes('OLD') ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
                                }`}>{item.priorityTag}</span>
                              : null
                            }
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                              item.serviceType === 'S/I' || item.serviceType === 'SURVEY & INSTALL' ? 'bg-emerald-500/10 text-emerald-500' :
                              item.serviceType === 'SURVEY' ? 'bg-purple-500/10 text-purple-500' : 'bg-slate-500/10 text-slate-400'
                            }`}>{item.serviceType}</span>
                          </div>

                          {/* Unit type */}
                          <div className="shrink-0 text-[10px] font-semibold" style={{ color: textMuted, minWidth: 80, maxWidth: 100 }}>
                            <div className="truncate">{item.unitType || '—'}</div>
                            <div className="text-[9px] truncate">{item.dealer || '—'}</div>
                          </div>

                          {/* Address */}
                          <div className="flex-1 min-w-0 hidden sm:block">
                            {item.district && <span className="px-1 bg-blue-500/10 text-blue-500 rounded text-[8px] font-black uppercase mr-1">{item.district}</span>}
                            <span className="text-[10px] truncate block" style={{ color: textMuted }}>{item.location || '—'}</span>
                          </div>

                          {/* Control # */}
                          <div className="shrink-0 font-mono text-[10px] font-bold hidden md:block" style={{ color: textMuted, minWidth: 70 }}>{item.controlNumber || '—'}</div>

                          {/* Remarks */}
                          <div className="flex-1 min-w-0 hidden lg:block">
                            <span className="text-[10px] line-clamp-1" style={{ color: textMuted }}>{item.remarksUpdate || item.description || '—'}</span>
                          </div>

                          {/* Delete */}
                          <button type="button"
                            onClick={() => { setExcelPreview(prev => prev.filter(x => x.id !== item.id)); setSelectedPreviewIds(prev => { const n = new Set(prev); n.delete(item.id); return n }) }}
                            className="shrink-0 p-1 rounded-lg transition-all hover:text-rose-500 hover:bg-rose-500/10" style={{ color: textMuted }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 flex items-center justify-between gap-3 flex-wrap px-6 py-4"
                style={{ borderTop: `1px solid ${border}`, backgroundColor: cardBg }}>
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#3B82F6' }} />
                  <select value={importTargetBranchId} onChange={e => setImportTargetBranchId(e.target.value)}
                    className="rounded-xl px-3 py-2 text-xs font-bold outline-none border"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, minWidth: 170 }}>
                    <option value="">Assign to Branch...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {someSelected && (
                    <span className="text-[10px] font-black" style={{ color: textMuted }}>
                      {selectedPreviewIds.size} of {excelPreview.length} selected
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setExcelPreview([]); setIsExcelModalOpen(false); setImportTargetBranchId(''); setSelectedPreviewIds(new Set()) }}
                    className="px-4 py-2 border rounded-xl text-xs font-bold transition-all hover:opacity-80"
                    style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleBulkUploadSubmit}
                    disabled={bulkUploading || !importTargetBranchId}
                    className="px-5 py-2 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-md"
                    style={{ background: bulkUploading || !importTargetBranchId ? undefined : 'linear-gradient(135deg, #3B82F6, #6366F1)', backgroundColor: bulkUploading || !importTargetBranchId ? '#475569' : undefined }}>
                    {bulkUploading ? 'Uploading...' : `Import ${excelPreview.length} Records`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}



      {/* ── Read-only Service Job Sheet Modal ──────────────────── */}
      {isViewModalOpen && selectedPreviewTicket && ReactDOM.createPortal((() => {
        const t   = selectedPreviewTicket
        const det = previewDetails
        const sl  = getRelayStatusLabel(t)
        const neg = resolveRelayNegotiatorName(t, employees)
        const negotiatorId = resolveNegotiatorUserId(t)
        const negotiatorPhone = resolveEmployeePhone(employees, negotiatorId)
        const referralFee = t.storeReferralFee ?? t.store_referral_fee
        const promodiserName = det.promodiserName || '—'
        const bn  = formatAssignedBranchLabel(t.branchId)
        const storeInfo = parseDealer(t.dealer || t.sourceVendor)

        const DField = ({ label, value, green, className = "" }: { label: string; value: React.ReactNode; green?: boolean; className?: string }) => (
          <div className={`flex flex-col gap-0.5 py-2 px-3 rounded-lg ${className}`} style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
            <span className={`text-xs font-semibold break-words leading-snug ${green ? 'text-emerald-500' : ''}`}
              style={green ? undefined : { color: textPrimary }}>
              {value || '—'}
            </span>
          </div>
        )

        const SHead = ({ title }: { title: string }) => (
          <div className="pt-2 pb-1 border-b pb-2 mb-3" style={{ borderColor: border }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">{title}</p>
          </div>
        )

        const formatDate = (dateStr: string | null | undefined) => {
          if (!dateStr) return '—';
          try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });
          } catch (e) { return '—'; }
        };

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-[3px]"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => { setIsViewModalOpen(false); setShowHistoryPanel(false); }}>

            {/* Modal Box */}
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
                        {t.customerName || 'Direct Client'}
                      </h2>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{
                        backgroundColor: (sl === 'Assigned' || sl === 'Scheduled' || sl === 'Installed' || sl === 'In Progress' || sl === 'On the Way' || !!t.assignedTo)
                          ? 'rgba(16,185,129,0.12)'
                          : 'rgba(245,158,11,0.12)',
                        color: (sl === 'Assigned' || sl === 'Scheduled' || sl === 'Installed' || sl === 'In Progress' || sl === 'On the Way' || !!t.assignedTo)
                          ? '#10B981'
                          : '#F59E0B'
                      }}>
                        {t.assignedTo ? 'Assigned' : sl}
                      </span>
                      {bn !== '—' && bn !== 'UNASSIGNED' && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase" style={{
                          backgroundColor: inputBg,
                          color: textMuted,
                          border: `1px solid ${border}`,
                        }}>
                          {bn}
                        </span>
                      )}
                      <span className="text-sm sm:text-base font-black font-mono tracking-wider uppercase" style={{ color: textPrimary }}>
                        Ticket No: {getTicketNumber(t)}
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setIsViewModalOpen(false)}
                    className="p-1.5 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X className="w-4.5 h-4.5" style={{ color: textMuted }} />
                  </button>
                </div>

                {/* Header Row 2 */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t text-xs w-full" style={{ borderColor: border }}>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Category</span>
                    <span className="font-semibold text-xs text-emerald-500 uppercase">{getTicketCategory(t)}</span>
                  </div>
                  <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Relayed By</span>
                    <span className="font-semibold text-xs" style={{ color: textPrimary }}>
                      {t.createdBy ? <EmployeeNameLink nameOrId={t.createdBy} /> : (t.customerEmail || 'System')}
                    </span>
                  </div>
                  <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Negotiator</span>
                    <span className="font-semibold text-xs" style={{ color: textPrimary }}>{neg}</span>
                  </div>
                  <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Negotiator Number</span>
                    <span className="font-semibold text-xs" style={{ color: textPrimary }}>
                      {negotiatorPhone ? <FormatPhone raw={negotiatorPhone} /> : '—'}
                    </span>
                  </div>
                </div>

              </div>

              {/* Two Column Body */}
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x" style={{ borderColor: border }}>

                {/* Left Column: Details */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                  {/* Grid 1: Client & Location Info */}
                  <div>
                    <SHead title="Client & Location Details" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <DField label="Customer Name" value={t.customerName || 'Direct Client'} />
                      <DField label="Contact Number" value={
                        <div className="flex flex-col gap-0.5">
                          <FormatPhone raw={t.contactPhone} />
                          {det.alternatePhone && det.alternatePhone.split(',').map((p: string) => p.trim()).filter(Boolean).map((p: string, pIdx: number) => (
                            <FormatPhone key={pIdx} raw={p} />
                          ))}
                        </div>
                      } green />
                      {activeTab !== 'MY_TICKETS' && (
                        <DField label="Full Address" value={t.location} className="sm:col-span-2 lg:col-span-3" />
                      )}
                      <DField label="District" value={t.district || guessDistrict(t.location || '')} className={activeTab === 'MY_TICKETS' ? 'sm:col-span-2' : ''} />
                      <DField label="Additional Notes" value={det.landmarks} className="sm:col-span-2" />
                    </div>
                  </div>

                  {/* Grid 2: Job Scheduling Info */}
                  <div>
                    <SHead title="Scheduling Details" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <DField label="Date Relayed" value={formatDate(t.createdAt)} />
                      <DField label="Preferred Schedule" value={formatDate(t.preferredDate)} />
                      <DField label="Final Schedule" value={det.finalDate ? <span className="text-emerald-500 font-bold">{formatDate(det.finalDate)}</span> : '—'} />
                      <DField label="Store" value={storeInfo.store === 'Direct' ? 'Direct Store' : storeInfo.store} />
                      <DField label="Store Branch" value={storeInfo.branch || '—'} />
                      <DField label="Commit Type" value={t.commitType} />
                      <DField label="Brand / HP" value={formatBrandCapacityLabel(det.brand, det.capacity) || '—'} />
                      <DField label="Control No. / SI" value={t.controlNumber || '—'} />
                      {ROBINSON_APPLIANCES_RE.test(storeInfo.store || '') && (
                        <DField label="Transaction ID" value={det.robinsonsTransactionId || '—'} />
                      )}
                    </div>
                  </div>

                  {/* Remarks */}
                  {(t.remarksUpdate || t.description) && (
                    <div>
                      <SHead title="Remarks & Updates" />
                      <p className="text-xs leading-relaxed rounded-xl p-4"
                        style={{ backgroundColor: inputBg, color: textMuted, border: `1px solid ${border}` }}>
                        {t.remarksUpdate || t.description}
                      </p>
                    </div>
                  )}

                  <div>
                    <SHead title="Referral Fee" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                      <DField label="Referral Fee" value={formatMoney(referralFee)} />
                      <DField label="Recipient" value={det.referralFeeRecipient || promodiserName} />
                      <DField label="Amount" value={formatMoney(det.referralFeeAmount || referralFee)} />
                      <DField label="Status" value={det.referralFeeStatus} />
                      <DField label="Date Paid" value={det.referralFeeDatePaid ? formatDate(det.referralFeeDatePaid) : '—'} />
                      <DField label="Reference No" value={det.referralFeeReferenceNo} />
                    </div>
                  </div>

                  <div>
                    <SHead title="Rebates Claim" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      <DField label="For Rebates Claim" value={det.forRebatesClaim || 'YES'} />
                      <DField label="Company" value={det.rebatesCompany} />
                      <DField label="Amount Due" value={formatMoney(det.rebatesAmountDue)} />
                      <DField label="Status" value={det.rebatesStatus} />
                      <DField label="Reference No" value={det.rebatesReferenceNo} />
                    </div>
                  </div>

                  <div>
                    <SHead title="Warranty Registration" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DField label="Warranty Registration Status" value={det.warrantyRegistrationStatus || t.warrantyDocsStatus || (t.warrantyRegistrationCompleted ? 'REGISTERED' : '—')} green />
                      <DField label="Registered By" value={det.warrantyRegisteredBy || t.warrantyRegistrationCompletedBy} />
                    </div>
                  </div>
                </div>

                {/* Right Column: Update History */}
                {showHistoryPanel && (
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
                        const listToRender = buildRelayHistoryTimeline(t, history, employees, formatBranchTableLabel)
                        
                        if (listToRender.length === 0) {
                          return (
                            <div className="text-xs font-semibold py-8" style={{ color: textMuted }}>
                              No update history recorded.
                            </div>
                          )
                        }

                        return listToRender.map((h: any, idx: number) => {
                          const dt = new Date(h.createdAt).toLocaleString('en-PH', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit', hour12: true
                          })
                          const note = String(h.changeNote || '').toLowerCase()
                          const isSubmission = note.includes('submitted') || note.includes('created') || note.includes('excel import')
                          const isAssignment = note.includes('assigned to')
                          const isRemarkEntry = Boolean(h.isRemarkEntry) || (
                            !isSubmission
                            && !isAssignment
                            && !note.includes('status changed')
                            && !note.includes('assignee changed')
                            && !note.includes('details updated')
                            && !note.includes('rescheduled')
                            && !(h.newStatus && h.previousStatus && h.newStatus !== h.previousStatus)
                            && !(h.newPreferredDate && h.previousPreferredDate && h.newPreferredDate !== h.previousPreferredDate)
                          )
                          
                          return (
                            <div key={h.id || idx} className="relative">
                              <span className="absolute -left-[27px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2"
                                    style={{
                                      borderColor: idx === 0 ? '#10B981' : border,
                                      backgroundColor: idx === 0 ? '#10B981' : cardBg
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
                                    {isSubmission ? 'Submitted by: ' : isAssignment ? 'Assigned by: ' : isRemarkEntry ? 'Remark by: ' : 'By: '}
                                    <span className="font-bold" style={{ color: textPrimary }}>
                                      <EmployeeNameLink nameOrId={h.changedByUserName} />
                                    </span>
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

              {/* Footer */}
              <div className="px-6 py-4 flex items-center justify-end gap-3 shrink-0"
                style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
                <button type="button" onClick={() => setShowHistoryPanel(prev => !prev)}
                  className="px-5 py-2 rounded-lg text-xs font-bold border transition-all hover:bg-slate-50 dark:hover:bg-slate-800 mr-auto flex items-center gap-1.5"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>
                  <Clock className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                  {showHistoryPanel ? 'Hide Update History' : 'View Update History'}
                </button>
                {canEdit && (
                  <button type="button" onClick={() => { openDrawer(t); setIsViewModalOpen(false); setSelectedPreviewTicket(null); }}
                    className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all">
                    Edit
                  </button>
                )}
                <button type="button" onClick={() => setIsViewModalOpen(false)}
                  className="px-5 py-2 rounded-lg text-xs font-bold border transition-all hover:bg-slate-50 dark:hover:bg-slate-800"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}
      {/* ── Right-click context menu ─────────────────────────────────── */}
      {contextMenu && (
        <div id="context-menu" className="fixed z-[200]" style={{ top: contextMenu.y, left: contextMenu.x }}
             onClick={e => e.stopPropagation()}>
          <div className="rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-blue-500/10"
                    style={{ color: textPrimary }}
                    onClick={() => { setSelectedPreviewTicket(contextMenu.ticket); setIsViewModalOpen(true); setContextMenu(null) }}>
              <Eye className="w-3.5 h-3.5 text-blue-500" /> View details
            </button>
            {canEdit && (
              <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-[#10B981]/10"
                      style={{ color: textPrimary }}
                      onClick={() => { openDrawer(contextMenu.ticket); setContextMenu(null) }}>
                <Edit3 className="w-3.5 h-3.5 text-[#10B981]" /> Edit ticket
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}


