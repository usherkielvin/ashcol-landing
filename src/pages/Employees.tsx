import { useState, useEffect, useRef } from 'react'
import {
  Search, Wrench, Mail, Phone, RefreshCw, Building2,
  CheckCircle, XCircle, Pencil, Trash2, X, Plus, Copy,
  Check, Eye, EyeOff, ShieldCheck,
  Camera, Calendar, Tag, User,
  ChevronDown, ChevronUp,
  Loader2
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import UserAvatar from '../components/UserAvatar'
import { API_BASE_URL, resolveImageUrl, isSystemAdmin, readApiError, formatPersonName, notifyEmployeesDirectoryUpdated } from '../utils/api'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'

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
const DEFAULT_JOB_TITLES = ['TECHNICIAN', 'HELPER', 'DRIVER', 'COORDINATOR', 'SALES EXECUTIVE', 'WARRANTY REGISTRAR', 'WARRANTY REGISTRATOR']

type AssignableRole = 'EMPLOYEE' | 'MANAGER' | 'MANAGEMENT'

const ROLE_META: Record<AssignableRole, {
  label: string
  hint: string
  requiresBranch: boolean
  requiresJobTitle: boolean
  canDelete: boolean
}> = {
  EMPLOYEE: {
    label: 'Employee',
    hint: 'Field or office staff with a job title. Branch-scoped portal access.',
    requiresBranch: false,
    requiresJobTitle: true,
    canDelete: true,
  },
  MANAGER: {
    label: 'Office In Charge',
    hint: 'Branch OIC — manages branch team, lineup, and approvals. Requires a branch.',
    requiresBranch: true,
    requiresJobTitle: false,
    canDelete: true,
  },
  MANAGEMENT: {
    label: 'Management',
    hint: 'All-branch portal access (same Active Branch switcher as admin).',
    requiresBranch: false,
    requiresJobTitle: true,
    canDelete: false,
  },
}

const ROLE_FILTER_OPTS = ['all', 'EMPLOYEE', 'MANAGER', 'MANAGEMENT'] as const
type RoleFilter = typeof ROLE_FILTER_OPTS[number]

const isProtectedFromDelete = (role: string) => {
  const r = role.toUpperCase()
  return r === 'ADMIN' || r === 'MANAGEMENT'
}

const isProtectedFromEdit = (role: string) => role.toUpperCase() === 'ADMIN'

const formatRoleLabel = (role: string) => {
  const key = role.toUpperCase() as AssignableRole
  return ROLE_META[key]?.label || role
}

const describeRoleChange = (fromRole: string, toRole: string) => {
  const from = formatRoleLabel(fromRole)
  const to = formatRoleLabel(toRole)
  const toMeta = ROLE_META[toRole.toUpperCase() as AssignableRole]
  let detail = `${from} → ${to}.`
  if (toMeta?.requiresBranch) detail += ' A branch assignment is required.'
  if (toMeta?.requiresJobTitle) detail += ' A job title will be kept or set.'
  if (fromRole.toUpperCase() === 'MANAGER' && toRole.toUpperCase() !== 'MANAGER') {
    detail += ' This user will be unlinked as branch OIC.'
  }
  if (toRole.toUpperCase() === 'MANAGER') {
    detail += ' This user will become the OIC for the selected branch.'
  }
  if (toRole.toUpperCase() === 'MANAGEMENT') {
    detail += ' They will get all-branch portal access with the Active Branch switcher (not locked to one branch).'
  }
  return detail
}

const adaptEditFormForRole = (
  prev: { role: string; jobTitle: string; branchId: string },
  newRole: string,
) => {
  const roleUpper = newRole.toUpperCase()
  if (roleUpper === 'MANAGEMENT') {
    return {
      role: newRole,
      jobTitle: prev.jobTitle || 'WARRANTY REGISTRAR',
      branchId: '',
    }
  }
  const meta = ROLE_META[roleUpper as AssignableRole]
  if (!meta) return { role: newRole }
  return {
    role: newRole,
    jobTitle: meta.requiresJobTitle ? (prev.jobTitle || 'TECHNICIAN') : '',
    branchId: prev.branchId,
  }
}

const resolveLabel = (role: string, jobTitle: string) => {
  const r = role.toUpperCase()
  if (jobTitle?.trim()) return formatJobTitleLabel(jobTitle)
  if (r === 'ADMIN') return 'Admin'
  if (r === 'MANAGEMENT') return 'Management'
  if (r === 'MANAGER') return 'Office In Charge'
  return formatRoleLabel(role)
}

const roleColor = (role: string) => {
  switch (role.toUpperCase()) {
    case 'ADMIN':      return { bg: 'rgba(139,92,246,0.12)', text: '#8B5CF6', border: 'rgba(139,92,246,0.25)' }
    case 'MANAGEMENT': return { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', border: 'rgba(245,158,11,0.25)' }
    case 'MANAGER':    return { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6', border: 'rgba(59,130,246,0.25)' }
    default:           return { bg: 'rgba(16,185,129,0.10)', text: '#10B981', border: 'rgba(16,185,129,0.20)' }
  }
}

const formatBranchLabel = (name: string) => {
  if (!name?.trim()) return ''
  return name
    .replace(/^ashcol\s+/i, '')
    .trim()
    .split(/\s*[-–]\s*/)
    .map(segment => segment
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase()))
    .join(' – ')
}

const formatJobTitleLabel = (title: string) => {
  if (!title?.trim()) return ''
  return title
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
}

const formatRoleLevelLabel = (level: string) => {
  if (!level?.trim() || level === '—') return '—'
  return formatJobTitleLabel(level.replace(/_/g, ' '))
}

const CREATE_STEPS = [
  { id: 1 as const, label: 'Account', hint: 'Name and login details' },
  { id: 2 as const, label: 'Role', hint: 'Role and branch' },
  { id: 3 as const, label: 'Details', hint: 'Optional profile info' },
]

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
  return list[0] ? formatRoleLevelLabel(list[0]) : '—'
}

// ── Input helper ────────────────────────────────────────────────────────────
interface FieldProps {
  label: string
  children: React.ReactNode
  labelColor: string
}

const Field = ({ label, children, labelColor }: FieldProps) => (
  <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
    <label className="text-xs font-medium" style={{ color: labelColor }}>{label}</label>
    {children}
  </div>
)

interface DetailFieldProps {
  label: string
  value: string
  icon?: React.ReactNode
  emptyLabel?: string
}

const DetailField = ({ label, value, icon, emptyLabel = 'Not set' }: DetailFieldProps) => (
  <div className="p-4 rounded-xl border flex items-start gap-3" style={{ borderColor: 'var(--detail-border)', backgroundColor: 'var(--detail-bg)' }}>
    {icon && (
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border" style={{ borderColor: 'var(--detail-border)', backgroundColor: 'var(--detail-icon-bg)', color: 'var(--detail-muted)' }}>
        {icon}
      </div>
    )}
    <div className="min-w-0 flex-1">
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--detail-muted)' }}>{label}</div>
      <div className="text-sm leading-relaxed break-words" style={{ color: value ? 'var(--detail-text)' : 'var(--detail-muted)', fontWeight: value ? 400 : 400 }}>
        {value || emptyLabel}
      </div>
    </div>
  </div>
)

