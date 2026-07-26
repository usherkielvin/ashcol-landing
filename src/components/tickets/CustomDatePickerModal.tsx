import ReactDOM from 'react-dom'
import { todayDateKey } from '../../utils/ticketHelpers'

export function CustomDatePickerModal({
  isLight,
  calMonth,
  dateFilter,
  onSetCalMonth,
  onSelectDate,
  onClose,
}: {
  isLight: boolean
  calMonth: { year: number; month: number } | null
  dateFilter: string
  onSetCalMonth: (month: { year: number; month: number }) => void
  onSelectDate: (dateKey: string) => void
  onClose: () => void
}) {
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputBorder = isLight ? '#cbd5e1' : '#334155'
  const green = '#16A34A'

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl overflow-hidden w-[320px] max-w-full border flex flex-col"
        style={{
          backgroundColor: cardBg,
          borderColor: border,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between" style={{ borderColor: border }}>
          <button
            type="button"
            onClick={() => {
              const curMonth = calMonth?.month ?? new Date().getMonth()
              const curYear = calMonth?.year ?? new Date().getFullYear()
              const cur = new Date(curYear, curMonth, 1)
              cur.setMonth(cur.getMonth() - 1)
              onSetCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors hover:bg-slate-500/10"
            style={{ color: textMuted }}
          >
            {'<'}
          </button>
          <span className="text-sm font-bold" style={{ color: textPrimary }}>
            {new Date((calMonth?.year ?? new Date().getFullYear()), (calMonth?.month ?? new Date().getMonth()), 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
          </span>
          <button
            type="button"
            onClick={() => {
              const curMonth = calMonth?.month ?? new Date().getMonth()
              const curYear = calMonth?.year ?? new Date().getFullYear()
              const cur = new Date(curYear, curMonth, 1)
              cur.setMonth(cur.getMonth() + 1)
              onSetCalMonth({ year: cur.getFullYear(), month: cur.getMonth() })
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors hover:bg-slate-500/10"
            style={{ color: textMuted }}
          >
            {'>'}
          </button>
        </div>

        {/* Day-of-week labels */}
        <div className="grid grid-cols-7 px-3 pt-3 pb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center text-[10px] font-extrabold uppercase tracking-wider py-1" style={{ color: textMuted }}>
              {d}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        {(() => {
          const cdYear = calMonth?.year ?? new Date().getFullYear()
          const cdMonth = calMonth?.month ?? new Date().getMonth()
          const daysInMonth = new Date(cdYear, cdMonth + 1, 0).getDate()
          const firstDow = new Date(cdYear, cdMonth, 1).getDay()
          const todayKey = todayDateKey()

          return (
            <div className="grid grid-cols-7 gap-y-0.5 px-3 pb-4">
              {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dKey = `${cdYear}-${String(cdMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const isToday = dKey === todayKey
                const isSel = dKey === dateFilter
                return (
                  <button
                    key={dKey}
                    type="button"
                    onClick={() => onSelectDate(dKey)}
                    className="relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-full transition-all hover:bg-emerald-500/10"
                    style={{
                      color: isSel ? '#fff' : isToday ? green : textPrimary,
                      backgroundColor: isSel ? green : 'transparent',
                      fontWeight: isToday && !isSel ? 800 : 600,
                      boxShadow: isSel ? '0 2px 6px rgba(16,185,129,0.4)' : undefined,
                    }}
                  >
                    {day}
                    {isToday && !isSel && (
                      <span
                        className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                        style={{ backgroundColor: green }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Footer — quick actions */}
        <div className="flex items-center gap-2 px-4 pb-4 border-t pt-3" style={{ borderColor: border }}>
          <button
            type="button"
            onClick={() => onSelectDate(todayDateKey())}
            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90"
            style={{ backgroundColor: `${green}22`, color: green }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all hover:opacity-90"
            style={{ borderColor: inputBorder, color: textMuted, backgroundColor: 'transparent' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
