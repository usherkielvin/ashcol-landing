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
import Customers from './pages/Customers'
import Staff from './pages/Staff'
import Profile from './pages/Profile'
import Branches from './pages/Branches'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

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
    // If on portal subdomain, go to dashboard if logged in, otherwise login
    return user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
  }
  
  // Otherwise, show the public landing page
  return <Landing />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRouter />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/create-account" element={<CreateAccount />} />
            {/* Portal Routes */}
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/create" element={<CreateTicket />} />
              <Route path="/create-ticket" element={<CreateTicket />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/branches" element={<Branches />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </GoogleOAuthProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
