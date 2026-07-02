import type { WarrantyTicket } from './warrantyRegistration'

const GENERIC_UNITS = new Set([
  'split ac',
  'split',
  'ac',
  'window ac',
  'window',
])

function isGenericUnitType(value?: string | null) {
  if (!value?.trim()) return true
  return GENERIC_UNITS.has(value.trim().toLowerCase())
}

function compactBrandToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function dedupeConsecutiveTokens(label: string) {
  const tokens = label.trim().split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (const token of tokens) {
    const prev = out[out.length - 1]
    if (prev && prev.toLowerCase() === token.toLowerCase()) continue
    out.push(token)
  }
  return out.join(' ')
}

function capacityAlreadyInBrand(brand: string, capacity: string) {
  const b = brand.trim()
  const c = capacity.trim()
  if (!b || !c) return false
  const bLower = b.toLowerCase()
  const cLower = c.toLowerCase()
  if (bLower.endsWith(cLower)) return true
  const bCompact = compactBrandToken(b)
  const cCompact = compactBrandToken(c)
  if (bCompact.endsWith(cCompact)) return true
  const cNoHp = cCompact.replace(/hp$/, '')
  if (cNoHp && (bCompact.endsWith(cNoHp) || bCompact.endsWith(`${cNoHp}hp`))) return true
  return false
}

function joinBrandCapacity(brand?: string, capacity?: string) {
  const b = brand?.trim() || ''
  const c = capacity?.trim() || ''
  if (!b && !c) return ''
  if (!c) return dedupeConsecutiveTokens(b)
  if (!b) return dedupeConsecutiveTokens(c)
  if (capacityAlreadyInBrand(b, c)) return dedupeConsecutiveTokens(b)
  return dedupeConsecutiveTokens(`${b} ${c}`)
}

/** Relay / warranty display label — avoids repeating HP when brand already includes capacity. */
export function formatBrandCapacityLabel(brand?: string | null, capacity?: string | null) {
  return joinBrandCapacity(brand || '', capacity || '')
}

export function parseBrandFromAcDetails(raw?: string | null): string {
  if (!raw?.trim()) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      for (const unit of parsed) {
        const joined = joinBrandCapacity(unit?.brand, unit?.capacity)
        if (joined && !isGenericUnitType(joined)) return joined
        const details = Array.isArray(unit?.details) ? unit.details : []
        for (const detail of details) {
          if (detail?.brand?.trim()) return detail.brand.trim()
        }
        if (unit?.unitType?.trim() && !isGenericUnitType(unit.unitType)) return unit.unitType.trim()
      }
      return ''
    }
    if (parsed && typeof parsed === 'object') {
      const joined = joinBrandCapacity(parsed.brand, parsed.capacity)
      if (joined && !isGenericUnitType(joined)) return joined
      if (parsed.unitType?.trim() && !isGenericUnitType(parsed.unitType)) return parsed.unitType.trim()
    }
  } catch {
    // ignore malformed JSON
  }
  return ''
}

export function resolveWarrantyBrand(row: WarrantyTicket): string {
  const enriched = row.unitBrandDisplay?.trim()
  if (enriched && !isGenericUnitType(enriched)) return enriched

  const fromAc = parseBrandFromAcDetails(row.acDetails)
  if (fromAc) return fromAc

  const unit = row.unitType?.trim()
  if (unit && !isGenericUnitType(unit)) return unit

  const registered = row.brandRegisteredTo?.trim()
  if (registered) return registered

  return unit || '—'
}

export function resolveScheduleTicketNo(row: WarrantyTicket): string {
  return row.parentTicketNumber?.trim() || '—'
}

export function resolveControlNumber(row: WarrantyTicket): string {
  return row.controlNumber?.trim() || row.parentControlNumber?.trim() || '—'
}
