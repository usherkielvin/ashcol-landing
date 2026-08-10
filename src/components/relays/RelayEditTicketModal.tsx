import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import { AlertTriangle, FileText, X, Store, UserRound, Wind, Users, CalendarDays, MessageSquare, Info, Truck, ClipboardList } from 'lucide-react'
import { ConfirmationChecklistModal, isChecklistFilled } from '../tickets/ConfirmationChecklistModal'
import { API_BASE_URL, formatBranchName } from '../../utils/api'
import { resolveScheduleStatusFields } from '../../constants/ticketCategories'
import { buildRelayEditDraft, type RelayEditDraft } from './relayEditForm'
import type { TicketEditSurface } from '../../utils/ticketEditBridge'
import { DealerSelect, type DealerOption } from '../DealerSelect'
import { ROBINSON_APPLIANCES_RE } from '../../utils/dealer'
import { isInstalledWorkflowStatus } from '../../utils/ticketHelpers'



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

  editOriginalDate?: string
  onMergeTargetChange?: (id: string) => void
  onMerge?: () => void
  onClose: () => void
  onDelete?: () => void
  onSave: (draft: RelayEditDraft) => void
  getTicketNumber: (ticket: any) => string
  parseAcDetails: (ticket: any) => { finalDate?: string; previousScheduleDates?: string[] }
  draftExtensions?: Partial<RelayEditDraft>
}

