import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import {
  createShareLink,
  payoutShareUrl,
  revokeShareLink,
  rotateShareLink,
  type PayoutShareLink,
} from '../../utils/payoutShareApi'

// "Copy link" for one installer's payout week: creates (or reuses) the read-only share link and puts its
// URL on the clipboard. The chevron opens a small panel with the link, its expiry/open count, Revoke and
// New link. The link itself lives in the parent (so the roster can show who already has one) and comes
// back through `link` / `onLinkChange`.

interface Props {
  branchId: string
  weekFrom: string
  weekTo: string
  /** Name shown on the public page. */
  installerLabel: string
  /** Every raw payroll row name that makes up this installer on the roster. */
  getInstallerNames: () => string[]
  /** Runs before the link is created — saves unsaved table edits so the link shows what payroll sees. Return false to abort. */
  beforeCreate?: () => Promise<boolean>
  link: PayoutShareLink | null
  onLinkChange: (link: PayoutShareLink | null) => void
  /** Called when the panel opens, so the parent can refresh the open count. */
  onPanelOpen?: () => void
  /** `full` = Copy link + options chevron (installer table); `icon` = a single icon button (roster rows). */
  variant: 'full' | 'icon'
}

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const PANEL_WIDTH = 320

export default function ShareLinkButton({
  branchId, weekFrom, weekTo, installerLabel, getInstallerNames, beforeCreate, link, onLinkChange, onPanelOpen, variant,
}: Props) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const danger = isLight ? '#DC2626' : '#F87171'
  const accent = '#10B981'

  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [busy, setBusy] = useState<'copy' | 'rotate' | 'revoke' | null>(null)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  const flashCopied = () => {
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 2500)
  }

  const openPanel = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) {
      const left = Math.min(Math.max(8, rect.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - 8)
      setPanelPos({ top: rect.bottom + 6, left })
    }
    setOpen(true)
    onPanelOpen?.()
  }, [onPanelOpen])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !anchorRef.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const mint = async (): Promise<PayoutShareLink> => {
    if (beforeCreate && !(await beforeCreate())) {
      throw new Error('Could not save the table first, so the link was not created. Try Save, then Copy link again.')
    }
    const names = getInstallerNames()
    if (names.length === 0) throw new Error('No payout rows found for this installer.')
    return createShareLink({ branchId, weekFrom, weekTo, installerNames: names, installerLabel })
  }

  const copyLink = async () => {
    if (busy) return
    setBusy('copy')
    setMessage(null)
    const pending = mint()
    pending.catch(() => { /* surfaced below */ })
    try {
      // Safari only allows a clipboard write inside the click gesture, and creating the link is async —
      // so hand the clipboard a promise for the text instead of awaiting the link first.
      let created: PayoutShareLink
      let clipboardOk = true
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'text/plain': pending.then(l => new Blob([payoutShareUrl(l.token)], { type: 'text/plain' })) }),
          ])
        } catch {
          clipboardOk = false
        }
        created = await pending
      } else {
        created = await pending
        try { await navigator.clipboard.writeText(payoutShareUrl(created.token)) } catch { clipboardOk = false }
      }
      onLinkChange(created)
      if (clipboardOk) {
        flashCopied()
        setMessage({ kind: 'ok', text: `Link copied — expires ${shortDay(created.expiresAt)}.` })
      } else {
        setMessage({ kind: 'error', text: 'Couldn’t copy automatically — copy the link below.' })
        openPanel()
      }
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not create the link.' })
      openPanel()
    } finally {
      setBusy(null)
    }
  }

  const copyFromPanel = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(payoutShareUrl(link.token))
      flashCopied()
      setMessage({ kind: 'ok', text: `Link copied — expires ${shortDay(link.expiresAt)}.` })
    } catch {
      urlInputRef.current?.select()
      setMessage({ kind: 'error', text: 'Press Ctrl+C (or hold and copy) to copy the selected link.' })
    }
  }

  const runAction = async (kind: 'rotate' | 'revoke') => {
    if (!link || busy) return
    setBusy(kind)
    setMessage(null)
    try {
      if (kind === 'revoke') {
        await revokeShareLink(link.id)
        onLinkChange(null)
        setMessage({ kind: 'ok', text: 'Link revoked. The old URL no longer opens.' })
      } else {
        const fresh = await rotateShareLink(link.id)
        onLinkChange(fresh)
        setMessage({ kind: 'ok', text: 'New link created. The old URL no longer opens — copy the new one below.' })
      }
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' })
    } finally {
      setBusy(null)
    }
  }

  const buttonBase: CSSProperties = {
    color: copied ? '#fff' : accent,
    backgroundColor: copied ? accent : isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.14)',
    borderColor: '#10B98150',
  }
  const Icon = busy === 'copy' ? Loader2 : copied ? Check : Link2
  const iconClass = `w-3.5 h-3.5 ${busy === 'copy' ? 'animate-spin' : ''}`
  const title = copied
    ? 'Link copied'
    : link
      ? `Copy the payout link (active until ${shortDay(link.expiresAt)} · opened ${link.viewCount}×)`
      : 'Create and copy a read-only link the installer can open without logging in'

  const panel = open && panelPos && createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Payout link"
      className="fixed z-[200] rounded-xl border shadow-xl p-3.5 flex flex-col gap-3"
      style={{ top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH, backgroundColor: cardBg, borderColor: border, color: textPrimary }}
    >
      <div>
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }}>Payout link</div>
        <div className="text-[13px] font-semibold truncate">{installerLabel}</div>
      </div>

      {link ? (
        <>
          <div className="flex items-center gap-2">
            <input
              ref={urlInputRef}
              readOnly
              value={payoutShareUrl(link.token)}
              onFocus={e => e.currentTarget.select()}
              className="min-w-0 flex-1 text-[11px] rounded-lg border px-2 py-1.5 outline-none"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
            <button
              type="button"
              onClick={() => void copyFromPanel()}
              className="shrink-0 text-xs font-bold rounded-lg px-3 py-1.5 border cursor-pointer"
              style={buttonBase}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="text-xs flex flex-col gap-0.5" style={{ color: textMuted }}>
            <span>Expires {shortDay(link.expiresAt)}</span>
            <span>
              {link.viewCount > 0
                ? `Opened ${link.viewCount} ${link.viewCount === 1 ? 'time' : 'times'}${link.lastViewedAt ? ` · last ${dateTime(link.lastViewedAt)}` : ''}`
                : 'Not opened yet'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runAction('rotate')}
              title="Revoke this link and make a new one"
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              {busy === 'rotate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              New link
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runAction('revoke')}
              title="Stop this link from working"
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: danger }}
            >
              {busy === 'revoke' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Revoke
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs" style={{ color: textMuted }}>
          No link for this week yet. Copy link creates one — a read-only page the installer can open without logging in.
        </p>
      )}

      {message && (
        <p className="text-xs font-semibold" role="status" style={{ color: message.kind === 'error' ? danger : accent }}>{message.text}</p>
      )}
    </div>,
    document.body,
  )

  if (variant === 'icon') {
    return (
      <>
        <div ref={anchorRef} className="shrink-0" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => void copyLink()}
            disabled={busy !== null}
            title={title}
            aria-label={`Copy payout link for ${installerLabel}`}
            className="relative flex items-center justify-center w-8 h-8 rounded-xl border cursor-pointer transition-colors hover:border-emerald-500/60 disabled:cursor-wait"
            style={buttonBase}
          >
            <Icon className={iconClass} />
            {link && !copied && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />}
          </button>
        </div>
        {panel}
      </>
    )
  }

  return (
    <>
      <div ref={anchorRef} className="flex items-stretch shrink-0">
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={busy !== null}
          title={title}
          className="flex items-center justify-center gap-1.5 w-8 h-8 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-l-xl text-xs font-semibold border cursor-pointer shadow-xs transition-colors hover:border-emerald-500/60 disabled:cursor-wait"
          style={buttonBase}
        >
          <Icon className={iconClass} />
          <span className="hidden lg:inline">{copied ? 'Copied' : 'Copy link'}</span>
        </button>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          title="Link options"
          aria-label="Link options"
          aria-expanded={open}
          className="flex items-center justify-center w-6 md:w-7 rounded-r-xl border border-l-0 cursor-pointer shadow-xs transition-colors hover:border-emerald-500/60"
          style={buttonBase}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      {panel}
    </>
  )
}
