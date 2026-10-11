
import { useTheme } from '../contexts/ThemeContext'

interface UnitSummaryGridProps {
  stats: {
    totalUnitsScheduled?: number | null
    totalRescheduled?: number | null
    totalUnitsInstalled?: number | null
    totalUnitsInstalledServiced?: number | null
    totalUnitsServiced?: number | null
    totalUnitsCancelled?: number | null
    totalCancelled?: number | null
    totalUnitsFreeInstall?: number | null
    totalUnitsSurveyOnly?: number | null
  }
}

export function UnitSummaryGrid({ stats }: UnitSummaryGridProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'

  const items = [
    { label: 'Scheduled', value: String(stats.totalUnitsScheduled || 0) },
    { label: 'Rescheduled', value: String(stats.totalRescheduled || 0) },
    { label: 'Installed', value: String(stats.totalUnitsInstalled ?? stats.totalUnitsInstalledServiced ?? 0) },
    { label: 'Serviced', value: String(stats.totalUnitsServiced || 0) },
    { label: 'Cancelled', value: String(stats.totalUnitsCancelled ?? stats.totalCancelled ?? 0) },
    { label: 'Free Install', value: String(stats.totalUnitsFreeInstall || 0) },
    { label: 'Survey Only', value: String(stats.totalUnitsSurveyOnly || 0) },
  ]

  return (
    <div className="px-6 py-5 flex flex-col gap-3" style={{ borderBottom: `1px solid ${border}` }}>
      <div className="flex items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: border }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>
          Unit Summary
        </span>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg px-3 py-2.5 flex flex-col justify-between"
            style={{
              border: `1px solid ${border}`,
              backgroundColor: isLight ? '#f8fafc' : '#0d1520'
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
              {item.label}
            </div>
            <div className="mt-1 text-sm font-normal tabular-nums" style={{ color: textPrimary }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
