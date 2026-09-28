import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Printer, Download, Copy, Check, RefreshCw,
  Building2, RotateCcw, Wrench, PauseCircle, CircleDollarSign, Wallet, Sparkles
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL, formatBranchName, branchScopesMatch } from '../utils/api'
import InstallerTicketHistoryModal from './InstallerTicketHistoryModal'
import type { HistoryPerson } from './TicketHistoryTable'
import {
  branchWeekCycle,
  weeksOfMonth,
  type PayrollWeek,
  type WeekCycle,
} from '../utils/payrollWeeks'
import {
  deduplicateAndMergePayroll,
  mapSavedPayrollEntry,
  installerTotal,
  deductionTotal,
  isActivePayRow,
  isCarryOver,
  rowTotal,
  type PayrollRow,
} from '../utils/payrollDerive'

export interface WeekSummaryModalProps {
  isOpen: boolean
  onClose: () => void
  activeBranchId?: string
  branches: { id: string; name: string; payrollRates?: string | null }[]
  activeWeek: PayrollWeek | null
  activeMonth: string
}

interface InstallerSummaryRow {
  branchId: string
  branchName: string
  installerName: string
  amount: number
  cash: number
  onlineTransfer: number
  prevSalary: number
  prevCashAdvance: number
  totalForRelease: number
  mop: string
  accountNo: string
  status: 'SENT' | 'PAID' | 'HOLD'
  remarks: string
  isHighlighted?: boolean
}

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const cleaned = String(v).replace(/[^0-9.-]/g, '')
  if (!cleaned) return 0
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

const peso = (v: number | string | null | undefined) => {
  const n = num(v)
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatShortDate = (ymd: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })
}

