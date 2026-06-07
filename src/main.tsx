import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global fetch interceptor to handle session expiration (401/403)
const originalFetch = window.fetch
window.fetch = async (...args) => {
  const response = await originalFetch(...args)
  if (response.status === 401 || response.status === 403) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url
    // Only intercept API calls, avoiding login/auth endpoints to prevent loops
    if (url.includes('/api/') && !url.includes('/auth/')) {
      try {
        const clone = response.clone()
        const text = await clone.text()
        let isAuthError = true
        try {
          const json = JSON.parse(text)
          if (json && json.error && json.error !== 'Forbidden' && json.error !== 'Unauthorized') {
            isAuthError = false
          }
          if (json && json.message === 'Access Denied') {
            isAuthError = false
          }
        } catch {
          if (text.trim().length > 0) {
            isAuthError = false
          }
        }
        if (isAuthError) {
          localStorage.removeItem('ashcol-token')
          sessionStorage.removeItem('ashcol-token')
          localStorage.removeItem('ashcol-user')
          sessionStorage.removeItem('ashcol-user')
          window.location.href = '/login?expired=true'
        }
      } catch (e) {
        console.error('Fetch interceptor error', e)
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
