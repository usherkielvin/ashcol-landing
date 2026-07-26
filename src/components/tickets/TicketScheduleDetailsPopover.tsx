import { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { X, ClipboardList } from 'lucide-react'
import { EMPTY_CELL, formatPesoPrefix } from '../../utils/textSanitize'
import {
  type Ticket,
  getScheduleStatusValue,
  getScheduleStatusDisplay,
  getScheduleStatusLabel,
  getScheduleStatusBadgeStyle,
  formatGhostRemarks,
  getScheduleUpdateDisplay,
  formatCombinedPayment,
  getPaymentMode,
  formatPaymentAmount,
  getCustomerDisplayName,
} from '../../utils/ticketHelpers'
import {
  ConfirmationChecklistModal,
  isChecklistFilled,
  parseChecklistData,
} from './ConfirmationChecklistModal'

export function formatChecklistLastUpdated(completedAt?: string): string {
  if (!completedAt) return ''
  try {
    const d = new Date(completedAt)
    if (isNaN(d.getTime())) return ''
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s+/g, '').toUpperCase()
    const monthStr = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
    const day = d.getDate()
    const year = d.getFullYear()
    return `${timeStr} ${monthStr} ${day} ${year} LAST UPDATED ON 15Q FORM`
  } catch (e) {
    return ''
  }
}

