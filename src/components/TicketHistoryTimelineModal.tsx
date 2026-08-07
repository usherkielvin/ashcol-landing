import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { X, GitBranch, MessageCircle, User, Calendar, Loader2, Clock } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'

interface HistoryEntry {
  id: string
  action: string
  description: string
  performedBy: string
  performedAt: string
  details?: Record<string, any>
  remarks?: string
  oldValue?: string
  newValue?: string
  fieldName?: string
}

interface Ticket {
  id: string
  ticketNumber?: string
  ticket_number?: string
  customerName?: string
  customer_name?: string
}

interface TicketHistoryTimelineModalProps {
  ticket: Ticket
  isOpen: boolean
  onClose: () => void
}

export default function TicketHistoryTimelineModal({ ticket, isOpen, onClose }: TicketHistoryTimelineModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#e2e8f0' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const textSecondary = isLight ? '#475569' : '#cbd5e1'
  const green = '#10B981'
  const blue = '#3B82F6'
  const amber = '#F59E0B'
  const red = '#EF4444'

  useEffect(() => {
    if (!isOpen || !ticket.id) return

    const fetchHistory = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
        const response = await fetch(`${API_BASE_URL}/tickets/${ticket.id}/history`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (!response.ok) {
          throw new Error('Failed to fetch ticket history')
        }

        const result = await response.json()
        if (result.success && Array.isArray(result.data)) {
          setHistory(result.data)
        } else {
          setHistory([])
        }
      } catch (err) {
        console.error('Error fetching ticket history:', err)
        setError('Failed to load ticket history')
        setHistory([])
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [isOpen, ticket.id])

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } catch {
      return ''
    }
  }

  const getActionIcon = (action: string) => {
    const actionLower = (action || '').toLowerCase()
    if (actionLower.includes('created') || actionLower.includes('added')) {
      return <GitBranch className="w-4 h-4" style={{ color: green }} />
    }
    if (actionLower.includes('comment') || actionLower.includes('remark')) {
      return <MessageCircle className="w-4 h-4" style={{ color: blue }} />
    }
    if (actionLower.includes('assigned') || actionLower.includes('updated')) {
      return <User className="w-4 h-4" style={{ color: amber }} />
    }
    if (actionLower.includes('completed') || actionLower.includes('closed')) {
      return <GitBranch className="w-4 h-4" style={{ color: green }} />
    }
    if (actionLower.includes('cancelled') || actionLower.includes('deleted')) {
      return <X className="w-4 h-4" style={{ color: red }} />
    }
    return <Clock className="w-4 h-4" style={{ color: textMuted }} />
  }

  const getActionColor = (action: string) => {
    const actionLower = (action || '').toLowerCase()
    if (actionLower.includes('created') || actionLower.includes('completed')) return green
    if (actionLower.includes('cancelled') || actionLower.includes('deleted')) return red
    if (actionLower.includes('assigned') || actionLower.includes('updated')) return amber
    return blue
  }

  if (!isOpen) return null

  const ticketNumber = ticket.ticketNumber || ticket.ticket_number || ticket.id?.slice(0, 8) || 'Unknown'
  const customerName = ticket.customerName || ticket.customer_name || 'Unknown Customer'

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: border }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: textPrimary }}>
              Ticket History
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold" style={{ color: green }}>
                {ticketNumber}
              </span>
              <span style={{ color: textMuted }}>•</span>
              <span className="text-sm" style={{ color: textSecondary }}>
                {customerName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-500/10 transition-colors"
            style={{ color: textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: green }} />
              <span className="ml-3 text-sm" style={{ color: textMuted }}>
                Loading history...
              </span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-sm font-medium" style={{ color: red }}>
                {error}
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" style={{ color: textMuted }} />
              <div className="text-sm font-medium" style={{ color: textMuted }}>
                No history available
              </div>
              <div className="text-xs mt-1" style={{ color: textMuted }}>
                This ticket has no recorded changes
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((entry, index) => {
                // Safety check for entry properties
                const safeEntry = {
                  id: entry?.id || `entry-${index}`,
                  action: entry?.action || 'Unknown Action',
                  performedBy: entry?.performedBy || 'Unknown User',
                  performedAt: entry?.performedAt || new Date().toISOString(),
                  description: entry?.description || '',
                  remarks: entry?.remarks || '',
                  fieldName: entry?.fieldName || '',
                  oldValue: entry?.oldValue,
                  newValue: entry?.newValue
                }
                
                return (
                  <div key={safeEntry.id} className="flex gap-4">
                    {/* Timeline line and icon */}
                    <div className="flex flex-col items-center">
                      <div 
                        className="flex items-center justify-center w-8 h-8 rounded-full border-2"
                        style={{ 
                          backgroundColor: cardBg,
                          borderColor: getActionColor(safeEntry.action)
                        }}
                      >
                        {getActionIcon(safeEntry.action)}
                      </div>
                      {index < history.length - 1 && (
                        <div 
                          className="w-px h-8 mt-2"
                          style={{ backgroundColor: border }}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-6">
                      <div className="flex items-center gap-2 mb-1">
                        <span 
                          className="text-sm font-semibold"
                          style={{ color: getActionColor(safeEntry.action) }}
                        >
                          {safeEntry.action}
                        </span>
                        <span className="text-xs" style={{ color: textMuted }}>
                          by {safeEntry.performedBy}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-3 h-3" style={{ color: textMuted }} />
                        <span className="text-xs" style={{ color: textMuted }}>
                          {formatDate(safeEntry.performedAt)} at {formatTime(safeEntry.performedAt)}
                        </span>
                      </div>

                      {safeEntry.description && (
                        <div 
                          className="text-sm mb-2"
                          style={{ color: textSecondary }}
                        >
                          {safeEntry.description}
                        </div>
                      )}

                      {safeEntry.remarks && (
                        <div 
                          className="text-sm p-3 rounded-lg"
                          style={{ 
                            backgroundColor: isLight ? '#f8fafc' : '#1e293b',
                            border: `1px solid ${border}`
                          }}
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: textMuted }}>
                            Remarks
                          </div>
                          <div style={{ color: textPrimary }}>
                            {safeEntry.remarks}
                          </div>
                        </div>
                      )}

                      {safeEntry.fieldName && safeEntry.oldValue !== undefined && safeEntry.newValue !== undefined && (
                        <div 
                          className="text-xs p-2 rounded border"
                          style={{ backgroundColor: isLight ? '#fefce8' : '#1f2937', borderColor: amber }}
                        >
                          <span style={{ color: textMuted }}>
                            {safeEntry.fieldName}: 
                          </span>
                          <span 
                            className="mx-1 px-1 rounded"
                            style={{ backgroundColor: isLight ? '#fee2e2' : '#7f1d1d', color: red }}
                          >
                            {safeEntry.oldValue || '(empty)'}
                          </span>
                          →
                          <span 
                            className="mx-1 px-1 rounded"
                            style={{ backgroundColor: isLight ? '#dcfce7' : '#14532d', color: green }}
                          >
                            {safeEntry.newValue || '(empty)'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {/* Simplified test content */}
        <div className="p-6">
          <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 'bold' }}>
            TEST MODAL - Ticket History
          </h2>
          <p style={{ color: textMuted, marginTop: '8px' }}>
            Ticket: {ticketNumber} - {customerName}
          </p>
          <button 
            onClick={onClose}
            style={{ 
              marginTop: '16px', 
              padding: '8px 16px', 
              backgroundColor: green, 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Close Modal
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}