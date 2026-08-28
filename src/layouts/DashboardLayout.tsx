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
  Building2, Calendar, Landmark, Wifi, CircleDollarSign, ListOrdered,
  LayoutDashboard, Route, Truck, ClipboardCheck, PhoneCall, Percent, Wallet, CalendarPlus,
  History, Shield, Settings, Banknote
} from 'lucide-react'
import {
  MdOutlineConfirmationNumber,
  MdOutlineDashboard,
  MdOutlineLocalActivity,
  MdOutlineAssignmentInd,
  MdOutlineCalendarMonth,
  MdOutlineArchive,
  MdOutlineAssignmentTurnedIn,
  MdOutlineEventAvailable,
  MdOutlinePeopleAlt,
  MdOutlineDescription,
  MdOutlinePlaylistAdd,
  MdOutlineAltRoute,
  MdOutlineChecklist,
  MdOutlineInsertChartOutlined,
  MdOutlineReceipt,
  MdOutlineMonetizationOn,
  MdOutlineBarChart,
  MdOutlineAccountBalanceWallet,
  MdOutlinePhone,
  MdOutlinePhoneInTalk,
  MdOutlinePercent,
  MdOutlineAttachMoney,
  MdOutlinePayments,
  MdMenuBook,
  MdOutlinePerson,
  MdOutlineStorefront,
} from 'react-icons/md'
import { FiMinus, FiPlus } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatRole, formatPersonName, getPortalHomePath, isPortalAdmin, isSalesWorkspaceUser, isServiceWorkspaceUser, findBranchListEntry, formatBranchName, canMemberAccessRelaysAndTicketCreation, canMemberAccessDdrm, canMemberAccessPayroll, isSystemAdmin, isPortalStaffUser, isWarrantyRegistrar } from '../utils/api'
import UserAvatar from '../components/UserAvatar'
import MessagesDropdown from '../components/MessagesDropdown'
import NotificationsDropdown from '../components/NotificationsDropdown'
import FloatingChatWindow from '../components/FloatingChatWindow'
import { HEADER_MENU_OPENED_EVENT, broadcastHeaderMenuOpen } from '../utils/headerMenuCoordination'


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
        { name: 'Bookings', icon: <MdOutlineEventAvailable size={16} />, path: findPath('Bookings') },
        { name: 'My Tickets', icon: <MdOutlineAssignmentInd size={16} />, path: findPath('My Tickets') },
        { name: 'Schedules', icon: <MdOutlineCalendarMonth size={16} />, path: findPath('Schedules') },
        { name: 'Archives', icon: <MdOutlineArchive size={16} />, path: findPath('Archives') },
        { name: 'Registration', icon: <MdOutlineAssignmentTurnedIn size={16} />, path: findPath('Registration') },
        { name: 'Happy Calls', icon: <MdOutlinePhoneInTalk size={16} />, path: findPath('Happy Calls') },
      ].filter(s => s.path !== '#' || hasLink(s.name)),
    },
    {
      title: 'Operations',
      Icon: MdOutlinePeopleAlt,
      subItems: [
        { name: 'LINEUP', icon: <MdOutlinePlaylistAdd size={16} />, path: findPath('LINEUP') },
        { name: 'HRIS', icon: <MdOutlineDescription size={16} />, path: findPath('HRIS') },
        { name: 'DDRM', icon: <MdOutlineAltRoute size={16} />, path: findPath('DDRM') },
        { name: 'Request Forms', icon: <MdOutlineDescription size={16} />, path: findPath('Request Forms') },
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
        { name: 'Commissions', icon: <MdOutlinePercent size={16} />, path: findPath('Commissions') },
        { name: 'Cash Advance', icon: <MdOutlineAttachMoney size={16} />, path: findPath('Cash Advance') },
        { name: 'Payroll', icon: <MdOutlinePayments size={16} />, path: findPath('Payroll') },
        { name: 'Bills', icon: <MdOutlineAccountBalanceWallet size={16} />, path: findPath('Bills') },
        { name: 'Telecoms', icon: <MdOutlinePhone size={16} />, path: findPath('Telecoms') },
      ].filter(s => navLinks.some(l => l.path === s.path)),
    },
    {
      title: 'Directory',
      Icon: MdMenuBook,
      subItems: [
        { name: 'Members', icon: <MdOutlinePerson size={16} />, path: findPath('Members') },
        { name: 'Vehicles', icon: <Truck size={16} />, path: findPath('Vehicles') },
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
  // navVisible lags behind sidebarCollapsed so text never renders mid-transition
  // collapse → hide text immediately; expand → show text only after width finishes
  const [navVisible, setNavVisible] = useState(true)
  const [showCollapsedIcons, setShowCollapsedIcons] = useState(false)
  const [profileOpen, setProfileOpen]           = useState(false)
  const [headerBranchDropdownOpen, setHeaderBranchDropdownOpen] = useState(false)
  const [openAccordion, setOpenAccordion]       = useState<string | null>(null)
  const [activeSubItem, setActiveSubItem]        = useState<string | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const headerBranchRef = useRef<HTMLDivElement>(null)
  const lastPathname = useRef<string | null>(null)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navVisibleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const isLight = theme === 'light'
  const [branchLabel, setBranchLabel] = useState<string | null>(null)

  const handleMouseEnter = () => {
    // Debounce: cancel any pending leave, schedule enter with small delay to ignore rapid oscillations
    if (hoverDebounce.current) clearTimeout(hoverDebounce.current)
    hoverDebounce.current = setTimeout(() => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
      if (navVisibleTimeout.current) clearTimeout(navVisibleTimeout.current)
      if (sidebarCollapsed || (isHoverExpanded && !navVisible)) {
        setShowCollapsedIcons(false)
        setSidebarCollapsed(false)
        setIsHoverExpanded(true)
        setNavVisible(true)
      }
    }, 60)
  }

  const handleMouseLeave = () => {
    // Debounce: cancel any pending enter, schedule leave after debounce window
    if (hoverDebounce.current) clearTimeout(hoverDebounce.current)
    hoverDebounce.current = setTimeout(() => {
      if (isHoverExpanded) {
        setNavVisible(false)
        if (navVisibleTimeout.current) clearTimeout(navVisibleTimeout.current)
        hoverTimeout.current = setTimeout(() => {
          setSidebarCollapsed(true)
          setIsHoverExpanded(false)
          setShowCollapsedIcons(true)
        }, 160)
      }
    }, 60)
  }

  const isPortalAdminUser = isPortalAdmin(user?.role)
  const [globalBranchId, setGlobalBranchId] = useState<string | null>(() => localStorage.getItem('ashcol-global-branch-id'))
  const [adminBranches, setAdminBranches] = useState<BranchOption[]>([])

  // Sync navVisible when sidebarCollapsed changes via the pin-toggle (logo click)
  useEffect(() => {
    if (!isHoverExpanded) {
      if (sidebarCollapsed) {
        if (navVisibleTimeout.current) clearTimeout(navVisibleTimeout.current)
        setNavVisible(false)
        // Show icon rail after sidebar has finished collapsing
        navVisibleTimeout.current = setTimeout(() => setShowCollapsedIcons(true), 180)
      } else {
        setShowCollapsedIcons(false)
        if (navVisibleTimeout.current) clearTimeout(navVisibleTimeout.current)
        // Show text immediately when pin-expanding
        setNavVisible(true)
      }
    }
  }, [sidebarCollapsed, isHoverExpanded])

  // Keep portal chrome in the viewport without locking html/body (that broke other pages)
  useEffect(() => {
    const html = document.documentElement
    // Clear login/portal leftovers if navigating in after a hard refresh mid-login
    html.classList.remove('login-shell')
    html.style.removeProperty('overflow')
    document.body.style.removeProperty('overflow')
    document.body.style.removeProperty('touch-action')
    html.style.removeProperty('--app-height')
  }, [])

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

  // Close dropdowns on outside click. Capture phase so a target element's own
  // stopPropagation() (e.g. a table row/cell click handler) can't block this from firing —
  // that was letting clicks anywhere on page content pass through without closing the header
  // branch dropdown.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
      if (headerBranchRef.current && !headerBranchRef.current.contains(e.target as Node)) setHeaderBranchDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler, true)
    const onHeaderMenuOpened = (e: Event) => {
      if ((e as CustomEvent).detail !== 'profile') setProfileOpen(false)
    }
    window.addEventListener(HEADER_MENU_OPENED_EVENT, onHeaderMenuOpened)
    return () => {
      document.removeEventListener('mousedown', handler, true)
      window.removeEventListener(HEADER_MENU_OPENED_EVENT, onHeaderMenuOpened)
    }
  }, [])

  const canAccessRelays = canMemberAccessRelaysAndTicketCreation(user)
  const canAccessDdrm = canMemberAccessDdrm(user)
  const canAccessPayroll = canMemberAccessPayroll(user)

  const allLinks = [
    { name: 'Schedules',       path: '/schedules',        icon: CalendarDays },
    { name: 'My Tickets',      path: '/my-tickets',       icon: ClipboardList,   roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Relays',          path: '/relays',           icon: Radio,           roles: canAccessRelays ? ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] : ['admin', 'management'] },
    { name: 'Bookings',        path: '/bookings',         icon: CalendarPlus,    roles: canAccessRelays ? ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] : ['admin', 'management'] },
    { name: 'Search',          path: '/search',          icon: Search },
    { name: 'Archives',        path: '/service-report',  icon: Archive,         roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Registration',   path: '/registration',    icon: ClipboardCheck, roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Happy Calls',    path: '/happy-calls',     icon: PhoneCall,      roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Office tasks',    path: '/office-tasks',     icon: Building2,       roles: ['admin', 'management'] },
    { name: 'LINEUP',          path: '/lineup',           icon: ListOrdered,     roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Members',         path: '/employees',        icon: UserCog,         roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic', 'technician', 'driver'] },
    { name: 'Vehicles',        path: '/vehicles',         icon: Truck,           roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic', 'technician', 'driver'] },
    { name: 'Expense Records', path: '/audit-expenses',  icon: ClipboardList,  roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'For Collections',  path: '/collections',     icon: CircleDollarSign, roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Commissions',      path: '/commissions',     icon: Percent,          roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Cash Advance',     path: '/cash-advances',   icon: Wallet,           roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Payroll',          path: '/payroll',          icon: Banknote,        roles: canAccessPayroll ? ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] : ['admin', 'management'] },
    { name: 'Daily Transaction', path: '/audit-report',   icon: TrendingUp,      roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Directory',       path: '/branches',         icon: MapPin,          roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic', 'technician', 'driver'] },
    { name: 'HRIS',              path: '/admin-hris',       icon: Calendar,        roles: ['admin', 'management', 'manager'] },
    { name: 'DDRM',              path: '/ddrm',             icon: Route,           roles: canAccessDdrm ? ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] : ['admin', 'management', 'manager'] },
    { name: 'Request Forms',     path: '/operations-forms', icon: ClipboardList, roles: ['admin', 'management', 'manager', 'staff', 'employee', 'oic'] },
    { name: 'Bills',             path: '/admin-bills',      icon: Landmark,        roles: ['admin', 'management', 'manager'] },
    { name: 'Telecoms',          path: '/admin-telecom',    icon: Wifi,            roles: ['admin', 'management', 'manager'] },
  ]

  const role = (user?.role || '').toLowerCase()
  const isAuthorizedRole = role === 'admin' || role === 'management' || role === 'manager' || role === 'staff' || role === 'employee' || role === 'oic' || role === 'technician' || role === 'driver'

  const salesWorkspaceLinks = ['My Tickets', 'Search', 'Schedules', 'Archives', 'Registration', 'Happy Calls', 'For Collections', 'Commissions', 'Cash Advance', 'Daily Transaction', 'Expense Records', 'LINEUP', 'Request Forms', 'Members', 'Vehicles', 'Directory', ...(canAccessPayroll ? ['Payroll'] : []), ...(canAccessRelays ? ['Relays', 'Bookings'] : []), ...(canAccessDdrm ? ['DDRM'] : [])]
  const serviceWorkspaceLinks = ['My Tickets', 'Search', 'Schedules', 'Archives', 'Registration', 'Happy Calls', 'For Collections', 'Commissions', 'Cash Advance', 'Daily Transaction', 'Expense Records', 'LINEUP', 'Request Forms', 'Members', 'Vehicles', 'Directory', ...(canAccessPayroll ? ['Payroll'] : []), ...(canAccessRelays ? ['Relays', 'Bookings'] : []), ...(canAccessDdrm ? ['DDRM'] : [])]
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
    const alwaysAllowed = ['/profile', '/tickets/create', '/create-ticket']
    if (alwaysAllowed.includes(currentPath) || currentPath.startsWith('/messages')) return


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

  const currentPage = navLinks.find(l => location.pathname === l.path || (l.path !== '/' && location.pathname.startsWith(l.path + '/')))?.name
    ?? (location.pathname.startsWith('/employees') ? 'Members'
      : location.pathname === '/my-tickets' ? 'My Tickets'
      : location.pathname.startsWith('/messages') ? 'Messages'
      : 'Dashboard')
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

  // Auto collapse on table-heavy tabs and scroll to top on route change
  const mainContentRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
    }
    const isTablePage = ['/relays', '/my-tickets', '/schedules', '/service-report', '/search', '/lineup', '/ddrm'].some(p => 
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
      className={`flex w-full max-w-full h-screen max-h-screen overflow-hidden font-['Inter',sans-serif] ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}
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
        className="relative flex shrink-0 h-full max-h-full min-h-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 flex flex-col h-full max-h-full min-h-0 overflow-hidden
          bg-gradient-to-b from-[#0a180f] via-[#205e30] to-[#3ca94d]
          text-white
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${sidebarCollapsed ? 'md:w-[64px]' : 'w-[260px] md:w-[220px] lg:w-[240px]'}
        `}
        style={{ transition: 'width 120ms cubic-bezier(0.4,0,0.2,1), transform 200ms cubic-bezier(0.4,0,0.2,1)' }}
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
        <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2 flex flex-col gap-0.5 relative">

          {/* ══ EXPANDED CONTENT — shown when navVisible, fades smoothly ══ */}
          <div
            style={{
              opacity: navVisible ? 1 : 0,
              transition: 'opacity 120ms ease',
              pointerEvents: navVisible ? 'auto' : 'none',
              display: !navVisible && !sidebarCollapsed ? 'none' : undefined,
            }}
          >
            {navVisible && (<>
              <div className="text-[10px] font-bold uppercase tracking-[2px] px-3 mb-2 text-white/40 w-full">
                Navigation
              </div>

              {/* Search */}
              {navLinks.some(l => l.name === 'Search') && (() => {
                const link = navLinks.find(l => l.name === 'Search')!
                const isActive = location.pathname === link.path
                const Icon = link.icon
                return (
                  <Link
                    key={link.name}
                    to={link.path}
                    onClick={() => setSidebarOpen(false)}
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
                    <span className="flex-1 truncate">{link.name}</span>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />}
                  </Link>
                )
              })()}

              {/* Accordion Groups */}
              {navGroups.map(group => {
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
                        if (e.key === ' ') { e.preventDefault(); return }
                        if (e.key === 'Enter') { e.preventDefault(); toggleAccordion(group.title) }
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
                          : isRouteInGroup ? 'rgba(255,255,255,0.06)' : 'transparent'
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

                    <div
                      id={panelId}
                      role="region"
                      aria-label={group.title}
                      className="relative ml-5 pl-5 overflow-hidden"
                      style={{
                        maxHeight: isOpen ? '400px' : '0px',
                        opacity: isOpen ? 1 : 0,
                        marginTop: isOpen ? '4px' : '0px',
                        marginBottom: isOpen ? '8px' : '0px',
                        transition: 'max-height 300ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease, margin 300ms cubic-bezier(0.4,0,0.2,1)',
                      }}
                    >
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
                  </div>
                )
              })}
            </>)}
          </div>

          {/* ══ COLLAPSED ICON RAIL — rendered only when navVisible is false ══ */}
          {!navVisible && (
            <div
              className="w-full py-1 flex flex-col gap-1 items-center"
              style={{
                opacity: showCollapsedIcons ? 1 : 0,
                transition: 'opacity 120ms ease',
                pointerEvents: showCollapsedIcons ? 'auto' : 'none',
              }}
            >
              {collapsedNavItems.map((item) => {
                const isActive = item.groupPaths
                  ? item.groupPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'))
                  : (location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
                return (
                  <Link
                    key={item.key}
                    to={item.path}
                    onClick={() => {
                      setSidebarOpen(false)
                      if (item.groupPaths) setOpenAccordion(item.name)
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
            </div>
          )}

        </nav>


      </aside>
    </div>

      {/* ── Main Content Area ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

        {/* ── Global Header (Mobile/Tablet/Desktop) ──────────────── */}
        <header 
          className="flex-none z-30 backdrop-blur-md w-full min-w-0 max-w-full relative"
          style={{ 
            backgroundColor: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(10,17,32,0.8)'
          }}
        >
          {/* Top row: title + icons */}
          <div className="h-14 flex items-center justify-between px-4 md:px-6 lg:px-8 relative min-w-0">
            <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 mr-2">
              <button
                className="md:hidden p-2 rounded-xl transition-all shrink-0"
                style={{ color: textMuted, backgroundColor: hoverBg }}
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-4 h-4" />
              </button>

              <div className="flex flex-col justify-center min-w-0 shrink-0">
                {location.pathname === '/profile' ? (
                  <h1 className="text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase truncate" style={{ color: textPrimary }}>
                    Profile
                  </h1>
                ) : location.pathname.startsWith('/messages') || currentPage === 'Messages' ? (
                  <h1 className="text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase truncate" style={{ color: textPrimary }}>
                    Messages
                  </h1>
                ) : currentPage === 'Search' || location.pathname === '/search' ? (
                  <h1 className="text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase truncate" style={{ color: textPrimary }}>
                    Search
                  </h1>
                ) : currentPage === 'Relays' || currentPage === 'Employees' || currentPage === 'Members' || currentPage === 'Registration' || currentPage === 'Request Forms' || currentPage === 'Payroll' || location.pathname === '/payroll' || location.pathname === '/operations-forms' ? (
                  <h1 className="text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase truncate" style={{ color: textPrimary }}>
                    {currentPage}
                  </h1>
                ) : (
                  <>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest leading-none mb-1 opacity-70" style={{ color: textMuted }}>
                      {currentPage}
                    </span>
                    {branchLabel ? (
                      isPortalAdminUser && adminBranches.length > 0 ? (
                        <div ref={headerBranchRef} className="relative">
                          <button
                            onClick={() => setHeaderBranchDropdownOpen(prev => !prev)}
                            className="flex items-center gap-1 text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase truncate transition-opacity hover:opacity-80"
                            style={{ color: textPrimary }}
                            title={`Active Branch: ${branchLabel}`}
                          >
                            <span className="truncate">{branchLabel}</span>
                            <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
                          </button>
                          {headerBranchDropdownOpen && (
                              <div
                                className="absolute z-50 w-56 rounded-xl shadow-2xl overflow-hidden top-[calc(100%+8px)] left-0"
                                style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
                              >
                                <div className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  Active Branch
                                </div>
                                <div className="py-1.5 max-h-72 overflow-y-auto no-scrollbar">
                                  {adminBranches.map((b) => {
                                    const isSelected = b.id === globalBranchId
                                    return (
                                      <button
                                        key={b.id}
                                        onClick={() => { handleGlobalBranchChange(b.id); setHeaderBranchDropdownOpen(false) }}
                                        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors text-left ${
                                          isSelected ? 'bg-emerald-50 text-slate-900' : 'text-slate-600 hover:bg-emerald-50 hover:text-slate-900'
                                        }`}
                                      >
                                        <span>{formatBranchName(b.name)}</span>
                                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                          )}
                        </div>
                      ) : (
                        <h1 className="text-[15px] md:text-[17px] font-black tracking-tight leading-none uppercase truncate" style={{ color: textPrimary }} title={branchLabel}>
                          {branchLabel}
                        </h1>
                      )
                    ) : null}
                  </>
                )}
              </div>

              {/* Slot for inline top-header search bar on mobile/desktop */}
              <div id="header-top-search-slot" className="flex items-center min-w-0 flex-1 max-w-[210px] xs:max-w-[240px] sm:max-w-xs ml-1" />
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <MessagesDropdown />
              <NotificationsDropdown />

              {/* Profile */}
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => {
                    const next = !profileOpen
                    if (next) broadcastHeaderMenuOpen('profile')
                    setProfileOpen(next)
                  }}
                  title={user?.name}
                  className="flex items-center gap-1.5 p-1 pr-1.5 rounded-xl transition-all"
                  style={{ backgroundColor: profileOpen ? hoverBg : 'transparent' }}
                  onMouseEnter={e => { if (!profileOpen) (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg }}
                  onMouseLeave={e => { if (!profileOpen) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                >
                  <UserAvatar name={user?.name} imageUrl={user?.picture} size="xs" ring className="shrink-0" />
                  <ChevronDown
                    className={`hidden sm:block w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${profileOpen ? 'rotate-180' : ''}`}
                    style={{ color: textMuted }}
                  />
                </button>

                {profileOpen && (
                  <div
                    className="absolute z-50 w-64 rounded-2xl shadow-2xl overflow-hidden top-[calc(100%+8px)] right-0"
                    style={{ backgroundColor: isLight ? '#ffffff' : '#0d1626', border: `1px solid ${inputBorder}` }}
                  >
                    <div className="px-4 py-3.5 flex items-center gap-3" style={{ borderBottom: `1px solid ${inputBorder}` }}>
                      <UserAvatar name={user?.name} imageUrl={user?.picture} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{formatPersonName(user?.name ?? '') || 'User'}</p>
                        <p className="text-[11px] truncate" style={{ color: textMuted }}>{user?.email}</p>
                      </div>
                    </div>

                    <div className="py-1.5">
                      <Link
                        to="/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                        style={{ color: textPrimary }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                      >
                        <UserCircle className="w-4 h-4 text-green-500" />
                        My Profile
                      </Link>
                      {isPortalStaffUser(user?.role) && (
                        <Link
                          to="/profile?tab=history"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                          style={{ color: textPrimary }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                        >
                          <History className="w-4 h-4 text-green-500" />
                          Ticket History
                        </Link>
                      )}
                      {isWarrantyRegistrar(user?.jobTitle) && (
                        <Link
                          to="/profile?tab=registrations"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                          style={{ color: textPrimary }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                        >
                          <ClipboardCheck className="w-4 h-4 text-green-500" />
                          Registered Tickets
                        </Link>
                      )}
                      {isSystemAdmin(user?.role) && (
                        <Link
                          to="/profile?tab=users"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                          style={{ color: textPrimary }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                        >
                          <Shield className="w-4 h-4 text-green-500" />
                          User Management
                        </Link>
                      )}
                      <Link
                        to="/profile?tab=privacy"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                        style={{ color: textPrimary }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                      >
                        <Settings className="w-4 h-4 text-green-500" />
                        Settings &amp; Privacy
                      </Link>

                      <div className="mx-3 my-1.5" style={{ borderTop: `1px solid ${inputBorder}` }} />

                      <button
                        onClick={toggleTheme}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-left transition-colors"
                        style={{ color: textPrimary }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                      >
                        <span className="flex items-center gap-3">
                          {isLight ? <Moon className="w-4 h-4 text-green-500" /> : <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />}
                          Dark Mode
                        </span>
                        <span
                          className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                          style={{ backgroundColor: isLight ? inputBorder : '#10B981' }}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                            style={{ left: isLight ? '2px' : 'calc(100% - 18px)' }}
                          />
                        </span>
                      </button>

                      <div className="mx-3 my-1.5" style={{ borderTop: `1px solid ${inputBorder}` }} />

                      <button
                        onClick={() => { setProfileOpen(false); logout() }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-left transition-colors hover:text-red-500"
                        style={{ color: textMuted }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div id="header-toolbar-slot" className="w-full min-w-0 max-w-full" />
        </header>

        {/* ── Page Content ───────────────────────────────── */}
        <main
          ref={mainContentRef}
          className={
            currentPage === 'DDRM'
              ? "flex-1 flex flex-col min-h-0 overflow-hidden relative p-2 md:p-3"
              : (currentPage === 'Relays' || currentPage === 'My Tickets' || currentPage === 'Schedules' || currentPage === 'Archives' || currentPage === 'Search')
                ? "flex-1 flex flex-col min-h-0 overflow-hidden relative p-0"
                : (currentPage === 'Request Forms' || currentPage === 'Operations Forms')
                  ? "flex-1 overflow-y-auto px-6 py-6 relative"
                  : "flex-1 overflow-y-auto p-5 md:p-8 relative"
          }
        >
          {/* Subtle ambient gradient */}
          {!isLight && (
            <div className="pointer-events-none fixed top-0 right-0 w-[500px] h-[500px] opacity-[0.06]"
                 style={{
                   background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)',
                   filter: 'blur(80px)',
                   zIndex: 0,
                 }} />
          )}
          <div className={`relative z-10 ${(currentPage === 'Relays' || currentPage === 'My Tickets' || currentPage === 'Schedules' || currentPage === 'Archives' || currentPage === 'Search' || currentPage === 'DDRM') ? 'flex flex-col flex-1 min-h-0 h-full w-full' : ''}`}>
            {/* Do not key Outlet by pathname — that remounts Schedules on every nav and forces a reload spinner. */}
            <Outlet context={{ setSidebarOpen, globalBranchId }} />
          </div>
        </main>
      </div>

      {/* ── Global Agentic Chat UI ────────────────────── */}
      {/* <AIChatBot /> */}

      <FloatingChatWindow />
    </div>
  )
}
