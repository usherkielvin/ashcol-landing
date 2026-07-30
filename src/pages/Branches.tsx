import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, MapPin, Phone, Mail, Building2, ExternalLink, Edit3, X, Loader2, FileText, CheckCircle2, XCircle, Gift, Receipt, HelpCircle, Plus, ArrowLeft, Trash2, Users, Camera } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { PUBLIC_BRANCHES } from '../data/branches'
import UserAvatar from '../components/UserAvatar'
import { API_BASE_URL, formatPersonName, isSameBaseBranch, resolveScopedBranchId, isMayDtrEditWindow, isEmployeePortalRole, isPortalAdmin, isTaguigServicesScope, resolveImageUrl } from '../utils/api'
import {
  buildBranchRoster,
  isDriverEmployee,
  isSalesCoordinatorEmployee,
  notifyBranchRosterUpdated,
  resolveBranchApiId,
  saveBranchRosterToLineup,
  type BranchRoster,
} from '../utils/branchRoster'

interface AuditRow {
  id?: string | null
  branchId: string
  branchName: string
  auditLine?: string | null
  status: string
  grossSales: number
  targetDailyQuota: number
  difference: number
  remarks: string
  cohPreviousDay: number
  fundFromHo: number
  cashReturns: number
  totalCohCfd: number
  totalCashCollection: number
  totalOnlineCollection: number
  totalExpenses: number
  totalForPurchase: number
  forCollection: number
  rebatesForCollection: number
  totalUnitsScheduled?: number
  totalUnitsSurveyOnly?: number
  totalRescheduled?: number
  totalUnitsInstalledServiced: number
  totalCancelled: number
  totalUnitsFreeInstall: number
  timeUploaded: string | null
}

const peso = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const isNoTransaction = (r: string) =>
  r === 'NO SCHED' || r === 'NO TRANSACTION' || r === 'NO RECORD' || r === 'NO REPORT'

