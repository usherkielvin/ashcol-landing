import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import { AlertTriangle, FileText, X } from 'lucide-react'
import { API_BASE_URL } from '../../utils/api'
import { buildRelayEditDraft, type RelayEditDraft } from './relayEditForm'

const BUILT_IN_RELAY_STORES = ['Robinsons', 'Abenson'] as const

type Branch = { id: string; name: string }
type Employee = { id: string; name?: string; branchId?: string; phone?: string }
type TicketLike = Parameters<typeof buildRelayEditDraft>[0] & { id: string; customerName?: string }

type ParsedStore = { store: string; branch: string; customStore?: string }

export type RelayEditTicketModalProps = {
  ticket: TicketLike
  ticketNumberLabel: string
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
  employees: Employee[]
  relayCustomStores: string[]
  onPersistCustomStores: (stores: string[]) => void
  parseStoreVendor: (sourceVendor?: string) => ParsedStore
  resolveBranch: (branchId?: string) => Branch | null
  negotiatorsForBranch: (branchId?: string) => Employee[]
  renderNegotiatorPhone: (phone: string) => ReactNode
  mergeCandidates: TicketLike[]
  mergeTargetId: string
  merging: boolean
  actionSaving: boolean
  onMergeTargetChange: (id: string) => void
  onMerge: () => void
  onClose: () => void
  onDelete: () => void
  onSave: (draft: RelayEditDraft) => void
  getTicketNumber: (ticket: any) => string
  parseAcDetails: (ticket: any) => { finalDate?: string }
}

