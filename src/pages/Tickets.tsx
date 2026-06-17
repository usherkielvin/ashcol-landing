import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Trash2, X, Edit3, AlertTriangle, Building2, CalendarDays,
  Eye, Phone, Mail, MapPin, User, Wrench, Clock, Upload
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Ticket {
  id: string
  title: string
  description?: string
  serviceType?: string
  service_type?: string
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
  assignedTo?: string
  assigned_employee_name?: string
  assignedEmployeeName?: string
  branchId?: string
  branch_id?: string
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
  controlNumber?: string
  control_number?: string
  installationCharges?: number
  installation_charges?: number
  modeOfPayment?: string
  mode_of_payment?: string
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

// ── Column → ticket field mapping ─────────────────────────────────────────────
const COL_FIELD: Record<string, keyof Ticket> = {
  "CUSTOMER'S NAME": 'customerName',
  'DESTINATION':     'location',
  'DISTRICT':        'district',
  'CONTACT NO.':     'contactPhone',
  'BRAND':           'unitType',
  'DLR':             'dealer',
  'STATUS':          'status',
  'COMMIT':          'commitType',
  'INSTALLER':       'assignedEmployeeName',
  'NOTE':            'note',
  'SERVICE':         'serviceVehicle',
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
  if (!id || id === 'ALL_BRANCHES') return 'All branches'
  const upper = id.toUpperCase()
  if (upper === 'BR-TAGUIG-SALES-SALES' || upper === 'BR-TAGUIG-SALES') {
    return 'TAGUIG - SALES'
  }
  if (upper === 'BR-TAGUIG-SALES-SERVICES' || upper === 'BR-TAGUIG-SERVICES' || upper === 'BR-TAGUIG-SERVICE') {
    return 'TAGUIG - SERVICES'
  }
  return id.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').replace(/-/g, ' ').toUpperCase()
}

function todayDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateTriggerLabel(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${month}/${day}/${year}` : value || 'Select date'
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

  const activeBranch = (globalBranchId || user?.branchId || '').toUpperCase()
  const isTaguigServices = activeBranch.includes('TAGUIG') && (activeBranch.includes('SERVICES') || activeBranch.includes('SERVICE'))

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
  const [dateFilter, setDateFilter]   = useState(() => isTaguigServices ? todayDateKey() : '')
  const dateFilterInputRef = useRef<HTMLInputElement>(null)
  const [hoveredRow, setHoveredRow]   = useState<string | null>(null)

  // ── Cell editing state ────────────────────────────────────────────────────
  // editingCell: { rowId, col } — which cell is being edited
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null)
  const [cellValue, setCellValue]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState<string | null>(null)

  useEffect(() => {
    if (isTaguigServices && !dateFilter) setDateFilter(todayDateKey())
  }, [isTaguigServices, dateFilter])

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

  // ── Excel Import State ───────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const handlePaymentFieldChange = (idx: number, field: 'amount' | 'modeOfPayment' | 'controlNumber', val: string) => {
    setImportResults(prev => {
      if (!prev) return null
      const nextNeeds = [...prev.needsConfirmation]
      nextNeeds[idx] = { ...nextNeeds[idx], [field]: val }
      return { ...prev, needsConfirmation: nextNeeds }
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
        installer: findColIdx(["TECHNICIAN", "INSTALLER"]),
        note: findColIdx(["NOTE", "NOTES"]),
        confirmation: findColIdx(["CONFIRMATION"]),
        service: findColIdx(["SERVICE", "SERVICE TYPE"]),
        update: findColIdx(["SERVICE STATUS", "UPDATE", "REMARKS", "ADMIN REMARKS"]),
        charges: findColIdx(["INSTALLATION CHARGES", "INSTALLATION CHARGE", "CHARGES", "AMOUNT"]),
        paymentMode: findColIdx(["MOP", "MODE OF PAYMENT", "PAYMENT MODE", "PAYMENT"]),
        controlNo: findColIdx(["PAPERS", "CONTROL# / SI", "CONTROL NUMBER", "CONTROL #", "SI NO", "SI NUMBER", "CONTROL"]),
        commit: findColIdx(["COMMIT", "COMMIT TERMS"]),
      }

      const updatesList: ImportUpdate[] = []
      const needsConfirmationList: ImportPaymentConfirmation[] = []
      const unmatchedList: ImportUnmatchedRow[] = []

      let matchedCount = 0
      let autoCompletedCount = 0
      let parsedRowCount = 0

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
        parsedRowCount++

        const match = tickets.find(t => {
          const tName = (t.customerName || t.customer_name || t.title || '').toLowerCase().trim()
          const cleanRowName = rowName.toLowerCase().trim()
          
          if (cleanRowName && tName) {
            if (tName === cleanRowName || tName.includes(cleanRowName) || cleanRowName.includes(tName)) {
              return true
            }
          }

          const tPhone = (t.contactPhone || t.contact_phone || t.customer_phone || t.phone || '').replace(/\D/g, '')
          const cleanRowPhone = rowPhone.replace(/\D/g, '')
          if (cleanRowPhone && tPhone) {
            if (tPhone === cleanRowPhone || tPhone.includes(cleanRowPhone) || cleanRowPhone.includes(tPhone)) {
              return true
            }
          }

          return false
        })

        if (match) {
          matchedCount++
          
          const updatedFields: Partial<Ticket> = {}
          const getFieldVal = (field: keyof Ticket, newVal: string) => {
            if (newVal) updatedFields[field] = newVal as any
          }

          getFieldVal('customerName', rowName)
          getFieldVal('location', rowDest)
          getFieldVal('district', val(colMap.district))
          getFieldVal('contactPhone', rowPhone)
          getFieldVal('unitType', val(colMap.brand))
          getFieldVal('sourceVendor', val(colMap.dlr))
          getFieldVal('note', val(colMap.note))
          getFieldVal('commitType', val(colMap.commit))
          getFieldVal('serviceVehicle', val(colMap.service))
          getFieldVal('remarksUpdate', val(colMap.update))
          getFieldVal('remarks', val(colMap.update))
          getFieldVal('controlNumber', val(colMap.controlNo))

          const rawCharges = val(colMap.charges)
          if (rawCharges) {
            const numeric = parseFloat(rawCharges.replace(/[₱phpPHP,\s]/g, ''))
            if (!isNaN(numeric)) {
              updatedFields.installationCharges = numeric
            }
          }

          const rawPaymentMode = val(colMap.paymentMode).toUpperCase()
          if (rawPaymentMode) {
            updatedFields.modeOfPayment = rawPaymentMode
          }

          const installer = val(colMap.installer)
          if (installer) {
            updatedFields.installerName = installer
            updatedFields.assignedEmployeeName = installer
          }

          const statusVal = val(colMap.status).toUpperCase()
          if (statusVal && STATUS_OPTS.includes(statusVal)) {
            updatedFields.status = statusVal
          }

          const updateRemarks = val(colMap.update).toLowerCase()
          const isInstalled = updateRemarks.includes('installed') || statusVal === 'COMPLETED'

          if (isInstalled) {
            const charges = updatedFields.installationCharges ?? match.installationCharges ?? match.amountCharged
            const mode = updatedFields.modeOfPayment ?? match.modeOfPayment
            const ctrlVal = updatedFields.controlNumber ?? match.controlNumber ?? ''

            const hasPayment = (mode && (mode === 'FREE' || mode === 'FREE INSTALL' || (charges !== undefined && charges > 0)))

            if (hasPayment) {
              autoCompletedCount++
              updatesList.push({
                ticket: match,
                updatedFields: { ...updatedFields, status: 'COMPLETED' },
                originalTicket: match,
                rowIdx: r + 1,
              })
            } else {
              needsConfirmationList.push({
                ticket: match,
                value: val(colMap.update) || 'Installed',
                amount: charges ? String(charges) : '',
                modeOfPayment: mode || 'CASH',
                controlNumber: ctrlVal,
                rowIdx: r + 1,
              })
            }
          } else {
            updatesList.push({
              ticket: match,
              updatedFields,
              originalTicket: match,
              rowIdx: r + 1,
            })
          }

        } else {
          const rawCharges = val(colMap.charges)
          let chargesNum: number | undefined = undefined
          if (rawCharges) {
            const numeric = parseFloat(rawCharges.replace(/[₱phpPHP,\s]/g, ''))
            if (!isNaN(numeric)) {
              chargesNum = numeric
            }
          }
          unmatchedList.push({
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
            charges: chargesNum,
            paymentMode: val(colMap.paymentMode),
            controlNo: val(colMap.controlNo),
            rowIdx: r + 1,
          })
        }
      }

      setImportResults({
        isOpen: true,
        fileName: file.name,
        rowRangeLabel: rowRangeLabel,
        totalRows: parsedRowCount,
        matchedCount,
        unmatchedCount: unmatchedList.length,
        autoCompletedCount,
        updates: updatesList,
        needsConfirmation: needsConfirmationList,
        unmatched: unmatchedList,
      })

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

  const handleApplyImport = async () => {
    if (!importResults) return
    setSaving(true)
    let successCount = 0
    let completeCount = 0
    let failCount = 0
    let createdCount = 0

    const tokenVal = token()
    const todayStr = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

    const targetBranch = (globalBranchId || user?.branchId || '').replace(/-(sales|services)$/i, '')

    const normalUpdates = importResults.updates.filter(item => item.updatedFields.status !== 'COMPLETED')
    const completedUpdates = importResults.updates.filter(item => item.updatedFields.status === 'COMPLETED')

    for (const item of normalUpdates) {
      const { ticket, updatedFields } = item
      if (Object.keys(updatedFields).length === 0) continue

      const body: Record<string, any> = { ...updatedFields }
      if (updatedFields.location) {
        body.acDetails = mergeAcMeta(ticket, { destination: updatedFields.location, address: updatedFields.location })
      }
      if (updatedFields.district) {
        body.acDetails = mergeAcMeta(ticket, { district: updatedFields.district })
      }
      if (updatedFields.unitType) {
        body.acDetails = mergeAcMeta(ticket, { brand: updatedFields.unitType, unitType: updatedFields.unitType })
      }
      if (updatedFields.sourceVendor) {
        body.acDetails = mergeAcMeta(ticket, { dealer: updatedFields.sourceVendor, dlr: updatedFields.sourceVendor })
      }
      if (updatedFields.remarksUpdate) {
        body.acDetails = mergeAcMeta(ticket, { update: updatedFields.remarksUpdate, remarksUpdate: updatedFields.remarksUpdate })
      }

      try {
        const res = await fetch(`${API_URL}/tickets/${ticket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    for (const item of completedUpdates) {
      const { ticket, updatedFields } = item
      const custName = getF(ticket, 'customerName', 'customer_name') || ticket.title
      const charges = updatedFields.installationCharges ?? ticket.installationCharges ?? ticket.amountCharged ?? 0
      const mode = updatedFields.modeOfPayment ?? ticket.modeOfPayment ?? 'CASH'
      const remarks = (updatedFields.remarksUpdate ?? ticket.remarks) || 'Installed'
      const controlNo = updatedFields.controlNumber ?? ticket.controlNumber ?? ''

      const serviceReportPayload = {
        branchId: (ticket.branchId || localStorage.getItem('ashcol-global-branch-id') || '').replace(/-(sales|services)$/i, ''),
        reportDate: todayStr,
        customerName: custName,
        customerAddress: formatAddress(updatedFields.location ? updatedFields.location : ticket.location),
        customerPhone: getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
        district: parseDistrict(updatedFields.location ? updatedFields.location : ticket.location, updatedFields.district || ticket.district),
        serviceType: mode === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
        statusCode: 'I',
        commitTerms: getF(ticket, 'commitTerms', 'description') || ticket.description || '',
        dealer: updatedFields.sourceVendor || getF(ticket, 'dealer'),
        unitBrandModel: updatedFields.unitType || parseBrand(ticket),
        technicianName: updatedFields.installerName || getF(ticket, 'assignedEmployeeName', 'assigned_employee_name'),
        amountCharged: parseFloat(String(charges)) || 0,
        paymentStatus: mode,
        jobStatus: 'COMPLETED',
        remarks: remarks,
        note: updatedFields.note || ticket.note || '',
        controlNumber: controlNo,
        serviceColumn: updatedFields.serviceVehicle || ticket.serviceVehicle || ticket.service_vehicle || ''
      }

      try {
        const reportRes = await fetch(`${API_URL}/v1/service-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
          body: JSON.stringify(serviceReportPayload)
        })
        if (!reportRes.ok) throw new Error('Report save failed')

        const deleteRes = await fetch(`${API_URL}/tickets/${ticket.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenVal}` }
        })
        if (deleteRes.ok) {
          completeCount++
        } else {
          failCount++
        }
      } catch (err) {
        console.error('Error completing ticket:', err)
        failCount++
      }
    }

    for (const item of importResults.needsConfirmation) {
      const { ticket, value, amount, modeOfPayment, controlNumber } = item
      const custName = getF(ticket, 'customerName', 'customer_name') || ticket.title

      const serviceReportPayload = {
        branchId: (ticket.branchId || localStorage.getItem('ashcol-global-branch-id') || '').replace(/-(sales|services)$/i, ''),
        reportDate: todayStr,
        customerName: custName,
        customerAddress: formatAddress(ticket.location),
        customerPhone: getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
        district: parseDistrict(ticket.location, ticket.district),
        serviceType: modeOfPayment === 'FREE INSTALL' ? 'FREE_INSTALLATION' : 'INSTALLATION',
        statusCode: 'I',
        commitTerms: getF(ticket, 'commitTerms', 'description') || ticket.description || '',
        dealer: getF(ticket, 'dealer'),
        unitBrandModel: parseBrand(ticket),
        technicianName: getF(ticket, 'assignedEmployeeName', 'assigned_employee_name'),
        amountCharged: parseFloat(amount) || 0,
        paymentStatus: modeOfPayment,
        jobStatus: 'COMPLETED',
        remarks: value || 'Installed',
        note: ticket.note || '',
        controlNumber: controlNumber
      }

      try {
        const reportRes = await fetch(`${API_URL}/v1/service-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
          body: JSON.stringify(serviceReportPayload)
        })
        if (!reportRes.ok) throw new Error('Report save failed')

        const deleteRes = await fetch(`${API_URL}/tickets/${ticket.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenVal}` }
        })
        if (deleteRes.ok) {
          completeCount++
        } else {
          failCount++
        }
      } catch (err) {
        console.error('Error completing ticket:', err)
        failCount++
      }
    }

    // Save unmatched rows as new tickets (or complete them directly if marked completed/installed)
    for (const item of importResults.unmatched) {
      const isComplete = (item.status && item.status.toUpperCase() === 'COMPLETED') ||
                         (item.update && item.update.toLowerCase().includes('installed'))

      if (isComplete) {
        const charges = item.charges ?? 0
        const mode = item.paymentMode || 'CASH'
        const remarks = item.update || 'Installed'
        const controlNo = item.controlNo || ''

        const serviceReportPayload = {
          branchId: targetBranch,
          reportDate: todayStr,
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
          serviceColumn: item.service || ''
        }

        try {
          const reportRes = await fetch(`${API_URL}/v1/service-reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVal}` },
            body: JSON.stringify(serviceReportPayload)
          })
          if (reportRes.ok) {
            completeCount++
          } else {
            failCount++
          }
        } catch (err) {
          console.error('Error completing unmatched ticket:', err)
          failCount++
        }
      } else {
        const body: Record<string, any> = {
          title: `${item.service || 'S/I'} service`,
          description: item.note || item.update || 'Excel imported ticket',
          customerName: item.name,
          serviceType: item.service || 'S/I',
          unitType: item.brand || 'Split AC',
          contactPhone: item.phone,
          location: typeof item.location === 'object' ? JSON.stringify(item.location) : item.location,
          sourceVendor: item.dlr || 'Direct',
          priorityTag: '',
          district: item.district,
          commitType: item.commit,
          installerName: item.installer,
          assignedEmployeeName: item.installer,
          serviceVehicle: item.service,
          remarksUpdate: item.update,
          remarks: item.update,
          installationCharges: item.charges,
          modeOfPayment: item.paymentMode,
          controlNumber: item.controlNo,
          branchId: targetBranch,
          status: (item.status && STATUS_OPTS.includes(item.status.toUpperCase())) ? item.status.toUpperCase() : 'PENDING'
        }

        if (!body.status || body.status === 'PENDING') {
          if (body.installerName) {
            body.status = 'ASSIGNED'
          }
        }

        try {
          const res = await fetch(`${API_URL}/tickets`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tokenVal}`
            },
            body: JSON.stringify(body)
          })
          if (res.ok) {
            createdCount++
          } else {
            failCount++
          }
        } catch (err) {
          console.error('Failed to create unmatched ticket:', err)
          failCount++
        }
      }
    }

    setSaving(false)
    setImportResults(null)
    showToast(`Updated ${successCount} tickets, Completed & Paid ${completeCount} tickets, Created ${createdCount} new tickets!${failCount > 0 ? ` (Failed: ${failCount})` : ''}`)
    fetchTickets()
  }

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
    if (isAdmin && globalBranchId && globalBranchId !== 'ALL_BRANCHES') {
      list = list.filter(t => {
        const b = (t.branchId || t.branch_id || '').toUpperCase()
        if (!b) return true
        const g = (globalBranchId || '').toUpperCase()
        const cleanB = b.replace(/-(SALES|SERVICES)$/, '').replace(/-(SALES|SERVICES)$/, '')
        const cleanG = g.replace(/-(SALES|SERVICES)$/, '').replace(/-(SALES|SERVICES)$/, '')
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
      case 'COMMIT':          return getF(ticket, 'commitType', 'commitTerms', 'description')
      case 'INSTALLER':       return getF(ticket, 'installerName', 'assignedEmployeeName', 'assigned_employee_name')
      case 'NOTE':            return ticket.note || ''
      case 'SERVICE':         return getF(ticket, 'serviceVehicle', 'service_vehicle')
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
        try {
          const length = inputRef.current.value.length
          inputRef.current.setSelectionRange(length, length)
        } catch (e) {
          // Fallback if setSelectionRange is not supported on this input type (e.g., number)
        }
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
      localPatch.commitType = normalized
      body.commitType = normalized
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
      localPatch.serviceVehicle = normalized
      body.serviceVehicle = normalized
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

  const handleClearAllVisible = async () => {
    if (!isAdmin || visible.length === 0) return
    const count = visible.length
    const scope = [
      globalBranchId && globalBranchId !== 'ALL_BRANCHES' ? getBranchDisplayName(globalBranchId) : 'all branches',
      dateFilter ? formatDateTriggerLabel(dateFilter) : 'all dates',
      searchQuery.trim() ? `search "${searchQuery.trim()}"` : '',
    ].filter(Boolean).join(' / ')

    if (!confirm(`Clear all ${count} visible ticket${count === 1 ? '' : 's'} for ${scope}? This cannot be undone.`)) return

    setSaving(true)
    setContextMenu(null)
    try {
      const ids = visible.map(t => t.id)
      const results = await Promise.allSettled(ids.map(id =>
        fetch(`${API_URL}/tickets/${id}`, {
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

  // ── Render cell content ───────────────────────────────────────────────────
  function renderCell(ticket: Ticket, col: (typeof columns)[0], idx?: number) {
    const { label } = col
    const isThisEditing = editingCell?.rowId === ticket.id && editingCell?.col === label
    const isEditable    = EDITABLE_COLS.includes(label)

    // ── EDITING STATE ──
    if (isThisEditing) {
      const inputClass = 'w-full text-xs rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-green-500 font-medium'
      const inputSt    = { backgroundColor: editCellBg, border: `1.5px solid ${green}`, color: textPrimary }

      if (label === 'STATUS') {
        // Click cycles through STATUS_OPTS — no dropdown needed
        const currentIdx = STATUS_OPTS.indexOf(cellValue)
        const nextVal = STATUS_OPTS[(currentIdx + 1) % STATUS_OPTS.length]
        return (
          <span
            className="text-[11px] font-black uppercase inline-block cursor-pointer select-none transition-all hover:opacity-80"
            style={{ color: textPrimary }}
            title={`Click to set: ${nextVal.replace(/_/g, ' ')}`}
            onClick={e => { e.stopPropagation(); setCellValue(nextVal); saveCell(ticket.id, label, nextVal) }}
          >
            {cellValue.replace(/_/g, ' ')}
          </span>
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
      return (
        <span style={{ ...truncStyle, ...editHint, fontWeight: 700 }} title={val}>
          {val ? val.replace(/_/g, ' ') : '—'}
        </span>
      )
    }

    if (label === 'SERVICE') {
      return (
        <span style={{ ...truncStyle, ...editHint, fontWeight: 500 }} title={val}>
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
      const prefix = idx !== undefined ? `${idx + 1}. ` : ''
      return (
        <span style={{ ...truncStyle, fontWeight: 600, ...editHint }} title={`${prefix}${val}`}>{prefix}{val}</span>
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
          <div
               onClick={() => {
                 dateFilterInputRef.current?.showPicker?.()
               }}
               className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-sm cursor-pointer"
               style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
            <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
            {dateFilter && (
              <span className="uppercase tracking-wider text-[9px] font-black opacity-60 border-r pr-1.5" style={{ borderColor: border }}>
                {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short' })}
              </span>
            )}
            <input ref={dateFilterInputRef} type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                   tabIndex={-1}
                   className="date-input-no-indicator absolute opacity-0 pointer-events-none w-0 h-0"
                   aria-label="Ticket date filter" />
            <span className="select-none" style={{ color: textPrimary }}>
              {formatDateTriggerLabel(dateFilter)}
            </span>
            {dateFilter && !isTaguigServices && (
              <button onClick={e => { e.stopPropagation(); setDateFilter('') }} style={{ color: textMuted }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canEdit && (
            <>
              {isTaguigServices && (
                <button
                  type="button"
                  onClick={() => navigate('/tickets/create')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:scale-105 shrink-0"
                  style={{ backgroundColor: green, borderColor: green, color: '#ffffff' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Row</span>
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleClearAllVisible}
                  disabled={visible.length === 0 || saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:scale-105 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.45)', color: '#EF4444' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:scale-105 shrink-0"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                <Upload className="w-3.5 h-3.5" style={{ color: green }} />
                <span>{importing ? 'Importing...' : 'Import Excel'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImport}
              />
            </>
          )}
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
                        <span>
                          {isTaguigServices
                            ? col.label === 'DLR' ? 'ENDORSED BY'
                              : col.label === 'COMMIT' ? 'COMMIT (AMOUNT)'
                              : col.label === 'INSTALLER' ? 'TECHNICIAN'
                              : col.label === 'NOTE' ? 'CONFIRMATION'
                              : col.label === 'UPDATE' ? 'SERVICE STATUS'
                              : col.label
                            : col.label}
                        </span>
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
                            {renderCell(ticket, col, idx)}
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
                {isTaguigServices ? "Edit Service Status" : "Edit Update"}
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
        const serviceType = getF(t, 'serviceType', 'service_type')
        const vehicle = getF(t, 'serviceVehicle', 'service_vehicle')
        const update = t.remarks || ''
        const note = t.note || ''
        const commit = getF(t, 'commitType', 'commitTerms', 'description')
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
                  <Row icon={Wrench}  label="Service Type" val={serviceType} />
                  <Row icon={Wrench}  label="Service Vehicle" val={vehicle} />
                  <Row icon={Wrench}  label="Brand / Unit" val={brand} />
                  <Row icon={Wrench}  label={isTaguigServices ? "Endorsed By" : "Dealer"}     val={dealer} />
                  <Row icon={User}    label={isTaguigServices ? "Technician" : "Installer"}  val={installer} />
                  <Row icon={Clock}   label="Preferred Date" val={preferredDate ? new Date(preferredDate).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''} />
                  
                  {commit && (
                    <div className="py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>{isTaguigServices ? "Commit (Amount)" : "Commit / Description"}</p>
                      <p className="text-xs leading-relaxed" style={{ color: textPrimary }}>{commit}</p>
                    </div>
                  )}
                  {note && (
                    <div className="py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>{isTaguigServices ? "Confirmation" : "Note"}</p>
                      <p className="text-xs leading-relaxed font-semibold" style={{ color: '#EF4444' }}>{note}</p>
                    </div>
                  )}
                  {update && (
                    <div className="py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>{isTaguigServices ? "Service Status" : "Update"}</p>
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
                  Review parsed updates from {importResults.rowRangeLabel} and confirm payment completion before saving.
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
                              <tr key={item.ticket.id} className="hover:bg-slate-500/5">
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
                        <div key={item.ticket.id} className="flex items-start justify-between text-xs py-1 border-b last:border-b-0" style={{ borderColor: border }}>
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
                            <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'SERVICE STATUS' : 'UPDATE'}</th>
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
                                <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.charges !== undefined ? `₱${row.charges}` : '—'}</td>
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
              <button onClick={() => setImportResults(null)}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/5"
                      style={{ borderColor: inputBorder, color: textPrimary }}>
                Cancel
              </button>
              <button onClick={handleApplyImport}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm disabled:opacity-50"
                      style={{ backgroundColor: green }}>
                {saving ? '⏳ Saving updates...' : `Apply & Save All (${importResults.matchedCount} updates, ${importResults.unmatchedCount} new)`}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
