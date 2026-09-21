import React, { lazy } from 'react'

export type PreloadableComponent<T extends React.ComponentType<any>> = React.LazyExoticComponent<T> & {
  preload: () => Promise<{ default: T }>
}

/**
 * Creates a lazy-loaded component that can be preloaded on idle or hover.
 * Caches the load promise so subsequent renders and preloads are instant without re-fetching.
 */
export function lazyWithPreload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  let loadedPromise: Promise<{ default: T }> | null = null

  const load = () => {
    if (!loadedPromise) {
      loadedPromise = factory()
    }
    return loadedPromise
  }

  const Component = lazy(load) as PreloadableComponent<T>
  Component.preload = load
  return Component
}

// Registry of preloadable page factories
export const portalPagePreloaders = {
  relays: () => import('../pages/Relays'),
  myTickets: () => import('../pages/MyTickets'),
  schedules: () => import('../pages/Schedules'),
  bookings: () => import('../pages/Bookings'),
  cashAdvances: () => import('../pages/CashAdvances'),
  payroll: () => import('../pages/Payroll'),
  lineUp: () => import('../pages/LineUp'),
  dailyAuditReport: () => import('../pages/DailyAuditReport'),
  employees: () => import('../pages/Employees'),
  hris: () => import('../pages/Hris'),
  ddrm: () => import('../pages/Ddrm'),
  forCollections: () => import('../pages/ForCollections'),
  commissions: () => import('../pages/Commissions'),
  bills: () => import('../pages/Bills'),
  telecom: () => import('../pages/Telecom'),
  operationsForms: () => import('../pages/OperationsForms'),
  messages: () => import('../pages/Messages'),
  branches: () => import('../pages/Branches'),
  vehicles: () => import('../pages/Vehicles'),
  profile: () => import('../pages/Profile'),
  searchTickets: () => import('../pages/SearchTickets'),
}

/**
 * Preload high-priority portal pages in background during browser idle time
 */
export function warmUpPortalRoutes() {
  if (typeof window === 'undefined') return

  const warmUp = () => {
    try {
      portalPagePreloaders.relays()
      portalPagePreloaders.cashAdvances()
      portalPagePreloaders.payroll()
      portalPagePreloaders.myTickets()
      portalPagePreloaders.lineUp()
      portalPagePreloaders.dailyAuditReport()
      portalPagePreloaders.employees()
      portalPagePreloaders.hris()
    } catch {
      // Ignore background preload errors
    }
  }

  if ('requestIdleCallback' in window) {
    ;(window as any).requestIdleCallback(warmUp, { timeout: 2000 })
  } else {
    setTimeout(warmUp, 500)
  }
}

/**
 * Preload a specific route on hover or focus
 */
export function preloadPath(path: string) {
  if (!path) return
  const clean = path.split('?')[0].toLowerCase()
  try {
    switch (clean) {
      case '/relays': portalPagePreloaders.relays(); break
      case '/cash-advances': portalPagePreloaders.cashAdvances(); break
      case '/payroll': portalPagePreloaders.payroll(); break
      case '/my-tickets': portalPagePreloaders.myTickets(); break
      case '/lineup': portalPagePreloaders.lineUp(); break
      case '/audit-report': portalPagePreloaders.dailyAuditReport(); break
      case '/audit-expenses': portalPagePreloaders.dailyAuditReport(); break
      case '/employees': portalPagePreloaders.employees(); break
      case '/admin-hris': portalPagePreloaders.hris(); break
      case '/ddrm': portalPagePreloaders.ddrm(); break
      case '/collections': portalPagePreloaders.forCollections(); break
      case '/commissions': portalPagePreloaders.commissions(); break
      case '/admin-bills': portalPagePreloaders.bills(); break
      case '/admin-telecom': portalPagePreloaders.telecom(); break
      case '/operations-forms': portalPagePreloaders.operationsForms(); break
      case '/bookings': portalPagePreloaders.bookings(); break
      case '/schedules': portalPagePreloaders.schedules(); break
      case '/messages': portalPagePreloaders.messages(); break
      case '/branches': portalPagePreloaders.branches(); break
      case '/vehicles': portalPagePreloaders.vehicles(); break
      case '/profile': portalPagePreloaders.profile(); break
      case '/search': portalPagePreloaders.searchTickets(); break
    }
  } catch {
    // Ignore errors during prefetch
  }
}
