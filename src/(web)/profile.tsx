/**
 * Web Portal Profile Page — two-column layout.
 * Left: avatar identity card.  Right: detail fields grid.
 */

import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { userService } from '../../src/services/api'
import type { User } from '../../src/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatRole(role?: string | null): string {
  if (!role) return '—'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  } catch { return iso }
}

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin:    { bg: '#FEE2E2', text: '#991B1B' },
  manager:  { bg: '#DBEAFE', text: '#1E40AF' },
  employee: { bg: '#EDE9FE', text: '#5B21B6' },
  customer: { bg: '#D1FAE5', text: '#065F46' },
}

// ---------------------------------------------------------------------------
// DetailField sub-component
// ---------------------------------------------------------------------------

function DetailField({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <View style={fieldStyles.wrap}>
      <View style={fieldStyles.iconBox}>
        <Feather name={icon} size={14} color="#64748B" />
      </View>
      <View style={fieldStyles.text}>
        <Text style={fieldStyles.label}>{label}</Text>
        <Text style={[fieldStyles.value, accent && fieldStyles.valueAccent]}>{value}</Text>
      </View>
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  valueAccent: {
    color: '#10B981',
  },
})

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WebProfilePage(): React.ReactElement {
  const router = useRouter()
  const [profile, setProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await userService.getProfile()
        if (!cancelled) {
          setProfile(resp.data)
          setEditForm({
            name: resp.data.name,
            phone: resp.data.phone ?? '',
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          })
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.message ?? err?.message ?? 'Failed to load profile.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleSave = async () => {
    setFormError(null)
    if (!profile) return

    // Basic validation
    if (!editForm.name.trim()) {
      setFormError('Name is required.')
      return
    }
    if (editForm.newPassword && editForm.newPassword.length < 6) {
      setFormError('New password must be at least 6 characters.')
      return
    }
    if (editForm.newPassword && editForm.newPassword !== editForm.confirmPassword) {
      setFormError('New password and confirmation do not match.')
      return
    }
    if (editForm.newPassword && !editForm.currentPassword) {
      setFormError('Current password is required to set a new password.')
      return
    }

    setSubmitting(true)
    try {
      // Update profile fields
      await userService.updateProfile({
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || undefined,
      })

      // Update password if provided
      if (editForm.newPassword) {
        await userService.updatePassword(editForm.currentPassword, editForm.newPassword)
      }

      // Refresh profile data
      const resp = await userService.getProfile()
      setProfile(resp.data)
      setEditForm({
        name: resp.data.name,
        phone: resp.data.phone ?? '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setIsEditing(false)
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? err?.message ?? 'Failed to update profile.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (profile) {
      setEditForm({
        name: profile.name,
        phone: profile.phone ?? '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    }
    setFormError(null)
    setIsEditing(false)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <View style={styles.errorCard}>
          <Feather name="alert-circle" size={18} color="#991B1B" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => router.replace('/(web)/profile' as any)}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (!profile) return <View />

  const p = profile as any
  const roleColors = ROLE_COLORS[profile.role] ?? ROLE_COLORS.customer

  return (
    <View style={styles.page}>

      {/* ── Left: identity card ── */}
      <View style={styles.leftCol}>
        <View style={styles.identityCard}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
            </View>
            <View style={[styles.rolePill, { backgroundColor: roleColors.bg }]} >
              <Text style={[styles.rolePillText, { color: roleColors.text }]} >
                {formatRole(profile.role)}
              </Text>
            </View>
          </View>

          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.email}>{profile.email}</Text>

          <View style={styles.divider} />

          {/* Quick stats */}
          <View style={styles.quickStats}>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>Active</Text>
              <Text style={styles.quickStatLabel}>Status</Text>
            </View>
            {p.branch_name && (
              <>
                <View style={styles.quickStatDivider} />
                <View style={styles.quickStat}>
                  <Text style={styles.quickStatValue} numberOfLines={1}>{p.branch_name}</Text>
                  <Text style={styles.quickStatLabel}>Branch</Text>
                </View>
              </>
            )}
          </View>

          {/* Edit button */}
          <Pressable
            onPress={() => setIsEditing(true)}
            style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <Feather name="edit-2" size={14} color="#FFFFFF" />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Right: detail fields ── */}
      <View style={styles.rightCol}>
        <View style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Account Details</Text>
            <Text style={styles.cardSub}>
              {isEditing ? 'Edit your information below' : 'Your personal and account information'}
            </Text>
          </View>

          {/* Form error banner */}
          {formError && (
            <View style={styles.formErrorBanner}>
              <Feather name="alert-circle" size={15} color="#991B1B" />
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          <View style={styles.fieldsWrap}>
            {isEditing ? (
              // Editable fields
              <>
                <View style={styles.editField}>
                  <Text style={styles.editLabel}>Full Name</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editForm.name}
                    onChangeText={(v) => setEditForm((p) => ({ ...p, name: v }))}
                    placeholder="Enter your full name"
                    placeholderTextColor="#CBD5E1"
                  />
                </View>

                <View style={styles.editField}>
                  <Text style={styles.editLabel}>Email Address</Text>
                  <TextInput
                    style={[styles.editInput, styles.editInputDisabled]}
                    value={profile?.email}
                    editable={false}
                  />
                </View>

                <View style={styles.editField}>
                  <Text style={styles.editLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editForm.phone}
                    onChangeText={(v) => setEditForm((p) => ({ ...p, phone: v }))}
                    placeholder="Enter your phone number"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.editField}>
                  <Text style={styles.editLabel}>Role</Text>
                  <TextInput
                    style={[styles.editInput, styles.editInputDisabled]}
                    value={formatRole(profile?.role)}
                    editable={false}
                  />
                </View>

                {/* Password section */}
                <View style={styles.passwordSection}>
                  <Text style={styles.sectionHeading}>Change Password</Text>
                  <Text style={styles.sectionSub}>Optional: leave blank to keep current password</Text>

                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>Current Password</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editForm.currentPassword}
                      onChangeText={(v) => setEditForm((p) => ({ ...p, currentPassword: v }))}
                      placeholder="Enter current password"
                      placeholderTextColor="#CBD5E1"
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>New Password</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editForm.newPassword}
                      onChangeText={(v) => setEditForm((p) => ({ ...p, newPassword: v }))}
                      placeholder="Enter new password (min 6 chars)"
                      placeholderTextColor="#CBD5E1"
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>Confirm New Password</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editForm.confirmPassword}
                      onChangeText={(v) => setEditForm((p) => ({ ...p, confirmPassword: v }))}
                      placeholder="Confirm new password"
                      placeholderTextColor="#CBD5E1"
                      secureTextEntry
                    />
                  </View>
                </View>
              </>
            ) : (
              // Read-only fields
              <>
                <DetailField icon="user" label="Full Name" value={profile.name} />
                <DetailField icon="mail" label="Email Address" value={profile.email} />
                <DetailField
                  icon="phone"
                  label="Phone Number"
                  value={profile.phone ?? '—'}
                />
                <DetailField
                  icon="shield"
                  label="Role"
                  value={formatRole(profile.role)}
                  accent
                />
                {p.branch_name && (
                  <DetailField icon="map-pin" label="Branch" value={p.branch_name} />
                )}
                {p.employee_id && (
                  <DetailField icon="hash" label="Employee ID" value={p.employee_id} />
                )}
                {profile.created_at && (
                  <DetailField
                    icon="calendar"
                    label="Member Since"
                    value={formatDate(profile.created_at)}
                  />
                )}
              </>
            )}
          </View>

          {/* Edit mode actions */}
          {isEditing && (
            <View style={styles.editActions}>
              <Pressable
                onPress={handleCancel}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  (pressed || submitting) && styles.cancelBtnDisabled,
                ]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleSave}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.saveBtn,
                  (pressed || submitting) && styles.saveBtnDisabled,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 20,
    maxWidth: 480,
    flexDirection: 'row',
    flexWrap: 'wrap',
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

  // ── Left column ──
  leftCol: {
    flexBasis: 280,
    width: '100%',
    maxWidth: 320,
    flexGrow: 1,
    flexShrink: 1,
  },
  identityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)' as any,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(29,78,216,0.25)' as any,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
  },
  rolePill: {
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    alignSelf: 'stretch',
    marginVertical: 20,
  },
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  quickStat: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  quickStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
  quickStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
  },

  // ── Right column ──
  rightCol: {
    flex: 1,
    minWidth: 280,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)' as any,
  },
  cardHeader: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 13,
    color: '#94A3B8',
  },
  fieldsWrap: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },

  // ── Edit mode ──
  editBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    marginTop: 20,
  },
  editBtnPressed: {
    opacity: 0.8,
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  formErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  formErrorText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '500',
  },

  editField: {
    gap: 6,
    marginBottom: 16,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  editInput: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0F172A',
    outlineStyle: 'none' as any,
  },
  editInputDisabled: {
    backgroundColor: '#F8FAFC',
    color: '#64748B',
  },

  passwordSection: {
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 20,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 16,
  },

  editActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnDisabled: {
    opacity: 0.5,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 140,
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
})
