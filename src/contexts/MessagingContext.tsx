import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { API_BASE_URL, readApiError } from '../utils/api'

export interface ConversationSummary {
  id: string
  otherUserId: string
  otherUserName: string
  otherUserProfileImage: string | null
  otherUserRole: string | null
  otherUserJobTitle: string | null
  otherUserLastActiveAt: string | null
  lastMessagePreview: string | null
  lastMessageAt: string | null
  lastMessageSenderId: string | null
  unreadCount: number
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string
  read: boolean
}

interface MessagingContextType {
  conversations: ConversationSummary[]
  unreadCount: number
  loading: boolean
  fetchConversations: () => Promise<void>
  getMessages: (conversationId: string) => Promise<ChatMessage[]>
  sendMessage: (params: { conversationId?: string; recipientId?: string; content: string }) => Promise<ChatMessage>
}

const MessagingContext = createContext<MessagingContextType | undefined>(undefined)

const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // A refresh still waiting on the API: another one asked for meanwhile is not stacked behind it on a slow link;
  // it runs once, right after (so a refresh requested after sending a message is never lost).
  const fetchingRef = useRef(false)
  const refetchQueuedRef = useRef(false)

  const fetchConversations = useCallback(async () => {
    if (!getToken()) return
    if (fetchingRef.current) {
      refetchQueuedRef.current = true
      return
    }
    fetchingRef.current = true
    try {
      setLoading(true)
      const [convRes, unreadRes] = await Promise.all([
        fetch(`${API_BASE_URL}/messages/conversations`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/messages/unread-count`, { headers: authHeaders() }),
      ])
      if (convRes.ok) {
        const data = await convRes.json()
        setConversations(data?.data || [])
      }
      if (unreadRes.ok) {
        const data = await unreadRes.json()
        setUnreadCount(Number(data?.data?.unread) || 0)
      }
    } catch {
      // silent — polled, next tick retries
    } finally {
      fetchingRef.current = false
      setLoading(false)
      if (refetchQueuedRef.current) {
        refetchQueuedRef.current = false
        void fetchConversationsRef.current()
      }
    }
  }, [])
  const fetchConversationsRef = useRef(fetchConversations)
  fetchConversationsRef.current = fetchConversations

  const getMessages = useCallback(async (conversationId: string): Promise<ChatMessage[]> => {
    const res = await fetch(`${API_BASE_URL}/messages/conversations/${conversationId}/messages`, { headers: authHeaders() })
    if (!res.ok) throw new Error(await readApiError(res))
    const data = await res.json()
    return data?.data || []
  }, [])

  const sendMessage = useCallback(async (params: { conversationId?: string; recipientId?: string; content: string }): Promise<ChatMessage> => {
    const res = await fetch(`${API_BASE_URL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(await readApiError(res))
    const data = await res.json()
    await fetchConversations()
    return data?.data
  }, [fetchConversations])

  useEffect(() => {
    if (!user) {
      setConversations([])
      setUnreadCount(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    const poll = () => {
      if (document.visibilityState === 'visible') {
        void fetchConversations()
      }
    }

    poll()
    // Once a minute (was every 20 s): every open tab polls, and those requests compete with page loads. Coming back
    // to the tab and sending a message still refresh at once; an open chat window has its own faster poll.
    intervalRef.current = setInterval(poll, 60_000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchConversations()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, fetchConversations])

  return (
    <MessagingContext.Provider value={{ conversations, unreadCount, loading, fetchConversations, getMessages, sendMessage }}>
      {children}
    </MessagingContext.Provider>
  )
}

export function useMessaging() {
  const ctx = useContext(MessagingContext)
  if (!ctx) throw new Error('useMessaging must be used within MessagingProvider')
  return ctx
}
