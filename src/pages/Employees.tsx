import { useState, useEffect } from 'react'
import {
  Search, Wrench, Mail, Phone, RefreshCw, Building2,
  CheckCircle, XCircle, Pencil, Trash2, X, Plus, Copy,
  Check, Eye, EyeOff, ShieldCheck, Users, UserX,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL } from '../utils/api'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Employee {
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
}

interface BranchOption { id: string; name: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const resolveLabel = (role: string, jobTitle: string) => {
  const r = role.toUpperCase()
  const j = (jobTitle || '').toUpperCase()
  if (r === 'ADMIN') return 'MANAGER'
  if (r === 'MANAGER') return 'OFFICE IN CHARGE'
  if (j) return j
  return r
}

const roleColor = (role: string) => {
  switch (role.toUpperCase()) {
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

// ── Input helper ────────────────────────────────────────────────────────────
interface FieldProps {
  label: string
  children: React.ReactNode
  labelColor: string
}

const Field = ({ label, children, labelColor }: FieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: labelColor }}>{label}</label>
    {children}
  </div>
)

// ── Component ─────────────────────────────────────────────────────────────────
export default function Employees() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight  = theme === 'light'
  const isAdmin   = user?.role?.toLowerCase() === 'admin'
  const isManager = user?.role?.toLowerCase() === 'manager'

  // Theme tokens
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const pageBg      = isLight ? '#f1f5f9' : '#060B18'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#f8fafc' : '#0F1A2E'
  const inputBorder = isLight ? '#cbd5e1' : '#243452'
  const rowHover    = isLight ? '#f8fafc' : '#0b1628'

  // Data
  const [employees, setEmployees] = useState<Employee[]>([])
  const [branches,  setBranches]  = useState<BranchOption[]>([])
  const [loading,   setLoading]   = useState(true)

