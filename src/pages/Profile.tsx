import { useState } from 'react'
import { useAuth, getInitials } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { User, Mail, Shield, Check, Camera, LogOut, Phone } from 'lucide-react'

export default function Profile() {
  const { user, setUser, logout } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || ''
  })
  const [successMsg, setSuccessMsg] = useState('')

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSuccessMsg('')
    try {
      const token = sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      
      const res = await fetch(`${apiUrl}/user/profile`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })
      
      if (!res.ok) throw new Error('Failed to update profile')
      
      const data = await res.json()
      const updatedUser = data?.data || data
      
      // Update local context
      const newUser = {
        ...user!,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        picture: updatedUser.profileImage || user?.picture || '',
        initials: getInitials(updatedUser.name)
      }
      setUser(newUser)
      
      setSuccessMsg('Profile updated successfully!')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      console.error('Update profile error:', err)
      alert('Could not update profile.')
    } finally {
      setLoading(false)
    }
  }

  const cardBg       = isLight ? '#ffffff' : '#0A1120'
  const border       = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary  = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted    = isLight ? '#64748b' : '#7A95B8'
  const inputBg      = isLight ? '#f8fafc' : '#0F1A2E'

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-10">
      <div className="flex flex-col gap-2">
        <h2 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight mb-1">My Profile</h2>
        <p style={{ color: textMuted }} className="text-sm">Manage your personal account details and preferences.</p>
      </div>

      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col md:flex-row shadow-sm overflow-hidden">
        
        {/* Left column: Avatar */}
        <div style={{ borderColor: border, backgroundColor: inputBg }} className="p-8 md:w-1/3 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r text-center">
          <div className="relative group mb-5">
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-32 h-32 rounded-full object-cover border-4 border-[#10B981] shadow-lg"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-[#10B981] flex items-center justify-center text-white font-black text-4xl shadow-lg border-4 border-white/10">
                {user?.initials ?? '?'}
              </div>
            )}
            <button className="absolute bottom-1 right-1 bg-white dark:bg-[#1E2D48] text-slate-700 dark:text-[#F0F6FF] rounded-full p-2.5 shadow-md border hover:border-[#10B981] hover:text-[#10B981] transition-all">
              <Camera className="w-4 h-4" />
            </button>
          </div>
          <h3 style={{ color: textPrimary }} className="text-xl font-bold mb-1">{user?.name}</h3>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(16,185,129,0.1)] text-[#10B981] text-[11px] font-bold uppercase tracking-wider rounded-full border border-[rgba(16,185,129,0.2)]">
            <Shield className="w-3.5 h-3.5" />
            {user?.role}
          </span>
        </div>

        {/* Right column: Details Form */}
        <div className="p-8 md:w-2/3 flex flex-col gap-6">
          <form onSubmit={handleUpdateProfile} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-[#7A95B8] uppercase tracking-wider flex items-center gap-2">
                  <User className="w-3.5 h-3.5" /> Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#f8fafc] dark:bg-[#0F1A2E] border border-slate-200 dark:border-[#243452] text-slate-800 dark:text-[#F0F6FF] rounded-xl px-4 py-3.5 font-medium transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none"
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-[#7A95B8] uppercase tracking-wider flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5" /> Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email}
                  className="w-full bg-[#f8fafc] dark:bg-[#0F1A2E] border border-slate-200 dark:border-[#243452] text-slate-800 dark:text-[#F0F6FF] rounded-xl px-4 py-3.5 opacity-60 cursor-not-allowed font-medium"
                />
                <p className="text-xs text-[#10B981] flex items-center gap-1 mt-1 font-semibold">
                  <Check className="w-3.5 h-3.5" /> Verified Account
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-[#7A95B8] uppercase tracking-wider flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" /> Phone Number
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-[#f8fafc] dark:bg-[#0F1A2E] border border-slate-200 dark:border-[#243452] text-slate-800 dark:text-[#F0F6FF] rounded-xl px-4 py-3.5 font-medium transition-all focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none"
                  placeholder="+63 9xx xxx xxxx"
                />
              </div>
            </div>

            <div style={{ borderColor: border }} className="border-t pt-6 mt-2 flex justify-between items-center">
              <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold text-sm transition-all"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
                
                <button 
                  type="submit"
                  disabled={loading}
                  className={`px-8 py-2.5 rounded-xl font-bold text-sm transition-all text-white ${loading ? 'bg-slate-500 cursor-not-allowed' : 'bg-[#10B981] hover:bg-emerald-500 glow-green-sm'}`}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
          </form>
          
          {successMsg && (
            <div className="text-sm font-bold text-[#10B981] text-right mt-[-10px] animate-in slide-in-from-top-2 duration-300">{successMsg}</div>
          )}
        </div>
      </div>
    </div>
  )
}
