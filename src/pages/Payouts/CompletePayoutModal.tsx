import { useState } from 'react';
import { CheckCircle2, ShieldCheck, Unlock, X, AlertTriangle, Mail, MailWarning } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { peso, avatarColor, getInitials } from './payoutUtils';
import { emailedDay, maskEmail } from './payoutEmail';

interface CompletePayoutModalProps {
  installerName: string;
  userDisplayName: string;
  userFirstName: string;
  userRole?: string;
  totalAmount?: number;
  jobCount?: number;
  jobBreakdown?: string;
  isAlreadyComplete?: boolean;
  auditedBy?: string;
  isWeekClosed?: boolean;
  canManagePayroll?: boolean;
  onClose: () => void;
  /** `sendEmail` is the state of the "Email payout to technician" checkbox (always false when no address is on file). */
  onComplete: (remarks: string, validatorName: string, sendEmail: boolean) => void;
  onRevertToPending?: () => void;
  displayInstallerName: (name: string) => string;
  /** Remarks already on the installer's payout, offered as the starting text. */
  initialRemarks?: string;
  /** Personal email saved on the technician's account; empty when there is none. */
  recipientEmail?: string;
  /** False when the installer on the sheet could not be matched to an account at all. */
  hasAccount?: boolean;
  /** An earlier successful payout email for this installer-week, if any (re-completed payouts). */
  previousEmail?: { sentAt: string; net: number | null } | null;
}

