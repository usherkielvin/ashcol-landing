import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Loader2,
  Calendar,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Download,
  Check,
  Tag,
  Phone,
  MapPin,
  Wrench,
  RotateCcw
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

export interface HistoryPerson {
  id: string
  name: string
  email: string
  personalEmail?: string
  role?: string
  jobTitle?: string
  branchName?: string
}

interface BranchOption { id: string; name: string }

const token = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

const todayYMD = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const formatCurrency = (val: any) => {
  if (val == null || val === '') return '—'
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''))
  if (isNaN(num)) return '—'
  return `₱${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type StatusFilterType = 'ALL' | 'COMPLETED' | 'PENDING' | 'IN_PROGRESS' | 'CANCELLED'

export default function TicketHistoryTable({
  person,
  headerLeft
}: {
  person: HistoryPerson
  headerLeft?: ReactNode
}) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#F8FAFC'
  const textMuted   = isLight ? '#64748b' : '#8FA4C4'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const theadBg     = isLight ? '#f1f5f9' : '#080f1c'

  const [history, setHistory] = useState<any[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState<string>('')
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'this_month' | 'last_month' | 'custom'>('all')
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('ALL')
  const [roleTag, setRoleTag] = useState<'' | 'created' | 'assigned'>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const openDatePicker = () => {
    const el = dateInputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') el.showPicker()
      else el.focus()
    } catch {
      // showPicker() throws if already open
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token()}` } })
        if (!res.ok) return
        const data = await res.json()
        setBranches(data?.data || [])
      } catch {
        // best-effort
      }
    })()
  }, [])

  useEffect(() => {
    const fetchHistory = async () => {
      if (!person.id && !person.name) return
      setLoading(true)
      try {
        const headers = { Authorization: `Bearer ${token()}` }
        const isOwnProfile = person.id === user?.id
        const endpoint = isOwnProfile
          ? `${API_BASE_URL}/tickets/history/mine?size=2000`
          : `${API_BASE_URL}/tickets/history/user/${encodeURIComponent(person.id)}?size=2000`

        let data: any = null
        try {
          const res = await fetch(endpoint, { headers })
          if (res.ok) {
            data = await res.json()
          } else {
            const fallbackRes = await fetch(`${API_BASE_URL}/tickets?branchId=ALL&size=2000`, { headers })
            if (fallbackRes.ok) data = await fallbackRes.json()
          }
        } catch {
          const fallbackRes = await fetch(`${API_BASE_URL}/tickets?branchId=ALL&size=2000`, { headers })
          if (fallbackRes.ok) data = await fallbackRes.json()
        }

        const tickets: any[] = data?.data?.tickets || data?.data?.content || data?.data || []

        const nameNorm = (person.name || '').toLowerCase().trim()
        const personId = (person.id || '').trim().toLowerCase()
        const personEmail = (person.email || '').toLowerCase().trim()
        const personPersonalEmail = (person.personalEmail || '').toLowerCase().trim()
        const nameTokens = nameNorm.split(/\s+/).filter(tok => tok.length > 2)

        const isPersonMatch = (val?: string | null) => {
          if (!val) return false
          const str = String(val).trim().toLowerCase()
          if (!str) return false
          if (personId && str === personId) return true
          if (personEmail && str === personEmail) return true
          if (personPersonalEmail && str === personPersonalEmail) return true
          if (nameNorm && (str === nameNorm || nameNorm.includes(str) || str.includes(nameNorm))) return true
          for (const tok of nameTokens) {
            if (str.includes(tok)) return true
          }
          return false
        }

        const relevant = tickets.filter((t: any) => {
          if (t.customerId === personId || t.customer_id === personId) return true
          if (t.createdByUserId === personId || t.created_by_user_id === personId) return true
          if (isPersonMatch(t.createdBy) || isPersonMatch(t.createdByName)) return true
          if (t.negotiatorId === personId || t.negotiator_id === personId) return true
          if (isPersonMatch(t.negotiatorName)) return true
          if (t.assignedTo === personId || t.assigned_to === personId) return true
          if (isPersonMatch(t.assignedEmployeeName)) return true
          if (t.installerId === personId || t.installer_id === personId) return true
          if (isPersonMatch(t.installerName)) return true
          if (t.driverId === personId || t.driver_id === personId) return true
          if (isPersonMatch(t.driverName)) return true
          if (t.closedBy === personId || t.closed_by === personId || isPersonMatch(t.closedBy)) return true
          if (t.warrantyRegistrationCompletedBy === personId || t.warranty_registration_completed_by === personId || isPersonMatch(t.warrantyRegistrationCompletedBy)) return true
          const customerEmail = (t.customerEmail || t.customer_email || '').toLowerCase().trim()
          if (customerEmail && (customerEmail === personEmail || (personPersonalEmail && customerEmail === personPersonalEmail))) return true
          return isOwnProfile
        })

        const getCreatedTime = (t: any) => {
          const raw = t.createdAt || t.created_at || t.updatedAt || t.updated_at
          if (!raw) return 0
          const time = new Date(raw).getTime()
          return isNaN(time) ? 0 : time
        }

        relevant.sort((a: any, b: any) => {
          const timeA = getCreatedTime(a)
          const timeB = getCreatedTime(b)
          if (timeB !== timeA) return timeB - timeA
          const numA = String(a.ticketNumber || a.ticket_number || a.controlNumber || a.control_number || '')
          const numB = String(b.ticketNumber || b.ticket_number || b.controlNumber || b.control_number || '')
          return numB.localeCompare(numA, undefined, { numeric: true })
        })
        setHistory(relevant)
      } catch (err) {
        console.error('Error loading ticket history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [person.id, person.name, person.email, person.personalEmail, user])

  const normalizeToYMD = (val?: string | null): string => {
    if (!val) return ''
    const trimmed = String(val).trim()
    const matchYMD = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (matchYMD) {
      return `${matchYMD[1]}-${matchYMD[2].padStart(2, '0')}-${matchYMD[3].padStart(2, '0')}`
    }
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return ''
  }

  const getCreatedDateStr = (t: any): string => {
    const raw = t.createdAt || t.created_at
    return normalizeToYMD(raw)
  }

  const getScheduledDateStr = (t: any): string => {
    const raw = t.scheduledDate || t.scheduled_date || t.preferredDate || t.preferred_date || t.finalDate || t.final_date
    return normalizeToYMD(raw)
  }

  const nameNorm = (person.name || '').toLowerCase().trim()
  const personEmail = (person.email || '').toLowerCase().trim()
  const personPersonalEmail = (person.personalEmail || '').toLowerCase().trim()

  const isCreatorOf = (t: any): boolean => {
    if (t.customerId === person.id || t.customer_id === person.id) return true
    if (t.createdByUserId === person.id || t.created_by_user_id === person.id) return true
    if (t.createdBy && t.createdBy.toLowerCase().trim() === nameNorm) return true
    if (t.createdByName && t.createdByName.toLowerCase().trim() === nameNorm) return true
    if (t.createdByName && t.createdByName.toLowerCase().trim() === personEmail) return true
    const customerEmail = (t.customerEmail || t.customer_email || '').toLowerCase().trim()
    if (customerEmail && (customerEmail === personEmail || (personPersonalEmail && customerEmail === personPersonalEmail))) return true
    return false
  }

  const isAssigneeOf = (t: any): boolean => {
    if (t.negotiatorId === person.id || t.negotiator_id === person.id) return true
    if (t.negotiatorName && t.negotiatorName.toLowerCase().trim() === nameNorm) return true
    if (t.assignedTo === person.id || t.assigned_to === person.id) return true
    if (t.assignedEmployeeName && t.assignedEmployeeName.toLowerCase().trim() === nameNorm) return true
    if (t.installerId === person.id || t.installer_id === person.id) return true
    if (t.installerName && t.installerName.toLowerCase().trim() === nameNorm) return true
    if (t.driverId === person.id || t.driver_id === person.id) return true
    if (t.driverName && t.driverName.toLowerCase().trim() === nameNorm) return true
    if (t.closedBy === person.id || t.closed_by === person.id) return true
    if (t.closedBy && (t.closedBy.toLowerCase().trim() === nameNorm || t.closedBy.toLowerCase().trim() === personEmail)) return true
    if (t.warrantyRegistrationCompletedBy === person.id || t.warranty_registration_completed_by === person.id) return true
    if (t.warrantyRegistrationCompletedBy && t.warrantyRegistrationCompletedBy.toLowerCase().trim() === nameNorm) return true
    return false
  }

  const getStatusCategory = (statusRaw?: string): StatusFilterType => {
    const s = (statusRaw || '').toUpperCase().trim()
    if (s === 'COMPLETED' || s === 'INSTALLED' || s === 'CLOSED' || s === 'DONE') return 'COMPLETED'
    if (s === 'IN_PROGRESS' || s === 'IN PROGRESS' || s === 'ONGOING' || s === 'DISPATCHED') return 'IN_PROGRESS'
    if (s === 'CANCELLED' || s === 'CANCELED' || s === 'DECLINED') return 'CANCELLED'
    return 'PENDING'
  }

  // ── Date Preset Handler ───────────────────────────────────────────────────
  const applyDatePreset = (preset: 'all' | 'today' | 'this_month' | 'last_month') => {
    setDatePreset(preset)
    const now = new Date()
    if (preset === 'all') {
      setDateFilter('')
    } else if (preset === 'today') {
      setDateFilter(todayYMD())
    } else if (preset === 'this_month') {
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      setDateFilter(ym)
    } else if (preset === 'last_month') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
      setDateFilter(ym)
    }
  }

  // ── Metrics Calculation across entire history ─────────────────────────────
  const metrics = useMemo(() => {
    let completed = 0
    let pending = 0
    let inProgress = 0
    let cancelled = 0
    let totalCharges = 0

    for (const t of history) {
      const cat = getStatusCategory(t.status)
      if (cat === 'COMPLETED') completed++
      else if (cat === 'IN_PROGRESS') inProgress++
      else if (cat === 'CANCELLED') cancelled++
      else pending++

      const charge = typeof t.installationCharges === 'number'
        ? t.installationCharges
        : typeof t.amountCharged === 'number'
          ? t.amountCharged
          : parseFloat(String(t.installationFee || t.amountCollected || 0).replace(/[^0-9.-]/g, '')) || 0
      totalCharges += charge
    }

    return {
      total: history.length,
      completed,
      pending,
      inProgress,
      cancelled,
      totalCharges,
      completionRate: history.length > 0 ? Math.round((completed / history.length) * 100) : 0
    }
  }, [history])

  // ── Filter logic ───────────────────────────────────────────────────────────
  const displayedHistory = useMemo(() => {
    const target = normalizeToYMD(dateFilter)
    const q = searchQuery.toLowerCase().trim()

    return history.filter(t => {
      // Branch filter
      if (branchFilter && t.branchId !== branchFilter && t.branch_id !== branchFilter) return false

      // Status filter
      if (statusFilter !== 'ALL') {
        const cat = getStatusCategory(t.status)
        if (cat !== statusFilter) return false
      }

      // Role tag filter
      if (roleTag === 'created' && !isCreatorOf(t)) return false
      if (roleTag === 'assigned' && !isAssigneeOf(t)) return false

      // Date filter
      if (dateFilter) {
        const createdD = getCreatedDateStr(t)
        const scheduledD = getScheduledDateStr(t)
        if (dateFilter.length === 7) {
          const matchCreated = createdD.startsWith(dateFilter)
          const matchScheduled = scheduledD.startsWith(dateFilter)
          if (!matchCreated && !matchScheduled) return false
        } else {
          if (createdD !== target && scheduledD !== target) return false
        }
      }

      // Search Query
      if (q) {
        const tNum = String(t.ticketNumber || t.ticket_number || t.controlNumber || t.control_number || '').toLowerCase()
        const custName = String(t.customerName || t.customer_name || '').toLowerCase()
        const phone = String(t.contactPhone || t.customerPhone || t.phone || t.mobile || '').toLowerCase()
        const loc = String(t.cityAddress || t.district || t.destination || '').toLowerCase()
        const unit = String(t.unitType || t.brandCapacity || t.acDetails || '').toLowerCase()
        const remarks = String(t.remarks || t.note || '').toLowerCase()
        const installer = String(t.installerName || '').toLowerCase()

        const match = tNum.includes(q) ||
          custName.includes(q) ||
          phone.includes(q) ||
          loc.includes(q) ||
          unit.includes(q) ||
          remarks.includes(q) ||
          installer.includes(q)
        if (!match) return false
      }

      return true
    })
  }, [history, branchFilter, statusFilter, roleTag, dateFilter, searchQuery])

  const formatBranchNameStr = (raw: string) => {
    if (!raw) return '—'
    return raw.replace(/^ashcol\s+/i, '').trim().toUpperCase()
  }

  const branchName = (t: any) => {
    if (t.branchName || t.branch_name) return formatBranchNameStr(t.branchName || t.branch_name)
    const bId = t.branchId || t.branch_id
    if (!bId) return '—'
    const match = branches.find(b => b.id === bId)
    return match ? formatBranchNameStr(match.name) : bId.toUpperCase()
  }

  const scheduledDate = (t: any) => {
    const raw = t.scheduledDate || t.scheduled_date || t.preferredDate || t.preferred_date || t.finalDate || t.final_date
    if (!raw) return '—'
    const d = new Date(raw)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  }

  const createdDateTime = (t: any) => {
    const raw = t.createdAt || t.created_at
    if (!raw) return '—'
    const d = new Date(raw)
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  }

  // ── CSV & Excel Export ─────────────────────────────────────────────────────
  const copyForExcel = () => {
    if (displayedHistory.length === 0) return
    const headers = ['Ticket No', 'Scheduled Date', 'Status', 'Customer', 'Phone', 'District/Address', 'Unit / AC Details', 'Branch', 'Fee / Charges', 'Remarks']
    const rows = displayedHistory.map(t => [
      t.ticketNumber || t.ticket_number || t.controlNumber || t.id?.slice(0, 8) || '',
      scheduledDate(t),
      (t.status || '').toUpperCase(),
      t.customerName || t.customer_name || '',
      t.contactPhone || t.customerPhone || t.phone || '',
      t.district || t.cityAddress || '',
      t.unitType || t.brandCapacity || t.acDetails || '',
      branchName(t),
      t.installationCharges || t.installationFee || t.amountCollected || '',
      (t.remarks || t.note || '').replace(/[\r\n]+/g, ' ')
    ])
    const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n')
    navigator.clipboard.writeText(tsv)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadCsv = () => {
    if (displayedHistory.length === 0) return
    const headers = ['Ticket No', 'Scheduled Date', 'Status', 'Customer', 'Phone', 'District/Address', 'Unit / AC Details', 'Branch', 'Fee / Charges', 'Remarks']
    const rows = displayedHistory.map(t => [
      `"${(t.ticketNumber || t.ticket_number || t.controlNumber || t.id?.slice(0, 8) || '').replace(/"/g, '""')}"`,
      `"${scheduledDate(t)}"`,
      `"${(t.status || '').toUpperCase()}"`,
      `"${(t.customerName || t.customer_name || '').replace(/"/g, '""')}"`,
      `"${(t.contactPhone || t.customerPhone || t.phone || '').replace(/"/g, '""')}"`,
      `"${(t.district || t.cityAddress || '').replace(/"/g, '""')}"`,
      `"${(t.unitType || t.brandCapacity || t.acDetails || '').replace(/"/g, '""')}"`,
      `"${branchName(t)}"`,
      `"${t.installationCharges || t.installationFee || t.amountCollected || ''}"`,
      `"${(t.remarks || t.note || '').replace(/"/g, '""')}"`
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Tickets_${(person.name || 'Installer').replace(/\s+/g, '_')}_${todayYMD()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent font-sans antialiased text-slate-800 dark:text-slate-100">
      {/* ── KPI Summary Cards (Clean Modern Typography) ───────────────────── */}
      <div className="p-4 sm:p-5 border-b grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0" style={{ borderColor: border, backgroundColor: cardBg }}>
        {/* Total Tickets */}
        <div className="p-3.5 sm:p-4 rounded-xl border flex flex-col justify-between transition-all" style={{ backgroundColor: inputBg, borderColor: border }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Assigned</span>
            <Tag className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight font-number text-slate-900 dark:text-slate-50">{metrics.total}</span>
            <span className="text-xs font-semibold text-slate-500">tickets</span>
          </div>
        </div>

        {/* Completed */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight font-number text-emerald-600 dark:text-emerald-400">{metrics.completed}</span>
            <span className="text-xs font-bold text-emerald-600/80 dark:text-emerald-400/80 font-number">
              ({metrics.completionRate}%)
            </span>
          </div>
        </div>

        {/* Pending / Scheduled */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Pending / Sched</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight font-number text-amber-600 dark:text-amber-400">{metrics.pending}</span>
            <span className="text-xs font-semibold text-amber-600/80 dark:text-amber-400/80">upcoming</span>
          </div>
        </div>

        {/* In Progress */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-blue-500/25 bg-blue-500/5 flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">In Progress</span>
            <Wrench className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight font-number text-blue-600 dark:text-blue-400">{metrics.inProgress}</span>
            <span className="text-xs font-semibold text-blue-600/80 dark:text-blue-400/80">dispatched</span>
          </div>
        </div>
      </div>

      {/* ── Status Tabs & Action Toolbar ───────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0" style={{ borderColor: border, backgroundColor: cardBg }}>
        {/* Status Filter Tabs — an embedding caller (e.g. a modal's own close/back control)
            can prepend something here via headerLeft, otherwise this row starts with the tabs. */}
        <div className="flex items-center gap-3 flex-wrap">
          {headerLeft}
          <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'ALL', label: 'All', count: metrics.total },
              { id: 'COMPLETED', label: 'Completed', count: metrics.completed },
              { id: 'PENDING', label: 'Pending / Scheduled', count: metrics.pending },
              { id: 'IN_PROGRESS', label: 'In Progress', count: metrics.inProgress },
              { id: 'CANCELLED', label: 'Cancelled', count: metrics.cancelled },
            ] as const
          ).map(tab => {
            const isActive = statusFilter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-normal transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold font-number ${
                    isActive
                      ? 'bg-white/20 dark:bg-black/20 text-white dark:text-slate-900'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
          </div>
        </div>

        {/* Quick Export Tools */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyForExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer hover:bg-slate-500/10"
            style={{ borderColor: border, color: textPrimary }}
            title="Copy all shown rows for Excel pasting"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? 'Copied!' : 'Copy Excel'}</span>
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer hover:bg-slate-500/10"
            style={{ borderColor: border, color: textPrimary }}
            title="Download CSV report"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* ── Search & Date Filters Row ───────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0" style={{ borderColor: border, backgroundColor: inputBg }}>
        {/* Search Input */}
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search ticket #, customer, location, unit…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 rounded-lg text-xs font-medium border outline-none transition-all focus:border-emerald-500 placeholder:text-slate-400"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Date Filter & Presets */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Presets */}
          <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800/80 p-0.5 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => applyDatePreset('all')}
              className={`px-2.5 py-1 rounded transition-colors ${datePreset === 'all' && !dateFilter ? 'bg-white dark:bg-slate-900 shadow-xs text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('today')}
              className={`px-2.5 py-1 rounded transition-colors ${datePreset === 'today' ? 'bg-white dark:bg-slate-900 shadow-xs text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('this_month')}
              className={`px-2.5 py-1 rounded transition-colors ${datePreset === 'this_month' ? 'bg-white dark:bg-slate-900 shadow-xs text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('last_month')}
              className={`px-2.5 py-1 rounded transition-colors ${datePreset === 'last_month' ? 'bg-white dark:bg-slate-900 shadow-xs text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
            >
              Last Month
            </button>
          </div>

          {/* Custom Date Input */}
          <div
            onClick={openDatePicker}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          >
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={dateInputRef}
              type="date"
              value={dateFilter}
              onChange={e => {
                setDateFilter(e.target.value)
                setDatePreset('custom')
              }}
              className="bg-transparent outline-none cursor-pointer text-xs font-number font-medium"
              style={{ color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
            />
          </div>

          {/* Branch Filter */}
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold outline-none"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
          </select>

          {/* Reset All */}
          {(dateFilter || branchFilter || roleTag || statusFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setDateFilter('')
                setDatePreset('all')
                setBranchFilter('')
                setRoleTag('')
                setStatusFilter('ALL')
                setSearchQuery('')
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Table Content ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <span className="text-sm font-semibold text-slate-500">Loading assigned tickets…</span>
        </div>
      ) : displayedHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center px-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
            <Wrench className="w-6 h-6 text-slate-400" />
          </div>
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">No assigned tickets found</span>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {searchQuery || statusFilter !== 'ALL' || dateFilter
              ? 'Try adjusting your search or clearing the status and date filters.'
              : 'This installer currently has no logged tickets or service job orders on record.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Counter info */}
          <div className="px-6 py-2.5 shrink-0 flex items-center justify-between text-xs text-slate-500 border-b" style={{ borderColor: border, backgroundColor: cardBg }}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 dark:text-slate-200 font-number">{displayedHistory.length}</span>
              <span className="font-medium">{displayedHistory.length === 1 ? 'ticket displayed' : 'tickets displayed'}</span>
            </div>
            {statusFilter !== 'ALL' && (
              <span className="font-bold uppercase tracking-wider text-[11px] text-emerald-600 dark:text-emerald-400">
                Filtered: {statusFilter.replace('_', ' ')}
              </span>
            )}
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-left" style={{ minWidth: 1080 }}>
              <thead className="sticky top-0 z-10">
                <tr style={{ backgroundColor: theadBg, borderBottom: `1px solid ${border}` }}>
                  {[
                    'Ticket #',
                    'Date / Schedule',
                    'Status',
                    'Customer & Location',
                    'Service / AC Unit',
                    'Branch',
                    'Crew / Driver',
                    'Charges',
                    'Remarks'
                  ].map((h, i, arr) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${
                        i === 0 ? 'text-left' : i === 7 ? 'text-right' : 'text-left'
                      }`}
                      style={{
                        color: textMuted,
                        borderRight: i === arr.length - 1 ? 'none' : `1px solid ${border}`
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedHistory.map((t: any, idx: number) => {
                  const custName = t.customerName || t.customer_name || '—'
                  const phone = t.contactPhone || t.customerPhone || t.phone || t.mobile || ''
                  const loc = t.cityAddress || t.district || t.destination || t.city || ''
                  const tNum = t.ticketNumber || t.ticket_number || t.controlNumber || t.control_number || t.id?.slice(0, 8) || '—'
                  const status = (t.status || '').toUpperCase()
                  const unit = t.unitType || t.brandCapacity || t.acDetails || t.serviceType || '—'
                  const driver = t.driverName || t.driver_name || '—'
                  const remarks = t.remarks || t.remarksUpdate || t.note || ''
                  const cat = getStatusCategory(status)

                  const statusBadge = (() => {
                    if (cat === 'COMPLETED') {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{status || 'COMPLETED'}</span>
                        </span>
                      )
                    }
                    if (cat === 'IN_PROGRESS') {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                          <Wrench className="w-3.5 h-3.5 shrink-0" />
                          <span>{status || 'IN PROGRESS'}</span>
                        </span>
                      )
                    }
                    if (cat === 'CANCELLED') {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{status || 'CANCELLED'}</span>
                        </span>
                      )
                    }
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{status || 'PENDING'}</span>
                      </span>
                    )
                  })()

                  const charges = t.installationCharges != null
                    ? t.installationCharges
                    : t.amountCharged != null
                      ? t.amountCharged
                      : t.installationFee != null
                        ? t.installationFee
                        : t.amountCollected

                  return (
                    <tr
                      key={t.id || idx}
                      className="hover:bg-slate-500/5 transition-colors"
                      style={{
                        borderBottom: `1px solid ${border}`,
                        backgroundColor: idx % 2 === 0 ? inputBg : cardBg
                      }}
                    >
                      {/* Ticket # (Clean bold modern styling) */}
                      <td className="px-4 py-3.5 border-r whitespace-nowrap" style={{ borderColor: border }}>
                        <span className="text-xs font-bold tracking-tight text-emerald-700 dark:text-emerald-400 font-number">
                          {tNum}
                        </span>
                      </td>

                      {/* Date / Schedule */}
                      <td className="px-4 py-3.5 border-r whitespace-nowrap" style={{ borderColor: border }}>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-number">
                            {scheduledDate(t)}
                          </span>
                          <span className="text-[11px] font-medium text-slate-400 font-number mt-0.5">
                            Created: {createdDateTime(t)}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 border-r whitespace-nowrap" style={{ borderColor: border }}>
                        {statusBadge}
                      </td>

                      {/* Customer & Location */}
                      <td className="px-4 py-3.5 border-r min-w-[200px]" style={{ borderColor: border }}>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold uppercase text-slate-900 dark:text-slate-100 tracking-tight">
                            {custName}
                          </span>
                          {phone && (
                            <span className="text-[11px] flex items-center gap-1 font-medium font-number text-slate-500 dark:text-slate-400 mt-0.5">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{phone}</span>
                            </span>
                          )}
                          {loc && (
                            <span className="text-[11px] flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[200px] uppercase">{loc}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Service / AC Unit */}
                      <td className="px-4 py-3.5 border-r min-w-[180px]" style={{ borderColor: border }}>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-tight">
                            {unit}
                          </span>
                          {t.ticketCategory && (
                            <span className="text-[10px] uppercase font-bold text-slate-400 mt-0.5 tracking-wide">
                              {t.ticketCategory}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Branch */}
                      <td className="px-4 py-3.5 border-r whitespace-nowrap" style={{ borderColor: border }}>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                          {branchName(t)}
                        </span>
                      </td>

                      {/* Crew / Driver */}
                      <td className="px-4 py-3.5 border-r whitespace-nowrap" style={{ borderColor: border }}>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                          {driver !== '—' ? driver : '—'}
                        </span>
                      </td>

                      {/* Charges (Tabular numbers for clean alignment) */}
                      <td className="px-4 py-3.5 border-r text-right whitespace-nowrap" style={{ borderColor: border }}>
                        <span className="text-xs font-bold font-number text-slate-900 dark:text-slate-100">
                          {formatCurrency(charges)}
                        </span>
                      </td>

                      {/* Remarks */}
                      <td className="px-4 py-3.5 max-w-[240px]">
                        {remarks ? (
                          <span className="text-xs font-normal line-clamp-2 text-slate-600 dark:text-slate-400" title={remarks}>
                            {remarks}
                          </span>
                        ) : (
                          <span className="text-xs italic text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
