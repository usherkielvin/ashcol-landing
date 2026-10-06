import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Loader2, RefreshCw, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { fetchSharedPayout, type SharedPayout, type SharedPayoutResult } from '../utils/payoutShareApi'
import {
  mapSavedPayrollEntry,
  rowTotal,
  payFactor,
  paymentStatusOf,
  paymentStatusLabel,
  installerTotal,
  deductionTotal,
  deductionValue,
  lateDeduction,
  isHeldRow,
  isActivePayRow,
  isCarryOver,
  LATE_RATE_PER_MINUTE,
  type PayrollRow,
} from '../utils/payrollDerive'
import { COLUMN_DEFS, num, peso, pesoSigned, shortDate, longDate, titleCase } from './Payouts/payoutUtils'

// Public, read-only view of ONE installer's payout table for ONE week, opened from a link payroll sends
// (/payout/<token>). No login and no portal chrome: it renders outside DashboardLayout and fetches with
// no credentials. It deliberately does not import Payouts.tsx (huge, and tied to auth) — only the pure
// helpers that already define how a payout is computed, so these numbers match the portal table.

interface Palette {
  bg: string
  card: string
  border: string
  text: string
  muted: string
  head: string
  accent: string
  red: string
  amber: string
}

const paletteFor = (isLight: boolean): Palette => ({
  bg: isLight ? '#f1f5f9' : '#060B18',
  card: isLight ? '#ffffff' : '#0A1120',
  border: isLight ? '#e2e8f0' : '#1E2D48',
  text: isLight ? '#0f172a' : '#E2E8F0',
  muted: isLight ? '#64748b' : '#7A95B8',
  head: isLight ? '#f8fafc' : '#0F1A2E',
  accent: isLight ? '#059669' : '#34D399',
  red: isLight ? '#DC2626' : '#F87171',
  amber: isLight ? '#B45309' : '#FBBF24',
})

const DEDUCTION_LINES: { key: Parameters<typeof deductionValue>[1]; label: string }[] = [
  { key: 'loan', label: 'AC Loan / CA' },
  { key: 'incompleteUpload', label: 'Incomplete Upload' },
  { key: 'losses', label: 'Losses / Material Checklist' },
  { key: 'remitPenalty', label: 'Remit' },
  { key: 'uniform', label: 'Uniform' },
  { key: 'grooming', label: 'Grooming' },
  { key: 'backjob', label: 'Backjob' },
]

// Bookkeeping prefixes in customFields — anything else is a branch-defined pay column.
// Page width: fills a laptop / desktop screen (capped on ultra-wide) with a little breathing room at each side.
const PAGE_WIDTH = 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10'

const RESERVED_PREFIXES = ['ded:', 'txt:', 'pay:', 'hold:', 'xfer:', 'manual:']

interface Col {
  key: string
  label: string
  align: 'left' | 'right'
  width: number
  /** Left offset when pinned while scrolling sideways. */
  pinnedLeft?: number
  render: (row: PayrollRow) => ReactNode
}

function useIsCompact(): boolean {
  const query = '(max-width: 639px)'
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setCompact(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return compact
}

// The link is a bearer secret and the page shows pay data: keep it out of search engines and never send it
// onward as a Referer.
function usePrivatePageMeta(title: string) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title
    const added: HTMLMetaElement[] = []
    for (const [name, content] of [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']]) {
      const meta = document.createElement('meta')
      meta.name = name
      meta.content = content
      document.head.appendChild(meta)
      added.push(meta)
    }
    // index.html ships a "robots: index, follow" tag; the later, stricter one must win, so disable the original.
    const originals = Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]')).filter(m => !added.includes(m))
    const saved = originals.map(m => m.content)
    originals.forEach(m => { m.content = 'noindex, nofollow' })
    return () => {
      document.title = previousTitle
      added.forEach(m => m.remove())
      originals.forEach((m, i) => { m.content = saved[i] })
    }
  }, [title])
}

const distinctRemarks = (rows: PayrollRow[]) => Array.from(new Set(rows.map(r => (r.remarks || '').trim()).filter(Boolean)))

const customLabel = (key: string) => titleCase(key.replace(/^custom_/i, '').replace(/_/g, ' '))

