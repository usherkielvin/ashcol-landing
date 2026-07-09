import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, FileDown, Loader2, Printer, X } from 'lucide-react'

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

/** Philippines Long Bond — landscape 13" × 8.5" */
const PDF_PAGE = { orientation: 'landscape' as const, unit: 'in' as const, format: [8.5, 13] as [number, number] }
const PDF_MARGIN_X = 0.28

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

  // Amount only — format with commas
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

function buildHeaders(isTaguigServices: boolean) {
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

function rowToCells(row: ScheduleShowcaseRow, paymentByRowId?: Record<string, string>) {
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

function rowToPdfCells(row: ScheduleShowcaseRow, paymentByRowId?: Record<string, string>) {
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

function buildBody(rows: ScheduleShowcaseRow[], paymentByRowId?: Record<string, string>) {
  return rows.map(row => rowToPdfCells(row, paymentByRowId))
}

const PDF_BW_TABLE = {
  theme: 'grid' as const,
  styles: {
    font: 'helvetica',
    fontSize: 7,
    cellPadding: 0.09,
    minCellHeight: 0.32,
    lineColor: [0, 0, 0] as [number, number, number],
    lineWidth: 0.012,
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
    fontSize: 6.5,
    cellPadding: 0.08,
    minCellHeight: 0.26,
    lineColor: [0, 0, 0] as [number, number, number],
  },
}

function drawPdfDateTable(
  pdf: import('jspdf').jsPDF,
  autoTable: typeof import('jspdf-autotable').default,
  dateKey: string,
  dateLabel: string,
) {
  const { scheduleDate, dayName } = parseDateMeta(dateKey, dateLabel)
  autoTable(pdf, {
    startY: 0.2,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X },
    tableWidth: 2.45,
    body: [
      ['DATE', scheduleDate],
      ['DAY', dayName],
    ],
    ...PDF_BW_TABLE,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 0.52 },
      1: { cellWidth: 1.93 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const raw = String(data.cell.raw ?? '').trim()
        if (raw && raw !== '—') data.cell.text = [raw.toUpperCase()]
      }
    },
  })
  const doc = pdf as import('jspdf').jsPDF & { lastAutoTable?: { finalY: number } }
  return doc.lastAutoTable?.finalY ?? 0.58
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
  const headers = buildHeaders(isTaguigServices)
  const body = buildBody(rows, paymentByRowId)

  const drawDateHeader = () => drawPdfDateTable(pdf, autoTable, dateKey, dateLabel)
  let tableStartY = drawDateHeader() + 0.14

  autoTable(pdf, {
    startY: tableStartY,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X, top: 0.72, bottom: 0.35 },
    tableWidth,
    head: [headers],
    body: rows.length > 0
      ? body
      : [['No schedule tickets for this date.', '', '', '', '', '', '', '', '', '', '']],
    showHead: 'everyPage',
    ...PDF_BW_TABLE,
    columnStyles: {
      0: { halign: 'center', cellWidth: 0.35 },
      1: { halign: 'center', cellWidth: 0.85 },
      2: { cellWidth: 1.35 },
      3: { cellWidth: 0.82 },
      4: { cellWidth: 0.95 },
      5: { cellWidth: 0.82 },
      6: { halign: 'center', cellWidth: 1.05 },
      7: { cellWidth: 1.05 },
      8: { halign: 'center', cellWidth: 0.82 },
      9: { cellWidth: 2.30 },
      10: {
        halign: 'right',
        cellWidth: 2.08,
        fontStyle: 'bold',
        fontSize: 7.5,
        overflow: 'linebreak' as const,
      },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawDateHeader()
      }
      const footerY = pdf.internal.pageSize.getHeight() - 0.2
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.5)
      pdf.setTextColor(0, 0, 0)
      pdf.text(`Page ${data.pageNumber}`, pageWidth / 2, footerY, { align: 'center' })
    },
  })

  pdf.save(filename)
}

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

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

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
      alert('Could not export PDF. Try Print instead.')
    } finally {
      setExportingPdf(false)
    }
  }, [branchLabel, dateKey, dateLabel, exportingPdf, isTaguigServices, onBeforeExport, paymentByRowId, rows])

  if (!open) return null

  const headers = buildHeaders(isTaguigServices)

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
                PDF / Print: Landscape Long 8.5″ × 13″ · black &amp; white
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold text-slate-700 bg-white border border-slate-300"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={exportingPdf || rows.length === 0}
                className="h-10 rounded-xl flex items-center justify-center gap-2 px-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: HEADER_GREEN, border: `1px solid ${HEADER_GREEN_DARK}` }}
              >
                {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Export PDF
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

          <div className="flex-1 px-4 py-6 md:px-8 md:py-10">
            <div
              className="schedules-showcase-sheet print-area mx-auto"
              style={{
                maxWidth: '1800px',
                width: '100%',
                backgroundColor: PAPER,
                border: '1px solid #dbe5ef',
                boxShadow: '0 24px 80px rgba(15,23,42,0.12)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div className="p-3 md:p-4" style={{ borderBottom: `1px solid ${TABLE_BORDER}` }}>
                <table
                  className="schedules-showcase-date-table"
                  style={{ borderCollapse: 'collapse', width: '220px', maxWidth: '100%' }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          border: `1px solid ${TABLE_BORDER}`,
                          padding: '6px 10px',
                          fontWeight: 800,
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          backgroundColor: PAPER,
                          color: INK,
                          width: 56,
                        }}
                      >
                        Date
                      </td>
                      <td
                        style={{
                          border: `1px solid ${TABLE_BORDER}`,
                          padding: '6px 10px',
                          fontWeight: 700,
                          fontSize: '11px',
                          backgroundColor: PAPER,
                          color: INK,
                        }}
                      >
                        {scheduleDate}
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          border: `1px solid ${TABLE_BORDER}`,
                          padding: '6px 10px',
                          fontWeight: 800,
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          backgroundColor: PAPER,
                          color: INK,
                        }}
                      >
                        Day
                      </td>
                      <td
                        style={{
                          border: `1px solid ${TABLE_BORDER}`,
                          padding: '6px 10px',
                          fontWeight: 700,
                          fontSize: '11px',
                          backgroundColor: PAPER,
                          color: INK,
                        }}
                      >
                        {dayName}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto">
                <table
                  className="schedules-showcase-table"
                  style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: PAPER }}
                >
                  <thead>
                    <tr>
                      {headers.map((label, headerIdx) => {
                        const isStatus = headerIdx === 6
                        const isPayment = headerIdx === 10
                        return (
                        <th
                          key={label}
                          style={{
                            backgroundColor: PAPER,
                            color: INK,
                            border: `1px solid ${TABLE_BORDER}`,
                            padding: '7px 5px',
                            fontSize: isPayment ? '9px' : '9.5px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            verticalAlign: 'middle',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            minWidth: isStatus ? 100 : isPayment ? 130 : undefined,
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
                        <td
                          colSpan={headers.length}
                          style={{
                            padding: '32px 16px',
                            textAlign: 'center',
                            color: INK,
                            fontWeight: 600,
                            border: `1px solid ${TABLE_BORDER}`,
                            backgroundColor: PAPER,
                          }}
                        >
                          No schedule tickets for this date.
                        </td>
                      </tr>
                    ) : rows.map(row => {
                      const cells = rowToCells(row, paymentByRowId)
                      return (
                        <tr key={`${row.index}-${row.id}`}>
                           {cells.map((value, cellIdx) => {
                            const isUpdate = cellIdx === 9
                            const isName = cellIdx === 2
                            const isCommit = cellIdx === 7
                            const isStatus = cellIdx === 6
                            const isPayment = cellIdx === 10
                            const isBrand = cellIdx === 4
                            const isTicketNo = cellIdx === 1
                            const wrap = isUpdate || isName || isCommit || isPayment || isBrand || isStatus || isTicketNo
                            const center = [0, 1, 6, 8].includes(cellIdx)
                            return (
                              <td
                                key={cellIdx}
                                style={{
                                  border: `1px solid ${TABLE_BORDER}`,
                                  padding: '8px 7px',
                                  fontSize: isPayment ? '9px' : isUpdate ? '10px' : '9.5px',
                                  fontWeight: isPayment ? 700 : isStatus ? 600 : 500,
                                  color: INK,
                                  backgroundColor: PAPER,
                                  verticalAlign: 'top',
                                  textAlign: isPayment ? 'right' : center ? 'center' : 'left',
                                  whiteSpace: wrap ? 'pre-wrap' : 'nowrap',
                                  wordBreak: wrap ? 'break-word' : 'normal',
                                  minWidth: isUpdate ? 220 : isPayment ? 130 : isStatus ? 100 : undefined,
                                  lineHeight: 1.4,
                                }}
                              >
                                {value}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @page {
          size: 13in 8.5in landscape;
          margin: 0.28in;
        }
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: fixed !important;
            inset: 0 !important;
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
          .print-area * {
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
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
