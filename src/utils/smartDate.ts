const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}
const FULL_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

function fmt(d: Date): string {
  return `${FULL_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** Try to parse a loosely typed date string into DD-Mon-YY.
 *  Returns null if it cannot be parsed. */
export function parseSmartDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const now = new Date()

  // Already in target format: 16-May-26
  if (/^\d{1,2}-[A-Za-z]{3}-\d{2}$/i.test(s)) {
    const [d, m, y] = s.split('-')
    const mIdx = MONTHS[m.toLowerCase()]
    if (mIdx === undefined) return null
    const full = 2000 + parseInt(y)
    return fmt(new Date(full, mIdx, parseInt(d)))
  }

  // YYYY-MM-DD  or  MM/DD/YYYY  or  MM-DD-YYYY
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (isoMatch) {
    const dt = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
    return fmt(dt)
  }
  const mdyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (mdyMatch) {
    const dt = new Date(parseInt(mdyMatch[3]), parseInt(mdyMatch[1]) - 1, parseInt(mdyMatch[2]))
    return fmt(dt)
  }

  // "May 16"  "May 16 2026"  "16 May"  "16 May 2026"  "16 may 26" "29-APRIL-26"
  const parts = s.toLowerCase().replace(/[,/-]/g, ' ').split(/\s+/)
  if (parts.length >= 2) {
    let day: number | null = null
    let month: number | null = null
    let year = now.getFullYear()

    for (const p of parts) {
      if (MONTHS[p] !== undefined) month = MONTHS[p]
      else if (/^\d+$/.test(p)) {
        const n = parseInt(p)
        if (n > 31) {
          year = n < 100 ? 2000 + n : n
        } else if (day === null) {
          day = n
        } else {
          // If day is already set, this must be the year (e.g. 26 for 2026)
          year = n < 100 ? 2000 + n : n
        }
      }
    }
    if (day !== null && month !== null) {
      return fmt(new Date(year, month, day))
    }
  }

  return null
}

/** Convert DD-Mon-YY to timestamp for proper chronological sorting. */
export function dateToTime(s: string): number {
  if (!s) return 0
  const parts = s.split('-')
  if (parts.length === 3) {
    const d = parseInt(parts[0])
    const mStr = parts[1].toLowerCase()
    const m = MONTHS[mStr]
    const y = parseInt(parts[2])
    const fullYear = y < 100 ? 2000 + y : y
    if (m !== undefined) {
      return new Date(fullYear, m, d).getTime()
    }
  }
  return new Date(s).getTime() || 0
}
