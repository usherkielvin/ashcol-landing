import { useCallback, useMemo } from 'react'
import type { Employee, User } from '../types'
import {
  appendCurrentNegotiator,
  branchScopesMatch,
  isAccountActive,
  isNegotiatorCandidate,
  resolvePortalWriteBranchId,
  resolveScopedBranchId,
  resolveTicketScheduleBranchId,
} from '../../../utils/api'
import {
  buildBranchRoster,
  employeeMatchesBranchScope,
  isCoordinatorEmployee,
  isInstallerEmployee,
} from '../../../utils/branchRoster'
import {
  formatInstallerLabel,
  getBranchDisplayName,
} from '../../../utils/ticketDisplay'
import type { Ticket } from '../../../utils/ticketHelpers'

export interface BranchRoster {
  drivers: string[]
  installers: string[]
}

export interface UseBranchRostersOptions {
  branchEmployees: Employee[]
  branchRosters: Record<string, BranchRoster>
  driverOnlyNames: Set<string>
  activeBranchId: string | null
  user: User | null
}

export function useBranchRosters({
  branchEmployees,
  branchRosters,
  driverOnlyNames,
  activeBranchId,
  user,
}: UseBranchRostersOptions) {
  const resolveSchedulesNegotiatorBranch = useCallback((overrideBranchId?: string | null): string | null => {
    const scoped = (overrideBranchId || '').trim()
    if (scoped && scoped !== 'ALL' && scoped !== 'ALL_BRANCHES') {
      return resolvePortalWriteBranchId(scoped, user?.email, user?.jobTitle) || scoped
    }
    const raw = (user?.branchId || '').trim()
    if (!raw || raw === 'ALL_BRANCHES' || raw === 'ALL') {
      return resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle) || user?.branchId || null
    }
    return resolvePortalWriteBranchId(raw, user?.email, user?.jobTitle) || raw
  }, [user?.branchId, user?.email, user?.jobTitle])

  const currentNegotiatorOption = useMemo<Partial<Employee> | null>(() => {
    if (!user?.id) return null
    const matched = branchEmployees.find(e => e.id === user.id)
    if (matched) {
      return {
        id: matched.id,
        name: matched.name,
        branchId: matched.branchId,
        email: matched.email,
        role: matched.role,
        jobTitle: matched.jobTitle,
        isActive: matched.isActive,
      }
    }
    return {
      id: user.id,
      name: user.name,
      branchId: user.branchId || undefined,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle || undefined,
      isActive: true,
    }
  }, [user, branchEmployees])

  const negotiatorsForBranch = useCallback((branchId?: string | null) => {
    const filterBranch =
      resolveSchedulesNegotiatorBranch(branchId)
      || resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle)
      || user?.branchId
      || null
    const isAll = !branchId || branchId === 'ALL' || branchId === 'ALL_BRANCHES'
    const matched = branchEmployees
      .filter(isAccountActive)
      .filter(isNegotiatorCandidate)
      .filter(isCoordinatorEmployee)
      .filter(u => {
        if (isAll) return true
        const bid = (u.branchId || '').trim()
        if (!bid || bid.toUpperCase() === 'ALL' || bid.toUpperCase() === 'ALL_BRANCHES') return false
        return branchScopesMatch(bid, filterBranch, u.email)
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    if (
      currentNegotiatorOption
      && currentNegotiatorOption.id
      && currentNegotiatorOption.branchId
      && (isAll || branchScopesMatch(currentNegotiatorOption.branchId, filterBranch, currentNegotiatorOption.email))
    ) {
      return appendCurrentNegotiator(matched, currentNegotiatorOption as Employee)
    }
    return matched
  }, [branchEmployees, currentNegotiatorOption, resolveSchedulesNegotiatorBranch, user?.branchId, user?.email, user?.jobTitle])

  const activeBranchLabel = useMemo(
    () => getBranchDisplayName(resolveSchedulesNegotiatorBranch(activeBranchId) || activeBranchId),
    [activeBranchId, resolveSchedulesNegotiatorBranch],
  )

  const rosterForBranch = useCallback((branchId?: string | null): BranchRoster => {
    const key = (branchId || '').trim()
    if (!key) return { drivers: [], installers: [] }
    if (branchRosters[key]) return branchRosters[key]
    const scoped = resolveScopedBranchId(key)
    if (scoped && branchRosters[scoped]) return branchRosters[scoped]
    return buildBranchRoster(branchEmployees, key)
  }, [branchRosters, branchEmployees])

  const rosterForTicket = useCallback((ticket: Ticket): BranchRoster => {
    const branchId = resolveTicketScheduleBranchId(ticket, undefined, Array.from(driverOnlyNames))
      || activeBranchId
      || user?.branchId
      || null
    return rosterForBranch(branchId)
  }, [rosterForBranch, driverOnlyNames, activeBranchId, user?.branchId])

  const activeBranchRoster = useMemo(
    () => rosterForBranch(activeBranchId || user?.branchId),
    [rosterForBranch, activeBranchId, user?.branchId],
  )

  const techniciansForBranch = useCallback((branchId?: string | null) => {
    const filterBranch =
      resolveSchedulesNegotiatorBranch(branchId)
      || resolvePortalWriteBranchId(user?.branchId, user?.email, user?.jobTitle)
      || user?.branchId
      || null
    return branchEmployees
      .filter(isAccountActive)
      .filter(emp => isInstallerEmployee(emp))
      .filter(emp => {
        if (!filterBranch || filterBranch === 'ALL_BRANCHES') return true
        return (
          employeeMatchesBranchScope(emp, filterBranch) ||
          branchScopesMatch(emp.branchId, filterBranch, emp.email)
        )
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(emp => {
        const label = formatInstallerLabel(emp)
        const nick = (emp.nickname || '').trim().toUpperCase()
        const fullName = (emp.name || '').trim()
        const firstName = fullName.split(/\s+/)[0]?.toUpperCase() || ''
        const name = nick || firstName || fullName
        return { id: emp.id, name, label, branchId: emp.branchId }
      })
      .filter(t => t.name)
  }, [branchEmployees, resolveSchedulesNegotiatorBranch, user?.branchId, user?.email, user?.jobTitle])

  const addModalNegotiators = useMemo(
    () => negotiatorsForBranch(activeBranchId),
    [negotiatorsForBranch, activeBranchId],
  )

  const myTicketsNegotiatorOptions = useMemo(
    () => negotiatorsForBranch(activeBranchId),
    [negotiatorsForBranch, activeBranchId],
  )

  const addModalTechnicians = useMemo(
    () => techniciansForBranch(activeBranchId),
    [techniciansForBranch, activeBranchId],
  )

  return {
    currentNegotiatorOption,
    negotiatorsForBranch,
    activeBranchLabel,
    rosterForBranch,
    rosterForTicket,
    activeBranchRoster,
    techniciansForBranch,
    addModalNegotiators,
    myTicketsNegotiatorOptions,
    addModalTechnicians,
  }
}
