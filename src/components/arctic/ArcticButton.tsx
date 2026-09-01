import { useState } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { useArctic } from '../../contexts/ArcticContext'

export default function ArcticButton() {
  const { isOpen, toggleArctic } = useArctic()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [hover, setHover] = useState(false)

  const hoverBg = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'
  const tooltipBg = isLight ? '#0f172a' : '#0d1626'
  const tooltipBorder = isLight ? '#0f172a' : 'rgba(255,255,255,0.1)'

  return (
    <div className="relative">
      <button
        onClick={toggleArctic}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label="Ask Arctic"
        className="relative flex items-center justify-center w-9 h-9 rounded-xl text-base transition-all"
        style={{ backgroundColor: isOpen ? hoverBg : 'transparent' }}
      >
        <span style={{ filter: isOpen ? 'none' : 'grayscale(0.15)' }}>🦊</span>
      </button>

      {hover && !isOpen && (
        <div
          className="absolute z-50 top-[calc(100%+8px)] right-0 px-3 py-2 rounded-xl shadow-2xl whitespace-nowrap pointer-events-none"
          style={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}` }}
        >
          <p className="text-[12px] font-bold text-white leading-none">Ask Arctic</p>
          <p className="text-[10px] mt-1 leading-none" style={{ color: '#6B90BE' }}>Your ASHCOL AI</p>
        </div>
      )}
    </div>
  )
}
