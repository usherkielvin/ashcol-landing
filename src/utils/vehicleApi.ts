import { API_BASE_URL } from './api'

export interface Vehicle {
  id: string
  name: string
  plateNumber: string | null
  brandModel: string | null
  branchId: string | null
  driverName: string | null
  codingDay: string | null
  photoUrl: string | null
  active: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface VehicleExpense {
  id: string
  vehicleId: string
  type: string
  amount: number
  expenseDate: string
  odometer: number | null
  notes: string | null
  receiptPhotoUrl: string | null
  createdBy: string | null
  createdAt: string | null
}

export const VEHICLE_EXPENSE_TYPES = [
  { value: 'OIL_CHANGE', label: 'Oil Change' },
  { value: 'TIRE_CHANGE', label: 'Tire Change' },
  { value: 'REGISTRATION', label: 'Registration / LTO' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'FUEL', label: 'Fuel' },
  { value: 'OTHER', label: 'Other' },
]

function authToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken()}` }
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    throw new Error(body?.message || body?.error || `Request failed (HTTP ${res.status})`)
  }
  return body.data as T
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  const res = await fetch(`${API_BASE_URL}/vehicles`, { headers: authHeaders() })
  return unwrap<Vehicle[]>(res)
}

export async function fetchVehicle(id: string): Promise<Vehicle> {
  const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, { headers: authHeaders() })
  return unwrap<Vehicle>(res)
}

export async function createVehicle(payload: {
  name: string
  plateNumber?: string
  brandModel?: string
  branchId?: string
  driverName?: string
  codingDay?: string
}): Promise<Vehicle> {
  const res = await fetch(`${API_BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return unwrap<Vehicle>(res)
}

export async function updateVehicle(
  id: string,
  payload: Partial<{
    name: string
    plateNumber: string
    brandModel: string
    branchId: string
    driverName: string
    codingDay: string
    active: boolean
  }>,
): Promise<Vehicle> {
  const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return unwrap<Vehicle>(res)
}

export async function deleteVehicle(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  await unwrap<void>(res)
}

export async function uploadVehiclePhoto(id: string, file: Blob, filename = 'photo.jpg'): Promise<Vehicle> {
  const form = new FormData()
  form.append('photo', file, filename)
  const res = await fetch(`${API_BASE_URL}/vehicles/${id}/photo`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  return unwrap<Vehicle>(res)
}

export async function fetchVehicleExpenses(vehicleId: string): Promise<VehicleExpense[]> {
  const res = await fetch(`${API_BASE_URL}/vehicles/${vehicleId}/expenses`, { headers: authHeaders() })
  return unwrap<VehicleExpense[]>(res)
}

export async function createVehicleExpense(
  vehicleId: string,
  payload: { type: string; amount: number; expenseDate: string; odometer?: number; notes?: string },
): Promise<VehicleExpense> {
  const res = await fetch(`${API_BASE_URL}/vehicles/${vehicleId}/expenses`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return unwrap<VehicleExpense>(res)
}

export async function uploadVehicleExpenseReceipt(
  vehicleId: string,
  expenseId: string,
  file: Blob,
  filename = 'receipt.jpg',
): Promise<VehicleExpense> {
  const form = new FormData()
  form.append('receipt', file, filename)
  const res = await fetch(`${API_BASE_URL}/vehicles/${vehicleId}/expenses/${expenseId}/receipt`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  return unwrap<VehicleExpense>(res)
}
