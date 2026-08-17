import { useEffect, useState } from 'react'
import { X, Download, Loader2, Copy, Check } from 'lucide-react'
import QRCode from 'qrcode'

const BOOKING_URL = 'https://ashcol.com.ph/booking'

interface Props {
  isLight: boolean
  onClose: () => void
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
    QRCode.toDataURL(BOOKING_URL, {
      width: 512,
      margin: 2,
      color: { dark: '#060B18', light: '#FFFFFF' },
    })
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
