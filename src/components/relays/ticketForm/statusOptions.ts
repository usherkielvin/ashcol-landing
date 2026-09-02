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
  { value: 'RELOCATION', label: 'RELOCATION' },
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
  { value: 'DONE_RELOCATED', label: 'DONE RELOCATED' },
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

export function isStatusMatch(current: string, target: StatusOption): boolean {
  const cur = (current || '').trim().toUpperCase()
  const val = target.value.toUpperCase()
  const lbl = target.label.toUpperCase()
  if (cur === val || cur === lbl) return true
  if ((cur === 'SERVICES' || cur === 'SERVICE') && (val === 'SERVICE' || lbl === 'SERVICE')) return true
  if ((cur === 'INSTALLATION' || cur === 'INSTALL') && (val === 'INSTALL' || lbl === 'INSTALL')) return true
  return false
}
