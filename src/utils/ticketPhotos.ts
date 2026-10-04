import { API_BASE_URL } from './api'
import type { Ticket } from './ticketTypes'
import { fetchTicketById } from './ticketDisplay'

/** Server-side cap is enforced in TicketService.normalizePhotoAttachments — keep in sync. */
export const MAX_TICKET_PHOTOS = 10

/** Named upload zones shown as labeled drop boxes in the ticket attachment section. */
export interface TicketUploadZone {
  id: string
  label: string
  /** Pre-filled description text — user can edit it in the inline field. */
  defaultDescription: string
  group: 'primary' | 'documents' | 'optional'
  required: boolean
}

export const TICKET_UPLOAD_ZONES: TicketUploadZone[] = [
  { id: 'indoor-unit',   label: 'Indoor Unit',           defaultDescription: 'Indoor Unit',          group: 'primary',   required: true  },
  { id: 'outdoor-unit',  label: 'Outdoor Unit',          defaultDescription: 'Outdoor Unit',         group: 'primary',   required: true  },
  { id: 'nameplate',     label: 'Nameplate / Serial',    defaultDescription: 'Nameplate / Serial',   group: 'primary',   required: true  },
  { id: 'receipt',       label: 'Receipt',               defaultDescription: 'Receipt',               group: 'documents', required: false },
  { id: 'job-order',     label: 'Job Order / Document',  defaultDescription: 'Job Order / Document', group: 'documents', required: false },
  { id: 'installation',  label: 'Installation Photo',    defaultDescription: 'Installation Photo',   group: 'optional',  required: false },
]

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
  description?: string
  /** Fixed holder (0-based) this photo sits in; photos never move between holders. */
  slot?: number
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
  const raw = getTicketPhotosRaw(fresh)
  // A payload that doesn't carry the field at all is NOT "no photos" — treating it as an empty list made
  // the next save (e.g. deleting one photo) overwrite the whole column with nothing.
  if (raw === undefined) return null
  return parseTicketPhotos(raw)
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
    // Only a real permission refusal gets the generic wording — a 403 also carries the
    // closed-ticket lock, whose own message says what is actually stopping the save.
    if (/access denied/i.test(message) || (res.status === 403 && !message)) {
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
  let latest = (await fetchLatestTicketPhotos(ticketId)) ?? fallback
  // The server copy came back empty while the screen still shows photos: a light/stale payload, not a real
  // wipe. Trust what the user is looking at so one delete/add can never clear the others.
  if (latest.length === 0 && fallback.length > 0) latest = fallback
  return saveTicketPhotos(ticketId, mutate(latest))
}
