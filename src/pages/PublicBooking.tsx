import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2, Wind, Phone, User, Mail, Calendar, MessageSquare, Sun, Moon, Clock, Camera, X, AlertTriangle, Minus, Plus } from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import PhAddressPicker, { type AddressValue } from '../components/PhAddressPicker'
import CalendarPicker from '../components/CalendarPicker'
import { API_BASE_URL } from '../utils/api'

const inputCls = 'w-full border rounded-xl px-3.5 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]'
const labelCls = 'text-[11px] font-bold uppercase tracking-wider mb-1.5 block'

const emptyAddress: AddressValue = { region: '', city: '', barangay: '', street: '', landmark: '' }

const SERVICE_TYPES = [
  'General Cleaning',
  'Repair / Not Cooling',
  'Installation',
  'Dismantling / Relocation',
  'Preventive Maintenance / Survey',
  'Other',
] as const

const SERVICE_TYPE_DETAILS: Record<string, string> = {
  'General Cleaning': 'Deep cleaning of the indoor and outdoor unit to restore airflow and cooling efficiency.',
  'Repair / Not Cooling': 'Diagnosis and repair for units that are not cooling, leaking, or making unusual noise.',
  'Installation': 'Mounting and setup of a new unit, including piping and initial testing.',
  'Dismantling / Relocation': 'Safe removal of a unit for relocation, replacement, or storage.',
  'Preventive Maintenance / Survey': 'Routine inspection to catch issues early and keep the unit running well.',
  'Other': 'Please describe what you need in the Aircon Issue / Request field below.',
}

const AIRCON_TYPES = [
  'Window Type',
  'Split Type Wall-Mounted',
  'Floor Mounted',
  'Ceiling Cassette',
] as const

const TIME_SLOTS = [
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'ANYTIME', label: 'Anytime' },
] as const

interface BranchCoverage {
  id: string
  name: string
  serviceCities?: string[]
}

