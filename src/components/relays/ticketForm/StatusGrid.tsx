import { PENDING_STATUS_OPTIONS, CLOSING_STATUS_OPTIONS, isStatusMatch, type StatusOption } from './statusOptions'

export function StatusGrid({
  currentStatus,
  onRequestChange,
  isLight,
  border,
  textMuted,
}: {
  currentStatus: string
  onRequestChange: (status: StatusOption) => void
  isLight: boolean
  border: string
  textMuted: string
}) {
  const renderButton = (st: StatusOption) => {
    const isSelected = isStatusMatch(currentStatus, st)
    return (
      <button
        key={st.value}
        type="button"
        onClick={() => { if (!isSelected) onRequestChange(st) }}
        className="flex items-center justify-center py-3 px-2 rounded-xl border font-black text-[11px] uppercase tracking-wide transition-all duration-150 select-none cursor-pointer"
        style={isSelected ? {
          backgroundColor: '#10B981',
          borderColor: '#10B981',
          color: 'white',
          boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
        } : {
          backgroundColor: isLight ? '#f8fafc' : 'rgba(255,255,255,0.02)',
          borderColor: border,
          color: textMuted,
        }}
      >
        {st.label}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: textMuted }}>Pending</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PENDING_STATUS_OPTIONS.map(renderButton)}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: textMuted }}>Closing</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CLOSING_STATUS_OPTIONS.map(renderButton)}
        </div>
      </div>
    </div>
  )
}
