import { useState, useEffect, useCallback, useMemo } from 'react'
import { NumericFormat } from 'react-number-format'
import {
  FileText, CreditCard, Clock, Plus, Search, Filter, Loader2,
  Check, X, AlertCircle, Trash2, Eye, Pencil, MousePointerClick, ChevronLeft,
  CircleCheck, CircleX, Hourglass, TrendingUp,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, isPortalAdmin, findBranchListEntry, type BranchListEntry } from '../utils/api'
import { AshcolFormHeader } from '../components/operations/AshcolFormHeader'
import { FormField, formInputStyle } from '../components/operations/FormField'
import { fetchCachedEmployees } from '../utils/portalDirectoryCache'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'

type TabId = 'cash-advance' | 'budget' | 'overtime'
type ModalMode = 'add' | 'edit' | 'view'

interface LineItem { particulars: string; amount: number }
interface OtEntry {
  dateRequested: string
  timeIn: string
  reason: string
  otFrom: string
  otTo: string
  approvedBy: string
}

interface CashAdvance {
  id: string
  employeeId: string
  amount: number
  purpose: string
  status: string
  createdAt: string
  branchId?: string
  repaymentTermMonths?: number
  notes?: string
  rejectionReason?: string
}

interface BudgetRequest {
  id: string
  employeeId: string
  requestDate: string
  fromBranch?: string
  fromDept?: string
  poNumber?: string
  paymentMethod?: 'CASH' | 'CHECK' | 'PDC'
  payeeName?: string
  bankName?: string
  accountNo?: string
  dueDate?: string
  totalAmount: number
  status: string
  createdAt: string
  lineItemsJson?: string
  rejectionReason?: string
}

interface OvertimeRequest {
  id: string
  employeeId: string
  employeeName?: string
  position?: string
  department?: string
  cutoffPeriod?: string
  status: string
  createdAt: string
  entriesJson?: string
  rejectionReason?: string
}

interface UnifiedRow {
  id: string
  type: TabId
  createdAt: string
  employeeId: string
  status: string
  rejectionReason?: string
  notesText?: string
  amount: number | null
  detail: string
  branchLabel: string
  requesterName: string
  raw: CashAdvance | BudgetRequest | OvertimeRequest
}

const TABS: { id: TabId; label: string; icon: typeof FileText; color: string }[] = [
  { id: 'cash-advance', label: 'Cash Advance', icon: CreditCard, color: '#6366f1' },
  { id: 'budget', label: 'Request for Budget', icon: FileText, color: '#2563eb' },
  { id: 'overtime', label: 'Overtime Authorization', icon: Clock, color: '#d97706' },
]

