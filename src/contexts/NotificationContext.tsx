import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { API_BASE_URL } from '../utils/api'

export interface AppNotification {
  id: string
  userId: string
  ticketId: string | null
  title: string
  message: string
  isRead: boolean
  link: string | null
  createdAt: string
}

interface NotificationContextType {
  notifications: AppNotification[]
  unreadCount: number
  loading: boolean
  fetchNotifications: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!getToken()) return
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/notifications`, { headers: authHeaders() })
      if (!res.ok) return
      const data = await res.json()
      const fetched: AppNotification[] = data?.data || []
      // Preserve any optimistic isRead=true that the server hasn't caught up with yet
      setNotifications(prev => {
        const readIds = new Set(prev.filter(n => n.isRead).map(n => n.id))
        return fetched.map(n => readIds.has(n.id) ? { ...n, isRead: true } : n)
      })
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  const markRead = useCallback(async (id: string) => {
    // Optimistic update first
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      // If API fails, revert
      if (!res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: false } : n))
      }
    } catch {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: false } : n))
    }
  }, [])

  const markAllRead = useCallback(async () => {
    // Optimistic update first
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      // If API fails, refetch to get real state
      if (!res.ok) {
        await fetchNotifications()
      }
    } catch {
      await fetchNotifications()
    }
  }, [fetchNotifications])

  useEffect(() => {
    if (!user) {
      setNotifications([])
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    const poll = () => {
      if (document.visibilityState === 'visible') {
        void fetchNotifications()
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 60_000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchNotifications()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, fetchNotifications])

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
