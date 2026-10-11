import ReactDOM from 'react-dom'
import { X } from 'lucide-react'
import { normalizeStatusLabel } from './statusOptions'

export type StatusConfirmState = {
  type: 'status' | 'discard'
  targetLabel?: string
  onConfirm: () => void
}

export function StatusChangeConfirmDialog({
  state,
  currentStatus,
  onClose,
  cardBg,
  border,
  inputBorder,
  textPrimary,
  textMuted,
}: {
  state: StatusConfirmState
  /** Raw current status/serviceType — normalized into a display label internally. */
  currentStatus: string
  onClose: () => void
  cardBg: string
  border: string
  inputBorder: string
  textPrimary: string
  textMuted: string
}) {
  const currentStatusLabel = normalizeStatusLabel(currentStatus)

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden border animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 p-5 sm:p-6 flex flex-col gap-4"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm sm:text-base font-black leading-tight" style={{ color: textPrimary }}>
            {state.type === 'discard' ? 'Discard Unsaved Changes?' : 'Confirm Status Change'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors shrink-0"
            style={{ color: textMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm font-medium leading-relaxed" style={{ color: textPrimary }}>
          {state.type === 'discard'
            ? 'You have unsaved changes on this ticket. Discard changes and close?'
            : `Are you sure you want to change the status from ${currentStatusLabel} to ${state.targetLabel}?`}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors hover:bg-slate-500/10"
            style={{ borderColor: inputBorder, color: textMuted, backgroundColor: 'transparent' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { state.onConfirm(); onClose() }}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95 shadow-sm"
            style={{ background: state.type === 'discard' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            {state.type === 'discard' ? 'Discard' : 'OK'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
