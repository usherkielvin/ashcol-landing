import React from 'react'
import {
  Users, Plus, Trash2, Maximize2, Truck, Wrench, CalendarDays,
  Save, Loader2
} from 'lucide-react'
import type {
  WScheduleKind,
  WDayStatus,
  WPersonSchedule,
  BranchTheme,
} from './types'
import {
  W_STATUS_OPTIONS,
  wStatusDot,
  wGetStatusTheme,
  wFormatWeekLabel,
  wFormatDay,
  wToDateKey,
  wGetWeekDays,
} from './types'

interface WeeklyTabProps {
  wKind: WScheduleKind
  setWKind: (k: WScheduleKind) => void
  wDays: string[]
  wWeekKey: string
  wRows: WPersonSchedule[]
  wAnchorDate: string
  savedWeeks: string[]
  loadingWeekly: boolean
  showcaseOpen: boolean
  setShowcaseOpen: (o: boolean) => void
  currentTheme: BranchTheme
  isTaguigServices: boolean
  isLight: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  weeklyDateInputRef: React.RefObject<HTMLInputElement | null>
  wReloadWeek: (nextDate: string) => void
  wAddPerson: () => void
  wRemovePerson: (id: string) => void
  wUpdatePerson: (id: string, patch: Partial<WPersonSchedule>) => void
  wUpdateDay: (id: string, day: string, patch: Partial<WPersonSchedule['days'][string]>) => void
  wHandlePhotoUpload: (id: string, file: File) => void
  handleSaveWeeklySchedule: () => void
}

