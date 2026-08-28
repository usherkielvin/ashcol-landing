import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, Copy, Check, X, Loader2, Maximize2 } from 'lucide-react'
import type { LineUpRow, WPersonSchedule, BranchTheme, WDayStatus } from './types'
import {
  wFormatWeekLabel,
  wFormatDay,
  englishLabel,
  W_STATUS_OPTIONS,
  wStatusDot,
  wGetStatusTheme,
} from './types'

interface ShowcaseModalProps {
  showcaseOpen: boolean
  setShowcaseOpen: (o: boolean) => void
  activeTab: 'field' | 'weekly' | 'vehicles'
  wKind: 'drivers' | 'installers'
  wDays: string[]
  wRows: WPersonSchedule[]
  rows: LineUpRow[]
  date: string
  branchName: string
  isTaguigServices: boolean
  currentTheme: BranchTheme
  isLight: boolean
  border: string
  textPrimary: string
  textMuted: string
  lineupNotes: string
  totalUnits: number
  totalSurvey: number
  totalDismantle: number
  totalCleaning: number
  exportingPng: boolean
  copyingImage: boolean
  copiedImage: boolean
  captureAreaRef: React.RefObject<HTMLDivElement | null>
  getVehiclePlate: (service: string) => string
  getVehicleCodingStatus: (service: string, time?: string) => { isCodingToday: boolean; isRestricted: boolean } | null
  handleExportShowcasePng: () => void
  handleCopyShowcaseImage: () => void
}

