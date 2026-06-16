import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  CalendarDays, Upload, Plus, Edit3, Trash2,
  X, Search, AlertTriangle, Building2, Eye,
  Scan, Loader2, ClipboardPaste, Save,
  Check,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string
  branchId: string | null
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
}

const COL_FIELD: Record<string, keyof ServiceRow> = {
  "CUSTOMER'S NAME":      'customerName',
  'DESTINATION':          'customerAddress',
  'DISTRICT':             'district',
  'CONTACT NO.':          'customerPhone',
  'BRAND':                'unitBrandModel',
  'COMPLAIN/REQUEST':     'complainRequest',
  'DLR':                  'dealer',
  'INSTALLER':            'technicianName',
  'NOTE':                 'note',
  'SERVICE':              'serviceColumn',
  'UPDATE':               'remarks',
  'INSTALLATION CHARGES': 'amountCharged',
  'MODE OF PAYMENT':      'paymentStatus',
}

const EDITABLE_COLS = [
  "CUSTOMER'S NAME", 'DESTINATION', 'DISTRICT', 'CONTACT NO.', 'BRAND',
  'COMPLAIN/REQUEST', 'DLR', 'INSTALLER', 'NOTE', 'SERVICE', 'UPDATE',
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
  freeInstallation: false,
})

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

// ── Component ────────────────────────────────────────────────────────────────

