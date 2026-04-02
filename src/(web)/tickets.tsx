/**
 * Web Portal Tickets Page
 *
 * Renders WebTicketTable using useWebTickets; navigates to /(web)/tickets/[id]
 * on row press.
 *
 * NOTE: WebHeader and WebSidebar are rendered by the layout.
 *
 * Requirements: 5.1–5.11
 */

import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useWebTickets } from '../../hooks/useWebTickets'
import { WebTicketTable } from '../../src/components/web/WebTicketTable'
import { useAuth } from '../../src/contexts/AuthContext'
import type { Ticket } from '../../src/types'

export default function WebTicketsPage(): React.ReactElement {
  const { user } = useAuth()
  const router = useRouter()

  const {
    tickets,
    loading,
    error,
    refresh,
    filter,
    setFilter,
    search,
    setSearch,
    page,
    setPage,
    totalPages,
  } = useWebTickets(user?.role ?? 'customer')

  const handleRowPress = (ticket: Ticket) => {
    router.push(`/(web)/tickets/${ticket.id}` as any)
  }

  return (
    <View style={styles.page}>
      {/* Header with New Ticket button */}
      <View style={styles.header}>
        <Text style={styles.title}>Tickets</Text>
        <Pressable
          onPress={() => router.push('/(web)/create-ticket' as any)}
          style={({ pressed }) => [styles.newTicketBtn, pressed && styles.newTicketBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Create new ticket"
        >
          <Feather name="plus" size={15} color="#fff" />
          <Text style={styles.newTicketBtnText}>New Ticket</Text>
        </Pressable>
      </View>

      {/* Inline error banner */}
      {error && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={refresh}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading tickets"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <WebTicketTable
        tickets={tickets}
        loading={loading}
        onRowPress={handleRowPress}
        onStatusFilter={setFilter}
        onSearch={setSearch}
        currentFilter={filter}
        searchQuery={search}
        totalPages={totalPages}
        currentPage={page}
        onPageChange={setPage}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    flex: 1,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  newTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    boxShadow: '0 3px 8px rgba(16,185,129,0.25)' as any,
  },
  newTicketBtnPressed: {
    opacity: 0.8,
  },
  newTicketBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
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
