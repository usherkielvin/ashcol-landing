import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { 
  Wrench, Settings as ConfigIcon, TrendingUp, PhoneCall, Smartphone, Headset, 
  Mail, Calendar, Clock, Star, MapPin, Check, MessageSquare,
  Users, ArrowUpRight, Menu, X, Building2, Zap, Wind, ShieldCheck, Target, Heart, Briefcase, Bell,
  Sun, Moon, ChevronLeft, ChevronRight, Layers, Home, Factory, Phone
} from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import { PUBLIC_BRANCHES } from '../data/branches'
import { getPortalUrl } from '../utils/portalUrl'

// ─── Data ────────────────────────────────────────────────────────────────────

const SERVICES = [
  {
    icon: <Wrench className="w-6 h-6" />,
    title: 'Installation & Dismantling',
    color: '#10B981',
    colorBg: 'rgba(16,185,129,0.12)',
    colorBorder: 'rgba(16,185,129,0.35)',
    desc: 'Professional installation and safe dismantling of all air conditioning types for homes, offices, and commercial spaces.',
    items: ['Residential AC Units', 'Commercial Systems', 'Ductless Mini-Splits', 'Industrial Units'],
  },
  {
    icon: <ConfigIcon className="w-6 h-6" />,
    title: 'Preventive Maintenance',
    color: '#3B82F6',
    colorBg: 'rgba(59,130,246,0.12)',
    colorBorder: 'rgba(59,130,246,0.35)',
    desc: 'Scheduled general cleaning and comprehensive check-ups to keep your unit running at peak efficiency.',
    items: ['General Cleaning', 'Performance Check-up', 'Filter Replacement', 'Refrigerant Top-up'],
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: 'Repair & Diagnostics',
    color: '#8B5CF6',
    colorBg: 'rgba(139,92,246,0.12)',
    colorBorder: 'rgba(139,92,246,0.35)',
    desc: 'Rapid system diagnostics, troubleshooting, and emergency repairs to restore your comfort without delay.',
    items: ['Emergency Repairs', 'System Diagnostics', 'Board Troubleshooting', 'System Reprogramming'],
  },
  {
    icon: <Wind className="w-6 h-6" />,
    title: 'Ducting & Ventilation',
    color: '#06B6D4',
    colorBg: 'rgba(6,182,212,0.12)',
    colorBorder: 'rgba(6,182,212,0.35)',
    desc: 'Custom ducting works and ventilation solutions designed for residential, commercial, and industrial requirements.',
    items: ['Duct Design & Fabrication', 'Fresh Air Ventilation', 'Exhaust Systems', 'Air Balancing'],
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: 'Electrical Works',
    color: '#F59E0B',
    colorBg: 'rgba(245,158,11,0.12)',
    colorBorder: 'rgba(245,158,11,0.35)',
    desc: 'Complete electrical wiring services for AC units across residential, commercial, and industrial settings.',
    items: ['Wiring Installation', 'Circuit Breaker Setup', 'Load Balancing', 'Panel Upgrades'],
  },
  {
    icon: <Building2 className="w-6 h-6" />,
    title: 'Commercial & Industrial',
    color: '#EF4444',
    colorBg: 'rgba(239,68,68,0.12)',
    colorBorder: 'rgba(239,68,68,0.35)',
    desc: 'Specialized services for large-scale commercial establishments, restaurants, malls, and industrial facilities.',
    items: ['Chiller Systems', 'VRF/VRV Systems', 'Centralized AC', 'Multi-zone Control'],
  },
]

const CONTACTS = [
  { icon: <Smartphone className="w-4 h-4" />,label: 'Mobile (Globe)',       value: '+63 (917) 7143810',             href: 'tel:+639177143810' },
  { icon: <Mail className="w-4 h-4" />,      label: 'Head Office Email',    value: 'headoffice@ashcol.com.ph',      href: 'mailto:headoffice@ashcol.com.ph' },
]

const BRANCHES = PUBLIC_BRANCHES

const CLIENTS = [
  "McDonald's", "Subway", "Mang Inasal", "The Aristocrat", "breadTalk",
  "Goldilocks", "Kumon", "Sterling Bank of Asia", "Generika Drugstore",
  "South Star Drug", "AXA", "La Verti Residences", "Sheridan Towers", "The Grove by Rockwell",
]

const getBrandLogo = (name: string) => {
  // Map clean names to filenames
  const fileMap: Record<string, string> = {
    'Carrier': 'carrier.png',
    'Daikin': 'daikin.png',
    'Panasonic': 'panasonic.png',
    'Samsung': 'samsung.png',
    'LG': 'lg.png',
    'Koppel': 'koppel.png',
    'Mitsubishi Electric': 'mitsubishi.png',
    'York': 'york.png',
    'Gree': 'gree.png',
    'Midea': 'midea.png',
    'Sharp': 'sharp.png',
    'Haier': 'haier.png',
    'TCL': 'tcl.png',
    'Aux': 'auxaircon.png',
    'Fuji-Aire': 'fuji.png',
    'Kolin': 'kolin.png',
  }
  
  const filename = fileMap[name]
  if (!filename) return undefined
  
  // Use Vite's recommended way for dynamic assets
  return new URL(`../assets/brands/${filename}`, import.meta.url).href
}

const BRANDS = [
  { name: 'Carrier',             logo: getBrandLogo('Carrier') },
  { name: 'Daikin',              logo: getBrandLogo('Daikin') },
  { name: 'Panasonic',           logo: getBrandLogo('Panasonic') },
  { name: 'Samsung',             logo: getBrandLogo('Samsung') },
  { name: 'LG',                  logo: getBrandLogo('LG') },
  { name: 'Koppel',              logo: getBrandLogo('Koppel') },
  { name: 'Mitsubishi Electric', logo: getBrandLogo('Mitsubishi Electric') },
  { name: 'York',                logo: getBrandLogo('York') },
  { name: 'Gree',                logo: getBrandLogo('Gree') },
  { name: 'Midea',               logo: getBrandLogo('Midea') },
  { name: 'Sharp',               logo: getBrandLogo('Sharp') },
  { name: 'Haier',               logo: getBrandLogo('Haier') },
  { name: 'TCL',                 logo: getBrandLogo('TCL') },
  { name: 'Aux',                 logo: getBrandLogo('Aux') },
  { name: 'Fuji-Aire',           logo: getBrandLogo('Fuji-Aire') },
  { name: 'Kolin',               logo: getBrandLogo('Kolin') },
]

