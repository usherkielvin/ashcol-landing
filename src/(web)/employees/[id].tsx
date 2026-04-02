/**
 * Web Portal Employee Detail Page — shows details for a single employee.
 * Placeholder for now; can be expanded with performance charts, tickets, etc.
 */

import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WebHeader } from '../../../src/components/web/WebHeader'
import { employeeService } from '../../../src/services/api'
import type { Employee } from '../../../src/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAvailability(status: Employee['availability_status']): string {
  switch (status) {
    case 'available': return 'Available'
    case 'busy': return 'Busy'
    case 'off_duty': return 'Off Duty'
    default: return status
  }
}

function getAvailabilityColor(status: Employee['availability_status']): string {
  switch (status) {
    case 'available': return '#10B981'
    case 'busy': return '#F59E0B'
    case 'off_duty': return '#6B7280'
    default: return '#6B7280'
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebEmployeeDetailPage(): React.ReactElement {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEmployee = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await employeeService.getEmployee(id)
      setEmployee(res.data)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load employee')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmployee()
  }, [id])

  if (loading) {
    return (
      <>
        <WebHeader title="Employee Details" subtitle="Loading…" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading employee details…</Text>
        </View>
      </>
    )
  }

  if (error || !employee) {
    return (
      <>
        <WebHeader title="Employee Details" subtitle="Error" />
        <View style={styles.center}>
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={18} color="#991B1B" />
            <Text style={styles.errorText}>{error ?? 'Employee not found'}</Text>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}>
              <Text style={styles.retryBtnText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </>
    )
  }

  const statusColor = getAvailabilityColor(employee.availability_status)

  return (
    <>
      <WebHeader title="Employee Details" subtitle={employee.user_name ?? 'Unknown'} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Avatar & Name */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: '#1D4ED8' }]}>
              <Text style={styles.avatarText}>
                {(employee.user_name ?? 'E').slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.nameInfo}>
              <Text style={styles.name}>{employee.user_name ?? 'Unknown'}</Text>
              <Text style={styles.email}>{employee.user_email ?? '—'}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                <Text style={styles.statusText}>{formatAvailability(employee.availability_status)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Details */}
        <View style={styles.card}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Information</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Designation</Text>
              <Text style={styles.detailValue}>{employee.designation}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Branch</Text>
              <Text style={styles.detailValue}>{employee.branch_name ?? 'Unassigned'}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Assigned Tickets</Text>
              <Text style={styles.detailValue}>{employee.assigned_tickets}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Completed Tickets</Text>
              <Text style={styles.detailValue}>{employee.completed_tickets}</Text>
            </View>
            {employee.rating && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Average Rating</Text>
                <Text style={styles.detailValue}>★ {employee.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>System</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Employee ID</Text>
              <Text style={styles.detailValue}>{employee.id}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>User ID</Text>
              <Text style={styles.detailValue}>{employee.user_id}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Active</Text>
              <Text style={styles.detailValue}>{employee.is_active ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Joined</Text>
              <Text style={styles.detailValue}>{new Date(employee.created_at).toLocaleDateString()}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.card}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
            <Feather name="arrow-left" size={16} color="#FFFFFF" />
            <Text style={styles.backBtnText}>Back to Employees</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 20,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
  },
  errorCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    padding: 20,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    maxWidth: 520,
  },
  errorText: {
    fontSize: 14,
    color: '#991B1B',
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: '#DC2626',
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    gap: 20,
  },
  avatarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  nameInfo: {
    flex: 1,
    gap: 6,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  email: {
    fontSize: 14,
    color: '#64748B',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },

  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'right',
  },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  backBtnPressed: {
    opacity: 0.8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
})
