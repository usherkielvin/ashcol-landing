export interface BranchTheme {
  name: string
  accent: string
  accentDark: string
  accentLight: string
}

export const branchThemes: Record<string, BranchTheme> = {
  "TAGUIG - SALES": {
    name: "Emerald Green",
    accent: "#059669",
    accentDark: "#047857",
    accentLight: "#D1FAE5"
  },
  "TAGUIG - SERVICES": {
    name: "Technical Teal",
    accent: "#0F766E",
    accentDark: "#115E59",
    accentLight: "#CCFBF1"
  },
  "PAMPANGA": {
    name: "Crimson Red",
    accent: "#DC2626",
    accentDark: "#991B1B",
    accentLight: "#FEE2E2"
  },
  "DASMA": {
    name: "Royal Blue",
    accent: "#2563EB",
    accentDark: "#1D4ED8",
    accentLight: "#DBEAFE"
  },
  "BULACAN": {
    name: "Violet Purple",
    accent: "#7C3AED",
    accentDark: "#5B21B6",
    accentLight: "#EDE9FE"
  },
  "CANDELARIA": {
    name: "Arctic Teal",
    accent: "#14B8A6",
    accentDark: "#0F766E",
    accentLight: "#CCFBF1"
  },
  "SILANG": {
    name: "Ice Cyan",
    accent: "#0891B2",
    accentDark: "#0E7490",
    accentLight: "#E0F7FA"
  },
  "RIZAL": {
    name: "Indigo",
    accent: "#4338CA",
    accentDark: "#312E81",
    accentLight: "#E0E7FF"
  },
  "CALAUAN": {
    name: "Rose Pink",
    accent: "#EC4899",
    accentDark: "#BE185D",
    accentLight: "#FCE7F3"
  }
}

export const getBranchThemeKey = (name: string): string => {
  const upper = name.toUpperCase().trim()
  if (upper === 'LAGUNA' || upper === 'CALAUAN') return 'CALAUAN'
  if (upper === 'DASMARIÑAS' || upper === 'DASMA') return 'DASMA'
  if (branchThemes[upper]) return upper
  return 'TAGUIG - SALES' // fallback
}

export interface VehicleItem {
  id: string
  name: string
  plateNumber: string
  branchAssigned: string
  codingDay: string
}

export const VEHICLE_OPTIONS = ['STRADA', 'T3', 'FB19', 'T2']

export const VEHICLE_DEFAULTS = [
  { name: 'STRADA', plateNumber: 'NDA 8274', branchPattern: /TAGUIG.*SALES/i, codingDay: 'Thursday' },
  { name: 'T3', plateNumber: 'TGS 8392', branchPattern: /TAGUIG.*SERVICE/i, codingDay: 'Monday' },
  { name: 'FB19', plateNumber: 'CAY 5928', branchPattern: /BULACAN/i, codingDay: 'Thursday' },
  { name: 'T2', plateNumber: 'WGV 782', branchPattern: /DASMA/i, codingDay: 'Monday' },
  { name: 'FB8', plateNumber: 'NET 4821', branchPattern: /RIZAL/i, codingDay: 'Monday' },
  { name: 'FB10', plateNumber: 'NQC 829', branchPattern: /CALAUAN|LAGUNA/i, codingDay: 'Friday' },
  { name: 'FB15', plateNumber: 'UQC 927', branchPattern: /TAGUIG.*SERVICE/i, codingDay: 'Thursday' },
  { name: 'FB17', plateNumber: 'NQC 829', branchPattern: /TAGUIG.*SERVICE/i, codingDay: 'Friday' },
]

export const isTimeBefore10AM = (timeStr?: string): boolean => {
  if (!timeStr) return true
  const clean = timeStr.trim().toUpperCase()
  const match = clean.match(/^(\d+)(?::(\d+))?\s*(AM|PM)?$/)
  if (!match) return true
  const h = parseInt(match[1], 10)
  const period = match[3]
  let hour24 = h
  if (period === 'PM') { if (h !== 12) hour24 = h + 12 }
  else if (period === 'AM') { if (h === 12) hour24 = 0 }
  return hour24 < 10
}

