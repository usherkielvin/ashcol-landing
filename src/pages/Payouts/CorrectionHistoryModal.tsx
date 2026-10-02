import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { formatPersonName } from '../../utils/api';
import type { PayrollRow } from '../../utils/payrollDerive';
import { parseAdjustmentLog } from '../../utils/payrollDerive';
import { peso, pesoSigned, shortDate } from './payoutUtils';

interface CorrectionHistoryModalProps {
  corrections: { row: PayrollRow; month: string }[];
  currentBranchDisplay: string | null;
  onClose: () => void;
  displayInstallerName: (name: string) => string;
  /** Text the search box starts with (e.g. the ticket number the modal was opened from). */
  initialSearch?: string;
}

/** Every logged balance adjustment, with who / when / which columns. Mounted only while open. */
export default function CorrectionHistoryModal({
  corrections,
  currentBranchDisplay,
  onClose,
  displayInstallerName,
  initialSearch = ''
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

  const [correctionsSearch, setCorrectionsSearch] = useState(initialSearch);

  const term = correctionsSearch.trim().toLowerCase();
  const entries = corrections.flatMap(({ row }) => parseAdjustmentLog(row).map(entry => ({ row, entry })))
    .filter(({ row }) => !term || (row.ticketNumber || '').toLowerCase().includes(term) || row.customerName.toLowerCase().includes(term) || row.installerName.toLowerCase().includes(term))
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at));

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh', backgroundColor: cardBg, borderColor: border }}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 shrink-0" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${border}` }}>
          <div className="min-w-0">
            <div className="text-lg font-extrabold tracking-tight" style={{ color: textPrimary }}>Correction History</div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: textMuted }}>
              {currentBranchDisplay || 'Branch'} · {entries.length} correction{entries.length === 1 ? '' : 's'} · last 3 months
              {entries.length > 0 && <> · net <span className="font-bold" style={{ color: entries.reduce((sum, e) => sum + e.entry.net, 0) < 0 ? (isLight ? '#DC2626' : '#F87171') : '#10B981' }}>{pesoSigned(entries.reduce((sum, e) => sum + e.entry.net, 0))}</span></>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2.5 rounded-full shrink-0 border cursor-pointer hover:bg-red-500 hover:border-red-500 hover:text-white transition-all" style={{ color: textMuted, backgroundColor: inputBg, borderColor: inputBorder }} aria-label="Close">
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        <div className="px-6 py-3 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: textMuted }} />
            <input
              type="text"
              value={correctionsSearch}
              onChange={e => setCorrectionsSearch(e.target.value)}
              placeholder="Search ticket, customer or installer…"
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm font-semibold border outline-none focus:ring-2 focus:ring-violet-500/30"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3" style={{ backgroundColor: headerBg }}>
          {entries.length === 0 ? (
            <div className="py-16 text-center text-sm font-semibold" style={{ color: textMuted }}>No corrections logged.</div>
          ) : (
            entries.map(({ row, entry }) => {
              const red = isLight ? '#DC2626' : '#F87171';
              return (
                <div key={entry.id} className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
                  <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-lg font-black tracking-tight text-emerald-500">{row.ticketNumber || 'No ticket'}</span>
                        <span className="text-sm font-bold break-words" style={{ color: textPrimary }}>{row.customerName}</span>
                      </div>
                      <div className="text-xs font-bold mt-0.5" style={{ color: textMuted }}>{displayInstallerName(row.installerName)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>{entry.net < 0 ? 'Deducted' : 'Added'}</div>
                      <div className="text-xl font-black tabular-nums leading-tight" style={{ color: entry.net < 0 ? red : '#10B981' }}>{pesoSigned(entry.net)}</div>
                    </div>
                  </div>

                  <div className="mx-4 mb-3 rounded-xl border overflow-hidden" style={{ borderColor: border }}>
                    {entry.changes.map((c, i) => (
                      <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2 text-xs" style={{ borderTop: i > 0 ? `1px solid ${border}` : 'none' }}>
                        <span className="font-bold" style={{ color: textPrimary }}>{c.label}</span>
                        <span className="flex items-center gap-2 tabular-nums">
                          <span style={{ color: textMuted }}>₱{peso(c.from)}</span>
                          <span style={{ color: textMuted }}>→</span>
                          <span className="font-bold" style={{ color: textPrimary }}>₱{peso(c.to)}</span>
                          <span
                            className="font-black px-1.5 py-0.5 rounded"
                            style={{ color: c.delta < 0 ? red : '#10B981', backgroundColor: c.delta < 0 ? (isLight ? '#fef2f2' : 'rgba(248,113,113,0.12)') : (isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)') }}
                          >
                            {c.delta > 0 ? '+' : '−'}₱{peso(Math.abs(c.delta))}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="px-4 py-3 flex flex-col gap-1.5 text-xs" style={{ borderTop: `1px solid ${border}`, backgroundColor: headerBg }}>
                    <div style={{ color: textPrimary }}><span className="font-bold">Reason:</span> <span style={{ color: textMuted }}>{entry.reason || '—'}</span></div>
                    <div className="flex items-center justify-between gap-3 flex-wrap" style={{ color: textMuted }}>
                      <span>
                        By <span className="font-bold" style={{ color: textPrimary }}>{formatPersonName(entry.by)}</span>
                        {' · '}{new Date(entry.at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' '}{new Date(entry.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className="font-semibold px-2 py-0.5 rounded-md" style={{ color: '#8B5CF6', backgroundColor: isLight ? '#f5f3ff' : 'rgba(139,92,246,0.14)' }}>
                        Applied in {shortDate(entry.targetWeekFrom)} – {shortDate(entry.targetWeekTo)}
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
