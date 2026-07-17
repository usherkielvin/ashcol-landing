// @ts-nocheck
import { useState, useRef, useEffect, cloneElement, isValidElement } from 'react'
import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import {
  Ticket as TicketIcon,
  Menu, LogOut, X, Sun, Moon,
  ChevronRight, ChevronLeft, UserCircle, ChevronDown,
  PanelLeftOpen, ClipboardList, Search,
  User, Radio, CalendarDays, UserCog, TrendingUp, MapPin, Archive,
  Building2, Calendar, Landmark, Wifi, CircleDollarSign, ListOrdered, ShieldCheck,
  LayoutDashboard
} from 'lucide-react'
import {
  MdOutlineConfirmationNumber,
  MdOutlineDashboard,
  MdOutlineLocalActivity,
  MdOutlineAssignmentInd,
  MdOutlineCalendarMonth,
  MdOutlineArchive,
  MdOutlinePeopleAlt,
  MdOutlineDescription,
  MdOutlinePlaylistAdd,
  MdOutlineChecklist,
  MdOutlineInsertChartOutlined,
  MdOutlineReceipt,
  MdOutlineMonetizationOn,
  MdOutlineBarChart,
  MdOutlineAccountBalanceWallet,
  MdOutlinePhone,
  MdMenuBook,
  MdOutlinePerson,
  MdOutlineStorefront,
} from 'react-icons/md'
import { FiMinus, FiPlus } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatRole, formatPersonName, getPortalHomePath, isPortalAdmin, isSalesWorkspaceUser, isServiceWorkspaceUser, findBranchListEntry, formatBranchName } from '../utils/api'
import UserAvatar from '../components/UserAvatar'

// import AIChatBot from '../components/AIChatBot'
import logoImg from '../assets/ash-logo.jpg'

const normalizeBranchDisplayName = (branchId?: string | null, branchName?: string | null) => {
  if (!branchId && !branchName) return null
  const id = (branchId || '').toUpperCase()
  const name = (branchName || '').trim()

  const isServices = id.includes('SERVICE') || id.includes('SERVICES') || name.toUpperCase().includes('SERVICE')
  if (id.includes('TAGUIG') || name.toUpperCase().includes('TAGUIG')) {
    return isServices ? 'TAGUIG SERVICES' : 'TAGUIG-SALES'
  }

  return formatBranchName(name || id)
}

const getBranchCode = (name: string) => {
  if (!name) return ''
  const upper = name.toUpperCase()
  if (upper.includes('TAGUIG')) {
    if (upper.includes('SERVICE')) return 'TS'
    return 'TG'
  }
  if (upper.includes('BULACAN')) return 'BU'
  const words = upper.split(/[\s-]+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).substring(0, 2)
  }
  return upper.substring(0, 2)
}


interface BranchOption { id: string; name: string }

type NavLinkDef = { name: string; path: string; icon: typeof TicketIcon; roles?: string[] }

