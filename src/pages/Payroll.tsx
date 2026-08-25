import { useState, useEffect, useCallback, useRef, useMemo, type FocusEvent } from 'react'
import { Wallet, Search, Building2, Calendar, CheckCircle2, RefreshCw, Save, Plus, ChevronDown, ChevronUp, SlidersHorizontal, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatBranchName, isPortalAdmin } from '../utils/api'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'
import {
  fetchAndMapPayroll,
  deduplicateAndMergePayroll,
  DEFAULT_PAYROLL_RATES,
  type PayrollRow,
} from '../utils/payrollDerive'

const peso = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) || 0 : (v ?? 0)
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const num = (s: string) => parseFloat(s) || 0
const uid = () => Math.random().toString(36).slice(2)

// Mirrors the sheet's "PAYROLL DUE" — sum of every fee-type column, whether or not that
// column is currently shown (a hidden column can still hold an amount).
const rowTotal = (r: PayrollRow) =>
  num(r.installationFee) + num(r.earthGrounding) + num(r.dailyAllowance)
  + num(r.excessCopperTube) + num(r.hauling) + num(r.dismantling) + num(r.electricalWorks)
  + num(r.chippingWorks) + num(r.breaker) + num(r.powerSupplyLaborOnly) + num(r.powerSupplyLaborMaterials)
  + num(r.specialBracketCatwalk) + num(r.specialBracketWelding) + num(r.excessCopperTubeLaborOnly)
  + num(r.relocationAccuFcu) + num(r.systemReprocessLabor) + num(r.drainPumpInstallation)
  + num(r.scaffoldingInstallation) + num(r.flushingOldPipe) + num(r.sterneBracket)
  + num(r.breakerInstallationLabor) + num(r.chargingOfFreon) + num(r.materialsReturn)

const installerTotal = (installerRows: PayrollRow[]) =>
  installerRows.reduce((sum, r) => sum + rowTotal(r), 0)

type ColumnKey =
  | 'date' | 'ticketNumber' | 'customerName' | 'brandCapacity' | 'remit'
  | 'installationUpload' | 'installationFee' | 'totalPipeLength' | 'earthGrounding' | 'dailyAllowance'
  | 'excessCopperTube' | 'hauling' | 'dismantling' | 'electricalWorks' | 'chippingWorks' | 'breaker'
  | 'powerSupplyLaborOnly' | 'powerSupplyLaborMaterials' | 'specialBracketCatwalk' | 'specialBracketWelding'
  | 'excessCopperTubeLaborOnly' | 'relocationAccuFcu' | 'systemReprocessLabor' | 'drainPumpInstallation'
  | 'scaffoldingInstallation' | 'flushingOldPipe' | 'sterneBracket' | 'breakerInstallationLabor'
  | 'chargingOfFreon' | 'materialsReturn' | 'installationChecklist' | 'videoUpload' | 'remarks' | 'audited'

type ColumnCategory = 'standard' | 'piping' | 'electrical' | 'structural' | 'admin'

const CATEGORY_META: Record<ColumnCategory, { label: string; blurb: string }> = {
  standard: { label: 'Standard Add-ons', blurb: 'Shown by default — the usual per-job extras' },
  piping: { label: 'Piping & Copper', blurb: 'Copper tube and flushing-related fees' },
  electrical: { label: 'Electrical & Power', blurb: 'Wiring, breakers, and power supply labor' },
  structural: { label: 'Structural Work', blurb: 'Brackets, scaffolding, hauling, relocation' },
  admin: { label: 'Admin & Notes', blurb: 'Paperwork, uploads, and remarks' },
}

interface ColumnDef {
  key: ColumnKey
  label: string
  width: number
  align: 'left' | 'right'
  /** Always shown, no toggle in the column manager — the identifying/core columns. */
  pinned?: boolean
  /** Group shown under in the column manager. Omitted for pinned columns. */
  category?: ColumnCategory
}

