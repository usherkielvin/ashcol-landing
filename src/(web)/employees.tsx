/**
 * Web Portal Employee Management Page — list all employees for managers/admins.
 * Features: search/filter, status badge, inline status toggle, view performance.
 */

import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { employeeService } from '../../src/services/api'
import type { Employee } from '../../src/types'
import { WebHeader } from '../../src/components/web/WebHeader'

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

export default function WebEmployeesPage(): React.ReactElement {
  const router = useRouter()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | Employee['availability_status']>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  const filtered = employees.filter((emp) => {
    const matchesSearch = !search || (
      emp.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      emp.designation.toLowerCase().includes(search.toLowerCase())
    )
    const matchesStatus = statusFilter === 'all' || emp.availability_status === statusFilter
    return matchesSearch && matchesStatus
  })

  const fetchEmployees = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await employeeService.getEmployees()
      setEmployees(res.data ?? [])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusToggle = async (emp: Employee) => {
    const nextStatus = emp.availability_status === 'available' ? 'off_duty' : 'available'
    setUpdating(emp.id)
    try {
      const res = await employeeService.updateEmployeeStatus(emp.id, nextStatus)
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? res.data : e)))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update status')
    } finally {
      setUpdating(null)
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  if (loading) {
    return (
      <>
        <WebHeader title="Employees" subtitle="Manage your team" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading employees…</Text>
        </View>
      </>
    )
  }

  if (error) {
    return (
      <>
        <WebHeader title="Employees" subtitle="Manage your team" />
        <View style={styles.center}>
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={18} color="#991B1B" />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={fetchEmployees} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      </>
    )
  }

  return (
    <>
      <WebHeader title="Employees" subtitle="Manage your team" />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Search & Filters */}
        <View style={styles.filtersCard}>
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, email, or designation…"
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <View style={styles.statusFilters}>
            {(['all', 'available', 'busy', 'off_duty'] as const).map((status) => (
              <Pressable
                key={status}
                onPress={() => setStatusFilter(status)}
                style={({ pressed }) => [
                  styles.filterChip,
                  statusFilter === status && styles.filterChipActive,
                  pressed && styles.filterChipPressed,
                ]}
              >
                <Text style={[
                  styles.filterChipText,
                  statusFilter === status && styles.filterChipTextActive,
                ]}>
                  {status === 'all' ? 'All' : formatAvailability(status)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Employee List */}
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Team Members ({filtered.length})</Text>
          </View>
          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>No employees match the current filters.</Text>
          ) : (
            filtered.map((emp) => (
              <View key={emp.id} style={styles.employeeRow}>
                <View style={styles.employeeAvatar}>
                  <Text style={styles.employeeAvatarText}>
                    {(emp.user_name ?? 'E').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.employeeInfo}>
                  <Text style={styles.employeeName}>{emp.user_name ?? 'Unknown'}</Text>
                  <Text style={styles.employeeEmail}>{emp.user_email ?? '—'}</Text>
                  <Text style={styles.employeeMeta}>
                    {emp.designation} • {emp.branch_name ?? 'Unassigned'}
                  </Text>
                  <View style={styles.statsRow}>
                    <Text style={styles.statText}>{emp.assigned_tickets} assigned</Text>
                    <Text style={styles.statText}>{emp.completed_tickets} completed</Text>
                    {emp.rating && <Text style={styles.statText}>★ {emp.rating.toFixed(1)}</Text>}
                  </View>
                </View>
                <View style={styles.employeeActions}>
                  <View style={[styles.statusBadge, { backgroundColor: getAvailabilityColor(emp.availability_status) }]}>
                    <Text style={styles.statusText}>{formatAvailability(emp.availability_status)}</Text>
                  </View>
                  <Pressable
                    onPress={() => handleStatusToggle(emp)}
                    disabled={updating === emp.id}
                    style={({ pressed }) => [
                      styles.statusToggle,
                      pressed && styles.statusTogglePressed,
                      updating === emp.id && styles.statusToggleDisabled,
                    ]}
                  >
                    {updating === emp.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.statusToggleText}>
                        {emp.availability_status === 'available' ? 'Set Off‑Duty' : 'Set Available'}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => router.push(`/(web)/employees/${emp.id}` as any)}
                    style={({ pressed }) => [styles.viewBtn, pressed && styles.viewBtnPressed]}
                  >
                    <Feather name="eye" size={14} color="#10B981" />
                    <Text style={styles.viewBtnText}>View</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
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
    gap: 10,
    padding: 20,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
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

  // Filters
  filtersCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    gap: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    outlineStyle: 'none' as any,
  },
  statusFilters: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
  },
  filterChipActive: {
    backgroundColor: '#10B981',
  },
  filterChipPressed: {
    opacity: 0.8,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // List
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  listHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 14,
    color: '#64748B',
  },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  employeeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  employeeAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  employeeInfo: {
    flex: 1,
    gap: 2,
  },
  employeeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  employeeEmail: {
    fontSize: 13,
    color: '#64748B',
  },
  employeeMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  statText: {
    fontSize: 12,
    color: '#64748B',
  },
  employeeActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  statusToggle: {
    backgroundColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  statusTogglePressed: {
    opacity: 0.8,
  },
  statusToggleDisabled: {
    opacity: 0.5,
  },
  statusToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  viewBtnPressed: {
    opacity: 0.8,
  },
  viewBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
})
