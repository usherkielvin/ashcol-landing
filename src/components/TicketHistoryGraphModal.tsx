import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { X, GitCommit, Clock, User, Calendar } from 'lucide-react'
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
}

export default function TicketHistoryGraphModal({ ticket, isOpen, onClose }: TicketHistoryGraphModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  const cardBg = isLight ? '#ffffff' : '#1e293b'
  const border = isLight ? '#e5e7eb' : '#374151'
  const textPrimary = isLight ? '#111827' : '#f9fafb'
  const textMuted = isLight ? '#6b7280' : '#9ca3af'
  const textSecondary = isLight ? '#4b5563' : '#d1d5db'

  useEffect(() => {
    if (!isOpen || !ticket.id) return

    const fetchHistory = async () => {
      setLoading(true)
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
        const response = await fetch(`${API_BASE_URL}/tickets/${ticket.id}/history`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (response.ok) {
          const result = await response.json()
          if (result.success && Array.isArray(result.data)) {
            setHistory(result.data)
          } else {
            setHistory([])
          }
        } else {
          setHistory([])
        }
      } catch (err) {
        console.error('Error fetching ticket history:', err)
        setHistory([])
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [isOpen, ticket.id])

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffHours / 24)
      
      if (diffDays > 7) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      } else if (diffDays > 0) {
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
      } else if (diffHours > 0) {
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
      } else {
        return 'Just now'
      }
    } catch {
      return dateString
    }
  }

  const parseCommitMessage = (entry: HistoryEntry) => {
    let fullMessage = entry.changeNote || entry.note || entry.description || entry.remarks || entry.reason || entry.action || 'Updated ticket'
    
    // Remove ALL bracketed content first
    fullMessage = fullMessage.replace(/\s*\[[^\]]+\]/g, '').trim()
    
    // Extract action phrases that should be in separate boxes
    const actionPhrases = [
      'Details updated',
      'AC details updated', 
      'Description updated',
      'Location updated',
      'Service type updated',
      'Dealer set to',
      'Store referral fee set to',
      'Negotiator set to'
    ]
    
    let cleanMessage = fullMessage
    const extractedActions: string[] = []
    
    // Extract action phrases
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
    
    // Clean up extra spaces and punctuation
    cleanMessage = cleanMessage
      .replace(/\s+/g, ' ')
      .replace(/\.\s*\./g, '.')
      .replace(/\s*\.\s*$/, '.')
      .trim()
    
    // Check if message is essentially empty after cleaning
    if (!cleanMessage || cleanMessage === '.' || cleanMessage === 'Updated ticket') {
      return {
        commitLines: ['No remarks'],
        extractedActions
      }
    }
    
    // Split message into logical bullet points like Git commits
    const commitLines: string[] = []
    
    // Check for rescheduling pattern
    const rescheduleMatch = cleanMessage.match(/rescheduled\s+from\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i)
    if (rescheduleMatch) {
      const [, fromDate, toDate] = rescheduleMatch
      commitLines.push(`Rescheduled from ${fromDate} to ${toDate}`)
      // Remove this from the message
      cleanMessage = cleanMessage.replace(rescheduleMatch[0], '').replace(/^\s*\.\s*/, '').trim()
    }
    
    // Check for title changes
    const titleMatch = cleanMessage.match(/title\s+set\s+to\s+'([^']+)'/i)
    if (titleMatch) {
      commitLines.push(`Title set to '${titleMatch[1]}'`)
      // Remove this from the message  
      cleanMessage = cleanMessage.replace(titleMatch[0], '').replace(/^\s*\.\s*/, '').trim()
    }
    
    // Check for service type changes
    const serviceMatch = cleanMessage.match(/service\s+type\s+set\s+to\s+([^.]+)/i)
    if (serviceMatch) {
      commitLines.push(`Service type set to ${serviceMatch[1].trim()}`)
      // Remove this from the message
      cleanMessage = cleanMessage.replace(serviceMatch[0], '').replace(/^\s*\.\s*/, '').trim()
    }
    
    // Check for final date changes
    const finalDateMatch = cleanMessage.match(/final\s+date\s+set\s+to\s+(\d{4}-\d{2}-\d{2})/i)
    if (finalDateMatch) {
      commitLines.push(`Final date set to ${finalDateMatch[1]}`)
      // Remove this from the message
      cleanMessage = cleanMessage.replace(finalDateMatch[0], '').replace(/^\s*\.\s*/, '').trim()
    }
    
    // If there's any remaining meaningful text, add it as a line
    if (cleanMessage && cleanMessage !== '.' && cleanMessage.length > 3) {
      commitLines.push(cleanMessage)
    }
    
    // If no structured lines found, just use the whole message
    if (commitLines.length === 0) {
      commitLines.push(fullMessage)
    }
    
    return {
      commitLines,
      extractedActions
    }
  }

  const getAuthorName = (entry: HistoryEntry) => {
    const actor = entry.changedByUserName || entry.actorName || entry.changed_by || entry.createdBy || 'System'
    return actor.split(' ')[0].toUpperCase() // Take first name and uppercase like the original
  }

  const getTimestamp = (entry: HistoryEntry) => {
    return entry.createdAt || entry.created_at || new Date().toISOString()
  }

  if (!isOpen) return null

  const ticketNumber = ticket.ticketNumber || ticket.ticket_number || 'Unknown'

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg max-h-[80vh] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - like VS Code */}
        <div 
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ 
            borderColor: border,
            backgroundColor: isLight ? '#f8fafc' : '#0f172a'
          }}
        >
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4" style={{ color: '#10B981' }} />
            <span className="text-sm font-semibold" style={{ color: textPrimary }}>
              Commit History
            </span>
            <span className="text-xs px-2 py-1 rounded" style={{ 
              backgroundColor: isLight ? '#e5e7eb' : '#374151',
              color: textMuted 
            }}>
              {ticketNumber}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-500/10 transition-colors"
            style={{ color: textMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Git-style commit list */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: isLight ? '#fafafa' : '#111827' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="w-4 h-4 animate-spin mr-2" style={{ color: '#10B981' }} />
              <span className="text-sm" style={{ color: textMuted }}>Loading commits...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-50" style={{ color: textMuted }} />
              <div className="text-sm" style={{ color: textMuted }}>No commits yet</div>
            </div>
          ) : (
            <div className="py-2">
              {[...history].sort(
                (a, b) => new Date(b.createdAt || b.created_at || Date.now()).getTime() - new Date(a.createdAt || a.created_at || Date.now()).getTime()
              ).map((entry, index) => {
                const safeEntry = {
                  id: entry?.id || `commit-${index}`,
                  ...entry
                }
                
                const { commitLines, extractedActions } = parseCommitMessage(safeEntry)
                const authorName = getAuthorName(safeEntry)
                const timestamp = getTimestamp(safeEntry)
                const isLast = index === history.length - 1
                const isFirst = index === 0
                
                // Get action type for the badge (keep the original oval badges only)
                const actionType = entry.newStatus || entry.action || 'UPDATE'
                
                return (
                  <div key={safeEntry.id} className="relative pb-4">
                    {/* Commit line */}
                    <div className="flex items-start px-4 py-3 hover:bg-slate-500/5 transition-colors">
                      {/* Git graph line - FIXED to actually connect */}
                      <div className="relative mr-3 flex flex-col items-center" style={{ width: '20px' }}>
                        {/* Line coming from above (except first commit) */}
                        {!isFirst && (
                          <div 
                            className="w-px h-3"
                            style={{ 
                              backgroundColor: isLight ? '#9ca3af' : '#6b7280'
                            }}
                          />
                        )}
                        
                        {/* Commit dot */}
                        <div 
                          className="w-2.5 h-2.5 rounded-full border-2 shrink-0 relative z-10"
                          style={{ 
                            backgroundColor: isFirst ? '#10B981' : '#6b7280',
                            borderColor: isFirst ? '#10B981' : '#6b7280'
                          }}
                        />
                        
                        {/* Line going to below (except last commit) */}
                        {!isLast && (
                          <div 
                            className="w-px flex-1 mt-1"
                            style={{ 
                              backgroundColor: isLight ? '#9ca3af' : '#6b7280',
                              minHeight: '60px'
                            }}
                          />
                        )}
                      </div>

                      {/* Commit info */}
                      <div className="flex-1 min-w-0" style={{ paddingTop: isFirst ? '0' : '3px' }}>
                        {/* Commit message with Git-style bullet points */}
                        <div className="text-sm font-medium mb-2" style={{ color: textPrimary }}>
                          {commitLines.map((line, lineIdx) => (
                            <div key={`line-${lineIdx}`} className="flex items-start gap-2 mb-1">
                              <span className="text-green-400 mt-0.5">•</span>
                              <span className="flex-1">
                                {/* Parse each line for dates and quoted text */}
                                {line.split(/(\d{4}-\d{2}-\d{2}|'[^']*')/).map((part, partIdx) => {
                                  if (!part) return null
                                  
                                  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(part)
                                  const isQuoted = /^'[^']*'$/.test(part)
                                  
                                  if (isDate || isQuoted) {
                                    return (
                                      <span
                                        key={`part-${partIdx}`}
                                        className="inline-block text-xs px-2 py-0.5 rounded font-mono mx-1"
                                        style={{
                                          backgroundColor: isDate
                                            ? (isLight ? '#fef3c7' : 'rgba(245, 158, 11, 0.2)') // Date - amber
                                            : (isLight ? '#f0fdf4' : 'rgba(34, 197, 94, 0.2)'), // Quoted - green
                                          color: isDate
                                            ? (isLight ? '#92400e' : '#fbbf24')
                                            : (isLight ? '#166534' : '#22c55e'),
                                          border: `1px solid ${isDate
                                            ? (isLight ? '#f59e0b' : 'rgba(245, 158, 11, 0.3)')
                                            : (isLight ? '#22c55e' : 'rgba(34, 197, 94, 0.3)')}`
                                        }}
                                      >
                                        {part}
                                      </span>
                                    )
                                  }
                                  
                                  return <span key={`part-${partIdx}`}>{part}</span>
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                        
                        {/* Author and time */}
                        <div className="flex items-center gap-3 text-xs mb-2" style={{ color: textMuted }}>
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{authorName}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{formatTime(timestamp)}</span>
                          </div>
                        </div>

                        {/* Status badges and extracted actions side by side */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Action type badge - original oval ones */}
                          <span 
                            className="inline-block text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: isLight ? '#dcfce7' : 'rgba(34, 197, 94, 0.2)',
                              color: isLight ? '#166534' : '#22c55e'
                            }}
                          >
                            {actionType}
                          </span>
                          
                          {/* Extracted actions in colored boxes */}
                          {extractedActions.map((action, idx) => (
                            <span
                              key={`action-${idx}`}
                              className="inline-block text-xs px-2 py-0.5 rounded font-medium"
                              style={{
                                backgroundColor: isLight ? '#e0f2fe' : 'rgba(14, 165, 233, 0.2)',
                                color: isLight ? '#0369a1' : '#38bdf8',
                                border: `1px solid ${isLight ? '#0ea5e9' : 'rgba(14, 165, 233, 0.3)'}`
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

        {/* Footer - like VS Code */}
        <div 
          className="px-4 py-2 border-t text-xs"
          style={{ 
            borderColor: border,
            backgroundColor: isLight ? '#f8fafc' : '#0f172a',
            color: textMuted
          }}
        >
          {history.length} commit{history.length === 1 ? '' : 's'}
        </div>
      </div>
    </div>,
    document.body
  )
}