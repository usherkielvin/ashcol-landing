import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Calendar } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

interface HistoryPerson {
  id: string
  name: string
  email: string
  personalEmail?: string
}

interface BranchOption { id: string; name: string }

const token = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

/** Tickets this person created, negotiated, was assigned/installed/drove, closed, or completed
 *  warranty registration on. Shared by the admin "Employees" detail tab and a user's own Profile. */
export default function TicketHistoryTable({ person }: { person: HistoryPerson }) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'

  const [history, setHistory] = useState<any[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [branchFilter, setBranchFilter] = useState<string>('')
  const dateInputRef = useRef<HTMLInputElement>(null)

  const openDatePicker = () => {
    const el = dateInputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') el.showPicker()
      else el.focus()
    } catch {
      // showPicker() throws if already open (e.g. click bubbled from the native icon) — ignore
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token()}` } })
        if (!res.ok) return
        const data = await res.json()
        setBranches(data?.data || [])
      } catch {
        // best-effort; branch column just falls back to "—"
      }
    })()
  }, [])

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      try {
        const headers = { Authorization: `Bearer ${token()}` }
        const isAdminOrMgmt = user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'MANAGEMENT'
        const endpoint = isAdminOrMgmt ? `${API_BASE_URL}/tickets?size=1000` : `${API_BASE_URL}/tickets/branch?size=1000`
        const res = await fetch(endpoint, { headers })
        if (!res.ok) return
        const data = await res.json()
        const tickets: any[] = data?.data?.tickets || data?.data?.content || data?.data || []

        const nameNorm = person.name.toLowerCase().trim()
        const personId = person.id
        const personEmail = person.email.toLowerCase().trim()
        const personPersonalEmail = (person.personalEmail || '').toLowerCase().trim()

        const relevant = tickets.filter((t: any) => {
          if (t.customerId === personId) return true
          if (t.createdBy && t.createdBy.toLowerCase().trim() === nameNorm) return true
          if (t.negotiatorId === personId) return true
          if (t.negotiatorName && t.negotiatorName.toLowerCase().trim() === nameNorm) return true
          if (t.assignedTo === personId) return true
          if (t.assignedEmployeeName && t.assignedEmployeeName.toLowerCase().trim() === nameNorm) return true
          if (t.installerId === personId) return true
          if (t.installerName && t.installerName.toLowerCase().trim() === nameNorm) return true
          if (t.closedBy === personId) return true
          if (t.closedBy && t.closedBy.toLowerCase().trim() === nameNorm) return true
          if (t.closedBy && t.closedBy.toLowerCase().trim() === personEmail) return true
          if (t.warrantyRegistrationCompletedBy === personId) return true
          if (t.warrantyRegistrationCompletedBy && t.warrantyRegistrationCompletedBy.toLowerCase().trim() === nameNorm) return true
          const customerEmail = (t.customerEmail || '').toLowerCase().trim()
          if (customerEmail && (customerEmail === personEmail || (personPersonalEmail && customerEmail === personPersonalEmail))) return true
          return false
        })

        relevant.sort((a: any, b: any) => {
          const da = a.updatedAt || a.updated_at || a.createdAt || a.created_at || ''
          const db = b.updatedAt || b.updated_at || b.createdAt || b.created_at || ''
          return db.localeCompare(da)
        })
        setHistory(relevant)
      } catch (err) {
        console.error('Error loading ticket history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [person.id, person.name, person.email, person.personalEmail, user])

  const branchName = (t: any) => branches.find(b => b.id === (t.branchId || t.branch_id))?.name || '—'

  // Counting how many tickets were CREATED that day only makes sense against the creation
  // timestamp — falling back to updatedAt pulls in tickets merely touched that day.
  const displayedHistory = history.filter((t: any) => {
    if (branchFilter && (t.branchId || t.branch_id) !== branchFilter) return false
    if (!dateFilter) return true
    const dateStr = t.createdAt || t.created_at
    if (!dateStr) return false
    const d = new Date(dateStr)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}` === dateFilter
  })
  const scheduledDate = (t: any) => {
    const raw = t.finalDate || t.final_date || t.preferredDate || t.preferred_date || ''
    if (!raw) return '—'
    const d = new Date(raw)
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'long', day: '2-digit', year: 'numeric' })
  }
  const createdDateTime = (t: any) => {
    const raw = t.createdAt || t.created_at || ''
    if (!raw) return '—'
    const d = new Date(raw)
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleString(undefined, { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border" style={{ borderColor: border, backgroundColor: inputBg }}>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Filters</span>
          <span className="text-[11px]" style={{ color: textMuted }}>Show tickets created on, and/or from:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
          </select>

          {/* Whole control is clickable (not just the tiny native calendar icon) — clicking
              anywhere opens the picker via showPicker(), falling back to focus() on browsers
              that lack it. */}
          <div
            onClick={openDatePicker}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer focus-within:ring-1 focus-within:ring-emerald-500"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input
              ref={dateInputRef}
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
              style={{ color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
            />
          </div>

          {(dateFilter || branchFilter) && (
            <button
              onClick={() => { setDateFilter(''); setBranchFilter('') }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-slate-500/10"
              style={{ color: '#EF4444', border: `1px solid ${border}` }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#10B981' }} />
          <span className="text-xs font-semibold" style={{ color: textMuted }}>Loading ticket history…</span>
        </div>
      ) : displayedHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-2xl" style={{ borderColor: border, backgroundColor: inputBg }}>
          <RefreshCw className="w-8 h-8 mb-3" style={{ color: textMuted }} />
          <span className="text-sm font-bold" style={{ color: textMuted }}>No ticket history found</span>
          <span className="text-xs mt-1" style={{ color: textMuted }}>
            {dateFilter ? `No tickets created on ${new Date(dateFilter).toLocaleDateString(undefined, { dateStyle: 'medium' })}.` : 'No tickets are associated with this account.'}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>
            {displayedHistory.length} ticket{displayedHistory.length === 1 ? '' : 's'} created {dateFilter && `on ${new Date(dateFilter).toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
          </div>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#080f1c', borderBottom: `1px solid ${border}` }}>
                  {['Date Created', 'Ticket No.', 'Customer', 'District', 'Branch', 'Negotiator', 'Scheduled Date', 'Status'].map((h, i, arr) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap border-r ${i === 0 ? 'text-left' : 'text-center'}`}
                      style={{ color: textMuted, borderColor: border, borderRight: i === arr.length - 1 ? 'none' : `1px solid ${border}` }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="uppercase">
                {displayedHistory.map((t: any, idx: number) => {
                  const custName = t.customerName || t.customer_name || '—'
                  const tNum = t.ticketNumber || t.ticket_number || t.controlNumber || t.control_number || t.id?.slice(0, 8) || '—'
                  const status = (t.status || '').toUpperCase()
                  const district = t.district || t.destination || '—'
                  const negotiator = t.negotiatorName || t.negotiator_name || '—'
                  const isInstalled = status === 'INSTALLED' || status === 'COMPLETED'
                  const isActive = status === 'PENDING' || status === 'ASSIGNED' || status === 'SCHEDULED'
                  const statusColor = isInstalled ? '#10B981' : isActive ? '#3B82F6' : status === 'CANCELLED' ? '#EF4444' : textMuted
                  return (
                    <tr key={t.id || idx} style={{ borderBottom: `1px solid ${border}`, backgroundColor: idx % 2 === 0 ? inputBg : cardBg }}>
                      <td className="px-4 py-2.5 text-xs font-semibold border-r whitespace-nowrap" style={{ color: textPrimary, borderColor: border }}>{createdDateTime(t)}</td>
                      <td className="px-4 py-2.5 text-xs font-bold text-center border-r" style={{ color: textPrimary, borderColor: border }}>{tNum}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-center border-r" style={{ color: textPrimary, borderColor: border }}>{custName}</td>
                      <td className="px-4 py-2.5 text-xs text-center border-r" style={{ color: textMuted, borderColor: border }}>{district}</td>
                      <td className="px-4 py-2.5 text-xs text-center border-r" style={{ color: textMuted, borderColor: border }}>{branchName(t)}</td>
                      <td className="px-4 py-2.5 text-xs text-center border-r" style={{ color: textMuted, borderColor: border }}>{negotiator}</td>
                      <td className="px-4 py-2.5 text-xs text-center border-r" style={{ color: textPrimary, borderColor: border }}>{scheduledDate(t)}</td>
                      <td className="px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-center" style={{ color: statusColor }}>{status || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
