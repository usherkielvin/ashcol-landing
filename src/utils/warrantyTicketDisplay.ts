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

function joinBrandCapacity(brand?: string, capacity?: string) {
  const b = brand?.trim() || ''
  const c = capacity?.trim() || ''
  if (b && c) return `${b} ${c}`
  return b || c
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
