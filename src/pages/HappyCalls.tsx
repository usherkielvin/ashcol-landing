import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Search, X, Loader2, PhoneCall, CheckCircle2, Plus } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, getCleanBranchName, isPortalAdmin, getActivePortalBranchId, resolveScopedBranchId, isSameBaseBranch } from '../utils/api'


export interface HappyCallLead {
  id: string
  branchId: string
  customerName: string
  address?: string
  contactPhone?: string
  brandCapacity?: string
  unitStatus?: string
  commitAmount?: number
  cleaningsCompleted?: number
  priority?: string
  contactAttempts?: number
  lastContactMethod?: string
  lastContactDate?: string
  bookingStatus?: string
  assignedTech?: string
  notes?: string
  installedDate?: string
  sourceTicketId?: string | null
  ticketNumber?: string | null
  scheduledTicketId?: string | null
  monthsSinceInstall?: number
}

function authToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

const FULL_MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

/** "2025-12" -> "DECEMBER 2025" */
function formatMonthFilterLabel(value: string): string {
  const [yearStr, monthStr] = value.split('-')
  const monthNum = parseInt(monthStr, 10) - 1
  return `${FULL_MONTH_NAMES[monthNum] || monthStr} ${yearStr}`
}

type BranchOption = { id: string; name: string }

