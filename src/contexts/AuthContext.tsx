import { createContext, useContext, useState } from 'react'

export interface AuthUser {
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
}

interface AuthContextType {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const SESSION_KEY = 'ashcol-user'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() => {
    try {
      // Migrate token from sessionStorage to localStorage if needed
      const oldToken = sessionStorage.getItem('ashcol-token')
      if (oldToken && !localStorage.getItem('ashcol-token')) {
        localStorage.setItem('ashcol-token', oldToken)
      }
      const stored = localStorage.getItem(SESSION_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const setUser = (u: AuthUser | null) => {
    setUserState(u)
    if (u) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(u))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem('ashcol-token')
    sessionStorage.removeItem('ashcol-token')
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
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
