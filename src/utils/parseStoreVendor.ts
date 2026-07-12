export type StoreCategory = string
export type ParsedStoreVendor = { store: StoreCategory; branch: string; customStore?: string }

export function parseStoreVendor(sourceVendor?: string): ParsedStoreVendor {
  const sv = (sourceVendor || '').trim()
  
  // Try to split by ' - ' first to separate store name and branch name
  const parts = sv.split(' - ')
  const dealerName = parts[0]?.trim() || ''
  const branchName = parts.slice(1).join(' - ').trim()
  
  return { store: dealerName || 'Other', branch: branchName, customStore: dealerName }
}

export function combineStoreVendor(store: StoreCategory, branch: string): string {
  const s = (store || '').trim()
  const b = branch.trim()
  
  if (!s) return 'Other'
  if (!b) return s
  return `${s} - ${b}`
}

