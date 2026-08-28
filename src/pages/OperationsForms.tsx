import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NumericFormat } from 'react-number-format'
import {
  FileText, CreditCard, Clock, Plus, Search, Filter, Loader2,
  Check, X, AlertCircle, Trash2, Eye, Pencil, MousePointerClick, ChevronLeft,
  CircleCheck, CircleX, Hourglass, TrendingUp, ChevronDown, Building2,
  MessageSquare,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, isPortalAdmin, findBranchListEntry, formatBranchName, type BranchListEntry } from '../utils/api'
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
  branchId?: string
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
  notes?: string
  rejectionReason?: string
}

interface OvertimeRequest {
  id: string
  employeeId: string
  branchId?: string
  employeeName?: string
  position?: string
  department?: string
  cutoffPeriod?: string
  status: string
  createdAt: string
  entriesJson?: string
  notes?: string
  rejectionReason?: string
}

interface UnifiedRow {
  id: string
  type: TabId
  createdAt: string
  employeeId: string
  branchId?: string
  status: string
  rejectionReason?: string
  notesText?: string
  amount: number | null
  detail: string
  branchLabel: string
  requesterName: string
  raw: CashAdvance | BudgetRequest | OvertimeRequest
}

const TABS: { id: TabId; label: string; description: string; icon: typeof FileText; color: string }[] = [
  { id: 'cash-advance', label: 'Cash Advance', description: 'Employee salary advance requests', icon: CreditCard, color: '#6366f1' },
  { id: 'budget', label: 'Request for Budget', description: 'Payment & operational expenses', icon: FileText, color: '#2563eb' },
  { id: 'overtime', label: 'Overtime Authorization', description: 'OT hours & duty authorization', icon: Clock, color: '#d97706' },
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

  const [searchParams, setSearchParams] = useSearchParams()
  const targetId = searchParams.get('id')
  const targetType = searchParams.get('type') as TabId | null

  const [modal, setModal] = useState<{ mode: ModalMode; type: TabId; record: CashAdvance | BudgetRequest | OvertimeRequest | null } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: UnifiedRow } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | TabId>('ALL')
  const [branchFilter, setBranchFilter] = useState('ALL')

  const [cashAdvances, setCashAdvances] = useState<CashAdvance[]>([])
  const [budgetRequests, setBudgetRequests] = useState<BudgetRequest[]>([])
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([])
  const [userDirectory, setUserDirectory] = useState<Record<string, { name: string; branchId: string }>>({})
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [isEditingModalNotes, setIsEditingModalNotes] = useState(false)
  const [modalNotesInput, setModalNotesInput] = useState('')
  const [rejectDialog, setRejectDialog] = useState<{ isOpen: boolean; type: TabId; id: string; currentReason: string } | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Cash advance form
  const [caAmount, setCaAmount] = useState('')
  const [caPurpose, setCaPurpose] = useState('')
  const [caBranchId, setCaBranchId] = useState('')
  const [branches, setBranches] = useState<BranchListEntry[]>([])

  const userAssignedBranchId = useMemo(() => {
    if (!user?.branchId) return ''
    const raw = user.branchId.trim()
    const match = findBranchListEntry(raw, branches) || branches.find(b =>
      b.id.toLowerCase() === raw.toLowerCase() ||
      b.name.toLowerCase() === raw.toLowerCase() ||
      b.id.toUpperCase() === raw.toUpperCase()
    )
    return match ? match.id : raw
  }, [user?.branchId, branches])

  const userAssignedBranchName = useMemo(() => {
    if (!user?.branchId) return ''
    const raw = user.branchId.trim()
    const match = findBranchListEntry(raw, branches) || branches.find(b =>
      b.id.toLowerCase() === raw.toLowerCase() ||
      b.name.toLowerCase() === raw.toLowerCase() ||
      b.id.toUpperCase() === raw.toUpperCase()
    )
    return match ? match.name.toUpperCase() : getBranchLabel(raw)
  }, [user?.branchId, branches])

  // Budget form
  const [budgetDate, setBudgetDate] = useState(todayKey())
  const [budgetBranch, setBudgetBranch] = useState('')
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
        const branchList: BranchListEntry[] = data?.data || []
        setBranches(branchList)
        if (user?.branchId) {
          const raw = user.branchId.trim()
          const match = findBranchListEntry(raw, branchList) || branchList.find(b =>
            b.id.toLowerCase() === raw.toLowerCase() ||
            b.name.toLowerCase() === raw.toLowerCase() ||
            b.id.toUpperCase() === raw.toUpperCase()
          )
          const bId = match ? match.id : raw
          const bName = match ? match.name.toUpperCase() : getBranchLabel(raw)
          setCaBranchId(prev => prev || bId)
          setBudgetBranch(prev => prev || bName || bId)
          setOtDepartment(prev => prev || bName || 'OPERATIONS')
        }
      } catch {
        // branch list is best-effort for the picker
      }
    })()
  }, [getToken, user?.branchId])

  const getRequesterName = useCallback((employeeId: string) =>
    employeeId === user?.id ? (user?.name || '—') : (userDirectory[employeeId]?.name || employeeId || '—'),
    [user?.id, user?.name, userDirectory])

  const resolveBranchLabel = useCallback((explicitBranch?: string | null, recordBranchId?: string | null, employeeId?: string | null) => {
    const candidates = [
      explicitBranch,
      recordBranchId,
      employeeId ? userDirectory[employeeId]?.branchId : null,
      employeeId === user?.id ? user?.branchId : null,
    ].filter(Boolean) as string[]

    for (const cand of candidates) {
      if (!cand) continue
      const candClean = cand.trim()
      if (!candClean) continue

      const matched = findBranchListEntry(candClean, branches) || branches.find(b =>
        b.id.toLowerCase() === candClean.toLowerCase() ||
        b.name.toLowerCase() === candClean.toLowerCase()
      )
      if (matched) {
        return matched.name.toUpperCase().replace(/^ASHCOL\s+/i, '').replace(/-(SALES|SERVICES)$/i, '').trim()
      }

      const formatted = getBranchLabel(candClean)
      if (formatted && formatted !== '—' && !formatted.includes('-') && formatted.length < 30) {
        return formatted
      }
    }

    return '—'
  }, [branches, userDirectory, user?.id, user?.branchId])

  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const ca = cashAdvances.map((a): UnifiedRow => ({
      id: a.id,
      type: 'cash-advance',
      createdAt: a.createdAt,
      employeeId: a.employeeId,
      branchId: a.branchId || userDirectory[a.employeeId]?.branchId,
      status: a.status,
      rejectionReason: a.rejectionReason,
      notesText: a.notes,
      amount: a.amount,
      detail: a.purpose || '—',
      branchLabel: resolveBranchLabel(null, a.branchId, a.employeeId),
      requesterName: getRequesterName(a.employeeId),
      raw: a,
    }))
    const bud = budgetRequests.map((b): UnifiedRow => ({
      id: b.id,
      type: 'budget',
      createdAt: b.createdAt,
      employeeId: b.employeeId,
      branchId: b.branchId || userDirectory[b.employeeId]?.branchId,
      status: b.status,
      rejectionReason: b.rejectionReason,
      notesText: b.notes,
      amount: Number(b.totalAmount),
      detail: b.payeeName ? `Payee: ${b.payeeName}` : (b.poNumber ? `PO ${b.poNumber}` : '—'),
      branchLabel: resolveBranchLabel(b.fromBranch, b.branchId, b.employeeId),
      requesterName: getRequesterName(b.employeeId),
      raw: b,
    }))
    const ot = overtimeRequests.map((o): UnifiedRow => ({
      id: o.id,
      type: 'overtime',
      createdAt: o.createdAt,
      employeeId: o.employeeId,
      branchId: o.branchId || userDirectory[o.employeeId]?.branchId,
      status: o.status,
      rejectionReason: o.rejectionReason,
      notesText: o.notes,
      amount: null,
      detail: o.cutoffPeriod ? `Cut-off: ${o.cutoffPeriod}` : '—',
      branchLabel: resolveBranchLabel(o.department, o.branchId, o.employeeId),
      requesterName: o.employeeName || getRequesterName(o.employeeId),
      raw: o,
    }))
    return [...ca, ...bud, ...ot].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
  }, [cashAdvances, budgetRequests, overtimeRequests, resolveBranchLabel, getRequesterName, userDirectory])

  const matchesBranch = useCallback((r: UnifiedRow, filterId: string) => {
    if (!filterId || filterId === 'ALL') return true
    if (r.branchId && r.branchId.toLowerCase() === filterId.toLowerCase()) return true

    const selectedBranch = branches.find(b => b.id.toLowerCase() === filterId.toLowerCase())
    if (!selectedBranch) return false

    const branchName = selectedBranch.name.toLowerCase()
    const rowLabel = r.branchLabel.toLowerCase()

    if (rowLabel && (rowLabel === branchName || branchName.includes(rowLabel) || rowLabel.includes(branchName))) return true

    const formattedSelected = formatBranchName(selectedBranch.name, selectedBranch.id).toLowerCase()
    if (rowLabel && (rowLabel === formattedSelected || formattedSelected.includes(rowLabel) || rowLabel.includes(formattedSelected))) return true

    return false
  }, [branches])

  const filteredRows = unifiedRows.filter(r =>
    (typeFilter === 'ALL' || r.type === typeFilter) &&
    (statusFilter === 'ALL' || r.status === statusFilter) &&
    matchesBranch(r, branchFilter) &&
    (searchQuery.trim() === '' ||
      r.requesterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.detail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.branchLabel.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const statsBase = unifiedRows.filter(r =>
    (typeFilter === 'ALL' || r.type === typeFilter) &&
    matchesBranch(r, branchFilter)
  )
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
          if (res.ok) {
            if (type === 'cash-advance') {
              setCashAdvances(prev => prev.filter(c => c.id !== id))
            } else if (type === 'budget') {
              setBudgetRequests(prev => prev.filter(b => b.id !== id))
            } else {
              setOvertimeRequests(prev => prev.filter(o => o.id !== id))
            }
            fetchAll()
          } else {
            const errText = await res.text().catch(() => '')
            let message = 'Failed to delete request.'
            try {
              const json = JSON.parse(errText)
              message = json.message || json.error || errText
            } catch {
              if (errText) message = errText
            }
            setError(message)
          }
        } catch (err: any) {
          setError(err?.message || 'Failed to delete request.')
        }
      },
    })
  }

  const resetForms = useCallback(() => {
    const defaultBranchId = userAssignedBranchId || (branches.length > 0 ? branches[0].id : '')
    const defaultBranchName = userAssignedBranchName || (branches.length > 0 ? branches[0].name.toUpperCase() : '')
    setCaAmount('')
    setCaPurpose('')
    setCaBranchId(defaultBranchId)
    setBudgetDate(todayKey())
    setBudgetBranch(defaultBranchName || defaultBranchId)
    setBudgetDept((user?.jobTitle || '').split(',')[0].trim() || 'OPERATIONS')
    setBudgetPo('')
    setPaymentMethod('CHECK')
    setPayeeName('')
    setBankName('')
    setAccountNo('')
    setDueDate('')
    setLineItems([{ particulars: '', amount: 0 }, { particulars: '', amount: 0 }, { particulars: '', amount: 0 }])
    setOtName(user?.name || '')
    setOtPosition((user?.jobTitle || '').split(',')[0].trim() || '')
    setOtDepartment(defaultBranchName || (user?.jobTitle || '').split(',')[0].trim() || 'OPERATIONS')
    setOtCutoff('')
    setOtEntries(emptyOtRows(5))
    setFormErrors({})
  }, [userAssignedBranchId, userAssignedBranchName, branches, user?.name, user?.jobTitle])

  // Admins/management review via approve/reject/delete only — editing the submitted
  // content is reserved for the requester themselves while it's still pending.
  const canEditRecord = (r: { status: string; employeeId: string }) =>
    r.status === 'PENDING' && r.employeeId === user?.id

  // The creator of a PENDING request can withdraw (delete) their own submission.
  const canDeleteAsOwner = (r: { status: string; employeeId: string }) =>
    r.status === 'PENDING' && r.employeeId === user?.id

  const openNewForm = () => {
    resetForms()
    setError(null)
    setFormErrors({})
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
    setFormErrors({})
    if (type === 'cash-advance') {
      const r = record as CashAdvance
      setCaAmount(String(r.amount ?? ''))
      setCaPurpose(r.purpose || '')
      setCaBranchId(r.branchId || userAssignedBranchId || user?.branchId || '')
    } else if (type === 'budget') {
      const r = record as BudgetRequest
      setBudgetDate(r.requestDate || todayKey())
      setBudgetBranch(r.fromBranch || userAssignedBranchName || getBranchLabel(user?.branchId))
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

  // Auto-open full view modal when navigating from a notification link
  useEffect(() => {
    if (!targetId || unifiedRows.length === 0) return
    const row = unifiedRows.find(r => r.id === targetId && (!targetType || r.type === targetType))
      || unifiedRows.find(r => r.id === targetId)
    if (row && (!modal || modal.record?.id !== row.id)) {
      openRecord('view', row.type, row.raw)
    }
  }, [targetId, targetType, unifiedRows, modal])

  const closeModal = () => {
    setModal(null)
    setFormErrors({})
    setIsEditingModalNotes(false)
    setModalNotesInput('')
    setRejectDialog(null)
    if (searchParams.get('id')) {
      const next = new URLSearchParams(searchParams)
      next.delete('id')
      next.delete('type')
      setSearchParams(next, { replace: true })
    }
  }

  const openContextMenu = (e: React.MouseEvent, row: UnifiedRow) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, row })
  }
  const closeContextMenu = () => setContextMenu(null)

  const handleSubmitCashAdvance = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErrors({})
    setError(null)
    const errs: Record<string, string> = {}
    const branch = caBranchId || userAssignedBranchId
    if (!branch || !branch.trim()) {
      errs.branch = 'Branch is required. Please select your assigned branch.'
    }
    const amtNum = parseFloat(caAmount.replace(/,/g, ''))
    if (!caAmount || isNaN(amtNum) || amtNum <= 0) {
      errs.amount = 'Amount is required and must be greater than ₱0.00.'
    }
    if (!caPurpose || !caPurpose.trim()) {
      errs.purpose = 'Purpose / Reason is required.'
    }
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      setError(Object.values(errs)[0])
      return
    }

    setSaving(true)
    const isEdit = modal?.mode === 'edit' && modal.record
    try {
      const res = await fetch(
        isEdit ? `${API_BASE_URL}/hris/cash-advances/${modal!.record!.id}` : `${API_BASE_URL}/hris/cash-advances`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amtNum,
            purpose: caPurpose.trim(),
            repaymentTermMonths: 1,
            branchId: branch,
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
    setFormErrors({})
    setError(null)
    const errs: Record<string, string> = {}
    if (!budgetDate) errs.date = 'Date is required.'
    const branch = budgetBranch || userAssignedBranchName || userAssignedBranchId
    if (!branch || !branch.trim()) errs.branch = 'Branch is required.'
    if (!budgetPo.trim()) errs.po = 'P.O. Number is required.'
    if (!payeeName.trim()) errs.payee = 'Payee Name is required.'
    if ((paymentMethod === 'CHECK' || paymentMethod === 'PDC') && !bankName.trim()) {
      errs.bank = 'Bank name is required for Check/PDC payment.'
    }
    if ((paymentMethod === 'CHECK' || paymentMethod === 'PDC') && !accountNo.trim()) {
      errs.account = 'Account number is required for Check/PDC payment.'
    }
    if (!dueDate) errs.dueDate = 'Due Date is required.'

    const validItems = lineItems.filter(li => li.particulars.trim() && li.amount > 0)
    if (validItems.length === 0) {
      errs.lineItems = 'Please add at least one line item with particulars and amount greater than ₱0.00.'
    } else {
      const hasIncomplete = lineItems.some(li => (li.particulars.trim() && li.amount <= 0) || (!li.particulars.trim() && li.amount > 0))
      if (hasIncomplete) {
        errs.lineItems = 'All active line items must have both a description and an amount.'
      }
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      setError(Object.values(errs)[0])
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
            fromBranch: branch,
            fromDept: (budgetDept || 'OPERATIONS').trim(),
            poNumber: budgetPo.trim(),
            paymentMethod,
            payeeName: payeeName.trim(),
            bankName: bankName.trim() || null,
            accountNo: accountNo.trim() || null,
            dueDate: dueDate || null,
            lineItemsJson: JSON.stringify(validItems),
            totalAmount: budgetTotal,
            branchId: userAssignedBranchId || user?.branchId,
          }),
        }
      )
      if (res.ok) {
        closeModal()
        fetchAll()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || err.message || 'Failed to submit budget request.')
      }
    } catch {
      setError('Failed to submit budget request.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErrors({})
    setError(null)
    const errs: Record<string, string> = {}
    if (!otName.trim()) errs.name = 'Member Name is required.'
    if (!otPosition.trim()) errs.position = 'Position is required.'
    if (!otDepartment.trim()) errs.department = 'Department / Branch is required.'
    if (!otCutoff.trim()) errs.cutoff = 'Cut Off Period is required (e.g. AUG 16-31).'

    const filledEntries = otEntries.filter(en =>
      en.dateRequested || en.timeIn || en.reason || en.otFrom || en.otTo || en.approvedBy
    )
    if (filledEntries.length === 0) {
      errs.entries = 'Please fill out at least one overtime duty row.'
    } else {
      const incomplete = filledEntries.some(en =>
        !en.dateRequested || !en.timeIn || !en.reason.trim() || !en.otFrom || !en.otTo || !en.approvedBy.trim()
      )
      if (incomplete) {
        errs.entries = 'All columns (Date, Time In, Reason, OT From, OT To, Approved By) must be filled in each active overtime row.'
      }
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      setError(Object.values(errs)[0])
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
            employeeName: otName.trim(),
            position: otPosition.trim(),
            department: otDepartment.trim(),
            cutoffPeriod: otCutoff.trim(),
            entriesJson: JSON.stringify(filledEntries),
            branchId: userAssignedBranchId || user?.branchId,
          }),
        }
      )
      if (res.ok) {
        closeModal()
        fetchAll()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || err.message || 'Failed to submit overtime request.')
      }
    } catch {
      setError('Failed to submit overtime request.')
    } finally {
      setSaving(false)
    }
  }

  const [statusMenu, setStatusMenu] = useState<{ id: string; type: TabId; currentStatus: string; x: number; y: number } | null>(null)

  const openStatusMenu = (e: React.MouseEvent, row: UnifiedRow) => {
    e.stopPropagation()
    if (!isAdmin) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setStatusMenu({
      id: row.id,
      type: row.type,
      currentStatus: row.status,
      x: rect.left,
      y: rect.bottom + 4,
    })
  }

  const closeStatusMenu = () => setStatusMenu(null)

  const getStatusOptions = (type: TabId) => {
    if (type === 'cash-advance') {
      return [
        { value: 'PENDING', label: 'Pending', color: '#d97706' },
        { value: 'APPROVED', label: 'Approved', color: '#16a34a' },
        { value: 'DISBURSED', label: 'Disbursed', color: '#4f46e5' },
        { value: 'FULLY_PAID', label: 'Fully Paid', color: '#0d9488' },
        { value: 'REJECTED', label: 'Rejected', color: '#dc2626' },
      ]
    }
    if (type === 'budget') {
      return [
        { value: 'PENDING', label: 'Pending', color: '#d97706' },
        { value: 'NOTED', label: 'Noted', color: '#2563eb' },
        { value: 'APPROVED', label: 'Approved', color: '#16a34a' },
        { value: 'REJECTED', label: 'Rejected', color: '#dc2626' },
      ]
    }
    return [
      { value: 'PENDING', label: 'Pending', color: '#d97706' },
      { value: 'APPROVED', label: 'Approved', color: '#16a34a' },
      { value: 'REJECTED', label: 'Rejected', color: '#dc2626' },
    ]
  }

  const handleStatusUpdate = async (type: TabId, id: string, status: string, rejectionReason?: string) => {
    const endpoints: Record<string, string> = {
      budget: `${API_BASE_URL}/operations/budget-requests/${id}/status`,
      overtime: `${API_BASE_URL}/operations/overtime-requests/${id}/status`,
      'cash-advance': `${API_BASE_URL}/hris/cash-advances/${id}/approve`,
    }

    // Optimistic UI updates
    if (type === 'cash-advance') {
      setCashAdvances(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    } else if (type === 'budget') {
      setBudgetRequests(prev => prev.map(b => b.id === id ? { ...b, status, rejectionReason } : b))
    } else {
      setOvertimeRequests(prev => prev.map(o => o.id === id ? { ...o, status, rejectionReason } : o))
    }

    if (modal?.record && modal.record.id === id) {
      setModal(m => m ? { ...m, record: { ...m.record!, status, rejectionReason } as any } : null)
    }

    const body: Record<string, any> = { status }
    if (rejectionReason) body.rejectionReason = rejectionReason
    if (type === 'cash-advance' && !body.notes) body.notes = ''

    try {
      const res = await fetch(endpoints[type], {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) fetchAll()
    } catch {
      fetchAll()
    }
  }

  const onSelectStatus = async (type: TabId, id: string, newStatus: string) => {
    closeStatusMenu()
    if (newStatus === 'REJECTED') {
      setRejectDialog({
        isOpen: true,
        type,
        id,
        currentReason: '',
      })
      return
    }
    await handleStatusUpdate(type, id, newStatus)
  }

  const statusColors: Record<string, string> = {
    PENDING: '#d97706', APPROVED: '#16a34a', NOTED: '#2563eb',
    REJECTED: '#dc2626', DISBURSED: '#4f46e5', FULLY_PAID: '#0d9488',
  }

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [notesInput, setNotesInput] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const startEditingNotes = (row: UnifiedRow) => {
    if (!isAdmin) return
    setEditingNotesId(row.id)
    setNotesInput(row.notesText || '')
  }

  const cancelEditingNotes = () => {
    setEditingNotesId(null)
    setNotesInput('')
  }

  const handleSaveNotes = async (type: TabId, id: string, notes: string) => {
    setSavingNotes(true)
    const endpoints: Record<TabId, string> = {
      'cash-advance': `${API_BASE_URL}/hris/cash-advances/${id}/notes`,
      budget: `${API_BASE_URL}/operations/budget-requests/${id}/notes`,
      overtime: `${API_BASE_URL}/operations/overtime-requests/${id}/notes`,
    }

    // Optimistic UI updates
    if (type === 'cash-advance') {
      setCashAdvances(prev => prev.map(c => c.id === id ? { ...c, notes } : c))
    } else if (type === 'budget') {
      setBudgetRequests(prev => prev.map(b => b.id === id ? { ...b, notes } : b))
    } else {
      setOvertimeRequests(prev => prev.map(o => o.id === id ? { ...o, notes } : o))
    }

    if (modal?.record && modal.record.id === id) {
      setModal(m => m ? { ...m, record: { ...m.record!, notes } as any } : null)
    }

    try {
      const res = await fetch(endpoints[type], {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) {
        fetchAll()
      }
    } catch {
      fetchAll()
    } finally {
      setSavingNotes(false)
      setEditingNotesId(null)
    }
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard label="Total requests" value={stats.total} icon={TrendingUp} color="#6366f1" />
        <StatCard label="Pending" value={stats.pending} icon={Hourglass} color="#d97706" />
        <StatCard label="Approved" value={stats.approved} icon={CircleCheck} color="#16a34a" />
        <StatCard label="Rejected" value={stats.rejected} icon={CircleX} color="#dc2626" />
      </div>

      {/* List card */}
      <div className="rounded-xl sm:rounded-2xl overflow-hidden shadow-xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
            <div className="col-span-2 relative w-full sm:w-56">
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
            {isAdmin && (
              <div className="relative w-full sm:w-auto">
                <Building2 className="absolute left-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
                <select
                  value={branchFilter}
                  onChange={e => setBranchFilter(e.target.value)}
                  className={`${inputCls} pl-8 appearance-none cursor-pointer`}
                  style={istyle}
                  aria-label="Filter by branch"
                >
                  <option value="ALL">All branches</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{formatBranchName(b.name, b.id)}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="relative w-full sm:w-auto">
              <Filter className="absolute left-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as 'ALL' | TabId)}
                className={`${inputCls} pl-8 appearance-none cursor-pointer`}
                style={istyle}
              >
                <option value="ALL">All types</option>
                {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="relative w-full sm:w-auto col-span-2 sm:col-span-1">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className={`${inputCls} appearance-none cursor-pointer`}
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

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: textMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs font-semibold">Loading…</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-12 text-xs font-semibold" style={{ color: textMuted }}>No requests found.</div>
        ) : (
          <>
            {/* Mobile Card View (shown below md) */}
            <div className="md:hidden divide-y" style={{ borderColor: border }}>
              {filteredRows.map(r => (
                <div
                  key={`card-${r.type}-${r.id}`}
                  onClick={() => openRecord('view', r.type, r.raw)}
                  className="p-3.5 flex flex-col gap-2.5 transition-colors active:bg-black/[0.03] dark:active:bg-white/[0.04] cursor-pointer"
                  style={{
                    borderLeft: `4px solid ${statusColors[r.status] || statusColors.PENDING}`,
                  }}
                >
                  {/* Top row: Type badge, Date, Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {typeText(r.type)}
                      <span className="text-[11px] font-semibold" style={{ color: textMuted }}>
                        {formatDateCaps(r.createdAt)}
                      </span>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={(e) => openStatusMenu(e, r)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                          style={{
                            color: statusColors[r.status] || statusColors.PENDING,
                            backgroundColor: `${statusColors[r.status] || statusColors.PENDING}18`,
                            border: `1px solid ${statusColors[r.status] || statusColors.PENDING}33`,
                          }}
                          title="Click to change status"
                        >
                          {r.status.replace(/_/g, ' ')}
                          <ChevronDown className="w-3 h-3 opacity-70" />
                        </button>
                      ) : (
                        statusText(r.status)
                      )}
                    </div>
                  </div>

                  {/* Middle row: Requester Name and Branch badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase truncate" style={{ color: textPrimary }}>
                      {r.requesterName}
                    </span>
                    {r.branchLabel && r.branchLabel !== '—' && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase shrink-0"
                        style={{
                          backgroundColor: isLight ? '#f1f5f9' : '#142038',
                          color: textMuted,
                          border: `1px solid ${border}`,
                        }}
                      >
                        {r.branchLabel}
                      </span>
                    )}
                  </div>

                  {/* Details and Amount */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-xs font-semibold" style={{ color: textMuted }} title={r.detail}>
                      {r.detail}
                    </span>
                    {r.amount != null && (
                      <span className="text-xs font-black shrink-0" style={{ color: textPrimary }}>
                        {formatPeso(r.amount)}
                      </span>
                    )}
                  </div>

                  {/* Notes row if any */}
                  {(r.notesText || (r.status === 'REJECTED' && r.rejectionReason)) && (
                    <div
                      className="text-[11px] p-2 rounded-lg"
                      style={{
                        backgroundColor: isLight ? '#f8fafc' : '#0e172a',
                        border: `1px solid ${border}`,
                        color: r.status === 'REJECTED' ? '#dc2626' : textMuted,
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        if (isAdmin) startEditingNotes(r)
                      }}
                    >
                      <span className="font-bold">
                        {r.status === 'REJECTED' && r.rejectionReason ? 'Reason: ' : 'Note: '}
                      </span>
                      <span>
                        {r.status === 'REJECTED' ? (r.rejectionReason || r.notesText) : r.notesText}
                      </span>
                    </div>
                  )}

                  {/* Card actions */}
                  <div className="flex items-center justify-end gap-2 pt-0.5" onClick={e => e.stopPropagation()}>
                    {canDeleteAsOwner(r) && (
                      <button
                        type="button"
                        onClick={() => requestDeleteRecord(r.type, r.id, r.detail)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                    {canEditRecord(r as any) && (
                      <button
                        type="button"
                        onClick={() => openRecord('edit', r.type, r.raw)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all text-blue-600 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openRecord('view', r.type, r.raw)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all hover:opacity-80"
                      style={{
                        backgroundColor: isLight ? '#f1f5f9' : '#172544',
                        color: textPrimary,
                        border: `1px solid ${border}`,
                      }}
                    >
                      <Eye className="w-3 h-3" /> View Form
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (shown on md and up) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                    {['Date', 'Type', 'Requested By', 'Branch', 'Details', 'Amount', 'Status', 'Notes'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-bold" style={{ borderBottom: `1px solid ${border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(r => (
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
                      <td className={`${cellCls} select-none`}>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={(e) => openStatusMenu(e, r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-105 shadow-sm active:scale-95 cursor-pointer"
                            style={{
                              color: statusColors[r.status] || statusColors.PENDING,
                              backgroundColor: `${statusColors[r.status] || statusColors.PENDING}18`,
                              border: `1px solid ${statusColors[r.status] || statusColors.PENDING}33`,
                            }}
                            title="Click to edit status"
                          >
                            {r.status.replace(/_/g, ' ')}
                            <ChevronDown className="w-3 h-3 opacity-70" />
                          </button>
                        ) : (
                          statusText(r.status)
                        )}
                      </td>
                      <td
                        className={`${cellCls} max-w-[200px] select-none`}
                        style={{ color: textPrimary }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          if (isAdmin) startEditingNotes(r)
                        }}
                        title={isAdmin ? "Double-click to add/edit note for this member" : undefined}
                      >
                        {editingNotesId === r.id ? (
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={notesInput}
                              onChange={e => setNotesInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveNotes(r.type, r.id, notesInput)
                                else if (e.key === 'Escape') cancelEditingNotes()
                              }}
                              className="px-2 py-1 rounded text-xs w-full focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                              style={istyle}
                              placeholder="Add note for member…"
                              autoFocus
                              disabled={savingNotes}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveNotes(r.type, r.id, notesInput)}
                              disabled={savingNotes}
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                              title="Save Note"
                            >
                              {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingNotes}
                              disabled={savingNotes}
                              className="p-1 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className={`flex items-center justify-between gap-1 group ${isAdmin ? 'cursor-pointer hover:text-emerald-500' : ''}`}>
                            <span className="truncate" title={r.status === 'REJECTED' ? (r.rejectionReason || r.notesText || '') : (r.notesText || '')}>
                              {r.status === 'REJECTED' ? (r.rejectionReason ? `Reason: ${r.rejectionReason}` : (r.notesText || '—')) : (r.notesText || '—')}
                            </span>
                            {isAdmin && (
                              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0 text-emerald-500 transition-opacity" />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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
            {isAdmin && (
              <MenuItem
                icon={Pencil}
                label="Add / Edit Note"
                color="#10B981"
                onClick={() => {
                  startEditingNotes(contextMenu.row)
                  closeContextMenu()
                }}
              />
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
            {(isAdmin || canDeleteAsOwner(contextMenu.row)) && (
              <>
                <div style={{ borderTop: `1px solid ${border}` }} className="my-1" />
                <MenuItem icon={Trash2} label="Delete" color="#dc2626" onClick={() => { closeContextMenu(); requestDeleteRecord(contextMenu.row.type, contextMenu.row.id, contextMenu.row.detail) }} />
              </>
            )}
          </div>
        </>
      )}

      {/* Status dropdown menu for Admin / Management */}
      {statusMenu && (
        <>
          <div className="fixed inset-0 z-[15900]" onClick={closeStatusMenu} onContextMenu={e => { e.preventDefault(); closeStatusMenu() }} />
          <div
            className="fixed z-[15950] min-w-[160px] rounded-xl shadow-2xl overflow-hidden py-1"
            style={{
              top: Math.min(statusMenu.y, window.innerHeight - 240),
              left: Math.min(statusMenu.x, window.innerWidth - 180),
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
            }}
          >
            <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-b" style={{ color: textMuted, borderColor: border }}>
              Change Status
            </div>
            {getStatusOptions(statusMenu.type).map(opt => {
              const active = statusMenu.currentStatus === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSelectStatus(statusMenu.type, statusMenu.id, opt.value)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  style={{ color: opt.color }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                    <span>{opt.label}</span>
                  </div>
                  {active && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: opt.color }} />}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Add / Edit / View — full page */}
      {modal && (
        <div
          className="rounded-xl sm:rounded-2xl overflow-hidden shadow-xl"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="flex items-center gap-3">
              <button
                onClick={closeModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                style={{ color: textMuted }}
              >
                <ChevronLeft className="w-4 h-4" /> Back to list
              </button>
              <div className="h-4 w-px" style={{ backgroundColor: border }} />
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: typeMeta(modal.type).color }}
                />
                <h2 className="text-sm font-black tracking-tight" style={{ color: textPrimary }}>
                  {modal.mode === 'add' && 'Create New Request'}
                  {modal.mode === 'edit' && `Edit ${typeMeta(modal.type).label}`}
                  {modal.mode === 'view' && `View ${typeMeta(modal.type).label}`}
                </h2>
              </div>
            </div>

            <button
              onClick={closeModal}
              className="p-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer opacity-70 hover:opacity-100"
              style={{ color: textMuted }}
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 sm:p-6 md:p-8">
            {/* ── Request Type Selector: Prominent Interactive Cards (Create Mode Only) ── */}
            {modal.mode === 'add' && (
              <div className="max-w-6xl mx-auto mb-8 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>
                      Step 1: Select Request Type
                    </h3>
                    <p className="text-[11px] font-medium" style={{ color: textMuted }}>
                      Choose the operational form you want to submit
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  {TABS.map(t => {
                    const active = modal.type === t.id
                    const Icon = t.icon
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => switchCreateType(t.id)}
                        className="group relative flex items-start gap-3.5 p-4 rounded-xl sm:rounded-2xl border text-left transition-all duration-200 cursor-pointer overflow-hidden shadow-xs hover:shadow-md"
                        style={{
                          backgroundColor: active
                            ? (isLight ? '#ffffff' : '#111D36')
                            : (isLight ? '#f8fafc' : '#0B132B'),
                          borderColor: active
                            ? t.color
                            : (isLight ? '#e2e8f0' : border),
                          boxShadow: active ? `0 4px 20px -2px ${t.color}25` : 'none',
                          transform: active ? 'translateY(-2px)' : 'none',
                        }}
                      >
                        {/* Active top accent indicator bar */}
                        {active && (
                          <div
                            className="absolute top-0 left-0 right-0 h-1"
                            style={{ backgroundColor: t.color }}
                          />
                        )}

                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: active ? `${t.color}20` : (isLight ? '#e2e8f0' : '#172544'),
                            color: active ? t.color : textMuted,
                          }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span
                              className="text-sm font-black tracking-tight"
                              style={{ color: active ? textPrimary : textMuted }}
                            >
                              {t.label}
                            </span>
                            {active && (
                              <span
                                className="flex items-center justify-center w-5 h-5 rounded-full text-white shrink-0 shadow-xs"
                                style={{ backgroundColor: t.color }}
                              >
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[11px] font-medium leading-relaxed mt-0.5"
                            style={{ color: textMuted }}
                          >
                            {t.description}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Main Form Paper Container ── */}
            <div
              className="max-w-6xl mx-auto rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-8 md:p-12 border"
              style={{ backgroundColor: paperBg, borderColor: isLight ? '#e2e8f0' : border }}
            >
              {/* Status & Review banner for edit/view */}
              {modal.record && (
                <div
                  className="flex flex-col gap-3.5 mb-6 p-4 sm:p-5 rounded-xl transition-all shadow-sm"
                  style={{
                    backgroundColor: isLight ? '#f8fafc' : '#0B132B',
                    border: `1px solid ${border}`,
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5" style={{ borderBottom: `1px solid ${border}` }}>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ backgroundColor: isLight ? '#e2e8f0' : '#172544', color: textMuted }}>
                        STATUS
                      </span>

                      {isAdmin ? (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={(e) => openStatusMenu(e, {
                              id: modal.record!.id,
                              type: modal.type,
                              status: modal.record!.status,
                            } as any)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            style={{
                              color: statusColors[modal.record.status] || statusColors.PENDING,
                              backgroundColor: `${statusColors[modal.record.status] || statusColors.PENDING}18`,
                              border: `1px solid ${statusColors[modal.record.status] || statusColors.PENDING}40`,
                            }}
                            title="Click to change status"
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[modal.record.status] || statusColors.PENDING }} />
                            {modal.record.status.replace(/_/g, ' ')}
                            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                          </button>
                        </div>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider"
                          style={{
                            color: statusColors[modal.record.status] || statusColors.PENDING,
                            backgroundColor: `${statusColors[modal.record.status] || statusColors.PENDING}18`,
                            border: `1px solid ${statusColors[modal.record.status] || statusColors.PENDING}40`,
                          }}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[modal.record.status] || statusColors.PENDING }} />
                          {modal.record.status.replace(/_/g, ' ')}
                        </span>
                      )}

                      {isAdmin && (
                        <div className="flex items-center gap-1.5 ml-0 sm:ml-2 flex-wrap">
                          {modal.type === 'budget' && modal.record.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => handleStatusUpdate('budget', modal.record!.id, 'NOTED')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm transition-transform active:scale-95 hover:opacity-90 cursor-pointer"
                              style={{ backgroundColor: '#2563eb' }}
                              title="Mark this budget request as Noted"
                            >
                              <Check className="w-3 h-3" /> Mark as Noted
                            </button>
                          )}
                          {(modal.record.status === 'PENDING' || (modal.type === 'budget' && modal.record.status === 'NOTED')) && (
                            <button
                              type="button"
                              onClick={() => handleStatusUpdate(modal.type, modal.record!.id, 'APPROVED')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm transition-transform active:scale-95 hover:opacity-90 cursor-pointer"
                              style={{ backgroundColor: '#16a34a' }}
                              title="Approve this request"
                            >
                              <Check className="w-3 h-3" /> Approve
                            </button>
                          )}
                          {modal.record.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => setRejectDialog({
                                isOpen: true,
                                type: modal.type,
                                id: modal.record!.id,
                                currentReason: '',
                              })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm transition-transform active:scale-95 hover:opacity-90 cursor-pointer"
                              style={{ backgroundColor: '#dc2626' }}
                              title="Reject this request with reason"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {canDeleteAsOwner(modal.record) && (
                        <button
                          type="button"
                          onClick={() => requestDeleteRecord(
                            modal.type,
                            modal.record!.id,
                            (modal.record as any).payeeName || (modal.record as any).purpose || (modal.record as any).cutoffPeriod || modal.type
                          )}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/40 transition-colors cursor-pointer"
                          title="Withdraw and delete this pending request"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Withdraw Request
                        </button>
                      )}
                    </div>
                  </div>

                  {modal.record.rejectionReason && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold uppercase tracking-wider block text-[10px]">Rejection Reason:</span>
                        <p className="mt-0.5 font-medium">{modal.record.rejectionReason}</p>
                      </div>
                    </div>
                  )}

                  {/* Notes / remarks section */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: textMuted }}>
                        <MessageSquare className="w-3 h-3" /> Review Remarks & Disbursement Notes
                      </span>
                      {isAdmin && !isEditingModalNotes && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingModalNotes(true)
                            setModalNotesInput((modal.record as any).notes || '')
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm hover:opacity-90 transition-all cursor-pointer"
                          style={{ backgroundColor: accent }}
                        >
                          <Pencil className="w-3 h-3" />
                          {(modal.record as any).notes ? 'Edit Note' : 'Add Custom Note'}
                        </button>
                      )}
                    </div>

                    {isEditingModalNotes ? (
                      <div className="flex flex-col gap-2.5 p-3.5 rounded-xl border animate-fadeIn" style={{ backgroundColor: isLight ? '#ffffff' : '#080E1E', borderColor: border }}>
                        <textarea
                          rows={3}
                          value={modalNotesInput}
                          onChange={e => setModalNotesInput(e.target.value)}
                          placeholder="Type custom note, instructions, or disbursement details for the member..."
                          className="w-full p-2.5 text-xs font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          style={istyle}
                          autoFocus
                        />

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold" style={{ color: textMuted }}>Quick suggestions:</span>
                          {[
                            'Approved and forwarded to accounting for check issuance.',
                            'Please submit the original physical receipts to admin.',
                            'Cash available for pickup at branch cashier.',
                            'Please coordinate with HR for verification.',
                          ].map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setModalNotesInput(prev => prev ? `${prev} ${preset}` : preset)}
                              className="text-[10px] px-2 py-0.5 rounded-md font-semibold border transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-left cursor-pointer"
                              style={{ borderColor: border, color: textMuted }}
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingModalNotes(false)
                              setModalNotesInput('')
                            }}
                            disabled={savingNotes}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                            style={{ color: textMuted }}
                          >
                            Cancel
                          </button>
                          {(modal.record as any).notes && (
                            <button
                              type="button"
                              onClick={async () => {
                                await handleSaveNotes(modal.type, modal.record!.id, '')
                                setIsEditingModalNotes(false)
                              }}
                              disabled={savingNotes}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                            >
                              Clear Note
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await handleSaveNotes(modal.type, modal.record!.id, modalNotesInput)
                              setIsEditingModalNotes(false)
                            }}
                            disabled={savingNotes}
                            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                            style={{ backgroundColor: accent }}
                          >
                            {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Save Note
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="p-3 rounded-lg text-xs font-medium flex items-start justify-between gap-3"
                        style={{
                          backgroundColor: (modal.record as any).notes
                            ? (isLight ? '#ffffff' : '#0F1A2E')
                            : (isLight ? '#f1f5f9' : '#0e172a'),
                          border: `1px solid ${border}`,
                          color: (modal.record as any).notes ? textPrimary : textMuted,
                        }}
                      >
                        <div className="flex-1 whitespace-pre-wrap">
                          {(modal.record as any).notes || 'No remarks or notes added yet.'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Form Level Error Alert */}
              {error && (
                <div className="mb-6 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-2.5 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

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
                      <input
                        className={`${inputCls} uppercase`}
                        style={istyle}
                        value={(modal.record ? getRequesterName(modal.record.employeeId) : (user?.name || '')).toUpperCase()}
                        readOnly
                      />
                    </FormField>

                    <FormField label="Assigned Branch" required error={formErrors.branch}>
                      <select
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.branch ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        value={caBranchId || userAssignedBranchId}
                        onChange={e => {
                          setCaBranchId(e.target.value)
                          setFormErrors(prev => ({ ...prev, branch: '' }))
                        }}
                        disabled={disabled}
                        required
                      >
                        <option value="">Select branch…</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                        ))}
                        {userAssignedBranchId && !branches.some(b => b.id === userAssignedBranchId) && (
                          <option value={userAssignedBranchId}>{userAssignedBranchName || getBranchLabel(userAssignedBranchId)}</option>
                        )}
                      </select>
                    </FormField>

                    <FormField label="Date of Request" required>
                      <input
                        className={inputCls}
                        style={istyle}
                        type="text"
                        value={formatDateCaps(modal.record ? modal.record.createdAt : new Date().toISOString())}
                        readOnly
                      />
                    </FormField>

                    <FormField label="Amount (₱)" required error={formErrors.amount}>
                      <NumericFormat
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.amount ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        thousandSeparator=","
                        decimalScale={2}
                        fixedDecimalScale
                        allowNegative={false}
                        placeholder="0.00"
                        value={caAmount}
                        onValueChange={v => {
                          setCaAmount(v.value)
                          setFormErrors(prev => ({ ...prev, amount: '' }))
                        }}
                        disabled={disabled}
                        required
                      />
                    </FormField>

                    <FormField label="Purpose / Reason for Advance" required colSpan={2} error={formErrors.purpose}>
                      <textarea
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.purpose ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        rows={3}
                        value={caPurpose}
                        onChange={e => {
                          setCaPurpose(e.target.value)
                          setFormErrors(prev => ({ ...prev, purpose: '' }))
                        }}
                        placeholder="State the purpose and reason for this cash advance request…"
                        readOnly={disabled}
                        required
                      />
                    </FormField>
                  </div>

                  <div className="flex justify-end gap-3 mt-8 pt-4 border-t" style={{ borderColor: border }}>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-6 py-2.5 rounded-xl text-xs font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textPrimary }}
                    >
                      {disabled ? 'Close' : 'Cancel'}
                    </button>
                    {disabled && modal.record && canEditRecord(modal.record as any) && (
                      <button
                        type="button"
                        onClick={() => openRecord('edit', modal.type, modal.record!)}
                        className="px-6 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm transition-transform active:scale-95 cursor-pointer"
                        style={{ backgroundColor: '#2563eb' }}
                      >
                        <Pencil className="w-4 h-4" /> Edit Request
                      </button>
                    )}
                    {!disabled && (
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-7 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm hover:opacity-90 transition-all cursor-pointer"
                        style={{ backgroundColor: accent }}
                      >
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
                    subtitle="Operational, procurement & branch expense requests"
                    isLight={isLight}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                    border={border}
                  />

                  {/* Header Meta Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
                    <FormField label="Date" required error={formErrors.date}>
                      <input
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.date ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        type="date"
                        value={budgetDate}
                        onChange={e => {
                          setBudgetDate(e.target.value)
                          setFormErrors(prev => ({ ...prev, date: '' }))
                        }}
                        disabled={disabled}
                        required
                      />
                    </FormField>

                    <FormField label="From — Branch" required error={formErrors.branch}>
                      <select
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.branch ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        value={budgetBranch || userAssignedBranchName || userAssignedBranchId}
                        onChange={e => {
                          setBudgetBranch(e.target.value)
                          setFormErrors(prev => ({ ...prev, branch: '' }))
                        }}
                        disabled={disabled}
                        required
                      >
                        <option value="">Select branch…</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.name.toUpperCase()}>{b.name.toUpperCase()}</option>
                        ))}
                        {userAssignedBranchName && !branches.some(b => b.name.toUpperCase() === userAssignedBranchName) && (
                          <option value={userAssignedBranchName}>{userAssignedBranchName}</option>
                        )}
                      </select>
                    </FormField>

                    <FormField label="P.O. Number" required error={formErrors.po}>
                      <input
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.po ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        value={budgetPo}
                        onChange={e => {
                          setBudgetPo(e.target.value)
                          setFormErrors(prev => ({ ...prev, po: '' }))
                        }}
                        placeholder="e.g. PO-2026-00123"
                        readOnly={disabled}
                        required
                      />
                    </FormField>
                  </div>

                  {/* Payment / Disbursement details card */}
                  <div
                    className="p-4 sm:p-5 rounded-xl border mb-6"
                    style={{ backgroundColor: isLight ? '#f8fafc' : '#0A1224', borderColor: border }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b" style={{ borderColor: border }}>
                      <h4 className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: textPrimary }}>
                        <Building2 className="w-4 h-4" style={{ color: accent }} />
                        Disbursement & Payee Information
                      </h4>

                      {/* Payment Method Switcher */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                          Payment Method:
                        </span>
                        <div className="inline-flex p-0.5 rounded-lg border gap-1" style={{ backgroundColor: isLight ? '#ffffff' : '#0F1A2E', borderColor: border }}>
                          {(['CASH', 'CHECK', 'PDC'] as const).map(m => {
                            const active = paymentMethod === m
                            return (
                              <button
                                key={m}
                                type="button"
                                disabled={disabled}
                                onClick={() => setPaymentMethod(m)}
                                className="px-3 py-1 rounded-md text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                                style={{
                                  backgroundColor: active ? accent : 'transparent',
                                  color: active ? '#ffffff' : textMuted,
                                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                }}
                              >
                                {active && <Check className="w-3 h-3 stroke-[3]" />}
                                {m}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                      <FormField label="Payee Name" required error={formErrors.payee} colSpan={2}>
                        <input
                          className={inputCls}
                          style={{
                            ...istyle,
                            ...(formErrors.payee ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                          }}
                          value={payeeName}
                          onChange={e => {
                            setPayeeName(e.target.value)
                            setFormErrors(prev => ({ ...prev, payee: '' }))
                          }}
                          placeholder="Payee / Supplier / Vendor name"
                          readOnly={disabled}
                          required
                        />
                      </FormField>

                      <FormField
                        label="Bank Name"
                        required={paymentMethod === 'CHECK' || paymentMethod === 'PDC'}
                        error={formErrors.bank}
                      >
                        <input
                          className={inputCls}
                          style={{
                            ...istyle,
                            ...(formErrors.bank ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                          }}
                          value={bankName}
                          onChange={e => {
                            setBankName(e.target.value)
                            setFormErrors(prev => ({ ...prev, bank: '' }))
                          }}
                          placeholder={paymentMethod === 'CASH' ? 'Optional (N/A)' : 'e.g. BDO / BPI / MBTC'}
                          readOnly={disabled}
                        />
                      </FormField>

                      <FormField
                        label="Account No."
                        required={paymentMethod === 'CHECK' || paymentMethod === 'PDC'}
                        error={formErrors.account}
                      >
                        <input
                          className={inputCls}
                          style={{
                            ...istyle,
                            ...(formErrors.account ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                          }}
                          value={accountNo}
                          onChange={e => {
                            setAccountNo(e.target.value)
                            setFormErrors(prev => ({ ...prev, account: '' }))
                          }}
                          placeholder={paymentMethod === 'CASH' ? 'Optional (N/A)' : 'Bank account #'}
                          readOnly={disabled}
                        />
                      </FormField>

                      <FormField label="Payment Due Date" required error={formErrors.dueDate} colSpan={2}>
                        <input
                          className={inputCls}
                          style={{
                            ...istyle,
                            ...(formErrors.dueDate ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                          }}
                          type="date"
                          value={dueDate}
                          onChange={e => {
                            setDueDate(e.target.value)
                            setFormErrors(prev => ({ ...prev, dueDate: '' }))
                          }}
                          disabled={disabled}
                          required
                        />
                      </FormField>
                    </div>
                  </div>

                  {/* Line Items Section */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-[11px] font-black uppercase tracking-wider block opacity-80">
                        Itemized Particulars <span className="text-red-500 font-bold">*</span>
                      </label>
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => setLineItems([...lineItems, { particulars: '', amount: 0 }])}
                          className="text-xs font-bold flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all hover:opacity-80 cursor-pointer"
                          style={{ backgroundColor: `${accent}18`, color: accent }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Row
                        </button>
                      )}
                    </div>

                    {formErrors.lineItems && (
                      <p className="text-[11px] font-bold text-red-500 mb-2 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {formErrors.lineItems}
                      </p>
                    )}

                    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
                      <table className="w-full text-xs min-w-[400px]" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                            <th className="text-center px-3 py-2.5 font-black w-12 border-b" style={{ borderColor: border }}>#</th>
                            <th className="text-left px-3 py-2.5 font-black border-b" style={{ borderColor: border }}>PARTICULARS / DESCRIPTION</th>
                            <th className="text-right px-3 py-2.5 font-black w-44 border-b" style={{ borderColor: border }}>AMOUNT (₱)</th>
                            {!disabled && <th className="w-12 text-center border-b" style={{ borderColor: border }} />}
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((li, i) => (
                            <tr
                              key={i}
                              style={{
                                backgroundColor: i % 2 === 0 ? 'transparent' : (isLight ? '#f8fafc' : '#080E1E'),
                                borderBottom: `1px solid ${border}`,
                              }}
                            >
                              <td className="px-3 py-2 text-center font-bold opacity-60">{i + 1}</td>
                              <td className="p-1.5">
                                <input
                                  className="w-full px-2.5 py-1.5 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent"
                                  style={{ color: textPrimary, border: `1px solid ${border}` }}
                                  value={li.particulars}
                                  onChange={e => {
                                    const next = [...lineItems]
                                    next[i] = { ...next[i], particulars: e.target.value }
                                    setLineItems(next)
                                    setFormErrors(prev => ({ ...prev, lineItems: '' }))
                                  }}
                                  placeholder="Description of item or expense…"
                                  readOnly={disabled}
                                />
                              </td>
                              <td className="p-1.5">
                                <NumericFormat
                                  className="w-full px-2.5 py-1.5 text-xs text-right font-semibold rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent"
                                  style={{ color: textPrimary, border: `1px solid ${border}` }}
                                  thousandSeparator=","
                                  decimalScale={2}
                                  fixedDecimalScale
                                  allowNegative={false}
                                  prefix="₱ "
                                  placeholder="₱ 0.00"
                                  value={li.amount || ''}
                                  onValueChange={v => {
                                    const next = [...lineItems]
                                    next[i] = { ...next[i], amount: parseFloat(v.value) || 0 }
                                    setLineItems(next)
                                    setFormErrors(prev => ({ ...prev, lineItems: '' }))
                                  }}
                                  disabled={disabled}
                                />
                              </td>
                              {!disabled && (
                                <td className="text-center p-1.5">
                                  {lineItems.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setLineItems(lineItems.filter((_, j) => j !== i))}
                                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
                                      title="Remove item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                          <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                            <td colSpan={2} className="px-4 py-3 text-right font-black uppercase text-xs tracking-wider">
                              Total Payment Amount:
                            </td>
                            <td className="px-4 py-3 text-right font-black text-sm" style={{ color: accent }}>
                              {formatPeso(budgetTotal)}
                            </td>
                            {!disabled && <td />}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-8 pt-4 border-t" style={{ borderColor: border }}>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-6 py-2.5 rounded-xl text-xs font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textPrimary }}
                    >
                      {disabled ? 'Close' : 'Cancel'}
                    </button>
                    {disabled && modal.record && canEditRecord(modal.record as any) && (
                      <button
                        type="button"
                        onClick={() => openRecord('edit', modal.type, modal.record!)}
                        className="px-6 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm transition-transform active:scale-95 cursor-pointer"
                        style={{ backgroundColor: '#2563eb' }}
                      >
                        <Pencil className="w-4 h-4" /> Edit Request
                      </button>
                    )}
                    {!disabled && (
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-7 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm hover:opacity-90 transition-all cursor-pointer"
                        style={{ backgroundColor: accent }}
                      >
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
                    subtitle="ASHCOL-OT-FORM V02 • Overtime Hours & Work Duty Authorization"
                    isLight={isLight}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                    border={border}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <FormField label="Member Name" required error={formErrors.name}>
                      <input
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.name ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        value={otName}
                        onChange={e => {
                          setOtName(e.target.value)
                          setFormErrors(prev => ({ ...prev, name: '' }))
                        }}
                        readOnly={disabled}
                        required
                      />
                    </FormField>

                    <FormField label="Position" required error={formErrors.position}>
                      <input
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.position ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        value={otPosition}
                        onChange={e => {
                          setOtPosition(e.target.value)
                          setFormErrors(prev => ({ ...prev, position: '' }))
                        }}
                        placeholder="e.g. Technician / Coordinator"
                        readOnly={disabled}
                        required
                      />
                    </FormField>

                    <FormField label="Department / Branch" required error={formErrors.department}>
                      <input
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.department ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        value={otDepartment}
                        onChange={e => {
                          setOtDepartment(e.target.value)
                          setFormErrors(prev => ({ ...prev, department: '' }))
                        }}
                        placeholder="e.g. TAGUIG SALES"
                        readOnly={disabled}
                        required
                      />
                    </FormField>

                    <FormField label="Cut Off Period" required error={formErrors.cutoff}>
                      <input
                        className={inputCls}
                        style={{
                          ...istyle,
                          ...(formErrors.cutoff ? { borderColor: '#ef4444', borderWidth: 2 } : {}),
                        }}
                        value={otCutoff}
                        onChange={e => {
                          setOtCutoff(e.target.value)
                          setFormErrors(prev => ({ ...prev, cutoff: '' }))
                        }}
                        placeholder="e.g. AUG 16-31"
                        readOnly={disabled}
                        required
                      />
                    </FormField>
                  </div>

                  {/* Overtime Entries Table */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-[11px] font-black uppercase tracking-wider block opacity-80">
                        Overtime Schedule Log <span className="text-red-500 font-bold">*</span>
                      </label>
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => setOtEntries([...otEntries, { dateRequested: '', timeIn: '', reason: '', otFrom: '', otTo: '', approvedBy: '' }])}
                          className="text-xs font-bold flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all hover:opacity-80 cursor-pointer"
                          style={{ backgroundColor: `${accent}18`, color: accent }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Duty Row
                        </button>
                      )}
                    </div>

                    {formErrors.entries && (
                      <p className="text-[11px] font-bold text-red-500 mb-2 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {formErrors.entries}
                      </p>
                    )}

                    <div className="overflow-x-auto rounded-xl border mb-4" style={{ borderColor: border }}>
                      <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 720 }}>
                        <thead>
                          <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }}>
                            <th rowSpan={2} className="px-2.5 py-2 font-black w-10 border-b border-r text-center" style={{ borderColor: border }}>#</th>
                            <th colSpan={4} className="px-3 py-1.5 font-black text-center border-b border-r text-[10px] tracking-wider uppercase" style={{ borderColor: border }}>
                              TO BE FILLED UP BY THE REQUESTER
                            </th>
                            <th colSpan={2} className="px-3 py-1.5 font-black text-center border-b text-[10px] tracking-wider uppercase" style={{ borderColor: border }}>
                              DUTY & APPROVER
                            </th>
                          </tr>
                          <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#0D1528' }}>
                            {['Date Requested', 'Time In', 'Reason for Extending Work Hours', 'OT From', 'OT To', 'Approved By'].map((h, hi) => (
                              <th
                                key={h}
                                className={`px-2.5 py-2 font-black text-left border-b ${hi === 2 ? 'w-52' : ''}`}
                                style={{ borderColor: border }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {otEntries.map((en, i) => (
                            <tr
                              key={i}
                              style={{
                                backgroundColor: i % 2 === 0 ? 'transparent' : (isLight ? '#f8fafc' : '#080E1E'),
                                borderBottom: `1px solid ${border}`,
                              }}
                            >
                              <td className="text-center font-bold px-2 py-1.5 opacity-60 border-r" style={{ borderColor: border }}>{i + 1}</td>
                              {(['dateRequested', 'timeIn', 'reason', 'otFrom', 'otTo', 'approvedBy'] as const).map(field => (
                                <td key={field} className="p-1 border-r last:border-r-0" style={{ borderColor: border }}>
                                  <input
                                    className="w-full px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded-md bg-transparent"
                                    style={{ color: textPrimary, border: `1px solid ${border}` }}
                                    type={field === 'dateRequested' ? 'date' : field.includes('ot') || field === 'timeIn' ? 'time' : 'text'}
                                    value={en[field]}
                                    onChange={e => {
                                      const next = [...otEntries]
                                      next[i] = { ...next[i], [field]: e.target.value }
                                      setOtEntries(next)
                                      setFormErrors(prev => ({ ...prev, entries: '' }))
                                    }}
                                    placeholder={field === 'reason' ? 'Reason for OT…' : field === 'approvedBy' ? 'Approver name' : ''}
                                    readOnly={disabled}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="text-[10px] leading-relaxed mb-6 p-3.5 rounded-xl border" style={{ backgroundColor: isLight ? '#f8fafc' : '#0B132B', color: textMuted, borderColor: border }}>
                    <strong style={{ color: textPrimary }}>Declaration & Labor Compliance:</strong> The employee is under no obligation to work more than 45 hours per week. All overtime is voluntary and may only be worked by agreement between employer and employee and must have written approval first. Maximum permissible overtime is 5 hours in a day if badly needed specially during peak season. I hereby declare above overtime claims are true and correct. ART. 119. False Reporting. — It shall be unlawful for any person to make any statement, report, or record filed or kept pursuant to the provisions of this Code knowing such statement, report or record to be false in any material respect. (P.D. 442, Labor Code)
                  </p>

                  <div className="flex justify-end gap-3 mt-8 pt-4 border-t" style={{ borderColor: border }}>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-6 py-2.5 rounded-xl text-xs font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textPrimary }}
                    >
                      {disabled ? 'Close' : 'Cancel'}
                    </button>
                    {disabled && modal.record && canEditRecord(modal.record as any) && (
                      <button
                        type="button"
                        onClick={() => openRecord('edit', modal.type, modal.record!)}
                        className="px-6 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm transition-transform active:scale-95 cursor-pointer"
                        style={{ backgroundColor: '#2563eb' }}
                      >
                        <Pencil className="w-4 h-4" /> Edit Request
                      </button>
                    )}
                    {!disabled && (
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-7 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm hover:opacity-90 transition-all cursor-pointer"
                        style={{ backgroundColor: accent }}
                      >
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

      {/* Custom Rejection Dialog Modal */}
      {rejectDialog && rejectDialog.isOpen && (
        <div className="fixed inset-0 z-[16000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border p-5 flex flex-col gap-4 animate-fadeIn"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-950/50 text-red-600">
                  <X className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black">Reject Request</h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectDialog(null)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs" style={{ color: textMuted }}>
              Please specify the reason for rejecting this request. The requester will be notified.
            </p>

            <textarea
              rows={3}
              value={rejectDialog.currentReason}
              onChange={e => setRejectDialog({ ...rejectDialog, currentReason: e.target.value })}
              placeholder="Enter rejection reason (e.g. Incomplete details, over budget, please resubmit)..."
              className="w-full p-3 text-xs font-medium rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
              style={istyle}
              autoFocus
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectDialog(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                style={{ color: textMuted }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { type, id, currentReason } = rejectDialog
                  setRejectDialog(null)
                  await handleStatusUpdate(type, id, 'REJECTED', currentReason)
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}
