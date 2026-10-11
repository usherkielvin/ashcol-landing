import type { NavigateFunction } from 'react-router-dom'

/**
 * Hosts where the marketing site should link to the portal on the same origin
 * (Vite dev, preview, or LAN IP) instead of production portal.ashcol.com.ph.
 */
export function isLocalOrLanPortalHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

/**
 * Login / signup links from the landing page.
 * - Dev or LAN: same host (e.g. http://192.168.1.5:5173/login?portal=true)
 * - Production: portal subdomain
 */
export function getPortalUrl(path: string): string {
  if (import.meta.env.DEV || isLocalOrLanPortalHost(window.location.hostname)) {
    return `${path}?portal=true`
  }
  return `https://portal.ashcol.com.ph${path}`
}

/** SPA navigation for same-origin portal URLs; full redirect when getPortalUrl returns absolute https. */
export function navigateToPortal(navigate: NavigateFunction, path: string) {
  const url = getPortalUrl(path)
  if (/^https?:\/\//i.test(url)) {
    window.location.assign(url)
  } else {
    navigate(url)
  }
}