// Column order + widths. Any non-pinned column can be hidden via the column manager (the
// options button beside each installer's name) — rows have no delete control of their own,
// so this is the only per-column control surface. This mirrors the branch's real payroll
// worksheet ("Standard Rates of Installer Payroll"), which has ~24 possible fee/misc columns
// per job — most blank for any given job. Everything past Daily Allowance is hidden by
// default (see DEFAULT_HIDDEN_COLUMNS) so staff unhide only what that sheet actually needs.
const COLUMN_DEFS: ColumnDef[] = [
  { key: 'date', label: 'Date', width: 128, align: 'left', pinned: true },
  { key: 'ticketNumber', label: 'Ticket #', width: 110, align: 'left', pinned: true },
  { key: 'customerName', label: 'Customer Name', width: 220, align: 'left', pinned: true },
  { key: 'brandCapacity', label: 'Brand', width: 150, align: 'left', pinned: true },
  { key: 'remit', label: 'Remit', width: 120, align: 'right', pinned: true },
  { key: 'installationUpload', label: 'Status', width: 130, align: 'left', pinned: true },
  { key: 'installationFee', label: 'Install Fee', width: 100, align: 'right', pinned: true },
  { key: 'totalPipeLength', label: 'Pipe Length', width: 90, align: 'right', category: 'standard' },
  { key: 'earthGrounding', label: 'Earth Grounding', width: 100, align: 'right', category: 'standard' },
  { key: 'dailyAllowance', label: 'Daily Allowance', width: 100, align: 'right', category: 'standard' },
  { key: 'excessCopperTube', label: 'Excess Copper Tube', width: 110, align: 'right', category: 'piping' },
  { key: 'excessCopperTubeLaborOnly', label: 'Copper Tube Labor', width: 120, align: 'right', category: 'piping' },
  { key: 'flushingOldPipe', label: 'Flushing Old Pipe', width: 110, align: 'right', category: 'piping' },
  { key: 'electricalWorks', label: 'Electrical Works', width: 110, align: 'right', category: 'electrical' },
  { key: 'breaker', label: 'Breaker', width: 100, align: 'right', category: 'electrical' },
  { key: 'breakerInstallationLabor', label: 'Breaker Install Labor', width: 130, align: 'right', category: 'electrical' },
  { key: 'powerSupplyLaborOnly', label: 'Power Supply (Labor)', width: 120, align: 'right', category: 'electrical' },
  { key: 'powerSupplyLaborMaterials', label: 'Power Supply (L+M)', width: 120, align: 'right', category: 'electrical' },
  { key: 'chargingOfFreon', label: 'Charging of Freon', width: 110, align: 'right', category: 'electrical' },
  { key: 'hauling', label: 'Hauling', width: 100, align: 'right', category: 'structural' },
  { key: 'dismantling', label: 'Dismantling', width: 100, align: 'right', category: 'structural' },
  { key: 'chippingWorks', label: 'Chipping Works', width: 110, align: 'right', category: 'structural' },
  { key: 'specialBracketCatwalk', label: 'Bracket w/ Catwalk', width: 120, align: 'right', category: 'structural' },
  { key: 'specialBracketWelding', label: 'Bracket Welding', width: 110, align: 'right', category: 'structural' },
  { key: 'sterneBracket', label: 'Sterne Bracket', width: 110, align: 'right', category: 'structural' },
  { key: 'scaffoldingInstallation', label: 'Scaffolding', width: 100, align: 'right', category: 'structural' },
  { key: 'drainPumpInstallation', label: 'Drain Pump', width: 100, align: 'right', category: 'structural' },
  { key: 'relocationAccuFcu', label: 'Relocation ACCU/FCU', width: 130, align: 'right', category: 'structural' },
  { key: 'systemReprocessLabor', label: 'System Reprocess', width: 120, align: 'right', category: 'structural' },
  { key: 'materialsReturn', label: 'Materials Return', width: 110, align: 'right', category: 'admin' },
  { key: 'installationChecklist', label: 'Install Checklist', width: 110, align: 'left', category: 'admin' },
  { key: 'videoUpload', label: 'Video Upload', width: 110, align: 'left', category: 'admin' },
  // Always trail the table, not part of the hide/show system — any unhidden column lands
  // between Install Fee and these two, never after them.
  { key: 'remarks', label: 'Remarks', width: 150, align: 'left', pinned: true },
  { key: 'audited', label: 'Audited', width: 90, align: 'left', pinned: true },
]

// Only "Standard Add-ons" show on first visit — every other fee category starts hidden
// since most are blank for any given installer/job (see COLUMN_DEFS comment above).
const DEFAULT_HIDDEN_COLUMNS: ColumnKey[] = COLUMN_DEFS
  .filter(c => !c.pinned && c.category !== 'standard')
  .map(c => c.key)

const HIDDEN_COLUMNS_KEY = 'ashcol-payroll-hidden-columns'

const mkRow = (installerName: string): PayrollRow => ({
  id: uid(),
  installerName,
  ticketNumber: '',
  workDate: '',
  customerName: '',
  cityAddress: '',
  brandCapacity: '',
  sifQuotation: '',
  totalPipeLength: '',
  amountCollected: '',
  actualCollected: '',
  installationUpload: '',
  installationFee: '',
  earthGrounding: '',
  dailyAllowance: '',
  excessCopperTube: '',
  hauling: '',
  dismantling: '',
  electricalWorks: '',
  chippingWorks: '',
  breaker: '',
  powerSupplyLaborOnly: '',
  powerSupplyLaborMaterials: '',
  specialBracketCatwalk: '',
  specialBracketWelding: '',
  excessCopperTubeLaborOnly: '',
  relocationAccuFcu: '',
  systemReprocessLabor: '',
  drainPumpInstallation: '',
  scaffoldingInstallation: '',
  flushingOldPipe: '',
  sterneBracket: '',
  breakerInstallationLabor: '',
  chargingOfFreon: '',
  materialsReturn: '',
  installationChecklist: '',
  videoUpload: '',
  remarks: '',
  audited: '',
})

