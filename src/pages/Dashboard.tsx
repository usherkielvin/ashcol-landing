// @ts-nocheck
import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Clock, CheckCircle, AlertCircle,
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

import { 
  FiSearch, 
  FiBell, 
  FiMoon, 
  FiSun,
  FiCalendar, 
  FiClock, 
  FiAlertCircle 
} from "react-icons/fi";
import { 
  MdOutlineConfirmationNumber, 
  MdOutlineBusiness, 
  MdHelpOutline 
} from "react-icons/md";

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

// const SVC_ICON: Record<string, typeof Wrench> = {
//   Cleaning: Wrench, Maintenance: Wrench, Repair: Zap,
//   Installation: Building2, Ducting: Wind,
// }

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
  const { theme, toggleTheme } = useTheme()
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
  const [filterStatus] = useState('ALL') // removed setFilterStatus
  const [activeFilter, setActiveFilter] = useState("All");

  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const filters = ["All", "Pending", "In Progress", "Completed"];

  // Mock data for the populated table
  const recentTickets = [
    {
      id: "#12345678",
      service: "T3 (DOMINIC) - 1S",
      branch: "Main Branch",
      city: "Davao City",
      tech: "Unassigned",
      date: "June 23, 2026",
      time: "4:39 PM",
      status: "Pending"
    },
    {
      id: "#12345678",
      service: "T3 (ONCALL) - 2S",
      branch: "Matina Branch",
      city: "Davao City",
      tech: "Unassigned",
      date: "June 23, 2026",
      time: "4:39 PM",
      status: "Pending"
    },
    {
      id: "#12345678",
      service: "STRADA (ROMMEL) - 3S",
      branch: "Matina Branch",
      city: "Davao City",
      tech: "Unassigned",
      date: "June 23, 2026",
      time: "4:39 PM",
      status: "Pending"
    }
  ];
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([])
  const [assignLoading, setAssignLoading] = useState<string | null>(null)
  const [selectedSearchResult, setSelectedSearchResult] = useState<any>(null)

  // const [currentTime, setCurrentTime] = useState(new Date())
  // useEffect(() => {
  //   const timer = setInterval(() => setCurrentTime(new Date()), 60000)
  //   return () => clearInterval(timer)
  // }, [])

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

  const filtered = useMemo(() => {
    const statusKey = activeFilter.toUpperCase().replace(' ', '_');
    return statusKey === 'ALL'
      ? tickets
      : tickets.filter(t => {
          const u = (t.status || '').toUpperCase()
          if (statusKey === 'IN_PROGRESS' && (isCustomer || isAdminOrManager)) {
            return u === 'IN_PROGRESS' || u === 'ON_THE_WAY'
          }
          return u === statusKey
        })
  }, [tickets, activeFilter, isCustomer, isAdminOrManager])

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

  // const filterPills = isEmployee
  //   ? ['ALL', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'] as const
  //   : ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const

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
    <div className="w-full h-full flex flex-col font-sans">
      
      {/* 1. Full-width Hero Header (Compacted to match global header) */}
      <header 
        className="relative flex justify-between items-start py-4 px-8 border-b z-10 sticky top-0 transition-colors shrink-0"
        style={{
          backgroundColor: isLight ? '#ffffff' : '#0a1120',
          borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)'
        }}
      >
        {/* Left: Greeting */}
        <div>
          <h1 className="text-[28px] font-black tracking-tight uppercase transition-colors" style={{ color: isLight ? '#111827' : '#ffffff' }}>
            Good Morning, Usher!
          </h1>
          <p className="text-sm mt-1 transition-colors" style={{ color: isLight ? '#6b7280' : '#9ca3af' }}>
            Here's what's happening with your service operations today.
          </p>
        </div>

        {/* Center: Title (Absolutely positioned to stay centered) */}
        <div className="absolute left-1/2 -translate-x-1/2 text-center pt-1 pointer-events-none">
          <h2 className="text-lg font-bold uppercase tracking-widest transition-colors" style={{ color: isLight ? '#111827' : '#ffffff' }}>Overview</h2>
          <p className="text-sm uppercase tracking-wider font-medium mt-1 transition-colors" style={{ color: isLight ? '#9ca3af' : '#6b7280' }}>Branch - Bulacan</p>
        </div>

        {/* Right: Date & Controls */}
        <div className="flex flex-col items-end space-y-3 pt-1">
          <div className="flex items-center border rounded-md px-3 py-1.5 shadow-sm transition-colors"
               style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
            <FiCalendar className="text-green-600 mr-2" size={16} />
            <span className="text-sm font-medium transition-colors" style={{ color: isLight ? '#374151' : '#d1d5db' }}>
              {now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center border rounded-full px-3 py-1.5 transition-colors"
                 style={{ backgroundColor: isLight ? '#f0fdf4' : 'rgba(34,197,94,0.1)', borderColor: isLight ? '#bbf7d0' : 'rgba(34,197,94,0.2)' }}>
              <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
              <span className="text-[11px] font-bold uppercase tracking-wide transition-colors" style={{ color: isLight ? '#15803d' : '#4ade80' }}>Operations Online</span>
            </div>
            <button className="p-2 border rounded-md shadow-sm transition-colors hover:opacity-80"
                    style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)', color: isLight ? '#4b5563' : '#d1d5db' }}>
              <FiBell size={16} />
            </button>
            <button onClick={toggleTheme} title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'} className="p-2 border rounded-md shadow-sm transition-colors hover:opacity-80"
                    style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)', color: isLight ? '#4b5563' : '#d1d5db' }}>
              {isLight ? <FiMoon size={16} /> : <FiSun size={16} />}
            </button>
            <div className="border rounded-md px-3 py-1.5 shadow-sm text-sm font-medium transition-colors tabular-nums"
                 style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)', color: isLight ? '#374151' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <div className="p-8 space-y-8 flex-1 overflow-y-auto">
        {/* 2. Top Metrics & Search Bar */}
        <div className="flex justify-between items-center">
          {/* Metric Cards */}
          <div className="flex space-x-4">
          <div className="border rounded-xl py-3 px-6 text-center shadow-sm min-w-[120px] transition-colors" style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
            <div className="text-[32px] leading-none font-bold mb-1 transition-colors" style={{ color: isLight ? '#111827' : '#f9fafb' }}>
              {statsData?.total_tickets ?? statsData?.total ?? 0}
            </div>
            <div className="text-[10px] font-bold text-[#4caf50] uppercase tracking-wider">Total Tickets</div>
          </div>
          <div className="border rounded-xl py-3 px-6 text-center shadow-sm min-w-[120px] transition-colors" style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
            <div className="text-[32px] leading-none font-bold mb-1 transition-colors" style={{ color: isLight ? '#111827' : '#f9fafb' }}>
              {statsData?.pending_tickets ?? 0}
            </div>
            <div className="text-[10px] font-bold text-[#f5a623] uppercase tracking-wider">Pending</div>
          </div>
          <div className="border rounded-xl py-3 px-6 text-center shadow-sm min-w-[120px] transition-colors" style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
            <div className="text-[32px] leading-none font-bold mb-1 transition-colors" style={{ color: isLight ? '#111827' : '#f9fafb' }}>
              {statsData?.in_progress_tickets ?? 0}
            </div>
            <div className="text-[10px] font-bold text-[#4a90e2] uppercase tracking-wider">In Progress</div>
          </div>
          <div className="border rounded-xl py-3 px-6 text-center shadow-sm min-w-[120px] transition-colors" style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
            <div className="text-[32px] leading-none font-bold mb-1 transition-colors" style={{ color: isLight ? '#111827' : '#f9fafb' }}>
              {statsData?.completed_tickets ?? 0}
            </div>
            <div className="text-[10px] font-bold text-[#9013fe] uppercase tracking-wider">Completed</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-[500px] relative z-10">
          <GlobalSearch onResultClick={(res) => setSelectedSearchResult(res)} />
        </div>
      </div>

      {/* 3. Middle Section: Recent Tickets & Today's Schedule */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        
        {/* Left Panel: Recent Tickets (8 cols) */}
        <div className="col-span-8 rounded-xl border shadow-sm flex flex-col overflow-hidden transition-colors"
             style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
          
          {/* Interactive Panel Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50 dark:border-slate-800 dark:bg-slate-800/30">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Recent Tickets</h2>
            <div className="flex items-center space-x-2">
              {filters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
                    activeFilter === filter 
                      ? "text-[#268038] bg-[#e6f4ea] border border-[#268038]/20 dark:bg-emerald-900/30 dark:text-emerald-400" 
                      : "text-gray-500 hover:bg-gray-100 border border-transparent dark:text-gray-400 dark:hover:bg-slate-800"
                  }`}
                >
                  {filter}
                </button>
              ))}
              <span onClick={() => navigate('/tickets')} className="text-xs font-bold text-[#268038] cursor-pointer ml-3 hover:underline dark:text-emerald-400">View All &gt;</span>
            </div>
          </div>

          {/* Populated Table Area */}
          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
              <div className="p-3 bg-gray-50 rounded-xl mb-3 dark:bg-slate-800">
                <FileText size={24} className="text-gray-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1 dark:text-white">No tickets found</h3>
              <p className="text-xs text-gray-500">No tickets match the selected filter.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-800 uppercase tracking-wider border-b border-gray-200 bg-gray-50/30 dark:text-gray-300 dark:border-slate-700 dark:bg-slate-800/30">
                    <th className="py-4 px-6">Ticket / Service</th>
                    <th className="py-4 px-6">Location</th>
                    <th className="py-4 px-6 text-center">Technician</th>
                    <th className="py-4 px-6">Date & Time</th>
                    <th className="py-4 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {filtered.slice(0, 50).map((ticket, index) => {
                    const locLine = formatLocationLine(ticket.location) || 'Unknown Location'
                    const techName = ticket.assigned_employee_name || ticket.assignedTo || 'Unassigned'
                    const prefDateStr = getPreferredDate(ticket)
                    const dateStr = formatDate(prefDateStr) || 'No Date'
                    const timeStr = prefDateStr ? new Date(prefDateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
                    const stCfg = STATUS_CFG[statusKey(ticket.status)]
                    
                    return (
                      <tr key={ticket.id || index} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-[#e6f4ea] text-[#268038] rounded-md border border-[#268038]/20 dark:bg-emerald-900/30 dark:text-emerald-400">
                              <MdOutlineConfirmationNumber size={18} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900 dark:text-white">{ticket.serviceType || 'Unknown Service'}</p>
                              <p className="text-[11px] text-gray-400">{(ticket.id || '').split('-')[0]}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-2">
                            <div className="p-1.5 bg-gray-100 text-gray-500 rounded-md dark:bg-slate-800 dark:text-slate-400">
                              <MdOutlineBusiness size={14} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[150px]">{locLine}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="inline-flex items-center space-x-1.5 text-gray-400 dark:text-slate-400">
                            <MdHelpOutline size={16} />
                            <span className="text-xs font-medium">{techName}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{dateStr}</p>
                          <p className="text-[11px] text-gray-400">{timeStr}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span 
                            className="inline-block px-4 py-1.5 text-xs font-bold rounded-md shadow-sm border"
                            style={{ 
                              color: stCfg?.color || '#9ca3af', 
                              backgroundColor: stCfg?.bg || 'transparent',
                              borderColor: stCfg?.border || 'transparent'
                            }}
                          >
                            {stCfg?.label || ticket.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-800">
            <p className="text-[11px] text-gray-400 font-medium">Showing {Math.min(filtered.length, 50)} out of {filtered.length} tickets</p>
          </div>
        </div>

        {/* Right Panel: Today's Schedule (4 cols) */}
        <div className="col-span-4 bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col transition-colors" style={{ backgroundColor: isLight ? '#ffffff' : '#1f2937', borderColor: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)' }}>
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold transition-colors" style={{ color: isLight ? '#111827' : '#f9fafb' }}>Today's Schedule</h2>
            <span onClick={() => navigate('/tickets')} className="text-xs font-bold text-[#268038] cursor-pointer hover:underline">View All &gt;</span>
          </div>

          <div className="space-y-4 flex-1">
            <div className="flex items-center p-4 bg-[#5cb85c] rounded-xl shadow-sm text-white transition-opacity hover:opacity-90 cursor-pointer" onClick={() => navigate('/tickets?filter=today')}>
              <div className="p-3 bg-white/20 rounded-lg mr-4">
                <FiCalendar size={24} />
              </div>
              <div>
                <p className="text-[32px] font-bold leading-none mb-1">{todaysSchedulesCount}</p>
                <p className="text-xs font-bold tracking-wider uppercase opacity-90">Scheduled</p>
              </div>
            </div>

            <div className="flex items-center p-4 bg-[#f0ad4e] rounded-xl shadow-sm text-white transition-opacity hover:opacity-90 cursor-pointer" onClick={() => navigate('/tickets?filter=upcoming')}>
              <div className="p-3 bg-white/20 rounded-lg mr-4">
                <FiClock size={24} />
              </div>
              <div>
                <p className="text-[32px] font-bold leading-none mb-1">{upcomingCount}</p>
                <p className="text-xs font-bold tracking-wider uppercase opacity-90">Upcoming</p>
              </div>
            </div>

            <div className="flex items-center p-4 bg-[#d9534f] rounded-xl shadow-sm text-white transition-opacity hover:opacity-90 cursor-pointer" onClick={() => navigate('/tickets?filter=urgent')}>
              <div className="p-3 bg-white/20 rounded-lg mr-4">
                <FiAlertCircle size={24} />
              </div>
              <div>
                <p className="text-[32px] font-bold leading-none mb-1">{urgentCount}</p>
                <p className="text-xs font-bold tracking-wider uppercase opacity-90">Urgent</p>
              </div>
            </div>
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
    </div>
  )
}
