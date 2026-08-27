import { Store } from 'lucide-react'
import { DealerSelect, type DealerOption } from '../../DealerSelect'
import { ROBINSON_APPLIANCES_RE } from '../../../utils/dealer'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

export function DealerSection({
  step,
  dealer,
  onDealerChange,
  dealerBranch,
  onDealerBranchChange,
  diser,
  onDiserChange,
  transactionId,
  onTransactionIdChange,
  dealers,
  onDealersChanged,
  theme,
}: {
  step?: number
  dealer: string
  onDealerChange: (value: string) => void
  dealerBranch: string
  onDealerBranchChange: (value: string) => void
  diser: string
  onDiserChange: (value: string) => void
  transactionId: string
  onTransactionIdChange: (value: string) => void
  dealers: DealerOption[]
  onDealersChanged?: () => void
  theme: RelayFormTheme
}) {
  const { isLight, textPrimary, textMuted, inputBg, inputBorder, inputClassName, getInputStyle } = theme
  const showTransactionId = ROBINSON_APPLIANCES_RE.test(dealer || '')

  return (
    <section>
      <FormSectionHead step={step} icon={<Store className="w-3.5 h-3.5" />} title="Dealer" subtitle="Where the relay came from" />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        <FormField label="Dealer" className="md:col-span-4">
          <DealerSelect
            value={dealer}
            dealers={dealers}
            onChange={onDealerChange}
            onDealersChanged={onDealersChanged}
            isLight={isLight}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textMuted={textMuted}
          />
        </FormField>
        <FormField label="Dealer Branch" className="md:col-span-4">
          <input
            type="text"
            value={dealerBranch}
            onChange={e => onDealerBranchChange(e.target.value.toUpperCase())}
            placeholder="Branch"
            className={`${inputClassName} uppercase`}
            style={{ ...getInputStyle(dealerBranch), textTransform: 'uppercase' }}
          />
        </FormField>
        <FormField label="Diser" className="md:col-span-4">
          <input
            type="text"
            value={diser}
            onChange={e => onDiserChange(e.target.value)}
            placeholder="Dealer's sales rep name"
            className={inputClassName}
            style={getInputStyle(diser)}
          />
        </FormField>
        {showTransactionId && (
          <FormField label="Transaction ID" className="md:col-span-4">
            <input
              type="text"
              value={transactionId}
              onChange={e => onTransactionIdChange(e.target.value)}
              placeholder="Robinsons Transaction ID"
              className={inputClassName}
              style={getInputStyle(transactionId)}
            />
          </FormField>
        )}
      </div>
    </section>
  )
}
