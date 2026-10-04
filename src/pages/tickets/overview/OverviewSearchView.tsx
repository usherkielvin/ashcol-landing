import React from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Eye,
  Loader2,
  MapPin,
  Search,
  X,
} from 'lucide-react'
import type { Employee, User } from '../types'
import { EMPTY_CELL } from '../../../utils/textSanitize'
import {
  fmtPhone,
  formatAddress,
  formatDisplayDate,
  getFinalDateKey,
  getInstallerDisplay,
  getOverviewStatusBadge,
  getPreferredDateKey,
  getScheduleStatusBadgeStyle,
  getTicketNegotiatorName,
  namesMatchLoosely,
  resolveNegotiatorDisplayName,
  type Ticket,
} from '../../../utils/ticketHelpers'

export interface OverviewQuickLink {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  hidden?: boolean
}

export interface OverviewSearchViewProps {
  isLight: boolean
  cardBg: string
  border: string
  green: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  overviewSearchInput: string
  setOverviewSearchInput: (val: string) => void
  overviewSearchFocused: boolean
  setOverviewSearchFocused: (val: boolean) => void
  overviewResults: Ticket[]
  setOverviewResults: (results: Ticket[]) => void
  overviewLoading: boolean
  overviewQuickLinks: OverviewQuickLink[]
  navigate: (to: string) => void
  branchEmployees: Employee[]
  activeBranchId: string | null
  user: User | null
  formatAssignedBranchLabel: (branchId: string | null) => string
  resolveScopedBranchId: (branch: string | null) => string | null
  setDetailTicket: (ticket: Ticket | null) => void
  setShowHistoryPanel: (show: boolean) => void
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: '#fef08a', color: '#000', fontWeight: 600 }}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

