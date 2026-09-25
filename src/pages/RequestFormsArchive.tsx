import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Archive, Search, Building2, Filter, Loader2, Calendar,
  User as UserIcon, Undo2, X, Clock,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, isPortalAdmin, findBranchListEntry, formatBranchName, type BranchListEntry } from '../utils/api'
import { formInputStyle } from '../components/operations/FormField'
import { fetchCachedEmployees } from '../utils/portalDirectoryCache'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'

type TabId = 'cash-advance' | 'budget' | 'overtime'

interface ArchiveRecord {
  id: string
  employeeId: string
  employeeName?: string
  branchId?: string
  status: string
  createdAt: string
  archivedBy?: string
  archivedByName?: string
  archivedAt?: string
  // Type-specific fields, present depending on `type`.
  amount?: number
  purpose?: string
  fromBranch?: string
  fromDept?: string
  poNumber?: string
  payeeName?: string
  totalAmount?: number
  department?: string
  cutoffPeriod?: string
  notes?: string
  rejectionReason?: string
}

interface HistoryEntry {
  id: string
  previousStatus?: string
  newStatus: string
  changedByName?: string
  note?: string
  createdAt: string
}

interface UnifiedRow {
  id: string
  type: TabId
  createdAt: string
  employeeId: string
  requesterName: string
  branchLabel: string
  status: string
  amount: number | null
  detail: string
  archivedByName?: string
  archivedAt?: string
  raw: ArchiveRecord
}

const TAB_LABELS: Record<TabId, string> = {
  'cash-advance': 'Cash Advance',
  budget: 'Budget Request',
  overtime: 'Overtime Authorization',
}

const BASE_PATHS: Record<TabId, string> = {
  'cash-advance': '/hris/cash-advances',
  budget: '/operations/budget-requests',
  overtime: '/operations/overtime-requests',
}

const statusColors: Record<string, string> = {
  DONE: '#0ea5e9', RELEASED: '#8b5cf6', CANCELLED: '#64748b',
}

function getBranchLabel(id: string | null | undefined): string {
  if (!id) return ''
  return id.replace(/^BR-/i, '').replace(/-(sales|services)$/i, '').replace(/-/g, ' ').toUpperCase()
}

