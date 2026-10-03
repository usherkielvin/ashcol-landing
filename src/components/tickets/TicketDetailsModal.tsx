import { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { X, Edit3, Clock, ChevronDown, Loader2, ClipboardList, Trash2 } from 'lucide-react'
import { ConfirmationChecklistModal, isChecklistFilled } from './ConfirmationChecklistModal'
import { TicketPhotoGallery } from './TicketPhotoGallery'
import { EmployeeNameLink } from '../EmployeeNameLink'
import { EMPTY_CELL } from '../../utils/textSanitize'
import { ROBINSON_APPLIANCES_RE } from '../../utils/dealer'
import type { AuthUser } from '../../contexts/AuthContext'
import { isPortalAdmin, type BranchStaffOption } from '../../utils/api'
import { isTicketLockedFor } from '../../utils/ticketClose'
import {
  type Ticket,
  getScheduleStatusValue,
  getScheduleStatusBadgeStyle,
  getScheduleStatusDisplay,
  formatAddress,
  parseDistrict,
  parseBrand,
  getF,
  getInstallerDisplay,
  formatServiceDriver,
  getTicketCommitDisplay,
  getCustomerDisplayName,
  getTicketNegotiatorName,
  resolveNegotiatorDisplayName,
  resolveTicketDistrict,
  namesMatchLoosely,
  getFinalDateKey,
  isInstalledWorkflowStatus,
  formatPaymentAmount,
  getPaymentMode,
  formatDateKeyLabel,
  formatDisplayDate,
  getArchivedScheduleDate,
  getInstalledDateKey,
  getFirstNameUpper,
  normalizeCustomerKey,
  parseAcMeta,
  parseHistorySpecifics,
  fmtPhone,
} from '../../utils/ticketHelpers'

function DField({ label, value, green, className = "", isLight }: { label: string; value: React.ReactNode; green?: boolean; className?: string; isLight: boolean }) {
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  return (
    <div className={`flex flex-col gap-0.5 py-2 px-3 rounded-lg ${className}`} style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}>
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`text-xs font-semibold break-words leading-snug ${green ? 'text-emerald-500' : ''}`}
        style={green ? undefined : { color: textPrimary }}>
        {['TECHNICIAN', 'INSTALLER', 'ASSIGNED', 'BY', 'CREATED BY', 'NEGOTIATOR', 'INSTALLER / TECHNICIAN'].includes(label.toUpperCase()) && typeof value === 'string' ? (
          <EmployeeNameLink nameOrId={value} />
        ) : value || EMPTY_CELL}
      </span>
    </div>
  )
}

function SHead({ title, isLight }: { title: string; isLight: boolean }) {
  const border = isLight ? '#cbd5e1' : '#1e293b'
  return (
    <div className="pt-2 pb-1 border-b pb-2 mb-3" style={{ borderColor: border }}>
      <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">{title}</p>
    </div>
  )
}

