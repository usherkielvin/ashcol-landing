export type StoreCategory = 'Robinsons' | 'Abenson' | 'Direct' | 'Other'

export type ParsedStoreVendor = { store: StoreCategory; branch: string; customStore?: string }

export function parseStoreVendor(sourceVendor?: string): ParsedStoreVendor {
  const sv = (sourceVendor || '').trim()
  const lower = sv.toLowerCase()
  
  // Try to split by ' - ' first to separate store name and branch name
  const parts = sv.split(' - ')
  const dealerName = parts[0]?.trim() || ''
  const branchName = parts.slice(1).join(' - ').trim()
  
  const dealerLower = dealerName.toLowerCase()
  if (dealerLower.startsWith('robinsons') || dealerLower.startsWith('ra')) {
    return { store: 'Robinsons', branch: branchName }
  }
  if (dealerLower.startsWith('abenson')) {
    return { store: 'Abenson', branch: branchName }
  }
  if (dealerLower === 'direct') {
    return { store: 'Direct', branch: '' }
  }
  
  // Fallback for space-separated legacy names (e.g. "Robinsons Taguig" or "Robinsons Appliances Malabon")
  if (lower.startsWith('robinsons ') || lower.startsWith('ra ')) {
    const branch = sv.replace(/^(robinsons|ra)(\s+appliances|\s+app|\s+appl|\s+store|\s+b2b)?\s*/i, '').trim()
    return { store: 'Robinsons', branch }
  }
  if (lower.startsWith('abenson ')) {
    const branch = sv.replace(/^abenson(\s+appliances|\s+app|\s+appl|\s+store|\s+b2b)?\s*/i, '').trim()
    return { store: 'Abenson', branch }
  }
  
  return { store: 'Other', branch: branchName, customStore: dealerName }
}

export function combineStoreVendor(store: StoreCategory, branch: string, customStore?: string): string {
  if (store === 'Direct') return 'Direct'
  if (store === 'Other') {
    const s = (customStore || '').trim()
    const b = branch.trim()
    if (!s) return 'Other'
    return b ? `${s} - ${b}` : s
  }
  const b = branch.trim()
  if (!b) return store
  if (b.toLowerCase().startsWith(store.toLowerCase())) return b
  return `${store} ${b}`
}

const RELAY_CUSTOM_STORES_KEY = 'ashcol-relay-custom-stores'

export function readRelayCustomStores(): string[] {
  try {
    const raw = localStorage.getItem(RELAY_CUSTOM_STORES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function persistRelayCustomStores(stores: string[]) {
  localStorage.setItem(RELAY_CUSTOM_STORES_KEY, JSON.stringify(stores))
}
