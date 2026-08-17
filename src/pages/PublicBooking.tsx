import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2, Wind, Phone, User, Calendar, MessageSquare, Sun, Moon } from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import PhAddressPicker, { type AddressValue } from '../components/PhAddressPicker'
import CalendarPicker from '../components/CalendarPicker'
import { API_BASE_URL } from '../utils/api'

const inputCls = 'w-full border rounded-xl px-3.5 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]'
const labelCls = 'text-[11px] font-bold uppercase tracking-wider mb-1.5 block'

const emptyAddress: AddressValue = { region: '', city: '', barangay: '', street: '', landmark: '' }

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
  const [address, setAddress] = useState<AddressValue>(emptyAddress)
  const [brand, setBrand] = useState('')
  const [capacity, setCapacity] = useState('')
  const [requestedDate, setRequestedDate] = useState('')
  const [issueDescription, setIssueDescription] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const todayKey = new Date().toISOString().split('T')[0]

  const canSubmit = customerName.trim() && contactPhone.trim() && address.street.trim()
    && address.city.trim() && requestedDate.trim() && issueDescription.trim() && !submitting

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
          region: address.region,
          city: address.city,
          barangay: address.barangay,
          street: address.street,
          landmark: address.landmark,
          brand: brand.trim(),
          capacity: capacity.trim(),
          requestedDate,
          issueDescription: issueDescription.trim(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || 'Could not submit your booking. Please try again.')
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
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false)
                setCustomerName(''); setContactPhone(''); setAddress(emptyAddress)
                setBrand(''); setCapacity(''); setRequestedDate(''); setIssueDescription('')
              }}
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
              </div>

              {/* Unit details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={{ color: t.textMuted }}>
                    <Wind className="w-3 h-3 inline mr-1 -mt-0.5" /> Aircon Brand
                  </label>
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

              {/* Requested date — custom calendar popup, centered and safe-area-aware on mobile */}
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
