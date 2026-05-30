import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Trash2, Edit3, X, Printer, ClipboardList, Upload, Download, Building2,
  ScanLine, ClipboardPaste, Loader2, Truck, User, Clock, MapPin, MessageSquare,
  ChevronDown, MoreVertical, Camera, Copy, Save, Check,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

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


const DEFAULT_PREENCODED_ROWS = (date: string, branchId: string): LineUpRow[] => [
  { id: `local-pre-1-${date}`, lineupDate: date, branchId, service: 'STRADA', driverName: 'ANGELO', driverTime: '8:00AM', installerName: 'RANIL', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 0 },
  { id: `local-pre-2-${date}`, lineupDate: date, branchId, service: 'T3', driverName: 'JOJO', driverTime: '8:00AM', installerName: 'JHUMAR', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 1 },
  { id: `local-pre-3-${date}`, lineupDate: date, branchId, service: 'T3', driverName: 'JOJO', driverTime: '8:00AM', installerName: 'KENNAN', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 2 },
  { id: `local-pre-4-${date}`, lineupDate: date, branchId, service: 'FB19', driverName: 'ADAM', driverTime: '8:00AM', installerName: 'CRIS', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 3 },
  { id: `local-pre-5-${date}`, lineupDate: date, branchId, service: 'FB19', driverName: 'ADAM', driverTime: '8:00AM', installerName: 'SONNY', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 4 },
  { id: `local-pre-6-${date}`, lineupDate: date, branchId, service: 'T2', driverName: 'DOMINIC', driverTime: '8:00AM', installerName: 'RYAN', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 5 },
  { id: `local-pre-7-${date}`, lineupDate: date, branchId, service: 'T2', driverName: 'DOMINIC', driverTime: '8:00AM', installerName: 'ALLAN', installerTime: '7:00AM', route: '', remarks: '', sortOrder: 6 },
]

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

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const pageBg      = isLight ? '#f1f5f9'  : '#060B18'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const role      = (user?.role || '').toLowerCase()
  const canEdit   = role === 'admin' || role === 'manager' || role === 'staff' || role === 'employee'

  const [date, setDate]         = useState(tomorrowStr)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState('')
  const [rows, setRows]         = useState<LineUpRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef    = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const scanFileRef    = useRef<HTMLInputElement>(null)
  const printAreaRef   = useRef<HTMLDivElement>(null)
  const importMenuRef  = useRef<HTMLDivElement>(null)
  const exportMenuRef  = useRef<HTMLDivElement>(null)
  const [scanning, setScanning]             = useState(false)
  const [scanPreview, setScanPreview]       = useState<string | null>(null)
  const [scanError, setScanError]           = useState('')
  const [copyingImage, setCopyingImage]     = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [selectedRowId, setSelectedRowId]   = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<{ row: LineUpRow; x: number; y: number } | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: keyof LineUpRow } | null>(null)
  const [tempValue, setTempValue] = useState<string>('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureAreaRef = useRef<HTMLDivElement>(null)

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

  const branchName = branches.find(b => b.id === branchId)?.name ?? ''

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

  const fetchSuggestions = useCallback(async (bId: string) => {
    if (!bId) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/lineup/suggestions?branchId=${bId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setSuggestions({
          services: data.services || [],
          drivers: data.drivers || [],
          installers: data.installers || [],
          routes: data.routes || [],
          remarks: data.remarks || [],
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



  // ── Load Branches ────────────────────────────────────────────────────────

  const loadBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list = (data?.data || data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
      setBranches(list)
      if (user?.branchId) setBranchId(user.branchId)
      else if (list.length > 0) setBranchId(list[0].id)
    } catch (e) { console.error(e) }
  }, [user?.branchId])

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

    filtered = filtered.filter(r => r.service !== '__NOTES__').sort((a, b) => a.sortOrder - b.sortOrder)
    if (filtered.length === 0 && branchId) {
      filtered = DEFAULT_PREENCODED_ROWS(date, branchId)
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

          const serverRows = data.filter(r => r.service !== '__NOTES__')
          if (serverRows.length > 0) {
            setRows(serverRows.sort((a, b) => a.sortOrder - b.sortOrder))
          } else {
            setRows(DEFAULT_PREENCODED_ROWS(date, branchId))
          }
        }
      }
    } catch (e) {
      console.error("Error loading lineup from backend:", e)
    } finally {
      setLoading(false)
    }
  }, [date, branchId])

  useEffect(() => {
    void fetchLineup()
  }, [fetchLineup])

  const handleUpdateNotes = (val: string) => {
    setLineupNotes(val)
  }

  const handleSaveNotes = async () => {
    if (!branchId) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    
    if (!notesRecord) {
      const newId = `notes-${Date.now()}`
      const newRecord: LineUpRow = {
        id: newId,
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
    const oldVal = row[field];
    if (oldVal === val) return
    const updatedRow = { ...row, [field]: val }

    setRows(prev => prev.map(r => r.id === row.id ? updatedRow : r))

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const isNew = !row.id || row.id.startsWith("local-")
      const url = isNew ? `${API_BASE_URL}/v1/lineup` : `${API_BASE_URL}/v1/lineup/${row.id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRow),
      })
      if (res.ok) {
        const saved = await res.json() as LineUpRow
        setRows(prev => prev.map(r => r.id === row.id ? saved : r))
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
      console.error("Failed to save inline cell:", err)
      showToast(`Saved locally — DB unreachable (${err.message || 'connection failed'})`, 'error')
      const all = lsLoad()
      const idx = all.findIndex(r => r.id === row.id)
      if (idx >= 0) all[idx] = updatedRow; else all.push(updatedRow)
      lsSave(all)
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
        <td style={{ border: `1px solid ${border}`, padding: '12px 16px', ...style }}>
          {value || '—'}
        </td>
      )
    }

    if (isEditing) {
      const datalistId = `list-${field}-${row.id}`
      return (
        <td
          style={{
            border: `1px solid ${border}`,
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
            className="w-full px-2 py-1.5 text-xs font-semibold rounded border-none bg-transparent outline-none"
            style={{ color: textPrimary }}
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
          setEditingCell({ rowId: row.id, field })
          setTempValue(value)
        }}
        title="Click to edit inline"
        className="cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        style={{ border: `1px solid ${border}`, padding: '12px 16px', ...style }}
      >
        {value || <span style={{ color: textMuted, fontStyle: 'italic', fontSize: '11px' }}>empty</span>}
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
    if (editingCell) {
      const activeRow = rows.find(r => r.id === editingCell.rowId)
      if (activeRow) {
        await saveCell(activeRow, editingCell.field, tempValue, true)
      }
    }
    await handleSaveNotes()
    showToast("Line-up schedule saved successfully!", "success")
  }

  const performLoadDefaultTemplate = () => {
    if (!branchId) return
    const defaults = DEFAULT_PREENCODED_ROWS(date, branchId)
    setRows(defaults)
    const all = lsLoad().filter(r => !(r.lineupDate === date && r.branchId === branchId))
    lsSave([...all, ...defaults])
    showToast('Default template loaded!', 'success')
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
        onConfirm: performLoadDefaultTemplate,
      })
    } else {
      performLoadDefaultTemplate()
    }
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

  // ── Totals ───────────────────────────────────────────────────────────────

  const totalUnits    = rows.reduce((acc, r) => { const m = r.remarks?.match(/\((\d+)\s*UNIT/i); return acc + (m ? parseInt(m[1]) : 0) }, 0)
  const totalSurvey   = rows.filter(r => /SURVEY/i.test(r.remarks || '') || /SURVEY/i.test(r.route || '')).length
  const totalBackJob  = rows.filter(r => /BACK\s*JOB/i.test(r.remarks || '')).length
  const totalDismantle = rows.filter(r => /DISMANTLE/i.test(r.remarks || '') || /DISMANTLE/i.test(r.route || '')).length

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
        const capturedRows = [...rows]
        setConfirmModal({
          title: 'AI Scanner',
          message: `Scanner found ${parsedRows.length} row${parsedRows.length === 1 ? '' : 's'}. Replace the current lineup for this date?`,
          confirmText: 'Replace Lineup',
          cancelText: 'Cancel',
          type: 'warning',
          onConfirm: async () => {
            for (const existingRow of capturedRows) {
              try {
                await fetch(`${API_BASE_URL}/v1/lineup/${existingRow.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${capturedToken}` } })
              } catch (err) { console.error('Failed to delete existing row during scan replacement:', err) }
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
    for (const existingRow of rows) {
      try {
        await fetch(`${API_BASE_URL}/v1/lineup/${existingRow.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      } catch (err) { console.error('Failed to delete existing row during import:', err) }
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
    if (m) return { label: `${m[1]} UNIT${parseInt(m[1]) > 1 ? 'S' : ''}`, color: '#10B981', bg: 'rgba(16,185,129,0.1)' }
    return null
  }

  // ── Desktop th helper ─────────────────────────────────────────────────────

  const thOrig = (label: string, wide?: boolean) => (
    <th style={{
      border: `1px solid ${border}`, padding: '12px 16px', fontSize: '11px', fontWeight: 800,
      textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const,
      backgroundColor: isLight ? '#f8fafc' : '#0F172A', color: textMuted,
      whiteSpace: wide ? undefined : 'nowrap',
    }}>{label}</th>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ backgroundColor: pageBg, minHeight: '100%' }}>

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
              <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, color: isLight ? '#0f172a' : '#F0F6FF' }}>{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                style={{ flexShrink: 0, marginLeft: '4px', opacity: 0.4, cursor: 'pointer', background: 'none', border: 'none', padding: 0, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
              >
                <X style={{ width: '12px', height: '12px', color: isLight ? '#0f172a' : '#F0F6FF' }} />
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Always-in-DOM hidden inputs */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
      <input ref={scanFileRef}  type="file" accept="image/*"    className="hidden" onChange={handleScanFile} />

      {/* ═══════════════════════════════════════════════════════
          MOBILE VIEW  — cards + 3-dot menu  (hidden on md+)
          ═══════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col gap-4 pb-8">

        {/* Mobile Header */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div style={{ background: 'linear-gradient(135deg, #059669, #047857)', padding: '16px 20px' }}>
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-[3px] text-emerald-200 mb-0.5">Scheduling</p>
              <h2 className="text-xl font-black text-white tracking-tight">Team Line-Up</h2>
            </div>

            <div className="lineup-toolbar">
              {/* Date picker */}
              <div className="lineup-date-control">
                <div onClick={() => mobileDateInputRef.current?.showPicker?.()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 border border-white/20 text-white w-full cursor-pointer">
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <input ref={mobileDateInputRef} type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="bg-transparent outline-none text-xs font-bold text-white w-full cursor-pointer" />
                </div>
              </div>

              {/* + and ⋯ buttons */}
              <div className="lineup-actions">
                {canEdit && (
                  <button onClick={handleAddRow} title="Add Row"
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 border border-white/25 text-white active:scale-95">
                    <Plus className="w-4 h-4" />
                  </button>
                )}
                <div className="relative" ref={moreMenuRef}>
                  <button onClick={() => setMoreMenuOpen(o => !o)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 active:scale-95">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {moreMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                      <div className="absolute right-0 top-11 z-50 w-44 rounded-xl overflow-hidden shadow-xl"
                        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                        <div className="py-1">
                          {canEdit && (
                            <>
                              <DropdownItem icon={<ClipboardList className="w-3.5 h-3.5" />} label="Load Template" color={textMuted}
                                onClick={() => { handleLoadDefaultTemplate(); setMoreMenuOpen(false) }} />
                              <DropdownItem icon={<ClipboardPaste className="w-3.5 h-3.5" />} label="Paste Image" color={textMuted} disabled={scanning}
                                onClick={() => { handlePasteScan(); setMoreMenuOpen(false) }} />
                              <DropdownItem icon={<Upload className="w-3.5 h-3.5" />} label="Import Excel" color={textMuted}
                                onClick={() => { fileInputRef.current?.click(); setMoreMenuOpen(false) }} />
                            </>
                          )}
                          <DropdownItem icon={<Printer className="w-3.5 h-3.5" />} label="Print" color={textMuted}
                            onClick={() => { window.print(); setMoreMenuOpen(false) }} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Branch — full width row */}
              <div className="lineup-branch-control">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 border border-white/20 text-white w-full">
                  <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#6ee7b7' }} />
                  <select value={branchId} onChange={e => setBranchId(e.target.value)}
                    className="bg-transparent outline-none text-xs font-bold w-full text-white cursor-pointer">
                    {branches.length === 0 && <option value="">Loading…</option>}
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Import + Export — 2-column grid row */}
              <div className="lineup-import-export-actions">
                {canEdit && (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-white/10 border border-white/20 text-emerald-300">
                    <Upload className="w-3.5 h-3.5" /> Import
                  </button>
                )}
                <button onClick={handleExportExcel}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-white/10 border border-white/20 text-blue-300">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>
            <p className="text-[10px] font-semibold text-emerald-200 mt-3 tracking-wider">{englishLabel(date)}</p>
          </div>

          {/* Stat pills */}
          {rows.length > 0 && (
            <div className="px-4 py-2.5 flex flex-wrap gap-2" style={{ borderBottom: `1px solid ${border}` }}>
              <StatPill label="Trucks" value={rows.length} color="#10B981" />
              <StatPill label="Units"  value={totalUnits}  color="#3B82F6" />
              {totalSurvey   > 0 && <StatPill label="Survey"    value={totalSurvey}    color="#F59E0B" />}
              {totalBackJob  > 0 && <StatPill label="Back Job"  value={totalBackJob}   color="#EF4444" />}
              {totalDismantle > 0 && <StatPill label="Dismantle" value={totalDismantle} color="#F43F5E" />}
            </div>
          )}

          {/* Scan alerts */}
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
        </div>

        {/* Mobile content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#10B981' }} />
              <p className="text-sm font-semibold" style={{ color: textMuted }}>Loading schedule…</p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-center justify-center py-20 gap-4"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.08)' }}>
              <Truck className="w-7 h-7" style={{ color: '#10B981' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-black mb-1" style={{ color: textPrimary }}>No Schedule Yet</p>
              <p className="text-xs" style={{ color: textMuted }}>{branchName ? `${branchName} — ` : ''}{englishLabel(date)}</p>
            </div>
            {canEdit && (
              <button onClick={handleAddRow}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                <Plus className="w-4 h-4" /> Add First Entry
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row, idx) => {
              const badge = getRemarkBadge(row)
              const isExpanded = expandedCard === row.id
              return (
                <div key={row.id} className="rounded-2xl overflow-hidden"
                  style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                  <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                    onClick={() => setExpandedCard(isExpanded ? null : row.id)}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-black text-xs text-white"
                      style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black" style={{ color: textPrimary }}>{row.service || '—'}</span>
                        {badge && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                            style={{ color: badge.color, backgroundColor: badge.bg }}>{badge.label}</span>
                        )}
                      </div>
                      <p className="text-xs truncate mt-0.5" style={{ color: textMuted }}>
                        {row.installerName || row.driverName || 'No name set'} · {row.route ? row.route.slice(0, 40) + (row.route.length > 40 ? '…' : '') : 'No route'}
                      </p>
                    </div>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
                  </button>
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${border}` }}>
                      <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: border }}>
                        {renderMobileCell(row, 'service', 'Service', <Truck className="w-3 h-3" />, finalVehicleOptions, true)}
                        {renderMobileCell(row, 'driverName', 'Driver', <User className="w-3 h-3" />, finalDriverOptions)}
                        {renderMobileCell(row, 'driverTime', 'Driver In', <Clock className="w-3 h-3" />, ['8:00AM', '7:00AM', '6:00AM', '9:00AM'])}
                        {renderMobileCell(row, 'installerName', 'Installer', <User className="w-3 h-3" />, finalInstallerOptions)}
                        {renderMobileCell(row, 'installerTime', 'Installer In', <Clock className="w-3 h-3" />, ['7:00AM', '8:00AM', '6:00AM', '9:00AM'])}
                        {renderMobileCell(row, 'route', 'Route', <MapPin className="w-3 h-3" />, finalRouteOptions, true)}
                        {renderMobileCell(row, 'remarks', 'Remarks', <MessageSquare className="w-3 h-3" />, finalRemarksOptions, true)}
                      </div>
                      {canEdit && (
                        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: `1px solid ${border}` }}>
                          <button onClick={() => { setEditingCell({ rowId: row.id, field: 'service' }); setTempValue(row.service || '') }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                            style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.2)' }}>
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => handleDelete(row)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <Trash2 className="w-3.5 h-3.5" /> Remove
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
          <div className="rounded-2xl p-4 flex flex-col gap-2 mt-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            {canEdit ? (
              <textarea
                value={lineupNotes}
                onChange={e => handleUpdateNotes(e.target.value)}
                onBlur={handleSaveNotes}
                placeholder="Type custom comments/notes (e.g. SIR ROMMEL - DAY OFF)..."
                className="w-full text-xs font-bold outline-none resize-none min-h-[80px] no-scrollbar"
                style={{ backgroundColor: 'transparent', border: 'none', padding: 0, color: '#EF4444' }}
              />
            ) : (
              <div className="text-xs font-black uppercase tracking-wide whitespace-pre-line" style={{ color: '#EF4444' }}>
                {lineupNotes || '—'}
              </div>
            )}
          </div>
        )}

        {/* Mobile Save Schedule Button */}
        {canEdit && rows.length > 0 && (
          <div className="mt-4 px-1 no-print">
            <button
              onClick={handleSaveAll}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          DESKTOP VIEW  — original design  (hidden below md)
          ═══════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col gap-6 pb-8">

        {/* Original Top Control Bar */}
        <div className="rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#10B981' }}>Scheduling</p>
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>Team Line-Up</h2>
            <p className="text-sm" style={{ color: textMuted }}>Manage and view tomorrow's field deployment schedule by branch.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full lg:w-auto justify-start lg:justify-end">
            {/* Branch */}
            <div style={{ position: 'relative' }} className="flex items-center">
              <Building2 className="w-3.5 h-3.5" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textMuted, pointerEvents: 'none', zIndex: 1 }} />
              <select value={branchId} onChange={e => setBranchId(e.target.value)}
                className="rounded-xl pl-8 pr-7 py-2 text-xs font-bold appearance-none outline-none cursor-pointer"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                {branches.length === 0 && <option value="">Loading branches…</option>}
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: textMuted }}>▼</span>
            </div>

            {/* Date */}
            <div onClick={() => desktopDateInputRef.current?.showPicker?.()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
              <ClipboardList className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              <input ref={desktopDateInputRef} type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-transparent outline-none text-xs font-bold cursor-pointer" style={{ color: textPrimary }} />
            </div>

            {/* ── Import Dropdown ── */}
            {canEdit && (
              <div className="relative" ref={importMenuRef}>
                <button type="button"
                  onClick={() => { setImportMenuOpen(o => !o); setExportMenuOpen(false) }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                  <Upload className="w-3.5 h-3.5" />
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

            {/* ── Export Dropdown ── */}
            <div className="relative" ref={exportMenuRef}>
              <button type="button"
                onClick={() => { setExportMenuOpen(o => !o); setImportMenuOpen(false) }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
                style={{ backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)', color: '#3B82F6' }}>
                <Download className="w-3.5 h-3.5" />
                Export
                <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${exportMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {exportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl overflow-hidden shadow-2xl"
                    style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                    <div className="py-1.5">
                      <button type="button"
                        onClick={() => { handleExportExcel(); setExportMenuOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        style={{ color: '#3B82F6' }}>
                        <Download className="w-3.5 h-3.5" />
                        <div>
                          <div>Export Excel</div>
                          <div className="text-[10px] font-medium opacity-60">.xlsx spreadsheet</div>
                        </div>
                      </button>
                      <button type="button"
                        onClick={() => { handleCopyImage(); setExportMenuOpen(false) }}
                        disabled={copyingImage}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
                        style={{ color: '#A855F7' }}>
                        {copyingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                        <div>
                          <div>Copy Image</div>
                          <div className="text-[10px] font-medium opacity-60">Paste to group chat</div>
                        </div>
                      </button>
                      <button type="button"
                        onClick={() => { handleSaveImage(); setExportMenuOpen(false) }}
                        disabled={copyingImage}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
                        style={{ color: '#EC4899' }}>
                        {copyingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                        <div>
                          <div>Save Image</div>
                          <div className="text-[10px] font-medium opacity-60">Download .png file</div>
                        </div>
                      </button>
                      <div style={{ height: '1px', backgroundColor: border, margin: '4px 16px' }} />
                      <button type="button"
                        onClick={() => { window.print(); setExportMenuOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        style={{ color: textMuted }}>
                        <Printer className="w-3.5 h-3.5" />
                        <div>
                          <div>Print</div>
                          <div className="text-[10px] font-medium opacity-60">Send to printer</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>



             {/* ── Load Template (standalone) ── */}
            {canEdit && (
              <button type="button" onClick={handleLoadDefaultTemplate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-emerald-600 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all hover:scale-105">
                <ClipboardList className="w-4 h-4" /> Load Template
              </button>
            )}

            {/* ── Add Row (standalone) ── */}
            {canEdit && (
              <button type="button" onClick={handleAddRow}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/10 transition-all hover:scale-105">
                <Plus className="w-4 h-4" /> Add Row
              </button>
            )}
          </div>
        </div>



        {/* Original Line-Up Sheet */}
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

          {/* Green banner */}
          <div style={{ background: isLight ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #064e3b, #022c22)', padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 950, fontSize: '20px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              TEAM {branchName ? branchName.toUpperCase() : '—'} LINE UP
            </div>
          </div>
          <div style={{ backgroundColor: isLight ? '#10b981' : '#065f46', padding: '8px 20px', textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '13px', letterSpacing: '0.08em' }}>{englishLabel(date)}</div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {thOrig('SERVICE')}
                  {thOrig('DRIVER')}
                  {thOrig('SCHEDULED TIME – IN OF DRIVER')}
                  {thOrig('INSTALLER')}
                  {thOrig('SCHEDULED TIME – IN OF INSTALLER')}
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
                          style={{ color: '#10B981', fontWeight: 700, marginTop: '12px', fontSize: '12px' }}
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
                    const defaultBg       = idx % 2 === 0 ? (isLight ? '#fcfdfd' : '#09101E') : 'transparent'
                    const selectedBg      = isLight ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.12)'
                    const hoverBgColor    = isLight ? '#f8fafc' : '#101B30'
                    return (
                      <tr key={row.id}
                        style={{
                          backgroundColor: (isRowSelected || isEditingThis) ? selectedBg : defaultBg,
                          borderBottom: `1px solid ${border}`,
                          cursor: canEdit ? 'pointer' : 'default',
                          outline: isRowSelected ? `2px solid #10B98140` : 'none',
                          outlineOffset: '-1px',
                          position: 'relative',
                        }}
                        className="transition-colors"
                        onMouseEnter={e => { if (!isRowSelected && !isEditingThis) e.currentTarget.style.backgroundColor = hoverBgColor }}
                        onMouseLeave={e => { if (!isRowSelected && !isEditingThis) e.currentTarget.style.backgroundColor = defaultBg }}
                        onClick={e => {
                          // Don't toggle selection if clicking inside an active input or button
                          if ((e.target as HTMLElement).closest('input,button,a,select')) return
                          if (!canEdit) return

                          setSelectedRowId(prev => prev === row.id ? null : row.id)
                          // If already editing a different cell, deselect editing
                          if (editingCell && editingCell.rowId !== row.id) {
                            const activeRow = rows.find(r => r.id === editingCell.rowId)
                            if (activeRow) {
                              void saveCell(activeRow, editingCell.field, tempValue)
                            }
                          }
                        }}
                        onContextMenu={e => {
                          // Don't show context menu if clicking inside an active input or dropdown
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
                        {renderEditableTd(row, 'service',       finalVehicleOptions,   { textAlign: 'center', fontWeight: 900, fontSize: '13px', color: textPrimary })}
                        {renderEditableTd(row, 'driverName',    finalDriverOptions,    { textAlign: 'center', fontWeight: 700, fontSize: '13px', color: textPrimary })}
                        {renderEditableTd(row, 'driverTime',    ['8:00AM','7:00AM','6:00AM','9:00AM'], { textAlign: 'center', fontSize: '13px', color: textPrimary })}
                        {renderEditableTd(row, 'installerName', finalInstallerOptions, { textAlign: 'center', fontWeight: 700, fontSize: '13px', color: textPrimary })}
                        {renderEditableTd(row, 'installerTime', ['7:00AM','8:00AM','6:00AM','9:00AM'], { textAlign: 'center', fontSize: '13px', color: textPrimary })}
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
                    <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#10B981' }}>TOTAL UNITS INSTALLATION</td>
                    <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#10B981' }}>{totalUnits}</td>
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
              {canEdit && (
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm no-print"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
              )}
            </div>
            {/* Print fallback for totals table */}
            <table className="hidden print:table" style={{ borderCollapse: 'collapse', minWidth: '360px' }}>
              <tbody>
                <tr style={{ backgroundColor: isLight ? '#e8f5e9' : 'rgba(16,185,129,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#10B981' }}>TOTAL UNITS INSTALLATION</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#10B981' }}>{totalUnits}</td>
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

      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: fixed; inset: 0; margin: 0; padding: 0; border: none !important; }
          .no-print { display: none !important; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none !important; }
        .no-scrollbar { -ms-overflow-style: none !important; scrollbar-width: none !important; }
      `}</style>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DropdownItem({ icon, label, color, onClick, disabled }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold transition-colors hover:bg-black/5 disabled:opacity-40"
      style={{ color }}>
      {icon} {label}
    </button>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
      style={{ backgroundColor: color + '18', border: `1px solid ${color}30`, color }}>
      <span className="font-black text-sm leading-none">{value}</span>
      <span className="uppercase tracking-wide text-[9px]">{label}</span>
    </div>
  )
}
