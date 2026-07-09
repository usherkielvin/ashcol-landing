import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { API_BASE_URL, formatPersonName, resolveImageUrl } from '../utils/api'
import { prefetchSchedulesDateWindow } from '../utils/schedulesPrefetch'

export interface AuthUser {
  id?: string
  name: string
  email: string
  /** Personal contact email (editable for branch managers; work email stays fixed). */
  personalEmail?: string | null
  phone?: string    // User's contact number
  address?: string  // Legacy: User's default address (kept for backward compatibility)
  region?: string   // User's region
  city?: string     // User's city/municipality
  barangay?: string // User's barangay
  street?: string   // User's street address
  landmark?: string // User's landmark
  picture: string   // Google profile picture URL
  role: string      // e.g. 'Customer', 'Staff', 'Administrator'
  initials: string
  /** Set for branch managers — scopes portal to this branch */
  branchId?: string | null
  /** User's official job title (e.g. "Sales Coordinator") */
  jobTitle?: string | null
}

interface AuthContextType {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  logout: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const SESSION_KEY = 'ashcol-user'

const normalizeAuthUser = (u: AuthUser | null): AuthUser | null => {
  if (!u) return null
  return { ...u, role: (u.role || '').toLowerCase() }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      if (token) {
        // Decode JWT token and check expiration
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          if (payload && typeof payload.exp === 'number') {
            const currentSec = Math.floor(Date.now() / 1000)
            if (payload.exp < currentSec) {
              // Token is expired! Clear all auth credentials
              localStorage.removeItem('ashcol-token')
              sessionStorage.removeItem('ashcol-token')
              localStorage.removeItem(SESSION_KEY)
              sessionStorage.removeItem(SESSION_KEY)
              
              const pathname = window.location.pathname
              if (pathname !== '/login' && pathname !== '/forgot-password' && pathname !== '/create-account' && pathname !== '/') {
                window.location.href = '/login?expired=true'
              }
              return null
            }
          }
        }
      }

      const stored = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
      return stored ? normalizeAuthUser(JSON.parse(stored)) : null
    } catch {
      return null
    }
  })

  const setUser = (u: AuthUser | null) => {
    const normalized = normalizeAuthUser(u)
    setUserState(normalized)
    if (normalized) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalized))
      if (localStorage.getItem('ashcol-token')) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(normalized))
      }
    } else {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(SESSION_KEY)
    }
  }

  // logout only clears storage and state — navigation is handled by callers
  // via React Router navigate('/login', { replace: true }) for instant SPA navigation
  const logout = () => {
    setUser(null)
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem('ashcol-token')
    localStorage.removeItem('ashcol-token')
    localStorage.removeItem(SESSION_KEY)
  }

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const body = await res.json()
      const u = body?.data || body
      if (!u) return
      const name = formatPersonName(u.name || '')
      setUserState(prev => {
        if (!prev) return prev
        const next = normalizeAuthUser({
          ...prev,
          name: name || prev.name,
          email: u.email ?? prev.email,
          personalEmail: u.personalEmail ?? prev.personalEmail,
          phone: u.phone ?? prev.phone,
          picture: resolveImageUrl(u.profileImage) || prev.picture,
          jobTitle: u.jobTitle ?? prev.jobTitle,
          branchId: u.branchId ?? prev.branchId,
          region: u.region ?? prev.region,
          city: u.city ?? prev.city,
          barangay: u.barangay ?? prev.barangay,
          street: u.street ?? u.address ?? prev.street,
          landmark: u.landmark ?? prev.landmark,
          initials: getInitials(name || prev.name),
        })
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
        if (localStorage.getItem('ashcol-token')) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(next))
        }
        return next
      })
    } catch {
      // ignore — stale cached user is acceptable offline
    }
  }, [])

  // Keep session avatar/name in sync after profile edits elsewhere in the app
  useEffect(() => {
    const onProfileUpdated = () => { refreshProfile() }
    window.addEventListener('ashcol-profile-updated', onProfileUpdated)
    return () => window.removeEventListener('ashcol-profile-updated', onProfileUpdated)
  }, [refreshProfile])

  // Refresh profile once when a session is restored
  useEffect(() => {
    if (user) refreshProfile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Warm schedules cache (yesterday / today / tomorrow) as soon as the user is signed in.
  useEffect(() => {
    if (!user) return
    const globalBranchId = localStorage.getItem('ashcol-global-branch-id')
    void prefetchSchedulesDateWindow(user, globalBranchId, { force: true })
  }, [user?.id, user?.role, user?.branchId])

  // Periodic token expiration check
  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      if (token) {
        const parts = token.split('.')
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
            if (payload && typeof payload.exp === 'number') {
              const currentSec = Math.floor(Date.now() / 1000)
              if (payload.exp < currentSec) {
                logout()
                const pathname = window.location.pathname
                if (pathname !== '/login' && pathname !== '/forgot-password' && pathname !== '/create-account' && pathname !== '/') {
                  window.location.href = '/login?expired=true'
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    checkToken()
    const interval = setInterval(checkToken, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Derives initials from a full name, e.g. "Juan Dela Cruz" → "JD" */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
