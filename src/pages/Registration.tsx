import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X, Loader2, ClipboardCheck, CheckCircle2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, isPortalAdmin, getCleanBranchName, branchScopesMatch, readApiError } from '../utils/api'
import {
  type Ticket,
  getScheduleStatusValue,
  getScheduleStatusBadgeStyle,
  getScheduleStatusLabel,
  parseBrand,
  parseAcMeta,
  mergeAcMeta,
  getInstallerDisplay,
  getTicketNegotiatorName,
  getTicketCommitDisplay,
  getCustomerDisplayName,
  formatAddress,
  fmtPhone,
  getBranchDisplayName,
  getInstalledDateKey,
  getFinalDateKey,
  formatDateKeyLabel,
} from '../utils/ticketHelpers'

type RegTicket = Ticket & {
  warrantyRegistrationCompleted?: boolean
  warrantyRegistrationCompletedAt?: string
  warrantyRegistrationCompletedBy?: string
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function isTicketRegistered(t: Ticket): boolean {
  return !!(t as RegTicket).warrantyRegistrationCompleted
}

const BRANDS_LIST = [
  'CARRIER', 'MIDEA', 'SAMSUNG', 'PANASONIC', 'KOPPEL', 'LG', 'DAIKIN', 'AUX', 'GREE',
  'TCL', 'SHARP', 'KOLIN', 'FUJITSU', 'YORK', 'MITSUBISHI', 'HAIER', 'CONDURA', 'EVEREST',
  'HISENSE', 'FUJIDENZO', 'HYUNDAI', 'AMERICAN HOME', 'ASTRON', 'HANABISHI', 'MABE', 'WHIRLPOOL',
] as const

/** Common source typos that would otherwise create a near-duplicate brand bucket. */
const BRAND_TYPO_FIXES: [RegExp, string][] = [
  [/\bHAEIR\b/, 'HAIER'],
  [/\bHYUNDIA\b/, 'HYUNDAI'],
]

/** Brand-only filter option — anything not a known manufacturer collapses into "OTHER"
 * instead of leaking free-text fragments (promo text, "SPLIT TYPE", etc) as fake brands. */
function getSimpleBrand(t: Ticket): string {
  let raw = parseBrand(t).toUpperCase().trim()
  if (!raw) return ''
  for (const [typo, fix] of BRAND_TYPO_FIXES) raw = raw.replace(typo, fix)
  for (const b of BRANDS_LIST) {
    if (raw.includes(b)) return b
  }
  return 'OTHER'
}

function authToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

type BranchOption = { id: string; name: string }

const PAGE_SIZE = 200
const MAX_PAGES_PER_STATUS = 50 // safety cap (~10k tickets per status)

/** Fetches every page for one Ticket.Status value — status can't be OR'd server-side. */
async function fetchAllTicketsByStatus(token: string, status: string, branchId: string | null): Promise<Ticket[]> {
  const all: Ticket[] = []
  let page = 0
  while (page < MAX_PAGES_PER_STATUS) {
    const params = new URLSearchParams({ status, page: String(page), size: String(PAGE_SIZE) })
    if (branchId) params.set('branchId', branchId)
    const res = await fetch(`${API_BASE_URL}/tickets?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break
    const data = await res.json()
    const rows: Ticket[] = data?.data?.tickets || data?.tickets || []
    all.push(...rows)
    const totalPages = data?.data?.totalPages ?? data?.totalPages ?? 1
    page += 1
    if (page >= totalPages || rows.length === 0) break
  }
  return all
}

export default function Registration() {
  const { theme } = useTheme()
  const { user } = useAuth()
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

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('ALL')
  const [monthFilter, setMonthFilter] = useState(() => new Date().toISOString().slice(0, 7))
  const [registeredFilter, setRegisteredFilter] = useState<'ALL' | 'PENDING' | 'REGISTERED'>('ALL')
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null)

  useEffect(() => {
    if (!isAdmin) return
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
        // branch list is best-effort for the filter dropdown
      }
    })()
  }, [isAdmin])

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = authToken()
      const branchId = isAdmin && branchFilter ? branchFilter : null
      // Schedule install closed — DB uses INSTALLED; legacy rows may still be COMPLETED.
      const [installed, completed] = await Promise.all([
        fetchAllTicketsByStatus(token, 'INSTALLED', branchId),
        fetchAllTicketsByStatus(token, 'COMPLETED', branchId),
      ])
      const merged = new Map<string, Ticket>()
      for (const t of [...installed, ...completed]) merged.set(t.id, t)
      // A COMPLETED status can also mean DONE_CLEANING/DONE_SURVEY/etc — keep only true installs.
      let doneInstalled = Array.from(merged.values()).filter(t => getScheduleStatusValue(t) === 'DONE_INSTALLED')
      // The backend's branch visibility query also OR-includes tickets personally assigned to
      // the current user regardless of branch — re-assert the exact branch here so a report
      // filter never silently pulls in someone's cross-branch assignments.
      if (branchId) {
        doneInstalled = doneInstalled.filter(t => branchScopesMatch(t.branchId || t.branch_id, branchId))
      }
      doneInstalled.sort((a, b) => {
        const keyOf = (t: Ticket) => getInstalledDateKey(t) || getFinalDateKey(t) || t.updatedAt || t.updated_at || ''
        return keyOf(b).localeCompare(keyOf(a))
      })
      setTickets(doneInstalled)
    } catch (err) {
      setError(errMsg(err, 'Failed to load registration tickets'))
    } finally {
      setLoading(false)
    }
  }, [isAdmin, branchFilter])

  useEffect(() => { void loadTickets() }, [loadTickets])

  const handleResolveConfirm = useCallback(async (ticket: Ticket, opts: { date: string; by: string; notes: string }) => {
    const token = authToken()
    const acDetails = mergeAcMeta(ticket, {
      warrantyRegistrationStatus: 'REGISTERED',
      warrantyRegisteredBy: opts.by,
      warrantyRegistrationDate: opts.date,
      registrationNotes: opts.notes,
    })
    const res = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ warrantyRegistrationCompleted: true, acDetails }),
    })
    if (!res.ok) throw new Error(await readApiError(res))
    setTickets(prev => prev.map(t => (
      t.id === ticket.id ? { ...t, acDetails, warrantyRegistrationCompleted: true } as Ticket : t
    )))
    setResolveTicket(null)
  }, [])

  const uniqueBrands = useMemo(() => {
    const set = new Set<string>()
    tickets.forEach(t => {
      const b = getSimpleBrand(t)
      if (b) set.add(b)
    })
    // Known brands first (alphabetical), catch-all bucket always last.
    const list = Array.from(set).filter(b => b !== 'OTHER').sort((a, b) => a.localeCompare(b))
    if (set.has('OTHER')) list.push('OTHER')
    return list
  }, [tickets])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter(t => {
      if (registeredFilter === 'PENDING' && isTicketRegistered(t)) return false
      if (registeredFilter === 'REGISTERED' && !isTicketRegistered(t)) return false
      if (brandFilter !== 'ALL' && getSimpleBrand(t) !== brandFilter) return false
      if (monthFilter) {
        const key = getInstalledDateKey(t) || getFinalDateKey(t)
        if (!key.startsWith(monthFilter)) return false
      }
      if (!q) return true
      const blob = [
        t.ticketNumber, t.ticket_number,
        getCustomerDisplayName(t),
        t.contactPhone, t.contact_phone, t.customerPhone, t.customer_phone,
        formatAddress(t.location),
        t.controlNumber, t.control_number,
        t.dealer,
        parseBrand(t),
        getInstallerDisplay(t),
        getTicketNegotiatorName(t),
        getBranchDisplayName(t.branchId || t.branch_id || null),
      ].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [tickets, search, brandFilter, monthFilter, registeredFilter])

  return (
    <div className="p-[5px] flex flex-col gap-2 h-full min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: textPrimary }}>
          <ClipboardCheck className="w-4.5 h-4.5" style={{ color: green }} />
          Registration
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: inputBg, color: textMuted, border: `1px solid ${inputBorder}` }}>
            {loading ? '…' : visible.length}
          </span>
        </h1>

        {/* Search / filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 min-w-[220px] rounded-lg px-3 py-1.5 border" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-xs outline-none w-full"
              style={{ color: textPrimary }}
            />
            {search && <button onClick={() => setSearch('')} style={{ color: textMuted }}><X className="w-3.5 h-3.5" /></button>}
          </div>

          <input
            type="month"
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            onClick={e => { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.() }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border outline-none cursor-pointer w-full"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: monthFilter ? textPrimary : textMuted }}
          />

          {isAdmin && (
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase border outline-none"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
            </select>
          )}

          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase border outline-none max-w-[160px]"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="ALL">All Brands</option>
            {uniqueBrands.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
          </select>

          <select
            value={registeredFilter}
            onChange={e => setRegisteredFilter(e.target.value as 'ALL' | 'PENDING' | 'REGISTERED')}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase border outline-none"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="ALL">All</option>
            <option value="PENDING">Pending</option>
            <option value="REGISTERED">Registered</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="flex-1 min-h-[70vh] border rounded-xl overflow-auto shadow-sm">
        <table className="w-full text-left table-fixed min-w-[1000px]">
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[6%]" />
            <col className="w-[17%]" />
            <col className="w-[8%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr style={{ backgroundColor: theadBg, color: textMuted, borderBottom: `1px solid ${border}` }} className="text-xs uppercase tracking-wider font-bold">
              <th className="px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Ticket #</th>
              <th className="px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Status</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Customer</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Branch</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Brand / Unit</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Commit</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Installer</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Negotiator</th>
              <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em]" style={{ color: textMuted }}>Installed</th>
              <th className="px-3 py-2.5" style={{ color: textMuted }}></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading ? (
              <tr><td colSpan={10} className="px-6 py-16 text-center" style={{ color: textMuted }}>
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                Loading registration tickets…
              </td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={10} className="px-6 py-16 text-center" style={{ color: textMuted }}>
                <ClipboardCheck className="w-7 h-7 mx-auto mb-2 opacity-40" />
                No done-install tickets found.
              </td></tr>
            ) : visible.map(t => {
              const custName = getCustomerDisplayName(t) || t.title
              const phone = t.contactPhone || t.contact_phone || t.customerPhone || t.customer_phone || ''
              const brand = parseBrand(t)
              const commit = getTicketCommitDisplay(t)
              const installer = getInstallerDisplay(t)
              const negotiator = getTicketNegotiatorName(t)
              const branchLabel = getBranchDisplayName(t.branchId || t.branch_id || null)
              const installedKey = getInstalledDateKey(t) || getFinalDateKey(t)
              const statusColor = getScheduleStatusBadgeStyle('DONE_INSTALLED', isLight).color
              const registered = isTicketRegistered(t)
              return (
                <tr
                  key={t.id}
                  style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}`, cursor: 'context-menu' }}
                  className="transition-colors"
                  onMouseEnter={el => (el.currentTarget.style.backgroundColor = rowHover)}
                  onMouseLeave={el => (el.currentTarget.style.backgroundColor = cardBg)}
                  onContextMenu={(e) => { e.preventDefault(); setDetailTicket(t) }}
                >
                  <td className="px-2 py-2.5 text-xs font-bold truncate" style={{ color: textMuted }} title={t.ticketNumber || t.ticket_number || t.id}>
                    {t.ticketNumber || t.ticket_number || t.id}
                  </td>
                  <td className="px-2 py-2.5 text-[10px] font-extrabold uppercase tracking-tight leading-tight" style={{ color: statusColor }}>
                    {getScheduleStatusLabel('DONE_INSTALLED')}
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="text-xs font-bold truncate" style={{ color: textPrimary }} title={custName}>{custName || '—'}</div>
                    {phone && <div className="text-[11px] truncate" style={{ color: textMuted }}>{fmtPhone(phone) || phone}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold uppercase truncate" style={{ color: textPrimary }}>{branchLabel || '—'}</td>
                  <td className="px-3 py-2.5 text-xs truncate" style={{ color: textPrimary }} title={brand}>{brand || '—'}</td>
                  <td className="px-3 py-2.5 text-xs truncate" style={{ color: textPrimary }} title={commit}>{commit || '—'}</td>
                  <td className="px-3 py-2.5 text-xs truncate" style={{ color: textPrimary }} title={installer}>{installer || '—'}</td>
                  <td className="px-3 py-2.5 text-xs truncate" style={{ color: textPrimary }} title={negotiator}>{negotiator || '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap" style={{ color: textPrimary }}>
                    {installedKey ? formatDateKeyLabel(installedKey) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {registered ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: green }}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Registered
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setResolveTicket(t) }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: green }}
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {detailTicket && (
        <RegistrationDetailModal
          ticket={detailTicket}
          isLight={isLight}
          onClose={() => setDetailTicket(null)}
        />
      )}

      {resolveTicket && (
        <ResolveRegistrationModal
          ticket={resolveTicket}
          isLight={isLight}
          defaultName={user?.name || ''}
          onClose={() => setResolveTicket(null)}
          onConfirm={(opts) => handleResolveConfirm(resolveTicket, opts)}
        />
      )}
    </div>
  )
}

