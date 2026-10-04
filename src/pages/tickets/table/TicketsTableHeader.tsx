import React from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ColumnDef, SortConfig } from '../types'

export interface TicketsTableHeaderProps {
  columns: ColumnDef[]
  isMyTickets: boolean
  isLight: boolean
  sortConfig: SortConfig | null
  handleColumnSort: (colLabel: string) => void
  setColHeaderMenu: (menu: { x: number; y: number; label: string; display: string } | null) => void
  toggleCol: (label: string) => void
  expandedCols: Record<string, boolean>
  startColResize: (e: React.MouseEvent, colLabel: string, currentWidth: number) => void
  resetColWidth: (colLabel: string) => void
  myTicketsTheadBg: string
  schedTheadBg: string
  myTicketsTheadText: string
  schedTheadText: string
  myTicketsTheadBorder: string
  schedTheadBorder: string
  green: string
}

export const TicketsTableHeader: React.FC<TicketsTableHeaderProps> = ({
  columns,
  isMyTickets,
  isLight,
  sortConfig,
  handleColumnSort,
  setColHeaderMenu,
  toggleCol,
  expandedCols,
  startColResize,
  resetColWidth,
  myTicketsTheadBg,
  schedTheadBg,
  myTicketsTheadText,
  schedTheadText,
  myTicketsTheadBorder,
  schedTheadBorder,
  green,
}) => {
  return (
    <>
      <colgroup>
        {columns.map((col) => (
          <col key={col.label} style={{ width: col.w }} />
        ))}
      </colgroup>
      <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <tr
          style={{
            backgroundColor: isMyTickets ? myTicketsTheadBg : schedTheadBg,
          }}
        >
          {columns.map((rawCol, colIdx) => {
            const col = rawCol as any
            const isLastCol = colIdx === columns.length - 1
            const canSort = 'sortable' in col && col.sortable
            const isSorted = canSort && sortConfig?.column === col.label
            const SortIcon = isSorted
              ? (sortConfig!.direction === 'asc' ? ArrowUp : ArrowDown)
              : ArrowUpDown

            return (
              <th
                key={col.label}
                onContextMenu={
                  isMyTickets
                    ? undefined
                    : (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setColHeaderMenu({
                          x: e.clientX,
                          y: e.clientY,
                          label: col.label,
                          display: String(col.display),
                        })
                      }
                }
                onClick={(e) => {
                  const isExpanding = !expandedCols[col.label]
                  toggleCol(col.label)
                  if (isExpanding) {
                    const th = e.currentTarget
                    setTimeout(() => {
                      th.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                    }, 80)
                  }
                }}
                title={canSort ? 'Click to widen column · Use arrow to sort' : 'Click to widen column'}
                style={{
                  position: col.sticky ? ('sticky' as const) : ('relative' as const),
                  padding: '13px 12px',
                  color: (col.isExpanded || isSorted)
                    ? (isLight ? '#16A34A' : '#4ADE80')
                    : (isMyTickets ? myTicketsTheadText : schedTheadText),
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  borderBottom: isMyTickets ? `1px solid ${myTicketsTheadBorder}` : `1px solid ${schedTheadBorder}`,
                  borderRight: isLastCol ? 'none' : (isMyTickets ? `1px solid ${myTicketsTheadBorder}` : `1px solid ${schedTheadBorder}`),
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  width: col.w,
                  minWidth: col.w,
                  maxWidth: col.w,
                  overflow: 'hidden',
                  textOverflow: 'clip',
                  backgroundColor: isMyTickets ? myTicketsTheadBg : schedTheadBg,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'color 0.15s ease',
                  textAlign: col.align || 'left',
                  ...(col.sticky
                    ? {
                        position: 'sticky' as const,
                        left: `${col.left}px`,
                        zIndex: 15,
                        boxShadow: `2px 0 0 ${isMyTickets ? myTicketsTheadBorder : schedTheadBorder}`,
                      }
                    : {}),
                }}
              >
                <div
                  className={`flex items-center gap-1 w-full ${
                    col.align === 'center'
                      ? 'justify-center text-center'
                      : col.align === 'right'
                        ? 'justify-end text-right'
                        : 'justify-start text-left'
                  }`}
                >
                  <span>{col.display as any}</span>
                  {canSort && (
                    <button
                      type="button"
                      data-sort-trigger
                      onClick={(e) => {
                        e.stopPropagation()
                        handleColumnSort(col.label)
                      }}
                      className="flex items-center justify-center rounded hover:bg-emerald-500/10 cursor-pointer"
                      title="Sort column"
                    >
                      <SortIcon
                        className="w-3 h-3 shrink-0 opacity-70"
                        style={{ color: isSorted ? green : (isMyTickets ? myTicketsTheadText : schedTheadText) }}
                      />
                    </button>
                  )}
                </div>

                {/* Column resize drag handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-30 flex items-center justify-end select-none group"
                  style={{ touchAction: 'none' }}
                  onMouseDown={(e) => startColResize(e, col.label, col.pixelWidth)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    resetColWidth(col.label)
                  }}
                  title="Drag to resize column · Double-click to reset width"
                >
                  <div className="w-[3px] h-full bg-transparent group-hover:bg-emerald-500/80 active:bg-emerald-500 transition-colors" />
                </div>
              </th>
            )
          })}
        </tr>
      </thead>
    </>
  )
}
