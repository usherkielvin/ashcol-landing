import { API_BASE_URL } from './api'

// Tokenized payout links. `fetchSharedPayout` (public page) is the only call here made WITHOUT a JWT —
// the token in the path is the credential. The create / list / revoke / rotate calls are payroll-only.

/** One row of the shared table, exactly as the public endpoint returns it (see PayoutShareView.Row). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SharedPayoutRow = Record<string, any>

export interface SharedPayout {
  installerLabel: string
  branchName: string
  weekFrom: string
  weekTo: string
  /** COMPLETED once payroll has finalized every counted row, otherwise NOT_FINAL. */
  status: 'COMPLETED' | 'NOT_FINAL'
  rows: SharedPayoutRow[]
}

export type SharedPayoutResult =
  | { kind: 'ok'; payout: SharedPayout }
  /** Unknown, revoked and expired tokens are deliberately indistinguishable. */
  | { kind: 'inactive' }
  | { kind: 'rate-limited'; retryAfterSeconds: number }
  | { kind: 'error' }

export async function fetchSharedPayout(token: string, signal?: AbortSignal): Promise<SharedPayoutResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/payout-shares/${encodeURIComponent(token)}`, {
      signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (res.status === 404) return { kind: 'inactive' }
    if (res.status === 429) {
      return { kind: 'rate-limited', retryAfterSeconds: parseInt(res.headers.get('Retry-After') || '', 10) || 60 }
    }
    if (!res.ok) return { kind: 'error' }
    const payout = (await res.json()) as SharedPayout
    return { kind: 'ok', payout: { ...payout, rows: Array.isArray(payout.rows) ? payout.rows : [] } }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    return { kind: 'error' }
  }
}

// ── Payroll side ────────────────────────────────────────────────────────────

/** A link as payroll sees it (carries the token, so it only ever comes back to payroll users). */
export interface PayoutShareLink {
  id: string
  token: string
  branchId: string
  installerLabel: string
  weekFrom: string
  weekTo: string
  createdAt: string | null
  createdBy: string | null
  expiresAt: string
  viewCount: number
  lastViewedAt: string | null
}

export interface CreatePayoutShareLinkRequest {
  branchId: string
  weekFrom: string
  weekTo: string
  /** Every raw payroll row name that makes up this installer on the roster. */
  installerNames: string[]
  installerLabel: string
}

/** The URL payroll sends. Built from the current origin so it works on the portal host and on previews. */
export const payoutShareUrl = (token: string) => `${window.location.origin}/payout/${token}`

const authToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

async function payrollRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/v1/payroll/share-links${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message || body?.error || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

/** The active link for this installer-week; created if there is none, so calling it twice is safe. */
export const createShareLink = (req: CreatePayoutShareLinkRequest) =>
  payrollRequest<PayoutShareLink>('', { method: 'POST', body: JSON.stringify(req) })

export const listShareLinks = (branchId: string, weekFrom: string) =>
  payrollRequest<PayoutShareLink[]>(`?${new URLSearchParams({ branchId, weekFrom })}`)

export const revokeShareLink = (id: string) =>
  payrollRequest<{ message: string }>(`/${encodeURIComponent(id)}`, { method: 'DELETE' })

/** Revokes the old token and returns a fresh link for the same installer-week. */
export const rotateShareLink = (id: string) =>
  payrollRequest<PayoutShareLink>(`/${encodeURIComponent(id)}/rotate`, { method: 'POST' })
