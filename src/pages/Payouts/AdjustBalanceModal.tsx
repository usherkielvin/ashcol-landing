import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { PayrollRow } from '../../utils/payrollDerive';
import type { PayrollCorrection } from '../../utils/payrollCorrectionsApi';
import { weeksOfMonth, nextMonth, formatMonth, todayYMD, type PayrollWeek, type WeekCycle } from '../../utils/payrollWeeks';
import type { PayrollWeekClosure } from './payoutUtils';
import { num, peso, pesoSigned, paidColumnAmount } from './payoutUtils';

interface AdjustBalanceModalProps {
  adjustRow: { row: PayrollRow; month: string };
  /** Corrections already posted on this ticket — they are part of what was paid. */
  priorPosted: PayrollCorrection[];
  /** Server's explanation when the last attempt was rejected; cleared by the parent on the next try. */
  submitError?: string | null;
  closures: PayrollWeekClosure[];
  activeMonth: string;
  cycle: WeekCycle;
  branchFilter: string;
  getAdjustableCols: () => { key: string; label: string }[];
  getColAccessor: (key: string) => { get: (row: PayrollRow) => string | number | null | undefined };
  onClose: () => void;
  onSubmit: (edits: Record<string, string>, targetWeek: PayrollWeek, reason: string) => Promise<void>;
  adjustSubmitting: boolean;
  displayInstallerName: (name: string) => string;
}

/**
 * Balance adjustment for a ticket in a closed week. Mounted only while open, so its fields start fresh each time:
 * no edits, no reason, and the first open week from today on preselected as the week to apply it in.
 */
