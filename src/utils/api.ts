export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
export const SERVER_BASE_URL = API_BASE_URL.replace(/\/api$/, '')

/** Resolves a potentially relative image path to a full URL using the configured server base */
export function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${SERVER_BASE_URL}${path}`
}

/** Maps backend roles to user-friendly titles */
export function formatRole(role?: string): string {
  if (!role) return ''
  const r = role.toUpperCase()
  if (r === 'MANAGER') return 'OIC / Officer in Charge'
  if (r === 'ADMIN') return 'Manager'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}
