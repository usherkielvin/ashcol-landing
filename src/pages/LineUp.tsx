import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  Plus, Trash2, Edit3, X, Printer, ClipboardList, Upload, Download, Building2,
  ClipboardPaste, Loader2, Truck, User, Clock, MapPin, MessageSquare,
  ChevronDown, Camera, Copy, Save, Check, Maximize2, ArrowLeft,
  CalendarDays, Wrench, Users,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

const branchThemes: Record<string, { name: string; accent: string; accentDark: string; accentLight: string }> = {
  "TAGUIG SALES": {
    name: "Emerald Green",
    accent: "#059669",
    accentDark: "#047857",
    accentLight: "#D1FAE5"
  },
  "TAGUIG SERVICES": {
    name: "Technical Teal",
    accent: "#0F766E",
    accentDark: "#115E59",
    accentLight: "#CCFBF1"
  },
  "PAMPANGA": {
    name: "Crimson Red",
    accent: "#DC2626",
    accentDark: "#991B1B",
    accentLight: "#FEE2E2"
  },
  "DASMA": {
    name: "Royal Blue",
    accent: "#2563EB",
    accentDark: "#1D4ED8",
    accentLight: "#DBEAFE"
  },
  "BULACAN": {
    name: "Violet Purple",
    accent: "#7C3AED",
    accentDark: "#5B21B6",
    accentLight: "#EDE9FE"
  },
  "CANDELARIA": {
    name: "Arctic Teal",
    accent: "#14B8A6",
    accentDark: "#0F766E",
    accentLight: "#CCFBF1"
  },
  "SILANG": {
    name: "Ice Cyan",
    accent: "#0891B2",
    accentDark: "#0E7490",
    accentLight: "#E0F7FA"
  },
  "RIZAL": {
    name: "Indigo",
    accent: "#4338CA",
    accentDark: "#312E81",
    accentLight: "#E0E7FF"
  },
  "CALAUAN": {
    name: "Rose Pink",
    accent: "#EC4899",
    accentDark: "#BE185D",
    accentLight: "#FCE7F3"
  }
};

const getBranchThemeKey = (name: string): string => {
  const upper = name.toUpperCase().trim()
  if (upper === 'LAGUNA' || upper === 'CALAUAN') return 'CALAUAN'
  if (upper === 'DASMARIÑAS' || upper === 'DASMA') return 'DASMA'
  if (branchThemes[upper]) return upper
  return 'TAGUIG SALES' // fallback
}


