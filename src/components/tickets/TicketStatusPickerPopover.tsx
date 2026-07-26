import ReactDOM from 'react-dom'
import { X } from 'lucide-react'
import {
  type Ticket,
  CLOSING_SCHEDULE_STATUSES,
  SCHEDULE_PENDING_OPTS,
  SCHEDULE_CLOSING_OPTS,
  getScheduleStatusValue,
  getScheduleStatusLabel,
  getScheduleStatusBadgeStyle,
  getEmptyRequiredColumnsForClose,
  ticketHasPaymentInfo,
  findTicketInListByRef,
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
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  const pickerTicket = picker.ticket
  const pickerMode = picker.mode
  const currentStatus = pickerMode === 'edit-form'
    ? String(editFormStatus || getScheduleStatusValue(pickerTicket)).toUpperCase().replace(/\s+/g, '_')
    : getScheduleStatusValue(pickerTicket)
  const currentLabel = getScheduleStatusLabel(currentStatus)
  const currentStyle = getScheduleStatusBadgeStyle(currentStatus, isLight)

  const pickStatus = (value: string) => {
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
    if (value === 'DONE_INSTALLED' || value === 'DONE_CLEANING' || value === 'DONE_DISMANTLE') {
      if (!ticketHasPaymentInfo(pickerTicket)) {
        onOpenPaymentPrompt(pickerTicket, value)
        return
      }
    }
    if (value === currentStatus) return
    const livePickerTicket = findTicketInListByRef(tickets, pickerTicket, optimisticTickets) || pickerTicket
    onSaveCellEdit(livePickerTicket, 'STATUS', value)
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[12000]" onClick={onClose}>
      <div
        className="fixed w-[230px] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          left: picker.x,
          top: picker.y,
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          maxHeight: 'min(450px, 70vh)',
          boxShadow: isLight
            ? '0 10px 25px -5px rgba(15,23,42,0.1), 0 8px 10px -6px rgba(15,23,42,0.1)'
            : '0 10px 25px -5px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="px-3 py-2 flex items-center justify-between gap-2 shrink-0"
          style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>STATUS</p>
            <p className="text-[11px] font-black uppercase truncate mt-0.5" style={{ color: currentStyle.color }}>
              {currentLabel}
            </p>
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

        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          {([
            { title: 'PENDING', opts: SCHEDULE_PENDING_OPTS },
            ...((activeTab === 'schedules' || pickerMode === 'edit-form')
              ? [{ title: 'CLOSING', opts: SCHEDULE_CLOSING_OPTS }]
              : []),
          ] as const).map((section, sectionIdx) => (
            <div
              key={section.title}
              className={sectionIdx > 0 ? 'pt-2' : ''}
              style={sectionIdx > 0 ? { borderTop: `1px solid ${border}` } : undefined}
            >
              <p className="px-2 pb-1.5 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: textMuted }}>
                {section.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.opts.map(opt => {
                  const active = currentStatus === opt.value
                  const style = getScheduleStatusBadgeStyle(opt.value, isLight)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => pickStatus(opt.value)}
                      className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-left transition-colors"
                      style={active ? {
                        backgroundColor: '#10B981',
                        border: 'none',
                      } : {
                        backgroundColor: 'transparent',
                        border: 'none',
                      }}
                      onMouseEnter={e => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : '#1e293b'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0 border"
                          style={active ? {
                            backgroundColor: '#ffffff',
                            borderColor: '#ffffff',
                          } : {
                            backgroundColor: style.color,
                            borderColor: style.borderColor,
                          }}
                        />
                        <span
                          className="text-[11px] font-bold uppercase tracking-wide truncate"
                          style={{ color: active ? '#ffffff' : textPrimary }}
                        >
                          {opt.label}
                        </span>
                      </span>
                      {active && (
                        <span className="text-[9px] font-black uppercase tracking-wider shrink-0" style={{ color: '#ffffff' }}>
                          Active
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
