import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, CheckCircle, Clock, XCircle, FileText, X, ArrowRight, RefreshCw, ChevronLeft, Circle, MoreVertical, Check, Mail, Phone, Navigation } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import DateRangeFilter, { type DateRange, buildDateRange, isInDateRange } from '../components/DateRangeFilter'

interface Ticket {
  id: string
  title: string
  description: string
  serviceType?: string
  service_type?: string
  customerName?: string
  customer_name?: string
  customerEmail?: string
  customer_email?: string
  contactPhone?: string
  contact_phone?: string
  customer_phone?: string
  email?: string
  phone?: string
  location?: any
  unitType?: string
  unit_type?: string
  acDetails?: string
  ac_details?: string
  status: string
  createdAt?: string
  created_at?: string
  preferredDate?: string
  preferred_date?: string
  assignedTo?: string
  assigned_employee_name?: string
  assignedEmployeeName?: string
  customerPersonalEmail?: string
  customer_personal_email?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatLocation(loc: any): string {
  if (!loc) return '—'
  if (typeof loc === 'string') {
    const s = loc.trim()
    if (!s) return '—'
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        const p: any = JSON.parse(s)
        const addr = (p?.address ?? '').trim()
        const region = (p?.region ?? '').trim()
        if (addr && region && !addr.toLowerCase().includes(region.toLowerCase())) return `${addr}, ${region}`
        return addr || region || s
      } catch { /* fall through */ }
    }
    if (/lat|lng|long|latitude|longitude/i.test(s)) return '—'
    return s
  }
  const addr = (loc.address ?? '').trim()
  const region = (loc.region ?? '').trim()
  if (addr && region && !addr.toLowerCase().includes(region.toLowerCase())) return `${addr}, ${region}`
  return addr || region || '—'
}

function stripEmbeddedAcDetails(desc: string | undefined | null): string {
  const text = (desc || '').trim()
  if (!text) return '—'
  const marker = '\n\nAC Details - '
  const idx = text.indexOf(marker)
  return idx === -1 ? text : (text.slice(0, idx).trim() || '—')
}

function parseAcDetails(ticket: Ticket): any[] {
  const raw = ticket.acDetails || ticket.ac_details
  if (!raw || typeof raw !== 'string') return []
  try {
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p : []
  } catch { return [] }
}

function getTicketField(ticket: Ticket, ...keys: string[]): string {
  for (const k of keys) {
    const v = (ticket as any)[k]
    if (v && typeof v === 'string' && v.trim()) return v.trim()
  }
  return '—'
}

/** PH-style numbers for tel: links */
function telHref(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.startsWith('63')) return `tel:+${d}`
  if (d.startsWith('0')) return `tel:+63${d.slice(1)}`
  return `tel:+${d}`
}

