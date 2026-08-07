import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, getInitials } from '../contexts/AuthContext'
import logoImg from '../assets/ash-logo.jpg'
import { getPortalHomePath, resolveImageUrl, formatPersonName, API_BASE_URL } from '../utils/api'
import { PUBLIC_BRANCHES } from '../data/branches'

const WEBSITE = 'www.ashcol.com.ph'
const SUPPORT_EMAIL = 'centralsupport@ashcol.com.ph'

/** Ashcol brand */
const GREEN = '#10B981'

function branchDisplayName(branch: (typeof PUBLIC_BRANCHES)[number]): string {
  if (branch.isHQ) return 'ASHCOL Taguig'
  return branch.name.startsWith('ASHCOL') ? branch.name : `ASHCOL ${branch.tag}`
}

const SORTED_PUBLIC_BRANCHES = [...PUBLIC_BRANCHES].sort((a, b) =>
  branchDisplayName(a).localeCompare(branchDisplayName(b))
)

/** Duplicated for the seamless marquee loop */
const MARQUEE_ITEMS = [...SORTED_PUBLIC_BRANCHES, ...SORTED_PUBLIC_BRANCHES]

/** Feature showcase — auto-rotates every 5 s */
const SLIDER_CONTENT = [
  {
    title: 'One Platform to Streamline',
    text: 'Easily track scheduled, installed, cancelled, and pending clients in one place, ensuring your team never misses a task and your operations stay organized.',
  },
  {
    title: 'Stay Updated in Real Time',
    text: 'Technician progress and service reports are delivered instantly, giving you clear visibility into ongoing jobs and helping you respond faster to client needs.',
  },
  {
    title: 'Monitor Branch Activity',
    text: 'Keep an eye on branch assignments and daily activity across multiple locations, so you can manage resources effectively and maintain smooth coordination.',
  },
]

