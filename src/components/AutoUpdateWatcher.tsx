import { useState, useEffect, useRef } from 'react'
import { ArrowUpCircle, X, RotateCw } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

// Helper to get loaded asset URLs (js/css) from the current document DOM
const getAssetUrls = (): string[] => {
  const assets: string[] = []

  // Get CSS files
  document.querySelectorAll('link[href]').forEach(el => {
    const href = el.getAttribute('href')
    if (href && (href.includes('/assets/') || href.endsWith('.css'))) {
      assets.push(href)
    }
  })

  // Get JS module files
  document.querySelectorAll('script[src]').forEach(el => {
    const src = el.getAttribute('src')
    if (src && (src.includes('/assets/') || src.endsWith('.js') || src.endsWith('.tsx'))) {
      assets.push(src)
    }
  })

  return assets.sort()
}

/**
 * Custom Aircon Split-Unit Icon (Clean HVAC design, no AI elements)
 */
function AirconIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Aircon Main Body */}
      <rect x="2" y="4" width="20" height="9" rx="2" />
      {/* Vents / Flap */}
      <line x1="5" y1="10" x2="19" y2="10" />
      {/* Status LED / Display */}
      <circle cx="18" cy="7" r="0.75" fill="currentColor" stroke="none" />
      {/* Cooling Airflow Breeze */}
      <path d="M6 16c1 1.5 2 2 3 2s2-1 3-1 2 1 3 1" strokeWidth="1.5" />
      <path d="M8 20c1 1 2 1.5 3 1.5s2-.8 3-.8" strokeWidth="1.5" opacity="0.7" />
    </svg>
  )
}

/**
 * Animated Air Conditioner Loading Screen
 */
function AirconLoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center backdrop-blur-xl transition-all duration-500 select-none"
      style={{ backgroundColor: 'rgba(6, 11, 24, 0.92)' }}
    >
      <div className="flex flex-col items-center gap-6 max-w-md p-8 text-center animate-fade-in relative">
        {/* Glow ambient background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none animate-pulse" />

        {/* Animated AC Unit Graphic */}
        <div className="relative flex flex-col items-center">
          {/* Split Unit AC Chassis */}
          <div className="relative w-56 h-20 rounded-2xl bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 border border-slate-700/80 shadow-2xl flex flex-col justify-between p-2.5 overflow-hidden">
            {/* Top Vent Grille */}
            <div className="flex justify-between items-center px-2 py-0.5 border-b border-slate-800/80">
              <div className="flex gap-1">
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span className="w-1 h-1 rounded-full bg-slate-600" />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">ASHCOL INVERTER</span>
              {/* Power / Temp LED */}
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-ping" />
                <span className="text-[9px] font-mono font-black text-emerald-400">16°C</span>
              </div>
            </div>

            {/* Middle decorative panel line */}
            <div className="w-full flex items-center justify-center">
              <div className="w-16 h-0.5 rounded-full bg-emerald-500/30 animate-pulse" />
            </div>

            {/* Bottom Air Louver / Flap with glow */}
            <div className="relative w-full h-3 rounded-b-xl bg-slate-800/90 border-t border-slate-700/50 flex items-center justify-center overflow-hidden">
              <div className="w-full h-full bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent animate-pulse" />
            </div>
          </div>

          {/* Animated Cool Air Currents / Breeze Lines */}
          <div className="flex justify-center items-start gap-4 mt-1 h-16 w-48 relative overflow-hidden">
            {/* Left Breeze Wave */}
            <div className="flex flex-col items-center animate-bounce" style={{ animationDuration: '1.8s' }}>
              <svg width="24" height="48" viewBox="0 0 24 48" fill="none" className="text-cyan-400/80">
                <path
                  d="M12 2 C8 10, 16 18, 12 26 C8 34, 16 42, 12 48"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="4 4"
                  className="animate-pulse"
                />
              </svg>
            </div>

            {/* Center Breeze Wave (Fast / Stronger) */}
            <div className="flex flex-col items-center animate-bounce" style={{ animationDuration: '1.4s', animationDelay: '0.2s' }}>
              <svg width="28" height="56" viewBox="0 0 28 56" fill="none" className="text-emerald-400">
                <path
                  d="M14 2 C8 12, 20 22, 14 32 C8 42, 20 50, 14 56"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="6 4"
                />
              </svg>
            </div>

            {/* Right Breeze Wave */}
            <div className="flex flex-col items-center animate-bounce" style={{ animationDuration: '1.9s', animationDelay: '0.4s' }}>
              <svg width="24" height="48" viewBox="0 0 24 48" fill="none" className="text-teal-400/80">
                <path
                  d="M12 2 C16 10, 8 18, 12 26 C16 34, 8 42, 12 48"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="4 4"
                  className="animate-pulse"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Text & Status */}
        <div className="flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
            <RotateCw className="w-3 h-3 animate-spin" />
            Applying Portal Update
          </div>
          <h3 className="text-white text-lg font-black tracking-tight mt-1">
            Refreshing System
          </h3>
          <p className="text-slate-400 text-xs max-w-xs leading-relaxed">
            Applying the latest performance optimizations and updates. Please wait a moment…
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AutoUpdateWatcher() {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Store initial assets loaded on mount
  const initialAssets = useRef<string[]>([])

  useEffect(() => {
    // Only capture initial assets once on mount
    initialAssets.current = getAssetUrls()

    // In local development, we don't need to poll or reload
    if (import.meta.env.DEV) {
      console.log('[AutoUpdateWatcher] Running in DEV mode. Asset tracking is initialized but polling is disabled.')
      return
    }

    const checkUpdate = async () => {
      if (dismissed || updateAvailable) return

      try {
        // Fetch index.html with cache buster to bypass caching
        const res = await fetch(`/?_cb=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        })

        if (!res.ok) return
        const html = await res.text()

        // Parse fetched html
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        const fetchedAssets: string[] = []
        doc.querySelectorAll('link[href]').forEach(el => {
          const href = el.getAttribute('href')
          if (href && (href.includes('/assets/') || href.endsWith('.css'))) {
            fetchedAssets.push(href)
          }
        })
        doc.querySelectorAll('script[src]').forEach(el => {
          const src = el.getAttribute('src')
          if (src && (src.includes('/assets/') || src.endsWith('.js') || src.endsWith('.tsx'))) {
            fetchedAssets.push(src)
          }
        })
        fetchedAssets.sort()

        // If list of assets is empty (unexpected), don't trigger update
        if (fetchedAssets.length === 0) return

        // Compare assets lists
        let hasChanges = false
        if (initialAssets.current.length !== fetchedAssets.length) {
          hasChanges = true
        } else {
          for (let i = 0; i < initialAssets.current.length; i++) {
            if (initialAssets.current[i] !== fetchedAssets[i]) {
              hasChanges = true
              break
            }
          }
        }

        if (hasChanges) {
          console.log('[AutoUpdateWatcher] New bundle detected in production!')
          setUpdateAvailable(true)
        }
      } catch (err) {
        console.error('[AutoUpdateWatcher] Error checking for updates:', err)
      }
    }

    // Check on tab focus/return
    const handleFocus = () => {
      checkUpdate()
    }
    window.addEventListener('focus', handleFocus)

    // Poll every 3 minutes
    const interval = setInterval(checkUpdate, 3 * 60 * 1000)

    // Initial check after 30 seconds
    const initialTimeout = setTimeout(checkUpdate, 30000)

    return () => {
      window.removeEventListener('focus', handleFocus)
      clearInterval(interval)
      clearTimeout(initialTimeout)
    }
  }, [dismissed, updateAvailable])

  const handleReload = () => {
    setIsReloading(true)
    // Display the custom aircon loading screen before refreshing
    setTimeout(() => {
      window.location.reload()
    }, 1800)
  }

  // Reloading Transition Screen (Animated Aircon Cooling)
  if (isReloading) {
    return <AirconLoadingScreen />
  }

  // Update Notification Banner/Toast (Clean UI without AI sparkles)
  if (updateAvailable && !dismissed) {
    return (
      <div
        className="fixed bottom-5 right-5 z-[9998] max-w-sm w-[calc(100vw-32px)] sm:w-[380px] rounded-2xl p-4.5 shadow-2xl border transition-all animate-slide-in no-print"
        style={{
          backgroundColor: isLight ? '#ffffff' : '#0B1322',
          borderColor: isLight ? '#E2E8F0' : '#1E293B',
          boxShadow: isLight
            ? '0 20px 40px -15px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(16, 185, 129, 0.2)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(16, 185, 129, 0.25)',
        }}
      >
        <div className="flex items-start gap-3.5">
          {/* Clean AC Unit / Update Icon (No AI sparkles) */}
          <div className="shrink-0 mt-0.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-xs transition-transform hover:scale-105"
              style={{
                backgroundColor: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.15)',
                borderColor: isLight ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.35)',
                color: '#10B981',
              }}
            >
              <AirconIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Header with Title and Dismiss */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h4 className="text-sm font-extrabold tracking-tight" style={{ color: isLight ? '#0F172A' : '#F8FAFC' }}>
                  Portal Update Ready
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="p-1 rounded-lg transition-colors hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Dismiss update notification"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body Description */}
            <p className="text-xs mt-1 leading-relaxed" style={{ color: isLight ? '#64748B' : '#94A3B8' }}>
              A new version is available with performance improvements and updates. Reload to apply.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-3.5">
              <button
                type="button"
                onClick={handleReload}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all transform hover:opacity-95 active:scale-[0.98] flex items-center justify-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                }}
              >
                <ArrowUpCircle size={14} />
                <span>Update Now</span>
              </button>

              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="py-2 px-3.5 rounded-xl text-xs font-semibold transition-colors border"
                style={{
                  backgroundColor: isLight ? '#F1F5F9' : '#1E293B',
                  borderColor: isLight ? '#E2E8F0' : '#334155',
                  color: isLight ? '#475569' : '#CBD5E1',
                }}
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
