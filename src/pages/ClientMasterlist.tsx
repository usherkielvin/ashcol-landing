import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
import {
  Search, FileSpreadsheet, AlertTriangle, X, FileText, Loader2,
  Building2, Trash2, MapPin,
  ChevronDown, Plus, CheckCircle2, AlertCircle, Package, FileUp, CalendarDays,
  Eye, Phone, LayoutGrid, List, CheckSquare, Square, Edit3, Clock, Check,
  Store, UserRound, Wind, MessageSquare, Users
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin, branchScopesMatch, filterBranchNegotiators, isNegotiatorCandidate, readApiError, resolvePortalWriteBranchId, fetchTicketsPage, parseCreatedTicketResponse, formatFetchError, EMPLOYEES_DIRECTORY_UPDATED_EVENT, PROFILE_UPDATED_EVENT } from '../utils/api'
import { readTabCache, readTabCacheEntry, relaysCacheKey, writeTabCache, isTabCacheFresh, type RelaysTabCache, clearRelaysCache, clearWarrantyCache, TAB_CACHE_UPDATED, syncTicketAcrossTabCaches } from '../utils/ticketTabCache'
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
import { RelayEditTicketModal } from '../components/relays/RelayEditTicketModal'
import type { RelayEditDraft } from '../components/relays/relayEditForm'
import { resetTicketTableScroll } from '../utils/tabSwitch'
import * as XLSX from 'xlsx'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
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

const BUILT_IN_RELAY_STORES = ['Robinsons', 'Abenson'] as const
const RELAY_CUSTOM_STORES_KEY = 'ashcol-relay-custom-stores'

