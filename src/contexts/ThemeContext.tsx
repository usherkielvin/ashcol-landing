import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
export type ThemeMode = 'auto' | 'light' | 'dark'

interface ThemeContextType {
  /** The theme actually in effect (Auto resolves to the device setting). */
  theme: Theme
  /** What the user picked: follow the device, or force light/dark. */
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
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

const MODE_KEY = 'ashcol-theme-mode'

const systemTheme = (): Theme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

const readMode = (): ThemeMode => {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved
  } catch { /* storage unavailable */ }
  // The old 'ashcol-theme' key was written on every load (so it froze whatever the device
  // happened to be on), which makes it useless as a user choice — default everyone to Auto.
  return 'auto'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readMode)
  const [systemMode, setSystemMode] = useState<Theme>(systemTheme)

  const theme: Theme = themeMode === 'auto' ? systemMode : themeMode

  // Apply immediately on first render (before paint) to avoid flash
  applyTheme(theme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Follow the device's light/dark setting live (also when the app is reopened after it changed).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSystemMode(mq.matches ? 'dark' : 'light')
    sync()
    mq.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      mq.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode)
    try { localStorage.setItem(MODE_KEY, mode) } catch { /* ignore */ }
  }

  // Quick light/dark flip for the small toggle buttons — pins an explicit choice.
  const toggleTheme = () => setThemeMode(theme === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
