import { useState, useLayoutEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { X, Eye } from 'lucide-react'
import { EMPTY_CELL } from '../../utils/textSanitize'
import {
  type Ticket,
  type ScheduleGhostKind,
  getScheduleStatusValue,
  getScheduleStatusDisplay,
  getScheduleStatusLabel,
  getScheduleStatusBadgeStyle,
  formatGhostRemarks,
  getScheduleUpdateDisplay,
  getCustomerDisplayName,
} from '../../utils/ticketHelpers'

/**
 * Quick look at one schedule row: who, current status, and the latest remark. Payment and the 15Q
 * form live inside the edit ticket modal, not here. Closed (or read-only) rows only offer
 * "View details"; editors also get "Change status".
 */
export function TicketScheduleDetailsPopover({
  popup,
  isLight,
  dateFilter,
  canChangeStatus,
  onClose,
  onOpenStatusPicker,
  onViewDetails,
}: {
  popup: { ticket: Ticket; x: number; y: number; ghostKind?: ScheduleGhostKind }
  isLight: boolean
  dateFilter: string
  canChangeStatus: boolean
  onClose: () => void
  onOpenStatusPicker: (ticket: Ticket, mode?: 'inline' | 'edit-form', anchorEl?: HTMLElement | null) => void
  onViewDetails: (ticket: Ticket) => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: popup.y,
    left: popup.x,
  })

  useLayoutEffect(() => {
    const updatePosition = () => {
      const el = popoverRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const margin = 12
      let nextLeft = popup.x
      let nextTop = popup.y

      if (nextLeft + rect.width > window.innerWidth - margin) {
        nextLeft = Math.max(margin, window.innerWidth - rect.width - margin)
      }
      if (nextLeft < margin) nextLeft = margin
      if (nextTop + rect.height > window.innerHeight - margin) {
        nextTop = Math.max(margin, window.innerHeight - rect.height - margin)
      }
      if (nextTop < margin) nextTop = margin

      setCoords({ top: Math.round(nextTop), left: Math.round(nextLeft) })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [popup.x, popup.y, popup.ticket])

  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#e2e8f0' : '#1e293b'
  const panel = isLight ? '#f8fafc' : '#0b1424'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  const detailTicket = popup.ticket
  const ghostKind = popup.ghostKind
  const isGhost = Boolean(ghostKind)
  const statusVal = getScheduleStatusValue(detailTicket)
  const statusLabel = getScheduleStatusDisplay(detailTicket) || getScheduleStatusLabel(statusVal)
  const statusStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
  const remarksText = isGhost
    ? formatGhostRemarks(detailTicket, ghostKind ?? null, dateFilter)
    : getScheduleUpdateDisplay(detailTicket)
  const customerName = getCustomerDisplayName(detailTicket)
  const ticketNo = String(detailTicket.ticketNumber || detailTicket.ticket_number || '').trim()
  const showChangeStatus = canChangeStatus && !isGhost

  const viewDetails = () => {
    const t = detailTicket
    onClose()
    onViewDetails(t)
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[12000]" onClick={onClose}>
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Schedule details"
        className="fixed w-[min(21rem,calc(100vw-1.5rem))] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          left: coords.left,
          top: coords.top,
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          maxHeight: 'min(440px, calc(100dvh - 24px))',
          boxShadow: isLight
            ? '0 16px 32px -8px rgba(15,23,42,0.18), 0 6px 12px -6px rgba(15,23,42,0.1)'
            : '0 16px 32px -8px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            {ticketNo && (
              <p className="text-[10px] font-black tracking-[0.12em] tabular-nums text-emerald-600 dark:text-emerald-400">{ticketNo}</p>
            )}
            <p className="text-[14px] font-extrabold uppercase leading-tight truncate mt-0.5" style={{ color: textPrimary }} title={customerName}>
              {customerName || EMPTY_CELL}
            </p>
            <span
              className="inline-block mt-2 px-2.5 py-0.5 rounded-full border text-[10.5px] font-black uppercase tracking-wide"
              style={{ color: statusStyle.color, backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor }}
            >
              {statusLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 -mt-1 rounded-lg hover:bg-slate-500/10 shrink-0 cursor-pointer"
            style={{ color: textMuted }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Latest remark */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          <div className="rounded-xl px-3.5 py-3" style={{ backgroundColor: panel, border: `1px solid ${border}` }}>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-1" style={{ color: textMuted }}>Remarks</p>
            <p
              className="text-[12.5px] font-semibold whitespace-pre-wrap break-words leading-relaxed"
              style={{
                color: remarksText ? textPrimary : textMuted,
                fontStyle: isGhost ? 'italic' : undefined,
              }}
            >
              {remarksText || 'No remarks yet'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={viewDetails}
            className={`${showChangeStatus ? 'flex-1' : 'w-full'} h-10 rounded-xl border text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:bg-slate-500/10 active:scale-[0.97]`}
            style={{ borderColor: isLight ? '#cbd5e1' : '#334155', color: textPrimary }}
          >
            <Eye className="w-3.5 h-3.5" />
            View details
          </button>
          {showChangeStatus && (
            <button
              type="button"
              onClick={() => {
                const t = detailTicket
                onClose()
                onOpenStatusPicker(t, 'inline', document.querySelector(`[data-cell-key="${t.id}:STATUS"]`) as HTMLElement)
              }}
              className="flex-1 h-10 rounded-xl text-xs font-black uppercase tracking-wide text-white cursor-pointer transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
            >
              Change status
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
