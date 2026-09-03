import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL, formatPersonName, resolveImageUrl } from '../utils/api'
import { clearSchedulesSessionMarkers, SCHEDULES_PERSIST_LOCAL } from '../utils/ticketTabCache'

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
  birthDate?: string | null
  /** Comma-separated branch IDs the member has read-only schedule viewing access to */
  viewBranchIds?: string | null
  lastLoginAt?: string | null
  lastActiveAt?: string | null
}

interface AuthContextType {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  logout: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const SESSION_KEY = 'ashcol-user'
const TOKEN_KEY = 'ashcol-token'
/** Keep "remember email" across logout — not a credential. */
const KEEP_ON_LOGOUT = new Set(['ashcol-remembered-email'])

const AUTH_PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/forgot-password',
  '/create-account',
  '/booking',
])

const normalizeAuthUser = (u: AuthUser | null): AuthUser | null => {
  if (!u) return null
  return { ...u, role: (u.role || '').toLowerCase() }
}

function readStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
}

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload && typeof payload.exp === 'number') {
      return payload.exp < Math.floor(Date.now() / 1000)
    }
    return false
  } catch {
    return false
  }
}

function clearAshcolStorage(storage: Storage, { keepRememberedEmail = false } = {}) {
  const staleKeys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (!k || !k.startsWith('ashcol')) continue
    if (keepRememberedEmail && KEEP_ON_LOGOUT.has(k)) continue
    staleKeys.push(k)
  }
  staleKeys.forEach((k) => storage.removeItem(k))
}

function wipeAuthCredentials({ keepRememberedEmail = false } = {}) {
  clearAshcolStorage(sessionStorage, { keepRememberedEmail })
  clearAshcolStorage(localStorage, { keepRememberedEmail })
}

function isAuthPublicPath(pathname: string): boolean {
  if (AUTH_PUBLIC_PATHS.has(pathname)) return true
  // Public marketing site routes only — portal paths are never public.
  return false
}

function redirectToLogin(expired = false) {
  const pathname = window.location.pathname
  if (isAuthPublicPath(pathname) && pathname === '/login') {
    if (expired && !window.location.search.includes('expired')) {
      window.location.replace('/login?expired=true')
    }
    return
  }
  if (pathname === '/login') return
  window.location.replace(expired ? '/login?expired=true' : '/login')
}

/** Restore session only when a non-expired JWT is present. Never trust ashcol-user alone. */
function loadUserFromStorage(): AuthUser | null {
  try {
    const token = readStoredToken()
    if (!token || isJwtExpired(token)) {
      if (token) {
        localStorage.removeItem(TOKEN_KEY)
        sessionStorage.removeItem(TOKEN_KEY)
      }
      localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    const stored = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
    return stored ? normalizeAuthUser(JSON.parse(stored)) : null
  } catch {
    return null
  }
}

export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() => loadUserFromStorage())
  const userRef = useRef(user)
  userRef.current = user

  const setUser = (u: AuthUser | null) => {
    const normalized = normalizeAuthUser(u)
    setUserState(normalized)
    if (normalized) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalized))
      if (localStorage.getItem(TOKEN_KEY)) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(normalized))
      }
    } else {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(SESSION_KEY)
    }
  }

  /**
   * Re-check token/storage against React state.
   * Critical for browser back/forward (bfcache): the page can revive with an
   * in-memory `user` even after logout wiped localStorage/sessionStorage.
   */
  const enforceSession = useCallback((opts?: { expired?: boolean; hardRedirect?: boolean }) => {
    const token = readStoredToken()
    const valid = Boolean(token && !isJwtExpired(token))

    if (!valid) {
      if (token && isJwtExpired(token)) {
        wipeAuthCredentials({ keepRememberedEmail: true })
      } else if (!token) {
        // Storage already cleared (logout) — still drop in-memory user.
        sessionStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(SESSION_KEY)
      }
      if (userRef.current) setUserState(null)
      if (opts?.hardRedirect !== false) {
        const path = window.location.pathname
        if (!isAuthPublicPath(path)) {
          redirectToLogin(Boolean(opts?.expired))
        }
      }
      return false
    }
    return true
  }, [])

  // Hard logout: wipe credentials + full navigation so bfcache can't revive dashboard state.
  const logout = useCallback(() => {
    window.dispatchEvent(new CustomEvent(SCHEDULES_PERSIST_LOCAL))
    clearSchedulesSessionMarkers()
    setUserState(null)
    wipeAuthCredentials({ keepRememberedEmail: true })
    window.dispatchEvent(new CustomEvent('ashcol-global-branch-change'))
    // Full replace — SPA navigate alone leaves history entries that Back can restore from bfcache.
    window.location.replace('/login')
  }, [])

  const refreshProfile = useCallback(async () => {
    const token = readStoredToken()
    if (!token || isJwtExpired(token)) return
    try {
      const res = await fetch(`${API_BASE_URL}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        wipeAuthCredentials({ keepRememberedEmail: true })
        setUserState(null)
        redirectToLogin(true)
        return
      }
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
          lastLoginAt: u.lastLoginAt ?? prev.lastLoginAt,
          lastActiveAt: u.lastActiveAt ?? prev.lastActiveAt,
        })
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
        if (localStorage.getItem(TOKEN_KEY)) {
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

  // Periodic token check + bfcache / tab-focus revalidation
  useEffect(() => {
    const check = (opts?: { expired?: boolean }) => {
      const token = readStoredToken()
      if (!token) {
        enforceSession({ hardRedirect: true })
        return
      }
      if (isJwtExpired(token)) {
        wipeAuthCredentials({ keepRememberedEmail: true })
        setUserState(null)
        redirectToLogin(true)
        return
      }
      // Token present — if React lost user (shouldn't), reload from storage
      if (!userRef.current) {
        const restored = loadUserFromStorage()
        if (restored) setUserState(restored)
      }
      void opts
    }

    check()
    const interval = setInterval(() => check(), 10000)

    const onPageShow = (event: PageTransitionEvent) => {
      // Browser restored this document from bfcache (Back/Forward after logout).
      if (event.persisted) check()
      else check()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('ashcol')) check()
    }

    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('storage', onStorage)

    return () => {
      clearInterval(interval)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('storage', onStorage)
    }
  }, [enforceSession])

  // Boot: if we landed on a protected URL without a valid token, bounce immediately
  useEffect(() => {
    if (!loadUserFromStorage() && !isAuthPublicPath(window.location.pathname)) {
      redirectToLogin()
    }
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
