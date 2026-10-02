import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PauseCircle, X, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { PayrollRow } from '../../utils/payrollDerive';
import { peso } from './payoutUtils';

interface HoldModalProps {
  holdModalRow: PayrollRow;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  holdSubmitting: boolean;
  displayInstallerName: (name: string) => string;
  rowTotal: (row: PayrollRow) => number;
}

export default function HoldModal({
  holdModalRow,
  onClose,
  onSubmit,
  holdSubmitting,
  displayInstallerName,
  rowTotal
}: HoldModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const cardBg = isLight ? '#ffffff' : '#0A1120';
  const border = isLight ? '#e2e8f0' : '#1E2D48';
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0';
  const textMuted = isLight ? '#64748b' : '#7A95B8';
  const headerBg = isLight ? '#f8fafc' : '#0F1A2E';
  const inputBg = isLight ? '#ffffff' : '#0F1A2E';
  const inputBorder = isLight ? '#cbd5e1' : '#243452';

  // Mounted only while a row is being held, so the reason starts empty each time.
  const [holdReason, setHoldReason] = useState('');

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-start justify-between gap-3 px-6 py-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PauseCircle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-extrabold uppercase tracking-wide" style={{ color: textPrimary }}>Put on Hold</span>
            </div>
            <div className="text-xs font-semibold mt-1 truncate" style={{ color: textMuted }}>
              {holdModalRow.customerName || 'No customer'} · {holdModalRow.ticketNumber || 'No ticket'}
              {' · '}<span className="text-emerald-500">{displayInstallerName(holdModalRow.installerName)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all"
            style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }}
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          <div
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ backgroundColor: isLight ? '#fffbeb' : 'rgba(217,119,6,0.08)', border: `1px solid ${isLight ? '#fde68a' : 'rgba(217,119,6,0.3)'}` }}
          >
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#D97706' }}>Job Payout</span>
            <span className="text-lg font-extrabold tabular-nums" style={{ color: '#D97706' }}>₱{peso(rowTotal(holdModalRow))}</span>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Reason (required)</span>
            <textarea
              rows={3}
              value={holdReason}
              onChange={e => setHoldReason(e.target.value)}
              placeholder="Why is this job's payout being held? e.g. Approved by Ma'am Patt"
              className="w-full rounded-xl border p-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </label>
        </div>
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 shrink-0"
          style={{ backgroundColor: isLight ? 'rgba(241, 245, 249, 0.7)' : 'rgba(15, 26, 46, 0.7)', borderTop: `1px solid ${border}` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold border transition-all hover:opacity-80 cursor-pointer"
            style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(holdReason)}
            disabled={!holdReason.trim() || holdSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black text-white transition-all shadow-md disabled:opacity-50 cursor-pointer"
            style={{ background: '#D97706' }}
          >
            {holdSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />}
            <span>{holdSubmitting ? 'Holding…' : 'Confirm Hold'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
