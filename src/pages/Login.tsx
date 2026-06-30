import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth, getInitials } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Sun, Moon, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import { getPortalHomePath, resolveImageUrl, formatPersonName, API_BASE_URL } from '../utils/api'
import splitBgImg from '../assets/split_screen_bg.png'

export default function Login() {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  const googleDisabled = !GOOGLE_CLIENT_ID
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
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'
  // Pre-fill remembered email on mount
  useEffect(() => {
    const saved = localStorage.getItem('ashcol-remembered-email')
    if (saved && !prefillEmail) {
      setEmail(saved)
      setRememberMe(true)
    } else if (prefillEmail || prefillPassword) {
      setRememberMe(true)
    }
  }, [prefillEmail, prefillPassword])

  // Check if session has expired
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

  // ── Color tokens ──────────────────────────────────────────────
  const rightBg     = isLight ? '#f1f5f9'               : '#060B18'
  const cardBg      = isLight ? 'rgba(255,255,255,0.9)'  : 'rgba(10,17,32,0.4)'
  const cardBorder  = isLight ? '#e2e8f0'                : 'rgba(255,255,255,0.05)'
  const textPrimary = isLight ? '#0f172a'                : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'                : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'                : 'rgba(15,26,46,0.8)'
  const inputBorder = isLight ? '#cbd5e1'                : '#243452'
  const inputText   = isLight ? '#0f172a'                : '#ffffff'
  const divBorder   = isLight ? '#e2e8f0'                : '#1E2D48'
  const googleBg    = isLight ? '#f8fafc'                : 'rgba(10,17,32,0.5)'

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

      if (rememberMe) {
        localStorage.setItem('ashcol-token', appToken)
        localStorage.setItem('ashcol-user', JSON.stringify({
          id: appUser.id,
          name: formatPersonName(appUser.name || email),
          email: appUser.email || email,
          personalEmail: appUser.personalEmail ?? null,
          picture: resolveImageUrl(appUser.profileImage),
          role: (appUser.role || 'customer').toLowerCase(),
          initials: getInitials(appUser.name || email),
          branchId: appUser.branchId ?? null,
          jobTitle: appUser.jobTitle ?? null,
        }))
        localStorage.setItem('ashcol-remembered-email', email.trim())
      } else {
        sessionStorage.setItem('ashcol-token', appToken)
        localStorage.removeItem('ashcol-token')
        localStorage.removeItem('ashcol-user')
        localStorage.removeItem('ashcol-remembered-email')
      }

      setUser({
        id: appUser.id,
        name: appUser.name || email,
        email: appUser.email || email,
        personalEmail: appUser.personalEmail ?? null,
        picture: resolveImageUrl(appUser.profileImage),
        role: (appUser.role || 'customer').toLowerCase(),
        initials: getInitials(appUser.name || email),
        branchId: appUser.branchId ?? null,
        jobTitle: appUser.jobTitle ?? null,
      })

      navigate(getPortalHomePath(appUser))
    } catch (err: any) {
      console.error('Login Error:', err)
      setError(err.message || 'Failed to login. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true)
      setError('')
      try {
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        })
        if (!googleRes.ok) throw new Error('Failed to fetch profile')
        const profile = await googleRes.json()

        const backendRes = await fetch(`${API_BASE_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: tokenResponse.access_token, id_token: '', fcm_token: '' })
        })

        if (!backendRes.ok) {
          const errData = await backendRes.json().catch(() => ({}))
          throw new Error(errData.message || 'Server authentication failed')
        }

        const data = await backendRes.json()
        if (!data.success) throw new Error(data.message || 'Authentication failed')

        const appToken = data.data.token
        const appUser = data.data.user

        if (rememberMe) {
          localStorage.setItem('ashcol-token', appToken)
          localStorage.setItem('ashcol-user', JSON.stringify({
            id: appUser.id,
            name: appUser.name || profile.name || profile.email,
            email: appUser.email || profile.email,
            personalEmail: appUser.personalEmail ?? null,
            picture: resolveImageUrl(appUser.profileImage) || profile.picture || '',
            role: (appUser.role || 'customer').toLowerCase(),
            initials: getInitials(appUser.name || profile.name || profile.email),
            branchId: appUser.branchId ?? null,
            jobTitle: appUser.jobTitle ?? null,
          }))
          localStorage.setItem('ashcol-remembered-email', appUser.email || profile.email)
        } else {
          sessionStorage.setItem('ashcol-token', appToken)
          localStorage.removeItem('ashcol-token')
          localStorage.removeItem('ashcol-user')
          localStorage.removeItem('ashcol-remembered-email')
        }

        setUser({
          id: appUser.id,
          name: appUser.name || profile.name || profile.email,
          email: appUser.email || profile.email,
          personalEmail: appUser.personalEmail ?? null,
          picture: resolveImageUrl(appUser.profileImage) || profile.picture || '',
          role: (appUser.role || 'customer').toLowerCase(),
          initials: getInitials(appUser.name || profile.name || profile.email),
          branchId: appUser.branchId ?? null,
          jobTitle: appUser.jobTitle ?? null,
        })
        navigate(getPortalHomePath(appUser))
      } catch (err: any) {
        console.error('Google Auth Error:', err)
        setError(err.message || 'Google login failed. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    onError: () => setError('Google login was cancelled.'),
  })

  return (
    <div
      className="flex flex-col lg:flex-row h-screen w-full font-['Inter',sans-serif] relative overflow-hidden"
      style={{ backgroundColor: rightBg, color: textPrimary, transition: 'background-color 0.2s, color 0.2s' }}
    >
      {/* ── Left Branding Panel ───────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col justify-between p-12 overflow-hidden shadow-2xl z-20 border-r border-[#1E2D48]/50">
        {/* Background image + overlays */}
        <div className="absolute inset-0 z-0">
          <img src={splitBgImg} alt="Abstract Cooling" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#060B18]/60 via-[#060B18]/10 to-[#060B18] mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060B18] via-[#060B18]/40 to-transparent" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <img src={logoImg} alt="ASHCOL Logo" className="w-16 h-16 object-contain drop-shadow-xl" />
          <span className="font-black tracking-widest text-[#E2E8F0] text-xl drop-shadow-md">ASHCOL</span>
        </div>

        {/* Middle / lower left glass panel */}
        <div className="relative z-10 max-w-md my-auto p-8 rounded-3xl bg-[#060B18]/65 border border-[#1E2D48]/50 backdrop-blur-md shadow-2xl flex flex-col gap-6">
          <div>
            <h2 className="text-3xl xl:text-4xl font-black leading-tight mb-2 drop-shadow-lg text-white">
              Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10B981] to-[#3B82F6]">ASHCOL Portal</span>
            </h2>
            <p className="text-[#7A95B8] text-xs leading-relaxed">
              Manage schedules, service reports, and branch updates in one place.
            </p>
          </div>

          <div className="flex flex-col gap-4 border-t border-[#1E2D48]/45 pt-4">
            {[
              {
                title: 'Schedule Monitoring',
                desc: 'Track scheduled, installed, cancelled, and pending clients.'
              },
              {
                title: 'Service Reports',
                desc: 'View technician updates and service progress faster.'
              },
              {
                title: 'Branch Line-Up',
                desc: 'Monitor branch assignments and daily activity.'
              }
            ].map(feat => (
              <div key={feat.title} className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-[#10B981]/25 border border-[#10B981]/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-[#10B981]" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-xs font-bold text-white tracking-wide">{feat.title}</h4>
                  <p className="text-[#A2B7D0] text-[11px] leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-[10px] font-semibold text-[#64748b] tracking-wider uppercase pt-2 border-t border-[#1E2D48]/30">
            Built for faster aircon service coordination.
          </div>
        </div>
      </div>

      {/* ── Right Form Panel ──────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center p-6 sm:p-12 relative overflow-y-auto overflow-x-hidden no-scrollbar z-10"
        style={{ backgroundColor: rightBg, transition: 'background-color 0.2s' }}
      >
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-5 right-5 p-2.5 rounded-xl transition-all hover:scale-105 z-30"
          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
          aria-label="Toggle theme"
        >
          {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />}
        </button>

        {/* Background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className="absolute top-0 right-0 w-[500px] h-[500px] translate-x-1/3 -translate-y-1/3"
            style={{ background: isLight ? 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)', filter: 'blur(80px)' }}
          />
          <div
            className="absolute bottom-0 left-0 w-[500px] h-[500px] -translate-x-1/3 translate-y-1/3"
            style={{ background: isLight ? 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)', filter: 'blur(60px)' }}
          />
        </div>

        <div className="w-full max-w-[440px] relative z-20 my-auto py-8">

          {/* Mobile-only logo/header */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <a href="https://ashcol.com.ph" className="hover:scale-105 transition-transform mb-6">
              <img src={logoImg} alt="ASHCOL Logo" className="w-16 h-16 object-contain rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)]" />
            </a>
            <h1 className="text-2xl font-black tracking-tight mb-2 text-center" style={{ color: textPrimary }}>
              Sign in to your workspace
            </h1>
            <p className="text-xs text-center max-w-[280px]" style={{ color: textMuted }}>
              Access your ASHCOL monitoring dashboard.
            </p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: textPrimary }}>
              Sign in to your workspace
            </h1>
            <p className="text-[15px]" style={{ color: textMuted }}>
              Access your ASHCOL monitoring dashboard.
            </p>
          </div>

          {/* Form Card */}
          <div
            className="backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              {/* Email */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                  className="w-full border rounded-xl px-4 py-3.5 placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
                  placeholder="juan@example.com"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                    Password
                  </label>
                  <Link to={`/forgot-password?email=${encodeURIComponent(email.trim())}`} className="text-xs text-[#10B981] hover:underline font-semibold">
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                    className="w-full border rounded-xl px-4 py-3.5 pr-12 placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-[14px] text-[#7A95B8] hover:text-[#10B981] transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="remember-me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => setRememberMe(r => !r)}
                  className="relative flex-shrink-0 w-5 h-5 rounded-md border-2 transition-all duration-150 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#10B981]/50"
                  style={{
                    backgroundColor: rememberMe ? '#10B981' : 'transparent',
                    borderColor: rememberMe ? '#10B981' : inputBorder,
                  }}
                  aria-label="Keep me signed in"
                >
                  {rememberMe && (
                    <svg viewBox="0 0 12 10" className="w-3 h-3" fill="none">
                      <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <label
                  htmlFor="remember-me"
                  className="text-xs font-semibold cursor-pointer select-none"
                  style={{ color: textMuted }}
                >
                  Keep me signed in
                </label>
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2 animate-in slide-in-from-top-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`mt-1 w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white text-[14px] transition-all ${
                  loading
                    ? 'cursor-not-allowed'
                    : 'bg-[#10B981] hover:bg-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-[#10B981]/50'
                }`}
                style={loading ? { backgroundColor: inputBg, color: textMuted, border: `1px solid ${inputBorder}` } : {}}
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 border-t" style={{ borderColor: divBorder }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Or</span>
              <div className="flex-1 border-t" style={{ borderColor: divBorder }} />
            </div>

            {/* Google Login */}
            <button
              onClick={() => {
                if (googleDisabled) {
                  setError('Google login is not configured for this environment.')
                  return
                }
                loginWithGoogle()
              }}
              disabled={loading || googleDisabled}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              style={{ backgroundColor: googleBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#10B981'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = inputBorder}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            {googleDisabled && (
              <p className="mt-2 text-xs text-center text-[#A2B7D0]">Google sign-in is not configured for this environment.</p>
            )}
          </div>

          <p className="mt-8 text-center text-[12px] font-medium" style={{ color: textMuted }}>
            For account access, contact your administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
