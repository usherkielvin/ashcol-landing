import { useState } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import { getRegionNames, getCities, getBarangays } from '../data/phAddress'

export interface AddressValue {
  region: string
  city: string
  barangay: string
  street: string
  landmark: string
}

interface Props {
  value: AddressValue
  onChange: (v: AddressValue) => void
  inputBg: string
  inputBorder: string
  inputText: string
  textMuted: string
  /** Hide the "use my current location" geolocation button — e.g. on the public booking form. */
  hideLocationButton?: boolean
}

const sel = `w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] appearance-none bg-no-repeat`
const selBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237A95B8' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") right 12px center / 12px no-repeat`

export default function PhAddressPicker({ value, onChange, inputBg, inputBorder, inputText, textMuted, hideLocationButton = false }: Props) {
  const [locLoading, setLocLoading] = useState(false)
  const [locErr, setLocErr]         = useState('')

  const regions   = getRegionNames()
  const cities    = value.region ? getCities(value.region, '').map(c => c.name) : []
  const barangays = value.city   ? getBarangays(value.region, '', value.city)   : []

  // Reset downstream when parent changes
  const set = (field: keyof AddressValue, val: string) => {
    const next = { ...value, [field]: val }
    if (field === 'region') { next.city = ''; next.barangay = '' }
    if (field === 'city')   { next.barangay = '' }
    onChange(next)
  }

  const isSecureContext = typeof window !== 'undefined' && window.isSecureContext

  const detectLocation = () => {
    if (!navigator.geolocation) return setLocErr('Geolocation not supported.')
    setLocLoading(true); setLocErr('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const a = data.address || {}

          // Try to match detected city/municipality to our data
          const detectedCity = a.city || a.town || a.municipality || a.village || ''
          const detectedBrgy = a.suburb || a.neighbourhood || a.quarter || ''
          const detectedStreet = [a.house_number, a.road].filter(Boolean).join(' ')

          // Find matching region/city in our data
          let matchedRegion = '', matchedCity = ''
          outer: for (const region of getRegionNames()) {
            const allCities = getCities(region, '')
            for (const city of allCities) {
              if (city.name.toLowerCase().includes(detectedCity.toLowerCase()) ||
                  detectedCity.toLowerCase().includes(city.name.toLowerCase())) {
                matchedRegion = region; matchedCity = city.name
                break outer
              }
            }
          }

          // Find matching barangay
          let matchedBrgy = ''
          if (matchedCity && detectedBrgy) {
            const brgys = getBarangays(matchedRegion, '', matchedCity)
            matchedBrgy = brgys.find(b =>
              b.toLowerCase().includes(detectedBrgy.toLowerCase()) ||
              detectedBrgy.toLowerCase().includes(b.toLowerCase())
            ) || ''
          }

          onChange({
            region: matchedRegion,
            city: matchedCity,
            barangay: matchedBrgy,
            street: detectedStreet,
            landmark: value.landmark,
          })
        } catch {
          setLocErr('Could not resolve address. Please fill in manually.')
        } finally { setLocLoading(false) }
      },
      () => { setLocErr('Location access denied. Please fill in the address manually.'); setLocLoading(false) },
      { timeout: 10000 }
    )
  }

  const sty = { backgroundColor: inputBg, borderColor: inputBorder, color: inputText, backgroundImage: selBg }

  return (
    <div className="flex flex-col gap-3">

      {/* Auto-detect — only shown on secure contexts (https or localhost) */}
      {!hideLocationButton && (
        isSecureContext ? (
          <button
            type="button" onClick={detectLocation} disabled={locLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:border-[#10B981] hover:text-[#10B981] disabled:opacity-50 w-fit"
            style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
          >
            <Navigation className="w-4 h-4 text-[#10B981]" />
            {locLoading ? 'Detecting...' : 'Use my current location'}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]" style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B' }}>
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            Auto-detect unavailable on non-secure connections. Please fill in your address below.
          </div>
        )
      )}
      {locErr && <p className="text-xs text-red-400">{locErr}</p>}

      {/* Region */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: textMuted }}>Region</label>
        <select value={value.region} onChange={e => set('region', e.target.value)} className={sel} style={sty}>
          <option value="">Select region</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* City / Municipality */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: textMuted }}>City / Municipality</label>
        <select value={value.city} onChange={e => set('city', e.target.value)} disabled={!value.region} className={sel} style={{ ...sty, opacity: value.region ? 1 : 0.5 }}>
          <option value="">Select city / municipality</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Barangay */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: textMuted }}>Barangay</label>
        <select value={value.barangay} onChange={e => set('barangay', e.target.value)} disabled={!value.city} className={sel} style={{ ...sty, opacity: value.city ? 1 : 0.5 }}>
          <option value="">Select barangay</option>
          {barangays.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Street */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: textMuted }}>
          House / Unit No. & Street
        </label>
        <input
          type="text" value={value.street}
          onChange={e => set('street', e.target.value)}
          placeholder="e.g. 123 Rizal St."
          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]"
        />
      </div>

      {/* Landmark */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: textMuted }}>Landmark (optional)</label>
        <input
          type="text" value={value.landmark}
          onChange={e => set('landmark', e.target.value)}
          placeholder="e.g. Near SM Mall, beside 7-Eleven"
          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
          className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]"
        />
      </div>

      {/* Preview */}
      {(value.street || value.barangay || value.city) && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <MapPin className="w-3.5 h-3.5 text-[#10B981] mt-0.5 shrink-0" />
          <p className="text-[12px] leading-relaxed text-[#10B981]">
            {[value.region, value.city, value.barangay, value.street].filter(Boolean).join(', ')}
            {value.landmark ? ` (${value.landmark})` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
