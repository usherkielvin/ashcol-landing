import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { X, Send, Maximize2 } from 'lucide-react'
import { useFloatingChat } from '../contexts/FloatingChatContext'
import { useMessaging, type ChatMessage } from '../contexts/MessagingContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatPersonName, formatRole } from '../utils/api'
import { isOnline, formatBubbleTime, formatDayLabel } from '../utils/messagingFormat'
import UserAvatar from './UserAvatar'

const POLL_MS = 5_000

export default function FloatingChatWindow() {
  const { openChat, closeFloatingChat, promoteToConversation } = useFloatingChat()
  const { conversations, getMessages, sendMessage } = useMessaging()
  const { user } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const navigate = useNavigate()
  const location = useLocation()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeId = openChat?.conversationId
  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeId),
    [conversations, activeId]
  )

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setMessages([])
    if (!activeId) return
    const load = (silent?: boolean) => {
      getMessages(activeId).then(msgs => {
        if (!silent) setMessages(msgs)
        else setMessages(prev => (prev.length === msgs.length ? prev : msgs))
      }).catch(() => {})
    }
    load()
    pollRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') load(true)
    }, POLL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeId, getMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (openChat) setTimeout(() => inputRef.current?.focus(), 50)
  }, [openChat])

  if (!openChat || location.pathname.startsWith('/messages')) return null

  const bg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1e3254'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#6B90BE'
  const inputBg = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'
  const bubbleTheirs = isLight ? '#f1f5f9' : '#1e3254'

  const headerName = activeConversation?.otherUserName || openChat.recipientInfo?.name || ''
  const headerImage = activeConversation?.otherUserProfileImage ?? openChat.recipientInfo?.profileImage ?? null
  const headerRole = activeConversation?.otherUserJobTitle
    ? formatPersonName(activeConversation.otherUserJobTitle)
    : activeConversation?.otherUserRole
      ? formatRole(activeConversation.otherUserRole)
      : openChat.recipientInfo?.jobTitle
        ? formatPersonName(openChat.recipientInfo.jobTitle)
        : openChat.recipientInfo?.role
          ? formatRole(openChat.recipientInfo.role)
          : ''
  const headerOnline = isOnline(activeConversation?.otherUserLastActiveAt ?? openChat.recipientInfo?.lastActiveAt)

  const handleSend = async () => {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setDraft('')
    try {
      const sent = activeId
        ? await sendMessage({ conversationId: activeId, content })
        : await sendMessage({ recipientId: openChat.recipientId, content })
      setMessages(prev => [...prev, sent])
      if (!activeId && sent.conversationId) promoteToConversation(sent.conversationId)
    } catch {
      setDraft(content)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  let lastDayLabel = ''

  return (
    <div
      className="fixed bottom-6 right-6 w-[350px] sm:w-[380px] h-[480px] rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden"
      style={{ backgroundColor: bg, border: `1px solid ${border}` }}
    >
      <div className="px-3 py-2.5 flex items-center justify-between gap-2 shrink-0" style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0d1626' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <UserAvatar name={headerName} imageUrl={headerImage} size="sm" />
            {headerOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10B981', border: `2px solid ${bg}` }} />}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold truncate" style={{ color: textPrimary }}>{formatPersonName(headerName) || 'Unknown user'}</p>
            <p className="text-[10px] truncate" style={{ color: headerOnline ? '#10B981' : textMuted }}>
              {headerOnline ? 'Online now' : headerRole}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => { navigate(activeId ? `/messages/${activeId}` : `/messages/new/${openChat.recipientId}`); closeFloatingChat() }}
            title="Open full view"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: textMuted }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = inputBg}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={closeFloatingChat}
            title="Close"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: textMuted }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = inputBg}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: textMuted }}>
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
                  <div className="text-center my-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color: textMuted, backgroundColor: inputBg }}>
                      {dayLabel}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${prevSameSender ? 'mt-0.5' : 'mt-1.5'}`}>
                  <div
                    className="max-w-[80%] px-3 py-1.5 rounded-2xl text-[12.5px] leading-relaxed whitespace-pre-wrap break-words"
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

      <div className="p-2.5 shrink-0" style={{ borderTop: `1px solid ${border}` }}>
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
            placeholder="Type a message…"
            className="w-full pl-3 pr-10 py-2 rounded-xl text-[12.5px] focus:outline-none"
            style={{ backgroundColor: inputBg, color: textPrimary }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!draft.trim() || sending}
            className="absolute right-1.5 p-1.5 rounded-lg transition-colors"
            style={{
              backgroundColor: draft.trim() ? '#10B981' : 'transparent',
              color: draft.trim() ? '#ffffff' : textMuted,
              opacity: (!draft.trim() || sending) ? 0.45 : 1,
            }}
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
