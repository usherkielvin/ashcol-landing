import { API_BASE_URL } from './api'
import type { Ticket } from './ticketTypes'
import { fetchTicketById } from './ticketDisplay'

/** Server-side cap is enforced in TicketService.normalizePhotoAttachments — keep in sync. */
export const MAX_TICKET_PHOTOS = 10

/** One entry of tickets.photo_attachments (JSON array). Files live in the `ticket-attachments` bucket. */
export interface TicketPhoto {
  id: string
  url: string
  thumbUrl?: string
  path?: string
  thumbPath?: string
  size?: number
  originalSize?: number
  width?: number
  height?: number
  uploadedAt?: string
  uploadedBy?: string
  uploadedById?: string
}

export function parseTicketPhotos(raw: unknown): TicketPhoto[] {
  if (!raw) return []
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.filter((p): p is TicketPhoto =>
    !!p && typeof p === 'object' && typeof (p as TicketPhoto).url === 'string' && !!(p as TicketPhoto).url,
  ).map((p, i) => ({ ...p, id: p.id || p.path || `${i}-${p.url}` }))
}

/** Returns null when the ticket payload doesn't carry the field (light schedule rows). */
export function getTicketPhotosRaw(ticket: Ticket): string | null | undefined {
  if (ticket.photoAttachments !== undefined) return ticket.photoAttachments
  return ticket.photo_attachments
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

/** Latest photo list from the server (full ticket payload), or null if it couldn't be fetched. */
export async function fetchLatestTicketPhotos(ticketId: string): Promise<TicketPhoto[] | null> {
  const token = readToken()
  if (!token) return null
  const fresh = await fetchTicketById(token, ticketId)
  if (!fresh) return null
  return parseTicketPhotos(getTicketPhotosRaw(fresh))
}

/** PATCHes the full photo list and returns what the server persisted. */
export async function saveTicketPhotos(ticketId: string, photos: TicketPhoto[]): Promise<TicketPhoto[]> {
  const token = readToken()
  const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // Empty string (not "[]") clears the column server-side.
    body: JSON.stringify({ photoAttachments: photos.length ? JSON.stringify(photos) : '' }),
  })
  if (!res.ok) {
    let message = ''
    try {
      const body = await res.json()
      message = body?.message || body?.error || ''
    } catch { /* non-JSON error body */ }
    if (res.status === 403 || /access denied/i.test(message)) {
      throw new Error("You don't have access to change photos on this ticket.")
    }
    throw new Error(message || `Failed to save photos (${res.status})`)
  }
  const json = await res.json()
  const returned = json?.data || json
  return parseTicketPhotos(returned?.photoAttachments ?? returned?.photo_attachments)
}

/**
 * Read-modify-write against the latest server copy so two people adding photos to the same
 * ticket at once don't overwrite each other's uploads. `mutate` receives the fresh list.
 */
export async function updateTicketPhotos(
  ticketId: string,
  fallback: TicketPhoto[],
  mutate: (current: TicketPhoto[]) => TicketPhoto[],
): Promise<TicketPhoto[]> {
  const latest = (await fetchLatestTicketPhotos(ticketId)) ?? fallback
  return saveTicketPhotos(ticketId, mutate(latest))
}