function buildColumns(rows: PayrollRow[], compact: boolean, p: Palette): Col[] {
  const cols: Col[] = []
  const customerCell = (r: PayrollRow) => (
    <>
      <span className="block truncate" title={r.customerName}>{r.customerName || '—'}</span>
      {isCarryOver(r) && <span className="block text-[10px] font-bold uppercase" style={{ color: p.amber }}>Carry-over</span>}
    </>
  )
  if (compact) {
    cols.push({
      key: 'job', label: 'Job', align: 'left', width: 88, pinnedLeft: 0,
      render: r => (
        <>
          <span className="block font-semibold">{shortDate(r.workDate) || '—'}</span>
          <span className="block text-[11px]" style={{ color: p.muted }}>{r.ticketNumber || '—'}</span>
        </>
      ),
    })
    cols.push({ key: 'customerName', label: 'Customer', align: 'left', width: 120, pinnedLeft: 88, render: customerCell })
  } else {
    cols.push({ key: 'date', label: 'Date', align: 'left', width: 70, pinnedLeft: 0, render: r => shortDate(r.workDate) || '—' })
    cols.push({ key: 'ticketNumber', label: 'Ticket', align: 'left', width: 100, pinnedLeft: 70, render: r => r.ticketNumber || '—' })
    cols.push({ key: 'customerName', label: 'Customer', align: 'left', width: 140, pinnedLeft: 170, render: customerCell })
  }

  const anyText = (pick: (r: PayrollRow) => string) => rows.some(r => pick(r).trim() !== '')
  if (anyText(r => r.brandCapacity)) cols.push({ key: 'brandCapacity', label: 'Unit', align: 'left', width: 120, render: r => r.brandCapacity || '—' })
  if (anyText(r => r.installationUpload)) cols.push({ key: 'installationUpload', label: 'Status', align: 'left', width: 110, render: r => r.installationUpload || '—' })
  if (rows.some(r => paymentStatusOf(r) !== 'PAID')) {
    cols.push({
      key: 'paymentStatus', label: 'Payment', align: 'left', width: 130,
      render: r => (paymentStatusOf(r) === 'PAID' ? 'PAID' : <span style={{ color: p.amber }}>{paymentStatusLabel(r)}</span>),
    })
  }

  // Money columns, in the same order as the portal table; a column nobody earned anything in stays hidden
  // so the phone table stays narrow.
  for (const def of COLUMN_DEFS) {
    if (!def.isMoney) continue
    const key = def.key as keyof PayrollRow
    if (!rows.some(r => num(r[key] as string) !== 0)) continue
    cols.push({
      key: def.key, label: def.label, align: 'right', width: 92,
      render: r => (num(r[key] as string) !== 0 ? peso(r[key] as string) : <span style={{ color: p.muted }}>—</span>),
    })
  }
  const customKeys = new Set<string>()
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.customFields || {})) {
      if (!RESERVED_PREFIXES.some(prefix => k.startsWith(prefix)) && num(v) !== 0) customKeys.add(k)
    }
  }
  for (const k of customKeys) {
    cols.push({
      key: k, label: customLabel(k), align: 'right', width: 100,
      render: r => (num(r.customFields?.[k]) !== 0 ? peso(r.customFields[k]) : <span style={{ color: p.muted }}>—</span>),
    })
  }

  if (anyText(r => r.totalPipeLength)) cols.push({ key: 'totalPipeLength', label: 'Pipe Length', align: 'right', width: 90, render: r => r.totalPipeLength || '—' })
  if (anyText(r => r.materialsReturn)) cols.push({ key: 'materialsReturn', label: 'Materials Return', align: 'left', width: 130, render: r => r.materialsReturn || '—' })
  if (anyText(r => r.remarks)) cols.push({ key: 'remarks', label: 'Remarks', align: 'left', width: 160, render: r => r.remarks || '—' })

  cols.push({
    key: 'total', label: 'Total', align: 'right', width: 100,
    render: r => (
      <span className="font-bold">
        ₱{peso(rowTotal(r))}
        {payFactor(r) !== 1 && <span className="block text-[10px] font-semibold" style={{ color: p.amber }}>{Math.round(payFactor(r) * 100)}% paid</span>}
      </span>
    ),
  })
  return cols
}

