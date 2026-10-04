import React from 'react'
import { CalendarDays, MapPin, MessageSquare } from 'lucide-react'
import type { Employee, User } from '../types'
import { EMPTY_CELL, sanitizeDisplayText } from '../../../utils/textSanitize'
import {
  fmtPhone,
  formatDisplayDate,
  getCustomerDisplayName,
  getF,
  getFinalDateKey,
  getInstallerDisplay,
  getPaymentBreakdown,
  getScheduleGhostKind,
  getSchedulePaymentDisplay,
  getScheduleRowColors,
  getScheduleStatusBadgeStyle,
  getScheduleStatusDisplay,
  getScheduleStatusValue,
  getTicketCommitDisplay,
  getTicketDriverDisplay,
  getTicketNegotiatorName,
  getTicketVehicleDisplay,
  isOverduePendingScheduleTicket,
  isTicketClosed,
  namesMatchLoosely,
  normalizeCustomerKey,
  parseBrand,
  resolveNegotiatorDisplayName,
  resolveTicketDistrict,
  resolveTicketPayment,
  shouldBlankReschedGhostPayment,
  stripArchivedRemarkSuffix,
  type Ticket,
} from '../../../utils/ticketHelpers'

export interface TicketMobileCardProps {
  visible: Ticket[]
  dateFilter: string
  duplicateNameKeys: Set<string>
  isLight: boolean
  rowEven: string
  rowOdd: string
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  green: string
  branchEmployees: Employee[]
  activeBranchId: string | null
  user: User | null
  vehicleTripLabels: Map<string, string>
  canEdit: boolean
  openStatusPicker: (ticket: Ticket, mode?: any, anchor?: HTMLElement | null) => void
  setDetailTicket: (ticket: Ticket | null) => void
  startCellEdit: (ticket: Ticket, colLabel: string, anchor: HTMLElement, rowIdx: number) => void
  setHistoryGraphModal: (modal: { ticket: Ticket; isOpen: boolean }) => void
  copyTextToClipboard: (text: string) => Promise<any> | void
  showToast: (msg: string) => void
}