export const OverviewSearchView: React.FC<OverviewSearchViewProps> = ({
  isLight,
  cardBg,
  border,
  green,
  textPrimary,
  textMuted,
  inputBg,
  inputBorder,
  overviewSearchInput,
  setOverviewSearchInput,
  overviewSearchFocused,
  setOverviewSearchFocused,
  overviewResults,
  setOverviewResults,
  overviewLoading,
  overviewQuickLinks,
  navigate,
  branchEmployees,
  activeBranchId,
  user,
  formatAssignedBranchLabel,
  resolveScopedBranchId,
  setDetailTicket,
  setShowHistoryPanel,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 w-full h-full overflow-hidden relative" style={{ backgroundColor: isLight ? '#f1f5f9' : '#060B18' }}>
      {/* Branches Showcase â€” live auto-scrolling marquee */}
      <div className="flex items-center justify-center py-2.5 w-full shrink-0 z-20 relative marquee-viewport" style={{ borderBottom: `1px solid ${border}` }}>
        <div className="marquee-track" style={{ animationDuration: '32s' }}>
          {[
            'BULACAN', 'CANDELARIA', 'DASMA, CAVITE',
            'LAGUNA', 'PAMPANGA', 'RIZAL',
            'SILANG, CAVITE', 'TAGUIG',
          ].concat([
            'BULACAN', 'CANDELARIA', 'DASMA, CAVITE',
            'LAGUNA', 'PAMPANGA', 'RIZAL',
            'SILANG, CAVITE', 'TAGUIG',
          ]).map((branch, idx) => (
            <div key={`${branch}-${idx}`} className="flex items-center gap-4 shrink-0">
              <span
                className="text-[12px] md:text-[14px] font-black uppercase tracking-[0.15em] whitespace-nowrap"
                style={{ color: idx % 2 === 0 ? green : textPrimary }}
              >
                {branch}
              </span>
              <span className="text-[10px] opacity-40" style={{ color: textMuted }}>&bull;</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`flex-1 min-h-0 px-3 md:px-8 bg-transparent relative flex flex-col ${
          overviewSearchInput || overviewResults.length > 0
            ? 'overflow-y-auto'
            : 'overflow-hidden justify-center py-2 sm:py-4 md:py-6'
        }`}
        style={{
          overscrollBehavior: overviewSearchInput || overviewResults.length > 0 ? 'auto' : 'none',
          touchAction: overviewSearchInput || overviewResults.length > 0 ? 'pan-y' : 'none',
        }}
      >
        <div
          className={
            overviewSearchInput || overviewResults.length > 0
              ? 'max-w-4xl w-full mx-auto flex flex-col'
              : 'w-full max-w-4xl mx-auto px-2 md:px-0 flex flex-col items-center justify-center gap-3 sm:gap-4 md:gap-6 my-auto'
          }
        >
          {/* Sticky Header: Logo + Search Input */}
          <div
            className={
              overviewSearchInput || overviewResults.length > 0
                ? 'sticky top-0 z-10 -mx-3 px-3 md:mx-0 md:px-0 pt-4 pb-3 md:pt-6 md:pb-4 flex flex-col gap-3 md:gap-4'
                : 'w-full flex flex-col items-center gap-3 sm:gap-4 md:gap-6'
            }
            style={overviewSearchInput || overviewResults.length > 0 ? { backgroundColor: isLight ? '#f1f5f9' : '#060B18' } : undefined}
          >
            {/* Big Logo / Name */}
            <div className="flex flex-col items-center justify-center text-center w-full">
              <h1
                className={`font-black tracking-tighter font-['Poppins',sans-serif] ${
                  overviewSearchInput || overviewResults.length > 0 ? 'text-2xl md:text-3xl mb-0 opacity-80' : 'text-3xl sm:text-4xl md:text-6xl mb-0 sm:mb-1 opacity-100'
                }`}
              >
                <span style={{ color: green }}>ASHCOL</span>
                <span style={{ color: textPrimary }} className="ml-2 md:ml-3">PORTAL</span>
              </h1>
            </div>

            {/* Search Input Box */}
            <div
              className="w-full max-w-2xl mx-auto flex items-center gap-2.5 sm:gap-3 px-4 py-3 sm:px-6 sm:py-3.5 md:px-8 md:py-4.5 rounded-2xl shadow-md border-2 transition-[border-color,box-shadow] duration-150"
              style={{
                backgroundColor: cardBg,
                borderColor: overviewSearchFocused ? green : border,
                boxShadow: overviewSearchFocused ? `0 0 0 4px ${green}15` : 'none',
              }}
            >
              <Search className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" style={{ color: green }} />
              <input
                type="text"
                placeholder="Search tickets, customers, or contacts..."
                value={overviewSearchInput}
                onChange={e => setOverviewSearchInput(e.target.value)}
                onFocus={() => setOverviewSearchFocused(true)}
                onBlur={() => setOverviewSearchFocused(false)}
                enterKeyHint="search"
                autoComplete="off"
                className="bg-transparent outline-none text-sm sm:text-base flex-1 min-w-0 font-medium"
                style={{ color: textPrimary }}
              />
              {overviewSearchInput && (
                <button
                  type="button"
                  onClick={() => { setOverviewSearchInput(''); setOverviewResults([]) }}
                  style={{ color: textMuted }}
                  className="hover:scale-110 transition-transform p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Quick Actions launcher */}
            {!overviewSearchInput && overviewResults.length === 0 && overviewQuickLinks.length > 0 && (
              <div className="w-full max-w-4xl mx-auto flex flex-col gap-2 sm:gap-2.5 md:gap-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[9.5px] sm:text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>
                    Quick Actions
                  </span>
                  <span className="flex-1 h-px" style={{ backgroundColor: border }} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 sm:gap-2.5 md:gap-3">
                  {overviewQuickLinks.map((link, idx) => (
                    <button
                      key={link.to}
                      type="button"
                      onClick={() => navigate(link.to)}
                      className={`group flex flex-col items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 md:py-4 px-2 rounded-xl sm:rounded-2xl border shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md active:scale-95 cursor-pointer ${
                        idx === 6 ? 'col-span-2 sm:col-span-1' : ''
                      }`}
                      style={{ backgroundColor: cardBg, borderColor: border }}
                    >
                      <span
                        className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full shrink-0 transition-transform duration-200 group-hover:scale-110"
                        style={{ backgroundColor: `${green}15` }}
                      >
                        <link.icon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 transition-colors" style={{ color: green }} />
                      </span>
                      <span
                        className="text-[10.5px] sm:text-[11px] md:text-xs font-bold text-center leading-tight line-clamp-2 transition-colors"
                        style={{ color: textPrimary }}
                      >
                        {link.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results Section */}
          {overviewLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: green }} />
              <span className="text-xs font-semibold" style={{ color: textMuted }}>Searching portal database...</span>
            </div>
          ) : overviewResults.length > 0 ? (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Found {overviewResults.length} {overviewResults.length === 1 ? 'ticket' : 'tickets'}
                </span>
              </div>

              {/* Results Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {overviewResults.map(ticket => {
                  const ticketNum = ticket.ticketNumber || ticket.ticket_number || ticket.id
                  const customer = ticket.customerName || ticket.customer_name || 'No Customer Name'
                  const { value: statusVal, label: statusLabel } = getOverviewStatusBadge(ticket)
                  const statusStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
                  const rawBranch = ticket.branchId || ticket.branch_id || null
                  const branchLabel = formatAssignedBranchLabel(
                    resolveScopedBranchId(rawBranch) || rawBranch,
                  )
                  const negotiatorLabel = getTicketNegotiatorName(ticket, branchEmployees) || EMPTY_CELL
                  const cardNegId = ticket.negotiatorId || ticket.negotiator_id || ''
                  const cardNegEmp = branchEmployees.find(e => {
                    if (cardNegId && e.id === cardNegId) return true
                    const resolvedFull = resolveNegotiatorDisplayName(ticket, branchEmployees)
                    if (resolvedFull && e.name && namesMatchLoosely(e.name, resolvedFull)) return true
                    return false
                  })
                  const negotiatorPhone = (ticket as any).negotiatorPhone
                    || (ticket as any).negotiator_phone
                    || cardNegEmp?.phone
                    || (cardNegId && user?.id === cardNegId ? (user?.phone || '') : '')
                    || ''
                  const finalDateKey = getFinalDateKey(ticket)
                  const scheduleDateLabel = finalDateKey
                    ? `Scheduled: ${formatDisplayDate(finalDateKey, '')}`
                    : getPreferredDateKey(ticket)
                      ? `Preferred: ${formatDisplayDate(getPreferredDateKey(ticket), '')}`
                      : 'No Date'

                  const cleanBranch = branchLabel && branchLabel !== EMPTY_CELL ? branchLabel.replace(/^ASHCOL\s+/i, '') : ''
                  const custPhone = ticket.contactPhone || ticket.contact_phone || ticket.customer_phone || ticket.phone || ''
                  const formattedCustPhone = custPhone ? (fmtPhone(custPhone) || custPhone) : ''
                  const cardTechnician = getInstallerDisplay(ticket, branchEmployees, activeBranchId)

                  return (
                    <div
                      key={ticket.id}
                      className="rounded-2xl p-4 border shadow-sm transition-all duration-200 hover:shadow-md flex flex-col justify-between"
                      style={{ backgroundColor: cardBg, borderColor: border }}
                    >
                      <div className="space-y-2.5">
                        {/* Card Header */}
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-[11px] font-black font-mono tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                            {ticketNum}
                          </span>
                          <div className="flex gap-1.5 items-center flex-wrap justify-end">
                            {cleanBranch && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                                style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textMuted }}
                              >
                                {cleanBranch}
                              </span>
                            )}
                            <span
                              className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide shadow-sm"
                              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
                            >
                              {statusLabel}
                            </span>
                          </div>
                        </div>

                        {/* Customer Name & Contact Phone */}
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h3 className="font-extrabold text-base leading-snug tracking-tight" style={{ color: textPrimary }}>
                            {highlightMatch(customer, overviewSearchInput)}
                          </h3>
                          {formattedCustPhone && (
                            <a
                              href={`tel:${custPhone.replace(/\D/g, '').replace(/^0/, '+63')}`}
                              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline tracking-tight"
                            >
                              ({formattedCustPhone})
                            </a>
                          )}
                        </div>

                        {/* Location */}
                        {formatAddress(ticket.location) && (
                          <div className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="line-clamp-2 leading-relaxed">{formatAddress(ticket.location)}</span>
                          </div>
                        )}

                        {/* Details Grid Box */}
                        <div
                          className="rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"
                          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
                        >
                          {(negotiatorLabel !== EMPTY_CELL || negotiatorPhone) && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Negotiator</span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {negotiatorLabel !== EMPTY_CELL && (
                                  <span className="font-bold uppercase" style={{ color: textPrimary }}>{negotiatorLabel}</span>
                                )}
                                {negotiatorPhone && (
                                  <span className="text-[11px] font-medium" style={{ color: textMuted }}>
                                    ({negotiatorPhone ? (
                                      <a href={`tel:${negotiatorPhone.replace(/\D/g, '').replace(/^0/, '+63')}`} className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
                                        {fmtPhone(negotiatorPhone) || negotiatorPhone}
                                      </a>
                                    ) : null})
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {cardTechnician && (
                            <div className="flex flex-col gap-0.5 sm:col-span-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Technician</span>
                              <span className="font-semibold" style={{ color: textPrimary }}>{cardTechnician}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pt-3 mt-3 border-t border-dashed" style={{ borderColor: border }}>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>
                          <CalendarDays className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                          <span>{scheduleDateLabel}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailTicket(ticket)
                              setShowHistoryPanel(false)
                            }}
                            className="flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
                            style={{ backgroundColor: green }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : overviewSearchInput.trim() ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertTriangle className="w-10 h-10 mb-3" style={{ color: textMuted }} />
              <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: textPrimary }}>No results found</h3>
              <p className="text-xs max-w-sm mt-2" style={{ color: textMuted }}>
                We couldn't find any tickets matching "{overviewSearchInput}". Try adjusting your search term.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
