import ReactDOM from 'react-dom'
import { CalendarDays, ChevronDown, Loader2, X, AlertTriangle } from 'lucide-react'
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
  dealer?: string
  serviceDriver?: string
  driverName?: string
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
  reschedulePending?: boolean
}

type Branch = { id: string; name: string }
type Employee = { id: string; name?: string; branchId?: string | null; email?: string | null }

type ScheduleEditTicketModalProps = {
  form: ScheduleEditForm
  onChange: (patch: Partial<ScheduleEditForm>) => void
  editOriginalDate: string
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
  dealerOptions?: string[]
  onAddDealer?: (name: string) => void
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

function Row({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return <div style={{ display: 'grid', gridTemplateColumns: cols === 3 ? '1fr 1fr 1fr' : cols === 2 ? '1fr 1fr' : '1fr', gap: 12 }}>{children}</div>
}

function Field({ label, required, span, children }: { label: string; required?: boolean; span?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...(span ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, opacity: 0.55, display: 'block' }}>
        {label}{required ? <span style={{ color: '#ef4444' }}> *</span> : null}
      </span>
      {children}
    </div>
  )
}

export function ScheduleEditTicketModal({
  form,
  onChange,
  editOriginalDate,
  isLight,
  isTaguigServices,
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
  dealerOptions = [],
  onAddDealer,
  formatBranchLabel,
  formatNegotiatorLabel,
  formatDateLabel,
  getStatusLabel,
  getStatusBadgeStyle,
  ticketHasPaymentInfo,
  qualifiesForInstallComplete,
  onOpenStatusPicker,
  onClose,
  onSave,
}: ScheduleEditTicketModalProps) {
  const CLOSING_STATUSES = new Set([
    'DONE_INSTALLED', 'DONE_CLEANING', 'DONE_SURVEY', 'DONE_CHECKUP', 'DONE_BACKJOB', 'DONE_SERVICE',
    'DONE_SYSTEM_REPROCESS', 'DONE_DISMANTLE',
    'CANCELLED', 'COMPLETED', 'INSTALLED',
  ])

  const isReschedStatus = (form.status || '').toUpperCase() === 'RESCHED'
  const isPendingStatus = !form.status || !CLOSING_STATUSES.has((form.status || '').toUpperCase())

  const isNoPayment = !form.modeOfPayment
    || String(form.modeOfPayment || '').toUpperCase().replace(/\s+/g, '_') === 'NO_PAYMENT'

  const statusVal = String(form.status || 'INSTALLATION').toUpperCase().replace(/\s+/g, '_')
  const statusStyle = getStatusBadgeStyle(statusVal, isLight)

  const inp: React.CSSProperties = {
    backgroundColor: inputBg,
    border: `1px solid ${inputBorder}`,
    color: textPrimary,
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 12,
    fontWeight: 600,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  }

  const selectInp: React.CSSProperties = { ...inp, backgroundColor: cardBg, cursor: 'pointer' }

  const divider = <div style={{ height: 1, backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }} />

  const clearingDateWarning = !form.finalDate && !!editOriginalDate && !isReschedStatus

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col overflow-hidden sm:items-center sm:justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={e => e.stopPropagation()}
    >
      <div
        className="w-full flex flex-col overflow-hidden shadow-2xl min-h-0 h-full sm:h-auto sm:max-w-[620px] sm:rounded-2xl sm:max-h-[92vh]"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="shrink-0 px-4 sm:px-5 py-3 flex items-center justify-between gap-3 safe-area-top"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: textPrimary, letterSpacing: '-0.01em', margin: 0 }}>Edit Ticket</h3>
              {form.ticketNumber && (
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 5, backgroundColor: isLight ? '#f1f5f9' : '#1e293b', color: textMuted }}>
                  {form.ticketNumber}
                </span>
              )}
            </div>
            {form.branchId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: textMuted }}>{formatBranchLabel(form.branchId)}</span>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} style={{ color: textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8 }} aria-label="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Branch & OIC */}
          <div style={{ borderRadius: 12, padding: 14, border: `1px solid ${isLight ? 'rgba(22,163,74,0.2)' : 'rgba(74,222,128,0.18)'}`, backgroundColor: isLight ? 'rgba(240,253,244,0.7)' : 'rgba(22,163,74,0.06)' }}>
            <Row>
              <Field label="Assigned Branch" required>
                <select value={form.branchId || ''} onChange={e => onChange({ branchId: e.target.value, negotiatorId: '' })} style={selectInp}>
                  <option value="">{branches.length ? 'Select branch…' : 'Loading…'}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="OIC / Negotiator" required>
                <select
                  value={form.negotiatorId || ''}
                  onChange={e => onChange({ negotiatorId: e.target.value })}
                  disabled={!form.branchId}
                  style={{ ...selectInp, opacity: !form.branchId ? 0.5 : 1 }}
                >
                  <option value="">{form.branchId ? 'Select negotiator' : 'Select branch first'}</option>
                  {negotiators.map(emp => <option key={emp.id} value={emp.id}>{formatNegotiatorLabel(emp)}</option>)}
                </select>
              </Field>
            </Row>
          </div>

          {/* Customer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Row>
              <Field label="Customer Name" required>
                <input type="text" value={form.customerName || ''} onChange={e => onChange({ customerName: e.target.value.toUpperCase() })} style={inp} placeholder="Full name" />
              </Field>
              <Field label="Contact No." required>
                <input type="text" value={form.contactPhone || ''} onChange={e => onChange({ contactPhone: e.target.value })} style={inp} placeholder="Phone number" />
              </Field>
            </Row>
            <Field label="Address / Destination" required span>
              <textarea value={form.location || ''} onChange={e => onChange({ location: e.target.value.toUpperCase() })} rows={2} style={{ ...inp, resize: 'none' }} placeholder="Complete address" />
            </Field>
            <Row>
              <Field label="District">
                <input type="text" value={form.district || ''} onChange={e => onChange({ district: e.target.value })} style={inp} />
              </Field>
              <Field label="Commit Terms">
                <input type="text" value={form.commitTerms || ''} onChange={e => onChange({ commitTerms: e.target.value })} style={inp} />
              </Field>
            </Row>
          </div>

          {divider}

          {/* Service */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Row>
              <Field label="Brand / Unit Type">
                <input type="text" value={form.unitType || ''} onChange={e => onChange({ unitType: e.target.value })} style={inp} placeholder="e.g. CARRIER 1.0HP" />
              </Field>
              <Field label="Control No. / SI">
                <input type="text" value={form.controlNumber || ''} onChange={e => onChange({ controlNumber: e.target.value })} style={inp} placeholder="Aircon papers / SI" />
              </Field>
            </Row>
            <Row>
              <Field label="Dealer (DLR)">
                <input
                  type="text"
                  value={form.dealer || ''}
                  list="sched-edit-dealer-list"
                  onChange={e => onChange({ dealer: e.target.value })}
                  onBlur={e => {
                    const name = e.target.value.trim().toUpperCase()
                    if (!name || name.includes(' - ')) return
                    if (!dealerOptions.some(d => d.toUpperCase() === name)) {
                      onAddDealer?.(name)
                    }
                  }}
                  style={inp}
                  placeholder="Store or supplier"
                />
                <datalist id="sched-edit-dealer-list">{dealerOptions.map(d => <option key={d} value={d} />)}</datalist>
              </Field>
            </Row>
            <Row cols={3}>
              <Field label="Driver">
                <input type="text" value={form.driverName || ''} list="sched-edit-driver-roster" placeholder={driverRoster.length ? 'Select or type…' : 'e.g. ROMMEL'} onChange={e => onChange({ driverName: e.target.value })} style={inp} />
                <datalist id="sched-edit-driver-roster">{driverRoster.map(n => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field label="Service Vehicle">
                <input type="text" value={form.serviceDriver || ''} placeholder="e.g. FB19 or T2" onChange={e => onChange({ serviceDriver: e.target.value })} style={inp} />
              </Field>
              <Field label={isTaguigServices ? 'Technician' : 'Installer'}>
                <input type="text" value={form.installerName || ''} list="sched-edit-installer-roster" placeholder={installerRoster.length ? 'Select or type…' : 'e.g. RANIL'} onChange={e => onChange({ installerName: e.target.value })} style={inp} />
                <datalist id="sched-edit-installer-roster">{installerRoster.map(n => <option key={n} value={n} />)}</datalist>
              </Field>
            </Row>
          </div>

          {divider}

          {/* Date + Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Row>
              <Field label="Final Date">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 8, padding: '7px 10px', cursor: form.reschedulePending ? 'not-allowed' : 'pointer', opacity: form.reschedulePending ? 0.5 : 1 }}>
                  <CalendarDays style={{ width: 14, height: 14, color: green, flexShrink: 0 }} strokeWidth={2.2} />
                  <input
                    type="date"
                    disabled={form.reschedulePending}
                    value={form.finalDate || ''}
                    onChange={e => onChange({ finalDate: e.target.value, preferredDate: e.target.value })}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontWeight: 700, color: form.finalDate ? textPrimary : textMuted, colorScheme: isLight ? 'light' : 'dark' as any, fontFamily: 'inherit', cursor: 'inherit', minWidth: 0 }}
                  />
                  {form.finalDate && !form.reschedulePending && (
                    <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onChange({ finalDate: '', preferredDate: '' }) }} style={{ color: textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }} aria-label="Clear date">
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  )}
                </label>
                {/* Editable at any time, including past dates — moving this date always just
                    moves the ticket, no duplicate row is left on the old date. */}
              </Field>

              <Field label="Status" required>
                <button
                  type="button"
                  onClick={e => onOpenStatusPicker(e.currentTarget)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, backgroundColor: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: statusStyle.color, backgroundColor: statusStyle.backgroundColor, border: `1px solid ${statusStyle.borderColor}`, borderRadius: 5, padding: '2px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%' }}>
                    {getStatusLabel(statusVal)}
                  </span>
                  <ChevronDown style={{ width: 13, height: 13, color: textMuted, flexShrink: 0 }} />
                </button>
              </Field>
            </Row>

            {/* Resched sub-block — Final Date above is the single source for "where this ticket
                is now"; Pending just means no new date has been decided yet (Final Date stays
                locked at its current value until you uncheck Pending and pick a new one). */}
            {isReschedStatus && (
              <div style={{ borderRadius: 10, padding: 12, backgroundColor: isLight ? '#fffbeb' : 'rgba(251,191,36,0.07)', border: `1.5px solid ${isLight ? '#fbbf24' : 'rgba(251,191,36,0.4)'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, color: textPrimary, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.reschedulePending)}
                    onChange={e => onChange({ reschedulePending: e.target.checked })}
                  />
                  Pending (no date yet)
                </label>
                {editOriginalDate && (
                  <p style={{ fontSize: 10, fontWeight: 600, color: isLight ? '#92400e' : '#fcd34d', margin: 0 }}>
                    {form.reschedulePending
                      ? `Stays on ${formatDateLabel(editOriginalDate)} as rescheduled (pending).`
                      : form.finalDate && form.finalDate !== editOriginalDate
                        ? `Will move from ${formatDateLabel(editOriginalDate)} → ${formatDateLabel(form.finalDate)}.`
                        : `Currently on ${formatDateLabel(editOriginalDate)} — pick a new Final Date above or mark as pending.`}
                  </p>
                )}
              </div>
            )}

            {/* Warning: clearing date returns to My Tickets */}
            {clearingDateWarning && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 8, padding: 10, backgroundColor: isLight ? '#fef3c7' : 'rgba(251,191,36,0.08)', border: `1px solid ${isLight ? '#fbbf24' : 'rgba(251,191,36,0.3)'}` }}>
                <AlertTriangle style={{ width: 13, height: 13, color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 10, fontWeight: 600, color: isLight ? '#92400e' : '#fbbf24', margin: 0 }}>
                  Clearing the date will return this ticket to <strong>My Tickets</strong> and remove it from the schedule.
                </p>
              </div>
            )}
          </div>

          {/* Remarks */}
          <Field label="Remarks / Update" span>
            <textarea value={form.remarks || ''} onChange={e => onChange({ remarks: e.target.value.toUpperCase() })} rows={2} style={{ ...inp, resize: 'none', textTransform: 'uppercase' }} className="uppercase" placeholder="Any notes or update…" />
          </Field>

          {/* Payment */}
          {!isPendingStatus && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {divider}
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.5 }}>Payment</span>
              <div style={{ borderRadius: 12, padding: 12, border: `1px solid ${ticketHasPaymentInfo(form) ? (isLight ? '#86efac' : 'rgba(34,197,94,0.3)') : inputBorder}`, backgroundColor: ticketHasPaymentInfo(form) ? (isLight ? '#f0fdf4' : 'rgba(22,163,74,0.05)') : inputBg }}>
                <Row>
                  <Field label="Mode of Payment">
                    <select
                      value={form.modeOfPayment || 'NO_PAYMENT'}
                      onChange={e => {
                        const v = e.target.value
                        onChange({
                          modeOfPayment: v,
                          installationCharges: (v === 'NO_PAYMENT' || v === 'FREE' || v === 'FREE INSTALL')
                            ? 0
                            : v === 'PENDING'
                              ? undefined
                              : form.installationCharges,
                        })
                      }}
                      style={selectInp}
                    >
                      <option value="NO_PAYMENT">NO PAYMENT</option>
                      <option value="CASH">CASH</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
                      <option value="GCASH">GCASH</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="FREE INSTALL">FREE INSTALL</option>
                      <option value="PENDING">PENDING</option>
                    </select>
                  </Field>
                  <Field label="Amount (₱)">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={isNoPayment ? '' : (form.installationCharges ?? '')}
                      disabled={isNoPayment || form.modeOfPayment === 'FREE' || form.modeOfPayment === 'FREE INSTALL' || form.modeOfPayment === 'PENDING'}
                      onChange={e => onChange({ installationCharges: e.target.value ? Number(e.target.value) : undefined })}
                      style={{ ...inp, opacity: (isNoPayment || form.modeOfPayment === 'FREE' || form.modeOfPayment === 'FREE INSTALL' || form.modeOfPayment === 'PENDING') ? 0.5 : 1 }}
                    />
                  </Field>
                </Row>
                {isNoPayment && (
                  <p style={{ fontSize: 10, fontWeight: 600, color: textMuted, marginTop: 8, marginBottom: 0 }}>
                    No payment — PAYMENT column stays blank after save.
                  </p>
                )}
                {qualifiesForInstallComplete(form) && (form.status || '').toUpperCase() !== 'COMPLETED' && !isNoPayment && (
                  <p style={{ fontSize: 10, fontWeight: 700, color: green, marginTop: 8, marginBottom: 0 }}>
                    ✓ Installed remarks + payment detected — saving will complete this ticket.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 px-4 sm:px-5 py-3 flex items-center justify-end gap-2.5 safe-area-bottom"
          style={{ borderTop: `1px solid ${border}`, backgroundColor: isLight ? '#f8fafc' : 'rgba(6,12,24,0.6)' }}
        >
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: `1px solid ${inputBorder}`, backgroundColor: 'transparent', color: textMuted, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} style={{ padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 800, backgroundColor: green, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            {saving ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
