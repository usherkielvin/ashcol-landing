import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileDown, Loader2, Printer, X } from 'lucide-react'

export type ScheduleShowcaseRow = {
  index: number
  ticketNo: string
  customer: string
  district: string
  brand: string
  dealer: string
  commit: string
  negotiator: string
  installer: string
  driver: string
  status: string
  remarks: string
  paymentMode: string
  paymentAmount: string
}

type SchedulesShowcaseProps = {
  open: boolean
  onClose: () => void
  branchLabel: string
  dateLabel: string
  isTaguigServices: boolean
  rows: ScheduleShowcaseRow[]
}

const HEADER_GREEN = '#16a34a'
const HEADER_GREEN_DARK = '#15803d'
const TABLE_BORDER = '#cbd5e1'
const HEADER_BG = '#ecfdf5'
const HEADER_TEXT = '#14532d'

/** Philippines Long Bond — landscape 13" × 8.5" */
const PDF_PAGE = { orientation: 'landscape' as const, unit: 'in' as const, format: [8.5, 13] as [number, number] }
const PDF_MARGIN_X = 0.35
const PDF_HEADER_HEIGHT = 0.72

function paymentCell(row: ScheduleShowcaseRow) {
  const mode = row.paymentMode.trim().toUpperCase()
  if (mode === 'FREE' || mode === 'FREE INSTALL') return 'FREE'
  if (mode && row.paymentAmount) return `${mode} — ₱${row.paymentAmount}`
  if (mode) return mode
  if (row.paymentAmount) return `₱${row.paymentAmount}`
  return '—'
}

function buildHeaders(isTaguigServices: boolean) {
  const installerLabel = isTaguigServices ? 'TECHNICIAN' : 'INSTALLER'
  const dealerLabel = isTaguigServices ? 'ENDORSED BY' : 'DEALER'
  return [
    '#',
    'TICKET NO',
    'CUSTOMER',
    'DISTRICT',
    'BRAND',
    dealerLabel,
    'COMMIT',
    'NEGOTIATOR',
    installerLabel,
    'DRIVER',
    'STATUS',
    'REMARKS',
    'PAYMENT',
  ]
}

function buildBody(rows: ScheduleShowcaseRow[]) {
  return rows.map(row => [
    String(row.index),
    row.ticketNo || '—',
    row.customer || '—',
    row.district || '—',
    row.brand || '—',
    row.dealer || '—',
    row.commit || '—',
    row.negotiator || '—',
    row.installer || '—',
    row.driver || '—',
    row.status || '—',
    row.remarks || '—',
    paymentCell(row),
  ])
}

function drawPdfTitleBlock(
  pdf: import('jspdf').jsPDF,
  branchLabel: string,
  dateLabel: string,
  rowCount: number,
) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  pdf.setFillColor(22, 163, 74)
  pdf.rect(0, 0, pageWidth, PDF_HEADER_HEIGHT, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text(
    `${(branchLabel || 'BRANCH').toUpperCase()} — DAILY SCHEDULE`,
    pageWidth / 2,
    0.3,
    { align: 'center' },
  )
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(
    `${dateLabel} · ${rowCount} ticket${rowCount === 1 ? '' : 's'}`,
    pageWidth / 2,
    0.52,
    { align: 'center' },
  )
}

async function exportShowcasePdfDocument(options: {
  filename: string
  branchLabel: string
  dateLabel: string
  isTaguigServices: boolean
  rows: ScheduleShowcaseRow[]
}) {
  const { filename, branchLabel, dateLabel, isTaguigServices, rows } = options
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const pdf = new jsPDF(PDF_PAGE)
  const pageWidth = pdf.internal.pageSize.getWidth()
  const tableWidth = pageWidth - PDF_MARGIN_X * 2
  const headers = buildHeaders(isTaguigServices)
  const body = buildBody(rows)

  drawPdfTitleBlock(pdf, branchLabel, dateLabel, rows.length)

  autoTable(pdf, {
    startY: PDF_HEADER_HEIGHT + 0.12,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X, top: PDF_HEADER_HEIGHT + 0.12, bottom: 0.45 },
    tableWidth,
    head: [headers],
    body: rows.length > 0 ? body : [['—', '—', 'No schedule tickets for this date.', '', '', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    showHead: 'everyPage',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 0.07,
      lineColor: [203, 213, 225],
      lineWidth: 0.012,
      textColor: [15, 23, 42],
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [236, 253, 245],
      textColor: [20, 83, 45],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 6.5,
      cellPadding: 0.08,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 0.28 },
      1: { halign: 'center', cellWidth: 0.72 },
      2: { cellWidth: 1.35 },
      3: { cellWidth: 0.85 },
      4: { cellWidth: 0.85 },
      5: { cellWidth: 0.8 },
      6: { cellWidth: 1.05 },
      7: { cellWidth: 0.95 },
      8: { cellWidth: 0.95 },
      9: { cellWidth: 0.85 },
      10: { halign: 'center', cellWidth: 0.72 },
      11: { cellWidth: 2.35 },
      12: { cellWidth: 1.05 },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawPdfTitleBlock(pdf, branchLabel, dateLabel, rows.length)
      }
      const footerY = pdf.internal.pageSize.getHeight() - 0.28
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(100, 116, 139)
      pdf.text(
        `Ashcol Portal · Page ${data.pageNumber} · ${new Date().toLocaleString('en-PH')}`,
        pageWidth / 2,
        footerY,
        { align: 'center' },
      )
    },
  })

  pdf.save(filename)
}

