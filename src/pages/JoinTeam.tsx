import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Building2, Calendar, Check, CheckCircle2, Clock, Eye, EyeOff, Loader2, Lock, Mail,
  Moon, Phone, ShieldCheck, Sun, User, UserCircle2,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import {
  fetchPublicBranches, isOpenSignupAvailable, registerMember, resolveMemberInvite, sendMemberSignupCode,
  type MemberInviteView,
} from '../utils/memberInviteApi'

interface Form {
  branchId: string
  firstName: string
  lastName: string
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

type FieldKey = keyof Form
type Errors = Partial<Record<FieldKey, string>>

const EMPTY: Form = {
  branchId: '', firstName: '', lastName: '', nickname: '', email: '', personalEmail: '', samePersonal: true, phone: '',
  birthDate: '', dateHired: '', password: '', confirm: '', code: '',
}

const STEPS = [
  { id: 1, short: 'You', title: 'Who you are', hint: 'Tell us your name and where you work.' },
  { id: 2, short: 'Contact', title: 'How to reach you', hint: 'Your login email and mobile number.' },
  { id: 3, short: 'Dates', title: 'Important dates', hint: 'Your birthdate and when you started.' },
  { id: 4, short: 'Password', title: 'Secure your account', hint: 'Choose a password you will remember.' },
  { id: 5, short: 'Verify', title: 'Verify your email', hint: 'Enter the 6-digit code we emailed you.' },
  { id: 6, short: 'Review', title: 'Review & submit', hint: 'Check everything before you send it.' },
] as const

/** Which fields belong to which page — used to reveal errors when someone taps a locked Continue. */
const STEP_FIELDS: Record<number, FieldKey[]> = {
  1: ['branchId', 'firstName', 'lastName', 'nickname'],
  2: ['email', 'personalEmail', 'phone'],
  3: ['birthDate', 'dateHired'],
  4: ['password', 'confirm'],
  5: ['code'],
  6: [],
}

/** Square ASHCOL box mark (public/ashcol-icon.png). */
const logoImg = '/ashcol-icon.png'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/
const PH_MOBILE_RE = /^(09\d{9}|\+639\d{9}|639\d{9})$/
const MIN_AGE = 18
const DRAFT_KEY = 'ashcol-join-draft'

function isoDate(d: Date): string {
  const copy = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return copy.toISOString().split('T')[0]
}

function yearsAgo(years: number): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d
}