async function fetchLeads(token: string, branchId: string): Promise<HappyCallLead[]> {
  const params = new URLSearchParams()
  if (branchId) params.set('branchId', branchId)
  const res = await fetch(`${API_BASE_URL}/happy-calls?${params}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Failed to load happy call leads')
  return res.json()
}

function formatLastContactDate(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return ''
  const clean = dateStr.split('T')[0].trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return dateStr.toUpperCase()
  const [yearStr, monthStr, dayStr] = clean.split('-')
  const monthNum = parseInt(monthStr, 10) - 1
  const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const monthName = MONTH_NAMES[monthNum] || 'JAN'
  const yy = yearStr.slice(-2)
  return `${monthName}-${dayStr.padStart(2, '0')}-${yy}`
}

export default function HappyCalls() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const outletContext = useOutletContext<{ globalBranchId?: string }>() || {}
  const globalBranchId = outletContext.globalBranchId
  const isLight = theme === 'light'
  const isAdmin = isPortalAdmin(user?.role || '')

  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    if (!isAdmin) {
      return resolveScopedBranchId(user?.branchId) || user?.branchId || ''
    }
    const g = globalBranchId || getActivePortalBranchId(user) || ''
    return resolveScopedBranchId(g) || g
  })

  useEffect(() => {
    if (!isAdmin) return
    const syncBranch = () => {
      const g = localStorage.getItem('ashcol-global-branch-id') || getActivePortalBranchId(user) || ''
      const resolved = resolveScopedBranchId(g) || g
      setActiveBranchId(resolved)
    }
    syncBranch()
    window.addEventListener('ashcol-global-branch-change', syncBranch)
    return () => window.removeEventListener('ashcol-global-branch-change', syncBranch)
  }, [isAdmin, user])

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg = isLight ? '#f8fafc' : '#0F1A2E'
  const rowHover = isLight ? '#f8fafc' : '#0F1A2E'
  const green = '#10B981'

  const [leads, setLeads] = useState<HappyCallLead[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NOT_CONTACTED' | 'CONTACTED' | 'BOOKED'>('ALL')
  const [dueFilter, setDueFilter] = useState<'3M' | '6M'>('6M')
  const [monthFilter, setMonthFilter] = useState('') // "YYYY-MM", overrides dueFilter when set
  const [editLead, setEditLead] = useState<HappyCallLead | null>(null)
  const [bookLead, setBookLead] = useState<HappyCallLead | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${authToken()}` } })
        if (!res.ok) return
        const data = await res.json()
        const list: { id: string; name: string }[] = data?.data || data || []
        const options = list
          .map(b => ({ id: b.id, name: getCleanBranchName(b.name) || b.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
        setBranches(options)
      } catch {
        // best-effort
      }
    })()
  }, [])

  const loadLeads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchLeads(authToken(), activeBranchId)
      setLeads(rows)
    } catch (err) {
      setError(errMsg(err, 'Failed to load happy call leads'))
    } finally {
      setLoading(false)
    }
  }, [activeBranchId])

  useEffect(() => { void loadLeads() }, [loadLeads])

  const branchMap = useMemo(() => {
    const map = new Map<string, string>()
    branches.forEach(b => map.set(b.id, b.name))
    return map
  }, [branches])

  const getBranchLabel = useCallback((bId?: string) => {
    if (!bId) return 'NA'
    const found = branchMap.get(bId)
    if (found) return found.toUpperCase()
    const cleaned = getCleanBranchName(bId)
    return cleaned ? cleaned.toUpperCase() : bId.toUpperCase()
  }, [branchMap])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter(l => {
      if (activeBranchId && activeBranchId !== 'ALL_BRANCHES') {
        if (!isSameBaseBranch(l.branchId, activeBranchId)) return false
      }
      const booked = !!l.scheduledTicketId
      const contacted = (l.contactAttempts || 0) > 0
      if (statusFilter === 'BOOKED' && !booked) return false
      if (statusFilter === 'CONTACTED' && (!contacted || booked)) return false
      if (statusFilter === 'NOT_CONTACTED' && (contacted || booked)) return false
      if (monthFilter) {
        if (!(l.installedDate || '').startsWith(monthFilter)) return false
      } else {
        const months = l.monthsSinceInstall
        const dueThreshold = dueFilter === '3M' ? 3 : 6
        if (months == null || months < dueThreshold) return false
      }
      if (!q) return true
      const bLabel = getBranchLabel(l.branchId)
      const blob = [l.customerName, l.ticketNumber, bLabel, l.address, l.contactPhone, l.brandCapacity, l.bookingStatus]
        .filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [leads, search, statusFilter, dueFilter, monthFilter, activeBranchId, getBranchLabel])

  const patchLead = useCallback(async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE_URL}/happy-calls/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to update lead'))
    const updated = await res.json()
    setLeads(prev => prev.map(l => (l.id === id ? updated : l)))
  }, [])

  const createLead = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE_URL}/happy-calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to add customer'))
    const created = await res.json()
    setLeads(prev => [created, ...prev])
    // The due-date filter (3M/6M) hides leads that aren't due yet — a freshly added customer
    // (installedDate defaults to today) would otherwise vanish right after being created.
    // Switch to the month filter for its actual installedDate so it's guaranteed visible.
    setSearch('')
    setStatusFilter('ALL')
    setMonthFilter(created.installedDate ? String(created.installedDate).slice(0, 7) : '')
  }, [])

  const bookCleaning = useCallback(async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE_URL}/happy-calls/${id}/book`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to book cleaning'))
    const updated = await res.json()
    setLeads(prev => prev.map(l => (l.id === id ? updated : l)))
  }, [])

  return (
    <div className="p-[5px] flex flex-col gap-2.5 h-full min-h-0 flex-1 overflow-hidden">
      <div className="flex flex-nowrap items-center justify-between gap-2 px-1 py-0.5 overflow-x-auto no-scrollbar select-none shrink-0">
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-2 w-48 sm:w-64 rounded-lg px-2.5 py-1.5 border shrink-0 h-8" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="SEARCH CUSTOMER, BRANCH, PHONE…"
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
            <option value="NOT_CONTACTED">NOT CONTACTED</option>
            <option value="CONTACTED">CONTACTED</option>
            <option value="BOOKED">BOOKED</option>
          </select>

          <select
            value={dueFilter}
            onChange={e => setDueFilter(e.target.value as typeof dueFilter)}
            disabled={!!monthFilter}
            className="rounded-lg px-2.5 py-1 text-xs font-bold uppercase border outline-none shrink-0 h-8 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="3M">3+ MONTHS SINCE INSTALL</option>
            <option value="6M">6+ MONTHS SINCE INSTALL</option>
          </select>

          <div className="flex items-center gap-1 rounded-lg pl-2.5 pr-1.5 py-1 border shrink-0 h-8" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <button
              type="button"
              onClick={(e) => {
                const input = e.currentTarget.querySelector('input[type="month"]') as HTMLInputElement | null
                if (input && input.showPicker) input.showPicker()
              }}
              className="relative flex items-center text-xs font-bold uppercase whitespace-nowrap cursor-pointer"
              style={{ color: monthFilter ? textPrimary : textMuted }}
              title="Filter to a specific installed-date month, overrides the months-since-install filter"
            >
              {monthFilter ? formatMonthFilterLabel(monthFilter) : 'ALL MONTHS'}
              <input
                type="month"
                value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                className="absolute opacity-0 pointer-events-none w-0 h-0"
                style={{ pointerEvents: 'none' }}
              />
            </button>
            {monthFilter && (
              <button type="button" onClick={() => setMonthFilter('')} style={{ color: textMuted }} title="Clear month filter">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90 shrink-0 h-8"
          style={{ backgroundColor: green }}
        >
          <Plus className="w-3.5 h-3.5" /> ADD CUSTOMER
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-lg text-xs font-bold uppercase shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          {error}
        </div>
      )}

      <div style={{ backgroundColor: cardBg, borderColor: border }} className="flex-1 min-h-0 border rounded-xl overflow-auto shadow-sm flex flex-col">
        <table className="w-full text-left table-fixed min-w-[1240px] border-collapse">
          <colgroup>
            <col className="w-[9%]" />
            <col className="w-[14%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr style={{ backgroundColor: theadBg, color: textMuted, borderBottom: `1px solid ${border}` }} className="text-xs uppercase tracking-wider font-bold select-none">
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>TICKET NO.</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>CUSTOMER</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>CONTACT</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>BRANCH</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>ADDRESS</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>UNIT</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>INSTALLED</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>LAST CONTACT</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-right" style={{ color: textMuted }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {loading ? (
              <tr><td colSpan={9} className="px-6 py-16 text-center font-bold uppercase" style={{ color: textMuted }}>
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                LOADING HAPPY CALL LEADS…
              </td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-16 text-center font-bold uppercase" style={{ color: textMuted }}>
                <PhoneCall className="w-7 h-7 mx-auto mb-2 opacity-40" />
                NO HAPPY CALL LEADS FOUND.
              </td></tr>
            ) : visible.map(l => {
              const booked = !!l.scheduledTicketId
              const lastContactDateStr = formatLastContactDate(l.lastContactDate)
              const contactParts = [
                l.lastContactMethod ? l.lastContactMethod.trim().toUpperCase() : null,
                lastContactDateStr || null,
                l.bookingStatus ? l.bookingStatus.trim().toUpperCase() : null,
              ].filter(Boolean)

              const unitParts = [
                l.brandCapacity ? l.brandCapacity.trim() : null,
                l.unitStatus ? l.unitStatus.replace('_', ' ').trim() : null,
                l.commitAmount ? `₱${l.commitAmount.toLocaleString('en-PH')}` : null,
              ].filter(Boolean).map(s => String(s).toUpperCase())

              const installedDateStr = formatLastContactDate(l.installedDate)

              return (
                <tr
                  key={l.id}
                  style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}`, cursor: 'context-menu' }}
                  className="transition-colors align-middle"
                  onMouseEnter={el => (el.currentTarget.style.backgroundColor = rowHover)}
                  onMouseLeave={el => (el.currentTarget.style.backgroundColor = cardBg)}
                  onContextMenu={(e) => { e.preventDefault(); setEditLead(l) }}
                >
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }} title={l.ticketNumber || ''}>{l.ticketNumber ? l.ticketNumber.toUpperCase() : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }} title={l.customerName}>{l.customerName ? l.customerName.toUpperCase() : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }} title={l.contactPhone || ''}>{l.contactPhone ? l.contactPhone : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }} title={getBranchLabel(l.branchId)}>{getBranchLabel(l.branchId)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold uppercase truncate" style={{ color: textPrimary }} title={l.address}>{l.address ? l.address.toUpperCase() : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }} title={unitParts.join(' ')}>{unitParts.length > 0 ? unitParts.join(' ') : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }}>
                      {installedDateStr ? `${installedDateStr}${l.monthsSinceInstall != null ? ` (${l.monthsSinceInstall}MO)` : ''}` : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold uppercase truncate" style={{ color: textPrimary }}>
                      {contactParts.length > 0 ? contactParts.join(' - ') : <span className="font-extrabold text-amber-500 dark:text-yellow-400">N/A</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {booked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase whitespace-nowrap" style={{ color: green }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> BOOKED
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setBookLead(l) }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase text-white transition-opacity hover:opacity-90 whitespace-nowrap"
                          style={{ backgroundColor: green }}
                        >
                          BOOK
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditLead(l) }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase border transition-opacity hover:opacity-90 whitespace-nowrap"
                        style={{ borderColor: inputBorder, color: textPrimary }}
                      >
                        LOG
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editLead && (
        <EditLeadModal
          lead={editLead}
          isLight={isLight}
          onClose={() => setEditLead(null)}
          onSave={async (body) => { await patchLead(editLead.id, body); setEditLead(null) }}
        />
      )}

      {bookLead && (
        <BookCleaningModal
          lead={bookLead}
          isLight={isLight}
          onClose={() => setBookLead(null)}
          onConfirm={async (body) => { await bookCleaning(bookLead.id, body); setBookLead(null) }}
        />
      )}

      {addOpen && (
        <AddLeadModal
          isLight={isLight}
          branches={branches}
          defaultBranchId={activeBranchId || user?.branchId || ''}
          onClose={() => setAddOpen(false)}
          onCreate={async (body) => { await createLead(body); setAddOpen(false) }}
        />
      )}
    </div>
  )
}


