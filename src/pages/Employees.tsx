import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Search, Wrench, Mail, Phone, Building2,
  CheckCircle, XCircle, Trash2, X, Plus, Copy,
  Check, Eye, EyeOff,
  Camera, Calendar, User,
  Loader2, ChevronDown, Filter, Edit3, Shield,
  Clock, Briefcase, UserCheck
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import UserAvatar from '../components/UserAvatar'
import TicketHistoryTable from '../components/TicketHistoryTable'
import PresenceStatus from '../components/PresenceStatus'
import WarrantyRegistrationHistoryTable from '../components/WarrantyRegistrationHistoryTable'
import { API_BASE_URL, resolveImageUrl, isSystemAdmin, readApiError, formatPersonName, notifyEmployeesDirectoryUpdated, isWarrantyRegistrar } from '../utils/api'
import ConfirmDialog, { type ConfirmDialogState } from '../components/ConfirmDialog'

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function calculateTenure(dateStr?: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  const diffMonths = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  if (diffMonths < 1) return 'New member'
  if (diffMonths < 12) return `${diffMonths} mo${diffMonths > 1 ? 's' : ''}`
  const years = Math.floor(diffMonths / 12)
  const remainingMonths = diffMonths % 12
  return remainingMonths > 0 ? `${years} yr${years > 1 ? 's' : ''} ${remainingMonths} mo` : `${years} yr${years > 1 ? 's' : ''}`
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
  nickname?: string
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
  viewBranchIds?: string
  createdAt?: string
  updatedAt?: string
  lastLoginAt?: string
  lastActiveAt?: string
}

interface BranchOption { id: string; name: string }

const DEFAULT_JOB_TITLES = ['TECHNICIAN', 'INSTALLER', 'DRIVER', 'DDRM', 'COORDINATOR', 'CREATE TICKETS', 'REGISTRATION', 'PAYROLL', 'DTR OVERRIDE']
const REMOVED_LEGACY_ROLES = new Set(['SALES EXECUTIVE', 'HELPER', 'WARRANTY REGISTRAR', 'WARRANTY REGISTRATOR', 'DISPATCHER', 'RELAY DISPATCHER', 'TICKET CREATOR'])


type AssignableRole = 'EMPLOYEE' | 'MANAGER' | 'MANAGEMENT'

