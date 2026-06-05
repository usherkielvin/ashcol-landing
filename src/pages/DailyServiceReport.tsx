import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  CalendarDays, Upload, Plus, Edit3, Trash2,
  X, Search, AlertTriangle, Building2,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string
  branchId: string | null
  branchName: string | null
  reportDate: string | null
  customerName: string | null
  customerAddress: string | null
  customerPhone: string | null
  district: string | null
  serviceType: string | null
  statusCode: string | null
  commitTerms: string | null
  dealer: string | null
  unitBrandModel: string | null
  unitSerial: string | null
  quantity: number | null
  technicianName: string | null
  negotiator: string | null
  scheduleTime: string | null
  scheduleStatus: string | null
  timeStarted: string | null
  timeEnded: string | null
  amountCharged: number | null
  paymentStatus: string | null
  jobStatus: string | null
  remarks: string | null
  note: string | null
  controlNumber: string | null
  serviceColumn: string | null
  papers: string | null
  costing: string | null
  relayStatus: string | null
  fifteenQuestions: string | null
  freeInstallation: boolean | null
}

interface BranchOption { id: string; name: string }

const SERVICE_TYPES = ['INSTALLATION', 'FREE_INSTALLATION', 'SERVICE', 'REPAIR', 'MAINTENANCE', 'CHECK_UP', 'RELOCATION'] as const

// Heuristic that mirrors the backend's isFreeInstallation logic so the modal
// can keep the freeInstallation flag in sync as the user edits the COMMIT box.
const detectFreeInstall = (commit: string | null | undefined) => {
  if (!commit) return false
  const u = commit.toUpperCase()
  if (!u.includes('FREE')) return false
  return u.includes('INSTAL') || u.includes('IDFT') || /\bFREE\s+\d+(ST|ND|RD|TH)\b/.test(u)
}
const PAYMENT_MODES = ['CASH', 'BANK TRANSFER', 'GCASH', 'CHEQUE', 'PAID', 'UNPAID', 'PARTIAL'] as const
const JOB_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] as const

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const blankRow = (date: string, branchId?: string | null): Partial<ServiceRow> => ({
  reportDate: date,
  branchId: branchId ?? null,
  customerName: '',
  customerAddress: '',
  customerPhone: '',
  district: '',
  serviceType: 'INSTALLATION',
  statusCode: 'I',
  commitTerms: '',
  dealer: '',
  unitBrandModel: '',
  unitSerial: '',
  quantity: 1,
  technicianName: '',
  negotiator: '',
  scheduleTime: '',
  scheduleStatus: '',
  timeStarted: '',
  timeEnded: '',
  amountCharged: 0,
  paymentStatus: 'CASH',
  jobStatus: 'SCHEDULED',
  remarks: '',
  note: '',
  controlNumber: '',
  serviceColumn: '',
  papers: '',
  costing: '',
  relayStatus: '',
  fifteenQuestions: '',
  freeInstallation: false,
})

