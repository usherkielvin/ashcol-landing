import React from 'react'
import type { Employee } from '../types'
import { formatMonthFilterLabel, getScheduleStatusLabel } from '../../../utils/ticketHelpers'

export interface MonthViewBannerProps {
  monthFilterMonth: string
  activeBranchLabel?: string
  monthFilterNegotiatorId?: string
  monthFilterNegotiatorOptions: Employee[]
  formatNegotiatorLabel: (emp: Partial<Employee>) => string
  monthFilterStatus?: string
  visibleCount: number
  onExitMonthView: () => void
  green: string
  border: string
}

export const MonthViewBanner: React.FC<MonthViewBannerProps> = ({
  monthFilterMonth,
  activeBranchLabel,
  monthFilterNegotiatorId,
  monthFilterNegotiatorOptions,
  formatNegotiatorLabel,
  monthFilterStatus,
  visibleCount,
  onExitMonthView,
  green,
  border,
}) => {
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 border-b shrink-0"
      style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderColor: border }}
    >
      <span className="text-xs font-semibold" style={{ color: green }}>
        Month view — {formatMonthFilterLabel(monthFilterMonth)} · {activeBranchLabel || 'All branches'}
        {monthFilterNegotiatorId
          ? ` · ${formatNegotiatorLabel(monthFilterNegotiatorOptions.find(n => n.id === monthFilterNegotiatorId) || {})}`
          : ''}
        {monthFilterStatus
          ? ` · ${monthFilterStatus === 'PENDING_GROUP' ? 'All Pending' : monthFilterStatus === 'CLOSING_GROUP' ? 'All Closing' : getScheduleStatusLabel(monthFilterStatus)}`
          : ''}
        {' '}({visibleCount} ticket{visibleCount === 1 ? '' : 's'})
      </span>
      <button
        type="button"
        onClick={onExitMonthView}
        className="text-[11px] font-bold uppercase tracking-wide hover:underline shrink-0"
        style={{ color: green }}
      >
        Exit month view
      </button>
    </div>
  )
}
