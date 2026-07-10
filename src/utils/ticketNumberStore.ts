import { normalizeRelayScheduleTicket } from './relayScheduleSync'

const PREFIX = 'ashcol-ticket:'
const DATE_INDEX_PREFIX = 'ashcol-schedule-date-index:'
const memory = new Map<string, Record<string, unknown>>()
const dateIndexMemory = new Map<string, string[]>()

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

export function writeScheduleDateTicketNumbers(dateKey: string, ticketNumbers: string[]): void {
  const key = dateKey.trim()
  if (!key) return
  const normalized = [...new Set(ticketNumbers.map(normalizeTicketNumberKey).filter(Boolean))]
  dateIndexMemory.set(key, normalized)
  try {
    localStorage.setItem(`${DATE_INDEX_PREFIX}${key}`, JSON.stringify({ ticketNumbers: normalized, savedAt: Date.now() }))
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
