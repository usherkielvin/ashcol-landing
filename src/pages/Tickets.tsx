import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, CheckCircle, Clock, XCircle, FileText, X, ArrowRight, RefreshCw, ChevronLeft, Circle, MoreVertical } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

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

  const [activeTab, setActiveTab]         = useState('all')
  const [tickets, setTickets]             = useState<Ticket[]>([])
  const [loading, setLoading]             = useState(true)
  const [searchQuery, setSearchQuery]     = useState('')
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [showViewModal, setShowViewModal]   = useState(false)
  const [updateLoading, setUpdateLoading]   = useState(false)
  const [openMenuId, setOpenMenuId]         = useState<string | null>(null)
  const [editingDesc, setEditingDesc]       = useState(false)
  const [descDraft, setDescDraft]           = useState('')
  const [descSaving, setDescSaving]         = useState(false)
  const [menuPosition, setMenuPosition]     = useState<{ top: number; left: number } | null>(null)
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
  const canEditDesc = isAdmin || isManager

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
      const token  = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

      let endpoint = '/tickets'
      if (user?.role?.toLowerCase() === 'customer')  endpoint = '/tickets/my'
      if (user?.role?.toLowerCase() === 'employee') endpoint = '/tickets/assigned'

      const res  = await fetch(`${apiUrl}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Failed to fetch')

      const data = await res.json()
      const tks: Ticket[] = data?.data?.tickets || data?.tickets || []
      setTickets(tks)

      const ticketId = searchParams.get('id')
      if (ticketId) {
        const found = tks.find(t => t.id === ticketId)
        if (found) { setSelectedTicket(found); setShowViewModal(true) }
      }
    } catch (err) {
      console.error('Error fetching tickets:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (user) fetchTickets() }, [user])

  useEffect(() => {
    if (searchParams.get('refresh') === 'true') {
      fetchTickets()
      navigate('/tickets', { replace: true })
    }
  }, [searchParams])

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
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
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t))
      if (selectedTicket?.id === ticketId) setSelectedTicket({ ...selectedTicket, status: newStatus })
    } catch {
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

  // ── Status helpers ────────────────────────────────────────────────────────
  const getStatusStyle = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return { label: 'Pending', color: '#FB923C', bg: 'rgba(251,146,60,0.12)', borderC: 'rgba(251,146,60,0.3)', icon: Clock }
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
    if (activeTab !== 'all' && s !== activeTab) return false
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
            {loading ? 'Loading…' : `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} total`}
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

      {/* ── Filter Tabs ── */}
      <div className="flex p-1 rounded-xl border w-full md:w-fit" style={{ backgroundColor: cardBg, borderColor: border }}>
        {[
          { key: 'all', label: 'All', color: 'slate' },
          { key: 'PENDING', label: 'Pending', color: 'amber' },
          { key: 'IN_PROGRESS', label: 'In Progress', color: 'emerald' },
          { key: 'COMPLETED', label: 'Completed', color: 'blue' }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 md:flex-none px-5 py-2 rounded-lg text-xs font-black transition-all duration-200 uppercase tracking-widest ${
              activeTab === t.key 
                ? t.color === 'emerald' ? 'bg-emerald-500 text-white shadow-md' : t.color === 'amber' ? 'bg-amber-500 text-white shadow-md' : t.color === 'blue' ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-600 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Main Card ─────────────────────────────────────────── */}
      <div className="relative">
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* ── Mobile card list (< md) ───────────────────────────── */}
        <div className="md:hidden flex flex-col">
          {loading ? (
            <div className="p-10 text-center text-sm" style={{ color: textMuted }}>Loading tickets…</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center gap-2">
              <FileText className="w-12 h-12 opacity-20" style={{ color: textMuted }} />
              <h3 className="text-base font-bold" style={{ color: textPrimary }}>No tickets found</h3>
              <p className="text-sm" style={{ color: textMuted }}>Try adjusting your search or filter.</p>
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
                <th style={{ borderColor: border, width: isCustomer ? '18%' : '14%' }} className="px-6 py-3 border-b">Ticket</th>
                <th style={{ borderColor: border, width: isCustomer ? '14%' : '12%' }} className="px-4 py-3 border-b">Service</th>
                {!isCustomer && <th style={{ borderColor: border, width: '14%' }} className="px-4 py-3 border-b">Customer</th>}
                <th style={{ borderColor: border, width: isCustomer ? '28%' : '24%' }} className="px-4 py-3 border-b">Address</th>
                <th style={{ borderColor: border, width: isCustomer ? '15%' : '12%' }} className="px-4 py-3 border-b">Date</th>
                <th style={{ borderColor: border, width: isCustomer ? '16%' : '13%' }} className="px-4 py-3 border-b">Status</th>
                <th style={{ borderColor: border, width: '5%' }} className="px-4 py-3 border-b">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isCustomer ? 6 : 7} className="py-16 text-center text-sm" style={{ color: textMuted }}>Loading tickets…</td></tr>
              ) : filteredTickets.length === 0 ? (
                <tr><td colSpan={isCustomer ? 6 : 7} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
                    <p className="text-sm font-semibold" style={{ color: textPrimary }}>No tickets found</p>
                    <p className="text-xs" style={{ color: textMuted }}>Try adjusting your search or filter.</p>
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
                    {/* Service */}
                    <td className="px-4 py-4">
                      <span className="text-sm" style={{ color: textPrimary }}>{getTicketField(ticket, 'serviceType', 'service_type')}</span>
                    </td>
                    {/* Customer */}
                    {!isCustomer && (
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm truncate font-semibold" style={{ color: textPrimary }}>{ticket.customerName || ticket.customer_name || '—'}</span>
                          {getTicketField(ticket, 'customerEmail', 'customer_email', 'email') !== '—' && (
                            <span className="text-[11px] truncate opacity-80" style={{ color: textMuted }}>{getTicketField(ticket, 'customerEmail', 'customer_email', 'email')}</span>
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
          </div>
        )
      })()}

      {/* ── Detail Screen ─────────────────────────────────────── */}
      {showViewModal && selectedTicket && (() => {
        const st        = getStatusStyle(selectedTicket.status)
        const isPending = selectedTicket.status.toUpperCase() === 'PENDING'
        const canChange = !isCustomer
        const acDetails = parseAcDetails(selectedTicket)
        const infoRows  = [
          { label: 'Customer',   value: getTicketField(selectedTicket, 'customerName', 'customer_name') },
          { label: 'Email',      value: getTicketField(selectedTicket, 'customerEmail', 'customer_email', 'email') },
          { label: 'Phone',      value: getTicketField(selectedTicket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone') },
          { label: 'Address',    value: formatLocation(selectedTicket.location) },
          { label: 'Service',    value: getTicketField(selectedTicket, 'serviceType', 'service_type') },
          { label: 'Unit Type',  value: getTicketField(selectedTicket, 'unitType', 'unit_type') },
          { label: 'Pref. Date', value: formatDate(selectedTicket.preferredDate || selectedTicket.preferred_date) },
          { label: 'Submitted',  value: formatDate(selectedTicket.createdAt || selectedTicket.created_at) },
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

                  {/* Info table */}
                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                    <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted, borderBottom: `1px solid ${border}` }}>
                      Details
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
                      {canEditDesc && !editingDesc && (
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

                  {/* Status controls */}
                  {canChange && (
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                      <div className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: isLight ? '#f8fafc' : '#0F1A2E', color: textMuted, borderBottom: `1px solid ${border}` }}>
                        Update Status
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2">
                        {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => {
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

            {/* ── Footer ── */}
            <div
              className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5"
              style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}
            >
              {isCustomer && isPending ? (
                <button
                  onClick={() => handleDeleteTicket(selectedTicket.id)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all"
                  style={{ backgroundColor: '#EF4444' }}
                >
                  Cancel Ticket
                </button>
              ) : (
                <>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteTicket(selectedTicket.id)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all hover:bg-red-500/10"
                      style={{ color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                  <button
                    onClick={() => { setShowViewModal(false); setEditingDesc(false) }}
                    className="ml-auto px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#10B981] hover:bg-[#059669] transition-all"
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })()}
      </div>
    </div>
  )
}
