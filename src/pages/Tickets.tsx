import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Trash2, X, Edit3, AlertTriangle, Building2, CalendarDays,
  Eye, Phone, Mail, MapPin, User, Wrench, Clock
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Ticket {
  id: string
  title: string
  description?: string
  serviceType?: string
  service_type?: string
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
  assignedTo?: string
  assigned_employee_name?: string
  assignedEmployeeName?: string
  branchId?: string
  branch_id?: string
  remarks?: string
  remarksUpdate?: string
  note?: string
  commitTerms?: string
  amountCharged?: number
  dealer?: string
  district?: string
  installerName?: string
  controlNumber?: string
  control_number?: string
}

// ── Column → ticket field mapping ─────────────────────────────────────────────
const COL_FIELD: Record<string, keyof Ticket> = {
  "CUSTOMER'S NAME": 'customerName',
  'DESTINATION':     'location',
  'DISTRICT':        'district',
  'CONTACT NO.':     'contactPhone',
  'BRAND':           'unitType',
  'DLR':             'dealer',
  'STATUS':          'status',
  'COMMIT':          'commitTerms',
  'INSTALLER':       'assignedEmployeeName',
  'NOTE':            'note',
  'SERVICE':         'serviceType',
  'UPDATE':          'remarks',
}

const EDITABLE_COLS = [
  "CUSTOMER'S NAME", 'DESTINATION', 'DISTRICT', 'CONTACT NO.', 'BRAND', 'DLR',
  'STATUS', 'COMMIT', 'INSTALLER', 'NOTE', 'SERVICE', 'UPDATE',
]

const STATUS_OPTS = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

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
    if (/lat|lng|long|latitude|longitude/i.test(s)) return ''
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

function parseBrand(ticket: Ticket): string {
  if (ticket.unitType || ticket.unit_type) return ticket.unitType || ticket.unit_type || ''
  const raw = ticket.acDetails || ticket.ac_details
  if (raw) {
    try {
      const arr = JSON.parse(raw)
      const a = Array.isArray(arr) ? arr : [arr]
      const brands: string[] = []
      for (const u of a) {
        ;(Array.isArray(u?.details) ? u.details : []).forEach((d: any) => { if (d?.brand) brands.push(d.brand) })
        if (u?.brand) brands.push(u.brand)
      }
      if (brands.length) return brands.join(', ')
      for (const u of a) { if (u?.unitType) return u.unitType }
    } catch { /* fall through */ }
  }
  return ticket.unitType || ticket.unit_type || ''
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
  if (!id) return 'All branches'
  const upper = id.toUpperCase()
  if (upper === 'BR-TAGUIG-SALES-SALES' || upper === 'BR-TAGUIG-SALES') {
    return 'TAGUIG SALES'
  }
  if (upper === 'BR-TAGUIG-SALES-SERVICES' || upper === 'BR-TAGUIG-SERVICES' || upper === 'BR-TAGUIG-SERVICE') {
    return 'TAGUIG SERVICES'
  }
  return id.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').replace(/-/g, ' ').toUpperCase()
}

const ACTIVE = ['PENDING', 'ASSIGNED', 'IN_PROGRESS']
const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

