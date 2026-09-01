import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import Landing from './pages/Landing'
import PublicBooking from './pages/PublicBooking'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import CreateAccount from './pages/CreateAccount'
import DashboardLayout from './layouts/DashboardLayout'
import MyTickets from './pages/MyTickets'
import Schedules from './pages/Schedules'
import SearchTickets from './pages/SearchTickets'
import CreateTicket from './pages/CreateTicket'
import OfficeTasks from './pages/OfficeTasks'
import Employees from './pages/Employees'
import Vehicles from './pages/Vehicles'
import Profile from './pages/Profile'
import Branches from './pages/Branches'
import Relays from './pages/Relays'
import Bookings from './pages/Bookings'
import Messages from './pages/Messages'

import DailyAuditReport from './pages/DailyAuditReport'
import AuditFinanceExpenses from './pages/AuditFinanceExpenses'
import ForCollections from './pages/ForCollections'
import Commissions from './pages/Commissions'
import CashAdvances from './pages/CashAdvances'
import Payroll from './pages/Payroll'
import DailyServiceReport from './pages/DailyServiceReport'
import Registration from './pages/Registration'
import HappyCalls from './pages/HappyCalls'
import LineUp from './pages/LineUp'

import Hris from './pages/Hris'
import Ddrm from './pages/Ddrm'
import Bills from './pages/Bills'
import Telecom from './pages/Telecom'
import OperationsForms from './pages/OperationsForms'

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

// Helper component to handle the root path ("/") based on the domain
function RootRouter() {
  const { user } = useAuth()
  
  // Check if we're on the portal subdomain (e.g. portal.ashcol.com.ph or portal.localhost)
  // Also allow forcing portal mode via local environment variable or URL parameter
  const isPortalSubdomain = 
    window.location.hostname.startsWith('portal.') || 
    import.meta.env.VITE_IS_PORTAL === 'true' ||
    new URLSearchParams(window.location.search).get('portal') === 'true'
  
  if (isPortalSubdomain) {
    if (user) {
      return <Navigate to={getPortalHomePath(user)} replace />
    }
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
      <Routes>
        <Route path="/" element={<RootRouter />} />
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
