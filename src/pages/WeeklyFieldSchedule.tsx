import { useMemo, useRef, useState } from 'react'
import { CalendarDays, Plus, Trash2, Users, Wrench, Truck } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

type ScheduleKind = 'drivers' | 'installers'
type DayStatus = 'WITH SCHED' | 'NO SCHED' | 'CANCEL' | 'ABSENT' | 'ON LEAVE' | 'DAY OFF' | 'SURVEY' | 'PENDING'

interface PersonSchedule {
  id: string
  name: string
  roleNote: string
  photoUrl: string
  days: Record<string, { status: DayStatus; note: string; units: string }>
  totalUnitsTeamWork: string
  totalUnitsCleaning: string
  remarks: string
}

const LS_KEY = 'ashcol_weekly_field_schedule_v1'
const STATUS_OPTIONS: DayStatus[] = ['WITH SCHED', 'NO SCHED', 'CANCEL', 'ABSENT', 'ON LEAVE', 'DAY OFF', 'SURVEY', 'PENDING']

const defaultPeople = (kind: ScheduleKind, days: string[]): PersonSchedule[] => {
  const names = kind === 'drivers'
    ? ['WILLIAM PRADO', 'GEREMIE COLOSO']
    : ['ROMMEL ABECHUELA', 'GILBERT COLOSO']

  return names.map((name, index) => ({
    id: `${kind}-${index + 1}`,
    name,
    roleNote: 'IN-HOUSE',
    photoUrl: '',
    days: Object.fromEntries(days.map((day, dayIndex) => [
      day,
      {
        status: dayIndex < 3 ? 'WITH SCHED' : dayIndex < 5 ? (index === 0 ? 'WITH SCHED' : 'NO SCHED') : 'DAY OFF',
        note: kind === 'installers' && index === 0 && dayIndex === 1 ? 'DAY 2 - INSTALLATION OF PIPING ONLY' : '',
        units: dayIndex < 5 && (index === 0 || dayIndex < 3) ? '1' : '0',
      }
    ])) as PersonSchedule['days'],
    totalUnitsTeamWork: '',
    totalUnitsCleaning: '',
    remarks: '',
  }))
}

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const getWeekStart = (dateKey: string) => {
  const d = new Date(`${dateKey}T00:00:00`)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

const getWeekDays = (dateKey: string) => {
  const start = getWeekStart(dateKey)
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start)
    d.setDate(start.getDate() + index)
    return toDateKey(d)
  })
}

const formatDay = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()

const formatWeekLabel = (days: string[]) => {
  const first = new Date(`${days[0]}T00:00:00`)
  const last = new Date(`${days[6]}T00:00:00`)
  return `${first.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()} ${first.getDate()} - ${last.getDate()}`
}

const loadSchedule = (kind: ScheduleKind, weekKey: string, days: string[]) => {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    const saved = all?.[kind]?.[weekKey]
    if (Array.isArray(saved) && saved.length) return saved as PersonSchedule[]
  } catch {}
  return defaultPeople(kind, days)
}

const saveSchedule = (kind: ScheduleKind, weekKey: string, rows: PersonSchedule[]) => {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    localStorage.setItem(LS_KEY, JSON.stringify({
      ...all,
      [kind]: { ...(all[kind] || {}), [weekKey]: rows },
    }))
  } catch {}
}

