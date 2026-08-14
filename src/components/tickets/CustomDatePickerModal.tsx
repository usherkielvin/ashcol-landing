import { useMemo, useCallback, useEffect } from 'react'
import ReactDOM from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { todayDateKey } from '../../utils/ticketHelpers'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function CustomDatePickerModal({
  isLight,
  calMonth,
  dateFilter,
  onSetCalMonth,
  onSelectDate,
  onClose,
}: {
  isLight: boolean
  calMonth: { year: number; month: number } | null
  dateFilter: string
  onSetCalMonth: (month: { year: number; month: number }) => void
  onSelectDate: (dateKey: string) => void
  onClose: () => void
}) {
  const cardBg = isLight ? '#ffffff' : '#0F172A'
  const border = isLight ? '#E2E8F0' : '#1E293B'
  const textPrimary = isLight ? '#0F172A' : '#F8FAFC'
  const textMuted = isLight ? '#64748B' : '#94A3B8'
  const inputBorder = isLight ? '#CBD5E1' : '#334155'
  const green = '#10B981'

  // Current calendar month view
  const currentYear = calMonth?.year ?? (dateFilter ? new Date(dateFilter + 'T00:00:00').getFullYear() : new Date().getFullYear())
  const currentMonth = calMonth?.month ?? (dateFilter ? new Date(dateFilter + 'T00:00:00').getMonth() : new Date().getMonth())

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Month & Year navigation
  const handlePrevMonth = useCallback(() => {
    const cur = new Date(currentYear, currentMonth, 1)
    cur.setMonth(cur.getMonth() - 1)
    onSetCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
  }, [currentYear, currentMonth, onSetCalMonth])

  const handleNextMonth = useCallback(() => {
    const cur = new Date(currentYear, currentMonth, 1)
    cur.setMonth(cur.getMonth() + 1)
    onSetCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
  }, [currentYear, currentMonth, onSetCalMonth])

  const handlePrevYear = useCallback(() => {
    onSetCalMonth({ year: currentYear - 1, month: currentMonth })
  }, [currentYear, currentMonth, onSetCalMonth])

  const handleNextYear = useCallback(() => {
    onSetCalMonth({ year: currentYear + 1, month: currentMonth })
  }, [currentYear, currentMonth, onSetCalMonth])

  // Generate calendar grid cells (including overflow padding days)
  const calendarCells = useMemo(() => {
    const firstDow = new Date(currentYear, currentMonth, 1).getDay()
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

    const cells: { day: number; dateKey: string; isCurrentMonth: boolean }[] = []

    // Previous month overflow days
    for (let i = firstDow - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      const prevDate = new Date(currentYear, currentMonth - 1, d)
      const y = prevDate.getFullYear()
      const m = String(prevDate.getMonth() + 1).padStart(2, '0')
      const dayStr = String(d).padStart(2, '0')
      cells.push({ day: d, dateKey: `${y}-${m}-${dayStr}`, isCurrentMonth: false })
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const y = currentYear
      const m = String(currentMonth + 1).padStart(2, '0')
      const dayStr = String(i).padStart(2, '0')
      cells.push({ day: i, dateKey: `${y}-${m}-${dayStr}`, isCurrentMonth: true })
    }

    // Next month overflow days to complete 35 or 42 grid
    const totalSlots = cells.length > 35 ? 42 : 35
    let nextDay = 1
    while (cells.length < totalSlots) {
      const nextDate = new Date(currentYear, currentMonth + 1, nextDay)
      const y = nextDate.getFullYear()
      const m = String(nextDate.getMonth() + 1).padStart(2, '0')
      const dayStr = String(nextDay).padStart(2, '0')
      cells.push({ day: nextDay, dateKey: `${y}-${m}-${dayStr}`, isCurrentMonth: false })
      nextDay++
    }

    return cells
  }, [currentYear, currentMonth])

  const todayKey = todayDateKey()

  // Year options for dropdown
  const yearOptions = useMemo(() => {
    const yCenter = new Date().getFullYear()
    const list: number[] = []
    for (let y = yCenter - 5; y <= yCenter + 5; y++) {
      list.push(y)
    }
    return list
  }, [])

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center p-4 select-none"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative rounded-2xl shadow-2xl overflow-hidden w-full max-w-[320px] border flex flex-col transition-all select-none"
        style={{
          backgroundColor: cardBg,
          borderColor: border,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header: Month & Year Selector with Navigation ── */}
        <div
          className="px-3 py-3 border-b flex items-center justify-between select-none"
          style={{ borderColor: border }}
        >
          <div className="flex items-center gap-0.5 select-none">
            <button
              type="button"
              onClick={handlePrevYear}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-500/10 active:scale-90 select-none cursor-pointer"
              style={{ color: textMuted }}
              title="Previous year"
            >
              <ChevronsLeft className="w-4 h-4 pointer-events-none select-none" />
            </button>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-500/10 active:scale-90 select-none cursor-pointer"
              style={{ color: textMuted }}
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4 pointer-events-none select-none" />
            </button>
          </div>

          {/* Month & Year Selectors */}
          <div className="flex items-center gap-1 select-none">
            <select
              value={currentMonth}
              onChange={(e) => onSetCalMonth({ year: currentYear, month: parseInt(e.target.value, 10) })}
              className="text-xs sm:text-sm font-bold bg-transparent outline-none cursor-pointer select-none rounded px-1 py-0.5 hover:bg-slate-500/10"
              style={{ color: textPrimary }}
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx} style={{ backgroundColor: cardBg, color: textPrimary }}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={currentYear}
              onChange={(e) => onSetCalMonth({ year: parseInt(e.target.value, 10), month: currentMonth })}
              className="text-xs sm:text-sm font-bold bg-transparent outline-none cursor-pointer select-none rounded px-1 py-0.5 hover:bg-slate-500/10"
              style={{ color: textPrimary }}
            >
              {yearOptions.map(y => (
                <option key={y} value={y} style={{ backgroundColor: cardBg, color: textPrimary }}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-0.5 select-none">
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-500/10 active:scale-90 select-none cursor-pointer"
              style={{ color: textMuted }}
              title="Next month"
            >
              <ChevronRight className="w-4 h-4 pointer-events-none select-none" />
            </button>
            <button
              type="button"
              onClick={handleNextYear}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-500/10 active:scale-90 select-none cursor-pointer"
              style={{ color: textMuted }}
              title="Next year"
            >
              <ChevronsRight className="w-4 h-4 pointer-events-none select-none" />
            </button>
          </div>
        </div>

        {/* ── Day-of-week headers ── */}
        <div className="grid grid-cols-7 px-3 pt-2.5 pb-1 select-none">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
            <div
              key={d}
              className="text-center text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider py-0.5 select-none"
              style={{ color: i === 0 || i === 6 ? `${green}cc` : textMuted }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* ── Days Grid ── */}
        <div className="grid grid-cols-7 gap-1 px-3 pb-3 select-none">
          {calendarCells.map(({ day, dateKey, isCurrentMonth }) => {
            const isToday = dateKey === todayKey
            const isSel = dateKey === dateFilter

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(dateKey)}
                className="relative w-full aspect-square flex items-center justify-center text-xs font-bold rounded-xl transition-all select-none hover:scale-105 active:scale-95 cursor-pointer"
                style={{
                  color: isSel
                    ? '#ffffff'
                    : isToday
                      ? green
                      : isCurrentMonth
                        ? textPrimary
                        : `${textMuted}60`,
                  backgroundColor: isSel ? green : 'transparent',
                  border: isToday && !isSel ? `1.5px solid ${green}` : '1.5px solid transparent',
                  fontWeight: isSel || isToday ? 800 : isCurrentMonth ? 600 : 400,
                  boxShadow: isSel ? '0 2px 8px rgba(16,185,129,0.35)' : undefined,
                }}
                draggable={false}
              >
                {day}
                {isToday && !isSel && (
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full select-none"
                    style={{ backgroundColor: green }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-end px-3 py-2.5 border-t select-none"
          style={{ borderColor: border }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:bg-slate-500/10 active:scale-95 select-none cursor-pointer"
            style={{ borderColor: inputBorder, color: textMuted }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