function buildNavGroups(navLinks: NavLinkDef[]) {
  const findPath = (name: string) => navLinks.find(l => l.name === name)?.path ?? '#'
  const hasLink = (name: string) => navLinks.some(l => l.name === name)

  return [
    {
      title: 'Tickets',
      Icon: MdOutlineConfirmationNumber,
      subItems: [
        { name: 'Relays', icon: <MdOutlineLocalActivity size={16} />, path: findPath('Relays') },
        { name: 'My Tickets', icon: <MdOutlineAssignmentInd size={16} />, path: findPath('My Tickets') },
        { name: 'Schedules', icon: <MdOutlineCalendarMonth size={16} />, path: findPath('Schedules') },
        { name: 'Archives', icon: <MdOutlineArchive size={16} />, path: findPath('Archives') },
        { name: 'Registration', icon: <ShieldCheck size={16} />, path: findPath('Registration') },
      ].filter(s => s.path !== '#' || hasLink(s.name)),
    },
    {
      title: 'Operations',
      Icon: MdOutlinePeopleAlt,
      subItems: [
        { name: 'HRIS', icon: <MdOutlineDescription size={16} />, path: findPath('HRIS') },
        { name: 'Operations Forms', icon: <MdOutlineDescription size={16} />, path: findPath('Operations Forms') },
        { name: 'Line-up', icon: <MdOutlinePlaylistAdd size={16} />, path: findPath('Lineup') },
        { name: 'Office tasks', icon: <MdOutlineChecklist size={16} />, path: findPath('Office tasks') },
      ].filter(s => navLinks.some(l => l.path === s.path)),
    },
    {
      title: 'Finance',
      Icon: MdOutlineInsertChartOutlined,
      subItems: [
        { name: 'Daily Transactions', icon: <MdOutlineBarChart size={16} />, path: findPath('Daily Transaction') },
        { name: 'Expenses', icon: <MdOutlineReceipt size={16} />, path: findPath('Expense Records') },
        { name: 'Collections', icon: <MdOutlineMonetizationOn size={16} />, path: findPath('For Collections') },
        { name: 'Bills', icon: <MdOutlineAccountBalanceWallet size={16} />, path: findPath('Bills') },
        { name: 'Telecoms', icon: <MdOutlinePhone size={16} />, path: findPath('Telecoms') },
      ].filter(s => navLinks.some(l => l.path === s.path)),
    },
    {
      title: 'Directory',
      Icon: MdMenuBook,
      subItems: [
        { name: 'Employees', icon: <MdOutlinePerson size={16} />, path: findPath('Employees') },
        { name: 'Branches', icon: <MdOutlineStorefront size={16} />, path: findPath('Directory') },
      ].filter(s => navLinks.some(l => l.path === s.path)),
    },
  ].filter(g => g.subItems.length > 0)
}

