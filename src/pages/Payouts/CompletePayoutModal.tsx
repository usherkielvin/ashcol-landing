import { useState, type ReactNode } from 'react';
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
  const accent = isLight ? '#047857' : '#34D399';
  const accentSoft = isLight ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.14)';

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

  const label = (text: string) => (
    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{text}</span>
  );
  const fact = (title: string, value: ReactNode, sub?: string) => (
    <div className="flex flex-col gap-1 min-w-0">
      {label(title)}
      <span className="text-sm font-bold truncate" style={{ color: textPrimary }}>{value}</span>
      {sub ? <span className="text-[11px] font-medium uppercase" style={{ color: textMuted }}>{sub}</span> : null}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full rounded-3xl shadow-2xl flex flex-col overflow-hidden border animate-in zoom-in-95 duration-150 max-h-[min(92dvh,820px)]"
        style={{ maxWidth: 560, backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-7 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: accentSoft, color: accent }}
            >
              {isAlreadyComplete ? <ShieldCheck className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-tight" style={{ color: textPrimary }}>
                {isAlreadyComplete ? 'Finalized payout' : 'Finalize payout'}
              </h2>
              <p className="text-xs font-medium mt-0.5" style={{ color: textMuted }}>
                {isAlreadyComplete
                  ? 'Audited, validated and closed.'
                  : 'Review and sign off this week’s payout.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 -mt-1 rounded-xl hover:bg-slate-500/10 transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" style={{ color: textMuted }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-7 pb-5 flex flex-col gap-5 overflow-y-auto min-h-0">
          {/* Who and how much */}
          <div className="flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5" style={{ backgroundColor: inputBg }}>
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                style={{ background: avatarColor(installerName) }}
              >
                {getInitials(formattedInstallerName)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold truncate" style={{ color: textPrimary }}>{formattedInstallerName}</div>
                <div className="text-xs font-medium truncate mt-0.5" style={{ color: textMuted }}>
                  <b className="tabular-nums" style={{ color: textPrimary }}>{jobCount}</b> completed
                  {jobBreakdown ? ` · ${jobBreakdown}` : ''}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              {label('Net payout')}
              <div
                className="text-2xl font-black tabular-nums tracking-tight leading-tight mt-0.5"
                style={{ color: totalAmount < 0 ? '#ef4444' : accent }}
              >
                {totalAmount < 0 ? '−' : ''}₱{peso(Math.abs(totalAmount))}
              </div>
            </div>
          </div>

          {/* Sign-off */}
          <section className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: textPrimary }}>
                <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: accent }} />
                Audit &amp; validation sign-off
              </h3>
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap"
                style={{ backgroundColor: accentSoft, color: accent }}
              >
                {isAlreadyComplete ? 'Completed & closed' : 'Pending approval'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-5">
              {fact(
                isAlreadyComplete ? 'Validated by' : 'Auditing user',
                <>
                  {isAlreadyComplete ? effectiveAudited : validatorName}
                  {!isAlreadyComplete && userRole ? <span className="ml-2 text-[10px] font-semibold" style={{ color: textMuted }}>{userRole}</span> : null}
                </>,
              )}
              {fact('Validation date', <span className="tabular-nums">{formattedDate}</span>)}
            </div>

            <p className="text-[13px] leading-relaxed" style={{ color: textMuted }}>
              {isAlreadyComplete ? (
                <>
                  This payout for <strong style={{ color: textPrimary }}>{formattedInstallerName}</strong> in the amount of{' '}
                  <strong style={{ color: accent }}>₱{peso(Math.abs(totalAmount))}</strong> has been validated and completed by{' '}
                  <strong style={{ color: textPrimary }}>{effectiveAudited}</strong>.
                </>
              ) : (
                <>
                  I confirm that all completed jobs, remittances and deductions for{' '}
                  <strong style={{ color: textPrimary }}>{formattedInstallerName}</strong> have been reviewed. This payout is finalized as{' '}
                  <strong style={{ color: accent }}>COMPLETED</strong> under the validation of{' '}
                  <strong style={{ color: textPrimary }}>{validatorName}</strong>.
                </>
              )}
            </p>

            {!isAlreadyComplete && (
              <label
                className="flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer select-none transition-colors"
                style={{ borderColor: confirmed ? accent : inputBorder, backgroundColor: confirmed ? accentSoft : 'transparent' }}
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="w-5 h-5 rounded cursor-pointer accent-emerald-600 shrink-0"
                />
                <span className="text-[13px] font-bold leading-snug" style={{ color: textPrimary }}>
                  I confirm and finalize this payout as Completed &amp; Closed.
                </span>
              </label>
            )}
          </section>

          {/* Remarks */}
          <section className="flex flex-col gap-2">
            {label(isAlreadyComplete ? 'Audit remarks' : 'Audit remarks (optional)')}
            {isAlreadyComplete ? (
              <div
                className="w-full rounded-2xl p-4 text-[13px] font-semibold uppercase leading-relaxed"
                style={{ backgroundColor: inputBg, color: textPrimary }}
              >
                {remarks || 'No remarks recorded'}
              </div>
            ) : (
              <textarea
                rows={2}
                placeholder="E.G. VERIFIED AGAINST JOBS AND REMITTANCE"
                value={remarks}
                onChange={e => setRemarks(e.target.value.toUpperCase())}
                className="w-full rounded-2xl border px-4 py-3 text-[13px] font-semibold uppercase leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none transition-colors"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            )}
          </section>

          {/* Payout email — recipient comes from the account, never typed here */}
          {!isAlreadyComplete && (
            canEmail ? (
              <label
                className="flex items-start gap-3 rounded-2xl border px-4 py-3 cursor-pointer select-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              >
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={e => setSendEmail(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded cursor-pointer accent-emerald-600 shrink-0"
                />
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: textPrimary }}>
                    <Mail className="w-4 h-4 shrink-0" style={{ color: accent }} />
                    {previousEmail ? 'Email updated payout to technician' : 'Email payout to technician'}
                  </span>
                  <span className="text-xs font-medium" style={{ color: textMuted }}>
                    Sent to <b className="font-bold" style={{ color: textPrimary }}>{maskEmail(recipientEmail)}</b>
                  </span>
                  {previousEmail && (
                    <span className="text-xs font-medium" style={{ color: textMuted }}>
                      Last emailed {emailedDay(previousEmail.sentAt)}
                      {previousEmail.net != null ? ` for ₱${peso(previousEmail.net)}` : ''}
                      {netChangedSinceEmail ? ' — the net has changed since.' : ' — the net is unchanged.'}
                    </span>
                  )}
                </span>
              </label>
            ) : (
              <div
                className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-xs"
                style={{
                  backgroundColor: isLight ? '#fffbeb' : 'rgba(245, 158, 11, 0.1)',
                  borderColor: isLight ? '#fcd34d' : 'rgba(245, 158, 11, 0.35)',
                  color: isLight ? '#92400e' : '#fbbf24',
                }}
              >
                <MailWarning className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">
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
              className="rounded-2xl border px-4 py-3.5 flex items-start gap-3 text-xs animate-in fade-in"
              style={{
                backgroundColor: isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.1)',
                borderColor: isLight ? '#fca5a5' : 'rgba(239, 68, 68, 0.3)',
                color: isLight ? '#991b1b' : '#fca5a5',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 flex flex-col gap-2.5">
                <span className="font-bold">Revert this payout back to PENDING?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onRevertToPending?.();
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                  >
                    Yes, revert to pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRevertConfirm(false)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
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
        <div className="flex items-center justify-between gap-3 px-7 py-4 shrink-0 border-t" style={{ borderColor: border }}>
          {isAlreadyComplete ? (
            <>
              <div>
                {!isWeekClosed && canManagePayroll && !showRevertConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowRevertConfirm(true)}
                    className="inline-flex items-center gap-2 px-3.5 h-11 rounded-xl text-sm font-semibold text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Revert to pending</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-7 h-11 rounded-xl text-sm font-bold text-white active:scale-95 transition-all cursor-pointer"
                style={{ backgroundColor: '#10b981' }}
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-5 h-11 rounded-xl text-sm font-semibold transition-colors hover:bg-slate-500/10 cursor-pointer"
                style={{ color: textMuted }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!confirmed}
                onClick={() => onComplete(remarks, validatorName, canEmail && sendEmail)}
                className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-xl text-sm font-bold text-white shadow-md active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{ backgroundColor: '#10b981' }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Confirm &amp; finalize</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
