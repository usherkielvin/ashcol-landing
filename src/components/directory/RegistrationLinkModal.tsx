import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check, Link2, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import {
  buildMemberInviteUrl,
  createMemberInvite,
  formatBranchLabel,
  listMemberInvites,
  OPEN_REGISTER_URL,
  revokeMemberInvite,
  type MemberInviteLink,
} from '../../utils/memberInviteApi'

interface Tokens {
  isLight: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
}

interface Props {
  open: boolean
  onClose: () => void
  branches: { id: string; name: string }[]
  tokens: Tokens
  onToast: (type: 'success' | 'error', message: string) => void
}

const EXPIRY_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Admin tool: mint, copy and revoke the registration links new hires use to create their own member account. */
export default function RegistrationLinkModal({ open, onClose, branches, tokens, onToast }: Props) {
  const { isLight, cardBg, border, textPrimary, textMuted, inputBg, inputBorder } = tokens
  const [branchId, setBranchId] = useState('')
  const [days, setDays] = useState(7)
  const [links, setLinks] = useState<MemberInviteLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoadingLinks(true)
    try {
      setLinks(await listMemberInvites())
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Could not load registration links.')
    } finally {
      setLoadingLinks(false)
    }
  }, [onToast])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const flashCopied = (id: string) => {
    setCopiedId(id)
    setTimeout(() => setCopiedId(cur => (cur === id ? null : cur)), 2000)
  }

  const handleCopyForBranch = async (forceNew: boolean) => {
    setBusy(true)
    try {
      const link = await createMemberInvite(branchId || null, days, forceNew)
      const ok = await copyToClipboard(buildMemberInviteUrl(link.token))
      if (ok) {
        flashCopied(link.id)
        onToast('success', `Link copied — expires ${fmtDate(link.expiresAt)}.`)
      } else {
        onToast('error', 'Link created, but your browser blocked copying. Use the copy button below.')
      }
      await refresh()
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Could not create the link.')
    } finally {
      setBusy(false)
    }
  }

  const handleCopyExisting = async (link: MemberInviteLink) => {
    if (await copyToClipboard(buildMemberInviteUrl(link.token))) {
      flashCopied(link.id)
      onToast('success', `Link copied — expires ${fmtDate(link.expiresAt)}.`)
    } else {
      onToast('error', 'Your browser blocked copying.')
    }
  }

  const handleRevoke = async (link: MemberInviteLink) => {
    try {
      await revokeMemberInvite(link.id)
      onToast('success', `${link.branchName ?? 'Any-branch'} link revoked.`)
      await refresh()
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Could not revoke the link.')
    }
  }

  if (!open) return null

  const fieldStyle = { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: isLight ? 'rgba(241,245,249,0.96)' : 'rgba(6,11,24,0.96)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: border }}>
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight" style={{ color: textPrimary }}>Registration link</h3>
            <p className="text-xs font-medium mt-0.5" style={{ color: textMuted }}>
              New hires open it, fill in their details, and wait for your approval.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-500/10" style={{ color: textMuted }} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Branch</span>
              <select
                value={branchId}
                onChange={e => setBranchId(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                style={fieldStyle}
              >
                <option value="">Any branch — member picks</option>
                {branches.map(b => <option key={b.id} value={b.id}>{formatBranchLabel(b.name)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Expires in</span>
              <select
                value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                style={fieldStyle}
              >
                {EXPIRY_OPTIONS.map(o => <option key={o.days} value={o.days}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => handleCopyForBranch(false)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black uppercase tracking-wider text-white transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: '#10B981' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Copy registration link
          </button>

          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 border" style={{ borderColor: border, backgroundColor: inputBg }}>
            <Link2 className="w-4 h-4 shrink-0 text-blue-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold" style={{ color: textPrimary }}>Public sign-up page</div>
              <div className="text-[11px] truncate" style={{ color: textMuted }}>{OPEN_REGISTER_URL} · never expires, members pick their branch</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (await copyToClipboard(OPEN_REGISTER_URL)) {
                  flashCopied('open')
                  onToast('success', 'Public sign-up link copied.')
                } else {
                  onToast('error', 'Your browser blocked copying.')
                }
              }}
              className="p-2 rounded-lg hover:bg-slate-500/10"
              style={{ color: copiedId === 'open' ? '#10B981' : textMuted }}
              title="Copy public sign-up link"
            >
              {copiedId === 'open' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div>
            <div className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: textMuted }}>Active links</div>
            {loadingLinks && links.length === 0 ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: textMuted }} /></div>
            ) : links.length === 0 ? (
              <p className="text-xs py-4 text-center rounded-xl border border-dashed" style={{ color: textMuted, borderColor: border }}>
                No active links yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {links.map(l => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 border"
                    style={{ borderColor: border, backgroundColor: inputBg }}
                  >
                    <Link2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate" style={{ color: textPrimary }}>{l.branchName ?? 'Any branch'}</div>
                      <div className="text-[11px]" style={{ color: textMuted }}>
                        Expires {fmtDate(l.expiresAt)} · {l.useCount} {l.useCount === 1 ? 'sign-up' : 'sign-ups'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyExisting(l)}
                      className="p-2 rounded-lg hover:bg-slate-500/10"
                      style={{ color: copiedId === l.id ? '#10B981' : textMuted }}
                      title="Copy link"
                    >
                      {copiedId === l.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const fresh = await createMemberInvite(l.branchId, days, true)
                          if (await copyToClipboard(buildMemberInviteUrl(fresh.token))) flashCopied(fresh.id)
                          onToast('success', 'New link copied — the old one no longer works.')
                          await refresh()
                        } catch (err) {
                          onToast('error', err instanceof Error ? err.message : 'Could not create a new link.')
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-slate-500/10"
                      style={{ color: textMuted }}
                      title="New link (revokes this one)"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(l)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-red-400"
                      title="Revoke"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