export default function DailyServiceReport() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isAllBranchUser = isAdmin || isManager
  const isBranchScoped = role === 'staff' || role === 'employee' || role === 'oic'
  const canImport = isAllBranchUser || isBranchScoped
  const canDelete = isAdmin || isManager
  const canEdit = isAdmin || isManager || role === 'staff' || role === 'employee' || role === 'oic'

  const [rows, setRows] = useState<ServiceRow[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [date, setDate] = useState(todayLocal)
  const [viewMode] = useState<'daily' | 'weekly'>('daily')
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: ServiceRow } | null>(null)

  // Inline editing states
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null)
  const [cellValue, setCellValue] = useState<string>('')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)

  // Details Modal States
  const [detailRow, setDetailRow] = useState<ServiceRow | null>(null)
  const [detailForm, setDetailForm] = useState<ServiceRow | null>(null)

  useEffect(() => {
    setDetailForm(detailRow)
  }, [detailRow])

  const handleSaveDetailRow = async (updatedRow: ServiceRow) => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const payload = {
        ...updatedRow,
        branchId: updatedRow.branchId ? updatedRow.branchId.replace(/-sales$|-services$/, '') : null
      }
      const url = `${API_BASE_URL}/v1/service-reports/${updatedRow.id}`
      const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated = await res.json()
      setRows(prev => prev.map(r => r.id === updatedRow.id ? { ...r, ...updated } : r))
      setDetailRow(null)
    } catch (e: any) {
      alert(`Could not save details: ${e?.message || 'Unknown error'}`)
    }
  }

  const handleAddRowInline = () => {
    if (!canEdit) return
    const tempId = `temp-${Date.now()}`
    let realBranchId = branchFilter ? branchFilter.replace(/-sales$|-services$/, '') : null
    if (realBranchId === 'ALL_BRANCHES') {
      const actualBranch = branches.find(b => b.id !== 'ALL_BRANCHES')
      realBranchId = actualBranch ? actualBranch.id : null
    }
    const newRow = blankRow(date, isBranchScoped ? (user?.branchId ?? null) : realBranchId) as ServiceRow
    newRow.id = tempId

    setRows(prev => [newRow, ...prev])

    setTimeout(() => {
      startEdit(newRow, "CUSTOMER'S NAME")
    }, 50)
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
      
      let targetBranchId = branchFilter
      if (branchFilter && /-(sales|services)$/i.test(branchFilter)) {
        targetBranchId = branchFilter.replace(/-sales$|-services$/i, '')
      }
      if (targetBranchId && targetBranchId !== 'ALL_BRANCHES') {
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
          let realBranchId = branchFilter ? branchFilter.replace(/-sales$|-services$/, '') : null
          if (realBranchId === 'ALL_BRANCHES') {
            const actualBranch = branches.find(b => b.id !== 'ALL_BRANCHES')
            realBranchId = actualBranch ? actualBranch.id : null
          }
          return {
            id: `scan-temp-${index}-${Date.now()}`,
            branchId: realBranchId,
            reportDate: date,
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
            jobStatus: row.jobStatus || 'SCHEDULED',
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
  }, [scanModalOpen, scanning, branchFilter, date])

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
        branchId: r.branchId ? r.branchId.replace(/-sales$|-services$/, '') : null
      }))

      const res = await fetch(`${API_BASE_URL}/v1/service-reports/bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error(`Bulk save failed (HTTP ${res.status})`)

      setScanSuccess(true)
      fetchRows()
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
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})

  const toggleColumn = useCallback((colLabel: string) => {
    setExpandedCols(prev => ({
      ...prev,
      [colLabel]: !prev[colLabel]
    }))
  }, [])

  const columns = useMemo(() => {
    const isServices = branchFilter && (branchFilter.toLowerCase().includes('service') || branchFilter.toLowerCase().includes('services'))
    const rawCols = [
      { label: "CUSTOMER'S NAME", defaultW: 160, expW: 280, sticky: true, freeze: false, right: false },
      { label: 'DESTINATION', defaultW: 200, expW: 450, sticky: true, freeze: true, right: false },
      { label: 'DISTRICT', defaultW: 100, expW: 200, sticky: false, freeze: false, right: false },
      { label: 'CONTACT NO.', defaultW: 115, expW: 180, sticky: false, freeze: false, right: false },
      { label: 'BRAND', defaultW: 130, expW: 250, sticky: false, freeze: false, right: false },
      ...(isServices ? [{ label: 'COMPLAIN/REQUEST', defaultW: 130, expW: 250, sticky: false, freeze: false, right: false }] : []),
      { label: 'DLR', defaultW: 100, expW: 180, sticky: false, freeze: false, right: false },
      { label: 'INSTALLER', defaultW: 130, expW: 250, sticky: false, freeze: false, right: false },
      { label: 'NOTE', defaultW: 140, expW: 280, sticky: false, freeze: false, right: false },
      { label: 'SERVICE', defaultW: 110, expW: 200, sticky: false, freeze: false, right: false },
      { label: 'UPDATE', defaultW: 150, expW: 350, sticky: false, freeze: false, right: false },
      { label: 'INSTALLATION CHARGES', defaultW: 110, expW: 180, sticky: false, freeze: false, right: true },
      { label: 'MODE OF PAYMENT', defaultW: 100, expW: 160, sticky: false, freeze: false, right: false },
    ]

    let accumulatedLeft = 0
    return rawCols.map(col => {
      const isExpanded = !!expandedCols[col.label]
      const currentWidth = isExpanded ? col.expW : col.defaultW
      const leftVal = col.sticky ? accumulatedLeft : 0

      if (col.sticky) {
        accumulatedLeft += currentWidth
      }

      return {
        ...col,
        isExpanded,
        w: currentWidth,
        left: leftVal
      }
    })
  }, [expandedCols, branchFilter])

  // ── Week helpers ──────────────────────────────────────────────────────────
  const weekRange = useMemo(() => {
    const d = new Date(date + 'T00:00:00')
    const dow = d.getDay()
    const offsetToMonday = dow === 0 ? -6 : 1 - dow
    const monday = new Date(d); monday.setDate(d.getDate() + offsetToMonday)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    const pretty = (x: Date) => x.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return { label: `${pretty(monday)} – ${pretty(sunday)}, ${sunday.getFullYear()}` }
  }, [date])

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
      const hasExplicitTaguigServices = list.some(b => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || name.includes('TAGUIG') && name.includes('SERVICE')
      })

      const newList: BranchOption[] = []
      for (const b of list) {
        const cleanName = b.name.replace(/^(ashcol\s+)/i, '')
        if (b.name.toUpperCase() === 'ASHCOL TAGUIG' || b.name.toUpperCase() === 'TAGUIG') {
          if (!hasExplicitTaguigSales) newList.push({ id: `${b.id}-sales`, name: 'TAGUIG SALES' })
          if (!hasExplicitTaguigServices) newList.push({ id: `${b.id}-services`, name: 'TAGUIG SERVICES' })
        } else {
          newList.push({ id: b.id, name: cleanName })
        }
      }
      newList.sort((a, b) => a.name.localeCompare(b.name))

      let finalList = newList
      if (isAdmin) {
        finalList = [{ id: 'ALL_BRANCHES', name: 'ALL BRANCHES' }, ...newList]
      } else if (isBranchScoped && user?.branchId) {
        finalList = newList.filter(b => b.id === user.branchId || b.id.startsWith(`${user.branchId}-`))
      }
      setBranches(finalList)
    } catch (e) { console.error(e) }
  }, [isBranchScoped, user?.branchId, isAdmin])

  useEffect(() => {
    if (isBranchScoped && user?.branchId && !branchFilter) {
      setBranchFilter(user.branchId)
      return
    }
    if (isAllBranchUser && !branchFilter && branches.length > 0) {
      setBranchFilter(branches[0].id)
    }
  }, [isAllBranchUser, isBranchScoped, user?.branchId, branchFilter, branches])

  useEffect(() => {
    if (!isAdmin) return
    const syncFromGlobal = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      if (gId) {
        setBranchFilter(gId)
      }
    }
    syncFromGlobal()
    window.addEventListener('ashcol-global-branch-change', syncFromGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncFromGlobal)
  }, [isAdmin])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ date, weekly: String(viewMode === 'weekly') })

      let apiBranchId = branchFilter
      if (branchFilter && /-(sales|services)$/i.test(branchFilter)) {
        apiBranchId = branchFilter.replace(/-sales$|-services$/i, '')
      }
      if (apiBranchId && apiBranchId !== 'ALL_BRANCHES') {
        params.set('branchId', apiBranchId)
      }

      const res = await fetch(`${API_BASE_URL}/v1/service-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setRows(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [date, viewMode, branchFilter])

  useEffect(() => { fetchBranches() }, [fetchBranches])
  useEffect(() => { fetchRows() }, [fetchRows])

  // Focus the input after entering edit mode
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select()
      }
    }
  }, [editingCell])

  // ── Cell Display & Editing Helpers ─────────────────────────────────────────

  function getCellDisplay(row: ServiceRow, colLabel: string): string {
    switch (colLabel) {
      case "CUSTOMER'S NAME": return row.customerName || ''
      case 'DESTINATION':     return row.customerAddress || ''
      case 'DISTRICT':        return row.district || ''
      case 'CONTACT NO.':     return row.customerPhone || ''
      case 'BRAND':           return row.unitBrandModel || ''
      case 'COMPLAIN/REQUEST': return row.complainRequest || ''
      case 'DLR':             return row.dealer || ''
      case 'INSTALLER':       return row.technicianName || ''
      case 'NOTE':            return row.note || ''
      case 'SERVICE':         return row.serviceColumn || ''
      case 'UPDATE':          return row.remarks || ''
      case 'INSTALLATION CHARGES': return row.amountCharged != null ? String(row.amountCharged) : ''
      case 'MODE OF PAYMENT':      return row.paymentStatus || ''
      default: return ''
    }
  }

  const startEdit = (row: ServiceRow, col: string) => {
    if (!canEdit || !EDITABLE_COLS.includes(col)) return
    const val = getCellDisplay(row, col)
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
    }

    if (col === 'MODE OF PAYMENT') {
      if (value === 'FREE' || value === 'FREE INSTALL') {
        localPatch.amountCharged = 0
      }
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
        branchId: mergedFields.branchId ? mergedFields.branchId.replace(/-sales$|-services$/, '') : null
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
      fetchRows()
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
      const inputSt    = { backgroundColor: inputBg, border: `1.5px solid ${inputBorder}`, color: textPrimary }

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
            onChange={e => setCellValue(e.target.value)}
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
          type={label === 'INSTALLATION CHARGES' ? 'number' : label === 'CONTACT NO.' ? 'tel' : 'text'}
          value={cellValue}
          onChange={e => setCellValue(e.target.value)}
          onBlur={() => saveCell(r.id, label, cellValue)}
          onKeyDown={e => handleKeyDown(e, r.id, label)}
          className={inputClass} style={inputSt} />
      )
    }

    const val = getCellDisplay(r, label)
    const truncStyle: React.CSSProperties = col.isExpanded
      ? { wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.5 }
      : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }

    const editHint: React.CSSProperties = isEditable && canEdit
      ? { cursor: 'text' } : {}

    if (label === "CUSTOMER'S NAME") {
      return (
        <div style={{ ...truncStyle, ...editHint }} title={val} className="flex items-center gap-1.5 justify-between">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span style={{ color: textMuted, fontSize: '10px', marginRight: 5 }}>{idx + 1}</span>
              <span className="font-semibold truncate">{val}</span>
            </div>
            {branchFilter === 'ALL_BRANCHES' && r.branchName && (
              <span className="text-[9px] px-1 py-0.5 rounded font-bold w-fit uppercase mt-0.5"
                    style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                {r.branchName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setDetailRow(r)
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all shrink-0 hover:scale-[1.03]"
            title="View Details"
          >
            <Eye className="w-3 h-3" />
            <span>DETAILS</span>
          </button>
        </div>
      )
    }

    if (label === 'DESTINATION') {
      return (
        <span className={col.isExpanded ? "leading-relaxed break-words block" : "line-clamp-2 leading-relaxed block"} title={val}>
          {val}
        </span>
      )
    }

    if (label === 'CONTACT NO.') {
      return <FormatPhone raw={val} />
    }

    if (label === 'SERVICE') {
      return (
        <span className="text-[10px] font-semibold uppercase block text-center" style={{ color: textPrimary }}>
          {val || '—'}
        </span>
      )
    }

    if (label === 'MODE OF PAYMENT') {
      return (
        <span className="text-[10px] font-semibold uppercase block text-center" style={{ color: textPrimary }}>
          {val || ''}
        </span>
      )
    }

    if (label === 'INSTALLATION CHARGES') {
      return <span style={{ ...truncStyle, fontWeight: 600 }}>{val ? parseFloat(val).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : ''}</span>
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

    // Auto-detect date from filename and update the date picker
    const detectedDate = guessDateFromFilename(file.name)
    if (detectedDate && detectedDate !== date) {
      setDate(detectedDate)
    }

    if (isBranchScoped) {
      runImport(file, user?.branchId || '')
    } else {
      const detectedId = guessBranchFromFilename(file.name)
      if (detectedId && detectedId !== branchFilter) setBranchFilter(detectedId)
      setPendingImport({
        file,
        branchId: detectedId || branchFilter || (branches[0]?.id || ''),
        detectedDate: detectedDate || null,
      })
      console.info(`[Import] "${file.name}" → branch: ${branches.find(b => b.id === detectedId)?.name || '?'}, date: ${detectedDate || 'not detected'}`)
    }
  }


  const runImport = async (file: File, branchId: string) => {
    if (!isBranchScoped && !branchId) {
      alert('Please pick a target branch')
      return
    }
    const targetDate = date
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
        params.set('branchId', branchId.replace(/-sales$|-services$/, ''))
      }
      const url = `${API_BASE_URL}/v1/service-reports/import?${params.toString()}`
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (res.ok) {
        const result = await res.json()
        const importedDate = (result?.date as string) || targetDate
        const sheetMsg = result?.sheet ? ` (sheet "${result.sheet}")` : ''
        alert(`${result.message || 'Import successful!'}${sheetMsg}`)
        if (importedDate !== date) setDate(importedDate); else fetchRows()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Import failed (HTTP ${res.status})`)
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
        alert(err.error || `Delete failed (HTTP ${res.status})`)
        return
      }
      fetchRows()
    } catch (e) {
      console.error(e); alert('Network error while deleting')
    }
  }

  const handleClearAll = async () => {
    if (!isAdmin) {
      alert('Access denied: Only administrator accounts can clear all records.')
      return
    }
    // Strip the -sales/-services virtual suffix to get the real branch UUID
    const realBranchId = branchFilter ? branchFilter.replace(/-sales$|-services$/, '') : ''
    if (!realBranchId) { alert('No branch selected'); return }
    const branchLabel = branches.find(b => b.id === branchFilter)?.name || realBranchId
    const prettyDate = new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const confirmed = window.confirm(
      `⚠️ DANGER ZONE\n\nPermanently delete all ${visible.length} service record${visible.length !== 1 ? 's' : ''} for ${branchLabel} on ${prettyDate}?\n\nThis CANNOT be undone.`
    )
    if (!confirmed) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ branchId: branchFilter, date })
      const res = await fetch(`${API_BASE_URL}/v1/service-reports?${params}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Clear failed (HTTP ${res.status})`)
        return
      }
      const result = await res.json()
      alert(`Deleted ${result.deleted} service record${result.deleted !== 1 ? 's' : ''} for ${branchLabel}.`)
      fetchRows()
    } catch (e) {
      console.error(e); alert('Network error while clearing records')
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
      r.reportDate, amt, amtPeso,
    ].filter(Boolean).join(' ').toLowerCase()
  }

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let filtered = rows

    if (branchFilter && branchFilter.endsWith('-sales')) {
      filtered = rows.filter(r => {
        const type = (r.serviceType || '').toUpperCase()
        const code = (r.statusCode || '').toUpperCase()
        return type.includes('INSTALL') || code === 'I'
      })
    } else if (branchFilter && branchFilter.endsWith('-services')) {
      filtered = rows.filter(r => {
        const type = (r.serviceType || '').toUpperCase()
        const code = (r.statusCode || '').toUpperCase()
        return !type.includes('INSTALL') && code !== 'I'
      })
    }

    if (!q) return filtered
    return filtered.filter(r => rowSearchBlob(r).includes(q))
  }, [rows, searchQuery, branchFilter])

  const totals = useMemo(() => visible.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      qty: acc.qty + (r.quantity || 0),
      amount: acc.amount + (r.amountCharged || 0),
      completed: acc.completed + (r.jobStatus === 'COMPLETED' ? 1 : 0),
      cancelled: acc.cancelled + (r.jobStatus === 'CANCELLED' ? 1 : 0),
      freeInstalls: acc.freeInstalls + (r.freeInstallation ? 1 : 0),
    }),
    { count: 0, qty: 0, amount: 0, completed: 0, cancelled: 0, freeInstalls: 0 }
  ), [visible])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pb-8" onClick={() => setContextMenu(null)}>

      {/* Thinner, simple design header controls */}
      <div
        className="rounded-2xl p-3 px-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        {/* Left Side: Date picker & Branch filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Filter */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold shadow-sm cursor-not-allowed bg-slate-100 dark:bg-slate-900/50"
              style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', borderColor: inputBorder }}>
              <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
              <select
                value={branchFilter}
                onChange={e => {
                  const val = e.target.value
                  setBranchFilter(val)
                }}
                disabled={true}
                className="bg-transparent outline-none text-xs font-bold cursor-not-allowed pr-1"
                style={{
                  color: textMuted,
                  backgroundColor: 'transparent',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  appearance: 'none',
                }}
              >
                {branches.map(b => (
                  <option
                    key={b.id}
                    value={b.id}
                    style={{
                      backgroundColor: inputBg,
                      color: textPrimary,
                      WebkitTextFillColor: textPrimary,
                    }}
                  >
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Picker inline */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-sm"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
            <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <div className="flex items-center gap-1.5">
              {viewMode !== 'weekly' && (
                <span className="uppercase tracking-wider text-[9px] font-black opacity-60 border-r pr-1.5" style={{ borderColor: border }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short' })}
                </span>
              )}
              {viewMode === 'weekly' ? (
                <span className="tracking-tight">{weekRange.label}</span>
              ) : (
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer font-bold" style={{ color: textPrimary }} />
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Search bar & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search bar */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border flex-1 min-w-[150px] max-w-xs md:max-w-sm shadow-sm"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-xs flex-1 font-medium"
              style={{ color: textPrimary }}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} title="Clear"
                className="shrink-0 p-0.5 rounded hover:bg-slate-200/20" style={{ color: textMuted }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action buttons wrapper */}
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <>
                <button type="button"
                  onClick={handleAddRowInline}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs border hover:opacity-80 transition-all"
                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}>
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
                <button type="button"
                  onClick={() => setScanModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs border hover:opacity-80 transition-all animate-pulse-subtle"
                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}>
                  <Scan className="w-3.5 h-3.5 text-emerald-500" /> Scan Image
                </button>
              </>
            )}

            {canImport && (
              <>
                <input type="file" accept=".xlsx,.xls" id="svc-import-input" className="hidden" onChange={handleImportFilePicked} />
                <button id="svc-import-btn" type="button" disabled={importing || viewMode === 'weekly'}
                  onClick={() => document.getElementById('svc-import-input')?.click()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold text-xs border transition-all hover:opacity-80 disabled:opacity-60 shrink-0"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                  <Upload className={`w-3.5 h-3.5 ${importing ? 'animate-bounce' : ''}`} style={{ color: textMuted }} />
                  {importing ? 'Importing…' : 'Import'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Simplified compact stats bar */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold px-5 py-3 rounded-2xl border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}>
          <span style={{ color: textMuted }}>REPORT SUMMARY:</span>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Records:</span>
            <span style={{ color: textPrimary }}>{totals.count}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Units:</span>
            <span style={{ color: textPrimary }}>{totals.qty}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Charged:</span>
            <span style={{ color: textPrimary }}>₱{peso(totals.amount)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Free Installs:</span>
            <span style={{ color: textPrimary }}>{totals.freeInstalls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Completed:</span>
            <span style={{ color: textPrimary }}>{totals.completed}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Cancelled:</span>
            <span style={{ color: textPrimary }}>{totals.cancelled}</span>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              {searchQuery.trim()
                ? `No records match “${searchQuery.trim()}”${rows.length > 0 ? ` (${rows.length} loaded)` : ''}`
                : `No service records for ${viewMode === 'weekly' ? weekRange.label : 'this date'}`}
            </p>
            {searchQuery.trim() ? (
              <button type="button" onClick={() => setSearchQuery('')}
                className="text-xs font-bold hover:underline" style={{ color: textPrimary }}>Clear search</button>
            ) : canEdit && (
              <button onClick={handleAddRowInline}
                className="text-xs font-bold hover:underline" style={{ color: textPrimary }}>+ Add the first one</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            <table className="text-xs" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                  {columns.map(col => (
                    <th key={col.label}
                      onClick={() => toggleColumn(col.label)}
                      title={`Click to ${col.isExpanded ? 'collapse' : 'expand'} column`}
                      style={{
                        padding: '9px 10px',
                        textAlign: col.right ? 'right' : 'left',
                        color: col.isExpanded ? textPrimary : textMuted,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        borderRight: `1px solid ${border}`,
                        borderBottom: `2px solid ${border}`,
                        fontSize: '10px',
                        letterSpacing: '0.07em',
                        width: col.w,
                        minWidth: col.w,
                        maxWidth: col.w,
                        backgroundColor: inputBg,
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'all 0.15s ease-in-out',
                        ...(col.sticky ? {
                          position: 'sticky' as const,
                          left: col.left,
                          zIndex: 15,
                        } : {}),
                        ...(col.freeze ? {
                          borderRight: `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                          boxShadow: isLight
                            ? '6px 0 12px -3px rgba(0, 0, 0, 0.12), 2px 0 4px -2px rgba(0, 0, 0, 0.05)'
                            : '8px 0 18px -4px rgba(0, 0, 0, 0.45), 3px 0 6px -3px rgba(0, 0, 0, 0.25)',
                        } : {}),
                      }}>
                      <div className={`flex items-center gap-1.5 ${col.right ? 'flex-row-reverse justify-start' : 'justify-between'}`}>
                        <span>{col.label}</span>
                        <span className="text-[9px] opacity-60 transition-transform duration-200" style={{ transform: col.isExpanded ? 'rotate(180deg)' : 'none' }}>
                          {col.isExpanded ? '◀' : '▶'}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, idx) => {
                  const rowBaseBg = contextMenu?.row.id === r.id
                    ? (isLight ? '#f1f5f9' : '#111827')
                    : (idx % 2 === 0 ? (isLight ? '#ffffff' : '#0A1120') : (isLight ? '#fafafa' : '#0d1626'))
                  const rowHoverBg = isLight ? '#f1f5f9' : '#0f1e36'

                  return (
                    <tr key={r.id}
                      onContextMenu={e => {
                        e.preventDefault()
                        if (canEdit || canDelete) setContextMenu({ x: e.clientX, y: e.clientY, row: r })
                      }}
                      onDoubleClick={() => setDetailRow(r)}
                      style={{
                        borderBottom: `1px solid ${border}`,
                        backgroundColor: rowBaseBg,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowHoverBg }) }}
                      onMouseLeave={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowBaseBg }) }}
                      className="transition-colors">

                      {columns.map((col) => {
                        const isThisEditing = editingCell?.rowId === r.id && editingCell?.col === col.label
                        const isEditable    = EDITABLE_COLS.includes(col.label) && canEdit
                        return (
                          <td key={col.label}
                              onClick={e => {
                                e.stopPropagation()
                                if (isEditable && !isThisEditing) startEdit(r, col.label)
                              }}
                              style={{
                                padding: isThisEditing ? '4px 6px' : '8px 10px',
                                color: textPrimary,
                                fontSize: '11px', fontWeight: 500,
                                backgroundColor: isThisEditing ? inputBg : rowBaseBg,
                                textAlign: col.right ? 'right' : 'left',
                                borderRight: col.freeze
                                  ? `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}`
                                  : `1px solid ${border}`,
                                borderBottom: `1px solid ${border}`,
                                width: col.w, minWidth: col.w, maxWidth: col.w,
                                transition: 'background-color 0.1s ease',
                                cursor: isEditable && !isThisEditing ? 'text' : 'default',
                                verticalAlign: 'top',
                                ...(col.sticky ? { position: 'sticky' as const, left: col.left, zIndex: 5 } : {}),
                                ...(col.freeze ? { boxShadow: isLight ? '6px 0 12px -3px rgba(0,0,0,0.10)' : '8px 0 18px -4px rgba(0,0,0,0.40)' } : {}),
                              }}>
                            {renderCell(r, col, idx)}
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

        {/* ── Clear records footer ── */}
        {isAdmin && visible.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3"
            style={{ borderTop: `1px solid ${border}`, backgroundColor: inputBg }}>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textPrimary }}>Clear Records</span>
              <span className="text-xs" style={{ color: textMuted }}>
                Permanently deletes all{' '}
                <strong style={{ color: textPrimary }}>{visible.length}</strong>{' '}
                record{visible.length !== 1 ? 's' : ''} for{' '}
                <strong style={{ color: textPrimary }}>
                  {branches.find(b => b.id === branchFilter)?.name || 'this branch'}
                </strong>{' '}on{' '}
                <strong style={{ color: textPrimary }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </strong>. This cannot be undone.
              </span>
            </div>
            <button type="button" onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 ml-4"
              style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = inputBg }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = cardBg }}>
              <Trash2 className="w-3.5 h-3.5" /> Clear All Records
            </button>
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
              onClick={() => { setDetailRow(contextMenu.row); setContextMenu(null) }}>
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
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>{' '}will be replaced. You can change the branch below if needed.
              </p>
              <Field label="Target Branch" required>
                <select value={pendingImport.branchId}
                  onChange={e => setPendingImport({ ...pendingImport, branchId: e.target.value })}
                  disabled={true}
                  className="w-full rounded-lg px-3 py-2 text-xs font-semibold cursor-not-allowed bg-slate-100 dark:bg-slate-900/50"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', border: `1px solid ${inputBorder}`, color: textMuted }}>
                  <option value="">— Choose branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button onClick={() => setPendingImport(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border"
                style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={() => runImport(pendingImport.file, pendingImport.branchId)}
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
                        {branches.find(b => b.id === branchFilter)?.name || 'None'}
                      </span>
                      <span style={{ color: textMuted }}>Date:</span>
                      <span className="font-bold" style={{ color: textPrimary }}>
                        {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
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
                          let realBranchId = branchFilter ? branchFilter.replace(/-sales$|-services$/, '') : null
                          if (realBranchId === 'ALL_BRANCHES') {
                            const actualBranch = branches.find(b => b.id !== 'ALL_BRANCHES')
                            realBranchId = actualBranch ? actualBranch.id : null
                          }
                          const newRow = {
                            id: tempId,
                            branchId: realBranchId,
                            reportDate: date,
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
      {detailRow && detailForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setDetailRow(null)}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>
                {canEdit ? 'Edit Service Record Details' : 'Service Record Details'}
              </h3>
              <button onClick={() => setDetailRow(null)} className="p-1.5 rounded-lg hover:bg-slate-200/20" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
              {/* Customer Info Section */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Customer Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Customer Name">
                    {canEdit ? (
                      <input type="text" value={detailForm.customerName || ''} 
                        onChange={e => setDetailForm({ ...detailForm, customerName: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.customerName || '—'}</span>
                    )}
                  </Field>
                  <Field label="Contact No.">
                    {canEdit ? (
                      <input type="text" value={detailForm.customerPhone || ''} 
                        onChange={e => setDetailForm({ ...detailForm, customerPhone: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.customerPhone || '—'}</span>
                    )}
                  </Field>
                  <Field label="Destination/Address" full>
                    {canEdit ? (
                      <textarea value={detailForm.customerAddress || ''} 
                        onChange={e => setDetailForm({ ...detailForm, customerAddress: e.target.value })}
                        rows={2}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 resize-none w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold break-words" style={{ color: textPrimary }}>{detailForm.customerAddress || '—'}</span>
                    )}
                  </Field>
                  <Field label="District">
                    {canEdit ? (
                      <input type="text" value={detailForm.district || ''} 
                        onChange={e => setDetailForm({ ...detailForm, district: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.district || '—'}</span>
                    )}
                  </Field>
                  {((detailForm.branchId && (detailForm.branchId.toLowerCase().includes('service') || detailForm.branchId.toLowerCase().includes('services'))) ||
                    (branchFilter && (branchFilter.toLowerCase().includes('service') || branchFilter.toLowerCase().includes('services')))) && (
                    <Field label="Complain / Request">
                      {canEdit ? (
                        <input type="text" value={detailForm.complainRequest || ''} 
                          onChange={e => setDetailForm({ ...detailForm, complainRequest: e.target.value })}
                          className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.complainRequest || '—'}</span>
                      )}
                    </Field>
                  )}
                  <Field label="Commit Terms">
                    {canEdit ? (
                      <textarea value={detailForm.commitTerms || ''} 
                        onChange={e => setDetailForm({ ...detailForm, commitTerms: e.target.value })}
                        rows={1}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 resize-none w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold break-words" style={{ color: textPrimary }}>{detailForm.commitTerms || '—'}</span>
                    )}
                  </Field>
                </div>
              </div>

              {/* Service & Unit Info Section */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Service & Unit Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Brand">
                    {canEdit ? (
                      <input type="text" value={detailForm.unitBrandModel || ''} 
                        onChange={e => setDetailForm({ ...detailForm, unitBrandModel: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.unitBrandModel || '—'}</span>
                    )}
                  </Field>
                  <Field label="Serial No.">
                    {canEdit ? (
                      <input type="text" value={detailForm.unitSerial || ''} 
                        onChange={e => setDetailForm({ ...detailForm, unitSerial: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.unitSerial || '—'}</span>
                    )}
                  </Field>
                  <Field label="Quantity">
                    {canEdit ? (
                      <input type="number" value={detailForm.quantity != null ? detailForm.quantity : ''} 
                        onChange={e => setDetailForm({ ...detailForm, quantity: parseInt(e.target.value, 10) || 1 })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.quantity ?? '—'}</span>
                    )}
                  </Field>
                  <Field label="Dealer (DLR)">
                    {canEdit ? (
                      <input type="text" value={detailForm.dealer || ''} 
                        onChange={e => setDetailForm({ ...detailForm, dealer: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.dealer || '—'}</span>
                    )}
                  </Field>
                  <Field label="Service Vehicle">
                    {canEdit ? (
                      <input type="text" value={detailForm.serviceColumn || ''} 
                        onChange={e => setDetailForm({ ...detailForm, serviceColumn: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.serviceColumn || '—'}</span>
                    )}
                  </Field>
                  <Field label="Installer / Technician">
                    {canEdit ? (
                      <input type="text" value={detailForm.technicianName || ''} 
                        onChange={e => setDetailForm({ ...detailForm, technicianName: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.technicianName || '—'}</span>
                    )}
                  </Field>
                </div>
              </div>

              {/* Workflow & Audit Section */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Workflow & Audit Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Control No. / SI">
                    {canEdit ? (
                      <input type="text" value={detailForm.controlNumber || ''} 
                        onChange={e => setDetailForm({ ...detailForm, controlNumber: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.controlNumber || '—'}</span>
                    )}
                  </Field>
                  <Field label="Papers">
                    {canEdit ? (
                      <input type="text" value={detailForm.papers || ''} 
                        onChange={e => setDetailForm({ ...detailForm, papers: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.papers || '—'}</span>
                    )}
                  </Field>
                  <Field label="Costing">
                    {canEdit ? (
                      <input type="text" value={detailForm.costing || ''} 
                        onChange={e => setDetailForm({ ...detailForm, costing: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.costing || '—'}</span>
                    )}
                  </Field>
                  <Field label="Relay Status">
                    {canEdit ? (
                      <input type="text" value={detailForm.relayStatus || ''} 
                        onChange={e => setDetailForm({ ...detailForm, relayStatus: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.relayStatus || '—'}</span>
                    )}
                  </Field>
                  <Field label="15 Questions (15 Qs)" full>
                    {canEdit ? (
                      <input type="text" value={detailForm.fifteenQuestions || ''} 
                        onChange={e => setDetailForm({ ...detailForm, fifteenQuestions: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.fifteenQuestions || '—'}</span>
                    )}
                  </Field>
                  <Field label="Note" full>
                    {canEdit ? (
                      <textarea value={detailForm.note || ''} 
                        onChange={e => setDetailForm({ ...detailForm, note: e.target.value })}
                        rows={2}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 resize-none w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold break-words" style={{ color: textPrimary }}>{detailForm.note || '—'}</span>
                    )}
                  </Field>
                </div>
              </div>

              {/* Billing & Status Section */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400">
                  Billing & Status
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Installation Charges">
                    {canEdit ? (
                      <input type="number" value={detailForm.amountCharged != null ? detailForm.amountCharged : ''} 
                        onChange={e => setDetailForm({ ...detailForm, amountCharged: parseFloat(e.target.value) || 0 })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>₱{peso(detailForm.amountCharged)}</span>
                    )}
                  </Field>
                  <Field label="Mode of Payment">
                    {canEdit ? (
                      <select value={detailForm.paymentStatus || ''} 
                        onChange={e => setDetailForm({ ...detailForm, paymentStatus: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                        {PAYMENT_MODES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.paymentStatus || '—'}</span>
                    )}
                  </Field>
                  <Field label="Job Status">
                    {canEdit ? (
                      <select value={detailForm.jobStatus || ''} 
                        onChange={e => setDetailForm({ ...detailForm, jobStatus: e.target.value })}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                        {['SCHEDULED', 'COMPLETED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{detailForm.jobStatus || '—'}</span>
                    )}
                  </Field>
                  <Field label="Update (Remarks)" full>
                    {canEdit ? (
                      <textarea value={detailForm.remarks || ''} 
                        onChange={e => setDetailForm({ ...detailForm, remarks: e.target.value })}
                        rows={2}
                        className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-400 resize-none w-full"
                        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <span className="text-xs font-semibold break-words" style={{ color: textPrimary }}>{detailForm.remarks || '—'}</span>
                    )}
                  </Field>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button onClick={() => setDetailRow(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border"
                style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                {canEdit ? 'Cancel' : 'Close'}
              </button>
              {canEdit && (
                <button onClick={() => handleSaveDetailRow(detailForm)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border"
                  style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}>
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
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