export const WeeklyTab: React.FC<WeeklyTabProps> = ({
  wKind,
  setWKind,
  wDays,
  wWeekKey,
  wRows,
  wAnchorDate,
  savedWeeks,
  loadingWeekly,
  showcaseOpen,
  setShowcaseOpen,
  currentTheme,
  isTaguigServices,
  isLight,
  cardBg,
  border,
  textPrimary,
  textMuted,
  inputBg,
  weeklyDateInputRef,
  wReloadWeek,
  wAddPerson,
  wRemovePerson,
  wUpdatePerson,
  wUpdateDay,
  wHandlePhotoUpload,
  handleSaveWeeklySchedule,
}) => {
  return (
    <div style={{ color: textPrimary }}>
      {/* Header Bar */}
      <div
        className="rounded-lg mb-4 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: textMuted }}>Scheduling</p>
          <h2 className="text-md font-extrabold tracking-tight">{wFormatWeekLabel(wDays)}</h2>
          <p className="text-xs mt-0.5 font-medium" style={{ color: textMuted }}>
            {wKind === 'drivers' ? 'Drivers' : 'Installers'} · Weekly Overview
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Showcase Button */}
          <button
            type="button"
            onClick={() => setShowcaseOpen(!showcaseOpen)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
            style={{
              backgroundColor: showcaseOpen ? 'transparent' : '#16a34a',
              border: '2px solid #16a34a',
              color: showcaseOpen ? '#16a34a' : '#ffffff',
              boxShadow: showcaseOpen ? 'none' : '0 2px 10px rgba(22,163,74,0.4)',
            }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            {showcaseOpen ? 'Exit Showcase' : 'Showcase'}
          </button>

          {/* Kind Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-md" style={{ backgroundColor: isLight ? '#f1f5f9' : '#0f172a', border: `1px solid ${border}` }}>
            {(['drivers', 'installers'] as WScheduleKind[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setWKind(k)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer"
                style={{
                  backgroundColor: wKind === k ? cardBg : 'transparent',
                  color: wKind === k ? textPrimary : textMuted,
                }}
              >
                {k === 'drivers' ? <Truck className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
                {k === 'drivers' ? 'Drivers' : 'Installers'}
              </button>
            ))}
          </div>

          {/* Date picker */}
          <div
            onClick={() => {
              weeklyDateInputRef.current?.showPicker?.()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer"
            style={{ backgroundColor: isLight ? '#f8fafc' : '#0f172a', border: `1px solid ${border}` }}
          >
            <CalendarDays className="w-3.5 h-3.5" style={{ color: textMuted }} />
            <input
              ref={weeklyDateInputRef}
              type="date"
              value={wAnchorDate}
              onChange={e => wReloadWeek(e.target.value)}
              className="date-input-no-indicator date-input-trigger-only bg-transparent outline-none text-xs font-bold cursor-pointer"
              style={{ color: textPrimary }}
            />
          </div>

          {/* Add Row */}
          <button
            type="button"
            onClick={wAddPerson}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold text-white transition-all hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: '#10b981' }}
          >
            <Plus className="w-3.5 h-3.5" /> Add Person
          </button>

          {/* Save Weekly Schedule */}
          <button
            type="button"
            onClick={handleSaveWeeklySchedule}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
            style={{ backgroundColor: currentTheme.accent }}
            disabled={loadingWeekly}
          >
            {loadingWeekly ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {loadingWeekly ? 'Saving...' : 'Save Weekly Schedule'}
          </button>
        </div>
      </div>

      {savedWeeks.length > 0 && (
        <div
          className="rounded-lg mb-4 px-4 py-2 flex flex-wrap items-center gap-2"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: textMuted }}>
            Saved weeks
          </span>
          {savedWeeks.slice(0, 10).map(week => {
            const active = week === wWeekKey
            return (
              <button
                key={week}
                type="button"
                onClick={() => wReloadWeek(week)}
                className="px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer"
                style={{
                  backgroundColor: active ? '#16a34a' : (isLight ? '#f1f5f9' : '#0f172a'),
                  color: active ? '#fff' : textMuted,
                  border: `1px solid ${active ? '#16a34a' : border}`,
                }}
              >
                {wFormatWeekLabel(wGetWeekDays(week))}
              </button>
            )
          })}
        </div>
      )}

      {/* Legend strip */}
      <div
        className="rounded-lg mb-4 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Legend</span>
        {W_STATUS_OPTIONS.map(s => (
          <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-bold">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: wStatusDot(s), border: s === 'PENDING' ? `1px solid ${border}` : 'none' }}
            />
            {s}
          </span>
        ))}
      </div>

      {/* Day headers row */}
      <div
        className="grid mb-2 gap-1"
        style={{ gridTemplateColumns: `180px repeat(7, 1fr)${wKind === 'installers' ? ' 80px 80px' : ''} 1fr` }}
      >
        <div />
        {wDays.map(day => {
          const isToday = day === wToDateKey(new Date())
          return (
            <div
              key={day}
              className="flex flex-col items-center px-1 py-1.5 rounded-md transition-all"
              style={{
                backgroundColor: isToday ? currentTheme.accent : inputBg,
                borderColor: isToday ? currentTheme.accent : border,
                borderWidth: '1px',
                borderStyle: 'solid'
              }}
            >
              <span
                className="text-[9px] font-bold uppercase tracking-wider"
                style={{ color: isToday ? '#fff' : textMuted, opacity: isToday ? 0.85 : 1 }}
              >
                {new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </span>
              <span
                className="text-[10px] font-black mt-0.5"
                style={{ color: isToday ? '#fff' : textPrimary }}
              >
                {new Date(`${day}T00:00:00`).getDate()}
              </span>
            </div>
          )
        })}

        {wKind === 'installers' && (
          <>
            <div
              className="flex items-center justify-center px-1 py-1.5 rounded-md"
              style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}
            >
              <span className="text-[9px] font-bold uppercase tracking-widest text-center" style={{ color: textMuted }}>TW</span>
            </div>
            <div
              className="flex items-center justify-center px-1 py-1.5 rounded-md"
              style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}
            >
              <span className="text-[9px] font-bold uppercase tracking-widest text-center" style={{ color: textMuted }}>CLN</span>
            </div>
          </>
        )}

        <div
          className="flex items-center justify-center px-1 py-1.5 rounded-md"
          style={{ backgroundColor: inputBg, border: `1px solid ${border}` }}
        >
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>REMARKS</span>
        </div>
      </div>

      {/* Person rows */}
      {wRows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 gap-3 rounded-lg"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        >
          <Users className="w-10 h-10 opacity-20" style={{ color: textMuted }} />
          <p className="text-sm font-semibold" style={{ color: textMuted }}>No people yet — add a row to start</p>
        </div>
      ) : (
        wRows.map((person, idx) => {
          return (
            <div
              key={person.id}
              className="grid mb-1.5 gap-1 items-stretch"
              style={{ gridTemplateColumns: `180px repeat(7, 1fr)${wKind === 'installers' ? ' 80px 80px' : ''} 1fr` }}
            >
              {/* Name card */}
              <div
                className="rounded-md p-2 flex flex-col justify-between h-full relative"
                style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              >
                {/* Overlay Trash Button */}
                <button
                  type="button"
                  onClick={() => wRemovePerson(person.id)}
                  className="absolute top-3 right-3 p-1 rounded bg-black/40 hover:bg-black/60 text-white transition-colors z-10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Photo holder */}
                <div
                  className="relative group cursor-pointer w-full h-[120px] rounded border overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl font-black"
                  style={{ borderColor: border }}
                  onClick={() => document.getElementById(`w-photo-file-${person.id}`)?.click()}
                  title="Click to upload profile photo (Max 10MB)"
                >
                  {person.photoUrl ? (
                    <img src={person.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Users className="w-6 h-6 opacity-30" style={{ color: textMuted }} />
                      <span className="text-[10px] font-bold tracking-wider" style={{ color: textMuted }}>UPLOAD</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-bold text-white transition-opacity select-none">
                    CHANGE PHOTO
                  </div>
                  <input
                    type="file"
                    id={`w-photo-file-${person.id}`}
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) {
                        wHandlePhotoUpload(person.id, file)
                      }
                    }}
                  />
                </div>

                {/* Name & Role Note Inputs */}
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-black shrink-0" style={{ color: textMuted }}>{idx + 1}</span>
                    <input
                      value={person.name}
                      onChange={e => wUpdatePerson(person.id, { name: e.target.value.toUpperCase() })}
                      placeholder={wKind === 'drivers' ? 'Driver name' : (isTaguigServices ? 'Technician name' : 'Installer name')}
                      className="bg-transparent outline-none text-xs font-bold uppercase w-full border-b border-transparent hover:border-slate-300 focus:border-slate-500 transition-colors"
                      style={{ color: textPrimary }}
                    />
                  </div>
                  <input
                    value={person.roleNote}
                    onChange={e => wUpdatePerson(person.id, { roleNote: e.target.value.toUpperCase() })}
                    placeholder="Role/Note"
                    className="bg-transparent outline-none text-[9px] font-semibold uppercase w-full pl-4 border-b border-transparent hover:border-slate-300 focus:border-slate-500 transition-colors"
                    style={{ color: textMuted }}
                  />
                </div>
              </div>

              {/* Day cells */}
              {wDays.map(day => {
                const cell = person.days[day] || { status: 'WITH SCHED' as WDayStatus, note: '', units: '' }
                const theme = wGetStatusTheme(cell.status, isLight)

                return (
                  <div
                    key={day}
                    className="rounded-md overflow-hidden flex flex-col h-full transition-all duration-150"
                    style={{ border: `1.5px solid ${theme.border}`, backgroundColor: theme.bg }}
                  >
                    {/* Status Select header */}
                    <div
                      className="px-1 py-1 flex items-center justify-center border-b"
                      style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}
                    >
                      <select
                        value={cell.status}
                        onChange={e => wUpdateDay(person.id, day, { status: e.target.value as WDayStatus })}
                        className="w-full text-center text-[9px] font-black uppercase outline-none cursor-pointer bg-transparent"
                        style={{ color: theme.headerText }}
                      >
                        {W_STATUS_OPTIONS.map(s => (
                          <option key={s} value={s} style={{ color: '#111', backgroundColor: '#fff' }}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Note text area */}
                    <div className="flex-1 p-1">
                      <textarea
                        value={cell.note}
                        onChange={e => wUpdateDay(person.id, day, { note: e.target.value.toUpperCase() })}
                        placeholder="Note"
                        rows={2}
                        className={`w-full resize-none bg-transparent outline-none text-[9px] font-bold uppercase leading-tight ${cell.status === 'PENDING' ? 'placeholder-slate-400' : 'placeholder-white/60'}`}
                        style={{ color: theme.text }}
                      />
                    </div>

                    {/* Units input bottom bar */}
                    <div
                      className="flex items-center"
                      style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: theme.unitBg }}
                    >
                      <span className="pl-1.5 text-[8px] font-black select-none" style={{ color: theme.unitText, opacity: 0.7 }}>QTY:</span>
                      <input
                        value={cell.units}
                        onChange={e => wUpdateDay(person.id, day, { units: e.target.value })}
                        className="w-full text-center text-xs font-black outline-none py-0.5 bg-transparent"
                        style={{ color: theme.unitText }}
                      />
                    </div>
                  </div>
                )
              })}

              {/* Installers: TW + CLN */}
              {wKind === 'installers' && (
                <>
                  <div
                    className="rounded-md overflow-hidden h-full flex flex-col"
                    style={{ border: `1px solid ${border}`, backgroundColor: cardBg }}
                  >
                    <div
                      className="px-2 py-1 text-[9px] font-bold uppercase text-center border-b"
                      style={{ backgroundColor: inputBg, color: textMuted, borderColor: border }}
                    >
                      TW
                    </div>
                    <textarea
                      value={person.totalUnitsTeamWork}
                      onChange={e => wUpdatePerson(person.id, { totalUnitsTeamWork: e.target.value })}
                      className="w-full flex-1 resize-none bg-transparent outline-none p-1.5 text-xs font-bold"
                      style={{ color: textPrimary, minHeight: '48px' }}
                    />
                  </div>

                  <div
                    className="rounded-md overflow-hidden h-full flex flex-col"
                    style={{ border: `1px solid ${border}`, backgroundColor: cardBg }}
                  >
                    <div
                      className="px-2 py-1 text-[9px] font-bold uppercase text-center border-b"
                      style={{ backgroundColor: inputBg, color: textMuted, borderColor: border }}
                    >
                      CLN
                    </div>
                    <textarea
                      value={person.totalUnitsCleaning}
                      onChange={e => wUpdatePerson(person.id, { totalUnitsCleaning: e.target.value })}
                      className="w-full flex-1 resize-none bg-transparent outline-none p-1.5 text-xs font-bold"
                      style={{ color: textPrimary, minHeight: '48px' }}
                    />
                  </div>
                </>
              )}

              {/* Remarks */}
              <div
                className="rounded-md overflow-hidden h-full flex flex-col"
                style={{ border: `1px solid ${border}`, backgroundColor: cardBg }}
              >
                <div
                  className="px-2 py-1 text-[9px] font-bold uppercase border-b"
                  style={{ backgroundColor: inputBg, color: textMuted, borderColor: border }}
                >
                  Remarks
                </div>
                <textarea
                  value={person.remarks}
                  onChange={e => wUpdatePerson(person.id, { remarks: e.target.value.toUpperCase() })}
                  className="w-full flex-1 resize-none bg-transparent outline-none p-1.5 text-xs font-semibold uppercase"
                  style={{ color: textPrimary, minHeight: '48px' }}
                />
              </div>
            </div>
          )
        })
      )}

      {/* Save button at the bottom */}
      {wRows.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSaveWeeklySchedule}
            className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 shadow-md cursor-pointer"
            style={{ backgroundColor: currentTheme.accent }}
            disabled={loadingWeekly}
          >
            {loadingWeekly ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {loadingWeekly ? 'Saving to Database...' : 'Save Weekly Schedule'}
          </button>
        </div>
      )}

      {/* Month label at bottom */}
      <div className="mt-4 text-center">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>
          {wFormatDay(wDays[0])} — {wFormatDay(wDays[6])}
        </span>
      </div>
    </div>
  )
}
