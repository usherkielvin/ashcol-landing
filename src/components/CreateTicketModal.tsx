import React, { useState, useMemo, useEffect, useRef } from 'react'
import { X, Plus, Minus, MapPin, Calendar, Camera, Search, Check, DollarSign, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

export interface UnitType {
  name: string
  selected: boolean
  quantity: number
  details: UnitDetail[]
}

export interface UnitDetail {
  brand?: string
  hp?: string
  technology?: string
  subtype?: string
  feature?: string
  issueType?: string
  refrigerant?: string
  voltage?: string
  ageRange?: string
  expandedMore?: boolean
}

export const SERVICE_TYPES = ['Cleaning', 'Maintenance', 'Repair', 'Installation']

const SERVICE_PRICES: Record<string, number> = {
  Cleaning: 850, Maintenance: 1200, Repair: 1500, Installation: 1800,
}

const HP_PRICE_MODIFIER: Record<string, number> = {
  '0.5 HP': 0, '0.75 HP': 50, '1.0 HP': 120, '1.5 HP': 220,
  '2.0 HP': 350, '2.5 HP': 500, '3.0 HP': 680, '4.0 HP': 900, '5.0 HP': 1200,
}

const TECHNOLOGY_PRICE_MODIFIER: Record<string, number> = {
  'Non-inverter': 0, Inverter: 180, 'Dual Inverter': 260, 'VRF Inverter': 420,
}

const SUBTYPE_PRICE_MODIFIER: Record<string, number> = {
  Standard: 0, Compact: 40, 'U-shape': 80, 'Wall-mounted': 0,
  'Floor-mounted': 140, Cassette: 260, 'Ceiling cassette': 320,
  Ducted: 460, 'Floor standing': 220,
}

const FEATURE_PRICE_MODIFIER: Record<string, number> = {
  'No special feature': 0, 'Wi-Fi control': 120, 'Eco mode': 80, 'Turbo cool': 100,
  'Remote control': 70, Timer: 60, 'Energy saver': 90, 'Multi-zone': 300,
  'Smart zoning': 260, 'Fresh-air kit': 220, 'Basic install': 0, 'Piping extension': 350,
  'Bracket install': 150, 'Electrical setup': 280, 'Window frame support': 160,
  Sealing: 90, 'Drain setup': 140, 'General cleaning': 0, 'Chemical wash': 280,
  'Filter cleaning': 120, 'Gas check': 200, 'Drain cleaning': 140, 'Performance check': 160,
  'Multi-zone cleaning': 360, 'Coil cleaning': 220, 'Drain check': 130, 'System diagnostics': 280,
  'Compressor issue': 480, 'PCB issue': 520, 'Fan motor issue': 300, 'Leak repair': 260,
  'Capacitor issue': 220, 'Fan issue': 240, 'Outdoor unit issue': 520, 'Controller issue': 460,
  'Zone fault': 380, Relocation: 450, 'Replacement unit': 380, Reinstallation: 300,
}

const ISSUE_PRICE_MODIFIER_BY_SERVICE: Record<string, Record<string, number>> = {
  Cleaning: { 'Standard cleaning': 0, 'Chemical cleaning': 260, 'Deep cleaning': 340, 'Filter cleaning': 120 },
  Maintenance: { 'Preventive maintenance': 0, 'Filter replacement': 180, 'Gas level check': 220, 'Drain line check': 140 },
  Repair: { 'Not cooling': 280, 'Leaking water': 180, Noisy: 160, 'Power issue': 320, Maintenance: 120 },
  Installation: { 'New installation': 0, Relocation: 420, 'Replacement unit': 300, Reinstallation: 240 },
}

const AIRCON_BRANDS = [
  'Carrier', 'Daikin', 'Panasonic', 'LG', 'Samsung', 'Mitsubishi',
  'Condura', 'Koppel', 'Kolin', 'TCL', 'Midea', 'Hitachi', 'Sharp',
  'Fujidenzo', 'Haier',
]

const ISSUE_OPTIONS_BY_SERVICE: Record<string, string[]> = {
  Cleaning: ['Standard cleaning', 'Chemical cleaning', 'Deep cleaning', 'Filter cleaning'],
  Maintenance: ['Preventive maintenance', 'Filter replacement', 'Gas level check', 'Drain line check'],
  Repair: ['Not cooling', 'Leaking water', 'Noisy', 'Power issue', 'Maintenance'],
  Installation: ['New installation', 'Relocation', 'Replacement unit', 'Reinstallation'],
}

const MORE_DETAIL_CONFIG: Record<string, { refrigerantOptions: string[]; voltageOptions: string[]; ageOptions: string[] }> = {
  'Split AC': { refrigerantOptions: ['R32', 'R410A', 'R22', 'Unknown'], voltageOptions: ['220V', '230V', '240V', 'Unknown'], ageOptions: ['<1 year', '1-3 years', '4-6 years', '7+ years', 'Unknown'] },
  'Window AC': { refrigerantOptions: ['R32', 'R410A', 'R22', 'Unknown'], voltageOptions: ['110V', '220V', 'Unknown'], ageOptions: ['<1 year', '1-3 years', '4-6 years', '7+ years', 'Unknown'] },
  ARF: { refrigerantOptions: ['R410A', 'R32', 'Unknown'], voltageOptions: ['220V', '380V 3-phase', 'Unknown'], ageOptions: ['<1 year', '1-3 years', '4-6 years', '7+ years', 'Unknown'] },
}

const UNIT_DETAIL_CONFIG: Record<string, { hpOptions: string[]; technologyOptions: string[]; subtypeOptions: string[]; featureOptions: string[] }> = {
  'Split AC': { hpOptions: ['0.75 HP', '1.0 HP', '1.5 HP', '2.0 HP', '2.5 HP', '3.0 HP'], technologyOptions: ['Dual Inverter', 'Inverter', 'Non-inverter'], subtypeOptions: ['Wall-mounted', 'Floor-mounted', 'Cassette'], featureOptions: ['Wi-Fi control', 'Eco mode', 'Turbo cool', 'No special feature'] },
  'Window AC': { hpOptions: ['0.5 HP', '0.75 HP', '1.0 HP', '1.5 HP', '2.0 HP'], technologyOptions: ['Inverter', 'Non-inverter'], subtypeOptions: ['Standard', 'Compact', 'U-shape'], featureOptions: ['Remote control', 'Timer', 'Energy saver', 'No special feature'] },
  ARF: { hpOptions: ['2.0 HP', '2.5 HP', '3.0 HP', '4.0 HP', '5.0 HP'], technologyOptions: ['VRF Inverter', 'Inverter'], subtypeOptions: ['Ceiling cassette', 'Ducted', 'Floor standing'], featureOptions: ['Multi-zone', 'Smart zoning', 'Fresh-air kit', 'No special feature'] },
}

const SERVICE_UNIT_OVERRIDES: Record<string, Partial<Record<string, any>>> = {
  Installation: {
    'Split AC': { hpOptions: ['1.0 HP', '1.5 HP', '2.0 HP', '2.5 HP', '3.0 HP'], technologyOptions: ['Dual Inverter', 'Inverter', 'Non-inverter'], subtypeOptions: ['Wall-mounted', 'Cassette', 'Floor-mounted'], featureOptions: ['Basic install', 'Piping extension', 'Bracket install', 'Electrical setup'] },
    'Window AC': { hpOptions: ['0.75 HP', '1.0 HP', '1.5 HP', '2.0 HP'], technologyOptions: ['Inverter', 'Non-inverter'], subtypeOptions: ['Standard', 'Compact'], featureOptions: ['Window frame support', 'Sealing', 'Electrical setup', 'Drain setup'] },
    ARF: { hpOptions: ['2.5 HP', '3.0 HP', '4.0 HP', '5.0 HP'], technologyOptions: ['VRF Inverter', 'Inverter'], subtypeOptions: ['Ceiling cassette', 'Ducted', 'Floor standing'], featureOptions: ['Multi-zone install', 'Ducting setup', 'Control wiring', 'Commissioning'] },
  },
  Maintenance: {
    'Split AC': { hpOptions: UNIT_DETAIL_CONFIG['Split AC'].hpOptions, technologyOptions: UNIT_DETAIL_CONFIG['Split AC'].technologyOptions, subtypeOptions: UNIT_DETAIL_CONFIG['Split AC'].subtypeOptions, featureOptions: ['General cleaning', 'Chemical wash', 'Filter cleaning', 'Gas check'] },
    'Window AC': { hpOptions: UNIT_DETAIL_CONFIG['Window AC'].hpOptions, technologyOptions: UNIT_DETAIL_CONFIG['Window AC'].technologyOptions, subtypeOptions: UNIT_DETAIL_CONFIG['Window AC'].subtypeOptions, featureOptions: ['General cleaning', 'Filter cleaning', 'Drain cleaning', 'Performance check'] },
    ARF: { hpOptions: UNIT_DETAIL_CONFIG.ARF.hpOptions, technologyOptions: UNIT_DETAIL_CONFIG.ARF.technologyOptions, subtypeOptions: UNIT_DETAIL_CONFIG.ARF.subtypeOptions, featureOptions: ['Multi-zone cleaning', 'Coil cleaning', 'Drain check', 'System diagnostics'] },
  },
  Repair: {
    'Split AC': { hpOptions: UNIT_DETAIL_CONFIG['Split AC'].hpOptions, technologyOptions: UNIT_DETAIL_CONFIG['Split AC'].technologyOptions, subtypeOptions: UNIT_DETAIL_CONFIG['Split AC'].subtypeOptions, featureOptions: ['Compressor issue', 'PCB issue', 'Fan motor issue', 'Leak repair'] },
    'Window AC': { hpOptions: UNIT_DETAIL_CONFIG['Window AC'].hpOptions, technologyOptions: UNIT_DETAIL_CONFIG['Window AC'].technologyOptions, subtypeOptions: UNIT_DETAIL_CONFIG['Window AC'].subtypeOptions, featureOptions: ['Compressor issue', 'Capacitor issue', 'Fan issue', 'Leak repair'] },
    ARF: { hpOptions: UNIT_DETAIL_CONFIG.ARF.hpOptions, technologyOptions: UNIT_DETAIL_CONFIG.ARF.technologyOptions, subtypeOptions: UNIT_DETAIL_CONFIG.ARF.subtypeOptions, featureOptions: ['Outdoor unit issue', 'Controller issue', 'Leak repair', 'Zone fault'] },
  },
}

function ChipGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = value === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? '' : opt)}
            className={`px-3 py-1.5 rounded-full border text-sm font-semibold transition-all ${
              active
                ? 'bg-[#10B981] border-[#10B981] text-white shadow-sm shadow-[#10B981]/30'
                : isLight
                  ? 'bg-white border-slate-200 text-slate-600 hover:border-[#10B981]/50 hover:text-[#10B981]'
                  : 'bg-[#121720] border-[#2C3440] text-[#A8B1BD] hover:border-[#10B981]/50 hover:text-[#10B981]'
            }`}
          >
            {active && <Check className="w-3 h-3 inline mr-1" />}
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function BrandPickerPopover({
  value, onChange, isLight
}: { value: string; onChange: (v: string) => void; isLight: boolean }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return AIRCON_BRANDS
    return AIRCON_BRANDS.filter(b => b.toLowerCase().includes(search.toLowerCase()))
  }, [search])

  const initials = value ? value.slice(0, 2).toUpperCase() : 'AC'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch('') }}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-sm transition-all ${
          isLight
            ? 'bg-white border-slate-200 hover:border-[#10B981]/50 text-slate-700'
            : 'bg-[#121720] border-[#2C3440] hover:border-[#10B981]/50 text-white'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#10B981] flex items-center justify-center text-[10px] font-black text-[#1C232D] flex-shrink-0">
            {initials}
          </span>
          <span className={value ? '' : (isLight ? 'text-slate-400' : 'text-[#7D8794]')}>
            {value || 'Select brand'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isLight ? 'text-slate-400' : 'text-[#7D8794]'}`} />
      </button>

      {open && (
        <div className={`absolute z-50 left-0 right-0 top-full mt-1.5 rounded-xl border shadow-2xl overflow-hidden ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#191D23] border-[#2C3440]'
        }`}>
          <div className={`p-2 border-b ${isLight ? 'border-slate-100' : 'border-[#2C3440]'}`}>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search brand..."
                className={`w-full pl-7 pr-3 py-2 text-sm rounded-lg border outline-none ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'
                    : 'bg-[#0F131A] border-[#2C3440] text-white placeholder:text-[#7D8794]'
                }`}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto py-1.5 px-2 flex flex-col gap-1">
            {filtered.length === 0 && (
              <p className="text-center text-sm py-3 text-slate-400">No brand found.</p>
            )}
            {filtered.map(brand => (
              <button
                key={brand}
                type="button"
                onClick={() => { onChange(brand); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold text-left transition-all ${
                  value === brand
                    ? isLight ? 'bg-emerald-50 text-[#10B981]' : 'bg-[#1F2A38] text-[#10B981]'
                    : isLight ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-[#1F2A38] text-[#C8D0DB]'
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center text-[9px] font-black text-[#1C232D] flex-shrink-0">
                  {brand.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1">{brand}</span>
                {value === brand && <Check className="w-4 h-4 text-[#10B981]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CreateTicketModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const cardBg = isLight ? '#ffffff' : '#0A1120'
  const border = isLight ? '#e2e8f0' : '#1E2D48'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const surfaceBg = isLight ? '#F5F5F5' : '#191D23'
  const inputBg = isLight ? '#ffffff' : '#121720'
  const inputBorder = isLight ? '#DDD' : '#2C3440'

  const [selectedService, setSelectedService] = useState<string>('Cleaning')
  const [fullName, setFullName] = useState<string>(user?.name || '')
  const [contactPhone, setContactPhone] = useState<string>(user?.phone || '')
  const [location, setLocation] = useState<string>('')
  const [landmark, setLandmark] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [images, setImages] = useState<{ file: File; url: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createEmptyUnitDetail = (): UnitDetail => ({
    brand: '', hp: '', technology: '', subtype: '', feature: '',
    issueType: '', refrigerant: '', voltage: '', ageRange: '', expandedMore: false
  })

  const [unitTypes, setUnitTypes] = useState<UnitType[]>([
    { name: 'Split AC', selected: false, quantity: 1, details: [createEmptyUnitDetail()] },
    { name: 'Window AC', selected: false, quantity: 1, details: [createEmptyUnitDetail()] },
    { name: 'ARF', selected: false, quantity: 1, details: [createEmptyUnitDetail()] },
  ])

  useEffect(() => {
    setUnitTypes(prev => prev.map(unit => ({
      ...unit,
      details: unit.details.map(d => ({ ...d, hp: '', technology: '', subtype: '', feature: '', issueType: '' }))
    })))
  }, [selectedService])

  const calculateTotalPrice = (): number => {
    const basePrice = SERVICE_PRICES[selectedService] || 0
    const selectedUnits = unitTypes.filter(u => u.selected)
    if (!selectedUnits.length) return basePrice
    const issueMap = ISSUE_PRICE_MODIFIER_BY_SERVICE[selectedService] ?? {}
    return selectedUnits.reduce((sum, unit) => {
      return sum + unit.details.reduce((ds, d) => {
        return ds + (basePrice
          + (d.hp ? (HP_PRICE_MODIFIER[d.hp] ?? 0) : 0)
          + (d.technology ? (TECHNOLOGY_PRICE_MODIFIER[d.technology] ?? 0) : 0)
          + (d.subtype ? (SUBTYPE_PRICE_MODIFIER[d.subtype] ?? 0) : 0)
          + (d.feature ? (FEATURE_PRICE_MODIFIER[d.feature] ?? 0) : 0)
          + (d.issueType ? (issueMap[d.issueType] ?? 0) : 0))
      }, 0)
    }, 0)
  }

  const toggleUnit = (index: number) => {
    setUnitTypes(prev => {
      const next = [...prev]
      next[index] = { ...next[index], selected: !next[index].selected }
      return next
    })
  }

  const updateQuantity = (index: number, change: number) => {
    setUnitTypes(prev => {
      const next = [...prev]
      const current = next[index]
      const newQty = current.quantity + change
      if (newQty < 1 || newQty > 10) return prev
      let nextDetails = [...current.details]
      if (newQty > nextDetails.length) {
        for (let i = nextDetails.length; i < newQty; i++) nextDetails.push(createEmptyUnitDetail())
      } else {
        nextDetails = nextDetails.slice(0, newQty)
      }
      next[index] = { ...current, quantity: newQty, details: nextDetails }
      return next
    })
  }

  const updateDetail = (uIdx: number, dIdx: number, field: keyof UnitDetail, value: any) => {
    setUnitTypes(prev => {
      const next = [...prev]
      next[uIdx] = {
        ...next[uIdx],
        details: next[uIdx].details.map((d, i) => i === dIdx ? { ...d, [field]: value } : d)
      }
      return next
    })
  }

  const toggleMoreDetails = (uIdx: number, dIdx: number) => {
    updateDetail(uIdx, dIdx, 'expandedMore', !unitTypes[uIdx].details[dIdx].expandedMore)
  }

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const toAdd = files.slice(0, 2 - images.length)
    setImages(prev => [
      ...prev,
      ...toAdd.map(f => ({ file: f, url: URL.createObjectURL(f) }))
    ])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (index: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index].url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const getIssueLabelForService = (svc: string) => {
    if (svc === 'Installation') return 'Install Request'
    if (svc === 'Maintenance') return 'Maintenance Scope'
    return 'Issue Type'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const selectedUnits = unitTypes.filter(u => u.selected)
      if (selectedUnits.length === 0) {
        alert('Please select at least one AC Unit Type')
        setIsSubmitting(false)
        return
      }

      const selectedUnitNames = selectedUnits.map(u => `${u.name} x${u.quantity}`).join(', ')

      const fullLocation = location + (landmark ? `, ${landmark}` : '')
      const fullDescription = description.trim() || 'No additional details provided.'

      const token = sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

      const ticketData = {
        title: `${selectedService} service`,
        description: fullDescription,
        serviceType: selectedService,
        unitType: selectedUnitNames,
        acDetails: JSON.stringify(selectedUnits.map(unit => ({ unitType: unit.name, quantity: unit.quantity, details: unit.details }))),
        contactPhone: contactPhone.trim(),
        preferredDate: selectedDate || undefined,
        location: fullLocation.trim(),
      }

      const res = await fetch(`${apiUrl}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(ticketData)
      })

      if (!res.ok) throw new Error('Failed to create ticket')
      onSuccess()
    } catch (err) {
      console.error(err)
      alert('Validation failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const sectionTitle = (n: string) => (
    <h4 style={{ color: textPrimary }} className="text-lg font-semibold mb-4">{n}</h4>
  )

  const fieldLabel = (label: string) => (
    <span style={{ color: textPrimary }} className="text-sm font-medium mb-2 block">{label}</span>
  )

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-[#10B981]/30 focus:border-[#10B981]`
  const inputStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div
        style={{ backgroundColor: cardBg, borderColor: border }}
        className="relative w-full max-w-2xl rounded-2xl border flex flex-col max-h-[92vh] shadow-2xl"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b shrink-0 flex items-center justify-between" style={{ borderColor: border }}>
          <div>
            <h3 style={{ color: textPrimary }} className="text-xl font-bold">Create Service Request</h3>
            <p style={{ color: textMuted }} className="text-sm mt-0.5">Fill in the details below</p>
          </div>
          <button
            onClick={onClose}
            style={{ backgroundColor: surfaceBg, borderColor: inputBorder }}
            className="p-2 rounded-full border hover:opacity-70 transition-opacity"
          >
            <X className="w-5 h-5" style={{ color: textMuted }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-6 flex flex-col gap-7">
          <form id="create-ticket-form" onSubmit={handleSubmit}>

            {/* Section 1: Service Type */}
            <div className="mb-7">
              {sectionTitle('Service Type')}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SERVICE_TYPES.map(svc => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => setSelectedService(svc)}
                    className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                      selectedService === svc
                        ? 'bg-[#10B981] border-[#10B981] text-white shadow-sm shadow-[#10B981]/30'
                        : isLight
                          ? 'bg-white border-slate-200 text-slate-600 hover:border-[#10B981]/50'
                          : 'bg-[#121720] border-[#2C3440] text-[#A8B1BD] hover:border-[#10B981]/50'
                    }`}
                  >
                    {svc}
                  </button>
                ))}
              </div>
            </div>

            {/* Section 2: AC Unit Types */}
            <div className="mb-7">
              {sectionTitle('AC Unit Type(s)')}
              <div className="flex flex-col gap-3">
                {unitTypes.map((unit, uIdx) => {
                  const config = SERVICE_UNIT_OVERRIDES[selectedService]?.[unit.name] ?? UNIT_DETAIL_CONFIG[unit.name]
                  const issueOptions = ISSUE_OPTIONS_BY_SERVICE[selectedService] ?? ISSUE_OPTIONS_BY_SERVICE.Repair
                  const issueLabel = getIssueLabelForService(selectedService)
                  const moreConfig = MORE_DETAIL_CONFIG[unit.name] ?? { refrigerantOptions: [], voltageOptions: [], ageOptions: [] }

                  return (
                    <div
                      key={unit.name}
                      style={{ borderColor: unit.selected ? '#10B981' : inputBorder, backgroundColor: unit.selected ? (isLight ? '#f0fdf4' : '#0F1A2E') : 'transparent' }}
                      className="rounded-xl border transition-all"
                    >
                      {/* Unit row header */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <div
                            onClick={() => toggleUnit(uIdx)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer flex-shrink-0 transition-all ${
                              unit.selected ? 'bg-[#10B981] border-[#10B981]' : isLight ? 'bg-white border-slate-300' : 'bg-[#121720] border-[#2C3440]'
                            }`}
                          >
                            {unit.selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span style={{ color: textPrimary }} className="font-semibold text-base">{unit.name}</span>
                        </label>
                        {unit.selected && (
                          <div
                            style={{ backgroundColor: isLight ? 'white' : '#0A1120', borderColor: inputBorder }}
                            className="flex items-center rounded-lg border overflow-hidden"
                          >
                            <button type="button" onClick={() => updateQuantity(uIdx, -1)} className="px-2.5 py-1.5 hover:bg-[#10B981]/10 text-[#10B981] transition-colors">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span style={{ color: textPrimary }} className="w-8 text-center text-sm font-bold">{unit.quantity}</span>
                            <button type="button" onClick={() => updateQuantity(uIdx, 1)} className="px-2.5 py-1.5 hover:bg-[#10B981]/10 text-[#10B981] transition-colors">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Unit detail cards */}
                      {unit.selected && (
                        <div className="px-4 pb-4 flex flex-col gap-4">
                          {unit.details.map((detail, dIdx) => (
                            <div
                              key={dIdx}
                              style={{ backgroundColor: isLight ? 'white' : '#0A1120', borderColor: inputBorder }}
                              className="rounded-xl border p-4 flex flex-col gap-4"
                            >
                              {unit.quantity > 1 && (
                                <p className="text-xs font-bold text-[#10B981] uppercase tracking-wider">
                                  {unit.name} #{dIdx + 1}
                                </p>
                              )}

                              {/* Brand */}
                              <div>
                                {fieldLabel('Brand')}
                                <BrandPickerPopover
                                  value={detail.brand || ''}
                                  onChange={v => updateDetail(uIdx, dIdx, 'brand', v)}
                                  isLight={isLight}
                                />
                              </div>

                              {/* Horsepower */}
                              <div>
                                {fieldLabel('Horsepower')}
                                <ChipGroup
                                  options={config.hpOptions}
                                  value={detail.hp || ''}
                                  onChange={v => updateDetail(uIdx, dIdx, 'hp', v)}
                                />
                              </div>

                              {/* Technology */}
                              <div>
                                {fieldLabel('Technology')}
                                <ChipGroup
                                  options={config.technologyOptions}
                                  value={detail.technology || ''}
                                  onChange={v => updateDetail(uIdx, dIdx, 'technology', v)}
                                />
                              </div>

                              {/* Unit Subtype */}
                              <div>
                                {fieldLabel('Unit Subtype')}
                                <ChipGroup
                                  options={config.subtypeOptions}
                                  value={detail.subtype || ''}
                                  onChange={v => updateDetail(uIdx, dIdx, 'subtype', v)}
                                />
                              </div>

                              {/* Special Option */}
                              <div>
                                {fieldLabel('Special Option')}
                                <ChipGroup
                                  options={config.featureOptions}
                                  value={detail.feature || ''}
                                  onChange={v => updateDetail(uIdx, dIdx, 'feature', v)}
                                />
                              </div>

                              {/* Issue / Service Label */}
                              <div>
                                {fieldLabel(issueLabel)}
                                <ChipGroup
                                  options={issueOptions}
                                  value={detail.issueType || ''}
                                  onChange={v => updateDetail(uIdx, dIdx, 'issueType', v)}
                                />
                              </div>

                              {/* More details toggle */}
                              <button
                                type="button"
                                onClick={() => toggleMoreDetails(uIdx, dIdx)}
                                style={{ borderColor: inputBorder, backgroundColor: isLight ? '#f8fafc' : '#121720' }}
                                className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors hover:border-[#10B981]/50"
                              >
                                <span style={{ color: textPrimary }}>{detail.expandedMore ? 'Hide more details' : 'Add more details'}</span>
                                {detail.expandedMore
                                  ? <ChevronUp className="w-4 h-4" style={{ color: textMuted }} />
                                  : <ChevronDown className="w-4 h-4" style={{ color: textMuted }} />
                                }
                              </button>

                              {detail.expandedMore && (
                                <div className="flex flex-col gap-4 pt-1">
                                  <div>
                                    {fieldLabel('Refrigerant')}
                                    <ChipGroup
                                      options={moreConfig.refrigerantOptions}
                                      value={detail.refrigerant || ''}
                                      onChange={v => updateDetail(uIdx, dIdx, 'refrigerant', v)}
                                    />
                                  </div>
                                  <div>
                                    {fieldLabel('Voltage')}
                                    <ChipGroup
                                      options={moreConfig.voltageOptions}
                                      value={detail.voltage || ''}
                                      onChange={v => updateDetail(uIdx, dIdx, 'voltage', v)}
                                    />
                                  </div>
                                  <div>
                                    {fieldLabel('Unit Age')}
                                    <ChipGroup
                                      options={moreConfig.ageOptions}
                                      value={detail.ageRange || ''}
                                      onChange={v => updateDetail(uIdx, dIdx, 'ageRange', v)}
                                    />
                                  </div>
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

            {/* Price Panel */}
            <div
              style={{ backgroundColor: isLight ? '#f9fafb' : '#0F1320', borderColor: '#10B981' }}
              className="rounded-xl border flex items-center justify-between px-5 py-4 mb-7"
            >
              <div>
                <p style={{ color: textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-1">Estimated Price</p>
                <p style={{ color: textMuted }} className="text-xs">Updates as you select options</p>
              </div>
              <div className="flex items-baseline gap-1">
                <DollarSign className="w-5 h-5 text-[#10B981] mb-0.5" />
                <span className="text-2xl font-black text-[#10B981]">
                  {calculateTotalPrice().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Section 3: Customer Information */}
            <div className="mb-7">
              {sectionTitle('Customer Information')}
              <div className="flex flex-col gap-4">
                <div>
                  {fieldLabel('Full Name')}
                  <input
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  {fieldLabel('Contact Phone')}
                  <input
                    type="tel"
                    required
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    placeholder="09XX XXX XXXX"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Location Details */}
            <div className="mb-7">
              {sectionTitle('Location Details')}
              <div className="flex flex-col gap-4">
                <div>
                  {fieldLabel('Location / Address *')}
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <textarea
                      required
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="Enter service location address"
                      rows={2}
                      className={`${inputClass} pl-9 resize-none`}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  {fieldLabel('Landmark (Optional)')}
                  <input
                    value={landmark}
                    onChange={e => setLandmark(e.target.value)}
                    placeholder="e.g., Near 7-Eleven"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Section 5: Additional Details */}
            <div className="mb-7">
              {sectionTitle('Additional Details')}
              <div className="flex flex-col gap-4">
                <div>
                  {fieldLabel('Description (Optional)')}
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe any specific issues or requirements"
                    rows={3}
                    className={`${inputClass} resize-none`}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Section 6: Preferred Date */}
            <div className="mb-7">
              {sectionTitle('Preferred Service Date')}
              <div className="relative">
                <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className={`${inputClass} pl-9`}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Section 7: Upload Photos */}
            <div className="mb-2">
              {sectionTitle('Upload Photos (Optional)')}
              <p style={{ color: textMuted }} className="text-xs mb-3">Max 2 images</p>
              <div className="flex gap-3 flex-wrap">
                {images.map((img, i) => (
                  <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border" style={{ borderColor: inputBorder }}>
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-red-500/80 transition-colors"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                {images.length < 2 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ borderColor: inputBorder, backgroundColor: isLight ? '#f8fafc' : '#121720' }}
                    className="w-24 h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 hover:border-[#10B981] transition-colors group"
                  >
                    <Camera className="w-6 h-6 text-slate-400 group-hover:text-[#10B981] transition-colors" />
                    <span className="text-xs text-slate-400 group-hover:text-[#10B981] transition-colors">Add Photo</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageAdd}
                />
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}
        >
          <div className="text-sm" style={{ color: textMuted }}>
            Estimated: <span className="font-black text-[#10B981] text-base">₱{calculateTotalPrice().toLocaleString()}</span>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              style={{ borderColor: inputBorder, color: textPrimary, backgroundColor: isLight ? 'white' : '#121720' }}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl border font-semibold text-sm hover:opacity-70 transition-opacity"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-ticket-form"
              disabled={isSubmitting}
              className={`flex-1 sm:flex-none px-8 py-2.5 rounded-xl font-bold text-white text-sm transition-all ${
                isSubmitting ? 'bg-slate-500 cursor-not-allowed' : 'bg-[#10B981] hover:bg-emerald-500 shadow-lg shadow-[#10B981]/30'
              }`}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
