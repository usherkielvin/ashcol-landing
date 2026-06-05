import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import {
  Search, FileSpreadsheet, AlertTriangle, X, FileText, Loader2,
  Building2, Trash2, User, MapPin, Wrench,
  ChevronDown, Plus, CheckCircle2, AlertCircle, Package, FileUp, Filter,
  Printer, Eye, Phone, LayoutGrid, List, CheckSquare, Square, Edit3
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import * as XLSX from 'xlsx'

interface Ticket {
  id: string
  customerId: string
  customerName?: string
  customerEmail?: string
  customerPersonalEmail?: string
  title: string
  description: string
  serviceType: string
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
  warrantyRegistrationCompleted?: boolean
  warrantyRegistrationCompletedAt?: string
  warrantyRegistrationCompletedBy?: string
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

export default function ClientMasterlist() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'

  // Colors
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const pageBg = isLight ? '#f1f5f9' : '#060B18'
  const compactInput = `w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none transition-all duration-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20`

  // State
  const [tickets, setTickets] = useState<Ticket[]>([])
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
    else if (idLower === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b' || idLower === 'br-taguig-sales' || idLower === 'br-taguig-services' || idLower === 'br-taguig') keyword = 'taguig'
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

  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [storeFilter, setStoreFilter] = useState('ALL')
  const [branchFilter, setBranchFilter] = useState('ALL')
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNASSIGNED' | 'PENDING' | 'INSTALLED' | 'CANCELLED'>('ALL')
  const [relayView, setRelayView] = useState<'DETAILS' | 'SUMMARY'>('DETAILS')
  const [ticketScope, setTicketScope] = useState<'ALL' | 'MY' | 'BRANCH'>('ALL')

  // New States for Row-click Quick Actions and read-only Job Sheet View
  const [selectedPreviewTicket, setSelectedPreviewTicket] = useState<Ticket | null>(null)
  const [selectedColIndex, setSelectedColIndex] = useState<number>(-1)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

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
  const [addForm, setAddForm] = useState({
    title: 'S/I service',
    description: '',
    serviceType: 'S/I',
    customerName: '',
    contactPhone: '',
    locationRaw: '',
    sourceVendor: 'Robinsons',
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
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Action Drawer / Assign Modal State
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [isActionDrawerOpen, setIsActionDrawerOpen] = useState(false)
  const [assignBranchId, setAssignBranchId] = useState('')
  const [assignTechId, setAssignTechId] = useState('')
  const [updateStatus, setUpdateStatus] = useState('')
  const [actionSaving, setActionSaving] = useState(false)

  // Edit Modal / Drawer spreadsheet fields
  const [editLocation, setEditLocation] = useState('')
  const [editPreferredDate, setEditPreferredDate] = useState('')
  const [editPriorityTag, setEditPriorityTag] = useState('')
  const [editDistrict, setEditDistrict] = useState('')
  const [editCommitType, setEditCommitType] = useState('')
  const [editInstallerName, setEditInstallerName] = useState('')
  const [editServiceVehicle, setEditServiceVehicle] = useState('')
  const [editRemarksUpdate, setEditRemarksUpdate] = useState('')
  const [editInstallationCharges, setEditInstallationCharges] = useState(0)
  const [editModeOfPayment, setEditModeOfPayment] = useState('')
  const [editControlNumber, setEditControlNumber] = useState('')
  const [editContactPhone, setEditContactPhone] = useState('')
  const [editSourceVendor, setEditSourceVendor] = useState('')
  const [editUnitType, setEditUnitType] = useState('')
  const [editServiceType, setEditServiceType] = useState('')
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editLandmarks, setEditLandmarks] = useState('')
  const [editBrand, setEditBrand] = useState('')
  const [editCapacity, setEditCapacity] = useState('')
  const [editSku, setEditSku] = useState('')
  const [editSerialNumber, setEditSerialNumber] = useState('')
  const [editAlternatePhone, setEditAlternatePhone] = useState('')
  const [editImages, setEditImages] = useState('')
  const [editRelayedDate, setEditRelayedDate] = useState('')
  const [editFinalDate, setEditFinalDate] = useState('')
  const [editWarrantyRegistrationCompleted, setEditWarrantyRegistrationCompleted] = useState(false)

  // Column configuration for expand / collapse functionality
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})

  const toggleColumn = useCallback((colLabel: string) => {
    setExpandedCols(prev => ({
      ...prev,
      [colLabel]: !prev[colLabel]
    }))
  }, [])

  const columns = useMemo(() => {
    const rawCols = [
      { label: 'NO',                defaultW: 54,  expW: 70,  sticky: true,  freeze: false, center: true,  right: false },
      { label: 'TICKET NO',         defaultW: 112, expW: 180, sticky: true,  freeze: false, center: true,  right: false },
      { label: 'STATUS',            defaultW: 118, expW: 170, sticky: true,  freeze: true,  center: true,  right: false },
      { label: 'CATEGORY',          defaultW: 110, expW: 180, sticky: false, freeze: false, center: true,  right: false },
      { label: 'BRANCH ASSIGNED',   defaultW: 130, expW: 220, sticky: false, freeze: false, center: true,  right: false },
      { label: 'NEGOTIATOR',        defaultW: 130, expW: 220, sticky: false, freeze: false, center: true,  right: false },
      { label: 'CUSTOMER NAME',     defaultW: 165, expW: 280, sticky: false, freeze: false, center: false, right: false },
      { label: 'DISTRICT',          defaultW: 120, expW: 220, sticky: false, freeze: false, center: true,  right: false },
      { label: 'STORE',             defaultW: 135, expW: 220, sticky: false, freeze: false, center: false, right: false },
      { label: 'BRAND',             defaultW: 105, expW: 180, sticky: false, freeze: false, center: true,  right: false },
      { label: 'CAPACITY',          defaultW: 100, expW: 150, sticky: false, freeze: false, center: true,  right: false },
      { label: 'COMMIT',            defaultW: 140, expW: 240, sticky: false, freeze: false, center: true,  right: false },
      { label: 'DATE RELAYED',      defaultW: 120, expW: 170, sticky: false, freeze: false, center: true,  right: false },
      { label: 'REQUESTED SCHEDULE', defaultW: 150, expW: 200, sticky: false, freeze: false, center: true,  right: false },
      { label: 'FINAL SCHEDULE',    defaultW: 135, expW: 190, sticky: false, freeze: false, center: true,  right: false },
      { label: 'LAST UPDATE',       defaultW: 230, expW: 420, sticky: false, freeze: false, center: false, right: false },
      { label: 'ACTIONS',           defaultW: 90,  expW: 90,  sticky: false, freeze: false, center: false, right: true  },
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
  }, [expandedCols])

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ticket: Ticket } | null>(null)

  // Close context menu on any mouse down
  useEffect(() => {
    const handleClose = () => setContextMenu(null)
    window.addEventListener('mousedown', handleClose)
    return () => window.removeEventListener('mousedown', handleClose)
  }, [])

  // Load Initial Data
  const fetchData = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const endpoint = ticketScope === 'MY'
        ? '/tickets/assigned'
        : ticketScope === 'BRANCH'
          ? '/tickets/branch'
          : '/tickets'
      
      // Fetch Tickets
      const ticketRes = await fetch(`${API_BASE_URL}${endpoint}?page=0&size=100`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (ticketRes.ok) {
        const payload = await ticketRes.json()
        const tList = payload?.data?.tickets || payload?.tickets || []
        setTickets(tList)
      }

      // Fetch Branches
      const branchRes = await fetch(`${API_BASE_URL}/branches`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (branchRes.ok) {
        const payload = await branchRes.json()
        setBranches(payload?.data || payload || [])
      }

    } catch (e) {
      console.error('Error fetching data:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [ticketScope])

  useEffect(() => {
    if (role !== 'admin') return
    const syncFromGlobal = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      if (gId) {
        const cleanBranchId = gId.replace(/-(sales|services)$/, '')
        setBranchFilter(cleanBranchId)
      } else {
        setBranchFilter('ALL')
      }
    }
    syncFromGlobal()
    window.addEventListener('ashcol-global-branch-change', syncFromGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncFromGlobal)
  }, [role])

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

        setAddForm({
          title: `${mappedSvc} service`,
          description: parsed.description || 'Voucher scanned via Gemini AI.',
          serviceType: mappedSvc,
          customerName: customerNameVal,
          contactPhone: contactPhoneVal,
          locationRaw: locationVal,
          sourceVendor: parsed.sourceVendor || 'Robinsons',
          unitType: parsed.unitType || (brandVal && capacityVal ? `${brandVal} ${capacityVal}` : 'Split AC'),
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
              location: getVal(row, colIndices.location),
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
            location: item.location,
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
    fetchData()
  }

  // Submit parsed/manual ticket
  const handleFormCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormSubmitting(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const acDetailsObj = {
        landmarks: addForm.landmarks || '',
        brand: addForm.brand || '',
        capacity: addForm.capacity || '',
        sku: addForm.sku || '',
        serialNumber: addForm.serialNumber || '',
        alternatePhone: addForm.alternatePhone || '',
        relayedDate: addForm.relayedDate || '',
        finalDate: addForm.finalDate || ''
      }
      const isCollectionTicket = /collect/i.test(`${addForm.serviceType} ${addForm.title}`)
      const res = await fetch(`${API_BASE_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: addForm.title,
          description: addForm.description || addForm.remarksUpdate || 'Manual client ticket',
          customerName: addForm.customerName,
          serviceType: addForm.serviceType,
          unitType: addForm.unitType,
          contactPhone: addForm.contactPhone,
          location: addForm.locationRaw,
          sourceVendor: addForm.sourceVendor,
          preferredDate: addForm.preferredDate || undefined,
          slaExpirationDate: addForm.slaExpirationDate ? new Date(addForm.slaExpirationDate).toISOString() : undefined,
          priorityTag: addForm.priorityTag || undefined,
          district: addForm.district || undefined,
          commitType: addForm.commitType || undefined,
          installerName: addForm.installerName || undefined,
          serviceVehicle: addForm.serviceVehicle || undefined,
          remarksUpdate: addForm.remarksUpdate || undefined,
          installationCharges: isCollectionTicket ? (Number(addForm.installationCharges) || 0) : 0,
          modeOfPayment: isCollectionTicket ? (addForm.modeOfPayment || undefined) : undefined,
          controlNumber: addForm.controlNumber || undefined,
          acDetails: JSON.stringify(acDetailsObj),
          images: addForm.images || undefined,
          status: addForm.status,
          branchId: ((addForm.status !== 'PENDING' || isCollectionTicket) && addForm.status !== 'CANCELLED') ? (addForm.branchId || undefined) : undefined
        })
      })

      if (!res.ok) throw new Error('Create request failed')

      setIsAddModalOpen(false)
      setAddForm({
        title: 'Installation service',
        description: '',
        serviceType: 'Installation',
        customerName: '',
        contactPhone: '',
        locationRaw: '',
        sourceVendor: 'Robinsons',
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
      fetchData()
    } catch (e) {
      alert('Could not submit ticket.')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Save changes in action drawer
  const handleDrawerActionSave = async () => {
    if (!selectedTicket) return
    setActionSaving(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const payload: Record<string, any> = {}
      const keepPendingAssignment = selectedTicket && getTicketCategory(selectedTicket) === 'Collection'

      if ((updateStatus === 'PENDING' && !keepPendingAssignment) || updateStatus === 'CANCELLED') {
        payload.branchId = ""
        payload.assignedTo = ""
        payload.status = updateStatus
      } else {
        if (assignBranchId !== (selectedTicket.branchId || '')) {
          payload.branchId = assignBranchId || ""
        }
        if (assignTechId !== (selectedTicket.assignedTo || '')) {
          payload.assignedTo = assignTechId || ""
        }
        if (updateStatus && updateStatus !== selectedTicket.status) {
          payload.status = updateStatus
        }
      }
      
      // Update spreadsheet fields
      payload.customerName = editCustomerName || null
      payload.location = editLocation || null
      payload.preferredDate = editPreferredDate ? new Date(editPreferredDate).toISOString() : null
      payload.priorityTag = editPriorityTag || null
      payload.district = editDistrict || null
      payload.commitType = editCommitType || null
      payload.installerName = editInstallerName || null
      payload.serviceVehicle = editServiceVehicle || null
      payload.remarksUpdate = editRemarksUpdate || null
      payload.installationCharges = Number(editInstallationCharges)
      payload.modeOfPayment = editModeOfPayment || null
      payload.controlNumber = editControlNumber || null
      if (editWarrantyRegistrationCompleted !== Boolean(selectedTicket.warrantyRegistrationCompleted)) {
        payload.warrantyRegistrationCompleted = editWarrantyRegistrationCompleted
      }
      
      const acDetailsObj = {
        landmarks: editLandmarks || '',
        brand: editBrand || '',
        capacity: editCapacity || '',
        sku: editSku || '',
        serialNumber: editSerialNumber || '',
        alternatePhone: editAlternatePhone || '',
        relayedDate: editRelayedDate || '',
        finalDate: editFinalDate || ''
      }
      payload.acDetails = JSON.stringify(acDetailsObj)
      payload.images = editImages || null
      payload.contactPhone = editContactPhone || null
      payload.sourceVendor = editSourceVendor || null
      payload.unitType = editUnitType || null
      payload.serviceType = editServiceType || null

      const res = await fetch(`${API_BASE_URL}/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        const errMsg = errData?.message || errData?.error || `Status ${res.status}`
        throw new Error(errMsg)
      }

      setIsActionDrawerOpen(false)
      setSelectedTicket(null)
      fetchData()
    } catch (e: any) {
      alert(`Failed to update ticket action: ${e.message}`)
    } finally {
      setActionSaving(false)
    }
  }

  const handleDeleteTicket = async (ticketId: string, customerName?: string) => {
    if (!window.confirm(`Are you sure you want to delete the client ticket for "${customerName || 'Direct Client'}"?\n\nThis action cannot be undone.`)) return
    
    setActionSaving(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `Failed to delete ticket (HTTP ${res.status})`)
      }

      setIsActionDrawerOpen(false)
      setSelectedTicket(null)
      fetchData()
    } catch (err: any) {
      alert(err.message || 'Error occurred while deleting ticket.')
    } finally {
      setActionSaving(false)
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
    fetchData()
    alert(`Deleted ${successCount} of ${count} client ticket${count !== 1 ? 's' : ''}.${failCount > 0 ? ` (${failCount} failed)` : ''}`)
  }

  // Open action drawer for a ticket
  const openDrawer = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setAssignBranchId(resolveBranch(ticket.branchId)?.id || '')
    setEditCustomerName(ticket.customerName || '')
    setEditLocation(ticket.location || '')
    setEditPreferredDate(ticket.preferredDate ? ticket.preferredDate.split('T')[0] : '')
    setAssignTechId(ticket.assignedTo || '')
    setUpdateStatus(ticket.status)
    setEditPriorityTag(ticket.priorityTag || '')
    setEditDistrict(ticket.district || '')
    setEditCommitType(ticket.commitType || '')
    setEditInstallerName(ticket.installerName || '')
    setEditServiceVehicle(ticket.serviceVehicle || '')
    setEditRemarksUpdate(ticket.remarksUpdate || '')
    setEditInstallationCharges(ticket.installationCharges || 0)
    setEditModeOfPayment(ticket.modeOfPayment || '')
    setEditControlNumber(ticket.controlNumber || '')
    setEditContactPhone(ticket.contactPhone || '')
    setEditSourceVendor(ticket.sourceVendor || '')
    setEditUnitType(ticket.unitType || '')
    setEditServiceType(ticket.serviceType || '')

    // Parse acDetails JSON
    let parsedDetails = { landmarks: '', brand: '', capacity: '', sku: '', serialNumber: '', alternatePhone: '', relayedDate: '', finalDate: '' }
    if (ticket.acDetails) {
      try {
        parsedDetails = { ...parsedDetails, ...JSON.parse(ticket.acDetails) }
      } catch (e) {
        // Safe fallback
      }
    }
    setEditLandmarks(parsedDetails.landmarks || '')
    setEditBrand(parsedDetails.brand || '')
    setEditCapacity(parsedDetails.capacity || '')
    setEditSku(parsedDetails.sku || '')
    setEditSerialNumber(parsedDetails.serialNumber || '')
    setEditAlternatePhone(parsedDetails.alternatePhone || '')
    setEditImages(ticket.images || '')
    setEditRelayedDate(parsedDetails.relayedDate || (ticket.createdAt ? ticket.createdAt.split('T')[0] : ''))
    setEditFinalDate(parsedDetails.finalDate || '')
    setEditWarrantyRegistrationCompleted(Boolean(ticket.warrantyRegistrationCompleted))

    setIsActionDrawerOpen(true)
  }


  // Filtered lists
  const filtered = tickets.filter(t => {
    // Tab filtering
    const stat = t.status.toUpperCase()
    const isAssigned = !!t.assignedTo || !!t.branchId

    if (activeTab === 'UNASSIGNED') {
      if (isAssigned || stat === 'COMPLETED' || stat === 'CANCELLED') return false
    } else if (activeTab === 'PENDING') {
      if (!isAssigned || stat === 'COMPLETED' || stat === 'CANCELLED') return false
    } else if (activeTab === 'INSTALLED') {
      const hasCharges = !!(t.installationCharges && t.installationCharges > 0)
      if (stat !== 'COMPLETED' && !hasCharges) return false
    } else if (activeTab === 'CANCELLED') {
      if (stat !== 'CANCELLED') return false
    }

    // Vendor filter
    if (storeFilter !== 'ALL') {
      const vendorLower = (t.sourceVendor || 'Direct').toLowerCase()
      const filterLower = storeFilter.toLowerCase()
      if (!vendorLower.includes(filterLower)) return false
    }

    // Branch filter
    if (branchFilter !== 'ALL') {
      const resolved = resolveBranch(t.branchId)
      if (!resolved || resolved.id !== branchFilter) return false
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

      return (
        custName.includes(q) ||
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
  })

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

  const parseAcDetails = (ticket: Ticket) => {
    const fallback = { landmarks: '', brand: '', capacity: '', sku: '', serialNumber: '', alternatePhone: '', relayedDate: '', finalDate: '' }
    if (!ticket.acDetails) return fallback
    try {
      return { ...fallback, ...JSON.parse(ticket.acDetails) }
    } catch (e) {
      return fallback
    }
  }

  const formatShortDate = (value?: string) => {
    if (!value) return ''
    try {
      const d = new Date(value)
      if (isNaN(d.getTime())) return value
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch (e) {
      return value
    }
  }

  const getRelayStatusLabel = (ticket: Ticket) => {
    const status = (ticket.status || '').toUpperCase()
    const details = parseAcDetails(ticket)
    if (getTicketCategory(ticket) === 'Collection' && !isCollectionPaid(ticket)) return 'Pending'
    if (status === 'CANCELLED') return 'Cancelled'
    if (status === 'COMPLETED' || !!(ticket.installationCharges && ticket.installationCharges > 0)) return 'Installed'
    if ((ticket.branchId || ticket.assignedTo) && details.finalDate) return 'Scheduled'
    if (status === 'ASSIGNED' || ticket.branchId || ticket.assignedTo) return 'Assigned'
    if (status === 'IN_PROGRESS') return 'In Progress'
    if (status === 'ON_THE_WAY') return 'On the Way'
    return 'Pending'
  }

  const getTicketNumber = (ticket: Ticket) => {
    if (ticket.controlNumber) return ticket.controlNumber
    return ticket.id && ticket.id.length > 8 ? ticket.id.substring(0, 8).toUpperCase() : (ticket.id || '').toUpperCase()
  }

  const getTicketCategory = (ticket: Ticket) => {
    const raw = `${ticket.serviceType || ''} ${ticket.title || ''}`.toLowerCase()
    if (raw.includes('collection') || raw.includes('collect')) return 'Collection'
    if (raw.includes('install') || raw.includes('s/i') || raw.includes(' si ')) return 'Installation'
    if (raw.includes('survey')) return 'Survey'
    if (raw.includes('service') || raw.includes('clean')) return 'Service'
    return ticket.serviceType || 'Service'
  }

  const getCategoryColor = (category: string) => {
    const c = category.toLowerCase()
    if (c.includes('collection')) return '#7C3AED'
    if (c.includes('service')) return '#EF4444'
    return isLight ? '#111827' : '#F8FAFC'
  }

  const isCollectionPaid = (ticket: Ticket) => {
    const hasAmount = !!(ticket.installationCharges && ticket.installationCharges > 0)
    const hasPayment = !!(ticket.modeOfPayment && ticket.modeOfPayment.trim())
    const remarks = (ticket.remarksUpdate || '').toLowerCase()
    return hasAmount && (hasPayment || remarks.includes('paid') || remarks.includes('collected'))
  }








  // Helper to determine if a field was auto-extracted from voucher scan
  const isFieldExtracted = (fieldValue: any) => {
    if (!addForm.images) return false
    if (fieldValue === undefined || fieldValue === null) return false
    const str = String(fieldValue).trim()
    if (str === '' || str === '0' || str === '0.00' || str === '00' || str === '000') return false
    if (str === 'Installation' || str === 'Installation service' || str === 'Voucher scanned via Gemini AI.') return false
    return true
  }

  return (
    <div className="flex flex-col gap-5" style={{ minHeight: '100%', backgroundColor: pageBg }}>
      {/* ── Portal: Toolbar into header slot ────────────────── */}
      {ReactDOM.createPortal(
        <div className="flex flex-wrap items-center gap-2 px-5 md:px-8 py-2.5">

          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-not-allowed bg-slate-100 dark:bg-slate-900/50"
            style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', borderColor: inputBorder }}>
            <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              disabled={true}
              className="bg-transparent outline-none text-xs font-semibold cursor-not-allowed"
              style={{ color: textMuted, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 18 }}>
              <option value="ALL">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 shrink-0 -ml-4 pointer-events-none" style={{ color: textMuted }} />
          </div>

          {/* Store Filter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Package className="w-3.5 h-3.5 shrink-0" style={{ color: '#3B82F6' }} />
            <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}
              className="bg-transparent outline-none text-xs font-semibold cursor-pointer"
              style={{ color: textPrimary, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 18 }}>
              <option value="ALL">All Stores</option>
              <option value="Robinsons">Robinsons</option>
              <option value="Abenson">Abenson</option>
              <option value="Direct">Direct Store</option>
            </select>
            <ChevronDown className="w-3 h-3 shrink-0 -ml-4 pointer-events-none" style={{ color: textMuted }} />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <select value={activeTab} onChange={e => setActiveTab(e.target.value as typeof activeTab)}
              className="bg-transparent outline-none text-xs font-semibold cursor-pointer"
              style={{ color: textPrimary, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 18 }}>
              <option value="ALL">All Status</option>
              <option value="UNASSIGNED">Unassigned</option>
              <option value="PENDING">Pending / Scheduled</option>
              <option value="INSTALLED">Installed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <ChevronDown className="w-3 h-3 shrink-0 -ml-4 pointer-events-none" style={{ color: textMuted }} />
          </div>

          <div className="flex items-center rounded-lg border overflow-hidden"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            {[
              { key: 'DETAILS', label: 'Details', icon: List },
              { key: 'SUMMARY', label: 'Summary', icon: LayoutGrid },
            ].map(item => {
              const Icon = item.icon
              const active = relayView === item.key
              return (
                <button key={item.key} type="button" onClick={() => setRelayView(item.key as typeof relayView)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    backgroundColor: active ? (isLight ? '#dcfce7' : 'rgba(16,185,129,0.16)') : 'transparent',
                    color: active ? '#059669' : textMuted,
                    borderRight: item.key === 'DETAILS' ? `1px solid ${inputBorder}` : undefined
                  }}>
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center rounded-lg border overflow-hidden"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            {[
              { key: 'ALL', label: 'All' },
              { key: 'MY', label: 'My Tickets' },
              { key: 'BRANCH', label: 'Branch Tickets' },
            ].map(item => {
              const active = ticketScope === item.key
              return (
                <button key={item.key} type="button" onClick={() => setTicketScope(item.key as typeof ticketScope)}
                  className="px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: active ? (isLight ? '#eef2ff' : 'rgba(99,102,241,0.16)') : 'transparent',
                    color: active ? '#4F46E5' : textMuted,
                    borderRight: item.key !== 'BRANCH' ? `1px solid ${inputBorder}` : undefined
                  }}>
                  {item.label}
                </button>
              )
            })}
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
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button type="button" onClick={() => scanFileInputRef.current?.click()} disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs border transition-all hover:opacity-80 disabled:opacity-60 shrink-0"
              style={{ backgroundColor: isLight ? '#f0fdf4' : 'rgba(16,185,129,0.08)', borderColor: isLight ? '#bbf7d0' : 'rgba(16,185,129,0.25)', color: '#059669' }}>
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
              {scanning ? 'Scanning...' : 'Scan PDF'}
            </button>

            <button type="button" onClick={() => excelFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs border transition-all hover:opacity-80 shrink-0"
              style={{ backgroundColor: isLight ? '#eff6ff' : 'rgba(59,130,246,0.08)', borderColor: isLight ? '#bfdbfe' : 'rgba(59,130,246,0.25)', color: '#2563EB' }}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import Excel
            </button>

            <button type="button" onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs text-white transition-all hover:opacity-90 shadow-sm shrink-0"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
              <Plus className="w-3.5 h-3.5" /> Add Client
            </button>
          </div>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {/* ── Scan Error Banner ──────────────────────────────────── */}
      {scanError && (
        <div className="p-4 rounded-xl border flex items-center justify-between gap-3"
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

      {relayView === 'SUMMARY' ? (
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: `1px solid ${border}` }}>
            <div>
              <h2 className="text-sm font-black" style={{ color: textPrimary }}>Ticket Summary</h2>
              <p className="text-xs mt-0.5" style={{ color: textMuted }}>{filtered.length} ticket{filtered.length !== 1 ? 's' : ''} matching the current filters</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['Service', 'Installation', 'Survey', 'Collection'].map(category => {
                const color = getCategoryColor(category)
                return (
                  <span key={category} className="px-2.5 py-1 rounded-lg text-xs font-black border"
                    style={{ color, backgroundColor: `${color}14`, borderColor: `${color}33` }}>
                    {category}: {filtered.filter(t => getTicketCategory(t) === category).length}
                  </span>
                )
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ backgroundColor: inputBg }}>
                  {['TICKET NO', 'CATEGORY', 'STATUS', 'CUSTOMER', 'BRANCH', 'NEGOTIATOR', 'STORE', 'REQUESTED', 'FINAL', 'PAYMENT', 'ACTION'].map(label => (
                    <th key={label} className="px-3 py-2.5 text-left font-black text-[10px] whitespace-nowrap" style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center" style={{ color: textMuted }}>
                      <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3 text-[#10B981]" />
                      Loading tickets...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center" style={{ color: textMuted }}>No tickets match the current filters.</td>
                  </tr>
                ) : filtered.map((ticket, idx) => {
                  const category = getTicketCategory(ticket)
                  const color = getCategoryColor(category)
                  const details = parseAcDetails(ticket)
                  const status = getRelayStatusLabel(ticket)
                  const paymentText = category === 'Collection'
                    ? (isCollectionPaid(ticket) ? 'Collected' : 'Pending collection')
                    : (ticket.modeOfPayment || (ticket.installationCharges ? `₱${ticket.installationCharges.toLocaleString()}` : '—'))
                  return (
                    <tr key={ticket.id}
                      onClick={() => { setSelectedPreviewTicket(ticket); setIsViewModalOpen(true) }}
                      style={{ backgroundColor: idx % 2 === 0 ? (isLight ? '#ffffff' : '#060B18') : (isLight ? '#fafafa' : '#080f1c'), cursor: 'pointer' }}>
                      <td className="px-3 py-2.5 font-black font-mono whitespace-nowrap max-w-[160px] truncate" title={getTicketNumber(ticket)} style={{ color, borderBottom: `1px solid ${border}` }}>{getTicketNumber(ticket)}</td>
                      <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase border whitespace-nowrap" style={{ color, backgroundColor: `${color}14`, borderColor: `${color}33` }}>{category}</span>
                      </td>
                      <td className="px-3 py-2.5 font-bold whitespace-nowrap" style={{ color: textPrimary, borderBottom: `1px solid ${border}` }}>{status}</td>
                      <td className="px-3 py-2.5 font-bold max-w-[210px] truncate" title={ticket.customerName || 'Direct Client'} style={{ color: textPrimary, borderBottom: `1px solid ${border}` }}>{ticket.customerName || 'Direct Client'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>{resolveBranch(ticket.branchId)?.name || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>{ticket.assignedEmployeeName || ticket.installerName || '—'}</td>
                      <td className="px-3 py-2.5 max-w-[180px] truncate" title={ticket.sourceVendor || ''} style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>{getStoreStyle(ticket.sourceVendor).label}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>{formatShortDate(ticket.preferredDate) || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>{formatShortDate(details.finalDate) || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold" style={{ color: category === 'Collection' && !isCollectionPaid(ticket) ? '#F59E0B' : textMuted, borderBottom: `1px solid ${border}` }}>{paymentText}</td>
                      <td className="px-3 py-2.5 text-right" style={{ borderBottom: `1px solid ${border}` }}>
                        <button type="button" onClick={e => { e.stopPropagation(); setSelectedPreviewTicket(ticket); setIsViewModalOpen(true) }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all hover:border-[#10B981] hover:text-[#10B981]"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}>
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>      ) : (
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          <table className="text-xs" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                {columns.map(col => (
                  <th key={col.label}
                    onClick={() => col.label !== 'ACTIONS' && toggleColumn(col.label)}
                    title={col.label !== 'ACTIONS' ? `Click to ${col.isExpanded ? 'collapse' : 'expand'} column` : undefined}
                    style={{
                      padding: '9px 10px',
                      textAlign: col.right ? 'right' : col.center ? 'center' : 'left',
                      color: col.isExpanded ? (isLight ? '#10B981' : '#34D399') : textMuted,
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
                      cursor: col.label !== 'ACTIONS' ? 'pointer' : 'default',
                      userSelect: 'none',
                      transition: 'all 0.15s ease-in-out',
                      position: 'sticky',
                      top: 0,
                      zIndex: col.sticky ? 25 : 20,
                      ...(col.sticky ? {
                        left: col.left,
                      } : {}),
                      ...(col.freeze ? {
                        borderRight: `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                        boxShadow: isLight
                          ? '6px 0 12px -3px rgba(0, 0, 0, 0.12), 2px 0 4px -2px rgba(0, 0, 0, 0.05)'
                          : '8px 0 18px -4px rgba(0, 0, 0, 0.45), 3px 0 6px -3px rgba(0, 0, 0, 0.25)',
                      } : {}),
                    }}>
                    <div className={`flex items-center gap-1.5 ${col.right ? 'flex-row-reverse justify-start' : col.center ? 'justify-center' : 'justify-between'}`}>
                      <span>{col.label}</span>
                      {col.label !== 'ACTIONS' && (
                        <span className="text-[9px] opacity-60 transition-transform duration-200" style={{ transform: col.isExpanded ? 'rotate(180deg)' : 'none' }}>
                          {col.isExpanded ? '◀' : '▶'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
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
                  const statusLabel = getRelayStatusLabel(ticket)
                  const ticketNumber = getTicketNumber(ticket)
                  const branchName = resolveBranch(ticket.branchId)?.name || '—'
                  const category = getTicketCategory(ticket)
                  const categoryColor = getCategoryColor(category)
                  const negotiator = ticket.assignedEmployeeName || ticket.installerName || '—'
                  const district = ticket.district || guessDistrict(ticket.location || '') || '—'
                  const relayedDate = formatShortDate(details.relayedDate || (ticket.createdAt ? ticket.createdAt.split('T')[0] : ''))
                  const requestedDate = formatShortDate(ticket.preferredDate)
                  const finalDate = formatShortDate(details.finalDate)
                  const lastUpdate = ticket.remarksUpdate || ticket.description || (ticket.updatedAt ? `Updated ${formatShortDate(ticket.updatedAt)}` : '')
                  const isSelected = selectedPreviewTicket?.id === ticket.id || contextMenu?.ticket.id === ticket.id
                  const rowBaseBg = isSelected
                    ? (isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.12)')
                    : (idx % 2 === 0 ? (isLight ? '#ffffff' : '#060B18') : (isLight ? '#fafafa' : '#080f1c'))
                  const rowHoverBg = isLight ? '#f1f5f9' : '#0f1e36'
                  const statusColor = statusLabel === 'Cancelled' ? '#EF4444'
                    : statusLabel === 'Installed' ? '#10B981'
                    : statusLabel === 'Scheduled' ? '#06B6D4'
                    : statusLabel === 'Assigned' ? '#3B82F6'
                    : '#F59E0B'

                  const cells = [
                    { value: <span className="font-black tabular-nums">{idx + 1}</span>, center: true },
                    { value: <span className="font-black font-mono tracking-wide whitespace-nowrap block truncate" title={ticketNumber} style={{ color: categoryColor }}>{ticketNumber}</span>, center: true },
                    { value: <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase border" style={{ color: statusColor, backgroundColor: `${statusColor}14`, borderColor: `${statusColor}33` }}>{statusLabel}</span>, center: true },
                    { value: <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase border whitespace-nowrap" style={{ color: categoryColor, backgroundColor: `${categoryColor}14`, borderColor: `${categoryColor}33` }}>{category}</span>, center: true },
                    { value: <span className="font-bold uppercase text-[10px]">{branchName}</span>, center: true },
                    { value: <span className="font-bold uppercase text-[10px]">{negotiator}</span>, center: true },
                    { value: <span className={`${columns[6].isExpanded ? 'break-words' : 'truncate'} block font-bold`} title={ticket.customerName || 'Direct Client'}>{ticket.customerName || 'Direct Client'}</span> },
                    { value: <span className="font-semibold uppercase text-[10px]">{district}</span>, center: true },
                    { value: <span className="font-semibold truncate block" title={storeStyle.label}>{storeStyle.label}</span> },
                    { value: <span className="font-bold uppercase text-[10px]">{details.brand || '—'}</span>, center: true },
                    { value: <span className="font-bold uppercase text-[10px]">{details.capacity || '—'}</span>, center: true },
                    { value: <span className={`${columns[11].isExpanded ? 'break-words' : 'line-clamp-2'} block font-semibold uppercase text-[10px]`} title={ticket.commitType || ''}>{ticket.commitType || '—'}</span>, center: true },
                    { value: <span className="font-semibold whitespace-nowrap">{relayedDate || '—'}</span>, center: true },
                    { value: <span className="font-semibold whitespace-nowrap">{requestedDate || '—'}</span>, center: true },
                    { value: <span className="font-semibold whitespace-nowrap">{finalDate || '—'}</span>, center: true },
                    { value: <span className={`${columns[15].isExpanded ? 'break-words' : 'line-clamp-2'} block`} title={lastUpdate}>{lastUpdate || '—'}</span> },
                    { value: (
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={e => { e.stopPropagation(); openDrawer(ticket) }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all hover:border-[#10B981] hover:text-[#10B981]"
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}>
                            Edit
                          </button>
                          {isAdmin && (
                            <button type="button" onClick={e => { e.stopPropagation(); handleDeleteTicket(ticket.id, ticket.customerName) }}
                              className="px-2 py-1 rounded-lg border border-red-500/20 text-red-500 bg-red-500/5 hover:bg-red-500 hover:text-white transition-all">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ), right: true },
                  ]

                  return (
                    <tr key={ticket.id}
                      id={`row-${ticket.id}`}
                      onContextMenu={e => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, ticket })
                      }}
                      style={{
                        borderBottom: `1px solid ${border}`,
                        backgroundColor: rowBaseBg,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowHoverBg }) }}
                      onMouseLeave={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowBaseBg }) }}
                      onClick={() => setSelectedPreviewTicket(ticket)}
                      className="transition-colors">
                      {cells.map((cell, colIdx) => {
                        const col = columns[colIdx]
                        return (
                          <td key={col.label}
                            id={`cell-${ticket.id}-${colIdx}`}
                            onClick={() => {
                              setSelectedPreviewTicket(ticket)
                              setSelectedColIndex(colIdx)
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRight: col.freeze ? `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}` : `1px solid ${border}`,
                              color: textMuted,
                              fontSize: '11px',
                              textAlign: cell.right ? 'right' : cell.center || col.center ? 'center' : 'left',
                              width: col.w,
                              minWidth: col.w,
                              maxWidth: col.w,
                              transition: 'all 0.15s ease-in-out',
                              backgroundColor: rowBaseBg,
                              boxShadow: (isSelected && selectedColIndex === colIdx ? 'inset 0 0 0 2px #10B981' : undefined) || (col.freeze ? (isLight
                                ? '6px 0 12px -3px rgba(0, 0, 0, 0.12), 2px 0 4px -2px rgba(0, 0, 0, 0.05)'
                                : '8px 0 18px -4px rgba(0, 0, 0, 0.45), 3px 0 6px -3px rgba(0, 0, 0, 0.25)') : undefined),
                              ...(col.sticky ? { position: 'sticky' as const, left: col.left, zIndex: 5 } : {})
                            }}>
                            {cell.value}
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
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 flex-wrap" style={{ borderTop: `1px solid ${border}` }}>
          {/* Counters */}
          <div className="flex flex-wrap items-center gap-5">
            {[
              { label: 'Unassigned', count: tickets.filter(t => !(t.assignedTo || t.branchId) && t.status.toUpperCase() !== 'COMPLETED' && t.status.toUpperCase() !== 'CANCELLED').length },
              { label: 'Scheduled',  count: tickets.filter(t => !!(t.assignedTo || t.branchId) && t.status.toUpperCase() !== 'COMPLETED' && t.status.toUpperCase() !== 'CANCELLED').length },
              { label: 'Installed',  count: tickets.filter(t => t.status.toUpperCase() === 'COMPLETED' || !!(t.installationCharges && t.installationCharges > 0)).length },
              { label: 'Cancelled',  count: tickets.filter(t => t.status.toUpperCase() === 'CANCELLED').length },
              { label: 'Total',      count: tickets.length },
            ].map((stat, idx, arr) => (
              <span key={stat.label} className="flex items-center gap-1.5 text-xs" style={{ color: textMuted }}>
                {stat.label}
                <strong className="font-bold" style={{ color: textPrimary }}>{stat.count}</strong>
                {idx < arr.length - 1 && <span className="ml-3 opacity-30">·</span>}
              </span>
            ))}
          </div>

          {/* Danger Zone Action (Admin Only) */}
          {isAdmin && filtered.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider hidden sm:inline">⚠ Danger Zone:</span>
              <button type="button" onClick={handleDeleteAllTickets} disabled={actionSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 border border-red-500/25 text-red-500 bg-red-500/5 hover:bg-red-500 hover:text-white"
                title={(searchQuery || storeFilter !== 'ALL' || branchFilter !== 'ALL' || activeTab !== 'ALL')
                  ? 'Only matching filtered records will be deleted'
                  : 'Deletes all records permanently'}>
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                {actionSaving ? 'Deleting...' : `Delete All ${filtered.length} Records`}
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Centered Manage/Edit Ticket Modal */}
      {isActionDrawerOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col w-full max-w-4xl max-h-[90vh] rounded-xl overflow-hidden shadow-2xl border transition-all"
            style={{ backgroundColor: cardBg, borderColor: border }}>
            {/* Header */}
            <div className="shrink-0 px-5 py-3 flex items-center justify-between border-b" style={{ backgroundColor: cardBg, borderColor: border }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-sm leading-none" style={{ color: textPrimary }}>Manage Client Ticket</h2>
                  <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>
                    ASH{(selectedTicket.id || '').replace(/-/g, '').slice(-6).toUpperCase()} · Edit details and branch assignments
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setIsActionDrawerOpen(false)}
                className="p-1.5 rounded-lg border text-slate-400 hover:text-slate-600 transition-colors"
                style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Form Container */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Grid Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Client & Address */}
                <div className="space-y-4">
                  {/* Block 1: Client Info */}
                  <div className="rounded-xl p-3 flex flex-col gap-2.5 border" style={{ borderColor: border }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 pb-1 border-b" style={{ borderColor: border }}>
                      Client Information
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Customer Name</label>
                        <input type="text" value={editCustomerName} onChange={e => setEditCustomerName(e.target.value)}
                          placeholder="Customer Name" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Primary Phone</label>
                        <input type="text" value={editContactPhone} onChange={e => setEditContactPhone(e.target.value)}
                          placeholder="Primary Phone" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Alternate Contact</label>
                        <input type="text" value={editAlternatePhone} onChange={e => setEditAlternatePhone(e.target.value)}
                          placeholder="Alternate contact" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Store / Vendor Source</label>
                        <select
                          value={
                            editSourceVendor.toLowerCase().includes('robinsons')
                              ? 'Robinsons'
                              : editSourceVendor.toLowerCase().includes('abenson')
                              ? 'Abenson'
                              : 'Direct'
                          }
                          onChange={e => setEditSourceVendor(e.target.value)}
                          className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                          <option value="Robinsons">Robinsons</option>
                          <option value="Abenson">Abenson</option>
                          <option value="Direct">Direct Store</option>
                        </select>
                      </div>
                    </div>
                    {/* Optional vendor branch input */}
                    {(editSourceVendor.toLowerCase().includes('robinsons') || editSourceVendor.toLowerCase().includes('abenson')) && (
                      <div className="mt-1">
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>
                          {editSourceVendor.toLowerCase().includes('robinsons') ? 'Robinsons' : 'Abenson'} Branch Name
                        </label>
                        <input
                          type="text"
                          value={
                            editSourceVendor === 'Robinsons' || editSourceVendor === 'Abenson'
                              ? ''
                              : editSourceVendor
                          }
                          onChange={e => {
                            const prefix = editSourceVendor.toLowerCase().includes('robinsons') ? 'Robinsons' : 'Abenson'
                            setEditSourceVendor(e.target.value || prefix)
                          }}
                          placeholder={editSourceVendor.toLowerCase().includes('robinsons') ? "e.g. Robinsons Tagaytay" : "e.g. Abenson Silang"}
                          className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Block 2: Destination & Address */}
                  <div className="rounded-xl p-3 flex flex-col gap-2.5 border" style={{ borderColor: border }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 pb-1 border-b" style={{ borderColor: border }}>
                      Destination & Address
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Full Address / Destination *</label>
                        <textarea value={editLocation} rows={2}
                          onChange={e => {
                            const val = e.target.value
                            setEditLocation(val)
                            const guessed = guessDistrict(val)
                            if (guessed) setEditDistrict(guessed)
                          }} 
                          placeholder="e.g. Address details" 
                          className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Landmarks / Directions</label>
                          <input type="text" value={editLandmarks} onChange={e => setEditLandmarks(e.target.value)}
                            placeholder="e.g. Landmarks" className={compactInput}
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>District</label>
                          <input type="text" value={editDistrict} onChange={e => setEditDistrict(e.target.value)}
                            placeholder="e.g. District 1" className={compactInput}
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Unit Details & Scheduling */}
                <div className="space-y-4">
                  {/* Block 3: Unit Details */}
                  <div className="rounded-xl p-3 flex flex-col gap-2.5 border" style={{ borderColor: border }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-purple-500 pb-1 border-b" style={{ borderColor: border }}>
                      Aircon Unit Details
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Brand</label>
                        <input type="text" value={editBrand} onChange={e => setEditBrand(e.target.value)}
                          placeholder="e.g. Brand" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Capacity</label>
                        <input type="text" value={editCapacity} onChange={e => setEditCapacity(e.target.value)}
                          placeholder="e.g. Capacity" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>SKU</label>
                        <input type="text" value={editSku} onChange={e => setEditSku(e.target.value)}
                          placeholder="SKU" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Serial Number</label>
                        <input type="text" value={editSerialNumber} onChange={e => setEditSerialNumber(e.target.value)}
                          placeholder="Serial #" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Control # / SI Voucher</label>
                        <input type="text" value={editControlNumber} onChange={e => setEditControlNumber(e.target.value)}
                          placeholder="Control #" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Service Type</label>
                        <input type="text" value={editServiceType} onChange={e => {
                          const val = e.target.value
                          const isInstall = val.toLowerCase().includes('install') || val.toUpperCase() === 'S/I'
                          const isSurvey = val.toLowerCase().includes('survey') || val.toUpperCase() === 'SURVEY'
                          let mappedSvc = val
                          if (isInstall) {
                            mappedSvc = 'S/I'
                            setEditCommitType('FREE FIRST 10 FEET')
                          } else if (isSurvey) {
                            mappedSvc = 'SURVEY'
                          }
                          setEditServiceType(mappedSvc)
                        }}
                          placeholder="e.g. S/I" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Commit Type / Promo</label>
                        <input type="text" value={editCommitType} onChange={e => setEditCommitType(e.target.value)}
                          placeholder="e.g. Commit info" className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                    </div>
                    {/* Document Attachment view */}
                    {editImages && (
                      <div className="rounded-lg p-2 flex items-center justify-between border mt-1" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                          <div className="text-[10px]">
                            <p className="font-bold" style={{ color: textPrimary }}>Attached Voucher</p>
                            <p className="truncate max-w-[120px]" style={{ color: textMuted }}>{editImages.split('/').pop()}</p>
                          </div>
                        </div>
                        <a href={editImages.startsWith('http') ? editImages : `${API_BASE_URL.replace('/api', '')}${editImages}`}
                           target="_blank" rel="noreferrer"
                           className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 rounded text-[9px] font-bold transition-all">
                          View
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Block 4: Scheduling & Assignment */}
                  <div className="rounded-xl p-3 flex flex-col gap-2.5 border" style={{ borderColor: border }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500 pb-1 border-b" style={{ borderColor: border }}>
                      Scheduling & Assignment
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Service Status</label>
                        <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}
                          className="w-full border rounded-lg px-2.5 py-1 text-xs outline-none font-bold"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                          <option value="PENDING">Not Assigned (Pending)</option>
                          <option value="ASSIGNED">Scheduled (Assigned)</option>
                          <option value="ON_THE_WAY">On the Way</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Installed (Completed)</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </div>
                      {selectedTicket && getTicketCategory(selectedTicket) === 'Installation' && (
                        <label className="flex items-center gap-1.5 rounded-lg border px-2 py-1 cursor-pointer select-none"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
                          <input type="checkbox" checked={editWarrantyRegistrationCompleted}
                            onChange={e => setEditWarrantyRegistrationCompleted(e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#10B981]" />
                          <span className="flex flex-col">
                            <span className="text-[9px] font-bold" style={{ color: textPrimary }}>Warranty Done</span>
                          </span>
                        </label>
                      )}
                      {(updateStatus !== 'PENDING' || (selectedTicket && getTicketCategory(selectedTicket) === 'Collection')) && updateStatus !== 'CANCELLED' && (
                        <div>
                          <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Branch Zone</label>
                          <select value={assignBranchId}
                            onChange={e => setAssignBranchId(e.target.value)}
                            className={compactInput}
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                            <option value="">Select Branch...</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Relayed Date</label>
                        <input type="date" value={editRelayedDate} onChange={e => setEditRelayedDate(e.target.value)}
                          className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Preferred Date</label>
                        <input type="date" value={editPreferredDate} onChange={e => setEditPreferredDate(e.target.value)}
                          className={compactInput}
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      {assignBranchId && (updateStatus !== 'PENDING' || (selectedTicket && getTicketCategory(selectedTicket) === 'Collection')) && updateStatus !== 'CANCELLED' && (
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Final Date Assigned by Branch</label>
                          <input type="date" value={editFinalDate} onChange={e => setEditFinalDate(e.target.value)}
                            className={compactInput}
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Remarks / Update Notes</label>
                      <textarea value={editRemarksUpdate} onChange={e => setEditRemarksUpdate(e.target.value)} rows={2}
                        placeholder="Remarks..." className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-3 flex items-center justify-between border-t" style={{ borderColor: border, backgroundColor: cardBg }}>
              {isAdmin ? (
                <button type="button" onClick={() => handleDeleteTicket(selectedTicket.id, selectedTicket.customerName)}
                  disabled={actionSaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all disabled:opacity-50 hover:bg-red-500 hover:text-white hover:border-red-500"
                  style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.06)' }}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete Ticket
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsActionDrawerOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800"
                  style={{ borderColor: inputBorder, color: textMuted }}>
                  Cancel
                </button>
                <button type="button" onClick={handleDrawerActionSave} disabled={actionSaving}
                  className="px-6 py-2 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shadow-md"
                  style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                  {actionSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Centered Create Ticket Modal */}
      {isAddModalOpen && (() => {
        const addCategory = /collect/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Collection'
          : /install|s\/i|\bsi\b/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Installation'
          : /survey/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Survey'
          : /service|clean/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Service'
          : 'Installation'
        const canAssignBranch = addForm.status !== 'CANCELLED' && (addForm.status !== 'PENDING' || addCategory === 'Collection')
        const fieldStyle = (value?: string) => ({
          backgroundColor: isFieldExtracted(value) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
          borderColor: isFieldExtracted(value) ? '#10B981' : inputBorder,
          color: textPrimary
        })
        const categoryOptions = [
          { label: 'Installation', value: 'Installation', title: 'Installation service' },
          { label: 'Service', value: 'Service', title: 'Service ticket' },
          { label: 'Survey', value: 'Survey', title: 'Survey ticket' },
          { label: 'Collection', value: 'Collection', title: 'Collection ticket' }
        ]

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col w-full max-w-5xl max-h-[92vh] rounded-xl overflow-hidden shadow-2xl border transition-all"
            style={{ backgroundColor: cardBg, borderColor: border }}>
            {/* Header */}
            <div className="shrink-0 px-5 py-3 flex items-center justify-between border-b" style={{ backgroundColor: cardBg, borderColor: border }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-sm leading-none" style={{ color: textPrimary }}>Encode Ticket</h2>
                  <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>Fast manual entry for relay monitoring</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg border text-slate-400 hover:text-slate-600 transition-colors"
                style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            {/* Form */}
            <form onSubmit={handleFormCreateTicket} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 lg:grid-cols-[310px_1fr] gap-4">
                  <aside className="rounded-lg border p-3 space-y-3" style={{ borderColor: border, backgroundColor: inputBg }}>
                    {addForm.images && (
                      <div className="rounded-lg border p-2.5 flex items-center justify-between gap-2" style={{ borderColor: 'rgba(16, 185, 129, 0.25)', backgroundColor: isLight ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.08)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-[11px] font-bold truncate" style={{ color: textPrimary }}>AI extracted fields</span>
                        </div>
                        <a href={addForm.images.startsWith('http') ? addForm.images : `${API_BASE_URL.replace('/api', '')}${addForm.images}`}
                          target="_blank" rel="noreferrer"
                          className="px-2 py-1 border rounded-md text-[10px] font-bold shrink-0 flex items-center gap-1"
                          style={{ borderColor: inputBorder, color: textMuted }}>
                          <FileText className="w-3 h-3" /> View
                        </a>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Category</label>
                        <select
                          value={addCategory}
                          onChange={e => {
                            const option = categoryOptions.find(item => item.value === e.target.value)
                            if (!option) return
                            setAddForm(prev => ({
                              ...prev,
                              serviceType: option.value,
                              title: option.title,
                              status: option.value === 'Collection' ? 'PENDING' : prev.status,
                              commitType: option.value === 'Installation' ? 'FREE FIRST 10 FEET' : prev.commitType,
                              installationCharges: option.value === 'Collection' ? prev.installationCharges : 0,
                              modeOfPayment: option.value === 'Collection' ? prev.modeOfPayment : ''
                            }))
                          }}
                          className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none font-bold"
                          style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                        >
                          {categoryOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {categoryOptions.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setAddForm(prev => ({
                              ...prev,
                              serviceType: option.value,
                              title: option.title,
                              status: option.value === 'Collection' ? 'PENDING' : prev.status,
                              commitType: option.value === 'Installation' ? 'FREE FIRST 10 FEET' : prev.commitType,
                              installationCharges: option.value === 'Collection' ? prev.installationCharges : 0,
                              modeOfPayment: option.value === 'Collection' ? prev.modeOfPayment : ''
                            }))}
                            className="h-8 rounded-md border text-[10px] font-bold transition-all"
                            style={{
                              borderColor: addCategory === option.value ? '#10B981' : inputBorder,
                              backgroundColor: addCategory === option.value ? (isLight ? '#ECFDF5' : 'rgba(16,185,129,0.12)') : cardBg,
                              color: addCategory === option.value ? '#059669' : textMuted
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>No</label>
                        <input
                          type="text"
                          value="Auto"
                          readOnly
                          className={compactInput}
                          style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textMuted }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Ticket No</label>
                        <input
                          type="text"
                          value={addForm.controlNumber}
                          onChange={e => setAddForm(prev => ({ ...prev, controlNumber: e.target.value }))}
                          placeholder="Transaction no."
                          className={`${compactInput} whitespace-nowrap`}
                          style={fieldStyle(addForm.controlNumber)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Store</label>
                        <select
                          value={(addForm.sourceVendor || '').toLowerCase().includes('robinsons') ? 'Robinsons' : (addForm.sourceVendor || '').toLowerCase().includes('abenson') ? 'Abenson' : 'Direct'}
                          onChange={e => setAddForm(prev => ({ ...prev, sourceVendor: e.target.value }))}
                          className={compactInput}
                          style={fieldStyle(addForm.sourceVendor)}
                        >
                          <option value="Robinsons" style={{ color: '#000' }}>Robinsons</option>
                          <option value="Abenson" style={{ color: '#000' }}>Abenson</option>
                          <option value="Direct" style={{ color: '#000' }}>Direct</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Negotiator</label>
                        <input
                          type="text"
                          value={addForm.installerName}
                          onChange={e => setAddForm(prev => ({ ...prev, installerName: e.target.value }))}
                          placeholder="Assigned staff"
                          className={compactInput}
                          style={fieldStyle(addForm.installerName)}
                        />
                      </div>
                    </div>

                    {((addForm.sourceVendor || '').toLowerCase().includes('robinsons') || (addForm.sourceVendor || '').toLowerCase().includes('abenson')) && (
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Store Branch</label>
                        <input
                          type="text"
                          value={addForm.sourceVendor === 'Robinsons' || addForm.sourceVendor === 'Abenson' ? '' : addForm.sourceVendor}
                          onChange={e => {
                            const prefix = (addForm.sourceVendor || '').toLowerCase().includes('robinsons') ? 'Robinsons' : 'Abenson'
                            setAddForm(prev => ({ ...prev, sourceVendor: e.target.value || prefix }))
                          }}
                          placeholder={(addForm.sourceVendor || '').toLowerCase().includes('robinsons') ? 'Robinsons branch' : 'Abenson branch'}
                          className={compactInput}
                          style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Status</label>
                      <select
                        value={addForm.status}
                        onChange={e => setAddForm(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none font-bold"
                        style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="ASSIGNED">Assigned</option>
                        <option value="ON_THE_WAY">On the Way</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>

                    {canAssignBranch && (
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Branch Assigned</label>
                        <select
                          value={addForm.branchId}
                          onChange={e => setAddForm(prev => ({ ...prev, branchId: e.target.value }))}
                          className={compactInput}
                          style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                        >
                          <option value="">Select Branch...</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Date Relayed</label>
                        <input type="date" value={addForm.relayedDate} onChange={e => setAddForm(prev => ({ ...prev, relayedDate: e.target.value }))} className={compactInput} style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Requested Schedule</label>
                        <input type="date" value={addForm.preferredDate} onChange={e => setAddForm(prev => ({ ...prev, preferredDate: e.target.value }))} className={compactInput} style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                    </div>

                    {addForm.status !== 'CANCELLED' && (
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Final Schedule</label>
                        <input type="date" value={addForm.finalDate} onChange={e => setAddForm(prev => ({ ...prev, finalDate: e.target.value }))} className={compactInput} style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                    )}
                  </aside>

                  <main className="rounded-lg border p-3 space-y-3" style={{ borderColor: border }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Customer Name *</label>
                        <input type="text" required value={addForm.customerName} onChange={e => setAddForm(prev => ({ ...prev, customerName: e.target.value }))} placeholder="Customer name" className={compactInput} style={fieldStyle(addForm.customerName)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Phone</label>
                        <input type="text" value={addForm.contactPhone} onChange={e => setAddForm(prev => ({ ...prev, contactPhone: e.target.value }))} placeholder="Contact number" className={compactInput} style={fieldStyle(addForm.contactPhone)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Alt Contact</label>
                        <input type="text" value={addForm.alternatePhone} onChange={e => setAddForm(prev => ({ ...prev, alternatePhone: e.target.value }))} placeholder="Email or phone" className={compactInput} style={fieldStyle(addForm.alternatePhone)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>District</label>
                        <input type="text" value={addForm.district} onChange={e => setAddForm(prev => ({ ...prev, district: e.target.value }))} placeholder="Area / district" className={compactInput} style={fieldStyle(addForm.district)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Landmark</label>
                        <input type="text" value={addForm.landmarks} onChange={e => setAddForm(prev => ({ ...prev, landmarks: e.target.value }))} placeholder="Nearest landmark" className={compactInput} style={fieldStyle(addForm.landmarks)} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Address *</label>
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
                          placeholder="Full destination address"
                          rows={3}
                          className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none"
                          style={fieldStyle(addForm.locationRaw)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t" style={{ borderColor: border }}>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Brand</label>
                        <input type="text" value={addForm.brand} onChange={e => setAddForm(prev => ({ ...prev, brand: e.target.value }))} placeholder="Brand" className={compactInput} style={fieldStyle(addForm.brand)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Capacity</label>
                        <input type="text" value={addForm.capacity} onChange={e => setAddForm(prev => ({ ...prev, capacity: e.target.value }))} placeholder="1.5HP" className={compactInput} style={fieldStyle(addForm.capacity)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>SKU</label>
                        <input type="text" value={addForm.sku} onChange={e => setAddForm(prev => ({ ...prev, sku: e.target.value }))} placeholder="SKU" className={compactInput} style={fieldStyle(addForm.sku)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Serial No</label>
                        <input type="text" value={addForm.serialNumber} onChange={e => setAddForm(prev => ({ ...prev, serialNumber: e.target.value }))} placeholder="Serial" className={compactInput} style={fieldStyle(addForm.serialNumber)} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Commit</label>
                        <input type="text" value={addForm.commitType} onChange={e => setAddForm(prev => ({ ...prev, commitType: e.target.value }))} placeholder="FREE FIRST 10 FEET / amount / promo" className={compactInput} style={fieldStyle(addForm.commitType)} />
                      </div>
                      {addCategory === 'Collection' && (
                        <>
                          <div>
                            <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Collection Amount</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={addForm.installationCharges}
                              onChange={e => setAddForm(prev => ({ ...prev, installationCharges: Number(e.target.value) || 0 }))}
                              placeholder="0.00"
                              className={compactInput}
                              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Payment Mode</label>
                            <input
                              type="text"
                              value={addForm.modeOfPayment}
                              onChange={e => setAddForm(prev => ({ ...prev, modeOfPayment: e.target.value }))}
                              placeholder="Cash / GCash / Bank"
                              className={compactInput}
                              style={fieldStyle(addForm.modeOfPayment)}
                            />
                          </div>
                        </>
                      )}
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Last Update</label>
                        <input
                          type="text"
                          value={addForm.description}
                          onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value, remarksUpdate: e.target.value }))}
                          placeholder="Latest update / dispatch notes"
                          className={compactInput}
                          style={fieldStyle(addForm.description)}
                        />
                      </div>
                    </div>
                  </main>
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 px-5 py-3 flex items-center justify-between border-t" style={{ borderColor: border, backgroundColor: cardBg }}>
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border rounded-lg text-xs font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800" style={{ borderColor: inputBorder, color: textMuted }}>
                  Cancel
                </button>
                <button type="submit" disabled={formSubmitting} className="px-6 py-2 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shadow-md" style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}>
                  {formSubmitting ? "Creating..." : "+ Create Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
        )
      })()}


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
      {isViewModalOpen && selectedPreviewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}>
            
            {isViewModalOpen && (
              <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                  body * {
                    visibility: hidden;
                  }
                  #print-job-sheet, #print-job-sheet * {
                    visibility: visible;
                  }
                  #print-job-sheet {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    padding: 0;
                    margin: 0;
                    background: white !important;
                    color: black !important;
                  }
                  .dark #print-job-sheet {
                    background: white !important;
                    color: black !important;
                  }
                }
              `}} />
            )}

            {/* Header / Actions Bar */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#10B981]">Document Viewer</span>
                <span className="text-[10px] px-2 py-0.5 rounded font-black font-mono tracking-wider bg-slate-100 dark:bg-slate-800" style={{ color: textMuted }}>
                  JOB #{selectedPreviewTicket.id.split('-').pop()?.toUpperCase() || selectedPreviewTicket.id.slice(-6).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                  style={{ borderColor: inputBorder, color: textMuted }}>
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button type="button" onClick={() => { openDrawer(selectedPreviewTicket); setIsViewModalOpen(false); setSelectedPreviewTicket(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                  <Wrench className="w-3.5 h-3.5" /> Edit
                </button>
                <button type="button" onClick={() => setIsViewModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Document Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-8 font-sans" id="print-job-sheet">
              {/* Branding / Header */}
              <div className="text-center pb-6 border-b-2 border-dashed" style={{ borderColor: border }}>
                <h2 className="text-xl font-black uppercase tracking-widest" style={{ color: textPrimary }}>Service Job Sheet</h2>
                <p className="text-xs font-semibold mt-1 text-slate-400 dark:text-slate-500">ASHCOL AIRCONDITIONING SERVICES</p>
              </div>

              {/* Status / Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-b" style={{ borderColor: border }}>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Branch</p>
                  <p className="text-xs font-black mt-0.5" style={{ color: textPrimary }}>
                    {resolveBranch(selectedPreviewTicket.branchId)?.name || 'UNASSIGNED'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</p>
                  <div className="mt-1">
                    {(() => {
                      const isCancelled = selectedPreviewTicket.status.toUpperCase() === 'CANCELLED'
                      const isInstalled = selectedPreviewTicket.status.toUpperCase() === 'COMPLETED' || !!(selectedPreviewTicket.installationCharges && selectedPreviewTicket.installationCharges > 0)
                      const isAssigned = !!(selectedPreviewTicket.assignedTo || selectedPreviewTicket.branchId)
                      const status = (selectedPreviewTicket.status || '').toUpperCase()

                      if (isCancelled) return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-red-500/10 text-red-500 border border-red-500/20">Cancelled</span>
                      if (isInstalled) return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">✓ Installed</span>
                      if (status === 'IN_PROGRESS') return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">In Progress</span>
                      if (status === 'ON_THE_WAY') return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-purple-500/10 text-purple-500 border border-purple-500/20">On the Way</span>
                      if (status === 'ASSIGNED' || isAssigned) return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">Assigned</span>
                      return <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Unassigned</span>
                    })()}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Control Number</p>
                  <p className="text-xs font-mono font-bold mt-0.5" style={{ color: textPrimary }}>
                    {selectedPreviewTicket.controlNumber || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Schedule Type</p>
                  <p className="text-xs font-bold mt-0.5" style={{ color: textPrimary }}>
                    {selectedPreviewTicket.serviceType || '—'}
                  </p>
                </div>
              </div>

              {/* 2 Column Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                
                {/* Column 1: Client details */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-[#10B981] pb-1 border-b" style={{ borderColor: border }}>Client Details</h4>
                  
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block">Customer Name</label>
                    <span className="text-xs font-bold" style={{ color: textPrimary }}>{selectedPreviewTicket.customerName || 'Direct Client'}</span>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block">Contact Number</label>
                    <span className="text-xs font-semibold text-emerald-500">
                      <FormatPhone raw={selectedPreviewTicket.contactPhone} />
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block">Installation Address</label>
                    <span className="text-xs font-medium block leading-relaxed" style={{ color: textPrimary }}>{selectedPreviewTicket.location || '—'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">District</label>
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{selectedPreviewTicket.district || '—'}</span>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">Landmark / Subd</label>
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>
                        {(() => {
                          try {
                            return selectedPreviewTicket.acDetails ? JSON.parse(selectedPreviewTicket.acDetails)?.landmarks || '—' : '—'
                          } catch (e) { return '—' }
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Column 2: Equipment & Sched details */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-[#10B981] pb-1 border-b" style={{ borderColor: border }}>Unit & Scheduling Details</h4>

                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block">Unit / Brand Details</label>
                    <span className="text-xs font-bold block" style={{ color: textPrimary }}>
                      {(() => {
                        let parsed: any = null
                        if (selectedPreviewTicket.acDetails) {
                          try { parsed = JSON.parse(selectedPreviewTicket.acDetails) } catch (e) {}
                        }
                        const b = parsed?.brand || ''
                        const cap = parsed?.capacity || ''
                        if (b || cap) return `${b} ${cap}`.trim()
                        return selectedPreviewTicket.unitType || 'Split AC'
                      })()}
                    </span>
                    {(() => {
                      let parsed: any = null
                      if (selectedPreviewTicket.acDetails) {
                        try { parsed = JSON.parse(selectedPreviewTicket.acDetails) } catch (e) {}
                      }
                      if (parsed?.sku || parsed?.serialNumber) {
                        return (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {parsed.sku && <div>SKU: {parsed.sku}</div>}
                            {parsed.serialNumber && <div>Serial: {parsed.serialNumber}</div>}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">DLR / Store</label>
                      <span className="text-xs font-bold" style={{ color: textPrimary }}>{selectedPreviewTicket.sourceVendor || 'Direct Store'}</span>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">Commit Type</label>
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{selectedPreviewTicket.commitType || '—'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">Relayed Date</label>
                      <span className="text-xs font-medium" style={{ color: textPrimary }}>
                        {(() => {
                          try {
                            const d = selectedPreviewTicket.createdAt ? new Date(selectedPreviewTicket.createdAt) : null
                            return d && !isNaN(d.getTime()) ? d.toLocaleDateString() : '—'
                          } catch (e) { return '—' }
                        })()}
                      </span>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">Preferred Sched</label>
                      <span className="text-xs font-medium" style={{ color: textPrimary }}>
                        {(() => {
                          try {
                            const d = selectedPreviewTicket.preferredDate ? new Date(selectedPreviewTicket.preferredDate) : null
                            return d && !isNaN(d.getTime()) ? d.toLocaleDateString() : '—'
                          } catch (e) { return '—' }
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Assignment & Pricing Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6 border-t" style={{ borderColor: border }}>
                {/* Tech / Vehicle details */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-[#10B981] pb-1 border-b" style={{ borderColor: border }}>Tech Assignment</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">Installer Name</label>
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{selectedPreviewTicket.installerName || '—'}</span>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">Service Vehicle</label>
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{selectedPreviewTicket.serviceVehicle || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Charges / Payment Details */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-[#10B981] pb-1 border-b" style={{ borderColor: border }}>Charges & Payments</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">Installation Charges</label>
                      <span className="text-xs font-bold text-emerald-500">
                        {selectedPreviewTicket.installationCharges ? `₱${selectedPreviewTicket.installationCharges.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '₱0.00'}
                      </span>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-semibold block">Mode of Payment</label>
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{selectedPreviewTicket.modeOfPayment || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Remarks/Description Section */}
              <div className="py-6 border-t" style={{ borderColor: border }}>
                <h4 className="text-[11px] font-black uppercase tracking-wider text-[#10B981] pb-1 border-b" style={{ borderColor: border }}>Remarks / Technical Updates</h4>
                <div className="mt-3 p-4 rounded-xl text-xs leading-relaxed" style={{ backgroundColor: inputBg, border: `1px solid ${border}`, color: textMuted }}>
                  {selectedPreviewTicket.remarksUpdate || selectedPreviewTicket.description || 'No additional remarks logged for this work order.'}
                </div>
              </div>

              {/* Printable footer */}
              <div className="hidden print:block text-center mt-20 pt-6 border-t text-[10px]" style={{ borderColor: border }}>
                <div className="flex justify-between font-semibold" style={{ color: textMuted }}>
                  <span>Printed on: {new Date().toLocaleString()}</span>
                  <span>Signature: __________________________</span>
                </div>
              </div>
            </div>

            {/* Action Bar Footer */}
            <div className="px-6 py-4 flex gap-2.5 justify-end shrink-0" style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
              <button type="button" onClick={() => setIsViewModalOpen(false)}
                className="px-5 py-2.5 border rounded-xl text-xs font-bold"
                style={{ borderColor: inputBorder, color: textMuted }}>
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Right-click context menu ─────────────────────────────────── */}
      {contextMenu && (
        <div className="fixed z-[200]" style={{ top: contextMenu.y, left: contextMenu.x }}
             onClick={e => e.stopPropagation()}>
          <div className="rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-blue-500/10"
                    style={{ color: textPrimary }}
                    onClick={() => { setSelectedPreviewTicket(contextMenu.ticket); setIsViewModalOpen(true); setContextMenu(null) }}>
              <Eye className="w-3.5 h-3.5 text-blue-500" /> View details
            </button>
            <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-[#10B981]/10"
                    style={{ color: textPrimary }}
                    onClick={() => { openDrawer(contextMenu.ticket); setContextMenu(null) }}>
              <Edit3 className="w-3.5 h-3.5 text-[#10B981]" /> Edit ticket
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
