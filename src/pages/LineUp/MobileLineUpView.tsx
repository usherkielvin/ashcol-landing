import React from 'react'
import {
  Truck, User, Clock, MapPin, MessageSquare, ChevronDown, Trash2, Plus, X, Loader2
} from 'lucide-react'
import type { LineUpRow, BranchTheme } from './types'
import { englishLabel, getRemarkBadge } from './types'
import { EmployeeNameLink } from '../../components/EmployeeNameLink'

interface MobileLineUpViewProps {
  rows: LineUpRow[]
  date: string
  branchName: string
  isTaguigServices: boolean
  currentTheme: BranchTheme
  isLight: boolean
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  canEdit: boolean
  loading: boolean
  showcaseOpen: boolean
  lineupNotes: string
  totalUnits: number
  totalSurvey: number
  totalDismantle: number
  totalCleaning: number
  scanError: string
  setScanError: (err: string) => void
  scanPreview: string | null
  setScanPreview: (p: string | null) => void
  expandedCard: string | null
  setExpandedCard: (id: string | null | ((prev: string | null) => string | null)) => void
  editingCell: { rowId: string; field: keyof LineUpRow } | null
  setEditingCell: (cell: { rowId: string; field: keyof LineUpRow } | null) => void
  tempValue: string
  setTempValue: (v: string) => void
  handleAddRow: () => void
  handleSaveAll: () => Promise<void>
  handleUpdateNotes: (notes: string) => void
  handleSaveNotes: () => Promise<void>
  saveCell: (row: LineUpRow, field: keyof LineUpRow, val: string, shouldClose?: boolean) => Promise<void>
  handleDelete: (row: LineUpRow) => void
  finalVehicleOptions: string[]
  finalDriverOptions: string[]
  finalInstallerOptions: string[]
  finalNegotiatorOptions: string[]
  finalRouteOptions: string[]
  finalRemarksOptions: string[]
  captureAreaRef: React.RefObject<HTMLDivElement | null>
  getVehiclePlate: (service: string) => string
  getVehicleCodingStatus: (service: string, time?: string) => { isCodingToday: boolean; isRestricted: boolean } | null
}

