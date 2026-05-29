import { useState, useEffect, useRef } from 'react'
import {
  Search, FileSpreadsheet, AlertTriangle, X, FileText, Loader2,
  Building2, Trash2, User, MapPin, Wrench, Calendar,
  ChevronRight, ChevronDown, Plus, CheckCircle2, Clock, AlertCircle, Package, FileUp, Filter,
  Users, XCircle, Printer, Eye
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
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const pageBg = isLight ? '#f1f5f9' : '#060B18'

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
    if (idLower === '2880bf12-581c-11f1-bf8c-74d4dd6dfc0b') keyword = 'calauan'
    else if (idLower === '2880c15e-581c-11f1-bf8c-74d4dd6dfc0b') keyword = 'silang'
    else if (idLower === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') keyword = 'taguig'
    else if (idLower === '2880c35a-581c-11f1-bf8c-74d4dd6dfc0b') keyword = 'rizal'
    else if (idLower === '2880c3b7-581c-11f1-bf8c-74d4dd6dfc0b') keyword = 'pampanga'
    else if (idLower === '2880c407-581c-11f1-bf8c-74d4dd6dfc0b') keyword = 'bulacan'
    else if (idLower === '2880c4af-581c-11f1-bf8c-74d4dd6dfc0b') keyword = 'dasma'
    else if (idLower === '2880c5fa-581c-11f1-bf8c-74d4dd6dfc0b') keyword = 'candelaria'

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

  // New States for Row-click Quick Actions and read-only Job Sheet View
  const [selectedPreviewTicket, setSelectedPreviewTicket] = useState<Ticket | null>(null)
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

  // Load Initial Data
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      
      // Fetch Tickets
      const ticketRes = await fetch(`${API_BASE_URL}/tickets?page=0&size=100`, {
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
  }, [])

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
          installationCharges: Number(addForm.installationCharges) || 0,
          modeOfPayment: addForm.modeOfPayment || undefined,
          controlNumber: addForm.controlNumber || undefined,
          acDetails: JSON.stringify(acDetailsObj),
          images: addForm.images || undefined,
          status: addForm.status,
          branchId: (addForm.status !== 'PENDING' && addForm.status !== 'CANCELLED') ? (addForm.branchId || undefined) : undefined
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

      if (updateStatus === 'PENDING' || updateStatus === 'CANCELLED') {
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

      return custName.includes(q) || branchName.includes(q) || techName.includes(q) || id.includes(q) || loc.includes(q)
    }

    return true
  })

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





  // Priority Row Highlight Helper
  const getRowStyleByPriority = (priority?: string) => {
    if (!priority) return {}
    const p = priority.toUpperCase()
    if (p.includes('MORNING')) {
      return isLight 
        ? { backgroundColor: '#FFF5F5', borderLeft: '4px solid #EF4444' } 
        : { backgroundColor: 'rgba(239, 68, 68, 0.08)', borderLeft: '4px solid #EF4444' }
    }
    if (p.includes('OLD') || p.includes('ADDRESS')) {
      return isLight 
        ? { backgroundColor: '#FFFBEB', borderLeft: '4px solid #F59E0B' } 
        : { backgroundColor: 'rgba(245, 158, 11, 0.08)', borderLeft: '4px solid #F59E0B' }
    }
    if (p.includes('PRIORITY')) {
      return isLight 
        ? { backgroundColor: '#F0F9FF', borderLeft: '4px solid #0EA5E9' } 
        : { backgroundColor: 'rgba(14, 165, 233, 0.08)', borderLeft: '4px solid #0EA5E9' }
    }
    return {}
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

      {/* ── HEADER: Overview-style Card ─────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-lg" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Row 1 — Title + Action Buttons */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4"
          style={{ borderBottom: `1px solid ${border}` }}>
          <div>
            <h2 className="text-lg font-black tracking-tight" style={{ color: textPrimary }}>Schedule Monitoring</h2>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>Track and manage client schedules across all branches and stores.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            {/* Scan PDF/Photo */}
            <input ref={scanFileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const file = e.target.files?.[0]; if (file) handleVoucherScan(file) }} />
            <button type="button" onClick={() => scanFileInputRef.current?.click()} disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs border transition-all hover:opacity-80 disabled:opacity-60"
              style={{ backgroundColor: isLight ? '#f0fdf4' : 'rgba(16,185,129,0.08)', borderColor: isLight ? '#bbf7d0' : 'rgba(16,185,129,0.25)', color: '#059669' }}>
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
              {scanning ? 'Scanning...' : 'Scan PDF / Photo'}
            </button>
            {/* Import Excel */}
            <input ref={excelFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
            <button type="button" onClick={() => excelFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs border transition-all hover:opacity-80"
              style={{ backgroundColor: isLight ? '#eff6ff' : 'rgba(59,130,246,0.08)', borderColor: isLight ? '#bfdbfe' : 'rgba(59,130,246,0.25)', color: '#2563EB' }}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import Excel
            </button>
            {/* Add Client */}
            <button type="button" onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-white transition-all hover:opacity-90 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
              <Plus className="w-3.5 h-3.5" /> Add Client
            </button>
          </div>
        </div>

        {/* Row 2 — Stat Cards */}
        <div className="grid grid-cols-5" style={{ borderBottom: `1px solid ${border}` }}>
          {[
            { label: 'Unassigned', icon: AlertCircle, color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',
              count: tickets.filter(t => !(t.assignedTo || t.branchId) && t.status.toUpperCase() !== 'COMPLETED' && t.status.toUpperCase() !== 'CANCELLED').length },
            { label: 'Scheduled', icon: Clock, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)',
              count: tickets.filter(t => !!(t.assignedTo || t.branchId) && t.status.toUpperCase() !== 'COMPLETED' && t.status.toUpperCase() !== 'CANCELLED').length },
            { label: 'Installed', icon: CheckCircle2, color: '#10B981', bg: 'rgba(16,185,129,0.1)',
              count: tickets.filter(t => t.status.toUpperCase() === 'COMPLETED' || !!(t.installationCharges && t.installationCharges > 0)).length },
            { label: 'Cancelled', icon: XCircle, color: '#EF4444', bg: 'rgba(239,68,68,0.1)',
              count: tickets.filter(t => t.status.toUpperCase() === 'CANCELLED').length },
            { label: 'Total Clients', icon: Users, color: '#6366F1', bg: 'rgba(99,102,241,0.1)',
              count: tickets.length },
          ].map((stat, idx, arr) => (
            <div key={stat.label} className="flex items-center gap-3 px-5 py-4"
              style={{ borderRight: idx < arr.length - 1 ? `1px solid ${border}` : undefined }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: stat.bg }}>
                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textMuted }}>{stat.label}</p>
                <p className="text-2xl font-black leading-none mt-0.5" style={{ color: stat.color }}>{stat.count}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Row 3 — Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          {/* Branch Filter */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              className="bg-transparent outline-none text-xs font-semibold cursor-pointer pr-6" 
              style={{ color: textPrimary, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}>
              <option value="ALL">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 pointer-events-none" style={{ color: textMuted }} />
          </div>

          {/* Store Filter */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Package className="w-3.5 h-3.5 shrink-0" style={{ color: '#3B82F6' }} />
            <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}
              className="bg-transparent outline-none text-xs font-semibold cursor-pointer pr-6" 
              style={{ color: textPrimary, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}>
              <option value="ALL">All Stores</option>
              <option value="Robinsons">Robinsons</option>
              <option value="Abenson">Abenson</option>
              <option value="Direct">Direct Store</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 pointer-events-none" style={{ color: textMuted }} />
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border flex-1 min-w-[180px] max-w-xs"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input type="text" placeholder="Search client or location..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-xs flex-1" style={{ color: textPrimary }} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="shrink-0" style={{ color: textMuted }}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg border"
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <select value={activeTab} onChange={e => setActiveTab(e.target.value as typeof activeTab)}
              className="bg-transparent outline-none text-xs font-semibold cursor-pointer pr-6" 
              style={{ color: textPrimary, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}>
              <option value="ALL">All Status</option>
              <option value="UNASSIGNED">Unassigned</option>
              <option value="PENDING">Scheduled</option>
              <option value="INSTALLED">Installed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 pointer-events-none" style={{ color: textMuted }} />
          </div>

          <span className="shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider"
            style={{ color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)' }}>
            {filtered.length} client{filtered.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

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


      {/* ── Main Table Container ──────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Table */}
        <div className="overflow-x-auto" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="text-xs" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                {[
                  { label: 'STATUS',           w: 125, sticky: true,  left: 0,   freeze: false },
                  { label: "CUSTOMER'S NAME",   w: 160, sticky: true,  left: 125, freeze: false },
                  { label: 'DESTINATION',       w: 200, sticky: true,  left: 285, freeze: true  },
                  { label: 'CONTACT NO.',       w: 115, sticky: false, left: 0   },
                  { label: 'BRAND / UNIT',      w: 120, sticky: false, left: 0   },
                  { label: 'DLR / STORE',       w: 100, sticky: false, left: 0   },
                  { label: 'RELAYED SCHED',     w: 110, sticky: false, left: 0,   center: true },
                  { label: 'COMMIT',            w: 110, sticky: false, left: 0,   center: true },
                  { label: 'RELAYED DATE',      w: 110, sticky: false, left: 0   },
                  { label: 'PREFERRED DATE',    w: 110, sticky: false, left: 0   },
                  { label: 'FINAL DATE',        w: 110, sticky: false, left: 0   },
                  { label: 'REMARKS / UPDATE',  w: 180, sticky: false, left: 0   },
                  { label: 'ACTIONS',           w: 90,  sticky: false, left: 0,   right: true },
                ].map(col => (
                  <th key={col.label} style={{
                    padding: '9px 10px',
                    textAlign: col.right ? 'right' : col.center ? 'center' : 'left',
                    color: textMuted,
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
                  }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#10B981]" />
                    <p className="text-sm font-semibold" style={{ color: textMuted }}>Loading masterlist...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-20 text-center">
                    <FileText className="w-12 h-12 opacity-20 mx-auto mb-3" style={{ color: textMuted }} />
                    <p className="text-sm font-bold" style={{ color: textPrimary }}>No client tickets found</p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>Try adjusting filters or upload a spreadsheet.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((ticket, idx) => {
                  const storeStyle = getStoreStyle(ticket.sourceVendor)
                  const rowStyle = getRowStyleByPriority(ticket.priorityTag)
                  const isInstalled = ticket.status.toUpperCase() === 'COMPLETED' || !!(ticket.installationCharges && ticket.installationCharges > 0)
                  const isAssigned = !!(ticket.assignedTo || ticket.branchId)
                  const isCancelled = ticket.status.toUpperCase() === 'CANCELLED'

                  // Base background for this row — used for sticky cells that need explicit bg
                  const rowBaseBg = rowStyle.backgroundColor
                    || (idx % 2 === 0 ? (isLight ? '#ffffff' : '#060B18') : (isLight ? '#fafafa' : '#080f1c'))
                  const rowHoverBg = isLight ? '#f1f5f9' : '#0f1e36'

                  return (
                    <tr key={ticket.id}
                      style={{
                        borderBottom: `1px solid ${border}`,
                        backgroundColor: rowBaseBg,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowHoverBg }) }}
                      onMouseLeave={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowBaseBg }) }}
                      onClick={() => setSelectedPreviewTicket(ticket)}
                      className="transition-colors">

                      {/* 1. Status Tag — sticky col 1 */}
                      <td style={{
                        padding: '8px 10px', borderRight: `1px solid ${border}`, fontSize: '11px',
                        position: 'sticky', left: 0, zIndex: 5,
                        backgroundColor: rowBaseBg,
                        width: 125, minWidth: 125, maxWidth: 125,
                      }}>
                        <div className="flex flex-col gap-1.5 items-start">
                          {(() => {
                            const status = (ticket.status || '').toUpperCase()
                            if (isCancelled) {
                              return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/10 text-red-500 border border-red-500/20">Cancelled</span>
                            }
                            if (isInstalled) {
                              return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">✓ Installed</span>
                            }
                            if (status === 'IN_PROGRESS') {
                              return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">In Progress</span>
                            }
                            if (status === 'ON_THE_WAY') {
                              return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">On the Way</span>
                            }
                            if (status === 'ASSIGNED' || isAssigned) {
                              let parsedDetails: any = null
                              if (ticket.acDetails) {
                                try {
                                  parsedDetails = JSON.parse(ticket.acDetails)
                                } catch (e) {}
                              }
                              const hasFinalDate = !!parsedDetails?.finalDate
                              if (ticket.branchId && hasFinalDate) {
                                  return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">Scheduled</span>
                              }
                              return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">Assigned</span>
                            }
                            return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Unassigned</span>
                          })()}
                          {ticket.branchId ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider block w-fit"
                              style={{ 
                                backgroundColor: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.15)', 
                                color: isLight ? '#059669' : '#10B981',
                                border: isLight ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(16,185,129,0.25)'
                              }}>
                              {resolveBranch(ticket.branchId)?.name || 'Assigned'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider block w-fit"
                              style={{ 
                                backgroundColor: isLight ? '#f1f5f9' : '#1E2D48', 
                                color: textMuted,
                                border: `1px solid ${border}`
                              }}>
                              No Branch
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Customer Name — sticky col 2 */}
                      <td style={{
                        padding: '8px 10px', borderRight: `1px solid ${border}`, color: textPrimary,
                        position: 'sticky', left: 125, zIndex: 5,
                        backgroundColor: rowBaseBg,
                        width: 160, minWidth: 160, maxWidth: 160,
                      }} className="font-bold">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-start gap-1.5">
                            <span style={{ color: textMuted, fontSize: '9px', marginTop: '2px' }} className="shrink-0">{idx + 1}</span>
                            <div className="flex flex-col">
                              <span className="text-xs truncate max-w-[130px] block" title={ticket.customerName || 'Direct Client'}>
                                {ticket.customerName || 'Direct Client'}
                              </span>
                              {ticket.controlNumber && (
                                <span className="text-[9px] font-black font-mono tracking-wider mt-0.5 text-slate-400 dark:text-slate-500 block">
                                  {ticket.controlNumber}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Destination — sticky col 3 (freeze line) */}
                      <td style={{
                        padding: '8px 10px', color: textMuted,
                        position: 'sticky', left: 285, zIndex: 5,
                        backgroundColor: rowBaseBg,
                        borderRight: `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                        boxShadow: isLight
                          ? '6px 0 12px -3px rgba(0, 0, 0, 0.12), 2px 0 4px -2px rgba(0, 0, 0, 0.05)'
                          : '8px 0 18px -4px rgba(0, 0, 0, 0.45), 3px 0 6px -3px rgba(0, 0, 0, 0.25)',
                        width: 200, minWidth: 200, maxWidth: 200,
                      }}>
                        <span className="line-clamp-2 text-[11px] leading-relaxed" title={ticket.location || ''}>{ticket.location || '—'}</span>
                      </td>

                      {/* 4. Contact */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, color: '#10B981', fontSize: '11px' }}>
                        <FormatPhone raw={ticket.contactPhone} />
                      </td>

                      {/* 5. Unit/Brand */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, color: textMuted, fontSize: '11px' }}>
                        {(() => {
                          let parsedDetails: any = null
                          if (ticket.acDetails) {
                            try {
                              parsedDetails = JSON.parse(ticket.acDetails)
                            } catch (e) {}
                          }
                          const brand = parsedDetails?.brand || ''
                          const capacity = parsedDetails?.capacity || ''
                          const sku = parsedDetails?.sku || ''
                          
                          if (brand || capacity || sku) {
                            return (
                              <div className="flex flex-col gap-0.5 font-semibold">
                                {(brand || capacity) && <span style={{ color: textPrimary }}>{brand} {capacity}</span>}
                                {sku && <span className="text-[10px] text-slate-400">{sku}</span>}
                              </div>
                            )
                          }
                          return ticket.unitType || <span className="italic">—</span>
                        })()}
                      </td>

                      {/* 6. DLR/Store */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, fontSize: '11px' }}>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider"
                          style={{ backgroundColor: storeStyle.bg, color: storeStyle.color }}>{storeStyle.label}</span>
                      </td>

                      {/* 6b. Relayed Sched */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', textAlign: 'center' }}>
                        {ticket.serviceType ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            {ticket.serviceType}
                          </span>
                        ) : <span className="italic text-[10px]" style={{ color: textMuted }}>—</span>}
                      </td>

                      {/* 6c. Commit */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', textAlign: 'center' }}>
                        {ticket.commitType ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-pink-500/10 text-pink-500 border border-pink-500/20">
                            {ticket.commitType}
                          </span>
                        ) : <span className="italic text-[10px]" style={{ color: textMuted }}>—</span>}
                      </td>

                      {/* 8. Relayed Date */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, color: textPrimary, fontSize: '11px' }}>
                        {(() => {
                          let parsedDetails: any = null
                          if (ticket.acDetails) {
                            try {
                              parsedDetails = JSON.parse(ticket.acDetails)
                            } catch (e) {}
                          }
                          const relayed = parsedDetails?.relayedDate || (ticket.createdAt ? ticket.createdAt.split('T')[0] : '')
                          if (!relayed) return <span className="italic text-[10px]" style={{ color: textMuted }}>—</span>
                          try {
                            const d = new Date(relayed)
                            if (isNaN(d.getTime())) return <span>{relayed}</span>
                            return <span className="whitespace-nowrap font-medium">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          } catch (e) {
                            return <span>{relayed}</span>
                          }
                        })()}
                      </td>

                      {/* 9. Preferred Date */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, color: textPrimary, fontSize: '11px' }}>
                        {(() => {
                          if (!ticket.preferredDate) return <span className="italic text-[10px]" style={{ color: textMuted }}>—</span>
                          try {
                            const d = new Date(ticket.preferredDate)
                            if (isNaN(d.getTime())) return <span>{ticket.preferredDate}</span>
                            return <span className="whitespace-nowrap font-medium">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          } catch (e) {
                            return <span>{ticket.preferredDate}</span>
                          }
                        })()}
                      </td>

                      {/* 10. Final Date */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, color: textPrimary, fontSize: '11px' }}>
                        {(() => {
                          let parsedDetails: any = null
                          if (ticket.acDetails) {
                            try {
                              parsedDetails = JSON.parse(ticket.acDetails)
                            } catch (e) {}
                          }
                          const finalDate = parsedDetails?.finalDate || ''
                          if (!finalDate) return <span className="italic text-[10px]" style={{ color: textMuted }}>—</span>
                          try {
                            const d = new Date(finalDate)
                            if (isNaN(d.getTime())) return <span>{finalDate}</span>
                            return <span className="whitespace-nowrap font-medium">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          } catch (e) {
                            return <span>{finalDate}</span>
                          }
                        })()}
                      </td>

                      {/* 11. Remarks */}
                      <td style={{ padding: '8px 10px', borderRight: `1px solid ${border}`, color: textMuted, minWidth: 180 }}>
                        <span className="line-clamp-2 text-[11px] leading-relaxed" title={ticket.remarksUpdate || ticket.description || ''}>
                          {ticket.remarksUpdate || ticket.description || '—'}
                        </span>
                      </td>

                      {/* 16. Actions */}
                      <td style={{ padding: '8px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => openDrawer(ticket)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all hover:border-[#10B981] hover:text-[#10B981]"
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}>
                            Edit
                          </button>
                          {isAdmin && (
                            <button type="button" onClick={() => handleDeleteTicket(ticket.id, ticket.customerName)}
                              className="px-2 py-1 rounded-lg border border-red-500/20 text-red-500 bg-red-500/5 hover:bg-red-500 hover:text-white transition-all">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full-Page Edit Ticket (replacing Action Drawer) */}
      {isActionDrawerOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: pageBg }}>
          {/* Header */}
          <div className="shrink-0" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                  <Wrench className="w-5 h-5 text-[#10B981]" />
                </div>
                <div>
                  <h2 className="font-black text-base leading-none" style={{ color: textPrimary }}>Manage Client Ticket</h2>
                  <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>
                    ASH{(selectedTicket.id || '').replace(/-/g, '').slice(-6).toUpperCase()} · Edit details and branch assignments
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setIsActionDrawerOpen(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all hover:scale-[1.02]"
                style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}>
                <X className="w-4 h-4" /> Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-8 max-w-5xl mx-auto w-full">
            <div className="flex flex-col gap-6">
              
              {/* Section 1: Customer Details */}
              <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                    <User className="w-3.5 h-3.5 text-[#10B981]" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#10B981]">Client Information</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Customer Name</label>
                    <input type="text" value={editCustomerName} onChange={e => setEditCustomerName(e.target.value)}
                      placeholder="Customer Name" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Primary Phone</label>
                    <input type="text" value={editContactPhone} onChange={e => setEditContactPhone(e.target.value)}
                      placeholder="Primary Contact Number" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Alternate Contact</label>
                    <input type="text" value={editAlternatePhone} onChange={e => setEditAlternatePhone(e.target.value)}
                      placeholder="e.g. Email or Phone number" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Store / Vendor Source</label>
                    <select
                      value={
                        editSourceVendor.toLowerCase().includes('robinsons')
                          ? 'Robinsons'
                          : editSourceVendor.toLowerCase().includes('abenson')
                          ? 'Abenson'
                          : 'Direct'
                      }
                      onChange={e => setEditSourceVendor(e.target.value)}
                      className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                      <option value="Robinsons">Robinsons</option>
                      <option value="Abenson">Abenson</option>
                      <option value="Direct">Direct Store</option>
                    </select>
                    {(editSourceVendor.toLowerCase().includes('robinsons') || editSourceVendor.toLowerCase().includes('abenson')) && (
                      <div className="mt-3">
                        <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>
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
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Destination & Address */}
              <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.12)' }}>
                    <MapPin className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#3B82F6' }}>Destination & Address</p>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Full Address / Destination *</label>
                  <textarea value={editLocation} rows={3}
                    onChange={e => {
                      const val = e.target.value
                      setEditLocation(val)
                      const guessed = guessDistrict(val)
                      if (guessed) setEditDistrict(guessed)
                    }} 
                    placeholder="e.g. Blk 7 Lot 34 Grand Acacia Grove Subd. Brgy Banay-Banay, Cabuyao City Laguna" 
                    className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Landmarks / Directions</label>
                    <input type="text" value={editLandmarks} onChange={e => setEditLandmarks(e.target.value)}
                      placeholder="e.g. Landmark details" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>District</label>
                    <input type="text" value={editDistrict} onChange={e => setEditDistrict(e.target.value)}
                      placeholder="e.g. District 1" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                </div>
              </div>

              {/* Section 3: Aircon Unit Details */}
              <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(139,92,246,0.12)' }}>
                    <Package className="w-3.5 h-3.5" style={{ color: '#8B5CF6' }} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#8B5CF6' }}>Aircon Unit Details</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Brand</label>
                    <input type="text" value={editBrand} onChange={e => setEditBrand(e.target.value)}
                      placeholder="e.g. Midea" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Capacity</label>
                    <input type="text" value={editCapacity} onChange={e => setEditCapacity(e.target.value)}
                      placeholder="e.g. 1.5HP" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>SKU</label>
                    <input type="text" value={editSku} onChange={e => setEditSku(e.target.value)}
                      placeholder="e.g. 47980" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Serial Number</label>
                    <input type="text" value={editSerialNumber} onChange={e => setEditSerialNumber(e.target.value)}
                      placeholder="e.g. 54122000ZAMB3230730794" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Control # / SI Voucher</label>
                    <input type="text" value={editControlNumber} onChange={e => setEditControlNumber(e.target.value)}
                      placeholder="e.g. SI830343" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Service Type</label>
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
                      placeholder="e.g. Installation" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Commit Type / Promo</label>
                    <input type="text" value={editCommitType} onChange={e => setEditCommitType(e.target.value)}
                      placeholder="e.g. Free Installation" className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  {editImages && (
                    <div className="md:col-span-2 rounded-xl p-4 flex items-center justify-between border mt-2" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold" style={{ color: textPrimary }}>Scanned Voucher Document Attached</p>
                          <p className="text-[10px]" style={{ color: textMuted }}>File: {editImages.split('/').pop()}</p>
                        </div>
                      </div>
                      <a href={editImages.startsWith('http') ? editImages : `${API_BASE_URL.replace('/api', '')}${editImages}`}
                         target="_blank" rel="noreferrer"
                         className="px-4 py-2 bg-[#10B981]/10 hover:bg-[#10B981]/25 text-[#10B981] rounded-xl text-xs font-bold transition-all">
                        View Document
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 4: Scheduling & Assignment */}
              <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.12)' }}>
                    <Calendar className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#F59E0B' }}>Scheduling & Assignment</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Service Status</label>
                    <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}
                      className="w-full border rounded-xl px-3 py-3 text-sm outline-none font-bold"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                      <option value="PENDING">Not Assigned (Pending)</option>
                      <option value="ASSIGNED">Scheduled (Assigned)</option>
                      <option value="ON_THE_WAY">On the Way</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Installed (Completed)</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                  {updateStatus !== 'PENDING' && updateStatus !== 'CANCELLED' && (
                    <div>
                      <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Branch Zone</label>
                      <select value={assignBranchId}
                        onChange={e => setAssignBranchId(e.target.value)}
                        className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                        <option value="">Select Branch...</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Relayed Date by Store</label>
                    <input type="date" value={editRelayedDate} onChange={e => setEditRelayedDate(e.target.value)}
                      className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Preferred Date by Customer</label>
                    <input type="date" value={editPreferredDate} onChange={e => setEditPreferredDate(e.target.value)}
                      className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                  </div>
                  {assignBranchId && updateStatus !== 'PENDING' && updateStatus !== 'CANCELLED' && (
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Final Date Assigned by Branch</label>
                      <input type="date" value={editFinalDate} onChange={e => setEditFinalDate(e.target.value)}
                        className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Remarks / Update Notes</label>
                  <textarea value={editRemarksUpdate} onChange={e => setEditRemarksUpdate(e.target.value)} rows={3}
                    placeholder="e.g. Free Installation..." className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                </div>
              </div>

            </div>
          </div>

            {/* Sticky Footer */}
            <div className="shrink-0 px-8 py-4 flex items-center justify-between gap-4" style={{ borderTop: `1px solid ${border}`, backgroundColor: cardBg }}>
              {isAdmin ? (
                <button type="button" onClick={() => handleDeleteTicket(selectedTicket.id, selectedTicket.customerName)}
                  disabled={actionSaving}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all disabled:opacity-50 hover:bg-red-500 hover:text-white hover:border-red-500"
                  style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.06)' }}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete Ticket
                </button>
              ) : <div />}
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsActionDrawerOpen(false)}
                  className="px-6 py-2.5 border rounded-xl text-xs font-bold transition-colors"
                  style={{ borderColor: inputBorder, color: textMuted }}>
                  Cancel
                </button>
                <button type="button" onClick={handleDrawerActionSave} disabled={actionSaving}
                  className="px-10 py-2.5 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-md"
                  style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                  {actionSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
          </div>
        </div>
      )}


      {/* Full-Page Create Ticket */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: pageBg }}>
          <div className="shrink-0" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(16,185,129,0.12)" }}>
                  <User className="w-5 h-5 text-[#10B981]" />
                </div>
                <div>
                  <h2 className="font-black text-base leading-none" style={{ color: textPrimary }}>Create Client Ticket</h2>
                  <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>Fill in client details to schedule a service appointment</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsAddModalOpen(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all hover:scale-[1.02]"
                style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}>
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
          <form onSubmit={handleFormCreateTicket} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
              {/* Form Panel - Centered & Full Width */}
              <div className="flex-1 overflow-y-auto px-6 py-8 max-w-5xl mx-auto w-full">
                <div className="flex flex-col gap-6">
                  
                  {/* AI Extraction Success Banner */}
                  {addForm.images && (
                    <div className="rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border"
                      style={{
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                        borderColor: 'rgba(16, 185, 129, 0.25)',
                        backdropFilter: 'blur(10px)'
                      }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
                          <CheckCircle2 className="w-5 h-5 text-[#10B981] animate-bounce" />
                        </div>
                        <div>
                          <h3 className="font-black text-sm text-[#10B981]">Gemini AI Parser Active</h3>
                          <p className="text-xs" style={{ color: textMuted }}>
                            Client details were successfully extracted from the uploaded voucher. Please review and verify the highlighted fields below.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <a href={addForm.images.startsWith('http') ? addForm.images : `${API_BASE_URL.replace('/api', '')}${addForm.images}`}
                          target="_blank" rel="noreferrer"
                          className="px-4 py-2 border rounded-xl text-xs font-bold transition-all hover:scale-[1.02] shadow-sm flex items-center gap-1.5"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}>
                          <FileText className="w-3.5 h-3.5" /> View Original Doc
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Section 1: Client Info */}
                  <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(16,185,129,0.12)" }}><User className="w-3.5 h-3.5 text-[#10B981]" /></div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#10B981]">Client Information</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Customer Name *</span>
                          {isFieldExtracted(addForm.customerName) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          required
                          value={addForm.customerName}
                          onChange={e => setAddForm(prev => ({ ...prev, customerName: e.target.value }))}
                          placeholder="e.g. Juan Dela Cruz"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.customerName) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.customerName) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.customerName) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Contact Number</span>
                          {isFieldExtracted(addForm.contactPhone) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.contactPhone}
                          onChange={e => setAddForm(prev => ({ ...prev, contactPhone: e.target.value }))}
                          placeholder="e.g. 0917 123 4567"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.contactPhone) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.contactPhone) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.contactPhone) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Alternate Contact</span>
                          {isFieldExtracted(addForm.alternatePhone) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.alternatePhone}
                          onChange={e => setAddForm(prev => ({ ...prev, alternatePhone: e.target.value }))}
                          placeholder="e.g. Email or Phone number"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.alternatePhone) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.alternatePhone) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.alternatePhone) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Store / Vendor Source</span>
                          {isFieldExtracted(addForm.sourceVendor) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                         <select
                          value={
                            (addForm.sourceVendor || '').toLowerCase().includes('robinsons')
                              ? 'Robinsons'
                              : (addForm.sourceVendor || '').toLowerCase().includes('abenson')
                              ? 'Abenson'
                              : 'Direct'
                          }
                          onChange={e => setAddForm(prev => ({ ...prev, sourceVendor: e.target.value }))}
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.sourceVendor) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.sourceVendor) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.sourceVendor) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        >
                          <option value="Robinsons" style={{ color: "#000" }}>Robinsons</option>
                          <option value="Abenson" style={{ color: "#000" }}>Abenson</option>
                          <option value="Direct" style={{ color: "#000" }}>Direct Store</option>
                        </select>
                        {((addForm.sourceVendor || '').toLowerCase().includes('robinsons') || (addForm.sourceVendor || '').toLowerCase().includes('abenson')) && (
                          <div className="mt-3">
                            <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>
                              {(addForm.sourceVendor || '').toLowerCase().includes('robinsons') ? 'Robinsons' : 'Abenson'} Branch Name
                            </label>
                            <input
                              type="text"
                              value={
                                addForm.sourceVendor === 'Robinsons' || addForm.sourceVendor === 'Abenson'
                                  ? ''
                                  : addForm.sourceVendor
                              }
                              onChange={e => {
                                const prefix = (addForm.sourceVendor || '').toLowerCase().includes('robinsons') ? 'Robinsons' : 'Abenson'
                                setAddForm(prev => ({ ...prev, sourceVendor: e.target.value || prefix }))
                              }}
                              placeholder={(addForm.sourceVendor || '').toLowerCase().includes('robinsons') ? "e.g. Robinsons Tagaytay" : "e.g. Abenson Silang"}
                              className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Location */}
                  <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.12)" }}><MapPin className="w-3.5 h-3.5" style={{ color: "#3B82F6" }} /></div>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#3B82F6" }}>Destination & Address</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                        <span>Full Address / Destination *</span>
                        {isFieldExtracted(addForm.locationRaw) && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            ✓ Auto-extracted
                          </span>
                        )}
                      </label>
                      <textarea
                        required
                        value={addForm.locationRaw}
                        onChange={e => {
                          const val = e.target.value
                          setAddForm(prev => {
                            const guessed = guessDistrict(val)
                            return {
                              ...prev,
                              locationRaw: val,
                              district: guessed || prev.district
                            }
                          })
                        }}
                        placeholder="e.g. Blk 7 Lot 34 Grand Acacia Grove Subd. Brgy Banay-Banay, Cabuyao City Laguna"
                        className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none transition-all duration-200"
                        style={{
                          backgroundColor: isFieldExtracted(addForm.locationRaw) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                          borderColor: isFieldExtracted(addForm.locationRaw) ? '#10B981' : inputBorder,
                          boxShadow: isFieldExtracted(addForm.locationRaw) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                          color: textPrimary
                        }}
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Landmarks / Directions</span>
                          {isFieldExtracted(addForm.landmarks) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.landmarks}
                          onChange={e => setAddForm(prev => ({ ...prev, landmarks: e.target.value }))}
                          placeholder="e.g. Landmark details"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.landmarks) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.landmarks) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.landmarks) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>District / Zone</span>
                          {isFieldExtracted(addForm.district) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-assigned
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.district}
                          onChange={e => setAddForm(prev => ({ ...prev, district: e.target.value }))}
                          placeholder="e.g. District 1"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.district) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.district) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.district) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Aircon Unit Details */}
                  <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(139,92,246,0.12)" }}><Package className="w-3.5 h-3.5" style={{ color: "#8B5CF6" }} /></div>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#8B5CF6" }}>Aircon Unit Details</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Brand</span>
                          {isFieldExtracted(addForm.brand) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.brand}
                          onChange={e => setAddForm(prev => ({ ...prev, brand: e.target.value }))}
                          placeholder="e.g. Midea"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.brand) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.brand) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.brand) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Capacity</span>
                          {isFieldExtracted(addForm.capacity) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.capacity}
                          onChange={e => setAddForm(prev => ({ ...prev, capacity: e.target.value }))}
                          placeholder="e.g. 1.5HP"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.capacity) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.capacity) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.capacity) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>SKU</span>
                          {isFieldExtracted(addForm.sku) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.sku}
                          onChange={e => setAddForm(prev => ({ ...prev, sku: e.target.value }))}
                          placeholder="e.g. 47980"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.sku) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.sku) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.sku) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Serial Number</span>
                          {isFieldExtracted(addForm.serialNumber) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.serialNumber}
                          onChange={e => setAddForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                          placeholder="e.g. 54122000ZAMB3230730794"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.serialNumber) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.serialNumber) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.serialNumber) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Control # / SI Voucher</span>
                          {isFieldExtracted(addForm.controlNumber) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.controlNumber}
                          onChange={e => setAddForm(prev => ({ ...prev, controlNumber: e.target.value }))}
                          placeholder="e.g. SI830343"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.controlNumber) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.controlNumber) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.controlNumber) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Service Type</span>
                          {isFieldExtracted(addForm.serviceType) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.serviceType}
                          onChange={e => {
                            const val = e.target.value
                            setAddForm(prev => {
                              let mappedSvc = val
                              const isInstall = val.toLowerCase().includes('install') || val.toUpperCase() === 'S/I'
                              const isSurvey = val.toLowerCase().includes('survey') || val.toUpperCase() === 'SURVEY'
                              if (isInstall) {
                                mappedSvc = 'S/I'
                              } else if (isSurvey) {
                                mappedSvc = 'SURVEY'
                              }
                              return {
                                ...prev,
                                serviceType: mappedSvc,
                                title: `${mappedSvc} service`,
                                commitType: isInstall ? 'FREE FIRST 10 FEET' : prev.commitType
                              }
                            })
                          }}
                          placeholder="e.g. Installation"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.serviceType) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.serviceType) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.serviceType) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                          <span>Commit Type / Promo</span>
                          {isFieldExtracted(addForm.commitType) && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Auto-extracted
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={addForm.commitType}
                          onChange={e => setAddForm(prev => ({ ...prev, commitType: e.target.value }))}
                          placeholder="e.g. Free Installation"
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all duration-200"
                          style={{
                            backgroundColor: isFieldExtracted(addForm.commitType) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                            borderColor: isFieldExtracted(addForm.commitType) ? '#10B981' : inputBorder,
                            boxShadow: isFieldExtracted(addForm.commitType) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                            color: textPrimary
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Scheduling & Assignment */}
                  <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}><Calendar className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} /></div>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#F59E0B" }}>Scheduling & Assignment</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Service Status</label>
                        <select value={addForm.status} onChange={e => setAddForm(prev => ({ ...prev, status: e.target.value }))}
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none font-bold"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                          <option value="PENDING">Not Assigned (Pending)</option>
                          <option value="ASSIGNED">Scheduled (Assigned)</option>
                          <option value="ON_THE_WAY">On the Way</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Installed (Completed)</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </div>
                      {addForm.status !== 'PENDING' && addForm.status !== 'CANCELLED' && (
                        <div>
                          <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Branch Zone Assignment</label>
                          <select value={addForm.branchId} onChange={e => setAddForm(prev => ({ ...prev, branchId: e.target.value }))}
                            className="w-full border rounded-xl px-3 py-3 text-sm outline-none font-bold animate-fade-in"
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                            <option value="">Select Branch...</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Relayed Date by Store</label>
                        <input type="date" value={addForm.relayedDate} onChange={e => setAddForm(prev => ({ ...prev, relayedDate: e.target.value }))}
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Preferred Date by Customer</label>
                        <input type="date" value={addForm.preferredDate} onChange={e => setAddForm(prev => ({ ...prev, preferredDate: e.target.value }))}
                          className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                      </div>
                      {addForm.branchId && addForm.status !== 'PENDING' && addForm.status !== 'CANCELLED' && (
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-black uppercase block mb-1.5" style={{ color: textMuted }}>Final Date Assigned by Branch</label>
                          <input type="date" value={addForm.finalDate} onChange={e => setAddForm(prev => ({ ...prev, finalDate: e.target.value }))}
                            className="w-full border rounded-xl px-3 py-3 text-sm outline-none"
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase flex items-center justify-between mb-1.5" style={{ color: textMuted }}>
                        <span>Remarks / Special Instructions</span>
                        {isFieldExtracted(addForm.description) && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-[#10B981] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            ✓ Auto-extracted
                          </span>
                        )}
                      </label>
                      <textarea
                        value={addForm.description}
                        onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value, remarksUpdate: e.target.value }))}
                        rows={3}
                        placeholder="e.g. Free Installation..."
                        className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none transition-all duration-200"
                        style={{
                          backgroundColor: isFieldExtracted(addForm.description) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
                          borderColor: isFieldExtracted(addForm.description) ? '#10B981' : inputBorder,
                          boxShadow: isFieldExtracted(addForm.description) ? '0 0 0 2px rgba(16,185,129,0.1)' : 'none',
                          color: textPrimary
                        }}
                      />
                    </div>
                  </div>

                </div>
              </div>

            </div>
            {/* Sticky Footer - Restored */}
            <div className="shrink-0 px-8 py-4 flex items-center justify-between gap-4" style={{ borderTop: `1px solid ${border}`, backgroundColor: cardBg }}>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex items-center gap-2 px-6 py-2.5 border rounded-xl text-sm font-bold transition-all hover:scale-[1.02]" style={{ borderColor: inputBorder, color: textMuted }}>
                ← Back to Masterlist
              </button>
              <button type="submit" disabled={formSubmitting} className="px-10 py-2.5 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-lg hover:scale-[1.01]" style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}>
                {formSubmitting ? "Creating..." : "+ Create Client Ticket"}
              </button>
            </div>
          </form>
        </div>
      )}


      {/* ── Excel Sheet Preview Modal ────────────────────────── */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-5xl rounded-2xl flex flex-col shadow-2xl overflow-hidden"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}>

            {/* Header */}
            <div className="shrink-0">
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.12)' }}>
                    <FileSpreadsheet className="w-5 h-5" style={{ color: '#3B82F6' }} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm" style={{ color: textPrimary }}>Spreadsheet Ingestion Preview</h3>
                    <p className="text-[10px]" style={{ color: textMuted }}>{excelPreview.length} client records parsed — verify before importing</p>
                  </div>
                </div>
                <button type="button" onClick={() => { setExcelPreview([]); setIsExcelModalOpen(false); setImportTargetBranchId('') }}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" style={{ color: textMuted }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs min-w-[1400px]">
                <thead>
                  <tr style={{ backgroundColor: inputBg, color: textMuted, borderBottom: `1px solid ${border}` }}
                    className="font-black uppercase tracking-wider text-[9px]">
                    <th className="px-4 py-3 w-[150px]">Priority Tag</th>
                    <th className="px-4 py-3 w-[200px]">Client Name</th>
                    <th className="px-4 py-3 w-[250px]">Address</th>
                    <th className="px-4 py-3 w-[120px]">District</th>
                    <th className="px-4 py-3 w-[120px]">Phone</th>
                    <th className="px-4 py-3 w-[120px]">AC Type</th>
                    <th className="px-4 py-3 w-[140px]">Store Source</th>
                    <th className="px-4 py-3 w-[120px]">Service Type</th>
                    <th className="px-4 py-3 w-[120px]">Control # / SI</th>
                    <th className="px-4 py-3 w-[250px]">Update / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreview.map((item, index) => (
                    <tr key={item.id} style={{ borderBottom: index < excelPreview.length - 1 ? `1px solid ${border}` : 'none' }}>
                      <td className="px-4 py-2.5 font-semibold">
                        {item.priorityTag ? (
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            item.priorityTag.toUpperCase().includes('MORNING') ? 'bg-red-500/10 text-red-500' :
                            item.priorityTag.toUpperCase().includes('OLD') ? 'bg-amber-500/10 text-amber-500' :
                            'bg-blue-500/10 text-blue-500'
                          }`}>{item.priorityTag}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: textPrimary }}>{item.customerName}</td>
                      <td className="px-4 py-2.5" style={{ color: textMuted }}>{item.location}</td>
                      <td className="px-4 py-2.5" style={{ color: textPrimary }}>{item.district || '—'}</td>
                      <td className="px-4 py-2.5 text-emerald-500"><FormatPhone raw={item.contactPhone} /></td>
                      <td className="px-4 py-2.5" style={{ color: textMuted }}>{item.unitType}</td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: textPrimary }}>{item.sourceVendor}</td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: textPrimary }}>{item.serviceType}</td>
                      <td className="px-4 py-2.5 font-mono font-bold" style={{ color: textPrimary }}>{item.controlNumber || '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: textMuted }}>{item.remarksUpdate || item.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#3B82F6' }} />
                <select value={importTargetBranchId} onChange={e => setImportTargetBranchId(e.target.value)}
                  className="rounded-xl px-3 py-2 text-xs font-bold outline-none border w-full sm:w-56"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                  <option value="">Assign to Branch...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 w-full sm:w-auto justify-end">
                <button type="button" onClick={() => { setExcelPreview([]); setIsExcelModalOpen(false); setImportTargetBranchId('') }}
                  className="px-5 py-2.5 border rounded-xl text-xs font-bold"
                  style={{ borderColor: inputBorder, color: textMuted }}>
                  Cancel
                </button>
                <button type="button" onClick={handleBulkUploadSubmit}
                  disabled={bulkUploading || !importTargetBranchId}
                  className="px-6 py-2.5 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-md"
                  style={{ background: bulkUploading || !importTargetBranchId ? undefined : 'linear-gradient(135deg, #3B82F6, #6366F1)', backgroundColor: bulkUploading || !importTargetBranchId ? '#475569' : undefined }}>
                  {bulkUploading ? 'Uploading...' : `Import ${excelPreview.length} Records`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Action Hub / Ticket Preview Modal ──────────────── */}
      {selectedPreviewTicket && !isViewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#10B981]">Quick Actions</span>
                <h3 className="text-base font-black tracking-tight" style={{ color: textPrimary }}>Ticket Hub</h3>
              </div>
              <button onClick={() => setSelectedPreviewTicket(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 flex flex-col gap-4">
              {/* Customer summary */}
              <div>
                <h4 className="text-lg font-bold" style={{ color: textPrimary }}>
                  {selectedPreviewTicket.customerName || 'Direct Client'}
                </h4>
                {selectedPreviewTicket.controlNumber && (
                  <span className="text-[10px] font-bold font-mono tracking-wider text-slate-400 dark:text-slate-500 block mt-0.5">
                    CONTROL #: {selectedPreviewTicket.controlNumber}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-3 text-xs">
                {/* Status Row */}
                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: border }}>
                  <span className="font-semibold" style={{ color: textMuted }}>Status</span>
                  <div className="flex flex-col items-end gap-1">
                    {(() => {
                      const isCancelled = selectedPreviewTicket.status.toUpperCase() === 'CANCELLED'
                      const isInstalled = selectedPreviewTicket.status.toUpperCase() === 'COMPLETED' || !!(selectedPreviewTicket.installationCharges && selectedPreviewTicket.installationCharges > 0)
                      const isAssigned = !!(selectedPreviewTicket.assignedTo || selectedPreviewTicket.branchId)
                      const status = (selectedPreviewTicket.status || '').toUpperCase()

                      if (isCancelled) {
                        return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/10 text-red-500 border border-red-500/20">Cancelled</span>
                      }
                      if (isInstalled) {
                        return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">✓ Installed</span>
                      }
                      if (status === 'IN_PROGRESS') {
                        return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">In Progress</span>
                      }
                      if (status === 'ON_THE_WAY') {
                        return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">On the Way</span>
                      }
                      if (status === 'ASSIGNED' || isAssigned) {
                        return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">Assigned</span>
                      }
                      return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Unassigned</span>
                    })()}
                    {selectedPreviewTicket.branchId && (
                      <span className="text-[9px] font-bold text-slate-400">
                        {resolveBranch(selectedPreviewTicket.branchId)?.name} Branch
                      </span>
                    )}
                  </div>
                </div>

                {/* Destination Row */}
                <div className="flex flex-col gap-1 py-1 border-b" style={{ borderColor: border }}>
                  <span className="font-semibold" style={{ color: textMuted }}>Destination</span>
                  <span className="font-medium" style={{ color: textPrimary }}>{selectedPreviewTicket.location || '—'}</span>
                </div>

                {/* Contact Row */}
                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: border }}>
                  <span className="font-semibold" style={{ color: textMuted }}>Contact No.</span>
                  <div className="text-emerald-500 font-semibold">
                    <FormatPhone raw={selectedPreviewTicket.contactPhone} />
                  </div>
                </div>

                {/* Brand / Unit Row */}
                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: border }}>
                  <span className="font-semibold" style={{ color: textMuted }}>Brand / Unit</span>
                  <span className="font-semibold" style={{ color: textPrimary }}>
                    {(() => {
                      let parsedDetails: any = null
                      if (selectedPreviewTicket.acDetails) {
                        try {
                          parsedDetails = JSON.parse(selectedPreviewTicket.acDetails)
                        } catch (e) {}
                      }
                      const brand = parsedDetails?.brand || ''
                      const capacity = parsedDetails?.capacity || ''
                      if (brand || capacity) return `${brand} ${capacity}`.trim()
                      return selectedPreviewTicket.unitType || '—'
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 flex gap-2.5 justify-end" style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
              <button type="button" onClick={() => setSelectedPreviewTicket(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-900"
                style={{ borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button type="button" onClick={() => setIsViewModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:opacity-90"
                style={{ backgroundColor: isLight ? '#f0fdf4' : 'rgba(16,185,129,0.08)', borderColor: isLight ? '#bbf7d0' : 'rgba(16,185,129,0.25)', color: '#059669' }}>
                <Eye className="w-3.5 h-3.5" /> View Details
              </button>
              <button type="button" onClick={() => { openDrawer(selectedPreviewTicket); setSelectedPreviewTicket(null); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                <Wrench className="w-3.5 h-3.5" /> Edit Ticket
              </button>
            </div>

          </div>
        </div>
      )}

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

    </div>
  )
}