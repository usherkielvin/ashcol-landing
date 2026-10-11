import { useState } from 'react'
import { X } from 'lucide-react'
import {
  DAY_DECLARATION_LABEL,
  declareDaysBulk,
  enumerateDateKeys,
  formatWindowLabel,
  type DayDeclarationType,
} from '../utils/dtrCoverage'

interface Props {
  initialDate: string
  onClose: () => void
  /** Called after the declarations were saved, so the audit summary can reload. */
  onSaved: () => void
}

const MAX_DAYS = 31

/**
 * Admin: declare a holiday / closure for every active branch in advance, so branch staff are not
 * asked to explain those days when they file their next DTR.
 */
export function BulkDayDeclarationDialog({ initialDate, onClose, onSaved }: Props) {
  const [from, setFrom] = useState(initialDate)
  const [to, setTo] = useState(initialDate)
  const [type, setType] = useState<DayDeclarationType>('HOLIDAY')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const dates = from && to && to >= from ? enumerateDateKeys(from, to) : []
  const invalidRange = !from || !to || to < from || dates.length > MAX_DAYS

  const save = async () => {
    if (invalidRange || saving) return
    setSaving(true)
    setError(null)
    try {
      const count = await declareDaysBulk({ dates, type, reason: reason.trim() || DAY_DECLARATION_LABEL[type] })
      setDone(count)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
  const label = 'text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Declare holiday or closure">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#0A1120]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">Declare holiday / closure</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Applies to every active branch. A branch that works that day simply files a normal DTR.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-500/10">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={label}>From</span>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>To</span>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={field} />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className={label}>Type</span>
            <select value={type} onChange={e => setType(e.target.value as DayDeclarationType)} className={field}>
              {(Object.keys(DAY_DECLARATION_LABEL) as DayDeclarationType[]).map(t => (
                <option key={t} value={t}>{DAY_DECLARATION_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className={label}>Reason (shown on the audit report)</span>
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={120} placeholder="e.g. Christmas Day" className={field} />
          </label>
        </div>

        {invalidRange && from && to && (
          <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400">
            {to < from ? 'The end date is before the start date.' : `Pick at most ${MAX_DAYS} days at a time.`}
          </p>
        )}
        {error && <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
        {done != null && (
          <p className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Saved {formatWindowLabel(from, to)} for {done} branch line{done === 1 ? '' : 's'} ({dates.length} day{dates.length === 1 ? '' : 's'}).
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            {done != null ? 'Close' : 'Cancel'}
          </button>
          {done == null && (
            <button type="button" onClick={save} disabled={invalidRange || saving}
              className="rounded-lg bg-[#047857] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving…' : `Declare ${dates.length || ''} day${dates.length === 1 ? '' : 's'}`.trim()}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
