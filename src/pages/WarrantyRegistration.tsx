import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldCheck, Search, Loader2, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { isPortalAdmin } from '../utils/api'
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
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const token = () =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchWarrantyRegistrations(token(), tab)
      setRows(list)
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
      await loadRows()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not mark as registered')
    } finally {
      setSavingId(null)
    }
  }

  if (!isPortalAdmin(role)) {
    return <Navigate to="/schedules" replace />
  }

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b shrink-0"
           style={{ backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" style={{ color: green }} />
          <div>
            <h1 className="text-sm font-bold" style={{ color: textPrimary }}>Warranty Registration</h1>
            <p className="text-[11px]" style={{ color: textMuted }}>Pending and registered warranty tickets from installed jobs</p>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setTab('pending')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
            style={{
              backgroundColor: tab === 'pending' ? (isLight ? '#dcfce7' : 'rgba(22,163,74,0.15)') : inputBg,
              borderColor: tab === 'pending' ? green : border,
              color: tab === 'pending' ? green : textMuted,
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Pending
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('registered')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
            style={{
              backgroundColor: tab === 'registered' ? (isLight ? '#dcfce7' : 'rgba(22,163,74,0.15)') : inputBg,
              borderColor: tab === 'registered' ? green : border,
              color: tab === 'registered' ? green : textMuted,
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Registered
            </span>
          </button>
          <button
            type="button"
            onClick={() => void loadRows()}
            className="p-2 rounded-lg border"
            style={{ borderColor: border, color: textMuted }}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b shrink-0" style={{ backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-center gap-2 max-w-md px-3 py-1.5 rounded-lg border"
             style={{ backgroundColor: inputBg, borderColor: border }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer, SI, schedule #…"
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: textPrimary }}
          />
        </div>
      </div>

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
                {['Customer', 'SI / Control', 'Brand', 'Installed', 'From schedule', 'Status', ''].map((h) => (
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
                    {row.customerName || row.parentCustomerName || '—'}
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
