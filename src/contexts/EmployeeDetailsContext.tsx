import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  X, Building2, Phone, CheckCircle, XCircle, Mail, ShieldCheck,
  Wrench, Tag, Globe, Map, Home, Mailbox, MapPin, User, Calendar, RefreshCw
} from 'lucide-react'
import { useTheme } from './ThemeContext'
import { API_BASE_URL } from '../utils/api'

export interface Employee {
  id: string
  name: string
  email: string
  phone: string
  role: string
  jobTitle: string
  branchId: string
  branchName: string
  isActive: boolean
  profileImage?: string
  personalEmail?: string
  region?: string
  city?: string
  barangay?: string
  street?: string
  landmark?: string
  skills?: string
  createdAt?: string
  updatedAt?: string
}

interface EmployeeDetailsContextType {
  isOpen: boolean
  selectedEmployee: Employee | null
  employees: Employee[]
  openEmployeeDetails: (idOrName: string) => Promise<void>
  closeEmployeeDetails: () => void
}

const EmployeeDetailsContext = createContext<EmployeeDetailsContextType | undefined>(undefined)

const resolveLabel = (role: string, jobTitle: string) => {
  const r = (role || '').toUpperCase()
  const j = (jobTitle || '').toUpperCase()
  if (r === 'ADMIN') return 'MANAGER'
  if (r === 'MANAGER') return 'OIC'
  if (j) return j
  return r
}