export default function AdjustBalanceModal({
  adjustRow,
  priorPosted,
  submitError,
  closures,
  activeMonth,
  cycle,
  branchFilter,
  getAdjustableCols,
  getColAccessor,
  onClose,
  onSubmit,
  adjustSubmitting,
  displayInstallerName
}: AdjustBalanceModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const cardBg = isLight ? '#ffffff' : '#0A1120';
  const border = isLight ? '#e2e8f0' : '#1E2D48';
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0';
  const textMuted = isLight ? '#64748b' : '#7A95B8';
  const headerBg = isLight ? '#f8fafc' : '#0F1A2E';
  const inputBg = isLight ? '#ffffff' : '#0F1A2E';
  const inputBorder = isLight ? '#cbd5e1' : '#243452';

  const isClosed = (w: PayrollWeek) => closures.some(c => c.branchId === branchFilter && c.weekFrom === w.from && c.weekTo === w.to);
  const targetWeekOptions = [...weeksOfMonth(activeMonth, cycle), ...weeksOfMonth(nextMonth(activeMonth), cycle)]
    .filter(w => !isClosed(w));

  const [adjustEdits, setAdjustEdits] = useState<Record<string, string>>({});
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustTargetWeek, setAdjustTargetWeek] = useState<PayrollWeek | null>(
    () => targetWeekOptions.find(w => w.to >= todayYMD()) ?? null,
  );

  const cols = getAdjustableCols();
  const rowsView = cols.map(col => {
    const from = paidColumnAmount(adjustRow.row, col.key, getColAccessor(col.key).get(adjustRow.row), priorPosted);
    const raw = adjustEdits[col.key];
    const to = raw === undefined || raw === '' ? from : num(raw);
    return { ...col, from, to, delta: Math.round((to - from) * 100) / 100 };
  });
  const net = Math.round(rowsView.reduce((sum, r) => sum + r.delta, 0) * 100) / 100;
  const canSubmit = net !== 0 || rowsView.some(r => r.delta !== 0);
  const paidTotal = Math.round(rowsView.reduce((sum, r) => sum + r.from, 0) * 100) / 100;
  const correctedTotal = Math.round((paidTotal + net) * 100) / 100;
  const isReleased = adjustRow.row.status === 'COMPLETE';
  const priorAdjustments = priorPosted;

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-start justify-between gap-3 px-6 py-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
          <div className="min-w-0">
            <div className="text-sm font-extrabold uppercase tracking-wide" style={{ color: textPrimary }}>Adjust Balance</div>
            <div className="text-xs font-semibold mt-1 truncate" style={{ color: textMuted }}>
              {adjustRow.row.customerName || 'No customer'} · {adjustRow.row.ticketNumber || 'No ticket'} · <span className="text-emerald-500">{displayInstallerName(adjustRow.row.installerName)}</span>
            </div>
            <div className="text-[11px] mt-1" style={{ color: textMuted }}>This week is closed and stays as paid. <b>Paid</b> is what was released to the tech{isReleased ? ' (payout completed)' : ''}{priorAdjustments.length > 0 ? `, including ${priorAdjustments.length} earlier adjustment${priorAdjustments.length === 1 ? '' : 's'}` : ''}. Enter the corrected amount per column — the difference is added or deducted in the open week you pick.</div>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] font-bold">
              <span className="px-2 py-1 rounded-lg" style={{ color: isReleased ? '#059669' : '#D97706', backgroundColor: isReleased ? (isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)') : (isLight ? '#fffbeb' : 'rgba(217,119,6,0.12)') }}>{isReleased ? 'Payout completed' : 'Payout not completed'}</span>
              <span className="px-2 py-1 rounded-lg tabular-nums" style={{ color: textPrimary, backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>Paid ₱{peso(paidTotal)}</span>
              <span className="px-2 py-1 rounded-lg tabular-nums" style={{ color: '#8B5CF6', backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.10)' }}>Corrected ₱{peso(correctedTotal)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all" style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }} aria-label="Close">
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_110px_120px_100px] gap-x-3 pb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>
            <span>Column</span><span className="text-right">Paid</span><span className="text-right">Corrected</span><span className="text-right">Difference</span>
          </div>
          {rowsView.map(r => (
            <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_110px_120px_100px] gap-x-3 items-center py-1.5" style={{ borderBottom: `1px solid ${border}` }}>
              <span className="text-xs font-bold truncate" style={{ color: textPrimary }}>{r.label}</span>
              <span className="text-xs tabular-nums text-right" style={{ color: textMuted }}>{r.from ? `₱${peso(r.from)}` : '—'}</span>
              <input
                type="number"
                step="0.01"
                placeholder={String(r.from || 0)}
                value={adjustEdits[r.key] ?? ''}
                onChange={e => setAdjustEdits(prev => ({ ...prev, [r.key]: e.target.value }))}
                className="w-full px-2 py-1 rounded-lg border text-xs font-semibold text-right tabular-nums outline-none focus:ring-2 focus:ring-violet-500/40"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
              <span className="text-xs font-bold tabular-nums text-right" style={{ color: r.delta === 0 ? textMuted : r.delta > 0 ? '#10B981' : (isLight ? '#DC2626' : '#F87171') }}>
                {r.delta === 0 ? '—' : (r.delta > 0 ? '+' : '−') + '₱' + peso(Math.abs(r.delta))}
              </span>
            </div>
          ))}
        </div>
        <div className="px-6 py-3 flex flex-col gap-3 shrink-0" style={{ borderTop: `1px solid ${border}`, backgroundColor: headerBg }}>
          <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.10)', border: `1px solid ${isLight ? '#ddd6fe' : 'rgba(139,92,246,0.3)'}` }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#8B5CF6' }}>Net adjustment ({net < 0 ? 'deduct' : 'add'})</span>
            <span className="text-lg font-extrabold tabular-nums" style={{ color: net < 0 ? (isLight ? '#DC2626' : '#F87171') : '#8B5CF6' }}>{net === 0 ? '₱0.00' : pesoSigned(net)}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Apply in week (open only)</span>
              <select
                value={adjustTargetWeek ? `${adjustTargetWeek.from}|${adjustTargetWeek.to}` : ''}
                onChange={e => { const [f, t] = e.target.value.split('|'); setAdjustTargetWeek(targetWeekOptions.find(w => w.from === f && w.to === t) || null) }}
                className="w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                <option value="">Select a week…</option>
                {targetWeekOptions.map(w => <option key={`${w.from}|${w.to}`} value={`${w.from}|${w.to}`}>{formatMonth(w.owningMonth)} — Week {w.weekNumber} ({w.label})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Reason (required)</span>
              <input
                type="text"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                placeholder="e.g. Computation error on grounding"
                className="w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </label>
          </div>
          {submitError && (
            <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ color: isLight ? '#B91C1C' : '#FCA5A5', backgroundColor: isLight ? '#fef2f2' : 'rgba(248,113,113,0.12)', border: `1px solid ${isLight ? '#fecaca' : 'rgba(248,113,113,0.3)'}` }}>{submitError}</div>
          )}
          <div className="flex items-center justify-end gap-3">
            {!(!canSubmit || !adjustTargetWeek || !adjustReason.trim()) ? null : (
              <span className="mr-auto text-[11px] font-semibold" style={{ color: '#D97706' }}>
                {!canSubmit ? 'Change at least one amount' : !adjustTargetWeek ? 'Pick an open week' : 'Type a reason to continue'}
              </span>
            )}
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-xs font-bold border hover:opacity-80 cursor-pointer" style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}>Cancel</button>
            <button
              type="button"
              onClick={() => { if (adjustTargetWeek) void onSubmit(adjustEdits, adjustTargetWeek, adjustReason) }}
              disabled={!canSubmit || !adjustTargetWeek || !adjustReason.trim() || adjustSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black text-white shadow-md disabled:opacity-50 cursor-pointer"
              style={{ background: '#8B5CF6' }}
            >
              {adjustSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{adjustSubmitting ? 'Posting…' : 'Post Adjustment'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