function shortId(id: string) {
  return `ASH${(id || '').replace(/-/g, '').slice(-6).toUpperCase()}`
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Tickets() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isLight = theme === 'light'

  const [activeTab, setActiveTab]         = useState(() => (searchParams.get('status') || 'all').toUpperCase())
  const [tickets, setTickets]             = useState<Ticket[]>([])
  const [loading, setLoading]             = useState(true)
  const [searchQuery, setSearchQuery]     = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState<'ALL' | 'ASSIGNED_TO_ME' | 'UNASSIGNED'>('ALL')
  const [dateRange, setDateRange] = useState<DateRange>(buildDateRange('ALL'))
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [showViewModal, setShowViewModal]   = useState(false)
  const [updateLoading, setUpdateLoading]   = useState(false)
  const [openMenuId, setOpenMenuId]         = useState<string | null>(null)
  const [editingDesc, setEditingDesc]       = useState(false)
  const [descDraft, setDescDraft]           = useState('')
  const [descSaving, setDescSaving]         = useState(false)
  const [menuPosition, setMenuPosition]     = useState<{ top: number; left: number } | null>(null)
  const [branchTechs, setBranchTechs]       = useState<{ id: string; name: string }[]>([])
  const [assignPick, setAssignPick]         = useState('')
  const [dispatchScores, setDispatchScores] = useState<Array<{ technicianId: string; name: string; score: number; activeTickets: number }>>([])
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const statusParam = (searchParams.get('status') || 'all').toUpperCase()
  const ticketIdParam = searchParams.get('id')

  const setStatusFilter = (statusKey: string) => {
    const next = statusKey.toUpperCase()
    setActiveTab(next)
    const params = new URLSearchParams(searchParams)
    if (next === 'ALL') params.delete('status')
    else params.set('status', next)
    const q = params.toString()
    navigate(q ? `/tickets?${q}` : '/tickets', { replace: true })
  }

  const getEffectiveDate = (t: Ticket): Date | null => {
    const raw = t.preferredDate || t.preferred_date || t.createdAt || t.created_at
    if (!raw) return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const getAllowedStatusTransitions = (ticket: Ticket) => {
    const current = ticket.status.toUpperCase()
    if (isEmployee) {
      switch (current) {
        case 'ASSIGNED': return ['ON_THE_WAY']
        case 'ON_THE_WAY': return ['IN_PROGRESS']
        case 'IN_PROGRESS': return ['COMPLETED']
        default: return []
      }
    }
    if (isManager || isAdmin) {
      const map: Record<string, string[]> = {
        PENDING: ['ASSIGNED', 'CANCELLED'],
        ASSIGNED: ['ON_THE_WAY', 'CANCELLED'],
        ON_THE_WAY: ['IN_PROGRESS', 'CANCELLED'],
        IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      }
      return map[current] || []
    }
    return []
  }

  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
        setMenuPosition(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isCustomer = user?.role?.toLowerCase() === 'customer'
  const isAdmin    = user?.role?.toLowerCase() === 'admin'
  const isManager  = user?.role?.toLowerCase() === 'manager'
  const isEmployee = user?.role?.toLowerCase() === 'employee'

  useEffect(() => {
    if (!isManager || !user) {
      setBranchTechs([])
      return
    }
    const loadTechs = async () => {
      try {
        const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
        const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
        const res = await fetch(`${apiUrl}/user/all?role=EMPLOYEE`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const list = data?.data || []
        setBranchTechs(list.map((u: { id: string; name?: string; email?: string }) => ({
          id: u.id,
          name: u.name || u.email || u.id,
        })))
      } catch {
        setBranchTechs([])
      }
    }
    loadTechs()
  }, [user, isManager])

  // ── Color tokens ─────────────────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#141C2E'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const rowHover    = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const theadBg     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchTickets = async () => {
    try {
      setLoading(true)
      setFetchError(null)
      const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

      let endpoint = '/tickets'
      if (user?.role?.toLowerCase() === 'customer')  endpoint = '/tickets/my'
      if (user?.role?.toLowerCase() === 'employee') endpoint = '/tickets/assigned'

      const pageSize = user?.role?.toLowerCase() === 'employee' ? 100 : 50
      const res  = await fetch(`${apiUrl}${endpoint}?page=0&size=${pageSize}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Failed to fetch')

      const data = await res.json()
      const tks: Ticket[] = data?.data?.tickets || data?.tickets || []
      setTickets(tks)

      const ticketId = searchParams.get('id')
      if (ticketId) {
        const found = tks.find(t => t.id === ticketId)
        if (found) {
          setSelectedTicket(found)
          setShowViewModal(true)
        } else {
          const oneRes = await fetch(`${apiUrl}/tickets/${ticketId}`, { headers: { Authorization: `Bearer ${token}` } })
          if (oneRes.ok) {
            const oneJson = await oneRes.json()
            const t: Ticket = oneJson?.data || oneJson
            if (t?.id) {
              setSelectedTicket(t)
              setShowViewModal(true)
              setTickets(prev => (prev.some(x => x.id === t.id) ? prev : [t, ...prev]))
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching tickets:', err)
      setFetchError('Failed to load tickets. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setActiveTab(statusParam || 'ALL')
  }, [statusParam])

  useEffect(() => { if (user) fetchTickets() }, [user, ticketIdParam, statusParam])

  useEffect(() => {
    if (searchParams.get('refresh') === 'true') {
      fetchTickets()
      const params = new URLSearchParams(searchParams)
      params.delete('refresh')
      const q = params.toString()
      navigate(q ? `/tickets?${q}` : '/tickets', { replace: true })
    }
  }, [searchParams, navigate])

  useEffect(() => {
    if (!selectedTicket) return
    const currentlyAssigned = getTicketField(selectedTicket, 'assignedTo')
    if (currentlyAssigned !== '—' && assignPick !== currentlyAssigned) {
      setAssignPick(currentlyAssigned)
    }
  }, [selectedTicket, assignPick])

  const handleAssignTechnician = async () => {
    if (!selectedTicket || !assignPick) return
    setUpdateLoading(true)
    try {
      const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const pending = selectedTicket.status.toUpperCase() === 'PENDING'
      const body: Record<string, string> = { assignedTo: assignPick }
      if (pending) body.status = 'ASSIGNED'
      const res = await fetch(`${apiUrl}/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('assign failed')
      const payload = await res.json()
      const updated = payload?.data || payload
      const merged = { ...selectedTicket, ...updated, status: updated?.status || selectedTicket.status }
      setSelectedTicket(merged)
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? merged : t))
      setAssignPick('')
    } catch {
      alert('Could not assign technician.')
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    const prevTickets = tickets
    const prevSelected = selectedTicket
    const normalized = newStatus.toUpperCase()
    setTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, status: normalized } : t)))
    if (selectedTicket?.id === ticketId) setSelectedTicket({ ...selectedTicket, status: normalized })
    setUpdateLoading(true)
    try {
      const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const res    = await fetch(`${apiUrl}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      })
      if (!res.ok) throw new Error('Failed to update ticket')
      const payload = await res.json()
      const updated = payload?.data || payload
      setTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, ...updated, status: updated?.status || normalized } : t)))
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, ...updated, status: updated?.status || normalized })
      }
    } catch {
      setTickets(prevTickets)
      setSelectedTicket(prevSelected)
      alert('Could not update ticket status.')
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleSaveDesc = async () => {
    if (!selectedTicket) return
    setDescSaving(true)
    try {
      const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const res    = await fetch(`${apiUrl}/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ description: descDraft })
      })
      if (!res.ok) throw new Error('Failed to update')
      const updated = { ...selectedTicket, description: descDraft }
      setSelectedTicket(updated)
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updated : t))
      setEditingDesc(false)
    } catch {
      alert('Could not save description.')
    } finally {
      setDescSaving(false)
    }
  }

  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm('Are you sure you want to delete this ticket?')) return
    try {
      const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const res    = await fetch(`${apiUrl}/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete')
      setTickets(prev => prev.filter(t => t.id !== ticketId))
      setShowViewModal(false)
    } catch {
      alert('Could not delete ticket.')
    }
  }

  const handleLoadDispatchScores = async () => {
    if (!selectedTicket) return
    setDispatchLoading(true)
    setDispatchError(null)
    try {
      const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const res = await fetch(`${apiUrl}/dispatch/scores/${selectedTicket.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load scores')
      const payload = await res.json()
      const rows = (payload?.data || payload || []) as Array<{ technicianId: string; name: string; score: number; activeTickets: number }>
      setDispatchScores(rows)
    } catch (e) {
      console.error(e)
      setDispatchError('Could not load AI dispatch scores.')
    } finally {
      setDispatchLoading(false)
    }
  }

  const handleAutoAssignBest = async () => {
    if (!selectedTicket) return
    setDispatchLoading(true)
    setDispatchError(null)
    try {
      const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const res = await fetch(`${apiUrl}/dispatch/auto-assign/${selectedTicket.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Auto-assign failed')
      await fetchTickets()
      const oneRes = await fetch(`${apiUrl}/tickets/${selectedTicket.id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (oneRes.ok) {
        const oneJson = await oneRes.json()
        const t: Ticket = oneJson?.data || oneJson
        if (t?.id) setSelectedTicket(t)
      }
    } catch (e) {
      console.error(e)
      setDispatchError('Auto-assign failed. Check threshold/candidate readiness.')
    } finally {
      setDispatchLoading(false)
    }
  }

  // ── Status helpers ────────────────────────────────────────────────────────
  const getStatusStyle = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return { label: 'Pending', color: '#FB923C', bg: 'rgba(251,146,60,0.12)', borderC: 'rgba(251,146,60,0.3)', icon: Clock }
      case 'ASSIGNED':
        return { label: 'Assigned', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', borderC: 'rgba(59,130,246,0.3)', icon: ArrowRight }
      case 'ON_THE_WAY':
        return { label: 'On the way', color: '#06B6D4', bg: 'rgba(6,182,212,0.12)', borderC: 'rgba(6,182,212,0.3)', icon: Navigation }
      case 'IN_PROGRESS':
        return { label: 'In Progress', color: '#10B981', bg: 'rgba(16,185,129,0.12)', borderC: 'rgba(16,185,129,0.3)', icon: RefreshCw }
      case 'COMPLETED':
        return { label: 'Completed', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', borderC: 'rgba(59,130,246,0.3)', icon: CheckCircle }
      case 'CANCELLED':
        return { label: 'Cancelled', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', borderC: 'rgba(239,68,68,0.3)', icon: XCircle }
      default:
        return { label: status, color: textMuted, bg: isLight ? '#f8fafc' : '#0F1A2E', borderC: border, icon: Circle }
    }
  }

  // ── Filter tabs (simplified) ─────────────────────────────────────────────────

  const filteredTickets = tickets.filter(t => {
    const s = t.status.toUpperCase()
    if (activeTab !== 'ALL') {
      if (activeTab === 'IN_PROGRESS') {
        if (s !== 'IN_PROGRESS' && s !== 'ON_THE_WAY') return false
      } else if (s !== activeTab) {
        return false
      }
    }
    if (!isCustomer) {
      const assignee = getTicketField(t, 'assignedTo')
      const assigneeName = getTicketField(t, 'assignedEmployeeName', 'assigned_employee_name').toLowerCase()
      const meName = (user?.name || '').trim().toLowerCase()
      const meEmail = (user?.email || '').trim().toLowerCase()
      if (assignmentFilter === 'ASSIGNED_TO_ME') {
        if (isEmployee) {
          // Employee view already comes from /tickets/assigned; keep these visible.
          if (assignee === '—' && assigneeName === '—') return false
        } else {
          const nameHit = !!meName && (assigneeName === meName || assigneeName.includes(meName))
          const emailHit = !!meEmail && (assigneeName === meEmail || assigneeName.includes(meEmail))
          const idHit = !!meEmail && assignee.toLowerCase() === meEmail
          if (!nameHit && !emailHit && !idHit) return false
        }
      }
      if (assignmentFilter === 'UNASSIGNED' && assignee !== '—') return false
    }
    if (dateRange.preset !== 'ALL') {
      const d = getEffectiveDate(t)
      if (!isInDateRange(d, dateRange)) return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return t.title.toLowerCase().includes(q)
          || t.id.toLowerCase().includes(q)
          || shortId(t.id).toLowerCase().includes(q)
          || (t.customerName ?? '').toLowerCase().includes(q)
          || (t.customer_name ?? '').toLowerCase().includes(q)
          || (t.customerEmail ?? '').toLowerCase().includes(q)
          || (t.customer_email ?? '').toLowerCase().includes(q)
          || (t.email ?? '').toLowerCase().includes(q)
          || (t.serviceType ?? '').toLowerCase().includes(q)
          || (t.service_type ?? '').toLowerCase().includes(q)
          || (t.assignedEmployeeName ?? '').toLowerCase().includes(q)
          || (t.assigned_employee_name ?? '').toLowerCase().includes(q)
    }
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── Page Header ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ color: textPrimary }}>Service Tickets</h2>
          <p className="text-sm" style={{ color: textMuted }}>
            {loading
              ? 'Loading…'
              : isEmployee
                ? `${tickets.length} job${tickets.length !== 1 ? 's' : ''} assigned to you — open one for customer contact details`
                : isManager
                  ? `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} for your branch (customers near your area)`
                  : `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} total`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Search */}
          <div
            style={{ backgroundColor: inputBg, borderColor: inputBorder }}
            className="flex items-center border rounded-xl px-3 py-2.5 w-48 sm:w-56 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all"
          >
            <Search className="w-4 h-4 mr-2 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search tickets…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ color: textPrimary }}
              className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ color: textMuted }} className="ml-1 hover:text-red-400 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={fetchTickets}
            title="Refresh"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
            className="flex items-center gap-2 border px-4 py-2.5 rounded-xl font-bold text-sm hover:text-[#10B981] hover:border-[#10B981] transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          {isCustomer && (
            <button
              onClick={() => navigate('/tickets/create')}
              className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
            >
              <Plus className="w-4 h-4" /> New Ticket
            </button>
          )}
        </div>
      </div>
      {fetchError && tickets.length > 0 && (
        <div
          className="px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-between gap-2"
          style={{ color: '#F59E0B', backgroundColor: isLight ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.16)', borderColor: 'rgba(245,158,11,0.35)' }}
        >
          <span>{fetchError} Showing last loaded tickets.</span>
          <button onClick={fetchTickets} className="px-2 py-1 rounded text-[11px] font-bold text-white bg-[#10B981] hover:bg-[#059669]">Retry</button>
        </div>
      )}

      {/* ── Filter Tabs ── */}
      <div className="flex p-1 rounded-xl border w-full md:w-fit" style={{ backgroundColor: cardBg, borderColor: border }}>
        {[
          { key: 'ALL', label: 'All', color: 'slate' },
          { key: 'PENDING', label: 'Pending', color: 'amber' },
          ...(!isCustomer ? [{ key: 'ASSIGNED', label: 'Assigned', color: 'blue' }] as const : []),
          { key: 'ON_THE_WAY', label: 'OTW', color: 'cyan' },
          { key: 'IN_PROGRESS', label: 'In Progress', color: 'emerald' },
          { key: 'COMPLETED', label: 'Completed', color: 'blue' },
          { key: 'CANCELLED', label: 'Cancelled', color: 'slate' }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`flex-1 md:flex-none px-4 sm:px-5 py-2 rounded-lg text-xs font-black transition-all duration-200 uppercase tracking-widest ${
              activeTab === t.key 
                ? t.color === 'emerald' ? 'bg-emerald-500 text-white shadow-md' : t.color === 'amber' ? 'bg-amber-500 text-white shadow-md' : t.color === 'blue' ? 'bg-blue-500 text-white shadow-md' : t.color === 'cyan' ? 'bg-cyan-500 text-white shadow-md' : 'bg-slate-600 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {!isCustomer && (
          <select
            value={assignmentFilter}
            onChange={e => setAssignmentFilter(e.target.value as 'ALL' | 'ASSIGNED_TO_ME' | 'UNASSIGNED')}
            className="px-3 py-2 rounded-lg border text-xs font-semibold"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="ALL">All assignments</option>
            <option value="ASSIGNED_TO_ME">Assigned to me</option>
            <option value="UNASSIGNED">Unassigned</option>
          </select>
        )}
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* ── Main Card ─────────────────────────────────────────── */}
      <div className="relative">
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* ── Mobile card list (< md) ───────────────────────────── */}
        <div className="md:hidden flex flex-col">
          {loading ? (
            <div className="p-10 text-center text-sm" style={{ color: textMuted }}>Loading tickets…</div>
          ) : fetchError && tickets.length === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center gap-2">
              <FileText className="w-12 h-12 opacity-20" style={{ color: textMuted }} />
              <h3 className="text-base font-bold" style={{ color: textPrimary }}>Could not load tickets</h3>
              <p className="text-sm" style={{ color: textMuted }}>{fetchError}</p>
              <button onClick={fetchTickets} className="mt-1 px-3 py-2 rounded-lg text-xs font-bold text-white bg-[#10B981] hover:bg-[#059669]">Retry</button>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center gap-2">
              <FileText className="w-12 h-12 opacity-20" style={{ color: textMuted }} />
              <h3 className="text-base font-bold" style={{ color: textPrimary }}>{tickets.length === 0 ? 'No tickets yet' : 'No tickets found'}</h3>
              <p className="text-sm" style={{ color: textMuted }}>
                {tickets.length === 0 ? 'No records are available for this view yet.' : 'Try adjusting your search or filter.'}
              </p>
            </div>
          ) : filteredTickets.map((ticket, idx) => {
            const st = getStatusStyle(ticket.status)
            const StatusIcon = st.icon
            return (
              <div
                key={ticket.id}
                style={{ borderColor: border }}
                className={`flex items-center gap-3 px-4 py-4 cursor-pointer active:opacity-70 transition-opacity${idx < filteredTickets.length - 1 ? ' border-b' : ''}`}
                onClick={() => { setSelectedTicket(ticket); setShowViewModal(true) }}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${st.color}18`, color: st.color }}>
                  <FileText className="w-5 h-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate" style={{ color: textPrimary }}>{ticket.title}</div>
                  <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: textMuted }}>
                    <span className="font-mono font-semibold">{shortId(ticket.id)}</span>
                    <span>·</span>
                    {!isCustomer && <><span>{ticket.customerName || 'Unknown'}</span><span>·</span></>}
                    <span>{formatDate(ticket.createdAt || ticket.created_at)}</span>
                  </div>
                  {isEmployee && (ticket.contactPhone || ticket.contact_phone) && (
                    <div className="text-[11px] mt-1 flex items-center gap-1 font-semibold" style={{ color: '#10B981' }}>
                      <Phone className="w-3 h-3 shrink-0" />
                      <span>{ticket.contactPhone || ticket.contact_phone}</span>
                    </div>
                  )}
                  <div className="text-[11px] mt-1 opacity-80 truncate max-w-[200px]" style={{ color: textMuted }}>
                    {formatLocation(ticket.location)}
                  </div>
                </div>

                {/* Status badge */}
                <div
                  style={{ color: st.color, backgroundColor: st.bg, borderColor: st.borderC }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-full border shrink-0"
                >
                  <StatusIcon className="w-3 h-3" />
                  <span className="hidden xs:inline">{st.label}</span>
                </div>

                <ArrowRight className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
              </div>
            )
          })}
        </div>

        {/* ── Desktop table (>= md) ── */}
        <div className="hidden md:block">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr style={{ backgroundColor: theadBg, color: textMuted, borderBottom: `1px solid ${border}` }} className="text-[10px] uppercase tracking-[0.1em] font-black">
                <th style={{ borderColor: border, width: isCustomer ? '18%' : '20%' }} className="px-6 py-3 border-b">Ticket</th>
                {isCustomer && <th style={{ borderColor: border, width: '14%' }} className="px-4 py-3 border-b">Service</th>}
                {!isCustomer && <th style={{ borderColor: border, width: '14%' }} className="px-4 py-3 border-b">Customer</th>}
                <th style={{ borderColor: border, width: '28%' }} className="px-4 py-3 border-b">Address</th>
                <th style={{ borderColor: border, width: isCustomer ? '15%' : '12%' }} className="px-4 py-3 border-b">Date</th>
                <th style={{ borderColor: border, width: isCustomer ? '16%' : '13%' }} className="px-4 py-3 border-b">Status</th>
                <th style={{ borderColor: border, width: '5%' }} className="px-4 py-3 border-b">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center text-sm" style={{ color: textMuted }}>Loading tickets…</td></tr>
              ) : fetchError && tickets.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
                    <p className="text-sm font-semibold" style={{ color: textPrimary }}>Could not load tickets</p>
                    <button onClick={fetchTickets} className="mt-1 px-3 py-2 rounded-lg text-xs font-bold text-white bg-[#10B981] hover:bg-[#059669]">Retry</button>
                  </div>
                </td></tr>
              ) : filteredTickets.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
                    <p className="text-sm font-semibold" style={{ color: textPrimary }}>{tickets.length === 0 ? 'No tickets yet' : 'No tickets found'}</p>
                    <p className="text-xs" style={{ color: textMuted }}>
                      {tickets.length === 0 ? 'No records are available for this view yet.' : 'Try adjusting your search or filter.'}
                    </p>
                  </div>
                </td></tr>
              ) : filteredTickets.map(ticket => {
                const st = getStatusStyle(ticket.status)
                const StatusIcon = st.icon
                const isMenuOpen = openMenuId === ticket.id
                return (
                  <tr
                    key={ticket.id}
                    style={{ borderBottom: `1px solid ${border}` }}
                    className="transition-colors cursor-pointer"
                    onClick={() => { setSelectedTicket(ticket); setShowViewModal(true) }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = rowHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                  >
                    {/* Ticket */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-sm font-mono" style={{ color: textPrimary }}>{shortId(ticket.id)}</div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>{ticket.title}</div>
                    </td>
                    {isCustomer && (
                      <td className="px-4 py-4">
                        <span className="text-sm" style={{ color: textPrimary }}>{getTicketField(ticket, 'serviceType', 'service_type')}</span>
                      </td>
                    )}
                    {/* Customer */}
                    {!isCustomer && (
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm truncate font-semibold" style={{ color: textPrimary }}>{ticket.customerName || ticket.customer_name || '—'}</span>
                          {getTicketField(ticket, 'customerEmail', 'customer_email', 'email') !== '—' && (
                            <span className="text-[11px] truncate opacity-80" style={{ color: textMuted }}>{getTicketField(ticket, 'customerEmail', 'customer_email', 'email')}</span>
                          )}
                          {isEmployee && getTicketField(ticket, 'contactPhone', 'contact_phone') !== '—' && (
                            <span className="text-[11px] truncate flex items-center gap-1 font-semibold" style={{ color: '#10B981' }}>
                              <Phone className="w-3 h-3 shrink-0" />
                              {getTicketField(ticket, 'contactPhone', 'contact_phone')}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {/* Address */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: textMuted }}>
                         <span className="truncate">{formatLocation(ticket.location)}</span>
                      </div>
                    </td>
                    {/* Date */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-xs" style={{ color: textMuted }}>{formatDate(ticket.createdAt || ticket.created_at)}</span>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-4">
                      <div style={{ color: st.color, backgroundColor: st.bg, borderColor: st.borderC }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full border whitespace-nowrap">
                        <StatusIcon className="w-3 h-3" />{st.label}
                      </div>
                    </td>
                    {/* 3-dot menu */}
                    <td className="px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setMenuPosition({
                            top: rect.bottom + window.scrollY + 4,
                            left: rect.right + window.scrollX - 176 // 176px = w-44 width
                          })
                          setOpenMenuId(isMenuOpen ? null : ticket.id)
                        }}
                        className="p-2 rounded-lg transition-colors hover:bg-opacity-80"
                        style={{ color: textMuted }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = rowHover}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Popup Menu (rendered outside table) ─────────────────── */}
      {openMenuId && menuPosition && (() => {
        const ticket = tickets.find(t => t.id === openMenuId)
        if (!ticket) return null
        
        return (
          <div 
            ref={menuRef}
            className="fixed w-44 rounded-lg shadow-2xl z-[100] overflow-hidden"
            style={{ 
              backgroundColor: cardBg, 
              border: `1px solid ${border}`,
              boxShadow: isLight 
                ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' 
                : '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`
            }}
          >
            <button 
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-left transition-all"
              style={{ color: textPrimary }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(16,185,129,0.1)'
                ;(e.currentTarget as HTMLElement).style.color = '#10B981'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.backgroundColor = ''
                ;(e.currentTarget as HTMLElement).style.color = textPrimary
              }}
              onClick={() => { 
                setSelectedTicket(ticket)
                setShowViewModal(true)
                setOpenMenuId(null)
                setMenuPosition(null)
              }}
            >
              <FileText className="w-4 h-4 shrink-0" /> 
              <span>View Details</span>
            </button>
            {isAdmin && (
              <button 
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-left transition-all"
                style={{ color: '#EF4444', borderTop: `1px solid ${border}` }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.1)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = ''
                }}
                onClick={() => { 
                  setOpenMenuId(null)
                  setMenuPosition(null)
                  handleDeleteTicket(ticket.id)
                }}
              >
                <Trash2 className="w-4 h-4 shrink-0" /> 
                <span>Delete</span>
              </button>
            )}
            {isCustomer && ticket.status.toUpperCase() === 'PENDING' && (
              <button 
                type="button"
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-left transition-all"
                style={{ color: '#EF4444', borderTop: `1px solid ${border}` }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.1)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = ''
                }}
                onClick={() => { 
                  setOpenMenuId(null)
                  setMenuPosition(null)
                  handleDeleteTicket(ticket.id)
                }}
              >
                <XCircle className="w-4 h-4 shrink-0" /> 
                <span>Cancel ticket</span>
              </button>
            )}
          </div>
        )
      })()}

      {/* ── Detail Screen ─────────────────────────────────────── */}
      {showViewModal && selectedTicket && (() => {
        const st        = getStatusStyle(selectedTicket.status)
        const isPending = selectedTicket.status.toUpperCase() === 'PENDING'
        const canChange = !isCustomer
        const acDetails = parseAcDetails(selectedTicket)
        const techName = getTicketField(selectedTicket, 'assignedEmployeeName', 'assigned_employee_name')
        const custName = getTicketField(selectedTicket, 'customerName', 'customer_name')
        const emailWork = getTicketField(selectedTicket, 'customerEmail', 'customer_email', 'email')
        const emailPersonal = getTicketField(selectedTicket, 'customerPersonalEmail', 'customer_personal_email')
        const phoneVal = getTicketField(selectedTicket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
        const addrVal = formatLocation(selectedTicket.location)
        const phoneLink = phoneVal !== '—' ? telHref(phoneVal) : null

        const infoRows = [
          ...(isCustomer
            ? [
                { label: 'Customer', value: custName },
                { label: 'Email', value: emailWork },
                { label: 'Phone', value: phoneVal },
              ]
            : []),
          { label: 'Address', value: addrVal },
          { label: 'Service', value: getTicketField(selectedTicket, 'serviceType', 'service_type') },
          { label: 'Unit Type', value: getTicketField(selectedTicket, 'unitType', 'unit_type') },
          { label: 'Pref. Date', value: formatDate(selectedTicket.preferredDate || selectedTicket.preferred_date) },
          { label: 'Submitted', value: formatDate(selectedTicket.createdAt || selectedTicket.created_at) },
          ...(!isCustomer && techName && techName !== '—' ? [{ label: 'Technician', value: techName }] : []),
        ].filter(r => r.value && r.value !== '—')

        return (
          <div
            className="absolute top-0 left-0 right-0 z-10 flex flex-col rounded-2xl overflow-hidden min-h-full"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            {/* ── Header ── */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3.5 gap-3"
              style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0F1A2E' }}
            >
              <button
                onClick={() => { setShowViewModal(false); setEditingDesc(false) }}
                className="flex items-center gap-1.5 text-[13px] font-semibold hover:opacity-60 transition-opacity shrink-0"
                style={{ color: textMuted }}
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-black truncate" style={{ color: textPrimary }}>
                  {selectedTicket.title}
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: st.color, backgroundColor: st.bg }}>
                  {shortId(selectedTicket.id)}
                </span>
              </div>
              <span
                className="shrink-0 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wide text-white"
                style={{ backgroundColor: st.color }}
              >
                {st.label}
              </span>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

                {/* ── Left column ── */}
                <div className="flex flex-col gap-4">

                  {!isCustomer && (
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{
                        border: `1px solid rgba(16,185,129,0.45)`,
                        backgroundColor: isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.09)',
                      }}
                    >
                      <div
                        className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                        style={{ borderBottom: `1px solid ${border}`, color: '#10B981' }}
                      >
                        <span className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 shrink-0" /> Customer contact
                        </span>
                        {selectedTicket.status.toUpperCase() === 'COMPLETED' && (
                          <span className="text-[10px] font-bold normal-case tracking-normal opacity-90" style={{ color: textMuted }}>
                            Job completed — details stay here for your records
                          </span>
                        )}
                      </div>
                      <div className="p-4 flex flex-col gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: textMuted }}>Customer</p>
                          <p className="text-base font-black leading-tight" style={{ color: textPrimary }}>
                            {custName !== '—' ? custName : '—'}
                          </p>
                        </div>
                        {emailWork !== '—' ? (
                          <a
                            href={`mailto:${emailWork}`}
                            className="flex items-start gap-2.5 text-sm font-semibold rounded-lg px-3 py-2 transition-colors hover:opacity-90"
                            style={{ backgroundColor: isLight ? '#ffffff' : '#0F1A2E', color: '#10B981', border: `1px solid ${border}` }}
                          >
                            <Mail className="w-4 h-4 shrink-0 mt-0.5" />
                            <span className="min-w-0 break-all">
                              <span className="text-[10px] font-bold uppercase tracking-wide block mb-0.5" style={{ color: textMuted }}>Account email</span>
                              {emailWork}
                            </span>
                          </a>
                        ) : emailPersonal !== '—' ? (
                          <a
                            href={`mailto:${emailPersonal}`}
                            className="flex items-start gap-2.5 text-sm font-semibold rounded-lg px-3 py-2 transition-colors hover:opacity-90"
                            style={{ backgroundColor: isLight ? '#ffffff' : '#0F1A2E', color: '#10B981', border: `1px solid ${border}` }}
                          >
                            <Mail className="w-4 h-4 shrink-0 mt-0.5" />
                            <span className="min-w-0 break-all">
                              <span className="text-[10px] font-bold uppercase tracking-wide block mb-0.5" style={{ color: textMuted }}>Email</span>
                              {emailPersonal}
                            </span>
                          </a>
                        ) : (
                          <p className="text-xs" style={{ color: textMuted }}>No email on file for this customer.</p>
                        )}
                        {emailPersonal !== '—'
                          && emailWork !== '—'
                          && emailPersonal.trim().toLowerCase() !== emailWork.trim().toLowerCase() && (
                          <a
                            href={`mailto:${emailPersonal}`}
                            className="flex items-start gap-2.5 text-sm font-semibold rounded-lg px-3 py-2 transition-colors hover:opacity-90"
                            style={{ backgroundColor: isLight ? '#ffffff' : '#0F1A2E', color: textPrimary, border: `1px solid ${border}` }}
                          >
                            <Mail className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                            <span className="min-w-0 break-all">
                              <span className="text-[10px] font-bold uppercase tracking-wide block mb-0.5" style={{ color: textMuted }}>Personal email</span>
                              {emailPersonal}
                            </span>
                          </a>
                        )}
                        {phoneVal !== '—' ? (
                          phoneLink ? (
                            <a
                              href={phoneLink}
                              className="flex items-center gap-2.5 text-sm font-bold rounded-lg px-3 py-2 transition-colors hover:opacity-90"
                              style={{ backgroundColor: isLight ? '#ffffff' : '#0F1A2E', color: '#10B981', border: `1px solid ${border}` }}
                            >
                              <Phone className="w-4 h-4 shrink-0" />
                              {phoneVal}
                            </a>
                          ) : (
                            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: textPrimary }}>
                              <Phone className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
                              {phoneVal}
                            </div>
                          )
                        ) : (
                          <p className="text-xs" style={{ color: textMuted }}>No phone on this ticket or customer profile.</p>
                        )}
                        {addrVal !== '—' && (
                          <p className="text-xs leading-relaxed pt-1 border-t" style={{ color: textMuted, borderColor: border }}>
                            <span className="font-bold" style={{ color: textPrimary }}>Service address · </span>
                            {addrVal}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Info table */}
                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                    <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted, borderBottom: `1px solid ${border}` }}>
                      {isCustomer ? 'Details' : 'Job details'}
                    </div>
                    {infoRows.map((row, i) => (
                      <div
                        key={row.label}
                        className="flex items-start gap-3 px-4 py-2.5"
                        style={{ borderBottom: i < infoRows.length - 1 ? `1px solid ${border}` : 'none' }}
                      >
                        <span className="text-[11px] font-bold uppercase tracking-wide w-20 shrink-0 pt-0.5" style={{ color: textMuted }}>
                          {row.label}
                        </span>
                        <span className="text-sm leading-snug flex-1 font-medium" style={{ color: textPrimary }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Description */}
                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                    <div className="px-4 py-2.5 flex items-center justify-between text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted, borderBottom: `1px solid ${border}` }}>
                      <span>Description</span>
                      {(isAdmin || isManager || (isCustomer && isPending)) && !editingDesc && (
                        <button
                          onClick={() => { setDescDraft(stripEmbeddedAcDetails(selectedTicket.description) === '—' ? '' : (selectedTicket.description || '')); setEditingDesc(true) }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors hover:text-[#10B981]"
                          style={{ color: textMuted }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingDesc ? (
                      <div className="p-3 flex flex-col gap-2">
                        <textarea
                          value={descDraft}
                          onChange={e => setDescDraft(e.target.value)}
                          rows={5}
                          className="w-full text-sm rounded-lg px-3 py-2.5 resize-none outline-none focus:ring-1 focus:ring-[#10B981] transition-all"
                          style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', border: `1px solid ${border}`, color: textPrimary }}
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingDesc(false)}
                            disabled={descSaving}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                            style={{ borderColor: border, color: textMuted }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveDesc}
                            disabled={descSaving}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#10B981] hover:bg-[#059669] transition-all disabled:opacity-60"
                          >
                            {descSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: stripEmbeddedAcDetails(selectedTicket.description) === '—' ? textMuted : textPrimary }}>
                        {stripEmbeddedAcDetails(selectedTicket.description) !== '—' ? stripEmbeddedAcDetails(selectedTicket.description) : 'No description.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Right column ── */}
                <div className="flex flex-col gap-4">

                  {/* AC Configuration */}
                  {acDetails.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                      <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: '#10B981', borderBottom: `1px solid ${border}` }}>
                        AC Configuration
                      </div>
                      <div className="p-3 flex flex-col gap-2">
                        {acDetails.map((unit: any, uIdx: number) => {
                          const unitLabel = unit?.unitType || `Unit ${uIdx + 1}`
                          const qty       = unit?.quantity || 1
                          const rows      = Array.isArray(unit?.details) ? unit.details : []
                          return (
                            <div key={uIdx} className="rounded-lg p-3" style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: `1px solid ${border}` }}>
                              <p className="text-xs font-black mb-2" style={{ color: textPrimary }}>{unitLabel} ×{qty}</p>
                              {rows.map((d: any, dIdx: number) => {
                                const chips: string[] = []
                                if (d?.brand)      chips.push(`Brand: ${d.brand}`)
                                if (d?.hp)         chips.push(`HP: ${d.hp}`)
                                if (d?.technology) chips.push(`Tech: ${d.technology}`)
                                if (d?.subtype)    chips.push(`Subtype: ${d.subtype}`)
                                if (d?.feature && d.feature !== 'No special feature') chips.push(`Feature: ${d.feature}`)
                                if (d?.issueType)  chips.push(`Issue: ${d.issueType}`)
                                if (d?.refrigerant)chips.push(`Ref: ${d.refrigerant}`)
                                if (d?.voltage)    chips.push(`Volt: ${d.voltage}`)
                                if (d?.ageRange)   chips.push(`Age: ${d.ageRange}`)
                                return (
                                  <div key={dIdx} className="mb-1 last:mb-0">
                                    {rows.length > 1 && <p className="text-[10px] font-black mb-1" style={{ color: textMuted }}>{unitLabel} #{dIdx + 1}</p>}
                                    {chips.length ? (
                                      <div className="flex flex-wrap gap-1.5">
                                        {chips.map(chip => (
                                          <span key={chip} className="px-2 py-0.5 rounded-full text-[11px] font-bold border"
                                            style={{ color: isLight ? '#215531' : '#9FE6B3', backgroundColor: isLight ? '#ECFDF3' : 'rgba(56,180,93,0.14)', borderColor: isLight ? '#BFE7CB' : 'rgba(56,180,93,0.34)' }}>
                                            {chip}
                                          </span>
                                        ))}
                                      </div>
                                    ) : <p className="text-xs" style={{ color: textMuted }}>No extra details</p>}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Assign technician (branch manager) */}
                  {isManager && branchTechs.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                      <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted, borderBottom: `1px solid ${border}` }}>
                        Assign technician
                      </div>
                      <div className="p-3 flex flex-col gap-2">
                        <p className="text-[11px] leading-snug" style={{ color: textMuted }}>
                          Tickets here are for your branch (including customers matched to your service area). Choose a technician to dispatch.
                        </p>
                        <select
                          value={assignPick}
                          onChange={e => setAssignPick(e.target.value)}
                          disabled={updateLoading}
                          className="w-full text-sm rounded-lg px-3 py-2.5 outline-none border"
                          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                        >
                          <option value="">Select technician…</option>
                          {branchTechs.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={updateLoading || !assignPick}
                          onClick={handleAssignTechnician}
                          className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {updateLoading ? 'Saving…' : 'Assign'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Dispatch scoring + auto-assign (admin/manager, pending only) */}
                  {(isPending && (isManager || isAdmin)) && (
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                      <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted, borderBottom: `1px solid ${border}` }}>
                        AI Dispatch
                      </div>
                      <div className="p-3 flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleLoadDispatchScores}
                            disabled={dispatchLoading}
                            className="py-2.5 rounded-lg text-xs font-bold border transition-all"
                            style={{ color: textPrimary, borderColor: border, backgroundColor: inputBg }}
                          >
                            {dispatchLoading ? 'Loading…' : 'Load AI Scores'}
                          </button>
                          <button
                            type="button"
                            onClick={handleAutoAssignBest}
                            disabled={dispatchLoading}
                            className="py-2.5 rounded-lg text-xs font-bold text-white bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 transition-all"
                          >
                            Auto-Assign Best
                          </button>
                        </div>
                        {dispatchError && (
                          <p className="text-xs font-semibold" style={{ color: '#EF4444' }}>{dispatchError}</p>
                        )}
                        {dispatchScores.length > 0 && (
                          <div className="rounded-lg border overflow-hidden" style={{ borderColor: border }}>
                            {dispatchScores.slice(0, 4).map((row, i) => (
                              <div
                                key={row.technicianId}
                                className="px-3 py-2.5 flex items-center justify-between text-xs"
                                style={{ borderBottom: i < Math.min(3, dispatchScores.length - 1) ? `1px solid ${border}` : 'none' }}
                              >
                                <span style={{ color: textPrimary }} className="font-semibold truncate mr-3">{row.name}</span>
                                <span style={{ color: textMuted }} className="shrink-0">
                                  Score <span style={{ color: '#10B981' }} className="font-black">{Number(row.score).toFixed(2)}</span> · Active {row.activeTickets}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status controls */}
                  {canChange && (
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                      <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted, borderBottom: `1px solid ${border}` }}>
                        Update Status
                      </div>
                      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {getAllowedStatusTransitions(selectedTicket).length === 0 && (
                          <p className="col-span-full text-xs font-medium" style={{ color: textMuted }}>
                            No status actions available for this ticket in your role.
                          </p>
                        )}
                        {getAllowedStatusTransitions(selectedTicket).map(s => {
                          const sStyle  = getStatusStyle(s)
                          const isActiveS = selectedTicket.status.toUpperCase() === s
                          return (
                            <button
                              key={s}
                              disabled={updateLoading}
                              onClick={() => handleUpdateStatus(selectedTicket.id, s)}
                              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[12px] font-bold border transition-all"
                              style={isActiveS
                                ? { color: sStyle.color, backgroundColor: sStyle.bg, borderColor: sStyle.color }
                                : { color: textMuted, backgroundColor: 'transparent', borderColor: border }
                              }
                            >
                              <span>{sStyle.label}</span>
                              {isActiveS && <ArrowRight className="w-3 h-3 shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ── Footer: compact corner actions (same pattern for customers as staff) ── */}
            <div
              className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3"
              style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}
            >
              <div className="flex items-center min-h-[36px]">
                {isCustomer && isPending && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTicket(selectedTicket.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all hover:bg-red-500/10"
                    style={{ color: '#EF4444', borderColor: 'rgba(239,68,68,0.35)' }}
                  >
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    Cancel
                  </button>
                )}
                {!isCustomer && isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTicket(selectedTicket.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all hover:bg-red-500/10"
                    style={{ color: '#EF4444', borderColor: 'rgba(239,68,68,0.35)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    Delete
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setShowViewModal(false); setEditingDesc(false) }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-[#10B981] hover:bg-[#059669] transition-all shrink-0"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                Done
              </button>
            </div>
          </div>
        )
      })()}
      </div>
    </div>
  )
}
