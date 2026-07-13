import { useEffect, useRef, useState, useMemo } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export type DealerOption = { id: string; name: string }

type DealerSelectProps = {
  value: string
  dealers: DealerOption[]
  onChange: (name: string) => void
  onDealersChanged?: () => void
  isLight: boolean
  inputBg: string
  inputBorder: string
  textPrimary: string
  textMuted: string
  className?: string
  extraOption?: string
}

/** Custom Dealer dropdown: pick a dealer with an embedded search filter.
 * Management features (Add/Rename/Delete) have been moved to Settings Manage Dealer List.
 */
export function DealerSelect({
  value,
  dealers,
  onChange,
  isLight,
  inputBg,
  inputBorder,
  textPrimary,
  textMuted,
  className = '',
  extraOption,
}: DealerSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Auto focus search field when opened
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }, [open])

  const options: DealerOption[] = useMemo(() => {
    const all = extraOption && !dealers.some((d) => d.name.toUpperCase() === extraOption.toUpperCase())
      ? [...dealers, { id: '__extra__', name: extraOption }]
      : dealers
      
    if (!search.trim()) return all
    const lowerSearch = search.toLowerCase()
    return all.filter(d => d.name.toLowerCase().includes(lowerSearch))
  }, [dealers, extraOption, search])

  const inputStyle = {
    backgroundColor: inputBg,
    borderColor: inputBorder,
    color: textPrimary,
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full border rounded-xl px-3.5 py-2.5 text-[13px] font-semibold outline-none transition-all flex items-center justify-between gap-2 normal-case"
        style={inputStyle}
      >
        <span className="truncate">{value || 'Select dealer'}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border shadow-xl normal-case flex flex-col"
          style={{ backgroundColor: isLight ? '#ffffff' : '#0f172a', borderColor: inputBorder }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search field sticky header */}
          <div className="sticky top-0 z-10 px-2 pt-2 pb-1 bg-inherit">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5" style={{ color: textMuted }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search dealers..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold border outline-none bg-transparent"
                style={{ borderColor: inputBorder, color: textPrimary }}
              />
            </div>
          </div>
          
          <div className="py-1">
            {options.length === 0 ? (
              <div className="px-3 py-3 text-xs text-center" style={{ color: textMuted }}>
                No dealers found
              </div>
            ) : (
              options.map((dealer) => {
                const isSelected = value.trim().toUpperCase() === dealer.name.toUpperCase()
                return (
                  <button
                    key={dealer.id}
                    type="button"
                    onClick={() => { 
                      onChange(dealer.name)
                      setSearch('')
                      setOpen(false) 
                    }}
                    className="w-full text-left flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors"
                    style={{ 
                      backgroundColor: isSelected ? (isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)') : 'transparent',
                      color: isSelected ? '#10B981' : textPrimary 
                    }}
                  >
                    <span className="truncate">{dealer.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
