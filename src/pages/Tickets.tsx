import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, Trash2, Circle, CheckCircle, Clock, XCircle, FileText, X, Calendar, User, Wrench, Hash, ArrowRight, MoreVertical } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

interface Ticket {
  id: string
  title: string
  description: string
  serviceType: string
  customerName: string
  status: string
  createdAt: string
  preferredDate?: string
}

export default function Tickets() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isLight = theme === 'light'
  
  const [activeTab, setActiveTab] = useState('all')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [updateLoading, setUpdateLoading] = useState(false)
  
  // Create Ticket – navigate to full page
  const openCreate = () => navigate('/tickets/create')

  const fetchTickets = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

      let endpoint = '/tickets'
      if (user?.role?.toLowerCase() === 'customer') endpoint = '/tickets/my'
      if (user?.role?.toLowerCase() === 'employee') endpoint = '/tickets/assigned'
      
      const res = await fetch(`${apiUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch')
      
      const data = await res.json()
      const tks = data?.data?.tickets || data?.tickets || []
      setTickets(tks)

      // Handle deep link if any
      const ticketId = searchParams.get('id')
      if (ticketId) {
        const found = tks.find((t: Ticket) => t.id === ticketId)
        if (found) {
          setSelectedTicket(found)
          setShowViewModal(true)
        }
      }
    } catch (err) {
      console.error('Error fetching tickets:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) fetchTickets()
  }, [user])

  // Refresh when coming from create ticket page
  useEffect(() => {
    if (searchParams.get('refresh') === 'true') {
      fetchTickets()
      // Clean up the URL
      navigate('/tickets', { replace: true })
    }
  }, [searchParams])

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    setUpdateLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

      const res = await fetch(`${apiUrl}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      })
      
      if (!res.ok) throw new Error('Failed to update ticket')
      
      // Update local state
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t))
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status: newStatus })
      }
    } catch (err) {
      console.error('Update status error:', err)
      alert('Could not update ticket status.')
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm('Are you sure you want to delete this ticket?')) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

      const res = await fetch(`${apiUrl}/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) throw new Error('Failed to delete')
      
      setTickets(prev => prev.filter(t => t.id !== ticketId))
      setShowViewModal(false)
    } catch (err) {
      console.error('Delete error:', err)
      alert('Could not delete ticket.')
    }
  }

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg       = isLight ? '#ffffff' : '#0A1120'
  const border       = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary  = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted    = isLight ? '#64748b' : '#7A95B8'
  const rowHover     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const theadBg      = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const inputBg      = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder  = isLight ? '#cbd5e1' : '#243452'
  const tabActiveBg  = isLight ? '#e2e8f0' : '#1E2D48'
  const tabActiveText= isLight ? '#0f172a' : '#ffffff'

  const filteredTickets = tickets.filter(t => {
    // Tab Filter
    const status = t.status.toUpperCase()
    let tabMatch = true
    if (activeTab === 'active') tabMatch = status === 'IN_PROGRESS' || status === 'PENDING' || status === 'ASSIGNED'
    else if (activeTab === 'completed') tabMatch = status === 'COMPLETED'
    
    if (!tabMatch) return false

    // Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const shortId = `ASH${t.id.substring(t.id.length - 4).toUpperCase()}`
      return t.title.toLowerCase().includes(q) || 
             t.id.toLowerCase().includes(q) || 
             shortId.toLowerCase().includes(q) ||
             t.customerName?.toLowerCase().includes(q) ||
             t.serviceType?.toLowerCase().includes(q)
    }

    return true
  })

  const getStatusStyle = (status: string) => {
    const s = status.toUpperCase()
    switch (s) {
      case 'COMPLETED':   return { color: '#3B82F6', background: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.2)', icon: CheckCircle }
      case 'IN_PROGRESS': return { color: '#10B981', background: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)', icon: Clock }
      case 'ASSIGNED':
      case 'PENDING':     return { color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', icon: Clock }
      case 'CANCELLED':   return { color: '#EF4444', background: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)', icon: XCircle }
      default:            return { color: '#94a3b8', background: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', icon: Circle }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight mb-1">Service Tickets</h2>
          <p style={{ color: textMuted }} className="text-sm">Manage and track all customer service requests</p>
        </div>
        <button 
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#10B981] hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold transition-all glow-green-sm text-sm shrink-0"
        >
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>


      {/* ── Ticket Detail Panel ─────────────────────────────────────────────── */}
      {showViewModal && selectedTicket && (() => {
        const st = getStatusStyle(selectedTicket.status)
        const StatusIcon = st.icon
        const isCustomer = user?.role?.toLowerCase() === 'customer'
        const canChangeStatus = !isCustomer
        return (
          <div
            className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center p-0 sm:p-4 md:p-6"
            onClick={() => setShowViewModal(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

            {/* Panel */}
            <div
              className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)] sm:max-w-2xl lg:max-w-3xl shadow-2xl overflow-hidden rounded-none sm:rounded-2xl"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              onClick={e => e.stopPropagation()}
            >
              {/* ── Colored accent header ── */}
              <div
                className="relative flex-shrink-0 px-6 pt-10 pb-6 overflow-hidden"
                style={{ background: isLight
                  ? `linear-gradient(135deg, ${st.background} 0%, #ffffff 100%)`
                  : `linear-gradient(135deg, ${st.background} 0%, #0A1120 100%)`,
                  borderBottom: `1px solid ${border}` }}
              >
                {/* Glow circle */}
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-20 pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${st.color}, transparent 70%)` }} />

                {/* Close */}
                <button
                  onClick={() => setShowViewModal(false)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-red-500/10"
                  style={{ color: textMuted }}
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Icon + title */}
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${st.color}25`, color: st.color }}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-black leading-tight mb-1" style={{ color: textPrimary }}>
                      {selectedTicket.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                        style={{ color: st.color, backgroundColor: st.background, borderColor: st.border }}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {selectedTicket.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] font-mono" style={{ color: textMuted }}>
                        #ASH{selectedTicket.id.substring(selectedTicket.id.length - 4).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Scrollable body ── */}
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

                {/* Info grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Customer */}
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <User className="w-3 h-3" style={{ color: textMuted }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Customer</span>
                    </div>
                    <p className="text-[13px] font-bold leading-snug" style={{ color: textPrimary }}>
                      {selectedTicket.customerName || 'Unknown'}
                    </p>
                  </div>

                  {/* Service type */}
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Wrench className="w-3 h-3" style={{ color: textMuted }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Service</span>
                    </div>
                    <p className="text-[13px] font-bold leading-snug" style={{ color: textPrimary }}>
                      {selectedTicket.serviceType || '—'}
                    </p>
                  </div>

                  {/* Created */}
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Calendar className="w-3 h-3" style={{ color: textMuted }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Created</span>
                    </div>
                    <p className="text-[13px] font-bold leading-snug" style={{ color: textPrimary }}>
                      {new Date(selectedTicket.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Preferred date */}
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Calendar className="w-3 h-3" style={{ color: textMuted }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Pref. Date</span>
                    </div>
                    <p className="text-[13px] font-bold leading-snug" style={{ color: textPrimary }}>
                      {selectedTicket.preferredDate
                        ? new Date(selectedTicket.preferredDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span style={{ color: textMuted }} className="font-normal text-[12px]">Not specified</span>}
                    </p>
                  </div>

                  {/* Ticket ID full */}
                  <div className="sm:col-span-2 rounded-xl p-3.5" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Hash className="w-3 h-3" style={{ color: textMuted }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Ticket ID</span>
                    </div>
                    <p className="text-[11px] font-mono break-all" style={{ color: textMuted }}>
                      ASH{selectedTicket.id.substring(selectedTicket.id.length - 4).toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: textMuted }}>Description</p>
                  <div
                    className="rounded-xl p-4 text-[13px] leading-relaxed min-h-[80px]"
                    style={{ backgroundColor: inputBg, border: `1px solid ${border}`, color: textPrimary }}
                  >
                    {selectedTicket.description || <span style={{ color: textMuted }} className="italic">No description provided.</span>}
                  </div>
                </div>

                {/* Status controls (non-customer only) */}
                {canChangeStatus && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: textMuted }}>Update Status</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => {
                        const isActive = selectedTicket.status.toUpperCase() === s
                        const sStyle = getStatusStyle(s)
                        return (
                          <button
                            key={s}
                            disabled={updateLoading}
                            onClick={() => handleUpdateStatus(selectedTicket.id, s)}
                            className="flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl text-[12px] font-bold border transition-all"
                            style={isActive
                              ? { color: sStyle.color, backgroundColor: sStyle.background, borderColor: sStyle.color }
                              : { color: textMuted, backgroundColor: 'transparent', borderColor: border }
                            }
                          >
                            <span>{s.replace(/_/g, ' ')}</span>
                            {isActive && <ArrowRight className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Sticky footer ── */}
              <div
                className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4"
                style={{ borderTop: `1px solid ${border}`, backgroundColor: cardBg }}
              >
                {(user?.role?.toLowerCase() === 'admin' || isCustomer) ? (
                  <button
                    onClick={() => handleDeleteTicket(selectedTicket.id)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:bg-red-500/10"
                    style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                ) : <div />}
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white bg-[#10B981] hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Main Card */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col overflow-hidden shadow-sm">

        {/* Toolbar */}
        <div style={{ borderColor: border }} className="flex flex-col gap-3 p-4 border-b">

          {/* Search & Filter row */}
          <div className="flex items-center gap-2">
            <div
              style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              className="flex flex-1 items-center border rounded-xl px-3 py-2.5 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all"
            >
              <Search className="w-4 h-4 mr-2 shrink-0" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ color: textPrimary }}
                className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ color: textMuted }} className="ml-1 hover:text-[#EF4444] transition-colors shrink-0">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
              className="p-2.5 border rounded-xl hover:text-[#10B981] hover:border-[#10B981] transition-colors shrink-0"
              title="Filter"
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs row */}
          <div style={{ borderColor: border, backgroundColor: inputBg }} className="flex p-1 border rounded-xl overflow-x-auto">
            {[
              { key: 'all', label: 'All' },
              { key: 'active', label: 'Active' },
              { key: 'completed', label: 'Completed' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={activeTab === key
                  ? { backgroundColor: tabActiveBg, color: tabActiveText }
                  : { color: textMuted }
                }
                className="flex-1 px-3 py-2 text-sm font-bold capitalize rounded-lg transition-all shrink-0 whitespace-nowrap"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table — hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr style={{ backgroundColor: theadBg, color: textMuted }} className="text-xs uppercase tracking-wider font-bold">
                <th style={{ borderColor: border }} className="p-4 pl-6 border-b w-10"></th>
                <th style={{ borderColor: border }} className="p-4 border-b">Ticket Details</th>
                <th style={{ borderColor: border }} className="p-4 border-b">Customer</th>
                <th style={{ borderColor: border }} className="p-4 border-b">Status</th>
                <th style={{ borderColor: border }} className="p-4 pr-6 border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[#7A95B8]">Loading tickets...</td>
                </tr>
              ) : filteredTickets.map((ticket) => {
                const statusTheme = getStatusStyle(ticket.status)
                const StatusIcon = statusTheme.icon
                return (
                  <tr
                    key={ticket.id}
                    style={{ borderColor: border }}
                    className="border-b transition-colors cursor-pointer group"
                    onClick={() => { setSelectedTicket(ticket); setShowViewModal(true) }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = rowHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                  >
                    <td className="p-4 pl-6">
                      <div className="w-10 h-10 rounded-xl bg-[rgba(16,185,129,0.1)] text-[#10B981] flex items-center justify-center">
                        <FileText className="w-5 h-5" />
                      </div>
                    </td>
                    <td className="p-4">
                      <div style={{ color: textPrimary }} className="font-bold mb-1">{ticket.title}</div>
                      <div style={{ color: textMuted }} className="text-xs flex items-center gap-2">
                        <span className="font-semibold">ASH{ticket.id.substring(ticket.id.length - 4).toUpperCase()}</span>
                        <span>•</span>
                        <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div style={{ color: textPrimary }} className="font-semibold">
                        {user?.role?.toLowerCase() === 'customer' ? 'Me' : (ticket.customerName || 'Unknown')}
                      </div>
                    </td>
                    <td className="p-4">
                      <div
                        style={{ color: statusTheme.color, backgroundColor: statusTheme.background, borderColor: statusTheme.border }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full border w-fit"
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        {ticket.status.replace(/_/g, ' ').toUpperCase()}
                      </div>
                    </td>
                    <td className="p-4 pr-6 text-right" onClick={e => e.stopPropagation()}>
                      <button style={{ color: textMuted }} className="p-2 hover:bg-[#10B981]/10 hover:text-[#10B981] rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!loading && filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="w-12 h-12 text-slate-300 dark:text-[#3A5070] mb-3" />
                      <h3 style={{ color: textPrimary }} className="text-lg font-bold">No tickets found</h3>
                      <p style={{ color: textMuted }} className="text-sm mt-1">There are no {activeTab !== 'all' ? activeTab : ''} tickets to display.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List — shown only on mobile */}
        <div className="md:hidden">
          {loading ? (
            <div className="p-10 text-center text-sm" style={{ color: textMuted }}>Loading tickets...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center">
              <FileText className="w-12 h-12 mb-3" style={{ color: textMuted }} />
              <h3 style={{ color: textPrimary }} className="text-base font-bold">No tickets found</h3>
              <p style={{ color: textMuted }} className="text-sm mt-1">There are no {activeTab !== 'all' ? activeTab : ''} tickets to display.</p>
            </div>
          ) : filteredTickets.map((ticket, idx) => {
            const statusTheme = getStatusStyle(ticket.status)
            const StatusIcon = statusTheme.icon
            return (
              <div
                key={ticket.id}
                style={{ borderColor: border }}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer active:opacity-70 transition-opacity${idx < filteredTickets.length - 1 ? ' border-b' : ''}`}
                onClick={() => { setSelectedTicket(ticket); setShowViewModal(true) }}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-[rgba(16,185,129,0.1)] text-[#10B981] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div style={{ color: textPrimary }} className="font-bold text-sm truncate">{ticket.title}</div>
                  <div style={{ color: textMuted }} className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{user?.role?.toLowerCase() === 'customer' ? 'Me' : (ticket.customerName || 'Unknown')}</span>
                    <span>·</span>
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Status badge */}
                <div
                  style={{ color: statusTheme.color, backgroundColor: statusTheme.background, borderColor: statusTheme.border }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-full border shrink-0"
                >
                  <StatusIcon className="w-3 h-3" />
                  <span className="hidden xs:inline">{ticket.status.replace(/_/g, ' ')}</span>
                </div>

                {/* Chevron */}
                <ArrowRight className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
