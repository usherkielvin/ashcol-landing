import { useState, useEffect, useRef } from 'react'
import {
  Search, RefreshCw, Upload, FileSpreadsheet, AlertTriangle, X, FileText, Loader2, Building2, Trash2
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
  const [employees, setEmployees] = useState<{ id: string; name: string; branchId?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [storeFilter, setStoreFilter] = useState('ALL')
  const [branchFilter, setBranchFilter] = useState('ALL')
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNASSIGNED' | 'PENDING' | 'INSTALLED' | 'CANCELLED'>('ALL')

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
    title: 'Installation service',
    description: '',
    serviceType: 'Installation',
    customerName: '',
    contactPhone: '',
    locationRaw: '',
    sourceVendor: 'Robinsons B2B',
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
    controlNumber: ''
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
  const [editPriorityTag, setEditPriorityTag] = useState('')
  const [editDistrict, setEditDistrict] = useState('')
  const [editCommitType, setEditCommitType] = useState('')
  const [editInstallerName, setEditInstallerName] = useState('')
  const [editServiceVehicle, setEditServiceVehicle] = useState('')
  const [editRemarksUpdate, setEditRemarksUpdate] = useState('')
  const [editInstallationCharges, setEditInstallationCharges] = useState(0)
  const [editModeOfPayment, setEditModeOfPayment] = useState('')
  const [editControlNumber, setEditControlNumber] = useState('')
  const [editCustomerName, setEditCustomerName] = useState('')

  // Load Initial Data
  const fetchData = async () => {
    try {
      setRefreshing(true)
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

      // Fetch Employees
      const employeeRes = await fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (employeeRes.ok) {
        const payload = await employeeRes.json()
        setEmployees(payload?.data || payload || [])
      }

    } catch (e) {
      console.error('Error fetching data:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
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
        setAddForm({
          title: `${parsed.serviceType || 'Installation'} service`,
          description: parsed.description || 'Voucher scanned via Gemini AI.',
          serviceType: parsed.serviceType || 'Installation',
          customerName: parsed.customerName || '',
          contactPhone: parsed.contactPhone || '',
          locationRaw: parsed.location || '',
          sourceVendor: parsed.sourceVendor || 'Robinsons B2B',
          unitType: parsed.unitType || 'Split AC',
          preferredDate: '',
          slaExpirationDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
          priorityTag: parsed.priorityTag || '',
          district: parsed.district || '',
          commitType: parsed.commitType || '',
          installerName: parsed.installerName || '',
          serviceVehicle: parsed.serviceVehicle || '',
          remarksUpdate: parsed.remarksUpdate || '',
          installationCharges: parsed.installationCharges || 0,
          modeOfPayment: parsed.modeOfPayment || '',
          controlNumber: parsed.controlNumber || ''
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

            return {
              id: `excel-${idx}-${Date.now()}`,
              priorityTag: getVal(row, colIndices.priorityTag),
              customerName: getVal(row, colIndices.customerName) || 'Unknown Customer',
              location: getVal(row, colIndices.location),
              district: getVal(row, colIndices.district),
              contactPhone: getVal(row, colIndices.contactPhone),
              unitType: getVal(row, colIndices.unitType) || 'Split AC',
              sourceVendor: getVal(row, colIndices.sourceVendor) || 'Direct',
              serviceType: getVal(row, colIndices.serviceType) || 'Installation',
              commitType: getVal(row, colIndices.commitType),
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
            title: `${item.serviceType || 'Installation'} service`,
            description: item.remarksUpdate || item.description || 'Excel imported ticket',
            customerName: item.customerName,
            serviceType: item.serviceType || 'Installation',
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
          controlNumber: addForm.controlNumber || undefined
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
        sourceVendor: 'Robinsons B2B',
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
        controlNumber: ''
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

      if (assignBranchId !== (selectedTicket.branchId || '')) {
        payload.branchId = assignBranchId || null
      }
      if (assignTechId !== (selectedTicket.assignedTo || '')) {
        payload.assignedTo = assignTechId || null
        if (assignTechId && selectedTicket.status === 'PENDING') {
          payload.status = 'ASSIGNED'
        }
      }
      if (updateStatus && updateStatus !== selectedTicket.status) {
        payload.status = updateStatus
      }
      
      // Update spreadsheet fields
      payload.customerName = editCustomerName || null
      payload.priorityTag = editPriorityTag || null
      payload.district = editDistrict || null
      payload.commitType = editCommitType || null
      payload.installerName = editInstallerName || null
      payload.serviceVehicle = editServiceVehicle || null
      payload.remarksUpdate = editRemarksUpdate || null
      payload.installationCharges = Number(editInstallationCharges)
      payload.modeOfPayment = editModeOfPayment || null
      payload.controlNumber = editControlNumber || null

      const res = await fetch(`${API_BASE_URL}/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Update failed')

      setIsActionDrawerOpen(false)
      setSelectedTicket(null)
      fetchData()
    } catch (e) {
      alert('Failed to update ticket action.')
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

  const handleClearBranchRecords = async () => {
    const isAll = branchFilter === 'ALL'
    const branchName = isAll ? 'All Branches' : (branches.find(b => b.id === branchFilter)?.name || 'the selected branch')
    const ticketsToDelete = isAll ? tickets : tickets.filter(t => t.branchId === branchFilter)

    if (ticketsToDelete.length === 0) {
      alert(`No tickets found for "${branchName}".`)
      return
    }

    const confirmMsg = isAll
      ? `WARNING: Are you sure you want to delete ALL ${ticketsToDelete.length} tickets across ALL branches?\n\nThis will permanently delete all client scheduling records globally. This action cannot be undone.`
      : `WARNING: Are you sure you want to delete ALL ${ticketsToDelete.length} tickets assigned to "${branchName}"?\n\nThis will permanently delete all these scheduling records. This action cannot be undone.`

    if (!window.confirm(confirmMsg)) {
      return
    }

    setRefreshing(true)
    let deletedCount = 0
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

    for (const ticket of ticketsToDelete) {
      try {
        const res = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          deletedCount++
        }
      } catch (err) {
        console.error('Failed to delete ticket:', ticket.id, err)
      }
    }

    alert(`Successfully deleted ${deletedCount} of ${ticketsToDelete.length} tickets for "${branchName}".`)
    fetchData()
  }

  // Open action drawer for a ticket
  const openDrawer = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setAssignBranchId(ticket.branchId || '')
    setEditCustomerName(ticket.customerName || '')
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
      if ((t.sourceVendor || 'Direct').toUpperCase() !== storeFilter.toUpperCase()) return false
    }

    // Branch filter
    if (branchFilter !== 'ALL') {
      if (t.branchId !== branchFilter) return false
    }

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const custName = (t.customerName || '').toLowerCase()
      const branchName = branches.find(b => b.id === t.branchId)?.name?.toLowerCase() || ''
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
      return { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', label: 'Robinsons B2B' }
    } else if (s.includes('abenson')) {
      return { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', label: 'Abenson B2B' }
    } else if (s.includes('direct')) {
      return { bg: 'rgba(99,102,241,0.1)', color: '#6366F1', label: 'Direct Client' }
    }
    return { bg: 'rgba(100,116,139,0.1)', color: '#64748B', label: store || 'Other Store' }
  }




  // Format charges helper
  const formatCharges = (amount?: number) => {
    if (amount === undefined || amount === null) return '—'
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
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

  return (
    <div className="flex flex-col gap-6" style={{ minHeight: '100%', backgroundColor: pageBg }}>
      
      {/* Top Banner Control Block */}
      <div className="rounded-2xl p-6 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 transition-all shadow-md"
           style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest mb-1 text-[#10B981]">
            DTI Guard Compliance Panel
          </p>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            Client Scheduling Masterlist
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            Monitor SLA thresholds, upload bulk Excel client lists, and scan PDF/receipt voucher files via Gemini.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap w-full xl:w-auto">
          {/* Scan Image button */}
          <input
            ref={scanFileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleVoucherScan(file)
            }}
          />
          <button
            type="button"
            onClick={() => scanFileInputRef.current?.click()}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-[1.02] shadow-sm disabled:opacity-60"
            style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)', color: '#10B981' }}
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Scan PDF/Photo Voucher
          </button>

          {/* Import Excel button */}
          <input
            ref={excelFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleExcelImport}
          />
          <button
            type="button"
            onClick={() => excelFileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-[1.02] shadow-sm"
            style={{ backgroundColor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.2)', color: '#3B82F6' }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Import Client Excel
          </button>

          {/* Manual creation */}
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-500 to-teal-600 transition-all hover:scale-[1.02] shadow-md shadow-emerald-500/10"
          >
            + Add Client Ticket
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchData}
            disabled={refreshing}
            className="p-2.5 rounded-xl border transition-all hover:scale-[1.02]"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* OCR/Scan Error Warning banner */}
      {scanError && (
        <div className="p-4 rounded-xl border flex items-center justify-between gap-3 shadow-sm"
             style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <div className="flex items-center gap-2 text-xs font-semibold text-red-500">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{scanError}</span>
          </div>
          <button onClick={() => setScanError('')} className="p-1 rounded-lg text-red-500 hover:bg-red-500/10">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Vendor Selection Toolbar moved inside Table Container */}

      {/* Category Tabs */}
      <div className="flex p-1 rounded-xl border w-full md:w-fit"
           style={{ backgroundColor: cardBg, borderColor: border }}>
        {(['ALL', 'UNASSIGNED', 'PENDING', 'INSTALLED', 'CANCELLED'] as const).map(tab => {
          const active = activeTab === tab
          let label = tab === 'ALL' ? 'All' : tab === 'UNASSIGNED' ? 'Not Assigned' : tab === 'INSTALLED' ? 'Installed' : tab.toLowerCase()
          label = label.charAt(0).toUpperCase() + label.slice(1)
          
          let count = tickets.filter(t => {
            const stat = t.status.toUpperCase()
            const isAssigned = !!t.assignedTo || !!t.branchId
            if (tab === 'ALL') return true
            if (tab === 'UNASSIGNED') return !isAssigned && stat !== 'COMPLETED' && stat !== 'CANCELLED'
            if (tab === 'PENDING') return isAssigned && stat !== 'COMPLETED' && stat !== 'CANCELLED'
            if (tab === 'INSTALLED') return stat === 'COMPLETED' || !!(t.installationCharges && t.installationCharges > 0)
            return stat === 'CANCELLED'
          }).length

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-lg text-xs font-black transition-all duration-200 uppercase tracking-widest flex items-center gap-2 ${
                active
                  ? tab === 'ALL' ? 'bg-slate-700 text-white shadow-md' : tab === 'UNASSIGNED' ? 'bg-amber-500 text-white shadow-md' : tab === 'PENDING' ? 'bg-blue-500 text-white shadow-md' : tab === 'INSTALLED' ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-600 text-white shadow-md'
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Main Masterlist Table Container */}
      <div className="border rounded-2xl overflow-hidden shadow-sm"
           style={{ backgroundColor: cardBg, borderColor: border }}>
        
        {/* Table Header Toolbar */}
        <div className="px-5 py-4 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Branch Filter Dropdown */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs shadow-sm transition-colors hover:border-[#10B981]"
                   style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                <select
                  value={branchFilter}
                  onChange={e => setBranchFilter(e.target.value)}
                  className="bg-transparent outline-none text-xs font-bold cursor-pointer"
                  style={{ color: textPrimary }}
                >
                  <option value="ALL" style={{ color: '#000' }}>All Branches</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>
                  ))}
                </select>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleClearBranchRecords}
                  disabled={refreshing}
                  className="p-2 rounded-xl border border-red-500/20 text-red-500 bg-red-500/5 hover:bg-red-500 hover:text-white transition-all shadow-sm flex items-center justify-center"
                  style={{ width: '32px', height: '32px' }}
                  title={branchFilter === 'ALL' ? "Clear all records for all branches" : "Clear all records for this branch"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Store Vendor Filter Dropdown */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs shadow-sm transition-colors hover:border-[#10B981]"
                 style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
              <Building2 className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
              <select
                value={storeFilter}
                onChange={e => setStoreFilter(e.target.value)}
                className="bg-transparent outline-none text-xs font-bold cursor-pointer"
                style={{ color: textPrimary }}
              >
                <option value="ALL" style={{ color: '#000' }}>All Stores</option>
                <option value="Robinsons B2B" style={{ color: '#000' }}>Robinsons B2B</option>
                <option value="Abenson B2B" style={{ color: '#000' }}>Abenson B2B</option>
                <option value="Direct" style={{ color: '#000' }}>Direct Store</option>
              </select>
            </div>

            {/* Search Bar */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs min-w-0"
                 style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-xs min-w-0 w-32 md:w-48"
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

          <span className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm"
                style={{ color: '#10B981', backgroundColor: 'rgba(16,185,129,0.12)' }}>
            {filtered.length} client{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: inputBg, color: textMuted, borderBottom: `2px solid ${border}` }}>
                {[
                  { label: "PRIORITY / TAG", width: 120 },
                  { label: "CUSTOMER'S NAME", width: 160 },
                  { label: "DESTINATION", width: 220 },
                  { label: "DISTRICT", width: 110 },
                  { label: "CONTACT NO.", width: 120 },
                  { label: "BRAND", width: 120 },
                  { label: "DLR", width: 120 },
                  { label: "STATUS", width: 120 },
                  { label: "COMMIT", width: 110 },
                  { label: "INSTALLER", width: 130 },
                  { label: "VEHICLE", width: 120 },
                  { label: "UPDATE / REMARKS", width: 200 },
                  { label: "CHARGES", width: 100, alignRight: true },
                  { label: "PAYMENT", width: 110 },
                  { label: "CONTROL# / SI", width: 110 },
                  { label: "ACTIONS", width: 80, alignRight: true }
                ].map(col => (
                  <th
                    key={col.label}
                    style={{
                      padding: '7px 10px',
                      textAlign: col.alignRight ? 'right' : 'left',
                      color: textMuted,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      borderRight: `1px solid ${border}`,
                      letterSpacing: '0.03em',
                      fontSize: '11px',
                      width: col.width
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={16} className="py-24 text-center text-sm font-semibold" style={{ color: textMuted }}>
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#10B981]" />
                    Loading Client Scheduling Masterlist...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-24 text-center">
                    <FileText className="w-12 h-12 opacity-25 mx-auto mb-3" style={{ color: textMuted }} />
                    <p className="text-sm font-bold" style={{ color: textPrimary }}>No client tickets found</p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>Try altering your search query, filter tabs, or upload a spreadsheet.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((ticket, idx) => {
                  const storeStyle = getStoreStyle(ticket.sourceVendor)
                  const rowStyle = getRowStyleByPriority(ticket.priorityTag)

                  return (
                    <tr
                      key={ticket.id}
                      style={{
                        borderBottom: `1px solid ${border}`,
                        backgroundColor: idx % 2 === 0 ? 'transparent' : (isLight ? '#fafafa' : '#080f1c'),
                        ...rowStyle
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = isLight ? '#f1f5f9' : '#0f1e36'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = rowStyle.backgroundColor || (idx % 2 === 0 ? 'transparent' : (isLight ? '#fafafa' : '#080f1c'))
                      }}
                      className="text-xs transition-colors"
                    >
                      {/* 1. Priority Tag */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', fontWeight: 600 }}>
                        {ticket.priorityTag ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            ticket.priorityTag.toUpperCase().includes('MORNING') ? 'bg-red-500/15 text-red-500 border border-red-500/30' :
                            ticket.priorityTag.toUpperCase().includes('OLD') ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30' :
                            'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                          }`}>
                            {ticket.priorityTag}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal italic">—</span>
                        )}
                      </td>

                      {/* 2. Customer's Name */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textPrimary }} className="font-bold">
                        <span style={{ color: textMuted, fontSize: '10px', marginRight: 5 }}>{idx + 1}</span>
                        {ticket.customerName || 'Direct Client'}
                      </td>

                      {/* 3. Destination (Address) */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textPrimary, minWidth: 220 }}>
                        <span className="line-clamp-2 leading-relaxed" title={ticket.location}>
                          {ticket.location || '—'}
                        </span>
                      </td>

                      {/* 4. District */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textPrimary }}>
                        {ticket.district || <span className="text-slate-400 font-normal italic">—</span>}
                      </td>

                      {/* 5. Contact No. */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: '#10B981' }}>
                        <FormatPhone raw={ticket.contactPhone} />
                      </td>

                      {/* 6. Brand (Unit Type) */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textMuted }}>
                        {ticket.unitType || <span className="text-slate-400 font-normal italic">—</span>}
                      </td>

                      {/* 7. DLR (Store Source) */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px' }}>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider"
                              style={{ backgroundColor: storeStyle.bg, color: storeStyle.color }}>
                          {storeStyle.label}
                        </span>
                      </td>

                      {/* 8. Status (Service Type) */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textPrimary }}>
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold">{ticket.serviceType || 'Installation'}</span>
                          {!!(ticket.installationCharges && ticket.installationCharges > 0) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 w-fit">
                              ✓ Installed
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 9. Commit */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textMuted }}>
                        {ticket.commitType || <span className="text-slate-400 font-normal italic">—</span>}
                      </td>

                      {/* 10. Installer */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textPrimary }} className="font-semibold">
                        {ticket.installerName || ticket.assignedEmployeeName || <span className="text-amber-500 italic">Not Assigned</span>}
                      </td>

                      {/* 11. Service (Vehicle) */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textPrimary }} className="font-mono text-[11px]">
                        {ticket.serviceVehicle || <span className="text-slate-400 font-normal italic">—</span>}
                      </td>

                      {/* 12. Update (Remarks) */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textMuted, minWidth: 200 }}>
                        <span className="line-clamp-2 leading-relaxed" title={ticket.remarksUpdate || ticket.description}>
                          {ticket.remarksUpdate || ticket.description || '—'}
                        </span>
                      </td>

                      {/* 13. Installation Charges */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', textAlign: 'right' }}>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`font-mono font-bold ${ticket.installationCharges && ticket.installationCharges > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                            {formatCharges(ticket.installationCharges)}
                          </span>
                          {!!(ticket.installationCharges && ticket.installationCharges > 0) && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 opacity-80">paid</span>
                          )}
                        </div>
                      </td>

                      {/* 14. Mode of Payment */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textPrimary }} className="font-semibold">
                        {ticket.modeOfPayment || <span className="text-slate-400 font-normal italic">—</span>}
                      </td>

                      {/* 15. Control# / SI */}
                      <td style={{ padding: '6px 10px', borderRight: `1px solid ${border}`, fontSize: '11px', color: textPrimary }} className="font-mono font-bold">
                        {ticket.controlNumber || <span className="text-slate-400 font-normal italic">—</span>}
                      </td>

                      {/* 16. Actions */}
                      <td style={{ padding: '6px 10px', fontSize: '11px', textAlign: 'right' }}>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDrawer(ticket)}
                            className="px-2 py-1 rounded text-xs font-bold border transition-colors hover:border-[#10B981] hover:text-[#10B981]"
                            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
                          >
                            Manage
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTicket(ticket.id, ticket.customerName)}
                              className="px-2 py-1 rounded text-xs font-bold border border-red-500/20 text-red-500 bg-red-500/5 hover:bg-red-500 hover:text-white transition-colors"
                              title="Delete Ticket"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* Action Drawer (Assign Branch/Tech, Update Status, Edit Dispatch Fields) */}
      {isActionDrawerOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-end"
             style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
             onClick={() => setIsActionDrawerOpen(false)}>
          <div className="w-full max-w-md h-full flex flex-col p-6 shadow-2xl transition-all"
               style={{ backgroundColor: cardBg, borderLeft: `1px solid ${border}` }}
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: border }}>
              <div>
                <h3 className="font-black text-base" style={{ color: textPrimary }}>
                  Manage Ticket
                </h3>
                <p className="text-xs font-mono mt-0.5" style={{ color: textMuted }}>
                  ASH{(selectedTicket.id || '').replace(/-/g, '').slice(-6).toUpperCase()}
                </p>
              </div>
              <button onClick={() => setIsActionDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" style={{ color: textMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-5 pr-1">
              {/* Customer summary */}
              <div className="p-4 rounded-xl flex flex-col gap-2" style={{ backgroundColor: inputBg }}>
                <p className="text-xs font-black uppercase text-slate-400">Customer Details</p>
                <div className="text-sm font-bold" style={{ color: textPrimary }}>{selectedTicket.customerName || 'Direct Client'}</div>
                <div className="text-xs" style={{ color: textMuted }}>{selectedTicket.location}</div>
                {selectedTicket.contactPhone && <div className="text-xs font-semibold text-emerald-500">📞 {selectedTicket.contactPhone}</div>}
              </div>

              {/* Assign Branch */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider mb-1.5 block" style={{ color: textMuted }}>Assign Branch Zone</label>
                <select
                  value={assignBranchId}
                  onChange={e => {
                    setAssignBranchId(e.target.value)
                    setAssignTechId('') // Clear tech when branch changes
                  }}
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-semibold outline-none border"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                >
                  <option value="">Select Branch Zone...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Assign Technician */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider mb-1.5 block" style={{ color: textMuted }}>Assign Installer / Tech</label>
                <select
                  value={assignTechId}
                  onChange={e => setAssignTechId(e.target.value)}
                  disabled={!assignBranchId}
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-semibold outline-none border disabled:opacity-50"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                >
                  <option value="">Select Technician...</option>
                  {employees
                    .filter(e => !assignBranchId || e.branchId === assignBranchId)
                    .map(emp => (
                      <option key={emp.id} value={emp.id} style={{ color: '#000' }}>{emp.name}</option>
                    ))}
                </select>
                {!assignBranchId && <span className="text-[10px] text-amber-500 mt-1 block">Please select a branch first to filter technicians.</span>}
              </div>

              {/* Status Update */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider mb-1.5 block" style={{ color: textMuted }}>Update Service Status</label>
                <select
                  value={updateStatus}
                  onChange={e => setUpdateStatus(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-semibold outline-none border"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                >
                  <option value="PENDING">Pending (Ingested)</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="ON_THE_WAY">On the Way</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Installed (Completed)</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              {/* Dispatch spreadsheet updates */}
              <div className="border-t pt-4 mt-2 flex flex-col gap-4" style={{ borderColor: border }}>
                <p className="text-xs font-black uppercase text-slate-400">Edit Dispatch / Excel Fields</p>
                
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Customer's Name</label>
                  <input
                    type="text"
                    value={editCustomerName}
                    onChange={e => setEditCustomerName(e.target.value)}
                    placeholder="Customer Name"
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Priority Tag</label>
                    <input
                      type="text"
                      value={editPriorityTag}
                      onChange={e => setEditPriorityTag(e.target.value)}
                      placeholder="e.g. PRIORITY MORNING"
                      className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Control# / SI</label>
                    <input
                      type="text"
                      value={editControlNumber}
                      onChange={e => setEditControlNumber(e.target.value)}
                      placeholder="e.g. SI830343"
                      className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>District</label>
                    <input
                      type="text"
                      value={editDistrict}
                      onChange={e => setEditDistrict(e.target.value)}
                      placeholder="e.g. District 1"
                      className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Commit Type</label>
                    <input
                      type="text"
                      value={editCommitType}
                      onChange={e => setEditCommitType(e.target.value)}
                      placeholder="e.g. 9AM-12PM"
                      className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Installer Name</label>
                    <input
                      type="text"
                      value={editInstallerName}
                      onChange={e => setEditInstallerName(e.target.value)}
                      placeholder="e.g. John Doe Tech"
                      className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Service Vehicle</label>
                    <input
                      type="text"
                      value={editServiceVehicle}
                      onChange={e => setEditServiceVehicle(e.target.value)}
                      placeholder="e.g. FB11 - MIKE"
                      className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Charges (PHP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editInstallationCharges || ''}
                      onChange={e => setEditInstallationCharges(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Payment Mode</label>
                    <input
                      type="text"
                      value={editModeOfPayment}
                      onChange={e => setEditModeOfPayment(e.target.value)}
                      placeholder="e.g. Cash, G-Cash"
                      className="w-full rounded-xl px-3 py-2 text-xs outline-none border"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Remarks / Field Update</label>
                  <textarea
                    value={editRemarksUpdate}
                    onChange={e => setEditRemarksUpdate(e.target.value)}
                    rows={3}
                    placeholder="e.g. Completed today"
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none border resize-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t flex flex-col gap-3" style={{ borderColor: border }}>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsActionDrawerOpen(false)}
                  className="flex-1 border rounded-xl py-2.5 text-xs font-bold"
                  style={{ borderColor: inputBorder, color: textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDrawerActionSave}
                  disabled={actionSaving}
                  className="flex-1 bg-[#10B981] hover:bg-emerald-500 text-white rounded-xl py-2.5 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {actionSaving ? 'Saving...' : 'Apply Changes'}
                </button>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDeleteTicket(selectedTicket.id, selectedTicket.customerName)}
                  disabled={actionSaving}
                  className="w-full bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 border border-red-500/20 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Delete Ticket
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual / Scan Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handleFormCreateTicket}
                className="w-full max-w-2xl rounded-2xl p-6 flex flex-col gap-4 shadow-2xl transition-all"
                style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: border }}>
              <h3 className="text-base font-black" style={{ color: textPrimary }}>
                Create Client Ticket
              </h3>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" style={{ color: textMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto pr-1 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={addForm.customerName}
                    onChange={e => setAddForm(prev => ({ ...prev, customerName: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Contact Phone</label>
                  <input
                    type="text"
                    value={addForm.contactPhone}
                    onChange={e => setAddForm(prev => ({ ...prev, contactPhone: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Address / Location *</label>
                  <input
                    type="text"
                    required
                    value={addForm.locationRaw}
                    onChange={e => setAddForm(prev => ({ ...prev, locationRaw: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">District / Zone</label>
                  <input
                    type="text"
                    value={addForm.district}
                    onChange={e => setAddForm(prev => ({ ...prev, district: e.target.value }))}
                    placeholder="e.g. District 1, Quezon City"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Store Vendor Source</label>
                  <select
                    value={addForm.sourceVendor}
                    onChange={e => setAddForm(prev => ({ ...prev, sourceVendor: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    <option value="Robinsons B2B" style={{ color: '#000' }}>Robinsons B2B</option>
                    <option value="Abenson B2B" style={{ color: '#000' }}>Abenson B2B</option>
                    <option value="Direct" style={{ color: '#000' }}>Direct Store</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Aircon Unit Type / Brand</label>
                  <input
                    type="text"
                    value={addForm.unitType}
                    onChange={e => setAddForm(prev => ({ ...prev, unitType: e.target.value }))}
                    placeholder="e.g. Split AC, Window AC"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Priority Tag</label>
                  <input
                    type="text"
                    value={addForm.priorityTag}
                    onChange={e => setAddForm(prev => ({ ...prev, priorityTag: e.target.value }))}
                    placeholder="e.g. PRIORITY MORNING"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Control# / SI Voucher</label>
                  <input
                    type="text"
                    value={addForm.controlNumber}
                    onChange={e => setAddForm(prev => ({ ...prev, controlNumber: e.target.value }))}
                    placeholder="e.g. SI830343"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Commit Window</label>
                  <input
                    type="text"
                    value={addForm.commitType}
                    onChange={e => setAddForm(prev => ({ ...prev, commitType: e.target.value }))}
                    placeholder="e.g. 9AM-12PM"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Service Type / Status</label>
                  <input
                    type="text"
                    value={addForm.serviceType}
                    onChange={e => setAddForm(prev => ({ ...prev, serviceType: e.target.value }))}
                    placeholder="e.g. Installation, Cleaning"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Installer Name (External)</label>
                  <input
                    type="text"
                    value={addForm.installerName}
                    onChange={e => setAddForm(prev => ({ ...prev, installerName: e.target.value }))}
                    placeholder="e.g. John Doe Tech"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Service Vehicle & Driver</label>
                  <input
                    type="text"
                    value={addForm.serviceVehicle}
                    onChange={e => setAddForm(prev => ({ ...prev, serviceVehicle: e.target.value }))}
                    placeholder="e.g. FB11 - MIKE"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Installation Charges (PHP)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={addForm.installationCharges || ''}
                    onChange={e => setAddForm(prev => ({ ...prev, installationCharges: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Mode of Payment</label>
                  <input
                    type="text"
                    value={addForm.modeOfPayment}
                    onChange={e => setAddForm(prev => ({ ...prev, modeOfPayment: e.target.value }))}
                    placeholder="e.g. Cash, G-Cash"
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Preferred Date</label>
                  <input
                    type="date"
                    value={addForm.preferredDate}
                    onChange={e => setAddForm(prev => ({ ...prev, preferredDate: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">SLA Expiration Date</label>
                  <input
                    type="date"
                    value={addForm.slaExpirationDate}
                    onChange={e => setAddForm(prev => ({ ...prev, slaExpirationDate: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase block mb-1 text-slate-400">Update / Remarks / Ticket Description</label>
                <textarea
                  value={addForm.description}
                  onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value, remarksUpdate: e.target.value }))}
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2 text-xs outline-none resize-none"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>
            </div>

            <div className="pt-3 border-t flex gap-3" style={{ borderColor: border }}>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="flex-1 border rounded-xl py-2.5 text-xs font-bold"
                style={{ borderColor: inputBorder, color: textMuted }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formSubmitting}
                className="flex-1 bg-[#10B981] hover:bg-emerald-500 text-white rounded-xl py-2.5 text-xs font-bold transition-all disabled:opacity-50"
              >
                {formSubmitting ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Excel Sheet Upload Preview Modal */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-5xl rounded-2xl p-6 flex flex-col gap-4 shadow-2xl transition-all"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: border }}>
              <div>
                <h3 className="text-base font-black" style={{ color: textPrimary }}>
                  Spreadsheet Ingestion Preview
                </h3>
                <p className="text-xs mt-0.5" style={{ color: textMuted }}>
                  Verify the parsed customer data entries below before bulk uploading.
                </p>
              </div>
              <button type="button" onClick={() => {
                setExcelPreview([])
                setIsExcelModalOpen(false)
                setImportTargetBranchId('')
              }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" style={{ color: textMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto overflow-x-auto border rounded-xl" style={{ borderColor: border }}>
              <table className="w-full text-left text-xs min-w-[2000px]">
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
                    <th className="px-4 py-3 w-[120px]">Status (Service)</th>
                    <th className="px-4 py-3 w-[120px]">Commit</th>
                    <th className="px-4 py-3 w-[150px]">Installer</th>
                    <th className="px-4 py-3 w-[150px]">Service Vehicle</th>
                    <th className="px-4 py-3 w-[250px]">Update / Remarks</th>
                    <th className="px-4 py-3 w-[120px]">Charges</th>
                    <th className="px-4 py-3 w-[120px]">Payment Mode</th>
                    <th className="px-4 py-3 w-[120px]">Control# / SI</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreview.map((item, index) => (
                    <tr key={item.id} style={{ borderBottom: index < excelPreview.length - 1 ? `1px solid ${border}` : 'none' }}>
                      <td className="px-4 py-2.5 font-semibold">
                        {item.priorityTag ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            item.priorityTag.toUpperCase().includes('MORNING') ? 'bg-red-500/10 text-red-500' :
                            item.priorityTag.toUpperCase().includes('OLD') ? 'bg-amber-500/10 text-amber-500' :
                            'bg-blue-500/10 text-blue-500'
                          }`}>
                            {item.priorityTag}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: textPrimary }}>{item.customerName}</td>
                      <td className="px-4 py-2.5" style={{ color: textMuted }}>{item.location}</td>
                      <td className="px-4 py-2.5" style={{ color: textPrimary }}>{item.district || '—'}</td>
                      <td className="px-4 py-2.5 text-emerald-500">
                        <FormatPhone raw={item.contactPhone} />
                      </td>
                      <td className="px-4 py-2.5" style={{ color: textMuted }}>{item.unitType}</td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: textPrimary }}>{item.sourceVendor}</td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: textPrimary }}>{item.serviceType}</td>
                      <td className="px-4 py-2.5" style={{ color: textMuted }}>{item.commitType || '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: textPrimary }}>{item.installerName || '—'}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: textPrimary }}>{item.serviceVehicle || '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: textMuted }}>{item.remarksUpdate || item.description || '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-emerald-500">{formatCharges(item.installationCharges)}</td>
                      <td className="px-4 py-2.5" style={{ color: textPrimary }}>{item.modeOfPayment || '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-bold" style={{ color: textPrimary }}>{item.controlNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderColor: border }}>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-xs font-black uppercase tracking-wider shrink-0" style={{ color: textMuted }}>
                  Assign to Branch:
                </label>
                <select
                  value={importTargetBranchId}
                  onChange={e => setImportTargetBranchId(e.target.value)}
                  className="rounded-xl px-3 py-2 text-xs font-bold outline-none border w-full sm:w-56"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                >
                  <option value="" style={{ color: '#000' }}>Select Branch Zone...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id} style={{ color: '#000' }}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setExcelPreview([])
                    setIsExcelModalOpen(false)
                    setImportTargetBranchId('')
                  }}
                  className="px-6 py-2.5 border rounded-xl text-xs font-bold w-full sm:w-auto"
                  style={{ borderColor: inputBorder, color: textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkUploadSubmit}
                  disabled={bulkUploading || !importTargetBranchId}
                  className="px-6 py-2.5 bg-[#3B82F6] hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 w-full sm:w-auto"
                >
                  {bulkUploading ? 'Uploading...' : 'Confirm Bulk Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
