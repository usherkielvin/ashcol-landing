import { useEffect, useRef, useState } from 'react'
import { Loader2, Calendar } from 'lucide-react'
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

/** Warranty registrations this person completed, one row per ticket, defaulting to today's date —
 *  mirrors TicketHistoryTable's counter+table layout. Shared by the admin "Employees" detail tab
 *  and a warranty registrar's own Profile. */
export default function WarrantyRegistrationHistoryTable({ person, headerLeft }: { person: HistoryPerson; headerLeft?: React.ReactNode }) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const theadBg     = isLight ? '#f1f5f9' : '#080f1c'

  const [history, setHistory] = useState<any[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState<string>('')
  const [branchFilter, setBranchFilter] = useState<string>('')
  const dateInputRef = useRef<HTMLInputElement>(null)

  const openDatePicker = () => {
    const el = dateInputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') el.showPicker()
      else el.focus()
    } catch {
      // showPicker() throws if already open — ignore
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
        // best-effort
      }
    })()
  }, [])

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      try {
        const headers = { Authorization: `Bearer ${token()}` }
        const isOwnProfile = person.id === user?.id
        // Org-wide warranty registrations for this person — never restricted to current user's branch
        // or active admin branch.
        const endpoint = isOwnProfile
          ? `${API_BASE_URL}/tickets/warranty-registrations/mine?size=2000`
          : `${API_BASE_URL}/tickets/warranty-registrations/user/${encodeURIComponent(person.id)}?size=2000`

        let data: any = null
        try {
          const res = await fetch(endpoint, { headers })
          if (res.ok) {
            data = await res.json()
          } else {
            // Fallback for older backend versions with global tickets query
            const fallbackRes = await fetch(`${API_BASE_URL}/tickets?branchId=ALL&size=2000`, { headers })
            if (fallbackRes.ok) data = await fallbackRes.json()
          }
        } catch {
          const fallbackRes = await fetch(`${API_BASE_URL}/tickets?branchId=ALL&size=2000`, { headers })
          if (fallbackRes.ok) data = await fallbackRes.json()
        }

        const tickets: any[] = data?.data?.tickets || data?.data?.content || data?.data || []

        const nameNorm = (person.name || '').toLowerCase().trim()
        const personId = (person.id || '').trim().toLowerCase()
        const personEmail = (person.email || '').toLowerCase().trim()
        const personPersonalEmail = (person.personalEmail || '').toLowerCase().trim()
        const nameTokens = nameNorm.split(/\s+/).filter(tok => tok.length > 2)

        const isPersonMatch = (val?: string | null) => {
          if (!val) return false
          const str = String(val).trim().toLowerCase()
          if (!str) return false
          if (str === personId) return true
          if (personEmail && str === personEmail) return true
          if (personPersonalEmail && str === personPersonalEmail) return true
          if (nameNorm && (str === nameNorm || nameNorm.includes(str) || str.includes(nameNorm))) return true
          for (const tok of nameTokens) {
            if (str.includes(tok)) return true
          }
          return false
        }

        const relevant = tickets.filter((t: any) => {
          const meta = parseUnitMeta(t)
          const isCompleted = Boolean(
            t.warrantyRegistrationCompleted ||
            t.warranty_registration_completed ||
            t.warrantyRegistrationNumber ||
            t.warranty_registration_number ||
            String(meta.warrantyRegistrationStatus || '').toUpperCase() === 'REGISTERED' ||
            String(t.warrantyDocsStatus || t.warranty_docs_status || '').toUpperCase() === 'REGISTERED'
          )
          if (!isCompleted) return false

          const completedBy = String(
            t.warrantyRegistrationCompletedBy ||
            t.warranty_registration_completed_by ||
            meta.warrantyRegisteredBy ||
            ''
          ).trim()

          if (!completedBy) {
            return isOwnProfile
          }
          return isPersonMatch(completedBy) || isOwnProfile
        })

        const getRegisteredTime = (t: any) => {
          const meta = parseUnitMeta(t)
          const raw = meta.warrantyRegistrationDate || t.warrantyRegistrationCompletedAt || t.warranty_registration_completed_at || t.actualCompletion || t.actual_completion || t.createdAt || t.created_at
          if (!raw) return 0
          const time = new Date(raw).getTime()
          return isNaN(time) ? 0 : time
        }

        relevant.sort((a: any, b: any) => {
          const timeA = getRegisteredTime(a)
          const timeB = getRegisteredTime(b)
          if (timeB !== timeA) return timeB - timeA
          const numA = String(a.ticketNumber || a.ticket_number || a.controlNumber || a.control_number || '')
          const numB = String(b.ticketNumber || b.ticket_number || b.controlNumber || b.control_number || '')
          return numB.localeCompare(numA, undefined, { numeric: true })
        })
        setHistory(relevant)
      } catch (err) {
        console.error('Error loading warranty registration history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [person.id, person.name, person.email, person.personalEmail, user])

  const parseUnitMeta = (t: any): Record<string, any> => {
    const raw = t?.acDetails || t?.ac_details
    if (!raw || typeof raw !== 'string') return {}
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const first = parsed.find(item => item && typeof item === 'object' && !Array.isArray(item))
        return (first && typeof first === 'object') ? first as Record<string, any> : {}
      }
      return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : {}
    } catch {
      return {}
    }
  }

  const getRegisteredDateStr = (t: any) => {
    const meta = parseUnitMeta(t)
    return (
      meta.warrantyRegistrationDate ||
      t.warrantyRegistrationCompletedAt ||
      t.warranty_registration_completed_at ||
      t.actualCompletion ||
      t.actual_completion ||
      t.createdAt ||
      t.created_at ||
      ''
    )
  }

  // ── Filter logic ───────────────────────────────────────────────────────────
  const displayedHistory = history.filter(t => {
    if (branchFilter && t.branchId !== branchFilter && t.branch_id !== branchFilter) return false
    if (dateFilter) {
      const registeredStr = getRegisteredDateStr(t)
      if (!registeredStr) return false
      const targetYMD = dateFilter.trim()
      const match = String(registeredStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (match) {
        const itemYMD = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
        if (itemYMD === targetYMD) return true
      }
      const rDate = new Date(registeredStr)
      if (!isNaN(rDate.getTime())) {
        const fDate = new Date(dateFilter + 'T00:00:00')
        return (
          rDate.getFullYear() === fDate.getFullYear() &&
          rDate.getMonth() === fDate.getMonth() &&
          rDate.getDate() === fDate.getDate()
        )
      }
      return false
    }
    return true
  })

  const formatBranchNameStr = (raw: string) => {
    if (!raw) return '—'
    const name = raw.replace(/^ashcol\s+/i, '').trim()
    return name.toUpperCase()
  }

  const branchName = (t: any) => {
    if (t.branchName || t.branch_name) return formatBranchNameStr(t.branchName || t.branch_name)
    const bId = t.branchId || t.branch_id
    if (!bId) return '—'
    const match = branches.find(b => b.id === bId)
    return match ? formatBranchNameStr(match.name) : bId
  }

  const registeredDateTime = (t: any) => {
    const raw = getRegisteredDateStr(t)
    if (!raw) return '—'
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) {
      const [y, m, d] = String(raw).trim().split('-').map(Number)
      const dateObj = new Date(y, m - 1, d)
      return dateObj.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })
    }
    const d = new Date(raw)
    return isNaN(d.getTime())
      ? String(raw)
      : d.toLocaleString(undefined, { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  /** acDetails is a JSON string (single unit object, or an array of units for multi-unit tickets)
   *  holding { brand, capacity, ... }. Mirrors the backend's resolveUnitBrandDisplay fallback shape. */
  const parseUnit = (raw?: string): { brand?: string; capacity?: string } => {
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const unit of parsed) {
          if (unit && typeof unit === 'object') {
            if (unit.brand || unit.capacity) return { brand: unit.brand, capacity: unit.capacity }
            if (Array.isArray(unit.details)) {
              for (const d of unit.details) {
                if (d?.brand) return { brand: d.brand, capacity: unit.capacity }
              }
            }
          }
        }
        return {}
      }
      if (parsed && typeof parsed === 'object') {
        return { brand: parsed.brand, capacity: parsed.capacity }
      }
    } catch {
      // malformed/legacy acDetails — fall through to unitBrandDisplay
    }
    return {}
  }

  const unitBrand = (t: any) => {
    const { brand } = parseUnit(t.acDetails)
    if (brand && String(brand).trim()) return String(brand).trim()
    return t.unitBrandDisplay || '—'
  }

  const unitHp = (t: any) => {
    const { capacity } = parseUnit(t.acDetails)
    return capacity && String(capacity).trim() ? String(capacity).trim() : '—'
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Combined Header / Filter Bar ──────────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 border-b shrink-0 min-h-[52px]"
        style={{ borderColor: border, backgroundColor: cardBg }}
      >
        {headerLeft && (
          <div className="flex items-center gap-0 min-w-0 flex-1 h-full">
            {headerLeft}
          </div>
        )}
        <div className={`flex flex-wrap items-center gap-2 py-2 sm:py-0 ${!headerLeft ? 'ml-auto' : ''}`}>
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
          </select>

          <div
            onClick={openDatePicker}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-semibold cursor-pointer focus-within:ring-1 focus-within:ring-emerald-500"
            style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: textMuted }} />
            <input
              ref={dateInputRef}
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="bg-transparent outline-none cursor-pointer text-xs sm:text-sm"
              style={{ color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
            />
          </div>

          {(dateFilter || branchFilter) && (
            <button
              onClick={() => { setDateFilter(''); setBranchFilter('') }}
              className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all hover:bg-slate-500/10"
              style={{ color: '#EF4444', border: `1px solid ${border}` }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#10B981' }} />
          <span className="text-sm font-semibold" style={{ color: textMuted }}>Loading registered tickets…</span>
        </div>
      ) : displayedHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16">
          <span className="text-base font-bold" style={{ color: textMuted }}>No registered tickets found</span>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Counter */}
          <div className="px-6 py-3 shrink-0 flex items-center gap-3" style={{ borderBottom: `1px solid ${border}` }}>
            <span
              className="text-3xl font-black tabular-nums leading-none"
              style={{ color: textPrimary }}
            >
              {displayedHistory.length}
            </span>
            <span className="text-sm font-bold uppercase tracking-wider" style={{ color: textPrimary }}>
              {displayedHistory.length === 1 ? 'Registered Ticket' : 'Registered Tickets'}
            </span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse" style={{ minWidth: 960 }}>
              <thead className="sticky top-0 z-10">
                <tr style={{ backgroundColor: theadBg, borderBottom: `1px solid ${border}` }}>
                  {['Date Registered', 'Ticket No.', 'Warranty Reg. No.', 'Registered', 'Brand', 'HP', 'Customer', 'District', 'Branch', 'Status'].map((h, i, arr) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-xs font-black uppercase tracking-wider whitespace-nowrap border-r ${i === 0 ? 'text-left' : 'text-center'}`}
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
                  const regNum = t.warrantyRegistrationNumber || t.warranty_registration_number || '—'
                  const status = (t.status || '').toUpperCase()
                  const district = t.district || t.destination || '—'
                  const isInstalled = status === 'INSTALLED' || status === 'COMPLETED'
                  const isActive = status === 'PENDING' || status === 'ASSIGNED' || status === 'SCHEDULED'
                  const statusColor = isInstalled ? '#10B981' : isActive ? '#3B82F6' : status === 'CANCELLED' ? '#EF4444' : textMuted
                  const isRegistered = Boolean(t.warrantyRegistrationCompleted)
                  return (
                    <tr
                      key={t.id || idx}
                      style={{ borderBottom: `1px solid ${border}`, backgroundColor: idx % 2 === 0 ? inputBg : cardBg }}
                    >
                      <td className="px-5 py-3 text-sm font-semibold border-r whitespace-nowrap" style={{ color: textPrimary, borderColor: border }}>{registeredDateTime(t)}</td>
                      <td className="px-5 py-3 text-sm font-bold text-center border-r" style={{ color: textPrimary, borderColor: border }}>{tNum}</td>
                      <td className="px-5 py-3 text-sm font-bold text-center border-r" style={{ color: textPrimary, borderColor: border }}>{regNum}</td>
                      <td className="px-5 py-3 text-xs font-black uppercase tracking-wider text-center border-r" style={{ color: isRegistered ? '#10B981' : '#EF4444', borderColor: border }}>{isRegistered ? 'Registered' : 'Not Registered'}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-center border-r" style={{ color: textPrimary, borderColor: border }}>{unitBrand(t)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-center border-r" style={{ color: textPrimary, borderColor: border }}>{unitHp(t)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-center border-r" style={{ color: textPrimary, borderColor: border }}>{custName}</td>
                      <td className="px-5 py-3 text-sm text-center border-r" style={{ color: textMuted, borderColor: border }}>{district}</td>
                      <td className="px-5 py-3 text-sm text-center border-r" style={{ color: textMuted, borderColor: border }}>{branchName(t)}</td>
                      <td className="px-5 py-3 text-xs font-black uppercase tracking-wider text-center" style={{ color: statusColor }}>{status || '—'}</td>
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
