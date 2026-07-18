import {
  API_BASE_URL,
  branchScopesMatch,
  fetchTicketsPage,
  isTaguigBranchRef,
  isTaguigServiceTicket,
  isTaguigServicesScope,
  readApiError,
  resolveScopedBranchId,
  resolveTicketArchiveBranchId,
  type InstallerBranchIndexEntry,
} from './api'

export const ARCHIVE_UPDATED_EVENT = 'ashcol-archive-updated'

export function notifyArchiveUpdated(): void {
  window.dispatchEvent(new CustomEvent(ARCHIVE_UPDATED_EVENT))
}

type TicketLike = Record<string, unknown>

function parseAcMeta(ticket: TicketLike): Record<string, unknown> {
  const raw = ticket.acDetails ?? ticket.ac_details
  if (!raw || typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return (parsed[0] as Record<string, unknown>) || {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function ticketRemarks(ticket: TicketLike): string {
  return [
    ticket.remarksUpdate,
    ticket.remarks,
    ticket.note,
  ].filter(Boolean).join(' ')
}

export function isInstalledRemarks(text?: string | null): boolean {
  return (text || '').toLowerCase().includes('installed')
}

export function getTicketScheduleOutcome(ticket: TicketLike): string {
  const meta = parseAcMeta(ticket)
  const explicit = String(meta.scheduleOutcome || '').toUpperCase()
  if (explicit) return explicit
  const remarks = ticketRemarks(ticket).toLowerCase()
  const stat = String(ticket.status || '').toUpperCase()
  if (stat === 'COMPLETED') {
    if (/clean/i.test(remarks)) return 'DONE_CLEANING'
    if (isInstalledRemarks(remarks)) return 'DONE_INSTALLED'
  }
  return ''
}

export function shouldBackfillTicketArchive(ticket: TicketLike): boolean {
  const remarks = ticketRemarks(ticket)
  const remarksLower = remarks.toLowerCase()
  if (remarksLower.includes('pending warranty') || remarksLower.includes('warranty regi')) {
    return true
  }
  const outcome = getTicketScheduleOutcome(ticket)
  if (
    outcome === 'DONE_CLEANING'
    || outcome === 'DONE_SURVEY'
    || outcome === 'DONE_SYSTEM_REPROCESS'
    || outcome === 'DONE_DISMANTLE'
    || outcome === 'DONE_CHECKUP'
    || outcome === 'DONE_BACKJOB'
  ) return false
  if (outcome === 'DONE_INSTALLED') return true
  if (isInstalledRemarks(remarks)) return true
  if (/clean/i.test(remarks) || /survey/i.test(remarks)) return false
  const status = String(ticket.status || '').toUpperCase()
  if (status === 'COMPLETED') return true
  return false
}

export function ticketMatchesArchiveBranchFilter(
  ticket: TicketLike,
  branchFilter: string,
  lineupIndex: InstallerBranchIndexEntry[] = [],
  driverOnlyNames: string[] = [],
): boolean {
  if (!branchFilter) return false
  const archiveBranch = resolveTicketArchiveBranchId(ticket, lineupIndex, driverOnlyNames, branchFilter)
  if (!archiveBranch) return false

  if (isTaguigBranchRef(branchFilter)) {
    if (!isTaguigBranchRef(archiveBranch)) return false
    const wantServices = isTaguigServicesScope(branchFilter)
    const isService = isTaguigServiceTicket(ticket)
    return wantServices ? isService : !isService
  }

  if (isTaguigBranchRef(archiveBranch)) return false
  return branchScopesMatch(archiveBranch, branchFilter)
}

function parseBrandFromTicket(ticket: TicketLike): string {
  const unit = getField(ticket, 'unitType', 'unit_type')
  if (unit && !isGenericUnitLabel(unit)) return unit
  const raw = ticket.acDetails ?? ticket.ac_details
  if (!raw || typeof raw !== 'string') return unit || ''
  try {
    const parsed = JSON.parse(raw)
    const units = Array.isArray(parsed) ? parsed : [parsed]
    const brands: string[] = []
    for (const u of units) {
      if (!u || typeof u !== 'object') continue
      const row = u as Record<string, unknown>
      const joined = joinBrandCapacity(
        typeof row.brand === 'string' ? row.brand : '',
        typeof row.capacity === 'string' ? row.capacity : '',
      )
      if (joined && !isGenericUnitLabel(joined)) brands.push(joined)
      const details = Array.isArray(row.details) ? row.details : []
      for (const detail of details) {
        if (detail && typeof detail === 'object' && typeof (detail as Record<string, unknown>).brand === 'string') {
          brands.push((detail as Record<string, unknown>).brand as string)
        }
      }
      if (typeof row.unitType === 'string' && row.unitType.trim() && !isGenericUnitLabel(row.unitType)) {
        return row.unitType.trim()
      }
    }
    if (brands.length) return brands.join(', ')
  } catch { /* ignore */ }
  return unit || ''
}

function joinBrandCapacity(brand: string, capacity: string) {
  const b = brand.trim()
  const c = capacity.trim()
  if (b && c) return `${b} ${c}`
  return b || c
}

function isGenericUnitLabel(value: string) {
  const normalized = value.trim().toLowerCase()
  return !normalized
    || normalized === 'split ac'
    || normalized === 'split'
    || normalized === 'ac'
    || normalized === 'window ac'
    || normalized === 'window'
}

function parseNegotiatorFromTicket(ticket: TicketLike): string {
  const meta = parseAcMeta(ticket)
  return String(meta.negotiatorName || meta.negotiator || '').trim()
}

function getField(ticket: TicketLike, ...keys: string[]): string {
  for (const key of keys) {
    const val = ticket[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return ''
}

function formatAddress(loc: unknown): string {
  if (!loc) return ''
  if (typeof loc === 'string') {
    const s = loc.trim()
    if (!s) return ''
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const p = JSON.parse(s) as { address?: string; region?: string }
        const addr = (p?.address ?? '').trim()
        const region = (p?.region ?? '').trim()
        return addr && region && !addr.toLowerCase().includes(region.toLowerCase())
          ? `${addr}, ${region}` : addr || region || s
      } catch { /* fall through */ }
    }
    return s
  }
  if (typeof loc === 'object' && loc) {
    const o = loc as { address?: string; region?: string }
    const addr = (o.address ?? '').trim()
    const region = (o.region ?? '').trim()
    return addr && region && !addr.toLowerCase().includes(region.toLowerCase())
      ? `${addr}, ${region}` : addr || region || ''
  }
  return ''
}

function parseDistrict(ticket: TicketLike): string {
  const explicit = getField(ticket, 'district')
  if (explicit) return explicit
  const loc = ticket.location
  if (typeof loc === 'string') {
    try {
      const p = JSON.parse(loc) as { district?: string; city?: string }
      return p?.district || p?.city || ''
    } catch { return '' }
  }
  if (loc && typeof loc === 'object') {
    const o = loc as { district?: string; city?: string }
    return (o.district || o.city || '').trim()
  }
  return ''
}

function todayDateKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${month}-${String(last).padStart(2, '0')}`
}

export function getTicketArchiveDateKey(ticket: TicketLike): string {
  const meta = parseAcMeta(ticket)
  const finalDate = meta.finalDate
  if (typeof finalDate === 'string' && finalDate.trim()) {
    return finalDate.split('T')[0].split(' ')[0].trim()
  }
  const installed = meta.installedDate
  if (typeof installed === 'string' && installed.trim()) {
    return installed.split('T')[0].split(' ')[0].trim()
  }
  const completion = ticket.actualCompletion ?? ticket.actual_completion ?? ticket.updatedAt ?? ticket.updated_at
  if (completion) return String(completion).split('T')[0].split(' ')[0].trim()
  const preferred = ticket.preferredDate ?? ticket.preferred_date
  if (preferred) return String(preferred).split('T')[0].split(' ')[0].trim()
  return todayDateKey()
}

function dateInMonth(dateKey: string, month: string): boolean {
  if (!dateKey || !month) return false
  const normalized = dateKey.split('T')[0].split(' ')[0].trim()
  return normalized >= `${month}-01` && normalized <= lastDayOfMonth(month)
}

/** Match installed/completion month or original schedule month. Skip when month is empty (all months). */
function ticketInMonth(ticket: TicketLike, month?: string | null): boolean {
  if (!month?.trim()) return true
  const meta = parseAcMeta(ticket)
  const candidates = [
    getTicketArchiveDateKey(ticket),
    String(ticket.preferredDate ?? ticket.preferred_date ?? ''),
    String(meta.archivedScheduleDate ?? ''),
    String(meta.finalDate ?? ''),
  ]
  return candidates.some((key) => dateInMonth(key, month))
}

export function buildArchivePayloadFromTicket(
  ticket: TicketLike,
  branchFilter: string,
  lineupIndex: InstallerBranchIndexEntry[] = [],
  driverOnlyNames: string[] = [],
): Record<string, unknown> | null {
  const branchId = resolveTicketArchiveBranchId(ticket, lineupIndex, driverOnlyNames, branchFilter)
  if (!branchId) return null

  const meta = parseAcMeta(ticket)
  const installedKey = getTicketArchiveDateKey(ticket) || todayDateKey()
  const scheduleKey = String(meta.archivedScheduleDate || ticket.preferredDate || ticket.preferred_date || installedKey)
    .split('T')[0].split(' ')[0].trim()
  const mode = getField(ticket, 'modeOfPayment', 'mode_of_payment').toUpperCase() || 'CASH'
  const charges = ticket.installationCharges ?? ticket.installation_charges ?? ticket.amountCharged ?? 0
  const remarks = getField(ticket, 'remarksUpdate', 'remarks') || 'Installed'
  const commitTerms = getField(ticket, 'commitType', 'commitTerms', 'description')
  const freeInstall = mode === 'FREE INSTALL' || mode === 'FREE' || /FREE/i.test(commitTerms)

  return {
    branchId: resolveScopedBranchId(branchId),
    ticketId: ticket.id,
    reportDate: installedKey,
    scheduledDate: scheduleKey,
    installedDate: installedKey,
    customerName: getField(ticket, 'customerName', 'customer_name') || String(ticket.title || '').trim(),
    customerAddress: formatAddress(ticket.location),
    customerPhone: getField(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone'),
    district: parseDistrict(ticket),
    serviceType: freeInstall ? 'FREE_INSTALLATION' : 'INSTALLATION',
    statusCode: 'I',
    commitTerms,
    dealer: getField(ticket, 'dealer', 'sourceVendor', 'source_vendor'),
    unitBrandModel: parseBrandFromTicket(ticket) || getField(ticket, 'unitType', 'unit_type'),
    technicianName: getField(ticket, 'installerName', 'installer_name') || String(meta.installerName || meta.installer || ''),
    negotiator: parseNegotiatorFromTicket(ticket) || undefined,
    amountCharged: parseFloat(String(charges)) || 0,
    paymentStatus: mode,
    jobStatus: 'COMPLETED',
    remarks,
    note: getField(ticket, 'note'),
    controlNumber: getField(ticket, 'controlNumber', 'control_number') || undefined,
    scheduleStatus: 'COMPLETED',
    freeInstallation: freeInstall,
  }
}

export async function postTicketArchiveReport(
  payload: Record<string, unknown>,
  token: string,
  options?: { silent?: boolean },
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE_URL}/v1/service-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await readApiError(res))
  if (!options?.silent) notifyArchiveUpdated()
  return res.json() as Promise<Record<string, unknown>>
}

/** Create archive rows for completed tickets that are missing from the list. */
export async function syncMissingTicketArchives(
  token: string,
  branchFilter: string,
  month: string | null | undefined,
  existingRows: Array<{ ticketId?: string | null }>,
  lineupIndex: InstallerBranchIndexEntry[] = [],
  driverOnlyNames: string[] = [],
  alreadySyncedTicketIds: Set<string> = new Set(),
  options?: { maxCreate?: number },
): Promise<Record<string, unknown>[]> {
  const existingIds = new Set(
    existingRows.map((r) => r.ticketId).filter((id): id is string => Boolean(id)),
  )
  const maxCreate = options?.maxCreate ?? 30

  let tickets: unknown[]
  try {
    tickets = await fetchTicketsPage('/tickets', token, {
      size: 300,
      categoryGroup: 'FIELD',
      status: 'COMPLETED',
    })
  } catch {
    return []
  }

  const created: Record<string, unknown>[] = []
  for (const raw of tickets) {
    if (created.length >= maxCreate) break
    const ticket = raw as TicketLike
    const ticketId = ticket.id ? String(ticket.id) : ''
    if (!ticketId) continue
    if (!shouldBackfillTicketArchive(ticket)) continue
    if (existingIds.has(ticketId) || alreadySyncedTicketIds.has(ticketId)) continue
    if (!ticketMatchesArchiveBranchFilter(ticket, branchFilter, lineupIndex, driverOnlyNames)) continue
    if (!ticketInMonth(ticket, month)) continue

    const payload = buildArchivePayloadFromTicket(ticket, branchFilter, lineupIndex, driverOnlyNames)
    if (!payload) continue

    try {
      const saved = await postTicketArchiveReport(payload, token, { silent: true })
      alreadySyncedTicketIds.add(ticketId)
      created.push(saved)
      if (saved.ticketId) existingIds.add(String(saved.ticketId))
    } catch (err) {
      console.warn('[archives] backfill failed for ticket', ticket.id, err)
    }
  }
  return created
}
