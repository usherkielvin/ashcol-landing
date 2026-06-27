const PLACEHOLDER_CONTROL_SI = new Set([
  'existing',
  'n/a',
  'na',
  'none',
  'null',
  'nil',
  '-',
  '—',
  '--',
  '---',
  'tbd',
  'unknown',
  'no si',
  'no control',
  'no control number',
  'pending',
  'new',
  'direct',
  'wala',
  'none yet',
  'not applicable',
  'n.a.',
  'n.a',
])

/** Returns a real control/SI number, or empty string for placeholders and junk. */
export function sanitizeControlSi(value?: string | null): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return ''

  const lower = trimmed.toLowerCase()
  if (PLACEHOLDER_CONTROL_SI.has(lower)) return ''
  if (/^[-–—./\\|_]+$/.test(trimmed)) return ''

  return trimmed
}

export function hasRealControlSi(value?: string | null): boolean {
  return sanitizeControlSi(value).length > 0
}

export function formatControlSiDisplay(value?: string | null): string {
  const clean = sanitizeControlSi(value)
  return clean || '—'
}
