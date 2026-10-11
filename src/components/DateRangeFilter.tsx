import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, X, Check } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export type DatePreset = 'ALL' | 'TODAY' | 'LAST_7' | 'LAST_25' | 'CUSTOM'

export interface DateRange {
  preset: DatePreset
  from: Date | null
  to: Date | null
}

interface DateRangeFilterProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'ALL',    label: 'All time' },
  { key: 'TODAY',  label: 'Today' },
  { key: 'LAST_7', label: 'Last 7 days' },
  { key: 'LAST_25',label: 'Last 25 days' },
  { key: 'CUSTOM', label: 'Custom' },
]

function toLocalDateStr(d: Date) {
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getPresetLabel(range: DateRange): string {
  if (range.preset === 'CUSTOM' && range.from && range.to) {
    const fmt = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return `${fmt(range.from)} – ${fmt(range.to)}`
  }
  return PRESETS.find(p => p.key === range.preset)?.label ?? 'Date'
}

export function buildDateRange(preset: DatePreset): DateRange {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (preset) {
    case 'TODAY':
      return { preset, from: today, to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59) }
    case 'LAST_7': {
      const from = new Date(today); from.setDate(today.getDate() - 6)
      return { preset, from, to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59) }
    }
    case 'LAST_25': {
      const from = new Date(today); from.setDate(today.getDate() - 24)
      return { preset, from, to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59) }
    }
    default:
      return { preset, from: null, to: null }
  }
}

export function isInDateRange(date: Date | null, range: DateRange): boolean {
  if (!date || range.preset === 'ALL') return true
  if (!range.from || !range.to) return true
  return date >= range.from && date <= range.to
}

export default function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'

  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState<string>('')
  const [customTo,   setCustomTo]   = useState<string>('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Sync custom inputs when switching away/back
  useEffect(() => {
    if (value.preset === 'CUSTOM') {
      if (value.from) setCustomFrom(toLocalDateStr(value.from))
      if (value.to)   setCustomTo(toLocalDateStr(value.to))
    }
  }, [value.preset])

  const handlePreset = (key: DatePreset) => {
    if (key === 'CUSTOM') {
      onChange({ preset: 'CUSTOM', from: null, to: null })
      // Don't close — let user pick dates
      return
    }
    onChange(buildDateRange(key))
    setOpen(false)
  }

  const handleApplyCustom = () => {
    if (!customFrom || !customTo) return
    const from = new Date(customFrom + 'T00:00:00')
    const to   = new Date(customTo   + 'T23:59:59')
    if (from > to) return
    onChange({ preset: 'CUSTOM', from, to })
    setOpen(false)
  }

  const isActive = value.preset !== 'ALL'
  const accentColor = '#10B981'

  return (
    <div ref={ref} className="relative" style={{ zIndex: 50 }}>
      {/* Trigger pill */}
      <button
        type="button"
        id="date-range-filter-btn"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200"
        style={{
          backgroundColor: isActive ? `${accentColor}14` : inputBg,
          borderColor:     isActive ? `${accentColor}60` : inputBorder,
          color:           isActive ? accentColor         : textMuted,
        }}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0" />
        <span className="max-w-[120px] truncate">{getPresetLabel(value)}</span>
        {isActive
          ? (
            <span
              onClick={e => { e.stopPropagation(); onChange({ preset: 'ALL', from: null, to: null }) }}
              className="ml-0.5 rounded-full hover:opacity-70 transition-opacity"
            >
              <X className="w-3 h-3" />
            </span>
          )
          : <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        }
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute top-full left-0 mt-2 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            backgroundColor: cardBg,
            border:          `1px solid ${border}`,
            minWidth:        '230px',
            boxShadow:       isLight
              ? '0 20px 60px rgba(0,0,0,0.12)'
              : '0 20px 60px rgba(0,0,0,0.6)',
          }}
        >
          {/* Preset pills */}
          <div className="p-2 flex flex-col gap-0.5">
            {PRESETS.map(p => {
              const selected = value.preset === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePreset(p.key)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150 text-left"
                  style={{
                    backgroundColor: selected ? `${accentColor}14` : 'transparent',
                    color: selected ? accentColor : textPrimary,
                  }}
                  onMouseEnter={e => {
                    if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={e => {
                    if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                  }}
                >
                  <span>{p.label}</span>
                  {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>

          {/* Custom date range expander */}
          {value.preset === 'CUSTOM' && (
            <div
              className="px-3 pb-3 pt-1 flex flex-col gap-2 border-t"
              style={{ borderColor: border }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest mt-1" style={{ color: textMuted }}>
                Date range
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold" style={{ color: textMuted }}>From</label>
                <input
                  type="date"
                  id="date-range-from"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  max={customTo || toLocalDateStr(new Date())}
                  className="w-full rounded-xl border px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#10B981] transition-colors"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
                />
                <label className="text-[11px] font-semibold" style={{ color: textMuted }}>To</label>
                <input
                  type="date"
                  id="date-range-to"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  min={customFrom}
                  max={toLocalDateStr(new Date())}
                  className="w-full rounded-xl border px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#10B981] transition-colors"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, colorScheme: isLight ? 'light' : 'dark' }}
                />
              </div>
              <button
                type="button"
                id="date-range-apply-btn"
                disabled={!customFrom || !customTo}
                onClick={handleApplyCustom}
                className="w-full py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-1"
                style={{ backgroundColor: accentColor }}
              >
                Apply Range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
