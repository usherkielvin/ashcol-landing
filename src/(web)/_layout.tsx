/**
 * WebLayout — root layout for all web portal pages.
 *
 * Responsibilities:
 *  - Render <WebSidebar> (fixed left, 260px) + <WebHeader> (top bar) + <Slot /> (page content)
 *  - Auth Guard:
 *      • isLoading  → show centered ActivityIndicator
 *      • !isSignedIn && not on login → redirect to /(web)/login
 *      • isSignedIn && on login      → redirect to /(web)/dashboard
 *      • otherwise                   → render layout
 */

import { Slot, usePathname, useRouter } from 'expo-router'
import React, { useEffect } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { WebHeader } from '../../src/components/web/WebHeader'
import { WebSidebar } from '../../src/components/web/WebSidebar'
import { useAuth } from '../../src/contexts/AuthContext'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOGIN_PATH = '/(web)/login'
const LANDING_PATH = '/(web)/landing'
const DASHBOARD_PATH = '/(web)/dashboard'
const CREATE_ACCOUNT_PATH = '/create-account'

const LOGIN_PUBLIC_PATH = '/login'
const LANDING_PUBLIC_PATH = '/landing'
const DASHBOARD_PUBLIC_PATH = '/dashboard'
const CREATE_ACCOUNT_PUBLIC_PATH = '/create-account'
const FORGOT_PASSWORD_PUBLIC_PATH = '/forgot-password'
const SIGNUP_PUBLIC_PATH = '/signup'

const BARE_PUBLIC_PATHS = [LOGIN_PUBLIC_PATH, LANDING_PUBLIC_PATH, CREATE_ACCOUNT_PUBLIC_PATH, FORGOT_PASSWORD_PUBLIC_PATH, SIGNUP_PUBLIC_PATH]

function normalizeWebPathname(pathname: string): string {
  if (pathname.startsWith('/(web)/')) {
    return pathname.replace('/(web)', '')
  }

  if (pathname.startsWith('/web/')) {
    return pathname.replace('/web', '')
  }

  return pathname
}

/**
 * Derives a human-readable page title from the current pathname.
 * e.g. '/(web)/dashboard'   → 'Dashboard'
 *      '/(web)/tickets/123' → 'Ticket Detail'
 *      '/(web)/branches'    → 'Branches'
 */
function pageTitleFromPathname(pathname: string): { title: string; subtitle: string } {
  const normalized = normalizeWebPathname(pathname)
  const stripped = normalized.replace(/^\//, '')
  const segment = stripped.split('/')[0] ?? ''

  const titleMap: Record<string, { title: string; subtitle: string }> = {
    '':         { title: 'Dashboard',  subtitle: 'Overview of your service activity' },
    dashboard:  { title: 'Dashboard',  subtitle: 'Overview of your service activity' },
    tickets:    { title: 'Tickets',    subtitle: 'Manage and track service requests' },
    branches:   { title: 'Branches',   subtitle: 'Service branch locations and details' },
    activity:   { title: 'Activity',   subtitle: 'Recent actions and audit trail' },
    profile:    { title: 'Profile',    subtitle: 'Your account information and settings' },
    login:      { title: 'Login',      subtitle: '' },
    'forgot-password': { title: 'Forgot Password', subtitle: '' },
    landing:    { title: 'Landing',    subtitle: '' },
    'create-account':  { title: 'Create Account',  subtitle: '' },
    'create-ticket':   { title: 'New Ticket',      subtitle: 'Submit a new service request' },
    'employees':       { title: 'Employees',       subtitle: 'Manage your team' },
    signup:            { title: 'Sign Up',          subtitle: '' },
  }

  if (titleMap[segment] !== undefined) {
    return titleMap[segment]
  }

  const fallback = segment.length === 0 ? 'Dashboard' : segment.charAt(0).toUpperCase() + segment.slice(1)
  return { title: fallback, subtitle: '' }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebLayout(): React.ReactElement {
  const { isSignedIn, isLoading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const publicPathname = normalizeWebPathname(pathname)
  const isCompactSidebar = width < 1200
  const sidebarWidth = isCompactSidebar ? COMPACT_SIDEBAR_WIDTH : SIDEBAR_WIDTH
  const contentPadding = width < 768 ? 16 : width < 1200 ? 20 : 32

  useEffect(() => {
    if (isLoading) return

    if (!isSignedIn && !BARE_PUBLIC_PATHS.includes(publicPathname)) {
      router.replace(LANDING_PATH as any)
      return
    }

    if (isSignedIn && BARE_PUBLIC_PATHS.includes(publicPathname)) {
      router.replace(DASHBOARD_PATH as any)
    }
  }, [isSignedIn, isLoading, publicPathname, router])

  // --- Loading state ---
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    )
  }

  // --- Unauthenticated: render nothing while redirect fires ---
  if (!isSignedIn && !BARE_PUBLIC_PATHS.includes(publicPathname)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    )
  }

  // --- Bare pages (login, landing): render without sidebar/header ---
  if (BARE_PUBLIC_PATHS.includes(publicPathname)) {
    return <Slot />
  }

  // --- Authenticated layout ---
  const { title, subtitle } = pageTitleFromPathname(pathname)

  return (
    <View style={styles.root}>
      {/* Fixed left sidebar */}
      <WebSidebar activeRoute={pathname} collapsed={isCompactSidebar} />

      {/* Content area (offset by sidebar width) */}
      <View style={[styles.contentArea, { marginLeft: sidebarWidth }] }>
        {/* Sticky top header */}
        <WebHeader title={title} subtitle={subtitle} compact={width < 960} />

        {/* Page content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { padding: contentPadding }]}
        >
          <Slot />
        </ScrollView>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SIDEBAR_WIDTH = 260
const COMPACT_SIDEBAR_WIDTH = 88

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  contentArea: {
    flex: 1,
    flexDirection: 'column',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
})
