/** Yellow N/A string for empty table cells. */
export const EMPTY_CELL = 'N/A'

const MOJIBAKE_EMPTY = /^(Ã¢|â€|Ã¢Â‚¬|â‚¬|\u00E2\u20AC)/i

/** True when the whole string is a corrupted dash/ellipsis/middot placeholder. */
function isMojibakePlaceholder(raw: string): boolean {
  if (!raw) return false
  if (MOJIBAKE_EMPTY.test(raw)) return true
  // Short garbled tokens with no real letters/digits (e.g. Ã¢â‚¬â€ , Ã¢Â‚¬Â€, Ã¢â‚¬Â¦)
  if (/^(Ã¢|â€|Ã‚Â)/.test(raw) && raw.length <= 24 && !/[a-zA-Z0-9]/.test(raw)) return true
  return false
}

/** Strip corrupted encoding artifacts and treat them as empty. */
export function sanitizeDisplayText(value?: string | null): string {
  if (value == null) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  if (raw === EMPTY_CELL || raw === '-' || raw === '–' || raw === '—' || raw === '\u2014') return ''
  if (isMojibakePlaceholder(raw)) return ''
  return raw
}

/** Clean cell text, or a proper em dash when empty. */
export function displayOrDash(value?: string | null): string {
  const clean = sanitizeDisplayText(value)
  return clean || EMPTY_CELL
}

/** Sanitize peso / currency prefix corruption. */
export function formatPesoPrefix(amount: string): string {
  const clean = sanitizeDisplayText(amount)
  if (!clean) return EMPTY_CELL
  return `\u20B1${clean}`
}
