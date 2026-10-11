import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Calendar, CheckCircle2, Clock, Eye, EyeOff, Loader2, Lock, Mail, Moon,
  Phone, ShieldCheck, Sun, User, UserCircle2,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import {
  fetchPublicBranches, isOpenSignupAvailable, registerMember, resolveMemberInvite, sendMemberSignupCode,
  type MemberInviteView,
} from '../utils/memberInviteApi'
import logoImg from '../assets/ash-logo.jpg'
import splitBgImg from '../assets/split_screen_bg.png'

interface Form {
  branchId: string
  name: string
  nickname: string
  email: string
  personalEmail: string
  samePersonal: boolean
  phone: string
  birthDate: string
  dateHired: string
  password: string
  confirm: string
  code: string
}

type Errors = Partial<Record<keyof Form, string>>

const EMPTY: Form = {
  branchId: '', name: '', nickname: '', email: '', personalEmail: '', samePersonal: true, phone: '',
  birthDate: '', dateHired: '', password: '', confirm: '', code: '',
}

const STEPS = [
  { id: 1, title: 'Who you are', hint: 'Tell us your name.' },
  { id: 2, title: 'How to reach you', hint: 'Your login email and phone number.' },
  { id: 3, title: 'Important dates', hint: 'Your birthdate and when you started.' },
  { id: 4, title: 'Secure your account', hint: 'Choose a password you will remember.' },
  { id: 5, title: 'Verify your email', hint: 'Enter the 6-digit code we emailed you.' },
  { id: 6, title: 'Review & submit', hint: 'Check everything before you send it.' },
] as const

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DRAFT_KEY = 'ashcol-join-draft'

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function validateStep(step: number, f: Form, needsBranch: boolean): Errors {
  const e: Errors = {}
  if (step === 1) {
    if (needsBranch && !f.branchId) e.branchId = 'Choose your branch.'
    if (f.name.trim().length < 2) e.name = 'Enter your full name.'
  }
  if (step === 2) {
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address.'
    if (!f.samePersonal && !EMAIL_RE.test(f.personalEmail.trim())) e.personalEmail = 'Enter a valid personal email.'
    if (!/^\+?\d{10,13}$/.test(f.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a valid mobile number, e.g. 09171234567.'
  }
  if (step === 3) {
    const maxBirth = new Date()
    maxBirth.setFullYear(maxBirth.getFullYear() - 15)
    if (!f.birthDate) e.birthDate = 'Enter your birthdate.'
    else if (f.birthDate > isoDate(maxBirth) || f.birthDate < '1930-01-01') e.birthDate = 'Enter a valid birthdate.'
    if (f.dateHired && (f.dateHired < '1990-01-01' || f.dateHired > isoDate(new Date(Date.now() + 365 * 86400000)))) {
      e.dateHired = 'Enter a valid date.'
    }
  }
  if (step === 4) {
    if (f.password.length < 8) e.password = 'Use at least 8 characters.'
    if (f.confirm !== f.password) e.confirm = 'Passwords do not match.'
  }
  if (step === 5) {
    if (!/^\d{6}$/.test(f.code)) e.code = 'Enter the 6-digit code.'
  }
  return e
}

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  const meta = [
    { label: 'Too short', color: '#EF4444' },
    { label: 'Weak', color: '#F97316' },
    { label: 'Okay', color: '#F59E0B' },
    { label: 'Good', color: '#10B981' },
    { label: 'Strong', color: '#059669' },
  ]
  return { score, ...meta[pw.length === 0 ? 0 : score] }
}

function loadDraft(draftKey: string): { form: Form; step: number } {
  try {
    const raw = sessionStorage.getItem(`${DRAFT_KEY}:${draftKey}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Password and code are never persisted, so a refresh never lands past the password page.
      return { form: { ...EMPTY, ...parsed.form, password: '', confirm: '', code: '' }, step: Math.min(parsed.step ?? 1, 4) }
    }
  } catch { /* storage unavailable — start fresh */ }
  return { form: EMPTY, step: 1 }
}

export default function JoinTeam() {
  // No token = the open /register page; the member always picks their own branch there.
  const { token: tokenParam } = useParams()
  const token = tokenParam ?? null
  const draftKey = token ?? 'open'
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'

  const [invite, setInvite] = useState<MemberInviteView | null>(null)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [linkState, setLinkState] = useState<'loading' | 'ok' | 'dead' | 'error'>('loading')
  const [form, setForm] = useState<Form>(() => loadDraft(draftKey).form)
  const [step, setStep] = useState<number>(() => loadDraft(draftKey).step)
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [done, setDone] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd')

  const rightBg = isLight ? '#f1f5f9' : '#060B18'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : 'rgba(15,26,46,0.8)'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const inputText = isLight ? '#0f172a' : '#ffffff'
  const cardBg = isLight ? '#ffffff' : 'rgba(15,26,46,0.6)'

  useEffect(() => {
    let cancelled = false
    const lookup = token
      ? resolveMemberInvite(token)
      : isOpenSignupAvailable().then(open => (open ? { branchName: null, expiresAt: '' } : null))
    lookup
      .then(view => {
        if (cancelled) return
        setInvite(view)
        setLinkState(view ? 'ok' : 'dead')
      })
      .catch(() => { if (!cancelled) setLinkState('error') })
    return () => { cancelled = true }
  }, [token])

  const needsBranch = linkState === 'ok' && !invite?.branchName
  useEffect(() => {
    if (!needsBranch) return
    fetchPublicBranches().then(setBranches).catch(() => setBranches([]))
  }, [needsBranch])

  useEffect(() => {
    if (done) return
    try {
      // Secrets (password, code) are deliberately left out of the draft.
      const safe = { ...form, password: '', confirm: '', code: '' }
      sessionStorage.setItem(`${DRAFT_KEY}:${draftKey}`, JSON.stringify({ form: safe, step: Math.min(step, 4) }))
    } catch { /* ignore */ }
  }, [form, step, draftKey, done])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const strength = useMemo(() => passwordStrength(form.password), [form.password])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
    setServerError('')
  }

  const goBack = () => {
    setDirection('back')
    setServerError('')
    setErrors({})
    setStep(s => Math.max(1, s - 1))
  }

  const sendCode = async () => {
    await sendMemberSignupCode(form.email.trim())
    setCooldown(30)
  }

  const goNext = async () => {
    const errs = validateStep(step, form, needsBranch)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setServerError('')
    setDirection('fwd')
    if (step === 4) {
      setBusy(true)
      try {
        await sendCode()
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Could not send the verification code.')
        setBusy(false)
        return
      }
      setBusy(false)
    }
    setStep(s => Math.min(6, s + 1))
  }

  const submit = async () => {
    setBusy(true)
    setServerError('')
    try {
      await registerMember(token, {
        name: form.name.trim(),
        nickname: form.nickname.trim(),
        email: form.email.trim().toLowerCase(),
        personalEmail: form.samePersonal ? '' : form.personalEmail.trim().toLowerCase(),
        phone: form.phone.replace(/[\s-]/g, ''),
        birthDate: form.birthDate,
        dateHired: form.dateHired || null,
        branchId: needsBranch ? form.branchId : undefined,
        password: form.password,
        verificationCode: form.code,
      })
      try { sessionStorage.removeItem(`${DRAFT_KEY}:${draftKey}`) } catch { /* ignore */ }
      setDone(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create your account.'
      setServerError(msg)
      if (/verification|code/i.test(msg)) {
        setDirection('back')
        setForm(f => ({ ...f, code: '' }))
        setStep(5)
      }
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy && step < 6 && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      void goNext()
    }
  }

  const inputCls = (hasError?: string) =>
    `w-full border rounded-xl pl-10 pr-4 py-3.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
      hasError ? 'focus:border-red-400 focus:ring-red-400/20' : 'focus:border-[#10B981] focus:ring-[#10B981]/20'
    }`
  const inputStyle = (hasError?: string) => ({
    backgroundColor: inputBg, borderColor: hasError ? '#F87171' : inputBorder, color: inputText,
  })

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen w-full font-['Inter',sans-serif]" style={{ backgroundColor: rightBg, color: textPrimary }}>
      <style>{`
        @keyframes joinFwd { from { opacity: 0; transform: translateX(28px) } to { opacity: 1; transform: none } }
        @keyframes joinBack { from { opacity: 0; transform: translateX(-28px) } to { opacity: 1; transform: none } }
        @keyframes joinPop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
      `}</style>

      <div className="hidden lg:flex lg:w-[42%] xl:w-1/2 relative flex-col justify-between p-12 overflow-hidden flex-shrink-0 border-r border-[#1E2D48]/50 sticky top-0 h-screen">
        <div className="absolute inset-0 z-0">
          <img src={splitBgImg} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#060B18]/70 via-[#060B18]/20 to-[#060B18]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060B18] via-[#060B18]/40 to-transparent" />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <img src={logoImg} alt="ASHCOL Logo" className="w-14 h-14 object-contain drop-shadow-xl rounded-xl" />
          <span className="font-black tracking-widest text-[#E2E8F0] text-lg drop-shadow-md">ASHCOL</span>
        </div>
        <div className="relative z-10 max-w-md my-auto p-8 rounded-3xl bg-[#060B18]/65 border border-[#1E2D48]/50 backdrop-blur-md shadow-2xl flex flex-col gap-5">
          <h2 className="text-3xl xl:text-4xl font-black leading-tight text-white">
            Join the <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10B981] to-[#3B82F6]">ASHCOL team</span>
          </h2>
          <p className="text-[#A2B7D0] text-sm leading-relaxed">
            Create your member account in a few quick steps. An admin reviews every sign-up before you can log in.
          </p>
          {invite?.branchName && (
            <div className="text-[11px] font-semibold text-[#64748b] tracking-wider uppercase pt-4 border-t border-[#1E2D48]/40">
              Registering for <span className="text-[#10B981]">{invite.branchName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center relative overflow-x-hidden">
        <button
          onClick={toggleTheme}
          className="absolute top-5 right-5 p-2.5 rounded-xl transition-all hover:scale-105 z-30"
          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
          aria-label="Toggle theme"
        >
          {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />}
        </button>
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-96 h-96 translate-x-1/3 -translate-y-1/3"
            style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div className="absolute bottom-0 left-0 w-96 h-96 -translate-x-1/3 translate-y-1/3"
            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        </div>
        <div className="w-full max-w-[520px] px-6 sm:px-10 py-10 relative z-10 my-auto">{children}</div>
      </div>
    </div>
  )

  if (linkState === 'loading') {
    return shell(
      <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-[#10B981]" /></div>,
    )
  }

  if (linkState !== 'ok') {
    return shell(
      <div className="flex flex-col items-center text-center gap-4 py-16">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center">
          <Clock className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-black" style={{ color: textPrimary }}>
          {linkState === 'dead' ? (token ? 'This link is no longer active' : 'Registration is closed') : 'Could not open this page'}
        </h1>
        <p className="text-sm max-w-xs" style={{ color: textMuted }}>
          {linkState === 'dead'
            ? (token ? 'Ask your admin for a new registration link.' : 'Ask your admin for a registration link.')
            : 'Check your connection and refresh the page.'}
        </p>
        <Link to="/login" className="text-[#10B981] font-bold text-sm hover:underline mt-2">Go to login</Link>
      </div>,
    )
  }

  if (done) {
    return shell(
      <div className="flex flex-col items-center text-center gap-5 py-12">
        <div
          className="w-20 h-20 rounded-3xl bg-[#10B981]/15 border border-[#10B981]/35 flex items-center justify-center"
          style={{ animation: 'joinPop .5s cubic-bezier(.16,1,.3,1)' }}
        >
          <CheckCircle2 className="w-10 h-10 text-[#10B981]" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: textPrimary }}>You're registered!</h1>
          <p className="text-sm max-w-sm mx-auto leading-relaxed" style={{ color: textMuted }}>
            Thanks, {form.name.trim().split(/\s+/)[0]}. An admin will review your account and email you as soon as it's
            approved. You can log in after that.
          </p>
        </div>
        <Link
          to="/login"
          className="mt-2 px-8 py-3.5 rounded-xl font-bold text-[15px] bg-[#10B981] hover:bg-emerald-400 text-[#060B18] shadow-[0_4px_24px_rgba(16,185,129,0.3)] transition-all"
        >
          Go to login
        </Link>
      </div>,
    )
  }

  const current = STEPS[step - 1]
  const field = (label: string, icon: React.ReactNode, input: React.ReactNode, error?: string, hint?: string) => (
    <div>
      <label className="block text-[12px] font-semibold mb-2" style={{ color: textMuted }}>{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        {input}
      </div>
      {error ? <p className="text-[12px] text-red-400 mt-1.5">{error}</p>
        : hint ? <p className="text-[11px] mt-1.5" style={{ color: textMuted }}>{hint}</p> : null}
    </div>
  )

  const maxBirth = new Date()
  maxBirth.setFullYear(maxBirth.getFullYear() - 15)

  const reviewRow = (label: string, value: string, editStep: number) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0" style={{ borderColor: inputBorder }}>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>{label}</div>
        <div className="text-sm font-semibold break-words" style={{ color: textPrimary }}>{value || '—'}</div>
      </div>
      <button
        type="button"
        onClick={() => { setDirection('back'); setStep(editStep) }}
        className="text-[12px] font-bold text-[#10B981] hover:underline shrink-0"
      >
        Edit
      </button>
    </div>
  )

  return shell(
    <div onKeyDown={onKeyDown}>
      <div className="flex flex-col items-center mb-8 lg:hidden">
        <img src={logoImg} alt="ASHCOL Logo" className="w-14 h-14 object-contain rounded-2xl shadow-[0_0_24px_rgba(16,185,129,0.3)] mb-3" />
        {invite?.branchName && <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Joining {invite.branchName}</p>}
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-bold uppercase tracking-wider text-[#10B981]">Step {step} of {STEPS.length}</span>
          <span className="text-[12px] font-semibold" style={{ color: textMuted }}>{Math.round((step / STEPS.length) * 100)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: inputBorder }}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[#3B82F6] transition-all duration-500"
            style={{ width: `${(step / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div key={step} style={{ animation: `${direction === 'fwd' ? 'joinFwd' : 'joinBack'} .35s cubic-bezier(.16,1,.3,1)` }}>
        <h1 className="text-[28px] sm:text-[32px] font-black tracking-tight leading-tight mb-1.5" style={{ color: textPrimary }}>{current.title}</h1>
        <p className="text-[15px] mb-7" style={{ color: textMuted }}>{current.hint}</p>

        <div className="flex flex-col gap-5">
          {step === 1 && (
            <>
              {needsBranch && (
                <div>
                  <label className="block text-[12px] font-semibold mb-2" style={{ color: textMuted }}>Branch</label>
                  <select
                    value={form.branchId}
                    onChange={e => set('branchId', e.target.value)}
                    className="w-full border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 transition-all focus:border-[#10B981] focus:ring-[#10B981]/20"
                    style={inputStyle(errors.branchId)}
                  >
                    <option value="">Select your branch</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {errors.branchId && <p className="text-[12px] text-red-400 mt-1.5">{errors.branchId}</p>}
                </div>
              )}
              {field('Full name', <User className="w-4 h-4" />,
                <input autoFocus value={form.name} onChange={e => set('name', e.target.value.replace(/[^a-zA-ZÀ-ÿ\s.'-]/g, ''))}
                  placeholder="Juan Dela Cruz" autoComplete="name" className={inputCls(errors.name)} style={inputStyle(errors.name)} />,
                errors.name)}
              {field('Nickname (optional)', <UserCircle2 className="w-4 h-4" />,
                <input value={form.nickname} onChange={e => set('nickname', e.target.value)} placeholder="Juan"
                  autoComplete="nickname" className={inputCls()} style={inputStyle()} />,
                undefined, 'What your teammates call you.')}
            </>
          )}

          {step === 2 && (
            <>
              {field('Login email', <Mail className="w-4 h-4" />,
                <input autoFocus type="email" value={form.email} onChange={e => set('email', e.target.value.trim().toLowerCase())}
                  placeholder="juan@ashcol.com.ph" autoComplete="email" className={inputCls(errors.email)} style={inputStyle(errors.email)} />,
                errors.email, "You'll sign in with this email, and we'll send a verification code to it.")}
              <label className="flex items-center gap-3 cursor-pointer -mt-1">
                <input type="checkbox" checked={form.samePersonal} onChange={e => set('samePersonal', e.target.checked)}
                  className="accent-[#10B981] w-4 h-4" />
                <span className="text-[13px]" style={{ color: textMuted }}>My personal email is the same</span>
              </label>
              {!form.samePersonal && field('Personal email', <Mail className="w-4 h-4" />,
                <input type="email" value={form.personalEmail} onChange={e => set('personalEmail', e.target.value.trim().toLowerCase())}
                  placeholder="juan@gmail.com" className={inputCls(errors.personalEmail)} style={inputStyle(errors.personalEmail)} />,
                errors.personalEmail)}
              {field('Mobile number', <Phone className="w-4 h-4" />,
                <input type="tel" inputMode="tel" value={form.phone} onChange={e => set('phone', e.target.value.replace(/[^0-9+\s-]/g, ''))}
                  placeholder="0917 123 4567" maxLength={16} autoComplete="tel" className={inputCls(errors.phone)} style={inputStyle(errors.phone)} />,
                errors.phone)}
            </>
          )}

          {step === 3 && (
            <>
              {field('Birthdate', <Calendar className="w-4 h-4" />,
                <input autoFocus type="date" value={form.birthDate} max={isoDate(maxBirth)} min="1930-01-01"
                  onChange={e => set('birthDate', e.target.value)} autoComplete="bday"
                  className={inputCls(errors.birthDate)} style={inputStyle(errors.birthDate)} />,
                errors.birthDate)}
              {field('Date hired (optional)', <Calendar className="w-4 h-4" />,
                <input type="date" value={form.dateHired} min="1990-01-01"
                  onChange={e => set('dateHired', e.target.value)}
                  className={inputCls(errors.dateHired)} style={inputStyle(errors.dateHired)} />,
                errors.dateHired, 'Leave blank if you are not sure — HR can fill it in.')}
            </>
          )}

          {step === 4 && (
            <>
              {field('Password', <Lock className="w-4 h-4" />,
                <>
                  <input autoFocus type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={e => set('password', e.target.value)} placeholder="At least 8 characters"
                    autoComplete="new-password" className={`${inputCls(errors.password)} pr-11`} style={inputStyle(errors.password)} />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#10B981]" aria-label="Show password">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </>,
                errors.password)}
              {form.password && (
                <div className="-mt-2">
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="h-1.5 flex-1 rounded-full transition-colors"
                        style={{ backgroundColor: i < strength.score ? strength.color : inputBorder }} />
                    ))}
                  </div>
                  <p className="text-[11px] mt-1.5 font-semibold" style={{ color: strength.color }}>{strength.label}</p>
                </div>
              )}
              {field('Confirm password', <Lock className="w-4 h-4" />,
                <input type={showPw ? 'text' : 'password'} value={form.confirm} onChange={e => set('confirm', e.target.value)}
                  placeholder="Type it again" autoComplete="new-password" className={inputCls(errors.confirm)} style={inputStyle(errors.confirm)} />,
                errors.confirm)}
            </>
          )}

          {step === 5 && (
            <>
              <div className="flex items-center gap-3 rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: inputBorder }}>
                <div className="w-11 h-11 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-[#10B981]" />
                </div>
                <p className="text-sm" style={{ color: textMuted }}>
                  We sent a code to <strong className="text-[#10B981] break-all">{form.email}</strong>
                </p>
              </div>
              <div>
                <input
                  autoFocus
                  value={form.code}
                  onChange={e => set('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="······"
                  className="w-full border rounded-xl px-4 py-4 text-center tracking-[12px] text-2xl font-black focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"
                  style={inputStyle(errors.code)}
                />
                {errors.code && <p className="text-[12px] text-red-400 mt-1.5 text-center">{errors.code}</p>}
              </div>
              <button
                type="button"
                disabled={cooldown > 0 || busy}
                onClick={async () => {
                  setBusy(true)
                  try { await sendCode(); setServerError('') }
                  catch (err) { setServerError(err instanceof Error ? err.message : 'Could not resend the code.') }
                  finally { setBusy(false) }
                }}
                className="text-[13px] font-bold text-[#10B981] disabled:opacity-50 disabled:cursor-not-allowed hover:underline self-center"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </>
          )}

          {step === 6 && (
            <>
              <div className="rounded-2xl border px-5" style={{ backgroundColor: cardBg, borderColor: inputBorder }}>
                {needsBranch && reviewRow('Branch', branches.find(b => b.id === form.branchId)?.name ?? '', 1)}
                {reviewRow('Name', form.nickname.trim() ? `${form.name.trim()} (${form.nickname.trim()})` : form.name.trim(), 1)}
                {reviewRow('Login email', form.email, 2)}
                {reviewRow('Personal email', form.samePersonal ? form.email : form.personalEmail, 2)}
                {reviewRow('Mobile number', form.phone, 2)}
                {reviewRow('Birthdate', form.birthDate, 3)}
                {reviewRow('Date hired', form.dateHired, 3)}
              </div>
              <div className="flex items-start gap-3 rounded-xl px-4 py-3 border" style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
                <ShieldCheck className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
                <p className="text-[13px] leading-relaxed" style={{ color: textMuted }}>
                  Your account is created as a <strong style={{ color: textPrimary }}>Member</strong>
                  {(invite?.branchName ?? branches.find(b => b.id === form.branchId)?.name) ? <> of <strong style={{ color: textPrimary }}>{invite?.branchName ?? branches.find(b => b.id === form.branchId)?.name}</strong></> : null}.
                  An admin approves it before you can log in.
                </p>
              </div>
            </>
          )}
        </div>

        {serverError && (
          <div className="mt-5 text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
            {serverError}
          </div>
        )}

        <div className="flex items-center gap-3 mt-8">
          {step > 1 && (
            <button
              type="button"
              onClick={goBack}
              disabled={busy}
              className="flex items-center justify-center gap-2 px-5 py-4 rounded-xl font-bold text-[15px] border transition-all hover:border-[#10B981] disabled:opacity-50"
              style={{ borderColor: inputBorder, color: textPrimary, backgroundColor: inputBg }}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={step === 6 ? submit : goNext}
            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-[15px] transition-all ${
              busy
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-[#10B981] hover:bg-emerald-400 text-[#060B18] shadow-[0_4px_24px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_32px_rgba(16,185,129,0.45)]'
            }`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {step === 6 ? (busy ? 'Creating account…' : 'Create my account') : step === 4 ? (busy ? 'Sending code…' : 'Send verification code') : 'Continue'}
            {!busy && step < 6 && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>

        <p className="mt-8 text-center text-[13px] font-medium" style={{ color: textMuted }}>
          Already approved?{' '}
          <Link to="/login" className="text-[#10B981] font-bold hover:underline">Log in</Link>
        </p>
      </div>
    </div>,
  )
}