function readRelayCustomStores(): string[] {
  try {
    const raw = localStorage.getItem(RELAY_CUSTOM_STORES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map((s) => String(s).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function persistRelayCustomStores(stores: string[]) {
  localStorage.setItem(RELAY_CUSTOM_STORES_KEY, JSON.stringify(stores))
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
  sourceVendor?: string
  slaExpirationDate?: string
  priorityTag?: string
  district?: string
  commitType?: string
  installerName?: string
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

interface ParsedVoucher {
  customerName?: string
  contactPhone?: string
  location?: string
  sourceVendor?: string
  unitType?: string
  serviceType?: string
  description?: string
  priorityTag?: string
  district?: string
  commitType?: string
  installerName?: string
  serviceVehicle?: string
  remarksUpdate?: string
  installationCharges?: number
  modeOfPayment?: string
  controlNumber?: string
  landmarks?: string
  brand?: string
  capacity?: string
  sku?: string
  serialNumber?: string
  imagePath?: string
  preferredDate?: string
  relayedDate?: string
  finalDate?: string
}

type StoreCategory = 'Robinsons' | 'Abenson' | 'Direct' | 'Other'

const parseStoreVendor = (sourceVendor?: string): { store: StoreCategory; branch: string; customStore?: string } => {
  const sv = (sourceVendor || '').trim()
  const lower = sv.toLowerCase()
  if (lower.includes('robinsons')) {
    const branch = sv.replace(/^robinsons(\s+b2b)?\s*/i, '').trim()
    return { store: 'Robinsons', branch }
  }
  if (lower.includes('abenson')) {
    const branch = sv.replace(/^abenson(\s+b2b)?\s*/i, '').trim()
    return { store: 'Abenson', branch }
  }
  if (lower === 'direct' || !sv) {
    return { store: 'Direct', branch: '' }
  }
  // It's a custom store! Try to split by ' - ' to separate store name and branch name
  const parts = sv.split(' - ')
  const customStore = parts[0]?.trim() || ''
  const branch = parts.slice(1).join(' - ').trim()
  return { store: 'Other', branch, customStore }
}

const combineStoreVendor = (store: StoreCategory, branch: string, customStore?: string): string => {
  if (store === 'Direct') return 'Direct'
  if (store === 'Other') {
    const s = (customStore || '').trim()
    const b = branch.trim()
    if (!s) return 'Other'
    return b ? `${s} - ${b}` : s
  }
  const b = branch.trim()
  if (!b) return store
  if (b.toLowerCase().startsWith(store.toLowerCase())) return b
  return `${store} ${b}`
}

function resolveRelayStoreForSubmit(sourceVendor: string, storeBranch: string) {
  const vendor = (sourceVendor || 'Direct').trim()
  if ((BUILT_IN_RELAY_STORES as readonly string[]).includes(vendor)) {
    return combineStoreVendor(vendor as StoreCategory, storeBranch)
  }
  return combineStoreVendor('Other', storeBranch, vendor)
}

const guessDistrict = (address: string): string => {
  if (!address) return ''
  const addr = address.toLowerCase()

  // 1. Direct Regex checks for explicit district declarations
  const districtRegexes = [
    /district\s*([0-9]+)/i,
    /dist\.\s*([0-9]+)/i,
    /dist\s*([0-9]+)/i,
    /district\s*([ivxldcm]+)/i,
    /zone\s*([0-9]+)/i,
    /zone\s*([ivxldcm]+)/i
  ]

  for (const regex of districtRegexes) {
    const match = address.match(regex)
    if (match && match[1]) {
      const val = match[1].trim()
      if (/^[0-9]+$/.test(val)) {
        return `District ${val}`
      }
      return `District ${val.toUpperCase()}`
    }
  }

  // 2. Keyword-based matching for Valenzuela City
  if (addr.includes('valenzuela')) {
    const d1Barangays = [
      'arkong bato', 'balangkas', 'bignay', 'bisig', 'canumay east', 'canumay west',
      'coloong', 'dalandanan', 'isla', 'lawang bato', 'lingunan', 'mabolo', 'malanday',
      'malinta', 'palasan', 'pasolo', 'poblacion', 'punturin', 'rincon', 'tagalag',
      'veinte reales', 'wawang pulo'
    ]
    const d2Barangays = [
      'bagbaguin', 'karuhatan', 'gen. t. de leon', 'gtdl', 'mapulang lupa', 'marulas',
      'maysan', 'parada', 'paso de blas', 'ugong'
    ]

    for (const brgy of d1Barangays) {
      if (addr.includes(brgy)) return 'District 1'
    }
    for (const brgy of d2Barangays) {
      if (addr.includes(brgy)) return 'District 2'
    }
    return 'Valenzuela'
  }

  // 3. Keyword-based matching for Bulacan
  if (addr.includes('bulacan')) {
    if (addr.includes('san miguel') || addr.includes('san ildefonso') || addr.includes('san rafael') || addr.includes('dona remedios trinidad') || addr.includes('drt')) {
      return 'District 3'
    }
    if (addr.includes('malolos') || addr.includes('bulakan') || addr.includes('calumpit') || addr.includes('hagonoy') || addr.includes('paombong') || addr.includes('pulilan')) {
      return 'District 1'
    }
    if (addr.includes('baliuag') || addr.includes('bustos') || addr.includes('plaridel')) {
      return 'District 2'
    }
    if (addr.includes('meycauayan') || addr.includes('marilao') || addr.includes('obando')) {
      return 'District 4'
    }
    if (addr.includes('guiguinto') || addr.includes('balagtas') || addr.includes('pandi') || addr.includes('bocaue')) {
      return 'District 5'
    }
    if (addr.includes('san jose del monte') || addr.includes('sjdm')) {
      return 'District 6'
    }
  }

  // 4. Active branch coverage areas town/city matching (Cavite, Laguna, Batangas, Rizal, Quezon, Pampanga, Taguig)
  const towns = [
    // Cavite
    { key: 'dasmarinas', label: 'Dasmarinas' },
    { key: 'dasma', label: 'Dasmarinas' },
    { key: 'silang', label: 'Silang' },
    { key: 'bacoor', label: 'Bacoor' },
    { key: 'imus', label: 'Imus' },
    { key: 'general trias', label: 'General Trias' },
    { key: 'gen. trias', label: 'General Trias' },
    { key: 'gentri', label: 'General Trias' },
    { key: 'tagaytay', label: 'Tagaytay' },
    { key: 'trece martires', label: 'Trece Martires' },
    { key: 'cavite city', label: 'Cavite City' },
    { key: 'kawit', label: 'Kawit' },
    { key: 'noveleta', label: 'Noveleta' },
    { key: 'rosario', label: 'Rosario' },
    { key: 'carmona', label: 'Carmona' },
    { key: 'indang', label: 'Indang' },
    { key: 'naic', label: 'Naic' },
    { key: 'tanza', label: 'Tanza' },
    { key: 'amadeo', label: 'Amadeo' },
    { key: 'alfonso', label: 'Alfonso' },
    
    // Laguna
    { key: 'calauan', label: 'Calauan' },
    { key: 'santa rosa', label: 'Santa Rosa' },
    { key: 'sta. rosa', label: 'Santa Rosa' },
    { key: 'sta rosa', label: 'Santa Rosa' },
    { key: 'cabuyao', label: 'Cabuyao' },
    { key: 'calamba', label: 'Calamba' },
    { key: 'binan', label: 'Binan' },
    { key: 'biñan', label: 'Binan' },
    { key: 'san pedro', label: 'San Pedro' },
    { key: 'santa cruz', label: 'Santa Cruz' },
    { key: 'sta. cruz', label: 'Santa Cruz' },
    { key: 'sta cruz', label: 'Santa Cruz' },
    { key: 'san pablo', label: 'San Pablo' },
    { key: 'siniloan', label: 'Siniloan' },
    { key: 'pangil', label: 'Pangil' },
    { key: 'bay', label: 'Bay' },
    { key: 'los banos', label: 'Los Banos' },
    { key: 'los baños', label: 'Los Banos' },
    { key: 'pagsanjan', label: 'Pagsanjan' },
    { key: 'pila', label: 'Pila' },

    // Batangas
    { key: 'sto. tomas', label: 'Sto. Tomas Batangas' },
    { key: 'sto tomas', label: 'Sto. Tomas Batangas' },
    { key: 'batangas city', label: 'Batangas City' },
    { key: 'lipa', label: 'Lipa' },
    { key: 'tanauan', label: 'Tanauan' },
    { key: 'nasugbu', label: 'Nasugbu' },
    { key: 'calaca', label: 'Calaca' },
    { key: 'lemery', label: 'Lemery' },
    { key: 'bauan', label: 'Bauan' },
    { key: 'balayan', label: 'Balayan' },

    // Rizal
    { key: 'rodriguez', label: 'Rodriguez' },
    { key: 'montalban', label: 'Rodriguez' },
    { key: 'san mateo', label: 'San Mateo' },
    { key: 'antipolo', label: 'Antipolo' },
    { key: 'cainta', label: 'Cainta' },
    { key: 'taytay', label: 'Taytay' },
    { key: 'angono', label: 'Angono' },
    { key: 'binangonan', label: 'Binangonan' },
    { key: 'tayuman', label: 'Binangonan' },
    { key: 'teresa', label: 'Teresa' },
    { key: 'morong', label: 'Morong' },
    { key: 'tanay', label: 'Tanay' },
    { key: 'pililla', label: 'Pililla' },

    // Quezon Province
    { key: 'candelaria', label: 'Candelaria' },
    { key: 'lucena', label: 'Lucena' },
    { key: 'sariaya', label: 'Sariaya' },
    { key: 'tiaong', label: 'Tiaong' },
    { key: 'pagbilao', label: 'Pagbilao' },
    { key: 'tayabas', label: 'Tayabas' },

    // Pampanga
    { key: 'san fernando', label: 'San Fernando' },
    { key: 'angeles', label: 'Angeles' },
    { key: 'mabalacat', label: 'Mabalacat' },
    { key: 'guagua', label: 'Guagua' },
    { key: 'floridablanca', label: 'Floridablanca' },
    { key: 'lubao', label: 'Lubao' },
    { key: 'apalit', label: 'Apalit' },
    { key: 'mexico', label: 'Mexico' },
    { key: 'porac', label: 'Porac' },

    // Taguig / Metro Manila
    { key: 'taguig', label: 'Taguig' },
    { key: 'pateros', label: 'Pateros' },
    { key: 'pasig', label: 'Pasig' },
    { key: 'makati', label: 'Makati' }
  ]

  for (const town of towns) {
    if (addr.includes(town.key)) {
      return town.label
    }
  }

  // General Province Fallbacks
  if (addr.includes('cavite')) return 'Cavite'
  if (addr.includes('laguna')) return 'Laguna'
  if (addr.includes('batangas')) return 'Batangas'
  if (addr.includes('rizal')) return 'Rizal'
  if (addr.includes('quezon')) return 'Quezon'
  if (addr.includes('pampanga')) return 'Pampanga'

  return ''
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
  const byField = (ticket.negotiatorName || '').trim()
  if (byField) return byField
  const uid = resolveNegotiatorUserId(ticket)
  if (uid) {
    const match = employees.find((e) => String(e.id || '') === uid)
    if (match?.name) return String(match.name).trim()
  }
  return (ticket.assignedEmployeeName || '').trim() || '—'
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
  if (getTicketCategory(ticket) === 'Collection' && !isCollectionPaid(ticket)) return 'Pending'
  if (status === 'CANCELLED') return 'Cancelled'
  if (status === 'COMPLETED' || !!(ticket.installationCharges && ticket.installationCharges > 0)) return 'Installed'
  // finalDate / schedule phase = on Schedules tab, not relay assigned queue
  if (finalDate || hasRelayLeftQueue(ticket)) return 'Scheduled'
  // Backend stores the negotiator on negotiatorId and clears assignedTo for relay intake.
  if (
    status === 'ASSIGNED'
    || status === 'SCHEDULED'
    || status === 'RESCHED'
    || ticket.assignedTo
    || negotiatorId
  ) {
    return 'Assigned'
  }
  if (status === 'IN_PROGRESS') return 'In Progress'
  if (status === 'ON_THE_WAY') return 'On the Way'
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
  const vendor = (ticket.sourceVendor || '').trim().toLowerCase()
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
    return Number.isFinite(seq) ? `AS-${String(seq).padStart(2, '0')}` : raw.toUpperCase()
  }
  const ashcol = raw.match(/^AS-0*(\d+)$/i)
  if (ashcol) {
    const seq = parseInt(ashcol[1], 10)
    return Number.isFinite(seq) ? `AS-${String(seq).padStart(2, '0')}` : raw.toUpperCase()
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
  const vendor = (ticket.sourceVendor || '').trim().toLowerCase()
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

export default function ClientMasterlist() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  const canEdit = !!user && role !== 'customer'

  // Colors
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const pageBg = isLight ? '#f1f5f9' : '#060B18'
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
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false)
  const createDropdownRef = useRef<HTMLDivElement>(null)
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
  const [toolbarStoreDraft, setToolbarStoreDraft] = useState('')
  const storeFilterRef = useRef<HTMLDivElement>(null)
  const [isBranchFilterOpen, setIsBranchFilterOpen] = useState(false)
  const branchFilterRef = useRef<HTMLDivElement>(null)

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
      if (createDropdownRef.current && !createDropdownRef.current.contains(event.target as Node)) {
        setIsCreateDropdownOpen(false)
      }
      if (storeFilterRef.current && !storeFilterRef.current.contains(event.target as Node)) {
        setIsStoreFilterOpen(false)
      }
      if (branchFilterRef.current && !branchFilterRef.current.contains(event.target as Node)) {
        setIsBranchFilterOpen(false)
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

  // Scanner State
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const scanFileInputRef = useRef<HTMLInputElement>(null)

  // Excel Bulk Upload State
  const [excelPreview, setExcelPreview] = useState<any[]>([])
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
  const excelFileInputRef = useRef<HTMLInputElement>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [importTargetBranchId, setImportTargetBranchId] = useState('')
  const [previewView, setPreviewView] = useState<'grid' | 'list'>('grid')
  const [selectedPreviewIds, setSelectedPreviewIds] = useState<Set<string>>(new Set())

  // Manual & Scan Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [relayCustomStores, setRelayCustomStores] = useState<string[]>(() => readRelayCustomStores())
  const [addStoreDraft, setAddStoreDraft] = useState('')
  const [showAddStoreField, setShowAddStoreField] = useState(false)
  const [addPhoneNumbers, setAddPhoneNumbers] = useState<string[]>([''])
  const [addForm, setAddForm] = useState({
    title: 'S/I service',
    description: '',
    serviceType: 'S/I',
    customerName: '',
    contactPhone: '',
    locationRaw: '',
    sourceVendor: 'Robinsons',
    otherStoreName: '',
    storeBranch: '',
    unitType: 'Split AC',
    preferredDate: '',
    slaExpirationDate: '',
    priorityTag: '',
    district: '',
    commitType: 'FREE FIRST 10 FEET',
    installerName: '',
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
    finalDate: ''
  })
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
      sourceVendor: resolveRelayStoreForSubmit(addForm.sourceVendor || 'Direct', addForm.storeBranch || ''),
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

  const handleAddStoreFromToolbar = useCallback(() => {
    const name = toolbarStoreDraft.trim()
    if (!name) return
    const isBuiltIn = (BUILT_IN_RELAY_STORES as readonly string[]).some(s => s.toLowerCase() === name.toLowerCase())
    const isCustom = relayCustomStores.some(s => s.toLowerCase() === name.toLowerCase())
    if (isBuiltIn || isCustom) {
      alert('That store is already in the list.')
      return
    }
    const next = [...new Set([...relayCustomStores, name])].sort((a, b) => a.localeCompare(b))
    setRelayCustomStores(next)
    persistRelayCustomStores(next)
    setStoreFilter(name)
    setToolbarStoreDraft('')
    setIsStoreFilterOpen(false)
  }, [toolbarStoreDraft, relayCustomStores])

  const openAddModal = useCallback(() => {
    const defaultBranch = resolveRelayDefaultBranchId()
    setAddPhoneNumbers([''])
    setShowAddStoreField(false)
    setAddStoreDraft('')
    setAddForm(prev => ({
      ...prev,
      branchId: defaultBranch || prev.branchId,
    }))
    setIsAddModalOpen(true)
  }, [resolveRelayDefaultBranchId])

  // Action Drawer / Assign Modal State
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [isActionDrawerOpen, setIsActionDrawerOpen] = useState(false)
  const [actionSaving, setActionSaving] = useState(false)
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
  const cellPadY = 8
  const cellPadX = 10
  const headerPadY = 9
  const tableFontSize = '11px'
  const headerFontSize = '10px'
  const TABLE_ROW_HEIGHT = 38

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
      { label: 'STATUS',           weight: 6,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
      { label: 'CUSTOMER NAME',    weight: 11, expMul: 1.45, sticky: false, freeze: false, center: false, right: false },
      { label: 'DISTRICT',         weight: 9,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'BRAND',            weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'STORE / SOURCE',   weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'COMMIT',           weight: 9,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'PREFERRED DATE',   weight: 8,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
      { label: 'NEGOTIATOR',       weight: 10, expMul: 1.55, sticky: false, freeze: false, center: true, right: false },
      { label: 'FINAL DATE',       weight: 9,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'REMARKS',          weight: 11, expMul: 1.45, sticky: false, freeze: false, center: false, right: true },
    ] : [
      { label: 'TICKET NO',    weight: 7,  expMul: 1.35, sticky: true,  freeze: true,  center: true, right: false },
      { label: 'STATUS',       weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'CATEGORY',     weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'CUSTOMER NAME', weight: 14, expMul: 1.5,  sticky: false, freeze: false, center: false, right: false },
      { label: 'DISTRICT',     weight: 8,  expMul: 1.4,  sticky: false, freeze: false, center: false, right: false },
      { label: 'STORE/SOURCE', weight: 9,  expMul: 1.4,  sticky: false, freeze: false, center: false, right: false },
      { label: 'DATE RELAYED', weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'BRANCH',       weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'COMMIT',       weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: false, right: false },
      { label: 'NEGOTIATOR',   weight: 10, expMul: 1.55, sticky: false, freeze: false, center: true, right: false },
      { label: 'FINAL DATE',   weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'LAST UPDATE',  weight: 14, expMul: 1.55, sticky: false, freeze: false, center: false, right: true },
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
    minWidth: col.label === 'NEGOTIATOR' ? '6.75rem' : col.w,
    maxWidth: col.label === 'NEGOTIATOR' ? '9rem' : col.w,
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

  // File Upload OCR (PDF/Image)
  const handleVoucherScan = async (file: File) => {
    setScanning(true)
    setScanError('')
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_BASE_URL}/v1/tickets/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })

      if (!res.ok) {
        throw new Error(`Voucher scanning failed (${res.status})`)
      }

      const parsed: ParsedVoucher = await res.json()
      if (parsed.customerName) {
        const locationVal = parsed.location || (parsed as any).address || ''
        const customerNameVal = parsed.customerName || (parsed as any).name || ''
        const contactPhoneVal = parsed.contactPhone || (parsed as any).phone || (parsed as any).mobile || (parsed as any).contact || ''
        const brandVal = parsed.brand || ''
        const capacityVal = parsed.capacity || ''
        const skuVal = parsed.sku || (parsed as any).stock || (parsed as any).model || ''
        const serialNumberVal = parsed.serialNumber || (parsed as any).serial || ''

        const preferredDateRaw = parsed.preferredDate || (parsed as any).preferred_date || ''
        let preferredDateFormatted = ''
        if (preferredDateRaw) {
          try {
            const d = new Date(preferredDateRaw)
            if (!isNaN(d.getTime())) {
              preferredDateFormatted = d.toISOString().split('T')[0]
            } else {
              preferredDateFormatted = preferredDateRaw
            }
          } catch (e) {}
        }

        const rawSvc = parsed.serviceType || 'S/I'
        let mappedSvc = rawSvc
        const isInstall = rawSvc.toLowerCase().includes('install') || rawSvc.toUpperCase() === 'S/I'
        const isSurvey = rawSvc.toLowerCase().includes('survey') || rawSvc.toUpperCase() === 'SURVEY'
        if (isInstall) {
          mappedSvc = 'S/I'
        } else if (isSurvey) {
          mappedSvc = 'SURVEY'
        }

        const defaultCommit = isInstall ? 'FREE FIRST 10 FEET' : (parsed.commitType || '')
        const defaultRelayedDate = parsed.relayedDate || new Date().toISOString().split('T')[0]
        const parsedStore = parseStoreVendor(parsed.sourceVendor || 'Robinsons')
        const scannedStoreVendor = parsedStore.store === 'Other' && parsedStore.customStore
          ? parsedStore.customStore
          : parsedStore.store
        if (parsedStore.store === 'Other' && parsedStore.customStore) {
          setRelayCustomStores(prev => {
            const name = parsedStore.customStore!.trim()
            if (!name || prev.some(s => s.toLowerCase() === name.toLowerCase())) return prev
            const next = [...prev, name].sort((a, b) => a.localeCompare(b))
            persistRelayCustomStores(next)
            return next
          })
        }

        const scannedPhones = [contactPhoneVal, (parsed as any).alternatePhone || '']
          .flatMap(p => String(p || '').split(','))
          .map(p => p.trim())
          .filter(Boolean)
          .map(formatPhilippinePhoneInput)
        setAddPhoneNumbers(scannedPhones.length ? scannedPhones : [''])

        setAddForm({
          title: `${mappedSvc} service`,
          description: parsed.description || 'Voucher scanned via Gemini AI.',
          serviceType: mappedSvc,
          customerName: customerNameVal,
          contactPhone: '',
          locationRaw: locationVal,
          sourceVendor: scannedStoreVendor,
          otherStoreName: '',
          storeBranch: parsedStore.branch,
          unitType: parsed.unitType || (brandVal && capacityVal ? formatBrandCapacityLabel(brandVal, capacityVal) : 'Split AC'),
          preferredDate: preferredDateFormatted,
          slaExpirationDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
          priorityTag: parsed.priorityTag || '',
          district: parsed.district || guessDistrict(locationVal) || '',
          commitType: defaultCommit,
          installerName: parsed.installerName || '',
          serviceVehicle: parsed.serviceVehicle || '',
          remarksUpdate: parsed.remarksUpdate || '',
          installationCharges: parsed.installationCharges || 0,
          modeOfPayment: parsed.modeOfPayment || '',
          controlNumber: parsed.controlNumber || '',
          ticketNumber: '',
          assignedTo: '',
          landmarks: parsed.landmarks || '',
          brand: brandVal,
          capacity: capacityVal,
          sku: skuVal,
          serialNumber: serialNumberVal,
          alternatePhone: '',
          images: parsed.imagePath || '',
          status: 'PENDING',
          branchId: '',
          relayedDate: defaultRelayedDate,
          finalDate: ''
        })
        setIsAddModalOpen(true)
      } else {
        setScanError('Failed to extract client details. Please try uploading another document or input details manually.')
      }
    } catch (err: any) {
      setScanError(err.message || 'Scanning process failed. Ensure server connectivity.')
    } finally {
      setScanning(false)
      if (scanFileInputRef.current) scanFileInputRef.current.value = ''
    }
  }

  // Excel Bulk parsing
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })

        if (!rawRows || rawRows.length === 0) {
          alert('Excel sheet seems to be empty.')
          return
        }

        // Find header row (the one containing client identifier keywords)
        let headerIdx = 0
        for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
          const row = rawRows[i]
          if (row && row.some(cell => /customer|name|destination|contact|brand|dlr/i.test(String(cell)))) {
            headerIdx = i
            break
          }
        }

        const headers = rawRows[headerIdx].map((h: any) => String(h || '').trim())
        const dataRows = rawRows.slice(headerIdx + 1)

        // Column indices mapping
        const colIndices = {
          priorityTag: 0, // default first column
          customerName: 1,
          location: 2,
          district: 3,
          contactPhone: 4,
          unitType: 5,
          sourceVendor: 6,
          serviceType: 7,
          commitType: 8,
          installerName: 9,
          serviceVehicle: 10,
          remarksUpdate: 11,
          installationCharges: 12,
          modeOfPayment: 13,
          controlNumber: 14
        }

        headers.forEach((header, idx) => {
          const h = header.toLowerCase()
          if (/customer/i.test(h) && /name/i.test(h)) colIndices.customerName = idx
          else if (/destination/i.test(h) || /address/i.test(h)) colIndices.location = idx
          else if (/district/i.test(h)) colIndices.district = idx
          else if (/contact/i.test(h) || /phone/i.test(h) || /mobile/i.test(h)) colIndices.contactPhone = idx
          else if (/brand/i.test(h) || /unit/i.test(h)) colIndices.unitType = idx
          else if (/dlr/i.test(h) || /dealer/i.test(h) || /vendor/i.test(h)) colIndices.sourceVendor = idx
          else if (/status/i.test(h)) colIndices.serviceType = idx
          else if (/commit/i.test(h)) colIndices.commitType = idx
          else if (/installer/i.test(h)) colIndices.installerName = idx
          else if (/service/i.test(h)) colIndices.serviceVehicle = idx
          else if (/update/i.test(h) || /remarks/i.test(h)) colIndices.remarksUpdate = idx
          else if (/charge/i.test(h) || /cost/i.test(h) || /fee/i.test(h) || /installation.*charge/i.test(h)) colIndices.installationCharges = idx
          else if (/payment/i.test(h) || /mode/i.test(h)) colIndices.modeOfPayment = idx
          else if (/control/i.test(h) || /si/i.test(h)) colIndices.controlNumber = idx
          else if (/priority/i.test(h) || /tag/i.test(h)) colIndices.priorityTag = idx
        })

        const getVal = (row: any[], index: number) => {
          if (index < 0 || index >= row.length) return ''
          const val = row[index]
          return val !== undefined && val !== null ? String(val).trim() : ''
        }

        const mapped = dataRows
          .filter(row => row && row.length > 0 && row.some(cell => cell !== null && cell !== ''))
          .map((row, idx) => {
            const chargesStr = getVal(row, colIndices.installationCharges)
            const cleanCharges = chargesStr ? parseFloat(chargesStr.replace(/[^0-9.]/g, '')) || 0 : 0

            const rawSvc = getVal(row, colIndices.serviceType) || 'S/I'
            let mappedSvc = rawSvc
            const isInstall = rawSvc.toLowerCase().includes('install') || rawSvc.toUpperCase() === 'S/I'
            const isSurvey = rawSvc.toLowerCase().includes('survey') || rawSvc.toUpperCase() === 'SURVEY'
            if (isInstall) {
              mappedSvc = 'S/I'
            } else if (isSurvey) {
              mappedSvc = 'SURVEY'
            }
            const rawCommit = getVal(row, colIndices.commitType)
            const defaultCommit = isInstall ? (rawCommit || 'FREE FIRST 10 FEET') : rawCommit

            return {
              id: `excel-${idx}-${Date.now()}`,
              priorityTag: getVal(row, colIndices.priorityTag),
              customerName: getVal(row, colIndices.customerName) || 'Unknown Customer',
              location: getVal(row, colIndices.location).trim() || 'No Address Provided',
              district: getVal(row, colIndices.district) || guessDistrict(getVal(row, colIndices.location)) || '',
              contactPhone: getVal(row, colIndices.contactPhone),
              unitType: getVal(row, colIndices.unitType) || 'Split AC',
              sourceVendor: getVal(row, colIndices.sourceVendor) || 'Direct',
              serviceType: mappedSvc,
              commitType: defaultCommit,
              installerName: getVal(row, colIndices.installerName),
              serviceVehicle: getVal(row, colIndices.serviceVehicle),
              remarksUpdate: getVal(row, colIndices.remarksUpdate),
              installationCharges: cleanCharges,
              modeOfPayment: getVal(row, colIndices.modeOfPayment),
              controlNumber: getVal(row, colIndices.controlNumber),
              description: getVal(row, colIndices.remarksUpdate) || 'Bulk Excel Imported Ticket'
            }
          })

        setExcelPreview(mapped)
        setIsExcelModalOpen(true)
      } catch (err) {
        console.error(err)
        alert('Error parsing Excel file. Ensure it contains correct client fields.')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

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
            sourceVendor: item.sourceVendor,
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
    const acDetailsObj = {
      landmarks: addForm.landmarks || '',
      brand: addForm.brand || '',
      capacity: addForm.capacity || '',
      sku: addForm.sku || '',
      serialNumber: addForm.serialNumber || '',
      alternatePhone: cleanedPhones.slice(1).join(', '),
      relayedDate: addForm.relayedDate || new Date().toISOString().split('T')[0],
      finalDate: '',
    }
    const isCollectionTicket = /collect/i.test(`${addForm.serviceType} ${addForm.title}`)
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
    const createPayload = {
      title: addForm.title,
      description: addForm.description || addForm.remarksUpdate || 'Manual client ticket',
      customerName: addForm.customerName,
      serviceType: addForm.serviceType,
      unitType: createBrandHp || addForm.unitType,
      contactPhone: cleanedPhones[0] || undefined,
      location: addForm.locationRaw?.trim() || 'No Address Provided',
      sourceVendor: resolveRelayStoreForSubmit(addForm.sourceVendor || 'Direct', addForm.storeBranch || ''),
      preferredDate: addForm.preferredDate || undefined,
      slaExpirationDate: addForm.slaExpirationDate ? new Date(addForm.slaExpirationDate).toISOString() : undefined,
      priorityTag: addForm.priorityTag || undefined,
      district: addForm.district || undefined,
      commitType: addForm.commitType || undefined,
      installerName: addForm.installerName || undefined,
      assignedTo: addForm.assignedTo || undefined,
      negotiatorId: addForm.assignedTo || undefined,
      serviceVehicle: addForm.serviceVehicle || undefined,
      remarksUpdate: addForm.remarksUpdate || undefined,
      installationCharges: isCollectionTicket ? (Number(addForm.installationCharges) || 0) : 0,
      modeOfPayment: isCollectionTicket ? (addForm.modeOfPayment || undefined) : undefined,
      controlNumber: addForm.controlNumber || undefined,
      ticketNumber: syncTicketNumber,
      acDetails: JSON.stringify(acDetailsObj),
      images: addForm.images || undefined,
      status: addForm.status,
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
      sourceVendor: createPayload.sourceVendor,
      preferredDate: createPayload.preferredDate,
      priorityTag: createPayload.priorityTag,
      district: createPayload.district,
      commitType: createPayload.commitType,
      installerName: undefined,
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
    setShowAddStoreField(false)
    setAddStoreDraft('')
    setAddPhoneNumbers([''])
    setAddForm({
      title: 'Installation service',
      description: '',
      serviceType: 'Installation',
      customerName: '',
      contactPhone: '',
      locationRaw: '',
      sourceVendor: 'Robinsons',
      otherStoreName: '',
      storeBranch: '',
      unitType: 'Split AC',
      preferredDate: '',
      slaExpirationDate: '',
      priorityTag: '',
      district: '',
      commitType: '',
      installerName: '',
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

    const payload: Record<string, any> = {}
    let branchId = ''
    let assignedTo = ''

    if (finalStatus === 'CANCELLED') {
      payload.branchId = ''
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
      payload.status = finalStatus
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
    payload.installationCharges = Number(draft.installationCharges)
    payload.modeOfPayment = draft.modeOfPayment || null
    payload.controlNumber = draft.controlNumber || null
    const acDetailsObj = {
      landmarks: draft.landmarks || '',
      brand: draft.brand || '',
      capacity: draft.capacity || '',
      sku: draft.sku || '',
      serialNumber: draft.serialNumber || '',
      alternatePhone: draft.phoneNumbers.slice(1).filter(Boolean).join(', '),
      relayedDate: draft.relayedDate || '',
      finalDate: existingDetails.finalDate || '',
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
    payload.sourceVendor = resolveRelayStoreForSubmit(draft.storeVendor, draft.storeBranch) || null
    const brandHpLabel = formatBrandCapacityLabel(draft.brand, draft.capacity)
    payload.unitType = brandHpLabel || draft.unitType || null
    payload.serviceType = draft.serviceType || null

    const optimisticTicket: Ticket = {
      ...selectedTicket,
      status: finalStatus,
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
      sourceVendor: payload.sourceVendor || selectedTicket.sourceVendor,
      unitType: brandHpLabel || draft.unitType || selectedTicket.unitType,
      serviceType: draft.serviceType || selectedTicket.serviceType,
      updatedAt: new Date().toISOString(),
    }

    const original = selectedTicket
    setIsActionDrawerOpen(false)
    setSelectedTicket(null)
    queueRelayPatch(original, payload, optimisticTicket)
  }

  const handleDeleteTicket = (ticketId: string, customerName?: string) => {
    if (!window.confirm(`Are you sure you want to delete the client ticket for "${customerName || 'Direct Client'}"?\n\nThis action cannot be undone.`)) return

    const rollback = tickets.find(t => t.id === ticketId)
      || openFieldTickets.find(t => t.id === ticketId)
      || selectedTicket
    setIsActionDrawerOpen(false)
    setSelectedTicket(null)
    applyRelayTicketLocally(ticketId, null)

    void (async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `Failed to delete ticket (HTTP ${res.status})`)
        }
        clearRelaysCache()
        clearWarrantyCache()
      } catch (err: any) {
        if (rollback) applyRelayTicketLocally(ticketId, rollback)
        alert(err.message || 'Error occurred while deleting ticket.')
      }
    })()
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

  const handleDeleteAllTickets = async () => {
    const count = filtered.length
    if (count === 0) { alert('No client tickets to delete with the current filters.'); return }
    if (!window.confirm(
      `⚠️ DANGER ZONE\n\nYou are about to permanently delete ALL ${count} currently visible client ticket${count !== 1 ? 's' : ''}.\n\nThis action CANNOT be undone. Are you absolutely sure?`
    )) return
    // Second confirmation for safety
    const confirmText = window.prompt(`Type "DELETE ALL" to confirm removing all ${count} tickets permanently:`)
    if (confirmText?.trim() !== 'DELETE ALL') {
      alert('Cancelled — confirmation text did not match.')
      return
    }

    setActionSaving(true)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    let successCount = 0
    let failCount = 0
    for (const ticket of filtered) {
      try {
        const res = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) successCount++
        else failCount++
      } catch {
        failCount++
      }
    }
    setActionSaving(false)
    fetchData({ soft: true })
    alert(`Deleted ${successCount} of ${count} client ticket${count !== 1 ? 's' : ''}.${failCount > 0 ? ` (${failCount} failed)` : ''}`)
  }

  // Open action drawer for a ticket
  const openDrawer = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setMergeTargetId('')
    const parsedStore = parseStoreVendor(ticket.sourceVendor)
    if (parsedStore.store === 'Other' && parsedStore.customStore) {
      setRelayCustomStores(prev => {
        const name = parsedStore.customStore!.trim()
        if (!name || prev.some(s => s.toLowerCase() === name.toLowerCase())) return prev
        const next = [...prev, name].sort((a, b) => a.localeCompare(b))
        persistRelayCustomStores(next)
        return next
      })
    }
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
        const vendorLower = (t.sourceVendor || 'Direct').toLowerCase()
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
      const vendorLower = (t.sourceVendor || 'Direct').toLowerCase()
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
      const vendor = (t.sourceVendor || '').toLowerCase()
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
  const getStoreStyle = (store?: string) => {
    const s = (store || 'Direct').toLowerCase()
    if (s.includes('robinsons')) {
      return { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', label: store || 'Robinsons' }
    } else if (s.includes('abenson')) {
      return { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', label: store || 'Abenson' }
    } else if (s.includes('direct')) {
      return { bg: 'rgba(99,102,241,0.1)', color: '#6366F1', label: 'Direct Client' }
    }
    return { bg: 'rgba(100,116,139,0.1)', color: '#64748B', label: store || 'Other Store' }
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
    const svc = (ticket.serviceType || '').trim().toUpperCase()
    if (/S\/I|\bSI\b|INSTALL/.test(svc)) return 'S/I'
    if (svc.includes('SURVEY')) return 'SURVEY'
    if (svc.includes('INSTALLATION')) return 'INSTALLATION'
    if (svc.includes('SERVICE') || svc.includes('CLEAN')) return 'SERVICE'
    const cat = getTicketCategory(ticket)
    if (cat === 'Survey & Install') return 'S/I'
    if (cat === 'Survey') return 'SURVEY'
    if (cat === 'Service') return 'SERVICE'
    return svc || 'SERVICE'
  }

  const getRelayStatusShort = (ticket: Ticket) => {
    if (hasRelayLeftQueue(ticket)) return 'SCHEDULED'
    const label = getRelayStatusLabel(ticket)
    if (label === 'Pending') return 'PENDING'
    if (label === 'Cancelled') return 'CANCELLED'
    if (label === 'Scheduled') return 'SCHEDULED'
    return 'ASSIGNED'
  }

  const formatBranchTableLabel = (branchId?: string) => {
    const full = formatAssignedBranchLabel(branchId)
    if (full === '—') return '—'
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
        <div className="flex flex-col gap-2 w-full px-3 md:px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
          {/* Enhanced Branch Filter */}
          <div className="relative shrink-0" ref={branchFilterRef}>
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => setIsBranchFilterOpen(prev => !prev)}
              className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold shadow-sm transition-all ${
                isAdmin ? 'hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer' : 'cursor-not-allowed opacity-80'
              }`}
              style={{
                backgroundColor: isAdmin ? inputBg : (isLight ? '#f1f5f9' : '#1e293b'),
                borderColor: inputBorder,
                color: isAdmin ? textPrimary : textMuted
              }}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />
                <span>
                  {branchFilter === 'ALL'
                    ? 'All Branches'
                    : formatBranchName(branches.find(b => b.id === branchFilter)?.name || branchFilter)}
                </span>
              </div>
              {isAdmin && <ChevronDown className="w-3 h-3 opacity-60" style={{ color: textMuted }} />}
            </button>
            
            {isAdmin && isBranchFilterOpen && (
              <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl border shadow-2xl z-[90] p-3 flex flex-col gap-2.5 animate-in fade-in-50 zoom-in-95 duration-150"
                style={{ backgroundColor: cardBg, borderColor: border }}>
                <span className="text-[10px] font-black uppercase tracking-widest px-2" style={{ color: textMuted }}>Select Branch</span>
                <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => { setBranchFilter('ALL'); setIsBranchFilterOpen(false); }}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${branchFilter === 'ALL' ? 'bg-emerald-500/10 text-emerald-500' : 'hover:bg-slate-500/10'}`}
                  >
                    <span>All Branches</span>
                    {branchFilter === 'ALL' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  </button>
                  {branches.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => { setBranchFilter(b.id); setIsBranchFilterOpen(false); }}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${branchFilter === b.id ? 'bg-emerald-500/10 text-emerald-500' : 'hover:bg-slate-500/10'}`}
                    >
                      <span>{formatBranchName(b.name)}</span>
                      {branchFilter === b.id && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Store Filter */}
          <div className="relative shrink-0" ref={storeFilterRef}>
            <button
              type="button"
              onClick={() => setIsStoreFilterOpen(prev => !prev)}
              className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-800"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500 shrink-0" />
                <span>{storeFilter === 'ALL' ? 'All Stores' : storeFilter === 'Direct' ? 'Direct Store' : storeFilter}</span>
              </div>
              <ChevronDown className="w-3 h-3 opacity-60" style={{ color: textMuted }} />
            </button>
            
            {isStoreFilterOpen && (
              <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl border shadow-2xl z-[90] p-3 flex flex-col gap-2.5 animate-in fade-in-50 zoom-in-95 duration-150"
                style={{ backgroundColor: cardBg, borderColor: border }}>
                <span className="text-[10px] font-black uppercase tracking-widest px-2" style={{ color: textMuted }}>Filter by Store</span>
                <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => { setStoreFilter('ALL'); setIsStoreFilterOpen(false); }}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${storeFilter === 'ALL' ? 'bg-blue-500/10 text-blue-500' : 'hover:bg-slate-500/10'}`}
                  >
                    <span>All Stores</span>
                    {storeFilter === 'ALL' && <Check className="w-3.5 h-3.5 text-blue-500" />}
                  </button>
                  {['Robinsons', 'Abenson', 'Direct'].map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => { setStoreFilter(st); setIsStoreFilterOpen(false); }}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${storeFilter === st ? 'bg-blue-500/10 text-blue-500' : 'hover:bg-slate-500/10'}`}
                    >
                      <span>{st === 'Direct' ? 'Direct Store' : st}</span>
                      {storeFilter === st && <Check className="w-3.5 h-3.5 text-blue-500" />}
                    </button>
                  ))}
                  {/* Custom Stores */}
                  {relayCustomStores.map(st => {
                    if (['Robinsons', 'Abenson', 'Direct'].includes(st)) return null
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => { setStoreFilter(st); setIsStoreFilterOpen(false); }}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${storeFilter === st ? 'bg-blue-500/10 text-blue-500' : 'hover:bg-slate-500/10'}`}
                      >
                        <span>{st}</span>
                        {storeFilter === st && <Check className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                    )
                  })}
                </div>
                
                {/* Add Custom Store directly in filter */}
                <div className="border-t pt-2.5" style={{ borderColor: border }}>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 block mb-1.5" style={{ color: textMuted }}>Add New Store</span>
                  <div className="flex gap-1.5 px-1">
                    <input
                      type="text"
                      value={toolbarStoreDraft}
                      onChange={e => setToolbarStoreDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddStoreFromToolbar()
                        }
                      }}
                      placeholder="e.g. S&R, Anson's"
                      className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                    <button
                      type="button"
                      onClick={handleAddStoreFromToolbar}
                      className="px-3 rounded-lg text-xs font-bold text-white shrink-0 hover:opacity-90 transition-all"
                      style={{ background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)' }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Month Filter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold shadow-sm shrink-0"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
            <CalendarDays className="w-4 h-4 shrink-0 text-amber-500" />
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="bg-transparent outline-none cursor-pointer font-bold pr-2"
              style={{ color: textPrimary, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 18 }}
            >
              <option value="all" style={{ backgroundColor: cardBg, color: textPrimary }}>All Months</option>
              {monthOptions.map(ym => (
                <option key={ym} value={ym} style={{ backgroundColor: cardBg, color: textPrimary }}>
                  {monthLabel(ym)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 shrink-0 -ml-4 pointer-events-none opacity-60" style={{ color: textMuted }} />
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border flex-1 min-w-[160px] max-w-sm md:max-w-md lg:max-w-xl"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input type="text" placeholder="Search client, phone, SI #..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-xs flex-1" style={{ color: textPrimary }} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="shrink-0" style={{ color: textMuted }}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Hidden file inputs */}
          <input ref={scanFileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { const file = e.target.files?.[0]; if (file) handleVoucherScan(file) }} />
          <input ref={excelFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />

          {/* Action buttons wrapper with right alignment */}
          {isAdmin && (
            <div className="flex items-center gap-2 ml-auto shrink-0 relative" ref={createDropdownRef}>
              {/* Delete All Action */}
              {filtered.length > 0 && (
                <button type="button" onClick={handleDeleteAllTickets} disabled={actionSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 bg-transparent text-red-600 border border-red-600 hover:bg-red-50 dark:text-red-500 dark:border-red-500 dark:hover:bg-red-950/30"
                  title={(searchQuery || storeFilter !== 'ALL' || branchFilter !== 'ALL' || activeTab !== 'ALL_PENDING')
                    ? 'Only matching filtered records will be deleted'
                    : 'Deletes all records permanently'}>
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{actionSaving ? 'Deleting...' : `Delete All ${filtered.length} Records`}</span>
                  <span className="sm:hidden">{actionSaving ? 'Deleting...' : 'Delete All'}</span>
                </button>
              )}

              <div className="flex items-center rounded-lg overflow-hidden shadow-sm border transition-all"
                style={{
                  borderColor: isLight ? '#059669' : '#10B981',
                  background: 'linear-gradient(135deg, #10B981, #059669)'
                }}>
                <button
                  type="button"
                  onClick={openAddModal}
                  disabled={scanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs text-white hover:opacity-95 disabled:opacity-60 transition-all shrink-0 border-r"
                  style={{ borderColor: 'rgba(255,255,255,0.15)' }}
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Scanning...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Ticket</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateDropdownOpen(prev => !prev)}
                  disabled={scanning}
                  className="flex items-center justify-center px-2.5 py-1.5 text-white hover:opacity-95 disabled:opacity-60 transition-all shrink-0"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Dropdown Menu */}
              {isCreateDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl shadow-2xl overflow-hidden py-1 border transition-all animate-fade-in"
                  style={{ backgroundColor: cardBg, borderColor: border }}>
                  <button
                    type="button"
                    disabled={scanning}
                    onClick={() => {
                      setIsCreateDropdownOpen(false)
                      scanFileInputRef.current?.click()
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-slate-500/10 disabled:opacity-60"
                    style={{ color: textPrimary }}
                  >
                    {scanning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                    ) : (
                      <FileUp className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span>{scanning ? 'Scanning...' : 'Scan PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateDropdownOpen(false)
                      excelFileInputRef.current?.click()
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-slate-500/10"
                    style={{ color: textPrimary }}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
                    <span>Import Excel</span>
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {/* ── Scan Error Banner ──────────────────────────────────── */}
      {scanError && (
        <div className="mx-3 mt-2 p-3 rounded-lg border flex items-center justify-between gap-3"
          style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <div className="flex items-center gap-2 text-xs font-semibold text-red-500">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{scanError}</span>
          </div>
          <button onClick={() => setScanError('')} className="p-1 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden" style={{ backgroundColor: cardBg, borderTop: `1px solid ${border}` }}>
          <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto" data-ticket-table-scroll>
          <table
            key={activeTab}
            className="w-full"
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
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      borderRight: tableColBorder,
                      borderBottom: `2px solid ${tableRowBorder}`,
                      fontSize: headerFontSize,
                      letterSpacing: '0.07em',
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
                    <FileText className="w-12 h-12 opacity-20 mx-auto mb-3" style={{ color: textMuted }} />
                    <p className="text-sm font-bold" style={{ color: textPrimary }}>No client tickets found</p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>Try adjusting filters or upload a spreadsheet.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((ticket, idx) => {
                  const storeStyle = getStoreStyle(ticket.sourceVendor)
                  const details = parseAcDetails(ticket)
                  const branchName = formatBranchTableLabel(ticket.branchId)
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
                  const lastUpdate = ticket.remarksUpdate || ticket.description || (ticket.updatedAt ? `Updated ${formatRelayDate(ticket.updatedAt)}` : '—')
                  const isSelected = selectedPreviewTicket?.id === ticket.id || contextMenu?.ticket.id === ticket.id
                  const categoryTint = !isSelected
                    ? category === 'Survey'
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
                  const rowHoverBg = category === 'Survey'
                    ? (isLight ? 'rgba(234,179,8,0.13)' : 'rgba(234,179,8,0.11)')
                    : category === 'Survey & Install' ? (isLight ? '#e6faf4' : 'rgba(16,185,129,0.09)')
                    : (isLight ? '#f1f5f9' : '#0f1e36')
                  const ticketNo = getTicketNumber(ticket)
                  const cleanTicketNo = ticketNo.replace(/^\d+\.\s*/, '')
                  const relayStatus = getRelayStatusShort(ticket)
                  const statusIsAssigned = relayStatus === 'ASSIGNED'
                  const statusIsScheduled = relayStatus === 'SCHEDULED'
                  const finalDateKey = resolveRelayFinalDate(ticket)
                  const finalDateLabel = finalDateKey ? formatRelayDate(finalDateKey) : ''
                  const cells: Array<{ value: React.ReactNode; right?: boolean }> = activeTab === 'MY_TICKETS' ? [
                    // TICKET NO
                    { value: (
                      <div className="flex items-center w-full min-w-0" title={cleanTicketNo}>
                        <span className="text-slate-400 dark:text-slate-500 mr-2 shrink-0 font-semibold text-xs">{idx + 1}.</span>
                        <span className="font-mono font-bold truncate block" style={{ color: textPrimary }}>
                          {displayUpper(cleanTicketNo)}
                        </span>
                      </div>
                    ) },
                    // STATUS
                    { value: (
                      <span className="font-semibold w-full truncate block" style={{
                        color: statusIsAssigned || statusIsScheduled ? '#10B981' : '#F59E0B'
                      }}>
                        {relayStatus}
                      </span>
                    ) },
                    // CUSTOMER NAME
                    { value: (
                      <span className="truncate block font-semibold w-full" title={displayUpper(ticket.customerName || 'Direct Client')} style={{ color: textPrimary }}>
                        {displayUpper(ticket.customerName || 'Direct Client')}
                      </span>
                    ) },
                    // DISTRICT
                    { value: (
                      <span className="truncate block w-full text-xs font-semibold" title={displayUpper(district)}>
                        {displayUpper(district)}
                      </span>
                    ) },
                    // BRAND
                    { value: (
                      <span className="truncate block w-full text-xs font-semibold" title={displayUpper(brandLabel)} style={{ color: textPrimary }}>
                        {displayUpper(brandLabel) || '—'}
                      </span>
                    ) },
                    // STORE / SOURCE
                    { value: (
                      <span className="truncate block w-full text-xs" title={displayUpper(storeStyle.label)}>
                        {displayUpper(storeStyle.label)}
                      </span>
                    ) },
                    // COMMIT
                    { value: (
                      <span className="truncate block w-full text-xs" title={displayUpper(ticket.commitType || '')} style={{ color: textMuted }}>
                        {displayUpper(ticket.commitType || '') || '—'}
                      </span>
                    ) },
                    // PREFERRED DATE
                    { value: <span className="whitespace-nowrap block w-full">{displayUpper(formatRelayDate(ticket.preferredDate || ''))}</span> },
                    // NEGOTIATOR
                    { value: (
                      <span className="truncate block w-full font-semibold max-w-full" title={displayUpper(negotiator)} style={{ color: textPrimary }}>
                        {displayUpper(negotiator)}
                      </span>
                    ) },
                    // FINAL DATE (read-only — set by negotiator when scheduling)
                    { value: (
                      <span
                        className="whitespace-nowrap block w-full font-semibold"
                        style={{ color: finalDateLabel ? '#10B981' : textMuted }}
                        title={finalDateLabel || 'Pending negotiator schedule'}
                      >
                        {finalDateLabel ? displayUpper(finalDateLabel) : '—'}
                      </span>
                    ) },
                    // REMARKS
                    { value: (
                      <span className="truncate block w-full text-xs" title={ticket.remarksUpdate || ''}>
                        {ticket.remarksUpdate || lastUpdate || '—'}
                      </span>
                    ) }
                  ] : [
                    { value: (
                      <div className="flex items-center w-full min-w-0" title={cleanTicketNo}>
                        <span className="text-slate-400 dark:text-slate-500 mr-2 shrink-0 font-semibold text-xs">{idx + 1}.</span>
                        <span className="font-mono font-bold truncate block" style={{ color: textPrimary }}>
                          {displayUpper(cleanTicketNo)}
                        </span>
                      </div>
                    ) },
                    { value: (
                      <span
                        className="font-semibold w-full truncate block"
                        title={relayStatus}
                        style={{ color: statusIsAssigned || statusIsScheduled ? '#10B981' : relayStatus === 'CANCELLED' ? '#EF4444' : '#F59E0B' }}>
                        {relayStatus}
                      </span>
                    ) },
                    { value: (
                      <span className="truncate block w-full font-semibold" style={{ color: textPrimary }} title={categoryLabel}>
                        {categoryLabel}
                      </span>
                    ) },
                    { value: (
                      <span
                        className={`${!columns[3].isExpanded ? 'truncate' : 'break-words'} block font-semibold w-full`}
                        title={displayUpper(ticket.customerName || 'Direct Client')}
                        style={{ color: textPrimary }}>
                        {displayUpper(ticket.customerName || 'Direct Client')}
                      </span>
                    ) },
                    { value: <span className="block w-full truncate">{displayUpper(district)}</span> },
                    { value: <span className="truncate block w-full" title={displayUpper(storeStyle.label)}>{displayUpper(storeStyle.label)}</span> },
                    { value: <span className="whitespace-nowrap block w-full">{displayUpper(relayedDate)}</span> },
                    { value: <span className="truncate block w-full" title={displayUpper(branchName)}>{displayUpper(branchName)}</span> },
                    { value: <span className="truncate block w-full text-xs" title={displayUpper(ticket.commitType || '')}>{displayUpper(ticket.commitType || '') || '—'}</span> },
                    { value: (
                      <span className="truncate block w-full max-w-full" title={displayUpper(negotiator)}>
                        {displayUpper(negotiator)}
                      </span>
                    ) },
                    { value: (
                      <span
                        className="whitespace-nowrap block w-full font-semibold"
                        style={{ color: finalDateLabel ? '#10B981' : textMuted }}
                        title={finalDateLabel || 'Pending negotiator schedule'}
                      >
                        {finalDateLabel ? displayUpper(finalDateLabel) : '—'}
                      </span>
                    ) },
                    { value: <span className={`${!columns[11].isExpanded ? 'truncate' : 'break-words'} block w-full`} title={lastUpdate || ''}>{lastUpdate || '—'}</span> },
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
          onPersistCustomStores={persistRelayCustomStores}
          parseStoreVendor={parseStoreVendor}
          resolveBranch={resolveBranch}
          negotiatorsForBranch={negotiatorsForBranch}
          mergeCandidates={mergeCandidates}
          mergeTargetId={mergeTargetId}
          merging={merging}
          actionSaving={actionSaving}
          onMergeTargetChange={setMergeTargetId}
          onMerge={handleMergeTickets}
          onClose={() => setIsActionDrawerOpen(false)}
          onDelete={() => {
            handleDeleteTicket(selectedTicket.id, selectedTicket.customerName)
            setIsActionDrawerOpen(false)
          }}
          onSave={handleDrawerActionSave}
          getTicketNumber={(t) => getTicketNumber(t as Ticket)}
          parseAcDetails={(t) => parseAcDetails(t as Ticket)}
        />
      )}
      {/* Centered Create Ticket Modal */}
      {isAddModalOpen && ReactDOM.createPortal((() => {
        const addCategory = /collect/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Collection'
          : /continuation/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Continuation'
          : /resched/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Resched'
          : /approval/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'For Approval'
          : /clean/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Cleaning'
          : /survey/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Survey'
          : /service/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Service'
          : 'Survey & Install'
        const fieldStyle = (value?: string) => ({
          backgroundColor: isFieldExtracted(value) ? (isLight ? 'rgba(16,185,129,0.04)' : 'rgba(16,185,129,0.08)') : inputBg,
          borderColor: isFieldExtracted(value) ? '#10B981' : inputBorder,
          color: textPrimary,
          fontFamily: 'inherit',
          textTransform: 'none' as const,
        })
        const addInput = 'w-full border rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 normal-case'
        const addInputSm = 'w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none transition-all focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/15 normal-case'
        const categoryOptions = [
          { label: 'S / I', value: 'Survey & Install', title: 'Installation service' },
          { label: 'Service', value: 'Service', title: 'Service ticket' },
          { label: 'Survey', value: 'Survey', title: 'Survey ticket' },
          { label: 'Cleaning', value: 'Cleaning', title: 'Cleaning ticket' },
          { label: 'For Approval', value: 'For Approval', title: 'For approval ticket' },
          { label: 'Resched', value: 'Resched', title: 'Rescheduled ticket' },
          { label: 'Continuation', value: 'Continuation', title: 'Continuation ticket' },
          { label: 'Collection', value: 'Collection', title: 'Collection ticket' },
        ]
        const storeOptions = [...BUILT_IN_RELAY_STORES, ...relayCustomStores.filter(s => !(BUILT_IN_RELAY_STORES as readonly string[]).includes(s))]
        const addCustomStore = () => {
          const name = addStoreDraft.trim()
          if (!name) return
          if ((BUILT_IN_RELAY_STORES as readonly string[]).some(s => s.toLowerCase() === name.toLowerCase())) {
            alert('That store is already in the list.')
            return
          }
          const next = [...new Set([...relayCustomStores, name])].sort((a, b) => a.localeCompare(b))
          setRelayCustomStores(next)
          persistRelayCustomStores(next)
          setAddForm(prev => ({ ...prev, sourceVendor: name }))
          setAddStoreDraft('')
          setShowAddStoreField(false)
        }
        const applyCategory = (value: string) => {
          const option = categoryOptions.find(item => item.value === value)
          if (!option) return
          setAddForm(prev => {
            let mappedSvc = option.value
            if (option.value === 'Survey & Install') mappedSvc = 'S/I'
            else if (option.value === 'Survey') mappedSvc = 'SURVEY'
            else if (option.value === 'Cleaning') mappedSvc = 'CLEANING'
            else if (option.value === 'For Approval') mappedSvc = 'FOR APPROVAL'
            else if (option.value === 'Resched') mappedSvc = 'RESCHED'
            else if (option.value === 'Continuation') mappedSvc = 'CONTINUATION'

            return {
              ...prev,
              serviceType: mappedSvc,
              title: option.title,
              status: 'PENDING',
              commitType: option.value === 'Survey & Install' ? 'FREE FIRST 10 FEET' : prev.commitType,
              installationCharges: option.value === 'Collection' ? prev.installationCharges : 0,
              modeOfPayment: option.value === 'Collection' ? prev.modeOfPayment : '',
            }
          })
        }
        return (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="flex flex-col w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border, maxHeight: '94vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
              <div className="px-5 sm:px-7 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-black text-lg leading-tight" style={{ color: textPrimary }}>Create Relay Ticket</h2>
                    <p className="text-[11px] mt-0.5 truncate font-semibold" style={{ color: textMuted }}>Ticket no. & relay date auto-filled</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIsAddModalOpen(false)}
                  className="p-2 rounded-lg border transition-colors hover:bg-slate-500/10 shrink-0"
                  style={{ borderColor: inputBorder, color: textMuted }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 sm:px-7 pb-3.5 flex flex-wrap items-end gap-3">
                <div className="w-72 max-w-full">
                  <label className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Category *</label>
                  <select
                    value={addCategory}
                    onChange={e => applyCategory(e.target.value)}
                    className={`${addInputSm} font-semibold`}
                    style={fieldStyle(addCategory)}
                  >
                    {categoryOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
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
            
            {/* Form */}
            <form onSubmit={handleFormCreateTicket} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-6">

                {/* 1. Store / transaction */}
                <section>
                  <RelayFormSectionHead step={1} icon={<Store className="w-3.5 h-3.5" />} title="Store & Transaction" subtitle="Where the relay came from" />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    <RelayFormField label="Store" compact className="md:col-span-4">
                      <select
                        value={showAddStoreField ? '__add_store__' : addForm.sourceVendor}
                        onChange={e => {
                          const val = e.target.value
                          if (val === '__add_store__') {
                            setShowAddStoreField(true)
                            return
                          }
                          setShowAddStoreField(false)
                          setAddStoreDraft('')
                          setAddForm(prev => ({
                            ...prev,
                            sourceVendor: val,
                          }))
                        }}
                        className={addInput}
                        style={fieldStyle(addForm.sourceVendor)}
                      >
                        {storeOptions.map(store => (
                          <option key={store} value={store}>{store}</option>
                        ))}
                        <option value="__add_store__">+ Add store...</option>
                      </select>
                    </RelayFormField>
                    {showAddStoreField && (
                      <RelayFormField label="New Store Name" compact className="md:col-span-4">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={addStoreDraft}
                            onChange={e => setAddStoreDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomStore() } }}
                            placeholder="e.g. S&R, Anson's"
                            className={addInput}
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                          />
                          <button
                            type="button"
                            onClick={addCustomStore}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shrink-0"
                            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                          >
                            Add
                          </button>
                        </div>
                      </RelayFormField>
                    )}
                    <RelayFormField label="Store Branch" compact className="md:col-span-4">
                      <input
                        type="text"
                        value={addForm.storeBranch}
                        onChange={e => setAddForm(prev => ({ ...prev, storeBranch: e.target.value }))}
                        placeholder="Branch"
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      />
                    </RelayFormField>
                    {addForm.sourceVendor === 'Robinsons' && (
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
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
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
                            installerName: foundEmp ? foundEmp.name : '',
                            branchId: (foundEmp && foundEmp.branchId) ? foundEmp.branchId : prev.branchId,
                            status: val ? 'ASSIGNED' : prev.status,
                          }))
                        }}
                        className={addInput}
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      >
                        <option value="">Select negotiator...</option>
                        {addModalNegotiators.map(emp => {
                          const branchName = emp.branchId ? (resolveBranch(emp.branchId)?.name || '') : ''
                          const nameWithBranch = branchName ? `${emp.name} (${branchName})` : emp.name
                          return (
                            <option key={emp.id} value={emp.id}>{nameWithBranch}</option>
                          )
                        })}
                      </select>
                    </RelayFormField>
                  </div>
                </section>

                {/* 5. Scheduling */}
                <section>
                  <RelayFormSectionHead step={5} icon={<CalendarDays className="w-3.5 h-3.5" />} title="Scheduling" subtitle="Requested date & collection details" />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                    <RelayFormField label="Requested Date" compact className="md:col-span-4">
                      <input type="date" value={addForm.preferredDate} onChange={e => setAddForm(prev => ({ ...prev, preferredDate: e.target.value }))} className={addInput} style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }} />
                    </RelayFormField>
                    {addCategory === 'Collection' && (
                      <>
                        <RelayFormField label="Amount" compact className="md:col-span-4">
                          <input type="number" min="0" step="0.01" value={addForm.installationCharges} onChange={e => setAddForm(prev => ({ ...prev, installationCharges: Number(e.target.value) || 0 }))} placeholder="0.00" className={addInput} style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                        </RelayFormField>
                        <RelayFormField label="Payment" compact className="md:col-span-4">
                          <input type="text" value={addForm.modeOfPayment} onChange={e => setAddForm(prev => ({ ...prev, modeOfPayment: e.target.value }))} placeholder="Cash / GCash" className={addInput} style={fieldStyle(addForm.modeOfPayment)} />
                        </RelayFormField>
                      </>
                    )}
                  </div>
                </section>

                {/* 6. Comment / remarks */}
                <section>
                  <RelayFormSectionHead step={6} icon={<MessageSquare className="w-3.5 h-3.5" />} title="Comment / Remarks" subtitle="Latest notes or dispatch update" />
                  <div className="grid grid-cols-1 gap-3.5">
                    <RelayFormField label="Remarks" compact>
                      <textarea
                        value={addForm.description}
                        onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value, remarksUpdate: e.target.value }))}
                        placeholder="Latest notes or dispatch update"
                        rows={3}
                        className={`${addInput} resize-none`}
                        style={fieldStyle(addForm.description)}
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
                                item.serviceType === 'S/I' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
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
                              <span className="font-bold block truncate" style={{ color: textPrimary }}>{item.sourceVendor || 'Direct'}</span></div>
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
                              item.serviceType === 'S/I' ? 'bg-emerald-500/10 text-emerald-500' :
                              item.serviceType === 'SURVEY' ? 'bg-purple-500/10 text-purple-500' : 'bg-slate-500/10 text-slate-400'
                            }`}>{item.serviceType}</span>
                          </div>

                          {/* Unit type */}
                          <div className="shrink-0 text-[10px] font-semibold" style={{ color: textMuted, minWidth: 80, maxWidth: 100 }}>
                            <div className="truncate">{item.unitType || '—'}</div>
                            <div className="text-[9px] truncate">{item.sourceVendor || '—'}</div>
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
        const storeInfo = parseStoreVendor(t.sourceVendor)

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
                {isAdmin && (
                  <button type="button" onClick={() => { handleDeleteTicket(t.id, t.customerName); setIsViewModalOpen(false); setSelectedPreviewTicket(null); }}
                    className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all">
                    Delete
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
