type PortalUserLike = {
  role?: string | null
  branchId?: string | null
  jobTitle?: string | null
}

const norm = (value?: string | null) => (value || '').trim().toLowerCase()

export function isCoordinatorOrOicUser(user?: PortalUserLike | null) {
  if (!user) return false
  const role = norm(user.role)
  const jobTitle = norm(user.jobTitle)
  return role === 'oic'
    || jobTitle.includes('coor')
    || jobTitle.includes('coordinator')
    || jobTitle.includes('office in charge')
    || jobTitle === 'oic'
}

export function isSalesWorkspaceUser(user?: PortalUserLike | null) {
  if (!user) return false
  if (isCoordinatorOrOicUser(user)) return true
  const branchId = norm(user.branchId)
  const jobTitle = norm(user.jobTitle)

  return branchId.endsWith('-sales')
    || branchId === 'br-taguig-sales'
    || jobTitle.includes('sales')
    || jobTitle.includes('sales coordinator')
    || jobTitle.includes('coordinator')
}

export function isServiceWorkspaceUser(user?: PortalUserLike | null) {
  if (!user) return false
  if (isCoordinatorOrOicUser(user)) return false
  const branchId = norm(user.branchId)
  const jobTitle = norm(user.jobTitle)

  return branchId.endsWith('-services')
    || branchId.endsWith('-service')
    || branchId === 'br-taguig-services'
    || branchId === 'br-taguig-service'
    || jobTitle.includes('service')
}

export function getPortalHomePath(user?: PortalUserLike | null) {
  const role = norm(user?.role)
  if (role === 'admin') return '/audit-report'
  if (isSalesWorkspaceUser(user)) return '/daily-report'
  if (isServiceWorkspaceUser(user)) return '/service-report'
  return '/daily-report'
}
