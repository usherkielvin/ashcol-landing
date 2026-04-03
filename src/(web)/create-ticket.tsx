/**
 * Web Portal Create Ticket Page
 *
 * Clean form for submitting a new service request.
 * Redirects to /tickets on success.
 */

/// <reference types="vite/client" />

import { Send, AlertCircle, Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICE_TYPES = ['Cleaning', 'Maintenance', 'Repair', 'Installation'] as const

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ---------------------------------------------------------------------------
// DatePicker Component
// ---------------------------------------------------------------------------

interface DatePickerProps {
  value: string            // 'YYYY-MM-DD' or ''
  onChange: (v: string) => void
  min?: string             // 'YYYY-MM-DD'
  isLight: boolean
}

function DatePicker({ value, onChange, min, isLight }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const minDate = min ? new Date(min + 'T00:00:00') : today

  const parseValue = (v: string) => {
    if (!v) return null
    const d = new Date(v + 'T00:00:00')
    return isNaN(d.getTime()) ? null : d
  }

  const selectedDate = parseValue(value)

  // Calendar view state (which month is shown)
  const [viewYear, setViewYear] = useState(() => (selectedDate ?? today).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => (selectedDate ?? today).getMonth())

  // Sync view when value changes externally
  useEffect(() => {
    if (selectedDate) {
      setViewYear(selectedDate.getFullYear())
      setViewMonth(selectedDate.getMonth())
    }
  }, [value])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const prevMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 0) { setViewYear(y => y - 1); return 11 }
      return m - 1
    })
  }, [])

  const nextMonth = useCallback(() => {
    setViewMonth(m => {
      if (m === 11) { setViewYear(y => y + 1); return 0 }
      return m + 1
    })
  }, [])

  // Build day grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()  // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    if (d < minDate) return
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    onChange(`${yyyy}-${mm}-${dd}`)
    setOpen(false)
  }

  const isDayDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    return d < minDate
  }

  const isDaySelected = (day: number) => {
    if (!selectedDate) return false
    return (
      selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getDate() === day
    )
  }

  const isDayToday = (day: number) => {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    )
  }

  const displayLabel = selectedDate
    ? selectedDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Select a date'

  // Colours
  const popupBg     = isLight ? '#ffffff' : '#0A1120'
  const popupBorder = isLight ? '#e2e8f0' : '#1E2D48'
  const headBg      = isLight ? '#f8fafc' : '#0F1A2E'
  const textMain    = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const hoverBg     = isLight ? '#f1f5f9' : '#1a2c4a'
  const todayBorder = '#10B981'
  const selectedBg  = '#10B981'

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full h-[46px] flex items-center gap-2.5 px-3.5 rounded-lg border-2 text-sm transition-all ${
          open
            ? 'border-emerald-500'
            : isLight
              ? 'bg-white border-gray-200 hover:border-emerald-300'
              : 'bg-gray-800 border-gray-700 hover:border-emerald-500/60'
        }`}
      >
        <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className={`flex-1 text-left ${selectedDate ? (isLight ? 'text-gray-900' : 'text-white') : 'text-gray-400'}`}>
          {displayLabel}
        </span>
        {selectedDate && (
          <button
            type="button"
            onMouseDown={e => { e.stopPropagation() }}
            onClick={e => { e.stopPropagation(); onChange('') }}
            className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      {/* Calendar popup */}
      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-xl shadow-2xl overflow-hidden"
          style={{
            backgroundColor: popupBg,
            border: `1px solid ${popupBorder}`,
          }}
        >
          {/* Month / year header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: headBg, borderBottom: `1px solid ${popupBorder}` }}
          >
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg transition-colors hover:bg-emerald-500/10 hover:text-emerald-500"
              style={{ color: textMuted }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-sm font-bold" style={{ color: textMain }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg transition-colors hover:bg-emerald-500/10 hover:text-emerald-500"
              style={{ color: textMuted }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 px-2 pt-2 pb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[11px] font-bold py-1" style={{ color: textMuted }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} />

              const disabled = isDayDisabled(day)
              const selected = isDaySelected(day)
              const isToday  = isDayToday(day)

              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className="relative flex items-center justify-center h-8 w-full rounded-lg text-sm font-medium transition-all"
                  style={{
                    color: disabled
                      ? isLight ? '#CBD5E1' : '#3a4f6a'
                      : selected
                        ? '#ffffff'
                        : textMain,
                    backgroundColor: selected ? selectedBg : 'transparent',
                    border: isToday && !selected ? `1.5px solid ${todayBorder}` : undefined,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => {
                    if (!disabled && !selected)
                      (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg
                  }}
                  onMouseLeave={e => {
                    if (!selected)
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                  }}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer: Today shortcut */}
          <div style={{ borderTop: `1px solid ${popupBorder}`, padding: '8px 12px' }}>
            <button
              type="button"
              onClick={() => {
                const y = today.getFullYear()
                const m = String(today.getMonth() + 1).padStart(2, '0')
                const d = String(today.getDate()).padStart(2, '0')
                onChange(`${y}-${m}-${d}`)
                setOpen(false)
              }}
              className="text-xs font-semibold text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              Select Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function WebCreateTicketPage(): React.ReactElement {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [serviceType, setServiceType] = useState('')
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [barangay, setBarangay] = useState('')
  const [street, setStreet] = useState('')
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '')
  const [preferredDate, setPreferredDate] = useState('')

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!serviceType) next.serviceType = 'Please select a service type.'
    if (!description.trim()) next.description = 'Description is required.'
    if (description.trim().length < 10) next.description = 'Please describe the issue in more detail (at least 10 characters).'
    if (!region.trim()) next.region = 'Region is required.'
    if (!city.trim()) next.city = 'City is required.'
    if (!barangay.trim()) next.barangay = 'Barangay is required.'
    if (!street.trim()) next.street = 'Street is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setSubmitError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

      const fullLocation = [region.trim(), city.trim(), barangay.trim(), street.trim()]
        .filter(Boolean)
        .join(', ')

      const res = await fetch(`${apiUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `${serviceType} service`,
          description: description.trim(),
          serviceType,
          location: fullLocation,
          contactPhone: contactPhone.trim() || undefined,
          preferredDate: preferredDate || undefined,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error((errorData as any).message || 'Failed to submit ticket')
      }

      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Failed to submit ticket')

      navigate('/tickets?refresh=true', { replace: true })
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit ticket. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = (err?: string) =>
    `w-full h-[46px] bg-white dark:bg-gray-800 border-2 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all ${
      err ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
    }`

  return (
    <div className="max-w-[680px] space-y-5">

      {/* ── Service Type ── */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Service Type <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {SERVICE_TYPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setServiceType(s)
                if (errors.serviceType) setErrors(p => ({ ...p, serviceType: '' }))
              }}
              className={`px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                serviceType === s
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {errors.serviceType && <p className="text-sm text-red-500">{errors.serviceType}</p>}
      </div>

      {/* ── Description ── */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          className={`w-full min-h-[120px] bg-white dark:bg-gray-800 border-2 rounded-lg px-3.5 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all resize-none ${
            errors.description ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
          }`}
          placeholder="Describe the issue or service needed…"
          value={description}
          onChange={e => {
            setDescription(e.target.value)
            if (errors.description) setErrors(p => ({ ...p, description: '' }))
          }}
        />
        {errors.description && <p className="text-sm text-red-500">{errors.description}</p>}
      </div>

      {/* ── Service Address ── */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Service Address <span className="text-red-500">*</span>
        </label>

        <div>
          <input type="text" className={inputCls(errors.region)}
            placeholder="Region (e.g., NCR, Region III)"
            value={region} onChange={e => { setRegion(e.target.value); if (errors.region) setErrors(p => ({ ...p, region: '' })) }}
          />
          {errors.region && <p className="text-xs text-red-500 mt-1">{errors.region}</p>}
        </div>

        <div>
          <input type="text" className={inputCls(errors.city)}
            placeholder="City/Municipality (e.g., Quezon City)"
            value={city} onChange={e => { setCity(e.target.value); if (errors.city) setErrors(p => ({ ...p, city: '' })) }}
          />
          {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
        </div>

        <div>
          <input type="text" className={inputCls(errors.barangay)}
            placeholder="Barangay (e.g., Barangay 123)"
            value={barangay} onChange={e => { setBarangay(e.target.value); if (errors.barangay) setErrors(p => ({ ...p, barangay: '' })) }}
          />
          {errors.barangay && <p className="text-xs text-red-500 mt-1">{errors.barangay}</p>}
        </div>

        <div>
          <input type="text" className={inputCls(errors.street)}
            placeholder="Street/House No. (e.g., 123 Main St.)"
            value={street} onChange={e => { setStreet(e.target.value); if (errors.street) setErrors(p => ({ ...p, street: '' })) }}
          />
          {errors.street && <p className="text-xs text-red-500 mt-1">{errors.street}</p>}
        </div>
      </div>

      {/* ── Contact Phone ── */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Contact Phone</label>
        <input
          type="tel"
          className="w-full h-[46px] bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all focus:border-emerald-500"
          placeholder="e.g. 09123456789"
          value={contactPhone}
          onChange={e => setContactPhone(e.target.value)}
        />
      </div>

      {/* ── Preferred Date ── */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preferred Date</label>
        <DatePicker
          value={preferredDate}
          onChange={setPreferredDate}
          min={new Date().toISOString().split('T')[0]}
          isLight={isLight}
        />
      </div>

      {/* ── Submit error ── */}
      {submitError && (
        <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3.5">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">{submitError}</p>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 transition-all"
        >
          Cancel
        </button>

        <button
          type="submit"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all min-w-[140px]"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Submit Ticket</span>
            </>
          )}
        </button>
      </div>

    </div>
  )
}
