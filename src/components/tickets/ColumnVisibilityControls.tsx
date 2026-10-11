import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { EyeOff, Eye } from 'lucide-react'

export type HiddenColumnItem = { label: string; display: string }

/** Right-click menu on a column header: hide that column (protected columns explain why not). */
export function ColumnHeaderContextMenu({
  menu,
  isLight,
  protectedColumn,
  onHide,
  onClose,
}: {
  menu: { x: number; y: number; label: string; display: string }
  isLight: boolean
  protectedColumn: boolean
  onHide: (label: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: menu.x, top: menu.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    })
  }, [menu.x, menu.y])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return ReactDOM.createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[99999] min-w-[190px] rounded-xl border shadow-2xl overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: pos.left,
        top: pos.top,
        backgroundColor: isLight ? '#ffffff' : '#0a1120',
        borderColor: isLight ? '#e2e8f0' : '#1e293b',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-black uppercase tracking-wider" style={{ color: isLight ? '#64748b' : '#94a3b8' }}>
        {menu.display}
      </p>
      <button
        type="button"
        role="menuitem"
        disabled={protectedColumn}
        onClick={() => { onHide(menu.label); onClose() }}
        className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-xs font-bold text-left transition-colors hover:bg-slate-500/10 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer"
        style={{ color: isLight ? '#0f172a' : '#f8fafc' }}
      >
        <EyeOff className="w-3.5 h-3.5 shrink-0" />
        {protectedColumn ? 'This column can’t be hidden' : 'Hide column'}
      </button>
    </div>,
    document.body,
  )
}

/** Toolbar button + popover listing hidden columns with Show / Show all. */
export function HiddenColumnsButton({
  hidden,
  isLight,
  green,
  inputBg,
  inputBorder,
  textPrimary,
  onShow,
  onShowAll,
}: {
  hidden: HiddenColumnItem[]
  isLight: boolean
  green: string
  inputBg: string
  inputBorder: string
  textPrimary: string
  onShow: (label: string) => void
  onShowAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const width = 260
    setPos({
      left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
      top: r.bottom + 8,
    })
  }, [open, hidden.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = hidden.length
  const active = count > 0
  const muted = isLight ? '#64748b' : '#94a3b8'
  const border = isLight ? '#e2e8f0' : '#1e293b'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-1.5 h-10 px-3 rounded-full text-[12px] xl:text-[13px] font-semibold shrink-0 transition-[background-color,color,border-color] duration-150 hover:opacity-90 active:scale-95 cursor-pointer"
        style={{
          backgroundColor: active ? `${green}1f` : inputBg,
          border: `1px solid ${active ? green : inputBorder}`,
          color: active ? green : textPrimary,
        }}
        title="Hidden columns — right-click a column header to hide it"
      >
        <EyeOff className="w-4 h-4 shrink-0" style={{ color: green }} strokeWidth={2.1} />
        <span>Hidden</span>
        {active && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ backgroundColor: green }}>
            {count}
          </span>
        )}
      </button>

      {open && ReactDOM.createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Hidden columns"
          className="fixed z-[99999] w-[260px] rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{ left: pos.left, top: pos.top, backgroundColor: isLight ? '#ffffff' : '#0a1120', borderColor: border }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3.5 py-3 flex items-center justify-between gap-2 border-b" style={{ borderColor: border }}>
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>
              Hidden columns{active ? ` (${count})` : ''}
            </p>
            {active && (
              <button
                type="button"
                onClick={() => { onShowAll(); setOpen(false) }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-black text-white cursor-pointer active:scale-95"
                style={{ backgroundColor: green }}
              >
                Show all
              </button>
            )}
          </div>
          {active ? (
            <ul className="max-h-[280px] overflow-y-auto py-1">
              {hidden.map(col => (
                <li key={col.label} className="flex items-center justify-between gap-2 px-3.5 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide truncate" style={{ color: textPrimary }}>{col.display}</span>
                  <button
                    type="button"
                    onClick={() => onShow(col.label)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-black cursor-pointer hover:bg-emerald-500/10 active:scale-95"
                    style={{ borderColor: inputBorder, color: textPrimary }}
                  >
                    <Eye className="w-3 h-3" /> Show
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3.5 py-4 text-[11.5px] font-semibold leading-snug" style={{ color: muted }}>
              No hidden columns. Right-click a column header and choose <b>Hide column</b>.
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
