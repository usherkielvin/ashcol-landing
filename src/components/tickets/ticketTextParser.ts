/**
 * Ticket Text Import/Export Parser
 *
 * Parses structured plain-text ticket blocks into field maps,
 * and serializes form data back into the same format.
 *
 * Format:
 *   Ticket N: CUSTOMER NAME        (header line, optional)
 *   Field Label: Value              (one per line, split on FIRST colon only)
 */

import type { RelayEditDraft } from '../relays/relayEditForm'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedTicket {
  /** Sequential ticket number (from "Ticket N:" header), or 1 if absent */
  ticketNumber: number
  /** Raw fields as { label → value } */
  fields: Record<string, string>
}

export interface ImportValidation {
  valid: boolean
  fieldsDetected: number
  fieldsMapped: number
  missingRequired: string[]
  ignoredFields: string[]
  warnings: string[]
}

export interface ImportResult {
  tickets: ParsedTicket[]
  validation: ImportValidation
}

// ─── Field Label → Draft Key Mapping ──────────────────────────────────────────

/**
 * Maps plain-text labels to RelayEditDraft field keys.
 * Multiple labels can map to the same key (aliases).
 */
const LABEL_TO_DRAFT_KEY: Record<string, keyof RelayEditDraft | '__special__'> = {
  // Ticket type / Status
  'ticket type': 'serviceType',
  'status': 'updateStatus',
  'section': '__special__', // Closing/Pending info — we use it to confirm but updateStatus is primary

  // Dealer
  'dealer': 'dealerName',
  'dealer name': 'dealerName',
  'dealer branch': 'dealerBranch',
  'dealer / store': 'dealerName',
  'dealer / store branch': 'dealerBranch',

  // Customer
  'customer name': 'customerName',
  'customer': 'customerName',
  'contact number': '__special__', // phoneNumbers[] handling
  'contact': '__special__',
  'phone': '__special__',
  'phone number': '__special__',

  // Location
  'address': 'location',
  'destination': 'location',
  'location': 'location',
  'district': 'district',
  'district zone': 'district',

  // Aircon
  'brand': 'brand',
  'capacity': 'capacity',
  'brand / hp': 'brandHp',
  'sku': '__special__',
  'sku / serial no.': '__special__',
  'serial number': '__special__',

  // Commit
  'commit / promo': 'commitType',
  'commit': 'commitType',
  'promo': 'commitType',
  'commit type': 'commitType',

  // Negotiator (text only — not the ID select)
  'negotiator': '__special__',

  // Remarks
  'remarks': 'remarks',
  'remarks / update': 'remarks',
  'update': 'remarks',

  // Dispatch
  'driver': 'driverName',
  'vehicle': 'serviceDriver',
  'installer / technician': 'installerName',
  'technician / installer': 'installerName',
  'installer': 'installerName',
  'technician': 'installerName',

  // Payment
  'mode of payment': 'modeOfPayment',
  'payment mode': 'modeOfPayment',
  'payment amount': '__special__',
  'amount': '__special__',
  'installation charges': '__special__',
}

/** Fields considered important (warning if missing) */
const RECOMMENDED_FIELDS = ['customer name', 'ticket type', 'address']

// ─── Ticket Type Value → serviceType Mapping ──────────────────────────────────

const TICKET_TYPE_TO_SERVICE_TYPE: Record<string, string> = {
  'DONE INSTALL': 'DONE_INSTALLED',
  'DONE INSTALLED': 'DONE_INSTALLED',
  'DONE SURVEY': 'DONE_SURVEY',
  'DONE SERVICE': 'DONE_SERVICE',
  'DONE CLEANING': 'DONE_CLEANING',
  'DONE CHECKUP': 'DONE_CHECKUP',
  'DONE BACKJOB': 'DONE_BACKJOB',
  'DONE DISMANTLE': 'DONE_DISMANTLE',
  'DONE RELOCATED': 'DONE_RELOCATED',
  'DONE RELOCATION': 'DONE_RELOCATED',
  'SURVEY & INSTALL': 'S/I',
  'SURVEY AND INSTALL': 'S/I',
  'S/I': 'S/I',
  'INSTALL': 'INSTALL',
  'INSTALLATION': 'INSTALL',
  'SURVEY': 'SURVEY',
  'CLEANING': 'CLEANING',
  'CHECKUP': 'CHECKUP',
  'BACKJOB': 'BACKJOB',
  'SERVICE': 'SERVICE',
  'RESCHED': 'RESCHED',
  'RESCHEDULE': 'RESCHED',
  'CONTINUATION': 'CONTINUATION',
  'FOR APPROVAL': 'FOR APPROVAL',
  'DISMANTLE': 'DISMANTLE',
  'RELOCATION': 'RELOCATION',
  'CANCELLED': 'CANCELLED',
}

