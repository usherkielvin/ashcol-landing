import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileDown, Loader2, X } from 'lucide-react'

export type ScheduleShowcaseRow = {
  id: string
  index: number
  ticketNumber: string
  name: string
  destination: string
  district: string
  contact: string
  brand: string
  dealer: string
  status: string
  commit: string
  installer: string
  update: string
  payment: string
  /** Driver / vehicle for driver list sheet */
  driver: string
  /** Service type (S/I, Survey, etc.) for driver list sheet */
  service: string
}

type SchedulesShowcaseProps = {
  open: boolean
  onClose: () => void
  branchLabel: string
  dateLabel: string
  dateKey?: string
  isTaguigServices: boolean
  rows: ScheduleShowcaseRow[]
  /** Live payment text keyed by showcase row id — used at PDF export time. */
  paymentByRowId?: Record<string, string>
  /** Snapshot local schedule rows before PDF export. */
  onBeforeExport?: () => void
}

const HEADER_GREEN = '#16a34a'
const HEADER_GREEN_DARK = '#15803d'
const TABLE_BORDER = '#000000'
const INK = '#000000'
const PAPER = '#ffffff'

/** A4 landscape for installer + driver sheets */
const PDF_PAGE = { orientation: 'landscape' as const, unit: 'mm' as const, format: 'a4' as const }
const PDF_MARGIN_X = 8
/** Installer schedule sheet — max rows per A4 page */
const INSTALLER_ROWS_PER_PAGE = 15
/** Driver list sheet — max rows per A4 page */
const DRIVER_ROWS_PER_PAGE = 18

function chunkRows<T>(rows: T[], size: number): T[][] {
  if (rows.length === 0) return [[]]
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size))
  }
  return chunks
}

function getRowBgColor(status: string): string | undefined {
  const s = (status || '').toUpperCase()
  if (s.includes('SURVEY')) return '#f0fdf4'
  if (s.includes('BACKJOB')) return '#fef2f2'
  if (s.includes('CLEANING')) return '#eff6ff'
  return undefined
}

function getRowPdfBgColor(status: string): [number, number, number] | undefined {
  const s = (status || '').toUpperCase()
  if (s.includes('SURVEY')) return [240, 253, 244]
  if (s.includes('BACKJOB')) return [254, 242, 242]
  if (s.includes('CLEANING')) return [239, 246, 255]
  return undefined
}

function showcaseCellText(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed || trimmed === '—') return '—'
  return trimmed.replace(/\s+/g, ' ')
}

function pdfCellText(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed || trimmed === '—') return ''
  return trimmed.replace(/\s+/g, ' ').toUpperCase()
}

/** PDF payment: mode and amount on one line, with commas. */
function pdfPaymentText(payment: string): string {
  const trimmed = (payment || '').trim()
  if (!trimmed || trimmed === '—') return ''
  const upper = trimmed.toUpperCase()
  if (upper === 'FREE' || upper === 'FREE INSTALL') return 'FREE'

  const split = trimmed.match(/^(.+?)\s+([\d,]+(?:\.\d+)?)$/i)
  if (split) {
    const mode = split[1].trim().toUpperCase()
    const cleanAmount = split[2].replace(/,/g, '')
    const num = parseFloat(cleanAmount)
    let amount = split[2]
    if (!isNaN(num)) {
      const parts = cleanAmount.split('.')
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      amount = parts.join('.')
    }
    return `${mode} ${amount}`
  }

  if (/^[\d,]+(?:\.\d+)?$/.test(trimmed)) {
    const cleanAmount = trimmed.replace(/,/g, '')
    const num = parseFloat(cleanAmount)
    if (!isNaN(num)) {
      const parts = cleanAmount.split('.')
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      return parts.join('.')
    }
  }

  return upper
}

function resolveRowPayment(row: ScheduleShowcaseRow, paymentByRowId?: Record<string, string>): string {
  const fromMap = paymentByRowId?.[row.id]?.trim()
  if (fromMap) return fromMap
  return (row.payment || '').trim()
}

