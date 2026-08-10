import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
import {
  CalendarDays, Upload, Plus, Edit3, Trash2,
  X, Search, AlertTriangle, Building2, Eye,
  Scan, Loader2, ClipboardPaste, Save,
  Check, ChevronDown, User,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, resolveScopedBranchId, isPortalAdmin, resolveArchiveWriteBranchId, resolveArchivesBranchFilter, ARCHIVE_UPDATED_EVENT, fetchTicketByNumber, type InstallerBranchIndexEntry, formatBranchName } from '../utils/api'
import { syncMissingTicketArchives } from '../utils/ticketArchive'
import { archivesCacheKey, archivesCacheIsFresh, getInitialArchivesFromCache, readArchivesCache, storedArchivesBranchId, currentArchivesMonthKey, writeArchivesCache } from '../utils/ticketTabCache'
import { resetTicketTableScroll } from '../utils/tabSwitch'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import { TicketDetailsModal } from '../components/tickets/TicketDetailsModal'
import type { Ticket } from '../utils/ticketHelpers'

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string
  branchId: string | null
  ticketId?: string | null
  ticketBranchId?: string | null
  ticketNumber?: string | null
  installerLineupBranchId?: string | null
  branchName: string | null
  reportDate: string | null
  customerName: string | null
  customerAddress: string | null
  customerPhone: string | null
  district: string | null
  serviceType: string | null
  statusCode: string | null
  commitTerms: string | null
  dealer: string | null
  unitBrandModel: string | null
  unitSerial: string | null
  quantity: number | null
  technicianName: string | null
  negotiator: string | null
  scheduleTime: string | null
  scheduleStatus: string | null
  timeStarted: string | null
  timeEnded: string | null
  amountCharged: number | null
  paymentStatus: string | null
  jobStatus: string | null
  remarks: string | null
  note: string | null
  controlNumber: string | null
  serviceColumn: string | null
  papers: string | null
  costing: string | null
  relayStatus: string | null
  fifteenQuestions: string | null
  freeInstallation: boolean | null
  complainRequest: string | null
  scheduledDate?: string | null
  installedDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  inputBy?: string | null
  updatedBy?: string | null
}

const COL_FIELD: Record<string, keyof ServiceRow> = {
  'TICKET NO.':           'ticketNumber',
  'DATE INSTALLED':       'installedDate',
  "CUSTOMER'S NAME":      'customerName',
  'DESTINATION':          'customerAddress',
  'DISTRICT':             'district',
  'CONTACT NO.':          'customerPhone',
  'BRAND':                'unitBrandModel',
  'COMPLAIN/REQUEST':     'complainRequest',
  'DLR':                  'dealer',
  'INSTALLER':            'technicianName',
  'NEGOTIATOR':           'negotiator',
  'NOTE':                 'note',
  'SERVICE':              'serviceColumn',
  'UPDATE':               'remarks',
  'INSTALLATION CHARGES': 'amountCharged',
  'MODE OF PAYMENT':      'paymentStatus',
}

const EDITABLE_COLS = [
  'TICKET NO.', 'DATE INSTALLED', "CUSTOMER'S NAME", 'DESTINATION', 'DISTRICT', 'CONTACT NO.', 'BRAND',
  'COMPLAIN/REQUEST', 'DLR', 'INSTALLER', 'NEGOTIATOR', 'NOTE', 'SERVICE', 'UPDATE',
  'INSTALLATION CHARGES', 'MODE OF PAYMENT',
]

interface BranchOption { id: string; name: string }

const PAYMENT_MODES = ['CASH', 'BANK TRANSFER', 'GCASH', 'CHEQUE', 'PAID', 'UNPAID', 'PARTIAL', 'FREE', 'FREE INSTALL'] as const

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const toDateKey = (raw: string | null | undefined): string => {
  if (!raw) return ''
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const formatDateKeyLabel = (key: string) => {
  if (!key) return ''
  const d = new Date(`${key}T00:00:00`)
  if (isNaN(d.getTime())) return key
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const getInstalledDateKey = (row: ServiceRow) =>
  toDateKey(row.installedDate) || toDateKey(row.reportDate) || ''

function formatCleanName(name: string | null | undefined): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (!trimmed) return ''
  // Strip trailing dash + number/digits e.g. "ALLAN - 2", "ALLAN -2", "SONNYBOY - 1", "RYAN - 2"
  const cleaned = trimmed.replace(/\s*-\s*\d+\s*$/, '').trim()
  return cleaned.toUpperCase()
}

function formatNegotiatorFirstName(name: string | null | undefined): string {
  if (!name) return ''
  const cleaned = formatCleanName(name)
  if (!cleaned) return ''
  const firstName = cleaned.split(/\s+/)[0]
  return firstName.toUpperCase()
}

function serviceRowToTicket(r: ServiceRow): Ticket {
  return {
    id: r.ticketId || r.id,
    ticketNumber: r.ticketNumber || r.controlNumber || r.id,
    title: r.customerName ? `Ticket for ${r.customerName}` : (r.ticketNumber || 'Service Record'),
    description: r.complainRequest || r.remarks || '',
    serviceType: r.serviceType || (r.statusCode === 'I' ? 'Installation' : 'Service'),
    service_type: r.serviceType || (r.statusCode === 'I' ? 'Installation' : 'Service'),
    serviceVehicle: r.serviceColumn || '',
    service_vehicle: r.serviceColumn || '',
    customerName: r.customerName || '',
    customer_name: r.customerName || '',
    contactPhone: r.customerPhone || '',
    customerPhone: r.customerPhone || '',
    contactNumber: r.customerPhone || '',
    location: r.customerAddress ? { address: r.customerAddress, district: r.district } : null,
    acDetails: r.unitBrandModel || '',
    unitType: r.unitBrandModel || '',
    status: r.jobStatus || r.scheduleStatus || 'COMPLETED',
    createdAt: r.createdAt || r.reportDate || undefined,
    preferredDate: r.scheduledDate || r.installedDate || undefined,
    actualCompletion: r.installedDate || r.reportDate || undefined,
    assignedEmployeeName: r.technicianName || '',
    assignedTo: r.technicianName || '',
    negotiatorName: r.negotiator || '',
    negotiator: r.negotiator || '',
    branchId: r.branchId || undefined,
    branchName: r.branchName || undefined,
    remarks: r.remarks || '',
    remarksUpdate: r.remarks || '',
    note: r.note || '',
    costing: r.costing || '',
    amountCharged: r.amountCharged || undefined,
    paymentStatus: r.paymentStatus || '',
    controlNumber: r.controlNumber || '',
    fifteenQuestions: r.fifteenQuestions || '',
  } as unknown as Ticket
}

const formatDateTime = (isoStr: string | null | undefined) => {
  if (!isoStr) return '—'
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr
    return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return isoStr
  }
}


const FormatPhone = ({ raw }: { raw: string | null | undefined }): React.ReactNode => {
  if (!raw) return null

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

  if (finalNumbers.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {finalNumbers.map((num, i) => (
        <span key={i} className="whitespace-nowrap">{num}</span>
      ))}
    </div>
  )
}



// ── Custom Select Component ──────────────────────────────────────────────────

interface CustomSelectOption {
  value: string
  label: string
}

interface CustomSelectProps {
  icon: React.ReactNode
  value: string
  options: CustomSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  title?: string
  minWidth?: string
  inputBg: string
  inputBorder: string
  textPrimary: string
  textMuted: string
  isLight: boolean
}

