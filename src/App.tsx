import { Suspense } from 'react'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import AshcolLoader from './components/AshcolLoader'
import { lazyWithPreload } from './utils/preloadHelper'

// Lazy-loaded public pages
const Landing = lazyWithPreload(() => import('./pages/Landing'))
const PublicBooking = lazyWithPreload(() => import('./pages/PublicBooking'))
const Login = lazyWithPreload(() => import('./pages/Login'))
const ForgotPassword = lazyWithPreload(() => import('./pages/ForgotPassword'))
const CreateAccount = lazyWithPreload(() => import('./pages/CreateAccount'))

// Lazy-loaded layout & portal pages
const DashboardLayout = lazyWithPreload(() => import('./layouts/DashboardLayout'))
const MyTickets = lazyWithPreload(() => import('./pages/MyTickets'))
const Schedules = lazyWithPreload(() => import('./pages/Schedules'))
const SearchTickets = lazyWithPreload(() => import('./pages/SearchTickets'))
const CreateTicket = lazyWithPreload(() => import('./pages/CreateTicket'))
const OfficeTasks = lazyWithPreload(() => import('./pages/OfficeTasks'))
const Employees = lazyWithPreload(() => import('./pages/Employees'))
const Vehicles = lazyWithPreload(() => import('./pages/Vehicles'))
const Profile = lazyWithPreload(() => import('./pages/Profile'))
const Branches = lazyWithPreload(() => import('./pages/Branches'))
const Relays = lazyWithPreload(() => import('./pages/Relays'))
const Bookings = lazyWithPreload(() => import('./pages/Bookings'))
const Messages = lazyWithPreload(() => import('./pages/Messages'))

const DailyAuditReport = lazyWithPreload(() => import('./pages/DailyAuditReport'))
const AuditFinanceExpenses = lazyWithPreload(() => import('./pages/AuditFinanceExpenses'))
const ForCollections = lazyWithPreload(() => import('./pages/ForCollections'))
const Commissions = lazyWithPreload(() => import('./pages/Commissions'))
const CashAdvances = lazyWithPreload(() => import('./pages/CashAdvances'))
const Payroll = lazyWithPreload(() => import('./pages/Payroll'))
const DailyServiceReport = lazyWithPreload(() => import('./pages/DailyServiceReport'))
const Registration = lazyWithPreload(() => import('./pages/Registration'))
const HappyCalls = lazyWithPreload(() => import('./pages/HappyCalls'))
const LineUp = lazyWithPreload(() => import('./pages/LineUp'))

const Hris = lazyWithPreload(() => import('./pages/Hris'))
const Ddrm = lazyWithPreload(() => import('./pages/Ddrm'))
const Bills = lazyWithPreload(() => import('./pages/Bills'))
const Telecom = lazyWithPreload(() => import('./pages/Telecom'))
const OperationsForms = lazyWithPreload(() => import('./pages/OperationsForms'))
const RequestFormsArchive = lazyWithPreload(() => import('./pages/RequestFormsArchive'))

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
            <Route path="/payouts" element={<Payroll />} />
            <Route path="/payouts/:branchSlug" element={<Payroll />} />
            <Route path="/payouts/:branchSlug/:installerSlug" element={<Payroll />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/payroll/:branchSlug" element={<Payroll />} />
            <Route path="/payroll/:branchSlug/:installerSlug" element={<Payroll />} />
            <Route path="/lineup" element={<LineUp />} />
            <Route path="/weekly-field-schedule" element={<Navigate to="/lineup?tab=weekly" replace />} />
            <Route path="/service-report" element={<DailyServiceReport />} />
            <Route path="/registration" element={<Registration />} />
            <Route path="/happy-calls" element={<HappyCalls />} />

            <Route path="/admin-hris" element={<Hris />} />
            <Route path="/ddrm" element={<Ddrm />} />
            <Route path="/operations-forms" element={<OperationsForms />} />
            <Route path="/request-forms-archive" element={<RequestFormsArchive />} />
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
