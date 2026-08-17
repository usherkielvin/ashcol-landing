/**
 * CreateTicketImportPanel
 *
 * Import/Export panel for the Create Ticket modal in Relays.tsx.
 * Designed to work with the addForm state structure.
 */

import { useState, useCallback } from 'react'
import { ClipboardPaste, Copy, Check, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { parseTicketText } from './ticketTextParser'

// ─── Field mappings: parsed text labels → addForm keys ────────────────────────

const LABEL_TO_FORM_KEY: Record<string, string> = {
  'ticket type': 'status',
  'status': '__section__', // "Closing"/"Pending" → informational only
  'dealer': 'dealer',
  'dealer name': 'dealer',
  'dealer branch': 'dealerBranch',
  'customer name': 'customerName',
  'customer': 'customerName',
  'contact number': 'contactPhone',
  'contact': 'contactPhone',
  'phone': 'contactPhone',
  'address': 'locationRaw',
  'destination': 'locationRaw',
  'location': 'locationRaw',
  'district': 'district',
  'district zone': 'district',
  'brand': 'brand',
  'capacity': 'capacity',
  'sku': 'sku',
  'sku / serial no.': 'sku',
  'serial number': 'serialNumber',
  'commit / promo': 'commitType',
  'commit': 'commitType',
  'promo': 'commitType',
  'negotiator': '__negotiator__',
  'remarks': 'remarksUpdate',
  'remarks / update': 'remarksUpdate',
  'update': 'remarksUpdate',
  'driver': '__driver__',
  'vehicle': 'serviceVehicle',
  'installer / technician': 'installerName',
  'technician / installer': 'installerName',
  'installer': 'installerName',
  'technician': 'installerName',
  'mode of payment': 'modeOfPayment',
  'payment mode': 'modeOfPayment',
  'payment amount': '__amount__',
  'amount': '__amount__',
}

// Ticket type label → status value mapping
const TICKET_TYPE_MAP: Record<string, string> = {
  'DONE INSTALL': 'DONE_INSTALLED',
  'DONE INSTALLED': 'DONE_INSTALLED',
  'DONE SURVEY': 'DONE_SURVEY',
  'DONE SERVICE': 'DONE_SERVICE',
  'DONE CLEANING': 'DONE_CLEANING',
  'DONE CHECKUP': 'DONE_CHECKUP',
  'DONE BACKJOB': 'DONE_BACKJOB',
  'DONE DISMANTLE': 'DONE_DISMANTLE',
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
  'CANCELLED': 'CANCELLED',
}

const PAYMENT_MAP: Record<string, string> = {
  'NO PAYMENT': 'NO_PAYMENT',
  'NO_PAYMENT': 'NO_PAYMENT',
  'FREE': 'NO_PAYMENT',
  'CASH': 'CASH',
  'BANK TRANSFER': 'BANK TRANSFER',
  'GCASH': 'GCASH',
  'CHECK': 'CHEQUE',
  'CHEQUE': 'CHEQUE',
  'FOR COLLECTION': 'FOR COLLECTION',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateTicketImportPanelProps {
  onImport: (updates: Record<string, any>, phoneNumbers?: string[]) => void
  currentForm: { customerName?: string; locationRaw?: string; dealer?: string }
  isLight: boolean
  inputBg: string
  inputBorder: string
  textPrimary: string
  textMuted: string
  border: string
  cardBg: string
}

export function CreateTicketImportPanel({
  onImport,
  currentForm,
  isLight,
  inputBg,
  inputBorder,
  textPrimary,
  textMuted,
  border,
  cardBg,
}: CreateTicketImportPanelProps) {
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [state, setState] = useState<'idle' | 'preview' | 'success'>('idle')
  const [preview, setPreview] = useState<Record<string, any> | null>(null)
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([])
  const [ignored, setIgnored] = useState<string[]>([])
  const [fieldCount, setFieldCount] = useState(0)
  const [exportCopied, setExportCopied] = useState(false)

  const hasExistingData = Boolean(currentForm.customerName || currentForm.locationRaw || currentForm.dealer)

  const handleParse = useCallback(() => {
    if (!text.trim()) return

    const tickets = parseTicketText(text)
    if (tickets.length === 0) return

    const ticket = tickets[0]
    const updates: Record<string, any> = {}
    const ignoredFields: string[] = []
    const phones: string[] = []
    let count = 0

    for (const [rawLabel, value] of Object.entries(ticket.fields)) {
      const key = LABEL_TO_FORM_KEY[rawLabel.toLowerCase().trim()]

      if (!key) {
        ignoredFields.push(rawLabel)
        continue
      }

      if (key === '__section__') { count++; continue }
      if (key === '__negotiator__') { count++; continue } // Can't auto-select dropdown
      if (key === '__driver__') {
        // No driverName field in addForm — skip but don't mark as ignored
        count++
        continue
      }

      if (key === '__amount__') {
        const upper = value.toUpperCase().trim()
        if (upper && upper !== 'FREE' && upper !== 'N/A' && upper !== '0') {
          updates.installationCharges = parseFloat(value.replace(/,/g, '')) || 0
        }
        count++
        continue
      }

      if (key === 'contactPhone') {
        // Split multiple numbers
        const parts = value.split(/[/,]|\s{2,}/).map(p => p.trim()).filter(Boolean)
        if (parts.length > 0) {
          updates.contactPhone = parts[0]
          phones.push(...parts)
        }
        count++
        continue
      }

      if (key === 'status') {
        const upper = value.toUpperCase().trim()
        updates.status = TICKET_TYPE_MAP[upper] || upper
        updates.serviceType = updates.status
        count++
        continue
      }

      if (key === 'modeOfPayment') {
        const upper = value.toUpperCase().trim()
        updates.modeOfPayment = PAYMENT_MAP[upper] || upper
        count++
        continue
      }

      // Direct field
      if (value) {
        updates[key] = value
        count++
      }
    }

    setPreview(updates)
    setPhoneNumbers(phones)
    setIgnored(ignoredFields)
    setFieldCount(count)
    setState('preview')
  }, [text])

  const handleConfirm = () => {
    if (!preview) return
    onImport(preview, phoneNumbers.length > 0 ? phoneNumbers : undefined)
    setState('success')
    setTimeout(() => setState('idle'), 3000)
  }

  const handleExport = useCallback(async () => {
    const lines = [
      `Customer Name: ${currentForm.customerName || ''}`,
      `Address: ${currentForm.locationRaw || ''}`,
      `Dealer: ${currentForm.dealer || ''}`,
    ]
    const exportText = lines.join('\n')
    try {
      await navigator.clipboard.writeText(exportText)
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 2500)
    } catch { /* fallback not needed for now */ }
  }, [currentForm])

  // ─── Render ───────────────────────────────────────────────────────────

  const addInput = 'w-full border rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 normal-case'

  return (
    <div className="flex flex-col h-full" style={{ borderLeft: `1px solid ${border}` }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-4 py-3 shrink-0 select-none"
        style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}
      >
        <div className="flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-emerald-500" />
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textPrimary }}>
            Import / Export
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: textMuted }} /> : <ChevronDown className="w-4 h-4" style={{ color: textMuted }} />}
      </button>

      {expanded && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Success */}
          {state === 'success' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: isLight ? '#f0fdf4' : 'rgba(16,185,129,0.1)', border: `1px solid ${isLight ? '#86efac' : 'rgba(16,185,129,0.3)'}` }}>
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <p className="text-[11px] font-bold" style={{ color: '#10B981' }}>Ticket data imported!</p>
                <p className="text-[10px]" style={{ color: textMuted }}>{fieldCount} fields populated.</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {state === 'preview' && preview && (
            <div className="space-y-2.5">
              <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                <p className="text-[11px] font-bold" style={{ color: textPrimary }}>Import Preview</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {Object.entries(preview).map(([key, val]) => {
                    if (!val) return null
                    return (
                      <div key={key} className="flex justify-between gap-2">
                        <span className="text-[9px] font-bold uppercase truncate" style={{ color: textMuted }}>{key}</span>
                        <span className="text-[10px] font-medium truncate max-w-[140px]" style={{ color: textPrimary }}>{String(val)}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] font-semibold" style={{ color: '#10B981' }}>{fieldCount} fields detected.</p>
                {ignored.length > 0 && (
                  <p className="text-[9px]" style={{ color: textMuted }}>Ignored: {ignored.join(', ')}</p>
                )}
                {hasExistingData && (
                  <p className="text-[9px] font-semibold text-amber-600">⚠ This will replace existing form values.</p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setState('idle')} className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold border" style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>Cancel</button>
                <button type="button" onClick={handleConfirm} className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>Import & Fill Form</button>
              </div>
            </div>
          )}

          {/* Idle — Textarea + Buttons */}
          {(state === 'idle' || state === 'success') && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Paste Ticket Data</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  placeholder={`Ticket 1: CUSTOMER NAME\nTicket Type: DONE INSTALL\nCustomer Name: ...\nContact Number: ...\nAddress: ...\nBrand: CARRIER\nCapacity: 1HP WALL MOUNTED\n...`}
                  className={`${addInput} resize-none font-mono text-[11px]`}
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, textTransform: 'none', minHeight: '180px' }}
                />
              </div>

              <button
                type="button"
                onClick={handleParse}
                disabled={!text.trim()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold text-white transition-all disabled:opacity-40"
                style={{ background: text.trim() ? 'linear-gradient(135deg, #10B981, #059669)' : undefined, backgroundColor: text.trim() ? undefined : (isLight ? '#e2e8f0' : '#1e293b') }}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Import / Fill Form
              </button>

              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px" style={{ backgroundColor: border }} />
                <span className="text-[9px] font-bold uppercase" style={{ color: textMuted }}>export</span>
                <div className="flex-1 h-px" style={{ backgroundColor: border }} />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold border transition-colors"
                  style={{ borderColor: inputBorder, color: exportCopied ? '#10B981' : textPrimary, backgroundColor: cardBg }}
                >
                  {exportCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {exportCopied ? 'Copied!' : 'Copy Ticket'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([text || ''], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = 'ticket.txt'
                    document.body.appendChild(a); a.click()
                    document.body.removeChild(a); URL.revokeObjectURL(url)
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold border transition-colors"
                  style={{ borderColor: inputBorder, color: textPrimary, backgroundColor: cardBg }}
                >
                  <Download className="w-3.5 h-3.5" />
                  .txt
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