export function SchedulesShowcase({
  open,
  onClose,
  branchLabel,
  dateLabel,
  isTaguigServices,
  rows,
}: SchedulesShowcaseProps) {
  const captureAreaRef = useRef<HTMLDivElement>(null)
  const [exportingPdf, setExportingPdf] = useState(false)

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
      const safeBranch = (branchLabel || 'schedule').replace(/[^\w\-]+/g, '_')
      const safeDate = (dateLabel || 'all-dates').replace(/[^\w\-]+/g, '_')
      await exportShowcasePdfDocument({
        filename: `ashcol-schedules_${safeBranch}_${safeDate}.pdf`,
        branchLabel,
        dateLabel,
        isTaguigServices,
        rows,
      })
    } catch (err) {
      console.error('Schedules PDF export failed', err)
      alert('Could not export PDF. Try Print instead.')
    } finally {
      setExportingPdf(false)
    }
  }, [branchLabel, dateLabel, exportingPdf, isTaguigServices, rows])

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
                {branchLabel || 'Branch'} · {dateLabel}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                PDF: Landscape Long 8.5″ × 13″
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
              ref={captureAreaRef}
              className="schedules-showcase-sheet print-area mx-auto"
              style={{
                maxWidth: '1800px',
                width: '100%',
                backgroundColor: '#ffffff',
                border: '1px solid #dbe5ef',
                boxShadow: '0 24px 80px rgba(15,23,42,0.12)',
                borderRadius: 18,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: `linear-gradient(135deg, ${HEADER_GREEN}, ${HEADER_GREEN_DARK})`,
                  padding: '18px 24px 16px',
                  textAlign: 'center',
                  borderBottom: `5px solid ${HEADER_GREEN_DARK}`,
                }}
              >
                <div
                  style={{
                    color: '#ffffff',
                    fontWeight: 950,
                    fontSize: 'clamp(22px, 2.8vw, 38px)',
                    lineHeight: 1.05,
                    textTransform: 'uppercase',
                  }}
                >
                  {(branchLabel || 'BRANCH').toUpperCase()} — DAILY SCHEDULE
                </div>
                <div
                  style={{
                    color: 'rgba(255,255,255,0.92)',
                    fontWeight: 900,
                    fontSize: 'clamp(13px, 1.3vw, 20px)',
                    marginTop: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  {dateLabel} · {rows.length} ticket{rows.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table
                  className="schedules-showcase-table"
                  style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#ffffff' }}
                >
                  <thead>
                    <tr>
                      {headers.map(label => (
                        <th
                          key={label}
                          style={{
                            backgroundColor: HEADER_BG,
                            color: HEADER_TEXT,
                            border: `1px solid ${TABLE_BORDER}`,
                            padding: '10px 8px',
                            fontSize: '11px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            verticalAlign: 'middle',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {label}
                        </th>
                      ))}
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
                            color: '#64748b',
                            fontWeight: 600,
                            border: `1px solid ${TABLE_BORDER}`,
                            backgroundColor: '#ffffff',
                          }}
                        >
                          No schedule tickets for this date.
                        </td>
                      </tr>
                    ) : rows.map(row => (
                      <tr key={`${row.index}-${row.ticketNo}`}>
                        {[
                          String(row.index),
                          row.ticketNo || '—',
                          row.customer || '—',
                          row.district || '—',
                          row.brand || '—',
                          row.dealer || '—',
                          row.commit || '—',
                          row.negotiator || '—',
                          row.installer || '—',
                          row.driver || '—',
                          row.status || '—',
                          row.remarks || '—',
                          paymentCell(row),
                        ].map((value, cellIdx) => {
                          const isRemarks = cellIdx === 11
                          const isPayment = cellIdx === 12
                          const isCustomer = cellIdx === 2
                          const isCommit = cellIdx === 6
                          const wrap = isRemarks || isPayment || isCustomer || isCommit
                          return (
                            <td
                              key={cellIdx}
                              style={{
                                border: `1px solid ${TABLE_BORDER}`,
                                padding: '8px 10px',
                                fontSize: isRemarks ? '11px' : '10.5px',
                                fontWeight: cellIdx === 0 || cellIdx === 1 ? 700 : 500,
                                color: '#0f172a',
                                backgroundColor: '#ffffff',
                                verticalAlign: 'top',
                                textAlign: cellIdx <= 1 || cellIdx >= 10 ? 'center' : 'left',
                                whiteSpace: wrap ? 'pre-wrap' : 'nowrap',
                                wordBreak: wrap ? 'break-word' : 'normal',
                                minWidth: isRemarks ? 220 : isPayment ? 120 : undefined,
                                maxWidth: isRemarks ? 360 : undefined,
                                lineHeight: 1.45,
                              }}
                            >
                              {value}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  padding: '10px 16px',
                  borderTop: `1px solid ${TABLE_BORDER}`,
                  backgroundColor: '#f8fafc',
                  color: '#64748b',
                  fontSize: '10px',
                  fontWeight: 600,
                  textAlign: 'right',
                }}
              >
                Generated from Ashcol Portal · {new Date().toLocaleString('en-PH')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @page {
          size: 13in 8.5in landscape;
          margin: 0.35in;
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
          }
          .no-print { display: none !important; }
          .schedules-showcase-overlay {
            position: static !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          .schedules-showcase-table td,
          .schedules-showcase-table th {
            color: #000000 !important;
            background: #ffffff !important;
          }
          .schedules-showcase-table thead th {
            background: #ecfdf5 !important;
            color: #14532d !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
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
