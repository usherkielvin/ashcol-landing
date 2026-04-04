import { useState } from 'react'
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import {
  LayoutDashboard, Ticket as TicketIcon, Users, Wrench,
  Settings as ConfigIcon, Bell, Menu, Sun, Moon, LogOut, X,
  ChevronRight, Building2
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import logoImg from '../assets/ash-logo.jpg'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const isLight = theme === 'light'

  const allLinks = [
    { name: 'Overview',      path: '/dashboard', icon: LayoutDashboard },
    { name: 'Tickets',       path: '/tickets',   icon: TicketIcon },
    { name: 'Branches',      path: '/branches',  icon: Building2,  roles: ['admin', 'manager'] },
    { name: 'Customers',     path: '/customers', icon: Users,      roles: ['admin', 'manager', 'staff', 'employee'] },
    { name: 'Staff & Roles', path: '/staff',     icon: Wrench,     roles: ['admin', 'manager'] },
    { name: 'Settings',      path: '/settings',  icon: ConfigIcon, roles: ['admin', 'manager'] },
  ]

  const navLinks = allLinks.filter(link => {
    if (!link.roles) return true
    return link.roles.includes((user?.role || 'customer').toLowerCase())
  })

  // ── Color tokens (direct JS objects — no CSS vars) ──────────────
  const bg          = isLight ? '#f1f5f9'              : '#060B18'
  const sidebarBg   = isLight ? '#ffffff'              : '#0A1120'
  const headerBg    = isLight ? 'rgba(255,255,255,0.9)': 'rgba(6,11,24,0.9)'
  const border      = isLight ? '#e2e8f0'              : '#1a2844'
  const textPrimary = isLight ? '#0f172a'              : '#EEF4FF'
  const textMuted   = isLight ? '#64748b'              : '#6B90BE'
  const hoverBg     = isLight ? '#f1f5f9'              : '#0f1e36'
  const inputBg     = isLight ? '#f8fafc'              : '#0d1b30'
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
          fixed md:static inset-y-0 left-0 z-50 flex flex-col
          w-[260px] md:w-[240px] lg:w-[260px]
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ backgroundColor: sidebarBg, borderRight: `1px solid ${border}` }}
      >
        {/* Brand */}
        <div
          className="flex items-center justify-between h-16 px-5 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={logoImg}
                alt="Ashcol"
                className="w-9 h-9 object-contain rounded-lg"
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#10B981] rounded-full border-2"
                   style={{ borderColor: sidebarBg }} />
            </div>
            <div>
              <div className="text-[15px] font-black tracking-wide" style={{ color: textPrimary }}>Ashcol</div>
              <div className="text-[9px] font-bold tracking-[3px] text-[#10B981] uppercase">Portal</div>
            </div>
          </div>
          {/* Mobile close */}
          <button
            className="md:hidden p-1.5 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400"
            style={{ color: textMuted }}
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Nav Links ──────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-0.5">
          <div className="text-[10px] font-bold uppercase tracking-[2px] px-3 mb-2" style={{ color: textMuted }}>
            Navigation
          </div>
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path
            return (
              <Link
                key={link.name}
                to={link.path}
                onClick={() => setSidebarOpen(false)}
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
                <span className="flex-1">{link.name}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
              </Link>
            )
          })}
        </nav>

        {/* ── User Profile ───────────────────────────────── */}
        <div className="shrink-0 p-3" style={{ borderTop: `1px solid ${border}` }}>
          <Link
            to="/profile"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 p-3 rounded-xl transition-all group"
            style={{ backgroundColor: inputBg, border: `1px solid ${location.pathname === '/profile' ? '#10B981' : inputBorder}` }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#10B981'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = location.pathname === '/profile' ? '#10B981' : inputBorder}
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-[#10B981]/40 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-lg">
                {user?.initials ?? '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{user?.name ?? 'Guest'}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider truncate text-[#10B981]">{user?.role ?? 'Unknown'}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: textMuted }} />
          </Link>
        </div>
      </aside>

      {/* ── Main Content Area ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top Header ─────────────────────────────────── */}
        <header
          className="shrink-0 h-16 flex items-center justify-between px-5 md:px-8 z-30 sticky top-0"
          style={{
            backgroundColor: headerBg,
            borderBottom: `1px solid ${border}`,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          {/* Left: Hamburger + Page Title */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-xl transition-all"
              style={{ color: textMuted, backgroundColor: hoverBg }}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-[15px] font-black tracking-tight" style={{ color: textPrimary }}>
                {currentPage}
              </h1>
              <p className="text-[11px] hidden sm:block" style={{ color: textMuted }}>
                Ashcol Service Portal
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
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
            <button
              className="relative p-2.5 rounded-xl transition-all hover:scale-105"
              style={{
                color: textMuted,
                backgroundColor: hoverBg,
                border: `1px solid ${inputBorder}`,
              }}
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2"
                    style={{ borderColor: headerBg }} />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              title="Logout"
              className="p-2.5 rounded-xl transition-all hover:scale-105 hover:text-red-400"
              style={{
                color: textMuted,
                backgroundColor: hoverBg,
                border: `1px solid ${inputBorder}`,
              }}
            >
              <LogOut className="w-4 h-4" />
            </button>

          </div>
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
    </div>
  )
}
