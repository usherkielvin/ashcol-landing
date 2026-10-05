import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, Loader2, ClipboardCheck, QrCode, ArrowRightCircle, Ban,
  Phone, MapPin, Calendar, Wrench, CheckCircle2,
  Clock, AlertCircle, Copy, Check, MessageCircle, Send, Building2, Mail
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import { fetchCachedBranches } from '../utils/portalDirectoryCache'
import BookingQrModal from '../components/BookingQrModal'

export interface Booking {
  id: string
  customerName: string
  contactPhone: string
  customerEmail?: string
  region?: string
  city?: string
  barangay?: string
  street?: string
  landmark?: string
  brand?: string
  capacity?: string
  requestedDate?: string
  issueDescription?: string
  serviceType?: string
  airconType?: string
  unitQuantity?: number
  preferredTimeSlot?: 'MORNING' | 'AFTERNOON' | 'ANYTIME' | string
  photoUrl1?: string
  photoUrl2?: string
  branchId?: string
  outOfServiceArea?: boolean
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED'
  convertedTicketId?: string | null
  dismissalReason?: string
  createdAt: string
}

const DISMISSAL_REASONS = [
  { value: 'OUT_OF_SERVICE_AREA', label: 'Out of Service Area' },
  { value: 'UNREACHABLE', label: 'Unreachable' },
  { value: 'CUSTOMER_CANCELLED', label: 'Customer Cancelled' },
  { value: 'DUPLICATE', label: 'Duplicate' },
] as const

const TIME_SLOT_LABELS: Record<string, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  ANYTIME: 'Anytime',
}

function authToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

function smsHref(phone: string): string {
  return `sms:${phone}`
}

function viberHref(phone: string): string {
  return `viber://chat?number=${encodeURIComponent(phone.replace(/[^\d+]/g, ''))}`
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

function formatAddress(b: Booking): string {
  return [b.street, b.barangay, b.city, b.region].filter(Boolean).join(', ')
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  const clean = dateStr.split('T')[0].trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return dateStr
  const [yearStr, monthStr, dayStr] = clean.split('-')
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthName = MONTH_NAMES[parseInt(monthStr, 10) - 1] || 'Jan'
  return `${monthName} ${parseInt(dayStr, 10)}, ${yearStr}`
}

function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('09')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 12 && digits.startsWith('639')) {
    return `0${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  return phone
}

function formatSentDateTime(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      const timeStr = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      const datePart = formatDate(dateStr) || d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      return `Sent ${timeStr}, ${datePart}`
    }
  } catch {
    // fallback
  }
  return `Sent ${formatDate(dateStr)}`
}

async function fetchBookings(token: string, status?: string): Promise<Booking[]> {
  const params = new URLSearchParams()
  if (status && status !== 'ALL') params.set('status', status)
  const res = await fetch(`${API_BASE_URL}/bookings?${params}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Failed to load bookings')
  const data = await res.json()
  return data?.data || []
}

