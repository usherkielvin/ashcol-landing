import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, MapPin, Phone, Mail, Building2, ExternalLink, Edit3, X, Loader2, XCircle, Plus, Check, MoreVertical } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { PUBLIC_BRANCHES } from '../data/branches'
import { API_BASE_URL, isSameBaseBranch, isPortalAdmin, isTaguigServicesScope, isFranchiseBranch } from '../utils/api'
import {
  isInstallerEmployee,
  isSalesCoordinatorEmployee,
  resolveBranchApiId,
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

/** Cash-on-hand level at which a branch is due to deposit to the company bank. */
const CASH_DEPOSIT_THRESHOLD = 5000

/** Matches a branch card to its audit row by base branch id, disambiguating Taguig
 *  Sales/Services when both lines share the same underlying branch record. */
const findCohRowForBranch = (branch: Branch, rows: AuditRow[]): AuditRow | undefined => {
  const rawId = branch.rawBranchId || branch.id
  const candidates = rows.filter(r => r.branchId === rawId)
  if (candidates.length <= 1) return candidates[0]
  const cardIsServices = (branch.name || '').toUpperCase().includes('SERVICE')
  return candidates.find(r => (r.branchName || '').toUpperCase().includes('SERVICE') === cardIsServices) || candidates[0]
}

interface Branch {
  id?: string
  rawBranchId?: string
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
  isFranchise?: boolean
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
  if (name.includes('binan') || name.includes('biñan') || name.includes('san pedro') || name.includes('sanpedro') || name.includes('pedro')) {
    return 'BINAN, LAGUNA'
  }
  if (name.includes('calauan')) {
    return 'BANGYAS, CALAUAN, LAGUNA'
  }
  if (name.includes('laguna')) {
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

export default function Branches() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'

  const [branches, setBranches] = useState<Branch[]>([])
  const [managers, setManagers] = useState<any[]>([])
  /** Today's cash-on-hand per branch line — powers the deposit-due badge on each branch card. */
  const [cohRows, setCohRows] = useState<AuditRow[]>([])

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
  const [saving, setSaving] = useState(false)
  const [showOicMenu, setShowOicMenu] = useState(false)
  const [oicSearchQuery, setOicSearchQuery] = useState('')
  const oicMenuRef = useRef<HTMLDivElement>(null)

  // Add Branch modal state
  const [showAddBranch, setShowAddBranch] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '',
    location: '',
    address: '',
    phone: '',
    email: '',
    targetDailyQuota: '',
  })
  const [addError, setAddError] = useState<string | null>(null)
  const [addSaving, setAddSaving] = useState(false)

  const isRoleAdmin = isPortalAdmin(user?.role)

  // ── Colour tokens ──────────────────────────────────────────────
  const cardBg      = isLight ? '#ffffff' : '#0A1120'
  const border      = isLight ? '#e2e8f0' : '#1E2D48'
  const textPrimary = isLight ? '#0f172a' : '#E2E8F0'
  const textMuted   = isLight ? '#64748b' : '#7A95B8'
  const inputBg     = isLight ? '#ffffff' : '#0F1A2E'

  const fetchAllData = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const headers = { Authorization: `Bearer ${token}` }
      const apiUrl = API_BASE_URL
      
      const today = new Date().toISOString().split('T')[0]
      const [resB, resAllUsers, resM, resE, resCoh] = await Promise.all([
        fetch(`${apiUrl}/branches`, { headers }),
        fetch(`${apiUrl}/user/all`, { headers }).catch(() => null),
        fetch(`${apiUrl}/user/all?role=MANAGER`, { headers }).catch(() => null),
        fetch(`${apiUrl}/user/all?role=EMPLOYEE`, { headers }).catch(() => null),
        fetch(`${apiUrl}/v1/reports/audit-summary?date=${today}`, { headers }).catch(() => null)
      ])

      if (!resB.ok) {
        throw new Error('Failed to load branches')
      }

      const branchesData = await resB.json()
      const apiBranches = branchesData.data || branchesData || []
      setCohRows(resCoh && resCoh.ok ? await resCoh.json() : [])
      
      // Load all users to include Management (e.g. Apple Management), Admins, Managers, and Staff
      let allUsers: any[] = []
      if (resAllUsers && resAllUsers.ok) {
        const payload = await resAllUsers.json()
        allUsers = payload?.data || payload || []
      }

      let managersList: any[] = []
      if (resM && resM.ok) {
        const payload = await resM.json()
        managersList = payload?.data || payload || []
      }

      let employeesList: any[] = []
      if (resE && resE.ok) {
        const payload = await resE.json()
        employeesList = payload?.data || payload || []
      }

      // Combine users so that no one (management, admin, manager, employee) is missed
      const combinedUsersMap = new Map<string, any>()
      allUsers.forEach((u: any) => { if (u?.id) combinedUsersMap.set(String(u.id), u) })
      managersList.forEach((u: any) => { if (u?.id && !combinedUsersMap.has(String(u.id))) combinedUsersMap.set(String(u.id), u) })
      employeesList.forEach((u: any) => { if (u?.id && !combinedUsersMap.has(String(u.id))) combinedUsersMap.set(String(u.id), u) })
      const unifiedUsers = Array.from(combinedUsersMap.values())

      // Set managers to include all potential OIC users (Management, Managers, Admins, etc.)
      setManagers(unifiedUsers)

      // Employees list for roster & crew selection
      const effectiveEmployees = employeesList.length > 0 ? employeesList : unifiedUsers

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
          if (pubName === apiName || pubTag === apiLocation) return true
          // If candidate is Laguna (Calauan), do not match if apiName or apiLocation is Binan / San Pedro or other specific city
          if (candidate.name.toLowerCase().includes('laguna') || candidate.tag.toLowerCase() === 'laguna') {
            if (apiName.includes('binan') || apiName.includes('biñan') || apiName.includes('san pedro') || apiLocation.includes('san pedro') || apiName.includes('pedro')) {
              return false
            }
            if (apiName.includes('calauan') || apiLocation.includes('calauan')) {
              return true
            }
          }
          if (pubTag === 'laguna' || pubTag === 'cavite' || pubTag === 'quezon') {
            return false
          }
          return apiName.includes(pubTag) || apiLocation.includes(pubTag)
        })

        // Roster assignment
        // 1. OIC - Prioritize explicit managerId saved on branch
        let oicName = ''
        const branchManagers = unifiedUsers.filter((m: any) =>
          m.branchId === api.id ||
          (suffix ? m.branchId === `${api.id}-${suffix}` : false) ||
          (suffix === 'sales' && m.branchId === 'BR-TAGUIG-SALES') ||
          (suffix === 'services' && m.branchId === 'BR-TAGUIG-SERVICES')
        )
        if (api.managerId) {
          const foundMgr = unifiedUsers.find((m: any) => String(m.id).toLowerCase() === String(api.managerId).toLowerCase())
          if (foundMgr) oicName = foundMgr.name
          else if ((api as any).managerName) oicName = (api as any).managerName
        } else if (suffix) {
          const matchedMgr = branchManagers.find((m: any) => {
            const nameLower = (m.name || '').toLowerCase()
            const isServiceMgr = isTaguigServicesScope(m.branchId || api.id, m.email, m.jobTitle)
              || nameLower.includes('service')
            return suffix === 'services' ? isServiceMgr : !isServiceMgr
          })
          if (matchedMgr) oicName = matchedMgr.name
        } else if (branchManagers.length > 0) {
          oicName = branchManagers[0].name
        }

        // 2. Employees (Drivers vs Installers)
        let branchStaff = effectiveEmployees.filter((e: any) =>
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

        // Installers come ONLY from the member accounts created for this branch, shown by the
        // account's full name — never from typed-in / lineup / cached names, so the same person
        // can't appear twice under different spellings ("JUSTINE" vs "JUSTIN ROI BIEN").
        // Drivers are intentionally not listed on this page (the LINEUP keeps its own driver list).
        const installerByAccount = new Map<string, string>()
        for (const e of branchStaff) {
          if (e.isActive === false || e.active === false) continue
          if (typeof e.status === 'string' && e.status.toUpperCase() === 'INACTIVE') continue
          if (!isInstallerEmployee(e)) continue
          const fullName = String(e.name || '').trim().replace(/\s+/g, ' ').toUpperCase()
          if (!fullName) continue
          installerByAccount.set(String(e.id || fullName), fullName)
        }
        const drivers: string[] = []
        const installers = Array.from(new Set(installerByAccount.values()))
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

        if (!oicName) oicName = 'Unassigned'

        return {
          ...api,
          id: suffix ? `${api.id}-${suffix}` : api.id,
          rawBranchId: api.id,
          name: customName || api.name,
          location: api.location || pub?.tag || '',
          address: api.address || pub?.address || '',
          phone: api.phone || pub?.phones?.[0] || '',
          phones: (api.phone ? [api.phone] : undefined) || pub?.phones,
          landline: (api as any).landline || pub?.landline,
          email: api.email || pub?.email || '',
          isActive: api.isActive ?? true,
          targetDailyQuota: api.targetDailyQuota,
          tag: api.location || pub?.tag || '',
          color: pub?.color || '#10B981',
          mapUrl: api.mapUrl || pub?.mapUrl || '',
          region: api.region || pub?.region || 'Luzon',
          isHQ: pub?.isHQ || api.isHQ || false,
          isFranchise: Boolean(pub?.isFranchise || (api as any).isFranchise || isFranchiseBranch(api.id) || isFranchiseBranch(api.name)),
          oic: oicName,
          managerId: api.managerId,
          salesCoordinator: salesCoordinator?.name,
          drivers,
          installers
        }
      }

      const hasExplicitTaguigSales = apiBranches.some((api: { id?: string; name?: string; isActive?: boolean }) => {
        if (api.isActive === false) return false
        const cleanName = (api.name || '').replace(/^(ashcol\s+)/i, '').toUpperCase()
        const apiIdUpper = (api.id || '').toUpperCase()
        const explicitId = apiIdUpper === 'BR-TAGUIG-SALES-EXPLICIT'
        const explicitName = cleanName.includes('TAGUIG') && cleanName.includes('SALES') && apiIdUpper !== 'BR-TAGUIG-SALES'
        return explicitId || explicitName
      })
      const hasExplicitTaguigServices = apiBranches.some((api: { id?: string; name?: string; isActive?: boolean }) => {
        if (api.isActive === false) return false
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
        const isTaguigSalesExplicit = isTaguig && api.isActive !== false && (apiIdUpper === 'BR-TAGUIG-SALES-EXPLICIT' || (cleanName.includes('SALES') && apiIdUpper !== 'BR-TAGUIG-SALES'))
        const isTaguigServicesExplicit = isTaguig && api.isActive !== false && (apiIdUpper === 'BR-TAGUIG-SERVICES' || apiIdUpper === 'BR-TAGUIG-SERVICE' || cleanName.includes('SERVICE'))
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

      setBranches(merged.filter(b => !b.isFranchise && !isFranchiseBranch(b.id) && !isFranchiseBranch(b.name)))
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
    let initialManagerId = branch.managerId || ''
    if (!initialManagerId && branch.oic && branch.oic !== 'Unassigned') {
      const matched = managers.find(m => (m.name || '').trim().toLowerCase() === branch.oic.trim().toLowerCase())
      if (matched?.id) initialManagerId = String(matched.id)
    }

    setEditingBranch(branch)
    setEditForm({
      name: branch.name,
      location: branch.location || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      managerId: initialManagerId,
      isActive: branch.isActive,
      targetDailyQuota: branch.targetDailyQuota != null ? String(branch.targetDailyQuota) : ''
    })
    setEditRoster({
      drivers: [...(branch.drivers || [])].map((d) => d.toUpperCase()),
      installers: [...(branch.installers || [])].map((i) => i.toUpperCase()),
    })
    setShowOicMenu(false)
    setOicSearchQuery('')
  }

  // Group all available users for OIC assignment with special priority for Management & Leadership
  const oicOptionsGrouped = useMemo(() => {
    const management: any[] = []
    const managersGroup: any[] = []
    const admins: any[] = []
    const others: any[] = []

    const seen = new Set<string>()
    const uniqueUsers = managers.filter((u: any) => {
      const id = String(u?.id || '')
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })

    uniqueUsers.forEach((u: any) => {
      const roleUpper = String(u.role || '').toUpperCase()
      const jobUpper = String(u.jobTitle || '').toUpperCase()
      const nameUpper = String(u.name || '').toUpperCase()

      if (
        roleUpper === 'MANAGEMENT' ||
        roleUpper === 'EXECUTIVE' ||
        jobUpper.includes('MANAGEMENT') ||
        nameUpper.includes('MANAGEMENT')
      ) {
        management.push(u)
      } else if (roleUpper === 'ADMIN' || roleUpper === 'SUPER_ADMIN') {
        admins.push(u)
      } else if (
        roleUpper === 'MANAGER' ||
        roleUpper === 'OIC' ||
        jobUpper.includes('MANAGER') ||
        jobUpper.includes('OIC')
      ) {
        managersGroup.push(u)
      } else {
        others.push(u)
      }
    })

    const byName = (a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''))
    management.sort(byName)
    managersGroup.sort(byName)
    admins.sort(byName)
    others.sort(byName)

    return { management, managersGroup, admins, others }
  }, [managers])

  // Filter OIC groups based on 3-dots search query
  const filteredOicGroups = useMemo(() => {
    const q = oicSearchQuery.trim().toLowerCase()
    const filterList = (list: any[]) => {
      if (!q) return list
      return list.filter((m: any) => String(m.name || '').toLowerCase().includes(q))
    }
    return {
      management: filterList(oicOptionsGrouped.management),
      managersGroup: filterList(oicOptionsGrouped.managersGroup),
      admins: filterList(oicOptionsGrouped.admins),
      others: filterList(oicOptionsGrouped.others),
    }
  }, [oicOptionsGrouped, oicSearchQuery])

  const hasAnyFilteredOic = useMemo(() => {
    return (
      filteredOicGroups.management.length > 0 ||
      filteredOicGroups.managersGroup.length > 0 ||
      filteredOicGroups.admins.length > 0 ||
      filteredOicGroups.others.length > 0
    )
  }, [filteredOicGroups])

  // Click outside to close OIC 3-dots menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (oicMenuRef.current && !oicMenuRef.current.contains(e.target as Node)) {
        setShowOicMenu(false)
      }
    }
    if (showOicMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showOicMenu])

  // Get currently selected OIC user for quick profile preview badge
  const selectedOicUser = useMemo(() => {
    if (!editForm.managerId) return null
    return managers.find((m: any) => String(m.id) === String(editForm.managerId)) || null
  }, [editForm.managerId, managers])

  /** The other branch card, if any, backed by the same underlying branch record as the one
   *  being edited (i.e. Taguig Sales/Services still sharing a single physical branch row).
   *  Toggling Active/Inactive there flips BOTH cards since it's one database record. */
  const editingBranchSharedWith = useMemo(() => {
    if (!editingBranch) return null
    const rawId = editingBranch.rawBranchId || editingBranch.id
    if (!rawId) return null
    return branches.find(b => b.id !== editingBranch.id && (b.rawBranchId || b.id) === rawId) || null
  }, [editingBranch, branches])

  const handleSaveEdit = async () => {
    if (!editingBranch) return
    if (editingBranchSharedWith && editForm.isActive !== editingBranch.isActive) {
      const proceed = window.confirm(
        `"${editingBranch.name}" shares one branch record with "${editingBranchSharedWith.name}". ` +
        `Saving will also set "${editingBranchSharedWith.name}" to ${editForm.isActive ? 'ACTIVE' : 'INACTIVE'}. Continue?`
      )
      if (!proceed) return
    }
    setSaving(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const rawId = editingBranch.rawBranchId || editingBranch.id || ''
      const baseId = rawId.replace(/-(sales|services|service)$/i, '')
      const apiBranchId = resolveBranchApiId(editingBranch.id)
      const targetId: string = baseId || apiBranchId || editingBranch.id || ''

      if (!targetId) {
        alert('Branch identifier is missing.')
        setSaving(false)
        return
      }

      if (!editForm.name.trim()) {
        alert('Branch name is required.')
        setSaving(false)
        return
      }
      if (!editForm.location.trim()) {
        alert('Location is required.')
        setSaving(false)
        return
      }
      
      const quotaNum = parseFloat(editForm.targetDailyQuota)
      const payload = {
        name: editForm.name.trim(),
        location: editForm.location.trim(),
        address: editForm.address.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        managerId: editForm.managerId ? editForm.managerId.trim() : '',
        isActive: editForm.isActive,
        targetDailyQuota: !isNaN(quotaNum) && quotaNum >= 0 ? quotaNum : null
      }
      
      const res = await fetch(`${API_BASE_URL}/branches/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      
      if (!res.ok) {
        let errMsg = 'Failed to save changes'
        try {
          const body = await res.json()
          errMsg = body?.message || body?.error || errMsg
        } catch {}
        throw new Error(errMsg)
      }

      // The installer list on this page is read from member accounts and drivers aren't shown, so
      // saving branch details no longer writes any roster to the LINEUP or to local storage.
      setEditingBranch(null)
      await fetchAllData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenAddBranch = () => {
    setAddForm({ name: '', location: '', address: '', phone: '', email: '', targetDailyQuota: '' })
    setAddError(null)
    setShowAddBranch(true)
  }

  const handleAddBranchSubmit = async () => {
    setAddError(null)
    if (!addForm.name.trim()) { setAddError('Branch name is required.'); return }
    if (!addForm.location.trim()) { setAddError('Location is required.'); return }
    if (!addForm.phone.trim()) { setAddError('Phone number is required.'); return }
    if (!addForm.email.trim()) { setAddError('Email is required.'); return }
    setAddSaving(true)
    try {
      const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
      const quotaNum = parseFloat(addForm.targetDailyQuota)
      const payload = {
        name: addForm.name.trim(),
        location: addForm.location.trim(),
        address: addForm.address.trim(),
        phone: addForm.phone.trim(),
        email: addForm.email.trim(),
        isActive: true,
        targetDailyQuota: !isNaN(quotaNum) && quotaNum > 0 ? quotaNum : null,
      }
      const res = await fetch(`${API_BASE_URL}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || 'Failed to create branch')
      }
      setShowAddBranch(false)
      await fetchAllData()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create branch')
    } finally {
      setAddSaving(false)
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
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const inBranch = b.name.toLowerCase().includes(q)
                    || b.location.toLowerCase().includes(q)
                    || b.address.toLowerCase().includes(q)
                    || b.oic.toLowerCase().includes(q)
      if (!inBranch) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-5">
      
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-0.5" style={{ color: textPrimary }}>Branches</h2>
          <p className="text-xs sm:text-sm" style={{ color: textMuted }}>
            Overview of branch locations and contact details.
          </p>
        </div>
        {isRoleAdmin && (
          <button
            id="add-branch-btn"
            onClick={handleOpenAddBranch}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-sm"
            style={{ backgroundColor: '#10B981' }}
          >
            <Plus className="w-4 h-4" />
            Add Branch
          </button>
        )}
      </div>

      {/* ── Error Banner ─────────────────────────────────── */}
      {error && (
        <div className="flex items-center justify-between gap-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3.5 rounded-xl">
          <span className="text-xs sm:text-sm font-medium">{error}</span>
          <button onClick={fetchAllData} className="text-xs bg-red-100 dark:bg-red-800/50 hover:bg-red-200 px-3 py-1.5 rounded-lg font-bold transition-colors shrink-0">Retry</button>
        </div>
      )}

      {/* ── Toolbar: Compact Search ──────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div
          style={{ backgroundColor: inputBg, borderColor: border }}
          className="flex items-center border rounded-xl px-3 h-9 w-full max-w-xs sm:w-64 md:w-72 focus-within:border-[#10B981] transition-all"
        >
          <Search className="w-3.5 h-3.5 mr-2 shrink-0" style={{ color: textMuted }} />
          <input
            type="text"
            placeholder="Search branches…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ color: textPrimary }}
            className="bg-transparent border-none text-xs focus:outline-none w-full placeholder-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[260px] gap-3">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs sm:text-sm font-medium" style={{ color: textMuted }}>Loading directory details…</p>
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[260px] rounded-2xl border p-6 text-center" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: inputBg }}>
            <Building2 className="w-6 h-6" style={{ color: textMuted }} />
          </div>
          <h3 className="text-sm font-bold mb-1" style={{ color: textPrimary }}>No branches found</h3>
          <p className="text-xs" style={{ color: textMuted }}>Try adjusting your search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
          {filteredBranches.map(branch => {
            const isHq = branch.isHQ
            const isMyBranch = Boolean(myBranch && (branch.id === myBranch.id || isSameBaseBranch(myBranch.id, branch.id)))
            
            return (
              <div 
                key={branch.id} 
                className="rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
                style={{ 
                  backgroundColor: cardBg, 
                  borderColor: isMyBranch ? '#10B981' : isHq ? '#10B981' : border,
                  borderWidth: (isMyBranch || isHq) ? '1.5px' : '1px'
                }}
              >
                <div className="p-4 sm:p-5 flex flex-col gap-3.5 flex-1">
                  {/* Branch name, location & status badges */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base sm:text-lg font-extrabold tracking-tight" style={{ color: textPrimary }}>
                          {branch.name}
                        </h4>
                        {isMyBranch && (
                          <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-emerald-500/15 text-[#10B981] border border-emerald-500/30">
                            My Branch
                          </span>
                        )}
                        {isHq && !isMyBranch && (
                          <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-emerald-500/10 text-[#10B981] border border-emerald-500/20">
                            HQ
                          </span>
                        )}
                        {branch.isFranchise && (
                          <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            FRANCHISE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                        {getConciseLocationTag(branch)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                      <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider border"
                        style={{ 
                          backgroundColor: branch.isActive ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', 
                          color: branch.isActive ? '#10B981' : '#EF4444',
                          borderColor: branch.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
                        }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${branch.isActive ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {(() => {
                        const cohRow = findCohRowForBranch(branch, cohRows)
                        if (!cohRow || !cohRow.totalCohCfd || cohRow.totalCohCfd <= 0) return null
                        const overThreshold = cohRow.totalCohCfd >= CASH_DEPOSIT_THRESHOLD
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider border"
                            style={{
                              backgroundColor: overThreshold ? 'rgba(239,68,68,0.06)' : 'rgba(100,116,139,0.06)',
                              color: overThreshold ? '#EF4444' : '#64748B',
                              borderColor: overThreshold ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)'
                            }}
                            title={overThreshold ? `Cash on hand ₱${peso(cohRow.totalCohCfd)} — due for deposit` : `Cash on hand ₱${peso(cohRow.totalCohCfd)}`}
                          >
                            COH ₱{peso(cohRow.totalCohCfd)}
                          </span>
                        )
                      })()}
                      {branch.targetDailyQuota != null && branch.targetDailyQuota > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold border" style={{ backgroundColor: 'rgba(139,92,246,0.07)', color: '#8B5CF6', borderColor: 'rgba(139,92,246,0.2)' }}>
                          ₱{(branch.targetDailyQuota).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/day
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clean Contact Details */}
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="leading-snug text-slate-600 dark:text-slate-300">{branch.address || 'No address registered'}</span>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap text-slate-600 dark:text-slate-300">
                      {branch.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{branch.phone}</span>
                        </div>
                      )}

                      {branch.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[200px]">{branch.email}</span>
                        </div>
                      )}
                    </div>

                    {branch.oic && branch.oic !== 'Unassigned' && (
                      <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                        <span className="font-semibold text-slate-400">Lead:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{branch.oic}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action buttons */}
                <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/10 flex justify-between items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSelectedBranch(branch)}
                      className="px-3.5 py-1.5 rounded-xl border text-[10.5px] font-bold uppercase tracking-wider transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                      style={{ color: textPrimary, borderColor: border }}
                    >
                      View Details
                    </button>
                    {(isRoleAdmin || (user?.branchId && isSameBaseBranch(user.branchId, branch.id))) && (
                      <button 
                        onClick={() => handleEditClick(branch)}
                        className="p-1.5 rounded-xl border text-[10.5px] transition-all hover:text-[#10B981] hover:border-[#10B981]"
                        style={{ color: textMuted, borderColor: border }}
                        title="Edit Branch"
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
                      className="px-3 py-1.5 rounded-xl border text-[10.5px] font-bold uppercase tracking-wider text-[#10B981] border-[#10B981]/20 hover:bg-[#10B981]/5 transition-all flex items-center gap-1 shrink-0"
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

      {/* ── Branch Details Modal (portaled above the app header) ── */}
      {selectedBranch && createPortal(
        (() => {
          const accent = selectedBranch.color || '#10B981'
          const phoneList = (selectedBranch.phones && selectedBranch.phones.length > 0
            ? selectedBranch.phones
            : selectedBranch.phone ? [selectedBranch.phone] : [])
          const canEditBranch = isRoleAdmin || (user?.branchId && isSameBaseBranch(user.branchId, selectedBranch.id))
          const specRow = (label: string, value: React.ReactNode) => (
            <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
              <span className="text-xs font-medium shrink-0" style={{ color: textMuted }}>{label}</span>
              <span className="text-sm font-semibold text-right break-words min-w-0" style={{ color: textPrimary }}>{value}</span>
            </div>
          )
          const section = (title: string, children: React.ReactNode) => (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: border, backgroundColor: cardBg }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1520' }}>
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>{title}</span>
              </div>
              <div className="px-5 py-2">{children}</div>
            </div>
          )
          return (
            <div
              className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fade-in"
              onMouseDown={e => { if (e.target === e.currentTarget) setSelectedBranch(null) }}
            >
              <div
                className="w-full max-w-5xl max-h-[92vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-0"
                style={{ backgroundColor: isLight ? '#f8fafc' : '#080f1d', border: `1px solid ${border}` }}
              >
                {/* Header */}
                <div
                  className="px-6 sm:px-8 py-6 flex items-start justify-between gap-4 shrink-0"
                  style={{ background: `linear-gradient(135deg, ${accent}26 0%, transparent 70%)`, borderBottom: `1px solid ${border}` }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 font-black text-xl text-white shadow-lg"
                      style={{ backgroundColor: accent }}
                    >
                      {initialsFor(selectedBranch.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-2xl font-black tracking-tight truncate" style={{ color: textPrimary }}>{selectedBranch.name}</h3>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: textMuted }}>
                          <MapPin className="w-3.5 h-3.5" /> {getConciseLocationTag(selectedBranch)}
                        </span>
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                          style={{
                            backgroundColor: selectedBranch.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: selectedBranch.isActive ? '#10B981' : '#EF4444',
                            borderColor: selectedBranch.isActive ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
                          }}
                        >
                          {selectedBranch.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {selectedBranch.isHQ && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border" style={{ color: '#8B5CF6', borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.1)' }}>Head Office</span>
                        )}
                        {selectedBranch.isFranchise && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border" style={{ color: '#F59E0B', borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.1)' }}>Franchise</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canEditBranch && (
                      <button
                        onClick={() => { const b = selectedBranch; setSelectedBranch(null); handleEditClick(b) }}
                        className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-slate-500/10"
                        style={{ borderColor: border, color: textPrimary }}
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedBranch(null)}
                      className="p-2 rounded-xl hover:bg-slate-500/10 transition-colors"
                      style={{ color: textMuted }}
                      aria-label="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-7">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
                    {/* Details & specs */}
                    <div className="lg:col-span-3 flex flex-col gap-5">
                      {section('Contact & Location', (
                        <>
                          {specRow('Address', selectedBranch.address || 'Not registered')}
                          {specRow('Phone', phoneList.length > 0 ? phoneList.join(' · ') : '—')}
                          {selectedBranch.landline && specRow('Landline', selectedBranch.landline)}
                          {specRow('Email', selectedBranch.email || '—')}
                          <div className="py-2.5 flex items-start justify-between gap-4">
                            <span className="text-xs font-medium shrink-0" style={{ color: textMuted }}>Map</span>
                            {selectedBranch.mapUrl ? (
                              <a href={selectedBranch.mapUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-bold hover:underline" style={{ color: accent }}>
                                Open in Google Maps <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span className="text-sm font-semibold" style={{ color: textMuted }}>—</span>
                            )}
                          </div>
                        </>
                      ))}

                      {section('Branch Specs', (
                        <>
                          {specRow('Region', selectedBranch.region || '—')}
                          {specRow('Type', selectedBranch.isHQ ? 'Head Office' : selectedBranch.isFranchise ? 'Franchise' : 'Company branch')}
                          {specRow('Daily target quota', selectedBranch.targetDailyQuota ? `₱${peso(selectedBranch.targetDailyQuota)}` : '—')}
                          <div className="py-2.5 flex items-start justify-between gap-4">
                            <span className="text-xs font-medium shrink-0" style={{ color: textMuted }}>Status</span>
                            <span className="text-sm font-semibold" style={{ color: selectedBranch.isActive ? '#10B981' : '#EF4444' }}>
                              {selectedBranch.isActive ? 'Operating' : 'Inactive'}
                            </span>
                          </div>
                        </>
                      ))}
                    </div>

                    {/* Team */}
                    <div className="lg:col-span-2 flex flex-col gap-5">
                      {section('Leadership', (
                        <>
                          {specRow('OIC', selectedBranch.oic || 'Unassigned')}
                          <div className="py-2.5 flex items-start justify-between gap-4">
                            <span className="text-xs font-medium shrink-0" style={{ color: textMuted }}>Coordinator</span>
                            <span className="text-sm font-semibold text-right" style={{ color: textPrimary }}>{selectedBranch.salesCoordinator || '—'}</span>
                          </div>
                        </>
                      ))}

                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Installers', count: selectedBranch.installers.length },
                          { label: 'Drivers', count: selectedBranch.drivers.length },
                        ].map(t => (
                          <div key={t.label} className="rounded-2xl border px-4 py-3" style={{ borderColor: border, backgroundColor: cardBg }}>
                            <div className="text-2xl font-black tabular-nums leading-none" style={{ color: accent }}>{t.count}</div>
                            <div className="text-[11px] font-semibold mt-1" style={{ color: textMuted }}>{t.label}</div>
                          </div>
                        ))}
                      </div>

                      {section('Crew', (
                        <div className="py-2 flex flex-col gap-4">
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-medium" style={{ color: textMuted }}>Installers</span>
                            <PersonnelChipList names={selectedBranch.installers} emptyLabel="None assigned" />
                          </div>
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-medium" style={{ color: textMuted }}>Drivers</span>
                            <PersonnelChipList names={selectedBranch.drivers} emptyLabel="None assigned" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      {/* ── Edit Branch Details Modal (Portal to document.body) ── */}
      {editingBranch && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
          <div 
            className="w-full max-w-4xl max-h-[92vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden animate-scale-in"
            style={{ backgroundColor: cardBg, borderColor: border }}
          >
            {/* ── Header ── */}
            <div className="px-6 py-5 flex items-center justify-between border-b shrink-0" style={{ borderColor: border }}>
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <h3 className="text-lg font-black tracking-tight" style={{ color: textPrimary }}>
                  Edit Branch Details
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 text-[#10B981] border border-emerald-500/25 shadow-xs">
                  {editingBranch.name}
                </span>
              </div>
              <button 
                onClick={() => setEditingBranch(null)} 
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                style={{ color: textMuted }}
                disabled={saving}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Scrollable Body with 2-Column Grid ── */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Top Row: Branch Info & Address */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Branch Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                    Branch Name
                  </label>
                  <input 
                    type="text" 
                    value={editForm.name}
                    onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-[#10B981] w-full transition-colors"
                    disabled={saving}
                    placeholder="e.g. ASHCOL BINAN"
                  />
                </div>

                {/* City / Location Tag */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                    City / Location Tag
                  </label>
                  <input 
                    type="text" 
                    value={editForm.location}
                    onChange={e => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-[#10B981] w-full transition-colors"
                    disabled={saving}
                    placeholder="e.g. Binan, Laguna"
                  />
                </div>

                {/* Full Address */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                    Full Address
                  </label>
                  <input 
                    type="text" 
                    value={editForm.address}
                    onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:border-[#10B981] w-full transition-colors"
                    disabled={saving}
                    placeholder="e.g. National Highway, Biñan City, Laguna"
                  />
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-500" />
                    Contact Number
                  </label>
                  <input 
                    type="text" 
                    value={editForm.phone}
                    onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:border-[#10B981] w-full transition-colors"
                    disabled={saving}
                    placeholder="e.g. 0999 990 5224"
                  />
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-500" />
                    Email Address
                  </label>
                  <input 
                    type="email" 
                    value={editForm.email}
                    onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:border-[#10B981] w-full transition-colors"
                    disabled={saving}
                    placeholder="e.g. ashcolbinan@gmail.com"
                  />
                </div>
              </div>

              {/* Middle Row: Quota Target & OIC Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Daily Quota Card */}
                <div 
                  className="rounded-2xl p-4 border flex flex-col justify-between gap-3 relative overflow-hidden"
                  style={{ 
                    borderColor: 'rgba(139,92,246,0.3)', 
                    backgroundColor: isLight ? 'rgba(139,92,246,0.03)' : 'rgba(139,92,246,0.06)' 
                  }}
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                      Daily Sales Quota Target
                    </label>
                    {editForm.targetDailyQuota && Number(editForm.targetDailyQuota) > 0 && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-300">
                        ₱{Number(editForm.targetDailyQuota).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  <div className="relative mt-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-purple-500">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={editForm.targetDailyQuota}
                      onChange={e => setEditForm(prev => ({ ...prev, targetDailyQuota: e.target.value }))}
                      style={{ backgroundColor: inputBg, borderColor: 'rgba(139,92,246,0.4)', color: textPrimary }}
                      className="border rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold focus:outline-none focus:border-[#8B5CF6] w-full transition-colors"
                      disabled={saving}
                      placeholder="40000"
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] font-bold text-slate-400">Presets:</span>
                    {[30000, 40000, 50000, 60000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, targetDailyQuota: String(val) }))}
                        className="px-2 py-0.5 rounded text-[10px] font-bold transition-all border hover:border-purple-400 hover:text-purple-500"
                        style={{
                          backgroundColor: Number(editForm.targetDailyQuota) === val ? 'rgba(139,92,246,0.15)' : 'transparent',
                          borderColor: Number(editForm.targetDailyQuota) === val ? '#8B5CF6' : border,
                          color: Number(editForm.targetDailyQuota) === val ? '#8B5CF6' : textMuted
                        }}
                      >
                        ₱{(val / 1000)}k
                      </button>
                    ))}
                  </div>
                </div>

                {/* Officer In Charge (OIC) Card (3-Dots Menu, No Dropdown Box, No Clear Button) */}
                <div 
                  ref={oicMenuRef}
                  className="rounded-2xl p-4 border flex flex-col justify-between gap-3 relative"
                  style={{ 
                    borderColor: 'rgba(16,185,129,0.3)', 
                    backgroundColor: isLight ? 'rgba(16,185,129,0.03)' : 'rgba(16,185,129,0.06)' 
                  }}
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-wider text-[#10B981]">
                      Officer In Charge (OIC)
                    </label>

                    {/* 3 Dots Menu Button */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowOicMenu(prev => !prev)}
                        className="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        title="Select OIC"
                        disabled={saving}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* 3-Dots Popover Picker */}
                      {showOicMenu && (
                        <div 
                          className="absolute right-0 top-full mt-1.5 w-72 rounded-2xl shadow-2xl border p-2.5 z-50 animate-scale-in"
                          style={{ backgroundColor: cardBg, borderColor: border }}
                        >
                          <div className="relative mb-2">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={oicSearchQuery}
                              onChange={e => setOicSearchQuery(e.target.value)}
                              placeholder="Search personnel..."
                              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl border focus:outline-none focus:border-[#10B981] font-medium"
                              style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                              autoFocus
                            />
                          </div>

                          <div className="max-h-56 overflow-y-auto space-y-2 pr-0.5">
                            {!hasAnyFilteredOic ? (
                              <div className="text-center py-4 text-xs text-slate-400 italic">No personnel found</div>
                            ) : (
                              <>
                                {filteredOicGroups.management.length > 0 && (
                                  <div>
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1">Management</div>
                                    <div className="space-y-0.5">
                                      {filteredOicGroups.management.map(m => {
                                        const isSelected = String(editForm.managerId) === String(m.id)
                                        return (
                                          <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => {
                                              setEditForm(prev => ({ ...prev, managerId: String(m.id) }))
                                              setShowOicMenu(false)
                                              setOicSearchQuery('')
                                            }}
                                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                                              isSelected
                                                ? 'bg-emerald-500/15 text-[#10B981]'
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
                                            }`}
                                          >
                                            <span className="truncate">{m.name}</span>
                                            {isSelected && <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {filteredOicGroups.managersGroup.length > 0 && (
                                  <div>
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1">Managers & OICs</div>
                                    <div className="space-y-0.5">
                                      {filteredOicGroups.managersGroup.map(m => {
                                        const isSelected = String(editForm.managerId) === String(m.id)
                                        return (
                                          <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => {
                                              setEditForm(prev => ({ ...prev, managerId: String(m.id) }))
                                              setShowOicMenu(false)
                                              setOicSearchQuery('')
                                            }}
                                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                                              isSelected
                                                ? 'bg-emerald-500/15 text-[#10B981]'
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
                                            }`}
                                          >
                                            <span className="truncate">{m.name}</span>
                                            {isSelected && <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {filteredOicGroups.admins.length > 0 && (
                                  <div>
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1">Administrators</div>
                                    <div className="space-y-0.5">
                                      {filteredOicGroups.admins.map(m => {
                                        const isSelected = String(editForm.managerId) === String(m.id)
                                        return (
                                          <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => {
                                              setEditForm(prev => ({ ...prev, managerId: String(m.id) }))
                                              setShowOicMenu(false)
                                              setOicSearchQuery('')
                                            }}
                                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                                              isSelected
                                                ? 'bg-emerald-500/15 text-[#10B981]'
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
                                            }`}
                                          >
                                            <span className="truncate">{m.name}</span>
                                            {isSelected && <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {filteredOicGroups.others.length > 0 && (
                                  <div>
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1">Staff</div>
                                    <div className="space-y-0.5">
                                      {filteredOicGroups.others.map(m => {
                                        const isSelected = String(editForm.managerId) === String(m.id)
                                        return (
                                          <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => {
                                              setEditForm(prev => ({ ...prev, managerId: String(m.id) }))
                                              setShowOicMenu(false)
                                              setOicSearchQuery('')
                                            }}
                                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                                              isSelected
                                                ? 'bg-emerald-500/15 text-[#10B981]'
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
                                            }`}
                                          >
                                            <span className="truncate">{m.name}</span>
                                            {isSelected && <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {editForm.managerId && (
                            <div className="pt-2 mt-2 border-t" style={{ borderColor: border }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditForm(prev => ({ ...prev, managerId: '' }))
                                  setShowOicMenu(false)
                                  setOicSearchQuery('')
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                Unassign OIC
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clean OIC Display Card (Clickable to open menu) */}
                  <div 
                    onClick={() => setShowOicMenu(prev => !prev)}
                    className="border rounded-xl px-3.5 py-3 flex items-center justify-between cursor-pointer hover:border-emerald-500/50 transition-all shadow-xs"
                    style={{ backgroundColor: inputBg, borderColor: 'rgba(16,185,129,0.3)' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${selectedOicUser ? 'bg-[#10B981]' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <span className={`text-sm font-bold truncate ${selectedOicUser ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 italic font-normal'}`}>
                        {selectedOicUser ? selectedOicUser.name : 'No OIC assigned'}
                      </span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {selectedOicUser ? 'Assigned' : 'Select'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Field Crew */}
              <div className="rounded-2xl p-5 border flex flex-col gap-4" style={{ borderColor: border }}>
                <h4 className="text-xs font-black uppercase tracking-wider" style={{ color: textPrimary }}>
                  Field Crew
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* TECHNICIANS — read-only: built from the member accounts created for this branch
                      (full account name), so nothing is typed in by hand and nobody is listed twice. */}
                  <div className="md:col-span-2 flex flex-col gap-2.5 p-4 rounded-xl border" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0d1527' }}>
                    <label className="text-[11px] font-black uppercase tracking-wider text-emerald-500">
                      Installers & Technicians ({editRoster.installers.length})
                    </label>
                    <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-lg border bg-white dark:bg-slate-900/60" style={{ borderColor: border }}>
                      {editRoster.installers.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic self-center">No installer accounts in this branch yet</span>
                      ) : (
                        editRoster.installers.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                          >
                            {name}
                          </span>
                        ))
                      )}
                    </div>
                    <p className="text-[11px]" style={{ color: textMuted }}>
                      This list follows member accounts. To add or move an installer, create or edit their account under Members.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Toggle Card */}
              <div 
                className="flex items-center justify-between p-4 rounded-2xl border"
                style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : '#0A1120' }}
              >
                <div>
                  <h4 className="text-xs font-bold" style={{ color: textPrimary }}>
                    Branch Operation Status
                  </h4>
                  <p className="text-[11px] mt-0.5" style={{ color: textMuted }}>
                    {editForm.isActive
                      ? 'This branch is currently active and accepts daily dispatch and transactions.'
                      : 'This branch is marked inactive and will be hidden from daily operations.'}
                  </p>
                  {editingBranchSharedWith && (
                    <p className="text-[11px] mt-1.5 font-bold" style={{ color: '#F59E0B' }}>
                      ⚠ Shares one branch record with "{editingBranchSharedWith.name}" — toggling this
                      will also switch that one to {editForm.isActive ? 'ACTIVE' : 'INACTIVE'} on save.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black uppercase tracking-wider ${editForm.isActive ? 'text-[#10B981]' : 'text-slate-400'}`}>
                    {editForm.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                    disabled={saving}
                    className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${editForm.isActive ? 'bg-[#10B981]' : 'bg-slate-300 dark:bg-slate-700'}`}
                  >
                    <div 
                      className="w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 transition-all"
                      style={{ left: editForm.isActive ? '1.75rem' : '0.25rem' }}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Modal Footer ── */}
            <div className="px-6 py-4 border-t flex items-center justify-between gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-900/40" style={{ borderColor: border }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium" style={{ color: textMuted }}>
                  Changes will sync across branch rosters and daily reports.
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setEditingBranch(null)} 
                  className="px-5 py-2.5 border rounded-xl text-xs font-bold transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                  style={{ color: textMuted, borderColor: border }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveEdit}
                  className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 active:scale-95 transition-all shrink-0 flex items-center gap-2 shadow-md disabled:opacity-50"
                  style={{ backgroundColor: '#10B981' }}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving Changes...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Add Branch Modal (Admin only) ──────────────────── */}
      {showAddBranch && createPortal(
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddBranch(false) }}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}`, maxHeight: '90vh' }}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: border }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                  <Building2 className="w-4 h-4" style={{ color: '#10B981' }} />
                </div>
                <div>
                  <h3 className="text-sm font-black" style={{ color: textPrimary }}>Add New Branch</h3>
                  <p className="text-[10px] font-medium" style={{ color: textMuted }}>Create a new ASHCOL branch location</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddBranch(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                style={{ color: textMuted }}
                disabled={addSaving}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
              {addError && (
                <div className="flex items-center gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-xs font-semibold">
                  <XCircle className="w-4 h-4 shrink-0" />
                  {addError}
                </div>
              )}

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Branch Name <span className="text-red-400">*</span></label>
                <input
                  id="add-branch-name"
                  type="text"
                  placeholder="e.g. ASHCOL BINAN"
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  disabled={addSaving}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] w-full transition-all"
                />
              </div>

              {/* Location */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Location / City <span className="text-red-400">*</span></label>
                <input
                  id="add-branch-location"
                  type="text"
                  placeholder="e.g. Binan, Laguna"
                  value={addForm.location}
                  onChange={e => setAddForm(p => ({ ...p, location: e.target.value }))}
                  disabled={addSaving}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] w-full transition-all"
                />
              </div>

              {/* Address */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Full Address</label>
                <textarea
                  id="add-branch-address"
                  placeholder="Building, street, barangay, city, province"
                  value={addForm.address}
                  onChange={e => setAddForm(p => ({ ...p, address: e.target.value }))}
                  disabled={addSaving}
                  rows={2}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] w-full transition-all resize-none"
                />
              </div>

              {/* Phone + Email (2 col) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Phone <span className="text-red-400">*</span></label>
                  <input
                    id="add-branch-phone"
                    type="tel"
                    placeholder="09XX XXX XXXX"
                    value={addForm.phone}
                    onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
                    disabled={addSaving}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] w-full transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Email <span className="text-red-400">*</span></label>
                  <input
                    id="add-branch-email"
                    type="email"
                    placeholder="branch@ashcol.com.ph"
                    value={addForm.email}
                    onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                    disabled={addSaving}
                    style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                    className="border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] w-full transition-all"
                  />
                </div>
              </div>

              {/* Daily Quota */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: textMuted }}>Target Daily Quota (₱)</label>
                <input
                  id="add-branch-quota"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="e.g. 50000"
                  value={addForm.targetDailyQuota}
                  onChange={e => setAddForm(p => ({ ...p, targetDailyQuota: e.target.value }))}
                  disabled={addSaving}
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                  className="border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] w-full transition-all"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t flex justify-end gap-2.5 shrink-0" style={{ borderColor: border, backgroundColor: isLight ? '#f8fafc' : 'rgba(15,26,46,0.6)' }}>
              <button
                onClick={() => setShowAddBranch(false)}
                disabled={addSaving}
                className="px-4 py-2 border rounded-xl text-xs font-bold transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                style={{ color: textMuted, borderColor: border }}
              >
                Cancel
              </button>
              <button
                id="add-branch-submit"
                onClick={handleAddBranchSubmit}
                disabled={addSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 active:scale-95 transition-all"
                style={{ backgroundColor: '#10B981' }}
              >
                {addSaving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                ) : (
                  <><Plus className="w-3.5 h-3.5" /> Create Branch</>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
