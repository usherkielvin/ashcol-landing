import { useEffect, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import {
  X, Building2, User as UserIcon, CalendarDays, Pencil, Gauge,
  AlertCircle, ClipboardList, Link2, FileText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { resolveImageUrl } from '../../utils/api'
import type { Vehicle } from '../../utils/vehicleApi'
import VehiclePhoto from './VehiclePhoto'
import VehiclePlate from './VehiclePlate'
import { effectiveCodingDay, initials, isCodingToday, vehicleTheme } from './vehicleUtils'

interface Props {
  vehicle: Vehicle
  branchName: string
  /** Shown as an Edit button in the header when provided. */
  onEdit?: () => void
  onClose: () => void
}

export default function VehicleDiaryModal({ vehicle, branchName, onEdit, onClose }: Props) {
  const { theme: mode } = useTheme()
  const theme = vehicleTheme(mode === 'light')
  const { cardBg, panelBg, border, textPrimary, textMuted, inputBg, accent } = theme

  // Esc closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const photo = vehicle.photoUrl ? resolveImageUrl(vehicle.photoUrl) : null
  const codingNow = isCodingToday(vehicle)
  const codingDay = effectiveCodingDay(vehicle)
  const hasCoding = codingDay !== 'None'

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

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-[96vw] max-w-[1020px] max-h-[90vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: identity ── */}
        <aside className="md:w-[360px] md:shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r" style={{ borderColor: border, backgroundColor: panelBg }}>
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
              {specRow(Gauge, 'Odometer', vehicle.odometer != null ? `${vehicle.odometer.toLocaleString()} km` : 'Not recorded')}
              {specRow(CalendarDays, 'Coding day', hasCoding ? `${codingDay}${codingNow ? ' (today)' : ''}` : 'None')}
            </div>
          </div>
        </aside>

        {/* ── Right: DTR linked expenses & receipts view ── */}
        <section className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="px-6 py-4 shrink-0 border-b flex items-center justify-between gap-3" style={{ borderColor: border }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black" style={{ color: textPrimary }}>Vehicle Receipts & Expenses</div>
              <div className="text-xs" style={{ color: textMuted }}>Fetched and linked from DTR Form submissions</div>
            </div>

            <div className="flex items-center gap-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-bold border transition-colors hover:bg-slate-500/10"
                  style={{ borderColor: border, color: textPrimary }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-500/10 shrink-0" style={{ color: textMuted }} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
            {/* Notice banner */}
            <div
              className="rounded-2xl border p-4.5 flex items-start gap-3.5 relative overflow-hidden"
              style={{
                borderColor: 'rgba(16, 185, 129, 0.3)',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/15 text-emerald-500">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black" style={{ color: textPrimary }}>DTR Form Synchronization</h4>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-600 text-white leading-none">
                    Linked to DTR
                  </span>
                </div>
                <p className="text-xs font-medium mt-1.5 leading-relaxed" style={{ color: textMuted }}>
                  <strong className="text-emerald-500 font-bold">No manual addition needed here.</strong> All expenses (gasoline, maintenance, oil change, tolls, and repairs) and receipt photos are logged through the <strong className="text-emerald-400 font-bold">DTR Form</strong> where they are assigned directly to this vehicle.
                </p>
              </div>
            </div>

            {/* Feature overview cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border p-4 flex flex-col gap-2" style={{ borderColor: border, backgroundColor: cardBg }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold" style={{ color: textPrimary }}>Logged via DTR Form</div>
                <p className="text-[11px] leading-snug" style={{ color: textMuted }}>
                  Technicians and drivers submit vehicle receipts and expenses directly during daily DTR filing.
                </p>
              </div>

              <div className="rounded-2xl border p-4 flex flex-col gap-2" style={{ borderColor: border, backgroundColor: cardBg }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-500/10 text-sky-500">
                  <Link2 className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold" style={{ color: textPrimary }}>Auto-Assigned to Vehicle</div>
                <p className="text-[11px] leading-snug" style={{ color: textMuted }}>
                  Expenses tagged with this vehicle's plate number are automatically linked and aggregated here.
                </p>
              </div>
            </div>

            {/* Empty state / placeholder */}
            <div className="text-center py-12 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 mt-auto" style={{ borderColor: border, backgroundColor: panelBg }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: accent }}>
                <FileText className="w-6 h-6 opacity-60" />
              </div>
              <p className="text-sm font-bold mt-1" style={{ color: textPrimary }}>No DTR expenses or receipts linked yet</p>
              <p className="text-xs max-w-sm" style={{ color: textMuted }}>
                When receipts or expenses are assigned to this vehicle in DTR Form submissions, they will automatically appear here.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  )
}