export const MobileLineUpView: React.FC<MobileLineUpViewProps> = ({
  rows,
  date,
  branchName,
  isTaguigServices,
  currentTheme,
  isLight,
  cardBg,
  border,
  textPrimary,
  textMuted,
  inputBg,
  inputBorder,
  canEdit,
  loading,
  showcaseOpen,
  lineupNotes,
  totalUnits,
  totalSurvey,
  totalDismantle,
  totalCleaning,
  scanError,
  setScanError,
  scanPreview,
  setScanPreview,
  expandedCard,
  setExpandedCard,
  editingCell,
  setEditingCell,
  tempValue,
  setTempValue,
  handleAddRow,
  handleSaveAll,
  handleUpdateNotes,
  handleSaveNotes,
  saveCell,
  handleDelete,
  finalVehicleOptions,
  finalDriverOptions,
  finalInstallerOptions,
  finalNegotiatorOptions,
  finalRouteOptions,
  finalRemarksOptions,
  captureAreaRef,
  getVehiclePlate,
  getVehicleCodingStatus,
}) => {
  const renderMobileCell = (
    row: LineUpRow,
    field: keyof LineUpRow,
    label: string,
    icon: React.ReactNode,
    options: string[],
    full = false,
    selectOnly = false
  ) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field
    const value = (row[field] as string) || ''

    const handleBlur = () => {
      void saveCell(row, field, tempValue)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        void saveCell(row, field, tempValue)
      } else if (e.key === 'Escape') {
        setEditingCell(null)
      }
    }

    const cellBg = isLight ? '#ffffff' : '#0F172A'

    if (isEditing) {
      const datalistId = `m-list-${field}-${row.id}`
      if (selectOnly) {
        return (
          <div className={`p-3 flex flex-col gap-1 ${full ? 'col-span-2' : ''}`} style={{ backgroundColor: cellBg }}>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
              {icon} {label}
            </div>
            <select
              value={tempValue}
              autoFocus
              onChange={e => {
                setTempValue(e.target.value)
                void saveCell(row, field, e.target.value)
              }}
              onBlur={handleBlur}
              className="w-full px-2 py-1 text-xs font-semibold rounded border outline-none mt-1"
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              <option value="">Select...</option>
              {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )
      }
      return (
        <div className={`p-3 flex flex-col gap-1 ${full ? 'col-span-2' : ''}`} style={{ backgroundColor: cellBg }}>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
            {icon} {label}
          </div>
          <input
            list={datalistId}
            value={tempValue}
            onChange={e => setTempValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onFocus={e => {
              const len = e.currentTarget.value.length
              e.currentTarget.setSelectionRange(len, len)
            }}
            onDoubleClick={e => e.stopPropagation()}
            autoFocus
            className="w-full px-2 py-1 text-xs font-semibold rounded border outline-none mt-1"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          />
          {options.length > 0 && (
            <datalist id={datalistId}>
              {options.map(opt => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          )}
        </div>
      )
    }

    return (
      <div
        onClick={() => {
          if (canEdit) {
            setEditingCell({ rowId: row.id, field })
            setTempValue(value)
          }
        }}
        className={`p-3 flex flex-col gap-1 ${full ? 'col-span-2' : ''} ${canEdit ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : ''} transition-colors`}
        style={{ backgroundColor: cellBg }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
          {icon} {label}
        </div>
        <div className="text-xs font-bold leading-relaxed" style={{ color: textPrimary }}>
          {(field === 'driverName' || field === 'installerName') ? (
            value ? <EmployeeNameLink nameOrId={value} /> : <span style={{ color: textMuted, fontStyle: 'italic', fontSize: '11px' }}>empty</span>
          ) : field === 'remarks' && /\b(DONE|INSTALL|INSTALLED)\b/i.test(value) ? (
            <span style={{ color: '#16a34a', fontWeight: 800 }}>{value}</span>
          ) : (
            value || <span style={{ color: textMuted, fontStyle: 'italic', fontSize: '11px' }}>empty</span>
          )}
          {field === 'service' && getVehiclePlate(value) && (
            <>
              <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {getVehiclePlate(value)}
              </span>
              {getVehicleCodingStatus(value, row.driverTime || row.installerTime)?.isCodingToday && (
                getVehicleCodingStatus(value, row.driverTime || row.installerTime)?.isRestricted ? (
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
      </div>
    )
  }

  if (showcaseOpen) {
    return (
      <div
        ref={captureAreaRef}
        className="lineup-showcase-sheet mx-auto shadow-xl rounded-xl overflow-hidden"
        style={{
          width: '100%',
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
        }}
      >
        <div style={{ background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`, padding: '12px 16px', textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px', textTransform: 'uppercase' }}>
            TEAM {branchName ? branchName.toUpperCase() : 'FIELD'} LINE UP
          </div>
        </div>

        <div style={{ backgroundColor: isLight ? '#f1f5f9' : '#0b1628', padding: '6px 12px', textAlign: 'center', borderBottom: `1px solid ${isLight ? '#cbd5e1' : '#334155'}` }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' }}>{englishLabel(date)}</div>
        </div>

        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                {['SERVICE', 'DRIVER', 'DRIVER IN', isTaguigServices ? 'TECHNICIAN' : 'INSTALLER', isTaguigServices ? 'TECHNICIAN IN' : 'INSTALLER IN', 'ROUTE', 'REMARKS'].map(label => {
                  const showcaseHeaderBg = isLight ? currentTheme.accentLight : currentTheme.accent + '20'
                  const showcaseHeaderColor = isLight ? currentTheme.accentDark : currentTheme.accent
                  return (
                    <th
                      key={label}
                      style={{
                        padding: '10px 8px',
                        backgroundColor: showcaseHeaderBg,
                        border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                        color: showcaseHeaderColor,
                        fontSize: '11px',
                        fontWeight: 850,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: textMuted, fontSize: '12px' }}>
                    No schedule entries
                  </td>
                </tr>
              ) : rows.map((row, idx) => (
                <tr key={row.id} style={{ backgroundColor: idx % 2 === 0 ? (isLight ? '#ffffff' : '#1E293B') : (isLight ? '#f8fafc' : '#162031') }}>
                  {[
                    row.service || '-',
                    row.driverName || '-',
                    row.driverTime || '-',
                    row.installerName || '-',
                    row.installerTime || '-',
                    row.route || '-',
                    row.remarks || '-',
                  ].map((value, cellIdx) => (
                    <td
                      key={cellIdx}
                      style={{
                        padding: '10px 8px',
                        border: `3px solid ${isLight ? '#000000' : '#475569'}`,
                        color: textPrimary,
                        fontSize: (cellIdx === 1 || cellIdx === 3) ? '12px' : (cellIdx === 2 || cellIdx === 4) ? '9px' : '11px',
                        fontWeight: (cellIdx === 1 || cellIdx === 3) ? 800 : (cellIdx === 2 || cellIdx === 4) ? 500 : cellIdx === 0 ? 800 : 600,
                        textAlign: cellIdx >= 5 ? 'left' : 'center',
                        whiteSpace: 'nowrap',
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
                      ) : value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(lineupNotes || rows.length > 0) && (
          <div
            className="flex flex-col gap-4 p-4"
            style={{
              borderTop: `1px solid ${border}`,
              backgroundColor: isLight ? '#f8fafc' : '#0F172A',
            }}
          >
            <div style={{ color: '#EF4444', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'pre-line' }}>
              {lineupNotes}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['INSTALLATION', totalUnits, '#10B981'],
                ['SURVEY', totalSurvey, '#D97706'],
                ['SERVICE / DISMANTLE', totalDismantle, '#F43F5E'],
                ['CLEANING', totalCleaning, '#0D9488'],
              ].map(([label, value, color]) => (
                <div
                  key={String(label)}
                  style={{
                    border: `1px solid ${border}`,
                    backgroundColor: cardBg,
                    padding: '10px',
                    borderRadius: '6px',
                  }}
                >
                  <div style={{ color: String(color), fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ color: String(color), fontSize: '18px', fontWeight: 900, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {scanError && (
        <div
          className="mx-4 mt-2 mb-1 px-3 py-2 rounded-xl flex items-center justify-between gap-2"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <span className="text-xs font-semibold text-red-400">{scanError}</span>
          <button onClick={() => setScanError('')}><X className="w-3.5 h-3.5 text-red-400" /></button>
        </div>
      )}

      {scanPreview && (
        <div
          className="mx-4 mt-2 mb-1 px-3 py-2 rounded-xl flex items-center gap-3"
          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}
        >
          <img src={scanPreview} alt="Scanned" className="h-10 w-16 object-cover rounded-lg" />
          <span className="text-xs font-semibold flex-1" style={{ color: textMuted }}>Scanned preview</span>
          <button onClick={() => setScanPreview(null)}><X className="w-3.5 h-3.5" style={{ color: textMuted }} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: textMuted }} />
            <p className="text-sm" style={{ color: textMuted }}>Loading…</p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div
          className="rounded-xl flex flex-col items-center justify-center py-16 gap-3"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        >
          <Truck className="w-8 h-8" style={{ color: currentTheme.accent, opacity: 0.4 }} />
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: textPrimary }}>No schedule yet</p>
            <p className="text-xs mt-1" style={{ color: textMuted }}>{branchName ? `${branchName} · ` : ''}{englishLabel(date)}</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow"
              style={{ backgroundColor: currentTheme.accent }}
            >
              <Plus className="w-4 h-4" /> Add entry
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, idx) => {
            const badge = getRemarkBadge(row, currentTheme, isLight)
            const isExpanded = expandedCard === row.id
            const accentColor = badge?.color ?? currentTheme.accent

            return (
              <div
                key={row.id}
                className="lineup-mobile-card relative rounded-xl"
                style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              >
                <div className="mobile-card-accent" style={{ backgroundColor: accentColor }} />
                <button
                  type="button"
                  className="w-full flex items-start gap-3 px-4 py-3 pl-5 text-left"
                  onClick={() => setExpandedCard(isExpanded ? null : row.id)}
                >
                  <span className="text-xs font-medium tabular-nums shrink-0 pt-0.5" style={{ color: textMuted }}>{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold" style={{ color: textPrimary }}>{row.service || '—'}</span>
                        {getVehiclePlate(row.service) && (
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            {getVehiclePlate(row.service)}
                          </span>
                        )}
                        {getVehicleCodingStatus(row.service, row.driverTime || row.installerTime)?.isCodingToday && (
                          getVehicleCodingStatus(row.service, row.driverTime || row.installerTime)?.isRestricted ? (
                            <span className="bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase mt-1 inline-flex items-center gap-0.5 border border-rose-200/50 dark:border-rose-900/30 animate-pulse w-fit">
                              ⚠️ Coding
                            </span>
                          ) : (
                            <span className="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase mt-1 inline-flex items-center gap-0.5 border border-sky-200/50 dark:border-sky-900/30 w-fit">
                              Coding (10AM+)
                            </span>
                          )
                        )}
                      </div>
                      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
                    </div>

                    <p className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>
                      {row.route || 'No route'}
                    </p>

                    {badge && (
                      <span
                        className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ color: badge.color, backgroundColor: badge.bg }}
                      >
                        {badge.label}
                      </span>
                    )}

                    {(row.driverName || row.installerName || row.negotiator) && (
                      <p className="text-xs mt-1 truncate" style={{ color: textMuted }}>
                        {row.driverName && <span style={{ color: '#3B82F6' }}>{row.driverName} {row.driverTime}</span>}
                        {row.driverName && row.installerName && ' · '}
                        {row.installerName && <span style={{ color: currentTheme.accent }}>{row.installerName} {row.installerTime}</span>}
                        {((row.driverName || row.installerName) && row.negotiator) && ' · '}
                        {row.negotiator && <span style={{ color: '#F59E0B' }}>Negotiator: {row.negotiator}</span>}
                      </p>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${border}` }}>
                    <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: border }}>
                      {renderMobileCell(row, 'service', 'Service', <Truck className="w-3 h-3" />, finalVehicleOptions, true)}
                      {renderMobileCell(row, 'driverName', 'Driver', <User className="w-3 h-3" />, finalDriverOptions)}
                      {renderMobileCell(row, 'driverTime', 'Driver in', <Clock className="w-3 h-3" />, ['8:00AM', '7:00AM', '6:00AM', '9:00AM'])}
                      {renderMobileCell(row, 'installerName', isTaguigServices ? 'Technician' : 'Installer', <User className="w-3 h-3" />, finalInstallerOptions, false, true)}
                      {renderMobileCell(row, 'installerTime', isTaguigServices ? 'Technician in' : 'Installer in', <Clock className="w-3 h-3" />, ['7:00AM', '8:00AM', '6:00AM', '9:00AM'])}
                      {renderMobileCell(row, 'negotiator', 'Negotiator', <User className="w-3 h-3" />, finalNegotiatorOptions, true, true)}
                      {renderMobileCell(row, 'route', 'Route', <MapPin className="w-3 h-3" />, finalRouteOptions, true)}
                      {renderMobileCell(row, 'remarks', 'Remarks', <MessageSquare className="w-3 h-3" />, finalRemarksOptions, true)}
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: `1px solid ${border}` }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCell({ rowId: row.id, field: 'service' })
                            setTempValue(row.service || '')
                          }}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white"
                          style={{ backgroundColor: '#3B82F6' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="px-3 py-2 rounded-lg text-xs font-medium"
                          style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Mobile Notes Card */}
      {rows.length > 0 && (
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <span className="text-[11px] font-medium" style={{ color: textMuted }}>Notes</span>
          {canEdit ? (
            <textarea
              value={lineupNotes}
              onChange={e => handleUpdateNotes(e.target.value)}
              onBlur={handleSaveNotes}
              placeholder="Team notes (e.g. day off, reminders)…"
              className="w-full text-xs outline-none resize-none min-h-[72px] no-scrollbar rounded-lg px-3 py-2"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            />
          ) : (
            <div className="text-xs whitespace-pre-line" style={{ color: textPrimary }}>
              {lineupNotes || '—'}
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="lineup-sticky-save no-print flex items-center gap-2">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={handleSaveAll}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white shadow-md transition-all duration-150 active:scale-95"
              style={{ background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})` }}
            >
              Save
            </button>
          )}
          <button
            type="button"
            onClick={handleAddRow}
            title="Add row"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-white shadow-md transition-all duration-150 active:scale-95"
            style={{ backgroundColor: '#3B82F6' }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  )
}