function CustomSelect({
  icon,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  title,
  minWidth = 'min-w-[210px]',
  inputBg,
  inputBorder,
  textPrimary,
  textMuted,
  isLight,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const selectedOption = options.find(opt => opt.value === value)
  const displayLabel = selectedOption ? selectedOption.label : (options[0]?.label || placeholder)

  const popoverBg = isLight ? '#ffffff' : '#0B132B'
  const popoverBorder = isLight ? '#cbd5e1' : '#1e293b'
  const itemHoverBg = isLight ? '#f1f5f9' : '#172642'
  const activeBg = isLight ? '#e0f2fe' : '#1e3a8a'
  const activeText = isLight ? '#0284c7' : '#60a5fa'

  return (
    <div ref={dropdownRef} className="relative shrink-0 select-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-9 px-3 py-1.5 rounded-lg border text-xs font-bold shrink-0 shadow-sm transition-all hover:border-slate-400 focus:outline-none cursor-pointer"
        style={{
          backgroundColor: inputBg,
          borderColor: isOpen ? (isLight ? '#3b82f6' : '#60a5fa') : inputBorder,
          color: textPrimary
        }}
      >
        <span className="shrink-0" style={{ color: textMuted }}>{icon}</span>
        <span className="truncate max-w-[160px] font-bold text-left tracking-tight uppercase">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: textMuted }}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 top-full mt-1.5 ${minWidth} rounded-xl border shadow-2xl z-[100] p-1.5 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150`}
          style={{
            backgroundColor: popoverBg,
            borderColor: popoverBorder,
          }}
        >
          {title && (
            <div className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 border-b border-slate-200/10 mb-0.5" style={{ color: textMuted }}>
              {title}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1 p-0.5 custom-scrollbar">
            {options.map(opt => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setIsOpen(false)
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? activeBg : 'transparent',
                    color: isSelected ? activeText : textPrimary
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = itemHoverBg
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  <span className="truncate pr-2 uppercase">{opt.label}</span>
                  {isSelected && (
                    <Check className="w-4 h-4 shrink-0" style={{ color: activeText }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const blankRow = (date: string, branchId?: string | null): Partial<ServiceRow> => ({
  reportDate: date,
  branchId: branchId ?? null,
  customerName: '',
  customerAddress: '',
  customerPhone: '',
  district: '',
  serviceType: 'INSTALLATION',
  statusCode: 'I',
  commitTerms: '',
  dealer: '',
  unitBrandModel: '',
  unitSerial: '',
  quantity: 1,
  technicianName: '',
  negotiator: '',
  scheduleTime: '',
  scheduleStatus: '',
  timeStarted: '',
  timeEnded: '',
  amountCharged: 0,
  paymentStatus: 'CASH',
  jobStatus: 'SCHEDULED',
  remarks: '',
  note: '',
  controlNumber: '',
  serviceColumn: '',
  papers: '',
  costing: '',
  relayStatus: '',
  fifteenQuestions: '',
})

export default function DailyServiceReport() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#cbd5e1' : '#2d4266'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'

  const archivesUser = useMemo(
    () => ({ role: user?.role, branchId: user?.branchId }),
    [user?.role, user?.branchId],
  )
  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  const isManager = role === 'manager'
  const isAllBranchUser = isAdmin || isManager
  const isBranchScoped = role === 'staff' || role === 'employee' || role === 'oic'
  const canImport = isAllBranchUser || isBranchScoped
  const canDelete = isAdmin || isManager
  const canEdit = isAdmin || isManager || role === 'staff' || role === 'employee' || role === 'oic'

  const initialArchives = (() => {
    const branch = storedArchivesBranchId()
    const month = currentArchivesMonthKey()
    return getInitialArchivesFromCache(branch, month)
  })()

  const [rows, setRows] = useState<ServiceRow[]>(() => initialArchives.rows as ServiceRow[])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(() => !initialArchives.hasCache)
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [monthFilter, setMonthFilter] = useState(() => currentArchivesMonthKey())
  const [viewMode] = useState<'daily' | 'weekly'>('daily')
  const [branchFilter, setBranchFilter] = useState<string>(() => storedArchivesBranchId())
  const [negoFilter, setNegoFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // ── Month popover (custom, replaces the native <select> that overflowed on mobile) ──
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const monthPickerRef = useRef<HTMLButtonElement>(null)
  const monthPickerPopRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!monthPickerOpen) return
    const closeIfOutside = (target: EventTarget | null) => {
      if (monthPickerPopRef.current && monthPickerPopRef.current.contains(target as Node)) return
      if (monthPickerRef.current && monthPickerRef.current.contains(target as Node)) return
      setMonthPickerOpen(false)
    }
    const handleMouseDown = (e: MouseEvent) => closeIfOutside(e.target)
    const handleScroll = () => setMonthPickerOpen(false)
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [monthPickerOpen])

  const negotiatorOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => {
      const name = formatNegotiatorFirstName(r.negotiator)
      if (name) set.add(name)
    })
    return Array.from(set).sort()
  }, [rows])
  const [installerSuggestions, setInstallerSuggestions] = useState<string[]>([])
  const [negotiatorSuggestions, setNegotiatorSuggestions] = useState<string[]>([])
  const [installerLineupIndex, setInstallerLineupIndex] = useState<InstallerBranchIndexEntry[]>([])
  const [driverOnlyNames, setDriverOnlyNames] = useState<string[]>([])
  const lineupIndexRef = useRef<InstallerBranchIndexEntry[]>([])
  const driverOnlyRef = useRef<string[]>([])
  const syncedTicketIdsRef = useRef<Set<string>>(new Set())
  const fetchSeqRef = useRef(0)
  const hasLoadedOnceRef = useRef(initialArchives.hasCache)
  const archivesLoadKeyRef = useRef('')
  const lineupResyncedRef = useRef(false)
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({})

  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)

  const handleViewDetailsPopup = useCallback(async (row: ServiceRow) => {
    setContextMenu(null)
    const baseTicket = serviceRowToTicket(row)
    setDetailTicket(baseTicket)

    if (row.ticketNumber && row.ticketNumber.trim()) {
      try {
        const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const fetched = await fetchTicketByNumber(tokenStr, row.ticketNumber.trim())
        if (fetched && typeof fetched === 'object' && (fetched as any).id) {
          setDetailTicket(prev => prev ? { ...prev, ...(fetched as Ticket) } : (fetched as Ticket))
        }
      } catch (e) {
        console.error('Error fetching direct ticket details for popup:', e)
      }
    }
  }, [])

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: ServiceRow } | null>(null)

  // Inline editing states
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null)
  const [cellValue, setCellValue] = useState<string>('')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)


  const handleAddRow = () => {
    if (!canEdit) return
    let realBranchId = resolveScopedBranchId(
      resolveArchivesBranchFilter(branchFilter, branches, user),
    ) || null
    if (!realBranchId) {
      realBranchId = resolveScopedBranchId(branches[0]?.id) || null
    }
    const tempId = `temp-${Date.now()}`
    const newRow = blankRow(todayLocal(), isBranchScoped ? (user?.branchId ?? null) : realBranchId) as ServiceRow
    newRow.id = tempId
    setRows(prev => [newRow, ...prev])
  }

  // Escape hatch for the trailing "X" column on both the desktop table and
  // mobile cards. An unsaved blank row (id still `temp-...`, same convention
  // saveCell already uses to detect an in-progress add) is just dropped from
  // local state — it was never persisted, so there's nothing to delete on the
  // server. A real, saved row goes through the existing confirm+DELETE flow.
  const handleRemoveRow = (id: string) => {
    if (id.startsWith('temp-')) {
      setRows(prev => prev.filter(r => r.id !== id))
      return
    }
    const row = rows.find(r => r.id === id)
    if (row) handleDelete(row)
  }

  // "+ Add the first one" — appends a blank, unsaved row (temp- id) scoped to
  // the currently selected branch/month so it's immediately editable inline;
  // handleRemoveRow cancels it if the user backs out before saving.
  const handleAddRow = () => {
    const realBranchId = resolveScopedBranchId(
      resolveArchivesBranchFilter(branchFilter, branches, user),
    ) || resolveScopedBranchId(branches[0]?.id) || null
    const blankRow: ServiceRow = {
      id: `temp-${Date.now()}`,
      branchId: realBranchId,
      branchName: null,
      reportDate: todayLocal(),
      customerName: '',
      customerAddress: '',
      customerPhone: '',
      district: '',
      serviceType: '',
      statusCode: 'I',
      commitTerms: '',
      dealer: '',
      unitBrandModel: '',
      unitSerial: '',
      quantity: 1,
      technicianName: '',
      negotiator: '',
      scheduleTime: '',
      scheduleStatus: '',
      timeStarted: '',
      timeEnded: '',
      amountCharged: 0,
      paymentStatus: 'CASH',
      jobStatus: 'SCHEDULED',
      remarks: '',
      note: '',
      controlNumber: '',
      serviceColumn: '',
      papers: '',
      costing: '',
      relayStatus: '',
      fifteenQuestions: '',
      freeInstallation: false,
      complainRequest: '',
    }
    setRows(prev => [blankRow, ...prev])
  }

  // Pending Excel import waiting for an all-branch user to choose a target branch
  const [pendingImport, setPendingImport] = useState<{ file: File; branchId: string; detectedDate: string | null } | null>(null)

  // AI Image Scanning States
  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scannedRows, setScannedRows] = useState<ServiceRow[]>([])
  const [scanError, setScanError] = useState('')
  const [savingScanned, setSavingScanned] = useState(false)
  const [scanSuccess, setScanSuccess] = useState(false)
  const scanFileRef = useRef<HTMLInputElement>(null)

  // ── AI Scanner Functions ──────────────────────────────────────────────────
  const processScanImage = async (file: File) => {
    const url = URL.createObjectURL(file)
    setScanPreview(url)
    setScanning(true)
    setScanError('')
    setScannedRows([])

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const formData = new FormData()
      formData.append('image', file)
      
      const targetBranchId = resolveScopedBranchId(
        resolveArchivesBranchFilter(branchFilter, branches, user),
      )
      if (targetBranchId) {
        formData.append('branchId', targetBranchId)
      }

      const res = await fetch(`${API_BASE_URL}/v1/service-reports/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) throw new Error(`Scan failed (HTTP ${res.status})`)

      const data = await res.json()
      if (data.error) {
        setScanError(`Scan failed: ${data.error}`)
        return
      }

      if (data.rows && Array.isArray(data.rows)) {
        const mapped = data.rows.map((row: any, index: number) => {
          let realBranchId = resolveScopedBranchId(
            resolveArchivesBranchFilter(branchFilter, branches, user),
          ) || resolveScopedBranchId(branches[0]?.id) || null
          return {
            id: `scan-temp-${index}-${Date.now()}`,
            branchId: realBranchId,
            reportDate: todayLocal(),
            customerName: row.customerName || '',
            customerAddress: row.customerAddress || '',
            customerPhone: row.customerPhone || '',
            district: row.district || '',
            statusCode: row.statusCode || 'I',
            commitTerms: row.commitTerms || '',
            dealer: row.dealer || '',
            unitBrandModel: row.unitBrandModel || '',
            unitSerial: row.unitSerial || '',
            quantity: row.quantity || 1,
            technicianName: row.technicianName || '',
            negotiator: row.negotiator || '',
            scheduleTime: row.scheduleTime || '',
            scheduleStatus: row.scheduleStatus || '',
            timeStarted: row.timeStarted || '',
            timeEnded: row.timeEnded || '',
            amountCharged: row.amountCharged || 0,
            paymentStatus: row.paymentStatus || 'CASH',
            // Auto-complete: charged amount > 0 or free installation = COMPLETED
            jobStatus: (row.amountCharged > 0 || row.freeInstallation) ? 'COMPLETED' : (row.jobStatus || 'SCHEDULED'),
            remarks: row.remarks || '',
            note: row.note || '',
            controlNumber: row.controlNumber || '',
            serviceColumn: row.serviceColumn || '',
            complainRequest: row.complainRequest || '',
            freeInstallation: row.freeInstallation || false,
          } as ServiceRow
        })
        setScannedRows(mapped)
      } else {
        setScanError('No rows were detected in the image table.')
      }
    } catch (err: any) {
      console.error('Scan error', err)
      setScanError(`Could not scan image: ${err.message || 'Unknown error'}`)
    } finally {
      setScanning(false)
      if (scanFileRef.current) scanFileRef.current.value = ''
    }
  }

  const handleScanImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processScanImage(file)
  }

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (!scanModalOpen || scanning) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            const file = new File([blob], 'pasted-service-report.png', { type: item.type })
            void processScanImage(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [scanModalOpen, scanning, branchFilter])

  const handlePasteImageClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (scanning) return

    if (!navigator.clipboard || !navigator.clipboard.read) {
      setScanError('Clipboard button is disabled on HTTP. Please press Ctrl+V to paste the image.')
      return
    }

    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageTypes = item.types.filter(t => t.startsWith('image/'))
        if (imageTypes.length > 0) {
          const blob = await item.getType(imageTypes[0])
          const file = new File([blob], 'pasted-service-report.png', { type: imageTypes[0] })
          await processScanImage(file)
          return
        }
      }
      setScanError('No image found in clipboard.')
    } catch {
      setScanError('Could not read clipboard. Please check permissions.')
    }
  }

  const handleSaveScannedRows = async () => {
    if (scannedRows.length === 0) return
    setSavingScanned(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      
      const payload = scannedRows.map(r => ({
        ...r,
        id: undefined,
        branchId: resolveArchiveWriteBranchId(r.branchId) || null
      }))

      const res = await fetch(`${API_BASE_URL}/v1/service-reports/bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error(`Bulk save failed (HTTP ${res.status})`)

      setScanSuccess(true)
      fetchRows({ soft: true, force: true })
    } catch (e: any) {
      alert(`Could not save scanned rows: ${e?.message || 'Unknown error'}`)
    } finally {
      setSavingScanned(false)
    }
  }

  const handleUpdateScannedRowField = (rowId: string, field: keyof ServiceRow, value: any) => {
    setScannedRows(prev => prev.map(r => {
      if (r.id !== rowId) return r
      const updated = { ...r, [field]: value }
      if (field === 'amountCharged') {
        updated.amountCharged = parseFloat(value) || 0
      }
      return updated
    }))
  }

  const handleDeleteScannedRow = (rowId: string) => {
    setScannedRows(prev => prev.filter(r => r.id !== rowId))
  }

  // Column configuration for expand / collapse functionality
  const [expandedCols] = useState<Record<string, boolean>>({})

  const columns = useMemo(() => {
    const isServices = branchFilter && (branchFilter.toLowerCase().includes('service') || branchFilter.toLowerCase().includes('services'))
    const rawCols = [
      { label: 'TICKET NO.',            display: "TICKET NO.",                                                      weight: 11, expMul: 1.3, sticky: true,  freeze: false, align: 'center' },
      { label: "CUSTOMER'S NAME",       display: "CUSTOMER NAME",                                                   weight: 18, expMul: 1.5, sticky: true,  freeze: false, align: 'left' },
      { label: 'DISTRICT',              display: "DISTRICT",                                                        weight: 12, expMul: 1.4, sticky: true,  freeze: true,  align: 'center' },
      { label: 'BRAND',                 display: "BRAND",                                                           weight: 12, expMul: 1.4, sticky: false, freeze: false, align: 'center' },
      ...(isServices ? [{ label: 'COMPLAIN/REQUEST', display: "COMPLAINT / REQUEST", weight: 12, expMul: 1.4, sticky: false, freeze: false, align: 'center' }] : []),
      { label: 'DLR',                   display: "DEALER",                                                          weight: 11, expMul: 1.3, sticky: false, freeze: false, align: 'center' },
      { label: 'INSTALLER',             display: "INSTALLER",                                                       weight: 12, expMul: 1.3, sticky: false, freeze: false, align: 'center' },
      { label: 'NEGOTIATOR',            display: "NEGOTIATOR",                                                      weight: 12, expMul: 1.3, sticky: false, freeze: false, align: 'center' },
      { label: 'UPDATE',                display: "REMARKS",                                                         weight: 15, expMul: 1.5, sticky: false, freeze: false, align: 'center' },
      { label: 'INSTALLATION CHARGES',  display: "CHARGES",                                                         weight: 12, expMul: 1.3, sticky: false, freeze: false, align: 'right' },
      { label: 'DATE INSTALLED',        display: "COMPLETED",                                                      weight: 10, expMul: 1.3, sticky: false, freeze: false, align: 'center' },
    ]

    const weights = rawCols.map(c => c.weight * (expandedCols[c.label] ? c.expMul : 1))
    const totalWeight = weights.reduce((s, w) => s + w, 0)
    let accumulatedLeft = 0
    return rawCols.map((col, idx) => {
      const isExpanded = !!expandedCols[col.label]
      const pct = `${((weights[idx] / totalWeight) * 100).toFixed(2)}%`
      const leftVal = col.sticky ? accumulatedLeft : 0
      if (col.sticky) accumulatedLeft += (col.weight / totalWeight) * 100
      return { ...col, isExpanded, w: pct, left: leftVal }
    })
  }, [expandedCols, branchFilter])

  // ── Week helpers ──────────────────────────────────────────────────────────
  const weekRange = useMemo(() => {
    const d = new Date(todayLocal() + 'T00:00:00')
    const dow = d.getDay()
    const offsetToMonday = dow === 0 ? -6 : 1 - dow
    const monday = new Date(d); monday.setDate(d.getDate() + offsetToMonday)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    const pretty = (x: Date) => x.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return { label: `${pretty(monday)} – ${pretty(sunday)}, ${sunday.getFullYear()}` }
  }, [])

  // ── Data loaders ──────────────────────────────────────────────────────────
  const fetchBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list = ((data?.data || data || []) as { id: string; name: string }[])
      const hasExplicitTaguigSales = list.some(b => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SALES-EXPLICIT' || (name.includes('TAGUIG') && name.includes('SALES') && id !== 'BR-TAGUIG-SALES')
      })
      const newList: BranchOption[] = []
      for (const b of list) {
        const idUpper = b.id.toUpperCase()
        const cleanName = b.name.replace(/^(ashcol\s+)/i, '')
        const cleanNameUpper = cleanName.toUpperCase()
        if (idUpper === 'BR-TAGUIG-SALES' || idUpper === '2880C29E-581C-11F1-BF8C-74D4DD6DFC0B') {
          newList.push({ id: b.id, name: 'TAGUIG - SALES' })
        } else if (idUpper === 'BR-TAGUIG-SERVICES' || idUpper === '2880C29E-581C-11F1-BF8C-74D4DD6DFC0B-SERVICES') {
          newList.push({ id: b.id, name: 'TAGUIG - SERVICES' })
        } else if (cleanNameUpper === 'TAGUIG' || cleanNameUpper === 'ASHCOL TAGUIG') {
          if (!hasExplicitTaguigSales) newList.push({ id: b.id, name: 'TAGUIG - SALES' })
        } else if (cleanNameUpper.includes('TAGUIG')) {
          const isServ = cleanNameUpper.includes('SERVICE')
          newList.push({
            id: b.id,
            name: isServ ? 'TAGUIG - SERVICES' : 'TAGUIG - SALES'
          })
        } else {
          newList.push({ id: b.id, name: cleanName })
        }
      }
      newList.sort((a, b) => a.name.localeCompare(b.name))

      let finalList = newList
      if (isAdmin) {
        // Archives is always branch-specific — no combined "All Branches" view.
        finalList = newList
      } else if (isBranchScoped && user?.branchId) {
        const userBranchLower = user.branchId.toLowerCase()
        const isUserTaguig = userBranchLower.includes('taguig') || userBranchLower.startsWith('2880c29e-581c-11f1-bf8c-74d4dd6dfc0b')
        finalList = newList.filter(b => {
          if (isUserTaguig) {
            const emailLower = (user?.email || '').toLowerCase()
            const isServicesUser = userBranchLower.includes('service') || emailLower.includes('service')
            const bNameUpper = b.name.toUpperCase()
            if (isServicesUser) {
              return bNameUpper.includes('SERVICE') || bNameUpper.includes('SERVICES')
            } else {
              return bNameUpper.includes('SALES')
            }
          } else {
            const userBranchIdUpper = user.branchId!.toUpperCase()
            const bIdUpper = b.id.toUpperCase()
            return bIdUpper === userBranchIdUpper || 
                   bIdUpper.startsWith(userBranchIdUpper + '-') || 
                   userBranchIdUpper.startsWith(bIdUpper + '-')
          }
        })
      }
      setBranches(finalList)
    } catch (e) { console.error(e) }
  }, [isBranchScoped, user?.branchId, user?.email, isAdmin])

  useEffect(() => {
    if (branches.length === 0) return
    const resolved = resolveArchivesBranchFilter(branchFilter, branches, user)
    if (resolved && resolved !== branchFilter) {
      setBranchFilter(resolved)
    }
  }, [branches, user, branchFilter])

  useEffect(() => {
    if (!isAdmin) return
    const syncFromGlobal = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      const resolved = resolveArchivesBranchFilter(gId, branches, user)
      if (resolved && resolved !== branchFilter) setBranchFilter(resolved)
    }
    syncFromGlobal()
    window.addEventListener('ashcol-global-branch-change', syncFromGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncFromGlobal)
  }, [isAdmin, branches, user, branchFilter])

  const mergeArchiveRows = useCallback((primary: ServiceRow[], extra: ServiceRow[]) => {
    const byId = new Map<string, ServiceRow>()
    const byTicketId = new Map<string, ServiceRow>()
    for (const row of primary) {
      byId.set(row.id, row)
      if (row.ticketId) byTicketId.set(row.ticketId, row)
    }
    for (const row of extra) {
      if (row.ticketId && byTicketId.has(row.ticketId)) continue
      if (!byId.has(row.id)) byId.set(row.id, row)
      if (row.ticketId) byTicketId.set(row.ticketId, row)
    }
    return Array.from(byId.values())
  }, [])

  const applyArchivesScope = useCallback((branchId: string, month: string) => {
    const cached = readArchivesCache(branchId, month)
    if (Array.isArray(cached?.rows) && cached.rows.length > 0) {
      setRows(cached.rows as ServiceRow[])
      setLoading(false)
    } else {
      setRows([])
      setLoading(true)
    }
    resetTicketTableScroll()
  }, [])

  const handleMonthFilterChange = useCallback((month: string) => {
    setMonthFilter(month)
    const effectiveBranch = resolveArchivesBranchFilter(branchFilter, branches, archivesUser)
    if (effectiveBranch) applyArchivesScope(effectiveBranch, month)
  }, [branchFilter, branches, archivesUser, applyArchivesScope])

  const handleBranchFilterChange = useCallback((branch: string) => {
    setBranchFilter(branch)
    applyArchivesScope(branch, monthFilter)
  }, [monthFilter, applyArchivesScope])

  useLayoutEffect(() => {
    if (branches.length === 0) return
    const effectiveBranch = resolveArchivesBranchFilter(branchFilter, branches, archivesUser)
    if (!effectiveBranch) {
      setRows([])
      return
    }
    applyArchivesScope(effectiveBranch, monthFilter)
  }, [monthFilter, branchFilter, branches, archivesUser, applyArchivesScope])

  const runArchiveBackfill = useCallback(async (
    loaded: ServiceRow[],
    effectiveBranch: string,
    syncMonth: string | null,
    seq: number,
  ) => {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    if (!canEdit || !token) return

    try {
      const created = await syncMissingTicketArchives(
        token,
        effectiveBranch,
        syncMonth,
        loaded,
        lineupIndexRef.current,
        driverOnlyRef.current,
        syncedTicketIdsRef.current,
      )
      if (seq !== fetchSeqRef.current) return
      if (created.length === 0) return

      setRows((prev) => {
        const merged = mergeArchiveRows(prev, created as unknown as ServiceRow[])
        writeArchivesCache(effectiveBranch, monthFilter, merged)
        return merged
      })
    } catch (e) {
      console.warn('[archives] backfill failed', e)
    }
  }, [canEdit, monthFilter, mergeArchiveRows])

  const fetchRows = useCallback(async (options?: { soft?: boolean; force?: boolean; backfill?: boolean }) => {
    if (branches.length === 0) {
      if (!hasLoadedOnceRef.current) setLoading(true)
      return
    }

    const effectiveBranch = resolveArchivesBranchFilter(branchFilter, branches, archivesUser)
    if (!effectiveBranch) {
      setRows([])
      setLoading(false)
      setRefreshing(false)
      hasLoadedOnceRef.current = true
      return
    }

    const cached = readArchivesCache(effectiveBranch, monthFilter)
    const hasCache = Array.isArray(cached?.rows) && cached.rows.length > 0
    const cacheIsFresh = archivesCacheIsFresh(effectiveBranch, monthFilter)

    const seq = ++fetchSeqRef.current

    if (hasCache) {
      setRows(cached!.rows as ServiceRow[])
      hasLoadedOnceRef.current = true
    }

    if (cacheIsFresh && options?.soft && !options?.force) {
      setLoading(false)
      setRefreshing(false)
      void (async () => {
        try {
          const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
          const params = new URLSearchParams()
          if (monthFilter?.trim()) params.set('month', monthFilter.trim())
          params.set('branchId', effectiveBranch)
          const res = await fetch(`${API_BASE_URL}/v1/service-reports?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (seq !== fetchSeqRef.current) return
          if (!res.ok) return
          const data = await res.json()
          const loaded = Array.isArray(data) ? data as ServiceRow[] : []
          setRows(loaded)
          writeArchivesCache(effectiveBranch, monthFilter, loaded)
          if (options?.backfill) {
            void runArchiveBackfill(loaded, effectiveBranch, monthFilter?.trim() || null, seq)
          }
        } catch {
          // keep cached rows on background refresh failure
        }
      })()
      return
    }

    const showSkeleton = !hasCache && !hasLoadedOnceRef.current
    if (showSkeleton) setLoading(true)
    else setRefreshing(true)

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams()
      if (monthFilter?.trim()) params.set('month', monthFilter.trim())
      params.set('branchId', effectiveBranch)

      const res = await fetch(`${API_BASE_URL}/v1/service-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (seq !== fetchSeqRef.current) return

      let loaded: ServiceRow[] = []
      if (res.ok) {
        const data = await res.json()
        loaded = Array.isArray(data) ? data as ServiceRow[] : []
      } else {
        console.error('[archives] service-reports fetch failed', res.status)
        if (!hasCache) setRows([])
      }

      setRows(loaded)
      writeArchivesCache(effectiveBranch, monthFilter, loaded)
      hasLoadedOnceRef.current = true

      if (options?.backfill) {
        void runArchiveBackfill(loaded, effectiveBranch, monthFilter?.trim() || null, seq)
      }
    } catch (e) {
      console.error('[archives] fetch error', e)
      if (!hasCache) setRows([])
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [monthFilter, branchFilter, branches, archivesUser, runArchiveBackfill])

  useEffect(() => { fetchBranches() }, [fetchBranches])

  useEffect(() => {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    fetch(`${API_BASE_URL}/v1/lineup/installer-branch-index`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        const next = Array.isArray(list) ? list : []
        lineupIndexRef.current = next
        setInstallerLineupIndex(next)
      })
      .catch(() => {
        lineupIndexRef.current = []
        setInstallerLineupIndex([])
      })
    fetch(`${API_BASE_URL}/v1/lineup/driver-only-names`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        const next = Array.isArray(list) ? list : []
        driverOnlyRef.current = next
        setDriverOnlyNames(next)
      })
      .catch(() => {
        driverOnlyRef.current = []
        setDriverOnlyNames([])
      })
  }, [])

  useEffect(() => {
    const effectiveBranch = resolveArchivesBranchFilter(branchFilter, branches, archivesUser)
    const loadKey = `${monthFilter}|${effectiveBranch}`
    const cacheKey = effectiveBranch ? archivesCacheKey(effectiveBranch, monthFilter) : ''
    const cached = cacheKey ? readArchivesCache(effectiveBranch!, monthFilter) : null
    const hasCache = Array.isArray(cached?.rows) && cached.rows.length > 0

    if (archivesLoadKeyRef.current !== loadKey) {
      archivesLoadKeyRef.current = loadKey
      syncedTicketIdsRef.current = new Set()
      lineupResyncedRef.current = false
      if (hasCache) {
        setRows(cached!.rows as ServiceRow[])
        setLoading(false)
        hasLoadedOnceRef.current = true
      } else {
        hasLoadedOnceRef.current = false
      }
    }
    void fetchRows({ soft: hasCache, backfill: !hasCache })
  }, [fetchRows, monthFilter, branchFilter, branches, archivesUser])

  useEffect(() => {
    if (lineupResyncedRef.current || !hasLoadedOnceRef.current) return
    if (installerLineupIndex.length === 0 && driverOnlyNames.length === 0) return
    lineupResyncedRef.current = true
    const effectiveBranch = resolveArchivesBranchFilter(branchFilter, branches, archivesUser)
    if (!effectiveBranch) return
    void runArchiveBackfill(rows, effectiveBranch, monthFilter?.trim() || null, fetchSeqRef.current)
  }, [installerLineupIndex, driverOnlyNames, rows, branchFilter, branches, archivesUser, monthFilter, runArchiveBackfill])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onArchiveUpdated = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        syncedTicketIdsRef.current = new Set()
        void fetchRows({ soft: true, force: true, backfill: true })
      }, 400)
    }
    window.addEventListener(ARCHIVE_UPDATED_EVENT, onArchiveUpdated)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener(ARCHIVE_UPDATED_EVENT, onArchiveUpdated)
    }
  }, [fetchRows])

  const fetchInstallerSuggestions = useCallback(async (bId: string) => {
    if (!bId) {
      setInstallerSuggestions([])
      return
    }
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${token}` }
      const cleanBranchId = bId.replace(/-sales$|-services$/, '')
      
      const [resSugg, resEmp] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/lineup/suggestions?branchId=${cleanBranchId}`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers }).catch(() => null)
      ])
      
      const namesSet = new Set<string>()
      
      if (resSugg && resSugg.ok) {
        const data = await resSugg.json()
        const list = data?.installers || []
        list.forEach((n: string) => {
          if (n?.trim()) namesSet.add(n.trim().toUpperCase())
        })
      }
      
      if (resEmp && resEmp.ok) {
        const payload = await resEmp.json()
        const list = payload?.data || payload || []
        list.forEach((emp: any) => {
          if (emp.name?.trim()) {
            const empBranch = (emp.branchId || '').replace(/-sales$|-services$/, '')
            if (empBranch === cleanBranchId && emp.isActive !== false) {
              namesSet.add(emp.name.trim().toUpperCase())
            }
          }
        })
      }
      
      // Fallback/standard installers if empty
      const standardInstallers = ['RANIL', 'JHUMAR', 'KENNAN', 'CRIS', 'SONNY', 'RYAN', 'ALLAN']
      if (namesSet.size === 0) {
        standardInstallers.forEach(name => namesSet.add(name))
      }
      
      setInstallerSuggestions(Array.from(namesSet).sort())

      const negotiatorSet = new Set<string>()
      if (resEmp && resEmp.ok) {
        const payload = await resEmp.json()
        const list = payload?.data || payload || []
        list.forEach((emp: any) => {
          if (emp.name?.trim() && emp.isActive !== false) {
            const empBranch = resolveScopedBranchId(emp.branchId || '')
            if (!cleanBranchId || empBranch.toUpperCase() === resolveScopedBranchId(cleanBranchId).toUpperCase()) {
              negotiatorSet.add(emp.name.trim())
            }
          }
        })
      }
      setNegotiatorSuggestions(Array.from(negotiatorSet).sort())
    } catch (e) {
      console.error('Failed to fetch installer suggestions', e)
    }
  }, [])

  useEffect(() => {
    fetchInstallerSuggestions(branchFilter)
  }, [branchFilter, fetchInstallerSuggestions])

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

  // ── Cell Display & Editing Helpers ─────────────────────────────────────────

  function getCellDisplay(row: ServiceRow, colLabel: string): string {
    switch (colLabel) {
      case 'TICKET NO.':      return row.ticketNumber || ''
      case 'DATE INSTALLED':  return formatDateKeyLabel(getInstalledDateKey(row))
      case "CUSTOMER'S NAME": return row.customerName || ''
      case 'DESTINATION':     return row.customerAddress || ''
      case 'DISTRICT':        return (row.district || '').toUpperCase()
      case 'CONTACT NO.':     return row.customerPhone || ''
      case 'BRAND':           return (row.unitBrandModel || '').toUpperCase()
      case 'COMPLAIN/REQUEST': return (row.complainRequest || '').toUpperCase()
      case 'DLR':             return (row.dealer || '').toUpperCase()
      case 'INSTALLER':       return formatCleanName(row.technicianName)
      case 'NEGOTIATOR':      return formatNegotiatorFirstName(row.negotiator)
      case 'NOTE':            return (row.note || '').toUpperCase()
      case 'SERVICE':         return (row.serviceColumn || '').toUpperCase()
      case 'UPDATE':          return (row.remarks || '').toUpperCase()
      case 'INSTALLATION CHARGES': {
        const mode = (row.paymentStatus || '').trim().toUpperCase()
        const amt = row.amountCharged != null ? parseFloat(String(row.amountCharged)) : null
        const amtStr = amt != null ? `₱${amt.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''
        if (!mode && !amtStr) return ''
        if (mode === 'FREE' || mode === 'FREE INSTALL') return 'FREE INSTALL ₱0.00'
        if (amtStr && mode) return `${amtStr} ${mode}`
        if (amtStr) return amtStr
        return mode
      }
      case 'MODE OF PAYMENT':      return row.paymentStatus || ''
      case 'SUBMITTED BY':         return row.inputBy || ''
      case 'DATE SUBMITTED':       return formatDateTime(row.createdAt)
      case 'UPDATED BY':           return row.updatedBy || ''
      case 'DATE UPDATED':         return formatDateTime(row.updatedAt)
      default: return ''
    }
  }

  const startEdit = (row: ServiceRow, col: string) => {
    if (!canEdit || !EDITABLE_COLS.includes(col)) return
    const val = col === 'DATE INSTALLED'
      ? getInstalledDateKey(row)
      : getCellDisplay(row, col)
    setEditingCell({ rowId: row.id, col })
    setCellValue(val)
    setContextMenu(null)
  }

  const saveCell = useCallback(async (rowId: string, col: string, value: string, silent = false): Promise<string | null> => {
    console.log(`[saveCell] ENTER - rowId: ${rowId}, col: ${col}, value: "${value}", active editingCell:`, editingCell);

    if (!editingCell || editingCell.rowId !== rowId || editingCell.col !== col) {
      console.log(`[saveCell] BYPASSED - editingCell does not match active cell.`);
      return null
    }

    const field = COL_FIELD[col]
    if (!field) { setEditingCell(null); return null }
    const current = rows.find(r => r.id === rowId)
    if (!current) {
      console.log(`[saveCell] ERROR - Row not found in state: ${rowId}`);
      setEditingCell(null);
      return null
    }

    const isTemp = rowId.startsWith('temp-')

    // If it's a temp row and customerName is empty or being saved as empty, cancel/remove the row
    if (isTemp && col === "CUSTOMER'S NAME" && (!value || !value.trim())) {
      setRows(prev => prev.filter(r => r.id !== rowId))
      setEditingCell(null)
      setCellValue('')
      return null
    }

    let finalValue: any = value
    const localPatch: Partial<ServiceRow> = { [field]: value } as Partial<ServiceRow>

    if (col === 'INSTALLATION CHARGES') {
      finalValue = parseFloat(value) || 0
      localPatch.amountCharged = finalValue
      // Auto-complete: any charge > 0 means job is done
      if (finalValue > 0) {
        localPatch.jobStatus = 'COMPLETED'
      }
    }

    if (col === 'MODE OF PAYMENT') {
      if (value === 'FREE' || value === 'FREE INSTALL') {
        localPatch.amountCharged = 0
        localPatch.freeInstallation = true
        localPatch.jobStatus = 'COMPLETED'
      }
    }

    if (col === 'DATE INSTALLED') {
      finalValue = value.trim() ? value.trim().slice(0, 10) : null
      localPatch.installedDate = finalValue
    }

    // If it's a temp row and Customer Name is still not set, update locally but do not save to DB yet
    if (isTemp) {
      const targetCustomerName = col === "CUSTOMER'S NAME" ? value : (current.customerName || '')
      if (!targetCustomerName || !targetCustomerName.trim()) {
        setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...localPatch } : r))
        setEditingCell(null)
        setCellValue('')
        return rowId
      }
    }

    // Optimistic UI update immediately
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r
      return { ...r, ...localPatch }
    }))
    setEditingCell(null)
    setCellValue('')

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const mergedFields = {
        ...current,
        ...localPatch
      }
      const payload = {
        ...mergedFields,
        id: isTemp ? undefined : rowId,
        branchId: resolveArchiveWriteBranchId(mergedFields.branchId) || null
      }
      const url = isTemp
        ? `${API_BASE_URL}/v1/service-reports`
        : `${API_BASE_URL}/v1/service-reports/${rowId}`
      const method = isTemp ? 'POST' : 'PUT'

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated = await res.json()
      
      let finalRowId = rowId
      if (updated && updated.id) {
        finalRowId = updated.id
        setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...updated, ...localPatch } : r))
      }
      return finalRowId
    } catch (e: any) {
      // Revert optimistic update on failure
      fetchRows({ soft: true, force: true })
      if (!silent) alert(`Could not save: ${e?.message || 'Unknown error'}`)
      return null
    }
  }, [rows, editingCell])

  const cancelEdit = () => {
    if (editingCell) {
      const { rowId } = editingCell
      if (rowId.startsWith('temp-')) {
        const current = rows.find(r => r.id === rowId)
        if (!current || !current.customerName || !current.customerName.trim()) {
          setRows(prev => prev.filter(r => r.id !== rowId))
        }
      }
    }
    setEditingCell(null)
    setCellValue('')
  }

  function getAdjacentCell(rowId: string, col: string, dir: 'next' | 'prev' | 'down' | 'up') {
    const rowIdx = visible.findIndex(r => r.id === rowId)
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

  const handleKeyDown = (e: React.KeyboardEvent, rowId: string, col: string) => {
    const multiline = ['NOTE', 'DESTINATION'].includes(col)

    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); return }

    if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      const next = getAdjacentCell(rowId, col, 'down')
      saveCell(rowId, col, cellValue, true).then((finalRowId) => {
        if (next && finalRowId) {
          const targetRowId = next.rowId === rowId ? finalRowId : next.rowId
          const r = visible.find(x => x.id === next.rowId)
          if (r) startEdit({ ...r, id: targetRowId }, next.col)
        }
      })
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const dir = e.shiftKey ? 'prev' : 'next'
      const next = getAdjacentCell(rowId, col, dir)
      saveCell(rowId, col, cellValue, true).then((finalRowId) => {
        if (next && finalRowId) {
          const targetRowId = next.rowId === rowId ? finalRowId : next.rowId
          const r = visible.find(x => x.id === next.rowId)
          if (r) startEdit({ ...r, id: targetRowId }, next.col)
        }
      })
      return
    }

    if (e.key === 'ArrowDown' && !multiline) {
      e.preventDefault()
      const next = getAdjacentCell(rowId, col, 'down')
      saveCell(rowId, col, cellValue, true).then((finalRowId) => {
        if (next && finalRowId) {
          const targetRowId = next.rowId === rowId ? finalRowId : next.rowId
          const r = visible.find(x => x.id === next.rowId)
          if (r) startEdit({ ...r, id: targetRowId }, next.col)
        }
      })
      return
    }

    if (e.key === 'ArrowUp' && !multiline) {
      e.preventDefault()
      const next = getAdjacentCell(rowId, col, 'up')
      saveCell(rowId, col, cellValue, true).then((finalRowId) => {
        if (next && finalRowId) {
          const targetRowId = next.rowId === rowId ? finalRowId : next.rowId
          const r = visible.find(x => x.id === next.rowId)
          if (r) startEdit({ ...r, id: targetRowId }, next.col)
        }
      })
      return
    }
  }

  function renderCell(r: ServiceRow, col: any, idx: number) {
    const { label } = col
    const isThisEditing = editingCell?.rowId === r.id && editingCell?.col === label
    const isEditable    = EDITABLE_COLS.includes(label)

    if (isThisEditing) {
      const inputClass = 'w-full text-xs rounded px-2 py-1 outline-none focus:ring-2 focus:ring-slate-400 font-medium'
      const UPPERCASE_COLS = ['DISTRICT', 'UPDATE', 'NOTE', 'SERVICE', 'BRAND', 'COMPLAIN/REQUEST', 'DLR']
      const shouldUppercase = UPPERCASE_COLS.includes(label)
      const inputSt = {
        backgroundColor: inputBg,
        border: `1.5px solid ${inputBorder}`,
        color: textPrimary,
        ...(shouldUppercase ? { textTransform: 'uppercase' as const } : {}),
      }

      if (label === 'MODE OF PAYMENT') {
        return (
          <select
            ref={el => { inputRef.current = el }}
            value={cellValue}
            onChange={e => setCellValue(e.target.value)}
            onBlur={() => saveCell(r.id, label, cellValue)}
            onKeyDown={e => handleKeyDown(e as any, r.id, label)}
            className={inputClass} style={inputSt}>
            {PAYMENT_MODES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )
      }

      const multiline = ['NOTE', 'DESTINATION'].includes(label)
      if (multiline) {
        return (
          <textarea
            ref={el => { inputRef.current = el as any }}
            value={cellValue}
            onChange={e => setCellValue(shouldUppercase ? e.target.value.toUpperCase() : e.target.value)}
            onBlur={() => saveCell(r.id, label, cellValue)}
            onKeyDown={e => handleKeyDown(e as any, r.id, label)}
            rows={3}
            className={`${inputClass} resize-none`}
            style={inputSt} />
        )
      }

      return (
        <input
          ref={el => { inputRef.current = el }}
          type={label === 'INSTALLATION CHARGES' ? 'number' : label === 'CONTACT NO.' ? 'tel' : label === 'DATE INSTALLED' ? 'date' : 'text'}
          list={label === 'INSTALLER' ? 'installer-options' : label === 'NEGOTIATOR' ? 'negotiator-options' : undefined}
          value={cellValue}
          onChange={e => setCellValue(shouldUppercase ? e.target.value.toUpperCase() : e.target.value)}
          onBlur={() => saveCell(r.id, label, cellValue)}
          onKeyDown={e => handleKeyDown(e, r.id, label)}
          className={inputClass} style={inputSt} />
      )
    }

    const val = getCellDisplay(r, label)
    const isCellExpanded = expandedCells[`${r.id}:${label}`]
    const truncStyle: React.CSSProperties = (col.isExpanded || isCellExpanded)
      ? { wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.5 }
      : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }

    const editHint: React.CSSProperties = isEditable && canEdit
      ? { cursor: 'pointer' } : {}

    if (label === 'TICKET NO.') {
      return (
        <span style={{ ...truncStyle, ...editHint, fontSize: '13px', fontWeight: 800 }} title={val}>
          {idx + 1}. {val || '—'}
        </span>
      )
    }

    if (label === 'DATE INSTALLED') {
      return (
        <span style={{ ...truncStyle, ...editHint, fontSize: '12.5px', fontWeight: 600 }} title={val} className="block text-center">
          {val || '—'}
        </span>
      )
    }

    if (label === "CUSTOMER'S NAME") {
      return (
        <span style={{ ...truncStyle, ...editHint, fontSize: '13px', fontWeight: 700 }} title={val} className="block">
          {val || '—'}
        </span>
      )
    }

    if (label === 'DESTINATION') {
      const showExpanded = col.isExpanded || isCellExpanded
      return (
        <span className={showExpanded ? "leading-relaxed break-words block text-[12.5px]" : "line-clamp-2 leading-relaxed block text-[12.5px]"} title={val}>
          {val}
        </span>
      )
    }

    if (label === 'CONTACT NO.') {
      return (
        <span style={{ ...truncStyle, ...editHint, fontSize: '12.5px', fontWeight: 600 }} title={val}>
          <FormatPhone raw={val} />
        </span>
      )
    }

    if (label === 'SERVICE') {
      return (
        <span style={{ fontSize: '12.5px', fontWeight: 600, textTransform: 'uppercase', display: 'block', textAlign: 'center', color: textPrimary }}>
          {val || '—'}
        </span>
      )
    }

    if (label === 'MODE OF PAYMENT') {
      return (
        <span style={{ fontSize: '12.5px', fontWeight: 600, textTransform: 'uppercase', display: 'block', textAlign: 'center', color: textPrimary }}>
          {val || ''}
        </span>
      )
    }

    if (label === 'INSTALLATION CHARGES') {
      return <span style={{ ...truncStyle, fontSize: '13px', fontWeight: 700 }}>{val || ''}</span>
    }

    if (label === 'INSTALLER') {
      return (
        <span style={{ ...truncStyle, ...editHint }} title={val}>
          <EmployeeNameLink nameOrId={val} />
        </span>
      )
    }

    if (label === 'NEGOTIATOR') {
      return (
        <span style={{ ...truncStyle, ...editHint }} title={val}>
          <EmployeeNameLink nameOrId={val} />
        </span>
      )
    }

    if (label === 'SUBMITTED BY' || label === 'UPDATED BY') {
      return (
        <span style={{ ...truncStyle }} title={val}>
          <EmployeeNameLink nameOrId={val} />
        </span>
      )
    }

    return <span style={{ ...truncStyle, ...editHint }} title={val}>{val}</span>
  }

  // ── Detect branch from filename ───────────────────────────────────────────
  const guessBranchFromFilename = (filename: string): string => {
    const base = filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[_\-]/g, ' ')
    let bestId = branchFilter || (branches[0]?.id || '')
    let bestScore = -1
    for (const b of branches) {
      const nameLower = b.name.toLowerCase()
      const keywords = nameLower.split(/[\s\-–]+/).filter(w => w.length >= 3)
      const score = keywords.reduce((acc, kw) => acc + (base.includes(kw) ? 1 : 0), 0)
      if (score > bestScore) { bestScore = score; bestId = b.id }
    }
    return bestScore > 0 ? bestId : (branchFilter || (branches[0]?.id || ''))
  }

  // ── Detect date from filename ─────────────────────────────────────────────
  const guessDateFromFilename = (filename: string): string | null => {
    const base = filename.replace(/\.[^.]+$/, '')
    const toISO = (y: number, m: number, d: number): string | null => {
      if (m < 1 || m > 12 || d < 1 || d > 31) return null
      const full = y < 100 ? 2000 + y : y
      return `${full}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }

    // 1. YYYY-MM-DD  e.g. 2026-05-26  or  2026.05.26
    let m = base.match(/(\d{4})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})/)
    if (m) return toISO(+m[1], +m[2], +m[3])

    // 2. Compact YYYYMMDD  e.g. 20260526
    m = base.match(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])(?!\d)/)
    if (m) return toISO(+m[1], +m[2], +m[3])

    // 3. MM-DD-YYYY or MM.DD.YYYY  e.g. 05-26-2026
    m = base.match(/(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})/)
    if (m) {
      const [, a, b2, y] = m
      // Determine if first chunk is month (1-12) vs day
      if (+a <= 12) return toISO(+y, +a, +b2)
      if (+b2 <= 12) return toISO(+y, +b2, +a)
    }

    // 4. Month name  e.g. May26, May 26 2026, 26May2026
    const MONTHS: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
      january: 1, february: 2, march: 3, april: 4, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    }
    const monthPat = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
    const re = new RegExp(`(?:(\\d{1,2})[\\s\\-\\.])?(${monthPat})[\\s\\-\\.](\\d{1,2})?[\\s\\-\\.,]*(\\d{2,4})?`, 'i')
    const mn = base.match(re)
    if (mn) {
      const moNum = MONTHS[mn[2].toLowerCase()]
      const day = +(mn[1] || mn[3] || '1')
      const yr = mn[4] ? +mn[4] : new Date().getFullYear()
      if (moNum) return toISO(yr, moNum, day)
    }

    return null
  }

  const handleImportFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    // Auto-detect date from filename and update the month picker if needed
    const detectedDate = guessDateFromFilename(file.name)
    const targetDate = detectedDate || todayLocal()
    const detectedMonth = targetDate.slice(0, 7)
    if (detectedMonth !== monthFilter) {
      setMonthFilter(detectedMonth)
    }

    if (isBranchScoped) {
      runImport(file, user?.branchId || '', targetDate)
    } else {
      const detectedId = guessBranchFromFilename(file.name)
      if (detectedId && detectedId !== branchFilter) setBranchFilter(detectedId)
      setPendingImport({
        file,
        branchId: detectedId || branchFilter || (branches[0]?.id || ''),
        detectedDate: targetDate,
      })
      console.info(`[Import] "${file.name}" → branch: ${branches.find(b => b.id === detectedId)?.name || '?'}, date: ${targetDate}`)
    }
  }

  const runImport = async (file: File, branchId: string, targetDateArg?: string) => {
    if (!isBranchScoped && !branchId) {
      alert('Please pick a target branch')
      return
    }
    const targetDate = targetDateArg || todayLocal()
    const branchName = branches.find(b => b.id === branchId)?.name
      || (isBranchScoped ? 'your branch' : 'the chosen branch')
    const pretty = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const ok = window.confirm(
      `Import "${file.name}" into ${branchName} for ${pretty}?\n\n` +
      `Existing ${branchName} service rows for ${pretty} will be REPLACED.`
    )
    if (!ok) { setPendingImport(null); return }

    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ date: targetDate })
      if (!isBranchScoped && branchId) {
        params.set('branchId', resolveScopedBranchId(branchId))
      }
      const url = `${API_BASE_URL}/v1/service-reports/import?${params.toString()}`
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (res.ok) {
        const result = await res.json()
        const sheetMsg = result?.sheet ? ` (sheet "${result.sheet}")` : ''
        alert(`${result.message || 'Import successful!'}${sheetMsg}`)
        fetchRows({ soft: true, force: true })
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || err.message || `Import failed (HTTP ${res.status})`)
      }
    } catch (err) {
      console.error(err); alert('Network error during import')
    } finally {
      setImporting(false); setPendingImport(null)
    }
  }

  // ── Save (create / update) ────────────────────────────────────────────────
  const handleDelete = async (row: ServiceRow) => {
    if (!window.confirm(`Delete service record for ${row.customerName}?`)) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/service-reports/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || err.message || `Delete failed (HTTP ${res.status})`)
        return
      }
      fetchRows({ soft: true, force: true })
    } catch (e) {
      console.error(e); alert('Network error while deleting')
    }
  }


  // ── Derived data ──────────────────────────────────────────────────────────
  const rowSearchBlob = (r: ServiceRow) => {
    const amt = r.amountCharged != null ? String(r.amountCharged) : ''
    const amtPeso = r.amountCharged != null ? peso(r.amountCharged) : ''
    return [
      r.customerName, r.customerAddress, r.customerPhone, r.district,
      r.branchName, r.serviceType, r.statusCode, r.commitTerms, r.dealer,
      r.unitBrandModel, r.unitSerial, r.technicianName, r.negotiator,
      r.scheduleTime, r.scheduleStatus, r.timeStarted, r.timeEnded,
      r.paymentStatus, r.jobStatus, r.remarks, r.note, r.controlNumber,
      r.serviceColumn, r.papers, r.costing, r.relayStatus, r.fifteenQuestions,
      r.freeInstallation ? 'free installation' : '',
      r.reportDate, r.installedDate, r.scheduledDate, amt, amtPeso,
    ].filter(Boolean).join(' ').toLowerCase()
  }

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let filtered = rows

    if (negoFilter) {
      filtered = filtered.filter(r => formatNegotiatorFirstName(r.negotiator) === negoFilter)
    }

    if (!q) return filtered
    return filtered.filter(r => rowSearchBlob(r).includes(q))
  }, [rows, searchQuery, negoFilter])

  // Build month options from current items (+ last 12 months always available)
  const monthOptions = useMemo(() => {
    const seen = new Set<string>()
    rows.forEach(item => {
      if (item.reportDate) seen.add(item.reportDate.slice(0, 7))
    })
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(seen).sort((a, b) => b.localeCompare(a))
  }, [rows])

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  // Descending list of selectable months (current month first, 24 months back).
  const monthOptions = useMemo(() => {
    const now = new Date()
    const opts: string[] = []
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    if (monthFilter && !opts.includes(monthFilter)) opts.push(monthFilter)
    return opts
  }, [monthFilter])

  const branchSelectOptions = useMemo(() => [
    { value: 'ALL_BRANCHES', label: 'All Branches' },
    ...branches.map(b => ({ value: b.id, label: formatBranchName(b.name) }))
  ], [branches])

  const negoSelectOptions = useMemo(() => [
    { value: '', label: 'All Negotiators' },
    ...negotiatorOptions.map(n => ({ value: n, label: n }))
  ], [negotiatorOptions])

  const monthSelectOptions = useMemo(() => [
    { value: '', label: 'All Months' },
    ...monthOptions.map(ym => ({ value: ym, label: monthLabel(ym) }))
  ], [monthOptions])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full" onClick={() => { setContextMenu(null); }}>

      {/* Hidden file input */}
      {canImport && (
        <input type="file" accept=".xlsx,.xls" id="svc-import-input" className="hidden" onChange={handleImportFilePicked} />
      )}

      {/* ── Portal: Toolbar into header slot ────────────────── */}
      {ReactDOM.createPortal(
        <div className="flex flex-col gap-2 w-full px-3 md:px-4 py-2 select-none">
          <div className="flex flex-wrap items-center gap-2.5 w-full">
            {/* Branch Filter */}
            <CustomSelect
              icon={<Building2 className="w-4 h-4 shrink-0" />}
              title="Select Branch"
              value={branchFilter}
              options={branchSelectOptions}
              onChange={val => {
                handleBranchFilterChange(val)
                localStorage.setItem('ashcol-global-branch-id', val)
                window.dispatchEvent(new Event('ashcol-global-branch-change'))
              }}
              minWidth="min-w-[210px]"
              inputBg={inputBg}
              inputBorder={inputBorder}
              textPrimary={textPrimary}
              textMuted={textMuted}
              isLight={isLight}
            />

            {/* Nego (Negotiator) Filter */}
            <CustomSelect
              icon={<User className="w-4 h-4 shrink-0" />}
              title="Select Negotiator"
              value={negoFilter}
              options={negoSelectOptions}
              onChange={val => setNegoFilter(val)}
              minWidth="min-w-[220px]"
              inputBg={inputBg}
              inputBorder={inputBorder}
              textPrimary={textPrimary}
              textMuted={textMuted}
              isLight={isLight}
            />

            {/* Month Picker */}
            <CustomSelect
              icon={<CalendarDays className="w-4 h-4 shrink-0" />}
              title="Select Month"
              value={monthFilter}
              options={monthSelectOptions}
              onChange={val => handleMonthFilterChange(val)}
              minWidth="min-w-[200px]"
              inputBg={inputBg}
              inputBorder={inputBorder}
              textPrimary={textPrimary}
              textMuted={textMuted}
              isLight={isLight}
            />

            {/* Search bar */}
            <div className="flex items-center gap-2 h-9 px-3 py-1.5 rounded-lg border flex-1 min-w-[200px] max-w-md shadow-sm transition-all"
              style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search Archives…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-xs flex-1 font-semibold"
                style={{ color: textPrimary }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} title="Clear"
                  className="shrink-0 p-0.5 rounded hover:bg-slate-200/20" style={{ color: textMuted }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {/* Simplified compact stats bar */}


      {/* Data table */}
      <div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden" style={{ backgroundColor: cardBg }}>
        {loading && rows.length === 0 ? (
          <div className="flex flex-col gap-2 p-5 flex-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
            ))}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" data-ticket-table-scroll style={{ position: 'relative' }}>
            {refreshing && (
              <div className="px-3 py-1 text-[10px] font-semibold sticky top-0 z-30" style={{ color: textMuted, backgroundColor: cardBg }}>
                Syncing archives…
              </div>
            )}
            <table
              key={`${branchFilter}|${monthFilter}`}
              className="hidden md:table text-xs w-full" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
              <colgroup>
                {columns.map(col => (
                  <col key={col.label} style={{ width: col.w }} />
                ))}
                {/* Trailing action column — row cancel/delete "X", fixed width so it
                    never eats into the percentage-weighted data columns above. */}
                <col style={{ width: '34px' }} />
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#060B18' }}>
                  {columns.map((col) => {
                    return (
                      <th key={col.label}
                        style={{
                          padding: '11px 12px',
                          textAlign: (col.align as any) || 'left',
                          color: textMuted,
                          fontWeight: 800,
                          fontSize: '11.5px',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          borderBottom: `2px solid ${isLight ? '#e2e8f0' : '#1e293b'}`,
                          width: col.w,
                          minWidth: 0,
                          maxWidth: col.w,
                          backgroundColor: isLight ? '#f8fafc' : '#060B18',
                          userSelect: 'none',
                          ...(col.sticky ? {
                            position: 'sticky' as const,
                            left: `${col.left}%`,
                            zIndex: 15,
                          } : {}),
                        }}>
                        {col.display}
                      </th>
                    )
                  })}
                  <th style={{
                    padding: '8px 10px',
                    borderBottom: `2px solid ${isLight ? '#e2e8f0' : '#1e293b'}`,
                    width: '34px',
                    minWidth: 0,
                    maxWidth: '34px',
                    backgroundColor: isLight ? '#f8fafc' : '#060B18',
                  }} />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} style={{ padding: '40px 10px', textAlign: 'center' }}>
                      <div className="flex flex-col items-center justify-center gap-3 py-6">
                        <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
                        <p className="text-sm font-semibold" style={{ color: textMuted }}>
                          {searchQuery.trim()
                            ? `No records match “${searchQuery.trim()}”${rows.length > 0 ? ` (${rows.length} loaded)` : ''}`
                            : `No service records for ${viewMode === 'weekly' ? weekRange.label : 'this month'}`}
                        </p>
                        {searchQuery.trim() && (
                          <button type="button" onClick={() => setSearchQuery('')}
                            className="text-xs font-bold hover:underline" style={{ color: textPrimary }}>Clear search</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visible.map((r, idx) => {
                  // Flat row background — no zebra striping; the context-menu-selected
                  // row is the only row that carries its own background, everything
                  // else is transparent so the tr's hover class shows through cleanly.
                  const rowSelectedBg = contextMenu?.row.id === r.id
                    ? (isLight ? '#f1f5f9' : '#111827')
                    : undefined

                  return (
                    <tr key={r.id}
                      onContextMenu={e => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, row: r })
                      }}
                      onDoubleClick={() => handleViewDetailsPopup(r)}
                      style={{
                        borderBottom: `1px solid ${border}`,
                        backgroundColor: rowSelectedBg,
                        cursor: 'pointer',
                      }}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-[#0F1A2E]">

                      {columns.map((col) => {
                        const isThisEditing = editingCell?.rowId === r.id && editingCell?.col === col.label
                        const isEditable    = EDITABLE_COLS.includes(col.label) && canEdit
                        return (
                          <td key={col.label}
                              onClick={e => {
                                e.stopPropagation()
                                if (isThisEditing) return
                                setExpandedCells(prev => ({
                                  ...prev,
                                  [`${r.id}:${col.label}`]: !prev[`${r.id}:${col.label}`]
                                }))
                              }}
                              onDoubleClick={e => {
                                e.stopPropagation()
                                if (isEditable && !isThisEditing) startEdit(r, col.label)
                              }}
                              style={{
                                padding: isThisEditing ? '6px 8px' : '10px 12px',
                                color: textPrimary,
                                fontSize: '12.5px',
                                fontWeight: 600,
                                lineHeight: '1.4',
                                backgroundColor: isThisEditing ? inputBg : rowSelectedBg,
                                textAlign: (col.align as any) || 'left',
                                borderBottom: `1px solid ${border}`,
                                width: col.w, minWidth: 0, maxWidth: col.w,
                                overflow: isThisEditing ? 'visible' : 'hidden',
                                textOverflow: 'ellipsis',
                                transition: 'background-color 0.1s ease',
                                cursor: isThisEditing ? 'default' : 'pointer',
                                verticalAlign: 'middle',
                                ...(col.sticky ? {
                                  position: 'sticky' as const,
                                  left: `${col.left}%`,
                                  zIndex: 5,
                                  backgroundColor: isThisEditing ? inputBg : (rowSelectedBg ?? cardBg),
                                } : {}),
                              }}>
                            {renderCell(r, col, idx)}
                          </td>
                        )
                      })}
                      <td style={{
                        padding: '7px 6px',
                        borderBottom: `1px solid ${border}`,
                        width: '34px', minWidth: 0, maxWidth: '34px',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        backgroundColor: rowSelectedBg,
                      }}>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleRemoveRow(r.id) }}
                          title={r.id.startsWith('temp-') ? 'Cancel this row' : 'Delete this record'}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>

            {/* ── Mobile SaaS cards — table is desktop-only (hidden md:table above) ── */}
            <div className="flex flex-col md:hidden p-3 gap-3">
              {visible.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl p-10 text-center flex flex-col items-center gap-3"
                  style={{ borderColor: isLight ? '#cbd5e1' : '#334155' }}>
                  <AlertTriangle className="w-8 h-8 opacity-30" style={{ color: textMuted }} />
                  <p className="text-sm font-semibold" style={{ color: textMuted }}>
                    {searchQuery.trim()
                      ? `No records match “${searchQuery.trim()}”${rows.length > 0 ? ` (${rows.length} loaded)` : ''}`
                      : `No service records for ${viewMode === 'weekly' ? weekRange.label : 'this month'}`}
                  </p>
                  {searchQuery.trim() ? (
                    <button type="button" onClick={() => setSearchQuery('')}
                      className="text-xs font-bold hover:underline" style={{ color: textPrimary }}>Clear search</button>
                  ) : canEdit && (
                    <button onClick={handleAddRow}
                      className="text-xs font-bold hover:underline" style={{ color: textPrimary }}>+ Add the first one</button>
                  )}
                </div>
              ) : (
                visible.map(r => {
                  const chargesDisplay = getCellDisplay(r, 'INSTALLATION CHARGES')
                  const negotiatorName = formatNegotiatorFirstName(r.negotiator)
                  const installerName = formatCleanName(r.technicianName)
                  const completedLabel = formatDateKeyLabel(getInstalledDateKey(r))
                  return (
                    <div
                      key={r.id}
                      onClick={() => handleViewDetailsPopup(r)}
                      onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, row: r }) }}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0A1120] shadow-sm overflow-hidden active:scale-[0.985] transition-transform cursor-pointer"
                    >
                      {/* Header: ticket no (left) / completed date + cancel-delete "X" (right) */}
                      <div className="px-3 py-2 flex justify-between items-center border-b" style={{ borderColor: border, backgroundColor: isLight ? 'rgba(248,250,252,0.7)' : 'rgba(15,26,46,0.5)' }}>
                        <span className="text-[10.5px] font-bold tabular-nums" style={{ color: textMuted }}>
                          {r.ticketNumber || '—'}
                        </span>
                        <div className="flex items-center gap-2">
                          {completedLabel ? (
                            <span className="flex items-center gap-1 text-[10.5px] font-bold" style={{ color: textPrimary }}>
                              <CalendarDays className="w-3 h-3 shrink-0" style={{ color: textMuted }} />
                              {completedLabel}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleRemoveRow(r.id) }}
                            title={r.id.startsWith('temp-') ? 'Cancel this row' : 'Delete this record'}
                            className="text-slate-400 hover:text-red-500 transition-colors p-0.5 rounded shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Body: customer name / brand · dealer / district */}
                      <div className="p-3">
                        <span className="text-sm font-black uppercase tracking-wide leading-tight truncate block" style={{ color: textPrimary }}>
                          {r.customerName || '—'}
                        </span>
                        {(r.unitBrandModel || r.dealer) ? (
                          <div className="text-[10.5px] font-semibold truncate mt-1" style={{ color: textMuted }}>
                            {[r.unitBrandModel, r.dealer].filter(Boolean).join(' · ')}
                          </div>
                        ) : null}
                        {r.district ? (
                          <div className="flex items-center gap-1 mt-0.5" style={{ color: textMuted }}>
                            <Building2 className="w-2.5 h-2.5 shrink-0" />
                            <span className="text-[10.5px] font-medium truncate">{r.district}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Crew: 2-col grid — Negotiator / Installer */}
                      <div className="grid grid-cols-2 gap-2 px-3 py-2.5 bg-slate-50/50 dark:bg-[#0F1A2E]/30 border-y" style={{ borderColor: border }}>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: textMuted }}>Negotiator</span>
                          <span className="text-[11px] font-semibold truncate" style={{ color: negotiatorName ? textPrimary : textMuted }}>
                            {negotiatorName || '—'}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: textMuted }}>Installer</span>
                          <span className="text-[11px] font-semibold truncate" style={{ color: installerName ? textPrimary : textMuted }}>
                            {installerName || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Footer: remarks (left, clamped) / charges (right) */}
                      <div className="px-3 py-2 flex justify-between items-start gap-2">
                        <p className="text-[10.5px] font-medium min-w-0 flex-1" style={{ color: textMuted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {r.remarks || '—'}
                        </p>
                        {chargesDisplay ? (
                          <span className="text-[11px] font-black tabular-nums shrink-0" style={{ color: textPrimary }}>
                            {chargesDisplay}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}


      </div>

      {/* ── Right-click context menu ─────────────────────────────────── */}
      {contextMenu && (
        <div className="fixed z-[200]" style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}>
          <div className="rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors"
              style={{ color: textPrimary }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = inputBg}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'}
              onClick={() => handleViewDetailsPopup(contextMenu.row)}>
              <Eye className="w-3.5 h-3.5" style={{ color: textMuted }} /> View details
            </button>
            {canEdit && (
              <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors"
                style={{ color: textPrimary }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = inputBg}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'}
                onClick={() => { startEdit(contextMenu.row, columns[0].label); setContextMenu(null) }}>
                <Edit3 className="w-3.5 h-3.5" style={{ color: textMuted }} /> Edit row
              </button>
            )}
            {canDelete && (
              <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors"
                style={{ color: textPrimary }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = inputBg}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'}
                onClick={() => { handleDelete(contextMenu.row); setContextMenu(null) }}>
                <Trash2 className="w-3.5 h-3.5" /> Delete row
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Branch Picker (all-branch Excel import) ─────────────────────── */}
      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPendingImport(null)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm" style={{ color: textPrimary }}>Import to Branch</h3>
              <button onClick={() => setPendingImport(null)} className="p-1.5 rounded-lg" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {/* File info row */}
              <div className="flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                <Upload className="w-4 h-4 mt-0.5 shrink-0" style={{ color: textMuted }} />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-xs font-bold truncate" style={{ color: textPrimary }}>{pendingImport.file.name}</span>
                  {/* Auto-detected badges */}
                  <div className="flex flex-col gap-0.5">
                    {branches.find(b => b.id === pendingImport.branchId) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold"
                        style={{ color: textMuted }}>
                        Branch: <span style={{ color: textPrimary }}>{branches.find(b => b.id === pendingImport.branchId)?.name}</span>
                      </span>
                    )}
                    {pendingImport.detectedDate && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold"
                        style={{ color: textMuted }}>
                        Date: <span style={{ color: textPrimary }}>
                          {new Date(pendingImport.detectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs" style={{ color: textMuted }}>
                Existing rows for the selected branch on{' '}
                <span className="font-bold" style={{ color: textPrimary }}>
                  {new Date((pendingImport.detectedDate || todayLocal()) + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>{' '}will be replaced. You can change the branch below if needed.
              </p>
              <Field label="Target Branch" required>
                <select value={pendingImport.branchId}
                  onChange={e => setPendingImport({ ...pendingImport, branchId: e.target.value })}
                  disabled={isBranchScoped}
                  className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                  <option value="">— Choose branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>

              <Field label="Target Date" required>
                <input
                  type="date"
                  value={pendingImport.detectedDate || todayLocal()}
                  onChange={e => setPendingImport({ ...pendingImport, detectedDate: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button onClick={() => setPendingImport(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border"
                style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={() => runImport(pendingImport.file, pendingImport.branchId, pendingImport.detectedDate || undefined)}
                disabled={!pendingImport.branchId || importing}
                className="px-4 py-2 rounded-xl text-xs font-bold border"
                style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary, opacity: !pendingImport.branchId || importing ? 0.5 : 1 }}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
      {scanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => {
            if (!scanning && !savingScanned) {
              setScanModalOpen(false)
              setScanPreview(null)
              setScannedRows([])
              setScanError('')
              setScanSuccess(false)
            }
          }}>
          <div className="w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: textPrimary }}>
                <Scan className="w-4 h-4 text-emerald-500" />
                Scan Daily Service Log Sheet
              </h3>
              <button 
                disabled={scanning || savingScanned}
                onClick={() => {
                  setScanModalOpen(false)
                  setScanPreview(null)
                  setScannedRows([])
                  setScanError('')
                  setScanSuccess(false)
                }} 
                className="p-1.5 rounded-lg hover:bg-slate-200/20 disabled:opacity-40" 
                style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {scanSuccess ? (
              <div className="flex flex-col items-center justify-center py-20 gap-5 flex-1">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
                  <Check className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-lg font-black" style={{ color: textPrimary }}>Service Rows Saved!</h3>
                <p className="text-xs text-center max-w-md" style={{ color: textMuted }}>
                  Successfully extracted, verified, and saved the daily service records to the database.
                </p>
                <button
                  onClick={() => {
                    setScanModalOpen(false)
                    setScanPreview(null)
                    setScannedRows([])
                    setScanError('')
                    setScanSuccess(false)
                  }}
                  className="px-6 py-2 rounded-xl text-xs font-bold border transition-all hover:scale-105"
                  style={{ borderColor: inputBorder, color: textPrimary, backgroundColor: inputBg }}>
                  Close Scanner
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[450px]">
                {/* Left Pane: Image Preview / Upload */}
                <div className="md:w-1/3 p-5 flex flex-col gap-4 border-r overflow-y-auto" style={{ borderColor: border }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-60" style={{ color: textMuted }}>
                      Log Sheet Image
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={scanning}
                        onClick={handlePasteImageClick}
                        className="px-2 py-1 rounded text-[10px] font-bold border transition-all hover:bg-slate-100 dark:hover:bg-slate-900/50 flex items-center gap-1"
                        style={{ borderColor: inputBorder, color: textMuted }}
                        title="Paste from clipboard">
                        <ClipboardPaste className="w-3 h-3" /> Paste
                      </button>
                      <button
                        type="button"
                        disabled={scanning}
                        onClick={() => scanFileRef.current?.click()}
                        className="px-2 py-1 rounded text-[10px] font-bold border transition-all hover:bg-slate-100 dark:hover:bg-slate-900/50 flex items-center gap-1"
                        style={{ borderColor: inputBorder, color: textMuted }}>
                        <Upload className="w-3 h-3" /> Upload
                      </button>
                    </div>
                  </div>

                  <input ref={scanFileRef} type="file" accept="image/*" className="hidden" onChange={handleScanImageSelect} />

                  {scanPreview ? (
                    <div className="relative border rounded-xl overflow-hidden flex-1 min-h-[250px] bg-slate-900/10 flex items-center justify-center" style={{ borderColor: border }}>
                      <img src={scanPreview} alt="Service report sheet preview" className="max-w-full max-h-[400px] object-contain" />
                      {scanning && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                          <span className="text-white text-xs font-bold animate-pulse">AI extracting tables...</span>
                        </div>
                      )}
                      {!scanning && (
                        <button
                          type="button"
                          onClick={() => {
                            setScanPreview(null)
                            setScannedRows([])
                            setScanError('')
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-red-500/80 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div 
                      onClick={() => scanFileRef.current?.click()}
                      className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-20 px-4 cursor-pointer hover:border-slate-400 transition-colors flex-1"
                      style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
                      <Scan className="w-10 h-10 mb-3 opacity-20" style={{ color: textMuted }} />
                      <p className="text-xs font-bold text-center" style={{ color: textPrimary }}>
                        No Image Selected
                      </p>
                      <p className="text-[10px] text-center mt-1" style={{ color: textMuted }}>
                        Drag & drop, paste (Ctrl+V), or click to upload log sheet image
                      </p>
                    </div>
                  )}

                  {scanError && (
                    <div className="p-3 rounded-lg flex items-start gap-2 border bg-red-500/10 text-red-500 border-red-500/20 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{scanError}</span>
                    </div>
                  )}
                </div>

                {/* Right Pane: Verification grid */}
                <div className="md:w-2/3 p-5 flex flex-col gap-4 overflow-hidden">
                  <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: border }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-60" style={{ color: textMuted }}>
                        Extracted Rows ({scannedRows.length})
                      </span>
                      {scannedRows.length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
                          Review Required
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <span style={{ color: textMuted }}>Target Branch:</span>
                      <span className="font-bold" style={{ color: textPrimary }}>
                        {branchFilter === 'ALL_BRANCHES' ? 'All Branches' : (branches.find(b => b.id === branchFilter)?.name || 'None')}
                      </span>
                      <span style={{ color: textMuted }}>Target Date:</span>
                      <input
                        type="date"
                        value={scannedRows[0]?.reportDate || todayLocal()}
                        onChange={e => {
                          const newDate = e.target.value || todayLocal()
                          setScannedRows(prev => prev.map(r => ({ ...r, reportDate: newDate })))
                        }}
                        className="rounded-lg px-2.5 py-1 outline-none border text-xs font-bold transition-all focus:ring-2 focus:ring-slate-400"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-x-auto overflow-y-auto">
                    {scannedRows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                        <Building2 className="w-8 h-8 opacity-20" />
                        <span className="text-xs font-medium">No rows extracted yet. Upload a log sheet on the left to begin.</span>
                      </div>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>#</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Customer Name</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Address / Destination</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Brand / Unit</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Installer</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Update / Remarks</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Charges</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Payment Mode</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Control No.</th>
                            <th className="p-2 text-left font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Qty</th>
                            <th className="p-2 text-center font-bold text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>Act</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scannedRows.map((row, idx) => (
                            <tr key={row.id} style={{ borderBottom: `1px solid ${border}` }} className="hover:bg-slate-500/5">
                              <td className="p-2 font-bold text-slate-400">{idx + 1}</td>
                              <td className="p-1 min-w-[120px]">
                                <input
                                  type="text"
                                  value={row.customerName || ''}
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'customerName', e.target.value)}
                                  className="w-full rounded px-2 py-1 text-xs outline-none font-medium border"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                                />
                              </td>
                              <td className="p-1 min-w-[150px]">
                                <textarea
                                  value={row.customerAddress || ''}
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'customerAddress', e.target.value)}
                                  rows={1}
                                  className="w-full rounded px-2 py-1 text-xs outline-none font-medium border resize-y"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                                />
                              </td>
                              <td className="p-1 min-w-[120px]">
                                <input
                                  type="text"
                                  value={row.unitBrandModel || ''}
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'unitBrandModel', e.target.value)}
                                  className="w-full rounded px-2 py-1 text-xs outline-none font-medium border"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                                />
                              </td>
                              <td className="p-1 min-w-[100px]">
                                <input
                                  type="text"
                                  value={row.technicianName || ''}
                                  list="installer-options"
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'technicianName', e.target.value)}
                                  className="w-full rounded px-2 py-1 text-xs outline-none font-medium border"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                                />
                              </td>
                              <td className="p-1 min-w-[150px]">
                                <textarea
                                  value={row.remarks || ''}
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'remarks', e.target.value)}
                                  rows={1}
                                  className="w-full rounded px-2 py-1 text-xs outline-none font-medium border resize-y"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                                />
                              </td>
                              <td className="p-1 min-w-[80px]">
                                <input
                                  type="number"
                                  value={row.amountCharged != null ? row.amountCharged : ''}
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'amountCharged', e.target.value)}
                                  className="w-full rounded px-2 py-1 text-xs outline-none font-semibold border"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                                />
                              </td>
                              <td className="p-1 min-w-[100px]">
                                <select
                                  value={row.paymentStatus || ''}
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'paymentStatus', e.target.value)}
                                  className="w-full rounded px-2 py-1 text-xs outline-none border"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}>
                                  {PAYMENT_MODES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </td>
                              <td className="p-1 min-w-[80px]">
                                <input
                                  type="text"
                                  value={row.controlNumber || ''}
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'controlNumber', e.target.value)}
                                  className="w-full rounded px-2 py-1 text-xs outline-none font-semibold border"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                                />
                              </td>
                              <td className="p-1 min-w-[50px]">
                                <input
                                  type="number"
                                  value={row.quantity != null ? row.quantity : ''}
                                  onChange={e => handleUpdateScannedRowField(row.id!, 'quantity', parseInt(e.target.value, 10) || 1)}
                                  className="w-full rounded px-2 py-1 text-xs outline-none font-medium border"
                                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                                />
                              </td>
                              <td className="p-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteScannedRow(row.id!)}
                                  className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                  title="Delete Scanned Row">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: border }}>
                    {scannedRows.length > 0 && (
                      <button
                        type="button"
                        disabled={savingScanned}
                        onClick={() => {
                          const tempId = `scan-temp-${Date.now()}`
                          let realBranchId = resolveScopedBranchId(
                            resolveArchivesBranchFilter(branchFilter, branches, user),
                          ) || resolveScopedBranchId(branches[0]?.id) || null
                          const newRow = {
                            id: tempId,
                            branchId: realBranchId,
                            reportDate: scannedRows[0]?.reportDate || todayLocal(),
                            customerName: '',
                            customerAddress: '',
                            customerPhone: '',
                            district: '',
                            statusCode: 'I',
                            commitTerms: '',
                            dealer: '',
                            unitBrandModel: '',
                            unitSerial: '',
                            quantity: 1,
                            technicianName: '',
                            negotiator: '',
                            scheduleTime: '',
                            scheduleStatus: '',
                            timeStarted: '',
                            timeEnded: '',
                            amountCharged: 0,
                            paymentStatus: 'CASH',
                            jobStatus: 'SCHEDULED',
                            remarks: '',
                            note: '',
                            controlNumber: '',
                            serviceColumn: '',
                            complainRequest: '',
                            freeInstallation: false,
                          } as ServiceRow
                          setScannedRows(prev => [...prev, newRow])
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-slate-100 dark:hover:bg-slate-900/50 flex items-center gap-1.5"
                        style={{ borderColor: inputBorder, color: textPrimary }}>
                        <Plus className="w-3.5 h-3.5" /> Add Row
                      </button>
                    )}

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        disabled={savingScanned}
                        onClick={() => {
                          setScanModalOpen(false)
                          setScanPreview(null)
                          setScannedRows([])
                          setScanError('')
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold border"
                        style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                        Cancel
                      </button>
                      <button
                        disabled={scannedRows.length === 0 || savingScanned}
                        onClick={handleSaveScannedRows}
                        className="px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5"
                        style={{
                          backgroundColor: scannedRows.length > 0 ? '#10B981' : 'transparent',
                          borderColor: scannedRows.length > 0 ? '#10B981' : inputBorder,
                          color: scannedRows.length > 0 ? '#fff' : textMuted,
                          opacity: scannedRows.length === 0 || savingScanned ? 0.6 : 1,
                        }}>
                        {savingScanned ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {savingScanned ? 'Saving…' : 'Save to Report'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <datalist id="installer-options">
        {installerSuggestions.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="negotiator-options">
        {negotiatorSuggestions.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* ── View Ticket Details Modal Popup ── */}
      {detailTicket && (
        <TicketDetailsModal
          ticket={detailTicket}
          isLight={isLight}
          isMyTickets={false}
          isTaguigServices={false}
          canEdit={canEdit}
          branchEmployees={[]}
          activeBranchId={branchFilter}
          user={user}
          duplicateNameKeys={new Set()}
          formatAssignedBranchLabel={formatBranchName}
          history={[]}
          loadingHistory={false}
          showHistoryPanel={false}
          onClose={() => setDetailTicket(null)}
          onToggleHistory={() => {}}
          onHideHistory={() => {}}
          onEdit={() => setDetailTicket(null)}
          onDelete={undefined}
          onUpdateTicket={(updated) => setDetailTicket(updated as Ticket)}
        />
      )}
    </div>
  )
}

// ── Tiny helper ──────────────────────────────────────────────────────────────
function Field({ label, required, full, children }: {
  label: string
  required?: boolean
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
        {label}{required && <span> *</span>}
      </span>
      {children}
    </label>
  )
}
