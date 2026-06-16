import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import Landing from './pages/Landing'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import CreateAccount from './pages/CreateAccount'
import DashboardLayout from './layouts/DashboardLayout'
import Dashboard from './pages/Dashboard'
import Tickets from './pages/Tickets'
import CreateTicket from './pages/CreateTicket'
import Employees from './pages/Employees'
import Profile from './pages/Profile'
import Branches from './pages/Branches'

import DailyAuditReport from './pages/DailyAuditReport'
import AuditFinanceExpenses from './pages/AuditFinanceExpenses'
import DailySalesForm from './pages/DailySalesForm'
import ForCollections from './pages/ForCollections'
import DailyServiceReport from './pages/DailyServiceReport'
import LineUp from './pages/LineUp'
import WorkflowPipeline from './pages/WorkflowPipeline'
import HrisAndBills from './pages/HrisAndBills'

import ClientMasterlist from './pages/ClientMasterlist'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { getPortalHomePath } from './utils/api'

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
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/create-account" element={<CreateAccount />} />
        {/* Portal Routes */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardRedirect />} />
          <Route path="/dashboard-home" element={<Dashboard />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/tickets/create" element={<CreateTicket />} />
          <Route path="/create-ticket" element={<CreateTicket />} />
          <Route path="/schedules" element={<ClientMasterlist />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/assigned-tickets" element={<Navigate to="/tickets" replace />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/profile" element={<Profile />} />

          <Route path="/audit-report" element={<DailyAuditReport />} />
          <Route path="/audit-expenses" element={<AuditFinanceExpenses />} />
          <Route path="/daily-report" element={<DailySalesForm />} />
          <Route path="/collections" element={<ForCollections />} />
          <Route path="/lineup" element={<LineUp />} />
          <Route path="/weekly-field-schedule" element={<Navigate to="/lineup?tab=weekly" replace />} />
          <Route path="/service-report" element={<DailyServiceReport />} />
          <Route path="/admin-workflow" element={<WorkflowPipeline />} />
          <Route path="/admin-hris-bills" element={<HrisAndBills />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )

  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          {GOOGLE_OAUTH_ENABLED ? (
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{routes}</GoogleOAuthProvider>
          ) : (
            routes
          )}
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
