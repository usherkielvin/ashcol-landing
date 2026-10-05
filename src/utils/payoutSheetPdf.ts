import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { pdfSafe } from './payoutPdf'

/** One printed line on the weekly installer payout sheet. */
export interface PayoutSheetEntry {
  key: string
  lastName: string
  firstName: string
  net: number
  /** e.g. "0906 253 1269"; empty when the member has no number on file. */
  account: string
  /** Shown under the account number, e.g. "GCASH ACCOUNT". */
  accountLabel: string
}

export interface PayoutSheetData {
  branchLabel: string
  /** ISO yyyy-mm-dd */
  weekFrom: string
  weekTo: string
  isFinal: boolean
  entries: PayoutSheetEntry[]
}

/** "LAST, FIRST" or "FIRST MIDDLE LAST" → last / first. Best effort — the sheet preview is editable. */
export function splitMemberName(full: string): { lastName: string; firstName: string } {
  const name = (full || '').trim().replace(/\s+/g, ' ')
  if (!name) return { lastName: '', firstName: '' }
  if (name.includes(',')) {
    const [last, ...rest] = name.split(',')
    return { lastName: last.trim().toUpperCase(), firstName: rest.join(' ').trim().toUpperCase() }
  }
  const parts = name.split(' ')
  if (parts.length === 1) return { lastName: parts[0].toUpperCase(), firstName: '' }
  return { lastName: parts[parts.length - 1].toUpperCase(), firstName: parts.slice(0, -1).join(' ').toUpperCase() }
}

/** 09062531269 / +639062531269 → "0906 253 1269"; anything else is returned trimmed. */
export function formatPhoneNumber(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  const local = digits.startsWith('63') && digits.length === 12 ? `0${digits.slice(2)}` : digits
  if (local.length === 11 && local.startsWith('09')) return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  return (raw || '').trim()
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
export function sheetDate(iso: string, addDays = 0): string {
  const [y, m, d] = (iso || '').split('-').map(Number)
  if (!y || !m || !d) return ''
  const date = new Date(y, m - 1, d + addDays)
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

export const sheetPeso = (n: number): string =>
  `${n < 0 ? '-' : ''}PHP ${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Strips "ASHCOL" / "BRANCH" noise so the title reads "ASHCOL DASMARIÑAS INSTALLER'S WEEKLY PAYROLL & ALLOWANCE". */
export const sheetBranchTitle = (branchLabel: string): string => `ASHCOL ${branchLabel.replace(/^ASHCOL\s+/i, '').toUpperCase()} INSTALLER'S WEEKLY PAYROLL & ALLOWANCE`

export function exportPayoutSheetPdf(data: PayoutSheetData, filename: string): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 14
  const tableW = pageW - margin * 2
  const TINT: [number, number, number] = [220, 252, 231]
  const TINT_SOFT: [number, number, number] = [240, 253, 244]
  const INK: [number, number, number] = [15, 23, 42]
  const LINE: [number, number, number] = [30, 41, 59]
  const total = data.entries.reduce((s, e) => s + e.net, 0)

  // Letterhead — drawn as a table so its borders line up exactly with the roster table below.
  autoTable(pdf, {
    startY: margin,
    margin: { left: margin, right: margin },
    tableWidth: tableW,
    theme: 'grid',
    styles: { font: 'helvetica', halign: 'center', valign: 'middle', textColor: INK, lineColor: LINE, lineWidth: 0.25, cellPadding: 1.6, fontSize: 8.5 },
    body: [
      [{ content: 'ASHCOL AIRCONDITIONING CORP', styles: { textColor: [21, 128, 61], fontStyle: 'bold', fontSize: 10, fillColor: [255, 255, 255] } }],
      [{ content: pdfSafe(sheetBranchTitle(data.branchLabel)), styles: { fontStyle: 'bold', fillColor: TINT, fontSize: 9.5 } }],
      [{ content: `CUT-OFF DATE: ${sheetDate(data.weekFrom)} - ${sheetDate(data.weekTo)}`, styles: { fillColor: TINT_SOFT, fontSize: 8.5 } }],
      [{ content: `PAYROLL DATE: ${sheetDate(data.weekTo, 2)}${data.isFinal ? '   |   FINAL' : ''}`, styles: { fillColor: TINT_SOFT, fontSize: 8.5 } }],
    ],
  })

  const startY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  autoTable(pdf, {
    startY,
    margin: { left: margin, right: margin, bottom: margin + 6 },
    tableWidth: tableW,
    theme: 'grid',
    styles: { font: 'helvetica', valign: 'middle', textColor: INK, lineColor: LINE, lineWidth: 0.25, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, fontSize: 8.5, minCellHeight: 13 },
    headStyles: { fillColor: TINT, fontStyle: 'bold', halign: 'center', minCellHeight: 11, fontSize: 8.5 },
    footStyles: { fillColor: TINT, fontStyle: 'bold', textColor: INK, minCellHeight: 10 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center', fontStyle: 'bold', cellWidth: 34 },
      4: { halign: 'center', cellWidth: 38 },
      5: { halign: 'center', cellWidth: 42 },
    },
    head: [['', 'LAST NAME', 'FIRST NAME', 'NET LABOR\nCOST', 'G-CASH/BANK\nACCOUNT', 'SIGNATURE']],
    body: data.entries.map((e, i) => [
      String(i + 1),
      pdfSafe(e.lastName),
      pdfSafe(e.firstName),
      pdfSafe(sheetPeso(e.net)),
      e.account ? `${pdfSafe(e.account)}\n(${pdfSafe(e.accountLabel)})` : '-',
      '',
    ]),
    foot: [[
      { content: 'TOTAL', colSpan: 3, styles: { halign: 'center' } },
      { content: pdfSafe(sheetPeso(total)), styles: { halign: 'center' } },
      { content: '', colSpan: 2 },
    ]],
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
  })

  const pages = pdf.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(100, 116, 139)
    pdf.text(`Printed ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`, margin, pageH - margin + 4)
    pdf.text(`Page ${p} of ${pages}`, pageW - margin, pageH - margin + 4, { align: 'right' })
  }
  pdf.save(filename)
}