const inputCls = 'w-full px-3 py-2 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40 disabled:opacity-70 disabled:cursor-not-allowed'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatPeso(n: number) {
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MONTHS_CAPS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function formatDateCaps(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${MONTHS_CAPS[d.getMonth()]}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`
}

const cellCls = 'px-4 py-3 text-xs font-bold uppercase tracking-wide'

function getBranchLabel(id: string | null | undefined): string {
  if (!id) return ''
  return id.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').replace(/-/g, ' ').toUpperCase()
}

function emptyOtRows(count = 5): OtEntry[] {
  return Array.from({ length: count }, () => ({
    dateRequested: '', timeIn: '', reason: '', otFrom: '', otTo: '', approvedBy: '',
  }))
}

function safeParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json)
    return (Array.isArray(parsed) && parsed.length > 0 ? (parsed as unknown as T) : fallback)
  } catch {
    return fallback
  }
}

export default function OperationsForms() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const pageBg = isLight ? '#f8fafc' : '#060B18'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#ffffff' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const paperBg = isLight ? '#ffffff' : '#0D1528'
  const accent = '#10B981'
  const istyle = formInputStyle(inputBg, inputBorder, textPrimary)

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role) || role === 'manager'

  const [modal, setModal] = useState<{ mode: ModalMode; type: TabId; record: CashAdvance | BudgetRequest | OvertimeRequest | null } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: UnifiedRow } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | TabId>('ALL')

  const [cashAdvances, setCashAdvances] = useState<CashAdvance[]>([])
  const [budgetRequests, setBudgetRequests] = useState<BudgetRequest[]>([])
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([])
  const [userDirectory, setUserDirectory] = useState<Record<string, { name: string; branchId: string }>>({})
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)

  // Cash advance form
  const [caAmount, setCaAmount] = useState('')
  const [caPurpose, setCaPurpose] = useState('')
  const [caBranchId, setCaBranchId] = useState(user?.branchId || '')
  const [branches, setBranches] = useState<BranchListEntry[]>([])

  // Budget form
  const [budgetDate, setBudgetDate] = useState(todayKey())
  const [budgetBranch, setBudgetBranch] = useState(getBranchLabel(user?.branchId))
  const [budgetDept, setBudgetDept] = useState('')
  const [budgetPo, setBudgetPo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CHECK' | 'PDC'>('CHECK')
  const [payeeName, setPayeeName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNo, setAccountNo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { particulars: '', amount: 0 },
    { particulars: '', amount: 0 },
    { particulars: '', amount: 0 },
  ])

  // Overtime form
  const [otName, setOtName] = useState(user?.name || '')
  const [otPosition, setOtPosition] = useState('')
  const [otDepartment, setOtDepartment] = useState('')
  const [otCutoff, setOtCutoff] = useState('')
  const [otEntries, setOtEntries] = useState<OtEntry[]>(emptyOtRows())

  const getToken = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const budgetTotal = useMemo(
    () => lineItems.reduce((sum, li) => sum + (li.amount || 0), 0),
    [lineItems]
  )

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const headers = { Authorization: `Bearer ${getToken()}` }
    const suffix = isAdmin ? '' : '/my'

    try {
      const [caRes, budRes, otRes] = await Promise.all([
        fetch(`${API_BASE_URL}/hris/cash-advances${suffix}`, { headers }),
        fetch(`${API_BASE_URL}/operations/budget-requests${suffix}`, { headers }),
        fetch(`${API_BASE_URL}/operations/overtime-requests${suffix}`, { headers }),
      ])
      let anyFailed = false
      if (caRes.ok) setCashAdvances(await caRes.json()); else anyFailed = true
      if (budRes.ok) setBudgetRequests(await budRes.json()); else anyFailed = true
      if (otRes.ok) setOvertimeRequests(await otRes.json()); else anyFailed = true
      if (anyFailed) setError('Some requests could not be loaded.')
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }, [getToken, isAdmin])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!isAdmin) return
    fetchCachedEmployees(getToken()).then(list => {
      const map: Record<string, { name: string; branchId: string }> = {}
      list.forEach(u => {
        const id = u.id as string
        if (!id) return
        map[id] = { name: (u.name as string) || '', branchId: (u.branchId as string) || '' }
      })
      setUserDirectory(map)
    }).catch(() => { /* directory is a display enhancement, ignore failures */ })
  }, [isAdmin, getToken])

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${getToken()}` } })
        if (!res.ok) return
        const data = await res.json()
        setBranches(data?.data || [])
      } catch {
        // branch list is best-effort for the picker
      }
    })()
  }, [getToken])

  const getRequesterName = useCallback((employeeId: string) =>
    employeeId === user?.id ? (user?.name || '—') : (userDirectory[employeeId]?.name || employeeId || '—'),
    [user?.id, user?.name, userDirectory])

  const getRequesterBranch = useCallback((employeeId: string, fallbackBranchId?: string) => {
    const branchId = employeeId === user?.id ? user?.branchId : (userDirectory[employeeId]?.branchId || fallbackBranchId)
    return getBranchLabel(branchId) || '—'
  }, [user?.id, user?.branchId, userDirectory])

  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const ca = cashAdvances.map((a): UnifiedRow => ({
      id: a.id,
      type: 'cash-advance',
      createdAt: a.createdAt,
      employeeId: a.employeeId,
      status: a.status,
      rejectionReason: a.rejectionReason,
      notesText: a.notes,
      amount: a.amount,
      detail: a.purpose || '—',
      branchLabel: getRequesterBranch(a.employeeId, a.branchId),
      requesterName: getRequesterName(a.employeeId),
      raw: a,
    }))
    const bud = budgetRequests.map((b): UnifiedRow => ({
      id: b.id,
      type: 'budget',
      createdAt: b.createdAt,
      employeeId: b.employeeId,
      status: b.status,
      rejectionReason: b.rejectionReason,
      amount: Number(b.totalAmount),
      detail: b.payeeName ? `Payee: ${b.payeeName}` : (b.poNumber ? `PO ${b.poNumber}` : '—'),
      branchLabel: b.fromBranch || getRequesterBranch(b.employeeId),
      requesterName: getRequesterName(b.employeeId),
      raw: b,
    }))
    const ot = overtimeRequests.map((o): UnifiedRow => ({
      id: o.id,
      type: 'overtime',
      createdAt: o.createdAt,
      employeeId: o.employeeId,
      status: o.status,
      rejectionReason: o.rejectionReason,
      amount: null,
      detail: o.cutoffPeriod ? `Cut-off: ${o.cutoffPeriod}` : '—',
      branchLabel: getRequesterBranch(o.employeeId),
      requesterName: o.employeeName || getRequesterName(o.employeeId),
      raw: o,
    }))
    return [...ca, ...bud, ...ot].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
  }, [cashAdvances, budgetRequests, overtimeRequests, getRequesterBranch, getRequesterName])

  const filteredRows = unifiedRows.filter(r =>
    (typeFilter === 'ALL' || r.type === typeFilter) &&
    (statusFilter === 'ALL' || r.status === statusFilter) &&
    (searchQuery.trim() === '' ||
      r.requesterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.detail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.branchLabel.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const statsBase = typeFilter === 'ALL' ? unifiedRows : unifiedRows.filter(r => r.type === typeFilter)
  const stats = {
    total: statsBase.length,
    pending: statsBase.filter(r => r.status === 'PENDING').length,
    approved: statsBase.filter(r => ['APPROVED', 'DISBURSED', 'NOTED', 'FULLY_PAID'].includes(r.status)).length,
    rejected: statsBase.filter(r => r.status === 'REJECTED').length,
  }

  const requestDeleteRecord = (type: TabId, id: string, label: string) => {
    const endpoints: Record<TabId, string> = {
      'cash-advance': `${API_BASE_URL}/hris/cash-advances/${id}`,
      budget: `${API_BASE_URL}/operations/budget-requests/${id}`,
      overtime: `${API_BASE_URL}/operations/overtime-requests/${id}`,
    }
    setConfirmDialog({
      title: 'Delete request?',
      message: `This will permanently delete "${label}". This cannot be undone.`,
      variant: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const res = await fetch(endpoints[type], {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getToken()}` },
          })
          if (res.ok) fetchAll()
          else setError('Failed to delete request.')
        } catch {
          setError('Failed to delete request.')
        }
      },
    })
  }

  const resetForms = () => {
    setCaAmount('')
    setCaPurpose('')
    setCaBranchId(user?.branchId || '')
    setBudgetDate(todayKey())
    setBudgetBranch(getBranchLabel(user?.branchId))
    setBudgetDept('')
    setBudgetPo('')
    setPaymentMethod('CHECK')
    setPayeeName('')
    setBankName('')
    setAccountNo('')
    setDueDate('')
    setLineItems([{ particulars: '', amount: 0 }, { particulars: '', amount: 0 }, { particulars: '', amount: 0 }])
    setOtName(user?.name || '')
    setOtPosition('')
    setOtDepartment('')
    setOtCutoff('')
    setOtEntries(emptyOtRows())
  }

  const canEditRecord = (r: { status: string; employeeId: string }) =>
    r.status === 'PENDING' && (isAdmin || r.employeeId === user?.id)

  const openNewForm = () => {
    resetForms()
    setError(null)
    setModal({ mode: 'add', type: 'cash-advance', record: null })
  }

  const switchCreateType = (type: TabId) => {
    setModal(m => {
      if (!m || m.type === type) return m
      resetForms()
      return { ...m, type }
    })
  }

  const openRecord = (mode: 'view' | 'edit', type: TabId, record: CashAdvance | BudgetRequest | OvertimeRequest) => {
    setError(null)
    if (type === 'cash-advance') {
      const r = record as CashAdvance
      setCaAmount(String(r.amount ?? ''))
      setCaPurpose(r.purpose || '')
      setCaBranchId(r.branchId || user?.branchId || '')
    } else if (type === 'budget') {
      const r = record as BudgetRequest
      setBudgetDate(r.requestDate || todayKey())
      setBudgetBranch(r.fromBranch || getBranchLabel(user?.branchId))
      setBudgetDept(r.fromDept || '')
      setBudgetPo(r.poNumber || '')
      setPaymentMethod(r.paymentMethod || 'CHECK')
      setPayeeName(r.payeeName || '')
      setBankName(r.bankName || '')
      setAccountNo(r.accountNo || '')
      setDueDate(r.dueDate || '')
      setLineItems(safeParse<LineItem[]>(r.lineItemsJson, [{ particulars: '', amount: 0 }]))
    } else {
      const r = record as OvertimeRequest
      setOtName(r.employeeName || user?.name || '')
      setOtPosition(r.position || '')
      setOtDepartment(r.department || '')
      setOtCutoff(r.cutoffPeriod || '')
      setOtEntries(safeParse<OtEntry[]>(r.entriesJson, emptyOtRows()))
    }
    setModal({ mode, type, record })
  }

  const closeModal = () => setModal(null)

  const openContextMenu = (e: React.MouseEvent, row: UnifiedRow) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, row })
  }
  const closeContextMenu = () => setContextMenu(null)

  const handleSubmitCashAdvance = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const isEdit = modal?.mode === 'edit' && modal.record
    try {
      const res = await fetch(
        isEdit ? `${API_BASE_URL}/hris/cash-advances/${modal!.record!.id}` : `${API_BASE_URL}/hris/cash-advances`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parseFloat(caAmount.replace(/,/g, '')),
            purpose: caPurpose,
            repaymentTermMonths: 1,
            branchId: caBranchId || user?.branchId,
          }),
        }
      )
      if (res.ok) {
        closeModal()
        fetchAll()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || err.message || 'Failed to submit cash advance.')
      }
    } catch {
      setError('Failed to submit cash advance.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = lineItems.filter(li => li.particulars.trim())
    if (validItems.length === 0) {
      setError('Add at least one line item with particulars.')
      return
    }
    setSaving(true)
    const isEdit = modal?.mode === 'edit' && modal.record
    try {
      const res = await fetch(
        isEdit ? `${API_BASE_URL}/operations/budget-requests/${modal!.record!.id}` : `${API_BASE_URL}/operations/budget-requests`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestDate: budgetDate,
            fromBranch: budgetBranch,
            fromDept: budgetDept,
            poNumber: budgetPo,
            paymentMethod,
            payeeName,
            bankName,
            accountNo,
            dueDate: dueDate || null,
            lineItemsJson: JSON.stringify(validItems),
            totalAmount: budgetTotal,
            branchId: user?.branchId,
          }),
        }
      )
      if (res.ok) {
        closeModal()
        fetchAll()
      } else {
        setError('Failed to submit budget request.')
      }
    } catch {
      setError('Failed to submit budget request.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault()
    const validEntries = otEntries.filter(en => en.dateRequested || en.reason)
    if (validEntries.length === 0) {
      setError('Add at least one overtime entry.')
      return
    }
    setSaving(true)
    const isEdit = modal?.mode === 'edit' && modal.record
    try {
      const res = await fetch(
        isEdit ? `${API_BASE_URL}/operations/overtime-requests/${modal!.record!.id}` : `${API_BASE_URL}/operations/overtime-requests`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeName: otName,
            position: otPosition,
            department: otDepartment,
            cutoffPeriod: otCutoff,
            entriesJson: JSON.stringify(validEntries),
            branchId: user?.branchId,
          }),
        }
      )
      if (res.ok) {
        closeModal()
        fetchAll()
      } else {
        setError('Failed to submit overtime request.')
      }
    } catch {
      setError('Failed to submit overtime request.')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusUpdate = async (type: TabId, id: string, status: string) => {
    const endpoints: Record<string, string> = {
      budget: `${API_BASE_URL}/operations/budget-requests/${id}/status`,
      overtime: `${API_BASE_URL}/operations/overtime-requests/${id}/status`,
      'cash-advance': `${API_BASE_URL}/hris/cash-advances/${id}/approve`,
    }
    const body = type === 'cash-advance' ? { status, notes: '' } : { status }
    try {
      const res = await fetch(endpoints[type], {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) fetchAll()
    } catch { /* ignore */ }
  }

  const statusColors: Record<string, string> = {
    PENDING: '#d97706', APPROVED: '#16a34a', NOTED: '#2563eb',
    REJECTED: '#dc2626', DISBURSED: '#4f46e5', FULLY_PAID: '#0d9488',
  }

  const statusText = (status: string) => (
    <span className="font-bold uppercase tracking-wide text-xs" style={{ color: statusColors[status] || statusColors.PENDING }}>
      {status.replace(/_/g, ' ')}
    </span>
  )

  const typeMeta = (type: TabId) => TABS.find(t => t.id === type)!
  const typeText = (type: TabId) => {
    const meta = typeMeta(type)
    return (
      <span className="font-bold uppercase tracking-wide text-xs whitespace-nowrap" style={{ color: meta.color }}>
        {meta.label}
      </span>
    )
  }

  const disabled = modal?.mode === 'view'

  const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: typeof FileText; color: string }) => (
    <div
      className="flex items-center gap-3 rounded-xl p-3.5 flex-1 min-w-[140px]"
      style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1A` }}>
        <Icon className="w-[18px] h-[18px]" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-black leading-tight" style={{ color: textPrimary }}>{value}</div>
        <div className="text-[10px] font-bold uppercase tracking-wide truncate" style={{ color: textMuted }}>{label}</div>
      </div>
    </div>
  )

  const MenuItem = ({ icon: Icon, label, onClick, color }: { icon: typeof FileText; label: string; onClick: () => void; color?: string }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
      style={{ color: color || textPrimary }}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-5 min-h-full w-full" style={{ backgroundColor: pageBg, color: textPrimary }}>
      {!modal && (
      <>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-1 flex items-center gap-2.5">
            <FileText className="w-7 h-7" style={{ color: accent }} />
            Request Forms
          </h2>
          <p className="text-xs" style={{ color: textMuted }}>
            Cash advance, budget, and overtime requests in one place
          </p>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md hover:opacity-90 transition-all"
          style={{ backgroundColor: accent }}
        >
          <Plus className="w-4 h-4" />
          New Request
        </button>
      </div>
      </>
      )}

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
          <span className="text-xs font-semibold flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {!modal && (
      <>
      {/* Summary stat cards */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Total requests" value={stats.total} icon={TrendingUp} color="#6366f1" />
        <StatCard label="Pending" value={stats.pending} icon={Hourglass} color="#d97706" />
        <StatCard label="Approved" value={stats.approved} icon={CircleCheck} color="#16a34a" />
        <StatCard label="Rejected" value={stats.rejected} icon={CircleX} color="#dc2626" />
      </div>

      {/* List card */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-3" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-56">
              <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={`${inputCls} pl-9`}
                style={istyle}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" style={{ color: textMuted }} />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as 'ALL' | TabId)}
                className={`${inputCls} appearance-none`}
                style={istyle}
              >
                <option value="ALL">All types</option>
                {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className={`${inputCls} appearance-none`}
                style={istyle}
              >
                <option value="ALL">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="NOTED">Noted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="DISBURSED">Disbursed</option>
              </select>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: textMuted }}>
            <MousePointerClick className="w-3.5 h-3.5" />
            Right-click a row for details &amp; actions
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2" style={{ color: textMuted }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs font-semibold">Loading…</span>
            </div>
          ) : (
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                  {['Date', 'Type', 'Requested By', 'Branch', 'Details', 'Amount', 'Status', 'Notes'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-bold" style={{ borderBottom: `1px solid ${border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12" style={{ color: textMuted }}>No requests found.</td></tr>
                ) : filteredRows.map(r => (
                  <tr
                    key={`${r.type}-${r.id}`}
                    onContextMenu={e => openContextMenu(e, r)}
                    className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                    style={{
                      borderBottom: `1px solid ${border}`,
                      borderLeft: `3px solid ${statusColors[r.status] || statusColors.PENDING}`,
                      cursor: 'context-menu',
                    }}
                  >
                    <td className={`${cellCls} whitespace-nowrap`} style={{ color: textPrimary }}>{formatDateCaps(r.createdAt)}</td>
                    <td className={cellCls}>{typeText(r.type)}</td>
                    <td className={`${cellCls} whitespace-nowrap`} style={{ color: textPrimary }}>{r.requesterName}</td>
                    <td className={`${cellCls} whitespace-nowrap`} style={{ color: textPrimary }}>{r.branchLabel}</td>
                    <td className={`${cellCls} max-w-xs truncate`} style={{ color: textPrimary }} title={r.detail}>{r.detail}</td>
                    <td className={`${cellCls} whitespace-nowrap`} style={{ color: textPrimary }}>{r.amount != null ? formatPeso(r.amount) : '—'}</td>
                    <td className={cellCls}>{statusText(r.status)}</td>
                    <td className={`${cellCls} max-w-[160px] truncate`} style={{ color: textMuted }} title={r.status === 'REJECTED' ? r.rejectionReason : r.notesText}>
                      {r.status === 'REJECTED' ? (r.rejectionReason || '—') : (r.notesText || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[15900]" onClick={closeContextMenu} onContextMenu={e => { e.preventDefault(); closeContextMenu() }} />
          <div
            className="fixed z-[15950] min-w-[180px] rounded-xl shadow-2xl overflow-hidden py-1.5"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 280),
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
            }}
          >
            <MenuItem icon={Eye} label="View" onClick={() => { openRecord('view', contextMenu.row.type, contextMenu.row.raw); closeContextMenu() }} />
            {canEditRecord(contextMenu.row) && (
              <MenuItem icon={Pencil} label="Edit" onClick={() => { openRecord('edit', contextMenu.row.type, contextMenu.row.raw); closeContextMenu() }} />
            )}
            {isAdmin && contextMenu.row.status === 'PENDING' && (
              <>
                <div style={{ borderTop: `1px solid ${border}` }} className="my-1" />
                {contextMenu.row.type === 'budget' && (
                  <MenuItem icon={FileText} label="Mark as Noted" color="#2563eb" onClick={() => { handleStatusUpdate('budget', contextMenu.row.id, 'NOTED'); closeContextMenu() }} />
                )}
                <MenuItem icon={Check} label="Approve" color="#16a34a" onClick={() => { handleStatusUpdate(contextMenu.row.type, contextMenu.row.id, 'APPROVED'); closeContextMenu() }} />
                <MenuItem icon={X} label="Reject" color="#dc2626" onClick={() => { handleStatusUpdate(contextMenu.row.type, contextMenu.row.id, 'REJECTED'); closeContextMenu() }} />
              </>
            )}
            {isAdmin && contextMenu.row.status === 'NOTED' && contextMenu.row.type === 'budget' && (
              <MenuItem icon={Check} label="Approve" color="#16a34a" onClick={() => { handleStatusUpdate('budget', contextMenu.row.id, 'APPROVED'); closeContextMenu() }} />
            )}
            {isAdmin && (
              <>
                <div style={{ borderTop: `1px solid ${border}` }} className="my-1" />
                <MenuItem icon={Trash2} label="Delete" color="#dc2626" onClick={() => { closeContextMenu(); requestDeleteRecord(contextMenu.row.type, contextMenu.row.id, contextMenu.row.detail) }} />
              </>
            )}
          </div>
        </>
      )}

      {/* Add / Edit / View — full page */}
      {modal && (
        <div
          className="rounded-2xl overflow-hidden shadow-xl"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        >
          <div className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ borderBottom: `1px solid ${border}` }}>
            <button
              onClick={closeModal}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: textMuted }}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back to list
            </button>
            <div className="h-3.5 w-px" style={{ backgroundColor: border }} />
            <h2 className="text-xs font-bold flex items-center gap-1.5" style={{ color: textPrimary }}>
              {modal.mode === 'add' && <><Plus className="w-3.5 h-3.5" style={{ color: accent }} /> New Request</>}
              {modal.mode === 'edit' && <><Pencil className="w-3.5 h-3.5" style={{ color: accent }} /> Edit {typeMeta(modal.type).label}</>}
              {modal.mode === 'view' && <><Eye className="w-3.5 h-3.5" style={{ color: accent }} /> View {typeMeta(modal.type).label}</>}
            </h2>

            {/* Type selector — create mode only */}
            {modal.mode === 'add' && (
              <div className="inline-flex gap-1 p-1 rounded-lg ml-auto" style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E', border: `1px solid ${border}` }}>
                {TABS.map(t => {
                  const active = modal.type === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => switchCreateType(t.id)}
                      className="rounded-md px-3 py-1.5 text-[11px] font-bold transition-all"
                      style={{
                        backgroundColor: active ? cardBg : 'transparent',
                        color: active ? t.color : textMuted,
                        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="p-6 md:p-10">
              {/* Status info banner for edit/view */}
              {modal.record && (
                <div className="flex flex-wrap items-center gap-3 mb-6 p-3.5 rounded-xl"
                  style={{ backgroundColor: isLight ? '#f8fafc' : '#0B132B', border: `1px solid ${border}` }}>
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Status</span>
                  {statusText(modal.record.status)}
                  {modal.record.status === 'REJECTED' && (modal.record as any).rejectionReason && (
                    <span className="text-xs" style={{ color: textMuted }}>
                      — Reason: <span className="font-semibold" style={{ color: textPrimary }}>{(modal.record as any).rejectionReason}</span>
                    </span>
                  )}
                  {modal.record.status !== 'PENDING' && (
                    <span className="text-[10px] ml-auto" style={{ color: textMuted }}>This request can no longer be edited.</span>
                  )}
                </div>
              )}

              <div
                className="max-w-6xl mx-auto rounded-xl shadow-lg p-8 md:p-12"
                style={{ backgroundColor: paperBg, border: `1px solid ${isLight ? '#d1d5db' : border}` }}
              >
                {/* ── Cash Advance Form ── */}
                {modal.type === 'cash-advance' && (
                  <form onSubmit={handleSubmitCashAdvance}>
                    <AshcolFormHeader
                      title="Cash Advance Request Form"
                      subtitle="For employee salary advance requests"
                      isLight={isLight}
                      textPrimary={textPrimary}
                      textMuted={textMuted}
                      border={border}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <FormField label="Member Name">
                        <input className={`${inputCls} uppercase`} style={istyle} value={(user?.name || '').toUpperCase()} readOnly />
                      </FormField>
                      <FormField label="Branch" required>
                        <select className={inputCls} style={istyle} value={caBranchId} onChange={e => setCaBranchId(e.target.value)} disabled={disabled} required>
                          <option value="">Select branch…</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                          {caBranchId && !findBranchListEntry(caBranchId, branches) && (
                            <option value={caBranchId}>{getBranchLabel(caBranchId)}</option>
                          )}
                        </select>
                      </FormField>
                      <FormField label="Date" required>
                        <input className={inputCls} style={istyle} type="text" value={formatDateCaps(modal.record ? modal.record.createdAt : new Date().toISOString())} readOnly />
                      </FormField>
                      <FormField label="Amount (₱)" required colSpan={2}>
                        <NumericFormat
                          className={inputCls}
                          style={istyle}
                          thousandSeparator=","
                          decimalScale={2}
                          fixedDecimalScale
                          allowNegative={false}
                          placeholder="0.00"
                          value={caAmount}
                          onValueChange={v => setCaAmount(v.value)}
                          disabled={disabled}
                          required
                        />
                      </FormField>
                      <FormField label="Purpose / Reason" required colSpan={2}>
                        <textarea
                          className={inputCls}
                          style={istyle}
                          rows={3}
                          value={caPurpose}
                          onChange={e => setCaPurpose(e.target.value)}
                          placeholder="State the purpose for this cash advance…"
                          readOnly={disabled}
                          required
                        />
                      </FormField>
                    </div>
                    <div className="flex justify-end gap-2 mt-8">
                      <button type="button" onClick={closeModal} className="px-5 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}>
                        {disabled ? 'Close' : 'Cancel'}
                      </button>
                      {disabled && modal.record && canEditRecord(modal.record as any) && (
                        <button type="button" onClick={() => openRecord('edit', modal.type, modal.record!)} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: '#2563eb' }}>
                          <Pencil className="w-4 h-4" /> Edit
                        </button>
                      )}
                      {!disabled && (
                        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: accent }}>
                          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                          {modal.mode === 'edit' ? 'Save Changes' : 'Submit Request'}
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {/* ── Budget / Payment Request Form ── */}
                {modal.type === 'budget' && (
                  <form onSubmit={handleSubmitBudget}>
                    <AshcolFormHeader
                      title="Request for Payment Form"
                      isLight={isLight}
                      textPrimary={textPrimary}
                      textMuted={textMuted}
                      border={border}
                    />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 text-xs">
                      <FormField label="To">
                        <input className={inputCls} style={istyle} value="Finance / Accounting Dept" readOnly />
                      </FormField>
                      <FormField label="Date" required>
                        <input className={inputCls} style={istyle} type="date" value={budgetDate} onChange={e => setBudgetDate(e.target.value)} readOnly={disabled} required />
                      </FormField>
                      <FormField label="From — Branch" required>
                        <input className={inputCls} style={istyle} value={budgetBranch} onChange={e => setBudgetBranch(e.target.value)} readOnly={disabled} required />
                      </FormField>
                      <FormField label="Dept.">
                        <input className={inputCls} style={istyle} value={budgetDept} onChange={e => setBudgetDept(e.target.value)} readOnly={disabled} />
                      </FormField>
                      <FormField label="P.O. No.">
                        <input className={inputCls} style={istyle} value={budgetPo} onChange={e => setBudgetPo(e.target.value)} readOnly={disabled} />
                      </FormField>
                    </div>

                    <p className="text-xs mb-4 leading-relaxed" style={{ color: textPrimary }}>
                      Please facilitate the processing of{' '}
                      {(['CASH', 'CHECK', 'PDC'] as const).map(m => (
                        <label key={m} className="inline-flex items-center gap-1 mx-1 cursor-pointer">
                          <input type="radio" name="payMethod" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} className="accent-emerald-600" disabled={disabled} />
                          <span className="font-bold">{m}</span>
                        </label>
                      ))}
                      {' '}for{' '}
                      <input className="inline-block w-32 px-1 py-0.5 border-b text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 0, border: 'none', borderBottom: `1px solid ${inputBorder}` }} value={payeeName} onChange={e => setPayeeName(e.target.value)} placeholder="payee name" readOnly={disabled} />
                      {' '}with{' '}
                      <input className="inline-block w-28 px-1 py-0.5 border-b text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 0, border: 'none', borderBottom: `1px solid ${inputBorder}` }} value={bankName} onChange={e => setBankName(e.target.value)} placeholder="bank" readOnly={disabled} />
                      {' '}account no.{' '}
                      <input className="inline-block w-24 px-1 py-0.5 border-b text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 0, border: 'none', borderBottom: `1px solid ${inputBorder}` }} value={accountNo} onChange={e => setAccountNo(e.target.value)} placeholder="acct #" readOnly={disabled} />
                      {' '}due on{' '}
                      <input className="inline-block w-28 px-1 py-0.5 text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 4 }} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} readOnly={disabled} />
                      {' '}as payment for the ff:
                    </p>

                    <table className="w-full text-xs mb-2" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                          <th className="text-left px-3 py-2 font-bold w-12" style={{ border: `1px solid ${border}` }}>#</th>
                          <th className="text-left px-3 py-2 font-bold" style={{ border: `1px solid ${border}` }}>PARTICULARS</th>
                          <th className="text-right px-3 py-2 font-bold w-36" style={{ border: `1px solid ${border}` }}>AMOUNT</th>
                          {!disabled && <th className="w-10" style={{ border: `1px solid ${border}` }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((li, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-center font-bold" style={{ border: `1px solid ${border}` }}>{i + 1}</td>
                            <td style={{ border: `1px solid ${border}` }}>
                              <input
                                className="w-full px-2 py-1.5 text-xs focus:outline-none bg-transparent"
                                style={{ color: textPrimary }}
                                value={li.particulars}
                                onChange={e => {
                                  const next = [...lineItems]
                                  next[i] = { ...next[i], particulars: e.target.value }
                                  setLineItems(next)
                                }}
                                placeholder="Description of item…"
                                readOnly={disabled}
                              />
                            </td>
                            <td style={{ border: `1px solid ${border}` }}>
                              <NumericFormat
                                className="w-full px-2 py-1.5 text-xs text-right focus:outline-none bg-transparent"
                                style={{ color: textPrimary }}
                                thousandSeparator=","
                                decimalScale={2}
                                fixedDecimalScale
                                allowNegative={false}
                                prefix="₱ "
                                value={li.amount || ''}
                                onValueChange={v => {
                                  const next = [...lineItems]
                                  next[i] = { ...next[i], amount: parseFloat(v.value) || 0 }
                                  setLineItems(next)
                                }}
                                disabled={disabled}
                              />
                            </td>
                            {!disabled && (
                              <td className="text-center" style={{ border: `1px solid ${border}` }}>
                                {lineItems.length > 1 && (
                                  <button type="button" onClick={() => setLineItems(lineItems.filter((_, j) => j !== i))} className="p-1 text-red-500">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                        <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#0B132B' }}>
                          <td colSpan={2} className="px-3 py-2 text-right font-black uppercase text-[10px] tracking-wider" style={{ border: `1px solid ${border}` }}>Total</td>
                          <td className="px-3 py-2 text-right font-black" style={{ border: `1px solid ${border}` }}>{formatPeso(budgetTotal)}</td>
                          {!disabled && <td style={{ border: `1px solid ${border}` }} />}
                        </tr>
                      </tbody>
                    </table>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => setLineItems([...lineItems, { particulars: '', amount: 0 }])}
                        className="text-[10px] font-bold mb-6 flex items-center gap-1"
                        style={{ color: accent }}
                      >
                        <Plus className="w-3 h-3" /> Add line item
                      </button>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6" style={{ borderTop: `1px solid ${border}` }}>
                      <div className="text-center">
                        <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                        <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Requested by</div>
                        <div className="text-xs font-semibold mt-1">{user?.name}</div>
                        <div className="text-[9px] mt-0.5" style={{ color: textMuted }}>Signature Over Printed Name</div>
                      </div>
                      <div className="text-center">
                        <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                        <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Noted by</div>
                        <div className="text-[9px] mt-1" style={{ color: textMuted }}>Accounting Staff</div>
                      </div>
                      <div className="text-center">
                        <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                        <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Approved by</div>
                        <div className="text-[9px] mt-1" style={{ color: textMuted }}>VP / COO · President / CEO</div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-8">
                      <button type="button" onClick={closeModal} className="px-5 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}>
                        {disabled ? 'Close' : 'Cancel'}
                      </button>
                      {disabled && modal.record && canEditRecord(modal.record as any) && (
                        <button type="button" onClick={() => openRecord('edit', modal.type, modal.record!)} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: '#2563eb' }}>
                          <Pencil className="w-4 h-4" /> Edit
                        </button>
                      )}
                      {!disabled && (
                        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: accent }}>
                          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                          {modal.mode === 'edit' ? 'Save Changes' : 'Submit Request'}
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {/* ── Overtime Authorization Form ── */}
                {modal.type === 'overtime' && (
                  <form onSubmit={handleSubmitOvertime}>
                    <AshcolFormHeader
                      title="Over Time Authorization Form"
                      subtitle="ASHCOL-OT-FORM V02"
                      isLight={isLight}
                      textPrimary={textPrimary}
                      textMuted={textMuted}
                      border={border}
                    />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                      <FormField label="Member Name" required>
                        <input className={inputCls} style={istyle} value={otName} onChange={e => setOtName(e.target.value)} readOnly={disabled} required />
                      </FormField>
                      <FormField label="Position">
                        <input className={inputCls} style={istyle} value={otPosition} onChange={e => setOtPosition(e.target.value)} readOnly={disabled} />
                      </FormField>
                      <FormField label="Department">
                        <input className={inputCls} style={istyle} value={otDepartment} onChange={e => setOtDepartment(e.target.value)} readOnly={disabled} />
                      </FormField>
                      <FormField label="Cut Off Date" required>
                        <input className={inputCls} style={istyle} value={otCutoff} onChange={e => setOtCutoff(e.target.value)} placeholder="e.g. JUNE 1-15" readOnly={disabled} required />
                      </FormField>
                    </div>

                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-[10px]" style={{ borderCollapse: 'collapse', minWidth: 700 }}>
                        <thead>
                          <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                            <th rowSpan={2} className="px-2 py-2 font-bold w-8" style={{ border: `1px solid ${border}` }}>#</th>
                            <th colSpan={4} className="px-2 py-1 font-bold text-center" style={{ border: `1px solid ${border}` }}>TO BE FILLED UP BY THE REQUESTER</th>
                            <th colSpan={2} className="px-2 py-1 font-bold text-center" style={{ border: `1px solid ${border}` }}>APPROVER</th>
                          </tr>
                          <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                            {['Date', 'Time In', 'Reason for Extending Work Hours', 'OT From', 'OT To', 'Approved By'].map(h => (
                              <th key={h} className="px-2 py-1.5 font-bold text-left" style={{ border: `1px solid ${border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {otEntries.map((en, i) => (
                            <tr key={i}>
                              <td className="text-center font-bold px-1" style={{ border: `1px solid ${border}` }}>{i + 1}</td>
                              {(['dateRequested', 'timeIn', 'reason', 'otFrom', 'otTo', 'approvedBy'] as const).map(field => (
                                <td key={field} style={{ border: `1px solid ${border}` }}>
                                  <input
                                    className="w-full px-1.5 py-1.5 focus:outline-none bg-transparent"
                                    style={{ color: textPrimary }}
                                    type={field === 'dateRequested' ? 'date' : field.includes('ot') || field === 'timeIn' ? 'time' : 'text'}
                                    value={en[field]}
                                    onChange={e => {
                                      const next = [...otEntries]
                                      next[i] = { ...next[i], [field]: e.target.value }
                                      setOtEntries(next)
                                    }}
                                    readOnly={disabled}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => setOtEntries([...otEntries, { dateRequested: '', timeIn: '', reason: '', otFrom: '', otTo: '', approvedBy: '' }])}
                        className="text-[10px] font-bold mb-4 flex items-center gap-1"
                        style={{ color: accent }}
                      >
                        <Plus className="w-3 h-3" /> Add row
                      </button>
                    )}

                    <p className="text-[9px] leading-relaxed mb-5 p-3 rounded-lg" style={{ backgroundColor: isLight ? '#f8fafc' : '#0B132B', color: textMuted, border: `1px solid ${border}` }}>
                      The employee is under no obligation to work more than 45 hours per week. All overtime is voluntary and may only be worked by agreement between employer and employee and must have written approval first. Maximum permissible overtime is 5 hours in a day if badly needed specially during peak season. I hereby declare above over time claims are true and correct. ART. 119. False Reporting. — It shall be unlawful for any person to make any statement, report, or record filed or kept pursuant to the provisions of this Code knowing such statement, report or record to be false in any material respect. (P.D. 442, Labor Code)
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4" style={{ borderTop: `1px solid ${border}` }}>
                      <div className="text-center">
                        <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                        <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Member Name & Signature</div>
                        <div className="text-xs font-semibold mt-1">{otName}</div>
                      </div>
                      <div className="text-center">
                        <div className="h-12 mb-2" style={{ borderBottom: `1px solid ${textPrimary}` }} />
                        <div className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>HR Manager</div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-8">
                      <button type="button" onClick={closeModal} className="px-5 py-2.5 rounded-xl text-xs font-bold" style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b' }}>
                        {disabled ? 'Close' : 'Cancel'}
                      </button>
                      {disabled && modal.record && canEditRecord(modal.record as any) && (
                        <button type="button" onClick={() => openRecord('edit', modal.type, modal.record!)} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: '#2563eb' }}>
                          <Pencil className="w-4 h-4" /> Edit
                        </button>
                      )}
                      {!disabled && (
                        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2" style={{ backgroundColor: accent }}>
                          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                          {modal.mode === 'edit' ? 'Save Changes' : 'Submit Authorization'}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}
