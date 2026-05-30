import { useState, useRef, useEffect } from 'react'
import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import {
  LayoutDashboard, Ticket as TicketIcon, Users, Wrench,
  Bell, Menu, Sun, Moon, LogOut, X,
  ChevronRight, Building2, UserCircle, ChevronDown, CheckCheck,
  PanelLeftOpen, Package, BarChart2, ClipboardList, FileSpreadsheet,
  HardHat, Receipt, CalendarCheck, Scan
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE_URL, formatRole } from '../utils/api'
import { useNotifications } from '../contexts/NotificationContext'
// import AIChatBot from '../components/AIChatBot'
import logoImg from '../assets/ash-logo.jpg'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [profileOpen, setProfileOpen]           = useState(false)
  const [notifOpen, setNotifOpen]               = useState(false)
  const [navPicBroken, setNavPicBroken]         = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const isLight = theme === 'light'
  const [branchLabel, setBranchLabel] = useState<string | null>(null)

  // Reset broken flag whenever the picture URL changes (e.g. after a new upload)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavPicBroken(false)
  }, [user?.picture])

  useEffect(() => {
    const r = (user?.role || '').toLowerCase()
    if (r !== 'manager' || !user?.branchId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBranchLabel(null)
      return
    }
    const load = async () => {
      try {
        const token = localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
        const res = await fetch(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const list = data?.data || []
        const b = list.find((x: { id: string }) => x.id === user.branchId)
        setBranchLabel(b?.name || null)
      } catch {
        setBranchLabel(null)
      }
    }
    load()
  }, [user?.role, user?.branchId])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allLinks = [
    { name: 'Overview',   path: '/dashboard-home', icon: LayoutDashboard },
    { name: 'Tickets',    path: '/tickets',   icon: TicketIcon },
    { name: 'Schedules',   path: '/schedules', icon: ClipboardList, roles: ['admin', 'manager', 'staff'] },
    { name: 'Branches',   path: '/branches',  icon: Building2,  roles: ['admin'] },
    { name: 'Employees',  path: '/employees', icon: Wrench,     roles: ['admin', 'manager'] },
    { name: 'Customers',  path: '/customers', icon: Users,      roles: ['admin', 'manager', 'staff'] },
    { name: 'Inventory',     path: '/inventory',    icon: Package,           roles: ['admin', 'manager'] },
    { name: 'Analytics',     path: '/analytics',    icon: BarChart2,         roles: ['admin', 'manager'] },
    { name: 'Audit Report',   path: '/audit-report',   icon: ClipboardList,     roles: ['admin', 'manager', 'staff'] },
    { name: 'DTR Scanner',    path: '/dtr-scanner',    icon: Scan,              roles: ['admin', 'manager', 'staff'] },
    { name: 'Audit Expenses', path: '/audit-expenses', icon: Receipt,           roles: ['admin', 'manager'] },
    { name: 'Line-Up',        path: '/lineup',          icon: CalendarCheck,     roles: ['admin', 'manager', 'staff'] },
    { name: 'Service Report', path: '/service-report', icon: HardHat,           roles: ['admin', 'manager', 'staff', 'employee'] },
    { name: 'Daily Report',   path: '/daily-report',   icon: FileSpreadsheet,   roles: ['admin', 'manager', 'staff'] },
  ]

  const role = (user?.role || '').toLowerCase()
  const isAuthorizedRole = role === 'admin' || role === 'manager' || role === 'staff'

  const isSalesUser = (role === 'manager' || role === 'staff') && (
    (user?.name || '').toUpperCase().includes('SALES') ||
    (user?.branchId || '').endsWith('-sales') ||
    (user?.email || '').toLowerCase().includes('sales')
  )

  const navLinks = isSalesUser
    ? allLinks.filter(link => ['Schedules', 'Audit Report', 'Line-Up', 'Service Report', 'Daily Report'].includes(link.name))
    : isAuthorizedRole
      ? allLinks.filter(link => {
          if (!link.roles) return true // visible to everyone (Overview, Tickets)
          return link.roles.includes(role)
        })
      : allLinks.filter(link => link.name === 'Schedules' || link.name === 'Line-Up' || link.name === 'Service Report')

  // Redirect if current path is not allowed for the user
  useEffect(() => {
    if (!user) return
    const currentPath = location.pathname
    const alwaysAllowed = ['/profile']
    if (alwaysAllowed.includes(currentPath)) return

    const isAllowed = navLinks.some(link => currentPath === link.path || currentPath.startsWith(link.path + '/'))
    if (!isAllowed && navLinks.length > 0) {
      navigate(navLinks[0].path, { replace: true })
    }
  }, [location.pathname, navLinks, user, navigate])

  // ── Color tokens (direct JS objects — no CSS vars) ──────────────
  const bg          = isLight ? '#f1f5f9'              : '#060B18'
  const sidebarBg   = isLight ? '#ffffff'              : '#0A1120'
  const headerBg    = isLight ? 'rgba(255,255,255,0.9)': 'rgba(6,11,24,0.9)'
  const border      = isLight ? '#e2e8f0'              : '#1a2844'
  const textPrimary = isLight ? '#0f172a'              : '#EEF4FF'
  const textMuted   = isLight ? '#64748b'              : '#6B90BE'
  const hoverBg     = isLight ? '#f1f5f9'              : '#0f1e36'
  const inputBorder = isLight ? '#cbd5e1'              : '#1e3254'

  const currentPage = navLinks.find(l => location.pathname === l.path)?.name ?? 'Dashboard'

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div
      className="flex h-screen overflow-hidden font-['Inter',sans-serif]"
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
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${sidebarCollapsed ? 'md:w-[64px]' : 'w-[260px] md:w-[240px] lg:w-[260px]'}
        `}
        style={{ backgroundColor: sidebarBg, borderRight: `1px solid ${border}` }}
      >
        {/* Brand */}
        <div
          className="flex items-center h-14 shrink-0 px-4"
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
            <div className="text-[15px] font-black tracking-wide" style={{ color: textPrimary }}>ASHCOL</div>
            <div className="text-[9px] font-bold tracking-[3px] text-[#10B981] uppercase">Portal</div>
          </div>

          {/* Mobile close */}
          <button
            className="md:hidden p-1.5 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400 shrink-0"
            style={{ color: textMuted }}
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Nav Links ──────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 flex flex-col gap-0.5">
          {!sidebarCollapsed && (
            <div className="text-[10px] font-bold uppercase tracking-[2px] px-3 mb-2" style={{ color: textMuted }}>
              Navigation
            </div>
          )}
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path
            return (
              <Link
                key={link.name}
                to={link.path}
                onClick={() => setSidebarOpen(false)}
                title={sidebarCollapsed ? link.name : undefined}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-150 relative overflow-hidden"
                style={isActive ? {
                  color: '#10B981',
                  backgroundColor: 'rgba(16,185,129,0.12)',
                } : {
                  color: textMuted,
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = textPrimary
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = textMuted
                }}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#10B981] rounded-r-full" />
                )}
                <link.icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 truncate">{link.name}</span>}
                {!sidebarCollapsed && isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />}
              </Link>
            )
          })}

          {/* Expand button at bottom of nav when collapsed */}
          {sidebarCollapsed && (
            <button
              className="hidden md:flex items-center justify-center mt-auto p-2.5 rounded-xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              style={{ color: textMuted }}
              title="Expand sidebar"
              onClick={() => setSidebarCollapsed(false)}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </nav>

        {/* ── User Profile Bottom Section ────────────────── */}
        <div 
          ref={profileRef} 
          className="mt-auto relative select-none"
          style={{ borderTop: `1px solid ${border}` }}
        >
          {/* Dropdown Popup Menu (renders above/beside the profile strip) */}
          {profileOpen && (
            <div
              className={`absolute z-50 w-52 rounded-xl shadow-2xl overflow-hidden`}
              style={{ 
                backgroundColor: sidebarBg, 
                border: `1px solid ${border}`,
                bottom: 'calc(100% + 8px)',
                left: sidebarCollapsed ? '12px' : '16px',
              }}
            >
              {/* User info header */}
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${border}` }}>
                <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{user?.name}</p>
                <p className="text-[11px] truncate" style={{ color: textMuted }}>{user?.email}</p>
              </div>

              <div className="py-1.5">
                <Link
                  to="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: textPrimary }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = hoverBg)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <UserCircle className="w-4 h-4" style={{ color: '#10B981' }} />
                  My Account
                </Link>

                <div className="mx-3 my-1" style={{ borderTop: `1px solid ${border}` }} />

                <button
                  onClick={() => { setProfileOpen(false); logout() }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left"
                  style={{ color: textMuted }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = hoverBg; e.currentTarget.style.color = '#EF4444' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = textMuted }}
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}

          {/* Profile Strip Button */}
          <button
            onClick={() => setProfileOpen(p => !p)}
            className={`w-full flex items-center gap-3 text-left transition-all hover:bg-slate-100/50 dark:hover:bg-slate-800/40 ${
              sidebarCollapsed ? 'p-3 justify-center' : 'px-4 py-3.5'
            }`}
          >
            {/* Avatar */}
            {user?.picture && !navPicBroken ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-8 h-8 rounded-lg object-cover ring-2 ring-[#10B981]/30 shrink-0"
                referrerPolicy="no-referrer"
                onError={() => setNavPicBroken(true)}
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center text-white font-bold text-xs shrink-0">
                {user?.initials ?? '?'}
              </div>
            )}

            {/* Info details (hidden when collapsed) */}
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate leading-snug" style={{ color: textPrimary }}>
                  {user?.name ?? 'Admin User'}
                </p>
                <p className="text-[10px] truncate leading-none mt-0.5" style={{ color: textMuted }}>
                  {formatRole(user?.role) || 'Administrator'}
                </p>
              </div>
            )}

            {/* Caret arrow */}
            {!sidebarCollapsed && (
              <ChevronDown 
                className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${profileOpen ? 'rotate-180' : ''}`} 
                style={{ color: textMuted }} 
              />
            )}
          </button>
        </div>

      </aside>

      {/* ── Main Content Area ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top Header ─────────────────────────────────── */}
        <header
          className="shrink-0 flex flex-col z-30 sticky top-0"
          style={{
            backgroundColor: headerBg,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
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
              {((user?.role || '').toLowerCase() === 'manager' && branchLabel) || (user?.role || '').toLowerCase() === 'employee' ? (
                <p className="text-[11px] hidden sm:block truncate max-w-[200px] md:max-w-md" style={{ color: textMuted }} title={branchLabel || undefined}>
                  {(user?.role || '').toLowerCase() === 'manager'
                    ? `Branch · ${branchLabel}`
                    : 'Technician View'}
                </p>
              ) : null}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              title={isLight ? 'Switch to Dark' : 'Switch to Light'}
              className="p-2.5 rounded-xl transition-all hover:scale-105"
              style={{
                color: textMuted,
                backgroundColor: hoverBg,
                border: `1px solid ${inputBorder}`,
              }}
            >
              {isLight
                ? <Moon className="w-4 h-4" />
                : <Sun className="w-4 h-4" style={{ color: '#F59E0B' }} />
              }
            </button>

            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifOpen(p => !p)}
                className="relative p-2.5 rounded-xl transition-all hover:scale-105"
                style={{ color: textMuted, backgroundColor: hoverBg, border: `1px solid ${inputBorder}` }}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full border-2 flex items-center justify-center text-white font-bold"
                    style={{ borderColor: headerBg, fontSize: '9px' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+8px)] w-80 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col"
                  style={{ backgroundColor: isLight ? '#ffffff' : '#0A1120', border: `1px solid ${inputBorder}`, maxHeight: '420px' }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${inputBorder}` }}>
                    <span className="text-sm font-bold" style={{ color: textPrimary }}>Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllRead()}
                        className="flex items-center gap-1 text-xs font-semibold text-[#10B981] hover:underline"
                      >
                        <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="overflow-y-auto flex-1">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <Bell className="w-8 h-8 opacity-20" style={{ color: textMuted }} />
                        <p className="text-xs" style={{ color: textMuted }}>No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <button
                          key={n.id}
                          className="w-full text-left px-4 py-3 flex gap-3 transition-colors hover:bg-[#10B981]/5"
                          style={{ borderBottom: `1px solid ${inputBorder}`, opacity: n.isRead ? 0.6 : 1 }}
                          onClick={async () => {
                            if (!n.isRead) await markRead(n.id)
                            if (n.ticketId) {
                              setNotifOpen(false)
                              navigate(`/tickets?id=${n.ticketId}`)
                            }
                          }}
                        >
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.isRead ? 'bg-transparent' : 'bg-[#10B981]'}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: textPrimary }}>{n.title}</p>
                            <p className="text-xs leading-relaxed mt-0.5" style={{ color: textMuted }}>{n.message}</p>
                            <p className="text-[10px] mt-1" style={{ color: textMuted }}>
                              {n.createdAt ? new Date(n.createdAt).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', year: 'numeric',
                                hour: 'numeric', minute: '2-digit', hour12: true
                              }) : ''}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>



          </div>
          </div>

          {/* ── Page-injected toolbar slot ────────────────── */}
          <div id="header-toolbar-slot" />
        </header>

        {/* ── Page Content ───────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-5 md:p-8 relative">
          {/* Subtle ambient gradient */}
          {!isLight && (
            <div className="pointer-events-none fixed top-0 right-0 w-[500px] h-[500px] opacity-[0.06]"
                 style={{
                   background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)',
                   filter: 'blur(80px)',
                   zIndex: 0,
                 }} />
          )}
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Global Agentic Chat UI ────────────────────── */}
      {/* <AIChatBot /> */}
    </div>
  )
}
