/**
 * Web Portal Dashboard Page
 *
 * Greeting banner + stat card grid + recent tickets table.
 * WebHeader and WebSidebar are provided by the layout.
 */

import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useWebDashboard } from '../../hooks/useWebDashboard'
import { WebStatCard } from '../../src/components/web/WebStatCard'
import { WebTicketTable } from '../../src/components/web/WebTicketTable'
import { useAuth } from '../../src/contexts/AuthContext'
import type { Ticket } from '../../src/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getFirstName(name: string): string {
  return name.trim().split(' ')[0] ?? name
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebDashboardPage(): React.ReactElement {
  const { user } = useAuth()
  const router = useRouter()
  const { stats, tickets, loading, error, refresh } = useWebDashboard()

  const isPrivileged = user?.role === 'manager' || user?.role === 'admin'

  const handleRowPress = (ticket: Ticket) => {
    router.push(`/(web)/tickets/${ticket.id}` as any)
  }

  // --- Error state ---
  if (error && !loading) {
    return (
      <View style={styles.errorWrap}>
        <View style={styles.errorCard}>
          <Feather name="alert-circle" size={20} color="#991B1B" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={refresh}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // --- Loading state ---
  if (loading && !stats) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    )
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <View style={styles.page}>

      {/* ── Greeting banner ── */}
      <View style={styles.greetingBanner}>
        <View>
          <Text style={styles.greetingTitle}>
            {getGreeting()}, {user ? getFirstName(user.name) : ''}! 👋
          </Text>
          <Text style={styles.greetingDate}>{today}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(web)/create-ticket' as any)}
          style={({ pressed }) => [styles.newTicketBtn, pressed && styles.newTicketBtnPressed]}
          accessibilityRole="button"
        >
          <Feather name="plus" size={15} color="#fff" />
          <Text style={styles.newTicketBtnText}>New Ticket</Text>
        </Pressable>
      </View>

      {/* ── Stat cards ── */}
      <View style={styles.statsGrid}>
        <WebStatCard
          label="Total Tickets"
          value={stats?.total ?? 0}
          accent="#6366F1"
          featherIcon="inbox"
        />
        <WebStatCard
          label="Pending"
          value={stats?.pending ?? 0}
          accent="#F59E0B"
          featherIcon="clock"
        />
        <WebStatCard
          label="In Progress"
          value={stats?.in_progress ?? 0}
          accent="#3B82F6"
          featherIcon="tool"
        />
        <WebStatCard
          label="Completed"
          value={stats?.completed ?? 0}
          accent="#10B981"
          featherIcon="check-circle"
        />
        {isPrivileged && stats?.total_employees !== undefined && (
          <WebStatCard
            label="Employees"
            value={stats.total_employees}
            accent="#8B5CF6"
            featherIcon="users"
          />
        )}
        {isPrivileged && stats?.total_branches !== undefined && (
          <WebStatCard
            label="Branches"
            value={stats.total_branches}
            accent="#EC4899"
            featherIcon="map-pin"
          />
        )}
      </View>

      {/* ── Recent tickets ── */}
      <View style={styles.tableSection}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent Tickets</Text>
            <Text style={styles.sectionSub}>Latest service requests across all branches</Text>
          </View>
          <Pressable
            onPress={() => router.push('/(web)/tickets' as any)}
            style={({ pressed }) => [styles.viewAllBtn, pressed && styles.viewAllBtnPressed]}
            accessibilityRole="link"
          >
            <Text style={styles.viewAllText}>View all</Text>
            <Feather name="arrow-right" size={13} color="#10B981" />
          </Pressable>
        </View>
        <WebTicketTable
          tickets={tickets}
          loading={loading}
          onRowPress={handleRowPress}
          onStatusFilter={() => {}}
          onSearch={() => {}}
          currentFilter={null}
          searchQuery=""
          totalPages={1}
          currentPage={0}
          onPageChange={() => {}}
        />
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    flex: 1,
    gap: 24,
  },

  greetingBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)' as any,
    gap: 16,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  greetingDate: {
    fontSize: 13,
    color: '#94A3B8',
  },
  newTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    boxShadow: '0 3px 8px rgba(16,185,129,0.25)' as any,
  },
  newTicketBtnPressed: {
    opacity: 0.85,
  },
  newTicketBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },

  tableSection: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 22,
  },
  sectionSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  viewAllBtnPressed: {
    opacity: 0.75,
  },
  viewAllText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  errorWrap: {
    flex: 1,
    paddingVertical: 24,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#991B1B',
    fontWeight: '500',
  },
  retryBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryBtnPressed: {
    opacity: 0.8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
})
