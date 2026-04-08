import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, Trash2, Circle, CheckCircle, Clock, XCircle, FileText, X, ArrowRight, MoreVertical, ChevronLeft } from 'lucide-react'
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
  contactPhone?: string
  contact_phone?: string
  customer_phone?: string
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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
      const shortId = `ASH${(t.id || '').replace(/-/g, '').slice(-6).toUpperCase()}`
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
        const isCustomer = user?.role?.toLowerCase() === 'customer'
        const isPending = selectedTicket.status.toUpperCase() === 'PENDING'
        const canChangeStatus = !isCustomer
        return (
          <div
            className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center p-0 sm:p-4 md:p-6"
            onClick={() => setShowViewModal(false)}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)] sm:max-w-xl shadow-2xl overflow-hidden rounded-none sm:rounded-2xl"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              onClick={e => e.stopPropagation()}
            >
              {/* ── Header bar ── */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0F1A2E' }}>
                <button onClick={() => setShowViewModal(false)} className="flex items-center gap-1.5 text-[13px] font-semibold transition-opacity hover:opacity-60" style={{ color: textMuted }}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <span className="text-[12px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Ticket Details</span>
                <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase" style={{ backgroundColor: st.color, color: '#fff' }}>
                  {selectedTicket.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* ── Scrollable body ── */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

                {/* Main info card */}
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${border}`, backgroundColor: cardBg }}>
                  <div className="px-4 flex flex-col">
                    {[
                      { label: 'Ticket ID:', value: `ASH${(selectedTicket.id || '').replace(/-/g, '').slice(-6).toUpperCase()}` },
                      { label: 'Customer:', value: getTicketField(selectedTicket, 'customerName', 'customer_name') },
                      { label: 'Phone:',    value: getTicketField(selectedTicket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone') },
                      { label: 'Address:',  value: formatLocation(selectedTicket.location) },
                    ].map((row, i, arr) => (
                      <div key={row.label} className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${border}` : 'none' }}>
                        <span className="text-[13px] shrink-0 min-w-[90px]" style={{ color: textMuted }}>{row.label}</span>
                        <span className="text-[13px] font-semibold text-right leading-snug" style={{ color: textPrimary }}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Service Details */}
                  <div className="px-4 pt-3 pb-3" style={{ borderTop: `1px solid ${border}` }}>
                    <p className="text-[14px] font-black mb-2" style={{ color: '#10B981' }}>Service Details</p>
                    {[
                      { label: 'Service Type:',  value: getTicketField(selectedTicket, 'serviceType', 'service_type') },
                      { label: 'Unit Type:',     value: getTicketField(selectedTicket, 'unitType', 'unit_type') },
                      { label: 'Other details:', value: stripEmbeddedAcDetails(selectedTicket.description) },
                    ].map((row, i, arr) => (
                      <div key={row.label} className="flex items-start justify-between gap-4 py-2" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${border}` : 'none' }}>
                        <span className="text-[13px] shrink-0 min-w-[100px]" style={{ color: textMuted }}>{row.label}</span>
                        <span className="text-[13px] font-semibold text-right leading-snug" style={{ color: textPrimary }}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* AC Configuration */}
                  {(() => {
                    const acDetails = parseAcDetails(selectedTicket)
                    if (!acDetails.length) return null
                    return (
                      <div className="px-4 pt-3 pb-3" style={{ borderTop: `1px solid ${border}` }}>
                        <p className="text-[14px] font-black mb-2" style={{ color: '#10B981' }}>AC Configuration</p>
                        <div className="flex flex-col gap-2">
                          {acDetails.map((unit: any, uIdx: number) => {
                            const unitLabel = unit?.unitType || `Unit ${uIdx + 1}`
                            const qty = unit?.quantity || 1
                            const rows = Array.isArray(unit?.details) ? unit.details : []
                            return (
                              <div key={uIdx} className="rounded-xl p-3" style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)', border: `1px solid ${border}` }}>
                                <p className="text-[12px] font-black mb-2" style={{ color: textPrimary }}>{unitLabel} x{qty}</p>
                                {rows.map((d: any, dIdx: number) => {
                                  const chips: string[] = []
                                  if (d?.brand) chips.push(`Brand: ${d.brand}`)
                                  if (d?.hp) chips.push(`HP: ${d.hp}`)
                                  if (d?.technology) chips.push(`Tech: ${d.technology}`)
                                  if (d?.subtype) chips.push(`Subtype: ${d.subtype}`)
                                  if (d?.feature && d.feature !== 'No special feature') chips.push(`Feature: ${d.feature}`)
                                  if (d?.issueType) chips.push(`Issue: ${d.issueType}`)
                                  if (d?.refrigerant) chips.push(`Ref: ${d.refrigerant}`)
                                  if (d?.voltage) chips.push(`Volt: ${d.voltage}`)
                                  if (d?.ageRange) chips.push(`Age: ${d.ageRange}`)
                                  return (
                                    <div key={dIdx} className="rounded-lg p-2.5 mb-1 last:mb-0" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                                      {rows.length > 1 && <p className="text-[11px] font-black mb-1.5" style={{ color: textMuted }}>{unitLabel} #{dIdx + 1}</p>}
                                      {chips.length ? (
                                        <div className="flex flex-wrap gap-1.5">
                                          {chips.map(chip => (
                                            <span key={chip} className="px-2.5 py-1 rounded-full text-[11px] font-bold border"
                                              style={{ color: isLight ? '#215531' : '#9FE6B3', backgroundColor: isLight ? '#ECFDF3' : 'rgba(56,180,93,0.14)', borderColor: isLight ? '#BFE7CB' : 'rgba(56,180,93,0.34)' }}>
                                              {chip}
                                            </span>
                                          ))}
                                        </div>
                                      ) : <p className="text-[12px]" style={{ color: textMuted }}>No extra details</p>}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Preferred Date */}
                  <div className="px-4 flex items-center justify-between py-3" style={{ borderTop: `1px solid ${border}` }}>
                    <span className="text-[13px]" style={{ color: textMuted }}>Preferred Date:</span>
                    <span className="text-[13px] font-semibold" style={{ color: textPrimary }}>
                      {(selectedTicket.preferredDate || selectedTicket.preferred_date)
                        ? new Date((selectedTicket.preferredDate || selectedTicket.preferred_date)!).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Status controls (non-customer only) */}
                {canChangeStatus && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: textMuted }}>Update Status</p>
                    <div className="grid grid-cols-2 gap-2">
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

              {/* ── Footer ── */}
              <div className="flex-shrink-0 px-4 py-4" style={{ borderTop: `1px solid ${border}`, backgroundColor: cardBg }}>
                {isCustomer && isPending ? (
                  <button
                    onClick={() => handleDeleteTicket(selectedTicket.id)}
                    className="w-full py-3.5 rounded-2xl text-[15px] font-black text-white transition-all"
                    style={{ backgroundColor: '#EF4444', boxShadow: '0 8px 24px rgba(239,68,68,0.35)' }}
                  >
                    Cancel Ticket
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    {user?.role?.toLowerCase() === 'admin' && (
                      <button
                        onClick={() => handleDeleteTicket(selectedTicket.id)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:bg-red-500/10"
                        style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    )}
                    <button
                      onClick={() => setShowViewModal(false)}
                      className="ml-auto px-6 py-2.5 rounded-xl text-[13px] font-bold text-white bg-[#10B981] hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
                    >
                      Done
                    </button>
                  </div>
                )}
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
                {user?.role?.toLowerCase() !== 'customer' && (
                  <th style={{ borderColor: border }} className="p-4 border-b">Address</th>
                )}
                <th style={{ borderColor: border }} className="p-4 border-b">Status</th>
                <th style={{ borderColor: border }} className="p-4 pr-6 border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={user?.role?.toLowerCase() !== 'customer' ? 6 : 5} className="p-12 text-center text-[#7A95B8]">Loading tickets...</td>
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
                        <span className="font-semibold">ASH{(ticket.id || '').replace(/-/g, '').slice(-6).toUpperCase()}</span>
                        <span>•</span>
                        <span>{ticket.createdAt || ticket.created_at ? new Date((ticket.createdAt || ticket.created_at)!).toLocaleDateString() : '—'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div style={{ color: textPrimary }} className="font-semibold text-sm">
                        {user?.role?.toLowerCase() === 'customer' ? 'Me' : (ticket.customerName || 'Unknown')}
                      </div>
                    </td>
                    {user?.role?.toLowerCase() !== 'customer' && (
                      <td className="p-4">
                        <div style={{ color: textMuted }} className="text-xs leading-relaxed">
                          {formatLocation(ticket.location) || '—'}
                        </div>
                      </td>
                    )}
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
                  <td colSpan={user?.role?.toLowerCase() !== 'customer' ? 6 : 5} className="p-12 text-center">
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
                    <span>{ticket.createdAt || ticket.created_at ? new Date((ticket.createdAt || ticket.created_at)!).toLocaleDateString() : '—'}</span>
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
