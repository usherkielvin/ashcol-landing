import { useState } from 'react'
import { Check, ChevronDown, Lock, Ban } from 'lucide-react'
import { PENDING_STATUS_OPTIONS, CANCEL_STATUS_OPTION, isStatusMatch, normalizeStatusLabel, type StatusOption } from './statusOptions'

/**
 * Status block at the top of the edit-ticket drawer: the current status, the two ways to finish a
 * ticket (Close Ticket / Cancel) and — collapsed by default — the job-type / pending statuses.
 */
export function StatusGrid({
  currentStatus,
  onRequestChange,
  isLight,
  border,
  textMuted,
  onCloseTicket,
  closedLabel,
}: {
  currentStatus: string
  onRequestChange: (status: StatusOption) => void
  isLight: boolean
  border: string
  textMuted: string
  /** Opens the guarded Close Ticket dialog. Hidden when omitted (e.g. relays). */
  onCloseTicket?: () => void
  /** Set when the ticket is already closed — shows the outcome instead of the close button. */
  closedLabel?: string
}) {
  const [open, setOpen] = useState(false)

  const current = PENDING_STATUS_OPTIONS.find(o => isStatusMatch(currentStatus, o))
  const isCancelled = isStatusMatch(currentStatus, CANCEL_STATUS_OPTION)
  const currentLabel = closedLabel || (isCancelled ? 'CANCELLED' : current?.label || normalizeStatusLabel(currentStatus))

  const panel = isLight ? '#f8fafc' : 'rgba(255,255,255,0.02)'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'

  return (
    <div className="rounded-2xl border p-3.5 sm:p-4 flex flex-col gap-3" style={{ borderColor: border, backgroundColor: panel }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Status</p>
          <span
            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide"
            style={isCancelled
              ? { backgroundColor: isLight ? '#fee2e2' : 'rgba(239,68,68,0.15)', color: isLight ? '#dc2626' : '#f87171' }
              : { backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.18)', color: isLight ? '#15803d' : '#86efac' }}
          >
            {closedLabel && <Lock className="w-3 h-3" />}
            {closedLabel ? `Closed · ${currentLabel}` : currentLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!closedLabel && onCloseTicket && (
            <button
              type="button"
              onClick={onCloseTicket}
              className="h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wide text-white shadow-md flex items-center gap-1.5 cursor-pointer transition-all hover:brightness-110 active:scale-95"
              style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}
              title="Saves your edits, then checks details, payment and documents before closing"
            >
              <Check className="w-4 h-4 stroke-[3]" /> Close ticket
            </button>
          )}
          {!isCancelled && (
            <button
              type="button"
              onClick={() => onRequestChange(CANCEL_STATUS_OPTION)}
              className="h-10 px-3.5 rounded-xl border text-xs font-black uppercase tracking-wide flex items-center gap-1.5 cursor-pointer transition-all hover:bg-red-500/10 active:scale-95"
              style={{ borderColor: isLight ? '#fca5a5' : 'rgba(248,113,113,0.4)', color: isLight ? '#dc2626' : '#f87171' }}
            >
              <Ban className="w-3.5 h-3.5" /> Cancel ticket
            </button>
          )}
        </div>
      </div>

      <div className="border-t pt-2.5" style={{ borderColor: border }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider cursor-pointer"
          style={{ color: textMuted }}
        >
          Change job type / status
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {PENDING_STATUS_OPTIONS.map(st => {
              const selected = !closedLabel && isStatusMatch(currentStatus, st)
              return (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => { if (!selected) onRequestChange(st) }}
                  aria-pressed={selected}
                  className="h-8 px-3 rounded-full border text-[11px] font-black uppercase tracking-wide transition-all select-none cursor-pointer hover:border-emerald-500/50 active:scale-95"
                  style={selected
                    ? { backgroundColor: '#10B981', borderColor: '#10B981', color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }
                    : { backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.03)', borderColor: border, color: textPrimary }}
                >
                  {st.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