function parseDateMeta(dateKey: string, dateLabel: string) {
  const datePart = (dateKey || '').split('T')[0].split(' ')[0].trim()
  if (!datePart) {
    return {
      scheduleDate: (dateLabel || '—').toUpperCase(),
      dayName: '—',
    }
  }
  const d = new Date(`${datePart}T00:00:00`)
  if (Number.isNaN(d.getTime())) {
    return {
      scheduleDate: (dateLabel || datePart).toUpperCase(),
      dayName: '—',
    }
  }
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  const scheduleDate = (dateLabel || `${month} ${day} ${year}`).toUpperCase()
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
  return { scheduleDate, dayName }
}

function buildInstallerHeaders(isTaguigServices: boolean) {
  const installerLabel = isTaguigServices ? 'TECHNICIAN' : 'INSTALLER'
  const dealerLabel = isTaguigServices ? 'ENDORSED BY' : 'DLR'
  return [
    'NO.',
    'TICKET NO',
    'NAME',
    'DISTRICT',
    'BRAND',
    dealerLabel,
    'STATUS',
    'COMMIT',
    installerLabel,
    'UPDATE',
    'PAYMENT',
  ]
}

function buildDriverHeaders() {
  return [
    'NO.',
    'TICKET NO',
    'NAME',
    'DESTINATION',
    'DISTRICT',
    'STATUS',
    'DRIVER',
    'SERVICE',
  ]
}

function installerRowToCells(row: ScheduleShowcaseRow, paymentByRowId?: Record<string, string>) {
  const payment = resolveRowPayment(row, paymentByRowId)
  return [
    String(row.index),
    showcaseCellText(row.ticketNumber),
    showcaseCellText(row.name),
    showcaseCellText(row.district).toUpperCase(),
    showcaseCellText(row.brand),
    showcaseCellText(row.dealer).toUpperCase(),
    showcaseCellText(row.status),
    showcaseCellText(row.commit),
    showcaseCellText(row.installer),
    showcaseCellText(row.update),
    showcaseCellText(payment),
  ]
}

function installerRowToPdfCells(row: ScheduleShowcaseRow, paymentByRowId?: Record<string, string>) {
  const payment = resolveRowPayment(row, paymentByRowId)
  return [
    String(row.index),
    pdfCellText(row.ticketNumber),
    pdfCellText(row.name),
    pdfCellText(row.district),
    pdfCellText(row.brand),
    pdfCellText(row.dealer),
    pdfCellText(row.status),
    pdfCellText(row.commit),
    pdfCellText(row.installer),
    pdfCellText(row.update),
    pdfPaymentText(payment),
  ]
}

function driverRowToCells(row: ScheduleShowcaseRow) {
  return [
    String(row.index),
    showcaseCellText(row.ticketNumber),
    showcaseCellText(row.name),
    showcaseCellText(row.destination),
    showcaseCellText(row.district).toUpperCase(),
    showcaseCellText(row.status),
    showcaseCellText(row.driver),
    showcaseCellText(row.service),
  ]
}

function driverRowToPdfCells(row: ScheduleShowcaseRow) {
  return [
    String(row.index),
    pdfCellText(row.ticketNumber),
    pdfCellText(row.name),
    pdfCellText(row.destination),
    pdfCellText(row.district),
    pdfCellText(row.status),
    pdfCellText(row.driver),
    pdfCellText(row.service),
  ]
}

const PDF_BW_TABLE = {
  theme: 'grid' as const,
  styles: {
    font: 'helvetica',
    fontSize: 6.5,
    cellPadding: 1.1,
    minCellHeight: 6.2,
    lineColor: [0, 0, 0] as [number, number, number],
    lineWidth: 0.2,
    textColor: [0, 0, 0] as [number, number, number],
    fillColor: [255, 255, 255] as [number, number, number],
    valign: 'top' as const,
    overflow: 'linebreak' as const,
  },
  headStyles: {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: [0, 0, 0] as [number, number, number],
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    fontSize: 6,
    cellPadding: 1,
    minCellHeight: 5.5,
    lineColor: [0, 0, 0] as [number, number, number],
  },
}