const VALUES = [
  { icon: <ShieldCheck className="w-5 h-5" />, title: 'Integrity',       desc: 'We do what is right — always honest, always transparent.',          color: '#10B981', colorBg: 'rgba(16,185,129,0.12)' },
  { icon: <Star className="w-5 h-5" />,        title: 'Excellence',      desc: 'We hold ourselves to the highest standard in every service.',       color: '#F59E0B', colorBg: 'rgba(245,158,11,0.12)' },
  { icon: <Users className="w-5 h-5" />,       title: 'Customer Focus',  desc: 'Your comfort is our priority, before and after every job.',         color: '#3B82F6', colorBg: 'rgba(59,130,246,0.12)' },
  { icon: <Heart className="w-5 h-5" />,       title: 'Teamwork',        desc: 'A collaborative team that delivers consistent results.',            color: '#EF4444', colorBg: 'rgba(239,68,68,0.12)' },
  { icon: <Target className="w-5 h-5" />,      title: 'Commitment',      desc: 'We stand behind our work with dedication and accountability.',      color: '#8B5CF6', colorBg: 'rgba(139,92,246,0.12)' },
]

const FEATURED_PROJECTS = [
  {
    title: 'BGC Commercial Office',
    type: 'Commercial Centralized Setup',
    tag: 'Commercial',
    tagColor: '#3B82F6',
    tagBg: 'rgba(59,130,246,0.12)',
    location: 'Bonifacio Global City, Taguig',
    scope: 'Centralized AC system across 4 floors, ductwork fabrication, and electrical works.',
    stats: [
      { label: 'Floor Area', value: '1,200 sqm' },
      { label: 'Units Installed', value: '8 FCUs' },
      { label: 'Project Duration', value: '3 weeks' },
    ],
    gradient: 'linear-gradient(135deg, #1E3A5F 0%, #0F1A2E 60%, #0A2540 100%)',
    accentColor: '#3B82F6',
    icon: <Building2 className="w-8 h-8" />,
  },
  {
    title: 'Residential Split-Type Retrofit',
    type: 'Home AC Overhaul',
    tag: 'Residential',
    tagColor: '#10B981',
    tagBg: 'rgba(16,185,129,0.12)',
    location: 'Paranaque City, Metro Manila',
    scope: 'Full replacement of 5 aging window-type units with inverter split-type systems, including wiring and bracket installation.',
    stats: [
      { label: 'Units Replaced', value: '5 split-type' },
      { label: 'Energy Savings', value: '~35%' },
      { label: 'Completion', value: '2 days' },
    ],
    gradient: 'linear-gradient(135deg, #0E3320 0%, #0C1A10 60%, #091409 100%)',
    accentColor: '#10B981',
    icon: <Home className="w-8 h-8" />,
  },
  {
    title: 'Mang Inasal Restaurant Branch',
    type: 'Commercial air conditioning services Installation',
    tag: 'Food & Beverage',
    tagColor: '#F59E0B',
    tagBg: 'rgba(245,158,11,0.12)',
    location: 'SM Mall, Valenzuela City',
    scope: 'Ceiling cassette AC units with custom ductwork for kitchen ventilation and dining area comfort across a 300 sqm restaurant space.',
    stats: [
      { label: 'Dining Area', value: '300 sqm' },
      { label: 'Cassette Units', value: '6 units' },
      { label: 'Brand', value: 'Daikin VRV' },
    ],
    gradient: 'linear-gradient(135deg, #3D2200 0%, #1E1000 60%, #170D00 100%)',
    accentColor: '#F59E0B',
    icon: <Layers className="w-8 h-8" />,
  },
  {
    title: 'Industrial Cold Storage Facility',
    type: 'Industrial air conditioning services & Refrigeration',
    tag: 'Industrial',
    tagColor: '#8B5CF6',
    tagBg: 'rgba(139,92,246,0.12)',
    location: 'Rodriguez, Rizal',
    scope: 'Design and installation of precision-climate air conditioning services for a 2,000 sqm cold storage warehouse, including insulated ductwork, air handlers, and control panels.',
    stats: [
      { label: 'Facility Area', value: '2,000 sqm' },
      { label: 'System Type', value: 'VRF Multi-zone' },
      { label: 'Project Duration', value: '6 weeks' },
    ],
    gradient: 'linear-gradient(135deg, #1A0E3D 0%, #0E0720 60%, #090516 100%)',
    accentColor: '#8B5CF6',
    icon: <Factory className="w-8 h-8" />,
  },
  {
    title: 'La Verti Residences Tower',
    type: 'High-Rise Residential Installation',
    tag: 'Residential',
    tagColor: '#06B6D4',
    tagBg: 'rgba(6,182,212,0.12)',
    location: 'Paco, Manila',
    scope: 'Multi-unit split-type AC installation across 30 residential condominium units, coordinated with building management for minimal disruption.',
    stats: [
      { label: 'Units Served', value: '30 condo units' },
      { label: 'Brand', value: 'Carrier / LG' },
      { label: 'Duration', value: '4 weeks' },
    ],
    gradient: 'linear-gradient(135deg, #003642 0%, #001E26 60%, #001219 100%)',
    accentColor: '#06B6D4',
    icon: <Building2 className="w-8 h-8" />,
  },
]

const FAQS = [
  {
    q: 'What types of air conditioning services does ASHCOL offer?',
    a: 'ASHCOL provides a comprehensive range of AC services including installation and dismantling, preventive maintenance (general cleaning), repair and diagnostics, ducting and ventilation works, electrical works for AC units, and commercial & industrial air conditioning services solutions.',
  },
  {
    q: 'How do I book a service?',
    a: 'Use the Book a Service button on this page, then choose the best contact channel in the contact section.',
  },
  {
    q: 'What AC brands does ASHCOL service?',
    a: 'Our technicians are trained across all major residential and commercial brands including Carrier, Daikin, Panasonic, Samsung, LG, Koppel, Mitsubishi Electric, York, Gree, Midea, Sharp, Haier, TCL, Aux, Fuji-Aire, and Kolin — 16+ brands in total.',
  },
  {
    q: 'Do you offer emergency or same-day repair services?',
    a: 'Yes. We offer rapid response repair and diagnostics for urgent situations. Our team operates 7 days a week including holidays from 8:00 AM to 7:00 PM. Contact us directly for emergency scheduling.',
  },
  {
    q: 'Do you provide services outside Metro Manila?',
    a: 'Yes! ASHCOL operates 11 branches across Luzon — 8 owned branches (Taguig, Bulacan, Pampanga, Rizal, Laguna, Candelaria, Dasmariñas, and Silang) plus 3 franchise branches (Valenzuela, Batangas, and General Trias).',
  },
  {
    q: 'Is there a warranty on your services?',
    a: 'Yes. All ASHCOL services come with a workmanship warranty. Warranty terms vary by service type. Parts and equipment replacements are covered by their respective manufacturer warranties. Contact us for specific warranty details on your service.',
  },
  {
    q: 'Can ASHCOL handle large commercial or industrial AC projects?',
    a: 'Absolutely. We specialize in commercial and industrial air conditioning services installations including centralized systems, VRF/VRV multi-zone systems, chiller systems, custom ductwork fabrication, and large-scale electrical works for malls, restaurants, office buildings, hospitals, and factories.',
  },
  {
    q: 'How much does a typical AC service cost?',
    a: 'Service costs vary depending on the unit type, service required, and your location. General cleaning starts at competitive rates, while installations and repairs are quoted based on a site assessment. Create an account and submit a ticket to get a free estimate.',
  },
]

function ComingSoonModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-[#060E1A] border border-[#1E2D48] rounded-2xl shadow-2xl max-w-sm w-full p-7 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[#3A5070] hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center mx-auto mb-4">
          <Bell className="w-7 h-7 text-[#10B981]" />
        </div>
        <h3 className="text-xl font-black text-white mb-2">Coming Soon</h3>
        <p className="text-[#7A95B8] text-sm leading-relaxed mb-6">
          The ASHCOL mobile app is still in development. We will launch soon on Google Play and the App Store.
        </p>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-[#10B981] hover:bg-emerald-400 text-[#060B18] font-bold text-sm transition-all"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ─── Branch Cards ────────────────────────────────────────────────────────────

type BranchType = {
  name: string; tag: string; color: string; address: string;
  phones: string[]; email: string; mapUrl: string;
  landline?: string; isHQ?: boolean; region?: string; isFranchise?: boolean;
}
type ThemeTokens = Record<string, string>

/** Owned branch card — clean, minimal, focused */
function OwnedBranchCard({ branch, mapUrl, t }: { branch: BranchType; mapUrl: string; t: ThemeTokens }) {
  return (
    <div
      className="rounded-2xl flex flex-col gap-3 p-5 relative overflow-hidden transition-all hover:translate-y-[-2px]"
      style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}
    >
      {/* Left accent bar */}
      <div className="absolute top-0 left-0 w-[3px] h-full rounded-l-2xl" style={{ backgroundColor: branch.color }} />

      {/* Icon + tag row */}
      <div className="flex items-center gap-2 pl-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: branch.color + '18', color: branch.color }}>
          <Building2 className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: branch.color }}>{branch.tag}</div>
          {branch.isHQ && (
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#10B981' }}>Head Office</span>
          )}
        </div>
      </div>

      {/* Name */}
      <div className="pl-2">
        <div className="font-black text-[15px] leading-tight" style={{ color: t.text }}>{branch.name}</div>
        <div className="flex items-start gap-1.5 mt-1.5">
          <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: t.textFaint }} />
          <span className="text-[11px] leading-relaxed" style={{ color: t.textMuted }}>{branch.address}</span>
        </div>
      </div>

      {/* Contact row */}
      <div className="pl-2 flex items-center justify-between mt-auto pt-1" style={{ borderTop: `1px solid ${t.border}` }}>
        <a href={`tel:${(branch.phones[0] || '').replace(/\s/g, '')}`} className="flex items-center gap-1.5 group">
          <Phone className="w-3 h-3" style={{ color: branch.color }} />
          <span className="text-[11px] group-hover:underline" style={{ color: t.textMuted }}>{branch.phones[0]}</span>
        </a>
        <a href={mapUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-[10px] font-semibold transition-opacity opacity-60 hover:opacity-100"
          style={{ color: branch.color }}
        >
          Map <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

/** Franchise branch card — amber accent, distinct layout */
function FranchiseBranchCard({ branch, mapUrl, t }: { branch: BranchType; mapUrl: string; t: ThemeTokens }) {
  return (
    <div
      className="rounded-2xl flex flex-col gap-3 p-5 relative overflow-hidden flex-1 min-w-[220px] transition-all hover:translate-y-[-2px]"
      style={{
        backgroundColor: t.bgCard,
        border: '1px solid rgba(245,158,11,0.3)',
        background: t.bgCard === '#0F1A2E'
          ? 'linear-gradient(135deg, #0F1A2E 80%, rgba(245,158,11,0.04) 100%)'
          : 'linear-gradient(135deg, #ffffff 80%, rgba(245,158,11,0.04) 100%)'
      }}
    >
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #F59E0B, rgba(245,158,11,0.2))' }} />

      {/* Franchise badge + icon */}
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
          <Building2 className="w-4 h-4" />
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}>Franchise</span>
      </div>

      {/* Name + tag */}
      <div>
        <div className="font-black text-[15px] leading-tight" style={{ color: t.text }}>{branch.name}</div>
        <div className="text-[11px] font-semibold mt-0.5" style={{ color: '#F59E0B' }}>{branch.tag}</div>
        <div className="flex items-start gap-1.5 mt-2">
          <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: 'rgba(245,158,11,0.6)' }} />
          <span className="text-[11px] leading-relaxed" style={{ color: t.textMuted }}>{branch.address}</span>
        </div>
      </div>

      {/* Contact row */}
      <div className="flex items-center justify-between mt-auto pt-2" style={{ borderTop: '1px solid rgba(245,158,11,0.15)' }}>
        <a href={`tel:${(branch.phones[0] || '').replace(/\s/g, '')}`} className="flex items-center gap-1.5 group">
          <Phone className="w-3 h-3" style={{ color: '#F59E0B' }} />
          <span className="text-[11px] group-hover:underline" style={{ color: t.textMuted }}>{branch.phones[0]}</span>
        </a>
        <a href={mapUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-[10px] font-semibold transition-opacity opacity-60 hover:opacity-100"
          style={{ color: '#F59E0B' }}
        >
          Map <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Landing() {
  const [activeSection, setActiveSection] = useState('hero')
  const [hoveredService, setHoveredService] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [projectSlide, setProjectSlide] = useState(0)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const nextSlide = useCallback(() => setProjectSlide(s => (s + 1) % FEATURED_PROJECTS.length), [])
  const prevSlide = useCallback(() => setProjectSlide(s => (s - 1 + FEATURED_PROJECTS.length) % FEATURED_PROJECTS.length), [])

  useEffect(() => {
    const timer = setInterval(nextSlide, 5000)
    return () => clearInterval(timer)
  }, [nextSlide])

  // Theme tokens
  const t = {
    bg:         isDark ? '#060B18'              : '#F4FAF4',
    bgNav:      isDark ? 'rgba(6,11,24,0.92)'   : 'rgba(255,255,255,0.95)',
    bgCard:     isDark ? '#0F1A2E'              : '#FFFFFF',
    bgCardAlt:  isDark ? '#0C1426'              : '#EEF7EE',
    border:     isDark ? '#1E2D48'              : '#C8E6C8',
    borderNav:  isDark ? '#1a2844'              : '#D4EDD4',
    text:       isDark ? '#E2E8F0'              : '#0D2010',
    textMuted:  isDark ? '#7A95B8'              : '#3A6040',
    textFaint:  isDark ? '#3A5070'              : '#7AAA7A',
    accent:     '#10B981',
    accentBg:   isDark ? 'rgba(16,185,129,0.12)': 'rgba(16,185,129,0.10)',
  }

  const heroRef     = useRef<HTMLElement>(null)
  const servicesRef  = useRef<HTMLElement>(null)
  const showcaseRef  = useRef<HTMLElement>(null)
  const aboutRef    = useRef<HTMLElement>(null)
  const contactRef  = useRef<HTMLElement>(null)
  const clientsRef  = useRef<HTMLElement>(null)
  const faqRef      = useRef<HTMLElement>(null)

  const sectionRefs = {
    hero: heroRef,
    about: aboutRef,
    services: servicesRef,
    showcase: showcaseRef,
    contact: contactRef,
    faq: faqRef,
    clients: clientsRef,
  }

  // Highlight nav item based on scroll position
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id) })
      },
      { rootMargin: '-40% 0px -55% 0px' }
    )
    ;[heroRef, servicesRef, showcaseRef, aboutRef, contactRef, clientsRef, faqRef].forEach((r) => r.current && observer.observe(r.current))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (key: keyof typeof sectionRefs) => {
    setMobileMenuOpen(false)
    sectionRefs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navLinks = [
    { key: 'hero', label: 'Home' },
    { key: 'about', label: 'About Us' },
    { key: 'services', label: 'Services' },
    { key: 'contact', label: 'Contact Us' },
    { key: 'faq', label: 'FAQs' },
  ] as const

  return (
    <div className="min-h-screen overflow-x-hidden pt-16 font-['Inter',sans-serif] transition-colors duration-300" style={{ backgroundColor: t.bg, color: t.text }}>

      {/* ── Sticky Navbar ─────────────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
        style={{ backgroundColor: t.bgNav, borderBottom: `1px solid ${t.borderNav}`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <nav className="flex items-center justify-between px-4 md:px-11 lg:px-20 py-3">

          {/* Brand */}
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <img src={logoImg} alt="ASHCOL Logo" className="w-9 h-9 object-contain rounded-lg" />
            <div className="text-left">
              <div className="text-[16px] font-extrabold tracking-wide leading-none" style={{ color: t.text }}>ASHCOL</div>
              <div className="text-[9px] font-semibold leading-none mt-0.5 hidden sm:block" style={{ color: t.textFaint }}>Airconditioning Corp.</div>
            </div>
          </button>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => scrollTo(key)}
                className="text-sm font-medium transition-colors"
                style={{ color: activeSection === key ? t.accent : t.textMuted }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-3 sm:gap-4">

            {/* Theme toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all border"
              style={{ backgroundColor: t.accentBg, color: t.accent, borderColor: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.24)' }}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>


            {/* Login Link */}
            <a
              href={getPortalUrl('/login')}
              className="hidden sm:flex items-center justify-center min-w-[118px] px-7 py-2.5 text-sm font-bold text-white rounded-lg transition-all glow-green hover:opacity-95 active:scale-95"
              style={{ backgroundColor: t.accent }}
            >
              Login
            </a>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg transition-colors"
              style={{ color: t.textMuted }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden px-4 py-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${t.borderNav}` }}>
            {navLinks.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => scrollTo(key)}
                className="text-left text-sm font-semibold transition-colors py-1"
                style={{ color: activeSection === key ? t.accent : t.textMuted }}
              >
                {label}
              </button>
            ))}
            <div className="flex gap-2 mt-1">
              <a
                href={getPortalUrl('/login')}
                className="flex-1 flex items-center justify-center py-2.5 text-sm font-bold text-white rounded-lg transition-all glow-green"
                style={{ backgroundColor: t.accent }}
              >
                Login
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section id="hero" ref={heroRef} className="relative overflow-hidden flex flex-col items-center text-center px-4 md:px-11 lg:px-20 py-12 md:py-28" style={{ backgroundColor: t.bg }}>
        {/* Glow orbs */}
        <div className="absolute -top-20 -left-32 w-[480px] h-[480px] orb-green pointer-events-none" />
        <div className="absolute top-10 -right-36 w-[380px] h-[380px] orb-blue pointer-events-none" />

        {/* Badge */}
        <div className="relative flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] glow-green-sm inline-block" />
          <span className="text-[10px] sm:text-xs font-bold text-[#10B981] tracking-wide">ASHCOL Airconditioning · Since 2014</span>
        </div>

        {/* Headline */}
        <h1 className="relative max-w-3xl text-[clamp(1.65rem,7vw,4rem)] font-black leading-[1.12] tracking-tight mb-3" style={{ color: t.text }}>
          12+ Years of Expert{' '}
          <span className="text-[#10B981]">Air Conditioning Services.</span>
        </h1>

        <p className="relative text-base italic font-medium mb-4" style={{ color: t.textMuted }}>"Keeping YOU Cool"</p>

        <p className="relative max-w-xl text-[13px] sm:text-[14px] md:text-[17px] leading-relaxed mb-8" style={{ color: t.textMuted }}>
          Your trusted partner for installation, repair, and maintenance of air conditioning systems —
          residential and commercial, throughout Metro Manila.
        </p>

        {/* How it works — ABOVE the CTA */}
        <div className="relative w-full max-w-lg mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[2px] mb-3" style={{ color: t.textFaint }}>How it works</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { num: '1', label: 'Call or Message', sub: 'Use the contacts below' },
              { num: '2', label: 'Book a Service',  sub: 'Tell us your AC concern' },
              { num: '3', label: 'We Come to You',  sub: 'Our team handles the rest' },
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center rounded-xl px-2 py-3 sm:px-4 sm:py-4 gap-2" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.accentBg, border: `1px solid ${t.accent}40` }}>
                  <span className="font-black text-sm" style={{ color: t.accent }}>{step.num}</span>
                </div>
                <div>
                  <div className="text-[12px] sm:text-[13px] font-bold mb-0.5" style={{ color: t.text }}>{step.label}</div>
                  <div className="text-[10px] sm:text-[11px] leading-tight" style={{ color: t.textFaint }}>{step.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA — below steps */}
        <div className="relative w-full max-w-lg">
          <a
            href="#contact"
            className="flex items-center justify-center gap-2 w-full py-4 text-[15px] font-bold text-white bg-[#10B981] rounded-xl hover:bg-emerald-500 transition-all glow-green"
          >
            Book a Service
          </a>
        </div>

      </section>

      {/* ── Branch Locations ──────────────────────────────────────────────── */}
      <section className="py-14 md:py-20" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        <div className="px-4 md:px-11 lg:px-20 max-w-7xl mx-auto">

          {/* Section header */}
          <div className="mb-10">
            <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full mb-4 w-fit">
              <MapPin className="w-3 h-3 text-[#10B981]" />
              <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">OUR LOCATIONS</span>
            </div>
            <h2 className="text-[clamp(1.4rem,3vw,2.2rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>11 Branches Across Luzon</h2>
            <p className="text-[14px] mt-1" style={{ color: t.textMuted }}>8 company-owned branches &amp; 3 franchise partners nationwide.</p>
          </div>

          {/* ── Owned Branches ── */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1" style={{ backgroundColor: t.border }} />
              <span className="text-[10px] font-black uppercase tracking-widest px-3" style={{ color: t.textFaint }}>Company Branches</span>
              <div className="h-px flex-1" style={{ backgroundColor: t.border }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {BRANCHES.filter(b => !b.isFranchise).map((branch, i) => {
                const mapUrl = branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('ASHCOL Airconditioning ' + branch.name + ' ' + branch.address)}`
                return <OwnedBranchCard key={i} branch={branch} mapUrl={mapUrl} t={t} />
              })}
            </div>
          </div>

          {/* ── Franchise Branches ── */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1" style={{ backgroundColor: 'rgba(245,158,11,0.2)' }} />
              <span className="text-[10px] font-black uppercase tracking-widest px-3" style={{ color: '#F59E0B' }}>Franchise Partners</span>
              <div className="h-px flex-1" style={{ backgroundColor: 'rgba(245,158,11,0.2)' }} />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              {BRANCHES.filter(b => b.isFranchise).map((branch, i) => {
                const mapUrl = branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('ASHCOL Airconditioning ' + branch.name + ' ' + branch.address)}`
                return <FranchiseBranchCard key={i} branch={branch} mapUrl={mapUrl} t={t} />
              })}
            </div>
          </div>

        </div>
      </section>






      {/* ── About Us ────────────────────────────────────────────────────────── */}

      <section id="about" ref={aboutRef} className="px-4 md:px-11 lg:px-20 py-12 md:py-24" style={{ backgroundColor: t.bg }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center text-center mb-10">
            <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full mb-5">
              <Users className="w-3 h-3 text-[#10B981]" />
              <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">ABOUT US</span>
            </div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.5rem)] font-black leading-tight tracking-tight mb-6" style={{ color: t.text }}>
              A family business built on trust.
            </h2>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <p className="text-[15px] leading-relaxed mb-4" style={{ color: t.textMuted }}>
              <span className="font-semibold" style={{ color: t.text }}>ASHCOL Airconditioning Services Corporation</span> is a
              family-run business founded in 2014. The company name "ASHCOL" was formed from the names of the two
              lovely daughters — <span style={{ color: t.accent }}>Ashanti</span> and{' '}
              <span style={{ color: t.accent }}>Coleene</span>.
            </p>
            <p className="text-[15px] leading-relaxed mb-4" style={{ color: t.textMuted }}>
              Located at Units 2A &amp; 2B, 2/F Genesis Building, 182-A 19th Ave, East Rembo, Taguig — the team combines
              more than a decade of technical expertise with a deeply personal customer service philosophy.
            </p>
            <p className="text-[15px] leading-relaxed mb-7" style={{ color: t.textMuted }}>
              Their tagline{' '}
              <span className="italic" style={{ color: t.accent }}>"Keeping YOU Cool"</span>{' '}
              reflects their core belief: give people the comfort they deserve, and you will never have an unhappy customer.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {[{ icon: <MapPin className="w-4 h-4" style={{ color: t.accent }} />, label: 'Taguig, Metro Manila' },
                { icon: <Calendar className="w-4 h-4" style={{ color: t.accent }} />, label: 'Since 2014' },
                { icon: <ShieldCheck className="w-4 h-4" style={{ color: t.accent }} />, label: 'PCAB Licensed Contractor' }]
                .map((badge, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}>
                    {badge.icon}
                    <span className="text-[13px]" style={{ color: t.textMuted }}>{badge.label}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Download the App Banner ────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 md:px-11 lg:px-20 py-12 md:py-16" style={{ backgroundColor: t.bg, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        {/* Glow accents — only visible in dark mode */}
        {isDark && <>
          <div className="absolute -left-20 top-1/2 -translate-y-1/2 w-72 h-72 rounded-full opacity-10 pointer-events-none" style={{ background: 'radial-gradient(circle, #10B981, transparent 70%)', filter: 'blur(40px)' }} />
          <div className="absolute -right-20 top-1/2 -translate-y-1/2 w-72 h-72 rounded-full opacity-10 pointer-events-none" style={{ background: 'radial-gradient(circle, #3B82F6, transparent 70%)', filter: 'blur(40px)' }} />
        </>}

        <div className="relative max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-10">
          {/* Left: Text */}
          <div className="w-full lg:flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] px-3 py-1.5 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
              <span className="text-[10px] font-bold text-[#F59E0B] tracking-[2px]">COMING SOON</span>
            </div>
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-black leading-tight tracking-tight mb-3" style={{ color: t.text }}>
              Book AC services<br />
              <span className="text-[#10B981]">right from the app.</span>
            </h2>
            <p className="text-[14px] leading-relaxed max-w-md mx-auto lg:mx-0 mb-2" style={{ color: t.textMuted }}>
              The <span className="font-semibold" style={{ color: t.text }}>ASHCOL Service App</span> lets you submit a service request, track your ticket status in real time, and get notified when a technician is on the way — all from your phone.
            </p>
            <p className="text-[12px] mb-5" style={{ color: t.textFaint }}>Coming Soon</p>

            {/* Store Badges */}
            <div className="flex flex-row gap-2 sm:gap-3 items-stretch justify-center lg:justify-start">
              <button type="button" aria-label="Get it on Google Play"
                onClick={() => setShowComingSoon(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95 sm:min-w-[170px]"
                style={{ backgroundColor: isDark ? '#E2E8F0' : '#0D2010', color: isDark ? '#060B18' : '#E2E8F0' }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none">
                  <path d="M3.18 23.5c.3.17.65.19.97.06l12.45-7.2-2.88-2.88L3.18 23.5z" fill="#EA4335"/>
                  <path d="M22.26 10.6c-.44-.25-4.03-2.33-8.6-4.97L11 8.29l2.9 2.9 8.36-.59z" fill="#FBBC04"/>
                  <path d="M3.18.5C2.86.63 2.63.96 2.63 1.41v21.18c0 .45.23.78.55.91l10.54-10.54L3.18.5z" fill="#4285F4"/>
                  <path d="M22.26 13.4l-1.04.6-8.32-.59-2.9 2.9 2.66 2.66c4.57-2.64 8.16-4.72 8.6-4.97.72-.41.72-1.19 0-1.6z" fill="#34A853"/>
                </svg>
                <div className="text-left">
                  <div className="text-[9px] font-medium leading-none opacity-70">GET IT ON</div>
                  <div className="text-[12px] sm:text-[14px] font-black leading-tight">Google Play</div>
                </div>
              </button>

              <button type="button" aria-label="Download on the App Store"
                onClick={() => setShowComingSoon(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95 sm:min-w-[170px]"
                style={{ backgroundColor: isDark ? '#E2E8F0' : '#0D2010', color: isDark ? '#060B18' : '#E2E8F0' }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.22 1.3-2.2 3.88.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.33 2.6M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[9px] font-medium leading-none opacity-70">DOWNLOAD ON THE</div>
                  <div className="text-[12px] sm:text-[14px] font-black leading-tight">App Store</div>
                </div>
              </button>
            </div>
          </div>

          {/* Right: Feature pills */}
          <div className="w-full lg:flex-1 grid grid-cols-2 gap-2.5 sm:gap-3 lg:max-w-sm">
            {[
              { icon: <Calendar className="w-4 h-4" />, title: 'Book a Service', desc: 'Request cleaning, repair, or installation support' },
              { icon: <Clock className="w-4 h-4" />, title: 'Track in Real Time', desc: 'See your ticket status live as it updates' },
              { icon: <Bell className="w-4 h-4" />, title: 'Get Notified', desc: 'Alerts when a technician is assigned or en route' },
            ].map((feat, i) => (
              <div key={i} className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: t.accentBg, color: t.accent }}>{feat.icon}</div>
                <div className="text-[12px] sm:text-[13px] font-bold mb-0.5" style={{ color: t.text }}>{feat.title}</div>
                <div className="text-[11px] leading-tight" style={{ color: t.textFaint }}>{feat.desc}</div>
              </div>
            ))}
            <div className="rounded-xl p-3 sm:p-4 flex flex-col justify-center" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-[#10B981]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#10B981]">Coming Soon</span>
              </div>
              <div className="text-[12px] font-bold mb-0.5" style={{ color: t.text }}>Service App</div>
              <div className="text-[11px]" style={{ color: t.textMuted }}>Launching on Android &amp; iOS</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Core Values ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-11 lg:px-20 py-10 md:py-20" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        <div className="flex flex-col items-center text-center gap-4 mb-10">
          <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-3 h-3 text-[#10B981]" />
            <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">OUR VALUES</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>
            What drives us every day
          </h2>
          <p className="max-w-xl text-[15px] leading-relaxed" style={{ color: t.textMuted }}>
            Our <span className="font-semibold" style={{ color: t.text }}>mission</span> is to deliver high-quality, cost-effective AC solutions while maintaining a safe and healthy environment. Our <span className="font-semibold" style={{ color: t.text }}>vision</span> is to be the leading AC services provider in the Philippines.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 max-w-6xl mx-auto">
          {VALUES.map((v, i) => (
            <div key={i} className="rounded-2xl p-3 sm:p-5 flex flex-col gap-2 sm:gap-3 transition-all hover:shadow-lg group relative overflow-hidden"
              style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = v.color + '60'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = t.border}
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: v.color }} />
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: v.colorBg, color: v.color }}>
                {v.icon}
              </div>
              <div>
                <div className="text-[14px] font-bold mb-1.5" style={{ color: t.text }}>{v.title}</div>
                <div className="text-[11px] sm:text-[12px] leading-relaxed" style={{ color: t.textMuted }}>{v.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Services ────────────────────────────────────────────────────────── */}
      <section id="services" ref={servicesRef} className="px-4 md:px-11 lg:px-20 py-14 md:py-24" style={{ backgroundColor: t.bg }}>
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4 mb-12">
          <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] glow-green-sm inline-block" />
            <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">OUR SERVICES</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>
            Comprehensive AC solutions
          </h2>
          <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: t.textMuted }}>
            From first-time installation to routine maintenance — we handle every aspect of your air conditioning needs.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {SERVICES.map((svc, i) => (
            <div
              key={i}
              onMouseEnter={() => setHoveredService(i)}
              onMouseLeave={() => setHoveredService(null)}
              className="relative rounded-2xl p-4 sm:p-6 border overflow-hidden transition-all duration-300 cursor-default"
              style={{
                borderColor: hoveredService === i ? svc.colorBorder : t.border,
                boxShadow: hoveredService === i ? `0 16px 48px rgba(0,0,0,0.15)` : 'none',
                backgroundColor: hoveredService === i ? (isDark ? '#111E33' : '#F0FAF0') : t.bgCard,
              }}
            >
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: svc.color }} />

              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4"
                style={{ background: svc.colorBg }}
              >
                {svc.icon}
              </div>

              <h3 className="text-[17px] font-bold mb-2" style={{ color: t.text }}>{svc.title}</h3>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: t.textMuted }}>{svc.desc}</p>
              <div className="pt-4 flex flex-col gap-2" style={{ borderTop: `1px solid ${t.border}` }}>
                {svc.items.map((item, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5" style={{ color: svc.color }} />
                    <span className="text-[13px]" style={{ color: t.textMuted }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>



      {/* ── Featured Projects Slider ─────────────────────────────────────── */}
      <section id="showcase" ref={showcaseRef} className="px-4 md:px-11 lg:px-20 py-14 md:py-24" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        {/* Section header */}
        <div className="flex flex-col items-center text-center gap-4 mb-12">
          <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
            <Layers className="w-3 h-3 text-[#10B981]" />
            <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">FEATURED PROJECTS</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>
            Real jobs. Real results.
          </h2>
          <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: t.textMuted }}>
            From residential retrofits to large-scale commercial installations — see how ASHCOL delivers across every project type.
          </p>
          <Link
            to="/booking"
            className="flex items-center justify-center gap-2 px-6 py-3 text-[14px] font-bold text-white bg-[#10B981] rounded-xl hover:bg-emerald-500 transition-all glow-green"
          >
            <Calendar className="w-4 h-4" />
            Book a Service
          </Link>
        </div>

        {/* Slider */}
        <div className="max-w-6xl mx-auto">
          <div className="relative">
            {/* Card */}
            <div
              className="relative rounded-3xl overflow-hidden min-h-[420px] md:min-h-[480px] flex flex-col md:flex-row"
              style={{ border: `1px solid ${FEATURED_PROJECTS[projectSlide].accentColor}30` }}
            >
              {/* Left: Visual panel */}
              <div
                className="md:w-[42%] min-h-[200px] md:min-h-full relative flex flex-col items-center justify-center p-8 md:p-10"
                style={{ background: FEATURED_PROJECTS[projectSlide].gradient }}
              >
                {/* Glow orb */}
                <div
                  className="absolute inset-0 opacity-20 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 50% 40%, ${FEATURED_PROJECTS[projectSlide].accentColor}, transparent 65%)` }}
                />
                {/* Icon circle */}
                <div
                  className="relative w-24 h-24 rounded-full flex items-center justify-center mb-5 border-2"
                  style={{ backgroundColor: `${FEATURED_PROJECTS[projectSlide].accentColor}20`, borderColor: `${FEATURED_PROJECTS[projectSlide].accentColor}50`, color: FEATURED_PROJECTS[projectSlide].accentColor }}
                >
                  {FEATURED_PROJECTS[projectSlide].icon}
                </div>
                {/* Tag */}
                <span
                  className="relative text-[10px] font-black uppercase tracking-[2px] px-3 py-1.5 rounded-full border"
                  style={{ color: FEATURED_PROJECTS[projectSlide].accentColor, backgroundColor: FEATURED_PROJECTS[projectSlide].tagBg, borderColor: `${FEATURED_PROJECTS[projectSlide].accentColor}40` }}
                >
                  {FEATURED_PROJECTS[projectSlide].tag}
                </span>
                {/* Slide counter */}
                <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-1.5">
                  {FEATURED_PROJECTS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setProjectSlide(i)}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: i === projectSlide ? '20px' : '6px',
                        height: '6px',
                        backgroundColor: i === projectSlide ? FEATURED_PROJECTS[projectSlide].accentColor : 'rgba(255,255,255,0.25)',
                      }}
                      aria-label={`Go to project ${i + 1}`}
                    />
                  ))}
                </div>
              </div>

              {/* Right: Info panel */}
              <div
                className="flex-1 p-6 sm:p-8 md:p-10 flex flex-col justify-between"
                style={{ backgroundColor: t.bgCard }}
              >
                {/* Title + type */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[2px] mb-2" style={{ color: FEATURED_PROJECTS[projectSlide].accentColor }}>
                    {FEATURED_PROJECTS[projectSlide].type}
                  </div>
                  <h3 className="text-[clamp(1.3rem,2.5vw,1.85rem)] font-black leading-tight tracking-tight mb-3" style={{ color: t.text }}>
                    {FEATURED_PROJECTS[projectSlide].title}
                  </h3>
                  <div className="flex items-center gap-1.5 mb-4">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.textFaint }} />
                    <span className="text-[13px]" style={{ color: t.textFaint }}>{FEATURED_PROJECTS[projectSlide].location}</span>
                  </div>
                  <p className="text-[14px] leading-relaxed mb-6" style={{ color: t.textMuted }}>
                    {FEATURED_PROJECTS[projectSlide].scope}
                  </p>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {FEATURED_PROJECTS[projectSlide].stats.map((stat, i) => (
                      <div
                        key={i}
                        className="rounded-xl p-3 sm:p-4 flex flex-col gap-0.5"
                        style={{ backgroundColor: isDark ? '#060B18' : '#EEF7EE', border: `1px solid ${t.border}` }}
                      >
                        <div className="text-[15px] sm:text-[17px] font-black tracking-tight" style={{ color: FEATURED_PROJECTS[projectSlide].accentColor }}>{stat.value}</div>
                        <div className="text-[10px] sm:text-[11px] font-medium leading-tight" style={{ color: t.textFaint }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Navigation controls */}
                <div className="flex items-center justify-between mt-7 pt-5" style={{ borderTop: `1px solid ${t.border}` }}>
                  <span className="text-[12px] font-semibold" style={{ color: t.textFaint }}>
                    {projectSlide + 1} / {FEATURED_PROJECTS.length}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={prevSlide}
                      className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-80 active:scale-95"
                      style={{ backgroundColor: t.accentBg, color: t.accent, border: `1px solid ${t.border}` }}
                      aria-label="Previous project"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={nextSlide}
                      className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-80 active:scale-95"
                      style={{ backgroundColor: t.accentBg, color: t.accent, border: `1px solid ${t.border}` }}
                      aria-label="Next project"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trusted Clients ──────────────────────────────────────────── */}
      <section id="clients" ref={clientsRef as React.RefObject<HTMLElement>} className="px-4 md:px-11 lg:px-20 py-12 md:py-20" style={{ backgroundColor: t.bg }}>
        <div className="flex flex-col items-center text-center gap-4 mb-10">
          <div className="flex items-center gap-2 bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.25)] px-3 py-1.5 rounded-full">
            <Briefcase className="w-3 h-3 text-[#3B82F6]" />
            <span className="text-[10px] font-bold text-[#3B82F6] tracking-[2px]">TRUSTED BY</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>Clients who trust ASHCOL</h2>
          <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: t.textMuted }}>From fast food chains to banking institutions and luxury residential towers — ASHCOL is the trusted AC partner across Metro Manila.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 max-w-5xl mx-auto">
          {CLIENTS.map((client, i) => (
            <div key={i} className="rounded-xl px-4 py-3 flex items-center gap-2.5 transition-all group" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#3B82F640'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = t.border}
            >
              <Check className="w-3.5 h-3.5 text-[#3B82F6] flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
              <span className="text-[13px] font-medium truncate" style={{ color: t.textMuted }}>{client}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── AC Brands Serviced ───────────────────────────────────────── */}
      <section className="px-4 md:px-11 lg:px-20 py-12 md:py-16" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 max-w-5xl mx-auto mb-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[3px] mb-1 text-[#10B981]">We Service All Major Brands</p>
            <h3 className="text-[20px] md:text-[24px] font-black" style={{ color: t.text }}>16+ AC Brands Supported</h3>
          </div>
          <p className="text-[13px] max-w-xs text-center sm:text-right" style={{ color: t.textMuted }}>
            Carrier to Kolin — our technicians are trained across all major residential and commercial AC brands.
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-w-5xl mx-auto">
          {BRANDS.map((brand, i) => (
            <div key={i} className="rounded-2xl p-4 flex flex-col items-center gap-3 transition-all group cursor-default" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#10B98140'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = t.border}
            >
              {/* White logo pad */}
              <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center p-2 shadow-sm flex-shrink-0">
                {brand.logo ? (
                  <img
                    src={brand.logo}
                    alt={brand.name}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement
                      img.style.display = 'none'
                      const pad = img.parentElement!
                      pad.classList.add('bg-opacity-10')
                      pad.className = 'w-14 h-14 rounded-xl bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.2)] flex items-center justify-center text-center p-2'
                      const span = document.createElement('span')
                      span.textContent = brand.name
                      span.style.cssText = 'font-size:8px;font-weight:900;color:#10B981;text-align:center;line-height:1.2;padding:2px'
                      pad.appendChild(span)
                    }}
                  />
                ) : (
                  /* No logo available — stylized text badge */
                  <span className="text-[8px] font-black text-[#3A5070] text-center leading-tight tracking-wide uppercase px-1">{brand.name}</span>
                )}
              </div>
              <span className="text-[10px] font-bold text-[#3A5070] group-hover:text-[#7A95B8] transition-colors text-center leading-tight">{brand.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Branch section removed — now shown as scrollable strip below hero */}

      {/* ── Contact Us ────────────────────────────────────────────────────────── */}
      <section id="contact" ref={contactRef} className="px-4 md:px-11 lg:px-20 py-12 md:py-20" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center text-center gap-4 mb-10">
            <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
              <Headset className="w-3 h-3 text-[#10B981]" />
              <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">CONTACT US</span>
            </div>
            <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>Get in Touch</h2>
            <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: t.textMuted }}>
              Have questions or ready to book a service? Reach out to us through any of these channels.
            </p>
          </div>

          {/* Contact card */}
          <div className="max-w-2xl mx-auto rounded-2xl overflow-hidden" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}>
            <div className="flex flex-col">
              {CONTACTS.map((c, i) => (
                <a
                  key={i}
                  href={c.href}
                  className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 transition-colors group"
                  style={{ borderBottom: `1px solid ${t.border}` }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#111E33' : '#EEF7EE'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.accentBg, color: t.accent }}>
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: t.textFaint }}>{c.label}</div>
                    <div className="text-[12px] sm:text-[13px] break-words sm:truncate" style={{ color: t.textMuted }}>{c.value}</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4" style={{ color: t.textFaint }} />
                </a>
              ))}
            </div>
            <div className="flex items-center gap-3 px-4 sm:px-6 py-4" style={{ borderBottom: `1px solid ${t.border}` }}>
              <Clock className="w-4 h-4" style={{ color: t.accent }} />
              <span className="text-[13px]" style={{ color: t.textMuted }}>Open 7 days a week · 8:00 AM – 7:00 PM (Including Holidays)</span>
            </div>
            <div className="px-4 sm:px-6 py-4">
              <a
                href="https://www.facebook.com/AshcolCorp"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] transition-colors text-white text-sm font-bold"
              >
                <MessageSquare className="w-4 h-4" /> Message us on Facebook
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" ref={faqRef} className="px-4 md:px-11 lg:px-20 py-14 md:py-24" style={{ backgroundColor: t.bg, borderTop: `1px solid ${t.border}` }}>
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-4 mb-12">
            <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
              <MessageSquare className="w-3 h-3 text-[#10B981]" />
              <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">FAQ</span>
            </div>
            <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>
              Frequently asked questions
            </h2>
            <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: t.textMuted }}>
              Everything you need to know before booking your first service with ASHCOL.
            </p>
          </div>

          {/* Accordion */}
          <div className="flex flex-col gap-3">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden transition-all duration-200"
                style={{ border: `1px solid ${openFaq === i ? t.accent + '50' : t.border}`, backgroundColor: t.bgCard }}
              >
                <button
                  id={`faq-btn-${i}`}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5 text-left group"
                >
                  <span
                    className="text-[14px] sm:text-[15px] font-semibold leading-snug transition-colors"
                    style={{ color: openFaq === i ? t.accent : t.text }}
                  >
                    {faq.q}
                  </span>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300"
                    style={{
                      backgroundColor: openFaq === i ? t.accentBg : (isDark ? '#0F1A2E' : '#EEF7EE'),
                      color: openFaq === i ? t.accent : t.textFaint,
                      transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                </button>
                {openFaq === i && (
                  <div
                    className="px-5 sm:px-6 pb-5 text-[13px] sm:text-[14px] leading-relaxed"
                    style={{ color: t.textMuted, borderTop: `1px solid ${t.border}`, paddingTop: '16px' }}
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom nudge */}
          <div className="mt-10 text-center">
            <p className="text-[14px]" style={{ color: t.textMuted }}>
              Still have questions?{' '}
              <a href="mailto:headoffice@ashcol.com.ph" className="font-semibold hover:underline" style={{ color: t.accent }}>
                Email us directly
              </a>
              {' '}or call{' '}
              <a href="tel:+639177143810" className="font-semibold hover:underline" style={{ color: t.accent }}>
                +63 (917) 7143810
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-5 md:px-11 lg:px-20 py-16 md:py-24 flex flex-col items-center text-center" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        <div className="absolute inset-0 orb-green opacity-30 pointer-events-none" />
        <img src={logoImg} alt="ASHCOL" className="w-14 h-14 object-contain rounded-md mb-5 relative" />
        <h2 className="relative text-[clamp(1.4rem,4vw,2.5rem)] font-black leading-tight tracking-tight mb-3" style={{ color: t.text }}>
          Ready to stay cool?<br />Book a service today.
        </h2>
        <p className="relative max-w-md text-[14px] md:text-[15px] leading-relaxed mb-7" style={{ color: t.textMuted }}>
          Residential or commercial — our team is ready to help, 7 days a week.
        </p>
        <div className="relative w-full max-w-lg mx-auto">
          <div className="flex justify-center w-full">
            <a
              href="#contact"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 text-[14px] font-bold text-white bg-[#10B981] rounded-xl hover:bg-emerald-500 transition-all glow-green sm:min-w-[220px]"
            >
              Book a Service
            </a>
          </div>
        </div>
      </section>

      {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="px-4 md:px-11 lg:px-20 pt-10 pb-8" style={{ backgroundColor: t.bg, borderTop: `1px solid ${t.border}` }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 mb-8 max-w-6xl mx-auto">

          {/* Brand */}
          <div className="flex items-center gap-3 sm:col-span-2 md:col-span-1">
            <img src={logoImg} alt="ASHCOL" className="w-11 h-11 object-contain rounded-xl flex-shrink-0" />
            <div>
              <div className="text-[15px] font-bold leading-tight" style={{ color: t.text }}>ASHCOL Airconditioning</div>
              <div className="text-[12px] italic mt-0.5" style={{ color: t.textFaint }}>"Keeping YOU Cool" since 2014</div>
            </div>
          </div>

          {/* Quick info */}
          <div className="flex flex-col gap-3 text-[13px]" style={{ color: t.textFaint }}>
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: t.accent }} />
              <span className="leading-snug">Units 2A &amp; 2B, 2/F, Genesis Building,<br />182-A 19th Ave, East Rembo, Taguig City</span>
            </div>
            <div className="flex items-center gap-2.5">
              <PhoneCall className="w-4 h-4 flex-shrink-0" style={{ color: t.accent }} />
              <span>+63 (917) 7143810</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 flex-shrink-0" style={{ color: t.accent }} />
              <span className="break-all">headoffice@ashcol.com.ph</span>
            </div>
          </div>

          {/* Quick Links + App */}
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>Quick Links</div>
            <a href="#contact" className="text-[13px] transition-colors hover:text-[#10B981]" style={{ color: t.textFaint }}>Book a Service</a>
          </div>
        </div>

        <div className="pt-6 text-center text-[12px]" style={{ borderTop: `1px solid ${t.border}`, color: t.textFaint }}>
          © 2026 ASHCOL Airconditioning Services Corporation. All rights reserved.
        </div>
      </footer>

    </div>
  )
}
