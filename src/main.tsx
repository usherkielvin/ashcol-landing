import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './utils/webPush'
import { installKeyboardSafeViewport } from './utils/keyboardSafeViewport'

installKeyboardSafeViewport()

// Register early so an existing push subscription can be detected on load (see Profile.tsx's
// Notifications tab) — this alone does not prompt for permission or subscribe to anything.
void registerServiceWorker()

// Centralized QuotaExceededError interceptor for Storage.
// Pruned in tiers, least-destructive first — all of these are recomputable from the server,
// so clearing them just costs a re-fetch, never data loss. Per-ticket lookup keys
// ("ashcol-ticket:", "ashcol-schedule-date-index:") are written one-per-ticket-number/date with
// no cap or TTL (see ticketNumberStore.ts), so months of use silently accumulates thousands of
// them — that's usually what actually exhausts the quota, not the handful of "ashcol-cache:" list
// caches this used to prune alone, which is why pruning only those often still left saves failing.
const PRUNE_TIERS = ['ashcol-cache:', 'ashcol-ticket:', 'ashcol-schedule-date-index:']
const originalSetItem = Storage.prototype.setItem
Storage.prototype.setItem = function (key, value) {
  try {
    originalSetItem.call(this, key, value)
  } catch (err: any) {
    const isQuotaError =
      err instanceof DOMException && (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014
      )
    const errStr = String(err).toLowerCase()
    if (this === localStorage && (isQuotaError || errStr.includes('quota') || errStr.includes('exceeded'))) {
      for (const prefix of PRUNE_TIERS) {
        console.warn(`Storage quota exceeded! Pruning ${prefix}* keys from localStorage...`)
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i)
          if (k && k.startsWith(prefix)) {
            localStorage.removeItem(k)
          }
        }
        try {
          originalSetItem.call(this, key, value)
          return
        } catch {
          // Still exceeded — prune the next tier before giving up.
        }
      }
      console.error('Storage pruning failed or space still exceeded after clearing all known cache prefixes.')
    }
    throw err
  }
}

// Global fetch interceptor to handle session expiration (401/403)
const originalFetch = window.fetch
window.fetch = async (...args) => {
  const url = typeof args[0] === 'string' ? args[0] :
              (args[0] instanceof Request ? args[0].url : 
               (args[0] instanceof URL ? args[0].href : String(args[0])));

  // Only check and intercept for non-auth requests
  if (!url.includes('/auth/')) {
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
    if (token) {
      // Decode JWT token and check expiration client-side before sending
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          if (payload && typeof payload.exp === 'number') {
            const currentSec = Math.floor(Date.now() / 1000)
            if (payload.exp < currentSec) {
              localStorage.removeItem('ashcol-token')
              sessionStorage.removeItem('ashcol-token')
              localStorage.removeItem('ashcol-user')
              sessionStorage.removeItem('ashcol-user')
              const pathname = window.location.pathname
              if (pathname !== '/login' && pathname !== '/forgot-password' && pathname !== '/create-account' && pathname !== '/') {
                window.location.href = '/login?expired=true'
              }
              return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Session expired' }), {
                status: 401,
                statusText: 'Unauthorized',
                headers: { 'Content-Type': 'application/json' }
              })
            }
          }
        }
      } catch (e) {
        // ignore malformed token parsing issues
      }
    }
  }

  const response = await originalFetch(...args)
  if (response.status === 401) {
    const isApiUrl = typeof url === 'string' && (url.includes(':8080') || url.includes('/api/'))
    const hasToken = Boolean(localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token'))
    if (isApiUrl && hasToken && !url.includes('/auth/')) {
      localStorage.removeItem('ashcol-token')
      sessionStorage.removeItem('ashcol-token')
      localStorage.removeItem('ashcol-user')
      sessionStorage.removeItem('ashcol-user')
      const pathname = window.location.pathname
      if (pathname !== '/login' && pathname !== '/forgot-password' && pathname !== '/create-account' && pathname !== '/') {
        window.location.href = '/login?expired=true'
      }
    }
  }
  return response
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
