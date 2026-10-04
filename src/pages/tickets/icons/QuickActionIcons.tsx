import React from 'react'

export const QuickTicketIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="m9 12 2 2 4-4" strokeWidth="2.2" />
  </svg>
)

export const QuickScheduleIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <circle cx="16" cy="16" r="3" />
    <path d="M16 14.5v1.5l1 1" />
  </svg>
)

export const QuickDailyTxIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
    <path d="m13 13 2 2 4-4" strokeWidth="2" />
  </svg>
)

export const QuickExpensesIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <path d="M8 7h8" />
    <path d="M8 11h8" />
    <path d="M8 15h5" />
  </svg>
)

// Philippine Peso (₱) Banknote icon for installer and technician payouts
export const QuickPesoPayoutIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="5" rx="2.5" />
    <circle cx="12" cy="12" r="3.8" strokeWidth="1.5" />
    <path d="M10.8 9.5h2a1.25 1.25 0 0 1 0 2.5h-2v2.5" strokeWidth="1.8" />
    <path d="M9.8 10.3h4.4" strokeWidth="1.4" />
    <path d="M9.8 11.6h4.4" strokeWidth="1.4" />
  </svg>
)

// Field technician crew lineup & dispatch (Hard hat installer roster)
export const QuickLineupIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 18a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2H2v-2Z" />
    <path d="M12 4a5 5 0 0 0-5 5v2h10V9a5 5 0 0 0-5-5Z" />
    <path d="M4 11h16" />
    <path d="M12 4V2" />
  </svg>
)

export const QuickRequestFormsIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
    <path d="m14.5 17.5 1.5-1.5 2.5 2.5" strokeWidth="1.8" />
  </svg>
)
