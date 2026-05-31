import { useState, useEffect, useMemo } from 'react'
import { Search, MapPin, Phone, Mail, Building2, ExternalLink, Edit3, X } from 'lucide-react'
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
  managerId?: string
  tag?: string
  color?: string
  phones?: string[]
  landline?: string
  mapUrl?: string
  region?: string
  isHQ?: boolean
  oic: string
  drivers: string[]
  installers: string[]
}

const normalize = (value: string) => value.trim().toLowerCase()

const getConciseLocationTag = (branch: Branch) => {
  const name = normalize(branch.name || '')
  if (name.includes('head office') || name.includes('taguig')) {
    return 'EAST REMBO, TAGUIG CITY'
  }
  if (name.includes('valenzuela')) {
    return 'ARKONG BATO, VALENZUELA CITY'
  }
  if (name.includes('bulacan')) {
    return 'SALANGAN, SAN MIGUEL, BULACAN'
  }
  if (name.includes('pampanga')) {
    return 'SAN ISIDRO, SAN FERNANDO, PAMPANGA'
  }
  if (name.includes('rizal') || name.includes('rodriguez')) {
    return 'SAN JOSE, RODRIGUEZ, RIZAL'
  }
  if (name.includes('laguna') || name.includes('calauan')) {
    return 'BANGYAS, CALAUAN, LAGUNA'
  }
  if (name.includes('batangas') || name.includes('taal')) {
    return 'TAAL, BATANGAS'
  }
  if (name.includes('gen. trias') || name.includes('general trias') || name.includes('trias')) {
    return 'PASONG KAWAYAN, GEN. TRIAS, CAVITE'
  }
  if (name.includes('candelaria')) {
    return 'MALABANBAN NORTE, CANDELARIA, QUEZON'
  }
  if (name.includes('dasmariñas') || name.includes('dasmarinas') || name.includes('dasma')) {
    return 'SAN AGUSTIN, DASMARIÑAS, CAVITE'
  }
  if (name.includes('silang')) {
    return 'PUTING KAHOY, SILANG, CAVITE'
  }
  
  // Fallback to region and location, deduplicated
  const reg = branch.region || ''
  const loc = branch.location || ''
  if (reg && loc) {
    if (normalize(reg) === normalize(loc)) return reg.toUpperCase()
    if (normalize(loc).includes(normalize(reg))) return loc.toUpperCase()
    if (normalize(reg).includes(normalize(loc))) return reg.toUpperCase()
    return `${reg.toUpperCase()} • ${loc.toUpperCase()}`
  }
  return (loc || reg || 'LUZON').toUpperCase()
}

const MOCK_ROSTER: Record<string, { oic: string; drivers: string[]; installers: string[] }> = {
  'head office': {
    oic: 'Juan Dela Cruz',
    drivers: ['ANGELO', 'JOJO'],
    installers: ['RANIL', 'JHUMAR', 'KENNAN']
  },
  'ashcol valenzuela': {
    oic: 'Mark Valenzuela',
    drivers: ['ADAM', 'DOMINIC'],
    installers: ['CRIS', 'SONNY', 'RYAN', 'ALLAN']
  },
  'ashcol bulacan': {
    oic: 'Bernardo Bulacan',
    drivers: ['ANGELO', 'ADAM'],
    installers: ['RANIL', 'CRIS', 'ALLAN']
  },
  'ashcol pampanga': {
    oic: 'Pedring Pampanga',
    drivers: ['JOJO', 'DOMINIC'],
    installers: ['JHUMAR', 'KENNAN', 'RYAN']
  },
  'ashcol rizal': {
    oic: 'Ronaldo Rizal',
    drivers: ['ANGELO', 'DOMINIC'],
    installers: ['SONNY', 'ALLAN', 'RYAN']
  },
  'ashcol laguna': {
    oic: 'Lando Laguna',
    drivers: ['JOJO', 'ADAM'],
    installers: ['RANIL', 'JHUMAR', 'CRIS']
  },
  'ashcol batangas': {
    oic: 'Barako Barako',
    drivers: ['ANGELO', 'JOJO'],
    installers: ['KENNAN', 'SONNY', 'ALLAN']
  },
  'ashcol gen. trias': {
    oic: 'Genaro Trias',
    drivers: ['ADAM', 'DOMINIC'],
    installers: ['RYAN', 'JHUMAR', 'CRIS']
  },
  'ashcol candelaria': {
    oic: 'Candy Candelaria',
    drivers: ['ANGELO', 'DOMINIC'],
    installers: ['RANIL', 'KENNAN', 'SONNY']
  },
  'ashcol dasmariñas': {
    oic: 'Dario Dasma',
    drivers: ['JOJO', 'ADAM'],
    installers: ['RYAN', 'CRIS', 'ALLAN']
  },
  'ashcol silang': {
    oic: 'Silvestre Silang',
    drivers: ['ANGELO', 'JOJO'],
    installers: ['JHUMAR', 'KENNAN', 'SONNY']
  }
}

