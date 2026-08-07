import { useEffect, useRef, useState } from 'react'
import { useAuth, getInitials } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  User, Shield, History,
  KeyRound, Trash2, X, AlertTriangle, Lock, Eye, EyeOff
} from 'lucide-react'
import ImageCropModal from '../components/ImageCropModal'
import TicketHistoryTable from '../components/TicketHistoryTable'
import type { AddressValue } from '../components/PhAddressPicker'
import {
  API_BASE_URL,
  resolveImageUrl,
  formatRole,
  formatPersonName,
  isSystemAdmin,
  isPortalStaffUser,
  PROFILE_UPDATED_EVENT,
  notifyEmployeesDirectoryUpdated,
} from '../utils/api'
import UserAvatar from '../components/UserAvatar'

const apiUrl = API_BASE_URL
const getToken = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
})
const ic = `w-full border rounded-xl px-4 py-3 font-medium transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none text-sm`

type Tab = 'profile' | 'address' | 'password' | 'privacy' | 'notifications' | 'users' | 'history'

export default function Profile() {
  const { user, setUser, logout } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const isManager = user?.role?.toLowerCase() === 'manager'
  const isStaffUser = isPortalStaffUser(user?.role)
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('profile')

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff'  : '#0A1120'
  const border      = isLight ? '#e2e8f0'  : '#1E2D48'
  const textPrimary = isLight ? '#0f172a'  : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'  : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc'  : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1'  : '#243452'
  const inputText   = isLight ? '#0f172a'  : '#E2E8F0'
  const pageBg      = isLight ? '#f1f5f9'  : '#060B18'

  // ── Profile info state ────────────────────────────────────────────────────
  const [name, setName]               = useState(user?.name || '')
  const [personalEmail, setPersonalEmail] = useState(user?.personalEmail || '')
  const [phone, setPhone]             = useState(user?.phone || '')
  const [birthDate, setBirthDate]     = useState(user?.birthDate || '')
  const [address, setAddress]         = useState<AddressValue>({
    region: user?.region || '',
    city: user?.city || '',
    barangay: user?.barangay || '',
    street: user?.street || '',
    landmark: user?.landmark || '',
  })
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

  // ── Password change state ────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]       = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordErr, setPasswordErr]       = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // ── User management state (admin only) ────────────────────────────────────
  const [users, setUsers]                   = useState<any[]>([])
  const [usersLoading, setUsersLoading]     = useState(false)
  const [usersErr, setUsersErr]             = useState('')
  const [roleFilter, setRoleFilter]         = useState('CUSTOMER')

  // Load latest profile into form + session on mount
  useEffect(() => {
    if (!getToken()) return
    fetch(`${apiUrl}/user/profile`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !user) return
        const u = data?.data || data
        const formattedName = formatPersonName(u.name || user.name || '')
        const bDate = u.birthDate || ''
        setName(formattedName)
        setPersonalEmail(u.personalEmail || '')
        setPhone(u.phone || '')
        setBirthDate(bDate)
        setAddress({
          region: u.region || '',
          city: u.city || '',
          barangay: u.barangay || '',
          street: u.street || u.address || '',
          landmark: u.landmark || '',
        })
        setUser({
          ...user,
          name: formattedName,
          email: u.email ?? user.email,
          personalEmail: u.personalEmail ?? user.personalEmail,
          phone: u.phone ?? user.phone,
          picture: resolveImageUrl(u.profileImage) || user.picture,
          jobTitle: u.jobTitle ?? user.jobTitle,
          region: u.region ?? user.region,
          city: u.city ?? user.city,
          barangay: u.barangay ?? user.barangay,
          street: u.street || u.address || user.street,
          landmark: u.landmark ?? user.landmark,
          birthDate: bDate,
          initials: getInitials(formattedName),
        })
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch users by role for admin
  useEffect(() => {
    if (user?.role !== 'admin' || tab !== 'users') return
    setUsersLoading(true); setUsersErr('')
    fetch(`${apiUrl}/user/all?role=${roleFilter}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject('Failed to fetch'))
      .then(data => setUsers(data?.data || []))
      .catch(err => setUsersErr(err.message || 'Failed to load users'))
      .finally(() => setUsersLoading(false))
  }, [tab, roleFilter, user?.role])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const formattedName = formatPersonName(name)
    if (!formattedName) return setNameErr('Name is required.')
    setName(formattedName)
    setNameLoading(true); setNameErr(''); setNameMsg('')
    try {
      const payload: Record<string, string | null> = { name: formattedName }
      if (isStaffUser) {
        payload.phone = phone.trim()
        payload.birthDate = birthDate || null
      }
      if (user?.role !== 'admin') {
        payload.region = address.region
        payload.city = address.city
        payload.barangay = address.barangay
        payload.street = address.street
        payload.landmark = address.landmark
      }
      if (isManager) {
        payload.personalEmail = personalEmail.trim()
      }
      const res = await fetch(`${apiUrl}/user/profile`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to update.')
      const data = await res.json()
      const u = data?.data || data
      const updatedUser = {
        ...user!,
        name: formatPersonName(u.name || formattedName),
        phone: u.phone || phone.trim(),
        personalEmail: isManager ? ((u.personalEmail ?? personalEmail.trim()) || null) : user!.personalEmail,
        region: u.region || address.region,
        city: u.city || address.city,
        barangay: u.barangay || address.barangay,
        street: u.street || address.street,
        landmark: u.landmark || address.landmark,
        birthDate: u.birthDate || birthDate || null,
        initials: getInitials(u.name || formattedName)
      }
      setUser(updatedUser)
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
      if (isStaffUser) notifyEmployeesDirectoryUpdated()
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
      const imagePath = data?.data?.image_url || data?.image_url || ''
      const fullUrl = resolveImageUrl(imagePath)
      setUser({ ...user!, picture: fullUrl, initials: getInitials(user!.name) })
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
    } catch (err: any) {
      setPicErr(err.message || 'Could not upload image.')
    } finally { setPicLoading(false) }
  }

  const handleRequestEmailCode = async () => {
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
      return setEmailErr('Enter a valid email address.')
    setEmailLoading(true); setEmailErr(''); setEmailSuccess('')
    try {
      const res = await fetch(`${apiUrl}/user/change-email/request`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to send code.')
      setEmailStep('verify')
      setEmailSuccess('Verification code sent successfully!')
      setTimeout(() => setEmailSuccess(''), 5000)
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
      // logout() already hard-redirects to /login
      return
    } catch (err: any) {
      setDeleteErr(err.message || 'Could not delete account.')
      setDeleteLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordErr(''); setPasswordSuccess('')

    if (!currentPassword) return setPasswordErr('Current password is required.')
    if (!newPassword) return setPasswordErr('New password is required.')
    if (newPassword.length < 8) return setPasswordErr('Password must be at least 8 characters.')
    if (newPassword !== confirmPassword) return setPasswordErr('Passwords do not match.')

    setPasswordLoading(true)
    try {
      const res = await fetch(`${apiUrl}/user/change-password`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          currentPassword: currentPassword,
          newPassword: newPassword,
          confirmPassword: confirmPassword,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to change password.')

      setPasswordSuccess('Password changed successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(''), 3000)
    } catch (err: any) {
      setPasswordErr(err.message || 'Could not change password.')
    } finally {
      setPasswordLoading(false)
    }
  }

  const inputStyle = { backgroundColor: inputBg, borderColor: inputBorder, color: inputText }

  const sidebarLinks: { key: Tab; label: string; icon: any }[] = [
    { key: 'profile' as Tab, label: 'Profile', icon: User },
    ...(isStaffUser ? [{ key: 'history' as Tab, label: 'Ticket History', icon: History }] : []),
    ...(isSystemAdmin(user?.role) ? [{ key: 'users' as Tab, label: 'User Management', icon: Shield }] : []),
    { key: 'password' as Tab, label: 'Change Password', icon: Lock },
  ]

  return (
    <div className={tab === 'history' ? 'w-full pb-16' : 'w-full max-w-5xl mx-auto pb-16'} style={{ backgroundColor: pageBg }}>
      <div className="flex flex-col md:flex-row gap-0 md:gap-6">

        {/* ══════════════════════════════════════════════════════════════════
            LEFT SIDEBAR
        ══════════════════════════════════════════════════════════════════ */}
        <aside className="w-full md:w-56 shrink-0">
          {/* User avatar + name */}
          <div className="flex md:flex-col items-center gap-3 md:gap-2 px-4 py-5 md:pt-6 md:pb-5"
            style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }}>
            <UserAvatar name={user?.name} imageUrl={user?.picture} size="md" ring className="md:w-16 md:h-16" />
            <div className="md:text-center min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: textPrimary }}>{formatPersonName(user?.name || '')}</p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#10B981] mt-0.5">
                <Shield className="w-3 h-3" />
                {user?.jobTitle ? formatPersonName(user.jobTitle) : formatRole(user?.role)}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex md:flex-col overflow-x-auto md:overflow-visible"
            style={{ backgroundColor: cardBg }}>
            {sidebarLinks.map(({ key, label, icon: Icon }) => {
              const active = tab === key
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap md:w-full text-left
                    ${active ? 'border-b-2 md:border-b-0 md:border-l-2' : 'border-b-2 md:border-b-0 md:border-l-2 border-transparent'}`}
                  style={{
                    color: active ? '#10B981' : textMuted,
                    borderColor: active ? '#10B981' : 'transparent',
                    backgroundColor: active ? (isLight ? '#f0fdf4' : 'rgba(16,185,129,0.06)') : 'transparent',
                  }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT CONTENT AREA
        ══════════════════════════════════════════════════════════════════ */}
        <main className="flex-1 min-w-0">

          {/* ── Tab: Profile ─────────────────────────────────────── */}
          {tab === 'profile' && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              {/* Header */}
              <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${border}` }}>
                <h2 className="text-lg font-semibold" style={{ color: textPrimary }}>My profile</h2>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Manage and protect your account</p>
              </div>

              <form onSubmit={handleSaveName}>
                <div className="flex flex-col md:flex-row">
                  {/* Left: form fields */}
                  <div className="flex-1 px-6 py-5 space-y-5" style={{ borderRight: `1px solid ${border}` }}>

                    {/* Name row */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
                      <label className="w-36 shrink-0 text-sm font-medium text-right pr-5 pb-1 sm:pb-0" style={{ color: textMuted }}>Name</label>
                      <input
                        type="text" required value={name}
                        onChange={e => setName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'.-]/g, ''))}
                        onBlur={e => setName(formatPersonName(e.target.value))}
                        style={inputStyle} className={`${ic} flex-1`} placeholder="Juan Dela Cruz"
                      />
                    </div>

                    {/* Work email — read-only for branch managers */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
                      <label className="w-36 shrink-0 text-sm font-medium text-right pr-5 pb-1 sm:pb-0" style={{ color: textMuted }}>
                        {isManager ? 'Work email' : 'Email'}
                      </label>
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm break-all" style={{ color: textPrimary }}>{user?.email}</span>
                          {!isManager && (
                            <button
                              type="button"
                              onClick={() => { setShowEmailModal(true); setEmailStep('input'); setEmailErr(''); setNewEmail(''); setEmailCode('') }}
                              className="text-[#10B981] text-sm font-semibold hover:underline shrink-0"
                            >
                              Change
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isManager && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
                        <label className="w-36 shrink-0 text-sm font-medium text-right pr-5 pb-1 sm:pb-0" style={{ color: textMuted }}>Personal email</label>
                        <input
                          type="email"
                          value={personalEmail}
                          onChange={e => setPersonalEmail(e.target.value)}
                          style={inputStyle}
                          className={`${ic} flex-1`}
                          placeholder="your.personal@email.com"
                          autoComplete="email"
                        />
                      </div>
                    )}

                    {isStaffUser && (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-0">
                          <label className="w-36 shrink-0 text-sm font-medium text-right pr-5 pb-1 sm:pb-0 sm:pt-3" style={{ color: textMuted }}>Contact Number</label>
                          <div className="flex-1">
                            <input
                              type="tel"
                              value={phone}
                              onChange={e => setPhone(e.target.value.replace(/[^0-9+\s-]/g, ''))}
                              style={inputStyle}
                              className={`${ic} w-full`}
                              placeholder="09XX XXX XXXX"
                              maxLength={20}
                              autoComplete="tel"
                            />
                            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: textMuted }}>
                              Shown on tickets assigned to you when staff view ticket details.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-0 mt-4">
                          <label className="w-36 shrink-0 text-sm font-medium text-right pr-5 pb-1 sm:pb-0 sm:pt-3" style={{ color: textMuted }}>Birthdate</label>
                          <div className="flex-1">
                            <input
                              type="date"
                              value={birthDate}
                              onChange={e => setBirthDate(e.target.value)}
                              style={inputStyle}
                              className={`${ic} w-full`}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Role row (read-only) */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
                      <label className="w-36 shrink-0 text-sm font-medium text-right pr-5 pb-1 sm:pb-0" style={{ color: textMuted }}>Role</label>
                       <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                          <Shield className="w-3 h-3" />
                          {user?.jobTitle ? formatPersonName(user.jobTitle) : formatRole(user?.role)}
                       </span>
                    </div>

                    {/* Feedback */}
                    {(nameErr || nameMsg) && (
                      <div className="sm:pl-36">
                        {nameErr && <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2">{nameErr}</p>}
                        {nameMsg && <p className="text-sm text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl px-4 py-2">{nameMsg}</p>}
                      </div>
                    )}

                    {/* Save button */}
                    <div className="sm:pl-36 pt-1">
                      <button
                        type="submit" disabled={nameLoading}
                        className={`px-8 py-2.5 rounded-lg font-bold text-sm text-white transition-all ${nameLoading ? 'bg-slate-500 cursor-not-allowed' : 'bg-[#10B981] hover:bg-emerald-500 hover:shadow-lg hover:shadow-[#10B981]/20'}`}
                      >
                        {nameLoading ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {/* Right: profile picture */}
                  <div className="w-full md:w-56 flex flex-col items-center justify-start py-6 px-4 order-first md:order-last border-b md:border-b-0 md:border-l" style={{ borderColor: border }}>
                    <UserAvatar name={user?.name} imageUrl={user?.picture} size="lg" ring className="shadow-md mb-4" />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={picLoading}
                      className="px-4 py-2 rounded-lg border text-sm font-medium transition-all hover:border-[#10B981] hover:text-[#10B981] disabled:opacity-50"
                      style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
                    >
                      {picLoading ? 'Uploading…' : 'Change photo'}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePicChange} />
                    <p className="text-xs mt-3 text-center leading-relaxed" style={{ color: textMuted }}>
                      JPEG or PNG · max 10 MB
                    </p>
                    {picErr && <p className="text-xs text-red-400 mt-2 text-center">{picErr}</p>}
                  </div>
                </div>
              </form>
            </div>
          )}


          {/* ── Tab: Change Password ─────────────────────────────── */}
          {tab === 'password' && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              {/* Header */}
              <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${border}` }}>
                <h2 className="text-lg font-black" style={{ color: textPrimary }}>Change Password</h2>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Update your password to keep your account secure</p>
              </div>

              <form onSubmit={handleChangePassword} className="px-6 py-5 max-w-md">
                {/* Current password */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: textMuted }}>Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'} value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      style={inputStyle} className={`${ic} pr-10`} placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: textMuted }}>New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'} value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      style={inputStyle} className={`${ic} pr-10`} placeholder="Enter new password (min 8 chars)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: textMuted }}>Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      style={inputStyle} className={`${ic} pr-10`} placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Feedback */}
                {(passwordErr || passwordSuccess) && (
                  <div className="mb-4">
                    {passwordErr && <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2">{passwordErr}</p>}
                    {passwordSuccess && <p className="text-sm text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl px-4 py-2">{passwordSuccess}</p>}
                  </div>
                )}

                <button
                  type="submit" disabled={passwordLoading}
                  className={`px-8 py-2.5 rounded-lg font-bold text-sm text-white transition-all ${passwordLoading ? 'bg-slate-500 cursor-not-allowed' : 'bg-[#10B981] hover:bg-emerald-500 hover:shadow-lg hover:shadow-[#10B981]/20'}`}
                >
                  {passwordLoading ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            </div>
          )}

          {/* ── Tab: Privacy Settings ────────────────────────────── */}
          {tab === 'privacy' && (
            <div className="flex flex-col gap-4">
              {/* Privacy Options */}
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${border}` }}>
                  <h2 className="text-lg font-black" style={{ color: textPrimary }}>Privacy Settings</h2>
                  <p className="text-sm mt-0.5" style={{ color: textMuted }}>Manage your privacy preferences</p>
                </div>

                <div className="px-6 py-5 space-y-4">
                  {/* Profile visibility */}
                  <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${border}` }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>Profile Visibility</p>
                      <p className="text-xs mt-0.5" style={{ color: textMuted }}>Allow others to see your profile information</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10B981]"></div>
                    </label>
                  </div>

                  {/* Data sharing */}
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>Data Analytics</p>
                      <p className="text-xs mt-0.5" style={{ color: textMuted }}>Share usage data to help improve our services</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10B981]"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Request Account Deletion (hidden for admin) */}
              {user?.role !== 'admin' && (
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid rgba(239,68,68,0.2)` }}>
                  <div className="px-6 pt-5 pb-4 flex items-center gap-2" style={{ borderBottom: `1px solid rgba(239,68,68,0.15)` }}>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <h2 className="text-sm font-black text-red-400">Account Deletion</h2>
                  </div>
                  <div className="px-6 py-5">
                    <p className="text-sm mb-4" style={{ color: textMuted }}>
                      Request permanent deletion of your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                      type="button" onClick={() => setShowDeleteModal(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 font-semibold text-sm transition-all"
                    >
                      <Trash2 className="w-4 h-4" /> Request Account Deletion
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: User Management (Admin Only) ───────────────── */}
          {tab === 'users' && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              {/* Header */}
              <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${border}` }}>
                <h2 className="text-lg font-black" style={{ color: textPrimary }}>User Management</h2>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>View and manage system users</p>
              </div>

              <div className="px-6 py-5">
                {/* Role Filter */}
                <div className="mb-5">
                  <label className="block text-sm font-medium mb-2" style={{ color: textMuted }}>Filter by Role</label>
                  <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    style={inputStyle}
                    className={ic}
                  >
                    <option value="CUSTOMER">Customers</option>
                    <option value="EMPLOYEE">Employees</option>
                    <option value="MANAGER">OIC / Officer in Charge</option>
                  </select>
                </div>

                {/* Error */}
                {usersErr && (
                  <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2 mb-4">{usersErr}</p>
                )}

                {/* User List */}
                {usersLoading ? (
                  <div className="text-center py-8">
                    <p className="text-sm" style={{ color: textMuted }}>Loading users...</p>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm" style={{ color: textMuted }}>No users found for this role.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${border}` }}>
                          <th className="text-left py-3 px-2 font-semibold" style={{ color: textMuted }}>Name</th>
                          <th className="text-left py-3 px-2 font-semibold" style={{ color: textMuted }}>Email</th>
                          <th className="text-left py-3 px-2 font-semibold" style={{ color: textMuted }}>Phone</th>
                          <th className="text-left py-3 px-2 font-semibold" style={{ color: textMuted }}>Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u: any) => (
                          <tr key={u.id} style={{ borderBottom: `1px solid ${border}` }}>
                            <td className="py-3 px-2" style={{ color: textPrimary }}>{u.name || '-'}</td>
                            <td className="py-3 px-2" style={{ color: textPrimary }}>{u.email || '-'}</td>
                            <td className="py-3 px-2" style={{ color: textPrimary }}>{u.phone || '-'}</td>
                            <td className="py-3 px-2">
                               <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                                <Shield className="w-3 h-3" />{u.jobTitle || formatRole(u.role)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Notifications ──────────────────────────────── */}
          {tab === 'notifications' && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              {/* Header */}
              <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${border}` }}>
                <h2 className="text-lg font-black" style={{ color: textPrimary }}>Notifications</h2>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Choose how you want to be notified</p>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* Email notifications section */}
                <div className="mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: textMuted }}>Email Notifications</h3>

                  {/* Ticket updates */}
                  <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${border}` }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>Ticket Updates</p>
                      <p className="text-xs mt-0.5" style={{ color: textMuted }}>Get notified when your ticket status changes</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10B981]"></div>
                    </label>
                  </div>

                  {/* New messages */}
                  <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${border}` }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>New Messages</p>
                      <p className="text-xs mt-0.5" style={{ color: textMuted }}>Get notified when you receive a new message</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10B981]"></div>
                    </label>
                  </div>

                  {/* Promotions */}
                  <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${border}` }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>Promotions</p>
                      <p className="text-xs mt-0.5" style={{ color: textMuted }}>Receive offers and promotional content</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10B981]"></div>
                    </label>
                  </div>
                </div>

                {/* Push notifications section */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: textMuted }}>Push Notifications</h3>

                  {/* Browser push */}
                  <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${border}` }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>Browser Notifications</p>
                      <p className="text-xs mt-0.5" style={{ color: textMuted }}>Show browser push notifications</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10B981]"></div>
                    </label>
                  </div>

                  {/* Sound alerts */}
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: textPrimary }}>Sound Alerts</p>
                      <p className="text-xs mt-0.5" style={{ color: textMuted }}>Play sound when receiving notifications</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10B981]"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Ticket History ─────────────────────────────── */}
          {tab === 'history' && isStaffUser && user?.id && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${border}` }}>
                <h2 className="text-lg font-black" style={{ color: textPrimary }}>Ticket History</h2>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Tickets you created, negotiated, or worked on</p>
              </div>
              <div>
                <TicketHistoryTable
                  person={{
                    id: user.id,
                    name: user.name || '',
                    email: user.email || '',
                    personalEmail: user.personalEmail || undefined,
                  }}
                />
              </div>
            </div>
          )}

        </main>
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
                <div className="flex justify-between items-center mt-2 px-1">
                  <button type="button" onClick={() => { setEmailStep('input'); setEmailErr(''); setEmailSuccess('') }}
                    className="text-xs font-semibold hover:underline" style={{ color: textMuted }}>
                    Use a different email
                  </button>
                  <button type="button" onClick={handleRequestEmailCode} disabled={emailLoading}
                    className="text-xs font-bold text-[#10B981] hover:underline disabled:opacity-50">
                    {emailLoading ? 'Sending...' : 'Resend Code'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Account Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}>
          <div
            className="relative w-full max-w-md rounded-2xl shadow-2xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 right-4" style={{ color: textMuted }}>
              <X className="w-5 h-5" />
            </button>
            
            <div className="px-8 py-8">
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-6 mx-auto">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>

              {/* Title */}
              <h2 className="text-2xl font-bold text-center mb-2" style={{ color: textPrimary }}>
                Request Account Deletion
              </h2>

              {/* Description */}
              <p className="text-center mb-6 leading-relaxed" style={{ color: textMuted }}>
                This action is <span className="font-semibold text-red-500">permanent</span> and cannot be undone. All your data, tickets, and history will be permanently erased.
              </p>

              {/* Confirmation input */}
              <div className="mb-6">
                <p className="text-sm font-medium mb-2 text-center" style={{ color: textMuted }}>
                  Type <span className="font-bold text-red-500">DELETE</span> to confirm:
                </p>
                <input 
                  type="text" 
                  value={deleteConfirm} 
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE" 
                  autoFocus 
                  style={inputStyle} 
                  className={`${ic} text-center font-bold tracking-wider`} 
                />
                {deleteErr && <p className="text-sm text-red-400 mt-2 text-center">{deleteErr}</p>}
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm border transition-all"
                  style={{ borderColor: inputBorder, color: textMuted, backgroundColor: inputBg }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading || deleteConfirm !== 'DELETE'}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteLoading ? 'Requesting...' : 'Request Deletion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
