import { useState, useEffect } from 'react'
import { Search, MapPin, Users, Phone, Mail, RefreshCw, Building2, ExternalLink } from 'lucide-react'
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
  isActive: boolean
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

const normalize = (value: string) => value.trim().toLowerCase()

export default function Branches() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const isAllowed = user?.role?.toLowerCase() === 'admin'

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#141C2E'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#ffffff' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const rowHover    = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'

  const fetchBranches = async () => {
    if (!isAllowed) { setLoading(false); return }
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
      const merged = apiBranches.map((api: Branch & { is_active?: boolean; active?: boolean }) => {
        const apiName = normalize(api.name || '')
        const apiLocation = normalize(api.location || '')
        const pub = PUBLIC_BRANCHES.find(candidate => {
          const pubName = normalize(candidate.name)
          const pubTag = normalize(candidate.tag)
          return pubName === apiName || pubTag === apiLocation || apiName.includes(pubTag) || apiLocation.includes(pubTag)
        })

        return {
          ...api,
          name: api.name,
          location: api.location || pub?.tag || '',
          address: pub?.address || api.address || '',
          phone: pub?.phones?.[0] || api.phone,
          phones: pub?.phones,
          landline: pub?.landline,
          email: pub?.email || api.email || '',
          isActive: api.isActive ?? api.is_active ?? api.active ?? false,
          tag: pub?.tag,
          color: pub?.color,
          mapUrl: pub?.mapUrl,
          region: pub?.region,
          isHQ: pub?.isHQ,
        }
      })
      setBranches(merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branches')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBranches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllowed, user?.role, user?.branchId])

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: inputBg }}>
          <MapPin className="w-8 h-8" style={{ color: textMuted }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: textPrimary }}>Access Denied</h2>
        <p className="max-w-xs text-sm" style={{ color: textMuted }}>You don't have permission to view branches.</p>
      </div>
    )
  }

  const filteredBranches = branches.filter(b => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return b.name.toLowerCase().includes(q)
          || b.location?.toLowerCase().includes(q)
          || b.address?.toLowerCase().includes(q)
          || b.region?.toLowerCase().includes(q)
    }
    return true
  })

  const headOffice = filteredBranches.find(b => b.isHQ)
  const serviceLocations = filteredBranches.filter(b => !b.isHQ)


  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ color: textPrimary }}>Branches</h2>
          <p className="text-sm" style={{ color: textMuted }}>
            {loading ? 'Loading…' : 'Centrally managed from our Head Office in Taguig, delivering services across all branch locations.'}
          </p>
        </div>
        <button
          onClick={fetchBranches}
          disabled={loading}
          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
          className="flex items-center gap-2 border px-4 py-2.5 rounded-xl font-bold text-sm hover:text-[#10B981] hover:border-[#10B981] transition-all disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Error banner ─────────────────────────────────── */}
      {error && (
        <div className="flex items-center justify-between gap-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl">
          <span className="text-sm font-medium">{error}</span>
          <button onClick={fetchBranches} className="text-xs bg-red-100 dark:bg-red-800/50 hover:bg-red-200 px-3 py-1.5 rounded-lg font-bold transition-colors shrink-0">Retry</button>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────── */}
      <div className="flex justify-between items-center gap-4">
        {/* Search */}
        <div
          style={{ backgroundColor: inputBg, borderColor: inputBorder }}
          className="flex items-center border rounded-xl px-3 py-2.5 w-full sm:w-80 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all"
        >
          <Search className="w-4 h-4 mr-2 shrink-0" style={{ color: textMuted }} />
          <input
            type="text"
            placeholder="Search branches by name, city, address…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ color: textPrimary }}
            className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400"
          />
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium" style={{ color: textMuted }}>Loading branches…</p>
        </div>

      ) : filteredBranches.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] rounded-2xl border" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: inputBg }}>
            <MapPin className="w-7 h-7" style={{ color: textMuted }} />
          </div>
          <h3 className="text-base font-bold mb-1" style={{ color: textPrimary }}>No branches found</h3>
          <p className="text-sm" style={{ color: textMuted }}>Try adjusting your search.</p>
        </div>

      ) : (
        <div className="flex flex-col gap-6">
          {/* ── Head Office (Taguig) Central Headquarters ── */}
          {headOffice && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#10B981]" style={{ letterSpacing: '0.1em' }}>Central Headquarters</h3>
              <div 
                className="rounded-2xl border p-5 flex flex-col md:flex-row gap-5 items-start transition-all duration-300" 
                style={{ 
                  backgroundColor: cardBg, 
                  borderColor: '#10B981', 
                  boxShadow: '0 4px 20px -2px rgba(16, 185, 129, 0.08)' 
                }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                  <Building2 className="w-6 h-6 text-[#10B981]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                    <h4 className="text-base font-black leading-none" style={{ color: textPrimary }}>{headOffice.name}</h4>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                      Managing Headquarters
                    </span>
                  </div>
                  <p className="text-sm font-medium mb-3" style={{ color: textMuted }}>{headOffice.address}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t animate-fade-in" style={{ borderColor: border }}>
                    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: textPrimary }}>
                      <Phone className="w-4 h-4 text-[#10B981] shrink-0" />
                      <span>{headOffice.phones ? headOffice.phones.join(' · ') : headOffice.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: textPrimary }}>
                      <Mail className="w-4 h-4 text-[#10B981] shrink-0" />
                      <span className="truncate">{headOffice.email}</span>
                    </div>
                    {headOffice.mapUrl && (
                      <a
                        href={headOffice.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-bold text-[#10B981] hover:underline hover:opacity-80 transition-opacity"
                      >
                        <span>Open in Google Maps</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Service Locations ── */}
          {serviceLocations.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest mt-2" style={{ color: textMuted, letterSpacing: '0.1em' }}>Service Locations</h3>
              
              {/* Mobile / sm - stacked cards */}
              <div className="flex flex-col gap-3 lg:hidden">
                {serviceLocations.map((branch, idx) => {
                  const accent = accentFor(idx)
                  const staffCount = branch.employee_count ?? 0
                  return (
                    <div key={branch.id ?? idx} className="rounded-2xl border overflow-hidden flex flex-col" style={{ backgroundColor: cardBg, borderColor: border }}>
                      {/* accent strip */}
                      <div className="h-1" style={{ backgroundColor: accent }} />

                      <div className="p-4 flex flex-col gap-3">
                        {/* title row */}
                        <div className="flex items-start gap-3 justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18` }}>
                              <MapPin className="w-4.5 h-4.5" style={{ color: accent }} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[14px] leading-tight" style={{ color: textPrimary }}>{branch.name}</div>
                              <div className="text-[11px] mt-0.5" style={{ color: textMuted }}>{branch.location}</div>
                            </div>
                          </div>
                          {staffCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide shrink-0 text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-900/20 dark:border-slate-800">
                              <Users className="w-3 h-3 text-[#10B981]" />
                              {staffCount} staff
                            </span>
                          )}
                        </div>

                        {/* info */}
                        <div className="flex flex-col gap-1.5 text-xs pt-1">
                          {branch.address && (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: textMuted }} />
                              <span className="leading-relaxed" style={{ color: textPrimary }}>{branch.address}</span>
                            </div>
                          )}
                          {branch.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                              <span style={{ color: textPrimary }}>{branch.phone}</span>
                            </div>
                          )}
                          {branch.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                              <span className="truncate" style={{ color: textPrimary }}>{branch.email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-hidden rounded-2xl border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr style={{ backgroundColor: theadBg }}>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[30%]" style={{ color: textMuted }}>Branch</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[45%]" style={{ color: textMuted }}>Address</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[25%]" style={{ color: textMuted }}>Contact</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {serviceLocations.map((branch, idx) => {
                      const accent = accentFor(idx)
                      return (
                        <tr key={branch.id ?? idx} className="group transition-colors" style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }} onMouseEnter={e => e.currentTarget.style.backgroundColor = rowHover} onMouseLeave={e => e.currentTarget.style.backgroundColor = cardBg}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18` }}>
                                <MapPin className="w-4 h-4" style={{ color: accent }} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-sm truncate" style={{ color: textPrimary }}>{branch.name}</div>
                                <div className="text-[11px] font-medium opacity-60 truncate" style={{ color: textMuted }}>{branch.location}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs leading-relaxed line-clamp-2" style={{ color: textPrimary }}>{branch.address || '—'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              {branch.phone && (
                                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: textPrimary }}>
                                  <Phone className="w-3.5 h-3.5 text-emerald-500" /> {branch.phone}
                                </div>
                              )}
                              {branch.email && (
                                <div className="flex items-center gap-1.5 text-[11px] font-medium truncate" style={{ color: textMuted }}>
                                  <Mail className="w-3.5 h-3.5" /> {branch.email}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {/* Footer */}
                <div style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : 'rgba(15,26,46,0.3)' }} className="p-4 border-t flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                    {serviceLocations.length} service location{serviceLocations.length !== 1 ? 's' : ''} listed
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-widest text-[#10B981]" style={{ letterSpacing: '0.1em' }}>
                    Centrally Overseen
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

