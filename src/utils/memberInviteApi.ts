import { API_BASE_URL, readApiError } from './api'

/** An admin-issued member registration link, as the Members page sees it. */
export interface MemberInviteLink {
  id: string
  token: string
  branchId: string
  branchName: string
  createdAt: string
  createdBy?: string
  expiresAt: string
  useCount: number
  lastUsedAt?: string | null
}

export interface MemberInviteView {
  branchName: string
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
  password: string
  verificationCode: string
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export function buildMemberInviteUrl(token: string): string {
  return `${window.location.origin}/join/${encodeURIComponent(token)}`
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function createMemberInvite(
  branchId: string,
  expiresInDays: number,
  forceNew = false,
): Promise<MemberInviteLink> {
  const res = await fetch(`${API_BASE_URL}/admin/member-invites`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ branchId, expiresInDays, forceNew }),
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

export async function sendMemberSignupCode(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/send-signup-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(await readApiError(res))
}

export async function registerMember(token: string, body: MemberRegistration): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/public/member-invites/${encodeURIComponent(token)}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readApiError(res))
}
