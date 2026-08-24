import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileDown, Loader2, Printer, Sheet, X } from 'lucide-react'
import * as XLSX from 'xlsx'

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
  negotiator: string
  update: string
  payment: string
  driver: string
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
  paymentByRowId?: Record<string, string>
  onBeforeExport?: () => void
}

const HEADER_GREEN = '#16a34a'
const HEADER_GREEN_DARK = '#15803d'
const TABLE_BORDER = '#000000'
const INK = '#000000'
const PAPER = '#ffffff'

const PDF_PAGE = { orientation: 'landscape' as const, unit: 'mm' as const, format: 'a4' as const }
const PDF_MARGIN_X = 8
const INSTALLER_ROWS_PER_PAGE = 15
const DRIVER_ROWS_PER_PAGE = 13

function chunkRows<T>(rows: T[], size: number): T[][] {
  if (rows.length === 0) return [[]]
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

function getRowBgColor(status: string): string | undefined {
  const s = (status || '').toUpperCase()
  if (s.includes('SURVEY')) return '#f0fdf4'
  if (s.includes('BACKJOB')) return '#fef2f2'
  if (s.includes('CLEANING')) return '#eff6ff'
  if (s.includes('MOUNTING')) return '#e0f2fe'
  return undefined
}

function getRowPdfBgColor(status: string): [number, number, number] | undefined {
  const s = (status || '').toUpperCase()
  if (s.includes('SURVEY')) return [240, 253, 244]
  if (s.includes('BACKJOB')) return [254, 242, 242]
  if (s.includes('CLEANING')) return [239, 246, 255]
  if (s.includes('MOUNTING')) return [224, 242, 254]
  return undefined
}

function showcaseCellText(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\s+/g, ' ')
}

function pdfCellText(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\s+/g, ' ').toUpperCase()
}

