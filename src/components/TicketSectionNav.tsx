import type { ReactNode } from 'react'
import { useTheme } from '../contexts/ThemeContext'

export default function TicketSectionNav() {
  return null
}

export function FilterPills<T extends string>({
  items,
  value,
  onChange,
  className = '',
}: {
  items: Array<{ id: T; label: string; count?: number; icon?: ReactNode }>
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const border = isLight ? '#94a3b8' : '#3d4f66'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const green = '#16A34A'
  const trackBg = isLight ? '#f8fafc' : '#0F1A2E'

  return (
    <div
      className={`flex items-center gap-0.5 p-0.5 rounded-lg border flex-wrap ${className}`}
      style={{ backgroundColor: trackBg, borderColor: border }}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap"
            style={{
              backgroundColor: active ? (isLight ? '#dcfce7' : 'rgba(22,163,74,0.18)') : 'transparent',
              color: active ? green : textMuted,
              border: active ? `1px solid ${isLight ? '#86efac' : 'rgba(22,163,74,0.35)'}` : '1px solid transparent',
            }}
          >
            {item.icon}
            {item.label}
            {item.count != null && (
              <span
                className="min-w-[1.1rem] px-1 py-px rounded-full text-[9px] font-bold leading-none text-center"
                style={{
                  backgroundColor: active ? (isLight ? '#bbf7d0' : 'rgba(22,163,74,0.25)') : (isLight ? '#e2e8f0' : '#1e293b'),
                  color: active ? green : textMuted,
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
