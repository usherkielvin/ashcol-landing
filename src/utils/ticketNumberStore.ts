import { normalizeRelayScheduleTicket } from './relayScheduleSync'

const PREFIX = 'ashcol-ticket:'
const DATE_INDEX_PREFIX = 'ashcol-schedule-date-index:'
const memory = new Map<string, Record<string, unknown>>()
const dateIndexMemory = new Map<string, string[]>()

// Every distinct ticket number / schedule date ever viewed used to get its own permanent
// localStorage key with no cap or TTL — months of daily use silently accumulates thousands of
// them until the origin's storage quota is exhausted (see main.tsx's QuotaExceededError
// interceptor). Trim the oldest entries back to a cap every so often instead of letting either
// prefix grow forever.
const MAX_CACHED_TICKETS = 1200
let ticketWriteCount = 0

function pruneOldestByPrefix(prefix: string, max: number): void {
  const entries: Array<{ key: string; savedAt: number }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(prefix)) continue
    try {
      const parsed = JSON.parse(localStorage.getItem(k) || '{}') as { savedAt?: number }
      entries.push({ key: k, savedAt: parsed.savedAt || 0 })
    } catch {
      entries.push({ key: k, savedAt: 0 })
    }
  }
  if (entries.length <= max) return
  entries.sort((a, b) => a.savedAt - b.savedAt)
  const excess = entries.length - max
  for (let i = 0; i < excess; i++) {
    localStorage.removeItem(entries[i].key)
  }
}

export function normalizeTicketNumberKey(ticketNumber?: string | null): string {
  return (ticketNumber || '').trim().toUpperCase()
}

export function ticketNumberFromRecord(ticket: Record<string, unknown>): string {
  return normalizeTicketNumberKey(
    (ticket.ticketNumber as string | undefined) || (ticket.ticket_number as string | undefined),
  )
}

export function cacheTicketByNumber(ticket: Record<string, unknown>): void {
  const key = ticketNumberFromRecord(ticket)
  if (!key) return
  const normalized = normalizeRelayScheduleTicket(ticket)
  memory.set(key, normalized)
  try {
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify({ ticket: normalized, savedAt: Date.now() }))
    // Full-scan prune is O(localStorage size) — only worth paying for occasionally, not on
    // every single ticket in a bulk list load.
    ticketWriteCount += 1
    if (ticketWriteCount % 200 === 0) pruneOldestByPrefix(PREFIX, MAX_CACHED_TICKETS)
  } catch {
    /* ignore quota */
  }
}

export function cacheTicketsByNumber(tickets: unknown[]): void {
  if (!Array.isArray(tickets)) return
  for (const ticket of tickets) {
    if (ticket && typeof ticket === 'object') {
      cacheTicketByNumber(ticket as Record<string, unknown>)
    }
  }
}

export function getTicketByNumber(ticketNumber?: string | null): Record<string, unknown> | null {
  const key = normalizeTicketNumberKey(ticketNumber)
  if (!key) return null
  const cached = memory.get(key)
  if (cached) return cached
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ticket?: Record<string, unknown> }
    if (!parsed?.ticket || typeof parsed.ticket !== 'object') return null
    const normalized = normalizeRelayScheduleTicket(parsed.ticket)
    memory.set(key, normalized)
    return normalized
  } catch {
    return null
  }
}

export function getTicketsByNumbers(ticketNumbers: string[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const ticketNumber of ticketNumbers) {
    const key = normalizeTicketNumberKey(ticketNumber)
    if (!key || seen.has(key)) continue
    const ticket = getTicketByNumber(key)
    if (ticket) {
      seen.add(key)
      out.push(ticket)
    }
  }
  return out
}

const MAX_CACHED_SCHEDULE_DATES = 180
let dateIndexWriteCount = 0

export function writeScheduleDateTicketNumbers(dateKey: string, ticketNumbers: string[]): void {
  const key = dateKey.trim()
  if (!key) return
  const normalized = [...new Set(ticketNumbers.map(normalizeTicketNumberKey).filter(Boolean))]
  dateIndexMemory.set(key, normalized)
  try {
    localStorage.setItem(`${DATE_INDEX_PREFIX}${key}`, JSON.stringify({ ticketNumbers: normalized, savedAt: Date.now() }))
    dateIndexWriteCount += 1
    if (dateIndexWriteCount % 20 === 0) pruneOldestByPrefix(DATE_INDEX_PREFIX, MAX_CACHED_SCHEDULE_DATES)
  } catch {
    /* ignore */
  }
}

export function readScheduleDateTicketNumbers(dateKey: string): string[] {
  const key = dateKey.trim()
  if (!key) return []
  const cached = dateIndexMemory.get(key)
  if (cached?.length) return [...cached]
  try {
    const raw = localStorage.getItem(`${DATE_INDEX_PREFIX}${key}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { ticketNumbers?: string[] }
    const numbers = Array.isArray(parsed?.ticketNumbers)
      ? parsed.ticketNumbers.map(normalizeTicketNumberKey).filter(Boolean)
      : []
    if (numbers.length) dateIndexMemory.set(key, numbers)
    return numbers
  } catch {
    return []
  }
}

const EDITED_TTL_MS = 30 * 60_000
const EDITED_KEY = 'ashcol-recently-edited-tickets'

/**
 * Ticket edits happen from independently-mounted routes (Overview at /tickets, Schedules at
 * /schedules, My Tickets at /my-tickets all render separate <Tickets> instances). The in-memory
 * "which tickets did I just edit, so trust my local copy over a possibly-stale server read"
 * tracking (locallyEditedTicketIdsRef) resets on every remount, so an edit made on Overview loses
 * its protection the moment you navigate to Schedules — a fresh fetch there has no record the
 * ticket was just touched and can overwrite the correct local value with a stale server response.
 * This persists that "recently edited" marker to localStorage so it survives navigation.
 */
export function markTicketLocallyEdited(ticketId: string): void {
  if (!ticketId) return
  try {
    const raw = localStorage.getItem(EDITED_KEY)
    const map: Record<string, number> = raw ? JSON.parse(raw) : {}
    const cutoff = Date.now() - EDITED_TTL_MS
    for (const id of Object.keys(map)) {
      if (map[id] < cutoff) delete map[id]
    }
    map[ticketId] = Date.now()
    localStorage.setItem(EDITED_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function getRecentlyLocallyEditedTicketIds(): string[] {
  try {
    const raw = localStorage.getItem(EDITED_KEY)
    if (!raw) return []
    const map: Record<string, number> = JSON.parse(raw)
    const cutoff = Date.now() - EDITED_TTL_MS
    return Object.keys(map).filter(id => map[id] >= cutoff)
  } catch {
    return []
  }
}

export function extractTicketNumbers(tickets: unknown[]): string[] {
  if (!Array.isArray(tickets)) return []
  const numbers: string[] = []
  const seen = new Set<string>()
  for (const ticket of tickets) {
    if (!ticket || typeof ticket !== 'object') continue
    const key = ticketNumberFromRecord(ticket as Record<string, unknown>)
    if (!key || seen.has(key)) continue
    seen.add(key)
    numbers.push(key)
  }
  return numbers
}
