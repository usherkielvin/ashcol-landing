import { useState, useEffect, useRef } from 'react'
import { Search, MoreVertical, Wrench, Mail, Phone, RefreshCw, UserCheck, Building2, CheckCircle, XCircle, Pencil, Trash2, Power, X, Plus, Copy, Check } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatRole } from '../utils/api'

interface Employee {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  jobTitle?: string
  branchId?: string
  branchName?: string
  isActive: boolean
  profileImage?: string
}

const JOB_TYPE_OPTIONS = [
  { value: 'EMPLOYEE|TECHNICIAN', label: 'TECHNICIAN' },
  { value: 'EMPLOYEE|HELPER', label: 'HELPER' },
  { value: 'EMPLOYEE|DRIVER', label: 'DRIVER' },
  { value: 'EMPLOYEE|COORDINATOR', label: 'COORDINATOR' },
  { value: 'MANAGER|', label: 'OFFICE IN CHARGE' },
  { value: 'ADMIN|', label: 'MANAGER' },
]

const memberTypeValue = (member: Employee) => {
  const role = (member.role || 'EMPLOYEE').toUpperCase()
  if (role === 'MANAGER' || role === 'ADMIN') return `${role}|`
  const title = (member.jobTitle || 'TECHNICIAN').toUpperCase()
  if (title === 'SALES COORDINATOR' || title === 'PAYROLL' || title === 'INVENTORY' || title === 'COORDINATOR') {
    return 'EMPLOYEE|COORDINATOR'
  }
  return `EMPLOYEE|${title}`
}