export default function Bookings() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const isLight = theme === 'light'

  // Colors & tokens
  const cardBg = isLight ? '#ffffff' : '#0B132B'
  const panelBg = isLight ? '#f8fafc' : '#080E1E'
  const border = isLight ? '#e2e8f0' : '#1E2D4A'
  const textPrimary = isLight ? '#0f172a' : '#F1F5F9'
  const textMuted = isLight ? '#64748b' : '#849BBE'
  const inputBg = isLight ? '#ffffff' : '#0F1A30'
  const inputBorder = isLight ? '#cbd5e1' : '#243454'
  const rowHover = isLight ? '#f1f5f9' : '#111D36'
  const green = '#10B981'

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED'>('ALL')
  const [branchFilter, setBranchFilter] = useState<string>('ALL')
  const [branchNames, setBranchNames] = useState<Record<string, string>>({})
  const [showQr, setShowQr] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dismissTargetId, setDismissTargetId] = useState<string | null>(null)

  useEffect(() => {
    fetchCachedBranches(authToken())
      .then(list => {
        const map: Record<string, string> = {}
        for (const b of list) {
          const id = String(b.id ?? '')
          const name = String(b.name ?? b.location ?? id)
          if (id) map[id] = name
        }
        setBranchNames(map)
      })
      .catch(() => setBranchNames({}))
  }, [])

  const loadBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const rows = await fetchBookings(authToken(), statusFilter)
      setBookings(rows)
    } catch (err) {
      if (!silent) setError(errMsg(err, 'Failed to load bookings'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadBookings()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadBookings(true)
      }
    }, 20_000)
    return () => clearInterval(interval)
  }, [loadBookings])

  // Count stats
  const stats = useMemo(() => {
    return {
      all: bookings.length,
      new: bookings.filter(b => b.status === 'NEW').length,
      contacted: bookings.filter(b => b.status === 'CONTACTED').length,
      converted: bookings.filter(b => b.status === 'CONVERTED').length,
      dismissed: bookings.filter(b => b.status === 'DISMISSED').length,
    }
  }, [bookings])

  const visible = useMemo(() => {
    let rows = bookings
    if (branchFilter !== 'ALL') {
      rows = branchFilter === 'UNASSIGNED'
        ? rows.filter(b => !b.branchId)
        : rows.filter(b => b.branchId === branchFilter)
    }
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(b => {
      const blob = [
        b.customerName,
        b.contactPhone,
        formatAddress(b),
        b.serviceType,
        b.airconType,
        b.brand,
        b.capacity,
        b.issueDescription,
      ]
        .filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [bookings, search, branchFilter])

  const branchTabs = useMemo(() => {
    const ids = Array.from(new Set(bookings.map(b => b.branchId).filter(Boolean))) as string[]
    return ids.map(id => ({ id, label: branchNames[id] || 'Unknown Branch' }))
  }, [bookings, branchNames])

  const patchBooking = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusyId(id)
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update booking')
      const data = await res.json()
      const updated = data?.data
      if (updated) {
        setBookings(prev => prev.map(b => (b.id === id ? updated : b)))
        if (selectedBooking?.id === id) setSelectedBooking(updated)
      }
    } catch (err) {
      setError(errMsg(err, 'Failed to update booking'))
    } finally {
      setBusyId(null)
    }
  }, [selectedBooking])

  const openDismissPicker = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setDismissTargetId(id)
  }, [])

  const confirmDismiss = useCallback((reason: string) => {
    if (!dismissTargetId) return
    void patchBooking(dismissTargetId, { status: 'DISMISSED', dismissalReason: reason })
    setDismissTargetId(null)
  }, [dismissTargetId, patchBooking])

  const markContacted = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    void patchBooking(id, { status: 'CONTACTED' })
  }, [patchBooking])

  const convertToTicket = useCallback((booking: Booking, e?: React.MouseEvent) => {
    e?.stopPropagation()
    navigate('/relays', { state: { bookingPrefill: booking } })
  }, [navigate])

  const copyPhone = useCallback((id: string, phone: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    navigator.clipboard.writeText(phone).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }, [])

  const statusColor = (status: Booking['status']) => {
    switch (status) {
      case 'NEW': return '#3B82F6'
      case 'CONTACTED': return '#F59E0B'
      case 'CONVERTED': return green
      case 'DISMISSED': return isLight ? '#94A3B8' : '#64748B'
    }
  }

  const serviceTypeBadge = (serviceType?: string) => {
    if (!serviceType) {
      return <span className="italic text-slate-400 font-normal">Not specified</span>
    }
    const clean = serviceType.toUpperCase()
    let badgeColor = isLight
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-blue-500/10 text-blue-400 border-blue-500/20'

    if (clean.includes('CLEAN')) {
      badgeColor = isLight
        ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
        : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    } else if (clean.includes('INSTALL')) {
      badgeColor = isLight
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    } else if (clean.includes('REPAIR') || clean.includes('CHECK')) {
      badgeColor = isLight
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    } else if (clean.includes('SURVEY')) {
      badgeColor = isLight
        ? 'bg-purple-50 text-purple-700 border-purple-200'
        : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    } else if (clean.includes('DISMANTLE') || clean.includes('RELOCAT')) {
      badgeColor = isLight
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${badgeColor}`}>
        {serviceType}
      </span>
    )
  }

  const statusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'NEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            New
          </span>
        )
      case 'CONTACTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Contacted
          </span>
        )
      case 'CONVERTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Converted
          </span>
        )
      case 'DISMISSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <Ban className="w-3 h-3" />
            Dismissed
          </span>
        )
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 p-4 md:p-6 gap-5 overflow-hidden font-['Inter',sans-serif]">
      {/* Top Header & Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-black tracking-tight" style={{ color: textPrimary }}>
              Service Bookings
            </h1>
            {stats.new > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm shadow-emerald-500/30">
                {stats.new} New
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: textMuted }}>
            Online service requests submitted from ashcol.com.ph/booking
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowQr(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm hover:shadow active:scale-95"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          >
            <QrCode className="w-4 h-4 text-emerald-500" />
            Show QR Code
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        {/* Status Pill Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl border shrink-0" style={{ backgroundColor: panelBg, borderColor: border }}>
          {[
            { id: 'ALL', label: 'All', count: stats.all },
            { id: 'NEW', label: 'New', count: stats.new },
            { id: 'CONTACTED', label: 'Contacted', count: stats.contacted },
            { id: 'CONVERTED', label: 'Converted', count: stats.converted },
            { id: 'DISMISSED', label: 'Dismissed', count: stats.dismissed },
          ].map(tab => {
            const active = statusFilter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  active ? 'shadow-sm font-bold' : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: active ? (isLight ? '#ffffff' : '#16233B') : 'transparent',
                  color: active ? (tab.id === 'NEW' && stats.new > 0 ? '#3B82F6' : textPrimary) : textMuted,
                  border: active ? `1px solid ${border}` : '1px solid transparent',
                }}
              >
                {tab.label}
                <span 
                  className="px-1.5 py-0.2 rounded-md text-[10px] font-bold"
                  style={{
                    backgroundColor: active ? (isLight ? '#f1f5f9' : '#0B132B') : (isLight ? '#e2e8f0' : '#16233B'),
                    color: active ? textPrimary : textMuted
                  }}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Branch Filter */}
        {branchTabs.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Building2 className="w-3.5 h-3.5" style={{ color: textMuted }} />
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="text-xs font-semibold rounded-lg border px-2 py-1.5 outline-none"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              <option value="ALL">All Branches</option>
              {branchTabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              <option value="UNASSIGNED">Unassigned / Out of Area</option>
            </select>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
          <input
            type="text"
            placeholder="Search customer, phone, issue..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs outline-none border transition-all placeholder:text-slate-400"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-slate-500/10"
              style={{ color: textMuted }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold shrink-0 border" style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', color: '#EF4444' }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Main Table Container — desktop/tablet */}
      <div
        className="hidden md:flex flex-1 min-h-0 border rounded-2xl overflow-hidden shadow-sm flex-col"
        style={{ backgroundColor: cardBg, borderColor: border }}
      >
        <div className="overflow-auto flex-1 h-full min-h-0">
          <table className="w-full text-left border-collapse min-w-[1040px]">
            <thead>
              <tr 
                className="text-[11px] font-bold uppercase tracking-wider select-none border-b sticky top-0 z-10"
                style={{ backgroundColor: panelBg, borderColor: border, color: textMuted }}
              >
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Contact Number</th>
                <th className="px-5 py-3.5">Service Type</th>
                <th className="px-5 py-3.5">Aircon Unit</th>
                <th className="px-5 py-3.5">Issue</th>
                <th className="px-5 py-3.5">Location</th>
                <th className="px-5 py-3.5">Requested Visit</th>
                <th className="px-5 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs" style={{ borderColor: border }}>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center" style={{ color: textMuted }}>
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    <p className="font-semibold text-sm">Loading bookings...</p>
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center" style={{ color: textMuted }}>
                    <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-bold text-sm text-slate-400">No bookings found</p>
                    <p className="text-xs mt-1">Try adjusting your status filter or search query.</p>
                  </td>
                </tr>
              ) : visible.map(b => {
                const unitParts = [b.brand, b.capacity].filter(Boolean).join(' ')
                const addressStr = formatAddress(b)
                const isBusy = busyId === b.id
                const isSelected = selectedBooking?.id === b.id

                return (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className="transition-colors cursor-pointer group"
                    style={{ 
                      backgroundColor: isSelected ? (isLight ? '#f1f5f9' : '#111D36') : 'transparent',
                    }}
                    onMouseEnter={el => {
                      if (!isSelected) el.currentTarget.style.backgroundColor = rowHover
                    }}
                    onMouseLeave={el => {
                      if (!isSelected) el.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {/* Customer */}
                    <td className="px-5 py-4">
                      <span className="font-bold text-sm group-hover:text-emerald-500 transition-colors" style={{ color: textPrimary }}>
                        {b.customerName}
                      </span>
                    </td>

                    {/* Contact Number */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => copyPhone(b.id, b.contactPhone, e)}
                        title="Click to copy"
                        className="w-fit inline-flex items-center gap-1.5 text-left text-xs font-semibold tracking-normal transition-colors hover:text-emerald-500"
                        style={{ color: copiedId === b.id ? green : textMuted }}
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span>{copiedId === b.id ? 'Copied' : formatPhoneNumber(b.contactPhone)}</span>
                      </button>
                    </td>

                    {/* Service Type */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {serviceTypeBadge(b.serviceType)}
                    </td>

                    {/* Aircon Unit */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: textPrimary }}>
                        {unitParts || <span className="italic font-medium normal-case text-slate-400">Not specified</span>}
                      </span>
                      {b.airconType && (
                        <div className="text-[11px] mt-0.5" style={{ color: textMuted }}>
                          {b.airconType}{b.unitQuantity && b.unitQuantity > 1 ? ` (${b.unitQuantity} units)` : ''}
                        </div>
                      )}
                    </td>

                    {/* Issue */}
                    <td className="px-5 py-4 max-w-[220px]">
                      <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: textPrimary }} title={b.issueDescription}>
                        {b.issueDescription || <span className="text-slate-400 italic">No description</span>}
                      </p>
                    </td>

                    {/* Location */}
                    <td className="px-5 py-4 max-w-[220px]">
                      <span className="text-xs line-clamp-2 leading-relaxed" style={{ color: textPrimary }} title={addressStr}>
                        {addressStr || <span className="text-slate-400 italic">Not provided</span>}
                      </span>
                    </td>

                    {/* Requested Visit Date */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: textPrimary }}>
                          {formatDate(b.requestedDate) || 'Flexible'}
                        </span>
                        <span className="text-[11px]" style={{ color: textMuted }}>
                          {formatSentDateTime(b.createdAt)}
                        </span>
                      </div>
                    </td>

                    {/* Status — plain text label with its actions combined in the same cell */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                      ) : (
                        <div className="flex flex-col items-start gap-1.5">
                          <span className="text-xs font-black uppercase tracking-wide" style={{ color: statusColor(b.status) }}>
                            {b.status}
                          </span>
                          {(b.status === 'NEW' || b.status === 'CONTACTED') && (
                            <div className="flex items-center gap-3">
                              {b.status === 'NEW' && (
                                <button
                                  type="button"
                                  onClick={(e) => markContacted(b.id, e)}
                                  className="text-[11px] font-bold uppercase tracking-wide hover:underline"
                                  style={{ color: textMuted }}
                                >
                                  Contacted
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => convertToTicket(b, e)}
                                className="text-[11px] font-bold uppercase tracking-wide hover:underline"
                                style={{ color: green }}
                              >
                                Convert
                              </button>
                              <button
                                type="button"
                                onClick={(e) => openDismissPicker(b.id, e)}
                                className="text-[11px] font-bold uppercase tracking-wide hover:underline text-red-500"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Card List — mobile */}
      <div className="md:hidden flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16" style={{ color: textMuted }}>
            <Loader2 className="w-6 h-6 animate-spin mb-2 text-emerald-500" />
            <p className="font-semibold text-sm">Loading bookings...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center" style={{ color: textMuted }}>
            <ClipboardCheck className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-bold text-sm text-slate-400">No bookings found</p>
            <p className="text-xs mt-1">Try adjusting your status filter or search query.</p>
          </div>
        ) : visible.map(b => {
          const unitParts = [b.brand, b.capacity].filter(Boolean).join(' ')
          const addressStr = formatAddress(b)
          const isBusy = busyId === b.id

          return (
            <div
              key={b.id}
              onClick={() => setSelectedBooking(b)}
              className="border rounded-2xl p-4 flex flex-col gap-3 cursor-pointer active:opacity-80 transition-opacity"
              style={{ backgroundColor: cardBg, borderColor: border }}
            >
              {/* Customer + Status */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-bold text-sm tracking-tight" style={{ color: textPrimary }}>{b.customerName}</span>
                  <button
                    type="button"
                    onClick={(e) => copyPhone(b.id, b.contactPhone, e)}
                    className="w-fit inline-flex items-center gap-1.5 text-left text-xs font-semibold tracking-normal transition-colors hover:text-emerald-500 active:scale-95"
                    style={{ color: copiedId === b.id ? green : textMuted }}
                    title="Click to copy"
                  >
                    <Phone className="w-3 h-3 shrink-0 opacity-70" />
                    <span>{copiedId === b.id ? 'Copied' : formatPhoneNumber(b.contactPhone)}</span>
                  </button>
                </div>
                {isBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
                ) : (
                  <span className="text-xs font-black uppercase tracking-wide shrink-0" style={{ color: statusColor(b.status) }}>
                    {b.status}
                  </span>
                )}
              </div>

              {/* Unit & Service Type + Issue */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: textPrimary }}>
                    {unitParts || <span className="italic font-medium normal-case text-slate-400">Not specified</span>}
                  </span>
                  {b.serviceType && serviceTypeBadge(b.serviceType)}
                </div>
                {b.airconType && (
                  <span className="text-[11px]" style={{ color: textMuted }}>
                    {b.airconType}{b.unitQuantity && b.unitQuantity > 1 ? ` · ${b.unitQuantity} units` : ''}
                  </span>
                )}
                <p className="text-xs leading-relaxed line-clamp-2" style={{ color: textMuted }}>
                  {b.issueDescription || <span className="italic text-slate-400">No description</span>}
                </p>
              </div>

              {/* Location */}
              <span className="text-xs leading-relaxed" style={{ color: textMuted }}>
                {addressStr || <span className="italic text-slate-400">Not provided</span>}
              </span>

              {/* Requested visit */}
              <div className="flex items-center justify-between text-xs pt-2 border-t" style={{ borderColor: border }}>
                <span className="font-bold uppercase tracking-wide" style={{ color: textPrimary }}>
                  {formatDate(b.requestedDate) || 'Flexible'}
                </span>
                <span className="text-[11px] sm:text-xs" style={{ color: textMuted }}>{formatSentDateTime(b.createdAt)}</span>
              </div>

              {/* Combined actions */}
              {!isBusy && (b.status === 'NEW' || b.status === 'CONTACTED') && (
                <div className="flex items-center gap-4 pt-1">
                  {b.status === 'NEW' && (
                    <button
                      type="button"
                      onClick={(e) => markContacted(b.id, e)}
                      className="text-[11px] font-bold uppercase tracking-wide hover:underline"
                      style={{ color: textMuted }}
                    >
                      Contacted
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => convertToTicket(b, e)}
                    className="text-[11px] font-bold uppercase tracking-wide hover:underline"
                    style={{ color: green }}
                  >
                    Convert
                  </button>
                  <button
                    type="button"
                    onClick={(e) => openDismissPicker(b.id, e)}
                    className="text-[11px] font-bold uppercase tracking-wide hover:underline text-red-500"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Booking Details Modal (Centered & Redesigned) */}
      {selectedBooking && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedBooking(null)}
        >
          <div 
            className="w-full max-w-3xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: border }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight" style={{ color: textPrimary }}>
                    Booking Details
                  </h2>
                  <p className="text-xs" style={{ color: textMuted }}>
                    Customer service appointment request
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(selectedBooking.status)}
                <button 
                  type="button" 
                  onClick={() => setSelectedBooking(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors ml-1"
                  style={{ color: textMuted }}
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {/* Customer Profile Banner */}
              <div className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 font-bold text-base flex items-center justify-center shrink-0">
                    {selectedBooking.customerName.charAt(0).toUpperCase() || 'C'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Customer</span>
                    <h3 className="text-base sm:text-lg font-bold truncate" style={{ color: textPrimary }}>
                      {selectedBooking.customerName}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`tel:${selectedBooking.contactPhone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {formatPhoneNumber(selectedBooking.contactPhone)}
                  </a>
                  <a
                    href={smsHref(selectedBooking.contactPhone)}
                    title="SMS"
                    className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={viberHref(selectedBooking.contactPhone)}
                    title="Viber"
                    className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border border-purple-500/20 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={(e) => copyPhone(selectedBooking.id, selectedBooking.contactPhone, e)}
                    className="p-1.5 rounded-lg border hover:bg-slate-500/10 transition-colors"
                    style={{ borderColor: inputBorder, color: copiedId === selectedBooking.id ? green : textMuted }}
                    title="Copy Phone Number"
                  >
                    {copiedId === selectedBooking.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {selectedBooking.customerEmail && (
                <div className="p-3.5 rounded-xl border flex items-start gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="text-xs flex-1 min-w-0">
                    <span className="text-[11px] font-medium" style={{ color: textMuted }}>Email (confirmation sent here)</span>
                    <p className="font-semibold text-sm mt-0.5" style={{ color: textPrimary }}>
                      {selectedBooking.customerEmail}
                    </p>
                  </div>
                </div>
              )}

              {/* Service Request Info Grid */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Service & Equipment Details
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3.5 rounded-xl border flex flex-col justify-center" style={{ backgroundColor: panelBg, borderColor: border }}>
                    <span className="text-[11px] font-medium" style={{ color: textMuted }}>Service Type</span>
                    <p className="text-sm font-bold mt-0.5" style={{ color: textPrimary }}>
                      {selectedBooking.serviceType || <span className="italic font-normal text-slate-400">Not specified</span>}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border flex flex-col justify-center" style={{ backgroundColor: panelBg, borderColor: border }}>
                    <span className="text-[11px] font-medium" style={{ color: textMuted }}>Aircon Type / Units</span>
                    <p className="text-sm font-bold mt-0.5" style={{ color: textPrimary }}>
                      {selectedBooking.airconType || 'Not specified'}{selectedBooking.unitQuantity ? ` · ${selectedBooking.unitQuantity} unit${selectedBooking.unitQuantity > 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border flex flex-col justify-center" style={{ backgroundColor: panelBg, borderColor: border }}>
                    <span className="text-[11px] font-medium" style={{ color: textMuted }}>Brand / Model</span>
                    <p className="text-sm font-bold mt-0.5" style={{ color: textPrimary }}>
                      {selectedBooking.brand || <span className="italic font-normal text-slate-400">Not specified</span>}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border flex flex-col justify-center" style={{ backgroundColor: panelBg, borderColor: border }}>
                    <span className="text-[11px] font-medium" style={{ color: textMuted }}>Capacity / Horsepower</span>
                    <p className="text-sm font-bold mt-0.5" style={{ color: textPrimary }}>
                      {selectedBooking.capacity || <span className="italic font-normal text-slate-400">Not specified</span>}
                    </p>
                  </div>
                </div>
                {(selectedBooking.photoUrl1 || selectedBooking.photoUrl2) && (
                  <div className="grid grid-cols-2 gap-3">
                    {[selectedBooking.photoUrl1, selectedBooking.photoUrl2].filter(Boolean).map((url, idx) => (
                      <a key={idx} href={`${API_BASE_URL.replace(/\/api$/, '')}${url}`} target="_blank" rel="noreferrer" className="block aspect-square rounded-xl overflow-hidden border hover:opacity-90 transition-opacity" style={{ borderColor: border }}>
                        <img src={`${API_BASE_URL.replace(/\/api$/, '')}${url}`} alt="Unit photo" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Issue Description */}
                <div className="p-3.5 rounded-xl border space-y-1.5" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <span className="text-[11px] font-medium" style={{ color: textMuted }}>Reported Problem / Issue</span>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: textPrimary }}>
                    {selectedBooking.issueDescription || <span className="italic text-slate-400">No issue description provided.</span>}
                  </p>
                </div>
              </div>

              {/* Address & Landmark */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Service Address
                </span>
                <div className="p-3.5 rounded-xl border flex items-start gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="space-y-1 text-xs flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-snug" style={{ color: textPrimary }}>
                      {formatAddress(selectedBooking) || <span className="italic font-normal text-slate-400">No address provided</span>}
                    </p>
                    {selectedBooking.landmark && (
                      <p className="text-xs" style={{ color: textMuted }}>
                        Landmark: <span className="font-semibold" style={{ color: textPrimary }}>{selectedBooking.landmark}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Timing / Schedule info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl border flex items-center gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Preferred Date</span>
                    <p className="text-xs font-bold" style={{ color: textPrimary }}>
                      {formatDate(selectedBooking.requestedDate) || 'Flexible / Any'}
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl border flex items-center gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Preferred Time</span>
                    <p className="text-xs font-bold" style={{ color: textPrimary }}>
                      {(selectedBooking.preferredTimeSlot && TIME_SLOT_LABELS[selectedBooking.preferredTimeSlot]) || 'Any time'}
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl border flex items-center gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Routed Branch</span>
                    <p className="text-xs font-bold" style={{ color: textPrimary }}>
                      {selectedBooking.branchId ? (branchNames[selectedBooking.branchId] || 'Assigned') : 'Unassigned / out of area'}
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl border flex items-center gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <div className="p-2 rounded-lg bg-slate-500/10 text-slate-400 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Date Submitted</span>
                    <p className="text-xs font-bold" style={{ color: textPrimary }}>
                      {formatSentDateTime(selectedBooking.createdAt).replace(/^Sent\s+/, '') || 'Recent'}
                    </p>
                  </div>
                </div>
              </div>
              {selectedBooking.status === 'DISMISSED' && selectedBooking.dismissalReason && (
                <div className="px-3.5 py-2.5 rounded-xl text-xs font-semibold" style={{ backgroundColor: 'rgba(100,116,139,0.1)', color: textMuted }}>
                  Dismissal reason: {DISMISSAL_REASONS.find(r => r.value === selectedBooking.dismissalReason)?.label || selectedBooking.dismissalReason}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 sm:px-6 border-t flex items-center justify-between gap-3 shrink-0" style={{ borderColor: border }}>
              {selectedBooking.status === 'CONVERTED' ? (
                <div className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Ticket Converted
                </div>
              ) : selectedBooking.status === 'DISMISSED' ? (
                <div className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20 flex items-center justify-center gap-2">
                  <Ban className="w-4 h-4" /> Booking Dismissed
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={() => openDismissPicker(selectedBooking.id)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold border text-red-500 hover:bg-red-500/10 transition-colors"
                    style={{ borderColor: inputBorder }}
                  >
                    Dismiss
                  </button>

                  <div className="flex items-center gap-2.5 ml-auto">
                    {selectedBooking.status === 'NEW' && (
                      <button
                        type="button"
                        onClick={() => markContacted(selectedBooking.id)}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold border text-amber-500 hover:bg-amber-500/10 transition-colors"
                        style={{ borderColor: inputBorder }}
                      >
                        Mark Contacted
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => convertToTicket(selectedBooking)}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
                      style={{ backgroundColor: green }}
                    >
                      <ArrowRightCircle className="w-4 h-4" /> Convert to Ticket
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showQr && <BookingQrModal isLight={isLight} onClose={() => setShowQr(false)} />}

      {/* Dismissal Reason Picker */}
      {dismissTargetId && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setDismissTargetId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border shadow-2xl p-5 animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: cardBg, borderColor: border }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold mb-1" style={{ color: textPrimary }}>Dismiss booking</h3>
            <p className="text-xs mb-4" style={{ color: textMuted }}>Select a reason for operational reporting.</p>
            <div className="flex flex-col gap-2">
              {DISMISSAL_REASONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => confirmDismiss(r.value)}
                  className="text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-colors"
                  style={{ borderColor: inputBorder, color: textPrimary }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDismissTargetId(null)}
              className="w-full mt-3 py-2 rounded-xl text-xs font-semibold"
              style={{ color: textMuted }}
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
