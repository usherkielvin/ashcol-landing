import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import {
  CalendarDays,
  ChevronDown,
  Download,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { Employee, User } from '../types'
import {
  formatMonthFilterLabel,
  getScheduleStatusLabel,
  todayDateKey,
} from '../../../utils/ticketHelpers'

export interface MyTicketsToolbarProps {
  searchQuery: string
  setSearchQuery: (q: string) => void
  isAdmin: boolean
  user: User | null
  formatNegotiatorLabel: (emp: Partial<Employee>, short?: boolean) => string
  myTicketsNegotiatorFilter: string
  setMyTicketsNegotiatorFilter: (id: string) => void
  myTicketsNegotiatorOptions: Employee[]
  myTicketsStatusFilter: string
  setMyTicketsStatusFilter: (status: string) => void
  myTicketsMonthFilter: string
  setMyTicketsMonthFilter: (m: string) => void
  onOpenFilterModal: () => void
  onExportExcel: () => void
  canExport: boolean
  isLight: boolean
  border: string
  inputBg: string
  inputBorder: string
  textPrimary: string
  textMuted: string
  green: string
}

export const MyTicketsToolbar: React.FC<MyTicketsToolbarProps> = ({
  searchQuery,
  setSearchQuery,
  isAdmin,
  user,
  formatNegotiatorLabel,
  myTicketsNegotiatorFilter,
  setMyTicketsNegotiatorFilter,
  myTicketsNegotiatorOptions,
  myTicketsStatusFilter,
  setMyTicketsStatusFilter,
  myTicketsMonthFilter,
  setMyTicketsMonthFilter,
  onOpenFilterModal,
  onExportExcel,
  canExport,
  isLight,
  border,
  inputBg,
  inputBorder,
  textPrimary,
  textMuted,
  green,
}) => {
  const negoDropdownRef = useRef<HTMLButtonElement | null>(null)
  const negoDropdownPopRef = useRef<HTMLDivElement | null>(null)
  const [negoDropdownOpen, setNegoDropdownOpen] = useState(false)
  const [negoDropdownPos, setNegoDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const myTicketsMonthPickerRef = useRef<HTMLButtonElement | null>(null)
  const myTicketsMonthPickerPopRef = useRef<HTMLDivElement | null>(null)
  const [myTicketsMonthPickerOpen, setMyTicketsMonthPickerOpen] = useState(false)
  const [myTicketsMonthPickerPos, setMyTicketsMonthPickerPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const [myTicketsMonthPickerYear, setMyTicketsMonthPickerYear] = useState<number>(() =>
    myTicketsMonthFilter ? Number(myTicketsMonthFilter.split('-')[0]) : new Date().getFullYear(),
  )

  // Both popovers are position-tracked portals: close them on an outside click or when anything
  // other than the popover itself scrolls (the anchor would otherwise drift away from it).
  useEffect(() => {
    if (!negoDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (negoDropdownRef.current && negoDropdownRef.current.contains(target)) return
      if (negoDropdownPopRef.current && negoDropdownPopRef.current.contains(target)) return
      setNegoDropdownOpen(false)
    }
    const handleScroll = (e: Event) => {
      const target = e.target as Node
      if (negoDropdownPopRef.current && negoDropdownPopRef.current.contains(target)) return
      setNegoDropdownOpen(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [negoDropdownOpen])

  useEffect(() => {
    if (!myTicketsMonthPickerOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (myTicketsMonthPickerRef.current && myTicketsMonthPickerRef.current.contains(target)) return
      if (myTicketsMonthPickerPopRef.current && myTicketsMonthPickerPopRef.current.contains(target)) return
      setMyTicketsMonthPickerOpen(false)
    }
    const handleScroll = (e: Event) => {
      const target = e.target as Node
      if (myTicketsMonthPickerPopRef.current && myTicketsMonthPickerPopRef.current.contains(target)) return
      setMyTicketsMonthPickerOpen(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [myTicketsMonthPickerOpen])

  const slot = document.getElementById('header-toolbar-slot') ?? document.body

  return ReactDOM.createPortal(
    <div className="w-full px-3 md:px-5 pt-3 pb-2 flex flex-col md:flex-row gap-3 bg-white dark:bg-[#0A1120] border-b" style={{ borderColor: border }}>
      {/* Top Row / Left: Search Bar */}
      <div
        className="flex items-center gap-2.5 w-full md:w-[320px] h-10 px-3.5 rounded-lg border transition-all shrink-0 focus-within:border-emerald-500/60"
        style={{ backgroundColor: inputBg, borderColor: inputBorder }}
      >
        <Search className="w-4 h-4 shrink-0 text-slate-400" />
        <input
          type="search"
          placeholder="Search names, phone, ticket..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="bg-transparent outline-none text-xs flex-1 min-w-0 font-medium placeholder:text-slate-400"
          style={{ color: textPrimary }}
          onClick={e => e.stopPropagation()}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setSearchQuery('')
            }}
            className="shrink-0 p-1 rounded-full hover:bg-slate-500/10 transition-colors text-slate-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Bottom Row / Right: Horizontal Scrolling Filters */}
      <div
        className="flex flex-nowrap items-center gap-2.5 overflow-x-auto no-scrollbar w-full pb-1 md:pb-0 flex-1 md:justify-end"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Negotiator */}
        {!isAdmin && (
          <div
            className="shrink-0 whitespace-nowrap flex items-center justify-center h-9 px-3 rounded-md border text-[11px] font-bold shadow-sm"
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: isLight ? '#15803d' : '#4ade80' }}
          >
            <span className="uppercase tracking-wide">
              {formatNegotiatorLabel({ name: user?.name, branchId: user?.branchId || undefined }, true) || 'ME'}
            </span>
          </div>
        )}

        {isAdmin && (
          <div className="relative shrink-0 flex items-center">
            <button
              ref={negoDropdownRef}
              type="button"
              onClick={e => {
                e.stopPropagation()
                if (negoDropdownOpen) {
                  setNegoDropdownOpen(false)
                  return
                }
                const rect = e.currentTarget.getBoundingClientRect()
                setNegoDropdownPos({ top: rect.bottom + 6, left: rect.left, width: 220 })
                setNegoDropdownOpen(true)
              }}
              className="shrink-0 whitespace-nowrap flex items-center gap-1.5 h-9 px-3 rounded-md border text-[11px] font-bold shadow-sm transition-all"
              style={{
                backgroundColor: myTicketsNegotiatorFilter ? `${green}15` : inputBg,
                borderColor: myTicketsNegotiatorFilter ? green : inputBorder,
                color: myTicketsNegotiatorFilter ? green : (isLight ? '#15803d' : '#4ade80'),
              }}
            >
              <span className="uppercase tracking-wide truncate max-w-[140px]">
                {myTicketsNegotiatorFilter
                  ? formatNegotiatorLabel(myTicketsNegotiatorOptions.find(emp => emp.id === myTicketsNegotiatorFilter) || {}, true)
                  : 'ALL NEGOTIATORS'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
            </button>

            {negoDropdownOpen && negoDropdownPos && ReactDOM.createPortal(
              <div
                ref={negoDropdownPopRef}
                className="fixed z-[99999] overflow-y-auto rounded-xl border shadow-2xl py-1 animate-in fade-in duration-100 select-none"
                style={{
                  top: negoDropdownPos.top,
                  left: negoDropdownPos.left,
                  width: negoDropdownPos.width,
                  maxHeight: 210,
                  backgroundColor: isLight ? '#ffffff' : '#0a1120',
                  borderColor: isLight ? '#cbd5e1' : '#334155',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMyTicketsNegotiatorFilter('')
                    setNegoDropdownOpen(false)
                  }}
                  className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-left transition-colors"
                  style={{ color: !myTicketsNegotiatorFilter ? green : textPrimary }}
                >
                  <span>ALL NEGOTIATORS</span>
                  {!myTicketsNegotiatorFilter && <span className="text-emerald-500">✓</span>}
                </button>
                <div className="my-1 border-t opacity-30" style={{ borderColor: inputBorder }} />
                {myTicketsNegotiatorOptions.map(emp => {
                  const isSelected = myTicketsNegotiatorFilter === emp.id
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        setMyTicketsNegotiatorFilter(emp.id)
                        setNegoDropdownOpen(false)
                      }}
                      className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-left transition-colors"
                      style={{ color: isSelected ? green : textPrimary }}
                    >
                      <span className="truncate">{formatNegotiatorLabel(emp, true)}</span>
                      {isSelected && <span className="text-emerald-500">✓</span>}
                    </button>
                  )
                })}
              </div>,
              document.body,
            )}
          </div>
        )}

        {/* Status Filters (Pending/Closing) */}
        {[{ value: 'PENDING_GROUP', label: 'Pending' }, { value: 'CLOSING_GROUP', label: 'Closing' }].map(opt => {
          const active = myTicketsStatusFilter === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={e => {
                e.stopPropagation()
                setMyTicketsStatusFilter(active ? '' : opt.value)
              }}
              className="shrink-0 whitespace-nowrap h-9 px-3 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all border shadow-sm"
              style={active
                ? { backgroundColor: green, borderColor: green, color: '#ffffff' }
                : { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
            >
              {opt.label}
            </button>
          )
        })}

        {/* Month Picker */}
        <div className="relative shrink-0 flex items-center gap-1.5">
          <button
            ref={myTicketsMonthPickerRef}
            type="button"
            onClick={e => {
              e.stopPropagation()
              if (myTicketsMonthPickerOpen) {
                setMyTicketsMonthPickerOpen(false)
                return
              }
              setMyTicketsMonthPickerYear(myTicketsMonthFilter ? Number(myTicketsMonthFilter.split('-')[0]) : new Date().getFullYear())
              const rect = e.currentTarget.getBoundingClientRect()
              setMyTicketsMonthPickerPos({ top: rect.bottom + 6, left: Math.max(10, rect.right - 240), width: 240 })
              setMyTicketsMonthPickerOpen(true)
            }}
            className="shrink-0 whitespace-nowrap flex items-center gap-1.5 h-9 px-3 rounded-md border text-[11px] font-bold transition-all shadow-sm"
            style={{
              backgroundColor: myTicketsMonthFilter ? `${green}15` : inputBg,
              borderColor: myTicketsMonthFilter ? green : inputBorder,
              color: myTicketsMonthFilter ? green : textPrimary,
            }}
          >
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            <span>{myTicketsMonthFilter ? formatMonthFilterLabel(myTicketsMonthFilter) : 'Month'}</span>
          </button>
          {myTicketsMonthFilter && (
            <button
              type="button"
              onClick={() => setMyTicketsMonthFilter('')}
              className="shrink-0 p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {myTicketsMonthPickerOpen && myTicketsMonthPickerPos && ReactDOM.createPortal(
            <div
              ref={myTicketsMonthPickerPopRef}
              className="fixed z-[99999] rounded-xl border shadow-2xl p-3 animate-in fade-in duration-100 select-none"
              style={{
                top: myTicketsMonthPickerPos.top,
                left: myTicketsMonthPickerPos.left,
                width: myTicketsMonthPickerPos.width,
                backgroundColor: isLight ? '#ffffff' : '#0a1120',
                borderColor: isLight ? '#cbd5e1' : '#334155',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.5)',
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              {/* Year nav */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setMyTicketsMonthPickerYear(y => y - 1)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors hover:bg-slate-500/10"
                  style={{ color: textMuted }}
                >
                  {'<'}
                </button>
                <span className="text-sm font-bold" style={{ color: textPrimary }}>
                  {myTicketsMonthPickerYear}
                </span>
                <button
                  type="button"
                  onClick={() => setMyTicketsMonthPickerYear(y => y + 1)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors hover:bg-slate-500/10"
                  style={{ color: textMuted }}
                >
                  {'>'}
                </button>
              </div>

              {/* Month grid */}
              <div className="grid grid-cols-3 gap-1.5">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, idx) => {
                  const key = `${myTicketsMonthPickerYear}-${String(idx + 1).padStart(2, '0')}`
                  const isSelected = myTicketsMonthFilter === key
                  const isCurrentMonth = key === todayDateKey().slice(0, 7)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setMyTicketsMonthFilter(key)
                        setMyTicketsMonthPickerOpen(false)
                      }}
                      className="h-9 rounded-lg text-xs font-bold transition-all"
                      style={{
                        color: isSelected ? '#ffffff' : isCurrentMonth ? green : textPrimary,
                        backgroundColor: isSelected ? green : 'transparent',
                        border: `1px solid ${isSelected ? green : isCurrentMonth ? green : inputBorder}`,
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2 pt-3 mt-2 border-t" style={{ borderColor: inputBorder }}>
                <button
                  type="button"
                  onClick={() => {
                    const key = todayDateKey().slice(0, 7)
                    setMyTicketsMonthFilter(key)
                    setMyTicketsMonthPickerYear(Number(key.split('-')[0]))
                    setMyTicketsMonthPickerOpen(false)
                  }}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:opacity-90"
                  style={{ backgroundColor: `${green}22`, color: green }}
                >
                  This month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMyTicketsMonthFilter('')
                    setMyTicketsMonthPickerOpen(false)
                  }}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all hover:opacity-90"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: 'transparent' }}
                >
                  All months
                </button>
              </div>
            </div>,
            document.body,
          )}
        </div>

        {/* Extended Filters Button */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onOpenFilterModal()
          }}
          className="shrink-0 whitespace-nowrap flex items-center gap-1.5 h-9 px-3 rounded-md border text-[11px] font-bold transition-all shadow-sm"
          style={{
            backgroundColor: (myTicketsStatusFilter && myTicketsStatusFilter !== 'PENDING_GROUP' && myTicketsStatusFilter !== 'CLOSING_GROUP') ? `${green}15` : inputBg,
            borderColor: (myTicketsStatusFilter && myTicketsStatusFilter !== 'PENDING_GROUP' && myTicketsStatusFilter !== 'CLOSING_GROUP') ? green : inputBorder,
            color: (myTicketsStatusFilter && myTicketsStatusFilter !== 'PENDING_GROUP' && myTicketsStatusFilter !== 'CLOSING_GROUP') ? green : textPrimary,
          }}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>
            {myTicketsMonthFilter
              ? formatMonthFilterLabel(myTicketsMonthFilter)
              : (myTicketsStatusFilter && myTicketsStatusFilter !== 'PENDING_GROUP' && myTicketsStatusFilter !== 'CLOSING_GROUP')
                ? getScheduleStatusLabel(myTicketsStatusFilter)
                : 'Filters'}
          </span>
        </button>

        {/* Export to Excel */}
        <button
          type="button"
          onClick={onExportExcel}
          disabled={!canExport}
          title="Export the currently filtered list to Excel"
          className="shrink-0 whitespace-nowrap flex items-center gap-1.5 h-9 px-3 rounded-md border text-[11px] font-bold transition-all shadow-sm disabled:opacity-50"
          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Export</span>
        </button>
      </div>
    </div>,
    slot,
  )
}
