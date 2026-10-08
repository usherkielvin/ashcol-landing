import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Undo2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { formatPersonName } from '../../utils/api';
import { parseCorrectionChanges, type CorrectionStatus, type PayrollCorrection } from '../../utils/payrollCorrectionsApi';
import { peso, pesoSigned, shortDate } from './payoutUtils';

interface CorrectionHistoryModalProps {
  corrections: PayrollCorrection[];
  currentBranchDisplay: string | null;
  onClose: () => void;
  displayInstallerName: (name: string) => string;
  /** Text the search box starts with (e.g. the ticket number the modal was opened from). */
  initialSearch?: string;
  /** Whether the Void button shows for this correction (payroll user, posted, target week still open). */
  canVoid: (c: PayrollCorrection) => boolean;
  onVoid: (c: PayrollCorrection) => void;
  voidingId: string | null;
}

type StatusFilter = 'ALL' | CorrectionStatus;

/** Every correction made to a closed week: who / when / which columns, and the week it was applied in. Mounted only while open. */
export default function CorrectionHistoryModal({
  corrections,
  currentBranchDisplay,
  onClose,
  displayInstallerName,
  initialSearch = '',
  canVoid,
  onVoid,
  voidingId
}: CorrectionHistoryModalProps) {
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

  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [installer, setInstaller] = useState('');

  const installers = Array.from(new Set(corrections.map(c => c.installerName))).sort((a, b) => a.localeCompare(b));
  const term = search.trim().toLowerCase();
  const shown = corrections
    .filter(c => status === 'ALL' || c.status === status)
    .filter(c => !installer || c.installerName === installer)
    .filter(c => !term
      || (c.originTicketNumber || '').toLowerCase().includes(term)
      || (c.originCustomer || '').toLowerCase().includes(term)
      || c.installerName.toLowerCase().includes(term)
      || c.reason.toLowerCase().includes(term))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // A voided correction no longer affects anyone's pay, so it stays out of the net.
  const net = shown.filter(c => c.status === 'POSTED').reduce((sum, c) => sum + c.netAmount, 0);

  const statusStyle = (s: CorrectionStatus) => s === 'POSTED'
    ? { label: 'Posted', color: '#059669', bg: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)' }
    : s === 'PENDING'
      ? { label: 'Pending', color: '#D97706', bg: isLight ? '#fffbeb' : 'rgba(217,119,6,0.12)' }
      : { label: 'Voided', color: textMuted, bg: isLight ? '#f1f5f9' : 'rgba(122,149,184,0.12)' };

  const selectCls = 'px-3 py-2 rounded-xl text-xs font-bold border outline-none cursor-pointer';
  const selectStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary };

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh', backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
          <div className="min-w-0">
            <div className="text-lg font-extrabold tracking-tight" style={{ color: textPrimary }}>Correction History</div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: textMuted }}>
              {currentBranchDisplay || 'Branch'} · {shown.length} correction{shown.length === 1 ? '' : 's'}
              {shown.length > 0 && <> · net posted <span className="font-bold" style={{ color: net < 0 ? red : '#10B981' }}>{pesoSigned(net)}</span></>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2.5 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all" style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }} aria-label="Close">
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        <div className="px-6 py-3 shrink-0 flex flex-col gap-2" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: textMuted }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ticket, customer, installer or reason…"
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm font-semibold border outline-none focus:ring-2 focus:ring-violet-500/30"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)} className={selectCls} style={selectStyle} aria-label="Filter by status">
              <option value="ALL">All statuses</option>
              <option value="POSTED">Posted</option>
              <option value="PENDING">Pending</option>
              <option value="VOID">Voided</option>
            </select>
            <select value={installer} onChange={e => setInstaller(e.target.value)} className={selectCls} style={selectStyle} aria-label="Filter by installer">
              <option value="">All installers</option>
              {installers.map(name => <option key={name} value={name}>{displayInstallerName(name)}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3" style={{ backgroundColor: headerBg }}>
          {shown.length === 0 ? (
            <div className="py-16 text-center text-sm font-semibold" style={{ color: textMuted }}>No corrections found.</div>
          ) : (
            shown.map(c => {
              const st = statusStyle(c.status);
              const dimmed = c.status === 'VOID';
              const when = new Date(c.createdAt);
              return (
                <div key={c.id} className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border, opacity: dimmed ? 0.65 : 1 }}>
                  <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-lg font-black tracking-tight text-emerald-500">{c.originTicketNumber || 'No ticket'}</span>
                        <span className="text-sm font-bold break-words" style={{ color: textPrimary }}>{c.originCustomer}</span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide" style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span>
                      </div>
                      <div className="text-xs font-bold mt-0.5" style={{ color: textMuted }}>
                        {displayInstallerName(c.installerName)}
                        {c.originWeekFrom && c.originWeekTo && <> · closed week {shortDate(c.originWeekFrom)} – {shortDate(c.originWeekTo)}</>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>{c.netAmount < 0 ? 'Deducted' : 'Added'}</div>
                      <div className="text-xl font-black tabular-nums leading-tight" style={{ color: c.netAmount < 0 ? red : '#10B981', textDecoration: dimmed ? 'line-through' : 'none' }}>{pesoSigned(c.netAmount)}</div>
                    </div>
                  </div>

                  <div className="mx-4 mb-3 rounded-xl border overflow-hidden" style={{ borderColor: border }}>
                    {parseCorrectionChanges(c).map((ch, i) => (
                      <div key={ch.key} className="flex items-center justify-between gap-3 px-3 py-2 text-xs" style={{ borderTop: i > 0 ? `1px solid ${border}` : 'none' }}>
                        <span className="font-bold" style={{ color: textPrimary }}>{ch.label}</span>
                        <span className="flex items-center gap-2 tabular-nums">
                          <span style={{ color: textMuted }}>₱{peso(ch.from)}</span>
                          <span style={{ color: textMuted }}>→</span>
                          <span className="font-bold" style={{ color: textPrimary }}>₱{peso(ch.to)}</span>
                          <span
                            className="font-black px-1.5 py-0.5 rounded"
                            style={{ color: ch.delta < 0 ? red : '#10B981', backgroundColor: ch.delta < 0 ? (isLight ? '#fef2f2' : 'rgba(248,113,113,0.12)') : (isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)') }}
                          >
                            {ch.delta > 0 ? '+' : '−'}₱{peso(Math.abs(ch.delta))}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="px-4 py-3 flex flex-col gap-1.5 text-xs" style={{ borderTop: `1px solid ${border}`, backgroundColor: headerBg }}>
                    <div style={{ color: textPrimary }}><span className="font-bold">Reason:</span> <span style={{ color: textMuted }}>{c.reason || '—'}</span></div>
                    {c.status === 'VOID' && (
                      <div style={{ color: textMuted }}>
                        Voided by <span className="font-bold" style={{ color: textPrimary }}>{formatPersonName(c.voidedBy || '')}</span>
                        {c.voidReason ? ` — ${c.voidReason}` : ''}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 flex-wrap" style={{ color: textMuted }}>
                      <span>
                        By <span className="font-bold" style={{ color: textPrimary }}>{formatPersonName(c.createdBy)}</span>
                        {' · '}{when.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' '}{when.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className="flex items-center gap-2">
                        {c.targetWeekFrom && c.targetWeekTo && (
                          <span className="font-semibold px-2 py-0.5 rounded-md" style={{ color: '#8B5CF6', backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.14)' }}>
                            Applied in {shortDate(c.targetWeekFrom)} – {shortDate(c.targetWeekTo)}
                          </span>
                        )}
                        {canVoid(c) && (
                          <button
                            type="button"
                            onClick={() => onVoid(c)}
                            disabled={voidingId === c.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors hover:border-rose-500/50 hover:text-rose-500 disabled:opacity-50 cursor-pointer"
                            style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
                          >
                            <Undo2 className="w-3 h-3" />
                            {voidingId === c.id ? 'Voiding…' : 'Void'}
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
