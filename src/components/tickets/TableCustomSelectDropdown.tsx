import React, { useState, useEffect, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { ChevronDown, Search, Check, X } from 'lucide-react'

export interface DropdownOption {
  id: string | number
  value: string
  label: string
  subLabel?: string
  badge?: string
}

interface TableCustomSelectDropdownProps {
  value: string
  options: DropdownOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  isLight: boolean
  isSaving?: boolean
  allowClear?: boolean
  clearLabel?: string
  onSelect: (value: string) => void
  onClose: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}

export function TableCustomSelectDropdown({
  value,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No options found',
  isLight,
  isSaving = false,
  allowClear = true,
  clearLabel = '— Clear selection —',
  onSelect,
  onClose,
}: TableCustomSelectDropdownProps) {
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState<number>(0)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number; flipAbove?: boolean } | null>(null)
  
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Current selected option
  const selectedOption = useMemo(() => {
    if (!value) return null
    const valLower = value.trim().toLowerCase()
    return options.find(
      opt => opt.value.toLowerCase() === valLower || opt.label.toLowerCase() === valLower
    ) || null
  }, [value, options])

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter(opt => {
      const matchLabel = opt.label.toLowerCase().includes(q)
      const matchValue = opt.value.toLowerCase().includes(q)
      const matchSub = opt.subLabel ? opt.subLabel.toLowerCase().includes(q) : false
      const matchBadge = opt.badge ? opt.badge.toLowerCase().includes(q) : false
      return matchLabel || matchValue || matchSub || matchBadge
    })
  }, [options, search])

  // Compute position on mount and on scroll/resize
  const updatePosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popupWidth = Math.max(rect.width, 240)
    const popupHeight = 320 // estimated max height
    
    // Horizontal positioning: ensure within viewport
    let left = rect.left
    if (left + popupWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popupWidth - 12)
    }

    // Vertical positioning: flip above if close to bottom
    const spaceBelow = window.innerHeight - rect.bottom
    const flipAbove = spaceBelow < popupHeight && rect.top > popupHeight
    const top = flipAbove ? Math.max(8, rect.top - 6) : rect.bottom + 6

    setDropdownPos({ top, left, width: popupWidth, flipAbove })
  }

  useEffect(() => {
    updatePosition()
    // Auto-focus search input shortly after opening
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 40)

    const handleScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [])

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current && triggerRef.current.contains(target)
      ) {
        return
      }
      if (
        dropdownRef.current && dropdownRef.current.contains(target)
      ) {
        return
      }
      onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Reset active index when search changes
  useEffect(() => {
    setActiveIndex(0)
  }, [search])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = filteredOptions.length + (allowClear ? 1 : 0)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setActiveIndex(prev => (prev + 1) % Math.max(1, totalItems))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setActiveIndex(prev => (prev - 1 + totalItems) % Math.max(1, totalItems))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (allowClear && activeIndex === 0) {
        onSelect('')
      } else {
        const optionIdx = allowClear ? activeIndex - 1 : activeIndex
        const opt = filteredOptions[optionIdx]
        if (opt) {
          onSelect(opt.value)
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  // Styles
  const cardBg = isLight ? '#ffffff' : '#0f172a'
  const cardBorder = isLight ? '#e2e8f0' : '#1e293b'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  return (
    <>
      {/* Trigger in cell */}
      <div
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation()
        }}
        className={`w-full flex items-center justify-between gap-1.5 px-2 py-1 cursor-pointer select-none text-[11px] font-bold uppercase tracking-wide ${isSaving ? 'opacity-60 pointer-events-none' : ''}`}
        style={{ color: textPrimary }}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : (value || <span className="opacity-50 font-normal lowercase tracking-normal">{placeholder}</span>)}
        </span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </div>

      {/* Floating Dropdown Portal */}
      {dropdownPos && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[999999] rounded-xl border shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 select-none"
          style={{
            top: dropdownPos.flipAbove ? undefined : dropdownPos.top,
            bottom: dropdownPos.flipAbove ? window.innerHeight - dropdownPos.top : undefined,
            left: dropdownPos.left,
            width: dropdownPos.width,
            maxHeight: 340,
            backgroundColor: cardBg,
            borderColor: isLight ? 'rgba(22,163,74,0.35)' : 'rgba(74,222,128,0.3)',
            boxShadow: isLight
              ? '0 16px 36px -6px rgba(15,23,42,0.18), 0 8px 16px -8px rgba(15,23,42,0.1)'
              : '0 20px 40px -8px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          {/* Search Header */}
          <div
            className="p-2 border-b shrink-0 flex items-center gap-2"
            style={{
              backgroundColor: isLight ? '#f8fafc' : '#0a101d',
              borderColor: cardBorder,
            }}
          >
            <Search className="w-3.5 h-3.5 opacity-50 shrink-0" style={{ color: textMuted }} />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full text-xs font-semibold bg-transparent outline-none border-none p-0"
              style={{ color: textPrimary }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="p-0.5 rounded hover:bg-slate-500/20 text-slate-400"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5" style={{ maxHeight: 260 }}>
            {/* Clear Selection Option */}
            {allowClear && !search && (
              <button
                type="button"
                onClick={() => onSelect('')}
                onMouseEnter={() => setActiveIndex(0)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                  activeIndex === 0
                    ? (isLight ? 'bg-amber-50 text-amber-700' : 'bg-amber-500/15 text-amber-300')
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <X className="w-3.5 h-3.5 opacity-60" />
                  <span className="font-semibold">{clearLabel}</span>
                </div>
                {!value && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs font-medium" style={{ color: textMuted }}>
                {emptyLabel}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const itemIndex = allowClear && !search ? idx + 1 : idx
                const isHighlighted = activeIndex === itemIndex
                const isSelected = selectedOption?.value === opt.value || opt.value.toLowerCase() === value.trim().toLowerCase()

                return (
                  <button
                    key={opt.id || opt.value}
                    type="button"
                    onClick={() => onSelect(opt.value)}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all ${
                      isHighlighted
                        ? (isLight ? 'bg-emerald-50 text-emerald-800' : 'bg-emerald-500/15 text-emerald-300')
                        : (isSelected
                          ? (isLight ? 'bg-emerald-50/50 text-emerald-900 font-semibold' : 'bg-emerald-500/10 text-emerald-200 font-semibold')
                          : '')
                    }`}
                    style={{
                      color: isHighlighted || isSelected ? undefined : textPrimary,
                    }}
                  >
                    <div className="flex flex-col min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-wide truncate">
                          {opt.label}
                        </span>
                      </div>
                      {opt.subLabel && opt.subLabel.toUpperCase() !== opt.label.toUpperCase() && (
                        <span className="text-[10px] font-medium text-slate-400 capitalize truncate mt-0.5">
                          {opt.subLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {opt.badge && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0 max-w-[90px] truncate"
                          style={{
                            backgroundColor: isLight ? '#f1f5f9' : 'rgba(30, 41, 59, 0.8)',
                            borderColor: isLight ? '#cbd5e1' : '#334155',
                            color: isLight ? '#475569' : '#94a3b8',
                          }}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
