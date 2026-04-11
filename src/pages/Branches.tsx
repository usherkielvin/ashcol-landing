import { useState, useEffect } from 'react'
import { Search, MapPin, CheckCircle, XCircle, Users, Phone, Mail, ShieldCheck, RefreshCw, Filter } from 'lucide-react'
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

const normalize = (value: string) => value.trim().toLowerCase()

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

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const pageBg      = isLight ? '#f1f5f9' : '#060B18'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#ffffff' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const theadBg     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'

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
      const merged = PUBLIC_BRANCHES.map((pub) => {
        const pubName = normalize(pub.name)
        const pubTag  = normalize(pub.tag)
        const api = apiBranches.find((a: Branch) => {
          const aName = normalize(a.name || '')
          const aLoc  = normalize(a.location || '')
          return aName === pubName || aName.includes(pubTag) || aLoc.includes(pubTag)
        })
        return {
          id:             api?.id,
          name:           pub.name,
          location:       api?.location || pub.tag,
          address:        pub.address,
          phone:          api?.phone  || pub.phones?.[0],
          phones:         pub.phones,
          landline:       pub.landline,
          email:          api?.email  || pub.email,
          is_active:      api?.is_active  ?? api?.isActive  ?? true,
          isActive:       api?.isActive   ?? api?.is_active ?? true,
          manager_name:   api?.manager_name,
          managerName:    api?.managerName,
          employee_count: api?.employee_count,
          active_tickets: api?.active_tickets,
          tag:            pub.tag,
          color:          pub.color,
          mapUrl:         pub.mapUrl,
          region:         pub.region,
          isHQ:           pub.isHQ,
        }
      })
      setBranches(merged)
    } catch (err: any) {
      setError(err.message || 'Failed to load branches')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchBranches() }, [isAllowed])

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
    const active = b.isActive ?? b.is_active
    if (filterActive !== null && active !== filterActive) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return b.name.toLowerCase().includes(q)
          || b.location?.toLowerCase().includes(q)
          || b.address?.toLowerCase().includes(q)
          || b.region?.toLowerCase().includes(q)
    }
    return true
  })

  const activeCnt   = branches.filter(b => b.isActive ?? b.is_active).length
  const inactiveCnt = branches.length - activeCnt

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ color: textPrimary }}>Branches</h2>
          <p className="text-sm" style={{ color: textMuted }}>
            {loading ? 'Loading…' : `${branches.length} branch${branches.length !== 1 ? 'es' : ''} · ${activeCnt} active`}
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        {/* Tabs */}
        <div style={{ borderColor: border, backgroundColor: inputBg }} className="flex p-1 border rounded-xl overflow-x-auto">
          {([
            { label: 'All',       value: null,  count: branches.length },
            { label: 'Active',    value: true,  count: activeCnt },
            { label: 'Inactive',  value: false, count: inactiveCnt },
          ] as { label: string; value: boolean | null; count: number }[]).map(tab => (
            <button
              key={tab.label}
              onClick={() => setFilterActive(tab.value)}
              style={filterActive === tab.value
                ? { backgroundColor: '#10B981', color: '#fff' }
                : { color: textMuted }
              }
              className="px-4 py-2 text-sm font-bold rounded-lg transition-all shrink-0 flex items-center gap-1.5"
            >
              {tab.label}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${filterActive === tab.value ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700'}`} style={filterActive !== tab.value ? { color: textMuted } : {}}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div
          style={{ backgroundColor: inputBg, borderColor: inputBorder }}
          className="flex items-center border rounded-xl px-3 py-2.5 w-full sm:w-64 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all"
        >
          <Search className="w-4 h-4 mr-2 shrink-0" style={{ color: textMuted }} />
          <input
            type="text"
            placeholder="Search branches…"
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
          <p className="text-sm" style={{ color: textMuted }}>Try adjusting your search or filter.</p>
        </div>

      ) : (
        <>
          {/* ── Mobile / sm  –  stacked cards ──────────────── */}
          <div className="flex flex-col gap-3 lg:hidden">
            {filteredBranches.map((branch, idx) => {
              const accent = accentFor(idx)
              const manager  = branch.managerName || branch.manager_name
              const isActive = manager ? (branch.isActive ?? branch.is_active) : false
              const staffCount = manager ? (branch.employee_count ?? 0) : 0
              return (
                <div key={branch.id ?? idx} className="rounded-2xl border overflow-hidden flex flex-col" style={{ backgroundColor: cardBg, borderColor: border }}>
                  {/* accent strip */}
                  <div className="h-1" style={{ backgroundColor: accent }} />

                  <div className="p-4 flex flex-col gap-3">
                    {/* title row */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18` }}>
                        <MapPin className="w-5 h-5" style={{ color: accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[15px] leading-tight" style={{ color: textPrimary }}>{branch.name}</div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: textMuted }}>{branch.location}</div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide shrink-0 ${isActive ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800' : 'text-red-500 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                        {isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* info */}
                    <div className="flex flex-col gap-1.5 text-sm">
                      {branch.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: textMuted }} />
                          <span style={{ color: textPrimary }}>{branch.address}</span>
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

                    {/* footer stats */}
                    <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: border }}>
                      {manager ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium flex-1 min-w-0">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
                          <span className="truncate" style={{ color: textPrimary }}>{manager}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs flex-1" style={{ color: textMuted }}>
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span className="italic">No manager</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs shrink-0" style={{ color: textMuted }}>
                        <Users className="w-3.5 h-3.5" />
                        <span className="font-bold" style={{ color: textPrimary }}>{staffCount}</span> staff
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Desktop  –  table ──────────────────────────── */}
          <div className="hidden lg:block border rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr style={{ backgroundColor: theadBg, color: textMuted }} className="text-xs uppercase tracking-wider font-bold">
                    <th style={{ borderColor: border }} className="p-4 pl-6 border-b whitespace-nowrap">Branch</th>
                    <th style={{ borderColor: border }} className="p-4 border-b whitespace-nowrap">Address</th>
                    <th style={{ borderColor: border }} className="p-4 border-b whitespace-nowrap">Contact</th>
                    <th style={{ borderColor: border }} className="p-4 border-b whitespace-nowrap">Manager</th>
                    <th style={{ borderColor: border }} className="p-4 border-b whitespace-nowrap text-center">Staff</th>
                    <th style={{ borderColor: border }} className="p-4 pr-6 border-b whitespace-nowrap text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                    {filteredBranches.map((branch, idx) => {
                    const accent   = accentFor(idx)
                    const manager  = branch.managerName || branch.manager_name
                    const isActive = manager ? (branch.isActive ?? branch.is_active) : false
                    const staffCount = manager ? (branch.employee_count ?? 0) : 0
                    return (
                      <tr
                        key={branch.id ?? idx}
                        style={{ borderColor: border }}
                        className="border-b transition-colors group"
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                      >
                        {/* Branch name + accent dot */}
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18` }}>
                              <MapPin className="w-4 h-4" style={{ color: accent }} />
                            </div>
                            <div>
                              <div className="font-bold" style={{ color: textPrimary }}>{branch.name}</div>
                              <div className="text-xs mt-0.5" style={{ color: textMuted }}>{branch.location}</div>
                            </div>
                          </div>
                        </td>

                        {/* Address */}
                        <td className="p-4 max-w-[220px]">
                          <p className="text-sm leading-relaxed" style={{ color: textPrimary }}>{branch.address || '—'}</p>
                        </td>

                        {/* Contact */}
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            {branch.phone && (
                              <div className="flex items-center gap-1.5 text-[13px]" style={{ color: textMuted }}>
                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                {branch.phone}
                              </div>
                            )}
                            {branch.email && (
                              <div className="flex items-center gap-1.5 text-[13px]" style={{ color: textMuted }}>
                                <Mail className="w-3.5 h-3.5 shrink-0" />
                                {branch.email}
                              </div>
                            )}
                            {!branch.phone && !branch.email && <span className="text-xs italic" style={{ color: textMuted }}>—</span>}
                          </div>
                        </td>

                        {/* Manager */}
                        <td className="p-4">
                          {manager ? (
                            <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: textPrimary }}>
                              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: accent }} />
                              {manager}
                            </div>
                          ) : (
                            <span className="text-xs italic" style={{ color: textMuted }}>Unassigned</span>
                          )}
                        </td>

                        {/* Staff count */}
                        <td className="p-4 text-center">
                          <span className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: textPrimary }}>
                            <Users className="w-3.5 h-3.5" style={{ color: accent }} />
                            {staffCount}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="p-4 pr-6 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold ${isActive ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800' : 'text-red-500 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                            {isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : 'rgba(15,26,46,0.3)' }} className="p-4 border-t flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: textMuted }}>
                Showing {filteredBranches.length} of {branches.length} branches
              </span>
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: textMuted }}>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> {activeCnt} active
                <span className="mx-1 opacity-40">·</span>
                <XCircle className="w-3.5 h-3.5 text-red-400" /> {inactiveCnt} inactive
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
