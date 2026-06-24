import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader2, FileText, User, Wrench, Calendar, Building2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'

interface SearchResult {
  id: string
  type: 'ticket' | 'service' | 'customer'
  customerName: string
  ticketNumber?: string
  controlNumber?: string
  branch?: string
  branchName?: string
  store?: string
  serviceType?: string
  acType?: string
  unitBrandModel?: string
  technician?: string
  technicianName?: string
  status?: string
  jobStatus?: string
  lastUpdated?: string
  reportDate?: string
  contactPhone?: string
  customerPhone?: string
  address?: string
  customerAddress?: string
  district?: string
  remarks?: string
  note?: string
  // Raw data for detail view
  rawData?: any
}

interface GlobalSearchProps {
  onResultClick?: (result: SearchResult) => void
}

export default function GlobalSearch({ onResultClick }: GlobalSearchProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const rowHover = isLight ? '#f1f5f9' : '#0f1e36'

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setShowResults(false)
      return
    }

    setLoading(true)
    setShowResults(true)

    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${token}` }

      // Search across multiple endpoints
      const [ticketsRes, serviceReportsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tickets?search=${encodeURIComponent(searchQuery)}&size=50`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/v1/service-reports?search=${encodeURIComponent(searchQuery)}`, { headers }).catch(() => null),
      ])

      const combinedResults: SearchResult[] = []

      // Process tickets
      if (ticketsRes?.ok) {
        const ticketsData = await ticketsRes.json()
        const tickets = ticketsData?.data?.tickets || ticketsData?.tickets || []
        tickets.forEach((ticket: any) => {
          combinedResults.push({
            id: ticket.id,
            type: 'ticket',
            customerName: ticket.customerName || ticket.customer_name || 'Unknown',
            ticketNumber: ticket.ticketNumber || ticket.id,
            branch: ticket.branchName || ticket.branch_name,
            serviceType: ticket.serviceType || ticket.service_type,
            technician: ticket.assigned_employee_name || ticket.assignedTo,
            status: ticket.status,
            lastUpdated: ticket.updatedAt || ticket.updated_at,
            contactPhone: ticket.contactPhone || ticket.contact_phone,
            address: ticket.location ? (typeof ticket.location === 'string' ? ticket.location : JSON.stringify(ticket.location)) : undefined,
            rawData: ticket,
          })
        })
      }

      // Process service reports
      if (serviceReportsRes?.ok) {
        const serviceData = await serviceReportsRes.json()
        const services = Array.isArray(serviceData) ? serviceData : serviceData?.data || []
        services.forEach((service: any) => {
          combinedResults.push({
            id: service.id,
            type: 'service',
            customerName: service.customerName || 'Unknown',
            controlNumber: service.controlNumber,
            branch: service.branchName,
            store: service.dealer,
            serviceType: service.serviceType || service.serviceColumn,
            acType: service.unitBrandModel,
            technician: service.technicianName,
            status: service.jobStatus || service.paymentStatus,
            jobStatus: service.jobStatus,
            reportDate: service.reportDate,
            contactPhone: service.customerPhone,
            address: service.customerAddress,
            district: service.district,
            remarks: service.remarks,
            note: service.note,
            rawData: service,
          })
        })
      }

      setResults(combinedResults)
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        performSearch(query)
      } else {
        setResults([])
        setShowResults(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, performSearch])

  const handleClear = () => {
    setQuery('')
    setResults([])
    setShowResults(false)
    inputRef.current?.focus()
  }

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false)
    onResultClick?.(result)
  }

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{ backgroundColor: '#fef08a', color: '#000', fontWeight: 600 }}>{part}</mark>
      ) : (
        part
      )
    )
  }

  const getStatusColor = (status?: string) => {
    if (!status) return textMuted
    const s = status.toUpperCase()
    if (s.includes('COMPLETE')) return '#10B981'
    if (s.includes('PROGRESS') || s.includes('ASSIGNED')) return '#3B82F6'
    if (s.includes('PENDING')) return '#F59E0B'
    if (s.includes('CANCEL')) return '#EF4444'
    return textMuted
  }

  const filteredResults = selectedFilters.length > 0
    ? results.filter(r => selectedFilters.includes(r.type))
    : results

  const filterOptions = [
    { value: 'ticket', label: 'Schedules', count: results.filter(r => r.type === 'ticket').length },
    { value: 'service', label: 'Service Reports', count: results.filter(r => r.type === 'service').length },
  ]

  return (
    <div ref={searchRef} className="relative w-full max-w-2xl">
      {/* Search Input */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg transition-all"
        style={{
          backgroundColor: cardBg,
          border: `2px solid ${showResults ? '#3B82F6' : border}`,
        }}
      >
        <Search className="w-5 h-5 shrink-0" style={{ color: '#3B82F6' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setShowResults(true)}
          placeholder="Search customer name, ticket number, branch, store, technician, or AC type…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: textPrimary }}
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: '#3B82F6' }} />}
        {query && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 p-1 rounded-lg hover:bg-slate-200/20 transition-colors"
            style={{ color: textMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && (
        <div
          className="absolute top-full left-0 right-0 mt-2 rounded-xl shadow-2xl overflow-hidden z-50 max-h-[600px] flex flex-col"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        >
          {/* Filter Chips */}
          {results.length > 0 && (
            <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${border}` }}>
              <span className="text-xs font-semibold" style={{ color: textMuted }}>Filter:</span>
              {filterOptions.map(filter => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setSelectedFilters(prev =>
                      prev.includes(filter.value)
                        ? prev.filter(f => f !== filter.value)
                        : [...prev, filter.value]
                    )
                  }}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: selectedFilters.includes(filter.value) ? '#3B82F6' : inputBg,
                    color: selectedFilters.includes(filter.value) ? '#fff' : textMuted,
                    border: `1px solid ${selectedFilters.includes(filter.value) ? '#3B82F6' : inputBorder}`,
                  }}
                >
                  {filter.label} ({filter.count})
                </button>
              ))}
              {selectedFilters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFilters([])}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: '#3B82F6' }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Results List */}
          <div className="overflow-y-auto flex-1">
            {loading && results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#3B82F6' }} />
                <p className="text-sm font-medium" style={{ color: textMuted }}>Searching...</p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Search className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
                <p className="text-sm font-semibold" style={{ color: textPrimary }}>No matching records found</p>
                <p className="text-xs" style={{ color: textMuted }}>
                  {query.trim() ? `Try different keywords or check spelling` : 'Start typing to search'}
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: border }}>
                {filteredResults.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => handleResultClick(result)}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{ backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = rowHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: result.type === 'ticket' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)',
                          color: result.type === 'ticket' ? '#3B82F6' : '#10B981',
                        }}
                      >
                        {result.type === 'ticket' ? <FileText className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="font-semibold text-sm truncate" style={{ color: textPrimary }}>
                            {highlightMatch(result.customerName, query)}
                          </h4>
                          {result.status && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0"
                              style={{
                                backgroundColor: `${getStatusColor(result.status)}15`,
                                color: getStatusColor(result.status),
                              }}
                            >
                              {result.status}
                            </span>
                          )}
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: textMuted }}>
                          {(result.ticketNumber || result.controlNumber) && (
                            <div className="flex items-center gap-1">
                              <FileText className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                {highlightMatch(result.ticketNumber || result.controlNumber || '', query)}
                              </span>
                            </div>
                          )}
                          {(result.branch || result.branchName) && (
                            <div className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                {highlightMatch(result.branch || result.branchName || '', query)}
                              </span>
                            </div>
                          )}
                          {result.serviceType && (
                            <div className="flex items-center gap-1">
                              <Wrench className="w-3 h-3 shrink-0" />
                              <span className="truncate">{highlightMatch(result.serviceType, query)}</span>
                            </div>
                          )}
                          {result.technician && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 shrink-0" />
                              <span className="truncate">{highlightMatch(result.technician, query)}</span>
                            </div>
                          )}
                          {result.acType && (
                            <div className="flex items-center gap-1 col-span-2">
                              <Wrench className="w-3 h-3 shrink-0" />
                              <span className="truncate">{highlightMatch(result.acType, query)}</span>
                            </div>
                          )}
                          {result.store && (
                            <div className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">{highlightMatch(result.store, query)}</span>
                            </div>
                          )}
                          {(result.lastUpdated || result.reportDate) && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                {new Date(result.lastUpdated || result.reportDate || '').toLocaleDateString('en-PH', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* View Details Link */}
                        <div className="mt-2">
                          <span className="text-xs font-semibold hover:underline" style={{ color: '#3B82F6' }}>
                            View Details →
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Results Count Footer */}
          {filteredResults.length > 0 && (
            <div className="px-4 py-2 text-center text-xs font-medium" style={{ borderTop: `1px solid ${border}`, color: textMuted }}>
              Showing {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
              {selectedFilters.length > 0 && ` (filtered)`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
