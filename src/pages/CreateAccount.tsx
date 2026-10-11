import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth, getInitials } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Sun, Moon, Eye, EyeOff, User, Mail, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import splitBgImg from '../assets/split_screen_bg.png'

export default function CreateAccount() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const phone = ''
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Verification step
  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [verificationCode, setVerificationCode] = useState('')
  
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'

  // ── Color tokens ──────────────────────────────────────────────
  const rightBg     = isLight ? '#f1f5f9'               : '#060B18'
  const textPrimary = isLight ? '#0f172a'                : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'                : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'                : 'rgba(15,26,46,0.8)'
  const inputBorder = isLight ? '#cbd5e1'                : '#243452'
  const inputText   = isLight ? '#0f172a'                : '#ffffff'
  const divBorder   = isLight ? '#e2e8f0'                : '#1E2D48'
  const googleBg    = isLight ? '#f8fafc'                : 'rgba(10,17,32,0.5)'

  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${apiUrl}/auth/send-signup-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || 'Failed to send verification code')
      }
      
      setStep('verify')
    } catch (err: any) {
      console.error('Send Code Error:', err)
      setError(err.message || 'Error communicating with server.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          email,
          phone,
          password,
          password_confirmation: password,
          role: 'customer',
          verification_code: verificationCode
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || 'Registration failed')
      }

      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Authentication failed')

      const appToken = data.data.token
      const appUser = data.data.user
      
      sessionStorage.setItem('ashcol-token', appToken)

      setUser({
        name: appUser.name || email,
        email: appUser.email || email,
        picture: appUser.profileImage || '',
        role: appUser.role || 'customer',
        initials: getInitials(appUser.name || email),
        branchId: appUser.branchId ?? null,
        jobTitle: appUser.jobTitle ?? null,
      })

      navigate('/dashboard')
    } catch (err: any) {
      console.error('Register Error:', err)
      setError(err.message || 'Invalid verification code or registration error.')
    } finally {
      setLoading(false)
    }
  }

  const signupWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true)
      setError('')
      try {
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        })
        if (!googleRes.ok) throw new Error('Failed to fetch profile')
        const profile = await googleRes.json()

        const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
        
        // Log in / Sign up with Google on backend
        const backendRes = await fetch(`${apiUrl}/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_token: tokenResponse.access_token,
            id_token: '',
            fcm_token: ''
          })
        })

        if (!backendRes.ok) {
          const errData = await backendRes.json().catch(() => ({}))
          throw new Error(errData.message || 'Server authentication failed')
        }

        const data = await backendRes.json()
        
        if (!data.success) {
          throw new Error(data.message || 'Authentication failed')
        }

        const appToken = data.data.token
        const appUser = data.data.user
        
        sessionStorage.setItem('ashcol-token', appToken)

        setUser({
          name: appUser.name || profile.name || profile.email,
          email: appUser.email || profile.email,
          picture: appUser.profileImage || profile.picture || '',
          role: appUser.role || 'customer',
          initials: getInitials(appUser.name || profile.name || profile.email),
          branchId: appUser.branchId ?? null,
          jobTitle: appUser.jobTitle ?? null,
        })

        navigate('/dashboard')
      } catch (err: any) {
        console.error('Google Auth Error:', err)
        setError(err.message || 'Google sign-up failed. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    onError: () => setError('Google sign-up was cancelled.'),
  })

  const inputFieldClass = "w-full border rounded-xl pl-10 pr-4 py-3.5 text-sm placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"

  return (
    <div className="flex h-screen w-full font-['Inter',sans-serif] overflow-hidden" style={{ backgroundColor: rightBg, color: textPrimary }}>

      {/* ── Left Branding Panel ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col justify-between p-12 overflow-hidden flex-shrink-0 border-r border-[#1E2D48]/50">
        <div className="absolute inset-0 z-0">
          <img src={splitBgImg} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#060B18]/70 via-[#060B18]/20 to-[#060B18]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060B18] via-[#060B18]/40 to-transparent" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <img src={logoImg} alt="ASHCOL Logo" className="w-14 h-14 object-contain drop-shadow-xl rounded-xl" />
          <span className="font-black tracking-widest text-[#E2E8F0] text-lg drop-shadow-md">ASHCOL</span>
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

      {/* ── Right Form Panel ── */}
      <div
        className="flex-1 flex flex-col items-center relative overflow-y-auto overflow-x-hidden no-scrollbar"
        style={{ backgroundColor: rightBg }}
      >
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-5 right-5 p-2.5 rounded-xl transition-all hover:scale-105 z-30"
          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
          aria-label="Toggle theme"
        >
          {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />}
        </button>

        {/* Ambient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-96 h-96 translate-x-1/3 -translate-y-1/3"
            style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div className="absolute bottom-0 left-0 w-96 h-96 -translate-x-1/3 translate-y-1/3"
            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        </div>

        <div className="w-full max-w-[500px] px-6 sm:px-10 py-10 relative z-10 my-auto">

          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-10 lg:hidden">
            <a href="https://ashcol.com.ph" className="hover:scale-105 transition-transform mb-5">
              <img src={logoImg} alt="ASHCOL Logo" className="w-14 h-14 object-contain rounded-2xl shadow-[0_0_24px_rgba(16,185,129,0.3)]" />
            </a>
            <h1 className="text-3xl font-black tracking-tight mb-2 text-center" style={{ color: textPrimary }}>Create Account</h1>
            <p className="text-sm text-center max-w-[260px]" style={{ color: textMuted }}>
              Join ASHCOL to access our professional AC services.
            </p>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-9">
            <h1 className="text-[32px] font-black tracking-tight leading-tight mb-2" style={{ color: textPrimary }}>
              Create an account
            </h1>
            <p className="text-[15px]" style={{ color: textMuted }}>Fill out the form below to get started.</p>
          </div>

          {step === 'form' ? (
            <form className="flex flex-col gap-5">

              {/* Name row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold mb-2" style={{ color: textMuted }}>First Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, ''))} required
                      placeholder="Juan"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                      className={inputFieldClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold mb-2" style={{ color: textMuted }}>Last Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, ''))} required
                      placeholder="Dela Cruz"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                      className={inputFieldClass}
                    />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[12px] font-semibold mb-2" style={{ color: textMuted }}>Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="juan@example.com"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                    className={inputFieldClass}
                  />
                </div>
              </div>

              {/* Phone
              <div>
                <label className="block text-[12px] font-semibold mb-2" style={{ color: textMuted }}>Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9+]/g, ''))} required
                    placeholder="09170000000"
                    maxLength={13}
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                    className={inputFieldClass}
                  />
                </div>
              </div>
              */}

              {/* Password */}
              <div>
                <label className="block text-[12px] font-semibold mb-2" style={{ color: textMuted }}>Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Minimum 8 characters"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                    className={`${inputFieldClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#10B981] transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] mt-2" style={{ color: textMuted }}>Must be at least 8 characters long.</p>
              </div>

              {/* Terms */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" required className="mt-0.5 accent-[#10B981] w-4 h-4 flex-shrink-0" />
                <span className="text-[13px] leading-relaxed" style={{ color: textMuted }}>
                  I agree to ASHCOL's{' '}
                  <a href="#" className="text-[#10B981] hover:underline font-medium">Terms</a>{' '}
                  and{' '}
                  <a href="#" className="text-[#10B981] hover:underline font-medium">Privacy Policy</a>.
                </span>
              </label>

              {error && (
                <div className="text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <button
                disabled={loading}
                onClick={handleSendCode}
                type="button"
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-[15px] mt-1 transition-all ${
                  loading
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-[#10B981] hover:bg-emerald-400 text-[#060B18] shadow-[0_4px_24px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_32px_rgba(16,185,129,0.45)]'
                }`}
              >
                {loading ? 'Sending Code...' : 'Create Account'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 border-t" style={{ borderColor: divBorder }} />
                <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: textMuted }}>or</span>
                <div className="flex-1 border-t" style={{ borderColor: divBorder }} />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={() => signupWithGoogle()}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-[14px] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#10B981]"
                style={{ backgroundColor: googleBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#10B981'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = inputBorder}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign up with Google
              </button>
            </form>
          ) : (
            /* ── Verify step ── */
            <form onSubmit={handleRegister} className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center gap-3 py-2">
                <div className="w-14 h-14 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-[#10B981]" />
                </div>
                <div>
                  <h3 className="font-bold text-xl mb-1" style={{ color: textPrimary }}>Verify Your Email</h3>
                  <p className="text-sm" style={{ color: textMuted }}>
                    We sent a 6-digit code to<br />
                    <strong className="text-[#10B981] font-semibold">{email}</strong>
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold mb-2 text-center" style={{ color: textMuted }}>
                  Verification Code
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={e => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))}
                  required
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="— — — — — —"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                  className="w-full border rounded-xl px-4 py-4 text-center tracking-[10px] text-xl font-black focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"
                />
              </div>

              {error && (
                <div className="text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-[15px] transition-all ${
                  loading
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-[#10B981] hover:bg-emerald-400 text-[#060B18] shadow-[0_4px_24px_rgba(16,185,129,0.3)]'
                }`}
              >
                {loading ? 'Verifying...' : 'Complete Registration'}
              </button>

              <button
                type="button"
                onClick={() => setStep('form')}
                className="flex items-center justify-center gap-2 text-sm font-semibold py-2 transition-colors hover:text-[#10B981]"
                style={{ color: textMuted }}
              >
                <ArrowLeft className="w-4 h-4" /> Back to edit details
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-[13px] font-medium" style={{ color: textMuted }}>
            Already have an account?{' '}
            <Link to="/login" className="text-[#10B981] font-bold hover:underline">Login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
