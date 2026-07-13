import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import { API_BASE_URL, notifyDealersUpdated } from '../utils/api'

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

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
  return { Authorization: `Bearer ${token}` }
}

/** Custom Dealer dropdown: pick a dealer, plus inline rename/delete per row and add-new, all synced to the shared dealers table. */
export function DealerSelect({
  value,
  dealers,
  onChange,
  onDealersChanged,
  isLight,
  inputBg,
  inputBorder,
  textPrimary,
  textMuted,
  className = '',
  extraOption,
}: DealerSelectProps) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addValue, setAddValue] = useState('')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const options: DealerOption[] = extraOption && !dealers.some((d) => d.name.toUpperCase() === extraOption.toUpperCase())
    ? [...dealers, { id: '__extra__', name: extraOption }]
    : dealers

  const inputStyle = {
    backgroundColor: inputBg,
    borderColor: inputBorder,
    color: textPrimary,
  }

  const handleAdd = async () => {
    const name = addValue.trim().toUpperCase()
    if (!name) return
    if (dealers.some((d) => d.name.toUpperCase() === name)) {
      alert('That dealer is already in the list — selecting it.')
      onChange(name)
      setAddValue('')
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE_URL}/dealers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        onChange(name)
        setAddValue('')
        setOpen(false)
        notifyDealersUpdated()
        onDealersChanged?.()
      } else {
        alert((await res.text()) || 'Failed to add dealer')
      }
    } catch (err) {
      console.error('Error adding dealer:', err)
      alert('Failed to add dealer')
    } finally {
      setBusy(false)
    }
  }

  const startRename = (dealer: DealerOption) => {
    setEditingId(dealer.id)
    setEditValue(dealer.name)
  }

  const handleRename = async (dealer: DealerOption) => {
    const name = editValue.trim().toUpperCase()
    if (!name || name === dealer.name.toUpperCase()) {
      setEditingId(null)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE_URL}/dealers/${dealer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        if (value.trim().toUpperCase() === dealer.name.toUpperCase()) onChange(name)
        setEditingId(null)
        notifyDealersUpdated()
        onDealersChanged?.()
      } else {
        alert((await res.text()) || 'Failed to rename dealer')
      }
    } catch (err) {
      console.error('Error renaming dealer:', err)
      alert('Failed to rename dealer')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (dealer: DealerOption) => {
    if (!window.confirm(`Delete dealer "${dealer.name}"? This only removes it from the picklist — existing tickets keep their saved dealer name.`)) return
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE_URL}/dealers/${dealer.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (res.ok) {
        notifyDealersUpdated()
        onDealersChanged?.()
      } else {
        alert('Failed to delete dealer')
      }
    } catch (err) {
      console.error('Error deleting dealer:', err)
      alert('Failed to delete dealer')
    } finally {
      setBusy(false)
    }
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
          className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border shadow-xl normal-case"
          style={{ backgroundColor: isLight ? '#ffffff' : '#0f172a', borderColor: inputBorder }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((dealer) => {
            const isSelected = value.trim().toUpperCase() === dealer.name.toUpperCase()
            const isEditing = editingId === dealer.id
            const isReal = dealer.id !== '__extra__'
            return (
              <div
                key={dealer.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border-b last:border-b-0"
                style={{ borderColor: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)', backgroundColor: isSelected && !isEditing ? (isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)') : 'transparent' }}
              >
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRename(dealer) } if (e.key === 'Escape') setEditingId(null) }}
                      className="flex-1 min-w-0 rounded-lg px-2 py-1 text-xs font-semibold border outline-none"
                      style={inputStyle}
                    />
                    <button type="button" disabled={busy} onClick={() => handleRename(dealer)} className="p-1 rounded hover:bg-emerald-500/10 text-emerald-500 shrink-0"><Check className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-slate-500/10 shrink-0" style={{ color: textMuted }}><X className="w-3.5 h-3.5" /></button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { onChange(dealer.name); setOpen(false) }}
                      className="flex-1 min-w-0 text-left truncate text-xs font-semibold py-0.5"
                      style={{ color: isSelected ? '#10B981' : textPrimary }}
                    >
                      {dealer.name}
                    </button>
                    {isReal && (
                      <>
                        <button type="button" onClick={() => startRename(dealer)} className="p-1 rounded hover:bg-slate-500/10 shrink-0" style={{ color: textMuted }} title="Rename dealer">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button type="button" disabled={busy} onClick={() => handleDelete(dealer)} className="p-1 rounded hover:bg-red-500/10 text-red-500 shrink-0" title="Delete dealer">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })}

          <div className="flex items-center gap-1.5 px-2.5 py-2 sticky bottom-0" style={{ backgroundColor: isLight ? '#f8fafc' : '#0A1120', borderTop: `1px solid ${inputBorder}` }}>
            <input
              type="text"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
              placeholder="+ Add new dealer..."
              className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs font-semibold border outline-none normal-case"
              style={inputStyle}
            />
            <button type="button" disabled={busy || !addValue.trim()} onClick={handleAdd} className="p-1.5 rounded-lg text-white shrink-0 disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }} title="Add dealer">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