/** A4 landscape usable width ≈ 297 − 16mm margins */
const INSTALLER_COLUMN_STYLES = {
  0: { halign: 'center' as const, cellWidth: 8 },
  1: { halign: 'center' as const, cellWidth: 18 },
  2: { cellWidth: 32 },
  3: { cellWidth: 20 },
  4: { cellWidth: 22 },
  5: { cellWidth: 20 },
  6: { halign: 'center' as const, cellWidth: 22 },
  7: { cellWidth: 24 },
  8: { halign: 'center' as const, cellWidth: 20 },
  9: { cellWidth: 48 },
  10: {
    halign: 'right' as const,
    cellWidth: 27,
    fontStyle: 'bold' as const,
    fontSize: 6.5,
    overflow: 'linebreak' as const,
  },
}

const DRIVER_COLUMN_STYLES = {
  0: { halign: 'center' as const, cellWidth: 10 },
  1: { halign: 'center' as const, cellWidth: 24 },
  2: { cellWidth: 45 },
  3: { cellWidth: 62 },
  4: { cellWidth: 30 },
  5: { halign: 'center' as const, cellWidth: 34 },
  6: { halign: 'center' as const, cellWidth: 36 },
  7: { halign: 'center' as const, cellWidth: 28 },
}

function drawPdfDateTable(
  pdf: import('jspdf').jsPDF,
  autoTable: typeof import('jspdf-autotable').default,
  dateKey: string,
  dateLabel: string,
  sheetTitle?: string,
) {
  const { scheduleDate, dayName } = parseDateMeta(dateKey, dateLabel)
  const body: string[][] = [
    ['DATE', scheduleDate],
    ['DAY', dayName],
  ]
  if (sheetTitle) {
    body.push(['SHEET', sheetTitle])
  }
  autoTable(pdf, {
    startY: 6,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X },
    tableWidth: 62,
    body,
    ...PDF_BW_TABLE,
    styles: { ...PDF_BW_TABLE.styles, fontSize: 6.5, cellPadding: 1, minCellHeight: 5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 14 },
      1: { cellWidth: 48 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const raw = String(data.cell.raw ?? '').trim()
        if (raw && raw !== '—') data.cell.text = [raw.toUpperCase()]
      }
    },
  })
  const doc = pdf as import('jspdf').jsPDF & { lastAutoTable?: { finalY: number } }
  return doc.lastAutoTable?.finalY ?? 18
}

async function exportShowcasePdfDocument(options: {
  filename: string
  dateLabel: string
  dateKey: string
  isTaguigServices: boolean
  rows: ScheduleShowcaseRow[]
  paymentByRowId?: Record<string, string>
}) {
  const { filename, dateLabel, dateKey, isTaguigServices, rows, paymentByRowId } = options
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const pdf = new jsPDF(PDF_PAGE)
  const pageWidth = pdf.internal.pageSize.getWidth()
  const tableWidth = pageWidth - PDF_MARGIN_X * 2
  const installerHeaders = buildInstallerHeaders(isTaguigServices)
  const driverHeaders = buildDriverHeaders()
  const installerPages = chunkRows(rows, INSTALLER_ROWS_PER_PAGE)
  const driverPages = chunkRows(rows, DRIVER_ROWS_PER_PAGE)

  let globalPage = 0

  const drawFooter = (pageNo: number) => {
    const footerY = pdf.internal.pageSize.getHeight() - 5
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    pdf.setTextColor(0, 0, 0)
    pdf.text(`Page ${pageNo}`, pageWidth / 2, footerY, { align: 'center' })
  }

  installerPages.forEach((pageRows) => {
    if (globalPage > 0) pdf.addPage('a4', 'landscape')
    globalPage += 1
    const tableStartY = drawPdfDateTable(pdf, autoTable, dateKey, dateLabel, 'INSTALLER LIST') + 3
    const body = pageRows.length > 0
      ? pageRows.map(r => installerRowToPdfCells(r, paymentByRowId))
      : [['No schedule tickets for this date.', '', '', '', '', '', '', '', '', '', '']]

    autoTable(pdf, {
      startY: tableStartY,
      margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X, top: 20, bottom: 10 },
      tableWidth,
      head: [installerHeaders],
      body,
      showHead: 'everyPage',
      ...PDF_BW_TABLE,
      columnStyles: INSTALLER_COLUMN_STYLES,
      didParseCell: (data) => {
        if (data.row.section === 'body') {
          const statusText = (data.row.raw as unknown as unknown[])[6]
          if (typeof statusText === 'string') {
            const bg = getRowPdfBgColor(statusText)
            if (bg) data.cell.styles.fillColor = bg
          }
        }
      },
      didDrawPage: () => drawFooter(globalPage),
    })
  })

  if (rows.length > 0) {
    driverPages.forEach((pageRows) => {
      pdf.addPage('a4', 'landscape')
      globalPage += 1
      const tableStartY = drawPdfDateTable(pdf, autoTable, dateKey, dateLabel, 'DRIVER LIST') + 3
      const body = pageRows.map(r => driverRowToPdfCells(r))

      autoTable(pdf, {
        startY: tableStartY,
        margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X, top: 20, bottom: 10 },
        tableWidth,
        head: [driverHeaders],
        body,
        showHead: 'everyPage',
        ...PDF_BW_TABLE,
        styles: { ...PDF_BW_TABLE.styles, fontSize: 10, cellPadding: 2, minCellHeight: 13 },
        headStyles: { ...PDF_BW_TABLE.headStyles, fontSize: 8.5, minCellHeight: 8, cellPadding: 1.5 },
        columnStyles: DRIVER_COLUMN_STYLES,
        didParseCell: (data) => {
          if (data.row.section === 'body') {
            const statusText = (data.row.raw as unknown as unknown[])[5]
            if (typeof statusText === 'string') {
              const bg = getRowPdfBgColor(statusText)
              if (bg) data.cell.styles.fillColor = bg
            }
          }
        },
        didDrawPage: () => drawFooter(globalPage),
      })
    })
  }

  pdf.save(filename)
}