export default function PublicBooking() {
  // Matches Landing.tsx's theme tokens — this is the public site's only form page today, so it
  // establishes the pattern rather than fighting an existing one.
  const [isDark, setIsDark] = useState(true)

  const t = {
    bg:        isDark ? '#060B18'            : '#F4FAF4',
    bgNav:     isDark ? 'rgba(6,11,24,0.92)' : 'rgba(255,255,255,0.95)',
    bgCard:    isDark ? '#0F1A2E'            : '#FFFFFF',
    inputBg:   isDark ? '#0A1120'            : '#F7FCF7',
    border:    isDark ? '#1E2D48'            : '#C8E6C8',
    text:      isDark ? '#E2E8F0'            : '#0D2010',
    textMuted: isDark ? '#7A95B8'            : '#3A6040',
    textFaint: isDark ? '#3A5070'            : '#7AAA7A',
    accent:    '#10B981',
    accentBg:  isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.10)',
  }

  const inputSty = { backgroundColor: t.inputBg, borderColor: t.border, color: t.text, colorScheme: isDark ? 'dark' as const : 'light' as const }

  const [customerName, setCustomerName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [address, setAddress] = useState<AddressValue>(emptyAddress)
  const [serviceType, setServiceType] = useState('')
  const [airconType, setAirconType] = useState('')
  const [unitQuantity, setUnitQuantity] = useState(1)
  const [brand, setBrand] = useState('')
  const [capacity, setCapacity] = useState('')
  const [requestedDate, setRequestedDate] = useState('')
  const [preferredTimeSlot, setPreferredTimeSlot] = useState<string>('')
  const [issueDescription, setIssueDescription] = useState('')

  const [photos, setPhotos] = useState<File[]>([])

  const [branches, setBranches] = useState<BranchCoverage[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const todayKey = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetch(`${API_BASE_URL}/public/branches`)
      .then(res => res.json())
      .then(data => setBranches(Array.isArray(data?.data) ? data.data : []))
      .catch(() => setBranches([]))
  }, [])

  // Only warn about coverage once at least one branch actually has configured service areas —
  // otherwise every submission would falsely show "outside our service zones".
  const branchesWithAreas = branches.filter(b => (b.serviceCities?.length ?? 0) > 0)
  const outOfServiceArea = Boolean(
    address.city && branchesWithAreas.length > 0 &&
    !branchesWithAreas.some(b => b.serviceCities!.some(c => c.toLowerCase() === address.city.toLowerCase()))
  )

  const canSubmit = customerName.trim() && contactPhone.trim() && customerEmail.trim() && address.street.trim()
    && address.city.trim() && serviceType && requestedDate.trim() && preferredTimeSlot
    && issueDescription.trim() && !submitting

  const resetForm = () => {
    setSubmitted(false)
    setCustomerName(''); setContactPhone(''); setCustomerEmail(''); setAddress(emptyAddress)
    setServiceType(''); setAirconType(''); setUnitQuantity(1)
    setBrand(''); setCapacity(''); setRequestedDate(''); setPreferredTimeSlot('')
    setIssueDescription('')
    setPhotos([])
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setPhotos(prev => [...prev, ...files].slice(0, 2))
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/public/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          contactPhone: contactPhone.trim(),
          customerEmail: customerEmail.trim(),
          region: address.region,
          city: address.city,
          barangay: address.barangay,
          street: address.street,
          landmark: address.landmark,
          serviceType,
          airconType,
          unitQuantity,
          brand: brand.trim(),
          capacity: capacity.trim(),
          requestedDate,
          preferredTimeSlot,
          issueDescription: issueDescription.trim(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || 'Could not submit your booking. Please try again.')
      }

      const bookingId = data?.data?.id
      if (bookingId && photos.length > 0) {
        for (const photo of photos) {
          try {
            const formData = new FormData()
            formData.append('file', photo)
            await fetch(`${API_BASE_URL}/public/bookings/${bookingId}/photos`, { method: 'POST', body: formData })
          } catch {
            // Best-effort — a failed photo upload should not block the booking confirmation
          }
        }
      }

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your booking. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen font-['Inter',sans-serif] transition-colors duration-300" style={{ backgroundColor: t.bg, color: t.text }}>
      {/* Header */}
      <div className="border-b transition-colors duration-300" style={{ borderColor: t.border, backgroundColor: t.bgNav, backdropFilter: 'blur(20px)' }}>
        <div className="max-w-2xl mx-auto px-4 md:px-0 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 w-fit">
            <img src={logoImg} alt="ASHCOL Logo" className="w-9 h-9 object-contain rounded-lg" />
            <div>
              <div className="text-[16px] font-extrabold tracking-wide leading-none" style={{ color: t.text }}>ASHCOL</div>
              <div className="text-[9px] font-semibold leading-none mt-0.5" style={{ color: t.textFaint }}>Airconditioning Corp.</div>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setIsDark(!isDark)}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all border shrink-0"
            style={{ backgroundColor: t.accentBg, color: t.accent, borderColor: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.24)' }}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-0 py-10 md:py-14">
        {submitted ? (
          <div
            className="rounded-2xl border p-8 md:p-12 flex flex-col items-center text-center gap-4 animate-in fade-in duration-300"
            style={{ backgroundColor: t.bgCard, borderColor: t.border }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: t.accentBg }}>
              <CheckCircle2 className="w-9 h-9" style={{ color: t.accent }} />
            </div>
            <h1 className="text-2xl font-black" style={{ color: t.text }}>Booking request sent!</h1>
            <p className="text-sm leading-relaxed max-w-md" style={{ color: t.textMuted }}>
              Thanks, {customerName.split(' ')[0] || 'there'}. Our team will review your request and contact you at{' '}
              <span style={{ color: t.text }}>{contactPhone}</span> to confirm your visit.
              {customerEmail.trim() ? <> We've also sent a confirmation to <span style={{ color: t.text }}>{customerEmail.trim()}</span>.</> : null}
            </p>
            <button
              type="button"
              onClick={resetForm}
              className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
              style={{ backgroundColor: t.accent, color: '#060B18' }}
            >
              Submit another booking
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center md:text-left">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2" style={{ color: t.text }}>Book a Service Visit</h1>
              <p className="text-sm md:text-base" style={{ color: t.textMuted }}>
                Tell us about your aircon and when you'd like a technician to visit. No account needed.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border p-5 md:p-7 flex flex-col gap-5 shadow-sm transition-colors duration-300"
              style={{ backgroundColor: t.bgCard, borderColor: t.border }}
            >
              {/* Customer details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>
                    <User className="w-3 h-3 inline mr-1 -mt-0.5" /> Customer Name
                  </label>
                  <input
                    type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
                    placeholder="Juan Dela Cruz" required
                    className={inputCls} style={inputSty}
                  />
                </div>
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>
                    <Phone className="w-3 h-3 inline mr-1 -mt-0.5" /> Contact Number
                  </label>
                  <input
                    type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                    placeholder="0917 123 4567" required
                    className={inputCls} style={inputSty}
                  />
                </div>
              </div>

              {/* Email — required, used to send the booking confirmation */}
              <div>
                <label className={labelCls} style={{ color: t.textMuted }}>
                  <Mail className="w-3 h-3 inline mr-1 -mt-0.5" /> Email
                </label>
                <input
                  type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                  placeholder="juan@email.com" required
                  className={inputCls} style={inputSty}
                />
              </div>

              {/* Address */}
              <div>
                <label className={labelCls} style={{ color: t.textMuted }}>Service Address</label>
                <PhAddressPicker
                  value={address}
                  onChange={setAddress}
                  inputBg={t.inputBg}
                  inputBorder={t.border}
                  inputText={t.text}
                  textMuted={t.textMuted}
                  hideLocationButton
                />
                {outOfServiceArea && (
                  <div className="flex items-start gap-2 mt-3 px-3.5 py-3 rounded-xl" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#F59E0B' }} />
                    <p className="text-[12.5px] leading-relaxed" style={{ color: '#F59E0B' }}>
                      {address.city} may be outside our current service zones. You can still submit — our team will
                      confirm coverage and reach out, or point you to the nearest branch.
                    </p>
                  </div>
                )}
              </div>

              {/* Service type */}
              <div>
                <label className={labelCls} style={{ color: t.textMuted }}>Service Type</label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_TYPES.map(st => (
                    <button
                      key={st} type="button" onClick={() => setServiceType(st)}
                      className="px-3.5 py-2 rounded-full text-[12.5px] font-semibold border transition-all"
                      style={serviceType === st
                        ? { backgroundColor: t.accent, borderColor: t.accent, color: '#060B18' }
                        : { backgroundColor: t.inputBg, borderColor: t.border, color: t.textMuted }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                {serviceType && SERVICE_TYPE_DETAILS[serviceType] && (
                  <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: t.textFaint }}>{SERVICE_TYPE_DETAILS[serviceType]}</p>
                )}
              </div>

              {/* Aircon type & quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>
                    <Wind className="w-3 h-3 inline mr-1 -mt-0.5" /> Aircon Type
                  </label>
                  <select
                    value={airconType} onChange={e => setAirconType(e.target.value)}
                    className={inputCls} style={inputSty}
                  >
                    <option value="">Select type</option>
                    {AIRCON_TYPES.map(at => <option key={at} value={at}>{at}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>Number of Units</label>
                  <div className="flex items-center gap-3 border rounded-xl px-3.5 py-2" style={inputSty}>
                    <button
                      type="button" onClick={() => setUnitQuantity(q => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all hover:opacity-80"
                      style={{ backgroundColor: t.accentBg, color: t.accent }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="flex-1 text-center text-sm font-bold">{unitQuantity}{unitQuantity >= 3 ? '+' : ''}</span>
                    <button
                      type="button" onClick={() => setUnitQuantity(q => Math.min(9, q + 1))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all hover:opacity-80"
                      style={{ backgroundColor: t.accentBg, color: t.accent }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Brand / capacity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>Aircon Brand</label>
                  <input
                    type="text" value={brand} onChange={e => setBrand(e.target.value)}
                    placeholder="e.g. Carrier, Midea, LG"
                    className={inputCls} style={inputSty}
                  />
                </div>
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>HP / Capacity</label>
                  <input
                    type="text" value={capacity} onChange={e => setCapacity(e.target.value)}
                    placeholder="e.g. 1.5 HP"
                    className={inputCls} style={inputSty}
                  />
                </div>
              </div>

              {/* Requested date + time slot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>
                    <Calendar className="w-3 h-3 inline mr-1 -mt-0.5" /> Requested Date of Visit
                  </label>
                  <CalendarPicker
                    value={requestedDate}
                    onChange={setRequestedDate}
                    min={todayKey}
                    isLight={!isDark}
                    centered
                  />
                </div>
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>
                    <Clock className="w-3 h-3 inline mr-1 -mt-0.5" /> Preferred Time
                  </label>
                  <div className="flex flex-col gap-2">
                    {TIME_SLOTS.map(slot => (
                      <button
                        key={slot.value} type="button" onClick={() => setPreferredTimeSlot(slot.value)}
                        className="px-3.5 py-2.5 rounded-xl border text-left transition-all"
                        style={preferredTimeSlot === slot.value
                          ? { backgroundColor: t.accentBg, borderColor: t.accent }
                          : { backgroundColor: t.inputBg, borderColor: t.border }}
                      >
                        <span className="text-[13px] font-semibold" style={{ color: preferredTimeSlot === slot.value ? t.accent : t.text }}>{slot.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Issue */}
              <div>
                <label className={labelCls} style={{ color: t.textMuted }}>
                  <MessageSquare className="w-3 h-3 inline mr-1 -mt-0.5" /> Aircon Issue / Request
                </label>
                <textarea
                  value={issueDescription} onChange={e => setIssueDescription(e.target.value)}
                  placeholder="e.g. Not cooling, needs general cleaning, water leaking..."
                  rows={4} required
                  className={`${inputCls} resize-none`} style={inputSty}
                />
              </div>

              {/* Photo attachment */}
              <div>
                <label className={labelCls} style={{ color: t.textMuted }}>
                  <Camera className="w-3 h-3 inline mr-1 -mt-0.5" /> Photo of Unit / Error Code (optional, up to 2)
                </label>
                <div className="flex flex-wrap gap-3">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border" style={{ borderColor: t.border }}>
                      <img src={URL.createObjectURL(photo)} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button" onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center bg-black/60 text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {photos.length < 2 && (
                    <label
                      className="w-20 h-20 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all hover:border-[#10B981]"
                      style={{ borderColor: t.border, color: t.textFaint }}
                    >
                      <Camera className="w-5 h-5" />
                      <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-xl px-3.5 py-2.5 text-[13px]" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: t.accent, color: '#060B18' }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? 'Submitting…' : 'Request Service Visit'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