function pdfPaymentText(payment: string): string {
  const trimmed = (payment || '').trim()
  if (!trimmed) return ''
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

export function computePaymentSummary(rows: ScheduleShowcaseRow[], paymentByRowId?: Record<string, string>) {
  let totalCash = 0
  let totalGcash = 0
  let totalBankTransfer = 0
  let totalOther = 0
  let paidCount = 0

  rows.forEach(r => {
    const raw = resolveRowPayment(r, paymentByRowId).trim()
    if (!raw) return
    const upper = raw.toUpperCase()
    if (upper === 'FREE' || upper === 'FREE INSTALL' || upper === 'NO_PAYMENT') {
      return
    }

    const split = raw.match(/^(.+?)\s+([\d,]+(?:\.\d+)?)$/i)
    if (split) {
      const mode = split[1].trim().toUpperCase()
      const amount = parseFloat(split[2].replace(/,/g, '')) || 0
      if (amount > 0) {
        paidCount++
        if (mode === 'CASH') totalCash += amount
        else if (mode === 'GCASH') totalGcash += amount
        else if (mode === 'BANK TRANSFER' || mode === 'BANK_TRANSFER' || mode === 'BANK' || mode === 'ONLINE') totalBankTransfer += amount
        else totalOther += amount
      }
    } else {
      const clean = raw.replace(/,/g, '')
      const num = parseFloat(clean)
      if (!isNaN(num) && num > 0) {
        paidCount++
        totalCash += num
      }
    }
  })

  const grandTotal = totalCash + totalGcash + totalBankTransfer + totalOther
  return {
    totalCash,
    totalGcash,
    totalBankTransfer,
    totalOther,
    grandTotal,
    paidCount,
  }
}

function parseDateMeta(dateKey: string, dateLabel: string) {
  const datePart = (dateKey || '').split('T')[0].split(' ')[0].trim()
  if (!datePart) return { scheduleDate: (dateLabel || '').toUpperCase(), dayName: '' }
  const d = new Date(`${datePart}T00:00:00`)
  if (Number.isNaN(d.getTime())) return { scheduleDate: (dateLabel || datePart).toUpperCase(), dayName: '' }
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  const scheduleDate = (dateLabel || `${month} ${day} ${year}`).toUpperCase()
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
  return { scheduleDate, dayName }
}

function buildInstallerHeaders(isTaguigServices: boolean) {
  const installerLabel = isTaguigServices ? 'TECHNICIAN' : 'INSTALLER'
  const dealerLabel = isTaguigServices ? 'ENDORSED BY' : 'DEALER / STORE'
  return [
    'NO.',
    'TICKET NO',
    'NAME',
    'CONTACT NO',
    'DISTRICT',
    'BRAND',
    dealerLabel,
    'STATUS',
    'COMMIT',
    installerLabel,
    'NEGOTIATOR',
    'UPDATE',
    'PAYMENT',
  ]
}

function buildDriverHeaders() {
  return [
    'NO.',
    'TICKET NO',
    'NAME',
    'CONTACT NO',
    'DESTINATION',
    'DISTRICT',
    'STATUS',
    'DRIVER',
    'VEHICLE',
  ]
}

function installerRowToCells(row: ScheduleShowcaseRow, paymentByRowId?: Record<string, string>) {
  const payment = resolveRowPayment(row, paymentByRowId)
  return [
    String(row.index),
    showcaseCellText(row.ticketNumber),
    showcaseCellText(row.name),
    showcaseCellText(row.contact),
    showcaseCellText(row.district).toUpperCase(),
    showcaseCellText(row.brand),
    showcaseCellText(row.dealer).toUpperCase(),
    showcaseCellText(row.status),
    showcaseCellText(row.commit),
    showcaseCellText(row.installer),
    showcaseCellText(row.negotiator),
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
    pdfCellText(row.contact),
    pdfCellText(row.district),
    pdfCellText(row.brand),
    pdfCellText(row.dealer),
    pdfCellText(row.status),
    pdfCellText(row.commit),
    pdfCellText(row.installer),
    pdfCellText(row.negotiator),
    pdfCellText(row.update),
    pdfPaymentText(payment),
  ]
}

function driverRowToCells(row: ScheduleShowcaseRow) {
  return [
    String(row.index),
    showcaseCellText(row.ticketNumber),
    showcaseCellText(row.name),
    showcaseCellText(row.contact),
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
    pdfCellText(row.contact),
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
    fontSize: 7.5,
    cellPadding: 1.6,
    minCellHeight: 8.2,
    lineColor: [0, 0, 0] as [number, number, number],
    lineWidth: 0.2,
    textColor: [0, 0, 0] as [number, number, number],
    fillColor: [255, 255, 255] as [number, number, number],
    valign: 'top' as const, overflow: 'linebreak' as const,
  },
  headStyles: {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: [0, 0, 0] as [number, number, number],
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    fontSize: 7,
    cellPadding: 1.2,
    minCellHeight: 6.5,
    lineColor: [0, 0, 0] as [number, number, number],
  },
}

const INSTALLER_COLUMN_STYLES = {
  0: { halign: 'center' as const, cellWidth: 6 },
  1: { halign: 'center' as const, cellWidth: 15 },
  2: { cellWidth: 26 },
  3: { halign: 'center' as const, cellWidth: 20 },
  4: { cellWidth: 16 },
  5: { cellWidth: 18 },
  6: { cellWidth: 16 },
  7: { halign: 'center' as const, cellWidth: 18 },
  8: { cellWidth: 18 },
  9: { halign: 'center' as const, cellWidth: 18 },
  10: { halign: 'center' as const, cellWidth: 16 },
  11: { cellWidth: 38 },
  12: {
    halign: 'right' as const,
    cellWidth: 22,
    fontStyle: 'bold' as const,
    fontSize: 7.5,
    overflow: 'linebreak' as const,
  },
}

const DRIVER_COLUMN_STYLES = {
  0: { halign: 'center' as const, cellWidth: 9 },
  1: { halign: 'center' as const, cellWidth: 22 },
  2: { cellWidth: 38 },
  3: { halign: 'center' as const, cellWidth: 28 },
  4: { cellWidth: 52 },
  5: { cellWidth: 26 },
  6: { halign: 'center' as const, cellWidth: 30 },
  7: { halign: 'center' as const, cellWidth: 32 },
  8: { halign: 'center' as const, cellWidth: 24 },
}

function drawPdfDateTable(
  pdf: import('jspdf').jsPDF, autoTable: typeof import('jspdf-autotable').default,
  dateKey: string, dateLabel: string, sheetTitle?: string,
) {
  const { scheduleDate, dayName } = parseDateMeta(dateKey, dateLabel)
  const body: string[][] = [['DATE', scheduleDate], ['DAY', dayName]]
  if (sheetTitle) body.push(['SHEET', sheetTitle])
  autoTable(pdf, {
    startY: 6, margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X }, tableWidth: 62, body,
    ...PDF_BW_TABLE,
    styles: { ...PDF_BW_TABLE.styles, fontSize: 6.5, cellPadding: 1, minCellHeight: 5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 14 }, 1: { cellWidth: 48 } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const raw = String(data.cell.raw ?? '').trim()
        if (raw) data.cell.text = [raw.toUpperCase()]
      }
    },
  })
  const doc = pdf as import('jspdf').jsPDF & { lastAutoTable?: { finalY: number } }
  return doc.lastAutoTable?.finalY ?? 18
}

