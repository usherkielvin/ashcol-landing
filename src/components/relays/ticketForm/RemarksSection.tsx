import { MessageSquare } from 'lucide-react'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

export function RemarksSection({
  step,
  subtitle = 'Notes or special instructions',
  /** Edit-only: the ticket's current remarks value, editable directly. Omit for Create — a brand
   *  new ticket has no existing remarks to show separately from the note being typed. */
  remarks,
  onRemarksChange,
  primaryLabel = 'Remarks',
  primaryPlaceholder = 'Notes or special instructions',
  primaryValue,
  onPrimaryChange,
  theme,
}: {
  step?: number
  subtitle?: string
  remarks?: string
  onRemarksChange?: (value: string) => void
  primaryLabel?: string
  primaryPlaceholder?: string
  primaryValue: string
  onPrimaryChange: (value: string) => void
  theme: RelayFormTheme
}) {
  const { isLight, inputClassName, getInputStyle } = theme
  const showRemarksField = remarks !== undefined

  return (
    <section>
      <FormSectionHead step={step} icon={<MessageSquare className="w-3.5 h-3.5" />} title="Remarks" subtitle={subtitle} />
      <div className="grid grid-cols-1 gap-3.5">
        {showRemarksField && (
          <FormField label="Remarks / Update">
            <textarea
              value={remarks || ''}
              readOnly={!onRemarksChange}
              onChange={onRemarksChange ? (e => onRemarksChange(e.target.value.toUpperCase())) : undefined}
              rows={2}
              className={`${inputClassName} resize-none uppercase ${!onRemarksChange ? 'cursor-not-allowed select-text' : ''}`}
              style={{
                ...getInputStyle(remarks),
                textTransform: 'uppercase',
                ...(!onRemarksChange ? { opacity: 0.85, backgroundColor: isLight ? '#f8fafc' : 'rgba(255,255,255,0.04)' } : {}),
              }}
            />
          </FormField>
        )}
        <FormField label={primaryLabel}>
          <textarea
            value={primaryValue}
            onChange={e => onPrimaryChange(e.target.value)}
            placeholder={primaryPlaceholder}
            rows={3}
            className={`${inputClassName} resize-none`}
            style={getInputStyle(primaryValue)}
          />
        </FormField>
      </div>
    </section>
  )
}
