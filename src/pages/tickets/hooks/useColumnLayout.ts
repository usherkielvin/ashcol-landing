import React, { useCallback, useMemo, useState } from 'react'
import {
  DEFAULT_COL_WIDTHS,
  MIN_COL_WIDTHS,
  SCHEDULE_HIDDEN_COLS_KEY,
} from '../constants'
import type { ColumnDef } from '../types'

export interface UseColumnLayoutOptions {
  isMyTickets: boolean
  isTaguigServices: boolean
  monthViewActive: boolean
}

export function columnDisplayName(label: string, isTaguigServices = false): string {
  switch (label) {
    case "CUSTOMER'S NAME":
      return 'CUSTOMER'
    case 'DESTINATION':
      return 'DISTRICT'
    case 'DLR':
      return isTaguigServices ? 'ENDORSED BY' : 'DEALER'
    case 'INSTALLER':
      return isTaguigServices ? 'TECHNICIAN' : 'INSTALLER'
    case 'SERVICE':
      return 'DRIVER'
    case 'UPDATE':
      return 'REMARKS'
    case 'FINAL DATE':
      return 'DATE'
    default:
      return label
  }
}

export function useColumnLayout({
  isMyTickets,
  isTaguigServices,
  monthViewActive,
}: UseColumnLayoutOptions) {
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})

  const [hiddenCols, setHiddenCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SCHEDULE_HIDDEN_COLS_KEY)
      if (saved) return JSON.parse(saved)
    } catch {
      // ignore
    }
    return []
  })

  const updateHiddenCols = useCallback((updater: (prev: string[]) => string[]) => {
    setHiddenCols((prev) => {
      const next = updater(prev)
      try {
        localStorage.setItem(SCHEDULE_HIDDEN_COLS_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const [customColWidths, setCustomColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('ashcol_schedule_col_widths_v2')
      if (saved) return JSON.parse(saved)
    } catch {
      // ignore
    }
    return {}
  })

  const startColResize = useCallback((e: React.MouseEvent, colLabel: string, currentWidth: number) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = currentWidth
    const minW = MIN_COL_WIDTHS[colLabel] || 60

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let latestWidth = startWidth
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(minW, Math.round(startWidth + delta))
      latestWidth = newWidth
      setCustomColWidths(prev => ({
        ...prev,
        [colLabel]: newWidth,
      }))
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setCustomColWidths(latest => {
        try {
          localStorage.setItem('ashcol_schedule_col_widths_v2', JSON.stringify({ ...latest, [colLabel]: latestWidth }))
        } catch {
          // ignore
        }
        return latest
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const columns: ColumnDef[] = useMemo(() => {
    const scheduleCols = [
      { label: 'TICKET NO', display: 'TICKET NO', weight: 9, expMul: 1.2, sticky: true, freeze: false, align: 'center' as const },
      ...(monthViewActive
        ? [{ label: 'FINAL DATE', display: 'DATE', weight: 9, expMul: 1.2, sticky: false, freeze: false, align: 'center' as const }]
        : []),
      { label: "CUSTOMER'S NAME", display: 'CUSTOMER', weight: 15, expMul: 1.5, sticky: true, freeze: false, align: 'left' as const },
      { label: 'DESTINATION', display: 'DISTRICT', weight: 8, expMul: 1.5, sticky: true, freeze: true, align: 'center' as const, sortable: true },
      { label: 'BRAND', display: 'BRAND', weight: 11, expMul: 1.5, sticky: false, freeze: false, align: 'center' as const },
      { label: 'DLR', display: isTaguigServices ? 'ENDORSED BY' : 'DEALER', weight: 10, expMul: 1.4, sticky: false, freeze: false, align: 'center' as const },
      { label: 'COMMIT', display: 'COMMIT', weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'INSTALLER', display: isTaguigServices ? 'TECHNICIAN' : 'INSTALLER', weight: 10, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'NEGOTIATOR', display: 'NEGOTIATOR', weight: 8, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'SERVICE', display: 'DRIVER', weight: 9, expMul: 1.3, sticky: false, freeze: false, align: 'center' as const },
      { label: 'VEHICLE', display: 'VEHICLE', weight: 9, expMul: 1.2, sticky: false, freeze: false, align: 'center' as const },
      { label: 'STATUS', display: 'STATUS', weight: 13, expMul: 1.3, sticky: false, freeze: false, align: 'center' as const },
      { label: 'UPDATE', display: 'REMARKS', weight: 14, expMul: 1.55, sticky: false, freeze: false, align: 'right' as const },
      { label: 'PAYMENT', display: 'PAYMENT', weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'right' as const },
    ]
    const myTicketsCols = [
      { label: 'TICKET NO', display: 'TICKET NO', weight: 9, expMul: 1.2, sticky: true, freeze: false, align: 'center' as const },
      { label: "CUSTOMER'S NAME", display: 'CUSTOMER', weight: 14, expMul: 1.5, sticky: true, freeze: false, align: 'left' as const },
      { label: 'DESTINATION', display: 'DISTRICT', weight: 8, expMul: 1.5, sticky: true, freeze: true, align: 'center' as const, sortable: true },
      { label: 'BRAND', display: 'BRAND', weight: 10, expMul: 1.45, sticky: false, freeze: false, align: 'center' as const },
      { label: 'DLR', display: isTaguigServices ? 'ENDORSED BY' : 'DEALER', weight: 9, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'COMMIT', display: 'COMMIT', weight: 11, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const },
      { label: 'NEGOTIATOR', display: 'NEGOTIATOR', weight: 8, expMul: 1.35, sticky: false, freeze: false, align: 'center' as const, sortable: true },
      { label: 'STATUS', display: 'STATUS', weight: 12, expMul: 1.25, sticky: false, freeze: false, align: 'center' as const },
      { label: 'UPDATE', display: 'REMARKS', weight: 13, expMul: 1.5, sticky: false, freeze: false, align: 'right' as const },
      { label: 'FINAL DATE', display: 'FINAL DATE', weight: 10, expMul: 1.3, sticky: false, freeze: false, align: 'center' as const },
    ]

    const raw = isMyTickets ? myTicketsCols : scheduleCols.filter(c => !hiddenCols.includes(c.label))
    let stickyLeft = 0
    return raw.map((c) => {
      const isExpanded = !!expandedCols[c.label]
      const baseW = customColWidths[c.label] || DEFAULT_COL_WIDTHS[c.label] || 120
      const pixelWidth = isExpanded ? Math.round(baseW * 1.35) : baseW
      const leftPx = c.sticky ? stickyLeft : 0
      if (c.sticky) stickyLeft += pixelWidth
      return { ...c, isExpanded, pixelWidth, w: `${pixelWidth}px`, left: leftPx }
    })
  }, [expandedCols, isTaguigServices, isMyTickets, monthViewActive, customColWidths, hiddenCols])

  const hiddenColumnItems = useMemo(() => {
    return hiddenCols
      .filter(label => label !== 'FINAL DATE' || monthViewActive)
      .map(label => ({ label, display: columnDisplayName(label, isTaguigServices) }))
  }, [hiddenCols, monthViewActive, isTaguigServices])

  const totalTableWidth = useMemo(() => {
    return columns.reduce((acc, c) => acc + c.pixelWidth, 0)
  }, [columns])

  const resetColWidth = useCallback((label: string) => {
    const defW = DEFAULT_COL_WIDTHS[label] || 120
    setCustomColWidths(prev => {
      const next = { ...prev, [label]: defW }
      try {
        localStorage.setItem('ashcol_schedule_col_widths_v2', JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return {
    columns,
    hiddenCols,
    updateHiddenCols,
    customColWidths,
    setCustomColWidths,
    expandedCols,
    setExpandedCols,
    startColResize,
    resetColWidth,
    hiddenColumnItems,
    totalTableWidth,
    columnDisplayName: (label: string) => columnDisplayName(label, isTaguigServices),
  }
}
