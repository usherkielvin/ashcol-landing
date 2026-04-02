import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth, getInitials } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Sun, Moon } from 'lucide-react'
import logoImg from '../assets/ash-logo.jpg'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'

  // ── Color tokens ──────────────────────────────────────────────
  const bg          = isLight ? '#f1f5f9'                    : '#060B18'
  const cardBg      = isLight ? '#ffffff'                    : 'rgba(15,26,46,0.85)'
  const border      = isLight ? '#e2e8f0'                    : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'                    : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'                    : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'                    : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'                    : '#243452'
  const inputText   = isLight ? '#0f172a'                    : '#ffffff'
  const orbGreen    = isLight ? 'rgba(16,185,129,0.06)'      : 'rgba(16,185,129,0.15)'
  const orbBlue     = isLight ? 'rgba(59,130,246,0.05)'      : 'rgba(59,130,246,0.1)'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const backendRes = await fetch(`${apiUrl}/auth/login`, {
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
      sessionStorage.setItem('ashcol-token', appToken)

      setUser({
        name: appUser.name || email,
        email: appUser.email || email,
        picture: appUser.profileImage || '',
        role: appUser.role || 'customer',
        initials: getInitials(appUser.name || email),
      })

      navigate('/dashboard')
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

        const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
        const backendRes = await fetch(`${apiUrl}/auth/google`, {
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
        sessionStorage.setItem('ashcol-token', appToken)

        setUser({
          name: appUser.name || profile.name || profile.email,
          email: appUser.email || profile.email,
          picture: appUser.profileImage || profile.picture || '',
          role: appUser.role || 'customer',
          initials: getInitials(appUser.name || profile.name || profile.email),
        })
        navigate('/dashboard')
      } catch (err: any) {
        console.error('Google Auth Error:', err)
        setError(err.message || 'Google sign-in failed. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    onError: () => setError('Google sign-in was cancelled.'),
  })

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-5 relative overflow-hidden font-['Inter',sans-serif]"
      style={{ backgroundColor: bg, color: textPrimary, transition: 'background-color 0.2s, color 0.2s' }}
    >
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 p-2.5 rounded-xl transition-all hover:scale-105 z-10"
        style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
        aria-label="Toggle theme"
      >
        {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />}
      </button>

      {/* Background Orbs */}
      <div className="absolute top-0 -left-64 w-[600px] h-[600px] pointer-events-none"
           style={{ background: `radial-gradient(circle, ${orbGreen} 0%, transparent 70%)`, filter: 'blur(60px)' }} />
      <div className="absolute bottom-0 -right-64 w-[600px] h-[600px] pointer-events-none"
           style={{ background: `radial-gradient(circle, ${orbBlue} 0%, transparent 70%)`, filter: 'blur(80px)' }} />

      {/* Main Content Card */}
      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <Link to="/" className="hover:opacity-80 transition-opacity mb-6">
            <img src={logoImg} alt="Ashcol Logo" className="w-20 h-20 object-contain rounded-xl drop-shadow-lg" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: textPrimary }}>Welcome Back</h1>
          <p className="text-sm text-center" style={{ color: textMuted }}>Sign in to access your Ashcol account.</p>
        </div>

        {/* Form Card */}
        <div
          className="rounded-2xl p-8 shadow-xl backdrop-blur-xl"
          style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
        >
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
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

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Password</label>
                <a href="#" className="text-xs text-[#10B981] hover:underline font-semibold">Forgot?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                className="w-full border rounded-xl px-4 py-3.5 placeholder-slate-400 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full py-3.5 rounded-xl font-bold text-white transition-all"
              style={loading
                ? { backgroundColor: inputBg, color: textMuted, border: `1px solid ${inputBorder}`, cursor: 'not-allowed' }
                : { backgroundColor: '#10B981', boxShadow: '0 0 20px rgba(16,185,129,0.25)' }
              }
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 border-t" style={{ borderColor: border }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: textMuted }}>Or</span>
            <div className="flex-1 border-t" style={{ borderColor: border }} />
          </div>

          {/* Google Sign-In */}
          <button
            onClick={() => loginWithGoogle()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#10B981'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = inputBorder}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <p className="mt-8 text-center text-sm" style={{ color: textMuted }}>
          Don't have an account?{' '}
          <Link to="/create-account" className="text-[#10B981] font-bold hover:underline">Get Started</Link>
        </p>
      </div>
    </div>
  )
}