// ── Main component ────────────────────────────────────────────────────────────
export default function Tickets() {
  const { theme } = useTheme()
  const { user }  = useAuth()
  const navigate   = useNavigate()
  const isLight    = theme === 'light'

  const role      = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'
  const isAdmin    = role === 'admin'
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

  // ── Color tokens ──────────────────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1A2740'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg     = isLight ? '#f1f5f9' : '#060C18'
  const rowEven     = isLight ? '#ffffff' : '#0A1120'
  const rowOdd      = isLight ? '#f9fafb' : '#0d1626'
  const rowHover    = isLight ? '#f1f5f9' : '#0f1e36'
  const editCellBg  = isLight ? '#fffbeb' : '#1a2800'
  const green       = '#16A34A'

  // ── Data state ────────────────────────────────────────────────────────────
  const [tickets, setTickets]         = useState<Ticket[]>([])
  const [loading, setLoading]         = useState(true)
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter]   = useState('')
  const [hoveredRow, setHoveredRow]   = useState<string | null>(null)

  // ── Cell editing state ────────────────────────────────────────────────────
  // editingCell: { rowId, col } — which cell is being edited
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null)
  const [cellValue, setCellValue]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState<string | null>(null)

  // ── Context menu ──────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ticket: Ticket } | null>(null)
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)

  // ── History state ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ── Completion prompt state ───────────────────────────────────────────────
  const [completionPrompt, setCompletionPrompt] = useState<{
    ticket: Ticket
    value: string
    modeOfPayment: string
    amount: string
  } | null>(null)

  useEffect(() => {
    if (!detailTicket) {
      setHistory([])
      return
    }
    setLoadingHistory(true)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    fetch(`${API_URL}/tickets/${detailTicket.id}/history`, {
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

  // ── Expand cols ───────────────────────────────────────────────────────────
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})
  const toggleCol = useCallback((label: string) =>
    setExpandedCols(p => ({ ...p, [label]: !p[label] })), [])

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  // ── Column config ─────────────────────────────────────────────────────────
  const columns = useMemo(() => {
    const raw = [
      { label: "CUSTOMER'S NAME", w: 160, expW: 280, sticky: true,  freeze: false },
      { label: 'DESTINATION',     w: 200, expW: 420, sticky: true,  freeze: true  },
      { label: 'DISTRICT',        w: 100, expW: 160, sticky: false, freeze: false },
      { label: 'CONTACT NO.',     w: 120, expW: 180, sticky: false, freeze: false },
      { label: 'BRAND',           w: 120, expW: 220, sticky: false, freeze: false },
      { label: 'DLR',             w: 90,  expW: 160, sticky: false, freeze: false },
      { label: 'STATUS',          w: 72,  expW: 110, sticky: false, freeze: false },
      { label: 'COMMIT',          w: 140, expW: 280, sticky: false, freeze: false },
      { label: 'INSTALLER',       w: 130, expW: 220, sticky: false, freeze: false },
      { label: 'NOTE',            w: 150, expW: 300, sticky: false, freeze: false },
      { label: 'SERVICE',         w: 110, expW: 180, sticky: false, freeze: false },
      { label: 'UPDATE',          w: 170, expW: 340, sticky: false, freeze: false },
    ]
    let left = 0
    return raw.map(c => {
      const isExpanded = !!expandedCols[c.label]
      const width = isExpanded ? c.expW : c.w
      const l = c.sticky ? left : 0
      if (c.sticky) left += width
      return { ...c, isExpanded, width, left: l }
    })
  }, [expandedCols])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const token = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const fetchTickets = useCallback(async () => {
    if (!user) return
    setLoading(true); setFetchError(null)
    try {
      const ep   = isCustomer ? '/tickets/my' : isAdmin ? '/tickets' : '/tickets/branch'
      const size = isAdmin ? 300 : 200
      const res  = await fetch(`${API_URL}${ep}?page=0&size=${size}`, {
        headers: { Authorization: `Bearer ${token()}` }
      })
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setTickets(data?.data?.tickets || data?.tickets || [])
    } catch { setFetchError('Failed to load tickets. Check your connection.') }
    finally  { setLoading(false) }
  }, [user, isCustomer, isAdmin, token])

  useEffect(() => { fetchTickets() }, [fetchTickets])
  useEffect(() => { if (isAdmin) fetchTickets() }, [globalBranchId, isAdmin])

  // ── Filter ────────────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    let list = tickets.filter(t => ACTIVE.includes(t.status.toUpperCase()))
    if (isAdmin && globalBranchId) {
      list = list.filter(t => {
        const b = (t.branchId || t.branch_id || '').toUpperCase()
        if (!b) return true
        const g = (globalBranchId || '').toUpperCase()
        const cleanB = b.replace(/-(SALES|SERVICES)$/, '')
        const cleanG = g.replace(/-(SALES|SERVICES)$/, '')
        return cleanB === cleanG
      })
    }
    if (dateFilter) {
      list = list.filter(t => {
        const dateStr = t.preferredDate || t.preferred_date || t.createdAt || t.created_at
        if (!dateStr) return false
        const parsedDate = dateStr.split('T')[0].split(' ')[0].trim()
        return parsedDate === dateFilter
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        [t.customerName, t.customer_name, t.contactPhone, t.assignedEmployeeName,
         t.assigned_employee_name, t.serviceType, t.service_type, t.description,
         t.remarks, t.note, t.id].some(v => v?.toLowerCase().includes(q))
        || formatAddress(t.location).toLowerCase().includes(q)
      )
    }
    return list
  }, [tickets, isAdmin, globalBranchId, dateFilter, searchQuery])

  const counts = useMemo(() => ({
    pending:    visible.filter(t => t.status.toUpperCase() === 'PENDING').length,
    assigned:   visible.filter(t => t.status.toUpperCase() === 'ASSIGNED').length,
    inProgress: visible.filter(t => ['ON_THE_WAY','IN_PROGRESS'].includes(t.status.toUpperCase())).length,
  }), [visible])

  // ── Get display value for a column ────────────────────────────────────────
  function getCellDisplay(ticket: Ticket, colLabel: string): string {
    switch (colLabel) {
      case "CUSTOMER'S NAME": return getF(ticket, 'customerName', 'customer_name') || ticket.title
      case 'DESTINATION':     return formatAddress(ticket.location)
      case 'DISTRICT':        return parseDistrict(ticket.location, ticket.district)
      case 'CONTACT NO.':     return getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
      case 'BRAND':           return parseBrand(ticket)
      case 'DLR':             return getF(ticket, 'dealer', 'serviceType', 'service_type')
      case 'STATUS':          return ticket.status
      case 'COMMIT':          return getF(ticket, 'commitTerms', 'description')
      case 'INSTALLER':       return getF(ticket, 'installerName', 'assignedEmployeeName', 'assigned_employee_name')
      case 'NOTE':            return ticket.note || ''
      case 'SERVICE':         return getF(ticket, 'serviceType', 'service_type')
      case 'UPDATE':          return ticket.remarksUpdate || ticket.remarks || ''
      default: return ''
    }
  }

  // ── Cell click → start editing ─────────────────────────────────────────────
  const startEdit = (ticket: Ticket, col: string) => {
    if (!canEdit || !EDITABLE_COLS.includes(col)) return
    const val = getCellDisplay(ticket, col)
    setEditingCell({ rowId: ticket.id, col })
    setCellValue(val)
    setContextMenu(null)
  }

  // Focus the input after entering edit mode
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select()
      }
    }
  }, [editingCell])

  // ── Save current cell ─────────────────────────────────────────────────────
  const saveCell = useCallback(async (rowId: string, col: string, value: string, silent = false) => {
    console.log(`[saveCell] ENTER - rowId: ${rowId}, col: ${col}, value: "${value}", active editingCell:`, editingCell);

    // Safety: ignore the save call if we are no longer editing this specific cell
    // (prevents double-save race conditions, e.g., Enter key followed by native input unmount blur)
    if (!editingCell || editingCell.rowId !== rowId || editingCell.col !== col) {
      console.log(`[saveCell] BYPASSED - editingCell does not match active cell. Active:`, editingCell, `Requested:`, { rowId, col });
      return
    }

    const field = COL_FIELD[col]
    if (!field) { setEditingCell(null); return }
    const current = tickets.find(t => t.id === rowId)
    if (!current) {
      console.log(`[saveCell] ERROR - Ticket not found in state: ${rowId}`);
      setEditingCell(null);
      return
    }

    if (col === 'UPDATE' && value.toLowerCase().includes('installed')) {
      console.log(`[saveCell] INTERCEPTED "installed" for rowId: ${rowId}`);
      setCompletionPrompt({
        ticket: current,
        value,
        modeOfPayment: 'CASH',
        amount: ''
      })
      setEditingCell(null)
      setCellValue('')
      return
    }

    const normalized = col === 'STATUS' ? value.toUpperCase() : value
    const localPatch: Partial<Ticket> = { [field]: normalized } as Partial<Ticket>
    const body: Record<string, any> = { [field]: normalized }

    if (col === 'DESTINATION') {
      localPatch.location = normalized
      body.location = normalized
      body.acDetails = mergeAcMeta(current, { destination: normalized, address: normalized })
    } else if (col === 'DISTRICT') {
      body.acDetails = mergeAcMeta(current, { district: normalized })
    } else if (col === 'BRAND') {
      localPatch.unitType = normalized
      localPatch.acDetails = mergeAcMeta(current, { brand: normalized, unitType: normalized })
      body.unitType = normalized
      body.acDetails = localPatch.acDetails
    } else if (col === 'DLR') {
      body.dealer = normalized
      body.sourceVendor = normalized
      body.acDetails = mergeAcMeta(current, { dealer: normalized, dlr: normalized })
    } else if (col === 'COMMIT') {
      body.commitTerms = normalized
      body.description = normalized
    } else if (col === 'INSTALLER') {
      localPatch.installerName = normalized
      localPatch.assignedEmployeeName = normalized
      body.installerName = normalized
      body.assignedEmployeeName = normalized
      body.acDetails = mergeAcMeta(current, { installerName: normalized, negotiator: normalized })
    } else if (col === 'NOTE') {
      body.note = normalized
      body.description = normalized
    } else if (col === 'UPDATE') {
      localPatch.remarksUpdate = normalized
      localPatch.remarks = normalized
      body.remarksUpdate = normalized
      body.remarks = normalized
      body.acDetails = mergeAcMeta(current, { update: normalized, remarksUpdate: normalized })
    } else if (col === 'SERVICE') {
      body.serviceType = normalized
    } else if (col === "CUSTOMER'S NAME") {
      body.customerName = normalized
    } else if (col === 'CONTACT NO.') {
      body.contactPhone = normalized
    }

    // Optimistic UI update immediately
    setTickets(prev => prev.map(t => {
      if (t.id !== rowId) return t
      return { ...t, ...localPatch }
    }))
    setEditingCell(null)
    setCellValue('')

    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/tickets/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const payload = await res.json()
      const updated = payload?.data || payload
      if (updated && updated.id) {
        setTickets(prev => prev.map(t => t.id === rowId ? { ...t, ...updated, ...localPatch } : t))
      }
      if (!silent) showToast('Saved ✓')
    } catch (e: any) {
      // Revert optimistic update on failure
      await fetchTickets()
      if (!silent) alert(`Could not save: ${e?.message || 'Unknown error'}`)
    } finally { setSaving(false) }
  }, [token, fetchTickets, tickets, editingCell])

  // ── Cancel editing ────────────────────────────────────────────────────────
  const cancelEdit = () => { setEditingCell(null); setCellValue('') }

  // ── Get next/prev editable cell in the visible list ───────────────────────
  function getAdjacentCell(rowId: string, col: string, dir: 'next' | 'prev' | 'down' | 'up') {
    const rowIdx = visible.findIndex(t => t.id === rowId)
    const colIdx = EDITABLE_COLS.indexOf(col)
    if (rowIdx === -1 || colIdx === -1) return null

    if (dir === 'next') {
      const nextCol = colIdx + 1
      if (nextCol < EDITABLE_COLS.length) return { rowId, col: EDITABLE_COLS[nextCol] }
      const nextRow = rowIdx + 1
      if (nextRow < visible.length) return { rowId: visible[nextRow].id, col: EDITABLE_COLS[0] }
    }
    if (dir === 'prev') {
      const prevCol = colIdx - 1
      if (prevCol >= 0) return { rowId, col: EDITABLE_COLS[prevCol] }
      const prevRow = rowIdx - 1
      if (prevRow >= 0) return { rowId: visible[prevRow].id, col: EDITABLE_COLS[EDITABLE_COLS.length - 1] }
    }
    if (dir === 'down') {
      const nextRow = rowIdx + 1
      if (nextRow < visible.length) return { rowId: visible[nextRow].id, col }
    }
    if (dir === 'up') {
      const prevRow = rowIdx - 1
      if (prevRow >= 0) return { rowId: visible[prevRow].id, col }
    }
    return null
  }

  // ── Keyboard handler for editing ──────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent, rowId: string, col: string) => {
    const multiline = ['COMMIT', 'NOTE', 'DESTINATION'].includes(col)

    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); return }

    if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      const next = getAdjacentCell(rowId, col, 'down')
      saveCell(rowId, col, cellValue, true).then(() => {
        if (next) { const t = visible.find(x => x.id === next.rowId); if (t) startEdit(t, next.col) }
      })
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const dir = e.shiftKey ? 'prev' : 'next'
      const next = getAdjacentCell(rowId, col, dir)
      saveCell(rowId, col, cellValue, true).then(() => {
        if (next) { const t = visible.find(x => x.id === next.rowId); if (t) startEdit(t, next.col) }
      })
      return
    }

    if (e.key === 'ArrowDown' && !multiline) {
      e.preventDefault()
      const next = getAdjacentCell(rowId, col, 'down')
      saveCell(rowId, col, cellValue, true).then(() => {
        if (next) { const t = visible.find(x => x.id === next.rowId); if (t) startEdit(t, next.col) }
      })
      return
    }

    if (e.key === 'ArrowUp' && !multiline) {
      e.preventDefault()
      const next = getAdjacentCell(rowId, col, 'up')
      saveCell(rowId, col, cellValue, true).then(() => {
        if (next) { const t = visible.find(x => x.id === next.rowId); if (t) startEdit(t, next.col) }
      })
      return
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (ticketId: string) => {
    if (!confirm('Delete this ticket?')) return
    setContextMenu(null)
    try {
      const res = await fetch(`${API_URL}/tickets/${ticketId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token()}` }
      })
      if (!res.ok) throw new Error('Failed')
      setTickets(p => p.filter(t => t.id !== ticketId))
      showToast('Deleted')
    } catch { alert('Could not delete.') }
  }

  // ── Render cell content ───────────────────────────────────────────────────
  function renderCell(ticket: Ticket, col: (typeof columns)[0]) {
    const { label } = col
    const isThisEditing = editingCell?.rowId === ticket.id && editingCell?.col === label
    const isEditable    = EDITABLE_COLS.includes(label)

    // ── EDITING STATE ──
    if (isThisEditing) {
      const inputClass = 'w-full text-xs rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-green-500 font-medium'
      const inputSt    = { backgroundColor: editCellBg, border: `1.5px solid ${green}`, color: textPrimary }

      if (label === 'STATUS') {
        return (
          <select
            ref={el => { inputRef.current = el }}
            value={cellValue}
            onChange={e => setCellValue(e.target.value)}
            onBlur={() => saveCell(ticket.id, label, cellValue)}
            onKeyDown={e => handleKeyDown(e as any, ticket.id, label)}
            className={inputClass} style={inputSt}>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        )
      }

      const multiline = ['COMMIT', 'NOTE'].includes(label)
      if (multiline) {
        return (
          <textarea
            ref={el => { inputRef.current = el as any }}
            value={cellValue}
            onChange={e => setCellValue(e.target.value)}
            onBlur={() => saveCell(ticket.id, label, cellValue)}
            onKeyDown={e => handleKeyDown(e as any, ticket.id, label)}
            rows={3}
            className={`${inputClass} resize-none`}
            style={inputSt} />
        )
      }

      return (
        <input
          ref={el => { inputRef.current = el }}
          type={label === 'CONTACT NO.' ? 'tel' : 'text'}
          value={cellValue}
          onChange={e => setCellValue(e.target.value)}
          onBlur={() => saveCell(ticket.id, label, cellValue)}
          onKeyDown={e => handleKeyDown(e, ticket.id, label)}
          className={inputClass} style={inputSt} />
      )
    }

    // ── DISPLAY STATE ──
    const val = getCellDisplay(ticket, label)
    const truncStyle: React.CSSProperties = col.isExpanded
      ? { wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.5 }
      : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }

    const editHint: React.CSSProperties = isEditable && canEdit
      ? { cursor: 'text' } : {}

    if (label === 'STATUS') {
      const sc = statusColor(val, isLight)
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase inline-block"
              style={{ color: sc.text, backgroundColor: sc.bg, border: `1px solid ${sc.b}` }}>
          {statusCode(val)}
        </span>
      )
    }

    if (label === 'SERVICE') {
      const isInstall = val.toUpperCase().includes('INSTALL')
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase block text-center"
              style={{
                backgroundColor: isInstall ? 'rgba(16,185,129,0.10)' : 'rgba(6,182,212,0.10)',
                color: isInstall ? (isLight ? '#059669' : '#34D399') : (isLight ? '#0891B2' : '#22D3EE'),
                border: `1px solid ${isInstall ? 'rgba(16,185,129,0.25)' : 'rgba(6,182,212,0.25)'}`,
              }}>
          {val || '—'}
        </span>
      )
    }

    if (label === 'CONTACT NO.') {
      const formatted = val ? fmtPhone(val) || val : ''
      return (
        <a href={val ? `tel:${val.replace(/\D/g,'').replace(/^0/,'+63')}` : '#'}
           style={{ color: '#10B981', ...truncStyle, ...editHint }}
           onClick={e => { if (canEdit) { e.preventDefault(); startEdit(ticket, label) } }}
           title={val}>
          {formatted}
        </a>
      )
    }

    if (label === 'NOTE') {
      return (
        <span style={{ ...truncStyle, color: val ? '#EF4444' : textMuted, fontWeight: val ? 600 : 400, ...editHint }}
              title={val} className={col.isExpanded ? '' : 'line-clamp-2'}>
          {val || ''}
        </span>
      )
    }

    if (label === 'UPDATE') {
      return (
        <span style={{ ...truncStyle, color: val ? green : textMuted, fontWeight: val ? 600 : 400, ...editHint }}
              title={val} className={col.isExpanded ? '' : 'line-clamp-2'}>
          {val || ''}
        </span>
      )
    }

    if (label === "CUSTOMER'S NAME") {
      return (
        <span style={{ ...truncStyle, fontWeight: 600, ...editHint }} title={val}>{val}</span>
      )
    }

    return <span style={{ ...truncStyle, ...editHint }} title={val}>{val}</span>
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-8" onClick={() => { setContextMenu(null); if (!saving) cancelEdit() }}>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[9999] px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-2xl transition-all"
             style={{ backgroundColor: green }}>
          {saving ? '⏳ Saving…' : toast}
        </div>
      )}
      {saving && !toast && (
        <div className="fixed bottom-5 right-5 z-[9999] px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-2xl"
             style={{ backgroundColor: '#6366F1' }}>
          ⏳ Saving…
        </div>
      )}

      {/* ── Header bar ── */}
      <div className="rounded-2xl px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm"
           style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold"
                 style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', borderColor: inputBorder, color: textMuted }}>
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>{getBranchDisplayName(globalBranchId)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-sm"
               style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
            <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
            {dateFilter && (
              <span className="uppercase tracking-wider text-[9px] font-black opacity-60 border-r pr-1.5" style={{ borderColor: border }}>
                {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short' })}
              </span>
            )}
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                   className="bg-transparent outline-none cursor-pointer font-bold"
                   style={{ color: textPrimary }} />
            {dateFilter && (
              <button onClick={e => { e.stopPropagation(); setDateFilter('') }} style={{ color: textMuted }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border flex-1 min-w-[150px] max-w-xs"
               style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
            <input type="text" placeholder="Search..." value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   className="bg-transparent outline-none text-xs flex-1 font-medium"
                   style={{ color: textPrimary }}
                   onClick={e => e.stopPropagation()} />
            {searchQuery && (
              <button onClick={e => { e.stopPropagation(); setSearchQuery('') }} style={{ color: textMuted }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {isCustomer && (
            <button onClick={() => navigate('/tickets/create')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs text-white hover:opacity-90 shadow-sm"
                    style={{ backgroundColor: green }}>
              <Plus className="w-3.5 h-3.5" /> New Ticket
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {!loading && tickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs font-bold px-5 py-2.5 rounded-2xl border"
             style={{ backgroundColor: cardBg, borderColor: border }}>
          <span style={{ color: textMuted }} className="uppercase tracking-wider text-[10px]">Active Tickets:</span>
          <div className="flex items-center gap-1"><span style={{ color: textMuted }}>Pending</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(251,146,60,0.15)', color: '#FB923C' }}>{counts.pending}</span>
          </div>
          <div className="flex items-center gap-1"><span style={{ color: textMuted }}>Assigned</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>{counts.assigned}</span>
          </div>
          <div className="flex items-center gap-1"><span style={{ color: textMuted }}>In Progress</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981' }}>{counts.inProgress}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {fetchError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold"
             style={{ color: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />{fetchError}
          <button onClick={fetchTickets} className="ml-2 px-2 py-0.5 rounded text-white font-bold text-xs" style={{ backgroundColor: green }}>Retry</button>
        </div>
      )}

      {/* ── Table card ── */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
           onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              {tickets.length === 0 ? 'No active tickets' : 'No tickets match filters'}
            </p>
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-xs font-bold hover:underline" style={{ color: green }}>Clear search</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            <table className="text-xs" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                <tr style={{ backgroundColor: theadBg, borderBottom: `2px solid ${border}` }}>
                  <th style={{
                    padding: '9px 8px', color: textMuted, fontWeight: 700, fontSize: '10px',
                    letterSpacing: '0.07em', whiteSpace: 'nowrap', borderRight: `1px solid ${border}`,
                    position: 'sticky', left: 0, zIndex: 15, backgroundColor: theadBg, width: 36, textAlign: 'center'
                  }}>#</th>
                  {columns.map(col => (
                    <th key={col.label}
                        onClick={() => toggleCol(col.label)}
                        style={{
                          padding: '9px 10px',
                          color: col.isExpanded ? (isLight ? '#16A34A' : '#4ADE80') : textMuted,
                          fontWeight: 700, whiteSpace: 'nowrap',
                          borderRight: col.freeze ? `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}` : `1px solid ${border}`,
                          fontSize: '10px', letterSpacing: '0.08em',
                          width: col.width, minWidth: col.width, maxWidth: col.width,
                          backgroundColor: theadBg, cursor: 'pointer', userSelect: 'none',
                          ...(col.sticky ? { position: 'sticky' as const, left: col.left, zIndex: 15 } : {}),
                          ...(col.freeze ? { boxShadow: isLight ? '6px 0 12px -3px rgba(0,0,0,0.10)' : '8px 0 18px -4px rgba(0,0,0,0.40)' } : {}),
                        }}>
                      <div className="flex items-center justify-between gap-1">
                        <span>{col.label}</span>
                        <span className="opacity-40 text-[9px]">{col.isExpanded ? '◀' : '▶'}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((ticket, idx) => {
                  const isHovered = hoveredRow === ticket.id
                  const baseBg   = idx % 2 === 0 ? rowEven : rowOdd
                  const bg       = isHovered ? rowHover : baseBg
                  return (
                    <tr key={ticket.id}
                        style={{ borderBottom: `1px solid ${border}` }}
                        onMouseEnter={() => setHoveredRow(ticket.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onContextMenu={e => {
                          e.preventDefault()
                          if (canEdit || isAdmin) setContextMenu({ x: e.clientX, y: e.clientY, ticket })
                        }}>

                      {/* Row # */}
                      <td style={{
                        padding: '7px 8px', width: 36, minWidth: 36, maxWidth: 36,
                        textAlign: 'center', fontWeight: 700, fontSize: '10px',
                        color: textMuted, borderRight: `1px solid ${border}`,
                        position: 'sticky', left: 0, zIndex: 5,
                        backgroundColor: bg,
                        borderBottom: `1px solid ${border}`,
                      }}>
                        {idx + 1}
                      </td>

                      {/* Data cells */}
                      {columns.map((col) => {
                        const isThisEditing = editingCell?.rowId === ticket.id && editingCell?.col === col.label
                        const isEditable    = EDITABLE_COLS.includes(col.label) && canEdit
                        return (
                          <td key={col.label}
                              onClick={e => {
                                e.stopPropagation()
                                if (isEditable && !isThisEditing) startEdit(ticket, col.label)
                              }}
                              style={{
                                padding: isThisEditing ? '4px 6px' : '7px 10px',
                                color: textPrimary,
                                fontSize: '11px', fontWeight: 500,
                                backgroundColor: isThisEditing ? editCellBg : bg,
                                borderRight: col.freeze
                                  ? `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}`
                                  : `1px solid ${border}`,
                                borderBottom: `1px solid ${border}`,
                                width: col.width, minWidth: col.width, maxWidth: col.width,
                                transition: 'background-color 0.1s ease',
                                cursor: isEditable && !isThisEditing ? 'text' : 'default',
                                verticalAlign: 'top',
                                ...(col.sticky ? { position: 'sticky' as const, left: col.left, zIndex: 5 } : {}),
                                ...(col.freeze ? { boxShadow: isLight ? '6px 0 12px -3px rgba(0,0,0,0.10)' : '8px 0 18px -4px rgba(0,0,0,0.40)' } : {}),
                              }}>
                            {renderCell(ticket, col)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ── Right-click context menu ── */}
      {contextMenu && (
        <div className="fixed z-[200]" style={{ top: contextMenu.y, left: contextMenu.x }}
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

            {/* Edit update note */}
            {canEdit && (
              <button onClick={() => { startEdit(contextMenu.ticket, 'UPDATE'); setContextMenu(null) }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors"
                      style={{ color: textPrimary }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : '#0f1e36'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                <Edit3 className="w-3.5 h-3.5 shrink-0" style={{ color: '#6366F1' }} />
                Edit Update
              </button>
            )}

            {/* Delete — admin only */}
            {isAdmin && (
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
      )}

      {/* ── Full Details Modal ── */}
      {detailTicket && (() => {
        const t = detailTicket
        const sc = statusColor(t.status, isLight)
        const addr = formatAddress(t.location)
        const district = parseDistrict(t.location, t.district)
        const brand = parseBrand(t)
        const phone = getF(t, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
        const installer = getF(t, 'assignedEmployeeName', 'assigned_employee_name')
        const service = getF(t, 'serviceType', 'service_type')
        const update = t.remarks || ''
        const note = t.note || ''
        const commit = getF(t, 'commitTerms', 'description')
        const custName = getF(t, 'customerName', 'customer_name') || t.title
        const email = getF(t, 'customerEmail', 'customer_email', 'email')
        const preferredDate = t.preferredDate || t.preferred_date
        const dealer = getF(t, 'dealer')

        const Row = ({ icon: Icon, label, val, color }: { icon: any; label: string; val: string; color?: string }) =>
          val ? (
            <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
              <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: textMuted }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: textMuted }}>{label}</p>
                <p className="text-xs font-semibold leading-relaxed break-words" style={{ color: color || textPrimary }}>{val}</p>
              </div>
            </div>
          ) : null

        return (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6"
               style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
               onClick={() => setDetailTicket(null)}>
            <div className="flex flex-col w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden"
                 style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
                 onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="px-6 py-4 flex items-start justify-between gap-3 shrink-0"
                   style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Ticket Details</p>
                  <h3 className="font-black text-sm leading-tight" style={{ color: textPrimary }}>{custName}</h3>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black border inline-flex items-center gap-1.5 self-start"
                        style={{ color: sc.text, backgroundColor: sc.bg, borderColor: sc.b }}>
                    <Clock className="w-3 h-3" />{t.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <button onClick={() => setDetailTicket(null)}
                        className="p-2 rounded-lg shrink-0 hover:bg-slate-500/10 transition-colors"
                        style={{ color: textMuted }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Two Column Body */}
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x">
                
                {/* Left Column: Details */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-1">
                  <Row icon={User}    label="Customer"   val={custName} />
                  <Row icon={Phone}   label="Contact"    val={phone ? (fmtPhone(phone) || phone) : ''} />
                  <Row icon={Mail}    label="Email"      val={email} />
                  <Row icon={MapPin}  label="Address"    val={addr} />
                  <Row icon={MapPin}  label="District"   val={district} />
                  <Row icon={Wrench}  label="Service"    val={service} />
                  <Row icon={Wrench}  label="Brand / Unit" val={brand} />
                  <Row icon={Wrench}  label="Dealer"     val={dealer} />
                  <Row icon={User}    label="Installer"  val={installer} />
                  <Row icon={Clock}   label="Preferred Date" val={preferredDate ? new Date(preferredDate).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''} />
                  
                  {commit && (
                    <div className="py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Commit / Description</p>
                      <p className="text-xs leading-relaxed" style={{ color: textPrimary }}>{commit}</p>
                    </div>
                  )}
                  {note && (
                    <div className="py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Note</p>
                      <p className="text-xs leading-relaxed font-semibold" style={{ color: '#EF4444' }}>{note}</p>
                    </div>
                  )}
                  {update && (
                    <div className="py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Update</p>
                      <p className="text-xs leading-relaxed font-semibold" style={{ color: green }}>{update}</p>
                    </div>
                  )}
                </div>

                {/* Right Column: Update History */}
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
                        const listToRender = [...history]
                        const hasSubmission = listToRender.some(h => !h.previousStatus && h.newStatus === 'PENDING')
                        
                        if (!hasSubmission && t.createdAt) {
                          listToRender.push({
                            id: 'initial-sub',
                            changeNote: 'Submitted',
                            changedByUserName: custName,
                            createdAt: t.createdAt,
                            newPreferredDate: preferredDate
                          })
                        }
                        
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
                                    By: <span className="font-bold" style={{ color: textPrimary }}>{h.changedByUserName || 'System'}</span>
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
                                      Assigned: <span className="font-bold text-teal-500">{h.newAssignedToName}</span>
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
              </div>

              {/* Footer Actions */}
              <div className="shrink-0 px-6 py-4 flex flex-col sm:flex-row justify-end gap-3"
                   style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}>
                {canEdit && (
                  <button onClick={() => { startEdit(t, 'UPDATE'); setDetailTicket(null) }}
                          className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/5"
                          style={{ borderColor: inputBorder, color: textPrimary }}>
                    <Edit3 className="w-3.5 h-3.5" style={{ color: '#6366F1' }} />
                    Edit Update
                  </button>
                )}

              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Completion Prompt Modal ── */}
      {completionPrompt && (() => {
        const cp = completionPrompt
        const t = cp.ticket
        const custName = getF(t, 'customerName', 'customer_name') || t.title

        const handleSubmitCompletion = async (e: React.FormEvent) => {
          e.preventDefault()
          setCompletionPrompt(null)
          setSaving(true)
          
          try {
            const d = new Date()
            const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

             // 1. Post to Daily Service Report
             const serviceReportPayload = {
               branchId: (t.branchId || localStorage.getItem('ashcol-global-branch-id') || '').replace(/-(sales|services)$/i, ''),
               reportDate: todayStr,
               customerName: custName,
               customerAddress: formatAddress(t.location),
               customerPhone: getF(t, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
               district: parseDistrict(t.location, t.district),
               serviceType: cp.modeOfPayment === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
               statusCode: 'I',
               commitTerms: getF(t, 'commitTerms', 'description') || t.description || '',
               dealer: getF(t, 'dealer'),
               unitBrandModel: parseBrand(t),
               technicianName: getF(t, 'assignedEmployeeName', 'assigned_employee_name'),
               amountCharged: parseFloat(cp.amount) || 0,
               paymentStatus: cp.modeOfPayment,
               jobStatus: 'COMPLETED',
               remarks: cp.value || 'Installed',
               note: t.note || '',
               controlNumber: t.controlNumber || ''
             }

            const reportRes = await fetch(`${API_URL}/v1/service-reports`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token()}`
              },
              body: JSON.stringify(serviceReportPayload)
            })
            if (!reportRes.ok) throw new Error('Failed to create Service Report')

            // 2. Delete the ticket from the active list
            const deleteRes = await fetch(`${API_URL}/tickets/${t.id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token()}`
              }
            })
            if (!deleteRes.ok) throw new Error('Failed to delete Ticket')

            // 3. Remove from local list state
            setTickets(prev => prev.filter(x => x.id !== t.id))
            showToast('Ticket completed & moved to Service Report ✓')
          } catch (error: any) {
            console.error('Error completing ticket:', error)
            alert(`Could not complete ticket: ${error.message || 'Unknown error'}`)
          } finally {
            setSaving(false)
          }
        }

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
               style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
            <form onSubmit={handleSubmitCompletion}
                  className="flex flex-col w-full max-w-md rounded-3xl shadow-2xl p-6 gap-4"
                  style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
                  onClick={e => e.stopPropagation()}>
              
              <div className="flex flex-col gap-1">
                <h3 className="font-black text-sm leading-tight" style={{ color: textPrimary }}>
                  Complete Ticket: {custName}
                </h3>
                <p className="text-[10px] font-semibold" style={{ color: textMuted }}>
                  Enter payment details to move this ticket to the Service Report.
                </p>
              </div>

              {/* Mode of Payment select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Mode of Payment
                </label>
                <select
                  value={cp.modeOfPayment}
                  onChange={e => {
                    const nextMode = e.target.value
                    setCompletionPrompt(prev => {
                      if (!prev) return null
                      const nextAmount = nextMode === 'FREE' || nextMode === 'FREE INSTALL' ? '0' : prev.amount
                      return { ...prev, modeOfPayment: nextMode, amount: nextAmount }
                    })
                  }}
                  className="w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all focus:ring-2 focus:ring-green-500"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                  <option value="CASH">CASH</option>
                  <option value="BANK TRANSFER">BANK TRANSFER</option>
                  <option value="GCASH">GCASH</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="FREE INSTALL">FREE INSTALL</option>
                </select>
              </div>
 
              {/* Amount charged */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Amount Charged (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={cp.amount}
                  disabled={cp.modeOfPayment === 'FREE' || cp.modeOfPayment === 'FREE INSTALL'}
                  onChange={e => setCompletionPrompt(prev => prev ? { ...prev, amount: e.target.value } : null)}
                  className="w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all focus:ring-2 focus:ring-green-500 font-semibold disabled:opacity-60"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCompletionPrompt(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/5"
                  style={{ borderColor: inputBorder, color: textPrimary }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm"
                  style={{ backgroundColor: green }}>
                  Confirm & Move
                </button>
              </div>

            </form>
          </div>
        )
      })()}
    </div>
  )
}
