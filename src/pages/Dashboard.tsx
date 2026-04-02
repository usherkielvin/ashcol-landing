import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Clock, CheckCircle, DollarSign, Circle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

interface Ticket {
  id: string
  title: string
  serviceType: string
  customerName: string
  status: string
  priority: string
  createdAt: string
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('all')
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  
  const [statsData, setStatsData] = useState<any>(null)
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        const token = sessionStorage.getItem('ashcol-token')
        const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
        const role = user?.role?.toLowerCase()
        const isAdmin = role === 'admin' || role === 'manager'
        
        // Fetch Stats — use /dashboard/stats for admins, /tickets/stats for others
        const statsEndpoint = isAdmin ? '/dashboard/stats' : '/tickets/stats'
        const statsRes = await fetch(`${apiUrl}${statsEndpoint}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (statsRes.ok) {
          const s = await statsRes.json()
          setStatsData(s?.data || s)
        }
        
        // Fetch Tickets
        let ticketEndpoint = '/tickets'
        if (role === 'customer') ticketEndpoint = '/tickets/my'
        if (role === 'employee') ticketEndpoint = '/tickets/assigned'
        
        const ticketsRes = await fetch(`${apiUrl}${ticketEndpoint}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (ticketsRes.ok) {
          const t = await ticketsRes.json()
          setRecentTickets(t?.data?.tickets?.slice(0, 5) || t?.tickets?.slice(0, 5) || [])
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    if (user) fetchDashboardData()
  }, [user])

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg       = isLight ? '#ffffff' : '#0A1120'
  const border       = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary  = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted    = isLight ? '#64748b' : '#7A95B8'
  const rowHover     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const tabActiveBg  = isLight ? '#e2e8f0' : '#1E2D48'
  const tabActiveText = isLight ? '#0f172a' : '#ffffff'
  const tabInactiveText = isLight ? '#64748b' : '#7A95B8'
  const theadBg      = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const welcomeBg    = isLight ? '#f8fafc' : '#0F1A2E'
  const footerBg     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.3)'

  const isAdmin = ['admin', 'manager'].includes((user?.role || '').toLowerCase())

  const allStats = isAdmin ? [
    { title: 'Total Tickets',    value: String(statsData?.total_tickets ?? '—'),    trend: '', color: '#10B981', icon: FileText },
    { title: 'Pending',          value: String(statsData?.pending_tickets ?? '—'),   trend: '', color: '#F59E0B', icon: Clock },
    { title: 'In Progress',      value: String(statsData?.in_progress_tickets ?? '—'), trend: '', color: '#3B82F6', icon: CheckCircle },
    { title: 'Completed',        value: String(statsData?.completed_tickets ?? '—'), trend: '', color: '#8B5CF6', icon: CheckCircle },
    { title: 'Total Employees',  value: String(statsData?.total_employees ?? '—'),   trend: '', color: '#EC4899', icon: DollarSign },
    { title: 'Active Branches',  value: String(statsData?.total_branches ?? '—'),    trend: '', color: '#14B8A6', icon: DollarSign },
  ] : [
    { title: 'My Tickets',       value: String(statsData?.total ?? '0'),      trend: '', color: '#10B981', icon: FileText },
    { title: 'Pending',          value: String(statsData?.pending ?? '0'),    trend: '', color: '#F59E0B', icon: Clock },
    { title: 'In Progress',      value: String(statsData?.inProgress ?? '0'), trend: '', color: '#3B82F6', icon: CheckCircle },
    { title: 'Completed',        value: String(statsData?.completed ?? '0'),  trend: '', color: '#8B5CF6', icon: CheckCircle },
  ]

  const stats = allStats

  // getStatusStyle and getPriorityDot...

  const getStatusStyle = (status: string) => {
    const s = status.toUpperCase()
    switch (s) {
      case 'COMPLETED':   return { color: '#3B82F6', background: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.2)' }
      case 'IN_PROGRESS': return { color: '#10B981', background: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)' }
      case 'ASSIGNED':
      case 'PENDING':     return { color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' }
      default:            return { color: '#94a3b8', background: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' }
    }
  }

  const getPriorityDot = (priority: string) => {
    const p = priority.toUpperCase().charAt(0) + priority.slice(1).toLowerCase()
    const colors: Record<string, string> = { Critical: '#EF4444', High: '#F97316', Medium: '#EAB308', Low: '#22C55E' }
    return <Circle className="w-2.5 h-2.5" style={{ color: colors[p] ?? '#94a3b8', fill: colors[p] ?? '#94a3b8' }} />
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Welcome Banner */}
      <div
        style={{ backgroundColor: welcomeBg, borderColor: border }}
        className="border rounded-2xl p-6 md:p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#10B981] opacity-[0.04] blur-[80px] rounded-full pointer-events-none" />
        <h2 style={{ color: textPrimary }} className="text-2xl md:text-3xl font-bold mb-2">
          Welcome back, {user?.name ? user.name.split(' ')[0] : 'Guest'}! 👋
        </h2>
        <p style={{ color: textMuted }} className="max-w-xl text-sm md:text-base leading-relaxed">
          {isAdmin
            ? <>You have <strong className="text-[#10B981]">{statsData?.pending_tickets ?? 0} pending tickets</strong> and <strong className="text-[#10B981]">{statsData?.in_progress_tickets ?? 0} in progress</strong> across all branches.</>
            : <>You have <strong className="text-[#10B981]">{statsData?.pending ?? 0} pending</strong> and <strong className="text-[#10B981]">{statsData?.inProgress ?? 0} in-progress</strong> service requests.</>
          }
        </p>
      </div>

      {/* Stats Grid — 4 cols for customer, 3/6 cols for admin */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}>
        {stats.map((stat, i) => (
          <div
            key={i}
            style={{ backgroundColor: cardBg, borderColor: border }}
            className="border rounded-2xl p-6 relative overflow-hidden group hover:shadow-lg transition-shadow"
          >
            <div
              className="absolute top-0 left-0 w-1 h-full opacity-60 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: stat.color }}
            />
            <div className="flex justify-between items-start mb-4 pl-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${stat.color}18`, color: stat.color }}
              >
                <stat.icon className="w-5 h-5" />
              </div>
              <span
                className="text-xs font-bold px-2 py-1 rounded-md"
                style={stat.trend.startsWith('+')
                  ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)' }
                  : { color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)' }
                }
              >
                {stat.trend}
              </span>
            </div>
            <div className="pl-2">
              <div style={{ color: textPrimary }} className="text-3xl font-black tracking-tight">{stat.value}</div>
              <div style={{ color: textMuted }} className="text-xs font-bold uppercase tracking-wider mt-1">{stat.title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Tickets */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col overflow-hidden">

        {/* Table Header */}
        <div style={{ borderColor: border }} className="flex flex-col sm:flex-row items-center justify-between p-6 border-b gap-4">
          <h3 style={{ color: textPrimary }} className="text-lg font-bold">Recent Service Tickets</h3>
          <div style={{ borderColor: border, backgroundColor: isLight ? '#f1f5f9' : '#0F1A2E' }} className="flex p-1 border rounded-lg">
            {['all', 'pending', 'active'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={activeTab === tab
                  ? { backgroundColor: tabActiveBg, color: tabActiveText }
                  : { color: tabInactiveText }
                }
                className="px-4 py-1.5 text-xs font-bold capitalize rounded-md transition-all"
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ backgroundColor: theadBg, color: textMuted }} className="text-xs uppercase tracking-wider font-bold">
                {['Ticket ID', 'Customer', 'Service', 'Priority', 'Status', ''].map((h, i) => (
                  <th
                    key={i}
                    style={{ borderColor: border }}
                    className={`p-4 border-b ${i === 0 ? 'pl-6' : ''} ${i === 5 ? 'pr-6 text-right' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[#7A95B8]">Loading tickets...</td>
                </tr>
              ) : recentTickets.length > 0 ? (
                recentTickets.map((ticket) => {
                  const s = getStatusStyle(ticket.status)
                  return (
                    <tr
                      key={ticket.id}
                      style={{ borderColor: border }}
                      className="border-b transition-colors"
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = rowHover}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                    >
                      <td style={{ color: textPrimary }} className="p-4 pl-6 font-semibold">{ticket.id.substring(0,8).toUpperCase()}...</td>
                      <td style={{ color: textMuted }} className="p-4">{user?.role?.toLowerCase() === 'customer' ? 'Me' : (ticket.customerName || 'Unknown')}</td>
                      <td style={{ color: textMuted }} className="p-4">{ticket.serviceType}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          {getPriorityDot(ticket.priority)}
                          <span style={{ color: textPrimary }} className="text-[11px] font-bold uppercase tracking-wider">{ticket.priority.toUpperCase()}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          style={{ color: s.color, backgroundColor: s.background, borderColor: s.border }}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-full border uppercase tracking-wider"
                        >
                          {ticket.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <Link 
                          to={`/tickets?id=${ticket.id}`}
                          className="text-[#10B981] hover:underline font-semibold text-[13px]"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#7A95B8]">No recent tickets to display.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ borderColor: border, backgroundColor: footerBg }} className="p-4 border-t flex justify-center">
          <button style={{ color: textMuted }} className="text-sm font-bold hover:text-[#10B981] transition-colors">
            View All Tickets →
          </button>
        </div>
      </div>
    </div>
  )
}
