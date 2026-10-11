import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, Send, MessageSquare, ArrowLeft, X } from 'lucide-react'
import { useMessaging, type ChatMessage, type ConversationSummary } from '../contexts/MessagingContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatPersonName, formatRole } from '../utils/api'
import { fetchCachedEmployees } from '../utils/portalDirectoryCache'
import UserAvatar from '../components/UserAvatar'

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000
const POLL_MS = 5_000

function isOnline(lastActiveAt: string | null | undefined): boolean {
  if (!lastActiveAt) return false
  const t = new Date(lastActiveAt).getTime()
  return !isNaN(t) && (Date.now() - t) < ONLINE_THRESHOLD_MS
}

function formatBubbleTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const today = new Date()
  const isSameDay = d.toDateString() === today.toDateString()
  if (isSameDay) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

type Member = { id: string; name: string; profileImage?: string | null; role?: string; jobTitle?: string | null; lastActiveAt?: string | null }

export default function Messages() {
  const { conversationId, recipientId } = useParams<{ conversationId?: string; recipientId?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { conversations, getMessages, sendMessage } = useMessaging()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [listQuery, setListQuery] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [activeId, setActiveId] = useState<string | undefined>(conversationId)
  const [showListMobile, setShowListMobile] = useState(!conversationId && !recipientId)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageCacheRef = useRef<Record<string, ChatMessage[]>>({})

  const isNewThread = !!recipientId && !conversationId

  // Track visual viewport on mobile so keyboard opens without pushing header offscreen or creating blank voids
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const handleResize = () => {
      setViewportHeight(vv.height)
      window.scrollTo(0, 0)
    }

    vv.addEventListener('resize', handleResize)
    vv.addEventListener('scroll', handleResize)
    handleResize()

    return () => {
      vv.removeEventListener('resize', handleResize)
      vv.removeEventListener('scroll', handleResize)
    }
  }, [])

  const focusInput = useCallback(() => {
    window.scrollTo(0, 0)
    inputRef.current?.focus()
    requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      inputRef.current?.focus()
    })
    const t1 = setTimeout(() => {
      window.scrollTo(0, 0)
      inputRef.current?.focus()
    }, 50)
    const t2 = setTimeout(() => {
      window.scrollTo(0, 0)
      inputRef.current?.focus()
    }, 160)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useEffect(() => {
    setActiveId(conversationId)
    setShowListMobile(!conversationId && !recipientId)
    if (conversationId || recipientId) {
      if (conversationId && messageCacheRef.current[conversationId]) {
        setMessages(messageCacheRef.current[conversationId])
      }
      return focusInput()
    }
  }, [conversationId, recipientId, focusInput])

  // Directory lookup for the "new thread" recipient header (and as an id->user fallback)
  useEffect(() => {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    fetchCachedEmployees(token).then(list => {
      setMembers(list.map(m => ({
        id: String(m.id || ''),
        name: String(m.name || ''),
        profileImage: (m.profileImage as string) || null,
        role: String(m.role || ''),
        jobTitle: (m.jobTitle as string) || null,
        lastActiveAt: (m.lastActiveAt as string) || null,
      })))
    }).catch(() => {})
  }, [])

  const activeConversation: ConversationSummary | undefined = useMemo(
    () => conversations.find(c => c.id === activeId),
    [conversations, activeId]
  )

  const recipientMember = useMemo(
    () => (recipientId ? members.find(m => m.id === recipientId) : undefined),
    [members, recipientId]
  )

  const loadMessages = useCallback(async (id: string, { silent }: { silent?: boolean } = {}) => {
    if (!silent && !messageCacheRef.current[id]) setMessagesLoading(true)
    try {
      const msgs = await getMessages(id)
      messageCacheRef.current[id] = msgs
      setMessages(prev => {
        if (prev.length === msgs.length && prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id) {
          return prev
        }
        return msgs
      })
    } catch {
      // silent — keep last known messages on transient failure
    } finally {
      if (!silent) setMessagesLoading(false)
    }
  }, [getMessages])

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (!activeId) { setMessages([]); return }
    const cached = messageCacheRef.current[activeId]
    if (cached) {
      setMessages(cached)
      void loadMessages(activeId, { silent: true })
    } else {
      void loadMessages(activeId)
    }
    pollRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') void loadMessages(activeId, { silent: true })
    }, POLL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeId, loadMessages])

  const scrollToBottom = useCallback((instant = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(true)
      const t1 = setTimeout(() => scrollToBottom(true), 30)
      const t2 = setTimeout(() => scrollToBottom(true), 120)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [messages, activeId, scrollToBottom])

  const handleSend = async () => {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    try {
      const sent = activeId
        ? await sendMessage({ conversationId: activeId, content })
        : await sendMessage({ recipientId, content })
      setMessages(prev => [...prev, sent])
      if (!activeId && sent.conversationId) {
        navigate(`/messages/${sent.conversationId}`, { replace: true })
      }
    } catch {
      setDraft(content)
    } finally {
      setSending(false)
      // Keep caret focus in the input field without interruption
      inputRef.current?.focus()
    }
  }

  const filteredConversations = useMemo(() => {
    if (!listQuery.trim()) return conversations
    const q = listQuery.trim().toLowerCase()
    return conversations.filter(c => c.otherUserName.toLowerCase().includes(q))
  }, [conversations, listQuery])

  const bg = isLight ? '#ffffff' : '#0A1120'
  const panelBg = isLight ? '#ffffff' : '#0d1626'
  const border = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#6B90BE'
  const hoverBg = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'
  const inputBg = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'
  const bubbleTheirs = isLight ? '#f1f5f9' : '#1e3254'

  const headerName = activeConversation?.otherUserName || recipientMember?.name || ''
  const headerImage = activeConversation?.otherUserProfileImage ?? recipientMember?.profileImage ?? null
  const headerRole = activeConversation?.otherUserJobTitle
    ? formatPersonName(activeConversation.otherUserJobTitle)
    : activeConversation?.otherUserRole
      ? formatRole(activeConversation.otherUserRole)
      : recipientMember?.jobTitle
        ? formatPersonName(recipientMember.jobTitle)
        : recipientMember?.role
          ? formatRole(recipientMember.role)
          : ''
  const headerOnline = isOnline(activeConversation?.otherUserLastActiveAt ?? recipientMember?.lastActiveAt)

  let lastDayLabel = ''

  return (
    <div
      className="flex flex-1 w-full h-full sm:p-4 min-h-0 overflow-hidden"
      style={{
        height: viewportHeight ? `${viewportHeight}px` : '100%',
        maxHeight: viewportHeight ? `${viewportHeight}px` : '100dvh',
      }}
    >
      <div
        className="flex flex-1 w-full h-full rounded-none sm:rounded-2xl overflow-hidden border-0 sm:border min-h-0"
        style={{ backgroundColor: panelBg, borderColor: border }}
      >
        {/* ── Conversation list ── */}
        <div
          className={`flex-col w-full sm:w-[320px] md:w-[360px] shrink-0 border-r ${showListMobile ? 'flex' : 'hidden sm:flex'}`}
          style={{ borderColor: border }}
        >
          <div className="px-4 py-3.5 sm:py-3 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
            <h1 className="text-lg sm:text-[17px] font-black tracking-tight" style={{ color: textPrimary }}>Chats</h1>
            <button
              onClick={() => navigate(-1)}
              title="Exit messages"
              className="sm:hidden p-1.5 -mr-1.5 rounded-lg transition-colors cursor-pointer"
              style={{ color: textMuted }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3.5 sm:h-3.5" style={{ color: textMuted }} />
              <input
                type="text"
                value={listQuery}
                onChange={e => setListQuery(e.target.value)}
                placeholder="Search chats…"
                className="w-full pl-9 sm:pl-8 pr-3 py-2.5 sm:py-2 rounded-xl text-[14px] sm:text-[13px] focus:outline-none"
                style={{ backgroundColor: inputBg, color: textPrimary }}
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="px-4 py-16 sm:py-10 text-center text-sm sm:text-[13px]" style={{ color: textMuted }}>
                {conversations.length === 0 ? 'No conversations yet' : 'No matches'}
              </div>
            ) : (
              filteredConversations.map(c => {
                const online = isOnline(c.otherUserLastActiveAt)
                const mine = c.lastMessageSenderId === user?.id
                const isActive = c.id === activeId
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveId(c.id)
                      setShowListMobile(false)
                      navigate(`/messages/${c.id}`)
                      focusInput()
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors cursor-pointer"
                    style={{ backgroundColor: isActive ? hoverBg : 'transparent' }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                  >
                    <div className="relative shrink-0">
                      <UserAvatar name={c.otherUserName} imageUrl={c.otherUserProfileImage} size="sm" />
                      {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10B981', border: `2px solid ${panelBg}` }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] sm:text-[13px] font-semibold truncate" style={{ color: textPrimary }}>{formatPersonName(c.otherUserName)}</p>
                      <p className="text-[13px] sm:text-[12px] truncate" style={{ color: c.unreadCount > 0 ? textPrimary : textMuted, fontWeight: c.unreadCount > 0 ? 600 : 400 }}>
                        {c.lastMessagePreview ? `${mine ? 'You: ' : ''}${c.lastMessagePreview}` : 'Say hi 👋'}
                      </p>
                    </div>
                    {c.unreadCount > 0 && <span className="w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ backgroundColor: '#10B981' }} />}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── Active thread ── */}
        <div className={`flex-1 min-w-0 flex-col ${showListMobile ? 'hidden sm:flex' : 'flex'}`}>
          {!activeId && !isNewThread ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 relative">
              <button
                onClick={() => navigate(-1)}
                title="Exit messages"
                className="absolute top-3 right-4 p-2 rounded-xl transition-colors cursor-pointer"
                style={{ color: textMuted }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
              >
                <X className="w-5 h-5" />
              </button>
              <MessageSquare className="w-12 h-12 sm:w-10 sm:h-10" style={{ color: textMuted, opacity: 0.4 }} />
              <p className="text-sm font-medium" style={{ color: textMuted }}>Pick a conversation to start chatting</p>
            </div>
          ) : (
            <>
              <div className="px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 shrink-0" style={{ borderBottom: `1px solid ${border}`, backgroundColor: bg }}>
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <button
                    onClick={() => { setShowListMobile(true); navigate('/messages') }}
                    className="sm:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                    title="Back to chats"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="relative shrink-0">
                    <UserAvatar name={headerName} imageUrl={headerImage} size="sm" />
                    {headerOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10B981', border: `2px solid ${bg}` }} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold truncate" style={{ color: textPrimary }}>{formatPersonName(headerName) || 'Unknown user'}</p>
                    <p className="text-[11px] truncate" style={{ color: headerOnline ? '#10B981' : textMuted }}>
                      {headerOnline ? 'Online now' : headerRole}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => navigate(-1)}
                  title="Exit messages"
                  className="p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
                  style={{ color: textMuted }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-1" style={{ backgroundColor: bg }}>
                {messagesLoading && messages.length === 0 ? (
                  <div className="flex-1 flex flex-col justify-end gap-2 p-2 animate-pulse opacity-40">
                    <div className="w-48 h-8 rounded-2xl self-start" style={{ backgroundColor: bubbleTheirs }} />
                    <div className="w-64 h-10 rounded-2xl self-end" style={{ backgroundColor: '#10B981' }} />
                    <div className="w-40 h-8 rounded-2xl self-start" style={{ backgroundColor: bubbleTheirs }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm sm:text-[13px]" style={{ color: textMuted }}>
                    No messages yet — say hi 👋
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const mine = m.senderId === user?.id
                    const dayLabel = formatDayLabel(m.createdAt)
                    const showDayLabel = dayLabel !== lastDayLabel
                    lastDayLabel = dayLabel
                    const prevSameSender = idx > 0 && messages[idx - 1].senderId === m.senderId && !showDayLabel
                    return (
                      <div key={m.id}>
                        {showDayLabel && (
                          <div className="text-center my-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ color: textMuted, backgroundColor: inputBg }}>
                              {dayLabel}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${prevSameSender ? 'mt-0.5' : 'mt-2'}`}>
                          <div
                            className="max-w-[85%] sm:max-w-[75%] px-3.5 py-2 rounded-2xl text-[13.5px] sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words shadow-2xs"
                            style={mine
                              ? { backgroundColor: '#10B981', color: '#ffffff', borderBottomRightRadius: prevSameSender ? undefined : '4px' }
                              : { backgroundColor: bubbleTheirs, color: textPrimary, borderBottomLeftRadius: prevSameSender ? undefined : '4px' }}
                            title={formatBubbleTime(m.createdAt)}
                          >
                            {m.content}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#ffffff' : '#0A1120' }}>
                <div className="relative flex items-end">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    onChange={e => {
                      setDraft(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSend()
                      }
                    }}
                    placeholder="Type a message…"
                    autoFocus
                    enterKeyHint="send"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="on"
                    spellCheck={false}
                    className="w-full pl-4 pr-12 py-2.5 rounded-xl text-sm sm:text-[13px] focus:outline-none resize-none overflow-y-auto leading-normal max-h-[120px]"
                    style={{ backgroundColor: inputBg, color: textPrimary, minHeight: '42px' }}
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={!draft.trim() || sending}
                    className="absolute right-2 bottom-1.5 p-2 rounded-lg transition-colors cursor-pointer"
                    style={{
                      backgroundColor: draft.trim() ? '#10B981' : 'transparent',
                      color: draft.trim() ? '#ffffff' : textMuted,
                      opacity: (!draft.trim() || sending) ? 0.45 : 1,
                    }}
                  >
                    <Send className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
