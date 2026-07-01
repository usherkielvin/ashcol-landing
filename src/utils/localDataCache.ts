export type CacheEnvelope<T> = {
  v: number
  at: number
  data: T
}

const PREFIX = 'ashcol-cache:'

export function readLocalCache<T>(key: string, maxAgeMs?: number): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<T>
    if (maxAgeMs != null && Date.now() - env.at > maxAgeMs) return null
    return env.data
  } catch {
    return null
  }
}

export function readLocalCacheEnvelope<T>(key: string): CacheEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as CacheEnvelope<T>
  } catch {
    return null
  }
}

export function writeLocalCache<T>(key: string, data: T, version = 1): void {
  try {
    const env: CacheEnvelope<T> = { v: version, at: Date.now(), data }
    localStorage.setItem(PREFIX + key, JSON.stringify(env))
  } catch {
    // Quota or private mode — ignore
  }
}

export function clearLocalCache(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}