export function TicketDetailsModal({
  ticket,
  isLight,
  isMyTickets = false,
  isTaguigServices = false,
  canEdit = false,
  branchEmployees = [],
  activeBranchId = '',
  user = null,
  duplicateNameKeys = new Set(),
  formatAssignedBranchLabel = (branchId?: string | null) => branchId || '',
  history = [],
  loadingHistory = false,
  showHistoryPanel = false,
  onClose,
  onToggleHistory = () => {},
  onHideHistory = () => {},
  onEdit,
  onDelete,
  onUpdateTicket,
  onOpenStatusPicker,
}: {
  ticket: Ticket
  isLight: boolean
  isMyTickets?: boolean
  isTaguigServices?: boolean
  canEdit?: boolean
  branchEmployees?: BranchStaffOption[]
  activeBranchId?: string
  user?: AuthUser | null
  duplicateNameKeys?: Set<string>
  formatAssignedBranchLabel?: (branchId?: string | null) => string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  history?: any[]
  loadingHistory?: boolean
  showHistoryPanel?: boolean
  onClose: () => void
  onToggleHistory?: () => void
  onHideHistory?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onUpdateTicket?: (updatedTicket: Ticket) => void
  onOpenStatusPicker?: (ticket: Ticket, anchorEl?: HTMLElement | null) => void
}) {
  const [currentTicket, setCurrentTicket] = useState<Ticket>(ticket)
  const [showChecklist, setShowChecklist] = useState(false)
  const isAdmin = isPortalAdmin(user?.role)

  useEffect(() => {
    setCurrentTicket(ticket)
  }, [ticket])
  const t = currentTicket
  // Closed tickets are read-only for everyone except admin/management/manager.
  const locked = isTicketLockedFor(t, user?.role)
  const hasChecklist = isChecklistFilled(t.confirmationChecklist || t.confirmation_checklist)
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const green = '#16A34A'

  const scheduleStatusValue = getScheduleStatusValue(t)
  const scheduleBadgeStyle = getScheduleStatusBadgeStyle(scheduleStatusValue, isLight)
  const scheduleStatusDisplay = getScheduleStatusDisplay(t)
  const addr = formatAddress(t.location)
  const district = parseDistrict(t.location, t.district)
  const brand = parseBrand(t)
  const phone = getF(t, 'contactPhone', 'contact_phone', 'customer_phone', 'phone')
  const altPhone = parseAcMeta(t).alternatePhone as string || ''
  const allPhones = [phone, ...altPhone.split(/[,/]/).map((p: string) => p.trim())].filter(Boolean)
  const installer = getInstallerDisplay(t, branchEmployees, activeBranchId)
  const serviceDriver = formatServiceDriver(t)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = ((t as any).remarksUpdate || (t as any).remarks_update || t.remarks || '').trim()
  const note = (t.note || '').trim()
  const commit = getTicketCommitDisplay(t)
  const custName = getCustomerDisplayName(t) || t.title
  const negotiatorId = t.negotiatorId || t.negotiator_id || ''
  const negotiatorName = getTicketNegotiatorName(t, branchEmployees)
    || branchEmployees.find(e => e.id === negotiatorId)?.name
    || ''
  const negotiatorEmp = branchEmployees.find(e => {
    if (negotiatorId && e.id === negotiatorId) return true
    const resolvedFull = resolveNegotiatorDisplayName(t, branchEmployees)
    if (resolvedFull && e.name && namesMatchLoosely(e.name, resolvedFull)) return true
    return false
  })
  const negotiatorPhone = negotiatorEmp?.phone
    || (negotiatorId && user?.id === negotiatorId ? (user?.phone || '') : '')
    || ''
  const preferredDate = t.preferredDate || t.preferred_date
  const finalScheduleDate = getFinalDateKey(t)
  const dealer = getF(t, 'dealer')
  const diser = getF(t, 'diser')
  // "Scheduled Date" reflects a closed ticket, not just the narrower INSTALLED/COMPLETED
  // pair isInstalledWorkflowStatus checks — DONE_DISMANTLE/DONE_SYSTEM_REPROCESS/DONE_MOUNTING
  // are also closing statuses (see Tickets.tsx's alreadyClosed list) and were being hidden here.
  const isCompleted = isInstalledWorkflowStatus(t.status)
    || ['DONE_DISMANTLE', 'DONE_SYSTEM_REPROCESS', 'DONE_MOUNTING', 'DONE_RELOCATED'].includes((t.status || '').toUpperCase())
  const paymentAmt = formatPaymentAmount(t)
  const paymentMode = getPaymentMode(t)
  const archivedSched = formatDateKeyLabel(getArchivedScheduleDate(t))
  const installedDate = formatDateKeyLabel(getInstalledDateKey(t))
  const isDuplicateName = duplicateNameKeys.has(normalizeCustomerKey(custName))
  const updateColor = scheduleStatusValue === 'DONE_CLEANING'
    || scheduleStatusValue === 'DONE_CHECKUP'
    || scheduleStatusValue === 'DONE_BACKJOB'
    || scheduleStatusValue === 'DONE_MOUNTING'
    || scheduleStatusValue === 'DONE_SYSTEM_REPROCESS'
    || scheduleStatusValue === 'DONE_DISMANTLE'
    || scheduleStatusValue === 'DONE_RELOCATED'
    ? (isLight ? '#1d4ed8' : '#93c5fd')
    : green
  const branchName = formatAssignedBranchLabel(t.branchId || t.branch_id)

  return ReactDOM.createPortal((
    <div className="fixed inset-0 z-[2147483647] flex items-end sm:items-center justify-center p-0 sm:p-3"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          maxHeight: 'min(100dvh, 100vh)',
          height: 'min(100dvh, 100vh)',
          maxWidth: showHistoryPanel
            ? 'min(1480px, calc(100vw - 0px))'
            : 'min(720px, 100vw)',
        }}>

        {/* Sticky header — X always visible, never scrolls away */}
        <div
          className="sticky top-0 z-20 flex flex-col px-4 sm:px-6 py-3 sm:py-4 shrink-0 gap-2.5"
          style={{
            borderBottom: `1px solid ${border}`,
            backgroundColor: isLight ? '#f8fafc' : '#111827',
          }}
        >
          <div className="flex items-start justify-between w-full gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black leading-tight uppercase tracking-wide" style={{ color: textPrimary }}>
                  {custName || 'Direct Client'}
                </h2>
                {onOpenStatusPicker ? (
                  <button
                    type="button"
                    onClick={(e) => onOpenStatusPicker(t, e.currentTarget as HTMLElement)}
                    className="h-8 px-3.5 rounded-md text-xs font-black shrink-0 uppercase tracking-wide border transition-all active:scale-95 hover:opacity-85 cursor-pointer shadow-xs flex items-center justify-center"
                    style={{
                      color: scheduleBadgeStyle.color,
                      backgroundColor: scheduleBadgeStyle.backgroundColor,
                      borderColor: scheduleBadgeStyle.borderColor,
                    }}
                    title="Click to change status"
                  >
                    {scheduleStatusDisplay}
                  </button>
                ) : (
                  <span
                    className="h-8 px-3.5 rounded-md text-xs font-bold shrink-0 uppercase tracking-wide border flex items-center justify-center"
                    style={{
                      color: scheduleBadgeStyle.color,
                      backgroundColor: scheduleBadgeStyle.backgroundColor,
                      borderColor: scheduleBadgeStyle.borderColor,
                    }}
                  >
                    {scheduleStatusDisplay}
                  </span>
                )}
                {branchName && branchName !== EMPTY_CELL && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md shrink-0 uppercase" style={{
                    backgroundColor: inputBg,
                    color: textMuted,
                    border: `1px solid ${border}`,
                  }}>
                    {branchName}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-base sm:text-lg font-black tracking-tight uppercase" style={{ color: textPrimary }}>
                {t.ticketNumber || t.ticket_number || EMPTY_CELL}
              </p>
              {isDuplicateName && (
                <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-500/10" style={{ color: isLight ? '#a16207' : '#fbbf24' }}>
                  Duplicate Name
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowChecklist(true)}
                className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30"
                style={{ borderColor: border, backgroundColor: inputBg, color: textPrimary }}
                title={locked ? 'View 15Q Confirmation Checklist (read only)' : 'View & Fill 15Q Confirmation Checklist'}
              >
                <ClipboardList className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">15Q Checklist</span>
                <span className="sm:hidden">15Q</span>
                {hasChecklist && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
              {onEdit && !locked && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="p-2 shrink-0 rounded-xl border transition-colors hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-600"
                  style={{ borderColor: border, backgroundColor: inputBg, color: textMuted }}
                  aria-label="Edit ticket"
                  title="Edit ticket"
                >
                  <Edit3 className="w-4.5 h-4.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="p-2 shrink-0 rounded-xl border transition-colors hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500"
                  style={{ borderColor: border, backgroundColor: inputBg, color: textMuted }}
                  aria-label="Delete ticket"
                  title="Delete ticket"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 shrink-0 rounded-xl border transition-colors hover:bg-slate-500/10"
                style={{ borderColor: border, backgroundColor: inputBg, color: textMuted }}
                aria-label="Close details"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t text-xs w-full text-center items-center justify-center" style={{ borderColor: border }}>
            <div className="flex flex-col items-center justify-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Category</span>
              <span className="font-extrabold text-xs text-emerald-500 uppercase">{t.ticketCategory || t.ticket_category || EMPTY_CELL}</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Relayed By</span>
              <span className="font-black text-xs uppercase" style={{ color: textPrimary }}>
                {getFirstNameUpper(t.createdBy || t.customerEmail || 'System')}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Negotiator</span>
              <span className="font-black text-xs uppercase" style={{ color: textPrimary }}>
                {getFirstNameUpper(negotiatorName)}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Negotiator No.</span>
              <span className="font-bold text-xs" style={{ color: negotiatorPhone ? '#10B981' : textMuted }}>
                {negotiatorPhone ? (
                  <a href={`tel:${negotiatorPhone.replace(/\D/g, '').replace(/^0/, '+63')}`} className="hover:underline">
                    {fmtPhone(negotiatorPhone) || negotiatorPhone}
                  </a>
                ) : EMPTY_CELL}
              </span>
            </div>
          </div>
        </div>

        {/* Side-by-side book layout when showHistoryPanel is open */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x" style={{ borderColor: border }}>
          {/* Left Side: Ticket Details */}
          <div className={`flex-1 min-h-0 overflow-y-auto ${showHistoryPanel ? 'w-full md:w-1/2' : 'w-full'}`}>
            <div className="p-4 sm:p-6 space-y-6">
              <div>
                <SHead isLight={isLight} title="Client & Location Details" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DField isLight={isLight} label="Customer" value={custName} />
                  <DField isLight={isLight} label="Contact" value={
                    allPhones.length > 1 ? (
                      <span className="flex flex-col gap-0.5">
                        {allPhones.map((p, i) => <span key={i}>{fmtPhone(p) || p}</span>)}
                      </span>
                    ) : (phone ? (fmtPhone(phone) || phone) : EMPTY_CELL)
                  } />
                  {!isMyTickets && (
                    <DField isLight={isLight} label="Address" value={addr} className="sm:col-span-2" />
                  )}
                  <DField isLight={isLight} label="District" value={district || resolveTicketDistrict(t) || EMPTY_CELL} className={isMyTickets ? "sm:col-span-2" : ""} />
                </div>
              </div>

              <div>
                <SHead isLight={isLight} title="Service & Equipment" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DField isLight={isLight} label="Brand / Unit" value={brand || EMPTY_CELL} className="sm:col-span-2" />
                  <DField isLight={isLight} label="Service / Driver" value={serviceDriver || EMPTY_CELL} />
                  <DField isLight={isLight} label={isTaguigServices ? "Technician" : "Installer / Technician"} value={installer || EMPTY_CELL} />
                  <DField isLight={isLight} label={isTaguigServices ? "Endorsed By" : "Dealer / Store"} value={dealer || EMPTY_CELL} />
                  <DField isLight={isLight} label="Diser" value={diser || EMPTY_CELL} />
                  <DField isLight={isLight} label="Control No. / SI" value={t.controlNumber || t.control_number || EMPTY_CELL} />
                  {ROBINSON_APPLIANCES_RE.test(dealer || '') && (
                    <DField isLight={isLight} label="Transaction ID" value={String(parseAcMeta(t).robinsonsTransactionId || '') || EMPTY_CELL} />
                  )}
                </div>
              </div>

              <div>
                <SHead isLight={isLight} title="Schedule" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DField isLight={isLight} label="Preferred Date" value={formatDisplayDate(preferredDate)} />
                  <DField isLight={isLight} label="Final Schedule" value={formatDisplayDate(finalScheduleDate)} green />
                  {isCompleted && archivedSched && (
                    <DField isLight={isLight} label="Scheduled Date" value={archivedSched} />
                  )}
                  {installedDate && (
                    <DField isLight={isLight} label="Installed Date" value={installedDate} />
                  )}
                </div>
              </div>

              <div>
                <SHead isLight={isLight} title="Payment Details" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DField isLight={isLight} label="Mode of Payment" value={paymentMode || 'NO PAYMENT'} />
                  <DField isLight={isLight} label="Payment Amount" value={paymentAmt || '₱0'} green={paymentAmt !== '₱0' && paymentAmt !== 'FREE ₱0'} />
                </div>
              </div>

              <div className="space-y-4">
                {commit && (
                  <div>
                    <SHead isLight={isLight} title={isTaguigServices ? "Commit (Amount)" : "Commit / Description"} />
                    <p className="text-xs leading-relaxed rounded-xl p-4"
                      style={{ backgroundColor: inputBg, color: textPrimary, border: `1px solid ${border}` }}>
                      {commit}
                    </p>
                  </div>
                )}
                {note && (
                  <div>
                    <SHead isLight={isLight} title={isTaguigServices ? "Confirmation" : "Note"} />
                    <p className="text-xs leading-relaxed rounded-xl p-4 font-semibold"
                      style={{ backgroundColor: inputBg, color: '#EF4444', border: `1px solid ${border}` }}>
                      {note}
                    </p>
                  </div>
                )}
                <div>
                  <SHead isLight={isLight} title={isTaguigServices ? "Service Status" : "Remarks / Update"} />
                  <p className="text-xs leading-relaxed rounded-xl p-4 font-semibold break-words whitespace-pre-wrap"
                    style={{ backgroundColor: inputBg, color: update ? updateColor : textMuted, border: `1px solid ${border}` }}>
                    {update || EMPTY_CELL}
                  </p>
                </div>
              </div>

              <TicketPhotoGallery
                ticket={t}
                isLight={isLight}
                canManage={false}
                user={user}
                branchLabel={branchName && branchName !== EMPTY_CELL ? branchName : undefined}
                onPhotosChange={(photos) => {
                  const serialized = photos.length ? JSON.stringify(photos) : null
                  const updated = { ...currentTicket, photoAttachments: serialized, photo_attachments: serialized }
                  setCurrentTicket(updated)
                  onUpdateTicket?.(updated)
                }}
              />

              {/* Actions at bottom of details column */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-2 pb-6 sm:pb-2 border-t" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={onToggleHistory}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
                >
                  <Clock className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                  {showHistoryPanel ? 'Hide Update History' : 'View Update History'}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all hover:bg-indigo-500/10"
                    style={{ borderColor: inputBorder, color: textPrimary, backgroundColor: inputBg }}
                  >
                    <Edit3 className="w-3.5 h-3.5" style={{ color: '#6366F1' }} />
                    Edit Details
                  </button>
                )}
                {isAdmin && onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all hover:bg-red-500/10 hover:border-red-500/30"
                    style={{ borderColor: inputBorder, color: '#EF4444', backgroundColor: inputBg }}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    Delete Ticket
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Side: Update History Panel — compact feed log */}
          {showHistoryPanel && (
            <div
              className="w-full md:w-1/2 flex flex-col min-h-0"
              style={{ backgroundColor: isLight ? '#f8fafc' : '#0b1828' }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-2 shrink-0"
                style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f1f5f9' : '#0d1b2e' }}
              >
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Update History</span>
                  <span className="text-[9px] font-bold ml-1" style={{ color: textMuted }}>
                    · {history.length} {history.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                {/* Hide button — visible on mobile to go back to ticket details */}
                <button
                  type="button"
                  onClick={onHideHistory}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all hover:opacity-80 active:scale-95 md:hidden"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
                >
                  <ChevronDown className="w-3 h-3 rotate-90" />
                  Back to Details
                </button>
              </div>

              {/* Compact feed list */}
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-10 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: green }} />
                    <span className="text-xs" style={{ color: textMuted }}>Loading…</span>
                  </div>
                ) : (() => {
                  const listToRender = [...history].sort(
                    (a, b) => new Date(b.createdAt || b.created_at || Date.now()).getTime() - new Date(a.createdAt || a.created_at || Date.now()).getTime(),
                  )
                  if (listToRender.length === 0) {
                    return (
                      <div className="flex items-center justify-center py-10">
                        <p className="text-xs" style={{ color: textMuted }}>No history recorded yet.</p>
                      </div>
                    )
                  }
                  return (
                    <div style={{ position: 'relative' }}>
                      {/* Vertical timeline line */}
                      <div style={{
                        position: 'absolute',
                        left: 7,
                        top: 8,
                        bottom: 8,
                        width: 1,
                        backgroundColor: isLight ? '#e2e8f0' : '#1e3a5f',
                        zIndex: 0,
                      }} />
                      {listToRender.map((h, idx) => {
                        const rawDate = h.createdAt || h.created_at
                        const dateObj = rawDate ? new Date(rawDate) : new Date()
                        const dateStr = dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                        const timeStr = dateObj.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
                        const rawNoteString = h.changeNote || h.note || h.description || h.remarks || h.reason || h.action || ''
                        const spec = parseHistorySpecifics(rawNoteString)
                        const actor = (h.changedByUserName || h.actorName || h.changed_by || h.createdBy || 'System').split(' ')[0].toUpperCase()
                        const isMovedNote = /^Moved to/i.test(spec.title)
                        const hasStatusChange = h.newStatus && h.newStatus !== h.previousStatus
                        const hasDateChange = h.newPreferredDate && h.newPreferredDate !== h.previousPreferredDate && !isMovedNote
                        const hasAssigneeChange = !!(h.previousAssignedTo && h.newAssignedTo && h.previousAssignedTo !== h.newAssignedTo && h.newAssignedToName)
                        const isFirst = idx === 0
                        const dotColor = isFirst ? '#10B981' : (isLight ? '#cbd5e1' : '#1e3a5f')
                        const hasBadges = hasStatusChange || hasDateChange || hasAssigneeChange || spec.driver || spec.installer || spec.dealer || spec.payment || spec.controlNo
                        return (
                          <div
                            key={h.id || idx}
                            style={{ position: 'relative', display: 'flex', gap: 10, paddingBottom: 14, zIndex: 1 }}
                          >
                            {/* Timeline dot */}
                            <div style={{
                              width: 15,
                              height: 15,
                              borderRadius: '50%',
                              backgroundColor: isFirst ? '#10B981' : (isLight ? '#e2e8f0' : '#1e3a5f'),
                              border: `2px solid ${dotColor}`,
                              flexShrink: 0,
                              marginTop: 2,
                              zIndex: 2,
                            }} />

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {/* Title row */}
                              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4, marginBottom: 1 }}>
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: isFirst ? (isLight ? '#059669' : '#34d399') : textPrimary,
                                  lineHeight: '1.3',
                                  flex: 1,
                                  minWidth: 0,
                                }}>
                                  {spec.title}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, flexShrink: 0, opacity: 0.7, letterSpacing: '0.02em' }}>
                                  {dateStr}, {timeStr}
                                </span>
                              </div>

                              {/* Author line */}
                              <div style={{ fontSize: 9.5, color: textMuted, marginBottom: hasBadges || spec.remarks ? 5 : 0 }}>
                                by <span style={{ fontWeight: 700, color: textPrimary }}>{actor}</span>
                              </div>

                              {/* Remarks — slim inline callout */}
                              {spec.remarks && (
                                <div style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: isLight ? '#92400e' : '#fcd34d',
                                  backgroundColor: isLight ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.08)',
                                  borderLeft: '2px solid #f59e0b',
                                  padding: '3px 7px',
                                  borderRadius: '0 4px 4px 0',
                                  marginBottom: hasBadges ? 5 : 0,
                                  wordBreak: 'break-word',
                                }}>
                                  {spec.remarks}
                                </div>
                              )}

                              {/* Mini compact badges row */}
                              {hasBadges && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {hasStatusChange && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 700, padding: '1.5px 6px', borderRadius: 4, backgroundColor: isLight ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.18)', color: isLight ? '#4338ca' : '#a5b4fc', border: `1px solid ${isLight ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.3)'}` }}>
                                      {h.previousStatus || 'NONE'} → {h.newStatus}
                                    </span>
                                  )}
                                  {hasDateChange && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 700, padding: '1.5px 6px', borderRadius: 4, backgroundColor: isLight ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.15)', color: isLight ? '#b45309' : '#fcd34d', border: `1px solid ${isLight ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.3)'}` }}>
                                      {formatDisplayDate(h.previousPreferredDate, 'none')} → {formatDisplayDate(h.newPreferredDate)}
                                    </span>
                                  )}
                                  {hasAssigneeChange && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 700, padding: '1.5px 6px', borderRadius: 4, backgroundColor: isLight ? 'rgba(20,184,166,0.1)' : 'rgba(20,184,166,0.15)', color: isLight ? '#0f766e' : '#5eead4', border: `1px solid ${isLight ? 'rgba(20,184,166,0.2)' : 'rgba(20,184,166,0.3)'}` }}>
                                      → {h.newAssignedToName}
                                    </span>
                                  )}
                                  {spec.driver && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 600, padding: '1.5px 6px', borderRadius: 4, backgroundColor: isLight ? 'rgba(100,116,139,0.08)' : 'rgba(100,116,139,0.14)', color: textPrimary, border: `1px solid ${border}` }}>
                                      <span style={{ color: textMuted, marginRight: 3 }}>DRIVER:</span>{spec.driver}
                                    </span>
                                  )}
                                  {spec.installer && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 600, padding: '1.5px 6px', borderRadius: 4, backgroundColor: isLight ? 'rgba(100,116,139,0.08)' : 'rgba(100,116,139,0.14)', color: textPrimary, border: `1px solid ${border}` }}>
                                      <span style={{ color: textMuted, marginRight: 3 }}>INSTALLER:</span>{spec.installer}
                                    </span>
                                  )}
                                  {spec.dealer && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 600, padding: '1.5px 6px', borderRadius: 4, backgroundColor: isLight ? 'rgba(100,116,139,0.08)' : 'rgba(100,116,139,0.14)', color: textPrimary, border: `1px solid ${border}` }}>
                                      <span style={{ color: textMuted, marginRight: 3 }}>DEALER / STORE:</span>{spec.dealer}
                                    </span>
                                  )}
                                  {spec.payment && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 700, padding: '1.5px 6px', borderRadius: 4, backgroundColor: isLight ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.15)', color: isLight ? '#047857' : '#6ee7b7', border: `1px solid ${isLight ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.3)'}` }}>
                                      <span style={{ opacity: 0.7, marginRight: 3 }}>PAYMENT:</span>{spec.payment}
                                    </span>
                                  )}
                                  {spec.controlNo && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 600, padding: '1.5px 6px', borderRadius: 4, backgroundColor: isLight ? 'rgba(100,116,139,0.08)' : 'rgba(100,116,139,0.14)', color: textMuted, border: `1px solid ${border}` }}>
                                      <span style={{ marginRight: 2 }}>REF:</span>#{spec.controlNo}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
        {showChecklist && (
          <ConfirmationChecklistModal
            ticket={currentTicket}
            isLight={isLight}
            readOnly={locked}
            onClose={() => setShowChecklist(false)}
            onSaved={(updated) => {
              setCurrentTicket(updated)
              onUpdateTicket?.(updated)
            }}
          />
        )}
      </div>
    </div>
  ), document.body)
}
