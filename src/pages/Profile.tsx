import { useEffect, useRef, useState } from 'react'
import { useAuth, getInitials } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  User, Mail, Shield, Camera, LogOut, Phone,
  KeyRound, Trash2, X, AlertTriangle, Check, ShieldCheck
} from 'lucide-react'
import ImageCropModal from '../components/ImageCropModal'
import { API_BASE_URL, resolveImageUrl } from '../utils/api'

const apiUrl = API_BASE_URL
const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
})
const ic = `w-full border rounded-xl px-4 py-3.5 font-medium transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none text-sm`

type Tab = 'profile' | 'account'

export default function Profile() {
  const { user, setUser, logout } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('profile')

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#F0F6FF'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'
  const inputText   = isLight ? '#0f172a'  : '#F0F6FF'
  const pageBg      = isLight ? '#f1f5f9'  : '#060B18'

  // ── Profile info state ────────────────────────────────────────────────────
  const [name, setName]               = useState(user?.name || '')
  const [phone, setPhone]             = useState(user?.phone || '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMsg, setNameMsg]         = useState('')
  const [nameErr, setNameErr]         = useState('')

  // ── Profile pic state ─────────────────────────────────────────────────────
  const [picLoading, setPicLoading] = useState(false)
  const [picErr, setPicErr]         = useState('')
  const [cropSrc, setCropSrc]       = useState<string | null>(null)

  // ── Email change state ────────────────────────────────────────────────────
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailStep, setEmailStep]           = useState<'input' | 'verify'>('input')
  const [newEmail, setNewEmail]             = useState('')
  const [emailCode, setEmailCode]           = useState('')
  const [emailLoading, setEmailLoading]     = useState(false)
  const [emailErr, setEmailErr]             = useState('')
  const [emailSuccess, setEmailSuccess]     = useState('')

  // ── Delete account state ──────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm]     = useState('')
  const [deleteLoading, setDeleteLoading]     = useState(false)
  const [deleteErr, setDeleteErr]             = useState('')

  // Fetch latest profile on mount
  useEffect(() => {
    if (!getToken()) return
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

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setNameErr('Name is required.')
    setNameLoading(true); setNameErr(''); setNameMsg('')
    try {
      const res = await fetch(`${apiUrl}/user/profile`, {
        method: 'PATCH', headers: authHeaders(),
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
    } finally { setNameLoading(false) }
  }

  const handlePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) return setPicErr('Image must be under 10MB.')
    setCropSrc(URL.createObjectURL(file))
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleCropConfirm = async (blob: Blob) => {
    setCropSrc(null); setPicLoading(true); setPicErr('')
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
      const fullUrl = resolveImageUrl(data?.data?.image_url || data?.image_url || '')
      await fetch(`${apiUrl}/user/profile`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ profileImage: fullUrl }),
      })
      setUser({ ...user!, picture: fullUrl })
    } catch (err: any) {
      setPicErr(err.message || 'Could not upload image.')
    } finally { setPicLoading(false) }
  }

  const handleRequestEmailCode = async () => {
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
      return setEmailErr('Enter a valid email address.')
    setEmailLoading(true); setEmailErr('')
    try {
      const res = await fetch(`${apiUrl}/user/change-email/request`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to send code.')
      setEmailStep('verify')
    } catch (err: any) {
      setEmailErr(err.message || 'Could not send verification code.')
    } finally { setEmailLoading(false) }
  }

  const handleVerifyEmailCode = async () => {
    if (!emailCode.trim()) return setEmailErr('Enter the verification code.')
    setEmailLoading(true); setEmailErr('')
    try {
      const res = await fetch(`${apiUrl}/user/change-email/verify`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ newEmail: newEmail.trim(), code: emailCode.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Invalid code.')
      setUser({ ...user!, email: newEmail.trim() })
      setEmailSuccess('Email updated successfully!')
      setTimeout(() => {
        setShowEmailModal(false); setEmailSuccess('')
        setEmailStep('input'); setNewEmail(''); setEmailCode('')
      }, 2000)
    } catch (err: any) {
      setEmailErr(err.message || 'Could not verify code.')
    } finally { setEmailLoading(false) }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return setDeleteErr('Type DELETE to confirm.')
    setDeleteLoading(true); setDeleteErr('')
    try {
      const res = await fetch(`${apiUrl}/user/account`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to delete account.')
      logout()
    } catch (err: any) {
      setDeleteErr(err.message || 'Could not delete account.')
      setDeleteLoading(false)
    }
  }

  const inputStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: inputText }

  return (
    <div className="max-w-2xl mx-auto w-full pb-16 px-0" style={{ backgroundColor: pageBg }}>

      {/* ── Avatar hero ── */}
      <div
        className="flex flex-col items-center pt-8 pb-6 px-4 mb-0"
        style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}
      >
        <div className="relative mb-3">
          {user?.picture ? (
            <img src={user.picture} alt={user.name}
              className="w-24 h-24 rounded-full object-cover border-4 border-[#10B981] shadow-lg"
              referrerPolicy="no-referrer" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#10B981] flex items-center justify-center text-white font-black text-3xl shadow-lg border-4 border-white/10">
              {user?.initials ?? '?'}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={picLoading}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow-md border transition-all hover:border-[#10B981] hover:text-[#10B981] disabled:opacity-50"
            style={{ backgroundColor: cardBg, borderColor: border, color: textMuted }}
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePicChange} />
        </div>

        {picLoading && <p className="text-xs text-[#10B981] mb-1">Uploading...</p>}
        {picErr    && <p className="text-xs text-red-400 mb-1">{picErr}</p>}

        <h2 className="text-lg font-black tracking-tight" style={{ color: textPrimary }}>{user?.name}</h2>
        <p className="text-sm mb-2" style={{ color: textMuted }}>{user?.email}</p>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(16,185,129,0.1)] text-[#10B981] text-[11px] font-bold uppercase tracking-wider rounded-full border border-[rgba(16,185,129,0.2)]">
          <Shield className="w-3 h-3" />{user?.role}
        </span>
      </div>

      {/* ── Tabs ── */}
      <div className="flex" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
        {([
          { key: 'profile', label: 'Profile Info', icon: User },
          { key: 'account', label: 'Account & Security', icon: ShieldCheck },
        ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-[13px] font-bold transition-all border-b-2"
            style={{
              color: tab === key ? '#10B981' : textMuted,
              borderColor: tab === key ? '#10B981' : 'transparent',
            }}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{key === 'profile' ? 'Profile' : 'Security'}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Profile Info ── */}
      {tab === 'profile' && (
        <form onSubmit={handleSaveName} className="flex flex-col gap-0">

          {/* Name */}
          <div className="px-4 pt-5 pb-4" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2" style={{ color: textMuted }}>
              <User className="w-3.5 h-3.5" /> Full Name
            </label>
            <input
              type="text" required value={name}
              onChange={e => setName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, ''))}
              style={inputStyle} className={ic} placeholder="Juan Dela Cruz"
            />
          </div>

          {/* Phone */}
          <div className="px-4 pt-5 pb-4" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2" style={{ color: textMuted }}>
              <Phone className="w-3.5 h-3.5" /> Phone Number
            </label>
            <input
              type="tel" value={phone}
              onChange={e => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
              style={inputStyle} className={ic} placeholder="09170000000" maxLength={13}
            />
          </div>

          {/* Email (read-only) */}
          <div className="px-4 pt-5 pb-4" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2" style={{ color: textMuted }}>
              <Mail className="w-3.5 h-3.5" /> Email Address
            </label>
            <div className="flex gap-2">
              <input
                type="email" disabled value={user?.email}
                style={{ ...inputStyle, opacity: 0.6 }}
                className={`${ic} cursor-not-allowed flex-1`}
              />
              <button
                type="button"
                onClick={() => { setShowEmailModal(true); setEmailStep('input'); setEmailErr(''); setNewEmail(''); setEmailCode('') }}
                className="px-4 rounded-xl text-[12px] font-bold border transition-all hover:border-[#10B981] hover:text-[#10B981] whitespace-nowrap"
                style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
              >
                Change
              </button>
            </div>
            <p className="text-xs text-[#10B981] flex items-center gap-1 font-semibold mt-1.5">
              <Check className="w-3.5 h-3.5" /> Verified Account
            </p>
          </div>

          {/* Feedback */}
          {(nameErr || nameMsg) && (
            <div className="px-4 pt-3" style={{ backgroundColor: cardBg }}>
              {nameErr && <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2">{nameErr}</p>}
              {nameMsg && <p className="text-sm text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl px-4 py-2">{nameMsg}</p>}
            </div>
          )}

          {/* Save */}
          <div className="px-4 pt-4 pb-2" style={{ backgroundColor: cardBg }}>
            <button
              type="submit" disabled={nameLoading}
              className={`w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all ${nameLoading ? 'bg-slate-500 cursor-not-allowed' : 'bg-[#10B981] hover:bg-emerald-500'}`}
            >
              {nameLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* ── Tab: Account & Security ── */}
      {tab === 'account' && (
        <div className="flex flex-col gap-0">

          {/* Logout */}
          <div className="px-4 pt-5 pb-4" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: textMuted }}>Session</p>
            <button
              type="button" onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border font-bold text-sm transition-all hover:border-red-400 hover:text-red-400 hover:bg-red-400/5"
              style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>

          {/* Danger zone */}
          <div className="px-4 pt-5 pb-6 mt-2" style={{ backgroundColor: cardBg, borderTop: `1px solid ${border}` }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1 text-red-400">Danger Zone</p>
            <p className="text-xs mb-4" style={{ color: textMuted }}>
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            <button
              type="button" onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold text-sm transition-all"
            >
              <Trash2 className="w-4 h-4" /> Delete My Account
            </button>
          </div>
        </div>
      )}

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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowEmailModal(false)}>
          <div
            className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 sm:p-7 shadow-2xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-5 sm:hidden" />
            <button onClick={() => setShowEmailModal(false)} className="absolute top-4 right-4" style={{ color: textMuted }}>
              <X className="w-5 h-5" />
            </button>
            <div className="w-11 h-11 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center mb-4">
              <KeyRound className="w-5 h-5 text-[#10B981]" />
            </div>
            <h3 className="text-base font-black mb-1" style={{ color: textPrimary }}>
              {emailStep === 'input' ? 'Change Email Address' : 'Verify New Email'}
            </h3>
            <p className="text-sm mb-5" style={{ color: textMuted }}>
              {emailStep === 'input'
                ? "Enter your new email. We'll send a verification code."
                : `Enter the 6-digit code sent to ${newEmail}`}
            </p>
            {emailStep === 'input' ? (
              <div className="flex flex-col gap-3">
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="new@email.com" autoFocus style={inputStyle} className={ic} />
                {emailErr && <p className="text-sm text-red-400">{emailErr}</p>}
                <button onClick={handleRequestEmailCode} disabled={emailLoading}
                  className="w-full py-3.5 rounded-xl font-bold text-white bg-[#10B981] hover:bg-emerald-500 transition-all disabled:opacity-50">
                  {emailLoading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input type="text" value={emailCode}
                  onChange={e => setEmailCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="— — — — — —" maxLength={6} inputMode="numeric" autoFocus
                  style={inputStyle}
                  className="w-full border rounded-xl px-4 py-4 text-center tracking-[10px] text-xl font-black focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"
                />
                {emailErr     && <p className="text-sm text-red-400">{emailErr}</p>}
                {emailSuccess && <p className="text-sm text-[#10B981]">{emailSuccess}</p>}
                <button onClick={handleVerifyEmailCode} disabled={emailLoading}
                  className="w-full py-3.5 rounded-xl font-bold text-white bg-[#10B981] hover:bg-emerald-500 transition-all disabled:opacity-50">
                  {emailLoading ? 'Verifying...' : 'Verify & Update Email'}
                </button>
                <button type="button" onClick={() => { setEmailStep('input'); setEmailErr('') }}
                  className="text-sm font-semibold text-center hover:underline" style={{ color: textMuted }}>
                  Use a different email
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Account Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}>
          <div
            className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 sm:p-7 shadow-2xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-5 sm:hidden" />
            <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 right-4" style={{ color: textMuted }}>
              <X className="w-5 h-5" />
            </button>
            <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-base font-black mb-1" style={{ color: textPrimary }}>Delete Account</h3>
            <p className="text-sm mb-5" style={{ color: textMuted }}>
              This is <span className="font-bold text-red-400">permanent</span> and cannot be undone. All your data, tickets, and history will be erased.
            </p>
            <p className="text-sm font-semibold mb-2" style={{ color: textMuted }}>
              Type <span className="font-black text-red-400">DELETE</span> to confirm:
            </p>
            <input type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE" autoFocus style={inputStyle} className={`${ic} mb-4`} />
            {deleteErr && <p className="text-sm text-red-400 mb-3">{deleteErr}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 rounded-xl font-bold text-sm border transition-all"
                style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}>
                Cancel
              </button>
              <button type="button" onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirm !== 'DELETE'}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                {deleteLoading ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
