import { memo } from 'react'
import { Building2, Pencil, AlertCircle } from 'lucide-react'
import { resolveImageUrl } from '../../utils/api'
import type { Vehicle } from '../../utils/vehicleApi'
import VehiclePhoto from './VehiclePhoto'
import VehiclePlate from './VehiclePlate'
import { effectiveCodingDay, initials, isCodingToday, type VehicleTheme } from './vehicleUtils'

interface Props {
  vehicle: Vehicle
  branchName: string
  theme: VehicleTheme
  canEdit: boolean
  onOpen: (v: Vehicle) => void
  onEdit: (v: Vehicle) => void
}

const actionBtn =
  'w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border border-white/25 text-white bg-black/45 hover:bg-black/70 transition-colors'

/** Module-level on purpose: an inline card component would remount every card on each page render. */
function VehicleCard({ vehicle: v, branchName, theme, canEdit, onOpen, onEdit }: Props) {
  const codingNow = isCodingToday(v)
  const codingDay = effectiveCodingDay(v)
  const hasCoding = codingDay !== 'None'
  const photo = v.photoUrl ? resolveImageUrl(v.photoUrl) : null

  return (
    <article
      onClick={() => onOpen(v)}
      className="group h-full flex flex-col rounded-2xl overflow-hidden border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
    >
      {/* Photo — same rectangle on every card */}
      <div className="relative">
        <VehiclePhoto src={photo} alt={v.name} theme={theme} className="aspect-video w-full" />

        {hasCoding && (
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white shadow-md"
            style={{ backgroundColor: codingNow ? '#EF4444' : '#F59E0B' }}
          >
            {codingNow && <AlertCircle className="w-3 h-3" />}
            {codingNow ? 'Coding today' : `Coding · ${codingDay.slice(0, 3)}`}
          </span>
        )}

        {canEdit && (
          <div
            className="absolute top-2 right-2 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"
            onClick={e => e.stopPropagation()}
          >
            <button className={actionBtn} title="Edit vehicle" aria-label="Edit vehicle" onClick={() => onEdit(v)}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Body — fixed rows so cards keep an identical height */}
      <div className="flex flex-col gap-2 p-3 flex-1">
        <div className="min-w-0">
          <h3 className="text-sm font-black leading-tight truncate" style={{ color: theme.textPrimary }} title={v.name}>{v.name}</h3>
          <p className="text-xs mt-0.5 truncate min-h-[1rem]" style={{ color: theme.textMuted }} title={v.brandModel || ''}>
            {v.brandModel || '—'}
          </p>
        </div>

        <div className="self-start">
          <VehiclePlate plate={v.plateNumber} />
        </div>

        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t" style={{ borderColor: theme.border }}>
          <span className="flex items-center gap-1.5 min-w-0 text-[11px] font-semibold" style={{ color: theme.textMuted }} title={branchName}>
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{branchName.replace(/^ashcol\s+/i, '') || 'Unassigned'}</span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold" style={{ color: theme.textPrimary }} title={v.driverName || 'No driver'}>
            <span
              className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white"
              style={{ backgroundColor: v.driverName ? '#0EA5E9' : theme.textMuted, opacity: v.driverName ? 1 : 0.5 }}
            >
              {v.driverName ? initials(v.driverName) : '?'}
            </span>
            <span className="truncate max-w-[72px]">{v.driverName || 'No driver'}</span>
          </span>
        </div>
      </div>
    </article>
  )
}

export default memo(VehicleCard)
