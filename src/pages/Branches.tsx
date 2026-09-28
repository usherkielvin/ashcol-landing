import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, MapPin, Phone, Mail, Building2, ExternalLink, Edit3, X, Loader2, FileText, CheckCircle2, XCircle, Gift, Receipt, HelpCircle, Plus, Check, MoreVertical } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { PUBLIC_BRANCHES } from '../data/branches'
import { API_BASE_URL, isSameBaseBranch, resolveScopedBranchId, isPortalAdmin, isTaguigServicesScope, isFranchiseBranch } from '../utils/api'
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

const isNoTransaction = (r: string) =>
  r === 'NO SCHED' || r === 'NO TRANSACTION' || r === 'NO RECORD' || r === 'NO REPORT'

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
    
    // Non-admin: every member (and any branch-specific role) may edit their OWN branch's details;
    // the backend enforces the same own-branch rule (BranchController.assertCanEditBranch).
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
        {isRoleAdmin && (
          <button
            id="add-branch-btn"
            onClick={handleOpenAddBranch}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-sm"
            style={{ backgroundColor: '#10B981' }}
          >
            <Plus className="w-4 h-4" />
            Add Branch
          </button>
        )}
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
                {myBranch.isFranchise && (
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    FRANCHISE
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
            <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800/40 bg-slate-50/30 dark:bg-slate-900/10 flex flex-col gap-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Officer In Charge (OIC)</span>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-sm shrink-0">
                  {initialsFor(myBranch.oic)}
                </div>
                <div>
                  <div className="font-extrabold text-sm" style={{ color: textPrimary }}>{myBranch.oic}</div>
                  <div className="text-[10px] text-slate-400 font-bold">OFFICER IN CHARGE</div>
                </div>
              </div>
            </div>

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
          className="flex items-center border rounded-full px-3.5 h-9 w-full md:w-96 focus-within:border-[#10B981] transition-all"
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-8">
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
                <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-4 sm:gap-6 flex-1">
                  {/* Branch name & status */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-2.5 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800/60">
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
                        {branch.isFranchise && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            FRANCHISE
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
                        {getConciseLocationTag(branch)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span 
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border"
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
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                            style={{
                              backgroundColor: overThreshold ? 'rgba(239,68,68,0.06)' : 'rgba(100,116,139,0.06)',
                              color: overThreshold ? '#EF4444' : '#64748B',
                              borderColor: overThreshold ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)'
                            }}
                            title={overThreshold ? `Cash on hand ₱${peso(cohRow.totalCohCfd)} — due for deposit` : `Cash on hand ₱${peso(cohRow.totalCohCfd)}`}
                          >
                            COH ₱{peso(cohRow.totalCohCfd)}
                            {overThreshold ? ' · DEPOSIT DUE' : ''}
                          </span>
                        )
                      })()}
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
                    {(isRoleAdmin || (user?.branchId && isSameBaseBranch(user.branchId, branch.id))) && (
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

      {/* ── View Details Modal (Enhanced with Performance Data) ── */}
      {selectedBranch && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
          <div
            className="w-full max-w-4xl rounded-3xl border overflow-hidden shadow-2xl flex flex-col"
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
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border"
                      style={{
                        backgroundColor: selectedBranch.isActive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                        color: selectedBranch.isActive ? '#10B981' : '#EF4444',
                        borderColor: selectedBranch.isActive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'
                      }}
                    >
                      {selectedBranch.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
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
                    {[
                      { label: 'OIC', value: selectedBranch.oic || 'Unassigned' },
                      { label: 'Coordinator', value: selectedBranch.salesCoordinator || '—' },
                    ].map(row => (
                      <div key={row.label} className="flex gap-4">
                        <span className="text-[11px] font-semibold w-20 shrink-0 pt-px" style={{ color: textMuted }}>{row.label}</span>
                        <span className="text-[11px]" style={{ color: textPrimary }}>{row.value}</span>
                      </div>
                    ))}
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
