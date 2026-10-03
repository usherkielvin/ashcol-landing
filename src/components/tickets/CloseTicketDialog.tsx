import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import { AlertCircle, ArrowLeft, Check, CheckCircle2, FileText, Loader2, Lock, RefreshCw, Wallet, X, XCircle, ClipboardList } from 'lucide-react'
import {
  type Ticket,
  type ScheduleOutcome,
  type CloseRules,
  type CloseBlocker,
  type CloseBlockerKind,
  fetchCloseRules,
  loadFullTicketForClose,
  getCloseOutcome,
  getCloseOutcomeLabel,
  getCloseBlockers,
  getCustomerDisplayName,
  getFinalDateKey,
  getPreferredDateKey,
  formatDisplayDate,
  formatCombinedPayment,
  getPaymentBreakdown,
  formatPaymentBreakdownText,
  resolveInstallerFieldRaw,
  formatServiceDriver,
  parseBrand,
  getF,
  getTicketCommitDisplay,
  parseAcMeta,
} from '../../utils/ticketHelpers'
import { getTicketPhotosRaw, parseTicketPhotos } from '../../utils/ticketPhotos'

const GROUPS: { kind: CloseBlockerKind; title: string; hint: string; fix: string; Icon: typeof FileText }[] = [
  { kind: 'detail', title: 'Ticket details', hint: 'Every required column is filled in', fix: 'Edit ticket', Icon: ClipboardList },
  { kind: 'payment', title: 'Payment', hint: 'Mode of payment and amount are set', fix: 'Set payment', Icon: Wallet },
  { kind: 'document', title: 'Documents', hint: 'Required photos / documents are attached', fix: 'Edit ticket', Icon: FileText },
]

/**
 * Two-step guarded close: (1) a checklist that must be all-green, (2) a read-only summary the person
 * confirms as final. Defined at module level on purpose (see CLAUDE.md — never inline components in
 * Tickets()). The parent performs the save; the server re-runs the same checks.
 */
