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

  // Polling closures below are set up once (empty dep array) and live for the whole session, so
  // they read these via refs rather than capturing stale `dismissed`/`updateAvailable` values —
  // putting those in the effect's dependency array used to make the effect re-run on every popup
  // show/dismiss, which re-captured the baseline below from the live DOM at that later point in
  // the session (see initialAssets comment) and caused permanent false-positive "update available"
  // popups with nothing actually deployed.
  const dismissedRef = useRef(dismissed)
  const updateAvailableRef = useRef(updateAvailable)
  useEffect(() => { dismissedRef.current = dismissed }, [dismissed])
  useEffect(() => { updateAvailableRef.current = updateAvailable }, [updateAvailable])

  // Baseline asset list this session started with. Fetched from the server the same way every
  // later check is (NOT read off the live DOM): as the SPA lazy-loads routes, Vite injects extra
  // <link modulepreload>/<script> tags into the page for each chunk visited, so a DOM-read
  // baseline keeps growing over a session while the server's index.html never does — guaranteeing
  // a mismatch (and the popup) sooner or later even without a real deploy.
  const initialAssets = useRef<string[]>([])

  useEffect(() => {
    const fetchServerAssets = async (): Promise<string[] | null> => {
      try {
        // Cache-busted fetch so a stale service-worker/browser cache doesn't hide a real update.
        const res = await fetch(`/?_cb=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        })
        if (!res.ok) return null
        const html = await res.text()
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const assets: string[] = []
        doc.querySelectorAll('link[href]').forEach(el => {
          const href = el.getAttribute('href')
          if (href && (href.includes('/assets/') || href.endsWith('.css'))) assets.push(href)
        })
        doc.querySelectorAll('script[src]').forEach(el => {
          const src = el.getAttribute('src')
          if (src && (src.includes('/assets/') || src.endsWith('.js') || src.endsWith('.tsx'))) assets.push(src)
        })
        return assets.sort()
      } catch (err) {
        console.error('[AutoUpdateWatcher] Error fetching index.html:', err)
        return null
      }
    }

    // In local development, we don't need to poll or reload
    if (import.meta.env.DEV) {
      console.log('[AutoUpdateWatcher] Running in DEV mode. Update polling is disabled.')
      return
    }

    const checkUpdate = async () => {
      if (dismissedRef.current || updateAvailableRef.current) return
      const fetchedAssets = await fetchServerAssets()
      // If list of assets is empty (unexpected), don't trigger update
      if (!fetchedAssets || fetchedAssets.length === 0) return

      const baseline = initialAssets.current
      const hasChanges = baseline.length !== fetchedAssets.length
        || baseline.some((asset, i) => asset !== fetchedAssets[i])

      if (hasChanges) {
        console.log('[AutoUpdateWatcher] New bundle detected in production!')
        setUpdateAvailable(true)
      }
    }

    // Establish the baseline from the server; fall back to the live DOM only if that fetch fails.
    void (async () => {
      const serverBaseline = await fetchServerAssets()
      initialAssets.current = serverBaseline && serverBaseline.length > 0 ? serverBaseline : getAssetUrls()
    })()

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
  }, [])

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

  // Update Notification Toast — Glassmorphism redesign
  if (updateAvailable && !dismissed) {
    return (
      <div
        className="fixed bottom-6 right-6 z-[9998] w-[calc(100vw-32px)] sm:w-[420px] rounded-3xl animate-slide-in no-print overflow-hidden"
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: isLight
            ? 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(241,245,249,0.88) 100%)'
            : 'linear-gradient(135deg, rgba(15,26,46,0.90) 0%, rgba(11,19,34,0.92) 100%)',
          border: `1px solid ${isLight ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.2)'}`,
          boxShadow: isLight
            ? '0 32px 64px -16px rgba(0,0,0,0.15), 0 0 0 1px rgba(16,185,129,0.18), inset 0 1px 0 rgba(255,255,255,0.8)'
            : '0 32px 64px -16px rgba(0,0,0,0.7), 0 0 0 1px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Ambient emerald glow strip at the top */}
        <div
          className="h-0.5 w-full"
          style={{ background: 'linear-gradient(90deg, transparent 0%, #10B981 40%, #059669 60%, transparent 100%)' }}
        />

        <div className="p-6">
          {/* Top row: Icon + dismiss */}
          <div className="flex items-start justify-between gap-4 mb-5">
            {/* Icon block */}
            <div className="flex items-center gap-4">
              {/* Glowing AC icon */}
              <div className="relative shrink-0">
                {/* Outer glow ring */}
                <div
                  className="absolute inset-0 rounded-2xl animate-pulse"
                  style={{ background: 'rgba(16,185,129,0.18)', filter: 'blur(8px)', transform: 'scale(1.3)' }}
                />
                <div
                  className="relative w-14 h-14 rounded-2xl flex items-center justify-center border"
                  style={{
                    background: isLight
                      ? 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.1) 100%)'
                      : 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.15) 100%)',
                    borderColor: 'rgba(16,185,129,0.35)',
                    color: '#10B981',
                    boxShadow: '0 4px 16px rgba(16,185,129,0.2)',
                  }}
                >
                  <AirconIcon className="w-7 h-7" />
                </div>
              </div>

              {/* Title block */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <span
                    className="text-[10px] font-black uppercase tracking-widest"
                    style={{ color: '#10B981' }}
                  >
                    Update Available
                  </span>
                </div>
                <h4
                  className="text-base font-extrabold tracking-tight leading-tight"
                  style={{ color: isLight ? '#0F172A' : '#F8FAFC' }}
                >
                  Portal Update Ready
                </h4>
              </div>
            </div>

            {/* Dismiss button */}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="shrink-0 p-2 rounded-xl transition-colors hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Dismiss update notification"
            >
              <X size={16} />
            </button>
          </div>

          {/* Description */}
          <p
            className="text-sm leading-relaxed mb-6"
            style={{ color: isLight ? '#475569' : '#94A3B8' }}
          >
            A new version is available with performance improvements and updates.{' '}
            <span style={{ color: isLight ? '#0F172A' : '#CBD5E1', fontWeight: 600 }}>
              Reload to apply.
            </span>
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReload}
              className="flex-1 py-3 px-5 rounded-2xl text-sm font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                boxShadow: '0 8px 24px -4px rgba(16,185,129,0.45)',
              }}
            >
              <ArrowUpCircle size={16} />
              <span>Update Now</span>
            </button>

            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="py-3 px-5 rounded-2xl text-sm font-semibold transition-all hover:opacity-80 border"
              style={{
                backgroundColor: isLight ? 'rgba(241,245,249,0.8)' : 'rgba(30,41,59,0.6)',
                borderColor: isLight ? '#E2E8F0' : '#334155',
                color: isLight ? '#475569' : '#94A3B8',
              }}
            >
              Later
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
