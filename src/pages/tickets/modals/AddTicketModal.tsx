import React from 'react'
import ReactDOM from 'react-dom'
import { Plus, X } from 'lucide-react'
import { Field } from '../../../components/tickets/Field'
import {
  FIELD_TICKET_CATEGORIES,
  type TicketCategoryValue,
} from '../../../constants/ticketCategories'
import { EMPTY_CELL } from '../../../utils/textSanitize'
import type { Employee } from '../types'
import type { Ticket } from '../../../utils/ticketHelpers'

export interface AddTicketModalProps {
  open: boolean
  onClose: () => void
  activeBranchLabel?: string
  addForm: Partial<Ticket> & { serviceDriver?: string; ticketCategory?: TicketCategoryValue }
  setAddForm: React.Dispatch<React.SetStateAction<Partial<Ticket> & { serviceDriver?: string; ticketCategory?: TicketCategoryValue }>>
  guessDistrict: (loc: string) => string
  relayCustomStores: string[]
  handlePersistCustomStores: (stores: string[]) => void
  activeBranchRoster: { drivers: string[]; installers: string[] }
  isTaguigServices: boolean
  addModalTechnicians: { id: string; name: string; label?: string }[]
  addModalNegotiators: Employee[]
  formatNegotiatorLabel: (emp: Employee) => string
  promptSaveManualTicket: () => void
  isLight: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
}