export default function RequestFormsArchive() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const pageBg = isLight ? '#f8fafc' : '#060B18'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#ffffff' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const istyle = formInputStyle(inputBg, inputBorder, textPrimary)
  const inputCls = 'w-full px-3 py-2 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role) || role === 'manager'

  const getToken = useCallback(() =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || '', [])

  const [records, setRecords] = useState<Record<TabId, ArchiveRecord[]>>({ 'cash-advance': [], budget: [], overtime: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [branches, setBranches] = useState<BranchListEntry[]>([])
  const [employeeDirectory, setEmployeeDirectory] = useState<Record<string, string>>({})
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | TabId>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DONE' | 'RELEASED' | 'CANCELLED'>('ALL')
  const [branchFilter, setBranchFilter] = useState('ALL')
  const [staffFilter, setStaffFilter] = useState('ALL')
  const [monthFilter, setMonthFilter] = useState('')

  const [selected, setSelected] = useState<UnifiedRow | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const fetchArchive = useCallback(async () => {
    setLoading(true)
    setError(null)
    const headers = { Authorization: `Bearer ${getToken()}` }
    const suffix = isAdmin ? '?archived=true' : '/my?archived=true'
    try {
      const [caRes, budRes, otRes] = await Promise.all([
        fetch(`${API_BASE_URL}${BASE_PATHS['cash-advance']}${suffix}`, { headers }),
        fetch(`${API_BASE_URL}${BASE_PATHS.budget}${suffix}`, { headers }),
        fetch(`${API_BASE_URL}${BASE_PATHS.overtime}${suffix}`, { headers }),
      ])
      const next: Record<TabId, ArchiveRecord[]> = { 'cash-advance': [], budget: [], overtime: [] }
      let anyFailed = false
      if (caRes.ok) next['cash-advance'] = await caRes.json(); else anyFailed = true
      if (budRes.ok) next.budget = await budRes.json(); else anyFailed = true
      if (otRes.ok) next.overtime = await otRes.json(); else anyFailed = true
      setRecords(next)
      if (anyFailed) setError('Some archived requests could not be loaded.')
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }, [getToken, isAdmin])

  useEffect(() => { fetchArchive() }, [fetchArchive])

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${getToken()}` } })
        if (!res.ok) return
        const data = await res.json()
        setBranches(data?.data || [])
      } catch { /* best-effort */ }
    })()
  }, [getToken])

  useEffect(() => {
    if (!isAdmin) return
    fetchCachedEmployees(getToken()).then(list => {
      const map: Record<string, string> = {}
      list.forEach(u => {
        const id = u.id as string
        if (id) map[id] = (u.name as string) || id
      })
      setEmployeeDirectory(map)
    }).catch(() => { /* directory is a display enhancement */ })
  }, [isAdmin, getToken])

  const resolveBranchLabel = useCallback((...candidates: (string | null | undefined)[]) => {
    for (const cand of candidates) {
      if (!cand || !cand.trim()) continue
      const clean = cand.trim()
      const matched = findBranchListEntry(clean, branches) || branches.find(b =>
        b.id.toLowerCase() === clean.toLowerCase() || b.name.toLowerCase() === clean.toLowerCase())
      if (matched) return matched.name.toUpperCase().replace(/^ASHCOL\s+/i, '').replace(/-(SALES|SERVICES)$/i, '').trim()
      const formatted = getBranchLabel(clean)
      if (formatted && !formatted.includes('-') && formatted.length < 30) return formatted
    }
    return '—'
  }, [branches])

  const getRequesterName = useCallback((employeeId: string, fallbackName?: string) =>
    fallbackName || (employeeId === user?.id ? user?.name : employeeDirectory[employeeId]) || employeeId || '—',
    [user?.id, user?.name, employeeDirectory])

  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const ca = records['cash-advance'].map((r): UnifiedRow => ({
      id: r.id, type: 'cash-advance', createdAt: r.createdAt, employeeId: r.employeeId,
      requesterName: getRequesterName(r.employeeId, r.employeeName),
      branchLabel: resolveBranchLabel(r.branchId),
      status: r.status, amount: r.amount ?? null,
      detail: r.purpose || '—', archivedByName: r.archivedByName, archivedAt: r.archivedAt, raw: r,
    }))
    const bud = records.budget.map((r): UnifiedRow => ({
      id: r.id, type: 'budget', createdAt: r.createdAt, employeeId: r.employeeId,
      requesterName: getRequesterName(r.employeeId),
      branchLabel: resolveBranchLabel(r.fromBranch, r.branchId),
      status: r.status, amount: r.totalAmount ?? null,
      detail: r.payeeName ? `Payee: ${r.payeeName}` : (r.poNumber ? `PO ${r.poNumber}` : '—'),
      archivedByName: r.archivedByName, archivedAt: r.archivedAt, raw: r,
    }))
    const ot = records.overtime.map((r): UnifiedRow => ({
      id: r.id, type: 'overtime', createdAt: r.createdAt, employeeId: r.employeeId,
      requesterName: getRequesterName(r.employeeId, r.employeeName),
      branchLabel: resolveBranchLabel(r.department, r.branchId),
      status: r.status, amount: null,
      detail: r.cutoffPeriod ? `Cut-off: ${r.cutoffPeriod}` : '—',
      archivedByName: r.archivedByName, archivedAt: r.archivedAt, raw: r,
    }))
    return [...ca, ...bud, ...ot].sort((x, y) => new Date(y.archivedAt || y.createdAt).getTime() - new Date(x.archivedAt || x.createdAt).getTime())
  }, [records, resolveBranchLabel, getRequesterName])

  const matchesBranch = useCallback((r: UnifiedRow, filterId: string) => {
    if (!filterId || filterId === 'ALL') return true
    const selectedBranch = branches.find(b => b.id.toLowerCase() === filterId.toLowerCase())
    if (!selectedBranch) return false
    const branchName = selectedBranch.name.toLowerCase()
    const rowLabel = r.branchLabel.toLowerCase()
    if (rowLabel === branchName || branchName.includes(rowLabel) || rowLabel.includes(branchName)) return true
    const formatted = formatBranchName(selectedBranch.name, selectedBranch.id).toLowerCase()
    return rowLabel === formatted || formatted.includes(rowLabel) || rowLabel.includes(formatted)
  }, [branches])

  const filteredRows = useMemo(() => unifiedRows.filter(r => {
    if (typeFilter !== 'ALL' && r.type !== typeFilter) return false
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (!matchesBranch(r, branchFilter)) return false
    if (staffFilter !== 'ALL' && r.employeeId !== staffFilter) return false
    if (monthFilter && !(r.createdAt || '').startsWith(monthFilter)) return false
    if (searchQuery.trim()) {
      const term = searchQuery.trim().toLowerCase()
      const haystack = `${r.id} ${r.requesterName} ${r.branchLabel} ${r.detail}`.toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  }), [unifiedRows, typeFilter, statusFilter, branchFilter, staffFilter, monthFilter, searchQuery])

  const staffOptions = useMemo(() => {
    const seen = new Map<string, string>()
    unifiedRows.forEach(r => { if (!seen.has(r.employeeId)) seen.set(r.employeeId, r.requesterName) })
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [unifiedRows])

  const openDetail = async (row: UnifiedRow) => {
    setSelected(row)
    setHistory([])
    setHistoryLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}${BASE_PATHS[row.type]}/${row.id}/history`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (res.ok) setHistory(await res.json())
    } catch { /* history is supplementary */ } finally {
      setHistoryLoading(false)
    }
  }

  const requestRestore = (row: UnifiedRow) => {
    setConfirmDialog({
      title: 'Restore this request?',
      message: `This will move the request back to the active Request Forms list at its status before it was archived.`,
      variant: 'save',
      confirmText: 'Restore',
      onConfirm: async () => {
        setRestoring(true)
        try {
          const res = await fetch(`${API_BASE_URL}${BASE_PATHS[row.type]}/${row.id}/restore`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          })
          if (res.ok) {
            setSelected(null)
            fetchArchive()
          } else {
            const err = await res.json().catch(() => ({}))
            setError(err.error || err.message || 'Failed to restore request.')
          }
        } catch {
          setError('Failed to restore request.')
        } finally {
          setRestoring(false)
        }
      },
    })
  }

  const formatDate = (value?: string) => value
    ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  return (
    <div className="flex flex-col gap-4 pb-10" style={{ backgroundColor: pageBg }}>
      <div className="flex items-center gap-2">
        <Archive className="w-5 h-5" style={{ color: '#10B981' }} />
        <h1 className="text-lg font-extrabold" style={{ color: textPrimary }}>Request Forms Archive</h1>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-xl text-xs font-semibold" style={{ backgroundColor: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)' }}>
          {error}
        </div>
      )}

      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] col-span-2 sm:col-span-1">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search Request ID, staff, branch, detail…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`${inputCls} pl-8`}
              style={istyle}
            />
          </div>
          {isAdmin && (
            <div className="relative w-full sm:w-auto">
              <Building2 className="absolute left-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className={`${inputCls} pl-8 appearance-none cursor-pointer`} style={istyle} aria-label="Filter by branch">
                <option value="ALL">All branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{formatBranchName(b.name, b.id)}</option>)}
              </select>
            </div>
          )}
          {isAdmin && (
            <div className="relative w-full sm:w-auto">
              <UserIcon className="absolute left-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
              <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className={`${inputCls} pl-8 appearance-none cursor-pointer`} style={istyle} aria-label="Filter by staff">
                <option value="ALL">All staff</option>
                {staffOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          )}
          <div className="relative w-full sm:w-auto">
            <Filter className="absolute left-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'ALL' | TabId)} className={`${inputCls} pl-8 appearance-none cursor-pointer`} style={istyle} aria-label="Filter by request type">
              <option value="ALL">All types</option>
              {(Object.keys(TAB_LABELS) as TabId[]).map(t => <option key={t} value={t}>{TAB_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="relative w-full sm:w-auto">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'ALL' | 'DONE' | 'RELEASED' | 'CANCELLED')} className={`${inputCls} appearance-none cursor-pointer`} style={istyle} aria-label="Filter by status">
              <option value="ALL">All statuses</option>
              <option value="DONE">Done</option>
              <option value="RELEASED">Released</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="relative w-full sm:w-auto">
            <Calendar className="absolute left-2.5 top-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: textMuted }} />
            <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={`${inputCls} pl-8`} style={istyle} aria-label="Filter by month" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: textMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs font-semibold">Loading…</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-12 text-xs font-semibold" style={{ color: textMuted }}>No archived requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ fontSize: '12px', color: textPrimary }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${border}`, color: textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                  <th className="px-3 py-3">Request ID</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Staff</th>
                  <th className="px-3 py-3">Branch</th>
                  <th className="px-3 py-3">Detail</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3">Archived By</th>
                  <th className="px-3 py-3">Archived At</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, idx) => (
                  <tr
                    key={`${r.type}-${r.id}`}
                    onClick={() => openDetail(r)}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ borderBottom: idx < filteredRows.length - 1 ? `1px solid ${border}` : 'none' }}
                  >
                    <td className="px-3 py-3 font-mono font-bold">#{r.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-3 py-3">{TAB_LABELS[r.type]}</td>
                    <td className="px-3 py-3 font-semibold">{r.requesterName}</td>
                    <td className="px-3 py-3" style={{ color: textMuted }}>{r.branchLabel}</td>
                    <td className="px-3 py-3" style={{ color: textMuted }}>{r.detail}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.amount != null ? `₱${r.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ color: statusColors[r.status] || textMuted, backgroundColor: `${statusColors[r.status] || textMuted}1a` }}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3" style={{ color: textMuted }}>{r.archivedByName || '—'}</td>
                    <td className="px-3 py-3" style={{ color: textMuted, whiteSpace: 'nowrap' }}>{formatDate(r.archivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / restore modal */}
      {selected && (
        <div className="fixed inset-0 z-[13000] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ borderBottom: `1px solid ${border}` }}>
              <div>
                <h2 className="text-sm font-black" style={{ color: textPrimary }}>#{selected.id.slice(0, 8).toUpperCase()} — {TAB_LABELS[selected.type]}</h2>
                <p className="text-xs mt-1" style={{ color: textMuted }}>{selected.requesterName} · {selected.branchLabel}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="font-bold block" style={{ color: textMuted }}>Status</span><span style={{ color: statusColors[selected.status] || textPrimary }}>{selected.status}</span></div>
                <div><span className="font-bold block" style={{ color: textMuted }}>Submitted</span>{formatDate(selected.createdAt)}</div>
                <div><span className="font-bold block" style={{ color: textMuted }}>Amount</span>{selected.amount != null ? `₱${selected.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}</div>
                <div><span className="font-bold block" style={{ color: textMuted }}>Detail</span>{selected.detail}</div>
                <div><span className="font-bold block" style={{ color: textMuted }}>Archived By</span>{selected.archivedByName || '—'}</div>
                <div><span className="font-bold block" style={{ color: textMuted }}>Archived At</span>{formatDate(selected.archivedAt)}</div>
                {selected.raw.notes && (
                  <div className="col-span-2"><span className="font-bold block" style={{ color: textMuted }}>Notes</span>{selected.raw.notes}</div>
                )}
                {selected.raw.rejectionReason && (
                  <div className="col-span-2"><span className="font-bold block" style={{ color: textMuted }}>Rejection Reason</span>{selected.raw.rejectionReason}</div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs font-black mb-2" style={{ color: textPrimary }}>
                  <Clock className="w-3.5 h-3.5" /> Status History
                </div>
                {historyLoading ? (
                  <div className="flex items-center gap-2 text-xs" style={{ color: textMuted }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                ) : history.length === 0 ? (
                  <p className="text-xs" style={{ color: textMuted }}>No history recorded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {history.map(h => (
                      <li key={h.id} className="text-xs pl-3" style={{ borderLeft: `2px solid ${border}`, color: textMuted }}>
                        <span className="font-bold" style={{ color: textPrimary }}>{h.previousStatus ? `${h.previousStatus} → ${h.newStatus}` : h.newStatus}</span>
                        {' '}by {h.changedByName || 'system'} · {formatDate(h.createdAt)}
                        {h.note && <div className="italic">"{h.note}"</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="px-5 py-4 flex justify-end" style={{ borderTop: `1px solid ${border}` }}>
                <button
                  type="button"
                  onClick={() => requestRestore(selected)}
                  disabled={restoring}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #16A34A, #15803D)' }}
                >
                  {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                  Restore to Active
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}
