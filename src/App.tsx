import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import AshcolLoader from './components/AshcolLoader'

// Helper to guarantee a minimum 2-second loading animation so the preloader doesn't flash
const lazyWithMinDelay = <T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  minDelayMs = 2000
) =>
  lazy(() =>
    Promise.all([
      factory(),
      new Promise((resolve) => setTimeout(resolve, minDelayMs)),
    ]).then(([module]) => module)
  )

// Lazy-loaded public pages
const Landing = lazyWithMinDelay(() => import('./pages/Landing'))
const PublicBooking = lazyWithMinDelay(() => import('./pages/PublicBooking'))
const Login = lazyWithMinDelay(() => import('./pages/Login'))
const ForgotPassword = lazyWithMinDelay(() => import('./pages/ForgotPassword'))
const CreateAccount = lazyWithMinDelay(() => import('./pages/CreateAccount'))

// Lazy-loaded layout & portal pages
const DashboardLayout = lazyWithMinDelay(() => import('./layouts/DashboardLayout'))
const MyTickets = lazyWithMinDelay(() => import('./pages/MyTickets'))
const Schedules = lazyWithMinDelay(() => import('./pages/Schedules'))
const SearchTickets = lazyWithMinDelay(() => import('./pages/SearchTickets'))
const CreateTicket = lazyWithMinDelay(() => import('./pages/CreateTicket'))
const OfficeTasks = lazyWithMinDelay(() => import('./pages/OfficeTasks'))
const Employees = lazyWithMinDelay(() => import('./pages/Employees'))
const Vehicles = lazyWithMinDelay(() => import('./pages/Vehicles'))
const Profile = lazyWithMinDelay(() => import('./pages/Profile'))
const Branches = lazyWithMinDelay(() => import('./pages/Branches'))
const Relays = lazyWithMinDelay(() => import('./pages/Relays'))
const Bookings = lazyWithMinDelay(() => import('./pages/Bookings'))
const Messages = lazyWithMinDelay(() => import('./pages/Messages'))

const DailyAuditReport = lazyWithMinDelay(() => import('./pages/DailyAuditReport'))
const AuditFinanceExpenses = lazyWithMinDelay(() => import('./pages/AuditFinanceExpenses'))
const ForCollections = lazyWithMinDelay(() => import('./pages/ForCollections'))
const Commissions = lazyWithMinDelay(() => import('./pages/Commissions'))
const CashAdvances = lazyWithMinDelay(() => import('./pages/CashAdvances'))
const Payroll = lazyWithMinDelay(() => import('./pages/Payroll'))
const DailyServiceReport = lazyWithMinDelay(() => import('./pages/DailyServiceReport'))
const Registration = lazyWithMinDelay(() => import('./pages/Registration'))
const HappyCalls = lazyWithMinDelay(() => import('./pages/HappyCalls'))
const LineUp = lazyWithMinDelay(() => import('./pages/LineUp'))

const Hris = lazyWithMinDelay(() => import('./pages/Hris'))
const Ddrm = lazyWithMinDelay(() => import('./pages/Ddrm'))
const Bills = lazyWithMinDelay(() => import('./pages/Bills'))
const Telecom = lazyWithMinDelay(() => import('./pages/Telecom'))
const OperationsForms = lazyWithMinDelay(() => import('./pages/OperationsForms'))

import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { MessagingProvider } from './contexts/MessagingContext'
import { FloatingChatProvider } from './contexts/FloatingChatContext'
import { EmployeeDetailsProvider } from './contexts/EmployeeDetailsContext'
import { ArcticProvider } from './contexts/ArcticContext'
import { getPortalHomePath } from './utils/api'
import AutoUpdateWatcher from './components/AutoUpdateWatcher'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GOOGLE_OAUTH_ENABLED = !!GOOGLE_CLIENT_ID

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] w-full">
      <AshcolLoader />
    </div>
  )
}

