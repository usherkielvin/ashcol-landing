import { EMPTY_CELL } from './textSanitize'
import type { Ticket, ScheduleGhostKind } from './ticketTypes'
import { parseAcMeta } from './ticketPatch'

export function getPreferredDateKey(ticket: Ticket): string {
  const dateStr = ticket.preferredDate || ticket.preferred_date || ''
  if (!dateStr) return ''
  return dateStr.split('T')[0].split(' ')[0].trim()
}

export function getFinalDateKey(ticket: Ticket): string {
  const top = String(
    (ticket as Ticket & { finalDate?: string; final_date?: string }).finalDate
    || (ticket as Ticket & { final_date?: string }).final_date
    || '',
  ).trim()
  if (top) return top.split('T')[0].split(' ')[0].trim()
  const raw = parseAcMeta(ticket).finalDate || (parseAcMeta(ticket) as { final_date?: string }).final_date
  if (!raw) return ''
  return String(raw).split('T')[0].split(' ')[0].trim()
}

export function getEffectiveScheduleDateKey(ticket: Ticket): string {
  return getFinalDateKey(ticket) || getPreferredDateKey(ticket)
}

export function hasFinalScheduleDate(ticket: Ticket): boolean {
  return Boolean(getFinalDateKey(ticket))
}

export function resolveScheduleCompletionDateKey(ticket: Ticket, activeDateKey?: string): string {
  const active = (activeDateKey || '').split('T')[0].split(' ')[0].trim()
  if (active) {
    const isResched = (ticket.status || '').toUpperCase() === 'RESCHED'
    const meta = parseAcMeta(ticket)
    const scheduledDate = String(meta.scheduledDate || '').split('T')[0].split(' ')[0].trim()
    const archived = String(meta.archivedScheduleDate || '').split('T')[0].split(' ')[0].trim()
    const preferred = getPreferredDateKey(ticket)
    const cancelledScheduleDate = String(meta.cancelledScheduleDate || '').split('T')[0].split(' ')[0].trim()
    const finalDate = !isResched ? getFinalDateKey(ticket) : ''
    const matches = [finalDate, preferred, scheduledDate, archived, cancelledScheduleDate].includes(active)
    // A CONTINUATION ticket's preferredDate never advances past its original day (see
    // commitInlineContinuation), so completing it while actually viewing/working a later
    // continuation day wouldn't otherwise match anything above and would silently fall back
    // to that stale original date — misattributing the completion to the wrong day.
    if (matches || getPreviousScheduleDates(ticket).includes(active) || getContinuationDates(ticket).includes(active)) {
      return active
    }
  }
  return getEffectiveScheduleDateKey(ticket) || todayDateKey()
}

export function getPreviousScheduleDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.previousScheduleDates
  if (!Array.isArray(raw)) return []
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
}

export function getRescheduleTargetDateKey(ticket: Ticket): string {
  const meta = parseAcMeta(ticket)
  const to = String(meta.rescheduledTo || '').split('T')[0].split(' ')[0].trim()
  if (to) return to
  return getPreferredDateKey(ticket) || getEffectiveScheduleDateKey(ticket)
}

export function getRescheduleHistoryDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.rescheduleHistoryDates
  if (!Array.isArray(raw)) return []
  return raw
    .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    .map(d => d.split('T')[0].split(' ')[0].trim())
}

/**
 * Crew as it stood on a date the ticket was rescheduled away from. Stored per old date in
 * acDetails.rescheduleSnapshots so the RESCHED ghost row keeps showing who was dispatched
 * that day, even after the active row on the new date gets a different installer/driver.
 */
export interface RescheduleSnapshot {
  installerName?: string
  driverName?: string
  serviceVehicle?: string
  capturedAt?: string
}

export function getRescheduleSnapshots(ticket: Ticket): Record<string, RescheduleSnapshot> {
  const raw = parseAcMeta(ticket).rescheduleSnapshots
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Record<string, RescheduleSnapshot>
}

export function getRescheduleSnapshot(ticket: Ticket, dateKey: string): RescheduleSnapshot | null {
  if (!dateKey) return null
  return getRescheduleSnapshots(ticket)[dateKey] || null
}