export default function Payroll() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)

  const [rows, setRows] = useState<PayrollRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const hasFetchedOnce = useRef(false)

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [branchFilter, setBranchFilter] = useState(() => {
    if (isAdmin) {
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      return activeBranch && activeBranch !== 'ALL_BRANCHES' ? activeBranch : ''
    }
    return user?.branchId || ''
  })

  // No UI to edit these anymore — sync always uses the standard defaults.
  const rates = DEFAULT_PAYROLL_RATES

  // Keyed by installer name — column visibility is per-installer-table, not shared globally.
  const [hiddenColumnsByInstaller, setHiddenColumnsByInstaller] = useState<Record<string, Set<ColumnKey>>>(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_COLUMNS_KEY)
      if (!raw) return {}
      const obj = JSON.parse(raw) as Record<string, string[]>
      const result: Record<string, Set<ColumnKey>> = {}
      for (const [name, arr] of Object.entries(obj)) {
        result[name] = new Set(arr.filter((k): k is ColumnKey => COLUMN_DEFS.some(c => c.key === k)))
      }
      return result
    } catch {
      return {}
    }
  })
  useEffect(() => {
    const serializable: Record<string, ColumnKey[]> = {}
    for (const [name, set] of Object.entries(hiddenColumnsByInstaller)) serializable[name] = Array.from(set)
    localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(serializable))
  }, [hiddenColumnsByInstaller])
  const hiddenColumnsFor = (installerName: string): Set<ColumnKey> =>
    hiddenColumnsByInstaller[installerName] ?? new Set(DEFAULT_HIDDEN_COLUMNS)
  const [columnManagerFor, setColumnManagerFor] = useState<string | null>(null)
  const [columnSearch, setColumnSearch] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    const sync = () => {
      const activeBranch = localStorage.getItem('ashcol-global-branch-id')
      setBranchFilter(activeBranch && activeBranch !== 'ALL_BRANCHES' ? activeBranch : '')
    }
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [isAdmin])

  const getToken = () =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  const handleSearchChange = (value: string) => {
    setRawSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 200)
  }

  const branchName = branches.find(b => b.id === branchFilter)?.name || ''

  const fetchEntries = useCallback(async () => {
    if (!branchFilter || !monthFilter) {
      setRows([])
      setInitialLoading(false)
      return
    }
    try {
      const params = new URLSearchParams({ branchId: branchFilter, month: monthFilter })
      const res = await fetch(`${API_BASE_URL}/v1/payroll?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (res.ok) {
        const list = await res.json()
        const mapped: PayrollRow[] = (Array.isArray(list) ? list : []).map((e: any) => ({
          id: e.id || uid(),
          ticketId: e.ticketId || undefined,
          ticketNumber: e.ticketNumber || '',
          installerName: e.installerName || '',
          workDate: e.workDate || '',
          customerName: e.customerName || '',
          cityAddress: e.cityAddress || '',
          brandCapacity: e.brandCapacity || '',
          sifQuotation: e.sifQuotation || '',
          totalPipeLength: e.totalPipeLength || '',
          amountCollected: e.amountCollected != null ? String(e.amountCollected) : '',
          actualCollected: e.actualCollected || '',
          installationUpload: e.installationUpload || '',
          installationFee: e.installationFee != null ? String(e.installationFee) : '',
          earthGrounding: e.earthGrounding != null ? String(e.earthGrounding) : '',
          dailyAllowance: e.dailyAllowance != null ? String(e.dailyAllowance) : '',
          excessCopperTube: e.excessCopperTube != null ? String(e.excessCopperTube) : '',
          hauling: e.hauling != null ? String(e.hauling) : '',
          dismantling: e.dismantling != null ? String(e.dismantling) : '',
          electricalWorks: e.electricalWorks != null ? String(e.electricalWorks) : '',
          chippingWorks: e.chippingWorks != null ? String(e.chippingWorks) : '',
          breaker: e.breaker != null ? String(e.breaker) : '',
          powerSupplyLaborOnly: e.powerSupplyLaborOnly != null ? String(e.powerSupplyLaborOnly) : '',
          powerSupplyLaborMaterials: e.powerSupplyLaborMaterials != null ? String(e.powerSupplyLaborMaterials) : '',
          specialBracketCatwalk: e.specialBracketCatwalk != null ? String(e.specialBracketCatwalk) : '',
          specialBracketWelding: e.specialBracketWelding != null ? String(e.specialBracketWelding) : '',
          excessCopperTubeLaborOnly: e.excessCopperTubeLaborOnly != null ? String(e.excessCopperTubeLaborOnly) : '',
          relocationAccuFcu: e.relocationAccuFcu != null ? String(e.relocationAccuFcu) : '',
          systemReprocessLabor: e.systemReprocessLabor != null ? String(e.systemReprocessLabor) : '',
          drainPumpInstallation: e.drainPumpInstallation != null ? String(e.drainPumpInstallation) : '',
          scaffoldingInstallation: e.scaffoldingInstallation != null ? String(e.scaffoldingInstallation) : '',
          flushingOldPipe: e.flushingOldPipe != null ? String(e.flushingOldPipe) : '',
          sterneBracket: e.sterneBracket != null ? String(e.sterneBracket) : '',
          breakerInstallationLabor: e.breakerInstallationLabor != null ? String(e.breakerInstallationLabor) : '',
          chargingOfFreon: e.chargingOfFreon != null ? String(e.chargingOfFreon) : '',
          materialsReturn: e.materialsReturn != null ? String(e.materialsReturn) : '',
          installationChecklist: e.installationChecklist || '',
          videoUpload: e.videoUpload || '',
          remarks: e.remarks || '',
          audited: e.audited || '',
        }))
        // The ticket-month match on sync is a broad OR across several schedule date fields
        // (not just the actual job date), so a stray row saved under the wrong period can
        // slip in. Only show/keep rows whose real work date is actually in this period.
        const inPeriod = mapped.filter(r => !r.workDate || r.workDate.slice(0, 7) === monthFilter)
        if (inPeriod.length !== mapped.length) {
          console.warn(`Payroll: dropped ${mapped.length - inPeriod.length} row(s) whose work date falls outside ${monthFilter}`)
        }
        setRows(inPeriod)
      }
    } catch (e) {
      console.error('Failed to fetch payroll entries', e)
    } finally {
      if (!hasFetchedOnce.current) hasFetchedOnce.current = true
      setInitialLoading(false)
    }
  }, [branchFilter, monthFilter])

  useEffect(() => {
    const token = getToken()
    fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const list = (data?.data || data || []).map((b: any) => ({ id: b.id, name: b.name }))
        setBranches(list.sort((a: any, b: any) => a.name.localeCompare(b.name)))
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setInitialLoading(true)
    void fetchEntries()
  }, [fetchEntries])

  const runSync = useCallback(async () => {
    if (!branchFilter || !monthFilter) return
    setSyncing(true)
    try {
      const result = await fetchAndMapPayroll(branchFilter, monthFilter, branchName, rates)
      if (result.ok) {
        setRows(prev => deduplicateAndMergePayroll(prev, result.rows))
      } else {
        alert(`Could not sync from schedules (${result.error}).`)
      }
    } finally {
      setSyncing(false)
    }
  }, [branchFilter, monthFilter, branchName, rates])

  const handleSyncClick = () => {
    if (rows.length === 0) {
      void runSync()
      return
    }
    setConfirmDialog({
      title: 'Sync from Schedules',
      message: 'This will add any new completed jobs from this month\'s schedules. Existing rows (including your edits) are kept.',
      confirmText: 'Sync',
      variant: 'info',
      onConfirm: () => {
        setConfirmDialog(null)
        void runSync()
      },
    })
  }

  const updateRow = (id: string, patch: Partial<PayrollRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  const addRow = (installerName: string) => setRows(prev => [...prev, mkRow(installerName)])

  const columnAccessors: Record<ColumnKey, { get: (r: PayrollRow) => string; set: (id: string, v: string) => void }> = {
    date: { get: r => r.workDate, set: (id, v) => updateRow(id, { workDate: v }) },
    ticketNumber: { get: r => r.ticketNumber, set: (id, v) => updateRow(id, { ticketNumber: v }) },
    customerName: { get: r => r.customerName, set: (id, v) => updateRow(id, { customerName: v }) },
    brandCapacity: { get: r => r.brandCapacity, set: (id, v) => updateRow(id, { brandCapacity: v }) },
    remit: { get: r => r.actualCollected, set: (id, v) => updateRow(id, { actualCollected: v }) },
    installationUpload: { get: r => r.installationUpload, set: (id, v) => updateRow(id, { installationUpload: v }) },
    installationFee: { get: r => r.installationFee, set: (id, v) => updateRow(id, { installationFee: v }) },
    totalPipeLength: { get: r => r.totalPipeLength, set: (id, v) => updateRow(id, { totalPipeLength: v }) },
    earthGrounding: { get: r => r.earthGrounding, set: (id, v) => updateRow(id, { earthGrounding: v }) },
    dailyAllowance: { get: r => r.dailyAllowance, set: (id, v) => updateRow(id, { dailyAllowance: v }) },
    excessCopperTube: { get: r => r.excessCopperTube, set: (id, v) => updateRow(id, { excessCopperTube: v }) },
    hauling: { get: r => r.hauling, set: (id, v) => updateRow(id, { hauling: v }) },
    dismantling: { get: r => r.dismantling, set: (id, v) => updateRow(id, { dismantling: v }) },
    electricalWorks: { get: r => r.electricalWorks, set: (id, v) => updateRow(id, { electricalWorks: v }) },
    chippingWorks: { get: r => r.chippingWorks, set: (id, v) => updateRow(id, { chippingWorks: v }) },
    breaker: { get: r => r.breaker, set: (id, v) => updateRow(id, { breaker: v }) },
    powerSupplyLaborOnly: { get: r => r.powerSupplyLaborOnly, set: (id, v) => updateRow(id, { powerSupplyLaborOnly: v }) },
    powerSupplyLaborMaterials: { get: r => r.powerSupplyLaborMaterials, set: (id, v) => updateRow(id, { powerSupplyLaborMaterials: v }) },
    specialBracketCatwalk: { get: r => r.specialBracketCatwalk, set: (id, v) => updateRow(id, { specialBracketCatwalk: v }) },
    specialBracketWelding: { get: r => r.specialBracketWelding, set: (id, v) => updateRow(id, { specialBracketWelding: v }) },
    excessCopperTubeLaborOnly: { get: r => r.excessCopperTubeLaborOnly, set: (id, v) => updateRow(id, { excessCopperTubeLaborOnly: v }) },
    relocationAccuFcu: { get: r => r.relocationAccuFcu, set: (id, v) => updateRow(id, { relocationAccuFcu: v }) },
    systemReprocessLabor: { get: r => r.systemReprocessLabor, set: (id, v) => updateRow(id, { systemReprocessLabor: v }) },
    drainPumpInstallation: { get: r => r.drainPumpInstallation, set: (id, v) => updateRow(id, { drainPumpInstallation: v }) },
    scaffoldingInstallation: { get: r => r.scaffoldingInstallation, set: (id, v) => updateRow(id, { scaffoldingInstallation: v }) },
    flushingOldPipe: { get: r => r.flushingOldPipe, set: (id, v) => updateRow(id, { flushingOldPipe: v }) },
    sterneBracket: { get: r => r.sterneBracket, set: (id, v) => updateRow(id, { sterneBracket: v }) },
    breakerInstallationLabor: { get: r => r.breakerInstallationLabor, set: (id, v) => updateRow(id, { breakerInstallationLabor: v }) },
    chargingOfFreon: { get: r => r.chargingOfFreon, set: (id, v) => updateRow(id, { chargingOfFreon: v }) },
    materialsReturn: { get: r => r.materialsReturn, set: (id, v) => updateRow(id, { materialsReturn: v }) },
    installationChecklist: { get: r => r.installationChecklist, set: (id, v) => updateRow(id, { installationChecklist: v }) },
    videoUpload: { get: r => r.videoUpload, set: (id, v) => updateRow(id, { videoUpload: v }) },
    remarks: { get: r => r.remarks, set: (id, v) => updateRow(id, { remarks: v }) },
    audited: { get: r => r.audited, set: (id, v) => updateRow(id, { audited: v }) },
  }

  const toggleColumn = (key: ColumnKey) => {
    if (!columnManagerFor) return
    if (COLUMN_DEFS.find(c => c.key === key)?.pinned) return
    setHiddenColumnsByInstaller(prev => {
      const current = prev[columnManagerFor] ?? new Set(DEFAULT_HIDDEN_COLUMNS)
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, [columnManagerFor]: next }
    })
  }
  const openColumnManager = (installerName: string) => {
    setColumnSearch('')
    setColumnManagerFor(installerName)
  }

  const handleSave = async () => {
    if (!branchFilter || !monthFilter) return
    setSaving(true)
    try {
      const entries = rows.map((r, idx) => ({
        ticketId: r.ticketId || null,
        ticketNumber: r.ticketNumber || null,
        installerName: r.installerName,
        sortOrder: idx,
        workDate: r.workDate || null,
        customerName: r.customerName || null,
        cityAddress: r.cityAddress || null,
        brandCapacity: r.brandCapacity || null,
        sifQuotation: r.sifQuotation || null,
        totalPipeLength: r.totalPipeLength || null,
        installationUpload: r.installationUpload || null,
        amountCollected: r.amountCollected ? num(r.amountCollected) : null,
        actualCollected: r.actualCollected || null,
        installationFee: r.installationFee ? num(r.installationFee) : null,
        earthGrounding: r.earthGrounding ? num(r.earthGrounding) : null,
        dailyAllowance: r.dailyAllowance ? num(r.dailyAllowance) : null,
        excessCopperTube: r.excessCopperTube ? num(r.excessCopperTube) : null,
        hauling: r.hauling ? num(r.hauling) : null,
        dismantling: r.dismantling ? num(r.dismantling) : null,
        electricalWorks: r.electricalWorks ? num(r.electricalWorks) : null,
        chippingWorks: r.chippingWorks ? num(r.chippingWorks) : null,
        breaker: r.breaker ? num(r.breaker) : null,
        powerSupplyLaborOnly: r.powerSupplyLaborOnly ? num(r.powerSupplyLaborOnly) : null,
        powerSupplyLaborMaterials: r.powerSupplyLaborMaterials ? num(r.powerSupplyLaborMaterials) : null,
        specialBracketCatwalk: r.specialBracketCatwalk ? num(r.specialBracketCatwalk) : null,
        specialBracketWelding: r.specialBracketWelding ? num(r.specialBracketWelding) : null,
        excessCopperTubeLaborOnly: r.excessCopperTubeLaborOnly ? num(r.excessCopperTubeLaborOnly) : null,
        relocationAccuFcu: r.relocationAccuFcu ? num(r.relocationAccuFcu) : null,
        systemReprocessLabor: r.systemReprocessLabor ? num(r.systemReprocessLabor) : null,
        drainPumpInstallation: r.drainPumpInstallation ? num(r.drainPumpInstallation) : null,
        scaffoldingInstallation: r.scaffoldingInstallation ? num(r.scaffoldingInstallation) : null,
        flushingOldPipe: r.flushingOldPipe ? num(r.flushingOldPipe) : null,
        sterneBracket: r.sterneBracket ? num(r.sterneBracket) : null,
        breakerInstallationLabor: r.breakerInstallationLabor ? num(r.breakerInstallationLabor) : null,
        chargingOfFreon: r.chargingOfFreon ? num(r.chargingOfFreon) : null,
        materialsReturn: r.materialsReturn ? num(r.materialsReturn) : null,
        installationChecklist: r.installationChecklist || null,
        videoUpload: r.videoUpload || null,
        remarks: r.remarks || null,
        audited: r.audited || null,
      }))
      const res = await fetch(`${API_BASE_URL}/v1/payroll`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: branchFilter, periodMonth: monthFilter, entries }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchEntries()
    } catch (e) {
      alert('Failed to save payroll.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const filteredRows = useMemo(() => {
    const term = search.toLowerCase()
    if (!term) return rows
    return rows.filter(r =>
      r.installerName.toLowerCase().includes(term)
      || r.customerName.toLowerCase().includes(term)
      || r.cityAddress.toLowerCase().includes(term),
    )
  }, [rows, search])

  const grouped = useMemo(() => {
    const map = new Map<string, PayrollRow[]>()
    for (const row of filteredRows) {
      const key = row.installerName.trim() || 'UNASSIGNED'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    // Job order = chronological sequence — keep each installer's rows sorted by date
    // regardless of sync/insertion order. Undated (manually added) rows sort to the end.
    for (const installerRows of map.values()) {
      installerRows.sort((a, b) => {
        if (!a.workDate) return 1
        if (!b.workDate) return -1
        return a.workDate.localeCompare(b.workDate)
      })
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredRows])

  const grandTotal = useMemo(() => grouped.reduce((sum, [, r]) => sum + installerTotal(r), 0), [grouped])

  const toggleCollapsed = (name: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const monthOptions = useMemo(() => {
    const seen = new Set<string>()
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(seen).sort((a, b) => b.localeCompare(a))
  }, [])

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  // Cell input: no box of its own — it fills its grid cell edge-to-edge like a
  // spreadsheet cell. The grid line (border) lives on the cell wrapper, not the input.
  const inputCls = "w-full h-full px-2 py-1.5 text-[11px] font-semibold bg-transparent border-0 outline-none focus:outline-none focus:ring-0"
  // No text-align baked in — alignment is set per-column (numeric columns go right-aligned).
  const thCls = "px-2 py-2 text-[9px] font-extrabold uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis"
  const visibleColumnsFor = (installerName: string) => {
    const hidden = hiddenColumnsFor(installerName)
    return COLUMN_DEFS.filter(c => c.pinned || !hidden.has(c.key))
  }
  const cellBorder = { borderRight: `1px solid ${border}` }
  const cellFocusBg = isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)'
  const onCellFocus = (e: FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = cellFocusBg }
  const onCellBlur = (e: FocusEvent<HTMLInputElement>) => { e.currentTarget.style.backgroundColor = 'transparent' }
  const zebraBg = isLight ? '#f8fafc' : '#0c1420'
  const rowHoverBg = isLight ? '#eef2f7' : '#111d33'
  const headerBg = isLight ? '#f8fafc' : '#0d1520'
  const numericStyle = { textAlign: 'right' as const }

  return (
    <div className="flex flex-col gap-4 pb-4 md:pb-4 h-full min-h-0">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5" style={{ color: '#10B981' }} />
        <h1 className="text-lg font-extrabold" style={{ color: textPrimary }}>Payroll</h1>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search installer, customer or address..."
              value={rawSearch}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all border"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>

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
                <option value="">Select branch…</option>
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

          <div className="relative min-w-[160px]">
            <Calendar className="absolute left-3 w-4 h-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]/50 border transition-all"
              style={{ color: textPrimary, backgroundColor: inputBg, borderColor: '#10B981' }}
              aria-label="Filter by Month"
            >
              {monthOptions.map(ym => (
                <option key={ym} value={ym}>{monthLabel(ym)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 md:justify-end">
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={syncing || !branchFilter}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all disabled:opacity-50"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync from Schedules
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !branchFilter}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50"
            style={{ background: '#10B981' }}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Grand total */}
      <div className="flex items-center justify-end">
        <div className="px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2"
          style={{ backgroundColor: inputBg, borderColor: border }}>
          <span style={{ color: textMuted }}>Grand Total:</span>
          <span style={{ color: '#10B981' }}>₱{peso(grandTotal)}</span>
        </div>
      </div>

      {initialLoading ? (
        <div className="rounded-2xl p-6 flex flex-col gap-2" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: '40px', borderRadius: '8px',
              background: isLight ? '#f1f5f9' : '#0d1520',
            }} />
          ))}
        </div>
      ) : !branchFilter ? (
        <div className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <Building2 className="w-10 h-10 opacity-25" />
          <p className="text-sm font-semibold" style={{ color: textMuted }}>Select a branch to view payroll.</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <CheckCircle2 className="w-10 h-10 opacity-25 text-emerald-500" />
          <p className="text-sm font-semibold" style={{ color: textMuted }}>No payroll entries yet — try "Sync from Schedules".</p>
        </div>
      ) : (
        // Negative margin cancels the page shell's p-5/md:p-8 so the table runs flush to the tab edges.
        <div className="flex flex-col gap-4 -mx-5 md:-mx-8">
          {grouped.map(([installerName, installerRows]) => {
            const isCollapsed = collapsed.has(installerName)
            const groupVisibleColumns = visibleColumnsFor(installerName)
            const groupGridTemplate = groupVisibleColumns.map(c => `${c.width}px`).join(' ')
            const groupMinWidth = groupVisibleColumns.reduce((sum, c) => sum + c.width, 0)
            return (
              <div key={installerName} className="overflow-hidden" style={{ backgroundColor: cardBg, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                  style={{ backgroundColor: headerBg, borderBottom: isCollapsed ? 'none' : `1px solid ${border}` }}
                  onClick={() => toggleCollapsed(installerName)}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    <span className="text-sm font-extrabold" style={{ color: textPrimary }}>{installerName}</span>
                    <span className="text-[11px] font-semibold" style={{ color: textMuted }}>
                      {installerRows.length} job{installerRows.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); openColumnManager(installerName) }}
                      title="Show/hide columns"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors"
                      style={{ color: textMuted, backgroundColor: isLight ? '#eef2f7' : '#111d33' }}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      Columns
                    </button>
                  </div>
                  <span className="text-sm font-extrabold" style={{ color: '#10B981' }}>₱{peso(installerTotal(installerRows))}</span>
                </div>

                {!isCollapsed && (
                  <div className="w-full overflow-x-auto">
                    <div
                      className="w-full"
                      style={{ fontSize: '11px', color: textPrimary, minWidth: groupMinWidth, border: `1px solid ${border}`, borderTop: 'none' }}
                    >
                      <div
                        className="grid sticky top-0 z-10"
                        style={{ gridTemplateColumns: groupGridTemplate, borderBottom: `2px solid ${border}`, color: textMuted, backgroundColor: headerBg }}
                      >
                        {groupVisibleColumns.map((col, i) => (
                          <div
                            key={col.key}
                            className={`${thCls} ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                            style={i < groupVisibleColumns.length - 1 ? cellBorder : undefined}
                          >
                            {col.label}
                          </div>
                        ))}
                      </div>
                      {installerRows.map((row, idx) => {
                        const rowBg = idx % 2 === 1 ? zebraBg : 'transparent'
                        return (
                          <div
                            key={row.id}
                            className="grid"
                            style={{ gridTemplateColumns: groupGridTemplate, borderBottom: `1px solid ${border}`, backgroundColor: rowBg }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = rowHoverBg }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = rowBg }}
                          >
                            {groupVisibleColumns.map((col, i) => {
                              const cellStyle = {
                                ...(i < groupVisibleColumns.length - 1 ? cellBorder : {}),
                                ...(col.align === 'right' ? numericStyle : {}),
                              }
                              if (col.key === 'date') {
                                return (
                                  <input
                                    key={col.key}
                                    type="date"
                                    value={row.workDate}
                                    onChange={e => updateRow(row.id, { workDate: e.target.value })}
                                    readOnly={!!row.ticketId}
                                    title={row.ticketId ? 'Job order date — synced from the ticket, not editable' : undefined}
                                    className={inputCls}
                                    style={{ ...cellStyle, opacity: row.ticketId ? 0.65 : 1, cursor: row.ticketId ? 'default' : 'text' }}
                                    onFocus={row.ticketId ? undefined : onCellFocus}
                                    onBlur={row.ticketId ? undefined : onCellBlur}
                                  />
                                )
                              }
                              const acc = columnAccessors[col.key]
                              return (
                                <input
                                  key={col.key}
                                  type="text"
                                  value={acc.get(row)}
                                  onChange={e => acc.set(row.id, e.target.value)}
                                  className={inputCls}
                                  style={cellStyle}
                                  onFocus={onCellFocus}
                                  onBlur={onCellBlur}
                                />
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => addRow(installerName)}
                      className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold"
                      style={{ color: '#10B981' }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add row
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* SUMMARY */}
          <div className="overflow-hidden" style={{ backgroundColor: cardBg, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
            <div className="px-4 py-3" style={{ backgroundColor: headerBg, borderBottom: `2px solid ${border}` }}>
              <span className="text-sm font-extrabold" style={{ color: textPrimary }}>Summary</span>
            </div>
            <div style={{ fontSize: '12px', color: textPrimary }}>
              {grouped.map(([installerName, installerRows], idx) => {
                const rowBg = idx % 2 === 1 ? zebraBg : 'transparent'
                return (
                  <div
                    key={installerName}
                    className="grid grid-cols-[1fr_auto]"
                    style={{ borderBottom: `1px solid ${border}`, backgroundColor: rowBg }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = rowHoverBg }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = rowBg }}
                  >
                    <div className="px-4 py-2.5 font-semibold">{installerName}</div>
                    <div className="px-4 py-2.5 text-right font-bold" style={{ color: '#10B981' }}>₱{peso(installerTotal(installerRows))}</div>
                  </div>
                )
              })}
              <div className="grid grid-cols-[1fr_auto]" style={{ backgroundColor: headerBg, borderTop: `2px solid ${border}` }}>
                <div className="px-4 py-3 font-extrabold">Grand Total</div>
                <div className="px-4 py-3 text-right font-extrabold" style={{ color: '#10B981' }}>₱{peso(grandTotal)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {columnManagerFor && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(8,12,20,0.55)' }}
          onClick={() => setColumnManagerFor(null)}
        >
          <div
            className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxWidth: 720, maxHeight: '82vh', backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" style={{ color: '#10B981' }} />
                <h2 className="text-sm font-extrabold" style={{ color: textPrimary }}>
                  Manage Columns — {columnManagerFor}
                </h2>
              </div>
              <button type="button" onClick={() => setColumnManagerFor(null)} className="p-1.5 rounded-lg hover:bg-red-500/10">
                <X className="w-4 h-4" style={{ color: textMuted }} />
              </button>
            </div>

            {/* Search + bulk actions */}
            <div className="flex items-center gap-2 px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: textMuted }} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search columns..."
                  value={columnSearch}
                  onChange={e => setColumnSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                />
              </div>
              <button
                type="button"
                onClick={() => setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set() }))}
                className="px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap"
                style={{ color: '#10B981', backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)' }}
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => setHiddenColumnsByInstaller(prev => ({ ...prev, [columnManagerFor]: new Set(COLUMN_DEFS.filter(c => !c.pinned).map(c => c.key)) }))}
                className="px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap"
                style={{ color: textMuted, backgroundColor: isLight ? '#f1f5f9' : '#0d1520' }}
              >
                Hide all
              </button>
            </div>

            {/* Categorized checklist */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
              {(() => {
                const hidden = hiddenColumnsFor(columnManagerFor)
                return (Object.keys(CATEGORY_META) as ColumnCategory[]).map(cat => {
                  const cols = COLUMN_DEFS.filter(c => c.category === cat && c.label.toLowerCase().includes(columnSearch.trim().toLowerCase()))
                  if (cols.length === 0) return null
                  const meta = CATEGORY_META[cat]
                  const visibleCount = cols.filter(c => !hidden.has(c.key)).length
                  return (
                    <div key={cat} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                      <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: headerBg }}>
                        <div>
                          <div className="text-[11px] font-extrabold" style={{ color: textPrimary }}>{meta.label}</div>
                          <div className="text-[10px] font-medium" style={{ color: textMuted }}>{meta.blurb}</div>
                        </div>
                        <span className="text-[10px] font-bold shrink-0 ml-2" style={{ color: visibleCount > 0 ? '#10B981' : textMuted }}>
                          {visibleCount}/{cols.length}
                        </span>
                      </div>
                      <div>
                        {cols.map(col => (
                          <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold cursor-pointer" style={{ color: textPrimary }}>
                            <input type="checkbox" checked={!hidden.has(col.key)} onChange={() => toggleColumn(col.key)} />
                            {col.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-5 py-3 shrink-0" style={{ borderTop: `1px solid ${border}` }}>
              <button
                type="button"
                onClick={() => setColumnManagerFor(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: '#10B981' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}