const stickyStyle = (left: number | undefined, bg: string, p: Palette, edge: boolean): CSSProperties =>
  left === undefined
    ? {}
    : {
        position: 'sticky', left, zIndex: 1, background: bg,
        boxShadow: edge ? `1px 0 0 ${p.border}, 6px 0 8px -6px rgba(0,0,0,0.25)` : undefined,
      }

function PayoutTable({ rows, compact, p, onSelect }: { rows: PayrollRow[]; compact: boolean; p: Palette; onSelect: (r: PayrollRow) => void }) {
  const cols = useMemo(() => buildColumns(rows, compact, p), [rows, compact, p])
  // The pinned-column shadow only means something once the table has actually scrolled sideways.
  const [scrolled, setScrolled] = useState(false)
  const lastPinned = cols.reduce((acc, c, i) => (c.pinnedLeft !== undefined ? i : acc), -1)
  const tableWidth = cols.reduce((sum, c) => sum + c.width, 0)
  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ background: p.card, borderColor: p.border }} onScroll={e => setScrolled(e.currentTarget.scrollLeft > 0)}>
      <table className="text-[13px] 2xl:text-sm border-separate border-spacing-0" style={{ minWidth: tableWidth, width: '100%', tableLayout: 'fixed', color: p.text }}>
        <colgroup>{cols.map(c => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={c.key}
                className="px-3 py-3 text-[10px] 2xl:text-[11px] font-bold uppercase tracking-normal leading-tight border-b align-bottom"
                style={{ textAlign: c.align, background: p.head, borderColor: p.border, color: p.muted, ...stickyStyle(c.pinnedLeft, p.head, p, scrolled && i === lastPinned), zIndex: c.pinnedLeft !== undefined ? 2 : undefined }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} onClick={() => onSelect(r)} className="cursor-pointer hover:brightness-[0.97]">
              {cols.map((c, i) => (
                <td
                  key={c.key}
                  className="px-3 py-3 border-b align-middle"
                  style={{ textAlign: c.align, borderColor: p.border, ...stickyStyle(c.pinnedLeft, p.card, p, scrolled && i === lastPinned) }}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Every pay line a job earned (money columns + branch-defined custom columns), zero lines left out. */
function payItems(r: PayrollRow): { label: string; amount: number }[] {
  const items: { label: string; amount: number }[] = []
  for (const def of COLUMN_DEFS) {
    if (!def.isMoney) continue
    const amount = num(r[def.key as keyof PayrollRow] as string)
    if (amount !== 0) items.push({ label: def.label, amount })
  }
  for (const [k, v] of Object.entries(r.customFields || {})) {
    if (RESERVED_PREFIXES.some(prefix => k.startsWith(prefix))) continue
    const amount = num(v)
    if (amount !== 0) items.push({ label: customLabel(k), amount })
  }
  return items
}

function Chip({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color, background: `${color}1F` }}>
      {children}
    </span>
  )
}

const isDoneStatus = (r: PayrollRow) => /^DONE\b/i.test((r.installationUpload || '').trim())

function JobCards({ rows, p, onSelect }: { rows: PayrollRow[]; p: Palette; onSelect: (r: PayrollRow) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(r => {
        const items = payItems(r)
        const unpaid = paymentStatusOf(r) !== 'PAID'
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r)}
            className="w-full text-left rounded-2xl border px-4 py-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
            style={{ background: p.card, borderColor: p.border, color: p.text }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold" style={{ color: p.muted }}>
                {shortDate(r.workDate) || '—'} · {r.ticketNumber || 'No ticket no.'}
                {isCarryOver(r) && <span style={{ color: p.amber }}> · Carry-over</span>}
              </div>
              <div className="mt-0.5 text-[15px] font-bold leading-snug break-words">{r.customerName || '—'}</div>
              {r.brandCapacity && <div className="text-[12px] mt-0.5" style={{ color: p.muted }}>{r.brandCapacity}</div>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {r.installationUpload && <Chip color={isDoneStatus(r) ? p.accent : p.amber}>{r.installationUpload}</Chip>}
                {unpaid && <Chip color={p.amber}>{paymentStatusLabel(r)}</Chip>}
                {items.length > 0 && <span className="text-[11px]" style={{ color: p.muted }}>{items.length} pay item{items.length === 1 ? '' : 's'}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-base font-extrabold tabular-nums">₱{peso(rowTotal(r))}</div>
              {payFactor(r) !== 1 && <div className="text-[10px] font-semibold" style={{ color: p.amber }}>{Math.round(payFactor(r) * 100)}% paid</div>}
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: p.muted }} />
          </button>
        )
      })}
    </div>
  )
}

