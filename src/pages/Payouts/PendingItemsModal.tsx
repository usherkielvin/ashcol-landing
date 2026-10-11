import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { formatPersonName } from '../../utils/api';
import { parseCorrectionChanges, type PayrollCorrection } from '../../utils/payrollCorrectionsApi';
import { weeksOfMonth, nextMonth, formatMonth, todayYMD, type PayrollWeek, type WeekCycle } from '../../utils/payrollWeeks';
import type { PayrollWeekClosure } from './payoutUtils';
import { pesoSigned, shortDate } from './payoutUtils';

/** What the user supplies to post a flagged item: a ticket item names a column + corrected amount, an installer-level item an amount. */
export interface PostPendingExtra {
  changes?: { key: string; label: string; to: number }[];
  amount?: number;
}

interface PendingItemsModalProps {
  /** PENDING corrections for the branch, any week. */
  items: PayrollCorrection[];
  closures: PayrollWeekClosure[];
  activeMonth: string;
  cycle: WeekCycle;
  branchFilter: string;
  currentBranchDisplay: string | null;
  getAdjustableCols: () => { key: string; label: string }[];
  displayInstallerName: (name: string) => string;
  onClose: () => void;
  onPost: (item: PayrollCorrection, targetWeek: PayrollWeek, extra: PostPendingExtra) => Promise<void>;
  onDismiss: (item: PayrollCorrection, reason: string) => Promise<void>;
  /** The id of the item being posted / dismissed right now. */
  busyId: string | null;
  error?: string | null;
}

