import { useEffect, useMemo, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import {
  X, Plus, Loader2, Building2, User as UserIcon, CalendarDays, Pencil, Gauge, StickyNote, Receipt,
  Droplets, CircleDot, FileCheck2, Wrench, Fuel, Wallet, ListChecks, Paperclip, AlertCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { resolveImageUrl } from '../../utils/api'
import { ImageLightbox, type LightboxImage } from '../ImageLightbox'
import {
  VEHICLE_EXPENSE_TYPES,
  fetchVehicleExpenses,
  createVehicleExpense,
  uploadVehicleExpenseReceipt,
  type Vehicle,
  type VehicleExpense,
} from '../../utils/vehicleApi'
import VehiclePhoto from './VehiclePhoto'
import VehiclePlate from './VehiclePlate'
import { effectiveCodingDay, errMsg, initials, isCodingToday, vehicleTheme } from './vehicleUtils'

interface Props {
  vehicle: Vehicle
  branchName: string
  /** Can log expenses (members: own branch only). */
  canManage: boolean
  /** Shown as an Edit button in the header when provided. */
  onEdit?: () => void
  onClose: () => void
}

const peso = (v: number) => (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TYPE_META: Record<string, { icon: LucideIcon; color: string }> = {
  OIL_CHANGE: { icon: Droplets, color: '#F59E0B' },
  TIRE_CHANGE: { icon: CircleDot, color: '#64748B' },
  REGISTRATION: { icon: FileCheck2, color: '#8B5CF6' },
  REPAIR: { icon: Wrench, color: '#EF4444' },
  FUEL: { icon: Fuel, color: '#0EA5E9' },
  OTHER: { icon: Receipt, color: '#10B981' },
}
const typeMeta = (type: string) => TYPE_META[type] || TYPE_META.OTHER
const expenseTypeLabel = (type: string) => VEHICLE_EXPENSE_TYPES.find(t => t.value === type)?.label || type

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function VehicleDiaryModal({ vehicle, branchName, canManage, onEdit, onClose }: Props) {
  const { theme: mode } = useTheme()
  const theme = vehicleTheme(mode === 'light')
  const { cardBg, panelBg, border, textPrimary, textMuted, inputBg, inputBorder, accent } = theme

  const [expenses, setExpenses] = useState<VehicleExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null)

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

  // Esc closes the modal (the lightbox handles its own Esc in the capture phase first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    const byType = new Map<string, number>()
    for (const e of expenses) byType.set(e.type, (byType.get(e.type) || 0) + (Number(e.amount) || 0))
    const breakdown = [...byType.entries()].sort((a, b) => b[1] - a[1])
    const withOdo = expenses.filter(e => e.odometer != null)
    const lastOdometer = withOdo.length ? Math.max(...withOdo.map(e => e.odometer as number)) : null
    const lastDate = expenses.reduce<string | null>((acc, e) => (!acc || e.expenseDate > acc ? e.expenseDate : acc), null)
    return { total, breakdown, lastOdometer, lastDate }
  }, [expenses])

  const visibleExpenses = typeFilter ? expenses.filter(e => e.type === typeFilter) : expenses

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

  const photo = vehicle.photoUrl ? resolveImageUrl(vehicle.photoUrl) : null
  const codingNow = isCodingToday(vehicle)
  const codingDay = effectiveCodingDay(vehicle)
  const hasCoding = codingDay !== 'None'

  const field = 'rounded-xl px-3 py-2 text-sm border outline-none transition-colors focus:border-emerald-500'
  const fieldStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }
  const label = 'text-[10px] font-bold uppercase tracking-wider'

  const specRow = (Icon: LucideIcon, key: string, value: ReactNode) => (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: border }}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: inputBg, color: textMuted }}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className={label} style={{ color: textMuted }}>{key}</div>
        <div className="text-sm font-semibold mt-0.5 break-words" style={{ color: textPrimary }}>{value}</div>
      </div>
    </div>
  )

  const statTile = (Icon: LucideIcon, key: string, value: string, color: string) => (
    <div className="rounded-2xl border p-3.5" style={{ borderColor: border, backgroundColor: cardBg }}>
      <div className="flex items-center gap-2 mb-1.5" style={{ color }}>
        <Icon className="w-4 h-4" />
        <span className={label} style={{ color: textMuted }}>{key}</span>
      </div>
      <div className="text-lg font-black tabular-nums leading-tight truncate" style={{ color: textPrimary }}>{value}</div>
    </div>
  )

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md" onClick={onClose}>
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={i => setLightbox(l => (l ? { ...l, index: i } : l))}
          onClose={() => setLightbox(null)}
          zIndex={21000}
        />
      )}
      <div
        className="w-[96vw] max-w-[1120px] h-[92vh] max-h-[860px] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: identity ── */}
        <aside className="md:w-[380px] md:shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r max-h-[46%] md:max-h-none" style={{ borderColor: border, backgroundColor: panelBg }}>
          <div className="relative">
            <VehiclePhoto src={photo} alt={vehicle.name} theme={theme} className="aspect-video w-full" />
            {hasCoding && (
              <span
                className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white shadow-md"
                style={{ backgroundColor: codingNow ? '#EF4444' : '#F59E0B' }}
              >
                {codingNow && <AlertCircle className="w-3 h-3" />}
                {codingNow ? 'Coding today' : `Coding · ${codingDay.slice(0, 3)}`}
              </span>
            )}
          </div>

          <div className="p-5">
            <h2 className="text-xl font-black leading-tight" style={{ color: textPrimary }}>{vehicle.name}</h2>
            {vehicle.brandModel && <p className="text-sm mt-0.5" style={{ color: textMuted }}>{vehicle.brandModel}</p>}
            <div className="mt-3">
              <VehiclePlate plate={vehicle.plateNumber} size="lg" />
            </div>

            <div className="mt-4">
              {specRow(Building2, 'Branch', branchName || 'Unassigned')}
              {specRow(
                UserIcon,
                'Driver',
                vehicle.driverName ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ backgroundColor: '#0EA5E9' }}>{initials(vehicle.driverName)}</span>
                    {vehicle.driverName}
                  </span>
                ) : 'No driver assigned',
              )}
              {specRow(CalendarDays, 'Coding day', hasCoding ? `${codingDay}${codingNow ? ' (today)' : ''}` : 'None')}
            </div>
          </div>
        </aside>

        {/* ── Right: expense diary ── */}
        <section className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="px-6 py-4 shrink-0 border-b flex items-center gap-3" style={{ borderColor: border }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black" style={{ color: textPrimary }}>Expense diary</div>
              <div className="text-xs" style={{ color: textMuted }}>Maintenance, fuel and registration logged for this vehicle</div>
            </div>
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-bold border transition-colors hover:bg-slate-500/10"
                style={{ borderColor: border, color: textPrimary }}
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-500/10 shrink-0" style={{ color: textMuted }} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {statTile(Wallet, 'Total spent', `₱${peso(stats.total)}`, accent)}
              {statTile(ListChecks, 'Entries', String(expenses.length), '#0EA5E9')}
              {statTile(Gauge, 'Last odometer', stats.lastOdometer != null ? `${stats.lastOdometer.toLocaleString()} km` : '—', '#F59E0B')}
              {statTile(CalendarDays, 'Last entry', formatDate(stats.lastDate), '#8B5CF6')}
            </div>

            {/* Spend breakdown */}
            {stats.breakdown.length > 0 && (
              <div className="rounded-2xl border p-4" style={{ borderColor: border, backgroundColor: cardBg }}>
                <div className="flex h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: inputBg }}>
                  {stats.breakdown.map(([t, amt]) => (
                    <div key={t} title={`${expenseTypeLabel(t)} · ₱${peso(amt)}`} style={{ width: `${(amt / (stats.total || 1)) * 100}%`, backgroundColor: typeMeta(t).color }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                  {stats.breakdown.map(([t, amt]) => (
                    <span key={t} className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: textMuted }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: typeMeta(t).color }} />
                      {expenseTypeLabel(t)} <span style={{ color: textPrimary }}>₱{peso(amt)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5 flex-1">
                {[{ value: '', label: 'All' }, ...VEHICLE_EXPENSE_TYPES.filter(t => expenses.some(e => e.type === t.value))].map(t => {
                  const on = typeFilter === t.value
                  return (
                    <button
                      key={t.value || 'all'}
                      onClick={() => setTypeFilter(t.value)}
                      className="px-3 h-8 rounded-full text-[11px] font-bold border transition-colors"
                      style={on
                        ? { backgroundColor: accent, borderColor: accent, color: '#fff' }
                        : { backgroundColor: 'transparent', borderColor: border, color: textMuted }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
              {canManage && (
                <button
                  onClick={() => setShowForm(v => !v)}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm"
                  style={{ background: showForm ? textMuted : 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
                >
                  {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {showForm ? 'CANCEL' : 'ADD EXPENSE'}
                </button>
              )}
            </div>

            {/* Add expense form */}
            {showForm && (
              <div className="rounded-2xl border p-4 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderColor: border, backgroundColor: panelBg }}>
                <div className="flex flex-col gap-1">
                  <label className={label} style={{ color: textMuted }}>Type</label>
                  <select value={type} onChange={e => setType(e.target.value)} className={field} style={fieldStyle}>
                    {VEHICLE_EXPENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={label} style={{ color: textMuted }}>Amount (₱)</label>
                  <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={field} style={fieldStyle} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={label} style={{ color: textMuted }}>Date</label>
                  <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className={field} style={fieldStyle} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={label} style={{ color: textMuted }}>Odometer (km, optional)</label>
                  <input type="number" min="0" value={odometer} onChange={e => setOdometer(e.target.value)} className={field} style={fieldStyle} />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className={label} style={{ color: textMuted }}>Notes (optional)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${field} resize-none`} style={fieldStyle} />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className={label} style={{ color: textMuted }}>Receipt photo (optional)</label>
                  <label
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed cursor-pointer text-xs font-semibold transition-colors hover:bg-slate-500/5"
                    style={{ borderColor: inputBorder, color: receiptFile ? textPrimary : textMuted }}
                  >
                    <Paperclip className="w-4 h-4 shrink-0" />
                    <span className="truncate">{receiptFile ? receiptFile.name : 'Attach a receipt image'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
                {error && <div className="sm:col-span-2 text-xs font-medium text-red-500">{error}</div>}
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: accent }}
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    SAVE ENTRY
                  </button>
                </div>
              </div>
            )}

            {!showForm && error && <div className="text-xs font-medium text-red-500">{error}</div>}

            {/* Diary list */}
            {loading ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: textMuted }} />
              </div>
            ) : visibleExpenses.length === 0 ? (
              <div className="text-center py-14 rounded-2xl border border-dashed" style={{ borderColor: border }}>
                <Wrench className="w-8 h-8 mx-auto mb-2" style={{ color: textMuted }} />
                <p className="text-sm font-semibold" style={{ color: textMuted }}>{expenses.length ? 'No entries of this type' : 'No expenses logged yet'}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {visibleExpenses.map(e => {
                  const meta = typeMeta(e.type)
                  const Icon = meta.icon
                  const receipt = e.receiptPhotoUrl ? resolveImageUrl(e.receiptPhotoUrl) : null
                  return (
                    <div key={e.id} className="flex items-start gap-3.5 p-3.5 rounded-2xl border" style={{ borderColor: border, backgroundColor: cardBg }}>
                      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}1F`, color: meta.color }}>
                        <Icon className="w-5 h-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold" style={{ color: textPrimary }}>{expenseTypeLabel(e.type)}</span>
                          <span className="text-sm font-black tabular-nums" style={{ color: accent }}>₱{peso(Number(e.amount))}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs" style={{ color: textMuted }}>
                          <span>{formatDate(e.expenseDate)}</span>
                          {e.odometer != null && <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> {e.odometer.toLocaleString()} km</span>}
                          {e.createdBy && <span>Logged by {e.createdBy}</span>}
                        </div>
                        {e.notes && (
                          <div className="flex items-start gap-1 mt-1.5 text-xs" style={{ color: textMuted }}>
                            <StickyNote className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{e.notes}</span>
                          </div>
                        )}
                      </div>
                      {receipt && (
                        <button
                          onClick={() => setLightbox({ images: [{ src: receipt, alt: 'Receipt', caption: `${expenseTypeLabel(e.type)} · ${formatDate(e.expenseDate)}` }], index: 0 })}
                          className="shrink-0 rounded-xl overflow-hidden border cursor-zoom-in"
                          style={{ borderColor: border }}
                          title="View receipt"
                        >
                          <img src={receipt} alt="Receipt" className="w-16 h-16 object-cover" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  )
}
