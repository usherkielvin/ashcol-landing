import { useState, useEffect } from 'react'
import { Search, MapPin, CheckCircle, XCircle, Users, Tag } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { PUBLIC_BRANCHES } from '../data/branches'

interface Branch {
  id?: string
  name: string
  location: string
  address: string
  phone?: string
  email: string
  is_active: boolean
  isActive?: boolean
  manager_name?: string
  managerName?: string
  employee_count?: number
  active_tickets?: number
  tag?: string
  color?: string
  phones?: string[]
  landline?: string
  mapUrl?: string
  region?: string
  isHQ?: boolean
}

const ACCENTS = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6']
const accentFor = (i: number) => ACCENTS[i % ACCENTS.length]

export default function Branches() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)

  const isAllowed = user?.role?.toLowerCase() === 'manager' || user?.role?.toLowerCase() === 'admin'

  const normalize = (value: string) => value.trim().toLowerCase()

  const fetchBranches = async () => {
    if (!isAllowed) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      
      const res = await fetch(`${apiUrl}/branches`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to fetch branches')
      }
      
      const data = await res.json()
      const apiBranches = data.data || []
      const mergedBranches = PUBLIC_BRANCHES.map((publicBranch) => {
        const publicName = normalize(publicBranch.name)
        const publicTag = normalize(publicBranch.tag)
        const apiBranch = apiBranches.find((apiBranch: Branch) => {
          const apiName = normalize(apiBranch.name || '')
          const apiLocation = normalize(apiBranch.location || '')
          return apiName === publicName || apiName.includes(publicTag) || apiLocation.includes(publicTag)
        })
        return {
          id: apiBranch?.id,
          name: publicBranch.name,
          location: apiBranch?.location || publicBranch.tag,
          address: publicBranch.address,
          phone: apiBranch?.phone || publicBranch.phones?.[0],
          phones: publicBranch.phones,
          landline: publicBranch.landline,
          email: apiBranch?.email || publicBranch.email,
          is_active: apiBranch?.is_active ?? apiBranch?.isActive ?? true,
          isActive: apiBranch?.isActive ?? apiBranch?.is_active ?? true,
          manager_name: apiBranch?.manager_name,
          managerName: apiBranch?.managerName,
          employee_count: apiBranch?.employee_count,
          active_tickets: apiBranch?.active_tickets,
          tag: publicBranch.tag,
          color: publicBranch.color,
          mapUrl: publicBranch.mapUrl,
          region: publicBranch.region,
          isHQ: publicBranch.isHQ,
        }
      })
      setBranches(mergedBranches)
    } catch (err: any) {
      setError(err.message || 'Failed to load branches')
      console.error('Error fetching branches:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBranches()
  }, [isAllowed])

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg       = isLight ? '#ffffff' : '#0A1120'
  const border       = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary  = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted    = isLight ? '#64748b' : '#7A95B8'
  const inputBg      = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder  = isLight ? '#cbd5e1' : '#243452'
  const tabActiveBg  = isLight ? '#10B981' : '#10B981'
  const tabActiveText= '#ffffff'

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
          <MapPin className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: textPrimary }}>Access Denied</h2>
        <p style={{ color: textMuted }} className="max-w-xs">You don't have permission to view branches.</p>
      </div>
    )
  }

  const filteredBranches = branches.filter(b => {
    const active = b.isActive ?? b.is_active
    if (filterActive !== null && active !== filterActive) return false
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return b.name.toLowerCase().includes(q) || 
             b.location?.toLowerCase().includes(q) ||
             b.address?.toLowerCase().includes(q) ||
             b.region?.toLowerCase().includes(q)
    }
    
    return true
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight mb-1">Branches</h2>
          <p style={{ color: textMuted }} className="text-sm">Manage service branch locations and details</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center justify-between">
          <span className="text-sm font-medium">{error}</span>
          <button onClick={fetchBranches} className="text-xs bg-red-100 dark:bg-red-800/50 hover:bg-red-200 dark:hover:bg-red-800 px-3 py-1.5 rounded-lg transition-colors font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="p-4 border rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { label: 'All', value: null },
            { label: 'Active', value: true },
            { label: 'Inactive', value: false }
          ]).map((tab) => (
            <button
              key={tab.label}
              onClick={() => setFilterActive(tab.value)}
              style={filterActive === tab.value 
                ? { backgroundColor: tabActiveBg, color: tabActiveText, borderColor: tabActiveBg } 
                : { color: textMuted, borderColor: inputBorder }}
              className="px-4 py-2 border rounded-xl text-sm font-bold transition-all"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div style={{ backgroundColor: inputBg, borderColor: inputBorder }} className="flex flex-1 md:w-64 items-center border rounded-xl px-3 py-2.5 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all">
            <Search className="w-4 h-4 mr-2" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ color: textPrimary }}
              className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400"
            />
          </div>
          <span className="text-sm font-medium ml-2" style={{ color: textMuted }}>
            {filteredBranches.length} found
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p style={{ color: textMuted }} className="font-medium text-sm">Loading branches...</p>
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center bg-white dark:bg-[#0A1120] border border-slate-200 dark:border-[#1E2D48] rounded-2xl shadow-sm">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <MapPin className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold mb-1" style={{ color: textPrimary }}>No branches found</h3>
          <p style={{ color: textMuted }} className="text-sm">Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredBranches.map((branch, idx) => {
            const accent = accentFor(idx)
            return (
              <div key={branch.id} style={{ backgroundColor: cardBg, borderColor: border }} className="rounded-2xl border overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
                <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
                
                <div className="p-5 flex-1 flex flex-col">
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}15` }}>
                      <MapPin className="w-6 h-6" style={{ color: accent }} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <h3 className="font-bold text-lg leading-tight truncate mb-1" style={{ color: textPrimary }}>{branch.name}</h3>
                      <p className="text-sm truncate" style={{ color: textMuted }}>{branch.location}</p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 border ${(branch.isActive ?? branch.is_active) ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'}`}>
                      {(branch.isActive ?? branch.is_active) ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      <span className="text-[10px] font-bold uppercase tracking-wider">{(branch.isActive ?? branch.is_active) ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-3 mb-6 flex-1">
                    {branch.address && (
                      <div className="flex gap-3">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: textMuted }} />
                        <p className="text-sm leading-relaxed" style={{ color: textPrimary }}>{branch.address}</p>
                      </div>
                    )}
                    {branch.phone && (
                      <div className="flex gap-3 items-center">
                        <Tag className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
                        <p className="text-sm" style={{ color: textPrimary }}><span style={{ color: textMuted }} className="font-normal mr-1">Contact:</span> {branch.phone}</p>
                      </div>
                    )}
                    {(branch.managerName || branch.manager_name) && (
                      <div className="flex gap-3 items-center">
                        <Users className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
                        <p className="text-sm font-medium" style={{ color: textPrimary }}><span style={{ color: textMuted }} className="font-normal mr-1">Manager:</span> {branch.managerName || branch.manager_name}</p>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-3 pt-4 mt-auto border-t" style={{ borderColor: border }}>
                    <div className="flex-1 rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: `${accent}08` }}>
                      <Users className="w-5 h-5" style={{ color: accent }} />
                      <div>
                        <div className="text-lg font-black leading-none mb-0.5" style={{ color: textPrimary }}>{branch.employee_count ?? 0}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Staff</div>
                      </div>
                    </div>
                    <div className="flex-1 rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: `${accent}08` }}>
                      <Tag className="w-5 h-5" style={{ color: accent }} />
                      <div>
                        <div className="text-lg font-black leading-none mb-0.5" style={{ color: textPrimary }}>{branch.active_tickets ?? 0}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Tickets</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
