import { useEffect, useRef, useState } from 'react'
import { 
  Wrench, Settings as ConfigIcon, TrendingUp, PhoneCall, Smartphone, Headset, 
  Mail, Award, Calendar, Clock, Star, MapPin, Check, Camera, MessageSquare,
  Users, ArrowUpRight, Menu, X
} from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import showcaseMain from '../assets/ash.jpg'
import showcaseSide from '../assets/red.jpg'

// ─── Data ────────────────────────────────────────────────────────────────────

const SERVICES = [
  {
    icon: <Wrench className="w-6 h-6" />,
    title: 'Installation',
    color: '#10B981',
    colorBg: 'rgba(16,185,129,0.12)',
    colorBorder: 'rgba(16,185,129,0.35)',
    desc: 'Professional installation of new air conditioning systems for homes and businesses.',
    items: ['Residential AC Units', 'Commercial Systems', 'Ductless Mini-Splits', 'Heat Pumps'],
  },
  {
    icon: <ConfigIcon className="w-6 h-6" />,
    title: 'Repair & Maintenance',
    color: '#3B82F6',
    colorBg: 'rgba(59,130,246,0.12)',
    colorBorder: 'rgba(59,130,246,0.35)',
    desc: 'Expert repair and preventive maintenance to keep your system running efficiently.',
    items: ['Emergency Repairs', 'Preventive Maintenance', 'System Diagnostics', 'Performance Optimisation'],
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: 'System Upgrades',
    color: '#8B5CF6',
    colorBg: 'rgba(139,92,246,0.12)',
    colorBorder: 'rgba(139,92,246,0.35)',
    desc: 'Upgrade your existing system for better efficiency, comfort, and energy savings.',
    items: ['Energy-Efficient Upgrades', 'Smart Thermostats', 'Air Quality Improvements', 'Zoning Systems'],
  },
]

const CONTACTS = [
  { icon: <PhoneCall className="w-4 h-4" />, label: 'Customer Hotline',   value: '+63 (2) 77291293',       href: 'tel:+63277291293' },
  { icon: <Wrench className="w-4 h-4" />, label: 'Service / Technical', value: '+63 (2) 77541418',       href: 'tel:+63277541418' },
  { icon: <Smartphone className="w-4 h-4" />, label: 'Mobile (Globe)',       value: '+63 (917) 7143810',      href: 'tel:+639177143810' },
  { icon: <Headset className="w-4 h-4" />, label: 'Express Assist',       value: '+63 (2) 79590289',       href: 'tel:+63279590289' },
  { icon: <Mail className="w-4 h-4" />, label: 'Email',                value: 'headoffice@ashcol.com.ph', href: 'mailto:headoffice@ashcol.com.ph' },
]

