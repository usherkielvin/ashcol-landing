/**
 * Web Portal Create Ticket Page
 *
 * Clean form for submitting a new service request.
 * Redirects to /(web)/tickets on success.
 */

import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useAuth } from '../../src/contexts/AuthContext'
import { ticketService } from '../../src/services/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICE_TYPES = ['Cleaning', 'Maintenance', 'Repair', 'Installation'] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebCreateTicketPage(): React.ReactElement {
  const router = useRouter()
  const { user } = useAuth()

  const [serviceType, setServiceType] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '')
  const [preferredDate, setPreferredDate] = useState('')

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!serviceType) next.serviceType = 'Please select a service type.'
    if (!description.trim()) next.description = 'Description is required.'
    if (description.trim().length < 10) next.description = 'Please describe the issue in more detail (at least 10 characters).'
    if (!address.trim()) next.address = 'Service address is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    setSubmitError(null)
    try {
      await ticketService.createTicket({
        title: `${serviceType} service`,
        description: description.trim(),
        service_type: serviceType,
        location: address.trim(),
        contact_phone: contactPhone.trim() || undefined,
        preferred_date: preferredDate || undefined,
      })
      router.replace('/(web)/tickets' as any)
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to submit ticket. Please try again.'
      setSubmitError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* ── Service Type ── */}
      <View style={styles.section}>
        <Text style={styles.label}>Service Type <Text style={styles.required}>*</Text></Text>
        <View style={styles.chipRow}>
          {SERVICE_TYPES.map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                setServiceType(s)
                if (errors.serviceType) setErrors((p) => ({ ...p, serviceType: '' }))
              }}
              style={[styles.chip, serviceType === s && styles.chipActive]}
            >
              <Text style={[styles.chipText, serviceType === s && styles.chipTextActive]}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
        {errors.serviceType ? <Text style={styles.errorText}>{errors.serviceType}</Text> : null}
      </View>

      {/* ── Description ── */}
      <View style={styles.section}>
        <Text style={styles.label}>Description <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.textarea, errors.description ? styles.inputError : null]}
          placeholder="Describe the issue or service needed…"
          placeholderTextColor="#CBD5E1"
          value={description}
          onChangeText={(v) => {
            setDescription(v)
            if (errors.description) setErrors((p) => ({ ...p, description: '' }))
          }}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        {errors.description ? <Text style={styles.errorText}>{errors.description}</Text> : null}
      </View>

      {/* ── Service Address ── */}
      <View style={styles.section}>
        <Text style={styles.label}>Service Address <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, errors.address ? styles.inputError : null]}
          placeholder="Full address where service is needed"
          placeholderTextColor="#CBD5E1"
          value={address}
          onChangeText={(v) => {
            setAddress(v)
            if (errors.address) setErrors((p) => ({ ...p, address: '' }))
          }}
        />
        {errors.address ? <Text style={styles.errorText}>{errors.address}</Text> : null}
      </View>

      {/* ── Optional fields row ── */}
      <View style={styles.optionalRow}>
        {/* Contact Phone */}
        <View style={[styles.section, styles.halfField]}>
          <Text style={styles.label}>Contact Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 09123456789"
            placeholderTextColor="#CBD5E1"
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Preferred Date */}
        <View style={[styles.section, styles.halfField]}>
          <Text style={styles.label}>Preferred Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#CBD5E1"
            value={preferredDate}
            onChangeText={setPreferredDate}
          />
        </View>
      </View>

      {/* ── Submit error ── */}
      {submitError ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={15} color="#991B1B" />
          <Text style={styles.errorBannerText}>{submitError}</Text>
        </View>
      ) : null}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => [styles.submitBtn, (pressed || loading) && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="send" size={15} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>Submit Ticket</Text>
            </>
          )}
        </Pressable>
      </View>

    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    maxWidth: 680,
    gap: 4,
    paddingBottom: 40,
  },

  section: {
    gap: 8,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.2,
  },
  required: {
    color: '#EF4444',
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  chipTextActive: {
    color: '#059669',
  },

  input: {
    height: 46,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0F172A',
    outlineStyle: 'none' as any,
  },
  textarea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 120,
    outlineStyle: 'none' as any,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 2,
  },

  optionalRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  halfField: {
    flex: 1,
    minWidth: 200,
  },

  errorBanner: {
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
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '500',
  },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#10B981',
    boxShadow: '0 3px 8px rgba(16,185,129,0.25)' as any,
    minWidth: 140,
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
