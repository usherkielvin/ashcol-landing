import React from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { ReschedDialogState } from '../types'
import {
  formatDateKeyLabel,
  getCustomerDisplayName,
  getPreferredDateKey,
  todayDateKey,
} from '../../../utils/ticketHelpers'

const MONTH_NAMES_RESCHED = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const YEARS_LIST = Array.from({ length: 7 }, (_, i) => 2024 + i)

export interface RescheduleDialogProps {
  reschedDialog: ReschedDialogState | null
  reschedToDate: string
  setReschedToDate: (d: string) => void
  reschedPending: boolean
  setReschedPending: (p: boolean) => void
  reschedRemarks: string
  setReschedRemarks: (r: string) => void
  reschedCalMonth: { year: number; month: number } | null
  setReschedCalMonth: (m: { year: number; month: number } | null) => void
  dateFilter: string
  cardBg: string
  border: string
  inputBg: string
  inputBorder: string
  isLight: boolean
  textPrimary: string
  textMuted: string
  green: string
  onClose: () => void
  onConfirm: () => void
}

export const RescheduleDialog: React.FC<RescheduleDialogProps> = ({
  reschedDialog,
  reschedToDate,
  setReschedToDate,
  reschedPending,
  setReschedPending,
  reschedRemarks,
  setReschedRemarks,
  reschedCalMonth,
  setReschedCalMonth,
  dateFilter,
  cardBg,
  border,
  inputBg,
  inputBorder,
  isLight,
  textPrimary,
  textMuted,
  green,
  onClose,
  onConfirm,
}) => {
  if (!reschedDialog) return null

  const todayKey = todayDateKey()
  const currentSchedDate = getPreferredDateKey(reschedDialog.ticket) || dateFilter || todayKey
  const fallback = new Date(`${currentSchedDate}T00:00:00`)
  const validFallback = !isNaN(fallback.getTime()) ? fallback : new Date()
  const calYear = reschedCalMonth?.year ?? validFallback.getFullYear()
  const calMonth = reschedCalMonth?.month ?? validFallback.getMonth()
  const calKey = `resched-cal-${reschedDialog.ticket.id}`
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDow = new Date(calYear, calMonth, 1).getDay()
  const selLabel = reschedToDate ? formatDateKeyLabel(reschedToDate) : ''
  const currentSchedLabel = currentSchedDate ? formatDateKeyLabel(currentSchedDate) : ''
  const ticketNo = reschedDialog.ticket.ticketNumber || reschedDialog.ticket.controlNumber || ''

  return (
    <div
      key={calKey}
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl shadow-2xl overflow-visible flex flex-col"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: border }}>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black tracking-tight" style={{ color: textPrimary }}>
                Reschedule Appointment
              </h3>
              {ticketNo && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-500/10 text-slate-400">
                  {ticketNo}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold mt-0.5 truncate max-w-[300px]" style={{ color: textMuted }}>
              {getCustomerDisplayName(reschedDialog.ticket)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-500/10 text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="px-5 py-2.5 border-b flex items-center justify-between gap-2" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0a1120' }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold" style={{ color: textMuted }}>Currently:</span>
            <span className="font-bold text-[11px] px-2 py-0.5 rounded bg-slate-500/10 truncate" style={{ color: textPrimary }}>
              {currentSchedLabel || 'Unscheduled'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-semibold" style={{ color: textMuted }}>New:</span>
            {reschedPending ? (
              <span className="font-bold text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                Pending (No Slot)
              </span>
            ) : reschedToDate ? (
              <span className="font-black text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                {selLabel}
              </span>
            ) : (
              <span className="text-[11px] italic" style={{ color: textMuted }}>Select a date →</span>
            )}
          </div>
        </div>

        {/* Month & Year Dropdowns */}
        <div
          className="px-5 py-3 border-b grid grid-cols-2 gap-3 relative"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0a1120' }}
        >
          {/* Month Custom Dropdown */}
          <div className="relative" id={`resched-month-dd-${calKey}`}>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`resched-month-menu-${calKey}`)
                if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none'
                const yr = document.getElementById(`resched-year-menu-${calKey}`)
                if (yr) yr.style.display = 'none'
              }}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
            >
              <span>{MONTH_NAMES_RESCHED[calMonth]}</span>
              <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
            </button>
            <div
              id={`resched-month-menu-${calKey}`}
              className="absolute left-0 top-full mt-2 w-full max-h-56 overflow-y-auto rounded-xl border shadow-2xl z-[200] p-1.5 flex-col gap-0.5"
              style={{ display: 'none', backgroundColor: cardBg, borderColor: border }}
            >
              {MONTH_NAMES_RESCHED.map((m, idx) => {
                const isSel = idx === calMonth
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setReschedCalMonth({ year: calYear, month: idx })
                      const el = document.getElementById(`resched-month-menu-${calKey}`)
                      if (el) el.style.display = 'none'
                    }}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-left"
                    style={{
                      backgroundColor: isSel ? (isLight ? '#dcfce7' : 'rgba(16,185,129,0.18)') : 'transparent',
                      color: isSel ? green : textPrimary,
                    }}
                  >
                    <span>{m}</span>
                    {isSel && <span className="text-emerald-500 text-sm leading-none">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Year Custom Dropdown */}
          <div className="relative" id={`resched-year-dd-${calKey}`}>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`resched-year-menu-${calKey}`)
                if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none'
                const mo = document.getElementById(`resched-month-menu-${calKey}`)
                if (mo) mo.style.display = 'none'
              }}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}
            >
              <span>{calYear}</span>
              <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
            </button>
            <div
              id={`resched-year-menu-${calKey}`}
              className="absolute left-0 top-full mt-2 w-full max-h-56 overflow-y-auto rounded-xl border shadow-2xl z-[200] p-1.5 flex-col gap-0.5"
              style={{ display: 'none', backgroundColor: cardBg, borderColor: border }}
            >
              {YEARS_LIST.map(y => {
                const isSel = y === calYear
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setReschedCalMonth({ year: y, month: calMonth })
                      const el = document.getElementById(`resched-year-menu-${calKey}`)
                      if (el) el.style.display = 'none'
                    }}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer text-left"
                    style={{
                      backgroundColor: isSel ? (isLight ? '#dcfce7' : 'rgba(16,185,129,0.18)') : 'transparent',
                      color: isSel ? green : textPrimary,
                    }}
                  >
                    <span>{y}</span>
                    {isSel && <span className="text-emerald-500 text-sm leading-none">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="px-5 pt-3.5 pb-2" style={{ opacity: reschedPending ? 0.35 : 1, pointerEvents: reschedPending ? 'none' : 'auto' }}>
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 mb-1.5 text-center">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
              <div key={d} className="text-xs font-black py-0.5 select-none uppercase tracking-wider" style={{ color: i === 0 || i === 6 ? `${green}cc` : textMuted }}>
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = dKey === todayKey
              const isSel = dKey === reschedToDate
              const isCurrent = dKey === currentSchedDate
              return (
                <button
                  key={dKey}
                  type="button"
                  onClick={() => { setReschedToDate(dKey); setReschedPending(false) }}
                  className="relative w-full aspect-square flex items-center justify-center text-sm font-bold rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  style={{
                    color: isSel ? '#fff' : isCurrent ? green : isToday ? green : textPrimary,
                    backgroundColor: isSel ? green : isCurrent ? (isLight ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.15)') : isToday ? (isLight ? '#f0fdf4' : 'rgba(16,185,129,0.08)') : 'transparent',
                    border: (isCurrent || isToday) && !isSel ? `1.5px solid ${green}` : '1.5px solid transparent',
                    boxShadow: isSel ? '0 4px 12px rgba(16,185,129,0.4)' : undefined,
                    fontWeight: isSel || isCurrent || isToday ? 900 : 700,
                  }}
                >
                  {day}
                  {isToday && !isSel && (
                    <span
                      className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: green }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Pending Slot Toggle */}
        <div className="px-5 pb-2">
          <label
            className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
            style={{
              backgroundColor: reschedPending ? (isLight ? '#fef3c7' : 'rgba(245,158,11,0.10)') : inputBg,
              borderColor: reschedPending ? '#f59e0b' : inputBorder,
            }}
          >
            <input
              type="checkbox"
              checked={reschedPending}
              onChange={e => {
                setReschedPending(e.target.checked)
                if (e.target.checked) setReschedToDate('')
              }}
              className="mt-0.5 rounded"
            />
            <div>
              <span className="text-xs font-bold block" style={{ color: textPrimary }}>
                No date slot available yet — Mark as Pending
              </span>
              <span className="text-[11px] block mt-0.5 leading-snug" style={{ color: textMuted }}>
                Ticket stays in queue until a new slot is confirmed.
              </span>
            </div>
          </label>
        </div>

        {/* Remarks / Reason with Quick Chips */}
        <div className="px-5 pb-3 pt-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>
            Reason for Reschedule <span className="text-amber-500">*</span>
          </label>
          <input
            type="text"
            value={reschedRemarks}
            onChange={e => setReschedRemarks(e.target.value.toUpperCase())}
            placeholder="E.G. CLIENT REQUEST / HINDI MATAWAGAN"
            className="w-full px-3 py-2 text-xs font-bold rounded-xl border outline-none uppercase placeholder:normal-case placeholder:font-normal"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-end gap-2.5 border-t" style={{ borderColor: border }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors hover:bg-slate-500/10 cursor-pointer"
            style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!reschedPending && !reschedToDate.trim()}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40 shadow-sm cursor-pointer"
            style={{ backgroundColor: green }}
          >
            {reschedPending ? 'Mark as Pending' : 'Confirm Reschedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