// ─── Payment Mode Mapping ─────────────────────────────────────────────────────

const PAYMENT_MODE_MAP: Record<string, string> = {
  'NO PAYMENT': 'NO_PAYMENT',
  'NO_PAYMENT': 'NO_PAYMENT',
  'FREE': 'NO_PAYMENT',
  'FREE INSTALL': 'FREE INSTALL',
  'CASH': 'CASH',
  'BANK TRANSFER': 'BANK TRANSFER',
  'BANK TRANSFER - BPI': 'BANK TRANSFER',
  'BANK TRANSFER - BDO': 'BANK TRANSFER',
  'GCASH': 'GCASH',
  'CHECK': 'CHEQUE',
  'CHEQUE': 'CHEQUE',
  'CHECKE': 'CHEQUE',
  'FOR COLLECTION': 'FOR COLLECTION',
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a multi-line plain-text input into one or more ticket records.
 * Supports multiple tickets separated by "Ticket N:" headers.
 */
export function parseTicketText(text: string): ParsedTicket[] {
  const lines = text.split(/\r?\n/)
  const tickets: ParsedTicket[] = []
  let currentTicket: ParsedTicket | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Check for ticket header: "Ticket N: CUSTOMER NAME" or "---" separator
    if (trimmed === '---') continue

    const headerMatch = trimmed.match(/^Ticket\s+(\d+)\s*:\s*(.*)$/i)
    if (headerMatch) {
      // Start a new ticket
      if (currentTicket) tickets.push(currentTicket)
      currentTicket = { ticketNumber: parseInt(headerMatch[1], 10), fields: {} }
      // Don't store the header customer name as a field — we'll use "Customer Name:" line
      continue
    }

    // Parse "Label: Value" — split on FIRST colon only
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx > 0) {
      const label = trimmed.substring(0, colonIdx).trim()
      const value = trimmed.substring(colonIdx + 1).trim()

      // Start a ticket implicitly if no header was found
      if (!currentTicket) {
        currentTicket = { ticketNumber: 1, fields: {} }
      }

      currentTicket.fields[label] = value
    }
  }

  if (currentTicket) tickets.push(currentTicket)
  return tickets
}

/**
 * Map a parsed ticket's fields into a partial RelayEditDraft update object.
 */
export function mapTicketToDraft(parsed: ParsedTicket): {
  updates: Partial<RelayEditDraft>
  validation: ImportValidation
} {
  const updates: Partial<RelayEditDraft> = {}
  const ignoredFields: string[] = []
  const mappedLabels: string[] = []

  for (const [rawLabel, value] of Object.entries(parsed.fields)) {
    const normalizedLabel = rawLabel.toLowerCase().trim()
    const draftKey = LABEL_TO_DRAFT_KEY[normalizedLabel]

    if (!draftKey) {
      ignoredFields.push(rawLabel)
      continue
    }

    mappedLabels.push(rawLabel)

    if (draftKey === '__special__') {
      // Handle special fields
      handleSpecialField(normalizedLabel, value, updates)
    } else {
      // Direct mapping — apply value transformations
      const transformed = transformValue(draftKey, value)
      ;(updates as any)[draftKey] = transformed
    }
  }

  // If brand and capacity were set but brandHp wasn't, compose it
  if (updates.brand && !updates.brandHp) {
    updates.brandHp = [updates.brand, updates.capacity].filter(Boolean).join(' ')
  }
  // If brandHp was set but brand/capacity weren't, split it
  if (updates.brandHp && !updates.brand) {
    const parts = updates.brandHp.trim().split(/\s+/)
    if (parts.length > 1) {
      updates.brand = parts[0]
      updates.capacity = parts.slice(1).join(' ')
    }
  }

  // Validation
  const missingRequired: string[] = []
  for (const field of RECOMMENDED_FIELDS) {
    const key = LABEL_TO_DRAFT_KEY[field]
    if (key && key !== '__special__') {
      if (!(updates as any)[key]) {
        missingRequired.push(field)
      }
    } else if (field === 'customer name' && !updates.customerName) {
      missingRequired.push(field)
    }
  }

  const warnings: string[] = []
  if (ignoredFields.length > 0) {
    warnings.push(`${ignoredFields.length} unknown field(s) ignored`)
  }

  return {
    updates,
    validation: {
      valid: missingRequired.length === 0,
      fieldsDetected: Object.keys(parsed.fields).length,
      fieldsMapped: mappedLabels.length,
      missingRequired,
      ignoredFields,
      warnings,
    },
  }
}