  // UI
  const [search,    setSearch]    = useState('')
  const [tabFilter, setTabFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Modals
  const [editTarget,   setEditTarget]   = useState<Employee | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [showCreate,   setShowCreate]   = useState(false)
  const [newTechCreds, setNewTechCreds] = useState<{ email: string; password: string } | null>(null)
  const [copiedField,  setCopiedField]  = useState<'email' | 'password' | null>(null)

  // Edit form
  const [editForm, setEditForm] = useState({
    name: '', email: '', phone: '',
    role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
    branchId: '', isActive: true, newPassword: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')

  // Create form
  const [createForm, setCreateForm] = useState({
    name: '', email: '', branchId: '',
    role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
  })
  const [createSaving, setCreateSaving] = useState(false)

  const token = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  // ── Data Loaders ────────────────────────────────────────────────────────────
  const fetchBranches = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token()}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: { id: string; name: string }[] = data?.data || []
      const result: BranchOption[] = []
      const seenTaguig = { sales: false, services: false }
      for (const b of list) {
        const clean = b.name.replace(/^ashcol\s+/i, '').trim().toUpperCase()
        if (clean === 'TAGUIG') {
          // Main Taguig branch → split into two virtual entries once
          if (!seenTaguig.sales) {
            result.push({ id: `${b.id}-sales`,   name: 'TAGUIG - SALES' })
            seenTaguig.sales = true
          }
          if (!seenTaguig.services) {
            result.push({ id: `${b.id}-services`, name: 'TAGUIG - SERVICES' })
            seenTaguig.services = true
          }
        } else if (clean.startsWith('TAGUIG')) {
          // A separate Taguig-named branch (e.g. TAGUIG SERVICE DEPT) — skip, already covered above
        } else {
          result.push({ id: b.id, name: clean })
        }
      }
      result.sort((a, b) => a.name.localeCompare(b.name))
      setBranches(result)
    } catch { /* silent */ }
  }

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const h = { Authorization: `Bearer ${token()}` }
      const [resEmp, resMgr] = await Promise.all([
        fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers: h }),
        isAdmin ? fetch(`${API_BASE_URL}/user/all?role=MANAGER`, { headers: h }).catch(() => null) : null,
      ])
      const empList  = resEmp.ok ? ((await resEmp.json())?.data || []) : []
      const mgrList  = resMgr && resMgr.ok ? ((await resMgr.json())?.data || []) : []
      const combined = [...empList, ...mgrList]

      // Build branch map
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

      setEmployees(combined.map((s: any) => ({
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
      })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchEmployees()
    if (isAdmin) fetchBranches()
  }, [])

  // ── CRUD Handlers ───────────────────────────────────────────────────────────
  const openEdit = (emp: Employee) => {
    const jt = (emp.jobTitle || '').toUpperCase()
    const normalJt = ['TECHNICIAN','HELPER','DRIVER','COORDINATOR'].includes(jt) ? jt : (jt || 'TECHNICIAN')
    setEditForm({
      name: emp.name, email: emp.email, phone: emp.phone,
      role: emp.role, jobTitle: normalJt,
      branchId: emp.branchId, isActive: emp.isActive, newPassword: '',
    })
    setFormErr('')
    setShowPass(false)
    setEditTarget(emp)
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    if (!editForm.name.trim()) { setFormErr('Name is required.'); return }
    if (!editForm.email.trim()) { setFormErr('Email is required.'); return }
    setSaving(true); setFormErr('')
    try {
      // 1. Save profile details first
      const url = isAdmin
        ? `${API_BASE_URL}/admin/users/${editTarget.id}`
        : `${API_BASE_URL}/manager/employees/${editTarget.id}`
      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        branchId: editForm.branchId,
        role: editForm.role,
        jobTitle: editForm.role === 'EMPLOYEE' ? editForm.jobTitle : '',
      }
      if (editForm.newPassword.trim()) payload.password = editForm.newPassword.trim()
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setFormErr(d.message || d.error || 'Save failed.')
        return
      }

      // 2. If active status changed, toggle it
      if (editForm.isActive !== editTarget.isActive) {
        const toggleUrl = isAdmin
          ? `${API_BASE_URL}/admin/users/${editTarget.id}/toggle-active`
          : `${API_BASE_URL}/manager/employees/${editTarget.id}/toggle-active`
        const toggleRes = await fetch(toggleUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token()}` },
        })
        if (!toggleRes.ok) {
          const d = await toggleRes.json().catch(() => ({}))
          setFormErr(d.message || d.error || 'Failed to update account status.')
          // Still refresh table since profile changes succeeded
          fetchEmployees()
          return
        }
      }

      setEditTarget(null)
      fetchEmployees()
    } catch { setFormErr('Network error.') }
    finally { setSaving(false) }
  }

  const handleToggleActive = async (emp: Employee) => {
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/admin/users/${emp.id}/toggle-active`
        : `${API_BASE_URL}/manager/employees/${emp.id}/toggle-active`
      const res = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${token()}` } })
      if (res.ok) fetchEmployees()
    } catch { /* silent */ }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/admin/users/${deleteTarget.id}`
        : `${API_BASE_URL}/manager/employees/${deleteTarget.id}`
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
      if (res.ok) { setDeleteTarget(null); fetchEmployees() }
    } catch { /* silent */ }
  }

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.email.trim()) { setFormErr('Name and email are required.'); return }
    if (isAdmin && !createForm.branchId.trim()) { setFormErr('Branch is required.'); return }
    setCreateSaving(true); setFormErr('')
    try {
      const url = isAdmin ? `${API_BASE_URL}/admin/technicians` : `${API_BASE_URL}/manager/employees`
      const isPriv = createForm.role === 'MANAGER' || createForm.role === 'ADMIN'
      const body: Record<string, string> = {
        name:     createForm.name.trim(),
        email:    createForm.email.trim(),
        role:     isPriv ? createForm.role : 'EMPLOYEE',
        jobTitle: isPriv ? '' : createForm.jobTitle,
      }
      if (isAdmin) body.branchId = createForm.branchId.trim()
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setFormErr(data?.message || 'Could not create account.'); return }
      const u = data?.data
      if (u?.temporaryPassword && u?.email) setNewTechCreds({ email: u.email, password: u.temporaryPassword })
      setShowCreate(false)
      setCreateForm({ name: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN' })
      fetchEmployees()
    } catch { setFormErr('Network error.') }
    finally { setCreateSaving(false) }
  }

  const copyText = async (text: string, field: 'email' | 'password') => {
    try { await navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 2000) } catch { /* ignore */ }
  }

  // ── Filtered List ───────────────────────────────────────────────────────────
  const filtered = employees.filter(e => {
    if (tabFilter === 'active'   && !e.isActive) return false
    if (tabFilter === 'inactive' && e.isActive)  return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      e.name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      e.jobTitle.toLowerCase().includes(q) ||
      e.branchName.toLowerCase().includes(q) ||
      e.phone.toLowerCase().includes(q)
    )
  })

  const stats = {
    total:    employees.length,
    active:   employees.filter(e => e.isActive).length,
    inactive: employees.filter(e => !e.isActive).length,
  }

  const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-emerald-500/20"
  const inputStyle = { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5" style={{ minHeight: '100vh', backgroundColor: pageBg }}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: textPrimary }}>
            {isManager ? 'Branch Team' : 'Employees'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: textMuted }}>
            {isAdmin ? `${stats.total} accounts — ${stats.active} active, ${stats.inactive} inactive` : 'Manage your branch members'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isAdmin || isManager) && (
            <button
              onClick={() => { setShowCreate(true); setFormErr(''); setCreateForm({ name: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN' }) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ backgroundColor: '#10B981' }}
            >
              <Plus className="w-4 h-4" /> Add Account
            </button>
          )}
          <button
            onClick={fetchEmployees}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all hover:border-emerald-500 hover:text-emerald-500"
            style={{ backgroundColor: cardBg, borderColor: border, color: textMuted }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      {isAdmin && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total',    value: stats.total,    icon: <Users className="w-4 h-4" />,    color: '#3B82F6' },
            { label: 'Active',   value: stats.active,   icon: <CheckCircle className="w-4 h-4" />, color: '#10B981' },
            { label: 'Inactive', value: stats.inactive, icon: <UserX className="w-4 h-4" />,    color: '#F59E0B' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${s.color}18`, color: s.color }}>{s.icon}</div>
              <div>
                <div className="text-xl font-black" style={{ color: textPrimary }}>{s.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Table Card ── */}
      <div className="rounded-2xl overflow-hidden flex flex-col" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 border-b" style={{ borderColor: border }}>
          <div className="flex items-center gap-2 flex-1 max-w-sm rounded-xl px-3 py-2.5 border" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search name, email, role, branch…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none w-full"
              style={{ color: textPrimary }}
            />
            {search && <button onClick={() => setSearch('')} style={{ color: textMuted }}><X className="w-3.5 h-3.5" /></button>}
          </div>

          <div className="flex rounded-xl border overflow-hidden shrink-0" style={{ borderColor: border }}>
            {(['all', 'active', 'inactive'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTabFilter(t)}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider transition-all"
                style={{
                  backgroundColor: tabFilter === t
                    ? t === 'active' ? '#10B981' : t === 'inactive' ? '#F59E0B' : '#1E2D48'
                    : 'transparent',
                  color: tabFilter === t ? '#fff' : textMuted,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ backgroundColor: `rgba(16,185,129,0.1)`, color: '#10B981' }}>
            {filtered.length} shown
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#080f1c', borderBottom: `2px solid ${border}` }}>
                {['Employee', 'Role / Title', 'Branch', 'Contact', 'Status', ...(isAdmin ? ['Actions'] : [])].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: textMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                    {[1,2,3,4,5].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 rounded animate-pulse" style={{ backgroundColor: inputBg, width: j === 1 ? '80%' : '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-16 text-center">
                    <Wrench className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: textMuted }} />
                    <p className="font-bold" style={{ color: textMuted }}>No accounts found</p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>Try changing the filter or search term.</p>
                  </td>
                </tr>
              ) : filtered.map(e => {
                const rc = roleColor(e.role)
                return (
                  <tr
                    key={e.id}
                    style={{ borderBottom: `1px solid ${border}` }}
                    className="transition-colors"
                    onMouseEnter={el => (el.currentTarget.style.backgroundColor = rowHover)}
                    onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Employee */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {e.profileImage ? (
                          <img src={e.profileImage} alt={e.name} className="w-9 h-9 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white font-black text-xs" style={{ backgroundColor: avatarColor(e.name) }}>
                            {initials(e.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold truncate max-w-[160px]" style={{ color: textPrimary }}>{e.name}</div>
                          <div className="text-[11px] truncate max-w-[160px]" style={{ color: textMuted }}>{e.id}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap"
                        style={{ backgroundColor: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>
                        <ShieldCheck className="w-3 h-3" />
                        {resolveLabel(e.role, e.jobTitle)}
                      </span>
                    </td>

                    {/* Branch */}
                    <td className="px-4 py-3">
                      {e.branchName ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap" style={{ color: textPrimary }}>
                          <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
                          {e.branchName}
                        </div>
                      ) : (
                        <span className="text-xs italic" style={{ color: textMuted }}>Unassigned</span>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: textMuted }}>
                          <Mail className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                          <span className="truncate max-w-[180px]">{e.email}</span>
                        </div>
                        {e.phone && (
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: textMuted }}>
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            {e.phone}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(e)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all hover:scale-105"
                        style={e.isActive
                          ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)' }
                          : { color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.2)' }}
                        title="Click to toggle active status"
                      >
                        {e.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {e.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEdit(e)}
                            title="Edit"
                            className="p-1.5 rounded-lg transition-all hover:bg-emerald-500/10 hover:text-emerald-500"
                            style={{ color: textMuted }}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(e)}
                            title="Delete"
                            className="p-1.5 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-500"
                            style={{ color: textMuted }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: border }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0" style={{ backgroundColor: avatarColor(editTarget.name) }}>
                  {initials(editTarget.name)}
                </div>
                <div>
                  <h3 className="font-black text-base" style={{ color: textPrimary }}>Edit Account</h3>
                  <p className="text-xs" style={{ color: textMuted }}>{editTarget.email}</p>
                </div>
              </div>
              <button onClick={() => setEditTarget(null)} className="p-2 rounded-xl transition-all hover:bg-slate-500/10" style={{ color: textMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {formErr && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-semibold">{formErr}</div>}

              {/* Name + Email */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full Name" labelColor={textMuted}>
                  <input className={inputCls} style={inputStyle} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </Field>
                <Field label="Login Email" labelColor={textMuted}>
                  <input className={inputCls} style={inputStyle} type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
                </Field>
              </div>

              {/* Phone + Branch */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone" labelColor={textMuted}>
                  <input className={inputCls} style={inputStyle} value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XX XXX XXXX" />
                </Field>
                <Field label="Branch" labelColor={textMuted}>
                  <select className={inputCls} style={inputStyle} value={editForm.branchId} onChange={e => setEditForm(p => ({ ...p, branchId: e.target.value }))}>
                    <option value="">— Unassigned —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              </div>

              {/* Role + Job Title */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="System Role" labelColor={textMuted}>
                  <select className={inputCls} style={inputStyle}
                    value={editForm.role}
                    onChange={e => setEditForm(p => ({ ...p, role: e.target.value, jobTitle: e.target.value === 'EMPLOYEE' ? 'TECHNICIAN' : '' }))}
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Office In Charge</option>
                    <option value="ADMIN">Manager (Admin)</option>
                  </select>
                </Field>
                {editForm.role === 'EMPLOYEE' && (
                  <Field label="Job Title" labelColor={textMuted}>
                    <select className={inputCls} style={inputStyle} value={editForm.jobTitle} onChange={e => setEditForm(p => ({ ...p, jobTitle: e.target.value }))}>
                      <option value="TECHNICIAN">TECHNICIAN</option>
                      <option value="HELPER">HELPER</option>
                      <option value="DRIVER">DRIVER</option>
                      <option value="COORDINATOR">COORDINATOR</option>
                    </select>
                  </Field>
                )}
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: border }}>
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color: textPrimary }}>Account Status</div>
                  <div className="text-xs" style={{ color: textMuted }}>Toggle to enable or disable login access</div>
                </div>
                <button
                  onClick={() => setEditForm(p => ({ ...p, isActive: !p.isActive }))}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black border transition-all"
                  style={editForm.isActive
                    ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' }
                    : { color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.2)' }}
                >
                  {editForm.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {editForm.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* New Password */}
              <Field label="New Password (leave blank to keep current)" labelColor={textMuted}>
                <div className="relative">
                  <input
                    className={inputCls}
                    style={{ ...inputStyle, paddingRight: '2.75rem' }}
                    type={showPass ? 'text' : 'password'}
                    value={editForm.newPassword}
                    onChange={e => setEditForm(p => ({ ...p, newPassword: e.target.value }))}
                    placeholder="Enter new password to change…"
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: textMuted }}>
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center gap-3 shrink-0" style={{ borderColor: border }}>
              <button onClick={() => setEditTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all hover:opacity-80" style={{ borderColor: border, color: textMuted, backgroundColor: 'transparent' }}>
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: border }}>
              <h3 className="font-black text-base" style={{ color: textPrimary }}>Add New Account</h3>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-xl hover:bg-slate-500/10" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {formErr && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-semibold">{formErr}</div>}

              <Field label="Full Name" labelColor={textMuted}>
                <input className={inputCls} style={inputStyle} value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="Juan Dela Cruz" />
              </Field>
              <Field label="Login Email" labelColor={textMuted}>
                <input className={inputCls} style={inputStyle} type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="juan@ashcol.com.ph" />
              </Field>

              {isAdmin && (
                <Field label="Branch" labelColor={textMuted}>
                  <select className={inputCls} style={inputStyle} value={createForm.branchId} onChange={e => setCreateForm(p => ({ ...p, branchId: e.target.value }))}>
                    <option value="">— Select branch —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="System Role" labelColor={textMuted}>
                  <select className={inputCls} style={inputStyle} value={createForm.role}
                    onChange={e => setCreateForm(p => ({ ...p, role: e.target.value, jobTitle: e.target.value === 'EMPLOYEE' ? 'TECHNICIAN' : '' }))}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Office In Charge</option>
                    {isAdmin && <option value="ADMIN">Manager (Admin)</option>}
                  </select>
                </Field>
                {createForm.role === 'EMPLOYEE' && (
                  <Field label="Job Title" labelColor={textMuted}>
                    <select className={inputCls} style={inputStyle} value={createForm.jobTitle} onChange={e => setCreateForm(p => ({ ...p, jobTitle: e.target.value }))}>
                      <option value="TECHNICIAN">TECHNICIAN</option>
                      <option value="HELPER">HELPER</option>
                      <option value="DRIVER">DRIVER</option>
                      <option value="COORDINATOR">COORDINATOR</option>
                    </select>
                  </Field>
                )}
              </div>

              <p className="text-xs rounded-xl p-3 border" style={{ color: textMuted, borderColor: border, backgroundColor: inputBg }}>
                A temporary password will be auto-generated and emailed. You'll also see it here to copy immediately after creation.
              </p>
            </div>

            <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: border }}>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all hover:opacity-80" style={{ borderColor: border, color: textMuted }}>Cancel</button>
              <button onClick={handleCreate} disabled={createSaving} className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
                {createSaving ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Credentials Modal ── */}
      {newTechCreds && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-5" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-base" style={{ color: textPrimary }}>Account Created</h3>
                <p className="text-xs mt-0.5" style={{ color: textMuted }}>Share these credentials. This won't show again.</p>
              </div>
              <button onClick={() => setNewTechCreds(null)} className="p-2 rounded-xl hover:bg-slate-500/10" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>

            {[
              { label: 'Login Email', value: newTechCreds.email, field: 'email' as const },
              { label: 'Temporary Password', value: newTechCreds.password, field: 'password' as const },
            ].map(row => (
              <div key={row.field}>
                <div className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: textMuted }}>{row.label}</div>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-sm px-3 py-2.5 rounded-xl border font-mono break-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}>{row.value}</code>
                  <button
                    onClick={() => copyText(row.value, row.field)}
                    className="p-2.5 rounded-xl border transition-all hover:border-emerald-500 hover:text-emerald-500 shrink-0"
                    style={{ borderColor: inputBorder, color: textMuted }}
                  >
                    {copiedField === row.field ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}

            <button onClick={() => setNewTechCreds(null)} className="w-full py-3 rounded-xl text-sm font-black text-white" style={{ backgroundColor: '#10B981' }}>Done</button>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10"><Trash2 className="w-5 h-5 text-red-500" /></div>
              <div>
                <h3 className="font-black" style={{ color: textPrimary }}>Delete Account</h3>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Remove <strong>{deleteTarget.name}</strong>? This cannot be undone.</p>
              </div>
            </div>
            <div className="rounded-xl p-3 border text-xs" style={{ borderColor: border, backgroundColor: inputBg, color: textMuted }}>
              <strong style={{ color: textPrimary }}>Email:</strong> {deleteTarget.email}<br />
              <strong style={{ color: textPrimary }}>Role:</strong> {resolveLabel(deleteTarget.role, deleteTarget.jobTitle)}<br />
              <strong style={{ color: textPrimary }}>Branch:</strong> {deleteTarget.branchName || 'Unassigned'}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all" style={{ borderColor: border, color: textMuted }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-sm font-black text-white bg-red-500 hover:bg-red-600 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
