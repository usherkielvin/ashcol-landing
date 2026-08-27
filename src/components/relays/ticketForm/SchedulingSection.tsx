import type { ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

function formatDateLabel(value: string): string {
  if (!value) return 'ADD DATE'
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
}

function DateButtonField({
  label,
  value,
  onChange,
  disabled,
  highlight,
  theme,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Accent color applied to the button once a date is set — omit for the plain/neutral fields. */
  highlight?: { bg: string; border: string; text: string }
  theme: RelayFormTheme
}) {
  const { isLight, textPrimary, inputBg, inputBorder, inputClassName } = theme
  const isSet = Boolean(value)
  return (
    <FormField label={label}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null
          if (input && input.showPicker) input.showPicker()
        }}
        className={`${inputClassName} font-bold text-center relative flex flex-col items-center justify-center`}
        style={{
          backgroundColor: isSet && highlight ? highlight.bg : inputBg,
          borderColor: isSet && highlight ? highlight.border : inputBorder,
          color: isSet && highlight ? highlight.text : textPrimary,
          colorScheme: isLight ? 'light' : 'dark',
          fontWeight: isSet && highlight ? 700 : undefined,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {formatDateLabel(value)}
        <input
          type="date"
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute opacity-0 pointer-events-none w-0 h-0"
          style={{ pointerEvents: 'none' }}
        />
      </button>
    </FormField>
  )
}

export function SchedulingSection({
  step,
  title = 'Scheduling',
  subtitle = 'Requested, schedule & installed date details',
  relayedDate,
  onRelayedDateChange,
  requestedDate,
  onRequestedDateChange,
  scheduleDate,
  onScheduleDateChange,
  scheduleDateDisabled,
  installedDate,
  onInstalledDateChange,
  reschedPending,
  theme,
}: {
  step?: number
  title?: string
  subtitle?: string
  relayedDate: string
  onRelayedDateChange: (value: string) => void
  requestedDate: string
  onRequestedDateChange: (value: string) => void
  scheduleDate: string
  onScheduleDateChange: (value: string) => void
  scheduleDateDisabled?: boolean
  installedDate: string
  onInstalledDateChange: (value: string) => void
  /** Field-surface, RESCHED-status only: "pending, no date slot yet" checkbox + helper text. */
  reschedPending?: {
    checked: boolean
    onChange: (checked: boolean) => void
    helperText?: ReactNode
  }
  theme: RelayFormTheme
}) {
  const { isLight, textPrimary, textMuted } = theme

  return (
    <section>
      <FormSectionHead step={step} icon={<CalendarDays className="w-3.5 h-3.5" />} title={title} subtitle={subtitle} />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        <div className="md:col-span-3">
          <DateButtonField label="Relayed Date" value={relayedDate} onChange={onRelayedDateChange} theme={theme} />
        </div>
        <div className="md:col-span-3">
          <DateButtonField label="Requested Date" value={requestedDate} onChange={onRequestedDateChange} theme={theme} />
        </div>
        <div className="md:col-span-3">
          <DateButtonField
            label="Schedule Date"
            value={scheduleDate}
            onChange={onScheduleDateChange}
            disabled={scheduleDateDisabled}
            highlight={{
              bg: isLight ? '#f0fdf4' : 'rgba(22,163,74,0.08)',
              border: isLight ? '#86efac' : 'rgba(22,163,74,0.4)',
              text: '#10B981',
            }}
            theme={theme}
          />
        </div>
        <div className="md:col-span-3">
          <DateButtonField
            label="Installed Date"
            value={installedDate}
            onChange={onInstalledDateChange}
            highlight={{
              bg: isLight ? '#eff6ff' : 'rgba(59,130,246,0.08)',
              border: isLight ? '#93c5fd' : 'rgba(59,130,246,0.4)',
              text: '#3B82F6',
            }}
            theme={theme}
          />
        </div>

        {reschedPending && (
          <div className="md:col-span-12 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: textPrimary }}>
              <input
                type="checkbox"
                checked={reschedPending.checked}
                onChange={e => reschedPending.onChange(e.target.checked)}
                className="rounded border-slate-300"
              />
              Pending — no date slot available yet (Schedule Date above stays as-is until confirmed)
            </label>
            {reschedPending.helperText && (
              <p className="text-[10px] font-semibold" style={{ color: textMuted }}>{reschedPending.helperText}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
