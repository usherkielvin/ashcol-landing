import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, MoreVertical, Circle, CheckCircle, Clock, XCircle, FileText, X } from 'lucide-react'
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
      const token = sessionStorage.getItem('ashcol-token')
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

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    setUpdateLoading(true)
    try {
      const token = sessionStorage.getItem('ashcol-token')
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
      const token = sessionStorage.getItem('ashcol-token')
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
      return t.title.toLowerCase().includes(q) || 
             t.id.toLowerCase().includes(q) || 
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


      {showViewModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div style={{ backgroundColor: cardBg, borderColor: border }} className="relative w-full max-w-2xl rounded-2xl border p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowViewModal(false)} className="absolute top-6 right-6 text-[#7A95B8] hover:text-[#EF4444] transition-colors">
              <X className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(16,185,129,0.1)] text-[#10B981] flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 style={{ color: textPrimary }} className="text-2xl font-bold">{selectedTicket.title}</h3>
                <p style={{ color: textMuted }} className="text-sm font-mono uppercase">Ticket #{selectedTicket.id.substring(0, 12)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-[11px] font-bold text-[#7A95B8] uppercase tracking-wider mb-2">Description</label>
                  <p style={{ color: textPrimary }} className="text-sm leading-relaxed bg-[#f8fafc] dark:bg-[#0F1A2E] p-4 rounded-xl border border-[#e2e8f0] dark:border-[#243452]">
                    {selectedTicket.description || 'No description provided.'}
                  </p>
                </div>
                <div className="flex gap-6">
                  <div>
                    <label className="block text-[11px] font-bold text-[#7A95B8] uppercase tracking-wider mb-2">Customer</label>
                    <p style={{ color: textPrimary }} className="font-bold">{selectedTicket.customerName || 'Unknown'}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#7A95B8] uppercase tracking-wider mb-2">Created On</label>
                    <p style={{ color: textPrimary }} className="font-bold">{new Date(selectedTicket.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                <div className="flex gap-6">
                  <div>
                    <label className="block text-[11px] font-bold text-[#7A95B8] uppercase tracking-wider mb-2">Service Type</label>
                    <p style={{ color: textPrimary }} className="font-bold">{selectedTicket.serviceType}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#7A95B8] uppercase tracking-wider mb-2">Status</label>
                  <div className="flex flex-wrap gap-2">
                    {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => {
                      const isActive = selectedTicket.status.toUpperCase() === s
                      const theme = getStatusStyle(s)
                      return (
                        <button
                          key={s}
                          disabled={updateLoading || user?.role?.toLowerCase() === 'customer' && s !== 'CANCELLED'}
                          onClick={() => handleUpdateStatus(selectedTicket.id, s)}
                          style={isActive ? { color: theme.color, backgroundColor: theme.background, borderColor: theme.color } : { color: textMuted, borderColor: border }}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${isActive ? 'opacity-100' : 'opacity-50 hover:opacity-100'} ${updateLoading ? 'cursor-not-allowed' : ''}`}
                        >
                          {s.replace(/_/g, ' ')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center border-t pt-6" style={{ borderColor: border }}>
              {(user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'customer') && (
                <button 
                  onClick={() => handleDeleteTicket(selectedTicket.id)}
                  className="text-red-500 hover:text-red-600 font-bold text-sm transition-colors flex items-center gap-2"
                >
                  <MoreVertical className="w-4 h-4" /> Delete Ticket
                </button>
              )}
              <button 
                onClick={() => setShowViewModal(false)}
                className="px-8 py-2.5 bg-[#10B981] hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col overflow-hidden shadow-sm">
        
        {/* Toolbar */}
        <div style={{ borderColor: border }} className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-5 border-b gap-4">
          
          {/* Tabs */}
          <div style={{ borderColor: border, backgroundColor: inputBg }} className="flex p-1 border rounded-xl w-full lg:w-auto overflow-x-auto">
            {['all', 'active', 'completed'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={activeTab === tab
                  ? { backgroundColor: tabActiveBg, color: tabActiveText }
                  : { color: textMuted }
                }
                className="px-5 py-2 text-sm font-bold capitalize rounded-lg transition-all shrink-0"
              >
                {tab} Tickets
              </button>
            ))}
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div
              style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              className="flex flex-1 lg:w-64 items-center border rounded-xl px-3 py-2.5 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all"
            >
              <Search className="w-4 h-4 mr-2" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ color: textPrimary }}
                className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400"
              />
            </div>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{ color: textMuted }}
                className="p-2 hover:text-[#EF4444] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
              className="p-2.5 border rounded-xl hover:text-[#10B981] hover:border-[#10B981] transition-colors"
              title="Filter"
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
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
                  <td colSpan={5} className="p-12 text-center text-[#7A95B8]">
                    Loading tickets...
                  </td>
                </tr>
              ) : filteredTickets.map((ticket) => {
                const statusTheme = getStatusStyle(ticket.status)
                const StatusIcon = statusTheme.icon
                
                return (
                  <tr
                    key={ticket.id}
                    style={{ borderColor: border }}
                    className="border-b transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedTicket(ticket)
                      setShowViewModal(true)
                    }}
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
                        <span className="font-semibold">{ticket.id.substring(0, 8).toUpperCase()}...</span>
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
                      <button style={{ color: textMuted }} className="p-2 hover:bg-[#10B981]/10 hover:text-[#10B981] rounded-lg transition-colors group-hover:bg-[#10B981]/5">
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
      </div>
    </div>
  )
}
