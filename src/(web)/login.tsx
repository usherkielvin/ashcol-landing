/**
 * Web Portal Login Page — split-screen layout.
 * Left: dark brand panel with feature highlights.
 * Right: clean credential form.
 */

import { Feather } from '@expo/vector-icons'
import * as AuthSession from 'expo-auth-session'
import { ResponseType } from 'expo-auth-session'
import * as Google from 'expo-auth-session/providers/google'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
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
    useWindowDimensions,
} from 'react-native'
import { useAuth } from '../../src/contexts/AuthContext'
import { validateEmail, validatePassword } from '../../src/utils/validation'

WebBrowser.maybeCompleteAuthSession()

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''
const redirectUri = AuthSession.makeRedirectUri()

// ---------------------------------------------------------------------------
// Feature bullets shown on the brand panel
// ---------------------------------------------------------------------------

const FEATURES = [
  { icon: 'check-circle' as const, text: 'Real-time ticket tracking' },
  { icon: 'check-circle' as const, text: 'Role-based access control' },
  { icon: 'check-circle' as const, text: 'Multi-branch management' },
  { icon: 'check-circle' as const, text: 'Instant service assignment' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebLoginPage(): React.ReactElement {
  const { login, googleLogin } = useAuth()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isWebMobile = width < 768

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [focused, setFocused] = useState<'email' | 'password' | null>(null)

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    androidClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    redirectUri,
    responseType: ResponseType.Token,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.opener) return

    let hash = window.location.hash
    if (!hash) {
      try {
        hash = window.sessionStorage.getItem('ashcol_google_login_hash') || ''
      } catch {
        hash = ''
      }
    }
    if (!hash) return

    const params = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash)
    const idToken = params.get('id_token') || ''
    const accessToken = params.get('access_token') || ''
    const state = params.get('state') || ''

    if ((!idToken && !accessToken) || !state) return

    window.history.replaceState({}, '', window.location.pathname)
    try {
      window.sessionStorage.removeItem('ashcol_google_login_hash')
    } catch {
      // ignore storage errors
    }

    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        await googleLogin({ id_token: idToken, access_token: accessToken || undefined })
        router.replace('/(web)/dashboard' as any)
      } catch (err: any) {
        const status = err?.response?.status
        const backendMsg =
          err?.response?.data?.message ||
          (typeof err?.response?.data === 'string' ? err.response.data : '')
        const msg = backendMsg || err?.message || 'Unable to sign in with Google.'
        const needsSignup = /sign up/i.test(msg)
        if (needsSignup) {
          router.push('/create-account' as any)
        } else {
          setError(status === 401 ? 'Google account not recognised. Please sign up first.' : msg)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [googleLogin, router])

  useEffect(() => {
    if (!response || response.type !== 'success') return
    const successRes = response as any
    const idToken =
      response.authentication?.idToken ??
      (typeof successRes.params?.id_token === 'string' ? successRes.params.id_token : '')
    const accessToken =
      response.authentication?.accessToken ??
      (typeof successRes.params?.access_token === 'string' ? successRes.params.access_token : '')
    if (!idToken && !accessToken) {
      setError('Google sign-in did not return a token. Please try again.')
      return
    }
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        await googleLogin({ id_token: idToken || '', access_token: accessToken || undefined })
        router.replace('/(web)/dashboard' as any)
      } catch (err: any) {
        const status = err?.response?.status
        const backendMsg =
          err?.response?.data?.message ||
          (typeof err?.response?.data === 'string' ? err.response.data : '')
        const msg = backendMsg || err?.message || 'Unable to sign in with Google.'
        const needsSignup = /sign up/i.test(msg)
        if (needsSignup) {
          router.push('/create-account' as any)
        } else {
          setError(status === 401 ? 'Google account not recognised. Please sign up first.' : msg)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [response])

  const handleContinueWithGoogle = async () => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      setError('Google sign-in is not configured.')
      return
    }
    try {
      setLoading(true)
      setError(null)
      await promptAsync()
    } catch {
      setError('Could not open Google sign-in.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    const trimmedEmail = email.trim()
    const emailResult = validateEmail(trimmedEmail)
    const passwordResult = validatePassword(password)
    const newErrors: { email?: string; password?: string } = {}

    if (!emailResult.valid) newErrors.email = emailResult.message
    if (!passwordResult.valid) newErrors.password = passwordResult.message

    setFieldErrors(newErrors)
    if (Object.keys(newErrors).length > 0) {
      return
    }

    setError(null)
    setLoading(true)
    try {
      await login({ email: trimmedEmail, password })
      router.replace('/(web)/dashboard' as any)
    } catch (err: any) {
      const status = err?.response?.status
      const backendMsg =
        err?.response?.data?.message ||
        (typeof err?.response?.data === 'string' ? err.response.data : '')
      const msg =
        backendMsg ||
        err?.message ||
        'Login failed. Please check your credentials.'
      const isInvalidCredentials =
        status === 401 ||
        /invalid credentials|invalid email|incorrect password|bad credentials/i.test(msg)
      setError(isInvalidCredentials ? 'Invalid email or password.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={[styles.page, isWebMobile && styles.pageMobile]}>

      {/* ── Left brand panel — hidden on mobile ── */}
      {!isWebMobile && (
        <View style={styles.brandPanel}>
          <View style={styles.brandContent}>
            {/* Logo */}
            <View style={styles.logoRow}>
              <Image
                source={require('../../assets/images/ash-oval-transparent.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.logoText}>Ashcol</Text>
            </View>

            <Text style={styles.heroTitle}>
              Service management{'\n'}made simple.
            </Text>
            <Text style={styles.heroSub}>
              A unified portal for customers, technicians, and operations teams to manage every service request end-to-end.
            </Text>

            <View style={styles.featureList}>
              {FEATURES.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Feather name={f.icon} size={15} color="#10B981" />
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Bottom tag */}
          <Text style={styles.brandTag}>Ashcol Service Hub © 2025</Text>
        </View>
      )}

      {/* ── Right form panel ── */}
      <ScrollView
        style={[styles.formPanel, isWebMobile && styles.formPanelMobile]}
        contentContainerStyle={[
          styles.formPanelContent,
          isWebMobile && styles.formPanelContentMobile,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.formCard, isWebMobile && styles.formCardMobile]}>
          <Text style={styles.formTitle}>Welcome back</Text>
          <Text style={styles.formSub}>Sign in to your account to continue.</Text>

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color="#991B1B" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email address</Text>
            <View style={[
              styles.inputWrapper,
              focused === 'email' && styles.inputWrapperFocused,
              error ? styles.inputWrapperError : null,
            ]}>
              <Feather name="mail" size={15} color={focused === 'email' ? '#10B981' : '#94A3B8'} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#CBD5E1"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={(t) => {
                  setEmail(t)
                  setError(null)
                  setFieldErrors((prev) => ({ ...prev, email: undefined }))
                }}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                editable={!loading}
                accessibilityLabel="Email address"
              />
            </View>
            {fieldErrors.email ? <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text> : null}
          </View>

          {/* Password field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={[
              styles.inputWrapper,
              focused === 'password' && styles.inputWrapperFocused,
              error ? styles.inputWrapperError : null,
            ]}>
              <Feather name="lock" size={15} color={focused === 'password' ? '#10B981' : '#94A3B8'} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#CBD5E1"
                secureTextEntry={!showPassword}
                textContentType="password"
                value={password}
                onChangeText={(t) => {
                  setPassword(t)
                  setError(null)
                  setFieldErrors((prev) => ({ ...prev, password: undefined }))
                }}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                editable={!loading}
                accessibilityLabel="Password"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={8}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={15} color="#94A3B8" />
              </Pressable>
            </View>
            {fieldErrors.password ? <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text> : null}
          </View>

          {/* Forgot password */}
          <Pressable
            onPress={() => router.push('/forgot-password' as any)}
            disabled={loading}
            style={styles.forgotBtn}
            accessibilityRole="link"
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          {/* Submit */}
          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => [
              styles.submitBtn,
              (loading || pressed) && styles.submitBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : (
                <View style={styles.submitBtnInner}>
                  <Text style={styles.submitBtnText}>Sign in</Text>
                  <Feather name="arrow-right" size={16} color="#fff" />
                </View>
              )
            }
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google sign-in */}
          <Pressable
            onPress={handleContinueWithGoogle}
            disabled={loading || !request}
            style={({ pressed }) => [
              styles.googleBtn,
              (loading || !request || pressed) && styles.googleBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <Image
              source={{ uri: 'https://www.google.com/favicon.ico' }}
              style={styles.googleIcon}
              resizeMode="contain"
            />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </Pressable>

          {/* Footer */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Pressable onPress={() => router.push('/create-account' as any)} disabled={loading}>
              <Text style={styles.footerLink}>Sign up</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
    minHeight: '100vh' as any,
  },
  pageMobile: {
    flexDirection: 'column',
  },

  // ── Brand panel ──
  brandPanel: {
    width: '50%' as any,
    backgroundColor: '#0B1120',
    paddingVertical: 48,
    paddingHorizontal: 40,
    flexDirection: 'column' as const,
    justifyContent: 'space-between' as const,
  },
  brandContent: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 48,
  },
  logoImage: {
    width: 42,
    height: 42,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F1F5F9',
    letterSpacing: 0.3,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#F8FAFC',
    lineHeight: 42,
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  heroSub: {
    fontSize: 15,
    color: '#94A3B8',
    lineHeight: 24,
    marginBottom: 40,
  },
  featureList: {
    gap: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  brandTag: {
    fontSize: 12,
    color: '#334155',
    marginTop: 32,
  },

  // ── Form panel ──
  formPanel: {
    width: '50%' as any,
    backgroundColor: '#F8FAFC',
  },
  formPanelMobile: {
    width: '100%' as any,
    minHeight: '100vh' as any,
  },
  formPanelContent: {
    flexGrow: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  formPanelContentMobile: {
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 32,
    width: '100%',
    maxWidth: 460,
    boxShadow: '0 4px 32px rgba(0,0,0,0.08)' as any,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formCardMobile: {
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    maxWidth: '100%' as any,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)' as any,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  formSub: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 28,
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 7,
    letterSpacing: 0.1,
  },
  fieldErrorText: {
    marginTop: 6,
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 13,
    backgroundColor: '#FAFBFC',
    gap: 10,
  },
  inputWrapperFocused: {
    borderColor: '#10B981',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 0 0 3px rgba(16,185,129,0.12)' as any,
  },
  inputWrapperError: {
    borderColor: '#EF4444',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    outlineStyle: 'none' as any,
  },
  submitBtn: {
    height: 50,
    backgroundColor: '#10B981',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    boxShadow: '0 4px 12px rgba(16,185,129,0.3)' as any,
  },
  submitBtnPressed: {
    opacity: 0.85,
  },
  submitBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Forgot password ──
  forgotBtn: {
    alignSelf: 'flex-end' as const,
    marginBottom: 16,
  },
  forgotText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },

  // ── Google button ──
  dividerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginTop: 20,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  googleBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)' as any,
  },
  googleBtnPressed: {
    opacity: 0.75,
  },
  googleIcon: {
    width: 18,
    height: 18,
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },

  // ── Footer ──
  footerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: '#64748B',
  },
  footerLink: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '700',
  },
})
