import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Search, X, Loader2, ClipboardCheck, QrCode, ArrowRightCircle, Ban, 
  Phone, MapPin, Calendar, Wrench, ChevronRight, Eye, CheckCircle2, 
  Clock, AlertCircle, Sparkles, Filter, Copy, Check
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import BookingQrModal from '../components/BookingQrModal'

export interface Booking {
  id: string
  customerName: string
  contactPhone: string
  region?: string
  city?: string
  barangay?: string
  street?: string
  landmark?: string
  brand?: string
  capacity?: string
  requestedDate?: string
  issueDescription?: string
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED'
  convertedTicketId?: string | null
  createdAt: string
}

function authToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
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
  const [showQr, setShowQr] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [copiedPhone, setCopiedPhone] = useState(false)

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchBookings(authToken(), statusFilter)
      setBookings(rows)
    } catch (err) {
      setError(errMsg(err, 'Failed to load bookings'))
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { void loadBookings() }, [loadBookings])

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
    const q = search.trim().toLowerCase()
    if (!q) return bookings
    return bookings.filter(b => {
      const blob = [b.customerName, b.contactPhone, formatAddress(b), b.brand, b.capacity, b.issueDescription]
        .filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [bookings, search])

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

  const dismissBooking = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    void patchBooking(id, { status: 'DISMISSED' })
  }, [patchBooking])

  const markContacted = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    void patchBooking(id, { status: 'CONTACTED' })
  }, [patchBooking])

  const convertToTicket = useCallback((booking: Booking, e?: React.MouseEvent) => {
    e?.stopPropagation()
    navigate('/relays', { state: { bookingPrefill: booking } })
  }, [navigate])

  const copyPhone = useCallback((phone: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    navigator.clipboard.writeText(phone).then(() => {
      setCopiedPhone(true)
      setTimeout(() => setCopiedPhone(false), 1500)
    })
  }, [])

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

      {/* Main Table Container */}
      <div 
        className="flex-1 min-h-0 border rounded-2xl overflow-hidden shadow-sm flex flex-col"
        style={{ backgroundColor: cardBg, borderColor: border }}
      >
        <div className="overflow-auto flex-1 h-full min-h-0">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead>
              <tr 
                className="text-[11px] font-bold uppercase tracking-wider select-none border-b sticky top-0 z-10"
                style={{ backgroundColor: panelBg, borderColor: border, color: textMuted }}
              >
                <th className="px-5 py-3.5">Customer & Contact</th>
                <th className="px-5 py-3.5">Unit & Issue</th>
                <th className="px-5 py-3.5">Location</th>
                <th className="px-5 py-3.5">Requested Visit</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs" style={{ borderColor: border }}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center" style={{ color: textMuted }}>
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    <p className="font-semibold text-sm">Loading bookings...</p>
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center" style={{ color: textMuted }}>
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
                    {/* Customer & Contact */}
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-sm group-hover:text-emerald-500 transition-colors" style={{ color: textPrimary }}>
                          {b.customerName}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs font-mono font-medium" style={{ color: textMuted }}>
                          <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>{b.contactPhone}</span>
                          <button
                            type="button"
                            onClick={(e) => copyPhone(b.contactPhone, e)}
                            title="Copy phone number"
                            className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-500/10"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Unit & Issue */}
                    <td className="px-5 py-4 max-w-[240px]">
                      <div className="flex flex-col gap-1">
                        {unitParts ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold w-fit bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            <Wrench className="w-3 h-3 shrink-0" />
                            {unitParts}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No unit specified</span>
                        )}
                        <p className="text-xs line-clamp-1 font-medium" style={{ color: textPrimary }} title={b.issueDescription}>
                          {b.issueDescription || <span className="text-slate-400 italic">No description</span>}
                        </p>
                      </div>
                    </td>

                    {/* Location */}
                    <td className="px-5 py-4 max-w-[220px]">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-xs line-clamp-2 leading-relaxed" style={{ color: textPrimary }} title={addressStr}>
                          {addressStr || <span className="text-slate-400 italic">Not provided</span>}
                        </span>
                      </div>
                    </td>

                    {/* Requested Visit Date */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 font-semibold text-xs" style={{ color: textPrimary }}>
                          <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>{formatDate(b.requestedDate) || 'Flexible Date'}</span>
                        </div>
                        <span className="text-[11px]" style={{ color: textMuted }}>
                          Sent {formatDate(b.createdAt)}
                        </span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {statusBadge(b.status)}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                        ) : b.status === 'CONVERTED' ? (
                          <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ticket Created
                          </span>
                        ) : b.status === 'DISMISSED' ? (
                          <span className="text-xs font-medium text-slate-400">Dismissed</span>
                        ) : (
                          <>
                            {b.status === 'NEW' && (
                              <button
                                type="button"
                                onClick={(e) => markContacted(b.id, e)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:bg-amber-500/10 hover:border-amber-500/30 text-amber-500"
                                style={{ borderColor: inputBorder }}
                              >
                                Contacted
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => convertToTicket(b, e)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
                              style={{ backgroundColor: green }}
                            >
                              <ArrowRightCircle className="w-3.5 h-3.5" />
                              Convert
                            </button>
                            <button
                              type="button"
                              onClick={(e) => dismissBooking(b.id, e)}
                              title="Dismiss booking"
                              className="p-1.5 rounded-lg border transition-all hover:bg-red-500/10 text-slate-400 hover:text-red-500"
                              style={{ borderColor: inputBorder }}
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedBooking(b)
                          }}
                          className="p-1.5 rounded-lg border transition-all hover:bg-slate-500/10"
                          style={{ borderColor: inputBorder, color: textMuted }}
                          title="View Full Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Details Side Drawer / Modal */}
      {selectedBooking && (
        <div 
          className="fixed inset-0 z-[999] flex justify-end p-0 md:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSelectedBooking(null)}
        >
          <div 
            className="w-full max-w-lg h-full md:h-auto md:max-h-[90vh] md:rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
            style={{ backgroundColor: cardBg, borderColor: border }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: border }}>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Wrench className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold" style={{ color: textPrimary }}>Booking Details</h2>
                  <p className="text-xs" style={{ color: textMuted }}>ID: {selectedBooking.id}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedBooking(null)}
                className="p-1.5 rounded-lg hover:bg-slate-500/10"
                style={{ color: textMuted }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Customer Info Card */}
              <div className="p-4 rounded-xl border space-y-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }}>Customer</span>
                  {statusBadge(selectedBooking.status)}
                </div>
                <div>
                  <h3 className="text-lg font-extrabold" style={{ color: textPrimary }}>{selectedBooking.customerName}</h3>
                  <a 
                    href={`tel:${selectedBooking.contactPhone}`}
                    className="inline-flex items-center gap-2 mt-1 text-sm font-semibold text-emerald-500 hover:underline"
                  >
                    <Phone className="w-4 h-4" />
                    {selectedBooking.contactPhone}
                  </a>
                </div>
              </div>

              {/* Unit & Request Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }}>Service Request</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: panelBg, borderColor: border }}>
                    <span className="text-[11px]" style={{ color: textMuted }}>Brand / Model</span>
                    <p className="text-sm font-bold mt-0.5" style={{ color: textPrimary }}>{selectedBooking.brand || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: panelBg, borderColor: border }}>
                    <span className="text-[11px]" style={{ color: textMuted }}>Capacity / HP</span>
                    <p className="text-sm font-bold mt-0.5" style={{ color: textPrimary }}>{selectedBooking.capacity || 'N/A'}</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl border space-y-1" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <span className="text-[11px]" style={{ color: textMuted }}>Issue Description</span>
                  <p className="text-sm leading-relaxed" style={{ color: textPrimary }}>
                    {selectedBooking.issueDescription || 'No description provided.'}
                  </p>
                </div>
              </div>

              {/* Location Card */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }}>Address & Location</h4>
                <div className="p-4 rounded-xl border flex items-start gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <MapPin className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-sm" style={{ color: textPrimary }}>{formatAddress(selectedBooking) || 'No address provided'}</p>
                    {selectedBooking.landmark && (
                      <p style={{ color: textMuted }}>Landmark: <span className="font-medium text-slate-300">{selectedBooking.landmark}</span></p>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border flex items-center gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <Calendar className="w-5 h-5 text-blue-500 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Requested Date</span>
                    <p className="text-xs font-bold" style={{ color: textPrimary }}>{formatDate(selectedBooking.requestedDate) || 'Flexible'}</p>
                  </div>
                </div>
                <div className="p-3 rounded-xl border flex items-center gap-3" style={{ backgroundColor: panelBg, borderColor: border }}>
                  <Clock className="w-5 h-5 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold uppercase" style={{ color: textMuted }}>Submitted On</span>
                    <p className="text-xs font-bold" style={{ color: textPrimary }}>{formatDate(selectedBooking.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t flex items-center justify-between gap-3" style={{ borderColor: border }}>
              {selectedBooking.status === 'CONVERTED' ? (
                <div className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  Ticket Converted
                </div>
              ) : selectedBooking.status === 'DISMISSED' ? (
                <div className="w-full py-2.5 rounded-xl text-center text-xs font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                  Booking Dismissed
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => dismissBooking(selectedBooking.id)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border text-red-500 hover:bg-red-500/10 transition-colors"
                    style={{ borderColor: inputBorder }}
                  >
                    Dismiss
                  </button>
                  {selectedBooking.status === 'NEW' && (
                    <button
                      type="button"
                      onClick={() => markContacted(selectedBooking.id)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold border text-amber-500 hover:bg-amber-500/10 transition-colors"
                      style={{ borderColor: inputBorder }}
                    >
                      Mark Contacted
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => convertToTicket(selectedBooking)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: green }}
                  >
                    <ArrowRightCircle className="w-4 h-4" /> Convert to Ticket
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showQr && <BookingQrModal isLight={isLight} onClose={() => setShowQr(false)} />}
    </div>
  )
}
