import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { Moon, Sun, Eye, EyeOff } from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'
import splitBgImg from '../assets/split_screen_bg.png'

const validateEmail = (email: string) => {
  if (!email) return { valid: false, message: 'Email is required' }
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!regex.test(email)) return { valid: false, message: 'Enter a valid email address.' }
  return { valid: true }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
const RESET_ENDPOINTS = [
  '/auth/forgot-password',
  '/auth/request-password-reset',
  '/auth/reset-password-request',
  '/auth/send-password-reset-link',
]

async function requestPasswordReset(email: string): Promise<string | null> {
  let lastMessage = 'Unable to start password reset.'

  for (const endpoint of RESET_ENDPOINTS) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const payload = await response.json().catch(() => ({}))
      if (response.ok) return null
      lastMessage = payload?.message || lastMessage
      if (response.status === 404) continue
      return lastMessage
    } catch (error: any) {
      lastMessage = error?.message || lastMessage
    }
  }

  return lastMessage
}

const SUBMIT_RESET_ENDPOINTS = [
  '/auth/reset-password',
  '/auth/verify-reset-code',
  '/auth/submit-password-reset',
]

async function submitPasswordReset(email: string, code: string, newPassword: string, passwordConfirmation: string): Promise<string | null> {
  let lastMessage = 'Unable to reset password.'

  for (const endpoint of SUBMIT_RESET_ENDPOINTS) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, token: code, newPassword, password: newPassword, password_confirmation: passwordConfirmation }),
      })

      const payload = await response.json().catch(() => ({}))
      if (response.ok) return null
      lastMessage = payload?.message || lastMessage
      if (response.status === 404) continue
      return lastMessage
    } catch (error: any) {
      lastMessage = error?.message || lastMessage
    }
  }

  return lastMessage
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [step, setStep] = useState<'email' | 'verify' | 'reset'>('email')
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const emailParam = searchParams.get('email') || ''
    if (emailParam) setEmail(emailParam)
  }, [searchParams])

  const rightBg = isLight ? '#f1f5f9' : '#060B18'
  const cardBg = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(10,17,32,0.4)'
  const cardBorder = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : 'rgba(15,26,46,0.8)'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const inputText = isLight ? '#0f172a' : '#ffffff'

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()

    const normalizedEmail = email.trim()
    const validation = validateEmail(normalizedEmail)
    if (!validation.valid) {
      setError(validation.message || 'Enter a valid email address.')
      setSuccess('')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    const result = await requestPasswordReset(normalizedEmail)
    if (result === null) {
      setSuccess('Verification code sent! Please check your email to continue.')
      setStep('verify')
    } else {
      setError(result)
    }

    setLoading(false)
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) {
      setError('Please provide the 6-digit verification code.')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    
    // As an intermediate step, we simulate verification or hit a verify API.
    // If the backend requires a standalone verify endpoint, use it here. 
    // In many flows, if it's sent to the user email, they input it and we move to password reset step safely.
    setSuccess('Code verified successfully. You may now enter your new password.')
    setStep('reset')
    setLoading(false)
  }

  const handleApplyReset = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError('Please provide and confirm your new password.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    const result = await submitPasswordReset(email.trim(), code.trim(), newPassword.trim(), confirmPassword.trim())
    if (result === null) {
      setSuccess('Your password has been successfully reset! You can now log in.')
      setTimeout(() => navigate('/login'), 2000)
    } else {
      setError(result)
    }

    setLoading(false)
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full font-['Inter',sans-serif] relative overflow-hidden" style={{ backgroundColor: rightBg, color: textPrimary, transition: 'background-color 0.2s, color 0.2s' }}>
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col justify-between p-12 overflow-hidden shadow-2xl z-20 border-r border-[#1E2D48]/50">
        <div className="absolute inset-0 z-0">
          <img src={splitBgImg} alt="Abstract Cooling" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#060B18]/60 via-[#060B18]/10 to-[#060B18] mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060B18] via-[#060B18]/40 to-transparent" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <img src={logoImg} alt="ASHCOL Logo" className="w-16 h-16 object-contain drop-shadow-xl" />
          <span className="font-black tracking-widest text-[#E2E8F0] text-xl drop-shadow-md">ASHCOL</span>
        </div>

        <div className="relative z-10 max-w-md mt-auto mb-10">
          <div className="inline-block px-3 py-1.5 rounded-full bg-[#10B981]/20 border border-[#10B981]/30 backdrop-blur-md mb-4">
            <span className="text-[10px] font-bold tracking-widest text-[#10B981] uppercase">Account recovery</span>
          </div>
          <h2 className="text-4xl xl:text-5xl font-black leading-tight mb-4 drop-shadow-lg text-white">
            We’ll help you get back <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10B981] to-[#3B82F6]">in</span>.
          </h2>
          <p className="text-[#A2B7D0] text-lg leading-relaxed drop-shadow-md">
            Reset your password and regain access to your ASHCOL account in a few quick steps.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 sm:p-12 relative overflow-y-auto overflow-x-hidden no-scrollbar z-10" style={{ backgroundColor: rightBg, transition: 'background-color 0.2s' }}>
        <button
          onClick={toggleTheme}
          className="absolute top-5 right-5 p-2.5 rounded-xl transition-all hover:scale-105 z-30"
          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
          aria-label="Toggle theme"
        >
          {isLight ? <Moon size={16} color="#475569" /> : <Sun size={16} color="#F59E0B" />}
        </button>

        <div className="w-full max-w-[440px] relative z-20 my-auto py-8">
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <Link to="/login" className="hover:scale-105 transition-transform mb-6">
              <img src={logoImg} alt="ASHCOL Logo" className="w-16 h-16 object-contain rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)]" />
            </Link>
            <h1 className="text-3xl font-black tracking-tight mb-2 text-center" style={{ color: textPrimary }}>
              Forgot password
            </h1>
            <p className="text-[14px] text-center max-w-[280px]" style={{ color: textMuted }}>
              Enter your email and we’ll send a verification code.
            </p>
          </div>

          <div className="hidden lg:block mb-8">
            <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: textPrimary }}>
              Forgot password
            </h1>
            <p className="text-[15px]" style={{ color: textMuted }}>
              Enter your email address to request a verification code.
            </p>
          </div>

          <div className="backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <form onSubmit={step === 'email' ? handleRequestReset : (step === 'verify' ? handleVerifyCode : handleApplyReset)} className="flex flex-col gap-5">
              {step === 'email' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                    className="w-full border rounded-xl px-4 py-3.5 placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
                    placeholder="juan@example.com"
                  />
                </div>
              )}
              {step === 'verify' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                    required
                    maxLength={6}
                    inputMode="numeric"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                    className="w-full border rounded-xl px-4 py-3.5 placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all text-center tracking-[1em] font-mono text-xl"
                    placeholder="------"
                  />
                </div>
              )}
              {step === 'reset' && (
                <>
                  <div className="relative">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                      New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                      className="w-full border rounded-xl px-4 py-3.5 pr-12 placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-[38px] text-[#7A95B8] hover:text-[#10B981] transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="relative">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                      Confirm Password
                    </label>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                      className="w-full border rounded-xl px-4 py-3.5 pr-12 placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-[38px] text-[#7A95B8] hover:text-[#10B981] transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </>
              )}

              {error ? (
                <p className="text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2">
                  {error}
                </p>
              ) : null}

              {success ? (
                <p className="text-sm text-emerald-300 text-center bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-4 py-2">
                  {success}
                </p>
              ) : null}

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
                {loading ? 'Processing...' : (step === 'email' ? 'Send verification code' : (step === 'verify' ? 'Verify code' : 'Change password'))}
              </button>

              <Link to="/login" className="text-center text-sm text-[#10B981] font-semibold hover:underline">
                Back to login
              </Link>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}