export const TicketMobileCard: React.FC<TicketMobileCardProps> = ({
  visible,
  dateFilter,
  duplicateNameKeys,
  isLight,
  rowEven,
  rowOdd,
  cardBg,
  border,
  textPrimary,
  textMuted,
  green,
  branchEmployees,
  activeBranchId,
  user,
  vehicleTripLabels,
  canEdit,
  openStatusPicker,
  setDetailTicket,
  startCellEdit,
  setHistoryGraphModal,
  copyTextToClipboard,
  showToast,
}) => {
  return (
    <div className="flex flex-col md:hidden px-4 py-4 gap-3 w-full">
      {visible.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 p-10 mx-2 my-10 min-h-[50vh] rounded-2xl border-2 border-dashed bg-slate-50/50 dark:bg-[#0F1A2E]/30"
          style={{ borderColor: isLight ? '#cbd5e1' : '#334155' }}
        >
          <CalendarDays className="w-8 h-8 opacity-25" style={{ color: textMuted }} />
          <p className="text-sm font-semibold text-center" style={{ color: textMuted }}>
            No records found
          </p>
        </div>
      ) : (
        visible.map((ticket, idx) => {
          const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null
          const isGhost = Boolean(ghostKind)
          const isPendingRow = isOverduePendingScheduleTicket(ticket, ghostKind, dateFilter)
          const isDuplicateName = duplicateNameKeys.has(normalizeCustomerKey(getCustomerDisplayName(ticket)))
          const rowColors = getScheduleRowColors(ticket, ghostKind, isLight, idx, rowEven, rowOdd, isDuplicateName)
          const statusVal = getScheduleStatusValue(ticket)
          const statusStyle = getScheduleStatusBadgeStyle(statusVal, isLight)
          const statusDisplay = getScheduleStatusDisplay(ticket) || ticket.status || ''
          const ticketNo = ticket.ticketNumber || ticket.controlNumber || '—'
          const district = resolveTicketDistrict(ticket) || ticket.district || ''
          const fullAddress = ((ticket as any).address || (ticket as any).fullAddress || (ticket as any).full_address || (ticket as any).location || (ticket as any).siteAddress || (ticket as any).site_address || (ticket as any).streetAddress || (ticket as any).street_address || (ticket as any).city || (ticket as any).area || district || '').trim()
          const brand = parseBrand(ticket)
          const dealer = getF(ticket, 'dealer', 'sourceVendor', 'source_vendor')
          const installer = getInstallerDisplay(ticket, branchEmployees, activeBranchId)
          const driver = getTicketDriverDisplay(ticket)
          const vehicle = vehicleTripLabels.get(ticket.id || '') || getTicketVehicleDisplay(ticket)
          const payment = getSchedulePaymentDisplay(ticket, dateFilter, ghostKind)
          const commit = getTicketCommitDisplay(ticket)
          const phone = getF(ticket, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
          const remarks = sanitizeDisplayText(
            stripArchivedRemarkSuffix((ticket.remarksUpdate || ticket.remarks || '').trim()),
          )
          const negotiatorName = getTicketNegotiatorName(ticket, branchEmployees) || ''
          const cardNegId = ticket.negotiatorId || ticket.negotiator_id || ''
          const cardNegEmp = branchEmployees.find(e => {
            if (cardNegId && e.id === cardNegId) return true
            if (negotiatorName && e.name && namesMatchLoosely(e.name, negotiatorName)) return true
            const resolvedFull = resolveNegotiatorDisplayName(ticket, branchEmployees)
            if (resolvedFull && e.name && namesMatchLoosely(e.name, resolvedFull)) return true
            return false
          })
          const negotiatorPhone = (ticket as any).negotiatorPhone
            || (ticket as any).negotiator_phone
            || (ticket as any).negotiatorContact
            || (ticket as any).negotiator_contact
            || cardNegEmp?.phone
            || (cardNegId && user?.id === cardNegId ? (user?.phone || '') : '')
            || ''

          return (
            <div
              key={`${ticket.id}${isGhost ? `-ghost-${ghostKind}` : ''}`}
              onClick={() => setDetailTicket(ticket)}
              className="w-full rounded-2xl overflow-hidden border shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.99] cursor-pointer flex flex-col"
              style={{
                backgroundColor: rowColors.baseBg,
                borderColor: border,
                opacity: isGhost ? 0.72 : 1,
              }}
            >
              {/* Card Header: ticket no (left) / status badge (right) */}
              <div
                className="px-4 py-3 flex justify-between items-center border-b"
                style={{ backgroundColor: isLight ? 'rgba(248,250,252,0.85)' : 'rgba(15,26,46,0.6)', borderColor: border }}
              >
                <span className="text-[15px] sm:text-base font-black tracking-tight uppercase" style={{ color: isLight ? '#0f172a' : '#f8fafc' }}>
                  {ticketNo}
                </span>
                {statusDisplay ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      openStatusPicker(ticket, 'inline', e.currentTarget as HTMLElement)
                    }}
                    className="h-8 px-3.5 rounded-md text-xs font-black uppercase shrink-0 tracking-wider border shadow-xs transition-all active:scale-95 hover:opacity-90 cursor-pointer flex items-center justify-center"
                    style={{
                      color: statusStyle.color,
                      backgroundColor: statusStyle.backgroundColor,
                      borderColor: statusStyle.borderColor,
                    }}
                    title="Click to change status"
                  >
                    {statusDisplay === 'INSTALLATION' ? 'INSTALL' : statusDisplay}
                  </button>
                ) : null}
              </div>

              {/* Card Body: customer name / phone, then brand/dealer + location */}
              <div className="px-4 py-3.5 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h3
                    className="text-base font-black uppercase tracking-tight leading-tight truncate"
                    style={{ color: isDuplicateName ? (isLight ? '#9f1239' : '#f43f5e') : textPrimary }}
                  >
                    {getCustomerDisplayName(ticket)}
                  </h3>
                  {phone ? (
                    <a
                      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                      onClick={e => e.stopPropagation()}
                      onContextMenu={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        void copyTextToClipboard(phone)
                        showToast(`Copied ${fmtPhone(phone) || phone}`)
                      }}
                      className="text-xs font-bold tabular-nums hover:underline shrink-0"
                      style={{ color: isLight ? '#0369a1' : '#7dd3fc' }}
                    >
                      {fmtPhone(phone) || phone}
                    </a>
                  ) : null}
                </div>
                {(brand || dealer) ? (
                  <div className="text-xs font-semibold truncate" style={{ color: textMuted }}>
                    {[brand, dealer].filter(Boolean).join(' · ')}
                  </div>
                ) : null}
                {fullAddress ? (
                  <div className="flex items-start gap-1.5 pt-0.5 w-full" style={{ color: textMuted }}>
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: green }} />
                    <span className="text-xs font-medium line-clamp-2 leading-relaxed" title={fullAddress}>{fullAddress}</span>
                  </div>
                ) : null}
              </div>

              {/* Card Crew: strict 2x2 grid — Negotiator, Installer, Vehicle, Driver */}
              <div
                className="grid grid-cols-2 gap-3 px-4 py-3 border-y"
                style={{ backgroundColor: isLight ? 'rgba(248,250,252,0.6)' : 'rgba(15,26,46,0.35)', borderColor: border }}
              >
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="text-[9.5px] font-black tracking-widest uppercase" style={{ color: textMuted }}>Negotiator</span>
                  <span className="text-xs font-bold truncate uppercase" style={{ color: (negotiatorName && negotiatorName !== EMPTY_CELL) ? (isPendingRow ? '#ffffff' : textPrimary) : textMuted }}>
                    {negotiatorName && negotiatorName !== EMPTY_CELL ? negotiatorName : '—'}
                  </span>
                  {negotiatorPhone ? (
                    <a
                      href={`tel:${negotiatorPhone.replace(/[^\d+]/g, '')}`}
                      onClick={e => e.stopPropagation()}
                      onContextMenu={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        void copyTextToClipboard(negotiatorPhone)
                        showToast(`Copied ${fmtPhone(negotiatorPhone) || negotiatorPhone}`)
                      }}
                      className="text-[10.5px] tabular-nums font-bold hover:underline truncate"
                      style={{ color: isLight ? '#0369a1' : '#7dd3fc' }}
                    >
                      {fmtPhone(negotiatorPhone) || negotiatorPhone}
                    </a>
                  ) : null}
                </div>
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="text-[9.5px] font-black tracking-widest uppercase" style={{ color: textMuted }}>Installer</span>
                  <span className="text-xs font-bold truncate uppercase" style={{ color: installer ? (isLight ? '#0369a1' : '#7dd3fc') : textMuted }}>
                    {installer || '—'}
                  </span>
                </div>
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="text-[9.5px] font-black tracking-widest uppercase" style={{ color: textMuted }}>Vehicle</span>
                  <span className="text-xs font-bold truncate uppercase tabular-nums" style={{ color: vehicle ? textPrimary : textMuted }}>
                    {vehicle || '—'}
                  </span>
                </div>
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="text-[9.5px] font-black tracking-widest uppercase" style={{ color: textMuted }}>Driver</span>
                  <span className="text-xs font-bold truncate uppercase" style={{ color: driver ? textPrimary : textMuted }}>
                    {driver || '—'}
                  </span>
                </div>
              </div>

              {/* Card Footer: commit/remarks (left) / final date (right) */}
              {(() => {
                const finalDateKey = getFinalDateKey(ticket)
                return (
                  <div className="px-4 py-3.5 flex flex-col gap-3">
                    <div className="flex justify-between items-center gap-2">
                      <div className="min-w-0 flex-1">
                        {(commit || payment) ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold truncate uppercase" style={{ color: textMuted }}>{commit || '—'}</span>
                            {payment ? (
                              <span className="text-xs shrink-0 font-black tabular-nums" style={{ color: textPrimary }}>{payment}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {finalDateKey ? (
                        <span className="text-xs font-black tabular-nums shrink-0 uppercase tracking-wide" style={{ color: textPrimary }}>
                          {formatDisplayDate(finalDateKey, '')}
                        </span>
                      ) : canEdit && !isGhost && !isTicketClosed(ticket) ? (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            startCellEdit(ticket, 'FINAL DATE', e.currentTarget as HTMLElement, idx)
                          }}
                          className="text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30 shrink-0 transition-all hover:bg-emerald-500/20 active:scale-95"
                        >
                          + DATE
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-dashed" style={{ borderColor: isLight ? 'rgba(203,213,225,0.7)' : 'rgba(30,41,59,0.7)' }}>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setHistoryGraphModal({ ticket, isOpen: true })
                        }}
                        className="h-10 px-4 rounded-xl text-xs font-black uppercase flex items-center gap-2 border transition-all active:scale-95 shrink-0 shadow-xs cursor-pointer"
                        style={{
                          backgroundColor: remarks
                            ? (isLight ? '#dcfce7' : 'rgba(34, 197, 94, 0.18)')
                            : (isLight ? '#f1f5f9' : 'rgba(148, 163, 184, 0.12)'),
                          borderColor: remarks
                            ? (isLight ? '#86efac' : 'rgba(34, 197, 94, 0.4)')
                            : (isLight ? '#cbd5e1' : 'rgba(148, 163, 184, 0.28)'),
                          color: remarks
                            ? (isLight ? '#166534' : '#4ade80')
                            : textMuted,
                        }}
                        title="Open remarks chat view and history"
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <span>Update Remarks</span>
                      </button>
                      {remarks ? (
                        <p
                          className="text-xs truncate font-semibold flex-1 cursor-pointer hover:underline text-right leading-snug"
                          style={{ color: isLight ? '#15803d' : '#86efac' }}
                          title={remarks}
                          onClick={e => {
                            e.stopPropagation()
                            setHistoryGraphModal({ ticket, isOpen: true })
                          }}
                        >
                          {remarks}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })
      )}

      {/* Collection Totals Summary Card */}
      {(() => {
        let totalCash = 0
        let totalGcash = 0
        let totalBankTransfer = 0
        let totalForCollection = 0
        let totalCheque = 0
        let totalOther = 0

        visible.forEach(ticket => {
          const ghostKind = dateFilter ? getScheduleGhostKind(ticket, dateFilter) : null
          if (shouldBlankReschedGhostPayment(dateFilter, ghostKind)) return

          const { mode: rawMode, amount } = resolveTicketPayment(ticket)

          const categorize = (mode: string, amt: number) => {
            const m = (mode || '').trim().toUpperCase()
            if (m === 'CASH') totalCash += amt
            else if (m === 'GCASH') totalGcash += amt
            else if (m === 'BANK TRANSFER' || m === 'BANK_TRANSFER' || m === 'BANK' || m === 'ONLINE') totalBankTransfer += amt
            else if (m === 'FOR COLLECTION' || m === 'FOR_COLLECTION') totalForCollection += amt
            else if (m === 'CHEQUE' || m === 'CHECK' || m === 'CHECK PAYMENT' || m === 'CHECK_PAYMENT') totalCheque += amt
            else if (amt > 0) totalOther += amt
          }

          if (rawMode === 'HYBRID') {
            const breakdown = getPaymentBreakdown(ticket)
            breakdown.forEach(entry => categorize(entry.mode, entry.amount || 0))
          } else {
            categorize(rawMode, amount)
          }
        })

        const totalEstimated = totalCash + totalGcash + totalBankTransfer + totalForCollection + totalCheque + totalOther
        if (totalEstimated <= 0) return null

        return (
          <div className="mt-3 p-3 rounded-xl border flex flex-col gap-2 shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg font-black" style={{ backgroundColor: '#15803d', color: '#fff' }}>
              <span className="text-[11px] uppercase tracking-wider">TOTAL COLLECTION</span>
              <span className="text-xs font-black tracking-wide">
                ₱{totalEstimated.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {totalGcash > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#dbeafe', color: '#000' }}>
                <span>GCASH</span>
                <span>₱{totalGcash.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {totalCash > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#dcfce7', color: '#000' }}>
                <span>CASH</span>
                <span>₱{totalCash.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {totalBankTransfer > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#f3e8ff', color: '#000' }}>
                <span>BANK TRANSFER</span>
                <span>₱{totalBankTransfer.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {totalForCollection > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#fef3c7', color: '#000' }}>
                <span>FOR COLLECTION</span>
                <span>₱{totalForCollection.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {totalCheque > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#e0e7ff', color: '#000' }}>
                <span>CHEQUE</span>
                <span>₱{totalCheque.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {totalOther > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: '#f3e8ff', color: '#000' }}>
                <span>OTHER</span>
                <span>₱{totalOther.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
