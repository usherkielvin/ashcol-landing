import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { ImagePlus, RotateCcw, RotateCw, Replace, Loader2, UploadCloud, ZoomIn, ZoomOut, Move, SlidersHorizontal, X } from 'lucide-react'
import VehiclePhoto from './VehiclePhoto'
import { PHOTO_ASPECT, cropPhoto, preparePhoto, errMsg, type VehicleTheme } from './vehicleUtils'

export interface PickedPhoto {
  blob: Blob
  filename: string
}

interface Props {
  theme: VehicleTheme
  /** Photo already saved on the vehicle (resolved URL), shown until a new one is picked. */
  existingUrl?: string | null
  picked: PickedPhoto | null
  onPick: (photo: PickedPhoto | null) => void
}

interface Source {
  url: string
  filename: string
}

/**
 * Photo picker + editor. The editor frame IS the final frame (same 16:10 as the card): the picture always
 * fills it edge to edge, you drag to position and zoom, and whatever you see is exactly what gets saved.
 */
export default function VehiclePhotoUploader({ theme, existingUrl, picked, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState<Source | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [interacting, setInteracting] = useState(false)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  // The cropper only covers the frame for the un-rotated image. Turned 90°, the picture needs extra zoom to
  // reach all four edges, so the minimum zoom depends on the rotation — that is what keeps the frame gap-free.
  const minZoomFor = (rot: number) => {
    if (!natural) return 1
    const { w, h } = natural
    const scale = Math.max(PHOTO_ASPECT / w, 1 / h) // frame height = 1, frame width = PHOTO_ASPECT
    const turned = Math.abs(Math.round(rot / 90)) % 2 === 1
    const visW = (turned ? h : w) * scale
    const visH = (turned ? w : h) * scale
    return Math.max(1, PHOTO_ASPECT / visW, 1 / visH)
  }
  const minZoom = minZoomFor(rotation)
  const maxZoom = minZoom + 3

  const rotateBy = (delta: number) => {
    const next = rotation + delta
    setRotation(next)
    setCrop({ x: 0, y: 0 })
    setZoom(minZoomFor(next))
  }

  const areaRef = useRef<Area | null>(null)
  const seq = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  // Release the working image URL when it is replaced or the form closes.
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url) }, [source])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const resetView = () => { setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0) }

  const loadBlob = useCallback(async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const prepared = await preparePhoto(file)
      areaRef.current = null
      setNatural(null)
      resetView()
      setSource({ url: URL.createObjectURL(prepared.blob), filename: prepared.filename })
    } catch (err) {
      setError(errMsg(err, 'Could not read this image.'))
    } finally {
      setBusy(false)
    }
  }, [])

  // Re-frame the photo that is already saved on the vehicle.
  const editExisting = async () => {
    if (!existingUrl) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(existingUrl)
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      await loadBlob(new File([blob], 'vehicle.jpg', { type: blob.type || 'image/jpeg' }))
    } catch {
      setBusy(false)
      setError("Couldn't load the current photo for editing. Choose the file again with Replace photo.")
    }
  }

  // Bake the framed area into the blob the form will upload. Debounced; stale renders are dropped.
  const scheduleRender = useCallback((src: Source, area: Area, rot: number) => {
    window.clearTimeout(timer.current)
    if (!(area.width >= 1 && area.height >= 1)) return // frame not measured yet
    const mine = ++seq.current
    timer.current = window.setTimeout(async () => {
      try {
        const blob = await cropPhoto(src.url, area, rot)
        if (mine === seq.current) {
          setError('')
          onPick({ blob, filename: src.filename.replace(/\.[^.]+$/, '') + '.jpg' })
        }
      } catch (err) {
        if (mine === seq.current) setError(errMsg(err, 'Could not process this image.'))
      }
    }, 120)
  }, [onPick])

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    areaRef.current = pixels
    if (source) scheduleRender(source, pixels, rotation)
  }, [source, rotation, scheduleRender])

  const discard = () => {
    window.clearTimeout(timer.current)
    seq.current++
    setSource(null)
    onPick(null)
  }

  const iconBtn = 'w-9 h-9 flex items-center justify-center rounded-xl border transition-colors hover:bg-slate-500/10 disabled:opacity-40 shrink-0'
  const softBtn = 'h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors hover:bg-slate-500/10 disabled:opacity-40'
  const btnStyle = { borderColor: theme.border, color: theme.textPrimary }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) loadBlob(f); e.target.value = '' }}
      />

      {source ? (
        <>
          {/* Editor: the cropper container is the exact final frame — nothing outside it, no gaps inside it. */}
          <div
            className="relative w-full rounded-2xl overflow-hidden select-none border"
            style={{ aspectRatio: PHOTO_ASPECT, borderColor: theme.border, backgroundColor: '#0b1220', touchAction: 'none' }}
          >
            <Cropper
              image={source.url}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={PHOTO_ASPECT}
              minZoom={minZoom}
              maxZoom={maxZoom}
              objectFit="cover"
              onMediaLoaded={m => {
                setNatural({ w: m.naturalWidth, h: m.naturalHeight })
                // The first crop area is emitted before the frame is measured (NaN); a tiny zoom nudge re-emits it.
                window.setTimeout(() => setZoom(z => z + 0.001), 60)
              }}
              showGrid={interacting}
              zoomSpeed={0.4}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              onInteractionStart={() => setInteracting(true)}
              onInteractionEnd={() => setInteracting(false)}
              style={{ cropAreaStyle: { border: 'none', boxShadow: 'none', color: 'transparent' } }}
            />
            <span className="absolute left-3 bottom-3 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-white bg-black/55 backdrop-blur-md">
              <Move className="w-3 h-3" /> Drag to position · scroll to zoom
            </span>
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button type="button" className={iconBtn} style={{ borderColor: theme.border, color: theme.textMuted }} title="Zoom out" onClick={() => setZoom(z => Math.max(minZoom, +(z - 0.25).toFixed(2)))}>
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range" min={minZoom} max={maxZoom} step={0.01} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-[#10B981]"
              style={{ backgroundColor: theme.inputBorder }}
              aria-label="Zoom"
            />
            <button type="button" className={iconBtn} style={{ borderColor: theme.border, color: theme.textMuted }} title="Zoom in" onClick={() => setZoom(z => Math.min(maxZoom, +(z + 0.25).toFixed(2)))}>
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className={`${softBtn} flex-1`} style={btnStyle} onClick={() => inputRef.current?.click()} disabled={busy}>
              <Replace className="w-3.5 h-3.5" /> Replace photo
            </button>
            <button type="button" className={iconBtn} style={{ borderColor: theme.border, color: theme.textMuted }} title="Rotate left" onClick={() => rotateBy(-90)}>
              <RotateCcw className="w-4 h-4" />
            </button>
            <button type="button" className={iconBtn} style={{ borderColor: theme.border, color: theme.textMuted }} title="Rotate right" onClick={() => rotateBy(90)}>
              <RotateCw className="w-4 h-4" />
            </button>
            <button type="button" className={iconBtn} style={{ borderColor: theme.border, color: theme.textMuted }} title="Reset framing" onClick={() => { setRotation(0); setCrop({ x: 0, y: 0 }); setZoom(1) }}>
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button type="button" className={iconBtn} style={{ borderColor: theme.border, color: '#EF4444' }} title="Discard new photo" onClick={discard}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : existingUrl ? (
        <>
          <VehiclePhoto src={existingUrl} alt="Vehicle photo" theme={theme} className="aspect-video w-full rounded-2xl border" />
          <div className="flex items-center gap-2">
            <button type="button" className={`${softBtn} flex-1`} style={btnStyle} onClick={editExisting} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SlidersHorizontal className="w-3.5 h-3.5" />} Adjust framing
            </button>
            <button type="button" className={`${softBtn} flex-1`} style={btnStyle} onClick={() => inputRef.current?.click()} disabled={busy}>
              <Replace className="w-3.5 h-3.5" /> Replace photo
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) loadBlob(f) }}
          className="aspect-video w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center px-4 transition-all"
          style={{
            borderColor: dragging ? theme.accent : theme.inputBorder,
            backgroundColor: dragging ? 'rgba(16,185,129,0.08)' : theme.inputBg,
            color: theme.textMuted,
          }}
        >
          {busy ? <Loader2 className="w-7 h-7 animate-spin" /> : (
            <span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: theme.accent }}>
              {dragging ? <UploadCloud className="w-7 h-7" /> : <ImagePlus className="w-7 h-7" />}
            </span>
          )}
          <span className="text-sm font-bold" style={{ color: theme.textPrimary }}>
            {dragging ? 'Drop to attach' : 'Drag a photo here or click to browse'}
          </span>
          <span className="text-[11px]">JPG, PNG or WebP · you'll frame it to the exact card size next</span>
        </button>
      )}

      {picked && source && (
        <p className="text-[11px]" style={{ color: theme.textMuted }}>
          What's inside the frame is exactly what shows on the vehicle card.
        </p>
      )}
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  )
}
