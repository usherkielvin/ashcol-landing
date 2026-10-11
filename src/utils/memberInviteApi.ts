import { API_BASE_URL, readApiError } from './api'

/** An admin-issued member registration link, as the Members page sees it. */
export interface MemberInviteLink {
  id: string
  token: string
  /** Empty for a general link — the member picks their own branch. */
  branchId: string | null
  branchName: string | null
  createdAt: string
  createdBy?: string
  expiresAt: string
  useCount: number
  lastUsedAt?: string | null
}

export interface MemberInviteView {
  /** Null for a general link — the form asks the member for their branch. */
  branchName: string | null
  expiresAt: string
}

export interface MemberRegistration {
  name: string
  nickname: string
  email: string
  personalEmail: string
  phone: string
  birthDate: string
  dateHired: string | null
  /** Only used when the link/page has no fixed branch. */
  branchId?: string
  password: string
  verificationCode: string
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

/**
 * Host that serves the open sign-up page. Defaults to wherever the admin is (the portal), because that is the
 * deployment that actually contains /register; set VITE_PUBLIC_SITE_URL once ashcol.com.ph serves it too.
 */
export const PUBLIC_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, '')
  || (typeof window !== 'undefined' ? window.location.origin : 'https://portal.ashcol.com.ph')

export const OPEN_REGISTER_URL = `${PUBLIC_SITE_URL}/register`

export function buildMemberInviteUrl(token: string): string {
  return `${window.location.origin}/join/${encodeURIComponent(token)}`
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function createMemberInvite(
  branchId: string | null,
  expiresInDays: number,
  forceNew = false,
): Promise<MemberInviteLink> {
  const res = await fetch(`${API_BASE_URL}/admin/member-invites`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ branchId: branchId ?? '', expiresInDays, forceNew }),
  })
  if (!res.ok) throw new Error(await readApiError(res))
  return (await res.json()).data as MemberInviteLink
}

export async function listMemberInvites(): Promise<MemberInviteLink[]> {
  const res = await fetch(`${API_BASE_URL}/admin/member-invites`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await readApiError(res))
  return ((await res.json()).data ?? []) as MemberInviteLink[]
}

export async function revokeMemberInvite(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/member-invites/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await readApiError(res))
}

export async function approveMember(userId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/approve`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await readApiError(res))
}

// ── Public (no login) ────────────────────────────────────────────────────────

/** Returns null when the link is unknown, revoked or expired. */
export async function resolveMemberInvite(token: string): Promise<MemberInviteView | null> {
  const res = await fetch(`${API_BASE_URL}/public/member-invites/${encodeURIComponent(token)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(await readApiError(res))
  return (await res.json()).data as MemberInviteView
}

/** True when the open /register page is accepting sign-ups. */
export async function isOpenSignupAvailable(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/public/member-signup`)
  if (res.status === 404) return false
  if (!res.ok) throw new Error(await readApiError(res))
  return true
}

/** Consistent branch labels: Taguig is two scopes, shown as "ASHCOL TAGUIG SALES" / "ASHCOL TAGUIG SERVICES". */
export function formatBranchLabel(name: string): string {
  const upper = (name || '').replace(/[–—]/g, '-').trim().toUpperCase()
  if (upper.includes('TAGUIG')) {
    if (upper.includes('SALES')) return 'ASHCOL TAGUIG SALES'
    if (upper.includes('SERVICE')) return 'ASHCOL TAGUIG SERVICES'
  }
  return upper
}

/** Sales sorts directly before Services; everything else keeps its server order. */
function branchSortKey(label: string): number {
  return label === 'ASHCOL TAGUIG SALES' ? 0 : label === 'ASHCOL TAGUIG SERVICES' ? 1 : 2
}

export async function fetchPublicBranches(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${API_BASE_URL}/public/branches`)
  if (!res.ok) return []
  const data = (await res.json())?.data
  if (!Array.isArray(data)) return []
  const list = data.map((b: { id: string; name: string }) => ({ id: b.id, name: formatBranchLabel(b.name) }))
  // Keep the server order, but pull the two Taguig scopes together (Sales first) at the Taguig position.
  const firstTaguig = list.findIndex(b => branchSortKey(b.name) < 2)
  if (firstTaguig === -1) return list
  const taguig = list.filter(b => branchSortKey(b.name) < 2).sort((a, b) => branchSortKey(a.name) - branchSortKey(b.name))
  const rest = list.filter(b => branchSortKey(b.name) === 2)
  rest.splice(firstTaguig, 0, ...taguig)
  return rest
}

export async function sendMemberSignupCode(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/send-signup-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(await readApiError(res))
}

/** token = null registers through the open /register page. */
export async function registerMember(token: string | null, body: MemberRegistration): Promise<void> {
  const path = token ? `member-invites/${encodeURIComponent(token)}/register` : 'member-signup/register'
  const res = await fetch(`${API_BASE_URL}/public/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readApiError(res))
}
