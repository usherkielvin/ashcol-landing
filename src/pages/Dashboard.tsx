import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Clock, CheckCircle, AlertCircle, Plus,
  ChevronRight, Wrench, Zap, Wind, Building2, Circle,
  CalendarDays, MapPin, RefreshCw, ExternalLink, Navigation,
  ClipboardList, Phone,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import FleetMap from '../components/FleetMap'
import GlobalSearch from '../components/GlobalSearch'
import SearchResultDetailModal from '../components/SearchResultDetailModal'
import { inferCategoryFromTicket, isFieldCategory } from '../constants/ticketCategories'

interface Ticket {
  id: string
  title: string
  serviceType: string
  customerName?: string
  customer_name?: string
  status: string
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
  location?: unknown
  preferredDate?: string
  preferred_date?: string
  scheduledDate?: string
  contactPhone?: string
  contact_phone?: string
  assignedTo?: string
  assigned_employee_name?: string
}

const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof Clock }> = {
  PENDING:     { label: 'Pending',     color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)',  icon: Clock },
  ASSIGNED:    { label: 'Assigned',    color: '#3B82F6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)',  icon: AlertCircle },
  ON_THE_WAY:  { label: 'On the way',  color: '#06B6D4', bg: 'rgba(6,182,212,0.1)',   border: 'rgba(6,182,212,0.25)',   icon: Navigation },
  IN_PROGRESS: { label: 'In Progress', color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)',  icon: RefreshCw },
  COMPLETED:   { label: 'Completed',   color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)',  icon: CheckCircle },
  CANCELLED:   { label: 'Cancelled',   color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)', icon: Circle },
}

const SVC_ICON: Record<string, typeof Wrench> = {
  Cleaning: Wrench, Maintenance: Wrench, Repair: Zap,
  Installation: Building2, Ducting: Wind,
}

function formatDate(iso?: string) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}


function statusKey(s: string) {
  return s.toUpperCase().replace(/ /g, '_')
}

function getPreferredDate(t: Ticket): string | undefined {
  return t.preferredDate || t.preferred_date || t.scheduledDate
}

/** Human-readable service address for map search */
function formatLocationLine(loc: unknown): string {
  if (!loc) return ''
  if (typeof loc === 'string') {
    const s = loc.trim()
    if (!s) return ''
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        const p = JSON.parse(s) as Record<string, string>
        const parts = [p.address, p.barangay, p.city, p.region].filter(Boolean)
        return parts.join(', ')
      } catch { /* fall through */ }
    }
    if (/lat|lng|long|latitude|longitude/i.test(s)) return ''
    return s
  }
  const o = loc as Record<string, string>
  const parts = [o.address, o.barangay, o.city, o.region].filter(Boolean)
  return parts.join(', ')
}

function parseLatLng(loc: unknown): { lat: number; lng: number } | null {
  let o: Record<string, unknown> | null = null
  if (typeof loc === 'string') {
    const s = loc.trim()
    if (s.startsWith('{')) {
      try { o = JSON.parse(s) as Record<string, unknown> } catch { return null }
    } else return null
  } else if (loc && typeof loc === 'object') o = loc as Record<string, unknown>
  if (!o) return null
  const lat = o.lat ?? o.latitude
  const lng = o.lng ?? o.longitude ?? o.long
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
  if (typeof lat === 'string' && typeof lng === 'string') {
    const la = parseFloat(lat)
    const ln = parseFloat(lng)
    if (!Number.isNaN(la) && !Number.isNaN(ln)) return { lat: la, lng: ln }
  }
  return null
}

function mapsEmbedUrl(loc: unknown): string | null {
  const ll = parseLatLng(loc)
  if (ll) return `https://maps.google.com/maps?q=${ll.lat},${ll.lng}&z=16&output=embed`
  const line = formatLocationLine(loc)
  if (!line) return null
  return `https://maps.google.com/maps?q=${encodeURIComponent(line)}&output=embed`
}

