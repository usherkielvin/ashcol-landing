import { useState, useEffect, useRef } from 'react'
import {
  Search, Wrench, Mail, Phone, RefreshCw, Building2,
  CheckCircle, XCircle, Pencil, Trash2, X, Plus, Copy,
  Check, Eye, EyeOff, ShieldCheck,
  Camera, MapPin, Calendar, Tag, User,
  ChevronDown, ChevronUp, Map, Home, Mailbox, Globe
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, resolveImageUrl } from '../utils/api'

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

interface BranchOption { id: string; name: string }

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_JOB_TITLES = ['TECHNICIAN', 'HELPER', 'DRIVER', 'COORDINATOR', 'SALES EXECUTIVE']

const resolveLabel = (role: string, jobTitle: string) => {
  const r = role.toUpperCase()
  const j = (jobTitle || '').toUpperCase()
  if (r === 'ADMIN') return 'MANAGER'
  if (r === 'MANAGER') return 'OIC'
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

// ── Input helper ────────────────────────────────────────────────────────────
interface FieldProps {
  label: string
  children: React.ReactNode
  labelColor: string
}

const Field = ({ label, children, labelColor }: FieldProps) => (
  <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
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

  // Custom Job Titles / Role Levels (localStorage)
  const [customJobTitles, setCustomJobTitles] = useState<string[]>([])
  const [showRoleManager, setShowRoleManager] = useState(false)
  const [newRoleInput, setNewRoleInput] = useState('')

  // Drawer details panel state
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [activeDrawerTab, setActiveDrawerTab] = useState<'overview' | 'address' | 'system'>('overview')
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI Filters
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
    personalEmail: '', region: '', city: '',
    barangay: '', street: '', landmark: '',
    skills: '',
    profileImage: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')

  // Create form
  const [createForm, setCreateForm] = useState({
    name: '', email: '', branchId: '',
    role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
    phone: '', personalEmail: '', region: '',
    city: '', barangay: '', street: '',
    landmark: '', skills: '',
    profileImage: '',
  })
  const [createSaving, setCreateSaving] = useState(false)

  const token = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  // Load custom roles on mount
  useEffect(() => {
    const saved = localStorage.getItem('ashcol-custom-job-titles')
    if (saved) {
      try {
        setCustomJobTitles(JSON.parse(saved))
      } catch {
        setCustomJobTitles([])
      }
    }
  }, [])

  const handleAddCustomRole = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = newRoleInput.trim().toUpperCase()
    if (!clean) return
    const combined = [...DEFAULT_JOB_TITLES, ...customJobTitles]
    if (combined.includes(clean)) {
      alert('Role title already exists.')
      return
    }
    const updated = [...customJobTitles, clean]
    setCustomJobTitles(updated)
    localStorage.setItem('ashcol-custom-job-titles', JSON.stringify(updated))
    setNewRoleInput('')
  }

  const handleRemoveCustomRole = (roleTitle: string) => {
    const updated = customJobTitles.filter(t => t !== roleTitle)
    setCustomJobTitles(updated)
    localStorage.setItem('ashcol-custom-job-titles', JSON.stringify(updated))
  }

  const allJobTitles = [...DEFAULT_JOB_TITLES, ...customJobTitles]

  // ── Data Loaders ────────────────────────────────────────────────────────────
  const fetchBranches = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token()}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: { id: string; name: string }[] = data?.data || []
      const result: BranchOption[] = []
      for (const b of list) {
        const clean = b.name.replace(/^ashcol\s+/i, '').trim().toUpperCase()
        if (b.id === 'BR-TAGUIG-SALES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') {
          if (!result.some(item => item.id === 'BR-TAGUIG-SALES')) {
            result.push({ id: 'BR-TAGUIG-SALES', name: 'TAGUIG - SALES' })
          }
        } else if (b.id === 'BR-TAGUIG-SERVICES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-services' || b.id === 'BR-TAGUIG-SALES-services') {
          if (!result.some(item => item.id === 'BR-TAGUIG-SERVICES')) {
            result.push({ id: 'BR-TAGUIG-SERVICES', name: 'TAGUIG - SERVICES' })
          }
        } else if (clean.startsWith('TAGUIG')) {
          // skip other taguig variants
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
            if (b.id === 'BR-TAGUIG-SALES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') {
              branchMap[b.id] = 'TAGUIG - SALES'
              branchMap[`${b.id}-sales`] = 'TAGUIG - SALES'
              branchMap['BR-TAGUIG-SALES-sales'] = 'TAGUIG - SALES'
            } else if (b.id === 'BR-TAGUIG-SERVICES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-services' || b.id === 'BR-TAGUIG-SALES-services') {
              branchMap[b.id] = 'TAGUIG - SERVICES'
              branchMap[`${b.id}-services`] = 'TAGUIG - SERVICES'
              branchMap['BR-TAGUIG-SALES-services'] = 'TAGUIG - SERVICES'
            } else {
              branchMap[b.id] = clean
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
        personalEmail: s.personalEmail || '',
        region:      s.region      || '',
        city:        s.city        || '',
        barangay:    s.barangay    || '',
        street:      s.street      || '',
        landmark:    s.landmark    || '',
        skills:      s.skills      || '',
        createdAt:   s.createdAt,
        updatedAt:   s.updatedAt,
      })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchEmployees()
    fetchBranches()
  }, [])

  // ── Live Details Update helpers ─────────────────────────────────────────────
  const triggerImageUpload = () => {
    fileInputRef.current?.click()
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedEmployee) return

    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be smaller than 2MB")
      return
    }

    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64String = reader.result as string
      setImageUploading(true)
      try {
        const url = isAdmin
          ? `${API_BASE_URL}/admin/users/${selectedEmployee.id}`
          : `${API_BASE_URL}/manager/employees/${selectedEmployee.id}`

        const res = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`
          },
          body: JSON.stringify({ profileImage: base64String })
        })

        if (res.ok) {
          const updatedEmp = { ...selectedEmployee, profileImage: base64String }
          setSelectedEmployee(updatedEmp)
          setEmployees(prev => prev.map(emp => emp.id === selectedEmployee.id ? updatedEmp : emp))
        } else {
          alert("Failed to save image to server.")
        }
      } catch (err) {
        console.error(err)
        alert("Upload error occurred.")
      } finally {
        setImageUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }



  // ── Drawer toggle ───────────────────────────────────────────────────────────
  const handleRowClick = (emp: Employee) => {
    setSelectedEmployee(emp)
    setIsDrawerOpen(true)
    setActiveDrawerTab('overview')
  }

  // ── CRUD Handlers ───────────────────────────────────────────────────────────
  const openEdit = (emp: Employee) => {
    const jt = (emp.jobTitle || '').toUpperCase()
    const validJt = allJobTitles.includes(jt) ? jt : (jt || 'TECHNICIAN')
    setEditForm({
      name: emp.name, email: emp.email, phone: emp.phone,
      role: emp.role, jobTitle: validJt,
      branchId: emp.branchId, isActive: emp.isActive, newPassword: '',
      personalEmail: emp.personalEmail || '',
      region: emp.region || '',
      city: emp.city || '',
      barangay: emp.barangay || '',
      street: emp.street || '',
      landmark: emp.landmark || '',
      skills: emp.skills ? (emp.skills.startsWith('[') ? parseSkills(emp.skills)[0] || '' : emp.skills) : '',
      profileImage: emp.profileImage || '',
    })
    setFormErr('')
    setShowPass(false)
    setIsDrawerOpen(false)
    setEditTarget(emp)
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    if (!editForm.name.trim()) { setFormErr('Name is required.'); return }
    if (!editForm.email.trim()) { setFormErr('Email is required.'); return }
    setSaving(true); setFormErr('')
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/admin/users/${editTarget.id}`
        : `${API_BASE_URL}/manager/employees/${editTarget.id}`

      // Format skills as JSON array string
      const skillsArray = editForm.skills
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
      const skillsJson = JSON.stringify(skillsArray)

      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        branchId: editForm.branchId,
        role: editForm.role,
        jobTitle: editForm.role === 'EMPLOYEE' ? editForm.jobTitle : '',
        personalEmail: editForm.personalEmail.trim(),
        region: editForm.region.trim(),
        city: editForm.city.trim(),
        barangay: editForm.barangay.trim(),
        street: editForm.street.trim(),
        landmark: editForm.landmark.trim(),
        skills: skillsJson,
        profileImage: editForm.profileImage,
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

      // If active status changed, toggle it
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
          fetchEmployees()
          return
        }
      }

      // Refresh drawer if it matches edit target
      if (selectedEmployee && selectedEmployee.id === editTarget.id) {
        const updated = {
          ...selectedEmployee,
          ...payload,
          isActive: editForm.isActive,
          skills: skillsJson,
          branchName: branches.find(b => b.id === editForm.branchId)?.name || ''
        } as Employee
        setSelectedEmployee(updated)
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
      if (res.ok) {
        if (selectedEmployee && selectedEmployee.id === emp.id) {
          setSelectedEmployee(prev => prev ? { ...prev, isActive: !prev.isActive } : null)
        }
        fetchEmployees()
      }
    } catch { /* silent */ }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/admin/users/${deleteTarget.id}`
        : `${API_BASE_URL}/manager/employees/${deleteTarget.id}`
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
      if (res.ok) {
        if (selectedEmployee && selectedEmployee.id === deleteTarget.id) {
          setIsDrawerOpen(false)
          setSelectedEmployee(null)
        }
        setDeleteTarget(null)
        fetchEmployees()
      }
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

      // Save additional profile details immediately after successful registration
      if (u?.id) {
        const skillsArray = createForm.skills
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(Boolean)
        const skillsJson = JSON.stringify(skillsArray)

        const updateUrl = isAdmin
          ? `${API_BASE_URL}/admin/users/${u.id}`
          : `${API_BASE_URL}/manager/employees/${u.id}`

        await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({
            phone: createForm.phone.trim(),
            personalEmail: createForm.personalEmail.trim(),
            region: createForm.region.trim(),
            city: createForm.city.trim(),
            barangay: createForm.barangay.trim(),
            street: createForm.street.trim(),
            landmark: createForm.landmark.trim(),
            skills: skillsJson,
            profileImage: createForm.profileImage,
          }),
        })
      }

      if (u?.temporaryPassword && u?.email) setNewTechCreds({ email: u.email, password: u.temporaryPassword })
      setShowCreate(false)
      setCreateForm({
        name: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
        phone: '', personalEmail: '', region: '', city: '', barangay: '', street: '',
        landmark: '', skills: '', profileImage: '',
      })
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
      e.phone.toLowerCase().includes(q) ||
      (e.skills || '').toLowerCase().includes(q)
    )
  })

  const stats = {
    total:    employees.length,
    active:   employees.filter(e => e.isActive).length,
    inactive: employees.filter(e => !e.isActive).length,
  }

  const inputCls = "w-full rounded-xl px-3 py-2 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-emerald-500/20"
  const inputStyle = { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3" style={{ minHeight: '100vh', backgroundColor: pageBg }}>
      
      {/* Hidden File Input for Profile Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* ── Slim Toolbar Header ── */}
      <div className="flex flex-wrap items-center gap-2 py-1">
        {/* Title + stats chips */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-bold" style={{ color: textPrimary }}>
            {isManager ? 'Branch Team' : 'Employee Directory'}
          </span>
          {isAdmin && (
            <>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>
                {stats.total} total
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
                {stats.active} active
              </span>
              {stats.inactive > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
                  {stats.inactive} inactive
                </span>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <button
              onClick={() => setShowRoleManager(!showRoleManager)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
              style={{ backgroundColor: cardBg, borderColor: border, color: textMuted }}
            >
              <Tag className="w-3.5 h-3.5" />
              Roles {showRoleManager ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {(isAdmin || isManager) && (
            <button
              onClick={() => { setShowCreate(true); setFormErr(''); setCreateForm({ name: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN', phone: '', personalEmail: '', region: '', city: '', barangay: '', street: '', landmark: '', skills: '', profileImage: '' }) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#10B981' }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Employee
            </button>
          )}
          <button
            onClick={fetchEmployees}
            className="p-1.5 rounded-lg border transition-all hover:border-emerald-500 hover:text-emerald-500"
            style={{ backgroundColor: cardBg, borderColor: border, color: textMuted }}
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Admin Custom Job Titles / Role Levels Panel ── */}
      {isAdmin && showRoleManager && (
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: textPrimary }}>Job Title / Role Levels</span>
            <span className="text-[10px]" style={{ color: textMuted }}>Manage job titles for dropdown fields</span>
          </div>
          
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border" style={{ borderColor: border, color: textMuted }}>Default:</span>
            {DEFAULT_JOB_TITLES.map(title => (
              <span key={title} className="text-[10px] font-bold uppercase px-2 py-1 rounded text-emerald-500 bg-emerald-500/10 border border-emerald-500/20">{title}</span>
            ))}
          </div>

          {customJobTitles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border" style={{ borderColor: border, color: textMuted }}>Custom:</span>
              {customJobTitles.map(title => (
                <span key={title} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded text-blue-500 bg-blue-500/10 border border-blue-500/20">
                  {title}
                  <button onClick={() => handleRemoveCustomRole(title)} className="hover:text-red-500 transition-colors"><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
            </div>
          )}

          <form onSubmit={handleAddCustomRole} className="flex gap-2 max-w-xs">
            <input
              type="text" placeholder="New title…" value={newRoleInput}
              onChange={e => setNewRoleInput(e.target.value)}
              className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
              style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }}
            />
            <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: '#10B981' }}>Add</button>
          </form>
        </div>
      )}

      {/* ── Main Table Card ── */}
      <div className="rounded-xl overflow-hidden flex flex-col" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Compact Search + Filter Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: border }}>
          <div className="flex items-center gap-2 flex-1 rounded-lg px-2.5 py-1.5 border" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              placeholder="Search name, email, level, branch…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-xs outline-none w-full"
              style={{ color: textPrimary }}
            />
            {search && <button onClick={() => setSearch('')} style={{ color: textMuted }}><X className="w-3 h-3" /></button>}
          </div>

          <div className="flex rounded-lg border overflow-hidden shrink-0" style={{ borderColor: border }}>
            {(['all', 'active', 'inactive'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTabFilter(t)}
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
                style={{
                  backgroundColor: tabFilter === t
                    ? t === 'active' ? '#10B981' : t === 'inactive' ? '#F59E0B' : (isLight ? '#334155' : '#1E2D48')
                    : 'transparent',
                  color: tabFilter === t ? '#fff' : textMuted,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <span className="text-[10px] font-semibold px-2 py-1 rounded" style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: '#10B981' }}>
            {filtered.length}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#080f1c', borderBottom: `1px solid ${border}` }}>
                {['Employee', 'Role / Title', 'Branch', 'Contact', 'Level', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[9px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: textMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                    {[1,2,3,4,5,6,7].map(j => (
                      <td key={j} className="px-4 py-2.5">
                        <div className="h-3 rounded animate-pulse" style={{ backgroundColor: inputBg, width: j === 1 ? '70%' : '55%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium" style={{ color: textMuted }}>No accounts found</p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>Try a different search or filter.</p>
                  </td>
                </tr>
              ) : filtered.map(e => {
                const rc = roleColor(e.role)
                return (
                  <tr
                    key={e.id}
                    onClick={() => handleRowClick(e)}
                    style={{ borderBottom: `1px solid ${border}` }}
                    className="transition-colors cursor-pointer"
                    onMouseEnter={el => (el.currentTarget.style.backgroundColor = rowHover)}
                    onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Employee */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {e.profileImage ? (
                          <img src={resolveImageUrl(e.profileImage)} alt={e.name} className="w-8 h-8 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-[10px]" style={{ backgroundColor: avatarColor(e.name) }}>
                            {initials(e.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate max-w-[150px]" style={{ color: textPrimary }}>{e.name}</div>
                          <div className="text-[9px] truncate max-w-[150px] font-mono" style={{ color: textMuted }}>{e.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
                        style={{ backgroundColor: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>
                        {resolveLabel(e.role, e.jobTitle)}
                      </span>
                    </td>

                    {/* Branch */}
                    <td className="px-4 py-2.5">
                      {e.branchName ? (
                        <div className="flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: textMuted }}>
                          <Building2 className="w-3 h-3 shrink-0" style={{ color: '#10B981' }} />
                          <span className="font-medium" style={{ color: textPrimary }}>{e.branchName}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] italic" style={{ color: textMuted }}>—</span>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-2.5">
                      {e.phone ? (
                        <div className="flex items-center gap-1 text-xs" style={{ color: textMuted }}>
                          <Phone className="w-3 h-3 shrink-0" />
                          {e.phone}
                        </div>
                      ) : (
                        <span className="text-[10px] italic" style={{ color: textMuted }}>—</span>
                      )}
                    </td>

                    {/* Role Level */}
                    <td className="px-4 py-2.5">
                      {e.skills && getRoleLevel(e.skills) !== '—' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase text-blue-500 bg-blue-500/10 border border-blue-500/15 whitespace-nowrap">
                          {getRoleLevel(e.skills)}
                        </span>
                      ) : (
                        <span className="text-[10px] italic" style={{ color: textMuted }}>—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <button
                        onClick={evt => { evt.stopPropagation(); handleToggleActive(e) }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border transition-all"
                        style={e.isActive
                          ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' }
                          : { color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.06)', borderColor: 'rgba(148,163,184,0.15)' }}
                        title="Toggle status"
                      >
                        {e.isActive ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                        {e.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={evt => { evt.stopPropagation(); handleRowClick(e) }}
                          title="View Details"
                          className="p-1.5 rounded transition-all hover:bg-slate-500/10"
                          style={{ color: textMuted }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {(isAdmin || isManager) && (
                          <button
                            onClick={evt => { evt.stopPropagation(); openEdit(e) }}
                            title="Edit"
                            className="p-1.5 rounded transition-all hover:bg-emerald-500/10 hover:text-emerald-500"
                            style={{ color: textMuted }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={evt => { evt.stopPropagation(); setDeleteTarget(e) }}
                            title="Delete"
                            className="p-1.5 rounded transition-all hover:bg-red-500/10 hover:text-red-500"
                            style={{ color: textMuted }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Center Detail Modal ── */}
      {isDrawerOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: isLight ? 'rgba(241,245,249,0.96)' : 'rgba(6,11,24,0.96)', backdropFilter: 'blur(12px)' }}>
          {/* Backdrop click close */}
          <div className="absolute inset-0" onClick={() => setIsDrawerOpen(false)} />

          {/* Modal Container */}
          <div
            className="w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative"
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
                onClick={() => setIsDrawerOpen(false)}
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
                <div className="relative group w-24 h-24">
                  {selectedEmployee.profileImage ? (
                    <img
                      src={resolveImageUrl(selectedEmployee.profileImage)}
                      alt={selectedEmployee.name}
                      className="w-24 h-24 rounded-full object-cover border border-slate-500/10"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full flex items-center justify-center text-white font-black text-2xl" style={{ backgroundColor: avatarColor(selectedEmployee.name) }}>
                      {initials(selectedEmployee.name)}
                    </div>
                  )}
                  {/* Upload Overlay */}
                  <div
                    onClick={triggerImageUpload}
                    className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 cursor-pointer transition-opacity text-white"
                  >
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-white">Upload</span>
                  </div>
                  {imageUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
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
                  <button
                    onClick={() => handleToggleActive(selectedEmployee)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                    style={selectedEmployee.isActive
                      ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }
                      : { color: textMuted, backgroundColor: inputBg, borderColor: border }}
                  >
                    {selectedEmployee.isActive ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4" />}
                    {selectedEmployee.isActive ? 'Active Member' : 'Deactivated'}
                  </button>
                </div>
              </div>

              {/* Right Column - Categorized detail tables */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Tabs */}
                <div className="flex border-b text-xs uppercase tracking-widest font-black shrink-0" style={{ borderColor: border }}>
                  {(['overview', 'address', 'system'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveDrawerTab(tab)}
                      className="flex-1 py-3 text-center border-b-2 transition-all"
                      style={{
                        borderColor: activeDrawerTab === tab ? '#10B981' : 'transparent',
                        color: activeDrawerTab === tab ? textPrimary : textMuted,
                      }}
                    >
                      {tab.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Tab body */}
                <div className="flex-1 p-6 overflow-y-auto">
                  
                  {/* Overview tab */}
                  {activeDrawerTab === 'overview' && (
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
                  {activeDrawerTab === 'address' && (
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
                  {activeDrawerTab === 'system' && (
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
                onClick={() => setIsDrawerOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/10"
                style={{ borderColor: border, color: textMuted }}
              >
                Close
              </button>
              {(isAdmin || isManager) && (
                <button
                  onClick={() => openEdit(selectedEmployee)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:opacity-85"
                  style={{ borderColor: border, color: textPrimary }}
                >
                  Edit Profile
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setDeleteTarget(selectedEmployee)}
                  className="px-4 py-2 rounded-xl text-xs font-black text-white bg-red-500 hover:bg-red-600 transition-all"
                >
                  Delete Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: isLight ? 'rgba(241,245,249,0.96)' : 'rgba(6,11,24,0.96)', backdropFilter: 'blur(12px)' }}>
          <div className="w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
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
            <div className="flex-1 overflow-y-auto p-8 flex flex-col md:flex-row gap-8">
              {/* Left Column: Profile Pic Holder */}
              <div className="w-full md:w-72 flex flex-col items-center gap-5 text-center shrink-0 border-b md:border-b-0 md:border-r pb-8 md:pb-0 pr-0 md:pr-8" style={{ borderColor: border }}>
                <div className="text-[10px] font-black uppercase tracking-widest self-start" style={{ color: textMuted }}>Profile Photo</div>
                
                <div 
                  onClick={() => document.getElementById('edit-modal-photo')?.click()}
                  className="w-48 h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden relative group cursor-pointer transition-all hover:bg-slate-500/5 hover:border-emerald-500" 
                  style={{ borderColor: border, backgroundColor: inputBg }}
                >
                  {editForm.profileImage ? (
                    <>
                      <img src={resolveImageUrl(editForm.profileImage)} alt="Profile Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1.5 transition-opacity duration-200 text-white">
                        <Camera className="w-6 h-6 text-white" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white">Change Photo</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400 p-4">
                      <div className="w-12 h-12 rounded-full bg-slate-500/10 flex items-center justify-center">
                        <Plus className="w-6 h-6 text-slate-400" />
                      </div>
                      <span className="text-xs font-bold" style={{ color: textMuted }}>Click to Upload</span>
                      <span className="text-[9px]" style={{ color: textMuted }}>PNG, JPG or WEBP</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 w-full">
                  <input
                    type="file"
                    id="edit-modal-photo"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 2 * 1024 * 1024) {
                        alert("Image must be smaller than 2MB")
                        return
                      }
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setEditForm(p => ({ ...p, profileImage: reader.result as string }))
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => document.getElementById('edit-modal-photo')?.click()}
                    className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/10 w-full text-center"
                    style={{ borderColor: border, color: textPrimary }}
                  >
                    Upload Photo
                  </button>
                  {editForm.profileImage && (
                    <button
                      type="button"
                      onClick={() => setEditForm(p => ({ ...p, profileImage: '' }))}
                      className="text-xs text-red-500 font-bold hover:underline"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Input Fields Form */}
              <div className="flex-1 flex flex-col gap-5">
                {formErr && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-semibold">{formErr}</div>}

                {/* ── Section: General Info ── */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">General Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Full Name" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                    </Field>
                    <Field label="Login Email" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
                    </Field>
                    <Field label="Phone Contact" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XX XXX XXXX" />
                    </Field>
                    <Field label="Personal Email" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} type="email" value={editForm.personalEmail} onChange={e => setEditForm(p => ({ ...p, personalEmail: e.target.value }))} placeholder="personal@email.com" />
                    </Field>
                  </div>
                </div>

                {/* ── Section: Job Details ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">System & Job Settings</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Branch Assignment" labelColor={textMuted}>
                      <select className={inputCls} style={inputStyle} value={editForm.branchId} onChange={e => setEditForm(p => ({ ...p, branchId: e.target.value }))}>
                        <option value="">— Unassigned —</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </Field>
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
                      <div className="col-span-1 sm:col-span-2">
                        <Field label="Job Title" labelColor={textMuted}>
                          <select className={inputCls} style={inputStyle} value={editForm.jobTitle} onChange={e => setEditForm(p => ({ ...p, jobTitle: e.target.value }))}>
                            {allJobTitles.map(title => (
                              <option key={title} value={title}>{title}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Section: Address & Location ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">Address & Location</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Region" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.region} onChange={e => setEditForm(p => ({ ...p, region: e.target.value }))} placeholder="e.g. NCR" />
                    </Field>
                    <Field label="City" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.city} onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Pasig" />
                    </Field>
                    <Field label="Barangay" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.barangay} onChange={e => setEditForm(p => ({ ...p, barangay: e.target.value }))} placeholder="e.g. San Jose" />
                    </Field>
                    <Field label="Street / House No." labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.street} onChange={e => setEditForm(p => ({ ...p, street: e.target.value }))} placeholder="e.g. 123 Ruby St." />
                    </Field>
                    <div className="col-span-1 sm:col-span-2">
                      <Field label="Landmark Description" labelColor={textMuted}>
                        <input className={inputCls} style={inputStyle} value={editForm.landmark} onChange={e => setEditForm(p => ({ ...p, landmark: e.target.value }))} placeholder="e.g. Near Brgy Hall" />
                      </Field>
                    </div>
                  </div>
                </div>

                {/* ── Section: Role Level ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">Role Level</h4>
                  <Field label="Employee Role Level" labelColor={textMuted}>
                    <select
                      className={inputCls}
                      style={inputStyle}
                      value={editForm.skills ? (editForm.skills.startsWith('[') ? parseSkills(editForm.skills)[0] || '' : editForm.skills) : ''}
                      onChange={e => setEditForm(p => ({ ...p, skills: e.target.value }))}
                    >
                      <option value="">— Select Level —</option>
                      <option value="JUNIOR LEVEL">JUNIOR LEVEL</option>
                      <option value="MID LEVEL">MID LEVEL</option>
                      <option value="SENIOR LEVEL">SENIOR LEVEL</option>
                      <option value="LEAD LEVEL">LEAD LEVEL</option>
                      <option value="SUPERVISOR LEVEL">SUPERVISOR LEVEL</option>
                      <option value="EXECUTIVE LEVEL">EXECUTIVE LEVEL</option>
                    </select>
                  </Field>
                </div>

                {/* Active Status */}
                <div className="flex items-center gap-3 p-3 rounded-xl border mt-2" style={{ borderColor: border }}>
                  <div className="flex-1">
                    <div className="text-sm font-bold" style={{ color: textPrimary }}>Account Status</div>
                    <div className="text-xs" style={{ color: textMuted }}>Toggle to enable or disable login access</div>
                  </div>
                  <button
                    type="button"
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
                <div className="border-t pt-4" style={{ borderColor: border }}>
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
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center gap-3 shrink-0" style={{ borderColor: border }}>
              <button onClick={() => setEditTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all hover:opacity-85" style={{ borderColor: border, color: textMuted, backgroundColor: 'transparent' }}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: isLight ? 'rgba(241,245,249,0.96)' : 'rgba(6,11,24,0.96)', backdropFilter: 'blur(12px)' }}>
         <div className="w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: border }}>
              <h3 className="font-black text-base" style={{ color: textPrimary }}>Add New Account</h3>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-xl hover:bg-slate-500/10" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col md:flex-row gap-8">
              {/* Left Column: Profile Pic Holder */}
              <div className="w-full md:w-72 flex flex-col items-center gap-5 text-center shrink-0 border-b md:border-b-0 md:border-r pb-8 md:pb-0 pr-0 md:pr-8" style={{ borderColor: border }}>
                <div className="text-[10px] font-black uppercase tracking-widest self-start" style={{ color: textMuted }}>Profile Photo</div>
                
                <div 
                  onClick={() => document.getElementById('create-modal-photo')?.click()}
                  className="w-48 h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden relative group cursor-pointer transition-all hover:bg-slate-500/5 hover:border-emerald-500" 
                  style={{ borderColor: border, backgroundColor: inputBg }}
                >
                  {createForm.profileImage ? (
                    <>
                      <img src={resolveImageUrl(createForm.profileImage)} alt="Profile Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1.5 transition-opacity duration-200 text-white">
                        <Camera className="w-6 h-6 text-white" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white">Change Photo</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400 p-4">
                      <div className="w-12 h-12 rounded-full bg-slate-500/10 flex items-center justify-center">
                        <Plus className="w-6 h-6 text-slate-400" />
                      </div>
                      <span className="text-xs font-bold" style={{ color: textMuted }}>Click to Upload</span>
                      <span className="text-[9px]" style={{ color: textMuted }}>PNG, JPG or WEBP</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 w-full">
                  <input
                    type="file"
                    id="create-modal-photo"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 2 * 1024 * 1024) {
                        alert("Image must be smaller than 2MB")
                        return
                      }
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setCreateForm(p => ({ ...p, profileImage: reader.result as string }))
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => document.getElementById('create-modal-photo')?.click()}
                    className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/10 w-full text-center"
                    style={{ borderColor: border, color: textPrimary }}
                  >
                    Upload Photo
                  </button>
                  {createForm.profileImage && (
                    <button
                      type="button"
                      onClick={() => setCreateForm(p => ({ ...p, profileImage: '' }))}
                      className="text-xs text-red-500 font-bold hover:underline"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Input Fields Form */}
              <div className="flex-1 flex flex-col gap-5">
                {formErr && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-semibold">{formErr}</div>}

                {/* ── General Credentials ── */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">General Credentials</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Full Name" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="Juan Dela Cruz" />
                    </Field>
                    <Field label="Login Email" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="juan@ashcol.com.ph" />
                    </Field>
                    <Field label="Phone" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={createForm.phone} onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XXXXXXXXX" />
                    </Field>
                    <Field label="Personal Email" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} type="email" value={createForm.personalEmail} onChange={e => setCreateForm(p => ({ ...p, personalEmail: e.target.value }))} placeholder="personal@email.com" />
                    </Field>
                  </div>
                </div>

                {/* ── Role & Placement ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">Role & Placement</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {isAdmin && (
                      <Field label="Branch" labelColor={textMuted}>
                        <select className={inputCls} style={inputStyle} value={createForm.branchId} onChange={e => setCreateForm(p => ({ ...p, branchId: e.target.value }))}>
                          <option value="">— Select branch —</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </Field>
                    )}
                    <Field label="System Role" labelColor={textMuted}>
                      <select className={inputCls} style={inputStyle} value={createForm.role}
                        onChange={e => setCreateForm(p => ({ ...p, role: e.target.value, jobTitle: e.target.value === 'EMPLOYEE' ? 'TECHNICIAN' : '' }))}>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="MANAGER">Office In Charge</option>
                        {isAdmin && <option value="ADMIN">Manager (Admin)</option>}
                      </select>
                    </Field>
                    {createForm.role === 'EMPLOYEE' && (
                      <div className="col-span-1 sm:col-span-2">
                        <Field label="Job Title" labelColor={textMuted}>
                          <select className={inputCls} style={inputStyle} value={createForm.jobTitle} onChange={e => setCreateForm(p => ({ ...p, jobTitle: e.target.value }))}>
                            {allJobTitles.map(title => (
                              <option key={title} value={title}>{title}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Address Details ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">Address Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Region" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={createForm.region} onChange={e => setCreateForm(p => ({ ...p, region: e.target.value }))} placeholder="e.g. NCR" />
                    </Field>
                    <Field label="City" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={createForm.city} onChange={e => setCreateForm(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Pasig" />
                    </Field>
                    <Field label="Barangay" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={createForm.barangay} onChange={e => setCreateForm(p => ({ ...p, barangay: e.target.value }))} placeholder="e.g. San Jose" />
                    </Field>
                    <Field label="Street" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={createForm.street} onChange={e => setCreateForm(p => ({ ...p, street: e.target.value }))} placeholder="e.g. 123 Ruby St." />
                    </Field>
                    <div className="col-span-1 sm:col-span-2">
                      <Field label="Landmark Description" labelColor={textMuted}>
                        <input className={inputCls} style={inputStyle} value={createForm.landmark} onChange={e => setCreateForm(p => ({ ...p, landmark: e.target.value }))} placeholder="e.g. Near Brgy Hall" />
                      </Field>
                    </div>
                  </div>
                </div>

                {/* ── Role Level ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">Role Level</h4>
                  <Field label="Employee Role Level" labelColor={textMuted}>
                    <select
                      className={inputCls}
                      style={inputStyle}
                      value={createForm.skills}
                      onChange={e => setCreateForm(p => ({ ...p, skills: e.target.value }))}
                    >
                      <option value="">— Select Level —</option>
                      <option value="JUNIOR LEVEL">JUNIOR LEVEL</option>
                      <option value="MID LEVEL">MID LEVEL</option>
                      <option value="SENIOR LEVEL">SENIOR LEVEL</option>
                      <option value="LEAD LEVEL">LEAD LEVEL</option>
                      <option value="SUPERVISOR LEVEL">SUPERVISOR LEVEL</option>
                      <option value="EXECUTIVE LEVEL">EXECUTIVE LEVEL</option>
                    </select>
                  </Field>
                </div>

                <p className="text-xs rounded-xl p-3 border mt-2" style={{ color: textMuted, borderColor: border, backgroundColor: inputBg }}>
                  A temporary password will be auto-generated and emailed. You'll also see it here to copy immediately after creation.
                </p>
              </div>

            </div>

            <div className="px-6 py-4 border-t flex gap-3 shrink-0" style={{ borderColor: border }}>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all hover:opacity-85" style={{ borderColor: border, color: textMuted }}>Cancel</button>
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

      {/* CSS Keyframes inline inject for animations */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

    </div>
  )
}
