import { useEffect, useRef, useState } from 'react'
import { useAuth, getInitials } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { User, Mail, Shield, Camera, LogOut, Phone, KeyRound, Trash2, X, AlertTriangle, Check } from 'lucide-react'
import ImageCropModal from '../components/ImageCropModal'

const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
const getToken = () => {
  const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
  if (!token) console.warn('[Profile] No auth token found in localStorage or sessionStorage')
  return token
}
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
})

// ── Reusable input style ──────────────────────────────────────────────────────
const inputCls = () =>
  `w-full border rounded-xl px-4 py-3.5 font-medium transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none`

export default function Profile() {
  const { user, setUser, logout } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Theme tokens ─────────────────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff'    : '#0A1120'
  const border      = isLight ? '#e2e8f0'    : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'    : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'    : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'    : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'    : '#243452'
  const inputText   = isLight ? '#0f172a'    : '#F0F6FF'

  // ── Name edit ────────────────────────────────────────────────────────────
  const [name, setName]               = useState(user?.name || '')
  const [phone, setPhone]             = useState(user?.phone || '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMsg, setNameMsg]         = useState('')
  const [nameErr, setNameErr]         = useState('')

  // ── Profile pic ──────────────────────────────────────────────────────────
  const [picLoading, setPicLoading] = useState(false)
  const [picErr, setPicErr]         = useState('')
  const [cropSrc, setCropSrc]       = useState<string | null>(null)

  // Fetch latest profile from backend on mount to ensure phone is populated
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch(`${apiUrl}/user/profile`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const u = data?.data || data
        if (u.phone) setPhone(u.phone)
        if (u.name) setName(u.name)
      })
      .catch(() => {})
  }, [])

  // ── Email change ─────────────────────────────────────────────────────────
  const [showEmailModal, setShowEmailModal]   = useState(false)
  const [emailStep, setEmailStep]             = useState<'input' | 'verify'>('input')
  const [newEmail, setNewEmail]               = useState('')
  const [emailCode, setEmailCode]             = useState('')
  const [emailLoading, setEmailLoading]       = useState(false)
  const [emailErr, setEmailErr]               = useState('')
  const [emailSuccess, setEmailSuccess]       = useState('')

  // ── Delete account ───────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm]     = useState('')
  const [deleteLoading, setDeleteLoading]     = useState(false)
  const [deleteErr, setDeleteErr]             = useState('')

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setNameErr('Name is required.')
    setNameLoading(true); setNameErr(''); setNameMsg('')
    try {
      const res = await fetch(`${apiUrl}/user/profile`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to update.')
      const data = await res.json()
      const u = data?.data || data
      setUser({ ...user!, name: u.name || name.trim(), phone: u.phone || phone.trim(), initials: getInitials(u.name || name.trim()) })
      setNameMsg('Profile updated!')
      setTimeout(() => setNameMsg(''), 3000)
    } catch (err: any) {
      setNameErr(err.message || 'Could not update profile.')
    } finally {
      setNameLoading(false)
    }
  }

  const handlePicChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) return setPicErr('Image must be under 10MB.')
    const objectUrl = URL.createObjectURL(file)
    setCropSrc(objectUrl)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleCropConfirm = async (blob: Blob) => {
    setCropSrc(null)
    setPicLoading(true); setPicErr('')
    try {
      const form = new FormData()
      form.append('profile_image', blob, 'profile.jpg')
      const res = await fetch(`${apiUrl}/user/upload-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Upload failed.')
      const data = await res.json()
      const rawUrl: string = data?.data?.image_url || data?.image_url || ''
      const baseUrl = apiUrl.replace('/api', '')
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl}`

      // Persist full URL back to database
      await fetch(`${apiUrl}/user/profile`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ profileImage: fullUrl }),
      })

      setUser({ ...user!, picture: fullUrl })
    } catch (err: any) {
      setPicErr(err.message || 'Could not upload image.')
    } finally {
      setPicLoading(false)
    }
  }

  const handleRequestEmailCode = async () => {
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return setEmailErr('Enter a valid email address.')
    setEmailLoading(true); setEmailErr('')
    try {
      const res = await fetch(`${apiUrl}/user/change-email/request`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to send code.')
      setEmailStep('verify')
    } catch (err: any) {
      setEmailErr(err.message || 'Could not send verification code.')
    } finally {
      setEmailLoading(false)
    }
  }

  const handleVerifyEmailCode = async () => {
    if (!emailCode.trim()) return setEmailErr('Enter the verification code.')
    setEmailLoading(true); setEmailErr('')
    try {
      const res = await fetch(`${apiUrl}/user/change-email/verify`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ newEmail: newEmail.trim(), code: emailCode.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Invalid code.')
      setUser({ ...user!, email: newEmail.trim() })
      setEmailSuccess('Email updated successfully!')
      setTimeout(() => { setShowEmailModal(false); setEmailSuccess(''); setEmailStep('input'); setNewEmail(''); setEmailCode('') }, 2000)
    } catch (err: any) {
      setEmailErr(err.message || 'Could not verify code.')
    } finally {
      setEmailLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return setDeleteErr('Type DELETE to confirm.')
    setDeleteLoading(true); setDeleteErr('')
    try {
      const res = await fetch(`${apiUrl}/user/account`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to delete account.')
      logout()
    } catch (err: any) {
      setDeleteErr(err.message || 'Could not delete account.')
      setDeleteLoading(false)
    }
  }

  const ic = inputCls()

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-10">
      <div>
        <h2 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight mb-1">My Profile</h2>
        <p style={{ color: textMuted }} className="text-sm">Manage your personal account details and preferences.</p>
      </div>

      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col md:flex-row shadow-sm overflow-hidden">

        {/* ── Left: Avatar ── */}
        <div style={{ borderColor: border, backgroundColor: inputBg }} className="p-8 md:w-1/3 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r text-center gap-4">
          <div className="relative">
            {user?.picture ? (
              <img src={user.picture} alt={user.name} className="w-32 h-32 rounded-full object-cover border-4 border-[#10B981] shadow-lg" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-32 h-32 rounded-full bg-[#10B981] flex items-center justify-center text-white font-black text-4xl shadow-lg border-4 border-white/10">
                {user?.initials ?? '?'}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={picLoading}
              className="absolute bottom-1 right-1 bg-white rounded-full p-2.5 shadow-md border hover:border-[#10B981] hover:text-[#10B981] transition-all disabled:opacity-50"
              style={{ borderColor: border, color: textMuted }}
              title="Change photo"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePicChange} />
          </div>
          {picLoading && <p className="text-xs text-[#10B981]">Uploading...</p>}
          {picErr && <p className="text-xs text-red-400">{picErr}</p>}
          <div>
            <h3 style={{ color: textPrimary }} className="text-xl font-bold mb-1">{user?.name}</h3>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(16,185,129,0.1)] text-[#10B981] text-[11px] font-bold uppercase tracking-wider rounded-full border border-[rgba(16,185,129,0.2)]">
              <Shield className="w-3.5 h-3.5" />{user?.role}
            </span>
          </div>
        </div>

        {/* ── Right: Form ── */}
        <div className="p-8 md:w-2/3 flex flex-col gap-5">
          <form onSubmit={handleSaveName} className="flex flex-col gap-4">

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: textMuted }}>
                <User className="w-3.5 h-3.5" /> Full Name
              </label>
              <input
                type="text" required value={name}
                onChange={e => setName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, ''))}
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                className={ic}
                placeholder="Juan Dela Cruz"
              />
            </div>

            {/* Email (read-only with change button) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: textMuted }}>
                <Mail className="w-3.5 h-3.5" /> Email Address
              </label>
              <div className="flex gap-2">
                <input
                  type="email" disabled value={user?.email}
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                  className={`${ic} opacity-60 cursor-not-allowed flex-1`}
                />
                <button
                  type="button"
                  onClick={() => { setShowEmailModal(true); setEmailStep('input'); setEmailErr(''); setNewEmail(''); setEmailCode('') }}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold border transition-all hover:border-[#10B981] hover:text-[#10B981] whitespace-nowrap"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
                >
                  Change
                </button>
              </div>
              <p className="text-xs text-[#10B981] flex items-center gap-1 font-semibold">
                <Check className="w-3.5 h-3.5" /> Verified Account
              </p>
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: textMuted }}>
                <Phone className="w-3.5 h-3.5" /> Phone Number
              </label>
              <input
                type="tel" value={phone}
                onChange={e => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                className={ic}
                placeholder="09170000000"
                maxLength={13}
              />
            </div>

            {nameErr && <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2">{nameErr}</p>}
            {nameMsg && <p className="text-sm text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl px-4 py-2">{nameMsg}</p>}

            <div style={{ borderColor: border }} className="border-t pt-5 flex justify-between items-center">
              <button
                type="button" onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold text-sm transition-all"
              >
                <Trash2 className="w-4 h-4" /> Delete Account
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button" onClick={logout}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all hover:border-red-400 hover:text-red-400"
                  style={{ borderColor: inputBorder, color: textMuted }}
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
                <button
                  type="submit" disabled={nameLoading}
                  className={`px-7 py-2.5 rounded-xl font-bold text-sm text-white transition-all ${nameLoading ? 'bg-slate-500 cursor-not-allowed' : 'bg-[#10B981] hover:bg-emerald-500'}`}
                >
                  {nameLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ── Image Crop Modal ── */}
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          isDark={!isLight}
          onCancel={() => { setCropSrc(null); URL.revokeObjectURL(cropSrc) }}
          onConfirm={handleCropConfirm}
        />
      )}

      {/* ── Change Email Modal ── */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowEmailModal(false)}>
          <div
            className="relative w-full max-w-md rounded-2xl p-7 shadow-2xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setShowEmailModal(false)} className="absolute top-4 right-4 transition-colors" style={{ color: textMuted }}>
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-[#10B981]" />
            </div>
            <h3 className="text-lg font-black mb-1" style={{ color: textPrimary }}>
              {emailStep === 'input' ? 'Change Email Address' : 'Verify New Email'}
            </h3>
            <p className="text-sm mb-5" style={{ color: textMuted }}>
              {emailStep === 'input'
                ? 'Enter your new email address. We\'ll send a verification code.'
                : `Enter the 6-digit code sent to ${newEmail}`}
            </p>

            {emailStep === 'input' ? (
              <div className="flex flex-col gap-4">
                <input
                  type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="new@email.com" autoFocus
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                  className={ic}
                />
                {emailErr && <p className="text-sm text-red-400">{emailErr}</p>}
                <button
                  onClick={handleRequestEmailCode} disabled={emailLoading}
                  className="w-full py-3 rounded-xl font-bold text-white bg-[#10B981] hover:bg-emerald-500 transition-all disabled:opacity-50"
                >
                  {emailLoading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <input
                  type="text" value={emailCode}
                  onChange={e => setEmailCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="— — — — — —" maxLength={6} inputMode="numeric" autoFocus
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
                  className="w-full border rounded-xl px-4 py-4 text-center tracking-[10px] text-xl font-black focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"
                />
                {emailErr && <p className="text-sm text-red-400">{emailErr}</p>}
                {emailSuccess && <p className="text-sm text-[#10B981]">{emailSuccess}</p>}
                <button
                  onClick={handleVerifyEmailCode} disabled={emailLoading}
                  className="w-full py-3 rounded-xl font-bold text-white bg-[#10B981] hover:bg-emerald-500 transition-all disabled:opacity-50"
                >
                  {emailLoading ? 'Verifying...' : 'Verify & Update Email'}
                </button>
                <button
                  type="button" onClick={() => { setEmailStep('input'); setEmailErr('') }}
                  className="text-sm font-semibold text-center hover:underline" style={{ color: textMuted }}
                >
                  Use a different email
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Account Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}>
          <div
            className="relative w-full max-w-md rounded-2xl p-7 shadow-2xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 right-4 transition-colors" style={{ color: textMuted }}>
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-black mb-1" style={{ color: textPrimary }}>Delete Account</h3>
            <p className="text-sm mb-5" style={{ color: textMuted }}>
              This action is <span className="font-bold text-red-400">permanent</span> and cannot be undone. All your data, tickets, and history will be deleted.
            </p>
            <p className="text-sm font-semibold mb-2" style={{ color: textMuted }}>
              Type <span className="font-black text-red-400">DELETE</span> to confirm:
            </p>
            <input
              type="text" value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE" autoFocus
              style={{ backgroundColor: inputBg, borderColor: inputBorder, color: inputText }}
              className={`${ic} mb-4`}
            />
            {deleteErr && <p className="text-sm text-red-400 mb-3">{deleteErr}</p>}
            <div className="flex gap-3">
              <button
                type="button" onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 rounded-xl font-bold text-sm border transition-all"
                style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
              >
                Cancel
              </button>
              <button
                type="button" onClick={handleDeleteAccount} disabled={deleteLoading || deleteConfirm !== 'DELETE'}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
