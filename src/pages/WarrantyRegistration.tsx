import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Navigate } from 'react-router-dom'
import { ShieldCheck, Search, Loader2, CheckCircle2, Clock, RefreshCw, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { formatPersonName, isPortalAdmin } from '../utils/api'
import TicketSectionNav, { FilterPills } from '../components/TicketSectionNav'
import {
  fetchWarrantyRegistrations,
  markWarrantyRegistered,
  type WarrantyTicket,
} from '../utils/warrantyRegistration'

function formatDate(raw?: string | null) {
  if (!raw) return '—'
  const key = raw.split('T')[0]
  const d = new Date(`${key}T00:00:00`)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WarrantyRegistration() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#94a3b8' : '#3d4f66'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const theadBg = isLight ? '#e8edf3' : '#060C18'
  const green = '#16A34A'

  const [tab, setTab] = useState<'pending' | 'registered'>('pending')
  const [rows, setRows] = useState<WarrantyTicket[]>([])
  const [counts, setCounts] = useState({ pending: 0, registered: 0 })
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const token = () =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  const showToast = (type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, message })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pendingList, registeredList] = await Promise.all([
        fetchWarrantyRegistrations(token(), 'pending'),
        fetchWarrantyRegistrations(token(), 'registered'),
      ])
      setCounts({ pending: pendingList.length, registered: registeredList.length })
      setRows(tab === 'pending' ? pendingList : registeredList)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load warranty registrations')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { void loadRows() }, [loadRows])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        r.customerName,
        r.controlNumber,
        r.ticketNumber,
        r.parentTicketNumber,
        r.parentControlNumber,
        r.unitType,
        r.installerName,
        r.remarksUpdate,
      ].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [rows, searchQuery])

  const handleMarkRegistered = async (ticket: WarrantyTicket) => {
    if (savingId) return
    setSavingId(ticket.id)
    try {
      await markWarrantyRegistered(token(), ticket.id)
      showToast('success', `${formatPersonName(ticket.customerName || ticket.parentCustomerName || 'Customer')} marked as registered`)
      await loadRows()
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Could not mark as registered')
    } finally {
      setSavingId(null)
    }
  }

  if (!isPortalAdmin(role)) {
    return <Navigate to="/schedules" replace />
  }

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full">
      {ReactDOM.createPortal(
        <div className="flex flex-col gap-2 w-full px-3 md:px-4 py-2">
          <TicketSectionNav />
          <div className="flex flex-wrap items-center gap-2 w-full">
            <FilterPills
              value={tab}
              onChange={setTab}
              items={[
                { id: 'pending' as const, label: 'Pending', count: counts.pending, icon: <Clock className="w-3 h-3" /> },
                { id: 'registered' as const, label: 'Registered', count: counts.registered, icon: <CheckCircle2 className="w-3 h-3" /> },
              ]}
            />

            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border flex-1 min-w-[160px] max-w-sm md:max-w-md lg:max-w-xl"
                 style={{ backgroundColor: inputBg, borderColor: border }}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer, SI, schedule #…"
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: textPrimary }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="shrink-0" style={{ color: textMuted }}>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => void loadRows()}
              disabled={loading}
              className="p-2 rounded-lg border shrink-0 disabled:opacity-50"
              style={{ borderColor: border, color: textMuted }}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>,
        document.getElementById('header-toolbar-slot') ?? document.body
      )}

      {toast && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-lg border text-xs font-semibold shrink-0"
             style={{
               backgroundColor: toast.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
               borderColor: toast.type === 'success' ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
               color: toast.type === 'success' ? green : '#EF4444',
             }}>
          {toast.message}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-xs font-semibold shrink-0" style={{ color: '#b45309' }}>
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto" style={{ backgroundColor: cardBg }}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16" style={{ color: textMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <ShieldCheck className="w-10 h-10 opacity-30" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              No {tab === 'pending' ? 'pending' : 'registered'} warranty tickets
            </p>
            <p className="text-xs max-w-sm text-center" style={{ color: textMuted }}>
              Right-click an installed row in Archives and choose “Create warranty registration ticket”.
            </p>
          </div>
        ) : (
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: theadBg }}>
              <tr>
                {['Customer', 'SI / Control', 'Brand', 'Installed', 'From schedule', 'Installer', 'Status', ''].map((h) => (
                  <th key={h || 'actions'}
                      className="px-3 py-2.5 text-left font-bold uppercase tracking-wide"
                      style={{ borderBottom: `2px solid ${border}`, borderRight: `1px solid ${border}`, color: textMuted, fontSize: '10px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={row.id}
                    style={{ backgroundColor: idx % 2 === 0 ? cardBg : (isLight ? '#f4f6f8' : '#0d1626') }}>
                  <td className="px-3 py-2.5 font-semibold" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textPrimary }}>
                    {formatPersonName(row.customerName || row.parentCustomerName || '—')}
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textPrimary }}>
                    {row.controlNumber || row.parentControlNumber || '—'}
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textPrimary }}>
                    {row.unitType || row.brandRegisteredTo || '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textMuted }}>
                    {formatDate(row.preferredDate || row.preferred_date)}
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textMuted }}>
                    {row.parentTicketNumber || row.parentTicketId?.slice(0, 8) || '—'}
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textMuted }}>
                    {formatPersonName(row.installerName || '—')}
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                          style={{
                            backgroundColor: tab === 'registered' ? 'rgba(22,163,74,0.12)' : 'rgba(245,158,11,0.12)',
                            color: tab === 'registered' ? green : '#d97706',
                          }}>
                      {tab === 'registered' ? 'Registered' : (row.status || 'Pending')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                    {tab === 'pending' && (
                      <button
                        type="button"
                        disabled={savingId === row.id}
                        onClick={() => void handleMarkRegistered(row)}
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold text-white disabled:opacity-50"
                        style={{ backgroundColor: green }}
                      >
                        {savingId === row.id ? 'Saving…' : 'Mark registered'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