// ── Component ─────────────────────────────────────────────────────────────────
export default function Employees() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight  = theme === 'light'
  const isAdmin   = isSystemAdmin(user?.role)
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
  const [activeDrawerTab, setActiveDrawerTab] = useState<'overview' | 'history'>('overview')
  const [employeeTicketHistory, setEmployeeTicketHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('')
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI Filters
  const [search,    setSearch]    = useState('')
  const [tabFilter, setTabFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')

  // Feedback
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 4500)
  }

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
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1)

  const token = () => localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''

  const resetCreateFlow = () => {
    setShowCreate(false)
    setCreateStep(1)
    setFormErr('')
    setCreateForm({
      name: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
      phone: '', personalEmail: '', region: '', city: '', barangay: '', street: '',
      landmark: '', skills: '', profileImage: '',
    })
  }

  const openCreateFlow = () => {
    setCreateStep(1)
    setFormErr('')
    setCreateForm({
      name: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
      phone: '', personalEmail: '', region: '', city: '', barangay: '', street: '',
      landmark: '', skills: '', profileImage: '',
    })
    setShowCreate(true)
  }

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

  useEffect(() => {
    if (activeDrawerTab !== 'history' || !selectedEmployee) {
      setEmployeeTicketHistory([])
      return
    }
    const fetchHistory = async () => {
      setLoadingHistory(true)
      try {
        const headers = { Authorization: `Bearer ${token()}` }
        const isAdminOrMgmt = user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'MANAGEMENT'
        const endpoint = isAdminOrMgmt ? `${API_BASE_URL}/tickets?size=1000` : `${API_BASE_URL}/tickets/branch?size=1000`
        const res = await fetch(endpoint, { headers })
        if (!res.ok) return
        const data = await res.json()
        const tickets: any[] = data?.data?.tickets || data?.data?.content || data?.data || []
        
        const nameNorm = selectedEmployee.name.toLowerCase().trim()
        const empId = selectedEmployee.id
        const empEmail = selectedEmployee.email.toLowerCase().trim()
        const empPersonalEmail = (selectedEmployee.personalEmail || '').toLowerCase().trim()

        const relevant = tickets.filter((t: any) => {
          // 1. Created by this employee
          if (t.customerId === empId) return true
          if (t.createdBy && t.createdBy.toLowerCase().trim() === nameNorm) return true

          // 2. Negotiator
          if (t.negotiatorId === empId) return true
          if (t.negotiatorName && t.negotiatorName.toLowerCase().trim() === nameNorm) return true

          // 3. Assignee / Installer / Driver
          if (t.assignedTo === empId) return true
          if (t.assignedEmployeeName && t.assignedEmployeeName.toLowerCase().trim() === nameNorm) return true
          if (t.installerId === empId) return true
          if (t.installerName && t.installerName.toLowerCase().trim() === nameNorm) return true

          // 4. Closed by
          if (t.closedBy === empId) return true
          if (t.closedBy && t.closedBy.toLowerCase().trim() === nameNorm) return true
          if (t.closedBy && t.closedBy.toLowerCase().trim() === empEmail) return true

          // 5. Warranty registration completed by
          if (t.warrantyRegistrationCompletedBy === empId) return true
          if (t.warrantyRegistrationCompletedBy && t.warrantyRegistrationCompletedBy.toLowerCase().trim() === nameNorm) return true

          // 6. Emails match
          const customerEmail = (t.customerEmail || '').toLowerCase().trim()
          if (customerEmail && (customerEmail === empEmail || (empPersonalEmail && customerEmail === empPersonalEmail))) return true

          return false
        })

        relevant.sort((a: any, b: any) => {
          const da = a.updatedAt || a.updated_at || a.createdAt || a.created_at || ''
          const db = b.updatedAt || b.updated_at || b.createdAt || b.created_at || ''
          return db.localeCompare(da)
        })
        setEmployeeTicketHistory(relevant)
      } catch (err) {
        console.error('Error loading employee ticket history:', err)
      } finally {
        setLoadingHistory(false)
      }
    }
    fetchHistory()
  }, [activeDrawerTab, selectedEmployee, user])

  // ── Data Loaders ────────────────────────────────────────────────────────────
  const fetchBranches = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token()}` } })
      if (!res.ok) return
      const data = await res.json()
      const list: { id: string; name: string }[] = data?.data || []
      const result: BranchOption[] = []
      for (const b of list) {
        const clean = formatBranchLabel(b.name)
        if (b.id === 'BR-TAGUIG-SALES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') {
          if (!result.some(item => item.id === 'BR-TAGUIG-SALES')) {
            result.push({ id: 'BR-TAGUIG-SALES', name: 'Taguig – Sales' })
          }
        } else if (b.id === 'BR-TAGUIG-SERVICES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-services' || b.id === 'BR-TAGUIG-SALES-services') {
          if (!result.some(item => item.id === 'BR-TAGUIG-SERVICES')) {
            result.push({ id: 'BR-TAGUIG-SERVICES', name: 'Taguig – Services' })
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
      const [resEmp, resMgr, resMgmt] = await Promise.all([
        fetch(`${API_BASE_URL}/user/all?role=EMPLOYEE`, { headers: h }),
        isAdmin ? fetch(`${API_BASE_URL}/user/all?role=MANAGER`, { headers: h }).catch(() => null) : null,
        isAdmin ? fetch(`${API_BASE_URL}/user/all?role=MANAGEMENT`, { headers: h }).catch(() => null) : null,
      ])
      const empList  = resEmp.ok ? ((await resEmp.json())?.data || []) : []
      const mgrList  = resMgr && resMgr.ok ? ((await resMgr.json())?.data || []) : []
      const mgmtList = resMgmt && resMgmt.ok ? ((await resMgmt.json())?.data || []) : []
      const combined = [...empList, ...mgrList, ...mgmtList]

      // Build branch map
      const branchMap: Record<string, string> = {}
      try {
        const rb = await fetch(`${API_BASE_URL}/branches`, { headers: h })
        if (rb.ok) {
          const bl = (await rb.json())?.data || []
          bl.forEach((b: any) => {
            if (!b.id) return
            const clean = formatBranchLabel(b.name || b.id)
            if (b.id === 'BR-TAGUIG-SALES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') {
              branchMap[b.id] = 'Taguig – Sales'
              branchMap[`${b.id}-sales`] = 'Taguig – Sales'
              branchMap['BR-TAGUIG-SALES-sales'] = 'Taguig – Sales'
            } else if (b.id === 'BR-TAGUIG-SERVICES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-services' || b.id === 'BR-TAGUIG-SALES-services') {
              branchMap[b.id] = 'Taguig – Services'
              branchMap[`${b.id}-services`] = 'Taguig – Services'
              branchMap['BR-TAGUIG-SALES-services'] = 'Taguig – Services'
            } else {
              branchMap[b.id] = clean
            }
          })
        }
      } catch { /* silent */ }

      setEmployees(combined.map((s: any) => {
        const isMgmtOrAdmin = s.role?.toUpperCase() === 'MANAGEMENT' || s.role?.toUpperCase() === 'ADMIN'
        return {
          id:          s.id,
          name:        formatPersonName(s.name || 'Unknown'),
          email:       s.email       || '',
          phone:       s.phone       || '',
          role:        (s.role       || 'EMPLOYEE').toUpperCase(),
          jobTitle:    isMgmtOrAdmin ? (s.jobTitle || 'WARRANTY REGISTRAR') : (s.jobTitle || ''),
          branchId:    s.branchId    || '',
          branchName:  isMgmtOrAdmin ? 'ALL BRANCHES' : (s.branchId ? (branchMap[s.branchId] || s.branchId) : ''),
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
        }
      }))
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
  const validateAccountForm = (
    form: { name: string; email: string; role: string; jobTitle: string; branchId: string },
    options: { requireBranchForAdmin?: boolean } = {},
  ) => {
    if (!form.name.trim()) return 'Name is required.'
    if (!form.email.trim()) return 'Login email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.'
    const roleUpper = form.role.toUpperCase()
    const meta = ROLE_META[roleUpper as AssignableRole]
    if (meta?.requiresBranch && !form.branchId.trim()) {
      return `${meta.label} must be assigned to a branch.`
    }
    if (meta?.requiresJobTitle && !form.jobTitle.trim()) {
      return 'Job title is required for this role.'
    }
    if (options.requireBranchForAdmin && roleUpper !== 'MANAGEMENT' && !form.branchId.trim()) {
      return 'Branch is required.'
    }
    return ''
  }

  const validateCreateStep = (step: 1 | 2 | 3): string => {
    if (step === 1) {
      if (!createForm.name.trim()) return 'Name is required.'
      if (!createForm.email.trim()) return 'Login email is required.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) return 'Enter a valid email address.'
      if (createForm.personalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.personalEmail.trim())) {
        return 'Enter a valid personal email address.'
      }
      return ''
    }
    if (step === 2) {
      const roleUpper = createForm.role.toUpperCase()
      const meta = ROLE_META[roleUpper as AssignableRole]
      if (meta?.requiresBranch && !createForm.branchId.trim()) {
        return `${meta.label} must be assigned to a branch.`
      }
      if (isAdmin && roleUpper !== 'MANAGEMENT' && !createForm.branchId.trim()) {
        return 'Branch is required.'
      }
      if (meta?.requiresJobTitle && !createForm.jobTitle.trim()) {
        return 'Job title is required for this role.'
      }
    }
    return ''
  }

  const handleCreateNext = () => {
    const err = validateCreateStep(createStep)
    if (err) { setFormErr(err); return }
    setFormErr('')
    setCreateStep(prev => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev))
  }

  const mapApiUserToEmployee = (s: any, branchMap: Record<string, string>): Employee => {
    const isMgmtOrAdmin = s.role?.toUpperCase() === 'MANAGEMENT' || s.role?.toUpperCase() === 'ADMIN'
    return {
      id: s.id,
      name: formatPersonName(s.name || 'Unknown'),
      email: s.email || '',
      phone: s.phone || '',
      role: (s.role || 'EMPLOYEE').toUpperCase(),
      jobTitle: isMgmtOrAdmin ? (s.jobTitle || 'WARRANTY REGISTRAR') : (s.jobTitle || ''),
      branchId: s.branchId || '',
      branchName: isMgmtOrAdmin ? 'ALL BRANCHES' : (s.branchId ? (branchMap[s.branchId] || s.branchId) : ''),
      isActive: s.isActive !== false,
      profileImage: s.profileImage,
      personalEmail: s.personalEmail || '',
      region: s.region || '',
      city: s.city || '',
      barangay: s.barangay || '',
      street: s.street || '',
      landmark: s.landmark || '',
      skills: s.skills || '',
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }
  }

  const upsertEmployeeInList = (updated: Employee) => {
    setEmployees(prev => {
      const idx = prev.findIndex(e => e.id === updated.id)
      if (idx < 0) return [...prev, updated]
      const next = [...prev]
      next[idx] = updated
      return next
    })
  }
  const openEdit = (emp: Employee) => {
    if (isProtectedFromEdit(emp.role)) {
      showToast('error', 'System admin accounts cannot be edited here.')
      return
    }
    const jt = (emp.jobTitle || '').toUpperCase()
    const validJt = allJobTitles.includes(jt) ? jt : (jt || 'TECHNICIAN')
    setEditForm({
      name: formatPersonName(emp.name), email: emp.email, phone: emp.phone,
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

  const executeSaveEdit = async () => {
    if (!editTarget) return
    const validationErr = validateAccountForm(editForm)
    if (validationErr) { setFormErr(validationErr); return }
    setSaving(true); setFormErr('')
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/admin/users/${editTarget.id}`
        : `${API_BASE_URL}/manager/employees/${editTarget.id}`

      const skillsArray = editForm.skills
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
      const skillsJson = JSON.stringify(skillsArray)

      const payload: Record<string, unknown> = {
        name: formatPersonName(editForm.name.trim()),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        branchId: editForm.branchId,
        role: editForm.role,
        jobTitle: (editForm.role === 'EMPLOYEE' || editForm.role === 'MANAGEMENT') ? editForm.jobTitle : '',
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
        setFormErr(await readApiError(res))
        return
      }

      const body = await res.json().catch(() => ({}))
      const savedUser = body?.data

      if (editForm.isActive !== editTarget.isActive) {
        const toggleUrl = isAdmin
          ? `${API_BASE_URL}/admin/users/${editTarget.id}/toggle-active`
          : `${API_BASE_URL}/manager/employees/${editTarget.id}/toggle-active`
        const toggleRes = await fetch(toggleUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token()}` },
        })
        if (!toggleRes.ok) {
          setFormErr(await readApiError(toggleRes))
          fetchEmployees()
          return
        }
      }

      const branchMap: Record<string, string> = {}
      branches.forEach(b => { branchMap[b.id] = b.name })
      const refreshed = savedUser
        ? mapApiUserToEmployee({ ...savedUser, isActive: editForm.isActive }, branchMap)
        : mapApiUserToEmployee({
            ...editTarget,
            ...payload,
            isActive: editForm.isActive,
            skills: skillsJson,
            role: editForm.role,
            jobTitle: editForm.jobTitle,
            branchId: editForm.branchId,
          }, branchMap)

      upsertEmployeeInList(refreshed)
      if (selectedEmployee?.id === editTarget.id) {
        setSelectedEmployee(refreshed)
      }

      const roleChanged = editForm.role !== editTarget.role
      setEditTarget(null)
      notifyEmployeesDirectoryUpdated()
      showToast('success', roleChanged
        ? `${refreshed.name} updated — role changed to ${formatRoleLabel(editForm.role)}.`
        : `${refreshed.name} saved successfully.`)
    } catch {
      setFormErr('Network error. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEdit = () => {
    if (!editTarget) return
    const validationErr = validateAccountForm(editForm)
    if (validationErr) { setFormErr(validationErr); return }

    if (editForm.role !== editTarget.role) {
      setConfirmDialog({
        title: 'Confirm role change',
        message: `Change ${editTarget.name}'s system role?`,
        detail: describeRoleChange(editTarget.role, editForm.role),
        variant: 'info',
        confirmText: 'Save changes',
        onConfirm: () => {
          setConfirmDialog(null)
          executeSaveEdit()
        },
      })
      return
    }
    executeSaveEdit()
  }

  const requestToggleActive = (emp: Employee) => {
    if (isProtectedFromEdit(emp.role)) {
      showToast('error', 'System admin accounts cannot be deactivated.')
      return
    }
    const nextActive = !emp.isActive
    if (!nextActive) {
      setConfirmDialog({
        title: 'Deactivate account',
        message: `Deactivate ${emp.name}?`,
        detail: 'They will not be able to sign in until reactivated.',
        variant: 'discard',
        confirmText: 'Deactivate',
        onConfirm: () => {
          setConfirmDialog(null)
          handleToggleActive(emp)
        },
      })
      return
    }
    handleToggleActive(emp)
  }

  const handleToggleActive = async (emp: Employee) => {
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/admin/users/${emp.id}/toggle-active`
        : `${API_BASE_URL}/manager/employees/${emp.id}/toggle-active`
      const res = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${token()}` } })
      if (!res.ok) {
        showToast('error', await readApiError(res))
        return
      }
      const nextActive = !emp.isActive
      const updated = { ...emp, isActive: nextActive }
      upsertEmployeeInList(updated)
      if (selectedEmployee?.id === emp.id) {
        setSelectedEmployee(updated)
      }
      showToast('success', nextActive ? `${emp.name} reactivated.` : `${emp.name} deactivated.`)
    } catch {
      showToast('error', 'Could not update account status.')
    }
  }

  const requestDelete = (emp: Employee) => {
    if (isProtectedFromDelete(emp.role)) {
      showToast('error', 'This account type cannot be deleted from the directory.')
      return
    }
    setDeleteTarget(emp)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteSaving(true)
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/admin/users/${deleteTarget.id}`
        : `${API_BASE_URL}/manager/employees/${deleteTarget.id}`
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
      if (!res.ok) {
        showToast('error', await readApiError(res))
        return
      }
      if (selectedEmployee?.id === deleteTarget.id) {
        setIsDrawerOpen(false)
        setSelectedEmployee(null)
      }
      setEmployees(prev => prev.filter(e => e.id !== deleteTarget.id))
      showToast('success', `${deleteTarget.name} removed.`)
      setDeleteTarget(null)
    } catch {
      showToast('error', 'Could not delete account.')
    } finally {
      setDeleteSaving(false)
    }
  }

  const handleCreate = async () => {
    const validationErr = validateCreateStep(1) || validateCreateStep(2) || validateAccountForm(createForm, { requireBranchForAdmin: isAdmin })
    if (validationErr) { setFormErr(validationErr); return }
    setCreateSaving(true); setFormErr('')
    try {
      const formattedName = formatPersonName(createForm.name.trim())
      const url = isAdmin ? `${API_BASE_URL}/admin/technicians` : `${API_BASE_URL}/manager/employees`
      const isPriv = createForm.role === 'MANAGER' || createForm.role === 'MANAGEMENT'
      const body: Record<string, string> = {
        name:     formattedName,
        email:    createForm.email.trim(),
        role:     isPriv ? createForm.role : 'EMPLOYEE',
        jobTitle: (createForm.role === 'EMPLOYEE' || createForm.role === 'MANAGEMENT') ? createForm.jobTitle : '',
      }
      if (isAdmin && createForm.role !== 'MANAGEMENT') body.branchId = createForm.branchId.trim()
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormErr(typeof data?.message === 'string' ? data.message : 'Could not create account.')
        return
      }
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
      notifyEmployeesDirectoryUpdated()
      showToast('success', `${formattedName} created as ${formatRoleLabel(createForm.role)}.`)
      resetCreateFlow()
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
    if (roleFilter !== 'all' && e.role.toUpperCase() !== roleFilter) return false
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

  const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm font-normal outline-none transition-all focus:ring-2 focus:ring-emerald-500/20"
  const inputStyle = { backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textPrimary }
  const detailTokens = {
    '--detail-border': border,
    '--detail-bg': inputBg,
    '--detail-icon-bg': cardBg,
    '--detail-muted': textMuted,
    '--detail-text': textPrimary,
  } as React.CSSProperties

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3" style={{ minHeight: '100vh', backgroundColor: pageBg, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {toast && (
        <div
          className="fixed top-4 right-4 z-[70] max-w-sm px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold"
          style={{
            backgroundColor: toast.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            borderColor: toast.type === 'success' ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
            color: toast.type === 'success' ? '#10B981' : '#EF4444',
          }}
        >
          {toast.message}
        </div>
      )}
      
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
              onClick={openCreateFlow}
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
              <span key={title} className="text-xs font-medium px-2 py-1 rounded text-emerald-600 bg-emerald-500/10 border border-emerald-500/20">{formatJobTitleLabel(title)}</span>
            ))}
          </div>

          {customJobTitles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border" style={{ borderColor: border, color: textMuted }}>Custom:</span>
              {customJobTitles.map(title => (
                <span key={title} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded text-blue-600 bg-blue-500/10 border border-blue-500/20">
                  {formatJobTitleLabel(title)}
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

          {isAdmin && (
            <div className="flex rounded-lg border overflow-hidden shrink-0" style={{ borderColor: border }}>
              {ROLE_FILTER_OPTS.map(r => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap"
                  style={{
                    backgroundColor: roleFilter === r ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: roleFilter === r ? '#3B82F6' : textMuted,
                  }}
                >
                  {r === 'all' ? 'All roles' : formatRoleLabel(r)}
                </button>
              ))}
            </div>
          )}

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
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap" style={{ color: textMuted }}>{h}</th>
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
                        <UserAvatar name={e.name} imageUrl={e.profileImage} size="xs" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate max-w-[150px]" style={{ color: textPrimary }}>{e.name}</div>
                          <div className="text-xs truncate max-w-[150px]" style={{ color: textMuted }}>{e.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium text-blue-600 bg-blue-500/10 border border-blue-500/15 whitespace-nowrap">
                          {getRoleLevel(e.skills)}
                        </span>
                      ) : (
                        <span className="text-[10px] italic" style={{ color: textMuted }}>—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <button
                        onClick={evt => { evt.stopPropagation(); requestToggleActive(e) }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border transition-all"
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
                        {(isAdmin || isManager) && !isProtectedFromEdit(e.role) && (
                          <button
                            onClick={evt => { evt.stopPropagation(); openEdit(e) }}
                            title="Edit"
                            className="p-1.5 rounded transition-all hover:bg-emerald-500/10 hover:text-emerald-500"
                            style={{ color: textMuted }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && !isProtectedFromDelete(e.role) && (
                          <button
                            onClick={evt => { evt.stopPropagation(); requestDelete(e) }}
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

      {/* ── Center Detail Modal (Redesigned) ── */}
      {isDrawerOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: isLight ? 'rgba(241,245,249,0.96)' : 'rgba(6,11,24,0.96)', backdropFilter: 'blur(12px)' }}>
          <div className="absolute inset-0" onClick={() => setIsDrawerOpen(false)} />

          <div
            className="w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden relative"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
              animation: 'modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between shrink-0" style={{ borderColor: border }}>
              <div className="flex items-center gap-3">
                <div className="relative group shrink-0">
                  <UserAvatar name={selectedEmployee.name} imageUrl={selectedEmployee.profileImage} size="md" ring className="" />
                  <div
                    onClick={triggerImageUpload}
                    className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-opacity"
                  >
                    <Camera className="w-4 h-4 text-white" />
                  </div>
                  {imageUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight" style={{ color: textPrimary }}>{selectedEmployee.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: roleColor(selectedEmployee.role).bg, color: roleColor(selectedEmployee.role).text }}>
                      {resolveLabel(selectedEmployee.role, selectedEmployee.jobTitle)}
                    </span>
                    {selectedEmployee.branchName && (
                      <span className="text-[11px] flex items-center gap-1" style={{ color: textMuted }}>
                        <Building2 className="w-3 h-3" />{selectedEmployee.branchName}
                      </span>
                    )}
                    <span className="text-[11px] flex items-center gap-1" style={{ color: selectedEmployee.isActive ? '#10B981' : textMuted }}>
                      {selectedEmployee.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {selectedEmployee.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(isAdmin || isManager) && !isProtectedFromEdit(selectedEmployee.role) && (
                  <button
                    onClick={() => openEdit(selectedEmployee)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:bg-slate-500/10"
                    style={{ borderColor: border, color: textPrimary }}
                  >
                    Edit Profile
                  </button>
                )}
                {isAdmin && !isProtectedFromDelete(selectedEmployee.role) && (
                  <button
                    onClick={() => requestDelete(selectedEmployee)}
                    className="px-3 py-1.5 rounded-lg text-xs font-black text-white bg-red-500 hover:bg-red-600 transition-all"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 rounded-lg transition-all hover:bg-slate-500/10 ml-1"
                  style={{ color: textMuted }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b shrink-0" style={{ borderColor: border }}>
              {(['overview', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveDrawerTab(tab)}
                  className="px-6 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all"
                  style={{
                    borderColor: activeDrawerTab === tab ? '#10B981' : 'transparent',
                    color: activeDrawerTab === tab ? '#10B981' : textMuted,
                  }}
                >
                  {tab === 'overview' ? 'Overview' : 'Ticket History'}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto" style={detailTokens}>

              {/* ── Overview Tab ── */}
              {activeDrawerTab === 'overview' && (
                <div className="p-6 flex flex-col gap-6">

                  {/* Contact Info */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: textMuted }}>Contact Information</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DetailField label="Work email" value={selectedEmployee.email} icon={<Mail className="w-4 h-4" />} emptyLabel="—" />
                      <DetailField label="Personal email" value={selectedEmployee.personalEmail || ''} icon={<Mail className="w-4 h-4" />} emptyLabel="—" />
                      <DetailField label="Phone number" value={selectedEmployee.phone} icon={<Phone className="w-4 h-4" />} emptyLabel="—" />
                    </div>
                  </div>

                  {/* Role & Position */}
                  <div className="border-t pt-5" style={{ borderColor: border }}>
                    <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: textMuted }}>Role & Position</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <DetailField label="System role" value={formatRoleLabel(selectedEmployee.role)} icon={<ShieldCheck className="w-4 h-4" />} />
                      <DetailField label="Job title" value={selectedEmployee.jobTitle ? formatJobTitleLabel(selectedEmployee.jobTitle) : ''} icon={<Wrench className="w-4 h-4" />} emptyLabel="—" />
                      <DetailField label="Level" value={getRoleLevel(selectedEmployee.skills)} icon={<Tag className="w-4 h-4" />} />
                    </div>
                  </div>

                  {/* Account Meta */}
                  <div className="border-t pt-5" style={{ borderColor: border }}>
                    <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: textMuted }}>Account</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DetailField label="Employee ID" value={selectedEmployee.id.slice(0, 16) + '…'} icon={<User className="w-4 h-4" />} />
                      <DetailField
                        label="Registered"
                        value={selectedEmployee.createdAt ? new Date(selectedEmployee.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}
                        icon={<Calendar className="w-4 h-4" />}
                        emptyLabel="Unknown"
                      />
                    </div>
                  </div>

                  {/* Status toggle */}
                  <div className="border-t pt-5" style={{ borderColor: border }}>
                    <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: textMuted }}>Membership Status</div>
                    <button
                      onClick={() => requestToggleActive(selectedEmployee)}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold border transition-all hover:opacity-90"
                      style={selectedEmployee.isActive
                        ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }
                        : { color: textMuted, backgroundColor: inputBg, borderColor: border }}
                    >
                      {selectedEmployee.isActive ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {selectedEmployee.isActive ? 'Active Member — click to deactivate' : 'Deactivated — click to reactivate'}
                    </button>
                  </div>

                </div>
              )}

              {/* ── History Tab ── */}
              {activeDrawerTab === 'history' && (
                <div className="p-6">
                  {/* Date Filter Control */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 p-3 rounded-xl border" style={{ borderColor: border, backgroundColor: inputBg }}>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Filter by Date</span>
                      <span className="text-[11px]" style={{ color: textMuted }}>Show tickets created or updated on:</span>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="date"
                        value={historyDateFilter}
                        onChange={e => setHistoryDateFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        style={{
                          backgroundColor: cardBg,
                          borderColor: border,
                          color: textPrimary
                        }}
                      />
                      {historyDateFilter && (
                        <button
                          onClick={() => setHistoryDateFilter('')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-slate-500/10"
                          style={{
                            color: '#EF4444',
                            border: `1px solid ${border}`
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const displayedHistory = employeeTicketHistory.filter((t: any) => {
                      if (!historyDateFilter) return true
                      
                      const checkDate = (dateStr: string) => {
                        if (!dateStr) return false
                        const d = new Date(dateStr)
                        const yyyy = d.getFullYear()
                        const mm = String(d.getMonth() + 1).padStart(2, '0')
                        const dd = String(d.getDate()).padStart(2, '0')
                        return `${yyyy}-${mm}-${dd}` === historyDateFilter
                      }
                      
                      return checkDate(t.createdAt || t.created_at) || checkDate(t.updatedAt || t.updated_at)
                    })

                    return loadingHistory ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#10B981' }} />
                        <span className="text-xs font-semibold" style={{ color: textMuted }}>Loading ticket history…</span>
                      </div>
                    ) : displayedHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-2xl" style={{ borderColor: border, backgroundColor: inputBg }}>
                        <RefreshCw className="w-8 h-8 mb-3" style={{ color: textMuted }} />
                        <span className="text-sm font-bold" style={{ color: textMuted }}>No ticket history found</span>
                        <span className="text-xs mt-1" style={{ color: textMuted }}>
                          {historyDateFilter ? `No tickets created or updated on ${new Date(historyDateFilter).toLocaleDateString(undefined, { dateStyle: 'medium' })}.` : 'No tickets are associated with this employee.'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: textMuted }}>
                          {displayedHistory.length} tickets found {historyDateFilter && `for ${new Date(historyDateFilter).toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
                        </div>
                        {displayedHistory.map((t: any, idx: number) => {
                          const custName = t.customerName || t.customer_name || '—'
                          const tNum = t.ticketNumber || t.ticket_number || t.controlNumber || t.control_number || t.id?.slice(0, 8) || '—'
                          const status = (t.status || '').toUpperCase()
                          const district = t.district || t.destination || ''
                          const brand = t.brand || ''
                          const date = t.updatedAt || t.updated_at || t.createdAt || t.created_at || ''
                          const dateStr = date ? new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
                          const isInstalled = status === 'INSTALLED' || status === 'COMPLETED'
                          const isActive = status === 'PENDING' || status === 'ASSIGNED' || status === 'SCHEDULED'
                          const statusColor = isInstalled ? '#10B981' : isActive ? '#3B82F6' : status === 'CANCELLED' ? '#EF4444' : textMuted
                          const statusBg = isInstalled ? 'rgba(16,185,129,0.1)' : isActive ? 'rgba(59,130,246,0.1)' : status === 'CANCELLED' ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.08)'
                          return (
                            <div key={t.id || idx}
                              className="p-3.5 rounded-xl border flex items-center gap-4 hover:scale-[1.005] transition-all"
                              style={{ borderColor: border, backgroundColor: idx % 2 === 0 ? inputBg : cardBg }}
                            >
                              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black" style={{ backgroundColor: statusBg, color: statusColor }}>
                                #{tNum.slice(-2)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold truncate" style={{ color: textPrimary }}>{custName}</span>
                                  <span className="text-[10px] font-black uppercase tracking-wider shrink-0 px-2 py-0.5 rounded-full" style={{ backgroundColor: statusBg, color: statusColor }}>{status || '—'}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-[11px]" style={{ color: textMuted }}>
                                  {brand && <span>{brand}</span>}
                                  {district && <span>· {district}</span>}
                                  {dateStr && <span>· {dateStr}</span>}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t flex items-center justify-between shrink-0" style={{ borderColor: border, backgroundColor: isLight ? 'rgba(248,250,252,0.8)' : 'rgba(10,17,32,0.8)' }}>
              <span className="text-[11px]" style={{ color: textMuted }}>ID: {selectedEmployee.id.slice(0, 16)}…</span>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold border transition-all hover:bg-slate-500/10"
                style={{ borderColor: border, color: textMuted }}
              >
                Close
              </button>
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
                <UserAvatar name={editTarget.name} imageUrl={editForm.profileImage} size="sm" className="shrink-0" />
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
                      <input className={inputCls} style={inputStyle} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} onBlur={e => setEditForm(p => ({ ...p, name: formatPersonName(e.target.value) }))} />
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
                  {editTarget && editForm.role !== editTarget.role && (
                    <div className="mb-3 text-xs rounded-xl px-3 py-2.5 border" style={{ borderColor: 'rgba(59,130,246,0.25)', backgroundColor: 'rgba(59,130,246,0.08)', color: '#3B82F6' }}>
                      Role will change: {describeRoleChange(editTarget.role, editForm.role)}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="System Role" labelColor={textMuted}>
                      <select className={inputCls} style={inputStyle}
                        value={editForm.role}
                        onChange={e => setEditForm(p => ({ ...p, ...adaptEditFormForRole(p, e.target.value) }))}
                      >
                        <option value="EMPLOYEE">{ROLE_META.EMPLOYEE.label}</option>
                        <option value="MANAGER">{ROLE_META.MANAGER.label}</option>
                        {isAdmin && <option value="MANAGEMENT">{ROLE_META.MANAGEMENT.label}</option>}
                      </select>
                    </Field>
                    {editForm.role !== 'MANAGEMENT' && (
                      <Field label={ROLE_META[editForm.role as AssignableRole]?.requiresBranch ? 'Branch Assignment *' : 'Branch Assignment'} labelColor={textMuted}>
                        <select className={inputCls} style={inputStyle} value={editForm.branchId} onChange={e => setEditForm(p => ({ ...p, branchId: e.target.value }))}>
                          <option value="">— Unassigned —</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </Field>
                    )}
                    {ROLE_META[editForm.role as AssignableRole]?.hint && (
                      <p className="col-span-1 sm:col-span-2 text-[11px] leading-relaxed" style={{ color: textMuted }}>
                        {ROLE_META[editForm.role as AssignableRole].hint}
                      </p>
                    )}
                    {(editForm.role === 'EMPLOYEE' || editForm.role === 'MANAGEMENT') && (
                      <div className="col-span-1 sm:col-span-2">
                        <Field label="Job Title" labelColor={textMuted}>
                          <select className={inputCls} style={inputStyle} value={editForm.jobTitle} onChange={e => setEditForm(p => ({ ...p, jobTitle: e.target.value }))}>
                            {allJobTitles.map(title => (
                              <option key={title} value={title}>{formatJobTitleLabel(title)}</option>
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
         <div
           className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
           style={{ backgroundColor: cardBg, border: `1px solid ${border}`, animation: 'modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
         >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: border }}>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: textPrimary }}>Create account</h3>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>{CREATE_STEPS.find(s => s.id === createStep)?.hint}</p>
              </div>
              <button onClick={resetCreateFlow} className="p-2 rounded-xl hover:bg-slate-500/10" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 pt-5 pb-2">
              <div className="flex items-center gap-2">
                {CREATE_STEPS.map((step, index) => {
                  const active = createStep === step.id
                  const done = createStep > step.id
                  return (
                    <div key={step.id} className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors"
                        style={{
                          backgroundColor: active || done ? 'rgba(16,185,129,0.15)' : inputBg,
                          color: active || done ? '#10B981' : textMuted,
                          border: `1px solid ${active || done ? 'rgba(16,185,129,0.35)' : border}`,
                        }}
                      >
                        {done ? <Check className="w-3.5 h-3.5" /> : step.id}
                      </div>
                      <div className="min-w-0 hidden sm:block">
                        <div className="text-xs font-medium truncate" style={{ color: active ? textPrimary : textMuted }}>{step.label}</div>
                      </div>
                      {index < CREATE_STEPS.length - 1 && (
                        <div className="h-px flex-1 mx-1" style={{ backgroundColor: done ? 'rgba(16,185,129,0.35)' : border }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {formErr && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">{formErr}</div>
              )}

              {createStep === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="Full name" labelColor={textMuted}>
                      <input
                        className={inputCls}
                        style={inputStyle}
                        value={createForm.name}
                        onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                        onBlur={e => setCreateForm(p => ({ ...p, name: formatPersonName(e.target.value) }))}
                        placeholder="Juan Dela Cruz"
                        autoFocus
                      />
                    </Field>
                  </div>
                  <Field label="Login email" labelColor={textMuted}>
                    <input className={inputCls} style={inputStyle} type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value.trim().toLowerCase() }))} placeholder="juan@ashcol.com.ph" />
                  </Field>
                  <Field label="Personal email" labelColor={textMuted}>
                    <input className={inputCls} style={inputStyle} type="email" value={createForm.personalEmail} onChange={e => setCreateForm(p => ({ ...p, personalEmail: e.target.value.trim().toLowerCase() }))} placeholder="personal@email.com" />
                  </Field>
                  <Field label="Phone" labelColor={textMuted}>
                    <input className={inputCls} style={inputStyle} value={createForm.phone} onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XX XXX XXXX" />
                  </Field>
                </div>
              )}

              {createStep === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="System role" labelColor={textMuted}>
                    <select className={inputCls} style={inputStyle} value={createForm.role}
                      onChange={e => setCreateForm(p => ({ ...p, ...adaptEditFormForRole(p, e.target.value) }))}>
                      <option value="EMPLOYEE">{ROLE_META.EMPLOYEE.label}</option>
                      <option value="MANAGER">{ROLE_META.MANAGER.label}</option>
                      {isAdmin && <option value="MANAGEMENT">{ROLE_META.MANAGEMENT.label}</option>}
                    </select>
                  </Field>
                  {isAdmin && createForm.role !== 'MANAGEMENT' && (
                    <Field label="Branch" labelColor={textMuted}>
                      <select className={inputCls} style={inputStyle} value={createForm.branchId} onChange={e => setCreateForm(p => ({ ...p, branchId: e.target.value }))}>
                        <option value="">Select branch</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </Field>
                  )}
                  {(createForm.role === 'EMPLOYEE' || createForm.role === 'MANAGEMENT') && (
                    <div className="sm:col-span-2">
                      <Field label="Job title" labelColor={textMuted}>
                        <select className={inputCls} style={inputStyle} value={createForm.jobTitle} onChange={e => setCreateForm(p => ({ ...p, jobTitle: e.target.value }))}>
                          {allJobTitles.map(title => (
                            <option key={title} value={title}>{formatJobTitleLabel(title)}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  )}
                  {ROLE_META[createForm.role as AssignableRole]?.hint && (
                    <p className="sm:col-span-2 text-sm leading-relaxed rounded-xl px-4 py-3 border" style={{ color: textMuted, borderColor: border, backgroundColor: inputBg }}>
                      {ROLE_META[createForm.role as AssignableRole].hint}
                    </p>
                  )}
                </div>
              )}

              {createStep === 3 && (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="sm:col-span-2">
                      <Field label="Landmark" labelColor={textMuted}>
                        <input className={inputCls} style={inputStyle} value={createForm.landmark} onChange={e => setCreateForm(p => ({ ...p, landmark: e.target.value }))} placeholder="e.g. Near Brgy Hall" />
                      </Field>
                    </div>
                  </div>
                  <Field label="Role level (optional)" labelColor={textMuted}>
                    <select className={inputCls} style={inputStyle} value={createForm.skills} onChange={e => setCreateForm(p => ({ ...p, skills: e.target.value }))}>
                      <option value="">Select level</option>
                      {['JUNIOR LEVEL', 'MID LEVEL', 'SENIOR LEVEL', 'LEAD LEVEL', 'SUPERVISOR LEVEL', 'EXECUTIVE LEVEL'].map(level => (
                        <option key={level} value={level}>{formatRoleLevelLabel(level)}</option>
                      ))}
                    </select>
                  </Field>
                  <p className="text-sm rounded-xl px-4 py-3 border" style={{ color: textMuted, borderColor: border, backgroundColor: inputBg }}>
                    A temporary password will be emailed automatically. You can copy it on the next screen right after creation.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex gap-3 shrink-0" style={{ borderColor: border }}>
              <button onClick={resetCreateFlow} className="px-4 py-2.5 rounded-xl text-sm font-medium border transition-all hover:opacity-85" style={{ borderColor: border, color: textMuted }}>Cancel</button>
              {createStep > 1 && (
                <button
                  onClick={() => { setFormErr(''); setCreateStep(prev => (prev - 1) as 1 | 2 | 3) }}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border transition-all hover:opacity-85"
                  style={{ borderColor: border, color: textPrimary }}
                >
                  Back
                </button>
              )}
              <div className="flex-1" />
              {createStep < 3 ? (
                <button onClick={handleCreateNext} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90" style={{ backgroundColor: '#10B981' }}>
                  Continue
                </button>
              ) : (
                <button onClick={handleCreate} disabled={createSaving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
                  {createSaving ? 'Creating…' : 'Create account'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── New Credentials Modal ── */}
      {newTechCreds && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col gap-5"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, animation: 'modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: textPrimary }}>Account created</h3>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Share these credentials — they won't be shown again.</p>
              </div>
              <button onClick={() => setNewTechCreds(null)} className="p-2 rounded-xl hover:bg-slate-500/10" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>

            {[
              { label: 'Login email', value: newTechCreds.email, field: 'email' as const },
              { label: 'Temporary password', value: newTechCreds.password, field: 'password' as const },
            ].map(row => (
              <div key={row.field}>
                <div className="text-xs font-medium mb-1.5" style={{ color: textMuted }}>{row.label}</div>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-sm px-3 py-2.5 rounded-xl border break-all" style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary, fontFamily: 'ui-monospace, monospace' }}>{row.value}</code>
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

            <button onClick={() => setNewTechCreds(null)} className="w-full py-3 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#10B981' }}>Done</button>
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
              {deleteTarget.role.toUpperCase() === 'MANAGER' && (
                <p className="mt-2 text-amber-500 font-semibold">This user is linked as branch OIC. Deleting will unlink them from the branch.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleteSaving} className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all" style={{ borderColor: border, color: textMuted }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleteSaving} className="flex-1 py-2.5 rounded-xl text-sm font-black text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-50">
                {deleteSaving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />

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
