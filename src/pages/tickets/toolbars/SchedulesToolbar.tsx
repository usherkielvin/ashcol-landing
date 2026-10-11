import React from 'react'
import ReactDOM from 'react-dom'
import {
  CalendarDays,
  ChevronDown,
  Eye,
  Maximize2,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react'
import { HiddenColumnsButton } from '../../../components/tickets/ColumnVisibilityControls'
import { formatDisplayDate, formatMonthFilterLabel } from '../../../utils/ticketHelpers'

export interface WeeklyTabItem {
  key: string
  dayName: string
  dateLabel: string
}

export interface SchedulesToolbarProps {
  dateFilter: string
  handleDateFilterChange: (dateKey: string) => void
  todayDateKeyStr: string
  isReadOnlySchedule: boolean
  weeklyTabs: WeeklyTabItem[]
  isCustomSelected: boolean
  onOpenCustomDatePicker: () => void
  monthViewActive: boolean
  monthFilterStatus: string
  monthFilterNegotiatorId: string
  monthFilterMonth: string
  onOpenMonthFilterModal: () => void
  canEdit: boolean
  onOpenBulkAssign: () => void
  hiddenColumnItems: Array<{ label: string; display: string }>
  onShowColumn: (label: string) => void
  onShowAllColumns: () => void
  showcaseOpen: boolean
  onToggleShowcase: () => void
  onCloseShowcase: () => void
  tableBorder: string
  inputBg: string
  inputBorder: string
  textPrimary: string
  textMuted: string
  green: string
  isLight: boolean
}

export const SchedulesToolbar: React.FC<SchedulesToolbarProps> = ({
  dateFilter,
  handleDateFilterChange,
  todayDateKeyStr,
  isReadOnlySchedule,
  weeklyTabs,
  isCustomSelected,
  onOpenCustomDatePicker,
  monthViewActive,
  monthFilterStatus,
  monthFilterNegotiatorId,
  monthFilterMonth,
  onOpenMonthFilterModal,
  canEdit,
  onOpenBulkAssign,
  hiddenColumnItems,
  onShowColumn,
  onShowAllColumns,
  showcaseOpen,
  onToggleShowcase,
  onCloseShowcase,
  tableBorder,
  inputBg,
  inputBorder,
  textPrimary,
  textMuted,
  green,
  isLight,
}) => {
  const slot = document.getElementById('header-toolbar-slot') ?? document.body

  return (
    <>
      {ReactDOM.createPortal(
        <div
          className="w-full px-3 md:px-5 pt-3 pb-2 flex flex-col md:flex-row gap-3 bg-white dark:bg-[#0A1120] border-b"
          style={{ borderColor: tableBorder }}
        >
          {/* Mobile Native Date Picker */}
          <div className="flex md:hidden items-center gap-2 w-fit self-start order-2">
            <div
              className="relative inline-flex items-center gap-2 h-9 px-3 rounded-xl border font-bold text-xs shadow-xs transition-all active:scale-[0.98]"
              style={{
                backgroundColor: inputBg,
                borderColor: dateFilter && dateFilter !== todayDateKeyStr ? green : inputBorder,
                color: textPrimary,
              }}
            >
              <CalendarDays className="w-3.5 h-3.5 shrink-0 pointer-events-none" style={{ color: green }} strokeWidth={2.2} />
              <span className="text-xs font-black uppercase tracking-wide whitespace-nowrap pointer-events-none">
                {dateFilter === todayDateKeyStr
                  ? `Today · ${formatDisplayDate(dateFilter, '')}`
                  : dateFilter
                    ? new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }).toUpperCase()
                    : "TODAY'S SCHEDULE"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0 ml-0.5 pointer-events-none" style={{ color: textMuted }} />

              <input
                id="mobile-native-date-picker-input"
                type="date"
                value={dateFilter || todayDateKeyStr}
                onChange={(e) => {
                  if (e.target.value) {
                    handleDateFilterChange(e.target.value)
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Pick schedule date"
              />
            </div>

            {dateFilter && dateFilter !== todayDateKeyStr && (
              <button
                type="button"
                onClick={() => handleDateFilterChange(todayDateKeyStr)}
                className="h-9 px-2.5 rounded-xl border text-[11px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 active:scale-95 transition-colors duration-150 cursor-pointer shrink-0"
                title="Reset to today"
              >
                Today
              </button>
            )}
          </div>

          {/* Desktop Filters & Dates ribbon */}
          <div className="hidden md:flex flex-nowrap items-center gap-2.5 overflow-x-auto no-scrollbar w-full pb-1 md:pb-0 flex-1 order-2 md:order-1">
            {isReadOnlySchedule && (
              <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-black shrink-0">
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>READ ONLY SCHEDULE</span>
              </div>
            )}

            {/* Segmented weekly date pills */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#030712] p-1 rounded-lg shrink-0">
              {weeklyTabs.map((tab) => {
                const isActive = dateFilter === tab.key
                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => handleDateFilterChange(tab.key)}
                    className="h-8 px-3 rounded-md text-[12px] font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 active:scale-95"
                    style={{
                      backgroundColor: isActive ? green : 'transparent',
                      color: isActive ? '#ffffff' : textMuted,
                    }}
                  >
                    {tab.dayName} {tab.dateLabel}
                  </button>
                )
              })}
            </div>

            {/* Custom Date Picker Trigger */}
            <div className="relative shrink-0 select-none">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenCustomDatePicker()
                }}
                className="relative flex items-center gap-2 h-10 min-w-[10.5rem] px-3 lg:px-4 rounded-full border shrink-0 cursor-pointer transition-[background-color,color,border-color] duration-150 hover:opacity-90 active:scale-[0.98] select-none"
                style={{
                  backgroundColor: isCustomSelected ? green : inputBg,
                  borderColor: isCustomSelected ? green : inputBorder,
                  color: isCustomSelected ? '#ffffff' : textPrimary,
                }}
                title="Pick a custom schedule date"
              >
                <CalendarDays
                  className="w-[18px] h-[18px] shrink-0 pointer-events-none select-none"
                  style={{ color: isCustomSelected ? '#ffffff' : green }}
                  strokeWidth={2.2}
                />
                <span className="text-[12px] lg:text-[13px] font-semibold whitespace-nowrap truncate flex-1 min-w-0 text-left select-none pointer-events-none">
                  {isCustomSelected
                    ? new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Custom date'}
                </span>
                <ChevronDown
                  className="w-4 h-4 shrink-0 opacity-70 pointer-events-none select-none"
                  style={{ color: isCustomSelected ? '#ffffff' : textMuted }}
                />
              </button>
            </div>

            {/* Filters button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenMonthFilterModal()
              }}
              className="flex items-center gap-1.5 h-10 px-3 rounded-full text-[12px] xl:text-[13px] font-semibold shrink-0 transition-[background-color,color,border-color] duration-150 hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? green : inputBg,
                border: `1px solid ${(monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? green : inputBorder}`,
                color: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? '#ffffff' : textPrimary,
              }}
              title="Whole-month view for this branch, filterable by negotiator"
            >
              <SlidersHorizontal
                className="w-4 h-4 shrink-0"
                style={{ color: (monthViewActive || monthFilterStatus || monthFilterNegotiatorId) ? '#ffffff' : green }}
                strokeWidth={2.1}
              />
              <span>{monthViewActive ? `Month: ${formatMonthFilterLabel(monthFilterMonth)}` : 'Filters'}</span>
            </button>

            {/* Assign Drivers */}
            {canEdit && (
              <button
                type="button"
                id="bulk-assign-driver-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenBulkAssign()
                }}
                className="flex items-center gap-1.5 h-10 px-3 rounded-full text-[12px] xl:text-[13px] font-semibold shrink-0 transition-[background-color,color,border-color] duration-150 hover:opacity-90 active:scale-95"
                style={{
                  backgroundColor: inputBg,
                  border: `1px solid ${inputBorder}`,
                  color: textPrimary,
                }}
                title="Assign driver and vehicle to an installer's tickets"
              >
                <UsersRound className="w-4 h-4 shrink-0" style={{ color: green }} strokeWidth={2.1} />
                <span>Assign Drivers</span>
              </button>
            )}

            {/* Hidden columns */}
            <HiddenColumnsButton
              hidden={hiddenColumnItems}
              isLight={isLight}
              green={green}
              inputBg={inputBg}
              inputBorder={inputBorder}
              textPrimary={textPrimary}
              onShow={onShowColumn}
              onShowAll={onShowAllColumns}
            />
          </div>

          {/* Showcase trigger */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleShowcase()
            }}
            className="order-1 md:order-2 ml-auto flex items-center gap-1.5 h-10 px-3 rounded-full text-[12px] xl:text-[13px] font-bold transition-[background-color,color] duration-150 shrink-0 active:scale-95"
            style={{
              backgroundColor: showcaseOpen ? 'transparent' : green,
              border: `1.5px solid ${green}`,
              color: showcaseOpen ? green : '#ffffff',
            }}
            title="Open fullscreen schedule showcase for print / PDF"
          >
            <Maximize2 className="w-4 h-4 shrink-0" />
            <span>{showcaseOpen ? 'Active' : 'Showcase'}</span>
          </button>
        </div>,
        slot,
      )}

      {showcaseOpen && ReactDOM.createPortal(
        <div className="flex items-center justify-between gap-3 px-5 md:px-8 py-2 bg-red-500/10 border-b border-red-500/20">
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
            Full-screen view &mdash; click <em>Export PDF to Print</em>, then Exit Showcase.
          </span>
          <button
            type="button"
            onClick={onCloseShowcase}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
            style={{
              backgroundColor: 'transparent',
              border: `2px solid ${green}`,
              color: green,
            }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Exit Showcase
          </button>
        </div>,
        slot,
      )}
    </>
  )
}
