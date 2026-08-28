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
  const autoBranch = modal?.mode === 'add' && !!user?.branchId

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
          <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap" style={{ borderBottom: `1px solid ${border}` }}>
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
                      className="rounded-md px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] font-bold transition-all"
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

          <div className="p-2 sm:p-6 md:p-10">
              <div
                className="max-w-6xl mx-auto rounded-lg sm:rounded-xl shadow-none sm:shadow-lg p-3 sm:p-8 md:p-12 border-0 sm:border"
                style={{ backgroundColor: paperBg, borderColor: isLight ? '#d1d5db' : border }}
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
                    {/* Top Row: Status badge, Admin Quick Action buttons, Status Dropdown, and Withdraw/Delete */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5" style={{ borderBottom: `1px solid ${border}` }}>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ backgroundColor: isLight ? '#e2e8f0' : '#172544', color: textMuted }}>
                          STATUS
                        </span>

                        {/* Current status pill or admin dropdown */}
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

                        {/* Admin Quick Status Actions in View Tab */}
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
                                title="Reject this request"
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            )}
                            {modal.type === 'cash-advance' && modal.record.status === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={() => handleStatusUpdate('cash-advance', modal.record!.id, 'DISBURSED')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm transition-transform active:scale-95 hover:opacity-90 cursor-pointer"
                                style={{ backgroundColor: '#4f46e5' }}
                                title="Mark as Disbursed"
                              >
                                <Check className="w-3 h-3" /> Mark Disbursed
                              </button>
                            )}
                            {modal.type === 'cash-advance' && modal.record.status === 'DISBURSED' && (
                              <button
                                type="button"
                                onClick={() => handleStatusUpdate('cash-advance', modal.record!.id, 'FULLY_PAID')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm transition-transform active:scale-95 hover:opacity-90 cursor-pointer"
                                style={{ backgroundColor: '#0d9488' }}
                                title="Mark as Fully Paid"
                              >
                                <Check className="w-3 h-3" /> Mark Fully Paid
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right side: Delete / Withdraw */}
                      <div className="flex items-center gap-2">
                        {canDeleteAsOwner(modal.record) && (
                          <button
                            type="button"
                            onClick={() => {
                              closeModal()
                              requestDeleteRecord(modal!.type, modal!.record!.id, (modal!.record as any).payeeName || (modal!.record as any).purpose || (modal!.record as any).cutoffPeriod || modal!.type)
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                            style={{ backgroundColor: '#dc2626' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Withdraw Request
                          </button>
                        )}
                        {isAdmin && !canDeleteAsOwner(modal.record) && (
                          <button
                            type="button"
                            onClick={() => {
                              closeModal()
                              requestDeleteRecord(modal!.type, modal!.record!.id, (modal!.record as any).payeeName || (modal!.record as any).purpose || (modal!.record as any).cutoffPeriod || modal!.type)
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-red-300 dark:border-red-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Rejection Reason Alert if rejected */}
                    {modal.record.status === 'REJECTED' && (modal.record as any).rejectionReason && (
                      <div
                        className="p-3 rounded-lg flex items-start gap-2.5"
                        style={{
                          backgroundColor: isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.1)',
                          border: `1px solid ${isLight ? '#fecaca' : 'rgba(239, 68, 68, 0.25)'}`,
                          color: isLight ? '#dc2626' : '#f87171',
                        }}
                      >
                        <CircleX className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="flex-1 text-xs">
                          <div className="font-bold uppercase tracking-wider text-[10px]">Rejection Reason</div>
                          <div className="font-medium mt-0.5">{(modal.record as any).rejectionReason}</div>
                        </div>
                      </div>
                    )}

                    {/* Notes / Remarks Section */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" style={{ color: accent }} />
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                            Notes / Remarks for Requester:
                          </span>
                        </div>
                        {isAdmin && !isEditingModalNotes && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalNotesInput((modal.record as any).notes || '')
                              setIsEditingModalNotes(true)
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

                          {/* Quick preset templates */}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-6">
                      <FormField label="Member Name">
                        <input
                          className={`${inputCls} uppercase`}
                          style={istyle}
                          value={(modal.record ? getRequesterName(modal.record.employeeId) : (user?.name || '')).toUpperCase()}
                          readOnly
                        />
                      </FormField>
                      <FormField label="Branch" required>
                        {autoBranch ? (
                          <input className={inputCls} style={istyle} value={getBranchLabel(user?.branchId)} readOnly />
                        ) : (
                          <select className={inputCls} style={istyle} value={caBranchId} onChange={e => setCaBranchId(e.target.value)} disabled={disabled} required>
                            <option value="">Select branch…</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                            {caBranchId && !findBranchListEntry(caBranchId, branches) && (
                              <option value={caBranchId}>{getBranchLabel(caBranchId)}</option>
                            )}
                          </select>
                        )}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-5 text-xs">
                      <FormField label="To">
                        <input className={inputCls} style={istyle} value="Finance / Accounting Dept" readOnly />
                      </FormField>
                      <FormField label="Date" required>
                        <input className={inputCls} style={istyle} type="date" value={budgetDate} onChange={e => setBudgetDate(e.target.value)} disabled={disabled} required />
                      </FormField>
                      <FormField label="From — Branch" required>
                        {autoBranch ? (
                          <input className={inputCls} style={istyle} value={budgetBranch} readOnly />
                        ) : (
                          <select className={inputCls} style={istyle} value={budgetBranch} onChange={e => setBudgetBranch(e.target.value)} disabled={disabled} required>
                            <option value="">Select branch…</option>
                            {branches.map(b => <option key={b.id} value={b.name.toUpperCase()}>{b.name.toUpperCase()}</option>)}
                          </select>
                        )}
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
                      <input className="inline-block w-28 px-1 py-0.5 text-xs font-semibold focus:outline-none" style={{ ...istyle, borderRadius: 4 }} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={disabled} />
                      {' '}as payment for the ff:
                    </p>

                    <div className="overflow-x-auto -mx-1 sm:mx-0 mb-2">
                      <table className="w-full text-xs min-w-[340px]" style={{ borderCollapse: 'collapse' }}>
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
                    </div>
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

                    {/* Actions */}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-5">
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

                    {/* Actions */}
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
