import { useState, useEffect } from 'react'
import { Search, MoreVertical, Wrench, Mail, Phone, RefreshCw, UserCheck, Building2, CheckCircle, XCircle, Pencil, Trash2, Power, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE_URL } from '../utils/api'

interface Employee {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  branchId?: string
  branchName?: string
  isActive: boolean
  profileImage?: string
}

export default function Employees() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${token}` }
      
      const resEmp = await fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers })
      const dataEmp = resEmp.ok ? await resEmp.json() : { data: [] }
      const employeesList = dataEmp?.data || dataEmp || []

      // Fetch branches for branch name resolution
      let branchMap: Record<string, string> = {}
      try {
        const resBranch = await fetch(`${API_BASE_URL}/branches`, { headers })
        if (resBranch.ok) {
          const dataBranch = await resBranch.json()
          const branches = dataBranch?.data || []
          branches.forEach((b: any) => { if (b.id) branchMap[b.id] = b.name })
        }
      } catch { /* silent */ }

      setEmployees(employeesList.map((s: any) => ({
        id: s.id,
        name: s.name || 'Unknown',
        email: s.email || '',
        phone: s.phone || '',
        role: (s.role || 'EMPLOYEE').toUpperCase(),
        branchId: s.branchId || '',
        branchName: s.branchId ? (branchMap[s.branchId] || '') : '',
        isActive: s.isActive !== false,
        profileImage: s.profileImage
      })))
    } catch (err) {
      console.error('Error fetching employees:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEmployees() }, [])

  const handleToggleActive = async (emp: Employee) => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/admin/users/${emp.id}/toggle-active`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) fetchEmployees()
    } catch {}
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/admin/users/${deleting.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setDeleting(null)
        fetchEmployees()
      }
    } catch {}
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    setSaving(true)
    setErr('')
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/admin/users/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      })
      if (!res.ok) {
        const d = await res.json().catch(()=>({}))
        setErr(d.message || 'Failed to update')
        return
      }
      setEditing(null)
      fetchEmployees()
    } catch {
      setErr('Network error')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (emp: Employee) => {
    setEditing(emp)
    setForm({ name: emp.name, email: emp.email, phone: emp.phone || '' })
    setErr('')
  }

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

  const filteredEmployees = employees.filter(e => {
    if (activeTab === 'active' && !e.isActive) return false
    if (activeTab === 'inactive' && e.isActive) return false

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return e.name.toLowerCase().includes(q) ||
             e.email.toLowerCase().includes(q) ||
             e.role.toLowerCase().includes(q)
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
          <h2 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight mb-1">Employees</h2>
          <p style={{ color: textMuted }} className="text-sm">Manage internal employees and service staff.</p>
        </div>
        <button
          onClick={fetchEmployees}
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
            {['all', 'active', 'inactive'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={activeTab === tab
                  ? { backgroundColor: tabActiveBg, color: tabActiveText }
                  : { color: textMuted }
                }
                className="px-5 py-2 text-sm font-bold capitalize rounded-lg transition-all shrink-0"
              >
                {tab}
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
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ color: textPrimary }}
                className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Mobile/Tablet Card View */}
        <div className="lg:hidden flex flex-col gap-3 p-4">
          {loading ? (
            <div className="p-8 text-center" style={{ color: textMuted }}>Loading employees...</div>
          ) : filteredEmployees.length > 0 ? filteredEmployees.map((e) => (
            <div key={e.id} className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: cardBg, borderColor: border }}>
              <div className="flex items-start gap-3">
                {e.profileImage ? (
                  <img src={e.profileImage} alt={e.name} className="w-12 h-12 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white font-black text-sm" style={{ backgroundColor: getInitialsColor(e.name) }}>{getInitials(e.name)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate" style={{ color: textPrimary }}>{e.name}</div>
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] mt-0.5" style={{ color: '#3B82F6' }}>
                    <UserCheck className="w-3 h-3" />
                    {e.role}
                  </div>
                </div>
                <div className="relative">
                  <button onClick={() => setActiveDropdown(activeDropdown === e.id ? null : e.id)} style={{ color: textMuted }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {activeDropdown === e.id && (
                    <div className="absolute right-0 top-8 mt-1 w-48 bg-white dark:bg-[#0F1A2E] border dark:border-[#243452] rounded-xl shadow-lg z-50 py-1" onMouseLeave={() => setActiveDropdown(null)}>
                      <button onClick={() => { openEdit(e); setActiveDropdown(null) }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2" style={{ color: textPrimary }}><Pencil className="w-4 h-4" /> Edit</button>
                      <button onClick={() => { handleToggleActive(e); setActiveDropdown(null) }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2" style={{ color: textPrimary }}><Power className="w-4 h-4" /> {e.isActive ? 'Disable' : 'Enable'}</button>
                      <button onClick={() => { setDeleting(e); setActiveDropdown(null) }} className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center gap-2" style={{ color: textMuted }}><Mail className="w-4 h-4 shrink-0" /><span className="truncate">{e.email}</span></div>
                {e.phone && <div className="flex items-center gap-2" style={{ color: textMuted }}><Phone className="w-4 h-4 shrink-0" />{e.phone}</div>}
                {e.branchName && <div className="flex items-center gap-2" style={{ color: textPrimary }}><Building2 className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />{e.branchName}</div>}
              </div>
              <div className="pt-2 border-t" style={{ borderColor: border }}>
                <div
                  style={e.isActive
                    ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)' }
                    : { color: '#64748b', backgroundColor: 'rgba(148,163,184,0.1)', borderColor: 'rgba(148,163,184,0.2)' }
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full border"
                >
                  {e.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {e.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          )) : (
            <div className="p-8 text-center">
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-20" style={{ color: textMuted }} />
              <h3 style={{ color: textPrimary }} className="text-lg font-bold">No employees found</h3>
              <p style={{ color: textMuted }} className="text-sm mt-1">Try adjusting your search or filters.</p>
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ backgroundColor: theadBg, color: textMuted }} className="text-xs uppercase tracking-wider font-bold">
                <th style={{ borderColor: border }} className="p-4 pl-6 border-b whitespace-nowrap">Member</th>
                <th style={{ borderColor: border }} className="p-4 border-b whitespace-nowrap">Role</th>
                <th style={{ borderColor: border }} className="p-4 border-b whitespace-nowrap">Branch</th>
                <th style={{ borderColor: border }} className="p-4 border-b whitespace-nowrap">Contact</th>
                <th style={{ borderColor: border }} className="p-4 border-b whitespace-nowrap">Status</th>
                <th style={{ borderColor: border }} className="p-4 pr-6 border-b text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center" style={{ color: textMuted }}>Loading employees...</td>
                </tr>
              ) : filteredEmployees.length > 0 ? filteredEmployees.map((e) => (
                <tr
                  key={e.id}
                  style={{ borderColor: border }}
                  className="border-b transition-colors"
                  onMouseEnter={el => (el.currentTarget as HTMLElement).style.backgroundColor = rowHover}
                  onMouseLeave={el => (el.currentTarget as HTMLElement).style.backgroundColor = ''}
                >
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      {e.profileImage ? (
                        <img src={e.profileImage} alt={e.name} className="w-10 h-10 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-black text-sm" style={{ backgroundColor: getInitialsColor(e.name) }}>{getInitials(e.name)}</div>
                      )}
                      <div>
                        <div style={{ color: textPrimary }} className="font-bold mb-0.5">{e.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px]" style={{ color: '#3B82F6' }}>
                      <UserCheck className="w-3.5 h-3.5" />
                      {e.role}
                    </div>
                  </td>
                  <td className="p-4">
                    {e.branchName ? (
                      <div className="flex items-center gap-2 text-sm font-medium" style={{ color: textPrimary }}>
                        <Building2 className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />{e.branchName}
                      </div>
                    ) : <span className="text-xs italic" style={{ color: textMuted }}>—</span>}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <div style={{ color: textMuted }} className="flex items-center gap-2 text-[13px]">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <a href={`mailto:${e.email}`} className="hover:text-[#10B981] transition-colors">{e.email}</a>
                      </div>
                      {e.phone && (
                        <div style={{ color: textMuted }} className="flex items-center gap-2 text-[13px]">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <a href={`tel:${e.phone}`} className="hover:text-[#10B981] transition-colors">{e.phone}</a>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div
                      style={e.isActive
                        ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)' }
                        : { color: '#64748b', backgroundColor: 'rgba(148,163,184,0.1)', borderColor: 'rgba(148,163,184,0.2)' }
                      }
                      className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold rounded-full border w-fit"
                    >
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: e.isActive ? '#10B981' : '#64748b' }} />
                      {e.isActive ? 'Active' : 'Inactive'}
                    </div>
                  </td>
                  <td className="p-4 pr-6 text-right relative">
                    <button onClick={() => setActiveDropdown(activeDropdown === e.id ? null : e.id)} style={{ color: textMuted }} className="p-2 hover:bg-[#10B981]/10 hover:text-[#10B981] rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeDropdown === e.id && (
                      <div className="absolute right-6 top-10 mt-1 w-48 bg-white dark:bg-[#0F1A2E] border dark:border-[#243452] rounded-xl shadow-lg z-50 py-1 text-left" onMouseLeave={() => setActiveDropdown(null)}>
                        <button onClick={() => { openEdit(e); setActiveDropdown(null) }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2" style={{ color: textPrimary }}><Pencil className="w-4 h-4" /> Edit</button>
                        <button onClick={() => { handleToggleActive(e); setActiveDropdown(null) }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2" style={{ color: textPrimary }}><Power className="w-4 h-4" /> {e.isActive ? 'Disable' : 'Enable'}</button>
                        <button onClick={() => { setDeleting(e); setActiveDropdown(null) }} className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Wrench className="w-12 h-12 text-slate-300 dark:text-[#3A5070] mb-3" />
                      <h3 style={{ color: textPrimary }} className="text-lg font-bold">No employees found</h3>
                      <p style={{ color: textMuted }} className="text-sm mt-1">Try adjusting your search or filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: textPrimary }}>Edit Employee</h3>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>
            {err && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}
            
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Name</label>
              <input value={form.name} onChange={el => setForm(p => ({ ...p, name: el.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Email</label>
              <input value={form.email} onChange={el => setForm(p => ({ ...p, email: el.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Phone</label>
              <input value={form.phone} onChange={el => setForm(p => ({ ...p, phone: el.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditing(null)} className="flex-1 border rounded-xl py-2.5 text-sm font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800" style={{ borderColor: inputBorder, color: textMuted }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} className="flex-1 bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5 text-red-500" /></div>
              <div>
                <h3 className="font-bold" style={{ color: textPrimary }}>Delete Employee</h3>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Remove <strong>{deleting.name}</strong>? This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)} className="flex-1 border rounded-xl py-2.5 text-sm font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800" style={{ borderColor: inputBorder, color: textMuted }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
