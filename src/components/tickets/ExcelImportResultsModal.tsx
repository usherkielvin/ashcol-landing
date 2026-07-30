import { X } from 'lucide-react'
import { EMPTY_CELL } from '../../utils/textSanitize'
import {
  type Ticket,
  type ImportUpdate,
  type ImportPaymentConfirmation,
  type ImportUnmatchedRow,
  getF,
} from '../../utils/ticketHelpers'

export function ExcelImportResultsModal({
  results,
  isLight,
  isTaguigServices,
  targetDate,
  saving,
  onClose,
  onTargetDateChange,
  onPaymentFieldChange,
  onApply,
}: {
  results: {
    isOpen: boolean
    fileName: string
    rowRangeLabel: string
    totalRows: number
    matchedCount: number
    unmatchedCount: number
    autoCompletedCount: number
    updates: ImportUpdate[]
    needsConfirmation: ImportPaymentConfirmation[]
    unmatched: ImportUnmatchedRow[]
  }
  isLight: boolean
  isTaguigServices: boolean
  targetDate: string
  saving: boolean
  onClose: () => void
  onTargetDateChange: (value: string) => void
  onPaymentFieldChange: (idx: number, field: 'amount' | 'modeOfPayment' | 'controlNumber', val: string) => void
  onApply: () => void
}) {
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const green = '#16A34A'
  const theadBg = isLight ? '#e8edf3' : '#0f172a'
  const rowEven = isLight ? '#ffffff' : '#0f172a'
  const rowOdd = isLight ? '#f7fbf8' : '#1b2330'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
      <div className="flex flex-col w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between gap-3 shrink-0 border-b"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
          <div className="min-w-0">
            <h3 className="font-black text-sm leading-tight" style={{ color: textPrimary }}>
              Excel Import: {results.fileName}
            </h3>
            <p className="text-[10px] font-semibold mt-0.5" style={{ color: textMuted }}>
              Review parsed updates from {results.rowRangeLabel} (Excel or scanned image) and confirm payment completion before saving.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-500/10 transition-colors"
              style={{ color: textMuted }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

          {/* Stats dashboard */}
          <div className="grid grid-cols-4 gap-3 shrink-0">
            {[
              { label: 'Total Rows', value: results.totalRows, color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
              { label: 'Matched', value: results.matchedCount, color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
              { label: 'Auto-Completed', value: results.autoCompletedCount, color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
              { label: 'Unmatched', value: results.unmatchedCount, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
            ].map(stat => (
              <div key={stat.label} className="rounded-2xl p-3 border" style={{ backgroundColor: stat.bg, borderColor: `rgba(0,0,0,0.08)` }}>
                <div className="text-lg font-black" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textMuted }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Section 1: Tickets marked as installed but needing payment info */}
          {results.needsConfirmation.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#F59E0B' }}>
                ⚠️ Needs Payment Confirmation ({results.needsConfirmation.length})
              </h4>
              <p className="text-[10px]" style={{ color: textMuted }}>
                These tickets are marked as installed in the spreadsheet but did not contain valid payment details. Please complete them below:
              </p>
              <div className="flex flex-col gap-2 border rounded-2xl overflow-hidden" style={{ borderColor: border, backgroundColor: inputBg }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f1f5f9' : '#0d1b2e' }}>
                        <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Customer</th>
                        <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Remarks</th>
                        <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Payment Mode</th>
                        <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Amount Charged</th>
                        <th className="px-3 py-2 font-bold" style={{ color: textMuted }}>Control # / SI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {results.needsConfirmation.map((item, idx) => {
                        const custName = getF(item.ticket, 'customerName', 'customer_name') || item.ticket.title
                        return (
                          <tr key={`${item.ticket.id}-row-${item.rowIdx}`} className="hover:bg-slate-500/5">
                            <td className="px-3 py-2 font-semibold" style={{ color: textPrimary }}>{custName}</td>
                            <td className="px-3 py-2 italic opacity-85" style={{ color: textMuted }}>{item.value}</td>
                            <td className="px-3 py-2">
                              <select
                                value={item.modeOfPayment}
                                onChange={e => onPaymentFieldChange(idx, 'modeOfPayment', e.target.value)}
                                className="rounded px-2 py-1 outline-none text-xs w-full"
                                style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                              >
                                <option value="CASH">CASH</option>
                                <option value="BANK TRANSFER">BANK TRANSFER</option>
                                <option value="GCASH">GCASH</option>
                                <option value="CHEQUE">CHEQUE</option>
                                <option value="FREE INSTALL">FREE INSTALL</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.amount}
                                disabled={item.modeOfPayment === 'FREE INSTALL'}
                                onChange={e => onPaymentFieldChange(idx, 'amount', e.target.value)}
                                placeholder="0.00"
                                className="rounded px-2 py-1 outline-none text-xs w-24 font-bold disabled:opacity-50"
                                style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={item.controlNumber}
                                onChange={e => onPaymentFieldChange(idx, 'controlNumber', e.target.value)}
                                placeholder="SI / Control #"
                                className="rounded px-2 py-1 outline-none text-xs w-28"
                                style={{ backgroundColor: cardBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Regular matched updates and auto-completions */}
          {results.updates.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: green }}>
                ✅ Ready to Update ({results.updates.length})
              </h4>
              <div className="max-h-48 overflow-y-auto border rounded-2xl p-3 flex flex-col gap-2"
                style={{ borderColor: border, backgroundColor: inputBg }}>
                {results.updates.map((item) => {
                  const custName = getF(item.ticket, 'customerName', 'customer_name') || item.ticket.title
                  const fields = Object.keys(item.updatedFields).filter(k => item.updatedFields[k as keyof Ticket] !== undefined)
                  const isComplete = item.updatedFields.status === 'COMPLETED'
                  return (
                    <div key={`${item.ticket.id}-row-${item.rowIdx}`} className="flex items-start justify-between text-xs py-1 border-b last:border-b-0" style={{ borderColor: border }}>
                      <div>
                        <span className="font-bold" style={{ color: textPrimary }}>{custName}</span>
                        <span className="ml-2 text-[10px] opacity-70" style={{ color: textMuted }}>
                          (Excel row {item.rowIdx})
                        </span>
                        <p className="text-[10px] opacity-75 mt-0.5" style={{ color: textMuted }}>
                          Changes: {fields.length > 0 ? fields.join(', ') : 'no changes'}
                        </p>
                      </div>
                      {isComplete ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-indigo-500 bg-indigo-500/10 border border-indigo-500/25">
                          Auto-Complete
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-emerald-500 bg-emerald-500/10 border border-emerald-500/25">
                          Update Info
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section 3: Unmatched Rows Table */}
          {results.unmatched.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#F59E0B' }}>
                ℹ️ Unmatched Rows ({results.unmatchedCount})
              </h4>
              <div className="border rounded-2xl overflow-hidden" style={{ borderColor: border }}>
                <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                  <table className="text-xs text-left" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr className="border-b font-bold" style={{ borderColor: border }}>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>CUSTOMER'S NAME</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>DESTINATION</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>DISTRICT</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>CONTACT NO.</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>BRAND</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'ENDORSED BY' : 'DLR'}</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>STATUS</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'COMMIT (AMOUNT)' : 'COMMIT'}</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'TECHNICIAN' : 'INSTALLER'}</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>{isTaguigServices ? 'CONFIRMATION' : 'NOTE'}</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>SERVICE</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>REMARKS</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>CHARGES</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>PAYMENT MODE</th>
                        <th className="px-3 py-2 font-bold" style={{ backgroundColor: theadBg, color: textMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}` }}>CONTROL #</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: border }}>
                      {results.unmatched.map((row, idx) => {
                        const rowBg = idx % 2 === 0 ? rowEven : rowOdd
                        return (
                          <tr key={row.rowIdx} className="hover:bg-slate-500/5" style={{ backgroundColor: rowBg }}>
                            <td className="px-3 py-2 font-semibold" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.rowIdx}. {row.name}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.location || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.district || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.phone || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.brand || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.dlr || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.status || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.commit || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.installer || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.confirmation || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.service || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.update || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.charges !== undefined ? `₱${Number(row.charges).toLocaleString('en-PH')}` : EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, borderRight: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{row.paymentMode || EMPTY_CELL}</td>
                            <td className="px-3 py-2" style={{ color: textPrimary, whiteSpace: 'nowrap' }}>{row.controlNo || EMPTY_CELL}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3 shrink-0 border-t"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1b2e' }}>
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-xs font-bold" style={{ color: textMuted }}>Scheduled Target Date:</span>
            <input
              type="date"
              value={targetDate}
              onChange={e => onTargetDateChange(e.target.value)}
              className="rounded-xl px-2.5 py-1.5 outline-none border text-xs font-bold transition-all focus:ring-2 focus:ring-green-500"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            />
          </div>
          <button onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/5"
            style={{ borderColor: inputBorder, color: textPrimary }}>
            Cancel
          </button>
          <button onClick={onApply}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm"
            style={{ backgroundColor: green }}>
            {`Apply & Save All (${results.matchedCount} updates, ${results.unmatchedCount} new)`}
          </button>
        </div>

      </div>
    </div>
  )
}
