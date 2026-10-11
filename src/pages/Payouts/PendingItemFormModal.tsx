import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { PayrollRow } from '../../utils/payrollDerive';
import { shortDate } from './payoutUtils';

export interface PendingItemInput {
  reason: string;
}

interface PendingItemFormModalProps {
  /** The closed-week ticket being flagged — it is the basis of the pending item. */
  ticket: PayrollRow;
  /** The closed week the item relates to (shown, not editable). */
  weekFrom: string;
  weekTo: string;
  onClose: () => void;
  onSubmit: (input: PendingItemInput) => Promise<void>;
  submitting: boolean;
  submitError?: string | null;
}

/**
 * Flags a closed-week ticket to settle later (hauling fee not collected, a cleaning or parts job to reconcile).
 * It changes no payout until it is posted to an open week from the Pending list.
 */
export default function PendingItemFormModal({
  ticket,
  weekFrom,
  weekTo,
  onClose,
  onSubmit,
  submitting,
  submitError
}: PendingItemFormModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const cardBg = isLight ? '#ffffff' : '#0A1120';
  const border = isLight ? '#e2e8f0' : '#1E2D48';
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0';
  const textMuted = isLight ? '#64748b' : '#7A95B8';
  const headerBg = isLight ? '#f8fafc' : '#0F1A2E';
  const inputBg = isLight ? '#ffffff' : '#0F1A2E';
  const inputBorder = isLight ? '#cbd5e1' : '#243452';

  const [reason, setReason] = useState('');

  const canSubmit = reason.trim() !== '' && !submitting;

  const labelCls = 'text-[11px] font-black uppercase tracking-wider';
  const inputCls = 'w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none';
  const inputStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary };

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-start justify-between gap-3 px-6 py-4" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
          <div className="min-w-0">
            <div className="text-sm font-extrabold uppercase tracking-wide" style={{ color: textPrimary }}>
              Flag Ticket for Review
            </div>
            <div className="text-xs font-semibold mt-1 truncate" style={{ color: textMuted }}>
              {ticket.customerName || 'No customer'} · {ticket.ticketNumber || 'No ticket'} · closed week {shortDate(weekFrom)} – {shortDate(weekTo)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: textMuted }}>
              Nothing changes in anyone's pay yet. It waits in the Pending list until you post it to an open week or dismiss it.
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all" style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }} aria-label="Close">
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: textMuted }}>What needs checking (required)</span>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Hauling fee not collected from the customer"
              className={inputCls}
              style={inputStyle}
            />
          </label>
          {submitError && (
            <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ color: isLight ? '#B91C1C' : '#FCA5A5', backgroundColor: isLight ? '#fef2f2' : 'rgba(248,113,113,0.12)', border: `1px solid ${isLight ? '#fecaca' : 'rgba(248,113,113,0.3)'}` }}>{submitError}</div>
          )}
        </div>

        <div className="px-6 py-3 flex items-center justify-end gap-3" style={{ borderTop: `1px solid ${border}`, backgroundColor: headerBg }}>
          {!canSubmit && !submitting && <span className="mr-auto text-[11px] font-semibold" style={{ color: '#D97706' }}>Type what needs checking to continue</span>}
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-xs font-bold border hover:opacity-80 cursor-pointer" style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}>Cancel</button>
          <button
            type="button"
            onClick={() => void onSubmit({ reason: reason.trim() })}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black text-white shadow-md disabled:opacity-50 cursor-pointer"
            style={{ background: '#D97706' }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{submitting ? 'Saving…' : 'Save as Pending'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
