import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface FilterChipOption {
  value: string
  label: string
}

export interface FilterChipTokens {
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
}

interface FilterChipMenuProps {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
  value: string
  options: FilterChipOption[]
  onChange: (value: string) => void
  tokens: FilterChipTokens
  title: string
  align?: 'left' | 'right'
}

/** Compact pill that opens a small option list — replaces bulky native selects on phone-width toolbars. */
export default function FilterChipMenu({ icon: Icon, value, options, onChange, tokens, title, align = 'left' }: FilterChipMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = options.find(o => o.value === value) || options[0]
  const active = value !== options[0]?.value

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={title}
        aria-expanded={open}
        className="flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-full border text-[11px] font-bold uppercase tracking-wide transition-all active:scale-95 max-w-[15rem]"
        style={{
          backgroundColor: active ? 'rgba(16,185,129,0.1)' : tokens.inputBg,
          borderColor: open || active ? '#10B981' : tokens.inputBorder,
          color: active ? '#10B981' : tokens.textPrimary,
        }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
        <span className="truncate">{selected?.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: tokens.textMuted }} />
      </button>

      {open && (
        <div
          className={`absolute top-full mt-1.5 z-40 w-60 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto rounded-xl border shadow-lg py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ backgroundColor: tokens.cardBg, borderColor: tokens.border }}
        >
          {options.map(o => {
            const isSelected = o.value === value
            return (
              <button
                key={o.value || '__all'}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-left"
                style={{
                  color: isSelected ? '#10B981' : tokens.textPrimary,
                  backgroundColor: isSelected ? 'rgba(16,185,129,0.08)' : 'transparent',
                }}
              >
                <span className="truncate">{o.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
