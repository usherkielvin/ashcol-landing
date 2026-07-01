import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
import { useLocation } from 'react-router-dom'
import {
  Search, FileSpreadsheet, AlertTriangle, X, FileText, Loader2,
  Building2, Trash2, User, MapPin,
  ChevronDown, Plus, CheckCircle2, AlertCircle, Package, FileUp,
  Eye, Phone, LayoutGrid, List, CheckSquare, Square, Edit3
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin, branchScopesMatch, filterBranchNegotiators } from '../utils/api'
import { readTabCache, relaysCacheKey, writeTabCache, type RelaysTabCache } from '../utils/ticketTabCache'
import { resetTicketTableScroll } from '../utils/tabSwitch'
import * as XLSX from 'xlsx'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import { FilterPills } from '../components/TicketSectionNav'

interface Ticket {
  id: string
  customerId: string
  createdBy?: string
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
  ticketNumber?: string
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

type StoreCategory = 'Robinsons' | 'Abenson' | 'Direct' | 'Other'

const parseStoreVendor = (sourceVendor?: string): { store: StoreCategory; branch: string; customStore?: string } => {
  const sv = (sourceVendor || '').trim()
  const lower = sv.toLowerCase()
  if (lower.includes('robinsons')) {
    const branch = sv.replace(/^robinsons(\s+b2b)?\s*/i, '').trim()
    return { store: 'Robinsons', branch }
  }
  if (lower.includes('abenson')) {
    const branch = sv.replace(/^abenson(\s+b2b)?\s*/i, '').trim()
    return { store: 'Abenson', branch }
  }
  if (lower === 'direct' || !sv) {
    return { store: 'Direct', branch: '' }
  }
  // It's a custom store! Try to split by ' - ' to separate store name and branch name
  const parts = sv.split(' - ')
  const customStore = parts[0]?.trim() || ''
  const branch = parts.slice(1).join(' - ').trim()
  return { store: 'Other', branch, customStore }
}

const combineStoreVendor = (store: StoreCategory, branch: string, customStore?: string): string => {
  if (store === 'Direct') return 'Direct'
  if (store === 'Other') {
    const s = (customStore || '').trim()
    const b = branch.trim()
    if (!s) return 'Other'
    return b ? `${s} - ${b}` : s
  }
  const b = branch.trim()
  if (!b) return store
  if (b.toLowerCase().startsWith(store.toLowerCase())) return b
  return `${store} ${b}`
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


const parseAcDetails = (ticket: Ticket) => {
  const fallback = { landmarks: '', brand: '', capacity: '', sku: '', serialNumber: '', alternatePhone: '', relayedDate: '', finalDate: '' }
  if (!ticket.acDetails) return fallback
  try {
    return { ...fallback, ...JSON.parse(ticket.acDetails) }
  } catch (e) {
    return fallback
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

const getTicketCategory = (ticket: Ticket) => {
  const raw = `${ticket.serviceType || ''} ${ticket.title || ''}`.toLowerCase()
  if (raw.includes('collection') || raw.includes('collect')) return 'Collection'
  if (raw.includes('install') || raw.includes('s/i') || raw.includes(' si ')) return 'Survey & Install'
  if (raw.includes('survey')) return 'Survey'
  if (raw.includes('service') || raw.includes('clean')) return 'Service'
  return ticket.serviceType || 'Service'
}

const isCollectionPaid = (ticket: Ticket) => {
  const hasAmount = !!(ticket.installationCharges && ticket.installationCharges > 0)
  const hasPayment = !!(ticket.modeOfPayment && ticket.modeOfPayment.trim())
  const remarks = (ticket.remarksUpdate || '').toLowerCase()
  return hasAmount && (hasPayment || remarks.includes('paid') || remarks.includes('collected'))
}

export default function ClientMasterlist() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  const location = useLocation()
  const isMyTicketsOnly = location.pathname === '/my-tickets'

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

    // 4. Loose substring name match
    found = branches.find(b => b.name.toLowerCase().includes(idLower) || idLower.includes(b.name.toLowerCase()))
    if (found) return found

    return null
  }

  const formatAssignedBranchLabel = (branchId?: string) => {
    const resolved = resolveBranch(branchId)
    if (!resolved && !branchId) return '—'
    const id = (resolved?.id || branchId || '').toUpperCase()
    const name = resolved?.name || ''
    if (id === 'BR-TAGUIG-SALES' || id.endsWith('-SALES')) return 'TAGUIG - SALES'
    if (id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || id.endsWith('-SERVICES') || id.endsWith('-SERVICE')) {
      return 'TAGUIG - SERVICES'
    }
    return formatBranchName(name) || '—'
  }

  const [loading, setLoading] = useState(true)
  const [lastUpdatedTicketId, setLastUpdatedTicketId] = useState<string | null>(null)

  useEffect(() => {
    if (lastUpdatedTicketId) {
      const timer = setTimeout(() => {
        setLastUpdatedTicketId(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [lastUpdatedTicketId])

  const [refreshing, setRefreshing] = useState(false)

  const fetchSeqRef = useRef(0)
  const hasLoadedOnceRef = useRef(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [storeFilter, setStoreFilter] = useState('ALL')
  const [branchFilter, setBranchFilter] = useState('ALL')
  const [activeTab, setActiveTab] = useState<'ALL_PENDING' | 'UNASSIGNED' | 'PENDING' | 'MY_TICKETS'>(
    () => (location.pathname === '/my-tickets' ? 'MY_TICKETS' : 'ALL_PENDING')
  )
  const ticketScope: 'ALL' | 'MY' = !isAdmin ? 'MY' : 'ALL'

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
    otherStoreName: '',
    storeBranch: '',
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
    ticketNumber: '',
    assignedTo: '',
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
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null)
  const [inlineFinalDates, setInlineFinalDates] = useState<Record<string, string>>({})
  const [employees, setEmployees] = useState<any[]>([])
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )
  useEffect(() => {
    const sync = () => setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [])

  const negotiators = useMemo(() => {
    const branchSource = (isMyTicketsOnly && isAdmin) ? globalBranchId : branchFilter
    const scopedBranch = branchSource && branchSource !== 'ALL' && branchSource !== 'ALL_BRANCHES'
      ? branchSource
      : (globalBranchId || user?.branchId || null)
    return filterBranchNegotiators(employees, scopedBranch)
  }, [employees, branchFilter, globalBranchId, isMyTicketsOnly, isAdmin, user?.branchId])

  const handleSaveFinalDateInline = async (ticket: Ticket) => {
    const newFinalDate = inlineFinalDates[ticket.id]
    if (newFinalDate === undefined) return

    setInlineSavingId(ticket.id)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const parsedDetails = parseAcDetails(ticket)
      const newDetailsObj = {
        ...parsedDetails,
        finalDate: newFinalDate
      }

      const res = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          acDetails: JSON.stringify(newDetailsObj)
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.message || `Status ${res.status}`)
      }

      setTickets(prev => prev.map(t => {
        if (t.id === ticket.id) {
          return {
            ...t,
            acDetails: JSON.stringify(newDetailsObj)
          }
        }
        return t
      }))

      setInlineFinalDates(prev => {
        const copy = { ...prev }
        delete copy[ticket.id]
        return copy
      })

      alert('Final schedule updated successfully.')
    } catch (e: any) {
      alert(`Failed to update final schedule: ${e.message}`)
    } finally {
      setInlineSavingId(null)
    }
  }

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
  const editRemarksRef = useRef<HTMLTextAreaElement>(null)
  const editCommitRef = useRef<HTMLInputElement>(null)
  const [editPhoneNumbers, setEditPhoneNumbers] = useState<string[]>([''])
  const [editBrandHP, setEditBrandHP] = useState('')
  const [editInstallationCharges, setEditInstallationCharges] = useState(0)
  const [editModeOfPayment, setEditModeOfPayment] = useState('')
  const [editControlNumber, setEditControlNumber] = useState('')
  const [editTicketNumber, setEditTicketNumber] = useState('')

  const [editStoreCategory, setEditStoreCategory] = useState<StoreCategory>('Direct')
  const [editStoreBranch, setEditStoreBranch] = useState('')
  const [editOtherStoreName, setEditOtherStoreName] = useState('')
  const [editUnitType, setEditUnitType] = useState('')
  const [editServiceType, setEditServiceType] = useState('')
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editLandmarks, setEditLandmarks] = useState('')
  const [editBrand, setEditBrand] = useState('')
  const [editCapacity, setEditCapacity] = useState('')
  const [editSku, setEditSku] = useState('')
  const [editSerialNumber, setEditSerialNumber] = useState('')

  const [editImages, setEditImages] = useState('')
  const [editRelayedDate, setEditRelayedDate] = useState('')
  const [editFinalDate, setEditFinalDate] = useState('')

  // Column configuration for expand / collapse functionality
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})

  const tableRowBorder = isLight ? '#cbd5e1' : '#2a3f5f'
  const tableColBorder = `1px solid ${tableRowBorder}`
  const cellPadY = 8
  const cellPadX = 10
  const headerPadY = 9
  const tableFontSize = '11px'
  const headerFontSize = '10px'

  const toggleColumn = useCallback((colLabel: string) => {
    setExpandedCols(prev => ({
      ...prev,
      [colLabel]: !prev[colLabel]
    }))
  }, [])

  const columns = useMemo(() => {
    const rawCols = activeTab === 'MY_TICKETS' ? [
      { label: 'TICKET NO',        weight: 6,  expMul: 1.3,  sticky: true,  freeze: true,  center: true, right: false },
      { label: 'STATUS',           weight: 6,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
      { label: 'NEGOTIATOR',       weight: 9,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'CUSTOMER NAME',    weight: 11, expMul: 1.45, sticky: false, freeze: false, center: true, right: false },
      { label: 'ADDRESS / DISTRICT', weight: 14, expMul: 1.5, sticky: false, freeze: false, center: true, right: false },
      { label: 'BRAND',            weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'STORE / SOURCE',   weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'COMMIT',           weight: 9,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'INSTALLER',        weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'DRIVER',           weight: 7,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
      { label: 'PREFERRED DATE',   weight: 8,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
      { label: 'FINAL DATE',       weight: 8,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
      { label: 'REMARKS',          weight: 11, expMul: 1.45, sticky: false, freeze: false, center: true, right: false },
      { label: 'PAYMENT',          weight: 7,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
      { label: 'ACTIONS',          weight: 6,  expMul: 1.3,  sticky: false, freeze: false, center: true, right: false },
    ] : [
      { label: 'TICKET NO',    weight: 7,  expMul: 1.35, sticky: true,  freeze: true,  center: true, right: false },
      { label: 'STATUS',       weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'CATEGORY',     weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'CUSTOMER NAME', weight: 14, expMul: 1.5,  sticky: false, freeze: false, center: true, right: false },
      { label: 'DISTRICT',     weight: 8,  expMul: 1.4,  sticky: false, freeze: false, center: true, right: false },
      { label: 'STORE/SOURCE', weight: 9,  expMul: 1.4,  sticky: false, freeze: false, center: true, right: false },
      { label: 'DATE RELAYED', weight: 8,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'BRANCH',       weight: 7,  expMul: 1.35, sticky: false, freeze: false, center: true, right: false },
      { label: 'NEGOTIATOR',   weight: 8,  expMul: 1.4,  sticky: false, freeze: false, center: true, right: false },
      { label: 'LAST UPDATE',  weight: 15, expMul: 1.55, sticky: false, freeze: false, center: true, right: false },
    ]

    const weights = rawCols.map(col => {
      const isExpanded = !!expandedCols[col.label]
      return col.weight * (isExpanded ? col.expMul : 1)
    })
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)

    return rawCols.map((col, idx) => ({
      ...col,
      isExpanded: !!expandedCols[col.label],
      w: `${((weights[idx] / totalWeight) * 100).toFixed(2)}%`,
      left: col.sticky ? 0 : undefined,
    }))
  }, [expandedCols, activeTab])

  const columnCellStyle = (col: (typeof columns)[number]) => ({
    width: col.w,
    minWidth: col.w,
    maxWidth: col.w,
    boxSizing: 'border-box' as const,
  })

  const columnTextAlign = (col: (typeof columns)[number], cell?: { right?: boolean; center?: boolean }) => {
    if (cell?.right || col.right) return 'right' as const
    if (cell?.center ?? col.center) return 'center' as const
    return 'center' as const
  }

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ticket: Ticket } | null>(null)

  // Close context menu on any click (excluding clicks inside the context menu itself)
  useEffect(() => {
    const handleClose = (e: MouseEvent) => {
      const menu = document.getElementById('context-menu')
      if (menu && menu.contains(e.target as Node)) {
        return
      }
      setContextMenu(null)
    }
    window.addEventListener('click', handleClose)
    return () => window.removeEventListener('click', handleClose)
  }, [])

  useEffect(() => {
    if (isMyTicketsOnly) {
      setActiveTab('MY_TICKETS')
      return
    }
    if (user) {
      const roleLower = (user.role || '').toLowerCase()
      const isPriv = roleLower === 'admin' || roleLower === 'management' || roleLower === 'administrator'
      if (!isPriv) {
        setActiveTab('MY_TICKETS')
      }
    }
  }, [user, isMyTicketsOnly])

  const handleRelayTabChange = useCallback((
    next: 'ALL_PENDING' | 'UNASSIGNED' | 'PENDING' | 'MY_TICKETS',
  ) => {
    if (next === activeTab) return
    setActiveTab(next)
    setContextMenu(null)
    setSelectedPreviewTicket(null)
    resetTicketTableScroll()
  }, [activeTab])

  useLayoutEffect(() => {
    resetTicketTableScroll()
  }, [activeTab, isMyTicketsOnly])

  // Load Initial Data — cache-first, background refresh
  const fetchData = useCallback(async (options?: { soft?: boolean }) => {
    const seq = ++fetchSeqRef.current
    const cacheKey = relaysCacheKey(ticketScope, user, globalBranchId)
    const cached = readTabCache<RelaysTabCache>(cacheKey)
    const hasCache = Array.isArray(cached?.tickets) && cached.tickets.length > 0
    const showSkeleton = !options?.soft && !hasLoadedOnceRef.current && !hasCache

    if (hasCache) {
      setTickets(cached!.tickets as Ticket[])
      if (cached!.branches?.length) setBranches(cached!.branches as { id: string; name: string }[])
      if (cached!.employees?.length) setEmployees(cached!.employees as any[])
      hasLoadedOnceRef.current = true
      if (!showSkeleton) setLoading(false)
    }
    if (showSkeleton) setLoading(true)
    else setRefreshing(true)

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const endpoint = ticketScope === 'MY' ? '/tickets/assigned' : '/tickets'

      const [ticketRes, branchRes, empRes] = await Promise.all([
        fetch(`${API_BASE_URL}${endpoint}?page=0&size=100`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/user/all`, { headers: { Authorization: `Bearer ${token}` } }),
      ])

      if (seq !== fetchSeqRef.current) return

      let tList: Ticket[] = hasCache ? (cached!.tickets as Ticket[]) : []
      let bList: { id: string; name: string }[] = hasCache && cached!.branches
        ? (cached!.branches as { id: string; name: string }[])
        : []
      let eList: Array<Record<string, unknown>> = hasCache && cached!.employees
        ? (cached!.employees as Array<Record<string, unknown>>)
        : []

      if (ticketRes.ok) {
        const payload = await ticketRes.json()
        tList = payload?.data?.tickets || payload?.tickets || []
        setTickets(tList)
      }

      if (branchRes.ok) {
        const payload = await branchRes.json()
        bList = payload?.data || payload || []
        setBranches(bList)
      }

      if (empRes.ok) {
        const payload = await empRes.json()
        const rawList: Array<Record<string, unknown>> = payload?.data || payload || []
        eList = rawList.map((e) => ({
          ...e,
          branchId: e.branchId || e.branch_id || '',
          jobTitle: e.jobTitle || e.job_title || '',
        }))
        setEmployees(eList as any[])
      }

      writeTabCache(cacheKey, { tickets: tList, branches: bList, employees: eList })
      hasLoadedOnceRef.current = true
    } catch (e) {
      console.error('Error fetching data:', e)
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [ticketScope, user, globalBranchId])

  useEffect(() => {
    const cacheKey = relaysCacheKey(ticketScope, user, globalBranchId)
    const cached = readTabCache<RelaysTabCache>(cacheKey)
    const hasCache = Array.isArray(cached?.tickets) && cached.tickets.length > 0
    if (hasCache) {
      setTickets(cached!.tickets as Ticket[])
      if (cached!.branches?.length) setBranches(cached!.branches as { id: string; name: string }[])
      if (cached!.employees?.length) {
        setEmployees(cached!.employees as any[])
      }
      setLoading(false)
      hasLoadedOnceRef.current = true
    } else {
      hasLoadedOnceRef.current = false
    }
    void fetchData({ soft: hasCache })
  }, [fetchData, ticketScope, user, globalBranchId])

  // Decoupled global branch sync for admin in Relay Monitoring to display all tickets by default.

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
        const parsedStore = parseStoreVendor(parsed.sourceVendor || 'Robinsons')

        setAddForm({
          title: `${mappedSvc} service`,
          description: parsed.description || 'Voucher scanned via Gemini AI.',
          serviceType: mappedSvc,
          customerName: customerNameVal,
          contactPhone: contactPhoneVal,
          locationRaw: locationVal,
          sourceVendor: parsedStore.store,
          otherStoreName: parsedStore.customStore || '',
          storeBranch: parsedStore.branch,
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
          ticketNumber: '',
          assignedTo: '',
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
              location: getVal(row, colIndices.location).trim() || 'No Address Provided',
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
            location: item.location ? item.location.trim() : 'No Address Provided',
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
    fetchData({ soft: true })
  }

  // Submit parsed/manual ticket
  const handleFormCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.assignedTo) {
      alert('Negotiator is required')
      return
    }
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
          location: addForm.locationRaw?.trim() || 'No Address Provided',
          sourceVendor: combineStoreVendor(
            (addForm.sourceVendor || 'Direct') as StoreCategory,
            addForm.storeBranch || '',
            addForm.otherStoreName
          ),
          preferredDate: addForm.preferredDate || undefined,
          slaExpirationDate: addForm.slaExpirationDate ? new Date(addForm.slaExpirationDate).toISOString() : undefined,
          priorityTag: addForm.priorityTag || undefined,
          district: addForm.district || undefined,
          commitType: addForm.commitType || undefined,
          installerName: addForm.installerName || undefined,
          assignedTo: addForm.assignedTo || undefined,
          serviceVehicle: addForm.serviceVehicle || undefined,
          remarksUpdate: addForm.remarksUpdate || undefined,
          installationCharges: isCollectionTicket ? (Number(addForm.installationCharges) || 0) : 0,
          modeOfPayment: isCollectionTicket ? (addForm.modeOfPayment || undefined) : undefined,
          controlNumber: addForm.controlNumber || undefined,
          ticketNumber: addForm.ticketNumber?.trim() || undefined,
          acDetails: JSON.stringify(acDetailsObj),
          images: addForm.images || undefined,
          status: addForm.status,
          branchId: addForm.branchId || undefined
        })
      })

      if (!res.ok) throw new Error('Create request failed')

      const payload = await res.json().catch(() => null)
      const createdTicket = payload?.data || payload
      if (createdTicket && createdTicket.id) {
        setLastUpdatedTicketId(createdTicket.id)
      }

      setIsAddModalOpen(false)
      setAddForm({
        title: 'Installation service',
        description: '',
        serviceType: 'Installation',
        customerName: '',
        contactPhone: '',
        locationRaw: '',
        sourceVendor: 'Robinsons',
        otherStoreName: '',
        storeBranch: '',
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
        ticketNumber: '',
        assignedTo: '',
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
      fetchData({ soft: true })
    } catch (e) {
      alert('Could not submit ticket.')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Save changes in action drawer
  const handleDrawerActionSave = async () => {
    if (!selectedTicket) return
    if (!assignTechId) {
      alert('Negotiator is required')
      return
    }
    setActionSaving(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const payload: Record<string, any> = {}
      const keepPendingAssignment = selectedTicket && getTicketCategory(selectedTicket) === 'Collection'
      const finalStatus = (assignTechId && updateStatus === 'PENDING') ? 'ASSIGNED' : updateStatus

      if ((finalStatus === 'PENDING' && !keepPendingAssignment) || finalStatus === 'CANCELLED') {
        payload.branchId = ""
        payload.assignedTo = ""
        payload.status = finalStatus
      } else {
        payload.branchId = assignBranchId || ""
        payload.assignedTo = assignTechId || ""
        payload.status = finalStatus
      }
      
      // Update spreadsheet fields
      payload.customerName = editCustomerName || null
      payload.location = editLocation || null
      payload.preferredDate = editPreferredDate ? new Date(editPreferredDate).toISOString() : null
      payload.priorityTag = editPriorityTag || null
      payload.district = editDistrict || null
      payload.commitType = (editCommitRef.current ? editCommitRef.current.value : editCommitType) || null
      payload.installerName = editInstallerName || null
      payload.serviceVehicle = editServiceVehicle || null
      payload.remarksUpdate = (editRemarksRef.current ? editRemarksRef.current.value : editRemarksUpdate) || null
      payload.installationCharges = Number(editInstallationCharges)
      payload.modeOfPayment = editModeOfPayment || null
      payload.controlNumber = editControlNumber || null
      payload.ticketNumber = editTicketNumber?.trim() || null
      
      const acDetailsObj = {
        landmarks: editLandmarks || '',
        brand: editBrand || '',
        capacity: editCapacity || '',
        sku: editSku || '',
        serialNumber: editSerialNumber || '',
        alternatePhone: editPhoneNumbers.slice(1).filter(Boolean).join(', '),
        relayedDate: editRelayedDate || '',
        finalDate: editFinalDate || ''
      }
      payload.acDetails = JSON.stringify(acDetailsObj)
      payload.images = editImages || null
      payload.contactPhone = editPhoneNumbers[0] || null
      payload.sourceVendor = combineStoreVendor(editStoreCategory, editStoreBranch, editOtherStoreName) || null
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
      setLastUpdatedTicketId(selectedTicket.id)
      setSelectedTicket(null)
      fetchData({ soft: true })
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
      fetchData({ soft: true })
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
    fetchData({ soft: true })
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
    if (editCommitRef.current) editCommitRef.current.value = ticket.commitType || ''
    setEditInstallerName(ticket.installerName || '')
    setEditServiceVehicle(ticket.serviceVehicle || '')
    setEditRemarksUpdate(ticket.remarksUpdate || '')
    // Sync refs with new ticket values
    setTimeout(() => {
      if (editRemarksRef.current) editRemarksRef.current.value = ticket.remarksUpdate || ''
      if (editCommitRef.current) editCommitRef.current.value = ticket.commitType || ''
    }, 0)
    setEditInstallationCharges(ticket.installationCharges || 0)
    setEditModeOfPayment(ticket.modeOfPayment || '')
    setEditControlNumber(ticket.controlNumber || '')
    setEditTicketNumber(ticket.ticketNumber || '')
    const parsedStore = parseStoreVendor(ticket.sourceVendor)
    setEditStoreCategory(parsedStore.store)
    setEditStoreBranch(parsedStore.branch)
    setEditOtherStoreName(parsedStore.customStore || '')
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
    const phonesList = [ticket.contactPhone || ''].concat(parsedDetails.alternatePhone ? parsedDetails.alternatePhone.split(',').map(s => s.trim()) : []).filter(Boolean)
    setEditPhoneNumbers(phonesList.length ? phonesList : [''])
    setEditBrandHP(`${parsedDetails.brand || ''} ${parsedDetails.capacity || ''}`.trim())
    setEditImages(ticket.images || '')
    setEditRelayedDate(parsedDetails.relayedDate || (ticket.createdAt ? ticket.createdAt.split('T')[0] : ''))
    setEditFinalDate(parsedDetails.finalDate || '')

    setIsActionDrawerOpen(true)
  }


  // Filtered lists
  const relayTabCounts = useMemo(() => {
    let allPending = 0
    let unassigned = 0
    let assigned = 0
    let mine = 0
    const activeBranch = (isMyTicketsOnly && isAdmin) ? globalBranchId : branchFilter
    for (const t of tickets) {
      if (storeFilter !== 'ALL') {
        const vendorLower = (t.sourceVendor || 'Direct').toLowerCase()
        if (!vendorLower.includes(storeFilter.toLowerCase())) continue
      }
      if (activeBranch && activeBranch !== 'ALL' && activeBranch !== 'ALL_BRANCHES') {
        const resolved = resolveBranch(t.branchId)
        if (!resolved || resolved.id !== activeBranch) continue
      }
      if (!isAdmin && user?.branchId) {
        // Fuzzy match: strip -sales/-services suffix so Taguig Services sees Taguig Sales tickets
        const resolved = resolveBranch(t.branchId)
        const userRootBranch = user.branchId.replace(/-(sales|services|service)$/i, '')
        const ticketRootBranch = (resolved?.id || '').replace(/-(sales|services|service)$/i, '')
        if (!ticketRootBranch || ticketRootBranch.toLowerCase() !== userRootBranch.toLowerCase()) continue
      }
      const statusLabel = getRelayStatusLabel(t)
      if (statusLabel !== 'Pending' && statusLabel !== 'Assigned' && statusLabel !== 'Scheduled') continue
      allPending++
      if (statusLabel === 'Pending') unassigned++
      else assigned++
      if (isAdmin) mine++
      else if (t.assignedTo === user?.id) mine++
    }
    return {
      ALL_PENDING: allPending,
      UNASSIGNED: unassigned,
      PENDING: assigned,
      MY_TICKETS: mine,
    }
  }, [tickets, storeFilter, branchFilter, globalBranchId, isMyTicketsOnly, user?.id, isAdmin])

  const relayPillItems = useMemo(() => {
    const myTicketsPill = {
      id: 'MY_TICKETS' as const,
      label: 'My tickets',
      count: relayTabCounts.MY_TICKETS,
      icon: <User className="w-3 h-3" />,
    }
    if (isMyTicketsOnly || !isAdmin) return [myTicketsPill]
    return [
      { id: 'ALL_PENDING' as const, label: 'All pending', count: relayTabCounts.ALL_PENDING },
      { id: 'UNASSIGNED' as const, label: 'Unassigned', count: relayTabCounts.UNASSIGNED },
      { id: 'PENDING' as const, label: 'Assigned', count: relayTabCounts.PENDING },
      myTicketsPill,
    ]
  }, [isMyTicketsOnly, isAdmin, relayTabCounts])

  const filtered = tickets.filter(t => {
    // Tab filtering
    const statusLabel = getRelayStatusLabel(t)
    
    if (activeTab === 'MY_TICKETS') {
      // Include Assigned, Scheduled (has finalDate) — anything not yet installed/cancelled
      if (statusLabel !== 'Pending' && statusLabel !== 'Assigned' && statusLabel !== 'Scheduled') return false
      // For non-admin: show all branch tickets (not just own) so team can see who has what
      // Admins always see all
    } else {
      if (statusLabel !== 'Pending' && statusLabel !== 'Assigned') return false

      if (activeTab === 'UNASSIGNED') {
        if (statusLabel !== 'Pending') return false
      } else if (activeTab === 'PENDING') {
        if (statusLabel !== 'Assigned') return false
      }
    }

    // Vendor filter
    if (storeFilter !== 'ALL') {
      const vendorLower = (t.sourceVendor || 'Direct').toLowerCase()
      const filterLower = storeFilter.toLowerCase()
      if (!vendorLower.includes(filterLower)) return false
    }

    // Branch filter
    const activeBranch = (isMyTicketsOnly && isAdmin) ? globalBranchId : branchFilter
    if (activeBranch && activeBranch !== 'ALL' && activeBranch !== 'ALL_BRANCHES') {
      const resolved = resolveBranch(t.branchId)
      if (!resolved || resolved.id !== activeBranch) return false
    }
    // Branch filter for non-admin: fuzzy match root branch (strip -sales/-services suffix)
    // so Taguig Services employees see their tickets even if branchId says TAGUIG-SALES
    if (!isAdmin && user?.branchId) {
      const resolved = resolveBranch(t.branchId)
      const userRootBranch = user.branchId.replace(/-(sales|services|service)$/i, '')
      const ticketRootBranch = (resolved?.id || '').replace(/-(sales|services|service)$/i, '')
      if (!ticketRootBranch || ticketRootBranch.toLowerCase() !== userRootBranch.toLowerCase()) return false
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

  

  const formatRelayDate = (value?: string) => {
    if (!value) return '—'
    try {
      const d = new Date(value)
      if (isNaN(d.getTime())) return value
      const day = d.getDate()
      const mon = d.toLocaleDateString('en-US', { month: 'short' })
      const yr = String(d.getFullYear()).slice(-2)
      return `${day}-${mon}-${yr}`
    } catch {
      return value
    }
  }

  const getCategoryLabel = (ticket: Ticket) => {
    const svc = (ticket.serviceType || '').trim().toUpperCase()
    if (/S\/I|\bSI\b|INSTALL/.test(svc)) return 'S/I'
    if (svc.includes('SURVEY')) return 'SURVEY'
    if (svc.includes('INSTALLATION')) return 'INSTALLATION'
    if (svc.includes('SERVICE') || svc.includes('CLEAN')) return 'SERVICE'
    const cat = getTicketCategory(ticket)
    if (cat === 'Survey & Install') return 'S/I'
    if (cat === 'Survey') return 'SURVEY'
    if (cat === 'Service') return 'SERVICE'
    return svc || 'SERVICE'
  }

  const getRelayStatusShort = (ticket: Ticket) => {
    const label = getRelayStatusLabel(ticket)
    if (label === 'Pending') return 'PENDING'
    if (label === 'Cancelled') return 'CANCELLED'
    if (label === 'Scheduled') return 'SCHEDULED'
    return 'ASSIGNED'
  }

  const formatBranchTableLabel = (branchId?: string) => {
    const full = formatAssignedBranchLabel(branchId)
    if (full === '—') return '—'
    if (full.startsWith('TAGUIG')) return 'TAGUIG'
    return full
  }

  const getTicketNumber = (ticket: Ticket) => {
    const raw = ticket.ticketNumber?.trim()
    if (raw) {
      const legacy = raw.match(/^TKT-0*(\d+)$/i)
      if (legacy) {
        const seq = parseInt(legacy[1], 10)
        return Number.isFinite(seq) ? `AS-${String(seq).padStart(2, '0')}` : raw
      }
      return raw
    }
    return '—'
  }

  const displayUpper = (value?: string | null) => {
    const str = (value ?? '').trim()
    if (!str || str === '—') return '—'
    return str.toUpperCase()
  }

  


  // Helper to determine if a field was auto-extracted from voucher scan

  








  // Helper to determine if a field was auto-extracted from voucher scan
  const isFieldExtracted = (fieldValue: any) => {
    if (!addForm.images) return false
    if (fieldValue === undefined || fieldValue === null) return false
    const str = String(fieldValue).trim()
    if (str === '' || str === '0' || str === '0.00' || str === '00' || str === '000') return false
    if (str === 'Installation' || str === 'Installation service' || str === 'Voucher scanned via Gemini AI.') return false
    return true
  }

  const previewDetails = selectedPreviewTicket
    ? parseAcDetails(selectedPreviewTicket)
    : { landmarks: '', brand: '', capacity: '', sku: '', serialNumber: '', alternatePhone: '', relayedDate: '', finalDate: '' }

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full" style={{ backgroundColor: pageBg }}>
      {/* ── Portal: Toolbar into header slot ────────────────── */}
      {ReactDOM.createPortal(
        <div className="flex flex-col gap-2 w-full px-3 md:px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
          {/* Branch Filter */}
          {!isMyTicketsOnly && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed bg-slate-100 dark:bg-slate-900/50'}`}
              style={{ backgroundColor: isAdmin ? inputBg : (isLight ? '#f1f5f9' : '#1e293b'), borderColor: inputBorder }}>
              <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: isAdmin ? '#10B981' : textMuted }} />
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                disabled={!isAdmin}
                className={`bg-transparent outline-none text-xs font-semibold ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                style={{ color: isAdmin ? textPrimary : textMuted, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 18 }}>
                <option value="ALL">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 shrink-0 -ml-4 pointer-events-none" style={{ color: textMuted }} />
            </div>
          )}

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

          {/* Relay view tabs */}
          {!isMyTicketsOnly && (
            <FilterPills
              value={activeTab}
              onChange={handleRelayTabChange}
              items={relayPillItems}
            />
          )}

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
          {isAdmin && !isMyTicketsOnly && (
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
          )}
          </div>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {/* ── Scan Error Banner ──────────────────────────────────── */}
      {scanError && (
        <div className="mx-3 mt-2 p-3 rounded-lg border flex items-center justify-between gap-3"
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

      <div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden" style={{ backgroundColor: cardBg, borderTop: `1px solid ${border}` }}>
          <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto" data-ticket-table-scroll>
          <table
            key={activeTab}
            className="w-full"
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              fontSize: tableFontSize,
            }}>
            <colgroup>
              {columns.map(col => (
                <col key={col.label} style={{ width: col.w }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${tableRowBorder}` }}>
                {columns.map(col => (
                  <th key={col.label}
                    onClick={() => col.label !== 'ACTIONS' && toggleColumn(col.label)}
                    title={col.label !== 'ACTIONS' ? `Click to ${col.isExpanded ? 'collapse' : 'expand'} column` : undefined}
                    style={{
                      padding: `${headerPadY}px ${cellPadX}px`,
                      textAlign: 'center',
                      color: col.isExpanded ? (isLight ? '#10B981' : '#34D399') : textMuted,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      borderRight: tableColBorder,
                      borderBottom: `2px solid ${tableRowBorder}`,
                      fontSize: headerFontSize,
                      letterSpacing: '0.07em',
                      backgroundColor: inputBg,
                      cursor: col.label !== 'ACTIONS' ? 'pointer' : 'default',
                      userSelect: 'none',
                      transition: 'all 0.15s ease-in-out',
                      position: 'sticky',
                      top: 0,
                      zIndex: col.sticky ? 25 : 20,
                      verticalAlign: 'middle',
                      ...columnCellStyle(col),
                      ...(col.sticky ? { left: col.left } : {}),
                    }}>
                    <div className="flex items-center justify-center gap-1.5 w-full text-center">
                      <span>{col.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="uppercase">
              {refreshing && tickets.length > 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-1 text-center text-[10px] font-semibold" style={{ color: textMuted }}>
                    Syncing relays…
                  </td>
                </tr>
              )}
              {loading && tickets.length === 0 ? (
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
                  const branchName = formatBranchTableLabel(ticket.branchId)
                  const category = getTicketCategory(ticket)
                  const categoryLabel = getCategoryLabel(ticket)
                  const negotiator = ticket.assignedEmployeeName || ticket.installerName || '—'
                  const district = ticket.district || guessDistrict(ticket.location || '') || '—'
                  const relayedDate = formatRelayDate(details.relayedDate || (ticket.createdAt ? ticket.createdAt.split('T')[0] : ''))
                  const lastUpdate = ticket.remarksUpdate || ticket.description || (ticket.updatedAt ? `Updated ${formatRelayDate(ticket.updatedAt)}` : '—')
                  const isSelected = selectedPreviewTicket?.id === ticket.id || contextMenu?.ticket.id === ticket.id
                  const categoryTint = !isSelected
                    ? category === 'Survey'
                      ? (isLight ? 'rgba(234,179,8,0.07)' : 'rgba(234,179,8,0.06)')
                      : category === 'Survey & Install' ? (isLight ? '#f0fdf9' : 'rgba(16,185,129,0.06)')
                      : null
                    : null
                  const isHighlighted = ticket.id === lastUpdatedTicketId
                  const rowBaseBg = isHighlighted
                    ? (isLight ? '#dcfce7' : 'rgba(22,163,74,0.25)') // Flash green!
                    : isSelected
                      ? (isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.12)')
                      : categoryTint || (idx % 2 === 0 ? (isLight ? '#ffffff' : '#060B18') : (isLight ? '#fafafa' : '#080f1c'))
                  const rowHoverBg = category === 'Survey'
                    ? (isLight ? 'rgba(234,179,8,0.13)' : 'rgba(234,179,8,0.11)')
                    : category === 'Survey & Install' ? (isLight ? '#e6faf4' : 'rgba(16,185,129,0.09)')
                    : (isLight ? '#f1f5f9' : '#0f1e36')
                  const ticketNo = getTicketNumber(ticket)
                  const relayStatus = getRelayStatusShort(ticket)
                  const statusIsAssigned = relayStatus === 'ASSIGNED'
                  const cells: Array<{ value: React.ReactNode; right?: boolean }> = activeTab === 'MY_TICKETS' ? [
                    // TICKET NO
                    { value: (
                      <span className="font-mono font-bold w-full truncate block text-center" title={ticketNo} style={{ color: textPrimary }}>
                        {displayUpper(ticketNo)}
                      </span>
                    ) },
                    // STATUS
                    { value: (
                      <span className="font-semibold w-full truncate block text-center" style={{
                        color: statusIsAssigned || relayStatus === 'SCHEDULED' ? '#10B981' : '#F59E0B'
                      }}>
                        {relayStatus}
                      </span>
                    ) },
                    // NEGOTIATOR
                    { value: (
                      <span className="truncate block w-full text-center font-semibold" title={displayUpper(negotiator)} style={{ color: textPrimary }}>
                        {displayUpper(negotiator)}
                      </span>
                    ) },
                    // CUSTOMER NAME
                    { value: (
                      <span className="truncate block font-semibold w-full text-center" title={displayUpper(ticket.customerName || 'Direct Client')} style={{ color: textPrimary }}>
                        {displayUpper(ticket.customerName || 'Direct Client')}
                      </span>
                    ) },
                    // ADDRESS / DISTRICT
                    { value: (
                      <span className="break-words block w-full text-center text-xs" title={displayUpper(ticket.location || '')}>
                        {displayUpper(ticket.location || '')} {ticket.district ? `(${displayUpper(ticket.district)})` : ''}
                      </span>
                    ) },
                    // BRAND
                    { value: (
                      <span className="truncate block w-full text-center text-xs font-semibold" title={displayUpper(details.brand || '')} style={{ color: textPrimary }}>
                        {displayUpper(details.brand || details.capacity ? `${details.brand || ''} ${details.capacity || ''}`.trim() : '') || '—'}
                      </span>
                    ) },
                    // STORE / SOURCE
                    { value: (
                      <span className="truncate block w-full text-center text-xs" title={displayUpper(storeStyle.label)}>
                        {displayUpper(storeStyle.label)}
                      </span>
                    ) },
                    // COMMIT
                    { value: (
                      <span className="truncate block w-full text-center text-xs" title={displayUpper(ticket.commitType || '')} style={{ color: textMuted }}>
                        {displayUpper(ticket.commitType || '') || '—'}
                      </span>
                    ) },
                    // INSTALLER
                    { value: (
                      <span className="truncate block w-full text-center text-xs font-semibold" title={displayUpper(ticket.installerName || '')} style={{ color: textPrimary }}>
                        {displayUpper(ticket.installerName || '') || '—'}
                      </span>
                    ) },
                    // DRIVER
                    { value: (
                      <span className="truncate block w-full text-center text-xs" title={displayUpper(ticket.serviceVehicle || '')} style={{ color: textMuted }}>
                        {displayUpper(ticket.serviceVehicle || '') || '—'}
                      </span>
                    ) },
                    // PREFERRED DATE
                    { value: <span className="whitespace-nowrap block w-full text-center">{displayUpper(formatRelayDate(ticket.preferredDate || ''))}</span> },
                    // FINAL DATE (editable)
                    { value: (
                      <input
                        type="date"
                        value={inlineFinalDates[ticket.id] !== undefined ? inlineFinalDates[ticket.id] : (details.finalDate || '')}
                        onChange={e => setInlineFinalDates(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        className="px-2 py-1 rounded text-xs border w-full text-center"
                        style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                      />
                    ) },
                    // REMARKS
                    { value: (
                      <span className="break-words block w-full text-center text-xs" title={ticket.remarksUpdate || ''}>
                        {ticket.remarksUpdate || lastUpdate || '—'}
                      </span>
                    ) },
                    // PAYMENT
                    { value: (
                      <span className="truncate block w-full text-center text-xs font-semibold" style={{ color: textPrimary }}>
                        {displayUpper(ticket.modeOfPayment || '') || (ticket.installationCharges != null && ticket.installationCharges > 0 ? `₱${ticket.installationCharges.toLocaleString()}` : '—')}
                      </span>
                    ) },
                    // ACTIONS
                    { value: (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          handleSaveFinalDateInline(ticket)
                        }}
                        disabled={inlineSavingId === ticket.id || inlineFinalDates[ticket.id] === undefined || inlineFinalDates[ticket.id] === (details.finalDate || '')}
                        className="px-3 py-1 rounded text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {inlineSavingId === ticket.id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'SAVE'}
                      </button>
                    ) }
                  ] : [
                    { value: (
                      <span className="font-mono font-bold w-full truncate block text-center" title={ticketNo} style={{ color: textPrimary }}>
                        {displayUpper(ticketNo)}
                      </span>
                    ) },
                    { value: (
                      <span
                        className="font-semibold w-full truncate block text-center"
                        title={relayStatus}
                        style={{ color: statusIsAssigned ? '#10B981' : relayStatus === 'CANCELLED' ? '#EF4444' : '#F59E0B' }}>
                        {relayStatus}
                      </span>
                    ) },
                    { value: (
                      <span className="truncate block w-full text-center font-semibold" style={{ color: textPrimary }} title={categoryLabel}>
                        {categoryLabel}
                      </span>
                    ) },
                    { value: (
                      <span
                        className={`${!columns[3].isExpanded ? 'truncate' : 'break-words'} block font-semibold w-full text-center`}
                        title={displayUpper(ticket.customerName || 'Direct Client')}
                        style={{ color: textPrimary }}>
                        {displayUpper(ticket.customerName || 'Direct Client')}
                      </span>
                    ) },
                    { value: <span className="block w-full truncate text-center">{displayUpper(district)}</span> },
                    { value: <span className="truncate block w-full text-center" title={displayUpper(storeStyle.label)}>{displayUpper(storeStyle.label)}</span> },
                    { value: <span className="whitespace-nowrap block w-full text-center">{displayUpper(relayedDate)}</span> },
                    { value: <span className="truncate block w-full text-center" title={displayUpper(branchName)}>{displayUpper(branchName)}</span> },
                    { value: <span className="truncate block w-full text-center" title={displayUpper(negotiator)}>{displayUpper(negotiator)}</span> },
                    { value: <span className={`${!columns[9].isExpanded ? 'truncate' : 'break-words'} block w-full text-center`} title={displayUpper(lastUpdate)}>{displayUpper(lastUpdate)}</span> },
                  ]
                  return (
                    <tr key={ticket.id}
                      id={`row-${ticket.id}`}
                      onContextMenu={e => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, ticket })
                      }}
                      style={{
                        backgroundColor: rowBaseBg,
                        cursor: 'pointer',
                        transition: isHighlighted ? 'background-color 1.5s ease-out' : undefined,
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
                              padding: `${cellPadY}px ${cellPadX}px`,
                              borderRight: tableColBorder,
                              borderBottom: `1px solid ${tableRowBorder}`,
                              color: textMuted,
                              fontSize: tableFontSize,
                              lineHeight: 1.4,
                              textAlign: columnTextAlign(col, cell),
                              overflow: 'hidden',
                              verticalAlign: 'middle',
                              transition: 'background-color 0.15s ease-in-out',
                              backgroundColor: rowBaseBg,
                              ...columnCellStyle(col),
                              boxShadow: isSelected && selectedColIndex === colIdx ? 'inset 0 0 0 2px #10B981' : undefined,
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
        <div className="flex items-center justify-between gap-3 px-3 py-2 flex-wrap shrink-0" style={{ borderTop: `1px solid ${border}` }}>
          {/* Counters */}
          <div className="flex flex-wrap items-center gap-5">
            {[
              { label: 'Unassigned', count: relayTabCounts.UNASSIGNED },
              { label: 'Assigned', count: relayTabCounts.PENDING },
              { label: 'My tickets', count: relayTabCounts.MY_TICKETS },
              { label: 'Total', count: relayTabCounts.ALL_PENDING },
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
                title={(searchQuery || storeFilter !== 'ALL' || branchFilter !== 'ALL' || activeTab !== 'ALL_PENDING')
                  ? 'Only matching filtered records will be deleted'
                  : 'Deletes all records permanently'}>
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                {actionSaving ? 'Deleting...' : `Delete All ${filtered.length} Records`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Centered Manage/Edit Ticket Modal */}
      {isActionDrawerOpen && selectedTicket && ReactDOM.createPortal((() => {
        const ticket = selectedTicket;

        const EField = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
          <div className={`flex flex-col gap-1.5 ${className}`}>
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</label>
            {children}
          </div>
        );

        const ESHead = ({ title }: { title: string }) => (
          <div className="pt-2 pb-1 border-b pb-2 mb-3" style={{ borderColor: border }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">{title}</p>
          </div>
        );

        const inputStyle = {
          backgroundColor: inputBg,
          borderColor: inputBorder,
          color: textPrimary,
          fontFamily: 'inherit'
        };

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setIsActionDrawerOpen(false)}>

            {/* Modal Box */}
            <div className="w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 shrink-0"
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
                <div className="min-w-0 flex-1 mr-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-base font-black leading-tight uppercase tracking-wide" style={{ color: textPrimary }}>
                      Manage Client Ticket
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded font-black font-mono tracking-wider" style={{ backgroundColor: inputBg, color: textMuted, border: `1px solid ${border}` }}>
                      TICKET NO: {getTicketNumber(ticket)}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setIsActionDrawerOpen(false)}
                  className="p-1.5 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <X className="w-4.5 h-4.5" style={{ color: textMuted }} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* Section 1: Client Details */}
                <div>
                  <ESHead title="Client & Location Details" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <EField label="Customer Name">
                      <input type="text" value={editCustomerName} onChange={e => setEditCustomerName(e.target.value)}
                        placeholder="Customer Name" className={compactInput} style={inputStyle} />
                    </EField>
                    <EField label="Ticket No.">
                      <input type="text" value={editTicketNumber} onChange={e => setEditTicketNumber(e.target.value)}
                        placeholder="Auto" className={compactInput} style={inputStyle} />
                    </EField>
                    <EField label="Control No. / SI">
                      <input type="text" value={editControlNumber} onChange={e => setEditControlNumber(e.target.value)}
                        placeholder="Transaction no." className={compactInput} style={inputStyle} />
                    </EField>
                    
                    {/* Growable Contact Numbers */}
                    <EField label="Contact Number" className="sm:col-span-2">
                      <div className="flex flex-col gap-2">
                        {editPhoneNumbers.map((phone, pIdx) => (
                          <div key={pIdx} className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={phone}
                              onChange={e => {
                                const newPhones = [...editPhoneNumbers];
                                newPhones[pIdx] = e.target.value;
                                setEditPhoneNumbers(newPhones);
                              }}
                              placeholder={`Contact Number ${pIdx + 1}`}
                              className={compactInput}
                              style={inputStyle}
                            />
                            {pIdx === 0 ? (
                              <button
                                type="button"
                                onClick={() => setEditPhoneNumbers([...editPhoneNumbers, ''])}
                                className="p-1 px-2.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 font-bold transition-all text-xs shrink-0"
                              >
                                +
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const newPhones = editPhoneNumbers.filter((_, idx) => idx !== pIdx);
                                  setEditPhoneNumbers(newPhones);
                                }}
                                className="p-1 px-2.5 rounded-lg text-white bg-red-600 hover:bg-red-700 font-bold transition-all text-xs shrink-0"
                              >
                                -
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </EField>

                    <EField label="Store">
                      <select
                        value={editStoreCategory}
                        onChange={e => {
                          const next = e.target.value as StoreCategory
                          setEditStoreCategory(next)
                          if (next === 'Direct') {
                            setEditStoreBranch('')
                            setEditOtherStoreName('')
                          }
                        }}
                        className={compactInput}
                        style={inputStyle}>
                        <option value="Robinsons">Robinsons</option>
                        <option value="Abenson">Abenson</option>
                        <option value="Direct">Direct Store</option>
                        <option value="Other">Other Store</option>
                      </select>
                    </EField>
                    {editStoreCategory === 'Other' && (
                      <EField label="Specific Store Name">
                        <input
                          type="text"
                          value={editOtherStoreName}
                          onChange={e => setEditOtherStoreName(e.target.value)}
                          placeholder="e.g. S&R, Anson's"
                          className={compactInput}
                          style={inputStyle}
                        />
                      </EField>
                    )}
                    {(editStoreCategory === 'Robinsons' || editStoreCategory === 'Abenson' || editStoreCategory === 'Other') && (
                      <EField label="Store Branch">
                        <input
                          type="text"
                          value={editStoreBranch}
                          onChange={e => setEditStoreBranch(e.target.value)}
                          placeholder={editStoreCategory === 'Robinsons' ? 'e.g. Ermita' : editStoreCategory === 'Abenson' ? 'e.g. Silang' : 'Branch Name'}
                          className={compactInput}
                          style={inputStyle}
                        />
                      </EField>
                    )}
                    <EField label="Address" className="md:col-span-2">
                      <input type="text" value={editLocation} onChange={e => setEditLocation(e.target.value)}
                        placeholder="Installation Address" className={compactInput} style={inputStyle} />
                    </EField>
                    <EField label="District Zone">
                      <input type="text" value={editDistrict} onChange={e => setEditDistrict(e.target.value)}
                        placeholder="District" className={compactInput} style={inputStyle} />
                    </EField>
                    <EField label="Additional Notes / Landmark">
                      <input type="text" value={editLandmarks} onChange={e => setEditLandmarks(e.target.value)}
                        placeholder="Landmarks / Notes" className={compactInput} style={inputStyle} />
                    </EField>
                  </div>
                </div>

                {/* Section 2: Equipment & Job details */}
                <div>
                  <ESHead title="Equipment & Job Details" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <EField label="Brand / HP" className="md:col-span-2">
                      <input type="text" value={editBrandHP} onChange={e => {
                        const val = e.target.value;
                        setEditBrandHP(val);
                        const parts = val.trim().split(/\s+/);
                        const brand = parts[0] || '';
                        const capacity = parts.slice(1).join(' ') || '';
                        setEditBrand(brand);
                        setEditCapacity(capacity);
                      }}
                        placeholder="e.g. Panasonic 1.5 HP" className={compactInput} style={inputStyle} />
                    </EField>
                    <EField label="Service Category / Type">
                      <input type="text" value={editServiceType} onChange={e => {
                        const val = e.target.value;
                        const isSI = /install|s\/i|\bsi\b/i.test(val);
                        const isSurvey = /survey/i.test(val);
                        let mappedSvc = val;
                        if (isSI) {
                          mappedSvc = 'Survey & Install';
                          setEditCommitType('FREE FIRST 10 FEET');
                        } else if (isSurvey) {
                          mappedSvc = 'SURVEY';
                        }
                        setEditServiceType(mappedSvc);
                      }}
                        placeholder="e.g. Survey & Install" className={compactInput} style={inputStyle} />
                    </EField>
                    <EField label="Commit Type / Promo" className="md:col-span-2">
                      <input
                        ref={editCommitRef}
                        type="text"
                        defaultValue={editCommitType}
                        onBlur={e => setEditCommitType(e.target.value)}
                        placeholder="e.g. Free 10ft copper"
                        className={compactInput} style={inputStyle} />
                    </EField>
                    {editImages && (
                      <div className="flex flex-col justify-end">
                        <div className="rounded-lg p-2 flex items-center justify-between border" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                            <div className="text-[10px]">
                              <p className="font-bold" style={{ color: textPrimary }}>Attached Voucher</p>
                              <p className="truncate max-w-[100px]" style={{ color: textMuted }}>{editImages.split('/').pop()}</p>
                            </div>
                          </div>
                          <a href={editImages.startsWith('http') ? editImages : `${API_BASE_URL.replace('/api', '')}${editImages}`}
                             target="_blank" rel="noreferrer"
                             className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 rounded text-[9px] font-bold transition-all">
                            View
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Scheduling & Assignment */}
                <div>
                  <ESHead title="Scheduling & Branch Assignment" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <EField label="Status">
                      <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}
                        className="w-full border rounded-lg px-2.5 py-1 text-xs outline-none font-bold"
                        style={inputStyle}>
                        <option value="PENDING">Pending</option>
                        <option value="ASSIGNED">Assigned</option>
                        <option value="SCHEDULED">Scheduled</option>
                      </select>
                    </EField>
                    <EField label="Branch Zone">
                      <select value={assignBranchId}
                        onChange={e => setAssignBranchId(e.target.value)}
                        className={compactInput} style={inputStyle}>
                        <option value="">Select Branch...</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </EField>
                    <EField label="Negotiator">
                      <select value={assignTechId}
                        onChange={e => {
                          const val = e.target.value
                          const foundEmp = negotiators.find(emp => emp.id === val)
                          setAssignTechId(val)
                          setEditInstallerName(foundEmp ? foundEmp.name : '')
                          if (foundEmp && foundEmp.branchId) {
                            setAssignBranchId(foundEmp.branchId)
                          }
                          if (val && updateStatus === 'PENDING') {
                            setUpdateStatus('ASSIGNED')
                          }
                        }}
                        className={compactInput} style={inputStyle}>
                        <option value="">Select Negotiator...</option>
                        {negotiators
                          .filter(emp => {
                            if (!assignBranchId || assignBranchId === 'ALL') return true
                            if (!emp.branchId?.trim()) return true
                            return branchScopesMatch(emp.branchId, assignBranchId, emp.email)
                          })
                          .map(emp => {
                            return (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            )
                          })}
                      </select>
                    </EField>
                    <EField label="Relayed Date">
                      <input type="date" value={editRelayedDate} onChange={e => setEditRelayedDate(e.target.value)}
                        className={compactInput} style={inputStyle} />
                    </EField>
                    <EField label="Preferred Date">
                      <input type="date" value={editPreferredDate} onChange={e => setEditPreferredDate(e.target.value)}
                        className={compactInput} style={inputStyle} />
                    </EField>
                  </div>
                </div>

                {/* Section 4: Remarks */}
                <div>
                  <ESHead title="Remarks & Updates" />
                  <EField label="Remarks / Update Notes">
                    <textarea
                      ref={editRemarksRef}
                      defaultValue={editRemarksUpdate}
                      onBlur={e => setEditRemarksUpdate(e.target.value)}
                      rows={3}
                      placeholder="Remarks..."
                      className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none"
                      style={inputStyle} />
                  </EField>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 flex items-center justify-between border-t shrink-0"
                style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
                {isAdmin ? (
                  <button type="button" onClick={() => { handleDeleteTicket(ticket.id, ticket.customerName); setIsActionDrawerOpen(false); }}
                    disabled={actionSaving}
                    className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
                    Delete Ticket
                  </button>
                ) : <div />}
                <div className="flex gap-2.5">
                  <button type="button" onClick={() => setIsActionDrawerOpen(false)}
                    className="px-5 py-2 border rounded-lg text-xs font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800"
                    style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>
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
        );
      })(), document.body)}
      {/* Centered Create Ticket Modal */}
      {isAddModalOpen && (() => {
        const addCategory = /collect/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Collection'
          : /install|s\/i|\bsi\b/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Survey & Install'
          : /survey/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Survey'
          : /service|clean/i.test(`${addForm.serviceType} ${addForm.title}`)
          ? 'Service'
          : 'Survey & Install'
        const fieldStyle = (value?: string) => ({
          backgroundColor: isFieldExtracted(value) ? (isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.04)') : inputBg,
          borderColor: isFieldExtracted(value) ? '#10B981' : inputBorder,
          color: textPrimary,
          fontFamily: 'inherit'
        })
        const categoryOptions = [
          { label: 'Survey & Install', value: 'Survey & Install', title: 'Installation service' },
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
                              commitType: option.value === 'Survey & Install' ? 'FREE FIRST 10 FEET' : prev.commitType,
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
                              commitType: option.value === 'Survey & Install' ? 'FREE FIRST 10 FEET' : prev.commitType,
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
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Ticket No.</label>
                        <input
                          type="text"
                          value={addForm.ticketNumber}
                          onChange={e => setAddForm(prev => ({ ...prev, ticketNumber: e.target.value }))}
                          placeholder="Auto-generated"
                          className={compactInput}
                          style={fieldStyle(addForm.ticketNumber)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Control No. / SI</label>
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

                    <div className={`grid gap-2 ${addForm.sourceVendor === 'Other' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Store</label>
                        <select
                          value={addForm.sourceVendor}
                          onChange={e => setAddForm(prev => ({
                            ...prev,
                            sourceVendor: e.target.value,
                            storeBranch: e.target.value === 'Direct' ? '' : prev.storeBranch,
                            otherStoreName: e.target.value === 'Direct' ? '' : prev.otherStoreName
                          }))}
                          className={compactInput}
                          style={fieldStyle(addForm.sourceVendor)}
                        >
                          <option value="Robinsons" style={{ color: '#000' }}>Robinsons</option>
                          <option value="Abenson" style={{ color: '#000' }}>Abenson</option>
                          <option value="Direct" style={{ color: '#000' }}>Direct</option>
                          <option value="Other" style={{ color: '#000' }}>Other</option>
                        </select>
                      </div>
                      {addForm.sourceVendor === 'Other' && (
                        <div>
                          <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Specific Store Name</label>
                          <input
                            type="text"
                            value={addForm.otherStoreName}
                            onChange={e => setAddForm(prev => ({ ...prev, otherStoreName: e.target.value }))}
                            placeholder="e.g. S&R, Anson's"
                            className={compactInput}
                            style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Store Branch</label>
                        <input
                          type="text"
                          disabled={addForm.sourceVendor === 'Direct'}
                          value={addForm.storeBranch}
                          onChange={e => setAddForm(prev => ({ ...prev, storeBranch: e.target.value }))}
                          placeholder={addForm.sourceVendor === 'Robinsons' ? 'e.g. Ermita' : addForm.sourceVendor === 'Abenson' ? 'e.g. Silang' : 'Branch Name'}
                          className={compactInput}
                          style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Branch Zone</label>
                        <select
                          value={addForm.branchId}
                          onChange={e => setAddForm(prev => ({ ...prev, branchId: e.target.value, assignedTo: '' }))}
                          className={compactInput}
                          style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary, fontFamily: 'inherit' }}
                        >
                          <option value="">Select Branch...</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Negotiator *</label>
                        <select
                          required
                          value={addForm.assignedTo || ''}
                          onChange={e => {
                            const val = e.target.value
                            const foundEmp = negotiators.find(emp => emp.id === val)
                            setAddForm(prev => ({
                              ...prev,
                              assignedTo: val,
                              installerName: foundEmp ? foundEmp.name : '',
                              branchId: (foundEmp && foundEmp.branchId) ? foundEmp.branchId : prev.branchId,
                              status: val ? 'ASSIGNED' : prev.status
                            }))
                          }}
                          className={compactInput}
                          style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary, fontFamily: 'inherit' }}
                        >
                          <option value="">Select Negotiator...</option>
                          {negotiators.map(emp => {
                            return (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            )
                          })}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: textMuted }}>Status</label>
                      <select
                        value={addForm.status}
                        onChange={e => setAddForm(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none font-bold"
                        style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary, fontFamily: 'inherit' }}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="ASSIGNED">Assigned</option>
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="RESCHED">Resched</option>
                        <option value="FOR APPROVAL">For Approval</option>
                        <option value="SURVEY">Survey</option>
                        <option value="ON_THE_WAY">On the Way</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>

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
      {isViewModalOpen && selectedPreviewTicket && ReactDOM.createPortal((() => {
        const t   = selectedPreviewTicket
        const det = previewDetails
        const sl  = getRelayStatusLabel(t)
        const neg = t.assignedEmployeeName || t.installerName || '—'
        const bn  = formatAssignedBranchLabel(t.branchId)
        const storeInfo = parseStoreVendor(t.sourceVendor)

        const DField = ({ label, value, green, className = "" }: { label: string; value: React.ReactNode; green?: boolean; className?: string }) => (
          <div className={`flex flex-col gap-0.5 py-2 px-3 rounded-lg ${className}`} style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
            <span className={`text-xs font-semibold break-words leading-snug ${green ? 'text-emerald-500' : ''}`}
              style={green ? undefined : { color: textPrimary }}>
              {value || '—'}
            </span>
          </div>
        )

        const SHead = ({ title }: { title: string }) => (
          <div className="pt-2 pb-1 border-b pb-2 mb-3" style={{ borderColor: border }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">{title}</p>
          </div>
        )

        const formatDate = (dateStr: string | null | undefined) => {
          if (!dateStr) return '—';
          try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });
          } catch (e) { return '—'; }
        };

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setIsViewModalOpen(false)}>

            {/* Modal Box */}
            <div className="w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex flex-col px-6 py-4 shrink-0 gap-3"
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
                
                {/* Header Row 1 */}
                <div className="flex items-center justify-between w-full">
                  <div className="min-w-0 flex-1 mr-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-base font-black leading-tight uppercase tracking-wide" style={{ color: textPrimary }}>
                        {t.customerName || 'Direct Client'}
                      </h2>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{
                        backgroundColor: (sl === 'Assigned' || sl === 'Scheduled' || sl === 'Installed' || sl === 'In Progress' || sl === 'On the Way' || !!t.assignedTo)
                          ? 'rgba(16,185,129,0.12)'
                          : 'rgba(245,158,11,0.12)',
                        color: (sl === 'Assigned' || sl === 'Scheduled' || sl === 'Installed' || sl === 'In Progress' || sl === 'On the Way' || !!t.assignedTo)
                          ? '#10B981'
                          : '#F59E0B'
                      }}>
                        {t.assignedTo ? 'Assigned' : (bn !== '—' && bn !== 'UNASSIGNED' ? bn : sl)}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-black font-mono tracking-wider" style={{ backgroundColor: inputBg, color: textMuted, border: `1px solid ${border}` }}>
                        TICKET NO: {getTicketNumber(t)}
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setIsViewModalOpen(false)}
                    className="p-1.5 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X className="w-4.5 h-4.5" style={{ color: textMuted }} />
                  </button>
                </div>

                {/* Header Row 2 */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t text-xs w-full" style={{ borderColor: border }}>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Category</span>
                    <span className="font-semibold text-xs text-emerald-500 uppercase">{getTicketCategory(t)}</span>
                  </div>
                  <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Relayed By</span>
                    <span className="font-semibold text-xs" style={{ color: textPrimary }}>
                      {t.createdBy ? <EmployeeNameLink nameOrId={t.createdBy} /> : (t.customerEmail || 'System')}
                    </span>
                  </div>
                  <div style={{ borderLeft: `1px solid ${border}`, height: '1.25rem' }} className="hidden sm:block" />
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Negotiator</span>
                    <span className="font-semibold text-xs" style={{ color: textPrimary }}>{neg}</span>
                  </div>
                </div>

              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* Grid 1: Client & Location Info */}
                <div>
                  <SHead title="Client & Location Details" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <DField label="Contact Number" value={
                      <div className="flex flex-col gap-0.5">
                        <FormatPhone raw={t.contactPhone} />
                        {det.alternatePhone && det.alternatePhone.split(',').map((p: string) => p.trim()).filter(Boolean).map((p: string, pIdx: number) => (
                          <FormatPhone key={pIdx} raw={p} />
                        ))}
                      </div>
                    } green />
                    <DField label="Address" value={t.location} className="md:col-span-2" />
                    <DField label="District" value={t.district || guessDistrict(t.location || '')} />
                    <DField label="Additional Notes" value={det.landmarks} className="md:col-span-2" />
                  </div>
                </div>

                {/* Grid 2: Job Scheduling Info */}
                <div>
                  <SHead title="Scheduling Details" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4">
                    <DField label="Date Relayed" value={formatDate(t.createdAt)} />
                    <DField label="Preferred Schedule" value={formatDate(t.preferredDate)} />
                    <DField label="Final Schedule" value={det.finalDate ? <span className="text-emerald-500 font-bold">{formatDate(det.finalDate)}</span> : '—'} />
                    <DField label="Store" value={storeInfo.store === 'Direct' ? 'Direct Store' : storeInfo.store} />
                    <DField label="Store Branch" value={storeInfo.branch || '—'} />
                    <DField label="Commit Type" value={t.commitType} />
                    <DField label="Brand / HP" value={`${det.brand || ''} ${det.capacity || ''}`.trim()} />
                    <DField label="Control No. / SI" value={t.controlNumber || '—'} />
                    <DField label="Negotiator" value={neg} />
                  </div>
                </div>

                {/* Remarks */}
                {(t.remarksUpdate || t.description) && (
                  <div>
                    <SHead title="Remarks & Updates" />
                    <p className="text-xs leading-relaxed rounded-xl p-4"
                      style={{ backgroundColor: inputBg, color: textMuted, border: `1px solid ${border}` }}>
                      {t.remarksUpdate || t.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 flex items-center justify-end gap-3 shrink-0"
                style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
                {(isAdmin || (t.assignedTo && t.assignedTo === user?.id)) && (
                  <button type="button" onClick={() => { openDrawer(t); setIsViewModalOpen(false); setSelectedPreviewTicket(null); }}
                    className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all">
                    Edit
                  </button>
                )}
                {isAdmin && (
                  <button type="button" onClick={() => { handleDeleteTicket(t.id, t.customerName); setIsViewModalOpen(false); setSelectedPreviewTicket(null); }}
                    className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all">
                    Delete
                  </button>
                )}
                <button type="button" onClick={() => setIsViewModalOpen(false)}
                  className="px-5 py-2 rounded-lg text-xs font-bold border transition-all hover:bg-slate-50 dark:hover:bg-slate-800"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}
      {/* ── Right-click context menu ─────────────────────────────────── */}
      {contextMenu && (
        <div id="context-menu" className="fixed z-[200]" style={{ top: contextMenu.y, left: contextMenu.x }}
             onClick={e => e.stopPropagation()}>
          <div className="rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-blue-500/10"
                    style={{ color: textPrimary }}
                    onClick={() => { setSelectedPreviewTicket(contextMenu.ticket); setIsViewModalOpen(true); setContextMenu(null) }}>
              <Eye className="w-3.5 h-3.5 text-blue-500" /> View details
            </button>
            {(isAdmin || (contextMenu.ticket.assignedTo && contextMenu.ticket.assignedTo === user?.id)) && (
              <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-[#10B981]/10"
                      style={{ color: textPrimary }}
                      onClick={() => { openDrawer(contextMenu.ticket); setContextMenu(null) }}>
                <Edit3 className="w-3.5 h-3.5 text-[#10B981]" /> Edit ticket
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
