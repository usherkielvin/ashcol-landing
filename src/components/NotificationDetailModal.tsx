import { Bell, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useNotifications } from '../contexts/NotificationContext'

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function NotificationDetailModal() {
  const { viewingNotification, closeNotificationDetail, markRead } = useNotifications()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const navigate = useNavigate()

  if (!viewingNotification) return null

  const cardBg = isLight ? '#ffffff' : '#1E293B'
  const border = isLight ? '#e2e8f0' : '#334155'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#94A3B8'

  const n = viewingNotification
  const destination = n.link || (n.ticketId ? `/my-tickets?ticket=${n.ticketId}` : null)

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 safe-area-top safe-area-bottom"
      style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={closeNotificationDetail}
    >
      <div
        className="w-full max-w-md max-h-[88dvh] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-detail-title"
      >
        <div className="px-5 py-4 flex items-start justify-between gap-3 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
              <Bell className="w-4 h-4" style={{ color: '#10B981' }} />
            </div>
            <div className="min-w-0">
              <h2 id="notification-detail-title" className="text-sm font-black leading-snug" style={{ color: textPrimary }}>
                {n.title}
              </h2>
              <p className="text-[11px] mt-1" style={{ color: textMuted }}>{formatTimestamp(n.createdAt)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeNotificationDetail}
            className="p-1.5 rounded-lg shrink-0 hover:opacity-70 transition-opacity"
            style={{ color: textMuted }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="px-4 py-3 mx-4 sm:mx-5 mt-4 rounded-xl text-sm leading-6 whitespace-pre-wrap break-words overflow-y-auto min-h-0 flex-1 overscroll-contain"
          style={{ backgroundColor: isLight ? '#f8fafc' : '#0f172a', border: `1px solid ${border}`, color: textPrimary }}
        >
          {n.message}
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-2 mt-1 shrink-0">
          <button
            type="button"
            onClick={closeNotificationDetail}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-80"
            style={{ backgroundColor: isLight ? '#F1F5F9' : '#0F172A', color: textMuted, border: `1px solid ${border}` }}
          >
            Close
          </button>
          {destination && (
            <button
              type="button"
              onClick={() => {
                void markRead(n.id)
                closeNotificationDetail()
                navigate(destination)
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] shadow-sm"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              Open
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
