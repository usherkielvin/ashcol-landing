import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import ReactDOM from 'react-dom'
import { X, GitCommit, Clock, User, Calendar, Send } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'

interface HistoryEntry {
  id: string
  changeNote?: string
  note?: string
  description?: string
  remarks?: string
  reason?: string
  action?: string
  changedByUserName?: string
  actorName?: string
  changed_by?: string
  createdBy?: string
  createdAt?: string
  created_at?: string
  newStatus?: string
  previousStatus?: string
  newPreferredDate?: string
  previousPreferredDate?: string
}

interface Ticket {
  id: string
  ticketNumber?: string
  ticket_number?: string
  customerName?: string
  customer_name?: string
}

interface TicketHistoryGraphModalProps {
  ticket: Ticket
  isOpen: boolean
  onClose: () => void
  onRemarkSubmitted?: (ticketId: string, remark: string) => void
}

/** Format a raw YYYY-MM-DD string to AUG-16-2026 */
function formatDateBadge(raw: string): string {
  try {
    const d = new Date(raw + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return raw
    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
    const day   = String(d.getDate()).padStart(2, '0')
    const year  = d.getFullYear()
    return `${month}-${day}-${year}`
  } catch {
    return raw
  }
}

/** Format a full ISO timestamp to AUG-10-2026  4:44 PM */
function formatTimestamp(dateString: string): string {
  try {
    const d = new Date(dateString)
    if (Number.isNaN(d.getTime())) return dateString
    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
    const day   = String(d.getDate()).padStart(2, '0')
    const year  = d.getFullYear()
    const time  = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${month}-${day}-${year}  ${time}`
  } catch {
    return dateString
  }
}

export default function TicketHistoryGraphModal({
  ticket,
  isOpen,
  onClose,
  onRemarkSubmitted,
}: TicketHistoryGraphModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [remark, setRemark] = useState('')
  const [submittingRemark, setSubmittingRemark] = useState(false)
  const [remarkError, setRemarkError] = useState<string | null>(null)
  const historyListRef = useRef<HTMLDivElement>(null)
  const remarkInputRef = useRef<HTMLTextAreaElement>(null)

  const cardBg      = isLight ? '#ffffff' : '#1e293b'
  const border      = isLight ? '#e2e8f0' : '#334155'
  const textPrimary = isLight ? '#0f172a' : '#f1f5f9'
  const textMuted   = isLight ? '#475569' : '#94a3b8'
  const headerBg    = isLight ? '#f8fafc' : '#0f172a'
  const bodyBg      = isLight ? '#f9fafb' : '#111827'

  const loadHistory = useCallback(async (showLoading = true) => {
    if (!ticket.id) return
    if (showLoading) setLoading(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const response = await fetch(`${API_BASE_URL}/tickets/${ticket.id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        const result = await response.json()
        setHistory(result.success && Array.isArray(result.data) ? result.data : [])
      } else {
        setHistory([])
      }
    } catch (err) {
      console.error('Error fetching ticket history:', err)
      setHistory([])
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [ticket.id])

  useEffect(() => { if (isOpen) void loadHistory() }, [isOpen, loadHistory])

  useEffect(() => {
    if (!isOpen) return
    const t = window.setTimeout(() => remarkInputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || loading) return
    const frame = window.requestAnimationFrame(() => {
      if (historyListRef.current) historyListRef.current.scrollTop = historyListRef.current.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [history, isOpen, loading])

  const submitRemark = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedRemark = remark.trim()
    if (!trimmedRemark || submittingRemark) return
    setSubmittingRemark(true)
    setRemarkError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const response = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarksUpdate: trimmedRemark }),
      })
      if (!response.ok) throw new Error('Failed to save remark')
      onRemarkSubmitted?.(ticket.id, trimmedRemark)
      setRemark('')
      await loadHistory(false)
      remarkInputRef.current?.focus()
    } catch (err) {
      console.error('Error saving ticket remark:', err)
      setRemarkError('Unable to save the update. Please try again.')
    } finally {
      setSubmittingRemark(false)
    }
  }

  const parseCommitMessage = (entry: HistoryEntry) => {
    let fullMessage =
      entry.changeNote || entry.note || entry.description ||
      entry.remarks || entry.reason || entry.action || 'Updated ticket'

    fullMessage = fullMessage.replace(/\s*\[[^\]]+\]/g, '').trim()

    const actionPhrases = [
      'Details updated', 'AC details updated', 'Description updated',
      'Location updated', 'Service type updated', 'Dealer set to',
      'Store referral fee set to', 'Negotiator set to',
    ]
    let cleanMessage = fullMessage
    const extractedActions: string[] = []

    actionPhrases.forEach(phrase => {
      const regex = new RegExp(`\\b${phrase}[^.]*\\.?`, 'gi')
      const matches = cleanMessage.match(regex)
      if (matches) {
        matches.forEach(match => {
          extractedActions.push(match.replace(/\.$/, '').trim())
          cleanMessage = cleanMessage.replace(match, '').trim()
        })
      }
    })

    cleanMessage = cleanMessage.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').replace(/\s*\.\s*$/, '.').trim()

    if (!cleanMessage || cleanMessage === '.' || cleanMessage === 'Updated ticket') {
      return { commitLines: ['No remarks'], extractedActions }
    }

    const commitLines: string[] = []

    const rescheduleMatch = cleanMessage.match(
      /rescheduled\s+from\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i
    )
    if (rescheduleMatch) {
      const [, fromDate, toDate] = rescheduleMatch
      commitLines.push(`Rescheduled from ${fromDate} to ${toDate}`)
      cleanMessage = cleanMessage.replace(rescheduleMatch[0], '').replace(/^\s*\.\s*/, '').trim()
    }

    const titleMatch = cleanMessage.match(/title\s+set\s+to\s+'([^']+)'/i)
    if (titleMatch) {
      commitLines.push(`Title set to '${titleMatch[1]}'`)
      cleanMessage = cleanMessage.replace(titleMatch[0], '').replace(/^\s*\.\s*/, '').trim()
    }

    const serviceMatch = cleanMessage.match(/service\s+type\s+set\s+to\s+([^.]+)/i)
    if (serviceMatch) {
      commitLines.push(`Service type set to ${serviceMatch[1].trim()}`)
      cleanMessage = cleanMessage.replace(serviceMatch[0], '').replace(/^\s*\.\s*/, '').trim()
    }

    const finalDateMatch = cleanMessage.match(/final\s+date\s+set\s+to\s+(\d{4}-\d{2}-\d{2})/i)
    if (finalDateMatch) {
      commitLines.push(`Final date set to ${finalDateMatch[1]}`)
      cleanMessage = cleanMessage.replace(finalDateMatch[0], '').replace(/^\s*\.\s*/, '').trim()
    }

    if (cleanMessage && cleanMessage !== '.' && cleanMessage.length > 3) commitLines.push(cleanMessage)
    if (commitLines.length === 0) commitLines.push(fullMessage)

    return { commitLines, extractedActions }
  }

  const getAuthorName = (entry: HistoryEntry) => {
    const actor = entry.changedByUserName || entry.actorName || entry.changed_by || entry.createdBy || 'System'
    return actor.split(' ')[0].toUpperCase()
  }

  const getTimestamp = (entry: HistoryEntry) =>
    entry.createdAt || entry.created_at || new Date().toISOString()

  if (!isOpen) return null

  const ticketNumber = ticket.ticketNumber || ticket.ticket_number || 'Unknown'

  const renderLineParts = (line: string) =>
    line.split(/(\d{4}-\d{2}-\d{2}|'[^']*')/).map((part, partIdx) => {
      if (!part) return null
      const isDate   = /^\d{4}-\d{2}-\d{2}$/.test(part)
      const isQuoted = /^'[^']*'$/.test(part)
      if (isDate || isQuoted) {
        const display = isDate ? formatDateBadge(part) : part
        return (
          <span
            key={`part-${partIdx}`}
            style={{
              display: 'inline-block',
              fontSize: '0.85rem',
              fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: '2px 8px',
              borderRadius: 6,
              margin: '0 4px',
              backgroundColor: isDate
                ? (isLight ? '#fef3c7' : 'rgba(245,158,11,0.18)')
                : (isLight ? '#f0fdf4'  : 'rgba(34,197,94,0.15)'),
              color: isDate
                ? (isLight ? '#92400e' : '#fbbf24')
                : (isLight ? '#166534' : '#22c55e'),
              border: `1px solid ${isDate
                ? (isLight ? '#f59e0b' : 'rgba(245,158,11,0.35)')
                : (isLight ? '#22c55e' : 'rgba(34,197,94,0.3)')}`,
            }}
          >
            {display}
          </span>
        )
      }
      return <span key={`part-${partIdx}`}>{part}</span>
    })

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: cardBg,
          border: `1.5px solid ${border}`,
          fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: border, backgroundColor: headerBg }}
        >
          <div className="flex items-center gap-3">
            <GitCommit style={{ width: 22, height: 22, color: '#10B981' }} />
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: textPrimary, letterSpacing: '-0.01em' }}>
              Commit History
            </span>
            <span
              style={{
                fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace',
                padding: '2px 10px', borderRadius: 6,
                backgroundColor: isLight ? '#e2e8f0' : '#1e293b',
                color: textMuted, border: `1px solid ${border}`, letterSpacing: '0.06em',
              }}
            >
              {ticketNumber}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors"
            style={{ color: textMuted }}
          >
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Commit list */}
        <div ref={historyListRef} className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: bodyBg }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Clock style={{ width: 20, height: 20, color: '#10B981' }} className="animate-spin mr-3" />
              <span style={{ fontSize: '1rem', color: textMuted }}>Loading commits...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <GitCommit style={{ width: 40, height: 40, margin: '0 auto 10px', opacity: 0.4, color: textMuted }} />
              <div style={{ fontSize: '1rem', color: textMuted }}>No commits yet</div>
            </div>
          ) : (
            <div className="py-3">
              {[...history]
                .sort(
                  (a, b) =>
                    new Date(a.createdAt || a.created_at || Date.now()).getTime() -
                    new Date(b.createdAt || b.created_at || Date.now()).getTime()
                )
                .map((entry, index) => {
                  const safeEntry = { ...entry, id: entry?.id || `commit-${index}` }
                  const { commitLines, extractedActions } = parseCommitMessage(safeEntry)
                  const authorName = getAuthorName(safeEntry)
                  const timestamp  = getTimestamp(safeEntry)
                  const isLast     = index === history.length - 1
                  const actionType = (entry.newStatus || entry.action || 'UPDATE').toUpperCase()

                  return (
                    <div key={safeEntry.id} className="relative pb-2">
                      {!isLast && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute left-[30px] top-[22px] z-0 w-px"
                          style={{ backgroundColor: isLight ? '#cbd5e1' : '#374151', bottom: '-8px' }}
                        />
                      )}
                      <div
                        className="flex items-start gap-4 px-5 py-4 transition-colors"
                        style={{ borderRadius: 8 }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Dot */}
                        <div className="relative z-10 flex w-5 shrink-0 justify-center" style={{ paddingTop: 4 }}>
                          <div
                            style={{
                              width: 13, height: 13, borderRadius: '50%', border: '2.5px solid',
                              backgroundColor: isLast ? '#10B981' : (isLight ? '#94a3b8' : '#475569'),
                              borderColor:     isLast ? '#10B981' : (isLight ? '#94a3b8' : '#475569'),
                            }}
                          />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div style={{ marginBottom: 10 }}>
                            {commitLines.map((line, lineIdx) => (
                              <div
                                key={`line-${lineIdx}`}
                                className="flex items-start gap-2 mb-1"
                                style={{ fontSize: '0.975rem', fontWeight: 600, color: textPrimary, lineHeight: 1.55 }}
                              >
                                <span style={{ color: '#10B981', marginTop: 2, fontSize: '1.1rem' }}>•</span>
                                <span className="flex-1" style={{ display: 'inline' }}>
                                  {renderLineParts(line)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Author + timestamp */}
                          <div
                            className="flex items-center gap-4 mb-3"
                            style={{ fontSize: '0.82rem', color: textMuted, fontWeight: 500 }}
                          >
                            <span className="flex items-center gap-1.5">
                              <User style={{ width: 13, height: 13 }} />
                              {authorName}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Calendar style={{ width: 13, height: 13 }} />
                              {formatTimestamp(timestamp)}
                            </span>
                          </div>

                          {/* Badges */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              style={{
                                fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em',
                                padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase',
                                backgroundColor: isLight ? '#dcfce7' : 'rgba(34,197,94,0.15)',
                                color: isLight ? '#166534' : '#22c55e',
                              }}
                            >
                              {actionType}
                            </span>
                            {extractedActions.map((action, idx) => (
                              <span
                                key={`action-${idx}`}
                                style={{
                                  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em',
                                  padding: '3px 10px', borderRadius: 6, textTransform: 'uppercase',
                                  backgroundColor: isLight ? '#e0f2fe' : 'rgba(14,165,233,0.15)',
                                  color: isLight ? '#0369a1' : '#38bdf8',
                                  border: `1px solid ${isLight ? '#0ea5e9' : 'rgba(14,165,233,0.3)'}`,
                                }}
                              >
                                {action}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        {/* Remark composer */}
        <div
          className="px-5 py-4 border-t"
          style={{ borderColor: border, backgroundColor: headerBg }}
        >
          <form onSubmit={submitRemark} className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="ticket-history-remark" className="sr-only">Add ticket remark</label>
              <textarea
                ref={remarkInputRef}
                id="ticket-history-remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Add an update or remark..."
                rows={2}
                disabled={submittingRemark}
                className="w-full resize-none rounded-lg border px-3.5 py-2.5 outline-none transition-colors focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  fontSize: '0.95rem',
                  backgroundColor: isLight ? '#ffffff' : '#111827',
                  borderColor: border, color: textPrimary, fontFamily: 'inherit',
                }}
              />
              {remarkError && (
                <p className="mt-1 text-sm" role="alert" style={{ color: '#ef4444' }}>
                  {remarkError}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={!remark.trim() || submittingRemark}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontSize: '0.9rem' }}
            >
              <Send style={{ width: 16, height: 16 }} />
              {submittingRemark ? 'Saving...' : 'Send'}
            </button>
          </form>
          <div className="mt-2" style={{ fontSize: '0.8rem', color: textMuted, fontWeight: 500 }}>
            {history.length} commit{history.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
