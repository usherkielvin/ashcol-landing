import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Loader2, ClipboardCheck, QrCode, ArrowRightCircle, Ban } from 'lucide-react'
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
  const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const monthName = MONTH_NAMES[parseInt(monthStr, 10) - 1] || 'JAN'
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

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg = isLight ? '#f8fafc' : '#0F1A2E'
  const rowHover = isLight ? '#f8fafc' : '#0F1A2E'
  const green = '#10B981'

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED'>('ALL')
  const [showQr, setShowQr] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

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
      if (updated) setBookings(prev => prev.map(b => (b.id === id ? updated : b)))
    } catch (err) {
      setError(errMsg(err, 'Failed to update booking'))
    } finally {
      setBusyId(null)
    }
  }, [])

  const dismissBooking = useCallback((id: string) => {
    void patchBooking(id, { status: 'DISMISSED' })
  }, [patchBooking])

  const markContacted = useCallback((id: string) => {
    void patchBooking(id, { status: 'CONTACTED' })
  }, [patchBooking])

  const convertToTicket = useCallback((booking: Booking) => {
    navigate('/relays', { state: { bookingPrefill: booking } })
  }, [navigate])

  const statusStyle = (status: Booking['status']) => {
    switch (status) {
      case 'NEW': return { color: '#3B82F6', backgroundColor: isLight ? '#dbeafe' : 'rgba(59,130,246,0.16)' }
      case 'CONTACTED': return { color: '#F59E0B', backgroundColor: isLight ? '#fef3c7' : 'rgba(245,158,11,0.16)' }
      case 'CONVERTED': return { color: green, backgroundColor: isLight ? '#dcfce7' : 'rgba(16,185,129,0.16)' }
      case 'DISMISSED': return { color: textMuted, backgroundColor: isLight ? '#f1f5f9' : 'rgba(148,163,184,0.12)' }
    }
  }

  return (
    <div className="p-[5px] flex flex-col gap-2.5 h-full min-h-0 flex-1 overflow-hidden">
      <div className="flex flex-nowrap items-center justify-between gap-2 px-1 py-0.5 overflow-x-auto no-scrollbar select-none shrink-0">
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-2 w-48 sm:w-64 rounded-lg px-2.5 py-1.5 border shrink-0 h-8" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="SEARCH CUSTOMER, PHONE, ADDRESS…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-xs font-semibold uppercase outline-none w-full min-w-0 placeholder:uppercase"
              style={{ color: textPrimary }}
            />
            {search && <button onClick={() => setSearch('')} style={{ color: textMuted }}><X className="w-3.5 h-3.5" /></button>}
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg px-2.5 py-1 text-xs font-bold uppercase border outline-none shrink-0 h-8 cursor-pointer"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="ALL">ALL STATUS</option>
            <option value="NEW">NEW</option>
            <option value="CONTACTED">CONTACTED</option>
            <option value="CONVERTED">CONVERTED</option>
            <option value="DISMISSED">DISMISSED</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowQr(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-90 shrink-0 h-8 border"
          style={{ borderColor: inputBorder, color: textPrimary }}
        >
          <QrCode className="w-3.5 h-3.5" /> Show QR Code
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-lg text-xs font-bold uppercase shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          {error}
        </div>
      )}

      <div style={{ backgroundColor: cardBg, borderColor: border }} className="flex-1 min-h-0 border rounded-xl overflow-auto shadow-sm flex flex-col">
        <table className="w-full text-left table-fixed min-w-[1280px] border-collapse">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[19%]" />
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr style={{ backgroundColor: theadBg, color: textMuted, borderBottom: `1px solid ${border}` }} className="text-xs uppercase tracking-wider font-bold select-none">
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>CUSTOMER</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>CONTACT</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>ADDRESS</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>BRAND / HP</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>REQUESTED</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>ISSUE</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>SUBMITTED</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>STATUS</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-right" style={{ color: textMuted }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {loading ? (
              <tr><td colSpan={9} className="px-6 py-16 text-center font-bold uppercase" style={{ color: textMuted }}>
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                LOADING BOOKINGS…
              </td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-16 text-center font-bold uppercase" style={{ color: textMuted }}>
                <ClipboardCheck className="w-7 h-7 mx-auto mb-2 opacity-40" />
                NO BOOKINGS FOUND.
              </td></tr>
            ) : visible.map(b => {
              const unitParts = [b.brand, b.capacity].filter(Boolean).join(' ')
              const busy = busyId === b.id
              return (
                <tr
                  key={b.id}
                  style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}
                  className="transition-colors align-middle"
                  onMouseEnter={el => (el.currentTarget.style.backgroundColor = rowHover)}
                  onMouseLeave={el => (el.currentTarget.style.backgroundColor = cardBg)}
                >
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }} title={b.customerName}>{b.customerName.toUpperCase()}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold truncate" style={{ color: textPrimary }}>{b.contactPhone}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-semibold uppercase truncate" style={{ color: textPrimary }} title={formatAddress(b)}>{formatAddress(b) || <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }}>{unitParts || <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }}>{formatDate(b.requestedDate) || <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs truncate" style={{ color: textPrimary }} title={b.issueDescription}>{b.issueDescription || <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-semibold" style={{ color: textMuted }}>{formatDate(b.createdAt)}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase" style={statusStyle(b.status)}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {busy ? (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: textMuted }} />
                      ) : b.status === 'CONVERTED' ? (
                        <span className="text-[11px] font-bold uppercase" style={{ color: green }}>DONE</span>
                      ) : b.status === 'DISMISSED' ? (
                        <span className="text-[11px] font-bold uppercase" style={{ color: textMuted }}>DISMISSED</span>
                      ) : (
                        <>
                          {b.status === 'NEW' && (
                            <button
                              type="button"
                              onClick={() => markContacted(b.id)}
                              title="Mark as contacted"
                              className="px-2 py-1 rounded-md text-[11px] font-bold uppercase border transition-opacity hover:opacity-90"
                              style={{ borderColor: inputBorder, color: textPrimary }}
                            >
                              CONTACTED
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => convertToTicket(b)}
                            title="Convert to ticket"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase text-white transition-opacity hover:opacity-90"
                            style={{ backgroundColor: green }}
                          >
                            <ArrowRightCircle className="w-3.5 h-3.5" /> CONVERT
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissBooking(b.id)}
                            title="Dismiss booking"
                            className="p-1.5 rounded-md border transition-opacity hover:opacity-90"
                            style={{ borderColor: inputBorder, color: '#EF4444' }}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showQr && <BookingQrModal isLight={isLight} onClose={() => setShowQr(false)} />}
    </div>
  )
}