const STATS = [
  { value: '2014',    label: 'Established',       icon: <Award className="w-5 h-5" /> },
  { value: '7 days',  label: 'Open Mon–Sun',       icon: <Calendar className="w-5 h-5" /> },
  { value: '8am–7pm', label: 'Business Hours',     icon: <Clock className="w-5 h-5" /> },
  { value: '10yr+',   label: 'In the Industry',    icon: <Star className="w-5 h-5" /> },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function Landing() {
  const [activeSection, setActiveSection] = useState('hero')
  const [hoveredService, setHoveredService] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const heroRef    = useRef<HTMLElement>(null)
  const servicesRef = useRef<HTMLElement>(null)
  const showcaseRef = useRef<HTMLElement>(null)
  const aboutRef   = useRef<HTMLElement>(null)

  const sectionRefs = { hero: heroRef, services: servicesRef, showcase: showcaseRef, about: aboutRef }

  // Highlight nav item based on scroll position
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id) })
      },
      { rootMargin: '-40% 0px -55% 0px' }
    )
    ;[heroRef, servicesRef, showcaseRef, aboutRef].forEach((r) => r.current && observer.observe(r.current))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (key: keyof typeof sectionRefs) => {
    setMobileMenuOpen(false)
    sectionRefs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navLinks = [
    { key: 'services',  label: 'Services' },
    { key: 'showcase',  label: 'Showcase' },
    { key: 'about',     label: 'About Us' },
  ] as const

  return (
    <div className="min-h-screen bg-[#060B18] text-[#F0F6FF] font-['Inter',sans-serif]">

      {/* ── Sticky Navbar + Mobile Dropdown ─────────────────────────── */}
      <div className="sticky top-0 z-50" style={{ backgroundColor: 'rgba(6,11,24,0.92)', borderBottom: '1px solid #1a2844', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <nav className="flex items-center justify-between px-5 md:px-11 lg:px-20 py-4">
          {/* Brand */}
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <img src={logoImg} alt="Ashcol Logo" className="w-10 h-10 object-contain rounded-md" />
            <div className="text-left">
              <div className="text-[17px] font-extrabold text-[#F0F6FF] tracking-wide leading-none">Ashcol</div>
              <div className="text-[10px] text-[#3A5070] font-medium leading-none mt-0.5 hidden sm:block">Airconditioning Corp.</div>
            </div>
          </button>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-7">
            {navLinks.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => scrollTo(key)}
                className={`text-sm font-medium transition-colors ${
                  activeSection === key ? 'text-[#10B981]' : 'text-[#7A95B8] hover:text-[#F0F6FF]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#10B981] rounded-lg hover:bg-emerald-500 transition-all glow-green"
            >
              Get Started
            </a>
            <button
              className="md:hidden p-2 text-[#7A95B8] hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile dropdown — inside the sticky wrapper so it scrolls with nav */}
        {mobileMenuOpen && (
          <div
            className="md:hidden px-5 py-4 flex flex-col gap-4"
            style={{ borderTop: '1px solid #1a2844' }}
          >
            {navLinks.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => scrollTo(key)}
                className={`text-left text-sm font-semibold transition-colors ${
                  activeSection === key ? 'text-[#10B981]' : 'text-[#7A95B8] hover:text-[#F0F6FF]'
                }`}
              >
                {label}
              </button>
            ))}
            <a
              href="/login"
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-[#10B981] rounded-lg hover:bg-emerald-500 transition-all mt-1"
            >
              Get Started
            </a>
          </div>
        )}
      </div>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section id="hero" ref={heroRef} className="relative overflow-hidden flex flex-col items-center text-center px-5 md:px-11 lg:px-20 py-20 md:py-28">
        {/* Glow orbs */}
        <div className="absolute -top-20 -left-32 w-[480px] h-[480px] orb-green pointer-events-none" />
        <div className="absolute top-10 -right-36 w-[380px] h-[380px] orb-blue pointer-events-none" />

        {/* Badge */}
        <div className="relative flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] px-4 py-2 rounded-full mb-8">
          <span className="w-2 h-2 rounded-full bg-[#10B981] glow-green-sm inline-block" />
          <span className="text-xs font-bold text-[#10B981] tracking-wide">Ashcol Airconditioning Corporation · Since 2014</span>
        </div>

        {/* Headline */}
        <h1 className="relative max-w-3xl text-[clamp(2.2rem,6vw,4rem)] font-black text-[#F0F6FF] leading-[1.1] tracking-tight mb-3">
          Professional AC{' '}
          <span className="text-[#10B981]">Services you can trust.</span>
        </h1>

        <p className="relative text-lg italic text-[#7A95B8] font-medium mb-5">"Keeping YOU Cool"</p>

        <p className="relative max-w-xl text-base md:text-[17px] text-[#7A95B8] leading-relaxed mb-10">
          Your trusted partner for installation, repair, and maintenance of air conditioning systems —
          residential and commercial, throughout Metro Manila.
        </p>

        {/* CTA buttons */}
        <div className="relative flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto mb-10">
          <a
            href="/create-account"
            className="flex items-center gap-2 px-8 py-4 text-[15px] font-bold text-white bg-[#10B981] rounded-xl w-full sm:w-auto justify-center hover:bg-emerald-500 transition-all glow-green"
          >
            Get Started
          </a>
        </div>

        {/* Quick contact strip */}
        <a
          href="tel:+63277291293"
          className="relative flex items-center gap-3 bg-[#0F1A2E] border border-[#1E2D48] rounded-xl px-5 py-3 hover:border-[#10B981] transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-[rgba(16,185,129,0.12)] flex items-center justify-center text-[#10B981]">
            <PhoneCall className="w-4 h-4" />
          </div>
          <p className="text-sm text-[#7A95B8]">
            Call us now: <span className="text-[#10B981] font-bold group-hover:underline">+63 (2) 77291293</span>{' '}
            · Mon–Sun, 8 AM–7 PM
          </p>
        </a>
      </section>

      {/* ── Stats Bar ───────────────────────────────────────────────────────── */}
      <div className="border-y border-[#1E2D48] bg-[#0C1426] px-5 md:px-11 lg:px-20">
        <div className="flex flex-wrap">
          {STATS.map((s, i) => (
            <div
              key={i}
              className={`flex-1 min-w-[120px] flex flex-col items-center gap-1 py-6 px-4 ${
                i < STATS.length - 1 ? 'border-r border-[#1E2D48]' : ''
              }`}
            >
              <div className="w-8 h-8 text-[#10B981] rounded-lg bg-[rgba(16,185,129,0.12)] flex items-center justify-center mb-1">
                {s.icon}
              </div>
              <span className="text-xl font-black text-[#F0F6FF] tracking-tight">{s.value}</span>
              <span className="text-[11px] text-[#3A5070] tracking-wide uppercase text-center">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Services ────────────────────────────────────────────────────────── */}
      <section id="services" ref={servicesRef} className="px-5 md:px-11 lg:px-20 py-20 md:py-24 bg-[#060B18]">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4 mb-12">
          <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
            <span className="text-xs">◼</span>
            <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">OUR SERVICES</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-black text-[#F0F6FF] leading-tight tracking-tight">
            Comprehensive AC solutions
          </h2>
          <p className="max-w-lg text-[15px] text-[#7A95B8] leading-relaxed">
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
              className="relative bg-[#0F1A2E] rounded-2xl p-6 border overflow-hidden transition-all duration-300 cursor-default"
              style={{
                borderColor: hoveredService === i ? svc.colorBorder : '#1E2D48',
                boxShadow: hoveredService === i ? `0 16px 48px rgba(0,0,0,0.3)` : 'none',
                background: hoveredService === i ? '#111E33' : '#0F1A2E',
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

              <h3 className="text-[17px] font-bold text-[#F0F6FF] mb-2">{svc.title}</h3>
              <p className="text-[13px] text-[#7A95B8] leading-relaxed mb-4">{svc.desc}</p>

              <div className="border-t border-[#1E2D48] pt-4 flex flex-col gap-2">
                {svc.items.map((item, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5" style={{ color: svc.color }} />
                    <span className="text-[13px] text-[#7A95B8]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Showcase ────────────────────────────────────────────────────────── */}
      <section id="showcase" ref={showcaseRef} className="bg-[#0C1426] border-y border-[#1E2D48] px-5 md:px-11 lg:px-20 py-20 md:py-24">
        <div className="flex flex-col items-center text-center gap-4 mb-12">
          <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full">
            <Camera className="w-3 h-3 text-[#10B981]" />
            <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">OUR SHOWCASE</span>
          </div>
          <h2 className="text-[clamp(1.5rem,3.5vw,2.4rem)] font-bold text-[#F0F6FF] leading-tight tracking-tight">
            Experience and Quality in Action
          </h2>
          <p className="max-w-md text-[15px] text-[#7A95B8]">Take a look at our professional team and project sites.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 max-w-6xl mx-auto">
          {/* Main image */}
          <div className="flex-[2] min-h-[300px] lg:min-h-[450px] rounded-3xl overflow-hidden border border-[#1E2D48] relative">
            <img src={showcaseMain} alt="Quality Assurance" className="w-full h-full object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/60 to-transparent">
              <span className="text-white text-sm font-bold tracking-widest uppercase">Quality Assurance</span>
            </div>
          </div>

          {/* Side column */}
          <div className="flex-1 flex flex-col gap-5">
            {/* Side image */}
            <div className="h-[220px] rounded-3xl overflow-hidden border border-[#1E2D48] relative">
              <img src={showcaseSide} alt="Service Excellence" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                <span className="text-white text-sm font-bold tracking-widest uppercase">Service Excellence</span>
              </div>
            </div>

            {/* Quote box */}
            <div className="flex-1 bg-[#0F1A2E] border border-[#1E2D48] rounded-3xl p-6 flex flex-col justify-center gap-3">
              <MessageSquare className="w-6 h-6 text-[#10B981]" />
              <p className="text-base text-[#F0F6FF] leading-relaxed italic">
                "Providing the right comfort people deserve since 2014."
              </p>
              <p className="text-sm text-[#3A5070] font-medium">— Ashcol Management</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── About Us ────────────────────────────────────────────────────────── */}
      <section id="about" ref={aboutRef} className="px-5 md:px-11 lg:px-20 py-20 md:py-24 bg-[#060B18]">
        <div className="flex flex-col lg:flex-row gap-10 max-w-6xl mx-auto items-start">
          {/* Text side */}
          <div className="flex-1">
            <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] px-3 py-1.5 rounded-full mb-5 w-fit">
              <Users className="w-3 h-3 text-[#10B981]" />
              <span className="text-[10px] font-bold text-[#10B981] tracking-[2px]">ABOUT US</span>
            </div>
            <h2 className="text-[clamp(1.6rem,3.5vw,2.5rem)] font-black text-[#F0F6FF] leading-tight tracking-tight mb-6">
              A family business<br />built on trust.
            </h2>
            <p className="text-[15px] text-[#7A95B8] leading-relaxed mb-4">
              <span className="text-[#F0F6FF] font-semibold">ASHCOL Airconditioning Services Corporation</span> is a
              family-run business founded in 2014. The company name "ASHCOL" was formed from the names of the two
              lovely daughters — <span className="text-[#10B981]">Ashanti</span> and{' '}
              <span className="text-[#10B981]">Coleene</span>.
            </p>
            <p className="text-[15px] text-[#7A95B8] leading-relaxed mb-4">
              Located at Units 4D & 4E, 4/F Genesis Building, 182-A J.P. Rizal Ext., Makati City — the team combines
              more than a decade of technical expertise with a deeply personal customer service philosophy.
            </p>
            <p className="text-[15px] text-[#7A95B8] leading-relaxed mb-7">
              Their tagline{' '}
              <span className="text-[#10B981] italic">"Keeping YOU Cool"</span>{' '}
              reflects their core belief: give people the comfort they deserve, and you will never have an unhappy customer.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-[#0F1A2E] border border-[#1E2D48] px-3 py-2 rounded-lg">
                <MapPin className="w-4 h-4 text-[#10B981]" />
                <span className="text-[13px] text-[#7A95B8]">Makati City, Metro Manila</span>
              </div>
              <div className="flex items-center gap-2 bg-[#0F1A2E] border border-[#1E2D48] px-3 py-2 rounded-lg">
                <Calendar className="w-4 h-4 text-[#10B981]" />
                <span className="text-[13px] text-[#7A95B8]">Since 2014</span>
              </div>
            </div>
          </div>

          {/* Contact card */}
          <div className="flex-1 bg-[#0F1A2E] border border-[#1E2D48] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[#1E2D48] px-6 py-4">
              <Headset className="w-5 h-5 text-[#10B981]" />
              <span className="text-base font-bold text-[#F0F6FF]">Get in Touch</span>
            </div>
            <div className="flex flex-col">
              {CONTACTS.map((c, i) => (
                <a
                  key={i}
                  href={c.href}
                  className="flex items-center gap-4 px-6 py-4 border-b border-[#1E2D48] hover:bg-[#111E33] transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[rgba(16,185,129,0.12)] flex items-center justify-center text-[#10B981] flex-shrink-0">
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-[#3A5070] font-medium uppercase tracking-wide">{c.label}</div>
                    <div className="text-[13px] text-[#7A95B8] group-hover:text-[#10B981] transition-colors truncate">{c.value}</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[#3A5070]" />
                </a>
              ))}
            </div>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#1E2D48]">
              <Clock className="w-4 h-4 text-[#10B981]" />
              <span className="text-[13px] text-[#7A95B8]">Open 7 days a week · 8:00 AM – 7:00 PM (Including Holidays)</span>
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

      {/* ── CTA Banner ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0C1426] border-y border-[#1E2D48] px-5 md:px-11 lg:px-20 py-20 md:py-24 flex flex-col items-center text-center">
        <div className="absolute inset-0 orb-green opacity-30 pointer-events-none" />
        <img src={logoImg} alt="Ashcol" className="w-16 h-16 object-contain rounded-md mb-6 relative" />
        <h2 className="relative text-[clamp(1.5rem,4vw,2.5rem)] font-black text-[#F0F6FF] leading-tight tracking-tight mb-4">
          Ready to stay cool?<br />Book a service today.
        </h2>
        <p className="relative max-w-md text-[15px] text-[#7A95B8] leading-relaxed mb-8">
          Residential or commercial — our team is ready to help, 7 days a week.
        </p>
        <div className="relative flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <a
            href="/create-account"
            className="flex items-center justify-center gap-2 px-8 py-4 text-[15px] font-bold text-white bg-[#10B981] rounded-xl hover:bg-emerald-500 transition-all glow-green"
          >
            Request a Service
          </a>
          <a
            href="tel:+63277291293"
            className="flex items-center justify-center gap-2 px-7 py-4 text-[15px] font-semibold text-[#10B981] bg-[#0F1A2E] border border-[#243452] rounded-xl hover:border-[#10B981] transition-all"
          >
            <PhoneCall className="w-4 h-4" /> Call +63 (2) 77291293
          </a>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-[#060B18] border-t border-[#1E2D48] px-5 md:px-11 lg:px-20 py-10">
        <div className="flex flex-col md:flex-row justify-between gap-8 mb-8">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Ashcol" className="w-10 h-10 object-contain rounded-md" />
            <div>
              <div className="text-[15px] font-bold text-[#F0F6FF]">Ashcol Airconditioning</div>
              <div className="text-[12px] text-[#3A5070] italic">"Keeping YOU Cool" since 2014</div>
            </div>
          </div>

          {/* Quick info */}
          <div className="flex flex-col gap-2 text-[13px] text-[#3A5070]">
            <div className="flex items-start gap-2"><MapPin className="w-4 h-4 flex-shrink-0" /><span>Units 4D & 4E, 4/F Genesis Building, 182-A J.P. Rizal Ext., Makati City</span></div>
            <div className="flex items-center gap-2"><PhoneCall className="w-4 h-4 flex-shrink-0" /><span>+63 (2) 77291293 · +63 (917) 7143810</span></div>
            <div className="flex items-center gap-2"><Mail className="w-4 h-4 flex-shrink-0" /><span>headoffice@ashcol.com.ph</span></div>
          </div>

          {/* Portal links */}
          <div className="flex flex-col gap-2">
            <div className="text-[12px] font-bold text-[#7A95B8] uppercase tracking-wider mb-1">Company</div>
            <a href="/login" className="text-[13px] text-[#3A5070] hover:text-[#10B981] transition-colors">Sign In</a>
            <a href="/create-account" className="text-[13px] text-[#3A5070] hover:text-[#10B981] transition-colors">Create Account</a>
          </div>
        </div>

        <div className="border-t border-[#1E2D48] pt-6 text-center text-[12px] text-[#3A5070]">
          © 2026 Ashcol Airconditioning Services Corporation. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