const roleColor = (role: string) => {
  switch ((role || '').toUpperCase()) {
    case 'ADMIN':   return { bg: 'rgba(139,92,246,0.12)', text: '#8B5CF6', border: 'rgba(139,92,246,0.25)' }
    case 'MANAGER': return { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6', border: 'rgba(59,130,246,0.25)' }
    default:        return { bg: 'rgba(16,185,129,0.10)', text: '#10B981', border: 'rgba(16,185,129,0.20)' }
  }
}

const avatarColor = (name: string) => {
  const colors = ['#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#14B8A6','#EF4444','#6366F1']
  return colors[(name.charCodeAt(0) || 0) % colors.length]
}

const initials = (name: string) =>
  name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || '?'

const parseSkills = (skillsStr?: string): string[] => {
  if (!skillsStr) return []
  try {
    const parsed = JSON.parse(skillsStr)
    if (Array.isArray(parsed)) return parsed.map(s => String(s).trim().toUpperCase()).filter(Boolean)
  } catch {
    return skillsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  }
  return []
}

const getRoleLevel = (skillsStr?: string): string => {
  const list = parseSkills(skillsStr)
  return list[0] || '—'
}

export const EmployeeDetailsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  // Theme tokens
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'

  const [isOpen, setIsOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'address' | 'system'>('overview')
  const [employees, setEmployees] = useState<Employee[]>([])

  const fetchEmployees = async (): Promise<Employee[]> => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      if (!token) return []
      const h = { Authorization: `Bearer ${token}` }
      
      const res = await fetch(`${API_BASE_URL}/user/all`, { headers: h })
      if (!res.ok) return []
      const data = await res.json()
      const list = data?.data || []
      
      // Load branch map
      const branchMap: Record<string, string> = {}
      try {
        const rb = await fetch(`${API_BASE_URL}/branches`, { headers: h })
        if (rb.ok) {
          const bl = (await rb.json())?.data || []
          bl.forEach((b: any) => {
            if (!b.id) return
            const clean = (b.name || b.id).replace(/^ashcol\s+/i, '').trim().toUpperCase()
            branchMap[b.id] = clean
            if (clean === 'TAGUIG') {
              branchMap[`${b.id}-sales`]    = 'TAGUIG - SALES'
              branchMap[`${b.id}-services`] = 'TAGUIG - SERVICES'
            }
          })
        }
      } catch { /* silent */ }

      const mappedList = list.map((s: any) => ({
        id:          s.id,
        name:        s.name        || 'Unknown',
        email:       s.email       || '',
        phone:       s.phone       || '',
        role:        (s.role       || 'EMPLOYEE').toUpperCase(),
        jobTitle:    s.jobTitle    || '',
        branchId:    s.branchId    || '',
        branchName:  s.branchId ? (branchMap[s.branchId] || s.branchId) : '',
        isActive:    s.isActive !== false,
        profileImage: s.profileImage,
        personalEmail: s.personalEmail || '',
        region:      s.region      || '',
        city:        s.city        || '',
        barangay:    s.barangay    || '',
        street:      s.street      || '',
        landmark:    s.landmark    || '',
        skills:      s.skills      || '',
        createdAt:   s.createdAt,
        updatedAt:   s.updatedAt,
      }))
      
      setEmployees(mappedList)
      return mappedList
    } catch (e) {
      console.error('Error loading employees in context:', e)
      return []
    }
  }

  // Pre-load on mount
  useEffect(() => {
    fetchEmployees()
  }, [])

  const openEmployeeDetails = async (idOrName: string) => {
    const latestList = await fetchEmployees()
    const cleanIdOrName = idOrName.trim().toUpperCase()

    // Helper to strip common role prefixes/suffixes in matching
    const cleanName = (str: string) => {
      return str
        .replace(/\s*-\s*(coordinator|manager|oic|staff|technician|admin|sales executive|helper|driver)\b/gi, '')
        .replace(/\b(coordinator|manager|oic|staff|technician|admin|sales executive|helper|driver)\b/gi, '')
        .trim()
        .toUpperCase()
    }

    const searchTarget = cleanName(idOrName)

    let found = latestList.find(emp => emp.id.toUpperCase() === cleanIdOrName)
    if (!found) {
      found = latestList.find(emp => cleanName(emp.name) === searchTarget || emp.name.toUpperCase() === cleanIdOrName)
    }
    if (!found) {
      // Fuzzy/substring match: check if searchTarget matches a part of employee name
      found = latestList.find(emp => {
        const empClean = cleanName(emp.name)
        return empClean.includes(searchTarget) || searchTarget.includes(empClean)
      })
    }

    if (found) {
      setSelectedEmployee(found)
      setActiveTab('overview')
      setIsOpen(true)
    } else {
      console.warn(`Employee not found for: ${idOrName}`)
    }
  }

  const closeEmployeeDetails = () => {
    setIsOpen(false)
    setSelectedEmployee(null)
  }

  return (
    <EmployeeDetailsContext.Provider value={{ isOpen, selectedEmployee, employees, openEmployeeDetails, closeEmployeeDetails }}>
      {children}
      
      {/* ── Modal Overlay ── */}
      {isOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: isLight ? 'rgba(241,245,249,0.96)' : 'rgba(6,11,24,0.96)', backdropFilter: 'blur(12px)' }}>
          {/* Backdrop click close */}
          <div className="absolute inset-0" onClick={closeEmployeeDetails} />

          {/* Modal Container */}
          <div
            className="w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative z-10"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
              animation: 'modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: border }}>
              <h3 className="text-base font-black tracking-tight" style={{ color: textPrimary }}>Employee Profile Details</h3>
              <button
                onClick={closeEmployeeDetails}
                className="p-2 rounded-xl transition-all hover:bg-slate-500/10"
                style={{ color: textMuted }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body - Dual Column */}
            <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
              
              {/* Left Column - Profile summary & status */}
              <div className="w-full md:w-1/3 p-6 border-b md:border-b-0 md:border-r flex flex-col items-center gap-4 text-center shrink-0" style={{ borderColor: border }}>
                <div className="relative w-24 h-24">
                  {selectedEmployee.profileImage ? (
                    <img
                      src={selectedEmployee.profileImage}
                      alt={selectedEmployee.name}
                      className="w-24 h-24 rounded-full object-cover border border-slate-500/10"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full flex items-center justify-center text-white font-black text-2xl" style={{ backgroundColor: avatarColor(selectedEmployee.name) }}>
                      {initials(selectedEmployee.name)}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-base font-bold" style={{ color: textPrimary }}>{selectedEmployee.name}</h4>
                  <p className="text-xs font-mono mt-0.5" style={{ color: textMuted }}>ID: {selectedEmployee.id}</p>
                </div>

                <div className="flex flex-col gap-1.5 w-full mt-2">
                  <span className="inline-flex items-center justify-center gap-1 px-3 py-1 rounded-lg text-xs font-bold"
                    style={{ backgroundColor: roleColor(selectedEmployee.role).bg, color: roleColor(selectedEmployee.role).text, border: `1px solid ${roleColor(selectedEmployee.role).border}` }}>
                    {resolveLabel(selectedEmployee.role, selectedEmployee.jobTitle)}
                  </span>
                  {selectedEmployee.branchName && (
                    <span className="inline-flex items-center justify-center gap-1 px-3 py-1 rounded-lg text-xs font-bold border"
                      style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}>
                      <Building2 className="w-3.5 h-3.5 mr-1" /> {selectedEmployee.branchName}
                    </span>
                  )}
                </div>

                <div className="w-full border-t pt-4 flex flex-col gap-2 mt-2" style={{ borderColor: border }}>
                  <div className="text-[10px] font-black uppercase tracking-widest text-left" style={{ color: textMuted }}>Status</div>
                  <div
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border"
                    style={selectedEmployee.isActive
                      ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }
                      : { color: textMuted, backgroundColor: inputBg, borderColor: border }}
                  >
                    {selectedEmployee.isActive ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4" />}
                    {selectedEmployee.isActive ? 'Active Member' : 'Deactivated'}
                  </div>
                </div>
              </div>

              {/* Right Column - Categorized detail tables */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Tabs */}
                <div className="flex border-b text-xs uppercase tracking-widest font-black shrink-0" style={{ borderColor: border }}>
                  {(['overview', 'address', 'system'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="flex-1 py-3 text-center border-b-2 transition-all"
                      style={{
                        borderColor: activeTab === tab ? '#10B981' : 'transparent',
                        color: activeTab === tab ? textPrimary : textMuted,
                      }}
                    >
                      {tab.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Tab body */}
                <div className="flex-1 p-6 overflow-y-auto">
                  
                  {/* Overview tab */}
                  {activeTab === 'overview' && (
                    <div className="flex flex-col gap-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { label: 'Work Email', value: selectedEmployee.email || '—', icon: <Mail className="w-4 h-4" /> },
                          { label: 'Personal Email', value: selectedEmployee.personalEmail || '—', icon: <Mail className="w-4 h-4" /> },
                          { label: 'Phone Number', value: selectedEmployee.phone || '—', icon: <Phone className="w-4 h-4" /> },
                          { label: 'System Role', value: selectedEmployee.role || '—', icon: <ShieldCheck className="w-4 h-4" /> },
                          { label: 'Job Title', value: selectedEmployee.jobTitle || '—', icon: <Wrench className="w-4 h-4" /> },
                          { label: 'Role Level', value: getRoleLevel(selectedEmployee.skills), icon: <Tag className="w-4 h-4" /> },
                        ].map(item => (
                          <div key={item.label} className="p-3 rounded-xl border flex items-center gap-3" style={{ borderColor: border, backgroundColor: inputBg }}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border" style={{ borderColor: border, backgroundColor: cardBg, color: textMuted }}>{item.icon}</div>
                            <div className="min-w-0">
                              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: textMuted }}>{item.label}</div>
                              <div className="text-sm font-semibold truncate" style={{ color: textPrimary }}>{item.value}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Address tab */}
                  {activeTab === 'address' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { label: 'Region', value: selectedEmployee.region, icon: <Globe className="w-4 h-4" /> },
                        { label: 'City', value: selectedEmployee.city, icon: <Map className="w-4 h-4" /> },
                        { label: 'Barangay', value: selectedEmployee.barangay, icon: <Home className="w-4 h-4" /> },
                        { label: 'Street', value: selectedEmployee.street, icon: <Mailbox className="w-4 h-4" /> },
                      ].map(item => (
                        <div key={item.label} className="p-3 rounded-xl border flex items-center gap-3" style={{ borderColor: border, backgroundColor: inputBg }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border" style={{ borderColor: border, backgroundColor: cardBg, color: textMuted }}>{item.icon}</div>
                          <div className="min-w-0">
                            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: textMuted }}>{item.label}</div>
                            <div className="text-sm font-semibold truncate" style={{ color: item.value ? textPrimary : textMuted }}>
                              {item.value || 'Not Configured'}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="col-span-1 sm:col-span-2 p-3 rounded-xl border flex items-start gap-3" style={{ borderColor: border, backgroundColor: inputBg }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border" style={{ borderColor: border, backgroundColor: cardBg, color: textMuted }}><MapPin className="w-4 h-4" /></div>
                        <div className="min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Landmark Description</div>
                          <div className="text-sm font-semibold mt-0.5" style={{ color: selectedEmployee.landmark ? textPrimary : textMuted }}>
                            {selectedEmployee.landmark || 'No landmark description added'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* System tab */}
                  {activeTab === 'system' && (
                    <div className="flex flex-col gap-4">
                      {[
                        { label: 'Employee ID', value: selectedEmployee.id, icon: <User className="w-4 h-4" /> },
                        { label: 'Hire Date / Registration', value: selectedEmployee.createdAt ? new Date(selectedEmployee.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Unknown', icon: <Calendar className="w-4 h-4" /> },
                        { label: 'Last Profile Update', value: selectedEmployee.updatedAt ? new Date(selectedEmployee.updatedAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }) : 'Unknown', icon: <RefreshCw className="w-4 h-4" /> },
                      ].map(item => (
                        <div key={item.label} className="p-3 rounded-xl border flex items-center gap-3" style={{ borderColor: border, backgroundColor: inputBg }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border" style={{ borderColor: border, backgroundColor: cardBg, color: textMuted }}>{item.icon}</div>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: textMuted }}>{item.label}</div>
                            <div className="text-sm font-semibold" style={{ color: textPrimary }}>{item.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-end gap-3 shrink-0" style={{ borderColor: border }}>
              <button
                onClick={closeEmployeeDetails}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/10"
                style={{ borderColor: border, color: textMuted }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inject styling animations if not defined */}
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

    </EmployeeDetailsContext.Provider>
  )
}

export const useEmployeeDetails = () => {
  const context = useContext(EmployeeDetailsContext)
  if (!context) {
    throw new Error('useEmployeeDetails must be used within an EmployeeDetailsProvider')
  }
  return context
}
