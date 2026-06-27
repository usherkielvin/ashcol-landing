// @ts-nocheck
import { useState, useRef, useEffect, cloneElement, isValidElement } from 'react'
import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import {
  Ticket as TicketIcon,
  Menu, LogOut, X, Sun, Moon,
  ChevronRight, UserCircle, ChevronDown,
  PanelLeftOpen, ClipboardList,
  Radio, CalendarDays, UserCog, TrendingUp, MapPin, Archive,
  Building2, Calendar, Landmark, Wifi, CircleDollarSign, ListOrdered
} from 'lucide-react'
import {
  MdOutlineConfirmationNumber,
  MdOutlineLocalActivity,
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
import { API_BASE_URL, formatRole, getPortalHomePath, isSalesWorkspaceUser, isServiceWorkspaceUser } from '../utils/api'

// import AIChatBot from '../components/AIChatBot'
import logoImg from '../assets/ash-logo.jpg'

const normalizeBranchDisplayName = (branchId?: string | null, branchName?: string | null) => {
  if (!branchId && !branchName) return null
  const id = (branchId || '').toUpperCase()
  const name = (branchName || '').trim()

  if (id === 'BR-TAGUIG-SALES') return 'TAGUIG - SALES'
  if (id === 'BR-TAGUIG-SERVICES' || id === 'BR-TAGUIG-SERVICE') return 'TAGUIG - SERVICES'
  if (id.endsWith('-SALES')) return 'TAGUIG - SALES'
  if (id.endsWith('-SERVICES') || id.endsWith('-SERVICE')) return 'TAGUIG - SERVICES'
  if (name) {
    const clean = name.replace(/^(ashcol\s+)/i, '').toUpperCase()
    if (clean === 'TAGUIG' || clean === 'ASHCOL TAGUIG') {
      if (id.endsWith('-SERVICES') || id.endsWith('-SERVICE')) return 'TAGUIG - SERVICES'
      return 'TAGUIG - SALES'
    }
    return name
  }
  return branchId || null
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
        { name: 'Schedules', icon: <MdOutlineCalendarMonth size={16} />, path: findPath('Schedules') },
        { name: 'Archives', icon: <MdOutlineArchive size={16} />, path: findPath('Archives') },
      ].filter(s => s.path !== '#' || hasLink(s.name)),
    },
    {
      title: 'Operations',
      Icon: MdOutlinePeopleAlt,
      subItems: [
        { name: 'HRIS', icon: <MdOutlineDescription size={16} />, path: findPath('HRIS') },
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

/** Collapsed rail: one icon per destination (no duplicate paths / redundant entries). */
function buildCollapsedNavItems(navLinks: NavLinkDef[]) {
  const groups = buildNavGroups(navLinks)
  const items: { key: string; name: string; path: string; icon: React.ReactNode }[] = []
  const seenPaths = new Set<string>()

  const normalizePath = (path: string) => (path === '/tickets' ? '/schedules' : path)

  const addItem = (name: string, path: string, icon: React.ReactNode) => {
    if (!path || path === '#') return
    const key = normalizePath(path)
    if (seenPaths.has(key)) return
    seenPaths.add(key)
    items.push({ key, name, path, icon })
  }

  for (const group of groups) {
    for (const sub of group.subItems) {
      addItem(sub.name, sub.path, sub.icon)
    }
  }

  const covered = new Set(items.map(i => normalizePath(i.path)))
  for (const link of navLinks) {
    const key = normalizePath(link.path)
    if (covered.has(key)) continue
    const Icon = link.icon
    addItem(link.name, link.path, <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />)
  }

  return items
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [profileOpen, setProfileOpen]           = useState(false)
  const [openAccordion, setOpenAccordion]       = useState<string | null>(null)
  const [activeSubItem, setActiveSubItem]        = useState<string | null>('Relays')
  const [navPicBroken, setNavPicBroken]         = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const isLight = theme === 'light'
  const [branchLabel, setBranchLabel] = useState<string | null>(null)

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(() => localStorage.getItem('ashcol-global-branch-id'))
  const [adminBranches, setAdminBranches] = useState<BranchOption[]>([])

  useEffect(() => {
    if (!isAdmin) return
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
          if (b.id === 'BR-TAGUIG-SALES' || b.id === '2880c29e-581c-11f1-bf8c-74d4dd6dfc0b') {
            if (!newList.some(item => item.id === 'BR-TAGUIG-SALES')) {
              newList.push({ id: 'BR-TAGUIG-SALES', name: 'TAGUIG - SALES' })
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
        
        // Initialize default global branch if not set yet
        const stored = localStorage.getItem('ashcol-global-branch-id')
        const storedStillValid = stored && newList.some(b => b.id === stored)
        if ((!storedStillValid || !stored) && newList.length > 0) {
          localStorage.setItem('ashcol-global-branch-id', newList[0].id)
          setGlobalBranchId(newList[0].id)
          window.dispatchEvent(new Event('ashcol-global-branch-change'))
        }
      } catch (err) {
        console.error('Error loading admin branches:', err)
      }
    }
    loadAdminBranches()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    const syncLabel = () => {
      const gId = localStorage.getItem('ashcol-global-branch-id')
      setGlobalBranchId(gId)
      if (gId && adminBranches.length > 0) {
        const found = adminBranches.find(b => b.id === gId)
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
  }, [isAdmin, adminBranches])

  const handleGlobalBranchChange = (val: string) => {
    localStorage.setItem('ashcol-global-branch-id', val)
    setGlobalBranchId(val)
    window.dispatchEvent(new Event('ashcol-global-branch-change'))
  }

  // Reset broken flag whenever the picture URL changes (e.g. after a new upload)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavPicBroken(false)
  }, [user?.picture])

  useEffect(() => {
    if (isAdmin || !user?.branchId) {
      if (!isAdmin) {
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
  }, [user?.branchId, isAdmin])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allLinks = [
    // { name: 'Overview',        path: '/dashboard-home',  icon: LayoutDashboard, roles: ['admin'] },
    { name: 'Schedules',       path: '/schedules',        icon: CalendarDays },
    { name: 'Relays',          path: '/relays',           icon: Radio,           roles: ['admin'] },
    { name: 'Tickets',         path: '/tickets',          icon: TicketIcon },
    { name: 'Archives',        path: '/service-report',  icon: Archive,         roles: ['admin', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Office tasks',    path: '/office-tasks',     icon: Building2,       roles: ['admin'] },
    { name: 'Lineup',          path: '/lineup',           icon: ListOrdered,     roles: ['admin', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Employees',       path: '/employees',        icon: UserCog,         roles: ['admin', 'manager'] },
    { name: 'Expense Records', path: '/audit-expenses',  icon: ClipboardList,  roles: ['admin', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'For Collections',  path: '/collections',     icon: CircleDollarSign, roles: ['admin', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Daily Transaction', path: '/audit-report',   icon: TrendingUp,      roles: ['admin', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Directory',       path: '/branches',         icon: MapPin,          roles: ['admin'] },
    { name: 'HRIS',              path: '/admin-hris',       icon: Calendar,        roles: ['admin', 'manager'] },
    { name: 'Bills',             path: '/admin-bills',      icon: Landmark,        roles: ['admin', 'manager'] },
    { name: 'Telecoms',          path: '/admin-telecom',    icon: Wifi,            roles: ['admin', 'manager'] },
  ]

  const role = (user?.role || '').toLowerCase()
  const isAuthorizedRole = role === 'admin' || role === 'manager' || role === 'staff' || role === 'employee' || role === 'oic'

  const salesWorkspaceLinks = ['Tickets', 'Schedules', 'Archives', 'For Collections', 'Daily Transaction', 'Expense Records', 'Lineup']
  const serviceWorkspaceLinks = ['Tickets', 'Schedules', 'Archives', 'For Collections', 'Daily Transaction', 'Expense Records', 'Lineup']
  const isSalesUser = isSalesWorkspaceUser(user)
  const isServiceUser = isServiceWorkspaceUser(user)

  const navLinks = role === 'admin'
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
      const fallback = role === 'admin' ? navLinks[0].path : getPortalHomePath(user)
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

  const currentPage = navLinks.find(l => location.pathname === l.path)?.name ?? 'Dashboard'
  const navGroups = buildNavGroups(navLinks)
  const collapsedNavItems = buildCollapsedNavItems(navLinks)

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
            onClick={() => setSidebarCollapsed(c => !c)}
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

          {/* ── Overview (expanded only) ─────── */}
          {!sidebarCollapsed && navLinks.some(l => l.name === 'Overview') && (() => {
            const link = navLinks.find(l => l.name === 'Overview')!
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
            const isParentActive = isOpen
            return (
              <div key={group.title} className="mb-0.5 w-full">
                <button
                  onClick={() => setOpenAccordion(isOpen ? null : group.title)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-150"
                  style={isParentActive
                    ? { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.12)' }
                    : { color: sidebarIconColor }}
                  onMouseEnter={e => {
                    if (!isParentActive) (e.currentTarget as HTMLElement).style.backgroundColor = sidebarHoverBg
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = isParentActive ? 'rgba(255,255,255,0.12)' : 'transparent'
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
                  <div className="relative ml-5 mt-1 mb-2 pl-5">
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

          {/* Collapsed mode: deduplicated icon rail */}
          {sidebarCollapsed && collapsedNavItems.map((item) => {
            const isActive = location.pathname === item.path
              || location.pathname.startsWith(item.path + '/')
              || (item.path === '/schedules' && location.pathname === '/tickets')
            return (
              <Link
                key={item.key}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
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

          {sidebarCollapsed && (
            <button
              className="hidden md:flex items-center justify-center w-11 h-11 mt-2 rounded-xl transition-colors text-white/70 hover:text-white hover:bg-white/10"
              title="Expand sidebar"
              onClick={() => setSidebarCollapsed(false)}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </nav>

        {/* ── Admin Branch Switcher (only for admin) ── */}
        {/* ── Bottom Sticky Section ─────────────────────── */}
        {(() => {
          const showBranch = isAdmin && adminBranches.length > 0
          return (
            <div className={`px-3 pb-5 pt-2 space-y-2 ${!showBranch ? 'mt-auto' : ''} ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>

              {/* Branch Button (admin only) */}
              {showBranch && (
                sidebarCollapsed ? (
                  <div
                    onClick={() => setSidebarCollapsed(false)}
                    className="flex justify-center cursor-pointer py-3"
                    title="Active Branch Switcher"
                  >
                    <Building2 className="w-5 h-5 text-white/70" />
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
                            {b.name}
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
                  className={`w-full flex items-center gap-3 text-left rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 transition-all ${
                    sidebarCollapsed ? 'p-2 justify-center w-11 h-11' : 'px-4 py-3'
                  }`}
                >
                  {/* Avatar */}
                  {user?.picture && !navPicBroken ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-white/30 shrink-0"
                      referrerPolicy="no-referrer"
                      onError={() => setNavPicBroken(true)}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#1e732c] font-bold text-lg shrink-0">
                      {user?.initials ?? '?'}
                    </div>
                  )}

                  {/* Name + Role */}
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate leading-snug text-white">
                        {user?.name ?? 'Admin User'}
                      </p>
                      <p className="text-xs truncate leading-none mt-0.5 text-white/60 font-normal">
                        {user?.jobTitle || formatRole(user?.role) || 'Administrator'}
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

      {/* ── Main Content Area ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Global Header (Mobile/Tablet/Desktop) ──────────────── */}
        {currentPage !== 'Overview' && (
          <header 
            className="flex-none z-20 backdrop-blur-md"
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
            </div>

            {/* Centered Page Title */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center pointer-events-none z-10">
              <h1 className="text-[15px] font-black tracking-tight" style={{ color: textPrimary }}>
                {currentPage}
              </h1>
              {branchLabel ? (
                <p className="text-[11px] hidden sm:block truncate max-w-[200px] md:max-w-md" style={{ color: textMuted }} title={branchLabel}>
                  {`Branch · ${branchLabel}`}
                </p>
              ) : null}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                title={isLight ? 'Switch to Dark' : 'Switch to Light'}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all hover:scale-105"
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
          currentPage === 'Overview'
            ? "flex-1 overflow-y-auto relative bg-[#fafafa] dark:bg-[#0a1120]"
            : currentPage === 'Relays'
              ? "flex-1 flex flex-col min-h-0 overflow-hidden relative p-0"
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
          <div className={`relative z-10 ${currentPage === 'Relays' ? 'flex flex-col flex-1 min-h-0 h-full w-full' : ''}`}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Global Agentic Chat UI ────────────────────── */}
      {/* <AIChatBot /> */}
    </div>
  )
}
