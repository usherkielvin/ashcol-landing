import { useState, useEffect, useRef } from 'react'
import { getActivePortalBranchId, isCoordinatorOrOicUser, isPortalAdmin } from '../utils/api'
import {
  type Ticket,
  normalizeRelayScheduleTicketList,
  preserveLocalScheduleFields,
  resolveInitialScheduleDate,
} from '../utils/ticketHelpers'
import {
  getInitialSchedulesFromCache,
  TAB_CACHE_UPDATED,
} from '../utils/ticketTabCache'

export function useTicketsData(pathname: string, user: any) {
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )

  useEffect(() => {
    const sync = () => setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    window.addEventListener('ashcol-global-branch-change', sync)
    return () => window.removeEventListener('ashcol-global-branch-change', sync)
  }, [])

  const role = (user?.role || '').toLowerCase()
  const isAdmin = isPortalAdmin(role)

  const activeBranchId = (() => {
    if (isAdmin || isCoordinatorOrOicUser(user)) {
      if (globalBranchId && globalBranchId !== 'ALL_BRANCHES') return globalBranchId
      if (isAdmin) {
        const fromSidebar = getActivePortalBranchId(user)
        if (fromSidebar && fromSidebar !== 'ALL_BRANCHES') return fromSidebar
      }
    }
    return user?.branchId || ''
  })()

  const initialSchedulesRef = useRef<ReturnType<typeof getInitialSchedulesFromCache> | null>(null)
  if (!initialSchedulesRef.current) {
    const dateKey = resolveInitialScheduleDate(pathname)
    initialSchedulesRef.current = getInitialSchedulesFromCache(pathname, dateKey || undefined)
  }
  const initialSchedules = initialSchedulesRef.current
  const initialSchedulesReady = initialSchedules.hasCache || initialSchedules.sessionLoaded

  const [tickets, setTickets] = useState<Ticket[]>(() =>
    initialSchedules.hasCache
      ? normalizeRelayScheduleTicketList(initialSchedules.tickets as Ticket[])
      : [],
  )
  const ticketsRef = useRef<Ticket[]>(tickets)
  ticketsRef.current = tickets

  const [loading, setLoading] = useState(() => !initialSchedulesReady)
  const [syncing, setSyncing] = useState(false)
  const [backgroundSyncing, setBackgroundSyncing] = useState(false)
  const [hasHydratedOnce, setHasHydratedOnce] = useState(() => initialSchedulesReady)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    const handleTabCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent
      const updatedTicket = customEvent.detail?.ticket
      if (!updatedTicket?.id) return

      setTickets(prev => {
        if (!prev.some(t => t.id === updatedTicket.id)) return prev
        return prev.map(t => (
          t.id === updatedTicket.id
            ? preserveLocalScheduleFields(t, updatedTicket as Ticket)
            : t
        ))
      })
    }
    window.addEventListener(TAB_CACHE_UPDATED, handleTabCacheUpdate)
    return () => window.removeEventListener(TAB_CACHE_UPDATED, handleTabCacheUpdate)
  }, [])

  return {
    tickets,
    setTickets,
    ticketsRef,
    loading,
    setLoading,
    syncing,
    setSyncing,
    backgroundSyncing,
    setBackgroundSyncing,
    hasHydratedOnce,
    setHasHydratedOnce,
    fetchError,
    setFetchError,
    activeBranchId,
    isAdmin,
  }
}
