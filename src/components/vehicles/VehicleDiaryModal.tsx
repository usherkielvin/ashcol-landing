import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { X, Plus, Loader2, Truck, Wrench, Gauge, StickyNote, Receipt } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { resolveImageUrl } from '../../utils/api'
import {
  VEHICLE_EXPENSE_TYPES,
  fetchVehicleExpenses,
  createVehicleExpense,
  uploadVehicleExpenseReceipt,
  type Vehicle,
  type VehicleExpense,
} from '../../utils/vehicleApi'

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

interface Props {
  vehicle: Vehicle
  branchName: string
  canManage: boolean
  onClose: () => void
}

const peso = (v: number) => (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const expenseTypeLabel = (type: string) =>
  VEHICLE_EXPENSE_TYPES.find(t => t.value === type)?.label || type

export default function VehicleDiaryModal({ vehicle, branchName, canManage, onClose }: Props) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'

  const [expenses, setExpenses] = useState<VehicleExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [type, setType] = useState('OIL_CHANGE')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [odometer, setOdometer] = useState('')
  const [notes, setNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setExpenses(await fetchVehicleExpenses(vehicle.id))
    } catch (err) {
      setError(errMsg(err, 'Failed to load expense diary'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [vehicle.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalSpent = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  const resetForm = () => {
    setType('OIL_CHANGE')
    setAmount('')
    setExpenseDate(new Date().toISOString().slice(0, 10))
    setOdometer('')
    setNotes('')
    setReceiptFile(null)
  }

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid amount')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const created = await createVehicleExpense(vehicle.id, {
        type,
        amount: Number(amount),
        expenseDate,
        odometer: odometer ? Number(odometer) : undefined,
        notes: notes.trim() || undefined,
      })
      if (receiptFile) {
        await uploadVehicleExpenseReceipt(vehicle.id, created.id, receiptFile, receiptFile.name)
      }
      resetForm()
      setShowForm(false)
      await load()
    } catch (err) {
      setError(errMsg(err, 'Failed to log expense'))
    } finally {
      setSubmitting(false)
    }
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-[96vw] max-w-[900px] h-[90vh] max-h-[840px] rounded-2xl shadow-2xl flex flex-col overflow-hidden border"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 shrink-0 border-b flex items-center gap-4" style={{ borderColor: border }}>
          <div
            className="w-14 h-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
            style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}
          >
            {vehicle.photoUrl ? (
              <img src={resolveImageUrl(vehicle.photoUrl)} alt={vehicle.name} className="w-full h-full object-cover" />
            ) : (
              <Truck className="w-6 h-6" style={{ color: textMuted }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold truncate" style={{ color: textPrimary }}>{vehicle.name}</div>
            {vehicle.brandModel && (
              <div className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>{vehicle.brandModel}</div>
            )}
            <div className="text-xs mt-0.5" style={{ color: textMuted }}>
              {vehicle.plateNumber || 'No plate on file'} • {branchName || 'Unassigned branch'} • Driver: {vehicle.driverName || 'Unassigned'}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-500/10 shrink-0" style={{ color: textMuted }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="px-6 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#080f1c' }}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
            {expenses.length} logged {expenses.length === 1 ? 'entry' : 'entries'} • Total ₱{peso(totalSpent)}
          </div>
          {canManage && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#10B981' }}
            >
              <Plus className="w-3.5 h-3.5" /> {showForm ? 'CANCEL' : 'ADD EXPENSE'}
            </button>
          )}
        </div>

        {/* Add expense form */}
        {showForm && (
          <div className="px-6 py-4 border-b grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0" style={{ borderColor: border }}>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                {VEHICLE_EXPENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Amount (₱)</label>
              <input
                type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Date</label>
              <input
                type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Odometer (km, optional)</label>
              <input
                type="number" min="0" value={odometer} onChange={e => setOdometer(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Notes (optional)</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="rounded-lg px-3 py-2 text-sm border outline-none resize-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Receipt photo (optional)</label>
              <input
                type="file" accept="image/*"
                onChange={e => setReceiptFile(e.target.files?.[0] || null)}
                className="text-xs"
                style={{ color: textMuted }}
              />
            </div>
            {error && <div className="sm:col-span-2 text-xs font-medium text-red-500">{error}</div>}
            <div className="sm:col-span-2 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#10B981' }}
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                SAVE ENTRY
              </button>
            </div>
          </div>
        )}

        {/* Diary list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: textMuted }} />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-16">
              <Wrench className="w-8 h-8 mx-auto mb-2" style={{ color: textMuted }} />
              <p className="text-sm font-medium" style={{ color: textMuted }}>No expenses logged yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {expenses.map(e => (
                <div
                  key={e.id}
                  className="flex items-start gap-3 p-3.5 rounded-xl border"
                  style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#080f1c' }}
                >
                  {e.receiptPhotoUrl ? (
                    <a href={resolveImageUrl(e.receiptPhotoUrl)} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={resolveImageUrl(e.receiptPhotoUrl)} alt="Receipt" className="w-14 h-14 rounded-lg object-cover border" style={{ borderColor: border }} />
                    </a>
                  ) : (
                    <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: inputBg }}>
                      <Receipt className="w-5 h-5" style={{ color: textMuted }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold" style={{ color: textPrimary }}>{expenseTypeLabel(e.type)}</span>
                      <span className="text-sm font-bold" style={{ color: '#10B981' }}>₱{peso(Number(e.amount))}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs" style={{ color: textMuted }}>
                      <span>{e.expenseDate}</span>
                      {e.odometer != null && (
                        <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> {e.odometer.toLocaleString()} km</span>
                      )}
                      {e.createdBy && <span>Logged by {e.createdBy}</span>}
                    </div>
                    {e.notes && (
                      <div className="flex items-start gap-1 mt-1.5 text-xs" style={{ color: textMuted }}>
                        <StickyNote className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{e.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
