import React from 'react'
import ReactDOM from 'react-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import {
  SCHEDULE_CLOSING_OPTS,
  SCHEDULE_PENDING_OPTS,
  getScheduleStatusBadgeStyle,
} from '../../../utils/ticketHelpers'

export interface MyTicketsFilterModalProps {
  open: boolean
  onClose: () => void
  activeBranchLabel?: string
  myTicketsStatusFilter: string
  setMyTicketsStatusFilter: (val: string) => void
  isLight: boolean
  cardBg: string
  border: string
  green: string
  textPrimary: string
  textMuted: string
  inputBorder: string
}

export const MyTicketsFilterModal: React.FC<MyTicketsFilterModalProps> = ({
  open,
  onClose,
  activeBranchLabel,
  myTicketsStatusFilter,
  setMyTicketsStatusFilter,
  isLight,
  cardBg,
  border,
  green,
  textPrimary,
  textMuted,
  inputBorder,
}) => {
  if (!open) return null

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-2xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col border overflow-hidden shrink-0"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
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
              <SlidersHorizontal className="w-4 h-4" style={{ color: green }} strokeWidth={2.1} />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide" style={{ color: textPrimary }}>My Tickets Filters</div>
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
                const active = myTicketsStatusFilter === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMyTicketsStatusFilter(opt.value)}
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
                    const active = myTicketsStatusFilter === opt.value
                    const style = getScheduleStatusBadgeStyle(opt.value, isLight)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMyTicketsStatusFilter(active ? '' : opt.value)}
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

          <p className="text-[11px] leading-relaxed" style={{ color: textMuted }}>
            Narrows the queue to tickets matching this status â€” applies instantly, no need to click
            Apply. Closed/scheduled tickets already leave this queue on their own once a final date
            is set, so "All Closing" will usually be empty here; use it to double-check nothing lingers.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