export function TicketScheduleDetailsPopover({
  popup,
  isLight,
  dateFilter,
  canEdit,
  onClose,
  onOpenStatusPicker,
  onUpdateTicket,
}: {
  popup: { ticket: Ticket; x: number; y: number; ghostKind?: 'completed' | 'resched' | 'cancelled' | null }
  isLight: boolean
  dateFilter: string
  canEdit: boolean
  onClose: () => void
  onOpenStatusPicker: (ticket: Ticket, mode?: 'inline' | 'edit-form', anchorEl?: HTMLElement | null) => void
  onUpdateTicket?: (updatedTicket: Ticket) => void
}) {
  const [currentTicket, setCurrentTicket] = useState<Ticket>(popup.ticket)
  const [showChecklist, setShowChecklist] = useState(false)

  useEffect(() => {
    setCurrentTicket(popup.ticket)
  }, [popup.ticket])

  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const textGreen = isLight ? '#16A34A' : '#4ade80'
  const green = '#16A34A'

  const detailTicket = currentTicket
  const ghostKind = popup.ghostKind
  const isGhost = Boolean(ghostKind)
  const statusVal = getScheduleStatusValue(detailTicket)
  const statusLabel = getScheduleStatusDisplay(detailTicket) || getScheduleStatusLabel(statusVal)
  const statusStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
  const remarksText = isGhost
    ? formatGhostRemarks(detailTicket, ghostKind ?? null, dateFilter)
    : getScheduleUpdateDisplay(detailTicket)
  const customerName = getCustomerDisplayName(detailTicket)

  const rawChecklist = detailTicket.confirmationChecklist || (detailTicket as any).confirmation_checklist
  const isFilled = isChecklistFilled(rawChecklist)
  const checklistData = parseChecklistData(rawChecklist)
  const lastUpdatedText = formatChecklistLastUpdated(checklistData.completedAt)

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[12000]" onClick={onClose}>
      <div
        className="fixed w-[min(23.5rem,calc(100vw-1.5rem))] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          left: popup.x,
          top: popup.y,
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          maxHeight: 'min(500px, 80vh)',
          boxShadow: isLight
            ? '0 10px 25px -5px rgba(15,23,42,0.12), 0 8px 10px -6px rgba(15,23,42,0.1)'
            : '0 10px 25px -5px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-3 py-2.5 flex items-start justify-between gap-2 shrink-0"
          style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>Schedule details</p>
            <p className="text-[12px] font-bold truncate mt-0.5" style={{ color: textPrimary }} title={customerName}>
              {customerName || EMPTY_CELL}
            </p>
            <span
              className="inline-block mt-1.5 text-[11px] font-bold uppercase tracking-wide"
              style={{ color: statusStyle.color }}
            >
              {statusLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-500/10 shrink-0"
            style={{ color: textMuted }}
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {/* Remarks */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-1.5" style={{ color: textMuted }}>Remarks</p>
            <p
              className="text-[12px] font-semibold whitespace-pre-wrap break-words leading-relaxed"
              style={{
                color: remarksText ? textGreen : textMuted,
                fontStyle: isGhost ? 'italic' : undefined,
              }}
            >
              {remarksText || EMPTY_CELL}
            </p>
          </div>

          {/* Payment */}
          <div style={{ borderTop: `1px solid ${border}` }} className="pt-3">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] mb-1.5" style={{ color: textMuted }}>Payment</p>
            {(() => {
              const paymentCombined = formatCombinedPayment(detailTicket)
              const paymentMode = getPaymentMode(detailTicket).trim().toUpperCase()
              const paymentAmount = formatPaymentAmount(detailTicket)
              if (!paymentCombined) {
                return <p className="text-[12px]" style={{ color: textMuted }}>{EMPTY_CELL}</p>
              }
              if (paymentMode === 'FREE' || paymentMode === 'FREE INSTALL') {
                return <p className="text-[12px] font-bold" style={{ color: isLight ? '#047857' : '#6ee7b7' }}>FREE</p>
              }
              return (
                <div className="flex flex-col gap-1">
                  {paymentMode ? (
                    <p className="text-[12px]">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Mode </span>
                      <span className="font-semibold" style={{ color: textPrimary }}>{paymentMode}</span>
                    </p>
                  ) : null}
                  {paymentAmount ? (
                    <p className="text-[12px]">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>Amount </span>
                      <span className="font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: textPrimary }}>{formatPesoPrefix(paymentAmount)}</span>
                    </p>
                  ) : null}
                </div>
              )
            })()}
          </div>

          {/* 15Q Confirmation Checklist Section */}
          <div style={{ borderTop: `1px solid ${border}` }} className="pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>15Q Confirmation Form</p>
              <span className={`px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider ${
                isFilled
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
              }`}>
                {isFilled ? 'COMPLETED' : 'PENDING'}
              </span>
            </div>

            {lastUpdatedText ? (
              <p className="text-[10px] font-black uppercase tracking-tight text-emerald-600 dark:text-emerald-400 leading-tight">
                {lastUpdatedText}
              </p>
            ) : (
              <p className="text-[10px] font-bold uppercase tracking-tight text-amber-600 dark:text-amber-400 leading-tight">
                NOT YET UPDATED ON 15Q FORM
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowChecklist(true)}
              className={`w-full py-2 px-3 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                isFilled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>15Q Form ({isFilled ? 'Completed' : 'Pending'})</span>
            </button>
          </div>
        </div>

        {/* Footer actions */}
        {canEdit && !isGhost ? (
          <div
            className="px-3 py-2.5 flex items-center justify-between gap-2 shrink-0"
            style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
          >
            <button
              type="button"
              onClick={() => setShowChecklist(true)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                isFilled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              15Q ({isFilled ? 'Completed' : 'Pending'})
            </button>

            <button
              type="button"
              onClick={() => {
                const t = detailTicket
                onClose()
                onOpenStatusPicker(t, 'inline', document.querySelector(`[data-cell-key="${t.id}:STATUS"]`) as HTMLElement)
              }}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors"
              style={{ color: green, border: `1px solid ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(74,222,128,0.3)'}` }}
            >
              Change status
            </button>
          </div>
        ) : null}

        {showChecklist && (
          <ConfirmationChecklistModal
            ticket={currentTicket}
            isLight={isLight}
            onClose={() => setShowChecklist(false)}
            onSaved={(updated) => {
              setCurrentTicket(updated)
              onUpdateTicket?.(updated)
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}