export const AddTicketModal: React.FC<AddTicketModalProps> = ({
  open,
  onClose,
  activeBranchLabel,
  addForm,
  setAddForm,
  guessDistrict,
  relayCustomStores,
  handlePersistCustomStores,
  activeBranchRoster,
  isTaguigServices,
  addModalTechnicians,
  addModalNegotiators,
  formatNegotiatorLabel,
  promptSaveManualTicket,
  isLight,
  cardBg,
  border,
  textPrimary,
  textMuted,
  inputBg,
  inputBorder,
}) => {
  if (!open) return null

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-4 sm:pt-8 px-3 sm:px-6 pb-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.stopPropagation()}
    >
      <div
        className="flex flex-col w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: cardBg, borderColor: border, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="shrink-0 border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#111827' }}>
          <div className="px-5 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-base leading-tight" style={{ color: textPrimary }}>Add Schedule Ticket</h2>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: textMuted }}>
                  Branch: {activeBranchLabel || 'Select branch'} · Negotiators for this branch only
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border transition-colors hover:bg-slate-500/10 shrink-0"
              style={{ borderColor: inputBorder, color: textMuted }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 flex flex-col gap-5">
          <div>
            <div className="pt-0.5 pb-1.5 border-b mb-3" style={{ borderColor: border }}>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Customer Information</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Preferred Date" required>
                <input
                  type="date"
                  value={addForm.preferredDate || ''}
                  onChange={e => setAddForm({ ...addForm, preferredDate: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
              <Field label="Customer Name" required>
                <input
                  type="text"
                  value={addForm.customerName || ''}
                  onChange={e => setAddForm({ ...addForm, customerName: e.target.value.toUpperCase() })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
              <Field label="Contact No." required>
                <input
                  type="text"
                  value={addForm.contactPhone || ''}
                  onChange={e => setAddForm({ ...addForm, contactPhone: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
              <Field label="District">
                <input
                  type="text"
                  value={addForm.district || ''}
                  onChange={e => setAddForm({ ...addForm, district: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
              <Field label="Destination/Address" required full>
                <textarea
                  value={addForm.location || ''}
                  onChange={e => {
                    const loc = e.target.value.toUpperCase()
                    const guessed = guessDistrict(loc)
                    setAddForm(prev => ({
                      ...prev,
                      location: loc,
                      district: guessed || prev.district,
                    }))
                  }}
                  rows={2}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none w-full"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
              <Field label="Commit Terms" full>
                <input
                  type="text"
                  value={addForm.commitTerms || ''}
                  onChange={e => setAddForm({ ...addForm, commitTerms: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
            </div>
          </div>

          <div>
            <div className="pt-0.5 pb-1.5 border-b mb-3" style={{ borderColor: border }}>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Service & Assignment</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Ticket Type" required>
                <select
                  value={addForm.ticketCategory || 'INSTALLATION'}
                  onChange={e => setAddForm({ ...addForm, ticketCategory: e.target.value as TicketCategoryValue })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  {FIELD_TICKET_CATEGORIES.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Brand / Unit Type">
                <input
                  type="text"
                  value={addForm.unitType || ''}
                  onChange={e => setAddForm({ ...addForm, unitType: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
              <Field label="Dealer / Store">
                <input
                  type="text"
                  value={addForm.dealer || ''}
                  list="add-ticket-dealer-list"
                  onChange={e => setAddForm({ ...addForm, dealer: e.target.value })}
                  onBlur={e => {
                    const name = e.target.value.trim().toUpperCase()
                    if (!name || name.includes(' - ')) return
                    if (!relayCustomStores.some(d => d.toUpperCase() === name)) {
                      handlePersistCustomStores([...relayCustomStores, name])
                    }
                  }}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
                <datalist id="add-ticket-dealer-list">
                  {relayCustomStores.map(d => <option key={d} value={d} />)}
                </datalist>
              </Field>
              <Field label="Service / Driver">
                <input
                  type="text"
                  value={addForm.serviceDriver || ''}
                  list="add-ticket-driver-roster"
                  placeholder={activeBranchRoster.drivers.length ? 'Select or type driver…' : 'e.g. T3 (DOMINIC) - 1'}
                  onChange={e => setAddForm({ ...addForm, serviceDriver: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
                <datalist id="add-ticket-driver-roster">
                  {activeBranchRoster.drivers.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>
              <Field label={isTaguigServices ? 'Technician' : 'Installer / Technician'}>
                <select
                  value={addForm.installerName || ''}
                  onChange={e => setAddForm({ ...addForm, installerName: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                >
                  <option value="">
                    {isTaguigServices ? 'Select technician…' : 'Select installer / technician…'}
                  </option>
                  {addModalTechnicians.length > 0 ? (
                    addModalTechnicians.map(t => (
                      <option key={t.id} value={t.name}>{t.label || (t.name || '').trim().split(/\s+/)[0]?.toUpperCase() || t.name}</option>
                    ))
                  ) : (
                    activeBranchRoster.installers.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))
                  )}
                </select>
              </Field>
              <Field label="Negotiator" required>
                <select
                  value={addForm.negotiatorId || ''}
                  onChange={e => setAddForm({ ...addForm, negotiatorId: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, fontFamily: 'inherit' }}
                >
                  <option value="">
                    {addModalNegotiators.length ? 'Select negotiator' : 'No negotiators for this branch'}
                  </option>
                  {addModalNegotiators.map(emp => (
                    <option key={emp.id} value={emp.id}>{formatNegotiatorLabel(emp)}</option>
                  ))}
                </select>
                {addModalNegotiators.length === 0 && (
                  <span className="text-[10px] font-semibold text-amber-600 mt-1">
                    No negotiators assigned to {activeBranchLabel || 'this branch'}.
                  </span>
                )}
              </Field>
              <Field label="Ticket No.">
                <input
                  type="text"
                  value={addForm.ticketNumber || ''}
                  placeholder="Auto-generated if left blank (e.g. AC-001)"
                  onChange={e => setAddForm({ ...addForm, ticketNumber: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
              <Field label="Control No. / SI (Aircon)">
                <input
                  type="text"
                  value={addForm.controlNumber || ''}
                  placeholder={`From import only ${EMPTY_CELL} aircon papers / SI`}
                  onChange={e => setAddForm({ ...addForm, controlNumber: e.target.value })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full normal-case"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
            </div>
          </div>

          <div>
            <div className="pt-0.5 pb-1.5 border-b mb-3" style={{ borderColor: border }}>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Payment (optional)</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Mode of Payment">
                <select
                  value={addForm.modeOfPayment || ''}
                  onChange={e => {
                    const nextMode = e.target.value
                    setAddForm(prev => ({
                      ...prev,
                      modeOfPayment: nextMode,
                      installationCharges: (nextMode === 'FREE' || nextMode === 'FREE INSTALL')
                        ? 0
                        : nextMode === 'PENDING'
                          ? undefined
                          : prev.installationCharges,
                    }))
                  }}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                >
                  <option value="">-- Select --</option>
                  <option value="CASH">CASH</option>
                  <option value="BANK TRANSFER">BANK TRANSFER</option>
                  <option value="GCASH">GCASH</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="FOR COLLECTION">FOR COLLECTION</option>
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
                  value={addForm.installationCharges ?? ''}
                  disabled={addForm.modeOfPayment === 'FREE' || addForm.modeOfPayment === 'FREE INSTALL' || addForm.modeOfPayment === 'PENDING'}
                  onChange={e => setAddForm({ ...addForm, installationCharges: e.target.value ? Number(e.target.value) : undefined })}
                  className="rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full disabled:opacity-60"
                  style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                />
              </Field>
            </div>
          </div>
        </div>

        <div
          className="shrink-0 px-5 sm:px-6 py-3 flex items-center justify-end gap-2.5 border-t"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#111827' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-xs font-bold border transition-colors"
            style={{ backgroundColor: 'transparent', borderColor: inputBorder, color: textMuted }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={promptSaveManualTicket}
            disabled={!addForm.negotiatorId || addModalNegotiators.length === 0}
            className="px-6 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 shadow-md"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            Save Ticket
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
