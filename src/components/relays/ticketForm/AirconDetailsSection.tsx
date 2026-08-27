import { Wind, FileText } from 'lucide-react'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

export function AirconDetailsSection({
  step,
  brand,
  onBrandChange,
  capacity,
  onCapacityChange,
  sku,
  onSkuChange,
  serialNumber,
  onSerialNumberChange,
  commitType,
  onCommitTypeChange,
  voucher,
  theme,
}: {
  step?: number
  brand: string
  onBrandChange: (value: string) => void
  capacity: string
  onCapacityChange: (value: string) => void
  sku: string
  onSkuChange: (value: string) => void
  serialNumber: string
  onSerialNumberChange: (value: string) => void
  commitType: string
  onCommitTypeChange: (value: string) => void
  /** Edit-only: shows the attached AI-extraction voucher/image when one is on file. */
  voucher?: { url: string; label: string }
  theme: RelayFormTheme
}) {
  const { textPrimary, textMuted, inputBg, inputBorder, inputClassName, getInputStyle } = theme

  return (
    <section>
      <FormSectionHead step={step} icon={<Wind className="w-3.5 h-3.5" />} title="Aircon Details" subtitle="Unit being serviced or installed" />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        <FormField label="Brand" className="md:col-span-3">
          <input type="text" value={brand} onChange={e => onBrandChange(e.target.value)} placeholder="Brand" className={inputClassName} style={getInputStyle(brand)} />
        </FormField>
        <FormField label="Capacity" className="md:col-span-2">
          <input type="text" value={capacity} onChange={e => onCapacityChange(e.target.value)} placeholder="1.5 HP" className={inputClassName} style={getInputStyle(capacity)} />
        </FormField>
        <FormField label="SKU" className="md:col-span-3">
          <input type="text" value={sku} onChange={e => onSkuChange(e.target.value)} placeholder="SKU" className={inputClassName} style={getInputStyle(sku)} />
        </FormField>
        <FormField label="Serial No." className={voucher ? 'md:col-span-4' : 'md:col-span-4'}>
          <input type="text" value={serialNumber} onChange={e => onSerialNumberChange(e.target.value)} placeholder="Serial" className={inputClassName} style={getInputStyle(serialNumber)} />
        </FormField>
        <FormField label="Commit / Promo" className={voucher ? 'md:col-span-8' : 'md:col-span-12'}>
          <input type="text" value={commitType} onChange={e => onCommitTypeChange(e.target.value)} placeholder="Promo terms" className={inputClassName} style={getInputStyle(commitType)} />
        </FormField>
        {voucher && (
          <div className="md:col-span-4 flex flex-col justify-end">
            <div className="rounded-lg p-2 flex items-center justify-between border" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="text-[10px]">
                  <p className="font-bold" style={{ color: textPrimary }}>Attached Voucher</p>
                  <p className="truncate max-w-[100px]" style={{ color: textMuted }}>{voucher.label}</p>
                </div>
              </div>
              <a href={voucher.url} target="_blank" rel="noreferrer" className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 rounded text-[9px] font-bold transition-all">View</a>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
