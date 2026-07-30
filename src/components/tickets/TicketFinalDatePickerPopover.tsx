import ReactDOM from 'react-dom'
import { X, CalendarDays } from 'lucide-react'
import {
  type Ticket,
  todayDateKey,
  formatDateKeyLabel,
  getCustomerDisplayName,
} from '../../utils/ticketHelpers'

export function TicketFinalDatePickerPopover({
  picker,
  calMonth,
  isLight,
  isMyTickets,
  onSetCalMonth,
  onPickDate,
  onClose,
  onCommit,
  onClear,
}: {
  picker: { ticket: Ticket; x: number; y: number; value: string; preferredDate: string }
  calMonth: { year: number; month: number } | null
  isLight: boolean
  isMyTickets: boolean
  onSetCalMonth: (month: { year: number; month: number }) => void
  onPickDate: (dateKey: string) => void
  onClose: () => void
  onCommit: (ticket: Ticket, value: string) => void
  onClear: (ticket: Ticket) => void
}) {
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const green = '#16A34A'

  const { ticket, x, y, value, preferredDate } = picker
  const todayKey = todayDateKey()
  const fallback = new Date(`${todayKey}T00:00:00`)
  const calYear = calMonth?.year ?? fallback.getFullYear()
  const calMonthIdx = calMonth?.month ?? fallback.getMonth()
  const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate()
  const firstDow = new Date(calYear, calMonthIdx, 1).getDay()
  const monthLabel = new Date(calYear, calMonthIdx, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  const selLabel = value ? formatDateKeyLabel(value) : ''
  const preferredLabel = preferredDate ? formatDateKeyLabel(preferredDate) : ''
  const goMonth = (delta: number) => {
    const cur = new Date(calYear, calMonthIdx, 1)
    cur.setMonth(cur.getMonth() + delta)
    onSetCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
  }
  const atTodayMonth = false
  const pickDate = (dateKey: string) => {
    onPickDate(dateKey)
  }
  const commitFinalDate = () => {
    if (!value.trim()) return
    const pickerTicket = ticket
    onClose()
    onCommit(pickerTicket, value)
  }
  const clearFinalDate = () => {
    const pickerTicket = ticket
    onClose()
    onClear(pickerTicket)
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[12000]" onClick={onClose}>
      <div
        className="fixed w-[min(18rem,calc(100vw-1rem))] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          left: x,
          top: y,
          backgroundColor: cardBg,
          border: `1px solid ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(74,222,128,0.3)'}`,
          maxHeight: 'min(420px, 75vh)',
          boxShadow: isLight
            ? '0 12px 28px -6px rgba(15,23,42,0.18), 0 8px 12px -8px rgba(15,23,42,0.12)'
            : '0 12px 28px -6px rgba(0,0,0,0.55)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="px-3 py-2.5 flex items-start justify-between gap-2 shrink-0"
          style={{
            borderBottom: `1px solid ${isLight ? 'rgba(22,163,74,0.2)' : 'rgba(74,222,128,0.2)'}`,
            backgroundColor: isLight ? 'rgba(22,163,74,0.08)' : 'rgba(16,185,129,0.1)',
          }}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: isLight ? '#166534' : '#6EE7B7' }}>
              Final schedule date
            </p>
            <p className="text-[11px] font-bold truncate mt-0.5" style={{ color: textPrimary }}>
              {getCustomerDisplayName(ticket)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-500/10 shrink-0"
            style={{ color: textMuted }}
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {preferredLabel && (
          <div
            className="px-3 py-2 shrink-0"
            style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
          >
            <p className="text-[9px] font-black uppercase tracking-[0.12em] mb-1.5" style={{ color: textMuted }}>
              Customer preferred date
            </p>
            <button
              type="button"
              onClick={() => {
                pickDate(preferredDate)
                const d = new Date(`${preferredDate}T00:00:00`)
                onSetCalMonth({ year: d.getFullYear(), month: d.getMonth() })
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors"
              style={{
                borderColor: value === preferredDate
                  ? (isLight ? 'rgba(22,163,74,0.45)' : 'rgba(110,231,183,0.45)')
                  : inputBorder,
                backgroundColor: value === preferredDate
                  ? (isLight ? 'rgba(22,163,74,0.1)' : 'rgba(16,185,129,0.14)')
                  : (isLight ? '#ffffff' : inputBg),
              }}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
                <span className="text-[11px] font-bold truncate" style={{ color: textPrimary }}>
                  {preferredLabel}
                </span>
              </span>
              {value === preferredDate && (
                <span className="text-[9px] font-black uppercase shrink-0" style={{ color: green }}>Selected</span>
              )}
            </button>
          </div>
        )}

        <div className="px-3 pt-2.5 pb-1 flex-1 overflow-y-auto">
          <div className="mb-2 text-center">
            <span className="text-[11px] font-extrabold tracking-tight" style={{ color: value ? green : textMuted }}>
              {value ? selLabel : 'Pick a date below'}
            </span>
          </div>

          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <button
              type="button"
              onClick={() => !atTodayMonth && goMonth(-1)}
              disabled={atTodayMonth}
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                color: atTodayMonth ? (isLight ? '#cbd5e1' : '#2d3f5a') : textMuted,
                cursor: atTodayMonth ? 'not-allowed' : 'pointer',
              }}
            >
              &lt;
            </button>
            <span className="text-[11px] font-bold" style={{ color: textPrimary }}>{monthLabel}</span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
              style={{ color: textMuted }}
            >
              &gt;
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-[9px] font-bold py-0.5" style={{ color: textMuted }}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`fd-empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dKey = `${calYear}-${String(calMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              // Past dates are selectable — a ticket's schedule date can be moved to any
              // date, including catching up a record that should have been on an earlier day.
              const past = false
              const isToday = dKey === todayKey
              const isSel = dKey === value
              const isPreferred = Boolean(preferredDate && dKey === preferredDate)
              return (
                <button
                  key={dKey}
                  type="button"
                  disabled={past}
                  onClick={() => pickDate(dKey)}
                  className="relative w-full aspect-square flex items-center justify-center text-[11px] font-semibold rounded-full transition-all"
                  style={{
                    color: isSel ? '#fff' : past ? (isLight ? '#cbd5e1' : '#2d3f5a') : isToday ? green : textPrimary,
                    backgroundColor: isSel ? green : isPreferred && !isSel ? (isLight ? 'rgba(22,163,74,0.12)' : 'rgba(16,185,129,0.16)') : 'transparent',
                    border: isPreferred && !isSel ? `1px dashed ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(110,231,183,0.35)'}` : '1px solid transparent',
                    cursor: past ? 'not-allowed' : 'pointer',
                    fontWeight: isToday && !isSel ? 800 : 600,
                  }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>

        <div
          className="px-3 py-2 flex items-center justify-between gap-2 border-t shrink-0"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
        >
          <button
            type="button"
            onClick={() => pickDate(todayKey)}
            className="text-[10px] font-bold transition-colors"
            style={{ color: green }}
          >
            Today
          </button>
          <div className="flex items-center gap-1.5">
            {!isMyTickets && value.trim() && (
              <button
                type="button"
                onClick={clearFinalDate}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border"
                style={{ borderColor: isLight ? '#fca5a5' : 'rgba(239,68,68,0.35)', color: isLight ? '#b91c1c' : '#fca5a5', backgroundColor: 'transparent' }}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold border"
              style={{ borderColor: inputBorder, color: textMuted, backgroundColor: 'transparent' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitFinalDate}
              disabled={!value.trim()}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white disabled:opacity-40"
              style={{ backgroundColor: green }}
            >
              Set Date
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
