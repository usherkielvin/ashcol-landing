import { useState } from 'react'
import ReactDOM from 'react-dom'
import { X, Check, CheckCircle2, CalendarClock, Repeat, Ban, Lock, RotateCcw, ArrowLeft } from 'lucide-react'
import {
  type Ticket,
  SCHEDULE_PENDING_OPTS,
  getScheduleStatusValue,
  getScheduleStatusLabel,
  getScheduleStatusBadgeStyle,
  findTicketInListByRef,
  getFinalDateKey,
  getPreferredDateKey,
  formatDisplayDate,
  getCloseOutcome,
  getCloseOutcomeLabel,
  getClosedStamp,
  isTicketClosed,
} from '../../utils/ticketHelpers'

/** Job types double as "change job type"; the rest are statuses a ticket can be waiting on. */
const JOB_TYPE_VALUES = ['INSTALL', 'SURVEY', 'CLEANING', 'CHECKUP', 'BACKJOB', 'SERVICE', 'MOUNTING', 'SYSTEM_REPROCESS', 'DISMANTLE', 'RELOCATION']
const OTHER_STATUS_VALUES = ['FOR_APPROVAL', 'PENDING_APPROVAL', 'FOR_NEGOTIATION', 'FOR_COLLECTION']

type View = 'main' | 'cancel' | 'reopen'