function JobDetails({ row, p, onClose }: { row: PayrollRow; p: Palette; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [onClose])

  const items = payItems(row)
  const factor = payFactor(row)
  const unpaid = paymentStatusOf(row) !== 'PAID'
  const info: { label: string; value: string }[] = [
    { label: 'Unit', value: row.brandCapacity },
    { label: 'Status', value: row.installationUpload },
    { label: 'Pipe length', value: row.totalPipeLength },
    { label: 'Materials return', value: row.materialsReturn },
    { label: 'Remarks', value: row.remarks },
  ].filter(i => (i.value || '').trim() !== '')
  const line = (label: string, value: ReactNode, strong = false) => (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b last:border-b-0" style={{ borderColor: p.border }}>
      <span className="text-[13px]" style={{ color: p.muted }}>{label}</span>
      <span className={`text-[13px] tabular-nums text-right ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</span>
    </div>
  )
  const section = (title: string) => (
    <div className="mt-4 mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: p.muted }}>{title}</div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: p.card, color: p.text, border: `1px solid ${p.border}` }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold" style={{ color: p.muted }}>
              {longDate(row.workDate) || 'No date'} · {row.ticketNumber || 'No ticket no.'}
            </div>
            <h2 className="mt-0.5 text-lg font-extrabold leading-snug break-words">{row.customerName || '—'}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.installationUpload && <Chip color={isDoneStatus(row) ? p.accent : p.amber}>{row.installationUpload}</Chip>}
              {unpaid && <Chip color={p.amber}>{paymentStatusLabel(row)}</Chip>}
              {isCarryOver(row) && <Chip color={p.amber}>Carry-over</Chip>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full border cursor-pointer shrink-0" style={{ borderColor: p.border, color: p.muted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 overscroll-contain">
          {info.length > 0 && (
            <>
              {section('Job details')}
              <div className="rounded-xl border px-3.5" style={{ borderColor: p.border }}>
                {info.map(i => <div key={i.label}>{line(i.label, <span className="break-words">{i.value}</span>)}</div>)}
              </div>
            </>
          )}
          {section('Pay breakdown')}
          <div className="rounded-xl border px-3.5" style={{ borderColor: p.border }}>
            {items.length === 0
              ? <div className="py-3 text-[13px]" style={{ color: p.muted }}>No pay items on this job.</div>
              : items.map(i => <div key={i.label}>{line(i.label, `₱${peso(i.amount)}`)}</div>)}
          </div>
          {unpaid && (
            <div className="mt-3 rounded-xl px-3.5 py-2.5 text-[12px]" style={{ color: p.amber, background: `${p.amber}14`, border: `1px solid ${p.amber}55` }}>
              The customer hasn't fully paid yet, so {Math.round(factor * 100)}% of this job is paid now. The rest is released once the ticket is paid.
            </div>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-4 px-5 py-4 shrink-0 border-t" style={{ borderColor: p.border, background: p.head, paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: p.muted }}>{factor !== 1 ? `Job total (${Math.round(factor * 100)}%)` : 'Job total'}</span>
          <span className="text-2xl font-extrabold tabular-nums" style={{ color: p.accent }}>₱{peso(rowTotal(row))}</span>
        </div>
      </div>
    </div>
  )
}

function HeldList({ rows, p }: { rows: PayrollRow[]; p: Palette }) {
  return (
    <section className="rounded-2xl border p-4" style={{ background: p.card, borderColor: p.border }}>
      <h2 className="text-sm font-bold mb-1" style={{ color: p.amber }}>On hold — not counted in this week's total</h2>
      <ul className="divide-y" style={{ borderColor: p.border }}>
        {rows.map(r => (
          <li key={r.id} className="py-2.5 text-[13px]" style={{ borderColor: p.border }}>
            <div className="font-semibold">
              {shortDate(r.workDate)} · {r.ticketNumber || 'No ticket no.'} · {r.customerName || '—'}
            </div>
            <div style={{ color: p.muted }}>{r.customFields?.['hold:reason'] || 'Waiting on payroll review'}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Summary({ counted, p }: { counted: PayrollRow[]; p: Palette }) {
  const gross = installerTotal(counted)
  // Released hold tickets carried into this week: already inside `gross`, listed so the total adds up for the reader.
  const previousPayout = counted.filter(isCarryOver).reduce((sum, r) => sum + rowTotal(r), 0)
  const lateMinutes = deductionValue(counted, 'lateMinutes')
  const lines = [
    ...(lateMinutes > 0 ? [{ label: `Late (${lateMinutes} min × ₱${LATE_RATE_PER_MINUTE.toFixed(2)})`, amount: lateDeduction(counted) }] : []),
    ...DEDUCTION_LINES.map(l => ({ label: l.label, amount: deductionValue(counted, l.key) })).filter(l => l.amount > 0),
  ]
  const loanBalance = deductionValue(counted, 'loanBalance')
  const uniformBalance = deductionValue(counted, 'uniformBalance')
  const row = (label: string, value: ReactNode, color?: string) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <span style={{ color: color ?? p.muted }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: color ?? p.text }}>{value}</span>
    </div>
  )
  return (
    <section className="rounded-2xl border p-4" style={{ background: p.card, borderColor: p.border }}>
      {row('Gross payout', `₱${peso(gross)}`, p.text)}
      {previousPayout > 0 && row('Includes previous payout (released hold)', `₱${peso(previousPayout)}`)}
      {lines.length > 0 && (
        <>
          <div className="mt-2 mb-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: p.muted }}>Deductions</div>
          {lines.map(l => <div key={l.label}>{row(l.label, `− ₱${peso(l.amount)}`, p.red)}</div>)}
          {row('Total deductions', `− ₱${peso(deductionTotal(counted))}`, p.red)}
        </>
      )}
      {(loanBalance > 0 || uniformBalance > 0) && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: p.border }}>
          {loanBalance > 0 && row('Loan balance remaining', `₱${peso(loanBalance)}`)}
          {uniformBalance > 0 && row('Uniform balance remaining', `₱${peso(uniformBalance)}`)}
        </div>
      )}
    </section>
  )
}

function Notice({ icon, title, body, p, action }: { icon: ReactNode; title: string; body: string; p: Palette; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 px-6 py-16 max-w-md mx-auto" style={{ color: p.text }}>
      {icon}
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-sm" style={{ color: p.muted }}>{body}</p>
      {action}
    </div>
  )
}

export default function PayoutShare() {
  const { token = '' } = useParams<{ token: string }>()
  const { theme } = useTheme()
  const p = useMemo(() => paletteFor(theme === 'light'), [theme])
  const compact = useIsCompact()

  // The last answer stays on screen while a refresh is in flight; `loading` is derived, not stored.
  const [loaded, setLoaded] = useState<{ key: string; result: SharedPayoutResult } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${token}|${reloadKey}`
  const result = loaded?.result ?? null
  const loading = loaded?.key !== requestKey

  useEffect(() => {
    const controller = new AbortController()
    fetchSharedPayout(token, controller.signal)
      .then(r => setLoaded({ key: requestKey, result: r }))
      .catch(() => { /* aborted on unmount / token change */ })
    return () => controller.abort()
  }, [token, requestKey])
  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  const [selectedRow, setSelectedRow] = useState<PayrollRow | null>(null)

  const payout: SharedPayout | null = result?.kind === 'ok' ? result.payout : null
  usePrivatePageMeta(payout ? `${payout.installerLabel} — Payout` : 'Payout')

  const { counted, held } = useMemo(() => {
    const rows = (payout?.rows ?? []).map(mapSavedPayrollEntry)
    return { counted: rows.filter(isActivePayRow), held: rows.filter(isHeldRow) }
  }, [payout])

  const refreshButton = (
    <button
      type="button"
      onClick={reload}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer"
      style={{ borderColor: p.border, color: p.text, background: p.card }}
    >
      <RefreshCw className="w-3.5 h-3.5" /> Try again
    </button>
  )

  let body: ReactNode
  if (loading && !payout) {
    body = <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: p.muted }} /></div>
  } else if (result?.kind === 'inactive') {
    body = <Notice p={p} icon={<AlertTriangle className="w-8 h-8" style={{ color: p.amber }} />} title="This link is no longer active" body="Ask payroll for a new one." />
  } else if (result?.kind === 'rate-limited') {
    body = <Notice p={p} icon={<Clock className="w-8 h-8" style={{ color: p.amber }} />} title="Too many requests" body="Please wait a minute and try again." action={refreshButton} />
  } else if (!payout) {
    body = <Notice p={p} icon={<AlertTriangle className="w-8 h-8" style={{ color: p.red }} />} title="Couldn't load your payout" body="Check your connection and try again." action={refreshButton} />
  } else {
    const net = installerTotal(counted) - deductionTotal(counted)
    const previousPayout = counted.filter(isCarryOver).reduce((sum, r) => sum + rowTotal(r), 0)
    const complete = payout.status === 'COMPLETED'
    body = (
      <>
        <main className={`flex-1 ${PAGE_WIDTH} pt-5 pb-6 flex flex-col gap-4`}>
          <header className="flex flex-col gap-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-extrabold">{titleCase(payout.installerLabel)}</h1>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
                style={{ color: complete ? p.accent : p.amber, background: complete ? `${p.accent}1F` : `${p.amber}1F` }}
              >
                {complete ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {complete ? 'Completed' : 'Not final yet'}
              </span>
            </div>
            <p className="text-[13px]" style={{ color: p.muted }}>
              {payout.branchName && <>{payout.branchName} · </>}
              {longDate(payout.weekFrom)} – {longDate(payout.weekTo)}
            </p>
          </header>

          {!complete && (
            <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: p.amber, color: p.amber, background: `${p.amber}14` }}>
              Payroll is still reviewing this week. The amounts below may change before payout.
            </div>
          )}

          {counted.length === 0 ? (
            <div className="rounded-2xl border px-4 py-10 text-center text-sm" style={{ background: p.card, borderColor: p.border, color: p.muted }}>
              No jobs recorded for this week yet.
            </div>
          ) : (
            compact
              ? <JobCards rows={counted} p={p} onSelect={setSelectedRow} />
              : <PayoutTable rows={counted} compact={compact} p={p} onSelect={setSelectedRow} />
          )}
          {(() => {
            const generalNote = counted.find(r => r.customFields?.['installer:remarks'])?.customFields?.['installer:remarks']
              || (distinctRemarks(counted).length === 1 ? distinctRemarks(counted)[0] : '')
            if (!generalNote) return null
            return (
              <div className="rounded-2xl border px-4 py-3 text-[13px]" style={{ background: p.card, borderColor: p.border }}>
                <span className="block text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{ color: p.muted }}>Remarks from payroll</span>
                {generalNote}
              </div>
            )
          })()}
          {counted.length > 0 && <Summary counted={counted} p={p} />}
          {held.length > 0 && <HeldList rows={held} p={p} />}

          <p className="text-xs text-center leading-relaxed px-2" style={{ color: p.muted }}>
            Have a concern about this payout? Please contact payroll or your branch office.
          </p>
        </main>

        {/* Net payout stays in view while the table scrolls. */}
        <footer className="sticky bottom-0 border-t" style={{ background: p.card, borderColor: p.border, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className={`${PAGE_WIDTH} py-3 flex items-baseline justify-between gap-4`}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: p.muted }}>Net payout</span>
            <span className="flex flex-col items-end">
              <span className="text-2xl font-extrabold tabular-nums" style={{ color: net < 0 ? p.red : p.accent }}>{pesoSigned(net)}</span>
              {previousPayout > 0 && (
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: p.muted }}>incl. ₱{peso(previousPayout)} previous payout</span>
              )}
            </span>
          </div>
        </footer>
      </>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: p.bg, color: p.text }}>
      <div className="border-b" style={{ background: p.card, borderColor: p.border }}>
        <div className={`${PAGE_WIDTH} py-3 flex items-center gap-3`}>
          <img src="/ashcol-icon.png" alt="ASHCOL" className="w-9 h-9 rounded-lg object-cover" />
          <span className="text-base font-bold tracking-tight">Weekly Payout Statement</span>
        </div>
      </div>
      {body}
      {selectedRow && <JobDetails row={selectedRow} p={p} onClose={() => setSelectedRow(null)} />}
    </div>
  )
}