function DField({ label, value, isLight }: { label: string; value: string; isLight: boolean }) {
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  return (
    <div className="flex flex-col gap-0.5 py-2 px-3 rounded-lg" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-xs font-semibold break-words leading-snug" style={{ color: textPrimary }}>{value || '—'}</span>
    </div>
  )
}

function RegistrationDetailModal({ ticket, isLight, onClose }: { ticket: Ticket; isLight: boolean; onClose: () => void }) {
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'

  const custName = getCustomerDisplayName(ticket) || ticket.title
  const phone = ticket.contactPhone || ticket.contact_phone || ticket.customerPhone || ticket.customer_phone || ''
  const addr = formatAddress(ticket.location)
  const branchLabel = getBranchDisplayName(ticket.branchId || ticket.branch_id || null)
  const brand = parseBrand(ticket)
  const installer = getInstallerDisplay(ticket)
  const negotiator = getTicketNegotiatorName(ticket)
  const installedKey = getInstalledDateKey(ticket) || getFinalDateKey(ticket)
  const commit = getTicketCommitDisplay(ticket)
  const meta = parseAcMeta(ticket)
  const registered = isTicketRegistered(ticket)
  const registeredBy = typeof meta.warrantyRegisteredBy === 'string' ? meta.warrantyRegisteredBy : (ticket as RegTicket).warrantyRegistrationCompletedBy || ''
  const registeredDate = typeof meta.warrantyRegistrationDate === 'string' ? meta.warrantyRegistrationDate : (ticket as RegTicket).warrantyRegistrationCompletedAt || ''
  const registrationNotes = typeof meta.registrationNotes === 'string' ? meta.registrationNotes : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: border }}>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>
              {ticket.ticketNumber || ticket.ticket_number || ticket.id}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>Done Install — Registration Details</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DField isLight={isLight} label="Customer" value={custName} />
          <DField isLight={isLight} label="Contact" value={phone ? (fmtPhone(phone) || phone) : ''} />
          <DField isLight={isLight} label="Address" value={addr} />
          <DField isLight={isLight} label="Branch" value={branchLabel} />
          <DField isLight={isLight} label="Brand / Unit" value={brand} />
          <DField isLight={isLight} label="Commit" value={commit} />
          <DField isLight={isLight} label="Installed" value={installedKey ? formatDateKeyLabel(installedKey) : ''} />
          <DField isLight={isLight} label="Installer / Technician" value={installer} />
          <DField isLight={isLight} label="Negotiator" value={negotiator} />
          <DField isLight={isLight} label="Dealer / Store" value={ticket.dealer || ''} />
          <DField isLight={isLight} label="Control No." value={ticket.controlNumber || ticket.control_number || ''} />
        </div>

        {registered && (
          <div className="px-5 pb-5">
            <div className="rounded-lg p-3" style={{ backgroundColor: isLight ? '#f0fdf4' : 'rgba(16,185,129,0.1)', border: `1px solid ${isLight ? '#bbf7d0' : 'rgba(16,185,129,0.3)'}` }}>
              <div className="flex items-center gap-1.5 text-xs font-bold mb-2" style={{ color: '#10B981' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Warranty Registered
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DField isLight={isLight} label="Registered By" value={registeredBy} />
                <DField isLight={isLight} label="Date" value={registeredDate ? formatDateKeyLabel(registeredDate.split('T')[0]) : ''} />
              </div>
              {registrationNotes && (
                <div className="mt-2">
                  <DField isLight={isLight} label="Notes" value={registrationNotes} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ResolveRegistrationModal({ ticket, isLight, defaultName, onClose, onConfirm }: {
  ticket: Ticket
  isLight: boolean
  defaultName: string
  onClose: () => void
  onConfirm: (opts: { date: string; by: string; notes: string }) => Promise<void>
}) {
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'

  const [date, setDate] = useState(todayIso())
  // Locked to the currently logged-in user — this is an attestation of who is resolving it.
  const by = defaultName.trim()
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    setSaving(true)
    setErr('')
    try {
      await onConfirm({ date, by: by.trim(), notes: notes.trim() })
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Failed to mark ticket as registered')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl shadow-xl" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: border }}>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Mark as Registered</h2>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>{ticket.ticketNumber || ticket.ticket_number || ticket.id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Date Registered</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm border outline-none"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Registered By</span>
            <div
              className="rounded-lg px-3 py-2 text-sm border"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, opacity: 0.85 }}
            >
              {by || '—'}
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Notes</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes…"
              className="rounded-lg px-3 py-2 text-sm border outline-none resize-none"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </label>

          {err && <p className="text-xs font-medium" style={{ color: '#EF4444' }}>{err}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold border disabled:opacity-50"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              Cancel
            </button>
            <button
              onClick={() => void submit()}
              disabled={saving || !by.trim()}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#10B981' }}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