export const ShowcaseModal: React.FC<ShowcaseModalProps> = ({
  showcaseOpen,
  setShowcaseOpen,
  activeTab,
  wKind,
  wDays,
  wRows,
  rows,
  date,
  branchName,
  isTaguigServices,
  currentTheme,
  isLight,
  border,
  textPrimary,
  textMuted,
  lineupNotes,
  totalUnits,
  totalSurvey,
  totalDismantle,
  totalCleaning,
  exportingPng,
  copyingImage,
  copiedImage,
  captureAreaRef,
  getVehiclePlate,
  getVehicleCodingStatus,
  handleExportShowcasePng,
  handleCopyShowcaseImage,
}) => {
  useEffect(() => {
    if (!showcaseOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowcaseOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showcaseOpen, setShowcaseOpen])

  if (!showcaseOpen) return null

  return createPortal(
    <div
      className="lineup-showcase-overlay fixed inset-0 z-[999999] overflow-auto w-full h-full"
      style={{ backgroundColor: isLight ? '#f8fafc' : '#030712' }}
    >
      <div className="min-h-screen flex flex-col">
        <div
          className="no-print sticky top-0 z-50 flex items-center justify-between gap-3 px-5 py-3 shadow-md"
          style={{
            backgroundColor: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.96)',
            borderBottom: `1px solid ${border}`,
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="min-w-0 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: currentTheme.accent }} />
              <div className="text-xs sm:text-sm font-black uppercase tracking-wider" style={{ color: currentTheme.accent }}>
                {activeTab === 'weekly' ? 'Weekly Schedule Showcase' : 'Daily Schedule Showcase'}
              </div>
            </div>
            <span className="hidden md:inline text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400">
              Fullscreen Mode
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportShowcasePng}
              disabled={exportingPng}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 shadow-sm cursor-pointer"
              style={{ backgroundColor: currentTheme.accent }}
              title="Download schedule table as PNG image"
            >
              {exportingPng ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Export PNG</span>
            </button>
            <button
              type="button"
              onClick={handleCopyShowcaseImage}
              disabled={copyingImage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50 cursor-pointer"
              style={{
                backgroundColor: isLight ? '#ffffff' : '#1e293b',
                borderColor: isLight ? '#cbd5e1' : '#334155',
                color: textPrimary,
              }}
              title="Copy schedule table image to clipboard"
            >
              {copiedImage ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedImage ? 'Copied!' : 'Copy Image'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowcaseOpen(false)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm active:scale-95 cursor-pointer hover:bg-red-600"
              style={{ backgroundColor: '#ef4444' }}
              title="Exit Showcase (Press ESC)"
            >
              <X className="w-4 h-4" />
              <span>Exit Showcase</span>
              <kbd className="hidden sm:inline ml-1 px-1 py-0.5 text-[9px] font-mono bg-black/20 rounded">ESC</kbd>
            </button>
          </div>
        </div>

        <div className="p-4 md:p-8 flex-1 flex flex-col items-center justify-start">
          <div
            ref={captureAreaRef}
            style={{
              width: '100%',
              maxWidth: '1900px',
              margin: '0 auto',
              backgroundColor: isLight ? '#ffffff' : '#07111f',
              border: 'none',
              borderRadius: 0,
              boxShadow: isLight
                ? '0 25px 50px -12px rgba(15, 23, 42, 0.12)'
                : '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
              overflow: 'hidden',
            }}
          >
            {/* Header Banner */}
            <div
              style={{
                background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`,
                padding: '24px 24px 20px',
                color: '#ffffff',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 'clamp(24px, 2.6vw, 42px)',
                  fontWeight: 950,
                  textTransform: 'uppercase',
                  letterSpacing: '0.01em',
                  lineHeight: 1.15,
                }}
              >
                {activeTab === 'weekly'
                  ? `TEAM ${branchName ? branchName.toUpperCase() : 'FIELD'} WEEKLY LINE UP`
                  : `TEAM ${branchName ? branchName.toUpperCase() : 'FIELD'} LINE UP`}
              </div>
              <div
                style={{
                  fontSize: 'clamp(14px, 1.25vw, 20px)',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  marginTop: '6px',
                  opacity: 0.95,
                }}
              >
                {activeTab === 'weekly' ? wFormatWeekLabel(wDays) : englishLabel(date)}
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 'clamp(14px, 1.15vw, 18px)',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: isLight ? '#f1f5f9' : '#0f172a' }}>
                    {activeTab === 'weekly' ? (
                      <>
                        <th style={{ padding: '20px 18px', border: '1px solid #000000', fontSize: 'clamp(13px, 1.0vw, 16px)', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', minWidth: 200, color: textPrimary }}>
                          {wKind === 'drivers' ? 'Driver' : (isTaguigServices ? 'Technician' : 'Installer')}
                        </th>
                        {wDays.map((d) => (
                          <th key={d} style={{ padding: '16px 12px', border: '1px solid #000000', fontSize: 'clamp(12px, 0.95vw, 15px)', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', minWidth: 140, color: textPrimary }}>
                            <div>{new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</div>
                            <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.85, marginTop: '2px', color: textMuted }}>
                              {wFormatDay(d)}
                            </div>
                          </th>
                        ))}
                        <th style={{ padding: '20px 14px', border: '1px solid #000000', fontSize: 'clamp(12px, 0.95vw, 15px)', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', minWidth: 110, color: textPrimary }}>
                          Total Units
                        </th>
                        {wKind === 'installers' && (
                          <>
                            <th style={{ padding: '20px 14px', border: '1px solid #000000', fontSize: 'clamp(12px, 0.95vw, 15px)', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', minWidth: 130, color: textPrimary }}>
                              Total Team Work
                            </th>
                            <th style={{ padding: '20px 14px', border: '1px solid #000000', fontSize: 'clamp(12px, 0.95vw, 15px)', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', minWidth: 130, color: textPrimary }}>
                              Total Cleaning
                            </th>
                          </>
                        )}
                        <th style={{ padding: '20px 18px', border: '1px solid #000000', fontSize: 'clamp(13px, 1.0vw, 16px)', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', minWidth: 260, color: textPrimary }}>
                          Remarks
                        </th>
                      </>
                    ) : (
                      ['Vehicle', 'Driver', 'Driver In', isTaguigServices ? 'Technician' : 'Installer', isTaguigServices ? 'Technician In' : 'Installer In', 'Negotiator', 'Route', 'Remarks'].map((h, i) => (
                        <th
                          key={h + i}
                          style={{
                            padding: i >= 6 ? '20px 20px' : '20px 14px',
                            border: '1px solid #000000',
                            fontSize: 'clamp(13px, 1.05vw, 17px)',
                            fontWeight: 950,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            textAlign: i >= 6 ? 'left' : 'center',
                            minWidth: i >= 6 ? 360 : 120,
                            color: textPrimary,
                          }}
                        >
                          {h}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activeTab === 'weekly' ? (
                    wRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={wKind === 'installers' ? 12 : 10}
                          style={{
                            padding: '120px 24px',
                            textAlign: 'center',
                            color: textMuted,
                            fontSize: 'clamp(18px, 1.6vw, 24px)',
                            fontWeight: 800,
                          }}
                        >
                          No {wKind} schedule entries for this week
                        </td>
                      </tr>
                    ) : (
                      wRows.map((person, pIdx) => {
                        const totalPersonUnits = wDays.reduce((sum, d) => {
                          const c = person.days[d]
                          return sum + (Number(c?.units) || 0)
                        }, 0)
                        return (
                          <tr
                            key={person.id}
                            style={{
                              backgroundColor: pIdx % 2 === 0
                                ? (isLight ? '#ffffff' : '#07111f')
                                : (isLight ? '#f8fafc' : '#0b1628'),
                            }}
                          >
                            {/* Person Name */}
                            <td
                              style={{
                                padding: '24px 18px',
                                border: '1px solid #000000',
                                color: textPrimary,
                                fontSize: 'clamp(17px, 1.4vw, 24px)',
                                fontWeight: 950,
                                verticalAlign: 'middle',
                              }}
                            >
                              {person.name}
                            </td>
                            {/* Days */}
                            {wDays.map(d => {
                              const cell = person.days[d] || { status: 'PENDING' as WDayStatus, note: '', units: '' }
                              const cellTheme = wGetStatusTheme(cell.status, isLight)
                              return (
                                <td
                                  key={d}
                                  style={{
                                    padding: '16px 12px',
                                    border: '1px solid #000000',
                                    backgroundColor: cellTheme.bg,
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  <div className="flex flex-col items-center gap-1">
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 950,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em',
                                        color: cellTheme.headerText,
                                      }}
                                    >
                                      {cell.status || 'PENDING'}
                                    </span>
                                    {cell.note && (
                                      <div
                                        style={{
                                          fontSize: 'clamp(12px, 0.95vw, 15px)',
                                          fontWeight: 800,
                                          color: textPrimary,
                                          textAlign: 'center',
                                          lineHeight: 1.25,
                                          whiteSpace: 'pre-wrap',
                                        }}
                                      >
                                        {cell.note}
                                      </div>
                                    )}
                                    {cell.units && (
                                      <div
                                        style={{
                                          fontSize: '11px',
                                          fontWeight: 950,
                                          backgroundColor: cellTheme.unitBg,
                                          color: cellTheme.unitText,
                                          borderRadius: '2px',
                                          padding: '2px 4px',
                                          textAlign: 'center',
                                          marginTop: '2px',
                                        }}
                                      >
                                        QTY: {cell.units}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                            {/* Total Units */}
                            <td
                              style={{
                                padding: '24px 16px',
                                border: '1px solid #000000',
                                color: textPrimary,
                                fontSize: 'clamp(18px, 1.4vw, 26px)',
                                fontWeight: 950,
                                textAlign: 'center',
                                verticalAlign: 'middle',
                              }}
                            >
                              {totalPersonUnits}
                            </td>
                            {/* TW & CLN for installers */}
                            {wKind === 'installers' && (
                              <>
                                <td
                                  style={{
                                    padding: '24px 18px',
                                    border: '1px solid #000000',
                                    color: textPrimary,
                                    fontSize: 'clamp(14px, 1.1vw, 17px)',
                                    fontWeight: 700,
                                    textAlign: 'center',
                                    whiteSpace: 'pre-wrap',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {person.totalUnitsTeamWork || '—'}
                                </td>
                                <td
                                  style={{
                                    padding: '24px 18px',
                                    border: '1px solid #000000',
                                    color: textPrimary,
                                    fontSize: 'clamp(14px, 1.1vw, 17px)',
                                    fontWeight: 700,
                                    textAlign: 'center',
                                    whiteSpace: 'pre-wrap',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {person.totalUnitsCleaning || '—'}
                                </td>
                              </>
                            )}
                            {/* Remarks */}
                            <td
                              style={{
                                padding: '24px 20px',
                                border: '1px solid #000000',
                                color: textPrimary,
                                fontSize: 'clamp(14px, 1.1vw, 17px)',
                                fontWeight: 700,
                                textAlign: 'left',
                                whiteSpace: 'pre-wrap',
                                verticalAlign: 'middle',
                              }}
                            >
                              {person.remarks || '—'}
                            </td>
                          </tr>
                        )
                      })
                    )
                  ) : (
                    rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: '120px 24px',
                            textAlign: 'center',
                            color: textMuted,
                            fontSize: 'clamp(18px, 1.6vw, 24px)',
                            fontWeight: 800,
                          }}
                        >
                          No field schedule entries
                        </td>
                      </tr>
                    ) : rows.map((row, idx) => (
                      <tr key={row.id} style={{ backgroundColor: idx % 2 === 0 ? (isLight ? '#ffffff' : '#07111f') : (isLight ? '#f8fafc' : '#0b1628') }}>
                        {[
                          row.service || '-',
                          row.driverName || '-',
                          row.driverTime || '-',
                          row.installerName || '-',
                          row.installerTime || '-',
                          row.negotiator || '-',
                          row.route || '-',
                          row.remarks || '-',
                        ].map((value, cellIdx) => (
                          <td
                            key={cellIdx}
                            style={{
                              padding: cellIdx >= 6 ? '20px 20px' : '20px 14px',
                              border: '1px solid #000000',
                              color: textPrimary,
                              fontSize: (cellIdx === 1 || cellIdx === 3 || cellIdx === 5) ? 'clamp(17px, 1.45vw, 26px)' : (cellIdx === 2 || cellIdx === 4) ? 'clamp(12px, 1.0vw, 16px)' : cellIdx >= 6 ? 'clamp(16px, 1.2vw, 22px)' : 'clamp(16px, 1.3vw, 24px)',
                              fontWeight: (cellIdx === 1 || cellIdx === 3 || cellIdx === 5) ? 900 : cellIdx === 0 ? 850 : (cellIdx === 2 || cellIdx === 4 ? 500 : 700),
                              textAlign: cellIdx >= 6 ? 'left' : 'center',
                              lineHeight: 1.32,
                              verticalAlign: 'middle',
                              minWidth: cellIdx >= 6 ? 360 : 120,
                            }}
                          >
                            {cellIdx === 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="font-bold">{value}</span>
                                {getVehiclePlate(String(value)) && (
                                  <>
                                    <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                                      {getVehiclePlate(String(value))}
                                    </span>
                                    {getVehicleCodingStatus(String(value), row.driverTime || row.installerTime)?.isCodingToday && (
                                      getVehicleCodingStatus(String(value), row.driverTime || row.installerTime)?.isRestricted ? (
                                        <span className="bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase mt-1 inline-flex items-center gap-0.5 border border-rose-200/50 dark:border-rose-900/30 animate-pulse">
                                          ⚠️ Coding
                                        </span>
                                      ) : (
                                        <span className="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase mt-1 inline-flex items-center gap-0.5 border border-sky-200/50 dark:border-sky-900/30">
                                          Coding (10AM+)
                                        </span>
                                      )
                                    )}
                                  </>
                                )}
                              </div>
                            ) : cellIdx === 7 && /\b(DONE|INSTALL|INSTALLED)\b/i.test(String(value)) ? (
                              <span style={{ color: '#16a34a', fontWeight: 800 }}>{value}</span>
                            ) : value}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {activeTab === 'weekly' ? (
              <div
                style={{
                  padding: '22px 28px',
                  backgroundColor: isLight ? '#f8fafc' : '#0b1628',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: textMuted }}>Legend:</span>
                  {W_STATUS_OPTIONS.map(s => (
                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: textPrimary }}>
                      <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: wStatusDot(s), border: s === 'PENDING' ? `1.5px solid ${border}` : 'none' }} />
                      {s}
                    </span>
                  ))}
                </div>
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: textMuted, letterSpacing: '0.05em' }}>
                    {wFormatDay(wDays[0])} — {wFormatDay(wDays[6])}
                  </span>
                </div>
              </div>
            ) : (
              (lineupNotes || rows.length > 0) && (
                <div
                  className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5"
                  style={{
                    padding: '22px 28px',
                    backgroundColor: isLight ? '#f8fafc' : '#0b1628',
                  }}
                >
                  <div
                    style={{
                      color: '#EF4444',
                      fontSize: 'clamp(14px, 1.1vw, 19px)',
                      fontWeight: 950,
                      textTransform: 'uppercase',
                      whiteSpace: 'pre-line',
                      lineHeight: 1.45,
                    }}
                  >
                    {lineupNotes}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 md:min-w-[320px]">
                    {[
                      ['INSTALLATION', totalUnits, '#10B981'],
                      ['SURVEY', totalSurvey, '#D97706'],
                      ['SERVICE / DISMANTLE', totalDismantle, '#F43F5E'],
                      ['CLEANING', totalCleaning, '#0D9488'],
                    ].filter(([_, value]) => Number(value) > 0).map(([label, value, color]) => (
                      <div
                        key={String(label)}
                        style={{
                          border: '1px solid #000000',
                          backgroundColor: isLight ? '#ffffff' : '#07111f',
                          padding: '12px 18px',
                          borderRadius: '4px',
                          minWidth: '130px',
                        }}
                      >
                        <div style={{ color: String(color), fontSize: '12px', fontWeight: 950, textTransform: 'uppercase' }}>{label}</div>
                        <div style={{ color: String(color), fontSize: 'clamp(24px, 2.2vw, 34px)', fontWeight: 950, lineHeight: 1.2 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
