/**
 * Web Forgot Password Page — lightweight reset request form.
 */

import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import logoImg from '../../assets/ash-logo.jpg'
import splitBgImg from '../../assets/split_screen_bg.png'
import { validateEmail } from '../../src/utils/validation'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8080/api'
const RESET_ENDPOINTS = [
  '/auth/forgot-password',
  '/auth/request-password-reset',
  '/auth/reset-password-request',
  '/auth/send-password-reset-link',
]

async function postResetRequest(email: string): Promise<string | null> {
  let lastMessage = 'Unable to start password reset.'

  for (const endpoint of RESET_ENDPOINTS) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const payload = await response.json().catch(() => ({}))
      if (response.ok) return null

      lastMessage = payload?.message || lastMessage

      if (response.status === 404) {
        continue
      }

      return lastMessage
    } catch (error: any) {
      lastMessage = error?.message || lastMessage
    }
  }

  return lastMessage
}

export default function ForgotPasswordPage(): React.ReactElement {
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (typeof params.email === 'string' && params.email.trim().length > 0) {
      setEmail(params.email)
    }
  }, [params.email])

  const handleSubmit = async () => {
    const normalizedEmail = email.trim()
    const validation = validateEmail(normalizedEmail)
    if (!validation.valid) {
      setError(validation.message || 'Enter a valid email address.')
      setSuccess(null)
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    const result = await postResetRequest(normalizedEmail)
    if (result === null) {
      setSuccess('If the email exists, password reset instructions will be sent shortly.')
    } else {
      setError(result)
    }

    setLoading(false)
  }

  return (
    <View style={styles.page}>
      <View style={styles.brandPanel}>
        <View style={styles.brandOverlay} />
        <Image source={splitBgImg} style={styles.brandImage} resizeMode="cover" />
        <View style={styles.brandContent}>
          <Image source={logoImg} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brandTitle}>Reset access</Text>
          <Text style={styles.brandSub}>We’ll help you get back into your Ashcol account securely.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.formWrap} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>Forgot password?</Text>
          <Text style={styles.subtitle}>Enter your email address and we’ll send reset instructions.</Text>

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              setError(null)
              setSuccess(null)
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="juan@example.com"
            placeholderTextColor="#64748b"
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          <Pressable onPress={handleSubmit} disabled={loading} style={({ pressed }) => [styles.button, (loading || pressed) && styles.buttonPressed]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset link</Text>}
          </Pressable>

          <Pressable onPress={() => router.push('/login' as any)} style={styles.backLink}>
            <Feather name="arrow-left" size={14} color="#10B981" />
            <Text style={styles.backLinkText}>Back to login</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', backgroundColor: '#060B18' },
  brandPanel: { flex: 1, minWidth: 320, position: 'relative', overflow: 'hidden', justifyContent: 'flex-end' },
  brandImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  brandOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,11,24,0.72)' },
  brandContent: { padding: 48, gap: 10 },
  logo: { width: 72, height: 72, marginBottom: 10 },
  brandTitle: { color: '#F0F6FF', fontSize: 34, fontWeight: '800' },
  brandSub: { color: '#A2B7D0', fontSize: 16, lineHeight: 24, maxWidth: 420 },
  formWrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: 'rgba(10,17,32,0.88)', borderWidth: 1, borderColor: '#1E2D48', borderRadius: 24, padding: 24 },
  title: { color: '#F0F6FF', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#7A95B8', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  label: { color: '#A2B7D0', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: '#0F1A2E', borderWidth: 1, borderColor: '#243452', borderRadius: 14, color: '#F0F6FF', paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, marginBottom: 16 },
  error: { color: '#FCA5A5', backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.18)', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  success: { color: '#A7F3D0', backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.18)', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 18 },
  backLinkText: { color: '#10B981', fontSize: 14, fontWeight: '700' },
})