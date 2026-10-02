import { useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface CompletePayoutModalProps {
  installerName: string;
  userFirstName: string;
  onClose: () => void;
  onComplete: (remarks: string) => void;
  displayInstallerName: (name: string) => string;
  /** Remarks already on the installer's payout, offered as the starting text. */
  initialRemarks?: string;
}

export default function CompletePayoutModal({
  installerName,
  userFirstName,
  onClose,
  onComplete,
  displayInstallerName,
  initialRemarks = ''
}: CompletePayoutModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const cardBg = isLight ? '#ffffff' : '#0A1120';
  const border = isLight ? '#e2e8f0' : '#1E2D48';
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0';
  const textMuted = isLight ? '#64748b' : '#7A95B8';
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E';
  const inputBorder = isLight ? '#cbd5e1' : '#243452';

  const [remarks, setRemarks] = useState(initialRemarks);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border animate-in zoom-in-95 duration-150"
        style={{ maxWidth: 460, backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: textPrimary }}>
              COMPLETE PAYOUT — {displayInstallerName(installerName).toUpperCase()}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors">
            <X className="w-4 h-4" style={{ color: textMuted }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
              COMPLETED BY
            </span>
            <div
              className="w-full rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wider select-none opacity-90"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: '#10B981' }}
            >
              {userFirstName}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
              DATE SUBMITTED
            </span>
            <div
              className="w-full rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wider select-none"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
              REMARKS (OPTIONAL)
            </span>
            <textarea
              rows={3}
              placeholder="ADD ANY REMARKS OR AUDIT NOTES..."
              value={remarks}
              onChange={e => setRemarks(e.target.value.toUpperCase())}
              className="w-full rounded-xl border p-3 text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 shrink-0 border-t" style={{ borderColor: border }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase transition-colors"
            style={{ color: textMuted, backgroundColor: isLight ? '#f1f5f9' : '#0d1520' }}
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={() => onComplete(remarks)}
            className="px-5 py-2 rounded-xl text-xs font-black uppercase text-white shadow-md active:scale-95 transition-all"
            style={{ backgroundColor: '#10B981' }}
          >
            SAVE &amp; COMPLETE
          </button>
        </div>
      </div>
    </div>
  );
}
