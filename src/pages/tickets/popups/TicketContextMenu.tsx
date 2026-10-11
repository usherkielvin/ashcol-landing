import React from 'react'
import { Eye, Edit3 } from 'lucide-react'
import type { ContextMenuState } from '../types'
import type { Ticket } from '../../../utils/ticketHelpers'
import { getTicketNumberDisplay, getCustomerDisplayName, isTicketLockedFor } from '../../../utils/ticketHelpers'

export function TicketContextMenu({
  contextMenu,
  contextMenuRef,
  isLight,
  border,
  textPrimary,
  green,
  canEdit,
  role,
  onViewDetails,
  onEditDetails,
}: {
  contextMenu: ContextMenuState | null
  contextMenuRef: React.RefObject<HTMLDivElement | null>
  isLight: boolean
  border: string
  textPrimary: string
  green: string
  canEdit: boolean
  role?: string | null
  onViewDetails: (ticket: Ticket) => void
  onEditDetails: (ticket: Ticket) => void
}) {
  if (!contextMenu) return null

  const menuW = 220
  const menuH = 180
  const leftPos = contextMenu.x + menuW > window.innerWidth ? Math.max(10, window.innerWidth - menuW - 10) : contextMenu.x
  const topPos = contextMenu.y + menuH > window.innerHeight ? Math.max(10, window.innerHeight - menuH - 10) : contextMenu.y

  return (
    <div
      ref={contextMenuRef}
      className="fixed z-[99999] animate-in fade-in zoom-in-95 duration-100 select-none"
      style={{ top: topPos, left: leftPos }}
      onClick={e => e.stopPropagation()}
    >
      <div
        className="rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md"
        style={{ backgroundColor: isLight ? '#ffffff' : '#0a1120', border: `1px solid ${border}`, minWidth: 210 }}
      >
        {/* Header: Ticket No & Customer Name */}
        <div
          className="px-4 py-2 border-b flex flex-col gap-0.5"
          style={{ borderColor: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)' }}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
            {getTicketNumberDisplay(contextMenu.ticket)}
          </span>
          <span
            className="text-xs font-black uppercase tracking-wide truncate"
            style={{ color: textPrimary }}
            title={getCustomerDisplayName(contextMenu.ticket)}
          >
            {getCustomerDisplayName(contextMenu.ticket).toUpperCase() || 'TICKET ACTION'}
          </span>
        </div>

        {/* View full details */}
        <button
          onClick={() => onViewDetails(contextMenu.ticket)}
          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors"
          style={{ color: textPrimary }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : '#0f1e36'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
        >
          <Eye className="w-3.5 h-3.5 shrink-0" style={{ color: green }} />
          View Full Details
        </button>

        {/* Edit Details */}
        {canEdit && !isTicketLockedFor(contextMenu.ticket, role) && (
          <button
            onClick={() => onEditDetails(contextMenu.ticket)}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-bold text-left transition-colors"
            style={{ color: textPrimary }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : '#0f1e36'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
          >
            <Edit3 className="w-3.5 h-3.5 shrink-0" style={{ color: '#6366F1' }} />
            Edit Details
          </button>
        )}
      </div>
    </div>
  )
}
