import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Clock, CheckCircle, AlertCircle, Plus,
  ChevronRight, Wrench, Zap, Wind, Building2, Circle,
  CalendarDays, MapPin, RefreshCw
} from 'lucide-react'
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
  location?: string
  preferredDate?: string
  scheduledDate?: string
}

const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  PENDING:     { label: 'Pending',     color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)',  icon: Clock },
  ASSIGNED:    { label: 'Assigned',    color: '#3B82F6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)',  icon: AlertCircle },
  IN_PROGRESS: { label: 'In Progress', color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)',  icon: RefreshCw },
  COMPLETED:   { label: 'Completed',   color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)',  icon: CheckCircle },
  CANCELLED:   { label: 'Cancelled',   color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)', icon: Circle },
}

const SVC_ICON: Record<string, any> = {
  Cleaning: Wrench, Maintenance: Wrench, Repair: Zap,
  Installation: Building2, Ducting: Wind,
}

function formatDate(iso?: string) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function Dashboard() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'

  const [statsData, setStatsData]     = useState<any>(null)
  const [tickets, setTickets]         = useState<Ticket[]>([])
  const [loading, setLoading]         = useState(true)
  const [filterStatus, setFilterStatus] = useState('ALL')

  // ── Theme tokens ──────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const pageBg      = isLight ? '#f1f5f9'  : '#060B18'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const rowHover    = isLight ? '#f8fafc'  : 'rgba(15,26,46,0.6)'

  useEffect(() => {
    if (!user) return
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
    const headers = { Authorization: `Bearer ${getToken()}` }

    const fetchAll = async () => {
      setLoading(true)
      try {
        const isAdmin = role === 'admin' || role === 'manager'
        const statsEp = isAdmin ? '/dashboard/stats' : '/tickets/stats'
        const ticketEp = isCustomer ? '/tickets/my' : role === 'employee' ? '/tickets/assigned' : '/tickets'

        const [sRes, tRes] = await Promise.all([
          fetch(`${apiUrl}${statsEp}`, { headers }),
          fetch(`${apiUrl}${ticketEp}?size=20`, { headers }),
        ])

        if (sRes.ok) { const s = await sRes.json(); setStatsData(s?.data || s) }
        if (tRes.ok) {
          const t = await tRes.json()
          setTickets(t?.data?.tickets || t?.tickets || [])
        }
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    fetchAll()
  }, [user])

  // ── Customer stat cards ───────────────────────────────────────
  const customerStats = [
    { label: 'Total',       value: statsData?.total       ?? 0, color: '#10B981', icon: FileText,    status: 'ALL' },
    { label: 'Pending',     value: statsData?.pending     ?? 0, color: '#F59E0B', icon: Clock,       status: 'PENDING' },
    { label: 'In Progress', value: statsData?.inProgress  ?? 0, color: '#3B82F6', icon: RefreshCw,   status: 'IN_PROGRESS' },
    { label: 'Completed',   value: statsData?.completed   ?? 0, color: '#8B5CF6', icon: CheckCircle, status: 'COMPLETED' },
  ]

  // ── Admin stat cards ──────────────────────────────────────────
  const adminStats = [
    { label: 'Total Tickets',   value: statsData?.total_tickets      ?? 0, color: '#10B981', icon: FileText,    status: 'ALL' },
    { label: 'Pending',         value: statsData?.pending_tickets    ?? 0, color: '#F59E0B', icon: Clock,       status: 'PENDING' },
    { label: 'In Progress',     value: statsData?.in_progress_tickets ?? 0, color: '#3B82F6', icon: RefreshCw,  status: 'IN_PROGRESS' },
    { label: 'Completed',       value: statsData?.completed_tickets  ?? 0, color: '#8B5CF6', icon: CheckCircle, status: 'COMPLETED' },
  ]

  const stats = isCustomer ? customerStats : adminStats

  // ── Active ticket (most recent non-completed) ─────────────────
  const activeTicket = isCustomer
    ? tickets.find(t => !['COMPLETED', 'CANCELLED'].includes(t.status.toUpperCase()))
    : null

  // ── Filtered list ─────────────────────────────────────────────
  const filtered = filterStatus === 'ALL'
    ? tickets
    : tickets.filter(t => t.status.toUpperCase() === filterStatus)

  const statusKey = (s: string) => s.toUpperCase().replace(/ /g, '_')

  return (
    <div className="flex flex-col gap-5 pb-8" style={{ backgroundColor: pageBg }}>

      {/* ── Welcome + CTA ── */}
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #10B981, transparent)' }} />
        <div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            Hey, {user?.name?.split(' ')[0] ?? 'there'} 👋
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            {isCustomer
              ? statsData?.inProgress > 0
                ? `You have ${statsData.inProgress} active service request${statsData.inProgress > 1 ? 's' : ''} in progress.`
                : statsData?.pending > 0
                  ? `You have ${statsData.pending} pending request${statsData.pending > 1 ? 's' : ''} waiting for assignment.`
                  : 'All clear! Book a new service whenever you need us.'
              : `${statsData?.pending_tickets ?? 0} pending · ${statsData?.in_progress_tickets ?? 0} in progress`
            }
          </p>
        </div>
        {isCustomer && (
          <button
            onClick={() => navigate('/create-ticket')}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white bg-[#10B981] hover:bg-emerald-500 transition-all shrink-0 shadow-lg shadow-[#10B981]/20"
          >
            <Plus className="w-4 h-4" /> New Request
          </button>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s, i) => {
          const Icon = s.icon
          const isActive = filterStatus === s.status
          return (
            <button
              key={i}
              onClick={() => setFilterStatus(isActive ? 'ALL' : s.status)}
              className="rounded-2xl p-4 md:p-5 text-left transition-all hover:shadow-md relative overflow-hidden"
              style={{
                backgroundColor: isActive ? `${s.color}18` : cardBg,
                border: `1px solid ${isActive ? s.color + '60' : border}`,
              }}
            >
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: s.color }} />
              <div className="flex items-center justify-between mb-3 pl-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}18`, color: s.color }}>
                  <Icon className="w-4 h-4" />
                </div>
                {isActive && <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color: s.color, backgroundColor: `${s.color}18` }}>Active</span>}
              </div>
              <div className="pl-2">
                <div className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: s.color }}>{loading ? '—' : s.value}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textMuted }}>{s.label}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Active ticket highlight (customer only) ── */}
      {isCustomer && activeTicket && (
        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{ backgroundColor: cardBg, border: `1px solid ${STATUS_CFG[statusKey(activeTicket.status)]?.color ?? '#10B981'}40` }}
        >
          <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
            style={{ background: `linear-gradient(90deg, ${STATUS_CFG[statusKey(activeTicket.status)]?.color ?? '#10B981'}, transparent)` }} />

          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: STATUS_CFG[statusKey(activeTicket.status)]?.color ?? '#10B981' }}>
                Active Request
              </p>
              <h3 className="text-base font-black" style={{ color: textPrimary }}>{activeTicket.title}</h3>
            </div>
            <span
              className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wide"
              style={{
                color: STATUS_CFG[statusKey(activeTicket.status)]?.color,
                backgroundColor: STATUS_CFG[statusKey(activeTicket.status)]?.bg,
                borderColor: STATUS_CFG[statusKey(activeTicket.status)]?.border,
              }}
            >
              {STATUS_CFG[statusKey(activeTicket.status)]?.label ?? activeTicket.status}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: textMuted }}>
              <Wrench className="w-3.5 h-3.5" /> {activeTicket.serviceType}
            </span>
            {(activeTicket.scheduledDate || activeTicket.preferredDate) && (
              <span className="flex items-center gap-1.5 text-[12px]" style={{ color: textMuted }}>
                <CalendarDays className="w-3.5 h-3.5" />
                {formatDate(activeTicket.scheduledDate || activeTicket.preferredDate)}
              </span>
            )}
            {activeTicket.location && (
              <span className="flex items-center gap-1.5 text-[12px] truncate max-w-[200px]" style={{ color: textMuted }}>
                <MapPin className="w-3.5 h-3.5 shrink-0" /> {activeTicket.location}
              </span>
            )}
          </div>

          <Link
            to={`/tickets?id=${activeTicket.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-bold transition-colors hover:opacity-80"
            style={{ color: STATUS_CFG[statusKey(activeTicket.status)]?.color ?? '#10B981' }}
          >
            View Details <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* ── Ticket list ── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <h3 className="font-black text-base" style={{ color: textPrimary }}>
            {isCustomer ? 'My Service Requests' : 'Recent Tickets'}
          </h3>
          {/* Status filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'].map(s => {
              const cfg = STATUS_CFG[s]
              const isActive = filterStatus === s
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className="px-3 py-1 rounded-full text-[11px] font-bold border transition-all"
                  style={isActive
                    ? { color: cfg?.color ?? '#10B981', backgroundColor: cfg?.bg ?? 'rgba(16,185,129,0.1)', borderColor: cfg?.border ?? 'rgba(16,185,129,0.25)' }
                    : { color: textMuted, backgroundColor: 'transparent', borderColor: border }
                  }
                >
                  {s === 'ALL' ? 'All' : s === 'IN_PROGRESS' ? 'In Progress' : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              )
            })}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-col gap-3 p-5">
            {[1,2,3].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: inputBg }}>
              <FileText className="w-6 h-6" style={{ color: textMuted }} />
            </div>
            <p className="font-bold" style={{ color: textPrimary }}>No tickets found</p>
            <p className="text-sm" style={{ color: textMuted }}>
              {filterStatus !== 'ALL' ? 'Try a different filter.' : isCustomer ? 'Book your first service to get started.' : 'No tickets yet.'}
            </p>
            {isCustomer && filterStatus === 'ALL' && (
              <Link to="/create-ticket"
                className="mt-1 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-[#10B981] hover:bg-emerald-500 transition-all">
                <Plus className="w-4 h-4" /> Book a Service
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col divide-y" style={{ '--tw-divide-opacity': 1 } as any}>
            {filtered.map(ticket => {
              const sk = statusKey(ticket.status)
              const cfg = STATUS_CFG[sk] ?? STATUS_CFG.PENDING
              const SvcIcon = SVC_ICON[ticket.serviceType] ?? Wrench
              return (
                <Link
                  key={ticket.id}
                  to={`/tickets?id=${ticket.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors group"
                  style={{ borderColor: border }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = rowHover}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                >
                  {/* Service icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}>
                    <SvcIcon className="w-4 h-4" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-sm truncate" style={{ color: textPrimary }}>{ticket.title}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[12px]" style={{ color: textMuted }}>{ticket.serviceType}</span>
                      {ticket.createdAt && (
                        <span className="text-[11px]" style={{ color: textMuted }}>{timeAgo(ticket.createdAt)}</span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wide"
                      style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
                    >
                      {cfg.label}
                    </span>
                    {/* Mobile: just dot */}
                    <span className="sm:hidden w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: textMuted }} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${border}`, backgroundColor: inputBg }}>
            <span className="text-[12px]" style={{ color: textMuted }}>{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
            <Link to="/tickets" className="text-[12px] font-bold text-[#10B981] hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