export default function WeeklyFieldSchedule() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [kind, setKind] = useState<ScheduleKind>('drivers')
  const [anchorDate, setAnchorDate] = useState(toDateKey(new Date()))
  const anchorDateInputRef = useRef<HTMLInputElement>(null)

  const days = useMemo(() => getWeekDays(anchorDate), [anchorDate])
  const weekKey = days[0]
  const [drivers, setDrivers] = useState<PersonSchedule[]>(() => loadSchedule('drivers', weekKey, days))
  const [installers, setInstallers] = useState<PersonSchedule[]>(() => loadSchedule('installers', weekKey, days))

  const bg = isLight ? '#f4f6f8' : '#07111f'
  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#d8dee8' : '#1e2d48'
  const textPrimary = isLight ? '#111827' : '#E5E7EB'
  const textMuted = isLight ? '#64748b' : '#94A3B8'
  const headBg = isLight ? '#eef2f7' : '#111827'
  const softBg = isLight ? '#f8fafc' : '#0f172a'

  const rows = kind === 'drivers' ? drivers : installers
  const setRows = (next: PersonSchedule[]) => {
    if (kind === 'drivers') setDrivers(next)
    else setInstallers(next)
    saveSchedule(kind, weekKey, next)
  }

  const reloadWeek = (nextDate: string) => {
    const nextDays = getWeekDays(nextDate)
    const nextWeek = nextDays[0]
    setAnchorDate(nextDate)
    setDrivers(loadSchedule('drivers', nextWeek, nextDays))
    setInstallers(loadSchedule('installers', nextWeek, nextDays))
  }

  const updatePerson = (id: string, patch: Partial<PersonSchedule>) => {
    setRows(rows.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  const updateDay = (id: string, day: string, patch: Partial<PersonSchedule['days'][string]>) => {
    setRows(rows.map(row => row.id === id ? {
      ...row,
      days: { ...row.days, [day]: { ...(row.days[day] || { status: 'WITH SCHED', note: '', units: '' }), ...patch } },
    } : row))
  }

  const addPerson = () => {
    const next: PersonSchedule = {
      id: `${kind}-${Date.now()}`,
      name: '',
      roleNote: 'IN-HOUSE',
      photoUrl: '',
      days: Object.fromEntries(days.map(day => [day, { status: 'WITH SCHED', note: '', units: '1' }])) as PersonSchedule['days'],
      totalUnitsTeamWork: '',
      totalUnitsCleaning: '',
      remarks: '',
    }
    setRows([...rows, next])
  }

  const removePerson = (id: string) => setRows(rows.filter(row => row.id !== id))

  const statusStyle = (status: DayStatus) => {
    if (status === 'NO SCHED') return { backgroundColor: '#ef4444', color: '#111827' }
    if (status === 'CANCEL') return { backgroundColor: '#93c5fd', color: '#111827' }
    if (status === 'ABSENT') return { backgroundColor: '#111827', color: '#ffffff' }
    if (status === 'ON LEAVE') return { backgroundColor: '#a855f7', color: '#111827' }
    if (status === 'DAY OFF') return { backgroundColor: '#fb923c', color: '#111827' }
    if (status === 'SURVEY') return { backgroundColor: '#c084fc', color: '#111827' }
    if (status === 'PENDING') return { backgroundColor: '#ffffff', color: '#111827' }
    return { backgroundColor: '#10b981', color: '#111827' }
  }

  return (
    <div className="min-h-full pb-8" style={{ backgroundColor: bg, color: textPrimary }}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
             style={{ backgroundColor: cardBg, borderColor: border }}>
          <div>
            <h2 className="text-lg font-black tracking-tight">Weekly Field Schedule</h2>
            <p className="text-xs font-semibold mt-0.5" style={{ color: textMuted }}>{formatWeekLabel(days)} · {kind === 'drivers' ? 'Drivers' : 'Installers'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: border }}>
              {(['drivers', 'installers'] as ScheduleKind[]).map(tab => (
                <button key={tab} type="button" onClick={() => setKind(tab)}
                        className="px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5"
                        style={{ backgroundColor: kind === tab ? headBg : cardBg, color: textPrimary, borderRight: tab === 'drivers' ? `1px solid ${border}` : 'none' }}>
                  {tab === 'drivers' ? <Truck className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
                  {tab}
                </button>
              ))}
            </div>
            <div
              onClick={() => {
                anchorDateInputRef.current?.showPicker?.()
              }}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer"
              style={{ backgroundColor: softBg, borderColor: border }}
            >
              <CalendarDays className="w-4 h-4" style={{ color: textMuted }} />
              <input ref={anchorDateInputRef} type="date" value={anchorDate} onChange={e => reloadWeek(e.target.value)}
                     className="date-input-no-indicator date-input-trigger-only bg-transparent outline-none text-xs font-bold cursor-pointer" style={{ color: textPrimary }} />
            </div>
            <button type="button" onClick={addPerson}
                    className="rounded-lg border px-3 py-2 text-xs font-black flex items-center gap-1.5"
                    style={{ backgroundColor: cardBg, borderColor: border, color: textPrimary }}>
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>
        </div>

        <div className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-black uppercase"
             style={{ backgroundColor: cardBg, borderColor: border }}>
          <span style={{ color: textMuted }}>Legend</span>
          {STATUS_OPTIONS.map(status => (
            <span key={status} className="inline-flex items-center gap-2">
              <span className="w-6 h-3 rounded-sm border" style={{ ...statusStyle(status), borderColor: border }} />
              {status}
            </span>
          ))}
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="overflow-x-auto">
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: kind === 'drivers' ? 1180 : 1380, width: '100%' }}>
              <thead>
                <tr>
                  <th rowSpan={2} className="px-4 py-3 text-left text-xs font-black uppercase sticky left-0 z-20"
                      style={{ backgroundColor: cardBg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}`, width: 210 }}>
                    <span className="inline-flex items-center gap-2"><Users className="w-4 h-4" /> {kind}</span>
                  </th>
                  {days.map(day => (
                    <th key={day} className="px-3 py-2 text-center text-[11px] font-black uppercase"
                        style={{ backgroundColor: headBg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
                      {formatDay(day)}
                    </th>
                  ))}
                  <th rowSpan={2} className="px-3 py-2 text-center text-[11px] font-black uppercase"
                      style={{ backgroundColor: headBg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}`, width: 110 }}>
                    Total
                  </th>
                  {kind === 'installers' && (
                    <>
                      <th rowSpan={2} className="px-3 py-2 text-center text-[11px] font-black uppercase"
                          style={{ backgroundColor: headBg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}`, width: 130 }}>
                        Team Work
                      </th>
                      <th rowSpan={2} className="px-3 py-2 text-center text-[11px] font-black uppercase"
                          style={{ backgroundColor: headBg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}`, width: 130 }}>
                        Cleaning
                      </th>
                    </>
                  )}
                  <th rowSpan={2} className="px-3 py-2 text-center text-[11px] font-black uppercase"
                      style={{ backgroundColor: headBg, borderBottom: `1px solid ${border}`, width: 160 }}>
                    Remarks
                  </th>
                </tr>
                <tr>
                  {days.map(day => (
                    <th key={day} className="px-3 py-2 text-center text-[10px] font-black uppercase"
                        style={{ backgroundColor: softBg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
                      {new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((person, index) => {
                  const total = days.reduce((acc, day) => acc + (Number(person.days[day]?.units) || 0), 0)
                  return (
                    <tr key={person.id}>
                      <td className="sticky left-0 z-10 align-top" style={{ backgroundColor: cardBg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
                        <div className="p-3 flex items-center gap-3">
                          <div className="w-14 h-14 rounded-full border overflow-hidden shrink-0 flex items-center justify-center text-lg font-black"
                               style={{ backgroundColor: softBg, borderColor: border, color: textMuted }}>
                            {person.photoUrl ? <img src={person.photoUrl} alt="" className="w-full h-full object-cover" /> : (person.name || '?').slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <input value={person.name} onChange={e => updatePerson(person.id, { name: e.target.value.toUpperCase() })}
                                   placeholder={`${kind === 'drivers' ? 'Driver' : 'Installer'} name`}
                                   className="w-full bg-transparent outline-none text-xs font-black uppercase" style={{ color: textPrimary }} />
                            <input value={person.roleNote} onChange={e => updatePerson(person.id, { roleNote: e.target.value.toUpperCase() })}
                                   className="w-full bg-transparent outline-none text-[10px] font-bold uppercase mt-1" style={{ color: textMuted }} />
                            <input value={person.photoUrl} onChange={e => updatePerson(person.id, { photoUrl: e.target.value })}
                                   placeholder="Photo URL"
                                   className="w-full bg-transparent outline-none text-[10px] mt-1" style={{ color: textMuted }} />
                          </div>
                          <button type="button" onClick={() => removePerson(person.id)} className="p-1.5 rounded-md"
                                  style={{ color: textMuted }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="px-3 py-1 text-[10px] font-black" style={{ backgroundColor: softBg, borderTop: `1px solid ${border}`, color: textMuted }}>
                          {index + 1}
                        </div>
                      </td>

                      {days.map(day => {
                        const cell = person.days[day] || { status: 'WITH SCHED' as DayStatus, note: '', units: '' }
                        return (
                          <td key={day} className="align-top" style={{ borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}`, width: 145 }}>
                            <div className="min-h-[112px] p-2 flex flex-col gap-2" style={statusStyle(cell.status)}>
                              <select value={cell.status} onChange={e => updateDay(person.id, day, { status: e.target.value as DayStatus })}
                                      className="w-full bg-white/80 text-black rounded-md px-2 py-1 text-[10px] font-black outline-none">
                                {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                              </select>
                              <textarea value={cell.note} onChange={e => updateDay(person.id, day, { note: e.target.value.toUpperCase() })}
                                        placeholder="Schedule note"
                                        className="flex-1 resize-none bg-transparent outline-none text-[11px] font-black text-center uppercase placeholder:text-black/40"
                                        style={{ color: cell.status === 'ABSENT' ? '#fff' : '#111827' }} />
                            </div>
                            <input value={cell.units} onChange={e => updateDay(person.id, day, { units: e.target.value })}
                                   className="w-full h-7 text-center text-xs font-black outline-none"
                                   style={{ backgroundColor: '#fde68a', color: '#111827', borderTop: `1px solid ${border}` }} />
                          </td>
                        )
                      })}

                      <td className="align-top" style={{ borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
                        <div className="min-h-[112px] p-2 flex items-center justify-center">
                          <div className="w-full h-16 rounded-md border flex items-center justify-center text-xl font-black" style={{ borderColor: border, color: textPrimary }}>
                            {total}
                          </div>
                        </div>
                        <div className="h-7 text-center text-xs font-black flex items-center justify-center" style={{ backgroundColor: '#fde68a', color: '#111827', borderTop: `1px solid ${border}` }}>
                          {total}
                        </div>
                      </td>

                      {kind === 'installers' && (
                        <>
                          <td className="align-top" style={{ borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
                            <textarea value={person.totalUnitsTeamWork} onChange={e => updatePerson(person.id, { totalUnitsTeamWork: e.target.value })}
                                      className="w-full min-h-[139px] resize-none bg-transparent outline-none p-3 text-xs font-bold" style={{ color: textPrimary }} />
                          </td>
                          <td className="align-top" style={{ borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
                            <textarea value={person.totalUnitsCleaning} onChange={e => updatePerson(person.id, { totalUnitsCleaning: e.target.value })}
                                      className="w-full min-h-[139px] resize-none bg-transparent outline-none p-3 text-xs font-bold" style={{ color: textPrimary }} />
                          </td>
                        </>
                      )}

                      <td className="align-top" style={{ borderBottom: `1px solid ${border}` }}>
                        <textarea value={person.remarks} onChange={e => updatePerson(person.id, { remarks: e.target.value.toUpperCase() })}
                                  className="w-full min-h-[139px] resize-none bg-transparent outline-none p-3 text-xs font-bold uppercase" style={{ color: textPrimary }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
