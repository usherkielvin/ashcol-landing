import { useRef, useLayoutEffect, type DragEvent } from 'react'

/** Vehicle name + red trip # — shrinks the name font to fit the cell; trip # stays readable. */
export function VehicleTripLabel({
  name,
  tripNumber,
  nameColor,
  tripColor,
  opacity,
  title,
  canDrag,
  onDragStart,
  onDragEnd,
}: {
  name: string
  tripNumber: string
  nameColor: string
  tripColor: string
  opacity?: number
  title?: string
  canDrag?: boolean
  onDragStart?: (e: DragEvent<HTMLSpanElement>) => void
  onDragEnd?: (e: DragEvent<HTMLSpanElement>) => void
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const tripRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const nameEl = nameRef.current
    if (!wrap || !nameEl || !name) return

    const MIN_PX = 6
    const TRIP_MIN_PX = 9
    const fit = () => {
      // Prefer the cell's fixed width — without a hard cap the wrap grows with content
      // and scrollWidth === clientWidth, so the shrink loop never runs.
      const parent = wrap.parentElement
      const available = Math.max(
        0,
        (parent?.clientWidth && parent.clientWidth > 0 ? parent.clientWidth : wrap.clientWidth) - 2,
      )
      if (available <= 0) return

      wrap.style.width = '100%'
      wrap.style.maxWidth = `${available}px`

      const base = parseFloat(getComputedStyle(wrap).fontSize) || 12.5
      let lo = MIN_PX
      let hi = base
      let best = MIN_PX

      nameEl.style.overflow = 'visible'
      nameEl.style.textOverflow = 'clip'
      nameEl.style.maxWidth = 'none'

      const overflows = (size: number) => {
        nameEl.style.fontSize = `${size}px`
        if (tripRef.current) tripRef.current.style.fontSize = `${Math.max(size, TRIP_MIN_PX)}px`
        // Include the flex gap between name and red counter in the fit check
        return wrap.scrollWidth > available + 0.5
      }

      // Start a bit smaller than the cell's base font so long names don't look packed
      hi = Math.min(base, 11.5)

      // Binary search the largest name font that still fits the cell
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        if (!overflows(mid)) {
          best = mid
          lo = mid
        } else {
          hi = mid
        }
      }

      nameEl.style.fontSize = `${best}px`
      if (tripRef.current) tripRef.current.style.fontSize = `${Math.max(best, TRIP_MIN_PX)}px`

      // Still overflowing at minimum — ellipsis the name only; never clip the red trip #
      if (wrap.scrollWidth > available + 0.5) {
        const tripW = tripRef.current?.offsetWidth ?? 0
        const gap = tripNumber ? 10 : 0
        nameEl.style.maxWidth = `${Math.max(12, available - tripW - gap)}px`
        nameEl.style.overflow = 'hidden'
        nameEl.style.textOverflow = 'ellipsis'
      }
    }

    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    if (wrap.parentElement) ro.observe(wrap.parentElement)
    return () => ro.disconnect()
  }, [name, tripNumber])

  return (
    <span
      ref={wrapRef}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="flex w-full min-w-0 max-w-full items-center justify-center font-bold uppercase leading-tight rounded whitespace-nowrap overflow-hidden"
      style={{
        color: nameColor,
        opacity,
        cursor: canDrag ? 'grab' : undefined,
        gap: 8,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        letterSpacing: '0.01em',
      }}
      title={title}
    >
      <span
        ref={nameRef}
        className="min-w-0 shrink"
        style={{ whiteSpace: 'nowrap' }}
      >
        {name}
      </span>
      {tripNumber ? (
        <span
          ref={tripRef}
          className="shrink-0"
          style={{ color: tripColor, paddingLeft: 2 }}
        >
          {tripNumber}
        </span>
      ) : null}
    </span>
  )
}
