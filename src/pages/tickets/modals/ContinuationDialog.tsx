import React from 'react'
import type { ContinuationDialogState } from '../types'
import {
  formatSimpleDateShort,
  getCustomerDisplayName,
  getPreferredDateKey,
  todayDateKey,
} from '../../../utils/ticketHelpers'

export interface ContinuationDialogProps {
  continuationDialog: ContinuationDialogState | null
  continuationSelectedDates: string[]
  setContinuationSelectedDates: React.Dispatch<React.SetStateAction<string[]>>
  continuationCalMonth: { year: number; month: number } | null
  setContinuationCalMonth: (m: { year: number; month: number } | null) => void
  dateFilter: string
  cardBg: string
  border: string
  inputBorder: string
  isLight: boolean
  textPrimary: string
  textMuted: string
  green: string
  onClose: () => void
  onConfirm: () => void
}

export const ContinuationDialog: React.FC<ContinuationDialogProps> = ({
  continuationDialog,
  continuationSelectedDates,
  setContinuationSelectedDates,
  continuationCalMonth,
  setContinuationCalMonth,
  dateFilter,
  cardBg,
  border,
  inputBorder,
  isLight,
  textPrimary,
  textMuted,
  green,
  onClose,
  onConfirm,
}) => {
  if (!continuationDialog) return null

  const todayKey = todayDateKey()
  const preferredKey = getPreferredDateKey(continuationDialog.ticket) || dateFilter || todayKey
  const fallback = new Date(`${preferredKey}T00:00:00`)
  const validFallback = !isNaN(fallback.getTime()) ? fallback : new Date()
  const calYear = continuationCalMonth?.year ?? validFallback.getFullYear()
  const calMonth = continuationCalMonth?.month ?? validFallback.getMonth()
  const calKey = `continuation-cal-${continuationDialog.ticket.id}`
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDow = new Date(calYear, calMonth, 1).getDay()
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  const goMonth = (delta: number) => {
    const cur = new Date(calYear, calMonth, 1)
    cur.setMonth(cur.getMonth() + delta)
    setContinuationCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
  }

  const toggleDate = (dKey: string) => {
    setContinuationSelectedDates(prev => {
      if (prev.includes(dKey)) {
        return prev.filter(d => d !== dKey)
      } else {
        return [...prev, dKey].sort()
      }
    })
  }

  return (
    <div
      key={calKey}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b" style={{ borderColor: border }}>
          <h3 className="text-sm font-black" style={{ color: textPrimary }}>Set Continuation Dates</h3>
          <p className="text-xs mt-1" style={{ color: textMuted }}>
            {getCustomerDisplayName(continuationDialog.ticket)}
          </p>
          <p className="text-[10px] mt-1 font-medium" style={{ color: textMuted }}>
            Past and future dates can be selected.
          </p>
        </div>

        {/* Selected Dates Badges */}
        <div className="px-4 py-2 bg-slate-500/5 border-b flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto" style={{ borderColor: border }}>
          {continuationSelectedDates.length === 0 ? (
            <span className="text-[11px] text-slate-400 font-medium py-0.5">No continuation dates selected. Click on the calendar below to toggle dates.</span>
          ) : (
            continuationSelectedDates.map(d => {
              const label = formatSimpleDateShort(d)
              return (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition-colors"
                  style={{
                    color: isLight ? '#4f46e5' : '#a5b4fc',
                    backgroundColor: isLight ? '#e0e7ff' : 'rgba(79,70,229,0.18)',
                    border: `1px solid ${isLight ? '#c7d2fe' : 'rgba(79,70,229,0.35)'}`,
                  }}
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => toggleDate(d)}
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-indigo-500/20 text-[9px] font-extrabold ml-1 cursor-pointer"
                  >
                    x
                  </button>
                </span>
              )
            })
          )}
        </div>

        {/* Calendar */}
        <div className="px-4 pt-4 pb-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold"
              style={{ color: textMuted, backgroundColor: 'transparent', cursor: 'pointer' }}
            >
              &lt;
            </button>
            <span className="text-xs font-bold" style={{ color: textPrimary }}>{monthLabel}</span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold"
              style={{ color: textMuted, backgroundColor: 'transparent', cursor: 'pointer' }}
            >
              &gt;
            </button>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: textMuted }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-y-0.5 mb-1">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = dKey === todayKey
              const isSel = continuationSelectedDates.includes(dKey)
              return (
                <button
                  key={dKey}
                  type="button"
                  onClick={() => toggleDate(dKey)}
                  className="relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-full transition-all"
                  style={{
                    color: isSel ? '#fff' : isToday ? green : textPrimary,
                    backgroundColor: isSel ? '#4f46e5' : 'transparent',
                    cursor: 'pointer',
                    fontWeight: isToday && !isSel ? 800 : 600,
                  }}
                >
                  {day}
                  {isToday && !isSel && (
                    <span
                      className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{ backgroundColor: green }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-end gap-2 border-t" style={{ borderColor: border }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer"
            style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: '#4f46e5' }}
          >
            Save Continuation
          </button>
        </div>
      </div>
    </div>
  )
}