export const DRIVER_OPTIONS = ['ANGELO', 'JOJO', 'ADAM', 'DOMINIC']
export const INSTALLER_OPTIONS = ['RANIL', 'JHUMAR', 'KENNAN', 'CRIS', 'SONNY', 'RYAN', 'ALLAN']
export const NEGOTIATOR_OPTIONS = ['LIZA', 'JANE', 'MARK', 'SARAH', 'ALEX']
export const ROUTE_OPTIONS = [
  'QC - MANILA',
  'TAGUIG - TAGUIG - TAGUIG - TAGUIG',
  'MANDALUYONG - QC',
  'QC - QC',
  'CAINTA - CAINTA - MARIKINA'
]
export const REMARKS_OPTIONS = [
  'INSTALL - INSTALL - (3UNITS)',
  'INSTALL - INSTALL - INSTALL - INSTALL (TEAMWORK) - 4 UNITS',
  'INSTALL - INSTALL (2 UNITS)',
  'INSTALL - INSTALL (3 UNITS)'
]

export function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toLocalDateStr(d)
}

export function englishLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`.toUpperCase()
}

export interface LineUpRow {
  id: string
  lineupDate: string
  branchId: string
  service: string
  driverName: string
  driverTime: string
  installerName: string
  installerTime: string
  negotiator: string
  route: string
  remarks: string
  sortOrder: number
}

export const LS_KEY = 'ashcol_lineup_v2'

export function lsLoad(): LineUpRow[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

export function lsSave(rows: LineUpRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows))
}

export function lsNextId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface ConfirmModalState {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
}

export type WScheduleKind = 'drivers' | 'installers'
export type WDayStatus = 'WITH SCHED' | 'NO SCHED' | 'CANCEL' | 'ABSENT' | 'ON LEAVE' | 'DAY OFF' | 'SURVEY' | 'PENDING'

export interface WPersonSchedule {
  id: string
  name: string
  roleNote: string
  photoUrl: string
  days: Record<string, { status: WDayStatus; note: string; units: string }>
  totalUnitsTeamWork: string
  totalUnitsCleaning: string
  remarks: string
}

export const W_LS_KEY = 'ashcol_weekly_field_schedule_v1'
export const W_STATUS_OPTIONS: WDayStatus[] = ['WITH SCHED', 'NO SCHED', 'CANCEL', 'ABSENT', 'ON LEAVE', 'DAY OFF', 'SURVEY', 'PENDING']

export const wToDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

export const wGetWeekStart = (dateKey: string) => {
  const d = new Date(`${dateKey}T00:00:00`); const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d
}

export const wGetWeekDays = (dateKey: string) => {
  const start = wGetWeekStart(dateKey)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate()+i); return wToDateKey(d) })
}

export const wFormatDay = (dk: string) => new Date(`${dk}T00:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}).toUpperCase()

export const wFormatWeekLabel = (days: string[]) => {
  const f = new Date(`${days[0]}T00:00:00`); const l = new Date(`${days[6]}T00:00:00`)
  return `${f.toLocaleDateString('en-US',{month:'long'}).toUpperCase()} ${f.getDate()} – ${l.getDate()}`
}