const EField = ({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</label>
    {children}
  </div>
)

const ESHead = ({ title, border }: { title: string; border: string }) => (
  <div className="pt-2 pb-1 border-b pb-2 mb-3" style={{ borderColor: border }}>
    <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">{title}</p>
  </div>
)

function RelayEditTicketModalInner(props: RelayEditTicketModalProps) {
  const {
    ticket,
    ticketNumberLabel,
    isAdmin,
    isLight,
    cardBg,
    border,
    textPrimary,
    textMuted,
    inputBg,
    inputBorder,
    compactInput,
    branches,
    employees,
    relayCustomStores,
    onPersistCustomStores,
    parseStoreVendor,
    resolveBranch,
    negotiatorsForBranch,
    renderNegotiatorPhone,
    mergeCandidates,
    mergeTargetId,
    merging,
    actionSaving,
    onMergeTargetChange,
    onMerge,
    onClose,
    onDelete,
    onSave,
    getTicketNumber,
    parseAcDetails,
  } = props

  const [draft, setDraft] = useState<RelayEditDraft>(() => buildRelayEditDraft(ticket, parseStoreVendor, resolveBranch))
  const [showAddStoreField, setShowAddStoreField] = useState(false)
  const [storeDraft, setStoreDraft] = useState('')

  useEffect(() => {
    setDraft(buildRelayEditDraft(ticket, parseStoreVendor, resolveBranch))
    setShowAddStoreField(false)
    setStoreDraft('')
  }, [ticket.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const negotiatorPhone = useMemo(() => {
    const uid = draft.assignTechId
    if (!uid) return ''
    const emp = employees.find((e) => String(e.id) === uid)
    return String(emp?.phone || '').trim()
  }, [draft.assignTechId, employees])

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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
          <div className="min-w-0 flex-1 mr-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-black leading-tight uppercase tracking-wide" style={{ color: textPrimary }}>Manage Client Ticket</h2>
              <span className="text-[10px] px-2 py-0.5 rounded font-black font-mono tracking-wider" style={{ backgroundColor: inputBg, color: textMuted, border: `1px solid ${border}` }}>
                TICKET NO: {ticketNumberLabel}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4.5 h-4.5" style={{ color: textMuted }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <ESHead title="Client & Location Details" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <EField label="Customer Name">
                <input type="text" value={draft.customerName} onChange={(e) => patch({ customerName: e.target.value })} className={relayInput} style={inputStyle} autoComplete="off" spellCheck={false} />
              </EField>
              <EField label="Control No. / SI">
                <input type="text" value={draft.controlNumber} onChange={(e) => patch({ controlNumber: e.target.value })} className={relayInput} style={inputStyle} autoComplete="off" />
              </EField>
              <EField label="Contact Number" className="sm:col-span-2">
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
              <EField label="Address" className="md:col-span-2"><input type="text" value={draft.location} onChange={(e) => patch({ location: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="District Zone"><input type="text" value={draft.district} onChange={(e) => patch({ district: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Additional Notes / Landmark"><input type="text" value={draft.landmarks} onChange={(e) => patch({ landmarks: e.target.value })} className={relayInput} style={inputStyle} /></EField>
            </div>
          </div>

          <div>
            <ESHead title="Equipment & Job Details" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <EField label="Brand / HP" className="md:col-span-2">
                <input type="text" value={draft.brandHp} onChange={(e) => { const val = e.target.value; const parts = val.trim().split(/\s+/); patch({ brandHp: val, brand: parts[0] || '', capacity: parts.slice(1).join(' ') || '' }) }} className={relayInput} style={inputStyle} />
              </EField>
              <EField label="Service Category / Type">
                <input type="text" value={draft.serviceType} onChange={(e) => { const val = e.target.value; const isSI = /install|s\/i|\bsi\b/i.test(val); const isSurvey = /survey/i.test(val); let mappedSvc = val; let commitType = draft.commitType; if (isSI) { mappedSvc = 'Survey & Install'; commitType = 'FREE FIRST 10 FEET' } else if (isSurvey) { mappedSvc = 'SURVEY' }; patch({ serviceType: mappedSvc, commitType }) }} className={relayInput} style={inputStyle} />
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

          <div>
            <ESHead title="Scheduling & Branch Assignment" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <EField label="Status">
                <select value={draft.updateStatus} onChange={(e) => patch({ updateStatus: e.target.value })} className={`${relayInput} font-bold`} style={inputStyle}>
                  <option value="PENDING">Pending</option><option value="ASSIGNED">Assigned</option><option value="SCHEDULED">Scheduled</option>
                </select>
              </EField>
              <EField label="Branch Zone">
                <select value={draft.assignBranchId} onChange={(e) => patch({ assignBranchId: e.target.value })} className={relayInput} style={inputStyle}>
                  <option value="">Select Branch...</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </EField>
              <EField label="Negotiator">
                <select value={draft.assignTechId} onChange={(e) => { const val = e.target.value; const foundEmp = negotiatorsForBranch(draft.assignBranchId || undefined).find((emp) => emp.id === val); patch({ assignTechId: val, assignBranchId: foundEmp?.branchId || draft.assignBranchId, updateStatus: val && draft.updateStatus === 'PENDING' ? 'ASSIGNED' : draft.updateStatus }) }} className={relayInput} style={inputStyle}>
                  <option value="">Select Negotiator...</option>
                  {negotiatorsForBranch(draft.assignBranchId || undefined).map((emp) => {
                    const branchName = emp.branchId ? (resolveBranch(emp.branchId)?.name || '') : ''
                    const nameWithBranch = branchName ? `${emp.name} (${branchName})` : emp.name
                    return <option key={emp.id} value={emp.id}>{nameWithBranch}</option>
                  })}
                </select>
              </EField>
              <EField label="Negotiator Number">
                <div className={`${relayInput} flex items-center min-h-[30px] normal-case`} style={{ ...inputStyle, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
                  {negotiatorPhone ? renderNegotiatorPhone(negotiatorPhone) : <span className="text-[11px] font-medium" style={{ color: textMuted }}>No number on negotiator account</span>}
                </div>
              </EField>
              <EField label="Relayed Date"><input type="date" value={draft.relayedDate} onChange={(e) => patch({ relayedDate: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Preferred Date"><input type="date" value={draft.preferredDate} onChange={(e) => patch({ preferredDate: e.target.value })} className={relayInput} style={inputStyle} /></EField>
            </div>
          </div>

          <div>
            <ESHead title="Referral Fee" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <EField label="Referral Fee"><input type="text" value={draft.storeReferralFee} onChange={(e) => patch({ storeReferralFee: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Recipient"><input type="text" value={draft.referralRecipient} onChange={(e) => patch({ referralRecipient: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Amount"><input type="number" min="0" step="0.01" value={draft.referralAmount} onChange={(e) => patch({ referralAmount: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Status"><input type="text" value={draft.referralStatus} onChange={(e) => patch({ referralStatus: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Date Paid"><input type="date" value={draft.referralDatePaid} onChange={(e) => patch({ referralDatePaid: e.target.value })} className={relayInput} style={inputStyle} /></EField>
              <EField label="Reference No"><input type="text" value={draft.referralReferenceNo} onChange={(e) => patch({ referralReferenceNo: e.target.value })} className={relayInput} style={inputStyle} /></EField>
            </div>
          </div>

          <div>
            <ESHead title="Rebates Claim" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
            <ESHead title="Warranty Registration" border={border} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EField label="Warranty Registration Status"><input type="text" value={draft.warrantyStatus} onChange={(e) => patch({ warrantyStatus: e.target.value })} placeholder="REGISTERED" className={relayInput} style={inputStyle} /></EField>
              <EField label="Registered By"><input type="text" value={draft.warrantyRegisteredBy} onChange={(e) => patch({ warrantyRegisteredBy: e.target.value })} className={relayInput} style={inputStyle} /></EField>
            </div>
          </div>

          <div>
            <ESHead title="Remarks & Updates" border={border} />
            <EField label="Add New Remark / Update">
              <textarea
                value={draft.remarksUpdate}
                onChange={(e) => patch({ remarksUpdate: e.target.value })}
                rows={3}
                placeholder="Type a new update (e.g. FOR CLEANING — send names for work permit). Saved remarks appear in Update History and this field clears."
                className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none resize-none normal-case"
                style={inputStyle}
              />
            </EField>
          </div>

          {mergeCandidates.length > 0 && (
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

        <div className="px-6 py-4 flex items-center justify-between border-t shrink-0" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
          {isAdmin ? <button type="button" onClick={onDelete} disabled={actionSaving} className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">Delete Ticket</button> : <div />}
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="px-5 py-2 border rounded-lg text-xs font-bold" style={{ borderColor: inputBorder, color: textMuted, backgroundColor: cardBg }}>Cancel</button>
            <button type="button" onClick={() => onSave(draft)} disabled={actionSaving} className="px-6 py-2 text-white rounded-lg text-xs font-bold disabled:opacity-50 shadow-md" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>{actionSaving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export const RelayEditTicketModal = memo(RelayEditTicketModalInner)