interface Branch {
  id?: string
  name: string
  location: string
  address: string
  phone?: string
  email: string
  isActive: boolean
  managerId?: string
  targetDailyQuota?: number
  tag?: string
  color?: string
  phones?: string[]
  landline?: string
  mapUrl?: string
  region?: string
  isHQ?: boolean
  oic: string
  salesCoordinator?: string
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

const isTaguigBranchId = (id?: string | null) =>
  !!id && (
    id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b' ||
    id.startsWith('2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-') ||
    id.toUpperCase().startsWith('BR-TAGUIG')
  )

const isSalesCoordinator = isSalesCoordinatorEmployee

function PersonnelChipList({
  names,
  emptyLabel,
  chipClass = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
}: {
  names: string[]
  emptyLabel: string
  chipClass?: string
}) {
  if (names.length === 0) {
    return <span className="text-[11px] italic text-slate-400">{emptyLabel}</span>
  }
  return (
    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-0.5">
      {names.map((name) => (
        <span
          key={name}
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border border-slate-200/40 dark:border-slate-700/50 ${chipClass}`}
        >
          {name}
        </span>
      ))}
    </div>
  )
}

const initialsFor = (name?: string) => {
  if (!name) return 'NA'
  return name.split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 3).toUpperCase()
}

type StaffRecord = {
  id?: string
  name?: string
  phone?: string
  jobTitle?: string
  role?: string
  dateHired?: string
  date_hired?: string
  branchId?: string
  email?: string
  profileImage?: string
}

type EditableTeamMember = {
  key: string
  name: string
  kind: 'drivers' | 'installers'
  roleLabel: string
  phone: string
  dateHired: string
  profileImage: string
  userId?: string
}

type MemberModalMode = 'add' | 'edit'

type MemberFormState = {
  name: string
  kind: 'drivers' | 'installers'
  roleLabel: string
  phone: string
  dateHired: string
  profileImage: string
  userId?: string
  employeePickId: string
}

const emptyMemberForm = (kind: 'drivers' | 'installers' = 'drivers'): MemberFormState => ({
  name: '',
  kind,
  roleLabel: kind === 'drivers' ? 'DRIVER' : 'INSTALLER',
  phone: '',
  dateHired: '',
  profileImage: '',
  userId: undefined,
  employeePickId: '',
})

const ROSTER_DETAILS_STORAGE_KEY = 'ashcol-branch-roster-details'

type StoredRosterDetails = Record<string, {
  phone?: string
  dateHired?: string
  profileImage?: string
  roleLabel?: string
  kind?: 'drivers' | 'installers'
}>

function loadStoredRosterDetails(branchId: string): StoredRosterDetails {
  try {
    const raw = localStorage.getItem(ROSTER_DETAILS_STORAGE_KEY)
    if (!raw) return {}
    const all = JSON.parse(raw) as Record<string, StoredRosterDetails>
    return all[branchId] || {}
  } catch {
    return {}
  }
}

function saveStoredRosterDetails(branchId: string, members: EditableTeamMember[]) {
  try {
    const raw = localStorage.getItem(ROSTER_DETAILS_STORAGE_KEY)
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, StoredRosterDetails>
    const next: StoredRosterDetails = {}
    for (const m of members) {
      const key = m.name.trim().toLowerCase()
      if (!key) continue
      next[key] = {
        phone: m.phone,
        dateHired: m.dateHired,
        profileImage: m.profileImage,
        roleLabel: m.roleLabel,
        kind: m.kind,
      }
    }
    all[branchId] = next
    localStorage.setItem(ROSTER_DETAILS_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore quota / private mode
  }
}

function hireDateInputValue(raw?: string | null): string {
  if (!raw) return ''
  const key = String(raw).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : ''
}

function findStaffByName(name: string, staff: StaffRecord[]): StaffRecord | undefined {
  const key = name.trim().toLowerCase()
  if (!key) return undefined
  return staff.find((s) => (s.name || '').trim().toLowerCase() === key)
}

function resolveRoleLabel(kind: 'drivers' | 'installers', title?: string | null, fallback?: string): string {
  if (fallback) return fallback
  const t = (title || '').trim().toUpperCase()
  if (kind === 'drivers') {
    if (t.includes('DRIVER')) return t
    return 'DRIVER'
  }
  if (t.includes('TECHNICIAN')) return 'TECHNICIAN'
  if (t.includes('HELPER')) return 'HELPER'
  if (t.includes('INSTALLER')) return 'INSTALLER'
  return t || 'INSTALLER'
}

function newMemberKey() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function hydrateTeamMembers(
  roster: BranchRoster,
  staff: StaffRecord[],
  branchId: string,
): EditableTeamMember[] {
  const stored = loadStoredRosterDetails(branchId)
  const build = (names: string[], kind: 'drivers' | 'installers') =>
    names.map((name) => {
      const match = findStaffByName(name, staff)
      const cached = stored[name.trim().toLowerCase()]
      return {
        key: newMemberKey(),
        name,
        kind: cached?.kind || kind,
        roleLabel: resolveRoleLabel(kind, match?.jobTitle, cached?.roleLabel),
        phone: (match?.phone || cached?.phone || '').trim(),
        dateHired: hireDateInputValue(match?.dateHired || match?.date_hired || cached?.dateHired),
        profileImage: (match?.profileImage || cached?.profileImage || '').trim(),
        userId: match?.id ? String(match.id) : undefined,
      } satisfies EditableTeamMember
    })
  return [...build(roster.drivers, 'drivers'), ...build(roster.installers, 'installers')]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'drivers' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
}

function rosterFromMembers(members: EditableTeamMember[]): BranchRoster {
  const drivers: string[] = []
  const installers: string[] = []
  const seen = new Set<string>()
  for (const m of members) {
    const name = m.name.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (m.kind === 'drivers') drivers.push(name)
    else installers.push(name)
  }
  return { drivers, installers }
}

export default function Branches() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const [branches, setBranches] = useState<Branch[]>([])
  const [managers, setManagers] = useState<any[]>([])
  const [employeesList, setEmployeesList] = useState<any[]>([])

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
    isActive: true,
    targetDailyQuota: ''
  })
  const [editRoster, setEditRoster] = useState<BranchRoster>({ drivers: [], installers: [] })
  const [teamMembers, setTeamMembers] = useState<EditableTeamMember[]>([])
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [memberModalMode, setMemberModalMode] = useState<MemberModalMode>('add')
  const [editingMemberKey, setEditingMemberKey] = useState<string | null>(null)
  const [memberForm, setMemberForm] = useState<MemberFormState>(emptyMemberForm())
  const [memberFormError, setMemberFormError] = useState('')
  const [oicContact, setOicContact] = useState({
    id: '',
    name: '',
    phone: '',
    email: '',
    profileImage: '',
  })
  const [saving, setSaving] = useState(false)

  const resolveOicPerson = (branch: Branch) => {
    const byId = branch.managerId
      ? (
          managers.find((m: any) => m.id === branch.managerId)
          || employeesList.find((e: any) => e.id === branch.managerId)
        )
      : null
    if (byId) return byId
    const oicName = (branch.oic || '').trim().toLowerCase()
    if (!oicName || oicName === 'unassigned') return null
    return (
      managers.find((m: any) => (m.name || '').trim().toLowerCase() === oicName)
      || employeesList.find((e: any) => (e.name || '').trim().toLowerCase() === oicName)
      || null
    )
  }

  // Performance data for the selected branch
  const [branchPerfData, setBranchPerfData] = useState<AuditRow | null>(null)
  const [branchPerfLoading, setBranchPerfLoading] = useState(false)
  const [branchPerfItems, setBranchPerfItems] = useState<{ items: any[]; receivedBy?: string } | null>(null)
  const [branchPerfItemsLoading, setBranchPerfItemsLoading] = useState(false)

  const isRoleAdmin = isPortalAdmin(user?.role)

  const [globalBranchId, setGlobalBranchId] = useState<string | null>(
    () => localStorage.getItem('ashcol-global-branch-id')
  )

  useEffect(() => {
    const syncGlobal = () => {
      setGlobalBranchId(localStorage.getItem('ashcol-global-branch-id'))
    }
    window.addEventListener('ashcol-global-branch-change', syncGlobal)
    return () => window.removeEventListener('ashcol-global-branch-change', syncGlobal)
  }, [])

  const showEditButton = useMemo(() => {
    if (!selectedBranch) return false
    
    // Admin check
    if (isRoleAdmin) {
      if (!globalBranchId) return false
      
      // Special taguig mapping
      if (globalBranchId === 'BR-TAGUIG-SALES-sales') {
        return selectedBranch.id === 'BR-TAGUIG-SALES-sales' || selectedBranch.id === 'BR-TAGUIG-SALES'
      }
      if (globalBranchId === 'BR-TAGUIG-SALES-services') {
        return selectedBranch.id === 'BR-TAGUIG-SALES-services' || (selectedBranch.id === 'BR-TAGUIG-SALES' && branchPerfData?.auditLine === 'TAGUIG_SERVICE')
      }
      return selectedBranch.id === globalBranchId
    }
    
    // Non-admin check
    const userRole = (user?.role || '').toLowerCase()
    const jobTitleLower = (user?.jobTitle || '').trim().toLowerCase()
    const isSalesCoordinator = userRole === 'employee' && (
      jobTitleLower === 'sales coordinator' ||
      jobTitleLower === 'coordinator' ||
      jobTitleLower.includes('coor')
    )
    const isManager = userRole === 'manager' || isSalesCoordinator || userRole === 'oic'
    const today = new Date().toISOString().split('T')[0]
    const mayEmployeeEdit = isEmployeePortalRole(userRole) && isMayDtrEditWindow(today)
    if (!isManager && !mayEmployeeEdit) return false
    
    // A non-admin manager can only edit their own branch DTR
    if (!user?.branchId) return false
    
    if (!isSameBaseBranch(user.branchId, selectedBranch.id)) return false
    
    // For Taguig, match the audit line / sub-branch
    const resolvedUserBranch = resolveScopedBranchId(user.branchId)
    if (resolvedUserBranch.toUpperCase().includes('TAGUIG')) {
      const isServiceUser = isTaguigServicesScope(user.branchId, user.email, user.jobTitle)
      const isServiceBranch = (selectedBranch.id || '').toLowerCase().includes('service') || selectedBranch.name.toUpperCase().includes('SERVICE')
      return isServiceUser === isServiceBranch
    }
    
    return true
  }, [selectedBranch, isRoleAdmin, user, branchPerfData, globalBranchId])

  const editReportUrl = useMemo(() => {
    if (!selectedBranch) return ''
    if (branchPerfData?.id) {
      return `/audit-report?tab=submit&id=${branchPerfData.id}`
    }
    
    // We are creating a new report
    const baseBranchId = selectedBranch.id?.replace(/-(sales|services)$/i, '') || ''
    const today = new Date().toISOString().split('T')[0]
    
    let auditLine = ''
    if (selectedBranch.id?.toLowerCase().includes('taguig')) {
      const nameUpper = selectedBranch.name.toUpperCase()
      const idLower = selectedBranch.id.toLowerCase()
      if (idLower.includes('services') || idLower.includes('service') || nameUpper.includes('SERVICES') || nameUpper.includes('SERVICE')) {
        auditLine = 'TAGUIG_SERVICE'
      } else {
        auditLine = 'TAGUIG_SALES'
      }
    }
    
    return `/audit-report?tab=submit&branchId=${baseBranchId}&date=${today}&auditLine=${auditLine}`
  }, [selectedBranch, branchPerfData])

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#ffffff' : '#0F1A2E'

  const fetchBranchPerformance = useCallback(async (branch: Branch) => {
    setBranchPerfData(null)
    setBranchPerfLoading(true)
    setBranchPerfItems(null)
    setBranchPerfItemsLoading(false)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`${API_BASE_URL}/v1/reports/audit-summary?date=${today}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const rows: AuditRow[] = await res.json()
        // Find matching row for this branch
        const branchIdLower = (branch.id || '').toLowerCase()
        const branchNameLower = branch.name.toLowerCase()
        // Try exact branchId match first
        let match = rows.find(r => r.branchId?.toLowerCase() === branchIdLower)
        // Fallback: match on name
        if (!match) {
          match = rows.find(r => {
            const rn = r.branchName.toLowerCase()
            return rn === branchNameLower ||
              rn.includes(branchNameLower.replace('ashcol ', '').trim()) ||
              branchNameLower.includes(rn.replace('ashcol ', '').trim())
          })
        }
        // Special Taguig: match by audit line / name substring
        if (!match && branchIdLower.includes('taguig')) {
          const isServices = branchIdLower.endsWith('-services') || branchNameLower.includes('service')
          match = rows.find(r => {
            const rn = r.branchName.toLowerCase()
            if (isServices) return rn.includes('taguig') && (rn.includes('service') || r.auditLine?.includes('SERVICE'))
            return rn.includes('taguig') && !rn.includes('service')
          })
        }
        setBranchPerfData(match || null)

        // Fetch detailed DTR items if matching report is found
        if (match) {
          setBranchPerfItemsLoading(true)
          const bName = match.branchName.trim()
          try {
            let items = []
            let receivedBy = ''
            if (match.id) {
              const resItems = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/${match.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              if (resItems.ok) {
                const data = await resItems.json()
                items = data.items || []
                receivedBy = data.receivedBy || ''
              }
            } else {
              const params = new URLSearchParams({
                branchId: match.branchId,
                branchName: bName,
                date: today,
              })
              if (match.auditLine) params.set('auditLine', match.auditLine)
              const resItems = await fetch(`${API_BASE_URL}/v1/reports/branch-daily/items?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              if (resItems.ok) {
                items = await resItems.json()
              }
            }
            setBranchPerfItems({ items, receivedBy })
          } catch (e) {
            console.error('Failed to fetch detailed performance items', e)
            setBranchPerfItems({ items: [], receivedBy: '' })
          } finally {
            setBranchPerfItemsLoading(false)
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch branch performance', e)
      setBranchPerfData(null)
    } finally {
      setBranchPerfLoading(false)
    }
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${token}` }
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      
      const [resB, resM, resE, resAll] = await Promise.all([
        fetch(`${apiUrl}/branches`, { headers }),
        fetch(`${apiUrl}/user/all?role=MANAGER`, { headers }).catch(() => null),
        fetch(`${apiUrl}/user/all?role=EMPLOYEE`, { headers }).catch(() => null),
        fetch(`${apiUrl}/user/all`, { headers }).catch(() => null),
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
      // Prefer full directory for contact / date-hired lookup on team tables
      if (resAll && resAll.ok) {
        const payload = await resAll.json()
        const allUsers = payload?.data || payload || []
        if (Array.isArray(allUsers) && allUsers.length > 0) {
          employeesList = allUsers
        }
      }
      setEmployeesList(employeesList)

      const lineupByBranchId: Record<string, { drivers: string[]; installers: string[] }> = {}
      await Promise.all(
        apiBranches.map(async (api: Branch) => {
          if (!api.id) return
          try {
            const res = await fetch(
              `${apiUrl}/v1/lineup/suggestions?branchId=${encodeURIComponent(api.id)}`,
              { headers },
            )
            if (!res.ok) return
            const data = await res.json()
            lineupByBranchId[api.id] = {
              drivers: Array.isArray(data?.drivers) ? data.drivers.filter(Boolean) : [],
              installers: Array.isArray(data?.installers) ? data.installers.filter(Boolean) : [],
            }
          } catch {
            // Lineup suggestions are optional — branch cards fall back to employee roster only.
          }
        }),
      )

      const merged: Branch[] = []

      const processBranch = (api: Branch, suffix?: 'sales' | 'services', customName?: string) => {
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
        let oicManagerId = api.managerId || ''
        const branchManagers = managersList.filter((m: any) =>
          m.branchId === api.id ||
          (suffix ? m.branchId === `${api.id}-${suffix}` : false) ||
          (suffix === 'sales' && m.branchId === 'BR-TAGUIG-SALES') ||
          (suffix === 'services' && m.branchId === 'BR-TAGUIG-SERVICES')
        )
        if (suffix) {
          const matchedMgr = branchManagers.find((m: any) => {
            const nameLower = (m.name || '').toLowerCase()
            const isServiceMgr = isTaguigServicesScope(m.branchId || api.id, m.email, m.jobTitle)
              || nameLower.includes('service')
            return suffix === 'services' ? isServiceMgr : !isServiceMgr
          })
          if (matchedMgr) {
            oicName = matchedMgr.name
            oicManagerId = matchedMgr.id
          }
        } else if (api.managerId) {
          const foundMgr = managersList.find((m: any) => m.id === api.managerId)
          if (foundMgr) {
            oicName = foundMgr.name
            oicManagerId = foundMgr.id
          }
        } else if (branchManagers.length > 0) {
          oicName = branchManagers[0].name
          oicManagerId = branchManagers[0].id
        }

        // 2. Employees (Drivers vs Installers)
        let branchStaff = employeesList.filter((e: any) =>
          e.branchId === api.id ||
          e.branchId === `${api.id}-${suffix}` ||
          (suffix === 'sales' && e.branchId === 'BR-TAGUIG-SALES') ||
          (suffix === 'services' && e.branchId === 'BR-TAGUIG-SERVICES')
        )
        if (suffix) {
          branchStaff = branchStaff.filter((e: any) => {
            const isServiceStaff = isTaguigServicesScope(e.branchId || api.id, e.email, e.jobTitle)
            return suffix === 'services' ? isServiceStaff : !isServiceStaff
          })
        }
        const salesCoordinator = branchStaff.find(isSalesCoordinator)

        const branchKey = suffix ? `${api.id}-${suffix}` : (api.id || '')
        const lineupRoster = api.id ? lineupByBranchId[api.id] : undefined
        const employeeOptions = branchStaff.map((e: any) => ({
          id: String(e.id || ''),
          name: String(e.name || ''),
          branchId: e.branchId,
          email: e.email,
          role: e.role,
          jobTitle: e.jobTitle,
        }))
        const roster = buildBranchRoster(employeeOptions, branchKey, lineupRoster)
        const drivers = roster.drivers
        const installers = roster.installers

        if (!oicName) oicName = 'Unassigned'

        return {
          ...api,
          id: suffix ? `${api.id}-${suffix}` : api.id,
          name: customName || api.name,
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
          managerId: oicManagerId || undefined,
          oic: oicName,
          salesCoordinator: salesCoordinator?.name,
          drivers,
          installers
        }
      }

      const hasExplicitTaguigSales = apiBranches.some((api: { id?: string; name?: string }) => {
        const cleanName = (api.name || '').replace(/^(ashcol\s+)/i, '').toUpperCase()
        const apiIdUpper = (api.id || '').toUpperCase()
        const explicitId = apiIdUpper === 'BR-TAGUIG-SALES-EXPLICIT'
        const explicitName = cleanName.includes('TAGUIG') && cleanName.includes('SALES') && apiIdUpper !== 'BR-TAGUIG-SALES'
        return explicitId || explicitName
      })
      const hasExplicitTaguigServices = apiBranches.some((api: { id?: string; name?: string }) => {
        const cleanName = (api.name || '').replace(/^(ashcol\s+)/i, '').toUpperCase()
        const apiIdUpper = (api.id || '').toUpperCase()
        const explicitId = apiIdUpper === 'BR-TAGUIG-SERVICES' || apiIdUpper === 'BR-TAGUIG-SERVICE'
        const explicitName = cleanName.includes('TAGUIG') && cleanName.includes('SERVICE')
        return explicitId || explicitName
      })

      for (const api of apiBranches) {
        const cleanName = (api.name || '').replace(/^(ashcol\s+)/i, '').toUpperCase()
        const apiIdUpper = (api.id || '').toUpperCase()
        const isTaguig = cleanName === 'TAGUIG' || cleanName === 'ASHCOL TAGUIG' || cleanName.includes('TAGUIG')
        const isTaguigSalesExplicit = isTaguig && (apiIdUpper === 'BR-TAGUIG-SALES-EXPLICIT' || (cleanName.includes('SALES') && apiIdUpper !== 'BR-TAGUIG-SALES'))
        const isTaguigServicesExplicit = isTaguig && (apiIdUpper === 'BR-TAGUIG-SERVICES' || apiIdUpper === 'BR-TAGUIG-SERVICE' || cleanName.includes('SERVICE'))
        if (isTaguigSalesExplicit) {
          merged.push(processBranch(api, undefined, 'TAGUIG - SALES'))
        } else if (isTaguigServicesExplicit) {
          merged.push(processBranch(api, undefined, 'TAGUIG - SERVICES'))
        } else if (isTaguig) {
          if (!hasExplicitTaguigSales) merged.push(processBranch(api, 'sales', 'TAGUIG - SALES'))
          if (!hasExplicitTaguigServices) merged.push(processBranch(api, 'services', 'TAGUIG - SERVICES'))
        } else {
          merged.push(processBranch(api))
        }
      }
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

  const syncRosterFromMembers = (members: EditableTeamMember[]) => {
    setTeamMembers(members)
    setEditRoster(rosterFromMembers(members))
  }

  const handleEditClick = (branch: Branch) => {
    setEditingBranch(branch)
    const oicPerson = resolveOicPerson(branch)
    setEditForm({
      name: branch.name,
      location: branch.location || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      managerId: oicPerson?.id || branch.managerId || '',
      isActive: branch.isActive,
      targetDailyQuota: branch.targetDailyQuota != null ? String(branch.targetDailyQuota) : ''
    })
    setOicContact({
      id: oicPerson?.id ? String(oicPerson.id) : '',
      name: oicPerson?.name || (branch.oic !== 'Unassigned' ? branch.oic : '') || '',
      phone: String(oicPerson?.phone || ''),
      email: String(oicPerson?.email || oicPerson?.personalEmail || ''),
      profileImage: String(oicPerson?.profileImage || ''),
    })
    const roster = {
      drivers: [...branch.drivers],
      installers: [...branch.installers],
    }
    setEditRoster(roster)
    setTeamMembers(hydrateTeamMembers(roster, employeesList as StaffRecord[], branch.id || ''))
    setMemberModalOpen(false)
    setEditingMemberKey(null)
    setMemberForm(emptyMemberForm())
    setMemberFormError('')
    setSelectedBranch(null)
  }

  const openAddMemberModal = () => {
    setMemberModalMode('add')
    setEditingMemberKey(null)
    setMemberForm(emptyMemberForm('drivers'))
    setMemberFormError('')
    setMemberModalOpen(true)
  }

  const openEditMemberModal = (member: EditableTeamMember) => {
    setMemberModalMode('edit')
    setEditingMemberKey(member.key)
    setMemberForm({
      name: member.name,
      kind: member.kind,
      roleLabel: member.roleLabel,
      phone: member.phone,
      dateHired: member.dateHired,
      profileImage: member.profileImage,
      userId: member.userId,
      employeePickId: member.userId || '',
    })
    setMemberFormError('')
    setMemberModalOpen(true)
  }

  const applyEmployeePickToForm = (employeeId: string) => {
    const emp = employeesList.find((e: any) => String(e.id) === employeeId)
    if (!emp) return
    const kind: 'drivers' | 'installers' = isDriverEmployee(emp) ? 'drivers' : 'installers'
    setMemberForm((prev) => ({
      ...prev,
      employeePickId: employeeId,
      userId: String(emp.id),
      name: String(emp.name || prev.name),
      kind,
      roleLabel: resolveRoleLabel(kind, emp.jobTitle),
      phone: String(emp.phone || prev.phone || ''),
      dateHired: hireDateInputValue(emp.dateHired || emp.date_hired) || prev.dateHired,
      profileImage: String(emp.profileImage || prev.profileImage || ''),
    }))
  }

  const readProfileImageFile = (file: File, onDone: (dataUrl: string) => void) => {
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be smaller than 2MB')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => onDone(reader.result as string)
    reader.readAsDataURL(file)
  }

  const commitMemberForm = () => {
    const name = formatPersonName(memberForm.name.trim())
    if (!name) {
      setMemberFormError('Full name is required.')
      return
    }
    const duplicate = teamMembers.some(
      (m) => m.key !== editingMemberKey && m.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      setMemberFormError('That person is already on this branch team.')
      return
    }
    const roleLabel = memberForm.kind === 'drivers'
      ? (memberForm.roleLabel.trim() || 'DRIVER')
      : (memberForm.roleLabel.trim() || 'INSTALLER')

    if (memberModalMode === 'edit' && editingMemberKey) {
      syncRosterFromMembers(
        teamMembers.map((m) =>
          m.key === editingMemberKey
            ? {
                ...m,
                name,
                kind: memberForm.kind,
                roleLabel,
                phone: memberForm.phone.trim(),
                dateHired: memberForm.dateHired,
                profileImage: memberForm.profileImage,
                userId: memberForm.userId,
              }
            : m,
        ),
      )
    } else {
      syncRosterFromMembers([
        ...teamMembers,
        {
          key: newMemberKey(),
          name,
          kind: memberForm.kind,
          roleLabel,
          phone: memberForm.phone.trim(),
          dateHired: memberForm.dateHired,
          profileImage: memberForm.profileImage,
          userId: memberForm.userId,
        },
      ])
    }
    setMemberModalOpen(false)
    setEditingMemberKey(null)
    setMemberFormError('')
  }

  const updateTeamMember = (key: string, patch: Partial<EditableTeamMember>) => {
    syncRosterFromMembers(
      teamMembers.map((m) => {
        if (m.key !== key) return m
        const next = { ...m, ...patch }
        if (patch.kind && !patch.roleLabel) {
          next.roleLabel = patch.kind === 'drivers' ? 'DRIVER' : (m.roleLabel === 'DRIVER' ? 'INSTALLER' : m.roleLabel)
        }
        return next
      }),
    )
  }

  const removeTeamMember = (key: string) => {
    syncRosterFromMembers(teamMembers.filter((m) => m.key !== key))
  }

  const editBranchEmployeeOptions = useMemo(() => {
    if (!editingBranch?.id) return []
    return employeesList
      .filter((e: any) => {
        const branchKey = editingBranch.id || ''
        const apiId = resolveBranchApiId(branchKey)
        const suffix = branchKey.endsWith('-services') ? 'services' : branchKey.endsWith('-sales') ? 'sales' : null
        const matches =
          e.branchId === branchKey
          || e.branchId === apiId
          || e.branchId === `${apiId}-sales`
          || e.branchId === `${apiId}-services`
        if (!matches) return false
        if (!suffix) return true
        const isServiceStaff = isTaguigServicesScope(e.branchId || apiId, e.email, e.jobTitle)
        return suffix === 'services' ? isServiceStaff : !isServiceStaff
      })
      .map((e: any) => ({
        id: String(e.id || ''),
        name: String(e.name || ''),
        jobTitle: e.jobTitle,
        phone: e.phone,
        dateHired: e.dateHired || e.date_hired,
        profileImage: e.profileImage,
      }))
      .filter((e) => e.id && e.name)
  }, [editingBranch?.id, employeesList])

  const handleSaveEdit = async () => {
    if (!editingBranch) return
    setSaving(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
      const apiBranchId = resolveBranchApiId(editingBranch.id)
      const roster = rosterFromMembers(teamMembers)
      setEditRoster(roster)

      const quotaNum = parseFloat(editForm.targetDailyQuota)
      const payload = {
        name: editForm.name,
        location: editForm.location,
        address: editForm.address,
        phone: editForm.phone,
        email: editForm.email,
        managerId: editForm.managerId || null,
        // Do not send isActive — OIC/roster edits must not deactivate a branch.
        targetDailyQuota: !isNaN(quotaNum) && quotaNum >= 0 ? quotaNum : null
      }
      
      const res = await fetch(`${apiUrl}/branches/${apiBranchId}`, {
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

      await saveBranchRosterToLineup(token, editingBranch.id || apiBranchId, roster, apiUrl)

      // Persist contact / hire date / photo onto linked employee accounts when possible
      const patchUrl = (userId: string) =>
        isRoleAdmin
          ? `${apiUrl}/admin/users/${userId}`
          : `${apiUrl}/manager/employees/${userId}`

      if (oicContact.id) {
        try {
          await fetch(patchUrl(oicContact.id), {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              phone: oicContact.phone.trim(),
              email: oicContact.email.trim(),
            }),
          })
        } catch {
          // OIC contact sync is best-effort
        }
      }

      await Promise.all(
        teamMembers
          .filter((m) => m.userId && m.name.trim())
          .map(async (m) => {
            const body: Record<string, unknown> = {
              name: formatPersonName(m.name.trim()),
              phone: m.phone.trim(),
              dateHired: m.dateHired || null,
              profileImage: m.profileImage || '',
              jobTitle: m.roleLabel,
            }
            try {
              await fetch(patchUrl(m.userId!), {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
              })
            } catch {
              // Roster save already succeeded; skip individual profile failures
            }
          }),
      )

      saveStoredRosterDetails(editingBranch.id || apiBranchId, teamMembers)
      notifyBranchRosterUpdated()
      
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
    const exactBranch = branches.find(b => b.id === user.branchId)
    if (exactBranch) return exactBranch
    const isTaguig = isTaguigBranchId(user.branchId)
    if (isTaguig) {
      const isService = isTaguigServicesScope(user.branchId, user.email, user.jobTitle)
      const wanted = isService ? 'services' : 'sales'
      const targetId = `${user.branchId.replace(/-sales$|-services$/, '')}-${wanted}`
      return branches.find(b => b.id === targetId)
        || branches.find(b => {
          const id = (b.id || '').toLowerCase()
          const name = b.name.toLowerCase()
          return id.includes(`taguig-${wanted}`) || id.endsWith(`-${wanted}`) || name.includes(`taguig ${wanted}`)
        })
        || null
    }
    const baseBranchId = user.branchId.replace(/-sales$|-services$/, '')
    return branches.find(b => b.id === baseBranchId) || null
  }, [branches, user?.branchId, user?.email, user?.jobTitle])

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
                       || (b.salesCoordinator || '').toLowerCase().includes(q)
                       || b.drivers.some(d => d.toLowerCase().includes(q))
                       || b.installers.some(i => i.toLowerCase().includes(q))
      if (!inBranch && !inPersonnel) return false
    }



    return true
  })

  // ── Full-page Branch Team editor (not a popup) ───────────────────────────
  if (editingBranch) {
    const driverCount = teamMembers.filter((m) => m.kind === 'drivers').length
    const installerCount = teamMembers.filter((m) => m.kind === 'installers').length
    const alreadyOnTeam = new Set(teamMembers.map((m) => m.name.trim().toLowerCase()).filter(Boolean))
    const availableEmployees = editBranchEmployeeOptions.filter((e) => {
      if (memberModalMode === 'edit' && memberForm.userId && e.id === memberForm.userId) return true
      return !alreadyOnTeam.has(e.name.trim().toLowerCase())
    })
    const sortedMembers = [...teamMembers].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'drivers' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    const cellInputCls = 'w-full border rounded-lg px-2.5 py-2 text-xs font-semibold focus:outline-none focus:border-[#10B981]'
    const modalInputCls = 'w-full border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-[#10B981]'

    return (
      <div className="flex flex-col gap-5 min-h-0 flex-1 w-full relative">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setEditingBranch(null)}
              disabled={saving}
              className="mt-1 p-2 rounded-xl border shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              style={{ borderColor: border, color: textMuted }}
              title="Back to directory"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-[#10B981] shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Branch Team</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight truncate" style={{ color: textPrimary }}>
                {editingBranch.name}
              </h2>
              <p className="text-sm mt-1" style={{ color: textMuted }}>
                Add members with details, edit rows inline, and attach profile photos.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditingBranch(null)}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border text-xs font-bold"
              style={{ borderColor: border, color: textMuted }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 transition-all flex items-center gap-2"
              style={{ backgroundColor: '#10B981' }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save Team'}
            </button>
          </div>
        </div>

        {/* Office In Charge — person details (not branch contact) */}
        <div
          className="rounded-2xl border p-4 md:p-5"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex items-center gap-3 shrink-0 min-w-[220px]">
              <UserAvatar
                name={oicContact.name || 'OIC'}
                imageUrl={oicContact.profileImage}
                size="md"
                ring
              />
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Office In Charge
                </div>
                <div
                  className="text-sm font-black uppercase tracking-wide truncate"
                  style={{ color: textPrimary }}
                  title={oicContact.name || 'Unassigned'}
                >
                  {oicContact.name || 'Unassigned'}
                </div>
                <div className="text-[10px] font-bold mt-0.5" style={{ color: textMuted }}>
                  Full name is fixed from account
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  OIC Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
                  <input
                    type="text"
                    value={oicContact.phone}
                    onChange={(e) => setOicContact((prev) => ({ ...prev, phone: e.target.value }))}
                    disabled={saving || !oicContact.id}
                    placeholder={oicContact.id ? '09XX XXX XXXX' : 'No OIC account linked'}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-[#10B981] w-full disabled:opacity-60"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  OIC Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
                  <input
                    type="email"
                    value={oicContact.email}
                    onChange={(e) => setOicContact((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={saving || !oicContact.id}
                    placeholder={oicContact.id ? 'oic@ashcol.com.ph' : 'No OIC account linked'}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-[#10B981] w-full disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Combined roster table */}
        <div
          className="rounded-2xl border overflow-hidden flex flex-col min-h-[420px]"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="px-5 py-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: border }}>
            <div>
              <h3 className="text-sm font-black tracking-tight" style={{ color: textPrimary }}>
                Branch roster
              </h3>
              <p className="text-[11px]" style={{ color: textMuted }}>
                {teamMembers.length} member{teamMembers.length === 1 ? '' : 's'}
                {' · '}
                {driverCount} driver{driverCount === 1 ? '' : 's'}
                {' · '}
                {installerCount} installer{installerCount === 1 ? '' : 's'} / tech
              </p>
            </div>
            <button
              type="button"
              onClick={openAddMemberModal}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white disabled:opacity-40"
              style={{ backgroundColor: '#10B981' }}
            >
              <Plus className="w-4 h-4" /> Add Member
            </button>
          </div>

          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr style={{ backgroundColor: isLight ? '#E3F4E9' : '#0B272D' }}>
                  {['#', 'Photo', 'Full Name', 'Role', 'Contact Number', 'Date Hired', ''].map((h) => (
                    <th
                      key={h || 'actions'}
                      className="px-3 py-3.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap"
                      style={{
                        color: isLight ? '#166534' : '#86EFAC',
                        borderBottom: `1px solid ${isLight ? 'rgba(22,163,74,0.35)' : 'rgba(74,222,128,0.28)'}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm font-semibold" style={{ color: textMuted }}>
                      No team members yet. Click Add Member to open the details form.
                    </td>
                  </tr>
                ) : (
                  sortedMembers.map((row, idx) => {
                    const isDriver = row.kind === 'drivers'
                    return (
                      <tr
                        key={row.key}
                        style={{
                          backgroundColor: idx % 2 === 0 ? (isLight ? '#ffffff' : '#111827') : (isLight ? '#f7fbf8' : '#131f30'),
                          borderBottom: `1px solid ${border}`,
                        }}
                      >
                        <td className="px-3 py-2.5 text-xs font-bold tabular-nums" style={{ color: textMuted }}>{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          <label className="relative inline-flex cursor-pointer group" title="Change photo">
                            <UserAvatar name={row.name || '?'} imageUrl={row.profileImage} size="sm" />
                            <span className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Camera className="w-3.5 h-3.5 text-white" />
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={saving}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                readProfileImageFile(file, (dataUrl) => updateTeamMember(row.key, { profileImage: dataUrl }))
                                e.target.value = ''
                              }}
                            />
                          </label>
                        </td>
                        <td className="px-3 py-2.5 min-w-[180px]">
                          <input
                            type="text"
                            value={row.name}
                            disabled={saving}
                            onChange={(e) => updateTeamMember(row.key, { name: e.target.value })}
                            onBlur={(e) => updateTeamMember(row.key, { name: formatPersonName(e.target.value) })}
                            style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                            className={`${cellInputCls} uppercase tracking-wide`}
                          />
                        </td>
                        <td className="px-3 py-2.5 min-w-[150px]">
                          <select
                            value={`${row.kind}|${row.roleLabel}`}
                            disabled={saving}
                            onChange={(e) => {
                              const [kind, ...rest] = e.target.value.split('|')
                              const roleLabel = rest.join('|')
                              updateTeamMember(row.key, {
                                kind: kind as 'drivers' | 'installers',
                                roleLabel,
                              })
                            }}
                            style={{
                              backgroundColor: isDriver ? 'rgba(37,99,235,0.08)' : 'rgba(16,185,129,0.08)',
                              borderColor: isDriver ? 'rgba(37,99,235,0.35)' : 'rgba(16,185,129,0.35)',
                              color: isDriver ? '#2563EB' : '#10B981',
                            }}
                            className={`${cellInputCls} font-black uppercase tracking-wider`}
                          >
                            <option value="drivers|DRIVER">DRIVER</option>
                            <option value="installers|INSTALLER">INSTALLER</option>
                            <option value="installers|TECHNICIAN">TECHNICIAN</option>
                            <option value="installers|HELPER">HELPER</option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5 min-w-[140px]">
                          <input
                            type="text"
                            value={row.phone}
                            disabled={saving}
                            placeholder="09XX XXX XXXX"
                            onChange={(e) => updateTeamMember(row.key, { phone: e.target.value })}
                            style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                            className={cellInputCls}
                          />
                        </td>
                        <td className="px-3 py-2.5 min-w-[140px]">
                          <input
                            type="date"
                            value={row.dateHired}
                            disabled={saving}
                            onChange={(e) => updateTeamMember(row.key, { dateHired: e.target.value })}
                            style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                            className={cellInputCls}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditMemberModal(row)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold mr-1 hover:bg-slate-500/10 transition-colors"
                            style={{ color: textMuted }}
                            title="Edit details"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTeamMember(row.key)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-red-500 hover:bg-red-500/10 transition-colors"
                            title={`Remove ${row.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add / Edit member popup */}
        {memberModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: isLight ? 'rgba(241,245,249,0.92)' : 'rgba(6,11,24,0.88)', backdropFilter: 'blur(10px)' }}
            onClick={() => !saving && setMemberModalOpen(false)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: border }}>
                <div>
                  <h3 className="text-base font-black" style={{ color: textPrimary }}>
                    {memberModalMode === 'add' ? 'Add Team Member' : 'Edit Team Member'}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: textMuted }}>
                    Name, role, contact, hire date, and profile photo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-500/10"
                  style={{ color: textMuted }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-44 shrink-0 flex flex-col items-center gap-3">
                  <div className="text-[10px] font-black uppercase tracking-widest self-start" style={{ color: textMuted }}>
                    Profile Photo
                  </div>
                  <label
                    className="w-40 h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden relative group cursor-pointer hover:border-emerald-500 transition-colors"
                    style={{ borderColor: border, backgroundColor: inputBg }}
                  >
                    {memberForm.profileImage ? (
                      <>
                        <img src={resolveImageUrl(memberForm.profileImage)} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity text-white">
                          <Camera className="w-5 h-5" />
                          <span className="text-[10px] font-black uppercase">Change</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-3 text-center">
                        <Plus className="w-6 h-6" style={{ color: textMuted }} />
                        <span className="text-[11px] font-bold" style={{ color: textMuted }}>Upload photo</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        readProfileImageFile(file, (dataUrl) =>
                          setMemberForm((prev) => ({ ...prev, profileImage: dataUrl })),
                        )
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {memberForm.profileImage && (
                    <button
                      type="button"
                      onClick={() => setMemberForm((prev) => ({ ...prev, profileImage: '' }))}
                      className="text-xs font-bold text-red-500 hover:underline"
                    >
                      Remove photo
                    </button>
                  )}
                </div>

                <div className="flex-1 flex flex-col gap-3 min-w-0">
                  {memberFormError && (
                    <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 font-semibold">
                      {memberFormError}
                    </div>
                  )}

                  {availableEmployees.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                        Prefill from employees
                      </label>
                      <select
                        value={memberForm.employeePickId}
                        onChange={(e) => {
                          if (e.target.value) applyEmployeePickToForm(e.target.value)
                          else setMemberForm((prev) => ({ ...prev, employeePickId: '' }))
                        }}
                        style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                        className={modalInputCls}
                      >
                        <option value="">— Select employee (optional) —</option>
                        {availableEmployees.map((e) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={memberForm.name}
                        onChange={(e) => setMemberForm((prev) => ({ ...prev, name: e.target.value }))}
                        onBlur={(e) => setMemberForm((prev) => ({ ...prev, name: formatPersonName(e.target.value) }))}
                        placeholder="Juan Dela Cruz"
                        style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                        className={modalInputCls}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                        Team Role
                      </label>
                      <select
                        value={`${memberForm.kind}|${memberForm.roleLabel}`}
                        onChange={(e) => {
                          const [kind, ...rest] = e.target.value.split('|')
                          setMemberForm((prev) => ({
                            ...prev,
                            kind: kind as 'drivers' | 'installers',
                            roleLabel: rest.join('|'),
                          }))
                        }}
                        style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                        className={modalInputCls}
                      >
                        <option value="drivers|DRIVER">Driver</option>
                        <option value="installers|INSTALLER">Installer</option>
                        <option value="installers|TECHNICIAN">Technician</option>
                        <option value="installers|HELPER">Helper</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                        Contact Number
                      </label>
                      <input
                        type="text"
                        value={memberForm.phone}
                        onChange={(e) => setMemberForm((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="09XX XXX XXXX"
                        style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                        className={modalInputCls}
                      />
                    </div>
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: textMuted }}>
                        Date Hired
                      </label>
                      <input
                        type="date"
                        value={memberForm.dateHired}
                        onChange={(e) => setMemberForm((prev) => ({ ...prev, dateHired: e.target.value }))}
                        style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                        className={modalInputCls}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t flex justify-end gap-2 shrink-0" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border text-xs font-bold"
                  style={{ borderColor: border, color: textMuted }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitMemberForm}
                  className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white"
                  style={{ backgroundColor: '#10B981' }}
                >
                  {memberModalMode === 'add' ? 'Add to Roster' : 'Save Details'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

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
            {myBranch.targetDailyQuota != null && myBranch.targetDailyQuota > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border" style={{ backgroundColor: 'rgba(139,92,246,0.08)', color: '#8B5CF6', borderColor: 'rgba(139,92,246,0.2)' }}>
                Daily Quota: ₱{(myBranch.targetDailyQuota).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          {/* Roster list shown in a bigger and better layout */}
          <div className={`grid grid-cols-1 ${myBranch.salesCoordinator ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6`}>
            {/* OIC / Manager */}
            {(() => {
              const oicPerson = resolveOicPerson(myBranch)
              return (
                <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800/40 bg-slate-50/30 dark:bg-slate-900/10 flex flex-col gap-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Officer In Charge (OIC)</span>
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={oicPerson?.name || myBranch.oic}
                      imageUrl={oicPerson?.profileImage}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="font-extrabold text-sm truncate" style={{ color: textPrimary }}>
                        {oicPerson?.name || myBranch.oic}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold">OFFICE IN CHARGE</div>
                    </div>
                  </div>
                  {(oicPerson?.phone || oicPerson?.email) && (
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/50">
                      {oicPerson?.phone && (
                        <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: textMuted }}>
                          <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>{oicPerson.phone}</span>
                        </div>
                      )}
                      {oicPerson?.email && (
                        <div className="flex items-center gap-2 text-[11px] font-semibold truncate" style={{ color: textMuted }}>
                          <Mail className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="truncate">{oicPerson.email}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {myBranch.salesCoordinator && (
              <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800/40 bg-slate-50/30 dark:bg-slate-900/10 flex flex-col gap-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sales Coordinator</span>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold text-sm shrink-0">
                    {initialsFor(myBranch.salesCoordinator)}
                  </div>
                  <div>
                    <div className="font-extrabold text-sm" style={{ color: textPrimary }}>{myBranch.salesCoordinator}</div>
                    <div className="text-[10px] text-slate-400 font-bold">SALES COORDINATOR</div>
                  </div>
                </div>
              </div>
            )}

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
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {branch.targetDailyQuota != null && branch.targetDailyQuota > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border" style={{ backgroundColor: 'rgba(139,92,246,0.07)', color: '#8B5CF6', borderColor: 'rgba(139,92,246,0.2)' }}>
                          ₱{(branch.targetDailyQuota).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / day quota
                        </span>
                      )}
                    </div>
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

                      {branch.salesCoordinator && (
                        <div className="flex items-center justify-between text-xs py-0.5">
                          <span className="font-semibold text-slate-400">Sales Coord.:</span>
                          <span className="font-medium text-right truncate max-w-[150px]" style={{ color: textPrimary }}>
                            {branch.salesCoordinator}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5 text-xs py-0.5">
                        <span className="font-semibold text-slate-400">
                          Drivers ({branch.drivers.length})
                        </span>
                        <PersonnelChipList
                          names={branch.drivers}
                          emptyLabel="None assigned"
                          chipClass="bg-blue-500/10 text-blue-700 dark:text-blue-300"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 text-xs py-0.5">
                        <span className="font-semibold text-slate-400">
                          Installers ({branch.installers.length})
                        </span>
                        <PersonnelChipList
                          names={branch.installers}
                          emptyLabel="None assigned"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Action buttons */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-900/5 flex justify-between items-center gap-4 shrink-0">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setSelectedBranch(branch); fetchBranchPerformance(branch) }}
                      className="px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                      style={{ color: textMuted, borderColor: border }}
                    >
                      View Full Details
                    </button>
                    {(isRoleAdmin || ((user?.role === 'MANAGER' || user?.role === 'OIC') && user.branchId && isSameBaseBranch(user.branchId, branch.id))) && (
                      <button 
                        onClick={() => handleEditClick(branch)}
                        className="px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all hover:text-[#10B981] hover:border-[#10B981] inline-flex items-center gap-1.5"
                        style={{ color: textMuted, borderColor: border }}
                        title="Edit branch team roster"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Team
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

      {/* ── View Details Modal (Enhanced with Performance Data) ── */}
      {selectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
          <div
            className="w-full max-w-4xl rounded-2xl border overflow-hidden shadow-2xl flex flex-col"
            style={{ backgroundColor: cardBg, borderColor: selectedBranch.color || border, borderWidth: '1.5px', maxHeight: '94vh' }}
          >
            {/* ─── MODAL HEADER ──────────────────────────── */}
            <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="flex items-center gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-sm text-white"
                  style={{ backgroundColor: selectedBranch.color || '#10B981' }}
                >
                  {initialsFor(selectedBranch.name)}
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight" style={{ color: textPrimary }}>{selectedBranch.name}</h3>
                  <div className="flex items-center gap-2.5 mt-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{getConciseLocationTag(selectedBranch)}</span>
                    <span className="text-[11px]" style={{ color: textMuted }}>
                      {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {showEditButton && (
                  <a
                    href={editReportUrl}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all hover:opacity-90 shrink-0 text-center"
                    style={{ backgroundColor: '#10B981', border: 'none' }}
                  >
                    {branchPerfData?.id ? 'Edit DTR' : 'Create DTR'}
                  </a>
                )}
                <button
                  onClick={() => setSelectedBranch(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  style={{ color: textMuted }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ─── SCROLLABLE BODY ─────────────────────────── */}
            <div className="flex-1 overflow-y-auto">

              {/* ── PERFORMANCE SECTION ── */}
              <div className="px-8 py-6">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textMuted }}>Daily Performance Report</span>
                  <div className="flex items-center gap-3">
                    {selectedBranch?.targetDailyQuota != null && selectedBranch.targetDailyQuota > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border" style={{ backgroundColor: 'rgba(139,92,246,0.08)', color: '#8B5CF6', borderColor: 'rgba(139,92,246,0.2)' }}>
                        Target Quota: ₱{(selectedBranch.targetDailyQuota).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / day
                      </span>
                    )}
                    {branchPerfData && (
                      <span className="text-[10px]" style={{ color: textMuted }}>
                        {branchPerfData.timeUploaded
                          ? `Uploaded at ${new Date(branchPerfData.timeUploaded).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`
                          : 'Upload time not recorded'}
                      </span>
                    )}
                  </div>
                </div>

                {branchPerfLoading ? (
                  <div className="rounded-xl border py-10 flex items-center justify-center gap-2.5" style={{ backgroundColor: inputBg, borderColor: border }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: textMuted }} />
                    <span className="text-xs font-semibold" style={{ color: textMuted }}>Fetching today's performance data...</span>
                  </div>
                ) : !branchPerfData ? (
                  <div className="rounded-xl border py-10 text-center" style={{ backgroundColor: inputBg, borderColor: border }}>
                    <p className="text-sm font-bold" style={{ color: textMuted }}>No report submitted for today</p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>Data will appear once the daily report is uploaded.</p>
                  </div>
                ) : (() => {
                  const isAbove = branchPerfData.remarks === 'ABOVE QUOTA' || branchPerfData.difference > 0
                  const isPending = branchPerfData.remarks === 'PENDING'
                  const isNoTrans = isNoTransaction(branchPerfData.remarks)
                  const statusColor = isPending ? '#F59E0B' : isAbove ? '#10B981' : isNoTrans ? '#94A3B8' : '#EF4444'
                  const statusLabel = isPending ? 'PENDING' : isAbove ? 'ABOVE QUOTA' : isNoTrans ? 'NO TRANSACTION' : 'BELOW QUOTA'
                  return (
                    <div className="flex flex-col gap-4">

                      {/* Status bar */}
                      <div className="rounded-xl px-6 py-4 flex items-center justify-between gap-6"
                        style={{ backgroundColor: `${statusColor}0D`, border: `1px solid ${statusColor}28` }}>
                        <div className="flex items-center gap-5">
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: textMuted }}>STATUS</div>
                            <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider"
                              style={{ backgroundColor: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}35` }}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="border-l pl-5" style={{ borderColor: `${statusColor}25` }}>
                            <div className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: textMuted }}>DIFFERENCE</div>
                            <div className="text-lg font-black" style={{ color: statusColor }}>
                              {isAbove ? '+' : ''}₱{peso(branchPerfData.difference)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right border-l pl-6" style={{ borderColor: border }}>
                          <div className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: textMuted }}>SUBMITTED BY</div>
                          <div className="text-sm font-black" style={{ color: textPrimary }}>{user?.name || '—'}</div>
                          <div className="text-[10px]" style={{ color: textMuted }}>{selectedBranch.oic || 'Branch Staff'}</div>
                        </div>
                      </div>

                      {/* 3-column metrics table */}
                      <div className="grid grid-cols-3 rounded-xl overflow-hidden border" style={{ borderColor: border }}>
                        {[
                          {
                            title: 'Sales',
                            rows: [
                              { label: 'Gross Sales', value: `₱${peso(branchPerfData.grossSales)}`, color: textPrimary, bold: true },
                              { label: 'Target Quota', value: `₱${peso(branchPerfData.targetDailyQuota)}`, color: '#8B5CF6', bold: true },
                              { label: 'Total Expenses', value: `₱${peso(branchPerfData.totalExpenses)}`, color: '#EF4444', bold: false },
                              { label: 'Total Purchases', value: `₱${peso(branchPerfData.totalForPurchase)}`, color: '#F59E0B', bold: false },
                            ]
                          },
                          {
                            title: 'Cash Flow',
                            rows: [
                              { label: 'COH Prev Day', value: `₱${peso(branchPerfData.cohPreviousDay)}`, color: textPrimary, bold: false },
                              { label: 'Fund from HO', value: `₱${peso(branchPerfData.fundFromHo)}`, color: textPrimary, bold: false },
                              { label: 'Total COH / CFD', value: `₱${peso(branchPerfData.totalCohCfd)}`, color: textPrimary, bold: true },
                            ]
                          },
                          {
                            title: 'Collections',
                            rows: [
                              { label: 'Cash Collection', value: `₱${peso(branchPerfData.totalCashCollection)}`, color: '#10B981', bold: true },
                              { label: 'Online Collection', value: `₱${peso(branchPerfData.totalOnlineCollection)}`, color: '#3B82F6', bold: true },
                              { label: 'For Collection', value: `₱${peso(branchPerfData.forCollection)}`, color: '#F59E0B', bold: false },
                            ]
                          }
                        ].map((col, ci) => (
                          <div key={col.title} style={{ borderRight: ci < 2 ? `1px solid ${border}` : 'none' }}>
                            <div className="px-5 py-2.5 border-b" style={{ borderColor: border, backgroundColor: `${selectedBranch.color || '#10B981'}0A` }}>
                              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: selectedBranch.color || '#10B981' }}>{col.title}</span>
                            </div>
                            {col.rows.map((row, ri) => (
                              <div key={row.label} className="flex items-center justify-between px-5 py-2.5"
                                style={{ borderBottom: ri < col.rows.length - 1 ? `1px solid ${border}` : 'none' }}>
                                <span className="text-[11px]" style={{ color: textMuted }}>{row.label}</span>
                                <span className={`text-[11px] tabular-nums ${row.bold ? 'font-bold' : 'font-medium'}`} style={{ color: row.color }}>{row.value}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      {/* Redesigned Rebate Summary */}
                      <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: border, backgroundColor: cardBg }}>
                        <div className="flex items-center gap-1.5 pb-1 border-b" style={{ borderColor: border }}>
                          <FileText className="w-4 h-4 text-emerald-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: textPrimary }}>Rebate Summary</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                          {[
                            { label: 'Rebates Total', value: `₱${peso(branchPerfData.rebatesForCollection)}`, icon: <Receipt className="w-4 h-4 text-emerald-500" />, bg: 'rgba(16,185,129,0.04)', border: 'rgba(16,185,129,0.12)', text: '#10B981' },
                            { label: 'Scheduled', value: String(branchPerfData.totalUnitsScheduled || 0), icon: <HelpCircle className="w-4 h-4 text-slate-500" />, bg: 'rgba(148,163,184,0.04)', border: 'rgba(148,163,184,0.12)', text: '#64748B' },
                            { label: 'Rescheduled', value: String(branchPerfData.totalRescheduled || 0), icon: <HelpCircle className="w-4 h-4 text-slate-500" />, bg: 'rgba(148,163,184,0.04)', border: 'rgba(148,163,184,0.12)', text: '#64748B' },
                            { label: 'Installed', value: String(branchPerfData.totalUnitsInstalledServiced), icon: <CheckCircle2 className="w-4 h-4 text-blue-500" />, bg: 'rgba(59,130,246,0.04)', border: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
                            { label: 'Cancelled', value: String(branchPerfData.totalCancelled), icon: <XCircle className="w-4 h-4 text-red-500" />, bg: 'rgba(239,68,68,0.04)', border: 'rgba(239,68,68,0.12)', text: '#EF4444' },
                            { label: 'Free Install', value: String(branchPerfData.totalUnitsFreeInstall), icon: <Gift className="w-4 h-4 text-amber-500" />, bg: 'rgba(245,158,11,0.04)', border: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
                            { label: 'Survey Only', value: String(branchPerfData.totalUnitsSurveyOnly || 0), icon: <HelpCircle className="w-4 h-4 text-indigo-500" />, bg: 'rgba(99,102,241,0.04)', border: 'rgba(99,102,241,0.12)', text: '#6366F1' },
                          ].map((item) => (
                            <div key={item.label} className="rounded-xl border p-3 flex items-center justify-between transition-all duration-300 hover:scale-[1.02] hover:shadow-sm" style={{ borderColor: item.border, backgroundColor: item.bg }}>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{item.label}</span>
                                <span className="text-sm font-black tracking-tight" style={{ color: item.text }}>{item.value}</span>
                              </div>
                              <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 shadow-xs border border-slate-100 dark:border-slate-800">
                                {item.icon}
                              </div>
                            </div>
                          ))}
                        </div>

                        {branchPerfItemsLoading ? (
                          <div className="mt-1">
                            <div className="flex items-center gap-2 mb-3">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                              <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: textMuted }}>Loading detailed breakdown...</span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {[1, 2].map(i => (
                                <div key={i} className="flex gap-4 animate-pulse">
                                  <div className="h-5 flex-1 rounded bg-slate-200 dark:bg-slate-800" />
                                  <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                                  <div className="h-5 w-12 rounded bg-slate-200 dark:bg-slate-800" />
                                  <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (() => {
                          const rebateItems = (branchPerfItems?.items || []).filter(
                            (item: any) => item.type === 'REBATE'
                          )
                          if (rebateItems.length > 0) {
                            return (
                              <div className="mt-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider mb-2 block" style={{ color: textMuted }}>Detailed Rebates Breakdown</span>
                                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
                                  <table className="w-full text-xs text-left border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50/50 dark:bg-slate-900/30 font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${border}`, color: textMuted, fontSize: '9px' }}>
                                        <th className="px-3 py-2">Customer</th>
                                        <th className="px-3 py-2">Brand / Company</th>
                                        <th className="px-3 py-2">RA Number</th>
                                        <th className="px-3 py-2">HP</th>
                                        <th className="px-3 py-2 text-right">Amount Each</th>
                                        <th className="px-3 py-2 text-center">Units</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rebateItems.map((item: any, i: number) => {
                                        const desc = item.description || ''
                                        const parts = desc.startsWith('REBATE|') ? desc.split('|') : ['', '', '']
                                        const raNumber = parts[1] || '—'
                                        const hp = parts[2] || '—'
                                        const amt = item.amount || 0
                                        const qty = item.units || 0
                                        return (
                                          <tr key={i} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/20 transition-colors" style={{ borderBottom: i < rebateItems.length - 1 ? `1px solid ${border}` : 'none' }}>
                                            <td className="px-3 py-2" style={{ color: textPrimary }}>{item.customer || '—'}</td>
                                            <td className="px-3 py-2 font-bold" style={{ color: textPrimary }}>{item.company || '—'}</td>
                                            <td className="px-3 py-2">
                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                                {raNumber}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2">
                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                                                {hp}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: textPrimary }}>₱{peso(amt)}</td>
                                            <td className="px-3 py-2 text-center font-bold tabular-nums" style={{ color: textPrimary }}>{qty}</td>
                                            <td className="px-3 py-2 text-right font-black tabular-nums text-emerald-600 dark:text-emerald-400">₱{peso(amt * qty)}</td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )
                          }
                          if (branchPerfData.rebatesForCollection > 0) {
                            return (
                              <div className="mt-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider mb-2 block" style={{ color: textMuted }}>Detailed Rebates Breakdown</span>
                                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: border }}>
                                  <table className="w-full text-xs text-left border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50/50 dark:bg-slate-900/30 font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${border}`, color: textMuted, fontSize: '9px' }}>
                                        <th className="px-3 py-2">Customer</th>
                                        <th className="px-3 py-2">Brand / Company</th>
                                        <th className="px-3 py-2">RA Number</th>
                                        <th className="px-3 py-2">HP</th>
                                        <th className="px-3 py-2 text-right">Amount Each</th>
                                        <th className="px-3 py-2 text-center">Units</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr className="hover:bg-slate-50/20 dark:hover:bg-slate-900/20 transition-colors">
                                        <td className="px-3 py-2"><span className="text-slate-400">—</span></td>
                                        <td className="px-3 py-2 font-bold" style={{ color: textPrimary }}>Rebates (Total)</td>
                                        <td className="px-3 py-2"><span className="text-slate-400">—</span></td>
                                        <td className="px-3 py-2"><span className="text-slate-400">—</span></td>
                                        <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: textPrimary }}>₱{peso(branchPerfData.rebatesForCollection)}</td>
                                        <td className="px-3 py-2 text-center font-bold tabular-nums" style={{ color: textPrimary }}>1</td>
                                        <td className="px-3 py-2 text-right font-black tabular-nums text-emerald-600 dark:text-emerald-400">₱{peso(branchPerfData.rebatesForCollection)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )
                          }
                          return (
                            <div className="mt-1 text-center py-4 flex flex-col items-center justify-center gap-1">
                              <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                <HelpCircle className="w-3.5 h-3.5" />
                              </div>
                              <p className="text-[11px] font-bold" style={{ color: textMuted }}>No detailed rebates recorded today.</p>
                            </div>
                          )
                        })()}
                      </div>

                    </div>
                  )
                })()}
              </div>

              {/* ── BRANCH INFO + PERSONNEL — 2-col ── */}
              <div className="grid grid-cols-2 border-t" style={{ borderColor: border }}>
                <div className="px-8 py-5 border-r" style={{ borderColor: border }}>
                  <div className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: textMuted }}>Branch Contact</div>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { label: 'Address', value: selectedBranch.address || 'Not registered' },
                      { label: 'Phone', value: selectedBranch.phone || '—' },
                      { label: 'Email', value: selectedBranch.email || '—' },
                    ].map(row => (
                      <div key={row.label} className="flex gap-4">
                        <span className="text-[11px] font-semibold w-14 shrink-0 pt-px" style={{ color: textMuted }}>{row.label}</span>
                        <span className="text-[11px] break-all" style={{ color: textPrimary }}>{row.value}</span>
                      </div>
                    ))}
                    {selectedBranch.mapUrl && (
                      <a href={selectedBranch.mapUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] font-bold hover:underline mt-1"
                        style={{ color: selectedBranch.color || '#10B981' }}>
                        View on Google Maps →
                      </a>
                    )}
                  </div>
                </div>
                <div className="px-8 py-5">
                  <div className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: textMuted }}>Assigned Personnel</div>
                  <div className="flex flex-col gap-4">
                    {(() => {
                      const oicPerson = resolveOicPerson(selectedBranch)
                      return (
                        <>
                          <div className="flex gap-4">
                            <span className="text-[11px] font-semibold w-20 shrink-0 pt-px" style={{ color: textMuted }}>OIC</span>
                            <span className="text-[11px]" style={{ color: textPrimary }}>
                              {oicPerson?.name || selectedBranch.oic || 'Unassigned'}
                            </span>
                          </div>
                          <div className="flex gap-4">
                            <span className="text-[11px] font-semibold w-20 shrink-0 pt-px" style={{ color: textMuted }}>OIC Phone</span>
                            <span className="text-[11px]" style={{ color: textPrimary }}>
                              {oicPerson?.phone || '—'}
                            </span>
                          </div>
                          <div className="flex gap-4">
                            <span className="text-[11px] font-semibold w-20 shrink-0 pt-px" style={{ color: textMuted }}>OIC Email</span>
                            <span className="text-[11px] break-all" style={{ color: textPrimary }}>
                              {oicPerson?.email || '—'}
                            </span>
                          </div>
                          <div className="flex gap-4">
                            <span className="text-[11px] font-semibold w-20 shrink-0 pt-px" style={{ color: textMuted }}>Coordinator</span>
                            <span className="text-[11px]" style={{ color: textPrimary }}>
                              {selectedBranch.salesCoordinator || '—'}
                            </span>
                          </div>
                        </>
                      )
                    })()}
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: textMuted }}>
                        Drivers ({selectedBranch.drivers.length})
                      </span>
                      <PersonnelChipList names={selectedBranch.drivers} emptyLabel="—" chipClass="bg-blue-500/10 text-blue-700 dark:text-blue-300" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: textMuted }}>
                        Installers ({selectedBranch.installers.length})
                      </span>
                      <PersonnelChipList names={selectedBranch.installers} emptyLabel="—" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── FOOTER ──────────────────────────────────── */}
            <div className="px-8 py-4 border-t flex items-center justify-between shrink-0"
              style={{ borderColor: border, backgroundColor: isLight ? 'rgba(248,250,252,0.8)' : 'rgba(6,11,24,0.5)' }}>
              <span className="text-[11px]" style={{ color: textMuted }}>
                {user?.name && <>Viewing as <strong style={{ color: textPrimary }}>{user.name}</strong></>}
              </span>
              <button
                onClick={() => setSelectedBranch(null)}
                className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 transition-all"
                style={{ backgroundColor: selectedBranch.color || '#10B981' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