function Field({ label, isLight, children }: { label: string; isLight: boolean; children: React.ReactNode }) {
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{label}</span>
      {children}
    </label>
  )
}

function EditLeadModal({ lead, isLight, onClose, onSave }: {
  lead: HappyCallLead
  isLight: boolean
  onClose: () => void
  onSave: (body: Record<string, unknown>) => Promise<void>
}) {
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const inputCls = "rounded-lg px-3 py-2 text-sm border outline-none w-full"
  const inputStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }

  const [contactAttempts, setContactAttempts] = useState(lead.contactAttempts ?? 0)
  const [lastContactMethod, setLastContactMethod] = useState(lead.lastContactMethod || '')
  const [lastContactDate, setLastContactDate] = useState(lead.lastContactDate || todayIso())
  const [bookingStatus, setBookingStatus] = useState(lead.bookingStatus || '')
  const [unitStatus, setUnitStatus] = useState(lead.unitStatus || '')
  const [assignedTech, setAssignedTech] = useState(lead.assignedTech || '')
  const [notes, setNotes] = useState(lead.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    setSaving(true)
    setErr('')
    try {
      await onSave({
        contactAttempts,
        lastContactMethod: lastContactMethod.trim() || null,
        lastContactDate: lastContactDate || null,
        bookingStatus: bookingStatus.trim() || null,
        unitStatus: unitStatus || null,
        assignedTech: assignedTech.trim() || null,
        notes: notes.trim() || null,
      })
    } catch (e) {
      setErr(errMsg(e, 'Failed to save lead'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: border }}>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Log Contact</h2>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>{lead.customerName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-3">
          <Field label="Contact Attempts" isLight={isLight}>
            <input type="number" min={0} value={contactAttempts} onChange={e => setContactAttempts(Number(e.target.value))} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Last Contact Method" isLight={isLight}>
            <input type="text" value={lastContactMethod} onChange={e => setLastContactMethod(e.target.value)} placeholder="CALL / SMS / VIBER" className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Last Contact Date" isLight={isLight}>
            <input type="date" value={lastContactDate} onChange={e => setLastContactDate(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Unit Status" isLight={isLight}>
            <select value={unitStatus} onChange={e => setUnitStatus(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">—</option>
              <option value="FREE">FREE</option>
              <option value="WITH_CHARGE">WITH CHARGE</option>
            </select>
          </Field>
          <Field label="Assigned Tech" isLight={isLight}>
            <input type="text" value={assignedTech} onChange={e => setAssignedTech(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <div className="col-span-2">
            <Field label="Booking Status" isLight={isLight}>
              <input type="text" value={bookingStatus} onChange={e => setBookingStatus(e.target.value)} placeholder='e.g. "FOR BOOKING AUGUST 8"' className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Notes" isLight={isLight}>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} style={inputStyle} />
            </Field>
          </div>
        </div>

        {err && <p className="px-5 text-xs font-medium" style={{ color: '#EF4444' }}>{err}</p>}

        <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-1">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold border disabled:opacity-50" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BookCleaningModal({ lead, isLight, onClose, onConfirm }: {
  lead: HappyCallLead
  isLight: boolean
  onClose: () => void
  onConfirm: (body: Record<string, unknown>) => Promise<void>
}) {
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'

  const [scheduledDate, setScheduledDate] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    setSaving(true)
    setErr('')
    try {
      await onConfirm({ scheduledDate, notes: notes.trim() })
    } catch (e) {
      setErr(errMsg(e, 'Failed to book cleaning'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl shadow-xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: border }}>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Book Cleaning</h2>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>{lead.customerName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <Field label="Scheduled Date" isLight={isLight}>
            <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="rounded-lg px-3 py-2 text-sm border outline-none" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
          </Field>
          <Field label="Notes" isLight={isLight}>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional notes…" className="rounded-lg px-3 py-2 text-sm border outline-none resize-none" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
          </Field>

          {err && <p className="text-xs font-medium" style={{ color: '#EF4444' }}>{err}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold border disabled:opacity-50" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
              Cancel
            </button>
            <button onClick={() => void submit()} disabled={saving || !scheduledDate} className="px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
              {saving ? 'Booking…' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddLeadModal({ isLight, branches, defaultBranchId, onClose, onCreate }: {
  isLight: boolean
  branches: BranchOption[]
  defaultBranchId: string
  onClose: () => void
  onCreate: (body: Record<string, unknown>) => Promise<void>
}) {
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const inputCls = "rounded-lg px-3 py-2 text-sm border outline-none w-full"
  const inputStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }

  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [brandCapacity, setBrandCapacity] = useState('')
  const [unitStatus, setUnitStatus] = useState('')
  const [commitAmount, setCommitAmount] = useState('')
  const [installedDate, setInstalledDate] = useState(todayIso())
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [assignedTech, setAssignedTech] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!customerName.trim() || !branchId) {
      setErr('Customer name and branch are required')
      return
    }
    if (!installedDate) {
      setErr('Installed date is required — Happy Call follow-ups are scheduled off this date, a lead without one will never show as due')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onCreate({
        customerName: customerName.trim(),
        address: address.trim() || null,
        contactPhone: contactPhone.trim() || null,
        brandCapacity: brandCapacity.trim() || null,
        unitStatus: unitStatus || null,
        commitAmount: commitAmount ? Number(commitAmount) : null,
        installedDate,
        branchId,
        assignedTech: assignedTech.trim() || null,
        notes: notes.trim() || null,
      })
    } catch (e) {
      setErr(errMsg(e, 'Failed to add customer'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: border }}>
          <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Add Customer</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Customer Name" isLight={isLight}>
              <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Address" isLight={isLight}>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Field label="Phone" isLight={isLight}>
            <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Brand/Capacity" isLight={isLight}>
            <input type="text" value={brandCapacity} onChange={e => setBrandCapacity(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Branch" isLight={isLight}>
            <select value={branchId} onChange={e => setBranchId(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">Select branch…</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
            </select>
          </Field>
          <Field label="Unit Status" isLight={isLight}>
            <select value={unitStatus} onChange={e => setUnitStatus(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">—</option>
              <option value="FREE">FREE</option>
              <option value="WITH_CHARGE">WITH CHARGE</option>
            </select>
          </Field>
          <Field label="Installed Date *" isLight={isLight}>
            <input type="date" value={installedDate} onChange={e => setInstalledDate(e.target.value)} required className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Commit Amount" isLight={isLight}>
            <input type="number" min={0} step="0.01" value={commitAmount} onChange={e => setCommitAmount(e.target.value)} placeholder="0.00" className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Assigned Tech" isLight={isLight}>
            <input type="text" value={assignedTech} onChange={e => setAssignedTech(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <div className="col-span-2">
            <Field label="Notes" isLight={isLight}>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} style={inputStyle} />
            </Field>
          </div>
        </div>

        {err && <p className="px-5 text-xs font-medium" style={{ color: '#EF4444' }}>{err}</p>}

        <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-1">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold border disabled:opacity-50" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
