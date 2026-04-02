/**
 * Web Portal Ticket Detail Page
 *
 * Fetches a single ticket by ID; renders WebTicketDetailPanel with canEdit
 * based on role; shows "Ticket not found" on 404.
 *
 * NOTE: WebHeader and WebSidebar are rendered by the layout.
 *
 * Requirements: 6.1–6.6
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebTicketDetailPanel } from '../../../src/components/web/WebTicketDetailPanel'
import { useAuth } from '../../../src/contexts/AuthContext'
import { ticketService } from '../../../src/services/api'
import type { Ticket, TicketStatus } from '../../../src/types'

const POLL_INTERVAL_MS = 15000

export default function WebTicketDetailPage(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchTicket = useCallback(async (showLoader: boolean = true) => {
    if (!id) return
    if (showLoader) {
      setLoading(true)
      setError(null)
      setNotFound(false)
    }
    try {
      const res = await ticketService.getTicket(id)
      if (mountedRef.current) {
        setTicket(res.data)
        setError(null)
        setNotFound(false)
      }
    } catch (err: any) {
      if (!mountedRef.current) return
      const status = err?.response?.status
      if (status === 404) {
        setNotFound(true)
      } else {
        const msg =
          err?.response?.data?.message || err?.message || 'Failed to load ticket'
        setError(msg)
      }
    } finally {
      if (mountedRef.current && showLoader) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchTicket()
  }, [fetchTicket])

  useEffect(() => {
    const intervalId = setInterval(() => {
      void fetchTicket(false)
    }, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [fetchTicket])

  const handleStatusUpdate = async (status: TicketStatus) => {
    if (!ticket) return
    try {
      const res = await ticketService.updateTicket(ticket.id, { status })
      if (mountedRef.current) {
        setTicket(res.data)
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update status'
      setError(msg)
    }
  }

  const handleAssign = async (employeeId: string) => {
    if (!ticket) return
    try {
      const res = await ticketService.updateTicket(ticket.id, {
        assigned_to: employeeId,
        status: 'assigned',
      })
      if (mountedRef.current) {
        setTicket(res.data)
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to assign ticket'
      setError(msg)
    }
  }

  const handleRate = async (rating: number, feedback: string) => {
    if (!ticket) return
    const res = await ticketService.updateTicket(ticket.id, { rating, feedback })
    if (mountedRef.current) {
      setTicket(res.data)
    }
  }

  const isEmployee = user?.role === 'employee'
  const isAssignedEmployee = isEmployee && ticket?.assigned_to === user?.id
  const canEdit =
    user?.role === 'manager' || user?.role === 'admin' || isAssignedEmployee

  // --- Loading ---
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading ticket…</Text>
      </View>
    )
  }

  // --- Not found ---
  if (notFound) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundIcon}>🔍</Text>
        <Text style={styles.notFoundTitle}>Ticket not found</Text>
        <Text style={styles.notFoundSub}>
          The ticket you're looking for doesn't exist or has been removed.
        </Text>
        <Pressable
          onPress={() => router.push('/(web)/tickets' as any)}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back to tickets"
        >
          <Text style={styles.backBtnText}>← Back to Tickets</Text>
        </Pressable>
      </View>
    )
  }

  // --- Error ---
  if (error && !ticket) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => {
              void fetchTicket()
            }}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (!ticket) return <View />

  return (
    <View style={styles.page}>
      {/* Inline error banner (non-blocking) */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => setError(null)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
          >
            <Text style={styles.retryBtnText}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      <WebTicketDetailPanel
        ticket={ticket}
        onStatusUpdate={handleStatusUpdate}
        onAssign={handleAssign}
        canEdit={canEdit}
        isCustomer={user?.role === 'customer'}
        onRate={handleRate}
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
  centered: {
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
  notFoundIcon: {
    fontSize: 48,
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  notFoundSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
  },
  backBtn: {
    marginTop: 8,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  backBtnPressed: {
    opacity: 0.8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    paddingVertical: 24,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
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