function mapsOpenUrl(loc: unknown): string | null {
  const ll = parseLatLng(loc)
  if (ll) return `https://www.google.com/maps?q=${ll.lat},${ll.lng}`
  const line = formatLocationLine(loc)
  if (!line) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`
}

function customerName(t: Ticket): string {
  return (t.customerName || t.customer_name || '').trim() || 'Customer'
}

function ticketsLink(ticketId?: string, status?: string) {
  const params = new URLSearchParams()
  if (status) params.set('status', status.toUpperCase())
  if (ticketId) params.set('id', ticketId)
  const q = params.toString()
  return q ? `/tickets?${q}` : '/tickets'
}

export default function Dashboard() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()
  const isCustomer = role === 'customer'
  const isEmployee = role === 'employee' || role === 'oic'
  const isAdminOrManager = role === 'admin' || role === 'manager'

  const [statsData, setStatsData] = useState<Record<string, number> | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([])
  const [assignLoading, setAssignLoading] = useState<string | null>(null)
  const [selectedSearchResult, setSelectedSearchResult] = useState<any>(null)

  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const todaysSchedulesCount = useMemo(() => {
    return tickets.filter(t => {
      const d = getPreferredDate(t)
      return d && d.startsWith(todayStr) && !['COMPLETED', 'CANCELLED'].includes(t.status.toUpperCase())
    }).length
  }, [tickets, todayStr])

  const upcomingCount = useMemo(() => {
    return tickets.filter(t => {
      const d = getPreferredDate(t)
      return d && d > todayStr && !['COMPLETED', 'CANCELLED'].includes(t.status.toUpperCase())
    }).length
  }, [tickets, todayStr])

  const urgentCount = useMemo(() => {
    return tickets.filter(t => {
      const d = getPreferredDate(t)
      return d && d < todayStr && !['COMPLETED', 'CANCELLED'].includes(t.status.toUpperCase())
    }).length
  }, [tickets, todayStr])

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const pageBg      = isLight ? '#f1f5f9'  : '#060B18'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'

  useEffect(() => {
    if (!user) return
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
    const headers = { Authorization: `Bearer ${getToken()}` }

    const fetchAll = async () => {
      setLoading(true)
      try {
        const statsEp = isAdminOrManager ? '/dashboard/stats' : '/tickets/stats'
        const ticketEp = isCustomer ? '/tickets/my' : isEmployee ? '/tickets' : '/tickets'

        const promises = [
          fetch(`${apiUrl}${statsEp}`, { headers }),
          fetch(`${apiUrl}${ticketEp}?size=50`, { headers })
        ]

        if (isAdminOrManager) {
           promises.push(fetch(`${apiUrl}/user/all?role=EMPLOYEE`, { headers }))
        }

        const res = await Promise.all(promises)
        const [sRes, tRes] = res

        if (sRes.ok) {
          const s = await sRes.json()
          setStatsData(s?.data || s)
        }
        if (tRes.ok) {
          const t = await tRes.json()
          setTickets(t?.data?.tickets || t?.tickets || [])
        }
        if (isAdminOrManager && res[2]?.ok) {
           const techData = await res[2].json()
           setTechnicians(techData?.data || [])
        }
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    fetchAll()
  }, [user, isAdminOrManager, isCustomer, isEmployee])

  const handleQuickAssign = async (ticketId: string, technicianId: string) => {
    if (!technicianId) return
    setAssignLoading(ticketId)
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
      const body = JSON.stringify({ assignedTo: technicianId, status: 'ASSIGNED' })
      const res = await fetch(`${apiUrl}/tickets/${ticketId}`, { method: 'PATCH', headers, body })
      if (!res.ok) throw new Error('Failed to assign')
      
      const payload = await res.json()
      const updated = payload?.data || payload
      const tName = technicians.find(t => t.id === technicianId)?.name || ''
      
      setTickets(prev => prev.map(t => t.id === ticketId ? { 
        ...t, 
        ...updated, 
        status: 'ASSIGNED', 
        assignedTo: technicianId, 
        assigned_employee_name: tName 
      } : t))
      
      setStatsData(prev => prev ? {
        ...prev,
        pending_tickets: Math.max(0, (prev.pending_tickets || 0) - 1),
        in_progress_tickets: (prev.in_progress_tickets || 0) + 1,
      } : prev)
    } catch (e) {
      console.error(e)
      alert("Failed to assign ticket")
    } finally {
      setAssignLoading(null)
    }
  }

  const customerStats = [
    { label: 'Total',       value: statsData?.total       ?? 0, color: '#10B981', icon: FileText,    status: 'ALL' },
    { label: 'Pending',     value: statsData?.pending     ?? 0, color: '#F59E0B', icon: Clock,       status: 'PENDING' },
    { label: 'In Progress', value: statsData?.inProgress  ?? 0, color: '#3B82F6', icon: RefreshCw,   status: 'IN_PROGRESS' },
    { label: 'Completed',   value: statsData?.completed   ?? 0, color: '#8B5CF6', icon: CheckCircle, status: 'COMPLETED' },
  ]

  const adminStats = [
    { label: 'Total Schedules', value: statsData?.total_tickets      ?? 0, color: '#10B981', icon: FileText,    status: 'ALL' },
    { label: 'Pending',         value: statsData?.pending_tickets    ?? 0, color: '#F59E0B', icon: Clock,       status: 'PENDING' },
    { label: 'In Progress',     value: statsData?.in_progress_tickets ?? 0, color: '#3B82F6', icon: RefreshCw,  status: 'IN_PROGRESS' },
    { label: 'Completed',       value: statsData?.completed_tickets  ?? 0, color: '#8B5CF6', icon: CheckCircle, status: 'COMPLETED' },
  ]

  const stats = isCustomer ? customerStats : adminStats

  const activeTicket = isCustomer
    ? tickets.find(t => !['COMPLETED', 'CANCELLED'].includes(t.status.toUpperCase()))
    : null

  const filtered = filterStatus === 'ALL'
    ? tickets
    : tickets.filter(t => {
        const u = t.status.toUpperCase()
        if (filterStatus === 'IN_PROGRESS' && (isCustomer || isAdminOrManager)) {
          return u === 'IN_PROGRESS' || u === 'ON_THE_WAY'
        }
        return u === filterStatus
      })

  const focusJob = useMemo(() => {
    if (!isEmployee) return null
    const open = tickets.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status.toUpperCase()))
    const byPref = (a: Ticket, b: Ticket) => {
      const da = getPreferredDate(a) || '9999-99-99'
      const db = getPreferredDate(b) || '9999-99-99'
      return da.localeCompare(db)
    }
    const assigned = open.filter(t => t.status.toUpperCase() === 'ASSIGNED').sort(byPref)
    const otw = open.filter(t => t.status.toUpperCase() === 'ON_THE_WAY').sort(byPref)
    const prog = open.filter(t => t.status.toUpperCase() === 'IN_PROGRESS').sort(byPref)
    return assigned[0] || otw[0] || prog[0] || null
  }, [isEmployee, tickets])

  const scheduleRows = useMemo(() => {
    if (!isEmployee) return []
    return tickets
      .filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status.toUpperCase()))
      .filter(t => !!getPreferredDate(t))
      .sort((a, b) => (getPreferredDate(a) || '').localeCompare(getPreferredDate(b) || ''))
  }, [isEmployee, tickets])

  const filterPills = isEmployee
    ? ['ALL', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'] as const
    : ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const

  function JobStepper({ ticket }: { ticket: Ticket }) {
    const st = ticket.status.toUpperCase()
    const steps = [
      { key: 'assigned', label: 'Assigned', desc: 'Queued by your branch' },
      { key: 'otw', label: 'On the way', desc: 'Travel to the service pin' },
      { key: 'site', label: 'On site', desc: 'Mark In progress when you arrive' },
      { key: 'done', label: 'Done', desc: 'Complete in Schedules' },
    ] as const

    let activeIdx = 0
    if (st === 'ASSIGNED') activeIdx = 1
    else if (st === 'ON_THE_WAY') activeIdx = 2
    else if (st === 'IN_PROGRESS') activeIdx = 3
    else if (st === 'COMPLETED') activeIdx = 4
    else activeIdx = 0

    return (
      <div className="mt-4">
        <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: textMuted }}>Job progress</p>
        <div className="grid grid-cols-4 gap-1 sm:gap-2">
          {steps.map((step, i) => {
            const current = st !== 'COMPLETED' && i === activeIdx
            const complete = st === 'COMPLETED' || i < activeIdx
            return (
              <div key={step.key} className="relative text-center">
                <div
                  className="mx-auto w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[11px] font-black border-2 transition-all"
                  style={{
                    borderColor: complete ? '#10B981' : current ? '#3B82F6' : border,
                    backgroundColor: complete ? 'rgba(16,185,129,0.15)' : current ? 'rgba(59,130,246,0.12)' : inputBg,
                    color: complete ? '#10B981' : current ? '#3B82F6' : textMuted,
                    boxShadow: current ? '0 0 0 3px rgba(59,130,246,0.2)' : undefined,
                  }}
                >
                  {complete ? '✓' : i + 1}
                </div>
                <p className="text-[10px] sm:text-[11px] font-bold mt-1.5 leading-tight" style={{ color: textPrimary }}>{step.label}</p>
                <p className="text-[9px] sm:text-[10px] leading-snug mt-0.5 hidden sm:block" style={{ color: textMuted }}>{step.desc}</p>
                {i < steps.length - 1 && (
                  <div
                    className="hidden sm:block absolute top-4 left-[calc(50%+1rem)] w-[calc(100%-2rem)] h-[2px] -z-0"
                    style={{ backgroundColor: i < activeIdx ? '#10B981' : border }}
                  />
                )}
              </div>
            )
          })}
        </div>
        {st === 'ASSIGNED' && (
          <p className="text-xs mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: inputBg, color: textMuted }}>
            In <strong style={{ color: textPrimary }}>Schedules</strong>, set <strong style={{ color: '#06B6D4' }}>On the way</strong> when you head out, then <strong style={{ color: '#10B981' }}>In progress</strong> when you arrive.
          </p>
        )}
        {st === 'ON_THE_WAY' && (
          <p className="text-xs mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: inputBg, color: textMuted }}>
            You are en route. Set <strong style={{ color: '#10B981' }}>In progress</strong> when you are on site.
          </p>
        )}
      </div>
    )
  }

  /* ── Clean Technician dashboard ───────────────────────────── */
  if (isEmployee) {
    const mapUrl = focusJob ? mapsEmbedUrl(focusJob.location) : null
    const openMapUrl = focusJob ? mapsOpenUrl(focusJob.location) : null
    const locLine = focusJob ? formatLocationLine(focusJob.location) : ''

    // Count stats for quick view
    const assignedCount = tickets.filter(t => t.status.toUpperCase() === 'ASSIGNED').length
    const onTheWayCount = tickets.filter(t => t.status.toUpperCase() === 'ON_THE_WAY').length
    const inProgressCount = tickets.filter(t => t.status.toUpperCase() === 'IN_PROGRESS').length
    const completedToday = tickets.filter(t => {
      if (t.status.toUpperCase() !== 'COMPLETED') return false
      const d = t.updatedAt || t.updated_at
      if (!d) return false
      return new Date(d).toDateString() === new Date().toDateString()
    }).length

    return (
      <div className="flex flex-col gap-4 pb-8" style={{ backgroundColor: pageBg }}>
        {/* Header greeting */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#10B981' }}>Technician</p>
            <h2 className="text-lg md:text-xl font-black tracking-tight" style={{ color: textPrimary }}>
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0] || 'Technician'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate(ticketsLink(undefined, 'ALL'))}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-[#10B981] hover:bg-emerald-500 transition-all"
          >
            <ClipboardList className="w-4 h-4" /> All Schedules
          </button>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <p className="text-2xl font-black" style={{ color: assignedCount > 0 ? '#3B82F6' : textMuted }}>{loading ? '—' : assignedCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Assigned</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <p className="text-2xl font-black" style={{ color: onTheWayCount > 0 ? '#06B6D4' : textMuted }}>{loading ? '—' : onTheWayCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>On the way</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <p className="text-2xl font-black" style={{ color: inProgressCount > 0 ? '#F59E0B' : textMuted }}>{loading ? '—' : inProgressCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>On site</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <p className="text-2xl font-black" style={{ color: '#8B5CF6' }}>{loading ? '—' : completedToday}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Done Today</p>
          </div>
        </div>

        {/* Current Job Card - Main Focus */}
        {focusJob ? (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            {/* Job header */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}`, background: isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)' }}>
              <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: '#10B981' }}>Current Job</span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase"
                style={{
                  color: STATUS_CFG[statusKey(focusJob.status)]?.color,
                  backgroundColor: STATUS_CFG[statusKey(focusJob.status)]?.bg,
                  borderColor: STATUS_CFG[statusKey(focusJob.status)]?.border,
                }}
              >
                {STATUS_CFG[statusKey(focusJob.status)]?.label ?? focusJob.status}
              </span>
            </div>

            <div className="p-4">
              <h3 className="text-base font-bold mb-1" style={{ color: textPrimary }}>{focusJob.title}</h3>
              <p className="text-sm mb-3" style={{ color: textMuted }}>{customerName(focusJob)}</p>

              {/* Quick info row */}
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: inputBg, color: textMuted }}>
                  <Wrench className="w-3 h-3" /> {focusJob.serviceType}
                </span>
                {getPreferredDate(focusJob) && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: inputBg, color: textMuted }}>
                    <CalendarDays className="w-3 h-3" /> {formatDate(getPreferredDate(focusJob))}
                  </span>
                )}
                {(focusJob.contactPhone || focusJob.contact_phone) && (
                  <a
                    href={`tel:${(focusJob.contactPhone || focusJob.contact_phone || '').replace(/\D/g, '')}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                    style={{ backgroundColor: isLight ? '#d1fae5' : 'rgba(16,185,129,0.2)', color: '#10B981' }}
                  >
                    <Phone className="w-3 h-3" /> Call
                  </a>
                )}
              </div>

              {/* Address */}
              {locLine && (
                <div className="flex items-start gap-2 mb-3 p-2 rounded-lg" style={{ backgroundColor: inputBg }}>
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#10B981' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: textPrimary }}>{locLine}</p>
                    {openMapUrl && (
                      <a href={openMapUrl} target="_blank" rel="noreferrer" className="text-[10px] text-[#10B981] hover:underline inline-flex items-center gap-1 mt-1">
                        Open in Maps <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Compact stepper */}
              <JobStepper ticket={focusJob} />

              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                <Link
                  to={ticketsLink(focusJob.id, focusJob.status)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-[#10B981] hover:bg-emerald-500 transition-all"
                >
                  View Job Details
                </Link>
                {focusJob.status.toUpperCase() === 'ASSIGNED' && (
                  <button
                    onClick={() => navigate(ticketsLink(focusJob.id, 'ASSIGNED'))}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs border transition-all"
                    style={{ borderColor: '#3B82F6', color: '#3B82F6' }}
                  >
                    Start Job
                  </button>
                )}
              </div>
            </div>

            {/* Mini map */}
            {mapUrl && (
              <div className="h-48 border-t" style={{ borderColor: border }}>
                <iframe title="Service location" src={mapUrl} className="w-full h-full border-0"
                  loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
            )}
          </div>
        ) : !loading && (
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" style={{ color: textMuted }} />
            <p className="font-bold text-sm" style={{ color: textPrimary }}>No jobs assigned</p>
            <p className="text-xs mt-1" style={{ color: textMuted }}>Check back later or contact your manager</p>
          </div>
        )}

        {/* Upcoming jobs list */}
        {scheduleRows.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-bold text-sm" style={{ color: textPrimary }}>Upcoming</h3>
              <span className="text-[10px] font-medium" style={{ color: textMuted }}>{scheduleRows.length} scheduled</span>
            </div>
            <div className="divide-y" style={{ borderColor: border }}>
              {scheduleRows.slice(0, 3).map(t => (
                <Link
                  key={t.id}
                  to={ticketsLink(t.id, t.status)}
                  className="flex items-center gap-3 px-4 py-3 hover:opacity-90 transition-opacity"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${STATUS_CFG[statusKey(t.status)]?.color}15`, color: STATUS_CFG[statusKey(t.status)]?.color }}>
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: textPrimary }}>{t.title}</p>
                    <p className="text-[11px] truncate" style={{ color: textMuted }}>{formatDate(getPreferredDate(t))} · {customerName(t)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-40" style={{ color: textMuted }} />
                </Link>
              ))}
              {scheduleRows.length > 3 && (
                <Link to="/tickets" className="block px-4 py-2 text-center text-[11px] font-bold text-[#10B981] hover:underline">
                  + {scheduleRows.length - 3} more
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Customer, manager, admin dashboard (original flow) ──────── */
  return (
    <div className="flex flex-col gap-5 pb-8" style={{ backgroundColor: pageBg }}>

      {/* Global Search Bar - Only for admin/manager/staff */}
      {isAdminOrManager && (
        <div className="flex justify-center">
          <GlobalSearch onResultClick={(result) => setSelectedSearchResult(result)} />
        </div>
      )}

      {/* Welcome Banner */}
      <div
        className="rounded-3xl p-6 relative overflow-hidden flex flex-col md:flex-row items-start justify-between gap-4 shadow-sm"
        style={{
          background: isLight 
            ? 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 50%, #F5F3FF 100%)' 
            : 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(6,182,212,0.04) 50%, rgba(139,92,246,0.04) 100%)',
          border: `1px solid ${isLight ? '#E2E8F0' : 'rgba(30,45,72,0.5)'}`
        }}
      >
        {/* Background Decorative Pattern */}
        <div className="absolute top-0 right-0 w-80 h-full opacity-10 pointer-events-none hidden md:block">
          <svg className="w-full h-full text-emerald-500" viewBox="0 0 100 100" fill="none" preserveAspectRatio="none">
            <path d="M50 0C60 40 90 60 100 100H50V0Z" fill="currentColor" />
          </svg>
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight" style={{ color: textPrimary }}>
              Good {currentTime.getHours() < 12 ? 'morning' : currentTime.getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0] ?? 'Admin'} 👋
            </h2>
            <p className="text-xs mt-1 font-medium" style={{ color: textMuted }}>
              Here's what's happening with your service operations today.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}`, color: textPrimary }}>
              <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}`, color: textPrimary }}>
              <Clock className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </div>
          </div>
        </div>

        {isCustomer ? (
          <button
            type="button"
            onClick={() => navigate('/create-ticket')}
            className="relative z-10 flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs text-white bg-[#10B981] hover:bg-emerald-500 hover:scale-[1.02] active:scale-95 transition-all shadow-md shadow-emerald-500/10 shrink-0 self-start md:self-center"
          >
            <Plus className="w-4 h-4" /> New Request
          </button>
        ) : (
          <div className="relative z-10 flex items-center gap-2 shrink-0 py-1 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 self-start md:self-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Operations Online
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => {
          const Icon = s.icon
          const isActive = filterStatus === s.status
          const changeVal = s.value > 0 ? '▲ 100%' : '— 0%'
          const changeColor = s.value > 0 ? '#10B981' : textMuted
          
          return (
            <button
              key={i}
              type="button"
              onClick={() => setFilterStatus(isActive ? 'ALL' : s.status)}
              className="rounded-3xl p-5 text-left transition-all hover:shadow-md relative overflow-hidden flex flex-col gap-4 shadow-sm"
              style={{
                backgroundColor: isActive ? `${s.color}08` : cardBg,
                border: `1.5px solid ${isActive ? s.color : border}`,
              }}
            >
              <div className="absolute top-0 left-0 w-[4px] h-full" style={{ backgroundColor: s.color }} />
              
              <div className="flex items-center gap-4 pl-1">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-inner" 
                     style={{ backgroundColor: `${s.color}12`, border: `1px solid ${s.color}25`, color: s.color }}>
                  <Icon className="w-5 h-5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: textMuted }}>
                    {s.label}
                  </span>
                  <span className="text-2xl md:text-3xl font-black tracking-tight block mt-0.5" style={{ color: s.color }}>
                    {loading ? '—' : s.value}
                  </span>
                </div>
              </div>

              <div className="text-[10px] font-bold uppercase tracking-wide border-t pt-3 flex items-center justify-between pl-1" 
                   style={{ borderColor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)' }}>
                <span style={{ color: changeColor }}>{changeVal} vs yesterday</span>
                {isActive && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black" style={{ color: s.color, backgroundColor: `${s.color}15` }}>
                    FILTERED
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Main Grid: Recent Schedules & Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Column: Recent Schedules */}
        <div className="lg:col-span-2 rounded-3xl shadow-sm flex flex-col overflow-hidden" 
             style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4" 
               style={{ borderBottom: `1px solid ${border}` }}>
            <h3 className="font-black text-sm" style={{ color: textPrimary }}>
              {isCustomer ? 'My Service Requests' : 'Recent Schedules'}
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1">
                {filterPills.map(s => {
                  const cfg = s === 'ALL' ? null : STATUS_CFG[s]
                  const isActive = filterStatus === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilterStatus(s)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all"
                      style={isActive
                        ? { color: cfg?.color ?? '#10B981', backgroundColor: cfg?.bg ?? 'rgba(16,185,129,0.1)', borderColor: cfg?.border ?? 'rgba(16,185,129,0.25)' }
                        : { color: textMuted, backgroundColor: 'transparent', borderColor: border }
                      }
                    >
                      {s === 'ALL' ? 'All' : s === 'IN_PROGRESS' ? 'In Progress' : s === 'ON_THE_WAY' ? 'On the way' : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')}
                    </button>
                  )
                })}
              </div>
              <Link to="/tickets" className="text-xs font-bold text-[#10B981] hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3 p-5">
              {[1, 2, 3].map(i => (
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse" style={{ minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: `1.5px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : 'rgba(15,26,46,0.3)' }}>
                    <th className="px-5 py-3 font-bold uppercase tracking-wider text-[10px]" style={{ color: textMuted }}>Ticket / Service</th>
                    <th className="px-5 py-3 font-bold uppercase tracking-wider text-[10px]" style={{ color: textMuted }}>Branch</th>
                    <th className="px-5 py-3 font-bold uppercase tracking-wider text-[10px]" style={{ color: textMuted }}>Technician</th>
                    <th className="px-5 py-3 font-bold uppercase tracking-wider text-[10px]" style={{ color: textMuted }}>Date & Time</th>
                    <th className="px-5 py-3 font-bold uppercase tracking-wider text-[10px]" style={{ color: textMuted }}>Status</th>
                    <th className="px-3 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: border }}>
                  {filtered.slice(0, 10).map((t, idx) => {
                    const sk = statusKey(t.status)
                    const cfg = STATUS_CFG[sk] ?? STATUS_CFG.PENDING
                    const SvcIcon = SVC_ICON[t.serviceType] ?? Wrench
                    
                    // Mock branches based on index for beautiful visuals
                    const isEven = idx % 2 === 0
                    const mockBranch = isEven ? 'Main Branch' : 'Matina Branch'
                    const mockLocation = isEven ? 'Davao City' : 'Davao City'
                    
                    // Get date/time
                    const createdIso = t.createdAt || t.created_at
                    const dateFormatted = createdIso ? new Date(createdIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
                    const timeFormatted = createdIso ? new Date(createdIso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'
                    
                    // Technician initials & name
                    const techName = t.assigned_employee_name || 'Unassigned'
                    const techInitials = techName !== 'Unassigned' ? techName.split(' ').map(n => n[0]).join('').toUpperCase() : '?'
                    
                    return (
                      <tr key={t.id} 
                          className="hover:bg-slate-500/5 transition-colors cursor-pointer"
                          onClick={() => navigate(ticketsLink(t.id, t.status))}>
                        
                        {/* 1. Ticket / Service */}
                        <td className="px-5 py-3.5 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" 
                               style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}>
                            <SvcIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold truncate" style={{ color: textPrimary }}>
                              {t.serviceType || 'S/I Service'}
                            </p>
                            <p className="text-[10px] truncate" style={{ color: textMuted }}>
                              {t.title}
                            </p>
                            <p className="text-[9px] font-semibold opacity-60" style={{ color: textMuted }}>
                              #{t.id.slice(0, 8).toUpperCase()}
                            </p>
                          </div>
                        </td>
                        
                        {/* 2. Branch */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-slate-500/10" style={{ color: textMuted }}>
                              <Building2 className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <p className="font-bold" style={{ color: textPrimary }}>{mockBranch}</p>
                              <p className="text-[10px]" style={{ color: textMuted }}>{mockLocation}</p>
                            </div>
                          </div>
                        </td>
                        
                        {/* 3. Technician */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px]"
                                 style={{ 
                                   backgroundColor: techName === 'Unassigned' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', 
                                   color: techName === 'Unassigned' ? '#EF4444' : '#3B82F6' 
                                 }}>
                              {techInitials}
                            </div>
                            <span className="font-semibold text-xs" style={{ color: techName === 'Unassigned' ? textMuted : textPrimary }}>
                              {techName}
                            </span>
                          </div>
                        </td>
                        
                        {/* 4. Date & Time */}
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-xs" style={{ color: textPrimary }}>{dateFormatted}</p>
                          <p className="text-[10px]" style={{ color: textMuted }}>{timeFormatted}</p>
                        </td>
                        
                        {/* 5. Status */}
                        <td className="px-5 py-3.5">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border tracking-wider"
                                style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}>
                            {cfg.label}
                          </span>
                        </td>
                        
                        {/* 6. Action */}
                        <td className="px-3 py-3.5 text-center" onClick={(e) => { e.stopPropagation(); navigate(ticketsLink(t.id, t.status)) }}>
                          <span className="text-base font-black hover:opacity-80 p-1" style={{ color: textMuted }}>⋮</span>
                        </td>
                        
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${border}`, backgroundColor: inputBg }}>
              <span className="text-[12px]" style={{ color: textMuted }}>Showing {Math.min(10, filtered.length)} of {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
              <Link to="/tickets" className="text-[12px] font-bold text-[#10B981] hover:underline flex items-center gap-1">
                View all tickets <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

        </div>

        {/* Right Column: Today's Schedule */}
        <div className="rounded-3xl shadow-sm flex flex-col p-5 gap-5" 
             style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          
          <div className="flex items-center justify-between">
            <h3 className="font-black text-sm" style={{ color: textPrimary }}>Today's Schedule</h3>
            <Link to="/tickets" className="text-xs font-bold text-[#10B981] hover:underline">
              View all
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            {/* 1. Today's Schedules */}
            <div className="rounded-2xl p-4 flex items-center justify-between" 
                 style={{ backgroundColor: isLight ? '#F0FDF4' : 'rgba(16,185,129,0.06)', border: `1px solid ${isLight ? '#DCFCE7' : 'rgba(16,185,129,0.15)'}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#10B981]/20 text-[#10B981]">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Today's Schedules</h4>
                </div>
              </div>
              <span className="text-xl font-black text-[#10B981]">{todaysSchedulesCount}</span>
            </div>

            {/* 2. Upcoming */}
            <div className="rounded-2xl p-4 flex items-center justify-between" 
                 style={{ backgroundColor: isLight ? '#FFFBEB' : 'rgba(245,158,11,0.06)', border: `1px solid ${isLight ? '#FEF3C7' : 'rgba(245,158,11,0.15)'}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#F59E0B]/20 text-[#F59E0B]">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Upcoming</h4>
                </div>
              </div>
              <span className="text-xl font-black text-[#F59E0B]">{upcomingCount}</span>
            </div>

            {/* 3. Urgent */}
            <div className="rounded-2xl p-4 flex items-center justify-between" 
                 style={{ backgroundColor: isLight ? '#FEF2F2' : 'rgba(239,68,68,0.06)', border: `1px solid ${isLight ? '#FEE2E2' : 'rgba(239,68,68,0.15)'}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#EF4444]/20 text-[#EF4444]">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Urgent</h4>
                </div>
              </div>
              <span className="text-xl font-black text-[#EF4444]">{urgentCount}</span>
            </div>
          </div>

          {/* Caught Up Info Box */}
          <div className="mt-auto rounded-2xl p-3.5 flex items-center gap-2.5 text-[11px]" 
               style={{ backgroundColor: inputBg, border: `1px solid ${border}`, color: textMuted }}>
            <CheckCircle className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>
              {urgentCount === 0 
                ? "You're all caught up! No urgent items." 
                : `You have ${urgentCount} urgent item${urgentCount > 1 ? 's' : ''} to resolve.`}
            </span>
          </div>

        </div>

      </div>

      {/* ── Technician Workload & Quick Assign ── */}
      {isAdminOrManager && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
             <div className="px-5 py-4 flex justify-between items-center" style={{ borderBottom: `1px solid ${border}` }}>
                 <h3 className="font-black text-base" style={{ color: textPrimary }}>Pending Schedules</h3>
                 <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
                   {tickets.filter(t => t.status.toUpperCase() === 'PENDING' && isFieldCategory(inferCategoryFromTicket(t))).length} unassigned
                 </span>
             </div>
             <div className="flex-1 overflow-y-auto max-h-[300px]">
               {tickets.filter(t => t.status.toUpperCase() === 'PENDING' && isFieldCategory(inferCategoryFromTicket(t))).length === 0 ? (
                  <div className="p-8 text-center" style={{ color: textMuted }}>
                     <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                     <p className="text-sm font-bold">All caught up</p>
                  </div>
               ) : (
                  <div className="divide-y" style={{ borderColor: border }}>
                    {tickets.filter(t => t.status.toUpperCase() === 'PENDING' && isFieldCategory(inferCategoryFromTicket(t))).map(t => (
                       <div key={t.id} className="p-4 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <div className="flex-1 min-w-0">
                             <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{t.title}</p>
                             <p className="text-xs truncate" style={{ color: textMuted }}>{(t.customerName || t.customer_name) || 'Customer'} · {formatDate(t.createdAt || t.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                            <select
                              className="text-xs py-2 px-3 rounded-xl border flex-1 sm:w-36 transition-all"
                              style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                              onChange={(e) => handleQuickAssign(t.id, e.target.value)}
                              disabled={assignLoading === t.id}
                              value=""
                            >
                              <option value="" disabled>Assign to...</option>
                              {technicians.map(tech => (
                                 <option key={tech.id} value={tech.id}>{tech.name}</option>
                              ))}
                            </select>
                            {assignLoading === t.id && <RefreshCw className="w-5 h-5 animate-spin shrink-0" style={{ color: textMuted }} />}
                          </div>
                       </div>
                    ))}
                  </div>
               )}
             </div>
          </div>
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
             <div className="px-5 py-4 flex justify-between items-center" style={{ borderBottom: `1px solid ${border}` }}>
                 <h3 className="font-black text-base" style={{ color: textPrimary }}>Technician Workload</h3>
                 <span className="text-[11px] font-bold px-2 py-1 uppercase tracking-wider" style={{ color: textMuted }}>{technicians.length} tech{technicians.length !== 1 ? 's' : ''}</span>
             </div>
             <div className="flex-1 overflow-y-auto max-h-[300px]">
                {technicians.length === 0 ? (
                   <div className="p-8 text-center" style={{ color: textMuted }}>
                     <p className="text-sm">No technicians found in this branch.</p>
                   </div>
                ) : (
                   <div className="divide-y" style={{ borderColor: border }}>
                     {technicians.map(tech => {
                        const techTickets = tickets.filter(t => t.assignedTo === tech.id || t.assigned_employee_name === tech.name)
                        const active = techTickets.filter(t => ['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(t.status.toUpperCase())).length
                        const completed = techTickets.filter(t => t.status.toUpperCase() === 'COMPLETED').length
                        
                        return (
                          <div key={tech.id} className="p-4 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm" style={{ backgroundColor: `${STATUS_CFG.IN_PROGRESS.color}15`, color: STATUS_CFG.IN_PROGRESS.color }}>
                                  {tech.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                   <p className="text-sm font-bold" style={{ color: textPrimary }}>{tech.name}</p>
                                   <p className="text-xs" style={{ color: textMuted }}>{completed} completed job{completed !== 1 ? 's' : ''}</p>
                                </div>
                             </div>
                             <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: active > 0 ? '#10B981' : textMuted, opacity: active > 0 ? 1 : 0.4 }} />
                                <span className="text-sm font-black" style={{ color: textPrimary }}>{active} active</span>
                             </div>
                          </div>
                        )
                     })}
                   </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* ── Fleet Map for Managers ── */}
      {isAdminOrManager && (
        <div className="rounded-2xl overflow-hidden flex flex-col" style={{ backgroundColor: cardBg, border: `1px solid ${border}`, height: '400px' }}>
          <div className="px-5 py-4 flex justify-between items-center" style={{ borderBottom: `1px solid ${border}` }}>
            <h3 className="font-black text-base" style={{ color: textPrimary }}>Fleet Map</h3>
            <span className="text-[11px] font-bold px-2 py-1 uppercase tracking-wider" style={{ color: textMuted }}>Live tracking</span>
          </div>
          <div className="flex-1 relative">
            <FleetMap />
          </div>
        </div>
      )}

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
            {(activeTicket.scheduledDate || getPreferredDate(activeTicket)) && (
              <span className="flex items-center gap-1.5 text-[12px]" style={{ color: textMuted }}>
                <CalendarDays className="w-3.5 h-3.5" />
                {formatDate(activeTicket.scheduledDate || getPreferredDate(activeTicket))}
              </span>
            )}
            {formatLocationLine(activeTicket.location) && (
              <span className="flex items-center gap-1.5 text-[12px]" style={{ color: textMuted }}>
                <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="break-words">{formatLocationLine(activeTicket.location)}</span>
              </span>
            )}
          </div>

          <Link
            to={ticketsLink(activeTicket.id, activeTicket.status)}
            className="inline-flex items-center gap-1.5 text-sm font-bold transition-colors hover:opacity-80"
            style={{ color: STATUS_CFG[statusKey(activeTicket.status)]?.color ?? '#10B981' }}
          >
            View Details <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Search Result Detail Modal */}
      <SearchResultDetailModal
        result={selectedSearchResult}
        onClose={() => setSelectedSearchResult(null)}
      />
    </div>
  )
}