function drawPdfPaymentSummaryTable(
  pdf: import('jspdf').jsPDF, autoTable: typeof import('jspdf-autotable').default,
  summary: ReturnType<typeof computePaymentSummary>,
  pageWidth: number,
) {
  if (summary.grandTotal <= 0) return 18
  const body: (string | { content: string; styles?: any })[][] = []
  if (summary.totalCash > 0) {
    body.push(['CASH', `PHP ${summary.totalCash.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`])
  }
  if (summary.totalGcash > 0) {
    body.push(['GCASH', `PHP ${summary.totalGcash.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`])
  }
  if (summary.totalBankTransfer > 0) {
    body.push(['BANK / ONLINE', `PHP ${summary.totalBankTransfer.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`])
  }
  if (summary.totalOther > 0) {
    body.push(['OTHER', `PHP ${summary.totalOther.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`])
  }
  body.push([
    { content: 'TOTAL COLLECTION', styles: { fontStyle: 'bold' as const, fillColor: [240, 253, 244] as [number, number, number], textColor: [0, 0, 0] as [number, number, number] } },
    { content: `PHP ${summary.grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, styles: { fontStyle: 'bold' as const, fillColor: [240, 253, 244] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], halign: 'right' as const } }
  ])

  const tableWidth = 84
  const startX = pageWidth - PDF_MARGIN_X - tableWidth

  autoTable(pdf, {
    startY: 6,
    margin: { left: startX, right: PDF_MARGIN_X },
    tableWidth,
    body,
    ...PDF_BW_TABLE,
    styles: { ...PDF_BW_TABLE.styles, fontSize: 6.5, cellPadding: 1, minCellHeight: 4.8 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 36 },
      1: { cellWidth: 48, halign: 'right' }
    },
  })
  const doc = pdf as import('jspdf').jsPDF & { lastAutoTable?: { finalY: number } }
  return doc.lastAutoTable?.finalY ?? 18
}

async function exportShowcasePdfDocument(options: {
  filename: string; dateLabel: string; dateKey: string; isTaguigServices: boolean
  rows: ScheduleShowcaseRow[]; paymentByRowId?: Record<string, string>
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
  const paymentSummary = computePaymentSummary(rows, paymentByRowId)
  let globalPage = 0
  const drawFooter = (pageNo: number) => {
    const footerY = pdf.internal.pageSize.getHeight() - 5
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); pdf.setTextColor(0, 0, 0)
    pdf.text(`Page ${pageNo}`, pageWidth / 2, footerY, { align: 'center' })
  }
  installerPages.forEach((pageRows, pageIdx) => {
    if (globalPage > 0) pdf.addPage('a4', 'landscape')
    globalPage += 1
    const dateTableEndY = drawPdfDateTable(pdf, autoTable, dateKey, dateLabel, 'INSTALLER LIST')
    let summaryEndY = dateTableEndY
    if (paymentSummary.grandTotal > 0) {
      summaryEndY = drawPdfPaymentSummaryTable(pdf, autoTable, paymentSummary, pageWidth)
    }
    const tableStartY = Math.max(dateTableEndY, summaryEndY) + 3
    const body = pageRows.length > 0
      ? pageRows.map(r => installerRowToPdfCells(r, paymentByRowId))
      : [['No schedule tickets for this date.', '', '', '', '', '', '', '', '', '', '']]
    
    const isLastInstallerPage = pageIdx === installerPages.length - 1
    const foot: any = isLastInstallerPage && paymentSummary.grandTotal > 0 ? [
      [
        { content: '', colSpan: 10, styles: { fillColor: [255, 255, 255] as [number, number, number], lineWidth: 0 } },
        { content: 'TOTAL COLLECTION', colSpan: 2, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [240, 253, 244] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontSize: 7 } },
        { content: `PHP ${paymentSummary.grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [240, 253, 244] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontSize: 7 } }
      ]
    ] : undefined

    autoTable(pdf, {
      startY: tableStartY, margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X, top: 20, bottom: 10 },
      tableWidth, head: [installerHeaders], body, foot, showHead: 'everyPage', showFoot: 'lastPage', ...PDF_BW_TABLE,
      columnStyles: INSTALLER_COLUMN_STYLES,
      didParseCell: (data) => {
        if (data.row.section === 'body') {
          const statusText = (data.row.raw as unknown as unknown[])[7]
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
        startY: tableStartY, margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X, top: 20, bottom: 10 },
        tableWidth, head: [driverHeaders], body, showHead: 'everyPage', ...PDF_BW_TABLE,
        styles: { ...PDF_BW_TABLE.styles, fontSize: 7, minCellHeight: 7 },
        columnStyles: DRIVER_COLUMN_STYLES,
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
  }
  pdf.save(filename)
}

type SheetKind = 'installer' | 'driver'

export function SchedulesShowcase({
  open, onClose, branchLabel, dateLabel, dateKey = '',
  isTaguigServices, rows, paymentByRowId, onBeforeExport,
}: SchedulesShowcaseProps) {
  const [exportingPdf, setExportingPdf] = useState(false)
  const { scheduleDate, dayName } = parseDateMeta(dateKey, dateLabel)
  const installerPages = useMemo(() => chunkRows(rows, INSTALLER_ROWS_PER_PAGE), [rows])
  const driverPages = useMemo(() => chunkRows(rows, DRIVER_ROWS_PER_PAGE), [rows])
  const totalSheets = installerPages.length + (rows.length > 0 ? driverPages.length : 0)

  useEffect(() => {
    if (!open) return
    document.body.classList.add('showcase-mode-active')
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('showcase-mode-active')
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  const handlePrint = useCallback(() => { window.print() }, [])

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      onBeforeExport?.()
      const safeBranch = (branchLabel || 'schedule').replace(/[^\w-]+/g, '_')
      const safeDate = (dateLabel || 'all-dates').replace(/[^\w-]+/g, '_')
      await exportShowcasePdfDocument({
        filename: `ashcol-schedules_${safeBranch}_${safeDate}.pdf`,
        dateLabel, dateKey, isTaguigServices, rows, paymentByRowId,
      })
    } catch (err) {
      console.error('Schedules PDF export failed', err)
      const message = err instanceof Error ? err.message : String(err)
      const isStaleChunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)
      if (isStaleChunk) {
        if (window.confirm("This page was loaded before the latest update and can't load the PDF exporter. Reload now to try again?"))
          window.location.reload()
      } else {
        alert(`Could not export PDF (${message || 'unknown error'}). Try Print instead.`)
      }
    } finally { setExportingPdf(false) }
  }, [branchLabel, dateKey, dateLabel, exportingPdf, isTaguigServices, onBeforeExport, paymentByRowId, rows])

  const handleExportExcel = useCallback(() => {
    if (rows.length === 0) return
    const installerLabel = isTaguigServices ? 'TECHNICIAN' : 'INSTALLER'
    const dealerLabel = isTaguigServices ? 'ENDORSED BY' : 'DEALER / STORE'
    const wsData = rows.map(row => ({
      'NO.': row.index,
      'TICKET NO': showcaseCellText(row.ticketNumber),
      'NAME': showcaseCellText(row.name),
      'CONTACT NO': showcaseCellText(row.contact),
      'DESTINATION': showcaseCellText(row.destination),
      'DISTRICT': showcaseCellText(row.district),
      'BRAND': showcaseCellText(row.brand),
      [dealerLabel]: showcaseCellText(row.dealer),
      'STATUS': showcaseCellText(row.status),
      'COMMIT': showcaseCellText(row.commit),
      [installerLabel]: showcaseCellText(row.installer),
      'NEGOTIATOR': showcaseCellText(row.negotiator),
      'DRIVER': showcaseCellText(row.driver),
      'VEHICLE': showcaseCellText(row.service),
      'UPDATE': showcaseCellText(row.update),
      'PAYMENT': showcaseCellText(resolveRowPayment(row, paymentByRowId)),
    }))
    const ws = XLSX.utils.json_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, (scheduleDate || 'Schedule').slice(0, 31))
    const safeBranch = (branchLabel || 'schedule').replace(/[^\w-]+/g, '_')
    const safeDate = (dateLabel || 'all-dates').replace(/[^\w-]+/g, '_')
    XLSX.writeFile(wb, `ashcol-schedules_${safeBranch}_${safeDate}.xlsx`)
  }, [rows, isTaguigServices, paymentByRowId, scheduleDate, branchLabel, dateLabel])

  if (!open) return null

  const installerHeaders = buildInstallerHeaders(isTaguigServices)
  const driverHeaders = buildDriverHeaders()
  const paymentSummary = computePaymentSummary(rows, paymentByRowId)

  const renderDateTable = (sheetTitle: string) => (
    <div className="p-2 md:p-3 flex items-start justify-between gap-4" style={{ borderBottom: `1px solid ${TABLE_BORDER}` }}>
      <table className="schedules-showcase-date-table" style={{ borderCollapse: 'collapse', width: '240px', maxWidth: '100%' }}>
        <tbody>
          <tr><td style={dateLabelCell}>Date</td><td style={dateValueCell}>{scheduleDate}</td></tr>
          <tr><td style={dateLabelCell}>Day</td><td style={dateValueCell}>{dayName}</td></tr>
          <tr><td style={dateLabelCell}>Sheet</td><td style={dateValueCell}>{sheetTitle}</td></tr>
        </tbody>
      </table>

      {sheetTitle === 'INSTALLER LIST' && paymentSummary.grandTotal > 0 && (
        <table className="schedules-showcase-payment-summary" style={{ borderCollapse: 'collapse', width: '280px', maxWidth: '100%', fontSize: '10px' }}>
          <tbody>
            {paymentSummary.totalCash > 0 && (
              <tr>
                <td style={{ ...dateLabelCell, padding: '2px 6px', fontWeight: 600 }}>CASH</td>
                <td style={{ ...dateValueCell, padding: '2px 6px', textAlign: 'right', fontWeight: 700 }}>
                  PHP {paymentSummary.totalCash.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}
            {paymentSummary.totalGcash > 0 && (
              <tr>
                <td style={{ ...dateLabelCell, padding: '2px 6px', fontWeight: 600 }}>GCASH</td>
                <td style={{ ...dateValueCell, padding: '2px 6px', textAlign: 'right', fontWeight: 700 }}>
                  PHP {paymentSummary.totalGcash.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}
            {paymentSummary.totalBankTransfer > 0 && (
              <tr>
                <td style={{ ...dateLabelCell, padding: '2px 6px', fontWeight: 600 }}>BANK / ONLINE</td>
                <td style={{ ...dateValueCell, padding: '2px 6px', textAlign: 'right', fontWeight: 700 }}>
                  PHP {paymentSummary.totalBankTransfer.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}
            {paymentSummary.totalOther > 0 && (
              <tr>
                <td style={{ ...dateLabelCell, padding: '2px 6px', fontWeight: 600 }}>OTHER</td>
                <td style={{ ...dateValueCell, padding: '2px 6px', textAlign: 'right', fontWeight: 700 }}>
                  PHP {paymentSummary.totalOther.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}
            <tr style={{ backgroundColor: '#f0fdf4', color: '#000000' }}>
              <td style={{ ...dateLabelCell, padding: '3px 6px', fontWeight: 800, color: '#000000', backgroundColor: '#f0fdf4' }}>
                TOTAL COLLECTION
              </td>
              <td style={{ ...dateValueCell, padding: '3px 6px', textAlign: 'right', fontWeight: 900, color: '#000000', backgroundColor: '#f0fdf4' }}>
                PHP {paymentSummary.grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )

  const renderInstallerTable = (pageRows: ScheduleShowcaseRow[], isLastPage: boolean = false) => (
    <div className="overflow-x-auto">
      <table className="schedules-showcase-table schedules-showcase-installer"
        style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: PAPER, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '3%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead><tr>{installerHeaders.map(l => <th key={l} style={thStyle}>{l}</th>)}</tr></thead>
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
                      textAlign: cellIdx === 12 ? 'right' : [0, 1, 3, 7, 9, 10].includes(cellIdx) ? 'center' : 'left',
                      fontWeight: cellIdx === 12 ? 700 : cellIdx === 7 ? 600 : 500,
                      fontSize: cellIdx === 11 || cellIdx === 12 ? '9px' : '9.5px',
                    }}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {isLastPage && paymentSummary.grandTotal > 0 && (
          <tfoot>
            <tr style={{ backgroundColor: '#f0fdf4', color: '#000000' }}>
              <td colSpan={11} style={{ border: 'none', backgroundColor: 'transparent' }} />
              <td style={{ ...thStyle, textAlign: 'right', fontWeight: 800, fontSize: '9.5px', backgroundColor: '#f0fdf4', color: '#000000', padding: '4px 6px' }}>
                TOTAL COLLECTION
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: '10px', backgroundColor: '#f0fdf4', color: '#000000', padding: '4px 6px' }}>
                PHP {paymentSummary.grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )

  const renderDriverTable = (pageRows: ScheduleShowcaseRow[]) => (
    <div className="overflow-x-auto">
      <table className="schedules-showcase-table schedules-showcase-driver"
        style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: PAPER, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead><tr>{driverHeaders.map(l => <th key={l} style={thStyle}>{l}</th>)}</tr></thead>
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
                      textAlign: [0, 1, 3, 6, 7, 8].includes(cellIdx) ? 'center' : 'left',
                      fontWeight: cellIdx === 6 ? 700 : 500,
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

  const renderSheet = (kind: SheetKind, pageRows: ScheduleShowcaseRow[], pageIdx: number, pageCount: number, isLast: boolean) => {
    const title = kind === 'installer' ? 'INSTALLER LIST' : 'DRIVER LIST'
    return (
      <div key={`${kind}-page-${pageIdx}`}
        className={`schedules-showcase-sheet mx-auto ${!isLast ? 'showcase-page-break' : ''}`}
        style={{ maxWidth: '1123px', width: '100%', backgroundColor: PAPER, border: '1px solid #dbe5ef',
          boxShadow: '0 12px 40px rgba(15,23,42,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: !isLast ? 24 : 0 }}>
        {renderDateTable(title)}
        {kind === 'installer' ? renderInstallerTable(pageRows, pageIdx === pageCount - 1) : renderDriverTable(pageRows)}
        {pageCount > 1 && (
          <div className="no-print px-3 py-1.5 text-right text-[10px] font-semibold text-slate-500"
            style={{ borderTop: `1px solid ${TABLE_BORDER}` }}>
            {title} &middot; Page {pageIdx + 1} of {pageCount}
          </div>
        )}
      </div>
    )
  }

  const sheets: React.ReactNode[] = []
  installerPages.forEach((pageRows, pageIdx) => {
    const isLastOverall = pageIdx === installerPages.length - 1 && rows.length === 0
    sheets.push(renderSheet('installer', pageRows, pageIdx, installerPages.length, isLastOverall))
  })
  if (rows.length > 0) {
    driverPages.forEach((pageRows, pageIdx) => {
      sheets.push(renderSheet('driver', pageRows, pageIdx, driverPages.length, pageIdx === driverPages.length - 1))
    })
  }

  return (
    <>
      <div className="schedules-showcase-overlay fixed inset-0 z-[10000] overflow-auto" style={{ backgroundColor: '#f1f5f9' }}>
        <div className="min-h-screen flex flex-col">
          <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8"
            style={{ backgroundColor: 'rgba(241,245,249,0.96)', borderBottom: '1px solid #cbd5e1', backdropFilter: 'blur(10px)' }}>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Schedules Showcase</div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {branchLabel || 'Branch'} &middot; {scheduleDate} &middot; {dayName}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                PDF / Print: A4 Landscape &middot; Installer ({INSTALLER_ROWS_PER_PAGE}/page) + Driver ({DRIVER_ROWS_PER_PAGE}/page)
                {totalSheets > 1 ? ` &middot; ${totalSheets} sheets` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={handlePrint}
                className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold text-slate-700 bg-white border border-slate-300">
                <Printer className="w-4 h-4" />Print
              </button>
              <button type="button" onClick={() => void handleExportPdf()}
                disabled={exportingPdf || rows.length === 0}
                className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: HEADER_GREEN, border: `1px solid ${HEADER_GREEN_DARK}` }}>
                {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Export PDF
              </button>
              <button type="button" onClick={handleExportExcel}
                disabled={rows.length === 0}
                title="Export this list to Excel"
                className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold text-slate-700 bg-white border border-slate-300 disabled:opacity-50">
                <Sheet className="w-4 h-4" />
                Export Excel
              </button>
              <button type="button" onClick={onClose}
                className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold text-white"
                style={{ backgroundColor: HEADER_GREEN, border: `1px solid ${HEADER_GREEN_DARK}` }}>
                <ArrowLeft className="w-4 h-4" />Back
              </button>
              <button type="button" onClick={onClose}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-300 text-slate-700"
                aria-label="Close showcase">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 px-4 py-6 md:px-8 md:py-10 print-area">{sheets}</div>
        </div>
      </div>

      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: static !important; inset: auto !important; margin: 0 !important;
            padding: 0 !important; border: none !important; box-shadow: none !important;
            border-radius: 0 !important; max-width: none !important; width: 100% !important;
            background: #ffffff !important; color: #000000 !important;
          }
          .schedules-showcase-sheet {
            box-shadow: none !important; border-radius: 0 !important;
            margin-bottom: 0 !important; max-width: none !important; border: none !important;
          }
          .print-area * { background: #ffffff !important; color: #000000 !important; box-shadow: none !important; }
          .no-print { display: none !important; }
          .showcase-page-break { page-break-after: always !important; break-after: page !important; }
          .schedules-showcase-overlay { position: static !important; overflow: visible !important; background: #ffffff !important; }
          .schedules-showcase-table td, .schedules-showcase-table th, .schedules-showcase-date-table td {
            color: #000000 !important; background: #ffffff !important; border-color: #000000 !important;
          }
        }
        body.showcase-mode-active aside, body.showcase-mode-active header { display: none !important; }
        body.showcase-mode-active main { padding: 0 !important; margin: 0 !important; }
        .schedules-showcase-overlay { left: 0 !important; right: 0 !important; top: 0 !important; bottom: 0 !important; }
      `}</style>
    </>
  )
}

const dateLabelCell: React.CSSProperties = {
  border: `1px solid ${TABLE_BORDER}`, padding: '4px 8px', fontWeight: 800,
  fontSize: '9px', textTransform: 'uppercase', backgroundColor: PAPER, color: INK, width: 52,
}
const dateValueCell: React.CSSProperties = {
  border: `1px solid ${TABLE_BORDER}`, padding: '4px 8px', fontWeight: 700,
  fontSize: '10px', backgroundColor: PAPER, color: INK,
}
const thStyle: React.CSSProperties = {
  backgroundColor: PAPER,
  color: INK,
  border: `1px solid ${TABLE_BORDER}`,
  padding: '5px 3px',
  fontSize: '9px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  verticalAlign: 'middle',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  border: `1px solid ${TABLE_BORDER}`,
  padding: '6px 4px',
  color: INK,
  backgroundColor: PAPER,
  verticalAlign: 'top',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  lineHeight: 1.35,
}
const emptyCellStyle: React.CSSProperties = {
  padding: '24px 12px', textAlign: 'center', color: INK, fontWeight: 600,
  border: `1px solid ${TABLE_BORDER}`, backgroundColor: PAPER, fontSize: '10px',
}
