import { useState, useRef, useEffect } from 'react'
import gsap from 'gsap'
import { X } from 'lucide-react'

// ─── Filter Data ────────────────────────────────────────────────────────────
const FILTER_DATA = [
  {
    title: 'Status',
    options: ['Completed', 'Pending', 'Ongoing', 'Cancelled'],
  },
  {
    title: 'Priority',
    options: ['High Priority', 'Mid Priority', 'Low Priority'],
  },
  {
    title: 'Tickets',
    options: ['Installation', 'Cleaning', 'Repair', 'Maintenance', 'Dismantle', 'Warranty'],
  },
  {
    title: 'People',
    options: ['Customers', 'Drivers', 'Installers', 'Negotiators'],
  },
  {
    title: 'Branch',
    options: ['Bulacan', 'Taguig', 'Rizal', 'Laguna', 'Candelaria', 'Pampanga', 'Dasma, Cavite', 'Gentri, Cavite', 'Silang, Cavite', 'Velenzuela'],
  },
  {
    title: 'Contacts',
    options: ['Address', 'Email', 'Phone'],
  },
]

// ─── Props ───────────────────────────────────────────────────────────────────
export interface SearchFilterDropdownProps {
  /** The text value of the search input */
  searchValue: string
  onSearchChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  focused?: boolean
  /** Theme-aware colors passed in from the parent */
  colors: {
    cardBg: string
    border: string
    textPrimary: string
    textMuted: string
    green: string
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export function SearchFilterDropdown({
  searchValue,
  onSearchChange,
  onFocus,
  onBlur,
  focused,
  colors,
}: SearchFilterDropdownProps) {
  const { cardBg, border, textPrimary, textMuted, green } = colors

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])

  // Dynamic Ticket Input States
  const [isEditingTicket, setIsEditingTicket] = useState(false)
  const [ticketInputValue, setTicketInputValue] = useState('')

  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterIconRef = useRef<HTMLButtonElement>(null)

  // Scoped GSAP selector — only targets elements inside the filter button
  const q = gsap.utils.selector(filterIconRef)

  // ── GSAP open/close animation ─────────────────────────────────────────────
  useEffect(() => {
    const el = dropdownRef.current
    if (!el) return

    if (isFilterOpen) {
      gsap.fromTo(
        el,
        { y: -15, autoAlpha: 0, display: 'none' },
        { duration: 0.3, y: 0, autoAlpha: 1, display: 'flex', ease: 'power2.out' },
      )
    } else {
      gsap.to(el, {
        duration: 0.2,
        y: -10,
        autoAlpha: 0,
        display: 'none',
        ease: 'power2.in',
      })
      // Reset typing state when dropdown closes
      setIsEditingTicket(false)
      setTicketInputValue('')
    }
  }, [isFilterOpen])

  // ── Filter icon hover animation — per-slider micro-interaction ───────────
  const handleIconHover = () => {
    gsap.to(q('.slider-1'), { y: -3, duration: 0.3, yoyo: true, repeat: 1, ease: 'power1.inOut' })
    gsap.to(q('.slider-2'), { y: 3,  duration: 0.3, yoyo: true, repeat: 1, ease: 'power1.inOut', delay: 0.1 })
    gsap.to(q('.slider-3'), { y: -2, duration: 0.3, yoyo: true, repeat: 1, ease: 'power1.inOut', delay: 0.2 })
  }