export default function Login() {
  const prefillEmail = (import.meta.env.VITE_LOGIN_PREFILL_EMAIL || '').trim()
  const prefillPassword = import.meta.env.VITE_LOGIN_PREFILL_PASSWORD || ''
  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState(prefillPassword)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [activeSlide, setActiveSlide] = useState(0)

  // Auto-rotate the feature slider
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDER_CONTENT.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('ashcol-remembered-email')
    if (saved && !prefillEmail) {
      setEmail(saved)
      setRememberMe(true)
    } else if (prefillEmail || prefillPassword) {
      setRememberMe(true)
    }
  }, [prefillEmail, prefillPassword])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('expired') === 'true') {
      setError('Your session has expired. Please log in again.')
    }
  }, [])

  useEffect(() => {
    if (user) {
      navigate(getPortalHomePath(user), { replace: true })
    }
  }, [user, navigate])

  // Lock scroll on login only
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('login-shell')
    return () => {
      html.classList.remove('login-shell')
      html.style.removeProperty('overflow')
      document.body.style.removeProperty('overflow')
      document.body.style.removeProperty('touch-action')
      html.style.removeProperty('--app-height')
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const backendRes = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fcmToken: '' })
      })

      if (!backendRes.ok) {
        const errData = await backendRes.json().catch(() => ({}))
        throw new Error(errData.message || 'Invalid credentials')
      }

      const data = await backendRes.json()
      if (!data.success) throw new Error(data.message || 'Login failed')

      const appToken = data.data.token
      const appUser = data.data.user
      const displayName = formatPersonName(appUser.name || appUser.email) || appUser.email

      if (rememberMe) {
        localStorage.setItem('ashcol-token', appToken)
        localStorage.setItem('ashcol-user', JSON.stringify({
          id: appUser.id,
          name: displayName,
          email: appUser.email,
          personalEmail: appUser.personalEmail ?? null,
          picture: resolveImageUrl(appUser.profileImage) || '',
          role: (appUser.role || 'customer').toLowerCase(),
          initials: getInitials(displayName),
          branchId: appUser.branchId ?? null,
          jobTitle: appUser.jobTitle ?? null,
        }))
        localStorage.setItem('ashcol-remembered-email', appUser.email)
      } else {
        sessionStorage.setItem('ashcol-token', appToken)
        localStorage.removeItem('ashcol-token')
        localStorage.removeItem('ashcol-user')
        localStorage.removeItem('ashcol-remembered-email')
      }

      setUser({
        id: appUser.id,
        name: displayName,
        email: appUser.email,
        personalEmail: appUser.personalEmail ?? null,
        picture: resolveImageUrl(appUser.profileImage) || '',
        role: (appUser.role || 'customer').toLowerCase(),
        initials: getInitials(displayName),
        branchId: appUser.branchId ?? null,
        jobTitle: appUser.jobTitle ?? null,
      })
      navigate(getPortalHomePath(appUser))
    } catch (err: unknown) {
      console.error('Login Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to login. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden font-['Inter',sans-serif]"
      style={{ background: 'radial-gradient(circle at 15% 50%, rgba(16,185,129,0.08) 0%, #060B18 50%)' }}
    >
      {/* ── Marquee keyframes ── */}
      <style>{`
        @keyframes ashcol-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ashcol-marquee {
          display: flex;
          width: max-content;
          animation: ashcol-scroll 60s linear infinite;
        }
        .ashcol-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* ── Top Marquee ── */}
      <div className="w-full bg-white/[0.02] border-b border-white/[0.05] py-3.5 backdrop-blur-md z-30 flex-shrink-0">
        <div className="ashcol-marquee items-center space-x-12 px-6">
          {MARQUEE_ITEMS.map((b, i) => (
            <div key={i} className="flex items-center space-x-4 flex-shrink-0">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#10B981] flex-shrink-0"
                style={{ boxShadow: '0 0 8px rgba(16,185,129,0.8)' }}
              />
              <span className="text-emerald-100/70 font-bold tracking-[0.15em] text-xs uppercase whitespace-nowrap">
                {branchDisplayName(b)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Unified Layout ── */}
      <div className="flex-1 flex items-center justify-center relative z-20 w-full max-w-[1300px] mx-auto px-6 py-10">
        <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-24">

          {/* LEFT PANEL: Branding & Feature Slider */}
          <div className="w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left order-2 lg:order-1 mt-10 lg:mt-0">
            {/* Logo & Header */}
            <div className="flex items-center gap-4 mb-10 lg:mb-14">
              <div className="p-1 bg-white/5 border border-white/10 rounded-xl shadow-lg">
                <img src={logoImg} alt="ASHCOL" className="h-10 w-10 object-contain rounded-lg" />
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-black text-white tracking-wide leading-none font-['Big_Shoulders_Display',sans-serif]">ASHCOL</h1>
                <h2 className="text-xs font-bold tracking-[0.3em] uppercase mt-1 text-[#10B981]">Portal</h2>
              </div>
            </div>

            {/* Feature Slider */}
            <div className="relative w-full max-w-md h-32">
              {SLIDER_CONTENT.map((slide, index) => (
                <div
                  key={index}
                  className={`absolute inset-0 w-full transition-opacity duration-700 ease-in-out ${
                    index === activeSlide ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
                >
                  <h3 className="text-white font-bold text-xl mb-3 flex items-center justify-center lg:justify-start">
                    <span className="mr-3 bg-[#10B981]/10 border border-[#10B981]/20 p-2 rounded-lg flex-shrink-0">
                      <svg className="w-4 h-4 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                    {slide.title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed lg:pr-6">
                    {slide.text}
                  </p>
                </div>
              ))}
            </div>

            {/* Slider Dots */}
            <div className="flex items-center gap-2 mt-8 lg:mt-6">
              {SLIDER_CONTENT.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveSlide(index)}
                  aria-label={`Go to slide ${index + 1}`}
                  className={`transition-all duration-300 rounded-full ${
                    index === activeSlide
                      ? 'bg-[#10B981] w-8 h-1.5'
                      : 'bg-white/10 hover:bg-white/30 w-1.5 h-1.5'
                  }`}
                />
              ))}
            </div>

            {/* Footer Links */}
            <div className="mt-16 lg:mt-24 flex flex-col gap-1 text-[11px] text-slate-500 font-semibold tracking-wider">
              <a href={`https://${WEBSITE}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#10B981] transition-colors uppercase">
                {WEBSITE}
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-[#10B981] transition-colors uppercase">
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>

          {/* RIGHT PANEL: Clean Glassmorphism Login Card */}
          <div className="w-full max-w-[440px] lg:w-[480px] order-1 lg:order-2">
            <div className="bg-[#0F172A]/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 lg:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden">

              <div className="mb-8">
                <h2 className="font-['Big_Shoulders_Display',sans-serif] font-black text-4xl text-white leading-none mb-2">Log In.</h2>
                <p className="text-sm text-slate-400 font-medium">Access your ASHCOL Portal account</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">

                {/* Email */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      type="email"
                      name="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-800 bg-[#060B18] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all outline-none text-white text-sm font-semibold placeholder:text-slate-600 placeholder:font-normal"
                      placeholder="name@ashcol.com.ph"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-11 pr-12 py-3.5 rounded-xl border border-slate-800 bg-[#060B18] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all outline-none text-white text-sm font-semibold placeholder:text-slate-600 placeholder:font-normal"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#10B981] transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember me + Forgot password */}
                <div className="flex items-center justify-between pt-2 pb-3">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setRememberMe((r) => !r)}
                      className="relative flex-shrink-0 w-4 h-4 rounded-[4px] border border-slate-700 transition-all flex items-center justify-center focus:outline-none"
                      style={{
                        backgroundColor: rememberMe ? GREEN : '#060B18',
                        borderColor: rememberMe ? GREEN : '#334155',
                      }}
                      aria-label="Remember me"
                    >
                      {rememberMe && (
                        <svg viewBox="0 0 12 10" className="w-2.5 h-2.5" fill="none">
                          <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span
                      className="text-[11px] font-semibold text-slate-400 cursor-pointer select-none"
                      onClick={() => setRememberMe((r) => !r)}
                    >
                      Remember me
                    </span>
                  </div>
                  <Link
                    to={`/forgot-password?email=${encodeURIComponent(email.trim())}`}
                    className="text-[11px] font-semibold transition-colors hover:text-white"
                    style={{ color: GREEN }}
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-center">
                    <p className="text-[13px] text-red-400 font-medium">
                      {error}
                    </p>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#10B981] hover:bg-[#059669] text-white rounded-xl py-3.5 font-bold tracking-wide transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? 'Signing in…' : 'Continue'}
                </button>

                <p className="text-[10px] text-slate-500 text-center pt-4 font-semibold uppercase tracking-widest">
                  For account access, contact your administrator.
                </p>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
