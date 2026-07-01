import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Navigate } from 'react-router-dom'
import { ShieldCheck, Search, Loader2, CheckCircle2, Clock, RefreshCw, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { formatPersonName, isPortalAdmin } from '../utils/api'
import { FilterPills } from '../components/TicketSectionNav'
import {
  getInitialWarrantyFromStorage,
  markWarrantyRegistered,
  patchWarrantyCache,
  readWarrantyCache,
  refreshWarrantyRegistrations,
  resolveWarrantyBranchId,
  warrantyCacheIsFresh,
  type WarrantyListsCache,
  type WarrantyTicket,
} from '../utils/warrantyRegistration'
import {
  resolveControlNumber,
  resolveScheduleTicketNo,
  resolveWarrantyBrand,
} from '../utils/warrantyTicketDisplay'
import { resetTicketTableScroll } from '../utils/tabSwitch'

function resolveInstallerName(row: WarrantyTicket) {
  const name = row.installerName?.trim()
  return name ? formatPersonName(name) : '—'
}

function resolveNegotiatorName(row: WarrantyTicket) {
  const name = row.negotiatorName?.trim()
  return name ? formatPersonName(name) : '—'
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

  const initialWarranty = getInitialWarrantyFromStorage()

  const [tab, setTab] = useState<'pending' | 'registered'>('pending')
  const [pendingRows, setPendingRows] = useState<WarrantyTicket[]>(() => initialWarranty.pending)
  const [registeredRows, setRegisteredRows] = useState<WarrantyTicket[]>(() => initialWarranty.registered)
  const [loading, setLoading] = useState(() => !initialWarranty.hasCache)
  const [refreshing, setRefreshing] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchSeqRef = useRef(0)
  const hasLoadedOnceRef = useRef(initialWarranty.hasCache)

  const token = () =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  const counts = useMemo(
    () => ({ pending: pendingRows.length, registered: registeredRows.length }),
    [pendingRows.length, registeredRows.length],
  )

  const rows = tab === 'pending' ? pendingRows : registeredRows

  const handleTabChange = useCallback((next: 'pending' | 'registered') => {
    if (next === tab) return
    setTab(next)
    setSearchQuery('')
    resetTicketTableScroll()
  }, [tab])

  useLayoutEffect(() => {
    resetTicketTableScroll()
  }, [tab])

  const applyCache = useCallback((cache: WarrantyListsCache) => {
    setPendingRows(cache.pending)
    setRegisteredRows(cache.registered)
  }, [])

  const showToast = (type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, message })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  const refreshFromServer = useCallback(async (options?: { forceSync?: boolean; soft?: boolean }) => {
    const branchId = resolveWarrantyBranchId(user)
    const seq = ++fetchSeqRef.current
    const cached = readWarrantyCache(branchId)
    const hasCache = Boolean(cached && (cached.pending.length > 0 || cached.registered.length > 0))
    const cacheIsFresh = warrantyCacheIsFresh(branchId)

    if (hasCache) {
      applyCache(cached!)
      setLoading(false)
      hasLoadedOnceRef.current = true
    }

    if (cacheIsFresh && !options?.forceSync) {
      return
    }

    const showSkeleton = !options?.soft && !hasLoadedOnceRef.current && !hasCache
    if (showSkeleton) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const fresh = await refreshWarrantyRegistrations(token(), branchId, {
        forceSync: options?.forceSync,
      })
      if (seq !== fetchSeqRef.current) return
      applyCache(fresh)
      hasLoadedOnceRef.current = true
    } catch (err: unknown) {
      if (seq !== fetchSeqRef.current) return
      if (!hasLoadedOnceRef.current && !hasCache) {
        setError(err instanceof Error ? err.message : 'Could not load warranty registrations')
        setPendingRows([])
        setRegisteredRows([])
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [applyCache, user])

  useEffect(() => {
    const branchId = resolveWarrantyBranchId(user)
    const cached = readWarrantyCache(branchId)
    if (cached) {
      applyCache(cached)
      setLoading(false)
      hasLoadedOnceRef.current = true
    }
    void refreshFromServer({ soft: !!cached })
  }, [applyCache, refreshFromServer, user])

  useEffect(() => {
    const onBranchChange = () => {
      hasLoadedOnceRef.current = false
      const branchId = resolveWarrantyBranchId(user)
      const cached = readWarrantyCache(branchId)
      if (cached) {
        applyCache(cached)
        setLoading(false)
      } else {
        setLoading(true)
        setPendingRows([])
        setRegisteredRows([])
      }
      void refreshFromServer({ soft: !!cached })
    }
    window.addEventListener('ashcol-global-branch-change', onBranchChange)
    return () => window.removeEventListener('ashcol-global-branch-change', onBranchChange)
  }, [applyCache, refreshFromServer, user])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        r.customerName,
        r.parentCustomerName,
        r.controlNumber,
        r.parentControlNumber,
        r.ticketNumber,
        r.parentTicketNumber,
        r.unitBrandDisplay,
        r.unitType,
        r.acDetails,
        r.installerName,
        r.negotiatorName,
        r.sourceVendor,
        r.remarksUpdate,
      ].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [rows, searchQuery])

  const handleMarkRegistered = async (ticket: WarrantyTicket) => {
    if (savingId) return
    const branchId = resolveWarrantyBranchId(user)
    const prevPending = pendingRows
    const prevRegistered = registeredRows

    setSavingId(ticket.id)
    setPendingRows((list) => list.filter((r) => r.id !== ticket.id))
    setRegisteredRows((list) => [
      { ...ticket, warrantyRegistrationCompleted: true, status: 'COMPLETED' },
      ...list,
    ])
    patchWarrantyCache(branchId, {
      pending: prevPending.filter((r) => r.id !== ticket.id),
      registered: [
        { ...ticket, warrantyRegistrationCompleted: true, status: 'COMPLETED' },
        ...prevRegistered,
      ],
    })

    try {
      await markWarrantyRegistered(token(), ticket.id)
      showToast('success', `${formatPersonName(ticket.customerName || ticket.parentCustomerName || 'Customer')} marked as registered`)
      void refreshFromServer({ soft: true })
    } catch (err: unknown) {
      setPendingRows(prevPending)
      setRegisteredRows(prevRegistered)
      patchWarrantyCache(branchId, { pending: prevPending, registered: prevRegistered })
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
          <div className="flex flex-wrap items-center gap-2 w-full">
            <FilterPills
              value={tab}
              onChange={handleTabChange}
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
              onClick={() => void refreshFromServer({ forceSync: true })}
              disabled={loading || refreshing}
              className="p-2 rounded-lg border shrink-0 disabled:opacity-50"
              style={{ borderColor: border, color: textMuted }}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
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

      <div className="flex-1 min-h-0 overflow-auto" data-ticket-table-scroll style={{ backgroundColor: cardBg }}>
        {loading && pendingRows.length === 0 && registeredRows.length === 0 ? (
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
              Installed archives sync here automatically. Use refresh to pull the latest.
            </p>
          </div>
        ) : (
          <table key={tab} className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: theadBg }}>
              <tr>
                {['Customer', 'SI / Control', 'Brand / Model', 'Schedule #', 'Negotiator', 'Installer', 'Status', ''].map((h) => (
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
                    {resolveControlNumber(row)}
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textPrimary }}>
                    {resolveWarrantyBrand(row)}
                  </td>
                  <td className="px-3 py-2.5 font-mono font-semibold" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textMuted }}>
                    {resolveScheduleTicketNo(row)}
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textMuted }}>
                    {resolveNegotiatorName(row)}
                  </td>
                  <td className="px-3 py-2.5" style={{ borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}`, color: textMuted }}>
                    {resolveInstallerName(row)}
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
