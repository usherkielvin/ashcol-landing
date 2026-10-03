import { memo, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { AlertTriangle, X, ClipboardList } from 'lucide-react'
import { ConfirmationChecklistModal, isChecklistFilled } from '../tickets/ConfirmationChecklistModal'
import { TicketPhotoGallery } from '../tickets/TicketPhotoGallery'
import { useAuth } from '../../contexts/AuthContext'
import type { Ticket } from '../../utils/ticketTypes'
import { API_BASE_URL, isFranchiseBranch } from '../../utils/api'
import { resolveScheduleStatusFields } from '../../constants/ticketCategories'
import { buildRelayEditDraft, type RelayEditDraft } from './relayEditForm'
import type { TicketEditSurface } from '../../utils/ticketEditBridge'
import type { DealerOption } from '../DealerSelect'
import { derivePaymentSummary } from '../../utils/ticketPayment'
import {
  StatusGrid,
  resolveEffectiveStatusForGrid,
  StatusChangeConfirmDialog,
  type StatusConfirmState,
  DealerSection,
  CustomerDetailsSection,
  AirconDetailsSection,
  BranchNegotiatorSection,
  SchedulingSection,
  DispatchSection,
  PaymentSection,
  RemarksSection,
  type RelayFormTheme,
  type PaymentRow,
} from './ticketForm'

type Branch = { id: string; name: string }
type Employee = { id: string; name?: string; branchId?: string | null; phone?: string | null }
type TicketLike = Parameters<typeof buildRelayEditDraft>[0] & { id: string; customerName?: string }

type ParsedStore = { store: string; branch: string; customStore?: string }

export type ScheduleStatusOption = { value: string; label: string; group?: string }

export type RelayEditTicketModalProps = {
  ticket: TicketLike
  ticketNumberLabel: string
  surface?: TicketEditSurface
  isAdmin: boolean
  isLight: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  compactInput: string
  branches: Branch[]
  relayCustomStores: string[]
  onPersistCustomStores: (stores: string[]) => void
  dealers?: DealerOption[]
  onDealersChanged?: () => void
  parseStoreVendor: (sourceVendor?: string) => ParsedStore
  resolveBranch: (branchId?: string) => Branch | null
  negotiatorsForBranch: (branchId?: string | null) => Employee[]
  mergeCandidates?: TicketLike[]
  mergeTargetId?: string
  merging?: boolean
  actionSaving?: boolean
  saving?: boolean
  showDelete?: boolean
  driverRoster?: string[]
  installerRoster?: string[]
  isTaguigServices?: boolean
  /** Fetched technician accounts for this branch — when provided, replaces free-text with a dropdown. */
  technicianOptions?: { id: string; name: string; label?: string }[]

  editOriginalDate?: string
  onMergeTargetChange?: (id: string) => void
  onMerge?: () => void
  onClose: () => void
  onDelete?: () => void
  onSave: (draft: RelayEditDraft) => void
  /** Fired when the 15Q checklist modal persists on its own (a plain PATCH, not a full drawer save) —
   *  just merges the already-saved fields into local state, distinct from onSave's RelayEditDraft shape. */
  onTicketPatched?: (ticket: TicketLike) => void
  getTicketNumber: (ticket: any) => string
  parseAcDetails: (ticket: any) => { finalDate?: string; previousScheduleDates?: string[] }
  draftExtensions?: Partial<RelayEditDraft>
  /** Opens the guarded Close Ticket dialog (field surfaces only). */
  onRequestCloseTicket?: () => void
  /** Outcome label when the ticket is already closed (admin editing a closed ticket). */
  closedLabel?: string
}

const STANDARD_PAYMENT_MODES = new Set(['CASH', 'GCASH', 'BANK TRANSFER', 'CHEQUE', 'FOR COLLECTION', 'NO_PAYMENT', 'FREE', 'FREE INSTALL', 'PENDING'])

function seedPaymentRows(ticket: TicketLike, draftExtensions?: Partial<RelayEditDraft>): PaymentRow[] {
  const metaBreakdown = (ticket as any)?.acDetails ? (() => {
    try {
      const parsed = typeof (ticket as any).acDetails === 'string' ? JSON.parse((ticket as any).acDetails) : (ticket as any).acDetails
      return Array.isArray(parsed?.paymentBreakdown) ? parsed.paymentBreakdown : null
    } catch { return null }
  })() : null

  if (metaBreakdown && metaBreakdown.length > 0) {
    return metaBreakdown.map((p: any) => {
      const m = String(p.mode || 'CASH').toUpperCase()
      const isStd = STANDARD_PAYMENT_MODES.has(m)
      return {
        mode: isStd ? m : 'CUSTOM',
        amount: Number(p.amount) || 0,
        customMode: isStd ? '' : m,
      }
    })
  }

  const currentMode = String(draftExtensions?.modeOfPayment || (ticket as any)?.modeOfPayment || (ticket as any)?.mode_of_payment || 'NO_PAYMENT').toUpperCase()
  const currentAmt = Number(draftExtensions?.installationCharges ?? (ticket as any)?.installationCharges ?? (ticket as any)?.installation_charges ?? 0)
  const isStd = STANDARD_PAYMENT_MODES.has(currentMode)
  return [{
    mode: isStd ? currentMode : 'CUSTOM',
    amount: currentAmt,
    customMode: isStd ? '' : currentMode,
  }]
}

function RelayEditTicketModalInner(props: RelayEditTicketModalProps) {
  const {
    ticket,
    ticketNumberLabel,
    surface = 'relay',
    isLight,
    cardBg,
    border,
    textPrimary,
    textMuted,
    inputBg,
    inputBorder,
    compactInput,
    branches,
    dealers = [],
    onDealersChanged,
    parseStoreVendor,
    resolveBranch,
    negotiatorsForBranch,
    mergeCandidates = [],
    mergeTargetId = '',
    merging = false,
    actionSaving = false,
    saving = false,
    driverRoster = [],
    installerRoster = [],
    isTaguigServices = false,
    technicianOptions = [],

    editOriginalDate = '',
    onMergeTargetChange,
    onMerge,
    onClose,
    onSave,
    onTicketPatched,
    getTicketNumber,
    parseAcDetails,
    draftExtensions,
  } = props

  const { user } = useAuth()
  const isFieldSurface = surface !== 'relay'
  const isOverview = surface === 'overview'
  const initialDraftRef = useRef('')

  const [draft, setDraft] = useState<RelayEditDraft>(() =>
    buildRelayEditDraft(ticket, parseStoreVendor, resolveBranch, draftExtensions),
  )
  const [showHistory, setShowHistory] = useState(false)
  const [show15QChecklist, setShow15QChecklist] = useState(false)
  const rawChecklist = (ticket as any).confirmationChecklist || (ticket as any).confirmation_checklist
  const has15QChecklist = isChecklistFilled(rawChecklist)
  const [confirmModal, setConfirmModal] = useState<StatusConfirmState | null>(null)
  const [editPayments, setEditPayments] = useState<PaymentRow[]>(() => seedPaymentRows(ticket, draftExtensions))

  useEffect(() => {
    const next = buildRelayEditDraft(ticket, parseStoreVendor, resolveBranch, draftExtensions)
    setDraft(next)
    initialDraftRef.current = JSON.stringify(next)
    setEditPayments(seedPaymentRows(ticket, draftExtensions))
  }, [ticket.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const requestClose = () => {
    if (JSON.stringify(draft) !== initialDraftRef.current) {
      setConfirmModal({
        type: 'discard',
        onConfirm: () => { onClose() },
      })
      return
    }
    onClose()
  }

  const isReschedStatus = (draft.scheduleStatus || '').toUpperCase() === 'RESCHED'

  const isSaving = saving || actionSaving

  const patch = (updates: Partial<RelayEditDraft>) => setDraft((prev) => {
    const uppercased: any = {}
    for (const key in updates) {
      const val = (updates as any)[key]
      if (typeof val === 'string' && !['id', 'assignTechId', 'assignBranchId'].includes(key)) {
        uppercased[key] = val.toUpperCase()
      } else {
        uppercased[key] = val
      }
    }
    return { ...prev, ...uppercased }
  })

  const inputStyle = useMemo(() => ({
    backgroundColor: inputBg,
    borderColor: inputBorder,
    color: textPrimary,
    fontFamily: 'inherit',
    textTransform: 'none' as const,
  }), [inputBg, inputBorder, textPrimary])

  const relayInput = `${compactInput} normal-case`

  const relayFormTheme: RelayFormTheme = {
    isLight, cardBg, border, textPrimary, textMuted, inputBg, inputBorder,
    inputClassName: relayInput,
    getInputStyle: () => inputStyle,
  }

  const installerSelectOptions = useMemo(() => {
    if (technicianOptions && technicianOptions.length > 0) return technicianOptions
    if (installerRoster && installerRoster.length > 0) {
      return installerRoster.map((name, idx) => ({ id: `roster-${idx}`, name, label: name }))
    }
    return []
  }, [technicianOptions, installerRoster])

  const negotiatorOptions = negotiatorsForBranch(draft.assignBranchId || undefined)
  const negotiatorPhone = (negotiatorsForBranch(undefined).find((emp) => emp.id === draft.assignTechId)?.phone || draft.negotiatorPhone || '')

  const applyPaymentRows = (next: PaymentRow[]) => {
    setEditPayments(next)
    const summary = derivePaymentSummary(next)
    patch({
      modeOfPayment: summary.modeOfPayment,
      installationCharges: summary.installationCharges,
      paymentBreakdown: summary.paymentBreakdown,
    })
  }

  const allAvailableBranches = useMemo(() => {
    return (branches || []).filter(b => !(b as any).isFranchise && !isFranchiseBranch(b.id) && !isFranchiseBranch(b.name))
  }, [branches])

  return (
    <>
      {ReactDOM.createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex flex-col overflow-hidden ${isOverview ? 'bg-white dark:bg-[#0a1120] sm:bg-black/50' : ''} sm:items-center sm:justify-center sm:p-4`}
      style={isOverview ? undefined : { backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className={`w-full uppercase flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 min-h-0 ${isOverview ? 'h-full sm:h-auto sm:max-h-[94vh] sm:max-w-6xl sm:rounded-2xl' : 'max-w-6xl rounded-none sm:rounded-2xl sm:max-h-[94vh] h-full sm:h-auto'}`}
        style={{ backgroundColor: cardBg, border: isOverview ? 'none' : `1px solid ${border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 shrink-0 safe-area-top" style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
          <div className="min-w-0 flex-1 mr-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] mb-1" style={{ color: textMuted }}>Edit ticket</p>
            <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black leading-tight uppercase tracking-wide flex items-center gap-2.5 min-w-0" style={{ color: textPrimary }}>
                <span className="text-sm sm:text-base px-2.5 py-1 rounded-lg font-extrabold tracking-tight shrink-0" style={{ backgroundColor: '#10B981', color: 'white' }}>
                  {ticketNumberLabel}
                </span>
                {draft.customerName && (
                  <span className="truncate max-w-[14rem] sm:max-w-md" title={draft.customerName.toUpperCase()}>
                    {draft.customerName.toUpperCase()}
                  </span>
                )}
              </h2>
              {editOriginalDate && isFieldSurface && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border" style={{ color: textMuted, borderColor: border }}>
                  Scheduled {editOriginalDate}
                </span>
              )}
              {isOverview && (() => {
                const parsed = parseAcDetails ? parseAcDetails(ticket) : {}
                const hasHistory = !!(ticket.remarksUpdate || (parsed as any).remarksUpdate || ((parsed as any).previousScheduleDates && (parsed as any).previousScheduleDates.length > 0))
                if (!hasHistory) return null
                return (
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="px-2 py-0.5 rounded text-[9px] font-bold border transition-colors shrink-0"
                    style={{
                      backgroundColor: showHistory ? (isLight ? '#f1f5f9' : '#1e293b') : 'transparent',
                      borderColor: inputBorder,
                      color: textMuted
                    }}
                  >
                    {showHistory ? 'Hide History' : 'View History'}
                  </button>
                )
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShow15QChecklist(true)}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30 shrink-0"
              style={{ borderColor: inputBorder, backgroundColor: inputBg, color: textPrimary }}
              title="View & Fill 15Q Confirmation Checklist"
            >
              <ClipboardList className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="hidden sm:inline">15Q CHECKLIST</span>
              <span className="sm:hidden">15Q</span>
              {has15QChecklist && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
            <button type="button" onClick={requestClose} className="p-2 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X className="w-5 h-5" style={{ color: textMuted }} />
            </button>
          </div>
        </div>

        {showHistory && isOverview && (() => {
          const parsed = parseAcDetails ? parseAcDetails(ticket) : {}
          const historyText = ticket.remarksUpdate || (parsed as any).remarksUpdate || 'No remarks history.'
          return (
            <div className="px-4 sm:px-6 py-3 border-b shrink-0" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
              <div className="rounded-xl p-3 sm:p-4 animate-in slide-in-from-top-2 duration-200" style={{ backgroundColor: isLight ? '#f1f5f9' : '#0f172a', border: `1px solid ${border}` }}>
                <h4 className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: textMuted }}>Update History</h4>
                <div className="text-xs space-y-2 whitespace-pre-wrap" style={{ color: textPrimary, lineHeight: 1.6 }}>
                  {historyText}
                </div>
              </div>
            </div>
          )
        })()}

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6 min-h-0">

          <div className="flex flex-col gap-5 mb-6 pb-6 border-b" style={{ borderColor: border }}>
            <StatusGrid
              currentStatus={resolveEffectiveStatusForGrid(
                isFieldSurface ? draft.scheduleStatus : draft.updateStatus,
                draft.serviceType,
              )}
              onRequestChange={(st) => {
                setConfirmModal({
                  type: 'status',
                  targetLabel: st.label,
                  onConfirm: () => {
                    patch({
                      scheduleStatus: st.value,
                      updateStatus: st.value,
                      serviceType: st.value,
                      ticketCategory: resolveScheduleStatusFields(st.value).ticketCategory || 'INSTALLATION',
                    })
                  },
                })
              }}
              isLight={isLight}
              border={border}
              textMuted={textMuted}
              onCloseTicket={isFieldSurface ? props.onRequestCloseTicket : undefined}
              closedLabel={props.closedLabel}
            />
          </div>

          {/* 1. Dealer & transaction */}
          <DealerSection
            step={1}
            dealer={draft.dealerName}
            onDealerChange={(name) => patch({ dealerName: name })}
            dealerBranch={draft.dealerBranch}
            onDealerBranchChange={(v) => patch({ dealerBranch: v })}
            diser={draft.diser}
            onDiserChange={(v) => patch({ diser: v })}
            transactionId={draft.robinsonsTransactionId}
            onTransactionIdChange={(v) => patch({ robinsonsTransactionId: v })}
            dealers={dealers}
            onDealersChanged={onDealersChanged}
            theme={relayFormTheme}
          />

          {/* 2. Customer details */}
          <CustomerDetailsSection
            step={2}
            customerName={draft.customerName}
            onCustomerNameChange={(v) => patch({ customerName: v })}
            phoneNumbers={draft.phoneNumbers}
            onPhoneNumbersChange={(next) => patch({ phoneNumbers: next })}
            address={draft.location}
            district={draft.district}
            onLocationChange={({ location, district }) => patch({ location, district: district ?? draft.district })}
            onDistrictChange={(v) => patch({ district: v })}
            landmark={draft.landmarks}
            onLandmarkChange={(v) => patch({ landmarks: v })}
            theme={relayFormTheme}
          />

          {/* 3. Aircon details */}
          <AirconDetailsSection
            step={3}
            brand={draft.brand}
            onBrandChange={(v) => patch({ brand: v, brandHp: `${v} ${draft.capacity}`.trim() })}
            capacity={draft.capacity}
            onCapacityChange={(v) => patch({ capacity: v, brandHp: `${draft.brand} ${v}`.trim() })}
            sku={draft.sku}
            onSkuChange={(v) => patch({ sku: v })}
            serialNumber={draft.serialNumber}
            onSerialNumberChange={(v) => patch({ serialNumber: v })}
            commitType={draft.commitType}
            onCommitTypeChange={(v) => patch({ commitType: v })}
            controlNumber={isFieldSurface ? { value: draft.controlNumber, onChange: (v) => patch({ controlNumber: v }) } : undefined}
            voucher={draft.images ? { url: draft.images.startsWith('http') ? draft.images : `${API_BASE_URL.replace('/api', '')}${draft.images}`, label: draft.images.split('/').pop() || draft.images } : undefined}
            theme={relayFormTheme}
          />

          {/* 4. Branch & assignment */}
          <BranchNegotiatorSection
            step={4}
            title="Branch and Negotiator"
            branchId={draft.assignBranchId}
            onBranchChange={(branchId) => {
              const nextBranchId = resolveBranch(branchId)?.id || branchId
              const hadNegotiator = !!draft.assignTechId
              patch({
                assignBranchId: nextBranchId,
                assignTechId: '',
                negotiatorPhone: '',
                updateStatus: hadNegotiator && (draft.updateStatus === 'ASSIGNED' || draft.updateStatus === 'SCHEDULED')
                  ? 'PENDING'
                  : draft.updateStatus,
              })
            }}
            branches={allAvailableBranches}
            negotiatorId={draft.assignTechId}
            onNegotiatorChange={(val) => {
              const foundEmp = negotiatorsForBranch(undefined).find((emp) => emp.id === val)
                || negotiatorOptions.find((emp) => emp.id === val)
              const negoBranchId = foundEmp?.branchId ? (resolveBranch(foundEmp.branchId)?.id || foundEmp.branchId) : draft.assignBranchId
              const profilePhone = foundEmp?.phone || ''
              patch({
                assignTechId: val,
                assignBranchId: negoBranchId,
                negotiatorPhone: profilePhone,
                updateStatus: val && draft.updateStatus === 'PENDING' ? 'ASSIGNED' : draft.updateStatus,
              })
            }}
            negotiators={negotiatorOptions}
            resolveBranchName={(branchId) => resolveBranch(branchId)?.name || ''}
            negotiatorPhone={negotiatorPhone}
            theme={relayFormTheme}
          />

          {/* 5. Scheduling */}
          <SchedulingSection
            step={5}
            subtitle={isOverview ? 'Requested & confirmed dates' : 'Relay, requested & confirmed dates'}
            relayedDate={draft.relayedDate}
            onRelayedDateChange={(v) => patch({ relayedDate: v })}
            requestedDate={draft.preferredDate}
            onRequestedDateChange={(v) => patch({ preferredDate: v })}
            scheduleDate={draft.finalDate}
            onScheduleDateChange={(v) => patch({ finalDate: v })}
            scheduleDateDisabled={isFieldSurface && isReschedStatus && draft.reschedulePending}
            installedDate={draft.actualCompletion}
            onInstalledDateChange={(v) => patch({ actualCompletion: v })}
            reschedPending={isFieldSurface && isReschedStatus ? {
              checked: draft.reschedulePending,
              onChange: (checked) => patch({ reschedulePending: checked }),
            } : undefined}
            theme={relayFormTheme}
          />

          {/* 6. Dispatch */}
          {isFieldSurface && (
            <DispatchSection
              step={6}
              idPrefix={`edit-ticket-${ticket.id}`}
              subtitle="Technician, driver & vehicle assignment"
              isTaguigServices={isTaguigServices}
              installerName={draft.installerName}
              onInstallerChange={(v) => patch({ installerName: v })}
              installerOptions={installerSelectOptions}
              driverName={draft.driverName}
              onDriverChange={(v) => patch({ driverName: v })}
              driverRoster={driverRoster}
              vehicle={draft.serviceDriver}
              onVehicleChange={(v) => patch({ serviceDriver: v })}
              theme={relayFormTheme}
            />
          )}

          {/* 7. Remarks */}
          <RemarksSection
            step={7}
            primaryLabel="Remarks / Update"
            primaryPlaceholder="Type notes, updates, or special instructions..."
            primaryValue={draft.remarksUpdate || draft.remarks || ''}
            onPrimaryChange={(v) => patch({ remarks: v, remarksUpdate: v })}
            theme={relayFormTheme}
          />

          {/* 8. Payment Details */}
          {isFieldSurface && (
            <PaymentSection
              step={8}
              payments={editPayments}
              onPaymentsChange={applyPaymentRows}
              theme={relayFormTheme}
            />
          )}

          {/* 9. Photos — saves on its own (like the 15Q checklist), not through Save Changes */}
          <TicketPhotoGallery
            variant="form"
            ticket={ticket as unknown as Ticket}
            isLight={isLight}
            canManage
            user={user}
            branchLabel={resolveBranch(draft.assignBranchId || undefined)?.name || undefined}
            onPhotosChange={(photos) => {
              const serialized = photos.length ? JSON.stringify(photos) : null
              onTicketPatched?.({ ...ticket, photoAttachments: serialized, photo_attachments: serialized } as TicketLike)
            }}
          />

          {mergeCandidates.length > 0 && onMerge && onMergeTargetChange && (
            <div className="border rounded-xl p-3.5 flex flex-col gap-2.5" style={{ backgroundColor: isLight ? '#fffbeb' : 'rgba(251,191,36,0.06)', borderColor: isLight ? '#fde68a' : 'rgba(251,191,36,0.2)' }}>
              <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wider"><AlertTriangle className="w-4 h-4 shrink-0" /> Duplicate Ticket(s) Detected</span>
              <p className="text-[11px] font-semibold leading-relaxed" style={{ color: textMuted }}>
                We found {mergeCandidates.length} other ticket(s) with the same ticket number or similar customer name. Merge into the scheduled copy to keep the final date.
              </p>
              <div className="flex gap-2">
                <select value={mergeTargetId} onChange={(e) => onMergeTargetChange(e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs outline-none flex-1 font-bold shadow-sm normal-case" style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textPrimary }}>
                  <option value="">-- Select ticket to merge into --</option>
                  {mergeCandidates.map((c) => {
                    const details = parseAcDetails(c)
                    return (
                      <option key={c.id} value={c.id}>
                        {getTicketNumber(c)} ({(c.status || '').toUpperCase()}) - {c.customerName} - {details.finalDate ? `Scheduled ${details.finalDate}` : 'No date'} - [{(c as { dealer?: string; sourceVendor?: string }).dealer || (c as { sourceVendor?: string }).sourceVendor || 'Direct'}]
                      </option>
                    )
                  })}
                </select>
                <button type="button" onClick={onMerge} disabled={!mergeTargetId || merging} className="px-5 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>{merging ? 'Merging...' : 'Merge'}</button>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t shrink-0 safe-area-bottom" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0f172a' }}>
          <div className="hidden sm:block" />
          <div className="flex gap-2.5 w-full sm:w-auto">
            <button type="button" onClick={requestClose} className="flex-1 sm:flex-none px-5 py-2.5 sm:py-2 border rounded-lg text-xs font-bold" style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>Cancel</button>
            <button type="button" onClick={() => onSave(draft)} disabled={isSaving} className="flex-1 sm:flex-none px-6 py-2.5 sm:py-2 text-white rounded-lg text-xs font-bold shadow-md disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )}

  {confirmModal && (
    <StatusChangeConfirmDialog
      state={confirmModal}
      currentStatus={(isFieldSurface ? draft.scheduleStatus : draft.updateStatus) || draft.serviceType}
      onClose={() => setConfirmModal(null)}
      cardBg={cardBg}
      border={border}
      inputBorder={inputBorder}
      textPrimary={textPrimary}
      textMuted={textMuted}
    />
  )}
      {show15QChecklist && (
        <ConfirmationChecklistModal
          ticket={ticket as any}
          isLight={isLight}
          onClose={() => setShow15QChecklist(false)}
          onSaved={(updatedTicket) => {
            // The checklist already PATCHed itself — this is a Ticket, not a RelayEditDraft, so it
            // must not go through onSave (that reconstructs a full drawer-save payload from draft state).
            onTicketPatched?.(updatedTicket as unknown as TicketLike)
          }}
        />
      )}
    </>
  )
}

export const RelayEditTicketModal = memo(RelayEditTicketModalInner)
