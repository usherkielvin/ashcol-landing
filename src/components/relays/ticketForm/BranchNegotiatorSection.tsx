import { Users } from 'lucide-react'
import { formatBranchName } from '../../../utils/api'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

export type NegotiatorOption = { id: string; name?: string; branchId?: string | null; phone?: string | null }

export function BranchNegotiatorSection({
  step,
  title = 'Branch & Negotiator',
  subtitle,
  branchId,
  onBranchChange,
  branches,
  negotiatorId,
  onNegotiatorChange,
  negotiators,
  resolveBranchName,
  negotiatorPhone,
  theme,
}: {
  step?: number
  title?: string
  subtitle?: string
  branchId: string
  onBranchChange: (branchId: string) => void
  branches: { id: string; name: string }[]
  negotiatorId: string
  onNegotiatorChange: (negotiatorId: string, employee?: NegotiatorOption) => void
  negotiators: NegotiatorOption[]
  /** Resolves a branch id to its human name, for building "First Name - BRANCH" option labels. */
  resolveBranchName: (branchId?: string) => string
  negotiatorPhone: string
  theme: RelayFormTheme
}) {
  const { textPrimary, inputBg, inputBorder, inputClassName, getInputStyle } = theme

  return (
    <section>
      <FormSectionHead step={step} icon={<Users className="w-3.5 h-3.5" />} title={title} subtitle={subtitle} />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        <FormField label="Branch Zone" className="md:col-span-5">
          <select
            value={branchId}
            onChange={e => onBranchChange(e.target.value)}
            className={inputClassName}
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="">{branches.length ? 'Select branch...' : 'Loading…'}</option>
            {branches.map(b => <option key={b.id} value={b.id}>{formatBranchName(b.name)}</option>)}
          </select>
        </FormField>
        <FormField label="Negotiator" required className="md:col-span-4">
          <select
            required
            value={negotiatorId || ''}
            onChange={e => {
              const val = e.target.value
              const employee = negotiators.find(emp => emp.id === val)
              onNegotiatorChange(val, employee)
            }}
            className={inputClassName}
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="">Select negotiator...</option>
            {negotiators.map(emp => {
              const branchName = formatBranchName(resolveBranchName(emp.branchId || undefined))
              const firstName = (emp.name || '').split(' ')[0]
              const nameWithBranch = branchName ? `${firstName} - ${branchName}` : firstName
              return <option key={emp.id} value={emp.id}>{nameWithBranch.toUpperCase()}</option>
            })}
          </select>
        </FormField>
        <FormField label="Negotiator Phone No." className="md:col-span-3">
          <input
            type="text"
            readOnly
            value={(negotiatorPhone || '').trim() || 'N/A'}
            className={`${inputClassName} cursor-text select-all`}
            style={getInputStyle()}
          />
        </FormField>
      </div>
    </section>
  )
}
