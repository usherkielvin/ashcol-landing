import { useState, useEffect } from 'react'
import {
  BarChart2, Clock, CheckCircle, TrendingUp,
  Zap, Users, RefreshCw, Target, Award,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { fetchBranchPerformance, fetchEfficiencyMetrics } from '../services/analyticsService'
import DateRangeFilter, { type DateRange, buildDateRange } from '../components/DateRangeFilter'

// ── Types ────────────────────────────────────────────────────────────────────

interface EfficiencyMetrics {
  totalTickets: number
  completedTickets: number
  cancelledTickets: number
  pendingTickets: number
  resolutionRate: number       // % completed / total
  avgDispatchMins: number      // PENDING → ASSIGNED
  avgCompletionHours: number   // ASSIGNED → COMPLETED
  aiAssignedTickets: number
  manuallyAssigned: number
}

interface BranchPerf {
  branchName: string
  total: number
  completed: number
  pending: number
  resolutionRate: number
}

// Simple bar width util
function barWidth(value: number, max: number) {
  if (!max) return 0
  return Math.min(100, (value / max) * 100)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const [metrics, setMetrics] = useState<EfficiencyMetrics | null>(null)
  const [branchPerf, setBranchPerf] = useState<BranchPerf[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [dateRange, setDateRange] = useState<DateRange>(buildDateRange('ALL'))

  const fetchData = async (range?: DateRange) => {
    const r = range ?? dateRange
    setLoading(true)
    try {
      const [eff, branches] = await Promise.all([
        fetchEfficiencyMetrics(r.from, r.to),
        fetchBranchPerformance(r.from, r.to),
      ])
      setMetrics(eff as EfficiencyMetrics)
      setBranchPerf(branches as BranchPerf[])
      setLastRefresh(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Re-fetch when date range changes
  useEffect(() => { fetchData(dateRange) }, [dateRange])

  const kpiCards = metrics ? [
    {
      label: 'Total Tickets',
      value: metrics.totalTickets,
      sub: 'All time',
      color: '#3B82F6',
      icon: BarChart2,
    },
    {
      label: 'Resolution Rate',
      value: `${metrics.resolutionRate.toFixed(1)}%`,
      sub: `${metrics.completedTickets} completed`,
      color: '#10B981',
      icon: CheckCircle,
    },
    {
      label: 'Avg Dispatch Time',
      value: metrics.avgDispatchMins < 60
        ? `${metrics.avgDispatchMins.toFixed(0)}m`
        : `${(metrics.avgDispatchMins / 60).toFixed(1)}h`,
      sub: 'PENDING → ASSIGNED',
      color: '#F59E0B',
      icon: Clock,
    },
    {
      label: 'Avg Completion',
      value: `${metrics.avgCompletionHours.toFixed(1)}h`,
      sub: 'ASSIGNED → COMPLETED',
      color: '#8B5CF6',
      icon: Target,
    },
  ] : []

  const maxBranchTotal = Math.max(...branchPerf.map(b => b.total), 1)

  return (
    <div className="flex flex-col gap-5 pb-8">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #3B82F6, transparent)' }} />
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#3B82F6' }}>
            Analytics
          </p>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>
            SOP Efficiency Metrics
          </h2>
          <p className="text-sm" style={{ color: textMuted }}>
            Last refreshed: {lastRefresh.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <button
            type="button"
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs border transition-all hover:scale-105 shrink-0"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading
          ? [1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }} />
            ))
          : kpiCards.map((k, i) => {
              const Icon = k.icon
              return (
                <div
                  key={i}
                  className="rounded-2xl p-4 md:p-5 relative overflow-hidden"
                  style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
                >
                  <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: k.color }} />
                  <div className="flex items-center justify-between mb-3 pl-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${k.color}18`, color: k.color }}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="pl-2">
                    <div className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: k.color }}>
                      {k.value}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textMuted }}>
                      {k.label}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: textMuted }}>{k.sub}</div>
                  </div>
                </div>
              )
            })}
      </div>

      {/* ── AI vs Manual Dispatch + Resolution Breakdown ────────── */}
      {metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* AI vs Manual Assignment */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}` }}>
              <Zap className="w-4 h-4" style={{ color: '#10B981' }} />
              <h3 className="font-black text-sm" style={{ color: textPrimary }}>AI vs Manual Assignment</h3>
              <span className="text-[10px] font-bold ml-auto uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ color: '#10B981', backgroundColor: 'rgba(16,185,129,0.12)' }}>SOP #2.1</span>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {[
                { label: 'AI Auto-Assigned', value: metrics.aiAssignedTickets, color: '#10B981', total: metrics.completedTickets || 1 },
                { label: 'Manually Assigned', value: metrics.manuallyAssigned,  color: '#3B82F6', total: metrics.completedTickets || 1 },
              ].map(row => {
                const pct = metrics.completedTickets > 0
                  ? Math.round((row.value / metrics.completedTickets) * 100)
                  : 0
                return (
                  <div key={row.label}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{row.label}</span>
                      <span className="text-xs font-black" style={{ color: row.color }}>{row.value} <span style={{ color: textMuted }}>({pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: inputBg }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: row.color }}
                      />
                    </div>
                  </div>
                )
              })}

              <div className="mt-2 p-3 rounded-xl" style={{ backgroundColor: inputBg }}>
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 shrink-0" style={{ color: '#F59E0B' }} />
                  <p className="text-xs" style={{ color: textMuted }}>
                    AI agent handles{' '}
                    <strong style={{ color: textPrimary }}>
                      {metrics.completedTickets > 0
                        ? Math.round((metrics.aiAssignedTickets / metrics.completedTickets) * 100)
                        : 0}%
                    </strong>{' '}
                    of assignments automatically (threshold: score &gt; 85).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Ticket Status Breakdown */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}` }}>
              <TrendingUp className="w-4 h-4" style={{ color: '#8B5CF6' }} />
              <h3 className="font-black text-sm" style={{ color: textPrimary }}>Ticket Status Breakdown</h3>
              <span className="text-[10px] font-bold ml-auto uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ color: '#8B5CF6', backgroundColor: 'rgba(139,92,246,0.12)' }}>SOP #4</span>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {[
                { label: 'Completed',  value: metrics.completedTickets,  color: '#10B981' },
                { label: 'Pending',    value: metrics.pendingTickets,     color: '#F59E0B' },
                { label: 'Cancelled',  value: metrics.cancelledTickets,   color: '#EF4444' },
              ].map(row => {
                const pct = metrics.totalTickets > 0
                  ? Math.round((row.value / metrics.totalTickets) * 100)
                  : 0
                return (
                  <div key={row.label}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs font-semibold" style={{ color: textPrimary }}>{row.label}</span>
                      <span className="text-xs font-black" style={{ color: row.color }}>{row.value} <span style={{ color: textMuted }}>({pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: inputBg }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: row.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Branch Performance Table ─────────────────────────── */}
      {branchPerf.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}` }}>
            <Users className="w-4 h-4" style={{ color: '#06B6D4' }} />
            <h3 className="font-black text-sm" style={{ color: textPrimary }}>Branch Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  {['Branch', 'Total', 'Completed', 'Pending', 'Resolution Rate', 'Volume'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branchPerf.map((b, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: `1px solid ${border}` }}
                    className="transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = inputBg)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td className="px-5 py-3.5 font-bold" style={{ color: textPrimary }}>{b.branchName}</td>
                    <td className="px-5 py-3.5 font-semibold" style={{ color: textPrimary }}>{b.total}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-bold" style={{ color: '#10B981' }}>{b.completed}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span style={{ color: b.pending > 0 ? '#F59E0B' : textMuted }}>{b.pending}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="font-black"
                        style={{ color: b.resolutionRate >= 80 ? '#10B981' : b.resolutionRate >= 50 ? '#F59E0B' : '#EF4444' }}
                      >
                        {b.resolutionRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 w-40">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: inputBg }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${barWidth(b.total, maxBranchTotal)}%`, backgroundColor: '#3B82F6' }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state when loading */}
      {loading && !metrics && (
        <div className="flex flex-col gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-48 rounded-2xl animate-pulse" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }} />
          ))}
        </div>
      )}
    </div>
  )
}
