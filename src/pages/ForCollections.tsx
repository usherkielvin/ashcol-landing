import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import {
  ClipboardList, Search, CheckCircle2,
  Loader2, Building2, Eye, X, ChevronDown, Pencil, Calendar, Download, FileEdit, AlertTriangle, User
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatDisplayUserLabel, formatBranchName, isPortalAdmin } from '../utils/api'
import { EmployeeNameLink } from '../components/EmployeeNameLink'
import CollectionMarkPaidModal from '../components/collections/CollectionMarkPaidModal'
import { exportDtrReportToPdf } from '../utils/pdfExport'

interface CollectionItem {
  id: string
  description: string // Installer/Negotiator
  amount: number
  customer: string
  company?: string
  units?: number
  collectionResolved: boolean
  status: 'PENDING' | 'RESOLVED'
  reportId?: string
  reportDate?: string
  branchId?: string
  branchName?: string
  receivedBy?: string
  trNo?: string
  auditLine?: string
  collectionNotes?: string
  collectionResolvedBy?: string
  collectionResolvedAt?: string
  collectionUpdatedBy?: string
  collectionUpdatedAt?: string
}

interface DtrReportDetails {
  items: any[]
  receivedBy?: string
  createdAt?: string | null
  updatedAt?: string | null
  updatedBy?: string | null
  branchName?: string
  reportDate?: string
  grossSales?: number
  targetDailyQuota?: number
  difference?: number
  remarks?: string
  cohPreviousDay?: number
  fundFromHo?: number
  cashReturns?: number
  forCollection?: number
  rebatesForCollection?: number
  totalUnitsScheduled?: number
  totalUnitsSurveyOnly?: number
  totalUnitsInstalled?: number
  totalUnitsServiced?: number
  totalUnitsCancelled?: number
  totalUnitsFreeInstall?: number
  totalRescheduled?: number
}

const TAB_CONFIG = {
  collections: { singular: 'collection', singularCap: 'Collection', plural: 'Collections', resolveLabel: 'Resolve', resolvedLabel: 'Resolved', confirmLabel: 'Confirm Resolve' },
  rebates:     { singular: 'rebate',     singularCap: 'Rebate',     plural: 'Rebates',     resolveLabel: 'Mark as Paid', resolvedLabel: 'Paid', confirmLabel: 'Confirm Paid' },
  incentives:  { singular: 'incentive',  singularCap: 'Incentive',  plural: 'Incentives',  resolveLabel: 'Resolve', resolvedLabel: 'Resolved', confirmLabel: 'Confirm Resolve' },
} as const

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatDateTime = (value?: string | null) => {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return value || ''
    return d.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return value || ''
  }
}

const getToken = () =>
  localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

// Some legacy "For Collection" rows got pipe-delimited codes (e.g. "REBATE|COMPANY|1.5")
// pasted into the free-text Installer field instead of an actual installer name — those
// values belong to the Rebate/Commission/Incentive/Payable line-item format, not this column.
// Strip the tag so the table never renders raw internal codes, and flag the row for correction.
const INTERNAL_TAG_PREFIXES = ['REBATE', 'COMMISSION', 'INCENTIVE', 'CHECK', 'PARTS', 'ORDER', 'PAYABLE']
const parseInstallerLabel = (description?: string): { label: string; malformed: boolean } => {
  const trimmed = (description || '').trim()
  if (!trimmed) return { label: '', malformed: false }
  const match = trimmed.match(/^([A-Z_]+)\|(.*)$/)
  if (match && INTERNAL_TAG_PREFIXES.includes(match[1])) {
    const rest = match[2].split('|').map(s => s.trim()).filter(Boolean)
    return { label: rest[0] || match[1], malformed: true }
  }
  return { label: trimmed, malformed: false }
}

const isNoTransactionRemarks = (remarks: string) =>
  remarks === 'NO SCHED' || remarks === 'NO TRANSACTION' || remarks === 'NO RECORD' || remarks === 'NO REPORT'

const formatRemarksLabel = (remarks: string, compact: boolean) => {
  if (isNoTransactionRemarks(remarks)) return compact ? 'No Trans' : 'No Transaction'
  if (compact && remarks === 'ABOVE QUOTA') return 'ABOVE'
  if (compact && remarks === 'BELOW QUOTA') return 'BELOW'
  return remarks
}

// ── Inline Notes Cell ────────────────────────────────────────────────────────
interface InlineNotesCellProps {
  itemId: string
  note: string
  updatedBy?: string
  updatedAt?: string
  textPrimary: string
  textMuted: string
  inputBg: string
  onSave: (itemId: string, note: string) => Promise<void>
}

