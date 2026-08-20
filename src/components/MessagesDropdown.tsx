import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, SquarePen, Maximize2, Search, X } from 'lucide-react'
import { useMessaging, type ConversationSummary } from '../contexts/MessagingContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatPersonName, formatRole } from '../utils/api'
import { fetchCachedEmployees } from '../utils/portalDirectoryCache'
import { HEADER_MENU_OPENED_EVENT, broadcastHeaderMenuOpen, type HeaderMenuId } from '../utils/headerMenuCoordination'
import UserAvatar from './UserAvatar'

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false
  const t = new Date(lastActiveAt).getTime()
  return !isNaN(t) && (Date.now() - t) < ONLINE_THRESHOLD_MS
}

type Member = { id: string; name: string; profileImage?: string | null; role?: string; jobTitle?: string | null }
type Filter = 'all' | 'unread'

export default function MessagesDropdown() {
  const [open, setOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { conversations, unreadCount } = useMessaging()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setComposing(false) }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<HeaderMenuId>).detail !== 'messages') { setOpen(false); setComposing(false) }
    }
    window.addEventListener(HEADER_MENU_OPENED_EVENT, handler)
    return () => window.removeEventListener(HEADER_MENU_OPENED_EVENT, handler)
  }, [])

  useEffect(() => {
    if (!composing || membersLoaded) return
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    fetchCachedEmployees(token).then(list => {
      const normalized: Member[] = list
        .map(m => ({
          id: String(m.id || ''),
          name: String(m.name || ''),
          profileImage: (m.profileImage as string) || null,
          role: String(m.role || ''),
          jobTitle: (m.jobTitle as string) || null,
        }))
        .filter(m => m.id && m.id !== user?.id && m.role !== 'customer')
        .sort((a, b) => a.name.localeCompare(b.name))
      setMembers(normalized)
      setMembersLoaded(true)
    }).catch(() => setMembersLoaded(true))
  }, [composing, membersLoaded, user?.id])

  const bg = isLight ? '#ffffff' : '#0d1626'
  const border = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#6B90BE'
  const hoverBg = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'
  const inputBg = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'

  const filtered = useMemo(() => {
    let list = conversations
    if (filter === 'unread') list = list.filter(c => c.unreadCount > 0)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(c => c.otherUserName.toLowerCase().includes(q))
    }
    return list
  }, [conversations, filter, query])

  const filteredMembers = useMemo(() => {
    if (!query.trim()) return members
    const q = query.trim().toLowerCase()
    return members.filter(m => m.name.toLowerCase().includes(q))
  }, [members, query])

  const openConversation = (id: string) => {
    setOpen(false)
    setComposing(false)
    navigate(`/messages/${id}`)
  }

  const startConversation = (recipientId: string) => {
    setOpen(false)
    setComposing(false)
    navigate(`/messages/new/${recipientId}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          const next = !open
          if (next) broadcastHeaderMenuOpen('messages')
          setOpen(next)
        }}
        title="Messages"
        className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-all"
        style={{ color: textMuted, backgroundColor: open ? hoverBg : 'transparent' }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
      >
        <MessageSquare className="w-[18px] h-[18px]" />
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
          className="absolute z-50 w-96 max-w-[92vw] rounded-2xl shadow-2xl overflow-hidden top-[calc(100%+8px)] right-0 flex flex-col"
          style={{ backgroundColor: bg, border: `1px solid ${border}`, maxHeight: '32rem' }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
            <h3 className="text-[17px] font-black" style={{ color: textPrimary }}>
              {composing ? 'New Message' : 'Chats'}
            </h3>
            <div className="flex items-center gap-1">
              {composing ? (
                <button
                  onClick={() => { setComposing(false); setQuery('') }}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: textMuted }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setOpen(false); navigate('/messages') }}
                    title="Open full view"
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: textMuted }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setComposing(true); setQuery('') }}
                    title="New message"
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: textMuted }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <SquarePen className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    title="Close"
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: textMuted }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: textMuted }} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={composing ? 'Search members…' : 'Search chats…'}
                className="w-full pl-8 pr-3 py-2 rounded-xl text-[13px] focus:outline-none"
                style={{ backgroundColor: inputBg, color: textPrimary }}
              />
            </div>
          </div>

          {/* Filter tabs */}
          {!composing && (
            <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
              {(['all', 'unread'] as Filter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-3 py-1 rounded-full text-[12px] font-semibold capitalize transition-colors"
                  style={filter === f
                    ? { backgroundColor: '#10B981', color: '#ffffff' }
                    : { backgroundColor: inputBg, color: textMuted }}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {composing ? (
              !membersLoaded ? (
                <div className="px-4 py-8 text-center text-[13px]" style={{ color: textMuted }}>Loading members…</div>
              ) : filteredMembers.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px]" style={{ color: textMuted }}>No members found</div>
              ) : (
                filteredMembers.map(m => (
                  <button
                    key={m.id}
                    onClick={() => startConversation(m.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <UserAvatar name={m.name} imageUrl={m.profileImage} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: textPrimary }}>{formatPersonName(m.name)}</p>
                      <p className="text-[11px] truncate" style={{ color: textMuted }}>{m.jobTitle ? formatPersonName(m.jobTitle) : formatRole(m.role)}</p>
                    </div>
                  </button>
                ))
              )
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
                <MessageSquare className="w-8 h-8" style={{ color: textMuted, opacity: 0.5 }} />
                <p className="text-sm font-medium" style={{ color: textMuted }}>
                  {conversations.length === 0 ? 'No conversations yet' : 'No matches'}
                </p>
                {conversations.length === 0 && (
                  <button
                    onClick={() => { setComposing(true); setQuery('') }}
                    className="mt-1 text-[12px] font-semibold"
                    style={{ color: '#10B981' }}
                  >
                    Start a new message
                  </button>
                )}
              </div>
            ) : (
              filtered.map((c: ConversationSummary) => {
                const online = isOnline(c.otherUserLastActiveAt)
                const mine = c.lastMessageSenderId === user?.id
                return (
                  <button
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <div className="relative shrink-0">
                      <UserAvatar name={c.otherUserName} imageUrl={c.otherUserProfileImage} size="sm" />
                      {online && (
                        <span
                          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: '#10B981', border: `2px solid ${bg}` }}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: textPrimary }}>{formatPersonName(c.otherUserName)}</p>
                      <p className="text-[12px] truncate" style={{ color: c.unreadCount > 0 ? textPrimary : textMuted, fontWeight: c.unreadCount > 0 ? 600 : 400 }}>
                        {c.lastMessagePreview ? `${mine ? 'You: ' : ''}${c.lastMessagePreview}` : 'Say hi 👋'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-medium" style={{ color: textMuted }}>{timeAgo(c.lastMessageAt)}</span>
                      {c.unreadCount > 0 && (
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }} />
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
