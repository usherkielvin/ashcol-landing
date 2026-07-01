import { API_BASE_URL, readApiError } from './api'

export type WarrantyTicket = {
  id: string
  ticketNumber?: string | null
  customerName?: string | null
  controlNumber?: string | null
  unitType?: string | null
  branchId?: string | null
  status?: string | null
  preferredDate?: string | null
  preferred_date?: string | null
  installerName?: string | null
  remarksUpdate?: string | null
  parentTicketId?: string | null
  parentCustomerName?: string | null
  parentTicketNumber?: string | null
  parentControlNumber?: string | null
  warrantyRegistrationCompleted?: boolean | null
  brandRegisteredTo?: string | null
  brandRegistrationNumber?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function fetchWarrantyRegistrations(
  token: string,
  tab: 'pending' | 'registered',
): Promise<WarrantyTicket[]> {
  const params = new URLSearchParams({ tab, page: '0', size: '200' })
  const res = await fetch(`${API_BASE_URL}/tickets/warranty-registrations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await readApiError(res))
  const payload = await res.json()
  return payload?.data?.tickets || payload?.tickets || []
}

export async function createWarrantyRegistration(
  token: string,
  body: { parentTicketId?: string; serviceReportId?: string },
): Promise<WarrantyTicket> {
  const res = await fetch(`${API_BASE_URL}/tickets/warranty-registrations`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readApiError(res))
  const payload = await res.json()
  return payload?.data || payload
}

export async function markWarrantyRegistered(token: string, ticketId: string): Promise<WarrantyTicket> {
  const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ warrantyRegistrationCompleted: true, status: 'COMPLETED' }),
  })
  if (!res.ok) throw new Error(await readApiError(res))
  const payload = await res.json()
  return payload?.data || payload
}
