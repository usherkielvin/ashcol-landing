/**
 * CreateTicket – full dashboard page (no overlay/popup)
 * Mirrors the native app's create-ticket screen, adapted for the web portal.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Plus, Minus, Camera,
  Search, Check, DollarSign, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, resolveScopedBranchId } from '../utils/api'
import { ROBINSON_APPLIANCES_RE } from '../utils/dealer'
import CalendarPicker from '../components/CalendarPicker'
import PhAddressPicker, { type AddressValue } from '../components/PhAddressPicker'
import { parseStoreVendor } from '../utils/parseStoreVendor'

// ─── Types ───────────────────────────────────────────────────────────────────
interface UnitDetail {
  brand?: string; hp?: string; technology?: string; subtype?: string
  feature?: string; issueType?: string; refrigerant?: string
  voltage?: string; ageRange?: string; expandedMore?: boolean
}
interface UnitType { name: string; selected: boolean; quantity: number; details: UnitDetail[] }

// ─── Constants (mirrored from native app) ────────────────────────────────────
const SERVICE_TYPES = ['Cleaning', 'Maintenance', 'Repair', 'Installation']
const SERVICE_PRICES: Record<string, number> = { Cleaning: 850, Maintenance: 1200, Repair: 1500, Installation: 1800 }
const HP_MOD: Record<string, number> = { '0.5 HP': 0, '0.75 HP': 50, '1.0 HP': 120, '1.5 HP': 220, '2.0 HP': 350, '2.5 HP': 500, '3.0 HP': 680, '4.0 HP': 900, '5.0 HP': 1200 }
const TECH_MOD: Record<string, number> = { 'Non-inverter': 0, Inverter: 180, 'Dual Inverter': 260, 'VRF Inverter': 420 }
const SUBTYPE_MOD: Record<string, number> = { Standard: 0, Compact: 40, 'U-shape': 80, 'Wall-mounted': 0, 'Floor-mounted': 140, Cassette: 260, 'Ceiling cassette': 320, Ducted: 460, 'Floor standing': 220 }
const FEATURE_MOD: Record<string, number> = {
  'No special feature': 0, 'Wi-Fi control': 120, 'Eco mode': 80, 'Turbo cool': 100, 'Remote control': 70, Timer: 60,
  'Energy saver': 90, 'Multi-zone': 300, 'Smart zoning': 260, 'Fresh-air kit': 220, 'Basic install': 0,
  'Piping extension': 350, 'Bracket install': 150, 'Electrical setup': 280, 'Window frame support': 160,
  Sealing: 90, 'Drain setup': 140, 'General cleaning': 0, 'Chemical wash': 280, 'Filter cleaning': 120,
  'Gas check': 200, 'Drain cleaning': 140, 'Performance check': 160, 'Multi-zone cleaning': 360,
  'Coil cleaning': 220, 'Drain check': 130, 'System diagnostics': 280, 'Compressor issue': 480,
  'PCB issue': 520, 'Fan motor issue': 300, 'Leak repair': 260, 'Capacitor issue': 220, 'Fan issue': 240,
  'Outdoor unit issue': 520, 'Controller issue': 460, 'Zone fault': 380, Relocation: 450,
  'Replacement unit': 380, Reinstallation: 300,
}
const ISSUE_MOD: Record<string, Record<string, number>> = {
  Cleaning: { 'Standard cleaning': 0, 'Chemical cleaning': 260, 'Deep cleaning': 340, 'Filter cleaning': 120 },
  Maintenance: { 'Preventive maintenance': 0, 'Filter replacement': 180, 'Gas level check': 220, 'Drain line check': 140 },
  Repair: { 'Not cooling': 280, 'Leaking water': 180, Noisy: 160, 'Power issue': 320, Maintenance: 120 },
  Installation: { 'New installation': 0, Relocation: 420, 'Replacement unit': 300, Reinstallation: 240 },
}
const BRANDS = ['Carrier', 'Daikin', 'Panasonic', 'LG', 'Samsung', 'Mitsubishi', 'Condura', 'Koppel', 'Kolin', 'TCL', 'Midea', 'Hitachi', 'Sharp', 'Fujidenzo', 'Haier']
const ISSUE_OPTIONS: Record<string, string[]> = {
  Cleaning: ['Standard cleaning', 'Chemical cleaning', 'Deep cleaning', 'Filter cleaning'],
  Maintenance: ['Preventive maintenance', 'Filter replacement', 'Gas level check', 'Drain line check'],
  Repair: ['Not cooling', 'Leaking water', 'Noisy', 'Power issue', 'Maintenance'],
  Installation: ['New installation', 'Relocation', 'Replacement unit', 'Reinstallation'],
}
const MORE_CFG: Record<string, { refrigerantOptions: string[]; voltageOptions: string[]; ageOptions: string[] }> = {
  'Split AC': { refrigerantOptions: ['R32', 'R410A', 'R22', 'Unknown'], voltageOptions: ['220V', '230V', '240V', 'Unknown'], ageOptions: ['<1 year', '1-3 years', '4-6 years', '7+ years', 'Unknown'] },
  'Window AC': { refrigerantOptions: ['R32', 'R410A', 'R22', 'Unknown'], voltageOptions: ['110V', '220V', 'Unknown'], ageOptions: ['<1 year', '1-3 years', '4-6 years', '7+ years', 'Unknown'] },
  ARF: { refrigerantOptions: ['R410A', 'R32', 'Unknown'], voltageOptions: ['220V', '380V 3-phase', 'Unknown'], ageOptions: ['<1 year', '1-3 years', '4-6 years', '7+ years', 'Unknown'] },
}
const UNIT_CFG: Record<string, { hpOptions: string[]; technologyOptions: string[]; subtypeOptions: string[]; featureOptions: string[] }> = {
  'Split AC': { hpOptions: ['0.75 HP', '1.0 HP', '1.5 HP', '2.0 HP', '2.5 HP', '3.0 HP'], technologyOptions: ['Dual Inverter', 'Inverter', 'Non-inverter'], subtypeOptions: ['Wall-mounted', 'Floor-mounted', 'Cassette'], featureOptions: ['Wi-Fi control', 'Eco mode', 'Turbo cool', 'No special feature'] },
  'Window AC': { hpOptions: ['0.5 HP', '0.75 HP', '1.0 HP', '1.5 HP', '2.0 HP'], technologyOptions: ['Inverter', 'Non-inverter'], subtypeOptions: ['Standard', 'Compact', 'U-shape'], featureOptions: ['Remote control', 'Timer', 'Energy saver', 'No special feature'] },
  ARF: { hpOptions: ['2.0 HP', '2.5 HP', '3.0 HP', '4.0 HP', '5.0 HP'], technologyOptions: ['VRF Inverter', 'Inverter'], subtypeOptions: ['Ceiling cassette', 'Ducted', 'Floor standing'], featureOptions: ['Multi-zone', 'Smart zoning', 'Fresh-air kit', 'No special feature'] },
}
const SVC_OVERRIDES: Record<string, Partial<Record<string, any>>> = {
  Installation: {
    'Split AC': { hpOptions: ['1.0 HP', '1.5 HP', '2.0 HP', '2.5 HP', '3.0 HP'], technologyOptions: ['Dual Inverter', 'Inverter', 'Non-inverter'], subtypeOptions: ['Wall-mounted', 'Cassette', 'Floor-mounted'], featureOptions: ['Basic install', 'Piping extension', 'Bracket install', 'Electrical setup'] },
    'Window AC': { hpOptions: ['0.75 HP', '1.0 HP', '1.5 HP', '2.0 HP'], technologyOptions: ['Inverter', 'Non-inverter'], subtypeOptions: ['Standard', 'Compact'], featureOptions: ['Window frame support', 'Sealing', 'Electrical setup', 'Drain setup'] },
    ARF: { hpOptions: ['2.5 HP', '3.0 HP', '4.0 HP', '5.0 HP'], technologyOptions: ['VRF Inverter', 'Inverter'], subtypeOptions: ['Ceiling cassette', 'Ducted', 'Floor standing'], featureOptions: ['Multi-zone install', 'Ducting setup', 'Control wiring', 'Commissioning'] },
  },
  Maintenance: {
    'Split AC': { ...UNIT_CFG['Split AC'], featureOptions: ['General cleaning', 'Chemical wash', 'Filter cleaning', 'Gas check'] },
    'Window AC': { ...UNIT_CFG['Window AC'], featureOptions: ['General cleaning', 'Filter cleaning', 'Drain cleaning', 'Performance check'] },
    ARF: { ...UNIT_CFG.ARF, featureOptions: ['Multi-zone cleaning', 'Coil cleaning', 'Drain check', 'System diagnostics'] },
  },
  Repair: {
    'Split AC': { ...UNIT_CFG['Split AC'], featureOptions: ['Compressor issue', 'PCB issue', 'Fan motor issue', 'Leak repair'] },
    'Window AC': { ...UNIT_CFG['Window AC'], featureOptions: ['Compressor issue', 'Capacitor issue', 'Fan issue', 'Leak repair'] },
    ARF: { ...UNIT_CFG.ARF, featureOptions: ['Outdoor unit issue', 'Controller issue', 'Leak repair', 'Zone fault'] },
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ChipGroup({ options, value, onChange, isLight }: { options: string[]; value: string; onChange: (v: string) => void; isLight: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = value === opt
        return (
          <button key={opt} type="button" onClick={() => onChange(active ? '' : opt)}
            className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full border text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${active
              ? 'bg-[#10B981] border-[#10B981] text-white shadow-sm shadow-[#10B981]/30'
              : isLight ? 'bg-white border-slate-200 text-slate-600 hover:border-[#10B981]/60 hover:text-[#10B981]'
                : 'bg-[#121720] border-[#2C3440] text-[#A8B1BD] hover:border-[#10B981]/60 hover:text-[#10B981]'}`}
          >
            {active && <Check className="w-3 h-3 shrink-0" />}
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function BrandPicker({ value, onChange, isLight }: { value: string; onChange: (v: string) => void; isLight: boolean }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = useMemo(() => !search.trim() ? BRANDS : BRANDS.filter(b => b.toLowerCase().includes(search.toLowerCase())), [search])

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-sm transition-all ${isLight ? 'bg-white border-slate-200 hover:border-[#10B981]/60 text-slate-700' : 'bg-[#121720] border-[#2C3440] hover:border-[#10B981]/60 text-white'}`}
      >
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#10B981] flex items-center justify-center text-[10px] font-black text-[#1C232D] shrink-0">
            {value ? value.slice(0, 2).toUpperCase() : 'AC'}
          </span>
          <span className={value ? '' : (isLight ? 'text-slate-400' : 'text-[#7D8794]')}>{value || 'Select brand'}</span>
        </div>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''} text-slate-400`} />
      </button>
      {open && (
        <div className={`absolute z-50 left-0 right-0 top-full mt-1.5 rounded-xl border shadow-2xl overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-[#191D23] border-[#2C3440]'}`}>
          <div className={`p-2 border-b ${isLight ? 'border-slate-100' : 'border-[#2C3440]'}`}>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brand..."
                className={`w-full pl-7 pr-3 py-2 text-sm rounded-lg border outline-none ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#0F131A] border-[#2C3440] text-white'}`}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto py-1.5 px-2 flex flex-col gap-0.5">
            {filtered.map(brand => (
              <button key={brand} type="button" onClick={() => { onChange(brand); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold text-left transition-all ${value === brand
                  ? isLight ? 'bg-emerald-50 text-[#10B981]' : 'bg-[#1F2A38] text-[#10B981]'
                  : isLight ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-[#1F2A38] text-[#C8D0DB]'}`}
              >
                <span className="w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center text-[9px] font-black text-[#1C232D] shrink-0">{brand.slice(0, 2).toUpperCase()}</span>
                <span className="flex-1">{brand}</span>
                {value === brand && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CreateTicket() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isLight = theme === 'light'
  const isStaffOrAdmin = ['admin', 'manager', 'staff'].includes((user?.role || '').toLowerCase())

  // Colour tokens
  const pageBg      = isLight ? '#f1f5f9' : '#060B18'
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#141C2E'
  const inputBg     = isLight ? '#ffffff' : '#121720'
  const inputBorder = isLight ? '#DDD'    : '#2C3440'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const surfaceBg   = isLight ? '#f8fafc' : '#0F1A2E'



  const inputSty = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }

  // ─ State ─
  const [selectedService, setSelectedService] = useState('Cleaning')
  const [fullName, setFullName] = useState(user?.name || '')
  const [contactPhone, setContactPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState<AddressValue>({
    region: user?.region || '',
    city: user?.city || '',
    barangay: user?.barangay || '',
    street: user?.street || user?.address || '',
    landmark: user?.landmark || '',
  })
  const [description, setDescription] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedDealer, setSelectedDealer] = useState('Direct')
  const [dealerBranch, setDealerBranch] = useState('')
  const [controlNumber, setControlNumber] = useState('')
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([])
  const [images, setImages] = useState<{ file: File; url: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fetchDealers = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/dealers`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const list = await res.json()
          setDealers(list)
        }
      } catch (err) {
        console.error('Error fetching dealers in CreateTicket:', err)
      }
    }
    fetchDealers()
    window.addEventListener('ashcol-dealers-updated', fetchDealers)
    return () => window.removeEventListener('ashcol-dealers-updated', fetchDealers)
  }, [])

  const location = useLocation()
  const scannedData = location.state?.scannedData

  useEffect(() => {
    if (scannedData) {
      if (scannedData.customerName) setFullName(scannedData.customerName)
      if (scannedData.contactPhone) setContactPhone(scannedData.contactPhone)
      if (scannedData.description) setDescription(scannedData.description)
      
      // Parse service type if valid
      if (scannedData.serviceType) {
        const mappedService = SERVICE_TYPES.find(
          s => s.toLowerCase() === scannedData.serviceType.toLowerCase()
        )
        if (mappedService) {
          setSelectedService(mappedService)
        }
      }
      
      // Format preferredDate (YYYY-MM-DD)
      if (scannedData.preferredDate) {
        try {
          const d = new Date(scannedData.preferredDate)
          if (!isNaN(d.getTime())) {
            setSelectedDate(d.toISOString().split('T')[0])
          }
        } catch (e) {}
      }
      
      // Set dealer if valid
      if (scannedData.dealer || scannedData.sourceVendor) {
        const parsed = parseStoreVendor(scannedData.dealer || scannedData.sourceVendor)
        if (parsed.store === 'Direct') {
          setSelectedDealer('Direct')
          setDealerBranch('')
        } else if (parsed.store === 'Other') {
          setSelectedDealer(parsed.customStore || 'Direct')
          setDealerBranch(parsed.branch)
        } else {
          setSelectedDealer(parsed.store)
          setDealerBranch(parsed.branch)
        }
      }
      
      // Parse address details
      if (scannedData.location) {
        const addrStr = scannedData.location
        setAddress(prev => ({
          ...prev,
          street: addrStr,
          landmark: scannedData.landmarks || ''
        }))
      }

      // Pre-fill unitType details if brand/capacity are detected
      const brandVal = scannedData.brand || ''
      const capacityVal = scannedData.capacity || ''
      if (brandVal || capacityVal) {
        let matchedHp = ''
        if (capacityVal) {
          const cleanedCap = capacityVal.toUpperCase().replace(/\s/g, '')
          matchedHp = Object.keys(HP_MOD).find(
            hp => hp.toUpperCase().replace(/\s/g, '') === cleanedCap || cleanedCap.includes(hp.toUpperCase().replace(/\s/g, ''))
          ) || ''
        }

        setUnitTypes(prev => prev.map(u => {
          if (u.name === 'Split AC') {
            return {
              ...u,
              selected: true,
              details: [{
                brand: brandVal,
                hp: matchedHp,
                technology: '',
                subtype: '',
                feature: '',
                issueType: '',
                refrigerant: '',
                voltage: '',
                ageRange: '',
                expandedMore: false
              }]
            }
          }
          return u
        }))
      }
    }
  }, [scannedData])


  const emptyDetail = (): UnitDetail => ({ brand: '', hp: '', technology: '', subtype: '', feature: '', issueType: '', refrigerant: '', voltage: '', ageRange: '', expandedMore: false })
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([
    { name: 'Split AC',  selected: false, quantity: 1, details: [emptyDetail()] },
    { name: 'Window AC', selected: false, quantity: 1, details: [emptyDetail()] },
    { name: 'ARF',       selected: false, quantity: 1, details: [emptyDetail()] },
  ])

  useEffect(() => {
    setUnitTypes(prev => prev.map(u => ({ ...u, details: u.details.map(d => ({ ...d, hp: '', technology: '', subtype: '', feature: '', issueType: '' })) })))
  }, [selectedService])

  const price = (): number => {
    const base = SERVICE_PRICES[selectedService] || 0
    const sel = unitTypes.filter(u => u.selected)
    if (!sel.length) return base
    const iMap = ISSUE_MOD[selectedService] ?? {}
    return sel.reduce((s, u) => s + u.details.reduce((ds, d) => ds + (base
      + (d.hp ? HP_MOD[d.hp] ?? 0 : 0)
      + (d.technology ? TECH_MOD[d.technology] ?? 0 : 0)
      + (d.subtype ? SUBTYPE_MOD[d.subtype] ?? 0 : 0)
      + (d.feature ? FEATURE_MOD[d.feature] ?? 0 : 0)
      + (d.issueType ? iMap[d.issueType] ?? 0 : 0)), 0), 0)
  }

  const toggleUnit  = (i: number) => setUnitTypes(p => { const n = [...p]; n[i] = { ...n[i], selected: !n[i].selected }; return n })
  const updateQty   = (i: number, delta: number) => setUnitTypes(p => {
    const n = [...p]; const c = n[i]; const q = c.quantity + delta
    if (q < 1 || q > 10) return p
    let ds = [...c.details]
    if (q > ds.length) { for (let j = ds.length; j < q; j++) ds.push(emptyDetail()) } else ds = ds.slice(0, q)
    n[i] = { ...c, quantity: q, details: ds }; return n
  })
  const updateDetail = (ui: number, di: number, field: keyof UnitDetail, val: any) => setUnitTypes(p => {
    const n = [...p]; n[ui] = { ...n[ui], details: n[ui].details.map((d, i) => i === di ? { ...d, [field]: val } : d) }; return n
  })

  const addImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 2 - images.length)
    setImages(prev => [...prev, ...files.map(f => ({ file: f, url: URL.createObjectURL(f) }))])
    if (fileRef.current) fileRef.current.value = ''
  }
  const removeImg = (i: number) => setImages(prev => { URL.revokeObjectURL(prev[i].url); return prev.filter((_, j) => j !== i) })

  const issueLabel = (svc: string) => svc === 'Installation' ? 'Install Request' : svc === 'Maintenance' ? 'Maintenance Scope' : 'Issue Type'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const sel = unitTypes.filter(u => u.selected)
    if (!sel.length) { alert('Please select at least one AC Unit Type'); return }
    setIsSubmitting(true)
    try {
      const unitNames = sel.map(u => `${u.name} x${u.quantity}`).join(', ')

      const fullDesc = description.trim() || 'No additional details provided.'
      const fullLoc = [address.region, address.city, address.barangay, address.street]
        .filter(Boolean).join(', ') + (address.landmark ? ` (${address.landmark})` : '')
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const branchId = resolveScopedBranchId(
        localStorage.getItem('ashcol-global-branch-id') || user?.branchId
      ) || undefined

      const res = await fetch(`${API_BASE_URL}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerName: fullName.trim().toUpperCase(),
          title: `${selectedService} service`.toUpperCase(),
          description: fullDesc.toUpperCase(),
          serviceType: selectedService.toUpperCase(),
          unitType: unitNames.toUpperCase(),
          acDetails: JSON.stringify(sel.map(u => ({ unitType: u.name.toUpperCase(), quantity: u.quantity, details: u.details }))),
          contactPhone: contactPhone.trim(),
          preferredDate: selectedDate || undefined,
          location: fullLoc.trim().toUpperCase(),
          dealer: selectedDealer === 'Direct'
            ? 'DIRECT'
            : ROBINSON_APPLIANCES_RE.test(selectedDealer)
            ? (dealerBranch.trim() ? `RA ${dealerBranch.trim().toUpperCase()}` : 'RA')
            : (dealerBranch.trim() ? `${selectedDealer.toUpperCase()} - ${dealerBranch.trim().toUpperCase()}` : selectedDealer.toUpperCase()),
          controlNumber: ROBINSON_APPLIANCES_RE.test(selectedDealer) ? controlNumber.trim().toUpperCase() : undefined,
          branchId,
        })
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `Failed (HTTP ${res.status})`)
      }
      navigate('/tickets')
    } catch (err) {
      console.error(err)
      alert('Could not submit ticket. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Helper renderers
  const SectionTitle = ({ title, step }: { title: string; step: number }) => (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-7 h-7 rounded-full bg-[#10B981] flex items-center justify-center text-xs font-black text-white shrink-0">{step}</div>
      <h3 style={{ color: textPrimary }} className="text-base font-bold tracking-tight">{title}</h3>
    </div>
  )

  const FL = ({ label }: { label: string }) => (
    <span className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: textMuted }}>{label}</span>
  )

  return (
    <div className="flex flex-col -m-5 md:-m-8 min-h-[calc(100vh-4rem)]" style={{ backgroundColor: pageBg }}>

      {/* ── Top bar ── */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="sticky top-0 z-20 border-b px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => navigate('/tickets')}
            style={{ borderColor: inputBorder, color: textMuted }}
            className="p-2 rounded-xl border hover:border-[#10B981] hover:text-[#10B981] transition-all shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 style={{ color: textPrimary }} className="text-sm sm:text-lg font-black tracking-tight leading-tight">New Service Request</h2>
            <p style={{ color: textMuted }} className="text-[10px] hidden sm:block mt-0.5">Fill in all required fields to submit</p>
          </div>
        </div>
        <div style={{ backgroundColor: isLight ? '#f0fdf4' : '#0d1e30', borderColor: '#10B981' }} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border shrink-0">
          <DollarSign className="w-3.5 h-3.5 text-[#10B981]" />
          <span className="text-sm font-black text-[#10B981]">₱{price().toLocaleString()}</span>
        </div>
      </div>

      {/* ── Body ── */}
      <form onSubmit={handleSubmit} className="flex flex-col xl:flex-row gap-5 p-4 sm:p-6 xl:p-8 flex-1">

        {/* ══ LEFT: Service config ══ */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* 1 · Service Type */}
          <div style={{ backgroundColor: cardBg, borderColor: border }} className="rounded-2xl border p-4 sm:p-5">
            <SectionTitle title="Service Type" step={1} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {SERVICE_TYPES.map(svc => (
                <button key={svc} type="button" onClick={() => setSelectedService(svc)}
                  className={`py-3 rounded-xl border text-sm font-bold transition-all ${selectedService === svc
                    ? 'bg-[#10B981] border-[#10B981] text-white shadow-md shadow-[#10B981]/20'
                    : isLight ? 'bg-white border-slate-200 text-slate-600 hover:border-[#10B981]/50 hover:text-[#10B981]'
                      : 'bg-[#121720] border-[#2C3440] text-[#A8B1BD] hover:border-[#10B981]/50 hover:text-[#10B981]'}`}
                >
                  {svc}
                </button>
              ))}
            </div>
          </div>

          {/* 2 · AC Units */}
          <div style={{ backgroundColor: cardBg, borderColor: border }} className="rounded-2xl border p-4 sm:p-5">
            <SectionTitle title="AC Unit Type(s)" step={2} />
            <div className="flex flex-col gap-3">
              {unitTypes.map((unit, uIdx) => {
                const cfg = SVC_OVERRIDES[selectedService]?.[unit.name] ?? UNIT_CFG[unit.name]
                const issues = ISSUE_OPTIONS[selectedService] ?? ISSUE_OPTIONS.Repair
                const moreCfg = MORE_CFG[unit.name] ?? { refrigerantOptions: [], voltageOptions: [], ageOptions: [] }

                return (
                  <div key={unit.name}
                    style={{ borderColor: unit.selected ? '#10B981' : inputBorder, backgroundColor: unit.selected ? (isLight ? '#f0fdf4' : '#0d1e30') : 'transparent' }}
                    className="rounded-xl border transition-all"
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <div onClick={() => toggleUnit(uIdx)}
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer shrink-0 transition-all ${unit.selected ? 'bg-[#10B981] border-[#10B981]' : isLight ? 'bg-white border-slate-300' : 'bg-[#121720] border-[#2C3440]'}`}
                        >
                          {unit.selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span style={{ color: textPrimary }} className="font-semibold">{unit.name}</span>
                      </label>
                      {unit.selected && (
                        <div style={{ backgroundColor: isLight ? 'white' : '#0A1120', borderColor: inputBorder }} className="flex items-center rounded-lg border overflow-hidden">
                          <button type="button" onClick={() => updateQty(uIdx, -1)} className="px-3 py-1.5 text-[#10B981] hover:bg-[#10B981]/10 transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                          <span style={{ color: textPrimary }} className="w-8 text-center text-sm font-bold">{unit.quantity}</span>
                          <button type="button" onClick={() => updateQty(uIdx, 1)} className="px-3 py-1.5 text-[#10B981] hover:bg-[#10B981]/10 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>

                    {/* Detail cards */}
                    {unit.selected && (
                      <div className="px-4 pb-4 flex flex-col gap-4">
                        {unit.details.map((detail, dIdx) => (
                          <div key={dIdx} style={{ backgroundColor: isLight ? 'white' : '#070d18', borderColor: inputBorder }} className="rounded-xl border p-4 flex flex-col gap-5">
                            {unit.quantity > 1 && <p className="text-xs font-bold text-[#10B981] uppercase tracking-wider">{unit.name} #{dIdx + 1}</p>}

                            <div><FL label="Brand" /><BrandPicker value={detail.brand || ''} onChange={v => updateDetail(uIdx, dIdx, 'brand', v)} isLight={isLight} /></div>
                            <div><FL label="Horsepower" /><ChipGroup options={cfg.hpOptions} value={detail.hp || ''} onChange={v => updateDetail(uIdx, dIdx, 'hp', v)} isLight={isLight} /></div>
                            <div><FL label="Technology" /><ChipGroup options={cfg.technologyOptions} value={detail.technology || ''} onChange={v => updateDetail(uIdx, dIdx, 'technology', v)} isLight={isLight} /></div>
                            <div><FL label="Unit Subtype" /><ChipGroup options={cfg.subtypeOptions} value={detail.subtype || ''} onChange={v => updateDetail(uIdx, dIdx, 'subtype', v)} isLight={isLight} /></div>
                            <div><FL label="Special Option / Feature" /><ChipGroup options={cfg.featureOptions} value={detail.feature || ''} onChange={v => updateDetail(uIdx, dIdx, 'feature', v)} isLight={isLight} /></div>
                            <div><FL label={issueLabel(selectedService)} /><ChipGroup options={issues} value={detail.issueType || ''} onChange={v => updateDetail(uIdx, dIdx, 'issueType', v)} isLight={isLight} /></div>

                            <button type="button" onClick={() => updateDetail(uIdx, dIdx, 'expandedMore', !detail.expandedMore)}
                              style={{ borderColor: inputBorder, backgroundColor: surfaceBg }}
                              className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border text-sm font-semibold hover:border-[#10B981]/50 transition-all"
                            >
                              <span style={{ color: textPrimary }}>{detail.expandedMore ? 'Hide more details' : 'Show more details'}</span>
                              {detail.expandedMore ? <ChevronUp className="w-4 h-4" style={{ color: textMuted }} /> : <ChevronDown className="w-4 h-4" style={{ color: textMuted }} />}
                            </button>

                            {detail.expandedMore && (
                              <div className="flex flex-col gap-5 pt-1">
                                <div><FL label="Refrigerant" /><ChipGroup options={moreCfg.refrigerantOptions} value={detail.refrigerant || ''} onChange={v => updateDetail(uIdx, dIdx, 'refrigerant', v)} isLight={isLight} /></div>
                                <div><FL label="Voltage" /><ChipGroup options={moreCfg.voltageOptions} value={detail.voltage || ''} onChange={v => updateDetail(uIdx, dIdx, 'voltage', v)} isLight={isLight} /></div>
                                <div><FL label="Unit Age" /><ChipGroup options={moreCfg.ageOptions} value={detail.ageRange || ''} onChange={v => updateDetail(uIdx, dIdx, 'ageRange', v)} isLight={isLight} /></div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Details sidebar ══ */}
        <div className="w-full xl:w-[360px] shrink-0 flex flex-col gap-4 xl:sticky xl:top-[57px] xl:self-start xl:max-h-[calc(100vh-57px)] xl:overflow-y-auto">

          {/* 3 · Your Info */}
          <div style={{ backgroundColor: cardBg, borderColor: border }} className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-3">
            <SectionTitle title="Your Information" step={3} />
            <div>
              <FL label="Full Name" />
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name"
                className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]"
                style={inputSty} />
            </div>
            <div>
              <FL label="Contact Phone *" />
              <input type="tel" required value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="09XX XXX XXXX"
                className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]"
                style={inputSty} />
            </div>
            {isStaffOrAdmin && (
              <div>
                <FL label="Dealer / Store" />
                <select
                  value={selectedDealer}
                  onChange={e => {
                    setSelectedDealer(e.target.value)
                    if (e.target.value === 'Direct') setDealerBranch('')
                  }}
                  className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]"
                  style={inputSty}>
                  <option value="Direct">Direct Client</option>
                  {dealers.map(d => (
                    <option key={d.id} value={d.name}>{d.name.toUpperCase()}</option>
                  ))}
                </select>
                {selectedDealer !== 'Direct' && (
                  <div className="mt-3">
                    <FL label={`${selectedDealer.toUpperCase()} Branch Name`} />
                    <input
                      type="text"
                      value={dealerBranch}
                      onChange={e => setDealerBranch(e.target.value.toUpperCase())}
                      placeholder="e.g. MALABON"
                      className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] uppercase"
                      style={{ ...inputSty, textTransform: 'uppercase' }}
                    />
                  </div>
                )}
                {ROBINSON_APPLIANCES_RE.test(selectedDealer) && (
                  <div className="mt-3">
                    <FL label="Transaction ID" />
                    <input
                      type="text"
                      value={controlNumber}
                      onChange={e => setControlNumber(e.target.value)}
                      placeholder="Robinsons Transaction ID"
                      className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]"
                      style={inputSty}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4 · Location */}
          <div style={{ backgroundColor: cardBg, borderColor: border }} className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-3">
            <SectionTitle title="Location" step={4} />
            <PhAddressPicker value={address} onChange={setAddress} inputBg={inputBg} inputBorder={inputBorder} inputText={textPrimary} textMuted={textMuted} />
          </div>

          {/* 5 · Schedule & Notes */}
          <div style={{ backgroundColor: cardBg, borderColor: border }} className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-3">
            <SectionTitle title="Schedule & Notes" step={5} />
            <div>
              <FL label="Preferred Date" />
              <CalendarPicker
                value={selectedDate}
                onChange={setSelectedDate}
                min={new Date().toISOString().slice(0, 10)}
                isLight={isLight}
              />
            </div>
            <div>
              <FL label="Additional Notes (optional)" />
              <textarea value={description} onChange={e => setDescription(e.target.value.toUpperCase())} rows={3}
                placeholder="Describe specific issues or requirements..."
                className="w-full border rounded-xl px-3 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] resize-none uppercase"
                style={{ ...inputSty, textTransform: 'uppercase' }}
              />
            </div>
          </div>

          {/* 6 · Photos */}
          <div style={{ backgroundColor: cardBg, borderColor: border }} className="rounded-2xl border p-4 sm:p-5">
            <SectionTitle title="Photos (optional, max 2)" step={6} />
            <div className="flex gap-3 flex-wrap">
              {images.map((img, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border" style={{ borderColor: inputBorder }}>
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImg(i)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-red-500/80 transition-colors">
                    <Trash2 className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
              {images.length < 2 && (
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{ borderColor: inputBorder, backgroundColor: surfaceBg }}
                  className="w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 hover:border-[#10B981] transition-colors group"
                >
                  <Camera className="w-5 h-5 text-slate-400 group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[10px] text-slate-400 group-hover:text-[#10B981] transition-colors">Add Photo</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addImage} />
            </div>
          </div>

          {/* Submit */}
          <div style={{ backgroundColor: cardBg, borderColor: border }} className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-3">
            <div style={{ backgroundColor: isLight ? '#f0fdf4' : '#0d1e30', borderColor: '#10B981' }} className="flex items-center justify-between px-4 py-3 rounded-xl border">
              <div>
                <p style={{ color: textMuted }} className="text-[10px] font-bold uppercase tracking-wider">Estimated Cost</p>
                <p style={{ color: textMuted }} className="text-[10px] mt-0.5">Updates as you configure</p>
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xs text-[#10B981] font-bold">₱</span>
                <span className="text-2xl font-black text-[#10B981]">{price().toLocaleString()}</span>
              </div>
            </div>
            <button type="submit" disabled={isSubmitting}
              className={`w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all ${isSubmitting ? 'bg-slate-500 cursor-not-allowed' : 'bg-[#10B981] hover:bg-emerald-500 shadow-lg shadow-[#10B981]/25'}`}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Service Request'}
            </button>
            <button type="button" onClick={() => navigate('/tickets')}
              style={{ borderColor: inputBorder, color: textMuted, backgroundColor: surfaceBg }}
              className="w-full py-3 rounded-xl border font-semibold text-sm hover:opacity-70 transition-opacity"
            >
              Cancel
            </button>
          </div>

        </div>
      </form>
    </div>
  )
}
