import React from 'react'
import ReactDOM from 'react-dom'
import { CalendarRange, Loader2, X } from 'lucide-react'
import type { Employee } from '../types'
import {
  SCHEDULE_CLOSING_OPTS,
  SCHEDULE_PENDING_OPTS,
  getScheduleStatusBadgeStyle,
} from '../../../utils/ticketHelpers'

export interface MonthFilterModalProps {
  open: boolean
  onClose: () => void
  activeBranchLabel?: string
  monthFilterMonth: string
  setMonthFilterMonth: (val: string) => void
  monthFilterNegotiatorId: string
  setMonthFilterNegotiatorId: (val: string) => void
  monthFilterNegotiatorOptions: Employee[]
  formatNegotiatorLabel: (emp: Employee) => string
  monthFilterStatus: string
  setMonthFilterStatus: (val: string) => void
  monthFilterError: string | null
  monthFilterLoading: boolean
  runMonthFilterQuery: () => void
  isLight: boolean
  cardBg: string
  border: string
  green: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
}

export const MonthFilterModal: React.FC<MonthFilterModalProps> = ({
  open,
  onClose,
  activeBranchLabel,
  monthFilterMonth,
  setMonthFilterMonth,
  monthFilterNegotiatorId,
  setMonthFilterNegotiatorId,
  monthFilterNegotiatorOptions,
  formatNegotiatorLabel,
  monthFilterStatus,
  setMonthFilterStatus,
  monthFilterError,
  monthFilterLoading,
  runMonthFilterQuery,
  isLight,
  cardBg,
  border,
  green,
  textPrimary,
  textMuted,
  inputBg,
  inputBorder,
}) => {
  if (!open) return null

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-2xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col border overflow-hidden shrink-0"
        style={{ backgroundColor: cardBg, borderColor: border }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ backgroundColor: isLight ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.18)' }}
            >
              <CalendarRange className="w-4 h-4" style={{ color: green }} strokeWidth={2.1} />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide" style={{ color: textPrimary }}>Schedule Filters</div>
              <div className="text-[10px] font-medium" style={{ color: textMuted }}>
                {activeBranchLabel || 'All branches'}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter controls */}
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-col gap-1 sm:w-56 shrink-0">
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                Month
              </label>
              <input
                type="month"
                value={monthFilterMonth}
                onChange={e => setMonthFilterMonth(e.target.value)}
                className="h-10 px-3 rounded-xl border text-sm font-semibold outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                Negotiator
              </label>
              <select
                value={monthFilterNegotiatorId}
                onChange={e => setMonthFilterNegotiatorId(e.target.value)}
                className="h-10 px-3 rounded-xl border text-sm font-semibold outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                title={activeBranchLabel ? `Negotiators for ${activeBranchLabel}` : 'Filter by negotiator'}
              >
                <option value="">All negotiators</option>
                {monthFilterNegotiatorOptions.map(emp => (
                  <option key={emp.id} value={emp.id}>{formatNegotiatorLabel(emp)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status â€” wide pill grid with colored dots */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
              Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: '', label: 'All statuses' },
                { value: 'PENDING_GROUP', label: 'All Pending' },
                { value: 'CLOSING_GROUP', label: 'All Closing' },
              ].map(opt => {
                const active = monthFilterStatus === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMonthFilterStatus(opt.value)}
                    className="px-3 h-8 rounded-full text-[11px] font-black uppercase tracking-wide transition-colors border"
                    style={active
                      ? { backgroundColor: green, borderColor: green, color: '#ffffff' }
                      : { backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {([
              { title: 'PENDING', opts: SCHEDULE_PENDING_OPTS },
              { title: 'CLOSING', opts: SCHEDULE_CLOSING_OPTS },
            ] as const).map(section => (
              <div key={section.title} className="flex flex-col gap-1.5">
                <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>
                  {section.title}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {section.opts.map(opt => {
                    const active = monthFilterStatus === opt.value
                    const style = getScheduleStatusBadgeStyle(opt.value, isLight)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMonthFilterStatus(active ? '' : opt.value)}
                        className="flex items-center gap-2 px-2.5 h-9 rounded-lg text-left transition-colors border min-w-0"
                        style={active
                          ? { backgroundColor: green, borderColor: green }
                          : { backgroundColor: 'transparent', borderColor: inputBorder }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0 border"
                          style={active
                            ? { backgroundColor: '#ffffff', borderColor: '#ffffff' }
                            : { backgroundColor: style.color, borderColor: style.borderColor }}
                        />
                        <span
                          className="text-[10.5px] font-bold uppercase tracking-wide truncate"
                          style={{ color: active ? '#ffffff' : textPrimary }}
                        >
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {monthFilterError && (
            <div className="text-xs font-semibold text-red-500">{monthFilterError}</div>
          )}
          <button
            type="button"
            onClick={runMonthFilterQuery}
            disabled={monthFilterLoading || !monthFilterMonth}
            className="h-10 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2 shrink-0"
            style={{ backgroundColor: green }}
          >
            {monthFilterLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loadingâ€¦
              </>
            ) : 'Apply'}
          </button>
          <p className="text-[11px] leading-relaxed" style={{ color: textMuted }}>
            Loads every ticket scheduled that month for this branch straight into the table below â€”
            narrow by negotiator and/or status. Click a day chip above (or pick a custom date) to go
            back to the normal single-day view.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
