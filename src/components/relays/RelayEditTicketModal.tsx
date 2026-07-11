import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import { AlertTriangle, FileText, X, Store, UserRound, Wind, Users, CalendarDays, MessageSquare, Info, Truck, Gift, Percent, ShieldCheck } from 'lucide-react'
import { API_BASE_URL } from '../../utils/api'
import { FIELD_TICKET_CATEGORIES } from '../../constants/ticketCategories'
import { buildRelayEditDraft, type RelayEditDraft } from './relayEditForm'
import type { TicketEditSurface } from '../../utils/ticketEditBridge'

const BUILT_IN_RELAY_STORES = ['Robinsons', 'Abenson'] as const

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
  scheduleStatusOptions?: ScheduleStatusOption[]
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
  subtitle,
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
      {subtitle && <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-tight mt-0.5">{subtitle}</p>}
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
    relayCustomStores,
    onPersistCustomStores,
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
    scheduleStatusOptions = [],
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
  const [showAddStoreField, setShowAddStoreField] = useState(false)
  const [storeDraft, setStoreDraft] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    const next = buildRelayEditDraft(ticket, parseStoreVendor, resolveBranch, draftExtensions)
    setDraft(next)
    initialDraftRef.current = JSON.stringify(next)
    setShowAddStoreField(false)
    setStoreDraft('')
  }, [ticket.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const requestClose = () => {
    if (JSON.stringify(draft) !== initialDraftRef.current) {
      if (!window.confirm('Discard unsaved changes on this ticket?')) return
    }
    onClose()
  }

  const isReschedStatus = (draft.scheduleStatus || '').toUpperCase() === 'RESCHED'
  const pendingStatusOpts = scheduleStatusOptions.filter(o => o.group === 'pending')
  const closingStatusOpts = scheduleStatusOptions.filter(o => o.group === 'closing')
  const isSaving = saving || actionSaving

  const patch = (updates: Partial<RelayEditDraft>) => setDraft((prev) => ({ ...prev, ...updates }))

  const inputStyle = useMemo(() => ({
    backgroundColor: inputBg,
    borderColor: inputBorder,
    color: textPrimary,
    fontFamily: 'inherit',
    textTransform: 'none' as const,
  }), [inputBg, inputBorder, textPrimary])

  const relayInput = `${compactInput} normal-case`

  const storeOptions = useMemo(() => {
    const options = [
      ...BUILT_IN_RELAY_STORES,
      ...relayCustomStores.filter((s) => !(BUILT_IN_RELAY_STORES as readonly string[]).includes(s as typeof BUILT_IN_RELAY_STORES[number])),
    ]
    if (draft.storeVendor && !options.includes(draft.storeVendor as typeof BUILT_IN_RELAY_STORES[number])) {
      return [...options, draft.storeVendor]
    }
    return options
  }, [draft.storeVendor, relayCustomStores])

  const addCustomStore = () => {
    const name = storeDraft.trim()
    if (!name) return
    if ((BUILT_IN_RELAY_STORES as readonly string[]).some((s) => s.toLowerCase() === name.toLowerCase())) {
      alert('That store is already in the list.')
      return
    }
    const next = [...new Set([...relayCustomStores, name])].sort((a, b) => a.localeCompare(b))
    onPersistCustomStores(next)
    patch({ storeVendor: name })
    setStoreDraft('')
    setShowAddStoreField(false)
  }

  return ReactDOM.createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex flex-col overflow-hidden ${isOverview ? 'bg-white dark:bg-[#0a1120] sm:bg-black/50' : ''} sm:items-center sm:justify-center sm:p-4`}
      style={isOverview ? undefined : { backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className={`w-full flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 min-h-0 ${isOverview ? 'h-full sm:h-auto sm:max-h-[94vh] sm:max-w-6xl sm:rounded-2xl' : 'max-w-6xl rounded-none sm:rounded-2xl sm:max-h-[94vh] h-full sm:h-auto'}`}
        style={{ backgroundColor: cardBg, border: isOverview ? 'none' : `1px solid ${border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 shrink-0 safe-area-top" style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
          <div className="min-w-0 flex-1 mr-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm sm:text-base font-black leading-tight uppercase tracking-wide" style={{ color: textPrimary }}>
                {isFieldSurface ? 'Manage Client Ticket' : 'Manage Client Ticket'}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded font-black font-mono tracking-wider" style={{ backgroundColor: inputBg, color: textMuted, border: `1px solid ${border}` }}>
                TICKET NO: {ticketNumberLabel}
              </span>
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
          <button type="button" onClick={requestClose} className="p-2 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" style={{ color: textMuted }} />
          </button>
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

          {/* 1. Store & transaction */}
          <div>
            <ESHead step={1} icon={<Store className="w-3.5 h-3.5" />} title="Store & Transaction" subtitle="Where the relay came from" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
              <EField label="Store">
                <select value={showAddStoreField ? '__add_store__' : draft.storeVendor} onChange={(e) => { const val = e.target.value; if (val === '__add_store__') { setShowAddStoreField(true); return }; setShowAddStoreField(false); setStoreDraft(''); patch({ storeVendor: val }) }} className={relayInput} style={inputStyle}>
                  {storeOptions.map((store) => <option key={store} value={store}>{store}</option>)}
                  <option value="__add_store__">+ Add store...</option>
                </select>
              </EField>
              {showAddStoreField && (
                <EField label="New Store Name">
                  <div className="flex gap-2">
                    <input type="text" value={storeDraft} onChange={(e) => setStoreDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomStore() } }} className={relayInput} style={inputStyle} />
                    <button type="button" onClick={addCustomStore} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shrink-0 bg-emerald-600 hover:bg-emerald-700">Add</button>
                  </div>
                </EField>
              )}
              <EField label="Store Branch"><input type="text" value={draft.storeBranch} onChange={(e) => patch({ storeBranch: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              {draft.storeVendor === 'Robinsons' && (
                <EField label="Transaction ID">
                  <input type="text" value={draft.controlNumber} onChange={(e) => patch({ controlNumber: e.target.value })} className={relayInput} style={inputStyle} autoComplete="off" placeholder="Robinsons Transaction ID" />
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
              <EField label="Service Category / Type">
                <input type="text" value={draft.serviceType} onChange={(e) => { const val = e.target.value; const isSI = /install|s\/i|\bsi\b/i.test(val); const isSurvey = /survey/i.test(val); let mappedSvc = val; let commitType = draft.commitType; if (isSI) { mappedSvc = 'Survey & Install'; commitType = 'FREE FIRST 10 FEET' } else if (isSurvey) { mappedSvc = 'SURVEY' }; patch({ serviceType: mappedSvc, commitType }) }} className={relayInput} style={inputStyle} />
              </EField>
              <EField label="Commit Type / Promo">
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
            <ESHead step={4} icon={<Users className="w-3.5 h-3.5" />} title="Branch & Assignment" subtitle="Which Ashcol branch & negotiator owns this" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
              {isFieldSurface ? (
                <EField label="Status" className="md:col-span-2">
                  <select
                    value={draft.scheduleStatus}
                    onChange={(e) => patch({ scheduleStatus: e.target.value })}
                    className={`${relayInput} font-bold`}
                    style={inputStyle}
                  >
                    {pendingStatusOpts.length > 0 && (
                      <optgroup label="Active">
                        {pendingStatusOpts.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </optgroup>
                    )}
                    {closingStatusOpts.length > 0 && (
                      <optgroup label="Closing">
                        {closingStatusOpts.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </optgroup>
                    )}
                    {scheduleStatusOptions.length === 0 && (
                      <option value={draft.scheduleStatus}>{draft.scheduleStatus}</option>
                    )}
                  </select>
                </EField>
              ) : (
                <EField label="Status">
                  <select value={draft.updateStatus} onChange={(e) => patch({ updateStatus: e.target.value })} className={`${relayInput} font-bold`} style={inputStyle}>
                    <option value="PENDING">Pending</option><option value="ASSIGNED">Assigned</option><option value="SCHEDULED">Scheduled</option>
                  </select>
                </EField>
              )}
              <EField label="Branch Zone">
                <select
                  value={draft.assignBranchId}
                  onChange={(e) => {
                    const nextBranchId = resolveBranch(e.target.value)?.id || e.target.value
                    const hadNegotiator = !!draft.assignTechId
                    patch({
                      assignBranchId: nextBranchId,
                      assignTechId: '',
                      updateStatus: hadNegotiator && (draft.updateStatus === 'ASSIGNED' || draft.updateStatus === 'SCHEDULED')
                        ? 'PENDING'
                        : draft.updateStatus,
                    })
                  }}
                  className={relayInput}
                  style={inputStyle}
                >
                  <option value="">Select Branch...</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </EField>
              <EField label="Negotiator">
                <select value={draft.assignTechId} onChange={(e) => { const val = e.target.value; const foundEmp = negotiatorsForBranch(draft.assignBranchId || undefined).find((emp) => emp.id === val); const negoBranchId = foundEmp?.branchId ? (resolveBranch(foundEmp.branchId)?.id || foundEmp.branchId) : draft.assignBranchId; patch({ assignTechId: val, assignBranchId: negoBranchId, updateStatus: val && draft.updateStatus === 'PENDING' ? 'ASSIGNED' : draft.updateStatus }) }} className={relayInput} style={inputStyle}>
                  <option value="">Select Negotiator...</option>
                  {negotiatorsForBranch(draft.assignBranchId || undefined).map((emp) => {
                    const branchName = emp.branchId ? (resolveBranch(emp.branchId)?.name || '') : ''
                    const nameWithBranch = branchName ? `${emp.name} (${branchName})` : emp.name
                    return <option key={emp.id} value={emp.id}>{nameWithBranch}</option>
                  })}
                </select>
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
                <EField label="Relayed Date"><input type="date" value={draft.relayedDate} onChange={(e) => patch({ relayedDate: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              )}
              <EField label="Preferred Date"><input type="date" value={draft.preferredDate} onChange={(e) => patch({ preferredDate: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              {isFieldSurface && (
                <EField label="Final Date" className={!isOverview && !isReschedStatus ? 'md:col-span-2' : ''}>
                  <input
                    type="date"
                    disabled={isReschedStatus && draft.reschedulePending}
                    value={draft.finalDate}
                    onChange={(e) => patch({ finalDate: e.target.value })}
                    className={relayInput}
                    style={{
                      ...inputStyle,
                      backgroundColor: isLight ? '#f0fdf4' : 'rgba(22,163,74,0.08)',
                      borderColor: isLight ? '#86efac' : 'rgba(22,163,74,0.35)',
                      opacity: isReschedStatus && draft.reschedulePending ? 0.5 : 1,
                    }}
                  />
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
                  onChange={(e) => patch({ remarks: e.target.value })}
                  rows={2}
                  className={`${relayInput} resize-none`}
                  style={inputStyle}
                />
              </EField>
            )}
            <EField label={isFieldSurface ? 'Add New Remark (appends to history)' : 'Add New Remark / Update'}>
              <textarea
                value={draft.remarksUpdate}
                onChange={(e) => patch({ remarksUpdate: e.target.value })}
                rows={4}
                placeholder="Type a new update (e.g. FOR CLEANING — send names for work permit). Saved remarks appear in Update History and this field clears."
                className={`${relayInput} resize-none`}
                style={inputStyle}
              />
            </EField>
          </div>

          {isFieldSurface && (
            <div>
              <ESHead icon={<Info className="w-3.5 h-3.5" />} title="Ticket Info" border={border} />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
                <EField label="Ticket Type">
                  <select value={draft.ticketCategory} onChange={(e) => patch({ ticketCategory: e.target.value })} className={relayInput} style={inputStyle}>
                    {FIELD_TICKET_CATEGORIES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </EField>
                <EField label="Ticket No.">
                  <input type="text" value={draft.ticketNumber} onChange={(e) => patch({ ticketNumber: e.target.value })} className={relayInput} style={inputStyle} placeholder="e.g. AS-001" />
                </EField>
                <EField label="Control No. / SI (Aircon)">
                  <input type="text" value={draft.controlNumber} onChange={(e) => patch({ controlNumber: e.target.value })} className={relayInput} style={inputStyle} placeholder="Aircon papers / SI" />
                </EField>
                <EField label="Mode of Payment">
                  <select value={draft.modeOfPayment} onChange={(e) => patch({ modeOfPayment: e.target.value })} className={relayInput} style={inputStyle}>
                    <option value="">-- Select --</option>
                    <option value="CASH">CASH</option>
                    <option value="BANK TRANSFER">BANK TRANSFER</option>
                    <option value="GCASH">GCASH</option>
                    <option value="CHEQUE">CHEQUE</option>
                    <option value="FREE INSTALL">FREE INSTALL</option>
                  </select>
                </EField>
                <EField label="Payment Amount (₱)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.installationCharges ?? ''}
                    disabled={draft.modeOfPayment === 'FREE' || draft.modeOfPayment === 'FREE INSTALL'}
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

          <div>
            <ESHead icon={<Gift className="w-3.5 h-3.5" />} title="Referral Fee" border={border} />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
              <EField label="Referral Fee"><input type="text" value={draft.storeReferralFee} onChange={(e) => patch({ storeReferralFee: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Recipient"><input type="text" value={draft.referralRecipient} onChange={(e) => patch({ referralRecipient: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Amount"><input type="number" min="0" step="0.01" value={draft.referralAmount} onChange={(e) => patch({ referralAmount: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Status"><input type="text" value={draft.referralStatus} onChange={(e) => patch({ referralStatus: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Date Paid"><input type="date" value={draft.referralDatePaid} onChange={(e) => patch({ referralDatePaid: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Reference No"><input type="text" value={draft.referralReferenceNo} onChange={(e) => patch({ referralReferenceNo: e.target.value })} className={relayInput} style={inputStyle} /></EField>
            </div>
          </div>

          <div>
            <ESHead icon={<Percent className="w-3.5 h-3.5" />} title="Rebates Claim" border={border} />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              <EField label="For Rebates Claim">
                <select value={draft.rebatesClaim} onChange={(e) => patch({ rebatesClaim: e.target.value })} className={relayInput} style={inputStyle}>
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </select>
              </EField>
              <EField label="Company"><input type="text" value={draft.rebatesCompany} onChange={(e) => patch({ rebatesCompany: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Amount Due"><input type="number" min="0" step="0.01" value={draft.rebatesAmountDue} onChange={(e) => patch({ rebatesAmountDue: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Status"><input type="text" value={draft.rebatesStatus} onChange={(e) => patch({ rebatesStatus: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Reference No"><input type="text" value={draft.rebatesReferenceNo} onChange={(e) => patch({ rebatesReferenceNo: e.target.value })} className={relayInput} style={inputStyle} /></EField>
            </div>
          </div>

          <div>
            <ESHead icon={<ShieldCheck className="w-3.5 h-3.5" />} title="Warranty Registration" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              <EField label="Warranty Registration Status"><input type="text" value={draft.warrantyStatus} onChange={(e) => patch({ warrantyStatus: e.target.value })} placeholder="REGISTERED" className={relayInput} style={inputStyle} /></EField>
              <EField label="Registered By"><input type="text" value={draft.warrantyRegisteredBy} onChange={(e) => patch({ warrantyRegisteredBy: e.target.value })} className={relayInput} style={inputStyle} /></EField>
            </div>
          </div>

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
                        {getTicketNumber(c)} ({(c.status || '').toUpperCase()}) - {c.customerName} - {details.finalDate ? `Scheduled ${details.finalDate}` : 'No date'} - [{(c as { sourceVendor?: string }).sourceVendor || 'Direct'}]
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
  )
}

export const RelayEditTicketModal = memo(RelayEditTicketModalInner)
