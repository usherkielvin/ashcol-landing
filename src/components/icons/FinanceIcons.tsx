import type { CSSProperties } from 'react'

export interface FinanceIconProps {
  size?: number
  className?: string
  style?: CSSProperties
}

const base = (size: number | undefined, className: string | undefined, style: CSSProperties | undefined) => ({
  width: size ?? 16,
  height: size ?? 16,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  style,
})

/** Daily Transactions — an ascending bar report of the day's running ledger. */
export function DailyTransactionsIcon({ size, className, style }: FinanceIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3 20h18" />
      <rect x="4.5" y="13.5" width="3.2" height="6.5" rx="0.8" />
      <rect x="10.4" y="9.5" width="3.2" height="10.5" rx="0.8" />
      <rect x="16.3" y="5" width="3.2" height="15" rx="0.8" />
      <path d="M5 12.2 10.5 8l5.4-3.6" />
      <path d="M13 4.4h3v3" />
    </svg>
  )
}

/** Expenses — an itemized receipt totaling in pesos. */
export function ExpensesIcon({ size, className, style }: FinanceIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M5 3.5h14v16.7l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2Z" />
      <path d="M7.8 8h8.4" />
      <path d="M7.8 11h8.4" />
      <g strokeWidth={1.6}>
        <path d="M9.6 14.2v3.6" />
        <path d="M9.6 14.2h1.5a1.35 1.35 0 0 1 0 2.7H9.6" />
        <path d="M8.5 15.75h2.9" />
      </g>
    </svg>
  )
}

/** Collections — coins gathered into a tray, the day's cash-in. */
export function CollectionsIcon({ size, className, style }: FinanceIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 12 6 17.5h12L20.5 12" />
      <path d="M3.5 12h17" />
      <path d="M3.5 12 6.5 5h11l3 7" />
      <circle cx="12" cy="9.1" r="2.6" />
      <g strokeWidth={1.4}>
        <path d="M12 7.9v2.4" />
        <path d="M12 7.9h0.85a0.85 0.85 0 0 1 0 1.7H12" />
        <path d="M11.45 8.95h1.6" />
      </g>
    </svg>
  )
}

/** Commissions — a percentage payout tag, the cut earned on a sale. */
export function CommissionsIcon({ size, className, style }: FinanceIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M11 3.6h4.6L20.4 8.3v4.7L12.4 21 3.6 12.2 11 3.6Z" />
      <circle cx="16" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="14" r="1.4" />
      <circle cx="14.8" cy="14" r="1.4" />
      <path d="M9.6 14.4 14.4 9.6" />
    </svg>
  )
}

/** Cash Advance — a peso banknote released ahead of schedule. */
export function CashAdvanceIcon({ size, className, style }: FinanceIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="2.5" y="6.5" width="14" height="10" rx="1.8" />
      <circle cx="9.5" cy="11.5" r="2.3" />
      <g strokeWidth={1.5}>
        <path d="M9.5 10.35v2.3" />
        <path d="M9.5 10.35h0.75a0.75 0.75 0 0 1 0 1.5H9.5" />
        <path d="M9 11.35h1.5" />
      </g>
      <path d="M4.6 8.6v5.8" />
      <path d="M14.4 8.6v5.8" />
      <path d="M18.5 9.5 21 11.5l-2.5 2" />
    </svg>
  )
}

/** Payouts — a wallet releasing a peso banknote to installers. */
export function PayoutsIcon({ size, className, style }: FinanceIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2Z" />
      <path d="M3.5 11.5h11.5a1.6 1.6 0 0 1 1.6 1.6v1.3a1.6 1.6 0 0 1-1.6 1.6H3.5" />
      <circle cx="15.6" cy="14" r="0.95" fill="currentColor" stroke="none" />
      <g strokeWidth={1.5}>
        <path d="M9.3 7.2v3.4" />
        <path d="M9.3 7.2h1.1a1 1 0 0 1 0 2H9.3" />
        <path d="M8.7 8.55h2.1" />
      </g>
    </svg>
  )
}
