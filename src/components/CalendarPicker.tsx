/**
 * CalendarPicker
 *
 * A fully custom date picker with a popup month calendar.
 * Replaces native <input type="date"> to avoid mobile overflow / blank issues.
 *
 * Props:
 *   value     - 'YYYY-MM-DD' string or ''
 *   onChange  - (v: string) => void
 *   min       - 'YYYY-MM-DD' minimum selectable date (defaults to today)
 *   isLight   - theme flag
 *   label     - optional label text (rendered above the trigger)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface CalendarPickerProps {
  value: string
  onChange: (v: string) => void
  min?: string
  isLight: boolean
  /**
   * Render the popup as a centered, safe-area-aware modal overlay instead of a dropdown
   * anchored under the trigger. Use on public/mobile-first pages where an anchored popup can
   * run off-screen or land under a notch/home indicator.
   */
  centered?: boolean
}

export default function CalendarPicker({ value, onChange, min, isLight, centered = false }: CalendarPickerProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const minDate = min ? new Date(min + 'T00:00:00') : today

  const parseValue = (v: string): Date | null => {
    if (!v) return null
    const d = new Date(v + 'T00:00:00')
    return isNaN(d.getTime()) ? null : d
  }

  const selectedDate = parseValue(value)

  const [viewYear, setViewYear] = useState(() => (selectedDate ?? today).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => (selectedDate ?? today).getMonth())

  useEffect(() => {
    if (selectedDate) {
      setViewYear(selectedDate.getFullYear())
      setViewMonth(selectedDate.getMonth())
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const prevMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 0) { setViewYear(y => y - 1); return 11 }
      return m - 1
    })
  }, [])

  const nextMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 11) { setViewYear(y => y + 1); return 0 }
      return m + 1
    })
  }, [])

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    if (d < minDate) return
    const yyyy = d.getFullYear()
    const mm   = String(d.getMonth() + 1).padStart(2, '0')
    const dd   = String(d.getDate()).padStart(2, '0')
    onChange(`${yyyy}-${mm}-${dd}`)
    setOpen(false)
  }

  const selectToday = () => {
    const y  = today.getFullYear()
    const m  = String(today.getMonth() + 1).padStart(2, '0')
    const d  = String(today.getDate()).padStart(2, '0')
    onChange(`${y}-${m}-${d}`)
    setOpen(false)
  }

  const isDayDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    return d < minDate
  }
  const isDaySelected = (day: number) =>
    !!selectedDate &&
    selectedDate.getFullYear() === viewYear &&
    selectedDate.getMonth()    === viewMonth &&
    selectedDate.getDate()     === day
  const isDayToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth()    === viewMonth &&
    today.getDate()     === day

  const displayLabel = selectedDate
    ? selectedDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Select a date'

  // ── Colours ────────────────────────────────────────────────────────────────
  const triggerBg     = isLight ? '#ffffff'  : '#121720'
  const triggerBorder = isLight ? '#e2e8f0'  : '#2C3440'
  const focusBorder   = '#10B981'
  const popupBg       = isLight ? '#ffffff'  : '#0A1120'
  const popupBorder   = isLight ? '#e2e8f0'  : '#1E2D48'
  const headBg        = isLight ? '#f8fafc'  : '#0F1A2E'
  const textMain      = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted     = isLight ? '#64748b'  : '#7A95B8'
  const hoverBg       = isLight ? '#f1f5f9'  : '#1a2c4a'
  const disabledColor = isLight ? '#CBD5E1'  : '#2D3F56'

  const popupBody = (
    <>
      {/* Header — Month / Year navigation */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: headBg, borderBottom: `1px solid ${popupBorder}` }}
      >
        <button
          type="button"
          onClick={prevMonth}
          className="p-2 rounded-xl transition-all hover:bg-[#10B981]/10 hover:text-[#10B981]"
          style={{ color: textMuted }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-sm font-bold" style={{ color: textMain }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>

        <button
          type="button"
          onClick={nextMonth}
          className="p-2 rounded-xl transition-all hover:bg-[#10B981]/10 hover:text-[#10B981]"
          style={{ color: textMuted }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week row */}
      <div className="grid grid-cols-7 px-3 pt-3">
        {DAY_NAMES.map(d => (
          <div
            key={d}
            className="text-center text-[11px] font-bold pb-1"
            style={{ color: textMuted }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 px-3 pb-3 gap-y-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />

          const disabled = isDayDisabled(day)
          const selected = isDaySelected(day)
          const isToday  = isDayToday(day)

          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => selectDay(day)}
              className="flex items-center justify-center h-9 w-full rounded-xl text-sm font-semibold transition-all"
              style={{
                color: disabled
                  ? disabledColor
                  : selected
                    ? '#ffffff'
                    : textMain,
                backgroundColor: selected ? '#10B981' : 'transparent',
                border: isToday && !selected ? '2px solid #10B981' : '2px solid transparent',
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxShadow: selected ? '0 2px 8px rgba(16,185,129,0.35)' : undefined,
              }}
              onMouseEnter={e => {
                if (!disabled && !selected)
                  (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg
              }}
              onMouseLeave={e => {
                if (!selected)
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
              }}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderTop: `1px solid ${popupBorder}` }}
      >
        <button
          type="button"
          onClick={selectToday}
          className="text-xs font-bold text-[#10B981] hover:text-emerald-400 transition-colors"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => { onChange(''); setOpen(false) }}
          className="text-xs font-bold transition-colors"
          style={{ color: textMuted }}
        >
          Clear
        </button>
      </div>
    </>
  )

  return (
    <div ref={wrapRef} className="relative w-full">

      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-sm transition-all"
        style={{
          backgroundColor: triggerBg,
          borderColor: open ? focusBorder : triggerBorder,
          boxShadow: open ? `0 0 0 3px ${focusBorder}22` : undefined,
          outline: 'none',
        }}
      >
        {/* Icon */}
        <Calendar
          className="w-4 h-4 shrink-0"
          style={{ color: open ? focusBorder : textMuted }}
        />

        {/* Display text */}
        <span
          className="flex-1 text-left font-medium"
          style={{ color: selectedDate ? textMain : textMuted }}
        >
          {displayLabel}
        </span>

        {/* Clear button */}
        {selectedDate && (
          <span
            role="button"
            tabIndex={0}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onChange('') }}
            onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onChange(''))}
            className="p-0.5 rounded-full transition-colors cursor-pointer"
            style={{ color: textMuted }}
          >
            <X className="w-3.5 h-3.5 hover:text-red-400" />
          </span>
        )}

        {/* Chevron */}
        <ChevronRight
          className="w-4 h-4 shrink-0 transition-transform duration-200"
          style={{
            color: textMuted,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* ── Popup ── */}
      {open && (centered ? (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setOpen(false)}
          />
          {/* Centered, safe-area-aware overlay */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top))',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
              paddingLeft: 'max(1rem, env(safe-area-inset-left))',
              paddingRight: 'max(1rem, env(safe-area-inset-right))',
            }}
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
              style={{ backgroundColor: popupBg, border: `1px solid ${popupBorder}` }}
              onClick={e => e.stopPropagation()}
            >
              {popupBody}
            </div>
          </div>
        </>
      ) : (
        <div
          className="absolute left-0 right-0 z-50 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            top: 'calc(100% + 6px)',
            backgroundColor: popupBg,
            border: `1px solid ${popupBorder}`,
          }}
        >
          {popupBody}
        </div>
      ))}
    </div>
  )
}