type SheetKind = 'installer' | 'driver'

export function SchedulesShowcase({
  open,
  onClose,
  branchLabel,
  dateLabel,
  dateKey = '',
  isTaguigServices,
  rows,
  paymentByRowId,
  onBeforeExport,
}: SchedulesShowcaseProps) {
  const [exportingPdf, setExportingPdf] = useState(false)
  const { scheduleDate, dayName } = parseDateMeta(dateKey, dateLabel)

  const installerPages = useMemo(() => chunkRows(rows, INSTALLER_ROWS_PER_PAGE), [rows])
  const driverPages = useMemo(() => chunkRows(rows, DRIVER_ROWS_PER_PAGE), [rows])
  const totalSheets = installerPages.length + (rows.length > 0 ? driverPages.length : 0)

  useEffect(() => {
    if (!open) return
    document.body.classList.add('showcase-mode-active')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('showcase-mode-active')
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])


  const handleExportPdf = useCallback(async () => {
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      onBeforeExport?.()
      const safeBranch = (branchLabel || 'schedule').replace(/[^\w\-]+/g, '_')
      const safeDate = (dateLabel || 'all-dates').replace(/[^\w\-]+/g, '_')
      await exportShowcasePdfDocument({
        filename: `ashcol-schedules_${safeBranch}_${safeDate}.pdf`,
        dateLabel,
        dateKey,
        isTaguigServices,
        rows,
        paymentByRowId,
      })
    } catch (err) {
      console.error('Schedules PDF export failed', err)
      const message = err instanceof Error ? err.message : String(err)
      // Vite/Rollup hashes chunk URLs per deploy — a portal tab left open across a new deploy
      // still references the old jspdf/jspdf-autotable chunk URLs, which 404 on the CDN. That
      // surfaces as a network/import error, not a PDF-generation bug, and only a reload fixes it.
      const isStaleChunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)
      if (isStaleChunk) {
        if (window.confirm('This page was loaded before the latest update and can\'t load the PDF exporter. Reload now to try again?')) {
          window.location.reload()
        }
      } else {
        alert(`Could not export PDF (${message || 'unknown error'}). Please try again.`)
      }
    } finally {
      setExportingPdf(false)
    }
  }, [branchLabel, dateKey, dateLabel, exportingPdf, isTaguigServices, onBeforeExport, paymentByRowId, rows])

  if (!open) return null

  const installerHeaders = buildInstallerHeaders(isTaguigServices)
  const driverHeaders = buildDriverHeaders()

  const renderDateTable = (sheetTitle: string) => (
    <div className="p-2 md:p-3" style={{ borderBottom: `1px solid ${TABLE_BORDER}` }}>
      <table
        className="schedules-showcase-date-table"
        style={{ borderCollapse: 'collapse', width: '240px', maxWidth: '100%' }}
      >
        <tbody>
          <tr>
            <td style={dateLabelCell}>Date</td>
            <td style={dateValueCell}>{scheduleDate}</td>
          </tr>
          <tr>
            <td style={dateLabelCell}>Day</td>
            <td style={dateValueCell}>{dayName}</td>
          </tr>
          <tr>
            <td style={dateLabelCell}>Sheet</td>
            <td style={dateValueCell}>{sheetTitle}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  const renderInstallerTable = (pageRows: ScheduleShowcaseRow[]) => (
    <div className="overflow-x-auto">
      <table
        className="schedules-showcase-table schedules-showcase-installer"
        style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: PAPER, tableLayout: 'fixed' }}
      >
        <colgroup>
          <col style={{ width: '3%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr>
            {installerHeaders.map((label) => (
              <th key={label} style={thStyle}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 ? (
            <tr>
              <td colSpan={installerHeaders.length} style={emptyCellStyle}>
                No schedule tickets for this date.
              </td>
            </tr>
          ) : pageRows.map(row => {
            const cells = installerRowToCells(row, paymentByRowId)
            return (
              <tr key={`inst-${row.index}-${row.id}`} style={{ backgroundColor: getRowBgColor(row.status) }}>
                {cells.map((value, cellIdx) => (
                  <td
                    key={cellIdx}
                    style={{
                      ...tdStyle,
                      textAlign: cellIdx === 10 ? 'right' : [0, 1, 6, 8].includes(cellIdx) ? 'center' : 'left',
                      fontWeight: cellIdx === 10 ? 700 : cellIdx === 6 ? 600 : 500,
                      fontSize: cellIdx === 9 || cellIdx === 10 ? '8px' : '8.5px',
                    }}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const renderDriverTable = (pageRows: ScheduleShowcaseRow[]) => (
    <div className="overflow-x-auto">
      <table
        className="schedules-showcase-table schedules-showcase-driver"
        style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: PAPER, tableLayout: 'fixed' }}
      >
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr>
            {driverHeaders.map((label) => (
              <th key={label} style={thStyle}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 ? (
            <tr>
              <td colSpan={driverHeaders.length} style={emptyCellStyle}>
                No schedule tickets for this date.
              </td>
            </tr>
          ) : pageRows.map(row => {
            const cells = driverRowToCells(row)
            return (
              <tr key={`drv-${row.index}-${row.id}`} style={{ backgroundColor: getRowBgColor(row.status) }}>
                {cells.map((value, cellIdx) => (
                  <td
                    key={cellIdx}
                    style={{
                      ...tdStyle,
                      textAlign: [0, 1, 5, 6, 7].includes(cellIdx) ? 'center' : 'left',
                      fontWeight: cellIdx === 5 ? 700 : 500,
                      fontSize: '11px',
                      lineHeight: '1.4',
                      padding: '5px 4px',
                    }}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const renderSheet = (
    kind: SheetKind,
    pageRows: ScheduleShowcaseRow[],
    pageIdx: number,
    pageCount: number,
    isLast: boolean,
  ) => {
    const title = kind === 'installer' ? 'INSTALLER LIST' : 'DRIVER LIST'
    return (
      <div
        key={`${kind}-page-${pageIdx}`}
        className={`schedules-showcase-sheet mx-auto ${!isLast ? 'showcase-page-break' : ''}`}
        style={{
          maxWidth: '1123px',
          width: '100%',
          backgroundColor: PAPER,
          border: '1px solid #dbe5ef',
          boxShadow: '0 12px 40px rgba(15,23,42,0.08)',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: !isLast ? 24 : 0,
        }}
      >
        {renderDateTable(title)}
        {kind === 'installer' ? renderInstallerTable(pageRows) : renderDriverTable(pageRows)}
        {pageCount > 1 && (
          <div
            className="no-print px-3 py-1.5 text-right text-[10px] font-semibold text-slate-500"
            style={{ borderTop: `1px solid ${TABLE_BORDER}` }}
          >
            {title} · Page {pageIdx + 1} of {pageCount}
          </div>
        )}
      </div>
    )
  }

  const sheets: React.ReactNode[] = []
  installerPages.forEach((pageRows, pageIdx) => {
    const isLastInstaller = pageIdx === installerPages.length - 1
    const isLastOverall = isLastInstaller && rows.length === 0
    sheets.push(
      renderSheet('installer', pageRows, pageIdx, installerPages.length, isLastOverall),
    )
  })
  if (rows.length > 0) {
    driverPages.forEach((pageRows, pageIdx) => {
      const isLast = pageIdx === driverPages.length - 1
      sheets.push(
        renderSheet('driver', pageRows, pageIdx, driverPages.length, isLast),
      )
    })
  }

  return (
    <>
      <div
        className="schedules-showcase-overlay fixed inset-0 z-[10000] overflow-auto"
        style={{ backgroundColor: '#f1f5f9' }}
      >
        <div className="min-h-screen flex flex-col">
          <div
            className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8"
            style={{
              backgroundColor: 'rgba(241,245,249,0.96)',
              borderBottom: '1px solid #cbd5e1',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-700">
                Schedules Showcase
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {branchLabel || 'Branch'} · {scheduleDate} · {dayName}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                PDF / Print: A4 Landscape · Installer ({INSTALLER_ROWS_PER_PAGE}/page) + Driver ({DRIVER_ROWS_PER_PAGE}/page)
                {totalSheets > 1 ? ` · ${totalSheets} sheets` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={exportingPdf || rows.length === 0}
                className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: HEADER_GREEN, border: `1px solid ${HEADER_GREEN_DARK}` }}
              >
                {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Export PDF to Print
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold text-white"
                style={{ backgroundColor: HEADER_GREEN, border: `1px solid ${HEADER_GREEN_DARK}` }}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-300 text-slate-700"
                aria-label="Close showcase"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 px-4 py-6 md:px-8 md:py-10 print-area">
            {sheets}
          </div>
        </div>
      </div>

      <style>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: static !important;
            inset: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            max-width: none !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .schedules-showcase-sheet {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin-bottom: 0 !important;
            max-width: none !important;
            border: none !important;
          }
          .print-area * {
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
          .showcase-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .schedules-showcase-overlay {
            position: static !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          .schedules-showcase-table td,
          .schedules-showcase-table th,
          .schedules-showcase-date-table td {
            color: #000000 !important;
            background: #ffffff !important;
            border-color: #000000 !important;
          }
        }
        body.showcase-mode-active aside,
        body.showcase-mode-active header {
          display: none !important;
        }
        body.showcase-mode-active main {
          padding: 0 !important;
          margin: 0 !important;
        }
        .schedules-showcase-overlay {
          left: 0 !important;
          right: 0 !important;
          top: 0 !important;
          bottom: 0 !important;
        }
      `}</style>
    </>
  )
}

const dateLabelCell: React.CSSProperties = {
  border: `1px solid ${TABLE_BORDER}`,
  padding: '4px 8px',
  fontWeight: 800,
  fontSize: '9px',
  textTransform: 'uppercase',
  backgroundColor: PAPER,
  color: INK,
  width: 52,
}

const dateValueCell: React.CSSProperties = {
  border: `1px solid ${TABLE_BORDER}`,
  padding: '4px 8px',
  fontWeight: 700,
  fontSize: '10px',
  backgroundColor: PAPER,
  color: INK,
}

const thStyle: React.CSSProperties = {
  backgroundColor: PAPER,
  color: INK,
  border: `1px solid ${TABLE_BORDER}`,
  padding: '4px 3px',
  fontSize: '8px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  verticalAlign: 'middle',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  border: `1px solid ${TABLE_BORDER}`,
  padding: '4px 4px',
  color: INK,
  backgroundColor: PAPER,
  verticalAlign: 'top',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  lineHeight: 1.3,
}

const emptyCellStyle: React.CSSProperties = {
  padding: '24px 12px',
  textAlign: 'center',
  color: INK,
  fontWeight: 600,
  border: `1px solid ${TABLE_BORDER}`,
  backgroundColor: PAPER,
  fontSize: '10px',
}
