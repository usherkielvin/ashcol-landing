import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CalendarDays, Copy, Loader2, Pencil, Plus,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useArctic } from '../contexts/ArcticContext'
import { API_BASE_URL, fetchTicketsPage, fetchTicketByNumber, formatFetchError, readApiError, parseCreatedTicketResponse, resolvePortalWriteBranchId, resolveTicketArchiveBranchId, resolveTicketScheduleBranchId, resolveScopedBranchId, branchScopesMatch, appendCurrentNegotiator, isNegotiatorCandidate, isAccountActive, isTaguigBranchRef, isTaguigServicesScope, isTaguigServiceTicket, isPortalAdmin, isCoordinatorOrOicUser, getActivePortalBranchId, EMPLOYEES_DIRECTORY_UPDATED_EVENT, PROFILE_UPDATED_EVENT, DEALERS_UPDATED_EVENT, notifyDealersUpdated, getUserViewBranchIds, isBranchReadOnlyForUser, canMemberAccessPayroll, type InstallerBranchIndexEntry, type BranchStaffOption } from '../utils/api'
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
import { EMPTY_CELL, sanitizeDisplayText } from '../utils/textSanitize'
import { readSchedulesTabCache, schedulesCacheKey, writeSchedulesTabCache, getInitialSchedulesFromCache, isSchedulesSessionLoaded, clearRelaysCache, clearWarrantyCache, TAB_CACHE_UPDATED, SCHEDULES_PERSIST_LOCAL, syncTicketAcrossTabCaches, persistSchedulesMemoryToDisk } from '../utils/ticketTabCache'
import { beginActiveScheduleFetch, endActiveScheduleFetch } from '../utils/schedulesPrefetch'
import { normalizeRelayScheduleTicket, normalizeRelayScheduleTicketList } from '../utils/relayScheduleSync'
import { fetchCachedDriverOnlyNames, fetchCachedEmployees, fetchCachedLineupInstallerIndex, fetchCachedBranches } from '../utils/portalDirectoryCache'
import {
  BRANCH_ROSTER_UPDATED_EVENT,
  buildBranchRoster,
  fetchAllBranchRosters,
  isCoordinatorEmployee,
  isInstallerEmployee,
  employeeMatchesBranchScope,
  type BranchRoster,
} from '../utils/branchRoster'
import { resetTicketTableScroll } from '../utils/tabSwitch'
import * as XLSX from 'xlsx'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import { RelayEditTicketModal } from '../components/relays/RelayEditTicketModal'
import { type RelayEditDraft } from '../components/relays/relayEditForm'
import { parseStoreVendor } from '../utils/parseStoreVendor'
import { mapRelayDraftToScheduleEditForm } from '../utils/ticketEditBridge'
import {
    categoryDefaultServiceType,
  inferCategoryFromTicket,
  isFieldCategory,
  type TicketCategoryValue,
} from '../constants/ticketCategories'
import { SchedulesShowcase, type ScheduleShowcaseRow } from '../components/schedules/SchedulesShowcase'
import { VehicleTripLabel } from '../components/tickets/VehicleTripLabel'
import { fetchVehicles } from '../utils/vehicleApi'
import { TicketDetailsModal } from '../components/tickets/TicketDetailsModal'
import { TicketStatusPickerPopover } from '../components/tickets/TicketStatusPickerPopover'
import { CloseTicketDialog } from '../components/tickets/CloseTicketDialog'
import { ColumnHeaderContextMenu } from '../components/tickets/ColumnVisibilityControls'
import { TicketScheduleDetailsPopover } from '../components/tickets/TicketScheduleDetailsPopover'
import { TicketFinalDatePickerPopover } from '../components/tickets/TicketFinalDatePickerPopover'
import { TableCustomSelectDropdown, type DropdownOption } from '../components/tickets/TableCustomSelectDropdown'
import { AssignDriversModal } from '../components/tickets/AssignDriversModal'
import { ExcelImportResultsModal } from '../components/tickets/ExcelImportResultsModal'
import { CustomDatePickerModal } from '../components/tickets/CustomDatePickerModal'
import TicketHistoryGraphModal from '../components/TicketHistoryGraphModal'
import { guessDistrict } from '../utils/districtGuesser'
import { TicketContextMenu } from './tickets/popups/TicketContextMenu'
import { ExpandedCellPopover } from './tickets/popups/ExpandedCellPopover'
import { RescheduleDialog } from './tickets/modals/RescheduleDialog'
import { ContinuationDialog } from './tickets/modals/ContinuationDialog'
import { PaymentPromptModal } from './tickets/modals/PaymentPromptModal'
import { MonthFilterModal } from './tickets/modals/MonthFilterModal'
import { MyTicketsFilterModal } from './tickets/modals/MyTicketsFilterModal'
import { AddTicketModal } from './tickets/modals/AddTicketModal'
import { OverviewSearchView } from './tickets/overview/OverviewSearchView'
import { MyTicketsToolbar } from './tickets/toolbars/MyTicketsToolbar'
import { SchedulesToolbar } from './tickets/toolbars/SchedulesToolbar'
import { MonthViewBanner } from './tickets/toolbars/MonthViewBanner'
import { SortResetStrip } from './tickets/toolbars/SortResetStrip'
import { TicketMobileCard } from './tickets/mobile/TicketMobileCard'
import { TicketsTableHeader } from './tickets/table/TicketsTableHeader'
import {
  CLOSING_SCHEDULE_STATUSES, INLINE_EDIT_COLUMNS, SCHEDULES_ACTIVE_DATE_KEY, canEditClosedTicket, getClosedStamp, isTicketClosed, isTicketLockedFor, readCloseError, reopenTicketRequest,
  SCHEDULE_PENDING_STATUS_VALUES, TABLE_ROW_HEIGHT,
  applyImportFieldsFromRow, applyReturnToNegotiatorMyTicketsPatch, applyScheduleStatusPatch,
  buildArchiveServiceReportPayload, buildCellPatchBody, buildImportCreateRow, buildPatchImportBody,
  buildReschedulePatchBody, buildVehicleTripLabels, compareTicketsByColumn, computeSafePopoverPosition,
  defaultSortForSchedulesView, enrichCompletePatchBody, filterOverviewSearchResults,
  fetchTicketById, findTicketInListByRef, fmtPhone, formatAddress, formatDateKeyLabel, formatDateToKey,
  formatDisplayDate, formatGhostRemarks, formatNegotiatorLabel, formatInstallerLabel, formatPaymentAmount,
  formatPaymentBreakdownText, formatRelayTicketTypeShort, formatServiceDriver, formatSimpleDateShort,
  buildRescheduleGhostAcUpdates, getArchivedScheduleDate, getBranchDisplayName, getCellRawValue, getContinuationDates, getCustomerDisplayName,
  getEmptyRequiredColumnsForClose, getF, getFinalDateKey, getInstalledDateKey,
  getInstallerDisplay, getNextContinuationDate, getPaymentBreakdown, getPaymentMode,
  getPreferredDateKey, getPreviousScheduleDates, getScheduleGhostKind, getScheduleOutcome, getSchedulePaymentDisplay, getScheduleRowColors,
  getScheduleStatusBadgeStyle, getScheduleStatusDisplay, getScheduleStatusLabel, getScheduleStatusValue,
  getScheduleUpdateDisplay, getTicketCommitDisplay, getTicketDriverDisplay, getTicketDriverName,
  getTicketNegotiatorName, getTicketNumberDisplay, getTicketVehicleDisplay, importRowMatchesTicket,
  isCancelledScheduleGhost, isCancelledTicket, isCompletedGhostOnDate, isInstalledRemarks, isInstalledWorkflowStatus,
  isMovedToRescheduleRemark, isNoPaymentMode, isOverduePendingScheduleTicket, isReschedulePending, isScheduleGhostOnDate, isTempTicketId,
  isTicketNotFoundError, isUnmatchedImportComplete, lookupTicketByNumberOnServer, mergeAcMeta, mergePatchBodies, mergeServerListWithLocalEdits,
  mergeTicketPatch, normalizeCustomerKey, normalizeImportPaymentMode, parseAcMeta, parseBrand,
  parseDistrict, parseImportMoney, parseNameSiteToken, parseServiceDriverValue,
  pathnameForSurface, postArchiveServiceReport, preserveLocalScheduleFields, promoteTempTicketState, qualifiesForInstallComplete,
  resolveFormScheduleDateKey, resolveInitialScheduleDate, resolveNegotiatorDisplayName, resolveNegotiatorName,
  resolveScheduleCompletionDateKey, resolveTicketDistrict, resolveTicketPayment, resolveTicketScheduleDateKey,
  sanitizeTicketPatchBody, shouldArchiveCompletedSchedule, shouldBlankReschedGhostPayment, shouldShowOnMyTickets,
  sortOverviewSearchResults, statusShowsScheduleDetails, stripArchivedRemarkSuffix,
  ticketBelongsOnScheduleBranch, ticketBelongsOnScheduleDate, ticketHadScheduleDate,
  ticketHasRescheduleMeta, ticketMatchesDateKey, ticketMatchesNegotiatorFilter, ticketMatchesOverviewQuery,
  todayDateKey, wantsTicketArchive, withRescheduleSnapshot,
  type Ticket,
  type TicketsSurface,
  type ImportUpdate,
  type ImportPaymentConfirmation,
  type ImportUnmatchedRow,
  type CloseBlockerKind,
  type PaymentBreakdownEntry,
  type PendingTicketSave,
  type ScheduleOutcome,
  type ScheduleGhostKind,
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

/**
 * Columns rendered with AutoFitText need a cell wrapper with a real resolved width to measure
 * against — the shared center-aligned-column wrapper below normally uses w-auto/shrink-to-fit
 * instead, which left AutoFitText with nothing well-defined to measure and made it a no-op.
 */
const AUTOFIT_COLUMNS = new Set(['DESTINATION', 'DLR', 'COMMIT', 'BRAND'])

/** Schedules columns the user can hide (right-click a header); remembered per browser. */
const SCHEDULE_HIDDEN_COLS_KEY = 'ashcol_schedule_hidden_cols_v1'
/** Always visible: the row's identity and the status control everything else hangs off. */
const PROTECTED_SCHEDULE_COLS = new Set(['TICKET NO', "CUSTOMER'S NAME", 'STATUS'])

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  'TICKET NO': 115,
  'FINAL DATE': 130,
  "CUSTOMER'S NAME": 210,
  'DESTINATION': 135,
  'BRAND': 120,
  'DLR': 135,
  'COMMIT': 105,
  'INSTALLER': 125,
  'NEGOTIATOR': 110,
  'SERVICE': 120,
  'VEHICLE': 110,
  'STATUS': 130,
  'UPDATE': 160,
  'PAYMENT': 115,
}

const MIN_COL_WIDTHS: Record<string, number> = {
  'TICKET NO': 65,
  'FINAL DATE': 75,
  "CUSTOMER'S NAME": 85,
  'DESTINATION': 70,
  'BRAND': 65,
  'DLR': 70,
  'COMMIT': 60,
  'INSTALLER': 70,
  'NEGOTIATOR': 65,
  'SERVICE': 65,
  'VEHICLE': 60,
  'STATUS': 75,
  'UPDATE': 80,
  'PAYMENT': 65,
}

function AutoFitText({ text, style, title, minScale = 0.55, align = 'center' }: {
  text: string
  style?: React.CSSProperties
  title?: string
  minScale?: number
  align?: 'left' | 'center'
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const fit = () => {
      const containerWidth = outer.clientWidth
      const textWidth = inner.scrollWidth
      if (containerWidth <= 0 || textWidth <= 0) return
      const next = Math.min(1, containerWidth / textWidth)
      setScale(Math.max(minScale, next))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(outer)
    return () => ro.disconnect()
  }, [text, minScale])

  return (
    <div
      ref={outerRef}
      className={`w-full overflow-hidden flex items-center ${align === 'left' ? 'justify-start' : 'justify-center'}`}
      title={title ?? text}
    >
      <span
        ref={innerRef}
        style={{ ...style, display: 'inline-block', whiteSpace: 'nowrap', transform: `scale(${scale})` }}
      >
        {text}
      </span>
    </div>
  )
}


/** Modes offered by the Payment Details popup. The popup's value must always be one of these, otherwise the <select> shows
 *  the first option (CASH) while the saved value is something else (e.g. "NO PAYMENT", which the backend treats as "clear"). */
/** What the popup starts on for a ticket whose payment is `mode`. A ticket with no payment starts on NO PAYMENT, which has no
 *  amount field and cannot be saved: the person has to pick a real mode (CASH, GCASH…) first, which is what reveals the amount. */
function initialPaymentPromptMode(mode?: string | null): string {
  const v = String(mode || '').trim().toUpperCase().replace(/_/g, ' ')
  if (!v || v === 'NO PAYMENT' || v === 'NONE' || v === 'NO') return 'NO PAYMENT'
  return v
}

export default function Tickets({ surface }: { surface: TicketsSurface }) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const { setDataContext, setPageContext } = useArctic()
  const navigate = useNavigate()
  const pathname = pathnameForSurface(surface)
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

  const [searchParams, setSearchParams] = useSearchParams()
  const initialUrlQuery = searchParams.get('q') || searchParams.get('ticket') || ''

  const [overviewSearchInput, setOverviewSearchInput] = useState(() => initialUrlQuery)
  const [overviewSearchFocused, setOverviewSearchFocused] = useState(false)
  const [overviewResults, setOverviewResults] = useState<Ticket[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const overviewSearchSeqRef = useRef(0)

  useEffect(() => {
    const q = searchParams.get('q') || searchParams.get('ticket') || ''
    if (q) {
      setOverviewSearchInput(q)
    }
  }, [searchParams])

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


  const role = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'
  const isAdmin = isPortalAdmin(role)
  const isManager = role === 'manager'
  const isEmployee = ['employee', 'oic', 'staff'].includes(role)

  // ─────────────────────────────────────────────────────────────
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )
  useEffect(() => {
    const sync = () => setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [])

  const activeBranchId = (() => {
    const viewBranches = getUserViewBranchIds(user)
    if (isAdmin || isCoordinatorOrOicUser(user)) {
      if (globalBranchId && globalBranchId !== 'ALL_BRANCHES') return globalBranchId
      if (isAdmin) {
        const fromSidebar = getActivePortalBranchId(user)
        if (fromSidebar && fromSidebar !== 'ALL_BRANCHES') return fromSidebar
      }
    } else if (viewBranches.length > 0 && globalBranchId) {
      if (branchScopesMatch(globalBranchId, user?.branchId) || viewBranches.some(vb => branchScopesMatch(vb, globalBranchId))) {
        return globalBranchId
      }
    }
    return user?.branchId || ''
  })()
  const isTaguigServices = isTaguigServicesScope(activeBranchId, user?.email, user?.jobTitle)
  const isReadOnlySchedule = isBranchReadOnlyForUser(activeBranchId, user)
  const canEdit = (isAdmin || isManager || isEmployee) && !isReadOnlySchedule

  // ─────────────────────────────────────────────────────────────
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const tableBorder = isLight ? '#000000' : 'rgba(255, 255, 255, 0.45)'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  // Modern SaaS Data Grid: header matches the page background instead of a
  // tinted band, and rows are flat (no zebra striping) — the same tokens now
  // serve both My Tickets and Schedules, so the two tabs read as one grid.
  const pageBg = isLight ? '#f8fafc' : '#060B18'
  const myTicketsTheadBg = pageBg
  const myTicketsTheadText = textMuted
  const myTicketsTheadBorder = tableBorder
  const schedTheadBg = pageBg
  const schedTheadText = textMuted
  const schedTheadBorder = tableBorder
  const rowEven = isLight ? '#ffffff' : '#060B18'
  const rowOdd = rowEven
  const rowHover = isLight ? '#f8fafc' : '#0F1A2E'
  const green = '#16A34A'
  const textGreen = isLight ? '#16A34A' : '#4ade80'

// Clean, accurate, PH-tailored icons for the everyday quick actions launcher
const QuickTicketIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="m9 12 2 2 4-4" strokeWidth="2.2" />
  </svg>
)

const QuickScheduleIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <circle cx="16" cy="16" r="3" />
    <path d="M16 14.5v1.5l1 1" />
  </svg>
)

const QuickDailyTxIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
    <path d="m13 13 2 2 4-4" strokeWidth="2" />
  </svg>
)

const QuickExpensesIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <path d="M8 7h8" />
    <path d="M8 11h8" />
    <path d="M8 15h5" />
  </svg>
)

// Philippine Peso (₱) Banknote icon for installer and technician payouts
const QuickPesoPayoutIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="5" rx="2.5" />
    <circle cx="12" cy="12" r="3.8" strokeWidth="1.5" />
    <path d="M10.8 9.5h2a1.25 1.25 0 0 1 0 2.5h-2v2.5" strokeWidth="1.8" />
    <path d="M9.8 10.3h4.4" strokeWidth="1.4" />
    <path d="M9.8 11.6h4.4" strokeWidth="1.4" />
  </svg>
)

// Field technician crew lineup & dispatch (Hard hat installer roster)
const QuickLineupIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 18a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2H2v-2Z" />
    <path d="M12 4a5 5 0 0 0-5 5v2h10V9a5 5 0 0 0-5-5Z" />
    <path d="M4 11h16" />
    <path d="M12 4V2" />
  </svg>
)

const QuickRequestFormsIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
    <path d="m14.5 17.5 1.5-1.5 2.5 2.5" strokeWidth="1.8" />
  </svg>
)

  // Overview/search landing quick links — hidden once a search is in progress.
  // Mirrors the everyday-action set staff reach from the sidebar, laid out as a
  // tap-friendly icon grid so the mobile home screen doubles as a quick-launcher.
  const canAccessPayoutsQuick = canMemberAccessPayroll(user) || isAdmin || isManager
  const overviewQuickLinks = [
    { label: 'My Tickets', to: '/my-tickets', icon: QuickTicketIcon },
    { label: 'Schedules', to: '/schedules', icon: QuickScheduleIcon },
    { label: 'Daily Transaction', to: '/audit-report', icon: QuickDailyTxIcon },
    { label: 'Expenses', to: '/expenses', icon: QuickExpensesIcon },
    { label: 'Payouts', to: '/payouts', icon: QuickPesoPayoutIcon, hidden: !canAccessPayoutsQuick },
    { label: 'LINEUP', to: '/lineup', icon: QuickLineupIcon },
    { label: 'Request Forms', to: '/operations-forms', icon: QuickRequestFormsIcon },
  ].filter(link => !link.hidden)

  // ─────────────────────────────────────────────────────────────
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

  const [directoryVehicles, setDirectoryVehicles] = useState<string[]>([])
  useEffect(() => {
    let active = true
    fetchVehicles()
      .then(vList => {
        if (!active || !Array.isArray(vList)) return
        const names = vList.map(v => (v.name || '').trim()).filter(Boolean)
        setDirectoryVehicles(names)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

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

  // ─────────────────────────────────────────────────────────────
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

  const [saving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [paymentPrompt, setPaymentPrompt] = useState<{ ticket: Ticket; nextStatus: string; updateOnly?: boolean } | null>(null)
  const [promptAmount, setPromptAmount] = useState<string>('')
  const [promptMode, setPromptMode] = useState<string>('NO PAYMENT')
  const [promptHybridCash, setPromptHybridCash] = useState<string>('')
  const [promptHybridGcash, setPromptHybridGcash] = useState<string>('')

  useEffect(() => {
    if (isMyTickets) {
      setDateFilter('')
      return
    }
  }, [isMyTickets])

  // ─────────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ticket: Ticket } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)

  // Auto-open ticket details modal when navigating with ?ticket= or ?id= query param (e.g. from notifications)
  const handledTicketParamRef = useRef<string | null>(null)
  useEffect(() => {
    const targetId = (searchParams.get('ticket') || searchParams.get('id') || '').trim()
    if (!targetId) {
      handledTicketParamRef.current = null
      return
    }
    if (handledTicketParamRef.current === targetId) return

    const authToken = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    if (!authToken) return

    void (async () => {
      // 1. Check in currently loaded tickets list
      const fromList = tickets.find(t => t.id === targetId || t.ticketNumber === targetId || t.ticket_number === targetId)
      if (fromList) {
        handledTicketParamRef.current = targetId
        setDetailTicket(fromList)
        return
      }

      // 2. Check cached by number
      const cached = getTicketByNumber(targetId) as Ticket | null
      if (cached?.id) {
        handledTicketParamRef.current = targetId
        setDetailTicket(cached)
        return
      }

      // 3. Fetch from API by ID or Number
      const isNumberFormat = /^AS-\d+/i.test(targetId) || /^TKT-\d+/i.test(targetId)
      const fetched = isNumberFormat
        ? await fetchTicketByNumber(authToken, targetId)
        : await fetchTicketById(authToken, targetId)

      if (fetched && typeof fetched === 'object') {
        const normalized = normalizeRelayScheduleTicket(fetched) as Ticket
        if (normalized?.id) {
          handledTicketParamRef.current = targetId
          cacheTicketByNumber(normalized as unknown as Record<string, unknown>)
          setDetailTicket(normalized)
        }
      }
    })()
  }, [searchParams, tickets])

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

  // ─────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ─────────────────────────────────────────────────────────────
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
  // ─────────────────────────────────────────────────────────────
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
    paymentBreakdown?: Array<{ mode: string; amount: number }>
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
      if (!isAccountActive(directoryMatch)) {
        return null
      }
      return {
        id: directoryMatch.id,
        name: directoryMatch.name || user.name,
        branchId: directoryMatch.branchId || user.branchId,
        email: directoryMatch.email || user.email,
        role: directoryMatch.role || user.role,
        jobTitle: directoryMatch.jobTitle || user.jobTitle,
        isActive: true,
      }
    }
    return {
      id: user.id,
      name: user.name,
      branchId: user.branchId,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      isActive: true,
    }
  }, [user?.id, user?.name, user?.branchId, user?.email, user?.role, user?.jobTitle, branchEmployees])

  /** Negotiators assigned to a branch only — limited to active, coordinator-tagged employees. */
  const negotiatorsForBranch = useCallback((branchId?: string | null) => {
    const filterBranch =
      resolveSchedulesNegotiatorBranch(branchId)
      || resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle)
      || user?.branchId
      || null
    const isAll = !branchId || branchId === 'ALL' || branchId === 'ALL_BRANCHES'
    const matched = branchEmployees
      .filter(isAccountActive)
      .filter(isNegotiatorCandidate)
      // Only active coordinators appear in the negotiator/assigned-to dropdown.
      // This prevents managers, OIC staff, technicians, and deactivated accounts from appearing.
      .filter(isCoordinatorEmployee)
      .filter(u => {
        if (isAll) return true
        const bid = (u.branchId || '').trim()
        if (!bid || bid.toUpperCase() === 'ALL' || bid.toUpperCase() === 'ALL_BRANCHES') return false
        return branchScopesMatch(bid, filterBranch, u.email)
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    // Include signed-in user only when they belong to this branch
    if (
      currentNegotiatorOption
      && currentNegotiatorOption.branchId
      && (isAll || branchScopesMatch(currentNegotiatorOption.branchId, filterBranch, currentNegotiatorOption.email))
    ) {
      return appendCurrentNegotiator(matched, currentNegotiatorOption)
    }
    return matched
  }, [branchEmployees, resolveSchedulesNegotiatorBranch, currentNegotiatorOption, user?.branchId, user?.email, user?.jobTitle])

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

  // ── Technician account dropdown (Sept 1 2026+) ─────────────────
  // Replaces the free-text installer input with a proper select populated
  // from branchEmployees filtered to technician / installer job titles.
  // Note: TECHNICIAN_DROPDOWN_ACTIVE is a stable constant (computed once at module
  // render time, never changes per session), so it is intentionally excluded from deps.
  const TECHNICIAN_DROPDOWN_ACTIVE = new Date() >= new Date('2026-09-01T00:00:00')
  const TECHNICIAN_DROPDOWN_START_DATE = '2026-09-01'
  // A ticket scheduled on/after the rollout date gets the strict dropdown even before
  // TECHNICIAN_DROPDOWN_ACTIVE flips globally — e.g. a job booked today for Sept 1.
  const isTechnicianDropdownActiveForTicket = useCallback((ticket: Ticket) => {
    if (TECHNICIAN_DROPDOWN_ACTIVE) return true
    const scheduleDate = getFinalDateKey(ticket) || getPreferredDateKey(ticket)
    return Boolean(scheduleDate && scheduleDate >= TECHNICIAN_DROPDOWN_START_DATE)
  }, [TECHNICIAN_DROPDOWN_ACTIVE]) // eslint-disable-line react-hooks/exhaustive-deps

  const techniciansForBranch = useCallback((branchId?: string | null) => {
    const filterBranch =
      resolveSchedulesNegotiatorBranch(branchId)
      || resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle)
      || user?.branchId
      || null
    return branchEmployees
      .filter(isAccountActive)
      .filter(emp => isInstallerEmployee(emp))
      .filter(emp => {
        if (!filterBranch || filterBranch === 'ALL_BRANCHES') return true
        return (
          employeeMatchesBranchScope(emp, filterBranch) ||
          branchScopesMatch(emp.branchId, filterBranch, emp.email)
        )
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(emp => {
        const label = formatInstallerLabel(emp)
        // The <select>'s option value must be a non-empty name — technician accounts sometimes
        // have no `name` set (nickname-only), and an empty value collides with the placeholder
        // option's value="", making the option look pickable but silently no-op on select.
        const nick = (emp.nickname || '').trim().toUpperCase()
        const fullName = (emp.name || '').trim()
        const firstName = fullName.split(/\s+/)[0]?.toUpperCase() || ''
        const name = nick || firstName || fullName
        return { id: emp.id, name, label, branchId: emp.branchId }
      })
      .filter(t => t.name)
  }, [branchEmployees, resolveSchedulesNegotiatorBranch, user?.branchId, user?.email, user?.jobTitle])

  const addModalTechnicians = useMemo(
    () => techniciansForBranch(activeBranchId),
    [techniciansForBranch, activeBranchId],
  )

  const editModalTechnicians = useMemo(
    () => techniciansForBranch(editForm.branchId || activeBranchId || editTicket?.branchId),
    [techniciansForBranch, editForm.branchId, activeBranchId, editTicket?.branchId],
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
    // ─────────────────────────────────────────────────────────────
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
  const [reschedRemarks, setReschedRemarks] = useState('')
  const [customDatePickerOpen, setCustomDatePickerOpen] = useState(false)
  const [customDateCalMonth, setCustomDateCalMonth] = useState<{ year: number; month: number } | null>(null)


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

  /**
   * My Tickets status filter — same PENDING_GROUP/CLOSING_GROUP/specific-value shape as
   * monthFilterStatus, but applied client-side instantly (no server month-fetch involved,
   * unlike Schedules' "Apply"/runMonthFilterQuery) so a negotiator can narrow her queue by
   * sub-status (SURVEY, INSTALL, RESCHED, etc.) to see what's still not closed yet.
   */
  const [myTicketsStatusFilter, setMyTicketsStatusFilter] = useState('')
  /** 'YYYY-MM', or '' for all months. Filters on date created — the one date every ticket has,
   * unlike finalDate/preferredDate which aren't set yet for most of this queue. */
  const [myTicketsMonthFilter, setMyTicketsMonthFilter] = useState('')
  const [myTicketsFilterModalOpen, setMyTicketsFilterModalOpen] = useState(false)
  const [historyGraphModal, setHistoryGraphModal] = useState<{ ticket: Ticket; isOpen: boolean } | null>(null)
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
        // Only the explicit STATUS column can mark a row as installed/completed — matching
        // isInstalledRemarks() being stubbed to false elsewhere. Guessing "installed" from remarks
        // keywords (e.g. UPDATE cell text) was auto-completing plain schedule-sheet rows that only
        // ever contain a Request/Scheduled date, silently stamping installedDate on import.
        const isInstalled = isInstalledWorkflowStatus(statusVal)

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
      if (!isAllBranches && negoBranchRaw && !branchScopesMatch(negoBranchRaw, activeWriteBranch, selectedNegotiator.email)) {
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

          // ─────────────────────────────────────────────────────────────
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
      commitTerms: getTicketCommitDisplay(ticket),
      unitType: parseBrand(ticket) || ticket.unitType || ticket.unit_type || '',
      dealer: getF(ticket, 'dealer', 'sourceVendor', 'source_vendor') || 'Direct',
      diser: getF(ticket, 'diser') || '',
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
      acDetails: ticket.acDetails || ticket.ac_details,
      reschedulePending: isReschedulePending(ticket),
    }
  }, [branchEmployees, activeBranchId, isMyTickets, user?.id, resolveBranch])

  const openEditModal = (ticket: Ticket) => {
    if (isTicketLockedFor(ticket, role)) {
      showToast('This ticket is closed — only the administrator can edit this ticket.')
      return
    }
    // Search results come straight from a fresh /tickets?q= call — findTicketInListByRef's
    // fallbacks (the `tickets` array built for Schedules/My Tickets, and the cross-tab ticket
    // store) can hold a stale snapshot of the same ticket from an earlier visit to another
    // surface, which would silently override the just-fetched data with old dates. Only merge
    // in that stale-aware lookup for the surfaces that actually rely on it.
    const localTicket = surface === 'search' ? ticket : (findTicketInListByRef(tickets, ticket, optimisticTicketsRef.current) || ticket)
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
      const original = resolveEditOriginalTicket()
      if (!original || !isTicketClosed(original)) {
        return 'A ticket can only be closed with Close Ticket (status button, then Done) — it checks details, payment and documents first.'
      }
      const missing = getEmptyRequiredColumnsForClose(form)
      if (missing.length > 0) {
        return `Cannot close ticket because the following columns are empty:\n\u2022 ${missing.join('\n\u2022 ')}`
      }
    }

    return null
  }



  /** Returns false when validation stopped the save (an alert has already been shown). */
  const handleUnifiedEditSave = (draft: RelayEditDraft): boolean => {
    const nextForm = mapRelayDraftToScheduleEditForm(draft, {
      ...editForm,
      id: editForm.id || editTicket?.id,
      acDetails: editForm.acDetails || editTicket?.acDetails || editTicket?.ac_details,
    })
    const error = validateEditFormFor(nextForm)
    if (error) {
      alert(error)
      return false
    }
    setEditForm(nextForm)
    void commitSaveEditTicket(nextForm)
    return true
  }

  /**
   * Close Ticket from inside Edit Ticket: save what's on the form first (the checklist reads the
   * saved ticket, so an unsaved payment/detail would show as missing), then continue to the
   * Close Ticket checklist once the save has landed.
   */
  const saveThenRequestClose = (draft: RelayEditDraft) => {
    const ticket = editTicket
    if (!ticket) return
    if (handleUnifiedEditSave(draft)) setCloseResumeTicket(ticket)
  }


  /** Resolve the ticket being edited even if a list refresh dropped it from `tickets`. */
  const resolveEditOriginalTicket = (): Ticket | null => {
    const formId = (editForm.id || '').trim()
    if (!formId) return null

    // Search results are fetched fresh via /tickets?q= (see openEditModal); editTicket already
    // holds that fresh copy. Prefer it over `tickets` below, which can carry a stale snapshot of
    // the same ticket left over from browsing Schedules/My Tickets earlier in the session.
    if (surface === 'search' && editTicket?.id === formId) return editTicket

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

    // ─────────────────────────────────────────────────────────────
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
        // '' here means "user cleared Installed Date" and must reach the backend as an explicit
        // blank (now handled there as clear-to-null) rather than collapsing to undefined, which
        // gets dropped from the outgoing JSON entirely and silently keeps the old value.
        actualCompletion: activeForm.actualCompletion !== undefined
          ? activeForm.actualCompletion.trim()
          : undefined,
        dealer: activeForm.dealer?.trim() || 'Direct',
        diser: activeForm.diser?.trim() || undefined,
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
          // Leave a RESCHED ghost on the old date with that day's crew frozen. The backend records
          // this too, but the optimistic local row (applyTicketLocally) is built from THIS body —
          // without it here, the old date's row is dropped from the board/cache until a refetch.
          if (isDateMove && originalTicket) {
            Object.assign(acMetaExtras, buildRescheduleGhostAcUpdates(originalTicket, oldDateKey, newDateKey))
          }
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
        acMetaExtras.paymentBreakdown = []
      } else {
        if (paymentCharges != null && !Number.isNaN(Number(paymentCharges))) {
          body.installationCharges = Number(paymentCharges)
        }
        if (paymentMode) body.modeOfPayment = paymentMode
        if (Array.isArray(activeForm.paymentBreakdown) && activeForm.paymentBreakdown.length > 0) {
          acMetaExtras.paymentBreakdown = activeForm.paymentBreakdown.filter(p => p.amount > 0 || (p.mode && p.mode !== 'NO_PAYMENT'))
        }
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
      if (isDateMove && !leavingResched) {
        acMetaExtras.reschedulePending = false
      }

      // ─────────────────────────────────────────────────────────────
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

      if (['COMPLETED', 'DONE_DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'DONE_MOUNTING', 'DONE_RELOCATED', 'INSTALLED'].includes(String(body.status || '').toUpperCase())) {
        const outcome = (statusOutcome || String(statusAcMeta.scheduleOutcome || '') || (
          String(body.status || '').toUpperCase() === 'DONE_DISMANTLE' ? 'DONE_DISMANTLE'
            : String(body.status || '').toUpperCase() === 'DONE_SYSTEM_REPROCESS' ? 'DONE_SYSTEM_REPROCESS'
              : String(body.status || '').toUpperCase() === 'DONE_MOUNTING' ? 'DONE_MOUNTING'
                : String(body.status || '').toUpperCase() === 'DONE_RELOCATED' ? 'DONE_RELOCATED'
                  : 'DONE_INSTALLED'
        )) as ScheduleOutcome
        body.scheduleOutcome = outcome
        body.acDetails = mergeAcMeta({ ...activeForm, acDetails: body.acDetails } as Ticket, {
          scheduleOutcome: outcome,
          schedulePhase: '',
        })
      }

      const alreadyClosed = ['COMPLETED', 'INSTALLED', 'DONE_DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'DONE_MOUNTING', 'DONE_RELOCATED']
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
        // resolveScheduleCompletionDateKey first: for a CONTINUATION ticket, oldDateKey
        // (captured when this modal was opened, from the ticket's own finalDate/preferredDate)
        // is frozen on the original day no matter which continuation-day row was actually
        // clicked to get here — preferring it unconditionally attributed every completion made
        // from this modal to that stale day. resolveScheduleCompletionDateKey already falls back
        // to that same ticket-grounded date (via getEffectiveScheduleDateKey) whenever dateFilter
        // isn't a date this ticket actually belongs on, so this is a no-op for the common case.
        const schedKey = resolveScheduleCompletionDateKey(originalTicket, dateFilter) || oldDateKey
        // Pass originalTicket (pre-edit), not a copy pre-merged with the new status — enrichCompletePatchBody
        // re-applies `body` on top internally regardless (so the inferred outcome is unaffected),
        // but buildArchiveAcMeta's own status check inside it needs to see the ticket's status as
        // it was BEFORE this save to recognize a CONTINUATION ticket being closed out and fold its
        // origin day into continuationDates. Passing an already-status-overwritten ticket here
        // made that check never fire for a completion made from this modal.
        finalBody = enrichCompletePatchBody({ ...body }, originalTicket, schedKey)
      } else if (alreadyClosed && originalTicket) {
        // Ticket was already marked done before this edit — "Scheduled Date"/"Installed Date"
        // on the read-only view are a one-time snapshot taken at first completion (see
        // buildArchiveAcMeta). Without this, editing Schedule Date/Installed Date on an
        // already-closed ticket updates the live fields but leaves that snapshot stale,
        // so the edit modal and the view modal show two different dates for the same ticket.
        const ticketWithEdits = { ...originalTicket, ...body, acDetails: body.acDetails } as Ticket
        const syncedFinalKey = finalDateKey || getFinalDateKey(ticketWithEdits)
        const syncedInstalledKey = (typeof body.actualCompletion === 'string' && body.actualCompletion
          ? body.actualCompletion.split('T')[0]
          : '') || getInstalledDateKey(ticketWithEdits)

        // This is a direct correction, not a real reschedule — drop the date(s) being
        // superseded from previousScheduleDates too, or the Schedules grid keeps rendering
        // a ghost row on the old date forever (isCompletedGhostOnDate checks that array)
        // even though every visible field now agrees on the new date.
        const oldArchivedKey = getArchivedScheduleDate(originalTicket)
        const oldInstalledKey = getInstalledDateKey(originalTicket)
        const prevScheduleDates = getPreviousScheduleDates(originalTicket)
          .filter(d => d !== oldArchivedKey && d !== oldInstalledKey)

        finalBody = {
          ...body,
          acDetails: mergeAcMeta(ticketWithEdits, {
            ...(syncedFinalKey ? { archivedScheduleDate: syncedFinalKey } : {}),
            ...(syncedInstalledKey ? { installedDate: syncedInstalledKey } : {}),
            previousScheduleDates: prevScheduleDates,
          }),
        }
      }

      const archiveOriginal = originalTicket
      const archiveFinalBody = finalBody
      const archiveBody = body
      const needsArchive = shouldComplete && shouldArchiveCompletedSchedule(originalTicket, finalBody)
      // Same precedence as the schedKey above — must agree with it, since this feeds the
      // Archives report entry for the same completion.
      const schedKey = resolveScheduleCompletionDateKey(originalTicket, dateFilter) || oldDateKey || todayDateKey()

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

  // ─────────────────────────────────────────────────────────────
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})
  const [customColWidths, setCustomColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('ashcol_schedule_col_widths_v2')
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return {}
  })

  const [hiddenCols, setHiddenCols] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SCHEDULE_HIDDEN_COLS_KEY) || '[]')
      return Array.isArray(saved) ? saved.filter((l): l is string => typeof l === 'string' && !PROTECTED_SCHEDULE_COLS.has(l)) : []
    } catch { return [] }
  })
  const [colHeaderMenu, setColHeaderMenu] = useState<{ x: number; y: number; label: string; display: string } | null>(null)
  const updateHiddenCols = useCallback((updater: (prev: string[]) => string[]) => {
    setHiddenCols(prev => {
      const next = updater(prev)
      try { localStorage.setItem(SCHEDULE_HIDDEN_COLS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const startColResize = useCallback((e: React.MouseEvent, colLabel: string, currentWidth: number) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = currentWidth
    const minW = MIN_COL_WIDTHS[colLabel] || 60

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let latestWidth = startWidth
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(minW, Math.round(startWidth + delta))
      latestWidth = newWidth
      setCustomColWidths(prev => ({
        ...prev,
        [colLabel]: newWidth,
      }))
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setCustomColWidths(latest => {
        try {
          localStorage.setItem('ashcol_schedule_col_widths_v2', JSON.stringify({ ...latest, [colLabel]: latestWidth }))
        } catch { /* ignore */ }
        return latest
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])
  const [editingCell, setEditingCell] = useState<{ ticketId: string; rowIndex: number; colLabel: string; value: string } | null>(null)
  const [statusPicker, setStatusPicker] = useState<{
    ticket: Ticket
    mode: 'inline' | 'edit-form'
    x: number
    y: number
  } | null>(null)
  const [closeDialogTicket, setCloseDialogTicket] = useState<Ticket | null>(null)
  /** Ticket whose Close dialog should come back once the Fix (edit / payment) is finished. */
  const [closeResumeTicket, setCloseResumeTicket] = useState<Ticket | null>(null)
  const [scheduleDetailsPopup, setScheduleDetailsPopup] = useState<{
    ticket: Ticket
    x: number
    y: number
    ghostKind?: ScheduleGhostKind
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

  // Drag-to-scroll: click-and-drag horizontally on the table for easy mouse access
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    let isDown = false
    let startX = 0
    let scrollLeft = 0
    const onMouseDown = (e: MouseEvent) => {
      // Only activate on the scroll wrapper itself or its table/thead/tbody — not on interactive cells
      const target = e.target as HTMLElement
      if (target.closest('button, a, input, select, textarea, [data-no-drag-scroll]')) return
      isDown = true
      startX = e.pageX - el.offsetLeft
      scrollLeft = el.scrollLeft
      el.style.cursor = 'grabbing'
      el.style.userSelect = 'none'
    }
    const onMouseUp = () => {
      isDown = false
      el.style.cursor = ''
      el.style.userSelect = ''
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return
      e.preventDefault()
      const x = e.pageX - el.offsetLeft
      const walk = (x - startX) * 1.4
      el.scrollLeft = scrollLeft - walk
    }
    const onMouseLeave = () => {
      if (!isDown) return
      isDown = false
      el.style.cursor = ''
      el.style.userSelect = ''
    }
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])



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

  // ─────────────────────────────────────────────────────────────
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
      { label: 'NEGOTIATOR', display: 'NEGOTIATOR', weight: 8, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const, sortable: true },
      { label: 'STATUS', display: 'STATUS', weight: 12, expMul: 1.25, sticky: false, freeze: false, align: 'center' as const },
      { label: 'UPDATE', display: 'REMARKS', weight: 13, expMul: 1.5, sticky: false, freeze: false, align: 'right' as const },
      { label: 'FINAL DATE', display: 'FINAL DATE', weight: 10, expMul: 1.3, sticky: false, freeze: false, align: 'center' as const },
    ]
    const raw = isMyTickets ? myTicketsCols : scheduleCols.filter(c => !hiddenCols.includes(c.label))
    let stickyLeft = 0
    return raw.map((c) => {
      const isExpanded = !!expandedCols[c.label]
      const baseW = customColWidths[c.label] || DEFAULT_COL_WIDTHS[c.label] || 120
      const pixelWidth = isExpanded ? Math.round(baseW * 1.35) : baseW
      const leftPx = c.sticky ? stickyLeft : 0
      if (c.sticky) stickyLeft += pixelWidth
      return { ...c, isExpanded, pixelWidth, w: `${pixelWidth}px`, left: leftPx }
    })
  }, [expandedCols, isTaguigServices, isMyTickets, monthViewActive, customColWidths, hiddenCols])

  const columnDisplayName = (label: string): string => {
    switch (label) {
      case "CUSTOMER'S NAME": return 'CUSTOMER'
      case 'DESTINATION': return 'DISTRICT'
      case 'DLR': return isTaguigServices ? 'ENDORSED BY' : 'DEALER'
      case 'INSTALLER': return isTaguigServices ? 'TECHNICIAN' : 'INSTALLER'
      case 'SERVICE': return 'DRIVER'
      case 'UPDATE': return 'REMARKS'
      case 'FINAL DATE': return 'DATE'
      default: return label
    }
  }
  // FINAL DATE only exists on the Schedules table while the month view is showing.
  const hiddenColumnItems = hiddenCols
    .filter(label => label !== 'FINAL DATE' || monthViewActive)
    .map(label => ({ label, display: columnDisplayName(label) }))

  const totalTableWidth = useMemo(() => {
    return columns.reduce((acc, c) => acc + (c as any).pixelWidth, 0)
  }, [columns])

  // ─────────────────────────────────────────────────────────────
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
    const onCacheUpdated = (e: Event) => {
      const custom = e as CustomEvent
      if (custom.detail?.fullRefresh) {
        void fetchTickets({ soft: false, force: true, quiet: false })
      } else {
        hydrateFromTabCache()
      }
    }
    window.addEventListener(TAB_CACHE_UPDATED, onCacheUpdated)
    return () => window.removeEventListener(TAB_CACHE_UPDATED, onCacheUpdated)
  }, [hydrateFromTabCache, fetchTickets])

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
          const mapped: BranchStaffOption[] = list.map((u: any) => ({
            id: String(u.id || ''),
            name: String(u.name || ''),
            nickname: (u.nickname || '') as string | undefined,
            branchId: (u.branchId || u.branch_id) as string | undefined,
            email: u.email as string | undefined,
            role: (u.role as string | undefined),
            jobTitle: (u.jobTitle || u.job_title) as string | undefined,
            phone: u.phone as string | undefined,
            isActive: isAccountActive(u),
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

  // Display-only: a RESCHED ghost row shows the crew frozen for its old date (see
  // withRescheduleSnapshot). Used for rendering/sorting/branch-scoping ONLY — rows, menus, and
  // save paths keep the live ticket object so a snapshot can never be written back.
  const displayTicket = useCallback((ticket: Ticket): Ticket => (
    !isMyTickets && dateFilter ? withRescheduleSnapshot(ticket, dateFilter) : ticket
  ), [isMyTickets, dateFilter])

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
            displayTicket(t), effectiveBranch, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
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
        if (myTicketsStatusFilter === 'PENDING_GROUP') {
          if (!SCHEDULE_PENDING_STATUS_VALUES.has(getScheduleStatusValue(t))) return false
        } else if (myTicketsStatusFilter === 'CLOSING_GROUP') {
          if (!CLOSING_SCHEDULE_STATUSES.has(getScheduleStatusValue(t))) return false
        } else if (myTicketsStatusFilter) {
          if (getScheduleStatusValue(t) !== myTicketsStatusFilter) return false
        }
        if (myTicketsMonthFilter) {
          const createdMonth = (t.createdAt || t.created_at || '').slice(0, 7)
          if (createdMonth !== myTicketsMonthFilter) return false
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
        'MOUNTING', 'DONE_MOUNTING', 'RELOCATION', 'DONE_RELOCATED', 'PENDING_APPROVAL',
        'FOR_NEGOTIATION', 'DONE_NEGOTIATION', 'FOR_COLLECTION',
      ].includes(stat)
      if (!hasScheduleDate && !isScheduledOrActive) return false

      const scheduleValue = getScheduleStatusValue(t)
      const isResched = stat === 'RESCHED' || scheduleValue === 'RESCHED'
      const isContinuation = stat === 'CONTINUATION' || scheduleValue === 'CONTINUATION'
      const isForApproval = stat === 'FOR APPROVAL' || stat === 'FOR_APPROVAL' || stat === 'FOR QUOTATION' || stat === 'FOR_QUOTATION' || stat.includes('QUOTATION') || scheduleValue === 'FOR_APPROVAL'
      const isForNegotiation = stat === 'FOR_NEGOTIATION' || stat === 'FOR NEGOTIATION' || stat === 'DONE_NEGOTIATION' || scheduleValue === 'FOR_NEGOTIATION' || scheduleValue === 'DONE_NEGOTIATION'
      const isForCollection = stat === 'FOR_COLLECTION' || stat === 'FOR COLLECTION' || scheduleValue === 'FOR_COLLECTION'
      const isSurvey = scheduleValue === 'SURVEY' || scheduleValue === 'DONE_SURVEY'
      const isCleaning = scheduleValue === 'CLEANING' || scheduleValue === 'DONE_CLEANING'
      const isSystemReprocess = scheduleValue === 'SYSTEM_REPROCESS' || scheduleValue === 'DONE_SYSTEM_REPROCESS'
      const isDismantle = scheduleValue === 'DISMANTLE' || scheduleValue === 'DONE_DISMANTLE'
      const isRelocation = scheduleValue === 'RELOCATION' || scheduleValue === 'DONE_RELOCATED'
      const isInstallation = scheduleValue === 'INSTALLATION' || scheduleValue === 'SERVICES' || scheduleValue === 'DONE_INSTALLED' || scheduleValue === 'DONE_CHECKUP' || scheduleValue === 'DONE_BACKJOB' || scheduleValue === 'DONE_MOUNTING'
      const isActiveSchedule = ['SCHEDULED', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_THE_WAY'].includes(stat) || hasScheduleDate

      return isInstallation || isCleaning || isSystemReprocess || isDismantle || isRelocation || isResched || isContinuation || isForApproval || isForNegotiation || isForCollection || isSurvey || isActiveSchedule
    })
    if (!isMyTickets) {
      if (effectiveBranch && effectiveBranch !== 'ALL_BRANCHES') {
        list = list.filter(t =>
          (dateFilter && isCancelledScheduleGhost(t, dateFilter))
          || ticketBelongsOnScheduleBranch(
            displayTicket(t), effectiveBranch, user?.email, user?.jobTitle, installerLineupIndex, driverOnlyNames,
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
  }, [tickets, isMyTickets, activeBranchId, dateFilter, searchQuery, user?.id, user?.email, user?.branchId, user?.jobTitle, installerLineupIndex, driverOnlyNames, isAdmin, myTicketsNegotiatorFilter, myTicketsStatusFilter, myTicketsMonthFilter, branchEmployees, isBranchMatch, monthViewActive, monthFilterNegotiatorId, monthFilterStatus, displayTicket])

  // Auto-numbered vehicle trip labels ("STRADA - 1", "STRADA - 2") for the current filtered set —
  // the vehicle is now the dispatch unit, so staff never type a manual "- N" suffix into the
  // Driver or Vehicle fields; the trip number is derived from assignment order instead.
  const vehicleTripLabels = useMemo(() => buildVehicleTripLabels(filtered.map(displayTicket)), [filtered, displayTicket])

  const availableVehicles = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const name of directoryVehicles) {
      const key = name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push(name)
      }
    }
    for (const t of tickets) {
      const raw = (t.serviceVehicle || t.service_vehicle || '').trim()
      if (!raw) continue
      const base = parseNameSiteToken(raw).label || raw
      const key = base.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push(base)
      }
    }
    return list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [directoryVehicles, tickets])

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
    list = [...list].sort((rowA, rowB) => {
      const a = displayTicket(rowA)
      const b = displayTicket(rowB)
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
  }, [filtered, sortConfig, isMyTickets, branchEmployees, activeBranchId, vehicleTripLabels, monthViewActive, displayTicket])

  // Ground Arctic in the actual rows on screen and the active date/branch
  useEffect(() => {
    if (surface !== 'schedules') return
    const dateLabel = dateFilter ? formatDateKeyLabel(dateFilter) : 'All Dates'
    const branchName = activeBranchLabel || activeBranchId || 'All Branches'
    setPageContext(`Page: Schedules | Branch: ${branchName} | Date: ${dateLabel}`)

    const CAP = 25
    if (visible.length === 0) {
      setDataContext(`Schedule table (${dateLabel} | ${branchName}): no tickets currently shown for this date/branch/filter.`)
    } else {
      const rows = visible.slice(0, CAP).map(t => {
        const ticketNo = getF(t, 'ticketNumber', 'ticket_number') || t.id
        const customer = getF(t, 'customerName', 'customer_name') || 'Unknown customer'
        const status = getScheduleStatusDisplay(t)
        const commit = getF(t, 'commitType', 'commit_type')
        const installer = getInstallerDisplay(t, branchEmployees, activeBranchId)
        const negotiator = resolveNegotiatorDisplayName(t, branchEmployees)
        return `- ${ticketNo} | ${customer} | Status: ${status}${commit ? ` | Commit: ${commit}` : ''}${installer ? ` | Installer: ${installer}` : ''}${negotiator ? ` | Negotiator: ${negotiator}` : ''}`
      })
      const overflow = visible.length > CAP ? `\n…and ${visible.length - CAP} more ticket(s) not listed here.` : ''
      setDataContext(`Schedule table (${dateLabel} | ${branchName}) — ${visible.length} ticket(s) currently shown:\n${rows.join('\n')}${overflow}`)
    }
    return () => {
      setDataContext(null)
    }
  }, [surface, visible, branchEmployees, activeBranchId, activeBranchLabel, dateFilter, setDataContext, setPageContext])

  /** Exports exactly what's on screen — same rows, same order, as whatever filters
   *  (negotiator, Pending/Closing, date/month, search) are currently active. */
  const handleExportExcel = useCallback(() => {
    if (visible.length === 0) return
    const rows = visible.map(t => ({
      'Ticket No': getF(t, 'ticketNumber', 'ticket_number') || t.id,
      'Customer': getF(t, 'customerName', 'customer_name'),
      'District': parseDistrict(t.location, t.district) || formatAddress(t.location),
      'Brand': parseBrand(t),
      'Dealer': getF(t, 'dealer'),
      'Commit': getF(t, 'commitType', 'commit_type'),
      'Negotiator': resolveNegotiatorDisplayName(t, branchEmployees),
      'Status': getScheduleStatusDisplay(t),
      'Remarks': getF(t, 'remarksUpdate', 'remarks'),
      'Final Date': getFinalDateKey(t) ? formatDisplayDate(getFinalDateKey(t)) : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    const sheetName = isMyTickets ? 'My Tickets' : 'Schedules'
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    const filterLabel = myTicketsStatusFilter === 'PENDING_GROUP' ? 'Pending'
      : myTicketsStatusFilter === 'CLOSING_GROUP' ? 'Closing'
      : 'All'
    const negoLabel = isMyTickets && myTicketsNegotiatorFilter
      ? `_${formatNegotiatorLabel(myTicketsNegotiatorOptions.find(emp => emp.id === myTicketsNegotiatorFilter) || {}, true)}`
      : ''
    XLSX.writeFile(wb, `ASHCOL_${sheetName.replace(' ', '')}_${filterLabel}${negoLabel}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }, [visible, isMyTickets, branchEmployees, myTicketsStatusFilter, myTicketsNegotiatorFilter, myTicketsNegotiatorOptions])

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
      const live = displayTicket(optimisticTicketsRef.current.get(ticket.id) || ticket)
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
        driver: parseNameSiteToken(driverRaw).label || driverRaw,
        service: vehicleTrip,
      }
    })
  }, [visible, isMyTickets, branchEmployees, activeBranchId, tickets, dateFilter, vehicleTripLabels, displayTicket])

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

  // Schedule table display only — shows the installer's nickname if set on their account,
  // otherwise just their first name. The full name stays intact everywhere else (edit
  // seeding, payroll matching, lineup grouping) so nothing downstream loses precision.
  function formatInstallerShortDisplay(fullName: string): string {
    const trimmed = (fullName || '').trim()
    if (!trimmed) return ''
    // Multiple installers on one vehicle are joined "MANNY GONZALES / ROMAR CRUZ" —
    // shorten each name separately so both survive, not just the first.
    if (trimmed.includes('/')) {
      return trimmed.split('/').map(part => formatInstallerShortDisplay(part.trim())).filter(Boolean).join(' / ')
    }
    const matched = branchEmployees.find(emp => (emp.name || '').trim().toLowerCase() === trimmed.toLowerCase())
    const nick = (matched?.nickname || '').trim()
    if (nick) return nick.toUpperCase()
    return trimmed.split(/\s+/)[0]?.toUpperCase() || trimmed.toUpperCase()
  }

  // ─────────────────────────────────────────────────────────────
  function getCellDisplay(rowTicket: Ticket, colLabel: string): string {
    const ticket = displayTicket(rowTicket)
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
        case 'INSTALLER': return formatInstallerShortDisplay(getInstallerDisplay(ticket, branchEmployees, activeBranchId))
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
    ghostKind?: ScheduleGhostKind,
  ) => {
    commitCellEditRef.current()
    setExpandedCell(null)
    setStatusPicker(null)

    const popupW = 380
    const popupH = 480
    const el = anchorEl
      || (document.querySelector(`[data-cell-key="${ticket.id}:STATUS"]`) as HTMLElement | null)
    const rect = el?.getBoundingClientRect()
    const left = rect
      ? Math.min(Math.max(12, rect.left + rect.width / 2 - popupW / 2), window.innerWidth - popupW - 12)
      : Math.max(12, (window.innerWidth - popupW) / 2)
    const below = rect ? rect.bottom + 6 : 80
    const above = rect ? rect.top - popupH - 6 : 80
    const fitsBelow = below + popupH <= window.innerHeight - 12
    const top = rect
      ? (fitsBelow ? below : (above >= 12 ? above : Math.max(12, window.innerHeight - popupH - 12)))
      : 80

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

    const calSeedKey = initDate || dateFilter || todayDateKey()
    const calSeed = calSeedKey ? new Date(`${calSeedKey}T00:00:00`) : new Date()
    const calViewDate = !isNaN(calSeed.getTime()) ? calSeed : new Date()
    setFinalDateCalMonth({ year: calViewDate.getFullYear(), month: calViewDate.getMonth() })
    setFinalDatePicker({ ticket, x: left, y: top, value: initDate, preferredDate })
  }, [])

  // Identity/commercial fields are changed through Edit Ticket (or set at creation), not in the grid:
  // dealer, commit and district for every ticket; customer and brand too while the row is overdue-pending.
  const isCellLockedForInline = (ticket: Ticket, colLabel: string): boolean => {
    if (colLabel === 'DLR' || colLabel === 'COMMIT' || colLabel === 'DESTINATION') return true
    if (colLabel === "CUSTOMER'S NAME" || colLabel === 'BRAND') {
      return isOverduePendingScheduleTicket(ticket, null, dateFilter)
    }
    return false
  }

  const startCellEdit = (ticket: Ticket, colLabel: string, anchorEl?: HTMLElement | null, rowIndex?: number) => {
    // Clicking straight from one open cell editor into another must save the first cell's
    // draft rather than silently drop it — previously this only cleared the pending blur
    // timer, which cancelled the SERVICE/VEHICLE (and other) cell's save entirely.
    commitCellEdit()
    setExpandedCell(null)
    setSelectedVehicleTicketId(null)
    if (colLabel === 'STATUS') {
      openStatusPicker(ticket)
      return
    }
    if (isTicketClosed(ticket)) {
      showToast('This ticket is closed — its cells are read-only.')
      return
    }
    if (isCellLockedForInline(ticket, colLabel)) {
      showToast('Change this through Edit Ticket details.')
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
    // ─────────────────────────────────────────────────────────────
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
          // A confirmed close goes to the guarded endpoint, which re-runs the details / payment /
          // document checks and stamps who closed the ticket; everything else is a plain PATCH.
          const isClose = job.closeConfirmed === true
          const res = await fetch(`${API_BASE_URL}/tickets/${saveId}${isClose ? '/close' : ''}`, {
            method: isClose ? 'POST' : 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth}`,
            },
            body: JSON.stringify(isClose ? { confirmed: true, patch: payload } : payload),
          })
          if (!res.ok) {
            const errText = isClose ? await readCloseError(res) : await readApiError(res)
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
    opts?: { closeConfirmed?: boolean },
  ) => {
    const ticketId = ticket.id
    const existing = pendingSavesRef.current.get(ticketId)
    const baseTicket = optimisticTicketsRef.current.get(ticketId) || ticket
    // Closed tickets are read-only for non-admins (the backend enforces the same rule) — refuse
    // here so the row never flashes an edit that the server would only roll back with an error.
    if (!opts?.closeConfirmed && isTicketLockedFor(baseTicket, role)) {
      showToast('This ticket is closed — only the administrator can edit this ticket.')
      return Promise.resolve()
    }
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
      closeConfirmed: opts?.closeConfirmed || existing?.closeConfirmed,
    })
    applyTicketLocally(ticketId, nextTicket)
    // ─────────────────────────────────────────────────────────────
    if (!isTempTicketId(ticketId)) {
      return flushTicketSave(ticketId)
    }
    return Promise.resolve()
  }, [applyTicketLocally, flushTicketSave, role])

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
    injectedPayment?: { amount?: number; modeOfPayment: string; breakdown?: PaymentBreakdownEntry[] },
    opts?: { closeConfirmed?: boolean; remarks?: string },
  ) => {
    const liveTicket = resolveLiveScheduleTicket(ticket)

    const normalizedStatus = value.toUpperCase().replace(/\s+/g, '_')
    const body = buildCellPatchBody(liveTicket, colLabel, value, branchEmployees)
    // The PAYMENT column has no cell patch of its own — its whole patch is the injected payment below,
    // so an empty body is only a no-op when there is no payment to apply either.
    if (Object.keys(body).length === 0 && !injectedPayment) {
      cancelEdit()
      setStatusPicker(null)
      closeFinalDatePicker()
      return
    }

    // Remarks typed in the Close Ticket dialog travel with the close itself.
    if (opts?.remarks) {
      const remarkBody = buildCellPatchBody(
        { ...liveTicket, acDetails: (body.acDetails as string | undefined) ?? liveTicket.acDetails } as Ticket,
        'UPDATE',
        opts.remarks,
        branchEmployees,
      )
      Object.assign(body, mergePatchBodies(body, remarkBody))
    }

    if (injectedPayment) {
      body.modeOfPayment = injectedPayment.modeOfPayment
      body.installationCharges = injectedPayment.amount
      body.acDetails = mergeAcMeta(liveTicket, {
        // [] (not undefined) when there is no split: undefined is dropped from the JSON and the
        // previous split would stay on the ticket.
        paymentBreakdown: injectedPayment.breakdown && injectedPayment.breakdown.length
          ? injectedPayment.breakdown
          : [],
      })
    }

    // ─────────────────────────────────────────────────────────────
    let finalBody: Record<string, unknown> = body
    const schedKey = resolveScheduleCompletionDateKey(liveTicket, dateFilter)
    const remarkText = colLabel === 'UPDATE'
      ? stripArchivedRemarkSuffix(value.trim())
      : ''
    if (colLabel === 'UPDATE' && isInstalledRemarks(remarkText)) {
      // A remark can no longer finish a ticket on its own — closing goes through Close Ticket,
      // which checks details, payment and documents first. Save the remark as typed.
      if (!isTicketClosed(liveTicket)) showToast('Remark saved. Use Done to close this ticket.')
    } else if (
      (body.status as string | undefined)?.toUpperCase() === 'COMPLETED'
      || (body.status as string | undefined)?.toUpperCase() === 'INSTALLED'
      || (body.status as string | undefined)?.toUpperCase() === 'DONE_DISMANTLE'
      || (body.status as string | undefined)?.toUpperCase() === 'DONE_SYSTEM_REPROCESS'
      || (body.status as string | undefined)?.toUpperCase() === 'DONE_MOUNTING'
      || (body.status as string | undefined)?.toUpperCase() === 'DONE_RELOCATED'
    ) {
      finalBody = enrichCompletePatchBody(body, liveTicket, schedKey)
    }

    cancelEdit()
    setStatusPicker(null)
    setFinalDatePicker(null)
    setFinalDateCalMonth(null)

    // After marking DONE INSTALL / DONE CLEANING / DONE DISMANTLE / DONE RELOCATED, put the caret in REMARKS.
    const focusRemarksAfterStatus = colLabel === 'STATUS'
      && (normalizedStatus === 'DONE_INSTALLED' || normalizedStatus === 'DONE_CLEANING' || normalizedStatus === 'DONE_DISMANTLE' || normalizedStatus === 'DONE_RELOCATED')

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
      opts,
    )

    if (focusRemarksAfterStatus && !opts?.closeConfirmed) {
      const nextTicket = mergeTicketPatch(liveTicket, finalBody)
      requestAnimationFrame(() => {
        const rowIndex = visible.findIndex(t => t.id === nextTicket.id)
        startCellEdit(nextTicket, 'UPDATE', undefined, rowIndex >= 0 ? rowIndex : undefined)
      })
    }
  }
  saveCellEditRef.current = (ticket, colLabel, value, injectedPayment) => { void saveCellEdit(ticket, colLabel, value, injectedPayment) }

  /** Opens the Close Ticket dialog — after any unsaved/in-flight edits for this row have landed. */
  const requestCloseTicket = (ticket: Ticket) => {
    const live = resolveLiveScheduleTicket(ticket)
    if (pendingSavesRef.current.has(live.id) || activeSavesRef.current.has(live.id)) {
      flushTicketSaveRef.current(live.id)
      showToast('Saving your latest changes — try Close Ticket again in a moment.')
      return
    }
    setCloseDialogTicket(live)
  }

  /** Step-2 confirmation: the save goes to POST /tickets/{id}/close (see flushTicketSave). */
  const confirmCloseTicket = (full: Ticket, outcome: ScheduleOutcome, remarks: string) => {
    setCloseDialogTicket(null)
    saveCellEdit(full, 'STATUS', outcome, undefined, { closeConfirmed: true, remarks })
  }

  /** Reopens the Close Ticket dialog once the in-flight saves for this ticket have landed. */
  const resumeCloseDialog = (ticket: Ticket) => {
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      const busy = pendingSavesRef.current.has(ticket.id) || activeSavesRef.current.has(ticket.id)
      if (!busy || tries > 40) {
        clearInterval(timer)
        setCloseDialogTicket(resolveLiveScheduleTicket(ticket))
      }
    }, 150)
  }

  // After a Fix the person lands back on the checklist: once the edit modal, details modal and
  // payment prompt are all closed again (saved or cancelled), reopen Close Ticket for that ticket.
  useEffect(() => {
    if (!closeResumeTicket) return
    if (editModalOpen || detailTicket || paymentPrompt || closeDialogTicket) return
    const ticket = closeResumeTicket
    setCloseResumeTicket(null)
    resumeCloseDialog(ticket)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeResumeTicket, editModalOpen, detailTicket, paymentPrompt, closeDialogTicket])

  const cancelTicketWithReason = (ticket: Ticket, reason: string) => {
    const live = resolveLiveScheduleTicket(ticket)
    const statusBody = buildCellPatchBody(live, 'STATUS', 'CANCELLED', branchEmployees)
    const remarkBody = buildCellPatchBody(
      { ...live, acDetails: (statusBody.acDetails as string | undefined) ?? live.acDetails } as Ticket,
      'UPDATE',
      `CANCELLED: ${reason}`,
      branchEmployees,
    )
    void queueTicketPatch(live, mergePatchBodies(statusBody, remarkBody))
    setStatusPicker(null)
  }

  const reopenClosedTicket = async (ticket: Ticket, reason: string): Promise<Ticket | void> => {
    try {
      const updated = await reopenTicketRequest(ticket.id, reason)
      optimisticTicketsRef.current.delete(updated.id)
      applyTicketLocally(updated.id, updated)
      cacheTicketByNumber(updated as unknown as Record<string, unknown>)
      setDetailTicket(prev => (prev && prev.id === updated.id ? updated : prev))
      showToast('Ticket reopened')
      return updated
    } catch (err: unknown) {
      alert(`Could not reopen ticket: ${formatFetchError(err)}`)
    }
  }

  /** Opens the Update Payment prompt on a ticket, starting from what is saved (including a cash/GCash split). */
  const openUpdatePaymentPrompt = (ticket: Ticket) => {
    const payment = resolveTicketPayment(ticket)
    setPaymentPrompt({ ticket, nextStatus: getScheduleStatusValue(ticket) || 'DONE_INSTALLED', updateOnly: true })
    setPromptMode(initialPaymentPromptMode(payment.mode))
    setPromptAmount(payment.amount > 0 ? String(payment.amount) : '')
    const split = getPaymentBreakdown(ticket)
    const splitAmount = (mode: string) => split.find(e => e.mode === mode)?.amount
    setPromptHybridCash(splitAmount('CASH') ? String(splitAmount('CASH')) : '')
    setPromptHybridGcash(splitAmount('GCASH') ? String(splitAmount('GCASH')) : '')
  }

  /** "Fix" on a failed checklist line: jump to the place that resolves it. */
  const handleCloseDialogFix = (kind: CloseBlockerKind, full: Ticket) => {
    setCloseDialogTicket(null)
    setCloseResumeTicket(full)
    if (kind === 'detail' || kind === 'document') {
      if (!editModalOpen) openEditModal(full)
      return
    }
    if (kind === 'payment') {
      openUpdatePaymentPrompt(full)
      return
    }
    if (!editModalOpen) openEditModal(full)
  }

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
    // Prefill remarks with current ticket remarks so user doesn't have to retype
    const ticketWithSnakeCase = ticket as Ticket & { remarks_update?: string }
    setReschedRemarks((ticket.remarksUpdate || ticketWithSnakeCase.remarks_update || ticket.remarks || '').trim())
    const targetKey = dateFilter || existingTarget || preferred || todayDateKey()
    const startDate = new Date(`${targetKey}T00:00:00`)
    const calViewDate = !isNaN(startDate.getTime()) ? startDate : new Date()
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

  const openContinuationDialog = (ticket: Ticket) => {
    commitCellEdit()
    const existingDates = getContinuationDates(ticket)
    setContinuationDialog({ ticket })
    setContinuationSelectedDates(existingDates)

    const preferred = getPreferredDateKey(ticket)
    const startKey = existingDates[0] || preferred || dateFilter || todayDateKey()
    const startDate = new Date(`${startKey}T00:00:00`)
    const calViewDate = !isNaN(startDate.getTime()) ? startDate : new Date()
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

    const selected = Array.from(new Set(continuationSelectedDates.filter(Boolean))).sort()
    if (selected.length === 0) {
      alert('Pick at least one date.')
      return
    }

    // Continuation behaves like a mini-reschedule, not a status that lingers across every day
    // it spans: the FURTHEST selected date becomes the ticket's new live/editable occurrence
    // (a normal pending status, e.g. "INSTALL" — not a "CONTINUATION" badge), and every earlier
    // date (the day it was on before this, plus any other selected day short of the furthest
    // one) becomes a read-only "Continuation" ghost via continuationDates. This reuses the exact
    // same ghost machinery isContinuationGhostOnDate already applies once a ticket closes out on
    // a later continuation day — it works here too because it keys off "status isn't literally
    // CONTINUATION and dateKey isn't the ticket's current date", both true immediately after this.
    const oldDateKey = getFinalDateKey(ticket) || getPreferredDateKey(ticket)
    const newDateKey = selected[selected.length - 1]
    const earlierSelected = selected.slice(0, -1)
    const existingContinuation = getContinuationDates(ticket)
    const continuationGhostDates = Array.from(new Set([
      ...existingContinuation,
      ...(oldDateKey && oldDateKey !== newDateKey ? [oldDateKey] : []),
      ...earlierSelected,
    ]))

    const body: Record<string, unknown> = {
      status: 'SCHEDULED',
      preferredDate: newDateKey,
      finalDate: newDateKey,
    }
    const acUpdates: Record<string, unknown> = {
      continuationDates: continuationGhostDates,
      finalDate: newDateKey,
      scheduledDate: newDateKey,
      scheduleOutcome: '',
    }
    body.acDetails = mergeAcMeta(ticket, acUpdates)

    closeContinuationDialog()
    queueTicketPatch(ticket, body)
  }

  // ─────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────
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
    // Resched ghosts are the one ghost kind where remarks stay editable — a single shared
    // remarksUpdate field, not per-date state, so editing it from the ghost row is safe.
    const isReschedRemarksGhost = Boolean(rowGhost) && colLabel === 'UPDATE'
      && getScheduleGhostKind(ticket, dateFilter) === 'resched'
    if (!editingCell || editingCell.ticketId !== ticket.id || editingCell.colLabel !== colLabel
      || (rowGhost && !isReschedRemarksGhost)) return null
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
      // FINAL DATE uses the floating calendar popup.
      return null
    }

    if (colLabel === 'NEGOTIATOR') {
      const ticketBranchId = resolveTicketScheduleBranchId(ticket, installerLineupIndex, driverOnlyNames) || activeBranchId
      const options = negotiatorsForBranch(ticketBranchId)
      const current = editingCell.value
      const currentLower = current.trim().toLowerCase()
      const matchedOption = currentLower
        ? options.find(emp => {
            const nameLower = emp.name.toLowerCase()
            return nameLower === currentLower || nameLower.includes(currentLower) || currentLower.includes(nameLower)
          })
        : undefined
      const selectValue = matchedOption ? matchedOption.name : current

      const dropdownOptions: DropdownOption[] = options.map(emp => {
        const fullName = (emp.name || '').trim()
        const nick = (emp.nickname || '').trim().toUpperCase()
        const firstName = fullName.split(/\s+/)[0]?.toUpperCase()
        const cleanLabel = nick || firstName || fullName.toUpperCase()
        const branchName = getBranchDisplayName(emp.branchId || null)
        return {
          id: emp.id,
          value: emp.name,
          label: cleanLabel,
          subLabel: fullName !== cleanLabel ? fullName : undefined,
          badge: branchName ? branchName.toUpperCase() : undefined,
        }
      })

      if (current && !matchedOption && !options.some(emp => emp.name === current)) {
        dropdownOptions.push({
          id: 'custom-nego-current',
          value: current,
          label: current.toUpperCase(),
        })
      }

      return wrapEditingCell(
        <TableCustomSelectDropdown
          value={selectValue}
          options={dropdownOptions}
          placeholder="Select negotiator…"
          searchPlaceholder="Search negotiator…"
          emptyLabel="No negotiators found"
          clearLabel="— Clear Negotiator —"
          isLight={isLight}
          isSaving={isSaving}
          onSelect={(val) => {
            if (cellEditBlurTimer.current) {
              clearTimeout(cellEditBlurTimer.current)
              cellEditBlurTimer.current = null
            }
            cellEditDraftRef.current = null
            setEditingCell(null)
            saveCellEdit(ticket, colLabel, val)
          }}
          onClose={() => {
            discardCellEdit()
          }}
        />,
        colLabel,
      )
    }

    if (colLabel === 'INSTALLER') {
      // Strict dropdown once this ticket's own schedule date reaches the technician-account
      // rollout — resolves real branchEmployees accounts instead of typing freely. Tickets
      // scheduled before the rollout date still fall back to the free-text roster input below.
      const dropdownActiveForTicket = isTechnicianDropdownActiveForTicket(ticket)
      if (dropdownActiveForTicket) {
        const ticketBranchId = resolveTicketScheduleBranchId(ticket, installerLineupIndex, driverOnlyNames) || activeBranchId
        const techOptions = techniciansForBranch(ticketBranchId)
        const current = editingCell.value
        const currentLower = current.trim().toLowerCase()
        const matchedOption = currentLower
          ? techOptions.find(t => {
              const nameLower = t.name.toLowerCase()
              return nameLower === currentLower || nameLower.includes(currentLower) || currentLower.includes(nameLower)
            })
          : undefined
        const selectValue = matchedOption ? matchedOption.name : current

        const dropdownOptions: DropdownOption[] = techOptions.map(t => {
          const emp = branchEmployees.find(e => e.id === t.id || (e.name && e.name.toLowerCase() === t.name.toLowerCase()))
          const fullName = (emp?.name || t.name || '').trim()
          const nick = (emp?.nickname || '').trim().toUpperCase()
          const firstName = fullName.split(/\s+/)[0]?.toUpperCase()
          const cleanLabel = nick || firstName || fullName.toUpperCase()
          const branchName = getBranchDisplayName(t.branchId || emp?.branchId || null)
          return {
            id: t.id,
            value: t.name,
            label: cleanLabel,
            subLabel: fullName !== cleanLabel ? fullName : undefined,
            badge: branchName ? branchName.toUpperCase() : undefined,
          }
        })

        if (current && !matchedOption && !techOptions.some(t => t.name === current)) {
          dropdownOptions.push({
            id: 'custom-tech-current',
            value: current,
            label: current.toUpperCase(),
          })
        }

        return wrapEditingCell(
          <TableCustomSelectDropdown
            value={selectValue}
            options={dropdownOptions}
            placeholder={isTaguigServices ? 'Select technician…' : 'Select installer…'}
            searchPlaceholder={isTaguigServices ? 'Search technician…' : 'Search installer…'}
            emptyLabel={isTaguigServices ? 'No technicians found' : 'No installers found'}
            clearLabel={isTaguigServices ? '— Clear Technician —' : '— Clear Installer —'}
            isLight={isLight}
            isSaving={isSaving}
            onSelect={(val) => {
              if (cellEditBlurTimer.current) {
                clearTimeout(cellEditBlurTimer.current)
                cellEditBlurTimer.current = null
              }
              cellEditDraftRef.current = null
              setEditingCell(null)
              saveCellEdit(ticket, colLabel, val)
            }}
            onClose={() => {
              discardCellEdit()
            }}
          />,
          colLabel,
        )
      }

      const roster = rosterForTicket(ticket)
      const listId = `ticket-roster-${ticket.id}-INSTALLER`
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
            placeholder="Select or type installer…"
          />
          <datalist id={listId}>
            {roster.installers.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>,
        colLabel,
      )
    }

    if (colLabel === 'SERVICE' && !isMyTickets) {
      const roster = rosterForTicket(ticket)
      const options = roster.drivers
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
            placeholder="Select or type driver…"
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

    if (colLabel === 'VEHICLE' && !isMyTickets) {
      const listId = `ticket-roster-${ticket.id}-${colLabel}`
      return wrapEditingCell(
        <>
          <input
            autoFocus
            disabled={isSaving}
            type="text"
            list={listId}
            value={editingCell.value}
            onChange={e => syncDraftValue(e.target.value.toUpperCase())}
            onBlur={onBlur}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={onKeyDown}
            className="w-full rounded-md outline-none uppercase font-bold"
            style={{ ...inputStyle, textTransform: 'uppercase' }}
            placeholder="Type vehicle code…"
          />
          <datalist id={listId}>
            {availableVehicles.map(name => (
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
          className={`w-full resize-y rounded-md outline-none ${colLabel === 'UPDATE' ? 'uppercase' : ''}`}
          style={{ ...inputStyle, minHeight: 52, maxHeight: 110, textTransform: colLabel === 'UPDATE' ? 'uppercase' : undefined }}
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
    allowGhostEdit?: boolean,
  ) {
    if (!canEdit || isTicketClosed(ticket) || isCellLockedForInline(ticket, colLabel) || (rowGhost && !allowGhostEdit)) return content
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

  function renderCell(ticket: Ticket, col: (typeof columns)[0], idx?: number, rowGhost?: boolean, ghostKind?: ScheduleGhostKind, cellExpanded = false) {
    const { label } = col
    const rowIndex = idx ?? visible.findIndex(t => t.id === ticket.id)

    const inlineEditor = renderInlineCellEditor(ticket, label, rowIndex >= 0 ? rowIndex : undefined, rowGhost)
    if (inlineEditor) return inlineEditor

    // ─────────────────────────────────────────────────────────────
    const val = getCellDisplay(ticket, label)
    // The expanded popover sits on a plain card, so it must never use the white-on-red row styling.
    const isPendingRow = !cellExpanded && isOverduePendingScheduleTicket(ticket, rowGhost ? 'ghost' : null, dateFilter)
    const ghostMuted = isPendingRow
      ? '#ffffff'
      : (rowGhost
        ? (ghostKind === 'completed' ? (isLight ? '#166534' : '#86efac')
          : ghostKind === 'resched' ? (isLight ? '#a16207' : '#fbbf24')
            : ghostKind === 'cancelled' ? (isLight ? '#dc2626' : '#f87171')
              : ghostKind === 'continuation' ? (isLight ? '#7c3aed' : '#c084fc')
                : textMuted)
        : textPrimary)
    const showExpanded = cellExpanded
    const truncStyle: React.CSSProperties = showExpanded
      ? { wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45, display: 'block', paddingRight: '4px', color: ghostMuted, opacity: rowGhost ? 0.72 : 1, textTransform: label !== 'UPDATE' ? 'uppercase' : undefined }
      : { overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%', lineHeight: 1.3, color: ghostMuted, opacity: rowGhost ? 0.72 : 1, textTransform: label !== 'UPDATE' ? 'uppercase' : undefined }

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
        <AutoFitText
          text={district || EMPTY_CELL}
          title={fullAddress}
          style={{ color: ghostMuted, opacity: rowGhost ? 0.72 : 1, textTransform: 'uppercase' }}
        />,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'DLR') {
      const isDealerEmpty = !val || val === '—' || val === EMPTY_CELL
      if (isDealerEmpty) {
        return withEditPencil(
          <span style={{ ...truncStyle, color: isPendingRow ? '#FDE047' : (isLight ? '#D97706' : '#FACC15'), fontWeight: 700 }} title="N/A">
            N/A
          </span>,
          ticket, label, rowGhost, rowIndex,
        )
      }
      return withEditPencil(
        showExpanded ? (
          <span style={truncStyle} title={val}>{val}</span>
        ) : (
          <AutoFitText text={val} title={val} style={{ color: ghostMuted, opacity: rowGhost ? 0.72 : 1, textTransform: 'uppercase' }} />
        ),
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'BRAND') {
      const isBrandEmpty = !val || val === '—' || val === EMPTY_CELL
      if (isBrandEmpty) {
        return withEditPencil(
          <span style={{ ...truncStyle, color: isPendingRow ? '#FDE047' : (isLight ? '#D97706' : '#FACC15'), fontWeight: 700 }} title="N/A">
            N/A
          </span>,
          ticket, label, rowGhost, rowIndex,
        )
      }
      return withEditPencil(
        showExpanded ? (
          <span style={truncStyle} title={val}>{val}</span>
        ) : (
          <AutoFitText text={val} title={val} style={{ color: ghostMuted, opacity: rowGhost ? 0.72 : 1, textTransform: 'uppercase' }} />
        ),
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
          if (outcome === 'DONE_MOUNTING') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#0284c7' : '#38bdf8' }} title="Done Mounting">
                DONE MOUNTING
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
          if (outcome === 'DONE_RELOCATED') {
            return (
              <span style={{ ...truncStyle, fontWeight: 700, color: isLight ? '#c2410c' : '#fb923c' }} title="Done Relocated">
                DONE RELOCATED
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
        if (ghostKind === 'historical') {
          const statusVal = getScheduleStatusValue(ticket)
          const statusColor = getScheduleStatusBadgeStyle(statusVal, isLight, isPendingRow).color
          const display = getScheduleStatusDisplay(ticket) || EMPTY_CELL
          let displayLabel = display === 'INSTALLATION' ? 'INSTALL' : ((display === 'FOR APPROVAL' || display === 'FOR QUOTATION') ? 'QUOTATION' : display)
          if (display === 'CONTINUATION') {
            displayLabel = 'CONT'
          }
          return (
            <span
              style={{
                ...truncStyle,
                fontWeight: 700,
                color: statusColor,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
              title={`Historical Record — ${display}`}
            >
              {displayLabel}
            </span>
          )
        }
        if (ghostKind === 'continuation') {
          return (
            <span style={{ ...truncStyle, fontWeight: 700, fontStyle: 'italic', color: isLight ? '#7c3aed' : '#c084fc' }} title="Continuation">
              CONTINUATION
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
      const statusColor = getScheduleStatusBadgeStyle(statusVal, isLight, isPendingRow).color
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
      const rowClosed = isTicketClosed(ticket)
      const closedStamp = rowClosed ? getClosedStamp(ticket) : null
      const statusTitle = rowClosed
        ? `${display} ${EMPTY_CELL} Closed${closedStamp?.by ? ` by ${closedStamp.by}` : ''}${closedStamp?.at ? ` on ${closedStamp.at}` : ''}`
        : showsDetails
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
      const ticketNoColor = isPendingRow ? '#ffffff' : (rowGhost ? ghostMuted : textPrimary)
      const indexColor = isPendingRow ? '#ffffff' : (isLight ? '#94a3b8' : '#64748b')
      return (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }} title={rawVal}>
          {idx !== undefined && (
            <span style={{ color: indexColor, marginRight: 6, flexShrink: 0, fontWeight: 700, fontSize: '0.7rem' }}>
              {idx + 1}.
            </span>
          )}
          <span style={{ ...truncStyle, fontWeight: 900, letterSpacing: '0.05em', color: ticketNoColor }}>
            {rawVal}
          </span>
          {isRowSaving && (
            <Loader2
              className="w-3 h-3 shrink-0 animate-spin"
              style={{ color: '#ffffff', marginLeft: 4 }}
              aria-label="Saving"
            />
          )}
        </div>
      )
    }

    if (label === 'FINAL DATE') {
      const hasDate = Boolean(val)
      if (!hasDate && canEdit && !rowGhost && !isTicketClosed(ticket)) {
        return (
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); startCellEdit(ticket, label, e.currentTarget as HTMLElement, rowIndex) }}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-extrabold uppercase tracking-wider transition-colors duration-150 active:scale-95 shadow-sm"
            style={{
              color: isPendingRow ? '#ffffff' : (isLight ? '#15803D' : '#6EE7B7'),
              borderColor: isPendingRow ? 'rgba(255,255,255,0.45)' : (isLight ? 'rgba(22,163,74,0.30)' : 'rgba(110,231,183,0.30)'),
              backgroundColor: isPendingRow ? 'rgba(255,255,255,0.18)' : (isLight ? 'rgba(22,163,74,0.10)' : 'rgba(110,231,183,0.12)'),
              borderStyle: 'solid',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isPendingRow ? 'rgba(255,255,255,0.30)' : (isLight ? 'rgba(22,163,74,0.18)' : 'rgba(110,231,183,0.22)')
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isPendingRow ? 'rgba(255,255,255,0.18)' : (isLight ? 'rgba(22,163,74,0.10)' : 'rgba(110,231,183,0.12)')
            }}
          >
            <CalendarDays className="w-3 h-3 shrink-0 opacity-90" />
            Add Date
          </button>
        )
      }
      const finalDateColor = isPendingRow ? '#ffffff' : (hasDate ? green : (isLight ? '#D97706' : '#FACC15'))
      return withEditPencil(
        <span
          style={{
            ...truncStyle,
            fontWeight: hasDate ? 700 : 700,
            color: finalDateColor,
          }}
          title={val}
        >
          {val || 'N/A'}
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
      const isDriverEmpty = !driverName || driverName === EMPTY_CELL || driverName === '—'
      return withEditPencil(
        <span
          className="block w-full text-center font-bold tracking-wide uppercase leading-tight"
          style={{ color: isDriverEmpty ? (isPendingRow ? '#FDE047' : (isLight ? '#D97706' : '#FACC15')) : ghostMuted, opacity: rowGhost ? 0.72 : 1 }}
          title={driverName}
        >
          {isDriverEmpty ? 'N/A' : driverName}
        </span>,
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'VEHICLE' && !isMyTickets) {
      // Prefer auto trip label ("STRADA - 2") so the red number always matches table ordering.
      const vehicleCode = vehicleTripLabels.get(ticket.id || '') || getTicketVehicleDisplay(displayTicket(ticket)) || val
      const canDragVehicle = canEdit && !rowGhost && !isTicketClosed(ticket) && Boolean(vehicleCode)
      // "MIRAGE - 2" splits into a plain name and a red trip number that live-updates as the
      // ticket's position in its vehicle group changes (drag-and-drop) — never manually typed.
      const parsedVehicle = parseNameSiteToken(vehicleCode)
      // .label keeps full crew/vehicle text and strips only the "- N" trip suffix
      const vehicleBaseName = parsedVehicle.label || vehicleCode
      const vehicleTripNumber = parsedVehicle.site === Number.MAX_SAFE_INTEGER ? '' : String(parsedVehicle.site)
      if (!vehicleCode) {
        return withEditPencil(
          <span
            className="block w-full text-center font-bold tracking-wide uppercase leading-tight rounded"
            style={{ color: isPendingRow ? '#FDE047' : (isLight ? '#D97706' : '#FACC15'), opacity: rowGhost ? 0.72 : 1 }}
          >
            N/A
          </span>,
          ticket, label, rowGhost, rowIndex,
        )
      }
      return withEditPencil(
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
        />,
        ticket, label, rowGhost, rowIndex,
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
          : ghostKind === 'cancelled' ? (isLight ? '#dc2626' : '#f87171')
            : ghostKind === 'continuation' ? (isLight ? '#7c3aed' : '#c084fc') : (isLight ? '#a16207' : '#fbbf24')
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

      // Always show as a clickable button for REMARKS
      const hasRemarks = Boolean(remarksText && remarksText.trim())
      
      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            // Open the Git-style history modal
            setHistoryGraphModal({ ticket, isOpen: true })
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          className="w-full max-w-full h-full min-h-[28px] px-3 py-2 rounded-md text-xs font-semibold transition-all hover:opacity-80 cursor-pointer flex items-center justify-center text-center"
          style={{
            backgroundColor: hasRemarks 
              ? (isLight ? '#dcfce7' : 'rgba(34, 197, 94, 0.15)')
              : (isLight ? '#f1f5f9' : 'rgba(148, 163, 184, 0.1)'),
            border: `1px solid ${hasRemarks 
              ? (isLight ? '#16a34a' : 'rgba(34, 197, 94, 0.3)')
              : (isLight ? '#e2e8f0' : 'rgba(148, 163, 184, 0.2)')}`,
            color: hasRemarks 
              ? (isLight ? '#166534' : '#22c55e')
              : textMuted,
          }}
          title={hasRemarks ? `Click to view history: ${remarksText}` : 'Click to view history'}
        >
          <span className="block min-w-0 w-full overflow-hidden whitespace-nowrap" style={{ textOverflow: 'clip' }}>
            {hasRemarks ? remarksText : 'View History'}
          </span>
        </button>
      )
    }

    if (label === 'PAYMENT') {
      if (shouldBlankReschedGhostPayment(dateFilter, ghostKind)) {
        return <span style={{ ...truncStyle, color: isPendingRow ? '#ffffff' : textMuted }}>{EMPTY_CELL}</span>
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
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: isPendingRow ? 'rgba(255,255,255,0.8)' : textMuted }}>Payment</div>
            {!combined ? (
              <div style={{ color: isPendingRow ? 'rgba(255,255,255,0.7)' : textMuted }}>{EMPTY_CELL}</div>
            ) : mode === 'FREE' || mode === 'FREE INSTALL' ? (
              <div style={{ fontWeight: 700, color: isPendingRow ? '#ffffff' : textPrimary }}>FREE</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {mode ? (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: isPendingRow ? 'rgba(255,255,255,0.8)' : textMuted }}>Mode </span>
                    <span style={{ fontWeight: 600, color: isPendingRow ? '#ffffff' : textPrimary }}>{mode}</span>
                  </div>
                ) : null}
                {amountStr ? (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: isPendingRow ? 'rgba(255,255,255,0.8)' : textMuted }}>Amount </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isPendingRow ? '#ffffff' : textPrimary }}>{amountStr}</span>
                  </div>
                ) : null}
                {isHybrid && breakdown.length ? (
                  <div className="flex flex-col gap-0.5">
                    {breakdown.map((entry, i) => (
                      <div key={`${entry.mode}-${i}`} className="text-[10.5px]" style={{ color: isPendingRow ? 'rgba(255,255,255,0.8)' : textMuted }}>
                        {entry.mode} <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isPendingRow ? '#ffffff' : textPrimary }}>₱{Math.round(entry.amount).toLocaleString('en-PH')}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            {canEdit && !rowGhost && !isTicketClosed(ticket) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedCell(null)
                  openUpdatePaymentPrompt(ticket)
                }}
                className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:scale-105"
                style={{ backgroundColor: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981' }}
              >
                Update Payment
              </button>
            )}
          </>
        )
      }
      if (!combined || combined === '0') {
        return <span style={{ ...truncStyle, fontWeight: 700, color: isPendingRow ? '#ffffff' : textMuted }} title="0">0</span>
      }
      if (mode === 'FREE' || mode === 'FREE INSTALL') {
        return (
          <span style={{ ...truncStyle, fontWeight: 700, color: isPendingRow ? '#ffffff' : (isLight ? '#0f172a' : '#f1f5f9') }} title={combined}>
            FREE
          </span>
        )
      }
      return (
        <span style={{ ...truncStyle, fontVariantNumeric: 'tabular-nums' }} title={combined}>
          {amountStr ? (
            <span style={{ fontWeight: 700, color: isPendingRow ? '#ffffff' : (isLight ? '#0f172a' : '#f1f5f9') }}>{amountStr}</span>
          ) : null}
          {mode && amountStr ? ' ' : null}
          {mode && (
            <span style={{ fontWeight: 600, color: isPendingRow ? '#ffffff' : (isLight ? '#475569' : '#94a3b8'), letterSpacing: '0.03em' }}>
              {mode}
            </span>
          )}
          {isHybrid && breakdownStr ? (
            <span style={{ fontWeight: 500, color: isPendingRow ? 'rgba(255,255,255,0.9)' : textMuted, marginLeft: 4 }}>
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

    if (label === 'COMMIT') {
      const commitVal = (val || '').trim()
      if (!commitVal && canEdit && !isMyTickets && !rowGhost && !isTicketClosed(ticket) && !isCellLockedForInline(ticket, label)) {
        return (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={e => {
              e.stopPropagation()
              const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
              startCellEdit(ticket, label, cell, rowIndex)
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-extrabold uppercase tracking-wider transition-colors duration-150 active:scale-95 shadow-sm"
            style={{
              color: isPendingRow ? '#ffffff' : (isLight ? '#15803d' : '#4ade80'),
              backgroundColor: isPendingRow ? 'rgba(255, 255, 255, 0.18)' : (isLight ? 'rgba(22, 163, 74, 0.10)' : 'rgba(74, 222, 128, 0.12)'),
              border: `1px solid ${isPendingRow ? 'rgba(255, 255, 255, 0.45)' : (isLight ? 'rgba(22, 163, 74, 0.30)' : 'rgba(74, 222, 128, 0.30)')}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isPendingRow ? 'rgba(255, 255, 255, 0.30)' : (isLight ? 'rgba(22, 163, 74, 0.18)' : 'rgba(74, 222, 128, 0.22)')
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isPendingRow ? 'rgba(255, 255, 255, 0.18)' : (isLight ? 'rgba(22, 163, 74, 0.10)' : 'rgba(74, 222, 128, 0.12)')
            }}
          >
            <Plus className="w-3 h-3 stroke-[2.5] shrink-0 opacity-90" />
            Add
          </button>
        )
      }
      return withEditPencil(
        showExpanded ? (
          <span style={{ ...truncStyle, fontWeight: 600 }} title={commitVal || undefined}>
            {commitVal || EMPTY_CELL}
          </span>
        ) : (
          <AutoFitText
            text={commitVal || EMPTY_CELL}
            title={commitVal || undefined}
            style={{ fontWeight: 600, color: ghostMuted, opacity: rowGhost ? 0.72 : 1, textTransform: 'uppercase' }}
          />
        ),
        ticket, label, rowGhost, rowIndex,
      )
    }

    if (label === 'INSTALLER') {
      const rawInstaller = getInstallerDisplay(displayTicket(ticket), branchEmployees, activeBranchId)
      const isEmpty = !rawInstaller

      const prevInstaller = idx != null && idx > 0
        ? getInstallerDisplay(displayTicket(visible[idx - 1]), branchEmployees, activeBranchId)
        : ''
      const curToken = parseNameSiteToken(rawInstaller)
      const prevToken = parseNameSiteToken(prevInstaller)
      const isNewInstallerGroup = idx != null && idx > 0 && curToken.name && prevToken.name && curToken.name !== prevToken.name

      if (isEmpty) {
        if (canEdit && !isMyTickets && !rowGhost && !isTicketClosed(ticket)) {
          return (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
              onClick={e => {
                e.stopPropagation()
                const cell = (e.currentTarget.closest('[data-cell-key]') as HTMLElement | null)
                startCellEdit(ticket, label, cell, rowIndex)
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-extrabold uppercase tracking-wider transition-colors duration-150 active:scale-95 shadow-sm"
              style={{
                color: isPendingRow ? '#ffffff' : (isLight ? '#15803d' : '#4ade80'),
                backgroundColor: isPendingRow ? 'rgba(255, 255, 255, 0.18)' : (isLight ? 'rgba(22, 163, 74, 0.10)' : 'rgba(74, 222, 128, 0.12)'),
                border: `1px solid ${isPendingRow ? 'rgba(255, 255, 255, 0.45)' : (isLight ? 'rgba(22, 163, 74, 0.30)' : 'rgba(74, 222, 128, 0.30)')}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isPendingRow ? 'rgba(255, 255, 255, 0.30)' : (isLight ? 'rgba(22, 163, 74, 0.18)' : 'rgba(74, 222, 128, 0.22)')
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isPendingRow ? 'rgba(255, 255, 255, 0.18)' : (isLight ? 'rgba(22, 163, 74, 0.10)' : 'rgba(74, 222, 128, 0.12)')
              }}
            >
              <Plus className="w-3 h-3 stroke-[2.5] shrink-0 opacity-90" />
              Add
            </button>
          )
        }
        // No hover pencil — a single click opens the dropdown picker directly.
        return (
          <span style={{ ...truncStyle, color: textMuted }} title="No Installer">
            {EMPTY_CELL}
          </span>
        )
      }

      // Use .label (strips "- N" trip suffix) not .name — .name also chops "MANNY / ROMAR" to "MANNY".
      const fullDisplayInstaller = curToken.label || rawInstaller
      // Show nickname if set on their account, otherwise first name only — full name stays
      // in the tooltip and everywhere the raw value is used (edit seeding, payroll, etc).
      const displayInstaller = formatInstallerShortDisplay(fullDisplayInstaller)
      // No hover pencil — a single click opens the dropdown picker directly.
      return (
        <span
          style={{
            ...truncStyle,
            display: 'block',
            borderTop: isNewInstallerGroup ? `2px solid ${isLight ? '#d1d5db' : '#475569'}` : undefined,
            paddingTop: isNewInstallerGroup ? 8 : 0,
            marginTop: isNewInstallerGroup ? 4 : 0,
          }}
          title={fullDisplayInstaller}
        >
          {displayInstaller}
        </span>
      )
    }

    if (label === 'NEGOTIATOR') {
      const negName = getTicketNegotiatorName(ticket, branchEmployees) || EMPTY_CELL
      const isNegEmpty = !negName || negName === EMPTY_CELL || negName === '—'
      const negTarget = ticket.negotiatorId || ticket.negotiator_id || resolveNegotiatorDisplayName(ticket, branchEmployees) || negName
      // No hover pencil — a single click opens the dropdown picker directly.
      return (
        <div className="flex flex-col items-center justify-center text-center">
          <span style={{ ...truncStyle, fontWeight: isNegEmpty ? 700 : 600, color: isNegEmpty ? (isPendingRow ? '#FDE047' : (isLight ? '#D97706' : '#FACC15')) : (isPendingRow ? '#ffffff' : undefined) }} title={negName}>
            {!isNegEmpty ? <EmployeeNameLink nameOrId={negTarget} displayText={negName} /> : 'N/A'}
          </span>
        </div>
      )
    }

    const isValEmpty = !val || val === '—' || val === '\u2014' || val === EMPTY_CELL
    if (isValEmpty) {
      return withEditPencil(
        <span style={{ ...truncStyle, color: isPendingRow ? '#FDE047' : (isLight ? '#D97706' : '#FACC15'), fontWeight: 700 }} title="N/A">
          N/A
        </span>,
        ticket, label, rowGhost,
      )
    }

    return withEditPencil(
      <span style={truncStyle} title={val}>{val}</span>,
      ticket, label, rowGhost,
    )
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-auto" onClick={() => {
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
      {isMyTickets && (
        <MyTicketsToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isAdmin={isAdmin}
          user={user}
          formatNegotiatorLabel={formatNegotiatorLabel}
          myTicketsNegotiatorFilter={myTicketsNegotiatorFilter}
          setMyTicketsNegotiatorFilter={setMyTicketsNegotiatorFilter}
          myTicketsNegotiatorOptions={myTicketsNegotiatorOptions}
          myTicketsStatusFilter={myTicketsStatusFilter}
          setMyTicketsStatusFilter={setMyTicketsStatusFilter}
          myTicketsMonthFilter={myTicketsMonthFilter}
          setMyTicketsMonthFilter={setMyTicketsMonthFilter}
          onOpenFilterModal={() => setMyTicketsFilterModalOpen(true)}
          onExportExcel={handleExportExcel}
          canExport={visible.length > 0}
          isLight={isLight}
          border={border}
          inputBg={inputBg}
          inputBorder={inputBorder}
          textPrimary={textPrimary}
          textMuted={textMuted}
          green={green}
        />
      )}

      {/* Portal: Toolbar into header slot */}
      {!isMyTickets && activeTab !== 'overview' && (
        <SchedulesToolbar
          dateFilter={dateFilter}
          handleDateFilterChange={handleDateFilterChange}
          todayDateKeyStr={todayDateKey()}
          isReadOnlySchedule={isReadOnlySchedule}
          weeklyTabs={weeklyTabs}
          isCustomSelected={isCustomSelected}
          onOpenCustomDatePicker={() => {
            // null = let the picker open on the selected date's month, not wherever it was last browsed
            setCustomDateCalMonth(null)
            setCustomDatePickerOpen(true)
          }}
          monthViewActive={monthViewActive}
          monthFilterStatus={monthFilterStatus}
          monthFilterNegotiatorId={monthFilterNegotiatorId}
          monthFilterMonth={monthFilterMonth}
          onOpenMonthFilterModal={() => setMonthFilterModalOpen(true)}
          canEdit={canEdit}
          onOpenBulkAssign={() => setBulkAssignOpen(true)}
          hiddenColumnItems={hiddenColumnItems}
          onShowColumn={(label) => updateHiddenCols(prev => prev.filter(c => c !== label))}
          onShowAllColumns={() => updateHiddenCols(() => [])}
          showcaseOpen={showcaseOpen}
          onToggleShowcase={() => {
            persistSchedulesSnapshot()
            setShowcaseOpen(prev => !prev)
          }}
          onCloseShowcase={() => setShowcaseOpen(false)}
          tableBorder={tableBorder}
          inputBg={inputBg}
          inputBorder={inputBorder}
          textPrimary={textPrimary}
          textMuted={textMuted}
          green={green}
          isLight={isLight}
        />
      )}

      {/* Month view banner — lets the user see & explicitly exit the whole-month table view */}
      {!isMyTickets && monthViewActive && (
        <MonthViewBanner
          monthFilterMonth={monthFilterMonth}
          activeBranchLabel={activeBranchLabel}
          monthFilterNegotiatorId={monthFilterNegotiatorId}
          monthFilterNegotiatorOptions={monthFilterNegotiatorOptions}
          formatNegotiatorLabel={formatNegotiatorLabel}
          monthFilterStatus={monthFilterStatus}
          visibleCount={visible.length}
          onExitMonthView={() => setMonthViewActive(false)}
          green={green}
          border={border}
        />
      )}

      {/* Sort reset strip — replaces the old stats bar */}
      {!isMyTickets && activeTab === 'schedules' && sortDiffersFromDefault && (
        <SortResetStrip
          onResetSort={() => setSortConfig(defaultSortForSchedulesView(isMyTickets))}
          cardBg={cardBg}
          border={border}
          green={green}
        />
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
      <div className={`flex flex-col flex-1 min-h-0 overflow-hidden${activeTab === 'overview' ? '' : ' md:mx-4 md:mt-4 md:mb-4 md:rounded-xl md:border shadow-sm'}`}
        style={activeTab === 'overview' ? undefined : { backgroundColor: cardBg, borderColor: border }}
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
                className="flex-1 min-h-0 overflow-y-auto overflow-x-auto"
                data-ticket-table-scroll
                style={{
                  paddingBottom: activeCellOverlay ? 72 : 12,
                }}
              >
                <table
                  key={dateFilter || 'all'}
                  className="text-xs hidden md:table"
                  style={{
                    width: `${Math.max(totalTableWidth, 1400)}px`,
                    minWidth: '100%',
                    tableLayout: 'fixed',
                    borderCollapse: 'collapse',
                  }}
                >
                  <TicketsTableHeader
                    columns={columns}
                    isMyTickets={isMyTickets}
                    isLight={isLight}
                    sortConfig={sortConfig}
                    handleColumnSort={handleColumnSort}
                    setColHeaderMenu={setColHeaderMenu}
                    toggleCol={toggleCol}
                    expandedCols={expandedCols}
                    startColResize={startColResize}
                    resetColWidth={(colLabel) => {
                      const defW = DEFAULT_COL_WIDTHS[colLabel] || 120
                      setCustomColWidths(prev => {
                        const next = { ...prev, [colLabel]: defW }
                        try { localStorage.setItem('ashcol_schedule_col_widths_v2', JSON.stringify(next)) } catch {}
                        return next
                      })
                    }}
                    myTicketsTheadBg={myTicketsTheadBg}
                    schedTheadBg={schedTheadBg}
                    myTicketsTheadText={myTicketsTheadText}
                    schedTheadText={schedTheadText}
                    myTicketsTheadBorder={myTicketsTheadBorder}
                    schedTheadBorder={schedTheadBorder}
                    green={green}
                  />
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
                        <td colSpan={columns.length} style={{ height: '60vh', borderBottom: 'none', verticalAlign: 'middle' }}>
                          {(syncing || backgroundSyncing) && !searchQuery ? (
                            <div className="flex flex-col items-center justify-center gap-2 animate-in fade-in duration-200">
                              <Loader2 className="w-8 h-8 animate-spin" style={{ color: green }} />
                              <p className="text-sm font-bold tracking-wide" style={{ color: textMuted }}>
                                Syncing with portal database...
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-12 mx-auto max-w-lg rounded-2xl border-2 border-dashed transition-all"
                                 style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', borderColor: isLight ? '#e2e8f0' : '#1E293B' }}>
                              <CalendarDays className="w-12 h-12 mb-4 opacity-20" style={{ color: textMuted }} />
                              <p className="text-sm font-bold text-center" style={{ color: textPrimary }}>
                                {isMyTickets
                                  ? (searchQuery ? 'No pending or assigned tickets match your search.' : 'No pending or assigned tickets found.')
                                  : tickets.length > 0
                                    ? 'No tickets match this date or branch view.'
                                    : fetchError
                                      ? 'Could not load schedules. Please click Retry.'
                                      : 'No records scheduled for this date.'}
                              </p>
                              {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="mt-4 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all active:scale-95 shadow-md" style={{ backgroundColor: green }}>
                                  Clear Search
                                </button>
                              )}
                            </div>
                          )}
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
                        const hoverBg = rowColors.hoverBg || rowHover
                        const bg = isDropTargetRow ? dropTargetBg : (isHovered ? hoverBg : baseBg)
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
                            {columns.map((col, colIdx) => {
                              const isLastCol = colIdx === columns.length - 1
                              const isEditingCell = editingCell?.ticketId === ticket.id
                                && editingCell?.rowIndex === idx
                                && editingCell?.colLabel === col.label
                              const isExpandedCell = expandedCell?.ticketId === ticket.id && expandedCell?.colLabel === col.label
                              const isStatusCol = col.label === 'STATUS'
                              const SKIP_EMPTY_HIGHLIGHT = new Set(['STATUS', 'INSTALLER', 'SERVICE', 'VEHICLE', 'COMMIT', 'NOTE', 'UPDATE', 'PAYMENT', 'TICKET NO', 'FINAL DATE'])
                              const cellVal = getCellDisplay(ticket, col.label)
                              const isCellEmpty = !SKIP_EMPTY_HIGHLIGHT.has(col.label) && !isGhost && !isEditingCell && !cellVal.trim()
                              const isColoredRow = Boolean(rowColors.hoverBg)
                              // Quiet empty hint — no orange wash; subtle slate so dark mode stays clean.
                              const emptyCellBg = (isCellEmpty && !isColoredRow)
                                ? (isLight ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.07)')
                                : undefined
                              const emptyCellInset = (isCellEmpty && !isColoredRow)
                                ? `inset 0 0 0 1px ${isLight ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.18)'}`
                                : undefined
                              const isSelectedVehicleCell = col.label === 'VEHICLE' && selectedVehicleTicketId === ticket.id && !isEditingCell
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
                                    if (col.label === 'VEHICLE') {
                                      const hasVehicle = Boolean(vehicleTripLabels.get(ticket.id || '') || getTicketVehicleDisplay(displayTicket(ticket)))
                                      if (canEdit && !isGhost && !isTicketClosed(ticket) && !hasVehicle) {
                                        startCellEdit(ticket, col.label, e.currentTarget as HTMLElement, idx)
                                        return
                                      }
                                      setSelectedVehicleTicketId(prev => (prev === ticket.id ? null : ticket.id))
                                      return
                                    }
                                    if (col.label === 'TICKET NO') return
                                    // Closed tickets: COMMIT and UPDATE cells are strictly read-only and unclickable
                                    if (isTicketClosed(ticket) && (col.label === 'COMMIT' || col.label === 'UPDATE')) return
                                    // INSTALLER/NEGOTIATOR are strict dropdown pickers — a single
                                    // click should open the dropdown directly, not a view-popup
                                    // with a separate pencil button to get to the picker.
                                    if ((col.label === 'INSTALLER' || col.label === 'NEGOTIATOR') && canEdit && !isGhost && !isTicketClosed(ticket)) {
                                      startCellEdit(ticket, col.label, e.currentTarget as HTMLElement, idx)
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
                                    if (!canEdit || isTicketClosed(ticket) || isEditingCell || (isGhost && !allowGhostCellEdit)) return
                                    if (col.label === 'TICKET NO') return
                                    if (INLINE_EDIT_COLUMNS.has(col.label)) {
                                      startCellEdit(ticket, col.label, undefined, idx)
                                    }
                                  }}
                                  style={{
                                    padding: isEditingCell ? '6px' : '0 12px',
                                    color: isGhost ? textMuted : textPrimary,
                                    fontSize: '12.5px', fontWeight: isGhost ? 500 : 600,
                                    backgroundColor: isSelectedVehicleCell ? `${green}22` : (emptyCellBg ?? bg),
                                    borderBottom: `1px solid ${tableBorder}`,
                                    borderRight: isLastCol ? 'none' : `1px solid ${tableBorder}`,
                                    width: col.w,
                                    minWidth: col.w,
                                    maxWidth: col.w,
                                    height: isEditingCell ? 'auto' : TABLE_ROW_HEIGHT,
                                    maxHeight: isEditingCell ? undefined : TABLE_ROW_HEIGHT,
                                    overflow: 'hidden',
                                    textOverflow: 'clip',
                                    transition: isDropTargetRow ? 'background-color 1s ease' : 'background-color 0.1s ease',
                                    cursor: canEdit && !isTicketClosed(ticket) && (!isGhost || allowGhostCellEdit) && INLINE_EDIT_COLUMNS.has(col.label) && !isCellLockedForInline(ticket, col.label) ? 'text' : 'default',
                                    verticalAlign: 'middle',
                                    textAlign: col.align || 'left',
                                    userSelect: isEditingCell ? 'text' : (canEdit && !isTicketClosed(ticket) && (!isGhost || allowGhostCellEdit) ? 'none' : undefined),
                                    WebkitUserSelect: isEditingCell ? 'text' : (canEdit && !isTicketClosed(ticket) && (!isGhost || allowGhostCellEdit) ? 'none' : undefined),
                                    ...(col.sticky
                                      ? { position: 'sticky' as const, left: `${col.left}px`, zIndex: (isEditingCell || isExpandedCell) ? 95 : 5 }
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
                                    <div
                                      className={`relative w-full h-full flex items-center ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''
                                        }`}
                                      style={{ minHeight: TABLE_ROW_HEIGHT - 2 }}
                                    >
                                      <div className={`min-w-0 overflow-hidden ${col.align === 'center' && col.label !== 'VEHICLE' && !AUTOFIT_COLUMNS.has(col.label) ? 'w-auto max-w-full' : 'w-full'}`} style={{ textOverflow: 'clip' }}>
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
                    let totalForCollection = 0;
                    let totalCheque = 0;
                    let totalOther = 0;

                    visible.forEach(ticket => {
                      const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null;
                      if (shouldBlankReschedGhostPayment(dateFilter, ghostKind)) return;

                      const { mode: rawMode, amount } = resolveTicketPayment(ticket);

                      const categorize = (mode: string, amt: number) => {
                        const m = (mode || '').trim().toUpperCase();
                        if (m === 'CASH') totalCash += amt;
                        else if (m === 'GCASH') totalGcash += amt;
                        else if (m === 'BANK TRANSFER' || m === 'BANK_TRANSFER' || m === 'BANK' || m === 'ONLINE') totalBankTransfer += amt;
                        else if (m === 'FOR COLLECTION' || m === 'FOR_COLLECTION') totalForCollection += amt;
                        else if (m === 'CHEQUE' || m === 'CHECK' || m === 'CHECK PAYMENT' || m === 'CHECK_PAYMENT') totalCheque += amt;
                        else if (amt > 0) totalOther += amt;
                      };

                      if (rawMode === 'HYBRID') {
                        const breakdown = getPaymentBreakdown(ticket);
                        breakdown.forEach(entry => categorize(entry.mode, entry.amount || 0));
                      } else {
                        categorize(rawMode, amount);
                      }
                    });

                    const totalEstimated = totalCash + totalGcash + totalBankTransfer + totalForCollection + totalCheque + totalOther;
                    // Hide the green TOTAL COLLECTION footer when nothing has been paid yet.
                    if (totalEstimated <= 0) return null;

                    return (
                      <tfoot style={{ position: 'relative' }}>
                        <tr>
                          <td colSpan={columns.length - 2} style={{ border: 'none', background: 'transparent' }}></td>
                          <td className="px-3 py-2 text-right font-black" style={{ backgroundColor: '#15803d', color: '#fff', border: `1px solid ${tableBorder}` }}>
                            TOTAL COLLECTION
                          </td>
                          <td className="px-3 py-2 text-right font-black tracking-wide" style={{ backgroundColor: '#15803d', color: '#fff', border: `1px solid ${tableBorder}` }}>
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
                        {totalForCollection > 0 && (
                          <tr>
                            <td colSpan={columns.length - 2} style={{ border: 'none', background: 'transparent' }}></td>
                            <td className="px-3 py-2 text-right font-bold" style={{ backgroundColor: '#fef3c7', color: '#000', border: `1px solid ${tableBorder}` }}>
                              FOR COLLECTION
                            </td>
                            <td className="px-3 py-2 text-right font-bold tracking-wide" style={{ backgroundColor: '#fef3c7', color: '#000', border: `1px solid ${tableBorder}` }}>
                              {totalForCollection.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                        {totalCheque > 0 && (
                          <tr>
                            <td colSpan={columns.length - 2} style={{ border: 'none', background: 'transparent' }}></td>
                            <td className="px-3 py-2 text-right font-bold" style={{ backgroundColor: '#e0e7ff', color: '#000', border: `1px solid ${tableBorder}` }}>
                              CHEQUE
                            </td>
                            <td className="px-3 py-2 text-right font-bold tracking-wide" style={{ backgroundColor: '#e0e7ff', color: '#000', border: `1px solid ${tableBorder}` }}>
                              {totalCheque.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <TicketMobileCard
                  visible={visible}
                  dateFilter={dateFilter}
                  duplicateNameKeys={duplicateNameKeys}
                  isLight={isLight}
                  rowEven={rowEven}
                  rowOdd={rowOdd}
                  cardBg={cardBg}
                  border={border}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                  green={green}
                  branchEmployees={branchEmployees}
                  activeBranchId={activeBranchId}
                  user={user}
                  vehicleTripLabels={vehicleTripLabels}
                  canEdit={canEdit}
                  openStatusPicker={openStatusPicker}
                  setDetailTicket={setDetailTicket}
                  startCellEdit={startCellEdit}
                  setHistoryGraphModal={setHistoryGraphModal}
                  copyTextToClipboard={copyTextToClipboard}
                  showToast={showToast}
                />
              </div>
            </div>
          )) : (
          <OverviewSearchView
            isLight={isLight}
            cardBg={cardBg}
            border={border}
            green={green}
            textPrimary={textPrimary}
            textMuted={textMuted}
            inputBg={inputBg}
            inputBorder={inputBorder}
            overviewSearchInput={overviewSearchInput}
            setOverviewSearchInput={setOverviewSearchInput}
            overviewSearchFocused={overviewSearchFocused}
            setOverviewSearchFocused={setOverviewSearchFocused}
            overviewResults={overviewResults}
            setOverviewResults={setOverviewResults}
            overviewLoading={overviewLoading}
            overviewQuickLinks={overviewQuickLinks}
            navigate={navigate}
            branchEmployees={branchEmployees}
            activeBranchId={activeBranchId}
            user={user}
            formatAssignedBranchLabel={formatAssignedBranchLabel}
            resolveScopedBranchId={resolveScopedBranchId}
            setDetailTicket={setDetailTicket}
            setShowHistoryPanel={setShowHistoryPanel}
          />
        )}
      </div>

      {/* ── Right-click context menu ── */}
      {colHeaderMenu && (
        <ColumnHeaderContextMenu
          menu={colHeaderMenu}
          isLight={isLight}
          protectedColumn={PROTECTED_SCHEDULE_COLS.has(colHeaderMenu.label)}
          onHide={(label) => {
            updateHiddenCols(prev => (prev.includes(label) ? prev : [...prev, label]))
            showToast(`${columnDisplayName(label)} hidden — restore it from "Hidden" at the top`)
          }}
          onClose={() => setColHeaderMenu(null)}
        />
      )}

      <TicketContextMenu
        contextMenu={contextMenu}
        contextMenuRef={contextMenuRef}
        isLight={isLight}
        border={border}
        textPrimary={textPrimary}
        green={green}
        canEdit={canEdit}
        role={role}
        onViewDetails={t => { setDetailTicket(t); setContextMenu(null) }}
        onEditDetails={t => { openEditModal(t); setContextMenu(null) }}
      />

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Full Details Modal Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {detailTicket && (
        <TicketDetailsModal
          ticket={detailTicket}
          isLight={isLight}
          isMyTickets={isMyTickets}
          isTaguigServices={isTaguigServices}
          canEdit={canEdit && !isTicketLockedFor(detailTicket, role)}
          branchEmployees={branchEmployees}
          activeBranchId={activeBranchId}
          user={user}
          duplicateNameKeys={duplicateNameKeys}
          formatAssignedBranchLabel={formatAssignedBranchLabel}
          history={history}
          loadingHistory={loadingHistory}
          showHistoryPanel={showHistoryPanel}
          onClose={() => {
            setDetailTicket(null)
            setShowHistoryPanel(false)
            if (searchParams.get('ticket') || searchParams.get('id')) {
              const nextParams = new URLSearchParams(searchParams)
              nextParams.delete('ticket')
              nextParams.delete('id')
              setSearchParams(nextParams, { replace: true })
            }
          }}
          onToggleHistory={() => setShowHistoryPanel(prev => !prev)}
          onHideHistory={() => setShowHistoryPanel(false)}
          onOpenStatusPicker={(t, el) => openStatusPicker(t, 'inline', el)}
          onEdit={() => {
            openEditModal(detailTicket)
            setDetailTicket(null)
            setShowHistoryPanel(false)
            if (searchParams.get('ticket') || searchParams.get('id')) {
              const nextParams = new URLSearchParams(searchParams)
              nextParams.delete('ticket')
              nextParams.delete('id')
              setSearchParams(nextParams, { replace: true })
            }
          }}
          onDelete={isAdmin ? () => handleDelete(detailTicket.id) : undefined}
          onUpdateTicket={(updated) => {
            setDetailTicket(updated)
            setTickets(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)))
          }}
          onReopenTicket={reopenClosedTicket}
        />
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Status Picker Modal Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {statusPicker && (
        <TicketStatusPickerPopover
          picker={statusPicker}
          isLight={isLight}
          activeTab={activeTab}
          tickets={tickets}
          optimisticTickets={optimisticTicketsRef.current}
          canEditClosed={canEditClosedTicket(role)}
          onClose={() => setStatusPicker(null)}
          onOpenEditModal={openEditModal}
          onOpenReschedDialog={openReschedDialog}
          onOpenContinuationDialog={openContinuationDialog}
          onCloseTicket={requestCloseTicket}
          onCancelTicket={cancelTicketWithReason}
          onReopenTicket={(t, reason) => { void reopenClosedTicket(t, reason) }}
          onSaveCellEdit={(ticket, colLabel, value) => { void saveCellEdit(ticket, colLabel, value) }}
        />
      )}

      {closeDialogTicket && (
        <CloseTicketDialog
          ticket={closeDialogTicket}
          isLight={isLight}
          onClose={() => setCloseDialogTicket(null)}
          onConfirm={confirmCloseTicket}
          onFix={handleCloseDialogFix}
        />
      )}

      {scheduleDetailsPopup && (
        <TicketScheduleDetailsPopover
          popup={scheduleDetailsPopup}
          isLight={isLight}
          dateFilter={dateFilter}
          canChangeStatus={canEdit && (!isTicketClosed(scheduleDetailsPopup.ticket) || canEditClosedTicket(role))}
          onClose={() => setScheduleDetailsPopup(null)}
          onOpenStatusPicker={openStatusPicker}
          onViewDetails={(t) => setDetailTicket(t)}
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
      )}

      <AddTicketModal
        open={addModalOpen}
        onClose={requestCloseAddModal}
        activeBranchLabel={activeBranchLabel}
        addForm={addForm}
        setAddForm={setAddForm}
        guessDistrict={guessDistrict}
        relayCustomStores={relayCustomStores}
        handlePersistCustomStores={handlePersistCustomStores}
        activeBranchRoster={activeBranchRoster}
        isTaguigServices={isTaguigServices}
        addModalTechnicians={addModalTechnicians}
        addModalNegotiators={addModalNegotiators}
        formatNegotiatorLabel={formatNegotiatorLabel}
        promptSaveManualTicket={promptSaveManualTicket}
        isLight={isLight}
        cardBg={cardBg}
        border={border}
        textPrimary={textPrimary}
        textMuted={textMuted}
        inputBg={inputBg}
        inputBorder={inputBorder}
      />

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
          onRequestCloseTicket={editTicket ? saveThenRequestClose : undefined}
          closedLabel={editTicket && isTicketClosed(editTicket) ? getScheduleStatusLabel(getScheduleStatusValue(editTicket)) : undefined}
          driverRoster={editModalRoster.drivers}
          installerRoster={editModalRoster.installers}
          technicianOptions={editModalTechnicians}
          isTaguigServices={isTaguigServices}
          editOriginalDate={editOriginalDate ? formatDateKeyLabel(editOriginalDate) : ''}
          onClose={closeEditModal}
          onDelete={() => { if (editTicket?.id) { handleDelete(editTicket.id); closeEditModal() } }}
          onSave={handleUnifiedEditSave}
          onTicketPatched={(updated) => {
            const patched = updated as unknown as Ticket
            setEditTicket(prev => (prev ? { ...prev, ...patched } : prev))
            setTickets(prev => prev.map(t => (t.id === patched.id ? { ...t, ...patched } : t)))
          }}
          getTicketNumber={(t) => (t.ticketNumber || t.ticket_number || t.id || '')}
          parseAcDetails={(t) => { try { return t.acDetails ? JSON.parse(t.acDetails) : {} } catch { return {} } }}
          draftExtensions={{
            ticketNumber: editForm.ticketNumber || editTicket.ticketNumber || editTicket.ticket_number || '',
            ticketCategory: editForm.ticketCategory || inferCategoryFromTicket(editTicket),
            scheduleStatus: editForm.status || getScheduleStatusValue(editTicket),
            // Search/overview shows Preferred Date and Schedule Date as separate fields — don't
            // silently borrow the preferred date into Schedule Date here (unlike the Schedules
            // surface below, where that fallback is a useful suggestion). Otherwise both fields
            // display the same value before a real schedule date has been set, which reads as a bug.
            finalDate: editForm.finalDate || getFinalDateKey(editTicket) || '',
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
          onRequestCloseTicket={editTicket ? saveThenRequestClose : undefined}
          closedLabel={editTicket && isTicketClosed(editTicket) ? getScheduleStatusLabel(getScheduleStatusValue(editTicket)) : undefined}
          showDelete={canEdit}
          driverRoster={editModalRoster.drivers}
          installerRoster={editModalRoster.installers}
          technicianOptions={editModalTechnicians}
          isTaguigServices={isTaguigServices}
          editOriginalDate={editOriginalDate ? formatDateKeyLabel(editOriginalDate) : ''}
          onClose={requestCloseEditModal}
          onDelete={canEdit ? () => { if (editTicket?.id) { handleDelete(editTicket.id); closeEditModal() } } : undefined}
          onSave={handleUnifiedEditSave}
          onTicketPatched={(updated) => {
            const patched = updated as unknown as Ticket
            setEditTicket(prev => (prev ? { ...prev, ...patched } : prev))
            setTickets(prev => prev.map(t => (t.id === patched.id ? { ...t, ...patched } : t)))
          }}
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
        return (
          <ExpandedCellPopover
            expandedCell={expandedCell}
            expandedPopoverPos={expandedPopoverPos}
            ticket={ticket}
            columns={columns}
            idx={idx >= 0 ? idx : 0}
            isGhost={isGhost}
            ghostKind={ghostKind}
            cardBg={cardBg}
            border={border}
            isLight={isLight}
            textMuted={textMuted}
            textPrimary={textPrimary}
            columnDisplayName={columnDisplayName}
            onClose={() => setExpandedCell(null)}
            renderContent={(t, c, i, g, gk) => renderCell(t, c, i, g, gk, true)}
          />
        )
      })()}

      <RescheduleDialog
        reschedDialog={reschedDialog}
        reschedToDate={reschedToDate}
        setReschedToDate={setReschedToDate}
        reschedPending={reschedPending}
        setReschedPending={setReschedPending}
        reschedRemarks={reschedRemarks}
        setReschedRemarks={setReschedRemarks}
        reschedCalMonth={reschedCalMonth}
        setReschedCalMonth={setReschedCalMonth}
        dateFilter={dateFilter}
        cardBg={cardBg}
        border={border}
        inputBg={inputBg}
        inputBorder={inputBorder}
        isLight={isLight}
        textPrimary={textPrimary}
        textMuted={textMuted}
        green={green}
        onClose={closeReschedDialog}
        onConfirm={() => void commitInlineReschedule()}
      />

      <ContinuationDialog
        continuationDialog={continuationDialog}
        continuationSelectedDates={continuationSelectedDates}
        setContinuationSelectedDates={setContinuationSelectedDates}
        continuationCalMonth={continuationCalMonth}
        setContinuationCalMonth={setContinuationCalMonth}
        dateFilter={dateFilter}
        cardBg={cardBg}
        border={border}
        inputBorder={inputBorder}
        isLight={isLight}
        textPrimary={textPrimary}
        textMuted={textMuted}
        green={green}
        onClose={closeContinuationDialog}
        onConfirm={() => void commitInlineContinuation()}
      />

      <PaymentPromptModal
        paymentPrompt={paymentPrompt}
        promptAmount={promptAmount}
        setPromptAmount={setPromptAmount}
        promptMode={promptMode}
        setPromptMode={setPromptMode}
        promptHybridCash={promptHybridCash}
        setPromptHybridCash={setPromptHybridCash}
        promptHybridGcash={promptHybridGcash}
        setPromptHybridGcash={setPromptHybridGcash}
        cardBg={cardBg}
        border={border}
        inputBg={inputBg}
        inputBorder={inputBorder}
        isLight={isLight}
        textPrimary={textPrimary}
        textMuted={textMuted}
        onClose={() => setPaymentPrompt(null)}
        onSave={(t, col, v, inj) => { void saveCellEdit(t, col, v, inj) }}
      />

      <MonthFilterModal
        open={monthFilterModalOpen}
        onClose={() => setMonthFilterModalOpen(false)}
        activeBranchLabel={activeBranchLabel}
        monthFilterMonth={monthFilterMonth}
        setMonthFilterMonth={setMonthFilterMonth}
        monthFilterNegotiatorId={monthFilterNegotiatorId}
        setMonthFilterNegotiatorId={setMonthFilterNegotiatorId}
        monthFilterNegotiatorOptions={monthFilterNegotiatorOptions}
        formatNegotiatorLabel={formatNegotiatorLabel}
        monthFilterStatus={monthFilterStatus}
        setMonthFilterStatus={setMonthFilterStatus}
        monthFilterError={monthFilterError}
        monthFilterLoading={monthFilterLoading}
        runMonthFilterQuery={runMonthFilterQuery}
        isLight={isLight}
        cardBg={cardBg}
        border={border}
        green={green}
        textPrimary={textPrimary}
        textMuted={textMuted}
        inputBg={inputBg}
        inputBorder={inputBorder}
      />

      <MyTicketsFilterModal
        open={myTicketsFilterModalOpen}
        onClose={() => setMyTicketsFilterModalOpen(false)}
        activeBranchLabel={activeBranchLabel}
        myTicketsStatusFilter={myTicketsStatusFilter}
        setMyTicketsStatusFilter={setMyTicketsStatusFilter}
        isLight={isLight}
        cardBg={cardBg}
        border={border}
        green={green}
        textPrimary={textPrimary}
        textMuted={textMuted}
        inputBorder={inputBorder}
      />

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

      {historyGraphModal && (
        <TicketHistoryGraphModal
          ticket={historyGraphModal.ticket}
          isOpen={historyGraphModal.isOpen}
          readOnly={isTicketLockedFor(historyGraphModal.ticket, role)}
          onClose={() => setHistoryGraphModal(null)}
          onRemarkSubmitted={(ticketId, remark) => {
            setTickets(currentTickets => currentTickets.map(currentTicket => (
              currentTicket.id === ticketId
                ? { ...currentTicket, remarksUpdate: remark, remarks: remark }
                : currentTicket
            )))
            setHistoryGraphModal(currentModal => (
              currentModal?.ticket.id === ticketId
                ? { ...currentModal, ticket: { ...currentModal.ticket, remarksUpdate: remark, remarks: remark } }
                : currentModal
            ))
          }}
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
    </div>
  )
}

