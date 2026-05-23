import { API_BASE_URL } from './api'

const BASE_URL = `${API_BASE_URL}/v1/audit-expense-categories`

function getToken() {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

export interface AuditExpenseCategoryDetail {
  id: string
  name: string
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export async function loadAuditExpenseCategories(): Promise<AuditExpenseCategoryDetail[]> {
  try {
    const res = await fetch(BASE_URL, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    if (!res.ok) return []
    return await res.json()
  } catch (err) {
    console.error('[AuditExpenseCategoryStorage] Load error:', err)
    return []
  }
}

export async function saveAuditExpenseCategory(category: Partial<AuditExpenseCategoryDetail>): Promise<AuditExpenseCategoryDetail> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify(category)
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  return await res.json()
}

export async function deleteAuditExpenseCategory(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` }
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
}

export async function reorderAuditExpenseCategories(categoryIds: string[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/reorder`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify(categoryIds)
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
}
