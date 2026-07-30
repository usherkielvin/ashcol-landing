import { useState, useEffect, useCallback } from 'react'
import { Search, X, Loader2, MapPin, Moon, Sun, Menu, AlertTriangle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import { useOutletContext } from 'react-router-dom'
import SearchResultDetailModal from '../components/SearchResultDetailModal'

interface Ticket {
  id: string
  ticketNumber?: string
  ticket_number?: string
  customerName?: string
  customer_name?: string
  location?: any
  contactPhone?: string
  assignedEmployeeName?: string
  preferredDate?: string
  preferred_date?: string
  status: string
  branchId?: string
  branch_id?: string
  unitType?: string
  acDetails?: string
  serviceType?: string
}

export default function SearchTab() {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'
  const { setSidebarOpen } = useOutletContext<{ setSidebarOpen: (v: boolean) => void }>() || {}

  const [overviewSearchInput, setOverviewSearchInput] = useState('')
  const [overviewSearchFocused, setOverviewSearchFocused] = useState(false)
  const [overviewResults, setOverviewResults] = useState<Ticket[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [selectedResult, setSelectedResult] = useState<any | null>(null)

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const green = '#10B981'

  const fetchOverviewTickets = useCallback(async (query: string) => {
    if (!query.trim()) {
      setOverviewResults([])
      return
    }
    setOverviewLoading(true)
    try {
      const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${tokenStr}` }
      const url = `${API_BASE_URL}/tickets?q=${encodeURIComponent(query)}&size=100`
      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        const list = data?.data?.tickets || data?.tickets || []
        setOverviewResults(list)
      } else {
        console.error('Failed to search tickets:', res.statusText)
      }
    } catch (err) {
      console.error('Error searching tickets:', err)
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  useEffect(() => {
    const trimmed = overviewSearchInput.trim()
    if (!trimmed) {
      setOverviewResults([])
      return
    }

    const timer = setTimeout(() => {
      void fetchOverviewTickets(trimmed)
    }, 300)

    return () => clearTimeout(timer)
  }, [overviewSearchInput, fetchOverviewTickets])

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-black dark:text-white font-semibold rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  const formatAddress = (loc: any) => {
    if (!loc) return '—'
    if (typeof loc === 'string') return loc
    const parts = [loc.addressLine1, loc.barangay, loc.city, loc.province].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : '—'
  }

  const getStatusStyle = (status: string) => {
    const s = (status || '').toUpperCase()
    if (s.includes('COMPLETE')) return { backgroundColor: 'rgba(16,185,129,0.1)', color: '#10B981' }
    if (s.includes('PROGRESS') || s.includes('ASSIGNED')) return { backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }
    if (s.includes('PENDING')) return { backgroundColor: 'rgba(245,158,11,0.1)', color: '#F59E0B' }
    if (s.includes('CANCEL')) return { backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }
    return { backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textMuted }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden relative" style={{ backgroundColor: isLight ? '#f1f5f9' : '#060B18' }}>
      
      {/* Top Header Row with Menu & Branches list */}
      <div className="flex items-center justify-center p-4 md:p-6 pb-2 w-full shrink-0 z-50 relative">
        <button
          onClick={() => setSidebarOpen?.(true)}
          className="md:hidden absolute left-4 p-2.5 rounded-xl border shadow-sm transition-transform active:scale-95 shrink-0 z-10 animate-in fade-in"
          style={{ borderColor: border, backgroundColor: cardBg, color: textPrimary }}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Branches Showcase (Centered) */}
        <div
          className="flex items-center justify-start overflow-x-auto hide-scrollbar py-1 w-full max-w-full"
          style={{ 
            WebkitOverflowScrolling: 'touch', 
            maskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)', 
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)' 
          }}
        >
          <div className="flex items-center justify-center gap-4 px-4 mx-auto w-max">
            {[
              "BATANGAS", "BULACAN", "CANDELARIA", "DASMA, CAVITE", 
              "GENTRI, CAVITE", "LAGUNA", "PAMPANGA", "RIZAL", 
              "SILANG, CAVITE", "TAGUIG", "VALENZUELA"
            ].map((branch, idx, arr) => (
              <div key={branch} className="flex items-center gap-4 shrink-0">
                <span 
                  className="text-[13px] md:text-[16px] font-black uppercase tracking-[0.15em] transition-all"
                  style={{ color: idx % 2 === 0 ? green : textPrimary }}
                >
                  {branch}
                </span>
                {idx < arr.length - 1 && (
                  <span className="text-[10px] opacity-40" style={{ color: textMuted }}>&bull;</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Search Panel */}
      <div className={`flex-1 flex flex-col min-h-0 px-3 md:px-8 bg-transparent transition-all duration-300 ${overviewSearchInput || overviewResults.length > 0 ? 'overflow-y-auto justify-start' : 'overflow-hidden justify-center py-4 md:py-6'}`}>
        <div className={`max-w-4xl w-full mx-auto flex flex-col animate-in fade-in transition-all duration-500 ease-out ${overviewSearchInput || overviewResults.length > 0 ? '' : 'pb-[15vh] gap-6 md:gap-8'}`}>

          {/* Logo + Input Container */}
          <div
            className={overviewSearchInput || overviewResults.length > 0
              ? 'sticky top-0 z-10 -mx-3 px-3 md:mx-0 md:px-0 pt-4 pb-3 md:pt-6 md:pb-4 flex flex-col gap-3 md:gap-4'
              : 'flex flex-col gap-6 md:gap-8'}
            style={overviewSearchInput || overviewResults.length > 0 ? { backgroundColor: isLight ? '#f1f5f9' : '#060B18' } : undefined}
          >
            {/* Big Google-style logo */}
            <div className="flex flex-col items-center justify-center text-center">
              <h1
                className={`font-black tracking-tighter transition-all duration-500 ease-out ${overviewSearchInput || overviewResults.length > 0 ? 'text-2xl md:text-3xl mb-0 opacity-80' : 'text-5xl md:text-7xl mb-2 opacity-100'}`}
              >
                <span style={{ color: green }}>ASHCOL</span>
                <span style={{ color: textPrimary }} className="ml-2 md:ml-3">PORTAL</span>
              </h1>
            </div>

            {/* Input Box */}
            <div
              className="flex items-center gap-3 px-8 py-5 md:px-10 md:py-6 rounded-full shadow-md border-2 transition-all duration-200"
              style={{
                backgroundColor: cardBg,
                borderColor: overviewSearchFocused ? green : border,
                boxShadow: overviewSearchFocused ? `0 0 0 4px ${green}15` : 'none'
              }}
            >
              <Search className="w-5 h-5 shrink-0" style={{ color: green }} />
              <input
                type="text"
                placeholder="Search tickets, customers, or contacts..."
                value={overviewSearchInput}
                onChange={e => setOverviewSearchInput(e.target.value)}
                onFocus={() => setOverviewSearchFocused(true)}
                onBlur={() => setOverviewSearchFocused(false)}
                enterKeyHint="search"
                autoComplete="off"
                className="bg-transparent outline-none text-base flex-1 min-w-0 font-medium"
                style={{ color: textPrimary }}
              />
              {overviewSearchInput && (
                <button
                  type="button"
                  onClick={() => { setOverviewSearchInput(''); setOverviewResults([]); }}
                  style={{ color: textMuted }}
                  className="hover:scale-110 transition-transform p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Results Grid / Statuses */}
          {overviewLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: green }} />
              <span className="text-xs font-semibold" style={{ color: textMuted }}>Searching portal database...</span>
            </div>
          ) : overviewResults.length > 0 ? (
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Found {overviewResults.length} {overviewResults.length === 1 ? 'ticket' : 'tickets'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {overviewResults.map(ticket => {
                  const ticketNum = ticket.ticketNumber || ticket.ticket_number || ticket.id
                  const customer = ticket.customerName || ticket.customer_name || 'No Customer Name'
                  const statusStyle = getStatusStyle(ticket.status)

                  return (
                    <div
                      key={ticket.id}
                      className="rounded-xl md:rounded-2xl p-3.5 md:p-4 border shadow-sm transition-all duration-300 md:hover:shadow-md md:hover:-translate-y-0.5 flex flex-col justify-between active:scale-[0.99]"
                      style={{ backgroundColor: cardBg, borderColor: border }}
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <span className="text-[10px] font-extrabold tracking-wide uppercase" style={{ color: textMuted }}>
                            {ticketNum}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}>
                            {ticket.status}
                          </span>
                        </div>

                        {/* Customer & Info */}
                        <h3 className="font-bold text-sm leading-tight mb-2" style={{ color: textPrimary }}>
                          {highlightMatch(customer, overviewSearchInput)}
                        </h3>

                        <div className="flex flex-col gap-1 text-[11px] mb-3" style={{ color: textMuted }}>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 shrink-0" style={{ color: green }} />
                            <span className="truncate">{formatAddress(ticket.location)}</span>
                          </div>
                          {ticket.contactPhone && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">Contact:</span>
                              <span>{ticket.contactPhone}</span>
                            </div>
                          )}
                          {ticket.assignedEmployeeName && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">Technician:</span>
                              <span>{ticket.assignedEmployeeName}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pt-2.5 border-t border-dashed" style={{ borderColor: border }}>
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textMuted }}>
                          Date: {ticket.preferredDate || 'No Date'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedResult({ type: 'ticket', id: ticket.id, customerName: customer, rawData: ticket })}
                          className="flex-1 sm:w-auto px-3 py-2 sm:py-1 rounded-lg text-[11px] sm:text-[10px] font-bold text-white transition-opacity hover:opacity-90 active:opacity-80"
                          style={{ backgroundColor: green }}
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : overviewSearchInput.trim() ? (
            <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in">
              <AlertTriangle className="w-10 h-10 mb-3" style={{ color: textMuted }} />
              <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>No results found</h3>
              <p className="text-xs max-w-sm mt-2" style={{ color: textMuted }}>
                We couldn't find any tickets matching "{overviewSearchInput}". Try adjusting your search term.
              </p>
            </div>
          ) : null}

        </div>
      </div>

      {/* Floating Theme Button (Bottom Right) */}
      <div className="absolute bottom-6 right-6 z-50">
        <button
          onClick={toggleTheme}
          title={isLight ? 'Switch to Dark' : 'Switch to Light'}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 border font-bold text-xs uppercase tracking-wider"
          style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}
        >
          {isLight ? (
            <>
              <Moon className="w-4 h-4" style={{ color: textMuted }} />
              <span>Dark Mode</span>
            </>
          ) : (
            <>
              <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />
              <span>Light Mode</span>
            </>
          )}
        </button>
      </div>

      {/* Detail Modal */}
      {selectedResult && (
        <SearchResultDetailModal
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </div>
  )
}