  const handleIconLeave = () => {
    gsap.to(q('.slider-1, .slider-2, .slider-3'), { y: 0, duration: 0.3, ease: 'power2.out' })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const handleToggleFilter = (option: string) => {
    setSelectedFilters(prev =>
      prev.includes(option) ? prev.filter(item => item !== option) : [...prev, option],
    )
  }

  const handleClearAll = () => setSelectedFilters([])

  // Handles submitting the dynamic ticket number
  const handleTicketSubmit = () => {
    if (ticketInputValue.trim()) {
      const newFilter = `Ticket: ${ticketInputValue.trim()}`
      if (!selectedFilters.includes(newFilter)) {
        setSelectedFilters(prev => [...prev, newFilter])
      }
    }
    setTicketInputValue('')
    setIsEditingTicket(false)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full relative">

      {/* ── Search Bar ──────────────────────────────────────────────────── */}
      <div
        className="w-full flex items-start gap-2 px-5 py-3 md:px-6 md:py-4 rounded-[1.5rem] shadow-md border-2 transition-[border-color,box-shadow] duration-150 flex-wrap"
        style={{
          backgroundColor: cardBg,
          borderColor: isFilterOpen ? green : focused ? green : border,
          boxShadow: (isFilterOpen || focused) ? `0 0 0 4px ${green}15` : 'none',
        }}
      >
        {/* Search icon */}
        <svg
          className="w-[22px] h-[22px] shrink-0 mt-[3px]"
          style={{ color: green }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        {/* Active filter pills */}
        {selectedFilters.map(filter => (
          <span
            key={filter}
            className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-md shrink-0"
            style={{ backgroundColor: green, color: '#fff' }}
          >
            {filter}
            <button
              type="button"
              onClick={() => handleToggleFilter(filter)}
              className="hover:opacity-70 transition-opacity focus:outline-none"
              aria-label={`Remove ${filter} filter`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {/* Text input */}
        <input
          type="text"
          placeholder={
            selectedFilters.length === 0
              ? 'Search tickets, customers, or contacts...'
              : ''
          }
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          enterKeyHint="search"
          autoComplete="off"
          className="bg-transparent outline-none text-[15px] flex-1 min-w-[120px] h-[26px] leading-[26px]"
          style={{ color: textPrimary }}
        />

        {/* Clear text button */}
        {searchValue && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            style={{ color: textMuted }}
            className="hover:scale-110 transition-transform p-1 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Filter toggle button */}
        <button
          ref={filterIconRef}
          type="button"
          onClick={() => setIsFilterOpen(prev => !prev)}
          onMouseEnter={handleIconHover}
          onMouseLeave={handleIconLeave}
          className="shrink-0 mt-0 p-1.5 rounded-full transition-colors focus:outline-none"
          style={{
            color: isFilterOpen ? green : textMuted,
            backgroundColor: isFilterOpen ? `${green}15` : 'transparent',
          }}
          aria-label="Toggle filter dropdown"
        >
          {/* Three-group slider SVG — each group is independently GSAP-animated */}
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ overflow: 'visible' }}
          >
            <g className="slider-1">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 21v-7m0-4V3" />
              <circle cx="6" cy="12" r="2" strokeWidth="2" />
            </g>
            <g className="slider-2">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21v-9m0-4V3" />
              <circle cx="12" cy="10" r="2" strokeWidth="2" />
            </g>
            <g className="slider-3">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 21v-5m0-4V3" />
              <circle cx="18" cy="14" r="2" strokeWidth="2" />
            </g>
          </svg>
        </button>
      </div>

      {/* ── Filter Dropdown ──────────────────────────────────────────────── */}
      <div
        ref={dropdownRef}
        className="absolute top-full left-0 right-0 mt-3 rounded-2xl border z-50 flex-col max-h-[400px] overflow-hidden"
        style={{
          backgroundColor: cardBg,
          borderColor: border,
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          // initial GSAP hidden state — display toggled to 'flex' by GSAP on open
          opacity: 0,
          visibility: 'hidden',
          display: 'none',
        }}
      >
        {/* Header — pinned, never shrinks */}
        <div
          className="shrink-0 flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <h3 className="text-base font-bold" style={{ color: textPrimary }}>
            Filter by
          </h3>
          <button
            type="button"
            onClick={() => setIsFilterOpen(false)}
            className="p-1 rounded-full hover:opacity-70 transition-opacity focus:outline-none"
            style={{ color: textMuted }}
            aria-label="Close filter dropdown"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category list — scrollable middle section */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {FILTER_DATA.map((category, idx) => (
            <div key={idx}>
              <h4
                className="text-xs font-bold uppercase tracking-wider mb-2.5"
                style={{ color: textMuted }}
              >
                {category.title}
              </h4>
              <div className="flex flex-wrap gap-2">
                {category.options.map((option, optIdx) => {
                  const isActive = selectedFilters.includes(option)
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleToggleFilter(option)}
                      className="px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all border focus:outline-none"
                      style={
                        isActive
                          ? {
                              backgroundColor: green,
                              color: '#fff',
                              borderColor: green,
                            }
                          : {
                              backgroundColor: 'transparent',
                              color: green,
                              borderColor: `${green}55`,
                            }
                      }
                    >
                      {option}
                    </button>
                  )
                })}

                {/* ── Click-to-Type Ticket UI (Tickets category only) ──── */}
                {category.title === 'Tickets' && (
                  <>
                    {/* Active ticket-number pills — click to remove */}
                    {selectedFilters
                      .filter(f => f.startsWith('Ticket: '))
                      .map(ticket => (
                        <button
                          key={ticket}
                          type="button"
                          onClick={() => handleToggleFilter(ticket)}
                          className="px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all border focus:outline-none"
                          style={{ backgroundColor: green, color: '#fff', borderColor: green }}
                        >
                          {ticket}
                        </button>
                      ))
                    }

                    {/* Input or dashed add-button */}
                    {isEditingTicket ? (
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        value={ticketInputValue}
                        onChange={e => setTicketInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                        onBlur={handleTicketSubmit}
                        onKeyDown={e => e.key === 'Enter' && handleTicketSubmit()}
                        placeholder="Enter No..."
                        className="px-3 py-1.5 text-[12px] font-semibold rounded-lg border outline-none w-[110px] focus:ring-1"
                        style={{
                          borderColor: green,
                          color: green,
                          backgroundColor: `${green}10`,
                          // @ts-ignore
                          '--tw-ring-color': green,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingTicket(true)}
                        className="px-3 py-1.5 text-[12px] font-bold rounded-lg transition-all border border-dashed focus:outline-none"
                        style={{
                          borderColor: `${green}88`,
                          color: green,
                          backgroundColor: 'transparent',
                        }}
                      >
                        + Add Ticket No.
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer — pinned, never shrinks */}
        <div
          className="shrink-0 flex items-center justify-between px-6 py-4"
          style={{ borderTop: `1px solid ${border}` }}
        >
          <button
            type="button"
            onClick={handleClearAll}
            className="px-5 py-2 text-sm font-semibold rounded-full border transition-colors focus:outline-none"
            style={{
              color: textMuted,
              borderColor: border,
              backgroundColor: 'transparent',
            }}
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={() => setIsFilterOpen(false)}
            className="px-6 py-2 text-sm font-bold rounded-full transition-colors focus:outline-none"
            style={{
              backgroundColor: green,
              color: '#fff',
              boxShadow: `0 2px 8px ${green}55`,
            }}
          >
            Apply Filter
          </button>
        </div>
      </div>
    </div>
  )
}
