import React from 'react'
import {
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiFilePlus,
  FiFileText,
  FiUsers,
} from 'react-icons/fi'
import { PiMoney } from 'react-icons/pi'

// Feather glyphs (react-icons/fi) — the same icon set the ASHCOL mobile app
// pulls from @expo/vector-icons, so the portal and app share one clean look.
type QuickIconProps = { className?: string; style?: React.CSSProperties }

export const QuickTicketIcon = ({ className, style }: QuickIconProps) => (
  <FiClipboard className={className} style={style} strokeWidth={2} />
)

export const QuickScheduleIcon = ({ className, style }: QuickIconProps) => (
  <FiCalendar className={className} style={style} strokeWidth={2} />
)

export const QuickDailyTxIcon = ({ className, style }: QuickIconProps) => (
  <FiCheckSquare className={className} style={style} strokeWidth={2} />
)

export const QuickExpensesIcon = ({ className, style }: QuickIconProps) => (
  <FiFileText className={className} style={style} strokeWidth={2} />
)

export const QuickPesoPayoutIcon = ({ className, style }: QuickIconProps) => (
  <PiMoney className={className} style={style} />
)

export const QuickLineupIcon = ({ className, style }: QuickIconProps) => (
  <FiUsers className={className} style={style} strokeWidth={2} />
)

export const QuickRequestFormsIcon = ({ className, style }: QuickIconProps) => (
  <FiFilePlus className={className} style={style} strokeWidth={2} />
)
