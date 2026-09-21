import { useEffect, useRef } from 'react'
import gsap from 'gsap'

export default function AshcolLoader() {
  const loaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = gsap.utils.selector(loaderRef)

    gsap.to(q('.spinner-ring'), {
      rotate: 360,
      duration: 1.2,
      repeat: -1,
      ease: 'linear',
      transformOrigin: '50% 50%',
    })

    gsap.to(q('.loading-text'), {
      opacity: 0.4,
      duration: 1,
      yoyo: true,
      repeat: -1,
      ease: 'power1.inOut',
    })

    q('.loading-dot').forEach((dot, i) => {
      gsap.to(dot, {
        y: -3,
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
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="spinner-ring absolute inset-0" width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="34" stroke="#e8f5f0" strokeWidth="6" />
          <path
            d="M 40 6 A 34 34 0 0 1 74 40"
            stroke="#04724D"
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11" stroke="#34a853" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2.4" fill="#04724D" />
        </svg>
      </div>
      <div className="mt-7 flex flex-col items-center gap-1.5">
        <h4 className="text-[#04724D] font-black text-lg tracking-[0.15em] uppercase">Ashcol Central</h4>
        <div className="flex items-center gap-1.5">
          <p className="loading-text text-[#34a853] font-bold text-xs tracking-widest uppercase">Loading your workspace</p>
          <span className="flex items-end gap-0.5 pb-0.5">
            <span className="loading-dot w-1 h-1 rounded-full bg-[#34a853] opacity-40" />
            <span className="loading-dot w-1 h-1 rounded-full bg-[#34a853] opacity-40" />
            <span className="loading-dot w-1 h-1 rounded-full bg-[#34a853] opacity-40" />
          </span>
        </div>
      </div>
    </div>
  )
}
