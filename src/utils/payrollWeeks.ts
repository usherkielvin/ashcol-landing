/**
 * payrollWeeks.ts
 *
 * Utility that knows which weekly cycle each branch follows and can enumerate the
 * exact 7-day weeks that end in a given month.
 *
 * North branches (Taguig Sales, Taguig Services, Bulacan, Pampanga, Rizal):
 *   Friday to Thursday (week starts Friday, ends following Thursday)
 *
 * South branches (all others - Calauan, Candelaria, Dasmarinas, Silang, Binan, etc.):
 *   Monday to Sunday (week starts Monday, ends following Sunday)
 *
 * "Which month a week belongs to" rule: the month the week ENDS in.
 * So a North week that starts Sep 25 (Thu) and ends Oct 1 (Thu) is October Week 1.
 *
 * Pure utility - no React hooks, no side effects.
 */

import { isTaguigBranchRef } from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which day the cycle starts on */
export type WeekCycle = 'friday' | 'monday'

export interface PayrollWeek {
  /** Inclusive start date, YYYY-MM-DD */
  from: string
  /** Inclusive end date, YYYY-MM-DD */
  to: string
  /** Human-readable label, e.g. "Sep 25 - Oct 1" */
  label: string
  /** 1-based index within the owning month */
  weekNumber: number
  /** The month this week belongs to, YYYY-MM */
  owningMonth: string
}

// ---------------------------------------------------------------------------
// Branch -> cycle mapping
// ---------------------------------------------------------------------------

const NORTH_BRANCH_KEYWORDS = ['TAGUIG', 'BULACAN', 'PAMPANGA', 'RIZAL']

/**
 * Returns which weekly cycle applies to the given branch.
 * North branches (Taguig Sales/Services, Bulacan, Pampanga, Rizal) run Fri-Thu.
 * All others run Mon-Sun.
 */
export function branchWeekCycle(branchIdOrName?: string | null): WeekCycle {
  if (!branchIdOrName) return 'monday'
  const upper = branchIdOrName.toUpperCase()
  if (isTaguigBranchRef(branchIdOrName)) return 'friday'
  for (const kw of NORTH_BRANCH_KEYWORDS) {
    if (upper.includes(kw)) return 'friday'
  }
  return 'monday'
}

// ---------------------------------------------------------------------------
// Date arithmetic helpers (local time, no UTC drift)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Returns the start of the week that contains `date`.
 * Friday cycle: any date maps to the preceding Friday (or that day if it is Friday).
 * Monday cycle: any date maps to the preceding Monday.
 */
export function weekStartContaining(date: Date, cycle: WeekCycle): Date {
  const dow = date.getDay() // 0=Sun .. 6=Sat
  if (cycle === 'friday') {
    const daysSinceFri = (dow - 5 + 7) % 7
    return addDays(date, -daysSinceFri)
  } else {
    const daysSinceMon = (dow - 1 + 7) % 7
    return addDays(date, -daysSinceMon)
  }
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Returns the PayrollWeek that contains `date` for the given cycle.
 * The week runs exactly 7 days inclusive.
 */
export function weekContaining(date: Date | string, cycle: WeekCycle): PayrollWeek {
  const d = typeof date === 'string' ? parseYMD(date) : date
  const start = weekStartContaining(d, cycle)
  const end = addDays(start, 6)
  const owningMonth = `${end.getFullYear()}-${pad(end.getMonth() + 1)}`
  return {
    from: toYMD(start),
    to: toYMD(end),
    label: `${fmtShort(start)} - ${fmtShort(end)}`,
    weekNumber: -1, // filled by weeksOfMonth
    owningMonth,
  }
}

/**
 * Lists every payroll week whose END date falls in `month` (YYYY-MM) for the
 * given cycle. Returns weeks in ascending order, numbered 1, 2, 3 ...
 */
export function weeksOfMonth(month: string, cycle: WeekCycle): PayrollWeek[] {
  const [y, m] = month.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0)

  // Start from the Monday/Friday on or before the 1st of this month
  let cursor = weekStartContaining(firstDay, cycle)

  const weeks: PayrollWeek[] = []

  for (let i = 0; i < 7; i++) {
    const end = addDays(cursor, 6)
    if (end > lastDay) break
    if (end >= firstDay) {
      weeks.push({
        from: toYMD(cursor),
        to: toYMD(end),
        label: `${fmtShort(cursor)} - ${fmtShort(end)}`,
        weekNumber: weeks.length + 1,
        owningMonth: `${end.getFullYear()}-${pad(end.getMonth() + 1)}`,
      })
    }
    cursor = addDays(cursor, 7)
  }

  return weeks
}

// ---------------------------------------------------------------------------
// Month navigation helpers for the toolbar
// ---------------------------------------------------------------------------

/** YYYY-MM for the month the current date's week ends in */
export function owningMonthOf(date: Date | string, cycle: WeekCycle): string {
  return weekContaining(date, cycle).owningMonth
}

export function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** e.g. "September 2026" */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Today as YYYY-MM-DD */
export function todayYMD(): string {
  return toYMD(new Date())
}