export default function Employees() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const isManager = user?.role?.toLowerCase() === 'manager'
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const MENU_WIDTH = 176

  const openEmployeeActions = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (activeDropdown === id) {
      setActiveDropdown(null)
      setMenuPosition(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8)
    setMenuPosition({ top: rect.bottom + 4, left })
    setActiveDropdown(id)
  }

  useEffect(() => {
    if (!activeDropdown) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (actionMenuRef.current?.contains(t)) return
      if ((e.target as HTMLElement).closest('[data-employee-action-trigger="true"]')) return
      setActiveDropdown(null)
      setMenuPosition(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [activeDropdown])

  useEffect(() => {
    if (!activeDropdown) return
    const close = () => {
      setActiveDropdown(null)
      setMenuPosition(null)
    }
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [activeDropdown])
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN', newPassword: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', email: '', branchId: '', role: 'TECHNICIAN' })
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [createSaving, setCreateSaving] = useState(false)
  /** Shown once after successful create — technician can log in with this password (also emailed when SMTP is configured). */
  const [newTechCreds, setNewTechCreds] = useState<{ email: string; password: string } | null>(null)
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null)

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${token}` }
      
      const [resEmp, resMgr] = await Promise.all([
        fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers }),
        isAdmin ? fetch(`${API_BASE_URL}/user/all?role=MANAGER`, { headers }).catch(() => null) : Promise.resolve(null),
      ])
      const dataEmp = resEmp.ok ? await resEmp.json() : { data: [] }
      const dataMgr = resMgr && resMgr.ok ? await resMgr.json() : { data: [] }
      const employeesList = [...(dataEmp?.data || []), ...(dataMgr?.data || [])]

      // Fetch branches for branch name resolution
      let branchMap: Record<string, string> = {}
      try {
        const resBranch = await fetch(`${API_BASE_URL}/branches`, { headers })
        if (resBranch.ok) {
          const dataBranch = await resBranch.json()
          const branches = dataBranch?.data || []
          branches.forEach((b: any) => {
            if (!b.id) return
            const clean = (b.name || b.id).replace(/^ashcol\s+/i, '').trim().toUpperCase()
            branchMap[b.id] = clean
            // Also map virtual suffixed IDs so assigned users display correctly
            if (clean === 'TAGUIG') {
              branchMap[`${b.id}-sales`]    = 'TAGUIG - SALES'
              branchMap[`${b.id}-services`] = 'TAGUIG - SERVICES'
            }
          })
        }
      } catch { /* silent */ }

      setEmployees(employeesList.map((s: any) => ({
        id: s.id,
        name: s.name || 'Unknown',
        email: s.email || '',
        phone: s.phone || '',
        role: (s.role || 'EMPLOYEE').toUpperCase(),
        jobTitle: s.jobTitle || '',
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

  useEffect(() => {
    if (!isAdmin) return
    const loadBranches = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const list: { id: string; name: string }[] = data?.data || []

        const result: { id: string; name: string }[] = []
        for (const b of list) {
          const clean = b.name.replace(/^ashcol\s+/i, '').trim().toUpperCase()
          if (clean === 'TAGUIG') {
            // Split Taguig into two assignable virtual branches
            result.push({ id: `${b.id}-sales`,    name: 'TAGUIG - SALES' })
            result.push({ id: `${b.id}-services`,  name: 'TAGUIG - SERVICES' })
          } else {
            result.push({ id: b.id, name: clean })
          }
        }
        result.sort((a, b) => a.name.localeCompare(b.name))
        setBranches(result)
      } catch {
        /* ignore */
      }
    }
    loadBranches()
  }, [isAdmin])

  const handleToggleActive = async (emp: Employee) => {
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const url = isManager
        ? `${API_BASE_URL}/manager/employees/${emp.id}/toggle-active`
        : `${API_BASE_URL}/admin/users/${emp.id}/toggle-active`
      const res = await fetch(url, {
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
      const url = isManager
        ? `${API_BASE_URL}/manager/employees/${deleting.id}`
        : `${API_BASE_URL}/admin/users/${deleting.id}`
      const res = await fetch(url, {
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
      const url = isManager
        ? `${API_BASE_URL}/manager/employees/${editing.id}`
        : `${API_BASE_URL}/admin/users/${editing.id}`
      const res = await fetch(url, {
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
    const upperJobTitle = (emp.jobTitle || '').toUpperCase()
    let mappedJobTitle = upperJobTitle
    if (upperJobTitle === 'SALES COORDINATOR' || upperJobTitle === 'PAYROLL' || upperJobTitle === 'INVENTORY' || upperJobTitle === 'COORDINATOR') {
      mappedJobTitle = 'COORDINATOR'
    } else if (!mappedJobTitle && (emp.role || '').toUpperCase() === 'EMPLOYEE') {
      mappedJobTitle = 'TECHNICIAN'
    }
    setForm({
      name: emp.name,
      email: emp.email,
      phone: emp.phone || '',
      branchId: emp.branchId || '',
      role: (emp.role || 'EMPLOYEE').toUpperCase(),
      jobTitle: mappedJobTitle,
      newPassword: '',
    })
    setErr('')
  }

  const handleQuickMemberTypeChange = async (emp: Employee, value: string) => {
    const [role, jobTitle = ''] = value.split('|')
    await handleQuickUpdate(emp, { role, jobTitle })
  }

  const handleQuickBranchChange = async (emp: Employee, branchId: string) => {
    await handleQuickUpdate(emp, { branchId })
  }

  const handleQuickUpdate = async (emp: Employee, patch: Partial<{ role: string; jobTitle: string; branchId: string }>) => {
    if (!isAdmin) return
    setErr('')
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const res = await fetch(`${API_BASE_URL}/admin/users/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: emp.name,
          email: emp.email,
          phone: emp.phone || '',
          branchId: patch.branchId ?? emp.branchId ?? '',
          role: patch.role ?? emp.role,
          jobTitle: patch.jobTitle ?? emp.jobTitle ?? '',
        })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErr(d.message || 'Failed to update member.')
        return
      }
      fetchEmployees()
    } catch {
      setErr('Network error while updating member.')
    }
  }

  const handleCreateTech = async () => {
    if (!createForm.name?.trim() || !createForm.email?.trim()) {
      setErr('Name and email are required.')
      return
    }
    if (isAdmin && !createForm.branchId?.trim()) {
      setErr('Select a branch for this technician.')
      return
    }
    setCreateSaving(true)
    setErr('')
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const url = isAdmin ? `${API_BASE_URL}/admin/technicians` : `${API_BASE_URL}/manager/employees`
      const isManagerOrAdmin = createForm.role === 'MANAGER' || createForm.role === 'ADMIN';
      const roleToSend = isManagerOrAdmin ? createForm.role : 'EMPLOYEE';
      const jobTitleToSend = isManagerOrAdmin ? '' : createForm.role;

      const body = isAdmin
        ? {
            name: createForm.name.trim(),
            email: createForm.email.trim(),
            branchId: createForm.branchId.trim(),
            role: roleToSend,
            jobTitle: jobTitleToSend,
          }
        : {
            name: createForm.name.trim(),
            email: createForm.email.trim(),
            role: roleToSend,
            jobTitle: jobTitleToSend,
          }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data?.message || 'Could not create technician.')
        return
      }
      const u = data?.data
      const temp = u?.temporaryPassword
      if (typeof temp === 'string' && temp.length > 0 && u?.email) {
        setNewTechCreds({ email: u.email, password: temp })
      }
      setShowCreate(false)
      setCreateForm({ name: '', email: '', branchId: '', role: 'TECHNICIAN' })
      fetchEmployees()
    } catch {
      setErr('Network error.')
    } finally {
      setCreateSaving(false)
    }
  }

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg       = isLight ? '#ffffff' : '#0A1120'
  const border       = isLight ? '#e2e8f0' : '#141C2E'
  const textPrimary  = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted    = isLight ? '#64748b' : '#7A95B8'
  const rowHover     = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const theadBg      = isLight ? '#f8fafc' : 'rgba(15,26,46,0.5)'
  const inputBg      = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder  = isLight ? '#cbd5e1' : '#243452'

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

  const copyCreds = async (text: string, field: 'email' | 'password') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      /* non-secure context */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 style={{ color: textPrimary }} className="text-2xl font-bold tracking-tight mb-1">
            {isManager ? 'Branch team' : 'Employees'}
          </h2>
          <p style={{ color: textMuted }} className="text-sm">
            {isManager
              ? 'Add technicians and manage who can be assigned to jobs for your branch.'
              : 'Manage internal employees and service staff.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
        {(isManager || isAdmin) && (
          <button
            type="button"
            onClick={() => { setShowCreate(true); setErr(''); setCreateForm({ name: '', email: '', branchId: '', role: 'TECHNICIAN' }) }}
            className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all shrink-0"
          >
            <Plus className="w-4 h-4" /> Add member
          </button>
        )}
        <button
          onClick={fetchEmployees}
          style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textMuted }}
          className="flex items-center gap-2 border px-4 py-2.5 rounded-xl font-bold transition-all hover:text-[#10B981] hover:border-[#10B981] text-sm shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        </div>
      </div>

      {/* Main Card */}
      <div style={{ backgroundColor: cardBg, borderColor: border }} className="border rounded-2xl flex flex-col overflow-hidden shadow-sm">
        
        {/* Toolbar */}
        <div style={{ borderColor: border }} className="flex flex-col md:flex-row justify-between items-stretch md:items-center p-5 border-b gap-4">
          <div style={{ backgroundColor: inputBg, borderColor: inputBorder }} className="flex flex-1 max-w-md items-center border rounded-xl px-3 py-2.5 focus-within:border-[#10B981] focus-within:ring-1 focus-within:ring-[#10B981]">
            <Search className="w-4 h-4 mr-2" style={{ color: textMuted }} />
            <input type="text" placeholder="Search employees..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ color: textPrimary }} className="bg-transparent border-none text-sm focus:outline-none w-full placeholder-slate-400" />
          </div>

          <div className="flex p-1 rounded-xl border w-full md:w-fit" style={{ backgroundColor: cardBg, borderColor: border }}>
            {[
              { id: 'all', label: 'All', color: 'slate' },
              { id: 'active', label: 'Active', color: 'emerald' },
              { id: 'inactive', label: 'Inactive', color: 'amber' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 uppercase tracking-widest ${
                  activeTab === t.id 
                    ? t.id === 'active' ? 'bg-emerald-500 text-white shadow-sm' : t.id === 'inactive' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {err && !editing && !showCreate && (
          <div className="mx-5 mt-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            {err}
          </div>
        )}

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
                    {e.jobTitle || e.role}
                  </div>
                  {isAdmin && (
                    <select
                      value={memberTypeValue(e)}
                      onChange={event => handleQuickMemberTypeChange(e, event.target.value)}
                      className="mt-2 w-full border rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-[#10B981]"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                    >
                      {JOB_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  )}
                </div>
                <button
                  type="button"
                  data-employee-action-trigger="true"
                  onClick={(ev) => openEmployeeActions(ev, e.id)}
                  style={{ color: textMuted }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center gap-2" style={{ color: textMuted }}><Mail className="w-4 h-4 shrink-0" /><span className="truncate">{e.email}</span></div>
                {e.phone && <div className="flex items-center gap-2" style={{ color: textMuted }}><Phone className="w-4 h-4 shrink-0" />{e.phone}</div>}
                {isAdmin ? (
                  <select
                    value={e.branchId || ''}
                    onChange={event => handleQuickBranchChange(e, event.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-[#10B981]"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    <option value="">Unassigned</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                ) : (
                  e.branchName && <div className="flex items-center gap-2" style={{ color: textPrimary }}><Building2 className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} />{e.branchName}</div>
                )}
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

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr style={{ backgroundColor: theadBg }}>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[25%]" style={{ color: textMuted }}>Member</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[15%]" style={{ color: textMuted }}>Role</th>
                {!isManager && (
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[20%]" style={{ color: textMuted }}>Branch</th>
                )}
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[20%]" style={{ color: textMuted }}>Contact</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[12%]" style={{ color: textMuted }}>Status</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] w-[8%]" style={{ color: textMuted + '80' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr><td colSpan={isManager ? 5 : 6} className="px-6 py-12 text-center" style={{ color: textMuted }}>Loading employees...</td></tr>
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan={isManager ? 5 : 6} className="px-6 py-12 text-center" style={{ color: textMuted }}>No employees found.</td></tr>
              ) : filteredEmployees.map((e) => (
                <tr key={e.id} style={{ backgroundColor: cardBg, borderBottom: `1px solid ${border}` }} className="group transition-colors" onMouseEnter={el => el.currentTarget.style.backgroundColor = rowHover} onMouseLeave={el => el.currentTarget.style.backgroundColor = cardBg}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {e.profileImage ? (
                        <img src={e.profileImage} alt={e.name} className="w-10 h-10 rounded-full object-cover shadow-sm ring-1 ring-slate-100 dark:ring-slate-800" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shadow-sm ring-1 ring-slate-100 dark:ring-slate-800" style={{ backgroundColor: getInitialsColor(e.name) }}>{getInitials(e.name)}</div>
                      )}
                      <div className="min-w-0">
                        <div style={{ color: textPrimary }} className="font-bold truncate">{e.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {isAdmin ? (
                      <select
                        value={memberTypeValue(e)}
                        onChange={event => handleQuickMemberTypeChange(e, event.target.value)}
                        className="w-full border rounded-lg px-2 py-2 text-xs font-black outline-none focus:border-[#10B981]"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      >
                        {JOB_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 font-black uppercase tracking-[0.05em] text-[10px] px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                        <UserCheck className="w-3 h-3" />
                        {e.jobTitle || formatRole(e.role)}
                      </div>
                    )}
                  </td>
                  {!isManager && (
                  <td className="px-6 py-4">
                    {isAdmin ? (
                      <select
                        value={e.branchId || ''}
                        onChange={event => handleQuickBranchChange(e, event.target.value)}
                        className="w-full border rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-[#10B981]"
                        style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                      >
                        <option value="">Unassigned</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    ) : e.branchName ? (
                      <div className="flex items-center gap-2 text-xs font-bold" style={{ color: textPrimary }}>
                        <Building2 className="w-3.5 h-3.5 text-[#10B981]" />
                        <span className="truncate">{e.branchName}</span>
                      </div>
                    ) : <span className="text-xs italic" style={{ color: textMuted }}>Unassigned</span>}
                  </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium truncate" style={{ color: textMuted }}>
                        <Mail className="w-3.5 h-3.5 text-[#10B981]" /> {e.email}
                      </div>
                      {e.phone && (
                        <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: textMuted }}>
                          <Phone className="w-3.5 h-3.5" /> {e.phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleToggleActive(e)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105 ${e.isActive ? 'text-emerald-500 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800' : 'text-slate-400 bg-slate-50 border-slate-100 dark:text-slate-500 dark:bg-slate-800/30 dark:border-slate-800'}`}>
                      {e.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {e.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-left">
                    <button
                      type="button"
                      data-employee-action-trigger="true"
                      onClick={(ev) => openEmployeeActions(ev, e.id)}
                      style={{ color: textMuted }}
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions menu (fixed — not clipped by table overflow) */}
      {activeDropdown && menuPosition && (() => {
        const emp = employees.find(x => x.id === activeDropdown)
        if (!emp) return null
        const close = () => { setActiveDropdown(null); setMenuPosition(null) }
        return (
          <div
            ref={actionMenuRef}
            className="fixed w-44 rounded-xl shadow-2xl z-[100] py-1 border border-slate-200 dark:border-[#243452]"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              backgroundColor: isLight ? '#ffffff' : '#0F1A2E',
              boxShadow: isLight
                ? '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)'
                : '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.4)',
            }}
          >
            <button
              type="button"
              onClick={() => { openEdit(emp); close() }}
              className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
              style={{ color: textPrimary }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Member
            </button>
            <button
              type="button"
              onClick={() => { handleToggleActive(emp); close() }}
              className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
              style={{ color: textPrimary }}
            >
              <Power className="w-3.5 h-3.5" /> {emp.isActive ? 'Disable Access' : 'Enable Access'}
            </button>
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
            <button
              type="button"
              onClick={() => { setDeleting(emp); close() }}
              className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Member
            </button>
          </div>
        )
      })()}

      {/* Create technician (manager or admin) */}
      {showCreate && (isManager || isAdmin) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: textPrimary }}>Add technician</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs" style={{ color: textMuted }}>
              {isAdmin
                ? 'Creates an active technician for the branch you select. They receive an invitation email with login details (when SMTP is configured). They can add their phone number in Profile after signing in. You will also see the temporary password once here to copy.'
                : 'Creates an active login for your branch. They receive the same invitation email when SMTP is configured. They can add their phone in Profile after signing in. You will also see the temporary password once here to copy.'}
            </p>
            {err && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}
            {isAdmin && (
              <div>
                <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Branch</label>
                <select
                  value={createForm.branchId}
                  onChange={e => setCreateForm(p => ({ ...p, branchId: e.target.value }))}
                  className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                >
                  <option value="">Select branch…</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {branches.length === 0 && (
                  <p className="text-xs mt-1" style={{ color: textMuted }}>Loading branches… If empty, refresh the page or check API access.</p>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Name</label>
              <input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Work email (login)</label>
              <input type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Role / Job Title</label>
              <select
                value={createForm.role}
                onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                <option value="TECHNICIAN">TECHNICIAN</option>
                <option value="HELPER">HELPER</option>
                <option value="DRIVER">DRIVER</option>
                <option value="COORDINATOR">COORDINATOR</option>
                <option value="MANAGER">OFFICE IN CHARGE</option>
                {isAdmin && <option value="ADMIN">MANAGER</option>}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border rounded-xl py-2.5 text-sm font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800" style={{ borderColor: inputBorder, color: textMuted }}>Cancel</button>
              <button type="button" onClick={handleCreateTech} disabled={createSaving} className="flex-1 bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                {createSaving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One-time login details after creating a technician */}
      {newTechCreds && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold" style={{ color: textPrimary }}>Technician login</h3>
              <button
                type="button"
                onClick={() => setNewTechCreds(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                style={{ color: textMuted }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: textMuted }}>
              Share these with the technician so they can sign in. They should change their password under Profile after first login. This dialog won’t show again.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Login email</label>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-sm px-3 py-2 rounded-lg border truncate" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>{newTechCreds.email}</code>
                  <button
                    type="button"
                    onClick={() => copyCreds(newTechCreds.email, 'email')}
                    className="shrink-0 p-2.5 rounded-lg border font-semibold text-xs flex items-center gap-1 transition-colors hover:bg-emerald-500/10 hover:border-[#10B981]"
                    style={{ borderColor: inputBorder, color: '#10B981' }}
                  >
                    {copiedField === 'email' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: textMuted }}>Temporary password</label>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-sm px-3 py-2 rounded-lg border break-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>{newTechCreds.password}</code>
                  <button
                    type="button"
                    onClick={() => copyCreds(newTechCreds.password, 'password')}
                    className="shrink-0 p-2.5 rounded-lg border font-semibold text-xs flex items-center gap-1 transition-colors hover:bg-emerald-500/10 hover:border-[#10B981]"
                    style={{ borderColor: inputBorder, color: '#10B981' }}
                  >
                    {copiedField === 'password' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewTechCreds(null)}
              className="w-full bg-[#10B981] hover:bg-[#059669] text-white rounded-xl py-3 text-sm font-bold transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

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
            {isAdmin && (
              <>
                <div>
                  <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Role / Job Type</label>
                  <select
                    value={`${form.role}|${form.role === 'EMPLOYEE' ? form.jobTitle : ''}`}
                    onChange={el => {
                      const [role, jobTitle = ''] = el.target.value.split('|')
                      setForm(p => ({ ...p, role, jobTitle }))
                    }}
                    className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    {JOB_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold mb-1 block uppercase tracking-wide" style={{ color: textMuted }}>Branch</label>
                  <select
                    value={form.branchId}
                    onChange={el => setForm(p => ({ ...p, branchId: el.target.value }))}
                    className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10B981] transition-all"
                    style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  >
                    <option value="">Unassigned</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </>
            )}

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
