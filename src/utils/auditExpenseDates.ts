export function parseExpenseDateKey(dateStr: string, fallbackIso?: string): string | null {
  const raw = (dateStr || '').trim()
  if (!raw && fallbackIso) {
    const d = new Date(fallbackIso)
    if (!Number.isNaN(d.getTime())) return toDateKey(d)
  }
  if (!raw) return null

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`

  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${y}-${pad2(dmy[2])}-${pad2(dmy[1])}`
  }

  const monthNames: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  const dmon = raw.match(/^(\d{1,2})[-/]([a-z]{3,9})[-/](\d{2,4})$/i)
  if (dmon) {
    const mon = monthNames[dmon[2].slice(0, 3).toLowerCase()]
    if (mon) {
      const y = dmon[3].length === 2 ? `20${dmon[3]}` : dmon[3]
      return `${y}-${mon}-${pad2(dmon[1])}`
    }
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return toDateKey(parsed)
  return null
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7)
}

export function getCurrentMonthKey(): string {
  return toDateKey(new Date()).slice(0, 7)
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, (m || 1) - 1, 1)
  return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

export function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  return dt.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function formatTodayReceiptDate(): string {
  const d = new Date()
  const FULL_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
  return `${FULL_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, (m || 1) - 1 + delta, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function pad2(n: string | number): string {
  return String(n).padStart(2, '0')
}