export function TicketStatusPickerPopover({
  picker,
  isLight,
  activeTab,
  tickets,
  optimisticTickets,
  canEditClosed,
  onClose,
  onOpenEditModal,
  onOpenReschedDialog,
  onOpenContinuationDialog,
  onCloseTicket,
  onCancelTicket,
  onReopenTicket,
  onSaveCellEdit,
}: {
  picker: { ticket: Ticket; mode: 'inline' | 'edit-form'; x: number; y: number }
  isLight: boolean
  activeTab: 'schedules' | 'overview'
  tickets: Ticket[]
  optimisticTickets: Map<string, Ticket>
  /** Admin / management / manager — may reopen a closed ticket. */
  canEditClosed: boolean
  onClose: () => void
  onOpenEditModal: (ticket: Ticket) => void
  onOpenReschedDialog: (ticket: Ticket) => void
  onOpenContinuationDialog: (ticket: Ticket) => void
  onCloseTicket: (ticket: Ticket) => void
  onCancelTicket: (ticket: Ticket, reason: string) => void
  onReopenTicket: (ticket: Ticket, reason: string) => void
  onSaveCellEdit: (ticket: Ticket, colLabel: string, value: string) => void
}) {
  const [view, setView] = useState<View>('main')
  const [reason, setReason] = useState('')
  const [pendingSelection, setPendingSelection] = useState<string | null>(null)

  const cardBg = isLight ? '#ffffff' : '#0d1626'
  const border = isLight ? '#e2e8f0' : '#1e293b'
  const panel = isLight ? '#f8fafc' : '#080e1a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  const ticket = picker.ticket
  const currentStatus = getScheduleStatusValue(ticket)
  const closed = isTicketClosed(ticket)
  const stamp = getClosedStamp(ticket)
  const { outcome, reason: noOutcomeReason } = getCloseOutcome(ticket)
  const doneLabel = outcome ? getCloseOutcomeLabel(outcome) : 'Done'

  const custName = ticket.customerName || ticket.customer_name || 'Customer'
  const ticketNum = ticket.ticketNumber || ticket.ticket_number || ticket.controlNumber || ''
  const finalDateKey = getFinalDateKey(ticket) || getPreferredDateKey(ticket) || ''
  const scheduleDateLabel = finalDateKey ? `SCHEDULED ${formatDisplayDate(finalDateKey, '')}` : 'SCHEDULE STATUS'
  const badge = getScheduleStatusBadgeStyle(currentStatus, isLight)

  const liveTicket = () => findTicketInListByRef(tickets, ticket, optimisticTickets) || ticket

  const startResched = () => {
    onClose()
    if (activeTab === 'overview') onOpenEditModal(ticket)
    else onOpenReschedDialog(ticket)
  }
  const startContinuation = () => {
    onClose()
    onOpenContinuationDialog(ticket)
  }
  const startClose = () => {
    onClose()
    onCloseTicket(ticket)
  }
  const confirmMore = () => {
    if (!pendingSelection || pendingSelection === currentStatus) return
    onClose()
    onSaveCellEdit(liveTicket(), 'STATUS', pendingSelection)
  }
  const submitReason = () => {
    const text = reason.trim()
    if (!text) return
    onClose()
    if (view === 'cancel') onCancelTicket(liveTicket(), text)
    else onReopenTicket(liveTicket(), text)
  }

  const tile = (
    key: string,
    label: string,
    Icon: typeof Ban,
    color: string,
    tint: string,
    onClick: () => void,
    active = false,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="relative flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-xl border text-[11px] font-black uppercase tracking-wide transition-all cursor-pointer active:scale-95 hover:brightness-105"
      style={{
        color,
        backgroundColor: active ? tint : panel,
        borderColor: active ? color : inputBorder,
        boxShadow: active ? `0 0 0 2px ${tint}` : undefined,
      }}
    >
      <Icon className="w-5 h-5" />
      {label}
      {active && (
        <span className="absolute top-1 right-1.5 text-[8px] font-black tracking-widest opacity-80">NOW</span>
      )}
    </button>
  )

  const optionGrid = (values: string[], cols: string) => (
    <div className={`grid gap-2 ${cols}`}>
      {SCHEDULE_PENDING_OPTS.filter(o => values.includes(o.value)).map(opt => {
        const selected = (pendingSelection || currentStatus) === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPendingSelection(opt.value === currentStatus ? null : opt.value)}
            className="min-h-11 px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide leading-tight text-center transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1"
            style={selected
              ? { backgroundColor: '#10B981', color: '#fff', border: '1px solid #10B981' }
              : { backgroundColor: panel, color: textPrimary, border: `1px solid ${inputBorder}` }}
          >
            {selected && <Check className="w-3 h-3 stroke-[3] shrink-0" />}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[12000] select-none flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs"
      onClick={e => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Update ticket status"
        className="w-full max-w-[680px] rounded-2xl shadow-2xl overflow-hidden flex flex-col border animate-in zoom-in-95 duration-150"
        style={{
          backgroundColor: cardBg,
          borderColor: border,
          maxHeight: '94vh',
          boxShadow: isLight
            ? '0 25px 50px -12px rgba(15,23,42,0.25), 0 0 20px rgba(16,185,129,0.08)'
            : '0 25px 50px -12px rgba(0,0,0,0.85), 0 0 25px rgba(16,185,129,0.12)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 flex items-start justify-between gap-2 shrink-0 border-b" style={{ borderColor: border, backgroundColor: panel }}>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>{scheduleDateLabel}</p>
            <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
              {ticketNum && <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 shrink-0 tabular-nums">{ticketNum}</span>}
              {ticketNum && <span className="text-[10px] opacity-40" style={{ color: textMuted }}>•</span>}
              <p className="text-xs sm:text-sm font-black uppercase truncate leading-tight" style={{ color: textPrimary }} title={custName}>{custName}</p>
            </div>
            <span
              className="inline-block mt-1.5 px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider"
              style={{ color: badge.color, backgroundColor: badge.backgroundColor, borderColor: badge.borderColor }}
            >
              {getScheduleStatusLabel(currentStatus)}
            </span>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-500/10 shrink-0 cursor-pointer" style={{ color: textMuted }} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {view !== 'main' ? (
            <>
              <button type="button" onClick={() => { setView('main'); setReason('') }} className="self-start flex items-center gap-1 text-[11px] font-bold cursor-pointer" style={{ color: textMuted }}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: textPrimary }}>
                {view === 'cancel' ? 'Why is this ticket being cancelled?' : 'Why is this ticket being reopened?'}
              </p>
              <textarea
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="A reason is required"
                className="w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                style={{ backgroundColor: panel, border: `1px solid ${inputBorder}`, color: textPrimary }}
              />
              <button
                type="button"
                disabled={!reason.trim()}
                onClick={submitReason}
                className="h-11 rounded-xl text-xs font-black uppercase tracking-wide text-white shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: view === 'cancel' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#10B981,#059669)' }}
              >
                {view === 'cancel' ? 'Cancel ticket' : 'Reopen ticket'}
              </button>
            </>
          ) : closed ? (
            <>
              <div className="rounded-xl border p-3.5 flex items-start gap-3" style={{ borderColor: border, backgroundColor: panel }}>
                <Lock className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide" style={{ color: textPrimary }}>
                    Closed · {getScheduleStatusLabel(currentStatus)}
                  </p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: textMuted }}>
                    {stamp.by || stamp.at
                      ? `Closed${stamp.by ? ` by ${stamp.by}` : ''}${stamp.at ? ` on ${stamp.at}` : ''}.`
                      : 'This ticket is closed.'}
                    {' '}{canEditClosed ? 'You can edit it or reopen it.' : 'It is read-only — ask an admin to reopen it.'}
                  </p>
                </div>
              </div>
              {canEditClosed && (
                <button
                  type="button"
                  onClick={() => setView('reopen')}
                  className="h-11 rounded-xl border text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all hover:bg-emerald-500/10"
                  style={{ borderColor: inputBorder, color: textPrimary }}
                >
                  <RotateCcw className="w-4 h-4" /> Reopen ticket
                </button>
              )}
            </>
          ) : (
            <>
              {/* Primary action + outcomes */}
              <div className="grid grid-cols-3 sm:grid-cols-[2.2fr_1fr_1fr_1fr] gap-2">
                <button
                  type="button"
                  disabled={!outcome}
                  onClick={startClose}
                  className="col-span-3 sm:col-span-1 min-h-[76px] rounded-xl px-4 py-3 text-white shadow-lg transition-all active:scale-[0.98] cursor-pointer flex items-center gap-3 text-left disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100"
                  style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}
                >
                  <CheckCircle2 className="w-7 h-7 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-base font-black uppercase tracking-wide">{doneLabel}</span>
                    <span className="block text-[11px] font-semibold opacity-90 leading-snug">
                      {outcome ? 'Checks details, payment & documents, then closes' : 'Not available right now'}
                    </span>
                  </span>
                </button>
                {tile('resched', 'Resched', CalendarClock, isLight ? '#b45309' : '#fbbf24', isLight ? '#fef3c7' : 'rgba(251,191,36,0.14)', startResched, currentStatus === 'RESCHED')}
                {tile('cont', 'Continue', Repeat, isLight ? '#7c3aed' : '#c084fc', isLight ? '#f3e8ff' : 'rgba(124,58,237,0.18)', startContinuation, currentStatus === 'CONTINUATION')}
                {tile('cancel', 'Cancel', Ban, isLight ? '#dc2626' : '#f87171', isLight ? '#fee2e2' : 'rgba(239,68,68,0.14)', () => setView('cancel'), currentStatus === 'CANCELLED')}
              </div>
              {!outcome && noOutcomeReason && (
                <p className="text-[11px] font-semibold -mt-2 px-1" style={{ color: textMuted }}>{noOutcomeReason}</p>
              )}

              {/* Job type + waiting-on statuses — always visible, no scrolling */}
              <div className="rounded-xl border p-4 flex flex-col gap-4" style={{ borderColor: border, backgroundColor: panel }}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: textMuted }}>Change job type</p>
                  {optionGrid(JOB_TYPE_VALUES, 'grid-cols-3 sm:grid-cols-5')}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: textMuted }}>Waiting on</p>
                  {optionGrid(OTHER_STATUS_VALUES, 'grid-cols-2 sm:grid-cols-4')}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Confirm bar for job-type / waiting-on picks */}
        {view === 'main' && !closed && pendingSelection && pendingSelection !== currentStatus ? (
          <div
            className="p-3.5 border-t flex items-center justify-between gap-3 shrink-0 animate-in slide-in-from-bottom-2 duration-150"
            style={{ borderColor: border, backgroundColor: isLight ? '#f0fdf4' : 'rgba(6, 78, 59, 0.25)' }}
          >
            <div className="min-w-0 flex-1">
              <span className="text-[9.5px] font-black uppercase tracking-wider block" style={{ color: textMuted }}>Change status to</span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase truncate block">{getScheduleStatusLabel(pendingSelection)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setPendingSelection(null)} className="px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer hover:bg-slate-500/10" style={{ borderColor: inputBorder, backgroundColor: cardBg, color: textMuted }}>
                Undo
              </button>
              <button type="button" onClick={confirmMore} className="px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 stroke-[3]" /> Save
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