function buildCollapsedNavItems(navLinks: NavLinkDef[]) {
  const groups = buildNavGroups(navLinks)
  const items: { key: string; name: string; path: string; icon: React.ReactNode; groupPaths?: string[] }[] = []

  const covered = new Set(groups.flatMap(g => g.subItems.map(s => s.path)))
  
  for (const link of navLinks) {
    const key = link.path
    if (covered.has(key)) continue
    const Icon = link.icon
    items.push({
      key: link.name,
      name: link.name,
      path: link.path,
      icon: <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
    })
  }

  for (const group of groups) {
    if (group.subItems.length > 0) {
      const firstSub = group.subItems[0]
      const Icon = group.Icon
      items.push({
        key: group.title,
        name: group.title,
        path: firstSub.path,
        icon: <Icon size={20} className="shrink-0" />,
        groupPaths: group.subItems.map(s => s.path)
      })
    }
  }

  return items
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isHoverExpanded, setIsHoverExpanded] = useState(false)
  const [profileOpen, setProfileOpen]           = useState(false)
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const [openAccordion, setOpenAccordion]       = useState<string | null>(null)
  const [activeSubItem, setActiveSubItem]        = useState<string | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const branchRef = useRef<HTMLDivElement>(null)
  const lastPathname = useRef<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const isLight = theme === 'light'
  const [branchLabel, setBranchLabel] = useState<string | null>(null)

  const handleMouseEnter = () => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false)
      setIsHoverExpanded(true)
    }
  }

  const handleMouseLeave = () => {
    if (isHoverExpanded) {
      setSidebarCollapsed(true)
      setIsHoverExpanded(false)
    }
  }

  const isPortalAdminUser = isPortalAdmin(user?.role)
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(() => localStorage.getItem('ashcol-global-branch-id'))
  const [adminBranches, setAdminBranches] = useState<BranchOption[]>([])

  useEffect(() => {
    if (!isPortalAdminUser) return
    const loadAdminBranches = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const list = data?.data || []

        const newList: BranchOption[] = []
        for (const b of list) {
          const cleanName = b.name.replace(/^(ashcol\s+)/i, '').toUpperCase()
          const isTaguigRow = (b.id || '').toLowerCase().includes('taguig')
            || (b.id || '').toLowerCase().startsWith('2880c29e-581c-11f1-bf8c-74d4dd6dfc0b')
            || cleanName.includes('TAGUIG')
          // Taguig (Sales/Services) is always available; other inactive branches are hidden.
          if (b.isActive === false && !isTaguigRow) continue
          if (b.id === 'BR-TAGUIG-SALES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') {
            if (!newList.some(item => item.id === 'BR-TAGUIG-SALES')) {
              newList.push({ id: 'BR-TAGUIG-SALES', name: 'TAGUIG - SALES' })
            }
            if (!newList.some(item => item.id === 'BR-TAGUIG-SERVICES')) {
              newList.push({ id: 'BR-TAGUIG-SERVICES', name: 'TAGUIG - SERVICES' })
            }
          } else if (b.id === 'BR-TAGUIG-SERVICES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b-services' || b.id === 'BR-TAGUIG-SALES-services') {
            if (!newList.some(item => item.id === 'BR-TAGUIG-SERVICES')) {
              newList.push({ id: 'BR-TAGUIG-SERVICES', name: 'TAGUIG - SERVICES' })
            }
          } else if (cleanName.includes('TAGUIG')) {
            // skip other taguig variants
          } else {
            newList.push({ id: b.id, name: cleanName })
          }
        }
        newList.sort((a, b) => a.name.localeCompare(b.name))
        setAdminBranches(newList)
        
        const stored = localStorage.getItem('ashcol-global-branch-id')
        const storedEntry = stored ? findBranchListEntry(stored, newList) : undefined
        if (!storedEntry && newList.length > 0) {
          localStorage.setItem('ashcol-global-branch-id', newList[0].id)
          setGlobalBranchId(newList[0].id)
          window.dispatchEvent(new Event('ashcol-global-branch-change'))
        } else if (storedEntry && stored !== storedEntry.id) {
          localStorage.setItem('ashcol-global-branch-id', storedEntry.id)
          setGlobalBranchId(storedEntry.id)
          window.dispatchEvent(new Event('ashcol-global-branch-change'))
        }
      } catch (err) {
        console.error('Error loading admin branches:', err)
      }
    }
    loadAdminBranches()
  }, [isPortalAdminUser])

  useEffect(() => {
    if (!isPortalAdminUser) return
    const syncLabel = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      setGlobalBranchId(gId)
      if (gId && adminBranches.length > 0) {
        const found = findBranchListEntry(gId, adminBranches) || adminBranches.find(b => b.id === gId)
        if (found) {
          setBranchLabel(found.name)
        }
      } else {
        setBranchLabel(null)
      }
    }
    syncLabel()
    window.addEventListener('ashcol-global-branch-change', syncLabel)
    return () => window.removeEventListener('ashcol-global-branch-change', syncLabel)
  }, [isPortalAdminUser, adminBranches])

  const handleGlobalBranchChange = (val: string) => {
    localStorage.setItem('ashcol-global-branch-id', val)
    setGlobalBranchId(val)
    window.dispatchEvent(new Event('ashcol-global-branch-change'))
  }

  useEffect(() => {
    if (isPortalAdminUser || !user?.branchId) {
      if (!isPortalAdminUser) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBranchLabel(null)
      }
      return
    }
    const load = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const list = data?.data || []
        const branchId = user.branchId || ''
        const baseBranchId = branchId.replace(/-sales$|-services$/i, '')
        const b = list.find((x: { id: string }) => x.id === branchId)
          || list.find((x: { id: string }) => x.id === baseBranchId)
          || list.find((x: { name?: string }) => {
            const name = (x.name || '').toUpperCase()
            return branchId.toUpperCase().startsWith('BR-TAGUIG') && name.includes('TAGUIG')
          })
        setBranchLabel(normalizeBranchDisplayName(branchId, b?.name))
      } catch {
        setBranchLabel(normalizeBranchDisplayName(user?.branchId, null))
      }
    }
    load()
  }, [user?.branchId, isPortalAdminUser])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) setBranchDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allLinks = [
    { name: 'Schedules',       path: '/schedules',        icon: CalendarDays },
    { name: 'My Tickets',      path: '/my-tickets',       icon: ClipboardList,   roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Relays',          path: '/relays',           icon: Radio,           roles: ['admin', 'management'] },
    { name: 'Search',          path: '/search',          icon: Search },
    { name: 'Archives',        path: '/service-report',  icon: Archive,         roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Registration',    path: '/warranty-registration', icon: ShieldCheck, roles: ['admin', 'management'] },
    { name: 'Office tasks',    path: '/office-tasks',     icon: Building2,       roles: ['admin', 'management'] },
    { name: 'Lineup',          path: '/lineup',           icon: ListOrdered,     roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Employees',       path: '/employees',        icon: UserCog,         roles: ['admin', 'manager'] },
    { name: 'Expense Records', path: '/audit-expenses',  icon: ClipboardList,  roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'For Collections',  path: '/collections',     icon: CircleDollarSign, roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Daily Transaction', path: '/audit-report',   icon: TrendingUp,      roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Directory',       path: '/branches',         icon: MapPin,          roles: ['admin', 'management'] },
    { name: 'HRIS',              path: '/admin-hris',       icon: Calendar,        roles: ['admin', 'management', 'manager'] },
    { name: 'Operations Forms',  path: '/operations-forms', icon: ClipboardList, roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Bills',             path: '/admin-bills',      icon: Landmark,        roles: ['admin', 'management', 'manager'] },
    { name: 'Telecoms',          path: '/admin-telecom',    icon: Wifi,            roles: ['admin', 'management', 'manager'] },
  ]

  const role = (user?.role || '').toLowerCase()
  const isAuthorizedRole = role === 'admin' || role === 'management' || role === 'manager' || role === 'staff' || role === 'employee' || role === 'oic'

  const salesWorkspaceLinks = ['My Tickets', 'Search', 'Schedules', 'Archives', 'For Collections', 'Daily Transaction', 'Expense Records', 'Lineup', 'Operations Forms']
  const serviceWorkspaceLinks = ['My Tickets', 'Search', 'Schedules', 'Archives', 'For Collections', 'Daily Transaction', 'Expense Records', 'Lineup', 'Operations Forms']
  const isSalesUser = isSalesWorkspaceUser(user)
  const isServiceUser = isServiceWorkspaceUser(user)

  const navLinks = isPortalAdmin(role)
      ? allLinks.filter(link => {
          if (!link.roles) return true
          return link.roles.includes(role)
        })
      : isSalesUser
        ? allLinks.filter(link => salesWorkspaceLinks.includes(link.name))
        : isServiceUser
          ? allLinks.filter(link => serviceWorkspaceLinks.includes(link.name))
      : isAuthorizedRole
        ? allLinks.filter(link => serviceWorkspaceLinks.includes(link.name))
        : allLinks.filter(link => serviceWorkspaceLinks.includes(link.name))

  // Redirect if current path is not allowed for the user
  useEffect(() => {
    if (!user) return
    const currentPath = location.pathname
    const alwaysAllowed = ['/profile']
    if (alwaysAllowed.includes(currentPath)) return

    const isAllowed = navLinks.some(link => currentPath === link.path || currentPath.startsWith(link.path + '/'))
    if (!isAllowed && navLinks.length > 0) {
      const homePath = getPortalHomePath(user)
      const hasHome = navLinks.some(l => l.path === homePath)
      const fallback = hasHome ? homePath : navLinks[0].path
      navigate(fallback, { replace: true })
    }
  }, [location.pathname, navLinks, role, user, navigate])

  // ── Color tokens (direct JS objects — no CSS vars) ──────────────
  const bg          = isLight ? '#f1f5f9'              : '#060B18'
  const sidebarBg   = isLight ? '#ffffff'              : '#0A1120'
  const headerBg    = isLight ? 'rgba(255,255,255,0.9)': 'rgba(6,11,24,0.9)'
  const border      = isLight ? '#e2e8f0'              : '#1a2844'
  const textPrimary = isLight ? '#0f172a'              : '#E2E8F0'
  const textMuted   = isLight ? '#64748b'              : '#6B90BE'
  const hoverBg     = isLight ? '#f1f5f9'              : '#0f1e36'
  const inputBorder = isLight ? '#cbd5e1'              : '#1e3254'

  const currentPage = navLinks.find(l => location.pathname === l.path)?.name
    ?? (location.pathname === '/my-tickets' ? 'My Tickets' : 'Dashboard')
  const navGroups = buildNavGroups(navLinks)
  const collapsedNavItems = buildCollapsedNavItems(navLinks)

  // Keep the group for the current page open; don't fight manual collapse until route changes.
  useEffect(() => {
    const path = location.pathname
    if (path === lastPathname.current) return
    lastPathname.current = path

    for (const group of navGroups) {
      const active = group.subItems.find(sub =>
        path === sub.path || (sub.path.length > 1 && path.startsWith(sub.path + '/'))
      )
      if (active) {
        setOpenAccordion(group.title)
        setActiveSubItem(active.name)
        return
      }
    }
    
    // If the new path doesn't match any accordion subItem, clear the active subItem
    setActiveSubItem(null)
    setOpenAccordion(null)
  }, [location.pathname, navGroups])

  // Auto collapse on table-heavy tabs
  useEffect(() => {
    const isTablePage = ['/relays', '/my-tickets', '/schedules', '/service-report', '/search', '/lineup'].some(p => 
      location.pathname === p || location.pathname.startsWith(p + '/')
    )
    if (isTablePage && window.innerWidth >= 768) {
      setSidebarCollapsed(true)
    }
  }, [location.pathname])

  // Prevent minimized state on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && sidebarCollapsed) {
        setSidebarCollapsed(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [sidebarCollapsed])

  const toggleAccordion = (title: string) => {
    setOpenAccordion(prev => (prev === title ? null : title))
  }

  const sidebarIconColor = 'rgba(255,255,255,0.88)'
  const sidebarHoverBg = 'rgba(255,255,255,0.1)'
  const sidebarActiveBg = 'rgba(16,185,129,0.18)'

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div
      className={`flex h-screen overflow-hidden font-['Inter',sans-serif] ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}
      style={{ backgroundColor: bg, color: textPrimary }}
    >
      {/* ── Mobile Backdrop ─────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────── */}
      <div
        className="relative flex shrink-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 flex flex-col overflow-hidden
          transition-all duration-300 ease-in-out
          bg-gradient-to-b from-[#0a180f] via-[#205e30] to-[#3ca94d]
          text-white
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${sidebarCollapsed ? 'md:w-[64px]' : 'w-[260px] md:w-[240px] lg:w-[260px]'}
        `}
      >
        {/* Brand */}
        <div
          className={`flex items-center h-14 shrink-0 ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'}`}
        >
          {/* Logo - always visible, click to toggle collapse on desktop */}
          <img
            src={logoImg}
            alt="ASHCOL"
            onClick={() => { setSidebarCollapsed(c => !c); setIsHoverExpanded(false) }}
            className={`w-9 h-9 object-contain rounded-lg shrink-0 transition-all duration-300 cursor-pointer hidden md:block ${sidebarCollapsed ? 'mx-auto' : ''}`}
          />
          <img
            src={logoImg}
            alt="ASHCOL"
            className="w-9 h-9 object-contain rounded-lg shrink-0 md:hidden"
          />

          {/* Brand text - fades out when collapsed */}
          <div
            className="flex-1 min-w-0 ml-3 transition-all duration-200"
            style={{ opacity: sidebarCollapsed ? 0 : 1, width: sidebarCollapsed ? 0 : undefined, overflow: 'hidden', whiteSpace: 'nowrap' }}
          >
            <div className="text-[15px] font-black tracking-wide text-white">ASHCOL</div>
            <div className="text-[9px] font-bold tracking-[3px] text-green-400 uppercase">Portal</div>
          </div>

          {/* Mobile close */}
          <button
            className="md:hidden p-1.5 rounded-lg transition-colors hover:bg-white/10 shrink-0 text-white/80 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Nav Links ──────────────────────────────────── */}
        <nav className={`flex-1 overflow-y-auto py-3 px-2 flex flex-col ${sidebarCollapsed ? 'gap-1 items-center' : 'gap-0.5'}`}>
          {!sidebarCollapsed && (
            <div className="text-[10px] font-bold uppercase tracking-[2px] px-3 mb-2 text-white/40 w-full">
              Navigation
            </div>
          )}

          {/* ── Search (expanded only) ─────── */}
          {!sidebarCollapsed && navLinks.some(l => l.name === 'Search') && (() => {
            const link = navLinks.find(l => l.name === 'Search')!
            const isActive = location.pathname === link.path
            const Icon = link.icon
            return (
              <Link
                key={link.name}
                to={link.path}
                onClick={() => setSidebarOpen(false)}
                title={sidebarCollapsed ? link.name : undefined}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-150 relative overflow-hidden"
                style={isActive
                  ? { color: '#10B981', backgroundColor: 'rgba(16,185,129,0.15)' }
                  : { color: '#ffffff' }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.1)'
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                }}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#10B981] rounded-r-full" />}
                {Icon && <Icon className="w-4 h-4 shrink-0" />}
                {!sidebarCollapsed && <span className="flex-1 truncate">{link.name}</span>}
                {!sidebarCollapsed && isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />}
              </Link>
            )
          })()}

          {/* ── Accordion Groups (expanded only) ─────────────────────────── */}
          {!sidebarCollapsed && navGroups.map(group => {
            const isOpen = openAccordion === group.title
            const GroupIcon = group.Icon
            const isRouteInGroup = group.subItems.some(sub =>
              location.pathname === sub.path
              || (sub.path.length > 1 && location.pathname.startsWith(sub.path + '/'))
            )
            const panelId = `nav-panel-${group.title.replace(/\s+/g, '-').toLowerCase()}`
            return (
              <div key={group.title} className="mb-0.5 w-full">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleAccordion(group.title)}
                  onKeyDown={(e) => {
                    if (e.key === ' ') {
                      e.preventDefault()
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      toggleAccordion(group.title)
                    }
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  style={isOpen
                    ? { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.12)' }
                    : isRouteInGroup
                      ? { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.06)' }
                      : { color: sidebarIconColor }}
                  onMouseEnter={e => {
                    if (!isOpen) (e.currentTarget as HTMLElement).style.backgroundColor = sidebarHoverBg
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = isOpen
                      ? 'rgba(255,255,255,0.12)'
                      : isRouteInGroup
                        ? 'rgba(255,255,255,0.06)'
                        : 'transparent'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <GroupIcon size={17} className="shrink-0 text-white" />
                    <span className="flex-1 truncate text-left">{group.title}</span>
                  </div>
                  {isOpen
                    ? <FiMinus size={13} className="shrink-0 opacity-60 text-white" />
                    : <FiPlus size={13} className="shrink-0 opacity-60 text-white" />}
                </button>

                {isOpen && (
                  <div id={panelId} role="region" aria-label={group.title} className="relative ml-5 mt-1 mb-2 pl-5">
                    <div className="absolute left-[3px] top-0 bottom-0 w-[1px] bg-white/20" />
                    <div className="flex flex-col space-y-3 py-1">
                      {group.subItems.map((sub, idx) => {
                        const isSubActive = activeSubItem === sub.name
                          || location.pathname === sub.path
                          || location.pathname.startsWith(sub.path + '/')
                        return (
                          <Link
                            key={`${group.title}-${idx}`}
                            to={sub.path}
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveSubItem(sub.name)
                              setSidebarOpen(false)
                            }}
                            className={`relative flex items-center gap-2 text-[13.5px] font-semibold transition-colors py-1 ${
                              isSubActive ? 'text-white' : 'text-white/50 hover:text-white'
                            }`}
                          >
                            {isSubActive && (
                              <div className="absolute -left-5 top-0 bottom-0 w-[3px] bg-white rounded-full" />
                            )}
                            <span className={`shrink-0 transition-opacity ${isSubActive ? 'opacity-100' : 'opacity-70'}`}>
                              {sub.icon}
                            </span>
                            <span className="truncate">{sub.name}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {sidebarCollapsed && collapsedNavItems.map((item) => {
            const isActive = item.groupPaths
              ? item.groupPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'))
              : (location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
            
            return (
              <Link
                key={item.key}
                to={item.path}
                onClick={() => {
                  setSidebarOpen(false)
                  if (item.groupPaths) setOpenAccordion(item.name) // Auto open accordion if clicking group icon
                }}
                title={item.name}
                className="flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-150 relative"
                style={isActive
                  ? { color: '#10B981', backgroundColor: sidebarActiveBg }
                  : { color: sidebarIconColor }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = sidebarHoverBg
                    ;(e.currentTarget as HTMLElement).style.color = '#ffffff'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                    ;(e.currentTarget as HTMLElement).style.color = sidebarIconColor
                  }
                }}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#10B981] rounded-r-full" />}
                {isValidElement(item.icon)
                  ? cloneElement(item.icon, { color: isActive ? '#10B981' : '#ffffff', className: 'shrink-0' })
                  : item.icon}
              </Link>
            )
          })}


        </nav>

        {/* ── Admin Branch Switcher (only for admin) ── */}
        {/* ── Bottom Sticky Section ─────────────────────── */}
        {(() => {
          const showBranch = isPortalAdminUser && adminBranches.length > 0
          return (
            <div className={`px-3 pb-5 pt-2 space-y-2 ${!showBranch ? 'mt-auto' : ''} ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>

              {/* Branch Button (admin only) */}
              {showBranch && (
                sidebarCollapsed ? (
                  <div ref={branchRef} className="relative">
                    {/* Branch dropdown popup */}
                    {branchDropdownOpen && (
                      <div
                        className="absolute z-50 w-52 rounded-xl shadow-2xl overflow-hidden bottom-[calc(100%+8px)] left-0"
                        style={{ backgroundColor: '#0d2818', border: '1px solid rgba(255,255,255,0.12)' }}
                      >
                        <div className="px-4 py-3 text-xs font-black uppercase tracking-wider text-white/40" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          Active Branch
                        </div>
                        <div className="py-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                          {adminBranches.map((b) => {
                            const isSelected = b.id === globalBranchId
                            return (
                              <button
                                key={b.id}
                                onClick={() => {
                                  handleGlobalBranchChange(b.id)
                                  setBranchDropdownOpen(false)
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors text-left ${
                                  isSelected ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span>{formatBranchName(b.name)}</span>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setBranchDropdownOpen(prev => !prev)}
                      className="flex items-center justify-center w-11 h-11 rounded-xl border border-white/10 bg-[#1e732c] hover:bg-[#238533] transition-all text-white font-black text-[13px] shadow-sm uppercase"
                      title={`Active Branch: ${branchLabel || ''}`}
                    >
                      {branchLabel ? getBranchCode(branchLabel) : <Building2 className="w-5 h-5 text-white/70" />}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-white/40 px-1">
                      Active Branch
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white pointer-events-none z-10" />
                      <select
                        value={globalBranchId || ''}
                        onChange={(e) => handleGlobalBranchChange(e.target.value)}
                        className="w-full pl-9 pr-8 py-3 rounded-xl text-sm font-bold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/20 transition-all bg-[#1e732c] text-white shadow-lg shadow-[0_4px_12px_rgba(0,0,0,0.25)] border-0"
                      >
                        {adminBranches.map((b) => (
                          <option key={b.id} value={b.id} style={{ backgroundColor: '#0a180f', color: '#fff' }}>
                            {formatBranchName(b.name)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 pointer-events-none" />
                    </div>
                  </div>
                )
              )}

              {/* User Profile Button */}
              <div ref={profileRef} className="relative">
                {/* Dropdown popup */}
                {profileOpen && (
                  <div
                    className="absolute z-50 w-52 rounded-xl shadow-2xl overflow-hidden bottom-[calc(100%+8px)] left-0"
                    style={{ backgroundColor: '#0d2818', border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <p className="text-sm font-bold truncate text-white">{user?.name}</p>
                      <p className="text-[11px] truncate text-white/50">{user?.email}</p>
                    </div>
                    <div className="py-1.5">
                      <Link
                        to="/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <UserCircle className="w-4 h-4 text-green-400" />
                        My Account
                      </Link>
                      <div className="mx-3 my-1 border-t border-white/10" />
                      <button
                        onClick={() => { setProfileOpen(false); logout(); navigate('/login', { replace: true }) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/60 transition-colors text-left hover:bg-white/10 hover:text-red-400"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}

                {/* Profile button */}
                <button
                  onClick={() => setProfileOpen(p => !p)}
                  className={`flex items-center gap-3 text-left transition-all ${
                    sidebarCollapsed ? 'justify-center w-11 h-11' : 'w-full px-4 py-3 rounded-xl border border-white/10 bg-white/10 hover:bg-white/15'
                  }`}
                >
                  <UserAvatar
                    name={user?.name}
                    imageUrl={user?.picture}
                    size="sm"
                    ring
                    variant="sidebar"
                  />

                  {/* Name + Role */}
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate leading-snug text-white">
                        {formatPersonName(user?.name ?? '') || 'User'}
                      </p>
                      <p className="text-xs truncate leading-none mt-0.5 text-white/60 font-normal">
                        {user?.jobTitle ? formatPersonName(user.jobTitle) : formatRole(user?.role) || 'Staff'}
                      </p>
                    </div>
                  )}

                  {/* Chevron */}
                  {!sidebarCollapsed && (
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 shrink-0 text-white/70 ${profileOpen ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>
              </div>

            </div>
          )
        })()}


      </aside>
    </div>

      {/* ── Main Content Area ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Global Header (Mobile/Tablet/Desktop) ──────────────── */}
        {currentPage !== 'Search' && (
          <header 
            className="flex-none z-50 backdrop-blur-md"
            style={{ 
              backgroundColor: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(10,17,32,0.8)',
              borderBottom: `1px solid ${border}` 
            }}
          >
          {/* Top row: title + icons */}
          <div className="h-14 flex items-center justify-between px-5 md:px-8 relative">
            <div className="flex items-center gap-3 shrink-0">
              <button
                className="md:hidden p-2 rounded-xl transition-all"
                style={{ color: textMuted, backgroundColor: hoverBg }}
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-4 h-4" />
              </button>

              <div className="flex flex-col justify-center">
                {currentPage === 'Relays' ? (
                  <h1 className="text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase" style={{ color: textPrimary }}>
                    Relays
                  </h1>
                ) : (
                  <>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest leading-none mb-1 opacity-70" style={{ color: textMuted }}>
                      {currentPage}
                    </span>
                    {branchLabel ? (
                      <h1 className="text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase" style={{ color: textPrimary }} title={branchLabel}>
                        {branchLabel}
                      </h1>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                title={isLight ? 'Switch to Dark' : 'Switch to Light'}
                className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all hover:scale-105"
                style={{
                  color: textMuted,
                  backgroundColor: hoverBg,
                  border: `1px solid ${inputBorder}`,
                }}
              >
                {isLight ? (
                  <>
                    <Moon className="w-4 h-4" />
                    <span className="text-xs font-semibold whitespace-nowrap">Dark Mode</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />
                    <span className="text-xs font-semibold whitespace-nowrap">Light Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div id="header-toolbar-slot" />
        </header>
        )}

        {/* ── Page Content ───────────────────────────────── */}
        <main className={
          (currentPage === 'Relays' || currentPage === 'My Tickets' || currentPage === 'Schedules' || currentPage === 'Archives' || currentPage === 'Registration' || currentPage === 'Search')
            ? "flex-1 flex flex-col min-h-0 overflow-hidden relative p-0"
            : currentPage === 'HRIS'
              ? "flex-1 overflow-y-auto pt-5 pb-20 px-0 sm:px-5 md:p-8 relative"
              : "flex-1 overflow-y-auto p-5 md:p-8 relative"
        }>
          {/* Subtle ambient gradient */}
          {!isLight && (
            <div className="pointer-events-none fixed top-0 right-0 w-[500px] h-[500px] opacity-[0.06]"
                 style={{
                   background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)',
                   filter: 'blur(80px)',
                   zIndex: 0,
                 }} />
          )}
          <div className={`relative z-10 ${(currentPage === 'Relays' || currentPage === 'My Tickets' || currentPage === 'Schedules' || currentPage === 'Archives' || currentPage === 'Registration' || currentPage === 'Search') ? 'flex flex-col flex-1 min-h-0 h-full w-full' : ''}`}>
            {/* Do not key Outlet by pathname — that remounts Schedules on every nav and forces a reload spinner. */}
            <Outlet context={{ setSidebarOpen }} />
          </div>
        </main>
      </div>

      {/* ── Global Agentic Chat UI ────────────────────── */}
      {/* <AIChatBot /> */}
    </div>
  )
}
