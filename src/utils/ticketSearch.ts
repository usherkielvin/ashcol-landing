import { normalizeTicketNumberKey } from './ticketNumberStore'
import type { Ticket } from './ticketTypes'
import { formatAddress } from './ticketDisplay'

export function getOverviewSearchRelevanceScore(ticket: Ticket, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return 0

  const scoredFields: { value: string; weight: number; exactBonus: number; prefixBonus: number }[] = [
    {
      value: ticket.customerName || ticket.customer_name || ticket.title || '',
      weight: 100,
      exactBonus: 250,
      prefixBonus: 120,
    },
    {
      value: ticket.ticketNumber || ticket.ticket_number || ticket.id || '',
      weight: 90,
      exactBonus: 200,
      prefixBonus: 100,
    },
    {
      value: ticket.controlNumber || ticket.control_number || '',
      weight: 75,
      exactBonus: 150,
      prefixBonus: 70,
    },
    {
      value: ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '',
      weight: 65,
      exactBonus: 120,
      prefixBonus: 50,
    },
    {
      value: formatAddress(ticket.location),
      weight: 45,
      exactBonus: 0,
      prefixBonus: 25,
    },
    {
      value: ticket.assignedEmployeeName || ticket.assigned_employee_name || '',
      weight: 40,
      exactBonus: 80,
      prefixBonus: 30,
    },
    {
      value: ticket.remarks || ticket.remarksUpdate || ticket.note || '',
      weight: 25,
      exactBonus: 0,
      prefixBonus: 10,
    },
  ]

  let score = 0
  for (const { value, weight, exactBonus, prefixBonus } of scoredFields) {
    const v = value.toLowerCase().trim()
    if (!v) continue
    if (v === q) score += weight + exactBonus
    else if (v.startsWith(q)) score += weight + prefixBonus
    else if (v.includes(q)) score += weight
    else if (q.length >= 2 && v.split(/\s+/).some(word => word.startsWith(q))) {
      score += Math.round(weight * 0.75)
    }
  }
  return score
}

export function sortOverviewSearchResults(tickets: Ticket[], query: string): Ticket[] {
  const q = query.trim()
  if (!q) return tickets
  return [...tickets].sort((a, b) => {
    const diff = getOverviewSearchRelevanceScore(b, q) - getOverviewSearchRelevanceScore(a, q)
    if (diff !== 0) return diff
    const aDate = a.updatedAt || a.updated_at || a.createdAt || a.created_at || ''
    const bDate = b.updatedAt || b.updated_at || b.createdAt || b.created_at || ''
    return bDate.localeCompare(aDate)
  })
}

export function ticketMatchesOverviewQuery(ticket: Ticket, rawQuery: string): boolean {
  const q = rawQuery.trim()
  if (!q) return false

  const qUpper = q.toUpperCase()
  const qLower = q.toLowerCase()
  const qDigits = q.replace(/\D/g, '')

  if (/^AS-\d+/i.test(q) || /^TKT-\d+/i.test(q)) {
    const tn = normalizeTicketNumberKey(ticket.ticketNumber || ticket.ticket_number)
    return tn === qUpper || tn.startsWith(qUpper)
  }

  const ticketNum = normalizeTicketNumberKey(ticket.ticketNumber || ticket.ticket_number)
  if (ticketNum && (ticketNum === qUpper || ticketNum.startsWith(qUpper))) return true

  const control = (ticket.controlNumber || ticket.control_number || '').trim().toLowerCase()
  if (control && (control === qLower || control.includes(qLower))) return true

  if (qDigits.length >= 7) {
    const phone = (ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || '')
      .replace(/\D/g, '')
    if (phone && phone.includes(qDigits)) return true
    const negPhone = ((ticket as any).negotiatorPhone || (ticket as any).negotiator_phone || '').replace(/\D/g, '')
    if (negPhone && negPhone.includes(qDigits)) return true
  }

  return getOverviewSearchRelevanceScore(ticket, q) >= 25
}

export function filterOverviewSearchResults(tickets: Ticket[], query: string): Ticket[] {
  const q = query.trim()
  if (!q) return []
  return tickets.filter(ticket => ticketMatchesOverviewQuery(ticket, q))
}
