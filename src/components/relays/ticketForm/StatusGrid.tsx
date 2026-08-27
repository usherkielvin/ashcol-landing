export type StatusOption = { value: string; label: string }

export const PENDING_STATUS_OPTIONS: StatusOption[] = [
  { value: 'INSTALL', label: 'INSTALL' },
  { value: 'SURVEY', label: 'SURVEY' },
  { value: 'CLEANING', label: 'CLEANING' },
  { value: 'CHECKUP', label: 'CHECKUP' },
  { value: 'BACKJOB', label: 'BACKJOB' },
  { value: 'SERVICE', label: 'SERVICE' },
  { value: 'MOUNTING', label: 'MOUNTING' },
  { value: 'RESCHED', label: 'RESCHED' },
  { value: 'CONTINUATION', label: 'CONTINUATION' },
  { value: 'FOR APPROVAL', label: 'FOR QUOTATION' },
  { value: 'SYSTEM_REPROCESS', label: 'SYSTEM REPROCESS' },
  { value: 'DISMANTLE', label: 'DISMANTLE' },
]

export const CLOSING_STATUS_OPTIONS: StatusOption[] = [
  { value: 'DONE_INSTALLED', label: 'DONE INSTALL' },
  { value: 'DONE_CLEANING', label: 'DONE CLEANING' },
  { value: 'DONE_SURVEY', label: 'DONE SURVEY' },
  { value: 'DONE_CHECKUP', label: 'DONE CHECKUP' },
  { value: 'DONE_BACKJOB', label: 'DONE BACKJOB' },
  { value: 'DONE_SERVICE', label: 'DONE SERVICE' },
  { value: 'DONE_MOUNTING', label: 'DONE MOUNTING' },
  { value: 'DONE_SYSTEM_REPROCESS', label: 'DONE SYSTEM REPROCESS' },
  { value: 'DONE_DISMANTLE', label: 'DONE DISMANTLE' },
  { value: 'DONE_QUOTATION', label: 'DONE QUOTATION' },
  { value: 'CANCELLED', label: 'CANCELLED' },
]

/** Normalizes a raw status/serviceType value into the label shown in the status-change
 *  confirmation dialog (handles the legacy SERVICES/INSTALLATION/S-I aliases). */
export function normalizeStatusLabel(raw?: string): string {
  const upper = (raw || 'PENDING').toUpperCase()
  if (upper === 'SERVICES' || upper === 'SERVICE') return 'SERVICE'
  if (upper === 'INSTALLATION' || upper === 'INSTALL') return 'INSTALL'
  if (upper === 'S/I' || upper === 'SURVEY_INSTALL') return 'SURVEY & INSTALL'
  return upper.replace(/_/g, ' ')
}

/** A ticket's workflow status (PENDING/ASSIGNED/SCHEDULED/COMPLETED) isn't one of the grid's
 *  service-type buttons — fall back to serviceType so the right button still lights up. */
export function resolveEffectiveStatusForGrid(status?: string, serviceType?: string): string {
  let raw = (status || serviceType || '').trim().toUpperCase()
  if (['PENDING', 'ASSIGNED', 'SCHEDULED', 'COMPLETED', ''].includes(raw)) {
    raw = (serviceType || 'S/I').trim().toUpperCase()
  }
  return raw
}

function isStatusMatch(current: string, target: StatusOption): boolean {
  const cur = (current || '').trim().toUpperCase()
  const val = target.value.toUpperCase()
  const lbl = target.label.toUpperCase()
  if (cur === val || cur === lbl) return true
  if ((cur === 'SERVICES' || cur === 'SERVICE') && (val === 'SERVICE' || lbl === 'SERVICE')) return true
  if ((cur === 'INSTALLATION' || cur === 'INSTALL') && (val === 'INSTALL' || lbl === 'INSTALL')) return true
  return false
}

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
