import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'

import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  API_BASE_URL,
  isSameBaseBranch,
  isPortalAdmin,
  resolvePortalWriteBranchId,
  resolveScopedBranchId,
  fetchTicketsPage,
  findBranchListEntry,
  type InstallerBranchIndexEntry,
} from '../../utils/api'
import {
  fetchVehicles as fetchVehiclesApi,
  createVehicle as createVehicleApi,
  updateVehicle as updateVehicleApi,
  deleteVehicle as deleteVehicleApi,
  type Vehicle as ApiVehicle,
} from '../../utils/vehicleApi'
import { normalizeRelayScheduleTicketList } from '../../utils/relayScheduleSync'
import {
  fetchCachedLineupInstallerIndex,
  fetchCachedDriverOnlyNames,
  fetchCachedEmployees,
} from '../../utils/portalDirectoryCache'
import {
  deriveRosterFromEmployees,
  deriveCoordinatorsFromEmployees,
  type BranchRoster,
} from '../../utils/branchRoster'
import type { BranchStaffOption } from '../../utils/api'
import {
  ticketBelongsOnScheduleDate,
  ticketBelongsOnScheduleBranch,
  getTicketVehicleDisplay,
  getTicketDriverDisplay,
  getTicketNegotiatorName,
  resolveTicketDistrict,
  getInstallerDisplay,
  parseNameSiteToken,
  getScheduleStatusDisplay,
  type Ticket as ScheduleTicket,
} from '../Tickets'

import {
  type LineUpRow,
  type VehicleItem,
  type ConfirmModalState,
  type WScheduleKind,
  type WPersonSchedule,
  branchThemes,
  getBranchThemeKey,
  VEHICLE_OPTIONS,
  VEHICLE_DEFAULTS,
  DRIVER_OPTIONS,
  INSTALLER_OPTIONS,
  NEGOTIATOR_OPTIONS,
  ROUTE_OPTIONS,
  REMARKS_OPTIONS,
  tomorrowStr,
  isTimeBefore10AM,
  lsLoad,
  lsSave,
  lsNextId,
  wToDateKey,
  wGetWeekStart,
  wGetWeekDays,
  wLoadSchedule,
  wSaveSchedule,
  sumAllUnits,
  normalizeRemarksString,
} from './types'

import { LineUpHeader } from './LineUpHeader'
import { EditableTable } from './EditableTable'
import { MobileLineUpView } from './MobileLineUpView'
import { WeeklyTab } from './WeeklyTab'
import { VehiclesTab } from './VehiclesTab'
import { ShowcaseModal } from './ShowcaseModal'