export const wDefaultPeople = (kind: WScheduleKind, days: string[], suggestionsDrivers: string[] = [], suggestionsInstallers: string[] = []): WPersonSchedule[] => {
  let names: string[] = []
  if (kind === 'drivers') {
    names = suggestionsDrivers && suggestionsDrivers.length > 0
      ? suggestionsDrivers.map(d => d.toUpperCase())
      : []
  } else {
    names = suggestionsInstallers && suggestionsInstallers.length > 0
      ? suggestionsInstallers.map(i => i.toUpperCase())
      : []
  }
  if (names.length === 0) {
    names = kind === 'drivers' ? ['WILLIAM PRADO','GEREMIE COLOSO'] : ['ROMMEL ABECHUELA','GILBERT COLOSO']
  }
  return names.map((name,index) => ({
    id: `${kind}-${index+1}`, name, roleNote:'IN-HOUSE', photoUrl:'',
    days: Object.fromEntries(days.map((day,di) => [day,{
      status: di<3?'WITH SCHED':di<5?(index===0?'WITH SCHED':'NO SCHED'):'DAY OFF' as WDayStatus,
      note: kind==='installers'&&index===0&&di===1?'DAY 2 - INSTALLATION OF PIPING ONLY':'',
      units: di<5&&(index===0||di<3)?'1':'0',
    }])) as WPersonSchedule['days'],
    totalUnitsTeamWork:'', totalUnitsCleaning:'', remarks:'',
  }))
}

export const wLoadSchedule = (kind: WScheduleKind, weekKey: string, days: string[], bId: string, suggestionsDrivers?: string[], suggestionsInstallers?: string[]) => {
  const activeBranchId = bId || 'default'
  try {
    const all = JSON.parse(localStorage.getItem(W_LS_KEY)||'{}')
    const saved = all?.[activeBranchId]?.[kind]?.[weekKey]
    if(Array.isArray(saved)&&saved.length) return saved as WPersonSchedule[]
  } catch {}
  return wDefaultPeople(kind, days, suggestionsDrivers, suggestionsInstallers)
}

export const wSaveSchedule = (kind: WScheduleKind, weekKey: string, rows: WPersonSchedule[], bId: string) => {
  const activeBranchId = bId || 'default'
  try {
    const all = JSON.parse(localStorage.getItem(W_LS_KEY)||'{}')
    if (!all[activeBranchId]) all[activeBranchId] = {}
    if (!all[activeBranchId][kind]) all[activeBranchId][kind] = {}
    all[activeBranchId][kind][weekKey] = rows
    localStorage.setItem(W_LS_KEY, JSON.stringify(all))
  } catch {}
}

export const wStatusDot = (status: WDayStatus): string => {
  if (status==='NO SCHED')  return '#ef4444'
  if (status==='CANCEL')    return '#60a5fa'
  if (status==='ABSENT')    return '#0f172a'
  if (status==='ON LEAVE')  return '#a855f7'
  if (status==='DAY OFF')   return '#f97316'
  if (status==='SURVEY')    return '#c084fc'
  if (status==='PENDING')   return '#ffffff'
  return '#10b981'
}

export const wGetStatusTheme = (status: WDayStatus, isLight: boolean) => {
  switch (status) {
    case 'WITH SCHED':
      return { border: '#059669', bg: '#10b981', text: '#ffffff', headerBg: '#059669', headerText: '#ffffff', unitBg: '#047857', unitText: '#ffffff' }
    case 'NO SCHED':
      return { border: '#b91c1c', bg: '#ef4444', text: '#ffffff', headerBg: '#b91c1c', headerText: '#ffffff', unitBg: '#991b1b', unitText: '#ffffff' }
    case 'CANCEL':
      return { border: '#1d4ed8', bg: '#3b82f6', text: '#ffffff', headerBg: '#1d4ed8', headerText: '#ffffff', unitBg: '#1e40af', unitText: '#ffffff' }
    case 'ABSENT':
      return { border: '#334155', bg: '#475569', text: '#ffffff', headerBg: '#334155', headerText: '#ffffff', unitBg: '#1e293b', unitText: '#ffffff' }
    case 'ON LEAVE':
      return { border: '#7e22ce', bg: '#9333ea', text: '#ffffff', headerBg: '#7e22ce', headerText: '#ffffff', unitBg: '#6b21a8', unitText: '#ffffff' }
    case 'DAY OFF':
      return { border: '#c2410c', bg: '#f97316', text: '#ffffff', headerBg: '#c2410c', headerText: '#ffffff', unitBg: '#9a3412', unitText: '#ffffff' }
    case 'SURVEY':
      return { border: '#a21caf', bg: '#d946ef', text: '#ffffff', headerBg: '#a21caf', headerText: '#ffffff', unitBg: '#86198f', unitText: '#ffffff' }
    case 'PENDING':
      return { border: isLight ? '#cbd5e1' : '#475569', bg: '#ffffff', text: '#111827', headerBg: '#f1f5f9', headerText: '#111827', unitBg: '#e2e8f0', unitText: '#111827' }
    default:
      return { border: '#059669', bg: '#10b981', text: '#ffffff', headerBg: '#059669', headerText: '#ffffff', unitBg: '#047857', unitText: '#ffffff' }
  }
}

