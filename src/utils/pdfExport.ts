import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export interface DtrPdfHeaderData {
  branchName: string
  dateDisplay: string
  submittedBy?: string
  updatedBy?: string
  updatedAt?: string
  status?: string
}

export async function exportDtrReportToPdf(
  elementId: string,
  headerData: DtrPdfHeaderData,
  filenamePrefix: string = 'DTR_Report'
) {
  const originalElement = document.getElementById(elementId)
  if (!originalElement) return

  // Store and reset original scroll positions on target element
  const prevScrollTop = originalElement.scrollTop
  const prevScrollLeft = originalElement.scrollLeft
  originalElement.scrollTop = 0
  originalElement.scrollLeft = 0

  // 1. Create a hidden print container in body to unclip scrollbars and enforce clean white background
  const printContainer = document.createElement('div')
  printContainer.style.position = 'absolute'
  printContainer.style.left = '-9999px'
  printContainer.style.top = '0'
  printContainer.style.width = '1100px' // fixed width for optimal high-dpi A4 aspect ratio
  printContainer.style.backgroundColor = '#ffffff'
  printContainer.style.color = '#0f172a'
  printContainer.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  printContainer.style.zIndex = '-9999'

  // 2. Build header HTML banner with clean date and typography
  const headerHtml = `
    <div style="padding: 20px 26px 16px 26px; border-bottom: 1.5px solid #cbd5e1; background-color: #ffffff; color: #0f172a; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
        <div>
          <h1 style="font-size: 18px; font-weight: 800; tracking-wide: 0.5px; text-transform: uppercase; margin: 0; color: #0f172a;">
            ASHCOL DAILY TRANSACTION REPORT
          </h1>
          <p style="font-size: 13px; font-weight: 700; color: #2563eb; text-transform: uppercase; margin: 3px 0 0 0;">
            ${headerData.branchName || 'BRANCH'}
          </p>
        </div>
        <div style="text-align: right; font-size: 12px; color: #475569; line-height: 1.45;">
          <p style="margin: 0; font-weight: 700; font-size: 13px; color: #0f172a;">${headerData.dateDisplay || '—'}</p>
          ${headerData.submittedBy ? `<p style="margin: 2px 0 0 0; color: #475569;">Submitted by: <span style="font-weight: 600; color: #1e293b;">${headerData.submittedBy}</span></p>` : ''}
          ${headerData.updatedBy ? `<p style="margin: 2px 0 0 0; color: #d97706;">Last Edited by: <span style="font-weight: 600;">${headerData.updatedBy}</span> ${headerData.updatedAt ? `(${headerData.updatedAt})` : ''}</p>` : ''}
          ${headerData.status ? `<p style="margin: 2px 0 0 0; font-weight: 600; color: #059669;">Status: ${headerData.status}</p>` : ''}
        </div>
      </div>
    </div>
  `

  // 3. Clone the report content element and unclip all heights/scrolling completely
  const clonedContent = originalElement.cloneNode(true) as HTMLElement
  clonedContent.style.height = 'auto'
  clonedContent.style.maxHeight = 'none'
  clonedContent.style.overflow = 'visible'
  clonedContent.style.backgroundColor = '#ffffff'
  clonedContent.style.color = '#0f172a'
  clonedContent.scrollTop = 0
  clonedContent.scrollLeft = 0

  // Ensure all children are reset to top, visible without any scroll or height clipping
  const children = clonedContent.querySelectorAll('*')
  children.forEach((node) => {
    const el = node as HTMLElement
    el.scrollTop = 0
    el.scrollLeft = 0
    if (el.style) {
      el.style.maxHeight = 'none'
      if (el.style.overflow === 'auto' || el.style.overflow === 'scroll' || el.style.overflowY === 'auto' || el.style.overflowY === 'scroll') {
        el.style.overflow = 'visible'
        el.style.overflowY = 'visible'
      }
    }
  })

  printContainer.innerHTML = headerHtml
  printContainer.appendChild(clonedContent)
  document.body.appendChild(printContainer)

  try {
    // 4. Capture full height canvas at high DPI strictly starting from Y=0
    const canvas = await html2canvas(printContainer, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1100,
      scrollY: 0,
      scrollX: 0,
      x: 0,
      y: 0,
    })

    // 5. Slice canvas across A4 pages cleanly
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfPageWidth = 210
    const pdfPageHeight = 297
    const margin = 5 // 5mm margin to maximize printable area
    const printableWidth = pdfPageWidth - margin * 2 // 200mm
    const printableHeight = pdfPageHeight - margin * 2 // 287mm

    const pagePxHeight = Math.floor((canvas.width * printableHeight) / printableWidth)
    let totalHeightLeft = canvas.height
    let pageCount = 0

    const pageCanvas = document.createElement('canvas')
    const ctx = pageCanvas.getContext('2d')

    while (totalHeightLeft > 0) {
      if (pageCount > 0) {
        pdf.addPage('a4', 'p')
      }

      const sourceY = pageCount * pagePxHeight
      const sourceHeight = Math.min(pagePxHeight, canvas.height - sourceY)

      pageCanvas.width = canvas.width
      pageCanvas.height = sourceHeight

      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        ctx.drawImage(
          canvas,
          0, sourceY, canvas.width, sourceHeight,
          0, 0, canvas.width, sourceHeight
        )
      }

      const pageImgData = pageCanvas.toDataURL('image/png')
      const destHeight = (sourceHeight * printableWidth) / canvas.width

      pdf.addImage(pageImgData, 'PNG', margin, margin, printableWidth, destHeight)

      totalHeightLeft -= pagePxHeight
      pageCount++
    }

    const safeBranch = (headerData.branchName || 'DTR').replace(/[^a-z0-9]+/gi, '_')
    const safeDate = (headerData.dateDisplay || 'report').replace(/[^a-z0-9]+/gi, '_')
    pdf.save(`${filenamePrefix}_${safeBranch}_${safeDate}.pdf`)
  } catch (err) {
    console.error('PDF Export Error:', err)
  } finally {
    // Restore original scroll positions
    originalElement.scrollTop = prevScrollTop
    originalElement.scrollLeft = prevScrollLeft

    // Clean up hidden print container
    if (document.body.contains(printContainer)) {
      document.body.removeChild(printContainer)
    }
  }
}
