import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import ReactDOM from 'react-dom'
import {
  Plus, Search, X, Edit3, AlertTriangle, CalendarDays,
  Eye, Loader2, Pencil, Moon, Sun,
  ArrowUp, ArrowDown, ArrowUpDown, Copy, MapPin, Menu, Maximize2,
  UsersRound, ChevronDown, SlidersHorizontal, CalendarRange,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, fetchTicketsPage, fetchTicketByNumber, formatFetchError, readApiError, parseCreatedTicketResponse, resolvePortalWriteBranchId, resolveTicketArchiveBranchId, resolveTicketScheduleBranchId, resolveScopedBranchId, branchScopesMatch, appendCurrentNegotiator, isNegotiatorCandidate, isTaguigBranchRef, isTaguigServicesScope, isTaguigServiceTicket, isPortalAdmin, isCoordinatorOrOicUser, getActivePortalBranchId, EMPLOYEES_DIRECTORY_UPDATED_EVENT, PROFILE_UPDATED_EVENT, DEALERS_UPDATED_EVENT, notifyDealersUpdated, type InstallerBranchIndexEntry, type BranchStaffOption } from '../utils/api'
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
import { fetchCachedDriverOnlyNames, fetchCachedEmployees, fetchCachedLineupInstallerIndex, fetchCachedBranches } from '../utils/portalDirectoryCache'
import {
  BRANCH_ROSTER_UPDATED_EVENT,
  buildBranchRoster,
  fetchAllBranchRosters,
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
  FIELD_TICKET_CATEGORIES,
  categoryDefaultServiceType,
  inferCategoryFromTicket,
  isFieldCategory,
  type TicketCategoryValue,
} from '../constants/ticketCategories'
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
  const rowEven = isLight ? '#ffffff' : '#060B18'
  const rowOdd = isLight ? '#f7fbf8' : '#060B18'
  const rowHover = isLight ? '#edf7f1' : '#0f1a2e'
  const green = '#16A34A'
  const textGreen = isLight ? '#16A34A' : '#4ade80'

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
  const [negoDropdownOpen, setNegoDropdownOpen] = useState(false)
  const [negoDropdownPos, setNegoDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const negoDropdownRef = useRef<HTMLButtonElement>(null)
  const negoDropdownPopRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!negoDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (negoDropdownRef.current && negoDropdownRef.current.contains(target)) return
      if (negoDropdownPopRef.current && negoDropdownPopRef.current.contains(target)) return
      setNegoDropdownOpen(false)
    }
    const handleScroll = (e: Event) => {
      const target = e.target as Node
      if (negoDropdownPopRef.current && negoDropdownPopRef.current.contains(target)) return
      setNegoDropdownOpen(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [negoDropdownOpen])
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

  // ─────────────────────────────────────────────────────────────
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

      if (['COMPLETED', 'DONE_DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'INSTALLED'].includes(String(body.status || '').toUpperCase())) {
        const outcome = (statusOutcome || String(statusAcMeta.scheduleOutcome || '') || (
          String(body.status || '').toUpperCase() === 'DONE_DISMANTLE' ? 'DONE_DISMANTLE'
            : String(body.status || '').toUpperCase() === 'DONE_SYSTEM_REPROCESS' ? 'DONE_SYSTEM_REPROCESS'
              : 'DONE_INSTALLED'
        )) as ScheduleOutcome
        body.scheduleOutcome = outcome
        body.acDetails = mergeAcMeta({ ...activeForm, acDetails: body.acDetails } as Ticket, {
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
  }, [expandedCols, isTaguigServices, isMyTickets, monthViewActive])

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
  }, [tickets, isMyTickets, activeBranchId, dateFilter, searchQuery, user?.id, user?.email, user?.branchId, user?.jobTitle, installerLineupIndex, driverOnlyNames, isAdmin, myTicketsNegotiatorFilter, branchEmployees, isBranchMatch, monthViewActive, monthFilterNegotiatorId, monthFilterStatus])

  // Auto-numbered vehicle trip labels ("STRADA - 1", "STRADA - 2") for the current filtered set —
  // the vehicle is now the dispatch unit, so staff never type a manual "- N" suffix into the
  // Driver or Vehicle fields; the trip number is derived from assignment order instead.
  const vehicleTripLabels = useMemo(() => buildVehicleTripLabels(filtered), [filtered])

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
    // ─────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────
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
      || (body.status as string | undefined)?.toUpperCase() === 'DONE_DISMANTLE'
      || (body.status as string | undefined)?.toUpperCase() === 'DONE_SYSTEM_REPROCESS'
    ) {
      finalBody = enrichCompletePatchBody(body, liveTicket, schedKey)
    }

    cancelEdit()
    setStatusPicker(null)
    setFinalDatePicker(null)
    setFinalDateCalMonth(null)

    // After marking DONE INSTALL / DONE CLEANING / DONE DISMANTLE, put the caret in REMARKS.
    const focusRemarksAfterStatus = colLabel === 'STATUS'
      && (normalizedStatus === 'DONE_INSTALLED' || normalizedStatus === 'DONE_CLEANING' || normalizedStatus === 'DONE_DISMANTLE')

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
    if (!canEdit || (rowGhost && !allowGhostEdit)) return content
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

    // ─────────────────────────────────────────────────────────────
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
            {ghostRemarks || EMPTY_CELL}
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
      if (!combined || combined === '0') {
        return <span style={{ ...truncStyle, fontWeight: 700, color: textMuted }} title="0">0</span>
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

  // ─────────────────────────────────────────────────────────────
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
          <div className="flex items-center gap-2.5 w-full md:w-[240px] lg:w-[320px] h-10 md:h-11 px-3.5 md:px-4 rounded-full border transition-all shrink-0 shadow-sm focus-within:border-emerald-500/60"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-4 h-4 shrink-0 text-emerald-500" />
            <input
              type="text"
              placeholder="Search names, phone, ticket..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-xs md:text-sm flex-1 min-w-0 font-medium placeholder:font-medium placeholder:opacity-60"
              style={{ color: textPrimary }}
              onClick={e => e.stopPropagation()}
            />
            {searchQuery && (
              <button type="button" onClick={e => { e.stopPropagation(); setSearchQuery('') }}
                className="shrink-0 p-1 rounded-full hover:bg-slate-500/10 transition-colors" style={{ color: textMuted }}
                aria-label="Clear search">
                <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
            )}
          </div>

          {isAdmin && (
            <div className="relative min-w-0 flex-1 md:flex-none">
              {/* Custom Dropdown Trigger Button */}
              <button
                ref={negoDropdownRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (negoDropdownOpen) {
                    setNegoDropdownOpen(false)
                    return
                  }
                  const rect = e.currentTarget.getBoundingClientRect()
                  setNegoDropdownPos({
                    top: rect.bottom + 6,
                    left: rect.left,
                    width: Math.max(200, rect.width),
                  })
                  setNegoDropdownOpen(true)
                }}
                className="flex items-center justify-between gap-2 h-9 md:h-10 px-3.5 rounded-full border text-xs font-black min-w-[180px] md:w-[220px] outline-none shadow-sm cursor-pointer transition-all hover:border-emerald-500/70 active:scale-[0.98]"
                style={{
                  backgroundColor: inputBg,
                  borderColor: negoDropdownOpen ? green : inputBorder,
                  color: isLight ? '#15803d' : '#4ade80',
                }}
              >
                <span className="truncate uppercase font-extrabold tracking-wide">
                  {(() => {
                    if (!myTicketsNegotiatorFilter) return 'ALL NEGOTIATORS'
                    const match = myTicketsNegotiatorOptions.find(emp => emp.id === myTicketsNegotiatorFilter)
                    return match ? formatNegotiatorLabel(match, true) : 'ALL NEGOTIATORS'
                  })()}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${negoDropdownOpen ? 'rotate-180' : ''}`}
                  style={{ color: isLight ? '#15803d' : '#4ade80' }}
                  strokeWidth={2.5}
                />
              </button>

              {/* Custom Dropdown Popover List — rendered directly to body so it ALWAYS floats above table & header */}
              {negoDropdownOpen && negoDropdownPos && ReactDOM.createPortal(
                <div
                  ref={negoDropdownPopRef}
                  className="fixed z-[99999] overflow-y-auto rounded-xl border shadow-2xl py-1 animate-in fade-in duration-100 select-none"
                  style={{
                    top: negoDropdownPos.top,
                    left: negoDropdownPos.left,
                    width: negoDropdownPos.width,
                    maxHeight: 210,
                    backgroundColor: isLight ? '#ffffff' : '#0a1120',
                    borderColor: isLight ? '#cbd5e1' : '#334155',
                    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.5)',
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMyTicketsNegotiatorFilter('')
                      setNegoDropdownOpen(false)
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMyTicketsNegotiatorFilter('')
                      setNegoDropdownOpen(false)
                    }}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-black uppercase tracking-wide text-left transition-colors hover:bg-emerald-500/10 cursor-pointer"
                    style={{
                      color: !myTicketsNegotiatorFilter ? (isLight ? '#15803d' : '#4ade80') : textPrimary,
                      backgroundColor: !myTicketsNegotiatorFilter ? (isLight ? 'rgba(22,163,74,0.1)' : 'rgba(74,222,128,0.12)') : undefined,
                    }}
                  >
                    <span>ALL NEGOTIATORS</span>
                    {!myTicketsNegotiatorFilter && <span className="text-emerald-500 font-extrabold text-xs">✓</span>}
                  </button>

                  <div className="my-1 border-t opacity-30" style={{ borderColor: inputBorder }} />

                  {myTicketsNegotiatorOptions.map(emp => {
                    const label = formatNegotiatorLabel(emp, true)
                    const isSelected = myTicketsNegotiatorFilter === emp.id
                    return (
                      <button
                        type="button"
                        key={emp.id}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setMyTicketsNegotiatorFilter(emp.id)
                          setNegoDropdownOpen(false)
                        }}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setMyTicketsNegotiatorFilter(emp.id)
                          setNegoDropdownOpen(false)
                        }}
                        className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-black uppercase tracking-wide text-left transition-colors hover:bg-emerald-500/10 cursor-pointer"
                        style={{
                          color: isSelected ? (isLight ? '#15803d' : '#4ade80') : textPrimary,
                          backgroundColor: isSelected ? (isLight ? 'rgba(22,163,74,0.1)' : 'rgba(74,222,128,0.12)') : undefined,
                        }}
                      >
                        <span className="truncate">{label}</span>
                        {isSelected && <span className="text-emerald-500 font-extrabold text-xs">✓</span>}
                      </button>
                    )
                  })}
                </div>,
                document.body,
              )}
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
            {activeTab === 'schedules' && (
              <>
                {/* Mobile: Date picker + Search (in between) + Filters button */}
                <div className="md:hidden flex items-center gap-2 w-full min-w-0 py-0.5">
                  {/* Mobile Date picker button — uses native dynamic OS date picker for iOS & Android */}
                  <div className="relative shrink-0 flex items-center">
                    <div
                      className="flex items-center gap-1.5 h-9 px-2.5 rounded-full border transition-transform pointer-events-none"
                      style={{
                        backgroundColor: inputBg,
                        borderColor: green,
                        color: textPrimary,
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

            {/* Search — desktop */}
            {activeTab === 'schedules' && (
              <div
                className="hidden md:flex items-center gap-2 w-[140px] lg:w-[180px] xl:w-[240px] h-10 px-3 rounded-2xl border transition-all shrink-0"
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              >
                <Search className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
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
                    className="shrink-0 p-1 rounded-full hover:bg-slate-500/10 transition-colors"
                    style={{ color: textMuted }}
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  persistSchedulesSnapshot()
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
      <div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden" style={{ backgroundColor: cardBg }}
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
                            {columns.map((col) => {
                              const isEditingCell = editingCell?.ticketId === ticket.id
                                && editingCell?.rowIndex === idx
                                && editingCell?.colLabel === col.label
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
                                    if (col.label === 'VEHICLE' || col.label === 'TICKET NO') return
                                    setExpandedCell(prev =>
                                      prev?.ticketId === ticket.id && prev?.colLabel === col.label
                                        ? null
                                        : { ticketId: ticket.id, colLabel: col.label },
                                    )
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

                  {/* Search Input Box */}
                  <div
                    className="w-full max-w-2xl mx-auto flex items-center gap-3 px-5 py-4 md:px-8 md:py-5 rounded-2xl shadow-md border-2 transition-[border-color,box-shadow] duration-150"
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
                      placeholder="Auto-generated if left blank (e.g. AC-001)"
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
                  <Field label="Payment Amount (₱)">
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
                    {paymentSubmitLabel}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      })()}

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
                <X className="w-4 h-4" />
              </button>
            </div>

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
      )}
    </div>
  )
}

