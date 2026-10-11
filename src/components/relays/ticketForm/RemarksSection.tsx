import { MessageSquare } from 'lucide-react'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

export function RemarksSection({
  step,
  subtitle = 'Notes or special instructions',
  primaryLabel = 'Remarks',
  primaryPlaceholder = 'Notes or special instructions',
  primaryValue,
  onPrimaryChange,
  theme,
}: {
  step?: number
  subtitle?: string
  primaryLabel?: string
  primaryPlaceholder?: string
  primaryValue: string
  onPrimaryChange: (value: string) => void
  theme: RelayFormTheme
}) {
  const { inputClassName, getInputStyle } = theme

  return (
    <section>
      <FormSectionHead step={step} icon={<MessageSquare className="w-3.5 h-3.5" />} title="Remarks" subtitle={subtitle} />
      <div className="grid grid-cols-1 gap-3.5">
        <FormField label={primaryLabel}>
          <textarea
            value={primaryValue}
            onChange={e => onPrimaryChange(e.target.value.toUpperCase())}
            placeholder={primaryPlaceholder}
            rows={3}
            className={`${inputClassName} resize-none uppercase`}
            style={{ ...getInputStyle(primaryValue), textTransform: 'uppercase' }}
          />
        </FormField>
      </div>
    </section>
  )
}