const daysOld = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** Things recorded to settle later against a closed week. Post one to an open week, or dismiss it with a reason. Mounted only while open. */
export default function PendingItemsModal({
  items,
  closures,
  activeMonth,
  cycle,
  branchFilter,
  currentBranchDisplay,
  getAdjustableCols,
  displayInstallerName,
  onClose,
  onPost,
  onDismiss,
  busyId,
  error
}: PendingItemsModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const cardBg = isLight ? '#ffffff' : '#0A1120';
  const border = isLight ? '#e2e8f0' : '#1E2D48';
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0';
  const textMuted = isLight ? '#64748b' : '#7A95B8';
  const headerBg = isLight ? '#f8fafc' : '#0F1A2E';
  const inputBg = isLight ? '#ffffff' : '#0F1A2E';
  const inputBorder = isLight ? '#cbd5e1' : '#243452';
  const red = isLight ? '#DC2626' : '#F87171';
  const amber = '#D97706';

  const isClosed = (w: PayrollWeek) => closures.some(c => c.branchId === branchFilter && c.weekFrom === w.from && c.weekTo === w.to);
  const targetWeekOptions = [...weeksOfMonth(activeMonth, cycle), ...weeksOfMonth(nextMonth(activeMonth), cycle)].filter(w => !isClosed(w));
  const cols = getAdjustableCols();

  // One item at a time is expanded into its post / dismiss form.
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'post' | 'dismiss'>('post');
  const [weekKey, setWeekKey] = useState('');
  const [colKey, setColKey] = useState('');
  const [amount, setAmount] = useState('');
  const [dismissReason, setDismissReason] = useState('');

  const open = (c: PayrollCorrection, m: 'post' | 'dismiss') => {
    setOpenId(c.id);
    setMode(m);
    const defaultWeek = targetWeekOptions.find(w => w.to >= todayYMD()) ?? targetWeekOptions[0];
    setWeekKey(defaultWeek ? `${defaultWeek.from}|${defaultWeek.to}` : '');
    setColKey(cols.find(x => x.key === 'earthGrounding')?.key ?? cols[0]?.key ?? '');
    // An installer-level item flagged with an amount offers it back for confirmation.
    const stored = parseCorrectionChanges(c).reduce((sum, ch) => sum + ch.delta, 0);
    setAmount(c.originEntryId === null && stored !== 0 ? String(stored) : '');
    setDismissReason('');
  };

  const byInstaller = Array.from(
    items.reduce((map, c) => map.set(c.installerName, [...(map.get(c.installerName) ?? []), c]), new Map<string, PayrollCorrection[]>())
  ).sort((a, b) => displayInstallerName(a[0]).localeCompare(displayInstallerName(b[0])));

  const inputCls = 'px-3 py-2 rounded-xl border text-xs font-bold outline-none';
  const inputStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary };
  const labelCls = 'text-[10px] font-black uppercase tracking-wider';

  const renderForm = (c: PayrollCorrection) => {
    const week = targetWeekOptions.find(w => `${w.from}|${w.to}` === weekKey) ?? null;
    const busy = busyId === c.id;
    if (mode === 'dismiss') {
      return (
        <div className="flex flex-col gap-2 px-4 py-3" style={{ borderTop: `1px solid ${border}`, backgroundColor: headerBg }}>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: textMuted }}>Why is this being dismissed? (required)</span>
            <input type="text" value={dismissReason} onChange={e => setDismissReason(e.target.value)} placeholder="e.g. Customer paid the hauling fee" className={`${inputCls} font-semibold`} style={inputStyle} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenId(null)} className="px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer" style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}>Cancel</button>
            <button
              type="button"
              disabled={!dismissReason.trim() || busy}
              onClick={() => void onDismiss(c, dismissReason.trim()).then(() => setOpenId(null), () => { /* the parent shows the error; keep the form open */ })}
              className="px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 cursor-pointer flex items-center gap-2"
              style={{ background: '#64748b' }}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Dismiss
            </button>
          </div>
        </div>
      );
    }
    const ticketLevel = c.originEntryId !== null;
    const col = cols.find(x => x.key === colKey) ?? null;
    const amountOk = amount.trim() !== '' && !Number.isNaN(Number(amount)) && (ticketLevel || Number(amount) !== 0);
    const canPost = Boolean(week) && amountOk && (!ticketLevel || Boolean(col)) && !busy;
    return (
      <div className="flex flex-col gap-2 px-4 py-3" style={{ borderTop: `1px solid ${border}`, backgroundColor: headerBg }}>
        <div className={`grid grid-cols-1 ${ticketLevel ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2`}>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: textMuted }}>Apply in week (open only)</span>
            <select value={weekKey} onChange={e => setWeekKey(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">Select a week…</option>
              {targetWeekOptions.map(w => <option key={`${w.from}|${w.to}`} value={`${w.from}|${w.to}`}>{formatMonth(w.owningMonth)} — Week {w.weekNumber} ({w.label})</option>)}
            </select>
          </label>
          {ticketLevel && (
            <label className="flex flex-col gap-1">
              <span className={labelCls} style={{ color: textMuted }}>Column</span>
              <select value={colKey} onChange={e => setColKey(e.target.value)} className={inputCls} style={inputStyle}>
                {cols.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: textMuted }}>{ticketLevel ? 'Corrected amount (₱)' : 'Amount (₱, − deducts)'}</span>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder={ticketLevel ? '0' : '-350'} className={`${inputCls} text-right tabular-nums`} style={inputStyle} />
          </label>
        </div>
        {ticketLevel && (
          <div className="text-[11px]" style={{ color: textMuted }}>
            The difference from what this column was paid is added or deducted in that week. For several columns, use Adjust Balance on the ticket and then dismiss this item.
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setOpenId(null)} className="px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer" style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}>Cancel</button>
          <button
            type="button"
            disabled={!canPost}
            onClick={() => {
              if (!week) return;
              const extra: PostPendingExtra = ticketLevel && col
                ? { changes: [{ key: col.key, label: col.label, to: Number(amount) }] }
                : { amount: Number(amount) };
              void onPost(c, week, extra).then(() => setOpenId(null), () => { /* the parent shows the error; keep the form open */ });
            }}
            className="px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 cursor-pointer flex items-center gap-2"
            style={{ background: '#8B5CF6' }}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Post to Week
          </button>
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh', backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
          <div className="min-w-0">
            <div className="text-lg font-extrabold tracking-tight" style={{ color: textPrimary }}>Pending Items</div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: textMuted }}>
              {currentBranchDisplay || 'Branch'} · {items.length} waiting to be settled against a closed week
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2.5 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all" style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }} aria-label="Close">
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        {error && (
          <div className="mx-5 mt-3 rounded-xl px-3 py-2 text-xs font-semibold" style={{ color: isLight ? '#B91C1C' : '#FCA5A5', backgroundColor: isLight ? '#fef2f2' : 'rgba(248,113,113,0.12)', border: `1px solid ${isLight ? '#fecaca' : 'rgba(248,113,113,0.3)'}` }}>{error}</div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4" style={{ backgroundColor: headerBg }}>
          {items.length === 0 ? (
            <div className="py-16 text-center text-sm font-semibold" style={{ color: textMuted }}>Nothing pending. Flag a ticket or add an item from a closed week.</div>
          ) : byInstaller.map(([name, list]) => (
            <div key={name} className="flex flex-col gap-2">
              <div className="text-xs font-extrabold uppercase tracking-wide text-emerald-500">{displayInstallerName(name)} <span style={{ color: textMuted }}>· {list.length}</span></div>
              {list.map(c => {
                const stored = parseCorrectionChanges(c).reduce((sum, ch) => sum + ch.delta, 0);
                const age = daysOld(c.createdAt);
                return (
                  <div key={c.id} className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
                    <div className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex flex-col gap-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          {c.originEntryId !== null ? (
                            <>
                              <span className="text-sm font-black text-emerald-500">{c.originTicketNumber || 'No ticket'}</span>
                              <span className="text-xs font-bold break-words" style={{ color: textPrimary }}>{c.originCustomer}</span>
                            </>
                          ) : (
                            <span className="text-sm font-black" style={{ color: textPrimary }}>No ticket · installer-level</span>
                          )}
                        </div>
                        <div className="text-xs" style={{ color: textPrimary }}>{c.reason}</div>
                        <div className="text-[11px] font-semibold" style={{ color: textMuted }}>
                          {c.originWeekFrom && c.originWeekTo && <>closed week {shortDate(c.originWeekFrom)} – {shortDate(c.originWeekTo)} · </>}
                          flagged by {formatPersonName(c.createdBy)} · <span style={{ color: age >= 7 ? amber : textMuted }}>{age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-black tabular-nums" style={{ color: stored === 0 ? textMuted : stored < 0 ? red : '#10B981' }}>{stored === 0 ? 'amount not set' : pesoSigned(stored)}</div>
                        {openId !== c.id && (
                          <div className="flex items-center gap-2 mt-2 justify-end">
                            <button type="button" onClick={() => open(c, 'post')} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white cursor-pointer" style={{ background: '#8B5CF6' }}>Post to week</button>
                            <button type="button" onClick={() => open(c, 'dismiss')} className="px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer" style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}>Dismiss</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {openId === c.id && renderForm(c)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
