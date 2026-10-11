import React, { useEffect, useRef, useState } from 'react'

interface Props {
  id?: string
  value: string
  onChange: (v: string) => void
  onBlur?: (v: string) => void
  suggestions: string[]
  placeholder?: string
  inputBg: string
  inputBorder: string
  textPrimary: string
  textMuted: string
  accent: string
  className?: string
  inputClassName?: string
  inputStyle?: React.CSSProperties
}

export default function AutoSuggestInput({
  id, value, onChange, onBlur, suggestions, placeholder,
  inputBg, inputBorder, textPrimary, accent, className = '',
  inputClassName = '', inputStyle = {},
}: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)

  const filtered = value.trim()
    ? suggestions.filter(
        (s) =>
          s.toLowerCase().includes(value.toLowerCase()) &&
          s.toLowerCase() !== value.toLowerCase()
      ).slice(0, 8)
    : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (s: string) => {
    onChange(s)
    setOpen(false)
    setActive(-1)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(filtered[active]) }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} className={className}>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => { onBlur?.(e.target.value) }}
        onKeyDown={handleKey}
        className={`w-full rounded-lg px-3 py-2 text-sm outline-none transition-all${inputClassName ? ' ' + inputClassName : ''}`}
        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary, ...inputStyle }}
      />
      {open && filtered.length > 0 && (
        <ul
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
            backgroundColor: inputBg, border: `1px solid ${inputBorder}`,
            borderRadius: 8, marginTop: 2, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            maxHeight: 200, overflowY: 'auto', padding: 0, listStyle: 'none',
          }}
        >
          {filtered.map((s, i) => (
            <li
              key={s}
              onMouseDown={() => pick(s)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                backgroundColor: i === active ? `${accent}22` : undefined,
                color: i === active ? accent : textPrimary,
                borderBottom: `1px solid ${inputBorder}`,
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
