import React from 'react'
import { X, Save, Edit3, Trash2 } from 'lucide-react'
import type { LineUpRow, BranchTheme } from './types'
import { englishLabel, parseTimeInput } from './types'

interface EditableTableProps {
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
  lineupNotes: string
  totalUnits: number
  totalSurvey: number
  totalDismantle: number
  totalCleaning: number
  scanError: string
  setScanError: (err: string) => void
  scanPreview: string | null
  setScanPreview: (p: string | null) => void
  selectedRowId: string | null
  setSelectedRowId: (id: string | null | ((prev: string | null) => string | null)) => void
  editingCell: { rowId: string; field: keyof LineUpRow } | null
  setEditingCell: (cell: { rowId: string; field: keyof LineUpRow } | null) => void
  tempValue: string
  setTempValue: (v: string) => void
  activeMenu: { row: LineUpRow; x: number; y: number } | null
  setActiveMenu: (menu: { row: LineUpRow; x: number; y: number } | null) => void
  dragOverIndex: number | null
  dragSourceIndexRef: React.RefObject<number | null>
  handleDragStart: (e: React.DragEvent, index: number) => void
  handleDragOver: (e: React.DragEvent, index: number) => void
  handleDragEnd: () => void
  handleDrop: (e: React.DragEvent, index: number) => void
  handleUpdateNotes: (notes: string) => void
  handleSaveNotes: () => Promise<void>
  handleSaveAll: () => Promise<void>
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
  isNavigatingRef: React.RefObject<boolean>
}

const TIME_FIELDS: (keyof LineUpRow)[] = ['driverTime', 'installerTime']