function handleSpecialField(label: string, value: string, updates: Partial<RelayEditDraft>) {
  switch (label) {
    case 'contact number':
    case 'contact':
    case 'phone':
    case 'phone number': {
      // Split multiple numbers by / or comma or multiple spaces
      const phones = value.split(/[/,]|\s{2,}/).map((p) => p.trim()).filter(Boolean)
      updates.phoneNumbers = phones.length > 0 ? phones : ['']
      break
    }
    case 'payment amount':
    case 'amount':
    case 'installation charges': {
      // Parse numeric value — remove commas, handle "FREE" / empty
      const upper = value.toUpperCase().trim()
      if (!upper || upper === 'FREE' || upper === 'N/A' || upper === '0' || upper === 'NO PAYMENT') {
        updates.installationCharges = 0
      } else {
        const num = parseFloat(value.replace(/,/g, ''))
        updates.installationCharges = isNaN(num) ? 0 : num
      }
      break
    }
    case 'sku':
    case 'sku / serial no.':
    case 'serial number':
      // SKU/serial → store in draft (we have sku and serialNumber fields)
      // For now we don't import these but don't error either
      break
    case 'negotiator':
      // We can't auto-select from the dropdown by name easily,
      // but we store it so the user sees it in preview
      break
    case 'section':
      // "Closing" / "Pending" — informational, status is set via 'status' field
      break
  }
}

function transformValue(key: keyof RelayEditDraft, value: string): string | number | boolean | string[] {
  switch (key) {
    case 'serviceType':
    case 'updateStatus':
    case 'scheduleStatus': {
      const upper = value.toUpperCase().trim()
      // Map friendly names to internal values
      if (key === 'serviceType') {
        return TICKET_TYPE_TO_SERVICE_TYPE[upper] || upper
      }
      // For updateStatus, also try to resolve
      return TICKET_TYPE_TO_SERVICE_TYPE[upper] || upper
    }
    case 'modeOfPayment': {
      const upper = value.toUpperCase().trim()
      return PAYMENT_MODE_MAP[upper] || upper
    }
    default:
      return value
  }
}

// ─── Serializer ───────────────────────────────────────────────────────────────

/**
 * Serialize a RelayEditDraft into the standard plain-text ticket format.
 */
export function serializeTicketToText(draft: RelayEditDraft, ticketNumber: number = 1): string {
  const ticketType = resolveTicketTypeLabel(draft.serviceType || draft.updateStatus || draft.scheduleStatus || '')
  const status = resolveStatusSection(draft.serviceType || draft.updateStatus || draft.scheduleStatus || '')
  const contactNumber = (draft.phoneNumbers || ['']).filter(Boolean).join(' / ')

  const lines = [
    `Ticket ${ticketNumber}: ${draft.customerName}`,
    `Ticket Type: ${ticketType}`,
    `Status: ${status}`,
    `Dealer: ${draft.dealerName}`,
    `Dealer Branch: ${draft.dealerBranch}`,
    `Customer Name: ${draft.customerName}`,
    `Contact Number: ${contactNumber}`,
    `Address: ${draft.location}`,
    `District: ${draft.district}`,
    `Brand: ${draft.brand}`,
    `Capacity: ${draft.capacity}`,
    `Commit / Promo: ${draft.commitType}`,
    `Negotiator: `,
    `Remarks: ${draft.remarks || draft.remarksUpdate}`,
    `Driver: ${draft.driverName}`,
    `Vehicle: ${draft.serviceDriver}`,
    `Installer / Technician: ${draft.installerName}`,
    `Mode of Payment: ${resolvePaymentLabel(draft.modeOfPayment)}`,
    `Payment Amount: ${draft.installationCharges || ''}`,
  ]

  return lines.join('\n')
}

function resolveTicketTypeLabel(value: string): string {
  const upper = value.toUpperCase().trim()
  // Reverse lookup
  for (const [label, code] of Object.entries(TICKET_TYPE_TO_SERVICE_TYPE)) {
    if (code === upper) return label
  }
  return upper.replace(/_/g, ' ')
}

function resolveStatusSection(value: string): string {
  const upper = value.toUpperCase().trim()
  if (upper.startsWith('DONE') || upper === 'CANCELLED') return 'Closing'
  return 'Pending'
}

function resolvePaymentLabel(value: string): string {
  if (!value || value === 'NO_PAYMENT') return 'NO PAYMENT'
  return value
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateImportedTicket(parsed: ParsedTicket): ImportValidation {
  const { validation } = mapTicketToDraft(parsed)
  return validation
}
