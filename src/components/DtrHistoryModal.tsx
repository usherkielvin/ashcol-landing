import { useEffect, useState } from 'react'
import { ChevronDown, History as HistoryIcon, X } from 'lucide-react'
import { API_BASE_URL } from '../utils/api'
import { EmployeeNameLink } from './EmployeeNameLink'

// One revision of a DTR — GET /v1/reports/branch-daily/{id}/history, newest first
export interface DtrHistoryEntry {
  id: string
  action: 'CREATED' | 'EDITED' | 'AUDIT_SAVE' | string
  editedBy?: string | null
  createdAt: string
  previousSnapshot?: string | null
  newSnapshot?: string | null
}

const ACTION_META: Record<string, { label: string; bg: string; text: string }> = {
  CREATED: { label: 'Created', bg: 'rgba(16,185,129,0.12)', text: '#059669' },
  EDITED: { label: 'Edited', bg: 'rgba(245,158,11,0.14)', text: '#B45309' },
  AUDIT_SAVE: { label: 'Audit Save', bg: 'rgba(59,130,246,0.14)', text: '#1D4ED8' },
}

/** Every DTR create/edit/audit-save button (DTR_Form, DailyAuditReport) opens this same panel. */
export function DtrHistoryModal({
  open,
  onClose,
  reportId,
  isLight,
  border,
  textPrimary,
  textMuted,
}: {
  open: boolean
  onClose: () => void
  reportId: string | null | undefined
  isLight: boolean
  border: string
  textPrimary: string
  textMuted: string
}) {
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<DtrHistoryEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !reportId) return
    let cancelled = false
    setLoading(true)
    setExpandedId(null)
    const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
    fetch(`${API_BASE_URL}/v1/reports/branch-daily/${reportId}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load history (HTTP ${res.status})`)
        return res.json()
      })
      .then(data => { if (!cancelled) setEntries(Array.isArray(data) ? data : []) })
      .catch(err => {
        console.error('[DtrHistoryModal] Error:', err)
        if (!cancelled) setEntries([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, reportId])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: isLight ? '#ffffff' : '#0B1524', borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: border }}>
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-4 h-4" style={{ color: textMuted }} />
            <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: textPrimary }}>Revision History</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-500/10">
            <X className="w-4 h-4" style={{ color: textMuted }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-xs font-semibold text-center py-6" style={{ color: textMuted }}>Loading history…</p>
          ) : entries.length === 0 ? (
            <p className="text-xs font-semibold text-center py-6" style={{ color: textMuted }}>No revisions recorded for this DTR yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map(entry => {
                const meta = ACTION_META[entry.action] || { label: entry.action, bg: 'rgba(100,116,139,0.14)', text: '#475569' }
                const isExpanded = expandedId === entry.id
                let previousValues: Record<string, unknown> = {}
                let newValues: Record<string, unknown> = {}
                try {
                  if (entry.previousSnapshot) previousValues = JSON.parse(entry.previousSnapshot)
                } catch { /* ignore malformed snapshot */ }
                try {
                  if (entry.newSnapshot) newValues = JSON.parse(entry.newSnapshot)
                } catch { /* ignore malformed snapshot */ }
                const fieldKeys = Array.from(new Set([...Object.keys(previousValues), ...Object.keys(newValues)]))
                const diffRows = fieldKeys
                  .map(key => ({
                    key,
                    before: previousValues[key],
                    after: newValues[key],
                    changed: String(previousValues[key] ?? '') !== String(newValues[key] ?? ''),
                  }))
                  .filter(row => (row.before !== null && row.before !== '' && row.before !== undefined)
                    || (row.after !== null && row.after !== '' && row.after !== undefined))
                const hasDiff = diffRows.length > 0
                return (
                  <div key={entry.id} className="rounded-xl border" style={{ borderColor: border }}>
                    <button
                      type="button"
                      onClick={() => hasDiff && setExpandedId(isExpanded ? null : entry.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left ${hasDiff ? 'cursor-pointer hover:bg-slate-500/5' : 'cursor-default'}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: meta.bg, color: meta.text }}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[11px] font-semibold truncate" style={{ color: textPrimary }}>
                          {entry.editedBy ? <EmployeeNameLink nameOrId={entry.editedBy} /> : 'Unknown'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-semibold" style={{ color: textMuted }}>
                          {new Date(entry.createdAt).toLocaleString('en-PH', {
                            month: 'short', day: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', hour12: true,
                          })}
                        </span>
                        {hasDiff && (
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
                        )}
                      </div>
                    </button>
                    {isExpanded && hasDiff && (
                      <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: border }}>
                        <div className="grid gap-1 mt-1.5" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Field</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                            {entry.action === 'CREATED' ? '—' : 'Previous'}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Revised To</span>
                          {diffRows.map(({ key, before, after, changed }) => (
                            <div key={key} className="contents">
                              <span className="text-[10.5px] font-semibold truncate py-0.5" style={{ color: textMuted }}>{key}</span>
                              <span
                                className="text-[10.5px] font-bold truncate py-0.5"
                                style={{ color: changed ? '#B45309' : textPrimary }}
                              >
                                {before !== null && before !== undefined && before !== '' ? String(before) : '—'}
                              </span>
                              <span
                                className="text-[10.5px] font-bold truncate py-0.5"
                                style={{ color: changed ? '#059669' : textPrimary }}
                              >
                                {after !== null && after !== undefined && after !== '' ? String(after) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
