import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, getInitials } from '../contexts/AuthContext'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import { getPortalHomePath, resolveImageUrl, formatPersonName, API_BASE_URL } from '../utils/api'
import { PUBLIC_BRANCHES } from '../data/branches'

const WEBSITE = 'www.ashcol.com.ph'
const SUPPORT_EMAIL = 'centralsupport@ashcol.com.ph'

/** Ashcol brand — dark theme, no yellow/lime */
const GREEN = '#10B981'
const LOGO_GREEN = '#006B3F'
const PAGE_BG = '#060E1A'

function branchDisplayName(branch: (typeof PUBLIC_BRANCHES)[number]): string {
  if (branch.isHQ) return 'ASHCOL Taguig'
  return branch.name.startsWith('ASHCOL') ? branch.name : `ASHCOL ${branch.tag}`
}

const SORTED_PUBLIC_BRANCHES = [...PUBLIC_BRANCHES].sort((a, b) =>
  branchDisplayName(a).localeCompare(branchDisplayName(b))
)

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

  // Lock scroll on login only (class removed on unmount so portal pages stay normal)
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('login-shell')
    return () => {
      html.classList.remove('login-shell')
      // Clear any leftover inline locks from earlier experiments
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
      className="fixed inset-0 z-[100] overflow-hidden overscroll-none touch-none font-['Segoe_UI',ui-sans-serif,system-ui,sans-serif] text-white"
      style={{ height: '100svh', width: '100%' }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 90% 70% at 50% 40%, #0C1F18 0%, ${PAGE_BG} 55%, #03070C 100%)`,
          }}
        />
        <div
          className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.14) 0%, transparent 68%)' }}
        />
        <div
          className="absolute top-[12%] right-[-10%] w-[460px] h-[460px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,107,63,0.22) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-16%] left-[20%] w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,14,26,0.9) 0%, transparent 68%)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 75% 65% at 50% 45%, transparent 40%, rgba(3,7,12,0.65) 100%)',
          }}
        />
      </div>

      {/* Desktop — absolute locked X/Y positions */}
      <div className="hidden lg:block absolute inset-0 pointer-events-none">
        <div className="absolute left-[6%] xl:left-[8%] top-1/2 -translate-y-1/2 flex flex-col items-center text-center select-none pointer-events-auto">
          <img
            src={logoImg}
            alt="ASHCOL"
            className="w-36 h-36 xl:w-44 xl:h-44 object-contain mb-4 drop-shadow-[0_14px_32px_rgba(0,0,0,0.35)] rounded-2xl"
          />
          <h1 className="text-[2.25rem] xl:text-[2.75rem] font-black tracking-tight leading-none text-white">
            ASHCOL
          </h1>
          <p
            className="text-lg xl:text-xl font-semibold tracking-[0.42em] mt-2.5 pr-[0.42em]"
            style={{ color: GREEN }}
          >
            PORTAL
          </p>
          <div
            className="w-[180px] h-px my-5"
            style={{ background: `linear-gradient(90deg, transparent, ${GREEN}, transparent)` }}
          />
          <p className="text-lg xl:text-xl italic tracking-wide font-medium text-white/75">
            keeping you cool.
          </p>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] pointer-events-auto">
          <LoginCard
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            rememberMe={rememberMe}
            setRememberMe={setRememberMe}
            loading={loading}
            error={error}
            handleLogin={handleLogin}
          />
        </div>

        <div className="absolute right-[5%] xl:right-[7%] top-1/2 -translate-y-1/2 w-[280px] xl:w-[320px] pointer-events-auto">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] mb-4" style={{ color: GREEN }}>
            Our branches
          </p>
          <ul className="flex flex-col gap-2.5 mb-6">
            {SORTED_PUBLIC_BRANCHES.map((b) => (
              <li
                key={b.name}
                className="text-xl xl:text-2xl font-bold tracking-tight leading-none text-white"
              >
                {branchDisplayName(b)}
              </li>
            ))}
          </ul>
          <div
            className="w-full h-px mb-5"
            style={{ background: `linear-gradient(90deg, ${GREEN}88, transparent)` }}
          />
          <div className="space-y-2.5 text-sm text-white/70">
            <a
              href={`https://${WEBSITE}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-semibold text-white/90 hover:text-white transition-colors"
            >
              {WEBSITE}
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center gap-2 hover:text-white transition-colors break-all"
            >
              <Mail className="w-4 h-4 shrink-0" style={{ color: GREEN }} />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </div>

      {/* Mobile — branding top, login box dead-center, footer bottom */}
      <div className="lg:hidden absolute inset-0 pointer-events-none">
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 flex flex-col items-center text-center select-none pointer-events-auto">
          <img src={logoImg} alt="ASHCOL" className="w-24 h-24 object-contain mb-2 rounded-2xl drop-shadow-lg" />
          <h1 className="text-lg font-black tracking-tight leading-none text-white">ASHCOL</h1>
          <p className="text-[11px] font-semibold tracking-[0.38em] mt-1 pr-[0.38em]" style={{ color: GREEN }}>
            PORTAL
          </p>
          <p className="text-xs italic font-medium text-white/70 mt-1.5">keeping you cool.</p>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(100vw-2rem,360px)] pointer-events-auto">
          <LoginCard
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            rememberMe={rememberMe}
            setRememberMe={setRememberMe}
            loading={loading}
            error={error}
            handleLogin={handleLogin}
            compact
          />
        </div>

        <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-center space-y-1 pointer-events-auto">
          <a
            href={`https://${WEBSITE}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs font-semibold text-white/90"
          >
            {WEBSITE}
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="block text-[11px] text-white/75 break-all">
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </div>
  )
}

