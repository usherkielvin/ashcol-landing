import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Radio, CalendarDays, Archive, User } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { isPortalAdmin } from '../utils/api'

type Section = {
  label: string
  path: string
  icon: typeof Radio
  /** If set, only these roles see the link (plus portal admin rules). */
  roles?: string[]
}

const SECTIONS: Section[] = [
  { label: 'Relays', path: '/relays', icon: Radio, roles: ['admin', 'management', 'manager'] },
  { label: 'My tickets', path: '/my-tickets', icon: User, roles: ['manager', 'staff', 'employee', 'oic'] },
  { label: 'Schedules', path: '/schedules', icon: CalendarDays },
  { label: 'Archives', path: '/service-report', icon: Archive, roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
]

function pathMatches(sectionPath: string, current: string) {
  if (sectionPath === '/schedules') {
    return current === '/schedules' || current === '/tickets'
  }
  return current === sectionPath || current.startsWith(`${sectionPath}/`)
}

export default function TicketSectionNav() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const location = useLocation()
  const isLight = theme === 'light'
  const role = (user?.role || '').toLowerCase()

  const border = isLight ? '#94a3b8' : '#3d4f66'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const green = '#16A34A'
  const trackBg = isLight ? '#f1f5f9' : '#0d1626'

  const visible = SECTIONS.filter((s) => {
    if (!s.roles) return true
    if (isPortalAdmin(role)) return s.roles.includes(role) || s.roles.includes('admin') || s.roles.includes('management')
    return s.roles.includes(role)
  })

  if (visible.length <= 1) return null

  return (
    <nav
      className="flex items-center gap-0.5 p-0.5 rounded-lg border shrink-0"
      style={{ backgroundColor: trackBg, borderColor: border }}
      aria-label="Tickets sections"
    >
      {visible.map((section) => {
        const Icon = section.icon
        const active = pathMatches(section.path, location.pathname)
        return (
          <Link
            key={section.path}
            to={section.path}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap"
            style={{
              backgroundColor: active ? (isLight ? '#ffffff' : '#0A1120') : 'transparent',
              color: active ? green : textMuted,
              boxShadow: active ? (isLight ? '0 1px 2px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.35)') : undefined,
            }}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Segmented pill tabs (Relays views, Registration pending/registered, etc.) */
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
