/**
 * TicketImportExportPanel
 *
 * A side panel that slots into the Relay Ticket modal, providing:
 * - A textarea to paste structured ticket text
 * - Import button with preview/confirmation
 * - Export button that serializes current form data to clipboard
 */

import { useState, useCallback } from 'react'
import { ClipboardPaste, Copy, Check, AlertTriangle, Download, ChevronDown, ChevronUp } from 'lucide-react'
import {
  parseTicketText,
  mapTicketToDraft,
  serializeTicketToText,
  type ParsedTicket,
  type ImportValidation,
} from '../tickets/ticketTextParser'
import type { RelayEditDraft } from '../relays/relayEditForm'

interface TicketImportExportPanelProps {
  /** Current draft state of the relay ticket form */
  draft: RelayEditDraft
  /** Callback to apply imported fields into the form */
  onImport: (updates: Partial<RelayEditDraft>) => void
  /** Theme props to match existing modal styling */
  isLight: boolean
  inputBg: string
  inputBorder: string
  textPrimary: string
  textMuted: string
  border: string
  cardBg: string
  compactInput: string
}

type PanelState = 'idle' | 'preview' | 'success' | 'error'

export function TicketImportExportPanel({
  draft,
  onImport,
  isLight,
  inputBg,
  inputBorder,
  textPrimary,
  textMuted,
  border,
  cardBg,
  compactInput,
}: TicketImportExportPanelProps) {
  const [text, setText] = useState('')
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [, setParsedTicket] = useState<ParsedTicket | null>(null)
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [importUpdates, setImportUpdates] = useState<Partial<RelayEditDraft> | null>(null)
  const [exportCopied, setExportCopied] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [selectedTicketIdx, setSelectedTicketIdx] = useState(0)
  const [allParsedTickets, setAllParsedTickets] = useState<ParsedTicket[]>([])

  const hasExistingData = Boolean(draft.customerName || draft.location || draft.dealerName)

  // ─── Import Flow ──────────────────────────────────────────────────────

  const handleParseAndPreview = useCallback(() => {
    if (!text.trim()) return

    const tickets = parseTicketText(text)
    if (tickets.length === 0) {
      setPanelState('error')
      setValidation({
        valid: false,
        fieldsDetected: 0,
        fieldsMapped: 0,
        missingRequired: [],
        ignoredFields: [],
        warnings: ['Could not parse any ticket from the pasted text. Make sure each field is on its own line in "Label: Value" format.'],
      })
      return
    }

    setAllParsedTickets(tickets)
    setSelectedTicketIdx(0)
    showPreviewForTicket(tickets[0])
  }, [text])

  const showPreviewForTicket = (ticket: ParsedTicket) => {
    const { updates, validation: val } = mapTicketToDraft(ticket)
    setParsedTicket(ticket)
    setValidation(val)
    setImportUpdates(updates)
    setPanelState('preview')
  }

  const handleSelectTicket = (idx: number) => {
    setSelectedTicketIdx(idx)
    if (allParsedTickets[idx]) {
      showPreviewForTicket(allParsedTickets[idx])
    }
  }

  const handleConfirmImport = () => {
    if (!importUpdates) return
    onImport(importUpdates)
    setPanelState('success')
    setTimeout(() => setPanelState('idle'), 3000)
  }

  const handleCancelPreview = () => {
    setPanelState('idle')
    setParsedTicket(null)
    setValidation(null)
    setImportUpdates(null)
  }

  // ─── Export ───────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const ticketText = serializeTicketToText(draft, 1)
    try {
      await navigator.clipboard.writeText(ticketText)
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 2500)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = ticketText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 2500)
    }
  }, [draft])

  const handleDownload = useCallback(() => {
    const ticketText = serializeTicketToText(draft, 1)
    const blob = new Blob([ticketText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ticket-${draft.customerName || 'export'}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [draft])

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ borderLeft: `1px solid ${border}` }}>
      {/* Panel Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-4 py-2.5 shrink-0 select-none"
        style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0f172a' }}
      >
        <div className="flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-emerald-500" />
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: textPrimary }}>
            Import / Export
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: textMuted }} /> : <ChevronDown className="w-4 h-4" style={{ color: textMuted }} />}
      </button>

      {!expanded && <div className="flex-1" />}

      {expanded && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* ─── Success Feedback ─── */}
          {panelState === 'success' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: isLight ? '#f0fdf4' : 'rgba(16,185,129,0.1)', border: `1px solid ${isLight ? '#86efac' : 'rgba(16,185,129,0.3)'}` }}>
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <p className="text-[11px] font-bold" style={{ color: '#10B981' }}>Ticket data imported successfully.</p>
                <p className="text-[10px]" style={{ color: textMuted }}>{validation?.fieldsMapped || 0} fields populated.</p>
              </div>
            </div>
          )}

          {/* ─── Error Feedback ─── */}
          {panelState === 'error' && validation && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: isLight ? '#fef2f2' : 'rgba(239,68,68,0.08)', border: `1px solid ${isLight ? '#fecaca' : 'rgba(239,68,68,0.25)'}` }}>
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-red-600">Import failed</p>
                {validation.warnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-red-500">{w}</p>
                ))}
              </div>
            </div>
          )}

          {/* ─── Preview State ─── */}
          {panelState === 'preview' && importUpdates && validation && (
            <div className="space-y-2.5">
              {/* Multi-ticket selector */}
              {allParsedTickets.length > 1 && (
                <div className="flex gap-1.5 flex-wrap">
                  {allParsedTickets.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectTicket(i)}
                      className="px-2 py-1 rounded text-[10px] font-bold border transition-colors"
                      style={{
                        backgroundColor: i === selectedTicketIdx ? '#10B981' : inputBg,
                        borderColor: i === selectedTicketIdx ? '#10B981' : inputBorder,
                        color: i === selectedTicketIdx ? 'white' : textMuted,
                      }}
                    >
                      Ticket {t.ticketNumber}
                    </button>
                  ))}
                </div>
              )}

              <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
                <p className="text-[11px] font-bold" style={{ color: textPrimary }}>Import Preview</p>

                {/* Field Preview */}
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {Object.entries(importUpdates).slice(0, 12).map(([key, val]) => {
                    if (!val || (Array.isArray(val) && val.every((v) => !v))) return null
                    const displayVal = Array.isArray(val) ? val.join(', ') : String(val)
                    if (!displayVal) return null
                    return (
                      <div key={key} className="flex justify-between gap-2">
                        <span className="text-[9px] font-bold uppercase" style={{ color: textMuted }}>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-[10px] font-medium truncate max-w-[140px]" style={{ color: textPrimary }}>{displayVal}</span>
                      </div>
                    )
                  })}
                </div>

                <p className="text-[10px] font-semibold" style={{ color: '#10B981' }}>
                  {validation.fieldsMapped} field{validation.fieldsMapped !== 1 ? 's' : ''} detected.
                </p>

                {/* Warnings */}
                {validation.missingRequired.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[9px]" style={{ color: textMuted }}>
                      Missing: {validation.missingRequired.join(', ')}
                    </p>
                  </div>
                )}

                {validation.ignoredFields.length > 0 && (
                  <p className="text-[9px]" style={{ color: textMuted }}>
                    Ignored: {validation.ignoredFields.join(', ')}
                  </p>
                )}

                {hasExistingData && (
                  <p className="text-[9px] font-semibold text-amber-600">
                    ⚠ This will replace existing ticket form values.
                  </p>
                )}
              </div>

              {/* Confirm / Cancel */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancelPreview}
                  className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold border"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  className="flex-1 px-3 py-2 rounded-lg text-[10px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                >
                  Import & Fill Form
                </button>
              </div>
            </div>
          )}

          {/* ─── Textarea + Actions (idle state) ─── */}
          {(panelState === 'idle' || panelState === 'success') && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Paste Ticket Data
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder={`Ticket 1: CUSTOMER NAME\nTicket Type: DONE INSTALL\nStatus: Closing\nCustomer Name: ...\nContact Number: ...\nAddress: ...\n...`}
                  className={`${compactInput} resize-none w-full text-[11px] font-mono normal-case`}
                  style={{
                    backgroundColor: inputBg,
                    borderColor: inputBorder,
                    color: textPrimary,
                    textTransform: 'none',
                    minHeight: '140px',
                  }}
                />
              </div>

              {/* Import Button */}
              <button
                type="button"
                onClick={handleParseAndPreview}
                disabled={!text.trim()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold text-white transition-all disabled:opacity-40"
                style={{ background: text.trim() ? 'linear-gradient(135deg, #10B981, #059669)' : undefined, backgroundColor: text.trim() ? undefined : (isLight ? '#e2e8f0' : '#1e293b') }}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Import / Fill Form
              </button>

              {/* Divider */}
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px" style={{ backgroundColor: border }} />
                <span className="text-[9px] font-bold uppercase" style={{ color: textMuted }}>or export</span>
                <div className="flex-1 h-px" style={{ backgroundColor: border }} />
              </div>

              {/* Export Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold border transition-colors"
                  style={{ borderColor: inputBorder, color: exportCopied ? '#10B981' : textPrimary, backgroundColor: cardBg }}
                >
                  {exportCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {exportCopied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
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
