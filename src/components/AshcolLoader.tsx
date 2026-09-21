import { useEffect, useRef } from 'react'
import gsap from 'gsap'

export default function AshcolLoader() {
  const loaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = gsap.utils.selector(loaderRef)

    // Flowing aircon wind animation
    q<SVGPathElement>('.wind-line').forEach((line, index) => {
      const tl = gsap.timeline({ repeat: -1, delay: index * 0.25 })

      tl.fromTo(
        line,
        { y: -15, opacity: 0, scaleY: 0.8 },
        { y: 5, opacity: 1, scaleY: 1, duration: 0.6, ease: 'power1.out' }
      ).to(line, {
        y: 30, opacity: 0, scaleY: 1.2, duration: 0.6, ease: 'power1.in',
      })
    })

    // Pulsing LED indicator
    gsap.to(q('.ac-led'), {
      opacity: 0.2,
      duration: 1.5,
      yoyo: true,
      repeat: -1,
      ease: 'power2.inOut',
    })

    // Breathing text
    gsap.to(q('.loading-text'), {
      opacity: 0.5,
      duration: 1.2,
      yoyo: true,
      repeat: -1,
      ease: 'power1.inOut',
    })

    // Moving / bouncing dots (...)
    q('.loading-dot').forEach((dot, i) => {
      gsap.to(dot, {
        y: -3.5,
        opacity: 1,
        duration: 0.45,
        repeat: -1,
        yoyo: true,
        delay: i * 0.15,
        ease: 'power1.inOut',
      })
    })
  }, [])

  return (
    <div ref={loaderRef} className="flex flex-col items-center justify-center p-12 w-full min-h-[300px] font-sans bg-transparent">
      {/* ── Aircon SVG Unit ── */}
      <svg width="140" height="140" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="overflow-visible">
        {/* AC Body */}
        <rect x="20" y="40" width="160" height="55" rx="14" fill="#e8f5f0" stroke="#04724D" strokeWidth="6" />
        <line x1="40" y1="52" x2="160" y2="52" stroke="#e5e7eb" strokeWidth="3" strokeLinecap="round" />
        <line x1="40" y1="60" x2="160" y2="60" stroke="#e5e7eb" strokeWidth="3" strokeLinecap="round" />
        <line x1="20" y1="75" x2="180" y2="75" stroke="#04724D" strokeWidth="3" opacity="0.3" />
        {/* Power LED */}
        <circle className="ac-led" cx="160" cy="85" r="3.5" fill="#34a853" />
        {/* Vents / Louvers */}
        <path d="M 25 95 Q 100 115 175 95" fill="none" stroke="#04724D" strokeWidth="5" strokeLinecap="round" />
        <path d="M 35 95 Q 100 108 165 95" fill="none" stroke="#04724D" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
        {/* Animated Cool Wind Flow */}
        <g stroke="#34a853" strokeWidth="5" strokeLinecap="round" fill="none">
          <path className="wind-line" d="M 60 120 Q 40 145 55 170" />
          <path className="wind-line" d="M 100 125 Q 110 155 95 185" />
          <path className="wind-line" d="M 140 120 Q 160 145 145 170" />
        </g>
      </svg>

      {/* ── Brand & Animated Status ── */}
      <div className="mt-8 flex flex-col items-center gap-1.5">
        <h4 className="text-[#04724D] font-black text-lg tracking-[0.15em] uppercase">Ashcol Central</h4>
        <div className="flex items-center gap-1.5">
          <p className="loading-text text-[#34a853] font-bold text-xs tracking-widest uppercase">Keeping you cool</p>
          <span className="flex items-end gap-1 pb-0.5">
            <span className="loading-dot w-1.5 h-1.5 rounded-full bg-[#34a853] opacity-40 inline-block" />
            <span className="loading-dot w-1.5 h-1.5 rounded-full bg-[#34a853] opacity-40 inline-block" />
            <span className="loading-dot w-1.5 h-1.5 rounded-full bg-[#34a853] opacity-40 inline-block" />
          </span>
        </div>
      </div>
    </div>
  )
}
