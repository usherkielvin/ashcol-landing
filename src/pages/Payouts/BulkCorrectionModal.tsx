import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { PayrollRow } from '../../utils/payrollDerive';
import type { PayrollCorrection } from '../../utils/payrollCorrectionsApi';
import { weeksOfMonth, nextMonth, formatMonth, todayYMD, type PayrollWeek, type WeekCycle } from '../../utils/payrollWeeks';
import type { PayrollWeekClosure } from './payoutUtils';
import { num, peso, pesoSigned, shortDate, paidColumnAmount, postedCorrectionsFor } from './payoutUtils';

export interface BulkCorrectionItem { row: PayrollRow; to: number }

interface BulkCorrectionModalProps {
  /** Every correctable ticket of the closed week on screen. */
  rows: PayrollRow[];
  corrections: PayrollCorrection[];
  closures: PayrollWeekClosure[];
  activeMonth: string;
  cycle: WeekCycle;
  branchFilter: string;
  getAdjustableCols: () => { key: string; label: string }[];
  getColAccessor: (key: string) => { get: (row: PayrollRow) => string | number | null | undefined };
  displayInstallerName: (name: string) => string;
  onClose: () => void;
  onSubmit: (items: BulkCorrectionItem[], col: { key: string; label: string }, targetWeek: PayrollWeek, reason: string) => Promise<void>;
  submitting: boolean;
  submitError?: string | null;
}

type Mode = 'set' | 'diff';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Corrects one fee column across many tickets of a closed week in a single post — e.g. Earth Grounding back to
 * zero on every ticket where the customer, not the company, carries it. Each ticket's difference from what it was
 * paid is added or deducted in the open week you pick; the closed week itself is not touched. Mounted only while open.
 */
