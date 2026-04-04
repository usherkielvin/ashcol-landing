import { BrowserRouter, Route, Routes } from 'react-router-dom'
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
import { AuthProvider } from './contexts/AuthContext'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
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
      </AuthProvider>
    </ThemeProvider>
  )
}