export default function CompletePayoutModal({
  installerName,
  userDisplayName,
  userFirstName,
  userRole = 'PAYROLL AUDITOR',
  totalAmount = 0,
  jobCount = 0,
  jobBreakdown = '',
  isAlreadyComplete = false,
  auditedBy = '',
  isWeekClosed = false,
  canManagePayroll = true,
  onClose,
  onComplete,
  onRevertToPending,
  displayInstallerName,
  initialRemarks = '',
  recipientEmail = '',
  hasAccount = true,
  previousEmail = null,
}: CompletePayoutModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const cardBg = isLight ? '#ffffff' : '#0B1320';
  const border = isLight ? '#e2e8f0' : '#1E2D48';
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0';
  const textMuted = isLight ? '#64748b' : '#7A95B8';
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E';
  const inputBorder = isLight ? '#cbd5e1' : '#243452';
  const cardInnerBg = isLight ? '#f8fafc' : '#0F1A2E';

  const [remarks, setRemarks] = useState(initialRemarks);
  const [confirmed, setConfirmed] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);

  // A first completion emails by default. A payout that was already emailed is not mailed again
  // automatically — payroll opts in, and the box starts ticked only when the net changed since.
  const canEmail = recipientEmail.trim() !== '';
  const netChangedSinceEmail = previousEmail != null && previousEmail.net != null && Math.abs(previousEmail.net - totalAmount) >= 0.01;
  const [sendEmail, setSendEmail] = useState(previousEmail ? netChangedSinceEmail : true);

  const formattedInstallerName = displayInstallerName(installerName).toUpperCase();
  const validatorName = (userDisplayName || userFirstName || 'ADMIN').toUpperCase();
  const effectiveAudited = (auditedBy || userDisplayName || userFirstName || 'ADMIN').toUpperCase();
  const formattedDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border animate-in zoom-in-95 duration-150"
        style={{ maxWidth: 510, backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4.5 shrink-0"
          style={{
            borderBottom: `1px solid ${border}`,
            backgroundColor: isLight ? '#f8fafc' : '#0d1726',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
              style={{
                backgroundColor: isAlreadyComplete
                  ? (isLight ? '#dcfce7' : 'rgba(16, 185, 129, 0.2)')
                  : (isLight ? '#e0f2fe' : 'rgba(14, 165, 233, 0.2)'),
                color: isAlreadyComplete ? '#10b981' : '#0284c7',
              }}
            >
              {isAlreadyComplete ? (
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide leading-snug" style={{ color: textPrimary }}>
                {isAlreadyComplete ? 'FINALIZED PAYOUT DETAILS' : 'FINALIZE PAYOUT COMPLETION'}
              </h2>
              <p className="text-[11px] font-semibold" style={{ color: textMuted }}>
                {isAlreadyComplete
                  ? 'This payout has been audited, validated, and finalized.'
                  : `Formally validate and finalize payout for ${formattedInstallerName}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" style={{ color: textMuted }} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col gap-4.5 overflow-y-auto max-h-[calc(85vh-130px)]">
          {/* 1. Installer & Net Amount Summary Card */}
          <div
            className="rounded-xl border p-4 flex items-center justify-between gap-3 shadow-2xs"
            style={{ backgroundColor: cardInnerBg, borderColor: border }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 shadow-xs"
                style={{ background: avatarColor(installerName) }}
              >
                {getInitials(formattedInstallerName)}
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="text-xs font-black uppercase tracking-tight truncate" style={{ color: textPrimary }}>
                  {formattedInstallerName}
                </span>
                <span className="text-[11px] font-semibold truncate mt-0.5" style={{ color: textMuted }}>
                  <b className="tabular-nums" style={{ color: textPrimary }}>{jobCount}</b> completed
                  {jobBreakdown ? ` · ${jobBreakdown}` : ''}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0 pl-2">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                NET PAYOUT
              </span>
              <span
                className="text-base font-black tabular-nums tracking-tight mt-0.5"
                style={{ color: totalAmount < 0 ? '#ef4444' : '#10b981' }}
              >
                {totalAmount < 0 ? '−' : ''}₱{peso(Math.abs(totalAmount))}
              </span>
            </div>
          </div>

          {/* 2. Official Validation & Sign-Off Notice */}
          <div
            className="rounded-xl border p-4 flex flex-col gap-3 shadow-2xs"
            style={{
              backgroundColor: isAlreadyComplete
                ? (isLight ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.08)')
                : (isLight ? '#f0fdf4' : 'rgba(16, 185, 129, 0.09)'),
              borderColor: isLight ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.35)',
            }}
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b" style={{ borderColor: isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.2)' }}>
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider" style={{ color: isLight ? '#047857' : '#34d399' }}>
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{isAlreadyComplete ? 'VALIDATED & FINALIZED AUDIT' : 'OFFICIAL AUDIT & VALIDATION SIGN-OFF'}</span>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md" style={{ backgroundColor: isLight ? '#dcfce7' : 'rgba(16, 185, 129, 0.2)', color: isLight ? '#15803d' : '#86efac' }}>
                {isAlreadyComplete ? 'COMPLETED & CLOSED' : 'PENDING APPROVAL'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  {isAlreadyComplete ? 'VALIDATED BY' : 'AUDITING USER'}
                </span>
                <span className="font-extrabold uppercase text-[12px] truncate" style={{ color: isLight ? '#065f46' : '#6ee7b7' }}>
                  {isAlreadyComplete ? effectiveAudited : validatorName}
                </span>
                {!isAlreadyComplete && userRole ? (
                  <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                    {userRole}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  VALIDATION DATE
                </span>
                <span className="font-bold tabular-nums text-[12px]" style={{ color: textPrimary }}>
                  {formattedDate}
                </span>
              </div>
            </div>

            <p className="text-[11.5px] font-medium leading-relaxed" style={{ color: isLight ? '#1e293b' : '#cbd5e1' }}>
              {isAlreadyComplete ? (
                <>
                  This payout for <strong className="font-bold">{formattedInstallerName}</strong> in the amount of{' '}
                  <strong className="font-bold text-emerald-600 dark:text-emerald-400">₱{peso(Math.abs(totalAmount))}</strong> has been validated and completed by{' '}
                  <strong className="font-bold">{effectiveAudited}</strong>.
                </>
              ) : (
                <>
                  I hereby confirm and validate that all completed jobs, remittances, and deductions for{' '}
                  <strong className="font-bold">{formattedInstallerName}</strong> have been reviewed. This payout is finalized as{' '}
                  <strong className="font-bold text-emerald-600 dark:text-emerald-400">COMPLETED</strong> under the validation of{' '}
                  <strong className="font-bold">{validatorName}</strong>.
                </>
              )}
            </p>

            {/* Checkbox confirmation when completing */}
            {!isAlreadyComplete && (
              <label className="flex items-start gap-2.5 pt-2 mt-0.5 border-t border-dashed cursor-pointer select-none" style={{ borderColor: isLight ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.25)' }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600 shrink-0"
                />
                <span className="text-xs font-bold leading-snug" style={{ color: textPrimary }}>
                  I confirm and hereby finalize this payout as Completed & Closed.
                </span>
              </label>
            )}
          </div>

          {/* 3. Remarks / Audit Notes */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
              AUDIT REMARKS / NOTES {isAlreadyComplete ? '' : '(OPTIONAL)'}
            </span>
            {isAlreadyComplete ? (
              <div
                className="w-full rounded-xl border p-3 text-xs font-semibold uppercase leading-relaxed"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                {remarks || 'NO REMARKS RECORDED'}
              </div>
            ) : (
              <textarea
                rows={2}
                placeholder="ADD AUDIT REMARKS (E.G. VERIFIED AGAINST JOBS AND BANK REMITTANCE)..."
                value={remarks}
                onChange={e => setRemarks(e.target.value.toUpperCase())}
                className="w-full rounded-xl border p-3 text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none transition-colors"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            )}
          </div>

          {/* 4. Payout email to the technician — recipient comes from the account, never typed here */}
          {!isAlreadyComplete && (
            canEmail ? (
              <label
                className="flex items-start gap-2.5 rounded-xl border p-3.5 cursor-pointer select-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              >
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={e => setSendEmail(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded focus:ring-emerald-500 cursor-pointer accent-emerald-600 shrink-0"
                />
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: textPrimary }}>
                    <Mail className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    {previousEmail ? 'Email updated payout to technician' : 'Email payout to technician'}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: textMuted }}>
                    Payout email will be sent to <b className="font-bold" style={{ color: textPrimary }}>{maskEmail(recipientEmail)}</b>
                  </span>
                  {previousEmail && (
                    <span className="text-[11px] font-medium" style={{ color: textMuted }}>
                      Last emailed {emailedDay(previousEmail.sentAt)}
                      {previousEmail.net != null ? ` for ₱${peso(previousEmail.net)}` : ''}
                      {netChangedSinceEmail ? ' — the net has changed since.' : ' — the net is unchanged.'}
                    </span>
                  )}
                </span>
              </label>
            ) : (
              <div
                className="flex items-start gap-2.5 rounded-xl border p-3.5 text-xs"
                style={{
                  backgroundColor: isLight ? '#fffbeb' : 'rgba(245, 158, 11, 0.1)',
                  borderColor: isLight ? '#fcd34d' : 'rgba(245, 158, 11, 0.35)',
                  color: isLight ? '#92400e' : '#fbbf24',
                }}
              >
                <MailWarning className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-semibold leading-snug">
                  {hasAccount
                    ? 'No personal email on this account. Add one in Employees to send the payout email.'
                    : 'This installer could not be matched to an account, so no payout email can be sent.'}
                  {' '}Completing still works; nothing will be sent.
                </span>
              </div>
            )
          )}

          {/* Revert confirmation warning if reverting to pending */}
          {showRevertConfirm && (
            <div
              className="rounded-xl border p-3.5 flex items-start gap-2.5 text-xs animate-in fade-in"
              style={{
                backgroundColor: isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.1)',
                borderColor: isLight ? '#fca5a5' : 'rgba(239, 68, 68, 0.3)',
                color: isLight ? '#991b1b' : '#fca5a5',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 flex flex-col gap-2">
                <span className="font-bold">
                  Are you sure you want to revert this payout back to PENDING?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onRevertToPending?.();
                      onClose();
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-black uppercase bg-red-600 text-white shadow-xs hover:bg-red-700 cursor-pointer"
                  >
                    Yes, Revert to Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRevertConfirm(false)}
                    className="px-3 py-1 rounded-lg text-xs font-bold uppercase transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                    style={{ color: textMuted }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4 shrink-0 border-t"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1726' }}
        >
          {isAlreadyComplete ? (
            <>
              <div>
                {!isWeekClosed && canManagePayroll && !showRevertConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowRevertConfirm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all duration-150 text-amber-600 hover:bg-amber-500/10 cursor-pointer border border-transparent hover:border-amber-500/30"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Revert to Pending</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-xs active:scale-95 transition-all cursor-pointer"
                style={{ backgroundColor: '#10b981' }}
              >
                CLOSE
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors hover:bg-slate-500/10 cursor-pointer"
                style={{ color: textMuted }}
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={!confirmed}
                onClick={() => onComplete(remarks, validatorName, canEmail && sendEmail)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{ backgroundColor: '#10b981' }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>CONFIRM &amp; FINALIZE PAYOUT</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