export const EditableTable: React.FC<EditableTableProps> = ({
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
  lineupNotes,
  totalUnits,
  totalSurvey,
  totalDismantle,
  totalCleaning,
  scanError,
  setScanError,
  scanPreview,
  setScanPreview,
  selectedRowId,
  setSelectedRowId,
  editingCell,
  setEditingCell,
  tempValue,
  setTempValue,
  activeMenu,
  setActiveMenu,
  dragOverIndex,
  dragSourceIndexRef,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  handleDrop,
  handleUpdateNotes,
  handleSaveNotes,
  handleSaveAll,
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
  isNavigatingRef,
}) => {
  const thOrig = (label: string, _wide?: boolean) => (
    <th
      style={{
        border: '1px solid #000000',
        padding: '16px 12px',
        fontSize: '11px',
        fontWeight: 950,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        textAlign: 'center' as const,
        backgroundColor: isLight ? '#f8fafc' : '#0F172A',
        color: textPrimary,
        whiteSpace: 'normal',
        minWidth: label.includes(' IN') || label.includes('TIME') ? '80px' : undefined,
      }}
    >
      {label}
    </th>
  )

  const navigateCell = async (
    currentRow: LineUpRow,
    currentField: keyof LineUpRow,
    direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  ) => {
    if (isNavigatingRef) (isNavigatingRef as any).current = true
    void saveCell(currentRow, currentField, tempValue, false)

    const rowIndex = rows.findIndex(r => r.id === currentRow.id)
    if (rowIndex === -1) {
      if (isNavigatingRef) (isNavigatingRef as any).current = false
      return
    }

    const FIELDS: (keyof LineUpRow)[] = [
      'service', 'driverName', 'driverTime', 'installerName', 'installerTime', 'negotiator', 'route', 'remarks'
    ]
    const fieldIndex = FIELDS.indexOf(currentField)
    if (fieldIndex === -1) {
      if (isNavigatingRef) (isNavigatingRef as any).current = false
      return
    }

    let nextRowIndex = rowIndex
    let nextFieldIndex = fieldIndex

    if (direction === 'UP') {
      nextRowIndex = rowIndex - 1
    } else if (direction === 'DOWN') {
      nextRowIndex = rowIndex + 1
    } else if (direction === 'LEFT') {
      nextFieldIndex = fieldIndex - 1
    } else if (direction === 'RIGHT') {
      nextFieldIndex = fieldIndex + 1
    }

    if (nextRowIndex >= 0 && nextRowIndex < rows.length && nextFieldIndex >= 0 && nextFieldIndex < FIELDS.length) {
      const nextRow = rows[nextRowIndex]
      const nextField = FIELDS[nextFieldIndex]
      setEditingCell({ rowId: nextRow.id, field: nextField })
      setTempValue((nextRow[nextField] as string) || '')
    } else {
      setEditingCell(null)
    }

    setTimeout(() => {
      if (isNavigatingRef) (isNavigatingRef as any).current = false
    }, 50)
  }

  const renderEditableTd = (
    row: LineUpRow,
    field: keyof LineUpRow,
    options: string[],
    style: React.CSSProperties,
    placeholder = 'Click to edit...',
    selectOnly = false
  ) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field
    const value = (row[field] as string) || ''
    const isTimeField = TIME_FIELDS.includes(field)

    const handleBlur = () => {
      if (isNavigatingRef?.current) return
      const finalVal = isTimeField ? parseTimeInput(tempValue) : tempValue
      if (isTimeField && finalVal !== tempValue) setTempValue(finalVal)
      void saveCell(row, field, finalVal)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void navigateCell(row, field, 'DOWN')
      } else if (e.key === 'Tab') {
        e.preventDefault()
        void navigateCell(row, field, e.shiftKey ? 'LEFT' : 'RIGHT')
      } else if (e.key === 'Escape') {
        setEditingCell(null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        void navigateCell(row, field, 'UP')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        void navigateCell(row, field, 'DOWN')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        void navigateCell(row, field, 'LEFT')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        void navigateCell(row, field, 'RIGHT')
      }
    }

    if (!canEdit) {
      return (
        <td style={{ border: '1px solid #000000', padding: '12px 16px', ...style }}>
          {field === 'service' ? (
            <div className="flex flex-col items-center">
              <span>{value || '—'}</span>
              {getVehiclePlate(value) && (
                <>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
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
          ) : field === 'remarks' && /\b(DONE|INSTALL|INSTALLED)\b/i.test(value) ? (
            <span style={{ color: '#16a34a', fontWeight: 800 }}>{value}</span>
          ) : (
            value || '—'
          )}
        </td>
      )
    }

    if (isEditing) {
      const datalistId = `list-${field}-${row.id}`
      if (selectOnly) {
        return (
          <td
            style={{
              border: '1px solid #000000',
              padding: '2px 4px',
              ...style,
              boxShadow: 'inset 0 0 0 2px #10B981',
              backgroundColor: isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.05)',
            }}
          >
            <select
              value={tempValue}
              autoFocus
              onChange={e => {
                setTempValue(e.target.value)
                void saveCell(row, field, e.target.value)
              }}
              onBlur={handleBlur}
              className="w-full px-2 py-1.5 rounded border-none bg-transparent outline-none"
              style={{
                color: textPrimary,
                textAlign: style.textAlign,
                fontWeight: style.fontWeight,
                fontSize: style.fontSize,
              }}
            >
              <option value="">{placeholder}</option>
              {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </td>
        )
      }
      return (
        <td
          style={{
            border: '1px solid #000000',
            padding: '2px 4px',
            ...style,
            boxShadow: 'inset 0 0 0 2px #10B981',
            backgroundColor: isLight ? 'rgba(16,185,129,0.02)' : 'rgba(16,185,129,0.05)',
          }}
        >
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
            placeholder={placeholder}
            className="w-full px-2 py-1.5 rounded border-none bg-transparent outline-none"
            style={{
              color: textPrimary,
              textAlign: style.textAlign,
              fontWeight: style.fontWeight,
              fontSize: style.fontSize,
            }}
          />
          {options.length > 0 && (
            <datalist id={datalistId}>
              {options.map(opt => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          )}
        </td>
      )
    }

    return (
      <td
        onClick={() => {
          setSelectedRowId(row.id)
        }}
        onDoubleClick={() => {
          setEditingCell({ rowId: row.id, field })
          setTempValue(value)
        }}
        title="Double-click to edit"
        className="cursor-pointer transition-colors"
        style={{ border: '1px solid #000000', padding: '12px 16px', ...style }}
      >
        {field === 'service' ? (
          <div className="flex flex-col items-center">
            <span>{value || <span style={{ color: textMuted, fontStyle: 'italic', fontSize: '11px' }}>—</span>}</span>
            {getVehiclePlate(value) && (
              <>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
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
        ) : field === 'remarks' && /\b(DONE|INSTALL|INSTALLED)\b/i.test(value) ? (
          <span style={{ color: '#16a34a', fontWeight: 800 }}>{value}</span>
        ) : (
          value || <span style={{ color: textMuted, fontStyle: 'italic', fontSize: '11px' }}>—</span>
        )}
      </td>
    )
  }

  return (
    <>
      <div
        ref={captureAreaRef}
        className="rounded-xl overflow-hidden print-area shadow-xl shadow-slate-900/5"
        style={{ backgroundColor: cardBg }}
      >
        {/* Scan error / preview banners */}
        {scanError && (
          <div
            className="px-4 py-2 flex items-center justify-between gap-2"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderBottom: `1px solid rgba(239,68,68,0.2)` }}
          >
            <span className="text-xs font-semibold" style={{ color: '#EF4444' }}>{scanError}</span>
            <button onClick={() => setScanError('')} style={{ color: '#EF4444' }}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {scanPreview && (
          <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: `1px solid ${border}`, backgroundColor: inputBg }}>
            <img src={scanPreview} alt="Scanned lineup" className="h-14 w-24 object-cover rounded-lg border" style={{ borderColor: inputBorder }} />
            <span className="text-xs font-semibold" style={{ color: textMuted }}>Scanned image preview</span>
            <button onClick={() => setScanPreview(null)} className="ml-auto" style={{ color: textMuted }}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Command Center header — centered bold banner with branch name and date */}
        <div
          className="flex flex-col items-center justify-center px-6 py-5 shadow-sm text-center"
          style={{
            background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`,
            color: '#ffffff',
            border: 'none',
          }}
        >
          <div className="font-black uppercase tracking-wide text-lg md:text-2xl" style={{ color: '#ffffff', letterSpacing: '0.02em', lineHeight: 1.2 }}>
            TEAM {branchName ? branchName.toUpperCase() : '—'} LINE UP
          </div>
          <div className="text-xs md:text-sm font-bold uppercase tracking-wider mt-1 opacity-95" style={{ color: '#ffffff' }}>
            {englishLabel(date)}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <colgroup>
              <col style={{ width: '7%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                {thOrig('VEHICLE')}
                {thOrig('DRIVER')}
                {thOrig('DRIVER IN')}
                {thOrig(isTaguigServices ? 'TECHNICIAN' : 'INSTALLER')}
                {thOrig(isTaguigServices ? 'TECHNICIAN IN' : 'INSTALLER IN')}
                {thOrig('NEGOTIATOR')}
                {thOrig('ROUTE', true)}
                {thOrig('REMARKS', true)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: textMuted, fontSize: '13px' }}>
                    Loading deployment schedule…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ border: '1px solid #000000', padding: 0 }}>
                    <div
                      className="flex items-center justify-center p-10 text-center"
                      style={{
                        backgroundColor: isLight ? '#f8fafc' : 'rgba(6,11,24,0.4)',
                      }}
                    >
                      <div
                        style={{
                          color: textPrimary,
                          fontWeight: 800,
                          fontSize: '14px',
                        }}
                      >
                        No scheduled tickets today. Start building your schedule lineup for {englishLabel(date)}.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const isRowSelected = selectedRowId === row.id
                  const isEditingThis = editingCell?.rowId === row.id
                  const defaultBg = idx % 2 === 0 ? (isLight ? '#fcfdfd' : '#1e293b') : 'transparent'
                  const selectedBg = `${currentTheme.accent}22`
                  const hoverBgColor = isLight ? '#f8fafc' : '#0F172A'
                  const isDraggedOver = dragOverIndex === idx
                  const isSource = dragSourceIndexRef?.current === idx

                  let borderTopStyle = undefined
                  let borderBottomStyle = '1px solid #000000'

                  if (isDraggedOver && !isSource && dragSourceIndexRef?.current !== null) {
                    if (dragSourceIndexRef!.current! > idx) {
                      borderTopStyle = `3px solid ${currentTheme.accent}`
                    } else {
                      borderBottomStyle = `3px solid ${currentTheme.accent}`
                    }
                  }

                  return (
                    <tr
                      key={row.id}
                      draggable={canEdit && isRowSelected && !isEditingThis}
                      onDragStart={e => handleDragStart(e, idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      onDrop={e => handleDrop(e, idx)}
                      style={{
                        backgroundColor: (isRowSelected || isEditingThis) ? selectedBg : defaultBg,
                        borderTop: borderTopStyle,
                        borderBottom: borderBottomStyle,
                        cursor: canEdit ? (isRowSelected ? (dragSourceIndexRef?.current === idx ? 'grabbing' : 'grab') : 'pointer') : 'default',
                        outline: isRowSelected ? `2px solid ${currentTheme.accent}60` : 'none',
                        outlineOffset: '-1px',
                        position: 'relative',
                      }}
                      className="transition-colors"
                      onMouseEnter={e => {
                        if (!isRowSelected && !isEditingThis) e.currentTarget.style.backgroundColor = hoverBgColor
                      }}
                      onMouseLeave={e => {
                        if (!isRowSelected && !isEditingThis) e.currentTarget.style.backgroundColor = defaultBg
                      }}
                      onClick={e => {
                        if ((e.target as HTMLElement).closest('input,button,a,select')) return
                        if (!canEdit) return
                        setSelectedRowId(prev => (prev === row.id ? null : row.id))
                        if (editingCell && editingCell.rowId !== row.id) {
                          const activeRow = rows.find(r => r.id === editingCell.rowId)
                          if (activeRow) {
                            void saveCell(activeRow, editingCell.field, tempValue)
                          }
                        }
                      }}
                      onContextMenu={e => {
                        if ((e.target as HTMLElement).closest('input,button,a,select')) return
                        if (!canEdit) return
                        e.preventDefault()
                        setSelectedRowId(row.id)
                        setActiveMenu({
                          row,
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }}
                    >
                      {renderEditableTd(row, 'service', finalVehicleOptions, { textAlign: 'center', fontWeight: 950, fontSize: '13px', color: textPrimary })}
                      {renderEditableTd(row, 'driverName', finalDriverOptions, { textAlign: 'center', fontWeight: 900, fontSize: '15px', color: textPrimary })}
                      {renderEditableTd(row, 'driverTime', ['8:00AM', '7:00AM', '6:00AM', '9:00AM'], { textAlign: 'center', fontSize: '11px', color: textPrimary })}
                      {renderEditableTd(row, 'installerName', finalInstallerOptions, { textAlign: 'center', fontWeight: 900, fontSize: '15px', color: textPrimary }, 'Select installer...', true)}
                      {renderEditableTd(row, 'installerTime', ['7:00AM', '8:00AM', '6:00AM', '9:00AM'], { textAlign: 'center', fontSize: '11px', color: textPrimary })}
                      {renderEditableTd(row, 'negotiator', finalNegotiatorOptions, { textAlign: 'center', fontWeight: 900, fontSize: '15px', color: textPrimary }, 'Select negotiator...', true)}
                      {renderEditableTd(row, 'route', finalRouteOptions, { fontSize: '12px', color: textPrimary, fontWeight: 600, position: 'relative' }, 'e.g. QC - MANILA')}
                      {renderEditableTd(row, 'remarks', finalRemarksOptions, { fontSize: '12px', color: textPrimary, position: 'relative' }, 'e.g. INSTALL - INSTALL (3 UNITS)')}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Anchored footer metrics panel */}
        <div className="p-4 flex flex-col md:flex-row gap-4 md:items-start print:block" style={{ backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}>
          {/* Notes / Comments Section */}
          <div className="flex-1 min-w-0 flex flex-col gap-2 print:block">
            {canEdit ? (
              <>
                <textarea
                  value={lineupNotes}
                  onChange={e => handleUpdateNotes(e.target.value)}
                  onBlur={handleSaveNotes}
                  placeholder="Notes / Reminders..."
                  rows={3}
                  className="w-full text-xs font-bold outline-none resize-none print:hidden no-scrollbar"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: '#EF4444',
                    lineHeight: '1.6',
                  }}
                />
                <div className="hidden print:block text-xs font-black uppercase tracking-wide whitespace-pre-line" style={{ color: '#EF4444', lineHeight: '1.6' }}>
                  {lineupNotes}
                </div>
              </>
            ) : (
              lineupNotes ? (
                <div className="text-xs font-black uppercase tracking-wide whitespace-pre-line" style={{ color: '#EF4444', lineHeight: '1.6' }}>
                  {lineupNotes}
                </div>
              ) : null
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2.5 w-full md:w-auto md:min-w-[280px] print:hidden">
            {[
              ['INSTALLATION', totalUnits, '#10B981'],
              ['SURVEY', totalSurvey, '#D97706'],
              ['SERVICE / DISMANTLE', totalDismantle, '#F43F5E'],
              ['CLEANING', totalCleaning, '#0D9488'],
            ].filter(([_, value]) => Number(value) > 0).map(([label, value, color]) => (
              <div
                key={String(label)}
                style={{
                  border: `1px solid ${border}`,
                  backgroundColor: cardBg,
                  padding: '10px 16px',
                  borderRadius: '6px',
                  minWidth: '120px',
                }}
              >
                <div style={{ color: String(color), fontSize: '11px', fontWeight: 950, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ color: String(color), fontSize: '26px', fontWeight: 950, lineHeight: 1.2 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Print fallback for totals table */}
          <table className="hidden print:table" style={{ borderCollapse: 'collapse', minWidth: '360px' }}>
            <tbody>
              {totalUnits > 0 && (
                <tr style={{ backgroundColor: isLight ? '#e8f5e9' : 'rgba(16,185,129,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: currentTheme.accent }}>TOTAL UNITS INSTALLATION</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: currentTheme.accent }}>{totalUnits}</td>
                </tr>
              )}
              {totalSurvey > 0 && (
                <tr style={{ backgroundColor: isLight ? '#fef9c3' : 'rgba(234,179,8,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: isLight ? '#854d0e' : '#facc15' }}>TOTAL UNITS FOR SURVEY</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: isLight ? '#854d0e' : '#facc15' }}>{totalSurvey}</td>
                </tr>
              )}
              {totalDismantle > 0 && (
                <tr style={{ backgroundColor: isLight ? '#fecdd3' : 'rgba(244,63,94,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#F43F5E' }}>SERVICE / DISMANTLE</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#F43F5E' }}>{totalDismantle}</td>
                </tr>
              )}
              {totalCleaning > 0 && (
                <tr style={{ backgroundColor: isLight ? '#ccfbf1' : 'rgba(13,148,136,0.1)' }}>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 16px', fontSize: '11px', fontWeight: 800, color: '#0D9488' }}>TOTAL CLEANING</td>
                  <td style={{ border: `1px solid ${border}`, padding: '8px 24px', fontSize: '13px', fontWeight: 900, textAlign: 'center', color: '#0D9488' }}>{totalCleaning}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save button — below the card */}
      {canEdit && (
        <div className="no-print flex justify-end">
          <button
            type="button"
            onClick={handleSaveAll}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 shadow-md cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${currentTheme.accent}, ${currentTheme.accentDark})`,
              boxShadow: `0 4px 14px ${currentTheme.accent}25`
            }}
          >
            <Save className="w-4 h-4" /> Save Schedule
          </button>
        </div>
      )}

      {/* Row Context Menu */}
      {activeMenu && (
        <div
          id="row-context-menu"
          className="no-print"
          style={{
            position: 'fixed',
            left: `${activeMenu.x}px`,
            top: `${activeMenu.y}px`,
            zIndex: 9999,
            backgroundColor: isLight ? '#ffffff' : '#1E293B',
            border: `1px solid ${isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.15)'}`,
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            minWidth: '150px',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setEditingCell({ rowId: activeMenu.row.id, field: 'service' })
              setTempValue(activeMenu.row.service || '')
              setActiveMenu(null)
              setSelectedRowId(activeMenu.row.id)
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = isLight ? '#F1F5F9' : '#334155'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left"
            style={{ color: isLight ? '#1F2937' : '#F3F4F6', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <Edit3 className="w-3.5 h-3.5 text-emerald-500" />
            Edit row
          </button>
          <button
            onClick={() => {
              void handleDelete(activeMenu.row)
              setActiveMenu(null)
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = isLight ? '#FEF2F2' : 'rgba(239, 68, 68, 0.1)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left"
            style={{ color: '#EF4444', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
            Delete row
          </button>
        </div>
      )}
    </>
  )
}