function titleCase(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

function fullNameOf(f: Pick<Form, 'firstName' | 'lastName'>): string {
  return titleCase(`${f.firstName} ${f.lastName}`)
}

function cleanPhone(s: string): string {
  return s.replace(/[\s-]/g, '')
}

function validate(f: Form, needsBranch: boolean): Errors {
  const e: Errors = {}

  // Step 1
  if (needsBranch && !f.branchId) e.branchId = 'Choose your branch.'
  const letters = (v: string) => v.replace(/[^A-Za-zÀ-ÿ]/g, '').length
  if (!f.firstName.trim()) e.firstName = 'Enter your first name.'
  else if (letters(f.firstName) < 2) e.firstName = 'Enter your full first name.'
  if (!f.lastName.trim()) e.lastName = 'Enter your last name.'
  else if (letters(f.lastName) < 2) e.lastName = 'Enter your full last name.'
  if (f.nickname.trim().length > 30) e.nickname = 'Keep your nickname under 30 characters.'

  // Step 2
  if (!f.email.trim()) e.email = 'Enter your login email.'
  else if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email, like name@ashcol.com.ph.'
  if (!f.samePersonal) {
    if (!f.personalEmail.trim()) e.personalEmail = 'Enter your personal email.'
    else if (!EMAIL_RE.test(f.personalEmail.trim())) e.personalEmail = 'Enter a valid personal email.'
  }
  const phone = cleanPhone(f.phone)
  if (!phone) e.phone = 'Enter your mobile number.'
  else if (!PH_MOBILE_RE.test(phone)) e.phone = 'Use a Philippine mobile number, like 0917 123 4567.'

  // Step 3
  if (!f.birthDate) e.birthDate = 'Enter your birthdate.'
  else if (f.birthDate < '1940-01-01') e.birthDate = 'Enter a valid birthdate.'
  else if (f.birthDate > isoDate(yearsAgo(MIN_AGE))) e.birthDate = `You must be at least ${MIN_AGE} years old.`
  if (f.dateHired) {
    const soon = new Date()
    soon.setDate(soon.getDate() + 90)
    if (f.dateHired < '1990-01-01') e.dateHired = 'Enter a valid date.'
    else if (f.dateHired > isoDate(soon)) e.dateHired = 'That date is too far ahead.'
    else if (f.birthDate && f.dateHired < f.birthDate) e.dateHired = 'Date hired cannot be before your birthdate.'
  }

  // Step 4
  if (!f.password) e.password = 'Create a password.'
  else if (f.password.length < 8) e.password = 'Use at least 8 characters.'
  else if (f.password.length > 64) e.password = 'Use 64 characters or fewer.'
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Include at least one letter and one number.'
  if (!f.confirm) e.confirm = 'Type your password again.'
  else if (f.confirm !== f.password) e.confirm = 'Passwords do not match.'

  // Step 5
  if (!/^\d{6}$/.test(f.code)) e.code = 'Enter the 6-digit code.'
  return e
}

function stepHasErrors(step: number, errors: Errors): boolean {
  return STEP_FIELDS[step].some(k => errors[k])
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

interface Tokens {
  textPrimary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  inputText: string
  cardBg: string
}

/** Vertical step list for the sidebar: done steps tick, the current step is highlighted. */
function StepList({ current }: { current: number }) {
  return (
    <ol className="flex flex-col" aria-label="Registration progress">
      {STEPS.map((s, i) => {
        const done = s.id < current
        const active = s.id === current
        return (
          <li key={s.id} className="flex gap-3.5" aria-current={active ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black shrink-0 transition-all duration-300"
                style={{
                  backgroundColor: done ? '#34d399' : active ? '#ffffff' : 'rgba(255,255,255,0.08)',
                  color: done ? '#052e22' : active ? '#0b3d2e' : 'rgba(255,255,255,0.55)',
                  boxShadow: active ? '0 0 0 5px rgba(255,255,255,0.14)' : 'none',
                }}
              >
                {done ? <Check className="w-4 h-4" strokeWidth={3} /> : s.id}
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-0.5 flex-1 my-1 min-h-[18px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  <div className="w-full bg-[#34d399] transition-all duration-500" style={{ height: done ? '100%' : '0%' }} />
                </div>
              )}
            </div>
            <div className="pb-5 pt-1 min-w-0">
              <div className="text-[13px] font-bold leading-tight transition-colors"
                style={{ color: active ? '#ffffff' : done ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)' }}>
                {s.title}
              </div>
              {active && <div className="text-[12px] mt-1 leading-snug" style={{ color: 'rgba(255,255,255,0.65)' }}>{s.hint}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Compact progress for phones, where the sidebar is hidden. */
function MobileProgress({ current, t }: { current: number; t: Tokens }) {
  return (
    <div className="md:hidden mb-3 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#10B981]">Step {current} of {STEPS.length}</span>
        <span className="text-[11px] font-semibold" style={{ color: t.textMuted }}>{STEPS[current - 1].short}</span>
      </div>
      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: t.inputBorder }}>
        <div className="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[#3B82F6] transition-all duration-500"
          style={{ width: `${(current / STEPS.length) * 100}%` }} />
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  icon?: React.ReactNode
  error?: string
  hint?: string
  valid?: boolean
  optional?: boolean
  t: Tokens
  children: React.ReactNode
}

/** Label + input shell with an icon, a green tick once valid, and an inline error. Module-level so inputs never remount. */
function Field({ label, icon, error, hint, valid, optional, t, children }: FieldProps) {
  return (
    <div>
      <label className="flex items-center justify-between text-[12px] font-semibold mb-1.5 md:mb-2" style={{ color: t.textMuted }}>
        <span>{label}</span>
        {optional && <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Optional</span>}
      </label>
      <div className="relative">
        {icon && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">{icon}</span>}
        {children}
        {valid && !error && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#10B981]/15 flex items-center justify-center pointer-events-none">
            <Check className="w-3 h-3 text-[#10B981]" strokeWidth={3} />
          </span>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-[12px] text-red-400 mt-1.5 font-medium">{error}</p>
      ) : hint ? (
        <p className="text-[11px] mt-1.5" style={{ color: t.textMuted }}>{hint}</p>
      ) : null}
    </div>
  )
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
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [done, setDone] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd')

  // Keyboard awareness: on phones the on-screen keyboard shrinks the *visual* viewport but not the layout
  // viewport, so size the page to the visual viewport and drop the decorative header while typing.
  const baseHeight = useRef(typeof window === 'undefined' ? 0 : window.innerHeight)
  const [vv, setVv] = useState({ h: typeof window === 'undefined' ? 0 : window.innerHeight, top: 0 })
  useEffect(() => {
    const v = window.visualViewport
    const update = () => {
      if (!v) return
      baseHeight.current = Math.max(baseHeight.current, v.height)
      setVv({ h: v.height, top: v.offsetTop })
    }
    const onWindowResize = () => {
      baseHeight.current = window.innerHeight
      update()
    }
    update()
    v?.addEventListener('resize', update)
    v?.addEventListener('scroll', update)
    window.addEventListener('resize', onWindowResize)
    return () => {
      v?.removeEventListener('resize', update)
      v?.removeEventListener('scroll', update)
      window.removeEventListener('resize', onWindowResize)
    }
  }, [])
  const keyboardOpen = typeof window !== 'undefined' && window.innerWidth < 768 && baseHeight.current - vv.h > 120

  const rightBg = isLight ? '#f1f5f9' : '#060B18'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted = isLight ? '#64748b' : '#7A95B8'
  const inputBg = isLight ? '#f8fafc' : 'rgba(15,26,46,0.8)'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const inputText = isLight ? '#0f172a' : '#ffffff'
  const cardBg = isLight ? '#ffffff' : 'rgba(15,26,46,0.55)'
  const t: Tokens = { textPrimary, textMuted, inputBg, inputBorder, inputText, cardBg }

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
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const strength = useMemo(() => passwordStrength(form.password), [form.password])
  const errors = useMemo(() => validate(form, needsBranch), [form, needsBranch])
  const stepBlocked = step < 6 ? stepHasErrors(step, errors) : [1, 2, 3, 4].some(s => stepHasErrors(s, errors))
  const branchLabel = invite?.branchName ?? branches.find(b => b.id === form.branchId)?.name ?? ''

  const set = <K extends FieldKey>(key: K, value: Form[K]) => {
    setForm(f => ({ ...f, [key]: value }))
    setServerError('')
  }
  const touch = (key: FieldKey) => setTouched(prev => (prev[key] ? prev : { ...prev, [key]: true }))
  /** Errors only appear once a field has been visited, so an untouched page isn't a wall of red. */
  const err = (key: FieldKey) => (touched[key] ? errors[key] : undefined)
  const ok = (key: FieldKey) => !!touched[key] && !errors[key] && !!String(form[key]).trim()

  const revealStepErrors = (s: number) =>
    setTouched(prev => ({ ...prev, ...Object.fromEntries(STEP_FIELDS[s].map(k => [k, true])) }))

  const goBack = () => {
    setDirection('back')
    setServerError('')
    setStep(s => Math.max(1, s - 1))
  }

  const sendCode = async () => {
    await sendMemberSignupCode(form.email.trim())
    setCooldown(30)
  }

  const goNext = async () => {
    if (busy) return
    if (stepBlocked) {
      revealStepErrors(step)
      return
    }
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
    if (busy || stepBlocked) return
    setBusy(true)
    setServerError('')
    try {
      await registerMember(token, {
        name: fullNameOf(form),
        nickname: form.nickname.trim(),
        email: form.email.trim().toLowerCase(),
        personalEmail: form.samePersonal ? '' : form.personalEmail.trim().toLowerCase(),
        phone: cleanPhone(form.phone),
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
    if (e.key === 'Enter' && step < 6 && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      void goNext()
    }
  }

  const inputCls = (hasError?: string, padRight = true) =>
    `w-full border rounded-xl pl-11 ${padRight ? 'pr-11' : 'pr-4'} py-3 md:py-3.5 text-base md:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
      hasError ? 'focus:border-red-400 focus:ring-red-400/20' : 'focus:border-[#10B981] focus:ring-[#10B981]/20'
    }`
  const inputStyle = (hasError?: string) => ({
    backgroundColor: inputBg, borderColor: hasError ? '#F87171' : inputBorder, color: inputText,
  })

  const shell = (children: React.ReactNode) => (
    <div
      className="fixed left-0 top-[var(--vvt)] h-[var(--vvh)] md:static md:top-auto md:h-auto md:min-h-screen w-full font-['Inter',sans-serif] overflow-hidden md:overflow-x-hidden md:overflow-y-visible flex flex-col"
      style={{ backgroundColor: rightBg, color: textPrimary, '--vvh': `${vv.h}px`, '--vvt': `${vv.top}px` } as React.CSSProperties}
    >
      <style>{`
        @keyframes joinFwd { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }
        @keyframes joinBack { from { opacity: 0; transform: translateX(-24px) } to { opacity: 1; transform: none } }
        @keyframes joinPop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
        .join-card { background: transparent; }
        @media (min-width: 768px) { .join-card { background: var(--jc-bg); border: 1px solid var(--jc-border); box-shadow: var(--jc-shadow); } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }
      `}</style>

      {/* Backdrop: dotted grid + two soft brand glows (no stock imagery) */}
      <div className="absolute inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(${isLight ? 'rgba(15,23,42,0.09)' : 'rgba(148,163,184,0.10)'} 1px, transparent 1px)`,
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse at 50% 30%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 20%, transparent 75%)',
        }} />
        <div className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.20) 0%, transparent 70%)', filter: 'blur(50px)' }} />
        <div className="absolute -bottom-48 -right-32 w-[560px] h-[560px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <header className={`relative z-10 shrink-0 items-center justify-center md:justify-between px-5 sm:px-8 py-3 md:py-5 max-w-[1040px] w-full mx-auto ${keyboardOpen ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="ASHCOL" className="w-11 h-11 md:w-10 md:h-10 object-contain rounded-xl shadow-md" />
          <span className="hidden md:inline font-black tracking-[0.25em] text-sm" style={{ color: textPrimary }}>ASHCOL</span>
        </div>
        <button
          onClick={toggleTheme}
          className="absolute right-4 top-1/2 -translate-y-1/2 md:static md:translate-y-0 p-2.5 rounded-xl transition-all hover:scale-105"
          style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textMuted }}
          aria-label="Toggle theme"
        >
          {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />}
        </button>
      </header>

      <main className="relative z-10 flex-1 min-h-0 flex flex-col px-5 sm:px-8 pb-3 md:pb-12 max-w-[1040px] w-full mx-auto">{children}</main>
    </div>
  )

  if (linkState === 'loading') {
    return shell(
      <div className="flex justify-center py-32"><Loader2 className="w-7 h-7 animate-spin text-[#10B981]" /></div>,
    )
  }

  if (linkState !== 'ok') {
    return shell(
      <div className="max-w-md mx-auto rounded-3xl border flex flex-col items-center text-center gap-4 py-14 px-6 mt-8"
        style={{ backgroundColor: cardBg, borderColor: inputBorder }}>
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
      <div className="max-w-md mx-auto mt-8 flex flex-col items-center text-center gap-5 py-12 rounded-3xl border px-6"
        style={{ backgroundColor: cardBg, borderColor: inputBorder }}>
        <div
          className="w-20 h-20 rounded-3xl bg-[#10B981]/15 border border-[#10B981]/35 flex items-center justify-center"
          style={{ animation: 'joinPop .5s cubic-bezier(.16,1,.3,1)' }}
        >
          <CheckCircle2 className="w-10 h-10 text-[#10B981]" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: textPrimary }}>You're registered!</h1>
          <p className="text-sm max-w-sm mx-auto leading-relaxed" style={{ color: textMuted }}>
            Thanks, {titleCase(form.firstName)}. An admin will review your account and email you as soon as it's
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
  const maxBirth = isoDate(yearsAgo(MIN_AGE))

  const reviewRow = (label: string, value: string, editStep: number) => (
    <div className="flex items-start justify-between gap-4 py-1.5 md:py-3 border-b last:border-b-0" style={{ borderColor: inputBorder }}>
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

  const pwChecks = [
    { label: 'At least 8 characters', met: form.password.length >= 8 },
    { label: 'A letter and a number', met: /[A-Za-z]/.test(form.password) && /\d/.test(form.password) },
    { label: 'Both passwords match', met: !!form.confirm && form.confirm === form.password },
  ]

  return shell(
    <div
      onKeyDown={onKeyDown}
      onFocusCapture={e => {
        const el = e.target as HTMLElement
        if (window.innerWidth < 768 && /^(INPUT|SELECT)$/.test(el.tagName)) {
          window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
        }
      }}
      className="flex-1 min-h-0 flex flex-col"
    >
      <div
        className="join-card flex-1 min-h-0 flex flex-col md:flex-none md:grid md:grid-cols-[300px_1fr] md:rounded-[28px] md:overflow-hidden"
        style={{
          '--jc-bg': cardBg,
          '--jc-border': inputBorder,
          '--jc-shadow': isLight ? '0 24px 60px rgba(15,23,42,0.10)' : '0 24px 60px rgba(0,0,0,0.45)',
        } as React.CSSProperties}
      >
        <aside className="hidden md:flex flex-col justify-between p-8 relative overflow-hidden"
          style={{ background: 'linear-gradient(165deg, #0b3d2e 0%, #0a3552 100%)' }}>
          <div aria-hidden className="absolute -top-24 -right-24 w-64 h-64 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.28) 0%, transparent 70%)' }} />
          <div className="relative">
            <h2 className="text-[26px] font-black leading-tight text-white">Join the ASHCOL team</h2>
            <p className="text-[13px] mt-2 mb-8 leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
              A few quick steps. An admin reviews every sign-up before you can log in.
            </p>
            <StepList current={step} />
          </div>
          <div className="relative text-[12px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {invite?.branchName && (
              <div className="mb-3 font-semibold uppercase tracking-wider text-[11px]">
                Registering for <span className="text-[#34d399]">{invite.branchName}</span>
              </div>
            )}
            Already approved?{' '}
            <Link to="/login" className="font-bold text-white hover:underline">Log in</Link>
          </div>
        </aside>

        <section className="p-0 md:p-10 min-w-0 flex-1 min-h-0 flex flex-col">
          {!keyboardOpen && <MobileProgress current={step} t={t} />}
        <div key={step} className="flex-1 min-h-0 flex flex-col" style={{ animation: `${direction === 'fwd' ? 'joinFwd' : 'joinBack'} .35s cubic-bezier(.16,1,.3,1)` }}>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain md:overflow-visible">
          <div className={`min-h-full flex flex-col md:block ${keyboardOpen ? 'justify-start pt-3' : 'justify-center'}`}>
          <h1 className="text-[24px] md:text-[30px] font-black tracking-tight leading-tight mb-3 md:mb-1.5 text-center md:text-left" style={{ color: textPrimary }}>{current.title}</h1>
          <p className={`text-[13px] md:text-[14px] mb-5 md:mb-7 text-center md:text-left ${keyboardOpen ? 'hidden md:block' : ''}`} style={{ color: textMuted }}>{current.hint}</p>

          <div className="flex flex-col gap-4 md:gap-5">
            {step === 1 && (
              <>
                {needsBranch && (
                  <Field label="Branch" icon={<Building2 className="w-4 h-4" />} error={err('branchId')} valid={ok('branchId')} t={t}>
                    <select
                      autoFocus
                      value={form.branchId}
                      onChange={e => { set('branchId', e.target.value); touch('branchId') }}
                      onBlur={() => touch('branchId')}
                      className={`${inputCls(err('branchId'))} appearance-none`}
                      style={inputStyle(err('branchId'))}
                    >
                      <option value="">Select your branch</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" icon={<User className="w-4 h-4" />} error={err('firstName')} valid={ok('firstName')} t={t}>
                    <input
                      autoFocus={!needsBranch}
                      value={form.firstName}
                      onChange={e => set('firstName', e.target.value.replace(/[^a-zA-ZÀ-ÿ\s.'-]/g, ''))}
                      onBlur={() => { set('firstName', titleCase(form.firstName)); touch('firstName') }}
                      placeholder="Juan" autoComplete="given-name" maxLength={40}
                      className={inputCls(err('firstName'))} style={inputStyle(err('firstName'))}
                    />
                  </Field>
                  <Field label="Last name" icon={<User className="w-4 h-4" />} error={err('lastName')} valid={ok('lastName')} t={t}>
                    <input
                      value={form.lastName}
                      onChange={e => set('lastName', e.target.value.replace(/[^a-zA-ZÀ-ÿ\s.'-]/g, ''))}
                      onBlur={() => { set('lastName', titleCase(form.lastName)); touch('lastName') }}
                      placeholder="Dela Cruz" autoComplete="family-name" maxLength={40}
                      className={inputCls(err('lastName'))} style={inputStyle(err('lastName'))}
                    />
                  </Field>
                </div>
                <Field label="Nickname" icon={<UserCircle2 className="w-4 h-4" />} error={err('nickname')}
                  valid={ok('nickname')} optional hint="What your teammates call you." t={t}>
                  <input
                    value={form.nickname}
                    onChange={e => set('nickname', e.target.value)}
                    onBlur={() => touch('nickname')}
                    placeholder="Juan" autoComplete="nickname" maxLength={30}
                    className={inputCls(err('nickname'))} style={inputStyle(err('nickname'))}
                  />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Field label="Login email" icon={<Mail className="w-4 h-4" />} error={err('email')} valid={ok('email')}
                  hint="You'll sign in with this, and we'll send a verification code to it." t={t}>
                  <input
                    autoFocus type="email" inputMode="email" value={form.email}
                    onChange={e => set('email', e.target.value.trim().toLowerCase())}
                    onBlur={() => touch('email')}
                    placeholder="juan@ashcol.com.ph" autoComplete="email"
                    className={inputCls(err('email'))} style={inputStyle(err('email'))}
                  />
                </Field>
                <label className="flex items-center gap-3 cursor-pointer -mt-1">
                  <input type="checkbox" checked={form.samePersonal} onChange={e => set('samePersonal', e.target.checked)}
                    className="accent-[#10B981] w-4 h-4" />
                  <span className="text-[13px]" style={{ color: textMuted }}>My personal email is the same</span>
                </label>
                {!form.samePersonal && (
                  <Field label="Personal email" icon={<Mail className="w-4 h-4" />} error={err('personalEmail')} valid={ok('personalEmail')} t={t}>
                    <input
                      type="email" inputMode="email" value={form.personalEmail}
                      onChange={e => set('personalEmail', e.target.value.trim().toLowerCase())}
                      onBlur={() => touch('personalEmail')}
                      placeholder="juan@gmail.com"
                      className={inputCls(err('personalEmail'))} style={inputStyle(err('personalEmail'))}
                    />
                  </Field>
                )}
                <Field label="Mobile number" icon={<Phone className="w-4 h-4" />} error={err('phone')} valid={ok('phone')}
                  hint="Philippine mobile, e.g. 0917 123 4567." t={t}>
                  <input
                    type="tel" inputMode="tel" value={form.phone}
                    onChange={e => set('phone', e.target.value.replace(/[^0-9+\s-]/g, ''))}
                    onBlur={() => touch('phone')}
                    placeholder="0917 123 4567" maxLength={16} autoComplete="tel"
                    className={inputCls(err('phone'))} style={inputStyle(err('phone'))}
                  />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Birthdate" icon={<Calendar className="w-4 h-4" />} error={err('birthDate')} valid={ok('birthDate')}
                  hint={`You must be at least ${MIN_AGE}.`} t={t}>
                  <input
                    autoFocus type="date" value={form.birthDate} max={maxBirth} min="1940-01-01"
                    onChange={e => set('birthDate', e.target.value)} onBlur={() => touch('birthDate')}
                    autoComplete="bday" className={inputCls(err('birthDate'))} style={inputStyle(err('birthDate'))}
                  />
                </Field>
                <Field label="Date hired" icon={<Calendar className="w-4 h-4" />} error={err('dateHired')} valid={ok('dateHired')}
                  optional hint="Leave blank if you are not sure — HR can fill it in." t={t}>
                  <input
                    type="date" value={form.dateHired} min="1990-01-01"
                    onChange={e => set('dateHired', e.target.value)} onBlur={() => touch('dateHired')}
                    className={inputCls(err('dateHired'))} style={inputStyle(err('dateHired'))}
                  />
                </Field>
              </>
            )}

            {step === 4 && (
              <>
                <Field label="Password" icon={<Lock className="w-4 h-4" />} error={err('password')} t={t}>
                  <input
                    autoFocus type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={e => set('password', e.target.value)} onBlur={() => touch('password')}
                    placeholder="At least 8 characters" autoComplete="new-password" maxLength={64}
                    className={inputCls(err('password'))} style={inputStyle(err('password'))}
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#10B981]" aria-label="Show password">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </Field>
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
                <Field label="Confirm password" icon={<Lock className="w-4 h-4" />} error={err('confirm')} valid={ok('confirm')} t={t}>
                  <input
                    type={showPw ? 'text' : 'password'} value={form.confirm}
                    onChange={e => set('confirm', e.target.value)} onBlur={() => touch('confirm')}
                    placeholder="Type it again" autoComplete="new-password" maxLength={64}
                    className={inputCls(err('confirm'))} style={inputStyle(err('confirm'))}
                  />
                </Field>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-1.5">
                  {pwChecks.map(c => (
                    <li key={c.label} className="flex items-center gap-2 text-[12px] font-medium transition-colors"
                      style={{ color: c.met ? '#10B981' : textMuted }}>
                      <span className="w-4 h-4 rounded-full flex items-center justify-center border"
                        style={{ borderColor: c.met ? '#10B981' : inputBorder, backgroundColor: c.met ? 'rgba(16,185,129,0.15)' : 'transparent' }}>
                        {c.met && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                      </span>
                      {c.label}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {step === 5 && (
              <>
                <div className="flex items-center gap-3 rounded-2xl p-4 border" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
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
                    onChange={e => { set('code', e.target.value.replace(/\D/g, '').slice(0, 6)); touch('code') }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="······"
                    aria-label="6-digit verification code"
                    className="w-full border rounded-xl px-4 py-4 text-center tracking-[12px] text-2xl font-black focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"
                    style={inputStyle(err('code') && form.code.length > 0 ? err('code') : undefined)}
                  />
                  <p className="text-[12px] mt-2 text-center" style={{ color: textMuted }}>
                    Check your spam folder if it doesn't show up within a minute.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={cooldown > 0 || busy}
                  onClick={async () => {
                    setBusy(true)
                    try { await sendCode(); setServerError('') }
                    catch (e) { setServerError(e instanceof Error ? e.message : 'Could not resend the code.') }
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
                <div className="rounded-2xl border px-5" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
                  {reviewRow('Branch', branchLabel, needsBranch ? 1 : 6)}
                  {reviewRow('Name', form.nickname.trim() ? `${fullNameOf(form)} (${form.nickname.trim()})` : fullNameOf(form), 1)}
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
                    {branchLabel ? <> of <strong style={{ color: textPrimary }}>{branchLabel}</strong></> : null}.
                    An admin approves it before you can log in.
                  </p>
                </div>
              </>
            )}
          </div>

          {serverError && (
            <div role="alert" className="mt-4 text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
              {serverError}
            </div>
          )}
          </div>
          </div>

          <div className="shrink-0 pt-3 md:pt-8 flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                disabled={busy}
                className="flex items-center justify-center gap-2 px-4 md:px-5 py-3.5 md:py-4 rounded-xl font-bold text-[15px] border transition-all hover:border-[#10B981] disabled:opacity-50"
                style={{ borderColor: inputBorder, color: textPrimary, backgroundColor: inputBg }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button
              type="button"
              aria-disabled={busy || stepBlocked}
              onClick={step === 6 ? submit : goNext}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 md:py-4 rounded-xl font-bold text-[15px] transition-all ${
                busy || stepBlocked
                  ? 'cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#10B981] to-[#0ea5a4] text-[#04211a] shadow-[0_4px_24px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_32px_rgba(16,185,129,0.45)] hover:brightness-110 active:scale-[0.99]'
              }`}
              style={busy || stepBlocked ? { backgroundColor: inputBorder, color: textMuted, opacity: 0.8 } : undefined}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {step === 6 ? (busy ? 'Creating account…' : 'Create my account') : step === 4 ? (busy ? 'Sending code…' : 'Send verification code') : 'Continue'}
              {!busy && step < 6 && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
          {stepBlocked && step < 6 && (
            <p className="shrink-0 text-[12px] text-center mt-2 md:mt-3" style={{ color: textMuted }}>
              Complete the required fields to continue.
            </p>
          )}
        </div>
        </section>
      </div>

      <p className="md:hidden shrink-0 mt-2 text-center text-[12px] font-medium" style={{ color: textMuted }}>
        Already approved?{' '}
        <Link to="/login" className="text-[#10B981] font-bold hover:underline">Log in</Link>
      </p>
    </div>,
  )
}
