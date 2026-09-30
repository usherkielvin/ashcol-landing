import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Megaphone, X, Loader2, Check, AlertCircle } from 'lucide-react'
import { API_BASE_URL } from '../utils/api'

interface Props {
  onClose: () => void
  isLight: boolean
  getToken: () => string
}

const TITLE_MAX = 80
const MESSAGE_MAX = 500

export default function AdminBroadcastModal({ onClose, isLight, getToken }: Props) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorText, setErrorText] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  const cardBg = isLight ? '#ffffff' : '#0B132B'
  const border = isLight ? '#e2e8f0' : '#1e293b'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  const busy = status === 'sending' || status === 'success'

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'sending') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, status])

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim() || busy) return

    setStatus('sending')
    setErrorText('')

    try {
      const res = await fetch(`${API_BASE_URL}/notifications/broadcast`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
        }),
      })

      if (res.ok) {
        setStatus('success')
        setTimeout(() => onClose(), 1500)
      } else {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to send broadcast')
      }
    } catch (err: unknown) {
      setStatus('error')
      setErrorText(err instanceof Error ? err.message : 'Network error')
    }
  }

  const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl outline-none transition-colors focus:border-emerald-500 disabled:opacity-60'
  const inputStyle = { backgroundColor: inputBg, border: `1px solid ${border}`, color: textPrimary }

  // Portaled to <body>: the header uses backdrop-filter, which would otherwise trap a
  // position:fixed child inside the header box and clip it.
  return createPortal(
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget && status !== 'sending') onClose() }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fadeIn"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, color: textPrimary }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
              <Megaphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-tight" style={{ color: textPrimary }}>Broadcast</h2>
              <p className="text-xs" style={{ color: textMuted }}>Push + in-app notification to all active members</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'sending'}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-500/10 shrink-0"
            style={{ color: textMuted }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleBroadcast} className="flex flex-col min-h-0">
          <div className="px-5 pb-1 flex flex-col gap-4 overflow-y-auto min-h-0">
            {status === 'error' && (
              <div className="p-3 rounded-xl text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {errorText}
              </div>
            )}

            {status === 'success' && (
              <div className="p-3 rounded-xl text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2">
                <Check className="w-4 h-4" /> Broadcast sent
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Title</label>
                <span className="text-[10px] tabular-nums" style={{ color: textMuted }}>{title.length}/{TITLE_MAX}</span>
              </div>
              <input
                ref={titleRef}
                type="text"
                value={title}
                maxLength={TITLE_MAX}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. System maintenance tonight"
                className={inputCls}
                style={inputStyle}
                required
                disabled={busy}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Message</label>
                <span className="text-[10px] tabular-nums" style={{ color: textMuted }}>{message.length}/{MESSAGE_MAX}</span>
              </div>
              <textarea
                rows={5}
                value={message}
                maxLength={MESSAGE_MAX}
                onChange={e => setMessage(e.target.value)}
                placeholder="Type your message to all members…"
                className={`${inputCls} resize-none`}
                style={inputStyle}
                required
                disabled={busy}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 mt-1 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={status === 'sending'}
              className="px-4 py-2 text-xs font-bold rounded-xl hover:bg-slate-500/10 transition-colors"
              style={{ color: textMuted }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim() || !message.trim()}
              className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ backgroundColor: '#10B981' }}
            >
              {status === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
              {status === 'sending' ? 'Sending…' : 'Send Broadcast'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