const VEHICLE_OPTIONS = ['STRADA', 'T3', 'FB19', 'T2']
const DRIVER_OPTIONS = ['ANGELO', 'JOJO', 'ADAM', 'DOMINIC']
const INSTALLER_OPTIONS = ['RANIL', 'JHUMAR', 'KENNAN', 'CRIS', 'SONNY', 'RYAN', 'ALLAN']
const ROUTE_OPTIONS = [
  'QC - MANILA',
  'TAGUIG - TAGUIG - TAGUIG - TAGUIG',
  'MANDALUYONG - QC',
  'QC - QC',
  'CAINTA - CAINTA - MARIKINA'
]
const REMARKS_OPTIONS = [
  'INSTALL - INSTALL - (3UNITS)',
  'INSTALL - INSTALL - INSTALL - INSTALL (TEAMWORK) - 4 UNITS',
  'INSTALL - INSTALL (2 UNITS)',
  'INSTALL - INSTALL (3 UNITS)'
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toLocalDateStr(d)
}
function englishLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`.toUpperCase()
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineUpRow {
  id: string
  lineupDate: string
  branchId: string
  service: string
  driverName: string
  driverTime: string
  installerName: string
  installerTime: string
  route: string
  remarks: string
  sortOrder: number
}



const LS_KEY = 'ashcol_lineup_v2'
function lsLoad(): LineUpRow[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function lsSave(rows: LineUpRow[]) { localStorage.setItem(LS_KEY, JSON.stringify(rows)) }
function lsNextId() { return `local-${Date.now()}-${Math.random().toString(36).slice(2)}` }

// ── Component ─────────────────────────────────────────────────────────────────

export default function LineUp() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  // ── Inner tab routing ────────────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'weekly' ? 'weekly' : 'field'
  const setActiveTab = (tab: 'field' | 'weekly') =>
    setSearchParams(tab === 'weekly' ? { tab: 'weekly' } : {}, { replace: true })

  const role      = (user?.role || '').toLowerCase()
  const canEdit   = role === 'admin' || role === 'manager' || role === 'staff' || role === 'employee' || role === 'oic'

  const [date, setDate]         = useState(tomorrowStr)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState('')

  const branchName = branches.find(b => b.id === branchId)?.name ?? ''
  const currentThemeKey = getBranchThemeKey(branchName)
  const currentTheme = branchThemes[currentThemeKey] || branchThemes["TAGUIG SALES"]

  const cardBg      = isLight ? '#FFFFFF'  : '#1E293B'
  const pageBg      = isLight ? '#F8FAFC'  : '#0F172A'
  const border      = isLight ? '#E2E8F0'  : '#334155'
  const textPrimary = isLight ? '#0F172A'  : '#F8FAFC'
  const textMuted   = isLight ? '#64748B'  : '#CBD5E1'
  const inputBg     = isLight ? '#F8FAFC'  : '#0F172A'
  const inputBorder = isLight ? '#E2E8F0'  : '#334155'

  const [rows, setRows]         = useState<LineUpRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const scanFileRef    = useRef<HTMLInputElement>(null)
  const printAreaRef   = useRef<HTMLDivElement>(null)
  const importMenuRef  = useRef<HTMLDivElement>(null)
  const exportMenuRef  = useRef<HTMLDivElement>(null)
  // Save-race prevention: map local-* IDs → real DB IDs, and track in-flight POSTs
  const localToRealIdRef    = useRef<Map<string, string>>(new Map())
  const pendingLocalSaveRef = useRef<Set<string>>(new Set())
  const [scanning, setScanning]             = useState(false)
  const [scanPreview, setScanPreview]       = useState<string | null>(null)
  const [scanError, setScanError]           = useState('')
  const [copyingImage, setCopyingImage]     = useState(false)
  const [showcaseOpen, setShowcaseOpen]     = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [selectedRowId, setSelectedRowId]   = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<{ row: LineUpRow; x: number; y: number } | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: keyof LineUpRow } | null>(null)
  const [tempValue, setTempValue] = useState<string>('')
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureAreaRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const dragSourceIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  interface ConfirmModalState {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    type?: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  }
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }
  const isNavigatingRef = useRef(false)
  const mobileDateInputRef   = useRef<HTMLInputElement>(null)
  const desktopDateInputRef  = useRef<HTMLInputElement>(null)
  const weeklyDateInputRef   = useRef<HTMLInputElement>(null)


  const [suggestions, setSuggestions] = useState<{
    services: string[]
    drivers: string[]
    installers: string[]
    routes: string[]
    remarks: string[]
  }>({ services: [], drivers: [], installers: [], routes: [], remarks: [] })

  const finalVehicleOptions = useMemo(() =>
    [...new Set([...suggestions.services.map(s => s.toUpperCase()), ...VEHICLE_OPTIONS])].sort(),
    [suggestions.services]
  )
  const finalDriverOptions = useMemo(() =>
    [...new Set([...suggestions.drivers.map(d => d.toUpperCase()), ...DRIVER_OPTIONS])].sort(),
    [suggestions.drivers]
  )
  const finalInstallerOptions = useMemo(() =>
    [...new Set([...suggestions.installers.map(i => i.toUpperCase()), ...INSTALLER_OPTIONS])].sort(),
    [suggestions.installers]
  )
  const finalRouteOptions = useMemo(() =>
    [...new Set([...suggestions.routes.map(r => r.toUpperCase()), ...ROUTE_OPTIONS])].sort(),
    [suggestions.routes]
  )
  const finalRemarksOptions = useMemo(() =>
    [...new Set([...suggestions.remarks.map(rem => rem.toUpperCase()), ...REMARKS_OPTIONS])].sort(),
    [suggestions.remarks]
  )

  const getBranchDefaultRows = useCallback((dateStr: string, bId: string): LineUpRow[] => {
    const isTaguig = branchName && /TAGUIG/i.test(branchName)
    const filterSystemKeys = (arr: string[]) => (arr || []).filter(s => {
      if (!s) return false;
      const upper = s.toUpperCase().trim();
      return upper !== '__NOTES__' && upper !== '__WEEKLY_DRIVERS__' && upper !== '__WEEKLY_INSTALLERS__' && !upper.includes('_NOTES_') && !upper.includes('_WEEKLY_');
    })

    const branchDrivers = filterSystemKeys(suggestions.drivers)
    const branchInstallers = filterSystemKeys(suggestions.installers)
    const branchServices = filterSystemKeys(suggestions.services)

    if (isTaguig || branchDrivers.length === 0 || branchInstallers.length === 0) {
      return [
        { id: `local-pre-1-${dateStr}`, lineupDate: dateStr, branchId: bId, service: 'STRADA', driverName: 'ANGELO', driverTime: '8:00AM', installerName: 'RANIL', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 0 },
        { id: `local-pre-2-${dateStr}`, lineupDate: dateStr, branchId: bId, service: 'T3', driverName: 'JOJO', driverTime: '8:00AM', installerName: 'JHUMAR', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 1 },
        { id: `local-pre-3-${dateStr}`, lineupDate: dateStr, branchId: bId, service: 'T3', driverName: 'JOJO', driverTime: '8:00AM', installerName: 'KENNAN', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 2 },
        { id: `local-pre-4-${dateStr}`, lineupDate: dateStr, branchId: bId, service: 'FB19', driverName: 'ADAM', driverTime: '8:00AM', installerName: 'CRIS', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 3 },
        { id: `local-pre-5-${dateStr}`, lineupDate: dateStr, branchId: bId, service: 'FB19', driverName: 'ADAM', driverTime: '8:00AM', installerName: 'SONNY', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 4 },
        { id: `local-pre-6-${dateStr}`, lineupDate: dateStr, branchId: bId, service: 'T2', driverName: 'DOMINIC', driverTime: '8:00AM', installerName: 'RYAN', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 5 },
        { id: `local-pre-7-${dateStr}`, lineupDate: dateStr, branchId: bId, service: 'T2', driverName: 'DOMINIC', driverTime: '8:00AM', installerName: 'ALLAN', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 6 },
      ]
    }

    const resRows: LineUpRow[] = []
    const numRows = Math.max(7, branchDrivers.length)
    for (let i = 0; i < numRows; i++) {
      const service = branchServices[i % branchServices.length] || 
                      (i === 0 ? 'STRADA' : i === 1 || i === 2 ? 'T3' : i === 3 || i === 4 ? 'FB19' : 'T2')
      
      const driver = branchDrivers[i % branchDrivers.length] || ''
      const installer = branchInstallers[i % branchInstallers.length] || ''
      
      resRows.push({
        id: `local-pre-${i + 1}-${dateStr}`,
        lineupDate: dateStr,
        branchId: bId,
        service: service.toUpperCase(),
        driverName: driver.toUpperCase(),
        driverTime: '8:00AM',
        installerName: installer.toUpperCase(),
        installerTime: '7:00AM',
        route: '',
        remarks: '',
        sortOrder: i
      })
    }
    return resRows
  }, [branchName, suggestions])

  const fetchSuggestions = useCallback(async (bId: string) => {
    if (!bId) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup/suggestions?branchId=${bId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        const filterSystemKeys = (arr: string[]) => (arr || []).filter(s => {
          if (!s) return false;
          const upper = s.toUpperCase().trim();
          return upper !== '__NOTES__' && upper !== '__WEEKLY_DRIVERS__' && upper !== '__WEEKLY_INSTALLERS__' && !upper.includes('_NOTES_') && !upper.includes('_WEEKLY_');
        })
        setSuggestions({
          services: filterSystemKeys(data.services),
          drivers: filterSystemKeys(data.drivers),
          installers: filterSystemKeys(data.installers),
          routes: filterSystemKeys(data.routes),
          remarks: filterSystemKeys(data.remarks),
        })
      }
    } catch (e) {
      console.error("Error fetching lineup suggestions:", e)
    }
  }, [])

  useEffect(() => {
    if (branchId) {
      void fetchSuggestions(branchId)
    }
  }, [branchId, fetchSuggestions])

  useEffect(() => {
    if (showcaseOpen) {
      document.body.classList.add('showcase-mode-active')
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setShowcaseOpen(false)
        }
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
        return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || name.includes('TAGUIG') && name.includes('SERVICE')
      })
      
      const newList: { id: string; name: string }[] = []
      for (const b of list) {
        const cleanName = b.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
        if (cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG') {
          if (!hasExplicitTaguigSales) newList.push({ id: `${b.id}-sales`, name: 'TAGUIG SALES' })
          if (!hasExplicitTaguigServices) newList.push({ id: `${b.id}-services`, name: 'TAGUIG SERVICES' })
        } else {
          newList.push({ id: b.id, name: cleanName })
        }
      }
      newList.sort((a, b) => a.name.localeCompare(b.name))
      
      let finalList = newList
      if (user?.role && user.role.toLowerCase() !== 'admin' && user.branchId) {
        finalList = newList.filter(b => b.id === user.branchId || b.id.startsWith(user.branchId + '-'))
      }
      setBranches(finalList)
      
      if (user?.branchId) {
        const hasSplit = finalList.some(b => b.id.startsWith(user.branchId + '-'))
        if (hasSplit) {
          // Branch was split into sales/services sub-branches — pick by email
          const emailLower = (user.email || '').toLowerCase()
          if (emailLower.includes('service')) {
            setBranchId(`${user.branchId}-services`)
          } else {
            setBranchId(`${user.branchId}-sales`)
          }
        } else {
          // Use exact match or fall back to first in list
          const exactMatch = finalList.find(b => b.id === user.branchId)
          setBranchId(exactMatch ? user.branchId : (finalList[0]?.id ?? ''))
        }
      } else if (finalList.length > 0) {
        setBranchId(finalList[0].id)
      }
    } catch (e) { console.error(e) }
  }, [user?.branchId, user?.role, user?.email])

  useEffect(() => { void loadBranches() }, [loadBranches])

  const [lineupNotes, setLineupNotes] = useState('')
  const [notesRecord, setNotesRecord] = useState<LineUpRow | null>(null)

  // ── Data ─────────────────────────────────────────────────────────────────

  const fetchLineup = useCallback(async () => {
    // Fallback/placeholder using local storage first
    const all = lsLoad()
    let filtered = branchId
      ? all.filter(r => r.lineupDate === date && r.branchId === branchId)
      : []

    // Extract notes from cache
    const cachedNotes = filtered.find(r => r.service === '__NOTES__')
    if (cachedNotes) {
      setLineupNotes(cachedNotes.remarks || '')
      setNotesRecord(cachedNotes)
    } else {
      setLineupNotes('')
      setNotesRecord(null)
    }

    filtered = filtered.filter(r => r.service !== '__NOTES__' && r.service !== '__WEEKLY_DRIVERS__' && r.service !== '__WEEKLY_INSTALLERS__').sort((a, b) => a.sortOrder - b.sortOrder)
    if (filtered.length === 0 && branchId) {
      filtered = getBranchDefaultRows(date, branchId)
    }
    setRows(filtered)

    if (!branchId) return
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup?date=${date}&branchId=${branchId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          // Extract notes from backend data
          const serverNotes = data.find(r => r.service === '__NOTES__')
          if (serverNotes) {
            setLineupNotes(serverNotes.remarks || '')
            setNotesRecord(serverNotes)
          } else {
            setLineupNotes('')
            setNotesRecord(null)
          }

          const serverRows = data.filter(r => r.service !== '__NOTES__' && r.service !== '__WEEKLY_DRIVERS__' && r.service !== '__WEEKLY_INSTALLERS__')
          if (serverRows.length > 0) {
            setRows(serverRows.sort((a, b) => a.sortOrder - b.sortOrder))
          } else {
            setRows(getBranchDefaultRows(date, branchId))
          }
        }
      }
    } catch (e) {
      console.error("Error loading lineup from backend:", e)
    } finally {
      setLoading(false)
    }
  }, [date, branchId, getBranchDefaultRows])

  useEffect(() => {
    void fetchLineup()
  }, [fetchLineup])

  const handleUpdateNotes = (val: string) => {
    setLineupNotes(val)
  }

  const handleSaveNotes = async () => {
    if (!branchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

    // Treat any locally-generated notes id (notes-*) as a new record so we always POST
    const isNewNotes = !notesRecord || !notesRecord.id || notesRecord.id.startsWith('notes-')

    if (isNewNotes) {
      const newRecord: LineUpRow = {
        id: `notes-${Date.now()}`,
        lineupDate: date,
        branchId: branchId,
        service: '__NOTES__',
        driverName: '',
        driverTime: '',
        installerName: '',
        installerTime: '',
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
    if (shouldClose) {
      setEditingCell(null)
    }

    // Resolve: if a previous POST for this local row already returned a real DB ID, use it
    const resolvedId  = localToRealIdRef.current.get(row.id) ?? row.id
    const resolvedRow = resolvedId !== row.id ? { ...row, id: resolvedId } : row

    const oldVal = resolvedRow[field]
    if (oldVal === val) return

    const isNew = !resolvedId || resolvedId.startsWith('local-')

    // Prevent duplicate POSTs: if a POST is already in-flight for this local ID, skip
    if (isNew && pendingLocalSaveRef.current.has(resolvedId)) return
    if (isNew) pendingLocalSaveRef.current.add(resolvedId)

    const updatedRow = { ...resolvedRow, [field]: val }
    setRows(prev => prev.map(r => (r.id === row.id || r.id === resolvedId) ? updatedRow : r))

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const url = isNew ? `${API_BASE_URL}/v1/lineup` : `${API_BASE_URL}/v1/lineup/${resolvedId}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRow),
      })
      if (res.ok) {
        const saved = await res.json() as LineUpRow
        // Remember the mapping so future edits on the same row use the real ID
        if (isNew && saved.id !== resolvedId) {
          localToRealIdRef.current.set(row.id, saved.id)
        }
        setRows(prev => prev.map(r => (r.id === row.id || r.id === resolvedId) ? saved : r))
        if (branchId) void fetchSuggestions(branchId)
      } else {
        let errMsg = `Status ${res.status}`
        try {
          const data = await res.json()
          errMsg = data.message || errMsg
        } catch {}
        throw new Error(errMsg)
      }
    } catch (err: any) {
      console.error('Failed to save inline cell:', err)
      showToast(`Saved locally — DB unreachable (${err.message || 'connection failed'})`, 'error')
      const all = lsLoad()
      const idx = all.findIndex(r => r.id === row.id || r.id === resolvedId)
      if (idx >= 0) all[idx] = updatedRow; else all.push(updatedRow)
      lsSave(all)
    } finally {
      if (isNew) pendingLocalSaveRef.current.delete(resolvedId)
    }
  }

  const navigateCell = async (
    currentRow: LineUpRow,
    currentField: keyof LineUpRow,
    direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  ) => {
    isNavigatingRef.current = true
    void saveCell(currentRow, currentField, tempValue, false)

    const rowIndex = rows.findIndex(r => r.id === currentRow.id)
    if (rowIndex === -1) {
      isNavigatingRef.current = false
      return
    }

    const FIELDS: (keyof LineUpRow)[] = [
      'service', 'driverName', 'driverTime', 'installerName', 'installerTime', 'route', 'remarks'
    ]
    const fieldIndex = FIELDS.indexOf(currentField)
    if (fieldIndex === -1) {
      isNavigatingRef.current = false
      return
    }

    let nextRowIndex = rowIndex
    let nextFieldIndex = fieldIndex

    if (direction === 'UP') {
      nextRowIndex = rowIndex - 1
    } else if (direction === 'DOWN') {
      nextRowIndex = rowIndex + 1
    } else if (direction === 'LEFT') {
      nextFieldIndex = fieldIndex - 1
    } else if (direction === 'RIGHT') {
      nextFieldIndex = fieldIndex + 1
    }

    if (nextRowIndex >= 0 && nextRowIndex < rows.length && nextFieldIndex >= 0 && nextFieldIndex < FIELDS.length) {
      const nextRow = rows[nextRowIndex]
      const nextField = FIELDS[nextFieldIndex]
      setEditingCell({ rowId: nextRow.id, field: nextField })
      setTempValue(nextRow[nextField] as string || '')
    } else {
      setEditingCell(null)
    }

    setTimeout(() => {
      isNavigatingRef.current = false
    }, 50)
  }

  // ── Time auto-formatter ───────────────────────────────────────────────────
  // Accepts: '8am', '8AM', '8:00am', '830', '830am', '9:30AM', '7', etc.
  // Returns: '8:00AM', '8:30AM', etc. or the original value if not parseable.
  const parseTimeInput = (raw: string): string => {
    const s = raw.trim().toUpperCase()
    if (!s) return raw
    const m = s.match(/^(\d{1,2}):?(\d{2})\s*(AM|PM)?$/) ||
              s.match(/^(\d{1,2})\s*(AM|PM)$/)
    if (!m) return raw
    let hour   = parseInt(m[1], 10)
    const min  = m[2] && m[2].length === 2 ? m[2] : '00'
    const ampm = (m[2] === 'AM' || m[2] === 'PM') ? m[2] :
                 (m[3] === 'AM' || m[3] === 'PM') ? m[3] :
                 (hour < 12 ? 'AM' : 'PM')
    if (hour > 12) hour = hour - 12
    if (hour === 0) hour = 12
    return `${hour}:${min}${ampm}`
  }

  const TIME_FIELDS: (keyof LineUpRow)[] = ['driverTime', 'installerTime']

  const renderEditableTd = (
    row: LineUpRow,
    field: keyof LineUpRow,
    options: string[],
    style: React.CSSProperties,
    placeholder = 'Click to edit...'
  ) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field
    const value = row[field] as string || ''
    const isTimeField = TIME_FIELDS.includes(field)

    const handleBlur = () => {
      if (isNavigatingRef.current) return
      const finalVal = isTimeField ? parseTimeInput(tempValue) : tempValue
      if (isTimeField && finalVal !== tempValue) setTempValue(finalVal)
      void saveCell(row, field, finalVal)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void navigateCell(row, field, 'DOWN')
      } else if (e.key === 'Tab') {
        e.preventDefault()
        void navigateCell(row, field, e.shiftKey ? 'LEFT' : 'RIGHT')
      } else if (e.key === 'Escape') {
        setEditingCell(null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        void navigateCell(row, field, 'UP')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        void navigateCell(row, field, 'DOWN')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        void navigateCell(row, field, 'LEFT')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        void navigateCell(row, field, 'RIGHT')
      }
    }

    if (!canEdit) {
      return (
        <td style={{ border: `3px solid ${isLight ? '#000000' : '#475569'}`, padding: '12px 16px', ...style }}>
          {value || '—'}
        </td>
      )
    }

    if (isEditing) {
      const datalistId = `list-${field}-${row.id}`
      return (
        <td
          style={{
            border: `3px solid ${isLight ? '#000000' : '#475569'}`,
            padding: '2px 4px',
            ...style,
            boxShadow: 'inset 0 0 0 2px #10B981',
            backgroundColor: isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.05)'
          }}
        >
          <input
            list={datalistId}
            value={tempValue}
            onChange={e => setTempValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder={placeholder}
            className="w-full px-2 py-1.5 rounded border-none bg-transparent outline-none"
            style={{
              color: textPrimary,
              textAlign: style.textAlign,
              fontWeight: style.fontWeight,
              fontSize: style.fontSize,
            }}
          />
          {options.length > 0 && (
            <datalist id={datalistId}>
              {options.map(opt => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          )}
        </td>
      )
    }

    return (
      <td
        onClick={() => {
          // Single click: just select the row (handled by <tr>), do nothing extra here
          setSelectedRowId(row.id)
        }}
        onDoubleClick={() => {
          setEditingCell({ rowId: row.id, field })
          setTempValue(value)
        }}
        title="Double-click to edit"
        className="cursor-pointer transition-colors"
        style={{ border: `3px solid ${isLight ? '#000000' : '#475569'}`, padding: '12px 16px', ...style }}
      >
        {value || <span style={{ color: textMuted, fontStyle: 'italic', fontSize: '11px' }}>—</span>}
      </td>
    )
  }

  const renderMobileCell = (
    row: LineUpRow,
    field: keyof LineUpRow,
    label: string,
    icon: React.ReactNode,
    options: string[],
    full = false
  ) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field
    const value = row[field] as string || ''

    const handleBlur = () => {
      void saveCell(row, field, tempValue)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        void saveCell(row, field, tempValue)
      } else if (e.key === 'Escape') {
        setEditingCell(null)
      }
    }

    const cellBg = isLight ? '#ffffff' : '#0F172A'

    if (isEditing) {
      const datalistId = `m-list-${field}-${row.id}`
      return (
        <div className={`p-3 flex flex-col gap-1 ${full ? 'col-span-2' : ''}`} style={{ backgroundColor: cellBg }}>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
            {icon} {label}
          </div>
          <input
            list={datalistId}
            value={tempValue}
            onChange={e => setTempValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full px-2 py-1 text-xs font-semibold rounded border outline-none mt-1"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          />
          {options.length > 0 && (
            <datalist id={datalistId}>
              {options.map(opt => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          )}
        </div>
      )
    }

    return (
      <div
        onClick={() => {
          if (canEdit) {
            setEditingCell({ rowId: row.id, field })
            setTempValue(value)
          }
        }}
        className={`p-3 flex flex-col gap-1 ${full ? 'col-span-2' : ''} ${canEdit ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : ''} transition-colors`}
        style={{ backgroundColor: cellBg }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
          {icon} {label}
        </div>
        <div className="text-xs font-bold leading-relaxed" style={{ color: textPrimary }}>
          {value || <span style={{ color: textMuted, fontStyle: 'italic', fontSize: '11px' }}>empty</span>}
        </div>
      </div>
    )
  }



  const handleAddRow = () => {
    if (!branchId) return
    const newId = lsNextId()
    const newRow: LineUpRow = {
      id: newId,
      lineupDate: date,
      branchId: branchId,
      service: '',
      driverName: '',
      driverTime: '8:00AM',
      installerName: '',
      installerTime: '7:00AM',
      route: '',
      remarks: '',
      sortOrder: rows.length
    }
    setRows(prev => [...prev, newRow])
    setEditingCell({ rowId: newId, field: 'service' })
    setTempValue('')
  }

  const handleSaveAll = async () => {
    // 1. Commit the actively-editing cell
    if (editingCell) {
      const activeRow = rows.find(r => r.id === editingCell.rowId)
      if (activeRow) {
        await saveCell(activeRow, editingCell.field, tempValue, true)
      }
    }

    // 2. Persist any rows that haven't been saved to the DB yet (local-* / imported-*)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    const unsaved = rows.filter(r => r.id && (r.id.startsWith('local-') || r.id.startsWith('imported-')))
    if (unsaved.length > 0) {
      const savedRows: LineUpRow[] = []
      for (const row of unsaved) {
        try {
          const res = await fetch(`${API_BASE_URL}/v1/lineup`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(row),
          })
          if (res.ok) {
            const saved = await res.json() as LineUpRow
            savedRows.push(saved)
            setRows(prev => prev.map(r => r.id === row.id ? saved : r))
          }
        } catch (err) {
          console.error('Failed to persist row:', err)
        }
      }
    }

    // 3. Save notes
    await handleSaveNotes()
    showToast("Line-up schedule saved successfully!", "success")
  }

  const performLoadDefaultTemplate = async () => {
    if (!branchId) return
    const defaults = getBranchDefaultRows(date, branchId)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

    // 1. Delete existing DB rows for this date+branch (non-local rows) in a single transactional request
    try {
      await fetch(`${API_BASE_URL}/v1/lineup/all?branchId=${branchId}&date=${date}&includeNotes=false`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch (err) {
      console.error('Failed to clear old lineup rows:', err)
    }

    // 2. Optimistically show template rows
    setRows(defaults)
    showToast('Template loaded — saving to database…', 'info')

    // 3. POST all default rows to the backend
    const saved: LineUpRow[] = []
    for (const row of defaults) {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/lineup`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(row),
        })
        if (res.ok) {
          const dbRow = await res.json() as LineUpRow
          saved.push(dbRow)
          setRows(prev => prev.map(r => r.id === row.id ? dbRow : r))
        } else {
          saved.push(row)
        }
      } catch {
        saved.push(row)
      }
    }

    // 4. Sync localStorage
    const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId && r.service !== '__WEEKLY_DRIVERS__' && r.service !== '__WEEKLY_INSTALLERS__'))
    lsSave([...all, ...saved])
    showToast('Default template saved to database ✓', 'success')
  }

  const handleLoadDefaultTemplate = () => {
    if (!branchId) return
    if (rows.length > 0) {
      setConfirmModal({
        title: 'Load Default Template',
        message: 'This will replace your current lineup entries with the pre-encoded defaults. Continue?',
        confirmText: 'Load Template',
        cancelText: 'Keep Current',
        type: 'warning',
        onConfirm: () => { void performLoadDefaultTemplate() },
      })
    } else {
      void performLoadDefaultTemplate()
    }
  }

  // ── Drag and Drop Row Reordering ──────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragSourceIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (dragSourceIndexRef.current === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) {
      setDragOverIndex(index)
    }
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

    // Save order changes locally immediately
    const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId))
    lsSave([...all, ...reordered])

    // Save order changes to DB in background
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

  // ── Delete ───────────────────────────────────────────────────────────────

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
      showToast('Row deleted successfully.', 'success')
    }
    void fetchLineup()
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

  const performClearAll = async () => {
    if (!branchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    try {
      const res = await fetch(`${API_BASE_URL}/v1/lineup/all?branchId=${branchId}&date=${date}&includeNotes=false`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        showToast('All lineup entries cleared from database ✓', 'success')
      } else {
        showToast('Failed to clear database — removing locally', 'error')
      }
    } catch (err: any) {
      showToast('DB error: ' + (err.message || 'connection failed') + ' — removing locally', 'error')
    }
    setRows([])
    const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId && r.service !== '__NOTES__' && r.service !== '__WEEKLY_DRIVERS__' && r.service !== '__WEEKLY_INSTALLERS__'))
    lsSave(all)
  }

  const handleClearAllRows = () => {
    if (!branchId) return
    setConfirmModal({
      title: 'Clear Schedule',
      message: `Are you sure you want to permanently delete all ${rows.length} lineup entries for this date? This cannot be undone.`,
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: () => { void performClearAll() },
    })
  }

  // ── Totals ───────────────────────────────────────────────────────────────

  const sumAllUnits = (text: string): number => {
    const regex = /(\d+)\s*UNIT/gi
    let match
    let total = 0
    while ((match = regex.exec(text)) !== null) {
      total += parseInt(match[1], 10) || 0
    }
    return total
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

  const totalBackJob = rows.reduce((acc, r) => {
    const remarks = r.remarks || ''
    if (!/BACK\s*JOB/i.test(remarks)) return acc
    const unitSum = sumAllUnits(remarks)
    if (unitSum > 0) return acc + unitSum
    const matches = remarks.match(/BACK\s*JOB/gi)
    return acc + (matches ? matches.length : 1)
  }, 0)

  const totalDismantle = rows.reduce((acc, r) => {
    const remarks = r.remarks || ''
    const route = r.route || ''
    const isServiceDismantle = /DISMANTLE/i.test(remarks) || /DISMANTLE/i.test(route) ||
                               /CLEANING/i.test(remarks) || /CHECK\s*UP/i.test(remarks) ||
                               /SERVICE/i.test(remarks)
    if (!isServiceDismantle) return acc
    const unitSum = sumAllUnits(remarks)
    if (unitSum > 0) return acc + unitSum
    const matches = remarks.match(/DISMANTLE|CLEANING|CHECK\s*UP|SERVICE/gi)
    return acc + (matches ? matches.length : 1)
  }, 0)

  // ── Scan Image ───────────────────────────────────────────────────────────

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
          installerName: r.installer || r.installerName || r.INSTALLER || '',
          installerTime: r.installerTime || r.installerScheduledTime || '7:00AM',
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
              await fetch(`${API_BASE_URL}/v1/lineup/all?branchId=${branchId}&date=${date}&includeNotes=false`, {
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

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) processLineupImage(f) }
  const processLineupImageRef = useRef(processLineupImage)
  useEffect(() => { processLineupImageRef.current = processLineupImage })

  // Dismiss selected row and floating context menu when clicking outside
  useEffect(() => {
    const dismiss = (e: MouseEvent) => {
      const menuEl = document.getElementById('row-context-menu')
      if (menuEl && !menuEl.contains(e.target as Node)) {
        setActiveMenu(null)
      }
      if (printAreaRef.current && !printAreaRef.current.contains(e.target as Node)) {
        setSelectedRowId(null)
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
          if (blob) { void processLineupImageRef.current(new File([blob], 'pasted.png', { type: item.type })); return }
        }
      }
    }
    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [scanning])

  const handlePasteScan = async () => {
    if (scanning) return
    setScanError('')
    if (!navigator.clipboard || !navigator.clipboard.read) {
      setScanError('Clipboard button is disabled on HTTP. Press Ctrl+V anywhere on the page to paste.')
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'))
        if (imgType) { await processLineupImage(new File([await item.getType(imgType)], 'pasted.png', { type: imgType })); return }
      }
      setScanError('No image found in clipboard. Copy a screenshot first.')
    } catch { setScanError('Clipboard access denied. Use the file button instead.') }
  }

  // ── Image Export ─────────────────────────────────────────────────────────

  const captureLineupImage = async (): Promise<HTMLCanvasElement | null> => {
    const target = captureAreaRef.current
    if (!target) return null

    // 1. Hide UI-only elements that must not appear in the exported image
    const noPrintEls = target.querySelectorAll<HTMLElement>('.no-print')
    noPrintEls.forEach(el => { el.style.display = 'none' })

    // 2. Strip rounded corners / borders so no sub-pixel clipping artifact appears
    const savedRadius = target.style.borderRadius
    const savedBorder = target.style.border
    const savedShadow = target.style.boxShadow
    const savedOverflowRoot = target.style.overflow
    target.style.borderRadius = '0'
    target.style.border = 'none'
    target.style.boxShadow = 'none'
    target.style.overflow = 'visible'

    // 3. Expand overflow-x:auto containers so the full table width is captured
    const overflowEls = target.querySelectorAll<HTMLElement>('.overflow-x-auto')
    const savedOverflows: string[] = []
    overflowEls.forEach(el => {
      savedOverflows.push(el.style.overflow)
      el.style.overflow = 'visible'
      el.style.width = el.scrollWidth + 'px'
    })

    // 4. Scroll page to top so html2canvas viewport math is clean
    const prevScrollY = window.scrollY
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    await new Promise(r => requestAnimationFrame(r))

    const bgColor = isLight ? '#ffffff' : '#0A1120'
    try {
      const canvas = await html2canvas(target, {
        scale: 4,
        useCORS: true,
        allowTaint: true,
        backgroundColor: bgColor,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: target.scrollWidth,
        height: target.scrollHeight,
        windowWidth: target.scrollWidth,
        windowHeight: target.scrollHeight,
      })
      return canvas
    } finally {
      // Restore everything
      target.style.borderRadius = savedRadius
      target.style.border = savedBorder
      target.style.boxShadow = savedShadow
      target.style.overflow = savedOverflowRoot
      window.scrollTo({ top: prevScrollY, behavior: 'instant' as ScrollBehavior })
      overflowEls.forEach((el, i) => {
        el.style.overflow = savedOverflows[i]
        el.style.width = ''
      })
      noPrintEls.forEach(el => { el.style.display = '' })
    }
  }

  const handleCopyImage = async () => {
    if (rows.length === 0) { showToast('No data to copy!', 'error'); return }
    setCopyingImage(true)
    try {
      const canvas = await captureLineupImage()
      if (!canvas) return
      canvas.toBlob(async (blob) => {
        if (!blob) return
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ])
          showToast('Line-up copied as image! Paste it directly into your group chat.', 'success')
        } catch {
          window.open(canvas.toDataURL('image/png'), '_blank')
        }
        setCopyingImage(false)
      }, 'image/png')
    } catch (e: any) {
      showToast('Failed to capture image: ' + (e.message || 'Unknown error'), 'error')
      setCopyingImage(false)
    }
  }

  const handleSaveImage = async () => {
    if (rows.length === 0) { showToast('No data to export!', 'error'); return }
    setCopyingImage(true)
    try {
      const canvas = await captureLineupImage()
      if (!canvas) return
      const link = document.createElement('a')
      link.download = `ASHCOL_LineUp_${branchName.replace(/\s+/g, '_')}_${date}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      showToast('Line-up image downloaded successfully!', 'success')
    } catch (e: any) {
      showToast('Failed to save image: ' + (e.message || 'Unknown error'), 'error')
    } finally {
      setCopyingImage(false)
    }
  }

  // ── Excel ────────────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    if (rows.length === 0) { showToast('No data to export!', 'error'); return }
    const data = rows.map((r, i) => ({ '#': i + 1, SERVICE: r.service, DRIVER: r.driverName, 'SCHEDULED TIME – IN OF DRIVER': r.driverTime, INSTALLER: r.installerName, 'SCHEDULED TIME – IN OF INSTALLER': r.installerTime, ROUTE: r.route, REMARKS: r.remarks }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'LineUp')
    XLSX.writeFile(wb, `ASHCOL_LineUp_${branchName.replace(/\s+/g, '_')}_${date}.xlsx`)
  }

  const performExcelImport = async (parsedRows: LineUpRow[]) => {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    try {
      await fetch(`${API_BASE_URL}/v1/lineup/all?branchId=${branchId}&date=${date}&includeNotes=false`, {
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
          const k = (re: RegExp, ex?: RegExp) => Object.keys(row).find(k => re.test(k) && (!ex || !ex.test(k)))
          const service = k(/service/i) ? String(row[k(/service/i)!] || '').trim() : ''
          const driverName = k(/driver/i, /time/i) ? String(row[k(/driver/i, /time/i)!] || '').trim() : ''
          const driverTime = k(/driver/i, undefined) && k(/time/i) ? String(row[k(/driver/i)!] || '').trim() : '8:00AM'
          const installerName = k(/installer/i, /time/i) ? String(row[k(/installer/i, /time/i)!] || '').trim() : ''
          const installerTime = k(/installer/i) && k(/time/i) ? '7:00AM' : '7:00AM'
          const route = k(/route/i) ? String(row[k(/route/i)!] || '').trim() : ''
          const remarks = k(/remark/i) ? String(row[k(/remark/i)!] || '').trim() : ''
          if (service || route || driverName || installerName) {
            parsedRows.push({ id: `imported-${Date.now()}-${index}`, lineupDate: date, branchId, service, driverName, driverTime, installerName, installerTime, route, remarks, sortOrder: index })
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
      } catch { showToast('Error parsing Excel file.', 'error') }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // ── Remark badge ─────────────────────────────────────────────────────────

  const getRemarkBadge = (row: LineUpRow) => {
    const txt = (row.remarks + ' ' + row.route).toUpperCase()
    if (/BACK\s*JOB/i.test(txt)) return { label: 'BACK JOB', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' }
    if (/DISMANTLE/i.test(txt)) return { label: 'DISMANTLE', color: '#F43F5E', bg: 'rgba(244,63,94,0.1)' }
    if (/SURVEY/i.test(txt)) return { label: 'SURVEY', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' }
    const m = txt.match(/\((\d+)\s*UNIT/i)
    if (m) return { label: `${m[1]} UNIT${parseInt(m[1]) > 1 ? 'S' : ''}`, color: currentTheme.accent, bg: isLight ? currentTheme.accentLight : `${currentTheme.accent}20` }
    return null
  }

  // ── Desktop th helper ─────────────────────────────────────────────────────

  const thOrig = (label: string, _wide?: boolean) => (
    <th style={{
      border: `3px solid ${isLight ? '#000000' : '#475569'}`, padding: '8px 12px', fontSize: '10px', fontWeight: 800,
      textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const,
      backgroundColor: isLight ? '#f8fafc' : '#0F172A', color: textMuted,
      whiteSpace: 'normal',
      minWidth: label.includes('TIME') ? '90px' : undefined,
    }}>{label}</th>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  // ── Weekly Schedule (embedded) ─────────────────────────────────────────────
  type WScheduleKind = 'drivers' | 'installers'
  type WDayStatus = 'WITH SCHED' | 'NO SCHED' | 'CANCEL' | 'ABSENT' | 'ON LEAVE' | 'DAY OFF' | 'SURVEY' | 'PENDING'
  interface WPersonSchedule {
    id: string; name: string; roleNote: string; photoUrl: string
    days: Record<string, { status: WDayStatus; note: string; units: string }>
    totalUnitsTeamWork: string; totalUnitsCleaning: string; remarks: string
  }
  const W_LS_KEY = 'ashcol_weekly_field_schedule_v1'
  const W_STATUS_OPTIONS: WDayStatus[] = ['WITH SCHED', 'NO SCHED', 'CANCEL', 'ABSENT', 'ON LEAVE', 'DAY OFF', 'SURVEY', 'PENDING']
  const wToDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const wGetWeekStart = (dateKey: string) => {
    const d = new Date(`${dateKey}T00:00:00`); const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d
  }
  const wGetWeekDays = (dateKey: string) => {
    const start = wGetWeekStart(dateKey)
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate()+i); return wToDateKey(d) })
  }
  const wFormatDay = (dk: string) => new Date(`${dk}T00:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}).toUpperCase()
  const wFormatWeekLabel = (days: string[]) => {
    const f = new Date(`${days[0]}T00:00:00`); const l = new Date(`${days[6]}T00:00:00`)
    return `${f.toLocaleDateString('en-US',{month:'long'}).toUpperCase()} ${f.getDate()} – ${l.getDate()}`
  }
  const wDefaultPeople = (kind: WScheduleKind, days: string[]): WPersonSchedule[] => {
    let names: string[] = []
    if (kind === 'drivers') {
      names = suggestions.drivers && suggestions.drivers.length > 0
        ? suggestions.drivers.map(d => d.toUpperCase())
        : []
    } else {
      names = suggestions.installers && suggestions.installers.length > 0
        ? suggestions.installers.map(i => i.toUpperCase())
        : []
    }

    if (names.length === 0) {
      names = kind === 'drivers' ? ['WILLIAM PRADO','GEREMIE COLOSO'] : ['ROMMEL ABECHUELA','GILBERT COLOSO']
    }

    return names.map((name,index) => ({
      id: `${kind}-${index+1}`, name, roleNote:'IN-HOUSE', photoUrl:'',
      days: Object.fromEntries(days.map((day,di) => [day,{
        status: di<3?'WITH SCHED':di<5?(index===0?'WITH SCHED':'NO SCHED'):'DAY OFF' as WDayStatus,
        note: kind==='installers'&&index===0&&di===1?'DAY 2 - INSTALLATION OF PIPING ONLY':'',
        units: di<5&&(index===0||di<3)?'1':'0',
      }])) as WPersonSchedule['days'],
      totalUnitsTeamWork:'', totalUnitsCleaning:'', remarks:'',
    }))
  }
  const wLoadSchedule = (kind: WScheduleKind, weekKey: string, days: string[], bId: string) => {
    const activeBranchId = bId || 'default'
    try {
      const all = JSON.parse(localStorage.getItem(W_LS_KEY)||'{}')
      const saved = all?.[activeBranchId]?.[kind]?.[weekKey]
      if(Array.isArray(saved)&&saved.length) return saved as WPersonSchedule[]
    } catch {}
    return wDefaultPeople(kind, days)
  }
  const wSaveSchedule = (kind: WScheduleKind, weekKey: string, rows: WPersonSchedule[], bId: string) => {
    const activeBranchId = bId || 'default'
    try {
      const all = JSON.parse(localStorage.getItem(W_LS_KEY)||'{}')
      if (!all[activeBranchId]) all[activeBranchId] = {}
      if (!all[activeBranchId][kind]) all[activeBranchId][kind] = {}
      all[activeBranchId][kind][weekKey] = rows
      localStorage.setItem(W_LS_KEY, JSON.stringify(all))
    } catch {}
  }
  const wStatusDot = (status: WDayStatus): string => {
    if (status==='NO SCHED')  return '#ef4444'
    if (status==='CANCEL')    return '#60a5fa'
    if (status==='ABSENT')    return '#0f172a'
    if (status==='ON LEAVE')  return '#a855f7'
    if (status==='DAY OFF')   return '#f97316'
    if (status==='SURVEY')    return '#c084fc'
    if (status==='PENDING')   return '#ffffff'
    return '#10b981'
  }

  const wGetStatusTheme = (status: WDayStatus) => {
    switch (status) {
      case 'WITH SCHED':
        return {
          border: '#059669',
          bg: '#10b981',
          text: '#ffffff',
          headerBg: '#059669',
          headerText: '#ffffff',
          unitBg: '#047857',
          unitText: '#ffffff',
        }
      case 'NO SCHED':
        return {
          border: '#b91c1c',
          bg: '#ef4444',
          text: '#ffffff',
          headerBg: '#b91c1c',
          headerText: '#ffffff',
          unitBg: '#991b1b',
          unitText: '#ffffff',
        }
      case 'CANCEL':
        return {
          border: '#1d4ed8',
          bg: '#3b82f6',
          text: '#ffffff',
          headerBg: '#1d4ed8',
          headerText: '#ffffff',
          unitBg: '#1e40af',
          unitText: '#ffffff',
        }
      case 'ABSENT':
        return {
          border: '#334155',
          bg: '#475569',
          text: '#ffffff',
          headerBg: '#334155',
          headerText: '#ffffff',
          unitBg: '#1e293b',
          unitText: '#ffffff',
        }
      case 'ON LEAVE':
        return {
          border: '#7e22ce',
          bg: '#9333ea',
          text: '#ffffff',
          headerBg: '#7e22ce',
          headerText: '#ffffff',
          unitBg: '#6b21a8',
          unitText: '#ffffff',
        }
      case 'DAY OFF':
        return {
          border: '#c2410c',
          bg: '#f97316',
          text: '#ffffff',
          headerBg: '#c2410c',
          headerText: '#ffffff',
          unitBg: '#9a3412',
          unitText: '#ffffff',
        }
      case 'SURVEY':
        return {
          border: '#a21caf',
          bg: '#d946ef',
          text: '#ffffff',
          headerBg: '#a21caf',
          headerText: '#ffffff',
          unitBg: '#86198f',
          unitText: '#ffffff',
        }
      case 'PENDING':
        return {
          border: isLight ? '#cbd5e1' : '#475569',
          bg: '#ffffff',
          text: '#111827',
          headerBg: '#f1f5f9',
          headerText: '#111827',
          unitBg: '#e2e8f0',
          unitText: '#111827',
        }
      default:
        return {
          border: '#059669',
          bg: '#10b981',
          text: '#ffffff',
          headerBg: '#059669',
          headerText: '#ffffff',
          unitBg: '#047857',
          unitText: '#ffffff',
        }
    }
  }

  // Weekly schedule state — defined here, only active when tab='weekly'
  const [wKind, setWKind] = useState<WScheduleKind>('drivers')
  const [wAnchorDate, setWAnchorDate] = useState(wToDateKey(new Date()))
  const wDays = useMemo(() => wGetWeekDays(wAnchorDate), [wAnchorDate])
  const wWeekKey = wDays[0]
  const [wDrivers, setWDrivers] = useState<WPersonSchedule[]>(() => wLoadSchedule('drivers', wGetWeekDays(wToDateKey(new Date()))[0], wGetWeekDays(wToDateKey(new Date())), branchId))
  const [wInstallers, setWInstallers] = useState<WPersonSchedule[]>(() => wLoadSchedule('installers', wGetWeekDays(wToDateKey(new Date()))[0], wGetWeekDays(wToDateKey(new Date())), branchId))
  const [wDriversRecord, setWDriversRecord] = useState<LineUpRow | null>(null)
  const [wInstallersRecord, setWInstallersRecord] = useState<LineUpRow | null>(null)
  const [loadingWeekly, setLoadingWeekly] = useState(false)

  const wRows = wKind === 'drivers' ? wDrivers : wInstallers
  const wSetRows = (next: WPersonSchedule[]) => {
    if (wKind === 'drivers') setWDrivers(next); else setWInstallers(next)
    wSaveSchedule(wKind, wWeekKey, next, branchId)
  }
  const wReloadWeek = (nextDate: string) => {
    const nd = wGetWeekDays(nextDate); const nw = nd[0]
    setWAnchorDate(nextDate)
    setWDrivers(wLoadSchedule('drivers', nw, nd, branchId))
    setWInstallers(wLoadSchedule('installers', nw, nd, branchId))
  }

  const fetchWeeklySchedule = useCallback(async () => {
    if (!branchId) return
    setLoadingWeekly(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup?date=${wWeekKey}&branchId=${branchId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          const driversRec = data.find(r => r.service === '__WEEKLY_DRIVERS__')
          const installersRec = data.find(r => r.service === '__WEEKLY_INSTALLERS__')

          if (driversRec) {
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
            setWDrivers(wLoadSchedule('drivers', wWeekKey, wDays, branchId))
          }

          if (installersRec) {
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
            setWInstallers(wLoadSchedule('installers', wWeekKey, wDays, branchId))
          }
        }
      }
    } catch (e) {
      console.error("Error loading weekly schedule from backend:", e)
    } finally {
      setLoadingWeekly(false)
    }
  }, [wWeekKey, branchId, wDays, suggestions])

  useEffect(() => {
    void fetchWeeklySchedule()
  }, [fetchWeeklySchedule])

  const handleSaveWeeklySchedule = async () => {
    if (!branchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    
    setLoadingWeekly(true)
    try {
      // 1. Fetch current Monday entries first to avoid race conditions or duplicates
      const checkRes = await fetch(`${API_BASE_URL}/v1/lineup?date=${wWeekKey}&branchId=${branchId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      let dbDriversRec = wDriversRecord
      let dbInstallersRec = wInstallersRecord
      
      if (checkRes.ok) {
        const data = await checkRes.json()
        if (Array.isArray(data)) {
          const foundD = data.find(r => r.service === '__WEEKLY_DRIVERS__')
          if (foundD) dbDriversRec = foundD
          const foundI = data.find(r => r.service === '__WEEKLY_INSTALLERS__')
          if (foundI) dbInstallersRec = foundI
        }
      }

      // 2. Save drivers
      const driversDataStr = JSON.stringify(wDrivers)
      const isNewDrivers = !dbDriversRec || !dbDriversRec.id
      const driversPayload: LineUpRow = {
        id: isNewDrivers ? `w-drivers-${Date.now()}` : dbDriversRec!.id,
        lineupDate: wWeekKey,
        branchId: branchId,
        service: '__WEEKLY_DRIVERS__',
        driverName: '',
        driverTime: '',
        installerName: '',
        installerTime: '',
        route: '',
        remarks: driversDataStr,
        sortOrder: -100
      }

      // 3. Save installers
      const installersDataStr = JSON.stringify(wInstallers)
      const isNewInstallers = !dbInstallersRec || !dbInstallersRec.id
      const installersPayload: LineUpRow = {
        id: isNewInstallers ? `w-installers-${Date.now()}` : dbInstallersRec!.id,
        lineupDate: wWeekKey,
        branchId: branchId,
        service: '__WEEKLY_INSTALLERS__',
        driverName: '',
        driverTime: '',
        installerName: '',
        installerTime: '',
        route: '',
        remarks: installersDataStr,
        sortOrder: -101
      }

      // 4. Save Drivers Request
      let dRes;
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
      
      // 5. Save Installers Request
      let iRes;
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
    wSetRows(wRows.map(r => r.id===id ? {...r,...patch} : r))
  const wUpdateDay = (id: string, day: string, patch: Partial<WPersonSchedule['days'][string]>) =>
    wSetRows(wRows.map(r => r.id===id ? {...r,days:{...r.days,[day]:{...(r.days[day]||{status:'WITH SCHED' as WDayStatus,note:'',units:''}), ...patch}}} : r))
  const wAddPerson = () => {
    const next: WPersonSchedule = {
      id: `${wKind}-${Date.now()}`, name:'', roleNote:'IN-HOUSE', photoUrl:'',
      days: Object.fromEntries(wDays.map(day=>[day,{status:'WITH SCHED' as WDayStatus,note:'',units:'1'}])) as WPersonSchedule['days'],
      totalUnitsTeamWork:'', totalUnitsCleaning:'', remarks:'',
    }
    wSetRows([...wRows, next])
  }
  const wRemovePerson = (id: string) => wSetRows(wRows.filter(r => r.id!==id))

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


  // ── Render ────────────────────────────────────────────────────────────────
  const branchLineupSelector = (
    <div
      className="no-print mb-4 rounded-xl p-3 md:p-4 flex flex-col gap-3"
      style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: textMuted }}>
            Select Branch Line-Up
          </p>
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 shrink-0" style={{ color: currentTheme.accent }} />
            <span className="text-sm font-black uppercase truncate" style={{ color: textPrimary }}>
              {branchName || 'Loading branches...'}
            </span>
          </div>
        </div>

        {role === 'admin' ? (
          <div className="relative flex items-center w-full md:w-64 shrink-0">
            <Building2 className="w-3.5 h-3.5" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="w-full rounded-lg pl-8 pr-8 py-2 text-xs font-bold appearance-none outline-none cursor-pointer"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            >
              {branches.length === 0 && <option value="">Loading branches...</option>}
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
          </div>
        ) : (
          <span className="rounded-lg px-3 py-2 text-xs font-bold w-fit"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
            {branchName || 'Loading...'}
          </span>
        )}
      </div>

      {role === 'admin' && branches.length > 0 && (
        <div className="flex flex-row overflow-x-auto gap-2 no-scrollbar pb-1 scroll-smooth">
          {branches.map(b => {
            const isSelected = b.id === branchId
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBranchId(b.id)}
                className="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider shadow-sm whitespace-nowrap shrink-0 transition-all"
                style={{
                  backgroundColor: isSelected ? currentTheme.accent : (isLight ? '#f8fafc' : '#0f172a'),
                  color: isSelected ? '#fff' : textPrimary,
                  border: `1px solid ${isSelected ? currentTheme.accent : inputBorder}`,
                }}
              >
                {b.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ minHeight: '100%', backgroundColor: pageBg }}>
      {branchLineupSelector}

      {/* ── Inner Tab Switcher ───────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 mb-5 p-1 rounded-xl w-fit"
        style={{ backgroundColor: isLight ? '#e8edf4' : '#0a1628', border: `1px solid ${border}` }}
      >
        {([
          { id: 'field',  label: 'Field Schedule',  icon: <Truck className="w-3.5 h-3.5" /> },
          { id: 'weekly', label: 'Weekly Schedule', icon: <CalendarDays className="w-3.5 h-3.5" /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200"
            style={{
              backgroundColor: activeTab === tab.id ? (isLight ? '#fff' : '#1e2d48') : 'transparent',
              color: activeTab === tab.id ? textPrimary : textMuted,
              boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

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

      {/* ── Toast — portalled to body so it always clears the sticky header ── */}
      {createPortal(
        <div
          style={{
            position: 'fixed',
            top: toast ? '20px' : '-80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            opacity: toast ? 1 : 0,
            pointerEvents: toast ? 'auto' : 'none',
            transition: 'top 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease',
          }}
        >
          {toast && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '14px',
                backgroundColor: isLight ? '#ffffff' : '#1E293B',
                border: `1px solid ${
                  toast.type === 'success' ? 'rgba(16,185,129,0.4)'
                  : toast.type === 'error'  ? 'rgba(239,68,68,0.4)'
                  : 'rgba(59,130,246,0.4)'
                }`,
                boxShadow: '0 12px 40px -8px rgba(0,0,0,0.22)',
                minWidth: '220px',
                maxWidth: '400px',
              }}
            >
              <div
                style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  backgroundColor: toast.type === 'success' ? 'rgba(16,185,129,0.12)'
                    : toast.type === 'error' ? 'rgba(239,68,68,0.12)'
                    : 'rgba(59,130,246,0.12)',
                }}
              >
                {toast.type === 'success' && <Check style={{ width: '13px', height: '13px', color: '#10B981' }} />}
                {toast.type === 'error'   && <X     style={{ width: '13px', height: '13px', color: '#EF4444' }} />}
                {toast.type === 'info'    && <Check style={{ width: '13px', height: '13px', color: '#3B82F6' }} />}
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, color: isLight ? '#0f172a' : '#E2E8F0' }}>{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                style={{ flexShrink: 0, marginLeft: '4px', opacity: 0.4, cursor: 'pointer', background: 'none', border: 'none', padding: 0, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
              >
                <X style={{ width: '12px', height: '12px', color: isLight ? '#0f172a' : '#E2E8F0' }} />
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Always-in-DOM hidden inputs */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
      <input ref={scanFileRef}  type="file" accept="image/*"    className="hidden" onChange={handleScanFile} />

      {showcaseOpen && createPortal(
        <div className="flex items-center justify-between gap-3 px-5 md:px-8 py-2 bg-red-500/10 border-b border-red-500/20">
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
            <strong>Showcase Mode:</strong> Click "Exit Showcase" to return to edit mode.
          </span>
          <button
            type="button"
            onClick={() => setShowcaseOpen(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black text-white transition-all bg-red-600 hover:bg-red-700 shadow-sm shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Exit Showcase
          </button>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {/* ═══════════════════════════════════════════════════════
          MOBILE VIEW  — cards + 3-dot menu  (hidden on md+)
          ═══════════════════════════════════════════════════════ */}

   <div className="md:hidden flex flex-col gap-4 pb-28">
     {/* Mobile Header */}
     <div className="rounded-xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
       <div className="px-4 pt-4 pb-3">
         <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: textPrimary }}>
           <Truck className="w-4 h-4" style={{ color: currentTheme.accent }} />
           Field Schedule
         </h2>
         <p className="text-xs mt-0.5" style={{ color: textMuted }}>{englishLabel(date)}</p>

         <div className="lineup-toolbar mt-3 flex flex-col gap-2">
           <div className="flex items-center gap-2 w-full justify-between">
             <div
               onClick={() => {
                 mobileDateInputRef.current?.focus()
                 mobileDateInputRef.current?.showPicker?.()
               }}
               className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs flex-1 cursor-pointer"
               style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
               <ClipboardList className="w-3.5 h-3.5 shrink-0" style={{ color: currentTheme.accent }} />
               <input ref={mobileDateInputRef} type="date" value={date} onChange={e => setDate(e.target.value)}
                 className="bg-transparent outline-none text-xs w-full font-bold cursor-pointer" style={{ color: textPrimary }} />
             </div>
             
             <button
               type="button"
               onClick={() => setShowcaseOpen(!showcaseOpen)}
               className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 shrink-0"
               style={{
                 backgroundColor: showcaseOpen ? currentTheme.accent : 'transparent',
                 borderColor: showcaseOpen ? currentTheme.accentDark : border,
                 color: showcaseOpen ? '#FFFFFF' : textPrimary,
               }}
             >
               <Maximize2 className="w-3.5 h-3.5" />
               {showcaseOpen ? 'Edit Mode' : 'Showcase'}
             </button>
           </div>

         </div>
       </div>
     </div>

     {/* Mobile View Routing */}
     {showcaseOpen ? (
       <div ref={captureAreaRef}
         className="lineup-showcase-sheet mx-auto shadow-xl rounded-xl overflow-hidden"
         style={{
           width: '100%',
           backgroundColor: cardBg,
           border: `1px solid ${border}`,
         }}
       >
         <div style={{ background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`, padding: '12px 16px', textAlign: 'center' }}>
           <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px', textTransform: 'uppercase' }}>
             TEAM {branchName ? branchName.toUpperCase() : 'FIELD'} LINE UP
           </div>
         </div>
         <div style={{ backgroundColor: '#020617', padding: '6px 12px', textAlign: 'center' }}>
           <div style={{ color: '#fff', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' }}>{englishLabel(date)}</div>
         </div>

         <div className="overflow-x-auto">
           <table style={{ width: '100%', borderCollapse: 'collapse' }}>
             <colgroup>
               <col style={{ width: '12%' }} />
               <col style={{ width: '20%' }} />
               <col style={{ width: '10%' }} />
               <col style={{ width: '20%' }} />
               <col style={{ width: '10%' }} />
               <col style={{ width: '18%' }} />
               <col style={{ width: '10%' }} />
             </colgroup>
             <thead>
               <tr>
                 {['SERVICE', 'DRIVER', 'DRIVER TIME IN', 'INSTALLER', 'INSTALLER TIME IN', 'ROUTE', 'REMARKS'].map(label => {
                   const showcaseHeaderBg = isLight ? currentTheme.accentLight : currentTheme.accent + '20'
                   const showcaseHeaderColor = isLight ? currentTheme.accentDark : currentTheme.accent
                   return (
                     <th
                       key={label}
                       style={{
                         padding: '10px 8px',
                         backgroundColor: showcaseHeaderBg,
                         border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                         color: showcaseHeaderColor,
                         fontSize: '11px',
                         fontWeight: 850,
                         textAlign: 'center',
                         whiteSpace: 'nowrap',
                       }}
                     >
                       {label}
                     </th>
                   )
                 })}
               </tr>
             </thead>
             <tbody>
               {rows.length === 0 ? (
                 <tr>
                   <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: textMuted, fontSize: '12px' }}>
                     No schedule entries
                   </td>
                 </tr>
               ) : rows.map((row, idx) => (
                 <tr key={row.id} style={{ backgroundColor: idx % 2 === 0 ? (isLight ? '#ffffff' : '#1E293B') : (isLight ? '#f8fafc' : '#162031') }}>
                   {[
                     row.service || '-',
                     row.driverName || '-',
                     row.driverTime || '-',
                     row.installerName || '-',
                     row.installerTime || '-',
                     row.route || '-',
                     row.remarks || '-',
                   ].map((value, cellIdx) => (
                     <td
                       key={cellIdx}
                       style={{
                         padding: '10px 8px',
                         border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                         color: textPrimary,
                         fontSize: (cellIdx === 1 || cellIdx === 3) ? '12px' : (cellIdx === 2 || cellIdx === 4) ? '9px' : '11px',
                         fontWeight: (cellIdx === 1 || cellIdx === 3) ? 800 : (cellIdx === 2 || cellIdx === 4) ? 500 : cellIdx === 0 ? 800 : 600,
                         textAlign: cellIdx >= 5 ? 'left' : 'center',
                         whiteSpace: 'nowrap',
                       }}
                     >
                       {value}
                     </td>
                   ))}
                 </tr>
               ))}
             </tbody>
           </table>
         </div>

         {(lineupNotes || rows.length > 0) && (
           <div
             className="flex flex-col gap-4 p-4"
             style={{
               borderTop: `1px solid ${border}`,
               backgroundColor: isLight ? '#f8fafc' : '#0F172A',
             }}
           >
             <div style={{ color: '#EF4444', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'pre-line' }}>
               {lineupNotes}
             </div>
             <div className="grid grid-cols-2 gap-2">
               {[
                 ['INSTALLATION', totalUnits, currentTheme.accent],
                 ['SURVEY', totalSurvey, '#D97706'],
                 ['BACK JOB', totalBackJob, '#EF4444'],
                 ['SERVICE / DISMANTLE', totalDismantle, '#F43F5E'],
               ].map(([label, value, color]) => (
                 <div
                   key={label as string}
                   style={{
                     border: `1px solid ${border}`,
                     backgroundColor: cardBg,
                     padding: '10px',
                     borderRadius: '6px',
                   }}
                 >
                   <div style={{ color: String(color), fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
                   <div style={{ color: String(color), fontSize: '18px', fontWeight: 900, lineHeight: 1 }}>{value}</div>
                 </div>
               ))}
             </div>
           </div>
         )}
       </div>
     ) : (
       <>
         {scanError && (
           <div className="mx-4 mt-2 mb-1 px-3 py-2 rounded-xl flex items-center justify-between gap-2"
             style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
             <span className="text-xs font-semibold text-red-400">{scanError}</span>
             <button onClick={() => setScanError('')}><X className="w-3.5 h-3.5 text-red-400" /></button>
           </div>
         )}
         {scanPreview && (
           <div className="mx-4 mt-2 mb-1 px-3 py-2 rounded-xl flex items-center gap-3"
             style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
             <img src={scanPreview} alt="Scanned" className="h-10 w-16 object-cover rounded-lg" />
             <span className="text-xs font-semibold flex-1" style={{ color: textMuted }}>Scanned preview</span>
             <button onClick={() => setScanPreview(null)}><X className="w-3.5 h-3.5" style={{ color: textMuted }} /></button>
           </div>
         )}

         {loading ? (
           <div className="flex items-center justify-center py-20">
             <div className="flex flex-col items-center gap-3">
               <Loader2 className="w-6 h-6 animate-spin" style={{ color: textMuted }} />
               <p className="text-sm" style={{ color: textMuted }}>Loading…</p>
             </div>
           </div>
         ) : rows.length === 0 ? (
           <div className="rounded-xl flex flex-col items-center justify-center py-16 gap-3"
             style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
             <Truck className="w-8 h-8" style={{ color: currentTheme.accent, opacity: 0.4 }} />
             <div className="text-center">
               <p className="text-sm font-medium" style={{ color: textPrimary }}>No schedule yet</p>
               <p className="text-xs mt-1" style={{ color: textMuted }}>{branchName ? `${branchName} · ` : ''}{englishLabel(date)}</p>
             </div>
             {canEdit && (
               <button type="button" onClick={handleAddRow}
                 className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow"
                 style={{ backgroundColor: currentTheme.accent }}>
                 <Plus className="w-4 h-4" /> Add entry
               </button>
             )}
           </div>
         ) : (
           <div className="flex flex-col gap-2">
             {rows.map((row, idx) => {
               const badge = getRemarkBadge(row)
               const isExpanded = expandedCard === row.id
               const accentColor = badge?.color ?? currentTheme.accent
               return (
                 <div key={row.id} className="lineup-mobile-card relative rounded-xl"
                   style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                   <div className="mobile-card-accent" style={{ backgroundColor: accentColor }} />

                   <button type="button" className="w-full flex items-start gap-3 px-4 py-3 pl-5 text-left"
                     onClick={() => setExpandedCard(isExpanded ? null : row.id)}>
                     <span className="text-xs font-medium tabular-nums shrink-0 pt-0.5" style={{ color: textMuted }}>{idx + 1}</span>
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center justify-between gap-2">
                         <span className="text-sm font-semibold" style={{ color: textPrimary }}>{row.service || '—'}</span>
                         <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
                       </div>
                       <p className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>
                         {row.route || 'No route'}
                       </p>
                       {badge && (
                         <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                           style={{ color: badge.color, backgroundColor: badge.bg }}>
                           {badge.label}
                         </span>
                       )}
                       {(row.driverName || row.installerName) && (
                         <p className="text-xs mt-1 truncate" style={{ color: textMuted }}>
                           {row.driverName && <span style={{ color: '#3B82F6' }}>{row.driverName} {row.driverTime}</span>}
                           {row.driverName && row.installerName && ' · '}
                           {row.installerName && <span style={{ color: currentTheme.accent }}>{row.installerName} {row.installerTime}</span>}
                         </p>
                       )}
                     </div>
                   </button>

                   {isExpanded && (
                     <div style={{ borderTop: `1px solid ${border}` }}>
                       <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: border }}>
                         {renderMobileCell(row, 'service', 'Service', <Truck className="w-3 h-3" />, finalVehicleOptions, true)}
                         {renderMobileCell(row, 'driverName', 'Driver', <User className="w-3 h-3" />, finalDriverOptions)}
                         {renderMobileCell(row, 'driverTime', 'Driver in', <Clock className="w-3 h-3" />, ['8:00AM', '7:00AM', '6:00AM', '9:00AM'])}
                         {renderMobileCell(row, 'installerName', 'Installer', <User className="w-3 h-3" />, finalInstallerOptions)}
                         {renderMobileCell(row, 'installerTime', 'Installer in', <Clock className="w-3 h-3" />, ['7:00AM', '8:00AM', '6:00AM', '9:00AM'])}
                         {renderMobileCell(row, 'route', 'Route', <MapPin className="w-3 h-3" />, finalRouteOptions, true)}
                         {renderMobileCell(row, 'remarks', 'Remarks', <MessageSquare className="w-3 h-3" />, finalRemarksOptions, true)}
                       </div>
                       {canEdit && (
                         <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: `1px solid ${border}` }}>
                           <button type="button" onClick={() => { setEditingCell({ rowId: row.id, field: 'service' }); setTempValue(row.service || '') }}
                             className="flex-1 py-2 rounded-lg text-xs font-semibold text-white"
                             style={{ backgroundColor: '#3B82F6' }}>
                             Edit
                           </button>
                           <button type="button" onClick={() => handleDelete(row)}
                             className="px-3 py-2 rounded-lg text-xs font-medium"
                             style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)' }}>
                             <Trash2 className="w-3.5 h-3.5" />
                           </button>
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               )
             })}
           </div>
         )}

         {/* Mobile Notes Card */}
         {rows.length > 0 && (
           <div className="rounded-xl p-4 flex flex-col gap-2" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
             <span className="text-[11px] font-medium" style={{ color: textMuted }}>Notes</span>
             {canEdit ? (
               <textarea
                 value={lineupNotes}
                 onChange={e => handleUpdateNotes(e.target.value)}
                 onBlur={handleSaveNotes}
                 placeholder="Team notes (e.g. day off, reminders)…"
                 className="w-full text-xs outline-none resize-none min-h-[72px] no-scrollbar rounded-lg px-3 py-2"
                 style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
               />
             ) : (
               <div className="text-xs whitespace-pre-line" style={{ color: textPrimary }}>
                 {lineupNotes || '—'}
               </div>
             )}
           </div>
         )}

         {canEdit && (
           <div className="lineup-sticky-save no-print flex items-center gap-2">
             {rows.length > 0 && (
               <button type="button" onClick={handleSaveAll}
                 className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white shadow-md transition-all duration-150 active:scale-95"
                 style={{ background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})` }}>
                 Save
               </button>
             )}
             <button type="button" onClick={handleAddRow} title="Add row"
               className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-white shadow-md transition-all duration-150 active:scale-95"
               style={{ backgroundColor: '#3B82F6' }}>
               <Plus className="w-4 h-4" />
             </button>
           </div>
         )}
       </>
     )}
   </div>

      {/* ═══════════════════════════════════════════════════════
          DESKTOP VIEW  — original design  (hidden below md)
          ═══════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col gap-6 pb-8">

        {/* Top Control Bar */}
        <div className="rounded-xl p-4 lg:p-5 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="min-w-0">
            <p className="text-[10px] md:text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: currentTheme.accent }}>Scheduling</p>
            <h2 className="text-lg md:text-xl font-black tracking-tight mb-0.5 whitespace-nowrap" style={{ color: textPrimary }}>Daily Branch Line-Up</h2>
            <p className="text-xs md:text-sm" style={{ color: textMuted }}>Manage and view daily field deployment schedules across all branches.</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 w-full xl:w-auto justify-start xl:justify-end flex-wrap">
            {/* Date */}
            <div onClick={() => {
                desktopDateInputRef.current?.focus()
                desktopDateInputRef.current?.showPicker?.()
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
              <ClipboardList className="w-3.5 h-3.5" style={{ color: currentTheme.accent }} />
              <input ref={desktopDateInputRef} type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-transparent outline-none text-xs font-bold cursor-pointer" style={{ color: textPrimary }} />
            </div>

            {/* View Switcher */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F172A', border: `1px solid ${border}` }}>
              <button
                type="button"
                onClick={() => setShowcaseOpen(false)}
                className="px-2.5 py-1 rounded-md text-[11px] md:text-xs font-bold transition-all"
                style={{
                  backgroundColor: !showcaseOpen ? cardBg : 'transparent',
                  color: !showcaseOpen ? currentTheme.accent : textMuted,
                  boxShadow: !showcaseOpen ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setShowcaseOpen(true)}
                className="px-2.5 py-1 rounded-md text-[11px] md:text-xs font-bold transition-all"
                style={{
                  backgroundColor: showcaseOpen ? cardBg : 'transparent',
                  color: showcaseOpen ? currentTheme.accent : textMuted,
                  boxShadow: showcaseOpen ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Showcase
              </button>
            </div>

            {/* Edit View Exclusive Actions */}
            {!showcaseOpen && (
              <>
                {/* Import Dropdown */}
                {canEdit && (
                  <div className="relative" ref={importMenuRef}>
                    <button type="button"
                      onClick={() => { setImportMenuOpen(o => !o); setExportMenuOpen(false) }}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg font-bold text-xs border transition-all hover:scale-105"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                      <Upload className="w-3.5 h-3.5" style={{ color: currentTheme.accent }} />
                      Import
                      <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${importMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {importMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setImportMenuOpen(false)} />
                        <div className="absolute right-0 top-11 z-50 w-48 rounded-xl overflow-hidden shadow-xl"
                          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                          <div className="py-1">
                            <button type="button"
                              onClick={() => { fileInputRef.current?.click(); setImportMenuOpen(false) }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold transition-colors"
                              style={{ color: textPrimary }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = isLight ? '#F1F5F9' : '#0F172A')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                              <Upload className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                              <div>
                                <div>Import Excel</div>
                                <div className="text-[10px] font-normal mt-0.5" style={{ color: textMuted }}>.xlsx / .xls file</div>
                              </div>
                            </button>
                            <button type="button"
                              onClick={() => { handlePasteScan(); setImportMenuOpen(false) }}
                              disabled={scanning}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold transition-colors disabled:opacity-40"
                              style={{ color: textPrimary }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = isLight ? '#F1F5F9' : '#0F172A')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                              <ClipboardPaste className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                              <div>
                                <div>Paste Image</div>
                                <div className="text-[10px] font-normal mt-0.5" style={{ color: textMuted }}>Ctrl+V screenshot</div>
                              </div>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Export Dropdown */}
                <div className="relative" ref={exportMenuRef}>
                  <button type="button"
                    onClick={() => { setExportMenuOpen(o => !o); setImportMenuOpen(false) }}
                    className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg font-bold text-xs border transition-all hover:scale-105"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                    <Download className="w-3.5 h-3.5" style={{ color: currentTheme.accent }} />
                    Export
                    <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${exportMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {exportMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                      <div className="absolute right-0 top-11 z-50 w-48 rounded-xl overflow-hidden shadow-xl"
                        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                        <div className="py-1">
                          <button type="button"
                            onClick={() => { handleExportExcel(); setExportMenuOpen(false) }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold transition-colors"
                            style={{ color: textPrimary }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = isLight ? '#F1F5F9' : '#0F172A')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                            <Download className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                            <div>
                              <div>Export Excel</div>
                              <div className="text-[10px] font-normal mt-0.5" style={{ color: textMuted }}>.xlsx spreadsheet</div>
                            </div>
                          </button>
                          <button type="button"
                            onClick={() => { handleCopyImage(); setExportMenuOpen(false) }}
                            disabled={copyingImage}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold transition-colors disabled:opacity-40"
                            style={{ color: textPrimary }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = isLight ? '#F1F5F9' : '#0F172A')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                            {copyingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: textMuted }} /> : <Copy className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />}
                            <div>
                              <div>Copy Image</div>
                              <div className="text-[10px] font-medium opacity-60">Paste to group chat</div>
                            </div>
                          </button>
                          <button type="button"
                            onClick={() => { handleSaveImage(); setExportMenuOpen(false) }}
                            disabled={copyingImage}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold transition-colors disabled:opacity-40"
                            style={{ color: textPrimary }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = isLight ? '#F1F5F9' : '#0F172A')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                            {copyingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: textMuted }} /> : <Camera className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />}
                            <div>
                              <div>Save Image</div>
                              <div className="text-[10px] font-normal mt-0.5" style={{ color: textMuted }}>Download .png file</div>
                            </div>
                          </button>
                          <div style={{ height: '1px', backgroundColor: border, margin: '4px 16px' }} />
                          <button type="button"
                            onClick={() => { window.print(); setExportMenuOpen(false) }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-semibold transition-colors"
                            style={{ color: textPrimary }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = isLight ? '#F1F5F9' : '#0F172A')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                            <Printer className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                            <div>
                              <div>Print</div>
                              <div className="text-[10px] font-normal mt-0.5" style={{ color: textMuted }}>Send to printer</div>
                            </div>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Load Template */}
                {canEdit && (
                  <button type="button" onClick={handleLoadDefaultTemplate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition-all hover:scale-105"
                    style={{
                      color: currentTheme.accent,
                      border: `1px solid ${currentTheme.accent}30`,
                      backgroundColor: `${currentTheme.accent}08`,
                    }}>
                    <ClipboardList className="w-4 h-4" /> Load Template
                  </button>
                )}

                {/* Clear Schedule */}
                {canEdit && rows.length > 0 && (
                  <button type="button" onClick={handleClearAllRows}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs text-red-600 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-all hover:scale-105">
                    <Trash2 className="w-4 h-4" /> Clear Schedule
                  </button>
                )}

                {/* Add Row */}
                {canEdit && (
                  <button type="button" onClick={handleAddRow}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs text-white transition-all hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`,
                      boxShadow: `0 4px 12px ${currentTheme.accent}20`,
                    }}>
                    <Plus className="w-4 h-4" /> Add Row
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Showcase / Edit View toggle rendering */}
        {showcaseOpen ? (
          /* Inline Showcase View Layout */
          <div className="lineup-showcase-sheet mx-auto shadow-xl"
            style={{
              maxWidth: '1720px',
              width: '100%',
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
              borderRadius: 18,
              overflow: 'hidden',
            }}
          >
            {/* Team title bar with gradient */}
            <div
              style={{
                background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`,
                padding: '12px 18px 10px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  color: '#ffffff',
                  fontWeight: 950,
                  fontSize: 'clamp(18px, 2.2vw, 32px)',
                  lineHeight: 1.05,
                  textTransform: 'uppercase',
                }}
              >
                TEAM {branchName ? branchName.toUpperCase() : 'FIELD'} LINE UP
              </div>
            </div>

            {/* Black Date Bar */}
            <div
              style={{
                backgroundColor: '#020617',
                padding: '6px 12px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: 'clamp(11px, 1vw, 15px)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {englishLabel(date)}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="lineup-showcase-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '23%' }} />
                  <col style={{ width: '23%' }} />
                </colgroup>
                <thead>
                  <tr>
                    {['SERVICE', 'DRIVER', 'DRIVER TIME IN', 'INSTALLER', 'INSTALLER TIME IN', 'ROUTE', 'REMARKS'].map(label => {
                      const showcaseHeaderBg = isLight ? currentTheme.accentLight : currentTheme.accent + '20'
                      const showcaseHeaderColor = isLight ? currentTheme.accentDark : currentTheme.accent
                      return (
                        <th
                          key={label}
                          style={{
                            padding: '13px 10px',
                            backgroundColor: showcaseHeaderBg,
                            border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                            color: showcaseHeaderColor,
                            fontSize: 'clamp(12px, 1vw, 16px)',
                            fontWeight: 850,
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {label}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          padding: '96px 24px',
                          textAlign: 'center',
                          color: textMuted,
                          fontSize: 'clamp(16px, 1.5vw, 22px)',
                          fontWeight: 800,
                        }}
                      >
                        No field schedule entries
                      </td>
                    </tr>
                  ) : rows.map((row, idx) => (
                    <tr key={row.id} style={{ backgroundColor: idx % 2 === 0 ? (isLight ? '#ffffff' : '#1E293B') : (isLight ? '#f8fafc' : '#162031') }}>
                      {[
                        row.service || '-',
                        row.driverName || '-',
                        row.driverTime || '-',
                        row.installerName || '-',
                        row.installerTime || '-',
                        row.route || '-',
                        row.remarks || '-',
                      ].map((value, cellIdx) => (
                        <td
                          key={cellIdx}
                          style={{
                            padding: cellIdx >= 5 ? '14px 18px' : '14px 10px',
                            border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                            color: textPrimary,
                            fontSize: (cellIdx === 1 || cellIdx === 3) ? 'clamp(15px, 1.3vw, 22px)' : (cellIdx === 2 || cellIdx === 4) ? 'clamp(11px, 0.9vw, 14px)' : cellIdx >= 5 ? 'clamp(14px, 1.08vw, 19px)' : 'clamp(14px, 1.15vw, 21px)',
                            fontWeight: (cellIdx === 1 || cellIdx === 3) ? 900 : cellIdx === 0 ? 850 : (cellIdx === 2 || cellIdx === 4 ? 500 : 700),
                            textAlign: cellIdx >= 5 ? 'left' : 'center',
                            lineHeight: 1.32,
                            verticalAlign: 'middle',
                            minWidth: cellIdx >= 5 ? 320 : 96,
                          }}
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Note & Totals summary block */}
            {(lineupNotes || rows.length > 0) && (
              <div
                className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5"
                style={{
                  padding: '22px 28px',
                  borderTop: `1px solid ${border}`,
                  backgroundColor: isLight ? '#f8fafc' : '#1E293B',
                }}
              >
                <div
                  style={{
                    color: '#EF4444',
                    fontSize: 'clamp(14px, 1.1vw, 19px)',
                    fontWeight: 950,
                    textTransform: 'uppercase',
                    whiteSpace: 'pre-line',
                    lineHeight: 1.45,
                  }}
                >
                  {lineupNotes}
                </div>
                <div className="grid grid-cols-2 gap-2 md:min-w-[420px]">
                  {[
                    ['INSTALLATION', totalUnits, currentTheme.accent],
                    ['SURVEY', totalSurvey, '#D97706'],
                    ['BACK JOB', totalBackJob, '#EF4444'],
                    ['SERVICE / DISMANTLE', totalDismantle, '#F43F5E'],
                  ].map(([label, value, color]) => (
                    <div
                      key={label as string}
                      style={{
                        border: `1px solid ${border}`,
                        backgroundColor: cardBg,
                        padding: '12px 14px',
                      }}
                    >
                      <div style={{ color: String(color), fontSize: '12px', fontWeight: 950, textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ color: String(color), fontSize: 'clamp(20px, 2vw, 32px)', fontWeight: 950, lineHeight: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Editable lineup sheet card */
          <div ref={captureAreaRef} className="rounded-2xl overflow-hidden print-area shadow-xl shadow-slate-900/5"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

            {/* Scan error / preview banners */}
            {scanError && (
              <div className="px-4 py-2 flex items-center justify-between gap-2"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderBottom: `1px solid rgba(239,68,68,0.2)` }}>
                <span className="text-xs font-semibold" style={{ color: '#EF4444' }}>{scanError}</span>
                <button onClick={() => setScanError('')} style={{ color: '#EF4444' }}><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {scanPreview && (
              <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: `1px solid ${border}`, backgroundColor: inputBg }}>
                <img src={scanPreview} alt="Scanned lineup" className="h-14 w-24 object-cover rounded-lg border" style={{ borderColor: inputBorder }} />
                <span className="text-xs font-semibold" style={{ color: textMuted }}>Scanned image preview</span>
                <button onClick={() => setScanPreview(null)} className="ml-auto" style={{ color: textMuted }}><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* Team specific accent background title bar */}
            <div style={{ background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 950, fontSize: '16px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                TEAM {branchName ? branchName.toUpperCase() : '—'} LINE UP
              </div>
            </div>
            
            {/* Near black date bar */}
            <div style={{ backgroundColor: '#020617', padding: '6px 16px', textAlign: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '11px', letterSpacing: '0.08em' }}>{englishLabel(date)}</div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '23%' }} />
                  <col style={{ width: '23%' }} />
                </colgroup>
                <thead>
                  <tr>
                    {thOrig('SERVICE')}
                    {thOrig('DRIVER')}
                    {thOrig('DRIVER TIME IN')}
                    {thOrig('INSTALLER')}
                    {thOrig('INSTALLER TIME IN')}
                    {thOrig('ROUTE', true)}
                    {thOrig('REMARKS', true)}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: textMuted, fontSize: '13px' }}>Loading deployment schedule…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '64px', color: textMuted, fontSize: '13px' }}>
                        No entries scheduled for {branchName || 'this branch'} on {englishLabel(date)}.<br />
                        {canEdit && (
                          <button onClick={handleAddRow}
                            style={{ color: currentTheme.accent, fontWeight: 700, marginTop: '12px', fontSize: '12px' }}
                            className="hover:underline">
                            + Add the first entry
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => {
                      const isRowSelected   = selectedRowId === row.id
                      const isEditingThis   = editingCell?.rowId === row.id
                      const defaultBg       = idx % 2 === 0 ? (isLight ? '#fcfdfd' : '#1e293b') : 'transparent'
                      const selectedBg      = `${currentTheme.accent}22`
                      const hoverBgColor    = isLight ? '#f8fafc' : '#0F172A'

                      const isDraggedOver = dragOverIndex === idx
                      const isSource = dragSourceIndexRef.current === idx

                      let borderTopStyle = undefined
                      let borderBottomStyle = `1px solid ${border}`

                      if (isDraggedOver && !isSource && dragSourceIndexRef.current !== null) {
                        if (dragSourceIndexRef.current > idx) {
                          borderTopStyle = `3px solid ${currentTheme.accent}`
                        } else {
                          borderBottomStyle = `3px solid ${currentTheme.accent}`
                        }
                      }

                      return (
                        <tr key={row.id}
                          draggable={canEdit && isRowSelected && !isEditingThis}
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, idx)}
                          style={{
                            backgroundColor: (isRowSelected || isEditingThis) ? selectedBg : defaultBg,
                            borderTop: borderTopStyle,
                            borderBottom: borderBottomStyle,
                            cursor: canEdit ? (isRowSelected ? (dragSourceIndexRef.current === idx ? 'grabbing' : 'grab') : 'pointer') : 'default',
                            outline: isRowSelected ? `2px solid ${currentTheme.accent}60` : 'none',
                            outlineOffset: '-1px',
                            position: 'relative',
                          }}
                          className="transition-colors"
                          onMouseEnter={e => { if (!isRowSelected && !isEditingThis) e.currentTarget.style.backgroundColor = hoverBgColor }}
                          onMouseLeave={e => { if (!isRowSelected && !isEditingThis) e.currentTarget.style.backgroundColor = defaultBg }}
                          onClick={e => {
                            if ((e.target as HTMLElement).closest('input,button,a,select')) return
                            if (!canEdit) return

                            setSelectedRowId(prev => prev === row.id ? null : row.id)
                            if (editingCell && editingCell.rowId !== row.id) {
                              const activeRow = rows.find(r => r.id === editingCell.rowId)
                              if (activeRow) {
                                void saveCell(activeRow, editingCell.field, tempValue)
                              }
                            }
                          }}
                          onContextMenu={e => {
                            if ((e.target as HTMLElement).closest('input,button,a,select')) return
                            if (!canEdit) return

                            e.preventDefault()
                            setSelectedRowId(row.id)
                            setActiveMenu({
                              row,
                              x: e.clientX,
                              y: e.clientY
                            })
                          }}>
                          {renderEditableTd(row, 'service',       finalVehicleOptions,   { textAlign: 'center', fontWeight: 950, fontSize: '13px', color: textPrimary })}
                          {renderEditableTd(row, 'driverName',    finalDriverOptions,    { textAlign: 'center', fontWeight: 900, fontSize: '15px', color: textPrimary })}
                          {renderEditableTd(row, 'driverTime',    ['8:00AM','7:00AM','6:00AM','9:00AM'], { textAlign: 'center', fontSize: '11px', color: textPrimary })}
                          {renderEditableTd(row, 'installerName', finalInstallerOptions, { textAlign: 'center', fontWeight: 900, fontSize: '15px', color: textPrimary })}
                          {renderEditableTd(row, 'installerTime', ['7:00AM','8:00AM','6:00AM','9:00AM'], { textAlign: 'center', fontSize: '11px', color: textPrimary })}
                          {renderEditableTd(row, 'route',   finalRouteOptions,   { fontSize: '12px', color: textPrimary, fontWeight: 600, position: 'relative' }, 'e.g. QC - MANILA')}
                          {renderEditableTd(row, 'remarks', finalRemarksOptions, { fontSize: '12px', color: textPrimary, position: 'relative' }, 'e.g. INSTALL - INSTALL (3 UNITS)')}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${border}`, backgroundColor: inputBg }}>
              <p style={{ fontSize: '11px', fontStyle: 'italic', color: textMuted, fontWeight: 500 }}>
                NOTE: Installers must report earlier than drivers to handle returns and log out.
              </p>
            </div>

            {/* Summary boxes */}
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderTop: `1px solid ${border}` }}>
              {/* Notes / Comments Section */}
              <div className="w-[45%] flex flex-col gap-2 print:block">
                {canEdit ? (
                  <>
                    <textarea
                      value={lineupNotes}
                      onChange={e => handleUpdateNotes(e.target.value)}
                      onBlur={handleSaveNotes}
                      placeholder="e.g. SIR ROMMEL - DAY OFF"
                      rows={3}
                      className="w-full text-xs font-bold outline-none resize-none print:hidden no-scrollbar"
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        padding: 0,
                        color: '#EF4444',
                        lineHeight: '1.6',
                      }}
                    />
                    {/* Print version */}
                    <div className="hidden print:block text-xs font-black uppercase tracking-wide whitespace-pre-line" style={{ color: '#EF4444', lineHeight: '1.6' }}>
                      {lineupNotes}
                    </div>
                  </>
                ) : (
                  lineupNotes ? (
                    <div className="text-xs font-black uppercase tracking-wide whitespace-pre-line" style={{ color: '#EF4444', lineHeight: '1.6' }}>
                      {lineupNotes}
                    </div>
                  ) : null
                )}
              </div>

              <div className="flex flex-col gap-3 items-end print:hidden">
                <table style={{ borderCollapse: 'collapse', minWidth: '360px' }}>
                  <tbody>
                    <tr style={{ backgroundColor: isLight ? '#e8f5e9' : 'rgba(16,185,129,0.1)' }}>
                      <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: currentTheme.accent }}>TOTAL UNITS INSTALLATION</td>
                      <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: currentTheme.accent }}>{totalUnits}</td>
                    </tr>
                    <tr style={{ backgroundColor: isLight ? '#fef9c3' : 'rgba(234,179,8,0.1)' }}>
                      <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: isLight ? '#854d0e' : '#facc15' }}>TOTAL UNITS FOR SURVEY</td>
                      <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: isLight ? '#854d0e' : '#facc15' }}>{totalSurvey}</td>
                    </tr>
                    <tr style={{ backgroundColor: isLight ? '#fee2e2' : 'rgba(239,68,68,0.1)' }}>
                      <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#EF4444' }}>TOTAL BACK JOB</td>
                      <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#EF4444' }}>{totalBackJob}</td>
                    </tr>
                    <tr style={{ backgroundColor: isLight ? '#fecdd3' : 'rgba(244,63,94,0.1)' }}>
                      <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#F43F5E' }}>SERVICE / DISMANTLE</td>
                      <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#F43F5E' }}>{totalDismantle}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Print fallback for totals table */}
              <table className="hidden print:table" style={{ borderCollapse: 'collapse', minWidth: '360px' }}>
                <tbody>
                  <tr style={{ backgroundColor: isLight ? '#e8f5e9' : 'rgba(16,185,129,0.1)' }}>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: currentTheme.accent }}>TOTAL UNITS INSTALLATION</td>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: currentTheme.accent }}>{totalUnits}</td>
                  </tr>
                  <tr style={{ backgroundColor: isLight ? '#fef9c3' : 'rgba(234,179,8,0.1)' }}>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: isLight ? '#854d0e' : '#facc15' }}>TOTAL UNITS FOR SURVEY</td>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: isLight ? '#854d0e' : '#facc15' }}>{totalSurvey}</td>
                  </tr>
                  <tr style={{ backgroundColor: isLight ? '#fee2e2' : 'rgba(239,68,68,0.1)' }}>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#EF4444' }}>TOTAL BACK JOB</td>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#EF4444' }}>{totalBackJob}</td>
                  </tr>
                  <tr style={{ backgroundColor: isLight ? '#fecdd3' : 'rgba(244,63,94,0.1)' }}>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#F43F5E' }}>SERVICE / DISMANTLE</td>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#F43F5E' }}>{totalDismantle}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Save button — below the card */}
        {!showcaseOpen && canEdit && (
          <div className="no-print flex justify-end">
            <button
              type="button"
              onClick={handleSaveAll}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 shadow-md"
              style={{
                background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`,
                boxShadow: `0 4px 14px ${currentTheme.accent}25`
              }}
            >
              <Save className="w-4 h-4" /> Save Schedule
            </button>
          </div>
        )}
      </div>

      {activeMenu && (
        <div
          id="row-context-menu"
          className="no-print"
          style={{
            position: 'fixed',
            left: `${activeMenu.x}px`,
            top: `${activeMenu.y}px`,
            zIndex: 9999,
            backgroundColor: isLight ? '#ffffff' : '#1E293B',
            border: `1px solid ${isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.15)'}`,
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            minWidth: '150px',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setEditingCell({ rowId: activeMenu.row.id, field: 'service' })
              setTempValue(activeMenu.row.service || '')
              setActiveMenu(null)
              setSelectedRowId(activeMenu.row.id)
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = isLight ? '#F1F5F9' : '#334155'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left"
            style={{ color: isLight ? '#1F2937' : '#F3F4F6', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <Edit3 className="w-3.5 h-3.5 text-emerald-500" />
            Edit row
          </button>
          <button
            onClick={() => { void handleDelete(activeMenu.row); setActiveMenu(null) }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = isLight ? '#FEF2F2' : 'rgba(239, 68, 68, 0.1)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left"
            style={{ color: '#EF4444', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
            Delete row
          </button>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="rounded-2xl shadow-2xl flex flex-col gap-0 overflow-hidden"
            style={{
              backgroundColor: isLight ? '#ffffff' : '#1E293B',
              border: `1px solid ${
                confirmModal.type === 'danger'  ? 'rgba(239,68,68,0.25)'
                : confirmModal.type === 'warning' ? 'rgba(245,158,11,0.25)'
                : 'rgba(59,130,246,0.25)'
              }`,
              width: '100%',
              maxWidth: '380px',
              margin: '0 20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Accent bar */}
            <div style={{
              height: '3px',
              background: confirmModal.type === 'danger'  ? 'linear-gradient(90deg, #EF4444, #F87171)'
                        : confirmModal.type === 'warning' ? 'linear-gradient(90deg, #F59E0B, #FCD34D)'
                        : 'linear-gradient(90deg, #3B82F6, #60A5FA)',
            }} />
            {/* Body */}
            <div className="px-6 py-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: confirmModal.type === 'danger'  ? 'rgba(239,68,68,0.1)'
                                   : confirmModal.type === 'warning' ? 'rgba(245,158,11,0.1)'
                                   : 'rgba(59,130,246,0.1)',
                  }}
                >
                  {confirmModal.type === 'danger'  && <Trash2 className="w-4 h-4" style={{ color: '#EF4444' }} />}
                  {confirmModal.type === 'warning' && <ClipboardList className="w-4 h-4" style={{ color: '#F59E0B' }} />}
                  {confirmModal.type === 'info'    && <Upload className="w-4 h-4" style={{ color: '#3B82F6' }} />}
                  {!confirmModal.type             && <Check className="w-4 h-4" style={{ color: '#10B981' }} />}
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <p className="text-sm font-black" style={{ color: textPrimary }}>{confirmModal.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: textMuted }}>{confirmModal.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 justify-end">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: isLight ? '#F1F5F9' : '#0F172A',
                    color: textMuted,
                    border: `1px solid ${border}`,
                  }}
                >
                  {confirmModal.cancelText ?? 'Cancel'}
                </button>
                <button
                  onClick={() => { confirmModal.onConfirm(); setConfirmModal(null) }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{
                    background: confirmModal.type === 'danger'  ? 'linear-gradient(135deg, #EF4444, #DC2626)'
                              : confirmModal.type === 'warning' ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                              : 'linear-gradient(135deg, #3B82F6, #2563EB)',
                  }}
                >
                  {confirmModal.confirmText ?? 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
    </div>
    )}


    {/* ══════════════════════════════════════════════════════════════════
        WEEKLY SCHEDULE TAB
        Redesigned: cleaner card-per-person layout, not a crowded table
        ══════════════════════════════════════════════════════════════════ */}
    {activeTab === 'weekly' && (
      <div style={{ color: textPrimary }}>

        {/* Header Bar */}
        <div className="rounded-lg mb-4 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
             style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: textMuted }}>Scheduling</p>
            <h2 className="text-md font-extrabold tracking-tight">{wFormatWeekLabel(wDays)}</h2>
            <p className="text-xs mt-0.5 font-medium" style={{ color: textMuted }}>
              {wKind === 'drivers' ? 'Drivers' : 'Installers'} · Weekly Overview
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher (Edit / Showcase) */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F172A', border: `1px solid ${border}` }}>
              <button
                type="button"
                onClick={() => setShowcaseOpen(false)}
                className="px-2.5 py-1 rounded-md text-[11px] md:text-xs font-bold transition-all cursor-pointer"
                style={{
                  backgroundColor: !showcaseOpen ? cardBg : 'transparent',
                  color: !showcaseOpen ? currentTheme.accent : textMuted,
                  boxShadow: !showcaseOpen ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setShowcaseOpen(true)}
                className="px-2.5 py-1 rounded-md text-[11px] md:text-xs font-bold transition-all cursor-pointer"
                style={{
                  backgroundColor: showcaseOpen ? cardBg : 'transparent',
                  color: showcaseOpen ? currentTheme.accent : textMuted,
                  boxShadow: showcaseOpen ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Showcase
              </button>
            </div>

            {/* Kind Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-md" style={{ backgroundColor: isLight ? '#f1f5f9' : '#0f172a', border: `1px solid ${border}` }}>
              {(['drivers','installers'] as WScheduleKind[]).map(k => (
                <button key={k} type="button" onClick={() => setWKind(k)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all"
                        style={{
                          backgroundColor: wKind === k ? cardBg : 'transparent',
                          color: wKind === k ? textPrimary : textMuted,
                        }}>
                  {k === 'drivers' ? <Truck className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
                  {k === 'drivers' ? 'Drivers' : 'Installers'}
                </button>
              ))}
            </div>
            {/* Date picker */}
            <div
                 onClick={() => {
                   weeklyDateInputRef.current?.focus()
                   weeklyDateInputRef.current?.showPicker?.()
                 }}
                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer"
                 style={{ backgroundColor: isLight ? '#f8fafc' : '#0f172a', border: `1px solid ${border}` }}>
              <CalendarDays className="w-3.5 h-3.5" style={{ color: textMuted }} />
              <input ref={weeklyDateInputRef} type="date" value={wAnchorDate} onChange={e => wReloadWeek(e.target.value)}
                     className="bg-transparent outline-none text-xs font-bold cursor-pointer" style={{ color: textPrimary }} />
            </div>
            {/* Add Row */}
            <button type="button" onClick={wAddPerson}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold text-white transition-all hover:opacity-90"
                    style={{ backgroundColor: '#10b981' }}>
              <Plus className="w-3.5 h-3.5" /> Add Person
            </button>
            {/* Save Weekly Schedule */}
            <button type="button" onClick={handleSaveWeeklySchedule}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: currentTheme.accent }}
                    disabled={loadingWeekly}>
              {loadingWeekly ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {loadingWeekly ? 'Saving...' : 'Save Weekly Schedule'}
            </button>
          </div>
        </div>

        {/* Legend strip */}
        <div className="rounded-lg mb-4 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2"
             style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Legend</span>
          {W_STATUS_OPTIONS.map(s => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-bold">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: wStatusDot(s), border: s === 'PENDING' ? `1px solid ${border}` : 'none' }} />
              {s}
            </span>
          ))}
        </div>

        {/* Day headers row */}
        <div className="grid mb-2 gap-1"
             style={{ gridTemplateColumns: `180px repeat(7, 1fr)${wKind === 'installers' ? ' 80px 80px' : ''} 1fr` }}>
          <div />
          {wDays.map(day => {
            const isToday = day === wToDateKey(new Date())
            return (
              <div key={day} className="flex flex-col items-center px-1 py-1.5 rounded-md transition-all"
                   style={{
                     backgroundColor: isToday ? currentTheme.accent : inputBg,
                     borderColor: isToday ? currentTheme.accent : border,
                     borderWidth: '1px',
                     borderStyle: 'solid'
                   }}>
                <span className="text-[9px] font-bold uppercase tracking-wider"
                      style={{ color: isToday ? '#fff' : textMuted, opacity: isToday ? 0.85 : 1 }}>
                  {new Date(`${day}T00:00:00`).toLocaleDateString('en-US',{weekday:'short'}).toUpperCase()}
                </span>
                <span className="text-[10px] font-black mt-0.5"
                      style={{ color: isToday ? '#fff' : textPrimary }}>
                  {new Date(`${day}T00:00:00`).getDate()}
                </span>
              </div>
            )
          })}
          {wKind === 'installers' && <>
            <div className="flex items-center justify-center px-1 py-1.5 rounded-md"
                 style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
              <span className="text-[9px] font-bold uppercase tracking-widest text-center" style={{ color: textMuted }}>TW</span>
            </div>
            <div className="flex items-center justify-center px-1 py-1.5 rounded-md"
                 style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
              <span className="text-[9px] font-bold uppercase tracking-widest text-center" style={{ color: textMuted }}>CLN</span>
            </div>
          </>}
          <div className="flex items-center justify-center px-1 py-1.5 rounded-md"
               style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>REMARKS</span>
          </div>
        </div>

        {/* Person rows */}
        {wRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-lg"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <Users className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>No people yet — add a row to start</p>
          </div>
        ) : wRows.map((person, idx) => {
          return (
            <div key={person.id} className="grid mb-1.5 gap-1 items-stretch"
                 style={{ gridTemplateColumns: `180px repeat(7, 1fr)${wKind === 'installers' ? ' 80px 80px' : ''} 1fr` }}>

              {/* Name card */}
              <div className="rounded-md p-2 flex flex-col justify-between h-full relative"
                   style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                {/* Overlay Trash Button - top right */}
                <button type="button" onClick={() => wRemovePerson(person.id)}
                        className="absolute top-3 right-3 p-1 rounded bg-black/40 hover:bg-black/60 text-white transition-colors z-10">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Photo holder - Square and Big */}
                <div className="relative group cursor-pointer w-full h-[120px] rounded border overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl font-black"
                     style={{ borderColor: border }}
                     onClick={() => document.getElementById(`w-photo-file-${person.id}`)?.click()}
                     title="Click to upload profile photo (Max 10MB)">
                  {person.photoUrl ? (
                    <img src={person.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Users className="w-6 h-6 opacity-30" style={{ color: textMuted }} />
                      <span className="text-[10px] font-bold tracking-wider" style={{ color: textMuted }}>UPLOAD</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-bold text-white transition-opacity select-none">
                    CHANGE PHOTO
                  </div>
                  <input
                    type="file"
                    id={`w-photo-file-${person.id}`}
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) {
                        wHandlePhotoUpload(person.id, file)
                      }
                    }}
                  />
                </div>

                {/* Name & Role Note Inputs - Stacked below */}
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-black shrink-0" style={{ color: textMuted }}>{idx+1}</span>
                    <input value={person.name}
                           onChange={e => wUpdatePerson(person.id, { name: e.target.value.toUpperCase() })}
                           placeholder={wKind === 'drivers' ? 'Driver name' : 'Installer name'}
                           className="bg-transparent outline-none text-xs font-bold uppercase w-full border-b border-transparent hover:border-slate-300 focus:border-slate-500 transition-colors"
                           style={{ color: textPrimary }} />
                  </div>
                  <input value={person.roleNote}
                         onChange={e => wUpdatePerson(person.id, { roleNote: e.target.value.toUpperCase() })}
                         placeholder="Role/Note"
                         className="bg-transparent outline-none text-[9px] font-semibold uppercase w-full pl-4 border-b border-transparent hover:border-slate-300 focus:border-slate-500 transition-colors"
                         style={{ color: textMuted }} />
                </div>
              </div>

              {/* Day cells */}
              {wDays.map(day => {
                const cell = person.days[day] || { status: 'WITH SCHED' as WDayStatus, note: '', units: '' }
                const theme = wGetStatusTheme(cell.status)
                return (
                  <div key={day} className="rounded-md overflow-hidden flex flex-col h-full transition-all duration-150"
                       style={{ border: `1.5px solid ${theme.border}`, backgroundColor: theme.bg }}>
                    {/* Status Select header */}
                    <div className="px-1 py-1 flex items-center justify-center border-b"
                         style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
                      <select value={cell.status}
                              onChange={e => wUpdateDay(person.id, day, { status: e.target.value as WDayStatus })}
                              className="w-full text-center text-[9px] font-black uppercase outline-none cursor-pointer bg-transparent"
                              style={{ color: theme.headerText }}>
                        {W_STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ color: '#111', backgroundColor: '#fff' }}>{s}</option>)}
                      </select>
                    </div>
                    {/* Note text area */}
                    <div className="flex-1 p-1">
                      <textarea value={cell.note}
                                onChange={e => wUpdateDay(person.id, day, { note: e.target.value.toUpperCase() })}
                                placeholder="Note"
                                rows={2}
                                className={`w-full resize-none bg-transparent outline-none text-[9px] font-bold uppercase leading-tight ${cell.status === 'PENDING' ? 'placeholder-slate-400' : 'placeholder-white/60'}`}
                                style={{ color: theme.text }} />
                    </div>
                    {/* Units input bottom bar */}
                    <div className="flex items-center" style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: theme.unitBg }}>
                      <span className="pl-1.5 text-[8px] font-black select-none" style={{ color: theme.unitText, opacity: 0.7 }}>QTY:</span>
                      <input value={cell.units}
                             onChange={e => wUpdateDay(person.id, day, { units: e.target.value })}
                             className="w-full text-center text-xs font-black outline-none py-0.5 bg-transparent"
                             style={{ color: theme.unitText }} />
                    </div>
                  </div>
                )
              })}

              {/* Installers: TW + CLN */}
              {wKind === 'installers' && <>
                <div className="rounded-md overflow-hidden h-full flex flex-col" style={{ border: `1px solid ${border}`, backgroundColor: cardBg }}>
                  <div className="px-2 py-1 text-[9px] font-bold uppercase text-center border-b" style={{ backgroundColor: inputBg, color: textMuted, borderColor: border }}>TW</div>
                  <textarea value={person.totalUnitsTeamWork}
                            onChange={e => wUpdatePerson(person.id, { totalUnitsTeamWork: e.target.value })}
                            className="w-full flex-1 resize-none bg-transparent outline-none p-1.5 text-xs font-bold" style={{ color: textPrimary, minHeight: '48px' }} />
                </div>
                <div className="rounded-md overflow-hidden h-full flex flex-col" style={{ border: `1px solid ${border}`, backgroundColor: cardBg }}>
                  <div className="px-2 py-1 text-[9px] font-bold uppercase text-center border-b" style={{ backgroundColor: inputBg, color: textMuted, borderColor: border }}>CLN</div>
                  <textarea value={person.totalUnitsCleaning}
                            onChange={e => wUpdatePerson(person.id, { totalUnitsCleaning: e.target.value })}
                            className="w-full flex-1 resize-none bg-transparent outline-none p-1.5 text-xs font-bold" style={{ color: textPrimary, minHeight: '48px' }} />
                </div>
              </>}

              {/* Remarks */}
              <div className="rounded-md overflow-hidden h-full flex flex-col" style={{ border: `1px solid ${border}`, backgroundColor: cardBg }}>
                <div className="px-2 py-1 text-[9px] font-bold uppercase border-b" style={{ backgroundColor: inputBg, color: textMuted, borderColor: border }}>Remarks</div>
                <textarea value={person.remarks}
                          onChange={e => wUpdatePerson(person.id, { remarks: e.target.value.toUpperCase() })}
                          className="w-full flex-1 resize-none bg-transparent outline-none p-1.5 text-xs font-semibold uppercase" style={{ color: textPrimary, minHeight: '48px' }} />
              </div>
            </div>
          )
        })}

        {/* Save button at the bottom */}
        {wRows.length > 0 && (
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={handleSaveWeeklySchedule}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 shadow-md"
                    style={{ backgroundColor: currentTheme.accent }}
                    disabled={loadingWeekly}>
              {loadingWeekly ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {loadingWeekly ? 'Saving to Database...' : 'Save Weekly Schedule'}
            </button>
          </div>
        )}

        {/* Month label at bottom */}
        <div className="mt-4 text-center">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>
            {wFormatDay(wDays[0])} — {wFormatDay(wDays[6])}
          </span>
        </div>
      </div>
    )}
      {/* Showcase Overlay (Fullscreen) */}
      {showcaseOpen && (
        <div
          className="lineup-showcase-overlay fixed inset-y-0 right-0 z-[10000] overflow-auto"
          style={{ backgroundColor: isLight ? '#f8fafc' : '#030712' }}
        >
          <div className="min-h-screen flex flex-col">
            <div
              className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3"
              style={{
                backgroundColor: isLight ? 'rgba(248,250,252,0.94)' : 'rgba(3,7,18,0.94)',
                borderBottom: `1px solid ${border}`,
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest" style={{ color: currentTheme.accent }}>
                  {activeTab === 'weekly' ? 'Weekly Schedule Showcase' : 'Field Schedule Showcase'}
                </div>
                <div className="text-sm font-bold truncate" style={{ color: textPrimary }}>
                  {branchName || 'Selected branch'} · {activeTab === 'weekly' ? `${wFormatWeekLabel(wDays)} · ${wKind.toUpperCase()}` : englishLabel(date)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowcaseOpen(false)}
                  className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold"
                  style={{ backgroundColor: currentTheme.accent, border: `1px solid ${currentTheme.accentDark}`, color: '#ffffff' }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setShowcaseOpen(false)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  aria-label="Close showcase"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 px-4 py-6 md:px-8 md:py-10">
              <div
                ref={captureAreaRef} className="lineup-showcase-sheet print-area mx-auto"
                style={{
                  maxWidth: '1720px',
                  width: '100%',
                  backgroundColor: isLight ? '#ffffff' : '#07111f',
                  border: `1px solid ${isLight ? '#dbe5ef' : '#1f3554'}`,
                  boxShadow: isLight ? '0 24px 80px rgba(15,23,42,0.14)' : '0 24px 80px rgba(0,0,0,0.5)',
                  borderRadius: 18,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`,
                    padding: '18px 24px 16px',
                    textAlign: 'center',
                    borderBottom: `5px solid ${currentTheme.accentDark}`,
                  }}
                >
                  <div
                    style={{
                      color: '#ffffff',
                      fontWeight: 950,
                      fontSize: 'clamp(24px, 3vw, 42px)',
                      lineHeight: 1.05,
                      textTransform: 'uppercase',
                    }}
                  >
                    TEAM {branchName ? branchName.toUpperCase() : 'FIELD'} {activeTab === 'weekly' ? 'WEEKLY LINE UP' : 'LINE UP'}
                  </div>
                  <div
                    style={{
                      color: 'rgba(255,255,255,0.92)',
                      fontWeight: 900,
                      fontSize: 'clamp(13px, 1.3vw, 20px)',
                      marginTop: 8,
                      textTransform: 'uppercase',
                    }}
                  >
                    {activeTab === 'weekly' ? `${wFormatWeekLabel(wDays)} · ${wKind.toUpperCase()}` : englishLabel(date)}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="lineup-showcase-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    {activeTab === 'weekly' ? (
                      <colgroup>
                        <col style={{ width: '14%' }} />
                        {wDays.map(d => (
                          <col key={d} style={{ width: '7.5%' }} />
                        ))}
                        <col style={{ width: '6.5%' }} />
                        {wKind === 'installers' ? (
                          <>
                            <col style={{ width: '6.5%' }} />
                            <col style={{ width: '6.5%' }} />
                            <col style={{ width: '14%' }} />
                          </>
                        ) : (
                          <col style={{ width: '27%' }} />
                        )}
                      </colgroup>
                    ) : (
                      <colgroup>
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '23%' }} />
                        <col style={{ width: '23%' }} />
                      </colgroup>
                    )}
                    <thead>
                      <tr>
                        {activeTab === 'weekly' ? (
                          [
                            wKind === 'drivers' ? 'DRIVER' : 'INSTALLER',
                            ...wDays.map(day => {
                              const dateObj = new Date(`${day}T00:00:00`)
                              const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
                              const dayNum = dateObj.getDate()
                              return `${dayName} ${dayNum}`
                            }),
                            'TOTAL',
                            ...(wKind === 'installers' ? ['TW', 'CLN'] : []),
                            'REMARKS'
                          ].map(label => (
                            <th
                              key={label}
                              style={{
                                padding: '18px 12px',
                                backgroundColor: isLight ? currentTheme.accentLight : `${currentTheme.accent}20`,
                                border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                color: isLight ? currentTheme.accentDark : currentTheme.accentLight,
                                fontSize: 'clamp(13px, 1vw, 16px)',
                                fontWeight: 850,
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {label}
                            </th>
                          ))
                        ) : (
                          ['SERVICE', 'DRIVER', 'DRIVER TIME IN', 'INSTALLER', 'INSTALLER TIME IN', 'ROUTE', 'REMARKS'].map(label => (
                            <th
                              key={label}
                              style={{
                                padding: '18px 12px',
                                backgroundColor: isLight ? currentTheme.accentLight : `${currentTheme.accent}20`,
                                border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                color: isLight ? currentTheme.accentDark : currentTheme.accentLight,
                                fontSize: 'clamp(14px, 1.1vw, 18px)',
                                fontWeight: 850,
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {label}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {activeTab === 'weekly' ? (
                        wRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={wKind === 'installers' ? 12 : 10}
                              style={{
                                padding: '120px 24px',
                                textAlign: 'center',
                                color: textMuted,
                                fontSize: 'clamp(18px, 1.6vw, 24px)',
                                fontWeight: 800,
                              }}
                            >
                              No weekly schedule entries
                            </td>
                          </tr>
                        ) : (
                          wRows.map((person, idx) => {
                            const totalPersonUnits = Object.values(person.days).reduce((sum, d) => {
                              const val = parseFloat(d.units)
                              return sum + (isNaN(val) ? 0 : val)
                            }, 0)

                            return (
                              <tr key={person.id} style={{ backgroundColor: idx % 2 === 0 ? (isLight ? '#ffffff' : '#07111f') : (isLight ? '#f8fafc' : '#0b1628') }}>
                                {/* Person info */}
                                <td
                                  style={{
                                    padding: '18px 16px',
                                    border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                    color: textPrimary,
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    {person.photoUrl ? (
                                      <img src={person.photoUrl} alt="" className="w-28 h-28 rounded-lg object-cover border" style={{ borderColor: isLight ? '#dbe5ef' : '#1f3554' }} />
                                    ) : (
                                      <div className="w-28 h-28 rounded-lg border flex items-center justify-center bg-slate-100 dark:bg-slate-800" style={{ borderColor: isLight ? '#dbe5ef' : '#1f3554' }}>
                                        <User className="w-8 h-8 opacity-40" style={{ color: textMuted }} />
                                      </div>
                                    )}
                                    <div className="text-left">
                                      <div style={{ fontWeight: 900, fontSize: '15px', color: textPrimary, textTransform: 'uppercase' }}>{person.name}</div>
                                      <div style={{ fontSize: '11px', fontWeight: 750, color: textMuted, textTransform: 'uppercase', marginTop: '3px' }}>{person.roleNote}</div>
                                    </div>
                                  </div>
                                </td>

                                {/* Day cells */}
                                {wDays.map(day => {
                                  const cell = person.days[day] || { status: 'WITH SCHED' as WDayStatus, note: '', units: '' }
                                  const cellTheme = wGetStatusTheme(cell.status)
                                  return (
                                    <td
                                      key={day}
                                      style={{
                                        padding: '10px 8px',
                                        border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                        verticalAlign: 'middle',
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          flexDirection: 'column',
                                          height: '100%',
                                          minHeight: '120px',
                                          justifyContent: 'space-between',
                                          padding: '8px',
                                          backgroundColor: cellTheme.bg,
                                          color: cellTheme.text,
                                          border: `1.5px solid ${cellTheme.border}`,
                                          borderRadius: '6px',
                                        }}
                                      >
                                        <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', opacity: 0.9, textAlign: 'center' }}>
                                          {cell.status}
                                        </div>
                                        {cell.note && (
                                          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', margin: '4px 0', textAlign: 'center', lineHeight: 1.15 }}>
                                            {cell.note}
                                          </div>
                                        )}
                                        {cell.units && (
                                          <div
                                            style={{
                                              fontSize: '11px',
                                              fontWeight: 950,
                                              backgroundColor: cellTheme.unitBg,
                                              color: cellTheme.unitText,
                                              borderRadius: '4px',
                                              padding: '2px 4px',
                                              textAlign: 'center',
                                              marginTop: '2px',
                                            }}
                                          >
                                            QTY: {cell.units}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  )
                                })}

                                {/* Total Units */}
                                <td
                                  style={{
                                    padding: '24px 16px',
                                    border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                    color: textPrimary,
                                    fontSize: 'clamp(18px, 1.4vw, 26px)',
                                    fontWeight: 950,
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {totalPersonUnits}
                                </td>

                                {/* TW & CLN for installers */}
                                {wKind === 'installers' && (
                                  <>
                                    <td
                                      style={{
                                        padding: '24px 18px',
                                        border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                        color: textPrimary,
                                        fontSize: 'clamp(14px, 1.1vw, 17px)',
                                        fontWeight: 700,
                                        textAlign: 'center',
                                        whiteSpace: 'pre-wrap',
                                        verticalAlign: 'middle',
                                      }}
                                    >
                                      {person.totalUnitsTeamWork || '—'}
                                    </td>
                                    <td
                                      style={{
                                        padding: '24px 18px',
                                        border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                        color: textPrimary,
                                        fontSize: 'clamp(14px, 1.1vw, 17px)',
                                        fontWeight: 700,
                                        textAlign: 'center',
                                        whiteSpace: 'pre-wrap',
                                        verticalAlign: 'middle',
                                      }}
                                    >
                                      {person.totalUnitsCleaning || '—'}
                                    </td>
                                  </>
                                )}

                                {/* Remarks */}
                                <td
                                  style={{
                                    padding: '24px 20px',
                                    border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                    color: textPrimary,
                                    fontSize: 'clamp(14px, 1.1vw, 17px)',
                                    fontWeight: 700,
                                    textAlign: 'left',
                                    whiteSpace: 'pre-wrap',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {person.remarks || '—'}
                                </td>
                              </tr>
                            )
                          })
                        )
                      ) : (
                        rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              style={{
                                padding: '120px 24px',
                                textAlign: 'center',
                                color: textMuted,
                                fontSize: 'clamp(18px, 1.6vw, 24px)',
                                fontWeight: 800,
                              }}
                            >
                              No field schedule entries
                            </td>
                          </tr>
                        ) : rows.map((row, idx) => (
                          <tr key={row.id} style={{ backgroundColor: idx % 2 === 0 ? (isLight ? '#ffffff' : '#07111f') : (isLight ? '#f8fafc' : '#0b1628') }}>
                            {[
                              row.service || '-',
                              row.driverName || '-',
                              row.driverTime || '-',
                              row.installerName || '-',
                              row.installerTime || '-',
                              row.route || '-',
                              row.remarks || '-',
                            ].map((value, cellIdx) => (
                              <td
                                key={cellIdx}
                                style={{
                                  padding: cellIdx >= 5 ? '24px 22px' : '24px 16px',
                                  border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                                  color: textPrimary,
                                  fontSize: (cellIdx === 1 || cellIdx === 3) ? 'clamp(17px, 1.45vw, 26px)' : (cellIdx === 2 || cellIdx === 4) ? 'clamp(12px, 1.0vw, 16px)' : cellIdx >= 5 ? 'clamp(16px, 1.2vw, 22px)' : 'clamp(16px, 1.3vw, 24px)',
                                  fontWeight: (cellIdx === 1 || cellIdx === 3) ? 900 : cellIdx === 0 ? 850 : (cellIdx === 2 || cellIdx === 4 ? 500 : 700),
                                  textAlign: cellIdx >= 5 ? 'left' : 'center',
                                  lineHeight: 1.32,
                                  verticalAlign: 'middle',
                                  minWidth: cellIdx >= 5 ? 360 : 120,
                                }}
                              >
                                {value}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {activeTab === 'weekly' ? (
                  <div
                    style={{
                      padding: '22px 28px',
                      borderTop: `1px solid ${isLight ? '#dbe5ef' : '#1f3554'}`,
                      backgroundColor: isLight ? '#f8fafc' : '#0b1628',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: textMuted }}>Legend:</span>
                      {W_STATUS_OPTIONS.map(s => (
                        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: textPrimary }}>
                          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: wStatusDot(s), border: s === 'PENDING' ? `1.5px solid ${border}` : 'none' }} />
                          {s}
                        </span>
                      ))}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: textMuted, letterSpacing: '0.05em' }}>
                        {wFormatDay(wDays[0])} — {wFormatDay(wDays[6])}
                      </span>
                    </div>
                  </div>
                ) : (
                  (lineupNotes || rows.length > 0) && (
                    <div
                      className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5"
                      style={{
                        padding: '22px 28px',
                        borderTop: `1px solid ${isLight ? '#dbe5ef' : '#1f3554'}`,
                        backgroundColor: isLight ? '#f8fafc' : '#0b1628',
                      }}
                    >
                      <div
                        style={{
                          color: '#EF4444',
                          fontSize: 'clamp(14px, 1.1vw, 19px)',
                          fontWeight: 950,
                          textTransform: 'uppercase',
                          whiteSpace: 'pre-line',
                          lineHeight: 1.45,
                        }}
                      >
                        {lineupNotes}
                      </div>
                      <div className="grid grid-cols-2 gap-2 md:min-w-[420px]">
                        {[
                          ['INSTALLATION', totalUnits, currentTheme.accent],
                          ['SURVEY', totalSurvey, '#D97706'],
                          ['BACK JOB', totalBackJob, '#EF4444'],
                          ['SERVICE / DISMANTLE', totalDismantle, '#F43F5E'],
                        ].map(([label, value, color]) => (
                          <div
                            key={label}
                            style={{
                              border: `1px solid ${isLight ? '#dbe5ef' : '#1f3554'}`,
                              backgroundColor: isLight ? '#ffffff' : '#07111f',
                              padding: '12px 14px',
                            }}
                          >
                            <div style={{ color: String(color), fontSize: '12px', fontWeight: 950, textTransform: 'uppercase' }}>{label}</div>
                            <div style={{ color: String(color), fontSize: 'clamp(20px, 2vw, 32px)', fontWeight: 950, lineHeight: 1 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        :root {
          --branch-accent: ${currentTheme.accent};
          --branch-accent-dark: ${currentTheme.accentDark};
          --branch-accent-light: ${currentTheme.accentLight};

          --page-bg: #F8FAFC;
          --card-bg: #FFFFFF;
          --text-main: #0F172A;
          --text-muted: #64748B;
          --border-color: #E2E8F0;
          --date-bar-bg: #020617;
        }

        .dark {
          --page-bg: #0F172A;
          --card-bg: #1E293B;
          --text-main: #F8FAFC;
          --text-muted: #CBD5E1;
          --border-color: #334155;
          --date-bar-bg: #020617;
        }

        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: fixed; inset: 0; margin: 0; padding: 0; border: none !important; }
          .no-print { display: none !important; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none !important; }
        .no-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }

        body.showcase-mode-active aside,
        body.showcase-mode-active header {
          display: none !important;
        }
        body.showcase-mode-active main {
          padding: 0 !important;
          margin: 0 !important;
        }
        .lineup-showcase-overlay {
          position: fixed !important;
          inset: 0 !important;
          z-index: 10000 !important;
          left: 0 !important;
          right: 0 !important;
          top: 0 !important;
          bottom: 0 !important;
          transition: none !important;
        }
      `}</style>
    </div>
  )
}
