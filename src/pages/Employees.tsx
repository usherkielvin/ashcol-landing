import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Search, Wrench, Mail, Phone, Building2,
  CheckCircle, XCircle, Trash2, X, Plus, Copy,
  Check, Eye, EyeOff, ShieldCheck,
  Camera, Calendar, User, ArrowLeft,
  Loader2, ChevronDown
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import UserAvatar from '../components/UserAvatar'
import TicketHistoryTable from '../components/TicketHistoryTable'
import { API_BASE_URL, resolveImageUrl, isSystemAdmin, readApiError, formatPersonName, notifyEmployeesDirectoryUpdated } from '../utils/api'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '—'
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`
  }
  return phone
}

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
  dateHired?: string
  birthDate?: string
  createdAt?: string
  updatedAt?: string
}

interface BranchOption { id: string; name: string }

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_JOB_TITLES = ['TECHNICIAN', 'HELPER', 'DRIVER', 'COORDINATOR', 'SALES EXECUTIVE', 'WARRANTY REGISTRAR', 'WARRANTY REGISTRATOR', 'PAYROLL']

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
    label: 'Officer In Charge',
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
  if (r === 'ADMIN') return 'Admin'
  if (r === 'MANAGEMENT') return 'Management'
  if (r === 'MANAGER') return 'Officer In Charge'
  if (jobTitle?.trim()) return formatJobTitleLabel(jobTitle)
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

/** jobTitle is stored as one comma-separated string so an employee can hold multiple roles
 * (e.g. "COORDINATOR, WARRANTY REGISTRAR") without a backend schema change. */
const parseJobTitles = (raw: string): string[] =>
  raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)

const joinJobTitles = (titles: string[]): string => titles.join(', ')

interface JobTitleMultiSelectProps {
  value: string
  onChange: (next: string) => void
  options: string[]
  onAddCustom: (title: string) => void
  inputCls: string
  inputStyle: React.CSSProperties
  textMuted: string
  border: string
}

const JobTitleMultiSelect = ({ value, onChange, options, onAddCustom, inputCls, inputStyle, textMuted, border }: JobTitleMultiSelectProps) => {
  const selected = parseJobTitles(value)
  const [newTitle, setNewTitle] = useState('')

  const toggle = (title: string) => {
    const next = selected.includes(title)
      ? selected.filter(t => t !== title)
      : [...selected, title]
    onChange(joinJobTitles(next))
  }

  const addCustom = () => {
    const title = newTitle.trim().toUpperCase()
    if (!title) return
    if (!options.includes(title)) onAddCustom(title)
    if (!selected.includes(title)) onChange(joinJobTitles([...selected, title]))
    setNewTitle('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-2 p-3 rounded-xl border" style={{ borderColor: border }}>
        {options.map(title => (
          <label key={title} className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: textMuted }}>
            <input
              type="checkbox"
              checked={selected.includes(title)}
              onChange={() => toggle(title)}
              className="accent-emerald-500"
            />
            {formatJobTitleLabel(title)}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          className={inputCls}
          style={inputStyle}
          placeholder="Add a new role (e.g. Warranty Registrar)"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
        />
        <button
          type="button"
          onClick={addCustom}
          className="px-3 rounded-xl text-xs font-bold shrink-0"
          style={{ backgroundColor: '#10B981', color: '#fff' }}
        >
          Add
        </button>
      </div>
    </div>
  )
}


const CREATE_STEPS = [
  { id: 1 as const, label: 'Account', hint: 'Name and login details' },
  { id: 2 as const, label: 'Role', hint: 'Role and branch' },
  { id: 3 as const, label: 'Details', hint: 'Optional profile info' },
]

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
  <div className="min-w-0 flex flex-col gap-1">
    <div className="flex items-center gap-1.5" style={{ color: 'var(--detail-muted)' }}>
      {icon && <span className="shrink-0 opacity-70 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </div>
    <div
      className="text-sm font-semibold truncate"
      style={{ color: value ? 'var(--detail-text)' : 'var(--detail-muted)' }}
      title={value || undefined}
    >
      {value || emptyLabel}
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

  const navigate = useNavigate()
  const { id: routeEmployeeId } = useParams<{ id?: string }>()

  // Custom Job Titles / Role Levels (localStorage)
  const [customJobTitles, setCustomJobTitles] = useState<string[]>([])
  // Detail panel state — now a full tab (routed at /employees/:id) rather than a modal overlay
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const isDrawerOpen = Boolean(routeEmployeeId)
  const [activeDrawerTab, setActiveDrawerTab] = useState<'overview' | 'history'>('overview')
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI Filters
  const [search,    setSearch]    = useState('')
  const [tabFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [roleFilter] = useState<RoleFilter>('all')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const branchDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
    personalEmail: '',
    dateHired: '',
    birthDate: '',
    profileImage: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')

  // Create form
  const [createForm, setCreateForm] = useState({
    name: '', email: '', branchId: '',
    role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
    phone: '', personalEmail: '',
    dateHired: '',
    birthDate: '',
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
      phone: '', personalEmail: '', dateHired: '', birthDate: '', profileImage: '',
    })
  }

  const openCreateFlow = () => {
    setCreateStep(1)
    setFormErr('')
    setCreateForm({
      name: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
      phone: '', personalEmail: '', dateHired: '', birthDate: '', profileImage: '',
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



  const allJobTitles = [...DEFAULT_JOB_TITLES, ...customJobTitles]

  const addCustomJobTitle = (title: string) => {
    const upper = title.trim().toUpperCase()
    if (!upper || allJobTitles.includes(upper)) return
    setCustomJobTitles(prev => {
      const next = [...prev, upper]
      localStorage.setItem('ashcol-custom-job-titles', JSON.stringify(next))
      return next
    })
  }

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
          dateHired:   s.dateHired   || '',
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



  // ── Detail tab navigation ───────────────────────────────────────────────────
  const handleRowClick = (emp: Employee) => {
    setSelectedEmployee(emp)
    setActiveDrawerTab('overview')
    navigate(`/employees/${emp.id}`)
  }

  const closeDetailTab = () => navigate('/employees')

  // Keep the detail tab's employee in sync with the URL (deep link / refresh / back button).
  useEffect(() => {
    if (!routeEmployeeId) {
      setSelectedEmployee(null)
      return
    }
    const found = employees.find(e => e.id === routeEmployeeId)
    if (found) setSelectedEmployee(found)
  }, [routeEmployeeId, employees])

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
      dateHired: s.dateHired || '',
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
    const titles = parseJobTitles(emp.jobTitle || '')
    titles.filter(t => !allJobTitles.includes(t)).forEach(addCustomJobTitle)
    const validJt = titles.length ? joinJobTitles(titles) : 'TECHNICIAN'
    setEditForm({
      name: formatPersonName(emp.name), email: emp.email, phone: emp.phone,
      role: emp.role, jobTitle: validJt,
      branchId: emp.branchId, isActive: emp.isActive, newPassword: '',
      personalEmail: emp.personalEmail || '',
      dateHired: emp.dateHired || '',
      birthDate: emp.birthDate || '',
      profileImage: emp.profileImage || '',
    })
    setFormErr('')
    setShowPass(false)
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

      const payload: Record<string, unknown> = {
        name: formatPersonName(editForm.name.trim()),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        branchId: editForm.branchId,
        role: editForm.role,
        jobTitle: (editForm.role === 'EMPLOYEE' || editForm.role === 'MANAGEMENT') ? editForm.jobTitle : '',
        personalEmail: editForm.personalEmail.trim(),
        dateHired: editForm.dateHired || null,
        birthDate: editForm.birthDate || null,
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
        setSelectedEmployee(null)
        navigate('/employees')
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
        const updateUrl = isAdmin
          ? `${API_BASE_URL}/admin/users/${u.id}`
          : `${API_BASE_URL}/manager/employees/${u.id}`

        await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({
            phone: createForm.phone.trim(),
            personalEmail: createForm.personalEmail.trim(),
            dateHired: createForm.dateHired || null,
            birthDate: createForm.birthDate || null,
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
    if (selectedBranchId && e.branchId !== selectedBranchId) return false
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

      {/* ── Main Table Card (hidden while an employee's detail tab is open) ── */}
      {!isDrawerOpen && (
      <div className="rounded-2xl flex flex-col shadow-sm" style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}>

        {/* Search, Filter, & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b" style={{ borderColor: border }}>
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Search Input */}
            <div className="flex items-center gap-2.5 min-w-[260px] max-w-sm rounded-xl px-3.5 py-2 border transition-all focus-within:border-emerald-500" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: textMuted }} />
              <input
                type="text"
                placeholder="Search name, email, branch…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent text-sm outline-none w-full"
                style={{ color: textPrimary }}
              />
              {search && <button onClick={() => setSearch('')} style={{ color: textMuted }}><X className="w-4 h-4" /></button>}
            </div>

            {/* Custom Branch Filter Dropdown (Wide Popup) */}
            <div className="relative" ref={branchDropdownRef}>
              <button
                onClick={() => setBranchDropdownOpen(prev => !prev)}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider border transition-all hover:bg-slate-500/5 focus:outline-none"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
              >
                <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
                <span>
                  {selectedBranchId
                    ? branches.find(b => b.id === selectedBranchId)?.name.toUpperCase() || 'ALL BRANCHES'
                    : 'ALL BRANCHES'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${branchDropdownOpen ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
              </button>

              {branchDropdownOpen && (
                <div
                  className="absolute left-0 mt-2 w-[480px] max-w-lg rounded-2xl shadow-2xl overflow-hidden z-40 border p-4 animate-[fadeIn_0.15s_ease-out]"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                >
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 pb-2 border-b" style={{ borderColor: border }}>
                    Select Branch
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedBranchId(''); setBranchDropdownOpen(false) }}
                      className="flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold transition-all text-left uppercase border hover:bg-slate-500/5"
                      style={{
                        backgroundColor: selectedBranchId === '' ? 'rgba(16,185,129,0.06)' : 'transparent',
                        borderColor: selectedBranchId === '' ? '#10B981' : border,
                        color: selectedBranchId === '' ? '#10B981' : textPrimary
                      }}
                    >
                      <span>ALL BRANCHES</span>
                      {selectedBranchId === '' && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />}
                    </button>

                    {branches.map(b => {
                      const isSelected = selectedBranchId === b.id
                      return (
                        <button
                          key={b.id}
                          onClick={() => { setSelectedBranchId(b.id); setBranchDropdownOpen(false) }}
                          className="flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold transition-all text-left uppercase border hover:bg-slate-500/5"
                          style={{
                            backgroundColor: isSelected ? 'rgba(16,185,129,0.06)' : 'transparent',
                            borderColor: isSelected ? '#10B981' : border,
                            color: isSelected ? '#10B981' : textPrimary
                          }}
                        >
                          <span className="truncate pr-2">{b.name.toUpperCase()}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Add Member Button */}
          {(isAdmin || isManager) && (
            <button
              onClick={openCreateFlow}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm"
              style={{ backgroundColor: '#10B981' }}
            >
              <Plus className="w-4 h-4" /> ADD MEMBER
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-b-2xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: isLight ? '#f8fafc' : '#080f1c', borderBottom: `1px solid ${border}` }}>
                {['Member', 'Role', 'Branch', 'Contact', 'Status'].map((h, idx, arr) => (
                  <th
                    key={h}
                    className={`px-6 py-3.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-r ${idx === 0 ? 'text-left' : 'text-center'}`}
                    style={{ color: textMuted, borderColor: border, borderRight: idx === arr.length - 1 ? 'none' : `1px solid ${border}` }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                    <td className="px-3 py-1.5 border-r" style={{ borderColor: border }}>
                      <div className="flex items-center gap-4">
                        <div className="w-[64px] h-[64px] rounded-xl animate-pulse shrink-0" style={{ backgroundColor: inputBg }} />
                        <div className="flex flex-col gap-2 flex-1">
                          <div className="h-4 rounded animate-pulse w-36" style={{ backgroundColor: inputBg }} />
                          <div className="h-3 rounded animate-pulse w-48" style={{ backgroundColor: inputBg }} />
                        </div>
                      </div>
                    </td>
                    {[2, 3, 4, 5].map((j, idx) => (
                      <td
                        key={j}
                        className="px-6 py-4 border-r text-center"
                        style={{ borderColor: border, borderRight: idx === 3 ? 'none' : `1px solid ${border}` }}
                      >
                        <div className="h-4 rounded animate-pulse mx-auto" style={{ backgroundColor: inputBg, width: '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <p className="text-sm font-medium" style={{ color: textMuted }}>No members found</p>
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
                    className="transition-colors cursor-pointer group"
                    onMouseEnter={el => (el.currentTarget.style.backgroundColor = rowHover)}
                    onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Employee */}
                    <td className="px-3 py-1.5 border-r" style={{ borderColor: border }}>
                      <div className="flex items-center gap-4">
                        {/* Large profile photo — almost full row height with 6px gap */}
                        <div className="shrink-0 relative" style={{ width: 64, height: 64 }}>
                          {e.profileImage ? (
                            <img
                              src={resolveImageUrl(e.profileImage)}
                              alt={e.name}
                              className="w-full h-full rounded-xl object-cover"
                              style={{ border: `2px solid ${border}` }}
                            />
                          ) : (
                            <div
                              className="w-full h-full rounded-xl flex items-center justify-center text-white font-black text-xl shrink-0"
                              style={{
                                background: `linear-gradient(135deg, ${
                                  ['#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#14B8A6','#6366F1'][
                                    (e.name.charCodeAt(0) || 0) % 7
                                  ]
                                }, #059669)`,
                                border: `2px solid ${border}`,
                              }}
                            >
                              {e.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          {/* Active status dot */}
                          <div
                            className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2"
                            style={{
                              backgroundColor: e.isActive ? '#10B981' : '#94a3b8',
                              borderColor: cardBg,
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate max-w-[220px]" style={{ color: textPrimary }}>{e.name.toUpperCase()}</div>
                          <div className="text-xs truncate max-w-[220px] mt-0.5" style={{ color: textMuted }}>{e.email.toLowerCase()}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-6 py-5 border-r text-center" style={{ borderColor: border }}>
                      <span className="text-sm font-semibold tracking-wider whitespace-nowrap" style={{ color: rc.text }}>
                        {resolveLabel(e.role, e.jobTitle).toUpperCase()}
                      </span>
                    </td>

                    {/* Branch */}
                    <td className="px-6 py-5 border-r text-center" style={{ borderColor: border }}>
                      {e.branchName ? (
                        <div className="flex items-center justify-center gap-1.5 text-sm whitespace-nowrap" style={{ color: textMuted }}>
                          <span className="font-semibold" style={{ color: textPrimary }}>{e.branchName.toUpperCase()}</span>
                        </div>
                      ) : (
                        <span className="text-xs italic" style={{ color: textMuted }}>—</span>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-6 py-5 border-r text-center" style={{ borderColor: border }}>
                      {e.phone ? (
                        <span className="text-sm font-semibold" style={{ color: textPrimary }}>
                          {formatPhoneNumber(e.phone)}
                        </span>
                      ) : (
                        <span className="text-xs italic" style={{ color: textMuted }}>—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-5 text-center">
                      <button
                        onClick={evt => { evt.stopPropagation(); requestToggleActive(e) }}
                        className="inline-flex items-center gap-1 text-xs font-bold tracking-wider transition-all hover:opacity-85"
                        style={{ color: e.isActive ? '#10B981' : '#94a3b8' }}
                        title="Toggle status"
                      >
                        {e.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Deep link / refresh directly on /employees/:id lands here before `employees` has loaded */}
      {isDrawerOpen && !selectedEmployee && loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#10B981' }} />
        </div>
      )}

      {/* ── Employee Detail Tab (full-width, replaces the list while open — no longer a popup) ── */}
      {isDrawerOpen && selectedEmployee && (
          <div
            className="rounded-2xl shadow-sm flex flex-col overflow-hidden"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
              animation: 'modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between shrink-0" style={{ borderColor: border }}>
              <div className="flex items-center gap-3">
                <button
                  onClick={closeDetailTab}
                  className="p-2 rounded-lg transition-all hover:bg-slate-500/10 shrink-0"
                  style={{ color: textMuted }}
                  aria-label="Back to Employees"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
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
                <button
                  onClick={closeDetailTab}
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
            <div className="flex-1 min-h-0 flex flex-col" style={detailTokens}>

              {/* ── Overview Tab ── */}
              {activeDrawerTab === 'overview' && (
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">

                  {/* Profile Details — contact, role, and account fields in one dense sheet */}
                  <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--detail-border)', backgroundColor: 'var(--detail-bg)' }}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
                      <DetailField label="Work email" value={selectedEmployee.email} icon={<Mail />} emptyLabel="—" />
                      <DetailField label="Personal email" value={selectedEmployee.personalEmail || ''} icon={<Mail />} emptyLabel="—" />
                      <DetailField label="Phone number" value={selectedEmployee.phone} icon={<Phone />} emptyLabel="—" />
                      <DetailField label="System role" value={formatRoleLabel(selectedEmployee.role)} icon={<ShieldCheck />} />
                      <DetailField label="Job title" value={selectedEmployee.jobTitle ? formatJobTitleLabel(selectedEmployee.jobTitle) : ''} icon={<Wrench />} emptyLabel="—" />
                      <DetailField label="Date hired" value={formatDisplayDate(selectedEmployee.dateHired)} icon={<Calendar />} />
                      <DetailField label="Birthdate" value={formatDisplayDate(selectedEmployee.birthDate)} icon={<Calendar />} />
                      <DetailField label="Employee ID" value={selectedEmployee.id.slice(0, 16) + '…'} icon={<User />} />
                      <DetailField
                        label="Registered"
                        value={selectedEmployee.createdAt ? new Date(selectedEmployee.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}
                        icon={<Calendar />}
                        emptyLabel="Unknown"
                      />
                    </div>
                  </div>

                  {/* Account Controls — membership toggle + danger zone, one compact row */}
                  <div className="rounded-2xl border p-3.5 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--detail-border)', backgroundColor: 'var(--detail-bg)' }}>
                    <button
                      onClick={() => requestToggleActive(selectedEmployee)}
                      className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-bold transition-all hover:opacity-80"
                      style={{ color: selectedEmployee.isActive ? '#10B981' : textMuted }}
                      title={selectedEmployee.isActive ? 'Click to deactivate' : 'Click to reactivate'}
                    >
                      <span
                        className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0"
                        style={{ backgroundColor: selectedEmployee.isActive ? '#10B981' : border }}
                      >
                        <span
                          className="inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                          style={{ transform: selectedEmployee.isActive ? 'translateX(13px)' : 'translateX(1px)' }}
                        />
                      </span>
                      {selectedEmployee.isActive ? 'Active member' : 'Deactivated'}
                    </button>

                    {isAdmin && !isProtectedFromDelete(selectedEmployee.role) && (
                      <button
                        onClick={() => requestDelete(selectedEmployee)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-red-500/10"
                        style={{ color: '#EF4444' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete account
                      </button>
                    )}
                  </div>

                </div>
              )}

              {/* ── History Tab ── */}
              {activeDrawerTab === 'history' && (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <TicketHistoryTable
                    person={{
                      id: selectedEmployee.id,
                      name: selectedEmployee.name,
                      email: selectedEmployee.email,
                      personalEmail: selectedEmployee.personalEmail,
                    }}
                  />
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t flex items-center justify-between shrink-0" style={{ borderColor: border, backgroundColor: isLight ? 'rgba(248,250,252,0.8)' : 'rgba(10,17,32,0.8)' }}>
              <span className="text-[11px]" style={{ color: textMuted }}>ID: {selectedEmployee.id.slice(0, 16)}…</span>
              <button
                onClick={closeDetailTab}
                className="px-4 py-1.5 rounded-lg text-xs font-bold border transition-all hover:bg-slate-500/10"
                style={{ borderColor: border, color: textMuted }}
              >
                Close
              </button>
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
                        <Field label="Job Title (select any that apply)" labelColor={textMuted}>
                          <JobTitleMultiSelect
                            value={editForm.jobTitle}
                            onChange={next => setEditForm(p => ({ ...p, jobTitle: next }))}
                            options={allJobTitles}
                            onAddCustom={addCustomJobTitle}
                            inputCls={inputCls}
                            inputStyle={inputStyle}
                            textMuted={textMuted}
                            border={border}
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Section: Birthdate ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">Birthdate</h4>
                  <Field label="Employee Birthdate" labelColor={textMuted}>
                    <input
                      type="date"
                      className={inputCls}
                      style={inputStyle}
                      value={editForm.birthDate}
                      onChange={e => setEditForm(p => ({ ...p, birthDate: e.target.value }))}
                    />
                  </Field>
                </div>

                {/* ── Section: Date Hired ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-500 mb-3">Date Hired</h4>
                  <Field label="Employee Date Hired" labelColor={textMuted}>
                    <input
                      type="date"
                      className={inputCls}
                      style={inputStyle}
                      value={editForm.dateHired}
                      onChange={e => setEditForm(p => ({ ...p, dateHired: e.target.value }))}
                    />
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
                      <Field label="Job title (select any that apply)" labelColor={textMuted}>
                        <JobTitleMultiSelect
                          value={createForm.jobTitle}
                          onChange={next => setCreateForm(p => ({ ...p, jobTitle: next }))}
                          options={allJobTitles}
                          onAddCustom={addCustomJobTitle}
                          inputCls={inputCls}
                          inputStyle={inputStyle}
                          textMuted={textMuted}
                          border={border}
                        />
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
                  <Field label="Birthdate" labelColor={textMuted}>
                    <input
                      type="date"
                      className={inputCls}
                      style={inputStyle}
                      value={createForm.birthDate}
                      onChange={e => setCreateForm(p => ({ ...p, birthDate: e.target.value }))}
                    />
                  </Field>
                  <Field label="Date Hired (optional)" labelColor={textMuted}>
                    <input
                      type="date"
                      className={inputCls}
                      style={inputStyle}
                      value={createForm.dateHired}
                      onChange={e => setCreateForm(p => ({ ...p, dateHired: e.target.value }))}
                    />
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
