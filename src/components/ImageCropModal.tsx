import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { X, ZoomIn, ZoomOut, RotateCw, Check } from 'lucide-react'

// ── Helper: crop the image on a canvas and return a Blob ─────────────────────
async function getCroppedBlob(imageSrc: string, croppedAreaPixels: Area, rotation: number): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = imageSrc
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const rad = (rotation * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const bW = image.width * cos + image.height * sin
  const bH = image.width * sin + image.height * cos

  canvas.width  = croppedAreaPixels.width
  canvas.height = croppedAreaPixels.height

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rad)
  ctx.translate(-bW / 2, -bH / 2)
  ctx.drawImage(image, (bW - image.width) / 2, (bH - image.height) / 2)
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // Re-draw only the cropped region
  const cropped = document.createElement('canvas')
  cropped.width  = croppedAreaPixels.width
  cropped.height = croppedAreaPixels.height
  const cCtx = cropped.getContext('2d')!

  // Draw rotated full image onto temp canvas, then extract crop
  const tmp = document.createElement('canvas')
  tmp.width  = Math.round(bW)
  tmp.height = Math.round(bH)
  const tCtx = tmp.getContext('2d')!
  tCtx.translate(tmp.width / 2, tmp.height / 2)
  tCtx.rotate(rad)
  tCtx.drawImage(image, -image.width / 2, -image.height / 2)

  cCtx.drawImage(
    tmp,
    croppedAreaPixels.x, croppedAreaPixels.y,
    croppedAreaPixels.width, croppedAreaPixels.height,
    0, 0,
    croppedAreaPixels.width, croppedAreaPixels.height,
  )

  return new Promise((resolve, reject) =>
    cropped.toBlob(b => b ? resolve(b) : reject(new Error('Canvas empty')), 'image/jpeg', 0.92)
  )
}

interface Props {
  imageSrc: string
  onCancel: () => void
  onConfirm: (blob: Blob) => void
  isDark: boolean
  cropShape?: 'round' | 'rect'
  aspectRatio?: number
}

export default function ImageCropModal({ imageSrc, onCancel, onConfirm, isDark, cropShape = 'round', aspectRatio = 1 }: Props) {
  const [crop, setCrop]                   = useState({ x: 0, y: 0 })
  const [zoom, setZoom]                   = useState(1)
  const [rotation, setRotation]           = useState(0)
  const [croppedArea, setCroppedArea]     = useState<Area | null>(null)
  const [applying, setApplying]           = useState(false)

  const onCropComplete = useCallback((_: Area, pixels: Area) => setCroppedArea(pixels), [])

  const handleConfirm = async () => {
    if (!croppedArea) return
    setApplying(true)
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea, rotation)
      onConfirm(blob)
    } catch {
      setApplying(false)
    }
  }

  const bg      = isDark ? '#0A1120' : '#ffffff'
  const border  = isDark ? '#1E2D48' : '#e2e8f0'
  const text    = isDark ? '#E2E8F0' : '#0f172a'
  const muted   = isDark ? '#7A95B8' : '#64748b'
  const trackBg = isDark ? '#1E2D48' : '#e2e8f0'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        className="relative w-full max-w-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: bg, border: `1px solid ${border}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}
            >
              <RotateCw className="w-4 h-4" style={{ color: '#10B981' }} />
            </div>
            <div>
              <h3 className="font-black text-[15px] leading-tight" style={{ color: text }}>Adjust Photo</h3>
              <p className="text-[11px]" style={{ color: muted }}>Drag · Scroll to zoom · Slider to rotate</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400"
            style={{ color: muted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop canvas */}
        <div className="relative w-full" style={{ height: 280, backgroundColor: '#000' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectRatio}
            cropShape={cropShape}
            showGrid={cropShape === 'rect'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 px-5 py-4" style={{ borderTop: `1px solid ${border}` }}>

          {/* Zoom row */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setZoom(v => Math.max(1, +(v - 0.25).toFixed(2)))}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: muted }}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range" min={1} max={3} step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-[#10B981]"
              style={{ backgroundColor: trackBg }}
            />
            <button
              onClick={() => setZoom(v => Math.min(3, +(v + 0.25).toFixed(2)))}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: muted }}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-[11px] w-8 text-right font-mono tabular-nums" style={{ color: muted }}>
              {zoom.toFixed(1)}×
            </span>
          </div>

          {/* Rotation row */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRotation(0)}
              title="Reset rotation"
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: rotation !== 0 ? '#10B981' : muted }}
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <input
              type="range" min={-180} max={180} step={1}
              value={rotation}
              onChange={e => setRotation(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-[#10B981]"
              style={{ backgroundColor: trackBg }}
            />
            <span className="text-[11px] w-8 text-right font-mono tabular-nums" style={{ color: muted }}>
              {rotation > 0 ? '+' : ''}{rotation}°
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all hover:bg-white/5"
              style={{ borderColor: border, color: muted, backgroundColor: 'transparent' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={applying}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              style={{
                background: applying ? '#10B981' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              }}
            >
              {applying
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Applying…</>
                : <><Check className="w-4 h-4" />Apply Photo</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
