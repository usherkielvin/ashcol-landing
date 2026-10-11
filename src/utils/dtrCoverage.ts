import { API_BASE_URL } from './api'

// ── Types ────────────────────────────────────────────────────────────────────

export type DayDeclarationType = 'CLOSED' | 'HOLIDAY' | 'NO_OPERATIONS'

export interface DayDeclaration {
  id: string
  date: string
  type: DayDeclarationType
  reason?: string | null
  declaredBy?: string | null
}

/** A date between the previous DTR and this one on which no DTR was filed. */
export interface CoverageGap {
  date: string
  declaration: DayDeclaration | null
}

export interface DtrCoverage {
  /** The latest earlier DTR for the branch line — the cash-on-hand chain and the coverage window start from it. */
  previousReport: { id?: string; reportDate: string; totalCohCfd: number } | null
  /** Schedule window (inclusive) this DTR pulls: previous DTR's date through the day before this one. */
  coversFrom: string
  coversTo: string
  scheduleDates: string[]
  gapDates: CoverageGap[]
  /** 'fallback' = the backend has no coverage endpoint yet; derived client-side, no gap declarations. */
  source: 'api' | 'fallback'
}

export const DAY_DECLARATION_LABEL: Record<DayDeclarationType, string> = {
  CLOSED: 'Closed',
  HOLIDAY: 'Holiday',
  NO_OPERATIONS: 'No operations',
}

// ── Date helpers ─────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function addDaysToKey(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const d = new Date(year, month - 1, day + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Every YYYY-MM-DD from `from` to `to`, inclusive. Empty when `to` is before `from`. */
export function enumerateDateKeys(from: string, to: string): string[] {
  const out: string[] = []
  for (let key = from; key <= to && out.length < 62; key = addDaysToKey(key, 1)) out.push(key)
  return out
}

/** "Sat Oct 3" — short label for banners. */
export function formatDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Sat Oct 3" or "Sat Oct 3 – Sun Oct 4". */
export function formatWindowLabel(from: string, to: string): string {
  return from === to ? formatDayLabel(from) : `${formatDayLabel(from)} – ${formatDayLabel(to)}`
}

// ── Coverage ─────────────────────────────────────────────────────────────────

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
  return { Authorization: `Bearer ${token}` }
}

function coverageFromPrevious(reportDate: string, previous: DtrCoverage['previousReport']): DtrCoverage {
  const coversTo = addDaysToKey(reportDate, -1)
  const coversFrom = previous && previous.reportDate <= coversTo ? previous.reportDate : coversTo
  return {
    previousReport: previous,
    coversFrom,
    coversTo,
    scheduleDates: enumerateDateKeys(coversFrom, coversTo),
    gapDates: [],
    source: 'fallback',
  }
}

/** Old backends only: walk back day by day (up to 7) to the latest earlier DTR. */
async function walkBackToPreviousReport(branchId: string, auditLine: string | null, reportDate: string): Promise<DtrCoverage['previousReport']> {
  for (let back = 1; back <= 7; back++) {
    const dateStr = addDaysToKey(reportDate, -back)
    const params = new URLSearchParams({ branchId, date: dateStr })
    if (auditLine) params.set('auditLine', auditLine)
    const res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/lookup?${params.toString()}`, { headers: authHeaders() })
    if (!res.ok) continue
    const data = await res.json()
    if (data?.found && data?.id && data.totalCohCfd != null) {
      return { id: data.id, reportDate: dateStr, totalCohCfd: Number(data.totalCohCfd) }
    }
  }
  return null
}

// The form asks for coverage from several places on every date change (balance chain, auto-prefill, sync buttons).
// A short-lived shared promise turns that into one request; any write that could change the answer clears it.
const COVERAGE_TTL_MS = 8_000
const coverageCache = new Map<string, { at: number; promise: Promise<DtrCoverage> }>()

export function invalidateDtrCoverageCache() {
  coverageCache.clear()
}

async function loadCoverage(branchId: string, auditLine: string | null, reportDate: string, reportId?: string | null): Promise<DtrCoverage> {
  const params = new URLSearchParams({ branchId, date: reportDate })
  if (auditLine) params.set('auditLine', auditLine)
  if (reportId) params.set('reportId', reportId)
  let res: Response | null = null
  try {
    res = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/coverage?${params.toString()}`, { headers: authHeaders() })
  } catch {
    // Network failure: fall through to the client-side walk-back below.
  }
  if (res?.ok) {
    const data = await res.json()
    const prev = data?.previousReport
    return {
      previousReport: prev && prev.reportDate
        ? { id: prev.id, reportDate: prev.reportDate, totalCohCfd: Number(prev.totalCohCfd) }
        : null,
      coversFrom: data.coversFrom,
      coversTo: data.coversTo,
      scheduleDates: Array.isArray(data.scheduleDates) && data.scheduleDates.length > 0
        ? data.scheduleDates
        : enumerateDateKeys(data.coversFrom, data.coversTo),
      gapDates: Array.isArray(data.gapDates) ? data.gapDates : [],
      source: 'api',
    }
  }
  // Auth/permission problems are real errors; a missing endpoint just means the backend predates this feature.
  if (res && (res.status === 401 || res.status === 403)) throw new Error(`coverage_http_${res.status}`)
  return coverageFromPrevious(reportDate, await walkBackToPreviousReport(branchId, auditLine, reportDate))
}

/**
 * Which schedule dates a DTR dated `reportDate` pulls, and which dates before it have no DTR.
 * Normal day: just yesterday. After a closed day: the previous DTR's date through yesterday.
 */
export function fetchDtrCoverage(branchId: string, auditLine: string | null, reportDate: string, reportId?: string | null): Promise<DtrCoverage> {
  if (!ISO_DATE.test(reportDate)) {
    return Promise.resolve(coverageFromPrevious(reportDate, null))
  }
  const key = `${branchId}|${auditLine || ''}|${reportDate}|${reportId || ''}`
  const hit = coverageCache.get(key)
  if (hit && Date.now() - hit.at < COVERAGE_TTL_MS) return hit.promise
  const promise = loadCoverage(branchId, auditLine, reportDate, reportId)
  coverageCache.set(key, { at: Date.now(), promise })
  promise.catch(() => { if (coverageCache.get(key)?.promise === promise) coverageCache.delete(key) })
  return promise
}

// ── Day declarations ─────────────────────────────────────────────────────────

async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const json = JSON.parse(text) as { error?: string; message?: string }
    return json.error || json.message || text || fallback
  } catch {
    return text || fallback
  }
}

/** Record why a branch filed no DTR on `date`. Replaces any earlier declaration for that day. */
export async function declareDay(input: {
  branchId: string
  auditLine: string | null
  date: string
  type: DayDeclarationType
  reason?: string
}): Promise<DayDeclaration> {
  const res = await fetch(`${API_BASE_URL}/v1/reports/day-declarations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await readError(res, `Could not save (HTTP ${res.status})`))
  invalidateDtrCoverageCache()
  return res.json()
}

export async function removeDayDeclaration(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/v1/reports/day-declarations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await readError(res, `Could not remove (HTTP ${res.status})`))
  invalidateDtrCoverageCache()
}

/** Admin: declare the same closure on several dates for the given branches (empty = every active branch). */
export async function declareDaysBulk(input: {
  dates: string[]
  branchIds?: string[]
  type: DayDeclarationType
  reason?: string
}): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/v1/reports/day-declarations/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await readError(res, `Could not save (HTTP ${res.status})`))
  invalidateDtrCoverageCache()
  const data = await res.json() as { declarations?: number }
  return data.declarations ?? 0
}
