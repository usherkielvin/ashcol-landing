import { useState, useEffect, useCallback } from 'react'
import {
  BarChart2, RefreshCw, CalendarDays, TrendingUp, TrendingDown,
  AlertTriangle, X, Receipt, ChevronRight, FileText,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface AuditRow {
  branchName: string
  timeUploaded: string | null
  status: string
  grossSales: number
  targetDailyQuota: number
  difference: number
  remarks: string
  cohPreviousDay: number
  fundFromHo: number
  cashReturns: number
  totalCohCfd: number
  totalCashCollection: number
  totalOnlineCollection: number
  payrollExpenses: number
  totalExpenses: number
  totalUnitsInstalledServiced: number
  totalCancelled: number
  totalUnitsFreeInstall: number
  forCollection: number
  rebatesForCollection: number
}

interface DrilldownItem {
  type: string
  description: string
  amount: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Component ────────────────────────────────────────────────────────────────

export default function DailyAuditReport() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'
  const rowHover    = isLight ? '#f1f5f9'  : '#0f1e36'

  const [rows, setRows]           = useState<AuditRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0])
  const [drilldown, setDrilldown] = useState<{ branchName: string; items: DrilldownItem[] } | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const role = (user?.role || '').toLowerCase()
  const isManagerOrStaff = role === 'manager' || role === 'staff'

  const fetchAudit = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/audit-summary?date=${date}`, {
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
  }, [date])

  useEffect(() => { fetchAudit() }, [fetchAudit])

  const openDrilldown = async (branchName: string) => {
    setDrillLoading(true)
    setDrilldown({ branchName, items: [] })
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/items?branchName=${encodeURIComponent(branchName)}&date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const items = await res.json()
        setDrilldown({ branchName, items })
      }
    } catch {
      setDrilldown({ branchName, items: [] })
    } finally {
      setDrillLoading(false)
    }
  }

  // Totals row
  const totals = rows.reduce(
    (acc, r) => ({
      grossSales: acc.grossSales + r.grossSales,
      targetDailyQuota: acc.targetDailyQuota + r.targetDailyQuota,
      totalCohCfd: acc.totalCohCfd + r.totalCohCfd,
      totalCashCollection: acc.totalCashCollection + r.totalCashCollection,
      totalOnlineCollection: acc.totalOnlineCollection + r.totalOnlineCollection,
      totalExpenses: acc.totalExpenses + r.totalExpenses,
      forCollection: acc.forCollection + r.forCollection,
      rebatesForCollection: acc.rebatesForCollection + r.rebatesForCollection,
    }),
    { grossSales: 0, targetDailyQuota: 0, totalCohCfd: 0, totalCashCollection: 0, totalOnlineCollection: 0, totalExpenses: 0, forCollection: 0, rebatesForCollection: 0 }
  )

  const columns = [
    { key: 'branch',           label: 'BRANCH' },
    { key: 'time',             label: 'TIME UPLOADED' },
    { key: 'status',           label: 'STATUS' },
    { key: 'grossSales',       label: 'GROSS SALES' },
    { key: 'target',           label: 'TARGET DAILY QUOTA' },
    { key: 'difference',       label: 'DIFFERENCE' },
    { key: 'remarks',          label: 'REMARKS' },
    { key: 'coh',              label: 'COH (PREV. DAY)' },
    { key: 'fundHo',           label: 'FUND FROM HO' },
    { key: 'cashReturns',      label: 'CASH RETURNS' },
    { key: 'totalCohCfd',      label: 'TOTAL COH/CFD' },
    { key: 'cashColl',         label: 'TOTAL CASH COLLECTION' },
    { key: 'onlineColl',       label: 'TOTAL ONLINE COLLECTION' },
    { key: 'totalExp',         label: 'TOTAL EXPENSES' },
    { key: 'units',            label: 'TOTAL UNITS INSTALLED/SERVICED' },
    { key: 'cancelled',        label: 'TOTAL CANCELLED' },
    { key: 'freeInstall',      label: 'TOTAL UNITS FREE INSTALL' },
    { key: 'forColl',          label: 'FOR COLLECTION' },
    { key: 'rebates',          label: 'REBATES FOR COLLECTION' },
  ]

  return (
    <div className="flex flex-col gap-5 pb-8">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #10B981, transparent)' }} />
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#10B981' }}>
            Finance Hub
          </p>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            All-Branch Daily Audit Report
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            Real-time branch quota monitoring &amp; financial reconciliation
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Date picker */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
          >
            <CalendarDays className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
            <input
              id="audit-date-picker"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="bg-transparent outline-none text-xs"
              style={{ color: textPrimary }}
            />
          </div>

          <button
            id="audit-refresh-btn"
            type="button"
            onClick={fetchAudit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Manager/Staff: Quick Submit CTA ────────────────────────── */}
      {isManagerOrStaff && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between gap-4"
          style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
              <FileText className="w-4 h-4" style={{ color: '#10B981' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: textPrimary }}>Submit Today's Branch Report</p>
              <p className="text-xs" style={{ color: textMuted }}>Click to open the Daily Sales &amp; Expenses encoder</p>
            </div>
          </div>
          <a
            href="/daily-report"
            id="submit-daily-report-btn"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:scale-105"
            style={{ backgroundColor: '#10B981' }}
          >
            Open Form <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* ── Summary KPI Strip ───────────────────────────────────────── */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Gross Sales',       value: peso(totals.grossSales),        color: '#3B82F6', icon: BarChart2 },
            { label: 'Total Cash Collected',    value: peso(totals.totalCashCollection), color: '#10B981', icon: TrendingUp },
            { label: 'Total Online Collected',  value: peso(totals.totalOnlineCollection), color: '#8B5CF6', icon: TrendingUp },
            { label: 'Total Expenses',          value: peso(totals.totalExpenses),      color: '#EF4444', icon: TrendingDown },
          ].map((k, i) => {
            const Icon = k.icon
            return (
              <div
                key={i}
                className="rounded-2xl p-4 relative overflow-hidden"
                style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              >
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: k.color }} />
                <div className="flex items-center justify-between mb-3 pl-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${k.color}18`, color: k.color }}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="pl-2">
                  <div className="text-lg font-black tracking-tight" style={{ color: k.color }}>₱{k.value}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textMuted }}>{k.label}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Audit Table ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}` }}>
          <BarChart2 className="w-4 h-4" style={{ color: '#10B981' }} />
          <h3 className="font-black text-sm" style={{ color: textPrimary }}>Branch Audit — {new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
          <span
            className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color: '#10B981', backgroundColor: 'rgba(16,185,129,0.12)' }}
          >
            {rows.length} Branches
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
            <p className="text-sm font-semibold" style={{ color: textMuted }}>No reports found for this date</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '1600px' }}>
              <thead>
                <tr style={{ backgroundColor: inputBg, borderBottom: `2px solid ${border}` }}>
                  <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider sticky left-0 z-10" style={{ color: textMuted, backgroundColor: inputBg }}>#</th>
                  {columns.map(col => (
                    <th key={col.key} className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider whitespace-nowrap" style={{ color: textMuted }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isAbove  = row.remarks === 'ABOVE QUOTA'
                  const noReport = row.status === 'NO REPORT'
                  return (
                    <tr
                      key={idx}
                      id={`audit-row-${idx}`}
                      style={{ borderBottom: `1px solid ${border}` }}
                      className="transition-colors cursor-pointer"
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = rowHover)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      onClick={() => openDrilldown(row.branchName)}
                    >
                      {/* Row # */}
                      <td className="px-3 py-3 font-bold sticky left-0" style={{ color: textMuted, backgroundColor: cardBg }}>{idx + 1}</td>

                      {/* Branch */}
                      <td className="px-3 py-3 font-black whitespace-nowrap" style={{ color: textPrimary }}>{row.branchName}</td>

                      {/* Time */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>{row.timeUploaded || '—'}</td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full font-bold text-[10px] uppercase whitespace-nowrap"
                          style={noReport
                            ? { backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }
                            : { backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }
                          }
                        >
                          {noReport ? 'No Report' : 'Checked'}
                        </span>
                      </td>

                      {/* Gross Sales */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: textPrimary }}>₱{peso(row.grossSales)}</td>

                      {/* Target Quota */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#8B5CF6', fontWeight: 700 }}>₱{peso(row.targetDailyQuota)}</td>

                      {/* Difference */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className="px-2 py-0.5 rounded font-black"
                          style={{ color: isAbove ? '#10B981' : '#EF4444' }}
                        >
                          {isAbove ? '+' : ''}₱{peso(row.difference)}
                        </span>
                      </td>

                      {/* Remarks — traffic light */}
                      <td className="px-3 py-3">
                        <span
                          className="px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider whitespace-nowrap"
                          style={noReport
                            ? { backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                            : isAbove
                              ? { backgroundColor: 'rgba(16,185,129,0.18)', color: '#10B981' }
                              : { backgroundColor: 'rgba(239,68,68,0.18)', color: '#EF4444' }
                          }
                        >
                          {noReport ? 'No Report' : row.remarks}
                        </span>
                      </td>

                      {/* COH Prev Day */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>₱{peso(row.cohPreviousDay)}</td>
                      {/* Fund from HO */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>₱{peso(row.fundFromHo)}</td>
                      {/* Cash Returns */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>₱{peso(row.cashReturns)}</td>
                      {/* Total COH/CFD */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: textPrimary }}>₱{peso(row.totalCohCfd)}</td>

                      {/* Cash Collection */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: '#10B981' }}>₱{peso(row.totalCashCollection)}</td>
                      {/* Online Collection */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: '#3B82F6' }}>₱{peso(row.totalOnlineCollection)}</td>

                      {/* Total Expenses — clickable */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap">
                        <button
                          id={`expense-drilldown-${idx}`}
                          onClick={e => { e.stopPropagation(); openDrilldown(row.branchName) }}
                          className="flex items-center gap-1 transition-opacity hover:opacity-80"
                          style={{ color: '#EF4444' }}
                        >
                          ₱{peso(row.totalExpenses)}
                          <Receipt className="w-3 h-3" />
                        </button>
                      </td>

                      {/* Units */}
                      <td className="px-3 py-3 text-center font-bold" style={{ color: textPrimary }}>{row.totalUnitsInstalledServiced}</td>
                      {/* Cancelled */}
                      <td className="px-3 py-3 text-center" style={{ color: row.totalCancelled > 0 ? '#EF4444' : textMuted }}>{row.totalCancelled}</td>
                      {/* Free Install */}
                      <td className="px-3 py-3 text-center" style={{ color: textMuted }}>{row.totalUnitsFreeInstall}</td>

                      {/* For Collection */}
                      <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: '#F59E0B' }}>₱{peso(row.forCollection)}</td>
                      {/* Rebates */}
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: textMuted }}>₱{peso(row.rebatesForCollection)}</td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Totals footer */}
              <tfoot>
                <tr style={{ borderTop: `2px solid ${border}`, backgroundColor: inputBg }}>
                  <td className="px-3 py-3" colSpan={4} />
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#3B82F6' }}>₱{peso(totals.grossSales)}</td>
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#8B5CF6' }}>₱{peso(totals.targetDailyQuota)}</td>
                  <td colSpan={5} />
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#10B981' }}>₱{peso(totals.totalCashCollection)}</td>
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#3B82F6' }}>₱{peso(totals.totalOnlineCollection)}</td>
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#EF4444' }}>₱{peso(totals.totalExpenses)}</td>
                  <td colSpan={3} />
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: '#F59E0B' }}>₱{peso(totals.forCollection)}</td>
                  <td className="px-3 py-3 font-black text-[11px] whitespace-nowrap" style={{ color: textMuted }}>₱{peso(totals.rebatesForCollection)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Total For Collection Banner ─────────────────────────────── */}
      {!loading && totals.forCollection > 0 && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between"
          style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <span className="text-sm font-bold uppercase tracking-wider" style={{ color: '#F59E0B' }}>Total for Collection</span>
          <span className="text-xl font-black" style={{ color: '#F59E0B' }}>₱{peso(totals.forCollection)}</span>
        </div>
      )}

      {/* ── Drilldown Modal ─────────────────────────────────────────── */}
      {drilldown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={() => setDrilldown(null)}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl w-full max-w-lg flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4" style={{ color: '#10B981' }} />
                <h4 className="font-black text-sm" style={{ color: textPrimary }}>{drilldown.branchName} — Expense Detail</h4>
              </div>
              <button
                id="drilldown-close-btn"
                onClick={() => setDrilldown(null)}
                className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400"
                style={{ color: textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5">
              {drillLoading ? (
                <div className="flex flex-col gap-2">
                  {[1,2,3].map(i => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ backgroundColor: inputBg }} />)}
                </div>
              ) : drilldown.items.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <Receipt className="w-8 h-8 opacity-20" style={{ color: textMuted }} />
                  <p className="text-sm" style={{ color: textMuted }}>No expense items recorded</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${border}` }}>
                      {['Type', 'Description', 'Amount'].map(h => (
                        <th key={h} className="pb-2 text-left text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drilldown.items.map((item, i) => {
                      const typeColor = item.type === 'EXPENSE' ? '#EF4444' : item.type === 'PURCHASE' ? '#F59E0B' : item.type === 'CASH_SALE' ? '#10B981' : '#3B82F6'
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                          <td className="py-2.5 pr-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ backgroundColor: `${typeColor}18`, color: typeColor }}>
                              {item.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-xs" style={{ color: textPrimary }}>{item.description}</td>
                          <td className="py-2.5 font-black text-xs whitespace-nowrap" style={{ color: typeColor }}>₱{peso(item.amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
