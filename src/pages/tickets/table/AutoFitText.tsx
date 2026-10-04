import { useRef, useState, useLayoutEffect } from 'react'

export function AutoFitText({ text, style, title, minScale = 0.55, align = 'center' }: {
  text: string
  style?: React.CSSProperties
  title?: string
  minScale?: number
  align?: 'left' | 'center'
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const fit = () => {
      const containerWidth = outer.clientWidth
      const textWidth = inner.scrollWidth
      if (containerWidth <= 0 || textWidth <= 0) return
      const next = Math.min(1, containerWidth / textWidth)
      setScale(Math.max(minScale, next))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(outer)
    return () => ro.disconnect()
  }, [text, minScale])

  return (
    <div
      ref={outerRef}
      className={`w-full overflow-hidden flex items-center ${align === 'left' ? 'justify-start' : 'justify-center'}`}
      title={title ?? text}
    >
      <span
        ref={innerRef}
        style={{ ...style, display: 'inline-block', whiteSpace: 'nowrap', transform: `scale(${scale})` }}
      >
        {text}
      </span>
    </div>
  )
}