function InlineNotesCell({
  itemId, note, updatedBy, updatedAt,
  textPrimary, textMuted, inputBg, onSave
}: InlineNotesCellProps) {
  const [editing, setEditing]       = useState(false)
  const [expanded, setExpanded]     = useState(false)
  const [draft, setDraft]           = useState(note)
  const [saving, setSaving]         = useState(false)
  const textareaRef                 = useRef<HTMLTextAreaElement>(null)
  const cellRef                     = useRef<HTMLDivElement>(null)
  const isLong                      = note.length > 60

  // Reset draft when note prop changes (after save sync)
  useEffect(() => { setDraft(note) }, [note])

  const openEdit = () => {
    setDraft(note)
    setEditing(true)
    setExpanded(false)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    })
  }

  const save = async () => {
    if (draft === note) { setEditing(false); return }
    setSaving(true)
    try { await onSave(itemId, draft) } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const cancel = () => { setDraft(note); setEditing(false) }

  // Close expanded dropdown when clicking outside
  useEffect(() => {
    if (!expanded) return
    const handler = (e: MouseEvent) => {
      if (cellRef.current && !cellRef.current.contains(e.target as Node)) setExpanded(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expanded])

  if (editing) {
    return (
      <div style={{ minWidth: 200 }}>
        <textarea
          ref={textareaRef}
          rows={3}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') cancel()
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save()
          }}
          onBlur={save}
          style={{
            width: '100%', fontSize: '12px', borderRadius: '8px',
            padding: '6px 8px', border: `1.5px solid #10B981`,
            backgroundColor: inputBg, color: textPrimary,
            resize: 'none', outline: 'none', lineHeight: 1.5
          }}
          placeholder="Add a note..."
        />
        <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '10px', color: textMuted }}>Ctrl+Enter to save · Esc cancel</span>
          {saving && <Loader2 size={12} style={{ color: '#10B981', animation: 'spin 1s linear infinite' }} />}
        </div>
      </div>
    )
  }

  return (
    <div ref={cellRef} style={{ position: 'relative', minWidth: 160 }}>
      <div
        onDoubleClick={openEdit}
        title="Double-click to edit"
        style={{ display: 'flex', alignItems: 'flex-start', gap: 4, cursor: 'text', userSelect: 'none' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {note ? (
            <>
              <span style={{
                display: 'block',
                overflow: 'hidden',
                textOverflow: expanded ? 'unset' : 'ellipsis',
                whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
                wordBreak: 'break-word',
                lineHeight: 1.5
              }}>{note}</span>
              {updatedBy && (
                <span style={{ fontSize: '10px', color: textMuted, display: 'block', marginTop: 1 }}>
                  {updatedBy} · {updatedAt ? new Date(updatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: textMuted, fontStyle: 'italic', fontSize: '11px' }}>Double-click to add note</span>
          )}
        </div>

        {/* Right-side buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0, marginTop: 1 }}>
          {isLong && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
              onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
              title={expanded ? 'Collapse' : 'Expand note'}
              style={{
                background: 'none', border: 'none', padding: '1px 2px',
                cursor: 'pointer', color: textMuted, lineHeight: 1,
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease'
              }}
            >
              <ChevronDown size={12} />
            </button>
          )}
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={e => { e.stopPropagation(); openEdit() }}
            title="Edit note"
            style={{
              background: 'none', border: 'none', padding: '1px 2px',
              cursor: 'pointer', color: textMuted, lineHeight: 1,
              opacity: 0.6
            }}
          >
            <Pencil size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

export default function ForCollections() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const isDark = theme === 'dark'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const [items, setItems] = useState<CollectionItem[]>([])
  const [activeTab, setActiveTab] = useState<'collections' | 'rebates' | 'incentives'>('collections')
  const tc = TAB_CONFIG[activeTab]

  // true only on the very first load; subsequent refetches show stale data
  const [initialLoading, setInitialLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const hasFetchedOnce = useRef(false)

  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const handleExportPdf = async () => {
    if (isExportingPdf || !selectedRow) return
    setIsExportingPdf(true)
    try {
      const reportDateDisplay = selectedRow.reportDate
        ? new Date(selectedRow.reportDate + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
        : '—'

      const submittedByStr = selectedRow.receivedBy
        ? formatDisplayUserLabel(selectedRow.receivedBy)
        : undefined

      const updatedByStr = selectedRow.collectionUpdatedBy
        ? formatDisplayUserLabel(selectedRow.collectionUpdatedBy)
        : undefined

      await exportDtrReportToPdf('for-collections-modal-content', {
        branchName: formatBranchName(selectedRow.branchName || 'BRANCH'),
        dateDisplay: reportDateDisplay,
        submittedBy: submittedByStr,
        updatedBy: updatedByStr,
        updatedAt: selectedRow.collectionUpdatedAt ? formatDateTime(selectedRow.collectionUpdatedAt) : undefined,
        status: selectedRow.collectionResolved ? 'RESOLVED' : 'PENDING',
      }, 'Collection_Report')
    } catch (err) {
      console.error('PDF Export Error:', err)
    } finally {
      setIsExportingPdf(false)
    }
  }

  // Filters
  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('PENDING')
  // Admins default to "All Branches" but can still filter to one via the Branch dropdown below —
  // deliberately NOT tied to the app's global active-branch switcher (that switcher drives
  // other pages, but Collections/Rebates/Incentives should stay independent of it).
  const [branchFilter, setBranchFilter] = useState(() => {
    const role = (user?.role || '').toLowerCase()
    if (isPortalAdmin(role)) return ''
    return user?.branchId
      ? user.branchId.replace(/-(sales|services|service)$/i, '')
      : ''
  })
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])

  // Date filters — monthFilter = 'YYYY-MM'; '' = All Months (default)
  const [monthFilter, setMonthFilter] = useState('')

  const [confirmItem, setConfirmItem] = useState<CollectionItem | null>(null)
  const [notesText, setNotesText] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Details Modal state
  const [selectedRow, setSelectedRow] = useState<CollectionItem | null>(null)
  const [rowExpenses, setRowExpenses] = useState<DtrReportDetails | null>(null)
  const [rowExpensesLoading, setRowExpensesLoading] = useState(false)

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)
  const isManager = role === 'manager'
  const canResolve = isAdmin || isManager || role === 'staff' || role === 'employee'

  // Debounced search — only triggers re-filter after 200 ms of no typing
  const handleSearchChange = (value: string) => {
    setRawSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 200)
  }

  const cacheKey = (tab: string) =>
    `ashcol-fc-cache-${tab}-${branchFilter}-${statusFilter}-${monthFilter}`

  const fetchCollections = useCallback(async (silent = false) => {
    // ── Restore from cache instantly so there's no blank flash ──
    const cached = sessionStorage.getItem(cacheKey(activeTab))
    if (cached) {
      try {
        const parsed: CollectionItem[] = JSON.parse(cached)
        setItems(parsed)
        setInitialLoading(false)
      } catch { /* ignore */ }
    }

    if (!silent) setFetching(true)
    try {
      const params = new URLSearchParams()
      if (branchFilter) params.append('branchId', branchFilter)
      if (statusFilter === 'PENDING') params.append('pendingOnly', 'true')
      if (monthFilter) params.append('month', monthFilter)

      const endpoint = activeTab === 'collections' ? 'collections' : activeTab === 'rebates' ? 'rebates' : 'incentives'
      const res = await fetch(`${API_BASE_URL}/v1/reports/${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      if (res.ok) {
        let list: CollectionItem[] = await res.json()
        if (statusFilter === 'RESOLVED') {
          list = list.filter(item => item.collectionResolved)
        }
        setItems(list)
        try { sessionStorage.setItem(cacheKey(activeTab), JSON.stringify(list)) } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Failed to fetch collections', e)
    } finally {
      setFetching(false)
      if (!hasFetchedOnce.current) hasFetchedOnce.current = true
      setInitialLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter, statusFilter, activeTab, monthFilter])

  // Parallel initial fetch — branches and collections at the same time
  useEffect(() => {
    const token = getToken()
    const branchReq = fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const list = (data?.data || data || []).map((b: any) => ({ id: b.id, name: b.name }))
        setBranches(list.sort((a: any, b: any) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
    const colReq = fetchCollections()
    Promise.all([branchReq, colReq])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On tab switch — restore cached data instantly; no blank screen
  useEffect(() => {
    if (!hasFetchedOnce.current) return
    const cached = sessionStorage.getItem(cacheKey(activeTab))
    if (cached) {
      try {
        setItems(JSON.parse(cached))
        setInitialLoading(false)
      } catch { setItems([]); setInitialLoading(true) }
    } else {
      setItems([])
      setInitialLoading(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Re-fetch when filters change
  useEffect(() => {
    if (!hasFetchedOnce.current) return
    fetchCollections()
  }, [fetchCollections])

  const handleResolve = async (item: CollectionItem, amountPaid?: number, datePaid?: string, referenceNumber?: string, whoPaid?: string, customerName?: string) => {
    // Optimistic update — mark resolved immediately in UI
    const now = new Date().toISOString()
    setItems(prev => prev.map(it =>
      it.id === item.id
        ? { ...it, collectionResolved: true, collectionResolvedBy: user?.name || '', collectionResolvedAt: now, customer: customerName || it.customer }
        : it
    ))
    setConfirmItem(null)
    setSelectedRow(null)
    try {
      const res = await fetch(`${API_BASE_URL}/v1/reports/collections/${item.id}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          notes: item.id === selectedRow?.id ? notesText : '',
          amountPaid,
          datePaid,
          referenceNumber,
          whoPaid,
          customerName
        })
      })
      if (!res.ok) {
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, collectionResolved: false } : it))
      } else {
        fetchCollections(true)
      }
    } catch {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, collectionResolved: false } : it))
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedRow) return
    setSavingNotes(true)
    try {
      const res = await fetch(`${API_BASE_URL}/v1/reports/collections/${selectedRow.id}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: notesText })
      })
      if (res.ok) {
        const updatedItems = items.map(it => {
          if (it.id === selectedRow.id) {
            const updated = {
              ...it,
              collectionNotes: notesText,
              collectionUpdatedBy: user?.name || 'Staff',
              collectionUpdatedAt: new Date().toISOString()
            }
            setSelectedRow(updated)
            return updated
          }
          return it
        })
        setItems(updatedItems)
      }
    } catch {
      // ignore network errors silently
    } finally {
      setSavingNotes(false)
    }
  }

  const fetchRowExpenses = async (reportId: string) => {
    setRowExpensesLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/${reportId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (res.ok) {
        const data = await res.json()
        setRowExpenses({
          items: data.items || [],
          receivedBy: data.receivedBy || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          updatedBy: data.updatedBy || null,
          branchName: data.branchName || '',
          reportDate: data.reportDate || '',
          grossSales: data.grossSales || 0,
          targetDailyQuota: data.targetDailyQuota || 0,
          difference: data.difference || 0,
          remarks: data.remarks || '',
          cohPreviousDay: data.cohPreviousDay || 0,
          fundFromHo: data.fundFromHo || 0,
          cashReturns: data.cashReturns || 0,
          forCollection: data.forCollection || 0,
          rebatesForCollection: data.rebatesForCollection || 0,
          totalUnitsScheduled: data.totalUnitsScheduled || 0,
          totalUnitsSurveyOnly: data.totalUnitsSurveyOnly || 0,
          totalUnitsInstalled: data.totalUnitsInstalled || 0,
          totalUnitsServiced: data.totalUnitsServiced || 0,
          totalUnitsCancelled: data.totalUnitsCancelled || 0,
          totalUnitsFreeInstall: data.totalUnitsFreeInstall || 0,
          totalRescheduled: data.totalRescheduled || 0,
        })
      }
    } catch (err) {
      console.error('Failed to fetch DTR details:', err)
      setRowExpenses({ items: [], receivedBy: '', createdAt: null, updatedAt: null, updatedBy: null })
    } finally {
      setRowExpensesLoading(false)
    }
  }

  // Build month options from current items (+ last 12 months always available)
  const monthOptions = useMemo(() => {
    const seen = new Set<string>()
    items.forEach(item => {
      if (item.reportDate) seen.add(item.reportDate.slice(0, 7))
    })
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(seen).sort((a, b) => b.localeCompare(a))
  }, [items])

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  // Memoized filter — instant, no re-render on every keystroke
  const filteredItems = useMemo(() => {
    const term = search.toLowerCase()
    return items.filter(item => {
      const matchSearch =
        (item.description || '').toLowerCase().includes(term) ||
        (item.customer || '').toLowerCase().includes(term) ||
        (item.company || '').toLowerCase().includes(term) ||
        (item.branchName || '').toLowerCase().includes(term)
      const matchMonth = !monthFilter || (item.reportDate || '').startsWith(monthFilter)
      return matchSearch && matchMonth
    })
  }, [items, search, monthFilter])

  const totalAmount = useMemo(
    () => filteredItems.reduce((acc, item) => {
      if (activeTab === 'rebates') {
        return acc + (item.amount * (item.units || 1))
      }
      return acc + item.amount
    }, 0),
    [filteredItems, activeTab]
  )

  const renderDtrModal = () => {
    if (!selectedRow) return null

    const itemsList = rowExpenses?.items || []
    const cashTxItems = itemsList.filter(it => it.type === 'CASH_SALE' && !it.description?.startsWith('PARTS|') && !it.description?.startsWith('RETURN|'))
    const cashRetItems = itemsList.filter(it => it.type === 'CASH_SALE' && it.description?.startsWith('RETURN|'))
    const onlineTxItems = itemsList.filter(it => it.type === 'ONLINE_SALE' && !it.description?.startsWith('CHECK|'))
    const checkItems = itemsList.filter(it => it.type === 'ONLINE_SALE' && it.description?.startsWith('CHECK|'))
    const partsSaleItems = itemsList.filter(it => it.type === 'CASH_SALE' && it.description?.startsWith('PARTS|'))
    const expenseItems = itemsList.filter(it => it.type === 'EXPENSE')
    const purchaseItems = itemsList.filter(it => it.type === 'PURCHASE' && !it.description?.startsWith('ORDER|'))
    const orderItems = itemsList.filter(it => it.type === 'PURCHASE' && it.description?.startsWith('ORDER|'))
    const rebateItems = itemsList.filter(it => it.type === 'REBATE')
    const forCollItems = itemsList.filter(it => it.type === 'COLLECTION')
    const incentiveItems = itemsList.filter(it => it.type === 'INCENTIVE')
    const totalIncentives = incentiveItems.reduce((sum, it) => sum + (it.amount || 0), 0)
    const commissionItems = itemsList.filter(it => it.type === 'COMMISSION')
    const cashAdvanceItems = itemsList.filter(it => it.type === 'CASH_ADVANCE')

    const totalCashCollection = cashTxItems.reduce((sum, it) => sum + (it.amount || 0), 0) + partsSaleItems.reduce((sum, it) => sum + (it.amount || 0), 0)
    const totalOnlineCollection = onlineTxItems.reduce((sum, it) => sum + (it.amount || 0), 0) + checkItems.reduce((sum, it) => sum + (it.amount || 0), 0)
    const cashReturns = cashRetItems.reduce((sum, it) => sum + (it.amount || 0), 0)
    const totalCohCfd = (rowExpenses?.cohPreviousDay || 0) + (rowExpenses?.fundFromHo || 0) + cashReturns + totalCashCollection

    const formatHpDisplay = (raw?: any) => {
      if (!raw || raw === '—') return '—'
      const s = String(raw).trim()
      if (!s) return '—'
      if (/hp$/i.test(s)) return s.toUpperCase()
      return `${s}HP`
    }

    const renderItemTable = (title: string, tableItems: any[], columns: { label: string; render: (item: any) => ReactNode; align?: 'left' | 'right' | 'center' }[], customTotal?: number, noBorderBottom?: boolean) => {
      if (tableItems.length === 0) return null
      const sumValue = customTotal !== undefined ? customTotal : tableItems.reduce((acc, it) => acc + (it.amount || 0), 0)
      const isExpenseType = title.includes('Expense') || title.includes('Purchase') || title.includes('Order') || title.includes('Cash Advance')
      
      return (
        <div className={`px-6 py-5 ${noBorderBottom ? '' : 'border-b'}`} style={{ borderColor: border }}>
          <div className="flex items-center justify-between mb-4">
            <p className={`text-xs font-extrabold uppercase tracking-wider ${isExpenseType ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {title}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold tabular-nums" style={{ color: isExpenseType ? '#EF4444' : '#10B981' }}>
                ₱{peso(sumValue)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/30 text-[11px] font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${border}`, color: textMuted }}>
                  {columns.map((col, idx) => (
                    <th key={idx} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableItems.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/20 transition-colors" style={{ borderBottom: i < tableItems.length - 1 ? `1px solid ${border}` : 'none' }}>
                    {columns.map((col, idx) => (
                      <td key={idx} className={`px-4 py-3 text-xs sm:text-sm ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                        {idx === 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-normal tabular-nums shrink-0" style={{ color: textPrimary }}>{i + 1}.</span>
                            <span>{col.render(item)}</span>
                          </div>
                        ) : (
                          col.render(item)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    return ReactDOM.createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-3 backdrop-blur-md safe-area-top safe-area-bottom"
        style={{ backgroundColor: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)' }}
        onClick={() => setSelectedRow(null)}
      >
        <div
          className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-6xl xl:max-w-7xl h-[96vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '96vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="flex items-start justify-between w-full sm:w-auto">
              <div>
                <h4 className="font-black text-base" style={{ color: textPrimary }}>{selectedRow.branchName || 'DTR Report Details'}</h4>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
                  <span className="text-[11px]" style={{ color: textMuted }}>
                    {selectedRow.reportDate ? new Date(selectedRow.reportDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <span style={{
                      display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
                      backgroundColor: rowExpenses?.remarks === 'PENDING' ? '#F59E0B' : '#10B981'
                    }} />
                    <span style={{ color: rowExpenses?.remarks === 'PENDING' ? '#F59E0B' : '#10B981' }}>
                      {rowExpenses?.remarks || 'SUBMITTED'}
                    </span>
                  </span>
                  {rowExpenses?.createdAt && (
                    <span style={{ color: textMuted }}>
                      Submitted: <span style={{ color: textPrimary, fontWeight: 600 }}>{formatDateTime(rowExpenses.createdAt)}</span>
                      {rowExpenses.receivedBy && <> by <span style={{ color: textPrimary, fontWeight: 600 }}><EmployeeNameLink nameOrId={formatDisplayUserLabel(rowExpenses.receivedBy)} /></span></>}
                    </span>
                  )}
                  {rowExpenses?.updatedAt && rowExpenses.updatedAt !== rowExpenses.createdAt && (
                    <span style={{ color: '#F59E0B' }}>
                      Last Edited: <span style={{ fontWeight: 600 }}>{formatDateTime(rowExpenses.updatedAt)}</span>
                      {rowExpenses.updatedBy && <> by <span style={{ fontWeight: 600 }}><EmployeeNameLink nameOrId={formatDisplayUserLabel(rowExpenses.updatedBy)} /></span></>}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedRow(null)}
                className="sm:hidden p-1.5 rounded-lg transition-colors hover:bg-slate-500/10" style={{ color: textMuted }} aria-label="Close details dialog">
                <X size={22} />
              </button>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center justify-center gap-1.5 shadow-sm border-none disabled:opacity-50"
              >
                {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Export PDF
              </button>

              {canResolve && selectedRow.reportId && (
                <a
                  href={`/audit-report?tab=submit&id=${selectedRow.reportId}`}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5 shadow-sm border-none"
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  Edit Report
                </a>
              )}

              <button
                onClick={() => setSelectedRow(null)}
                className="hidden sm:flex items-center justify-center p-2 rounded-xl transition-colors hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close details dialog"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div id="for-collections-modal-content" className="flex-1 overflow-y-auto">
            {rowExpensesLoading ? (
              <div className="px-6 py-10 flex flex-col gap-3 justify-center items-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span className="text-xs font-semibold text-slate-400">Loading transaction details...</span>
              </div>
            ) : (
              <>
                {/* Main metrics — 3 flat columns */}
                <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderBottom: `1px solid ${border}` }}>
                  {/* Sales Summary */}
                  <div className="px-6 py-5" style={{ borderRight: `1px solid ${border}` }}>
                    <p className="text-xs font-black uppercase tracking-wider mb-3.5 text-blue-600 dark:text-blue-400">Sales Summary</p>
                    <div className="flex flex-col gap-2.5">
                      {[
                        { label: 'Gross Sales', value: `₱${peso(rowExpenses?.grossSales)}`, color: textPrimary },
                        { label: 'Target Quota', value: `₱${peso(rowExpenses?.targetDailyQuota)}`, color: '#8B5CF6' },
                        { label: 'Difference', value: `${(rowExpenses?.difference || 0) >= 0 ? '+' : ''}₱${peso(rowExpenses?.difference)}`, color: (rowExpenses?.difference || 0) >= 0 ? '#10B981' : '#EF4444' },
                        { label: 'Remarks', value: formatRemarksLabel(rowExpenses?.remarks || '', false), color: rowExpenses?.remarks === 'ABOVE QUOTA' ? '#10B981' : rowExpenses?.remarks === 'PENDING' ? '#F59E0B' : '#EF4444' },
                      ].map(r => (
                        <div key={r.label} className="flex items-center justify-between gap-3">
                          <span className="text-xs sm:text-sm font-medium" style={{ color: textMuted }}>{r.label}</span>
                          <span className="text-xs sm:text-sm font-bold tabular-nums" style={{ color: r.color }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cash Flow */}
                  <div className="px-6 py-5" style={{ borderRight: `1px solid ${border}` }}>
                    <p className="text-xs font-black uppercase tracking-wider mb-3.5 text-emerald-600 dark:text-emerald-400">Cash Flow</p>
                    <div className="flex flex-col gap-2.5">
                      {[
                        { label: 'COH Prev Day', value: `₱${peso(rowExpenses?.cohPreviousDay)}`, bold: false },
                        { label: 'Fund from HO', value: `₱${peso(rowExpenses?.fundFromHo)}`, bold: false },
                        { label: 'Cash Returns', value: `₱${peso(cashReturns)}`, bold: false },
                        { label: 'Total COH/CFD', value: `₱${peso(totalCohCfd)}`, bold: true },
                      ].map(r => (
                        <div key={r.label} className="flex items-center justify-between gap-3">
                          <span className="text-xs sm:text-sm font-medium" style={{ color: textMuted }}>{r.label}</span>
                          <span className={`text-xs sm:text-sm tabular-nums ${r.bold ? 'font-black' : 'font-semibold'}`} style={{ color: textPrimary }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Collections */}
                  <div className="px-6 py-5">
                    <p className="text-xs font-black uppercase tracking-wider mb-3.5 text-indigo-600 dark:text-indigo-400">Collections</p>
                    <div className="flex flex-col gap-2.5">
                      {[
                        { label: 'Cash Collection', value: `₱${peso(totalCashCollection)}` },
                        { label: 'Online Collection', value: `₱${peso(totalOnlineCollection)}` },
                        { label: 'For Collection', value: `₱${peso(rowExpenses?.forCollection)}` },
                        { label: 'Rebates', value: `₱${peso(rowExpenses?.rebatesForCollection)}` },
                        { label: 'Incentives', value: `₱${peso(totalIncentives)}` },
                      ].map(r => (
                        <div key={r.label} className="flex items-center justify-between gap-3">
                          <span className="text-xs sm:text-sm font-medium" style={{ color: textMuted }}>{r.label}</span>
                          <span className="text-xs sm:text-sm font-bold tabular-nums" style={{ color: textPrimary }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Collection Note & Status Updates */}
                <div className="px-6 py-5 border-b" style={{ borderColor: border }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>Collection Updates & Notes</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Audit Log / Status Column */}
                    <div className="rounded-xl p-4 border text-left" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                      <h5 className="text-xs font-bold mb-3" style={{ color: textPrimary }}>Status & Audit Info</h5>
                      <div className="flex flex-col gap-2 text-xs">
                        <div className="flex justify-between border-b pb-1.5" style={{ borderColor: border }}>
                          <span style={{ color: textMuted }}>Current Status:</span>
                          <span className="font-bold uppercase" style={{ color: selectedRow.collectionResolved ? '#10B981' : '#F59E0B' }}>
                            {selectedRow.collectionResolved ? 'RESOLVED' : 'PENDING'}
                          </span>
                        </div>
                        
                        {selectedRow.collectionResolved && (
                          <>
                            <div className="flex justify-between border-b pb-1.5" style={{ borderColor: border }}>
                              <span style={{ color: textMuted }}>Resolved By:</span>
                              <span className="font-bold" style={{ color: textPrimary }}><EmployeeNameLink nameOrId={selectedRow.collectionResolvedBy} /></span>
                            </div>
                            <div className="flex justify-between border-b pb-1.5" style={{ borderColor: border }}>
                              <span style={{ color: textMuted }}>Resolved At:</span>
                              <span className="font-mono text-[11px]" style={{ color: textPrimary }}>{formatDateTime(selectedRow.collectionResolvedAt)}</span>
                            </div>
                          </>
                        )}

                        <div className="flex justify-between border-b pb-1.5" style={{ borderColor: border }}>
                          <span style={{ color: textMuted }}>Last Updated By:</span>
                          <span className="font-semibold" style={{ color: textPrimary }}><EmployeeNameLink nameOrId={selectedRow.collectionUpdatedBy} /></span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: textMuted }}>Last Updated At:</span>
                          <span className="font-mono text-[11px]" style={{ color: textPrimary }}>{formatDateTime(selectedRow.collectionUpdatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Note Field */}
                    <div className="flex flex-col gap-2 text-left">
                      <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Notes / Updates</label>
                      <textarea
                        rows={3}
                        placeholder="Type updates or notes here..."
                        className="w-full rounded-xl p-3 text-xs border focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all resize-none"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end mt-1">
                        <button
                          type="button"
                          disabled={savingNotes}
                          onClick={handleSaveNotes}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-500 hover:bg-slate-600 transition-all flex items-center gap-1.5 disabled:opacity-50 border-none"
                        >
                          {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Update Notes'}
                        </button>
                        {!selectedRow.collectionResolved && canResolve && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmItem(selectedRow)
                            }}
                            className="px-5 py-2 rounded-xl text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600 transition-all flex items-center gap-1.5 border-none"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Resolve {tc.singularCap}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Lists */}
                {(cashTxItems.length > 0 || onlineTxItems.length > 0 || cashRetItems.length > 0 || checkItems.length > 0) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x border-b" style={{ borderColor: border }}>
                    <div className="flex flex-col divide-y" style={{ borderColor: border }}>
                      {renderItemTable('Cash Transactions', cashTxItems, [
                        { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                        { label: 'Installer', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                        { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                      ], undefined, true)}
                      {renderItemTable('Check Remits', checkItems, [
                        { label: 'Installer', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description.replace('CHECK|', ''))}</span> },
                        { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                        { label: 'Bank', render: (item) => <span style={{ color: textPrimary }}>{item.bank || '—'}</span> },
                        { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                      ], undefined, true)}
                    </div>

                    <div className="flex flex-col">
                      {renderItemTable('Online Transactions', onlineTxItems, [
                        { label: 'Installer', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                        { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                        { label: 'Bank', render: (item) => <span style={{ color: textPrimary }}>{item.bank || '—'}</span> },
                        { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                      ], undefined, true)}
                      {renderItemTable('Cash Returns', cashRetItems, [
                        { label: 'Returned By (Installer/Technician/Driver)', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description.replace('RETURN|', ''))}</span> },
                        { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                      ], undefined, true)}
                    </div>
                  </div>
                )}

                {renderItemTable('Parts Sales / Unit Sales', partsSaleItems, [
                  { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                  { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[2] || '—'}</span> },
                  { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                ])}

                {(expenseItems.length > 0 || purchaseItems.length > 0) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x border-b" style={{ borderColor: border }}>
                    <div>
                      {renderItemTable('Expenses with Receipts', expenseItems, [
                        { label: 'Name', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[0] ? formatDisplayUserLabel(item.description.split('|')[0]) : '—'}</span> },
                        { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                        { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                      ], undefined, true)}
                    </div>
                    <div>
                      {renderItemTable('Expenses for Purchase', purchaseItems, [
                        { label: 'Name', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[0] ? formatDisplayUserLabel(item.description.split('|')[0]) : '—'}</span> },
                        { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                        { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                      ], undefined, true)}
                    </div>
                  </div>
                )}

                {renderItemTable('Parts Order / Units Order', orderItems, [
                  { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                  { label: 'Description', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[2] || '—'}</span> },
                  { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                ])}

                {renderItemTable('For Collection Breakdown', forCollItems, [
                  { label: 'Installer/Negotiator', render: (item) => <span style={{ color: textPrimary }}>{formatDisplayUserLabel(item.description)}</span> },
                  { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                  { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                  {
                    label: 'Status',
                    align: 'center',
                    render: (item) => (
                      <span className="text-xs sm:text-sm font-normal uppercase" style={{ color: textPrimary }}>
                        {item.collectionResolved ? 'RESOLVED' : 'PENDING'}
                      </span>
                    )
                  }
                ])}

                {renderItemTable('Rebates Breakdown', rebateItems, [
                  { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                  { label: 'Company', render: (item) => <span style={{ color: textPrimary }}>{item.description.split('|')[1] || '—'}</span> },
                  { label: 'Brand', render: (item) => <span style={{ color: textPrimary }}>{item.company || '—'}</span> },
                  {
                    label: 'HP',
                    render: (item) => (
                      <span className="text-xs sm:text-sm font-normal" style={{ color: textPrimary }}>
                        {formatHpDisplay(item.description.split('|')[2])}
                      </span>
                    )
                  },
                  { label: 'Rate', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> }
                ])}

                {/* Unit Summary stats grid */}
                <div className="px-6 py-5 flex flex-col gap-3" style={{ borderBottom: `1px solid ${border}` }}>
                  <div className="flex items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: border }}>
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Unit Summary</span>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {[
                      { label: 'Scheduled', value: String(rowExpenses?.totalUnitsScheduled || 0) },
                      { label: 'Rescheduled', value: String(rowExpenses?.totalRescheduled || 0) },
                      { label: 'Installed', value: String(rowExpenses?.totalUnitsInstalled || 0) },
                      { label: 'Serviced', value: String(rowExpenses?.totalUnitsServiced || 0) },
                      { label: 'Cancelled', value: String(rowExpenses?.totalUnitsCancelled || 0) },
                      { label: 'Free Install', value: String(rowExpenses?.totalUnitsFreeInstall || 0) },
                      { label: 'Survey Only', value: String(rowExpenses?.totalUnitsSurveyOnly || 0) },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg px-3 py-2.5 flex flex-col justify-between" style={{ border: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{item.label}</div>
                        <div className="mt-1 text-sm font-normal tabular-nums" style={{ color: textPrimary }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {renderItemTable('Incentives Breakdown', incentiveItems, [
                  { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                  { label: 'Brand', render: (item) => <span style={{ color: textPrimary }}>{item.company || '—'}</span> },
                  { label: 'Promodiser', render: (item) => <span style={{ color: textPrimary }}>{item.promodiser || item.description?.split('|')[1] || '—'}</span> },
                  {
                    label: 'HP',
                    render: (item) => (
                      <span className="text-xs sm:text-sm font-normal" style={{ color: textPrimary }}>
                        {formatHpDisplay(item.hp || item.description?.split('|')[2])}
                      </span>
                    )
                  },
                  { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                  {
                    label: 'Status',
                    align: 'center',
                    render: (item) => (
                      <span className="text-xs sm:text-sm font-normal uppercase" style={{ color: textPrimary }}>
                        {item.collectionResolved ? 'RESOLVED' : 'PENDING'}
                      </span>
                    )
                  }
                ])}

                {renderItemTable('Commission Expenses', commissionItems, [
                  { label: 'Ticket No.', render: (item) => <span style={{ color: textPrimary }}>{item.ticketNumber || '—'}</span> },
                  { label: 'Store', render: (item) => <span style={{ color: textPrimary }}>{item.company || '—'}</span> },
                  { label: 'Diser', render: (item) => <span style={{ color: textPrimary }}>{item.promodiser || '—'}</span> },
                  { label: 'Customer', render: (item) => <span style={{ color: textPrimary }}>{item.customer || '—'}</span> },
                  { label: 'Brand', render: (item) => <span style={{ color: textPrimary }}>{item.brand || item.bank || (item.description && item.description.startsWith('COMMISSION|') ? item.description.split('|')[2] : '') || '—'}</span> },
                  {
                    label: 'HP',
                    render: (item) => {
                      const hpVal = item.hp || (item.description && item.description.startsWith('COMMISSION|') ? item.description.split('|')[3] : '')
                      return (
                        <span className="text-xs sm:text-sm font-normal" style={{ color: textPrimary }}>
                          {formatHpDisplay(hpVal)}
                        </span>
                      )
                    }
                  },
                  { label: 'Date Installed', render: (item) => <span style={{ color: textPrimary }}>{item.dateInstalled || '—'}</span> },
                  { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                  {
                    label: 'Status',
                    align: 'center',
                    render: (item) => (
                      <span className="text-xs sm:text-sm font-normal uppercase" style={{ color: item.collectionResolved ? '#10B981' : '#F59E0B' }}>
                        {item.collectionResolved ? 'PAID' : 'PENDING'}
                      </span>
                    )
                  }
                ])}

                {renderItemTable('Cash Advance', cashAdvanceItems, [
                  { label: 'Member Name', render: (item) => <span style={{ color: textPrimary }}>{item.description?.split('|')[0] || '—'}</span> },
                  { label: 'Details', render: (item) => <span style={{ color: textPrimary }}>{item.description?.split('|').slice(1).join('|') || '—'}</span> },
                  { label: 'Amount', align: 'right', render: (item) => <span className="tabular-nums" style={{ color: textPrimary }}>₱{peso(item.amount)}</span> },
                ])}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t flex items-center justify-between shrink-0"
            style={{ borderColor: border, backgroundColor: isLight ? 'rgba(248,250,252,0.8)' : 'rgba(6,11,24,0.5)' }}>
            <span className="text-[11px]" style={{ color: textMuted }}>
              {user?.name && <>Viewing as <strong style={{ color: textPrimary }}>{user.name}</strong></>}
            </span>
            <button
              type="button"
              onClick={() => setSelectedRow(null)}
              className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 transition-all active:scale-95"
              style={{ backgroundColor: '#10B981' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-8 md:pb-8">
      {/* Tab Selector */}
      <div className="flex items-center gap-2 p-1 rounded-xl self-start" style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
        <button
          type="button"
          onClick={() => setActiveTab('collections')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'collections' ? 'shadow-md' : 'opacity-70 hover:opacity-100'}`}
          style={{
            backgroundColor: activeTab === 'collections' ? '#10B981' : 'transparent',
            color: activeTab === 'collections' ? '#ffffff' : textPrimary
          }}
        >
          Collections
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rebates')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'rebates' ? 'shadow-md' : 'opacity-70 hover:opacity-100'}`}
          style={{
            backgroundColor: activeTab === 'rebates' ? '#10B981' : 'transparent',
            color: activeTab === 'rebates' ? '#ffffff' : textPrimary
          }}
        >
          Rebates
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('incentives')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'incentives' ? 'shadow-md' : 'opacity-70 hover:opacity-100'}`}
          style={{
            backgroundColor: activeTab === 'incentives' ? '#10B981' : 'transparent',
            color: activeTab === 'incentives' ? '#ffffff' : textPrimary
          }}
        >
          Incentives
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder={activeTab === 'collections' ? "Search installer, customer or branch..." : activeTab === 'rebates' ? "Search company, brand or branch..." : "Search dealer, customer or branch..."}
              value={rawSearch}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all border"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>

          {/* Branch filter — admins can switch (default All Branches), non-admins see a locked badge */}
          {isAdmin ? (
            <div className="relative min-w-[180px]">
              <Building2 className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all"
                style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
                aria-label="Filter by Branch"
              >
                <option value="">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
              <Building2 className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
              <span className="truncate max-w-[160px]">
                {branches.find(b => b.id === branchFilter)?.name
                  ? formatBranchName(branches.find(b => b.id === branchFilter)!.name)
                  : formatBranchName(user?.branchId || 'My Branch')}
              </span>
            </div>
          )}

          {/* Status filter */}
          <div className="relative min-w-[140px]">
            <ClipboardList className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all"
              style={{ color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder }}
              aria-label="Filter by Resolution Status"
            >
              <option value="PENDING">Pending {tc.plural}</option>
              <option value="RESOLVED">{tc.resolvedLabel} {tc.plural}</option>
              <option value="ALL">All {tc.plural}</option>
            </select>
          </div>

          {/* Month picker */}
          <div className="relative min-w-[160px]">
            <Calendar className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all"
              style={{ color: monthFilter ? textPrimary : textMuted, backgroundColor: inputBg, borderColor: monthFilter ? '#10B981' : inputBorder }}
              aria-label="Filter by Month"
            >
              <option value="">All Months</option>
              {monthOptions.map(ym => (
                <option key={ym} value={ym}>{monthLabel(ym)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 md:justify-end">
          <div className="px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2"
            style={{ backgroundColor: inputBg, borderColor: border }}>
            <span style={{ color: textMuted }}>Total Amount:</span>
            <span style={{ color: '#F59E0B' }}>₱{peso(totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Collections List Table */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}`, position: 'relative' }}>
        {/* Slim fetch indicator */}
        {fetching && !initialLoading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', zIndex: 10, overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, transparent, #10B981, transparent)',
              animation: 'shimmerBar 1.2s ease-in-out infinite',
              backgroundSize: '200% 100%'
            }} />
          </div>
        )}
        <style>{`
          @keyframes shimmerBar {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          @keyframes fadeInTable {
            from { opacity: 0; transform: translateY(4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {initialLoading ? (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{
                height: '40px',
                borderRadius: '8px',
                background: isLight
                  ? `linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)`
                  : `linear-gradient(90deg, #0d1520 25%, #1E2D48 50%, #0d1520 75%)`,
                backgroundSize: '200% 100%',
                animation: `shimmerBar 1.4s ease-in-out ${i * 0.08}s infinite`
              }} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 className="w-12 h-12 opacity-25 text-emerald-500" />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              No {tc.singular} items found.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ animation: 'fadeInTable 0.18s ease-out' }}>
            <table className="w-full text-left border-collapse" style={{ fontSize: '12px', color: textPrimary }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${border}`, color: textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                  <th className="px-3 py-3" style={{ width: 130 }}>TR No. / Date</th>
                  <th className="px-3 py-3">Submitted By</th>
                  <th className="px-3 py-3">Branch</th>
                  {activeTab === 'collections' ? (
                    <>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Installer</th>
                    </>
                  ) : activeTab === 'rebates' ? (
                    <>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Company</th>
                      <th className="px-3 py-3">Brand</th>
                      <th className="px-3 py-3 text-center" style={{ width: 60 }}>HP</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Brand</th>
                      <th className="px-3 py-3 text-center" style={{ width: 60 }}>HP</th>
                      <th className="px-3 py-3">Promodiser</th>
                    </>
                  )}
                  {(activeTab === 'collections' || activeTab === 'incentives') && <th className="px-3 py-3" style={{ minWidth: 160 }}>Notes</th>}
                  <th className="px-3 py-3 text-right" style={{ width: 110 }}>Amount</th>
                  <th className="px-3 py-3 text-center" style={{ width: 90 }}>Status</th>
                  <th className="px-3 py-3 text-center no-print" style={{ width: 130 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const resolved = item.collectionResolved

                  let companyRa = '—'
                  let brand = '—'
                  let hpDisplay = '—'
                  let promodiser = '—'

                  if (activeTab === 'rebates') {
                    brand = item.company || '—'
                    if (item.description && item.description.includes('|')) {
                      const parts = item.description.split('|')
                      companyRa = parts[1] || '—'
                      const rawHp = parts[2] || '—'
                      hpDisplay = rawHp !== '—' ? rawHp.replace(/hp/i, '').trim() : '—'
                    } else {
                      companyRa = item.description || '—'
                    }
                  } else if (activeTab === 'incentives') {
                    brand = item.company || '—'
                    if (item.description && item.description.includes('|')) {
                      const parts = item.description.split('|')
                      promodiser = parts[1] || '—'
                      const rawHp = parts[2] || '—'
                      hpDisplay = rawHp !== '—' ? rawHp.replace(/hp/i, '').trim() : '—'
                    } else {
                      promodiser = item.description || '—'
                    }
                  }

                  return (
                    <tr
                      key={item.id}
                      className="transition-colors"
                      style={{
                        borderBottom: idx < filteredItems.length - 1 ? `1px solid ${border}` : 'none',
                        color: textPrimary,
                        backgroundColor: resolved ? (isLight ? 'rgba(16,185,129,0.03)' : 'rgba(16,185,129,0.04)') : 'transparent'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = isLight ? '#f8fafc' : '#0d1520' }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = resolved ? (isLight ? 'rgba(16,185,129,0.03)' : 'rgba(16,185,129,0.04)') : 'transparent' }}
                    >
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: '10px', fontWeight: 700, color: isLight ? '#94a3b8' : '#475569', background: isLight ? '#f1f5f9' : '#1e293b', borderRadius: '4px', padding: '1px 5px', lineHeight: 1.4, flexShrink: 0 }}>{idx + 1}</span>
                            <span style={{ fontSize: '11px', fontWeight: 500 }}>
                              {item.trNo || <span style={{ color: textMuted }}>—</span>}
                            </span>
                          </div>
                          {item.reportDate ? (
                            <span style={{ color: textMuted, fontSize: '10px', marginTop: '2px' }}>
                              {new Date(item.reportDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          ) : (
                            <span style={{ color: textMuted, fontSize: '10px', marginTop: '2px' }}>—</span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3" style={{ color: textMuted, fontSize: '11px' }}>
                        <EmployeeNameLink nameOrId={formatDisplayUserLabel(item.receivedBy)} />
                      </td>

                      <td className="px-3 py-3" style={{ whiteSpace: 'nowrap' }}>
                        {item.branchName
                          ? formatBranchName(item.branchName)
                          : <span style={{ color: textMuted }}>—</span>}
                      </td>

                      {activeTab === 'collections' ? (
                        <>
                          <td className="px-3 py-3" style={{ fontWeight: 500 }}>
                            {item.customer || <span style={{ color: textMuted, fontWeight: 400 }}>—</span>}
                          </td>

                          <td className="px-3 py-3">
                            {(() => {
                              const { label, malformed } = parseInstallerLabel(item.description)
                              if (!label) return <span style={{ color: textMuted }}>—</span>
                              return (
                                <div className="flex items-center gap-2">
                                  <span
                                    className="flex items-center justify-center rounded-full shrink-0"
                                    style={{
                                      width: 22, height: 22,
                                      backgroundColor: isLight ? '#eef2ff' : 'rgba(99,102,241,0.15)',
                                      color: '#6366f1'
                                    }}
                                  >
                                    <User size={11} />
                                  </span>
                                  <EmployeeNameLink nameOrId={formatDisplayUserLabel(label)} />
                                  {malformed && (
                                    <span
                                      title="This looks like it was pasted from the wrong field (Rebates/Commission format). Please correct the installer name via Edit Report."
                                      style={{ color: '#F59E0B', display: 'inline-flex', cursor: 'help' }}
                                    >
                                      <AlertTriangle size={12} />
                                    </span>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                        </>
                      ) : activeTab === 'rebates' ? (
                        <>
                          <td className="px-3 py-3 font-semibold">
                            {item.customer || <span className="text-slate-400 font-normal dark:text-slate-600">—</span>}
                          </td>

                          <td className="px-3 py-3" style={{ fontWeight: 500 }}>
                            {companyRa}
                          </td>

                          <td className="px-3 py-3">
                            {brand}
                          </td>

                          <td className="px-3 py-3 text-center">
                            {hpDisplay !== '—' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                                {hpDisplay}
                              </span>
                            ) : '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 font-semibold">
                            {item.customer || <span className="text-slate-400 font-normal dark:text-slate-600">—</span>}
                          </td>

                          <td className="px-3 py-3">
                            {brand}
                          </td>

                          <td className="px-3 py-3 text-center">
                            {hpDisplay !== '—' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                                {hpDisplay}
                              </span>
                            ) : '—'}
                          </td>

                          <td className="px-3 py-3" style={{ fontWeight: 500 }}>
                            <EmployeeNameLink nameOrId={promodiser} />
                          </td>
                        </>
                      )}

                      {(activeTab === 'collections' || activeTab === 'incentives') && (
                        <td className="px-3 py-3" style={{ maxWidth: 200 }}>
                          <InlineNotesCell
                            itemId={item.id}
                            note={item.collectionNotes || ''}
                            updatedBy={item.collectionUpdatedBy}
                            updatedAt={item.collectionUpdatedAt}
                            textPrimary={textPrimary}
                            textMuted={textMuted}
                            inputBg={inputBg}
                            onSave={async (id, text) => {
                              const res = await fetch(`${API_BASE_URL}/v1/reports/collections/${id}/notes`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ notes: text })
                              })
                              if (res.ok) {
                                const now = new Date().toISOString()
                                setItems(prev => prev.map(it =>
                                  it.id === id
                                    ? { ...it, collectionNotes: text, collectionUpdatedBy: user?.name || '', collectionUpdatedAt: now }
                                    : it
                                ))
                              }
                            }}
                          />
                        </td>
                      )}

                      <td className="px-3 py-3 text-right tabular-nums" style={{ fontWeight: 500, color: activeTab === 'collections' ? '#D97706' : activeTab === 'incentives' ? '#EF4444' : '#10B981', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        ₱{peso(item.amount)}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <span
                          className="inline-flex items-center gap-1 rounded-full"
                          style={{
                            fontSize: '10px', fontWeight: 700, padding: '3px 9px', letterSpacing: '0.03em',
                            color: resolved ? '#10B981' : '#F59E0B',
                            backgroundColor: resolved
                              ? (isLight ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.14)')
                              : (isLight ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.14)')
                          }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: 'currentColor' }} />
                          {resolved ? tc.resolvedLabel : 'Pending'}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-center no-print">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.reportId && activeTab !== 'rebates' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRow(item)
                                setNotesText(item.collectionNotes || '')
                                setRowExpenses(null)
                                fetchRowExpenses(item.reportId!)
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                              style={{ borderColor: border, color: textMuted, fontSize: '11px' }}
                            >
                              <Eye className="w-3 h-3" /> View
                            </button>
                          )}
                          {!resolved && canResolve ? (
                            <button
                              type="button"
                              onClick={() => setConfirmItem(item)}
                              className="px-2.5 py-1.5 rounded-lg text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                              style={{ border: 'none', fontSize: '11px', fontWeight: 600 }}
                            >
                              {tc.resolveLabel}
                            </button>
                          ) : (
                            <span style={{ color: textMuted, fontSize: '11px' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── DTR Details Modal ───────────────────────────────────────── */}
      {renderDtrModal()}

      {/* Mark as Paid / Scanner Modal */}
      <CollectionMarkPaidModal
        isOpen={Boolean(confirmItem)}
        onClose={() => setConfirmItem(null)}
        item={confirmItem}
        isDark={isDark}
        onSave={async (amount, datePaid, refNo, whoPaid, customerName) => {
          if (confirmItem) {
            await handleResolve(confirmItem, amount, datePaid, refNo, whoPaid, customerName)
          }
        }}
      />
    </div>
  )
}
