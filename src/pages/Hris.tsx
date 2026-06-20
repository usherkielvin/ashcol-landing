import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'
import {
  FileSpreadsheet, Calendar, CreditCard, Plus, Check, X,
  Search, Filter, AlertCircle, Upload, Trash2, Eye, Loader2
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────
interface User {
  id: string
  name: string
  email: string
  role: string
  branchId?: string
}

interface LeaveRequest {
  id: string
  employeeId: string
  leaveType: string
  startDate: string
  endDate: string
  reason: string
  status: string
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  attachmentUrl?: string
  createdAt: string
}

interface LeaveBalance {
  id: string
  employeeId: string
  year: number
  vacationAllocated: number
  vacationUsed: number
  sickAllocated: number
  sickUsed: number
  emergencyAllocated: number
  emergencyUsed: number
}

interface CashAdvance {
  id: string
  employeeId: string
  amount: number
  repaymentTermMonths: number
  monthlyDeduction: number
  purpose: string
  notes?: string
  status: string
  approvedBy?: string
  approvedAt?: string
  disbursedAt?: string
  remainingBalance: number
  branchId?: string
  createdAt: string;
}

export default function Hris() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  // Theme Colors
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const pageBg      = isLight ? '#f8fafc' : '#060B18'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#ffffff' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const excelGreen  = '#10B981'

  const [activeTab, setActiveTab] = useState<'leaves' | 'advances' | 'drivers'>('leaves')

  const [error, setError] = useState<string | null>(null)

  // Global branch selection
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )
  useEffect(() => {
    const sync = () => setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [])

  // Driver Route Sheets States
  const [driverSheets, setDriverSheets] = useState<any[]>([])
  const [showDriverSheetModal, setShowDriverSheetModal] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [editingSheet, setEditingSheet] = useState<any | null>(null)

  const driverFileInputRef = useRef<HTMLInputElement>(null)
  
  // Data lists
  const [users, setUsers] = useState<User[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [advances, setAdvances] = useState<CashAdvance[]>([])
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Modals state
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedAdvance, setSelectedAdvance] = useState<CashAdvance | null>(null)

  // Status Confirmation State
  const [confirmingAdvance, setConfirmingAdvance] = useState<CashAdvance | null>(null)
  const [confirmingStatus, setConfirmingStatus] = useState<'APPROVED' | 'DISBURSED' | 'REJECTED' | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')

  // Leave Form Fields
  const [leaveType, setLeaveType] = useState('VACATION')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')

  // Cash Advance Form Fields
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advancePurpose, setAdvancePurpose] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [employeeNameInput, setEmployeeNameInput] = useState('')

  // ── Helper: Get JWT Token ─────────────────────────────────────────
  const getToken = useCallback((): string => {
    return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
  }, [])

  // ── Fetch Operations ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setError(null)
    const token = getToken()
    const headers = { Authorization: `Bearer ${token}` }

    try {
      // Fetch users
      const usersRes = await fetch(`${API_BASE_URL}/user/all`, { headers })
      if (usersRes.ok) {
        const uData = await usersRes.json()
        setUsers(uData?.data || uData || [])
      }

      if (activeTab === 'leaves') {
        const leavesRes = await fetch(`${API_BASE_URL}/hris/leaves`, { headers })
        const balancesRes = await fetch(`${API_BASE_URL}/hris/leaves/balances`, { headers })
        if (leavesRes.ok) setLeaves(await leavesRes.json())
        if (balancesRes.ok) setBalances(await balancesRes.json())
      } else if (activeTab === 'advances') {
        const advancesRes = await fetch(`${API_BASE_URL}/hris/cash-advances`, { headers })
        if (advancesRes.ok) setAdvances(await advancesRes.json())
      } else if (activeTab === 'drivers') {
        const sheetsRes = await fetch(`${API_BASE_URL}/hris/driver-routes`, { headers })
        if (sheetsRes.ok) setDriverSheets(await sheetsRes.json())
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sync data with the server.')
    }
  }, [activeTab, getToken])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── User ID Helper ───────────────────────────────────────────────
  const getUserName = (userId: string) => {
    const found = users.find(u => u.id === userId)
    return found ? found.name : 'Unknown Employee'
  }

  const getBranchDisplayName = (id: string | null): string => {
    if (!id || id === 'ALL_BRANCHES') return 'N/A'
    const upper = id.toUpperCase()
    if (upper === 'BR-TAGUIG-SALES-SALES' || upper === 'BR-TAGUIG-SALES') {
      return 'TAGUIG - SALES'
    }
    if (upper === 'BR-TAGUIG-SALES-SERVICES' || upper === 'BR-TAGUIG-SERVICES' || upper === 'BR-TAGUIG-SERVICE') {
      return 'TAGUIG - SERVICES'
    }
    return id.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').replace(/-/g, ' ').toUpperCase()
  }

  const getUserBranchName = (userId: string) => {
    const found = users.find(u => u.id === userId)
    return found ? getBranchDisplayName(found.branchId || null) : 'N/A'
  }

  // ── Action Handlers ───────────────────────────────────────────────
  
  // Scan Driver Sheet (Vision OCR)
  const handleScanDriverSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setScanning(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)

    try {
      const token = getToken()
      const res = await fetch(`${API_BASE_URL}/hris/driver-routes/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      })
      if (res.ok) {
        const data = await res.json()
        if (data.error) {
          alert(data.error)
        } else {
          // Setup editing state
          setEditingSheet({
            dateFiled: data.dateFiled || new Date().toISOString().substring(0, 10),
            filedBy: data.filedBy || '',
            driverName: data.driverName || '',
            position: data.position || 'Driver',
            branch: data.branch || '',
            cutOffPeriod: data.cutOffPeriod || '',
            validatedBy: data.validatedBy || '',
            totalApprovedOt: data.totalApprovedOt || '',
            remarksOic: data.remarksOic || '',
            idleTimeRemarks: data.idleTimeRemarks || '',
            rows: (data.rows || []).map((r: any) => ({
              logDate: r.logDate || '',
              postedSchedule: r.postedSchedule || '',
              bioTimeIn: r.bioTimeIn || '',
              bioTimeOut: r.bioTimeOut || '',
              departureTime: r.departureTime || '',
              arrivalTime: r.arrivalTime || '',
              sites: r.sites || []
            }))
          })
          setShowDriverSheetModal(true)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Scan failed (HTTP ${res.status})`)
      }
    } catch (err: any) {
      alert('Error scanning sheet: ' + err.message)
    } finally {
      setScanning(false)
      if (driverFileInputRef.current) driverFileInputRef.current.value = ''
    }
  }

  // Save/Update Driver Sheet
  const handleSaveDriverSheet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSheet) return

    const token = getToken()
    const url = editingSheet.id 
      ? `${API_BASE_URL}/hris/driver-routes/${editingSheet.id}`
      : `${API_BASE_URL}/hris/driver-routes/save`
    const method = editingSheet.id ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editingSheet)
      })

      if (res.ok) {
        setShowDriverSheetModal(false)
        setEditingSheet(null)
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to save sheet')
      }
    } catch (err: any) {
      alert('Error saving sheet: ' + err.message)
    }
  }

  // Delete Driver Sheet
  const handleDeleteDriverSheet = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this driver route sheet and all its logs?')) return
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/driver-routes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        fetchData()
      } else {
        alert('Failed to delete sheet')
      }
    } catch (err: any) {
      alert('Error deleting sheet: ' + err.message)
    }
  }

  // View Sheet details
  const handleViewSheetDetails = async (id: string) => {
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/driver-routes/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        const sheetData = data.sheet
        const logs = data.logs.map((l: any) => {
          try {
            return {
              ...l,
              sites: l.sitesJson ? JSON.parse(l.sitesJson) : []
            }
          } catch (e) {
            return { ...l, sites: [] }
          }
        })
        sheetData.rows = logs
        setEditingSheet(sheetData)
        setShowDriverSheetModal(true)
      } else {
        alert('Failed to fetch details')
      }
    } catch (err: any) {
      alert('Error fetching details: ' + err.message)
    }
  }

  // Submit Leave Request
  const handleLeaveRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/leaves`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          leaveType,
          startDate: leaveStart,
          endDate: leaveEnd,
          reason: leaveReason
        })
      })
      if (res.ok) {
        setShowLeaveModal(false)
        setLeaveReason('')
        setLeaveStart('')
        setLeaveEnd('')
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Approve/Reject Leave
  const handleLeaveApproval = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const token = getToken()
    const rejectionReason = status === 'REJECTED' ? prompt('Enter reason for rejection:') : null
    if (status === 'REJECTED' && rejectionReason === null) return

    try {
      const res = await fetch(`${API_BASE_URL}/hris/leaves/${id}/approve`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, rejectionReason })
      })
      if (res.ok) {
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Submit Cash Advance Request
  const handleAdvanceRequest = async (e: React.FormEvent) => {
    e.preventDefault()

    let targetEmployeeId = selectedEmployeeId
    if (!targetEmployeeId && employeeNameInput) {
      const found = employeeSuggestions.find(
        u => u.name.toLowerCase() === employeeNameInput.trim().toLowerCase()
      )
      if (found) {
        targetEmployeeId = found.id
      }
    }

    if (!targetEmployeeId) {
      alert("Please select or enter a valid employee name.")
      return
    }

    const targetEmp = users.find(u => u.id === targetEmployeeId)
    const empBranchId = targetEmp?.branchId || ''
    const branchToSubmit = (activeBranchFilter && activeBranchFilter !== 'ALL_BRANCHES') 
      ? activeBranchFilter 
      : empBranchId;

    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/cash-advances`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          employeeId: targetEmployeeId,
          amount: parseFloat(advanceAmount),
          repaymentTermMonths: 1,
          purpose: advancePurpose,
          branchId: branchToSubmit
        })
      })
      if (res.ok) {
        setShowAdvanceModal(false)
        setAdvanceAmount('')
        setAdvancePurpose('')
        setEmployeeNameInput('')
        setSelectedEmployeeId('')
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // Approve/Disburse Cash Advance
  const handleAdvanceApproval = async (id: string, status: 'APPROVED' | 'DISBURSED' | 'REJECTED', notes: string) => {
    const token = getToken()
    try {
      const res = await fetch(`${API_BASE_URL}/hris/cash-advances/${id}/approve`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, notes })
      })
      if (res.ok) {
        fetchData()
      }
    } catch (err) { /* ignore */ }
  }

  // ── Leaves Computations (Excel Summary) ───────────────────────────
  const filteredLeaves = useMemo(() => {
    return leaves.filter(l => {
      const matchesSearch = getUserName(l.employeeId).toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' ? true : l.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [leaves, searchQuery, statusFilter, users])

  const leavesSummary = useMemo(() => {
    const total = filteredLeaves.length
    const pending = filteredLeaves.filter(l => l.status === 'PENDING').length
    const approved = filteredLeaves.filter(l => l.status === 'APPROVED').length
    return { total, pending, approved }
  }, [filteredLeaves])

  // ── Cash Advances Computations (Excel Summary) ────────────────────
  const activeBranchFilter = useMemo(() => {
    const role = (user?.role || '').toLowerCase()
    if (role === 'admin') {
      return globalBranchId
    } else {
      return user?.branchId || null
    }
  }, [user, globalBranchId])

  const employeeSuggestions = useMemo(() => {
    return users.filter(u => u.role !== 'CUSTOMER')
  }, [users])

  const filteredAdvances = useMemo(() => {
    return advances.filter(a => {
      const advBranch = a.branchId || ''

      const isGlobalUser = !advBranch || advBranch.toUpperCase() === 'NONE' || advBranch.toUpperCase() === 'N/A'

      if (!isGlobalUser && activeBranchFilter && activeBranchFilter !== 'ALL_BRANCHES') {
        const cleanFilter = activeBranchFilter.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').toLowerCase()
        const cleanEmpBranch = advBranch.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').toLowerCase()
        if (cleanFilter !== cleanEmpBranch) {
          return false
        }
      }

      const matchesSearch = getUserName(a.employeeId).toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' ? true : a.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [advances, searchQuery, statusFilter, users, activeBranchFilter])

  const advancesSummary = useMemo(() => {
    let originalSum = 0
    filteredAdvances.forEach(a => {
      originalSum += a.amount
    })
    return {
      originalSum
    }
  }, [filteredAdvances])

  // ── CSS Injection for spreadsheet cells ───────────────────────────
  useEffect(() => {
    const id = 'excel-workspace-styles'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      .excel-table { border-collapse: collapse; width: 100%; font-size: 13px; }
      .excel-table th { font-weight: 700; text-align: left; padding: 8px 12px; border: 1px solid var(--excel-border); background: var(--excel-header-bg); color: var(--excel-header-text); }
      .excel-table td { padding: 6px 12px; border: 1px solid var(--excel-border); color: var(--excel-cell-text); }
      .excel-total-row td { font-weight: 800; background: var(--excel-total-bg); border-top: 2px solid var(--excel-border); border-bottom: 2px double var(--excel-border); }
      .excel-tab-bar { display: flex; border-bottom: 1px solid var(--excel-border); background: var(--excel-tab-bar-bg); }
      .excel-tab { padding: 8px 24px; font-weight: 700; border-right: 1px solid var(--excel-border); cursor: pointer; transition: all 0.15s; font-size: 13px; position: relative; }
      .excel-tab-active { background: var(--excel-tab-active-bg); color: #10B981; border-top: 3px solid #10B981; font-weight: 800; }
    `
    document.head.appendChild(style)
  }, [])

  return (
    <div
      className="flex flex-col gap-5 min-h-full"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: pageBg,
        color: textPrimary,
        ['--excel-border' as any]: border,
        ['--excel-header-bg' as any]: isLight ? '#f1f5f9' : '#0F1A2E',
        ['--excel-header-text' as any]: textPrimary,
        ['--excel-cell-text' as any]: textPrimary,
        ['--excel-total-bg' as any]: isLight ? '#f8fafc' : '#0B132B',
        ['--excel-tab-bar-bg' as any]: isLight ? '#e2e8f0' : '#070C19',
        ['--excel-tab-active-bg' as any]: cardBg,
      }}
    >
      {/* ── Title Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-1 flex items-center gap-2.5">
            <FileSpreadsheet className="w-7 h-7" style={{ color: excelGreen }} />
            HRIS Ledger
          </h2>
          <p className="text-xs" style={{ color: textMuted }}>
            Corporate human resources, leaves, and cash advance spreadsheets
          </p>
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{
            backgroundColor: isLight ? '#fef2f2' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isLight ? '#fecaca' : '#7f1d1d'}`,
            color: isLight ? '#dc2626' : '#f87171',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold">{error}</span>
        </div>
      )}

      {/* ── Excel style sheet tabs ───────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="excel-tab-bar">
          {[
            { id: 'leaves', label: 'Leaves Sheet', icon: Calendar },
            { id: 'advances', label: 'Cash Advances Sheet', icon: CreditCard },
            { id: 'drivers', label: 'Drivers Monitoring Ledger', icon: FileSpreadsheet }
          ].map(tab => {
            const TabIcon = tab.icon
            const active = activeTab === tab.id
            return (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any)
                  setStatusFilter('ALL')
                  setSearchQuery('')
                }}
                className={`excel-tab flex items-center gap-2 ${active ? 'excel-tab-active' : ''}`}
                style={{ borderRightColor: border }}
              >
                <TabIcon className="w-4 h-4" style={{ color: active ? excelGreen : textMuted }} />
                {tab.label}
              </div>
            )
          })}
        </div>

        {/* Filter & Toolbar Area */}
        <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3.5 top-3 w-4 h-4" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search employee name…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              />
            </div>

            {/* Filter status */}
            <div className="flex items-center gap-1.5 w-full md:w-auto">
              <Filter className="w-3.5 h-3.5" style={{ color: textMuted }} />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-bold appearance-none focus:outline-none"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              >
                <option value="ALL">Status: All</option>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                {activeTab === 'leaves' ? (
                  <option value="REJECTED">REJECTED</option>
                ) : (
                  <>
                    <option value="DISBURSED">DISBURSED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="FULLY_PAID">FULLY PAID</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Add Request Buttons */}
          <div>
            {activeTab === 'leaves' && (
              <button
                onClick={() => setShowLeaveModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Apply Leave
              </button>
            )}
            {activeTab === 'advances' && (
              <button
                onClick={() => {
                  const role = (user?.role || '').toLowerCase()
                  if (role === 'admin') {
                    setEmployeeNameInput('')
                    setSelectedEmployeeId('')
                  } else {
                    setEmployeeNameInput(user?.name || '')
                    setSelectedEmployeeId(user?.id || '')
                  }
                  setAdvanceAmount('')
                  setAdvancePurpose('')
                  setShowAdvanceModal(true)
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Request Cash Advance
              </button>
            )}
            {activeTab === 'drivers' && (
              <div className="flex items-center gap-2">
                <input
                  ref={driverFileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleScanDriverSheet}
                />
                <button
                  onClick={() => driverFileInputRef.current?.click()}
                  disabled={scanning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/25 transition-all"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Import Scan (Pic/PDF)
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditingSheet({
                      dateFiled: new Date().toISOString().substring(0, 10),
                      filedBy: '',
                      driverName: '',
                      position: 'Driver',
                      branch: '',
                      cutOffPeriod: '',
                      validatedBy: '',
                      totalApprovedOt: '',
                      remarksOic: '',
                      idleTimeRemarks: '',
                      rows: Array.from({ length: 7 }, (_, i) => ({
                        logDate: `June ${i + 2}`,
                        postedSchedule: '7:00 AM',
                        bioTimeIn: '',
                        bioTimeOut: '',
                        departureTime: '',
                        arrivalTime: '',
                        sites: []
                      }))
                    })
                    setShowDriverSheetModal(true)
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981] text-white hover:opacity-90 transition-all shadow-md"
                >
                  <Plus className="w-4 h-4" /> Add Driver Sheet
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Leaves Grid Table View ─────────────────────────────── */}
        {activeTab === 'leaves' && (
          <>
            <div className="overflow-x-auto">
              <table className="excel-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Employee Name</th>
                    <th>Leave Type</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                    <th>Approved By</th>
                    <th>Approved At</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaves.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="font-mono text-xs select-all">{l.id.substring(0, 8).toUpperCase()}</td>
                      <td className="font-semibold">{getUserName(l.employeeId)}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase"
                          style={{
                            backgroundColor: l.leaveType === 'SICK' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                            color: l.leaveType === 'SICK' ? '#EF4444' : '#3B82F6'
                          }}
                        >
                          {l.leaveType}
                        </span>
                      </td>
                      <td className="font-medium">{l.startDate}</td>
                      <td className="font-medium">{l.endDate}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                          style={{
                            backgroundColor: l.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : l.status === 'APPROVED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: l.status === 'PENDING' ? '#F59E0B' : l.status === 'APPROVED' ? '#10B981' : '#EF4444'
                          }}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td>{l.approvedBy ? getUserName(l.approvedBy) : '—'}</td>
                      <td>{l.approvedAt ? new Date(l.approvedAt).toLocaleDateString() : '—'}</td>
                      <td>
                        {l.status === 'PENDING' ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleLeaveApproval(l.id, 'APPROVED')}
                              className="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                              title="Approve Leave"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleLeaveApproval(l.id, 'REJECTED')}
                              className="p-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              title="Reject Leave"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-semibold select-none">No Action</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* Excel Summary Row */}
                  <tr className="excel-total-row">
                    <td colSpan={2}>Total Leaves Count:</td>
                    <td>{leavesSummary.total} Total</td>
                    <td colSpan={2}>Approved: {leavesSummary.approved}</td>
                    <td>Pending: {leavesSummary.pending}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* Sheet Sub-Table B: LEAVE BALANCES */}
            <div className="mt-6">
              <div className="px-4 py-2 border-b font-bold text-xs bg-slate-50 dark:bg-slate-800/20 text-slate-500" style={{ borderColor: border }}>
                B. EMPLOYEE LEAVE CREDITS BALANCES SHEET
              </div>
              <div className="overflow-x-auto border-t">
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Year</th>
                      <th>Vacation (Allocated)</th>
                      <th>Vacation (Used)</th>
                      <th>Sick (Allocated)</th>
                      <th>Sick (Used)</th>
                      <th>Emergency (Allocated)</th>
                      <th>Emergency (Used)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="font-semibold">{getUserName(b.employeeId)}</td>
                        <td className="font-mono text-xs">{b.year}</td>
                        <td>{b.vacationAllocated}</td>
                        <td className="text-rose-500 font-medium">{b.vacationUsed}</td>
                        <td>{b.sickAllocated}</td>
                        <td className="text-rose-500 font-medium">{b.sickUsed}</td>
                        <td>{b.emergencyAllocated}</td>
                        <td className="text-rose-500 font-medium">{b.emergencyUsed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Cash Advances Grid Table View ───────────────────────── */}
        {activeTab === 'advances' && (
          <div className="overflow-x-auto">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Employee Name</th>
                  <th>Branch</th>
                  <th>Request Amount</th>
                  <th>Purpose / Reason</th>
                  <th>Status</th>
                  <th>Submitted At</th>
                  <th style={{ width: 240 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdvances.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="font-mono text-xs select-all">{a.id.substring(0, 8).toUpperCase()}</td>
                    <td className="font-semibold">{getUserName(a.employeeId)}</td>
                    <td className="text-xs font-semibold text-slate-500">{getBranchDisplayName(a.branchId || null)}</td>
                    <td className="font-semibold">₱{a.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="text-xs text-slate-500 font-medium max-w-[250px] truncate" title={a.purpose}>{a.purpose || '—'}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase"
                        style={{
                          backgroundColor: a.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : a.status === 'APPROVED' ? 'rgba(59,130,246,0.1)' : a.status === 'DISBURSED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: a.status === 'PENDING' ? '#F59E0B' : a.status === 'APPROVED' ? '#3B82F6' : a.status === 'DISBURSED' ? '#10B981' : '#EF4444'
                        }}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="text-xs text-slate-500 font-medium">
                      {new Date(a.createdAt).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedAdvance(a)
                            setShowDetailsModal(true)
                          }}
                          className="px-2 py-1 rounded bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 text-[10px] font-bold"
                        >
                          View Details
                        </button>
                        {a.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => {
                                setConfirmingAdvance(a)
                                setConfirmingStatus('APPROVED')
                                setApprovalNotes('')
                              }}
                              className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[10px] font-bold"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setConfirmingAdvance(a)
                                setConfirmingStatus('REJECTED')
                                setApprovalNotes('')
                              }}
                              className="px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[10px] font-bold"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {a.status === 'APPROVED' && (
                          <button
                            onClick={() => {
                              setConfirmingAdvance(a)
                              setConfirmingStatus('DISBURSED')
                              setApprovalNotes('')
                            }}
                            className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-[10px] font-bold"
                          >
                            Disburse
                          </button>
                        )}
                        {a.status === 'DISBURSED' && (
                          <span className="text-[10px] text-slate-400 font-bold select-none">Disbursed (Deducts to Salary)</span>
                        )}
                        {a.status === 'FULLY_PAID' && (
                          <span className="text-[10px] text-slate-400 font-bold select-none">Fully Paid</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Excel Summary Row */}
                <tr className="excel-total-row">
                  <td colSpan={3}>Grand Total:</td>
                  <td className="font-bold text-emerald-600 dark:text-emerald-400">₱{advancesSummary.originalSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td colSpan={4} className="text-xs text-slate-400 font-medium">Total cash advances requested</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── Drivers Sheets List View ───────────────────────────── */}
        {activeTab === 'drivers' && (
          <div className="overflow-x-auto">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Driver Name</th>
                  <th>Branch</th>
                  <th>Position</th>
                  <th>Cut-Off Period</th>
                  <th>Date Filed</th>
                  <th>Validated By</th>
                  <th>Total OT</th>
                  <th style={{ width: 150 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {driverSheets.filter(s => {
                  const q = searchQuery.toLowerCase()
                  return s.driverName.toLowerCase().includes(q) ||
                         (s.branch && s.branch.toLowerCase().includes(q))
                }).map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="font-semibold">{s.driverName}</td>
                    <td>{s.branch || '—'}</td>
                    <td>{s.position || '—'}</td>
                    <td className="font-medium">{s.cutOffPeriod || '—'}</td>
                    <td>{s.dateFiled ? new Date(s.dateFiled).toLocaleDateString() : '—'}</td>
                    <td>{s.validatedBy || '—'}</td>
                    <td className="font-bold">{s.totalApprovedOt || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleViewSheetDetails(s.id)}
                          className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[10px] font-bold flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> View/Edit
                        </button>
                        <button
                          onClick={() => handleDeleteDriverSheet(s.id)}
                          className="px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[10px] font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {driverSheets.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-slate-400 font-semibold">
                      No driver sheets found. Click "Import Scan" to scan a driver monitoring sheet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals: Apply Leave ──────────────────────────────────── */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLeaveModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">Apply for Leave</h3>
            <form onSubmit={handleLeaveRequest} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={e => setLeaveType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  <option value="VACATION">Vacation Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="EMERGENCY">Emergency Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1.5 block">Start Date</label>
                  <input
                    type="date"
                    required
                    value={leaveStart}
                    onChange={e => setLeaveStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block">End Date</label>
                  <input
                    type="date"
                    required
                    value={leaveEnd}
                    onChange={e => setLeaveEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">Reason</label>
                <textarea
                  required
                  rows={3}
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  placeholder="State the reason for leave request…"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ backgroundColor: excelGreen }}
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Request Cash Advance ─────────────────────────── */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAdvanceModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6 shadow-2xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b" style={{ borderColor: border }}>
              <h3 className="text-base font-black flex items-center gap-2" style={{ color: textPrimary }}>
                <CreditCard className="w-5 h-5 text-emerald-500" />
                Request Cash Advance
              </h3>
              <button 
                onClick={() => setShowAdvanceModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ color: textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleAdvanceRequest} className="space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block text-slate-400">Employee Name</label>
                <input
                  type="text"
                  required
                  placeholder="Type employee name…"
                  value={employeeNameInput}
                  onChange={e => {
                    setEmployeeNameInput(e.target.value)
                    const found = employeeSuggestions.find(
                      u => u.name.toLowerCase() === e.target.value.toLowerCase()
                    )
                    if (found) {
                      setSelectedEmployeeId(found.id)
                    } else {
                      setSelectedEmployeeId('')
                    }
                  }}
                  list="employee-suggestions"
                  className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none transition-all duration-200 border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
                <datalist id="employee-suggestions">
                  {employeeSuggestions.map(u => (
                    <option key={u.id} value={u.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block text-slate-400">Branch</label>
                <div
                  className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold select-none opacity-80 cursor-not-allowed border"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
                >
                  {selectedEmployeeId 
                    ? getUserBranchName(selectedEmployeeId)
                    : (activeBranchFilter && activeBranchFilter !== 'ALL_BRANCHES' 
                        ? getBranchDisplayName(activeBranchFilter) 
                        : getUserBranchName(user?.id || ''))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: textPrimary }}>Requested Amount (PHP)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₱</span>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={advanceAmount}
                    onChange={e => setAdvanceAmount(e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none transition-all duration-200 border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: textPrimary }}>Purpose / Reason</label>
                <textarea
                  required
                  rows={3}
                  value={advancePurpose}
                  onChange={e => setAdvancePurpose(e.target.value)}
                  placeholder="State the reason or purpose of this cash advance request…"
                  className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none transition-all duration-200 border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t mt-4" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:bg-slate-200 dark:hover:bg-slate-700"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textPrimary }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 hover:brightness-110 active:scale-[0.98]"
                  style={{ backgroundColor: excelGreen }}
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals: Confirm Cash Advance Status Change ───────────── */}
      {confirmingAdvance && confirmingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setConfirmingAdvance(null); setConfirmingStatus(null); }} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6 shadow-2xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b" style={{ borderColor: border }}>
              <h3 className="text-base font-black flex items-center gap-2" style={{ color: textPrimary }}>
                <AlertCircle className={`w-5 h-5 ${confirmingStatus === 'APPROVED' ? 'text-blue-500' : confirmingStatus === 'REJECTED' ? 'text-rose-500' : 'text-emerald-500'}`} />
                {confirmingStatus === 'APPROVED' ? 'Approve Request' : confirmingStatus === 'REJECTED' ? 'Reject Request' : 'Confirm Disbursement'}
              </h3>
              <button 
                onClick={() => { setConfirmingAdvance(null); setConfirmingStatus(null); }}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ color: textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-xs text-slate-400 font-semibold space-y-1">
                <p>Employee: <span className="font-bold" style={{ color: textPrimary }}>{getUserName(confirmingAdvance.employeeId)}</span></p>
                <p>Amount: <span className="font-bold" style={{ color: textPrimary }}>₱{confirmingAdvance.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></p>
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: textPrimary }}>Comments / Notes (Optional)</label>
                <textarea
                  rows={3}
                  value={approvalNotes}
                  onChange={e => setApprovalNotes(e.target.value)}
                  placeholder={`Add a note for this ${confirmingStatus.toLowerCase()} action...`}
                  className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none transition-all duration-200 border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t mt-4" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={() => { setConfirmingAdvance(null); setConfirmingStatus(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:bg-slate-200 dark:hover:bg-slate-700"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textPrimary }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleAdvanceApproval(confirmingAdvance.id, confirmingStatus, approvalNotes)
                    setConfirmingAdvance(null)
                    setConfirmingStatus(null)
                    setApprovalNotes('')
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md hover:brightness-110 active:scale-[0.98]"
                  style={{
                    backgroundColor: confirmingStatus === 'APPROVED' ? '#3B82F6' : confirmingStatus === 'REJECTED' ? '#EF4444' : '#10B981'
                  }}
                >
                  Confirm {confirmingStatus === 'APPROVED' ? 'Approval' : confirmingStatus === 'REJECTED' ? 'Rejection' : 'Disbursement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals: View Cash Advance Details ────────────────────── */}
      {showDetailsModal && selectedAdvance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowDetailsModal(false); setSelectedAdvance(null); }} />
          <div className="relative w-full max-w-lg rounded-2xl overflow-hidden p-6 shadow-2xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b" style={{ borderColor: border }}>
              <h3 className="text-base font-black flex items-center gap-2" style={{ color: textPrimary }}>
                <Eye className="w-5 h-5 text-indigo-500" />
                Cash Advance Details
              </h3>
              <button 
                onClick={() => { setShowDetailsModal(false); setSelectedAdvance(null); }}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ color: textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* General Grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/10 p-4 rounded-xl border" style={{ borderColor: border }}>
                <div className="col-span-2 md:col-span-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Request ID</span>
                  <span className="text-xs font-mono font-bold select-all break-all" style={{ color: textPrimary }}>{selectedAdvance.id}</span>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase inline-block mt-0.5"
                    style={{
                      backgroundColor: selectedAdvance.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : selectedAdvance.status === 'APPROVED' ? 'rgba(59,130,246,0.1)' : selectedAdvance.status === 'DISBURSED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: selectedAdvance.status === 'PENDING' ? '#F59E0B' : selectedAdvance.status === 'APPROVED' ? '#3B82F6' : selectedAdvance.status === 'DISBURSED' ? '#10B981' : '#EF4444'
                    }}
                  >
                    {selectedAdvance.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Employee Name</span>
                  <span className="text-xs font-semibold" style={{ color: textPrimary }}>{getUserName(selectedAdvance.employeeId)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branch</span>
                  <span className="text-xs font-semibold text-slate-500">{getBranchDisplayName(selectedAdvance.branchId || null)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Requested Amount</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">₱{selectedAdvance.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Submitted At</span>
                  <span className="text-xs font-medium" style={{ color: textPrimary }}>
                    {new Date(selectedAdvance.createdAt).toLocaleString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>
                </div>
              </div>

              {/* Purpose */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Purpose / Reason</span>
                <div className="text-xs p-3 rounded-xl border font-medium leading-relaxed max-h-[100px] overflow-y-auto whitespace-pre-wrap" style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}>
                  {selectedAdvance.purpose || 'No purpose stated.'}
                </div>
              </div>

              {/* Reviewer / Approval Info */}
              <div className="border-t pt-3 space-y-2" style={{ borderColor: border }}>
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Approval & Audit Trail</h4>
                
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">Reviewed By</span>
                    <span className="font-semibold" style={{ color: textPrimary }}>
                      {selectedAdvance.approvedBy ? getUserName(selectedAdvance.approvedBy) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">Action Timestamp</span>
                    <span className="font-medium" style={{ color: textPrimary }}>
                      {selectedAdvance.approvedAt ? new Date(selectedAdvance.approvedAt).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      }) : '—'}
                    </span>
                  </div>
                  {selectedAdvance.disbursedAt && (
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 block">Disbursed At</span>
                      <span className="font-medium" style={{ color: textPrimary }}>
                        {new Date(selectedAdvance.disbursedAt).toLocaleString('en-US', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Reviewer Comments */}
                <div className="mt-2">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">Reviewer Comments / Notes</span>
                  <div className="text-xs p-3 rounded-xl border font-medium italic" style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}>
                    {selectedAdvance.notes || 'No reviewer comments left.'}
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div className="flex justify-end pt-2 border-t mt-4" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={() => { setShowDetailsModal(false); setSelectedAdvance(null); }}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md hover:brightness-110 active:scale-[0.98]"
                  style={{ backgroundColor: excelGreen }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals: Driver Route Sheet Preview/Edit ─────────────── */}
      {showDriverSheetModal && editingSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowDriverSheetModal(false); setEditingSheet(null); }} />
          <div className="relative w-full max-w-6xl rounded-2xl overflow-hidden p-6 shadow-2xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <h3 className="text-lg font-black mb-4">Drivers Daily Route Monitoring & Overtime Form</h3>
            <form onSubmit={handleSaveDriverSheet} className="space-y-4">
              
              {/* Header Inputs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/10 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Driver Name</label>
                  <input
                    type="text"
                    required
                    value={editingSheet.driverName || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, driverName: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Branch</label>
                  <input
                    type="text"
                    value={editingSheet.branch || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, branch: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Position</label>
                  <input
                    type="text"
                    value={editingSheet.position || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, position: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Filed By</label>
                  <input
                    type="text"
                    value={editingSheet.filedBy || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, filedBy: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Date Filed</label>
                  <input
                    type="date"
                    value={editingSheet.dateFiled || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, dateFiled: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Cut-Off Period</label>
                  <input
                    type="text"
                    placeholder="E.g., June 2-8, 2026"
                    value={editingSheet.cutOffPeriod || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, cutOffPeriod: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Validated By</label>
                  <input
                    type="text"
                    value={editingSheet.validatedBy || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, validatedBy: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
              </div>

              {/* Rows spreadsheet view */}
              <div className="overflow-x-auto border rounded-xl max-h-[350px]" style={{ borderColor: border }}>
                <table className="excel-table" style={{ minWidth: 1800 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Date</th>
                      <th style={{ width: 100 }}>Schedule</th>
                      <th style={{ width: 85 }}>Bio In</th>
                      <th style={{ width: 85 }}>Bio Out</th>
                      <th style={{ width: 100 }}>Garage Dep</th>
                      <th style={{ width: 100 }}>Garage Arr</th>
                      <th colSpan={4} className="text-center bg-[#10B981]/10 text-emerald-500 font-bold border-r">1ST SITE VISIT</th>
                      <th colSpan={4} className="text-center bg-blue-500/10 text-blue-500 font-bold border-r">2ND SITE VISIT</th>
                      <th colSpan={4} className="text-center bg-purple-500/10 text-purple-500 font-bold border-r">3RD SITE VISIT</th>
                      <th colSpan={4} className="text-center bg-amber-500/10 text-amber-500 font-bold border-r">4TH SITE VISIT</th>
                      <th colSpan={4} className="text-center bg-rose-500/10 text-rose-500 font-bold border-r">5TH SITE VISIT</th>
                    </tr>
                    <tr>
                      <th colSpan={6} className="border-r"></th>
                      {/* 1st Site */}
                      <th>CX Name</th><th>Arrival</th><th>Departure</th><th className="border-r">Idle</th>
                      {/* 2nd Site */}
                      <th>CX Name</th><th>Arrival</th><th>Departure</th><th className="border-r">Idle</th>
                      {/* 3rd Site */}
                      <th>CX Name</th><th>Arrival</th><th>Departure</th><th className="border-r">Idle</th>
                      {/* 4th Site */}
                      <th>CX Name</th><th>Arrival</th><th>Departure</th><th className="border-r">Idle</th>
                      {/* 5th Site */}
                      <th>CX Name</th><th>Arrival</th><th>Departure</th><th className="border-r">Idle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editingSheet.rows || []).map((row: any, rIdx: number) => (
                      <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td>
                          <input
                            type="text"
                            value={row.logDate || ''}
                            onChange={e => {
                              const newRows = [...editingSheet.rows]
                              newRows[rIdx].logDate = e.target.value
                              setEditingSheet({ ...editingSheet, rows: newRows })
                            }}
                            className="w-full bg-transparent border-0 text-xs font-semibold focus:ring-1 focus:ring-[#10B981]"
                            style={{ color: textPrimary }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.postedSchedule || ''}
                            onChange={e => {
                              const newRows = [...editingSheet.rows]
                              newRows[rIdx].postedSchedule = e.target.value
                              setEditingSheet({ ...editingSheet, rows: newRows })
                            }}
                            className="w-full bg-transparent border-0 text-xs font-mono focus:ring-1 focus:ring-[#10B981]"
                            style={{ color: textPrimary }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.bioTimeIn || ''}
                            onChange={e => {
                              const newRows = [...editingSheet.rows]
                              newRows[rIdx].bioTimeIn = e.target.value
                              setEditingSheet({ ...editingSheet, rows: newRows })
                            }}
                            className="w-full bg-transparent border-0 text-xs font-mono focus:ring-1 focus:ring-[#10B981]"
                            style={{ color: textPrimary }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.bioTimeOut || ''}
                            onChange={e => {
                              const newRows = [...editingSheet.rows]
                              newRows[rIdx].bioTimeOut = e.target.value
                              setEditingSheet({ ...editingSheet, rows: newRows })
                            }}
                            className="w-full bg-transparent border-0 text-xs font-mono focus:ring-1 focus:ring-[#10B981]"
                            style={{ color: textPrimary }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.departureTime || ''}
                            onChange={e => {
                              const newRows = [...editingSheet.rows]
                              newRows[rIdx].departureTime = e.target.value
                              setEditingSheet({ ...editingSheet, rows: newRows })
                            }}
                            className="w-full bg-transparent border-0 text-xs font-mono focus:ring-1 focus:ring-[#10B981]"
                            style={{ color: textPrimary }}
                          />
                        </td>
                        <td className="border-r">
                          <input
                            type="text"
                            value={row.arrivalTime || ''}
                            onChange={e => {
                              const newRows = [...editingSheet.rows]
                              newRows[rIdx].arrivalTime = e.target.value
                              setEditingSheet({ ...editingSheet, rows: newRows })
                            }}
                            className="w-full bg-transparent border-0 text-xs font-mono focus:ring-1 focus:ring-[#10B981]"
                            style={{ color: textPrimary }}
                          />
                        </td>
                        
                        {/* 5 Sites loops */}
                        {Array.from({ length: 5 }).map((_, sIdx) => {
                          const site = row.sites?.[sIdx] || { cxName: '', arrival: '', departure: '', idleTime: '' }
                          return (
                            <Fragment key={sIdx}>
                              <td>
                                <input
                                  type="text"
                                  value={site.cxName || ''}
                                  onChange={e => {
                                    const newRows = [...editingSheet.rows]
                                    if (!newRows[rIdx].sites) newRows[rIdx].sites = []
                                    while (newRows[rIdx].sites.length <= sIdx) {
                                      newRows[rIdx].sites.push({ cxName: '', arrival: '', departure: '', idleTime: '' })
                                    }
                                    newRows[rIdx].sites[sIdx].cxName = e.target.value
                                    setEditingSheet({ ...editingSheet, rows: newRows })
                                  }}
                                  className="w-full bg-transparent border-0 text-xs focus:ring-1 focus:ring-[#10B981]"
                                  style={{ color: textPrimary }}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={site.arrival || ''}
                                  onChange={e => {
                                    const newRows = [...editingSheet.rows]
                                    if (!newRows[rIdx].sites) newRows[rIdx].sites = []
                                    while (newRows[rIdx].sites.length <= sIdx) {
                                      newRows[rIdx].sites.push({ cxName: '', arrival: '', departure: '', idleTime: '' })
                                    }
                                    newRows[rIdx].sites[sIdx].arrival = e.target.value
                                    setEditingSheet({ ...editingSheet, rows: newRows })
                                  }}
                                  className="w-full bg-transparent border-0 text-xs font-mono focus:ring-1 focus:ring-[#10B981]"
                                  style={{ color: textPrimary }}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={site.departure || ''}
                                  onChange={e => {
                                    const newRows = [...editingSheet.rows]
                                    if (!newRows[rIdx].sites) newRows[rIdx].sites = []
                                    while (newRows[rIdx].sites.length <= sIdx) {
                                      newRows[rIdx].sites.push({ cxName: '', arrival: '', departure: '', idleTime: '' })
                                    }
                                    newRows[rIdx].sites[sIdx].departure = e.target.value
                                    setEditingSheet({ ...editingSheet, rows: newRows })
                                  }}
                                  className="w-full bg-transparent border-0 text-xs font-mono focus:ring-1 focus:ring-[#10B981]"
                                  style={{ color: textPrimary }}
                                />
                              </td>
                              <td className="border-r">
                                <input
                                  type="text"
                                  value={site.idleTime || ''}
                                  onChange={e => {
                                    const newRows = [...editingSheet.rows]
                                    if (!newRows[rIdx].sites) newRows[rIdx].sites = []
                                    while (newRows[rIdx].sites.length <= sIdx) {
                                      newRows[rIdx].sites.push({ cxName: '', arrival: '', departure: '', idleTime: '' })
                                    }
                                    newRows[rIdx].sites[sIdx].idleTime = e.target.value
                                    setEditingSheet({ ...editingSheet, rows: newRows })
                                  }}
                                  className="w-full bg-transparent border-0 text-xs font-mono focus:ring-1 focus:ring-[#10B981]"
                                  style={{ color: textPrimary }}
                                />
                              </td>
                            </Fragment>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/10 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Total Approved OT</label>
                  <input
                    type="text"
                    value={editingSheet.totalApprovedOt || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, totalApprovedOt: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Remarks of OIC/BC</label>
                  <input
                    type="text"
                    value={editingSheet.remarksOic || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, remarksOic: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Idle Time Remarks</label>
                  <input
                    type="text"
                    value={editingSheet.idleTimeRemarks || ''}
                    onChange={e => setEditingSheet({ ...editingSheet, idleTimeRemarks: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                    style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={() => { setShowDriverSheetModal(false); setEditingSheet(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#10B981]"
                >
                  Save Route Sheet
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  )
}