export default function Branches() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const [branches, setBranches] = useState<Branch[]>([])
  const [managers, setManagers] = useState<any[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState('')

  // Modals state
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    location: '',
    address: '',
    phone: '',
    email: '',
    managerId: '',
    isActive: true
  })
  const [saving, setSaving] = useState(false)

  const isRoleAdmin = user?.role?.toLowerCase() === 'admin'

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#F0F6FF'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#ffffff' : '#0F1A2E'

  const badgeOicBg  = isLight ? '#ECFDF5' : '#064E3B'
  const badgeOicText = isLight ? '#047857' : '#34D399'

  const fetchAllData = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${token}` }
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      
      const [resB, resM, resE] = await Promise.all([
        fetch(`${apiUrl}/branches`, { headers }),
        fetch(`${apiUrl}/user/all?role=MANAGER`, { headers }).catch(() => null),
        fetch(`${apiUrl}/user/all?role=EMPLOYEE`, { headers }).catch(() => null)
      ])
      
      if (!resB.ok) {
        throw new Error('Failed to load branches')
      }
      
      const branchesData = await resB.json()
      const apiBranches = branchesData.data || branchesData || []
      
      let managersList: any[] = []
      if (resM && resM.ok) {
        const payload = await resM.json()
        managersList = payload?.data || payload || []
      }
      setManagers(managersList)

      let employeesList: any[] = []
      if (resE && resE.ok) {
        const payload = await resE.json()
        employeesList = payload?.data || payload || []
      }

      const merged = apiBranches.map((api: Branch) => {
        const apiName = normalize(api.name || '')
        const apiLocation = normalize(api.location || '')
        const pub = PUBLIC_BRANCHES.find(candidate => {
          const pubName = normalize(candidate.name)
          const pubTag = normalize(candidate.tag)
          return pubName === apiName || pubTag === apiLocation || apiName.includes(pubTag) || apiLocation.includes(pubTag)
        })

        // Roster assignment
        // 1. OIC
        let oicName = ''
        if (api.managerId) {
          const foundMgr = managersList.find((m: any) => m.id === api.managerId)
          if (foundMgr) oicName = foundMgr.name
        }
        if (!oicName) {
          const foundMgr = managersList.find((m: any) => m.branchId === api.id)
          if (foundMgr) oicName = foundMgr.name
        }
        
        // 2. Employees (Drivers vs Installers)
        const branchStaff = employeesList.filter((e: any) => e.branchId === api.id)
        let drivers: string[] = []
        let installers: string[] = []
        
        if (branchStaff.length > 0) {
          branchStaff.forEach((e: any) => {
            const title = (e.jobTitle || '').toLowerCase()
            const nameUpper = e.name.toUpperCase()
            const isDriver = title.includes('driver') || ['ANGELO', 'JOJO', 'ADAM', 'DOMINIC'].includes(nameUpper)
            if (isDriver) {
              drivers.push(e.name)
            } else {
              installers.push(e.name)
            }
          })
        }

        // Fallback to mock if empty
        const key = apiName.replace('ashcol ', '').trim()
        const fallback = MOCK_ROSTER[apiName] || MOCK_ROSTER[`ashcol ${key}`] || MOCK_ROSTER[key] || {
          oic: 'Juan Dela Cruz',
          drivers: ['ANGELO', 'JOJO'],
          installers: ['RANIL', 'JHUMAR', 'KENNAN']
        }

        if (!oicName) oicName = fallback.oic
        if (drivers.length === 0) drivers = fallback.drivers
        if (installers.length === 0) installers = fallback.installers

        return {
          ...api,
          name: api.name,
          location: api.location || pub?.tag || '',
          address: pub?.address || api.address || '',
          phone: pub?.phones?.[0] || api.phone,
          phones: pub?.phones,
          landline: pub?.landline,
          email: pub?.email || api.email || '',
          isActive: api.isActive ?? true,
          tag: pub?.tag || api.location || '',
          color: pub?.color || '#10B981',
          mapUrl: pub?.mapUrl || api.mapUrl || '',
          region: pub?.region || api.region || 'Luzon',
          isHQ: pub?.isHQ || api.isHQ || false,
          // Assigned personnel
          oic: oicName,
          drivers,
          installers
        }
      })
      setBranches(merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branch directory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEditClick = (branch: Branch) => {
    setEditingBranch(branch)
    setEditForm({
      name: branch.name,
      location: branch.location || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      managerId: branch.managerId || '',
      isActive: branch.isActive
    })
  }

  const handleSaveEdit = async () => {
    if (!editingBranch) return
    setSaving(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      
      const payload = {
        name: editForm.name,
        location: editForm.location,
        address: editForm.address,
        phone: editForm.phone,
        email: editForm.email,
        managerId: editForm.managerId || null,
        isActive: editForm.isActive
      }
      
      const res = await fetch(`${apiUrl}/branches/${editingBranch.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      
      if (!res.ok) {
        throw new Error('Failed to save changes')
      }
      
      setEditingBranch(null)
      await fetchAllData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }





  const myBranch = useMemo(() => {
    if (!user?.branchId) return null
    const baseBranchId = user.branchId.replace(/-sales$|-services$/, '')
    return branches.find(b => b.id === baseBranchId) || null
  }, [branches, user?.branchId])

  // Filtered branches list
  const filteredBranches = branches.filter(b => {
    // Exclude the logged branch if it is already displayed at the top
    if (myBranch && b.id === myBranch.id) {
      return false
    }

    // 1. Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const inBranch = b.name.toLowerCase().includes(q)
                    || b.location.toLowerCase().includes(q)
                    || b.address.toLowerCase().includes(q)
      const inPersonnel = b.oic.toLowerCase().includes(q)
                       || b.drivers.some(d => d.toLowerCase().includes(q))
                       || b.installers.some(i => i.toLowerCase().includes(q))
      if (!inBranch && !inPersonnel) return false
    }



    return true
  })

  return (
    <div className="flex flex-col gap-6">
      
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-1" style={{ color: textPrimary }}>Branch Team Directory</h2>
          <p className="text-sm" style={{ color: textMuted }}>
            View branch details, assigned OIC, drivers, installers, technicians, and contact information.
          </p>
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────── */}
      {error && (
        <div className="flex items-center justify-between gap-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl">
          <span className="text-sm font-medium">{error}</span>
          <button onClick={fetchAllData} className="text-xs bg-red-100 dark:bg-red-800/50 hover:bg-red-200 px-3 py-1.5 rounded-lg font-bold transition-colors shrink-0">Retry</button>
        </div>
      )}

      {/* ── My Branch Team Highlight ─────────────────────── */}
      {!loading && !error && myBranch && (
        <div 
          className="rounded-3xl border p-6 md:p-8 flex flex-col gap-6 shadow-md transition-all duration-300 relative overflow-hidden animate-scale-in"
          style={{ 
            backgroundColor: cardBg, 
            borderColor: '#10B981',
            borderWidth: '2px'
          }}
        >
          {/* Subtle label badge */}
          <div className="absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-[#10B981] border-l border-b border-emerald-500/20">
            My Branch Directory
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/60">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-xl md:text-2xl font-black tracking-tight" style={{ color: textPrimary }}>
                  {myBranch.name}
                </h3>
                {myBranch.isHQ && (
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-[#10B981] border border-emerald-500/20">
                    HQ
                  </span>
                )}
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
                {getConciseLocationTag(myBranch)}
              </p>
              <p className="text-xs font-normal mt-1" style={{ color: textMuted }}>
                {myBranch.address}
              </p>
            </div>
            {myBranch.phone && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Phone className="w-4 h-4 text-emerald-500" />
                <span>{myBranch.phone}</span>
              </div>
            )}
          </div>

          {/* Roster list shown in a bigger and better layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* OIC / Manager */}
            <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800/40 bg-slate-50/30 dark:bg-slate-900/10 flex flex-col gap-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Officer In Charge (OIC)</span>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-sm shrink-0">
                  {myBranch.oic.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                </div>
                <div>
                  <div className="font-extrabold text-sm" style={{ color: textPrimary }}>{myBranch.oic}</div>
                  <div className="text-[10px] text-slate-400 font-bold">OFFICER IN CHARGE</div>
                </div>
              </div>
            </div>

            {/* Drivers */}
            <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800/40 bg-slate-50/30 dark:bg-slate-900/10 flex flex-col gap-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Assigned Drivers ({myBranch.drivers.length})</span>
              <div className="flex flex-col gap-2">
                {myBranch.drivers.length > 0 ? (
                  myBranch.drivers.map((d: string) => (
                    <div key={d} className="flex items-center gap-2.5 text-xs font-semibold" style={{ color: textPrimary }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {d}
                    </div>
                  ))
                ) : (
                  <span className="text-xs italic text-slate-400">No drivers assigned</span>
                )}
              </div>
            </div>

            {/* Installers & Technicians */}
            <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800/40 bg-slate-50/30 dark:bg-slate-900/10 flex flex-col gap-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Installers & Technicians ({myBranch.installers.length})</span>
              <div className="flex flex-wrap gap-2">
                {myBranch.installers.length > 0 ? (
                  myBranch.installers.map((i: string) => (
                    <span 
                      key={i} 
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-300 border border-slate-200/10"
                    >
                      {i}
                    </span>
                  ))
                ) : (
                  <span className="text-xs italic text-slate-400">No technicians assigned</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar / Filters ────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between gap-3">
        {/* Search */}
        <div
          style={{ backgroundColor: inputBg, borderColor: border }}
          className="flex items-center border rounded-xl px-3 py-2 w-full md:w-96 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981] transition-all"
        >
          <Search className="w-4 h-4 mr-2 shrink-0" style={{ color: textMuted }} />
          <input
            type="text"
            placeholder="Search branch, OIC, driver, installer, technician..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ color: textPrimary }}
            className="bg-transparent border-none text-xs focus:outline-none w-full placeholder-slate-400"
          />
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium" style={{ color: textMuted }}>Loading directory details…</p>
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] rounded-2xl border" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: inputBg }}>
            <Building2 className="w-7 h-7" style={{ color: textMuted }} />
          </div>
          <h3 className="text-base font-bold mb-1" style={{ color: textPrimary }}>No branches found</h3>
          <p className="text-sm" style={{ color: textMuted }}>Try adjusting your search query or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {filteredBranches.map(branch => {
            const isHq = branch.isHQ
            
            return (
              <div 
                key={branch.id} 
                className="rounded-2xl border shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden"
                style={{ 
                  backgroundColor: cardBg, 
                  borderColor: isHq ? '#10B981' : border,
                  borderWidth: isHq ? '2px' : '1px'
                }}
              >
                <div className="p-6 md:p-8 flex flex-col gap-6 flex-1">
                  {/* Branch name & status */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/60">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h4 className="text-lg md:text-xl font-extrabold tracking-tight" style={{ color: textPrimary }}>
                          {branch.name}
                        </h4>
                        {isHq && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-[#10B981] border border-emerald-500/20">
                            HQ
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
                        {getConciseLocationTag(branch)}
                      </p>
                    </div>
                    <span 
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0"
                      style={{ 
                        backgroundColor: branch.isActive ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', 
                        color: branch.isActive ? '#10B981' : '#EF4444',
                        borderColor: branch.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
                      }}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${branch.isActive ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
                      {branch.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Core details layout split into address/contacts and roster */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Left: Contact Info */}
                    <div className="flex flex-col gap-4">
                      <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contact Details</h5>
                      
                      <div className="flex items-start gap-3 text-xs">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed" style={{ color: textPrimary }}>{branch.address || 'No address registered'}</span>
                      </div>

                      {branch.phone && (
                        <div className="flex items-center gap-3 text-xs">
                          <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                          <span style={{ color: textPrimary }}>{branch.phone}</span>
                        </div>
                      )}

                      {branch.email && (
                        <div className="flex items-center gap-3 text-xs">
                          <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate" style={{ color: textPrimary }}>{branch.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Assigned Personnel */}
                    <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100/50 dark:border-slate-800/40">
                      <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 pb-1.5 border-b border-slate-100 dark:border-slate-800/40">
                        Assigned Personnel
                      </h5>

                      <div className="flex items-center justify-between text-xs py-0.5">
                        <span className="font-semibold text-slate-400">OIC:</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {branch.oic}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs py-0.5">
                        <span className="font-semibold text-slate-400">Drivers:</span>
                        <span className="font-medium text-right truncate max-w-[150px]" style={{ color: textPrimary }}>
                          {branch.drivers.length > 0 ? branch.drivers.join(', ') : 'None'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs py-0.5">
                        <span className="font-semibold text-slate-400">Installers:</span>
                        <span className="font-medium text-right truncate max-w-[150px]" style={{ color: textPrimary }}>
                          {branch.installers.length > 0 ? branch.installers.join(', ') : 'None'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Action buttons */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-900/5 flex justify-between items-center gap-4 shrink-0">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedBranch(branch)}
                      className="px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                      style={{ color: textMuted, borderColor: border }}
                    >
                      View Full Details
                    </button>
                    {isRoleAdmin && (
                      <button 
                        onClick={() => handleEditClick(branch)}
                        className="px-3 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all hover:text-[#10B981] hover:border-[#10B981]"
                        style={{ color: textMuted, borderColor: border }}
                        title="Edit Branch Team Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {branch.mapUrl && (
                    <a
                      href={branch.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider text-[#10B981] border-[#10B981]/20 hover:bg-[#10B981]/5 transition-all flex items-center gap-1.5 shrink-0"
                    >
                      Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── View Details Modal ───────────────────────────── */}
      {selectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div 
            className="w-full max-w-lg rounded-2xl border overflow-hidden shadow-xl"
            style={{ backgroundColor: cardBg, borderColor: border }}
          >
            <div className="p-5 flex justify-between items-start border-b" style={{ borderColor: border }}>
              <div>
                <h3 className="text-lg font-black tracking-tight" style={{ color: textPrimary }}>{selectedBranch.name}</h3>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">{getConciseLocationTag(selectedBranch)}</p>
              </div>
              <button 
                onClick={() => setSelectedBranch(null)} 
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ color: textMuted }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
              {/* Branch Contact Details */}
              <div className="flex flex-col gap-2.5">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Branch Details</h4>
                <div className="flex items-start gap-2.5 text-xs">
                  <MapPin className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                  <span style={{ color: textPrimary }}>{selectedBranch.address}</span>
                </div>
                {selectedBranch.phone && (
                  <div className="flex items-center gap-2.5 text-xs">
                    <Phone className="w-4 h-4 text-[#10B981] shrink-0" />
                    <span style={{ color: textPrimary }}>{selectedBranch.phone}</span>
                  </div>
                )}
                {selectedBranch.email && (
                  <div className="flex items-center gap-2.5 text-xs">
                    <Mail className="w-4 h-4 text-[#10B981] shrink-0" />
                    <span style={{ color: textPrimary }}>{selectedBranch.email}</span>
                  </div>
                )}
              </div>

              {/* Personnel Lists */}
              <div className="border-t pt-4 flex flex-col gap-4" style={{ borderColor: border }}>
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Assigned Personnel</h4>
                
                {/* OIC */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400">Officer In Charge (OIC)</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded text-xs font-semibold" style={{ backgroundColor: badgeOicBg, color: badgeOicText }}>
                      {selectedBranch.oic}
                    </span>
                  </div>
                </div>

                {/* Drivers */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400">Drivers ({selectedBranch.drivers.length})</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedBranch.drivers.length > 0 ? (
                      selectedBranch.drivers.map(d => (
                        <span key={d} className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100/80 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/20">
                          {d}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs italic" style={{ color: textMuted }}>None assigned</span>
                    )}
                  </div>
                </div>

                {/* Installers / Technicians */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400">Installers & Technicians ({selectedBranch.installers.length})</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedBranch.installers.length > 0 ? (
                      selectedBranch.installers.map(i => (
                        <span key={i} className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100/80 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200/20">
                          {i}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs italic" style={{ color: textMuted }}>None assigned</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t flex justify-end gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-900/10" style={{ borderColor: border }}>
              <button 
                onClick={() => setSelectedBranch(null)}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 transition-all shrink-0 animate-scale-in"
                style={{ backgroundColor: '#10B981' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Branch Details Modal ────────────────────── */}
      {editingBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div 
            className="w-full max-w-md rounded-2xl border overflow-hidden shadow-xl"
            style={{ backgroundColor: cardBg, borderColor: border }}
          >
            <div className="p-5 flex justify-between items-start border-b" style={{ borderColor: border }}>
              <div>
                <h3 className="text-base font-black tracking-tight" style={{ color: textPrimary }}>Edit Branch Team Details</h3>
                <p className="text-xs" style={{ color: textMuted }}>Update branch information and assign Officer In Charge (OIC).</p>
              </div>
              <button 
                onClick={() => setEditingBranch(null)} 
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ color: textMuted }}
                disabled={saving}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[65vh]">
              {/* Branch Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Branch Name</label>
                <input 
                  type="text" 
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#10B981] w-full"
                  disabled={saving}
                  placeholder="e.g. ASHCOL CALAUAN"
                />
              </div>

              {/* City / Location */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">City / Location Tag</label>
                <input 
                  type="text" 
                  value={editForm.location}
                  onChange={e => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#10B981] w-full"
                  disabled={saving}
                  placeholder="e.g. Calauan"
                />
              </div>

              {/* Full Address */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Full Address</label>
                <textarea 
                  rows={2}
                  value={editForm.address}
                  onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#10B981] w-full resize-none"
                  disabled={saving}
                  placeholder="Purok 4, Bangyas..."
                />
              </div>

              {/* Phone */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contact Number</label>
                <input 
                  type="text" 
                  value={editForm.phone}
                  onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#10B981] w-full"
                  disabled={saving}
                  placeholder="e.g. 0999 990 5224"
                />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Email Address</label>
                <input 
                  type="email" 
                  value={editForm.email}
                  onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#10B981] w-full"
                  disabled={saving}
                  placeholder="e.g. ashcolcalauan@gmail.com"
                />
              </div>

              {/* OIC Dropdown selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Assign Officer In Charge (OIC)</label>
                <select
                  value={editForm.managerId}
                  onChange={e => setEditForm(prev => ({ ...prev, managerId: e.target.value }))}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#10B981] w-full cursor-pointer font-semibold"
                  disabled={saving}
                >
                  <option value="">-- Select OIC --</option>
                  {managers.map(mgr => (
                    <option key={mgr.id} value={mgr.id}>{mgr.name} ({mgr.email})</option>
                  ))}
                </select>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between border-t pt-3 mt-1" style={{ borderColor: border }}>
                <span className="text-xs font-bold" style={{ color: textPrimary }}>Active Operation Status</span>
                <button
                  type="button"
                  onClick={() => setEditForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                  disabled={saving}
                  className={`w-10 h-6 rounded-full transition-all relative shrink-0 ${editForm.isActive ? 'bg-[#10B981]' : 'bg-slate-300 dark:bg-slate-800'}`}
                >
                  <div 
                    className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
                    style={{ left: editForm.isActive ? '1.25rem' : '0.25rem' }}
                  />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 border-t flex justify-end gap-2.5 shrink-0 bg-slate-50/50 dark:bg-slate-900/10" style={{ borderColor: border }}>
              <button 
                onClick={() => setEditingBranch(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                style={{ color: textMuted, borderColor: border }}
                disabled={saving}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 transition-all shrink-0 flex items-center gap-1.5"
                style={{ backgroundColor: '#10B981' }}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
