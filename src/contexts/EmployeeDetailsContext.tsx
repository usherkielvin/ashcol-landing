import React, { createContext, useContext, useState, useEffect } from 'react'
import { X, Phone, Mail } from 'lucide-react'
import { useTheme } from './ThemeContext'
import { formatPersonName, resolveImageUrl, EMPLOYEES_DIRECTORY_UPDATED_EVENT, PROFILE_UPDATED_EVENT } from '../utils/api'
import { isTabCacheFresh, readTabCacheEntry } from '../utils/ticketTabCache'
import { fetchCachedBranches, fetchCachedEmployees } from '../utils/portalDirectoryCache'
import { getInitials } from './AuthContext'

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
  birthDate?: string
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
  if (r === 'MANAGER') return 'OFFICER IN CHARGE'
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

/** Same palette convention as UserAvatar's fallback tile, sized up for the big photo showcase. */
const PHOTO_FALLBACK_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6', '#6366F1']
const photoFallbackColor = (name: string) => PHOTO_FALLBACK_COLORS[(name.charCodeAt(0) || 0) % PHOTO_FALLBACK_COLORS.length]

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
  const [employees, setEmployees] = useState<Employee[]>([])
  const [photoBroken, setPhotoBroken] = useState(false)

  useEffect(() => {
    setPhotoBroken(false)
  }, [selectedEmployee?.id, selectedEmployee?.profileImage])

  const mapEmployees = (list: Array<Record<string, unknown>>, branchMap: Record<string, string>): Employee[] =>
    list.map((s) => ({
      id: String(s.id || ''),
      name: String(s.name || 'Unknown'),
      email: String(s.email || ''),
      phone: String(s.phone || ''),
      role: String(s.role || 'EMPLOYEE').toUpperCase(),
      jobTitle: String(s.jobTitle || ''),
      branchId: String(s.branchId || ''),
      branchName: s.branchId ? (branchMap[String(s.branchId)] || String(s.branchId)) : '',
      isActive: s.isActive !== false,
      profileImage: s.profileImage as string | undefined,
      personalEmail: String(s.personalEmail || ''),
      region: String(s.region || ''),
      city: String(s.city || ''),
      barangay: String(s.barangay || ''),
      street: String(s.street || ''),
      landmark: String(s.landmark || ''),
      skills: String(s.skills || ''),
      birthDate: s.birthDate ? String(s.birthDate) : '',
      createdAt: s.createdAt as string | undefined,
      updatedAt: s.updatedAt as string | undefined,
    }))

  const buildBranchMap = (branches: Array<Record<string, unknown>>) => {
    const branchMap: Record<string, string> = {}
    branches.forEach((b) => {
      if (!b.id) return
      const clean = String(b.name || b.id).replace(/^ashcol\s+/i, '').trim().toUpperCase()
      branchMap[String(b.id)] = clean
      if (clean === 'TAGUIG') {
        branchMap[`${b.id}-sales`] = 'TAGUIG - SALES'
        branchMap[`${b.id}-services`] = 'TAGUIG - SERVICES'
      }
    })
    return branchMap
  }

  const fetchEmployees = async (force = false): Promise<Employee[]> => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      if (!token) return employees

      const employeesEntry = readTabCacheEntry<Array<Record<string, unknown>>>('portal-dir:v1:employees:all')
      if (!force && employees.length > 0 && employeesEntry && isTabCacheFresh(employeesEntry.savedAt)) {
        return employees
      }

      const [list, branches] = await Promise.all([
        fetchCachedEmployees(token, undefined, { force }),
        fetchCachedBranches(token),
      ])
      const branchMap = buildBranchMap(branches)
      const mappedList = mapEmployees(list, branchMap)
      setEmployees(mappedList)
      return mappedList
    } catch (e) {
      console.error('Error loading employees in context:', e)
      return employees
    }
  }

  // Pre-load on mount
  useEffect(() => {
    void fetchEmployees()
  }, [])

  useEffect(() => {
    const onDirectoryUpdated = () => { void fetchEmployees(true) }
    window.addEventListener(EMPLOYEES_DIRECTORY_UPDATED_EVENT, onDirectoryUpdated)
    window.addEventListener(PROFILE_UPDATED_EVENT, onDirectoryUpdated)
    return () => {
      window.removeEventListener(EMPLOYEES_DIRECTORY_UPDATED_EVENT, onDirectoryUpdated)
      window.removeEventListener(PROFILE_UPDATED_EVENT, onDirectoryUpdated)
    }
  }, [])

  const openEmployeeDetails = async (idOrName: string) => {
    const latestList = employees.length > 0
      ? employees
      : await fetchEmployees()
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
      
      {/* ── Modal Overlay — dim scrim over the current tab, not an opaque takeover ── */}
      {isOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
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
            {/* Header — same label-over-branch pattern as the page header (e.g. Schedules) */}
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: border }}>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-widest leading-none mb-1 opacity-70" style={{ color: textMuted }}>
                  EMPLOYEE DETAILS
                </span>
                <h3 className="text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase truncate" style={{ color: textPrimary }}>
                  {selectedEmployee.branchName || '—'}
                </h3>
              </div>
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

              {/* Left Column - big photo showcase, no text */}
              <div className="w-full md:w-2/5 p-6 border-b md:border-b-0 md:border-r shrink-0" style={{ borderColor: border }}>
                <div className="w-full aspect-square rounded-2xl overflow-hidden border" style={{ borderColor: border }}>
                  {(() => {
                    const src = resolveImageUrl(selectedEmployee.profileImage)
                    if (src && !photoBroken) {
                      return (
                        <img
                          src={src}
                          alt={selectedEmployee.name || 'Profile'}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={() => setPhotoBroken(true)}
                        />
                      )
                    }
                    return (
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-black text-6xl"
                        style={{ background: `linear-gradient(135deg, ${photoFallbackColor(selectedEmployee.name)}, #059669)` }}
                        aria-hidden={!selectedEmployee.name}
                      >
                        {getInitials(selectedEmployee.name) || '?'}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Right Column - name, title, branch, then the detail grid */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-5">
                  <div>
                    <h4 className="text-4xl font-black tracking-tight" style={{ color: textPrimary }}>
                      {formatPersonName(selectedEmployee.name).toUpperCase()}
                    </h4>
                    <p
                      className="text-sm font-bold uppercase tracking-wide mt-1.5"
                      style={{ color: roleColor(selectedEmployee.role).text }}
                    >
                      {resolveLabel(selectedEmployee.role, selectedEmployee.jobTitle)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Work Email', value: selectedEmployee.email || '—', icon: <Mail className="w-5 h-5" /> },
                      { label: 'Personal Email', value: selectedEmployee.personalEmail || '—', icon: <Mail className="w-5 h-5" /> },
                      { label: 'Phone Number', value: selectedEmployee.phone || '—', icon: <Phone className="w-5 h-5" /> },
                    ].map(item => (
                      <div key={item.label} className="p-4 rounded-xl border flex items-start gap-3.5" style={{ borderColor: border, backgroundColor: inputBg }}>
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border" style={{ borderColor: border, backgroundColor: cardBg, color: textMuted }}>{item.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>{item.label}</div>
                          <div className="text-sm sm:text-base font-semibold break-words" style={{ color: textPrimary }}>{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
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
