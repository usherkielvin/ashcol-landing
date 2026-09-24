import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const applyTheme = (theme: Theme) => {
  const root = document.documentElement  // this is both :root and html
  if (theme === 'light') {
    root.classList.add('light')
    root.classList.remove('dark')
  } else {
    root.classList.add('dark')
    root.classList.remove('light')
  }
  // CSS variables are now handled by :root / :root.light in index.css
  // But we also set them here so runtime toggles are instant (no FOUC)
  if (theme === 'light') {
    root.style.setProperty('--bg',           '#f1f5f9')
    root.style.setProperty('--sidebar-bg',   '#ffffff')
    root.style.setProperty('--header-bg',    'rgba(255,255,255,0.95)')
    root.style.setProperty('--border',       '#e2e8f0')
    root.style.setProperty('--text-primary', '#0f172a')
    root.style.setProperty('--text-muted',   '#64748b')
    root.style.setProperty('--input-bg',     '#f8fafc')
    root.style.setProperty('--input-border', '#cbd5e1')
    root.style.setProperty('--hover-bg',     '#f1f5f9')
  } else {
    root.style.setProperty('--bg',           '#060B18')
    root.style.setProperty('--sidebar-bg',   'rgba(10,17,32,0.98)')
    root.style.setProperty('--header-bg',    'rgba(10,17,32,0.90)')
    root.style.setProperty('--border',       '#1E2D48')
    root.style.setProperty('--text-primary', '#E2E8F0')
    root.style.setProperty('--text-muted',   '#7A95B8')
    root.style.setProperty('--input-bg',     '#0F1A2E')
    root.style.setProperty('--input-border', '#243452')
    root.style.setProperty('--hover-bg',     '#0F1A2E')
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('ashcol-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Apply immediately on first render (before paint) to avoid flash
  applyTheme(theme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('ashcol-theme', theme)
  }, [theme])

  // Listen to OS theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('ashcol-theme')) return
      const next = e.matches ? 'dark' : 'light'
      applyTheme(next)
      setTheme(next)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      // Immediately and synchronously update DOM class and CSS variables
      applyTheme(next)
      try {
        localStorage.setItem('ashcol-theme', next)
      } catch {}
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
