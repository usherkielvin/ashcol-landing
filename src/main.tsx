import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
    if (!url.includes('/auth/')) {
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
