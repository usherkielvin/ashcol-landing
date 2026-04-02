/**
 * Web Portal Activity Page
 *
 * Fetches recent activity for the current user. Uses the dashboard recent-activity
 * endpoint if available, otherwise falls back to the user's recent tickets.
 *
 * NOTE: WebHeader and WebSidebar are rendered by the layout.
 *
 * Requirements: 9.1–9.3
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../src/contexts/AuthContext'
import { dashboardService, ticketService } from '../../src/services/api'
import type { Ticket } from '../../src/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityItem {
  id: string
  title: string
  description: string
  timestamp: string
  type: 'ticket_created' | 'ticket_updated' | 'general'
  status?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ticketToActivity(ticket: Ticket): ActivityItem {
  return {
    id: ticket.id,
    title: ticket.title,
    description: `Status: ${ticket.status.replace('_', ' ')}`,
    timestamp: ticket.updated_at || ticket.created_at,
    type: 'ticket_created',
    status: ticket.status,
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:     { bg: '#FEF3C7', text: '#92400E' },
  assigned:    { bg: '#DBEAFE', text: '#1E40AF' },
  in_progress: { bg: '#EDE9FE', text: '#5B21B6' },
  completed:   { bg: '#D1FAE5', text: '#065F46' },
  cancelled:   { bg: '#FEE2E2', text: '#991B1B' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebActivityPage(): React.ReactElement {
  const { user } = useAuth()

  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Try the dashboard recent-activity endpoint first
      let activityItems: ActivityItem[] = []
      try {
        const res = await dashboardService.getRecentActivity(20)
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          activityItems = res.data.map((item: any, idx: number) => ({
            id: item.id ?? String(idx),
            title: item.title ?? item.message ?? 'Activity',
            description: item.description ?? item.message ?? '',
            timestamp: item.created_at ?? item.timestamp ?? new Date().toISOString(),
            type: item.type ?? 'general',
            status: item.status,
          }))
        }
      } catch {
        // Fall back to recent tickets
      }

      // Fallback: use recent tickets as activity feed (role-aware)
      if (activityItems.length === 0) {
        const role = user?.role
        const ticketsRes =
          role === 'manager' || role === 'admin'
            ? await ticketService.getAllTickets(undefined, 0, 20)
            : role === 'employee'
              ? await ticketService.getAssignedTickets(0, 20)
              : await ticketService.getMyTickets(0, 20)
        const tickets: Ticket[] = ticketsRes.data?.tickets ?? []
        activityItems = tickets.map(ticketToActivity)
      }

      if (mountedRef.current) {
        setItems(activityItems)
      }
    } catch (err: any) {
      if (mountedRef.current) {
        const msg =
          err?.response?.data?.message || err?.message || 'Failed to load activity'
        setError(msg)
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  // --- Loading ---
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading activity…</Text>
      </View>
    )
  }

  // --- Error ---
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={fetchActivity}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading activity"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // --- Empty ---
  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>🕐</Text>
        <Text style={styles.emptyTitle}>No activity yet</Text>
        <Text style={styles.emptySub}>Your recent activity will appear here.</Text>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <View style={styles.feed}>
        {items.map((item, idx) => {
          const statusColors = item.status ? STATUS_COLORS[item.status] : null
          return (
            <View key={item.id} style={styles.item}>
              {/* Timeline dot */}
              <View style={styles.timelineCol}>
                <View style={styles.dot} />
                {idx < items.length - 1 && <View style={styles.line} />}
              </View>

              {/* Content */}
              <View style={styles.itemContent}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                  {statusColors && (
                    <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                      <Text style={[styles.statusText, { color: statusColors.text }]}>
                        {item.status!.replace('_', ' ')}
                      </Text>
                    </View>
                  )}
                </View>
                {item.description ? (
                  <Text style={styles.itemDesc}>{item.description}</Text>
                ) : null}
                <Text style={styles.itemTime}>{formatTimestamp(item.timestamp)}</Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BORDER = '#E2E8F0'
const TEXT_PRIMARY = '#0F172A'
const TEXT_SECONDARY = '#64748B'
const ACCENT = '#10B981'

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  feed: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 0,
  },
  item: {
    flexDirection: 'row',
    gap: 16,
    minHeight: 60,
  },
  timelineCol: {
    alignItems: 'center',
    width: 16,
    flexShrink: 0,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ACCENT,
    marginTop: 4,
    flexShrink: 0,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: BORDER,
    marginTop: 4,
    marginBottom: 0,
  },
  itemContent: {
    flex: 1,
    paddingBottom: 20,
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    flex: 1,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  itemDesc: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
  itemTime: {
    fontSize: 12,
    color: TEXT_SECONDARY,
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
    color: TEXT_SECONDARY,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: TEXT_PRIMARY },
  emptySub: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center' },
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
  retryBtnPressed: { opacity: 0.8 },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
})