export default function BulkCorrectionModal({
  rows,
  corrections,
  closures,
  activeMonth,
  cycle,
  branchFilter,
  getAdjustableCols,
  getColAccessor,
  displayInstallerName,
  onClose,
  onSubmit,
  submitting,
  submitError
}: BulkCorrectionModalProps) {
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
  const green = '#10B981';
  const violet = '#8B5CF6';

  const isClosed = (w: PayrollWeek) => closures.some(c => c.branchId === branchFilter && c.weekFrom === w.from && c.weekTo === w.to);
  const targetWeekOptions = [...weeksOfMonth(activeMonth, cycle), ...weeksOfMonth(nextMonth(activeMonth), cycle)].filter(w => !isClosed(w));

  const cols = getAdjustableCols();
  const [colKey, setColKey] = useState(() => (cols.find(c => c.key === 'earthGrounding') ?? cols[0])?.key ?? '');
  const [mode, setMode] = useState<Mode>('set');
  const [amount, setAmount] = useState('0');
  const [showEmpty, setShowEmpty] = useState(false);
  const [reason, setReason] = useState('');
  const [targetWeek, setTargetWeek] = useState<PayrollWeek | null>(() => targetWeekOptions.find(w => w.to >= todayYMD()) ?? null);
  const col = cols.find(c => c.key === colKey) ?? null;

  // What each ticket was paid in the chosen column, and what the correction would make it.
  const lines = useMemo(() => {
    if (!col) return [];
    const amt = num(amount);
    return rows.map(row => {
      const paid = paidColumnAmount(row, col.key, getColAccessor(col.key).get(row), postedCorrectionsFor(row, corrections));
      const to = round2(mode === 'set' ? amt : paid + amt);
      return { row, paid, to, delta: round2(to - paid) };
    });
    // getColAccessor reads from the rows themselves and is stable for a given column.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, corrections, col, mode, amount]);

  const amountValid = amount.trim() !== '' && !Number.isNaN(Number(amount));
  const visible = lines.filter(l => showEmpty || l.paid !== 0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(
    rows.filter(row => {
      const first = cols.find(c => c.key === 'earthGrounding') ?? cols[0];
      return first ? paidColumnAmount(row, first.key, getColAccessor(first.key).get(row), postedCorrectionsFor(row, corrections)) !== 0 : false;
    }).map(r => r.id)
  ));

  // Changing the column starts over with every ticket that has a value in it.
  const changeColumn = (key: string) => {
    setColKey(key);
    setSelected(new Set(rows.filter(row => paidColumnAmount(row, key, getColAccessor(key).get(row), postedCorrectionsFor(row, corrections)) !== 0).map(r => r.id)));
  };

  const chosen = amountValid ? lines.filter(l => selected.has(l.row.id) && l.delta !== 0) : [];
  const total = round2(chosen.reduce((sum, l) => sum + l.delta, 0));
  const byInstaller = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const l of visible) {
      const k = displayInstallerName(l.row.installerName);
      map.set(k, [...(map.get(k) ?? []), l]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setMany = (ids: string[], on: boolean) => setSelected(prev => {
    const next = new Set(prev);
    ids.forEach(id => { if (on) next.add(id); else next.delete(id); });
    return next;
  });

  const canSubmit = Boolean(col) && amountValid && chosen.length > 0 && Boolean(targetWeek) && reason.trim() !== '' && !submitting;
  const hint = !col ? 'Pick a column' : !amountValid ? 'Enter an amount' : chosen.length === 0 ? 'Select at least one ticket that changes' : !targetWeek ? 'Pick an open week' : 'Type a reason to continue';

  const inputCls = 'px-3 py-2 rounded-xl border text-xs font-bold outline-none';
  const inputStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary };
  const labelCls = 'text-[11px] font-black uppercase tracking-wider';

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-3xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-start justify-between gap-3 px-6 py-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
          <div className="min-w-0">
            <div className="text-sm font-extrabold uppercase tracking-wide" style={{ color: textPrimary }}>Bulk Correction</div>
            <div className="text-[11px] mt-1" style={{ color: textMuted }}>
              This week is closed and stays as paid. Pick one column and the tickets to correct — each ticket's difference from what it was paid is added or deducted in the open week you pick.
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all" style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }} aria-label="Close">
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="px-6 py-3 shrink-0 grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-3" style={{ borderBottom: `1px solid ${border}` }}>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: textMuted }}>Column</span>
            <select value={colKey} onChange={e => changeColumn(e.target.value)} className={inputCls} style={inputStyle}>
              {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: textMuted }}>Change</span>
            <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: inputBorder }}>
              {([['set', 'Set to'], ['diff', 'Add / deduct']] as [Mode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setAmount(m === 'set' ? '0' : ''); }}
                  className="flex-1 px-3 py-2 text-xs font-bold cursor-pointer"
                  style={{ backgroundColor: mode === m ? violet : inputBg, color: mode === m ? '#fff' : textMuted }}
                >{label}</button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: textMuted }}>{mode === 'set' ? 'New amount (₱)' : 'Difference (₱, − deducts)'}</span>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder={mode === 'set' ? '0' : '-100'} className={`${inputCls} text-right tabular-nums`} style={inputStyle} />
          </label>
        </div>

        <div className="px-6 py-2 shrink-0 flex items-center gap-3 flex-wrap text-[11px] font-semibold" style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>
          <button type="button" onClick={() => setMany(visible.map(l => l.row.id), true)} className="font-bold cursor-pointer hover:underline" style={{ color: violet }}>Select all</button>
          <button type="button" onClick={() => setMany(visible.map(l => l.row.id), false)} className="font-bold cursor-pointer hover:underline" style={{ color: violet }}>Clear</button>
          <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
            <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />
            Also show tickets with no {col?.label ?? 'value'}
          </label>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
          {byInstaller.length === 0 ? (
            <div className="py-12 text-center text-sm font-semibold" style={{ color: textMuted }}>No tickets in this week have a value in {col?.label ?? 'this column'}.</div>
          ) : byInstaller.map(([name, items]) => {
            const picked = items.filter(l => selected.has(l.row.id) && l.delta !== 0);
            const net = round2(picked.reduce((sum, l) => sum + l.delta, 0));
            return (
              <div key={name} className="py-2">
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <label className="flex items-center gap-2 text-xs font-extrabold cursor-pointer" style={{ color: textPrimary }}>
                    <input
                      type="checkbox"
                      checked={items.every(l => selected.has(l.row.id))}
                      onChange={e => setMany(items.map(l => l.row.id), e.target.checked)}
                    />
                    <span className="text-emerald-500">{name}</span>
                    <span className="font-semibold" style={{ color: textMuted }}>{picked.length} of {items.length}</span>
                  </label>
                  <span className="text-xs font-black tabular-nums" style={{ color: net === 0 ? textMuted : net < 0 ? red : green }}>{net === 0 ? '—' : pesoSigned(net)}</span>
                </div>
                {items.map(l => (
                  <label key={l.row.id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 py-1.5 pl-1 text-xs cursor-pointer" style={{ borderTop: `1px solid ${border}`, opacity: l.delta === 0 ? 0.5 : 1 }}>
                    <input type="checkbox" checked={selected.has(l.row.id)} onChange={() => toggle(l.row.id)} />
                    <span className="min-w-0 truncate" style={{ color: textPrimary }}>
                      <span className="font-bold text-emerald-500">{l.row.ticketNumber || 'No ticket'}</span>
                      {' · '}{l.row.customerName || 'No customer'}
                      <span style={{ color: textMuted }}> · {l.row.workDate ? shortDate(l.row.workDate) : 'No date'}</span>
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <span style={{ color: textMuted }}>₱{peso(l.paid)}</span>
                      <span style={{ color: textMuted }}>→</span>
                      <span className="font-bold" style={{ color: textPrimary }}>{amountValid ? `₱${peso(l.to)}` : '—'}</span>
                      <span className="font-black w-24 text-right" style={{ color: l.delta === 0 || !amountValid ? textMuted : l.delta < 0 ? red : green }}>
                        {!amountValid || l.delta === 0 ? 'no change' : pesoSigned(l.delta)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3 flex flex-col gap-3 shrink-0" style={{ borderTop: `1px solid ${border}`, backgroundColor: headerBg }}>
          <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.10)', border: `1px solid ${isLight ? '#ddd6fe' : 'rgba(139,92,246,0.3)'}` }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: violet }}>
              {chosen.length} ticket{chosen.length === 1 ? '' : 's'} · net ({total < 0 ? 'deduct' : 'add'})
            </span>
            <span className="text-lg font-extrabold tabular-nums" style={{ color: total < 0 ? red : violet }}>{total === 0 ? '₱0.00' : pesoSigned(total)}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls} style={{ color: textMuted }}>Apply in week (open only)</span>
              <select
                value={targetWeek ? `${targetWeek.from}|${targetWeek.to}` : ''}
                onChange={e => { const [f, t] = e.target.value.split('|'); setTargetWeek(targetWeekOptions.find(w => w.from === f && w.to === t) || null); }}
                className={`${inputCls} w-full`}
                style={inputStyle}
              >
                <option value="">Select a week…</option>
                {targetWeekOptions.map(w => <option key={`${w.from}|${w.to}`} value={`${w.from}|${w.to}`}>{formatMonth(w.owningMonth)} — Week {w.weekNumber} ({w.label})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls} style={{ color: textMuted }}>Reason (required, applies to all)</span>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Grounding is customer-shouldered"
                className={`${inputCls} w-full font-semibold`}
                style={inputStyle}
              />
            </label>
          </div>
          {submitError && (
            <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ color: isLight ? '#B91C1C' : '#FCA5A5', backgroundColor: isLight ? '#fef2f2' : 'rgba(248,113,113,0.12)', border: `1px solid ${isLight ? '#fecaca' : 'rgba(248,113,113,0.3)'}` }}>{submitError}</div>
          )}
          <div className="flex items-center justify-end gap-3">
            {!canSubmit && !submitting && <span className="mr-auto text-[11px] font-semibold" style={{ color: '#D97706' }}>{hint}</span>}
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-xs font-bold border hover:opacity-80 cursor-pointer" style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}>Cancel</button>
            <button
              type="button"
              onClick={() => { if (col && targetWeek) void onSubmit(chosen.map(l => ({ row: l.row, to: l.to })), col, targetWeek, reason); }}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black text-white shadow-md disabled:opacity-50 cursor-pointer"
              style={{ background: violet }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{submitting ? 'Posting…' : `Post ${chosen.length || ''} Correction${chosen.length === 1 ? '' : 's'}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
