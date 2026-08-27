import { useEffect, useRef, useState, useMemo } from 'react'
import { ChevronDown, Search, Check, Store } from 'lucide-react'

export type DealerOption = { id: string; name: string }

type DealerSelectProps = {
  value: string
  dealers: DealerOption[]
  onChange: (name: string) => void
  onDealersChanged?: () => void
  isLight?: boolean
  inputBg?: string
  inputBorder?: string
  textPrimary?: string
  textMuted?: string
  className?: string
  extraOption?: string
  placeholder?: string
}

/** 
 * Searchable Dealer dropdown.
 * Selection only — adding new stores/dealers is managed exclusively via the STORE LISTS button.
 */
export function DealerSelect({
  value,
  dealers,
  onChange,
  isLight = true,
  inputBg = isLight ? '#ffffff' : '#0F1A30',
  inputBorder = isLight ? '#cbd5e1' : '#243454',
  textPrimary = isLight ? '#0f172a' : '#F1F5F9',
  textMuted = isLight ? '#64748b' : '#849BBE',
  className = '',
  extraOption,
  placeholder = 'Select dealer',
}: DealerSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
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
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setOpen(o => !o)
        }}
        className="w-full border rounded-xl px-3.5 py-2.5 text-[13px] font-semibold outline-none transition-all flex items-center justify-between gap-2 normal-case hover:opacity-95"
        style={inputStyle}
      >
        <span className="truncate flex items-center gap-2">
          <Store className="w-3.5 h-3.5 opacity-60 shrink-0" />
          <span className={value ? 'font-bold' : 'opacity-70 font-normal'}>
            {value || placeholder}
          </span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-xl border shadow-2xl normal-case flex flex-col animate-in fade-in zoom-in-95 duration-100"
          style={{ backgroundColor: isLight ? '#ffffff' : '#0B132B', borderColor: inputBorder }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Header */}
          <div className="sticky top-0 z-10 p-2 border-b bg-inherit" style={{ borderColor: inputBorder }}>
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5" style={{ color: textMuted }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search dealers..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold border outline-none bg-transparent uppercase placeholder:normal-case"
                style={{ borderColor: inputBorder, color: textPrimary }}
              />
            </div>
          </div>
          
          {/* List Options */}
          <div className="py-1">
            {options.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center" style={{ color: textMuted }}>
                {search.trim() ? `No dealers match "${search}"` : 'No dealers available'}
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
                    className="w-full text-left flex items-center justify-between px-3 py-2 text-xs font-semibold transition-colors hover:bg-emerald-500/10"
                    style={{ 
                      backgroundColor: isSelected ? (isLight ? '#ecfdf5' : 'rgba(16,185,129,0.15)') : 'transparent',
                      color: isSelected ? '#10B981' : textPrimary 
                    }}
                  >
                    <span className="truncate">{dealer.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
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
