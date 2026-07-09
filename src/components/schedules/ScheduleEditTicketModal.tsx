import ReactDOM from 'react-dom'
import { ChevronDown, Loader2, Trash2, X } from 'lucide-react'
import { FIELD_TICKET_CATEGORIES } from '../../constants/ticketCategories'
import type { TicketCategoryValue } from '../../constants/ticketCategories'

export type ScheduleEditForm = {
  id?: string
  preferredDate?: string
  finalDate?: string
  customerName?: string
  contactPhone?: string
  location?: string
  district?: string
  commitTerms?: string
  unitType?: string
  sourceVendor?: string
  serviceDriver?: string
  installerName?: string
  negotiatorId?: string
  branchId?: string
  ticketNumber?: string
  controlNumber?: string
  ticketCategory?: TicketCategoryValue
  status?: string
  installationCharges?: number
  modeOfPayment?: string
  remarks?: string
  rescheduleToDate?: string
  reschedulePending?: boolean
}

type Branch = { id: string; name: string }
type Employee = { id: string; name?: string; branchId?: string | null; email?: string | null }

type ScheduleEditTicketModalProps = {
  form: ScheduleEditForm
  onChange: (patch: Partial<ScheduleEditForm>) => void
  editOriginalDate: string
  editInitialStatus: string
  isLight: boolean
  isTaguigServices: boolean
  canEdit: boolean
  saving: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  green: string
  branches: Branch[]
  negotiators: Employee[]
  driverRoster: string[]
  installerRoster: string[]
  formatBranchLabel: (branchId?: string) => string
  formatNegotiatorLabel: (emp: Employee) => string
  formatDateLabel: (dateKey: string) => string
  getStatusLabel: (status: string) => string
  getStatusBadgeStyle: (status: string, isLight: boolean) => {
    color: string
    backgroundColor: string
    borderColor: string
  }
  ticketHasPaymentInfo: (form: Partial<ScheduleEditForm>) => boolean
  qualifiesForInstallComplete: (form: Partial<ScheduleEditForm>) => boolean
  onOpenStatusPicker: (anchor: HTMLElement) => void
  onClose: () => void
  onDelete?: () => void
  onSave: () => void
}

function Field({ label, required, full, children }: {
  label: string
  required?: boolean
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 w-full max-w-full ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  )
}