// Helper component to handle the root path ("/") based on domain & user auth
function RootRouter() {
  const { user } = useAuth()

  // If user is already authenticated, take them directly to their portal home
  if (user) {
    return <Navigate to={getPortalHomePath(user)} replace />
  }

  // Allow forcing landing page via URL param
  if (new URLSearchParams(window.location.search).get('landing') === 'true') {
    return <Landing />
  }
  
  // Check if we're on the portal subdomain (e.g. portal.ashcol.com.ph or portal.localhost)
  // or on a Vercel preview/production domain (e.g. *.vercel.app)
  // or forcing portal mode via local environment variable or URL parameter
  const isPortalSubdomain = 
    window.location.hostname.startsWith('portal.') || 
    window.location.hostname.includes('vercel.app') ||
    import.meta.env.VITE_IS_PORTAL === 'true' ||
    new URLSearchParams(window.location.search).get('portal') === 'true'
  
  if (isPortalSubdomain) {
    return <Navigate to="/login" replace />
  }
  
  // Otherwise, show the public landing page
  return <Landing />
}

function DashboardRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={getPortalHomePath(user)} replace />
}

export default function App() {
  // If Google OAuth isn't configured, don't initialize the provider — this
  // prevents runtime errors when `client_id` is missing from the environment.
  if (!GOOGLE_OAUTH_ENABLED) {
    console.warn('VITE_GOOGLE_CLIENT_ID is not set; Google OAuth is disabled.')
  }

  const routes = (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<RootRouter />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/booking" element={<PublicBooking />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/create-account" element={<CreateAccount />} />
          {/* Portal Routes */}
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardRedirect />} />
            <Route path="/search" element={<SearchTickets />} />
            <Route path="/tickets" element={<Navigate to="/search" replace />} />
            <Route path="/tickets/create" element={<CreateTicket />} />
            <Route path="/create-ticket" element={<CreateTicket />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/relays" element={<Relays />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/my-tickets" element={<MyTickets />} />
            <Route path="/office-tasks" element={<OfficeTasks />} />
            <Route path="/branches" element={<Branches />} />
            <Route path="/assigned-tickets" element={<Navigate to="/search" replace />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/employees/:id" element={<Employees />} />
            <Route path="/vehicles" element={<Vehicles />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/new/:recipientId" element={<Messages />} />
            <Route path="/messages/:conversationId" element={<Messages />} />

            <Route path="/audit-report" element={<DailyAuditReport />} />
            <Route path="/audit-expenses" element={<AuditFinanceExpenses />} />
            {/* Redirect legacy /daily-report to the combined tab page */}
            <Route path="/daily-report" element={<Navigate to="/audit-report?tab=submit" replace />} />
            <Route path="/collections" element={<ForCollections />} />
            <Route path="/commissions" element={<Commissions />} />
            <Route path="/cash-advances" element={<CashAdvances />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/lineup" element={<LineUp />} />
            <Route path="/weekly-field-schedule" element={<Navigate to="/lineup?tab=weekly" replace />} />
            <Route path="/service-report" element={<DailyServiceReport />} />
            <Route path="/registration" element={<Registration />} />
            <Route path="/happy-calls" element={<HappyCalls />} />

            <Route path="/admin-hris" element={<Hris />} />
            <Route path="/ddrm" element={<Ddrm />} />
            <Route path="/operations-forms" element={<OperationsForms />} />
            <Route path="/admin-bills" element={<Bills />} />
            <Route path="/admin-telecom" element={<Telecom />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )

  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <MessagingProvider>
            <FloatingChatProvider>
              <EmployeeDetailsProvider>
                <ArcticProvider>
                  <AutoUpdateWatcher />
                  {GOOGLE_OAUTH_ENABLED ? (
                    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{routes}</GoogleOAuthProvider>
                  ) : (
                    routes
                  )}
                </ArcticProvider>
              </EmployeeDetailsProvider>
            </FloatingChatProvider>
          </MessagingProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
