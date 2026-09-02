import { useState } from 'react'
import ReactDOM from 'react-dom'
import { X, Check } from 'lucide-react'
import {
  type Ticket,
  CLOSING_SCHEDULE_STATUSES,
  SCHEDULE_PENDING_OPTS,
  SCHEDULE_CLOSING_OPTS,
  getScheduleStatusValue,
  getScheduleStatusLabel,
  getEmptyRequiredColumnsForClose,
  ticketHasPaymentInfo,
  findTicketInListByRef,
  getFinalDateKey,
  getPreferredDateKey,
  formatDisplayDate,
} from '../../utils/ticketHelpers'

export function TicketStatusPickerPopover({
  picker,
  isLight,
  activeTab,
  editFormStatus,
  tickets,
  optimisticTickets,
  onClose,
  onSetEditFormStatus,
  onOpenEditModal,
  onOpenReschedDialog,
  onOpenContinuationDialog,
  onOpenPaymentPrompt,
  onSaveCellEdit,
}: {
  picker: { ticket: Ticket; mode: 'inline' | 'edit-form'; x: number; y: number }
  isLight: boolean
  activeTab: 'schedules' | 'overview'
  editFormStatus?: string
  tickets: Ticket[]
  optimisticTickets: Map<string, Ticket>
  onClose: () => void
  onSetEditFormStatus: (status: string) => void
  onOpenEditModal: (ticket: Ticket) => void
  onOpenReschedDialog: (ticket: Ticket) => void
  onOpenContinuationDialog: (ticket: Ticket) => void
  onOpenPaymentPrompt: (ticket: Ticket, nextStatus: string) => void
  onSaveCellEdit: (ticket: Ticket, colLabel: string, value: string) => void
}) {
  const [pendingSelection, setPendingSelection] = useState<string | null>(null)

  const cardBg = isLight ? '#ffffff' : '#0d1626'
  const border = isLight ? '#e2e8f0' : '#1e293b'
  const inputBg = isLight ? '#f8fafc' : '#080e1a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  const pickerTicket = picker.ticket
  const pickerMode = picker.mode
  const currentStatus = pickerMode === 'edit-form'
    ? String(editFormStatus || getScheduleStatusValue(pickerTicket)).toUpperCase().replace(/\s+/g, '_')
    : getScheduleStatusValue(pickerTicket)

  const executeStatusChange = (value: string) => {
    onClose()
    if (pickerMode === 'edit-form') {
      onSetEditFormStatus(value)
      return
    }
    const picked = value.toUpperCase().replace(/\s+/g, '_')
    const isClosing = CLOSING_SCHEDULE_STATUSES.has(picked)
      || ['COMPLETED', 'INSTALLED'].includes(picked)
    if (isClosing) {
      const missing = getEmptyRequiredColumnsForClose(pickerTicket)
      if (missing.length > 0) {
        alert(`Cannot close ticket because the following columns are empty:\n• ${missing.join('\n• ')}`)
        return
      }
    }
    if (value === 'RESCHED') {
      if (activeTab === 'overview') {
        onOpenEditModal(pickerTicket)
        setTimeout(() => {
          onSetEditFormStatus('RESCHED')
        }, 0)
      } else {
        onOpenReschedDialog(pickerTicket)
      }
      return
    }
    if (value === 'CONTINUATION') {
      onOpenContinuationDialog(pickerTicket)
      return
    }
    if (value === 'DONE_INSTALLED' || value === 'DONE_CLEANING' || value === 'DONE_DISMANTLE' || value === 'DONE_RELOCATED') {
      if (!ticketHasPaymentInfo(pickerTicket)) {
        onOpenPaymentPrompt(pickerTicket, value)
        return
      }
    }
    if (value === currentStatus) return
    const livePickerTicket = findTicketInListByRef(tickets, pickerTicket, optimisticTickets) || pickerTicket
    onSaveCellEdit(livePickerTicket, 'STATUS', value)
  }

  const custName = pickerTicket.customerName || pickerTicket.customer_name || 'Customer'
  const ticketNum = (pickerTicket as any).ticketNumber || (pickerTicket as any).ticket_number || (pickerTicket as any).controlNumber || ''
  const finalDateKey = getFinalDateKey(pickerTicket) || getPreferredDateKey(pickerTicket) || ''
  const scheduleDateLabel = finalDateKey ? `SCHEDULED ${formatDisplayDate(finalDateKey, '')}` : 'SCHEDULE STATUS'

  // The active display status is either the pending clicked status or current status
  const displayedStatus = pendingSelection || currentStatus

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[12000] select-none flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs"
      onClick={e => e.stopPropagation()}
    >
      <div
        className="w-full max-w-[380px] rounded-2xl shadow-2xl overflow-hidden flex flex-col select-none border animate-in zoom-in-95 duration-150"
        style={{
          backgroundColor: cardBg,
          borderColor: border,
          maxHeight: 'min(620px, 88vh)',
          boxShadow: isLight
            ? '0 25px 50px -12px rgba(15,23,42,0.25), 0 0 20px rgba(16,185,129,0.08)'
            : '0 25px 50px -12px rgba(0,0,0,0.85), 0 0 25px rgba(16,185,129,0.12)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with Scheduled Date & Customer info */}
        <div
          className="px-4 py-3.5 flex items-start justify-between gap-2 shrink-0 border-b select-none"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#080e1a' }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {scheduleDateLabel}
            </p>
            <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
              {ticketNum && (
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 shrink-0 tabular-nums">
                  {ticketNum}
                </span>
              )}
              {ticketNum && <span className="text-[10px] opacity-40" style={{ color: textMuted }}>•</span>}
              <p
                className="text-xs sm:text-sm font-black uppercase truncate leading-tight"
                style={{ color: textPrimary }}
                title={custName}
              >
                {custName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-500/10 shrink-0 transition-colors cursor-pointer"
            style={{ color: textMuted }}
            aria-label="Close"
            title="Close without saving"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Body with 2-Column Grid of Bigger Buttons */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3.5">
          {([
            { title: 'PENDING', opts: SCHEDULE_PENDING_OPTS },
            ...((activeTab === 'schedules' || pickerMode === 'edit-form')
              ? [{ title: 'CLOSING', opts: SCHEDULE_CLOSING_OPTS }]
              : []),
          ] as const).map((section, sectionIdx) => (
            <div
              key={section.title}
              className={sectionIdx > 0 ? 'pt-3' : ''}
              style={sectionIdx > 0 ? { borderTop: `1px solid ${border}` } : undefined}
            >
              <p className="px-1 pb-2 text-[9.5px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>
                {section.title}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {section.opts.map(opt => {
                  const isSelected = displayedStatus === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        if (opt.value === currentStatus) {
                          setPendingSelection(null)
                        } else {
                          setPendingSelection(opt.value)
                        }
                      }}
                      className={`h-11 sm:h-12 px-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all flex items-center justify-center text-center cursor-pointer active:scale-95 ${
                        isSelected ? 'shadow-md ring-2 ring-emerald-500/30' : 'hover:border-emerald-500/40 hover:bg-emerald-500/5'
                      }`}
                      style={isSelected ? {
                        backgroundColor: '#10B981',
                        color: '#ffffff',
                        border: '1px solid #10B981',
                      } : {
                        backgroundColor: inputBg,
                        borderColor: inputBorder,
                        border: `1px solid ${inputBorder}`,
                        color: textPrimary,
                      }}
                    >
                      <span className="truncate w-full px-1 leading-snug flex items-center justify-center gap-1">
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 stroke-[3]" />}
                        <span className="truncate">{opt.label}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Confirmation Footer Bar - only closes & saves upon clicking Confirm & Save */}
        {pendingSelection && pendingSelection !== currentStatus ? (
          <div
            className="p-3.5 border-t flex items-center justify-between gap-3 shrink-0 animate-in slide-in-from-bottom-2 duration-150 shadow-inner"
            style={{
              borderColor: border,
              backgroundColor: isLight ? '#f0fdf4' : 'rgba(6, 78, 59, 0.25)',
            }}
          >
            <div className="min-w-0 flex-1">
              <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 block">Change Status:</span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase truncate block">
                {getScheduleStatusLabel(pendingSelection)}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPendingSelection(null)}
                className="px-3 py-2 rounded-xl border text-xs font-bold transition-all hover:bg-slate-500/10 cursor-pointer"
                style={{ borderColor: inputBorder, backgroundColor: cardBg, color: textMuted }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeStatusChange(pendingSelection)}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Confirm & Save</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