const EField = ({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</label>
    {children}
  </div>
)

const ESHead = ({
  title,
  step,
  icon: Icon,
  border,
}: {
  title: string
  subtitle?: string
  step?: number
  icon?: ReactNode
  border: string
}) => (
  <div className="flex items-center gap-2.5 pt-1 pb-2.5 border-b mb-4" style={{ borderColor: border }}>
    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-[#10B981] shrink-0">
      {Icon ?? <span className="text-[11px] font-black">{step}</span>}
    </div>
    <div className="min-w-0">
      <p className="text-[11.5px] font-black uppercase tracking-wider text-[#10B981] leading-tight">{title}</p>
    </div>
  </div>
)

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

    editOriginalDate = '',
    onMergeTargetChange,
    onMerge,
    onClose,
    onSave,
    getTicketNumber,
    parseAcDetails,
    draftExtensions,
  } = props

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
  const [confirmModal, setConfirmModal] = useState<{
    type: 'status' | 'discard'
    targetStatus?: { value: string; label: string }
    onConfirm: () => void
  } | null>(null)

  useEffect(() => {
    const next = buildRelayEditDraft(ticket, parseStoreVendor, resolveBranch, draftExtensions)
    setDraft(next)
    initialDraftRef.current = JSON.stringify(next)
  }, [ticket.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const requestClose = () => {
    if (JSON.stringify(draft) !== initialDraftRef.current) {
      setConfirmModal({
        type: 'discard',
        onConfirm: () => {
          onClose()
        },
      })
      return
    }
    onClose()
  }

  const isReschedStatus = (draft.scheduleStatus || '').toUpperCase() === 'RESCHED'
  const currentStatus = ((isFieldSurface ? draft.scheduleStatus : draft.updateStatus) || draft.serviceType || 'PENDING').toUpperCase()
  // draft.scheduleStatus on the field surface holds the UI-facing schedule outcome (e.g.
  // "DONE_INSTALLED"/"DONE_CLEANING" from getScheduleStatusValue), not the raw backend enum — so
  // both forms need checking here, unlike isInstalledWorkflowStatus's other (raw-status) callers.
  const showInstalledDate = isInstalledWorkflowStatus(currentStatus)
    || currentStatus === 'DONE_INSTALLED' || currentStatus === 'DONE_CLEANING'

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
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black leading-none uppercase tracking-wide flex items-center gap-2.5 flex-wrap" style={{ color: textPrimary }}>
                <span>EDIT TICKET</span>
                <span className="text-lg sm:text-xl px-3 py-0.5 rounded font-extrabold tracking-tight" style={{ backgroundColor: '#10B981', color: 'white', border: `1px solid ${border}` }}>
                  {ticketNumberLabel}
                </span>
                {draft.customerName && (
                  <span className="text-lg sm:text-xl font-black truncate max-w-xs sm:max-w-md" style={{ color: textMuted }}>
                    — {draft.customerName.toUpperCase()}
                  </span>
                )}
              </h2>
              {editOriginalDate && isFieldSurface && (
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: textMuted }}>
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
            <div className="flex flex-col gap-5">
              {(() => {
                const renderStatusButton = (st: { value: string, label: string }) => {
                    let rawStat = (draft.scheduleStatus || draft.updateStatus || draft.serviceType || '').trim().toUpperCase()
                    if (['PENDING', 'ASSIGNED', 'SCHEDULED', 'COMPLETED', ''].includes(rawStat)) {
                      rawStat = (draft.serviceType || 'S/I').trim().toUpperCase()
                    }

                    const targetVal = st.value.toUpperCase()
                    const targetLabel = st.label.toUpperCase()

                    const isSelected =
                      rawStat === targetVal ||
                      rawStat === targetLabel ||
                      ((rawStat === 'SERVICES' || rawStat === 'SERVICE') && (targetVal === 'SERVICE' || targetLabel === 'SERVICE')) ||
                      ((rawStat === 'INSTALLATION' || rawStat === 'INSTALL') && (targetVal === 'INSTALL' || targetLabel === 'INSTALL')) ||
                      ((rawStat === 'SURVEY_INSTALL' || rawStat === 'S/I') && (targetVal === 'S/I' || targetLabel === 'SURVEY_INSTALL'));
                   return (
                     <button
                       key={st.value}
                       type="button"
                       onClick={() => {
                          if (!isSelected) {
                             setConfirmModal({
                               type: 'status',
                               targetStatus: st,
                               onConfirm: () => {
                                 const updates: any = {
                                   scheduleStatus: st.value,
                                   updateStatus: st.value,
                                   serviceType: st.value,
                                   ticketCategory: resolveScheduleStatusFields(st.value).ticketCategory || 'INSTALLATION',
                                 }
                                 
                                 patch(updates)
                               },
                             })
                          }
                       }}
                       className="flex items-center justify-center py-3 px-2 rounded-xl border font-black text-[11px] uppercase tracking-wide transition-all duration-150 select-none cursor-pointer"
                       style={isSelected ? {
                         backgroundColor: '#10B981',
                         borderColor: '#10B981',
                         color: 'white',
                         boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
                       } : {
                         backgroundColor: isLight ? '#f8fafc' : 'rgba(255,255,255,0.02)',
                         borderColor: border,
                         color: textMuted
                       }}
                     >
                       {st.label}
                     </button>
                   )
                }
                
                return (
                  <>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: textMuted }}>Pending</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { value: 'S/I', label: 'SURVEY & INSTALL' },
                          { value: 'INSTALL', label: 'INSTALL' },
                          { value: 'SURVEY', label: 'SURVEY' },
                          { value: 'CLEANING', label: 'CLEANING' },
                          { value: 'CHECKUP', label: 'CHECKUP' },
                          { value: 'BACKJOB', label: 'BACKJOB' },
                          { value: 'SERVICE', label: 'SERVICE' },
                          { value: 'RESCHED', label: 'RESCHED' },
                          { value: 'CONTINUATION', label: 'CONTINUATION' },
                          { value: 'FOR APPROVAL', label: 'FOR QUOTATION' },
                          { value: 'SYSTEM_REPROCESS', label: 'SYSTEM REPROCESS' },
                          { value: 'DISMANTLE', label: 'DISMANTLE' },
                        ].map(renderStatusButton)}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: textMuted }}>Closing</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { value: 'DONE_INSTALLED', label: 'DONE INSTALL' },
                          { value: 'DONE_CLEANING', label: 'DONE CLEANING' },
                          { value: 'DONE_SURVEY', label: 'DONE SURVEY' },
                          { value: 'DONE_CHECKUP', label: 'DONE CHECKUP' },
                          { value: 'DONE_BACKJOB', label: 'DONE BACKJOB' },
                          { value: 'DONE_SERVICE', label: 'DONE SERVICE' },
                          { value: 'DONE_SYSTEM_REPROCESS', label: 'DONE SYSTEM REPROCESS' },
                          { value: 'DONE_DISMANTLE', label: 'DONE DISMANTLE' },
                          { value: 'DONE_QUOTATION', label: 'DONE QUOTATION' },
                          { value: 'CANCELLED', label: 'CANCELLED' },
                        ].map(renderStatusButton)}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          {/* 1. Dealer & transaction */}
          <div>
            <ESHead step={1} icon={<Store className="w-3.5 h-3.5" />} title="Dealer / Store" subtitle="Where the relay came from" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
              <EField label="Dealer / Store">
                <DealerSelect
                  value={draft.dealerName}
                  dealers={dealers}
                  onChange={(name) => patch({ dealerName: name })}
                  onDealersChanged={onDealersChanged}
                  isLight={isLight}
                  inputBg={inputBg}
                  inputBorder={inputBorder}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                />
              </EField>
              <EField label="Dealer / Store Branch"><input type="text" value={draft.dealerBranch} onChange={(e) => patch({ dealerBranch: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              {ROBINSON_APPLIANCES_RE.test(draft.dealerName) && (
                <EField label="Transaction ID">
                  <input type="text" value={draft.robinsonsTransactionId} onChange={(e) => patch({ robinsonsTransactionId: e.target.value })} className={relayInput} style={inputStyle} autoComplete="off" placeholder="Robinsons Transaction ID" />
                </EField>
              )}
            </div>
          </div>

          {/* 2. Customer details */}
          <div>
            <ESHead step={2} icon={<UserRound className="w-3.5 h-3.5" />} title="Customer Details" subtitle="Who and where to deliver service" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
              <EField label="Customer Name" className="md:col-span-2">
                <input type="text" value={draft.customerName} onChange={(e) => patch({ customerName: e.target.value.toUpperCase() })} className={relayInput} style={inputStyle} autoComplete="off" spellCheck={false} />
              </EField>
              <EField label="Contact Number" className="md:col-span-2">
                <div className="flex flex-col gap-2">
                  {draft.phoneNumbers.map((phone, pIdx) => (
                    <div key={`phone-${pIdx}`} className="flex gap-2 items-center">
                      <input type="text" value={phone} onChange={(e) => { const next = [...draft.phoneNumbers]; next[pIdx] = e.target.value; patch({ phoneNumbers: next }) }} className={relayInput} style={inputStyle} autoComplete="off" />
                      {pIdx === 0 ? (
                        <button type="button" onClick={() => patch({ phoneNumbers: [...draft.phoneNumbers, ''] })} className="p-1 px-2.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 font-bold text-xs shrink-0">+</button>
                      ) : (
                        <button type="button" onClick={() => patch({ phoneNumbers: draft.phoneNumbers.filter((_, idx) => idx !== pIdx) })} className="p-1 px-2.5 rounded-lg text-white bg-red-600 hover:bg-red-700 font-bold text-xs shrink-0">-</button>
                      )}
                    </div>
                  ))}
                </div>
              </EField>
              <EField label="Address" className="md:col-span-3">
                <input type="text" value={draft.location} onChange={(e) => patch({ location: e.target.value.toUpperCase() })} className={relayInput} style={inputStyle} autoComplete="off" />
              </EField>
              <EField label="District Zone"><input type="text" value={draft.district} onChange={(e) => patch({ district: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Additional Notes / Landmark" className="md:col-span-4">
                <input type="text" value={draft.landmarks} onChange={(e) => patch({ landmarks: e.target.value })} className={relayInput} style={inputStyle} />
              </EField>
            </div>
          </div>

          {/* 3. Aircon details */}
          <div>
            <ESHead step={3} icon={<Wind className="w-3.5 h-3.5" />} title="Aircon Details" subtitle="Unit being serviced or installed" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
              <EField label="Brand / HP" className="md:col-span-2">
                <input type="text" value={draft.brandHp} onChange={(e) => { const val = e.target.value; const parts = val.trim().split(/\s+/); patch({ brandHp: val, brand: parts[0] || '', capacity: parts.slice(1).join(' ') || '' }) }} className={relayInput} style={inputStyle} />
              </EField>
              <EField label="Commit Type / Promo" className="md:col-span-2">
                <input type="text" value={draft.commitType} onChange={(e) => patch({ commitType: e.target.value })} className={relayInput} style={inputStyle} />
              </EField>
              {draft.images && (
                <div className="flex flex-col justify-end">
                  <div className="rounded-lg p-2 flex items-center justify-between border" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="text-[10px]">
                        <p className="font-bold" style={{ color: textPrimary }}>Attached Voucher</p>
                        <p className="truncate max-w-[100px]" style={{ color: textMuted }}>{draft.images.split('/').pop()}</p>
                      </div>
                    </div>
                    <a href={draft.images.startsWith('http') ? draft.images : `${API_BASE_URL.replace('/api', '')}${draft.images}`} target="_blank" rel="noreferrer" className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 rounded text-[9px] font-bold transition-all">View</a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Ashcol branch & assignment */}
          <div>
            <ESHead step={4} icon={<Users className="w-3.5 h-3.5" />} title="Branch and Negotiator" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
              <EField label="Branch Zone">
                <select
                  value={draft.assignBranchId}
                  onChange={(e) => {
                    const nextBranchId = resolveBranch(e.target.value)?.id || e.target.value
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
                  className={relayInput}
                  style={inputStyle}
                >
                  <option value="">Select Branch...</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>)}
                </select>
              </EField>
              <EField label="Negotiator">
                <select
                  value={draft.assignTechId}
                  onChange={(e) => {
                    const val = e.target.value
                    const foundEmp = negotiatorsForBranch(undefined).find((emp) => emp.id === val)
                      || negotiatorsForBranch(draft.assignBranchId || undefined).find((emp) => emp.id === val)
                    const negoBranchId = foundEmp?.branchId ? (resolveBranch(foundEmp.branchId)?.id || foundEmp.branchId) : draft.assignBranchId
                    const profilePhone = foundEmp?.phone || ''
                    patch({
                      assignTechId: val,
                      assignBranchId: negoBranchId,
                      negotiatorPhone: profilePhone,
                      updateStatus: val && draft.updateStatus === 'PENDING' ? 'ASSIGNED' : draft.updateStatus,
                    })
                  }}
                  className={relayInput}
                  style={inputStyle}
                >
                  <option value="">Select Negotiator...</option>
                  {negotiatorsForBranch(draft.assignBranchId || undefined).map((emp) => {
                    const branchRaw = emp.branchId ? (resolveBranch(emp.branchId)?.name || '') : ''
                    const branchName = formatBranchName(branchRaw)
                    const firstName = (emp.name || '').split(' ')[0]
                    const nameWithBranch = branchName ? `${firstName} - ${branchName}` : firstName
                    return <option key={emp.id} value={emp.id}>{nameWithBranch.toUpperCase()}</option>
                  })}
                </select>
              </EField>
              <EField label="Negotiator Phone No.">
                <input
                  type="text"
                  readOnly
                  value={
                    (negotiatorsForBranch(undefined).find((emp) => emp.id === draft.assignTechId)?.phone || draft.negotiatorPhone || '').trim() || 'N/A'
                  }
                  className={`${relayInput} cursor-text select-all`}
                  style={inputStyle}
                />
              </EField>
            </div>
          </div>

          {/* 5. Scheduling */}
          <div>
            <ESHead
              step={5}
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              title="Scheduling"
              subtitle={isOverview ? 'Requested & confirmed dates' : 'Relay, requested & confirmed dates'}
              border={border}
            />
            <div className={isOverview ? 'grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4'}>
              {!isOverview && (
                <EField label="Relayed Date">
                  <button
                    type="button"
                    disabled={Boolean(draft.relayedDate)}
                    onClick={(e) => {
                      if (draft.relayedDate) return
                      const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                      if (input && input.showPicker) input.showPicker();
                    }}
                    className={`${relayInput} font-bold text-center relative flex flex-col items-center justify-center ${
                      draft.relayedDate ? 'cursor-default opacity-90' : ''
                    }`}
                    style={inputStyle}
                  >
                    {draft.relayedDate ? new Date(draft.relayedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : 'ADD DATE'}
                    {!draft.relayedDate && (
                      <input type="date" value={draft.relayedDate} onChange={(e) => patch({ relayedDate: e.target.value })} className="absolute opacity-0 pointer-events-none w-0 h-0" style={{ pointerEvents: 'none' }} />
                    )}
                  </button>
                </EField>
              )}
              <EField label="Preferred Date">
                <button
                  type="button"
                  disabled={Boolean(draft.preferredDate)}
                  onClick={(e) => {
                    if (draft.preferredDate) return
                    const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                    if (input && input.showPicker) input.showPicker();
                  }}
                  className={`${relayInput} font-bold text-center relative flex flex-col items-center justify-center ${
                    draft.preferredDate ? 'cursor-default opacity-90' : ''
                  }`}
                  style={inputStyle}
                >
                  {draft.preferredDate ? new Date(draft.preferredDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : 'ADD DATE'}
                  {!draft.preferredDate && (
                    <input type="date" value={draft.preferredDate} onChange={(e) => patch({ preferredDate: e.target.value })} className="absolute opacity-0 pointer-events-none w-0 h-0" style={{ pointerEvents: 'none' }} />
                  )}
                </button>
              </EField>
              <EField label="Schedule Date" className={!isOverview && !isReschedStatus ? 'md:col-span-2' : ''}>
                <button
                  type="button"
                  onClick={(e) => {
                    const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                    if (input && input.showPicker) input.showPicker();
                  }}
                  className={`${relayInput} font-bold text-center relative flex flex-col items-center justify-center`}
                  style={{
                    ...inputStyle,
                    backgroundColor: draft.finalDate ? (isLight ? '#f0fdf4' : 'rgba(22,163,74,0.08)') : inputBg,
                    borderColor: draft.finalDate ? (isLight ? '#86efac' : 'rgba(22,163,74,0.35)') : inputBorder,
                    color: draft.finalDate ? '#10B981' : textPrimary,
                    opacity: isFieldSurface && isReschedStatus && draft.reschedulePending ? 0.5 : 1,
                  }}
                >
                  {draft.finalDate ? new Date(draft.finalDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : 'ADD DATE'}
                  <input
                    type="date"
                    disabled={isFieldSurface && isReschedStatus && draft.reschedulePending}
                    value={draft.finalDate}
                    onChange={(e) => patch({ finalDate: e.target.value })}
                    className="absolute opacity-0 pointer-events-none w-0 h-0"
                    style={{ pointerEvents: 'none' }}
                  />
                </button>
              </EField>
              {showInstalledDate && (
                <EField label="Installed Date">
                  <button
                    type="button"
                    onClick={(e) => {
                      const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                      if (input && input.showPicker) input.showPicker();
                    }}
                    className={`${relayInput} font-bold text-center relative flex flex-col items-center justify-center`}
                    style={inputStyle}
                  >
                    {draft.actualCompletion ? new Date(draft.actualCompletion).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : 'ADD DATE'}
                    <input
                      type="date"
                      value={draft.actualCompletion}
                      onChange={(e) => patch({ actualCompletion: e.target.value })}
                      className="absolute opacity-0 pointer-events-none w-0 h-0"
                      style={{ pointerEvents: 'none' }}
                    />
                  </button>
                </EField>
              )}
              {isFieldSurface && isReschedStatus && (
                <label className={`flex items-center gap-2 text-xs font-semibold cursor-pointer ${isOverview ? 'sm:col-span-2' : 'md:col-span-2'}`} style={{ color: textPrimary }}>
                  <input
                    type="checkbox"
                    checked={draft.reschedulePending}
                    onChange={(e) => patch({ reschedulePending: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  Pending — no date slot available yet (Final Date above stays as-is until confirmed)
                </label>
              )}
            </div>
          </div>

          {/* 6. Comment / remarks */}
          <div>
            <ESHead step={6} icon={<MessageSquare className="w-3.5 h-3.5" />} title="Comment / Remarks" subtitle="Latest notes or dispatch update" border={border} />
            {isFieldSurface && (
              <EField label="Remarks / Update" className="mb-3">
                <textarea
                  value={draft.remarks}
                  onChange={(e) => patch({ remarks: e.target.value.toUpperCase() })}
                  rows={2}
                  className={`${relayInput} resize-none uppercase`}
                  style={{ ...inputStyle, textTransform: 'uppercase' }}
                />
              </EField>
            )}
            <EField label={isFieldSurface ? 'Add New Remark (appends to history)' : 'Add New Remark / Update'}>
              <textarea
                value={draft.remarksUpdate}
                onChange={(e) => patch({ remarksUpdate: e.target.value.toUpperCase() })}
                rows={4}
                placeholder="Type a new update (e.g. FOR CLEANING — send names for work permit). Saved remarks appear in Update History and this field clears."
                className={`${relayInput} resize-none uppercase`}
                style={{ ...inputStyle, textTransform: 'uppercase' }}
              />
            </EField>
          </div>

          {isFieldSurface && (
            <div>
              <ESHead icon={<Info className="w-3.5 h-3.5" />} title="Ticket Info" border={border} />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4">
                <EField label="Control No. / SI (Aircon)">
                  <input type="text" value={draft.controlNumber} onChange={(e) => patch({ controlNumber: e.target.value })} className={relayInput} style={inputStyle} placeholder="Aircon papers / SI" />
                </EField>
                <EField label="Mode of Payment">
                  <select
                    value={draft.modeOfPayment || 'NO_PAYMENT'}
                    onChange={(e) => {
                      const v = e.target.value
                      patch({
                        modeOfPayment: v,
                        installationCharges: (v === 'NO_PAYMENT' || v === 'FREE' || v === 'FREE INSTALL') ? 0 : draft.installationCharges,
                      })
                    }}
                    className={relayInput}
                    style={inputStyle}
                  >
                    <option value="NO_PAYMENT">NO PAYMENT</option>
                    <option value="CASH">CASH</option>
                    <option value="BANK TRANSFER">BANK TRANSFER</option>
                    <option value="GCASH">GCASH</option>
                    <option value="CHEQUE">CHEQUE</option>
                    <option value="FOR COLLECTION">FOR COLLECTION</option>
                    <option value="FREE INSTALL">FREE INSTALL</option>
                  </select>
                </EField>
                <EField label="Payment Amount (₱)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.modeOfPayment === 'NO_PAYMENT' || !draft.modeOfPayment ? '' : (draft.installationCharges ?? '')}
                    disabled={!draft.modeOfPayment || draft.modeOfPayment === 'NO_PAYMENT' || draft.modeOfPayment === 'FREE' || draft.modeOfPayment === 'FREE INSTALL'}
                    onChange={(e) => patch({ installationCharges: e.target.value ? Number(e.target.value) : 0 })}
                    className={relayInput}
                    style={inputStyle}
                  />
                </EField>
              </div>
            </div>
          )}

          {isFieldSurface && (
            <div>
              <ESHead icon={<Truck className="w-3.5 h-3.5" />} title="Dispatch" border={border} />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
                <EField label="Driver">
                  <input
                    type="text"
                    value={draft.driverName}
                    list="unified-ticket-driver-roster"
                    onChange={(e) => patch({ driverName: e.target.value })}
                    className={relayInput}
                    style={inputStyle}
                  />
                  <datalist id="unified-ticket-driver-roster">
                    {driverRoster.map((name) => <option key={name} value={name} />)}
                  </datalist>
                </EField>
                <EField label="Vehicle">
                  <input
                    type="text"
                    value={draft.serviceDriver}
                    onChange={(e) => patch({ serviceDriver: e.target.value })}
                    className={relayInput}
                    style={inputStyle}
                    placeholder="e.g. T2"
                  />
                </EField>
                <EField label={isTaguigServices ? 'Technician' : 'Installer / Technician'}>
                  <input
                    type="text"
                    value={draft.installerName}
                    list="unified-ticket-installer-roster"
                    onChange={(e) => patch({ installerName: e.target.value })}
                    className={relayInput}
                    style={inputStyle}
                  />
                  <datalist id="unified-ticket-installer-roster">
                    {installerRoster.map((name) => <option key={name} value={name} />)}
                  </datalist>
                </EField>
              </div>
            </div>
          )}

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

  {confirmModal && ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={() => setConfirmModal(null)}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden border animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 p-5 sm:p-6 flex flex-col gap-4"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm sm:text-base font-black leading-tight" style={{ color: textPrimary }}>
            {confirmModal.type === 'discard'
              ? 'Discard Unsaved Changes?'
              : 'Confirm Status Change'}
          </h3>
          <button
            type="button"
            onClick={() => setConfirmModal(null)}
            className="p-1.5 rounded-lg hover:bg-slate-500/10 transition-colors shrink-0"
            style={{ color: textMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(() => {
          const currentStatusLabel = (() => {
            const raw = ((isFieldSurface ? draft.scheduleStatus : draft.updateStatus) || draft.serviceType || 'PENDING').toUpperCase()
            if (raw === 'SERVICES' || raw === 'SERVICE') return 'SERVICE'
            if (raw === 'INSTALLATION' || raw === 'INSTALL') return 'INSTALL'
            if (raw === 'S/I' || raw === 'SURVEY_INSTALL') return 'SURVEY & INSTALL'
            return raw.replace(/_/g, ' ')
          })()

          return (
            <p className="text-xs sm:text-sm font-medium leading-relaxed" style={{ color: textPrimary }}>
              {confirmModal.type === 'discard'
                ? 'You have unsaved changes on this ticket. Discard changes and close?'
                : `Are you sure you want to change the status from ${currentStatusLabel} to ${confirmModal.targetStatus?.label}?`}
            </p>
          )
        })()}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => setConfirmModal(null)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors hover:bg-slate-500/10"
            style={{ borderColor: inputBorder, color: textMuted, backgroundColor: 'transparent' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              confirmModal.onConfirm()
              setConfirmModal(null)
            }}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95 shadow-sm"
            style={{ background: confirmModal.type === 'discard' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            {confirmModal.type === 'discard' ? 'Discard' : 'OK'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )}
      {show15QChecklist && (
        <ConfirmationChecklistModal
          ticket={ticket as any}
          isLight={isLight}
          onClose={() => setShow15QChecklist(false)}
          onSaved={(updatedTicket) => {
            onSave?.(updatedTicket as any)
          }}
        />
      )}
    </>
  )
}

export const RelayEditTicketModal = memo(RelayEditTicketModalInner)