export function ScheduleEditTicketModal({
  form,
  onChange,
  editOriginalDate,
  editInitialStatus,
  isLight,
  isTaguigServices,
  canEdit,
  saving,
  cardBg,
  border,
  textPrimary,
  textMuted,
  inputBg,
  inputBorder,
  green,
  branches,
  negotiators,
  driverRoster,
  installerRoster,
  formatBranchLabel,
  formatNegotiatorLabel,
  formatDateLabel,
  getStatusLabel,
  getStatusBadgeStyle,
  ticketHasPaymentInfo,
  qualifiesForInstallComplete,
  onOpenStatusPicker,
  onClose,
  onDelete,
  onSave,
}: ScheduleEditTicketModalProps) {
  const inp = 'rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#16A34A] w-full min-w-0 max-w-full box-border'
  const gridCls = 'grid grid-cols-1 md:grid-cols-2 gap-4'
  const sectionTitleCls = 'text-[10px] font-black uppercase tracking-wider mb-3 opacity-60 text-slate-400'

  const CLOSING_STATUSES = new Set([
    'DONE_INSTALLED',
    'DONE_CLEANING',
    'DONE_SURVEY',
    'DONE_CHECKUP',
    'CANCELLED',
    'COMPLETED',
    'INSTALLED',
  ])
  const isPendingStatus = !form.status || !CLOSING_STATUSES.has((form.status || '').toUpperCase())

  const isReschedStatus = (form.status || '').toUpperCase() === 'RESCHED'
  const justChangedToResched = isReschedStatus && editInitialStatus.toUpperCase() !== 'RESCHED'
  const showPaymentSection = !isPendingStatus && (
    ticketHasPaymentInfo(form)
    || Boolean(form.modeOfPayment || form.installationCharges != null)
    || (form.status || '').toUpperCase() === 'INSTALLED'
    || (form.status || '').toUpperCase() === 'DONE_INSTALLED'
  )

  const reschedFieldStyle = {
    backgroundColor: isLight ? '#fffbeb' : 'rgba(251,191,36,0.08)',
    border: `2px solid ${isLight ? '#fbbf24' : 'rgba(251,191,36,0.55)'}`,
    boxShadow: isLight ? '0 0 0 3px rgba(251,191,36,0.2)' : '0 0 0 3px rgba(251,191,36,0.15)',
  }

  const statusVal = String(form.status || 'INSTALLATION').toUpperCase().replace(/\s+/g, '_')
  const statusStyle = getStatusBadgeStyle(statusVal, isLight)

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col overflow-hidden sm:items-center sm:justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={e => e.stopPropagation()}
    >
      <div
        className="w-full flex flex-col overflow-hidden shadow-2xl min-h-0 min-w-0 max-w-full h-full sm:h-auto sm:max-w-3xl sm:rounded-2xl sm:max-h-[90vh]"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div
          className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 flex items-start justify-between gap-2 safe-area-top min-w-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black uppercase tracking-wide truncate" style={{ color: textPrimary }}>
              Edit Ticket
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {form.id ? (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textPrimary }}>
                  {form.ticketNumber || 'Auto'}
                </span>
              ) : null}
              {form.branchId ? (
                <span className="text-[9px] font-bold uppercase tracking-wide truncate max-w-full" style={{ color: textMuted }}>
                  {formatBranchLabel(form.branchId)}
                </span>
              ) : null}
              {editOriginalDate && !isReschedStatus ? (
                <span className="text-[9px] font-semibold shrink-0" style={{ color: textMuted }}>
                  {formatDateLabel(editOriginalDate)}
                </span>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 shrink-0 rounded-lg hover:bg-slate-200/20" style={{ color: textMuted }} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-6 gap-5 sm:gap-6 overflow-y-auto flex-1 min-h-0 flex flex-col">
          <div
            className="rounded-xl p-4"
            style={{
              border: `1px solid ${isLight ? 'rgba(22,163,74,0.28)' : 'rgba(74,222,128,0.25)'}`,
              backgroundColor: isLight ? 'rgba(240,253,244,0.85)' : 'rgba(22,163,74,0.08)',
            }}
          >
            <h4 className="text-[10px] font-black uppercase tracking-wider mb-3 text-emerald-600">Branch & OIC</h4>
            <div className={gridCls}>
              <Field label="Assigned Branch" required>
                <select
                  value={form.branchId || ''}
                  onChange={e => onChange({ branchId: e.target.value, negotiatorId: '' })}
                  className={inp}
                  style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                >
                  <option value="">{branches.length ? 'Select branch...' : 'Loading branches...'}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="OIC / Negotiator" required>
                <select
                  value={form.negotiatorId || ''}
                  onChange={e => onChange({ negotiatorId: e.target.value })}
                  disabled={!form.branchId}
                  className={`${inp} disabled:opacity-50`}
                  style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                >
                  <option value="">{form.branchId ? 'Select negotiator' : 'Select branch first'}</option>
                  {negotiators.map(emp => <option key={emp.id} value={emp.id}>{formatNegotiatorLabel(emp)}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div>
            <h4 className={sectionTitleCls}>Customer</h4>
            <div className={gridCls}>
              <Field label="Customer Name" required>
                <input type="text" value={form.customerName || ''} onChange={e => onChange({ customerName: e.target.value })} className={inp} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Contact No." required>
                <input type="text" value={form.contactPhone || ''} onChange={e => onChange({ contactPhone: e.target.value })} className={inp} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Destination / Address" required full>
                <textarea value={form.location || ''} onChange={e => onChange({ location: e.target.value })} rows={2} className={`${inp} resize-none`} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="District">
                <input type="text" value={form.district || ''} onChange={e => onChange({ district: e.target.value })} className={inp} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Commit Terms" full>
                <textarea value={form.commitTerms || ''} onChange={e => onChange({ commitTerms: e.target.value })} rows={1} className={`${inp} resize-none`} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
            </div>
          </div>

          <div>
            <h4 className={sectionTitleCls}>Service & Schedule</h4>
            <div className={gridCls}>
              <Field label="Ticket Type" required>
                <select
                  value={form.ticketCategory || 'INSTALLATION'}
                  onChange={e => onChange({ ticketCategory: e.target.value as TicketCategoryValue })}
                  className={inp}
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                >
                  {FIELD_TICKET_CATEGORIES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </Field>
              <Field label="Brand / Unit Type">
                <input type="text" value={form.unitType || ''} onChange={e => onChange({ unitType: e.target.value })} className={inp} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Dealer (DLR)">
                <input type="text" value={form.sourceVendor || ''} onChange={e => onChange({ sourceVendor: e.target.value })} className={inp} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Service / Driver">
                <input
                  type="text"
                  value={form.serviceDriver || ''}
                  list="schedule-edit-driver-roster"
                  placeholder={driverRoster.length ? 'Select or type driver…' : 'e.g. STRADA ROMMEL'}
                  onChange={e => onChange({ serviceDriver: e.target.value })}
                  className={inp}
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
                <datalist id="schedule-edit-driver-roster">
                  {driverRoster.map(name => <option key={name} value={name} />)}
                </datalist>
              </Field>
              <Field label={isTaguigServices ? 'Technician' : 'Installer / Technician'}>
                <input
                  type="text"
                  value={form.installerName || ''}
                  list="schedule-edit-installer-roster"
                  placeholder={installerRoster.length ? 'Select or type installer…' : 'e.g. RANIL'}
                  onChange={e => onChange({ installerName: e.target.value })}
                  className={inp}
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
                <datalist id="schedule-edit-installer-roster">
                  {installerRoster.map(name => <option key={name} value={name} />)}
                </datalist>
              </Field>
              <Field label="Ticket No.">
                <input type="text" value={form.ticketNumber || ''} placeholder="e.g. AS-805" onChange={e => onChange({ ticketNumber: e.target.value })} className={inp} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Control No. / SI (Aircon)">
                <input type="text" value={form.controlNumber || ''} placeholder="Aircon papers / SI" onChange={e => onChange({ controlNumber: e.target.value })} className={inp} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
              <Field label="Final Schedule Date" full>
                <input
                  type="date"
                  value={form.finalDate || ''}
                  onChange={e => onChange({ finalDate: e.target.value, preferredDate: e.target.value })}
                  className={inp}
                  style={{
                    backgroundColor: isLight ? '#f0fdf4' : 'rgba(22,163,74,0.08)',
                    border: `1px solid ${isLight ? '#86efac' : 'rgba(22,163,74,0.35)'}`,
                    color: textPrimary,
                    colorScheme: isLight ? 'light' : 'dark',
                  }}
                />
              </Field>

              <div className={`grid grid-cols-1 gap-4 md:col-span-2 ${isReschedStatus ? 'md:grid-cols-2' : ''}`}>
                <Field label="Status" required>
                  <button
                    type="button"
                    onClick={e => onOpenStatusPicker(e.currentTarget)}
                    className="w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left transition-all hover:opacity-95"
                    style={{
                      backgroundColor: statusStyle.backgroundColor,
                      border: `2px solid ${statusStyle.borderColor}`,
                      minHeight: 48,
                    }}
                  >
                    <span
                      className="inline-flex items-center rounded-full font-black uppercase tracking-wide border truncate px-3 py-1.5 text-xs"
                      style={{ color: statusStyle.color, backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor }}
                    >
                      {getStatusLabel(statusVal)}
                    </span>
                    <ChevronDown className="w-4 h-4 shrink-0" style={{ color: statusStyle.color }} />
                  </button>
                </Field>

                {isReschedStatus ? (
                  <div className="flex flex-col gap-2 min-w-0">
                    <Field label="Reschedule To" required={!form.reschedulePending}>
                      <input
                        type="date"
                        autoFocus={justChangedToResched && !form.reschedulePending}
                        disabled={form.reschedulePending}
                        value={form.rescheduleToDate || ''}
                        onChange={e => onChange({ rescheduleToDate: e.target.value, reschedulePending: false })}
                        className={`${inp} disabled:opacity-50`}
                        style={{ ...reschedFieldStyle, maxWidth: '100%' }}
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-[11px] font-semibold cursor-pointer" style={{ color: textPrimary }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.reschedulePending)}
                        onChange={e => onChange({
                          reschedulePending: e.target.checked,
                          rescheduleToDate: e.target.checked ? '' : (form.rescheduleToDate || editOriginalDate || ''),
                        })}
                        className="rounded border-slate-300"
                      />
                      Pending — no date yet
                    </label>
                  </div>
                ) : null}
              </div>

              {isReschedStatus && editOriginalDate ? (
                <p className="text-[11px] font-semibold leading-relaxed md:col-span-2" style={{ color: isLight ? '#92400e' : '#fcd34d' }}>
                  {form.reschedulePending
                    ? `Stays on ${formatDateLabel(editOriginalDate)} as rescheduled (pending new date).`
                    : form.rescheduleToDate && form.rescheduleToDate !== editOriginalDate
                      ? `Row will gray out on ${formatDateLabel(editOriginalDate)} and appear on ${formatDateLabel(form.rescheduleToDate)}.`
                      : `Currently on ${formatDateLabel(editOriginalDate)} — pick a new date or mark as pending.`}
                </p>
              ) : null}

              <Field label="Remarks / Update" full>
                <textarea value={form.remarks || ''} onChange={e => onChange({ remarks: e.target.value })} rows={2} className={`${inp} resize-none`} style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }} />
              </Field>
            </div>
          </div>

          {!isPendingStatus && (
            <div>
              <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
                <h4 className={sectionTitleCls}>Payment</h4>
                {!showPaymentSection ? (
                  <button
                    type="button"
                    onClick={() => onChange({ modeOfPayment: form.modeOfPayment || 'CASH' })}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors hover:opacity-80 shrink-0"
                    style={{ borderColor: inputBorder, color: green }}
                  >
                    + Add
                  </button>
                ) : null}
              </div>
              {showPaymentSection ? (
                <div
                  className={`${gridCls} rounded-xl p-4`}
                  style={{
                    border: `1px solid ${ticketHasPaymentInfo(form) ? (isLight ? '#86efac' : 'rgba(34,197,94,0.35)') : inputBorder}`,
                    backgroundColor: ticketHasPaymentInfo(form) ? (isLight ? '#f0fdf4' : 'rgba(22,163,74,0.06)') : inputBg,
                  }}
                >
                  <Field label="Mode of Payment">
                    <select
                      value={form.modeOfPayment || ''}
                      onChange={e => {
                        const nextMode = e.target.value
                        onChange({
                          modeOfPayment: nextMode,
                          installationCharges: (nextMode === 'FREE' || nextMode === 'FREE INSTALL')
                            ? 0
                            : nextMode === 'PENDING'
                              ? undefined
                              : form.installationCharges,
                        })
                      }}
                      className={inp}
                      style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                    >
                      <option value="">-- Select --</option>
                      <option value="CASH">CASH</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
                      <option value="GCASH">GCASH</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="FREE INSTALL">FREE INSTALL</option>
                      <option value="PENDING">PENDING</option>
                    </select>
                  </Field>
                  <Field label="Payment Amount (₱)">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.installationCharges ?? ''}
                      disabled={form.modeOfPayment === 'FREE' || form.modeOfPayment === 'FREE INSTALL' || form.modeOfPayment === 'PENDING'}
                      onChange={e => onChange({ installationCharges: e.target.value ? Number(e.target.value) : undefined })}
                      className={`${inp} disabled:opacity-60`}
                      style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                    />
                  </Field>
                  {qualifiesForInstallComplete(form) && (form.status || '').toUpperCase() !== 'COMPLETED' ? (
                    <p className="text-[11px] font-semibold md:col-span-2" style={{ color: green }}>
                      Installed remarks + payment detected — saving will complete this ticket (view in Archives tab).
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div
          className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 border-t safe-area-bottom"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#060C18' }}
        >
          {canEdit && onDelete ? (
            <button type="button" onClick={onDelete} disabled={saving} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              Delete Ticket
            </button>
          ) : <div className="hidden sm:block" />}
          <div className="flex gap-2.5 w-full sm:w-auto sm:ml-auto">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold border" style={{ backgroundColor: cardBg, borderColor: inputBorder, color: textMuted }}>
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={saving} className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: green }}>
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</> : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
