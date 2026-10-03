import { jsPDF } from 'jspdf'
import autoTable, { type CellDef, type RowInput } from 'jspdf-autotable'

/**
 * Payout table → landscape A4 PDF, drawn as real text (not a screenshot) so nothing gets cropped,
 * every cell box is the same height, and the text stays sharp / searchable. Colours follow the on-screen
 * light theme (date bands, green Done status, amber unpaid, blue Remit column).
 */
export type PdfAlign = 'left' | 'center' | 'right'
export interface PayoutPdfColumn { key: string; label: string; align?: PdfAlign; remit?: boolean }
export interface PayoutPdfRow {
  cells: string[]
  /** Background hex for this row (the date band). */
  fill: string
  /** Index → status tone for the cell ('done' = green, 'warn' = amber). */
  tones?: Record<number, 'done' | 'warn'>
}
export interface PayoutPdfChip { label: string; value?: string; tone?: 'default' | 'warn' | 'bad' | 'good' }
export interface PayoutPdfOptions {
  filename: string
  branch: string
  title: string
  chips: PayoutPdfChip[]
  columns: PayoutPdfColumn[]
  rows: PayoutPdfRow[]
  totals?: string[]
  footerLeft: string
}

type RGB = [number, number, number]
const INK: RGB = [15, 23, 42]
const MUTED: RGB = [100, 116, 139]
const GRID: RGB = [148, 163, 184]
const HEAD_BG: RGB = [248, 250, 252]
const REMIT_BG: RGB = [239, 246, 255]
const REMIT_INK: RGB = [3, 105, 161]
const GREEN: RGB = [4, 120, 87]
const AMBER: RGB = [180, 83, 9]
const RED: RGB = [220, 38, 38]

const hex = (h: string): RGB => {
  const m = h.replace('#', '')
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]
}

/** The built-in PDF fonts only cover Latin-1: spell out ₱ and drop anything they can't draw. */
export const pdfSafe = (t: string): string =>
  (t ?? '')
    .replace(/₱/g, 'PHP ')
    .replace(/[−–—]/g, '-')
    .replace(/[·•]/g, '|')
    .replace(/[^\x20-\x7E -ÿ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export function exportPayoutPdf(o: PayoutPdfOptions): void {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8
  const colCount = o.columns.length
  const fontSize = Math.max(5.6, Math.min(8, 8 - (colCount - 10) * 0.22))

  // ── Header block (first page) ────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(...GREEN)
  pdf.text(pdfSafe(o.branch).toUpperCase(), margin, margin + 4)
  pdf.setFontSize(17)
  pdf.setTextColor(...INK)
  pdf.text(pdfSafe(o.title).toUpperCase(), pageW / 2, margin + 5.5, { align: 'center' })

  // Details chips, centred on one line (wrapping to a second if they would overflow).
  pdf.setFontSize(7.6)
  const chipH = 6.2
  const gap = 2.4
  const padX = 3
  const measured = o.chips.map(c => {
    const text = pdfSafe(c.value ? `${c.label}  ${c.value}` : c.label)
    return { c, text, w: pdf.getTextWidth(text) + padX * 2 }
  })
  const lines: typeof measured[] = [[]]
  let lineW = 0
  for (const m of measured) {
    if (lineW + m.w > pageW - margin * 2 && lines[lines.length - 1].length) { lines.push([]); lineW = 0 }
    lines[lines.length - 1].push(m)
    lineW += m.w + gap
  }
  let y = margin + 10
  for (const line of lines) {
    const total = line.reduce((s, m) => s + m.w, 0) + gap * (line.length - 1)
    let x = (pageW - total) / 2
    for (const m of line) {
      const tone = m.c.tone ?? 'default'
      const ink: RGB = tone === 'bad' ? RED : tone === 'warn' ? AMBER : tone === 'good' ? GREEN : MUTED
      pdf.setFillColor(...(tone === 'good' ? ([220, 252, 231] as RGB) : ([255, 255, 255] as RGB)))
      pdf.setDrawColor(...(tone === 'good' ? GREEN : GRID))
      pdf.setLineWidth(0.25)
      pdf.roundedRect(x, y, m.w, chipH, 1.4, 1.4, 'FD')
      pdf.setFont('helvetica', tone === 'good' ? 'bold' : 'normal')
      pdf.setTextColor(...ink)
      pdf.text(m.text, x + padX, y + chipH / 2 + 1.1)
      x += m.w + gap
    }
    y += chipH + 2
  }

  // ── Table ────────────────────────────────────────────────────────────────
  const head: CellDef[] = o.columns.map(col => ({
    content: pdfSafe(col.label).toUpperCase(),
    styles: {
      halign: col.align ?? 'left',
      fillColor: col.remit ? REMIT_BG : HEAD_BG,
      textColor: col.remit ? REMIT_INK : MUTED,
    },
  }))
  const body: RowInput[] = o.rows.map(r => r.cells.map((text, i): CellDef => {
    const col = o.columns[i]
    const tone = r.tones?.[i]
    return {
      content: pdfSafe(text),
      styles: {
        fillColor: col.remit ? REMIT_BG : hex(r.fill),
        textColor: tone === 'done' ? GREEN : tone === 'warn' ? AMBER : INK,
        fontStyle: col.key === 'date' ? 'bold' : 'normal',
        halign: col.align ?? 'left',
      },
    }
  }))
  const foot: RowInput[] | undefined = o.totals
    ? [o.totals.map((text, i): CellDef => ({
      content: pdfSafe(text),
      styles: {
        halign: o.columns[i].align ?? 'left',
        fillColor: o.columns[i].remit ? REMIT_BG : HEAD_BG,
        textColor: o.columns[i].remit ? REMIT_INK : INK,
        fontStyle: 'bold',
      },
    }))]
    : undefined

  autoTable(pdf, {
    startY: y + 1,
    margin: { left: margin, right: margin, top: margin + 4, bottom: margin + 6 },
    head: [head],
    body,
    foot,
    showFoot: 'lastPage',
    theme: 'grid',
    tableWidth: 'auto',
    styles: {
      font: 'helvetica',
      fontSize,
      cellPadding: { top: 1.9, bottom: 1.9, left: 1.8, right: 1.8 },
      minCellHeight: 7.4,
      valign: 'middle',
      overflow: 'linebreak',
      lineColor: GRID,
      lineWidth: 0.2,
      textColor: INK,
    },
    headStyles: { fontStyle: 'bold', fontSize: Math.max(5.2, fontSize - 0.9), minCellHeight: 8 },
    footStyles: { fontStyle: 'bold' },
    rowPageBreak: 'avoid',
  })

  // ── Footer on every page ─────────────────────────────────────────────────
  const total = pdf.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...MUTED)
    pdf.text(pdfSafe(o.footerLeft), margin, pageH - margin + 1)
    pdf.text(`Page ${p} of ${total}`, pageW - margin, pageH - margin + 1, { align: 'right' })
  }
  pdf.save(o.filename)
}
