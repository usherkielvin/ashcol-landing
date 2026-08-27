import type { ReactNode } from 'react'
import { UserRound } from 'lucide-react'
import { guessDistrict } from '../../../utils/districtGuesser'
import { formatPhilippinePhoneInput, extractPhoneNumbers } from '../../../utils/phoneInput'
import { FormField, FormSectionHead } from './FormField'
import type { RelayFormTheme } from './theme'

export function CustomerDetailsSection({
  step,
  customerName,
  onCustomerNameChange,
  onCustomerNameFocus,
  onCustomerNameBlur,
  onCustomerNameKeyDown,
  nameFieldExtra,
  /** Create-only: full-width duplicate/sync banners, rendered below the name field. */
  belowNameBanners,
  phoneNumbers,
  onPhoneNumbersChange,
  address,
  district,
  onLocationChange,
  onDistrictChange,
  landmark,
  onLandmarkChange,
  theme,
}: {
  step?: number
  customerName: string
  onCustomerNameChange: (value: string) => void
  onCustomerNameFocus?: () => void
  onCustomerNameBlur?: () => void
  onCustomerNameKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** Create-only: the live duplicate-ticket-search dropdown, rendered directly below the name input. */
  nameFieldExtra?: ReactNode
  belowNameBanners?: ReactNode
  phoneNumbers: string[]
  onPhoneNumbersChange: (next: string[]) => void
  address: string
  district: string
  /** District is included only when guessDistrict() produced a non-empty guess for the new address. */
  onLocationChange: (next: { location: string; district?: string }) => void
  onDistrictChange: (value: string) => void
  landmark: string
  onLandmarkChange: (value: string) => void
  theme: RelayFormTheme
}) {
  const { inputClassName, getInputStyle } = theme

  return (
    <section>
      <FormSectionHead step={step} icon={<UserRound className="w-3.5 h-3.5" />} title="Customer Details" subtitle="Who and where to deliver service" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3.5 sm:gap-4">
        <FormField label="Customer Name" required className="sm:col-span-1 md:col-span-6">
          <div className="relative">
            <input
              type="text"
              required
              value={customerName}
              onChange={e => onCustomerNameChange(e.target.value)}
              onFocus={onCustomerNameFocus}
              onBlur={onCustomerNameBlur}
              onKeyDown={onCustomerNameKeyDown}
              placeholder="Full name"
              className={inputClassName}
              style={getInputStyle(customerName)}
            />
            {nameFieldExtra}
          </div>
        </FormField>

        <FormField label="Contact Number" className="sm:col-span-1 md:col-span-6">
          <div className="flex flex-col gap-2">
            {phoneNumbers.map((phone, pIdx) => (
              <div key={pIdx} className="flex gap-2 items-center">
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={e => {
                    const formatted = formatPhilippinePhoneInput(e.target.value)
                    const next = [...phoneNumbers]
                    next[pIdx] = formatted
                    onPhoneNumbersChange(next)
                  }}
                  onPaste={e => {
                    const pasted = e.clipboardData.getData('text')
                    const numbers = extractPhoneNumbers(pasted)
                    if (numbers.length < 2) return
                    e.preventDefault()
                    const next = [...phoneNumbers]
                    next[pIdx] = formatPhilippinePhoneInput(numbers[0])
                    next.splice(pIdx + 1, 0, ...numbers.slice(1).map(formatPhilippinePhoneInput))
                    onPhoneNumbersChange(next)
                  }}
                  placeholder="0917 869 4260"
                  className={`${inputClassName} font-mono tracking-wide`}
                  style={getInputStyle(phone)}
                />
                {pIdx === 0 ? (
                  <button
                    type="button"
                    onClick={() => onPhoneNumbersChange([...phoneNumbers, ''])}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-white shrink-0 shadow-xs"
                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                  >
                    Add
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPhoneNumbersChange(phoneNumbers.filter((_, idx) => idx !== pIdx))}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 shrink-0 shadow-xs"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </FormField>

        {belowNameBanners && <div className="sm:col-span-2 md:col-span-12">{belowNameBanners}</div>}

        <FormField label="Address" required className="sm:col-span-2 md:col-span-8">
          <textarea
            required
            value={address}
            onChange={e => {
              const val = e.target.value
              const guessed = guessDistrict(val)
              onLocationChange(guessed ? { location: val, district: guessed } : { location: val })
            }}
            placeholder="Complete installation address"
            rows={2}
            className={`${inputClassName} resize-none`}
            style={getInputStyle(address)}
          />
        </FormField>
        <FormField label="District" className="sm:col-span-1 md:col-span-2">
          <input type="text" value={district} onChange={e => onDistrictChange(e.target.value)} placeholder="Area" className={inputClassName} style={getInputStyle(district)} />
        </FormField>
        <FormField label="Landmark" className="sm:col-span-1 md:col-span-2">
          <input type="text" value={landmark} onChange={e => onLandmarkChange(e.target.value)} placeholder="Nearest landmark" className={inputClassName} style={getInputStyle(landmark)} />
        </FormField>
      </div>
    </section>
  )
}
