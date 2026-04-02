/**
 * Web Portal Branches Page — search toolbar + polished cards.
 * Access restricted to manager/admin roles.
 */

import { Feather } from '@expo/vector-icons'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { useAuth } from '../../src/contexts/AuthContext'
import { branchService } from '../../src/services/api'
import type { Branch } from '../../src/types'

// ---------------------------------------------------------------------------
// Card accent colours (cycles through branches)
// ---------------------------------------------------------------------------

const ACCENTS = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6']
const accentFor = (i: number) => ACCENTS[i % ACCENTS.length]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WebBranchesPage(): React.ReactElement {
  const { user } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const isAllowed = user?.role === 'manager' || user?.role === 'admin'

  const fetchBranches = useCallback(async () => {
    if (!isAllowed) return
    setLoading(true)
    setError(null)
    try {
      const res = await branchService.getBranches()
      if (mountedRef.current) setBranches(res.data ?? [])
    } catch (err: any) {
      if (mountedRef.current)
        setError(err?.response?.data?.message || err?.message || 'Failed to load branches')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [isAllowed])

  useEffect(() => {
    if (isAllowed) fetchBranches()
    else setLoading(false)
  }, [fetchBranches, isAllowed])

  const filtered = useMemo(() => {
    let list = branches
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.location?.toLowerCase().includes(q) ||
          b.address?.toLowerCase().includes(q)
      )
    }
    if (filterActive !== null) {
      list = list.filter((b) => b.is_active === filterActive)
    }
    return list
  }, [branches, search, filterActive])

  // --- Access denied ---
  if (!isAllowed) {
    return (
      <View style={styles.centered}>
        <View style={styles.deniedIcon}>
          <Feather name="lock" size={32} color="#64748B" />
        </View>
        <Text style={styles.deniedTitle}>Access Denied</Text>
        <Text style={styles.deniedSub}>You don't have permission to view this page.</Text>
      </View>
    )
  }

  // --- Loading ---
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading branches…</Text>
      </View>
    )
  }

  // --- Error ---
  if (error) {
    return (
      <View style={styles.centered}>
        <View style={styles.errorCard}>
          <Feather name="alert-circle" size={18} color="#991B1B" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={fetchBranches}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.page}>

      {/* ── Toolbar ── */}
      <View style={styles.toolbar}>
        {/* Search */}
        <View style={styles.searchBox}>
          <Feather name="search" size={15} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search branches…"
            placeholderTextColor="#CBD5E1"
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search branches"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <Feather name="x" size={14} color="#94A3B8" />
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.chips}>
          {([
            { label: 'All',      value: null },
            { label: 'Active',   value: true },
            { label: 'Inactive', value: false },
          ] as const).map((chip) => (
            <Pressable
              key={String(chip.label)}
              onPress={() => setFilterActive(chip.value)}
              style={[styles.chip, filterActive === chip.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, filterActive === chip.value && styles.chipTextActive]}>
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Count */}
        <Text style={styles.countLabel}>
          {filtered.length} branch{filtered.length !== 1 ? 'es' : ''}
        </Text>
      </View>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}>
            <Feather name="map-pin" size={32} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>No branches found</Text>
          <Text style={styles.emptySub}>Try adjusting your search or filter.</Text>
        </View>
      )}

      {/* ── Cards grid ── */}
      <View style={styles.grid}>
        {filtered.map((branch, idx) => (
          <BranchCard key={branch.id} branch={branch} accent={accentFor(idx)} />
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// BranchCard
// ---------------------------------------------------------------------------

function BranchCard({ branch, accent }: { branch: Branch; accent: string }): React.ReactElement {
  return (
    <View style={cardStyles.card}>
      {/* Colored top accent */}
      <View style={[cardStyles.accentBar, { backgroundColor: accent }]} />

      <View style={cardStyles.body}>
        {/* Header row */}
        <View style={cardStyles.header}>
          <View style={[cardStyles.iconBadge, { backgroundColor: accent + '18' }]}>
            <Feather name="map-pin" size={18} color={accent} />
          </View>
          <View style={cardStyles.headerText}>
            <Text style={cardStyles.name}>{branch.name}</Text>
            <Text style={cardStyles.location} numberOfLines={1}>{branch.location}</Text>
          </View>
          <View style={[cardStyles.statusBadge, branch.is_active ? cardStyles.active : cardStyles.inactive]}>
            <View style={[cardStyles.statusDot, branch.is_active ? cardStyles.dotActive : cardStyles.dotInactive]} />
            <Text style={[cardStyles.statusText, branch.is_active ? cardStyles.activeText : cardStyles.inactiveText]}>
              {branch.is_active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Detail rows */}
        <View style={cardStyles.details}>
          <InfoRow feather="home" label="Address" value={branch.address} />
          <InfoRow feather="phone" label="Phone" value={branch.phone} />
          <InfoRow feather="mail" label="Email" value={branch.email} />
          {(branch as any).manager_name && (
            <InfoRow feather="user" label="Manager" value={(branch as any).manager_name} />
          )}
        </View>

        {/* Stats footer */}
        <View style={cardStyles.footer}>
          <StatPill
            icon="users"
            label="Employees"
            value={(branch as any).employee_count ?? 0}
            color={accent}
          />
          <StatPill
            icon="tag"
            label="Active Tickets"
            value={(branch as any).active_tickets ?? 0}
            color={accent}
          />
        </View>
      </View>
    </View>
  )
}

function InfoRow({
  feather,
  label,
  value,
}: {
  feather: React.ComponentProps<typeof Feather>['name']
  label: string
  value: string
}) {
  if (!value) return null
  return (
    <View style={cardStyles.infoRow}>
      <Feather name={feather} size={13} color="#94A3B8" />
      <Text style={cardStyles.infoLabel}>{label}</Text>
      <Text style={cardStyles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  )
}

function StatPill({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  label: string
  value: number
  color: string
}) {
  return (
    <View style={[cardStyles.statPill, { backgroundColor: color + '12' }]}>
      <Feather name={icon} size={13} color={color} />
      <Text style={[cardStyles.statValue, { color }]}>{value}</Text>
      <Text style={cardStyles.statLabel}>{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    flex: 1,
    gap: 20,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    flex: 1,
    minWidth: 200,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)' as any,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    outlineStyle: 'none' as any,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  countLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
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
  deniedIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deniedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  deniedSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 14,
    color: '#94A3B8',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 20,
    maxWidth: 480,
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
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
})

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    boxShadow: '0 1px 6px rgba(0,0,0,0.07)' as any,
    minWidth: 300,
    flex: 1,
    maxWidth: 500,
  },
  accentBar: {
    height: 3,
  },
  body: {
    padding: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 22,
  },
  location: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  active: { backgroundColor: '#DCFCE7' },
  inactive: { backgroundColor: '#FEE2E2' },
  dotActive: { backgroundColor: '#16A34A' },
  dotInactive: { backgroundColor: '#DC2626' },
  statusText: { fontSize: 12, fontWeight: '600' },
  activeText: { color: '#15803D' },
  inactiveText: { color: '#DC2626' },
  details: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
    width: 64,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    flex: 1,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
  },
})
