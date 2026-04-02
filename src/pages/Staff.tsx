import { useState, useEffect } from 'react'
import { Search, MoreVertical, Wrench, Mail, Phone, RefreshCw, UserCheck, Shield } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

interface StaffMember {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  isActive: boolean
  profileImage?: string
}

export default function Staff() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStaff = async () => {
    try {
      setLoading(true)
      const token = sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      
      // Fetch Employees
      const resEmp = await fetch(`${apiUrl}/user/all?role=EMPLOYEE`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const dataEmp = resEmp.ok ? await resEmp.json() : { data: [] }
      
      // Fetch Managers
      const resMan = await fetch(`${apiUrl}/user/all?role=MANAGER`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const dataMan = resMan.ok ? await resMan.json() : { data: [] }

      const allStaff = [...(dataMan?.data || []), ...(dataEmp?.data || [])]
      
      setStaff(allStaff.map((s: any) => ({
        id: s.id,
        name: s.name || 'Unknown',
        email: s.email || '',
        phone: s.phone || '',
        role: s.role || 'EMPLOYEE',
        isActive: s.isActive !== false,
        profileImage: s.profileImage
      })))
    } catch (err) {
      console.error('Error fetching staff:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStaff() }, [])

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg       = isLight ? '#ffffff' : '#0A1120'
  const border       = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary  = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted    = isLight ? '#64748b' : '#7A95B8'
  const rowHover     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const theadBg      = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const inputBg      = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder  = isLight ? '#cbd5e1' : '#243452'
  const tabActiveBg  = isLight ? '#e2e8f0' : '#1E2D48'
  const tabActiveText= isLight ? '#0f172a' : '#ffffff'

  const filteredStaff = staff.filter(s => {
    if (activeTab === 'manager' && s.role !== 'MANAGER') return false
    if (activeTab === 'employee' && s.role !== 'EMPLOYEE') return false

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return s.name.toLowerCase().includes(q) ||
             s.email.toLowerCase().includes(q) ||
             s.role.toLowerCase().includes(q)
    }
    return true
  })

  const getInitialsColor = (name: string) => {
    const colors = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6']
    return colors[name.charCodeAt(0) % colors.length]
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight mb-1">Staff & Roles</h2>
          <p style={{ color: textMuted }} className="text-sm">Manage internal employees and administrative roles.</p>
        </div>
        <button
          onClick={fetchStaff}
          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
          className="flex items-center gap-2 border px-4 py-2.5 rounded-xl font-bold transition-all hover:text-[#10B981] hover:border-[#10B981] text-sm shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Main Card */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col overflow-hidden shadow-sm">
        
        {/* Toolbar */}
        <div style={{ borderColor: border }} className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-5 border-b gap-4">
          
          {/* Tabs */}
          <div style={{ borderColor: border, backgroundColor: inputBg }} className="flex p-1 border rounded-xl w-full lg:w-auto overflow-x-auto">
            {['all', 'manager', 'employee'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={activeTab === tab
                  ? { backgroundColor: tabActiveBg, color: tabActiveText }
                  : { color: textMuted }
                }
                className="px-5 py-2 text-sm font-bold capitalize rounded-lg transition-all shrink-0"
              >
                {tab}s
              </button>
            ))}
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div
              style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              className="flex flex-1 lg:w-64 items-center border rounded-xl px-3 py-2.5 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all"
            >
              <Search className="w-4 h-4 mr-2" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ color: textPrimary }}
                className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr style={{ backgroundColor: theadBg, color: textMuted }} className="text-xs uppercase tracking-wider font-bold">
                <th style={{ borderColor: border }} className="p-4 pl-6 border-b">Member</th>
                <th style={{ borderColor: border }} className="p-4 border-b">Role</th>
                <th style={{ borderColor: border }} className="p-4 border-b">Contact</th>
                <th style={{ borderColor: border }} className="p-4 border-b">Status</th>
                <th style={{ borderColor: border }} className="p-4 pr-6 border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[#7A95B8]">Loading staff...</td>
                </tr>
              ) : filteredStaff.length > 0 ? filteredStaff.map((s) => (
                <tr
                  key={s.id}
                  style={{ borderColor: border }}
                  className="border-b transition-colors"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = rowHover}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                >
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      {s.profileImage ? (
                        <img
                          src={s.profileImage}
                          alt={s.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-black text-sm"
                          style={{ backgroundColor: getInitialsColor(s.name) }}
                        >
                          {getInitials(s.name)}
                        </div>
                      )}
                      <div>
                        <div style={{ color: textPrimary }} className="font-bold mb-0.5">{s.name}</div>
                        <div style={{ color: textMuted }} className="text-xs font-mono">{s.id.substring(0, 12)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px]" style={{ color: s.role === 'MANAGER' ? '#8B5CF6' : '#3B82F6' }}>
                      {s.role === 'MANAGER' ? <Shield className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {s.role}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      {s.email && (
                        <div style={{ color: textMuted }} className="flex items-center gap-2 text-[13px]">
                          <Mail className="w-3.5 h-3.5" />
                          <a href={`mailto:${s.email}`} className="hover:text-[#10B981] transition-colors">{s.email}</a>
                        </div>
                      )}
                      {s.phone && (
                        <div style={{ color: textMuted }} className="flex items-center gap-2 text-[13px]">
                          <Phone className="w-3.5 h-3.5" />
                          <a href={`tel:${s.phone}`} className="hover:text-[#10B981] transition-colors">{s.phone}</a>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div
                      style={s.isActive
                        ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)' }
                        : { color: '#64748b', backgroundColor: 'rgba(148,163,184,0.1)', borderColor: 'rgba(148,163,184,0.2)' }
                      }
                      className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold rounded-full border w-fit"
                    >
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: s.isActive ? '#10B981' : '#64748b' }} />
                      {s.isActive ? 'Active' : 'Inactive'}
                    </div>
                  </td>
                  <td className="p-4 pr-6 text-right">
                    <button style={{ color: textMuted }} className="p-2 hover:bg-[#10B981]/10 hover:text-[#10B981] rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Wrench className="w-12 h-12 text-slate-300 dark:text-[#3A5070] mb-3" />
                      <h3 style={{ color: textPrimary }} className="text-lg font-bold">No staff members found</h3>
                      <p style={{ color: textMuted }} className="text-sm mt-1">Try adjusting your search or filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
