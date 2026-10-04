import React from 'react'
import ReactDOM from 'react-dom'
import { X } from 'lucide-react'
import type { ExpandedCellState, ColumnDef } from '../types'
import type { Ticket, ScheduleGhostKind } from '../../../utils/ticketHelpers'
import { getCustomerDisplayName } from '../../../utils/ticketHelpers'

export function ExpandedCellPopover({
  expandedCell,
  expandedPopoverPos,
  ticket,
  columns,
  idx,
  isGhost,
  ghostKind,
  cardBg,
  border,
  isLight,
  textMuted,
  textPrimary,
  columnDisplayName,
  onClose,
  renderContent,
}: {
  expandedCell: ExpandedCellState | null
  expandedPopoverPos: { top: number; left: number; width: number } | null
  ticket: Ticket | null
  columns: ColumnDef[]
  idx: number
  isGhost: boolean
  ghostKind: ScheduleGhostKind | null
  cardBg: string
  border: string
  isLight: boolean
  textMuted: string
  textPrimary: string
  columnDisplayName: (label: string) => string
  onClose: () => void
  renderContent: (ticket: Ticket, col: any, idx?: number, isGhost?: boolean, ghostKind?: ScheduleGhostKind) => React.ReactNode
}) {
  if (!expandedCell || !expandedPopoverPos || !ticket) return null
  const col = columns.find(c => c.label === expandedCell.colLabel)
  if (!col) return null

  return ReactDOM.createPortal(
    <div
      data-expanded-popover="true"
      role="dialog"
      aria-label={`${columnDisplayName(col.label)} details`}
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{
        position: 'fixed',
        left: expandedPopoverPos.left,
        top: expandedPopoverPos.top,
        width: expandedPopoverPos.width,
        maxWidth: 'calc(100vw - 1rem)',
        maxHeight: 'min(360px, calc(100vh - 1rem))',
        zIndex: 14000,
        backgroundColor: cardBg,
        borderColor: border,
        boxShadow: isLight
          ? '0 16px 32px -8px rgba(15,23,42,0.2), 0 6px 12px -6px rgba(15,23,42,0.1)'
          : '0 16px 32px -8px rgba(0,0,0,0.6)',
      }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <div
        className="px-3.5 py-2.5 flex items-start justify-between gap-2 shrink-0 border-b"
        style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>
            {columnDisplayName(col.label)}
          </p>
          <p className="text-xs font-extrabold uppercase truncate mt-0.5" style={{ color: textPrimary }}>
            {ticket.ticketNumber || ticket.ticket_number ? `${ticket.ticketNumber || ticket.ticket_number} · ` : ''}{getCustomerDisplayName(ticket)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 -mr-1 rounded-md hover:bg-slate-500/10 shrink-0 cursor-pointer"
          style={{ color: textMuted }}
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3.5 py-3 overflow-y-auto text-[13px] font-semibold leading-relaxed" style={{ color: textPrimary }}>
        {renderContent(ticket, col, idx >= 0 ? idx : undefined, isGhost, ghostKind || undefined)}
      </div>
    </div>,
    document.body,
  )
}
