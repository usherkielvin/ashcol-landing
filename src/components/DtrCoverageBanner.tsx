import { useState } from 'react'
import {
  DAY_DECLARATION_LABEL,
  declareDay,
  formatDayLabel,
  formatWindowLabel,
  removeDayDeclaration,
  type CoverageGap,
  type DayDeclarationType,
  type DtrCoverage,
} from '../utils/dtrCoverage'

interface Props {
  coverage: DtrCoverage | null
  branchId: string
  auditLine: string | null
  /** Viewing only: show the coverage, hide the buttons that change it. */
  readOnly: boolean
  /** A declaration was saved or removed — re-read the coverage. */
  onChanged: () => void
  /** "Missed" — jump to that date's DTR so it can be filed first. */
  onFileDate: (date: string) => void
}

const btn = 'rounded-md px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50'

function GapRow({ gap, props }: { gap: CoverageGap; props: Props }) {
  const [busy, setBusy] = useState(false)
  const [holidayOpen, setHolidayOpen] = useState(false)
  const [holidayName, setHolidayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      props.onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const declare = (type: DayDeclarationType, reason: string) =>
    run(() => declareDay({ branchId: props.branchId, auditLine: props.auditLine, date: gap.date, type, reason }))

  const decl = gap.declaration
  if (decl) {
    return (
      <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-bold">{formatDayLabel(gap.date)}</span>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-100">
          {DAY_DECLARATION_LABEL[decl.type]}
        </span>
        {decl.reason && <span className="opacity-80">{decl.reason}</span>}
        {decl.declaredBy && <span className="opacity-60">· declared by {decl.declaredBy}</span>}
        {!props.readOnly && (
          <button type="button" disabled={busy} onClick={() => run(() => removeDayDeclaration(decl.id))}
            className="font-bold underline disabled:opacity-50">Undo</button>
        )}
        {error && <span className="font-semibold text-red-600 dark:text-red-400">{error}</span>}
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span><span className="font-bold">No DTR on {formatDayLabel(gap.date)}.</span> What happened that day?</span>
        {!props.readOnly && (
          <>
            <button type="button" disabled={busy} onClick={() => declare('CLOSED', 'Branch closed')}
              className={`${btn} bg-amber-600 text-white hover:bg-amber-700`}>Closed</button>
            <button type="button" disabled={busy} onClick={() => setHolidayOpen(v => !v)}
              className={`${btn} bg-amber-600 text-white hover:bg-amber-700`}>Holiday</button>
            <button type="button" disabled={busy} onClick={() => declare('NO_OPERATIONS', 'No operations')}
              className={`${btn} bg-amber-600 text-white hover:bg-amber-700`}>No operations</button>
            <button type="button" disabled={busy} onClick={() => props.onFileDate(gap.date)}
              className={`${btn} border border-amber-600 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-500/20`}
              title="The branch was open and the DTR was never filed — file it now so its transactions are not lost">
              Missed — file it now
            </button>
          </>
        )}
      </div>
      {holidayOpen && !props.readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={holidayName}
            onChange={e => setHolidayName(e.target.value)}
            maxLength={120}
            placeholder="Holiday name (optional)"
            className="w-56 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-amber-500/40 dark:bg-slate-900 dark:text-slate-100"
          />
          <button type="button" disabled={busy} onClick={() => declare('HOLIDAY', holidayName.trim() || 'Holiday')}
            className={`${btn} bg-amber-600 text-white hover:bg-amber-700`}>Save holiday</button>
        </div>
      )}
      {error && <span className="font-semibold text-red-600 dark:text-red-400">{error}</span>}
    </li>
  )
}

/**
 * Explains which schedule days this DTR covers when the previous DTR is more than a day back,
 * and asks why each in-between day has no DTR (closed, holiday, no operations) or sends the user to file it.
 */
export function DtrCoverageBanner(props: Props) {
  const { coverage } = props
  if (!coverage) return null
  const multiDay = coverage.scheduleDates.length > 1
  if (!multiDay && coverage.gapDates.length === 0) return null

  const unresolved = coverage.gapDates.filter(g => !g.declaration).length
  const tone = unresolved > 0
    ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
    : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200'

  return (
    <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${tone}`}>
      <p className="font-bold uppercase tracking-wider">
        {coverage.previousReport
          ? `Covers ${formatWindowLabel(coverage.coversFrom, coverage.coversTo)}`
          : 'Coverage'}
      </p>
      {multiDay && coverage.previousReport && (
        <p className="mt-1 opacity-90">
          The last DTR was filed for {formatDayLabel(coverage.previousReport.reportDate)}, so this DTR carries the schedule
          transactions of {formatWindowLabel(coverage.coversFrom, coverage.coversTo)}.
        </p>
      )}
      {coverage.gapDates.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-2">
          {coverage.gapDates.map(gap => <GapRow key={gap.date} gap={gap} props={props} />)}
        </ul>
      )}
    </div>
  )
}
