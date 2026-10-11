import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, ExternalLink, ZoomIn, ZoomOut, Loader2, Play, Pause } from 'lucide-react'

export interface LightboxImage {
  src: string
  /** Low-res image shown instantly while `src` loads. */
  placeholderSrc?: string
  alt?: string
  caption?: string
}

interface ImageLightboxProps {
  images: LightboxImage[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /** Override the stacking level (defaults to the top of the page). */
  zIndex?: number
}

const SLIDESHOW_INTERVAL_MS = 3500

/**
 * Fullscreen image viewer: ←/→ or swipe to navigate, Esc to close, click/double-tap to zoom,
 * Play to run through the list as a slideshow.
 * Always the topmost layer: the ticket details modal it opens from already sits at the maximum
 * z-index, so a lower value here opened the viewer underneath it. On a tie the viewer still wins
 * because its portal is appended to <body> after the modal's.
 */
export function ImageLightbox({ images, index, onIndexChange, onClose, zIndex }: ImageLightboxProps) {
  const [zoomed, setZoomed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const count = images.length
  const current = images[Math.min(Math.max(index, 0), count - 1)]
  const loaded = !!current && loadedSrc === current.src

  const select = (next: number) => {
    setZoomed(false)
    onIndexChange(next)
  }

  const go = (delta: number) => {
    if (count < 2) return
    select((index + delta + count) % count)
  }

  // Capture-phase listener so Esc/arrows don't also reach the modal or table underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose() }
      else if (e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); go(-1) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Warm the neighbours so next/prev feel instant.
  useEffect(() => {
    if (count < 2) return
    for (const i of [index + 1, index - 1]) {
      const img = images[(i + count) % count]
      if (img) new Image().src = img.src
    }
  }, [index, images, count])

  // Slideshow: advance once the current image has loaded; any manual move restarts the wait.
  useEffect(() => {
    if (!playing || zoomed || !loaded || count < 2) return
    const timer = window.setTimeout(() => onIndexChange((index + 1) % count), SLIDESHOW_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [playing, zoomed, loaded, index, count, onIndexChange])

  if (!current) return null

  const btn = 'w-10 h-10 rounded-full flex items-center justify-center text-white bg-white/15 hover:bg-white/25 active:scale-95 transition-all border border-white/20 shadow-xl focus:outline-none'

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex flex-col bg-black/95 backdrop-blur-md select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      style={zIndex ? { zIndex } : undefined}
      onClick={onClose}
      onTouchStart={(e) => {
        if (zoomed || e.touches.length !== 1) return
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current
        touchStart.current = null
        if (!start || zoomed) return
        const dx = e.changedTouches[0].clientX - start.x
        const dy = e.changedTouches[0].clientY - start.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose()
      }}
    >
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-bold text-white/80 tabular-nums">
          {count > 1 ? `${index + 1} / ${count}` : ''}
        </span>
        <div className="flex items-center gap-2">
          {count > 1 && (
            <button type="button" className={btn} onClick={() => { setZoomed(false); setPlaying(p => !p) }} title={playing ? 'Pause slideshow' : 'Play slideshow'} aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}>
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
          )}
          <button type="button" className={btn} onClick={() => setZoomed(z => !z)} title={zoomed ? 'Fit to screen' : 'Actual size'} aria-label={zoomed ? 'Fit to screen' : 'Zoom in'}>
            {zoomed ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
          </button>
          <a href={current.src} target="_blank" rel="noopener noreferrer" className={btn} title="Open original in new tab" aria-label="Open original">
            <ExternalLink size={19} />
          </a>
          <button type="button" className={btn} onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={22} />
          </button>
        </div>
      </div>

      {/* Image stage */}
      <div className={`relative flex-1 min-h-0 ${zoomed ? 'overflow-auto' : 'overflow-hidden flex items-center justify-center'} px-2 sm:px-16`}>
        {!loaded && current.placeholderSrc && !zoomed && (
          <img
            src={current.placeholderSrc}
            alt=""
            aria-hidden
            className="absolute max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-8rem)] max-h-full object-contain blur-sm opacity-70"
          />
        )}
        {!loaded && (
          <Loader2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-white/70 animate-spin" />
        )}
        <img
          key={current.src}
          src={current.src}
          alt={current.alt || ''}
          draggable={false}
          onLoad={() => setLoadedSrc(current.src)}
          onClick={(e) => { e.stopPropagation(); setZoomed(z => !z) }}
          className={zoomed
            ? 'max-w-none mx-auto cursor-zoom-out'
            : `relative max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-zoom-in transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />

        {count > 1 && !zoomed && (
          <>
            <button
              type="button"
              className={`${btn} absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 hidden sm:flex`}
              onClick={(e) => { e.stopPropagation(); go(-1) }}
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              className={`${btn} absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 hidden sm:flex`}
              onClick={(e) => { e.stopPropagation(); go(1) }}
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {/* Caption + thumbnail strip */}
      <div className="shrink-0 px-4 pt-2 pb-4 flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {current.caption && (
          <p className="text-xs font-semibold text-white/70 text-center">{current.caption}</p>
        )}
        {count > 1 && (
          <div className="flex gap-1.5 overflow-x-auto max-w-full pb-1">
            {images.map((img, i) => (
              <button
                key={`${img.src}-${i}`}
                type="button"
                onClick={() => select(i)}
                className={`shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-all ${i === index ? 'border-emerald-400 opacity-100' : 'border-transparent opacity-50 hover:opacity-90'}`}
                aria-label={`Show image ${i + 1}`}
              >
                <img src={img.placeholderSrc || img.src} alt="" className="w-full h-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
