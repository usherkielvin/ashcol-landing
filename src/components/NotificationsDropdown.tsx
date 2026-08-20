import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Inbox } from 'lucide-react'
import { useNotifications } from '../contexts/NotificationContext'
import { useTheme } from '../contexts/ThemeContext'
import { HEADER_MENU_OPENED_EVENT, broadcastHeaderMenuOpen, type HeaderMenuId } from '../utils/headerMenuCoordination'

function timeAgo(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NotificationsDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<HeaderMenuId>).detail !== 'notifications') setOpen(false)
    }
    window.addEventListener(HEADER_MENU_OPENED_EVENT, handler)
    return () => window.removeEventListener(HEADER_MENU_OPENED_EVENT, handler)
  }, [])

  const bg = isLight ? '#ffffff' : '#0d1626'
  const border = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#6B90BE'
  const hoverBg = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'

  const handleClick = (id: string, ticketId: string | null, link: string | null) => {
    void markRead(id)
    setOpen(false)
    if (link) navigate(link)
    else if (ticketId) navigate(`/my-tickets?ticket=${ticketId}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          const next = !open
          if (next) broadcastHeaderMenuOpen('notifications')
          setOpen(next)
        }}
        title="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-all"
        style={{ color: textMuted, backgroundColor: open ? hoverBg : 'transparent' }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[15px] h-[15px] px-[3px] rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: '#EF4444' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 w-80 max-w-[90vw] rounded-2xl shadow-2xl overflow-hidden top-[calc(100%+8px)] right-0"
          style={{ backgroundColor: bg, border: `1px solid ${border}` }}
        >
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
            <h3 className="text-[15px] font-black" style={{ color: textPrimary }}>Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
                style={{ color: '#10B981' }}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
                <Inbox className="w-8 h-8" style={{ color: textMuted, opacity: 0.5 }} />
                <p className="text-sm font-medium" style={{ color: textMuted }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n.id, n.ticketId, n.link)}
                  className="w-full flex items-start gap-2.5 px-4 py-3 text-left transition-colors"
                  style={{ backgroundColor: !n.isRead ? (isLight ? '#f0fdf4' : 'rgba(16,185,129,0.08)') : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = !n.isRead ? (isLight ? '#f0fdf4' : 'rgba(16,185,129,0.08)') : 'transparent'}
                >
                  {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10B981' }} />}
                  <div className={`flex-1 min-w-0 ${n.isRead ? 'ml-[10px]' : ''}`}>
                    <p className="text-[13px] font-semibold truncate" style={{ color: textPrimary }}>{n.title}</p>
                    <p className="text-[12px] line-clamp-2 mt-0.5" style={{ color: textMuted }}>{n.message}</p>
                    <p className="text-[10px] mt-1 font-medium" style={{ color: textMuted, opacity: 0.7 }}>{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