function readCrewField(ticket: Ticket, meta: Record<string, unknown>, ...keys: string[]): string {
  const record = ticket as unknown as Record<string, unknown>
  for (const k of keys) {
    const v = record[k] ?? meta[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Snapshot of the ticket's current installer/driver/vehicle (pre-edit values). */
export function buildRescheduleSnapshot(ticket: Ticket): RescheduleSnapshot {
  const meta = parseAcMeta(ticket)
  return {
    installerName: readCrewField(ticket, meta, 'installerName', 'installer_name', 'installer', 'technicianName'),
    driverName: readCrewField(ticket, meta, 'driverName', 'driver_name'),
    serviceVehicle: readCrewField(ticket, meta, 'serviceVehicle', 'service_vehicle'),
    capturedAt: new Date().toISOString(),
  }
}

/**
 * acDetails updates that leave a RESCHED ghost on `oldDateKey`: records the date in
 * rescheduleHistoryDates and freezes the old date's crew (first snapshot for a date wins —
 * rescheduling onto and off the same date again never overwrites what was dispatched there).
 * `ticket` must be the PRE-edit ticket so the snapshot captures the old crew.
 */
export function buildRescheduleGhostAcUpdates(
  ticket: Ticket,
  oldDateKey: string,
  newDateKey: string,
): Record<string, unknown> {
  if (!oldDateKey || !newDateKey || oldDateKey === newDateKey) return {}
  const history = getRescheduleHistoryDates(ticket)
  const snapshots = getRescheduleSnapshots(ticket)
  return {
    rescheduleHistoryDates: history.includes(oldDateKey) ? history : [...history, oldDateKey],
    rescheduleSnapshots: snapshots[oldDateKey]
      ? snapshots
      : { ...snapshots, [oldDateKey]: buildRescheduleSnapshot(ticket) },
    rescheduledTo: newDateKey,
  }
}

export function shouldBlankReschedGhostPayment(
  dateKey?: string,
  ghostKind?: ScheduleGhostKind,
): boolean {
  if (!dateKey) return false
  return ghostKind === 'resched' || ghostKind === 'continuation'
}

export function getContinuationDates(ticket: Ticket): string[] {
  const meta = parseAcMeta(ticket)
  const raw = meta.continuationDates
  if (!Array.isArray(raw)) return []
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
}

export function formatSimpleDateShort(dateStr: string): string {
  const dateParts = dateStr.split('-')
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return dateParts.length === 3
    ? `${monthNames[parseInt(dateParts[1], 10) - 1] || ''} ${parseInt(dateParts[2], 10)}`
    : dateStr
}

export function getNextContinuationDate(ticket: Ticket, currentDateKey: string): string | null {
  const dates = getContinuationDates(ticket)
  if (dates.length === 0) return null
  const sorted = [...dates].sort()
  const next = sorted.find(d => d > currentDateKey)
  if (next) return next
  return sorted[sorted.length - 1]
}

export function isReschedulePending(ticket: Ticket): boolean {
  const meta = parseAcMeta(ticket)
  return meta.reschedulePending === true || String(meta.reschedulePending).toLowerCase() === 'true'
}

export function ticketHadScheduleDate(ticket: Ticket): boolean {
  return Boolean(
    getFinalDateKey(ticket)
    || getPreferredDateKey(ticket)
    || parseAcMeta(ticket).scheduledDate,
  )
}

export function todayDateKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function currentWeekMondayDateKey(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const SCHEDULES_ACTIVE_DATE_KEY = 'ashcol-schedules-active-date'

export function resolveInitialScheduleDate(pathname: string): string {
  if (pathname === '/my-tickets') return ''
  try {
    const persisted = sessionStorage.getItem(SCHEDULES_ACTIVE_DATE_KEY)
    if (persisted && /^\d{4}-\d{2}-\d{2}$/.test(persisted)) return persisted
  } catch {
    // ignore
  }
  return todayDateKey()
}

export function formatDateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateKeyLabel(key: string): string {
  if (!key) return ''
  const datePart = key.split('T')[0].split(' ')[0].trim()
  if (!datePart) return ''
  const d = new Date(`${datePart}T00:00:00`)
  if (isNaN(d.getTime())) return key
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  return `${month} ${day} ${year}`
}

export function formatDisplayDate(key?: string | null, fallback = EMPTY_CELL): string {
  const normalized = (key || '').split('T')[0].split(' ')[0].trim()
  if (!normalized) return fallback
  const label = formatDateKeyLabel(normalized)
  return label || fallback
}

export function formatMonthFilterLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const year = Number(y)
  const monthIdx = Number(m) - 1
  if (!year || monthIdx < 0 || monthIdx > 11) return monthKey
  return new Date(year, monthIdx, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

export function formatDateKeyWithDay(dateKey: string): string {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey
  const d = new Date(`${dateKey}T00:00:00`)
  if (isNaN(d.getTime())) return dateKey
  const monthName = d.toLocaleDateString('en-US', { month: 'long' })
  const dayNum = d.getDate()
  const year = d.getFullYear()
  const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' })
  return `${monthName} ${dayNum}, ${year} ${dayOfWeek}`
}

export function monthsSince(dateKey: string): number {
  if (!dateKey) return 0
  const d = new Date(`${dateKey}T00:00:00`)
  if (isNaN(d.getTime())) return 0
  const now = new Date()
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
}