type LoginCardProps = {
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  showPassword: boolean
  setShowPassword: (v: boolean | ((p: boolean) => boolean)) => void
  rememberMe: boolean
  setRememberMe: (v: boolean | ((p: boolean) => boolean)) => void
  loading: boolean
  error: string
  handleLogin: (e: React.FormEvent) => void
  compact?: boolean
}

function LoginCard({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  rememberMe,
  setRememberMe,
  loading,
  error,
  handleLogin,
  compact = false,
}: LoginCardProps) {
  return (
    <div
      className={`w-full mx-auto rounded-[28px] ${
        compact ? 'max-w-[360px] px-5 py-6' : 'max-w-[420px] px-8 py-8 sm:px-9 sm:py-9'
      }`}
      style={{
        background: 'linear-gradient(165deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 100%)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow:
          '0 30px 80px -20px rgba(0,0,0,0.45), 0 0 0 1px rgba(16,185,129,0.12), inset 0 1px 0 rgba(255,255,255,0.95)',
      }}
    >
      <div className={compact ? 'mb-5' : 'mb-7'}>
        <h2
          className={`font-bold tracking-tight text-slate-900 ${compact ? 'text-2xl' : 'text-3xl'}`}
        >
          Welcome back
        </h2>
        <p className="text-sm text-slate-800 mt-1.5">
          Sign in to continue
        </p>
      </div>

      <form onSubmit={handleLogin} className={`flex flex-col ${compact ? 'gap-3.5' : 'gap-[18px]'}`}>
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-1.5">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-slate-400" />
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full rounded-xl pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 focus:border-emerald-500 transition-all ${
                compact ? 'min-h-[46px]' : 'min-h-[50px]'
              }`}
              placeholder="name@ashcol.com.ph"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-sm font-semibold text-slate-900">Password</label>
            <Link
              to={`/forgot-password?email=${encodeURIComponent(email.trim())}`}
              className="text-xs font-semibold hover:opacity-90 transition-opacity"
              style={{ color: GREEN }}
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`w-full rounded-xl pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 focus:border-emerald-500 transition-all ${
                compact ? 'min-h-[46px]' : 'min-h-[50px]'
              }`}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setRememberMe((r) => !r)}
            className="relative flex-shrink-0 w-[18px] h-[18px] rounded-md border-2 transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-500/35"
            style={{
              backgroundColor: rememberMe ? GREEN : 'transparent',
              borderColor: rememberMe ? GREEN : '#cbd5e1',
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
            className="text-sm font-medium text-slate-900 select-none cursor-pointer"
            onClick={() => setRememberMe((r) => !r)}
          >
            Remember me
          </span>
        </div>

        <p className="text-xs text-slate-500 text-center -mt-1 leading-relaxed">
          For account access, please contact your administrator.
        </p>

        <div className="min-h-[40px]">
          {error ? (
            <p className="text-sm text-red-700 text-center bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            compact ? 'min-h-[46px]' : 'min-h-[50px]'
          }`}
          style={{
            background: `linear-gradient(180deg, ${GREEN} 0%, ${LOGO_GREEN} 100%)`,
            boxShadow: '0 12px 24px -10px rgba(16, 185, 129, 0.45)',
          }}
        >
          {loading ? 'Signing in…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
