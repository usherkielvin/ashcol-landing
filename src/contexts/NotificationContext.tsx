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
      setNotifications(data?.data || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  const markRead = useCallback(async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      )
    } catch {
      // silent
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setNotifications([])
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    fetchNotifications()

    // Poll every 30 seconds
    intervalRef.current = setInterval(fetchNotifications, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
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
