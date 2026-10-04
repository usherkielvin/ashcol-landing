import { useCallback, useMemo, useState } from 'react'
import { formatDateToKey, SCHEDULES_ACTIVE_DATE_KEY } from '../../../utils/ticketHelpers'
import type { WeeklyTabItem } from '../toolbars/SchedulesToolbar'

export interface UseScheduleDateOptions {
  dateFilter: string
  setDateFilter: (d: string) => void
  setMonthViewActive: (active: boolean) => void
  resetTicketTableScroll?: () => void
}

export function useScheduleDate({
  dateFilter,
  setDateFilter,
  setMonthViewActive,
  resetTicketTableScroll,
}: UseScheduleDateOptions) {
  const [customDatePickerOpen, setCustomDatePickerOpen] = useState(false)
  const [customDateCalMonth, setCustomDateCalMonth] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  })

  const weeklyTabs: WeeklyTabItem[] = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = formatDateToKey(today)

    const dow = today.getDay()
    const offset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(today)
    monday.setDate(today.getDate() + offset)

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const key = formatDateToKey(d)
      const isToday = key === todayKey
      const dayName = isToday ? 'Today' : d.toLocaleDateString('en-PH', { weekday: 'short' })
      const dateLabel = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      return { key, dayName, dateLabel }
    })
  }, [])

  const isCustomSelected = useMemo(() => {
    return dateFilter !== '' && !weeklyTabs.some(tab => tab.key === dateFilter)
  }, [dateFilter, weeklyTabs])

  const handleDateFilterChange = useCallback((next: string) => {
    if (next) {
      try {
        sessionStorage.setItem(SCHEDULES_ACTIVE_DATE_KEY, next)
      } catch {
        // ignore
      }
    }
    setMonthViewActive(false)
    setDateFilter(next)
    if (resetTicketTableScroll) {
      resetTicketTableScroll()
    }
  }, [setDateFilter, setMonthViewActive, resetTicketTableScroll])

  return {
    weeklyTabs,
    isCustomSelected,
    handleDateFilterChange,
    customDatePickerOpen,
    setCustomDatePickerOpen,
    customDateCalMonth,
    setCustomDateCalMonth,
  }
}