export default function WeekSummaryModal({
  isOpen,
  onClose,
  activeBranchId,
  branches,
  activeWeek,
  activeMonth,
}: WeekSummaryModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Region selection: 'north' or 'south'
  const initialRegion = useMemo<'north' | 'south'>(() => {
    if (!activeBranchId) return 'north'
    const cycle = branchWeekCycle(activeBranchId)
    return cycle === 'friday' ? 'north' : 'south'
  }, [activeBranchId])

  const [region, setRegion] = useState<'north' | 'south'>(initialRegion)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [historyModalInstaller, setHistoryModalInstaller] = useState<HistoryPerson | null>(null)

  // Manual row overrides stored in state & localStorage
  const [overrides, setOverrides] = useState<Record<string, Partial<InstallerSummaryRow>>>({})

  // Storage key for overrides based on region and dates
  const storageKey = useMemo(() => {
    if (!activeWeek) return null
    return `ashcol-payroll-summary-overrides-${region}-${activeWeek.from}-${activeWeek.to}`
  }, [region, activeWeek])

  // Load saved overrides
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        setOverrides(JSON.parse(saved))
      } else {
        setOverrides({})
      }
    } catch {
      setOverrides({})
    }
  }, [storageKey])

  // Save overrides to localStorage
  const saveOverrides = useCallback((next: Record<string, Partial<InstallerSummaryRow>>) => {
    setOverrides(next)
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch (e) {
        console.error('Failed to persist summary overrides:', e)
      }
    }
  }, [storageKey])

  const updateRowOverride = (key: string, patch: Partial<InstallerSummaryRow>) => {
    const next = {
      ...overrides,
      [key]: { ...(overrides[key] || {}), ...patch },
    }
    saveOverrides(next)
  }

  const resetOverrides = () => {
    saveOverrides({})
  }

  // Determine branches for this region
  const regionBranches = useMemo(() => {
    const targetCycle: WeekCycle = region === 'north' ? 'friday' : 'monday'
    return branches.filter(b => {
      const cycle = branchWeekCycle(b.id || b.name)
      return cycle === targetCycle
    })
  }, [branches, region])

  // Resolved week dates for the selected region
  const regionWeek = useMemo<PayrollWeek | null>(() => {
    if (!activeMonth) return null
    const targetCycle: WeekCycle = region === 'north' ? 'friday' : 'monday'
    const weeks = weeksOfMonth(activeMonth, targetCycle)
    if (activeWeek) {
      const match = weeks.find(w => w.weekNumber === activeWeek.weekNumber)
      if (match) return match
    }
    return weeks[weeks.length - 1] ?? null
  }, [activeMonth, region, activeWeek])

  const weekFrom = regionWeek?.from || activeWeek?.from || ''
  const weekTo = regionWeek?.to || activeWeek?.to || ''

  // Payroll payout date (typically Saturday, +2 days after Thursday cut-off)
  const payrollDateStr = useMemo(() => {
    if (!weekTo) return ''
    const [y, m, d] = weekTo.split('-').map(Number)
    if (!y || !m || !d) return ''
    const date = new Date(y, m - 1, d)
    date.setDate(date.getDate() + 2)
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }, [weekTo])

  // Raw payroll rows fetched per branch
  const [branchData, setBranchData] = useState<Record<string, PayrollRow[]>>({})
  const [employees, setEmployees] = useState<any[]>([])

  const getToken = () =>
    localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  // Load employees list
  useEffect(() => {
    if (!isOpen) return
    fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.data) setEmployees(d.data)
      })
      .catch(() => {})
  }, [isOpen])

  // Fetch all payroll entries for region branches
  const fetchData = useCallback(async () => {
    if (!isOpen || regionBranches.length === 0 || !activeMonth) return
    setLoading(true)
    try {
      const results: Record<string, PayrollRow[]> = {}
      const months = new Set<string>()
      if (weekFrom) months.add(weekFrom.slice(0, 7))
      if (weekTo) months.add(weekTo.slice(0, 7))
      if (months.size === 0) months.add(activeMonth)

      await Promise.all(
        regionBranches.map(async b => {
          let branchRows: PayrollRow[] = []
          for (const m of months) {
            try {
              const res = await fetch(`${API_BASE_URL}/v1/payroll?branchId=${encodeURIComponent(b.id)}&month=${m}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
              })
              if (res.ok) {
                const list = await res.json()
                if (Array.isArray(list)) {
                  // Raw entries hold fees as numbers and customFields as a JSON string — map them
                  // first, or the totals below read string characters instead of deduction keys.
                  branchRows = deduplicateAndMergePayroll(branchRows, list.map(mapSavedPayrollEntry))
                }
              }
            } catch (err) {
              console.error(`Failed to fetch payroll for branch ${b.id}:`, err)
            }
          }
          results[b.id] = branchRows
        })
      )
      setBranchData(results)
    } finally {
      setLoading(false)
    }
  }, [isOpen, regionBranches, activeMonth, weekFrom, weekTo])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Clean branch display name matching Excel format
  const getBranchLabel = (nameOrId: string) => {
    const upper = nameOrId.toUpperCase()
    if (upper.includes('TAGUIG') || upper.includes('HEAD OFFICE') || upper.includes('SALES')) {
      return 'TAGUIG SALES'
    }
    if (upper.includes('BULACAN')) return 'BULACAN'
    if (upper.includes('RIZAL')) return 'RIZAL'
    if (upper.includes('PAMPANGA')) return 'PAMPANGA'
    if (upper.includes('SILANG')) return 'SILANG'
    if (upper.includes('DASMA') || upper.includes('DASMARIÑAS')) return 'DASMARIÑAS'
    if (upper.includes('CALAUAN')) return 'CALAUAN'
    if (upper.includes('CANDELARIA')) return 'CANDELARIA'
    if (upper.includes('BINAN') || upper.includes('BIÑAN') || upper.includes('SAN PEDRO') || upper.includes('SANPEDRO')) return 'BINAN'
    return formatBranchName(nameOrId).toUpperCase()
  }

  // Build the compiled list of installer rows per branch
  const compiledRows = useMemo<InstallerSummaryRow[]>(() => {
    const list: InstallerSummaryRow[] = []

    for (const b of regionBranches) {
      const bRows = branchData[b.id] || []
      // Held rows and released originals never belong to a week's view (their payout, if any, now
      // lives on their carry-over copy). A carry-over copy keeps its ORIGIN's workDate, so it's
      // matched against this week by hold:targetWeekFrom/To instead — see payroll-hold-release-plan.md.
      const filtered = bRows.filter(r => {
        if (!isActivePayRow(r)) return false
        if (isCarryOver(r)) {
          if (weekFrom && r.customFields?.['hold:targetWeekFrom'] !== weekFrom) return false
          if (weekTo && r.customFields?.['hold:targetWeekTo'] !== weekTo) return false
          return true
        }
        if (!r.workDate) return true
        if (weekFrom && r.workDate < weekFrom) return false
        if (weekTo && r.workDate > weekTo) return false
        return true
      })

      const groups = new Map<string, PayrollRow[]>()
      for (const r of filtered) {
        let rawName = (r.installerName || 'Unassigned').trim().toUpperCase()
        if (rawName === 'JUSTINE' || rawName === 'JUSTINE ROI' || rawName === 'JUSTINE BIEN' || rawName === 'JUSTINE ROI BIEN') {
          rawName = 'JUSTIN ROI BIEN'
        }
        if (!groups.has(rawName)) groups.set(rawName, [])
        groups.get(rawName)!.push(r)
      }

      const branchLabel = getBranchLabel(b.name || b.id)

      for (const [rawName, iRows] of groups.entries()) {
        const matchesName = (e: any) => {
          const n = (e.name || '').trim().toUpperCase()
          const nick = (e.nickname || '').trim().toUpperCase()
          return n === rawName || (nick && nick === rawName) || n.includes(rawName) || rawName.includes(n)
        }
        // Prefer a same-branch match so a namesake in another branch can't supply the wrong
        // name, phone, or in-house flag.
        const emp = employees.find(e => matchesName(e) && branchScopesMatch(e.branchId, b.id))
          || employees.find(matchesName)

        // In-house (salaried) technicians aren't on the per-job payroll — same rule as the Payroll page.
        if (emp?.inHouse) continue

        const displayName = emp?.name ? emp.name.toUpperCase() : rawName
        // This cut-off's own jobs only — a carry-over's payout is this installer's PREVIOUS
        // cut-off's money, reported separately below, never folded into this week's amount.
        const regularRows = iRows.filter(r => !isCarryOver(r))
        const carryRows = iRows.filter(isCarryOver)
        // Same math as the Payroll page's "Payroll Amount" (installerNet), floored at zero for release.
        const computedAmount = Math.max(0, installerTotal(regularRows) - deductionTotal(iRows))
        const carryOverTotal = carryRows.reduce((sum, r) => sum + rowTotal(r), 0)

        const rowKey = `${b.id}-${displayName}`
        const rowOverride = overrides[rowKey] || {}

        const finalAmount = rowOverride.amount !== undefined ? rowOverride.amount : computedAmount
        const status = rowOverride.status || (iRows[0]?.status === 'HOLD' ? 'HOLD' : 'SENT')
        const cash = rowOverride.cash !== undefined ? rowOverride.cash : 0
        const onlineTransfer = rowOverride.onlineTransfer !== undefined
          ? rowOverride.onlineTransfer
          : (status === 'HOLD' ? 0 : Math.max(0, finalAmount - cash))
        // Salary carried from a previous cut-off via a release — defaults to the sum of this
        // installer's carry-over copies landing in this week, editable like any other cell.
        const prevSalary = rowOverride.prevSalary !== undefined ? rowOverride.prevSalary : carryOverTotal
        const prevCashAdvance = rowOverride.prevCashAdvance !== undefined ? rowOverride.prevCashAdvance : 0
        const totalForRelease = rowOverride.totalForRelease !== undefined
          ? rowOverride.totalForRelease
          : (status === 'HOLD' ? 0 : finalAmount) + prevSalary

        const defaultMop = 'GCASH'
        const accountNo = rowOverride.accountNo !== undefined
          ? rowOverride.accountNo
          : (emp?.phone || '')

        list.push({
          branchId: b.id,
          branchName: rowOverride.branchName || branchLabel,
          installerName: displayName,
          amount: finalAmount,
          cash,
          onlineTransfer,
          prevSalary,
          prevCashAdvance,
          totalForRelease,
          mop: rowOverride.mop || defaultMop,
          accountNo,
          status,
          remarks: rowOverride.remarks !== undefined ? rowOverride.remarks : (iRows[0]?.remarks || ''),
          isHighlighted: rowOverride.isHighlighted || false,
        })
      }
    }

    return list
  }, [regionBranches, branchData, weekFrom, weekTo, employees, overrides])

  // Filter state for showcase
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('ALL')

  // Reset filters when switching region
  useEffect(() => {
    setSelectedBranchFilter('ALL')
  }, [region])

  // Distinct branch names present in current region data
  const availableBranches = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of compiledRows) {
      if (r.branchName) {
        counts.set(r.branchName, (counts.get(r.branchName) || 0) + 1)
      }
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
  }, [compiledRows])

  // Filtered rows based on branch selection
  const displayedRows = useMemo(() => {
    if (selectedBranchFilter === 'ALL') return compiledRows
    return compiledRows.filter(r => r.branchName === selectedBranchFilter)
  }, [compiledRows, selectedBranchFilter])

  // Group displayed rows by branch
  const groupedByBranch = useMemo(() => {
    const map = new Map<string, InstallerSummaryRow[]>()
    for (const r of displayedRows) {
      if (!map.has(r.branchName)) map.set(r.branchName, [])
      map.get(r.branchName)!.push(r)
    }
    return map
  }, [displayedRows])

  // Grand totals computed on displayed rows
  const totals = useMemo(() => {
    let totalAmount = 0
    let totalCash = 0
    let totalOnline = 0
    let totalPrevSalary = 0
    let totalRelease = 0
    let holdAmount = 0

    for (const r of displayedRows) {
      totalAmount += r.amount
      totalCash += r.cash
      totalOnline += r.onlineTransfer
      totalPrevSalary += r.prevSalary
      totalRelease += r.totalForRelease
      if (r.status === 'HOLD') {
        holdAmount += r.amount
      }
    }

    const finalTotal = totalAmount - holdAmount
    // totalRelease already includes this cut-off's amount, so adding it to finalTotal counted the
    // current week twice. Grand total = this cut-off (less hold) + salary carried from the previous one.
    const grandTotal = finalTotal + totalPrevSalary

    return {
      totalAmount,
      totalCash,
      totalOnline,
      totalPrevSalary,
      totalRelease,
      holdAmount,
      finalTotal,
      grandTotal,
    }
  }, [displayedRows])

  // Copy table to clipboard
  const handleCopy = () => {
    const lines: string[] = []
    lines.push(`${region.toUpperCase()} PAYOUTS SUMMARY`)
    lines.push(`CUT-OFF DATE:\t${formatShortDate(weekFrom)} to ${formatShortDate(weekTo)}`)
    lines.push(`PAYOUT DATE:\t${payrollDateStr}`)
    lines.push('')
    lines.push([
      'BRANCH',
      'INSTALLER',
      'AMOUNT',
      'CASH',
      'ONLINE TRANSFER',
      'SALARY AMOUNT FROM PREVIOUS PAYOUT',
      'CASH ADVANCE FROM PREVIOUS SALARY ON-HOLD',
      'TOTAL AMOUNT OF SALARY FOR RELEASE THIS PAYOUT',
      'MOP',
      'ACCOUNT NO',
      'STATUS',
      'REMARKS',
      'SUB-TOTAL (CURRENT CUT-OFF ONLY)',
    ].join('\t'))

    for (const [, rows] of groupedByBranch.entries()) {
      const branchSubtotal = rows.reduce((s, r) => s + r.amount, 0)
      rows.forEach((r, idx) => {
        lines.push([
          r.branchName,
          r.installerName,
          r.amount.toFixed(2),
          r.cash ? r.cash.toFixed(2) : '',
          r.onlineTransfer ? r.onlineTransfer.toFixed(2) : '',
          r.prevSalary ? r.prevSalary.toFixed(2) : '',
          r.prevCashAdvance ? r.prevCashAdvance.toFixed(2) : '',
          r.totalForRelease ? r.totalForRelease.toFixed(2) : '',
          r.mop,
          r.accountNo,
          r.status,
          r.remarks,
          idx === 0 ? branchSubtotal.toFixed(2) : '',
        ].join('\t'))
      })
    }

    lines.push('')
    lines.push([
      'TOTALS',
      '',
      totals.totalAmount.toFixed(2),
      totals.totalCash.toFixed(2),
      totals.totalOnline.toFixed(2),
      totals.totalPrevSalary.toFixed(2),
      '',
      totals.totalRelease.toFixed(2),
      '',
      '',
      '',
      '',
      totals.totalAmount.toFixed(2),
    ].join('\t'))

    lines.push('')
    lines.push(`LESS HOLD (CURRENT CUT-OFF):\t${totals.holdAmount.toFixed(2)}`)
    lines.push(`FINAL TOTAL (CURRENT CUT-OFF):\t${totals.finalTotal.toFixed(2)}`)
    lines.push(`FROM PREVIOUS CUT-OFF:\t${totals.totalPrevSalary.toFixed(2)}`)
    lines.push(`GRAND TOTAL:\t${totals.grandTotal.toFixed(2)}`)

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Export as CSV
  const handleExportCSV = () => {
    const csvRows: string[] = []
    csvRows.push(`"${region.toUpperCase()} PAYOUTS SUMMARY"`)
    csvRows.push(`"CUT-OFF DATE: ${formatShortDate(weekFrom)} to ${formatShortDate(weekTo)}"`)
    csvRows.push(`"PAYOUT DATE: ${payrollDateStr}"`)
    csvRows.push('')
    csvRows.push([
      '"BRANCH"',
      '"INSTALLER"',
      '"AMOUNT"',
      '"CASH"',
      '"ONLINE TRANSFER"',
      '"SALARY AMOUNT FROM PREVIOUS PAYOUT"',
      '"CASH ADVANCE FROM PREVIOUS SALARY ON-HOLD"',
      '"TOTAL AMOUNT OF SALARY FOR RELEASE THIS PAYOUT"',
      '"MOP"',
      '"ACCOUNT NO"',
      '"STATUS"',
      '"REMARKS"',
      '"SUB-TOTAL (CURRENT CUT-OFF ONLY)"',
    ].join(','))

    for (const [, rows] of groupedByBranch.entries()) {
      const branchSubtotal = rows.reduce((s, r) => s + r.amount, 0)
      rows.forEach((r, idx) => {
        csvRows.push([
          `"${r.branchName}"`,
          `"${r.installerName}"`,
          `"${r.amount.toFixed(2)}"`,
          `"${r.cash ? r.cash.toFixed(2) : ''}"`,
          `"${r.onlineTransfer ? r.onlineTransfer.toFixed(2) : ''}"`,
          `"${r.prevSalary ? r.prevSalary.toFixed(2) : ''}"`,
          `"${r.prevCashAdvance ? r.prevCashAdvance.toFixed(2) : ''}"`,
          `"${r.totalForRelease ? r.totalForRelease.toFixed(2) : ''}"`,
          `"${r.mop}"`,
          `"${r.accountNo}"`,
          `"${r.status}"`,
          `"${r.remarks.replace(/"/g, '""')}"`,
          `"${idx === 0 ? branchSubtotal.toFixed(2) : ''}"`,
        ].join(','))
      })
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${region}_payouts_summary_${weekFrom}_${weekTo}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Print view
  const handlePrint = () => {
    window.print()
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[999999] w-screen h-screen flex flex-col bg-white dark:bg-slate-950 overflow-hidden animate-in fade-in duration-150">
      {/* Top executive toolbar */}
      <header
        className="px-3 sm:px-6 md:px-8 py-2.5 md:h-16 md:py-0 border-b shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 md:gap-4 print:hidden"
        style={{
          backgroundColor: isLight ? '#F8FAFC' : '#0B1324',
          borderColor: isLight ? '#E2E8F0' : '#1E2D48',
        }}
      >
        <div className="flex items-center justify-between gap-2 md:contents">
          {/* Region Switcher Tabs */}
          <div className="flex items-center gap-1.5 md:gap-2 p-1 rounded-xl border bg-black/5 dark:bg-white/5 overflow-x-auto hide-scrollbar">
            <button
              type="button"
              onClick={() => setRegion('north')}
              className={`flex items-center gap-1.5 md:gap-2.5 px-3 md:px-5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-black transition-all cursor-pointer whitespace-nowrap ${
                region === 'north'
                  ? 'bg-[#056434] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
              <span>NORTH</span>
              <span className="text-[10px] md:text-xs opacity-80 font-bold">(Fri-Thu)</span>
            </button>
            <button
              type="button"
              onClick={() => setRegion('south')}
              className={`flex items-center gap-1.5 md:gap-2.5 px-3 md:px-5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-black transition-all cursor-pointer whitespace-nowrap ${
                region === 'south'
                  ? 'bg-[#056434] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
              <span>SOUTH</span>
              <span className="text-[10px] md:text-xs opacity-80 font-bold">(Mon-Sun)</span>
            </button>
          </div>

          {/* Close button lives next to the region tabs on mobile so it's always reachable
              without scrolling the action-button row. */}
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-2 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            title="Close Summary (Esc)"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-slate-500 hover:text-slate-900 dark:hover:text-white" />
          </button>
        </div>

        {/* Action buttons — icon-only on mobile, horizontally scrollable so nothing clips */}
        <div className="flex items-center gap-2 md:gap-3 overflow-x-auto hide-scrollbar">
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 cursor-pointer shrink-0"
            style={{ borderColor: isLight ? '#CBD5E1' : '#243452' }}
            title="Refresh numbers from all branches"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer shadow-xs shrink-0"
            style={{ borderColor: isLight ? '#CBD5E1' : '#243452' }}
            title="Copy table formatted for Excel or Google Sheets"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">{copied ? 'Copied to Clipboard!' : 'Copy for Excel'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer shrink-0"
            style={{ borderColor: isLight ? '#CBD5E1' : '#243452' }}
            title="Download clean CSV spreadsheet"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-[#056434] hover:bg-[#04522a] text-white transition-all shadow-sm cursor-pointer shrink-0"
            title="Print sheet or save as PDF"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {Object.keys(overrides).length > 0 && (
            <button
              type="button"
              onClick={resetOverrides}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-rose-500 border border-rose-500/30 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
              title="Reset all manual cell edits to original calculated numbers"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Edits</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="hidden md:flex p-2 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-colors ml-2 cursor-pointer shrink-0"
            title="Close Summary (Esc)"
            aria-label="Close modal"
          >
            <X className="w-6 h-6 text-slate-500 hover:text-slate-900 dark:hover:text-white" />
          </button>
        </div>
      </header>

      {/* Main Full-Tab Content Area */}
      <main className="flex-1 overflow-auto p-6 sm:p-10 bg-white dark:bg-slate-950 font-sans print:p-0 print:overflow-visible">
        {/* Title Header Block */}
        <div className="mb-5 border-b pb-4 border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
              {region.toUpperCase()} PAYOUTS SUMMARY
            </h1>
            {selectedBranchFilter !== 'ALL' && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#056434]/10 text-[#056434] dark:bg-emerald-500/20 dark:text-emerald-400 border border-[#056434]/20">
                {selectedBranchFilter}
              </span>
            )}
          </div>

          {/* Cut-Off Date & Payroll Date right corner */}
          <div className="flex items-center gap-3 sm:gap-4 self-start md:self-center flex-wrap">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
              <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">
                CUT-OFF DATE:
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {weekFrom ? formatShortDate(weekFrom) : ''} to {weekTo ? formatShortDate(weekTo) : ''}
              </span>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs shadow-2xs">
              <span className="font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide text-[10px]">
                PAYOUT DATE:
              </span>
              <span className="font-bold text-emerald-800 dark:text-emerald-300">
                {payrollDateStr || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Branch Filter Tabs Bar */}
        <div className="mb-4 flex items-center justify-between gap-3 text-xs print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] mr-1">
              Filter Branch:
            </span>
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedBranchFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedBranchFilter === 'ALL'
                    ? 'bg-[#056434] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                All ({compiledRows.length})
              </button>
              {availableBranches.map(({ name, count }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedBranchFilter(name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedBranchFilter === name
                      ? 'bg-[#056434] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span>{name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                      selectedBranchFilter === name
                        ? 'bg-white/20 text-white'
                        : 'bg-black/10 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table Container — desktop/tablet only; phones get the card list below */}
        <div className="hidden md:block overflow-x-auto border border-black dark:border-slate-600 rounded-sm print:border-black bg-white dark:bg-slate-950">
          <table className="w-full border-collapse text-xs text-slate-900 dark:text-slate-100 min-w-[1300px]">
            <thead>
              {/* Dark Green Header Row (matching Excel) */}
              <tr className="bg-[#056434] text-white text-center border-b border-black font-bold text-xs uppercase tracking-wide">
                <th rowSpan={2} className="border border-black px-3 py-3 text-center w-[130px] font-bold">
                  BRANCH
                </th>
                <th rowSpan={2} className="border border-black px-4 py-3 text-left min-w-[220px] font-bold">
                  INSTALLER
                </th>
                <th rowSpan={2} className="border border-black px-3 py-3 text-right w-[125px] font-bold">
                  AMOUNT
                </th>
                <th rowSpan={2} className="border border-black px-2 py-3 text-right w-[100px] font-bold">
                  CASH
                </th>
                <th rowSpan={2} className="border border-black px-2 py-3 text-right w-[115px] font-bold leading-tight">
                  ONLINE<br />TRANSFER
                </th>
                {/* Yellow Previous Week On- Header */}
                <th colSpan={2} className="border border-black bg-[#FFFF00] text-black font-bold px-3 py-2 text-center text-xs tracking-wide">
                  PREVIOUS WEEK ON-
                </th>
                <th rowSpan={2} className="border border-black px-3 py-3 text-right w-[145px] font-bold leading-tight">
                  TOTAL AMOUNT OF<br />SALARY FOR RELEASE<br />THIS PAYOUT
                </th>
                <th rowSpan={2} className="border border-black px-2 py-3 text-center w-[85px] font-bold">
                  MOP
                </th>
                <th rowSpan={2} className="border border-black px-3 py-3 text-center w-[140px] font-bold">
                  ACCOUNT NO
                </th>
                <th rowSpan={2} className="border border-black px-2 py-3 text-center w-[95px] font-bold">
                  STATUS
                </th>
                <th rowSpan={2} className="border border-black px-3 py-3 text-left min-w-[140px] font-bold">
                  REMARKS
                </th>
                <th rowSpan={2} className="border border-black px-3 py-3 text-right w-[135px] font-bold leading-tight">
                  SUB-TOTAL<br />(CURRENT<br />CUT-OFF ONLY)
                </th>
              </tr>
              {/* Secondary Sub-Row for Yellow Header */}
              <tr className="bg-[#FFFF00] text-black font-bold text-[11px] text-center border-b border-black">
                <th className="border border-black px-2 py-2 w-[115px] leading-tight font-bold">
                  SALARY AMOUNT<br />FROM PREVIOUS<br />PAYOUT
                </th>
                <th className="border border-black px-2 py-2 w-[115px] leading-tight font-bold">
                  CASH ADVANCE<br />FROM PREVIOUS<br />SALARY ON-HOLD
                </th>
              </tr>
            </thead>

            <tbody>
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-slate-400 font-normal text-sm italic">
                    {loading ? 'Compiling payout numbers across all branch sheets…' : 'No payout entries match the selected filter.'}
                  </td>
                </tr>
              ) : (
                Array.from(groupedByBranch.entries()).map(([branchName, rows]) => {
                  const branchSubtotal = rows.reduce((s, r) => s + r.amount, 0)
                  return rows.map((r, idx) => {
                    const rowKey = `${r.branchId}-${r.installerName}`
                    const isHold = r.status === 'HOLD'

                    return (
                      <tr
                        key={rowKey}
                        className={`h-14 sm:h-16 hover:bg-slate-50/70 dark:hover:bg-slate-900/50 transition-colors ${
                          r.isHighlighted ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                        }`}
                      >
                        {/* BRANCH (Listed on each installer row) */}
                        <td className="border border-black dark:border-slate-600 px-3 py-3 text-center text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 uppercase whitespace-nowrap">
                          {r.branchName || branchName}
                        </td>

                        {/* INSTALLER (Bigger Name Font + Ticket History Link) */}
                        <td className="border border-black dark:border-slate-600 px-4 py-3 uppercase text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                          <button
                            type="button"
                            onClick={() => {
                              const emp = employees.find(e => {
                                const n = (e.name || '').trim().toUpperCase()
                                const nick = (e.nickname || '').trim().toUpperCase()
                                return n === r.installerName || (nick && nick === r.installerName) || n.includes(r.installerName) || r.installerName.includes(n)
                              })
                              setHistoryModalInstaller({
                                id: emp?.id || r.installerName,
                                name: emp?.name || r.installerName,
                                email: emp?.email || '',
                                jobTitle: emp?.jobTitle || 'INSTALLER',
                                branchName: r.branchName || branchName,
                              })
                            }}
                            className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition-colors text-left flex items-center gap-1.5 cursor-pointer group"
                            title={`Click to view ticket history for ${r.installerName}`}
                          >
                            <span>{r.installerName}</span>
                            <Wrench className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-emerald-500 transition-opacity shrink-0" />
                          </button>
                        </td>

                        {/* AMOUNT (Soft Yellow Highlight if HOLD) */}
                        <td
                          className={`border border-black dark:border-slate-600 px-3.5 py-3 text-right font-number text-sm sm:text-base font-normal ${
                            isHold ? 'bg-[#FEF08A] text-amber-950 dark:text-amber-200' : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {r.amount > 0 ? peso(r.amount) : ''}
                        </td>

                        {/* CASH (Editable) */}
                        <td className="border border-black dark:border-slate-600 p-1.5 text-right">
                          <input
                            type="text"
                            value={r.cash ? peso(r.cash) : ''}
                            onChange={e => {
                              const val = num(e.target.value)
                              updateRowOverride(rowKey, {
                                cash: val,
                                onlineTransfer: Math.max(0, r.amount - val),
                              })
                            }}
                            className="w-full h-9 text-right bg-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 rounded px-2 text-sm sm:text-base font-number font-normal outline-none transition-all text-slate-900 dark:text-slate-100"
                          />
                        </td>

                        {/* ONLINE TRANSFER (Editable) */}
                        <td className="border border-black dark:border-slate-600 p-1.5 text-right">
                          <input
                            type="text"
                            value={r.onlineTransfer ? peso(r.onlineTransfer) : ''}
                            onChange={e => updateRowOverride(rowKey, { onlineTransfer: num(e.target.value) })}
                            className="w-full h-9 text-right bg-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 rounded px-2 text-sm sm:text-base font-number font-normal outline-none transition-all text-slate-900 dark:text-slate-100"
                          />
                        </td>

                        {/* SALARY AMOUNT FROM PREVIOUS PAYROLL */}
                        <td className="border border-black dark:border-slate-600 p-1.5 text-right">
                          <input
                            type="text"
                            value={r.prevSalary ? peso(r.prevSalary) : ''}
                            onChange={e => {
                              const val = num(e.target.value)
                              updateRowOverride(rowKey, {
                                prevSalary: val,
                                totalForRelease: (r.status === 'HOLD' ? 0 : r.amount) + val - r.prevCashAdvance,
                              })
                            }}
                            className="w-full h-9 text-right bg-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 rounded px-2 text-sm sm:text-base font-number font-normal outline-none transition-all text-slate-900 dark:text-slate-100"
                          />
                        </td>

                        {/* CASH ADVANCE FROM PREVIOUS SALARY ON-HOLD */}
                        <td className="border border-black dark:border-slate-600 p-1.5 text-right">
                          <input
                            type="text"
                            value={r.prevCashAdvance ? peso(r.prevCashAdvance) : ''}
                            onChange={e => {
                              const val = num(e.target.value)
                              updateRowOverride(rowKey, {
                                prevCashAdvance: val,
                                totalForRelease: (r.status === 'HOLD' ? 0 : r.amount) + r.prevSalary - val,
                              })
                            }}
                            className="w-full h-9 text-right bg-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 rounded px-2 text-sm sm:text-base font-number font-normal outline-none transition-all text-slate-900 dark:text-slate-100"
                          />
                        </td>

                        {/* TOTAL FOR RELEASE */}
                        <td className="border border-black dark:border-slate-600 px-3.5 py-3 text-right font-number text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                          {r.totalForRelease > 0 ? peso(r.totalForRelease) : ''}
                        </td>

                        {/* MOP (Mode of Payment) */}
                        <td className="border border-black dark:border-slate-600 p-1.5 text-center">
                          <input
                            type="text"
                            value={r.mop}
                            onChange={e => updateRowOverride(rowKey, { mop: e.target.value.toUpperCase() })}
                            className="w-full h-9 text-center bg-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 rounded px-1 uppercase text-xs font-semibold outline-none transition-all text-slate-900 dark:text-slate-100"
                          />
                        </td>

                        {/* ACCOUNT NO */}
                        <td className="border border-black dark:border-slate-600 p-1.5 text-center">
                          <input
                            type="text"
                            value={r.accountNo}
                            onChange={e => updateRowOverride(rowKey, { accountNo: e.target.value })}
                            className="w-full h-9 text-center bg-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 rounded px-1.5 font-number text-xs sm:text-sm font-normal outline-none tracking-normal transition-all text-slate-900 dark:text-slate-100"
                          />
                        </td>

                        {/* STATUS */}
                        <td className="border border-black dark:border-slate-600 p-1.5 text-center">
                          <select
                            value={r.status}
                            onChange={e => {
                              const s = e.target.value as 'SENT' | 'PAID' | 'HOLD'
                              updateRowOverride(rowKey, {
                                status: s,
                                totalForRelease: s === 'HOLD' ? r.prevSalary : r.amount + r.prevSalary,
                                onlineTransfer: s === 'HOLD' ? 0 : Math.max(0, r.amount - r.cash),
                              })
                            }}
                            className={`h-8 px-2 rounded text-xs font-semibold border uppercase outline-none cursor-pointer transition-all ${
                              isHold
                                ? 'bg-[#FEF08A] text-amber-950 border-black font-bold'
                                : r.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-900 border-black'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-200 border-black dark:border-slate-700'
                            }`}
                          >
                            <option value="SENT">SENT</option>
                            <option value="PAID">PAID</option>
                            <option value="HOLD">HOLD</option>
                          </select>
                        </td>

                        {/* REMARKS */}
                        <td className="border border-black dark:border-slate-600 p-1.5 text-left">
                          <input
                            type="text"
                            value={r.remarks}
                            onChange={e => updateRowOverride(rowKey, { remarks: e.target.value })}
                            className="w-full h-9 bg-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 rounded px-2 text-xs font-normal outline-none transition-all text-slate-900 dark:text-slate-100"
                          />
                        </td>

                        {/* SUB-TOTAL (Merged per branch) */}
                        {idx === 0 ? (
                          <td
                            rowSpan={rows.length}
                            className="border border-black dark:border-slate-600 px-4 py-3 text-right font-number text-base sm:text-lg font-bold bg-slate-50/70 dark:bg-slate-900/40 align-middle text-slate-900 dark:text-slate-100"
                          >
                            ₱{peso(branchSubtotal)}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })
                })
              )}

              {/* Bottom Total Row */}
              {displayedRows.length > 0 && (
                <tr className="h-14 bg-slate-100 dark:bg-slate-900 border-t-2 border-b-2 border-black dark:border-slate-600 font-bold">
                  <td colSpan={2} className="border border-black dark:border-slate-600 px-4 py-3 text-center uppercase tracking-wider text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    TOTALS
                  </td>
                  <td className="border border-black dark:border-slate-600 px-3.5 py-3 text-right text-sm sm:text-base font-number font-bold text-slate-900 dark:text-slate-100">
                    {peso(totals.totalAmount)}
                  </td>
                  <td className="border border-black dark:border-slate-600 px-3.5 py-3 text-right font-number text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                    {totals.totalCash > 0 ? peso(totals.totalCash) : ''}
                  </td>
                  <td className="border border-black dark:border-slate-600 px-3.5 py-3 text-right font-number text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                    {totals.totalOnline > 0 ? peso(totals.totalOnline) : ''}
                  </td>
                  <td className="border border-black dark:border-slate-600 px-3.5 py-3 text-right font-number text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                    {totals.totalPrevSalary > 0 ? peso(totals.totalPrevSalary) : ''}
                  </td>
                  <td className="border border-black dark:border-slate-600 px-3.5 py-3 text-right font-number text-sm sm:text-base font-normal text-slate-400">
                  </td>
                  <td className="border border-black dark:border-slate-600 px-3.5 py-3 text-right font-number text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                    {totals.totalRelease > 0 ? peso(totals.totalRelease) : ''}
                  </td>
                  <td colSpan={4} className="border border-black dark:border-slate-600"></td>
                  <td className="border border-black dark:border-slate-600 px-4 py-3 text-right text-base sm:text-lg font-number font-bold bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white">
                    ₱{peso(totals.totalAmount)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List — phones only; the wide Excel-style table above doesn't fit a phone
            screen, so each installer becomes a compact, editable card grouped under its branch. */}
        <div className="md:hidden flex flex-col gap-5">
          {displayedRows.length === 0 ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm italic">
              {loading ? 'Compiling payout numbers across all branch sheets…' : 'No payout entries match the selected filter.'}
            </div>
          ) : (
            Array.from(groupedByBranch.entries()).map(([branchName, rows]) => {
              const branchSubtotal = rows.reduce((s, r) => s + r.amount, 0)
              return (
                <div key={branchName} className="flex flex-col gap-2.5">
                  {/* Branch header */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-5 rounded-full bg-[#056434] shrink-0" />
                      <span className="text-[13px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-100 truncate">
                        {branchName}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                        {rows.length}
                      </span>
                    </div>
                    <span className="text-sm font-black font-number text-[#056434] dark:text-emerald-400 shrink-0">
                      ₱{peso(branchSubtotal)}
                    </span>
                  </div>

                  {rows.map(r => {
                    const rowKey = `${r.branchId}-${r.installerName}`
                    const isHold = r.status === 'HOLD'
                    const hasPrevCarry = r.prevSalary > 0 || r.prevCashAdvance > 0

                    return (
                      <div
                        key={rowKey}
                        className={`rounded-2xl border overflow-hidden shadow-sm ${
                          isHold
                            ? 'border-amber-300 dark:border-amber-700'
                            : r.isHighlighted
                              ? 'border-emerald-300 dark:border-emerald-700'
                              : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {/* Name + status */}
                        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-900/60">
                          <button
                            type="button"
                            onClick={() => {
                              const emp = employees.find(e => {
                                const n = (e.name || '').trim().toUpperCase()
                                const nick = (e.nickname || '').trim().toUpperCase()
                                return n === r.installerName || (nick && nick === r.installerName) || n.includes(r.installerName) || r.installerName.includes(n)
                              })
                              setHistoryModalInstaller({
                                id: emp?.id || r.installerName,
                                name: emp?.name || r.installerName,
                                email: emp?.email || '',
                                jobTitle: emp?.jobTitle || 'INSTALLER',
                                branchName: r.branchName || branchName,
                              })
                            }}
                            className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 uppercase text-sm text-left min-w-0 cursor-pointer"
                          >
                            <span className="truncate">{r.installerName}</span>
                            <Wrench className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          </button>
                          <select
                            value={r.status}
                            onChange={e => {
                              const s = e.target.value as 'SENT' | 'PAID' | 'HOLD'
                              updateRowOverride(rowKey, {
                                status: s,
                                totalForRelease: s === 'HOLD' ? r.prevSalary : r.amount + r.prevSalary,
                                onlineTransfer: s === 'HOLD' ? 0 : Math.max(0, r.amount - r.cash),
                              })
                            }}
                            className={`h-7 px-2 rounded-full text-[10px] font-black border uppercase outline-none cursor-pointer transition-all shrink-0 ${
                              isHold
                                ? 'bg-[#FEF08A] text-amber-950 border-amber-400'
                                : r.status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            <option value="SENT">SENT</option>
                            <option value="PAID">PAID</option>
                            <option value="HOLD">HOLD</option>
                          </select>
                        </div>

                        {/* Amount hero */}
                        <div className={`flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 ${isHold ? 'bg-[#FEF9C3] dark:bg-amber-950/30' : 'bg-white dark:bg-slate-950'}`}>
                          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            This Cut-Off Amount
                          </span>
                          <span className={`text-lg font-black font-number ${isHold ? 'text-amber-900 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>
                            {r.amount > 0 ? `₱${peso(r.amount)}` : '—'}
                          </span>
                        </div>

                        {/* Cash / Online split */}
                        <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                          <label className="flex flex-col gap-1 px-4 py-2.5">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Cash</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.cash ? peso(r.cash) : ''}
                              placeholder="0.00"
                              onChange={e => {
                                const val = num(e.target.value)
                                updateRowOverride(rowKey, {
                                  cash: val,
                                  onlineTransfer: Math.max(0, r.amount - val),
                                })
                              }}
                              className="w-full bg-transparent outline-none text-sm font-number font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                            />
                          </label>
                          <label className="flex flex-col gap-1 px-4 py-2.5">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Online Transfer</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.onlineTransfer ? peso(r.onlineTransfer) : ''}
                              placeholder="0.00"
                              onChange={e => updateRowOverride(rowKey, { onlineTransfer: num(e.target.value) })}
                              className="w-full bg-transparent outline-none text-sm font-number font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                            />
                          </label>
                        </div>

                        {/* Previous cut-off carry — only worth a row when it actually applies */}
                        {(hasPrevCarry || isHold) && (
                          <div className="grid grid-cols-2 divide-x divide-amber-200 dark:divide-amber-900/60 border-t border-slate-200 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/20">
                            <label className="flex flex-col gap-1 px-4 py-2.5">
                              <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">Prev. Salary</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={r.prevSalary ? peso(r.prevSalary) : ''}
                                placeholder="0.00"
                                onChange={e => {
                                  const val = num(e.target.value)
                                  updateRowOverride(rowKey, {
                                    prevSalary: val,
                                    totalForRelease: (r.status === 'HOLD' ? 0 : r.amount) + val - r.prevCashAdvance,
                                  })
                                }}
                                className="w-full bg-transparent outline-none text-sm font-number font-semibold text-slate-900 dark:text-slate-100 placeholder:text-amber-300 dark:placeholder:text-amber-800"
                              />
                            </label>
                            <label className="flex flex-col gap-1 px-4 py-2.5">
                              <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">Prev. Cash Adv.</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={r.prevCashAdvance ? peso(r.prevCashAdvance) : ''}
                                placeholder="0.00"
                                onChange={e => {
                                  const val = num(e.target.value)
                                  updateRowOverride(rowKey, {
                                    prevCashAdvance: val,
                                    totalForRelease: (r.status === 'HOLD' ? 0 : r.amount) + r.prevSalary - val,
                                  })
                                }}
                                className="w-full bg-transparent outline-none text-sm font-number font-semibold text-slate-900 dark:text-slate-100 placeholder:text-amber-300 dark:placeholder:text-amber-800"
                              />
                            </label>
                          </div>
                        )}

                        {/* MOP / Account No */}
                        <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                          <label className="flex flex-col gap-1 px-4 py-2.5">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">MOP</span>
                            <input
                              type="text"
                              value={r.mop}
                              onChange={e => updateRowOverride(rowKey, { mop: e.target.value.toUpperCase() })}
                              className="w-full bg-transparent outline-none uppercase text-sm font-semibold text-slate-900 dark:text-slate-100"
                            />
                          </label>
                          <label className="flex flex-col gap-1 px-4 py-2.5">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Account No.</span>
                            <input
                              type="text"
                              value={r.accountNo}
                              onChange={e => updateRowOverride(rowKey, { accountNo: e.target.value })}
                              className="w-full bg-transparent outline-none text-sm font-number font-semibold text-slate-900 dark:text-slate-100"
                            />
                          </label>
                        </div>

                        {/* Remarks */}
                        <label className="flex flex-col gap-1 px-4 py-2.5 border-t border-slate-200 dark:border-slate-800">
                          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Remarks</span>
                          <input
                            type="text"
                            value={r.remarks}
                            placeholder="—"
                            onChange={e => updateRowOverride(rowKey, { remarks: e.target.value })}
                            className="w-full bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                          />
                        </label>

                        {/* Total for release footer */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-emerald-50 dark:bg-emerald-950/30">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            Total for Release
                          </span>
                          <span className="text-base font-black font-number text-emerald-700 dark:text-emerald-400">
                            {r.totalForRelease > 0 ? `₱${peso(r.totalForRelease)}` : '—'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Bottom Summary Breakdown — Excel-style table on desktop/print */}
        {displayedRows.length > 0 && (
          <div className="hidden md:block mt-8 print:block print:mt-6">
            <div className="w-full sm:w-[500px] border border-black dark:border-slate-600 bg-white dark:bg-slate-900 font-sans shadow-xs rounded-sm overflow-hidden text-sm">
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b border-black dark:border-slate-600 bg-[#BBF7D0] text-emerald-950 h-12">
                    <td className="px-5 py-3 font-bold uppercase text-xs sm:text-sm">
                      LESS HOLD (CURRENT CUT-OFF):
                    </td>
                    <td className="px-5 py-3 text-right font-number font-bold text-sm sm:text-base">
                      {peso(totals.holdAmount)}
                    </td>
                  </tr>
                  <tr className="border-b border-black dark:border-slate-600 h-12">
                    <td className="px-5 py-3 font-bold uppercase text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                      FINAL TOTAL (CURRENT CUT-OFF):
                    </td>
                    <td className="px-5 py-3 text-right font-number font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                      {peso(totals.finalTotal)}
                    </td>
                  </tr>
                  <tr className="border-b border-black dark:border-slate-600 h-12">
                    <td className="px-5 py-3 font-bold uppercase text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                      FROM PREVIOUS CUT-OFF:
                    </td>
                    <td className="px-5 py-3 text-right font-number font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                      {peso(totals.totalPrevSalary)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 h-14">
                    <td className="px-5 py-3.5 font-bold uppercase text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                      GRAND TOTAL:
                    </td>
                    <td className="px-5 py-3.5 text-right font-number font-bold text-emerald-700 dark:text-emerald-400 text-base sm:text-lg">
                      ₱{peso(totals.grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mobile Summary Card — same numbers, laid out as a receipt-style breakdown
            that ends in one unmissable grand-total banner instead of a cramped table. */}
        {displayedRows.length > 0 && (
          <div className="md:hidden print:hidden mt-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {region.toUpperCase()} Payout Breakdown
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 shrink-0">
                  <PauseCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Less Hold (Current Cut-Off)
                </span>
              </div>
              <span className="text-sm font-black font-number text-amber-700 dark:text-amber-400 shrink-0">
                {totals.holdAmount > 0 ? `-₱${peso(totals.holdAmount)}` : '₱0.00'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0">
                  <CircleDollarSign className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Final Total (Current Cut-Off)
                </span>
              </div>
              <span className="text-sm font-black font-number text-slate-900 dark:text-slate-100 shrink-0">
                ₱{peso(totals.finalTotal)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0">
                  <Wallet className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  From Previous Cut-Off
                </span>
              </div>
              <span className="text-sm font-black font-number text-slate-900 dark:text-slate-100 shrink-0">
                +₱{peso(totals.totalPrevSalary)}
              </span>
            </div>

            {/* Grand total banner */}
            <div className="flex items-center justify-between gap-3 px-4 py-4 bg-gradient-to-r from-[#056434] to-[#0a8a49]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15 shrink-0">
                  <Sparkles className="w-[18px] h-[18px] text-white" />
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Grand Total</span>
                  <span className="text-[10px] text-emerald-200/80">Ready for release</span>
                </div>
              </div>
              <span className="text-xl font-black font-number text-white shrink-0">
                ₱{peso(totals.grandTotal)}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* ── Installer Ticket History Modal ── */}
      <InstallerTicketHistoryModal
        installer={historyModalInstaller}
        isOpen={!!historyModalInstaller}
        onClose={() => setHistoryModalInstaller(null)}
      />
    </div>,
    document.body
  )
}
