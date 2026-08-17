import { useEffect, useState } from 'react'
import { X, Download, Loader2, Copy, Check } from 'lucide-react'
import QRCode from 'qrcode'
import logoImg from '../assets/ash-logo.jpg'

const BOOKING_URL = 'https://ashcol.com.ph/booking'

interface Props {
  isLight: boolean
  onClose: () => void
}

const CANVAS_SIZE = 640
// A wider quiet zone (spec recommends 4 modules) plus a solid, uncropped finder pattern are what
// actually let a phone camera lock onto the code — both got sacrificed for style in an earlier
// pass and broke scanning on Android, so this version keeps those two things strict.
const MARGIN_MODULES = 4
const DARK = '#0B2B1D'
const GREEN = '#0EA972'

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
}

/** Renders a QR code onto a canvas with lightly-rounded data modules, an ASHCOL logo badge in the
 * center (safe under 'H' error correction, which tolerates ~30% loss), and a green accent frame
 * around each position-detection corner. The finder patterns themselves are rendered as solid,
 * full-bleed, high-contrast squares — exactly per spec — since that's what a camera actually
 * locks onto; only the decorative frame around them is colored/rounded. */
async function renderStyledQr(text: string): Promise<string> {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' })
  const { size, data } = qr.modules
  const totalModules = size + MARGIN_MODULES * 2
  const cell = CANVAS_SIZE / totalModules

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  const isFinderZone = (row: number, col: number) =>
    (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7)

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const bit = data[row * size + col]
      if (!bit) continue
      const x = (col + MARGIN_MODULES) * cell
      const y = (row + MARGIN_MODULES) * cell
      ctx.fillStyle = DARK
      if (isFinderZone(row, col)) {
        // Solid, full-bleed square — no rounding, no gap. This is the part a scanner detects.
        ctx.fillRect(x, y, cell, cell)
      } else {
        roundedRect(ctx, x + cell * 0.05, y + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.2)
      }
    }
  }

  // Decorative green rounded-corner frame around each of the 3 finder patterns, drawn just
  // outside their 7x7 boundary in the quiet zone so it never touches a scannable module.
  const finderOrigins: Array<[number, number]> = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]
  ctx.strokeStyle = GREEN
  ctx.lineWidth = Math.max(2, cell * 0.35)
  const frameInset = cell * 0.6
  for (const [col0, row0] of finderOrigins) {
    const fx = (col0 + MARGIN_MODULES) * cell - frameInset
    const fy = (row0 + MARGIN_MODULES) * cell - frameInset
    const fs = cell * 7 + frameInset * 2
    ctx.beginPath()
    const r = cell * 1.1
    ctx.moveTo(fx + r, fy)
    ctx.arcTo(fx + fs, fy, fx + fs, fy + fs, r)
    ctx.arcTo(fx + fs, fy + fs, fx, fy + fs, r)
    ctx.arcTo(fx, fy + fs, fx, fy, r)
    ctx.arcTo(fx, fy, fx + fs, fy, r)
    ctx.closePath()
    ctx.stroke()
  }

  // Center logo badge — solid black rounded rectangle + contained logo, sized to stay within
  // 'H' error correction tolerance.
  const cx = CANVAS_SIZE / 2
  const cy = CANVAS_SIZE / 2
  const badgeW = CANVAS_SIZE * 0.26
  const badgeH = CANVAS_SIZE * 0.2
  const badgeX = cx - badgeW / 2
  const badgeY = cy - badgeH / 2
  const badgeRadius = badgeH * 0.28

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(badgeX + badgeRadius, badgeY)
      ctx.arcTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + badgeH, badgeRadius)
      ctx.arcTo(badgeX + badgeW, badgeY + badgeH, badgeX, badgeY + badgeH, badgeRadius)
      ctx.arcTo(badgeX, badgeY + badgeH, badgeX, badgeY, badgeRadius)
      ctx.arcTo(badgeX, badgeY, badgeX + badgeW, badgeY, badgeRadius)
      ctx.closePath()
      ctx.fillStyle = '#000000'
      ctx.fill()
      ctx.clip()

      const iw = img.naturalWidth || 1
      const ih = img.naturalHeight || 1
      // 'contain' fit (not 'cover') with padding, so the whole logo mark stays visible inside
      // the rounded box instead of being cropped by the clip.
      const fitW = badgeW * 0.8
      const fitH = badgeH * 0.8
      const scale = Math.min(fitW / iw, fitH / ih)
      const dw = iw * scale
      const dh = ih * scale
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
      ctx.restore()
      resolve()
    }
    img.onerror = () => reject(new Error('logo load failed'))
    img.src = logoImg
  })

  return canvas.toDataURL('image/png')
}

export default function BookingQrModal({ isLight, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const green = '#10B981'

  useEffect(() => {
    let cancelled = false
    renderStyledQr(BOOKING_URL)
      .then(url => { if (!cancelled) setDataUrl(url) })
      .catch(() => { if (!cancelled) setError('Could not generate QR code.') })
    return () => { cancelled = true }
  }, [])

  const handleDownload = () => {
    if (!dataUrl) return
    const link = document.createElement('a')
    link.download = 'ashcol-booking-qr.png'
    link.href = dataUrl
    link.click()
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(BOOKING_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // best-effort
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        style={{ backgroundColor: cardBg, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: border }}>
          <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: textPrimary }}>Booking QR Code</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-500/10" style={{ color: textMuted }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 px-5 py-6">
          <div
            className="w-56 h-56 rounded-xl border flex items-center justify-center overflow-hidden shrink-0"
            style={{ borderColor: border, backgroundColor: '#ffffff' }}
          >
            {error ? (
              <span className="text-xs font-semibold px-4 text-center text-red-500">{error}</span>
            ) : dataUrl ? (
              <img src={dataUrl} alt="Booking form QR code" className="w-full h-full object-contain" />
            ) : (
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: textMuted }} />
            )}
          </div>

          <p className="text-xs text-center leading-relaxed" style={{ color: textMuted }}>
            Scanning this code opens the public booking form. Print it for branch counters or
            service vehicles so customers can request a visit directly.
          </p>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 text-xs font-semibold underline decoration-dotted"
            style={{ color: textMuted }}
          >
            {copied ? <Check className="w-3.5 h-3.5" style={{ color: green }} /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : BOOKING_URL}
          </button>
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!dataUrl}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: green }}
          >
            <Download className="w-4 h-4" /> Download PNG
          </button>
        </div>
      </div>
    </div>
  )
}
