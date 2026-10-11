import React, { useEffect, useState } from 'react'
import { API_BASE_URL } from '../utils/api'
import { PUBLIC_BRANCHES } from '../data/branches'

function formatBranchItemName(nameOrTag: string): string {
  const clean = nameOrTag.trim()
  if (!clean) return ''
  const lower = clean.toLowerCase()
  if (lower.includes('head office') || lower === 'taguig') {
    return 'ASHCOL TAGUIG'
  }
  if (clean.toUpperCase().startsWith('ASHCOL')) {
    return clean.toUpperCase()
  }
  return `ASHCOL ${clean.toUpperCase()}`
}

function getDefaultBranchNames(): string[] {
  return [...PUBLIC_BRANCHES]
    .map(b => (b.isHQ ? 'ASHCOL TAGUIG' : b.name.startsWith('ASHCOL') ? b.name.toUpperCase() : `ASHCOL ${b.tag.toUpperCase()}`))
    .sort((a, b) => a.localeCompare(b))
}

interface BranchMarqueeHeaderProps {
  className?: string
  style?: React.CSSProperties
  variant?: 'dark' | 'light' | 'glass'
}

export default function BranchMarqueeHeader({
  className = '',
  style,
  variant = 'glass',
}: BranchMarqueeHeaderProps) {
  const [branchNames, setBranchNames] = useState<string[]>(getDefaultBranchNames)

  useEffect(() => {
    let isMounted = true
    async function loadBranches() {
      try {
        const res = await fetch(`${API_BASE_URL}/public/branches`)
        if (!res.ok) return
        const data = await res.json()
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          const items: string[] = data.data
            .filter((b: any) => b.isActive !== false)
            .map((b: any) => formatBranchItemName(b.name || b.location || ''))
            .filter(Boolean)

          if (items.length > 0 && isMounted) {
            // Deduplicate and sort alphabetically
            const unique = Array.from(new Set(items)).sort((a, b) => a.localeCompare(b))
            setBranchNames(unique)
          }
        }
      } catch {
        // Graceful fallback to static list
      }
    }
    loadBranches()
    return () => {
      isMounted = false
    }
  }, [])

  // Duplicate the list for a seamless loop
  const marqueeItems = [...branchNames, ...branchNames]

  return (
    <div
      className={`w-full py-3.5 backdrop-blur-md z-30 flex-shrink-0 overflow-hidden select-none ${
        variant === 'dark'
          ? 'bg-[#060B18]/90 border-b border-white/[0.08]'
          : variant === 'light'
          ? 'bg-slate-900/95 border-b border-slate-800'
          : 'bg-white/[0.02] border-b border-white/[0.05]'
      } ${className}`}
      style={style}
    >
      <style>{`
        @keyframes ashcol-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ashcol-marquee-track {
          display: flex;
          width: max-content;
          animation: ashcol-scroll 60s linear infinite;
        }
        .ashcol-marquee-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="ashcol-marquee-track items-center space-x-12 px-6">
        {marqueeItems.map((name, i) => (
          <div key={`${name}-${i}`} className="flex items-center space-x-4 flex-shrink-0">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#10B981] flex-shrink-0"
              style={{ boxShadow: '0 0 8px rgba(16,185,129,0.8)' }}
            />
            <span className="text-emerald-100/70 hover:text-emerald-100 font-bold tracking-[0.15em] text-xs uppercase whitespace-nowrap transition-colors">
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export { BranchMarqueeHeader }