const ROLE_META: Record<AssignableRole, {
  label: string
  hint: string
  requiresBranch: boolean
  requiresJobTitle: boolean
  canDelete: boolean
}> = {
  EMPLOYEE: {
    label: 'Member',
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
      jobTitle: prev.jobTitle ? normalizeJobTitle(prev.jobTitle) : 'REGISTRATION',
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

const normalizeJobTitle = (title: string): string => {
  const upper = (title || '').trim().toUpperCase()
  if (upper === 'WARRANTY REGISTRAR' || upper === 'WARRANTY REGISTRATOR' || upper === 'REGISTRAR' || upper === 'REGISTRATOR') return 'REGISTRATION'
  if (upper === 'TICKET CREATOR') return 'CREATE TICKETS'
  if (upper === 'DISPATCHER' || upper === 'RELAY DISPATCHER' || upper === 'RELAY COORDINATOR') return 'COORDINATOR'
  return upper
}

const formatJobTitleLabel = (title: string) => {
  if (!title?.trim()) return ''
  const titles = parseJobTitles(title)
  return titles.join(', ')
}

/** jobTitle is stored as one comma-separated string so an employee can hold multiple roles
 * (e.g. "COORDINATOR, CREATE TICKETS") without a backend schema change. */
const parseJobTitles = (raw: string): string[] =>
  Array.from(new Set((raw || '').split(',').map(s => normalizeJobTitle(s)).filter(Boolean)))

const joinJobTitles = (titles: string[]): string => titles.join(', ')

interface JobTitleMultiSelectProps {
  value: string
  onChange: (next: string) => void
  options: string[]
  onAddCustom: (title: string) => void
  inputCls: string
  inputStyle: React.CSSProperties
  border: string
}

const JobTitleMultiSelect = ({ value, onChange, options, onAddCustom, inputCls, inputStyle, border }: JobTitleMultiSelectProps) => {
  const selected = parseJobTitles(value)
  const [newTitle, setNewTitle] = useState('')

  const isSelected = (title: string) => {
    const t = normalizeJobTitle(title)
    return selected.includes(t)
  }

  const toggle = (title: string) => {
    const t = normalizeJobTitle(title)
    let next = [...selected]
    if (next.includes(t)) {
      next = next.filter(item => item !== t)
    } else {
      next.push(t)
    }
    onChange(joinJobTitles(next))
  }

  const addCustom = () => {
    const title = normalizeJobTitle(newTitle)
    if (!title) return
    if (!options.includes(title)) onAddCustom(title)
    if (!selected.includes(title)) onChange(joinJobTitles([...selected, title]))
    setNewTitle('')
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Role Chips */}
      <div className="flex flex-wrap gap-2 p-3.5 rounded-2xl border" style={{ borderColor: border, backgroundColor: 'rgba(0,0,0,0.02)' }}>
        {options.map(title => {
          const active = isSelected(title)
          return (
            <button
              key={title}
              type="button"
              onClick={() => toggle(title)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black tracking-wider uppercase transition-all select-none cursor-pointer border ${
                active
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm shadow-emerald-500/15'
                  : 'bg-white/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <span className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                active
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-slate-300 dark:border-slate-600 bg-transparent'
              }`}>
                {active && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </span>
              {title.toUpperCase()}
            </button>
          )
        })}
      </div>

      {/* Add Custom Role */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          className={inputCls}
          style={inputStyle}
          placeholder="ADD CUSTOM ROLE (E.G. LOGISTICS)"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
        />
        <button
          type="button"
          onClick={addCustom}
          className="px-4 py-2.5 rounded-xl text-xs font-black shrink-0 uppercase tracking-wider transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5"
          style={{ backgroundColor: '#10B981', color: '#fff' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
    </div>
  )
}


const CREATE_STEPS = [
  { id: 1 as const, label: 'ACCOUNT', hint: 'Name and login details' },
  { id: 2 as const, label: 'ROLE', hint: 'Role and branch' },
  { id: 3 as const, label: 'DETAILS', hint: 'Optional profile info' },
]

// ── Input helper ────────────────────────────────────────────────────────────
interface FieldProps {
  label: string
  children: React.ReactNode
  labelColor: string
}

const Field = ({ label, children, labelColor }: FieldProps) => (
  <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
    <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: labelColor }}>{label.toUpperCase()}</label>
    {children}
  </div>
)

// ── Component ─────────────────────────────────────────────────────────────────
export default function Employees() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight  = theme === 'light'
  const isAdmin   = isSystemAdmin(user?.role)

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
  const [activeDrawerTab, setActiveDrawerTab] = useState<'overview' | 'history' | 'registrations'>('overview')
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI Filters
  const [search,    setSearch]    = useState('')
  const [tabFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false)
  const branchDropdownRef = useRef<HTMLDivElement>(null)
  const roleDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false)
      }
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false)
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
  const [copiedKey,    setCopiedKey]    = useState<string | null>(null)

  const copyToClipboard = (text?: string | null, keyName: string = 'key') => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedKey(keyName)
    setTimeout(() => setCopiedKey(null), 2000)
    showToast('success', 'Copied to clipboard!')
  }

  // Edit form
  const [editForm, setEditForm] = useState({
    name: '', nickname: '', email: '', phone: '',
    role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
    branchId: '', isActive: true, newPassword: '',
    personalEmail: '',
    dateHired: '',
    birthDate: '',
    profileImage: '',
    viewBranchIds: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')

  // Create form
  const [createForm, setCreateForm] = useState({
    name: '', nickname: '', email: '', branchId: '',
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
      name: '', nickname: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
      phone: '', personalEmail: '', dateHired: '', birthDate: '', profileImage: '',
    })
  }

  const openCreateFlow = () => {
    setCreateStep(1)
    setFormErr('')
    setCreateForm({
      name: '', nickname: '', email: '', branchId: '', role: 'EMPLOYEE', jobTitle: 'TECHNICIAN',
      phone: '', personalEmail: '', dateHired: '', birthDate: '', profileImage: '',
    })
    setShowCreate(true)
  }

  // Load custom roles on mount
  useEffect(() => {
    const saved = localStorage.getItem('ashcol-custom-job-titles')
    if (saved) {
      try {
        const parsed: string[] = JSON.parse(saved)
        const filtered = parsed.filter(t => !REMOVED_LEGACY_ROLES.has(t.toUpperCase()) && !DEFAULT_JOB_TITLES.includes(t.toUpperCase()))
        setCustomJobTitles(filtered)
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
        const cleanJobTitle = s.jobTitle ? parseJobTitles(s.jobTitle).join(', ') : (isMgmtOrAdmin ? 'REGISTRATION' : '')
        return {
          id:          s.id,
          name:        formatPersonName(s.name || 'Unknown'),
          nickname:    s.nickname    || '',
          email:       s.email       || '',
          phone:       s.phone       || '',
          role:        (s.role       || 'EMPLOYEE').toUpperCase(),
          jobTitle:    cleanJobTitle,
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
          lastLoginAt: s.lastLoginAt,
          lastActiveAt: s.lastActiveAt,
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
  const scrollToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
    const mainEl = document.querySelector('main')
    if (mainEl) {
      mainEl.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
    }
  }

  const handleRowClick = (emp: Employee) => {
    setSelectedEmployee(emp)
    setActiveDrawerTab('overview')
    navigate(`/employees/${emp.id}`)
    scrollToTop()
  }

  const closeDetailTab = () => {
    navigate('/employees')
    scrollToTop()
  }

  // Keep the detail tab's employee in sync with the URL (deep link / refresh / back button).
  useEffect(() => {
    scrollToTop()
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
    const cleanJobTitle = s.jobTitle ? parseJobTitles(s.jobTitle).join(', ') : (isMgmtOrAdmin ? 'REGISTRATION' : '')
    return {
      id: s.id,
      name: formatPersonName(s.name || 'Unknown'),
      nickname: s.nickname || '',
      email: s.email || '',
      phone: s.phone || '',
      role: (s.role || 'EMPLOYEE').toUpperCase(),
      jobTitle: cleanJobTitle,
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
      birthDate: s.birthDate || '',
      viewBranchIds: s.viewBranchIds || '',
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
      name: formatPersonName(emp.name), nickname: emp.nickname || '', email: emp.email, phone: emp.phone,
      role: emp.role, jobTitle: validJt,
      branchId: emp.branchId, isActive: emp.isActive, newPassword: '',
      personalEmail: emp.personalEmail || '',
      dateHired: emp.dateHired || '',
      birthDate: emp.birthDate || '',
      profileImage: emp.profileImage || '',
      viewBranchIds: emp.viewBranchIds || '',
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
        nickname: editForm.nickname.trim() || null,
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        branchId: editForm.branchId,
        role: editForm.role,
        jobTitle: (editForm.role === 'EMPLOYEE' || editForm.role === 'MANAGEMENT') ? editForm.jobTitle : '',
        personalEmail: editForm.personalEmail.trim(),
        dateHired: editForm.dateHired || null,
        birthDate: editForm.birthDate || null,
        profileImage: editForm.profileImage,
        viewBranchIds: editForm.viewBranchIds ? editForm.viewBranchIds.trim() : null,
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
      notifyEmployeesDirectoryUpdated()
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
        nickname: createForm.nickname.trim(),
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

  // Build dynamic job roles list: distinct individual roles/job titles only (no concatenated multi-roles)
  const availableJobRoles = useMemo(() => {
    const rolesSet = new Set<string>()

    // Add standard roles
    rolesSet.add('ADMIN')
    rolesSet.add('MANAGEMENT')
    rolesSet.add('OFFICER IN CHARGE')

    // Add default job titles
    DEFAULT_JOB_TITLES.forEach(t => {
      if (t?.trim()) rolesSet.add(t.trim().toUpperCase())
    })

    // Also include any individual job titles assigned to employees
    employees.forEach(e => {
      const r = (e.role || '').toUpperCase()
      if (r === 'ADMIN') rolesSet.add('ADMIN')
      else if (r === 'MANAGEMENT') rolesSet.add('MANAGEMENT')
      else if (r === 'MANAGER') rolesSet.add('OFFICER IN CHARGE')

      if (e.jobTitle) {
        parseJobTitles(e.jobTitle).forEach(title => {
          if (title?.trim()) rolesSet.add(title.trim().toUpperCase())
        })
      }
    })

    const list = Array.from(rolesSet).filter(Boolean).sort()
    return ['all', ...list]
  }, [employees])

  // ── Filtered List ───────────────────────────────────────────────────────────
  const filtered = employees.filter(e => {
    if (tabFilter === 'active'   && !e.isActive) return false
    if (tabFilter === 'inactive' && e.isActive)  return false
    if (roleFilter !== 'all') {
      const target = roleFilter.toUpperCase()
      const empRole = (e.role || '').toUpperCase()

      let matches = false
      if (target === 'ADMIN' && empRole === 'ADMIN') {
        matches = true
      } else if (target === 'MANAGEMENT' && empRole === 'MANAGEMENT') {
        matches = true
      } else if ((target === 'OFFICER IN CHARGE' || target === 'MANAGER') && empRole === 'MANAGER') {
        matches = true
      } else {
        const titles = parseJobTitles(e.jobTitle || '').map(t => t.toUpperCase())
        if (titles.includes(target)) {
          matches = true
        } else if (resolveLabel(e.role, e.jobTitle).toUpperCase() === target) {
          matches = true
        }
      }

      if (!matches) return false
    }
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 sm:px-6 sm:py-4 border-b" style={{ borderColor: border }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 flex-1">
            {/* Search Input */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto sm:min-w-[260px] sm:max-w-sm rounded-xl px-3.5 py-2.5 sm:py-2 border transition-all focus-within:border-emerald-500" style={{ backgroundColor: inputBg, borderColor: inputBorder }}>
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

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Custom Branch Filter Dropdown */}
              <div className="relative flex-1 sm:flex-initial" ref={branchDropdownRef}>
                <button
                  onClick={() => setBranchDropdownOpen(prev => !prev)}
                  className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 rounded-xl px-3.5 sm:px-4 py-2 text-xs font-semibold uppercase tracking-wider border transition-all hover:bg-slate-500/5 focus:outline-none"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
                    <span className="truncate">
                      {selectedBranchId
                        ? branches.find(b => b.id === selectedBranchId)?.name.toUpperCase() || 'ALL BRANCHES'
                        : 'ALL BRANCHES'}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${branchDropdownOpen ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
                </button>

                {branchDropdownOpen && (
                  <div
                    className="absolute left-0 mt-2 w-[calc(100vw-2.5rem)] sm:w-[480px] max-w-lg rounded-2xl shadow-2xl overflow-hidden z-40 border p-4 animate-[fadeIn_0.15s_ease-out]"
                    style={{ backgroundColor: cardBg, borderColor: border }}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 pb-2 border-b" style={{ borderColor: border }}>
                      Select Branch
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
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

              {/* Custom Role Filter Dropdown */}
              <div className="relative flex-1 sm:flex-initial" ref={roleDropdownRef}>
                <button
                  onClick={() => setRoleDropdownOpen(prev => !prev)}
                  className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 rounded-xl px-3.5 sm:px-4 py-2 text-xs font-semibold uppercase tracking-wider border transition-all hover:bg-slate-500/5 focus:outline-none"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
                    <span className="truncate">
                      {roleFilter === 'all'
                        ? 'ALL ROLES'
                        : roleFilter}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} style={{ color: textMuted }} />
                </button>

                {roleDropdownOpen && (
                  <div
                    className="absolute right-0 sm:left-0 mt-2 w-[calc(100vw-2.5rem)] sm:w-[240px] max-w-xs rounded-2xl shadow-2xl overflow-hidden z-40 border p-4 animate-[fadeIn_0.15s_ease-out]"
                    style={{ backgroundColor: cardBg, borderColor: border }}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3 pb-2 border-b" style={{ borderColor: border }}>
                      Select Role
                    </div>
                    <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                      {availableJobRoles.map((rKey: string) => {
                        const isSelected = roleFilter === rKey
                        const label = rKey === 'all' ? 'ALL ROLES' : rKey
                        return (
                          <button
                            key={rKey}
                            onClick={() => { setRoleFilter(rKey); setRoleDropdownOpen(false) }}
                            className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold transition-all text-left uppercase border hover:bg-slate-500/5"
                            style={{
                              backgroundColor: isSelected ? 'rgba(16,185,129,0.06)' : 'transparent',
                              borderColor: isSelected ? '#10B981' : border,
                              color: isSelected ? '#10B981' : textPrimary
                            }}
                          >
                            <span>{label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Add Member Button */}
          {isAdmin && (
            <button
              onClick={openCreateFlow}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-sm shrink-0"
              style={{ backgroundColor: '#10B981' }}
            >
              <Plus className="w-4 h-4" /> ADD MEMBER
            </button>
          )}
        </div>

        {/* Dynamic Card View — Mobile & Small Screens (<md) */}
        <div className="md:hidden flex flex-col divide-y" style={{ borderColor: border }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl animate-pulse shrink-0" style={{ backgroundColor: inputBg }} />
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="h-4 rounded animate-pulse w-32" style={{ backgroundColor: inputBg }} />
                    <div className="h-3 rounded animate-pulse w-44" style={{ backgroundColor: inputBg }} />
                  </div>
                  <div className="w-14 h-6 rounded-full animate-pulse shrink-0" style={{ backgroundColor: inputBg }} />
                </div>
                <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: border }}>
                  <div className="h-6 w-24 rounded-lg animate-pulse" style={{ backgroundColor: inputBg }} />
                  <div className="h-6 w-28 rounded-lg animate-pulse" style={{ backgroundColor: inputBg }} />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <User className="w-10 h-10 mx-auto mb-2 opacity-25" style={{ color: textMuted }} />
              <p className="text-sm font-semibold" style={{ color: textPrimary }}>No members found</p>
              <p className="text-xs mt-1" style={{ color: textMuted }}>Try a different search or filter.</p>
            </div>
          ) : (
            filtered.map(e => {
              const rc = roleColor(e.role)
              return (
                <div
                  key={e.id}
                  onClick={() => handleRowClick(e)}
                  className="p-4 flex flex-col gap-3 transition-colors cursor-pointer active:bg-slate-500/5"
                >
                  {/* Top: Avatar, Name, Email, Status Button */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className="shrink-0 relative w-12 h-12">
                        {e.profileImage ? (
                          <img
                            src={resolveImageUrl(e.profileImage)}
                            alt={e.name}
                            className="w-full h-full rounded-2xl object-cover"
                            style={{ border: `1.5px solid ${border}` }}
                          />
                        ) : (
                          <div
                            className="w-full h-full rounded-2xl flex items-center justify-center text-white font-black text-sm shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${
                                ['#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#14B8A6','#6366F1'][
                                  (e.name.charCodeAt(0) || 0) % 7
                                ]
                              }, #059669)`,
                              border: `1.5px solid ${border}`,
                            }}
                          >
                            {e.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Name & Email */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold truncate leading-tight" style={{ color: textPrimary }}>
                          {e.name.toUpperCase()}
                        </div>
                        <div className="text-xs truncate mt-0.5" style={{ color: textMuted }}>
                          {e.email.toLowerCase()}
                        </div>
                        <div className="mt-1">
                          <PresenceStatus lastActiveAt={e.lastActiveAt} lastLoginAt={e.lastLoginAt} textMuted={textMuted} />
                        </div>
                      </div>
                    </div>

                    {/* Status Badge / Toggle */}
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={evt => {
                          evt.stopPropagation()
                          requestToggleActive(e)
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider transition-all border hover:opacity-80"
                        style={{
                          backgroundColor: e.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
                          borderColor: e.isActive ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.3)',
                          color: e.isActive ? '#10B981' : '#94a3b8',
                        }}
                        title="Toggle active status"
                      >
                        {e.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    ) : (
                      <span
                        className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider border"
                        style={{
                          backgroundColor: e.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
                          borderColor: e.isActive ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.3)',
                          color: e.isActive ? '#10B981' : '#94a3b8',
                        }}
                      >
                        {e.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    )}
                  </div>

                  {/* Metadata Chips: Role, Branch, Contact */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {/* Role Chip */}
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wide border inline-flex items-center"
                      style={{
                        backgroundColor: rc.bg,
                        color: rc.text,
                        borderColor: rc.border,
                      }}
                    >
                      {resolveLabel(e.role, e.jobTitle).toUpperCase()}
                    </span>

                    {/* Branch Chip */}
                    {e.branchName && (
                      <span
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border"
                        style={{
                          backgroundColor: inputBg,
                          borderColor: inputBorder,
                          color: textPrimary,
                        }}
                      >
                        <Building2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="truncate max-w-[150px]">{e.branchName.toUpperCase()}</span>
                      </span>
                    )}

                    {/* Contact Phone Chip */}
                    {e.phone && (
                      <a
                        href={`tel:${e.phone}`}
                        onClick={evt => evt.stopPropagation()}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border transition-colors hover:border-emerald-500/50"
                        style={{
                          backgroundColor: inputBg,
                          borderColor: inputBorder,
                          color: textMuted,
                        }}
                      >
                        <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{formatPhoneNumber(e.phone)}</span>
                      </a>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Table — Desktop (md+) */}
        <div className="hidden md:block overflow-x-auto rounded-b-2xl">
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
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate max-w-[220px]" style={{ color: textPrimary }}>{e.name.toUpperCase()}</div>
                          <div className="text-xs truncate max-w-[220px] mt-0.5" style={{ color: textMuted }}>{e.email.toLowerCase()}</div>
                          <div className="mt-1">
                            <PresenceStatus lastActiveAt={e.lastActiveAt} lastLoginAt={e.lastLoginAt} textMuted={textMuted} />
                          </div>
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
                      {isAdmin ? (
                        <button
                          onClick={evt => { evt.stopPropagation(); requestToggleActive(e) }}
                          className="inline-flex items-center gap-1 text-xs font-bold tracking-wider transition-all hover:opacity-85"
                          style={{ color: e.isActive ? '#10B981' : '#94a3b8' }}
                          title="Toggle status"
                        >
                          {e.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-bold tracking-wider"
                          style={{ color: e.isActive ? '#10B981' : '#94a3b8' }}
                        >
                          {e.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      )}
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

      {/* ── Employee Detail Tab (full-width, replaces the list while open — clean & full-screen on mobile) ── */}
      {isDrawerOpen && selectedEmployee && (
        <div
          className="-m-5 sm:-m-5 md:m-0 rounded-none md:rounded-2xl shadow-lg flex flex-col overflow-hidden min-h-[calc(100vh-4.5rem)] md:min-h-[700px] border-0 md:border transition-all"
          style={{
            backgroundColor: cardBg,
            borderColor: border,
            animation: 'modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Top Sticky Navigation Bar */}
          <div
            className="sticky top-0 z-20 px-4 sm:px-6 py-3.5 border-b backdrop-blur-md flex items-center justify-between gap-3 shrink-0"
            style={{
              borderColor: border,
              backgroundColor: isLight ? 'rgba(255,255,255,0.94)' : 'rgba(10,17,32,0.94)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-500">
                Member Details
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-bold truncate" style={{ color: textPrimary }}>{selectedEmployee.name}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={closeDetailTab}
                className="p-2 rounded-xl transition-all hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 active:scale-95"
                aria-label="Close"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Hero Profile Banner */}
          <div
            className="p-5 sm:p-7 border-b flex flex-col md:flex-row md:items-center justify-between gap-5 shrink-0"
            style={{
              borderColor: border,
              background: isLight
                ? 'linear-gradient(135deg, rgba(241,245,249,0.8) 0%, rgba(255,255,255,1) 100%)'
                : 'linear-gradient(135deg, rgba(15,26,46,0.7) 0%, rgba(10,17,32,1) 100%)',
            }}
          >
            {/* Left: Avatar + Details */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 min-w-0 flex-1">
              {/* Avatar with Camera Upload Overlay */}
              <div className="relative group shrink-0 self-center sm:self-auto">
                <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl overflow-hidden shadow-md ring-2 ring-emerald-500/30">
                  <UserAvatar
                    name={selectedEmployee.name}
                    imageUrl={selectedEmployee.profileImage}
                    size="lg"
                    className="!w-full !h-full !rounded-2xl"
                  />
                </div>
                <div
                  onClick={triggerImageUpload}
                  className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 cursor-pointer transition-opacity text-white"
                  title="Change profile picture"
                >
                  <Camera className="w-5 h-5 text-white" />
                  <span className="text-[9px] font-black uppercase tracking-wider">CHANGE</span>
                </div>
                {imageUploading && (
                  <div className="absolute inset-0 rounded-2xl bg-black/50 backdrop-blur-xs flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  </div>
                )}
                <div
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 shadow-sm"
                  style={{
                    backgroundColor: selectedEmployee.isActive ? '#10B981' : '#94a3b8',
                    borderColor: cardBg,
                  }}
                  title={selectedEmployee.isActive ? 'Active Member' : 'Deactivated'}
                />
              </div>

              {/* Profile Meta & Badges */}
              <div className="flex flex-col gap-1.5 min-w-0 w-full sm:w-auto text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2 flex-wrap" style={{ color: textPrimary }}>
                    <span>{selectedEmployee.name}</span>
                    {selectedEmployee.nickname && (
                      <span className="text-sm font-black px-2.5 py-0.5 rounded-lg border tracking-wide uppercase" style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#10B981' }}>
                        "{selectedEmployee.nickname}"
                      </span>
                    )}
                  </h2>
                  {isAdmin && !isProtectedFromEdit(selectedEmployee.role) && (
                    <button
                      onClick={() => openEdit(selectedEmployee)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 text-white hover:opacity-90 shrink-0"
                      style={{ backgroundColor: '#10B981' }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>EDIT PROFILE</span>
                    </button>
                  )}
                </div>

                {/* Badges Flow */}
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap pt-0.5">
                  {/* Role / Job Title Pills */}
                  {parseJobTitles(selectedEmployee.jobTitle).length > 0 ? (
                    parseJobTitles(selectedEmployee.jobTitle).map(jt => (
                      <span
                        key={jt}
                        className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg uppercase tracking-wide border shadow-xs"
                        style={{
                          backgroundColor: roleColor(selectedEmployee.role).bg,
                          color: roleColor(selectedEmployee.role).text,
                          borderColor: roleColor(selectedEmployee.role).border,
                        }}
                      >
                        {jt}
                      </span>
                    ))
                  ) : (
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg uppercase tracking-wide border shadow-xs"
                      style={{
                        backgroundColor: roleColor(selectedEmployee.role).bg,
                        color: roleColor(selectedEmployee.role).text,
                        borderColor: roleColor(selectedEmployee.role).border,
                      }}
                    >
                      {resolveLabel(selectedEmployee.role, selectedEmployee.jobTitle)}
                    </span>
                  )}

                  {/* Branch Badge */}
                  {selectedEmployee.branchName && (
                    <span
                      className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 border"
                      style={{
                        backgroundColor: isLight ? 'rgba(241,245,249,0.8)' : 'rgba(15,26,46,0.8)',
                        borderColor: border,
                        color: textPrimary,
                      }}
                    >
                      <Building2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>{selectedEmployee.branchName}</span>
                    </span>
                  )}

                  {/* View-Only Branches Badge */}
                  {selectedEmployee.viewBranchIds && (
                    <span
                      className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 border"
                      style={{
                        backgroundColor: 'rgba(245,158,11,0.1)',
                        borderColor: 'rgba(245,158,11,0.3)',
                        color: '#D97706',
                      }}
                      title="Read-only schedule view branches"
                    >
                      <Eye className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>
                        View: {selectedEmployee.viewBranchIds.split(',').map(id => branches.find(b => b.id === id.trim())?.name || id.trim()).join(', ')}
                      </span>
                    </span>
                  )}

                  {/* Combined Active Status & Live Login / Presence */}
                  <div
                    className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 border shadow-xs"
                    style={{
                      backgroundColor: selectedEmployee.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
                      borderColor: selectedEmployee.isActive ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.3)',
                      color: selectedEmployee.isActive ? '#10B981' : textMuted,
                    }}
                  >
                    <span className={`w-2 h-2 rounded-full ${selectedEmployee.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span className="font-bold">{selectedEmployee.isActive ? 'Active' : 'Inactive'}</span>
                    <span className="opacity-40">•</span>
                    <PresenceStatus lastActiveAt={selectedEmployee.lastActiveAt} lastLoginAt={selectedEmployee.lastLoginAt} textMuted={textMuted} />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Quick Action Buttons */}
            <div className="flex items-center justify-center sm:justify-end gap-2 flex-wrap pt-3 sm:pt-0 border-t sm:border-t-0" style={{ borderColor: border }}>
              {selectedEmployee.phone && (
                <a
                  href={`tel:${selectedEmployee.phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:border-emerald-500 hover:text-emerald-500 active:scale-95"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  title="Call Phone Number"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Call</span>
                </a>
              )}
              {selectedEmployee.email && (
                <a
                  href={`mailto:${selectedEmployee.email}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:border-emerald-500 hover:text-emerald-500 active:scale-95"
                  style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                  title="Send Email"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Email</span>
                </a>
              )}
              <button
                onClick={() => copyToClipboard(selectedEmployee.id, 'id')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:border-emerald-500 hover:text-emerald-500 active:scale-95"
                style={{ backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }}
                title="Copy Member ID"
              >
                {copiedKey === 'id' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-emerald-500" />}
                <span>{copiedKey === 'id' ? 'Copied ID' : 'Copy ID'}</span>
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b shrink-0 overflow-x-auto px-4 sm:px-6" style={{ borderColor: border }}>
            {([
              { id: 'overview' as const, label: 'OVERVIEW', icon: <User className="w-3.5 h-3.5" /> },
              { id: 'history' as const, label: 'TICKET HISTORY', icon: <Calendar className="w-3.5 h-3.5" /> },
              ...(isWarrantyRegistrar(selectedEmployee.jobTitle)
                ? [{ id: 'registrations' as const, label: 'REGISTERED TICKETS', icon: <Wrench className="w-3.5 h-3.5" /> }]
                : []),
            ]).map(tab => {
              const isActive = activeDrawerTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveDrawerTab(tab.id)}
                  className="flex items-center gap-2 px-4 sm:px-6 py-3.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap"
                  style={{
                    borderColor: isActive ? '#10B981' : 'transparent',
                    color: isActive ? '#10B981' : textMuted,
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Tab Body */}
          <div className="flex-1 min-h-0 flex flex-col" style={detailTokens}>

            {/* ── Overview Tab ── */}
            {activeDrawerTab === 'overview' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col gap-6">

                {/* Section 1: Contact & Workplace */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-500">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Contact & Location</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Work Email */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all group"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-500 bg-emerald-500/10 shrink-0">
                            <Mail className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>WORK EMAIL</span>
                        </div>
                        {selectedEmployee.email && (
                          <button
                            onClick={() => copyToClipboard(selectedEmployee.email, 'workEmail')}
                            className="p-1 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors"
                            title="Copy email"
                          >
                            {copiedKey === 'workEmail' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                      <div className="text-sm font-bold break-all select-text" style={{ color: textPrimary }}>
                        {selectedEmployee.email || '—'}
                      </div>
                    </div>

                    {/* Personal Email */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all group"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-500 bg-blue-500/10 shrink-0">
                            <Mail className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>PERSONAL EMAIL</span>
                        </div>
                        {selectedEmployee.personalEmail && (
                          <button
                            onClick={() => copyToClipboard(selectedEmployee.personalEmail, 'personalEmail')}
                            className="p-1 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors"
                            title="Copy personal email"
                          >
                            {copiedKey === 'personalEmail' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                      <div className={`text-sm font-bold break-all select-text ${selectedEmployee.personalEmail ? '' : 'italic opacity-60'}`} style={{ color: selectedEmployee.personalEmail ? textPrimary : textMuted }}>
                        {selectedEmployee.personalEmail || 'Not provided'}
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all group"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-500 bg-emerald-500/10 shrink-0">
                            <Phone className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>PHONE NUMBER</span>
                        </div>
                        {selectedEmployee.phone && (
                          <button
                            onClick={() => copyToClipboard(selectedEmployee.phone, 'phone')}
                            className="p-1 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors"
                            title="Copy phone number"
                          >
                            {copiedKey === 'phone' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                      <div className="text-sm font-bold" style={{ color: textPrimary }}>
                        {formatPhoneNumber(selectedEmployee.phone)}
                      </div>
                    </div>

                    {/* Assigned Branch */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-500 bg-amber-500/10 shrink-0">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>ASSIGNED BRANCH</span>
                      </div>
                      <div className="text-sm font-bold uppercase truncate" style={{ color: textPrimary }}>
                        {selectedEmployee.branchName || 'All Branches'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Role & Employment Details */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-500">
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Role & Employment Information</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Job Title */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all sm:col-span-2"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-violet-500 bg-violet-500/10 shrink-0">
                          <Wrench className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>JOB TITLE & ROLES</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {parseJobTitles(selectedEmployee.jobTitle).length > 0 ? (
                          parseJobTitles(selectedEmployee.jobTitle).map(jt => (
                            <span
                              key={jt}
                              className="text-xs font-bold px-3 py-1 rounded-lg uppercase tracking-wide border shadow-xs"
                              style={{
                                backgroundColor: roleColor(selectedEmployee.role).bg,
                                color: roleColor(selectedEmployee.role).text,
                                borderColor: roleColor(selectedEmployee.role).border,
                              }}
                            >
                              {jt}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm font-bold uppercase" style={{ color: textPrimary }}>
                            {resolveLabel(selectedEmployee.role, selectedEmployee.jobTitle)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Date Hired */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-500 bg-emerald-500/10 shrink-0">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>DATE HIRED</span>
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: textPrimary }}>
                          {formatDisplayDate(selectedEmployee.dateHired)}
                        </div>
                        {selectedEmployee.dateHired && calculateTenure(selectedEmployee.dateHired) && (
                          <div className="text-[11px] font-semibold text-emerald-500 mt-0.5">
                            Tenure: {calculateTenure(selectedEmployee.dateHired)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Birthdate */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-pink-500 bg-pink-500/10 shrink-0">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>BIRTHDATE</span>
                      </div>
                      <div className={`text-sm font-bold ${selectedEmployee.birthDate ? '' : 'italic opacity-60'}`} style={{ color: selectedEmployee.birthDate ? textPrimary : textMuted }}>
                        {formatDisplayDate(selectedEmployee.birthDate)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: System & Security Metadata */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-500">
                    <Shield className="w-3.5 h-3.5" />
                    <span>System & Account Metadata</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Member ID */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all group"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-indigo-500 bg-indigo-500/10 shrink-0">
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>MEMBER ID</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(selectedEmployee.id, 'memberId')}
                          className="p-1 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors"
                          title="Copy Full Member ID"
                        >
                          {copiedKey === 'memberId' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="text-xs font-mono font-semibold break-all select-text" style={{ color: textPrimary }}>
                        {selectedEmployee.id}
                      </div>
                    </div>

                    {/* Registered Date */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-cyan-500 bg-cyan-500/10 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>REGISTERED</span>
                      </div>
                      <div className="text-sm font-bold" style={{ color: textPrimary }}>
                        {selectedEmployee.createdAt ? new Date(selectedEmployee.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Unknown'}
                      </div>
                    </div>

                    {/* Combined Active & Last Login */}
                    <div
                      className="p-4 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-500 bg-emerald-500/10 shrink-0">
                          <UserCheck className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>STATUS & LOGIN ACTIVITY</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: selectedEmployee.isActive ? '#10B981' : textMuted }}>
                          <span className={`w-2 h-2 rounded-full ${selectedEmployee.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          <span>{selectedEmployee.isActive ? 'Active Member' : 'Deactivated'}</span>
                        </div>
                        <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: textMuted }}>
                          <span>Last login:</span>
                          <span className="font-semibold truncate" style={{ color: textPrimary }}>
                            {selectedEmployee.lastLoginAt ? new Date(selectedEmployee.lastLoginAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Account not yet activated'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 4: Account Actions & Danger Zone */}
                {isAdmin && (
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-500">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Account Status & Actions</span>
                    </div>

                    <div
                      className="p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                      style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                    >
                      <div className="flex items-center gap-4">
                        {/* Interactive switch */}
                        <button
                          type="button"
                          onClick={() => requestToggleActive(selectedEmployee)}
                          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 focus:outline-none"
                          style={{ backgroundColor: selectedEmployee.isActive ? '#10B981' : '#94a3b8' }}
                          title={selectedEmployee.isActive ? 'Click to deactivate' : 'Click to reactivate'}
                        >
                          <span
                            className="inline-block h-4 w-4 rounded-full bg-white shadow-md transition-transform"
                            style={{ transform: selectedEmployee.isActive ? 'translateX(24px)' : 'translateX(4px)' }}
                          />
                        </button>

                        <div className="flex flex-col">
                          <div className="text-xs font-black uppercase tracking-wider" style={{ color: selectedEmployee.isActive ? '#10B981' : textMuted }}>
                            {selectedEmployee.isActive ? 'ACTIVE MEMBER' : 'DEACTIVATED ACCOUNT'}
                          </div>
                          <div className="text-xs" style={{ color: textMuted }}>
                            {selectedEmployee.isActive
                              ? 'Member is active and has access to assigned branch operations.'
                              : 'Member is deactivated and cannot log into the portal.'}
                          </div>
                        </div>
                      </div>

                      {!isProtectedFromDelete(selectedEmployee.role) && (
                        <button
                          onClick={() => requestDelete(selectedEmployee)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-red-500/30 text-red-500 hover:bg-red-500/10 active:scale-95"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          <span>DELETE MEMBER</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

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

            {/* ── Registered Tickets Tab (warranty registrars only) ── */}
            {activeDrawerTab === 'registrations' && isWarrantyRegistrar(selectedEmployee.jobTitle) && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <WarrantyRegistrationHistoryTable
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
                  <h3 className="font-black text-base uppercase tracking-tight" style={{ color: textPrimary }}>EDIT ACCOUNT</h3>
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
                <div className="text-[10px] font-black uppercase tracking-widest self-start" style={{ color: textMuted }}>PROFILE PHOTO</div>
                
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
                        <span className="text-[10px] font-black uppercase tracking-wider text-white">CHANGE PHOTO</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400 p-4">
                      <div className="w-12 h-12 rounded-full bg-slate-500/10 flex items-center justify-center">
                        <Plus className="w-6 h-6 text-slate-400" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }}>CLICK TO UPLOAD</span>
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: textMuted }}>PNG, JPG OR WEBP</span>
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
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all hover:bg-slate-500/10 w-full text-center"
                    style={{ borderColor: border, color: textPrimary }}
                  >
                    UPLOAD PHOTO
                  </button>
                  {editForm.profileImage && (
                    <button
                      type="button"
                      onClick={() => setEditForm(p => ({ ...p, profileImage: '' }))}
                      className="text-xs text-red-500 font-black uppercase tracking-wider hover:underline"
                    >
                      REMOVE PHOTO
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Input Fields Form */}
              <div className="flex-1 flex flex-col gap-5">
                {formErr && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-semibold uppercase">{formErr}</div>}

                {/* ── Section: General Info ── */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">GENERAL INFORMATION</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="FULL NAME" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} onBlur={e => setEditForm(p => ({ ...p, name: formatPersonName(e.target.value) }))} />
                    </Field>
                    <Field label="NICKNAME (DROPDOWN SHORT NAME)" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.nickname} onChange={e => setEditForm(p => ({ ...p, nickname: e.target.value }))} placeholder="e.g. ALLAN, CRIS, TROY" />
                    </Field>
                    <Field label="LOGIN EMAIL" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
                    </Field>
                    <Field label="PHONE CONTACT" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XX XXX XXXX" />
                    </Field>
                    <Field label="PERSONAL EMAIL" labelColor={textMuted}>
                      <input className={inputCls} style={inputStyle} type="email" value={editForm.personalEmail} onChange={e => setEditForm(p => ({ ...p, personalEmail: e.target.value }))} placeholder="personal@email.com" />
                    </Field>
                  </div>
                </div>

                {/* ── Section: Job Details ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">SYSTEM & JOB SETTINGS</h4>
                  {editTarget && editForm.role !== editTarget.role && (
                    <div className="mb-3 text-xs rounded-xl px-3 py-2.5 border" style={{ borderColor: 'rgba(59,130,246,0.25)', backgroundColor: 'rgba(59,130,246,0.08)', color: '#3B82F6' }}>
                      Role will change: {describeRoleChange(editTarget.role, editForm.role)}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="ROLE" labelColor={textMuted}>
                      <select className={inputCls} style={inputStyle}
                        value={editForm.role}
                        onChange={e => setEditForm(p => ({ ...p, ...adaptEditFormForRole(p, e.target.value) }))}
                      >
                        <option value="EMPLOYEE">{ROLE_META.EMPLOYEE.label.toUpperCase()}</option>
                        <option value="MANAGER">{ROLE_META.MANAGER.label.toUpperCase()}</option>
                        {isAdmin && <option value="MANAGEMENT">{ROLE_META.MANAGEMENT.label.toUpperCase()}</option>}
                      </select>
                    </Field>
                    {editForm.role !== 'MANAGEMENT' && (
                      <Field label={ROLE_META[editForm.role as AssignableRole]?.requiresBranch ? 'BRANCH ASSIGNMENT *' : 'BRANCH ASSIGNMENT'} labelColor={textMuted}>
                        <select className={inputCls} style={inputStyle} value={editForm.branchId} onChange={e => setEditForm(p => ({ ...p, branchId: e.target.value }))}>
                          <option value="">— UNASSIGNED —</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                        </select>
                      </Field>
                    )}
                    {isAdmin && editForm.role === 'EMPLOYEE' && (
                      <div className="col-span-1 sm:col-span-2">
                        <Field label="SCHEDULE VIEW ACCESS (READ-ONLY BRANCHES)" labelColor={textMuted}>
                          <div className="flex flex-col gap-2 p-3 rounded-xl border" style={{ backgroundColor: inputBg, borderColor: border }}>
                            <p className="text-[11px] font-medium" style={{ color: textMuted }}>
                              Grant this member read-only schedule viewing access to additional branches (e.g. Taguig – Sales for a Taguig – Services member).
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {branches
                                .filter(b => b.id !== editForm.branchId)
                                .map(b => {
                                  const selectedIds = (editForm.viewBranchIds || '').split(',').map(s => s.trim()).filter(Boolean)
                                  const isChecked = selectedIds.includes(b.id)
                                  return (
                                    <label
                                      key={b.id}
                                      className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors select-none ${
                                        isChecked
                                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300'
                                      }`}
                                      style={{ borderColor: isChecked ? '#10B981' : border }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={e => {
                                          const next = e.target.checked
                                            ? [...selectedIds, b.id]
                                            : selectedIds.filter(id => id !== b.id)
                                          setEditForm(p => ({ ...p, viewBranchIds: next.join(',') }))
                                        }}
                                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                                      />
                                      <span className="truncate">{b.name.toUpperCase()}</span>
                                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-black ml-auto shrink-0">
                                        VIEW ONLY
                                      </span>
                                    </label>
                                  )
                                })}
                            </div>
                          </div>
                        </Field>
                      </div>
                    )}
                    {ROLE_META[editForm.role as AssignableRole]?.hint && (
                      <p className="col-span-1 sm:col-span-2 text-[11px] leading-relaxed" style={{ color: textMuted }}>
                        {ROLE_META[editForm.role as AssignableRole].hint}
                      </p>
                    )}
                    {(editForm.role === 'EMPLOYEE' || editForm.role === 'MANAGEMENT') && (
                      <div className="col-span-1 sm:col-span-2">
                        <Field label="JOB TITLE (SELECT ANY THAT APPLY)" labelColor={textMuted}>
                          <JobTitleMultiSelect
                            value={editForm.jobTitle}
                            onChange={next => setEditForm(p => ({ ...p, jobTitle: next }))}
                            options={allJobTitles}
                            onAddCustom={addCustomJobTitle}
                            inputCls={inputCls}
                            inputStyle={inputStyle}
                            border={border}
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Section: Birthdate ── */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-500 mb-3">BIRTHDATE</h4>
                  <Field label="MEMBER BIRTHDATE" labelColor={textMuted}>
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
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-500 mb-3">DATE HIRED</h4>
                  <Field label="MEMBER DATE HIRED" labelColor={textMuted}>
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
                    <div className="text-sm font-black uppercase tracking-wide" style={{ color: textPrimary }}>ACCOUNT STATUS</div>
                    <div className="text-xs uppercase font-medium" style={{ color: textMuted }}>TOGGLE TO ENABLE OR DISABLE LOGIN ACCESS</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(p => ({ ...p, isActive: !p.isActive }))}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all"
                    style={editForm.isActive
                      ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' }
                      : { color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.2)' }}
                  >
                    {editForm.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {editForm.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </button>
                </div>

                {/* New Password */}
                <div className="border-t pt-4" style={{ borderColor: border }}>
                  <Field label="NEW PASSWORD (LEAVE BLANK TO KEEP CURRENT)" labelColor={textMuted}>
                    <div className="relative">
                      <input
                        className={inputCls}
                        style={{ ...inputStyle, paddingRight: '2.75rem' }}
                        type={showPass ? 'text' : 'password'}
                        value={editForm.newPassword}
                        onChange={e => setEditForm(p => ({ ...p, newPassword: e.target.value }))}
                        placeholder="ENTER NEW PASSWORD TO CHANGE…"
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
              <button onClick={() => setEditTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider border transition-all hover:opacity-85" style={{ borderColor: border, color: textMuted, backgroundColor: 'transparent' }}>
                CANCEL
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
                {saving ? 'SAVING…' : 'SAVE CHANGES'}
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
                <h3 className="text-lg font-black uppercase tracking-tight" style={{ color: textPrimary }}>CREATE ACCOUNT</h3>
                <p className="text-xs uppercase font-medium mt-0.5" style={{ color: textMuted }}>{CREATE_STEPS.find(s => s.id === createStep)?.hint.toUpperCase()}</p>
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
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors"
                        style={{
                          backgroundColor: active || done ? 'rgba(16,185,129,0.15)' : inputBg,
                          color: active || done ? '#10B981' : textMuted,
                          border: `1px solid ${active || done ? 'rgba(16,185,129,0.35)' : border}`,
                        }}
                      >
                        {done ? <Check className="w-3.5 h-3.5" /> : step.id}
                      </div>
                      <div className="min-w-0 hidden sm:block">
                        <div className="text-xs font-black uppercase tracking-wider truncate" style={{ color: active ? textPrimary : textMuted }}>{step.label}</div>
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
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 font-semibold uppercase">{formErr}</div>
              )}

              {createStep === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="FULL NAME" labelColor={textMuted}>
                      <input
                        className={inputCls}
                        style={inputStyle}
                        value={createForm.name}
                        onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                        onBlur={e => setCreateForm(p => ({ ...p, name: formatPersonName(e.target.value) }))}
                        placeholder="JUAN DELA CRUZ"
                        autoFocus
                      />
                    </Field>
                    <Field label="NICKNAME (OPTIONAL)" labelColor={textMuted}>
                      <input
                        className={inputCls}
                        style={inputStyle}
                        value={createForm.nickname}
                        onChange={e => setCreateForm(p => ({ ...p, nickname: e.target.value }))}
                        placeholder="e.g. JUAN"
                      />
                    </Field>
                  </div>
                  <Field label="LOGIN EMAIL" labelColor={textMuted}>
                    <input className={inputCls} style={inputStyle} type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value.trim().toLowerCase() }))} placeholder="juan@ashcol.com.ph" />
                  </Field>
                  <Field label="PERSONAL EMAIL" labelColor={textMuted}>
                    <input className={inputCls} style={inputStyle} type="email" value={createForm.personalEmail} onChange={e => setCreateForm(p => ({ ...p, personalEmail: e.target.value.trim().toLowerCase() }))} placeholder="personal@email.com" />
                  </Field>
                  <Field label="PHONE" labelColor={textMuted}>
                    <input className={inputCls} style={inputStyle} value={createForm.phone} onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XX XXX XXXX" />
                  </Field>
                </div>
              )}

              {createStep === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="ROLE" labelColor={textMuted}>
                    <select className={inputCls} style={inputStyle} value={createForm.role}
                      onChange={e => setCreateForm(p => ({ ...p, ...adaptEditFormForRole(p, e.target.value) }))}>
                      <option value="EMPLOYEE">{ROLE_META.EMPLOYEE.label.toUpperCase()}</option>
                      <option value="MANAGER">{ROLE_META.MANAGER.label.toUpperCase()}</option>
                      {isAdmin && <option value="MANAGEMENT">{ROLE_META.MANAGEMENT.label.toUpperCase()}</option>}
                    </select>
                  </Field>
                  {isAdmin && createForm.role !== 'MANAGEMENT' && (
                    <Field label="BRANCH" labelColor={textMuted}>
                      <select className={inputCls} style={inputStyle} value={createForm.branchId} onChange={e => setCreateForm(p => ({ ...p, branchId: e.target.value }))}>
                        <option value="">SELECT BRANCH</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                      </select>
                    </Field>
                  )}
                  {(createForm.role === 'EMPLOYEE' || createForm.role === 'MANAGEMENT') && (
                    <div className="sm:col-span-2">
                      <Field label="JOB TITLE (SELECT ANY THAT APPLY)" labelColor={textMuted}>
                        <JobTitleMultiSelect
                          value={createForm.jobTitle}
                          onChange={next => setCreateForm(p => ({ ...p, jobTitle: next }))}
                          options={allJobTitles}
                          onAddCustom={addCustomJobTitle}
                          inputCls={inputCls}
                          inputStyle={inputStyle}
                          border={border}
                        />
                      </Field>
                    </div>
                  )}
                  {ROLE_META[createForm.role as AssignableRole]?.hint && (
                    <p className="sm:col-span-2 text-xs leading-relaxed rounded-xl px-4 py-3 border uppercase font-medium" style={{ color: textMuted, borderColor: border, backgroundColor: inputBg }}>
                      {ROLE_META[createForm.role as AssignableRole].hint}
                    </p>
                  )}
                </div>
              )}

              {createStep === 3 && (
                <div className="flex flex-col gap-5">
                  <Field label="BIRTHDATE" labelColor={textMuted}>
                    <input
                      type="date"
                      className={inputCls}
                      style={inputStyle}
                      value={createForm.birthDate}
                      onChange={e => setCreateForm(p => ({ ...p, birthDate: e.target.value }))}
                    />
                  </Field>
                  <Field label="DATE HIRED (OPTIONAL)" labelColor={textMuted}>
                    <input
                      type="date"
                      className={inputCls}
                      style={inputStyle}
                      value={createForm.dateHired}
                      onChange={e => setCreateForm(p => ({ ...p, dateHired: e.target.value }))}
                    />
                  </Field>
                  <p className="text-xs rounded-xl px-4 py-3 border uppercase font-medium" style={{ color: textMuted, borderColor: border, backgroundColor: inputBg }}>
                    A temporary password will be emailed automatically. You can copy it on the next screen right after creation.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex gap-3 shrink-0" style={{ borderColor: border }}>
              <button onClick={resetCreateFlow} className="px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider border transition-all hover:opacity-85" style={{ borderColor: border, color: textMuted }}>CANCEL</button>
              {createStep > 1 && (
                <button
                  onClick={() => { setFormErr(''); setCreateStep(prev => (prev - 1) as 1 | 2 | 3) }}
                  className="px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider border transition-all hover:opacity-85"
                  style={{ borderColor: border, color: textPrimary }}
                >
                  BACK
                </button>
              )}
              <div className="flex-1" />
              {createStep < 3 ? (
                <button onClick={handleCreateNext} className="px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider text-white transition-all hover:opacity-90" style={{ backgroundColor: '#10B981' }}>
                  CONTINUE
                </button>
              ) : (
                <button onClick={handleCreate} disabled={createSaving} className="px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
                  {createSaving ? 'CREATING…' : 'CREATE ACCOUNT'}
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
                <h3 className="text-lg font-black uppercase tracking-tight" style={{ color: textPrimary }}>ACCOUNT CREATED</h3>
                <p className="text-xs uppercase font-medium mt-0.5" style={{ color: textMuted }}>SHARE THESE CREDENTIALS — THEY WON'T BE SHOWN AGAIN.</p>
              </div>
              <button onClick={() => setNewTechCreds(null)} className="p-2 rounded-xl hover:bg-slate-500/10" style={{ color: textMuted }}><X className="w-5 h-5" /></button>
            </div>

            {[
              { label: 'LOGIN EMAIL', value: newTechCreds.email, field: 'email' as const },
              { label: 'TEMPORARY PASSWORD', value: newTechCreds.password, field: 'password' as const },
            ].map(row => (
              <div key={row.field}>
                <div className="text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: textMuted }}>{row.label}</div>
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

            <button onClick={() => setNewTechCreds(null)} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider text-white transition-all hover:opacity-90" style={{ backgroundColor: '#10B981' }}>DONE</button>
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
                <h3 className="font-black uppercase tracking-tight" style={{ color: textPrimary }}>DELETE ACCOUNT</h3>
                <p className="text-sm mt-0.5" style={{ color: textMuted }}>Remove <strong>{deleteTarget.name}</strong>? This cannot be undone.</p>
              </div>
            </div>
            <div className="rounded-xl p-3 border text-xs uppercase" style={{ borderColor: border, backgroundColor: inputBg, color: textMuted }}>
              <strong style={{ color: textPrimary }}>EMAIL:</strong> {deleteTarget.email}<br />
              <strong style={{ color: textPrimary }}>ROLE:</strong> {resolveLabel(deleteTarget.role, deleteTarget.jobTitle).toUpperCase()}<br />
              <strong style={{ color: textPrimary }}>BRANCH:</strong> {(deleteTarget.branchName || 'UNASSIGNED').toUpperCase()}
              {deleteTarget.role.toUpperCase() === 'MANAGER' && (
                <p className="mt-2 text-amber-500 font-semibold uppercase">THIS USER IS LINKED AS BRANCH OIC. DELETING WILL UNLINK THEM FROM THE BRANCH.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleteSaving} className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider border transition-all" style={{ borderColor: border, color: textMuted }}>CANCEL</button>
              <button onClick={handleDelete} disabled={deleteSaving} className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-50">
                {deleteSaving ? 'DELETING…' : 'DELETE'}
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
