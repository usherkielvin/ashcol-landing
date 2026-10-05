import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { ACTION_BUTTON_BASE, actionColors, type ActionTone } from './actionButtonStyles'

// One look for every action in an installer table's header (Sync, Save, Copy link, tools…): 36px tall,
// 8px corners, 16px icon, label that never wraps. Labelled buttons collapse to a square icon button below
// `labelFrom`, so the row never crowds the installer's name.

/** Tailwind needs the full class names present in source, so the breakpoints are spelled out here. */
const LABEL_FROM = {
  md: { box: 'w-9 md:w-auto md:px-3', label: 'hidden md:inline' },
  lg: { box: 'w-9 lg:w-auto lg:px-3', label: 'hidden lg:inline' },
  xl: { box: 'w-9 xl:w-auto xl:px-3', label: 'hidden xl:inline' },
  '2xl': { box: 'w-9 2xl:w-auto 2xl:px-3', label: 'hidden 2xl:inline' },
  never: { box: 'w-9', label: 'hidden' },
} as const

interface Props {
  Icon: LucideIcon
  label: string
  /** Tooltip; defaults to the label. Also the accessible name when the label is hidden. */
  title?: string
  onClick: () => void
  disabled?: boolean
  tone?: ActionTone
  /** Spin the icon (syncing / saving). */
  spin?: boolean
  /** Smallest breakpoint at which the text label shows next to the icon; below it, icon only. */
  labelFrom?: keyof typeof LABEL_FROM
  /** Hide the whole button on phones (secondary tools). */
  hideBelowMd?: boolean
  style?: CSSProperties
}

export default function TableActionButton({
  Icon, label, title, onClick, disabled, tone = 'neutral', spin, labelFrom = 'lg', hideBelowMd, style,
}: Props) {
  const { theme } = useTheme()
  const sizing = LABEL_FROM[labelFrom]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={`${ACTION_BUTTON_BASE} rounded-lg ${sizing.box} ${hideBelowMd ? 'hidden md:inline-flex' : ''}`}
      style={{ ...actionColors(theme === 'light', tone), ...style }}
    >
      <Icon className={`w-4 h-4 shrink-0 ${spin ? 'animate-spin' : ''}`} />
      <span className={sizing.label}>{label}</span>
    </button>
  )
}
