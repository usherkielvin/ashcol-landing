import React, { useEffect, useRef, useState } from 'react'
import { 
  Wrench, Settings as ConfigIcon, TrendingUp, PhoneCall, Smartphone, Headset, 
  Mail, Award, Calendar, Clock, Star, MapPin, Check, Camera, MessageSquare,
  Users, ArrowUpRight, Menu, X, Building2, Zap, Wind, ShieldCheck, Target, Heart, Briefcase, Bell,
  Sun, Moon
} from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import showcaseMain from '../assets/ash.jpg'
import showcaseSide from '../assets/red.jpg'

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
  { icon: <PhoneCall className="w-4 h-4" />, label: 'Customer Hotline',   value: '+63 (2) 77291293',              href: 'tel:+63277291293' },
  { icon: <Wrench className="w-4 h-4" />,    label: 'Service / Technical', value: '+63 (2) 77541418',              href: 'tel:+63277541418' },
  { icon: <Smartphone className="w-4 h-4" />,label: 'Mobile (Globe)',       value: '+63 (917) 7143810',             href: 'tel:+639177143810' },
  { icon: <Headset className="w-4 h-4" />,   label: 'Express Assist',       value: '+63 (2) 79590289',              href: 'tel:+63279590289' },
  { icon: <Mail className="w-4 h-4" />,      label: 'Head Office Email',    value: 'headoffice@ashcol.com.ph',      href: 'mailto:headoffice@ashcol.com.ph' },
  { icon: <Mail className="w-4 h-4" />,      label: 'Service Email',        value: 'ashcol_service@hotmail.com',    href: 'mailto:ashcol_service@hotmail.com' },
]

const STATS = [
  { value: '2014',    label: 'Established',       icon: <Award className="w-5 h-5" /> },
  { value: '7 days',  label: 'Open Mon–Sun',       icon: <Calendar className="w-5 h-5" /> },
  { value: '8am–7pm', label: 'Business Hours',     icon: <Clock className="w-5 h-5" /> },
  { value: '10yr+',   label: 'In the Industry',    icon: <Star className="w-5 h-5" /> },
]

const BRANCHES = [
  { name: 'Head Office', address: 'Units 2A & 2B, 2/F, Genesis Building, 182-A 19th Ave, East Rembo, Taguig City', tag: 'Taguig', color: '#10B981', mapUrl: 'https://maps.app.goo.gl/pPJhEaXBEtxjbNN29' },
  { name: 'Valenzuela Branch', address: 'Valenzuela City, Metro Manila', tag: 'Valenzuela', color: '#6366F1' },
  { name: 'Batangas Branch', address: '012 Laguile, Taal, Batangas', tag: 'Batangas', color: '#3B82F6' },
  { name: 'Bulacan Branch', address: 'Bulacan', tag: 'Bulacan', color: '#F59E0B' },
  { name: 'San Fernando Branch', address: 'San Fernando, Pampanga', tag: 'Pampanga', color: '#14B8A6' },
  { name: 'Candelaria Branch', address: 'Candelaria, Quezon Province', tag: 'Quezon', color: '#EF4444' },
  { name: 'Calauan Branch', address: 'Calauan, Laguna', tag: 'Laguna', color: '#8B5CF6' },
  { name: 'Rodriguez Branch', address: 'Rodriguez, Rizal', tag: 'Rizal', color: '#F97316' },
  { name: 'Gen. Trias branch', address: 'Blk 4 & 6 South Square Village, Pasong Kawayan, Gen. Trias, Cavite', tag: 'Gen. Trias', color: '#A855F7' },
  { name: 'Silang Branch', address: 'Silang, Cavite', tag: 'Silang', color: '#EC4899' },
  { name: 'Dasmariñas Branch', address: 'Dasmariñas, Cavite', tag: 'Dasmariñas', color: '#06B6D4' },
]

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
  { name: 'Aux',                 logo: undefined },
  { name: 'Haier',               logo: getBrandLogo('Haier') },
  { name: 'TCL',                 logo: getBrandLogo('TCL') },
  { name: 'Fuji-Aire',           logo: undefined },
  { name: 'Kolin',               logo: undefined },
]

