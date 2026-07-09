export type StoreCategory = 'Robinsons' | 'Abenson' | 'Direct' | 'Other'

export type ParsedStoreVendor = { store: StoreCategory; branch: string; customStore?: string }

export function parseStoreVendor(sourceVendor?: string): ParsedStoreVendor {
  const sv = (sourceVendor || '').trim()
  const lower = sv.toLowerCase()
  if (lower.includes('robinsons')) {
    const branch = sv.replace(/^robinsons(\s+b2b)?\s*/i, '').trim()
    return { store: 'Robinsons', branch }
  }
  if (lower.includes('abenson')) {
    const branch = sv.replace(/^abenson(\s+b2b)?\s*/i, '').trim()
    return { store: 'Abenson', branch }
  }
  if (lower === 'direct' || !sv) {
    return { store: 'Direct', branch: '' }
  }
  const parts = sv.split(' - ')
  const customStore = parts[0]?.trim() || ''
  const branch = parts.slice(1).join(' - ').trim()
  return { store: 'Other', branch, customStore }
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