export function CloseTicketDialog({
  ticket,
  isLight,
  onClose,
  onConfirm,
  onFix,
}: {
  ticket: Ticket
  isLight: boolean
  onClose: () => void
  onConfirm: (fullTicket: Ticket, outcome: ScheduleOutcome, remarks: string) => void
  onFix: (kind: CloseBlockerKind, fullTicket: Ticket) => void
}) {
  const [full, setFull] = useState<Ticket>(ticket)
  const [rules, setRules] = useState<CloseRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const [acknowledged, setAcknowledged] = useState(false)
  /** null = untouched, so the suggested remark follows the loaded ticket until the person types. */
  const [remarks, setRemarks] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const cardBg = isLight ? '#ffffff' : '#0d1626'
  const border = isLight ? '#e2e8f0' : '#1e293b'
  const panel = isLight ? '#f8fafc' : '#080e1a'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const ok = isLight ? '#16a34a' : '#4ade80'
  const bad = isLight ? '#dc2626' : '#f87171'

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchCloseRules(), loadFullTicketForClose(ticket)])
      .then(([r, t]) => {
        if (cancelled) return
        setRules(r)
        setFull(t)
      })
      .catch(err => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the closing rules.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticket, reloadKey])

  const recheck = () => {
    setLoading(true)
    setLoadError('')
    setReloadKey(k => k + 1)
  }

  const { outcome, reason } = useMemo(() => getCloseOutcome(full), [full])
  const blockers = useMemo<CloseBlocker[]>(
    () => (rules && outcome ? getCloseBlockers(full, outcome, rules) : []),
    [rules, outcome, full],
  )
  const canProceed = Boolean(rules && outcome && blockers.length === 0)
  const outcomeLabel = getCloseOutcomeLabel(outcome)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const photos = useMemo(() => parseTicketPhotos(getTicketPhotosRaw(full)), [full])
  const breakdown = getPaymentBreakdown(full)
  const finalDate = getFinalDateKey(full) || getPreferredDateKey(full)
  const meta = parseAcMeta(full)
  const unitLine = parseBrand(full)
  const address = String(full.location || meta.destination || meta.address || '').trim()
  const ticketNo = String(full.ticketNumber || full.ticket_number || '').trim()

  // Remarks written at closing, e.g. "DONE INSTALL WITH COMPLETE DOCS". Existing real remarks win;
  // auto placeholders ("PENDING", "Moved to …") are replaced by a suggestion.
  const existingRemark = String(full.remarksUpdate || full.remarks || '').trim()
  const existingIsPlaceholder = !existingRemark || /^(pending|moved to\b)/i.test(existingRemark)
  const baseLabel = outcomeLabel.toUpperCase()
  const needsDocs = Boolean(outcome && rules && (rules.requiredDocuments[outcome] || []).length > 0)
  const commitText = String(getTicketCommitDisplay(full) || '').trim().toUpperCase()
  const suggestions = [
    needsDocs ? `${baseLabel} WITH COMPLETE DOCS` : baseLabel,
    ...(commitText ? [`${baseLabel} · ${commitText}`] : []),
  ].filter((s, i, arr) => arr.indexOf(s) === i)
  const remarksValue = remarks ?? (existingIsPlaceholder ? suggestions[0] : existingRemark)

  const summaryRows: [string, string][] = [
    ['Ticket no.', ticketNo || '—'],
    ['Customer', getCustomerDisplayName(full) || '—'],
    ['Address', address || '—'],
    ['Schedule date', finalDate ? formatDisplayDate(finalDate, '—') : '—'],
    ['Installer', resolveInstallerFieldRaw(full) || '—'],
    ['Driver / vehicle', formatServiceDriver(full) || '—'],
    ['Brand / unit / HP', unitLine || '—'],
    ['Commit', getF(full, 'commitType', 'commitTerms') || '—'],
    ['Payment', `${formatCombinedPayment(full)}${breakdown.length ? ` ${formatPaymentBreakdownText(breakdown)}` : ''}`],
  ]

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[12100] flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Close ticket"
        className="w-full max-w-[460px] rounded-2xl shadow-2xl overflow-hidden flex flex-col border animate-in zoom-in-95 duration-150"
        style={{ backgroundColor: cardBg, borderColor: border, maxHeight: 'min(720px, 92vh)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-start justify-between gap-3 border-b shrink-0" style={{ borderColor: border, backgroundColor: panel }}>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>
              Close ticket · Step {step} of 2
            </p>
            <p className="text-sm font-black uppercase truncate mt-0.5" style={{ color: textPrimary }}>
              {ticketNo ? `${ticketNo} · ` : ''}{getCustomerDisplayName(full) || 'Customer'}
            </p>
            {outcome && (
              <span
                className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider"
                style={{ backgroundColor: isLight ? '#dcfce7' : 'rgba(22,163,74,0.18)', color: ok }}
              >
                <Check className="w-3 h-3 stroke-[3]" /> Closes as {outcomeLabel}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cancel" className="p-1.5 rounded-lg hover:bg-slate-500/10 cursor-pointer shrink-0" style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs font-bold" style={{ color: textMuted }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Checking the ticket…
            </div>
          ) : loadError ? (
            <div className="rounded-xl border p-4 text-xs font-semibold flex flex-col gap-3" style={{ borderColor: bad, color: bad }}>
              <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {loadError}</span>
              <button type="button" onClick={recheck} className="self-start px-3 py-1.5 rounded-lg border text-[11px] font-black cursor-pointer" style={{ borderColor: border, color: textPrimary }}>
                Try again
              </button>
            </div>
          ) : !outcome ? (
            <div className="rounded-xl border p-4 text-xs font-semibold flex items-center gap-2" style={{ borderColor: bad, color: bad }}>
              <Lock className="w-4 h-4 shrink-0" /> {reason || 'This ticket cannot be closed right now.'}
            </div>
          ) : step === 1 ? (
            <>
              <p className="text-[11px] font-semibold" style={{ color: textMuted }}>
                Everything below must be complete before this ticket can be closed.
              </p>
              {GROUPS.map(({ kind, title, hint, fix, Icon }) => {
                const missing = blockers.filter(b => b.kind === kind)
                const passed = missing.length === 0
                return (
                  <div
                    key={kind}
                    className="rounded-xl border p-3 flex items-start gap-3"
                    style={{ borderColor: passed ? border : bad, backgroundColor: panel }}
                  >
                    {passed
                      ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ok }} />
                      : <XCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: bad }} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5" style={{ color: textPrimary }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: textMuted }} /> {title}
                      </p>
                      {passed ? (
                        <p className="text-[11px] font-semibold mt-0.5" style={{ color: textMuted }}>{hint}</p>
                      ) : (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {missing.map(m => (
                            <li key={m.label} className="text-[11px] font-bold" style={{ color: bad }}>• Missing: {m.label}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {!passed && (
                      <button
                        type="button"
                        onClick={() => onFix(kind, full)}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-500 cursor-pointer active:scale-95 transition-all"
                      >
                        {fix}
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          ) : (
            <>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: border }}>
                {summaryRows.map(([label, value], i) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 px-3.5 py-2"
                    style={{ borderTop: i ? `1px solid ${border}` : undefined, backgroundColor: i % 2 ? panel : 'transparent' }}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider shrink-0 pt-0.5" style={{ color: textMuted }}>{label}</span>
                    <span className="text-xs font-bold text-right break-words min-w-0" style={{ color: textPrimary }}>{value}</span>
                  </div>
                ))}
              </div>
              {photos.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>
                    Attachments ({photos.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {photos.map(p => (
                      <figure key={p.id} className="w-16 m-0" title={p.description || 'Attachment'}>
                        <img
                          src={p.thumbUrl || p.url}
                          alt={p.description || 'Attachment'}
                          className="w-16 h-16 object-cover rounded-lg border"
                          style={{ borderColor: border }}
                          loading="lazy"
                        />
                        <figcaption className="text-[8.5px] font-bold uppercase truncate mt-0.5" style={{ color: textMuted }}>
                          {p.description || 'Attachment'}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="close-ticket-remarks" className="text-[10px] font-black uppercase tracking-wider block mb-1.5" style={{ color: textMuted }}>
                  Remarks (shown on the schedule)
                </label>
                <textarea
                  id="close-ticket-remarks"
                  value={remarksValue}
                  onChange={e => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="e.g. DONE INSTALL WITH COMPLETE DOCS"
                  className="w-full rounded-xl px-3 py-2 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                  style={{ backgroundColor: panel, border: `1px solid ${border}`, color: textPrimary }}
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRemarks(s)}
                      className="px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wide cursor-pointer hover:bg-emerald-500/10 active:scale-95"
                      style={{ borderColor: border, color: textMuted }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <label
                className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer select-none"
                style={{ borderColor: acknowledged ? ok : border, backgroundColor: panel }}
              >
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={e => setAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer"
                />
                <span className="text-xs font-bold leading-snug" style={{ color: textPrimary }}>
                  I have checked the ticket details, payment and documents. They are correct and final.
                </span>
              </label>
              <p className="text-[10.5px] font-semibold flex items-center gap-1.5" style={{ color: textMuted }}>
                <Lock className="w-3 h-3 shrink-0" /> Once closed, only the administrator can edit this ticket.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t flex items-center justify-between gap-3 shrink-0" style={{ borderColor: border, backgroundColor: panel }}>
          {step === 2 ? (
            <button type="button" onClick={() => { setStep(1); setAcknowledged(false) }} className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-500/10" style={{ borderColor: border, color: textMuted }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <button type="button" onClick={recheck} disabled={loading} className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-500/10 disabled:opacity-50" style={{ borderColor: border, color: textMuted }}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Re-check
            </button>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer hover:bg-slate-500/10" style={{ borderColor: border, color: textMuted }}>
              Cancel
            </button>
            {step === 1 ? (
              <button
                type="button"
                disabled={!canProceed || loading}
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                Review & confirm
              </button>
            ) : (
              <button
                type="button"
                disabled={!acknowledged || !outcome}
                onClick={() => { if (outcome) onConfirm(full, outcome, remarksValue.trim()) }}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <Lock className="w-3.5 h-3.5" /> Close Ticket
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