export default function LineUpPage() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  // ── Inner tab routing ────────────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'weekly' ? 'weekly' : searchParams.get('tab') === 'vehicles' ? 'vehicles' : 'field'
  const setActiveTab = (tab: 'field' | 'weekly' | 'vehicles') =>
    setSearchParams(tab === 'field' ? {} : { tab }, { replace: true })

  const role = (user?.role || '').toLowerCase()
  const [date, setDate] = useState(tomorrowStr)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('ashcol-global-branch-id') || ''
    }
    return ''
  })

  const lineupApiBranchId = useMemo(
    () => resolvePortalWriteBranchId(branchId, user?.email, user?.jobTitle) || branchId,
    [branchId, user?.email, user?.jobTitle],
  )

  const checkBranchMatch = useCallback((userBranchId: string, currentBranchId: string) => {
    if (!userBranchId || !currentBranchId) return false
    if (isSameBaseBranch(userBranchId, currentBranchId)) return true
    const userBranch = branches.find(b => isSameBaseBranch(b.id, userBranchId))
    const currentBranch = branches.find(b => isSameBaseBranch(b.id, currentBranchId))
    if (userBranch && currentBranch) {
      return isSameBaseBranch(userBranch.name, currentBranch.name)
    }
    return false
  }, [branches])

  const canEdit = useMemo(() => {
    if (isPortalAdmin(role)) return true
    if (!user?.branchId || !branchId) return false
    const isAllowedRole = role === 'manager' || role === 'staff' || role === 'employee' || role === 'oic'
    if (!isAllowedRole) return false
    return checkBranchMatch(user.branchId, branchId)
  }, [role, user, branchId, checkBranchMatch])

  const mapApiVehicle = (v: ApiVehicle): VehicleItem => ({
    id: v.id,
    name: v.name || '',
    plateNumber: v.plateNumber || '',
    branchAssigned: v.branchId || '',
    codingDay: v.codingDay || 'None',
  })

  const [vehicles, setVehicles] = useState<VehicleItem[]>([])
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false)
  const vehicleSeedAttempted = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchVehiclesApi()
        if (!cancelled) setVehicles(list.map(mapApiVehicle))
      } catch {
        // best-effort
      } finally {
        if (!cancelled) setVehiclesLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!vehiclesLoaded || vehicles.length > 0 || branches.length === 0 || vehicleSeedAttempted.current) return
    vehicleSeedAttempted.current = true
    ;(async () => {
      try {
        const created = await Promise.all(VEHICLE_DEFAULTS.map(def => {
          const matchedBranch = branches.find(b => def.branchPattern.test(b.name))
          return createVehicleApi({
            name: def.name,
            plateNumber: def.plateNumber,
            branchId: matchedBranch ? matchedBranch.id : '',
            codingDay: def.codingDay,
          })
        }))
        setVehicles(created.map(mapApiVehicle))
      } catch {
        // best-effort seed
      }
    })()
  }, [vehiclesLoaded, vehicles.length, branches])

  const lineupDayOfWeek = useMemo(() => {
    if (!date) return ''
    try {
      const d = new Date(date + 'T00:00:00')
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return daysOfWeek[d.getDay()]
    } catch {
      return ''
    }
  }, [date])

  const getVehiclePlate = useCallback((_serviceName: string): string => {
    return ''
  }, [])

  const getVehicleCodingStatus = useCallback((serviceName: string, rowTime?: string) => {
    if (!serviceName) return null
    const clean = serviceName.trim().toUpperCase()
    const found = vehicles.find(v => v.name.trim().toUpperCase() === clean)
    if (!found || !found.codingDay || found.codingDay === 'None') return null
    const isCodingToday = found.codingDay.toLowerCase() === lineupDayOfWeek.toLowerCase()
    const isRestricted = isCodingToday && isTimeBefore10AM(rowTime)
    return { codingDay: found.codingDay, isCodingToday, isRestricted }
  }, [vehicles, lineupDayOfWeek])

  const [vehicleFilterBranch, setVehicleFilterBranch] = useState<string>('')

  const handleAddVehicle = async () => {
    try {
      const created = await createVehicleApi({ name: '', plateNumber: '', branchId: branchId || '', codingDay: 'None' })
      setVehicles(prev => [...prev, mapApiVehicle(created)])
    } catch {
      showToast('Failed to add vehicle', 'error')
    }
  }

  const handleDeleteVehicle = async (id: string) => {
    const previous = vehicles
    setVehicles(v => v.filter(x => x.id !== id))
    try {
      await deleteVehicleApi(id)
    } catch {
      setVehicles(previous)
      showToast('Failed to delete vehicle', 'error')
    }
  }

  const handleUpdateVehicle = (id: string, field: keyof VehicleItem, value: string) => {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v))
    const apiField = field === 'branchAssigned' ? 'branchId' : field
    updateVehicleApi(id, { [apiField]: value }).catch(() => {
      showToast('Failed to save vehicle change', 'error')
    })
  }

  const branchName = branches.find(b => b.id === branchId)?.name ?? ''
  const isTaguigServices = Boolean(branchName && branchName.toUpperCase().includes('TAGUIG') && (branchName.toUpperCase().includes('SERVICE') || branchName.toUpperCase().includes('SERVICES') || branchName.toUpperCase().includes('DEPT')))
  const currentThemeKey = getBranchThemeKey(branchName)
  const currentTheme = branchThemes[currentThemeKey] || branchThemes["TAGUIG - SALES"]

  const cardBg      = isLight ? '#FFFFFF'  : '#1E293B'
  const pageBg      = isLight ? '#F8FAFC'  : '#0F172A'
  const border      = isLight ? '#E2E8F0'  : '#334155'
  const textPrimary = isLight ? '#0F172A'  : '#F8FAFC'
  const textMuted   = isLight ? '#64748B'  : '#CBD5E1'
  const inputBg     = isLight ? '#F8FAFC'  : '#0F172A'
  const inputBorder = isLight ? '#E2E8F0'  : '#334155'

  const [rows, setRows] = useState<LineUpRow[]>([])
  const [loading, setLoading] = useState(false)
  const [autoSyncSchedule, setAutoSyncScheduleState] = useState<boolean>(() => {
    const saved = localStorage.getItem('ashcol_lineup_auto_sync_schedule')
    return saved !== null ? saved === 'true' : false
  })
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const scanFileRef    = useRef<HTMLInputElement>(null)
  const localToRealIdRef = useRef<Map<string, string>>(new Map())

  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanError, setScanError] = useState('')

  const [showcaseOpen, setShowcaseOpen] = useState(false)
  const [exportingPng, setExportingPng] = useState(false)
  const [copyingImage, setCopyingImage] = useState(false)
  const [copiedImage, setCopiedImage] = useState(false)

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<{ row: LineUpRow; x: number; y: number } | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: keyof LineUpRow } | null>(null)
  const [tempValue, setTempValue] = useState<string>('')
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<string>>(() => new Set())

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureAreaRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const dragSourceIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  const isNavigatingRef = useRef(false)
  const desktopDateInputRef = useRef<HTMLInputElement>(null)
  const weeklyDateInputRef = useRef<HTMLInputElement>(null)

  const [suggestions, setSuggestions] = useState<{
    services: string[]
    drivers: string[]
    installers: string[]
    negotiators: string[]
    routes: string[]
    remarks: string[]
  }>({ services: [], drivers: [], installers: [], negotiators: [], routes: [], remarks: [] })

  // ── Branch staff roster (real employee accounts) — powers strict Installer/Negotiator dropdowns ──
  const [staffEmployees, setStaffEmployees] = useState<BranchStaffOption[]>([])

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    if (!token) return
    fetchCachedEmployees(token)
      .then(list => {
        if (cancelled) return
        setStaffEmployees(
          (list as Array<Record<string, unknown>>).map(u => ({
            id: String(u.id || ''),
            name: String(u.name || ''),
            branchId: u.branchId ? String(u.branchId) : (u.branch_id ? String(u.branch_id) : null),
            email: u.email ? String(u.email) : null,
            role: u.role ? String(u.role) : null,
            jobTitle: u.jobTitle ? String(u.jobTitle) : (u.job_title ? String(u.job_title) : null),
            isActive: typeof u.isActive === 'boolean' ? u.isActive : undefined,
            active: typeof u.active === 'boolean' ? u.active : undefined,
            status: u.status ? String(u.status) : null,
          }))
        )
      })
      .catch(() => { if (!cancelled) setStaffEmployees([]) })
    return () => { cancelled = true }
  }, [])

  const branchStaffRoster: BranchRoster = useMemo(
    () => deriveRosterFromEmployees(staffEmployees, branchId || ''),
    [staffEmployees, branchId],
  )

  const branchCoordinatorOptions = useMemo(
    () => deriveCoordinatorsFromEmployees(staffEmployees, branchId || ''),
    [staffEmployees, branchId],
  )

  const finalVehicleOptions = useMemo(() => {
    const dynamicNames = vehicles.map(v => v.name.toUpperCase())
    return [...new Set([...suggestions.services.map(s => s.toUpperCase()), ...dynamicNames, ...VEHICLE_OPTIONS])].sort()
  }, [suggestions.services, vehicles])

  const finalDriverOptions = useMemo(() => {
    const formatFirst = (str: string) => {
      const clean = str.trim().replace(/\s*\([^)]*\)\s*/g, '').replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '').trim()
      return clean.split(/\s+/)[0].toUpperCase()
    }
    const rosterNames = branchStaffRoster.drivers.map(formatFirst).filter(Boolean)
    const suggested = suggestions.drivers.map(formatFirst).filter(Boolean)
    if (rosterNames.length > 0) return [...new Set(rosterNames)].sort()
    return [...new Set([...suggested, ...DRIVER_OPTIONS])].sort()
  }, [branchStaffRoster.drivers, suggestions.drivers])

  const finalInstallerOptions = useMemo(() => {
    const formatFirst = (str: string) => {
      const clean = str.trim().replace(/\s*\([^)]*\)\s*/g, '').replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '').trim()
      return clean.split(/\s+/)[0].toUpperCase()
    }
    const rosterNames = branchStaffRoster.installers.map(formatFirst).filter(Boolean)
    const suggested = suggestions.installers.map(formatFirst).filter(Boolean)
    if (rosterNames.length > 0) return [...new Set(rosterNames)].sort()
    return [...new Set([...suggested, ...INSTALLER_OPTIONS])].sort()
  }, [branchStaffRoster.installers, suggestions.installers])

  const finalNegotiatorOptions = useMemo(() => {
    const formatFirst = (str: string) => {
      const clean = str.trim().replace(/\s*\([^)]*\)\s*/g, '').replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '').trim()
      return clean.split(/\s+/)[0].toUpperCase()
    }
    const rosterNames = branchCoordinatorOptions.map(formatFirst).filter(Boolean)
    const suggested = suggestions.negotiators.map(formatFirst).filter(Boolean)
    if (rosterNames.length > 0) return [...new Set(rosterNames)].sort()
    return [...new Set([...suggested, ...NEGOTIATOR_OPTIONS])].sort()
  }, [branchCoordinatorOptions, suggestions.negotiators])

  const finalRouteOptions = useMemo(() =>
    [...new Set([...suggestions.routes.map(r => r.toUpperCase()), ...ROUTE_OPTIONS])].sort(),
    [suggestions.routes]
  )

  const finalRemarksOptions = useMemo(() =>
    [...new Set([...suggestions.remarks.map(rem => rem.toUpperCase()), ...REMARKS_OPTIONS])].sort(),
    [suggestions.remarks]
  )

  const fetchSuggestions = useCallback(async (bId: string) => {
    if (!bId) return
    const apiBranch = resolvePortalWriteBranchId(bId, user?.email, user?.jobTitle) || bId
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup/suggestions?branchId=${encodeURIComponent(apiBranch)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        const filterSystemKeys = (arr: string[]) => (arr || []).filter(s => {
          if (!s) return false
          const upper = s.toUpperCase().trim()
          return upper !== '__NOTES__' && upper !== '__WEEKLY_DRIVERS__' && upper !== '__WEEKLY_INSTALLERS__' && !upper.includes('_NOTES_') && !upper.includes('_WEEKLY_')
        })
        setSuggestions({
          services: filterSystemKeys(data.services),
          drivers: filterSystemKeys(data.drivers),
          installers: filterSystemKeys(data.installers),
          negotiators: filterSystemKeys(data.negotiators || []),
          routes: filterSystemKeys(data.routes),
          remarks: filterSystemKeys(data.remarks),
        })
      }
    } catch (e) {
      console.error("Error fetching lineup suggestions:", e)
    }
  }, [user?.email, user?.jobTitle])

  useEffect(() => {
    if (branchId) void fetchSuggestions(branchId)
  }, [branchId, fetchSuggestions])

  useEffect(() => {
    if (showcaseOpen) {
      document.body.classList.add('showcase-mode-active')
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setShowcaseOpen(false)
      }
      window.addEventListener('keydown', handleEscape)
      return () => {
        document.body.classList.remove('showcase-mode-active')
        window.removeEventListener('keydown', handleEscape)
      }
    } else {
      document.body.classList.remove('showcase-mode-active')
    }
  }, [showcaseOpen])

  // ── Load Branches ────────────────────────────────────────────────────────
  const loadBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: { id: string; name: string }[] = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
      const hasExplicitTaguigSales = list.some((b: { id: string; name: string }) => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SALES-EXPLICIT' || (name.includes('TAGUIG') && name.includes('SALES') && id !== 'BR-TAGUIG-SALES')
      })
      const hasExplicitTaguigServices = list.some((b: { id: string; name: string }) => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || (name.includes('TAGUIG') && name.includes('SERVICE'))
      })

      const newList: { id: string; name: string }[] = []
      for (const b of list) {
        const cleanName = b.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
        if (cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG') {
          if (!hasExplicitTaguigSales) newList.push({ id: `${b.id}-sales`, name: 'TAGUIG - SALES' })
          if (!hasExplicitTaguigServices) newList.push({ id: `${b.id}-services`, name: 'TAGUIG - SERVICES' })
        } else if (cleanName.includes('TAGUIG')) {
          const isServ = cleanName.includes('SERVICE')
          newList.push({
            id: isServ ? `${b.id}-services` : `${b.id}-sales`,
            name: isServ ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES'
          })
        } else {
          newList.push({ id: b.id, name: cleanName })
        }
      }
      newList.sort((a, b) => a.name.localeCompare(b.name))
      setBranches(newList)

      const storedGlobal = typeof localStorage !== 'undefined' ? localStorage.getItem('ashcol-global-branch-id') : null
      const targetId = isPortalAdmin(role) ? (storedGlobal || user?.branchId) : (user?.branchId || storedGlobal)
      const matchedBranch = targetId ? findBranchListEntry(targetId, newList, user?.email) : undefined

      if (matchedBranch) {
        setBranchId(matchedBranch.id)
      } else if (branchId) {
        const currentMatch = findBranchListEntry(branchId, newList, user?.email)
        if (currentMatch) {
          setBranchId(currentMatch.id)
        } else if (newList.length > 0) {
          setBranchId(newList[0].id)
        }
      } else if (newList.length > 0) {
        setBranchId(newList[0].id)
      }
    } catch (e) {
      console.error(e)
    }
  }, [user?.branchId, user?.role, user?.email, role, branchId])

  useEffect(() => { void loadBranches() }, [loadBranches])

  useEffect(() => {
    const handleGlobalBranchChange = () => {
      const gId = typeof localStorage !== 'undefined' ? localStorage.getItem('ashcol-global-branch-id') : null
      if (gId && branches.length > 0) {
        const found = findBranchListEntry(gId, branches, user?.email)
        if (found) setBranchId(found.id)
      }
    }
    window.addEventListener('ashcol-global-branch-change', handleGlobalBranchChange)
    return () => window.removeEventListener('ashcol-global-branch-change', handleGlobalBranchChange)
  }, [branches, user?.email])

  const [lineupNotes, setLineupNotes] = useState('')
  const [notesRecord, setNotesRecord] = useState<LineUpRow | null>(null)


  const scheduleStatusShortLabel = (ticket: ScheduleTicket): string => {
    const raw = (getScheduleStatusDisplay(ticket) || '').toUpperCase()
    if (!raw) return ''
    if (
      raw === 'DONE INSTALL'
      || raw === 'DONE_INSTALL'
      || raw === 'DONE_INSTALLED'
      || raw === 'DONE INSTALLED'
      || raw === 'INSTALLED'
    ) {
      return 'INSTALLED'
    }
    if (
      raw === 'INSTALLATION'
      || raw === 'INSTALL'
      || raw === 'S/I'
      || raw === 'S_I'
      || raw === 'SI'
    ) {
      return 'INSTALL'
    }
    if (raw.includes('QUOTATION') || raw.includes('APPROVAL')) return 'QUOTATION'
    return raw
      .replace(/\bDONE_INSTALLED\b/gi, 'INSTALLED')
      .replace(/\bDONE_INSTALL\b/gi, 'INSTALLED')
      .replace(/\bDONE\s+INSTALL(?:ED)?\b/gi, 'INSTALLED')
      .replace(/\bINSTALLATION\b/gi, 'INSTALL')
      .replace(/\bDONE_CLEANING\b/gi, 'CLEANING')
      .replace(/\bDONE_SURVEY\b/gi, 'SURVEY')
      .replace(/\bDONE_CHECKUP\b/gi, 'CHECKUP')
      .replace(/\bDONE_BACKJOB\b/gi, 'BACKJOB')
      .replace(/\bDONE_SERVICE\b/gi, 'SERVICE')
      .replace(/\bDONE_DISMANTLE\b/gi, 'DISMANTLE')
      .replace(/\bDONE_RELOCATED\b/gi, 'RELOCATION')
      .replace(/\bDONE_QUOTATION\b/gi, 'QUOTATION')
      .replace(/\bDONE_NEGOTIATION\b/gi, 'NEGOTIATION')
      .replace(/\bDONE_SYSTEM_REPROCESS\b/gi, 'SYSTEM REPROCESS')
      .replace(/_/g, ' ')
      .trim()
  }

  const deriveRowsFromSchedule = async (dateStr: string, bId: string, previousRows: LineUpRow[] = []): Promise<LineUpRow[]> => {
    if (!bId) return []
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      if (!token) return []
      const scopedBranch = resolveScopedBranchId(bId)
      const [rawTickets, lineupIndex, driverOnlyNames, employeeList] = await Promise.all([
        fetchTicketsPage('/tickets/branch', token, { size: 200, paginate: false, branchId: scopedBranch, date: dateStr }),
        fetchCachedLineupInstallerIndex(token).catch(() => [] as InstallerBranchIndexEntry[]),
        fetchCachedDriverOnlyNames(token).catch(() => [] as string[]),
        fetchCachedEmployees(token).catch(() => [] as Array<Record<string, unknown>>),
      ])

      const employeesForLookup = (employeeList as Array<Record<string, unknown>>)
        .map(u => ({ id: String(u.id || ''), name: String(u.name || '') }))
        .filter(u => u.id && u.name)
      const tickets = normalizeRelayScheduleTicketList(rawTickets as ScheduleTicket[]) as ScheduleTicket[]
      const scoped = tickets.filter(t =>
        ticketBelongsOnScheduleDate(t, dateStr)
        && ticketBelongsOnScheduleBranch(t, bId, user?.email, user?.jobTitle, lineupIndex as any, driverOnlyNames as any)
        && !['CANCELLED', 'COMPLETED'].includes(String(t.status || '').toUpperCase())
      )

      const groups = new Map<string, { base: string; installer: string; tickets: ScheduleTicket[] }>()
      for (const t of scoped) {
        const base = parseNameSiteToken(getTicketVehicleDisplay(t)).name
        if (!base) continue
        const rawInstaller = getInstallerDisplay(t).trim()
        const cleanInstaller = rawInstaller.replace(/\s*\([^)]*\)\s*/g, '').replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '').trim()
        const installer = (cleanInstaller.split(/\s+/)[0] || '').toUpperCase()
        const key = `${base}::${installer}`
        const entry = groups.get(key) || { base, installer, tickets: [] }
        entry.tickets.push(t)
        groups.set(key, entry)
      }

      const byTicketNumber = (list: ScheduleTicket[]) => [...list].sort((a, b) => {
        const an = a.ticketNumber || a.ticket_number || a.id || ''
        const bn = b.ticketNumber || b.ticket_number || b.id || ''
        return an.localeCompare(bn, undefined, { numeric: true })
      })

      const uniqueJoin = (values: string[], sep: string) => {
        const seen: string[] = []
        for (const raw of values) {
          const v = raw.trim()
          if (v && !seen.includes(v)) seen.push(v)
        }
        return seen.join(sep)
      }

      const mostCommon = (values: string[]): string => {
        const counts = new Map<string, number>()
        for (const raw of values) {
          const v = raw.trim()
          if (!v) continue
          counts.set(v, (counts.get(v) || 0) + 1)
        }
        let best = ''
        let bestCount = 0
        for (const [v, c] of counts) {
          if (c > bestCount) { best = v; bestCount = c }
        }
        return best
      }

      const prevTimeByKey = new Map<string, { driverTime: string; installerTime: string }>()
      for (const r of previousRows) {
        prevTimeByKey.set(`${r.service}::${r.installerName}`, { driverTime: r.driverTime, installerTime: r.installerTime })
      }

      const sortedKeys = Array.from(groups.entries()).sort(([, a], [, b]) => {
        const baseCmp = a.base.localeCompare(b.base, undefined, { numeric: true })
        if (baseCmp !== 0) return baseCmp
        return a.installer.localeCompare(b.installer, undefined, { numeric: true })
      })

      return sortedKeys.map(([key, group], i) => {
        const groupTickets = byTicketNumber(group.tickets)
        const prevTimes = prevTimeByKey.get(key)
        const rawDriver = mostCommon(groupTickets.map(t => getTicketDriverDisplay(t)))
        const cleanDriver = rawDriver.replace(/\s*\([^)]*\)\s*/g, '').replace(/^(sir|ma'am|maam|mr|ms|mrs|engr)\.?\s+/i, '').trim()
        const driverName = (cleanDriver.split(/\s+/)[0] || '').toUpperCase()
        return {
          id: `local-schedule-${Date.now()}-${i}`,
          lineupDate: dateStr,
          branchId: bId,
          service: group.base,
          driverName,
          driverTime: prevTimes?.driverTime || '8:00AM',
          installerName: group.installer,
          installerTime: prevTimes?.installerTime || '7:00AM',
          negotiator: uniqueJoin(groupTickets.map(t => getTicketNegotiatorName(t, employeesForLookup)), '/'),
          route: uniqueJoin(groupTickets.map(t => resolveTicketDistrict(t)), ' - '),
          remarks: groupTickets.map(t => scheduleStatusShortLabel(t)).filter(Boolean).join('-'),
          sortOrder: i,
        }
      })
    } catch (e) {
      console.error('Error deriving lineup from schedule:', e)
      return []
    }
  }

  const fetchLineup = useCallback(async (forceAutoSync?: boolean, isPeriodicPoll = false) => {
    const shouldAutoSync = typeof forceAutoSync === 'boolean' ? forceAutoSync : autoSyncSchedule

    // When auto-sync is OFF and this is a background poll, skip entirely.
    // The user is managing the lineup manually — don't overwrite their edits.
    if (!shouldAutoSync && isPeriodicPoll) return

    const all = lsLoad()
    let filtered = branchId
      ? all.filter(r => r.lineupDate === date && r.branchId === branchId)
      : []
    const cachedNotes = filtered.find(r => r.service === '__NOTES__')
    if (cachedNotes) {
      setLineupNotes(cachedNotes.remarks || '')
      setNotesRecord(cachedNotes)
    } else {
      setLineupNotes('')
      setNotesRecord(null)
    }
    filtered = filtered.filter(r => r.service !== '__NOTES__' && r.service !== '__WEEKLY_DRIVERS__' && r.service !== '__WEEKLY_INSTALLERS__').sort((a, b) => a.sortOrder - b.sortOrder)
    setRows(filtered)
    if (!branchId) return
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup?date=${date}&branchId=${encodeURIComponent(lineupApiBranchId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          const serverNotes = data.find(r => r.service === '__NOTES__')
          if (serverNotes) {
            setLineupNotes(serverNotes.remarks || '')
            setNotesRecord(serverNotes)
          } else {
            setLineupNotes('')
            setNotesRecord(null)
          }
          const serverRows = data
            .filter(r => r.service !== '__NOTES__' && r.service !== '__WEEKLY_DRIVERS__' && r.service !== '__WEEKLY_INSTALLERS__')
            .map(r => ({
              ...r,
              remarks: normalizeRemarksString(r.remarks || ''),
            }))

          if (shouldAutoSync) {
            const scheduleRows = await deriveRowsFromSchedule(date, branchId, serverRows)
            if (scheduleRows.length > 0) {
              setRows(scheduleRows)
              setDirtyRowIds(prev => {
                const next = new Set(prev)
                scheduleRows.forEach(r => next.add(r.id))
                return next
              })
            } else if (serverRows.length > 0) {
              setRows(serverRows.sort((a, b) => a.sortOrder - b.sortOrder))
            } else {
              setRows([])
            }
          } else {
            // Auto-sync is OFF: display saved server rows only (no schedule derivation)
            if (serverRows.length > 0) {
              setRows(serverRows.sort((a, b) => a.sortOrder - b.sortOrder))
            } else {
              setRows([])
            }
          }
        }
      }
    } catch (e) {
      console.error("Error loading lineup from backend:", e)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, branchId, lineupApiBranchId, autoSyncSchedule])

  const handleToggleAutoSyncSchedule = (val: boolean) => {
    setAutoSyncScheduleState(val)
    localStorage.setItem('ashcol_lineup_auto_sync_schedule', String(val))
    if (val) {
      showToast("Auto Sync Schedule enabled", "info")
      void fetchLineup(true)
    } else {
      showToast("Auto Sync Schedule disabled (using saved lineup)", "info")
      void fetchLineup(false)
    }
  }

  useEffect(() => {
    void fetchLineup()
  }, [fetchLineup])

  useEffect(() => {
    if (!branchId) return
    // When auto-sync is ON, poll every 2 min with schedule derivation.
    // When OFF, still poll the server for any saved lineup changes by colleagues,
    // but pass isPeriodicPoll=true so in-progress manual edits are not disrupted.
    const interval = setInterval(() => { void fetchLineup(undefined, true) }, 120_000)
    return () => clearInterval(interval)
  }, [fetchLineup, branchId])

  const handleUpdateNotes = (val: string) => {
    setLineupNotes(val)
  }

  const handleSaveNotes = async () => {
    if (!branchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const isNewNotes = !notesRecord || !notesRecord.id || notesRecord.id.startsWith('notes-')
    if (isNewNotes) {
      const newRecord: LineUpRow = {
        id: `notes-${Date.now()}`,
        lineupDate: date,
        branchId: lineupApiBranchId,
        service: '__NOTES__',
        driverName: '',
        driverTime: '',
        installerName: '',
        installerTime: '',
        negotiator: '',
        route: '',
        remarks: lineupNotes,
        sortOrder: -99
      }
      try {
        const res = await fetch(`${API_BASE_URL}/v1/lineup`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(newRecord),
        })
        if (res.ok) {
          const saved = await res.json() as LineUpRow
          setNotesRecord(saved)
          const all = lsLoad()
          lsSave([...all, saved])
        }
      } catch (e) {
        console.error("Failed to save notes:", e)
      }
    } else {
      const updatedRecord = { ...notesRecord, remarks: lineupNotes }
      try {
        const res = await fetch(`${API_BASE_URL}/v1/lineup/${notesRecord.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedRecord),
        })
        if (res.ok) {
          const saved = await res.json() as LineUpRow
          setNotesRecord(saved)
          const all = lsLoad()
          const idx = all.findIndex(r => r.id === notesRecord.id)
          if (idx >= 0) all[idx] = saved; else all.push(saved)
          lsSave(all)
        }
      } catch (e) {
        console.error("Failed to save notes:", e)
      }
    }
  }

  const saveCell = async (row: LineUpRow, field: keyof LineUpRow, val: string, shouldClose = true) => {
    if (shouldClose) setEditingCell(null)
    const resolvedId  = localToRealIdRef.current.get(row.id) ?? row.id
    const resolvedRow = resolvedId !== row.id ? { ...row, id: resolvedId } : row
    const oldVal = resolvedRow[field]
    if (oldVal === val) return
    const updatedRow = { ...resolvedRow, [field]: val }
    setRows(prev => prev.map(r => (r.id === row.id || r.id === resolvedId) ? updatedRow : r))
    setDirtyRowIds(prev => {
      const next = new Set(prev)
      next.add(resolvedId)
      return next
    })

    const all = lsLoad()
    const idx = all.findIndex(r => r.id === row.id || r.id === resolvedId)
    if (idx >= 0) all[idx] = updatedRow; else all.push(updatedRow)
    lsSave(all)
  }

  const handleAddRow = () => {
    if (!branchId) return
    const newId = lsNextId()
    const newRow: LineUpRow = {
      id: newId,
      lineupDate: date,
      branchId: lineupApiBranchId,
      service: '',
      driverName: '',
      driverTime: '8:00AM',
      installerName: '',
      installerTime: '7:00AM',
      negotiator: '',
      route: '',
      remarks: '',
      sortOrder: rows.length
    }
    setRows(prev => [...prev, newRow])
    setEditingCell({ rowId: newId, field: 'service' })
    setTempValue('')
  }

  const handleSaveAll = async () => {
    if (editingCell) {
      const activeRow = rows.find(r => r.id === editingCell.rowId)
      if (activeRow) await saveCell(activeRow, editingCell.field, tempValue, true)
    }

    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    let currentRows = [...rows]

    const unsaved = currentRows.filter(r => r.id && (r.id.startsWith('local-') || r.id.startsWith('imported-')))
    if (unsaved.length > 0) {
      for (const row of unsaved) {
        try {
          const res = await fetch(`${API_BASE_URL}/v1/lineup`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(row),
          })
          if (res.ok) {
            const saved = await res.json() as LineUpRow
            currentRows = currentRows.map(r => r.id === row.id ? saved : r)
          }
        } catch (err) {
          console.error('Failed to persist new row:', err)
        }
      }
    }

    const toUpdate = currentRows.filter(r => r.id && !r.id.startsWith('local-') && !r.id.startsWith('imported-') && dirtyRowIds.has(r.id))
    if (toUpdate.length > 0) {
      for (const row of toUpdate) {
        try {
          const res = await fetch(`${API_BASE_URL}/v1/lineup/${row.id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(row),
          })
          if (res.ok) {
            const saved = await res.json() as LineUpRow
            currentRows = currentRows.map(r => r.id === row.id ? saved : r)
          }
        } catch (err) {
          console.error('Failed to update row:', err)
        }
      }
    }

    setRows(currentRows)
    const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId && r.service !== '__WEEKLY_DRIVERS__' && r.service !== '__WEEKLY_INSTALLERS__'))
    lsSave([...all, ...currentRows])
    setDirtyRowIds(new Set())
    if (branchId) void fetchSuggestions(branchId)
    await handleSaveNotes()
    showToast("Line-up schedule saved successfully!", "success")
  }

  const performSyncFromSchedule = async () => {
    if (!branchId) return
    const scheduleRows = await deriveRowsFromSchedule(date, branchId, rows)
    if (scheduleRows.length === 0) {
      showToast("No Schedules tickets found for this date to sync.", "info")
      return
    }
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    try {
      await fetch(`${API_BASE_URL}/v1/lineup/all?branchId=${encodeURIComponent(lineupApiBranchId)}&date=${date}&includeNotes=false`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch (err) {
      console.error('Failed to clear old lineup rows:', err)
    }
    setRows(scheduleRows)
    showToast(`Synced ${scheduleRows.length} row(s) from today's Schedules (unsaved draft)`, "info")
    setDirtyRowIds(prev => {
      const next = new Set(prev)
      scheduleRows.forEach(r => next.add(r.id))
      return next
    })
    const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId && r.service !== '__WEEKLY_DRIVERS__' && r.service !== '__WEEKLY_INSTALLERS__'))
    lsSave([...all, ...scheduleRows])
  }

  const handleSyncFromSchedule = () => {
    if (!branchId) return
    if (rows.length > 0) {
      setConfirmModal({
        title: "Sync from Schedule",
        message: "This will replace your current lineup entries with rows derived from today's Schedules tickets, grouped by vehicle. Continue?",
        confirmText: "Sync",
        cancelText: "Keep Current",
        type: 'warning',
        onConfirm: () => { void performSyncFromSchedule() },
      })
    } else {
      void performSyncFromSchedule()
    }
  }

  const handleDragStart = (_e: React.DragEvent, index: number) => {
    dragSourceIndexRef.current = index
    _e.dataTransfer.effectAllowed = 'move'
    _e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (dragSourceIndexRef.current === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) setDragOverIndex(index)
  }

  const handleDragEnd = () => {
    dragSourceIndexRef.current = null
    setDragOverIndex(null)
  }

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const sourceIndex = dragSourceIndexRef.current
    if (sourceIndex === null || sourceIndex === targetIndex) {
      setDragOverIndex(null)
      return
    }
    const updated = [...rows]
    const [removed] = updated.splice(sourceIndex, 1)
    updated.splice(targetIndex, 0, removed)
    const reordered = updated.map((r, i) => ({ ...r, sortOrder: i }))
    setRows(reordered)
    setDragOverIndex(null)

    const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId))
    lsSave([...all, ...reordered])

    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    for (const row of reordered) {
      if (!row.id.startsWith('local-') && !row.id.startsWith('imported-') && !row.id.startsWith('notes-')) {
        try {
          await fetch(`${API_BASE_URL}/v1/lineup/${row.id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(row),
          })
        } catch (err) {
          console.error("Failed to update sortOrder for row:", row.id, err)
        }
      }
    }
    showToast("Row order updated!", "success")
  }

  const performDelete = async (row: LineUpRow) => {
    const isLocal = !row.id || row.id.startsWith('local-') || row.id.startsWith('imported-')
    if (isLocal) {
      setRows(prev => prev.filter(r => r.id !== row.id))
      const all = lsLoad().filter(r => r.id !== row.id)
      lsSave(all)
      showToast('Row removed.', 'success')
      return
    }
    let deleted = false
    let errMsg = ''
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup/${row.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        deleted = true
      } else {
        try {
          const data = await res.json()
          errMsg = data.message || `Server returned status ${res.status}`
        } catch {
          errMsg = `Server returned status ${res.status}`
        }
      }
    } catch (e: any) {
      errMsg = e.message || 'Network connection failed'
    }
    if (!deleted) {
      const all = lsLoad().filter(r => r.id !== row.id)
      lsSave(all)
      showToast(`Removed locally — DB error: ${errMsg}`, 'error')
    } else {
      setRows(prev => prev.filter(r => r.id !== row.id))
      const all = lsLoad().filter(r => r.id !== row.id)
      lsSave(all)
      showToast('Row deleted successfully.', 'success')
    }
    if (branchId) void fetchSuggestions(branchId)
  }

  const handleDelete = (row: LineUpRow) => {
    setConfirmModal({
      title: 'Delete Row',
      message: `Remove ${row.service || 'this entry'}${row.installerName ? ` — ${row.installerName}` : ''} from the line-up?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: () => { void performDelete(row) },
    })
  }

  const totalUnits = rows.reduce((acc, r) => {
    const remarks = r.remarks || ''
    if (!/INSTALL/i.test(remarks)) return acc
    const unitSum = sumAllUnits(remarks)
    if (unitSum > 0) return acc + unitSum
    const matches = remarks.match(/INSTALL/gi)
    return acc + (matches ? matches.length : 1)
  }, 0)

  const totalSurvey = rows.reduce((acc, r) => {
    const remarks = r.remarks || ''
    const route = r.route || ''
    if (!/SURVEY/i.test(remarks) && !/SURVEY/i.test(route)) return acc
    const unitSum = sumAllUnits(remarks)
    if (unitSum > 0) return acc + unitSum
    const matches = remarks.match(/SURVEY/gi)
    return acc + (matches ? matches.length : 1)
  }, 0)

  const totalCleaning = rows.reduce((acc, r) => {
    const remarks = r.remarks || ''
    const route = r.route || ''
    const isCleaning = /CLEANING/i.test(remarks) || /CLEANING/i.test(route)
    if (!isCleaning) return acc
    const unitSum = sumAllUnits(remarks)
    if (unitSum > 0) return acc + unitSum
    const matches = remarks.match(/CLEANING/gi)
    return acc + (matches ? matches.length : 1)
  }, 0)

  const totalDismantle = rows.reduce((acc, r) => {
    const remarks = r.remarks || ''
    const route = r.route || ''
    const isServiceDismantle = /DISMANTLE/i.test(remarks) || /DISMANTLE/i.test(route) ||
                               /CHECK\s*UP/i.test(remarks) ||
                               /SERVICE/i.test(remarks)
    if (!isServiceDismantle) return acc
    const unitSum = sumAllUnits(remarks)
    if (unitSum > 0) return acc + unitSum
    const matches = remarks.match(/DISMANTLE|CHECK\s*UP|SERVICE/gi)
    return acc + (matches ? matches.length : 1)
  }, 0)

  const processLineupImage = async (file: File) => {
    setScanPreview(URL.createObjectURL(file))
    setScanning(true)
    setScanError('')
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${API_BASE_URL}/v1/lineup/scan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json() as Record<string, unknown>
      let parsedRows: LineUpRow[] = []
      if (Array.isArray(data.rows)) {
        parsedRows = (data.rows as any[]).map((r: any, i: number) => ({
          id: lsNextId(), lineupDate: date, branchId,
          service: r.service || r.SERVICE || '',
          driverName: r.driver || r.driverName || r.DRIVER || '',
          driverTime: r.driverTime || r.driverScheduledTime || '8:00AM',
          installerName: r.installer || r.installerName || r.INSTALLER || r.technician || r.technicianName || r.TECHNICIAN || '',
          installerTime: r.installerTime || r.installerScheduledTime || r.technicianTime || r.technicianScheduledTime || '7:00AM',
          negotiator: r.negotiator || r.negotiatorName || r.NEGOTIATOR || '',
          route: r.route || r.ROUTE || '',
          remarks: r.remarks || r.REMARKS || '',
          sortOrder: i,
        }))
      }
      if (parsedRows.length > 0) {
        const capturedToken = token
        setConfirmModal({
          title: 'AI Scanner',
          message: `Scanner found ${parsedRows.length} row${parsedRows.length === 1 ? '' : 's'}. Replace the current lineup for this date?`,
          confirmText: 'Replace Lineup',
          cancelText: 'Cancel',
          type: 'warning',
          onConfirm: async () => {
            try {
              await fetch(`${API_BASE_URL}/v1/lineup/all?branchId=${encodeURIComponent(lineupApiBranchId)}&date=${date}&includeNotes=false`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${capturedToken}` }
              })
            } catch (err) {
              console.error('Failed to clear old lineup rows during scan replacement:', err)
            }
            let savedRows: LineUpRow[] = []
            let failedCount = 0
            let lastErrorMessage = ''
            for (const row of parsedRows) {
              try {
                const apiRes = await fetch(`${API_BASE_URL}/v1/lineup`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${capturedToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(row),
                })
                if (apiRes.ok) {
                  savedRows.push(await apiRes.json() as LineUpRow)
                } else {
                  failedCount++
                  try { const t = await apiRes.text(); if (t) lastErrorMessage = t } catch {}
                  savedRows.push(row)
                }
              } catch (err: any) {
                failedCount++
                lastErrorMessage = err.message || 'Network error'
                savedRows.push(row)
              }
            }
            const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId))
            lsSave([...all, ...savedRows])
            void fetchLineup()
            if (branchId) void fetchSuggestions(branchId)
            if (failedCount > 0) {
              setScanError(`Warning: ${failedCount}/${parsedRows.length} rows failed to save. Error: ${lastErrorMessage}`)
            } else {
              showToast(`Scan complete — ${parsedRows.length} rows imported ✓`, 'success')
            }
          },
        })
      } else {
        setScanError('Scanner could not extract lineup rows. Check the image or add rows manually.')
      }
    } catch (e: any) {
      setScanError(e.message || 'Scan failed. Make sure the backend is running.')
    } finally {
      setScanning(false)
      if (scanFileRef.current) scanFileRef.current.value = ''
    }
  }

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) processLineupImage(f)
  }

  useEffect(() => {
    const dismiss = (e: MouseEvent) => {
      const menuEl = document.getElementById('row-context-menu')
      if (menuEl && !menuEl.contains(e.target as Node)) {
        setActiveMenu(null)
      }
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [])

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (scanning) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) { void processLineupImage(new File([blob], 'pasted.png', { type: item.type })); return }
        }
      }
    }
    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [scanning])

  const handleExportShowcasePng = async () => {
    if (!captureAreaRef.current || exportingPng) return
    setExportingPng(true)
    try {
      const el = captureAreaRef.current
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: isLight ? '#ffffff' : '#07111f',
        windowWidth: el.scrollWidth || el.clientWidth || 1600,
      })
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      const cleanBranch = (branchName || 'Field').replace(/[^a-zA-Z0-9_-]/g, '_')
      const cleanDate = activeTab === 'weekly' ? 'Weekly' : (date || 'Schedule')
      link.download = `LineUp_${cleanBranch}_${cleanDate}.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast('Showcase table saved as PNG ✓', 'success')
    } catch (err) {
      console.error('Failed to export showcase PNG:', err)
      showToast('Failed to export showcase image', 'error')
    } finally {
      setExportingPng(false)
    }
  }

  const handleCopyShowcaseImage = async () => {
    if (!captureAreaRef.current || copyingImage) return
    setCopyingImage(true)
    try {
      const el = captureAreaRef.current
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: isLight ? '#ffffff' : '#07111f',
        windowWidth: el.scrollWidth || el.clientWidth || 1600,
      })

      canvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('Failed to generate image', 'error')
          setCopyingImage(false)
          return
        }
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ])
            setCopiedImage(true)
            setTimeout(() => setCopiedImage(false), 2500)
            showToast('Image copied to clipboard! You can paste (Ctrl+V) anywhere.', 'success')
          } else {
            const dataUrl = canvas.toDataURL('image/png')
            const link = document.createElement('a')
            const cleanBranch = (branchName || 'Field').replace(/[^a-zA-Z0-9_-]/g, '_')
            const cleanDate = activeTab === 'weekly' ? 'Weekly' : (date || 'Schedule')
            link.download = `LineUp_${cleanBranch}_${cleanDate}.png`
            link.href = dataUrl
            link.click()
            showToast('Clipboard image write not supported; image downloaded instead.', 'info')
          }
        } catch (clipErr) {
          console.error('Clipboard write error:', clipErr)
          const dataUrl = canvas.toDataURL('image/png')
          const link = document.createElement('a')
          const cleanBranch = (branchName || 'Field').replace(/[^a-zA-Z0-9_-]/g, '_')
          const cleanDate = activeTab === 'weekly' ? 'Weekly' : (date || 'Schedule')
          link.download = `LineUp_${cleanBranch}_${cleanDate}.png`
          link.href = dataUrl
          link.click()
          showToast('Clipboard access denied; image downloaded as PNG instead.', 'info')
        } finally {
          setCopyingImage(false)
        }
      }, 'image/png')
    } catch (err) {
      console.error('Failed to copy showcase image:', err)
      showToast('Failed to capture showcase image', 'error')
      setCopyingImage(false)
    }
  }

  const performExcelImport = async (parsedRows: LineUpRow[]) => {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    try {
      await fetch(`${API_BASE_URL}/v1/lineup/all?branchId=${encodeURIComponent(lineupApiBranchId)}&date=${date}&includeNotes=false`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch (err) {
      console.error('Failed to clear old lineup rows during import:', err)
    }

    let failedCount = 0
    let lastErrorMessage = ''
    const savedRows: LineUpRow[] = []

    for (const row of parsedRows) {
      try {
        const apiRes = await fetch(`${API_BASE_URL}/v1/lineup`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(row),
        })
        if (apiRes.ok) {
          savedRows.push(await apiRes.json() as LineUpRow)
        } else {
          failedCount++
          try { const t = await apiRes.text(); if (t) lastErrorMessage = t } catch {}
          savedRows.push(row)
        }
      } catch (err: any) {
        failedCount++
        lastErrorMessage = err.message || 'Network error'
        savedRows.push(row)
      }
    }

    const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId))
    lsSave([...all, ...savedRows])
    void fetchLineup()
    if (branchId) void fetchSuggestions(branchId)
    if (failedCount === 0) {
      showToast(`Imported ${parsedRows.length} rows — synced to server ✓`, 'success')
    } else {
      showToast(`Imported ${parsedRows.length - failedCount}/${parsedRows.length} rows. ${failedCount} failed: ${lastErrorMessage}`, 'error')
    }
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !branchId) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' })
        const rawData = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]])
        if (!rawData || rawData.length === 0) { showToast('The selected sheet appears to be empty.', 'error'); return }
        const parsedRows: LineUpRow[] = []
        rawData.forEach((row: any, index: number) => {
          const k = (re: RegExp, ex?: RegExp) => Object.keys(row).find(key => re.test(key) && (!ex || !ex.test(key)))
          const service = k(/service/i) ? String(row[k(/service/i)!] || '').trim() : ''
          const driverName = k(/driver/i, /time/i) ? String(row[k(/driver/i, /time/i)!] || '').trim() : ''
          const driverTime = k(/driver/i, undefined) && k(/time/i) ? String(row[k(/driver/i)!] || '').trim() : '8:00AM'
          const installerNameKey = k(/installer/i, /time/i) || k(/technician/i, /time/i)
          const installerName = installerNameKey ? String(row[installerNameKey] || '').trim() : ''
          const installerTime = (k(/installer/i) || k(/technician/i)) && k(/time/i) ? '7:00AM' : '7:00AM'
          const negotiator = k(/negotiator/i) ? String(row[k(/negotiator/i)!] || '').trim() : ''
          const route = k(/route/i) ? String(row[k(/route/i)!] || '').trim() : ''
          const remarks = k(/remark/i) ? String(row[k(/remark/i)!] || '').trim() : ''

          if (service || route || driverName || installerName || negotiator) {
            parsedRows.push({ id: `imported-${Date.now()}-${index}`, lineupDate: date, branchId, service, driverName, driverTime, installerName, installerTime, negotiator, route, remarks, sortOrder: index })
          }
        })
        if (parsedRows.length === 0) { showToast('No valid lineup rows found in file.', 'error'); return }
        setConfirmModal({
          title: 'Import Excel',
          message: `Import ${parsedRows.length} lineup entr${parsedRows.length === 1 ? 'y' : 'ies'} for ${branchName}? This will replace current entries for ${date}.`,
          confirmText: 'Import',
          cancelText: 'Cancel',
          type: 'info',
          onConfirm: () => { void performExcelImport(parsedRows) },
        })
      } catch {
        showToast('Error parsing Excel file.', 'error')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // ── Weekly Schedule State ──────────────────────────────────────────────────
  const [wKind, setWKind] = useState<WScheduleKind>('drivers')
  const [wAnchorDate, setWAnchorDate] = useState(() => wToDateKey(wGetWeekStart(wToDateKey(new Date()))))
  const wDays = useMemo(() => wGetWeekDays(wAnchorDate), [wAnchorDate])
  const wWeekKey = wDays[0]

  const [wDrivers, setWDrivers] = useState<WPersonSchedule[]>(() => wLoadSchedule('drivers', wGetWeekDays(wToDateKey(new Date()))[0], wGetWeekDays(wToDateKey(new Date())), branchId, branchStaffRoster.drivers, branchStaffRoster.installers))
  const [wInstallers, setWInstallers] = useState<WPersonSchedule[]>(() => wLoadSchedule('installers', wGetWeekDays(wToDateKey(new Date()))[0], wGetWeekDays(wToDateKey(new Date())), branchId, branchStaffRoster.drivers, branchStaffRoster.installers))
  const [wDriversRecord, setWDriversRecord] = useState<LineUpRow | null>(null)
  const [wInstallersRecord, setWInstallersRecord] = useState<LineUpRow | null>(null)
  const [loadingWeekly, setLoadingWeekly] = useState(false)
  const [savedWeeks, setSavedWeeks] = useState<string[]>([])

  const wRows = wKind === 'drivers' ? wDrivers : wInstallers
  const wSetRows = (next: WPersonSchedule[]) => {
    if (wKind === 'drivers') setWDrivers(next); else setWInstallers(next)
    wSaveSchedule(wKind, wWeekKey, next, branchId)
  }

  // Reset weekly schedule state whenever the active branch changes to avoid cross-branch bleeding
  useEffect(() => {
    setWDriversRecord(null)
    setWInstallersRecord(null)
    setWDrivers(wLoadSchedule('drivers', wWeekKey, wDays, branchId, branchStaffRoster.drivers, branchStaffRoster.installers))
    setWInstallers(wLoadSchedule('installers', wWeekKey, wDays, branchId, branchStaffRoster.drivers, branchStaffRoster.installers))
  }, [branchId, wWeekKey, wDays, branchStaffRoster.drivers, branchStaffRoster.installers])

  const wReloadWeek = (nextDate: string) => {
    const nd = wGetWeekDays(nextDate)
    const nw = nd[0]
    setWAnchorDate(nextDate)
    setWDriversRecord(null)
    setWInstallersRecord(null)
    setWDrivers(wLoadSchedule('drivers', nw, nd, branchId, branchStaffRoster.drivers, branchStaffRoster.installers))
    setWInstallers(wLoadSchedule('installers', nw, nd, branchId, branchStaffRoster.drivers, branchStaffRoster.installers))
  }

  const fetchWeeklySchedule = useCallback(async () => {
    if (!lineupApiBranchId) return
    setLoadingWeekly(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(
        `${API_BASE_URL}/v1/lineup/week?weekStart=${wWeekKey}&branchId=${encodeURIComponent(lineupApiBranchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.ok) {
        const data = await res.json()
        setSavedWeeks(Array.isArray(data.savedWeeks) ? data.savedWeeks : [])
        const driversRec = data.weeklyDrivers as LineUpRow | null | undefined
        const installersRec = data.weeklyInstallers as LineUpRow | null | undefined
        if (driversRec?.remarks && (!driversRec.branchId || driversRec.branchId === lineupApiBranchId)) {
          setWDriversRecord(driversRec)
          try {
            const parsed = JSON.parse(driversRec.remarks)
            if (Array.isArray(parsed)) {
              setWDrivers(parsed)
              wSaveSchedule('drivers', wWeekKey, parsed, branchId)
            }
          } catch (err) {
            console.error("Failed to parse weekly drivers from DB:", err)
          }
        } else {
          setWDriversRecord(null)
          setWDrivers(wLoadSchedule('drivers', wWeekKey, wDays, branchId, branchStaffRoster.drivers, branchStaffRoster.installers))
        }
        if (installersRec?.remarks && (!installersRec.branchId || installersRec.branchId === lineupApiBranchId)) {
          setWInstallersRecord(installersRec)
          try {
            const parsed = JSON.parse(installersRec.remarks)
            if (Array.isArray(parsed)) {
              setWInstallers(parsed)
              wSaveSchedule('installers', wWeekKey, parsed, branchId)
            }
          } catch (err) {
            console.error("Failed to parse weekly installers from DB:", err)
          }
        } else {
          setWInstallersRecord(null)
          setWInstallers(wLoadSchedule('installers', wWeekKey, wDays, branchId, branchStaffRoster.drivers, branchStaffRoster.installers))
        }
      }
    } catch (e) {
      console.error("Error loading weekly schedule from backend:", e)
    } finally {
      setLoadingWeekly(false)
    }
  }, [wWeekKey, lineupApiBranchId, wDays, branchId, branchStaffRoster.drivers, branchStaffRoster.installers])

  useEffect(() => {
    void fetchWeeklySchedule()
  }, [fetchWeeklySchedule])

  // Re-fetch from server every time the user navigates to the weekly tab
  useEffect(() => {
    if (activeTab === 'weekly') void fetchWeeklySchedule()
  }, [activeTab, fetchWeeklySchedule])

  const handleSaveWeeklySchedule = async () => {
    if (!lineupApiBranchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    setLoadingWeekly(true)
    try {
      const checkRes = await fetch(
        `${API_BASE_URL}/v1/lineup/week?weekStart=${wWeekKey}&branchId=${encodeURIComponent(lineupApiBranchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      let dbDriversRec: LineUpRow | null = null
      let dbInstallersRec: LineUpRow | null = null
      if (checkRes.ok) {
        const data = await checkRes.json()
        if (data.weeklyDrivers && (!data.weeklyDrivers.branchId || data.weeklyDrivers.branchId === lineupApiBranchId)) {
          dbDriversRec = data.weeklyDrivers as LineUpRow
        }
        if (data.weeklyInstallers && (!data.weeklyInstallers.branchId || data.weeklyInstallers.branchId === lineupApiBranchId)) {
          dbInstallersRec = data.weeklyInstallers as LineUpRow
        }
        if (Array.isArray(data.savedWeeks)) setSavedWeeks(data.savedWeeks)
      }
      if (!dbDriversRec && wDriversRecord && wDriversRecord.branchId === lineupApiBranchId) {
        dbDriversRec = wDriversRecord
      }
      if (!dbInstallersRec && wInstallersRecord && wInstallersRecord.branchId === lineupApiBranchId) {
        dbInstallersRec = wInstallersRecord
      }

      const driversDataStr = JSON.stringify(wDrivers)
      const isNewDrivers = !dbDriversRec || !dbDriversRec.id || (dbDriversRec.branchId && dbDriversRec.branchId !== lineupApiBranchId)
      const driversPayload: LineUpRow = {
        id: isNewDrivers ? `w-drivers-${Date.now()}` : dbDriversRec!.id,
        lineupDate: wWeekKey,
        branchId: lineupApiBranchId,
        service: '__WEEKLY_DRIVERS__',
        driverName: '',
        driverTime: '',
        installerName: '',
        installerTime: '',
        negotiator: '',
        route: '',
        remarks: driversDataStr,
        sortOrder: -100
      }

      const installersDataStr = JSON.stringify(wInstallers)
      const isNewInstallers = !dbInstallersRec || !dbInstallersRec.id || (dbInstallersRec.branchId && dbInstallersRec.branchId !== lineupApiBranchId)
      const installersPayload: LineUpRow = {
        id: isNewInstallers ? `w-installers-${Date.now()}` : dbInstallersRec!.id,
        lineupDate: wWeekKey,
        branchId: lineupApiBranchId,
        service: '__WEEKLY_INSTALLERS__',
        driverName: '',
        driverTime: '',
        installerName: '',
        installerTime: '',
        negotiator: '',
        route: '',
        remarks: installersDataStr,
        sortOrder: -101
      }

      let dRes
      if (isNewDrivers) {
        dRes = await fetch(`${API_BASE_URL}/v1/lineup`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(driversPayload),
        })
      } else {
        dRes = await fetch(`${API_BASE_URL}/v1/lineup/${dbDriversRec!.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(driversPayload),
        })
      }
      if (dRes.ok) {
        const savedD = await dRes.json() as LineUpRow
        setWDriversRecord(savedD)
        wSaveSchedule('drivers', wWeekKey, wDrivers, branchId)
      }

      let iRes
      if (isNewInstallers) {
        iRes = await fetch(`${API_BASE_URL}/v1/lineup`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(installersPayload),
        })
      } else {
        iRes = await fetch(`${API_BASE_URL}/v1/lineup/${dbInstallersRec!.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(installersPayload),
        })
      }
      if (iRes.ok) {
        const savedI = await iRes.json() as LineUpRow
        setWInstallersRecord(savedI)
        wSaveSchedule('installers', wWeekKey, wInstallers, branchId)
      }

      if (dRes.ok && iRes.ok) {
        showToast("Weekly schedule saved to database successfully!", "success")
      } else {
        showToast("Some schedules failed to save. Please try again.", "error")
      }
    } catch (err) {
      console.error("Failed to save weekly schedule:", err)
      showToast("Network error. Weekly schedule cached locally.", "error")
    } finally {
      setLoadingWeekly(false)
    }
  }

  const wUpdatePerson = (id: string, patch: Partial<WPersonSchedule>) =>
    wSetRows(wRows.map(r => r.id === id ? { ...r, ...patch } : r))

  const wUpdateDay = (id: string, day: string, patch: Partial<WPersonSchedule['days'][string]>) =>
    wSetRows(wRows.map(r => r.id === id ? { ...r, days: { ...r.days, [day]: { ...(r.days[day] || { status: 'WITH SCHED', note: '', units: '' }), ...patch } } } : r))

  const wAddPerson = () => {
    const next: WPersonSchedule = {
      id: `${wKind}-${Date.now()}`, name: '', roleNote: 'IN-HOUSE', photoUrl: '',
      days: Object.fromEntries(wDays.map(day => [day, { status: 'WITH SCHED', note: '', units: '1' }])) as WPersonSchedule['days'],
      totalUnitsTeamWork: '', totalUnitsCleaning: '', remarks: '',
    }
    wSetRows([...wRows, next])
  }

  const wRemovePerson = (id: string) => wSetRows(wRows.filter(r => r.id !== id))

  const wHandlePhotoUpload = (id: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      showToast("Image size must be 10MB or less.", "error")
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_DIM = 160
        let w = img.width
        let h = img.height
        if (w > h) {
          if (w > MAX_DIM) {
            h = Math.round((h * MAX_DIM) / w)
            w = MAX_DIM
          }
        } else {
          if (h > MAX_DIM) {
            w = Math.round((w * MAX_DIM) / h)
            h = MAX_DIM
          }
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          wUpdatePerson(id, { photoUrl: dataUrl })
          showToast("Photo uploaded successfully!", "success")
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ minHeight: '100%', backgroundColor: pageBg }} className="px-4 md:px-8 pt-2 pb-10">
      <LineUpHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        date={date}
        setDate={setDate}
        desktopDateInputRef={desktopDateInputRef}
        showcaseOpen={showcaseOpen}
        setShowcaseOpen={setShowcaseOpen}
        canEdit={canEdit}
        currentTheme={currentTheme}
        isLight={isLight}
        cardBg={cardBg}
        border={border}
        textPrimary={textPrimary}
        textMuted={textMuted}
        inputBg={inputBg}
        inputBorder={inputBorder}
        autoSyncSchedule={autoSyncSchedule}
        setAutoSyncSchedule={handleToggleAutoSyncSchedule}
        handleSyncFromSchedule={handleSyncFromSchedule}
        handleAddRow={handleAddRow}
        toast={toast}
        setToast={setToast}
        confirmModal={confirmModal}
        setConfirmModal={setConfirmModal}
        fileInputRef={fileInputRef}
        scanFileRef={scanFileRef}
        handleImportExcel={handleImportExcel}
        handleScanFile={handleScanFile}
      />

      {activeTab === 'field' && (
        <div
          style={{
            backgroundColor: pageBg,
            minHeight: '100%',
            '--branch-accent': currentTheme.accent,
            '--branch-accent-dark': currentTheme.accentDark,
            '--branch-accent-light': currentTheme.accentLight,
            '--page-bg': pageBg,
            '--card-bg': cardBg,
            '--text-main': textPrimary,
            '--text-muted': textMuted,
            '--border-color': border,
            '--date-bar-bg': '#020617',
          } as React.CSSProperties}
        >
          {/* Mobile View */}
          <div className="md:hidden pb-12">
            <MobileLineUpView
              rows={rows}
              date={date}
              branchName={branchName}
              isTaguigServices={isTaguigServices}
              currentTheme={currentTheme}
              isLight={isLight}
              cardBg={cardBg}
              border={border}
              textPrimary={textPrimary}
              textMuted={textMuted}
              inputBg={inputBg}
              inputBorder={inputBorder}
              canEdit={canEdit}
              loading={loading}
              showcaseOpen={showcaseOpen}
              lineupNotes={lineupNotes}
              totalUnits={totalUnits}
              totalSurvey={totalSurvey}
              totalDismantle={totalDismantle}
              totalCleaning={totalCleaning}
              scanError={scanError}
              setScanError={setScanError}
              scanPreview={scanPreview}
              setScanPreview={setScanPreview}
              expandedCard={expandedCard}
              setExpandedCard={setExpandedCard}
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              tempValue={tempValue}
              setTempValue={setTempValue}
              handleAddRow={handleAddRow}
              handleSaveAll={handleSaveAll}
              handleUpdateNotes={handleUpdateNotes}
              handleSaveNotes={handleSaveNotes}
              saveCell={saveCell}
              handleDelete={handleDelete}
              finalVehicleOptions={finalVehicleOptions}
              finalDriverOptions={finalDriverOptions}
              finalInstallerOptions={finalInstallerOptions}
              finalNegotiatorOptions={finalNegotiatorOptions}
              finalRouteOptions={finalRouteOptions}
              finalRemarksOptions={finalRemarksOptions}
              captureAreaRef={captureAreaRef}
              getVehiclePlate={getVehiclePlate}
              getVehicleCodingStatus={getVehicleCodingStatus}
            />
          </div>

          {/* Desktop View */}
          <div className="hidden md:flex flex-col gap-6 pb-8">
            <EditableTable
              rows={rows}
              date={date}
              branchName={branchName}
              isTaguigServices={isTaguigServices}
              currentTheme={currentTheme}
              isLight={isLight}
              cardBg={cardBg}
              border={border}
              textPrimary={textPrimary}
              textMuted={textMuted}
              inputBg={inputBg}
              inputBorder={inputBorder}
              canEdit={canEdit}
              loading={loading}
              lineupNotes={lineupNotes}
              totalUnits={totalUnits}
              totalSurvey={totalSurvey}
              totalDismantle={totalDismantle}
              totalCleaning={totalCleaning}
              scanError={scanError}
              setScanError={setScanError}
              scanPreview={scanPreview}
              setScanPreview={setScanPreview}
              selectedRowId={selectedRowId}
              setSelectedRowId={setSelectedRowId}
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              tempValue={tempValue}
              setTempValue={setTempValue}
              activeMenu={activeMenu}
              setActiveMenu={setActiveMenu}
              dragOverIndex={dragOverIndex}
              dragSourceIndexRef={dragSourceIndexRef}
              handleDragStart={handleDragStart}
              handleDragOver={handleDragOver}
              handleDragEnd={handleDragEnd}
              handleDrop={handleDrop}
              handleUpdateNotes={handleUpdateNotes}
              handleSaveNotes={handleSaveNotes}
              handleSaveAll={handleSaveAll}
              saveCell={saveCell}
              handleDelete={handleDelete}
              finalVehicleOptions={finalVehicleOptions}
              finalDriverOptions={finalDriverOptions}
              finalInstallerOptions={finalInstallerOptions}
              finalNegotiatorOptions={finalNegotiatorOptions}
              finalRouteOptions={finalRouteOptions}
              finalRemarksOptions={finalRemarksOptions}
              captureAreaRef={captureAreaRef}
              getVehiclePlate={getVehiclePlate}
              getVehicleCodingStatus={getVehicleCodingStatus}
              isNavigatingRef={isNavigatingRef}
            />
          </div>
        </div>
      )}

      {activeTab === 'weekly' && (
        <WeeklyTab
          wKind={wKind}
          setWKind={setWKind}
          wDays={wDays}
          wWeekKey={wWeekKey}
          wRows={wRows}
          wAnchorDate={wAnchorDate}
          savedWeeks={savedWeeks}
          loadingWeekly={loadingWeekly}
          showcaseOpen={showcaseOpen}
          setShowcaseOpen={setShowcaseOpen}
          currentTheme={currentTheme}
          isTaguigServices={isTaguigServices}
          isLight={isLight}
          cardBg={cardBg}
          border={border}
          textPrimary={textPrimary}
          textMuted={textMuted}
          inputBg={inputBg}
          weeklyDateInputRef={weeklyDateInputRef}
          wReloadWeek={wReloadWeek}
          wAddPerson={wAddPerson}
          wRemovePerson={wRemovePerson}
          wUpdatePerson={wUpdatePerson}
          wUpdateDay={wUpdateDay}
          wHandlePhotoUpload={wHandlePhotoUpload}
          handleSaveWeeklySchedule={handleSaveWeeklySchedule}
        />
      )}

      {activeTab === 'vehicles' && (
        <VehiclesTab
          vehicles={vehicles}
          branches={branches}
          vehicleFilterBranch={vehicleFilterBranch}
          setVehicleFilterBranch={setVehicleFilterBranch}
          canEdit={canEdit}
          currentTheme={currentTheme}
          lineupDayOfWeek={lineupDayOfWeek}
          isLight={isLight}
          cardBg={cardBg}
          border={border}
          textPrimary={textPrimary}
          textMuted={textMuted}
          handleAddVehicle={handleAddVehicle}
          handleDeleteVehicle={handleDeleteVehicle}
          handleUpdateVehicle={handleUpdateVehicle}
        />
      )}

      {/* Fullscreen Showcase Overlay */}
      <ShowcaseModal
        showcaseOpen={showcaseOpen}
        setShowcaseOpen={setShowcaseOpen}
        activeTab={activeTab}
        wKind={wKind}
        wDays={wDays}
        wRows={wRows}
        rows={rows}
        date={date}
        branchName={branchName}
        isTaguigServices={isTaguigServices}
        currentTheme={currentTheme}
        isLight={isLight}
        border={border}
        textPrimary={textPrimary}
        textMuted={textMuted}
        lineupNotes={lineupNotes}
        totalUnits={totalUnits}
        totalSurvey={totalSurvey}
        totalDismantle={totalDismantle}
        totalCleaning={totalCleaning}
        exportingPng={exportingPng}
        copyingImage={copyingImage}
        copiedImage={copiedImage}
        captureAreaRef={captureAreaRef}
        getVehiclePlate={getVehiclePlate}
        getVehicleCodingStatus={getVehicleCodingStatus}
        handleExportShowcasePng={handleExportShowcasePng}
        handleCopyShowcaseImage={handleCopyShowcaseImage}
      />

      {/* Print Styles */}
      <style>{`
        :root {
          --branch-accent: ${currentTheme.accent};
          --branch-accent-dark: ${currentTheme.accentDark};
          --branch-accent-light: ${currentTheme.accentLight};
        }
        @media print {
          @page {
            size: landscape;
            margin: 8mm;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .no-print, nav, header, aside, .lineup-sticky-save, #row-context-menu {
            display: none !important;
          }
          .print-area {
            box-shadow: none !important;
            border: 1px solid #000000 !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #000000 !important;
            padding: 8px 10px !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          th {
            background-color: #f1f5f9 !important;
            font-weight: 800 !important;
          }
        }
      `}</style>
    </div>
  )
}
