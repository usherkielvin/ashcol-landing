import { Truck } from 'lucide-react'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

export type InstallerOption = { id: string; name: string; label: string }

export function DispatchSection({
  step,
  subtitle = 'Vehicle, driver & installer assignment',
  idPrefix,
  isTaguigServices,
  installerName,
  onInstallerChange,
  installerOptions,
  driverName,
  onDriverChange,
  driverRoster,
  vehicle,
  onVehicleChange,
  theme,
}: {
  step?: number
  subtitle?: string
  /** Namespaces the <datalist> ids so Create and Edit can both be mounted without id collisions. */
  idPrefix: string
  isTaguigServices?: boolean
  installerName: string
  onInstallerChange: (value: string) => void
  installerOptions: InstallerOption[]
  driverName: string
  onDriverChange: (value: string) => void
  driverRoster: string[]
  vehicle: string
  onVehicleChange: (value: string) => void
  theme: RelayFormTheme
}) {
  const { textPrimary, inputBg, inputBorder, inputClassName, getInputStyle } = theme
  const driverListId = `${idPrefix}-driver-roster`

  return (
    <section>
      <FormSectionHead step={step} icon={<Truck className="w-3.5 h-3.5" />} title="Dispatch" subtitle={subtitle} />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        <FormField label={isTaguigServices ? 'Technician' : 'Installer / Technician'} className="md:col-span-4">
          <select
            value={installerName || ''}
            onChange={e => onInstallerChange(e.target.value)}
            className={inputClassName}
            style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
          >
            <option value="">{isTaguigServices ? 'Select technician...' : 'Select installer...'}</option>
            {installerOptions.map(opt => (
              <option key={opt.id} value={opt.name}>{opt.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Driver" className="md:col-span-4">
          <input
            type="text"
            value={driverName || ''}
            list={driverListId}
            placeholder={driverRoster.length ? 'Select or type driver…' : 'Driver name'}
            onChange={e => onDriverChange(e.target.value)}
            className={inputClassName}
            style={getInputStyle(driverName)}
          />
          <datalist id={driverListId}>
            {driverRoster.map(name => <option key={name} value={name} />)}
          </datalist>
        </FormField>
        <FormField label="Vehicle" className="md:col-span-4">
          <input
            type="text"
            value={vehicle || ''}
            placeholder="e.g. FB19, T2, T3"
            onChange={e => onVehicleChange(e.target.value)}
            className={inputClassName}
            style={getInputStyle(vehicle)}
          />
        </FormField>
      </div>
    </section>
  )
}
