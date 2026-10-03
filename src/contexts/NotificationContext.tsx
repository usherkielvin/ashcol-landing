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
  /** Notification currently shown in the full-detail popup, if any. */
  viewingNotification: AppNotification | null
  /** Opens the detail popup for this id once it's available (retries against the list until found —
   *  covers a cold push-notification click before the list has finished its first fetch). */
  openNotificationDetail: (id: string) => void
  closeNotificationDetail: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [viewingNotification, setViewingNotification] = useState<AppNotification | null>(null)
  const pendingViewIdRef = useRef<string | null>(null)

  // A refresh still waiting on the API: the next poll is skipped rather than stacked behind it on a slow link.
  const fetchingRef = useRef(false)
  const fetchNotifications = useCallback(async () => {
    if (!getToken() || fetchingRef.current) return
    fetchingRef.current = true
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/notifications`, { headers: authHeaders() })
      if (!res.ok) return
      const data = await res.json()
      const rawList: any[] = Array.isArray(data?.data) ? data.data : []
      const fetched: AppNotification[] = rawList.map((n: any) => ({
        id: String(n.id || ''),
        userId: String(n.userId || n.user_id || ''),
        ticketId: n.ticketId || n.ticket_id || null,
        title: n.title || '',
        message: n.message || '',
        isRead: Boolean(n.isRead ?? n.read ?? n.is_read ?? false),
        link: n.link || null,
        createdAt: n.createdAt || n.created_at || '',
      }))

      // Preserve any optimistic isRead=true that the server hasn't caught up with yet
      setNotifications(prev => {
        const readIds = new Set(prev.filter(n => n.isRead).map(n => n.id))
        return fetched.map(n => readIds.has(n.id) ? { ...n, isRead: true } : n)
      })
    } catch {
      // silent
    } finally {
      fetchingRef.current = false
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

  const openNotificationDetail = useCallback((id: string) => {
    const found = notifications.find(n => n.id === id)
    if (found) {
      setViewingNotification(found)
      pendingViewIdRef.current = null
    } else {
      // Not loaded yet (e.g. a fresh push notification click before the list has fetched) —
      // the effect below opens it as soon as fetchNotifications brings it in.
      pendingViewIdRef.current = id
    }
  }, [notifications])

  const closeNotificationDetail = useCallback(() => {
    setViewingNotification(null)
    pendingViewIdRef.current = null
  }, [])

  // Resolve a pending detail-view request once the list catches up with it.
  useEffect(() => {
    if (!pendingViewIdRef.current) return
    const found = notifications.find(n => n.id === pendingViewIdRef.current)
    if (found) {
      setViewingNotification(found)
      pendingViewIdRef.current = null
    }
  }, [notifications])

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
    // Once a minute (was every 30 s): every open tab polls, and those requests compete with page loads.
    // Coming back to the tab still refreshes at once.
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
    <NotificationContext.Provider value={{
      notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead,
      viewingNotification, openNotificationDetail, closeNotificationDetail,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
