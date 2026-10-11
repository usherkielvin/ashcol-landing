import { Truck } from 'lucide-react'
import type { VehicleTheme } from './vehicleUtils'

interface Props {
  src: string | null | undefined
  alt: string
  theme: VehicleTheme
  /** Sizing/shape utilities for the frame, e.g. `aspect-video w-full`. */
  className?: string
}

/**
 * Photo frame. Photos are saved already framed at 16:9 by the editor, so `object-cover` fills the frame
 * edge to edge with no bars or gaps (older, unframed uploads are simply centred).
 */
export default function VehiclePhoto({ src, alt, theme, className = '' }: Props) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ backgroundColor: theme.inputBg }}>
      {src ? (
        <img src={src} alt={alt} draggable={false} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ color: theme.textMuted }}>
          <Truck className="w-9 h-9 opacity-60" strokeWidth={1.5} />
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">No photo yet</span>
        </div>
      )}
    </div>
  )
}
