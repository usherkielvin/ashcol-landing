import { API_BASE_URL } from './api'

// Corrections to closed payroll weeks (ashcol-service-api: /v1/payroll/corrections). A closed week never
// changes; each correction is the difference between what was paid and what should have been paid,
// posted as an adjustment row in an open week. Payroll users only — the list call is 403 for anyone else.
// See docs/plans/closed-week-corrections.md.

export type CorrectionStatus = 'PENDING' | 'POSTED' | 'VOID'

export interface PayrollCorrection {
  id: string
  branchId: string
  batchId: string
  installerName: string
  originEntryId: string
  originTicketId: string | null
  originTicketNumber: string | null
  originCustomer: string | null
  originMonth: string | null
  originWeekFrom: string | null
  originWeekTo: string | null
  /** JSON array of CorrectionChange — read it with parseCorrectionChanges. */
  changesJson: string
  /** Signed: positive adds to the target week's payout, negative deducts. */
  netAmount: number
  reason: string
  status: CorrectionStatus
  targetWeekFrom: string | null
  targetWeekTo: string | null
  adjustmentMarker: string | null
  createdBy: string
  createdAt: string
  postedBy: string | null
  postedAt: string | null
  voidedBy: string | null
  voidedAt: string | null
  voidReason: string | null
}

/** One column of one ticket: `from` is what was paid, `to` what it should have been. */
export interface CorrectionChange {
  key: string
  label: string
  from: number
  to: number
  delta: number
}

export const parseCorrectionChanges = (c: Pick<PayrollCorrection, 'changesJson'>): CorrectionChange[] => {
  try {
    const parsed = JSON.parse(c.changesJson || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export interface CorrectionItemInput {
  originEntryId: string
  reason?: string
  changes: { key: string; label: string; to: number }[]
}

export interface CreateCorrectionsInput {
  branchId: string
  reason: string
  /** Both set → posted at once; both omitted → recorded as PENDING. */
  targetWeekFrom?: string
  targetWeekTo?: string
  items: CorrectionItemInput[]
}

const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

const authHeaders = (json = false): Record<string, string> => ({
  Authorization: `Bearer ${getToken()}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
})

/** Thrown for a rejected request; `message` is the server's own explanation, fit to show the user. */
export class CorrectionError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function failure(res: Response, fallback: string): Promise<CorrectionError> {
  const body = await res.json().catch(() => null)
  return new CorrectionError(body?.message || body?.error || fallback, res.status)
}

export async function listCorrections(
  branchId: string,
  filters: { status?: CorrectionStatus; installer?: string; weekFrom?: string } = {},
): Promise<PayrollCorrection[]> {
  const params = new URLSearchParams({ branchId })
  if (filters.status) params.set('status', filters.status)
  if (filters.installer) params.set('installer', filters.installer)
  if (filters.weekFrom) params.set('weekFrom', filters.weekFrom)
  const res = await fetch(`${API_BASE_URL}/v1/payroll/corrections?${params.toString()}`, { headers: authHeaders() })
  if (!res.ok) throw await failure(res, 'Could not load corrections.')
  const list = await res.json()
  return Array.isArray(list) ? list : []
}

export async function createCorrections(input: CreateCorrectionsInput): Promise<PayrollCorrection[]> {
  const res = await fetch(`${API_BASE_URL}/v1/payroll/corrections`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await failure(res, 'Could not post the correction.')
  return res.json()
}

export async function postCorrection(id: string, targetWeekFrom: string, targetWeekTo: string): Promise<PayrollCorrection> {
  const res = await fetch(`${API_BASE_URL}/v1/payroll/corrections/${encodeURIComponent(id)}/post`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ targetWeekFrom, targetWeekTo }),
  })
  if (!res.ok) throw await failure(res, 'Could not post the correction.')
  return res.json()
}

export async function voidCorrection(id: string, reason?: string): Promise<PayrollCorrection> {
  const res = await fetch(`${API_BASE_URL}/v1/payroll/corrections/${encodeURIComponent(id)}/void`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ reason: reason ?? null }),
  })
  if (!res.ok) throw await failure(res, 'Could not void the correction.')
  return res.json()
}