const FormatPhone = ({ raw }: { raw: string | null | undefined }): React.ReactNode => {
  if (!raw) return null
  
  let digits = raw.replace(/\D/g, '')
  const numbers: string[] = []

  while (digits.length >= 10) {
    if (digits.startsWith('63') && digits.length >= 12) {
      numbers.push('0' + digits.slice(2, 12))
      digits = digits.slice(12)
    } else if (digits.startsWith('09') && digits.length >= 11) {
      numbers.push(digits.slice(0, 11))
      digits = digits.slice(11)
    } else if (digits.startsWith('9') && digits.length >= 10) {
      numbers.push('0' + digits.slice(0, 10))
      digits = digits.slice(10)
    } else {
      digits = digits.slice(1) // Shift 1 if invalid format to keep looking
    }
  }

  const finalNumbers = numbers.slice(0, 2).map(num => {
    return num.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')
  })

  if (finalNumbers.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {finalNumbers.map((num, i) => (
        <span key={i} className="whitespace-nowrap">{num}</span>
      ))}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DailyServiceReport() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'

  const primaryGreen      = '#16A34A' // Green-600

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isAllBranchUser = isAdmin || isManager
  const isBranchScoped = role === 'staff' || role === 'employee' || role === 'oic'
  const canImport = isAllBranchUser || isBranchScoped
  const canDelete = isAdmin || isManager
  const canEdit = isAdmin || isManager || role === 'staff' || role === 'employee' || role === 'oic'

  const [rows, setRows] = useState<ServiceRow[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [date, setDate] = useState(todayLocal)
  const [viewMode] = useState<'daily' | 'weekly'>('daily')
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Modal state for create / edit
  const [editing, setEditing] = useState<Partial<ServiceRow> | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: ServiceRow } | null>(null)

  // Pending Excel import waiting for an all-branch user to choose a target branch
  const [pendingImport, setPendingImport] = useState<{ file: File; branchId: string; detectedDate: string | null } | null>(null)

  // Column configuration for expand / collapse functionality
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})

  const toggleColumn = useCallback((colLabel: string) => {
    setExpandedCols(prev => ({
      ...prev,
      [colLabel]: !prev[colLabel]
    }))
  }, [])

  const columns = useMemo(() => {
    const rawCols = [
      { label: "CUSTOMER'S NAME", defaultW: 160, expW: 280, sticky: true, freeze: false, right: false },
      { label: 'DESTINATION', defaultW: 200, expW: 450, sticky: true, freeze: true, right: false },
      { label: 'DISTRICT', defaultW: 100, expW: 200, sticky: false, freeze: false, right: false },
      { label: 'CONTACT NO.', defaultW: 115, expW: 180, sticky: false, freeze: false, right: false },
      { label: 'BRAND / MODEL', defaultW: 130, expW: 250, sticky: false, freeze: false, right: false },
      { label: 'DLR', defaultW: 100, expW: 180, sticky: false, freeze: false, right: false },
      { label: 'COMMIT', defaultW: 130, expW: 250, sticky: false, freeze: false, right: false },
      { label: 'INSTALLER', defaultW: 130, expW: 250, sticky: false, freeze: false, right: false },
      { label: 'NOTE', defaultW: 140, expW: 280, sticky: false, freeze: false, right: false },
      { label: 'SERVICE', defaultW: 110, expW: 200, sticky: false, freeze: false, right: false },
      { label: 'UPDATE', defaultW: 150, expW: 350, sticky: false, freeze: false, right: false },
      { label: 'CHARGES', defaultW: 110, expW: 180, sticky: false, freeze: false, right: true },
      { label: 'PAYMENT', defaultW: 100, expW: 160, sticky: false, freeze: false, right: false },
    ]

    let accumulatedLeft = 0
    return rawCols.map(col => {
      const isExpanded = !!expandedCols[col.label]
      const currentWidth = isExpanded ? col.expW : col.defaultW
      const leftVal = col.sticky ? accumulatedLeft : 0
      
      if (col.sticky) {
        accumulatedLeft += currentWidth
      }

      return {
        ...col,
        isExpanded,
        w: currentWidth,
        left: leftVal
      }
    })
  }, [expandedCols])

  // ── Week helpers ──────────────────────────────────────────────────────────
  const weekRange = useMemo(() => {
    const d = new Date(date + 'T00:00:00')
    const dow = d.getDay()
    const offsetToMonday = dow === 0 ? -6 : 1 - dow
    const monday = new Date(d); monday.setDate(d.getDate() + offsetToMonday)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    const pretty = (x: Date) => x.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return { label: `${pretty(monday)} – ${pretty(sunday)}, ${sunday.getFullYear()}` }
  }, [date])

  // ── Data loaders ──────────────────────────────────────────────────────────
  const fetchBranches = useCallback(async () => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const list = ((data?.data || data || []) as { id: string; name: string }[])
      const hasExplicitTaguigSales = list.some(b => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SALES-EXPLICIT' || (name.includes('TAGUIG') && name.includes('SALES') && id !== 'BR-TAGUIG-SALES')
      })
      const hasExplicitTaguigServices = list.some(b => {
        const id = b.id.toUpperCase()
        const name = b.name.toUpperCase()
        return id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE' || name.includes('TAGUIG') && name.includes('SERVICE')
      })
      
      const newList: BranchOption[] = []
      for (const b of list) {
        const cleanName = b.name.replace(/^(ashcol\s+)/i, '')
        if (b.name.toUpperCase() === 'ASHCOL TAGUIG' || b.name.toUpperCase() === 'TAGUIG') {
          if (!hasExplicitTaguigSales) newList.push({ id: `${b.id}-sales`, name: 'TAGUIG SALES' })
          if (!hasExplicitTaguigServices) newList.push({ id: `${b.id}-services`, name: 'TAGUIG SERVICES' })
        } else {
          newList.push({ id: b.id, name: cleanName })
        }
      }
      newList.sort((a, b) => a.name.localeCompare(b.name))

      let finalList = newList
      if (isBranchScoped && user?.branchId) {
        finalList = newList.filter(b => b.id === user.branchId || b.id.startsWith(`${user.branchId}-`))
      }
      setBranches(finalList)
    } catch (e) { console.error(e) }
  }, [isBranchScoped, user?.branchId])

  useEffect(() => {
    if (isBranchScoped && user?.branchId && !branchFilter) {
      setBranchFilter(user.branchId)
      return
    }
    if (isAllBranchUser && !branchFilter && branches.length > 0) {
      setBranchFilter(branches[0].id)
    }
  }, [isAllBranchUser, isBranchScoped, user?.branchId, branchFilter, branches])

  useEffect(() => {
    if (!isAdmin) return
    const syncFromGlobal = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      if (gId) {
        setBranchFilter(gId)
      }
    }
    syncFromGlobal()
    window.addEventListener('ashcol-global-branch-change', syncFromGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncFromGlobal)
  }, [isAdmin])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ date, weekly: String(viewMode === 'weekly') })
      
      let apiBranchId = branchFilter
      if (branchFilter && /-(sales|services)$/i.test(branchFilter)) {
        apiBranchId = branchFilter.replace(/-sales$|-services$/i, '')
      }
      if (apiBranchId) params.set('branchId', apiBranchId)

      const res = await fetch(`${API_BASE_URL}/v1/service-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setRows(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [date, viewMode, branchFilter])

  useEffect(() => { fetchBranches() }, [fetchBranches])
  useEffect(() => { fetchRows() }, [fetchRows])

  // ── Detect branch from filename ───────────────────────────────────────────
  const guessBranchFromFilename = (filename: string): string => {
    const base = filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[_\-]/g, ' ')
    let bestId = branchFilter || (branches[0]?.id || '')
    let bestScore = -1
    for (const b of branches) {
      const nameLower = b.name.toLowerCase()
      const keywords = nameLower.split(/[\s\-–]+/).filter(w => w.length >= 3)
      const score = keywords.reduce((acc, kw) => acc + (base.includes(kw) ? 1 : 0), 0)
      if (score > bestScore) { bestScore = score; bestId = b.id }
    }
    return bestScore > 0 ? bestId : (branchFilter || (branches[0]?.id || ''))
  }

  // ── Detect date from filename ─────────────────────────────────────────────
  const guessDateFromFilename = (filename: string): string | null => {
    const base = filename.replace(/\.[^.]+$/, '')
    const toISO = (y: number, m: number, d: number): string | null => {
      if (m < 1 || m > 12 || d < 1 || d > 31) return null
      const full = y < 100 ? 2000 + y : y
      return `${full}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }

    // 1. YYYY-MM-DD  e.g. 2026-05-26  or  2026.05.26
    let m = base.match(/(\d{4})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})/)
    if (m) return toISO(+m[1], +m[2], +m[3])

    // 2. Compact YYYYMMDD  e.g. 20260526
    m = base.match(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])(?!\d)/)
    if (m) return toISO(+m[1], +m[2], +m[3])

    // 3. MM-DD-YYYY or MM.DD.YYYY  e.g. 05-26-2026
    m = base.match(/(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})/)
    if (m) {
      const [, a, b2, y] = m
      // Determine if first chunk is month (1-12) vs day
      if (+a <= 12) return toISO(+y, +a, +b2)
      if (+b2 <= 12) return toISO(+y, +b2, +a)
    }

    // 4. Month name  e.g. May26, May 26 2026, 26May2026
    const MONTHS: Record<string, number> = {
      jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
      jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
      january:1, february:2, march:3, april:4, june:6,
      july:7, august:8, september:9, october:10, november:11, december:12,
    }
    const monthPat = Object.keys(MONTHS).sort((a,b) => b.length - a.length).join('|')
    const re = new RegExp(`(?:(\\d{1,2})[\\s\\-\\.])?(${monthPat})[\\s\\-\\.](\\d{1,2})?[\\s\\-\\.,]*(\\d{2,4})?`, 'i')
    const mn = base.match(re)
    if (mn) {
      const moNum = MONTHS[mn[2].toLowerCase()]
      const day = +(mn[1] || mn[3] || '1')
      const yr = mn[4] ? +mn[4] : new Date().getFullYear()
      if (moNum) return toISO(yr, moNum, day)
    }

    return null
  }

  const handleImportFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    // Auto-detect date from filename and update the date picker
    const detectedDate = guessDateFromFilename(file.name)
    if (detectedDate && detectedDate !== date) {
      setDate(detectedDate)
    }

    if (isBranchScoped) {
      runImport(file, user?.branchId || '')
    } else {
      const detectedId = guessBranchFromFilename(file.name)
      if (detectedId && detectedId !== branchFilter) setBranchFilter(detectedId)
      setPendingImport({
        file,
        branchId: detectedId || branchFilter || (branches[0]?.id || ''),
        detectedDate: detectedDate || null,
      })
      console.info(`[Import] "${file.name}" → branch: ${branches.find(b => b.id === detectedId)?.name || '?'}, date: ${detectedDate || 'not detected'}`)
    }
  }


  const runImport = async (file: File, branchId: string) => {
    if (!isBranchScoped && !branchId) {
      alert('Please pick a target branch')
      return
    }
    const targetDate = date
    const branchName = branches.find(b => b.id === branchId)?.name
      || (isBranchScoped ? 'your branch' : 'the chosen branch')
    const pretty = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const ok = window.confirm(
      `Import "${file.name}" into ${branchName} for ${pretty}?\n\n` +
      `Existing ${branchName} service rows for ${pretty} will be REPLACED.`
    )
    if (!ok) { setPendingImport(null); return }

    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ date: targetDate })
      if (!isBranchScoped && branchId) {
        params.set('branchId', branchId.replace(/-sales$|-services$/, ''))
      }
      const url = `${API_BASE_URL}/v1/service-reports/import?${params.toString()}`
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (res.ok) {
        const result = await res.json()
        const importedDate = (result?.date as string) || targetDate
        const sheetMsg = result?.sheet ? ` (sheet "${result.sheet}")` : ''
        alert(`${result.message || 'Import successful!'}${sheetMsg}`)
        if (importedDate !== date) setDate(importedDate); else fetchRows()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Import failed (HTTP ${res.status})`)
      }
    } catch (err) {
      console.error(err); alert('Network error during import')
    } finally {
      setImporting(false); setPendingImport(null)
    }
  }

  // ── Save (create / update) ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editing) return
    if (!editing.customerName || !editing.customerName.trim()) {
      alert('Customer name is required'); return
    }
    if (!editing.branchId && !isBranchScoped) {
      alert('Please choose a branch'); return
    }
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const isNew = !editing.id
      const url = isNew
        ? `${API_BASE_URL}/v1/service-reports`
        : `${API_BASE_URL}/v1/service-reports/${editing.id}`
      const payload = {
        ...editing,
        branchId: editing.branchId ? editing.branchId.replace(/-sales$|-services$/, '') : null
      }
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Save failed (HTTP ${res.status})`)
        return
      }
      setEditing(null)
      fetchRows()
    } catch (e) {
      console.error(e); alert('Network error while saving')
    }
  }

  const handleDelete = async (row: ServiceRow) => {
    if (!window.confirm(`Delete service record for ${row.customerName}?`)) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/service-reports/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Delete failed (HTTP ${res.status})`)
        return
      }
      fetchRows()
    } catch (e) {
      console.error(e); alert('Network error while deleting')
    }
  }

  const handleClearAll = async () => {
    if (!isAdmin) {
      alert('Access denied: Only administrator accounts can clear all records.')
      return
    }
    // Strip the -sales/-services virtual suffix to get the real branch UUID
    const realBranchId = branchFilter ? branchFilter.replace(/-sales$|-services$/, '') : ''
    if (!realBranchId) { alert('No branch selected'); return }
    const branchLabel = branches.find(b => b.id === branchFilter)?.name || realBranchId
    const prettyDate = new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const confirmed = window.confirm(
      `⚠️ DANGER ZONE\n\nPermanently delete all ${visible.length} service record${visible.length !== 1 ? 's' : ''} for ${branchLabel} on ${prettyDate}?\n\nThis CANNOT be undone.`
    )
    if (!confirmed) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const params = new URLSearchParams({ branchId: realBranchId, date })
      const res = await fetch(`${API_BASE_URL}/v1/service-reports?${params}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Clear failed (HTTP ${res.status})`)
        return
      }
      const result = await res.json()
      alert(`Deleted ${result.deleted} service record${result.deleted !== 1 ? 's' : ''} for ${branchLabel}.`)
      fetchRows()
    } catch (e) {
      console.error(e); alert('Network error while clearing records')
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const rowSearchBlob = (r: ServiceRow) => {
    const amt = r.amountCharged != null ? String(r.amountCharged) : ''
    const amtPeso = r.amountCharged != null ? peso(r.amountCharged) : ''
    return [
      r.customerName, r.customerAddress, r.customerPhone, r.district,
      r.branchName, r.serviceType, r.statusCode, r.commitTerms, r.dealer,
      r.unitBrandModel, r.unitSerial, r.technicianName, r.negotiator,
      r.scheduleTime, r.scheduleStatus, r.timeStarted, r.timeEnded,
      r.paymentStatus, r.jobStatus, r.remarks, r.note, r.controlNumber,
      r.serviceColumn, r.papers, r.costing, r.relayStatus, r.fifteenQuestions,
      r.freeInstallation ? 'free installation' : '',
      r.reportDate, amt, amtPeso,
    ].filter(Boolean).join(' ').toLowerCase()
  }

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let filtered = rows
    
    if (branchFilter && branchFilter.endsWith('-sales')) {
      filtered = rows.filter(r => {
        const type = (r.serviceType || '').toUpperCase()
        const code = (r.statusCode || '').toUpperCase()
        return type.includes('INSTALL') || code === 'I'
      })
    } else if (branchFilter && branchFilter.endsWith('-services')) {
      filtered = rows.filter(r => {
        const type = (r.serviceType || '').toUpperCase()
        const code = (r.statusCode || '').toUpperCase()
        return !type.includes('INSTALL') && code !== 'I'
      })
    }

    if (!q) return filtered
    return filtered.filter(r => rowSearchBlob(r).includes(q))
  }, [rows, searchQuery, branchFilter])

  const totals = useMemo(() => visible.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      qty: acc.qty + (r.quantity || 0),
      amount: acc.amount + (r.amountCharged || 0),
      completed: acc.completed + (r.jobStatus === 'COMPLETED' ? 1 : 0),
      cancelled: acc.cancelled + (r.jobStatus === 'CANCELLED' ? 1 : 0),
      freeInstalls: acc.freeInstalls + (r.freeInstallation ? 1 : 0),
    }),
    { count: 0, qty: 0, amount: 0, completed: 0, cancelled: 0, freeInstalls: 0 }
  ), [visible])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pb-8" onClick={() => setContextMenu(null)}>

      {/* Thinner, simple design header controls */}
      <div
        className="rounded-2xl p-3 px-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        {/* Left Side: Date picker & Branch filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Filter */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold shadow-sm cursor-not-allowed bg-slate-100 dark:bg-slate-900/50"
                 style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', borderColor: inputBorder }}>
              <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
              <select
                value={branchFilter}
                onChange={e => {
                  const val = e.target.value
                  setBranchFilter(val)
                }}
                disabled={true}
                className="bg-transparent outline-none text-xs font-bold cursor-not-allowed pr-1"
                style={{
                  color: textMuted,
                  backgroundColor: 'transparent',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  appearance: 'none',
                }}
              >
                {branches.map(b => (
                  <option
                    key={b.id}
                    value={b.id}
                    style={{
                      backgroundColor: inputBg,
                      color: textPrimary,
                      WebkitTextFillColor: textPrimary,
                    }}
                  >
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Picker inline */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-sm"
               style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
            <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: primaryGreen }} />
            <div className="flex items-center gap-1.5">
              {viewMode !== 'weekly' && (
                <span className="uppercase tracking-wider text-[9px] font-black opacity-60 border-r pr-1.5" style={{ borderColor: border }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short' })}
                </span>
              )}
              {viewMode === 'weekly' ? (
                <span className="tracking-tight">{weekRange.label}</span>
              ) : (
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                       className="bg-transparent outline-none cursor-pointer font-bold" style={{ color: textPrimary }} />
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Search bar & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search bar */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border flex-1 min-w-[150px] max-w-xs md:max-w-sm shadow-sm"
               style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: primaryGreen }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-xs flex-1 font-medium"
              style={{ color: textPrimary }}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} title="Clear"
                      className="shrink-0 p-0.5 rounded hover:bg-slate-200/20" style={{ color: textMuted }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action buttons wrapper */}
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button type="button"
                      onClick={() => setEditing(blankRow(date, isBranchScoped ? user?.branchId ?? null : (branchFilter ? branchFilter.replace(/-sales$|-services$/, '') : '')))}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs text-white hover:opacity-90 shadow-sm transition-all"
                      style={{ backgroundColor: primaryGreen }}>
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            )}

            {canImport && (
              <>
                <input type="file" accept=".xlsx,.xls" id="svc-import-input" className="hidden" onChange={handleImportFilePicked} />
                <button id="svc-import-btn" type="button" disabled={importing || viewMode === 'weekly'}
                        onClick={() => document.getElementById('svc-import-input')?.click()}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold text-xs border transition-all hover:opacity-80 disabled:opacity-60 shrink-0"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>
                  <Upload className={`w-3.5 h-3.5 ${importing ? 'animate-bounce' : ''}`} style={{ color: primaryGreen }} />
                  {importing ? 'Importing…' : 'Import'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Simplified compact stats bar */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold px-5 py-3 rounded-2xl border shadow-sm"
             style={{ backgroundColor: cardBg, borderColor: border }}>
          <span style={{ color: textMuted }}>REPORT SUMMARY:</span>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Records:</span>
            <span style={{ color: textPrimary }}>{totals.count}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Units:</span>
            <span style={{ color: '#0284C7' }}>{totals.qty}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Charged:</span>
            <span style={{ color: '#D97706' }}>₱{peso(totals.amount)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Free Installs:</span>
            <span style={{ color: '#0D9488' }}>{totals.freeInstalls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Completed:</span>
            <span style={{ color: '#16A34A' }}>{totals.completed}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: textMuted }}>Cancelled:</span>
            <span style={{ color: '#DC2626' }}>{totals.cancelled}</span>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>
              {searchQuery.trim()
                ? `No records match “${searchQuery.trim()}”${rows.length > 0 ? ` (${rows.length} loaded)` : ''}`
                : `No service records for ${viewMode === 'weekly' ? weekRange.label : 'this date'}`}
            </p>
            {searchQuery.trim() ? (
              <button type="button" onClick={() => setSearchQuery('')}
                      className="text-xs font-bold hover:underline" style={{ color: primaryGreen }}>Clear search</button>
            ) : canEdit && (
              <button onClick={() => setEditing(blankRow(date, isBranchScoped ? user?.branchId ?? null : (branchFilter ? branchFilter.replace(/-sales$|-services$/, '') : '')))}
                      className="text-xs font-bold hover:underline" style={{ color: primaryGreen }}>+ Add the first one</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            <table className="text-xs" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                  {columns.map(col => (
                    <th key={col.label}
                      onClick={() => toggleColumn(col.label)}
                      title={`Click to ${col.isExpanded ? 'collapse' : 'expand'} column`}
                      style={{
                        padding: '9px 10px',
                        textAlign: col.right ? 'right' : 'left',
                        color: col.isExpanded ? (isLight ? '#16A34A' : '#4ADE80') : textMuted,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        borderRight: `1px solid ${border}`,
                        borderBottom: `2px solid ${border}`,
                        fontSize: '10px',
                        letterSpacing: '0.07em',
                        width: col.w,
                        minWidth: col.w,
                        maxWidth: col.w,
                        backgroundColor: inputBg,
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'all 0.15s ease-in-out',
                        ...(col.sticky ? {
                          position: 'sticky' as const,
                          left: col.left,
                          zIndex: 15,
                        } : {}),
                        ...(col.freeze ? {
                          borderRight: `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                          boxShadow: isLight
                            ? '6px 0 12px -3px rgba(0, 0, 0, 0.12), 2px 0 4px -2px rgba(0, 0, 0, 0.05)'
                            : '8px 0 18px -4px rgba(0, 0, 0, 0.45), 3px 0 6px -3px rgba(0, 0, 0, 0.25)',
                        } : {}),
                    }}>
                      <div className={`flex items-center gap-1.5 ${col.right ? 'flex-row-reverse justify-start' : 'justify-between'}`}>
                        <span>{col.label}</span>
                        <span className="text-[9px] opacity-60 transition-transform duration-200" style={{ transform: col.isExpanded ? 'rotate(180deg)' : 'none' }}>
                          {col.isExpanded ? '◀' : '▶'}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, idx) => {
                  const rowBaseBg = contextMenu?.row.id === r.id
                    ? (isLight ? '#f0fdf4' : '#14532d')
                    : (idx % 2 === 0 ? (isLight ? '#ffffff' : '#0A1120') : (isLight ? '#fafafa' : '#0d1626'))
                  const rowHoverBg = isLight ? '#f1f5f9' : '#0f1e36'

                  return (
                    <tr key={r.id}
                        onContextMenu={e => {
                          e.preventDefault()
                          if (canEdit || canDelete) setContextMenu({ x: e.clientX, y: e.clientY, row: r })
                        }}
                        style={{
                          borderBottom: `1px solid ${border}`,
                          backgroundColor: rowBaseBg,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowHoverBg }) }}
                        onMouseLeave={e => { e.currentTarget.querySelectorAll('td').forEach((td: HTMLTableCellElement) => { td.style.backgroundColor = rowBaseBg }) }}
                        className="transition-colors">
                      
                      {/* 1. Customer's Name — sticky 1 */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        position: 'sticky', left: columns[0].left, zIndex: 5,
                        backgroundColor: rowBaseBg,
                        width: columns[0].w, minWidth: columns[0].w, maxWidth: columns[0].w,
                        fontSize: '11px', fontWeight: 600,
                        transition: 'all 0.15s ease-in-out'
                      }}>
                        <span style={{ color: textMuted, fontSize: '10px', marginRight: 5 }}>{idx + 1}</span>
                        {columns[0].isExpanded ? (
                          <span className="break-words font-semibold leading-relaxed">{r.customerName || ''}</span>
                        ) : (
                          <span className="truncate inline-block align-middle" style={{ maxWidth: 'calc(100% - 25px)' }} title={r.customerName || ''}>{r.customerName || ''}</span>
                        )}
                      </td>

                      {/* 2. Destination — sticky 2 */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary,
                        position: 'sticky', left: columns[1].left, zIndex: 5,
                        backgroundColor: rowBaseBg,
                        borderRight: `2.5px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                        boxShadow: isLight
                          ? '6px 0 12px -3px rgba(0, 0, 0, 0.12), 2px 0 4px -2px rgba(0, 0, 0, 0.05)'
                          : '8px 0 18px -4px rgba(0, 0, 0, 0.45), 3px 0 6px -3px rgba(0, 0, 0, 0.25)',
                        width: columns[1].w, minWidth: columns[1].w, maxWidth: columns[1].w,
                        fontSize: '11px',
                        transition: 'all 0.15s ease-in-out'
                      }}>
                        <span className={columns[1].isExpanded ? "leading-relaxed break-words block" : "line-clamp-2 leading-relaxed block"} title={r.customerAddress || ''}>
                          {r.customerAddress || ''}
                        </span>
                      </td>

                      {/* 3. District */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        width: columns[2].w, minWidth: columns[2].w, maxWidth: columns[2].w,
                        fontSize: '11px',
                        transition: 'all 0.15s ease-in-out',
                        wordBreak: columns[2].isExpanded ? 'break-word' : undefined,
                        whiteSpace: columns[2].isExpanded ? 'normal' : 'nowrap',
                        overflow: columns[2].isExpanded ? undefined : 'hidden',
                        textOverflow: columns[2].isExpanded ? undefined : 'ellipsis'
                      }}>
                        {r.district || ''}
                      </td>

                      {/* 4. Contact */}
                      <td style={{
                        padding: '8px 10px', color: '#10B981', borderRight: `1px solid ${border}`,
                        width: columns[3].w, minWidth: columns[3].w, maxWidth: columns[3].w,
                        whiteSpace: 'nowrap', lineHeight: '1.6', fontSize: '11px',
                        transition: 'all 0.15s ease-in-out'
                      }}>
                        <FormatPhone raw={r.customerPhone} />
                      </td>

                      {/* 5. Brand */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        width: columns[4].w, minWidth: columns[4].w, maxWidth: columns[4].w,
                        wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.4', fontSize: '11px', fontWeight: 600,
                        transition: 'all 0.15s ease-in-out'
                      }}>
                        {columns[4].isExpanded ? (
                          r.unitBrandModel || ''
                        ) : (
                          <span className="truncate block" title={r.unitBrandModel || ''}>{r.unitBrandModel || ''}</span>
                        )}
                      </td>

                      {/* 6. Dlr */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        width: columns[5].w, minWidth: columns[5].w, maxWidth: columns[5].w,
                        wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.4', fontSize: '11px',
                        transition: 'all 0.15s ease-in-out'
                      }}>
                        {columns[5].isExpanded ? (
                          r.dealer || ''
                        ) : (
                          <span className="truncate block" title={r.dealer || ''}>{r.dealer || ''}</span>
                        )}
                      </td>

                      {/* 7. Commit */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        width: columns[6].w, minWidth: columns[6].w, maxWidth: columns[6].w,
                        fontSize: '11px',
                        transition: 'all 0.15s ease-in-out',
                        wordBreak: columns[6].isExpanded ? 'break-word' : undefined,
                        whiteSpace: columns[6].isExpanded ? 'normal' : 'nowrap',
                        overflow: columns[6].isExpanded ? undefined : 'hidden',
                        textOverflow: columns[6].isExpanded ? undefined : 'ellipsis'
                      }}>
                        {r.commitTerms || ''}{r.freeInstallation ? ' (FREE)' : ''}
                      </td>

                      {/* 8. Installer */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        width: columns[7].w, minWidth: columns[7].w, maxWidth: columns[7].w,
                        whiteSpace: columns[7].isExpanded ? 'normal' : 'nowrap', fontSize: '11px',
                        transition: 'all 0.15s ease-in-out',
                        wordBreak: columns[7].isExpanded ? 'break-word' : undefined,
                        overflow: columns[7].isExpanded ? undefined : 'hidden',
                        textOverflow: columns[7].isExpanded ? undefined : 'ellipsis'
                      }}>
                        {r.technicianName || ''}
                      </td>

                      {/* 9. Note */}
                      <td style={{
                        padding: '8px 10px', color: textMuted, borderRight: `1px solid ${border}`,
                        width: columns[8].w, minWidth: columns[8].w, maxWidth: columns[8].w,
                        fontSize: '11px',
                        transition: 'all 0.15s ease-in-out',
                        wordBreak: columns[8].isExpanded ? 'break-word' : undefined,
                        whiteSpace: columns[8].isExpanded ? 'normal' : 'nowrap',
                        overflow: columns[8].isExpanded ? undefined : 'hidden',
                        textOverflow: columns[8].isExpanded ? undefined : 'ellipsis'
                      }}>
                        {r.note || ''}
                      </td>

                      {/* 10. Service */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        width: columns[9].w, minWidth: columns[9].w, maxWidth: columns[9].w,
                        whiteSpace: 'nowrap', fontSize: '11px',
                        transition: 'all 0.15s ease-in-out'
                      }}>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase truncate block text-center ${
                          (r.serviceColumn || r.serviceType || '').includes('INSTALL') ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                        }`}>
                          {r.serviceColumn || r.serviceType || ''}
                        </span>
                      </td>

                      {/* 11. Update */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        width: columns[10].w, minWidth: columns[10].w, maxWidth: columns[10].w,
                        fontSize: '11px',
                        transition: 'all 0.15s ease-in-out',
                        wordBreak: columns[10].isExpanded ? 'break-word' : undefined,
                        whiteSpace: columns[10].isExpanded ? 'normal' : 'nowrap',
                        overflow: columns[10].isExpanded ? undefined : 'hidden',
                        textOverflow: columns[10].isExpanded ? undefined : 'ellipsis'
                      }}>
                        {r.remarks || ''}
                      </td>

                      {/* 12. Charges */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary, borderRight: `1px solid ${border}`,
                        width: columns[11].w, minWidth: columns[11].w, maxWidth: columns[11].w,
                        whiteSpace: 'nowrap', textAlign: 'right', fontSize: '11px', fontWeight: 600,
                        transition: 'all 0.15s ease-in-out'
                      }}>
                        {r.amountCharged ? r.amountCharged.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : ''}
                      </td>

                      {/* 13. Payment */}
                      <td style={{
                        padding: '8px 10px', color: textPrimary,
                        width: columns[12].w, minWidth: columns[12].w, maxWidth: columns[12].w,
                        fontSize: '11px',
                        transition: 'all 0.15s ease-in-out'
                      }}>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase truncate block text-center ${
                          r.paymentStatus === 'PAID' || r.paymentStatus === 'GCASH' || r.paymentStatus === 'BANK TRANSFER' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                          {r.paymentStatus || ''}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Danger Zone footer ── */}
        {isAdmin && visible.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3"
               style={{ borderTop: '1px solid rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.04)' }}>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#EF4444' }}>Danger Zone</span>
              <span className="text-xs" style={{ color: textMuted }}>
                Permanently deletes all{' '}
                <strong style={{ color: textPrimary }}>{visible.length}</strong>{' '}
                record{visible.length !== 1 ? 's' : ''} for{' '}
                <strong style={{ color: textPrimary }}>
                  {branches.find(b => b.id === branchFilter)?.name || 'this branch'}
                </strong>{' '}on{' '}
                <strong style={{ color: textPrimary }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </strong>. This cannot be undone.
              </span>
            </div>
            <button type="button" onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 ml-4"
              style={{ backgroundColor: 'transparent', border: '1.5px solid #EF4444', color: '#EF4444' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}>
              <Trash2 className="w-3.5 h-3.5" /> Clear All Records
            </button>
          </div>
        )}
      </div>

      {/* ── Right-click context menu ─────────────────────────────────── */}
      {contextMenu && (
        <div className="fixed z-[200]" style={{ top: contextMenu.y, left: contextMenu.x }}
             onClick={e => e.stopPropagation()}>
          <div className="rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            {canEdit && (
              <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-green-500/10"
                      style={{ color: textPrimary }}
                      onClick={() => { setEditing(contextMenu.row); setContextMenu(null) }}>
                <Edit3 className="w-3.5 h-3.5 text-green-500" /> Edit row
              </button>
            )}
            {canDelete && (
              <button className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-red-500/10"
                      style={{ color: '#EF4444' }}
                      onClick={() => { handleDelete(contextMenu.row); setContextMenu(null) }}>
                <Trash2 className="w-3.5 h-3.5" /> Delete row
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Branch Picker (all-branch Excel import) ─────────────────────── */}
      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
             onClick={() => setPendingImport(null)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
               style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
               onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="font-black text-sm" style={{ color: textPrimary }}>Import to Branch</h3>
              <button onClick={() => setPendingImport(null)} className="p-1.5 rounded-lg" style={{ color: textMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {/* File info row */}
              <div className="flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                <Upload className="w-4 h-4 mt-0.5 shrink-0" style={{ color: primaryGreen }} />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-xs font-bold truncate" style={{ color: textPrimary }}>{pendingImport.file.name}</span>
                  {/* Auto-detected badges */}
                  <div className="flex flex-col gap-0.5">
                    {branches.find(b => b.id === pendingImport.branchId) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold"
                            style={{ color: primaryGreen }}>
                        ✦ Branch: <span style={{ color: textPrimary }}>{branches.find(b => b.id === pendingImport.branchId)?.name}</span>
                      </span>
                    )}
                    {pendingImport.detectedDate && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold"
                            style={{ color: '#059669' }}>
                        ✦ Date: <span style={{ color: textPrimary }}>
                          {new Date(pendingImport.detectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs" style={{ color: textMuted }}>
                Existing rows for the selected branch on{' '}
                <span className="font-bold" style={{ color: textPrimary }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>{' '}will be replaced. You can change the branch below if needed.
              </p>
              <Field label="Target Branch" required>
                <select value={pendingImport.branchId}
                        onChange={e => setPendingImport({ ...pendingImport, branchId: e.target.value })}
                        disabled={true}
                        className="w-full rounded-lg px-3 py-2 text-xs font-semibold cursor-not-allowed bg-slate-100 dark:bg-slate-900/50"
                        style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', border: `1px solid ${inputBorder}`, color: textMuted }}>
                  <option value="">— Choose branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${border}` }}>
              <button onClick={() => setPendingImport(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold border"
                      style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}>
                Cancel
              </button>
              <button onClick={() => runImport(pendingImport.file, pendingImport.branchId)}
                      disabled={!pendingImport.branchId || importing}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                      style={{ backgroundColor: primaryGreen, opacity: !pendingImport.branchId || importing ? 0.5 : 1 }}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Edit / Create Modal ─────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-[9999] flex flex-col" style={{ backgroundColor: isLight ? '#f8fafc' : '#0a1628' }}>

          {/* Sticky Header Bar */}
          <div className="px-6 py-4 flex flex-wrap gap-4 items-center justify-between shrink-0 shadow-sm"
               style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditing(null)} className="p-2 rounded-lg transition-colors"
                      style={{ color: textMuted }} title="Close">
                <X className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-black text-base tracking-tight" style={{ color: textPrimary }}>
                  {editing.id ? 'Edit Service Record' : 'New Service Record'}
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>
                  {editing.id || 'Draft'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditing(null)}
                      className="px-5 py-2 text-xs font-bold rounded-xl"
                      style={{ border: `1px solid ${inputBorder}`, color: textMuted, backgroundColor: 'transparent' }}>
                Cancel
              </button>
              <button onClick={handleSave}
                      className="px-6 py-2 text-xs font-bold text-white rounded-xl shadow-md"
                      style={{ backgroundColor: primaryGreen }}>
                {editing.id ? 'Save Changes' : 'Create Record'}
              </button>
            </div>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-5 md:p-10">
            <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-16">

              {/* Section 1 — Customer & Location */}
              <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: primaryGreen }}>① Customer &amp; Location</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Branch" required={!isBranchScoped}>
                    {isBranchScoped ? (
                      <input value={branches.find(b => b.id === user?.branchId)?.name || 'Your Branch'} disabled
                             className="w-full rounded-lg px-3 py-2 text-xs font-semibold opacity-70"
                             style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    ) : (
                      <select value={editing.branchId || ''}
                              onChange={e => setEditing({ ...editing, branchId: e.target.value })}
                              disabled={true}
                              className="w-full rounded-lg px-3 py-2 text-xs font-semibold cursor-not-allowed bg-slate-100 dark:bg-slate-900/50"
                              style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', border: `1px solid ${inputBorder}`, color: textMuted }}>
                        <option value="">— Choose branch —</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    )}
                  </Field>
                  <Field label="Date" required>
                    <input type="date" value={editing.reportDate || ''}
                           onChange={e => setEditing({ ...editing, reportDate: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Customer Name" required>
                    <input value={editing.customerName || ''}
                           onChange={e => setEditing({ ...editing, customerName: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Contact Number">
                    <input value={editing.customerPhone || ''}
                           onChange={e => setEditing({ ...editing, customerPhone: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="District / City">
                    <input value={editing.district || ''}
                           onChange={e => setEditing({ ...editing, district: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Full Address">
                    <input value={editing.customerAddress || ''}
                           onChange={e => setEditing({ ...editing, customerAddress: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              {/* Section 2 — Equipment & Service */}
              <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: '#8B5CF6' }}>② Equipment &amp; Service</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Brand / Unit Model">
                    <input value={editing.unitBrandModel || ''}
                           onChange={e => setEditing({ ...editing, unitBrandModel: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Dealer (DLR)">
                    <input value={editing.dealer || ''}
                           onChange={e => setEditing({ ...editing, dealer: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Service Type">
                    <select value={editing.serviceType || ''}
                            onChange={e => {
                              const v = e.target.value
                              setEditing({ ...editing, serviceType: v, statusCode: v === 'INSTALLATION' ? 'I' : v === 'SERVICE' ? 'S' : editing.statusCode })
                            }}
                            className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Quantity">
                    <input type="number" min={1} value={editing.quantity ?? 1}
                           onChange={e => setEditing({ ...editing, quantity: parseInt(e.target.value || '1', 10) })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Status Code (S/I)">
                    <input value={editing.statusCode || ''}
                           onChange={e => setEditing({ ...editing, statusCode: e.target.value })}
                           maxLength={4}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold uppercase"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <div className="lg:col-span-3">
                    <Field label='Commit Terms — e.g. "FREE 1ST IDFT"' full>
                      <textarea rows={2} value={editing.commitTerms || ''}
                                onChange={e => {
                                  const v = e.target.value
                                  const free = detectFreeInstall(v)
                                  setEditing({ ...editing, commitTerms: v, freeInstallation: free,
                                    serviceType: free && (editing.serviceType === 'INSTALLATION' || !editing.serviceType) ? 'FREE_INSTALLATION'
                                      : (!free && editing.serviceType === 'FREE_INSTALLATION' ? 'INSTALLATION' : editing.serviceType) })
                                }}
                                className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                      <label className="flex items-center gap-2 mt-1.5 text-[11px] font-bold cursor-pointer"
                             style={{ color: editing.freeInstallation ? '#06B6D4' : textMuted }}>
                        <input type="checkbox" checked={!!editing.freeInstallation}
                               onChange={e => setEditing({ ...editing, freeInstallation: e.target.checked,
                                 serviceType: e.target.checked ? 'FREE_INSTALLATION'
                                   : (editing.serviceType === 'FREE_INSTALLATION' ? 'INSTALLATION' : editing.serviceType) })} />
                        Free Installation Verified
                      </label>
                    </Field>
                  </div>
                </div>
              </div>

              {/* Section 3 — Personnel & Schedule */}
              <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: '#F59E0B' }}>③ Personnel &amp; Schedule</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Installer / Technician">
                    <input value={editing.technicianName || ''}
                           onChange={e => setEditing({ ...editing, technicianName: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Negotiator">
                    <input value={editing.negotiator || ''}
                           onChange={e => setEditing({ ...editing, negotiator: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Schedule Time (e.g. 9:00 AM)">
                    <input value={editing.scheduleTime || ''}
                           onChange={e => setEditing({ ...editing, scheduleTime: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Time Started">
                    <input value={editing.timeStarted || ''}
                           onChange={e => setEditing({ ...editing, timeStarted: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Time Ended">
                    <input value={editing.timeEnded || ''}
                           onChange={e => setEditing({ ...editing, timeEnded: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Schedule Status">
                    <input value={editing.scheduleStatus || ''}
                           onChange={e => setEditing({ ...editing, scheduleStatus: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                </div>
              </div>

              {/* Section 4 — Finance & Closing */}
              <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: '#10B981' }}>④ Finance &amp; Closing</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Installation Charges (PHP)">
                    <input type="number" min={0} step="0.01" value={editing.amountCharged ?? 0}
                           onChange={e => setEditing({ ...editing, amountCharged: parseFloat(e.target.value || '0') })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Mode of Payment">
                    <select value={editing.paymentStatus || 'CASH'}
                            onChange={e => setEditing({ ...editing, paymentStatus: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      {PAYMENT_MODES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Job Status">
                    <select value={editing.jobStatus || 'SCHEDULED'}
                            onChange={e => setEditing({ ...editing, jobStatus: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}>
                      {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Control # / SI">
                    <input value={editing.controlNumber || ''}
                           onChange={e => setEditing({ ...editing, controlNumber: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Relay Status">
                    <input value={editing.relayStatus || ''}
                           onChange={e => setEditing({ ...editing, relayStatus: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Costing (e.g. FOR ACTUAL)">
                    <input value={editing.costing || ''}
                           onChange={e => setEditing({ ...editing, costing: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="Papers (e.g. SEND, PENDING)">
                    <input value={editing.papers || ''}
                           onChange={e => setEditing({ ...editing, papers: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <Field label="15 Questions (DONE / notes)">
                    <input value={editing.fifteenQuestions || ''}
                           onChange={e => setEditing({ ...editing, fifteenQuestions: e.target.value })}
                           className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                           style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                  </Field>
                  <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Update / Remarks" full>
                      <textarea rows={2} value={editing.remarks || ''}
                                onChange={e => setEditing({ ...editing, remarks: e.target.value })}
                                className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    </Field>
                    <Field label="Internal Note" full>
                      <textarea rows={2} value={editing.note || ''}
                                onChange={e => setEditing({ ...editing, note: e.target.value })}
                                className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
                    </Field>
                  </div>
                </div>
              </div>

            </div>

          {/* Bottom Action Bar */}
          <div className="shrink-0 px-6 py-4 flex items-center justify-end gap-3"
               style={{ backgroundColor: cardBg, borderTop: `2px solid ${border}` }}>
            <button onClick={() => setEditing(null)}
                    className="px-5 py-2.5 text-xs font-bold rounded-xl"
                    style={{ border: `1px solid ${inputBorder}`, color: textMuted, backgroundColor: 'transparent' }}>
              Cancel
            </button>
            <button onClick={handleSave}
                    className="px-7 py-2.5 text-xs font-bold text-white rounded-xl"
                    style={{ backgroundColor: primaryGreen }}>
              {editing.id ? 'Save Changes' : 'Create Record'}
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tiny helper ──────────────────────────────────────────────────────────────
function Field({ label, required, full, children }: {
  label: string
  required?: boolean
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
        {label}{required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  )
}
