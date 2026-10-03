import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

interface Span { top: number; bottom: number }

export interface ShowcasePdfOptions {
  filename: string
  /** Page / capture background, matching the on-screen showcase theme. */
  background: string
  /** Left-hand footer text, e.g. "PAMPANGA · LIONEL REPIA · Sep 25 – Oct 1". */
  footerLeft: string
  /** Footer text colour — dark theme needs a light one. */
  footerColor?: [number, number, number]
}

/**
 * Renders the Installer Payout Showcase to a landscape A4 PDF that looks exactly like the on-screen
 * panel (same design and colours). The panel is captured at its full scroll width, then cut at row
 * boundaries so no ticket row is split across pages; the column headers repeat on every page.
 *
 * Works for any grid table that carries inside `el`: data-sc-scroll (the horizontal scroller),
 * data-sc-head (column header row) and data-sc-row (every ticket row + the totals bar). Anything marked
 * data-html2canvas-ignore (buttons, scroll cues) is left out of the PDF.
 */
export async function exportShowcaseToPdf(el: HTMLElement, opts: ShowcasePdfOptions): Promise<void> {
  el.setAttribute('data-sc-target', '1')
  try {
    await run(el, opts)
  } finally {
    el.removeAttribute('data-sc-target')
  }
}

async function run(el: HTMLElement, opts: ShowcasePdfOptions): Promise<void> {
  const scroller = el.querySelector<HTMLElement>('[data-sc-scroll]')
  const width = Math.ceil(Math.max(el.clientWidth, scroller?.scrollWidth ?? 0))

  let head: Span | null = null
  const rows: Span[] = []

  const canvas = await html2canvas(el, {
    backgroundColor: opts.background,
    scale: 2,
    useCORS: true,
    logging: false,
    width,
    windowWidth: width,
    onclone: (doc) => {
      const c = doc.querySelector<HTMLElement>('[data-sc-target]')
      if (!c) return
      // The on-screen panel scrolls inside a fixed, overflow-hidden overlay — unclip the whole chain so the
      // clone lays out at its full height and width.
      for (let p: HTMLElement | null = c.parentElement; p; p = p.parentElement) {
        p.style.overflow = 'visible'
        p.style.height = 'auto'
        p.style.maxHeight = 'none'
        if (getComputedStyle(p).position === 'fixed') p.style.position = 'static'
      }
      c.style.width = `${width}px`
      c.style.height = 'auto'
      c.style.maxHeight = 'none'
      c.style.overflow = 'visible'
      c.style.flex = 'none'
      const sc = c.querySelector<HTMLElement>('[data-sc-scroll]')
      if (sc) { sc.style.overflow = 'visible'; sc.style.flex = 'none' }

      const base = c.getBoundingClientRect().top
      const span = (n: Element): Span => {
        const r = n.getBoundingClientRect()
        return { top: r.top - base, bottom: r.bottom - base }
      }
      const h = c.querySelector('[data-sc-head]')
      if (h) head = span(h)
      c.querySelectorAll('[data-sc-row]').forEach(r => rows.push(span(r)))
    },
  })

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 6
  const footerH = 6
  const mmPerPx = (pageW - margin * 2) / width
  const usableMm = pageH - margin * 2 - footerH
  const scale = canvas.width / width

  const drawSlice = (top: number, bottom: number, destYmm: number) => {
    const sy = Math.max(0, Math.round(top * scale))
    const sh = Math.min(canvas.height - sy, Math.round((bottom - top) * scale))
    if (sh <= 0) return
    const part = document.createElement('canvas')
    part.width = canvas.width
    part.height = sh
    part.getContext('2d')!.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
    pdf.addImage(part.toDataURL('image/jpeg', 0.95), 'JPEG', margin, destYmm, pageW - margin * 2, (bottom - top) * mmPerPx)
  }

  // Plan pages as [firstRow, lastRow] index ranges. Page 1 carries the banner + header; later pages repeat the header.
  const headSpan = head as Span | null
  const pages: Array<[number, number]> = []
  if (!headSpan || rows.length === 0) {
    // Fallback: plain vertical slicing if the layout couldn't be measured.
    const pagePx = usableMm / mmPerPx
    for (let y = 0; y < canvas.height / scale; y += pagePx) pages.push([y, Math.min(y + pagePx, canvas.height / scale)])
    pages.forEach(([top, bottom], i) => {
      if (i > 0) pdf.addPage()
      if (opts.background !== '#ffffff') { pdf.setFillColor(opts.background); pdf.rect(0, 0, pageW, pageH, 'F') }
      drawSlice(top, bottom, margin)
    })
  } else {
    const headH = headSpan.bottom - headSpan.top
    let i = 0
    while (i < rows.length) {
      const first = pages.length === 0
      let used = (first ? headSpan.bottom : headH) * mmPerPx
      const start = i
      while (i < rows.length && (i === start || used + (rows[i].bottom - rows[i].top) * mmPerPx <= usableMm)) {
        used += (rows[i].bottom - rows[i].top) * mmPerPx
        i++
      }
      pages.push([start, i - 1])
    }
    pages.forEach(([a, b], idx) => {
      if (idx > 0) pdf.addPage()
      if (opts.background !== '#ffffff') { pdf.setFillColor(opts.background); pdf.rect(0, 0, pageW, pageH, 'F') }
      let y = margin
      if (idx === 0) {
        drawSlice(0, rows[b].bottom, y)
      } else {
        drawSlice(headSpan.top, headSpan.bottom, y)
        y += headH * mmPerPx
        drawSlice(rows[a].top, rows[b].bottom, y)
      }
    })
  }

  const total = pdf.getNumberOfPages()
  const [r, g, b] = opts.footerColor ?? [100, 116, 139]
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p)
    pdf.setFontSize(7)
    pdf.setTextColor(r, g, b)
    pdf.text(opts.footerLeft, margin, pageH - margin + 1)
    pdf.text(`Page ${p} of ${total}`, pageW - margin, pageH - margin + 1, { align: 'right' })
  }
  pdf.save(opts.filename)
}
