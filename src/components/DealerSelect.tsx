import { useEffect, useRef, useState, useMemo } from 'react'
import { ChevronDown, Search, Plus, Loader2, Check, Store } from 'lucide-react'
import { API_BASE_URL, notifyDealersUpdated } from '../utils/api'

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

function authToken(): string {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

/** 
 * Searchable Dealer dropdown with direct in-menu "+ Add Dealer" capability.
 * Users can pick an existing dealer, filter by typing, or directly create a new dealer
 * on the fly without leaving the ticket creation/editing flow.
 */
export function DealerSelect({
  value,
  dealers,
  onChange,
  onDealersChanged,
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
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDealerName, setNewDealerName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setShowAddForm(false)
        setError('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Auto focus search field when opened
  useEffect(() => {
    if (open && !showAddForm && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }, [open, showAddForm])

  // Auto focus add input when inline add opens
  useEffect(() => {
    if (showAddForm && addInputRef.current) {
      setTimeout(() => {
        addInputRef.current?.focus()
      }, 50)
    }
  }, [showAddForm])

  const options: DealerOption[] = useMemo(() => {
    const all = extraOption && !dealers.some((d) => d.name.toUpperCase() === extraOption.toUpperCase())
      ? [...dealers, { id: '__extra__', name: extraOption }]
      : dealers
      
    if (!search.trim()) return all
    const lowerSearch = search.toLowerCase()
    return all.filter(d => d.name.toLowerCase().includes(lowerSearch))
  }, [dealers, extraOption, search])

  // Check if current search exactly matches an existing dealer
  const exactMatchExists = useMemo(() => {
    const trimmed = search.trim().toUpperCase()
    if (!trimmed) return true
    return dealers.some(d => d.name.toUpperCase() === trimmed)
  }, [dealers, search])

  const handleCreateDealer = async (nameToCreate: string) => {
    const trimmed = nameToCreate.trim().toUpperCase()
    if (!trimmed) return

    // If already exists, just select it
    const existing = dealers.find(d => d.name.toUpperCase() === trimmed)
    if (existing) {
      onChange(existing.name)
      setSearch('')
      setShowAddForm(false)
      setOpen(false)
      return
    }

    setIsCreating(true)
    setError('')
    try {
      const token = authToken()
      const res = await fetch(`${API_BASE_URL}/dealers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      })

      if (res.ok) {
        const data = await res.json()
        const createdName = data?.name || data?.data?.name || trimmed
        onChange(createdName)
        notifyDealersUpdated()
        onDealersChanged?.()
        setSearch('')
        setNewDealerName('')
        setShowAddForm(false)
        setOpen(false)
      } else {
        const errText = await res.text()
        setError(errText || 'Failed to create dealer')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error creating dealer')
    } finally {
      setIsCreating(false)
    }
  }

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
          setShowAddForm(false)
          setError('')
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
          {/* Header Area: Search + Add Button Toggle */}
          <div className="sticky top-0 z-10 p-2 border-b bg-inherit flex flex-col gap-2" style={{ borderColor: inputBorder }}>
            {!showAddForm ? (
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 flex items-center">
                  <Search className="w-3.5 h-3.5 absolute left-2.5" style={{ color: textMuted }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search dealers..."
                    value={search}
                    onChange={e => {
                      setSearch(e.target.value)
                      setError('')
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && search.trim() && !exactMatchExists) {
                        e.preventDefault()
                        handleCreateDealer(search)
                      }
                    }}
                    className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold border outline-none bg-transparent uppercase placeholder:normal-case"
                    style={{ borderColor: inputBorder, color: textPrimary }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(true)
                    setNewDealerName(search.trim().toUpperCase())
                    setError('')
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 shadow-sm transition-all active:scale-95"
                  title="Add new dealer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add</span>
                </button>
              </div>
            ) : (
              /* Inline Add Dealer Form */
              <div className="p-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-emerald-500 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> New Dealer
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false)
                      setError('')
                    }}
                    className="text-[11px] font-semibold hover:underline"
                    style={{ color: textMuted }}
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <input
                    ref={addInputRef}
                    type="text"
                    placeholder="ENTER DEALER NAME..."
                    value={newDealerName}
                    onChange={e => setNewDealerName(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreateDealer(newDealerName)
                      }
                    }}
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold border outline-none bg-transparent uppercase"
                    style={{ borderColor: inputBorder, color: textPrimary }}
                    disabled={isCreating}
                  />
                  <button
                    type="button"
                    disabled={!newDealerName.trim() || isCreating}
                    onClick={() => handleCreateDealer(newDealerName)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shrink-0 flex items-center gap-1 shadow-sm transition-all"
                  >
                    {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {error && (
              <span className="text-[11px] font-semibold text-red-500 px-1">{error}</span>
            )}
          </div>
          
          {/* List Options */}
          <div className="py-1">
            {/* Quick Add Search Prompt if search query doesn't match any existing dealer */}
            {search.trim() && !exactMatchExists && !showAddForm && (
              <button
                type="button"
                onClick={() => handleCreateDealer(search)}
                disabled={isCreating}
                className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold transition-colors border-b"
                style={{ 
                  backgroundColor: isLight ? '#ecfdf5' : 'rgba(16,185,129,0.12)',
                  borderColor: inputBorder,
                  color: '#10B981',
                }}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Add <strong>"{search.trim().toUpperCase()}"</strong> as new dealer</span>
                </span>
                {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
              </button>
            )}

            {options.length === 0 && !search.trim() ? (
              <div className="px-3 py-4 text-xs text-center flex flex-col items-center gap-1" style={{ color: textMuted }}>
                <span>No dealers found.</span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="text-xs font-bold text-emerald-500 hover:underline flex items-center gap-1 mt-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add First Dealer
                </button>
              </div>
            ) : options.length === 0 && search.trim() ? (
              <div className="px-3 py-3 text-xs text-center" style={{ color: textMuted }}>
                No existing dealers match "{search}". Click above to add it!
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
                      setShowAddForm(false)
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