const VALUES = [
  { icon: <ShieldCheck className="w-5 h-5" />, title: 'Integrity',       desc: 'We do what is right — always honest, always transparent.',          color: '#10B981', colorBg: 'rgba(16,185,129,0.12)' },
  { icon: <Star className="w-5 h-5" />,        title: 'Excellence',      desc: 'We hold ourselves to the highest standard in every service.',       color: '#F59E0B', colorBg: 'rgba(245,158,11,0.12)' },
  { icon: <Users className="w-5 h-5" />,       title: 'Customer Focus',  desc: 'Your comfort is our priority, before and after every job.',         color: '#3B82F6', colorBg: 'rgba(59,130,246,0.12)' },
  { icon: <Heart className="w-5 h-5" />,       title: 'Teamwork',        desc: 'A collaborative team that delivers consistent results.',            color: '#EF4444', colorBg: 'rgba(239,68,68,0.12)' },
  { icon: <Target className="w-5 h-5" />,      title: 'Commitment',      desc: 'We stand behind our work with dedication and accountability.',      color: '#8B5CF6', colorBg: 'rgba(139,92,246,0.12)' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function Landing() {
  const [activeSection, setActiveSection] = useState('hero')
  const [hoveredService, setHoveredService] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(true)

  // Theme tokens
  const t = {
    bg:         isDark ? '#060B18'              : '#F4FAF4',
    bgNav:      isDark ? 'rgba(6,11,24,0.92)'   : 'rgba(255,255,255,0.95)',
    bgCard:     isDark ? '#0F1A2E'              : '#FFFFFF',
    bgCardAlt:  isDark ? '#0C1426'              : '#EEF7EE',
    border:     isDark ? '#1E2D48'              : '#C8E6C8',
    borderNav:  isDark ? '#1a2844'              : '#D4EDD4',
    text:       isDark ? '#F0F6FF'              : '#0D2010',
    textMuted:  isDark ? '#7A95B8'              : '#3A6040',
    textFaint:  isDark ? '#3A5070'              : '#7AAA7A',
    accent:     '#10B981',
    accentBg:   isDark ? 'rgba(16,185,129,0.12)': 'rgba(16,185,129,0.10)',
  }

  const heroRef     = useRef<HTMLElement>(null)
  const servicesRef  = useRef<HTMLElement>(null)
  const showcaseRef  = useRef<HTMLElement>(null)
  const aboutRef    = useRef<HTMLElement>(null)
  const clientsRef  = useRef<HTMLElement>(null)

  const sectionRefs = { hero: heroRef, services: servicesRef, showcase: showcaseRef, about: aboutRef, clients: clientsRef }

  // Highlight nav item based on scroll position
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id) })
      },
      { rootMargin: '-40% 0px -55% 0px' }
    )
    ;[heroRef, servicesRef, showcaseRef, aboutRef, clientsRef].forEach((r) => r.current && observer.observe(r.current))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (key: keyof typeof sectionRefs) => {
    setMobileMenuOpen(false)
    sectionRefs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navLinks = [
    { key: 'services',  label: 'Services' },
    { key: 'showcase',  label: 'Showcase' },
    { key: 'clients',   label: 'Clients' },
    { key: 'about',     label: 'About Us' },
  ] as const

  return (
    <div className="min-h-screen font-['Inter',sans-serif] transition-colors duration-300" style={{ backgroundColor: t.bg, color: t.text }}>

      {/* ── Sticky Navbar ─────────────────────────── */}
      <div
        className="sticky top-0 z-50 transition-colors duration-300"
        style={{ backgroundColor: t.bgNav, borderBottom: `1px solid ${t.borderNav}`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <nav className="flex items-center justify-between px-4 md:px-11 lg:px-20 py-3">

          {/* Brand */}
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <img src={logoImg} alt="Ashcol Logo" className="w-9 h-9 object-contain rounded-lg" />
            <div className="text-left">
              <div className="text-[16px] font-extrabold tracking-wide leading-none" style={{ color: t.text }}>Ashcol</div>
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
          <div className="flex items-center gap-2">

            {/* Theme toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
              style={{ backgroundColor: t.accentBg, color: t.accent }}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Login link */}
            <a
              href="/login"
              className="hidden sm:flex items-center text-sm font-semibold px-3 py-2 rounded-lg transition-all"
              style={{ color: t.textMuted }}
            >
              Sign In
            </a>

            {/* Book a Service CTA */}
            <a
              href="/create-account"
              className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg transition-all glow-green"
              style={{ backgroundColor: t.accent }}
            >
              Book a Service
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
          <div className="md:hidden px-5 py-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${t.borderNav}` }}>
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
                href="/login"
                className="flex-1 flex items-center justify-center py-2.5 text-sm font-semibold rounded-lg border transition-all"
                style={{ color: t.text, borderColor: t.border }}
              >
                Sign In
              </a>
              <a
                href="/create-account"
                className="flex-1 flex items-center justify-center py-2.5 text-sm font-bold text-white rounded-lg transition-all"
                style={{ backgroundColor: t.accent }}
              >
                Book a Service
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section id="hero" ref={heroRef} className="relative overflow-hidden flex flex-col items-center text-center px-5 md:px-11 lg:px-20 py-14 md:py-28" style={{ backgroundColor: t.bg }}>
        {/* Glow orbs */}
        <div className="absolute -top-20 -left-32 w-[480px] h-[480px] orb-green pointer-events-none" />
        <div className="absolute top-10 -right-36 w-[380px] h-[380px] orb-blue pointer-events-none" />

        {/* Badge */}
        <div className="relative flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] glow-green-sm inline-block" />
          <span className="text-[10px] sm:text-xs font-bold text-[#10B981] tracking-wide">Ashcol Airconditioning · Since 2014</span>
        </div>

        {/* Headline */}
        <h1 className="relative max-w-3xl text-[clamp(1.85rem,7vw,4rem)] font-black leading-[1.12] tracking-tight mb-3" style={{ color: t.text }}>
          12+ Years of Expert{' '}
          <span className="text-[#10B981]">Air Conditioning Services.</span>
        </h1>

        <p className="relative text-base italic font-medium mb-4" style={{ color: t.textMuted }}>"Keeping YOU Cool"</p>

        <p className="relative max-w-xl text-[14px] md:text-[17px] leading-relaxed mb-8" style={{ color: t.textMuted }}>
          Your trusted partner for installation, repair, and maintenance of air conditioning systems —
          residential and commercial, throughout Metro Manila.
        </p>

        {/* How it works — ABOVE the CTA */}
        <div className="relative w-full max-w-lg mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[2px] mb-3" style={{ color: t.textFaint }}>How it works</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { num: '1', label: 'Sign Up',        sub: 'Create your free account' },
              { num: '2', label: 'Book a Service', sub: 'Pick a date & AC service' },
              { num: '3', label: 'We Come to You', sub: 'Our team handles the rest' },
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
            href="/create-account"
            className="flex items-center justify-center gap-2 w-full py-4 text-[15px] font-bold text-white bg-[#10B981] rounded-xl hover:bg-emerald-500 transition-all glow-green"
          >
            Book a Service Now
          </a>

        </div>

      </section>



      {/* ── Download the App Banner ────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-5 md:px-11 lg:px-20 py-12 md:py-16" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
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
              The <span className="font-semibold" style={{ color: t.text }}>Ashcol Service App</span> lets you submit a service request, track your ticket status in real time, and get notified when a technician is on the way — all from your phone.
            </p>
            <p className="text-[12px] mb-5" style={{ color: t.textFaint }}>Coming Soon</p>

            {/* Store Badges — full width on mobile, auto on sm+ */}
            <div className="flex flex-row gap-2 sm:gap-3 items-stretch justify-center lg:justify-start">
              <button type="button" aria-label="Get it on Google Play"
                onClick={() => setShowComingSoon(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95 sm:min-w-[170px]"
                style={{ backgroundColor: isDark ? '#F0F6FF' : '#0D2010', color: isDark ? '#060B18' : '#F0F6FF' }}
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
                style={{ backgroundColor: isDark ? '#F0F6FF' : '#0D2010', color: isDark ? '#060B18' : '#F0F6FF' }}
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
          <div className="w-full lg:flex-1 grid grid-cols-2 gap-3 lg:max-w-sm">
            {[
              { icon: <Calendar className="w-4 h-4" />, title: 'Book a Service', desc: 'Request cleaning, repair, or installation in seconds' },
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

      {/* ── Stats Bar ───────────────────────────────────────────────────────── */}
      <div className="w-full overflow-x-hidden" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        <div className="grid w-full max-w-full grid-cols-2 md:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={i}
              className="min-w-0 flex flex-col items-center gap-1 py-5 px-3 sm:px-4"
              style={{
                borderRight: i % 2 === 0 ? `1px solid ${t.border}` : undefined,
                borderBottom: i < 2 ? `1px solid ${t.border}` : undefined,
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1" style={{ backgroundColor: t.accentBg, color: t.accent }}>
                {s.icon}
              </div>
              <span className="text-lg font-black tracking-tight" style={{ color: t.text }}>{s.value}</span>
              <span className="text-[10px] tracking-wide uppercase text-center" style={{ color: t.textFaint }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

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

      {/* ── Showcase ────────────────────────────────────────────────────────── */}
      <section id="showcase" ref={showcaseRef} className="px-4 md:px-11 lg:px-20 py-14 md:py-24" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        <div className="flex flex-col items-center text-center gap-4 mb-12">
          <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
            <Camera className="w-3 h-3 text-[#10B981]" />
            <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">OUR SHOWCASE</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-bold leading-tight tracking-tight" style={{ color: t.text }}>
            Experience and Quality in Action
          </h2>
          <p className="max-w-md text-[15px]" style={{ color: t.textMuted }}>Take a look at our professional team and project sites.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 max-w-6xl mx-auto">
          {/* Main image */}
          <div className="flex-[2] min-h-[300px] lg:min-h-[450px] rounded-3xl overflow-hidden relative" style={{ border: `1px solid ${t.border}` }}>
            <img src={showcaseMain} alt="Quality Assurance" className="w-full h-full object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/60 to-transparent">
              <span className="text-white text-sm font-bold tracking-widest uppercase">Quality Assurance</span>
            </div>
          </div>

          {/* Side column */}
          <div className="flex-1 flex flex-col gap-5">
            {/* Side image */}
            <div className="h-[220px] rounded-3xl overflow-hidden relative" style={{ border: `1px solid ${t.border}` }}>
              <img src={showcaseSide} alt="Service Excellence" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                <span className="text-white text-sm font-bold tracking-widest uppercase">Service Excellence</span>
              </div>
            </div>

            {/* Quote box */}
            <div className="flex-1 rounded-3xl p-6 flex flex-col justify-center gap-3" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}>
              <MessageSquare className="w-6 h-6" style={{ color: t.accent }} />
              <p className="text-base leading-relaxed italic" style={{ color: t.text }}>
                "Providing the right comfort people deserve since 2014."
              </p>
              <p className="text-sm font-medium" style={{ color: t.textFaint }}>— Ashcol Management</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── About Us ────────────────────────────────────────────────────────── */}
      <section id="about" ref={aboutRef} className="px-4 md:px-11 lg:px-20 py-14 md:py-24" style={{ backgroundColor: t.bg }}>
        <div className="flex flex-col lg:flex-row gap-10 max-w-6xl mx-auto items-start">
          {/* Text side */}
          <div className="flex-1">
            <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full mb-5 w-fit">
              <Users className="w-3 h-3 text-[#10B981]" />
              <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">ABOUT US</span>
            </div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.5rem)] font-black leading-tight tracking-tight mb-6" style={{ color: t.text }}>
              A family business<br />built on trust.
            </h2>
            <p className="text-[15px] leading-relaxed mb-4" style={{ color: t.textMuted }}>
              <span className="font-semibold" style={{ color: t.text }}>ASHCOL Airconditioning Services Corporation</span> is a
              family-run business founded in 2014. The company name "ASHCOL" was formed from the names of the two
              lovely daughters — <span style={{ color: t.accent }}>Ashanti</span> and{' '}
              <span style={{ color: t.accent }}>Coleene</span>.
            </p>
            <p className="text-[15px] leading-relaxed mb-4" style={{ color: t.textMuted }}>
              Located at Units 2A &amp; 2B, 2/F Genesis Building, 182-A 19th Ave, East Rembo, Taguig City — the team combines
              more than a decade of technical expertise with a deeply personal customer service philosophy.
            </p>
            <p className="text-[15px] leading-relaxed mb-7" style={{ color: t.textMuted }}>
              Their tagline{' '}
              <span className="italic" style={{ color: t.accent }}>"Keeping YOU Cool"</span>{' '}
              reflects their core belief: give people the comfort they deserve, and you will never have an unhappy customer.
            </p>
            <div className="flex flex-wrap gap-3">
              {[{ icon: <MapPin className="w-4 h-4" style={{ color: t.accent }} />, label: 'Taguig City, Metro Manila' },
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

          {/* Contact card */}
          <div className="flex-1 rounded-2xl overflow-hidden" style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}>
            <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: `1px solid ${t.border}` }}>
              <Headset className="w-5 h-5" style={{ color: t.accent }} />
              <span className="text-base font-bold" style={{ color: t.text }}>Get in Touch</span>
            </div>
            <div className="flex flex-col">
              {CONTACTS.map((c, i) => (
                <a
                  key={i}
                  href={c.href}
                  className="flex items-center gap-4 px-6 py-4 transition-colors group"
                  style={{ borderBottom: `1px solid ${t.border}` }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#111E33' : '#EEF7EE'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.accentBg, color: t.accent }}>
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: t.textFaint }}>{c.label}</div>
                    <div className="text-[13px] truncate" style={{ color: t.textMuted }}>{c.value}</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4" style={{ color: t.textFaint }} />
                </a>
              ))}
            </div>
            <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: `1px solid ${t.border}` }}>
              <Clock className="w-4 h-4" style={{ color: t.accent }} />
              <span className="text-[13px]" style={{ color: t.textMuted }}>Open 7 days a week · 8:00 AM – 7:00 PM (Including Holidays)</span>
            </div>
            <div className="px-6 py-4">
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

      {/* ── Core Values ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-11 lg:px-20 py-12 md:py-20" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
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
            <div key={i} className="rounded-2xl p-5 flex flex-col gap-3 transition-all hover:shadow-lg group relative overflow-hidden"
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
                <div className="text-[12px] leading-relaxed" style={{ color: t.textMuted }}>{v.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trusted Clients ──────────────────────────────────────────── */}
      <section id="clients" ref={clientsRef as React.RefObject<HTMLElement>} className="px-4 md:px-11 lg:px-20 py-12 md:py-20" style={{ backgroundColor: t.bg }}>
        <div className="flex flex-col items-center text-center gap-4 mb-10">
          <div className="flex items-center gap-2 bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.25)] px-3 py-1.5 rounded-full">
            <Briefcase className="w-3 h-3 text-[#3B82F6]" />
            <span className="text-[10px] font-bold text-[#3B82F6] tracking-[2px]">TRUSTED BY</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>Clients who trust Ashcol</h2>
          <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: t.textMuted }}>From fast food chains to banking institutions and luxury residential towers — Ashcol is the trusted AC partner across Metro Manila.</p>
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
            <p className="text-[11px] font-bold uppercase tracking-[3px] mb-1" style={{ color: t.textFaint }}>We Service All Major Brands</p>
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

      {/* ── Branch Locations ────────────────────────────────────────── */}
      <section className="px-4 md:px-11 lg:px-20 py-14 md:py-20" style={{ backgroundColor: t.bg }}>
        <div className="flex flex-col items-center text-center gap-4 mb-10">
          <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
            <MapPin className="w-3 h-3 text-[#10B981]" />
            <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">OUR LOCATIONS</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight" style={{ color: t.text }}>11 Branches Across Luzon</h2>
          <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: t.textMuted }}>With our head office in Taguig and branches expanding across Luzon, we're always nearby.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 max-w-6xl mx-auto">
          {BRANCHES.map((branch, i) => {
            const googleMapUrl = branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Ashcol Airconditioning ' + branch.tag + ' ' + branch.address)}`
            
            return (
            <a 
              key={i} 
              href={googleMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl p-4 sm:p-6 transition-all relative overflow-hidden group block focus:outline-none"
              style={{ backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = branch.color + '60'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = t.border}
            >
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: branch.color }} />
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: branch.color + '20', color: branch.color }}>
                  <Building2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider" style={{ backgroundColor: branch.color + '15', color: branch.color }}>{branch.tag}</span>
              </div>
              <div className="font-bold text-[16px] mb-3" style={{ color: t.text }}>{branch.name}</div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: branch.color }} />
                <span className="text-[13px] leading-relaxed" style={{ color: t.textMuted }}>{branch.address}</span>
              </div>
              
              <div
                className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold transition-colors opacity-80 group-hover:opacity-100"
                style={{ color: branch.color }}
              >
                View on Google Maps
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </a>
          )})}
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-5 md:px-11 lg:px-20 py-16 md:py-24 flex flex-col items-center text-center" style={{ backgroundColor: t.bgCardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        <div className="absolute inset-0 orb-green opacity-30 pointer-events-none" />
        <img src={logoImg} alt="Ashcol" className="w-14 h-14 object-contain rounded-md mb-5 relative" />
        <h2 className="relative text-[clamp(1.4rem,4vw,2.5rem)] font-black leading-tight tracking-tight mb-3" style={{ color: t.text }}>
          Ready to stay cool?<br />Book a service today.
        </h2>
        <p className="relative max-w-md text-[14px] md:text-[15px] leading-relaxed mb-7" style={{ color: t.textMuted }}>
          Residential or commercial — our team is ready to help, 7 days a week.
        </p>
        <div className="relative flex flex-col items-center gap-4">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <a
              href="/create-account"
              className="flex items-center justify-center gap-2 px-8 py-3.5 text-[14px] font-bold text-white bg-[#10B981] rounded-xl hover:bg-emerald-500 transition-all glow-green"
            >
              Request a Service
            </a>
            <a
              href="mailto:headoffice@ashcol.com.ph"
              className="flex items-center justify-center gap-2 px-7 py-3.5 text-[14px] font-semibold rounded-xl transition-all"
              style={{ color: t.accent, backgroundColor: t.bgCard, border: `1px solid ${t.border}` }}
            >
              <Mail className="w-4 h-4" /> Send an Email
            </a>
          </div>

        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="px-4 md:px-11 lg:px-20 pt-10 pb-8" style={{ backgroundColor: t.bg, borderTop: `1px solid ${t.border}` }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 mb-8 max-w-6xl mx-auto">

          {/* Brand */}
          <div className="flex items-center gap-3 sm:col-span-2 md:col-span-1">
            <img src={logoImg} alt="Ashcol" className="w-11 h-11 object-contain rounded-xl flex-shrink-0" />
            <div>
              <div className="text-[15px] font-bold leading-tight" style={{ color: t.text }}>Ashcol Airconditioning</div>
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
              <span>+63 (2) 77291293 · +63 (917) 7143810</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 flex-shrink-0" style={{ color: t.accent }} />
              <span className="break-all">headoffice@ashcol.com.ph</span>
            </div>
          </div>

          {/* Quick Links + App */}
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>Quick Links</div>
            <a href="/login" className="text-[13px] transition-colors hover:text-[#10B981]" style={{ color: t.textFaint }}>Sign In</a>
            <a href="/create-account" className="text-[13px] transition-colors hover:text-[#10B981]" style={{ color: t.textFaint }}>Create Account</a>
            <div className="text-[11px] font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: t.textMuted }}>Get the App</div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShowComingSoon(true)} className="flex-1 flex items-center gap-2 text-[13px] hover:text-[#10B981] transition-colors text-left" style={{ color: t.textFaint }}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 opacity-70" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.22 1.3-2.2 3.88.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.33 2.6M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                iOS App Store
              </button>
              <button type="button" onClick={() => setShowComingSoon(true)} className="flex-1 flex items-center gap-2 text-[13px] hover:text-[#10B981] transition-colors text-left" style={{ color: t.textFaint }}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none">
                  <path d="M3.18 23.5c.3.17.65.19.97.06l12.45-7.2-2.88-2.88L3.18 23.5z" fill="#EA4335"/>
                  <path d="M22.26 10.6c-.44-.25-4.03-2.33-8.6-4.97L11 8.29l2.9 2.9 8.36-.59z" fill="#FBBC04"/>
                  <path d="M3.18.5C2.86.63 2.63.96 2.63 1.41v21.18c0 .45.23.78.55.91l10.54-10.54L3.18.5z" fill="#4285F4"/>
                  <path d="M22.26 13.4l-1.04.6-8.32-.59-2.9 2.9 2.66 2.66c4.57-2.64 8.16-4.72 8.6-4.97.72-.41.72-1.19 0-1.6z" fill="#34A853"/>
                </svg>
                Android Google Play
              </button>
            </div>
          </div>
        </div>

        <div className="pt-6 text-center text-[12px]" style={{ borderTop: `1px solid ${t.border}`, color: t.textFaint }}>
          © 2026 Ashcol Airconditioning Services Corporation. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
