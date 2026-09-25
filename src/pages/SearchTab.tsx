import { useState, useEffect, useCallback } from 'react'
import { Search, X, Loader2, MapPin, Moon, Sun, Menu, AlertTriangle, SlidersHorizontal, Building2, CalendarDays } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'
import { useOutletContext } from 'react-router-dom'
import SearchResultDetailModal from '../components/SearchResultDetailModal'
import { getInstallerDisplay, formatSpecificDoneStatus, getScheduleStatusBadgeStyle } from '../utils/ticketHelpers'

interface Ticket {
  id: string
  ticketNumber?: string
  ticket_number?: string
  customerName?: string
  customer_name?: string
  location?: any
  contactPhone?: string
  assignedEmployeeName?: string
  installerName?: string
  installer_name?: string
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

  // Filter state
  const [filterBranchId, setFilterBranchId] = useState<string>('')
  const [filterDate, setFilterDate] = useState<string>('')
  const [showFilters, setShowFilters] = useState<boolean>(false)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const green = '#10B981'

  // Load available branches
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const list = data?.data || []
        const newList: { id: string; name: string }[] = []
        for (const b of list) {
          const cleanName = b.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
          if (b.id === 'BR-TAGUIG-SALES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') {
            if (!newList.some(item => item.id === 'BR-TAGUIG-SALES')) {
              newList.push({ id: 'BR-TAGUIG-SALES', name: 'TAGUIG - SALES' })
            }
            if (!newList.some(item => item.id === 'BR-TAGUIG-SERVICES')) {
              newList.push({ id: 'BR-TAGUIG-SERVICES', name: 'TAGUIG - SERVICES' })
            }
          } else if (b.id === 'BR-TAGUIG-SERVICES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-services' || b.id === 'BR-TAGUIG-SALES-services') {
            if (!newList.some(item => item.id === 'BR-TAGUIG-SERVICES')) {
              newList.push({ id: 'BR-TAGUIG-SERVICES', name: 'TAGUIG - SERVICES' })
            }
          } else if (cleanName.includes('TAGUIG')) {
            // skip
          } else {
            newList.push({ id: b.id, name: cleanName })
          }
        }
        newList.sort((a, b) => a.name.localeCompare(b.name))
        setBranches(newList)
      } catch (err) {
        console.error('Failed to load branches:', err)
      }
    }
    loadBranches()
  }, [])

  const fetchOverviewTickets = useCallback(async (query: string, branch: string, date: string) => {
    const hasQuery = Boolean(query.trim())
    const hasBranch = Boolean(branch.trim())
    const hasDate = Boolean(date.trim())

    if (!hasQuery && !hasBranch && !hasDate) {
      setOverviewResults([])
      return
    }
    setOverviewLoading(true)
    try {
      const tokenStr = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${tokenStr}` }
      const params = new URLSearchParams()
      if (hasQuery) params.append('q', query.trim())
      if (hasBranch && branch !== 'ALL_BRANCHES') params.append('branchId', branch.trim())
      if (hasDate) params.append('date', date.trim())
      params.append('size', '100')

      const url = `${API_BASE_URL}/tickets?${params.toString()}`
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
    const timer = setTimeout(() => {
      void fetchOverviewTickets(trimmed, filterBranchId, filterDate)
    }, 300)

    return () => clearTimeout(timer)
  }, [overviewSearchInput, filterBranchId, filterDate, fetchOverviewTickets])

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
              "BULACAN", "CANDELARIA", "DASMA, CAVITE", 
              "LAGUNA", "PAMPANGA", "RIZAL", 
              "SILANG, CAVITE", "TAGUIG"
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
      {(() => {
        const hasActiveSearch = Boolean(overviewSearchInput.trim() || filterBranchId || filterDate || overviewResults.length > 0)
        return (
          <div className={`flex-1 flex flex-col min-h-0 px-3 md:px-8 bg-transparent transition-all duration-300 ${hasActiveSearch ? 'overflow-y-auto justify-start' : 'overflow-hidden justify-center py-4 md:py-6'}`}>
            <div className={`max-w-4xl w-full mx-auto flex flex-col animate-in fade-in transition-all duration-500 ease-out ${hasActiveSearch ? '' : 'pb-[15vh] gap-6 md:gap-8'}`}>

              {/* Logo + Input Container */}
              <div
                className={hasActiveSearch
                  ? 'sticky top-0 z-10 -mx-3 px-3 md:mx-0 md:px-0 pt-4 pb-3 md:pt-6 md:pb-4 flex flex-col gap-3 md:gap-4'
                  : 'flex flex-col gap-6 md:gap-8'}
                style={hasActiveSearch ? { backgroundColor: isLight ? '#f1f5f9' : '#060B18' } : undefined}
              >
                {/* Big Google-style logo */}
                <div className="flex flex-col items-center justify-center text-center">
                  <h1
                    className={`font-black tracking-tighter transition-all duration-500 ease-out ${hasActiveSearch ? 'text-2xl md:text-3xl mb-0 opacity-80' : 'text-5xl md:text-7xl mb-2 opacity-100'}`}
                  >
                    <span style={{ color: green }}>ASHCOL</span>
                    <span style={{ color: textPrimary }} className="ml-2 md:ml-3">PORTAL</span>
                  </h1>
                </div>

                {/* Input Box */}
                <div
                  className="flex items-center gap-3 px-6 py-4 md:px-8 md:py-5 rounded-full shadow-md border-2 transition-all duration-200"
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

                  {/* Filter Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setShowFilters(prev => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all shrink-0 select-none ${
                      showFilters || filterBranchId || filterDate
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'
                    }`}
                    style={{
                      borderColor: (showFilters || filterBranchId || filterDate) ? green : border,
                    }}
                    title="Filter by branch or date"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Filters</span>
                    {(Boolean(filterBranchId) || Boolean(filterDate)) && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    )}
                  </button>
                </div>

                {/* Collapsible Filter Panel */}
                {showFilters && (
                  <div
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 rounded-2xl border shadow-sm animate-in fade-in slide-in-from-top-2 duration-200"
                    style={{ backgroundColor: cardBg, borderColor: border }}
                  >
                    {/* Branch Filter */}
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ backgroundColor: isLight ? '#f8fafc' : '#060B18', borderColor: border }}>
                      <Building2 className="w-4 h-4 shrink-0" style={{ color: green }} />
                      <select
                        value={filterBranchId}
                        onChange={e => setFilterBranchId(e.target.value)}
                        className="bg-transparent outline-none text-xs font-semibold flex-1 cursor-pointer"
                        style={{ color: textPrimary }}
                      >
                        <option value="" style={{ backgroundColor: isLight ? '#ffffff' : '#0F172A', color: textPrimary }}>ALL BRANCHES</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id} style={{ backgroundColor: isLight ? '#ffffff' : '#0F172A', color: textPrimary }}>
                            {b.name.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      {filterBranchId && (
                        <button
                          type="button"
                          onClick={() => setFilterBranchId('')}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="Clear branch filter"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Date Filter */}
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ backgroundColor: isLight ? '#f8fafc' : '#060B18', borderColor: border }}>
                      <CalendarDays className="w-4 h-4 shrink-0" style={{ color: green }} />
                      <input
                        type="date"
                        value={filterDate}
                        onChange={e => setFilterDate(e.target.value)}
                        className="bg-transparent outline-none text-xs font-semibold flex-1 cursor-pointer"
                        style={{ color: textPrimary }}
                      />
                      {filterDate ? (
                        <button
                          type="button"
                          onClick={() => setFilterDate('')}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="Clear date filter"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date().toISOString().split('T')[0]
                            setFilterDate(today)
                          }}
                          className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 shrink-0"
                          title="Set to today"
                        >
                          Today
                        </button>
                      )}
                    </div>

                    {/* Reset Button */}
                    {(filterBranchId || filterDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterBranchId('')
                          setFilterDate('')
                        }}
                        className="px-3 py-2 rounded-xl border text-xs font-bold text-slate-500 hover:text-rose-500 hover:border-rose-500/30 transition-colors shrink-0"
                        style={{ borderColor: border }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

                {/* Active Filter Chips */}
                {(filterBranchId || filterDate) && (
                  <div className="flex items-center gap-2 flex-wrap px-1">
                    {filterBranchId && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span>{branches.find(b => b.id === filterBranchId)?.name || filterBranchId}</span>
                        <button type="button" onClick={() => setFilterBranchId('')} className="hover:opacity-75">
                          <X className="w-3 h-3 shrink-0" />
                        </button>
                      </span>
                    )}
                    {filterDate && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CalendarDays className="w-3 h-3 shrink-0" />
                        <span>{new Date(filterDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <button type="button" onClick={() => setFilterDate('')} className="hover:opacity-75">
                          <X className="w-3 h-3 shrink-0" />
                        </button>
                      </span>
                    )}
                  </div>
                )}
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
                  const specificStatus = formatSpecificDoneStatus(ticket)
                  const statusStyle = getScheduleStatusBadgeStyle(specificStatus, isLight)
                  // Never fall back to assignedEmployeeName here — that field holds the
                  // negotiator/assigned sales staff, not the installer/technician.
                  const technician = getInstallerDisplay(ticket as any)

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
                          <span
                            className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider"
                            style={{
                              backgroundColor: statusStyle.backgroundColor,
                              color: statusStyle.color,
                              border: `1px solid ${statusStyle.borderColor}`
                            }}
                          >
                            {specificStatus}
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
                          {technician && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">Technician:</span>
                              <span>{technician}</span>
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
          ) : (overviewSearchInput.trim() || filterBranchId || filterDate) ? (
            <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in">
              <AlertTriangle className="w-10 h-10 mb-3" style={{ color: textMuted }} />
              <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>No tickets found</h3>
              <p className="text-xs max-w-sm mt-2" style={{ color: textMuted }}>
                We couldn't find any tickets matching the selected query or filters. Try adjusting your search term, branch, or date.
              </p>
              {(filterBranchId || filterDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterBranchId('')
                    setFilterDate('')
                  }}
                  className="mt-4 px-3 py-1.5 rounded-lg border text-xs font-bold text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : null}

            </div>
          </div>
        )
      })()}

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