export const parseTimeInput = (raw: string): string => {
  const s = raw.trim().toUpperCase()
  if (!s) return raw
  const m = s.match(/^(\d{1,2}):?(\d{2})\s*(AM|PM)?$/) ||
            s.match(/^(\d{1,2})\s*(AM|PM)$/)
  if (!m) return raw
  let hour   = parseInt(m[1], 10)
  const min  = m[2] && m[2].length === 2 ? m[2] : '00'
  const ampm = (m[2] === 'AM' || m[2] === 'PM') ? m[2] :
               (m[3] === 'AM' || m[3] === 'PM') ? m[3] :
               (hour < 12 ? 'AM' : 'PM')
  if (hour > 12) hour = hour - 12
  if (hour === 0) hour = 12
  return `${hour}:${min}${ampm}`
}

export const sumAllUnits = (text: string): number => {
  const regex = /(\d+)\s*UNIT/gi
  let match
  let total = 0
  while ((match = regex.exec(text)) !== null) {
    total += parseInt(match[1], 10) || 0
  }
  return total
}

export const normalizeRemarksString = (str: string): string => {
  return (str || '')
    .replace(/\bDONE_INSTALLED\b/gi, 'INSTALLED')
    .replace(/\bDONE_INSTALL\b/gi, 'INSTALLED')
    .replace(/\bDONE\s+INSTALL(?:ED)?\b/gi, 'INSTALLED')
    .replace(/\bINSTALLATION\b/gi, 'INSTALLED')
    .replace(/\bDONE_CLEANING\b/gi, 'CLEANING')
    .replace(/\bDONE_SURVEY\b/gi, 'SURVEY')
    .replace(/\bDONE_CHECKUP\b/gi, 'CHECKUP')
    .replace(/\bDONE_BACKJOB\b/gi, 'BACKJOB')
    .replace(/\bDONE_SERVICE\b/gi, 'SERVICE')
    .replace(/\bDONE_DISMANTLE\b/gi, 'DISMANTLE')
    .replace(/\bDONE_QUOTATION\b/gi, 'QUOTATION')
    .replace(/\bDONE_NEGOTIATION\b/gi, 'NEGOTIATION')
    .replace(/\bDONE_SYSTEM_REPROCESS\b/gi, 'SYSTEM REPROCESS')
}

export const getRemarkBadge = (row: LineUpRow, currentTheme: BranchTheme, isLight: boolean) => {
  const txt = (row.remarks + ' ' + row.route).toUpperCase()
  if (/BACK\s*JOB/i.test(txt)) return { label: 'BACK JOB', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' }
  if (/DISMANTLE/i.test(txt)) return { label: 'DISMANTLE', color: '#F43F5E', bg: 'rgba(244,63,94,0.1)' }
  if (/SURVEY/i.test(txt)) return { label: 'SURVEY', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' }
  const m = txt.match(/\((\d+)\s*UNIT/i)
  if (m) return { label: `${m[1]} UNIT${parseInt(m[1]) > 1 ? 'S' : ''}`, color: currentTheme.accent, bg: isLight ? currentTheme.accentLight : `${currentTheme.accent}20` }
  return null
}
