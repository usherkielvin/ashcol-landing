import { createContext, useContext, useState, useCallback } from 'react'

export interface FloatingChatTarget {
  conversationId?: string
  recipientId?: string
  /** Only needed when starting a brand-new thread (no conversationId yet) so the popup has something to show immediately. */
  recipientInfo?: {
    name: string
    profileImage?: string | null
    role?: string | null
    jobTitle?: string | null
    lastActiveAt?: string | null
  }
}

interface FloatingChatContextType {
  openChat: FloatingChatTarget | null
  openFloatingChat: (target: FloatingChatTarget) => void
  closeFloatingChat: () => void
  /** Swap the open popup's conversationId once a brand-new thread gets its first real id back from the server. */
  promoteToConversation: (conversationId: string) => void
}

const FloatingChatContext = createContext<FloatingChatContextType | undefined>(undefined)

export function FloatingChatProvider({ children }: { children: React.ReactNode }) {
  const [openChat, setOpenChat] = useState<FloatingChatTarget | null>(null)

  const openFloatingChat = useCallback((target: FloatingChatTarget) => {
    setOpenChat(target)
  }, [])

  const closeFloatingChat = useCallback(() => setOpenChat(null), [])

  const promoteToConversation = useCallback((conversationId: string) => {
    setOpenChat(prev => (prev ? { ...prev, conversationId } : prev))
  }, [])

  return (
    <FloatingChatContext.Provider value={{ openChat, openFloatingChat, closeFloatingChat, promoteToConversation }}>
      {children}
    </FloatingChatContext.Provider>
  )
}

export function useFloatingChat() {
  const ctx = useContext(FloatingChatContext)
  if (!ctx) throw new Error('useFloatingChat must be used within FloatingChatProvider')
  return ctx
}
