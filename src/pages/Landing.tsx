import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, animate, type Variants } from 'framer-motion'
import gsap from 'gsap'
import {
  Star, MapPin, MessageSquare,
  Users, ArrowUpRight, ArrowRight, Menu, X, Building2,
  ShieldCheck, Heart, Bell, Plus, Phone, Briefcase, Check, Target,
  Wrench, Settings as ConfigIcon, Wind, MousePointerClick, FileText
} from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import qrCodeImg from '../assets/774593213_882421038029027_3452067891567596325_n.png'
import { PUBLIC_BRANCHES } from '../data/branches'


// ─── Motion Primitives ───────────────────────────────────────────────────────

const fadeUpContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
}

function Reveal({ children, delay = 0, y = 24, x = 0, className, style }: {
  children: React.ReactNode, delay?: number, y?: number, x?: number, className?: string, style?: React.CSSProperties
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, delay: Math.min(delay, 0.4), ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function CountUp({ from, to, duration = 2 }: { from: number; to: number; duration?: number }) {
  const [display, setDisplay] = useState(from)
  useEffect(() => {
    const controls = animate(from, to, { duration, ease: 'easeOut', onUpdate: v => setDisplay(Math.round(v)) })
    return controls.stop
  }, [from, to, duration])
  return <span>{display.toLocaleString()}</span>
}


// ─── Data ────────────────────────────────────────────────────────────────────

const SERVICES = [
  { id: 0, title: "Installation & Dismantling", label: "Setup", description: "Professional installation and safe dismantling of all air conditioning types for homes, offices, and commercial spaces.", image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&q=80&w=1000", icon: <Wrench /> },
  { id: 1, title: "Preventive Maintenance", label: "Care", description: "Scheduled general cleaning and comprehensive check-ups to keep your unit running at peak efficiency.", image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1000", icon: <ShieldCheck /> },
  { id: 2, title: "Repair & Diagnostics", label: "Fix", description: "Rapid system diagnostics, troubleshooting, and emergency repairs to restore your comfort without delay.", image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=1000", icon: <ConfigIcon /> },
  { id: 3, title: "Ducting & Ventilation", label: "Airflow", description: "Custom ducting works and ventilation solutions designed for residential, commercial, and industrial requirements.", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&q=80&w=1000", icon: <Wind /> },
  { id: 4, title: "Commercial & Industrial", label: "Enterprise", description: "Specialized services for large-scale commercial establishments, restaurants, malls, and industrial facilities.", image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=1000", icon: <Building2 /> }
];

const VALUES = [
  { id: "integrity", label: "Integrity", icon: <ShieldCheck className="w-6 h-6 text-white" />, title: "We do what is right — ", titleSecondary: "always honest, always transparent.", image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&q=80&w=1000" },
  { id: "excellence", label: "Excellence", icon: <Star className="w-6 h-6 text-white" />, title: "We hold ourselves to the highest standards ", titleSecondary: "ensuring every installation and repair lasts for years.", image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1000" },
  { id: "customer", label: "Customer Focus", icon: <Heart className="w-6 h-6 text-white" />, title: "Your comfort is our top priority ", titleSecondary: "delivering rapid response and care when you need it most.", image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=1000" },
  { id: "teamwork", label: "Teamwork", icon: <Users className="w-6 h-6 text-white" />, title: "A highly collaborative field team ", titleSecondary: "that delivers consistent results across all branches.", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&q=80&w=1000" },
  { id: "commitment", label: "Commitment", icon: <Target className="w-6 h-6 text-white" />, title: "We stand behind our work ", titleSecondary: "with dedication, accountability, and full warranty support.", image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=1000" }
];

const BRANCHES = PUBLIC_BRANCHES.map((b, i) => ({
  ...b, id: i + 1, name: b.name, role: b.tag, image: [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=800',
    'https://images.unsplash.com/photo-1416339306562-f3d12fefd36f?auto=format&fit=crop&q=80&w=800',
    'https://images.unsplash.com/photo-1431540015161-0bf868a2d407?auto=format&fit=crop&q=80&w=800',
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=800'
  ][i % 5]
}));

const STATS = [
  { label: 'Years of Service', value: 12, suffix: '+' },
  { label: 'Branches Nationwide', value: 11, suffix: '' },
  { label: 'AC Brands Supported', value: 16, suffix: '+' },
  { label: 'Clients Served', value: 5000, suffix: '+' },
];

const FAQS = [
  { id: 1, question: "What types of air conditioning services does ASHCOL offer?", answer: "ASHCOL provides a comprehensive range of AC services including installation and dismantling, preventive maintenance, repair and diagnostics, ducting and ventilation works, electrical works for AC units, and commercial solutions." },
  { id: 2, question: "How do I book a service?", answer: "You can book a service by filling out our online booking form, calling our hotline at +63 (917) 714 3810, messaging our Facebook Page, or emailing centralsupport@ashcol.com.ph. Our customer service team is available 7 days a week." },
  { id: 3, question: "What AC brands does ASHCOL service?", answer: "Our certified technicians service over 16+ major AC brands, including Carrier, Daikin, Panasonic, Samsung, LG, Koppel, Mitsubishi Electric, York, Gree, Midea, and more." },
  { id: 4, question: "Do you offer emergency or same-day repair services?", answer: "Yes. We offer rapid response repair and diagnostics for urgent situations. Our team operates 7 days a week including holidays from 8:00 AM to 7:00 PM." },
  { id: 5, question: "Do you provide services outside Metro Manila?", answer: "Yes! ASHCOL operates 11 branches across Luzon — 8 owned branches and 3 franchise branches covering areas like Bulacan, Pampanga, Rizal, Laguna, and Cavite." },
  { id: 6, question: "Is there a warranty on your services?", answer: "Yes. All ASHCOL services come with a workmanship warranty. Parts and equipment replacements are covered by their respective manufacturer warranties." },
  { id: 7, question: "Can ASHCOL handle large commercial or industrial AC projects?", answer: "Absolutely. We provide specialized AC services for large-scale commercial establishments, restaurants, malls, and industrial facilities, including custom ducting works and ventilation solutions." },
  { id: 8, question: "How much does a typical AC service cost?", answer: "Costs depend on the type of service, AC unit size, and location. We provide transparent, upfront quotes before any work begins. Please contact us with your specific concern for an accurate estimate." }
];

const CLIENTS = [
  "McDonald's", "Subway", "Mang Inasal", "The Aristocrat", "breadTalk",
  "Goldilocks", "Kumon", "Sterling Bank of Asia", "Generika Drugstore",
  "South Star Drug", "AXA", "La Verti Residences", "Sheridan Towers", "The Grove by Rockwell"
];

const getBrandLogo = (name: string) => {
  const fileMap: Record<string, string> = { 'Carrier': 'carrier.png', 'Daikin': 'daikin.png', 'Panasonic': 'panasonic.png', 'Samsung': 'samsung.png', 'LG': 'lg.png', 'Koppel': 'koppel.png', 'Mitsubishi Electric': 'mitsubishi.png', 'York': 'york.png', 'Gree': 'gree.png', 'Midea': 'midea.png', 'Sharp': 'sharp.png', 'Haier': 'haier.png', 'TCL': 'tcl.png', 'Aux': 'auxaircon.png', 'Fuji-Aire': 'fuji.png', 'Kolin': 'kolin.png' }
  const filename = fileMap[name]
  if (!filename) return undefined
  return new URL(`../assets/brands/${filename}`, import.meta.url).href
}
const BRANDS = ['Carrier','Daikin','Panasonic','Samsung','LG','Koppel','Mitsubishi Electric','York','Gree','Midea','Sharp','Haier','TCL','Aux','Fuji-Aire','Kolin'].map(n => ({ name: n, logo: getBrandLogo(n) }))

// ─── Coming Soon Modal ────────────────────────────────────────────────────────
function ComingSoonModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative bg-white border border-slate-200 rounded-[24px] shadow-2xl max-w-sm w-full p-8 text-center"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.3 }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800"><X className="w-5 h-5" /></button>
        <div className="w-16 h-16 rounded-2xl bg-[#10B981]/10 flex items-center justify-center mx-auto mb-5"><Bell className="w-8 h-8 text-[#10B981]" /></div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2 font-['Big_Shoulders_Display',sans-serif] uppercase tracking-wide">Coming Soon</h3>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">The ASHCOL mobile app is still in development. We will launch soon on Google Play and the App Store.</p>
        <button onClick={onClose} className="w-full py-3.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-bold text-sm transition-all active:scale-95">Got it</button>
      </motion.div>
    </motion.div>
  )
}

// ─── MAIN LANDING COMPONENT ──────────────────────────────────────────────────

export default function Landing() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [showComingSoon, setShowComingSoon] = useState(false);

  // Service States
  const [activeServiceIdx, setActiveServiceIdx] = useState(0);
  const [hoveredServiceIdx, setHoveredServiceIdx] = useState<number | null>(null);
  const currentServiceIdx = hoveredServiceIdx !== null ? hoveredServiceIdx : activeServiceIdx;

  // Values States
  const [activeValIdx, setActiveValIdx] = useState(0);
  const currentVal = VALUES[activeValIdx];

  // FAQ State
  const [openFaq, setOpenFaq] = useState<number | null>(1);

  // Marquee ref
  const brandScrollRef = useRef<HTMLDivElement>(null);
  const [isBrandHovered, setIsBrandHovered] = useState(false);
  const brandScrollPos = useRef(0);

  // Scroll & Intersection Observer
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    }, { rootMargin: '-100px 0px -60% 0px' });

    const sections = ['hero', 'how-it-works', 'services', 'about', 'clients', 'branches', 'faq', 'contact'];
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  // Marquee auto-scroll
  useEffect(() => {
    const el = brandScrollRef.current; if (!el) return;
    let f: number;
    const scroll = () => {
      if (!isBrandHovered) {
        brandScrollPos.current += 0.5;
        if (brandScrollPos.current >= el.scrollWidth / 2) brandScrollPos.current = 0;
        el.scrollLeft = brandScrollPos.current;
      } else brandScrollPos.current = el.scrollLeft;
      f = requestAnimationFrame(scroll);
    };
    f = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(f);
  }, [isBrandHovered]);

  // Original AC Flap & GSAP Wind Animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo('.nav-element', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'power2.out' });
      tl.to('.ac-flap', { scaleY: 0.2, transformOrigin: 'top', duration: 0.6, ease: 'power2.out' }, '-=0.1');
      gsap.to('.wind-dash', { strokeDashoffset: -1000, duration: 20, ease: 'none', repeat: -1 });
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  };

  return (
    <div className="bg-white">
      <div ref={pageRef} className="min-h-screen overflow-x-hidden font-['Inter',sans-serif] transition-colors duration-500 bg-white text-slate-900">
        
        {/* Global font injections and custom marquee animations */}
        <style>{`
          .no-scrollbar::-webkit-scrollbar { display: none; }
          @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
          
          @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @keyframes marquee-reverse { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
          
          .animate-marquee { animation: marquee 40s linear infinite; }
          .animate-marquee-reverse { animation: marquee-reverse 40s linear infinite; }
          .animate-marquee:hover, .animate-marquee-reverse:hover { animation-play-state: paused; }
        `}</style>

        {/* ── 1. AC SPLIT TYPE NAVBAR (DARK THEME TO MATCH HERO) ── */}
        <header className={`fixed top-0 md:top-4 left-0 right-0 mx-auto z-[100] w-full max-w-[1170px] overflow-hidden rounded-b-[2rem] md:rounded-[2rem] transition-all duration-500 ease-in-out shadow-2xl backdrop-blur-md ${isScrolled ? 'h-[70px] md:h-[80px] bg-[#0F172A]/65' : 'h-[120px] md:h-[160px] bg-[#0F172A]/85'}`}>
          <div className="absolute top-0 left-0 w-full h-[160px] pointer-events-none">
            <svg preserveAspectRatio="none" viewBox="0 0 1440 160" className="w-full h-full">
              {/* Dark Theme SVG Elements */}
              <line x1="40" y1="95" x2="1400" y2="95" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
              <line x1="40" y1="105" x2="1400" y2="105" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
              <rect x="30" y="115" width="1380" height="24" rx="4" fill="#1E293B" stroke="#334155" className="transition-colors duration-300" strokeWidth="1" />
              <rect className="ac-flap transition-colors duration-300" x="35" y="117" width="1370" height="20" rx="3" fill="#020617" stroke="#334155" strokeWidth="1" />
              {!isScrolled && <circle cx="1400" cy="75" r="4" fill="#10B981" />}
            </svg>
          </div>

          <nav className={`relative z-10 w-full flex items-center justify-between px-6 md:px-10 transition-all duration-300 ${isScrolled ? 'h-[65px] md:h-[75px]' : 'h-[70px] md:h-[90px]'}`}>
            <button onClick={() => scrollTo('hero')} className="nav-element flex items-center gap-3 hover:opacity-90 transition-opacity">
              <img src={logoImg} alt="ASHCOL Logo" className={`w-auto object-contain transition-all duration-300 ${isScrolled ? 'h-[24px] md:h-[28px]' : 'h-[36px] md:h-[44px]'}`} />
            </button>

            <div className="nav-element hidden md:flex items-center justify-center gap-8 absolute left-1/2 transform -translate-x-1/2">
              {[{id: 'hero', l: 'Home'}, {id: 'how-it-works', l: 'How It Works'}, {id: 'services', l: 'Services'}, {id: 'about', l: 'Why Us'}, {id: 'clients', l: 'Clients'}, {id: 'branches', l: 'Branches'}].map(nav => (
                <button key={nav.id} onClick={() => scrollTo(nav.id)} className="relative text-sm font-semibold transition-colors py-1 hover:opacity-80" style={{ color: activeSection === nav.id ? '#10B981' : '#CBD5E1' }}>
                  {nav.l}
                </button>
              ))}
            </div>

            <div className="nav-element md:hidden flex items-center gap-3 sm:gap-4">
              <button className="md:hidden p-2 rounded-lg text-white/80 hover:text-[#10B981] transition-colors" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </nav>
        </header>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div className="fixed left-0 w-full bg-[#0F172A] border-b border-slate-800 rounded-b-[2rem] shadow-2xl p-6 pt-12 flex flex-col gap-5 z-[90] md:hidden pointer-events-auto" style={{ top: isScrolled ? 38 : 88 }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              {[{id: 'hero', l: 'Home'}, {id: 'how-it-works', l: 'How It Works'}, {id: 'services', l: 'Services'}, {id: 'about', l: 'Why Us'}, {id: 'clients', l: 'Clients'}, {id: 'branches', l: 'Branches'}].map((nav) => (
                <button
                  key={nav.id}
                  onClick={() => {
                    const section = document.getElementById(nav.id);
                    if (section) {
                      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else if (nav.id === 'hero') {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left text-[17px] font-semibold text-slate-200 hover:text-[#10B981] transition-colors capitalize cursor-pointer"
                >
                  {nav.l}
                </button>
              ))}
              <div className="h-[1px] w-full bg-white/10 my-2"></div>
              <button
                onClick={() => {
                  const contactSection = document.getElementById('contact');
                  if (contactSection) {
                    contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                  setMobileMenuOpen(false);
                }}
                className="w-full text-center px-6 py-3 bg-[#10B981] text-white text-[16px] font-bold rounded-full hover:bg-[#059669] transition-colors"
              >
                Book Now
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}
        </AnimatePresence>

        {/* ── 2. HERO SECTION ────────────────────────────────────────────────── */}
        <section id="hero" className="relative w-full min-h-screen overflow-hidden flex flex-col items-center bg-[#0F172A]">
          <motion.div initial={{ scale: 1.06, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.6, ease: [0.25, 0.46, 0.45, 0.94] }} className="absolute inset-0 z-0 bg-center bg-cover bg-no-repeat opacity-40 mix-blend-overlay" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=2000')" }}>
            <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(15,23,42,0.92), rgba(15,23,42,0.75), rgba(15,23,42,0.10))" }} />
          </motion.div>

          <div className="absolute inset-0 z-[5] pointer-events-none opacity-30 max-w-[1170px] mx-auto" style={{ maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)' }}>
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1400 800" fill="none">
              <path className="wind-dash" d="M 200 -100 Q 150 200 250 400 T 200 900" stroke="#10B981" strokeWidth="4" strokeLinecap="round" strokeDasharray="15, 30" />
              <path className="wind-dash" d="M 1000 -100 Q 950 200 1020 400 T 980 900" stroke="#10B981" strokeWidth="4" strokeLinecap="round" strokeDasharray="15, 30" />
            </svg>
          </div>

          <div className="relative z-10 w-full max-w-[1440px] mx-auto pt-[160px] md:pt-[240px] px-6 lg:px-[135px] pb-[60px] flex flex-col items-center min-h-screen">
            <div className="flex flex-col items-center gap-8 md:gap-12 w-full max-w-[800px] mx-auto text-center">
              
              <div className="flex flex-col items-center gap-6">

                {/* Top Badge */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.25 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span className="text-[12px] md:text-[14px] font-bold text-white tracking-[1px] uppercase font-['IBM_Plex_Mono',monospace]">ASHCOL Airconditioning • Since 2014</span>
                </motion.div>

                <motion.h1 initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.35 }} className="w-full text-center text-white font-['Big_Shoulders_Display',sans-serif] text-[40px] sm:text-[52px] md:text-[80px] leading-tight font-bold leading-[1.0] tracking-tight uppercase">
                  12+ Years of Expert <br className="hidden md:block" /> <span className="text-[#10B981]">Air Conditioning Services.</span>
                </motion.h1>

                {/* Tagline */}
                <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.40 }} className="text-center text-slate-400 italic text-xl font-semibold">
                  Keeping YOU Cool
                </motion.p>

                <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.45 }} className="text-center text-white/80 font-sans text-lg md:text-xl max-w-lg leading-relaxed mt-2 mx-auto">
                  Your trusted partner for installation, repair, and maintenance of air conditioning systems — residential and commercial, throughout Metro Manila and Luzon.
                </motion.p>
              </div>
            </div>

            <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.55 }} className="flex flex-col sm:flex-row justify-center items-center gap-3 w-full sm:w-auto mt-12 mx-auto">
              <button onClick={() => scrollTo('services')} className="group flex px-8 py-4 justify-center items-center gap-3 rounded-full border border-white/40 bg-white/10 backdrop-blur-[7px] text-white text-[15px] font-medium no-underline transition-all hover:bg-[#10B981]/20 hover:border-[#10B981]/50 hover:text-[#10B981] w-full sm:w-auto">
                Explore Services
                <ArrowRight className="w-4 h-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </motion.div>
          </div>
        </section>

        {/* ── STATS STRIP ────────────────────────────────────────────────────── */}
        <section className="border-b border-slate-100 bg-[#FCFCFC] py-16">
          <div className="max-w-[95rem] mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {STATS.map((s, i) => (
                <Reveal key={i} className="text-center" delay={i * 0.1} y={20}>
                  <div className="font-['Big_Shoulders_Display',sans-serif] text-[48px] md:text-[60px] font-bold leading-none text-[#10B981] mb-1 tracking-tight">
                    <CountUp from={0} to={s.value} duration={2} />{s.suffix}
                  </div>
                  <div className="text-slate-500 text-xs font-bold uppercase tracking-widest font-['IBM_Plex_Mono',monospace]">{s.label}</div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
        <section id="how-it-works" className="w-full py-16 md:py-[120px] px-4 sm:px-6 lg:px-[135px] bg-[#0A1120]">
          <div className="max-w-[1440px] mx-auto">
            <Reveal className="text-center mb-16 flex flex-col items-center w-full">
              <div className="inline-flex items-center justify-center gap-4 sm:gap-6 w-full">
                <div className="hidden sm:block h-[2px] w-12 md:w-24 bg-gradient-to-r from-transparent to-[#10B981]/50 rounded-full" />
                <h2 className="text-white font-['Big_Shoulders_Display',sans-serif] text-[40px] md:text-[52px] font-bold leading-none tracking-tight uppercase">
                  HOW IT <span className="text-[#10B981]">WORKS</span>
                </h2>
                <div className="hidden sm:block h-[2px] w-12 md:w-24 bg-gradient-to-l from-transparent to-[#10B981]/50 rounded-full" />
              </div>
            </Reveal>
            <Reveal>
              <div className="relative w-full z-10">
                <div className="hidden md:block absolute top-[64px] left-[15%] right-[15%] h-0 border-t-[2px] border-dashed border-white/15 -z-10" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                  {[
                    { num: '01', label: 'Book Online', sub: 'Easily schedule a service by filling out our web booking form or scanning the QR code.', icon: <MousePointerClick className="w-6 h-6"/> },
                    { num: '02', label: 'Provide Details', sub: 'Share your AC issue and location details for a quick assessment and quote.', icon: <FileText className="w-6 h-6"/> },
                    { num: '03', label: 'We Come to You', sub: 'Our expert technicians handle the job.', icon: <Wrench className="w-6 h-6"/> },
                  ].map((step, i) => (
                    <div key={i} className="relative flex flex-col gap-6 p-8 lg:p-10 rounded-[32px] bg-[#0F172A] border border-white/5 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-[#10B981]/30 group overflow-hidden z-10 cursor-default">
                      {/* Faint Watermark Number */}
                      <span className="absolute -top-4 -right-2 font-['Big_Shoulders_Display',sans-serif] text-[140px] font-bold leading-none text-white opacity-5 pointer-events-none group-hover:text-[#10B981] group-hover:opacity-[0.05] transition-colors duration-500">
                        {step.num}
                      </span>
                      
                      {/* Icon Container */}
                      <div className="w-16 h-16 rounded-full bg-[#10B981]/10 flex items-center justify-center text-[#10B981] mb-2 relative z-10 transition-transform duration-300 group-hover:scale-110">
                        {step.icon}
                      </div>

                      <div className="flex flex-col gap-2 relative z-10">
                        <span className="block text-[#10B981] font-['IBM_Plex_Mono',monospace] text-[10px] font-bold tracking-[2px] uppercase mb-2">Step {step.num}</span>
                        <h3 className="font-bold text-2xl text-white font-sans">{step.label}</h3>
                        <p className="text-base font-medium leading-relaxed text-slate-400 font-sans">{step.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 3. SERVICES (Solra Cards) ─────────────────────────────────────── */}
        <section id="services" className="w-full py-16 md:py-[120px] px-4 sm:px-6 lg:px-[135px] bg-[#FCFCFC]">
          <div className="max-w-[1440px] mx-auto">
            <Reveal className="mb-12">
              <span className="inline-block text-[#10B981] font-['IBM_Plex_Mono',monospace] text-[12px] md:text-[14px] font-bold uppercase tracking-[2px] mb-3">
                &bull; OUR SERVICES
              </span>
              <h2 className="text-[#093600] font-['Big_Shoulders_Display',sans-serif] text-[40px] md:text-[52px] font-bold leading-none tracking-tight uppercase">
                COMPREHENSIVE AC SOLUTIONS
              </h2>
            </Reveal>

            <div className="flex flex-col md:flex-row items-start gap-8 lg:gap-12">
              <div className="w-full md:w-1/2 flex flex-col gap-6 order-2 md:order-1">
                <div className="hidden md:block relative w-full aspect-[560/500] lg:h-[600px] rounded-[30px] overflow-hidden shadow-sm">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentServiceIdx}
                      initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.5, ease: "easeInOut" }}
                      className="w-full h-full bg-[#ECFDF5] flex items-center justify-center"
                    >
                      <div className="w-32 h-32 rounded-full bg-[#10B981]/10 flex items-center justify-center text-[#10B981] [&>svg]:w-16 [&>svg]:h-16">
                        {SERVICES[currentServiceIdx].icon}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className="w-full md:w-1/2 flex flex-col gap-3 order-1 md:order-2">
                {SERVICES.map((service, index) => {
                  const isActive = currentServiceIdx === index;
                  return (
                    <motion.div
                      key={service.id}
                      onClick={() => setActiveServiceIdx(index)}
                      onMouseEnter={() => setHoveredServiceIdx(index)}
                      onMouseLeave={() => setHoveredServiceIdx(null)}
                      initial={false}
                      animate={{ backgroundColor: isActive ? "#093600" : "#FFFFFF", color: isActive ? "#FFFFFF" : "#093600" }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                      className={`group cursor-pointer flex flex-col w-full p-[16px_20px] lg:p-6 rounded-[16px] lg:rounded-[24px] border transition-all duration-300 ${isActive ? "border-transparent shadow-lg" : "border-[#E5E7EB] hover:border-[#10B981]/30"}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col gap-1 pr-4">
                          <div className="flex items-center gap-3">
                            <h4 className={`font-['Big_Shoulders_Display',sans-serif] text-[24px] lg:text-[32px] font-bold leading-none tracking-wide uppercase ${isActive ? "text-white" : "text-[#093600]"}`}>
                              {service.title}
                            </h4>
                            <span className={`font-['IBM_Plex_Mono',monospace] text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full ${isActive ? "bg-white/10 text-white" : "bg-[#ECFDF5] text-[#10B981]"}`}>
                              {service.label}
                            </span>
                          </div>
                        </div>

                        <motion.div
                          animate={{ backgroundColor: isActive ? "#10B981" : "#FFFFFF", borderColor: isActive ? "#10B981" : "#E5E7EB" }}
                          transition={{ duration: 0.4, ease: "easeInOut" }}
                          className={`flex-shrink-0 w-[40px] h-[40px] rounded-full border flex items-center justify-center transition-all duration-300 group-hover:shadow-md ${isActive ? 'text-white' : 'text-[#093600]'}`}
                        >
                          {isActive ? <ArrowUpRight className="w-5 h-5" /> : <motion.div whileHover={{ x: 3 }} transition={{ type: "spring", stiffness: 400 }}><ArrowRight className="w-5 h-5" /></motion.div>}
                        </motion.div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.div key={"expanded-" + service.id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                            <p className="font-sans text-[15px] lg:text-[16px] font-medium leading-[24px] opacity-90 mt-4 mb-4 lg:max-w-none text-[#ECFDF5]">
                              {service.description}
                            </p>
                            <div className="md:hidden w-full aspect-[16/11] rounded-[24px] overflow-hidden mb-1 shadow-sm">
                              <div className="w-full h-full bg-[#ECFDF5] flex items-center justify-center text-[#10B981] [&>svg]:w-12 [&>svg]:h-12">
                                {service.icon}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── 4. WHAT DRIVES US (Restored Values Layout) ────────────────────── */}
        <section id="about" className="flex w-full min-h-screen bg-[#ECFDF5] justify-center overflow-hidden">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUpContainer} className="flex w-full max-w-[1440px] px-6 sm:px-12 lg:px-[135px] py-16 lg:py-[120px] flex-col items-start gap-12 lg:gap-[80px]">
            
            <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between w-full lg:h-[124px] self-stretch">
              <motion.h2 variants={fadeUpItem} className="text-[#093600] font-['Big_Shoulders_Display',sans-serif] text-[40px] sm:text-[52px] lg:text-[64px] font-bold leading-[0.95] tracking-tight uppercase max-w-[500px]">
                WHAT DRIVES US EVERY DAY
              </motion.h2>
              <motion.p variants={fadeUpItem} className="text-[#093600] opacity-80 text-[18px] font-medium leading-[26px] lg:w-[472px] mt-6 lg:mt-0 font-sans">
                We combine technical excellence and customer focus to create comfortable environments that go beyond temporary fixes.
              </motion.p>
            </div>

            <motion.div variants={fadeUpItem} className="flex w-full max-w-[1170px] p-6 sm:p-8 lg:p-[48px] flex-col items-center gap-0 rounded-[32px] lg:rounded-[40px] bg-white mx-auto shadow-sm border border-slate-100">
              
              <div className="flex w-full overflow-x-auto no-scrollbar pb-2 lg:pb-0 mb-8 lg:mb-[48px]">
                <div className="flex p-2 lg:p-[12px_10px] justify-start lg:justify-center items-center gap-4 lg:gap-[16px] self-stretch rounded-full bg-[#ECFDF5] min-w-max mx-auto lg:w-full">
                  {VALUES.map((val, idx) => (
                    <button key={val.id} onClick={() => setActiveValIdx(idx)} onMouseEnter={() => setActiveValIdx(idx)} className={`flex px-6 py-3 lg:px-8 lg:py-4 justify-center items-center gap-[10px] rounded-full transition-all duration-300 ${activeValIdx === idx ? "bg-white shadow-[0px_6px_16px_rgba(0,0,0,0.05)]" : "hover:bg-white/50"}`}>
                      <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${activeValIdx === idx ? "bg-[#10B981]" : "bg-[#10B981]/30"}`} />
                      <span className="text-[#093600] font-sans text-[15px] lg:text-[16px] font-bold uppercase tracking-wide whitespace-nowrap font-['Big_Shoulders_Display',sans-serif]">
                        {val.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col lg:flex-row p-4 sm:p-6 lg:p-[24px_24px_24px_48px] items-center gap-8 lg:gap-[48px] self-stretch bg-[#ECFDF5] rounded-[30px]">
                <div className="flex flex-col items-start gap-6 flex-1 pointer-events-none select-none">
                  <AnimatePresence mode="wait">
                    <motion.div key={currentVal.id} initial={{ opacity: 1, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.5, ease: "easeOut" }} className="flex flex-col items-start gap-6">
                      <div className="flex w-14 h-14 p-3 items-center justify-center rounded-full bg-[#10B981]">
                        {currentVal.icon}
                      </div>
                      <h3 className="text-[#093600] text-[28px] sm:text-[32px] lg:text-[38px] font-bold leading-[1.1] tracking-tight font-['Big_Shoulders_Display',sans-serif] uppercase">
                        {(currentVal.title + currentVal.titleSecondary).split("").map((char, i) => (
                          <motion.span key={currentVal.id + "-char-" + i} initial={{ opacity: 0.2 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: i * 0.012, ease: "easeOut" }} className="inline">
                            {char}
                          </motion.span>
                        ))}
                      </h3>
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="w-full lg:w-[452px] h-[300px] sm:h-[400px] lg:h-[444px] relative overflow-hidden rounded-[30px] pointer-events-none select-none">
                  <AnimatePresence mode="wait">
                    <motion.div key={currentVal.id + "-img"} initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.4 }} className="w-full h-full bg-gradient-to-br from-[#10B981]/20 to-[#064E3B]/10 flex items-center justify-center">
                      <div className="scale-[5] opacity-20 text-[#10B981]">
                        {currentVal.icon}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex items-center justify-center gap-[8px] mt-6 lg:mt-[24px]">
                {VALUES.map((_, idx) => (
                  <button key={idx} onClick={() => setActiveValIdx(idx)} onMouseEnter={() => setActiveValIdx(idx)} className={`w-[10px] h-[10px] rounded-full transition-all duration-300 border border-[#093600] ${activeValIdx === idx ? "bg-[#093600]" : "bg-transparent opacity-30"}`} />
                ))}
              </div>
            </motion.div>

          </motion.div>
        </section>

        {/* ── 5. DYNAMIC CLIENTS MARQUEE ────────────────────────────────────── */}
        <section id="clients" className="py-16 md:py-24 px-4 md:px-6 bg-white overflow-hidden border-t border-slate-200">
          <div className="max-w-[95rem] mx-auto">
            <Reveal className="text-center mb-16 flex flex-col items-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 mb-4">
                <Briefcase className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span className="text-[12px] md:text-[14px] font-bold text-[#3B82F6] tracking-[2px] uppercase font-['IBM_Plex_Mono',monospace]">Trusted Clients</span>
              </div>
              <h2 className="font-['Big_Shoulders_Display',sans-serif] text-[32px] sm:text-[40px] md:text-[52px] font-bold leading-none uppercase text-slate-900 tracking-tight">Clients Who Trust ASHCOL</h2>
              <p className="text-slate-500 text-lg font-medium mt-4 max-w-xl font-sans">From retail and restaurant chains to luxury high-rise towers and banking institutions.</p>
            </Reveal>

            <div className="relative w-full overflow-hidden flex flex-col gap-6 pt-4">
              <div className="absolute left-0 top-0 bottom-0 w-32 z-10 pointer-events-none bg-gradient-to-r from-white to-transparent" />
              <div className="absolute right-0 top-0 bottom-0 w-32 z-10 pointer-events-none bg-gradient-to-l from-white to-transparent" />
               
               <div className="flex whitespace-nowrap animate-marquee items-center w-max">
                  {[...CLIENTS, ...CLIENTS].map((client, i) => (
                     <div key={`row1-${i}`} className="inline-flex items-center gap-3 px-8 py-5 mx-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 transition-all hover:border-[#10B981] hover:shadow-md hover:-translate-y-1 group cursor-default">
                        <Check className="w-5 h-5 text-[#10B981] shrink-0" />
                        <span className="font-semibold text-lg text-slate-700 group-hover:text-[#093600] transition-colors font-sans">{client}</span>
                     </div>
                  ))}
               </div>
               
               <div className="flex whitespace-nowrap animate-marquee-reverse items-center w-max">
                  {[...CLIENTS.slice().reverse(), ...CLIENTS.slice().reverse()].map((client, i) => (
                     <div key={`row2-${i}`} className="inline-flex items-center gap-3 px-8 py-5 mx-3 rounded-2xl bg-[#F8FAFC] border border-slate-200 transition-all hover:border-[#3B82F6] hover:shadow-md hover:-translate-y-1 group cursor-default">
                        <Check className="w-5 h-5 text-[#3B82F6] shrink-0" />
                        <span className="font-semibold text-lg text-slate-700 group-hover:text-[#093600] transition-colors font-sans">{client}</span>
                     </div>
                  ))}
               </div>
            </div>

            <div className="border-t border-slate-100 pt-20 mt-16 text-center">
              <h3 className="font-['Big_Shoulders_Display',sans-serif] text-[26px] sm:text-[32px] md:text-[36px] font-bold text-[#093600] tracking-tight uppercase">16+ AC Brands. One Expert Team.</h3>
              <p className="text-slate-500 text-base font-medium mt-2 mb-10 font-sans">Carrier, Daikin, Panasonic, LG, Kolin — our certified technicians service them all.</p>
              
              <div className="relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none bg-gradient-to-r from-white to-transparent" />
                <div className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none bg-gradient-to-l from-white to-transparent" />
                <div ref={brandScrollRef} onMouseEnter={() => setIsBrandHovered(true)} onMouseLeave={() => setIsBrandHovered(false)} className="flex flex-row gap-5 overflow-x-auto pb-4 pt-2 no-scrollbar cursor-grab active:cursor-grabbing">
                  {[...BRANDS, ...BRANDS, ...BRANDS].map((b, i) => (
                    <div key={i} className="min-w-[120px] md:min-w-[150px] p-4 md:p-6 rounded-[24px] bg-[#F8FAFC] border border-slate-200 flex flex-col items-center justify-center gap-3 shadow-sm transition-transform hover:-translate-y-1">
                      {b.logo ? <img src={b.logo} alt={b.name} className="w-14 h-14 object-contain" /> : <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-600 shadow-sm border border-slate-100">{b.name}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. SOLRA TEAM 01 (Branches Detailed Cards) ────────────────────── */}
        <section id="branches" className="w-full bg-[#0F172A] py-24 px-6 lg:px-16 border-t border-b border-white/5">
          <div className="max-w-[95rem] mx-auto">
            <Reveal className="text-center mb-16 flex flex-col items-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#10B981]/10 border border-[#10B981]/20 mb-4">
                <MapPin className="w-3.5 h-3.5 text-[#10B981]" />
                <span className="text-[12px] md:text-[14px] font-bold text-[#10B981] tracking-[2px] uppercase font-['IBM_Plex_Mono',monospace]">OUR LOCATIONS</span>
              </div>
              <h2 className="font-['Big_Shoulders_Display',sans-serif] text-4xl md:text-5xl font-bold text-white tracking-tight uppercase">11 Branches Across Luzon</h2>
              <p className="text-slate-400 text-lg font-medium mt-3 max-w-xl font-sans">8 company-owned hubs & 3 franchise partners ready to deploy expert technicians to your doorstep.</p>
            </Reveal>

            {/* Company Owned Branches */}
            <div className="mb-14">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-sm font-bold uppercase tracking-widest text-[#10B981] font-['IBM_Plex_Mono',monospace]">Company Branches (8)</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {BRANCHES.filter(b => !b.isFranchise).map((branch, i) => {
                  const mapUrl = branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('ASHCOL Airconditioning ' + branch.name + ' ' + branch.address)}`
                  return (
                    <Reveal key={i} delay={i * 0.05}>
                      <div className="p-6 rounded-[28px] flex flex-col h-full bg-[#1E293B] border border-white/5 shadow-xl hover:border-[#10B981]/40 transition-all hover:-translate-y-1 group">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${branch.color}15`, color: branch.color }}>
                              <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: branch.color }}>{branch.tag}</div>
                              {branch.isHQ && <span className="text-[9px] font-bold uppercase tracking-widest text-[#10B981] font-['IBM_Plex_Mono',monospace]">Head Office</span>}
                            </div>
                          </div>
                        </div>
                        <h3 className="font-bold text-lg text-white mb-2 leading-tight font-sans">{branch.name}</h3>
                        <div className="flex items-start gap-2 text-sm text-slate-400 leading-relaxed mb-6 flex-1 font-sans">
                          <MapPin className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
                          <span>{branch.address}</span>
                        </div>
                        <div className="pt-4 flex items-center justify-between border-t border-white/5">
                          <a href={`tel:${branch.phones[0]?.replace(/\s/g, '')}`} className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-[#10B981] transition-colors font-sans">
                            <Phone className="w-4 h-4 text-[#10B981]" /> {branch.phones[0]}
                          </a>
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] font-bold text-slate-400 hover:text-white transition-colors font-sans">
                            Map <ArrowUpRight className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </Reveal>
                  )
                })}
              </div>
            </div>

            {/* Franchise Partners */}
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1 bg-[#F59E0B]/20" />
                <span className="text-sm font-bold uppercase tracking-widest text-[#F59E0B] font-['IBM_Plex_Mono',monospace]">Franchise Partners (3)</span>
                <div className="h-px flex-1 bg-[#F59E0B]/20" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {BRANCHES.filter(b => b.isFranchise).map((branch, i) => {
                  const mapUrl = branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('ASHCOL Airconditioning ' + branch.name + ' ' + branch.address)}`
                  return (
                    <Reveal key={i} delay={i * 0.05}>
                      <div className="p-6 rounded-[28px] flex flex-col h-full bg-[#1E293B] border border-[#F59E0B]/20 shadow-xl hover:border-[#F59E0B]/50 transition-all hover:-translate-y-1 group">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#F59E0B]/10 text-[#F59E0B]"><Building2 className="w-5 h-5" /></div>
                          <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30 font-['IBM_Plex_Mono',monospace]">Franchise</span>
                        </div>
                        <h3 className="font-bold text-lg text-white mb-1 leading-tight font-sans">{branch.name}</h3>
                        <div className="text-xs font-bold mb-3 text-[#F59E0B]">{branch.tag}</div>
                        <div className="flex items-start gap-2 text-sm text-slate-400 leading-relaxed mb-6 flex-1 font-sans">
                          <MapPin className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
                          <span>{branch.address}</span>
                        </div>
                        <div className="pt-4 flex items-center justify-between border-t border-white/5">
                          <a href={`tel:${branch.phones[0]?.replace(/\s/g, '')}`} className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-[#F59E0B] transition-colors font-sans">
                            <Phone className="w-4 h-4 text-[#F59E0B]" /> {branch.phones[0]}
                          </a>
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] font-bold text-slate-400 hover:text-white transition-colors font-sans">
                            Map <ArrowUpRight className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </Reveal>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── 7. SOLRA FAQS 01 ────────────────────────────────────────────────── */}
        <section id="faq" className="flex flex-col items-center w-full bg-[#F8FAFC] py-[80px] md:py-[120px] px-6 md:px-[135px] gap-[60px] md:gap-[80px] border-t border-slate-200">
          <div className="flex flex-col items-center text-center w-full md:w-[772px] gap-4">
            <h2 className="text-[#093600] font-['Big_Shoulders_Display',sans-serif] text-[40px] md:text-[52px] font-bold leading-none tracking-tight uppercase">
              Frequently Asked Questions
            </h2>
            <p className="font-sans text-[16px] md:text-[18px] font-medium leading-[1.4] md:leading-[26px] text-slate-500 mt-2">
              Everything you need to know before booking your first service with ASHCOL.
            </p>
          </div>

          <div className="flex flex-col w-[350px] md:w-[772px] gap-3 md:gap-4 items-start">
            {FAQS.map((faq, i) => {
              const isActive = openFaq === i;
              return (
                <div key={faq.id} className={`group flex flex-col w-full rounded-[12px] md:rounded-[16px] border transition-all duration-300 overflow-hidden self-stretch ${isActive ? "bg-[#10B981] border-[#10B981] shadow-lg text-white" : "bg-white border-slate-200 hover:border-[#10B981]/30 text-slate-900"}`}>
                  <button onClick={() => setOpenFaq(isActive ? null : i)} className={`flex items-center justify-between w-full p-[14px_12px_14px_14px] md:p-[20px_20px_20px_24px] text-left gap-5 md:gap-4 ${isActive ? "items-start" : "items-center"}`}>
                    <span className={`font-sans text-[16px] md:text-[18px] font-bold leading-snug transition-colors duration-300 ${isActive ? "text-white" : "text-slate-900"}`}>
                      {faq.question}
                    </span>
                    <div className={`flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full border transition-all duration-300 flex-shrink-0 ${isActive ? "bg-white text-[#10B981] rotate-0 border-transparent" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
                      {isActive ? <X size={16} /> : <Plus size={16} />}
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}>
                        <div className="p-[10px_12px_14px_14px] md:pl-6 md:pr-[24px] md:pb-6 md:pt-1 flex flex-col gap-2 self-stretch">
                          <p className="font-sans text-[15px] md:text-[16px] font-medium leading-relaxed text-white opacity-95 w-full self-stretch">
                            {faq.answer}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-center w-[350px] md:w-full md:max-w-[1170px] bg-[#ECFDF5] rounded-[24px] md:rounded-[40px] p-8 md:p-[64px] gap-6 md:gap-8 text-center border border-[#10B981]/10">
            <div className="flex flex-col items-center gap-3 self-stretch md:max-w-full">
              <h4 className="text-[#093600] font-['Big_Shoulders_Display',sans-serif] text-[32px] md:text-[42px] font-bold leading-none uppercase">
                Still Have Questions?
              </h4>
              <p className="font-sans text-[15px] md:text-[18px] font-medium leading-[22px] md:leading-[26px] text-[#093600]/80 text-center">
                Can't find the answer you're looking for? Message our team directly.
              </p>
            </div>
            <button onClick={() => window.open('https://www.facebook.com/AshcolCorp', '_blank')} className="flex items-center justify-center gap-[12px] w-full md:w-auto px-[32px] py-[16px] bg-[#10B981] rounded-full transition-all duration-300 hover:bg-[#059669] shadow-lg shadow-[#10B981]/20 group text-white active:scale-95">
              <span className="font-sans text-[16px] font-bold leading-none">
                Message us on Facebook
              </span>
              <MessageSquare className="transition-all duration-300 group-hover:scale-110" size={18} />
            </button>
          </div>
        </section>

        {/* ── 8. FOOTER / CONTACT ────────────────────────────────────────────── */}
        <section id="contact" className="relative w-full min-h-screen flex flex-col items-center overflow-hidden bg-[#0F172A]">
          <div className="absolute inset-0 z-0">
            <img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80" className="object-cover object-center w-full h-full opacity-30 mix-blend-overlay" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0F172A]/40 to-[#0F172A]" />
          </div>

          <div className="relative z-10 w-full flex-1 pt-[80px] lg:pt-[160px] flex flex-col items-center justify-between gap-[80px]">
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="flex flex-col items-center text-center w-full max-w-[1440px] mx-auto px-6 md:px-10">
              <h2 className="text-white font-['Big_Shoulders_Display',sans-serif] text-[40px] md:text-[56px] font-bold leading-none tracking-tight uppercase mb-6">
                Experience hassle-free <br className="hidden md:block"/> air conditioning today.
              </h2>
              <p className="font-sans text-[18px] font-medium leading-[26px] text-white opacity-80 max-w-[620px] mb-10">
                Reach out to book a service or chat with our team 7 days a week.
              </p>

              {/* Action Buttons: Call & Facebook Connection */}
              <div className="flex flex-col items-center gap-6 mt-2">
                <button
                  onClick={() => window.location.href = 'https://www.ashcol.com.ph/booking'}
                  className="group flex px-8 py-4 justify-center items-center gap-3 rounded-full bg-[#10B981] text-white text-[15px] font-bold no-underline transition-all hover:bg-[#059669] hover:shadow-[0_8px_28px_rgba(16,185,129,0.30)] w-full sm:w-auto"
                >
                  Book Now
                  <span className="flex flex-col items-center h-4 overflow-hidden">
                    <ArrowUpRight className="w-4 h-4 shrink-0 transition-transform duration-300 group-hover:-translate-y-full" />
                    <ArrowUpRight className="w-4 h-4 shrink-0 transition-transform duration-300 group-hover:-translate-y-full" />
                  </span>
                </button>

                <div className="flex flex-col items-center gap-2 mt-2">
                  <span className="text-white/60 font-['IBM_Plex_Mono',monospace] text-xs font-medium uppercase tracking-[1.5px]">
                    or scan QR to book
                  </span>
                  <div className="p-4 bg-white rounded-3xl shadow-2xl border border-slate-100">
                    <img src={qrCodeImg} alt="Scan to Book" className="w-40 h-40 md:w-52 md:h-52 object-contain" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Glass Card Footer */}
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }} className="w-full max-w-none px-6 md:px-[135px] py-8 md:py-10 md:pt-[48px] md:pb-0 flex flex-col items-start gap-8 md:gap-12 rounded-none border border-white/10 border-x-0 border-b-0 bg-white/5 backdrop-blur-[10px] transform-gpu overflow-hidden shadow-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12 w-full">
                <div className="flex flex-col items-start gap-4 lg:col-span-2 text-left">
                  <div onClick={() => scrollTo('hero')} className="flex items-center gap-3 group cursor-pointer">
                    <img src={logoImg} alt="ASHCOL Logo" className="w-12 h-12 object-contain rounded-lg transition-transform group-hover:scale-105" />
                    <h3 className="font-['Big_Shoulders_Display',sans-serif] text-[24px] md:text-[28px] font-bold tracking-wide text-white transition-colors group-hover:text-[#10B981] uppercase">ASHCOL</h3>
                  </div>
                  <p className="font-sans text-[15px] font-medium leading-[24px] text-white/70 mt-2">
                    Keeping YOU Cool since 2014. Professional air conditioning services for homes and businesses across Luzon.
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 md:gap-5">
                  <h4 className="font-sans text-[16px] font-bold text-white uppercase tracking-wider">Navigate</h4>
                  <ul className="flex flex-col items-start gap-2 md:gap-3">
                    {["Services", "About Us", "Branches", "Clients", "FAQs"].map((link) => (
                      <li key={link}><button onClick={() => scrollTo(link === 'About Us' ? 'about' : link === 'FAQs' ? 'faq' : link.toLowerCase())} className="font-sans text-[13px] md:text-[15px] font-medium text-white/70 hover:text-[#10B981] transition-colors">{link}</button></li>
                    ))}
                  </ul>
                </div>
                
                <div className="flex flex-col items-start gap-3 md:gap-5">
                  <h4 className="font-sans text-[16px] font-bold text-white uppercase tracking-wider">Direct Connect</h4>
                  <ul className="flex flex-col items-start gap-2 md:gap-3 text-[13px] md:text-[15px] font-medium text-white/70 min-w-0 w-full">
                    <li className="w-full"><a href="tel:+639177143810" className="hover:text-[#10B981] transition-colors">+63 (917) 714 3810</a></li>
                    <li className="w-full"><a href="mailto:centralsupport@ashcol.com.ph" className="hover:text-[#10B981] transition-colors break-all">centralsupport@ashcol.com.ph</a></li>
                    <li className="w-full"><a href="https://www.facebook.com/AshcolCorp" target="_blank" rel="noopener noreferrer" className="hover:text-[#1877F2] transition-colors flex items-center gap-1.5"><MessageSquare size={14}/> Facebook Page</a></li>
                  </ul>
                </div>

                <div className="flex flex-col items-start gap-3 md:gap-5 text-left">
                  <div className="flex flex-col items-start gap-2">
                    <h4 className="font-sans text-[16px] font-bold text-white uppercase tracking-wider">Headquarters</h4>
                    <p className="font-sans text-[15px] font-medium leading-relaxed text-white/70 mt-1">
                      Units 2A & 2B, 2/F, Genesis Building, 182-A 19th Ave, East Rembo, Taguig City, Philippines
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-full h-[1px] bg-white/10" />

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center w-full gap-6 pb-8">
                <p className="font-sans text-[13px] font-medium text-white/50 text-left">
                  © 2026 ASHCOL Airconditioning Services Corporation. All rights reserved.
                </p>
                <div className="flex items-center gap-6">
                  <span className="font-sans text-[13px] font-bold uppercase tracking-widest text-white/30 font-['IBM_Plex_Mono',monospace]">Keeping YOU Cool</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  )
}
