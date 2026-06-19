import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Sparkles, X, ArrowUpCircle } from 'lucide-react'

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

export default function AutoUpdateWatcher() {
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
    // Add a short delay to display the premium reload screen smoothly before refreshing
    setTimeout(() => {
      window.location.reload()
    }, 1500)
  }

  // Reloading Transition Screen
  if (isReloading) {
    return (
      <div 
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center backdrop-blur-md transition-all duration-500"
        style={{ backgroundColor: 'rgba(6, 11, 24, 0.9)' }}
      >
        <div className="flex flex-col items-center gap-4 max-w-sm p-6 text-center animate-fade-in">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
            <div className="relative h-16 w-16 rounded-full border border-emerald-500/30 flex items-center justify-center bg-slate-900/50">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          </div>
          
          <div className="flex flex-col gap-1 mt-2">
            <h3 className="text-white text-lg font-black tracking-tight">Updating Portal</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Applying the latest features, bug fixes, and security patches. This will only take a moment.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Update Notification Banner/Toast
  if (updateAvailable && !dismissed) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-[9998] max-w-sm w-[calc(100vw-32px)] sm:w-96 rounded-2xl p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] border border-emerald-500/20 glass animate-slide-in no-print"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.03) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Sparkles className="w-4 h-4 text-white animate-pulse" />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                Portal Update Ready
              </h4>
              <button 
                onClick={() => setDismissed(true)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-500/10"
                aria-label="Dismiss update notification"
              >
                <X size={15} />
              </button>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              A new version is available with performance improvements. Reload to apply.
            </p>
            
            <div className="flex items-center gap-2.5 mt-3.5">
              <button
                onClick={handleReload}
                className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                }}
              >
                <ArrowUpCircle size={14} />
                Update Now
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="py-1.5 px-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 transition-colors bg-slate-500/5 hover:bg-slate-500/10"
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
