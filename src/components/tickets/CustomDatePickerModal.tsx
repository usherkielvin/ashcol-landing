import { useState, useMemo, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { ChevronDown, X, Calendar as CalendarIcon, Check } from 'lucide-react'
import { todayDateKey, formatDateKeyLabel } from '../../utils/ticketHelpers'

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

  // Custom Dropdown Open States
  const [monthMenuOpen, setMonthMenuOpen] = useState(false)
  const [yearMenuOpen, setYearMenuOpen] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (monthMenuOpen || yearMenuOpen) {
          setMonthMenuOpen(false)
          setYearMenuOpen(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [monthMenuOpen, yearMenuOpen, onClose])

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMonthMenuOpen(false)
        setYearMenuOpen(false)
      }
    }
    if (monthMenuOpen || yearMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [monthMenuOpen, yearMenuOpen])

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

  // Year options for custom dropdown
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
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative rounded-2xl shadow-2xl overflow-hidden w-full max-w-[420px] border flex flex-col transition-all select-none animate-in fade-in zoom-in-95 duration-150"
        style={{
          backgroundColor: cardBg,
          borderColor: border,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Top Header ── */}
        <div
          className="px-5 py-3.5 border-b flex items-center justify-between select-none"
          style={{ borderColor: border }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: isLight ? '#dcfce7' : 'rgba(16,185,129,0.15)', color: green }}
            >
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight" style={{ color: textPrimary }}>
                Select Custom Date
              </h3>
              <p className="text-xs font-semibold" style={{ color: textMuted }}>
                {dateFilter ? formatDateKeyLabel(dateFilter) : 'No date selected'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-500/10 text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Month & Year Custom Dropdown Selectors ── */}
        <div
          ref={menuContainerRef}
          className="px-5 py-3 border-b flex items-center justify-center gap-3 relative select-none"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0a1120' }}
        >
          {/* Month Selector Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setYearMenuOpen(false)
                setMonthMenuOpen(o => !o)
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-bold transition-all hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
              style={{
                backgroundColor: cardBg,
                borderColor: monthMenuOpen ? green : inputBorder,
                color: textPrimary,
              }}
            >
              <span>{MONTH_NAMES[currentMonth]}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 opacity-60 ${monthMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Custom Month Dropdown Menu */}
            {monthMenuOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-48 max-h-60 overflow-y-auto rounded-xl border shadow-xl z-50 p-1.5 flex flex-col gap-0.5 animate-in fade-in duration-100"
                style={{
                  backgroundColor: cardBg,
                  borderColor: border,
                }}
              >
                {MONTH_NAMES.map((m, idx) => {
                  const isSel = idx === currentMonth
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        onSetCalMonth({ year: currentYear, month: idx })
                        setMonthMenuOpen(false)
                      }}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-left"
                      style={{
                        backgroundColor: isSel ? (isLight ? '#dcfce7' : 'rgba(16,185,129,0.18)') : 'transparent',
                        color: isSel ? green : textPrimary,
                      }}
                    >
                      <span>{m}</span>
                      {isSel && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Year Selector Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMonthMenuOpen(false)
                setYearMenuOpen(o => !o)
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-bold transition-all hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
              style={{
                backgroundColor: cardBg,
                borderColor: yearMenuOpen ? green : inputBorder,
                color: textPrimary,
              }}
            >
              <span>{currentYear}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 opacity-60 ${yearMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Custom Year Dropdown Menu */}
            {yearMenuOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-32 max-h-60 overflow-y-auto rounded-xl border shadow-xl z-50 p-1.5 flex flex-col gap-0.5 animate-in fade-in duration-100"
                style={{
                  backgroundColor: cardBg,
                  borderColor: border,
                }}
              >
                {yearOptions.map(y => {
                  const isSel = y === currentYear
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        onSetCalMonth({ year: y, month: currentMonth })
                        setYearMenuOpen(false)
                      }}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-left"
                      style={{
                        backgroundColor: isSel ? (isLight ? '#dcfce7' : 'rgba(16,185,129,0.18)') : 'transparent',
                        color: isSel ? green : textPrimary,
                      }}
                    >
                      <span>{y}</span>
                      {isSel && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Day-of-week headers ── */}
        <div className="grid grid-cols-7 px-5 pt-3.5 pb-1.5 select-none">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
            <div
              key={d}
              className="text-center text-xs font-black uppercase tracking-wider py-1 select-none"
              style={{ color: i === 0 || i === 6 ? `${green}ee` : textMuted }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* ── Days Grid ── */}
        <div className="grid grid-cols-7 gap-1.5 px-5 pb-4 select-none">
          {calendarCells.map(({ day, dateKey, isCurrentMonth }) => {
            const isToday = dateKey === todayKey
            const isSel = dateKey === dateFilter

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(dateKey)}
                className="relative w-full aspect-square flex items-center justify-center text-sm font-bold rounded-xl transition-all select-none hover:scale-105 active:scale-95 cursor-pointer"
                style={{
                  color: isSel
                    ? '#ffffff'
                    : isToday
                      ? green
                      : isCurrentMonth
                        ? textPrimary
                        : `${textMuted}55`,
                  backgroundColor: isSel ? green : isToday ? (isLight ? '#dcfce7' : 'rgba(16,185,129,0.15)') : 'transparent',
                  border: isToday && !isSel ? `1.5px solid ${green}` : '1.5px solid transparent',
                  fontWeight: isSel || isToday ? 900 : isCurrentMonth ? 700 : 400,
                  boxShadow: isSel ? '0 4px 12px rgba(16,185,129,0.4)' : undefined,
                }}
                draggable={false}
              >
                {day}
                {isToday && !isSel && (
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full select-none"
                    style={{ backgroundColor: green }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t select-none"
          style={{ borderColor: border }}
        >
          <button
            type="button"
            onClick={() => {
              onSelectDate(todayKey)
            }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all hover:bg-slate-500/10 active:scale-95 select-none cursor-pointer"
            style={{ color: green }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/10 active:scale-95 select-none cursor-pointer"
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
